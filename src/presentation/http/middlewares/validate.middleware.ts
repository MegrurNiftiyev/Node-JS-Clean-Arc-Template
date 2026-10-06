import type { Request, RequestHandler } from 'express';
import type { ZodIssue, ZodTypeAny } from 'zod';
import { AppError, type ErrorDetail } from '@/shared/errors';
import { isValidationKey, type ValidationKey } from '@/shared/i18n/translator';

interface RequestSchemas { params?: ZodTypeAny; query?: ZodTypeAny; body?: ZodTypeAny }

export function toValidationKey(issue: ZodIssue): ValidationKey {
  if (isValidationKey(issue.message)) return issue.message; // schemas use i18n keys as messages
  if (issue.code === 'invalid_type' && issue.received === 'undefined') return 'FIELD_REQUIRED';
  if (issue.code === 'unrecognized_keys') return 'UNKNOWN_FIELDS';
  return 'FIELD_INVALID_TYPE';
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetail[] = [];
    const validated: NonNullable<Request['validated']> = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) validated[part] = result.data as unknown;
      else for (const issue of result.error.issues) {
        const anyIssue = issue as unknown as Record<string, unknown>;
        const keys = Array.isArray(anyIssue.keys) ? anyIssue.keys : [];
        const path = issue.path.length > 0 ? issue.path : keys;
        details.push({ field: [part, ...(path as string[])].join('.'), messageKey: toValidationKey(issue) });
      }
    }
    if (details.length > 0) return next(new AppError('VALIDATION_ERROR', details));
    req.validated = validated;
    next();
  };
}

/** Typed accessors. T MUST be a `z.infer<typeof schema>` exported from the matching schema file. */
export const getBody = <T>(req: Request): T => req.validated?.body as T;
export const getQuery = <T>(req: Request): T => req.validated?.query as T;
export const getParams = <T>(req: Request): T => req.validated?.params as T;
