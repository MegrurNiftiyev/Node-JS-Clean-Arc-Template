# MongoDB persistence (TODO)

Not implemented yet. `DB_DRIVER=mongo` currently fails at boot with a clear error.

## Checklist

- [ ] Implement `MongoUserRepository`, `MongoRefreshSessionRepository`, `MongoOtpRepository` against the
      interfaces in `src/domain/repositories`.
- [ ] Unique index on `users.email`; map duplicate-key error `11000` → `AppError('USER_EMAIL_ALREADY_EXISTS')`.
- [ ] TTL indexes on `otps.expiresAt` and `refresh_sessions.expiresAt` (`expireAfterSeconds: 0`).
- [ ] Index `refresh_sessions.userId` and `otps.userId + createdAt desc`.
- [ ] Map `_id` ⇄ `id` (string uuid). Never leak `_id` / `__v` outside the repository.
- [ ] Add `MONGO_URI` to `src/config/env.ts` and `.env.example` (required when `DB_DRIVER=mongo`).
- [ ] Return the new repositories from `createPersistence()` in `../create-persistence.ts` (the only wiring change).
