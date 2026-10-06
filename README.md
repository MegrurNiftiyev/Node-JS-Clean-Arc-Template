# Node-JS-Clean-Arc-Template

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2020-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-blue.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

Production-ready Node.js + TypeScript Clean Architecture auth template: JWT, OTP password reset, RBAC, i18n (6 languages), zod, helmet, Swagger.

## Features

- **Clean Architecture**: Domain, Application, Infrastructure, and Presentation layers perfectly separated.
- **Security-First JWT**: Strict web (HttpOnly cookies) and mobile (bearer tokens) separation.
- **Refresh Rotation**: Automatic refresh token rotation with immediate session revocation on replay.
- **OTP Password Reset**: HMAC-based 6-digit OTP verification.
- **Role-Based Access Control**: Simple `user` and `admin` distinction.
- **Multi-language i18n**: Out-of-the-box support for English, Azerbaijani, Russian, Turkish, German, and Spanish.
- **Validation**: Strict schema validation with Zod.
- **Robust HTTP**: Rate limits, helmet security headers, and safe CORS.
- **Interactive Documentation**: Swagger / OpenAPI integration perfectly synchronized with Zod schemas.
- **Database Agnostic**: Interface-first repositories (in-memory provider included).

## Quick start

### Prerequisites
- Node.js >= 20
- npm >= 10

### Installation
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Generate secure secrets for your `.env` (you can use `npm run generate-secrets`).
4. Start the development server:
   ```bash
   npm run dev
   ```

The API will be available at `http://127.0.0.1:3000`.
- Health check: `http://127.0.0.1:3000/health`
- Swagger Docs: `http://127.0.0.1:3000/docs`

## Required headers

All API routes under `/api/v1` strictly require specific client headers.

| Header | Allowed values | Required | Description |
|---|---|---|---|
| `X-Platform` | `web`, `mobile` | **Yes** | Web uses HttpOnly cookies; mobile uses body/bearer. |
| `X-Language` | `az`, `en`, `ru`, `tr`, `de`, `es` | **Yes** | Controls the language of API responses. |
| `X-Region` | ISO 3166-1 alpha-2 (e.g. `AZ`) | No | Analytical tracking. |

## Architecture

The project strictly follows Dependency Inversion principles. Dependencies flow strictly inward.

- `src/domain`: Enterprise business rules, entities, and enums.
- `src/application`: Use cases, DTOs, and interface ports for dependencies.
- `src/infrastructure`: Concrete implementations (repositories, hashing, tokens, etc).
- `src/presentation`: HTTP framework (Express), controllers, and middleware.
- `src/container.ts`: The Composition Root that wires dependencies together.

Request Lifecycle Pipeline:
1. `requestId` middleware
2. `pino-http` logging
3. `swagger` (if enabled)
4. `helmet` and `cors`
5. `rateLimit` and `noStore`
6. `clientContext` (validates X-Platform/X-Language)
7. `express.json` + `enforceJson`
8. Auth + Role Check Middleware
9. Zod Validation Middleware
10. Controller

## Authentication design

Tokens:
- **Access Token**: Stateless, 15 min TTL.
- **Refresh Token**: Stateful, 7 days TTL. Rotated on every use.
- **Reset Token**: Stateful, 15 min TTL, single use.

Platform delivery:
- **web**: `X-Platform: web`. Tokens are delivered via `HttpOnly`, `SameSite=Strict` cookies. The frontend cannot access them.
- **mobile**: `X-Platform: mobile`. Tokens are delivered in the JSON body, and the client sends them via `Authorization: Bearer <token>`.

Security mechanisms:
- Reusing an old refresh token instantly revokes ALL active sessions for that user.
- Password change invalidates all existing refresh sessions.
- CSRF is mitigated by `SameSite=Strict` and custom `X-*` headers.

## API reference

| # | Method & path | Auth | Request | Success | Errors |
|---|---|---|---|---|---|
| 1 | `POST /api/v1/auth/register` | public | body `{ email, password, fullName }` | **201** `data: { user, tokens? }` | 400 VALIDATION_ERROR/HEADER_*/MALFORMED_JSON, 409 USER_EMAIL_ALREADY_EXISTS, 415, 429 |
| 2 | `POST /api/v1/auth/login` | public | body `{ email, password }` | **200** `data: { user, tokens? }` | 400, 401 AUTH_INVALID_CREDENTIALS, 403 AUTH_ACCOUNT_DISABLED, 429 |
| 3 | `POST /api/v1/auth/refresh` | refresh token | mobile: body `{ refreshToken }`; web: cookie `refresh_token` (no body) | **200** mobile `data: { tokens }`; web `data: null` + new cookies | 401 AUTH_REFRESH_TOKEN_INVALID / AUTH_REFRESH_TOKEN_REUSED, 403 AUTH_ACCOUNT_DISABLED |
| 4 | `POST /api/v1/auth/logout` | public | mobile: body `{ refreshToken? }`; web: cookie | **200** `data: null`; web cookies cleared | 400 |
| 5 | `POST /api/v1/auth/forgot-password` | public | body `{ email }` | **200** `data: { expiresInSeconds, otp? }` (`otp` only if `OTP_EXPOSE_IN_RESPONSE=true`) | 400, 429 OTP_RESEND_COOLDOWN / RATE_LIMIT_EXCEEDED |
| 6 | `POST /api/v1/auth/verify-otp` | public | body `{ email, code }` | **200** `data: { resetToken, expiresInSeconds }` | 400 OTP_INVALID / OTP_EXPIRED, 429 OTP_TOO_MANY_ATTEMPTS |
| 7 | `POST /api/v1/auth/change-password` | reset token | body `{ resetToken, newPassword }` | **200** `data: null`; all sessions revoked | 401 AUTH_RESET_TOKEN_INVALID, 400 VALIDATION_ERROR |
| 8 | `GET /api/v1/users/me` | any role | — | **200** `data: { user }` | 401, 404 USER_NOT_FOUND |
| 9 | `GET /api/v1/users/{id}` | admin: any id; user: own id | path `id` (uuid) | **200** `data: { user }` | 400 UUID_INVALID, 401, 403 AUTH_FORBIDDEN, 404 USER_NOT_FOUND |
| 10 | `GET /api/v1/users` | **admin only** | query `page`, `limit` | **200** `data: { items }`, `meta` | 400, 401, 403 AUTH_FORBIDDEN |
| 11 | `GET /health` | public | — | **200** `data: { status, uptimeSeconds }` | — |

Response envelope format:
```json
{
  "success": true,
  "message": "Signed in successfully.",
  "data": { ... }
}
```

## Error codes

| ErrorCode | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod schema validation failed. |
| `HEADER_PLATFORM_INVALID` | 400 | Missing or invalid X-Platform. |
| `HEADER_LANGUAGE_INVALID` | 400 | Missing or invalid X-Language. |
| `HEADER_REGION_INVALID` | 400 | Invalid X-Region format. |
| `MALFORMED_JSON` | 400 | Express failed to parse JSON. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Request body not application/json. |
| `PAYLOAD_TOO_LARGE` | 413 | JSON body > 10kb. |
| `RATE_LIMIT_EXCEEDED` | 429 | Exceeded IP rate limit. |
| `ROUTE_NOT_FOUND` | 404 | 404 fallback. |
| `CORS_ORIGIN_NOT_ALLOWED`| 403 | Origin not in CORS list. |
| `INTERNAL_SERVER_ERROR`| 500 | Unhandled exception. |
| `USER_NOT_FOUND` | 404 | User by id does not exist. |
| `USER_EMAIL_ALREADY_EXISTS`| 409 | Registering a taken email. |
| `AUTH_INVALID_CREDENTIALS` | 401 | Login failed. |
| `AUTH_ACCOUNT_DISABLED` | 403 | Login/refresh for inactive user. |
| `AUTH_TOKEN_MISSING` | 401 | No access token provided. |
| `AUTH_TOKEN_INVALID` | 401 | Access token malformed/wrong secret. |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token expired. |
| `AUTH_REFRESH_TOKEN_INVALID`| 401 | Refresh token missing/invalid/expired. |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | Stolen/reused refresh token detected. |
| `AUTH_RESET_TOKEN_INVALID` | 401 | Reset token invalid/expired/used. |
| `AUTH_FORBIDDEN` | 403 | Insufficient RBAC role. |
| `OTP_RESEND_COOLDOWN` | 429 | Requesting OTP too frequently. |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | >= 5 wrong OTP attempts. |
| `OTP_INVALID` | 400 | Wrong OTP code. |
| `OTP_EXPIRED` | 400 | OTP code expired. |
| `OTP_FORMAT_INVALID` | 400 | OTP is not 6 digits. |

## Localization

Locales are located in `src/shared/i18n/locales/`.
To add a new language:
1. Add the language code to `SUPPORTED_LANGUAGES` in `src/shared/i18n/languages.ts`.
2. Create `src/shared/i18n/locales/<lang>.json` based on `en.json`.
3. Import and add it to the dictionaries in `src/shared/i18n/translator.ts`.
4. Check translation coverage using `npm run check:locales`.

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment mode. |
| `HOST` | `127.0.0.1` | Binding interface. |
| `PORT` | `3000` | Binding port. |
| `LOG_LEVEL` | `info` | Pino log level. |
| `TRUST_PROXY` | `0` | IP resolution behind proxies. |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed origins (comma separated). |
| `SWAGGER_ENABLED` | `true` | Serve OpenAPI docs at `/docs`. |
| `DB_DRIVER` | `memory` | Implementation of Repositories. |
| `JWT_ACCESS_SECRET` | - | Secret for access token (>= 32 chars). |
| `JWT_REFRESH_SECRET` | - | Secret for refresh token (>= 32 chars). |
| `JWT_RESET_SECRET` | - | Secret for password reset (>= 32 chars). |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | 15 minutes. |
| `REFRESH_TOKEN_TTL_SECONDS`| `604800` | 7 days. |
| `RESET_TOKEN_TTL_SECONDS` | `900` | 15 minutes. |
| `COOKIE_DOMAIN` | `""` | HttpOnly cookie domain. |
| `COOKIE_SECURE` | `false` | True for HTTPS. |
| `BCRYPT_COST` | `12` | Hashing rounds. |
| `OTP_HMAC_SECRET` | - | Secret for OTP generation. |
| `OTP_EXPOSE_IN_RESPONSE` | `false` | **DEV ONLY**. Exposes OTP in JSON response. |
| `OTP_TTL_SECONDS` | `600` | 10 minutes. |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Cooldown between requests. |
| `RATE_LIMIT_MAX` | `100` | Max requests per IP per window. |
| `AUTH_RATE_LIMIT_MAX` | `20` | Max auth requests per IP per window. |
| `OTP_RATE_LIMIT_MAX` | `5` | Max OTP requests per IP per window. |
| `RATE_LIMIT_WINDOW_MS` | `900000` | 15 minutes. |

## Connecting a database
The architecture isolates DB concerns behind the domain ports (`UserRepository`, `RefreshSessionRepository`, `OtpRepository`).
To connect PostgreSQL/MongoDB, create the implementations in `src/infrastructure/persistence/` and wire them into `src/infrastructure/persistence/create-persistence.ts`.

## File uploads (planned)
Refer to the TODO checklist in `src/presentation/http/middlewares/upload.middleware.ts` for safely implementing multipart/form-data logic.

## Sending OTPs for real
Create an email/SMS implementation of the `OtpSender` port and wire it in `src/container.ts`.

## Scripts

- `npm run dev` / `npm start`
- `npm run build`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run check:locales`
- `npm run generate-secrets`

## Docker
Publishing locally:
```bash
docker build -t node-clean-auth .
docker run --env-file .env -p 127.0.0.1:3000:3000 node-clean-auth
```

## Security checklist
- Do not run with `OTP_EXPOSE_IN_RESPONSE=true` in production.
- Use a `BCRYPT_COST` of at least `12`.
- Secure your application behind a TLS reverse proxy.

## License
MIT
