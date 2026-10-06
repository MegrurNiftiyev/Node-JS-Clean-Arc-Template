import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors';
export const notFound: RequestHandler = () => { throw new AppError('ROUTE_NOT_FOUND'); };
