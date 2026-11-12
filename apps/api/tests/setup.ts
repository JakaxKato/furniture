import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.VITEST = '1';
process.env.NODE_ENV = 'test';
process.env.MONGODB_DB = 'teduh_test';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.SITE_URL = 'http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.PAYMENT_ADAPTER = 'simulation';
process.env.MIDTRANS_SERVER_KEY = 'test-server-key';
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.EMAIL_MODE = 'memory';
process.env.DEMO_MODE = 'true';
process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.RECONCILE_INTERVAL_SECONDS = '3600';

const uri = readFileSync(resolve(process.cwd(), 'tests/.mongo-uri'), 'utf8').trim();
if (!uri) throw new Error('URI MongoDB uji tidak tersedia. Jalankan melalui Vitest.');
process.env.MONGODB_URI = uri;

const mongoose = await import('mongoose');
await mongoose.connect(uri, {
  dbName: process.env.MONGODB_DB,
  autoIndex: true,
  serverSelectionTimeoutMS: 15_000,
});
