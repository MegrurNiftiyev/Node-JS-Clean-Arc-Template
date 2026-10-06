# Firebase (Firestore) persistence (TODO)

Not implemented yet. `DB_DRIVER=firebase` currently fails at boot with a clear error.

## Checklist

- [ ] Implement `FirebaseUserRepository`, `FirebaseRefreshSessionRepository`, `FirebaseOtpRepository` against the
      interfaces in `src/domain/repositories`.
- [ ] Firestore collections: `users`, `refresh_sessions`, `otps` (document id = entity `id`, string uuid).
- [ ] Email uniqueness: write a `user_emails/{email}` document in the same transaction as the user; if it already
      exists throw `AppError('USER_EMAIL_ALREADY_EXISTS')`.
- [ ] Configure a Firestore TTL policy on the `expiresAt` field of `otps` and `refresh_sessions`.
- [ ] Service-account credentials come from env variables (add them to `src/config/env.ts` and `.env.example`).
      Never commit credential files.
- [ ] Return the new repositories from `createPersistence()` in `../create-persistence.ts` (the only wiring change).
