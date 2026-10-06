import type { Platform } from '@/domain/enums/platform';
import type { Role } from '@/domain/enums/role';
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
export interface Requester { id: string; role: Role }
