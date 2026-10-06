import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { PasswordHasher } from '../../ports/password-hasher.port';
import type { AuthSessionService } from '../../services/auth-session.service';
import type { AuthResult, RegisterInput } from '../../dto/auth.dto';
import { toPublicUser } from '../../mappers/user.mapper';
import type { UseCase } from '../use-case';

export class RegisterUseCase implements UseCase<RegisterInput, AuthResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: AuthSessionService,
  ) {}

  async execute(input: RegisterInput): Promise<AuthResult> {
    if (await this.users.findByEmail(input.email)) throw new AppError('USER_EMAIL_ALREADY_EXISTS');
    const user = await this.users.create({
      email: input.email, // already lower-cased by the zod schema
      passwordHash: await this.hasher.hash(input.password),
      fullName: input.fullName,
      role: 'user', // ALWAYS 'user'. Admins are never created through the API.
    });
    const tokens = await this.sessions.start(user, input.meta);
    return { user: toPublicUser(user), tokens };
  }
}
