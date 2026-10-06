export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
  /** Burns the same CPU time as compare(); used when the user does not exist (timing-attack mitigation). */
  compareDummy(plain: string): Promise<void>;
}
