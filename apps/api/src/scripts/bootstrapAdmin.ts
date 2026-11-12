import { authenticator } from 'otplib';
import { connectDb, disconnectDb } from '../db';
import { env } from '../config/env';
import { encryptSecret } from '../lib/crypto';
import { hashPassword } from '../lib/authCrypto';
import { AppError } from '../lib/errors';
import { AuditLog, User } from '../models';

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = (process.env.ADMIN_NAME ?? 'Admin Utama').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'BOOTSTRAP_INPUT', 'ADMIN_EMAIL wajib diisi dengan email valid.');
  }
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new AppError(400, 'BOOTSTRAP_INPUT', 'ADMIN_PASSWORD minimal 12 karakter dan memuat huruf serta angka.');
  }
  if (!env.MFA_ENCRYPTION_KEY) {
    throw new AppError(400, 'BOOTSTRAP_INPUT', 'MFA_ENCRYPTION_KEY wajib diisi sebelum bootstrap admin.');
  }
  await connectDb();
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      throw new AppError(409, 'ADMIN_EXISTS', 'Email sudah dipakai. Bootstrap hanya untuk admin pertama.');
    }
    const secret = authenticator.generateSecret();
    const passwordHash = await hashPassword(password);
    const user = await User.create({
      email,
      name,
      passwordHash,
      role: 'super_admin',
      mfaEnabled: true,
      mfaSecret: encryptSecret(secret),
    });
    await AuditLog.create({
      actorEmail: 'bootstrap',
      action: 'admin.bootstrap',
      targetType: 'user',
      targetId: String(user._id),
      summary: `Membuat admin pertama ${email}.`,
    });
    const otpauth = authenticator.keyuri(email, 'Teduh Admin', secret);
    process.stdout.write(
      [
        'Admin pertama dibuat.',
        `Email: ${email}`,
        `MFA secret: ${secret}`,
        `otpauth: ${otpauth}`,
        'Simpan secret ini di aplikasi autentikator. Secret tidak ditulis ke log aplikasi.',
        '',
      ].join('\n'),
    );
  } finally {
    await disconnectDb();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Bootstrap gagal.'}\n`);
  process.exit(1);
});
