import type { RefreshSession } from '../entities/refresh-session.entity';

export interface RefreshSessionRepository {
  create(session: RefreshSession): Promise<void>;
  findById(id: string): Promise<RefreshSession | null>;
  updateTokenHash(id: string, tokenHash: string): Promise<void>;
  revoke(id: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
}
