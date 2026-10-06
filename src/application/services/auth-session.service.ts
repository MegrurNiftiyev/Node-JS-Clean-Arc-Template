import { randomUUID } from 'node:crypto';
import type { User } from '@/domain/entities/user.entity';
import type { RefreshSessionRepository } from '@/domain/repositories/refresh-session.repository';
import type { TokenService } from '../ports/token-service.port';
import type { AuthTokens, ClientMeta } from '../dto/auth.dto';

export class AuthSessionService {
  constructor(
    private readonly sessions: RefreshSessionRepository,
    private readonly tokens: TokenService,
    private readonly refreshTtlSeconds: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Creates a new session row (one per login) and returns a fresh token pair. */
  async start(user: User, meta: ClientMeta): Promise<AuthTokens> {
    const sid = randomUUID();
    const now = this.now();
    const refreshToken = this.tokens.signRefresh({ sub: user.id, sid });
    await this.sessions.create({
      id: sid,
      userId: user.id,
      tokenHash: this.tokens.hashToken(refreshToken),
      platform: meta.platform,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.refreshTtlSeconds * 1000),
      revokedAt: null,
    });
    const accessToken = this.tokens.signAccess({ sub: user.id, role: user.role, sid });
    return { accessToken, refreshToken };
  }
}
