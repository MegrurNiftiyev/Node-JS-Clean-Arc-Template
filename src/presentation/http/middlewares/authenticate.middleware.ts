import type { Request, RequestHandler } from 'express';
import { AppError } from '@/shared/errors';
import { COOKIE_NAMES } from '@/config/constants';
import type { TokenService } from '@/application/ports/token-service.port';
import { ctxOf } from './client-context.middleware';

const bearer = (req: Request): string | undefined => {
  const h = req.header('authorization');
  const [scheme, token] = h?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
};

export const createAuthenticate = (tokens: TokenService): RequestHandler => (req, _res, next) => {
  const { platform } = ctxOf(req);
  // Strict source separation: web reads ONLY the HttpOnly cookie, mobile reads ONLY the Authorization header.
  const token = platform === 'web' ? (req.cookies as Record<string, string | undefined> | undefined)?.[COOKIE_NAMES.access] : bearer(req);
  if (!token) throw new AppError('AUTH_TOKEN_MISSING');
  const claims = tokens.verifyAccess(token); // AUTH_TOKEN_INVALID | AUTH_TOKEN_EXPIRED
  req.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
  next();
};
