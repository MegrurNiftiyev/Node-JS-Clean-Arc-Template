/** Password-reset OTP. At most one *active* OTP per user (creating a new one supersedes older ones). */
export interface Otp {
  readonly id: string; // uuid v4, also embedded in the reset token as `otpId`
  readonly userId: string;
  codeHash: string; // HMAC-SHA256 hex — the raw code is never stored
  attempts: number;
  readonly createdAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null; // set when the code was verified (reset token issued)
  consumedAt: Date | null; // set when the password was changed (single use)
}
