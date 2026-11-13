import { connectDb, disconnectDb } from "../db";
import { env } from "../config/env";
import { upgradeCollection } from "../seed/upgradeCollection";

async function main() {
  if (env.NODE_ENV === "production" || !env.DEMO_MODE)
    throw new Error("Pembaruan katalog ini hanya untuk lingkungan demo.");
  await connectDb();
  try {
    process.stdout.write(JSON.stringify(await upgradeCollection()) + "\n");
  } finally {
    await disconnectDb();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
