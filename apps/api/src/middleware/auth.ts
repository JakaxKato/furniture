import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { sha256 } from '../lib/crypto';
import { SESSION_COOKIE } from '../lib/authCrypto';
import { Session, User, type Role } from '../models';

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export async function loadAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) return next();
    const session = await Session.findOne({
      tokenHash: sha256(token),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!session) return next();
    const user = await User.findOne({ _id: session.userId, status: 'active' });
    if (!user) return next();
    await Session.updateOne(
      { _id: session._id, lastSeenAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } },
      { $set: { lastSeenAt: new Date() } },
    );
    req.auth = { user, session, csrfToken: (req.cookies?.teduh_csrf as string) ?? '' };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new AppError(401, 'UNAUTHORIZED', 'Masuk diperlukan untuk melanjutkan.'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const role = req.auth?.user.role;
  if (!role || role === 'customer') {
    return next(new AppError(403, 'FORBIDDEN', 'Akses admin diperlukan.'));
  }
  if (!req.auth?.session.mfaVerified) {
    return next(new AppError(403, 'MFA_REQUIRED', 'Verifikasi MFA diperlukan.'));
  }
  next();
}

export type Permission =
  | 'catalog:manage'
  | 'inventory:manage'
  | 'shipping:manage'
  | 'orders:read'
  | 'orders:fulfill'
  | 'cases:manage'
  | 'support:manage'
  | 'audit:read';

const PERMISSIONS: Record<Permission, Role[]> = {
  'catalog:manage': ['admin_catalog', 'super_admin'],
  'inventory:manage': ['admin_catalog', 'admin_ops', 'super_admin'],
  'shipping:manage': ['admin_catalog', 'admin_ops', 'super_admin'],
  'orders:read': ['admin_ops', 'admin_finance', 'super_admin'],
  'orders:fulfill': ['admin_ops', 'super_admin'],
  'cases:manage': ['admin_finance', 'super_admin'],
  'support:manage': ['admin_ops', 'admin_finance', 'super_admin'],
  'audit:read': ['super_admin'],
};

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAdmin(req, res, (error?: unknown) => {
      if (error) return next(error);
      const role = req.auth?.user.role;
      if (!role || !PERMISSIONS[permission].includes(role)) {
        return next(new AppError(403, 'FORBIDDEN', 'Hak akses tidak mencukupi.'));
      }
      next();
    });
  };
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role);
}

export function isAdminRole(role: Role): boolean {
  return role !== 'customer';
}

export function allowedRedirectHosts(): string[] {
  return env.MIDTRANS_ALLOWED_REDIRECT_HOSTS.split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function validatePaymentRedirect(url: string, adapter: 'midtrans' | 'simulation'): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(502, 'PAYMENT_LINK_INVALID', 'Tautan pembayaran tidak valid.');
  }
  if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new AppError(502, 'PAYMENT_LINK_INVALID', 'Tautan pembayaran harus HTTPS.');
  }
  if (adapter === 'midtrans') {
    if (parsed.protocol !== 'https:' || !allowedRedirectHosts().includes(parsed.hostname.toLowerCase())) {
      throw new AppError(502, 'PAYMENT_LINK_INVALID', 'Host tautan pembayaran tidak diizinkan.');
    }
  } else {
    if (env.NODE_ENV === 'production') {
      throw new AppError(500, 'SIMULATION_FORBIDDEN', 'Simulasi tidak tersedia di produksi.');
    }
    const allowed = new Set([new URL(env.APP_ORIGIN).hostname, 'localhost', '127.0.0.1']);
    if (!allowed.has(parsed.hostname)) {
      throw new AppError(502, 'PAYMENT_LINK_INVALID', 'Host simulasi tidak diizinkan.');
    }
  }
  return parsed.toString();
}
