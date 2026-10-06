import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { PasswordHasher } from '../../ports/password-hasher.port';
import type { AuthSessionService } from '../../services/auth-session.service';
import type { AuthResult, LoginInput } from '../../dto/auth.dto';
import { toPublicUser } from '../../mappers/user.mapper';
import type { UseCase } from '../use-case';

export class LoginUseCase implements UseCase<LoginInput, AuthResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: AuthSessionService,
  ) {}

  async execute(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      await this.hasher.compareDummy(input.password); // equalize timing
      throw new AppError('AUTH_INVALID_CREDENTIALS');
    }
    if (!(await this.hasher.compare(input.password, user.passwordHash))) {
      throw new AppError('AUTH_INVALID_CREDENTIALS');
    }
    if (!user.isActive) throw new AppError('AUTH_ACCOUNT_DISABLED'); // checked AFTER the password to avoid account probing
    const tokens = await this.sessions.start(user, input.meta);
    return { user: toPublicUser(user), tokens };
  }
}
