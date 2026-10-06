# Node.js Clean Architecture Auth Template

This is a production-ready authentication backend built using **Clean Architecture** principles. 
It supports multiple languages (i18n), robust validation, robust security, OTP-based password resets, and hybrid token delivery for web and mobile clients. 
Technologies used in this project include Node.js, Express 5, TypeScript, Zod, and Pino.

## Tech Stack

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="Express.js" src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white">
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white">
</p>

## Packages

<p>
  <a href="https://www.npmjs.com/package/express"><img alt="express" src="https://img.shields.io/badge/express-v5.0-000000?style=for-the-badge&logo=express&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/typescript"><img alt="typescript" src="https://img.shields.io/badge/typescript-v5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/zod"><img alt="zod" src="https://img.shields.io/badge/zod-v3.0-3068B7?style=for-the-badge&logo=npm&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/jsonwebtoken"><img alt="jsonwebtoken" src="https://img.shields.io/badge/jsonwebtoken-v9.0-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/bcryptjs"><img alt="bcryptjs" src="https://img.shields.io/badge/bcryptjs-v3.0-338?style=for-the-badge&logo=npm&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/dotenv"><img alt="dotenv" src="https://img.shields.io/badge/dotenv-v16.0-ECD53F?style=for-the-badge&logo=dotenv&logoColor=black"></a>
  <a href="https://www.npmjs.com/package/helmet"><img alt="helmet" src="https://img.shields.io/badge/helmet-v8.0-000000?style=for-the-badge&logo=npm&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/cors"><img alt="cors" src="https://img.shields.io/badge/cors-v2.8-000000?style=for-the-badge&logo=npm&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/cookie-parser"><img alt="cookie-parser" src="https://img.shields.io/badge/cookie--parser-v1.4-000000?style=for-the-badge&logo=npm&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/express-rate-limit"><img alt="express-rate-limit" src="https://img.shields.io/badge/express--rate--limit-v7.5-000000?style=for-the-badge&logo=npm&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/pino"><img alt="pino" src="https://img.shields.io/badge/pino-v9.0-2E8B57?style=for-the-badge&logo=npm&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/swagger-ui-express"><img alt="swagger-ui-express" src="https://img.shields.io/badge/swagger--ui--express-v5.0-85EA2D?style=for-the-badge&logo=swagger&logoColor=black"></a>
</p>

## API Documentation

When the server is running and `SWAGGER_ENABLED=true` is set, deployed Swagger docs are available at:

```text
http://localhost:3000/docs
```

The OpenAPI specification is heavily integrated with Zod via `@asteasolutions/zod-to-openapi`.

## API Endpoints

### Required Headers
All `/api/v1` routes require:
- `X-Language`: `az`, `en`, `ru`, `tr`, `de`, or `es` (for multi-language error messages).
- `X-Platform`: `web` or `mobile` (controls how tokens are returned).

### Auth

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/register` | Register a new user | No |
| POST | `/api/v1/auth/login` | Login and receive tokens | No |
| POST | `/api/v1/auth/refresh` | Rotate the refresh token | Refresh token |
| POST | `/api/v1/auth/logout` | Revoke the current refresh token | Refresh token |
| POST | `/api/v1/auth/forgot-password` | Request OTP for password reset | No |
| POST | `/api/v1/auth/verify-otp` | Verify OTP and get reset token | No |
| POST | `/api/v1/auth/change-password` | Change password (revokes all sessions)| Reset token |

### Users

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/users/me` | Get your profile | Bearer |
| GET | `/api/v1/users/:id` | Get specific user by ID | Bearer |
| GET | `/api/v1/users` | List all users (Admin only) | Bearer (Admin) |

## Auth Token Delivery

The API supports separate token delivery for web and mobile clients using the `X-Platform` header:

- **Web clients** (`X-Platform: web`): Responses include `accessToken` in the JSON body and set `refreshToken` as an `httpOnly`, `secure`, `sameSite=strict` cookie.
- **Mobile clients** (`X-Platform: mobile`): Responses include both `accessToken` and `refreshToken` in the JSON body, and no cookie is set.

Web response body:

```json
{
  "success": true,
  "requestId": "uuid-v4",
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "John Doe",
      "role": "user"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

Mobile response body:

```json
{
  "success": true,
  "requestId": "uuid-v4",
  "message": "Login successful",
  "data": {
    "user": { ... },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

Refresh tokens rotate on every `/api/v1/auth/refresh` call. If a stolen/old refresh token is re-used, the system detects a replay attack and revokes all active sessions for that user.

### Mobile Client Guidance

- Send `X-Platform: mobile` on every request.
- See `MOBILE_INTEGRATION_GUIDE.md` for a comprehensive guide on building interceptors and handling responses.

## Project Structure (Clean Architecture)

```text
Node-JS-Clean-Arc-Template
|-- src
|   |-- application        (Use cases, DTOs, Ports, Mappers)
|   |-- config             (Environment variables, Constants)
|   |-- domain             (Entities, Enums, Repository Interfaces)
|   |-- infrastructure     (Repository implementations, security adapters, pino)
|   |-- presentation       (Express routes, controllers, middlewares, Swagger)
|   |-- shared             (i18n locales, custom errors, types)
|   |-- app.ts             (Express configuration)
|   |-- container.ts       (Dependency Injection / Composition root)
|   `-- server.ts          (Entry point)
|-- tests                  (E2E and Unit tests)
|-- .env.example
|-- Dockerfile
`-- MOBILE_INTEGRATION_GUIDE.md
```

## Environment Variables

> **⚠️ TODO: SECURITY WARNING ⚠️** 
> The secrets provided below are just dummy/test secrets for you to start quickly. 
> **You MUST change these secrets before deploying to production!** Do not use these exact strings in a real environment.

Before running the app, create a `.env` file in the project root:

```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=false
LOG_LEVEL=debug
SWAGGER_ENABLED=true

# TODO: MUST CHANGE IN PRODUCTION!
JWT_ACCESS_SECRET=dummy_access_secret_super_secure_123!
JWT_REFRESH_SECRET=dummy_refresh_secret_super_secure_456!
JWT_RESET_SECRET=dummy_reset_secret_super_secure_789!
OTP_HMAC_SECRET=dummy_otp_hmac_secret_super_secure_000!

JWT_ACCESS_EXPIRES_IN_SEC=900
JWT_REFRESH_EXPIRES_IN_SEC=2592000
JWT_RESET_EXPIRES_IN_SEC=900
BCRYPT_COST=12
OTP_EXPOSE_IN_RESPONSE=true
CORS_ORIGINS=http://localhost:3000,http://localhost:8080
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/MegrurNiftiyev/Node-JS-Clean-Arc-Template.git
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your secrets!
```

4. Run the application:

```bash
npm run dev
```

## Security

- **Helmet** is enabled to enforce secure HTTP headers.
- **CORS** uses a strict environment-driven origin allow-list with `credentials: true`.
- Input validation is strictly enforced using **Zod**. Every body, param, and query string is sanitized and validated.
- Rate limiting is applied globally, with stricter limits on `/api/v1/auth` and OTP routes.
- Passwords are hashed with **bcryptjs** (cost factor 12).
- OTPs are secured using timing-safe HMAC equality checks to prevent brute-force and timing attacks.
- Multi-token architecture (Access + Refresh + Reset) minimizes exposure window.

## Error Responses

All errors return a consistent, localized JSON format based on the `X-Language` header:

```json
{
  "success": false,
  "requestId": "uuid-v4",
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "details": []
  }
}
```

Validation errors map directly to the fields that failed:

```json
{
  "success": false,
  "requestId": "uuid-v4",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "body.email",
        "message": "Email formatı yanlışdır."
      }
    ]
  }
}
```

## License

This project is licensed under the MIT License.
