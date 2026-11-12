import { connectDb, disconnectDb } from '../db';
import { reconcileOnce } from '../modules/payments';
import { env } from '../config/env';
import { logger } from '../lib/logger';

async function main(): Promise<void> {
  await connectDb();
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await disconnectDb();
    process.exit(0);
  };
  try {
    do {
      const result = await reconcileOnce();
      logger.info(result, 'reconcile_run');
      if (!process.argv.includes('--loop')) break;
      await new Promise((resolve) => setTimeout(resolve, env.RECONCILE_INTERVAL_SECONDS * 1000));
    } while (!stopped);
  } finally {
    if (!stopped) await stop();
  }
}

main().catch(async (error) => {
  logger.error({ err: error }, 'reconcile_failed');
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
