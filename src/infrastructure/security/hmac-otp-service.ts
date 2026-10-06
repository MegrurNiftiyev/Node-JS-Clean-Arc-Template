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
