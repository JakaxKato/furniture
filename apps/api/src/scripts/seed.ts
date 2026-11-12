import { connectDb, disconnectDb } from '../db';
import { seedDemoData, DEMO_PASSWORDS } from '../seed/demo';
import { env } from '../config/env';
import { logger } from '../lib/logger';

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Seed demo tidak boleh dijalankan di produksi.');
  }
  if (!env.MFA_ENCRYPTION_KEY) {
    logger.warn(
      'MFA_ENCRYPTION_KEY kosong: akun admin demo tidak dibuat. Isi variabel ini lalu jalankan seed ulang untuk menguji panel admin.',
    );
  }
  await connectDb();
  try {
    const result = await seedDemoData();
    logger.info(
      {
        products: result.products,
        zones: result.zones,
        adminMfaEnabled: result.adminMfaEnabled,
      },
      'seed_completed',
    );
    const lines = [
      '',
      'Data demo dibuat ulang. Kredensial demo (jangan dipakai di produksi):',
      `Pelanggan: pelanggan@teduh.example / ${DEMO_PASSWORDS.customer}`,
    ];
    if (result.adminMfaEnabled && result.adminMfaSecret) {
      lines.push(
        `Admin: admin@teduh.example / ${DEMO_PASSWORDS.admin}`,
        `TOTP admin demo: ${result.adminMfaSecret}`,
        'otpauth: otpauth://totp/Teduh%20Admin?secret=' + result.adminMfaSecret,
      );
    } else {
      lines.push('Admin demo tidak dibuat karena MFA_ENCRYPTION_KEY kosong.');
    }
    lines.push('');
    process.stdout.write(lines.join('\n'));
  } finally {
    await disconnectDb();
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'seed_failed');
  process.exit(1);
});
