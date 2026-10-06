import { randomUUID } from 'node:crypto';
import { AppError } from '@/shared/errors';
import type { NewUser, User } from '@/domain/entities/user.entity';
import type { UserRepository } from '@/domain/repositories/user.repository';

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();
  private readonly idByEmail = new Map<string, string>();

  findById(id: string): Promise<User | null> {
    const user = this.byId.get(id);
    return Promise.resolve(user ? { ...user } : null);
  }

  findByEmail(email: string): Promise<User | null> {
    const id = this.idByEmail.get(email.toLowerCase());
    const user = id ? this.byId.get(id) : undefined;
    return Promise.resolve(user ? { ...user } : null);
  }

  create(data: NewUser): Promise<User> {
    const email = data.email.toLowerCase();
    if (this.idByEmail.has(email)) return Promise.reject(new AppError('USER_EMAIL_ALREADY_EXISTS'));
    const now = new Date();
    const user: User = { id: randomUUID(), ...data, email, isActive: true, createdAt: now, updatedAt: now };
    this.byId.set(user.id, user);
    this.idByEmail.set(email, user.id);
    return Promise.resolve({ ...user });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const user = this.byId.get(id);
    if (user) {
      user.passwordHash = passwordHash;
      user.updatedAt = new Date();
    }
    return Promise.resolve();
  }

  list({ page, limit }: { page: number; limit: number }): Promise<{ items: User[]; total: number }> {
    const all = [...this.byId.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    const start = (page - 1) * limit;
    return Promise.resolve({ items: all.slice(start, start + limit).map((u) => ({ ...u })), total: all.length });
  }
}
