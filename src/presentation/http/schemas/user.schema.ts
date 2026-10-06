import { z } from './zod';
import { PAGINATION } from '@/config/constants';
import { uuidSchema } from './common.schema';

export const userIdParamsSchema = z.object({ id: uuidSchema }).strict();

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int('PAGE_INVALID').min(1, 'PAGE_INVALID').default(PAGINATION.defaultPage),
  limit: z.coerce.number().int('LIMIT_INVALID').min(1, 'LIMIT_INVALID').max(PAGINATION.maxLimit, 'LIMIT_INVALID').default(PAGINATION.defaultLimit),
}).strict();

export type UserIdParams = z.infer<typeof userIdParamsSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
