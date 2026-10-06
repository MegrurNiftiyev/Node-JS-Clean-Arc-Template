import { AppError } from '@/shared/errors';
import type { UserRepository } from '@/domain/repositories/user.repository';
import type { Requester } from '../../dto/auth.dto';
import type { PublicUser } from '../../dto/user.dto';
import { toPublicUser } from '../../mappers/user.mapper';
import type { UseCase } from '../use-case';

export interface ListUsersInput {
  requester: Requester;
  page: number;
  limit: number;
}

export interface ListUsersResult {
  items: PublicUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ListUsersUseCase implements UseCase<ListUsersInput, ListUsersResult> {
  constructor(private readonly users: UserRepository) {}

  async execute({ requester, page, limit }: ListUsersInput): Promise<ListUsersResult> {
    // Defense in depth: the route also has authorize('admin').
    if (requester.role !== 'admin') throw new AppError('AUTH_FORBIDDEN');
    const { items, total } = await this.users.list({ page, limit });
    return {
      items: items.map(toPublicUser),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
