# Node.js Clean Architecture Auth Template

This is a production-ready, highly scalable authentication backend built meticulously on **Clean Architecture** principles. 
Unlike standard MVC backends, this project completely separates business logic from external frameworks. It is designed to be easily extensible, fully type-safe, and highly secure.

It features multi-language support (i18n), strict data validation, OTP-based password recovery, robust security headers, and an intelligent hybrid token delivery system that serves both Web (via `HttpOnly` cookies) and Mobile (via JSON payload) clients simultaneously.

## Tech Stack

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="Express.js" src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white">
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white">
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

---

## 🌟 Key Features
1. **True Clean Architecture**: Zero dependency on frameworks in the core domain and application layers. You can swap Express for Fastify or MongoDB for PostgreSQL without touching business logic.
2. **Hybrid Token Architecture**: Securely handles multiple platforms. Mobile apps receive tokens in JSON body, web apps receive tokens automatically via secure `HttpOnly` cookies to prevent XSS.
3. **Advanced Security**: Stolen token detection (Refresh Token Replay), bcrypt hashing, timing-safe HMAC OTPs, brute-force rate limiters, Helmet headers.
4. **Complete Multi-Language (i18n)**: Out of the box support for 6 languages (`en, az, ru, tr, de, es`). Every single validation error and response message is translated based on the user's `X-Language` header.
5. **Auto-Generated Swagger**: Using `@asteasolutions/zod-to-openapi`, the OpenAPI documentation is automatically derived from the Zod schemas used to validate inputs. No duplicated code.

---

## 📚 API Documentation

When the server is running and `SWAGGER_ENABLED=true` is set, deployed Swagger docs are available at:

```text
http://localhost:3000/docs
```

To test endpoints requiring authentication directly in Swagger, use the **Authorize** button. If you are simulating a mobile app, set `X-Platform` to `mobile` inside the endpoint's parameter inputs.

---

## 🚀 API Endpoints

### Required Headers
Every route requires two custom headers for full functionality:
- `X-Language`: E.g., `az`, `en`, `ru`, `tr`, `de`, or `es`. Fallbacks to English if invalid.
- `X-Platform`: `web` or `mobile`. Critical for correct token delivery.

### Auth Module

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/auth/register` | Register a new user | No |
| POST | `/api/v1/auth/login` | Login and receive access/refresh tokens | No |
| POST | `/api/v1/auth/refresh` | Rotate the refresh token (gets new tokens) | Refresh token |
| POST | `/api/v1/auth/logout` | Revoke the current refresh token securely | Refresh token |
| POST | `/api/v1/auth/forgot-password` | Request a 6-digit OTP for password reset | No |
| POST | `/api/v1/auth/verify-otp` | Verify OTP and receive a temporary reset token | No |
| POST | `/api/v1/auth/change-password` | Change password (revokes all active sessions) | Reset token |

### Users Module

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/users/me` | Get the currently authenticated user's profile | Yes (Bearer) |
| GET | `/api/v1/users/:id` | Get specific user by ID (Target user or Admin) | Yes (Bearer) |
| GET | `/api/v1/users` | List all registered users (Admin only) | Yes (Admin) |

---

## 🔐 Auth Token Delivery

The API supports separate token delivery rules for web and mobile clients using the `X-Platform` header:

### Web Clients (`X-Platform: web`)
Responses include `accessToken` inside the JSON body. The `refreshToken` is **never** exposed to Javascript; it is set entirely by the server as an `httpOnly`, `secure`, `sameSite=strict` cookie.
```json
{
  "success": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Login successful",
  "data": {
    "user": {
      "id": "abc-123",
      "email": "web@example.com",
      "fullName": "Web User",
      "role": "user"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### Mobile Clients (`X-Platform: mobile`)
Mobile applications cannot easily rely on `HttpOnly` cookies. The server includes **both** `accessToken` and `refreshToken` securely in the JSON response body. No cookies are set.
```json
{
  "success": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
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

### Security Alert: Refresh Token Replay Detection
Refresh tokens rotate on every `/api/v1/auth/refresh` call. If a stolen or old refresh token is reused, the system automatically detects a replay attack. As a protective measure, **all active sessions for that user are immediately revoked.**

### Mobile Client Guidance
- Always send `X-Platform: mobile` on every request.
- Store your `refreshToken` in `EncryptedSharedPreferences` (Android) or `Keychain` (iOS).
- Send the `refreshToken` in the JSON request body for `/auth/refresh` and `/auth/logout`.
- Keep the `accessToken` in memory.
- For more advanced interceptor setups, read the provided `MOBILE_INTEGRATION_GUIDE.md` file.

---

## 🏗 Detailed Project Structure (Clean Architecture)

This project strictly adheres to Uncle Bob's Clean Architecture. Dependencies point *inwards*.

```text
Node-JS-Clean-Arc-Template
|-- src
|   |
|   |-- domain/                      # 1. CORE ENTERPRISE LOGIC (Innermost layer)
|   |   |-- entities/                # Pure TS Interfaces (User, RefreshSession, Otp)
|   |   |-- enums/                   # Constants (Role, Platform)
|   |   `-- repositories/            # Repository INTERFACES only. No implementations!
|   |
|   |-- application/                 # 2. APPLICATION LOGIC (Use Cases)
|   |   |-- use-cases/               # One file = One Use Case (e.g., login.use-case.ts)
|   |   |-- ports/                   # External service interfaces (TokenService, PasswordHasher)
|   |   |-- dto/                     # Data Transfer Objects
|   |   `-- mappers/                 # Converts Entity -> DTO
|   |
|   |-- infrastructure/              # 3. EXTERNAL SERVICES & PERSISTENCE
|   |   |-- persistence/             # Real DB Implementations (In-Memory, Mongo, Firebase)
|   |   |-- security/                # JWT Generation, Bcrypt Hashing, HMAC OTP verification
|   |   |-- logging/                 # Pino logger configuration
|   |   `-- seed/                    # Initial database seeders
|   |
|   |-- presentation/                # 4. DELIVERY MECHANISM (HTTP / Express)
|   |   `-- http/
|   |       |-- controllers/         # Receives HTTP request -> Calls Use Case -> Sends HTTP response
|   |       |-- middlewares/         # Validation, Rate Limit, Auth checks, Error Handler
|   |       |-- routes/              # Express Router definitions
|   |       |-- schemas/             # Zod validation schemas
|   |       `-- swagger/             # OpenAPI endpoint registrations
|   |
|   |-- shared/                      # 5. CROSS-CUTTING CONCERNS
|   |   |-- errors/                  # AppError class and Error Codes
|   |   |-- i18n/                    # Localization JSON files (en, az, ru, tr, de, es)
|   |   `-- types/                   # Global TypeScript declaration extensions (Express.User)
|   |
|   |-- config/                      # Environment loading and global constants
|   |-- container.ts                 # COMPOSITION ROOT. The ONLY file where layers are wired together.
|   |-- app.ts                       # Express App setup (Middlewares -> Routes)
|   `-- server.ts                    # Entry point. Starts the HTTP server listening on PORT.
|
|-- tests/                           # Unit and E2E Tests (Vitest & Supertest)
|-- Dockerfile                       # Multi-stage optimized Docker build
|-- MOBILE_INTEGRATION_GUIDE.md      # Documentation specifically for Mobile Developers
|-- package.json
`-- tsconfig.json
```

---

## 🌐 Environment Variables

> **⚠️ TODO: SECURITY WARNING ⚠️** 
> The secrets provided below are just dummy/test secrets for you to start quickly locally. 
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

# Token Expirations
JWT_ACCESS_EXPIRES_IN_SEC=900
JWT_REFRESH_EXPIRES_IN_SEC=2592000
JWT_RESET_EXPIRES_IN_SEC=900
BCRYPT_COST=12

# Developer Features
# Set OTP_EXPOSE_IN_RESPONSE to false in production!
OTP_EXPOSE_IN_RESPONSE=true 
CORS_ORIGINS=http://localhost:3000,http://localhost:8080
```

---

## 🛠 Installation & Usage

1. Clone the repository:
```bash
git clone https://github.com/MegrurNiftiyev/Node-JS-Clean-Arc-Template.git
cd Node-JS-Clean-Arc-Template
```

2. Install dependencies (Requires Node.js 20.11+):
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your real secrets if deploying!
```

4. Run the development server (uses `tsx` for hot-reloading):
```bash
npm run dev
```

5. Run Tests (Vitest):
```bash
npm run test
```

### Docker Deployment
This project includes a highly optimized, multi-stage `Dockerfile`. It builds the TypeScript code and then runs it on a lightweight `node:22-alpine` image as an unprivileged user for maximum security.

Build the image:
```bash
docker build -t node-clean-arch .
```
Run the container:
```bash
docker run -p 3000:3000 --env-file .env node-clean-arch
```

---

## 🛡 Security & Validation Features

- **Helmet**: Automatically sets 14+ secure HTTP headers (HSTS, CSP, X-Content-Type-Options).
- **Zod Validation**: Every single input (`body`, `query`, `params`) is validated and strictly stripped of unknown fields (`.strict()`) before the controller even executes.
- **CORS**: Uses a strict environment-driven origin allow-list with `credentials: true`. No wildcard `*` vulnerabilities.
- **Rate Limiting**: Protects against Brute Force attacks. Stricter limits applied specifically to OTP and Auth routes.
- **Bcrypt**: Passwords hashed with an adjustable cost factor (Default 12).
- **HMAC OTPs**: OTPs are never stored in plain text. They are hashed using HMAC and compared using `crypto.timingSafeEqual` to prevent timing attacks.

---

## 🛑 Error Responses & Localization

All operational errors return a consistent, standard JSON format. The exact error messages are dynamically loaded from `src/shared/i18n/locales/*.json` depending on the user's `X-Language` header. 

Standard Error Example:
```json
{
  "success": false,
  "requestId": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "details": []
  }
}
```

Validation Error Example (The array helps Frontend highlight specific text fields):
```json
{
  "success": false,
  "requestId": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "body.email",
        "message": "Please enter a valid email address."
      },
      {
        "field": "body.password",
        "message": "Password must be at least 8 characters."
      }
    ]
  }
}
```

## License

This project is licensed under the MIT License.
