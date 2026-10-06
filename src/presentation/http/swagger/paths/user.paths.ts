import { API_BASE_PATH } from '@/config/constants';
import { registry, clientHeadersSchema, errorResponse, jsonResponse, secured } from '../registry';
import { z } from '../../schemas/zod';
import { listUsersQuerySchema, userIdParamsSchema } from '../../schemas/user.schema';
import { publicUserSchema, successEnvelope, paginationMetaSchema } from '../../schemas/response.schema';

const userData = z.object({ user: publicUserSchema });
const usersListData = z.object({ items: z.array(publicUserSchema) });

registry.registerPath({
  method: 'get',
  path: `${API_BASE_PATH}/users/me`,
  tags: ['Users'],
  summary: 'Get current user profile',
  security: secured,
  request: { headers: clientHeadersSchema },
  responses: {
    200: jsonResponse(successEnvelope(userData, 'MeResponse'), 'User fetched'),
    401: errorResponse('AUTH_TOKEN_MISSING | AUTH_TOKEN_INVALID'),
    404: errorResponse('USER_NOT_FOUND'),
  },
});

registry.registerPath({
  method: 'get',
  path: `${API_BASE_PATH}/users/{id}`,
  tags: ['Users'],
  summary: 'Get user by id (admin or self)',
  security: secured,
  request: { headers: clientHeadersSchema, params: userIdParamsSchema },
  responses: {
    200: jsonResponse(successEnvelope(userData, 'UserByIdResponse'), 'User fetched'),
    400: errorResponse('UUID_INVALID | HEADER_*_INVALID'),
    401: errorResponse('AUTH_TOKEN_MISSING | AUTH_TOKEN_INVALID'),
    403: errorResponse('AUTH_FORBIDDEN'),
    404: errorResponse('USER_NOT_FOUND'),
  },
});

registry.registerPath({
  method: 'get',
  path: `${API_BASE_PATH}/users`,
  tags: ['Users'],
  summary: 'List users (admin only)',
  security: secured,
  request: { headers: clientHeadersSchema, query: listUsersQuerySchema },
  responses: {
    200: jsonResponse(
      z.object({ success: z.literal(true), message: z.string(), data: usersListData, meta: paginationMetaSchema }),
      'Users listed'
    ),
    400: errorResponse('LIMIT_INVALID | PAGE_INVALID | HEADER_*_INVALID'),
    401: errorResponse('AUTH_TOKEN_MISSING | AUTH_TOKEN_INVALID'),
    403: errorResponse('AUTH_FORBIDDEN'),
  },
});
