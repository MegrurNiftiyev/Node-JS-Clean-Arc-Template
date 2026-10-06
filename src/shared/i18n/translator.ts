import az = require('./locales/az.json');
import en = require('./locales/en.json');
import ru = require('./locales/ru.json');
import tr = require('./locales/tr.json');
import de = require('./locales/de.json');
import es = require('./locales/es.json');
import type { ErrorCode } from '../errors/error-codes';
import type { Language } from './languages';

/** `en.json` is the reference shape. Every other locale must satisfy it (compile-time check). */
export type LocaleDictionary = typeof en;
export type MessageKey = keyof LocaleDictionary['messages'];
export type ValidationKey = keyof LocaleDictionary['validation'];

// Compile-time guarantee: every ErrorCode has a text in the reference locale.
const _errorCoverage: Record<ErrorCode, string> = en.errors;
void _errorCoverage;

const dictionaries: Record<Language, LocaleDictionary> = { az, en, ru, tr, de, es };

export const loadLocale = (lang: Language) => dictionaries[lang];

export const translateError = (lang: Language, code: ErrorCode): string => dictionaries[lang].errors[code];
export const translateMessage = (lang: Language, key: MessageKey): string => dictionaries[lang].messages[key];
export const translateValidation = (lang: Language, key: ValidationKey): string =>
  dictionaries[lang].validation[key];

export const isValidationKey = (value: string): value is ValidationKey =>
  Object.prototype.hasOwnProperty.call(en.validation, value);
