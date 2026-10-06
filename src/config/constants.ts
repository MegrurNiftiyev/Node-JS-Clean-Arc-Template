export const API_BASE_PATH = '/api/v1';

export const COOKIE_NAMES = { access: 'access_token', refresh: 'refresh_token' } as const;

export const HEADERS = {
  platform: 'x-platform',
  language: 'x-language',
  region: 'x-region',
  requestId: 'x-request-id',
} as const;

/** Keep in sync with the locale texts "at least 8" / "at most 72" (validation.PASSWORD_TOO_SHORT / TOO_LONG). */
export const PASSWORD_RULES = { min: 8, max: 72 } as const;

export const FULL_NAME_RULES = { min: 2, max: 100 } as const;

/** Keep in sync with validation.LIMIT_INVALID text ("between 1 and 100"). */
export const PAGINATION = { defaultPage: 1, defaultLimit: 20, maxLimit: 100 } as const;

export const JSON_BODY_LIMIT = '10kb';

export const JWT_ISSUER = 'node-js-clean-arc-template';
export const JWT_AUDIENCE = 'node-js-clean-arc-template-clients';

export const OTP_LENGTH = 6;
