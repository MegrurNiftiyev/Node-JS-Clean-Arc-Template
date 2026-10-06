import { ERROR_HTTP_STATUS, type ErrorCode } from './error-codes';
import type { ValidationKey } from '../i18n/translator';

export interface ErrorDetail {
  /** Dotted path, e.g. "body.email" or "query.limit" */
  field: string;
  /** i18n key from the "validation" section of the locale files */
  messageKey: ValidationKey;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly isOperational = true;

  constructor(
    public readonly code: ErrorCode,
    public readonly details?: ErrorDetail[],
  ) {
    super(code); // internal message = code; user text always comes from locale files
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
    Error.captureStackTrace?.(this, AppError);
  }
}
