import { RateLimitBucket } from '../models';
import { sha256 } from './crypto';
import { AppError } from './errors';
import { env } from '../config/env';

type RateLimitArgs = {
  prefix: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

export async function enforceRateLimit({ prefix, identifier, limit, windowSeconds }: RateLimitArgs): Promise<void> {
  if (env.RATE_LIMIT_DISABLED) return;
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const key = `${prefix}:${sha256(identifier)}:${windowStartMs}`;
  const expiresAt = new Date(windowStartMs + windowMs);
  let bucket;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      bucket = await RateLimitBucket.findOneAndUpdate(
        { key },
        {
          $inc: { count: 1 },
          $setOnInsert: { key, windowStart: new Date(windowStartMs), expiresAt },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  if (bucket && bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000));
    throw new AppError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan. Coba lagi nanti.', { retryAfter });
  }
}
