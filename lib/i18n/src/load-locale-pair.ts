import type { Locale, TranslationDictionary } from './types';

// Deduplicate only within one language switch. Do not cache Admin dictionaries:
// revisions and enabled-language changes must retain their existing freshness.
export async function loadLocalePair(
  locale: Locale,
  fallback: Locale,
  load: (locale: Locale) => Promise<TranslationDictionary>,
): Promise<[TranslationDictionary, TranslationDictionary]> {
  const selected = load(locale);
  return Promise.all([selected, locale === fallback ? selected : load(fallback)]);
}
