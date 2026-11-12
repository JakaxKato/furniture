import { connectDb, disconnectDb } from '../db';
import { models_ } from '../models';
import { logger } from '../lib/logger';

async function main(): Promise<void> {
  await connectDb();
  try {
    for (const [name, model] of Object.entries(models_)) {
      await (model as { createIndexes: () => Promise<unknown> }).createIndexes();
      logger.info({ model: name }, 'indexes_ready');
    }
    logger.info('Semua indeks berhasil dibuat.');
  } finally {
    await disconnectDb();
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'indexes_failed');
  process.exit(1);
});
