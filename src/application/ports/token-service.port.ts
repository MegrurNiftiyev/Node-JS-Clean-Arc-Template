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
