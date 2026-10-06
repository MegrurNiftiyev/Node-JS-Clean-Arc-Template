import type { CookieOptions, Response } from 'express';
import type { Env } from '@/config/env';
import { API_BASE_PATH, COOKIE_NAMES } from '@/config/constants';
import type { AuthTokens } from '@/application/dto/auth.dto';

const base = (env: Env): CookieOptions => ({
  httpOnly: true, // JS cannot read it → XSS cannot steal tokens
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export function setAuthCookies(res: Response, env: Env, t: AuthTokens): void {
  res.cookie(COOKIE_NAMES.access, t.accessToken, { ...base(env), path: '/', maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000 });
  res.cookie(COOKIE_NAMES.refresh, t.refreshToken, { ...base(env), path: `${API_BASE_PATH}/auth`, maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000 });
}

export function clearAuthCookies(res: Response, env: Env): void {
  res.clearCookie(COOKIE_NAMES.access, { ...base(env), path: '/' });
  res.clearCookie(COOKIE_NAMES.refresh, { ...base(env), path: `${API_BASE_PATH}/auth` });
}
