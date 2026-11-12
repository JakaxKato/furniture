import { Router } from 'express';
import { z } from 'zod';
import { enforceRateLimit } from '../lib/rateLimit';
import { asyncHandler } from '../middleware/async';
import { clientIp } from '../middleware/auth';
import { recordEvent } from './analytics';

export const analyticsRouter = Router();

const eventSchema = z
  .object({
    type: z.enum(['view_product', 'select_variant', 'add_to_cart', 'checkout_started']),
    productId: z
      .string()
      .regex(/^[a-f0-9]{24}$/)
      .optional(),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,64}$/)
      .optional(),
    quantity: z.number().int().min(1).max(99).optional(),
  })
  .strict();

analyticsRouter.post(
  '/events',
  asyncHandler(async (req, res) => {
    const identifier = req.auth ? String(req.auth.user._id) : clientIp(req);
    await enforceRateLimit({
      prefix: 'client-event',
      identifier,
      limit: 120,
      windowSeconds: 60,
    });
    const body = eventSchema.parse(req.body);
    await recordEvent({
      type: body.type,
      productId: body.productId,
      pseudonym: identifier,
      metadata: {
        ...(body.sku ? { sku: body.sku } : {}),
        ...(body.quantity ? { quantity: body.quantity } : {}),
      },
    });
    res.status(204).end();
  }),
);
