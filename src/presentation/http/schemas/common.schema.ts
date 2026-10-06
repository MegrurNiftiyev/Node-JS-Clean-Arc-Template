import { z } from './zod';
import { PASSWORD_RULES } from '@/config/constants';

export const emailSchema = z
  .string({ required_error: 'FIELD_REQUIRED', invalid_type_error: 'FIELD_INVALID_TYPE' })
  .trim().toLowerCase().max(254, 'EMAIL_INVALID').email('EMAIL_INVALID')
  .openapi({ example: 'user@example.com' });

/** Policy applied on register and change-password. */
export const newPasswordSchema = z
  .string({ required_error: 'FIELD_REQUIRED', invalid_type_error: 'FIELD_INVALID_TYPE' })
  .min(PASSWORD_RULES.min, 'PASSWORD_TOO_SHORT')
  .max(PASSWORD_RULES.max, 'PASSWORD_TOO_LONG')
  .regex(/[A-Za-z]/, 'PASSWORD_WEAK')
  .regex(/\d/, 'PASSWORD_WEAK')
  .openapi({ example: 'StrongPass123', minLength: 8, maxLength: 72 });

/** Login: no policy check (do not leak the policy / do not lock out legacy passwords). */
export const loginPasswordSchema = z
  .string({ required_error: 'FIELD_REQUIRED', invalid_type_error: 'FIELD_INVALID_TYPE' })
  .min(1, 'FIELD_REQUIRED').max(PASSWORD_RULES.max, 'PASSWORD_TOO_LONG')
  .openapi({ example: 'StrongPass123' });

export const uuidSchema = z.string({ required_error: 'FIELD_REQUIRED' }).uuid('UUID_INVALID');
