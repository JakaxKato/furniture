import type { HydratedDocument } from 'mongoose';
import { env } from '../config/env';
import { PaymentAttempt, type OrderDoc } from '../models';

type OrderDocument = HydratedDocument<OrderDoc>;
type AttemptDocument = InstanceType<typeof PaymentAttempt>;

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Menunggu pembayaran',
  verifying: 'Sedang memeriksa pembayaran',
  paid: 'Pembayaran diterima',
  failed: 'Pembayaran gagal',
  expired: 'Pembayaran kedaluwarsa',
  cancelled: 'Pembayaran dibatalkan',
  review: 'Pembayaran sedang ditinjau',
  partially_refunded: 'Refund sebagian tercatat',
  refunded: 'Refund tercatat',
  disputed: 'Sengketa pembayaran',
};

const SHIPPING_LABELS: Record<string, string> = {
  pending: 'Belum diproses',
  ready: 'Siap kirim',
  shipped: 'Dikirim',
  delivered: 'Diterima',
};

function attemptIsLinkValid(attempt: AttemptDocument | null): boolean {
  if (!attempt || !attempt.open || !attempt.redirectUrl) return false;
  if (!['pending', 'created'].includes(attempt.status)) return false;
  return attempt.sessionExpiresAt.getTime() > Date.now() && attempt.methodWindowEndsAt.getTime() > Date.now();
}

export function toOrderSummary(order: OrderDocument) {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items: order.items.map((item) => ({
      productName: item.productName,
      variantLabel: item.variantLabel,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      imageUrl: item.imageUrl,
      imageAlt: item.imageAlt,
    })),
    totals: order.totals,
    paymentStatus: order.paymentStatus,
    paymentLabel: PAYMENT_LABELS[order.paymentStatus] ?? 'Status pembayaran tidak dikenal',
    shippingStatus: order.shippingStatus,
    shippingLabel: SHIPPING_LABELS[order.shippingStatus] ?? 'Status pengiriman tidak dikenal',
    shippingHold: Boolean(order.shippingHold?.active),
  };
}

export async function toOrderDetail(order: OrderDocument) {
  const attempt = await PaymentAttempt.findOne({ orderId: order._id }).sort({ createdAt: -1 });
  const canContinue = attemptIsLinkValid(attempt);
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    email: order.email,
    updatedAt: order.updatedAt,
    customerUpdate: order.operations?.customerUpdate ?? null,
    expectedDelivery: order.operations?.expectedDelivery ?? null,
    trackingUrl: order.operations?.trackingUrl || null,
    items: order.items.map((item) => ({
      sku: item.sku,
      productSlug: item.productSlug,
      productName: item.productName,
      variantLabel: item.variantLabel,
      attributes: item.attributes,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      imageUrl: item.imageUrl,
      imageAlt: item.imageAlt,
    })),
    address: {
      recipient: order.address.recipient,
      phone: order.address.phone,
      street: order.address.street,
      district: order.address.district ?? null,
      city: order.address.city,
      province: order.address.province,
      postalCode: order.address.postalCode,
      notes: order.address.notes ?? null,
    },
    shipping: {
      zoneName: order.shipping.zoneName,
      zoneVersion: order.shipping.zoneVersion,
      classes: order.shipping.classes.map((line) => ({ label: line.label, amount: line.amount })),
      total: order.shipping.total,
      estimatedDays: order.shipping.estimatedDays?.confirmed ? order.shipping.estimatedDays : null,
    },
    totals: order.totals,
    paymentStatus: order.paymentStatus,
    paymentLabel: PAYMENT_LABELS[order.paymentStatus] ?? 'Status pembayaran tidak dikenal',
    canContinuePayment: canContinue,
    paymentRedirectUrl: canContinue ? attempt?.redirectUrl ?? null : null,
    paymentMessage:
      order.paymentStatus === 'verifying'
        ? 'Sedang memeriksa pembayaran'
        : order.paymentStatus === 'review'
          ? 'Pembayaran sedang ditinjau'
          : null,
    shippingStatus: order.shippingStatus,
    shippingLabel: SHIPPING_LABELS[order.shippingStatus] ?? 'Status pengiriman tidak dikenal',
    shippingHold: order.shippingHold?.active
      ? { active: true, reason: order.shippingHold.reason ?? null }
      : { active: false, reason: null },
    tracking: order.tracking?.trackingNumber
      ? {
          courier: order.tracking.courier ?? null,
          trackingNumber: order.tracking.trackingNumber,
          shippedAt: order.tracking.shippedAt ?? null,
          deliveredAt: order.tracking.deliveredAt ?? null,
        }
      : null,
    statusHistory: order.statusHistory.map((entry) => ({
      at: entry.at,
      type: entry.type,
      from: entry.from ?? null,
      to: entry.to ?? null,
      note: entry.note ?? null,
    })),
    paymentAdapter: env.PAYMENT_ADAPTER,
    reservationActive: order.reservation.status === 'held',
    reservationExpiresAt: order.reservation.status === 'held' ? order.reservation.expiresAt : null,
  };
}

export function toAdminOrder(order: OrderDocument) {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    email: order.email,
    recipient: order.address.recipient,
    city: order.address.city,
    paymentStatus: order.paymentStatus,
    shippingStatus: order.shippingStatus,
    shippingHold: Boolean(order.shippingHold?.active),
    totals: order.totals,
    reservationStatus: order.reservation.status,
    trackingNumber: order.tracking?.trackingNumber ?? null,
  };
}
