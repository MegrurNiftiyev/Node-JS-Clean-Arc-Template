import type { RequestHandler, Request } from 'express';
import { AppError } from '@/shared/errors';
import { HEADERS } from '@/config/constants';
import { PLATFORMS, type Platform } from '@/domain/enums/platform';
import { isLanguage } from '@/shared/i18n/languages';

export const clientContext: RequestHandler = (req, _res, next) => {
  const platformRaw = req.header(HEADERS.platform)?.toLowerCase();
  const platform = platformRaw || 'web';
  if (!(PLATFORMS as readonly string[]).includes(platform)) throw new AppError('HEADER_PLATFORM_INVALID');

  const languageRaw = req.header(HEADERS.language)?.toLowerCase();
  const language = languageRaw || 'en';
  if (!isLanguage(language)) throw new AppError('HEADER_LANGUAGE_INVALID');

  const regionRaw = req.header(HEADERS.region);
  if (regionRaw !== undefined && !/^[A-Za-z]{2}$/.test(regionRaw)) throw new AppError('HEADER_REGION_INVALID');

  req.ctx = { platform: platform as Platform, language, ...(regionRaw ? { region: regionRaw.toUpperCase() } : {}) };
  next();
};

/** Safe accessor for handlers mounted after clientContext. */
export function ctxOf(req: Request): NonNullable<Request['ctx']> {
  if (!req.ctx) throw new AppError('INTERNAL_SERVER_ERROR'); // programming error: clientContext not mounted
  return req.ctx;
}
