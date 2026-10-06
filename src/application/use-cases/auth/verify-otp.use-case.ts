import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { OtpRepository } from '@/domain/repositories/otp.repository';
import type { OtpService } from '../../ports/otp-service.port';
import type { TokenService } from '../../ports/token-service.port';
import type { VerifyOtpInput, VerifyOtpResult } from '../../dto/auth.dto';
import type { UseCase } from '../use-case';

export interface VerifyOtpConfig {
  otpMaxAttempts: number;
  resetTokenTtlSeconds: number;
}

export class VerifyOtpUseCase implements UseCase<VerifyOtpInput, VerifyOtpResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly otps: OtpRepository,
    private readonly otpService: OtpService,
    private readonly tokens: TokenService,
    private readonly config: VerifyOtpConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    const user = await this.users.findByEmail(input.email);
    if (!user) throw new AppError('OTP_INVALID');

    const otp = await this.otps.findLatestByUserId(user.id);
    if (!otp || otp.verifiedAt !== null || otp.consumedAt !== null) throw new AppError('OTP_INVALID');

    const now = this.now();
    if (otp.expiresAt <= now) throw new AppError('OTP_EXPIRED');
    if (otp.attempts >= this.config.otpMaxAttempts) throw new AppError('OTP_TOO_MANY_ATTEMPTS');

    if (!this.otpService.matches(input.code, otp.codeHash)) {
      otp.attempts += 1;
      await this.otps.update(otp);
      throw new AppError('OTP_INVALID');
    }

    otp.verifiedAt = now;
    await this.otps.update(otp);
    const resetToken = this.tokens.signReset({ sub: user.id, otpId: otp.id });
    return { resetToken, expiresInSeconds: this.config.resetTokenTtlSeconds };
  }
}
