import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { Env } from '@/config/env';
import { AppError } from '@/shared/errors';

const make = (windowMs: number, limit: number): RequestHandler =>
  rateLimit({
    windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError('RATE_LIMIT_EXCEEDED')),
  });

export const createLimiters = (env: Env) => ({
  global: make(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX),
  auth: make(env.RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX),
  otp: make(env.RATE_LIMIT_WINDOW_MS, env.OTP_RATE_LIMIT_MAX), // forgot-password + verify-otp
});
export type Limiters = ReturnType<typeof createLimiters>;
