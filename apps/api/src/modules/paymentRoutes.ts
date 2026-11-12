import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { gatewaySignature, timingSafeEqualHex } from '../lib/crypto';
import { enforceRateLimit } from '../lib/rateLimit';
import { asyncHandler } from '../middleware/async';
import { clientIp, requireAuth } from '../middleware/auth';
import { Order, PaymentAttempt } from '../models';
import { applyGatewayStatus, processNotification, webhookServerKey } from './payments';
import { paymentGateway } from './paymentGateway';

export const webhookRouter = Router();

const notificationSchema = z
  .object({
    order_id: z.string().trim().min(1).max(100),
    status_code: z.string().trim().regex(/^\d{3}$/),
    gross_amount: z.union([z.string().trim().min(1).max(30), z.number()]).transform(String),
    signature_key: z.string().trim().regex(/^[a-fA-F0-9]{128}$/),
    transaction_status: z.string().trim().min(1).max(40),
    transaction_id: z.string().trim().max(100).optional(),
    fraud_status: z.string().trim().max(40).optional(),
    payment_type: z.string().trim().max(60).optional(),
  })
  .passthrough();

webhookRouter.post(
  '/midtrans',
  asyncHandler(async (req, res) => {
    await enforceRateLimit({
      prefix: 'webhook',
      identifier: clientIp(req),
      limit: 300,
      windowSeconds: 60,
    });
    const parsed = notificationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'WEBHOOK_INVALID', 'Format notifikasi tidak valid.');
    }
    const payload = parsed.data;
    const expected = gatewaySignature(
      payload.order_id,
      payload.status_code,
      payload.gross_amount,
      webhookServerKey(),
    );
    if (!timingSafeEqualHex(expected, payload.signature_key)) {
      throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Signature tidak valid.');
    }
    const result = await processNotification(payload);
    res.status(result.status === 'pending' ? 202 : 200).json({ received: true, status: result.status });
  }),
);

export const simulationRouter = Router();

if (env.PAYMENT_ADAPTER === 'simulation' && env.NODE_ENV !== 'production') {
  simulationRouter.use(requireAuth);

  simulationRouter.get(
    '/:gatewayOrderId',
    asyncHandler(async (req, res) => {
      const gatewayOrderId = z.string().trim().min(3).max(120).parse(req.params.gatewayOrderId);
      const attempt = await PaymentAttempt.findOne({ gatewayOrderId });
      if (!attempt) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Percobaan pembayaran tidak ditemukan.');
      const order = await Order.findOne({ _id: attempt.orderId, userId: req.auth!.user._id });
      if (!order) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Percobaan pembayaran tidak ditemukan.');
      res.json({
        orderNumber: order.orderNumber,
        amount: attempt.amount,
        attemptStatus: attempt.status,
        paymentStatus: order.paymentStatus,
        items: order.items.map((item) => ({
          name: item.productName,
          variant: item.variantLabel,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
        totals: order.totals,
      });
    }),
  );

  simulationRouter.post(
    '/:gatewayOrderId',
    asyncHandler(async (req, res) => {
      await enforceRateLimit({
        prefix: 'simulation-payment',
        identifier: `${req.auth!.user._id}:${clientIp(req)}`,
        limit: 60,
        windowSeconds: 600,
      });
      const gatewayOrderId = z.string().trim().min(3).max(120).parse(req.params.gatewayOrderId);
      const body = z
        .object({
          action: z.enum(['settlement', 'deny', 'expire', 'cancel', 'capture_challenge']),
        })
        .strict()
        .parse(req.body);
      const attempt = await PaymentAttempt.findOne({ gatewayOrderId });
      if (!attempt) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Percobaan pembayaran tidak ditemukan.');
      const order = await Order.findOne({ _id: attempt.orderId, userId: req.auth!.user._id });
      if (!order) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Percobaan pembayaran tidak ditemukan.');
      const gateway = paymentGateway();
      if (!gateway.simulate) throw new AppError(404, 'SIMULATION_UNAVAILABLE', 'Simulasi tidak tersedia.');
      const status = await gateway.simulate(gatewayOrderId, body.action);
      if (!status) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Transaksi simulasi tidak ditemukan.');
      const result = await applyGatewayStatus(attempt._id, status, 'simulation');
      const fresh = await Order.findById(order._id);
      res.json({
        result: result.outcome,
        paymentStatus: fresh?.paymentStatus,
        orderNumber: order.orderNumber,
      });
    }),
  );
}
