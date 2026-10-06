import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { OtpRepository } from '@/domain/repositories/otp.repository';
import type { RefreshSessionRepository } from '@/domain/repositories/refresh-session.repository';
import type { PasswordHasher } from '../../ports/password-hasher.port';
import type { TokenService } from '../../ports/token-service.port';
import type { ChangePasswordInput } from '../../dto/auth.dto';
import type { UseCase } from '../use-case';

export class ChangePasswordUseCase implements UseCase<ChangePasswordInput, void> {
  constructor(
    private readonly users: UserRepository,
    private readonly otps: OtpRepository,
    private readonly sessions: RefreshSessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const claims = this.tokens.verifyReset(input.resetToken); // AUTH_RESET_TOKEN_INVALID

    // Single use: the reset token is bound to a verified, not-yet-consumed OTP.
    const otp = await this.otps.findById(claims.otpId);
    if (!otp || otp.userId !== claims.sub || otp.verifiedAt === null || otp.consumedAt !== null) {
      throw new AppError('AUTH_RESET_TOKEN_INVALID');
    }

    const user = await this.users.findById(claims.sub);
    if (!user) throw new AppError('AUTH_RESET_TOKEN_INVALID');
    if (!user.isActive) throw new AppError('AUTH_ACCOUNT_DISABLED');

    const now = this.now();
    await this.users.updatePasswordHash(user.id, await this.hasher.hash(input.newPassword));
    otp.consumedAt = now;
    await this.otps.update(otp);
    await this.sessions.revokeAllForUser(user.id, now); // force re-login everywhere
  }
}
