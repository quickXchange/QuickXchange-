import en from './locales/en';
import { SUPPORTED_LOCALES } from './types';
import type { Locale, TranslationDictionary, TranslationParams } from './types';

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'qx-locale';

export const localeDefinitions = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
] as const;

const englishDictionary: TranslationDictionary = en;
const dictionaries: Partial<Record<Locale, TranslationDictionary>> = {
  en: englishDictionary,
};
const loaders: Record<Exclude<Locale, 'en'>, () => Promise<{ default: TranslationDictionary }>> = {
  de: () => import('./locales/de'),
  es: () => import('./locales/es'),
  fr: () => import('./locales/fr'),
  ko: () => import('./locales/ko'),
  ru: () => import('./locales/ru'),
  uk: () => import('./locales/uk'),
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function localeFromLanguageTag(language: string | undefined): Locale | undefined {
  if (!language) return undefined;
  const normalized = language.toLowerCase().split('-')[0];
  return isSupportedLocale(normalized) ? normalized : undefined;
}

export function detectLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(saved)) return saved;
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const language of browserLanguages) {
    const locale = localeFromLanguageTag(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export async function loadDictionary(locale: Locale): Promise<TranslationDictionary> {
  const cached = dictionaries[locale];
  if (cached) return cached;
  const module = await loaders[locale as Exclude<Locale, 'en'>]();
  dictionaries[locale] = module.default;
  return module.default;
}

export function translate(
  dictionary: TranslationDictionary,
  key: string,
  params?: TranslationParams,
): string {
  const [group, ...path] = key.split('.');
  const item = dictionary[group as keyof TranslationDictionary]?.[path.join('.')]
    ?? englishDictionary[group as keyof TranslationDictionary]?.[path.join('.')]
    ?? key;
  if (!params) return item;
  return item.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

export { englishDictionary };