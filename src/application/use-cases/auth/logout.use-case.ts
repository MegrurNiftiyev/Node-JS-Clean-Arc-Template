import { AppError } from '@/shared/errors';
import type { RefreshSessionRepository } from '@/domain/repositories/refresh-session.repository';
import type { TokenService } from '../../ports/token-service.port';
import type { UseCase } from '../use-case';

export class LogoutUseCase implements UseCase<string | undefined, void> {
  constructor(
    private readonly sessions: RefreshSessionRepository,
    private readonly tokens: TokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const claims = this.tokens.verifyRefresh(refreshToken);
      await this.sessions.revoke(claims.sid, this.now());
    } catch (e) {
      if (!(e instanceof AppError)) throw e; // invalid/expired token => nothing to revoke, still a successful logout
    }
  }
}
