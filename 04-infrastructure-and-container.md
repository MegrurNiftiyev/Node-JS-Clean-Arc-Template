# 04 — Infrastructure Layer & Composition Root

> Prerequisites: files 01–03 completed.
> Creates `src/infrastructure/**` and `src/container.ts`.
> Infrastructure implements the ports/repository interfaces from file 03. It may import `@/shared`, `@/domain`, `@/application` (ports/DTOs only), `@/config`, and third-party libraries.

---

## 1. Persistence

### 1.1 In-memory repositories

Purpose: working template without a database. Data is lost on restart. Must be thread-safe in the single-threaded Node sense (no async gaps between check and write).

`src/infrastructure/persistence/in-memory/in-memory-user.repository.ts`

```ts
import { randomUUID } from 'node:crypto';
import { AppError } from '@/shared/errors';
import type { NewUser, User } from '@/domain/entities/user.entity';
import type { UserRepository } from '@/domain/repositories/user.repository';

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();
  private readonly idByEmail = new Map<string, string>();

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  findByEmail(email: string): Promise<User | null> {
    const id = this.idByEmail.get(email.toLowerCase());
    return Promise.resolve(id ? (this.byId.get(id) ?? null) : null);
  }

  create(data: NewUser): Promise<User> {
    const email = data.email.toLowerCase();
    if (this.idByEmail.has(email)) return Promise.reject(new AppError('USER_EMAIL_ALREADY_EXISTS'));
    const now = new Date();
    const user: User = { id: randomUUID(), ...data, email, isActive: true, createdAt: now, updatedAt: now };
    this.byId.set(user.id, user);
    this.idByEmail.set(email, user.id);
    return Promise.resolve({ ...user });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const user = this.byId.get(id);
    if (user) {
      user.passwordHash = passwordHash;
      user.updatedAt = new Date();
    }
    return Promise.resolve();
  }

  list({ page, limit }: { page: number; limit: number }): Promise<{ items: User[]; total: number }> {
    const all = [...this.byId.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    const start = (page - 1) * limit;
    return Promise.resolve({ items: all.slice(start, start + limit).map((u) => ({ ...u })), total: all.length });
  }
}
```

Return **copies** (`{ ...user }`) so callers cannot mutate stored state accidentally.

`in-memory-refresh-session.repository.ts` — `Map<string, RefreshSession>`; implement:
- `create` (store copy), `findById` (copy or null)
- `updateTokenHash(id, hash)` sets `tokenHash`
- `revoke(id, at)` sets `revokedAt = at` if still null
- `revokeAllForUser(userId, at)` iterates and revokes every non-revoked session of that user

`in-memory-otp.repository.ts` — `Map<string, Otp>`; implement:
- `create` (store copy), `findById` (copy or null)
- `findLatestByUserId(userId)` → the OTP with the greatest `createdAt` for that user (copy or null)
- `update(otp)` replaces the stored record (throw nothing if missing)

### 1.2 Factory — `src/infrastructure/persistence/create-persistence.ts`

```ts
import type { Env } from '@/config/env';
import type { OtpRepository } from '@/domain/repositories/otp.repository';
import type { RefreshSessionRepository } from '@/domain/repositories/refresh-session.repository';
import type { UserRepository } from '@/domain/repositories/user.repository';
import { InMemoryOtpRepository } from './in-memory/in-memory-otp.repository';
import { InMemoryRefreshSessionRepository } from './in-memory/in-memory-refresh-session.repository';
import { InMemoryUserRepository } from './in-memory/in-memory-user.repository';

export interface Persistence {
  users: UserRepository;
  sessions: RefreshSessionRepository;
  otps: OtpRepository;
}

export function createPersistence(env: Env): Persistence {
  switch (env.DB_DRIVER) {
    case 'memory':
      return { users: new InMemoryUserRepository(), sessions: new InMemoryRefreshSessionRepository(), otps: new InMemoryOtpRepository() };
    case 'mongo':
      // TODO(integration): implement Mongo repositories in ./mongo and return them here.
      throw new Error('DB_DRIVER=mongo is not implemented yet (see src/infrastructure/persistence/mongo/README.md)');
    case 'firebase':
      // TODO(integration): implement Firebase repositories in ./firebase and return them here.
      throw new Error('DB_DRIVER=firebase is not implemented yet (see src/infrastructure/persistence/firebase/README.md)');
  }
}
```

### 1.3 DB integration notes (files with TODO content only)

`src/infrastructure/persistence/mongo/README.md` must list:
- Implement `MongoUserRepository`, `MongoRefreshSessionRepository`, `MongoOtpRepository` against the interfaces in `src/domain/repositories`.
- Unique index on `users.email`; map duplicate-key error `11000` → `AppError('USER_EMAIL_ALREADY_EXISTS')`.
- TTL indexes: `otps.expiresAt` and `refresh_sessions.expiresAt` (`expireAfterSeconds: 0`).
- Index `refresh_sessions.userId`, `otps.userId + createdAt desc`.
- Map `_id` ⇄ `id` (string uuid). Never leak `_id`/`__v` outside the repository.
- Add `MONGO_URI` to `env.ts` + `.env.example` (required when `DB_DRIVER=mongo`).

`src/infrastructure/persistence/firebase/README.md` must list the same repository list, Firestore collections (`users`, `refresh_sessions`, `otps`), email uniqueness via a `user_emails/{email}` document written in a transaction, TTL policy on `expiresAt`, service-account credentials via env (never committed).

---

## 2. Security adapters

### 2.1 Password hasher — `security/bcrypt-password-hasher.ts`

```ts
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PasswordHasher } from '@/application/ports/password-hasher.port';

export class BcryptPasswordHasher implements PasswordHasher {
  private readonly dummyHash: string;

  constructor(private readonly cost: number) {
    this.dummyHash = bcrypt.hashSync(randomUUID(), cost); // computed once at boot
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost);
  }
  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
  async compareDummy(plain: string): Promise<void> {
    await bcrypt.compare(plain, this.dummyHash);
  }
}
```

### 2.2 JWT token service — `security/jwt-token-service.ts`

Requirements:
- HS256 **pinned** on sign and verify (`algorithms: ['HS256']`) — never accept `none`/other algorithms.
- Separate secret per token type; `typ` claim (`'access' | 'refresh' | 'reset'`) is verified; `iss` = `JWT_ISSUER`, `aud` = `JWT_AUDIENCE`.
- Every token has a unique `jti` (`randomUUID()`), so two refresh tokens issued in the same second still differ.
- Errors are mapped to `AppError` (see port docs in file 03). Never leak `jsonwebtoken` error messages.

```ts
import { createHash, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { AppError, type ErrorCode } from '@/shared/errors';
import { JWT_AUDIENCE, JWT_ISSUER } from '@/config/constants';
import type { Role } from '@/domain/enums/role';
import { ROLES } from '@/domain/enums/role';
import type {
  AccessClaims, RefreshClaims, ResetClaims, TokenService,
} from '@/application/ports/token-service.port';

type TokenType = 'access' | 'refresh' | 'reset';

export interface JwtConfig {
  accessSecret: string; refreshSecret: string; resetSecret: string;
  accessTtlSeconds: number; refreshTtlSeconds: number; resetTtlSeconds: number;
}

export class JwtTokenService implements TokenService {
  constructor(private readonly cfg: JwtConfig) {}

  signAccess(c: AccessClaims): string {
    return this.sign({ role: c.role, sid: c.sid }, c.sub, 'access', this.cfg.accessSecret, this.cfg.accessTtlSeconds);
  }
  signRefresh(c: RefreshClaims): string {
    return this.sign({ sid: c.sid }, c.sub, 'refresh', this.cfg.refreshSecret, this.cfg.refreshTtlSeconds);
  }
  signReset(c: ResetClaims): string {
    return this.sign({ otpId: c.otpId }, c.sub, 'reset', this.cfg.resetSecret, this.cfg.resetTtlSeconds);
  }

  verifyAccess(token: string): AccessClaims {
    const p = this.verify(token, 'access', this.cfg.accessSecret, { invalid: 'AUTH_TOKEN_INVALID', expired: 'AUTH_TOKEN_EXPIRED' });
    const role = p['role'];
    if (typeof p.sub !== 'string' || typeof p['sid'] !== 'string' || !ROLES.includes(role as Role)) throw new AppError('AUTH_TOKEN_INVALID');
    return { sub: p.sub, sid: p['sid'], role: role as Role };
  }
  verifyRefresh(token: string): RefreshClaims {
    const p = this.verify(token, 'refresh', this.cfg.refreshSecret, { invalid: 'AUTH_REFRESH_TOKEN_INVALID', expired: 'AUTH_REFRESH_TOKEN_INVALID' });
    if (typeof p.sub !== 'string' || typeof p['sid'] !== 'string') throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    return { sub: p.sub, sid: p['sid'] };
  }
  verifyReset(token: string): ResetClaims {
    const p = this.verify(token, 'reset', this.cfg.resetSecret, { invalid: 'AUTH_RESET_TOKEN_INVALID', expired: 'AUTH_RESET_TOKEN_INVALID' });
    if (typeof p.sub !== 'string' || typeof p['otpId'] !== 'string') throw new AppError('AUTH_RESET_TOKEN_INVALID');
    return { sub: p.sub, otpId: p['otpId'] };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sign(extra: Record<string, unknown>, sub: string, typ: TokenType, secret: string, ttl: number): string {
    return jwt.sign({ ...extra, typ }, secret, {
      algorithm: 'HS256', subject: sub, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: ttl, jwtid: randomUUID(),
    });
  }

  private verify(token: string, typ: TokenType, secret: string, errors: { invalid: ErrorCode; expired: ErrorCode }): JwtPayload {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
      if (typeof payload === 'string' || payload['typ'] !== typ) throw new AppError(errors.invalid);
      return payload;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof jwt.TokenExpiredError) throw new AppError(errors.expired);
      throw new AppError(errors.invalid);
    }
  }
}
```

### 2.3 OTP service — `security/hmac-otp-service.ts`

```ts
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_LENGTH } from '@/config/constants';
import type { OtpService } from '@/application/ports/otp-service.port';

export class HmacOtpService implements OtpService {
  constructor(private readonly secret: string) {}

  generate(): string {
    return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
  }
  hash(code: string): string {
    return createHmac('sha256', this.secret).update(code).digest('hex');
  }
  matches(code: string, hash: string): boolean {
    const a = Buffer.from(this.hash(code), 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
```

---

## 3. Messaging — `messaging/noop-otp-sender.ts`

```ts
import type { OtpSender } from '@/application/ports/otp-sender.port';

/** Placeholder. TODO(integration): replace with SMTP / SMS provider adapter and wire it in container.ts. */
export class NoopOtpSender implements OtpSender {
  async send(): Promise<void> {
    // intentionally empty — the code must NOT be logged here
  }
}
```

---

## 4. Logging — `logging/logger.ts`

```ts
import pino, { type Logger } from 'pino';
import type { Env } from '@/config/env';

export function createLogger(env: Env): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.newPassword',
        '*.accessToken',
        '*.refreshToken',
        '*.resetToken',
        '*.code',
      ],
      censor: '[REDACTED]',
    },
    ...(env.IS_PRODUCTION ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
  });
}
```

Rule: never `console.log`. Never log request bodies. Never log OTP codes or tokens.

---

## 5. Admin seed — `seed/seed-admin.ts`

```ts
import type { Env } from '@/config/env';
import type { PasswordHasher } from '@/application/ports/password-hasher.port';
import type { UserRepository } from '@/domain/repositories/user.repository';

export async function seedAdmin(env: Env, users: UserRepository, hasher: PasswordHasher): Promise<void> {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) return;
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  if (await users.findByEmail(email)) return;
  await users.create({ email, passwordHash: await hasher.hash(env.SEED_ADMIN_PASSWORD), fullName: 'Administrator', role: 'admin' });
}
```

This is the **only** way an admin exists. With `DB_DRIVER=memory` it runs at every boot.

---

## 6. Composition root — `src/container.ts`

The one and only place where concrete classes are instantiated and wired.

```ts
import type { Env } from '@/config/env';
import { AuthSessionService } from '@/application/services/auth-session.service';
import { RegisterUseCase } from '@/application/use-cases/auth/register.use-case';
import { LoginUseCase } from '@/application/use-cases/auth/login.use-case';
import { RefreshTokenUseCase } from '@/application/use-cases/auth/refresh-token.use-case';
import { LogoutUseCase } from '@/application/use-cases/auth/logout.use-case';
import { ForgotPasswordUseCase } from '@/application/use-cases/auth/forgot-password.use-case';
import { VerifyOtpUseCase } from '@/application/use-cases/auth/verify-otp.use-case';
import { ChangePasswordUseCase } from '@/application/use-cases/auth/change-password.use-case';
import { GetMeUseCase } from '@/application/use-cases/user/get-me.use-case';
import { GetUserByIdUseCase } from '@/application/use-cases/user/get-user-by-id.use-case';
import { ListUsersUseCase } from '@/application/use-cases/user/list-users.use-case';
import { createPersistence } from '@/infrastructure/persistence/create-persistence';
import { BcryptPasswordHasher } from '@/infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from '@/infrastructure/security/jwt-token-service';
import { HmacOtpService } from '@/infrastructure/security/hmac-otp-service';
import { NoopOtpSender } from '@/infrastructure/messaging/noop-otp-sender';
import { createLogger } from '@/infrastructure/logging/logger';
import { seedAdmin } from '@/infrastructure/seed/seed-admin';

export function buildContainer(env: Env) {
  const logger = createLogger(env);
  const { users, sessions, otps } = createPersistence(env);

  const hasher = new BcryptPasswordHasher(env.BCRYPT_COST);
  const tokens = new JwtTokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    resetSecret: env.JWT_RESET_SECRET,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    resetTtlSeconds: env.RESET_TOKEN_TTL_SECONDS,
  });
  const otpService = new HmacOtpService(env.OTP_HMAC_SECRET);
  const otpSender = new NoopOtpSender();
  const sessionService = new AuthSessionService(sessions, tokens, env.REFRESH_TOKEN_TTL_SECONDS);

  const useCases = {
    register: new RegisterUseCase(users, hasher, sessionService),
    login: new LoginUseCase(users, hasher, sessionService),
    refresh: new RefreshTokenUseCase(users, sessions, tokens),
    logout: new LogoutUseCase(sessions, tokens),
    forgotPassword: new ForgotPasswordUseCase(users, otps, otpService, otpSender, {
      otpTtlSeconds: env.OTP_TTL_SECONDS,
      resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    }),
    verifyOtp: new VerifyOtpUseCase(users, otps, otpService, tokens, {
      otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
      resetTokenTtlSeconds: env.RESET_TOKEN_TTL_SECONDS,
    }),
    changePassword: new ChangePasswordUseCase(users, otps, sessions, hasher, tokens),
    getMe: new GetMeUseCase(users),
    getUserById: new GetUserByIdUseCase(users),
    listUsers: new ListUsersUseCase(users),
  };

  return {
    env,
    logger,
    tokens, // needed by the authenticate middleware
    useCases,
    /** Called once by server.ts before listening. */
    init: async (): Promise<void> => seedAdmin(env, users, hasher),
  };
}

export type Container = ReturnType<typeof buildContainer>;
```

Rules:
- Presentation receives `Container` (or pieces of it) as a parameter. It never `new`s a use case or repository.
- Swapping persistence (Mongo/Firebase) must require changes **only** in `create-persistence.ts` + the new repository files.

---

## 7. Definition of Done (file 04)

- All files under `src/infrastructure/**` and `src/container.ts` exist and compile.
- `grep -rE "from '@/presentation" src/infrastructure src/container.ts` returns nothing.
- `npx tsc -p tsconfig.json --noEmit` shows no errors in `src/shared`, `src/domain`, `src/application`, `src/infrastructure`, `src/container.ts`.
- Unit-test idea to add in file 06: `JwtTokenService` rejects a refresh token passed to `verifyAccess`.
