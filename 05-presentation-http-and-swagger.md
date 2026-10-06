# 05 — Presentation Layer (HTTP), Middleware Pipeline, Zod Schemas, Swagger, API Contract

> Prerequisites: files 01–04 completed.
> Creates `src/presentation/http/**`, `src/shared/types/express.d.ts`, `src/app.ts`, `src/server.ts`.
> This layer is the only place that knows about Express. Controllers are thin: read validated input → call one use case → send the envelope.

---

## 1. Middleware pipeline (exact order, never reorder, never skip)

```
 1. app.disable('x-powered-by'); app.set('trust proxy', env.TRUST_PROXY)
 2. requestId            → req.requestId, response header X-Request-Id
 3. pino-http            → structured request logs (redacted)
 4. swagger (/docs, /docs.json)   [only if SWAGGER_ENABLED] — mounted BEFORE global helmet, with its own relaxed CSP
 5. helmet()             → security headers for everything else
 6. cors(allowlist)      → credentials: true, explicit allowedHeaders; origin not allowed → CORS_ORIGIN_NOT_ALLOWED
 7. globalRateLimit      → RATE_LIMIT_MAX per RATE_LIMIT_WINDOW_MS per IP
 8. noStore              → Cache-Control: no-store on every API response
 9. GET /health          → no client headers required
10. app.use('/api/v1',
        clientContext,    → validates X-Platform / X-Language / X-Region → req.ctx  (BEFORE body parsing so parse errors are localized)
        express.json({ limit: '10kb', strict: true }),
        cookieParser(),
        enforceJson,      → body present but not application/json → UNSUPPORTED_MEDIA_TYPE
        apiRouter)
11. notFound             → ROUTE_NOT_FOUND
12. errorHandler         → ALWAYS last; the only place that writes error responses
```

Per-route chain on protected routes: `limiter? → authenticate → authorize(role)? → validate(schemas) → controller`.

Hard rules:
- **Every** route has `validate(...)` for each of `params`, `query`, `body` it reads. No controller reads `req.body/query/params` directly — only `req.validated`.
- **Every** non-public route has `authenticate`. Admin-only routes additionally have `authorize('admin')`.
- **Every** route is documented in Swagger (section 8). A test enforces the endpoint manifest (file 06).
- Never send an error response from a controller or middleware. Always `next(new AppError(...))` / `throw new AppError(...)`.

---

## 2. Express type augmentation

`src/shared/types/express.d.ts`

```ts
import type { Language } from '@/shared/i18n/languages';
import type { Platform } from '@/domain/enums/platform';
import type { Role } from '@/domain/enums/role';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      ctx?: { platform: Platform; language: Language; region?: string };
      auth?: { userId: string; role: Role; sessionId: string };
      validated?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}
export {};
```

---

## 3. Response envelope

`src/presentation/http/responses.ts`

```ts
import type { Request, Response } from 'express';
import { DEFAULT_LANGUAGE } from '@/shared/i18n/languages';
import { translateMessage, type MessageKey } from '@/shared/i18n/translator';
import type { ErrorCode } from '@/shared/errors';

export interface PaginationMeta { page: number; limit: number; total: number; totalPages: number }

export interface SuccessBody<T> { success: true; message: string; data: T; meta?: PaginationMeta }

export interface ErrorBody {
  success: false;
  error: { code: ErrorCode; message: string; details?: { field: string; message: string }[] };
  requestId: string;
}

export function sendSuccess<T>(
  req: Request,
  res: Response,
  opts: { messageKey: MessageKey; data: T; status?: number; meta?: PaginationMeta },
): void {
  const body: SuccessBody<T> = {
    success: true,
    message: translateMessage(req.ctx?.language ?? DEFAULT_LANGUAGE, opts.messageKey),
    data: opts.data,
    ...(opts.meta ? { meta: opts.meta } : {}),
  };
  res.status(opts.status ?? 200).json(body);
}
```

Examples:

```json
// success
{ "success": true, "message": "Signed in successfully.", "data": { "user": { "...": "..." } } }

// error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "details": [{ "field": "body.email", "message": "Enter a valid email address." }]
  },
  "requestId": "7f0c2c1e-0f1b-4d52-9a3e-1c2b3d4e5f60"
}
```

---

## 4. Middlewares (code)

### 4.1 `request-id.middleware.ts`

```ts
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HEADERS } from '@/config/constants';

const VALID = /^[A-Za-z0-9-]{8,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header(HEADERS.requestId);
  req.requestId = incoming && VALID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
```

### 4.2 `client-context.middleware.ts`

```ts
import type { RequestHandler, Request } from 'express';
import { AppError } from '@/shared/errors';
import { HEADERS } from '@/config/constants';
import { PLATFORMS, type Platform } from '@/domain/enums/platform';
import { isLanguage } from '@/shared/i18n/languages';

export const clientContext: RequestHandler = (req, _res, next) => {
  const platform = req.header(HEADERS.platform)?.toLowerCase();
  if (!platform || !(PLATFORMS as readonly string[]).includes(platform)) throw new AppError('HEADER_PLATFORM_INVALID');

  const language = req.header(HEADERS.language)?.toLowerCase();
  if (!isLanguage(language)) throw new AppError('HEADER_LANGUAGE_INVALID');

  const regionRaw = req.header(HEADERS.region);
  if (regionRaw !== undefined && !/^[A-Za-z]{2}$/.test(regionRaw)) throw new AppError('HEADER_REGION_INVALID');

  req.ctx = { platform: platform as Platform, language, ...(regionRaw ? { region: regionRaw.toUpperCase() } : {}) };
  next();
};

/** Safe accessor for handlers mounted after clientContext. */
export function ctxOf(req: Request): NonNullable<Request['ctx']> {
  if (!req.ctx) throw new AppError('INTERNAL_SERVER_ERROR'); // programming error: clientContext not mounted
  return req.ctx;
}
```

Ordering note: if `clientContext` itself throws, the error handler cannot use `req.ctx`, so it uses `readLanguageLenient(req)` (section 4.9) → falls back to `en`.

### 4.3 `enforce-json.middleware.ts`

```ts
import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors';

const WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

export const enforceJson: RequestHandler = (req, _res, next) => {
  const length = Number(req.header('content-length') ?? 0);
  if (WITH_BODY.has(req.method) && length > 0 && !req.is('application/json')) throw new AppError('UNSUPPORTED_MEDIA_TYPE');
  next();
};
```

### 4.4 `no-store.middleware.ts`

```ts
import type { RequestHandler } from 'express';
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
```

### 4.5 `authenticate.middleware.ts` / `authorize.middleware.ts`

```ts
// authenticate.middleware.ts
import type { Request, RequestHandler } from 'express';
import { AppError } from '@/shared/errors';
import { COOKIE_NAMES } from '@/config/constants';
import type { TokenService } from '@/application/ports/token-service.port';
import { ctxOf } from './client-context.middleware';

const bearer = (req: Request): string | undefined => {
  const h = req.header('authorization');
  const [scheme, token] = h?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
};

export const createAuthenticate = (tokens: TokenService): RequestHandler => (req, _res, next) => {
  const { platform } = ctxOf(req);
  // Strict source separation: web reads ONLY the HttpOnly cookie, mobile reads ONLY the Authorization header.
  const token = platform === 'web' ? (req.cookies as Record<string, string | undefined> | undefined)?.[COOKIE_NAMES.access] : bearer(req);
  if (!token) throw new AppError('AUTH_TOKEN_MISSING');
  const claims = tokens.verifyAccess(token); // AUTH_TOKEN_INVALID | AUTH_TOKEN_EXPIRED
  req.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
  next();
};
```

```ts
// authorize.middleware.ts
import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors';
import type { Role } from '@/domain/enums/role';

export const authorize = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.auth) throw new AppError('AUTH_TOKEN_MISSING');
  if (!roles.includes(req.auth.role)) throw new AppError('AUTH_FORBIDDEN');
  next();
};
```

Known limitation (document in README): access tokens are stateless; a disabled user keeps access until the 15-minute token expires. `AUTH_ACCOUNT_DISABLED` is enforced at login/refresh.

### 4.6 `validate.middleware.ts`

```ts
import type { Request, RequestHandler } from 'express';
import type { ZodIssue, ZodTypeAny } from 'zod';
import { AppError, type ErrorDetail } from '@/shared/errors';
import { isValidationKey, type ValidationKey } from '@/shared/i18n/translator';

interface RequestSchemas { params?: ZodTypeAny; query?: ZodTypeAny; body?: ZodTypeAny }

export function toValidationKey(issue: ZodIssue): ValidationKey {
  if (isValidationKey(issue.message)) return issue.message; // schemas use i18n keys as messages
  if (issue.code === 'invalid_type' && issue.received === 'undefined') return 'FIELD_REQUIRED';
  if (issue.code === 'unrecognized_keys') return 'UNKNOWN_FIELDS';
  return 'FIELD_INVALID_TYPE';
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetail[] = [];
    const validated: NonNullable<Request['validated']> = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) validated[part] = result.data as unknown;
      else for (const issue of result.error.issues) details.push({ field: [part, ...issue.path].join('.'), messageKey: toValidationKey(issue) });
    }
    if (details.length > 0) return next(new AppError('VALIDATION_ERROR', details));
    req.validated = validated;
    next();
  };
}

/** Typed accessors. T MUST be a `z.infer<typeof schema>` exported from the matching schema file. */
export const getBody = <T>(req: Request): T => req.validated?.body as T;
export const getQuery = <T>(req: Request): T => req.validated?.query as T;
export const getParams = <T>(req: Request): T => req.validated?.params as T;
```

### 4.7 `rate-limit.middleware.ts`

```ts
import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { Env } from '@/config/env';
import { AppError } from '@/shared/errors';

const make = (windowMs: number, limit: number): RequestHandler =>
  rateLimit({
    windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError('RATE_LIMIT_EXCEEDED')),
  });

export const createLimiters = (env: Env) => ({
  global: make(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX),
  auth: make(env.RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX),
  otp: make(env.RATE_LIMIT_WINDOW_MS, env.OTP_RATE_LIMIT_MAX), // forgot-password + verify-otp
});
export type Limiters = ReturnType<typeof createLimiters>;
```

TODO(scale): replace the default in-memory store with Redis when running multiple instances.

### 4.8 `upload.middleware.ts` — TODO-only stub (no upload yet)

```ts
/**
 * FILE UPLOAD — NOT IMPLEMENTED YET. Do NOT add multer/busboy now.
 * When uploads are introduced, this middleware MUST enforce ALL of the following:
 *
 * TODO(upload): allowlist of MIME types (e.g. image/jpeg, image/png, application/pdf) — reject others with FILE_TYPE_NOT_ALLOWED (415)
 * TODO(upload): verify REAL type via magic bytes (e.g. `file-type`), never trust Content-Type or the extension
 * TODO(upload): max size in MB per file (reject with FILE_TOO_LARGE, 413) and max file count per request
 * TODO(upload): sanitize file names; generate server-side random names (uuid); never use user-supplied paths
 * TODO(upload): store outside the web root / in object storage; never serve user files from the API origin inline
 * TODO(upload): serve downloads with Content-Disposition: attachment and X-Content-Type-Options: nosniff
 * TODO(upload): antivirus / malware scan hook before the file becomes accessible
 * TODO(upload): authenticate + authorize + rate-limit upload routes; document them in Swagger (multipart/form-data)
 * TODO(upload): reject archives / executables / SVG with scripts unless explicitly required and sanitized
 */
export const UPLOAD_LIMITS_TODO = {
  maxFileSizeMb: 5, // TODO(upload): confirm with product requirements
  allowedMimeTypes: [] as string[], // TODO(upload): fill the allowlist
} as const;
```

### 4.9 `not-found.middleware.ts` and `error-handler.middleware.ts`

```ts
// not-found.middleware.ts
import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors';
export const notFound: RequestHandler = () => { throw new AppError('ROUTE_NOT_FOUND'); };
```

```ts
// error-handler.middleware.ts
import type { ErrorRequestHandler, Request } from 'express';
import { AppError } from '@/shared/errors';
import { HEADERS } from '@/config/constants';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/shared/i18n/languages';
import { translateError, translateValidation } from '@/shared/i18n/translator';
import type { ErrorBody } from '../responses';

export const readLanguageLenient = (req: Request): Language => {
  if (req.ctx) return req.ctx.language;
  const raw = req.header(HEADERS.language)?.toLowerCase();
  return isLanguage(raw) ? raw : DEFAULT_LANGUAGE;
};

const toAppError = (err: unknown): AppError => {
  if (err instanceof AppError) return err;
  const type = (err as { type?: string } | null)?.type; // body-parser errors
  if (type === 'entity.parse.failed') return new AppError('MALFORMED_JSON');
  if (type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE');
  return new AppError('INTERNAL_SERVER_ERROR');
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) req.log.error({ err }, 'unhandled error'); // stack stays in logs only
  const lang = readLanguageLenient(req);
  const body: ErrorBody = {
    success: false,
    error: {
      code: appError.code,
      message: translateError(lang, appError.code),
      ...(appError.details ? { details: appError.details.map((d) => ({ field: d.field, message: translateValidation(lang, d.messageKey) })) } : {}),
    },
    requestId: req.requestId,
  };
  res.status(appError.status).json(body); // never include err.message or err.stack
};
```

Note: `req.log` comes from `pino-http`. If a request fails before `pino-http` (cannot happen with the specified order), guard with `req.log?.`.

---

## 5. Zod schemas (source of truth for validation + Swagger)

`src/presentation/http/schemas/zod.ts` — **every schema file must import `z` from here, never from `'zod'`**:

```ts
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);
export { z };
```

`common.schema.ts`

```ts
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
```

`auth.schema.ts`

```ts
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
```

`user.schema.ts`

```ts
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
```

`response.schema.ts` (documentation-only schemas; used by Swagger)

```ts
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
  }),
  requestId: z.string(),
}).openapi('ErrorResponse');
```

---

## 6. Cookies — `cookies/auth-cookies.ts`

```ts
import type { CookieOptions, Response } from 'express';
import type { Env } from '@/config/env';
import { API_BASE_PATH, COOKIE_NAMES } from '@/config/constants';
import type { AuthTokens } from '@/application/dto/auth.dto';

const base = (env: Env): CookieOptions => ({
  httpOnly: true, // JS cannot read it → XSS cannot steal tokens
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export function setAuthCookies(res: Response, env: Env, t: AuthTokens): void {
  res.cookie(COOKIE_NAMES.access, t.accessToken, { ...base(env), path: '/', maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000 });
  res.cookie(COOKIE_NAMES.refresh, t.refreshToken, { ...base(env), path: `${API_BASE_PATH}/auth`, maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000 });
}

export function clearAuthCookies(res: Response, env: Env): void {
  res.clearCookie(COOKIE_NAMES.access, { ...base(env), path: '/' });
  res.clearCookie(COOKIE_NAMES.refresh, { ...base(env), path: `${API_BASE_PATH}/auth` });
}
```

---

## 7. Controllers and routes

### 7.1 `controllers/auth.controller.ts` (starter — follow the same pattern for the rest)

```ts
import type { Request, Response } from 'express';
import type { Container } from '@/container';
import { AppError } from '@/shared/errors';
import { COOKIE_NAMES } from '@/config/constants';
import type { AuthResult, AuthTokens, ClientMeta } from '@/application/dto/auth.dto';
import { sendSuccess } from '../responses';
import { clearAuthCookies, setAuthCookies } from '../cookies/auth-cookies';
import { ctxOf } from '../middlewares/client-context.middleware';
import { getBody, } from '../middlewares/validate.middleware';
import type { ChangePasswordBody, ForgotPasswordBody, LoginBody, LogoutBody, RefreshBody, RegisterBody, VerifyOtpBody } from '../schemas/auth.schema';

export class AuthController {
  constructor(private readonly c: Container) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const body = getBody<RegisterBody>(req);
    const result = await this.c.useCases.register.execute({ ...body, meta: this.meta(req) });
    sendSuccess(req, res, { status: 201, messageKey: 'AUTH_REGISTERED', data: this.authPayload(req, res, result) });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const body = getBody<LoginBody>(req);
    const result = await this.c.useCases.login.execute({ ...body, meta: this.meta(req) });
    sendSuccess(req, res, { messageKey: 'AUTH_LOGGED_IN', data: this.authPayload(req, res, result) });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const token = this.refreshTokenFrom(req, getBody<RefreshBody>(req));
    if (!token) throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    const tokens = await this.c.useCases.refresh.execute(token);
    sendSuccess(req, res, { messageKey: 'AUTH_TOKENS_REFRESHED', data: this.tokensPayload(req, res, tokens) });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.c.useCases.logout.execute(this.refreshTokenFrom(req, getBody<LogoutBody>(req)));
    if (ctxOf(req).platform === 'web') clearAuthCookies(res, this.c.env);
    sendSuccess(req, res, { messageKey: 'AUTH_LOGGED_OUT', data: null });
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const { email } = getBody<ForgotPasswordBody>(req);
    const r = await this.c.useCases.forgotPassword.execute({ email });
    const expose = this.c.env.OTP_EXPOSE_IN_RESPONSE && r.code !== null; // DEV ONLY flag (boot fails in production)
    sendSuccess(req, res, { messageKey: 'AUTH_OTP_SENT', data: { expiresInSeconds: r.expiresInSeconds, ...(expose ? { otp: r.code } : {}) } });
  };

  verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const r = await this.c.useCases.verifyOtp.execute(getBody<VerifyOtpBody>(req));
    sendSuccess(req, res, { messageKey: 'AUTH_OTP_VERIFIED', data: r }); // { resetToken, expiresInSeconds } for BOTH platforms
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    await this.c.useCases.changePassword.execute(getBody<ChangePasswordBody>(req));
    if (ctxOf(req).platform === 'web') clearAuthCookies(res, this.c.env);
    sendSuccess(req, res, { messageKey: 'AUTH_PASSWORD_CHANGED', data: null });
  };

  // ---- helpers ----
  private meta(req: Request): ClientMeta {
    return { platform: ctxOf(req).platform, userAgent: req.header('user-agent') ?? null };
  }

  /** web → tokens only in HttpOnly cookies (body gets NO tokens). mobile → tokens in body. */
  private tokensPayload(req: Request, res: Response, tokens: AuthTokens): { tokens: AuthTokens } | null {
    if (ctxOf(req).platform === 'web') {
      setAuthCookies(res, this.c.env, tokens);
      return null;
    }
    return { tokens };
  }

  private authPayload(req: Request, res: Response, r: AuthResult): { user: AuthResult['user']; tokens?: AuthTokens } {
    const t = this.tokensPayload(req, res, r.tokens);
    return t ? { user: r.user, tokens: t.tokens } : { user: r.user };
  }

  private refreshTokenFrom(req: Request, body: RefreshBody): string | undefined {
    return ctxOf(req).platform === 'web'
      ? (req.cookies as Record<string, string | undefined> | undefined)?.[COOKIE_NAMES.refresh]
      : body?.refreshToken;
  }
}
```

`controllers/user.controller.ts`: `me` (→ `getMe.execute(req.auth.userId)`, message `USER_FETCHED`, data `{ user }`), `getById` (→ `getUserById.execute({ requester: {id, role}, targetId: params.id })`, `USER_FETCHED`, data `{ user }`), `list` (→ `listUsers.execute({ requester, page, limit })`, message `USERS_FETCHED`, data `{ items }`, `meta: { page, limit, total, totalPages }`). Read `req.auth` through a helper that throws `AUTH_TOKEN_MISSING` if absent.

`controllers/health.controller.ts`: `check` → `sendSuccess(req, res, { messageKey: 'HEALTH_OK', data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) } })`.

### 7.2 Routes

```ts
// routes/auth.routes.ts
import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller';
import type { Limiters } from '../middlewares/rate-limit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { changePasswordBodySchema, forgotPasswordBodySchema, loginBodySchema, logoutBodySchema, refreshBodySchema, registerBodySchema, verifyOtpBodySchema } from '../schemas/auth.schema';

export function buildAuthRouter(c: AuthController, l: Limiters): Router {
  const r = Router();
  r.use(l.auth);
  r.post('/register', validate({ body: registerBodySchema }), c.register);
  r.post('/login', validate({ body: loginBodySchema }), c.login);
  r.post('/refresh', validate({ body: refreshBodySchema }), c.refresh);
  r.post('/logout', validate({ body: logoutBodySchema }), c.logout);
  r.post('/forgot-password', l.otp, validate({ body: forgotPasswordBodySchema }), c.forgotPassword);
  r.post('/verify-otp', l.otp, validate({ body: verifyOtpBodySchema }), c.verifyOtp);
  r.post('/change-password', validate({ body: changePasswordBodySchema }), c.changePassword);
  return r;
}
```

```ts
// routes/user.routes.ts
export function buildUserRouter(c: UserController, authenticate: RequestHandler): Router {
  const r = Router();
  r.use(authenticate); // everything below is protected
  r.get('/me', c.me); // MUST be declared before '/:id'
  r.get('/', authorize('admin'), validate({ query: listUsersQuerySchema }), c.list);
  r.get('/:id', validate({ params: userIdParamsSchema }), c.getById);
  return r;
}
```

```ts
// routes/index.ts — apiRouter
export function buildApiRouter(c: Container, limiters: Limiters): Router {
  const r = Router();
  r.use('/auth', buildAuthRouter(new AuthController(c), limiters));
  r.use('/users', buildUserRouter(new UserController(c), createAuthenticate(c.tokens)));
  return r;
}
// routes/health.routes.ts — buildHealthRouter(): GET '/' → HealthController.check (mounted at /health)
```

---

## 8. Swagger / OpenAPI

Library: `@asteasolutions/zod-to-openapi` (types come from the same zod schemas). Served only when `SWAGGER_ENABLED=true`.

`swagger/registry.ts`

```ts
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

export const secured = [{ bearerAuth: [] }, { cookieAuth: [] }];
```

`swagger/paths/auth.paths.ts` (starter — document ALL endpoints in the contract table below the same way)

```ts
import { API_BASE_PATH } from '@/config/constants';
import { registry, clientHeadersSchema, errorResponse, jsonResponse } from '../registry';
import { z } from '../../schemas/zod';
import { registerBodySchema, loginBodySchema /* ...all */ } from '../../schemas/auth.schema';
import { publicUserSchema, successEnvelope, tokensSchema } from '../../schemas/response.schema';

const authData = z.object({ user: publicUserSchema, tokens: tokensSchema.optional().openapi({ description: 'Present only when X-Platform=mobile. Web receives HttpOnly cookies instead.' }) });

registry.registerPath({
  method: 'post',
  path: `${API_BASE_PATH}/auth/register`,
  tags: ['Auth'],
  summary: 'Register a new user (role is always "user")',
  request: { headers: clientHeadersSchema, body: { required: true, content: { 'application/json': { schema: registerBodySchema } } } },
  responses: {
    201: jsonResponse(successEnvelope(authData, 'RegisterResponse'), 'Registered'),
    400: errorResponse('VALIDATION_ERROR | HEADER_*_INVALID | MALFORMED_JSON'),
    409: errorResponse('USER_EMAIL_ALREADY_EXISTS'),
    429: errorResponse('RATE_LIMIT_EXCEEDED'),
  },
});
// ... login, refresh, logout, forgot-password, verify-otp, change-password (see contract)
```

Rules for path docs:
- Every operation lists `request.headers: clientHeadersSchema`, body/params/query schemas **imported from the same schema files used by `validate()`** (never duplicated).
- Every operation lists every status code it can return, with the error codes in the description.
- Protected operations set `security: secured`.
- `tags`: `Auth`, `Users`, `System`.

`swagger/openapi.ts`

```ts
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import './paths/auth.paths';
import './paths/user.paths';
import './paths/system.paths';
import { registry } from './registry';

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: 'Node-JS-Clean-Arc-Template API', version: '1.0.0', description: 'Auth backend template. All /api/v1 routes require X-Platform and X-Language headers.' },
    servers: [{ url: '/' }],
    tags: [{ name: 'Auth' }, { name: 'Users' }, { name: 'System' }],
  });
}
```

`swagger/setup.ts`

```ts
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
  app.get('/docs.json', docsHelmet, (_req, res) => { res.json(doc); });
  app.use('/docs', docsHelmet, swaggerUi.serve, swaggerUi.setup(doc, { customSiteTitle: 'API Docs' }));
}
```

---

## 9. `src/app.ts` and `src/server.ts`

```ts
// src/app.ts
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Request } from 'express';
import type { Container } from '@/container';
import { AppError } from '@/shared/errors';
import { API_BASE_PATH, JSON_BODY_LIMIT } from '@/config/constants';
import { requestId } from '@/presentation/http/middlewares/request-id.middleware';
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

  app.use(requestId);
  app.use(pinoHttp({ logger: c.logger, genReqId: (req) => (req as Request).requestId }));
  mountSwagger(app, env);
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => (!origin || env.CORS_ORIGINS.includes(origin) ? cb(null, true) : cb(new AppError('CORS_ORIGIN_NOT_ALLOWED'))),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform', 'X-Language', 'X-Region', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
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
```

```ts
// src/server.ts
import { env } from '@/config/env';
import { buildContainer } from '@/container';
import { createApp } from '@/app';

async function main(): Promise<void> {
  const container = buildContainer(env);
  await container.init();
  const app = createApp(container);
  const server = app.listen(env.PORT, env.HOST, () => container.logger.info(`Listening on http://${env.HOST}:${env.PORT}`));

  const shutdown = (signal: string): void => {
    container.logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref(); // force-exit if connections hang
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => { container.logger.fatal({ reason }, 'unhandledRejection'); process.exit(1); });
  process.on('uncaughtException', (err) => { container.logger.fatal({ err }, 'uncaughtException'); process.exit(1); });
}

void main();
```

Only `PORT` on `HOST` is opened. No inspector flags in scripts, no second listener.

For tests, export `createApp` and build the container with `loadEnv(process.env)` (vitest `env` block from file 01 supplies all variables).

---

## 10. API contract (frozen — Swagger, controllers, README and tests must match exactly)

Common request headers: `X-Platform` (required), `X-Language` (required), `X-Region` (optional), `Content-Type: application/json` when a body is sent. Protected routes: mobile → `Authorization: Bearer <accessToken>`; web → `access_token` cookie.

| # | Method & path | Auth | Request | Success | Errors |
|---|---|---|---|---|---|
| 1 | `POST /api/v1/auth/register` | public | body `{ email, password, fullName }` | **201** `data: { user, tokens? }` | 400 VALIDATION_ERROR/HEADER_*/MALFORMED_JSON, 409 USER_EMAIL_ALREADY_EXISTS, 415, 429 |
| 2 | `POST /api/v1/auth/login` | public | body `{ email, password }` | **200** `data: { user, tokens? }` | 400, 401 AUTH_INVALID_CREDENTIALS, 403 AUTH_ACCOUNT_DISABLED, 429 |
| 3 | `POST /api/v1/auth/refresh` | refresh token | mobile: body `{ refreshToken }`; web: cookie `refresh_token` (no body) | **200** mobile `data: { tokens }`; web `data: null` + new cookies | 401 AUTH_REFRESH_TOKEN_INVALID / AUTH_REFRESH_TOKEN_REUSED, 403 AUTH_ACCOUNT_DISABLED |
| 4 | `POST /api/v1/auth/logout` | public (idempotent) | mobile: body `{ refreshToken? }`; web: cookie | **200** `data: null`; web cookies cleared | 400 |
| 5 | `POST /api/v1/auth/forgot-password` | public | body `{ email }` | **200** `data: { expiresInSeconds, otp? }` (`otp` only if `OTP_EXPOSE_IN_RESPONSE=true` AND the account exists) | 400, 429 OTP_RESEND_COOLDOWN / RATE_LIMIT_EXCEEDED |
| 6 | `POST /api/v1/auth/verify-otp` | public | body `{ email, code }` | **200** `data: { resetToken, expiresInSeconds }` (both platforms, body only) | 400 OTP_INVALID / OTP_EXPIRED, 429 OTP_TOO_MANY_ATTEMPTS |
| 7 | `POST /api/v1/auth/change-password` | reset token | body `{ resetToken, newPassword }` | **200** `data: null`; all sessions revoked | 401 AUTH_RESET_TOKEN_INVALID, 400 VALIDATION_ERROR |
| 8 | `GET /api/v1/users/me` | any role | — | **200** `data: { user }` | 401, 404 USER_NOT_FOUND |
| 9 | `GET /api/v1/users/{id}` | admin: any id; user: own id only | path `id` (uuid) | **200** `data: { user }` | 400 UUID_INVALID, 401, 403 AUTH_FORBIDDEN, 404 USER_NOT_FOUND |
| 10 | `GET /api/v1/users` | **admin only** | query `page` (default 1), `limit` (default 20, max 100) | **200** `data: { items: PublicUser[] }`, `meta: { page, limit, total, totalPages }` | 400, 401, 403 AUTH_FORBIDDEN |
| 11 | `GET /health` | public, no client headers | — | **200** `data: { status: "ok", uptimeSeconds }` | — |

Typical full examples (reproduce for all endpoints in README):

```http
POST /api/v1/auth/login
X-Platform: mobile
X-Language: az
Content-Type: application/json

{ "email": "user@example.com", "password": "StrongPass123" }
```

```json
{
  "success": true,
  "message": "Uğurla daxil oldunuz.",
  "data": {
    "user": { "id": "2b7f…", "email": "user@example.com", "fullName": "Selim Aliyev", "role": "user", "isActive": true, "createdAt": "2025-01-01T10:00:00.000Z", "updatedAt": "2025-01-01T10:00:00.000Z" },
    "tokens": { "accessToken": "eyJ…", "refreshToken": "eyJ…" }
  }
}
```

Same call with `X-Platform: web` → `data: { user }` only, plus `Set-Cookie: access_token=…; HttpOnly; SameSite=Strict; Path=/` and `Set-Cookie: refresh_token=…; HttpOnly; SameSite=Strict; Path=/api/v1/auth`.

Security behaviors to preserve:
- Unknown email on login → same `AUTH_INVALID_CREDENTIALS` (+ dummy hash compare).
- Unknown/inactive email on forgot-password → same 200 body, no `otp`.
- Reset token is single-use and bound to the OTP record; changing the password revokes every refresh session.
- Refresh reuse detection revokes all sessions of that user.

---

## 11. Definition of Done (file 05)

- `npm run typecheck` passes with **zero** errors across the whole project.
- `npm run lint` passes.
- `npm run dev` boots; `GET http://127.0.0.1:3000/health` → 200; `GET /docs` shows Swagger UI listing all 11 operations; `GET /docs.json` is valid JSON.
- Manual smoke (curl or Swagger): register (mobile) returns tokens in body; register (web) sets two HttpOnly cookies and returns no tokens; missing `X-Language` → 400 `HEADER_LANGUAGE_INVALID` in English; `X-Language: az` error messages are Azerbaijani.
