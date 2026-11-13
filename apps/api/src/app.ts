import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { allowedOrigins, env } from './config/env';
import { AppError } from './lib/errors';
import { logger } from './lib/logger';
import { loadAuth } from './middleware/auth';
import { originAndCsrf } from './middleware/csrf';
import { adminRouter } from './modules/admin';
import { experienceRouter } from './modules/experience';
import { analyticsRouter } from './modules/analyticsRoutes';
import { authRouter } from './modules/auth';
import { catalogRouter, storeRouter } from './modules/catalogRoutes';
import { checkoutRouter, ordersRouter } from './modules/orderRoutes';
import { simulationRouter, webhookRouter } from './modules/paymentRoutes';
import { setGateway, type PaymentGateway } from './modules/paymentGateway';
import { productPageHandler, robotsHandler, sitemapHandler } from './modules/seo';

export type AppOptions = {
  gateway?: PaymentGateway;
};

export function createApp(options: AppOptions = {}): express.Express {
  if (options.gateway) setGateway(options.gateway);
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                fontSrc: ["'self'"],
                connectSrc: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                upgradeInsecureRequests: [],
              },
            }
          : false,
      crossOriginEmbedderPolicy: false,
      hsts:
        env.NODE_ENV === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
          : false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('x-request-id', req.requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1_000_000;
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(ms),
        },
        'http_request',
      );
    });
    next();
  });
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowedOrigins().includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use('/api/v1', loadAuth);
  app.use('/api/v1', originAndCsrf);

  app.get('/api/v1/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ ok: up, db: up ? 'up' : 'down' });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/store', storeRouter);
  app.use('/api/v1/products', catalogRouter);
  app.use('/api/v1/checkout', checkoutRouter);
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/payments/simulation', simulationRouter);
  app.use('/api/v1/webhooks', webhookRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/experience', experienceRouter);

  app.use('/api', (_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.'));
  });

  app.get('/sitemap.xml', (req, res, next) => {
    void sitemapHandler(req, res, next);
  });
  app.get('/robots.txt', robotsHandler);

  const webDist = resolve(__dirname, '../../web/dist');
  if (existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${resolve(webDist, 'assets')}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('/produk/:slug', (req, res, next) => {
      void productPageHandler(req, res, next);
    });
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(resolve(webDist, 'index.html'));
    });
  }

  app.use((_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Halaman tidak ditemukan.'));
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const httpError = error as { status?: number; type?: string };
    if (httpError?.status === 413) {
      res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ukuran permintaan melebihi batas.' },
        requestId: req.requestId,
      });
      return;
    }
    if (error instanceof SyntaxError && httpError?.status === 400) {
      res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Format JSON tidak valid.' },
        requestId: req.requestId,
      });
      return;
    }
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data permintaan tidak valid.',
          details: error.flatten(),
        },
        requestId: req.requestId,
      });
      return;
    }
    if (error instanceof AppError) {
      if (error.status >= 500) {
        logger.error(
          { requestId: req.requestId, code: error.code, message: error.message },
          'application_error',
        );
      }
      res.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details },
        requestId: req.requestId,
      });
      return;
    }
    const mongoError = error as { code?: number };
    if (mongoError?.code === 11000) {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'Data bertentangan dengan catatan yang ada.' },
        requestId: req.requestId,
      });
      return;
    }
    logger.error(
      {
        requestId: req.requestId,
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
      },
      'unhandled_error',
    );
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan. Coba lagi.' },
      requestId: req.requestId,
    });
  });

  return app;
}
