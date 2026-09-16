import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  detectLocale,
  englishDictionary,
  loadDictionary,
  translate,
} from './runtime';
import type {
  I18nContextValue,
  Locale,
  TranslationDictionary,
  TranslationParams,
} from './types';

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setActiveLocale] = useState<Locale>(detectLocale);
  const [dictionary, setDictionary] = useState<TranslationDictionary>(englishDictionary);
  const [isLoading, setIsLoading] = useState(() => detectLocale() !== DEFAULT_LOCALE);
  const requestId = useRef(0);

  const applyLocale = useCallback(async (nextLocale: Locale, persist: boolean) => {
    const currentRequest = ++requestId.current;
    setIsLoading(nextLocale !== DEFAULT_LOCALE);
    try {
      const nextDictionary = await loadDictionary(nextLocale);
      if (currentRequest !== requestId.current) return;
      setDictionary(nextDictionary);
      setActiveLocale(nextLocale);
      document.documentElement.lang = nextLocale;
      if (persist) {
        try {
          window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
        } catch {
          // The selection still applies for this session when storage is unavailable.
        }
      }
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (locale !== DEFAULT_LOCALE) {
      void applyLocale(locale, false).catch((error: unknown) => {
        console.error(`Unable to load the "${locale}" translation dictionary.`, error);
        void applyLocale(DEFAULT_LOCALE, false);
      });
    }
  }, []); // Locale detection is intentionally performed once.

  const setLocale = useCallback(
    (nextLocale: Locale) => applyLocale(nextLocale, true),
    [applyLocale],
  );
  const t = useCallback(
    (key: string, params?: TranslationParams) => translate(dictionary, key, params),
    [dictionary],
  );
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    [locale],
  );
  const formatDate = useCallback(
    (value: Date | number | string, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options).format(
        value instanceof Date ? value : new Date(value),
      ),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, isLoading, setLocale, t, formatNumber, formatDate }),
    [locale, isLoading, setLocale, t, formatNumber, formatDate],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider.');
  return context;
}

export function useOptionalI18n(): I18nContextValue | null {
  return useContext(I18nContext);
}