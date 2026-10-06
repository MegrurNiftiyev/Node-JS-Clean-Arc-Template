import { describe, it, expect } from 'vitest';
import { HmacOtpService } from '@/infrastructure/security/hmac-otp-service';

describe('HmacOtpService', () => {
  const secret = 'my-otp-secret-key-1234567890';
  const otpService = new HmacOtpService(secret);

  it('generates 6 digits', () => {
    for (let i = 0; i < 200; i++) {
      const code = otpService.generate();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('hash is deterministic per secret and matches correct code', () => {
    const code = '123456';
    const hash1 = otpService.hash(code);
    const hash2 = otpService.hash(code);
    expect(hash1).toBe(hash2);
    expect(otpService.matches(code, hash1)).toBe(true);
  });

  it('hash is different for different secrets', () => {
    const code = '123456';
    const otherOtpService = new HmacOtpService('different-secret-key-1234567890');
    const hash1 = otpService.hash(code);
    const hash2 = otherOtpService.hash(code);
    expect(hash1).not.toBe(hash2);
    expect(otherOtpService.matches(code, hash1)).toBe(false);
  });

  it('returns false for wrong code', () => {
    const code = '123456';
    const hash = otpService.hash(code);
    expect(otpService.matches('654321', hash)).toBe(false);
  });
});
