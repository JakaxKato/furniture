import argon2 from 'argon2';
import type { Response } from 'express';
import { authenticator } from 'otplib';
import { env } from '../config/env';
import { decryptSecret, randomToken, sha256 } from './crypto';
import { AppError } from './errors';

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

let dummyHashPromise: Promise<string> | null = null;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function dummyPasswordCheck(password: string): Promise<void> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('placeholder-timing-equalizer');
  await verifyPassword(await dummyHashPromise, password);
}

export const SESSION_COOKIE = env.COOKIE_NAME;
export const CSRF_COOKIE = 'teduh_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export type SessionMaterial = {
  token: string;
  csrfToken: string;
  expiresAt: Date;
};

export function newSessionMaterial(hours: number): SessionMaterial {
  return {
    token: randomToken(32),
    csrfToken: randomToken(32),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
  };
}

export function setSessionCookies(res: Response, material: SessionMaterial): void {
  const secure = env.NODE_ENV === 'production' || env.COOKIE_SECURE;
  res.cookie(SESSION_COOKIE, material.token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: material.expiresAt,
  });
  res.cookie(CSRF_COOKIE, material.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: material.expiresAt,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function setCsrfCookie(res: Response, token: string, expiresAt: Date): void {
  const secure = env.NODE_ENV === 'production' || env.COOKIE_SECURE;
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function csrfHash(token: string): string {
  return sha256(token);
}

export function verifyTotp(code: string, encryptedSecret: string): boolean {
  try {
    const secret = decryptSecret(encryptedSecret);
    authenticator.options = { window: 1 };
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

export function requireMfaEncryptionKey(): void {
  if (!env.MFA_ENCRYPTION_KEY) {
    throw new AppError(500, 'MFA_NOT_CONFIGURED', 'MFA_ENCRYPTION_KEY belum diatur.');
  }
}
