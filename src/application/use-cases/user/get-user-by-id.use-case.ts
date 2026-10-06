import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { Requester } from '../../dto/auth.dto';
import type { PublicUser } from '../../dto/user.dto';
import { toPublicUser } from '../../mappers/user.mapper';
import type { UseCase } from '../use-case';

export interface GetUserByIdInput {
  requester: Requester;
  targetId: string;
}

export class GetUserByIdUseCase implements UseCase<GetUserByIdInput, PublicUser> {
  constructor(private readonly users: UserRepository) {}

  async execute({ requester, targetId }: GetUserByIdInput): Promise<PublicUser> {
    // Admin may read any user; a regular user only themselves. Checked BEFORE lookup (no existence leak).
    if (requester.role !== 'admin' && requester.id !== targetId) throw new AppError('AUTH_FORBIDDEN');
    const user = await this.users.findById(targetId);
    if (!user) throw new AppError('USER_NOT_FOUND');
    return toPublicUser(user);
  }
}
