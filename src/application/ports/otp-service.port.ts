export interface OtpService {
  /** 6-digit numeric string, cryptographically random, zero-padded. */
  generate(): string;
  hash(code: string): string;
  /** Constant-time comparison. */
  matches(code: string, hash: string): boolean;
}
