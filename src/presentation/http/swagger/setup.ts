import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import type { Env } from '@/config/env';
import { buildOpenApiDocument } from './openapi';

export function mountSwagger(app: Express, env: Env): void {
  if (!env.SWAGGER_ENABLED) return;
  const doc = buildOpenApiDocument();
  // Swagger UI needs inline scripts/styles → relaxed CSP ONLY for the docs routes.
  const docsHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        'upgrade-insecure-requests': null,
      },
    },
  });
  app.get('/api-docs.json', docsHelmet, (_req, res) => { res.json(doc); });
  app.use('/api-docs', docsHelmet, swaggerUi.serve, swaggerUi.setup(doc, { customSiteTitle: 'API Docs' }));
}
