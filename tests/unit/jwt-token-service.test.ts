import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JwtTokenService } from '@/infrastructure/security/jwt-token-service';
import { AppError } from '@/shared/errors';

describe('JwtTokenService', () => {
  const cfg = {
    accessSecret: 'access-secret-32-chars-at-least-wow',
    refreshSecret: 'refresh-secret-32-chars-at-least-w',
    resetSecret: 'reset-secret-32-chars-at-least-wow',
    accessTtlSeconds: 1,
    refreshTtlSeconds: 3600,
    resetTtlSeconds: 900,
  };

  let tokens: JwtTokenService;

  beforeEach(() => {
    vi.useFakeTimers();
    tokens = new JwtTokenService(cfg);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates tokens and verifies them', () => {
    const accessToken = tokens.signAccess({ sub: 'user-1', role: 'user', sid: 'session-1' });
    const refreshToken = tokens.signRefresh({ sub: 'user-1', sid: 'session-1' });
    
    expect(accessToken).toBeTypeOf('string');
    expect(refreshToken).toBeTypeOf('string');

    const access = tokens.verifyAccess(accessToken);
    expect(access.sub).toBe('user-1');
    expect(access.role).toBe('user');
    expect(access.sid).toBe('session-1');

    const refresh = tokens.verifyRefresh(refreshToken);
    expect(refresh.sub).toBe('user-1');
    expect(refresh.sid).toBe('session-1');
  });

  it('throws AUTH_TOKEN_INVALID if refresh token passed to verifyAccess', () => {
    const refreshToken = tokens.signRefresh({ sub: 'user-1', sid: 'session-1' });
    expect(() => tokens.verifyAccess(refreshToken)).toThrowError(new AppError('AUTH_TOKEN_INVALID'));
  });

  it('throws AUTH_REFRESH_TOKEN_INVALID if access token passed to verifyRefresh', () => {
    const accessToken = tokens.signAccess({ sub: 'user-1', role: 'user', sid: 'session-1' });
    expect(() => tokens.verifyRefresh(accessToken)).toThrowError(new AppError('AUTH_REFRESH_TOKEN_INVALID'));
  });

  it('throws AUTH_TOKEN_EXPIRED for expired access token', () => {
    const accessToken = tokens.signAccess({ sub: 'user-1', role: 'user', sid: 'session-1' });
    
    vi.advanceTimersByTime(2000); // Wait 2 seconds (ttl is 1s)
    
    expect(() => tokens.verifyAccess(accessToken)).toThrowError(new AppError('AUTH_TOKEN_EXPIRED'));
  });

  it('throws AUTH_TOKEN_INVALID if token signed with different secret', () => {
    const otherTokens = new JwtTokenService({ ...cfg, accessSecret: 'another-secret-key-that-is-also-long-enough' });
    const accessToken = otherTokens.signAccess({ sub: 'user-1', role: 'user', sid: 'session-1' });

    expect(() => tokens.verifyAccess(accessToken)).toThrowError(new AppError('AUTH_TOKEN_INVALID'));
  });

  it('throws AUTH_TOKEN_INVALID for invalid token structure', () => {
    expect(() => tokens.verifyAccess('invalid.token.here')).toThrowError(new AppError('AUTH_TOKEN_INVALID'));
  });
});
