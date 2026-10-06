import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { PublicUser } from '../../dto/user.dto';
import { toPublicUser } from '../../mappers/user.mapper';
import type { UseCase } from '../use-case';

export class GetMeUseCase implements UseCase<string, PublicUser> {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError('USER_NOT_FOUND');
    return toPublicUser(user);
  }
}
