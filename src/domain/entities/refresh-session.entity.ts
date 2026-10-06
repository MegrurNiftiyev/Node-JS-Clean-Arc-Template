import type { Platform } from '../enums/platform';

/** One row per login (device/browser). Holds the hash of the CURRENT refresh token only. */
export interface RefreshSession {
  readonly id: string; // uuid v4 == `sid` claim
  readonly userId: string;
  tokenHash: string; // sha256 hex of the current refresh token
  platform: Platform;
  userAgent: string | null; // truncated to 255 chars
  readonly createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
