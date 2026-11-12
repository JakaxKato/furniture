import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'password',
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'token',
      'signature_key',
      'serverKey',
      'address',
      'body.address',
      'payload',
    ],
    censor: '[disunting]',
  },
});
