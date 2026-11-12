import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import {
  CSRF_COOKIE,
  csrfHash,
  clearSessionCookies,
  dummyPasswordCheck,
  hashPassword,
  newSessionMaterial,
  requireMfaEncryptionKey,
  setCsrfCookie,
  setSessionCookies,
  verifyPassword,
  verifyTotp,
} from '../lib/authCrypto';
import { randomToken, sha256 } from '../lib/crypto';
import { enforceRateLimit } from '../lib/rateLimit';
import { logger } from '../lib/logger';
import { sendPasswordResetEmail } from '../lib/mailer';
import { asyncHandler } from '../middleware/async';
import { clientIp, isAdminRole, requireAuth } from '../middleware/auth';
import { PasswordResetToken, Session, User, type Role } from '../models';

export const authRouter = Router();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Format email tidak valid.');
const passwordSchema = z
  .string()
  .min(10, 'Kata sandi minimal 10 karakter.')
  .max(128)
  .regex(/[A-Za-z]/, 'Kata sandi harus memuat huruf.')
  .regex(/[0-9]/, 'Kata sandi harus memuat angka.');
const totpSchema = z.string().trim().regex(/^\d{6}$/, 'Kode MFA harus 6 digit.').optional();

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{8,20}$/, 'Format nomor telepon tidak valid.')
      .optional(),
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    totp: totpSchema,
  })
  .strict();

const forgotSchema = z.object({ email: emailSchema }).strict();
const resetSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
  })
  .strict();

function userDto(user: { _id: unknown; email: string; name: string; role: Role; phone?: string | null }) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone ?? null,
  };
}

async function issueCsrf(req: Request, res: Response): Promise<string> {
  const existing = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (existing && /^[A-Za-z0-9_-]{32,86}$/.test(existing)) {
    if (req.auth) {
      if (req.auth.session.csrfTokenHash !== csrfHash(existing)) {
        await Session.updateOne({ _id: req.auth.session._id }, { $set: { csrfTokenHash: csrfHash(existing) } });
      }
    }
    return existing;
  }
  const token = randomToken(32);
  const expiresAt = req.auth?.session.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (req.auth) {
    await Session.updateOne({ _id: req.auth.session._id }, { $set: { csrfTokenHash: csrfHash(token) } });
  }
  setCsrfCookie(res, token, expiresAt);
  return token;
}

async function createSession(
  req: Request,
  res: Response,
  user: { _id: unknown; role: Role },
  mfaVerified: boolean,
): Promise<string> {
  const admin = isAdminRole(user.role);
  const hours = admin ? 8 : env.SESSION_TTL_HOURS;
  const material = newSessionMaterial(hours);
  const oldToken = req.cookies?.[env.COOKIE_NAME] as string | undefined;
  if (oldToken) {
    await Session.updateOne(
      { tokenHash: sha256(oldToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  }
  await Session.create({
    tokenHash: sha256(material.token),
    userId: user._id,
    csrfTokenHash: csrfHash(material.csrfToken),
    mfaVerified,
    ipHash: sha256(clientIp(req)),
    userAgent: req.get('user-agent')?.slice(0, 300),
    expiresAt: material.expiresAt,
  });
  setSessionCookies(res, material);
  return material.csrfToken;
}

authRouter.get(
  '/csrf',
  asyncHandler(async (req, res) => {
    const csrfToken = await issueCsrf(req, res);
    res.json({ csrfToken });
  }),
);

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const csrfToken = await issueCsrf(req, res);
    res.json({
      user: req.auth ? userDto(req.auth.user) : null,
      csrfToken,
      mfaVerified: req.auth?.session.mfaVerified ?? false,
    });
  }),
);

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    await enforceRateLimit({
      prefix: 'register',
      identifier: clientIp(req),
      limit: 10,
      windowSeconds: 3600,
    });
    const body = registerSchema.parse(req.body);
    const existing = await User.findOne({ email: body.email });
    if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Email sudah terdaftar.');
    const passwordHash = await hashPassword(body.password);
    const user = await User.create({
      email: body.email,
      name: body.name,
      phone: body.phone,
      passwordHash,
      role: 'customer',
    });
    const csrfToken = await createSession(req, res, user, false);
    res.status(201).json({ user: userDto(user), csrfToken, mfaVerified: false });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    await enforceRateLimit({ prefix: 'login-ip', identifier: clientIp(req), limit: 20, windowSeconds: 900 });
    await enforceRateLimit({ prefix: 'login-email', identifier: body.email, limit: 10, windowSeconds: 900 });
    const user = await User.findOne({ email: body.email }).select('+passwordHash +mfaSecret');
    if (!user || user.status !== 'active') {
      await dummyPasswordCheck(body.password);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.');
    }
    const valid = await verifyPassword(user.passwordHash, body.password);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.');

    let mfaVerified = false;
    if (isAdminRole(user.role)) {
      if (!user.mfaEnabled || !user.mfaSecret) {
        throw new AppError(403, 'ADMIN_MFA_NOT_ENABLED', 'Akun admin belum memiliki MFA. Hubungi operator.');
      }
      if (!body.totp) throw new AppError(401, 'MFA_REQUIRED', 'Kode MFA diperlukan untuk akun admin.');
      requireMfaEncryptionKey();
      if (!verifyTotp(body.totp, user.mfaSecret)) {
        throw new AppError(401, 'MFA_INVALID', 'Kode MFA salah atau kedaluwarsa.');
      }
      mfaVerified = true;
    }
    const csrfToken = await createSession(req, res, user, mfaVerified);
    res.json({ user: userDto(user), csrfToken, mfaVerified });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;
    if (token) {
      await Session.updateOne(
        { tokenHash: sha256(token), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
    }
    clearSessionCookies(res);
    res.status(204).end();
  }),
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const body = forgotSchema.parse(req.body);
    await enforceRateLimit({ prefix: 'forgot-ip', identifier: clientIp(req), limit: 10, windowSeconds: 3600 });
    await enforceRateLimit({ prefix: 'forgot-email', identifier: body.email, limit: 5, windowSeconds: 3600 });
    const user = await User.findOne({ email: body.email, status: 'active' });
    if (user) {
      await PasswordResetToken.deleteMany({ userId: user._id, usedAt: { $exists: false } });
      const token = randomToken(32);
      await PasswordResetToken.create({
        userId: user._id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      try {
        await sendPasswordResetEmail(user.email, user.name, token);
      } catch (error) {
        logger.error({ err: error, event: 'password_reset_email_failed' }, 'Gagal mengirim email reset.');
      }
    }
    res.status(204).end();
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = resetSchema.parse(req.body);
    await enforceRateLimit({ prefix: 'reset-ip', identifier: clientIp(req), limit: 10, windowSeconds: 3600 });
    const record = await PasswordResetToken.findOne({
      tokenHash: sha256(body.token),
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!record) {
      throw new AppError(400, 'RESET_INVALID', 'Tautan reset tidak valid atau sudah kedaluwarsa.');
    }
    const user = await User.findOne({ _id: record.userId, status: 'active' });
    if (!user) throw new AppError(400, 'RESET_INVALID', 'Tautan reset tidak valid atau sudah kedaluwarsa.');
    const passwordHash = await hashPassword(body.password);
    record.usedAt = new Date();
    await record.save();
    user.passwordHash = passwordHash;
    await user.save();
    await Session.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    clearSessionCookies(res);
    res.status(204).end();
  }),
);

authRouter.get(
  '/session-check',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: userDto(req.auth!.user), mfaVerified: req.auth!.session.mfaVerified });
  }),
);
