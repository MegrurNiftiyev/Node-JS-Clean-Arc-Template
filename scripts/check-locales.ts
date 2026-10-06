import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_CODES } from '../src/shared/errors/error-codes';
import { SUPPORTED_LANGUAGES } from '../src/shared/i18n/languages';

type Dict = Record<string, Record<string, string>>;
const dir = join(__dirname, '..', 'src', 'shared', 'i18n', 'locales');
const load = (lang: string): Dict => JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')) as Dict;

const reference = load('en');
let failed = false;
const fail = (msg: string): void => {
  failed = true;
  console.error(`✖ ${msg}`);
};

// 1. Files on disk must equal SUPPORTED_LANGUAGES
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
if (files.join() !== [...SUPPORTED_LANGUAGES].sort().join()) fail(`Locale files [${files.join(',')}] != SUPPORTED_LANGUAGES [${SUPPORTED_LANGUAGES.join(',')}]`);

// 2. en.errors must equal ERROR_CODES
const enCodes = Object.keys(reference['errors'] ?? {}).sort();
if (enCodes.join() !== [...ERROR_CODES].sort().join()) fail('en.errors keys differ from ERROR_CODES');

// 3. Every locale: same sections, same keys, non-empty strings
for (const lang of SUPPORTED_LANGUAGES) {
  const dict = load(lang);
  for (const section of Object.keys(reference)) {
    const expected = Object.keys(reference[section] ?? {}).sort();
    const actual = Object.keys(dict[section] ?? {}).sort();
    const missing = expected.filter((k) => !actual.includes(k));
    const extra = actual.filter((k) => !expected.includes(k));
    if (missing.length) fail(`${lang}.${section} missing: ${missing.join(', ')}`);
    if (extra.length) fail(`${lang}.${section} unexpected: ${extra.join(', ')}`);
    for (const [k, v] of Object.entries(dict[section] ?? {})) if (typeof v !== 'string' || v.trim() === '') fail(`${lang}.${section}.${k} is empty`);
  }
}

if (failed) process.exit(1);
console.log(`✔ ${SUPPORTED_LANGUAGES.length} locale files are consistent (${ERROR_CODES.length} error codes).`);
