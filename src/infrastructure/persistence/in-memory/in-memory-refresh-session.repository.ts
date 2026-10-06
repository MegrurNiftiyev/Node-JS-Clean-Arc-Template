import type { RefreshSession } from '@/domain/entities/refresh-session.entity';
import type { RefreshSessionRepository } from '@/domain/repositories/refresh-session.repository';

export class InMemoryRefreshSessionRepository implements RefreshSessionRepository {
  private readonly byId = new Map<string, RefreshSession>();

  create(session: RefreshSession): Promise<void> {
    this.byId.set(session.id, { ...session });
    return Promise.resolve();
  }

  findById(id: string): Promise<RefreshSession | null> {
    const session = this.byId.get(id);
    return Promise.resolve(session ? { ...session } : null);
  }

  updateTokenHash(id: string, tokenHash: string): Promise<void> {
    const session = this.byId.get(id);
    if (session) session.tokenHash = tokenHash;
    return Promise.resolve();
  }

  revoke(id: string, at: Date): Promise<void> {
    const session = this.byId.get(id);
    if (session && session.revokedAt === null) session.revokedAt = at;
    return Promise.resolve();
  }

  revokeAllForUser(userId: string, at: Date): Promise<void> {
    for (const session of this.byId.values()) {
      if (session.userId === userId && session.revokedAt === null) session.revokedAt = at;
    }
    return Promise.resolve();
  }
}
