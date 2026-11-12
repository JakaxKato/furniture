import crypto from 'node:crypto';

export function assertRupiah(value: number, label = 'Nominal'): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} harus bilangan bulat Rupiah yang tidak negatif.`);
  }
  return value;
}

export function rupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function orderNumber(now = new Date()): string {
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += alphabet[bytes[i]! % alphabet.length];
  return `TDH-${y}${m}${d}-${suffix}`;
}
