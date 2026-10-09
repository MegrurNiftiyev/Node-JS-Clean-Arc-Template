import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Request } from 'express';
import type { Container } from '@/container';
import { AppError } from '@/shared/errors';
import { API_BASE_PATH, JSON_BODY_LIMIT } from '@/config/constants';
import { clientContext } from '@/presentation/http/middlewares/client-context.middleware';
import { enforceJson } from '@/presentation/http/middlewares/enforce-json.middleware';
import { noStore } from '@/presentation/http/middlewares/no-store.middleware';
import { createLimiters } from '@/presentation/http/middlewares/rate-limit.middleware';
import { notFound } from '@/presentation/http/middlewares/not-found.middleware';
import { errorHandler } from '@/presentation/http/middlewares/error-handler.middleware';
import { buildApiRouter } from '@/presentation/http/routes';
import { buildHealthRouter } from '@/presentation/http/routes/health.routes';
import { mountSwagger } from '@/presentation/http/swagger/setup';

export function createApp(c: Container): Express {
  const { env } = c;
  const app = express();
  const limiters = createLimiters(env);

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(pinoHttp({ logger: c.logger }));
  mountSwagger(app, env);
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => (!origin || env.CORS_ORIGINS.includes(origin) ? cb(null, true) : cb(new AppError('CORS_ORIGIN_NOT_ALLOWED'))),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform', 'X-Language', 'X-Region'],
    maxAge: 600,
  }));
  app.use(limiters.global);
  app.use(noStore);

  app.use('/health', buildHealthRouter());
  app.use(API_BASE_PATH, clientContext, express.json({ limit: JSON_BODY_LIMIT, strict: true }), cookieParser(), enforceJson, buildApiRouter(c, limiters));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
