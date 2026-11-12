import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const uriFile = resolve(process.cwd(), 'tests/.mongo-uri');

export default async function globalSetup(): Promise<() => Promise<void>> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await writeFile(uriFile, replSet.getUri(), 'utf8');
  return async () => {
    await replSet.stop().catch(() => undefined);
    await rm(uriFile, { force: true }).catch(() => undefined);
  };
}
