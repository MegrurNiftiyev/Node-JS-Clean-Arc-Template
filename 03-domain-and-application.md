# 03 — Domain & Application Layers

> Prerequisites: files 01 and 02 completed.
> Creates `src/domain/**` and `src/application/**`.
> **Forbidden imports in these two layers:** `express`, `zod`, `jsonwebtoken`, `bcryptjs`, `pino`, anything from `infrastructure/` or `presentation/`.
> Allowed: `@/shared/errors`, `node:crypto` (`randomUUID` only), other domain/application files.

---

## 1. Data models (frozen shapes)

### 1.1 Enums

`src/domain/enums/role.ts`

```ts
export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];
```

`src/domain/enums/platform.ts`

```ts
export const PLATFORMS = ['web', 'mobile'] as const;
export type Platform = (typeof PLATFORMS)[number];
```

### 1.2 Entities

`src/domain/entities/user.entity.ts`

```ts
import type { Role } from '../enums/role';

export interface User {
  readonly id: string; // uuid v4
  email: string; // lower-case, unique, max 254
  passwordHash: string; // never leaves the backend
  fullName: string; // 2..100 chars
  role: Role;
  isActive: boolean;
  readonly createdAt: Date;
  updatedAt: Date;
}

export type NewUser = Pick<User, 'email' | 'passwordHash' | 'fullName' | 'role'>;
```

`src/domain/entities/refresh-session.entity.ts`

```ts
import type { Platform } from '../enums/platform';

/** One row per login (device/browser). Holds the hash of the CURRENT refresh token only. */
export interface RefreshSession {
  readonly id: string; // uuid v4 == `sid` claim
  readonly userId: string;
  tokenHash: string; // sha256 hex of the current refresh token
  platform: Platform;
  userAgent: string | null; // truncated to 255 chars
  readonly createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
```

`src/domain/entities/otp.entity.ts`

```ts
/** Password-reset OTP. At most one *active* OTP per user (creating a new one supersedes older ones). */
export interface Otp {
  readonly id: string; // uuid v4, also embedded in the reset token as `otpId`
  readonly userId: string;
  codeHash: string; // HMAC-SHA256 hex — the raw code is never stored
  attempts: number;
  readonly createdAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null; // set when the code was verified (reset token issued)
  consumedAt: Date | null; // set when the password was changed (single use)
}
```

### 1.3 Repository interfaces

`src/domain/repositories/user.repository.ts`

```ts
import type { NewUser, User } from '../entities/user.entity';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** MUST throw AppError('USER_EMAIL_ALREADY_EXISTS') on duplicate email (unique index in real DBs). */
  create(data: NewUser): Promise<User>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  /** Ordered by createdAt ASC then id ASC. `page` is 1-based. */
  list(params: { page: number; limit: number }): Promise<{ items: User[]; total: number }>;
}
```

`src/domain/repositories/refresh-session.repository.ts`

```ts
import type { RefreshSession } from '../entities/refresh-session.entity';

export interface RefreshSessionRepository {
  create(session: RefreshSession): Promise<void>;
  findById(id: string): Promise<RefreshSession | null>;
  updateTokenHash(id: string, tokenHash: string): Promise<void>;
  revoke(id: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
}
```

`src/domain/repositories/otp.repository.ts`

```ts
import type { Otp } from '../entities/otp.entity';

export interface OtpRepository {
  create(otp: Otp): Promise<void>;
  findById(id: string): Promise<Otp | null>;
  findLatestByUserId(userId: string): Promise<Otp | null>;
  update(otp: Otp): Promise<void>;
}
```

---

## 2. Ports (interfaces implemented by infrastructure)

`src/application/ports/password-hasher.port.ts`

```ts
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
  /** Burns the same CPU time as compare(); used when the user does not exist (timing-attack mitigation). */
  compareDummy(plain: string): Promise<void>;
}
```

`src/application/ports/token-service.port.ts`

```ts
import type { Role } from '@/domain/enums/role';

export interface AccessClaims { sub: string; role: Role; sid: string }
export interface RefreshClaims { sub: string; sid: string }
export interface ResetClaims { sub: string; otpId: string }

export interface TokenService {
  signAccess(claims: AccessClaims): string;
  signRefresh(claims: RefreshClaims): string;
  signReset(claims: ResetClaims): string;
  /** Throws AppError AUTH_TOKEN_EXPIRED | AUTH_TOKEN_INVALID */
  verifyAccess(token: string): AccessClaims;
  /** Throws AppError AUTH_REFRESH_TOKEN_INVALID (expired is also "invalid") */
  verifyRefresh(token: string): RefreshClaims;
  /** Throws AppError AUTH_RESET_TOKEN_INVALID */
  verifyReset(token: string): ResetClaims;
  /** sha256 hex — used to store refresh tokens at rest */
  hashToken(token: string): string;
}
```

`src/application/ports/otp-service.port.ts`

```ts
export interface OtpService {
  /** 6-digit numeric string, cryptographically random, zero-padded. */
  generate(): string;
  hash(code: string): string;
  /** Constant-time comparison. */
  matches(code: string, hash: string): boolean;
}
```

`src/application/ports/otp-sender.port.ts`

```ts
export interface OtpSender {
  // TODO(integration): implement with an e-mail/SMS provider. Never log the code in production.
  send(target: { email: string; code: string }): Promise<void>;
}
```

---

## 3. DTOs and mapper

`src/application/dto/user.dto.ts`

```ts
import type { Role } from '@/domain/enums/role';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}
```

`src/application/mappers/user.mapper.ts`

```ts
import type { User } from '@/domain/entities/user.entity';
import type { PublicUser } from '../dto/user.dto';

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt.toISOString(),
  updatedAt: u.updatedAt.toISOString(),
});
```

`src/application/dto/auth.dto.ts`

```ts
import type { Platform } from '@/domain/enums/platform';
import type { PublicUser } from './user.dto';

export interface ClientMeta { platform: Platform; userAgent: string | null }
export interface AuthTokens { accessToken: string; refreshToken: string }
export interface AuthResult { user: PublicUser; tokens: AuthTokens }

export interface RegisterInput { email: string; password: string; fullName: string; meta: ClientMeta }
export interface LoginInput { email: string; password: string; meta: ClientMeta }
export interface ForgotPasswordInput { email: string }
export interface ForgotPasswordResult {
  /** Present only when a code was actually generated (account exists). The controller decides whether to expose it. */
  code: string | null;
  expiresInSeconds: number;
}
export interface VerifyOtpInput { email: string; code: string }
export interface VerifyOtpResult { resetToken: string; expiresInSeconds: number }
export interface ChangePasswordInput { resetToken: string; newPassword: string }
export interface Requester { id: string; role: import('@/domain/enums/role').Role }
```

`src/application/use-cases/use-case.ts`

```ts
export interface UseCase<I, O> {
  execute(input: I): Promise<O>;
}
```

---

## 4. Shared application service

`src/application/services/auth-session.service.ts`

```ts
import { randomUUID } from 'node:crypto';
import type { User } from '@/domain/entities/user.entity';
import type { RefreshSessionRepository } from '@/domain/repositories/refresh-session.repository';
import type { TokenService } from '../ports/token-service.port';
import type { AuthTokens, ClientMeta } from '../dto/auth.dto';

export class AuthSessionService {
  constructor(
    private readonly sessions: RefreshSessionRepository,
    private readonly tokens: TokenService,
    private readonly refreshTtlSeconds: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Creates a new session row (one per login) and returns a fresh token pair. */
  async start(user: User, meta: ClientMeta): Promise<AuthTokens> {
    const sid = randomUUID();
    const now = this.now();
    const refreshToken = this.tokens.signRefresh({ sub: user.id, sid });
    await this.sessions.create({
      id: sid,
      userId: user.id,
      tokenHash: this.tokens.hashToken(refreshToken),
      platform: meta.platform,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.refreshTtlSeconds * 1000),
      revokedAt: null,
    });
    const accessToken = this.tokens.signAccess({ sub: user.id, role: user.role, sid });
    return { accessToken, refreshToken };
  }
}
```

---

## 5. Use cases

All use cases: one class, constructor-injected dependencies (interfaces only), one public `execute`. Throw `AppError` for every expected failure. Return plain data (never `Response`, never cookies).

### 5.1 Register — `auth/register.use-case.ts`

```ts
import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { PasswordHasher } from '../../ports/password-hasher.port';
import type { AuthSessionService } from '../../services/auth-session.service';
import type { AuthResult, RegisterInput } from '../../dto/auth.dto';
import { toPublicUser } from '../../mappers/user.mapper';
import type { UseCase } from '../use-case';

export class RegisterUseCase implements UseCase<RegisterInput, AuthResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: AuthSessionService,
  ) {}

  async execute(input: RegisterInput): Promise<AuthResult> {
    if (await this.users.findByEmail(input.email)) throw new AppError('USER_EMAIL_ALREADY_EXISTS');
    const user = await this.users.create({
      email: input.email, // already lower-cased by the zod schema
      passwordHash: await this.hasher.hash(input.password),
      fullName: input.fullName,
      role: 'user', // ALWAYS 'user'. Admins are never created through the API.
    });
    const tokens = await this.sessions.start(user, input.meta);
    return { user: toPublicUser(user), tokens };
  }
}
```

### 5.2 Login — `auth/login.use-case.ts`

```ts
export class LoginUseCase implements UseCase<LoginInput, AuthResult> {
  constructor(users: UserRepository, hasher: PasswordHasher, sessions: AuthSessionService) {}

  async execute(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      await this.hasher.compareDummy(input.password); // equalize timing
      throw new AppError('AUTH_INVALID_CREDENTIALS');
    }
    if (!(await this.hasher.compare(input.password, user.passwordHash))) throw new AppError('AUTH_INVALID_CREDENTIALS');
    if (!user.isActive) throw new AppError('AUTH_ACCOUNT_DISABLED'); // checked AFTER the password to avoid account probing
    const tokens = await this.sessions.start(user, input.meta);
    return { user: toPublicUser(user), tokens };
  }
}
```

### 5.3 Refresh — `auth/refresh-token.use-case.ts` (rotation + reuse detection)

```ts
export class RefreshTokenUseCase implements UseCase<string, AuthTokens> {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: RefreshSessionRepository,
    private readonly tokens: TokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(refreshToken: string): Promise<AuthTokens> {
    const claims = this.tokens.verifyRefresh(refreshToken); // AUTH_REFRESH_TOKEN_INVALID
    const now = this.now();
    const session = await this.sessions.findById(claims.sid);
    if (!session || session.userId !== claims.sub || session.expiresAt <= now) {
      throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    }
    // Revoked session OR token that is not the current one => replay of an old token => kill every session of this user.
    if (session.revokedAt !== null || session.tokenHash !== this.tokens.hashToken(refreshToken)) {
      await this.sessions.revokeAllForUser(session.userId, now);
      throw new AppError('AUTH_REFRESH_TOKEN_REUSED');
    }
    const user = await this.users.findById(claims.sub);
    if (!user) throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    if (!user.isActive) throw new AppError('AUTH_ACCOUNT_DISABLED');

    const newRefresh = this.tokens.signRefresh({ sub: user.id, sid: session.id });
    await this.sessions.updateTokenHash(session.id, this.tokens.hashToken(newRefresh));
    return { accessToken: this.tokens.signAccess({ sub: user.id, role: user.role, sid: session.id }), refreshToken: newRefresh };
  }
}
```

Known trade-off (document in README): two simultaneous refresh calls with the same token (e.g. two browser tabs) will trigger reuse detection. Clients must serialize refresh calls.

### 5.4 Logout — `auth/logout.use-case.ts` (idempotent, never throws for bad tokens)

```ts
export class LogoutUseCase implements UseCase<string | undefined, void> {
  constructor(private readonly sessions: RefreshSessionRepository, private readonly tokens: TokenService, private readonly now: () => Date = () => new Date()) {}

  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const claims = this.tokens.verifyRefresh(refreshToken);
      await this.sessions.revoke(claims.sid, this.now());
    } catch (e) {
      if (!(e instanceof AppError)) throw e; // invalid/expired token => nothing to revoke, still a successful logout
    }
  }
}
```

### 5.5 Forgot password — `auth/forgot-password.use-case.ts`

Constructor: `users, otps: OtpRepository, otpService: OtpService, otpSender: OtpSender, config: { otpTtlSeconds, resendCooldownSeconds }, now`.

Algorithm (exact):
1. `user = users.findByEmail(email)`. If missing **or** `!isActive` → return `{ code: null, expiresInSeconds: config.otpTtlSeconds }` (generic result: no account enumeration).
2. `latest = otps.findLatestByUserId(user.id)`. If `latest` exists and `now - latest.createdAt < resendCooldownSeconds*1000` → `throw AppError('OTP_RESEND_COOLDOWN')`. (Accepted trade-off: reveals account existence only to a client that is already rate-limited by `OTP_RATE_LIMIT_MAX`.)
3. `code = otpService.generate()`; create `Otp { id: randomUUID(), userId, codeHash: otpService.hash(code), attempts: 0, createdAt: now, expiresAt: now+ttl, verifiedAt: null, consumedAt: null }`. A newly created OTP supersedes older ones because lookups always use `findLatestByUserId`.
4. `await otpSender.send({ email: user.email, code })` (`NoopOtpSender` for now).
5. Return `{ code, expiresInSeconds }`.

### 5.6 Verify OTP — `auth/verify-otp.use-case.ts`

Constructor: `users, otps, otpService, tokens: TokenService, config: { otpMaxAttempts, resetTokenTtlSeconds }, now`.

Algorithm (exact):
1. `user = findByEmail(email)`; missing → `OTP_INVALID`.
2. `otp = otps.findLatestByUserId(user.id)`; missing, or `otp.verifiedAt !== null`, or `otp.consumedAt !== null` → `OTP_INVALID`.
3. `otp.expiresAt <= now` → `OTP_EXPIRED`.
4. `otp.attempts >= otpMaxAttempts` → `OTP_TOO_MANY_ATTEMPTS`.
5. If `!otpService.matches(code, otp.codeHash)`: `otp.attempts += 1; otps.update(otp)`; throw `OTP_INVALID`.
6. Success: `otp.verifiedAt = now; otps.update(otp)`; `resetToken = tokens.signReset({ sub: user.id, otpId: otp.id })`; return `{ resetToken, expiresInSeconds: resetTokenTtlSeconds }`.

### 5.7 Change password — `auth/change-password.use-case.ts`

Constructor: `users, otps, sessions: RefreshSessionRepository, hasher, tokens, now`.

Algorithm (exact):
1. `claims = tokens.verifyReset(input.resetToken)` (throws `AUTH_RESET_TOKEN_INVALID`).
2. `otp = otps.findById(claims.otpId)`. Must exist, `otp.userId === claims.sub`, `otp.verifiedAt !== null`, `otp.consumedAt === null`; otherwise `AUTH_RESET_TOKEN_INVALID`. (Single use.)
3. `user = users.findById(claims.sub)`; missing → `AUTH_RESET_TOKEN_INVALID`; inactive → `AUTH_ACCOUNT_DISABLED`.
4. `users.updatePasswordHash(user.id, await hasher.hash(newPassword))`.
5. `otp.consumedAt = now; otps.update(otp)`.
6. `sessions.revokeAllForUser(user.id, now)` (force re-login everywhere).

### 5.8 User use cases — `user/*.use-case.ts`

```ts
// get-me.use-case.ts
export class GetMeUseCase implements UseCase<string, PublicUser> {
  constructor(private readonly users: UserRepository) {}
  async execute(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError('USER_NOT_FOUND');
    return toPublicUser(user);
  }
}

// get-user-by-id.use-case.ts   input: { requester: Requester; targetId: string }
//   - admin may read any user; a regular user may read ONLY themselves.
//   - requester.role !== 'admin' && requester.id !== targetId  -> AppError('AUTH_FORBIDDEN')  (checked BEFORE lookup)
//   - not found -> AppError('USER_NOT_FOUND')

// list-users.use-case.ts       input: { requester: Requester; page: number; limit: number }
//   - requester.role !== 'admin' -> AppError('AUTH_FORBIDDEN')   (defense in depth; the route also has authorize('admin'))
//   - returns { items: PublicUser[]; total: number; page: number; limit: number; totalPages: number }
//   - totalPages = Math.max(1, Math.ceil(total / limit))
```

Authorization rule of thumb: **route-level `authorize()` AND use-case-level ownership/role checks**. Never rely on only one.

---

## 6. Definition of Done (file 03)

- All files in `src/domain/**` and `src/application/**` from the tree in file 01 exist.
- `grep -rE "from '(express|zod|jsonwebtoken|bcryptjs|pino)" src/domain src/application` returns nothing.
- `grep -rE "infrastructure|presentation" src/domain src/application` returns nothing.
- `npx tsc -p tsconfig.json --noEmit` shows no errors inside `src/domain`, `src/application`, `src/shared`.
