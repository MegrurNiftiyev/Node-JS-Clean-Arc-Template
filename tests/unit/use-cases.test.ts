import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildContainer } from '@/container';
import { loadEnv } from '@/config/env';
import { AppError } from '@/shared/errors';

describe('Use Cases', () => {
  let container: ReturnType<typeof buildContainer>;

  beforeEach(async () => {
    vi.useFakeTimers();
    const env = loadEnv(process.env);
    container = buildContainer(env);
    await container.init(); // seeds admin
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('register duplicate email → USER_EMAIL_ALREADY_EXISTS', async () => {
    await container.useCases.register.execute({ email: 'test@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'web', userAgent: null } });
    await expect(container.useCases.register.execute({ email: 'test@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'web', userAgent: null } })).rejects.toThrowError(new AppError('USER_EMAIL_ALREADY_EXISTS'));
  });

  it('login unknown email and wrong password both → AUTH_INVALID_CREDENTIALS', async () => {
    await container.useCases.register.execute({ email: 'test2@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'web', userAgent: null } });
    
    await expect(container.useCases.login.execute({ email: 'test2@example.com', password: 'WrongPassword', meta: { platform: 'web', userAgent: null } })).rejects.toThrowError(new AppError('AUTH_INVALID_CREDENTIALS'));
    await expect(container.useCases.login.execute({ email: 'unknown@example.com', password: 'Password123', meta: { platform: 'web', userAgent: null } })).rejects.toThrowError(new AppError('AUTH_INVALID_CREDENTIALS'));
  });

  it('refresh rotation returns a different refresh token', async () => {
    const { tokens } = await container.useCases.register.execute({ email: 'test3@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'mobile', userAgent: null } });
    if (!tokens) throw new Error('no tokens');
    
    const newTokens = await container.useCases.refresh.execute(tokens.refreshToken);
    expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);
  });

  it('reuse of an old refresh token → AUTH_REFRESH_TOKEN_REUSED and all sessions revoked', async () => {
    const { tokens } = await container.useCases.register.execute({ email: 'test4@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'mobile', userAgent: null } });
    if (!tokens) throw new Error('no tokens');
    
    const newTokens = await container.useCases.refresh.execute(tokens.refreshToken);
    
    // Reuse old token
    await expect(container.useCases.refresh.execute(tokens.refreshToken)).rejects.toThrowError(new AppError('AUTH_REFRESH_TOKEN_REUSED'));
    
    // New token should also be revoked now
    await expect(container.useCases.refresh.execute(newTokens.refreshToken)).rejects.toThrowError(new AppError('AUTH_REFRESH_TOKEN_INVALID'));
  });

  it('OTP: wrong code increments attempts, 5th wrong attempt then correct code → OTP_TOO_MANY_ATTEMPTS', async () => {
    await container.useCases.register.execute({ email: 'test5@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'web', userAgent: null } });
    
    const { code } = await container.useCases.forgotPassword.execute({ email: 'test5@example.com' });
    if (!code) throw new Error('no code');
    
    for (let i = 0; i < 5; i++) {
      await expect(container.useCases.verifyOtp.execute({ email: 'test5@example.com', code: '000000' })).rejects.toThrowError(new AppError('OTP_INVALID'));
    }
    
    await expect(container.useCases.verifyOtp.execute({ email: 'test5@example.com', code })).rejects.toThrowError(new AppError('OTP_TOO_MANY_ATTEMPTS'));
  });

  it('expired OTP → OTP_EXPIRED', async () => {
    await container.useCases.register.execute({ email: 'test6@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'web', userAgent: null } });
    
    const { code } = await container.useCases.forgotPassword.execute({ email: 'test6@example.com' });
    if (!code) throw new Error('no code');
    
    vi.advanceTimersByTime(11 * 60 * 1000); // 11 minutes
    
    await expect(container.useCases.verifyOtp.execute({ email: 'test6@example.com', code })).rejects.toThrowError(new AppError('OTP_EXPIRED'));
  });

  it('reset token cannot be used twice', async () => {
    await container.useCases.register.execute({ email: 'test7@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'web', userAgent: null } });
    
    const { code } = await container.useCases.forgotPassword.execute({ email: 'test7@example.com' });
    if (!code) throw new Error('no code');
    
    const { resetToken } = await container.useCases.verifyOtp.execute({ email: 'test7@example.com', code });
    
    await container.useCases.changePassword.execute({ resetToken, newPassword: 'NewPassword123' });
    await expect(container.useCases.changePassword.execute({ resetToken, newPassword: 'AnotherPassword123' })).rejects.toThrowError(new AppError('AUTH_RESET_TOKEN_INVALID'));
  });

  it('GetUserById for a non-admin requesting another id → AUTH_FORBIDDEN', async () => {
    const user1 = await container.useCases.register.execute({ email: 'test8@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'web', userAgent: null } });
    const user2 = await container.useCases.register.execute({ email: 'test9@example.com', password: 'Password123', fullName: 'Test', meta: { platform: 'web', userAgent: null } });
    
    await expect(container.useCases.getUserById.execute({ requester: { id: user1.user.id, role: 'user' }, targetId: user2.user.id })).rejects.toThrowError(new AppError('AUTH_FORBIDDEN'));
  });
});
