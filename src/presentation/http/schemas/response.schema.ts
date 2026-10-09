import { z } from './zod';
import { ERROR_CODES } from '@/shared/errors';
import { ROLES } from '@/domain/enums/role';

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('PublicUser');

export const tokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string() }).openapi('Tokens');

export const successEnvelope = <T extends z.ZodTypeAny>(data: T, name: string) =>
  z.object({ success: z.literal(true), message: z.string(), data }).openapi(name);

export const paginationMetaSchema = z.object({
  page: z.number().int(), limit: z.number().int(), total: z.number().int(), totalPages: z.number().int(),
}).openapi('PaginationMeta');

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  })
}).openapi('ErrorResponse');
