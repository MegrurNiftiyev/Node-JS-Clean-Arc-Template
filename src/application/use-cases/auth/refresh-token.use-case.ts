import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { RefreshSessionRepository } from '@/domain/repositories/refresh-session.repository';
import type { TokenService } from '../../ports/token-service.port';
import type { AuthTokens } from '../../dto/auth.dto';
import type { UseCase } from '../use-case';

export class RefreshTokenUseCase implements UseCase<string, AuthTokens> {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: RefreshSessionRepository,
    private readonly tokens: TokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(refreshToken: string): Promise<AuthTokens> {
    const claims = this.tokens.verifyRefresh(refreshToken); // AUTH_REFRESH_TOKEN_INVALID
    const now = this.now();
    const session = await this.sessions.findById(claims.sid);
    if (!session || session.userId !== claims.sub || session.expiresAt <= now) {
      throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    }
    if (session.revokedAt !== null) {
      throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    }
    if (session.tokenHash !== this.tokens.hashToken(refreshToken)) {
      await this.sessions.revokeAllForUser(session.userId, now);
      throw new AppError('AUTH_REFRESH_TOKEN_REUSED');
    }
    const user = await this.users.findById(claims.sub);
    if (!user) throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    if (!user.isActive) throw new AppError('AUTH_ACCOUNT_DISABLED');

    const newRefresh = this.tokens.signRefresh({ sub: user.id, sid: session.id });
    await this.sessions.updateTokenHash(session.id, this.tokens.hashToken(newRefresh));
    return {
      accessToken: this.tokens.signAccess({ sub: user.id, role: user.role, sid: session.id }),
      refreshToken: newRefresh,
    };
  }
}
