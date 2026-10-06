import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '../schemas/zod';
import { SUPPORTED_LANGUAGES } from '@/shared/i18n/languages';
import { PLATFORMS } from '@/domain/enums/platform';
import { errorEnvelopeSchema } from '../schemas/response.schema';
import type { ZodTypeAny } from 'zod';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Mobile clients: Authorization: Bearer <accessToken>' });
registry.registerComponent('securitySchemes', 'cookieAuth', { type: 'apiKey', in: 'cookie', name: 'access_token', description: 'Web clients: HttpOnly cookie set by login/register/refresh' });

/** Required on every /api/v1 route. */
export const clientHeadersSchema = z.object({
  'X-Platform': z.enum(PLATFORMS).openapi({ description: 'web → tokens in HttpOnly cookies; mobile → tokens in body' }),
  'X-Language': z.enum(SUPPORTED_LANGUAGES).openapi({ description: 'Language of all messages' }),
  'X-Region': z.string().length(2).optional().openapi({ example: 'AZ', description: 'ISO 3166-1 alpha-2 (optional)' }),
});

export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorEnvelopeSchema } },
});

export const jsonResponse = (schema: ZodTypeAny, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export const secured: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieAuth: [] }];
