import { z } from './zod';
import { FULL_NAME_RULES } from '@/config/constants';
import { emailSchema, loginPasswordSchema, newPasswordSchema } from './common.schema';

export const registerBodySchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  fullName: z.string({ required_error: 'FIELD_REQUIRED' }).trim()
    .min(FULL_NAME_RULES.min, 'FULL_NAME_TOO_SHORT').max(FULL_NAME_RULES.max, 'FULL_NAME_TOO_LONG')
    .openapi({ example: 'Selim Aliyev' }),
}).strict();

export const loginBodySchema = z.object({ email: emailSchema, password: loginPasswordSchema }).strict();

/** Mobile sends the token in the body; web uses the HttpOnly cookie and sends no body. */
export const refreshBodySchema = z.object({ refreshToken: z.string().min(1, 'TOKEN_REQUIRED').optional() }).strict().optional();
export const logoutBodySchema = refreshBodySchema;

export const forgotPasswordBodySchema = z.object({ email: emailSchema }).strict();

export const verifyOtpBodySchema = z.object({
  email: emailSchema,
  code: z.string({ required_error: 'FIELD_REQUIRED' }).regex(/^\d{6}$/, 'OTP_FORMAT_INVALID').openapi({ example: '123456' }),
}).strict();

export const changePasswordBodySchema = z.object({
  resetToken: z.string({ required_error: 'TOKEN_REQUIRED' }).min(1, 'TOKEN_REQUIRED'),
  newPassword: newPasswordSchema,
}).strict();

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
