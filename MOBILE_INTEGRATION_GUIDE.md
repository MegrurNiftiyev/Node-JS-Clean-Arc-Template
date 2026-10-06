# Mobile Integration Guide (Flutter / iOS / Android)

This document is a comprehensive guide for mobile developers (Flutter, Swift, Kotlin, etc.) to integrate with the Node.js Clean Architecture Authentication Backend.

## 1. Global Requirements & Headers

Every request to the `/api/v1/*` routes **must** include the following headers. Since mobile apps cannot securely use `HttpOnly` cookies, you must explicitly declare the mobile platform to receive tokens in the JSON response body.

| Header | Value | Description |
|---|---|---|
| `X-Platform` | `mobile` | **CRITICAL:** Tells the backend not to use cookies and to return tokens in the JSON response. |
| `X-Language` | `az`, `en`, `ru`, `tr`, `de`, `es` | Determines the language of the error messages and API responses. |
| `Content-Type` | `application/json` | All request bodies must be JSON. |

### Authentication Header
For routes requiring authentication (e.g., fetching user data), include the Access Token:
```http
Authorization: Bearer <your_access_token>
```

---

## 2. Standard Response Envelope

All API responses follow a strict envelope format. **Never** assume the shape of the data outside this envelope.

### Success Response (200 / 201)
```json
{
  "success": true,
  "requestId": "uuid-string",
  "message": "Localized success message",
  "data": { ... }, // Payload goes here
  "meta": { ... } // Optional (e.g., pagination)
}
```

### Error Response (400, 401, 403, 404, 409, 429, 500)
```json
{
  "success": false,
  "requestId": "uuid-string",
  "error": {
    "code": "ERROR_CODE_STRING",
    "details": [
      {
        "field": "body.email", // The exact field that failed (if applicable)
        "message": "Localized error message"
      }
    ]
  }
}
```

---

## 3. Token Lifecycle & Interceptor Logic

Mobile apps must handle **Access** and **Refresh** tokens manually. 

### Best Practice for Mobile Interceptors (e.g., Flutter Dio Interceptor):
1. Save `accessToken` and `refreshToken` securely (e.g., `flutter_secure_storage`).
2. Attach `accessToken` to the `Authorization: Bearer ...` header.
3. If an API call returns `401 AUTH_TOKEN_EXPIRED`:
   - Pause outgoing requests.
   - Call `POST /api/v1/auth/refresh` with the `refreshToken`.
   - If successful, save the new tokens and retry the paused requests.
   - If refresh returns `401 AUTH_REFRESH_TOKEN_INVALID` or `AUTH_REFRESH_TOKEN_REUSED`, the user's session is dead. Clear local storage and navigate to the Login screen.

---

## 4. Endpoints

### 4.1. Register
- **Path:** `POST /api/v1/auth/register`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "email": "user@example.com", 
    "password": "Password123!", // min 8, max 100, requires upper, lower, number
    "fullName": "John Doe" // min 2, max 100
  }
  ```
- **Success (201):**
  ```json
  {
    "data": {
      "user": { "id": "...", "email": "user@example.com", "fullName": "John Doe", "role": "user" },
      "tokens": {
        "accessToken": "ey...", // TTL: 15 mins
        "refreshToken": "ey..." // TTL: 7 days
      }
    }
  }
  ```
- **Errors:** `400 VALIDATION_ERROR`, `409 USER_EMAIL_ALREADY_EXISTS`.

### 4.2. Login
- **Path:** `POST /api/v1/auth/login`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!"
  }
  ```
- **Success (200):** Same structure as Register. Returns `user` and `tokens`.
- **Errors:** `401 AUTH_INVALID_CREDENTIALS`, `403 AUTH_ACCOUNT_DISABLED`.

### 4.3. Refresh Token
- **Path:** `POST /api/v1/auth/refresh`
- **Auth:** Needs Refresh Token
- **Request Body:**
  ```json
  {
    "refreshToken": "ey..." // The old refresh token
  }
  ```
- **Success (200):** Returns newly rotated tokens. The old refresh token is immediately invalidated.
  ```json
  {
    "data": {
      "tokens": { "accessToken": "...", "refreshToken": "..." }
    }
  }
  ```
- **Errors:** `401 AUTH_REFRESH_TOKEN_INVALID`, `401 AUTH_REFRESH_TOKEN_REUSED` (Stolen token detected, all sessions revoked).

### 4.4. Logout
- **Path:** `POST /api/v1/auth/logout`
- **Auth:** Public (but needs the refresh token to revoke it)
- **Request Body:**
  ```json
  {
    "refreshToken": "ey..." 
  }
  ```
- **Success (200):** Returns `data: null`.
- **Note:** Mobile app should immediately delete tokens locally and navigate to the Login screen.

### 4.5. Forgot Password (OTP Request)
- **Path:** `POST /api/v1/auth/forgot-password`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "email": "user@example.com"
  }
  ```
- **Success (200):**
  ```json
  {
    "data": {
      "expiresInSeconds": 600,
      "otp": "123456" // ONLY RETURNED IF `OTP_EXPOSE_IN_RESPONSE=true` (Dev mode)
    }
  }
  ```
- **Errors:** `429 OTP_RESEND_COOLDOWN` (Must wait 60s), `429 RATE_LIMIT_EXCEEDED`.

### 4.6. Verify OTP
- **Path:** `POST /api/v1/auth/verify-otp`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "code": "123456" // 6 digits exactly
  }
  ```
- **Success (200):**
  ```json
  {
    "data": {
      "resetToken": "ey...", // Use this in step 4.7
      "expiresInSeconds": 900
    }
  }
  ```
- **Errors:** `400 OTP_INVALID`, `400 OTP_EXPIRED`, `429 OTP_TOO_MANY_ATTEMPTS` (Account locked from OTP for security after 5 failures).

### 4.7. Change Password
- **Path:** `POST /api/v1/auth/change-password`
- **Auth:** Reset Token (in body, NOT in header)
- **Request Body:**
  ```json
  {
    "resetToken": "ey...", // Token received from Verify OTP step
    "newPassword": "NewPassword123!"
  }
  ```
- **Success (200):** Returns `data: null`.
- **Note:** Changing password revokes ALL active sessions across all devices. User must login again.
- **Errors:** `401 AUTH_RESET_TOKEN_INVALID`.

### 4.8. Get Current User (Profile)
- **Path:** `GET /api/v1/users/me`
- **Auth:** Bearer Access Token
- **Success (200):**
  ```json
  {
    "data": {
      "user": { "id": "...", "email": "...", "fullName": "...", "role": "..." }
    }
  }
  ```
- **Errors:** `401 AUTH_TOKEN_MISSING`, `401 AUTH_TOKEN_INVALID`, `401 AUTH_TOKEN_EXPIRED`, `404 USER_NOT_FOUND`.

---

## 5. Zod Validation Rules & Logic

Mobile frontend validation should mirror the backend Zod schemas to provide immediate feedback:

- **Email**: Must be a valid format, converted to `.toLowerCase()`, max 254 characters.
- **Password**: 
  - Minimum 8 characters
  - Maximum 100 characters
  - At least 1 lowercase letter
  - At least 1 uppercase letter
  - At least 1 number
- **FullName**: Minimum 2 chars, max 100 chars, trimmed.
- **OTP Code**: Exactly 6 characters, numeric string.

When Zod validation fails, the backend returns a `400 VALIDATION_ERROR`. The `details` array will map exact fields:
```json
"details": [
  { "field": "body.password", "message": "Password is too short..." }
]
```

---

## 6. Comprehensive Error Codes List

Mobile apps should switch logic based on the `error.code` string, not just the HTTP status.

| Error Code | HTTP Status | Frontend Action |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Highlight invalid text fields based on `details.field`. |
| `HEADER_PLATFORM_INVALID` | 400 | Dev Error: Ensure `X-Platform: mobile` is set. |
| `HEADER_LANGUAGE_INVALID` | 400 | Dev Error: Send a valid `X-Language`. |
| `USER_EMAIL_ALREADY_EXISTS` | 409 | Show "Account already exists" to user. |
| `AUTH_INVALID_CREDENTIALS` | 401 | Show "Incorrect email or password". |
| `AUTH_ACCOUNT_DISABLED` | 403 | Show "Your account has been deactivated". |
| `AUTH_TOKEN_MISSING` | 401 | Nav to Login. |
| `AUTH_TOKEN_EXPIRED` | 401 | Silently trigger Token Refresh. |
| `AUTH_TOKEN_INVALID` | 401 | Nav to Login (Token tampered). |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | Nav to Login (Session expired/revoked). |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | Nav to Login (Security alert: session hijacked/reused). |
| `OTP_INVALID` | 400 | Show "Wrong code. Try again". |
| `OTP_EXPIRED` | 400 | Show "Code expired. Request a new one". |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | Show "Too many failed attempts. Try again later". |
| `OTP_RESEND_COOLDOWN` | 429 | Start a 60s countdown timer on the UI. |
| `AUTH_RESET_TOKEN_INVALID` | 401 | Show "Session expired, please verify OTP again". |
| `RATE_LIMIT_EXCEEDED` | 429 | Show "Too many requests. Slow down". |
| `INTERNAL_SERVER_ERROR` | 500 | Show generic "Something went wrong" UI. |
