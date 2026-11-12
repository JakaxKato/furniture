import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rateLimit';
import { asyncHandler } from '../middleware/async';
import { requireAuth } from '../middleware/auth';
import { Order } from '../models';
import { addressInputSchema, buildQuote, createOrder, itemsInputSchema } from './checkout';
import { maybeRefreshOrderOnRead, startPaymentForOrder } from './payments';
import { toOrderDetail, toOrderSummary } from './orderDto';
import { recordEvent } from './analytics';

export const checkoutRouter = Router();

const quoteRequestSchema = z
  .object({
    items: itemsInputSchema,
    address: addressInputSchema,
  })
  .strict();

const orderRequestSchema = z
  .object({
    items: itemsInputSchema,
    address: addressInputSchema,
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/, 'Hash ringkasan tidak valid.'),
  })
  .strict();

checkoutRouter.use(requireAuth);

checkoutRouter.post(
  '/quote',
  asyncHandler(async (req, res) => {
    await enforceRateLimit({
      prefix: 'quote',
      identifier: String(req.auth!.user._id),
      limit: 60,
      windowSeconds: 600,
    });
    const body = quoteRequestSchema.parse(req.body);
    try {
      const quote = await buildQuote(body.address, body.items);
      res.json({ quote });
    } catch (error) {
      if (error instanceof AppError && error.code === 'SHIPPING_UNAVAILABLE') {
        await recordEvent({
          type: 'shipping_unavailable',
          pseudonym: String(req.auth!.user._id),
          metadata: {
            reason:
              typeof error.details === 'object' && error.details && 'reason' in error.details
                ? String((error.details as { reason?: string }).reason)
                : 'unknown',
          },
        }).catch(() => undefined);
      }
      throw error;
    }
  }),
);

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    await enforceRateLimit({
      prefix: 'order-create',
      identifier: String(req.auth!.user._id),
      limit: 20,
      windowSeconds: 600,
    });
    const idempotencyKey = req.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Header Idempotency-Key wajib diisi.');
    }
    const body = orderRequestSchema.parse(req.body);
    const { order, idempotent } = await createOrder({
      userId: req.auth!.user._id,
      email: req.auth!.user.email,
      items: body.items,
      address: body.address,
      quoteHash: body.quoteHash,
      idempotencyKey,
    });

    let payment:
      | {
          redirectUrl: string | null;
          status: string;
          uncertain: boolean;
          pending: boolean;
        }
      | null = null;
    let paymentError: { code: string; message: string } | null = null;
    try {
      const result = await startPaymentForOrder(order._id, req.auth!.user._id);
      payment = {
        redirectUrl: result.attempt.redirectUrl ?? null,
        status: result.attempt.status,
        uncertain: Boolean(result.uncertain),
        pending: Boolean(result.pending),
      };
    } catch (error) {
      if (error instanceof AppError) {
        paymentError = { code: error.code, message: error.message };
      } else {
        throw error;
      }
    }

    const fresh = await Order.findById(order._id);
    if (!fresh) throw new AppError(500, 'ORDER_FAILED', 'Pesanan tidak ditemukan setelah dibuat.');
    res.status(idempotent ? 200 : 201).json({
      order: await toOrderDetail(fresh),
      payment,
      paymentError,
      idempotent,
    });
  }),
);

const listQuerySchema = z
  .object({
    page: z.preprocess(
      (value) => (Array.isArray(value) ? value[0] : value || undefined),
      z.coerce.number().int().min(1).max(1000).optional(),
    ),
    perPage: z.preprocess(
      (value) => (Array.isArray(value) ? value[0] : value || undefined),
      z.coerce.number().int().min(1).max(50).optional(),
    ),
  })
  .strict();

ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(400, 'VALIDATION_ERROR', 'Parameter tidak valid.');
    const page = query.data.page ?? 1;
    const perPage = query.data.perPage ?? 20;
    const filter = { userId: req.auth!.user._id };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Order.countDocuments(filter),
    ]);
    res.json({
      items: orders.map(toOrderSummary),
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  }),
);

ordersRouter.get(
  '/:orderNumber',
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    let order = await Order.findOne({ orderNumber, userId: req.auth!.user._id });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    await maybeRefreshOrderOnRead(order).catch(() => undefined);
    order = await Order.findOne({ orderNumber, userId: req.auth!.user._id });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    res.json({ order: await toOrderDetail(order) });
  }),
);

ordersRouter.post(
  '/:orderNumber/payment',
  asyncHandler(async (req, res) => {
    await enforceRateLimit({
      prefix: 'order-payment',
      identifier: String(req.auth!.user._id),
      limit: 20,
      windowSeconds: 600,
    });
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    const order = await Order.findOne({ orderNumber, userId: req.auth!.user._id });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    const result = await startPaymentForOrder(order._id, req.auth!.user._id);
    const fresh = await Order.findById(order._id);
    res.status(result.uncertain ? 202 : 200).json({
      order: fresh ? await toOrderDetail(fresh) : null,
      payment: {
        redirectUrl: result.attempt.redirectUrl ?? null,
        status: result.attempt.status,
        uncertain: Boolean(result.uncertain),
        pending: Boolean(result.pending),
      },
    });
  }),
);
