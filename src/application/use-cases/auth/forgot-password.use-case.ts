import { randomUUID } from 'node:crypto';
import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { OtpRepository } from '@/domain/repositories/otp.repository';
import type { OtpService } from '../../ports/otp-service.port';
import type { OtpSender } from '../../ports/otp-sender.port';
import type { ForgotPasswordInput, ForgotPasswordResult } from '../../dto/auth.dto';
import type { UseCase } from '../use-case';

export interface ForgotPasswordConfig {
  otpTtlSeconds: number;
  resendCooldownSeconds: number;
}

export class ForgotPasswordUseCase implements UseCase<ForgotPasswordInput, ForgotPasswordResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly otps: OtpRepository,
    private readonly otpService: OtpService,
    private readonly otpSender: OtpSender,
    private readonly config: ForgotPasswordConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ForgotPasswordInput): Promise<ForgotPasswordResult> {
    const expiresInSeconds = this.config.otpTtlSeconds;
    const user = await this.users.findByEmail(input.email);
    // Generic result for unknown/disabled accounts: no account enumeration.
    if (!user || !user.isActive) return { code: null, expiresInSeconds };

    const now = this.now();
    const latest = await this.otps.findLatestByUserId(user.id);
    // Accepted trade-off: reveals account existence only to a client already limited by OTP_RATE_LIMIT_MAX.
    if (latest && now.getTime() - latest.createdAt.getTime() < this.config.resendCooldownSeconds * 1000) {
      throw new AppError('OTP_RESEND_COOLDOWN');
    }

    const code = this.otpService.generate();
    // A newly created OTP supersedes older ones because lookups always use findLatestByUserId.
    await this.otps.create({
      id: randomUUID(),
      userId: user.id,
      codeHash: this.otpService.hash(code),
      attempts: 0,
      createdAt: now,
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
      verifiedAt: null,
      consumedAt: null,
    });
    await this.otpSender.send({ email: user.email, code });
    return { code, expiresInSeconds };
  }
}
