import { createHash, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { AppError, type ErrorCode } from '@/shared/errors';
import { JWT_AUDIENCE, JWT_ISSUER } from '@/config/constants';
import { ROLES, type Role } from '@/domain/enums/role';
import type {
  AccessClaims,
  RefreshClaims,
  ResetClaims,
  TokenService,
} from '@/application/ports/token-service.port';

type TokenType = 'access' | 'refresh' | 'reset';

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  resetSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  resetTtlSeconds: number;
}

const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

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
    const p = this.verify(token, 'access', this.cfg.accessSecret, {
      invalid: 'AUTH_TOKEN_INVALID',
      expired: 'AUTH_TOKEN_EXPIRED',
    });
    const role: unknown = p['role'];
    const sid: unknown = p['sid'];
    if (typeof p.sub !== 'string' || typeof sid !== 'string' || !isRole(role)) {
      throw new AppError('AUTH_TOKEN_INVALID');
    }
    return { sub: p.sub, sid, role };
  }

  verifyRefresh(token: string): RefreshClaims {
    const p = this.verify(token, 'refresh', this.cfg.refreshSecret, {
      invalid: 'AUTH_REFRESH_TOKEN_INVALID',
      expired: 'AUTH_REFRESH_TOKEN_INVALID',
    });
    const sid: unknown = p['sid'];
    if (typeof p.sub !== 'string' || typeof sid !== 'string') throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    return { sub: p.sub, sid };
  }

  verifyReset(token: string): ResetClaims {
    const p = this.verify(token, 'reset', this.cfg.resetSecret, {
      invalid: 'AUTH_RESET_TOKEN_INVALID',
      expired: 'AUTH_RESET_TOKEN_INVALID',
    });
    const otpId: unknown = p['otpId'];
    if (typeof p.sub !== 'string' || typeof otpId !== 'string') throw new AppError('AUTH_RESET_TOKEN_INVALID');
    return { sub: p.sub, otpId };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sign(extra: Record<string, unknown>, sub: string, typ: TokenType, secret: string, ttl: number): string {
    return jwt.sign({ ...extra, typ }, secret, {
      algorithm: 'HS256',
      subject: sub,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ttl,
      jwtid: randomUUID(),
    });
  }

  private verify(
    token: string,
    typ: TokenType,
    secret: string,
    errors: { invalid: ErrorCode; expired: ErrorCode },
  ): JwtPayload {
    try {
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (typeof payload === 'string' || payload['typ'] !== typ) throw new AppError(errors.invalid);
      return payload;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof jwt.TokenExpiredError) throw new AppError(errors.expired);
      throw new AppError(errors.invalid);
    }
  }
}
