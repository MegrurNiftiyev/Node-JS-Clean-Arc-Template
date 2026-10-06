import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PasswordHasher } from '@/application/ports/password-hasher.port';

export class BcryptPasswordHasher implements PasswordHasher {
  private readonly dummyHash: string;

  constructor(private readonly cost: number) {
    this.dummyHash = bcrypt.hashSync(randomUUID(), cost); // computed once at boot
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async compareDummy(plain: string): Promise<void> {
    await bcrypt.compare(plain, this.dummyHash);
  }
}
