import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors';
import type { Role } from '@/domain/enums/role';

export const authorize = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.auth) throw new AppError('AUTH_TOKEN_MISSING');
  if (!roles.includes(req.auth.role)) throw new AppError('AUTH_FORBIDDEN');
  next();
};
