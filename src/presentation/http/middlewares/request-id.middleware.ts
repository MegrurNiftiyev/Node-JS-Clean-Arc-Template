import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HEADERS } from '@/config/constants';

const VALID = /^[A-Za-z0-9-]{8,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header(HEADERS.requestId);
  req.requestId = incoming && VALID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
