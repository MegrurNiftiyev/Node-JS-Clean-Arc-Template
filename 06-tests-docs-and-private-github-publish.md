# 06 — Tests, README, Docker, and PRIVATE GitHub Publish

> Prerequisites: files 01–05 completed and `npm run typecheck && npm run lint` pass.
> This is the final file. It defines the test suite, README content, Docker files, the pre-push gate, and how to publish.

---

## 1. Tests (vitest + supertest)

Layout:

```
tests/
├── unit/
│   ├── locales.test.ts
│   ├── jwt-token-service.test.ts
│   ├── otp-service.test.ts
│   └── use-cases.test.ts
└── e2e/
    ├── helpers.ts
    ├── auth.e2e.test.ts
    ├── users.e2e.test.ts
    ├── security.e2e.test.ts
    └── openapi.e2e.test.ts
```

### 1.1 E2E helper — `tests/e2e/helpers.ts`

```ts
import request from 'supertest';
import { loadEnv } from '@/config/env';
import { buildContainer } from '@/container';
import { createApp } from '@/app';

export async function makeApp() {
  const container = buildContainer(loadEnv(process.env));
  await container.init(); // seeds admin@example.com / AdminPass123 (vitest env block)
  return createApp(container);
}

export const mobile = { 'X-Platform': 'mobile', 'X-Language': 'en' } as const;
export const web = { 'X-Platform': 'web', 'X-Language': 'en' } as const;
export const api = (app: Parameters<typeof request>[0]) => request(app);
```

Each e2e file creates a **fresh** app in `beforeAll` (isolated in-memory state). Use unique emails per test.

### 1.2 Required test cases (every item must exist as a test)

**Locales (`locales.test.ts`)**
- Every `ErrorCode` has a non-empty text in all 6 languages.
- Key sets of `errors`, `messages`, `validation` are identical across the 6 files.

**Unit**
- `JwtTokenService`: a refresh token passed to `verifyAccess` → `AUTH_TOKEN_INVALID`; an access token passed to `verifyRefresh` → `AUTH_REFRESH_TOKEN_INVALID`; expired token → `AUTH_TOKEN_EXPIRED` (use `accessTtlSeconds: 1` + fake timers or a 2 s wait); a token signed with a different secret → invalid; `alg: none` token → invalid.
- `HmacOtpService`: `generate()` is 6 digits (run 200×); `matches` true/false; hash is deterministic per secret and different per secret.
- Use cases with in-memory repos + fake clock: register duplicate email → `USER_EMAIL_ALREADY_EXISTS`; login unknown email and wrong password both → `AUTH_INVALID_CREDENTIALS`; refresh rotation returns a different refresh token; **reuse of an old refresh token → `AUTH_REFRESH_TOKEN_REUSED` and all sessions revoked**; OTP: wrong code increments attempts, 5th wrong attempt then correct code → `OTP_TOO_MANY_ATTEMPTS`; expired OTP → `OTP_EXPIRED`; reset token cannot be used twice; `GetUserById` for a non-admin requesting another id → `AUTH_FORBIDDEN`.

**E2E — `auth.e2e.test.ts`**
- Register (mobile) → 201, `data.tokens.accessToken` and `refreshToken` exist, no `passwordHash` anywhere in the body.
- Register (web) → 201, **no** `data.tokens`, two `Set-Cookie` headers containing `HttpOnly` and `SameSite=Strict`.
- Register with weak password (`"abc"`) → 400 `VALIDATION_ERROR` with `details[0].field === 'body.password'` and a localized message (test `X-Language: az` and `de`).
- Register with an unknown field → 400 `VALIDATION_ERROR` (strict schema).
- Duplicate register → 409.
- Login ok / wrong password → 401 / unknown email → 401 (same body code).
- Refresh (mobile) with body token → new pair; old refresh token reused → 401 `AUTH_REFRESH_TOKEN_REUSED`; afterwards the *new* refresh token is also rejected (all revoked).
- Refresh (web) using only the cookie (use `supertest.agent`).
- Logout (mobile) → 200; the refresh token no longer works. Logout with garbage token → still 200.
- **Password reset flow:** forgot-password → `data.otp` present (test env flag) → verify-otp with wrong code → 400 `OTP_INVALID` → verify with right code → `resetToken` → change-password → 200 → login with new password works, old password fails → reusing the same `resetToken` → 401 `AUTH_RESET_TOKEN_INVALID`.
- forgot-password for an unknown email → 200 and **no** `otp` field.
- Access token expired/invalid → 401 `AUTH_TOKEN_INVALID`; missing → 401 `AUTH_TOKEN_MISSING`.

**E2E — `users.e2e.test.ts`**
- `GET /users/me` returns the caller (mobile via bearer; web via cookie agent).
- Web platform with a **Bearer header but no cookie** → 401 `AUTH_TOKEN_MISSING` (strict source separation). Mobile with only a cookie → 401.
- `GET /users` as `user` → 403 `AUTH_FORBIDDEN`; as seeded admin → 200 with `meta.total >= 1`; `?limit=1000` → 400 with `LIMIT_INVALID` localized.
- `GET /users/:id`: own id → 200; another user's id as `user` → 403; any id as admin → 200; unknown uuid as admin → 404 `USER_NOT_FOUND`; `not-a-uuid` → 400 `UUID_INVALID`.
- Registering with `role: "admin"` in the body → 400 (unknown field) — privilege escalation impossible.

**E2E — `security.e2e.test.ts`**
- Missing `X-Platform` → 400 `HEADER_PLATFORM_INVALID`; missing/invalid `X-Language` → 400 `HEADER_LANGUAGE_INVALID` (English fallback); invalid `X-Region` (`"AZE"`) → 400 `HEADER_REGION_INVALID`.
- Malformed JSON → 400 `MALFORMED_JSON`; body > 10 kb → 413 `PAYLOAD_TOO_LARGE`; `Content-Type: text/plain` with a body → 415 `UNSUPPORTED_MEDIA_TYPE`.
- Unknown route → 404 `ROUTE_NOT_FOUND` (localized with `X-Language`).
- Response headers contain helmet headers (`x-content-type-options: nosniff`, `strict-transport-security`, `x-frame-options` or CSP `frame-ancestors`) and **no** `x-powered-by`; API responses have `cache-control: no-store`.
- CORS: preflight from an allowed origin → 204 with `access-control-allow-credentials: true`; from `http://evil.example` → 403 `CORS_ORIGIN_NOT_ALLOWED`.
- Error responses never contain `stack` and always contain `requestId`; sending `X-Request-Id: abcdefgh-1234` echoes it back.
- Rate limit: build an app with `AUTH_RATE_LIMIT_MAX=3` (override env for this test file) → 4th login → 429 `RATE_LIMIT_EXCEEDED`.

**E2E — `openapi.e2e.test.ts`** (documentation cannot drift)

```ts
const MANIFEST: [method: string, path: string][] = [
  ['post', '/api/v1/auth/register'],
  ['post', '/api/v1/auth/login'],
  ['post', '/api/v1/auth/refresh'],
  ['post', '/api/v1/auth/logout'],
  ['post', '/api/v1/auth/forgot-password'],
  ['post', '/api/v1/auth/verify-otp'],
  ['post', '/api/v1/auth/change-password'],
  ['get', '/api/v1/users/me'],
  ['get', '/api/v1/users/{id}'],
  ['get', '/api/v1/users'],
  ['get', '/health'],
];
// GET /docs.json → 200; for every entry assert doc.paths[path][method] exists.
// Assert doc.paths has EXACTLY these 11 paths-operations (no undocumented/extra ones).
// Assert every /api/v1 operation lists X-Platform and X-Language header parameters.
// Assert protected operations (users/*) declare `security`.
```

---

## 2. Docker

`Dockerfile`

```dockerfile
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

`.dockerignore`

```
node_modules
dist
coverage
.git
.env
.env.*
!.env.example
tests
*.md
```

Run guidance for README: publish the port on loopback only, e.g. `docker run --env-file .env -p 127.0.0.1:3000:3000 image`. In production, put a TLS-terminating reverse proxy in front and set `TRUST_PROXY=1`.

---

## 3. README.md — required content

The README must be well structured, polished, and contain **all** of these sections in this order. Reuse the contract (file 05 §10), error table (file 02 §2), env list (file 01 §7), and folder tree (file 01 §6) verbatim where applicable.

1. **Title + badges** (Node ≥ 20, TypeScript, license MIT) and a one-paragraph description.
2. **Features** (bullet list: Clean Architecture, JWT access/refresh rotation, OTP password reset, RBAC, i18n 6 languages, zod, helmet, rate limits, Swagger, env validation, DB-agnostic repositories).
3. **Quick start**: prerequisites, `npm install`, `cp .env.example .env`, secret generation command, `npm run dev`, URLs (`/health`, `/docs`).
4. **Required headers** (table from file 01 §3) and explanation of why each exists (platform → token delivery & XSS protection; language → localized messages).
5. **Architecture**: layer diagram + dependency rule + one request lifecycle walk-through (pipeline order from file 05 §1). Folder tree.
6. **Authentication design**: token types/TTLs, web vs mobile delivery, refresh rotation + reuse detection, reset-token single use, OTP rules, cookie flags, CSRF stance, known limitations (stateless access token until expiry; concurrent refresh calls).
7. **API reference**: for each of the 11 endpoints — purpose, auth, headers, request body/query/params, success response example (mobile and web where different), possible errors. Include the response envelope description.
8. **Error codes**: full table (code, HTTP status, when it is raised) + how to add a new error/language.
9. **Localization**: how locale files work, how to add a language (add to `SUPPORTED_LANGUAGES`, create JSON, run `npm run check:locales`).
10. **Configuration**: complete environment variable table (name, default, description). Mark `OTP_EXPOSE_IN_RESPONSE` as **DEV ONLY**.
11. **Connecting a database** (MongoDB / Firebase): repository interfaces, `create-persistence.ts`, checklist from the TODO READMEs.
12. **File uploads (planned)**: the TODO security checklist from `upload.middleware.ts` (type allowlist, magic-byte check, size limit in MB, etc.).
13. **Sending OTPs for real**: implement `OtpSender`, wire in `container.ts`, turn `OTP_EXPOSE_IN_RESPONSE` off.
14. **Scripts** table, **testing**, **Docker**, **security checklist**, **contributing/conventions** (point to `AGENT.md`), **license**.

README must never contain real secrets; use placeholders.

---

## 4. Repository metadata

| Item | Value |
|---|---|
| Repository name | `Node-JS-Clean-Arc-Template` (words separated by hyphens, each word capitalized, exactly as written) |
| Visibility | **PRIVATE — MANDATORY** |
| Default branch | `main` |
| Description | `Production-ready Node.js + TypeScript Clean Architecture auth template: JWT, OTP password reset, RBAC, i18n (6 languages), zod, helmet, Swagger.` |
| Topics | `nodejs`, `typescript`, `clean-architecture`, `express`, `jwt`, `authentication`, `otp`, `rbac`, `i18n`, `swagger`, `openapi`, `zod`, `helmet`, `template`, `boilerplate`, `backend` |
| License | MIT (add `LICENSE` file, holder = repository owner's name from `git config user.name`) |

---

## 5. Pre-push gate (ALL must pass; otherwise STOP and fix)

Run in this order:

```bash
npm ci
npm run typecheck
npm run lint
npm run check:locales
npm run test
npm run build
```

Then verify manually:

- [ ] `AGENT.md` exists at the repository root. It is supplied by the owner. **If it is missing, STOP and ask the owner for it. Do not write it yourself and do not push without it.**
- [ ] `README.md` complete per section 3.
- [ ] `.env` is **not** tracked: `git ls-files | grep -E '^\.env($|\.)' | grep -v '^\.env\.example$'` prints nothing.
- [ ] No secrets in the repo: `git grep -nEi "(secret|password|token)\s*[:=]\s*['\"][^'\"]{12,}" -- . ':!.env.example' ':!tests' ':!*.md'` prints nothing suspicious.
- [ ] `grep -rn "console\.log" src` prints nothing.
- [ ] `grep -rnE ": any\b|as any" src` prints nothing.
- [ ] `grep -rnE "from '(express|zod|jsonwebtoken|bcryptjs|pino)" src/domain src/application` prints nothing.
- [ ] `OTP_EXPOSE_IN_RESPONSE` is `false` in the code default and the production boot check works (start with `NODE_ENV=production OTP_EXPOSE_IN_RESPONSE=true` → process exits with an env error).
- [ ] `npm run dev` smoke test performed (health, docs, one register/login).

---

## 6. Publish to GitHub — PRIVATE ONLY

Prerequisite: GitHub CLI authenticated (`gh auth status`). If it is not authenticated, STOP and ask the owner to run `gh auth login`. Never ask for or store tokens.

```bash
git init -b main
git add .
git status            # review: no .env, no node_modules, no dist
git commit -m "feat: initial Node.js clean architecture auth template"

gh repo create Node-JS-Clean-Arc-Template \
  --private \
  --description "Production-ready Node.js + TypeScript Clean Architecture auth template: JWT, OTP password reset, RBAC, i18n (6 languages), zod, helmet, Swagger." \
  --source=. --remote=origin --push

gh repo edit --add-topic nodejs --add-topic typescript --add-topic clean-architecture --add-topic express \
  --add-topic jwt --add-topic authentication --add-topic otp --add-topic rbac --add-topic i18n \
  --add-topic swagger --add-topic openapi --add-topic zod --add-topic helmet --add-topic template \
  --add-topic boilerplate --add-topic backend
```

Hard rules:
- **Never** pass `--public` or `--internal`. **Never** change visibility to public. The repository MUST be private.
- Never force-push. Never rewrite history after the first push.
- If `gh repo create` reports the name already exists, STOP and ask the owner; do not pick another name.

Post-publish verification (all must be true; report the output to the owner):

```bash
gh repo view Node-JS-Clean-Arc-Template --json name,visibility,description,repositoryTopics,defaultBranchRef
# expected: "visibility": "PRIVATE", name exact, description set, 16 topics, default branch "main"
git ls-remote --heads origin   # main exists
```

If `visibility` is anything other than `PRIVATE`, immediately run `gh repo edit Node-JS-Clean-Arc-Template --visibility private --accept-visibility-change-consequences` and re-verify.

---

## 7. Final report to the owner (print at the end)

1. Repo URL and confirmed visibility (`PRIVATE`).
2. Output of the pre-push gate commands (pass/fail summary).
3. List of anything intentionally left as TODO: real DB, real OTP delivery, file upload, Redis rate-limit store, expired-record cleanup job.
4. Reminder: set strong unique secrets and `OTP_EXPOSE_IN_RESPONSE=false` before any non-local deployment.

---

## 8. Definition of Done (file 06)

- All tests listed in section 1.2 exist and `npm run verify` passes.
- README, Dockerfile, `.dockerignore`, `LICENSE` exist; `AGENT.md` present (owner-supplied).
- Repository exists on GitHub as **PRIVATE** with description and topics, `main` pushed, final report delivered.
