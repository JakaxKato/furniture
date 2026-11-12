import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

function loadDotEnv(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        process.loadEnvFile(file);
      } catch {
        // Environment may already be populated; ignore parse issues here.
      }
      return;
    }
  }
}

if (!process.env.VITEST) loadDotEnv();

const boolFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    APP_ORIGIN: z.string().url().default('http://localhost:5173'),
    SITE_URL: z.string().url().default('http://localhost:5173'),
    ALLOWED_ORIGINS: z.string().optional(),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    DEMO_MODE: boolFromString.default(true),
    MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27018/teduh?replicaSet=rs0'),
    MONGODB_DB: z.string().min(1).default('teduh'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    COOKIE_SECURE: boolFromString.default(false),
    COOKIE_NAME: z.string().min(1).default('teduh_sid'),
    MFA_ENCRYPTION_KEY: z.string().optional(),
    PAYMENT_ADAPTER: z.enum(['simulation', 'midtrans']).default('simulation'),
    MIDTRANS_SERVER_KEY: z.string().optional(),
    MIDTRANS_CLIENT_KEY: z.string().optional(),
    MIDTRANS_IS_PRODUCTION: boolFromString.default(false),
    MIDTRANS_API_BASE: z.string().url().default('https://api.sandbox.midtrans.com'),
    MIDTRANS_SNAP_API_BASE: z.string().url().default('https://app.sandbox.midtrans.com'),
    MIDTRANS_ALLOWED_REDIRECT_HOSTS: z
      .string()
      .default('app.sandbox.midtrans.com'),
    SNAP_EXPIRY_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
    PAYMENT_METHOD_WINDOW_MINUTES: z.coerce.number().int().min(5).max(10080).default(1440),
    RESERVATION_MINUTES: z.coerce.number().int().min(5).max(10080).default(1440),
    RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(120),
    PAYMENT_CHANNELS: z.string().default(''),
    CARD_PAYMENT_ENABLED: boolFromString.default(false),
    EMAIL_MODE: z.enum(['file', 'memory', 'disabled']).default('file'),
    MAIL_DIR: z.string().default('var/mail'),
    MAIL_FROM: z.string().default('Teduh <no-reply@teduh.example>'),
    RATE_LIMIT_DISABLED: boolFromString.default(false),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.PAYMENT_ADAPTER === 'simulation') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_ADAPTER'],
        message: 'Adapter simulasi ditolak saat startup produksi.',
      });
    }
    if (value.NODE_ENV === 'production' && value.PAYMENT_ADAPTER === 'midtrans' && !value.MIDTRANS_SERVER_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['MIDTRANS_SERVER_KEY'],
        message: 'MIDTRANS_SERVER_KEY wajib untuk adapter Midtrans di produksi.',
      });
    }
    if (value.NODE_ENV === 'production' && value.COOKIE_SECURE !== true) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Cookie Secure wajib di produksi.',
      });
    }
    if (value.NODE_ENV === 'production' && !value.APP_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'APP_ORIGIN harus HTTPS di produksi.',
      });
    }
    if (value.NODE_ENV === 'production' && !value.SITE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SITE_URL'],
        message: 'SITE_URL harus HTTPS di produksi.',
      });
    }
    if (value.NODE_ENV === 'production' && value.EMAIL_MODE === 'file') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_MODE'],
        message: 'Email mode file tidak boleh dipakai di produksi. Gunakan penyedia email.',
      });
    }
    if (value.NODE_ENV === 'production' && !value.MFA_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['MFA_ENCRYPTION_KEY'],
        message: 'MFA_ENCRYPTION_KEY wajib di produksi.',
      });
    }
    if (value.MFA_ENCRYPTION_KEY) {
      const decoded = Buffer.from(value.MFA_ENCRYPTION_KEY, 'base64');
      if (decoded.length !== 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['MFA_ENCRYPTION_KEY'],
          message: 'MFA_ENCRYPTION_KEY harus 32 byte dalam base64.',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Konfigurasi environment tidak valid: ${details}`);
  }
  return result.data;
}

export const env = parseEnv();

export function allowedOrigins(): string[] {
  const extra = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([env.APP_ORIGIN, ...extra]));
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}
