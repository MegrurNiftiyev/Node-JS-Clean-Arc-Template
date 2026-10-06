import pino, { type Logger } from 'pino';
import type { Env } from '@/config/env';

export function createLogger(env: Env): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.newPassword',
        '*.accessToken',
        '*.refreshToken',
        '*.resetToken',
        '*.code',
      ],
      censor: '[REDACTED]',
    },
    ...(env.IS_PRODUCTION ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
  });
}
