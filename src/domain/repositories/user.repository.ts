import type { NewUser, User } from '../entities/user.entity';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** MUST throw AppError('USER_EMAIL_ALREADY_EXISTS') on duplicate email (unique index in real DBs). */
  create(data: NewUser): Promise<User>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  /** Ordered by createdAt ASC then id ASC. `page` is 1-based. */
  list(params: { page: number; limit: number }): Promise<{ items: User[]; total: number }>;
}
