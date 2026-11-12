import { AnalyticsEvent } from '../models';
import { sha256 } from '../lib/crypto';
import { logger } from '../lib/logger';

type EventType =
  | 'view_product'
  | 'select_variant'
  | 'add_to_cart'
  | 'checkout_started'
  | 'shipping_unavailable'
  | 'order_created'
  | 'payment_verified'
  | 'payment_review_required'
  | 'order_shipped';

type EventInput = {
  type: EventType;
  orderId?: string;
  productId?: string;
  pseudonym?: string;
  metadata?: Record<string, string | number | boolean>;
  dedupeKey?: string;
};

export async function recordEvent(input: EventInput): Promise<void> {
  try {
    await AnalyticsEvent.create({
      type: input.type,
      orderId: input.orderId,
      productId: input.productId,
      pseudonym: input.pseudonym ? sha256(input.pseudonym).slice(0, 24) : undefined,
      metadata: input.metadata,
      dedupeKey: input.dedupeKey,
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 11000) {
      logger.warn({ event: 'analytics_write_failed', code }, 'Event analitik tidak tercatat.');
    }
  }
}

export function recordOrderTransition(type: EventType, orderId: string, metadata?: EventInput['metadata']): Promise<void> {
  return recordEvent({ type, orderId, metadata, dedupeKey: `${type}:${orderId}` });
}
