export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fr', 'ko', 'ru', 'uk'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type TranslationParams = Record<string, string | number>;
export type TranslationGroup =
  | 'common'
  | 'policyAcceptance'
  | 'genericUi'
  | 'header'
  | 'language'
  | 'navigation'
  | 'auth'
  | 'status'
  | 'actions'
  | 'form'
  | 'convert'
  | 'orderStatus'
  | 'account'
  | 'emailNotifications'
  | 'notFound'
  | 'affiliate'
  | 'selectors'
  | 'errors'
  | 'swap'
  | 'home'
  | 'tracking'
  | 'adminShell'
  | 'adminCustomer'
  | 'adminBackground'
  | 'adminCharts'
  | 'adminCore'
  | 'adminOrders'
  | 'adminRevenue'
  | 'adminProviders'
  | 'adminCatalog'
  | 'adminPricing'
  | 'adminStaff';
export type TranslationDictionary = Record<TranslationGroup, Record<string, string>>;

export interface LocaleDefinition {
  code: Locale;
  name: string;
  nativeName: string;
  flag: string;
}

export interface I18nContextValue {
  locale: Locale;
  isLoading: boolean;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string, params?: TranslationParams) => string;
  formatNumber: (value: number | string, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
}