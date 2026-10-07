export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fr', 'ko', 'ru', 'uk'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
export type TranslationParams = Record<string, string | number>;
export type TranslationGroup = string;
export type TranslationDictionary = Record<string, Record<string, string>>;
export interface LocaleDefinition { code: Locale; name: string; nativeName: string; flag: string }
export interface LanguageSettings { enabledLanguages: Locale[]; fallbackLanguage: Locale; revision: string }
export interface I18nContextValue {
  locale: Locale;
  isLoading: boolean;
  availableLocales: readonly LocaleDefinition[];
  settings: LanguageSettings;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string, params?: TranslationParams) => string;
  tx: <T>(text: T) => T;
  translateHtml: (html: string) => string;
  formatNumber: (value: number | string, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
}
