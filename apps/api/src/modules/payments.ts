import { Types } from 'mongoose';
import { env } from '../config/env';
import { storeConfig } from '../config/store';
import { AppError } from '../lib/errors';
import { randomId, sha256 } from '../lib/crypto';
import { logger } from '../lib/logger';
import { Order, PaymentAttempt, PaymentCase, WebhookEvent } from '../models';
import { allocateReservation, releaseReservation } from './inventory';
import { recordOrderTransition } from './analytics';
import { writeAudit } from './audit';
import {
  GatewayTimeoutError,
  type GatewayStatus,
  type PaymentGateway,
  paymentGateway,
} from './paymentGateway';
import { validatePaymentRedirect } from '../middleware/auth';

type Source = 'webhook' | 'job' | 'admin' | 'simulation';
type Outcome = 'paid' | 'pending' | 'review' | 'closed' | 'refunded' | 'ignored' | 'duplicate';

function caseNumber(): string {
  const now = new Date();
  const date = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `CS-${date}-${randomId(4).toUpperCase()}`;
}

function isClosedStatus(status: GatewayStatus['status']): status is 'deny' | 'cancel' | 'expire' | 'failure' {
  return ['deny', 'cancel', 'expire', 'failure'].includes(status);
}

function closedPaymentStatus(status: GatewayStatus['status']): 'failed' | 'expired' | 'cancelled' {
  if (status === 'expire') return 'expired';
  if (status === 'cancel') return 'cancelled';
  return 'failed';
}

function attemptStatusForClosed(status: GatewayStatus['status']): 'failed' | 'expired' | 'cancelled' {
  if (status === 'expire') return 'expired';
  if (status === 'cancel') return 'cancelled';
  return 'failed';
}

function cardEnabled(): boolean {
  return env.CARD_PAYMENT_ENABLED;
}

async function createOrReuseCase(input: {
  orderId: Types.ObjectId;
  type: 'amount_mismatch' | 'late_payment' | 'gateway_conflict' | 'uncertain_payment' | 'refund' | 'chargeback' | 'stock_issue' | 'shipping_issue';
  reason: string;
  priority?: 'normal' | 'high';
  session: import('mongoose').ClientSession;
  actorId?: string;
  holdReason?: string;
}): Promise<InstanceType<typeof PaymentCase>> {
  const existing = await PaymentCase.findOne({
    orderId: input.orderId,
    type: input.type,
    status: { $in: ['open', 'in_progress'] },
  }).session(input.session);
  if (existing) return existing;
  const [created] = await PaymentCase.create(
    [
      {
        caseNumber: caseNumber(),
        orderId: input.orderId,
        type: input.type,
        reason: input.reason,
        priority: input.priority ?? 'normal',
        history: [
          {
            at: new Date(),
            actorId: input.actorId,
            action: 'created',
            note: input.reason,
          },
        ],
      },
    ],
    { session: input.session },
  );
  if (!created) throw new AppError(500, 'CASE_FAILED', 'Kasus pembayaran gagal dibuat.');
  if (input.holdReason) {
    await Order.updateOne(
      { _id: input.orderId },
      {
        $set: { 'shippingHold.active': true, 'shippingHold.reason': input.holdReason, 'shippingHold.caseId': created._id },
        $push: {
          statusHistory: {
            at: new Date(),
            type: 'hold',
            to: 'on_hold',
            actor: 'system',
            note: input.holdReason,
          },
        },
      },
      { session: input.session },
    );
  }
  return created;
}

async function markForReview(input: {
  order: InstanceType<typeof Order>;
  attempt: InstanceType<typeof PaymentAttempt>;
  type: 'amount_mismatch' | 'gateway_conflict' | 'uncertain_payment';
  reason: string;
  status: GatewayStatus;
  source: Source;
}): Promise<Outcome> {
  const session = await Order.startSession();
  let outcome: Outcome = 'review';
  try {
    await session.withTransaction(async () => {
      const currentOrder = await Order.findOne({ _id: input.order._id }, null, { session });
      const currentAttempt = await PaymentAttempt.findOne({ _id: input.attempt._id }, null, { session });
      if (!currentOrder || !currentAttempt) {
        outcome = 'ignored';
        return;
      }
      if (['refunded', 'partially_refunded', 'disputed'].includes(currentOrder.paymentStatus)) {
        outcome = 'ignored';
        return;
      }
      const paid = currentOrder.paymentStatus === 'paid';
      await PaymentAttempt.updateOne(
        { _id: currentAttempt._id },
        {
          $set: {
            status: 'review',
            open: true,
            gatewayStatus: input.status.rawStatus,
            gatewayTransactionId: input.status.transactionId ?? currentAttempt.gatewayTransactionId,
            fraudStatus: input.status.fraudStatus,
            paymentType: input.status.paymentType,
            lastCheckedAt: new Date(),
            failureReason: input.reason.slice(0, 300),
          },
        },
        { session },
      );
      if (!paid) {
        await Order.updateOne(
          { _id: currentOrder._id, paymentStatus: currentOrder.paymentStatus },
          {
            $set: { paymentStatus: 'review' },
            $push: {
              statusHistory: {
                at: new Date(),
                type: 'payment',
                from: currentOrder.paymentStatus,
                to: 'review',
                actor: 'system',
                note: input.reason,
              },
            },
          },
          { session },
        );
      }
      await createOrReuseCase({
        orderId: currentOrder._id as Types.ObjectId,
        type: input.type,
        reason: input.reason,
        priority: 'high',
        holdReason: 'Pembayaran perlu ditinjau sebelum pengiriman.',
        session,
      });
      await writeAudit({
        action: 'payment.review',
        targetType: 'order',
        targetId: currentOrder.orderNumber,
        summary: `Pembayaran ditandai perlu peninjauan (${input.type}).`,
        changes: { type: input.type, source: input.source },
        session,
      });
      outcome = 'review';
    });
  } finally {
    await session.endSession();
  }
  if (outcome === 'review') {
    await recordOrderTransition('payment_review_required', String(input.order._id), {
      reason: input.type,
    }).catch(() => undefined);
  }
  return outcome;
}

async function applyPaid(
  order: InstanceType<typeof Order>,
  attempt: InstanceType<typeof PaymentAttempt>,
  status: GatewayStatus,
  source: Source,
): Promise<Outcome> {
  const session = await Order.startSession();
  let outcome: Outcome = 'paid';
  let late = false;
  try {
    await session.withTransaction(async () => {
      const currentOrder = await Order.findOne({ _id: order._id }, null, { session });
      const currentAttempt = await PaymentAttempt.findOne({ _id: attempt._id }, null, { session });
      if (!currentOrder || !currentAttempt) {
        outcome = 'ignored';
        return;
      }
      if (['refunded', 'partially_refunded', 'disputed'].includes(currentOrder.paymentStatus)) {
        outcome = 'ignored';
        return;
      }
      if (currentOrder.paymentStatus === 'review') {
        await PaymentAttempt.updateOne(
          { _id: currentAttempt._id },
          {
            $set: {
              status: 'paid',
              open: false,
              verifiedAt: new Date(),
              gatewayStatus: status.rawStatus,
              gatewayTransactionId: status.transactionId,
              fraudStatus: status.fraudStatus,
              paymentType: status.paymentType,
              lastCheckedAt: new Date(),
            },
          },
          { session },
        );
        await createOrReuseCase({
          orderId: currentOrder._id as Types.ObjectId,
          type: 'gateway_conflict',
          reason: 'Pembayaran terverifikasi saat pesanan sedang ditinjau admin.',
          priority: 'high',
          session,
          holdReason: 'Pembayaran terverifikasi setelah peninjauan dibuka.',
        });
        outcome = 'review';
        return;
      }
      if (currentOrder.paymentStatus === 'paid') {
        await PaymentAttempt.updateOne(
          { _id: currentAttempt._id },
          {
            $set: {
              status: 'paid',
              open: false,
              verifiedAt: currentAttempt.verifiedAt ?? new Date(),
              gatewayStatus: status.rawStatus,
              gatewayTransactionId: status.transactionId,
              fraudStatus: status.fraudStatus,
              paymentType: status.paymentType,
              lastCheckedAt: new Date(),
            },
          },
          { session },
        );
        outcome = 'duplicate';
        return;
      }

      late = currentOrder.reservation.status === 'released';
      const now = new Date();
      await PaymentAttempt.updateOne(
        { _id: currentAttempt._id },
        {
          $set: {
            status: 'paid',
            open: false,
            verifiedAt: now,
            gatewayStatus: status.rawStatus,
            gatewayTransactionId: status.transactionId,
            fraudStatus: status.fraudStatus,
            paymentType: status.paymentType,
            lastCheckedAt: now,
          },
        },
        { session },
      );

      if (late) {
        await Order.updateOne(
          { _id: currentOrder._id },
          {
            $set: {
              paymentStatus: 'review',
              'shippingHold.active': true,
              'shippingHold.reason': 'Pembayaran terverifikasi setelah reservasi stok dilepas.',
            },
            $push: {
              statusHistory: {
                at: now,
                type: 'payment',
                from: currentOrder.paymentStatus,
                to: 'review',
                actor: 'system',
                note: 'Pembayaran masuk setelah stok dilepas; pengiriman ditahan.',
              },
            },
          },
          { session },
        );
        await createOrReuseCase({
          orderId: currentOrder._id as Types.ObjectId,
          type: 'late_payment',
          reason: 'Pembayaran terverifikasi setelah reservasi stok dilepas.',
          priority: 'high',
          session,
          holdReason: 'Pembayaran setelah stok dilepas; tunggu keputusan admin.',
        });
        outcome = 'review';
        return;
      }

      if (currentOrder.reservation.status === 'held') {
        await allocateReservation(currentOrder._id as Types.ObjectId, currentOrder.orderNumber, session);
      }
      const updated = await Order.updateOne(
        { _id: currentOrder._id, paymentStatus: { $in: ['pending', 'verifying', 'expired', 'failed', 'cancelled'] } },
        {
          $set: { paymentStatus: 'paid', paidAt: now },
          $push: {
            statusHistory: {
              at: now,
              type: 'payment',
              from: currentOrder.paymentStatus,
              to: 'paid',
              actor: 'system',
              note: `Pembayaran terverifikasi dari ${source}.`,
            },
          },
        },
        { session },
      );
      if (updated.modifiedCount !== 1) {
        outcome = 'duplicate';
        return;
      }
      outcome = 'paid';
    });
  } finally {
    await session.endSession();
  }

  const finalOutcome = outcome as Outcome;
  if (finalOutcome === 'paid' || finalOutcome === 'review') {
    await recordOrderTransition('payment_verified', String(order._id), { source }).catch(() => undefined);
  }
  if (finalOutcome === 'review') {
    await recordOrderTransition('payment_review_required', String(order._id), {
      reason: 'late_payment',
    }).catch(() => undefined);
  }
  return finalOutcome;
}

async function applyClosed(
  order: InstanceType<typeof Order>,
  attempt: InstanceType<typeof PaymentAttempt>,
  status: GatewayStatus,
  source: Source,
): Promise<Outcome> {
  const session = await Order.startSession();
  let outcome: Outcome = 'closed';
  try {
    await session.withTransaction(async () => {
      const currentOrder = await Order.findOne({ _id: order._id }, null, { session });
      const currentAttempt = await PaymentAttempt.findOne({ _id: attempt._id }, null, { session });
      if (!currentOrder || !currentAttempt) {
        outcome = 'ignored';
        return;
      }
      if (currentAttempt.status === 'paid') {
        outcome = 'duplicate';
        return;
      }
      if (['paid', 'partially_refunded', 'refunded', 'disputed', 'review'].includes(currentOrder.paymentStatus)) {
        outcome = 'ignored';
        return;
      }
      const now = new Date();
      const next = closedPaymentStatus(status.status);
      await PaymentAttempt.updateOne(
        { _id: currentAttempt._id, open: true },
        {
          $set: {
            status: attemptStatusForClosed(status.status),
            open: false,
            gatewayStatus: status.rawStatus,
            gatewayTransactionId: status.transactionId,
            lastCheckedAt: now,
          },
        },
        { session },
      );
      if (currentOrder.reservation.status === 'held') {
        await releaseReservation(
          currentOrder._id as Types.ObjectId,
          `Pembayaran ditutup oleh gateway (${status.rawStatus}); reservasi dilepas satu kali.`,
          currentOrder.orderNumber,
          session,
        );
      } else if (currentOrder.reservation.status === 'allocated') {
        await createOrReuseCase({
          orderId: currentOrder._id as Types.ObjectId,
          type: 'gateway_conflict',
          reason: 'Gateway menutup pembayaran tetapi stok sudah dialokasikan.',
          priority: 'high',
          session,
          holdReason: 'Status gateway dan alokasi stok bertentangan.',
        });
        outcome = 'review';
        return;
      }
      await Order.updateOne(
        { _id: currentOrder._id, paymentStatus: { $in: ['pending', 'verifying', 'expired', 'failed', 'cancelled'] } },
        {
          $set: { paymentStatus: next },
          $push: {
            statusHistory: {
              at: now,
              type: 'payment',
              from: currentOrder.paymentStatus,
              to: next,
              actor: 'system',
              note: `Percobaan pembayaran ditutup (${status.rawStatus}) melalui ${source}.`,
            },
          },
        },
        { session },
      );
      outcome = 'closed';
    });
  } finally {
    await session.endSession();
  }
  return outcome;
}

async function applyRefund(
  order: InstanceType<typeof Order>,
  attempt: InstanceType<typeof PaymentAttempt>,
  status: GatewayStatus,
): Promise<Outcome> {
  const session = await Order.startSession();
  let outcome: Outcome = 'refunded';
  try {
    await session.withTransaction(async () => {
      const currentOrder = await Order.findOne({ _id: order._id }, null, { session });
      if (!currentOrder) {
        outcome = 'ignored';
        return;
      }
      if (!['paid', 'partially_refunded', 'refunded', 'disputed'].includes(currentOrder.paymentStatus)) {
        await createOrReuseCase({
          orderId: currentOrder._id as Types.ObjectId,
          type: 'gateway_conflict',
          reason: 'Gateway melaporkan refund untuk pesanan yang belum lunas.',
          priority: 'high',
          session,
          holdReason: 'Refund tidak cocok dengan status internal.',
        });
        outcome = 'review';
        return;
      }
      const mapped =
        status.status === 'partial_refund'
          ? 'partially_refunded'
          : status.status === 'chargeback'
            ? 'disputed'
            : 'refunded';
      const now = new Date();
      await PaymentAttempt.updateOne(
        { _id: attempt._id },
        {
          $set: {
            status: mapped === 'disputed' ? 'disputed' : mapped === 'refunded' ? 'refunded' : 'partially_refunded',
            open: false,
            gatewayStatus: status.rawStatus,
            gatewayTransactionId: status.transactionId,
            lastCheckedAt: now,
          },
        },
        { session },
      );
      const hold = ['pending', 'ready'].includes(currentOrder.shippingStatus);
      await Order.updateOne(
        { _id: currentOrder._id },
        {
          $set: {
            paymentStatus: mapped,
            ...(hold
              ? {
                  'shippingHold.active': true,
                  'shippingHold.reason': 'Refund atau sengketa perlu ditinjau sebelum pengiriman.',
                }
              : {}),
          },
          $push: {
            statusHistory: {
              at: now,
              type: 'payment',
              from: currentOrder.paymentStatus,
              to: mapped,
              actor: 'system',
              note: `Peristiwa gateway: ${status.rawStatus}. Stok tidak dikembalikan otomatis.`,
            },
          },
        },
        { session },
      );
      await createOrReuseCase({
        orderId: currentOrder._id as Types.ObjectId,
        type: status.status === 'chargeback' ? 'chargeback' : 'refund',
        reason: `Gateway melaporkan ${status.rawStatus}.`,
        priority: 'high',
        session,
        holdReason: hold ? 'Refund atau sengketa menahan pengiriman.' : undefined,
      });
      outcome = 'refunded';
    });
  } finally {
    await session.endSession();
  }
  return outcome;
}

export async function applyGatewayStatus(
  attemptId: Types.ObjectId | string,
  status: GatewayStatus,
  source: Source,
  verifiedTransactionId?: string,
): Promise<{ outcome: Outcome; orderNumber?: string }> {
  const attempt = await PaymentAttempt.findById(attemptId);
  if (!attempt) return { outcome: 'ignored' };
  const order = await Order.findById(attempt.orderId);
  if (!order) return { outcome: 'ignored' };

  if (verifiedTransactionId && status.transactionId && verifiedTransactionId !== status.transactionId) {
    return {
      outcome: await markForReview({
        order,
        attempt,
        type: 'gateway_conflict',
        reason: 'ID transaksi gateway berubah.',
        status,
        source,
      }),
      orderNumber: order.orderNumber,
    };
  }

  if (status.gatewayOrderId !== attempt.gatewayOrderId) {
    return {
      outcome: await markForReview({
        order,
        attempt,
        type: 'gateway_conflict',
        reason: 'Referensi pesanan gateway tidak cocok.',
        status,
        source,
      }),
      orderNumber: order.orderNumber,
    };
  }

  if (status.grossAmount !== attempt.amount || attempt.amount !== order.totals.grandTotal) {
    return {
      outcome: await markForReview({
        order,
        attempt,
        type: 'amount_mismatch',
        reason: 'Nominal gateway tidak cocok dengan catatan internal.',
        status,
        source,
      }),
      orderNumber: order.orderNumber,
    };
  }

  if (status.transactionId && attempt.gatewayTransactionId && status.transactionId !== attempt.gatewayTransactionId) {
    return {
      outcome: await markForReview({
        order,
        attempt,
        type: 'gateway_conflict',
        reason: 'ID transaksi berbeda dari catatan percobaan.',
        status,
        source,
      }),
      orderNumber: order.orderNumber,
    };
  }

  if (status.status === 'settlement' || status.status === 'capture') {
    if (status.status === 'capture') {
      if (status.fraudStatus === 'deny') {
        return { outcome: await applyClosed(order, attempt, { ...status, status: 'deny' }, source), orderNumber: order.orderNumber };
      }
      if (status.fraudStatus === 'challenge') {
        return {
          outcome: await markForReview({
            order,
            attempt,
            type: 'gateway_conflict',
            reason: 'Kartu memerlukan pemeriksaan fraud manual.',
            status,
            source,
          }),
          orderNumber: order.orderNumber,
        };
      }
      if (!cardEnabled() || status.paymentType !== 'credit_card') {
        return {
          outcome: await markForReview({
            order,
            attempt,
            type: 'gateway_conflict',
            reason: 'Capture kartu tidak diizinkan oleh konfigurasi kanal.',
            status,
            source,
          }),
          orderNumber: order.orderNumber,
        };
      }
    }
    if (status.fraudStatus === 'challenge') {
      return {
        outcome: await markForReview({
          order,
          attempt,
          type: 'gateway_conflict',
          reason: 'Pembayaran berstatus challenge fraud.',
          status,
          source,
        }),
        orderNumber: order.orderNumber,
      };
    }
    return { outcome: await applyPaid(order, attempt, status, source), orderNumber: order.orderNumber };
  }

  if (status.status === 'pending') {
    const now = new Date();
    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          status: order.paymentStatus === 'paid' ? 'paid' : attempt.open ? 'pending' : attempt.status,
          gatewayStatus: status.rawStatus,
          gatewayTransactionId: status.transactionId ?? attempt.gatewayTransactionId,
          fraudStatus: status.fraudStatus,
          paymentType: status.paymentType,
          lastCheckedAt: now,
        },
      },
    );
    if (order.paymentStatus === 'verifying') {
      await Order.updateOne(
        { _id: order._id, paymentStatus: 'verifying' },
        { $set: { paymentStatus: 'pending' } },
      );
    }
    if (attempt.methodWindowEndsAt.getTime() < now.getTime() && !['paid', 'review'].includes(order.paymentStatus)) {
      const session = await Order.startSession();
      try {
        await session.withTransaction(async () => {
          await createOrReuseCase({
            orderId: order._id as Types.ObjectId,
            type: 'uncertain_payment',
            reason: 'Gateway masih pending melewati batas jendela pembayaran.',
            session,
            holdReason: 'Pembayaran belum pasti setelah batas waktu.',
          });
          await PaymentAttempt.updateOne(
            { _id: attempt._id, open: true },
            { $set: { status: 'uncertain', lastCheckedAt: now } },
            { session },
          );
          await Order.updateOne(
            { _id: order._id, paymentStatus: { $in: ['pending', 'verifying'] } },
            { $set: { paymentStatus: 'review' } },
            { session },
          );
        });
      } finally {
        await session.endSession();
      }
      await recordOrderTransition('payment_review_required', String(order._id), {
        reason: 'payment_window_exceeded',
      }).catch(() => undefined);
      return { outcome: 'review', orderNumber: order.orderNumber };
    }
    return { outcome: 'pending', orderNumber: order.orderNumber };
  }

  if (isClosedStatus(status.status)) {
    return { outcome: await applyClosed(order, attempt, status, source), orderNumber: order.orderNumber };
  }

  if (['refund', 'partial_refund', 'chargeback'].includes(status.status)) {
    return { outcome: await applyRefund(order, attempt, status), orderNumber: order.orderNumber };
  }

  return {
    outcome: await markForReview({
      order,
      attempt,
      type: 'gateway_conflict',
      reason: `Status gateway tidak dikenal: ${status.rawStatus || 'kosong'}.`,
      status,
      source,
    }),
    orderNumber: order.orderNumber,
  };
}

async function attemptWithGateway(gateway: PaymentGateway, gatewayOrderId: string): Promise<GatewayStatus | null> {
  return gateway.getStatus(gatewayOrderId);
}

async function handleNotFound(attempt: InstanceType<typeof PaymentAttempt>): Promise<Outcome> {
  const now = new Date();
  const sessionExpired = attempt.sessionExpiresAt.getTime() <= now.getTime();
  const methodExpired = attempt.methodWindowEndsAt.getTime() <= now.getTime();
  if (!sessionExpired || !methodExpired) {
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { lastCheckedAt: now } });
    return 'pending';
  }
  if (attempt.redirectUrl) {
    const session = await Order.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(attempt.orderId).session(session);
        if (!order) return;
        await createOrReuseCase({
          orderId: order._id as Types.ObjectId,
          type: 'uncertain_payment',
          reason: 'GET Status mengembalikan 404 setelah halaman dan metode pembayaran kedaluwarsa.',
          session,
          holdReason: 'Status pembayaran tidak pasti; pengiriman ditahan.',
        });
        await PaymentAttempt.updateOne(
          { _id: attempt._id },
          { $set: { status: 'uncertain', lastCheckedAt: now, gatewayStatus: '404' } },
          { session },
        );
        await Order.updateOne(
          { _id: order._id, paymentStatus: { $in: ['pending', 'verifying'] } },
          { $set: { paymentStatus: 'review' } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return 'review';
  }
  const order = await Order.findById(attempt.orderId);
  if (!order) return 'ignored';
  return applyClosed(
    order,
    attempt,
    {
      gatewayOrderId: attempt.gatewayOrderId,
      status: 'expire',
      grossAmount: attempt.amount,
      rawStatus: 'not_found_after_expiry',
      statusCode: '404',
    },
    'job',
  );
}

export async function refreshAttempt(
  attempt: InstanceType<typeof PaymentAttempt>,
  source: Source,
): Promise<Outcome> {
  let status: GatewayStatus | null;
  try {
    status = await attemptWithGateway(paymentGateway(), attempt.gatewayOrderId);
  } catch (error) {
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { lastCheckedAt: new Date() } });
    throw error;
  }
  if (!status) {
    return handleNotFound(attempt);
  }
  return (await applyGatewayStatus(attempt._id, status, source, attempt.gatewayTransactionId ?? undefined)).outcome;
}

function finishUrlFor(orderNumber: string): string {
  return `${env.APP_ORIGIN}/akun/pesanan/${encodeURIComponent(orderNumber)}?from=payment`;
}

function newGatewayOrderId(orderNumber: string): string {
  return `${orderNumber}-${randomId(4).toUpperCase()}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAttempt(
  orderId: Types.ObjectId,
): Promise<InstanceType<typeof PaymentAttempt> | null> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const current = await PaymentAttempt.findOne({ orderId, open: true });
    if (!current) return null;
    if (current.redirectUrl || ['uncertain', 'paid', 'failed', 'expired', 'review'].includes(current.status)) return current;
    await sleep(250);
  }
  return PaymentAttempt.findOne({ orderId, open: true });
}

export type StartPaymentResult = {
  attempt: InstanceType<typeof PaymentAttempt>;
  order: InstanceType<typeof Order>;
  uncertain?: boolean;
  pending?: boolean;
};

export async function startPaymentForOrder(orderId: Types.ObjectId, userId: Types.ObjectId): Promise<StartPaymentResult> {
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
  if (['paid', 'refunded', 'partially_refunded', 'disputed'].includes(order.paymentStatus)) {
    throw new AppError(409, 'ORDER_NOT_PAYABLE', 'Pesanan ini tidak dapat dibayar lagi.');
  }
  if (order.paymentStatus === 'review') {
    throw new AppError(409, 'PAYMENT_UNDER_REVIEW', 'Pembayaran pesanan sedang ditinjau.');
  }

  const openAttempt = await PaymentAttempt.findOne({ orderId: order._id, open: true });
  if (openAttempt) {
    if (openAttempt.status === 'paid') {
      return { attempt: openAttempt, order };
    }
    if (openAttempt.status === 'review') {
      throw new AppError(409, 'PAYMENT_UNDER_REVIEW', 'Pembayaran pesanan sedang ditinjau.');
    }
    if (openAttempt.redirectUrl && ['pending', 'created'].includes(openAttempt.status)) {
      return { attempt: openAttempt, order };
    }
    if (openAttempt.status === 'uncertain' || !openAttempt.redirectUrl) {
      try {
        await refreshAttempt(openAttempt, 'admin');
      } catch {
        // Tetap tahan penerbitan referensi baru sampai status pasti.
      }
      const refreshed = await PaymentAttempt.findById(openAttempt._id);
      if (refreshed?.redirectUrl && ['pending', 'created'].includes(refreshed.status)) {
        return { attempt: refreshed, order };
      }
      if (refreshed?.status === 'uncertain' || (refreshed && !refreshed.redirectUrl && refreshed.open)) {
        throw new AppError(
          409,
          'PAYMENT_UNCERTAIN',
          'Status pembayaran masih diperiksa. Jangan membuat pembayaran baru.',
          { contact: { email: storeConfig.contact.email, whatsapp: storeConfig.contact.whatsapp } },
        );
      }
      if (!refreshed || !refreshed.open) {
        throw new AppError(409, 'ORDER_CLOSED', 'Percobaan pembayaran sudah ditutup. Buat pesanan baru.');
      }
    }
    if (openAttempt.status === 'created') {
      const ready = await waitForAttempt(order._id as Types.ObjectId);
      if (ready) {
        if (ready.redirectUrl) return { attempt: ready, order };
        return { attempt: ready, order, pending: true };
      }
    }
  }

  if (order.reservation.status !== 'held') {
    throw new AppError(409, 'ORDER_NOT_PAYABLE', 'Reservasi stok untuk pesanan ini tidak aktif.');
  }
  if (order.reservation.expiresAt.getTime() <= Date.now()) {
    throw new AppError(409, 'ORDER_EXPIRED', 'Batas pembayaran sudah lewat. Buat pesanan baru.');
  }

  const itemDetails = [
    ...order.items.map((item) => ({
      name: `${item.productName} ${item.variantLabel}`,
      price: item.unitPrice,
      quantity: item.quantity,
    })),
    ...(order.shipping.total > 0
      ? [{ name: 'Ongkos kirim', price: order.shipping.total, quantity: 1 }]
      : []),
  ];
  const amountSum = itemDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (amountSum !== order.totals.grandTotal) {
    throw new AppError(500, 'PAYMENT_AMOUNT_INVALID', 'Rincian item tidak sama dengan total pesanan.');
  }

  const gateway = paymentGateway();
  const gatewayOrderId = newGatewayOrderId(order.orderNumber);
  const now = new Date();
  const sessionExpiresAt = new Date(now.getTime() + env.SNAP_EXPIRY_MINUTES * 60 * 1000);
  const methodWindowEndsAt = new Date(now.getTime() + env.PAYMENT_METHOD_WINDOW_MINUTES * 60 * 1000);
  const createSession = await Order.startSession();
  try {
    await createSession.withTransaction(async () => {
      await PaymentAttempt.create(
        [
          {
            orderId: order._id,
            gatewayOrderId,
            provider: paymentGateway().provider,
            amount: order.totals.grandTotal,
            status: 'created',
            open: true,
            sessionExpiresAt,
            methodWindowEndsAt,
          },
        ],
        { session: createSession },
      );
    });
  } catch (error) {
    const mongoError = error as { code?: number };
    if (mongoError.code === 11000) {
      const existing = await waitForAttempt(order._id as Types.ObjectId);
      if (existing) {
        if (existing.redirectUrl) return { attempt: existing, order };
        return { attempt: existing, order, pending: true };
      }
    }
    throw error;
  } finally {
    await createSession.endSession();
  }
  const attempt = await PaymentAttempt.findOne({ orderId: order._id, gatewayOrderId });
  if (!attempt) throw new AppError(500, 'PAYMENT_ATTEMPT_FAILED', 'Percobaan pembayaran gagal dibuat.');

  try {
    const result = await gateway.createTransaction({
      gatewayOrderId,
      amount: order.totals.grandTotal,
      orderNumber: order.orderNumber,
      customer: {
        name: order.address.recipient,
        email: order.email,
        phone: order.address.phone,
      },
      items: itemDetails,
      finishUrl: finishUrlFor(order.orderNumber),
    });
    const redirectUrl = validatePaymentRedirect(result.redirectUrl, gateway.provider);
    const updatedAttempt = await PaymentAttempt.findByIdAndUpdate(
      attempt._id,
      {
        $set: {
          status: 'pending',
          redirectUrl,
          snapToken: result.token,
          gatewayStatus: 'pending',
          lastCheckedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!updatedAttempt) throw new AppError(500, 'PAYMENT_ATTEMPT_FAILED', 'Percobaan pembayaran hilang.');
    return { attempt: updatedAttempt, order };
  } catch (error) {
    if (error instanceof GatewayTimeoutError || (error as { httpStatus?: number }).httpStatus === undefined || ((error as { httpStatus?: number }).httpStatus ?? 0) >= 500) {
      const uncertainSession = await Order.startSession();
      try {
        await uncertainSession.withTransaction(async () => {
          await PaymentAttempt.updateOne(
            { _id: attempt._id },
            {
              $set: {
                status: 'uncertain',
                open: true,
                failureReason: 'Gateway timeout saat membuat transaksi.',
                lastCheckedAt: new Date(),
              },
            },
            { session: uncertainSession },
          );
          const current = await Order.findById(order._id).session(uncertainSession);
          if (current && !['paid', 'review', 'refunded', 'partially_refunded', 'disputed'].includes(current.paymentStatus)) {
            await Order.updateOne(
              { _id: order._id, paymentStatus: { $in: ['pending', 'verifying'] } },
              {
                $set: { paymentStatus: 'verifying' },
                $push: {
                  statusHistory: {
                    at: new Date(),
                    type: 'payment',
                    from: current.paymentStatus,
                    to: 'verifying',
                    actor: 'system',
                    note: 'Pembuatan transaksi gateway time-out; menunggu rekonsiliasi.',
                  },
                },
              },
              { session: uncertainSession },
            );
            await createOrReuseCase({
              orderId: order._id as Types.ObjectId,
              type: 'uncertain_payment',
              reason: 'Timeout saat membuat transaksi Snap; perlu rekonsiliasi sebelum percobaan baru.',
              session: uncertainSession,
            });
          }
        });
      } finally {
        await uncertainSession.endSession();
      }
      const refreshed = (await PaymentAttempt.findById(attempt._id)) ?? attempt;
      return { attempt: refreshed, order, uncertain: true };
    }

    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          status: 'failed',
          open: false,
          failureReason: 'Gateway menolak pembuatan transaksi.',
          lastCheckedAt: new Date(),
        },
      },
    );
    throw new AppError(502, 'PAYMENT_START_FAILED', 'Pembayaran belum dapat dimulai. Coba lagi.');
  }
}

export async function maybeRefreshOrderOnRead(
  order: InstanceType<typeof Order>,
  source: Source = 'job',
): Promise<void> {
  if (!['pending', 'verifying'].includes(order.paymentStatus)) return;
  const attempt = await PaymentAttempt.findOne({ orderId: order._id, open: true });
  if (!attempt) return;
  if (attempt.status === 'review' || attempt.status === 'uncertain') {
    // Tetap coba rekonsiliasi sesekali, tetapi jangan spam gateway.
    if (attempt.lastCheckedAt && Date.now() - attempt.lastCheckedAt.getTime() < 30_000) return;
  } else if (attempt.lastCheckedAt && Date.now() - attempt.lastCheckedAt.getTime() < 10_000) {
    return;
  }
  const claimed = await PaymentAttempt.findOneAndUpdate(
    {
      _id: attempt._id,
      $or: [
        { lastCheckedAt: { $exists: false } },
        { lastCheckedAt: { $lt: new Date(Date.now() - 10_000) } },
      ],
    },
    { $set: { lastCheckedAt: new Date() } },
    { new: true },
  );
  if (!claimed) return;
  try {
    await refreshAttempt(claimed, source);
  } catch (error) {
    logger.warn({ event: 'payment_refresh_failed', code: (error as Error).name }, 'Rekonsiliasi pembacaan pesanan gagal.');
  }
}

export async function reconcileOnce(): Promise<{
  attempts: number;
  events: number;
  orders: number;
  errors: number;
}> {
  let errors = 0;
  let attemptsProcessed = 0;
  const attempts = await PaymentAttempt.find({
    open: true,
    status: { $in: ['created', 'pending', 'uncertain'] },
  })
    .sort({ lastCheckedAt: 1 })
    .limit(50);
  for (const attempt of attempts) {
    attemptsProcessed += 1;
    try {
      await refreshAttempt(attempt, 'job');
    } catch {
      errors += 1;
      logger.warn({ event: 'reconcile_attempt_failed', attempt: String(attempt._id) }, 'Rekonsiliasi percobaan gagal.');
    }
  }

  let ordersProcessed = 0;
  const hangingOrders = await Order.find({
    'reservation.status': 'held',
    'reservation.expiresAt': { $lt: new Date() },
    paymentStatus: { $in: ['pending', 'verifying'] },
  }).limit(50);
  for (const order of hangingOrders) {
    const openAttempt = await PaymentAttempt.findOne({ orderId: order._id, open: true });
    if (openAttempt) continue;
    const paidAttempt = await PaymentAttempt.findOne({ orderId: order._id, status: 'paid' });
    const session = await Order.startSession();
    try {
      await session.withTransaction(async () => {
        if (paidAttempt) {
          await createOrReuseCase({
            orderId: order._id as Types.ObjectId,
            type: 'gateway_conflict',
            reason: 'Percobaan pembayaran tercatat lunas tetapi pesanan belum difinalisasi.',
            priority: 'high',
            session,
            holdReason: 'Pembayaran dan status pesanan tidak konsisten.',
          });
          await Order.updateOne(
            { _id: order._id, paymentStatus: { $in: ['pending', 'verifying'] } },
            { $set: { paymentStatus: 'review' } },
            { session },
          );
          return;
        }
        await releaseReservation(
          order._id as Types.ObjectId,
          'Batas reservasi lewat tanpa percobaan pembayaran aktif; stok dilepas satu kali.',
          order.orderNumber,
          session,
        );
        await Order.updateOne(
          { _id: order._id, paymentStatus: { $in: ['pending', 'verifying'] } },
          {
            $set: { paymentStatus: 'expired' },
            $push: {
              statusHistory: {
                at: new Date(),
                type: 'payment',
                from: order.paymentStatus,
                to: 'expired',
                actor: 'system',
                note: 'Pesanan menggantung tanpa percobaan bayar; reservasi dilepas.',
              },
            },
          },
          { session },
        );
      });
      ordersProcessed += 1;
    } catch {
      errors += 1;
      logger.warn({ event: 'reconcile_order_failed', order: order.orderNumber }, 'Rekonsiliasi pesanan gagal.');
    } finally {
      await session.endSession();
    }
  }

  const events = await WebhookEvent.find({ status: 'pending', availableAt: { $lte: new Date() } }).limit(50);
  let eventsProcessed = 0;
  for (const event of events) {
    eventsProcessed += 1;
    try {
      const attempt = await PaymentAttempt.findOne({ gatewayOrderId: event.gatewayOrderId });
      if (!attempt) {
        await WebhookEvent.updateOne(
          { _id: event._id },
          { $set: { status: 'ignored', processedAt: new Date(), result: 'attempt_not_found' } },
        );
        continue;
      }
      const status = await paymentGateway().getStatus(event.gatewayOrderId);
      if (!status) {
        await WebhookEvent.updateOne(
          { _id: event._id },
          {
            $set: { status: 'pending', availableAt: new Date(Date.now() + 60_000), lastError: 'status_not_found' },
            $inc: { attempts: 1 },
          },
        );
        continue;
      }
      const result = await applyGatewayStatus(attempt._id, status, 'webhook');
      await WebhookEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: result.outcome === 'ignored' ? 'ignored' : 'processed',
            processedAt: new Date(),
            result: result.outcome,
            attemptId: attempt._id,
            orderId: attempt.orderId,
          },
        },
      );
    } catch {
      errors += 1;
      await WebhookEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            availableAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** event.attempts) * 1000),
            lastError: 'gateway_unavailable',
            status: 'pending',
          },
          $inc: { attempts: 1 },
        },
      );
    }
  }
  return { attempts: attemptsProcessed, events: eventsProcessed, orders: ordersProcessed, errors };
}

export async function processNotification(payload: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  transaction_id?: string;
  fraud_status?: string;
  payment_type?: string;
}): Promise<{ status: 'processed' | 'pending' | 'ignored'; outcome?: string }> {
  const eventKey = sha256(
    [
      payload.order_id,
      payload.status_code,
      payload.gross_amount,
      payload.transaction_status,
      payload.transaction_id ?? '',
      payload.fraud_status ?? '',
    ].join('|'),
  );
  const existing = await WebhookEvent.findOne({ eventKey });
  if (existing) {
    if (existing.status === 'processed' || existing.status === 'ignored') {
      return { status: existing.status === 'processed' ? 'processed' : 'ignored', outcome: existing.result ?? undefined };
    }
  } else {
    try {
      await WebhookEvent.create({
        eventKey,
        gatewayOrderId: payload.order_id,
        source: 'webhook',
        status: 'pending',
        signatureValid: true,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  const attempt = await PaymentAttempt.findOne({ gatewayOrderId: payload.order_id });
  if (!attempt) {
    await WebhookEvent.updateOne(
      { eventKey },
      { $set: { status: 'ignored', processedAt: new Date(), result: 'attempt_not_found' } },
    );
    return { status: 'ignored' };
  }

  try {
    const status = await paymentGateway().getStatus(payload.order_id);
    if (!status) {
      await WebhookEvent.updateOne(
        { eventKey },
        {
          $set: { status: 'pending', availableAt: new Date(Date.now() + 30_000), result: 'status_not_found' },
          $inc: { attempts: 1 },
        },
      );
      return { status: 'pending' };
    }
    const result = await applyGatewayStatus(attempt._id, status, 'webhook', payload.transaction_id);
    await WebhookEvent.updateOne(
      { eventKey },
      {
        $set: {
          status: result.outcome === 'ignored' ? 'ignored' : 'processed',
          processedAt: new Date(),
          result: result.outcome,
          attemptId: attempt._id,
          orderId: attempt.orderId,
        },
      },
    );
    return { status: result.outcome === 'ignored' ? 'ignored' : 'processed', outcome: result.outcome };
  } catch (error) {
    await WebhookEvent.updateOne(
      { eventKey },
      {
        $set: {
          status: 'pending',
          availableAt: new Date(Date.now() + 60_000),
          lastError: error instanceof GatewayTimeoutError ? 'gateway_timeout' : 'gateway_error',
        },
        $inc: { attempts: 1 },
      },
    );
    return { status: 'pending' };
  }
}

export function webhookServerKey(): string {
  if (env.PAYMENT_ADAPTER === 'midtrans') {
    if (!env.MIDTRANS_SERVER_KEY) throw new AppError(500, 'PAYMENT_CONFIG', 'Server Key belum diatur.');
    return env.MIDTRANS_SERVER_KEY;
  }
  return env.MIDTRANS_SERVER_KEY || 'simulation-only-server-key';
}
