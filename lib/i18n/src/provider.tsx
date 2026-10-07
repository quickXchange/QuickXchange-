import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { formatDisplayAmount } from '@workspace/amount-format';
import { defaultLanguageSettings, detectLocale, englishDictionary, flattenDictionary, isSupportedLocale, loadDictionary, LOCALE_STORAGE_KEY, localeDefinitions, mergeDictionary, sourceTemplate, sourceTranslationKey, translate } from './runtime';
import type { I18nContextValue, LanguageSettings, Locale, TranslationDictionary, TranslationParams } from './types';

const I18nContext = createContext<I18nContextValue | null>(null);
export function I18nProvider({ children, apiBase = '/api' }: PropsWithChildren<{ apiBase?: string }>) {
  const [locale, setActiveLocale] = useState<Locale>(detectLocale);
  const [settings, setSettings] = useState<LanguageSettings>(defaultLanguageSettings);
  const [dictionary, setDictionary] = useState<TranslationDictionary>(englishDictionary);
  const [fallback, setFallback] = useState<TranslationDictionary>(englishDictionary);
  const [ready, setReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const translationHistory = useRef(new Map<string, string>());
  const activeLocale = useRef(locale);
  const settingsRef = useRef(settings);
  const remoteDictionary = useCallback(async (code: Locale) => {
    const response = await fetch(`${apiBase}/languages/dictionaries/${code}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Language dictionary unavailable');
    const result = await response.json() as { translations: Record<string, string> };
    return mergeDictionary(await loadDictionary(code), result.translations);
  }, [apiBase]);
  const applyLocale = useCallback(async (code: Locale, persist: boolean, configuration = settingsRef.current) => {
    if (!configuration.enabledLanguages.includes(code)) code = configuration.fallbackLanguage;
    const current = ++requestId.current;
    setIsLoading(true);
    try {
      const [next, nextFallback] = await Promise.all([
        remoteDictionary(code),
        configuration.fallbackLanguage === code ? remoteDictionary(code) : remoteDictionary(configuration.fallbackLanguage),
      ]);
      if (requestId.current !== current) return;
      for (const loaded of [next, nextFallback]) for (const [key, value] of Object.entries(flattenDictionary(loaded))) {
        translationHistory.current.set(value.trim().replace(/\s+/g, ' '), key);
      }
      setDictionary(next); setFallback(nextFallback); setActiveLocale(code); activeLocale.current = code;
      document.documentElement.lang = code;
      // These seven languages are LTR. No Arabic or RTL is introduced.
      document.documentElement.dir = 'ltr';
      if (persist) try { localStorage.setItem(LOCALE_STORAGE_KEY, code); } catch { /* Session still switches. */ }
      setReady(true); setFailed(false);
    } finally { if (requestId.current === current) setIsLoading(false); }
  }, [remoteDictionary]);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/languages`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Language settings unavailable');
      const next = await response.json() as LanguageSettings;
      if (!next.enabledLanguages.length || !next.enabledLanguages.every(isSupportedLocale)
        || !next.enabledLanguages.includes(next.fallbackLanguage)) throw new Error('Invalid language settings');
      const previousRevision = settingsRef.current.revision;
      settingsRef.current = next; setSettings(next);
      if (!ready || previousRevision !== next.revision || !next.enabledLanguages.includes(activeLocale.current)) {
        await applyLocale(activeLocale.current, true, next);
      }
    } catch { if (!ready) { setFailed(true); setIsLoading(false); } }
  }, [apiBase, applyLocale, ready]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    const storage = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY && isSupportedLocale(event.newValue)) {
        void applyLocale(event.newValue, false).catch(() => setFailed(true));
      }
    };
    window.addEventListener('storage', storage);
    const settingsChanged = () => void refresh();
    const settingsStorage = (event: StorageEvent) => { if (event.key === 'qx-language-settings-revision') void refresh(); };
    window.addEventListener('qx-languages-updated', settingsChanged);
    window.addEventListener('storage', settingsStorage);
    return () => { clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); window.removeEventListener('storage', storage); window.removeEventListener('storage', settingsStorage); window.removeEventListener('qx-languages-updated', settingsChanged); };
  }, [refresh, applyLocale]);
  const t = useCallback((key: string, params?: TranslationParams) => translate(dictionary, key, params, fallback), [dictionary, fallback]);
  const tx = useCallback(<T,>(text: T): T => {
    if (typeof text !== 'string') return text;
    if (/^(?:QuickXchange|QuickChange|Quickex|QuickEx|WhiteBIT|Coinbase|Telegram|Instagram|Facebook|Trustpilot|Google|Apple|GitHub|YouTube|WhatsApp|CoinMarketCap|Medium|Discord|TikTok|LinkedIn|Bitcoin|Ethereum|Solana|Polygon|TRON|BNB Smart Chain|ERC20|TRC20|BEP20|BTC|ETH|USDT|USDC|BNB|TRX|POL|SOL|LTC|DOGE|XRP|DAI)$/.test(text.trim())) return text;
    const key = sourceTranslationKey(text) ?? translationHistory.current.get(text.trim().replace(/\s+/g, ' '));
    if (!key) {
      const match = sourceTemplate(text.trim(), translationHistory.current);
      return match ? t(match.key, match.params) as T : text;
    }
    const leading = text.match(/^\s*/)?.[0] ?? '', trailing = text.match(/\s*$/)?.[0] ?? '';
    return (leading + t(key) + trailing) as T;
  }, [t]);
  const translateHtml = useCallback((html: string) => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement?.closest('script,style,code,pre')) node.textContent = tx(node.textContent ?? '');
    }
    return document.body.innerHTML;
  }, [tx]);
  const value = useMemo<I18nContextValue>(() => ({
    locale, isLoading, settings, availableLocales: localeDefinitions.filter(item => settings.enabledLanguages.includes(item.code)),
    setLocale: code => applyLocale(code, true), t, tx, translateHtml,
    formatNumber: (amount, options) => formatDisplayAmount(amount, options, locale),
    formatDate: (date, options) => new Intl.DateTimeFormat(locale, options).format(date instanceof Date ? date : new Date(date)),
  }), [locale, isLoading, settings, applyLocale, t, tx, translateHtml]);
  if (!ready) return <div role={failed ? 'alert' : 'status'} aria-busy={!failed} style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
    {failed ? <button onClick={() => void refresh()}>{translate(dictionary, 'common.retry', undefined, fallback)}</button> : <span aria-label={translate(dictionary, 'common.loading', undefined, fallback)}>…</span>}
  </div>;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider.');
  return context;
}
export function useOptionalI18n() { return useContext(I18nContext); }
// Root error boundaries sit outside the application provider. They still use
// this same catalog/runtime, but must not throw a second missing-context error.
export function useFallbackI18n(): Pick<I18nContextValue, 't' | 'tx'> {
  const context = useOptionalI18n();
  const [locale] = useState(detectLocale);
  const [dictionary, setDictionary] = useState(englishDictionary);
  const [ready, setReady] = useState(locale === 'en');
  useEffect(() => {
    if (context || ready) return;
    let live = true;
    void loadDictionary(locale).then(loaded => { if (live) { setDictionary(loaded); setReady(true); } });
    return () => { live = false; };
  }, [context, locale, ready]);
  const t = useCallback((key: string, params?: TranslationParams) => ready ? translate(dictionary, key, params) : '…', [dictionary, ready]);
  const tx = useCallback(<T,>(text: T): T => {
    if (typeof text !== 'string') return text;
    const key = sourceTranslationKey(text);
    return key ? t(key) as T : text;
  }, [t]);
  return context ?? { t, tx };
}
