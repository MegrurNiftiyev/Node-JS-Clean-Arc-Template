import type { Env } from '@/config/env';
import type { PasswordHasher } from '@/application/ports/password-hasher.port';
import type { UserRepository } from '@/domain/repositories/user.repository';

/** The ONLY way an admin exists. With DB_DRIVER=memory it runs at every boot. */
export async function seedAdmin(env: Env, users: UserRepository, hasher: PasswordHasher): Promise<void> {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) return;
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  if (await users.findByEmail(email)) return;
  await users.create({
    email,
    passwordHash: await hasher.hash(env.SEED_ADMIN_PASSWORD),
    fullName: 'Administrator',
    role: 'admin',
  });
}
