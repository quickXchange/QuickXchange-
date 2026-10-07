import clerkSource from './clerk-source';
import type { Locale, TranslationParams } from './types';
// Clerk receives translations from the same effective dictionary as the rest of the UI,
// including Admin overrides, rather than a separately selected localization resource.
export function buildClerkLocalization(t: (key: string, params?: TranslationParams) => string, locale: Locale) {
  const locales: Record<Locale, string> = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', ru: 'ru-RU', es: 'es-ES', ko: 'ko-KR', uk: 'uk-UA' };
  const resource: Record<string, any> = { locale: locales[locale] };
  for (const key of Object.keys(clerkSource)) {
    const parts = key.split('.');
    let target = resource;
    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
    target[parts.at(-1)!] = t(`clerk.${key}`);
  }
  return resource;
}
