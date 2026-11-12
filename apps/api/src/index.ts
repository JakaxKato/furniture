import { connectDb, disconnectDb } from './db';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { reconcileOnce } from './modules/payments';

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server_started');
  });

  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const result = await reconcileOnce();
      if (result.attempts > 0 || result.events > 0) {
        logger.info(result, 'reconciliation_run');
      }
    } catch (error) {
      logger.error({ err: error }, 'reconciliation_failed');
    } finally {
      running = false;
    }
  }, env.RECONCILE_INTERVAL_SECONDS * 1000);
  timer.unref();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'server_shutdown');
    clearInterval(timer);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error({ err: error }, 'server_failed');
  process.exit(1);
});
