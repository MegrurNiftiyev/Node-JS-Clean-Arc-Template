import type { Env } from '@/config/env';
import type { OtpRepository } from '@/domain/repositories/otp.repository';
import type { RefreshSessionRepository } from '@/domain/repositories/refresh-session.repository';
import type { UserRepository } from '@/domain/repositories/user.repository';
import { InMemoryOtpRepository } from './in-memory/in-memory-otp.repository';
import { InMemoryRefreshSessionRepository } from './in-memory/in-memory-refresh-session.repository';
import { InMemoryUserRepository } from './in-memory/in-memory-user.repository';

export interface Persistence {
  users: UserRepository;
  sessions: RefreshSessionRepository;
  otps: OtpRepository;
}

export function createPersistence(env: Env): Persistence {
  switch (env.DB_DRIVER) {
    case 'memory':
      return {
        users: new InMemoryUserRepository(),
        sessions: new InMemoryRefreshSessionRepository(),
        otps: new InMemoryOtpRepository(),
      };
    case 'mongo':
      // TODO(integration): implement Mongo repositories in ./mongo and return them here.
      throw new Error('DB_DRIVER=mongo is not implemented yet (see src/infrastructure/persistence/mongo/README.md)');
    case 'firebase':
      // TODO(integration): implement Firebase repositories in ./firebase and return them here.
      throw new Error(
        'DB_DRIVER=firebase is not implemented yet (see src/infrastructure/persistence/firebase/README.md)',
      );
  }
}
