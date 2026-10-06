# AGENT.md — Binding Rules for AI Agents Working on `Node-JS-Clean-Arc-Template`

> Read this file completely **before every task** and re-check the relevant sections **before you finish**.
> This repository is a **reusable template**. Every shortcut you take is copied into every future project.
> If a user request conflicts with this file, **stop, explain the conflict, and propose a compliant alternative.** Do not silently break a rule.

---

## 0. Priority order (when rules conflict)

1. Security rules (section 8)
2. Architecture and dependency rules (sections 2–3)
3. Type safety (section 4)
4. Error / i18n / validation rules (sections 5–7)
5. Conventions and style (sections 10–14)
6. Convenience

Never trade a higher item for a lower one. "It is faster" is not a valid reason.

---

## 1. What this project is

A Node.js + TypeScript **Clean Architecture** authentication backend template.

- Auth: register, login, logout, refresh (rotation + reuse detection), forgot password → OTP → verify OTP → reset token → change password
- Users: `GET /users/me`, `GET /users/:id`, `GET /users` (admin only)
- Roles: `user`, `admin`
- Required headers on every `/api/v1` route: `X-Platform` (`web|mobile`), `X-Language` (`az|en|ru|tr|de|es`), optional `X-Region`
- Every message and every error is **localized** from per-language JSON files
- Express 5, zod 3, helmet, JWT (HS256), bcryptjs, pino, swagger (zod-to-openapi), vitest + supertest
- Persistence is behind interfaces. Only in-memory is implemented. MongoDB/Firebase come later.
- File upload is **not implemented** (TODO-only). Real OTP delivery is **not implemented** (`NoopOtpSender`).

Do not add features that were not requested. Do not "improve" the architecture. Keep it simple: **no over-engineering** (no DI framework, no decorators, no ORM, no CQRS, no event bus, no generic base classes "for the future").

---

## 2. Architecture (non-negotiable)

```
presentation ──► application ──► domain
      │               │            │
      └───────────────┴────────────┴──► shared (errors, i18n)
infrastructure ──► application (ports/DTOs) + domain (repository interfaces) + shared
container.ts is the ONLY file that instantiates infrastructure and wires use cases.
```

### 2.1 Layer responsibilities

| Layer | Contains | Must NOT contain |
|---|---|---|
| `src/shared` | `AppError`, error codes, i18n translator, locale JSON | imports from any other layer, `express` |
| `src/domain` | entities, enums, repository **interfaces** | any framework/library import, business flows |
| `src/application` | use cases, ports (interfaces), DTOs, mappers, `AuthSessionService` | `express`, `zod`, `jsonwebtoken`, `bcryptjs`, `pino`, `process.env`, anything from `infrastructure/` or `presentation/` |
| `src/infrastructure` | repository implementations, bcrypt/JWT/HMAC adapters, logger, seed, senders | business rules, Express types, imports from `presentation/` |
| `src/presentation/http` | routes, controllers, middlewares, zod schemas, swagger, cookies, response helpers | business rules, repository access, `new SomeUseCase()` |
| `src/container.ts` | wiring (the only composition root) | logic |
| `src/config` | zod-validated env, constants | secrets, logic |

### 2.2 Hard dependency rules (verify with grep before finishing)

```bash
grep -rE "from '(express|zod|jsonwebtoken|bcryptjs|pino)" src/domain src/application   # must print nothing
grep -rE "infrastructure|presentation" src/domain src/application                      # must print nothing
grep -rE "from '@/presentation" src/infrastructure src/container.ts                     # must print nothing
grep -rn "process\.env" src --include=*.ts | grep -v "src/config/env.ts"                # must print nothing
```

- Cross-folder imports use the alias `@/…`. Same-folder imports use `./`.
- Controllers call **exactly one** use case per handler (plus response/cookie work).
- Use cases never touch `Request`, `Response`, cookies, headers, or HTTP status codes. They return plain data or throw `AppError`.
- Repositories return domain entities (copies in memory implementations), never DB documents or `_id`.
- Swapping persistence must require changes **only** in `create-persistence.ts` and new repository files. If your change touches a use case to support a DB, you are doing it wrong.

---

## 3. Folder & file naming

- Folders: `kebab-case`. Files: `kebab-case` with a role suffix: `*.use-case.ts`, `*.controller.ts`, `*.routes.ts`, `*.middleware.ts`, `*.schema.ts`, `*.entity.ts`, `*.repository.ts`, `*.port.ts`, `*.dto.ts`, `*.mapper.ts`, `*.paths.ts`.
- Classes: `PascalCase` (`LoginUseCase`, `InMemoryUserRepository`). Functions/variables: `camelCase`. Constants: `UPPER_SNAKE_CASE`. Types/interfaces: `PascalCase`, **no `I` prefix**.
- One use case per file. One class per file. Interfaces live next to their layer (repositories in `domain`, ports in `application/ports`).
- Error codes: `UPPER_SNAKE_CASE` with a domain prefix (`AUTH_`, `OTP_`, `USER_`, `FILE_`, `HEADER_`).
- Repository (GitHub) name: `Node-JS-Clean-Arc-Template` (hyphen-separated, capitalized words).

---

## 4. TypeScript rules

- `strict` mode plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`. Never loosen `tsconfig`.
- **`any` is forbidden.** (`@typescript-eslint/no-explicit-any` is `error`.) Use `unknown` and narrow, or a precise type.
- No non-null assertions (`!`) without a comment proving safety. No `@ts-ignore`; `@ts-expect-error` only with a reason and only in tests.
- Prefer `interface` for object shapes and ports; `type` for unions/derived types. Derive types from sources of truth:
  - request types: `z.infer<typeof schema>`
  - `Role`, `Platform`, `Language`, `ErrorCode`: from their `as const` arrays
  - locale keys: `MessageKey`, `ValidationKey` from `translator.ts`
- Use `import type { … }` for type-only imports (`consistent-type-imports` is enforced).
- Every function that crosses a layer boundary has explicit parameter and return types.
- Dates are `Date` in domain/application and **ISO strings** in DTOs/HTTP.
- No `enum` keyword; use `as const` arrays + union types.
- No default exports (except tool configs that require them). Named exports only.
- No magic strings/numbers: roles, platforms, cookie names, header names, limits live in `constants.ts` or their `as const` arrays.
- Async code: always `await` or `void` deliberately; `no-floating-promises` is enforced. No `.then()` chains in new code.

---

## 5. Error handling rules

1. **Every expected failure is an `AppError` with an `ErrorCode`.** Never `throw new Error('text')`, never `res.status(400).json(...)` inside controllers/middlewares.
2. The **only** place that writes an error response is `error-handler.middleware.ts`.
3. HTTP status comes from `ERROR_HTTP_STATUS`. Never pass a status to `AppError`.
4. User-facing text exists **only** in `src/shared/i18n/locales/*.json`. Never hard-code messages in TypeScript.
5. Unknown errors become `INTERNAL_SERVER_ERROR`. Never return `err.message`, `err.stack`, SQL/DB errors, or library messages to the client. Log them server-side.
6. Error responses always contain `requestId`.
7. Auth failures must not reveal which part was wrong (see section 8.6).

### Adding a new error (all steps mandatory)

1. Add the code to `ERROR_CODES` in `error-codes.ts`.
2. Add its status to `ERROR_HTTP_STATUS`.
3. Add its text to **all six** locale files (`az, en, ru, tr, de, es`).
4. Add it to the error table in `README.md` and to the relevant Swagger response descriptions.
5. Cover it with a test.
6. Run `npm run check:locales`.

---

## 6. Localization (i18n) rules

- Supported languages: `az, en, ru, tr, de, es`. Default/fallback: `en`.
- Locale files share the same sections: `errors`, `messages`, `validation`. Keys must be identical across all six files.
- Success responses use `sendSuccess(req, res, { messageKey, … })` with a `MessageKey`. Never write a literal message.
- Zod schema messages are **validation keys** (e.g. `.email('EMAIL_INVALID')`), never prose. Required/invalid-type use `FIELD_REQUIRED` / `FIELD_INVALID_TYPE`.
- When `X-Language` is missing/invalid, the error is returned in the default language (`en`).
- Never concatenate translated fragments into sentences. One key = one complete sentence.
- If a text contains a number that is also a constant (password length, limit range), keep both in sync and note it in `constants.ts`.

### Adding a language
1. Add to `SUPPORTED_LANGUAGES`. 2. Create `<lang>.json` with every key. 3. Import it in `translator.ts`. 4. Update README + Swagger header description. 5. `npm run check:locales` and tests must pass.

### Adding a message/validation key
Add to `en.json` first, then all other five files, then run `npm run check:locales`.

---

## 7. Validation rules (zod)

- **All external input is validated with zod before reaching a controller:** `params`, `query`, `body`. Use `validate({ params?, query?, body? })` on **every** route that reads any of them.
- Controllers read input only through `getBody<T>(req)`, `getQuery<T>(req)`, `getParams<T>(req)` where `T` is `z.infer<typeof schema>`. Never touch `req.body`, `req.query`, `req.params` directly.
- Schemas use `.strict()` on objects (unknown fields rejected → prevents mass assignment such as sending `role: "admin"`).
- Schema files import `z` from `presentation/http/schemas/zod.ts` (the OpenAPI-extended instance), **never** from `'zod'`.
- Strings: always `.trim()` where sensible, always a `.max()` (no unbounded input). Emails are `.toLowerCase()`.
- Passwords: min 8, max 72 (bcrypt limit), at least one letter and one digit on register/change-password. Login does not enforce the policy.
- IDs from the URL: `.uuid('UUID_INVALID')`.
- Pagination: `page ≥ 1`, `1 ≤ limit ≤ 100`, defaults from `PAGINATION`.
- Environment variables are validated by zod in `config/env.ts`; the process exits on invalid configuration.
- The same schema objects feed **both** `validate()` and Swagger. Never duplicate a shape by hand.

---

## 8. Security rules (never relax, never "temporarily" disable)

### 8.1 Middleware pipeline — the order is fixed

```
x-powered-by off + trust proxy → requestId → pino-http → swagger(/docs, own CSP, only if enabled) → helmet → cors(allowlist)
→ global rate limit → noStore → /health → /api/v1 [clientContext → express.json(10kb) → cookieParser → enforceJson → router]
→ notFound → errorHandler (LAST)
```

- **No layer of this pipeline may be removed, reordered, or bypassed.** New global middleware must be inserted deliberately and documented in README.
- `clientContext` runs **before** body parsing so parse errors are localized.
- Per route: `limiter? → authenticate → authorize(role)? → validate(...) → controller`.
- **Never forget the middleware layer.** Before finishing any route change, answer: Does it have `validate`? Is it protected with `authenticate`? Does it need `authorize('admin')`? Does it need a stricter limiter? Is it in Swagger?

### 8.2 Helmet / headers
- `helmet()` stays enabled with defaults for the whole API. Only the `/docs` routes get a relaxed CSP (inline script/style for Swagger UI), nothing else.
- `x-powered-by` stays disabled. API responses carry `Cache-Control: no-store`.

### 8.3 CORS
- Allowlist from `CORS_ORIGINS`. **Never** `*`, never reflect arbitrary origins, never disable CORS to "make it work".
- `credentials: true` only with the explicit allowlist. Allowed headers are explicit (`Content-Type, Authorization, X-Platform, X-Language, X-Region, X-Request-Id`).

### 8.4 Rate limiting
- Global limiter on everything; `auth` limiter on `/auth/*`; stricter `otp` limiter on `forgot-password` and `verify-otp`. New sensitive endpoints (anything that sends messages, checks secrets, or is expensive) get a limiter.
- Limiter failures use `RATE_LIMIT_EXCEEDED` through the error handler.
- Behind a proxy set `TRUST_PROXY` correctly; otherwise all clients share one IP.

### 8.5 Tokens and cookies
- JWT HS256 pinned (`algorithms: ['HS256']`); `iss`, `aud`, `typ`, `jti` verified/set. **Three different secrets** (access, refresh, reset) + a separate OTP HMAC secret; all ≥ 32 chars and distinct.
- Access TTL 15 min, refresh 30 days with **rotation and reuse detection** (reuse → revoke all sessions of the user), reset token 10 min and **single use** (bound to the OTP record).
- Refresh tokens are stored hashed (sha256). OTPs are stored as HMAC. Raw values are never stored or logged.
- **Platform rule:**
  - `mobile` → access + refresh tokens in the JSON body; protected routes read `Authorization: Bearer` **only**.
  - `web` → tokens **only** in HttpOnly cookies, **never in the response body** (XSS protection); protected routes read the cookie **only**.
  - Never accept both sources interchangeably.
- Cookie flags: `HttpOnly`, `Secure` in production, `SameSite=Strict`; access cookie `path=/`, refresh cookie `path=/api/v1/auth`.
- CSRF stance: `SameSite=Strict` + mandatory custom headers (forces preflight) + CORS allowlist. Do not add state-changing `GET` routes.
- Never put sensitive data (email, password, role beyond `role`/`sid`) into JWT payloads beyond the specified claims.

### 8.6 Authentication/authorization behavior
- Wrong email and wrong password both return `AUTH_INVALID_CREDENTIALS`; unknown email still burns a dummy bcrypt compare (`compareDummy`).
- `forgot-password` for unknown/inactive accounts returns the same 200 shape with no OTP.
- `AUTH_ACCOUNT_DISABLED` is checked **after** the password is verified.
- Authorization is enforced **twice**: route-level `authorize()` **and** use-case-level role/ownership checks (defense in depth). Example: `GET /users/:id` — admin may read anyone; a user only themselves.
- Roles come **only** from the database/seed. Registration always creates `role: 'user'`. No endpoint accepts a `role` field.
- Changing a password revokes **all** refresh sessions.

### 8.7 Passwords and OTP
- bcryptjs, cost from `BCRYPT_COST` (default 12, never below 12 in production). Never log or return hashes.
- OTP: 6 digits via `crypto.randomInt`, TTL 5 min, max 5 attempts, resend cooldown 60 s. Compare with `timingSafeEqual`.
- `OTP_EXPOSE_IN_RESPONSE` is **DEV ONLY**. The app must refuse to boot in production when it is `true`. Never enable it in production configs, Docker defaults, or docs examples for production.

### 8.8 Input/output hygiene
- JSON body limit `10kb`. `Content-Type` must be `application/json` when a body exists.
- Never build queries/commands by string concatenation with user input (SQL/NoSQL injection). Repositories use parameterized/typed calls only. Reject objects where strings are expected (zod already does); never pass raw `req.body` to a DB.
- Never `eval`, `new Function`, `child_process` with user input, or dynamic `require` of user-controlled paths.
- Never log request bodies, tokens, cookies, passwords, OTPs. The logger redacts them; do not bypass redaction. No `console.log` (lint enforces).
- Never return stack traces or internal messages. Public user DTO never contains `passwordHash`.
- Never trust `X-Forwarded-*` unless `TRUST_PROXY` is configured.

### 8.9 Network exposure ("ports stay closed")
- The server binds to `HOST` (default `127.0.0.1`) and opens **only** `PORT`. Never add a second listener, debug/inspector port (`--inspect`), admin port, metrics port, or `0.0.0.0` default outside Docker.
- Docker: `EXPOSE` only the app port; run as non-root (`USER node`); publish on loopback in examples (`-p 127.0.0.1:3000:3000`); production sits behind a TLS reverse proxy.
- Swagger (`/docs`, `/docs.json`) is **off by default** (`SWAGGER_ENABLED=false`) and must stay disabled in production unless explicitly required.

### 8.10 Secrets and dependencies
- No secret in code, tests (other than fixed test-only values in `vitest.config.ts`), README, logs, or commits. `.env` is git-ignored; only `.env.example` with placeholders is committed.
- Before adding a dependency: is it necessary, maintained, widely used, and free of known vulnerabilities? Prefer Node built-ins. Pin via `package-lock.json`. Run `npm audit` after changes and report findings.
- Never add dependencies to bypass a rule (e.g., a "permissive CORS" package).

### 8.11 File uploads (not implemented — keep it that way until requested)
Do **not** add multer/busboy or upload routes unprompted. When requested, `upload.middleware.ts` TODO checklist is mandatory: MIME allowlist, magic-byte verification (never trust `Content-Type`/extension), max size in MB and max count, sanitized server-generated names, storage outside web root, `Content-Disposition: attachment` + `nosniff`, malware-scan hook, auth + authz + rate limit, Swagger `multipart/form-data` docs, errors `FILE_TYPE_NOT_ALLOWED` (415) / `FILE_TOO_LARGE` (413).

---

## 9. Layer-by-layer implementation rules

### 9.1 Domain
Plain interfaces/types only. Repository interfaces describe **what** is stored/queried, not **how**. If a repository method can fail with a business meaning (duplicate email) the contract says which `AppError` it throws.

### 9.2 Application (use cases)
- One class per use case, `implements UseCase<I, O>`, single public `execute`.
- Dependencies injected through the constructor as **interfaces**. Time is injectable (`now: () => Date`) for testability.
- Throw `AppError`; never return `{ success: false }` objects.
- Do not read env; receive config values through the constructor (see `container.ts`).
- Keep them small. If a use case needs another use case's logic, extract a service (like `AuthSessionService`), do not call use cases from use cases.

### 9.3 Infrastructure
- Implements ports/interfaces exactly; no extra public API that other layers start depending on.
- Maps third-party errors to `AppError` (JWT errors, DB duplicate-key errors). Never leak vendor messages.
- In-memory repositories return **copies**. Real repositories must enforce uniqueness at the DB level (unique index), not only in the use case.

### 9.4 Presentation
- Controllers: parse (`getBody`) → call one use case → `sendSuccess`. No business logic, no repository access, no try/catch that swallows errors (Express 5 forwards async errors automatically).
- Response envelope is fixed: `{ success, message, data, meta? }` / `{ success:false, error:{code,message,details?}, requestId }`. Do not invent new envelope shapes.
- Web vs mobile token delivery lives only in the auth controller helpers (`tokensPayload`, `authPayload`). Do not duplicate that logic elsewhere.
- Routes: `/users/me` must be declared before `/users/:id`.

### 9.5 Composition root
All `new` of concrete classes happens in `container.ts`. A new use case = construct it there and expose it in `useCases`.

---

## 10. Adding a new endpoint — mandatory checklist

Follow in this order. Do not skip steps.

1. **Contract first:** method, path (under `/api/v1`), auth requirement, roles, request shape, response shape, error codes. Add it to the API contract table in the README.
2. **Domain:** new entity fields / repository methods (interface only) if needed.
3. **Application:** write the use case (+ port if a new external capability is needed). Unit test it with in-memory fakes.
4. **Infrastructure:** implement repository/port changes. Wire in `container.ts`.
5. **Schemas:** zod schemas in `presentation/http/schemas/*` using the extended `z`, `.strict()`, localized keys, `.max()` limits. Export `z.infer` types.
6. **Controller method** (thin) + **route** with the full chain: `limiter? → authenticate → authorize? → validate → controller`.
7. **Swagger:** `registry.registerPath` in the matching `swagger/paths/*.paths.ts` with `clientHeadersSchema`, schemas imported from the same files as `validate()`, every status code, `security` for protected routes. Update the manifest in `openapi.e2e.test.ts`.
8. **i18n:** new `messages`/`validation` keys and error codes in all six locales; `npm run check:locales`.
9. **Tests:** happy path, validation errors (localized), auth failure, forbidden role, not found, platform differences (web vs mobile) if tokens are involved.
10. **README:** endpoint docs (purpose, auth, request, responses, errors).
11. Run the verification gate (section 15).

---

## 11. Code templates (copy these shapes)

### Use case
```ts
export class GetSomethingUseCase implements UseCase<GetSomethingInput, SomethingDto> {
  constructor(private readonly things: ThingRepository) {}

  async execute(input: GetSomethingInput): Promise<SomethingDto> {
    const thing = await this.things.findById(input.id);
    if (!thing) throw new AppError('THING_NOT_FOUND');
    return toSomethingDto(thing);
  }
}
```

### Controller method
```ts
getById = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<UserIdParams>(req);
  const user = await this.c.useCases.getUserById.execute({ requester: this.requester(req), targetId: id });
  sendSuccess(req, res, { messageKey: 'USER_FETCHED', data: { user } });
};
```

### Route
```ts
r.get('/:id', validate({ params: userIdParamsSchema }), c.getById); // router already has authenticate
```

### Schema
```ts
export const createThingBodySchema = z.object({
  name: z.string({ required_error: 'FIELD_REQUIRED' }).trim().min(2, 'NAME_TOO_SHORT').max(100, 'NAME_TOO_LONG'),
}).strict();
export type CreateThingBody = z.infer<typeof createThingBodySchema>;
```

### Swagger path
```ts
registry.registerPath({
  method: 'get', path: `${API_BASE_PATH}/users/{id}`, tags: ['Users'], security: secured,
  request: { headers: clientHeadersSchema, params: userIdParamsSchema },
  responses: { 200: jsonResponse(successEnvelope(z.object({ user: publicUserSchema }), 'GetUserResponse'), 'OK'),
    400: errorResponse('UUID_INVALID | HEADER_*'), 401: errorResponse('AUTH_TOKEN_*'), 403: errorResponse('AUTH_FORBIDDEN'), 404: errorResponse('USER_NOT_FOUND') },
});
```

---

## 12. Anti-patterns (reject on sight)

| ❌ Never | ✅ Instead |
|---|---|
| `throw new Error('Invalid token')` | `throw new AppError('AUTH_TOKEN_INVALID')` |
| `res.status(400).json({ message: 'bad' })` in a controller | throw `AppError`; the error handler responds |
| Hard-coded English text in code | locale key in all six JSON files |
| Reading `req.body.email` | `getBody<LoginBody>(req).email` after `validate` |
| `import { z } from 'zod'` in a schema file | `import { z } from './zod'` |
| Importing `bcryptjs`/`express`/`zod` in `application/` | define a port; implement in `infrastructure/` |
| `new LoginUseCase(...)` in a controller/route | wire it in `container.ts` |
| `process.env.X` anywhere but `config/env.ts` | add to the zod env schema, pass via container |
| Returning tokens in the body for `web` | HttpOnly cookies only |
| `origin: '*'` or reflecting origin | allowlist in `CORS_ORIGINS` |
| `role` accepted from request bodies | roles only from DB/seed; schemas are `.strict()` |
| `any`, `as any`, `// @ts-ignore` | precise types / `unknown` + narrowing |
| `console.log(user)` / logging tokens | pino with redaction; never log secrets |
| Route without `validate`/`authenticate`/Swagger | complete the per-route chain and docs |
| Different messages for "no such email" vs "wrong password" | one `AUTH_INVALID_CREDENTIALS` |
| Skipping tests/lint "to save time" | run the full gate (section 15) |
| Opening extra ports / `--inspect` in scripts | single `PORT` on `HOST` |
| Committing `.env` or real secrets | `.env.example` placeholders only |
| Generic abstractions "for later" (base classes, factories, plugin systems) | write the simplest explicit code |

---

## 13. Logging, config, and observability

- Use the injected pino `logger` (`req.log` in request scope). Levels: `error` for 5xx/unexpected, `warn` for suspicious security events (refresh reuse), `info` for lifecycle, `debug` for development only.
- Every request has `X-Request-Id` (incoming value accepted only if it matches `[A-Za-z0-9-]{8,64}`); include `requestId` in error bodies and logs.
- All configuration comes from `.env` through `config/env.ts`. A new setting requires: zod entry, `.env.example` entry with a safe default/placeholder, README table row.
- Graceful shutdown (`SIGTERM`/`SIGINT`) is required; do not remove it. Unhandled rejections/exceptions are logged and terminate the process.

---

## 14. Testing rules

- Unit tests for use cases (in-memory fakes, injected clock), token service, OTP service, locales.
- E2E tests with `supertest` for every endpoint: success, validation, auth, forbidden, localized errors (at least `en` + one other language), web vs mobile behavior.
- Security tests stay green: helmet headers present, no `x-powered-by`, CORS rejects unknown origins, body size limit, malformed JSON, unsupported media type, rate limit, no stack traces, `requestId` present.
- OpenAPI test enforces the endpoint manifest: nothing undocumented, nothing missing, headers/security declared.
- Never delete or weaken a test to make a change pass. Fix the code or ask the owner.
- Tests must be isolated (fresh app/state per file) and deterministic (no real network, no real time dependence — use the injected clock or fake timers).

---

## 15. Verification gate (run before declaring any task done)

```bash
npm run typecheck && npm run lint && npm run check:locales && npm run test && npm run build
# or: npm run verify
```

Then self-review:

- [ ] Layer/dependency grep checks from section 2.2 print nothing.
- [ ] `grep -rn "console\.log" src` and `grep -rnE ": any\b|as any" src` print nothing.
- [ ] Every new/changed route has: `validate`, `authenticate`/`authorize` as required, limiter if sensitive, Swagger path, tests, README entry.
- [ ] Every new error/message/validation key exists in all six locales.
- [ ] No secret, token, OTP, or password is logged or returned.
- [ ] `.env` is untracked; `.env.example` is updated for any new setting.
- [ ] No new port, listener, or CORS/helmet/rate-limit relaxation was introduced.
- [ ] No unrequested features or abstractions were added.

State explicitly in your final message which checks you ran and their results. If you could not run something, say so — never claim it passed.

---

## 16. Git and repository rules

- The GitHub repository is `Node-JS-Clean-Arc-Template` and it is **PRIVATE. It must never be made public.** Never use `--public`/`--internal`; never change visibility; after any repo creation/settings change verify with `gh repo view --json visibility` that it is `PRIVATE`.
- Default branch `main`. **Never force-push**, never rewrite published history, never commit directly secrets/`.env`/`node_modules`/`dist`.
- Commit messages must strictly follow this format in English:

  ```
  Title (e.g. feat: add login endpoint)

  - detail 1 (e.g. created login.use-case.ts)
  - detail 2 (e.g. added login route to auth.routes.ts)
  ```

  Every change must be noted in a maximally detailed format. Any number of details can be added as bullet points. The primary rule is that everything must be written in detail. One logical change per commit.
- Never push without: green verification gate, `README.md` updated, `AGENT.md` present.
- Do not request, print, or store GitHub tokens or other credentials. If `gh` is unauthenticated, stop and ask the owner to authenticate.

---

## 17. Known TODOs (leave as TODO unless the owner asks)

- Real database (MongoDB/Firebase) behind the repository interfaces (`create-persistence.ts`).
- Real OTP delivery (`OtpSender` implementation; then set `OTP_EXPOSE_IN_RESPONSE=false` everywhere).
- File upload (security checklist in `upload.middleware.ts`).
- Redis-backed rate-limit store for multi-instance deployments.
- Cleanup job for expired sessions/OTPs (TTL indexes in real databases).
- Immediate access-token revocation (currently stateless until the 15-minute expiry; disabled users lose access at next login/refresh).

Do not silently implement these. Leave the seam and the TODO comment intact.

---

## 18. When in doubt

1. Re-read sections 0, 2, 8.
2. Choose the simplest design that keeps the dependency rule and all security rules intact.
3. If a requirement is ambiguous or would break a rule, **ask the owner a single concrete question** instead of guessing.
4. Never reduce security, validation, localization, or documentation to ship faster.
