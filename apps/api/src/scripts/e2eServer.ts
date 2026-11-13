/**
 * Server untuk tes browser Playwright. Menjalankan MongoDB replica set
 * in-memory, seed demo, lalu API pada port 4100. Tidak untuk produksi.
 */
async function main(): Promise<void> {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri();

  process.env.NODE_ENV = 'test';
  process.env.VITEST = '1';
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = 'teduh_e2e';
  process.env.PORT = '4100';
  process.env.APP_ORIGIN = 'http://localhost:4100';
  process.env.SITE_URL = 'http://localhost:4100';
  process.env.COOKIE_SECURE = 'false';
  process.env.PAYMENT_ADAPTER = 'simulation';
  process.env.RATE_LIMIT_DISABLED = 'true';
  process.env.EMAIL_MODE = 'memory';
  process.env.DEMO_MODE = 'true';
  process.env.MFA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  process.env.RECONCILE_INTERVAL_SECONDS = '3600';

  const mongoose = await import('mongoose');
  const { connectDb, disconnectDb } = await import('../db');
  const { seedDemoData } = await import('../seed/demo');
  const { createApp } = await import('../app');
  const { logger } = await import('../lib/logger');
  logger.level = 'error';
  const { SimulationGateway } = await import('../modules/paymentGateway');
  const { models_ } = await import('../models');

  await connectDb();
  for (const model of Object.values(models_)) {
    await (model as { createIndexes: () => Promise<unknown> }).createIndexes();
  }
  await seedDemoData();
  const app = createApp({ gateway: new SimulationGateway() });
  const server = app.listen(4100, () => {
    process.stdout.write('E2E API siap di http://127.0.0.1:4100\n');
  });

  const shutdown = async () => {
    server.close(async () => {
      await mongoose.disconnect().catch(() => undefined);
      await disconnectDb().catch(() => undefined);
      await replSet.stop().catch(() => undefined);
      process.exit(0);
    });
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  process.stderr.write(`E2E server gagal: ${String(error)}\n`);
  process.exit(1);
});
