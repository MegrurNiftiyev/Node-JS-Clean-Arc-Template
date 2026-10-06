import 'dotenv/config';
import { z } from 'zod';

const bool = (fallback: 'true' | 'false') =>
  z.enum(['true', 'false']).default(fallback).transform((v) => v === 'true');

const int = (fallback: number, min = 0) => z.coerce.number().int().min(min).default(fallback);

const secret = z.string().min(32, 'must be at least 32 characters');

const rawSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY: int(0),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean))
      .refine((list) => list.length > 0 && list.every((o) => o !== '*' && URL.canParse(o)), {
        message: 'must be a comma-separated list of absolute origins; "*" is not allowed',
      }),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    SWAGGER_ENABLED: bool('false'),
    DB_DRIVER: z.enum(['memory', 'mongo', 'firebase']).default('memory'),

    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    JWT_RESET_SECRET: secret,
    OTP_HMAC_SECRET: secret,

    ACCESS_TOKEN_TTL_SECONDS: int(900, 60),
    REFRESH_TOKEN_TTL_SECONDS: int(2_592_000, 3600),
    RESET_TOKEN_TTL_SECONDS: int(600, 60),

    OTP_TTL_SECONDS: int(300, 60),
    OTP_MAX_ATTEMPTS: int(5, 1),
    OTP_RESEND_COOLDOWN_SECONDS: int(60, 0),
    OTP_EXPOSE_IN_RESPONSE: bool('false'),

    BCRYPT_COST: int(12, 4),
    COOKIE_DOMAIN: z.string().min(1).optional(),
    RATE_LIMIT_WINDOW_MS: int(900_000, 1000),
    RATE_LIMIT_MAX: int(300, 1),
    AUTH_RATE_LIMIT_MAX: int(30, 1),
    OTP_RATE_LIMIT_MAX: int(5, 1),

    SEED_ADMIN_EMAIL: z.string().email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(8).max(72).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.OTP_EXPOSE_IN_RESPONSE) {
      ctx.addIssue({ code: 'custom', path: ['OTP_EXPOSE_IN_RESPONSE'], message: 'must be false in production' });
    }
    const secrets = [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET, env.JWT_RESET_SECRET, env.OTP_HMAC_SECRET];
    if (new Set(secrets).size !== secrets.length) {
      ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'all four secrets must be different' });
    }
    if (Boolean(env.SEED_ADMIN_EMAIL) !== Boolean(env.SEED_ADMIN_PASSWORD)) {
      ctx.addIssue({ code: 'custom', path: ['SEED_ADMIN_EMAIL'], message: 'set both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD or neither' });
    }
  })
  .transform((env) => ({
    ...env,
    IS_PRODUCTION: env.NODE_ENV === 'production',
    COOKIE_SECURE: env.NODE_ENV === 'production',
  }));

export type Env = z.infer<typeof rawSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    // eslint-disable-next-line no-console -- logger is not available before env is valid
    console.error('Invalid environment configuration:\n' + parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n'));
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
