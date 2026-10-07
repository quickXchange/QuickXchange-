import en from './locales/en';
import { customerTranslations } from './customer';
import { loadCompletedTranslations } from './completed';
import clerkSource from './clerk-source';
import { SUPPORTED_LOCALES, type Locale, type LanguageSettings, type TranslationDictionary, type TranslationParams } from './types';
export { SUPPORTED_LOCALES };
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
export const defaultLanguageSettings: LanguageSettings = {
  enabledLanguages: [...SUPPORTED_LOCALES], fallbackLanguage: 'en', revision: '0',
};
export const englishDictionary: TranslationDictionary = { ...en, customer: customerTranslations.en, clerk: clerkSource };
const loaders = {
  de: () => import('./locales/de'), es: () => import('./locales/es'),
  fr: () => import('./locales/fr'), ko: () => import('./locales/ko'),
  ru: () => import('./locales/ru'), uk: () => import('./locales/uk'),
};
const dictionaries: Partial<Record<Locale, TranslationDictionary>> = { en: englishDictionary };
export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
export function normalizeLanguage(value?: string | null): Locale | undefined {
  const normalized = value?.toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(normalized) ? normalized : undefined;
}
export function detectLocale(): Locale {
  const browser = (globalThis as unknown as { window?: { localStorage: { getItem(key: string): string | null }; Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } }; navigator: { languages: readonly string[]; language: string } } }).window;
  if (!browser) return DEFAULT_LOCALE;
  try {
    const saved = browser.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(saved)) return saved;
  } catch { /* Restricted storage does not prevent session language switching. */ }
  const telegram = normalizeLanguage(browser.Telegram?.WebApp?.initDataUnsafe?.user?.language_code);
  if (telegram) return telegram;
  for (const language of browser.navigator.languages?.length ? browser.navigator.languages : [browser.navigator.language]) {
    const locale = normalizeLanguage(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
export async function loadDictionary(locale: Locale): Promise<TranslationDictionary> {
  if (dictionaries[locale]) return dictionaries[locale]!;
  const loaded = await loaders[locale as Exclude<Locale, 'en'>]();
  return dictionaries[locale] = mergeDictionary({ ...loaded.default, customer: customerTranslations[locale] }, await loadCompletedTranslations(locale as Exclude<Locale, 'en'>));
}
export function flattenDictionary(dictionary: TranslationDictionary): Record<string, string> {
  return Object.fromEntries(Object.entries(dictionary).flatMap(([group, values]) =>
    Object.entries(values).map(([key, value]) => [`${group}.${key}`, value])));
}
export function mergeDictionary(dictionary: TranslationDictionary, overrides: Record<string, string>): TranslationDictionary {
  const result = structuredClone(dictionary);
  for (const [key, value] of Object.entries(overrides)) {
    const dot = key.indexOf('.');
    if (dot < 1 || !value.trim()) continue;
    const group = key.slice(0, dot), leaf = key.slice(dot + 1);
    if (group === '__proto__' || group === 'constructor' || group === 'prototype') continue;
    (result[group] ??= {})[leaf] = value;
  }
  return result;
}
export function translate(dictionary: TranslationDictionary, key: string, params?: TranslationParams, fallback: TranslationDictionary = englishDictionary): string {
  const dot = key.indexOf('.');
  const group = key.slice(0, dot), leaf = key.slice(dot + 1);
  const item = dictionary[group]?.[leaf]?.trim() || fallback[group]?.[leaf]?.trim()
    || englishDictionary[group]?.[leaf]?.trim() || dictionary.common?.error || fallback.common?.error || 'Something went wrong';
  return item.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (placeholder, name: string) =>
    params?.[name] === undefined ? placeholder : String(params[name]));
}
export function sourceTranslationKey(text: string): string | undefined {
  if (text.startsWith('customer.') && Object.hasOwn(englishDictionary.customer ?? {}, text.slice(9))) return text;
  const normalized = text.trim().replace(/\s+/g, ' ');
  return sourceKeys.get(normalized) ?? foldedSourceKeys.get(normalized.toLocaleLowerCase('en'));
}
// Canonical English defaults used as catalog/navigation metadata, never as a
// locale-dependent identity. Customer renderers translate them through tx/t.
export function sourceText(key: string): string {
  return translate(englishDictionary, key);
}
export function sourceTemplate(text: string, history?: Map<string, string>): { key: string; params: TranslationParams } | undefined {
  let additional: typeof sourceTemplates = [];
  if (history) {
    let cached = historyTemplateCache.get(history);
    if (!cached || cached.size !== history.size) {
      cached = { size: history.size, templates: compileSourceTemplates([...history].map(([value, key]) => [key, value])) };
      historyTemplateCache.set(history, cached);
    }
    additional = cached.templates;
  }
  for (const item of [...sourceTemplates, ...additional]) {
    const match = item.pattern.exec(text);
    if (match) return { key: item.key, params: Object.fromEntries(item.names.map((name, index) => [name, match[index + 1] ?? ''])) };
  }
  return undefined;
}
const sourceKeys = new Map(Object.entries(flattenDictionary(englishDictionary)).map(([key, value]) => [value.trim().replace(/\s+/g, ' '), key]));
const foldedSourceKeys = new Map([...sourceKeys].map(([text, key]) => [text.toLocaleLowerCase('en'), key]));
function compileSourceTemplates(entries: Array<[string, string]>) {
  return entries.flatMap(([key, value]) => {
  const tokens = [...value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)];
  if (!tokens.length || value.replace(/\{\{[^}]+\}\}/g, '').length < 10) return [];
  let pattern = '', cursor = 0;
  for (const token of tokens) {
    pattern += value.slice(cursor, token.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(.+?)';
    cursor = token.index! + token[0].length;
  }
  pattern += value.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [{ key, pattern: new RegExp('^' + pattern + '$'), names: tokens.map(token => token[1]!) }];
  });
}
const sourceTemplates = compileSourceTemplates(Object.entries(flattenDictionary(englishDictionary)));
const historyTemplateCache = new WeakMap<Map<string, string>, { size: number; templates: typeof sourceTemplates }>();
