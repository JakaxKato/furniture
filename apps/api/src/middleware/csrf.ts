import type { NextFunction, Request, Response } from 'express';
import { allowedOrigins } from '../config/env';
import { AppError } from '../lib/errors';
import { CSRF_COOKIE, CSRF_HEADER, csrfHash } from '../lib/authCrypto';
import { safeStringEqual, timingSafeEqualHex } from '../lib/crypto';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function originAndCsrf(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) return next();
  if (req.path.startsWith('/webhooks/')) return next();

  const origin = req.get('origin');
  if (!origin || !allowedOrigins().includes(origin)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Origin permintaan tidak diizinkan.'));
  }
  const header = req.get(CSRF_HEADER) ?? '';
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const tokenPattern = /^[A-Za-z0-9_-]{32,86}$/;
  if (!cookie || !header || !tokenPattern.test(cookie) || !tokenPattern.test(header)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Token CSRF tidak valid.'));
  }
  if (!safeStringEqual(cookie, header)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Token CSRF tidak cocok.'));
  }
  if (req.auth && !timingSafeEqualHex(csrfHash(cookie), req.auth.session.csrfTokenHash)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Token CSRF tidak terikat ke sesi ini.'));
  }
  res.setHeader('Vary', 'Origin');
  next();
}
