# 01 — Project Foundation (READ FIRST)

> You are an AI coding agent. You will receive **six** specification files, one after another (01 → 06).
> Together they fully define a **Node.js + TypeScript Clean Architecture authentication backend template**.
> This file defines goals, frozen decisions, tooling, configuration, and the complete folder tree.

---

## 0. Operating rules (apply to ALL six files)

1. These files are the **single source of truth**. Do NOT invent endpoints, fields, error codes, folders, or dependencies that are not listed.
2. Create files at the **exact paths** given. Where code is shown as a "starter", complete the remaining files with the same patterns and the tables in the spec.
3. Language of code, comments, README, commit messages: **English**.
4. Implement files in order **01 → 06**. After each file run its *Definition of Done* commands. Do not continue while any command fails.
5. Do **NOT** implement: a real database driver, real file upload, real e-mail/SMS sending. Leave clean seams (interfaces + `TODO` comments) exactly as specified.
6. `AGENT.md` is supplied separately by the repository owner. Do **not** author it. File 06 explains when it must exist.
7. Keep it simple. This is a **template**: no over-engineering, no DI framework, no decorators, no ORM, no event bus, no CQRS.
8. Strict TypeScript. `any` is forbidden. Every external input is validated with **zod** at the HTTP edge.
9. Never log or return secrets, password hashes, OTP codes (except the one permitted dev flag in file 03), tokens, or stack traces in production.

---

## 1. Product goal

A reusable backend template that pairs with a Flutter Clean Architecture client template. It must provide:

- Registration, login, logout, refresh-token rotation
- Forgot password → **OTP** → verify OTP → short-lived **reset token** ("recent token") → change password
- Users: `me`, `by id`, `list all` (admin only)
- Roles: `user`, `admin` (distinct permissions)
- Required request headers: **platform** (`web` | `mobile`) and **language**; optional **region**
- **Every** error message localized (6 languages, one JSON file per language)
- Security middleware layer that is never skipped (helmet, CORS allowlist, rate limits, zod validation, auth, role guard)
- Swagger/OpenAPI docs for **every** endpoint (generated from the same zod schemas)
- `.env`-driven configuration validated at boot
- Persistence behind interfaces (in-memory implementation now; MongoDB or Firebase later)
- File-upload validation rules documented as `TODO` only (no upload yet)

---

## 2. Frozen decisions (do not change)

| Topic | Decision |
|---|---|
| Runtime | Node.js ≥ 20, **CommonJS** output |
| Language | TypeScript 5.x, `strict` + extra flags |
| HTTP framework | Express **5** (async errors are forwarded automatically) |
| Validation | `zod` 3.x at HTTP edge; schemas are the source of truth for types **and** Swagger |
| Swagger | `@asteasolutions/zod-to-openapi` + `swagger-ui-express`, UI at `/docs`, JSON at `/docs.json` |
| Hardening | `helmet`, `cors` allowlist, `express-rate-limit`, body limit `10kb`, `x-powered-by` off |
| Password hashing | `bcryptjs` (cost from env, default 12), max password length 72 |
| Tokens | JWT HS256, three **different** secrets: access, refresh, reset. `typ` claim + issuer + audience verified |
| User identifier | **email** (unique, stored lower-case) |
| Roles | `user` (default on register) \| `admin` (seeded from env only; never creatable via API) |
| Access token TTL | 15 min (`ACCESS_TOKEN_TTL_SECONDS=900`) |
| Refresh token TTL | 30 days, **rotation with reuse detection**, one session row per login |
| Reset token ("recent token") TTL | 10 min, **single use** (bound to the OTP record) |
| OTP | 6 digits, `crypto.randomInt`, stored as HMAC-SHA256, TTL 5 min, max 5 attempts, resend cooldown 60 s |
| OTP delivery | `OtpSender` port with a `NoopOtpSender` (TODO real provider). Dev flag `OTP_EXPOSE_IN_RESPONSE` returns the code in the forgot-password response; **forbidden in production** (boot fails) |
| Token delivery | `X-Platform: mobile` → access + refresh tokens in JSON body. `X-Platform: web` → access + refresh tokens in **HttpOnly cookies only** (never in body, XSS-safe) |
| Cookies (web) | `HttpOnly`, `Secure` in production, `SameSite=Strict`, access cookie `path=/`, refresh cookie `path=/api/v1/auth` |
| CSRF stance | `SameSite=Strict` + mandatory custom headers (`X-Platform`, `X-Language`) which force a CORS preflight; CORS allowlist with credentials |
| Languages | `az`, `en`, `ru`, `tr`, `de`, `es` (default fallback `en`) |
| Region | Optional `X-Region`, ISO 3166-1 alpha-2, stored in request context only (reserved for future use) |
| API base path | `/api/v1` (health at `/health`, docs at `/docs`) |
| Response envelope | `{ success, message, data, meta? }` / `{ success:false, error:{code,message,details?}, requestId }` |
| Persistence now | In-memory repositories. `DB_DRIVER=memory|mongo|firebase`; only `memory` is implemented, others throw a clear "not implemented (TODO)" error at boot |
| Network exposure | Server binds to `HOST` (default `127.0.0.1`). Only `PORT` is ever opened. No debug/inspector ports. Docker exposes `PORT` only |
| Package manager | npm |
| Tests | `vitest` + `supertest` |

---

## 3. Required headers (all `/api/v1/*` routes)

| Header | Required | Values | Purpose |
|---|---|---|---|
| `X-Platform` | **yes** | `web` \| `mobile` | decides token delivery (cookies vs body) and token source on protected routes |
| `X-Language` | **yes** | `az` `en` `ru` `tr` `de` `es` | language of every message/error in the response |
| `X-Region` | no | 2-letter country code, e.g. `AZ` | future use |
| `X-Request-Id` | no | `[A-Za-z0-9-]{8,64}` | echoed back; generated if absent or invalid |
| `Authorization` | protected + mobile | `Bearer <accessToken>` | mobile auth |
| `Cookie` | protected + web | `access_token=...` | web auth |

`/health`, `/docs`, `/docs.json` do **not** require these headers.

---

## 4. Dependencies

`package.json` (use these as minimums; if resolution fails, use the latest compatible versions and keep behavior identical):

```json
{
  "name": "node-js-clean-arc-template",
  "version": "1.0.0",
  "description": "Node.js + TypeScript Clean Architecture auth backend template",
  "private": true,
  "license": "MIT",
  "engines": { "node": ">=20.11" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "rimraf dist && tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json",
    "start": "node dist/server.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "check:locales": "tsx scripts/check-locales.ts",
    "verify": "npm run typecheck && npm run lint && npm run check:locales && npm run test && npm run build"
  },
  "dependencies": {
    "@asteasolutions/zod-to-openapi": "^7.3.0",
    "bcryptjs": "^3.0.2",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^5.1.0",
    "express-rate-limit": "^7.5.0",
    "helmet": "^8.0.0",
    "jsonwebtoken": "^9.0.2",
    "pino": "^9.6.0",
    "pino-http": "^10.4.0",
    "swagger-ui-express": "^5.0.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "@types/cookie-parser": "^1.4.8",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "@types/swagger-ui-express": "^4.1.7",
    "eslint": "^9.17.0",
    "pino-pretty": "^13.0.0",
    "prettier": "^3.4.2",
    "rimraf": "^6.0.1",
    "supertest": "^7.0.0",
    "tsc-alias": "^1.8.10",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.0",
    "vitest": "^3.0.0"
  }
}
```

Note: `"private": true` here only prevents accidental npm publishing. It is unrelated to the GitHub repository visibility (see file 06).

---

## 5. TypeScript configuration

`tsconfig.json` (editor, lint, tests, scripts):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "commonjs",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["node"]
  },
  "include": ["src", "tests", "scripts", "vitest.config.ts"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "sourceMap": false, "declaration": false },
  "include": ["src"],
  "exclude": ["**/*.test.ts"]
}
```

Rules:
- Imports across folders use the alias `@/…` (e.g. `import { AppError } from '@/shared/errors'`). Imports inside the same folder use `./`.
- `src/shared/types/express.d.ts` must be inside `src` so it is picked up (see file 05).

---

## 6. Complete folder tree (create all folders now)

```
Node-JS-Clean-Arc-Template/
├── AGENT.md                          # supplied by repo owner (do NOT author)
├── README.md                         # file 06
├── Dockerfile                        # file 06
├── .dockerignore                     # file 06
├── .env.example                      # this file
├── .gitignore
├── .nvmrc                            # "22"
├── .prettierrc
├── eslint.config.mjs
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── scripts/
│   └── check-locales.ts              # file 02
├── tests/                            # file 06
│   ├── unit/
│   └── e2e/
└── src/
    ├── server.ts                     # entry: listen + graceful shutdown (file 05)
    ├── app.ts                        # express app factory (file 05)
    ├── container.ts                  # composition root (file 04)
    ├── config/
    │   ├── env.ts                    # zod-validated env (this file)
    │   └── constants.ts              # this file
    ├── shared/                       # shared kernel (file 02) — no dependency on other layers
    │   ├── errors/
    │   │   ├── error-codes.ts
    │   │   ├── app-error.ts
    │   │   └── index.ts
    │   ├── i18n/
    │   │   ├── languages.ts
    │   │   ├── translator.ts
    │   │   └── locales/
    │   │       ├── az.json
    │   │       ├── en.json
    │   │       ├── ru.json
    │   │       ├── tr.json
    │   │       ├── de.json
    │   │       └── es.json
    │   └── types/
    │       └── express.d.ts          # file 05
    ├── domain/                       # file 03 — pure TypeScript, no framework imports
    │   ├── enums/
    │   │   ├── role.ts
    │   │   └── platform.ts
    │   ├── entities/
    │   │   ├── user.entity.ts
    │   │   ├── refresh-session.entity.ts
    │   │   └── otp.entity.ts
    │   └── repositories/
    │       ├── user.repository.ts
    │       ├── refresh-session.repository.ts
    │       └── otp.repository.ts
    ├── application/                  # file 03 — use cases + ports; depends on domain + shared only
    │   ├── ports/
    │   │   ├── password-hasher.port.ts
    │   │   ├── token-service.port.ts
    │   │   ├── otp-service.port.ts
    │   │   └── otp-sender.port.ts
    │   ├── dto/
    │   │   ├── user.dto.ts
    │   │   └── auth.dto.ts
    │   ├── mappers/
    │   │   └── user.mapper.ts
    │   ├── services/
    │   │   └── auth-session.service.ts
    │   └── use-cases/
    │       ├── use-case.ts
    │       ├── auth/
    │       │   ├── register.use-case.ts
    │       │   ├── login.use-case.ts
    │       │   ├── refresh-token.use-case.ts
    │       │   ├── logout.use-case.ts
    │       │   ├── forgot-password.use-case.ts
    │       │   ├── verify-otp.use-case.ts
    │       │   └── change-password.use-case.ts
    │       └── user/
    │           ├── get-me.use-case.ts
    │           ├── get-user-by-id.use-case.ts
    │           └── list-users.use-case.ts
    ├── infrastructure/               # file 04 — implements ports/repositories
    │   ├── persistence/
    │   │   ├── in-memory/
    │   │   │   ├── in-memory-user.repository.ts
    │   │   │   ├── in-memory-refresh-session.repository.ts
    │   │   │   └── in-memory-otp.repository.ts
    │   │   ├── mongo/README.md       # TODO notes only
    │   │   ├── firebase/README.md    # TODO notes only
    │   │   └── create-persistence.ts
    │   ├── security/
    │   │   ├── bcrypt-password-hasher.ts
    │   │   ├── jwt-token-service.ts
    │   │   └── hmac-otp-service.ts
    │   ├── messaging/
    │   │   └── noop-otp-sender.ts
    │   ├── logging/
    │   │   └── logger.ts
    │   └── seed/
    │       └── seed-admin.ts
    └── presentation/
        └── http/                     # file 05
            ├── responses.ts          # sendSuccess + envelope types
            ├── cookies/
            │   └── auth-cookies.ts
            ├── middlewares/
            │   ├── request-id.middleware.ts
            │   ├── client-context.middleware.ts
            │   ├── enforce-json.middleware.ts
            │   ├── no-store.middleware.ts
            │   ├── authenticate.middleware.ts
            │   ├── authorize.middleware.ts
            │   ├── validate.middleware.ts
            │   ├── rate-limit.middleware.ts
            │   ├── upload.middleware.ts      # TODO-only stub
            │   ├── not-found.middleware.ts
            │   └── error-handler.middleware.ts
            ├── schemas/
            │   ├── zod.ts                    # extended z (MUST be imported by all schema files)
            │   ├── common.schema.ts
            │   ├── auth.schema.ts
            │   ├── user.schema.ts
            │   └── response.schema.ts
            ├── controllers/
            │   ├── auth.controller.ts
            │   ├── user.controller.ts
            │   └── health.controller.ts
            ├── routes/
            │   ├── index.ts
            │   ├── auth.routes.ts
            │   ├── user.routes.ts
            │   └── health.routes.ts
            └── swagger/
                ├── registry.ts
                ├── paths/
                │   ├── auth.paths.ts
                │   ├── user.paths.ts
                │   └── system.paths.ts
                ├── openapi.ts
                └── setup.ts
```

### Dependency rule (enforced by review)

```
presentation ──► application ──► domain
      │               │            │
      └───────────────┴────────────┴──► shared (errors, i18n)
infrastructure ──► application (ports) + domain (repo interfaces) + shared
container.ts is the ONLY place that imports infrastructure and wires everything.
domain/ and application/ NEVER import express, zod, jsonwebtoken, bcryptjs, pino, or infrastructure/.
```

---

## 7. Environment

`.env.example` (commit this; never commit `.env`):

```dotenv
# ---------- Server ----------
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
# Number of reverse proxies in front of the app (0 = none). Needed for correct client IP / rate limiting.
TRUST_PROXY=0
# Comma-separated allowlist. Never use "*".
CORS_ORIGINS=http://localhost:5173,http://localhost:3001
LOG_LEVEL=debug
SWAGGER_ENABLED=true

# ---------- Persistence ----------
# memory | mongo | firebase   (only "memory" is implemented; others are TODO)
DB_DRIVER=memory

# ---------- Secrets (generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") ----------
# All four values MUST be different and at least 32 characters.
JWT_ACCESS_SECRET=change-me-access-secret-at-least-32-chars-long
JWT_REFRESH_SECRET=change-me-refresh-secret-at-least-32-chars-long
JWT_RESET_SECRET=change-me-reset-secret-at-least-32-chars-long
OTP_HMAC_SECRET=change-me-otp-hmac-secret-at-least-32-chars-long

# ---------- Token lifetimes (seconds) ----------
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000
RESET_TOKEN_TTL_SECONDS=600

# ---------- OTP ----------
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
# DEV ONLY: return the OTP in the forgot-password response. Boot FAILS if true in production.
OTP_EXPOSE_IN_RESPONSE=true

# ---------- Security ----------
BCRYPT_COST=12
# Optional cookie domain for web clients (leave empty for host-only cookies)
# COOKIE_DOMAIN=
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=30
OTP_RATE_LIMIT_MAX=5

# ---------- Seed (optional, development convenience) ----------
# If both are set, an admin user is created at boot when it does not exist.
# SEED_ADMIN_EMAIL=admin@example.com
# SEED_ADMIN_PASSWORD=ChangeMe123
```

`src/config/env.ts`:

```ts
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
```

Rule: only `container.ts`, `server.ts`, `app.ts` and presentation factories receive `env` (pass it down as a parameter or via the container). **Do not** import the `env` singleton inside `domain/`, `application/`, or `shared/`.

`src/config/constants.ts`:

```ts
export const API_BASE_PATH = '/api/v1';

export const COOKIE_NAMES = { access: 'access_token', refresh: 'refresh_token' } as const;

export const HEADERS = {
  platform: 'x-platform',
  language: 'x-language',
  region: 'x-region',
  requestId: 'x-request-id',
} as const;

/** Keep in sync with the locale texts "at least 8" / "at most 72" (validation.PASSWORD_TOO_SHORT / TOO_LONG). */
export const PASSWORD_RULES = { min: 8, max: 72 } as const;

export const FULL_NAME_RULES = { min: 2, max: 100 } as const;

/** Keep in sync with validation.LIMIT_INVALID text ("between 1 and 100"). */
export const PAGINATION = { defaultPage: 1, defaultLimit: 20, maxLimit: 100 } as const;

export const JSON_BODY_LIMIT = '10kb';

export const JWT_ISSUER = 'node-js-clean-arc-template';
export const JWT_AUDIENCE = 'node-js-clean-arc-template-clients';

export const OTP_LENGTH = 6;
```

---

## 8. Tooling files

`.gitignore`:

```
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
.idea/
.vscode/
```

`.nvmrc`: `22`

`.prettierrc`:

```json
{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 110, "arrowParens": "always" }
```

`eslint.config.mjs`:

```js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  { files: ['scripts/**/*.ts', 'tests/**/*.ts'], rules: { 'no-console': 'off' } },
);
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'true',
      DB_DRIVER: 'memory',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-0123456789',
      JWT_RESET_SECRET: 'test-reset-secret-0123456789-0123456789',
      OTP_HMAC_SECRET: 'test-otp-hmac-secret-0123456789-012345',
      OTP_EXPOSE_IN_RESPONSE: 'true',
      OTP_RESEND_COOLDOWN_SECONDS: '0',
      BCRYPT_COST: '4',
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '100000',
      OTP_RATE_LIMIT_MAX: '100000',
      CORS_ORIGINS: 'http://localhost:5173',
      SEED_ADMIN_EMAIL: 'admin@example.com',
      SEED_ADMIN_PASSWORD: 'AdminPass123',
    },
  },
});
```

---

## 9. Definition of Done (file 01)

- All folders from section 6 exist (empty folders may hold a `.gitkeep`).
- `package.json`, tsconfigs, eslint, prettier, vitest config, `.env.example`, `.gitignore`, `.nvmrc` exist.
- `src/config/env.ts` and `src/config/constants.ts` exist exactly as specified.
- `npm install` succeeds.
- Do **not** run `typecheck` yet if later files are missing; it must pass at the end of file 05.
