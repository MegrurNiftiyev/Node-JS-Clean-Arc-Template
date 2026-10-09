import type { Request, Response } from 'express';
import { DEFAULT_LANGUAGE } from '@/shared/i18n/languages';
import { translateMessage, type MessageKey } from '@/shared/i18n/translator';
import type { ErrorCode } from '@/shared/errors';

export interface PaginationMeta { page: number; limit: number; total: number; totalPages: number }

export interface SuccessBody<T> { success: true; message: string; data: T; meta?: PaginationMeta }

export interface ErrorBody {
  success: false;
  error: { code: ErrorCode; message: string; details?: { field: string; message: string }[] };
}

export function sendSuccess<T>(
  req: Request,
  res: Response,
  opts: { messageKey: MessageKey; data: T; status?: number; meta?: PaginationMeta },
): void {
  const body: SuccessBody<T> = {
    success: true,
    message: translateMessage(req.ctx?.language ?? DEFAULT_LANGUAGE, opts.messageKey),
    data: opts.data,
    ...(opts.meta ? { meta: opts.meta } : {}),
  };
  res.status(opts.status ?? 200).json(body);
}
