import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors';

const WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

export const enforceJson: RequestHandler = (req, _res, next) => {
  const length = Number(req.header('content-length') ?? 0);
  if (WITH_BODY.has(req.method) && length > 0 && !req.is('application/json')) throw new AppError('UNSUPPORTED_MEDIA_TYPE');
  next();
};
