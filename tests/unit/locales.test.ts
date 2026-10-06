import { describe, it, expect } from 'vitest';
import { ERROR_CODES } from '@/shared/errors';
import { SUPPORTED_LANGUAGES } from '@/shared/i18n/languages';
import { loadLocale } from '@/shared/i18n/translator';

describe('Locales', () => {
  it('every ErrorCode has a non-empty text in all languages', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const locale = loadLocale(lang);
      for (const code of ERROR_CODES) {
        expect(locale.errors[code]).toBeTypeOf('string');
        expect(locale.errors[code].length).toBeGreaterThan(0);
      }
    }
  });

  it('key sets of errors, messages, validation are identical across all languages', () => {
    const en = loadLocale('en');
    const enErrors = Object.keys(en.errors).sort();
    const enMessages = Object.keys(en.messages).sort();
    const enValidation = Object.keys(en.validation).sort();

    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === 'en') continue;
      const loc = loadLocale(lang);
      expect(Object.keys(loc.errors).sort()).toEqual(enErrors);
      expect(Object.keys(loc.messages).sort()).toEqual(enMessages);
      expect(Object.keys(loc.validation).sort()).toEqual(enValidation);
    }
  });
});
