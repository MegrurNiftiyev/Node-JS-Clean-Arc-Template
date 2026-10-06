import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '../schemas/zod';

import { errorEnvelopeSchema } from '../schemas/response.schema';
import type { ZodTypeAny } from 'zod';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Mobile clients: Authorization: Bearer <accessToken>' });
registry.registerComponent('securitySchemes', 'cookieAuth', { type: 'apiKey', in: 'cookie', name: 'access_token', description: 'Web clients: HttpOnly cookie set by login/register/refresh' });

export const clientHeadersSchema = z.object({});

export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorEnvelopeSchema } },
});

export const jsonResponse = (schema: ZodTypeAny, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export const secured: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieAuth: [] }];
