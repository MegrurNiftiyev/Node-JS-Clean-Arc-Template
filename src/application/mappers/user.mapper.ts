import type { User } from '@/domain/entities/user.entity';
import type { PublicUser } from '../dto/user.dto';

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt.toISOString(),
  updatedAt: u.updatedAt.toISOString(),
});
