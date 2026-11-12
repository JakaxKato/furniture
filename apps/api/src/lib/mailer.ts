import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from '../config/env';
import { randomId } from './crypto';

export type OutboxMessage = {
  to: string;
  subject: string;
  text: string;
  createdAt: Date;
};

const memoryOutbox: OutboxMessage[] = [];

export function getMailOutbox(): OutboxMessage[] {
  return [...memoryOutbox];
}

export function clearMailOutbox(): void {
  memoryOutbox.length = 0;
}

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
  const resetUrl = `${env.APP_ORIGIN}/reset-kata-sandi?token=${encodeURIComponent(token)}`;
  const subject = 'Atur ulang kata sandi Teduh';
  const text = [
    `Halo ${name},`,
    '',
    'Kami menerima permintaan mengatur ulang kata sandi untuk akun ini.',
    `Tautan berlaku 30 menit dan hanya dapat dipakai sekali: ${resetUrl}`,
    '',
    'Abaikan email ini jika kamu tidak meminta pengaturan ulang.',
  ].join('\n');

  if (env.EMAIL_MODE === 'disabled') return;
  if (env.EMAIL_MODE === 'memory') {
    memoryOutbox.push({ to, subject, text, createdAt: new Date() });
    return;
  }
  const dir = resolve(process.cwd(), env.MAIL_DIR);
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, `reset-${Date.now()}-${randomId(4)}.txt`);
  await writeFile(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`, { encoding: 'utf8', mode: 0o600 });
}
