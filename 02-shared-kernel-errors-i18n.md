# 02 — Shared Kernel: Error Catalog, i18n, Locale Files

> Prerequisite: file 01 completed.
> This file creates `src/shared/**`, the six locale JSON files, and `scripts/check-locales.ts`.
> The shared kernel has **no dependency** on domain, application, infrastructure, presentation, or `express`.

---

## 1. Principles

1. Every failure in the system is an `AppError` carrying an `ErrorCode`.
2. `ErrorCode` → HTTP status is defined **once** in `ERROR_HTTP_STATUS`.
3. `ErrorCode` → human text exists **only** in the locale JSON files (never hard-coded in code).
4. The error handler (file 05) translates using the language from the `X-Language` header.
5. Zod validation messages are **i18n keys** (e.g. `'EMAIL_INVALID'`), translated by the error handler into `error.details[].message`.
6. TypeScript must fail to compile when a locale file misses a key, and `npm run check:locales` must fail on any key mismatch between locale files.

---

## 2. Error catalog

`src/shared/errors/error-codes.ts`

```ts
export const ERROR_CODES = [
  // 400 — request shape
  'VALIDATION_ERROR',
  'MALFORMED_JSON',
  'HEADER_PLATFORM_INVALID',
  'HEADER_LANGUAGE_INVALID',
  'HEADER_REGION_INVALID',
  // 401 — authentication
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOKEN_MISSING',
  'AUTH_TOKEN_INVALID',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_REFRESH_TOKEN_INVALID',
  'AUTH_REFRESH_TOKEN_REUSED',
  'AUTH_RESET_TOKEN_INVALID',
  // 403 — authorization
  'AUTH_FORBIDDEN',
  'AUTH_ACCOUNT_DISABLED',
  'CORS_ORIGIN_NOT_ALLOWED',
  // OTP
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_TOO_MANY_ATTEMPTS',
  'OTP_RESEND_COOLDOWN',
  // resources
  'USER_NOT_FOUND',
  'USER_EMAIL_ALREADY_EXISTS',
  'ROUTE_NOT_FOUND',
  // payload / files
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'FILE_TYPE_NOT_ALLOWED',
  'FILE_TOO_LARGE',
  // platform
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  MALFORMED_JSON: 400,
  HEADER_PLATFORM_INVALID: 400,
  HEADER_LANGUAGE_INVALID: 400,
  HEADER_REGION_INVALID: 400,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_TOKEN_MISSING: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_REFRESH_TOKEN_INVALID: 401,
  AUTH_REFRESH_TOKEN_REUSED: 401,
  AUTH_RESET_TOKEN_INVALID: 401,
  AUTH_FORBIDDEN: 403,
  AUTH_ACCOUNT_DISABLED: 403,
  CORS_ORIGIN_NOT_ALLOWED: 403,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  OTP_TOO_MANY_ATTEMPTS: 429,
  OTP_RESEND_COOLDOWN: 429,
  USER_NOT_FOUND: 404,
  USER_EMAIL_ALREADY_EXISTS: 409,
  ROUTE_NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  FILE_TYPE_NOT_ALLOWED: 415,
  FILE_TOO_LARGE: 413,
  RATE_LIMIT_EXCEEDED: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};
```

### When each code is raised (must be reproduced in README, file 06)

| Code | HTTP | Raised when |
|---|---|---|
| `VALIDATION_ERROR` | 400 | zod validation of params/query/body fails (`details[]` filled) |
| `MALFORMED_JSON` | 400 | body is not parseable JSON |
| `HEADER_PLATFORM_INVALID` | 400 | `X-Platform` missing or not `web`/`mobile` |
| `HEADER_LANGUAGE_INVALID` | 400 | `X-Language` missing or unsupported |
| `HEADER_REGION_INVALID` | 400 | `X-Region` present but not 2 letters |
| `AUTH_INVALID_CREDENTIALS` | 401 | wrong email/password (same error for unknown email) |
| `AUTH_TOKEN_MISSING` | 401 | protected route without bearer token (mobile) / access cookie (web) |
| `AUTH_TOKEN_INVALID` | 401 | access token malformed, wrong signature/issuer/audience/`typ` |
| `AUTH_TOKEN_EXPIRED` | 401 | access token expired (client should call refresh) |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | refresh token missing/invalid/expired/session unknown |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | a rotated/revoked refresh token was presented again → all user sessions revoked |
| `AUTH_RESET_TOKEN_INVALID` | 401 | reset token invalid/expired/already used |
| `AUTH_FORBIDDEN` | 403 | role/ownership check failed |
| `AUTH_ACCOUNT_DISABLED` | 403 | `isActive=false` |
| `CORS_ORIGIN_NOT_ALLOWED` | 403 | `Origin` not in `CORS_ORIGINS` |
| `OTP_INVALID` | 400 | wrong code / no active OTP |
| `OTP_EXPIRED` | 400 | OTP older than `OTP_TTL_SECONDS` |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | attempts ≥ `OTP_MAX_ATTEMPTS` |
| `OTP_RESEND_COOLDOWN` | 429 | new OTP requested before cooldown elapsed |
| `USER_NOT_FOUND` | 404 | user id does not exist |
| `USER_EMAIL_ALREADY_EXISTS` | 409 | register with an existing email |
| `ROUTE_NOT_FOUND` | 404 | unknown route |
| `PAYLOAD_TOO_LARGE` | 413 | body > `10kb` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | body present but `Content-Type` is not `application/json` |
| `FILE_TYPE_NOT_ALLOWED` | 415 | reserved for upload (TODO) |
| `FILE_TOO_LARGE` | 413 | reserved for upload (TODO) |
| `RATE_LIMIT_EXCEEDED` | 429 | rate limiter tripped |
| `INTERNAL_SERVER_ERROR` | 500 | any unexpected error (no internals leaked) |
| `SERVICE_UNAVAILABLE` | 503 | reserved (dependency down / shutting down) |

`src/shared/errors/app-error.ts`

```ts
import { ERROR_HTTP_STATUS, type ErrorCode } from './error-codes';
import type { ValidationKey } from '../i18n/translator';

export interface ErrorDetail {
  /** Dotted path, e.g. "body.email" or "query.limit" */
  field: string;
  /** i18n key from the "validation" section of the locale files */
  messageKey: ValidationKey;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly isOperational = true;

  constructor(
    public readonly code: ErrorCode,
    public readonly details?: ErrorDetail[],
  ) {
    super(code); // internal message = code; user text always comes from locale files
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
    Error.captureStackTrace?.(this, AppError);
  }
}
```

`src/shared/errors/index.ts`

```ts
export * from './error-codes';
export * from './app-error';
```

Rules:
- Never `throw new Error('...')` for expected failures. Always `throw new AppError('CODE')`.
- Never put user-facing text into code. Add a locale key instead.
- Adding a new error = (1) add to `ERROR_CODES`, (2) add to `ERROR_HTTP_STATUS`, (3) add to **all six** locale files, (4) add to README table, (5) run `npm run check:locales`.

---

## 3. i18n

`src/shared/i18n/languages.ts`

```ts
export const SUPPORTED_LANGUAGES = ['az', 'en', 'ru', 'tr', 'de', 'es'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
```

`src/shared/i18n/translator.ts`

```ts
import az from './locales/az.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import de from './locales/de.json';
import es from './locales/es.json';
import type { ErrorCode } from '../errors/error-codes';
import type { Language } from './languages';

/** `en.json` is the reference shape. Every other locale must satisfy it (compile-time check). */
export type LocaleDictionary = typeof en;
export type MessageKey = keyof LocaleDictionary['messages'];
export type ValidationKey = keyof LocaleDictionary['validation'];

// Compile-time guarantee: every ErrorCode has a text in the reference locale.
const _errorCoverage: Record<ErrorCode, string> = en.errors;
void _errorCoverage;

const dictionaries: Record<Language, LocaleDictionary> = { az, en, ru, tr, de, es };

export const translateError = (lang: Language, code: ErrorCode): string => dictionaries[lang].errors[code];
export const translateMessage = (lang: Language, key: MessageKey): string => dictionaries[lang].messages[key];
export const translateValidation = (lang: Language, key: ValidationKey): string =>
  dictionaries[lang].validation[key];

export const isValidationKey = (value: string): value is ValidationKey =>
  Object.prototype.hasOwnProperty.call(en.validation, value);
```

Locale file structure (identical in every file): top-level sections `errors` (one entry per `ErrorCode`), `messages` (success texts), `validation` (zod message keys).

### 3.1 Key inventory (identical keys in all six files)

- `errors`: all 29 `ErrorCode` values
- `messages`: `AUTH_REGISTERED`, `AUTH_LOGGED_IN`, `AUTH_TOKENS_REFRESHED`, `AUTH_LOGGED_OUT`, `AUTH_OTP_SENT`, `AUTH_OTP_VERIFIED`, `AUTH_PASSWORD_CHANGED`, `USER_FETCHED`, `USERS_FETCHED`, `HEALTH_OK`
- `validation`: `FIELD_REQUIRED`, `FIELD_INVALID_TYPE`, `EMAIL_INVALID`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `PASSWORD_WEAK`, `FULL_NAME_TOO_SHORT`, `FULL_NAME_TOO_LONG`, `OTP_FORMAT_INVALID`, `UUID_INVALID`, `TOKEN_REQUIRED`, `UNKNOWN_FIELDS`, `PAGE_INVALID`, `LIMIT_INVALID`

### 3.2 `src/shared/i18n/locales/en.json`

```json
{
  "errors": {
    "VALIDATION_ERROR": "The request contains invalid data.",
    "MALFORMED_JSON": "The request body is not valid JSON.",
    "HEADER_PLATFORM_INVALID": "The X-Platform header is missing or invalid. Use 'web' or 'mobile'.",
    "HEADER_LANGUAGE_INVALID": "The X-Language header is missing or invalid. Supported: az, en, ru, tr, de, es.",
    "HEADER_REGION_INVALID": "The X-Region header must be a two-letter country code, for example 'AZ'.",
    "AUTH_INVALID_CREDENTIALS": "Incorrect email or password.",
    "AUTH_TOKEN_MISSING": "Authentication is required.",
    "AUTH_TOKEN_INVALID": "The access token is invalid.",
    "AUTH_TOKEN_EXPIRED": "The access token has expired.",
    "AUTH_REFRESH_TOKEN_INVALID": "The refresh token is invalid or expired. Please sign in again.",
    "AUTH_REFRESH_TOKEN_REUSED": "Suspicious activity detected. All sessions were closed. Please sign in again.",
    "AUTH_RESET_TOKEN_INVALID": "The password reset token is invalid or expired.",
    "AUTH_FORBIDDEN": "You do not have permission to perform this action.",
    "AUTH_ACCOUNT_DISABLED": "This account has been disabled.",
    "CORS_ORIGIN_NOT_ALLOWED": "This origin is not allowed.",
    "OTP_INVALID": "The verification code is incorrect.",
    "OTP_EXPIRED": "The verification code has expired. Request a new one.",
    "OTP_TOO_MANY_ATTEMPTS": "Too many incorrect attempts. Request a new code.",
    "OTP_RESEND_COOLDOWN": "Please wait before requesting another code.",
    "USER_NOT_FOUND": "User not found.",
    "USER_EMAIL_ALREADY_EXISTS": "A user with this email already exists.",
    "ROUTE_NOT_FOUND": "The requested resource was not found.",
    "PAYLOAD_TOO_LARGE": "The request payload is too large.",
    "UNSUPPORTED_MEDIA_TYPE": "Unsupported content type. Use application/json.",
    "FILE_TYPE_NOT_ALLOWED": "This file type is not allowed.",
    "FILE_TOO_LARGE": "The file exceeds the maximum allowed size.",
    "RATE_LIMIT_EXCEEDED": "Too many requests. Please try again later.",
    "INTERNAL_SERVER_ERROR": "Something went wrong on our side.",
    "SERVICE_UNAVAILABLE": "The service is temporarily unavailable."
  },
  "messages": {
    "AUTH_REGISTERED": "Registration successful.",
    "AUTH_LOGGED_IN": "Signed in successfully.",
    "AUTH_TOKENS_REFRESHED": "Session refreshed.",
    "AUTH_LOGGED_OUT": "Signed out successfully.",
    "AUTH_OTP_SENT": "If the account exists, a verification code has been sent.",
    "AUTH_OTP_VERIFIED": "Code verified.",
    "AUTH_PASSWORD_CHANGED": "Password changed successfully. Please sign in again.",
    "USER_FETCHED": "User retrieved.",
    "USERS_FETCHED": "Users retrieved.",
    "HEALTH_OK": "Service is healthy."
  },
  "validation": {
    "FIELD_REQUIRED": "This field is required.",
    "FIELD_INVALID_TYPE": "This field has an invalid type or value.",
    "EMAIL_INVALID": "Enter a valid email address.",
    "PASSWORD_TOO_SHORT": "Password must be at least 8 characters.",
    "PASSWORD_TOO_LONG": "Password must be at most 72 characters.",
    "PASSWORD_WEAK": "Password must contain at least one letter and one digit.",
    "FULL_NAME_TOO_SHORT": "Full name must be at least 2 characters.",
    "FULL_NAME_TOO_LONG": "Full name must be at most 100 characters.",
    "OTP_FORMAT_INVALID": "The code must be exactly 6 digits.",
    "UUID_INVALID": "Invalid identifier format.",
    "TOKEN_REQUIRED": "Token is required.",
    "UNKNOWN_FIELDS": "Unknown fields are not allowed.",
    "PAGE_INVALID": "Page must be a positive integer.",
    "LIMIT_INVALID": "Limit must be an integer between 1 and 100."
  }
}
```

### 3.3 `src/shared/i18n/locales/az.json`

```json
{
  "errors": {
    "VALIDATION_ERROR": "Sorğuda yanlış məlumat var.",
    "MALFORMED_JSON": "Sorğunun gövdəsi düzgün JSON deyil.",
    "HEADER_PLATFORM_INVALID": "X-Platform başlığı yoxdur və ya yanlışdır. 'web' və ya 'mobile' istifadə edin.",
    "HEADER_LANGUAGE_INVALID": "X-Language başlığı yoxdur və ya yanlışdır. Dəstəklənən dillər: az, en, ru, tr, de, es.",
    "HEADER_REGION_INVALID": "X-Region başlığı iki hərfli ölkə kodu olmalıdır, məsələn 'AZ'.",
    "AUTH_INVALID_CREDENTIALS": "E-poçt və ya parol yanlışdır.",
    "AUTH_TOKEN_MISSING": "Autentifikasiya tələb olunur.",
    "AUTH_TOKEN_INVALID": "Access token yanlışdır.",
    "AUTH_TOKEN_EXPIRED": "Access token-in müddəti bitib.",
    "AUTH_REFRESH_TOKEN_INVALID": "Refresh token yanlışdır və ya müddəti bitib. Zəhmət olmasa yenidən daxil olun.",
    "AUTH_REFRESH_TOKEN_REUSED": "Şübhəli fəaliyyət aşkarlandı. Bütün sessiyalar bağlandı. Zəhmət olmasa yenidən daxil olun.",
    "AUTH_RESET_TOKEN_INVALID": "Parolun sıfırlanması token-i yanlışdır və ya müddəti bitib.",
    "AUTH_FORBIDDEN": "Bu əməliyyatı yerinə yetirmək üçün icazəniz yoxdur.",
    "AUTH_ACCOUNT_DISABLED": "Bu hesab deaktiv edilib.",
    "CORS_ORIGIN_NOT_ALLOWED": "Bu mənbəyə icazə verilmir.",
    "OTP_INVALID": "Təsdiq kodu yanlışdır.",
    "OTP_EXPIRED": "Təsdiq kodunun müddəti bitib. Yeni kod tələb edin.",
    "OTP_TOO_MANY_ATTEMPTS": "Çox sayda yanlış cəhd. Yeni kod tələb edin.",
    "OTP_RESEND_COOLDOWN": "Yeni kod tələb etməzdən əvvəl bir az gözləyin.",
    "USER_NOT_FOUND": "İstifadəçi tapılmadı.",
    "USER_EMAIL_ALREADY_EXISTS": "Bu e-poçt ilə istifadəçi artıq mövcuddur.",
    "ROUTE_NOT_FOUND": "Tələb olunan resurs tapılmadı.",
    "PAYLOAD_TOO_LARGE": "Sorğunun həcmi çox böyükdür.",
    "UNSUPPORTED_MEDIA_TYPE": "Dəstəklənməyən məzmun növü. application/json istifadə edin.",
    "FILE_TYPE_NOT_ALLOWED": "Bu fayl növünə icazə verilmir.",
    "FILE_TOO_LARGE": "Fayl icazə verilən maksimum ölçünü aşır.",
    "RATE_LIMIT_EXCEEDED": "Çox sayda sorğu göndərildi. Bir az sonra yenidən cəhd edin.",
    "INTERNAL_SERVER_ERROR": "Serverdə xəta baş verdi.",
    "SERVICE_UNAVAILABLE": "Xidmət müvəqqəti əlçatmazdır."
  },
  "messages": {
    "AUTH_REGISTERED": "Qeydiyyat uğurla tamamlandı.",
    "AUTH_LOGGED_IN": "Uğurla daxil oldunuz.",
    "AUTH_TOKENS_REFRESHED": "Sessiya yeniləndi.",
    "AUTH_LOGGED_OUT": "Uğurla çıxış etdiniz.",
    "AUTH_OTP_SENT": "Hesab mövcuddursa, təsdiq kodu göndərildi.",
    "AUTH_OTP_VERIFIED": "Kod təsdiqləndi.",
    "AUTH_PASSWORD_CHANGED": "Parol uğurla dəyişdirildi. Zəhmət olmasa yenidən daxil olun.",
    "USER_FETCHED": "İstifadəçi əldə edildi.",
    "USERS_FETCHED": "İstifadəçilər əldə edildi.",
    "HEALTH_OK": "Xidmət sağlamdır."
  },
  "validation": {
    "FIELD_REQUIRED": "Bu sahə məcburidir.",
    "FIELD_INVALID_TYPE": "Bu sahənin tipi və ya dəyəri yanlışdır.",
    "EMAIL_INVALID": "Düzgün e-poçt ünvanı daxil edin.",
    "PASSWORD_TOO_SHORT": "Parol ən azı 8 simvol olmalıdır.",
    "PASSWORD_TOO_LONG": "Parol ən çox 72 simvol ola bilər.",
    "PASSWORD_WEAK": "Parolda ən azı bir hərf və bir rəqəm olmalıdır.",
    "FULL_NAME_TOO_SHORT": "Ad və soyad ən azı 2 simvol olmalıdır.",
    "FULL_NAME_TOO_LONG": "Ad və soyad ən çox 100 simvol ola bilər.",
    "OTP_FORMAT_INVALID": "Kod dəqiq 6 rəqəmdən ibarət olmalıdır.",
    "UUID_INVALID": "İdentifikator formatı yanlışdır.",
    "TOKEN_REQUIRED": "Token məcburidir.",
    "UNKNOWN_FIELDS": "Naməlum sahələrə icazə verilmir.",
    "PAGE_INVALID": "Səhifə müsbət tam ədəd olmalıdır.",
    "LIMIT_INVALID": "Limit 1 ilə 100 arasında tam ədəd olmalıdır."
  }
}
```

### 3.4 `src/shared/i18n/locales/ru.json`

```json
{
  "errors": {
    "VALIDATION_ERROR": "Запрос содержит некорректные данные.",
    "MALFORMED_JSON": "Тело запроса не является корректным JSON.",
    "HEADER_PLATFORM_INVALID": "Заголовок X-Platform отсутствует или неверен. Используйте 'web' или 'mobile'.",
    "HEADER_LANGUAGE_INVALID": "Заголовок X-Language отсутствует или неверен. Поддерживаются: az, en, ru, tr, de, es.",
    "HEADER_REGION_INVALID": "Заголовок X-Region должен быть двухбуквенным кодом страны, например 'AZ'.",
    "AUTH_INVALID_CREDENTIALS": "Неверный адрес электронной почты или пароль.",
    "AUTH_TOKEN_MISSING": "Требуется аутентификация.",
    "AUTH_TOKEN_INVALID": "Токен доступа недействителен.",
    "AUTH_TOKEN_EXPIRED": "Срок действия токена доступа истёк.",
    "AUTH_REFRESH_TOKEN_INVALID": "Токен обновления недействителен или истёк. Пожалуйста, войдите снова.",
    "AUTH_REFRESH_TOKEN_REUSED": "Обнаружена подозрительная активность. Все сеансы завершены. Пожалуйста, войдите снова.",
    "AUTH_RESET_TOKEN_INVALID": "Токен сброса пароля недействителен или истёк.",
    "AUTH_FORBIDDEN": "У вас нет прав для выполнения этого действия.",
    "AUTH_ACCOUNT_DISABLED": "Эта учётная запись отключена.",
    "CORS_ORIGIN_NOT_ALLOWED": "Этот источник запрещён.",
    "OTP_INVALID": "Неверный код подтверждения.",
    "OTP_EXPIRED": "Срок действия кода истёк. Запросите новый.",
    "OTP_TOO_MANY_ATTEMPTS": "Слишком много неверных попыток. Запросите новый код.",
    "OTP_RESEND_COOLDOWN": "Подождите, прежде чем запрашивать новый код.",
    "USER_NOT_FOUND": "Пользователь не найден.",
    "USER_EMAIL_ALREADY_EXISTS": "Пользователь с таким адресом электронной почты уже существует.",
    "ROUTE_NOT_FOUND": "Запрошенный ресурс не найден.",
    "PAYLOAD_TOO_LARGE": "Размер запроса слишком велик.",
    "UNSUPPORTED_MEDIA_TYPE": "Неподдерживаемый тип содержимого. Используйте application/json.",
    "FILE_TYPE_NOT_ALLOWED": "Этот тип файла не разрешён.",
    "FILE_TOO_LARGE": "Файл превышает максимально допустимый размер.",
    "RATE_LIMIT_EXCEEDED": "Слишком много запросов. Повторите попытку позже.",
    "INTERNAL_SERVER_ERROR": "На сервере произошла ошибка.",
    "SERVICE_UNAVAILABLE": "Сервис временно недоступен."
  },
  "messages": {
    "AUTH_REGISTERED": "Регистрация прошла успешно.",
    "AUTH_LOGGED_IN": "Вход выполнен успешно.",
    "AUTH_TOKENS_REFRESHED": "Сеанс обновлён.",
    "AUTH_LOGGED_OUT": "Выход выполнен успешно.",
    "AUTH_OTP_SENT": "Если аккаунт существует, код подтверждения отправлен.",
    "AUTH_OTP_VERIFIED": "Код подтверждён.",
    "AUTH_PASSWORD_CHANGED": "Пароль успешно изменён. Пожалуйста, войдите снова.",
    "USER_FETCHED": "Пользователь получен.",
    "USERS_FETCHED": "Пользователи получены.",
    "HEALTH_OK": "Сервис работает нормально."
  },
  "validation": {
    "FIELD_REQUIRED": "Это поле обязательно.",
    "FIELD_INVALID_TYPE": "Недопустимый тип или значение поля.",
    "EMAIL_INVALID": "Введите корректный адрес электронной почты.",
    "PASSWORD_TOO_SHORT": "Пароль должен содержать не менее 8 символов.",
    "PASSWORD_TOO_LONG": "Пароль должен содержать не более 72 символов.",
    "PASSWORD_WEAK": "Пароль должен содержать хотя бы одну букву и одну цифру.",
    "FULL_NAME_TOO_SHORT": "Полное имя должно содержать не менее 2 символов.",
    "FULL_NAME_TOO_LONG": "Полное имя должно содержать не более 100 символов.",
    "OTP_FORMAT_INVALID": "Код должен состоять ровно из 6 цифр.",
    "UUID_INVALID": "Неверный формат идентификатора.",
    "TOKEN_REQUIRED": "Токен обязателен.",
    "UNKNOWN_FIELDS": "Неизвестные поля не допускаются.",
    "PAGE_INVALID": "Страница должна быть положительным целым числом.",
    "LIMIT_INVALID": "Лимит должен быть целым числом от 1 до 100."
  }
}
```

### 3.5 `src/shared/i18n/locales/tr.json`

```json
{
  "errors": {
    "VALIDATION_ERROR": "İstek geçersiz veri içeriyor.",
    "MALFORMED_JSON": "İstek gövdesi geçerli bir JSON değil.",
    "HEADER_PLATFORM_INVALID": "X-Platform başlığı eksik veya geçersiz. 'web' veya 'mobile' kullanın.",
    "HEADER_LANGUAGE_INVALID": "X-Language başlığı eksik veya geçersiz. Desteklenenler: az, en, ru, tr, de, es.",
    "HEADER_REGION_INVALID": "X-Region başlığı iki harfli bir ülke kodu olmalıdır, örneğin 'AZ'.",
    "AUTH_INVALID_CREDENTIALS": "E-posta veya şifre hatalı.",
    "AUTH_TOKEN_MISSING": "Kimlik doğrulaması gerekli.",
    "AUTH_TOKEN_INVALID": "Erişim jetonu geçersiz.",
    "AUTH_TOKEN_EXPIRED": "Erişim jetonunun süresi doldu.",
    "AUTH_REFRESH_TOKEN_INVALID": "Yenileme jetonu geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.",
    "AUTH_REFRESH_TOKEN_REUSED": "Şüpheli etkinlik algılandı. Tüm oturumlar kapatıldı. Lütfen tekrar giriş yapın.",
    "AUTH_RESET_TOKEN_INVALID": "Şifre sıfırlama jetonu geçersiz veya süresi dolmuş.",
    "AUTH_FORBIDDEN": "Bu işlemi yapmaya yetkiniz yok.",
    "AUTH_ACCOUNT_DISABLED": "Bu hesap devre dışı bırakılmış.",
    "CORS_ORIGIN_NOT_ALLOWED": "Bu kaynağa izin verilmiyor.",
    "OTP_INVALID": "Doğrulama kodu hatalı.",
    "OTP_EXPIRED": "Doğrulama kodunun süresi doldu. Yeni bir kod isteyin.",
    "OTP_TOO_MANY_ATTEMPTS": "Çok fazla hatalı deneme. Yeni bir kod isteyin.",
    "OTP_RESEND_COOLDOWN": "Yeni bir kod istemeden önce lütfen bekleyin.",
    "USER_NOT_FOUND": "Kullanıcı bulunamadı.",
    "USER_EMAIL_ALREADY_EXISTS": "Bu e-posta ile kayıtlı bir kullanıcı zaten var.",
    "ROUTE_NOT_FOUND": "İstenen kaynak bulunamadı.",
    "PAYLOAD_TOO_LARGE": "İstek boyutu çok büyük.",
    "UNSUPPORTED_MEDIA_TYPE": "Desteklenmeyen içerik türü. application/json kullanın.",
    "FILE_TYPE_NOT_ALLOWED": "Bu dosya türüne izin verilmiyor.",
    "FILE_TOO_LARGE": "Dosya izin verilen azami boyutu aşıyor.",
    "RATE_LIMIT_EXCEEDED": "Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.",
    "INTERNAL_SERVER_ERROR": "Sunucuda bir hata oluştu.",
    "SERVICE_UNAVAILABLE": "Hizmet geçici olarak kullanılamıyor."
  },
  "messages": {
    "AUTH_REGISTERED": "Kayıt başarılı.",
    "AUTH_LOGGED_IN": "Giriş başarılı.",
    "AUTH_TOKENS_REFRESHED": "Oturum yenilendi.",
    "AUTH_LOGGED_OUT": "Çıkış başarılı.",
    "AUTH_OTP_SENT": "Hesap mevcutsa doğrulama kodu gönderildi.",
    "AUTH_OTP_VERIFIED": "Kod doğrulandı.",
    "AUTH_PASSWORD_CHANGED": "Şifre başarıyla değiştirildi. Lütfen tekrar giriş yapın.",
    "USER_FETCHED": "Kullanıcı getirildi.",
    "USERS_FETCHED": "Kullanıcılar getirildi.",
    "HEALTH_OK": "Hizmet sağlıklı."
  },
  "validation": {
    "FIELD_REQUIRED": "Bu alan zorunludur.",
    "FIELD_INVALID_TYPE": "Bu alanın türü veya değeri geçersiz.",
    "EMAIL_INVALID": "Geçerli bir e-posta adresi girin.",
    "PASSWORD_TOO_SHORT": "Şifre en az 8 karakter olmalıdır.",
    "PASSWORD_TOO_LONG": "Şifre en fazla 72 karakter olabilir.",
    "PASSWORD_WEAK": "Şifre en az bir harf ve bir rakam içermelidir.",
    "FULL_NAME_TOO_SHORT": "Ad soyad en az 2 karakter olmalıdır.",
    "FULL_NAME_TOO_LONG": "Ad soyad en fazla 100 karakter olabilir.",
    "OTP_FORMAT_INVALID": "Kod tam olarak 6 haneli olmalıdır.",
    "UUID_INVALID": "Geçersiz tanımlayıcı biçimi.",
    "TOKEN_REQUIRED": "Jeton zorunludur.",
    "UNKNOWN_FIELDS": "Bilinmeyen alanlara izin verilmez.",
    "PAGE_INVALID": "Sayfa pozitif bir tam sayı olmalıdır.",
    "LIMIT_INVALID": "Limit 1 ile 100 arasında bir tam sayı olmalıdır."
  }
}
```

### 3.6 `src/shared/i18n/locales/de.json`

```json
{
  "errors": {
    "VALIDATION_ERROR": "Die Anfrage enthält ungültige Daten.",
    "MALFORMED_JSON": "Der Anfragetext ist kein gültiges JSON.",
    "HEADER_PLATFORM_INVALID": "Der Header X-Platform fehlt oder ist ungültig. Verwenden Sie 'web' oder 'mobile'.",
    "HEADER_LANGUAGE_INVALID": "Der Header X-Language fehlt oder ist ungültig. Unterstützt: az, en, ru, tr, de, es.",
    "HEADER_REGION_INVALID": "Der Header X-Region muss ein zweistelliger Ländercode sein, z. B. 'AZ'.",
    "AUTH_INVALID_CREDENTIALS": "E-Mail oder Passwort ist falsch.",
    "AUTH_TOKEN_MISSING": "Authentifizierung erforderlich.",
    "AUTH_TOKEN_INVALID": "Das Zugriffstoken ist ungültig.",
    "AUTH_TOKEN_EXPIRED": "Das Zugriffstoken ist abgelaufen.",
    "AUTH_REFRESH_TOKEN_INVALID": "Das Refresh-Token ist ungültig oder abgelaufen. Bitte melden Sie sich erneut an.",
    "AUTH_REFRESH_TOKEN_REUSED": "Verdächtige Aktivität erkannt. Alle Sitzungen wurden beendet. Bitte melden Sie sich erneut an.",
    "AUTH_RESET_TOKEN_INVALID": "Das Token zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.",
    "AUTH_FORBIDDEN": "Sie haben keine Berechtigung für diese Aktion.",
    "AUTH_ACCOUNT_DISABLED": "Dieses Konto wurde deaktiviert.",
    "CORS_ORIGIN_NOT_ALLOWED": "Dieser Ursprung ist nicht erlaubt.",
    "OTP_INVALID": "Der Bestätigungscode ist falsch.",
    "OTP_EXPIRED": "Der Bestätigungscode ist abgelaufen. Fordern Sie einen neuen an.",
    "OTP_TOO_MANY_ATTEMPTS": "Zu viele falsche Versuche. Fordern Sie einen neuen Code an.",
    "OTP_RESEND_COOLDOWN": "Bitte warten Sie, bevor Sie einen neuen Code anfordern.",
    "USER_NOT_FOUND": "Benutzer nicht gefunden.",
    "USER_EMAIL_ALREADY_EXISTS": "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.",
    "ROUTE_NOT_FOUND": "Die angeforderte Ressource wurde nicht gefunden.",
    "PAYLOAD_TOO_LARGE": "Die Anfrage ist zu groß.",
    "UNSUPPORTED_MEDIA_TYPE": "Nicht unterstützter Inhaltstyp. Verwenden Sie application/json.",
    "FILE_TYPE_NOT_ALLOWED": "Dieser Dateityp ist nicht erlaubt.",
    "FILE_TOO_LARGE": "Die Datei überschreitet die maximal zulässige Größe.",
    "RATE_LIMIT_EXCEEDED": "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
    "INTERNAL_SERVER_ERROR": "Auf unserer Seite ist ein Fehler aufgetreten.",
    "SERVICE_UNAVAILABLE": "Der Dienst ist vorübergehend nicht verfügbar."
  },
  "messages": {
    "AUTH_REGISTERED": "Registrierung erfolgreich.",
    "AUTH_LOGGED_IN": "Erfolgreich angemeldet.",
    "AUTH_TOKENS_REFRESHED": "Sitzung aktualisiert.",
    "AUTH_LOGGED_OUT": "Erfolgreich abgemeldet.",
    "AUTH_OTP_SENT": "Falls das Konto existiert, wurde ein Bestätigungscode gesendet.",
    "AUTH_OTP_VERIFIED": "Code bestätigt.",
    "AUTH_PASSWORD_CHANGED": "Passwort erfolgreich geändert. Bitte melden Sie sich erneut an.",
    "USER_FETCHED": "Benutzer abgerufen.",
    "USERS_FETCHED": "Benutzerliste abgerufen.",
    "HEALTH_OK": "Dienst ist funktionsfähig."
  },
  "validation": {
    "FIELD_REQUIRED": "Dieses Feld ist erforderlich.",
    "FIELD_INVALID_TYPE": "Dieses Feld hat einen ungültigen Typ oder Wert.",
    "EMAIL_INVALID": "Geben Sie eine gültige E-Mail-Adresse ein.",
    "PASSWORD_TOO_SHORT": "Das Passwort muss mindestens 8 Zeichen lang sein.",
    "PASSWORD_TOO_LONG": "Das Passwort darf höchstens 72 Zeichen lang sein.",
    "PASSWORD_WEAK": "Das Passwort muss mindestens einen Buchstaben und eine Ziffer enthalten.",
    "FULL_NAME_TOO_SHORT": "Der vollständige Name muss mindestens 2 Zeichen lang sein.",
    "FULL_NAME_TOO_LONG": "Der vollständige Name darf höchstens 100 Zeichen lang sein.",
    "OTP_FORMAT_INVALID": "Der Code muss genau 6 Ziffern enthalten.",
    "UUID_INVALID": "Ungültiges Kennungsformat.",
    "TOKEN_REQUIRED": "Token ist erforderlich.",
    "UNKNOWN_FIELDS": "Unbekannte Felder sind nicht erlaubt.",
    "PAGE_INVALID": "Die Seite muss eine positive ganze Zahl sein.",
    "LIMIT_INVALID": "Das Limit muss eine ganze Zahl zwischen 1 und 100 sein."
  }
}
```

### 3.7 `src/shared/i18n/locales/es.json`

```json
{
  "errors": {
    "VALIDATION_ERROR": "La solicitud contiene datos no válidos.",
    "MALFORMED_JSON": "El cuerpo de la solicitud no es un JSON válido.",
    "HEADER_PLATFORM_INVALID": "La cabecera X-Platform falta o no es válida. Use 'web' o 'mobile'.",
    "HEADER_LANGUAGE_INVALID": "La cabecera X-Language falta o no es válida. Admitidos: az, en, ru, tr, de, es.",
    "HEADER_REGION_INVALID": "La cabecera X-Region debe ser un código de país de dos letras, por ejemplo 'AZ'.",
    "AUTH_INVALID_CREDENTIALS": "Correo electrónico o contraseña incorrectos.",
    "AUTH_TOKEN_MISSING": "Se requiere autenticación.",
    "AUTH_TOKEN_INVALID": "El token de acceso no es válido.",
    "AUTH_TOKEN_EXPIRED": "El token de acceso ha caducado.",
    "AUTH_REFRESH_TOKEN_INVALID": "El token de actualización no es válido o ha caducado. Inicie sesión de nuevo.",
    "AUTH_REFRESH_TOKEN_REUSED": "Se detectó actividad sospechosa. Se cerraron todas las sesiones. Inicie sesión de nuevo.",
    "AUTH_RESET_TOKEN_INVALID": "El token de restablecimiento de contraseña no es válido o ha caducado.",
    "AUTH_FORBIDDEN": "No tiene permiso para realizar esta acción.",
    "AUTH_ACCOUNT_DISABLED": "Esta cuenta ha sido desactivada.",
    "CORS_ORIGIN_NOT_ALLOWED": "Este origen no está permitido.",
    "OTP_INVALID": "El código de verificación es incorrecto.",
    "OTP_EXPIRED": "El código de verificación ha caducado. Solicite uno nuevo.",
    "OTP_TOO_MANY_ATTEMPTS": "Demasiados intentos incorrectos. Solicite un código nuevo.",
    "OTP_RESEND_COOLDOWN": "Espere antes de solicitar otro código.",
    "USER_NOT_FOUND": "Usuario no encontrado.",
    "USER_EMAIL_ALREADY_EXISTS": "Ya existe un usuario con este correo electrónico.",
    "ROUTE_NOT_FOUND": "No se encontró el recurso solicitado.",
    "PAYLOAD_TOO_LARGE": "La solicitud es demasiado grande.",
    "UNSUPPORTED_MEDIA_TYPE": "Tipo de contenido no admitido. Use application/json.",
    "FILE_TYPE_NOT_ALLOWED": "Este tipo de archivo no está permitido.",
    "FILE_TOO_LARGE": "El archivo supera el tamaño máximo permitido.",
    "RATE_LIMIT_EXCEEDED": "Demasiadas solicitudes. Inténtelo de nuevo más tarde.",
    "INTERNAL_SERVER_ERROR": "Se produjo un error en el servidor.",
    "SERVICE_UNAVAILABLE": "El servicio no está disponible temporalmente."
  },
  "messages": {
    "AUTH_REGISTERED": "Registro exitoso.",
    "AUTH_LOGGED_IN": "Sesión iniciada correctamente.",
    "AUTH_TOKENS_REFRESHED": "Sesión actualizada.",
    "AUTH_LOGGED_OUT": "Sesión cerrada correctamente.",
    "AUTH_OTP_SENT": "Si la cuenta existe, se ha enviado un código de verificación.",
    "AUTH_OTP_VERIFIED": "Código verificado.",
    "AUTH_PASSWORD_CHANGED": "Contraseña cambiada correctamente. Inicie sesión de nuevo.",
    "USER_FETCHED": "Usuario obtenido.",
    "USERS_FETCHED": "Usuarios obtenidos.",
    "HEALTH_OK": "El servicio funciona correctamente."
  },
  "validation": {
    "FIELD_REQUIRED": "Este campo es obligatorio.",
    "FIELD_INVALID_TYPE": "Este campo tiene un tipo o valor no válido.",
    "EMAIL_INVALID": "Introduzca un correo electrónico válido.",
    "PASSWORD_TOO_SHORT": "La contraseña debe tener al menos 8 caracteres.",
    "PASSWORD_TOO_LONG": "La contraseña debe tener como máximo 72 caracteres.",
    "PASSWORD_WEAK": "La contraseña debe contener al menos una letra y un dígito.",
    "FULL_NAME_TOO_SHORT": "El nombre completo debe tener al menos 2 caracteres.",
    "FULL_NAME_TOO_LONG": "El nombre completo debe tener como máximo 100 caracteres.",
    "OTP_FORMAT_INVALID": "El código debe tener exactamente 6 dígitos.",
    "UUID_INVALID": "Formato de identificador no válido.",
    "TOKEN_REQUIRED": "El token es obligatorio.",
    "UNKNOWN_FIELDS": "No se permiten campos desconocidos.",
    "PAGE_INVALID": "La página debe ser un entero positivo.",
    "LIMIT_INVALID": "El límite debe ser un entero entre 1 y 100."
  }
}
```

---

## 4. Locale consistency script

`scripts/check-locales.ts`

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_CODES } from '../src/shared/errors/error-codes';
import { SUPPORTED_LANGUAGES } from '../src/shared/i18n/languages';

type Dict = Record<string, Record<string, string>>;
const dir = join(__dirname, '..', 'src', 'shared', 'i18n', 'locales');
const load = (lang: string): Dict => JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')) as Dict;

const reference = load('en');
let failed = false;
const fail = (msg: string): void => {
  failed = true;
  console.error(`✖ ${msg}`);
};

// 1. Files on disk must equal SUPPORTED_LANGUAGES
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
if (files.join() !== [...SUPPORTED_LANGUAGES].sort().join()) fail(`Locale files [${files}] != SUPPORTED_LANGUAGES [${SUPPORTED_LANGUAGES}]`);

// 2. en.errors must equal ERROR_CODES
const enCodes = Object.keys(reference['errors'] ?? {}).sort();
if (enCodes.join() !== [...ERROR_CODES].sort().join()) fail('en.errors keys differ from ERROR_CODES');

// 3. Every locale: same sections, same keys, non-empty strings
for (const lang of SUPPORTED_LANGUAGES) {
  const dict = load(lang);
  for (const section of Object.keys(reference)) {
    const expected = Object.keys(reference[section] ?? {}).sort();
    const actual = Object.keys(dict[section] ?? {}).sort();
    const missing = expected.filter((k) => !actual.includes(k));
    const extra = actual.filter((k) => !expected.includes(k));
    if (missing.length) fail(`${lang}.${section} missing: ${missing.join(', ')}`);
    if (extra.length) fail(`${lang}.${section} unexpected: ${extra.join(', ')}`);
    for (const [k, v] of Object.entries(dict[section] ?? {})) if (typeof v !== 'string' || v.trim() === '') fail(`${lang}.${section}.${k} is empty`);
  }
}

if (failed) process.exit(1);
console.log(`✔ ${SUPPORTED_LANGUAGES.length} locale files are consistent (${ERROR_CODES.length} error codes).`);
```

---

## 5. Definition of Done (file 02)

- Files exist: `src/shared/errors/{error-codes,app-error,index}.ts`, `src/shared/i18n/{languages,translator}.ts`, six locale JSON files, `scripts/check-locales.ts`.
- `npx tsc -p tsconfig.json --noEmit` reports no errors **inside `src/shared` and `scripts`** (other errors about files from later specs may still exist).
- `npm run check:locales` prints `✔ 6 locale files are consistent (29 error codes).`
