import type { Language } from '@/shared/i18n/languages';
import type { Platform } from '@/domain/enums/platform';
import type { Role } from '@/domain/enums/role';

declare global {
  namespace Express {
    interface Request {
      ctx?: { platform: Platform; language: Language; region?: string };
      auth?: { userId: string; role: Role; sessionId: string };
      validated?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}
export {};
