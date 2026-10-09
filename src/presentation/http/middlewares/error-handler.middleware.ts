import type { ErrorRequestHandler, Request } from 'express';
import { AppError } from '@/shared/errors';
import { HEADERS } from '@/config/constants';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/shared/i18n/languages';
import { translateError, translateValidation } from '@/shared/i18n/translator';
import type { ErrorBody } from '../responses';

export const readLanguageLenient = (req: Request): Language => {
  if (req.ctx) return req.ctx.language;
  const raw = req.header(HEADERS.language)?.toLowerCase();
  return isLanguage(raw) ? raw : DEFAULT_LANGUAGE;
};

const toAppError = (err: unknown): AppError => {
  if (err instanceof AppError) return err;
  const type = (err as { type?: string } | null)?.type; // body-parser errors
  if (type === 'entity.parse.failed') return new AppError('MALFORMED_JSON');
  if (type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE');
  return new AppError('INTERNAL_SERVER_ERROR');
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) req.log.error({ err }, 'unhandled error'); // stack stays in logs only
  const lang = readLanguageLenient(req);
  const body: ErrorBody = {
    success: false,
    error: {
      code: appError.code,
      message: translateError(lang, appError.code),
      ...(appError.details ? { details: appError.details.map((d) => ({ field: d.field, message: translateValidation(lang, d.messageKey) })) } : {}),
    },
  };
  res.status(appError.status).json(body); // never include err.message or err.stack
};
