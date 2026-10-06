import type { Role } from '../enums/role';

export interface User {
  readonly id: string; // uuid v4
  email: string; // lower-case, unique, max 254
  passwordHash: string; // never leaves the backend
  fullName: string; // 2..100 chars
  role: Role;
  isActive: boolean;
  readonly createdAt: Date;
  updatedAt: Date;
}

export type NewUser = Pick<User, 'email' | 'passwordHash' | 'fullName' | 'role'>;
