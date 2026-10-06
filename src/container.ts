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

/** Composition root: the ONLY place where concrete classes are instantiated and wired. */
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
