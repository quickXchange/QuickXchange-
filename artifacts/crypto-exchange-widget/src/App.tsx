import { lazy, memo, Suspense, useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowDownUp, ArrowRight, BadgeCheck, Banknote, Check, ChevronDown, ChevronLeft,
  CircleAlert, Clock3, Copy, Download, FileText, Filter, Globe2,
  LayoutDashboard, Loader2, Mail, Menu, MoreHorizontal, Archive, ArchiveRestore,
  RefreshCw, Save, Search, ShieldCheck, TrendingUp, UserRound, Users,
  X, Zap, Settings, Key, Activity, Network, LogOut, Moon, Sun, Bell,
  CreditCard, HandCoins, Landmark, ShoppingBag, Smartphone, WalletCards, Image as ImageIcon, Newspaper
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  getGetAdminSummaryQueryKey, getGetCustomersQueryKey, getGetExchangeConfigQueryKey,
  getGetExchangeRoutePricingQueryKey,
  getGetOrdersQueryKey, getGetOrdersXmlQueryKey, getGetOrderReconciliationAttemptsQueryKey, getGetPublicOrderStatusQueryKey, getGetQuickexOrderStatusQueryKey, getHealthCheckQueryKey, getGetQuickexCredentialsQueryKey, getGetQuickexConfigQueryKey,
  useCreateOrder, useCreateExchangeQuote, useGetAdminSummary, useGetCustomers,
  useGetExchangeRoutePricing,
  useGetExchangeConfig, useGetQuickexConfig, useGetOrders, useGetPublicOrderStatus, useGetQuickexOrderStatus, getOrdersXml, useHealthCheck, useUpdateOrder, useMarkOrderPaid,
  useGetQuickexCredentials, useTestQuickexCredentials, useUpdateQuickexCredentials,
  useGetOperators, getGetOperatorsQueryKey,
  useCreateOperatorInvitation,
  useApproveOperator,
  useSuspendOperator,
  useRemoveOperator,
  useGetOperatorAuditLogs, getGetOperatorAuditLogsQueryKey,
  useGetCustomerOrders, getGetCustomerOrdersQueryKey,
  useGetCustomerOrder, getGetCustomerOrderQueryKey,
  useClaimCustomerOrder,
  useUpdateCustomerOrderNotifications,
  useReconcileOrder, useGetOrderReconciliationAttempts,
  useGetFiatCurrencies, getGetFiatCurrenciesQueryKey,
  useCreateFiatCurrency,
  useUpdateFiatCurrency, useDeleteFiatCurrency,
  useGetPaymentMethods, getGetPaymentMethodsQueryKey,
  useCreatePaymentMethod, useUpdatePaymentMethod, useDeletePaymentMethod, useRequestPaymentMethodLogoUpload,
  useGetFiatCurrencyPaymentMethods, getGetFiatCurrencyPaymentMethodsQueryKey,
  useCreateFiatCurrencyPaymentMethod, useUpdateFiatCurrencyPaymentMethod, useDeleteFiatCurrencyPaymentMethod,
  usePreviewBulkFiatCurrencyPaymentMethods, useApplyBulkFiatCurrencyPaymentMethods,
  useGetOneForgeProviderStatus, getGetOneForgeProviderStatusQueryKey,
  useListManualDeskPricingRules, getListManualDeskPricingRulesQueryKey,
  useCreateManualDeskPricingRule, useUpdateManualDeskPricingRule,
  usePreviewManualDeskPricingRule, usePreviewManualDeskQuote, useDeleteManualDeskPricingRule,
  useGetManualDeskRevenue, getGetManualDeskRevenueQueryKey,
  exportManualDeskRevenueCsv,
  useGetCryptoAssets, getGetCryptoAssetsQueryKey, useCreateCryptoAsset, useUpdateCryptoAsset, useDeleteCryptoAsset,
  useGetCryptoNetworks, getGetCryptoNetworksQueryKey, useCreateCryptoNetwork, useUpdateCryptoNetwork, useDeleteCryptoNetwork,
  useGetOrder, getGetOrderQueryKey, useAssignOrder, useArchiveOrder, useRestoreOrder,
  useGetOrderAuditLog, getGetOrderAuditLogQueryKey,
  useBulkUpdateOrderStatus, useBulkArchiveOrders,
  useCaptureAffiliateReferral, getCaptureAffiliateReferralQueryKey,
  bindAffiliateReferrer, consumeAffiliateAttribution, getGetAffiliateDashboardQueryKey,
  useGetAffiliateCommissions, getGetAffiliateCommissionsQueryKey,
  useGetAffiliateReferrals, getGetAffiliateReferralsQueryKey,
  useGetAffiliatePayoutHistory, getGetAffiliatePayoutHistoryQueryKey,
  useRequestAffiliatePayout,
  useGetAffiliateSettings, getGetAffiliateSettingsQueryKey,
  useCreateAffiliateSettingsVersion,
  useGetAffiliatePayoutQueue, getGetAffiliatePayoutQueueQueryKey,
  useTransitionAffiliatePayout,
  useGetAffiliateOverview, getGetAffiliateOverviewQueryKey,
  useGetAffiliateAccounts, getGetAffiliateAccountsQueryKey,
  useGetAffiliateAccount, getGetAffiliateAccountQueryKey,
  useSearchAffiliateCommissions, getSearchAffiliateCommissionsQueryKey,
  useGetAffiliateValuationReviews, getGetAffiliateValuationReviewsQueryKey,
  useGetAffiliateValuationReview, getGetAffiliateValuationReviewQueryKey,
  useReviewAffiliateValuation,
  useGetPublishedSiteContent, getGetPublishedSiteContentQueryKey
} from '@workspace/api-client-react';
import type { Asset, Customer, Order, PublicOrderStatus, ApiError, QuickexRateMode, CustomerOrder, FiatCurrency, OneForgeProviderStatus, ManualDeskPricingRule, ManualDeskPricingRuleInput, SettlementOption, PaymentMethod, PaymentMethodFieldDefinition, CryptoAsset, CryptoNetwork, OrderBulkMutationResponse, OrderBulkStatusInputManualSettlementState, FiatCurrencyPaymentMethodBulkPreview, FiatCurrencyPaymentMethodBulkApplyResult, AffiliateAccount, AffiliateSettings, AffiliatePayout, AffiliateOverview, AffiliateAccountPage, AffiliateCommission, AffiliateAccountDetail, AffiliateValuationReview, AffiliateReferral, AffiliateDashboard, SitePageKey, PermissionKey } from '@workspace/api-client-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { PUBLIC_PAGE_REGISTRY } from '@/lib/public-page-registry';
import { ExchangeModeSwitcher, FiatCurrencyFlag, PaymentMethodLogo } from '@/components/exchange-surface';
import { ExchangeInformationCard } from '@/components/exchange-information-card';
import { PublicShell } from '@/components/public-shell';
import { SideDrawer } from '@/components/side-drawer';
import { AdminHeader } from '@/components/admin-header';
export { PublicShell } from '@/components/public-shell';
import {
  apiErrorData, basePath, cn, ErrorState, InlineNotice, LoadingBlock, neutralText,
  number, PaymentDetailsCard, publicApiErrorText, shortId, StatusPill, SUPPORT_TELEGRAM,
} from '@/components/shared-app-ui';
export {
  FiatCurrencyFlag, isFiatCurrencyCode, PaymentMethodCopy, PaymentMethodLogo, sameSettlementOptionId,
  SettlementOptionCombobox,
} from '@/components/exchange-surface';
export {
  apiErrorData, basePath, cn, ErrorState, InlineNotice, LoadingBlock, neutralText,
  number, publicApiErrorText, shortId, StatusPill,
} from '@/components/shared-app-ui';
import { CryptoIdentity, CryptoIdentityProvider, CryptoLogo, cryptoLogoFallbackUrls } from '@/components/crypto-identity';
import type { OfficialCryptoBySymbol } from '@/components/crypto-identity';
import { OrderSettlementIdentity } from '@/components/order-settlement-identity';
import { LiveLandingBackground } from '@/components/landing-background';
import { PopularExchangePairs } from '@/components/popular-exchange-pairs';
import { TelegramBotPromo } from '@/components/telegram-bot-promo';
import { BrandLogo } from '@/components/brand-logo';
import { LanguageSelector } from '@/components/language-selector';
import { I18nProvider, useI18n } from '@/i18n';
import { setAppTheme, useAppTheme } from '@/theme';
import { trackEvent } from '@/lib/analytics';
import { SitePreviewProvider, useSitePreview } from '@/components/site-preview-context';
import { FaviconUpdater } from '@/components/favicon-updater';
import { AdminPermissionsProvider, useAdminPermissions } from '@/lib/admin-permissions';

const AccountPage = lazy(() => import('./pages/account').then(module => ({ default: module.AccountPage })));
const AccountOrdersPage = lazy(() => import('./pages/account').then(module => ({ default: module.AccountOrdersPage })));
const AccountSettingsPage = lazy(() => import('./pages/account').then(module => ({ default: module.AccountSettingsPage })));
const AccountDepositsPage = lazy(() => import('./pages/account-deposits').then(module => ({ default: module.AccountDepositsPage })));
const AccountOrderDetailPage = lazy(() => import('./pages/account').then(module => ({ default: module.AccountOrderDetailPage })));
const CustomerSignInPage = lazy(() => import('./pages/account').then(module => ({ default: module.CustomerSignInPage })));
const CustomerSignUpPage = lazy(() => import('./pages/account').then(module => ({ default: module.CustomerSignUpPage })));
const TelegramConnectPage = lazy(() => import('./pages/telegram-connect').then(module => ({ default: module.TelegramConnectPage })));
const AffiliateDashboardPage = lazy(() => import('./pages/affiliate').then(module => ({ default: module.AffiliateDashboardPage })));
const AdminAffiliatesOverviewPage = lazy(() => import('./pages/affiliate').then(module => ({ default: module.AdminAffiliatesOverviewPage })));
const AdminAffiliateDetailPage = lazy(() => import('./pages/affiliate').then(module => ({ default: module.AdminAffiliateDetailPage })));
const AdminAffiliatePayoutsPage = lazy(() => import('./pages/affiliate').then(module => ({ default: module.AdminAffiliatePayoutsPage })));
const AdminAffiliateSettingsPage = lazy(() => import('./pages/affiliate').then(module => ({ default: module.AdminAffiliateSettingsPage })));
const AdminOverview = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminOverview })));
const AdminOrders = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminOrders })));
const AdminRevenue = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminRevenue })));
const AdminCustomers = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminCustomers })));
const AdminCustomerProfile = lazy(() => import('./pages/admin-customer-profile').then(module => ({ default: module.AdminCustomerProfile })));
const AdminAppearancePage = lazy(() => import('./pages/admin-appearance').then(module => ({ default: module.AdminAppearancePage })));
const AdminLandingBackgroundStudio = lazy(() => import('./pages/admin-landing-background').then(module => ({ default: module.AdminLandingBackgroundStudio })));
const AdminSiteContentPage = lazy(() => import('./pages/site-content').then(module => ({ default: module.AdminSiteContentPage })));
const PublicSitePage = lazy(() => import('./pages/site-content').then(module => ({ default: module.PublicSitePage })));
const AdminProviders = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminProviders })));
const AdminIntegrations = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminIntegrations })));
const AdminCurrencies = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminCurrencies })));
const AdminManualPricing = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminManualPricing })));
const AdminBlogPage = lazy(() => import('./pages/admin-blog').then(module => ({ default: module.AdminBlogPage })));
const AdminBlogEditorPage = lazy(() => import('./pages/admin-blog-editor').then(module => ({ default: module.AdminBlogEditorPage })));
const AdminBlogAutomationPage = lazy(() => import('./pages/admin-blog-automation').then(module => ({ default: module.AdminBlogAutomationPage })));
const AdminNewsletterPage = lazy(() => import('./pages/admin-newsletter').then(module => ({ default: module.AdminNewsletterPage })));
const OrderConfirmationPage = lazy(() => import('./pages/order-confirmation').then(module => ({ default: module.OrderConfirmationPage })));
const AdminTeamPage = lazy(() => import('./pages/admin-team').then(module => ({ default: module.AdminTeamPage })));

const BlogPage = lazy(() => import('./pages/blog').then(module => ({ default: module.BlogPage })));
const BlogDetailPage = lazy(() => import('./pages/blog-detail').then(module => ({ default: module.BlogDetailPage })));
const HowItWorksPage = lazy(() => import('./pages/how-it-works').then(module => ({ default: module.HowItWorksPage })));
const AboutPage = lazy(() => import('./pages/public-info-pages').then(module => ({ default: module.AboutPage })));
const AffiliatesPage = lazy(() => import('./pages/public-info-pages').then(module => ({ default: module.AffiliatesPage })));
const ContactUsPage = lazy(() => import('./pages/public-info-pages').then(module => ({ default: module.ContactUsPage })));
const PrivacyPolicyPage = lazy(() => import('./pages/public-info-pages').then(module => ({ default: module.PrivacyPolicyPage })));
const TermsConditionsPage = lazy(() => import('./pages/public-info-pages').then(module => ({ default: module.TermsConditionsPage })));
const AmlKycPage = lazy(() => import('./pages/public-info-pages').then(module => ({ default: module.AmlKycPage })));
const MarketRatesPage = lazy(() => import('./pages/market-rates').then(module => ({ default: module.MarketRatesPage })));
const CryptoPairsPage = lazy(() => import('./pages/crypto-pairs').then(module => ({ default: module.CryptoPairsPage })));
const FaqPage = lazy(() => import('./pages/faq').then(module => ({ default: module.FaqPage })));
const LiveMarketSection = lazy(() => import('./components/live-market-section').then(module => ({ default: module.LiveMarketSection })));

const customPublicContentPages: Record<string, React.ComponentType> = {
  'how-it-works': HowItWorksPage,
  'about-us': AboutPage,
  'affiliate-program': AffiliatesPage,
  'contact-us': ContactUsPage,
  'privacy-policy': PrivacyPolicyPage,
  'terms-conditions': TermsConditionsPage,
  'aml-kyc': AmlKycPage,
  'market-rates': MarketRatesPage,
  'crypto-pairs': CryptoPairsPage,
  'faq': FaqPage,
  'blog': BlogPage,
};

export const queryClient = new QueryClient();
queryClient.setQueryDefaults(getGetQuickexConfigQueryKey(), {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: false,
});
queryClient.setQueryDefaults(getGetExchangeConfigQueryKey(), {
  staleTime: 30 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = (isDark: boolean, branding?: any) => {
  const getSource = (path: string | undefined | null, fallback: string) => {
    if (!path) return fallback;
    return path.startsWith('/objects/') ? `/api/storage${path}` : path;
  };

  const defaultLight = `/brand/quickxchange-header-light.png`;
  const defaultDark = `/brand/quickxchange-header-dark.png`;
  const activeSrc = isDark ? getSource(branding?.darkLogoPath, defaultDark) : getSource(branding?.lightLogoPath, defaultLight);

  return {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}${activeSrc}`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: 'hsl(var(--primary))',
    colorForeground: 'hsl(var(--foreground))',
    colorMutedForeground: 'hsl(var(--muted-foreground))',
    colorDanger: 'hsl(var(--destructive))',
    colorBackground: 'hsl(var(--card))',
    colorInput: 'hsl(var(--input))',
    colorInputForeground: 'hsl(var(--foreground))',
    colorNeutral: 'hsl(var(--border))',
    fontFamily: "var(--font-sans)",
    borderRadius: '6px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card border-border rounded-xl w-[440px] max-w-full overflow-hidden shadow-md border',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: '!text-foreground !font-extrabold !font-marketing !text-2xl tracking-tight',
    headerSubtitle: '!text-muted-foreground !font-medium',
    socialButtonsBlockButtonText: '!text-foreground !font-bold',
    formFieldLabel: '!text-foreground !font-bold !uppercase !tracking-wide !text-[12px]',
    footerActionLink: '!text-primary !font-bold',
    footerActionText: '!text-muted-foreground',
    dividerText: '!text-muted-foreground !font-bold !uppercase',
    identityPreviewEditButton: '!text-primary !font-bold',
    formFieldSuccessText: '!text-[hsl(var(--success))]',
    alertText: '!text-destructive',
    logoBox: '!h-12 !mb-2',
    logoImage: '!h-11 !w-auto !object-contain',
    socialButtonsBlockButton: '!border-border !bg-input hover:!bg-muted !shadow-xs !h-12 !rounded-md',
    formButtonPrimary: '!bg-primary !text-primary-foreground hover:!bg-primary/90 !font-bold !shadow-sm !h-12 !rounded-md !uppercase !tracking-wide',
    formFieldInput: 'border-border !bg-input !text-foreground focus:border-primary focus:ring-1 focus:ring-primary shadow-xs !h-[52px] !rounded-md !font-medium',
    footerAction: '!bg-transparent',
    dividerLine: '!bg-border',
    alert: '!border-destructive/20 !bg-destructive/10',
    otpCodeFieldInput: '!border-border !bg-input !text-foreground !h-[52px] !rounded-md focus:!border-primary focus:!ring-1 focus:!ring-primary',
    formFieldRow: '!text-foreground',
    main: '!gap-6',
  }
  };
};

export const money = (value?: number, currency = 'USD') => {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
};
export const ago = (date?: string) => {
  if (!date) return '—';
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
export const formatExactUsd = (value?: string | null) => {
  if (!value) return '—';
  const absValue = value.replace(/^-/, '');
  const [int, frac = '00'] = absValue.split('.');
  const groupedInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const paddedFrac = frac.padEnd(2, '0').slice(0, 2);
  const isNegative = value.startsWith('-');
  return `${isNegative ? '-' : ''}$${groupedInt}.${paddedFrac}`;
};

export const isGreaterThanExact = (a: string, b: string): boolean => {
  const sanitize = (v: string) => v.replace(/[^0-9.]/g, '');
  const partsA = sanitize(a).split('.');
  const partsB = sanitize(b).split('.');
  const intA = partsA[0] || '0';
  const intB = partsB[0] || '0';
  const maxLen = Math.max(intA.length, intB.length);
  const paddedIntA = intA.padStart(maxLen, '0');
  const paddedIntB = intB.padStart(maxLen, '0');
  if (paddedIntA !== paddedIntB) return paddedIntA > paddedIntB;
  const fracA = partsA[1] || '0';
  const fracB = partsB[1] || '0';
  const maxFracLen = Math.max(fracA.length, fracB.length);
  const paddedFracA = fracA.padEnd(maxFracLen, '0');
  const paddedFracB = fracB.padEnd(maxFracLen, '0');
  return paddedFracA > paddedFracB;
};

export const exactDateTime = (date?: string) => date
  ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(date))
  : '—';
export const providerLabel = (provider?: string) =>
  provider === 'Quickex' ? 'Convert' : provider === 'Manual desk' ? 'Swap' : provider || '—';
export const guestCustomerLabel = (order: Pick<Order, 'customerName' | 'customerEmail'>) =>
  order.customerName && order.customerName.toLowerCase() !== 'guest'
    ? order.customerName
    : order.customerEmail;

export const apiErrorText = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return neutralText(data.error);
    }
  }
  if (error instanceof Error && error.message) {
    return neutralText(error.message.replace(/^HTTP \d+ [^:]+:\s*/, ''));
  }
  return fallback;
};
const apiErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
};
function settlementFieldDisplayLabel(field: any, t: (key: any) => string) {
  const normalizedKey = String(field.key || '').replace(/^(source|target)_/, '');
  return ({
    name: t('public.accountHolderName'),
    iban: t('public.ibanNumber'),
    tag: 'TAG',
    payment_description: t('public.paymentDescription'),
    telegram_or_whatsapp: t('public.telegramOrWhatsapp'),
  } as Record<string, string>)[normalizedKey] || field.label;
}

function DynamicField({ field, value, onChange }: { field: any; value: string; onChange: (val: string) => void }) {
  const { t } = useI18n();
  const normalizedKey = String(field.key || '').replace(/^(source|target)_/, '');
  const displayLabel = settlementFieldDisplayLabel(field, t);
  const renderType = normalizedKey === 'payment_description' ? 'text' : field.type;
  const commonProps = {
    required: field.required || Boolean(field.requiredWhen),
    placeholder: displayLabel,
    value: value || '',
    onChange: (e: any) => onChange(e.target.value),
    "data-testid": `input-detail-${field.key}`,
    maxLength: field.max,
    minLength: field.min,
    pattern: field.pattern,
  };

  let input;
  switch (renderType) {
    case 'select':
      input = <select className="w-full" {...commonProps}>
        <option value="" disabled>{t('selectors.select')}...</option>
        {field.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>;
      break;
    case 'textarea':
    case 'long-text':
    case 'postal-address':
      input = <textarea className="w-full" {...commonProps} rows={3} />;
      break;
    case 'number':
    case 'integer':
    case 'numeric':
    case 'decimal':
      input = <input type="number" className="w-full" {...commonProps} step={field.type === 'integer' ? "1" : "any"} />;
      break;
    case 'date':
      input = <input type="date" className="w-full" {...commonProps} />;
      break;
    case 'email':
      input = <input type="email" className="w-full" {...commonProps} />;
      break;
    case 'phone':
      input = <input type="tel" className="w-full" {...commonProps} />;
      break;
    case 'private-image':
      input = <input type="file" className="w-full" disabled placeholder={t('selectors.secureUploadUnavailable')} data-testid={`input-detail-${field.key}`} />;
      break;
    case 'account-iban':
    case 'wallet-address':
    case 'memo-tag':
    case 'short-text':
    case 'text':
    default:
      input = <input type="text" className="w-full" {...commonProps} />;
  }

  return <label className="block swap-customer-field">
    <span className="field-label">
      {field.emphasizedLabel ? <strong>{displayLabel}</strong> : displayLabel}
      {field.required || field.requiredWhen
        ? <span className="required-field-mark" aria-hidden="true"> *</span>
        : <small>({t('swap.optional')})</small>}
    </span>
    {input}
    {field.type === 'private-image' && <p className="field-hint text-[10px] text-muted-foreground mt-1">{t('selectors.secureUploadUnavailable')}</p>}
    {field.help && field.type !== 'private-image' && <p className="field-hint">{field.help}</p>}
  </label>;
}

function CopyBox({ label, text, testId, actionable = true, large = false }: { label?: string, text: string, testId?: string, actionable?: boolean, large?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!actionable) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      {label && <span className="text-sm font-medium text-foreground">{label}</span>}
      <div className={cn("copy-field", large && "copy-field-large")}>
        <code>{text}</code>
        <button type="button" onClick={copy} disabled={!actionable} aria-label={label ? `Copy ${label}` : 'Copy'} data-testid={testId || 'button-copy'}>
          {copied ? <Check size={large ? 16 : 14} className="text-success" /> : <Copy size={large ? 16 : 14} />}
        </button>
      </div>
    </div>
  );
}

function SummaryDetailRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const copyValue = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="swap-summary-detail-row">
      <span className="swap-summary-detail-label">{label}</span>
      <span className="swap-summary-detail-value">
        <span>{value}</span>
        <button type="button" onClick={copyValue} aria-label={`Copy ${label}`} data-testid={testId}>
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        </button>
      </span>
    </div>
  );
}

function AssetMark({ code, large = false, logoUrl }: { code: string; large?: boolean; logoUrl?: string | null }) {
  return <CryptoLogo symbol={code} logoUrl={logoUrl} size={large ? 'lg' : 'sm'} className={cn('asset-mark', large && 'asset-mark-large')} />;
}


function ThemeToggle({ testIdPrefix = '' }: { testIdPrefix?: string } = {}) {
  const isDark = useAppTheme();
  const { t } = useI18n();
  const testId = (mode: 'light' | 'dark') => `button-${testIdPrefix ? `${testIdPrefix}-` : ''}theme-${mode}`;

  const toggleTheme = (nextIsDark: boolean) => {
    setAppTheme(nextIsDark);
  };

  return (
    <div className="theme-toggle-group" role="group" aria-label={t('header.appearance')}>
      <button
        type="button"
        className={cn("theme-toggle-btn", !isDark && "active")}
        onClick={() => toggleTheme(false)}
        aria-pressed={!isDark}
        data-testid={testId('light')}
      >
        <Sun size={14} /> <span>{t('adminShell.light')}</span>
      </button>
      <button
        type="button"
        className={cn("theme-toggle-btn", isDark && "active")}
        onClick={() => toggleTheme(true)}
        aria-pressed={isDark}
        data-testid={testId('dark')}
      >
        <Moon size={14} /> <span>{t('adminShell.dark')}</span>
      </button>
    </div>
  );
}

const compactUsdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fractionalUsdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const formatMarketPrice = (price: number) =>
  (price < 1 ? fractionalUsdFormatter : compactUsdFormatter).format(price);

type PaymentTickerMethod = { name: string; logoUrl?: string | null };

const PaymentTickerSequence = memo(function PaymentTickerSequence({
  methods,
  duplicate = false,
}: {
  methods: PaymentTickerMethod[];
  duplicate?: boolean;
}) {
  return (
    <div className="payment-ticker-sequence" aria-hidden={duplicate || undefined}>
      {methods.map((method) => (
        <div
          key={`${duplicate ? 'duplicate-' : ''}${method.name}`}
          className="payment-ticker-item"
          data-payment-method={method.name}
        >
          <PaymentMethodLogo
            name={method.name}
            logoUrl={method.logoUrl}
            className="payment-ticker-logo"
            priority={false}
          />
          <span className="font-bold">{method.name}</span>
        </div>
      ))}
    </div>
  );
});

function LandingSections({ getMode }: { getMode: () => 'swap' | 'convert' }) {
  const { t } = useI18n();
  const marketAssets = useMemo(() => [
    'BTC', 'ETH', 'USDT', 'SOL', 'BNB', 'XRP', 'ADA',
    'DOGE', 'LTC', 'AVAX', 'LINK', 'XLM', 'BCH',
  ] as const, []);
  const [marketQuotes, setMarketQuotes] = useState<Record<string, { price: number; change24h: number }>>({});
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState(false);
  const tickerTrackRef = useRef<HTMLDivElement>(null);
  const tickerBannerRef = useRef<HTMLDivElement>(null);
  const tickerDragRef = useRef({ active: false, startX: 0, startTime: 0, sequenceWidth: 0, duration: 0 });
  const marketSectionRef = useRef<HTMLDivElement>(null);
  const [marketEnabled, setMarketEnabled] = useState(false);

  useEffect(() => {
    const section = marketSectionRef.current;
    if (!section) return;

    const enable = () => setMarketEnabled(true);
    if (typeof IntersectionObserver === 'undefined') {
      const timer = setTimeout(enable, 800);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      enable();
      observer.disconnect();
    }, { rootMargin: '320px 0px' });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!marketEnabled) return;
    let active = true;
    let controller: AbortController | null = null;

    const refreshMarket = async () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;

      try {
        const catalogResponse = await fetch('https://api.exchange.coinbase.com/products', {
          headers: { Accept: 'application/json' },
          signal: requestController.signal,
        });
        if (!catalogResponse.ok) throw new Error('Coinbase product catalog unavailable');
        const catalog = await catalogResponse.json() as Array<{ id?: string; status?: string }>;
        const supportedProducts = new Set(catalog
          .filter(product => product.status !== 'offline' && typeof product.id === 'string')
          .map(product => product.id));

        const results = await Promise.allSettled(marketAssets.map(async (symbol) => {
          const productId = `${symbol}-USD`;
          if (!supportedProducts.has(productId)) return { symbol, quote: null };

          const response = await fetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/stats`, {
            headers: { Accept: 'application/json' },
            signal: requestController.signal,
          });
          if (!response.ok) throw new Error(`Coinbase price unavailable for ${symbol}`);

          const payload = await response.json() as { open?: string; last?: string };
          const open = Number(payload.open);
          const price = Number(payload.last);
          if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(price) || price <= 0) {
            throw new Error(`Invalid Coinbase price for ${symbol}`);
          }

          return {
            symbol,
            quote: {
              price,
              change24h: ((price - open) / open) * 100,
            },
          };
        }));

        if (!active || controller !== requestController) return;

        const successfulQuotes = results.flatMap(result =>
          result.status === 'fulfilled' && result.value.quote ? [result.value] : []);
        if (successfulQuotes.length) {
          setMarketQuotes(current => ({
            ...current,
            ...Object.fromEntries(successfulQuotes.map(({ symbol, quote }) => [symbol, quote])),
          }));
        }
        setMarketError(results.some(result => result.status === 'rejected'));
        setMarketLoading(false);
      } catch (error) {
        if (!active || controller !== requestController || requestController.signal.aborted) return;
        setMarketError(true);
        setMarketLoading(false);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshMarket();
    };

    void refreshMarket();
    const refreshTimer = window.setInterval(refreshWhenVisible, 5 * 60_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [marketAssets, marketEnabled]);

  const getTickerAnimation = () => tickerTrackRef.current?.getAnimations()[0];

  const handleTickerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    const sequence = tickerTrackRef.current?.querySelector<HTMLElement>('.ticker-sequence');
    const animation = getTickerAnimation();
    const duration = Number(animation?.effect?.getTiming().duration);
    const sequenceWidth = sequence?.getBoundingClientRect().width ?? 0;
    if (!animation || typeof animation.currentTime !== 'number' || !Number.isFinite(duration) || !sequenceWidth) return;
    tickerDragRef.current = {
      active: true,
      startX: event.clientX,
      startTime: animation.currentTime,
      sequenceWidth,
      duration,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    animation.pause();
  };

  const handleTickerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tickerDragRef.current.active) return;
    const animation = getTickerAnimation();
    if (!animation) return;
    const { duration, sequenceWidth } = tickerDragRef.current;
    const dragTime = tickerDragRef.current.startTime
      - ((event.clientX - tickerDragRef.current.startX) / sequenceWidth) * duration;
    animation.currentTime = ((dragTime % duration) + duration) % duration;
  };

  const handleTickerPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tickerDragRef.current.active) return;
    tickerDragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const animation = getTickerAnimation();
    if (tickerBannerRef.current?.dataset.motionActive === 'true') animation?.play();
    else animation?.pause();
  };

  const paymentConfig = useGetExchangeConfig({
    query: {
      queryKey: getGetExchangeConfigQueryKey(),
      retry: false,
      staleTime: 5 * 60_000,
    },
  });
  const paymentMethods = useMemo(() => {
    const enabled = (paymentConfig.data?.manualSettlementOptions ?? [])
      .filter(option => option.kind === 'fiat-payment-method' && option.lifecycle === 'active')
      .map(option => ({
        name: option.title.replace(/\s+[A-Z]{3}$/u, ''),
        logoUrl: option.logoUrl,
      }));
    const featured = ['SEPA', 'Visa', 'Mastercard', 'Revolut', 'Paysera', 'N26', 'BBVA', 'Wise'];
    const byName = new Map(enabled.map(method => [method.name.toLocaleLowerCase(), method]));

    return [
      ...featured.map(name => byName.get(name.toLocaleLowerCase()) ?? { name, logoUrl: undefined }),
      ...enabled.filter(method => !featured.some(name => name.toLocaleLowerCase() === method.name.toLocaleLowerCase())),
    ].filter((method, index, methods) =>
      methods.findIndex(candidate => candidate.name.toLocaleLowerCase() === method.name.toLocaleLowerCase()) === index);
  }, [paymentConfig.data?.manualSettlementOptions]);

  const paymentTickerTrackRef = useRef<HTMLDivElement>(null);
  const paymentTickerViewportRef = useRef<HTMLDivElement>(null);
  const paymentTickerDragRef = useRef({ active: false, startX: 0, startTime: 0, sequenceWidth: 0, duration: 0 });

  useEffect(() => {
    const targets = [tickerBannerRef.current, paymentTickerViewportRef.current].filter(
      (target): target is HTMLDivElement => target !== null,
    );
    if (!targets.length) return;
    const intersections = new Map<HTMLElement, boolean>();
    const applyMotionState = () => {
      const pageVisible = document.visibilityState === 'visible';
      targets.forEach(target => {
        target.dataset.motionActive = String(pageVisible && Boolean(intersections.get(target)));
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach(target => intersections.set(target, true));
      applyMotionState();
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => intersections.set(entry.target as HTMLElement, entry.isIntersecting));
      applyMotionState();
    }, { rootMargin: '96px 0px' });
    targets.forEach(target => observer.observe(target));
    document.addEventListener('visibilitychange', applyMotionState);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', applyMotionState);
    };
  }, []);

  const getPaymentTickerAnimation = () => paymentTickerTrackRef.current?.getAnimations()[0];

  const handlePaymentTickerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    const sequence = paymentTickerTrackRef.current?.querySelector<HTMLElement>('.payment-ticker-sequence');
    const animation = getPaymentTickerAnimation();
    const duration = Number(animation?.effect?.getTiming().duration);
    const sequenceWidth = sequence?.getBoundingClientRect().width ?? 0;
    if (!animation || typeof animation.currentTime !== 'number' || !Number.isFinite(duration) || !sequenceWidth) return;
    paymentTickerDragRef.current = {
      active: true,
      startX: event.clientX,
      startTime: animation.currentTime,
      sequenceWidth,
      duration,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    animation.pause();
  };

  const handlePaymentTickerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!paymentTickerDragRef.current.active) return;
    const animation = getPaymentTickerAnimation();
    if (!animation) return;
    const { duration, sequenceWidth } = paymentTickerDragRef.current;
    const dragTime = paymentTickerDragRef.current.startTime
      + ((event.clientX - paymentTickerDragRef.current.startX) / sequenceWidth) * duration;
    animation.currentTime = ((dragTime % duration) + duration) % duration;
  };

  const handlePaymentTickerPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!paymentTickerDragRef.current.active) return;
    paymentTickerDragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const animation = getPaymentTickerAnimation();
    if (paymentTickerViewportRef.current?.dataset.motionActive === 'true') animation?.play();
    else animation?.pause();
  };

  const renderMarketSequence = (duplicate = false) => (
    <div className="ticker-sequence" aria-hidden={duplicate || undefined}>
      {marketAssets.map(symbol => {
        const quote = marketQuotes[symbol];
        const changeTone = quote
          ? quote.change24h > 0 ? 'positive' : quote.change24h < 0 ? 'negative' : 'neutral'
          : 'neutral';
        return (
          <div
            className="ticker-item"
            key={`${duplicate ? 'duplicate-' : ''}${symbol}`}
            data-testid={duplicate ? undefined : `market-quote-${symbol.toLowerCase()}`}
          >
            <CryptoLogo
              symbol={symbol}
              logoFallbackUrls={cryptoLogoFallbackUrls(symbol)}
              size="sm"
              className="ticker-crypto-logo"
            />
            <strong>{symbol}</strong>
            {quote ? (
              <>
                <span className="ticker-price">{formatMarketPrice(quote.price)}</span>
                <span className={changeTone}>
                  {quote.change24h > 0 ? '+' : ''}{quote.change24h.toFixed(2)}%
                </span>
              </>
            ) : marketLoading ? (
              <>
                <span className="ticker-price-placeholder" aria-label={t('public.priceLoading', { symbol })} />
                <span className="ticker-change-placeholder" aria-hidden="true" />
              </>
            ) : (
               <span className="ticker-unavailable">{t('common.unavailable')}</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
      <div className="public-landing-page" ref={marketSectionRef}>
      {/* Ticker Banner */}
      <div ref={tickerBannerRef} data-motion-active="false" id="market-rates" className="ticker-banner relative overflow-hidden group" aria-label={t('home.viewRates')}>
        <div className="ticker-glow absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <span className="ticker-context relative z-10 flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
          <Activity size={14} className="text-primary"/>
          <span>{t('home.marketSnapshot')}</span>
          {marketError && <span className="ticker-market-warning" title={t('home.partialData')}>{t('home.partialData')}</span>}
        </span>
        <div
          className="ticker-viewport relative z-10"
          aria-live="polite"
          onPointerDown={handleTickerPointerDown}
          onPointerMove={handleTickerPointerMove}
          onPointerUp={handleTickerPointerEnd}
          onPointerCancel={handleTickerPointerEnd}
        >
          <div className="ticker-track" ref={tickerTrackRef}>
            {renderMarketSequence()}
            {renderMarketSequence(true)}
          </div>
        </div>
        <Link href="/" className="ticker-link relative z-10">{t('home.viewRates')} <ArrowRight size={14} /></Link>
      </div>

      {/* Supported Payment Methods */}
      <section className="payment-methods-section relative">
        <div className="payment-bg-glow" />
        <div className="section-content relative z-10">
          <span className="section-kicker">{t('home.globalReach')}</span>
          <h2>{t('home.paymentRoutes')}</h2>
          <div
            ref={paymentTickerViewportRef}
            data-motion-active="false"
            className="payment-ticker-viewport relative z-10"
            aria-hidden="true"
            onPointerDown={handlePaymentTickerPointerDown}
            onPointerMove={handlePaymentTickerPointerMove}
            onPointerUp={handlePaymentTickerPointerEnd}
            onPointerCancel={handlePaymentTickerPointerEnd}
          >
            <div className="payment-ticker-track" ref={paymentTickerTrackRef}>
              <PaymentTickerSequence methods={paymentMethods} />
              <PaymentTickerSequence methods={paymentMethods} duplicate />
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section id="why-choose-us" className="why-choose-us relative">
        <div className="why-content grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          <div className="why-intro lg:col-span-4 flex flex-col justify-center relative z-10">
            <span className="section-kicker">{t('home.whyChoose')}</span>
            <h2>{t('home.clearGuided')}</h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">{t('home.clarityDescription')}</p>
            <div className="mt-8">
              <a href={`${basePath}/#how-it-works`} className="button button-outline rounded-full h-12 px-8 inline-flex items-center gap-2 hover:bg-primary/10 hover:border-primary/30 transition-colors">
                {t('home.learnMore')} <ArrowRight size={16} />
              </a>
            </div>
          </div>
          <div className="why-grid lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6 relative z-10">
            <div className="feature-card">
              <div className="feature-icon-wrapper"><Zap size={20} className="feature-icon" /></div>
              <h3>{t('home.clearEstimates')}</h3>
              <p>{t('home.clearEstimatesDescription')}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-wrapper"><ShieldCheck size={20} className="feature-icon" /></div>
              <h3>{t('home.signedQuotes')}</h3>
              <p>{t('home.signedQuotesDescription')}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-wrapper"><span className="text-xl font-black leading-none">%</span></div>
              <h3>{t('home.visiblePricing')}</h3>
              <p>{t('home.visiblePricingDescription')}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-wrapper"><Key size={20} className="feature-icon" /></div>
              <h3>{t('home.routeRequirements')}</h3>
              <p>{t('home.routeRequirementsDescription')}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-wrapper"><WalletCards size={20} className="feature-icon" /></div>
              <h3>{t('home.fundingOptions')}</h3>
              <p>{t('home.fundingOptionsDescription')}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-wrapper"><Activity size={20} className="feature-icon" /></div>
              <h3>{t('home.orderTracking')}</h3>
              <p>{t('home.orderTrackingDescription')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works (Compact Preview) */}
      <section id="how-it-works" className="how-it-works-preview relative mx-auto my-24 max-w-5xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-blue-300/50 bg-gradient-to-br from-cyan-50 via-blue-50 to-violet-100/80 p-5 shadow-[0_24px_70px_rgba(59,130,246,0.14)] sm:p-8 md:p-10 dark:border-blue-500/25 dark:from-[#0a1428] dark:via-[#0b1730] dark:to-[#17132d]">
          <div className="pointer-events-none absolute -left-20 top-10 h-52 w-52 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 bottom-0 h-56 w-56 rounded-full bg-purple-500/15 blur-3xl" />

          <div className="relative text-center">
            <span className="section-kicker">HOW IT WORKS</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">How It Works</h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
              See how Swap and Convert work in less than a minute.
            </p>
          </div>

          <Link
            href="/how-it-works"
            onClick={() => trackEvent('landing_action_clicked', { action: 'view_how_it_works' })}
            className="group relative mx-auto mt-7 flex h-13 w-full max-w-3xl items-center justify-center gap-2 rounded-full border border-blue-400/30 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 px-6 text-sm font-extrabold tracking-wide text-white shadow-[0_10px_30px_rgba(37,99,235,0.25)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(37,99,235,0.35)] motion-reduce:transform-none"
          >
            LEARN HOW IT WORKS
            <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none" />
          </Link>

          <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 divide-y divide-blue-300/30 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-blue-400/15">
            {[
              { icon: Zap, title: 'Simple Steps', detail: 'Easy to follow' },
              { icon: ShieldCheck, title: 'Safe & Secure', detail: 'Clear order flow' },
              { icon: Activity, title: 'Less than 1 minute', detail: 'Get started quickly' },
            ].map(({ icon: Icon, title, detail }) => (
              <div key={title} className="flex min-w-0 items-center justify-center gap-3 px-3 py-4 text-left sm:justify-start sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/20 via-blue-500/20 to-purple-500/25 text-blue-600 ring-1 ring-blue-400/20 dark:text-cyan-300">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm font-bold leading-tight text-foreground">{title}</strong>
                  <span className="mt-1 block text-xs leading-tight text-muted-foreground">{detail}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Trust */}
      <section className="our-trust relative overflow-hidden">
        <div className="trust-content grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
          <div className="trust-text">
            <span className="section-kicker">{t('home.ourProcess')}</span>
            <h2>{t('home.builtClearer')}</h2>
            <p className="text-muted-foreground mt-4 leading-relaxed mb-8">{t('home.processDescription')}</p>

            <div className="trust-stats flex flex-col gap-6">
              <div className="stat-row">
                <div className="stat-icon"><Users size={20} className="text-primary" /></div>
                <div className="stat-text"><strong>{t('home.signed')}</strong><span>{t('home.quoteContext')}</span></div>
              </div>
              <div className="stat-row">
                <div className="stat-icon"><RefreshCw size={20} className="text-primary" /></div>
                <div className="stat-text"><strong>{t('home.visible')}</strong><span>{t('home.feesTiming')}</span></div>
              </div>
              <div className="stat-row">
                <div className="stat-icon"><BadgeCheck size={20} className="text-primary" /></div>
                <div className="stat-text"><strong>{t('home.trackable')}</strong><span>{t('home.orderProgress')}</span></div>
              </div>
            </div>
          </div>

          <div className="trust-proof">
            <div className="testimonial-card relative shadow-2xl">
              <div className="testimonial-quote-mark" />
              <p className="quote relative z-10 text-lg md:text-xl font-medium leading-relaxed">{t('home.quote')}</p>
              <div className="author mt-8 pt-6 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="author-avatar w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Users size={20} /></div>
                  <div className="author-info flex flex-col">
                    <strong className="text-foreground">{t('home.howWorks')}</strong>
                    <span className="text-muted-foreground text-sm">{t('home.processingVaries')}</span>
                  </div>
                </div>
                <BadgeCheck size={24} className="text-primary" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section relative mt-24 mb-12">
        <div className="cta-bg-glow absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent pointer-events-none rounded-3xl" />
        <div className="cta-content relative z-10 flex flex-col items-center text-center p-12 md:p-20 rounded-3xl border border-primary/20 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="cta-ring absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 blur-3xl rounded-full pointer-events-none" />
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">{t('home.ready')}</h2>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mb-10">{t('home.readyDescription')}</p>
          <a href={`${basePath}/#exchange-widget`} onClick={() => trackEvent('landing_action_clicked', { action: 'get_started', mode: getMode() })} className="button button-primary rounded-full h-14 px-10 font-bold text-[16px]">
            {t('home.getStarted')} <ArrowRight size={18} />
          </a>
        </div>
      </section>
    </div>
  );
}

function DeferredLandingSections({ getMode }: { getMode: () => 'swap' | 'convert' }) {
  const [visible, setVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) return;
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => setVisible(true), 1200);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '800px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={sentinelRef}>
      {visible ? <LandingSections getMode={getMode} /> : null}
    </div>
  );
}

function ExchangePage() {
  return <ConfiguredExchangePage pageKey="home" />;
}

function ConfiguredExchangePage({ pageKey }: { pageKey: SitePageKey }) {
  const { t } = useI18n();
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });
  const convertSearchParams = new URLSearchParams(window.location.search);
  const hasRequestedMarketAsset = Boolean(convertSearchParams.get('asset'));
  const hasRequestedConvertSelection = Boolean(
    convertSearchParams.get('asset')
    || convertSearchParams.get('source')
    || convertSearchParams.get('dest')
    || convertSearchParams.get('open')
  );

  const publishedContent = preview.active && preview.pageKey === pageKey
    ? preview.content
    : published.data?.pages.find((page) => page.pageKey === pageKey)?.content;
  const exchangeInformationContent = preview.active && preview.pageKey === 'widget-exchange-information'
    ? preview.content
    : published.data?.pages.find((page) => page.pageKey === 'widget-exchange-information')?.content;

  const contentTitle = typeof publishedContent?.headline === 'string' ? publishedContent.headline
    : typeof publishedContent?.title === 'string' ? publishedContent.title : undefined;
  const contentDescription = typeof publishedContent?.description === 'string' ? publishedContent.description
    : typeof publishedContent?.subtitle === 'string' ? publishedContent.subtitle
    : typeof publishedContent?.intro === 'string' ? publishedContent.intro : undefined;
  const managedBody = typeof publishedContent?.body === 'string' ? publishedContent.body
    : typeof publishedContent?.content === 'string' ? publishedContent.content : undefined;
  const managedSections = Array.isArray(publishedContent?.sections)
    ? publishedContent.sections.flatMap((value, index) => {
      if (!value || typeof value !== 'object') return [];
      const section = value as Record<string, unknown>;
      const body = typeof section.body === 'string' ? section.body
        : typeof section.description === 'string' ? section.description
        : typeof section.text === 'string' ? section.text : '';
      if (!body) return [];
      const heading = typeof section.heading === 'string' ? section.heading
        : typeof section.title === 'string' ? section.title : `Section ${index + 1}`;
      return [{ heading, body }];
    })
    : [];
  const heroImage = publishedContent?.heroImage && typeof publishedContent.heroImage === 'object'
    ? publishedContent.heroImage as Record<string, unknown>
    : {};
  const heroImagePath = typeof heroImage.objectPath === 'string' ? heroImage.objectPath : undefined;
  const heroImageUrl = heroImagePath
    ? preview.assetUrls?.[heroImagePath]
      ?? (preview.active
        ? `${basePath}/api/admin/site-page-media/${pageKey}/${heroImagePath.split('/').pop()}/preview`
        : `${basePath}/api/storage/objects/site-page-media/${heroImagePath.split('/').pop()}`)
    : undefined;
  const visibility = publishedContent?.visibility && typeof publishedContent.visibility === 'object'
    ? publishedContent.visibility as Record<string, unknown>
    : {};
  const seo = publishedContent?.seo && typeof publishedContent.seo === 'object'
    ? publishedContent.seo as Record<string, unknown>
    : {};
  const heroTitle = contentTitle || t('home.heroTitle');
  const heroTitleLastSpace = heroTitle.lastIndexOf(' ');
  const heroTitleLead = heroTitleLastSpace >= 0 ? heroTitle.slice(0, heroTitleLastSpace + 1) : '';
  const heroTitleAccent = heroTitleLastSpace >= 0 ? heroTitle.slice(heroTitleLastSpace + 1) : heroTitle;
  const activeModeRef = useRef<'swap' | 'convert'>('swap');
  const setActiveMode = useCallback((mode: 'swap' | 'convert') => {
    activeModeRef.current = mode;
  }, []);
  const getActiveMode = useCallback(() => activeModeRef.current, []);

  useLayoutEffect(() => {
    const title = typeof seo.title === 'string' && seo.title.trim() ? seo.title.trim() : contentTitle;
    const description = typeof seo.description === 'string' && seo.description.trim() ? seo.description.trim() : contentDescription;
    if (title) document.title = `${title} | QuickXchange`;
    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = description;
    }
  }, [contentDescription, contentTitle, seo.description, seo.title]);

  useLayoutEffect(() => {
    if (pageKey !== 'convert' || !hasRequestedConvertSelection) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('exchange-widget')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasRequestedConvertSelection, pageKey]);

  if (visibility.enabled === false) return <NotFound />;

  return (
    <LiveLandingBackground>
      <PublicShell>
        <div className="exchange-wrapper exchange-wrapper-wide" data-exchange-mode="swap">
          <main className="exchange-main public-hero-container">
            <section className="hero-copy exchange-hero-copy">
              <div className="hero-eyebrow"><Zap size={14} className="text-[#007bff] fill-[#007bff]" /> {t('home.heroEyebrow')}</div>
              <h1>{heroTitleLead}<span className="text-gradient">{heroTitleAccent}</span></h1>
              <p className="hero-supporting-line">{contentDescription || t('home.heroDescription')}</p>
              {heroImageUrl && <img src={heroImageUrl} alt={typeof heroImage.altText === 'string' ? heroImage.altText : heroTitle} className="mt-6 max-h-64 w-full rounded-2xl border border-border object-cover shadow-sm" />}

              <div className="hero-capability-grid">
                <span><span className="hero-capability-icon"><Clock3 size={17} /></span><strong>{t('home.swap247')}</strong></span>
                <span><span className="hero-capability-icon"><Zap size={17} /></span><strong>{t('home.rateCheckedQuotes')}</strong></span>
                <span><span className="hero-capability-icon"><HandCoins size={17} /></span><strong>{t('home.thirdPartyPayments')}</strong></span>
                <span><span className="hero-capability-icon"><ShieldCheck size={17} /></span><strong>{t('home.requirementsUpfront')}</strong></span>
              </div>

            </section>

            <section id="exchange-widget" className="exchange-layout exchange-layout-wide widget-container">
              <ExchangeModeSwitcher
                onModeChange={setActiveMode}
                initialMode={pageKey === 'convert' ? 'convert' : 'swap'}
              />
              <ExchangeInformationCard content={exchangeInformationContent} />
            </section>
          </main>

          <section className="desk-notes relative overflow-hidden rounded-3xl p-8 md:p-12 bg-card border border-border shadow-xl max-w-[1440px] mx-auto mb-16 mt-8 w-[calc(100%-2rem)]">
            <div className="desk-notes-glow absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
              <div className="max-w-xl">
                <span className="section-kicker">QUICKXCHANGE</span>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">{t('home.clarity')}</h2>
                <p className="exchange-desk-copy exchange-desk-copy-swap text-muted-foreground text-[15px] md:text-[16px] leading-relaxed">
                  {t('home.manualEstimateDescription')}
                </p>
                <p className="exchange-desk-copy exchange-desk-copy-convert text-muted-foreground text-[15px] md:text-[16px] leading-relaxed">
                  {t('home.automaticEstimateDescription')}
                </p>
              </div>
              <Link href="/status" className="shrink-0 button button-secondary h-12 px-6 rounded-full font-bold shadow-sm inline-flex items-center gap-2 group hover:border-primary/30 transition-all" data-testid="link-track-order">
                {t('home.trackExisting')} <ArrowRight size={16} className="text-primary group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </section>
          {(managedBody || managedSections.length > 0) && (
            <section className="mx-auto mb-16 grid w-[calc(100%-2rem)] max-w-[1440px] gap-6 md:grid-cols-2">
              {managedBody && <article className="rounded-3xl border border-border bg-card p-8 shadow-sm md:col-span-2"><p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{managedBody}</p></article>}
              {managedSections.map((section, index) => <article className="rounded-3xl border border-border bg-card p-8 shadow-sm" key={`${section.heading}-${index}`}><h2 className="mb-4 text-2xl font-bold">{section.heading}</h2><p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{section.body}</p></article>)}
            </section>
          )}
        </div>
        {pageKey === 'home' && <TelegramBotPromo />}
        {pageKey === 'home' && <PopularExchangePairs />}
        {(pageKey === 'home' || (pageKey === 'convert' && hasRequestedMarketAsset)) && (
          <Suspense fallback={null}>
            <LiveMarketSection />
          </Suspense>
        )}
        <DeferredLandingSections getMode={getActiveMode} />
      </PublicShell>
    </LiveLandingBackground>
  );
}


function StatusPage() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const query = new URLSearchParams(window.location.search);
  const initial = query.get('order') || '';
  const initialTrackingToken = query.get('trackingToken') || query.get('token') || '';
  const [search, setSearch] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [trackingToken, setTrackingToken] = useState(initialTrackingToken);
  const queryClient = useQueryClient();
  const markPaidMutation = useMarkOrderPaid();
  const validCapabilityId = /^(?:O[0-9]{9}|QX-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/.test(submitted);
  const isQuickexOrder = submitted.startsWith('QX-');
  const quickexTrackingTokenMissing = validCapabilityId && isQuickexOrder && !trackingToken;
  const trackingParams = trackingToken ? { trackingToken } : undefined;

  const statusQuery = useGetPublicOrderStatus(validCapabilityId ? submitted : '', trackingParams, { query: {
    queryKey: getGetPublicOrderStatusQueryKey(validCapabilityId ? submitted : '', trackingParams),
    enabled: validCapabilityId && !isQuickexOrder,
    refetchOnWindowFocus: 'always',
    refetchIntervalInBackground: true,
    retry: (failureCount: number, error: unknown) => {
      const status = error && typeof error === 'object' && 'status' in error
        ? (error as { status?: number }).status
        : undefined;
      return status !== 404 && failureCount < 2;
    },
    // Keep polling while the order is still moving so the customer sees
    // deposit / exchange / payout progress live.
    refetchInterval: (query: any) => {
      const order = query.state.data;
      if (!order) return 3000;
      return /complete|paid|refund|expire|fail|cancel/i.test(order.status) ? false : 3000;
    },
  } });

  const quickexTrackingParams = { trackingToken };
  const quickexStatusQuery = useGetQuickexOrderStatus(isQuickexOrder ? submitted : '', quickexTrackingParams, { query: {
    queryKey: getGetQuickexOrderStatusQueryKey(isQuickexOrder ? submitted : '', quickexTrackingParams),
    enabled: validCapabilityId && isQuickexOrder && Boolean(trackingToken),
    refetchOnWindowFocus: 'always',
    refetchIntervalInBackground: true,
    refetchInterval: (query: any) => {
      const order = query.state.data;
      if (!order) return 3000;
      return /complete|paid|refund|expire|fail|cancel/i.test(order.status) ? false : 3000;
    },
  } });

  const activeStatusQuery = isQuickexOrder ? quickexStatusQuery : statusQuery;
  const lookupError = activeStatusQuery.error as ({ status?: number; data?: ApiError | null } | null);
  const notFound = lookupError?.status === 404 || lookupError?.data?.code === 'ORDER_NOT_FOUND';
  const lookupErrorMessage = notFound
    ? t('errors.orderNotFound')
    : t('orderStatus.refreshFailed');
  const visibleOrder = activeStatusQuery.data?.id === submitted ? activeStatusQuery.data : undefined;
  const markPaid = () => {
    if (!submitted || isQuickexOrder) return;
    markPaidMutation.mutate({
      id: submitted,
      data: trackingToken ? { trackingToken } : undefined,
    }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getGetPublicOrderStatusQueryKey(submitted, trackingParams),
        });
      },
    });
  };

  return (
    <PublicShell>
      <main className="status-main track-order-page">
        <div className="track-order-container">
          <div className="ambient-glow" />

          <section className="status-hero">
            <div className="eyebrow">ORDER LOOKUP</div>
            <h1>Know where your money is.</h1>
            <p>Enter your QuickXchange Order ID to see the latest status and transaction details.</p>
          </section>

          <div className="lookup-card track-order-lookup-card">
            <div className="lookup-card-inner">
              <h2>Track your order</h2>
              <p>Enter your Order ID below.</p>
              <form className="lookup-form" onSubmit={(event) => {
                event.preventDefault();
                const nextOrderId = search.trim();
                if (!nextOrderId) return;
                const keepTrackingToken = nextOrderId === submitted ? trackingToken : '';
                if (!keepTrackingToken) setTrackingToken('');
                setSubmitted(nextOrderId);
                setLocation(`/status?order=${encodeURIComponent(nextOrderId)}${keepTrackingToken ? `&trackingToken=${encodeURIComponent(keepTrackingToken)}` : ''}`);
              }}>
                <div className="input-icon">
                  <Search size={20} aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Enter Order ID, e.g. QX-..."
                    aria-label="QuickXchange Order ID"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    data-testid="input-order-search"
                  />
                </div>
                <button className="button-gradient" type="submit" disabled={!search.trim()} data-testid="button-search-order">
                  TRACK ORDER <ArrowRight size={18} />
                </button>
              </form>
            </div>
          </div>

          {submitted && !validCapabilityId && (
            <div className="lookup-card track-order-state-card result-empty" data-testid="invalid-order-result">
              <CircleAlert size={24} />
              <strong>Order not found</strong>
              <p>Check your Order ID and try again.</p>
            </div>
          )}

          {quickexTrackingTokenMissing && (
            <div className="lookup-card track-order-state-card result-empty" data-testid="missing-tracking-token-result">
              <CircleAlert size={24} />
              <strong>Tracking link required</strong>
              <p>Open the tracking link from your order confirmation to view this order.</p>
            </div>
          )}

          {activeStatusQuery.isError && validCapabilityId && !visibleOrder && (notFound
            ? <div className="lookup-card track-order-state-card result-empty" data-testid="empty-order-result"><Search size={24} /><strong>Order not found</strong><p>Check your Order ID and try again.</p></div>
            : <div className="lookup-card track-order-state-card"><div className="lookup-card-inner"><ErrorState message={lookupErrorMessage} retry={() => activeStatusQuery.refetch()} /></div></div>)}

          {!visibleOrder && activeStatusQuery.isFetching && validCapabilityId && !quickexTrackingTokenMissing && (
            <div className="lookup-card track-order-state-card"><div className="lookup-card-inner flex justify-center py-12"><Loader2 size={32} className="animate-spin text-primary" /></div></div>
          )}

          {visibleOrder && (
            <OrderStatusCard
              order={visibleOrder}
              refreshWarning={activeStatusQuery.isError}
              onMarkPaid={!isQuickexOrder ? markPaid : undefined}
              markPaidPending={markPaidMutation.isPending}
            />
          )}

          {!submitted && (
            <div className="help-card">
              <div className="help-icon"><FileText size={20} /></div>
              <div className="help-content flex-1">
                <h2>Where can I find my Order ID?</h2>
                <p>You can find it in your QuickXchange order confirmation or inside My Orders when signed in.</p>
                <Show when="signed-in">
                  <Link href="/account/orders" className="view-orders-link">View My Orders <ArrowRight size={14} /></Link>
                </Show>
              </div>
            </div>
          )}
        </div>
      </main>
    </PublicShell>
  );
}

function OrderStatusCard({
  order,
  refreshWarning = false,
  onMarkPaid,
  markPaidPending = false,
}: {
  order: PublicOrderStatus;
  refreshWarning?: boolean;
  onMarkPaid?: () => void;
  markPaidPending?: boolean;
}) {
  const { t } = useI18n();
  const isManual = order.type === 'manual' || Boolean(order.manualSettlementState);
  const mss = (order.manualSettlementState || 'awaiting_funds').toLowerCase();

  const status = order.status.toLowerCase();
  const halted = /refund|expire|fail|cancel/.test(status) || mss === 'cancelled' || mss === 'failed';
  const uncertain = /unknown|held|verification|review/.test(status) || order.outcomeUnknown;
  const completed = /complete|paid/.test(status) || mss === 'completed';
  const depositActionable = Boolean(order.depositAddress) && !halted && !uncertain && !completed;

  const timeline = isManual
    ? [t('orderStatus.awaitingFunds'), t('orderStatus.depositReceived'), t('orderStatus.payoutProcessing'), t('orderStatus.payoutSent'), t('orderStatus.completed')]
    : [t('orderStatus.orderCreated'), t('orderStatus.depositReceived'), t('orderStatus.exchanging'), t('orderStatus.sendingPayout'), t('orderStatus.complete')];

  const current = isManual
    ? (mss === 'completed' ? 4 : mss === 'payout_sent' ? 3 : mss === 'payout_processing' ? 2 : mss === 'funds_confirmed' ? 1 : 0)
    : (/complete/.test(status) ? 4 : /send|withdraw|payout/.test(status) ? 3 : /exchang|process/.test(status) ? 2 : /deposit received|received|confirm/.test(status) ? 1 : 0);

  const haltedMessage = /refund/.test(status) ? t('orderStatus.refunded')
    : /expire/.test(status) ? t('orderStatus.expired')
      : t('orderStatus.stopped');

  return (
    <section className="status-result track-order-result-card" data-testid={`card-order-status-${order.id}`}>
      <div className="p-5 sm:p-6 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">{t('tracking.orderDetails')}</span>
          <h2 className="font-mono text-lg sm:text-xl font-bold tracking-tight text-foreground break-all">{order.id}</h2>
        </div>
        <div className="flex-shrink-0">
          <StatusPill status={order.status} customerFacing />
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="track-order-route bg-background/50 rounded-xl border border-border/50 mb-8" data-testid="track-order-exchange-summary">
          <div className="track-order-route-side is-send" data-testid="track-order-exchange-sent">
            <OrderSettlementIdentity assetCode={order.fromAsset} routeLabel={order.fromNetwork} size="md" compact className="track-order-route-identity" />
            <div className="track-order-route-copy">
              <span className="track-order-route-label text-muted-foreground font-bold uppercase tracking-wider">{t('swap.youSend')}</span>
              <strong className="track-order-route-amount font-mono tracking-tight" title={`${number(order.amount)} ${order.fromAsset}`}>{number(order.amount)}</strong>
              <span className="track-order-route-meta text-muted-foreground" title={`${order.fromAsset} ${order.fromNetwork || ''}`.trim()}>{order.fromAsset} {order.fromNetwork ? `(${order.fromNetwork})` : ''}</span>
            </div>
          </div>

          <div className="track-order-route-arrow bg-muted/50 text-muted-foreground" data-testid="track-order-exchange-arrow">
             <ArrowRight size={16} />
          </div>

          <div className="track-order-route-side is-receive" data-testid="track-order-exchange-receive">
            <OrderSettlementIdentity assetCode={order.toAsset} routeLabel={order.toNetwork} size="md" compact className="track-order-route-identity" />
            <div className="track-order-route-copy">
              <span className="track-order-route-label text-muted-foreground font-bold uppercase tracking-wider">{order.type === 'manual' ? t('tracking.estReceive') : t('swap.youReceive')}</span>
              <strong className="track-order-route-amount track-order-receive-amount font-mono tracking-tight text-primary" title={`${number(order.receiveAmount)} ${order.toAsset}`}>{number(order.receiveAmount)}</strong>
              <span className="track-order-route-meta text-muted-foreground" title={`${order.toAsset} ${order.toNetwork || ''}`.trim()}>{order.toAsset} {order.toNetwork ? `(${order.toNetwork})` : ''}</span>
            </div>
          </div>
        </div>

        {(order.refreshUnavailable || refreshWarning) && (
          <div className="notice notice-warning mb-8" data-testid="notice-refresh-unavailable">
             <RefreshCw size={16} className="mt-0.5 shrink-0" />
             <div>
                <strong>{t('tracking.liveUnavailable')}</strong>
                <p className="mt-1">{t('tracking.liveUnavailableDescription')}</p>
             </div>
          </div>
        )}

        {halted ? (
          <div className="notice notice-error mb-8" data-testid="notice-order-halted">
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <div>
              <strong>{t('tracking.orderStopped')}</strong>
              <p className="mt-1">{haltedMessage}</p>
            </div>
          </div>
        ) : uncertain ? (
          <div className="notice notice-warning mb-8" data-testid="notice-verification">
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <div>
              <strong>{t('tracking.reviewRequired')}</strong>
              <p className="mt-1">{t('orderStatus.review')}</p>
            </div>
          </div>
        ) : (
          <div className="status-timeline track-order-timeline mb-8" data-testid="order-status-timeline">
            <div className="relative mb-2">
              <div className="absolute top-4 left-[10%] right-[10%] h-[2px] bg-border/60 hidden md:block" />
              <div className="absolute top-4 left-[10%] h-[2px] bg-primary transition-all duration-500 hidden md:block" style={{ width: `${(current / (timeline.length - 1)) * 80}%` }} />

              <div className="flex flex-col md:flex-row justify-between gap-5 md:gap-2 relative z-10">
                {timeline.map((item, index) => {
                  const isDone = index <= current;
                  const isCurrent = index === current;
                  return (
                    <div className={cn(
                      'track-order-timeline-step flex items-center md:flex-col gap-4 md:gap-2 text-left md:text-center flex-1',
                      isDone ? 'is-done text-foreground' : 'is-inactive text-muted-foreground',
                      isCurrent && 'is-current',
                    )} key={item}>
                      <div className={cn(
                        "w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all duration-300 ring-4 ring-card",
                        isDone ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground"
                      )}>
                        {isDone && !isCurrent ? <Check size={14} strokeWidth={3} /> : index + 1}
                      </div>
                      <span className={cn("block text-sm md:text-xs font-semibold tracking-tight", isCurrent && "text-primary")}>{item}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {order.paymentDetailsApplicable && (
          <PaymentDetailsCard
            orderId={order.id}
            paymentDetails={order.paymentDetails}
            paymentDetailsApplicable={order.paymentDetailsApplicable}
            sourcePaymentMethod={order.sourcePaymentMethod}
            customerMarkedPaidAt={order.customerMarkedPaidAt}
            actionsDisabled={/cancel|fail|refund|expire|complete/i.test(order.status)}
            onMarkPaid={onMarkPaid}
            markPaidPending={markPaidPending}
            supportHref={SUPPORT_TELEGRAM}
          />
        )}

        {(order.depositAddress || order.depositMemo) && (
          <div className="mb-8">
            <div className="deposit-panel" data-testid="deposit-address">
              <div className="deposit-panel-header">
                <Banknote size={18} className="text-primary" />
                <h3 className="font-semibold text-sm">{depositActionable ? t('tracking.sendFunds') : t('tracking.depositDetails')}</h3>
              </div>
              <div className="deposit-panel-content">
                {order.depositAddress && (
                  <div className="mb-4 last:mb-0">
                    <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                      {depositActionable
                        ? t('tracking.sendExactly', { amount: number(order.amount), asset: order.fromAsset, network: order.fromNetwork || t('tracking.sourceNetwork') })
                        : t('tracking.depositRecorded')}
                    </span>
                    <CopyBox text={order.depositAddress} testId="button-copy-deposit" actionable={depositActionable} large />
                  </div>
                )}
                {order.depositMemo && (
                  <div className="mb-4 last:mb-0 pt-4 border-t border-border/50">
                    <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                      {depositActionable ? t('tracking.depositMemo') : t('tracking.depositMemoRecorded')}
                    </span>
                    <CopyBox text={order.depositMemo} testId="button-copy-deposit-memo" actionable={depositActionable} large />
                  </div>
                )}

                {depositActionable && (Boolean((order.fundingDetails as any)?.warning) || Boolean((order.fundingDetails as any)?.instructions) || Boolean((order.fundingDetails as any)?.requiredConfirmations)) && (
                  <div className="mt-5 space-y-3 p-4 bg-background/80 rounded-lg border border-border/50 text-sm">
                    {Boolean((order.fundingDetails as any)?.warning) && (
                      <div className="flex gap-2 text-warning font-medium"><CircleAlert size={16} className="shrink-0 mt-0.5" /> <p>{(order.fundingDetails as any).warning}</p></div>
                    )}
                    {Boolean((order.fundingDetails as any)?.instructions) && (
                      <p className="text-muted-foreground">{(order.fundingDetails as any).instructions}</p>
                    )}
                    {Boolean((order.fundingDetails as any)?.requiredConfirmations) && (
                      <div className="flex gap-2 text-muted-foreground">
                        <Network size={16} className="shrink-0 mt-0.5 text-primary/70" />
                        <div>
                          <p className="font-medium text-foreground">{t('tracking.confirmations', { count: (order.fundingDetails as any).requiredConfirmations })}</p>
                          {Boolean((order.fundingDetails as any)?.confirmationGuidance) && (
                            <p className="mt-0.5 opacity-80">{(order.fundingDetails as any).confirmationGuidance}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {order.customerSafeNote && (
          <div className="notice notice-info" data-testid="notice-customer-safe">
            <FileText size={18} className="mt-0.5 shrink-0" />
            <div>
              <strong>{t('tracking.operatorNote')}</strong>
              <p className="mt-1">{order.customerSafeNote}</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 sm:p-6 bg-muted/20 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-5 text-xs">
        <div className="grid grid-cols-2 sm:flex sm:flex-row gap-5">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{t('tracking.orderType')}</span>
            <strong className="text-foreground">{order.type}</strong>
          </div>
          {order.rateMode && (
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{t('tracking.rateType')}</span>
              <strong className="text-foreground">{order.rateMode === 'FIXED' ? t('tracking.fixed') : t('tracking.floating')}</strong>
            </div>
          )}
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{t('tracking.created')}</span>
            <strong className="text-foreground">{ago(order.createdAt)}</strong>
          </div>
        </div>

        <div className="flex flex-col min-[420px]:flex-row gap-3">
          <Show when="signed-in">
             <Link href={`/account/orders/${order.id}`} className="button button-secondary h-10 px-4 whitespace-nowrap" data-testid="link-view-full-details">
               View Full Order Details <ArrowRight size={14} />
             </Link>
          </Show>
          <Link href="/" className="button button-primary h-10 px-4 whitespace-nowrap" data-testid="link-start-another">
            {t('tracking.startNew')} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

type AdminNavigationItem = {
  href: string;
  label: string;
  testId: string;
  icon: LucideIcon;
};

const ADMIN_TOP_LEVEL_HEADER_LABELS: Record<string, string> = {
  '/admin': 'OPERATIONS / COMMAND CENTER',
  '/admin/orders': 'OPERATIONS / ORDERS',
  '/admin/revenue': 'FINANCE / REVENUE',
  '/admin/customers': 'CUSTOMER MANAGEMENT',
  '/admin/affiliates': 'AFFILIATE PROGRAM',
  '/admin/payouts': 'FINANCE / PAYOUTS',
  '/admin/affiliate-settings': 'SYSTEM / CONFIGURATION',
  '/admin/providers': 'SYSTEM / PROVIDERS',
  '/admin/appearance': 'DESIGN / APPEARANCE',
  '/admin/landing-background': 'DESIGN / LANDING BACKGROUND',
  '/admin/integrations': 'INTEGRATIONS / API',
  '/admin/currencies': 'ASSETS / PAYMENT METHODS',
  '/admin/pricing': 'PRICING / ENGINE',
  '/admin/team': 'ADMINISTRATION / TEAM',
  '/admin/site-content': 'CONTENT / PUBLIC SITE',
  '/admin/blog': 'CONTENT / BLOG',
  '/admin/newsletter': 'CONTENT / NEWSLETTER',
};

function isAdminNavigationItemActive(href: string, pathname: string) {
  return pathname === href ||
    (href === '/admin/orders' && pathname.startsWith('/admin/orders/')) ||
    (href === '/admin/customers' && pathname.startsWith('/admin/customers/')) ||
    (href === '/admin/affiliates' && pathname.startsWith('/admin/affiliates/'));
}

export function AdminShell({ children, title, eyebrow, action, subtitle, titleIcon, affiliateHeaderMode, requiredPermission }: { children: React.ReactNode; title: string; eyebrow: string; action?: React.ReactNode; subtitle?: string; titleIcon?: React.ReactNode; affiliateHeaderMode?: boolean; requiredPermission?: string | string[] }) {
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { t } = useI18n();

  const { authorization: adminAuth, isLoading: authLoading, error: authError, can } = useAdminPermissions();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const mobileNavButtonRef = useRef<HTMLButtonElement>(null);
  const mobileProfileRef = useRef<HTMLDivElement>(null);
  const mobileProfileButtonRef = useRef<HTMLButtonElement>(null);
  const desktopProfileButtonRef = useRef<HTMLButtonElement>(null);
  const mobileProfileMenuRef = useRef<HTMLDivElement>(null);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  const adminHeaderRef = useRef<HTMLElement>(null);
  const [mobileProfileStyle, setMobileProfileStyle] = useState<CSSProperties>();

  useEffect(() => {
    const updateScrollHint = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      let owner: HTMLElement | null = target;
      while (owner) {
        const hint = owner.previousElementSibling;
        if (hint instanceof HTMLElement && hint.classList.contains('swipeable-scroll-hint')) {
          const hidden = target.scrollLeft > 10;
          hint.style.opacity = hidden ? '0' : '1';
          hint.style.pointerEvents = hidden ? 'none' : 'auto';
          return;
        }
        owner = owner.parentElement;
      }
    };
    document.addEventListener('scroll', updateScrollHint, true);
    return () => document.removeEventListener('scroll', updateScrollHint, true);
  }, []);

  const isDark = useAppTheme();
  const toggleTheme = (nextIsDark: boolean) => {
    setAppTheme(nextIsDark);
  };

  const pathname = location.split('?')[0];
  const navGroups = [
    {
      title: t('adminShell.workspace'),
      items: [
        { href: '/admin', label: t('adminShell.overview'), testId: 'overview', icon: LayoutDashboard, requiredPermission: 'statistics.view' },
      ]
    },
    {
      title: t('adminShell.operations'),
      items: [
        { href: '/admin/orders', label: t('adminShell.orders'), testId: 'orders', icon: ArrowDownUp, requiredPermission: 'orders.view' },
        { href: '/admin/revenue', label: t('adminShell.revenue'), testId: 'revenue', icon: Banknote, requiredPermission: 'statistics.view' },
        { href: '/admin/customers', label: t('adminShell.customers'), testId: 'customers', icon: Users, requiredPermission: 'customers.view' },
      ]
    },
    {
      title: t('adminShell.affiliates'),
      items: [
        { href: '/admin/affiliates', label: t('adminShell.affiliates'), testId: 'affiliates', icon: Network, requiredPermission: 'affiliates.view' },
        { href: '/admin/payouts', label: t('adminShell.payouts'), testId: 'payouts', icon: HandCoins, requiredPermission: 'affiliates.view' },
        { href: '/admin/affiliate-settings', label: t('adminShell.programSettings'), testId: 'affiliate-settings', icon: Settings, requiredPermission: 'affiliates.view' },
      ]
    },
    {
      title: t('adminShell.configuration'),
      items: [
        { href: '/admin/appearance', label: 'Appearance', testId: 'appearance', icon: ImageIcon, requiredPermission: 'site_settings.view' },
        { href: '/admin/providers', label: t('adminShell.providers'), testId: 'providers', icon: Settings, requiredPermission: 'integrations.view' },
        { href: '/admin/landing-background', label: t('adminShell.backgroundStudio'), testId: 'landing-background', icon: ImageIcon, requiredPermission: 'site_settings.view' },
        { href: '/admin/integrations', label: t('adminShell.apiIntegrations'), testId: 'api integrations', icon: Network, requiredPermission: 'integrations.view' },
        { href: '/admin/currencies', label: t('adminShell.currenciesMethods'), testId: 'currency and methods', icon: Landmark, requiredPermission: ['currencies.view', 'payment_methods.view', 'crypto_assets.view', 'crypto_networks.view'] },
        { href: '/admin/pricing', label: t('adminShell.manualPricing'), testId: 'manual pricing', icon: TrendingUp, requiredPermission: 'pricing.view' },
        { href: '/admin/team', label: t('adminShell.staff'), testId: 'team', icon: Key, requiredPermission: ['team.members.view', 'team.roles.view', 'team.activity.view'] },
        { href: '/admin/site-content', label: 'Site content', testId: 'site-content', icon: FileText, requiredPermission: 'site_settings.view' },
        { href: '/admin/blog', label: 'Blog', testId: 'blog', icon: Newspaper, requiredPermission: 'blog.view' },
        { href: '/admin/newsletter', label: 'Newsletter Subscribers', testId: 'newsletter', icon: Mail, requiredPermission: 'site_settings.view' },
      ]
    }
  ];

  const permittedNavGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item =>
     item.requiredPermission && (Array.isArray(item.requiredPermission)
       ? item.requiredPermission.some((permission) => can(permission as PermissionKey))
       : can(item.requiredPermission as PermissionKey))
    )
  })).filter(group => group.items.length > 0);
  const topLevelNavigationItem = permittedNavGroups
    .flatMap((group) => group.items)
    .find((item) => item.href === pathname);
  const headerEyebrow = ADMIN_TOP_LEVEL_HEADER_LABELS[pathname] ?? eyebrow;
  const headerTitle = topLevelNavigationItem?.label ?? title;
  const email = user?.primaryEmailAddress?.emailAddress || 'Signed-in operator';
  const displayName = user?.fullName || user?.firstName || 'Operations';
  const initials = (user?.firstName?.[0] || email[0] || 'O').toUpperCase();

  useEffect(() => {
    setMobileNavOpen(false);
    setMobileProfileOpen(false);
    setMobileActionsOpen(false);
  }, [location]);

  useEffect(() => {
    if (!mobileProfileOpen && !mobileActionsOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (mobileProfileOpen &&
        !mobileProfileRef.current?.contains(target) &&
        !desktopProfileButtonRef.current?.contains(target) &&
        !mobileProfileMenuRef.current?.contains(target)
      ) {
        setMobileProfileOpen(false);
      }
      if (mobileActionsOpen && !mobileActionsRef.current?.contains(target)) {
        setMobileActionsOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileProfileOpen(false);
        setMobileActionsOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileActionsOpen, mobileProfileOpen]);



  useLayoutEffect(() => {
    if (!mobileProfileOpen) {
      setMobileProfileStyle(undefined);
      return;
    }

    const visualViewport = window.visualViewport;
    const updateProfilePosition = () => {
      const mobileTrigger = mobileProfileButtonRef.current;
      const desktopTrigger = desktopProfileButtonRef.current;
      const trigger = (mobileTrigger && mobileTrigger.offsetWidth > 0) ? mobileTrigger : desktopTrigger;
      const header = adminHeaderRef.current;
      if (!trigger || !header) return;

      const viewportLeft = visualViewport?.offsetLeft ?? 0;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportWidth = visualViewport?.width ?? window.innerWidth;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const safeMargin = 12;
      const menuGap = 8;
      const triggerBounds = trigger.getBoundingClientRect();
      const headerBounds = header.getBoundingClientRect();
      const width = Math.min(286, viewportWidth - safeMargin * 2);
      const rightEdgeLeft = viewportLeft + viewportWidth - width - safeMargin;
      const triggerAlignedLeft = triggerBounds.right - width;
      const left = viewportWidth <= 360
        ? rightEdgeLeft
        : Math.min(
          Math.max(triggerAlignedLeft, viewportLeft + safeMargin),
          rightEdgeLeft,
        );
      const top = Math.max(headerBounds.bottom + menuGap, viewportTop + safeMargin);
      const maxHeight = Math.max(0, viewportTop + viewportHeight - top - safeMargin);

      setMobileProfileStyle({
        position: 'fixed',
        top,
        right: 'auto',
        bottom: 'auto',
        left,
        width,
        maxWidth: width,
        maxHeight,
      });
    };

    updateProfilePosition();
    const frame = window.requestAnimationFrame(updateProfilePosition);
    window.addEventListener('resize', updateProfilePosition);
    window.addEventListener('scroll', updateProfilePosition, true);
    visualViewport?.addEventListener('resize', updateProfilePosition);
    visualViewport?.addEventListener('scroll', updateProfilePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateProfilePosition);
      window.removeEventListener('scroll', updateProfilePosition, true);
      visualViewport?.removeEventListener('resize', updateProfilePosition);
      visualViewport?.removeEventListener('scroll', updateProfilePosition);
    };
  }, [mobileProfileOpen]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-background">
        <LoadingBlock />
      </div>
    );
  }

  if (authError || !adminAuth || (requiredPermission && (Array.isArray(requiredPermission)
    ? !requiredPermission.some(p => can(p as any))
    : !can(requiredPermission as any)))) {
    const firstPermitted = permittedNavGroups[0]?.items[0]?.href || '/';
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] p-8 text-center bg-background">
         <ShieldCheck size={64} className="text-muted-foreground mb-6 opacity-30" />
         <h2 className="text-2xl font-bold tracking-tight mb-2">Access Restricted</h2>
         <p className="text-muted-foreground mb-8 max-w-[320px]">You don't have permission to view this section of the operations console.</p>
         <Link href={firstPermitted} className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-bold shadow-sm hover:opacity-90 transition-opacity">
           Return to Dashboard
         </Link>
      </div>
    );
  }

  return <div className="admin-shell admin-redesign noise">
    <aside className="admin-sidebar" aria-label={t('adminShell.operations')}>
      <div className="sidebar-brand">
        <BrandLogo />
      </div>
      <nav className="admin-sidebar-nav">
        {permittedNavGroups.map((group) => (
          <div className="admin-sidebar-group" key={group.title}>
            <div className="admin-sidebar-group-title">{group.title}</div>
            <div className="admin-sidebar-links">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn('sidebar-link', isAdminNavigationItemActive(item.href, pathname) && 'active')}
                    data-testid={`link-admin-sidebar-${item.testId}`}
                  >
                    <span className="sidebar-link-icon"><Icon aria-hidden="true" /></span>
                    <span className="sidebar-link-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
    <div className="admin-content">
      <AdminHeader
        headerRef={adminHeaderRef}
        brand={<BrandLogo />}
        eyebrow={headerEyebrow}
        title={headerTitle}
        titleIcon={titleIcon}
        subtitle={subtitle}
        menu={
          <>
              <button
                ref={mobileNavButtonRef}
                type="button"
                className="admin-header-icon-btn qx-header-icon-btn qx-mobile-menu-btn"
                data-testid="button-admin-mobile-menu"
                aria-label={mobileNavOpen ? t('common.close') : t('adminShell.operations')}
                aria-expanded={mobileNavOpen}
                aria-controls="admin-mobile-navigation"
                onClick={() => {
                  setMobileNavOpen((open) => !open);
                  setMobileProfileOpen(false);
                  setMobileActionsOpen(false);
                }}
              >
                {mobileNavOpen ? <X size={17} /> : <Menu size={17} />}
              </button>
              <SideDrawer
                open={mobileNavOpen}
                onClose={() => setMobileNavOpen(false)}
                triggerRef={mobileNavButtonRef}
                id="admin-mobile-navigation"
                ariaLabel={t('adminShell.operations')}
                closeLabel={t('common.close')}
                layerTestId="admin-menu-drawer-layer"
                drawerTestId="admin-menu-drawer"
                backdropTestId="admin-menu-drawer-backdrop"
                closeTestId="button-close-admin-menu"
              >
                <nav className="frontend-drawer-nav" aria-label={t('adminShell.operations')}>
                  {permittedNavGroups.flatMap((group) => group.items).map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn('qx-menu-row', isAdminNavigationItemActive(item.href, pathname) && 'active')}
                        onClick={() => setMobileNavOpen(false)}
                        data-testid={`link-mobile-admin-${item.testId}`}
                      >
                        <div className="qx-menu-icon"><Icon size={20} /></div>
                        <span className="qx-menu-row-label">{item.label}</span>
                        {item.label === 'Orders' && <span className="nav-count">•</span>}
                      </Link>
                    );
                  })}
                  <Link
                    href="/"
                    className="qx-menu-row"
                    onClick={() => setMobileNavOpen(false)}
                    data-testid="link-back-to-exchange"
                  >
                    <div className="qx-menu-icon"><ArrowRight size={20} /></div>
                    <span className="qx-menu-row-label">{t('adminShell.backExchange')}</span>
                  </Link>
                  <button
                    type="button"
                    className="qx-menu-row side-drawer-logout"
                    onClick={() => {
                      setMobileNavOpen(false);
                      void signOut({ redirectUrl: basePath || '/' });
                    }}
                    data-testid="button-admin-drawer-signout"
                  >
                    <div className="qx-menu-icon"><LogOut size={20} /></div>
                    <span className="qx-menu-row-label">{t('auth.signOut')}</span>
                  </button>
                </nav>
              </SideDrawer>
          </>
        }
        action={action ? (
              <div className={`admin-header-page-action qx-header-page-action ${mobileActionsOpen ? 'is-open' : ''}`} ref={mobileActionsRef}>
                <button
                  type="button"
                  className="admin-header-icon-btn admin-header-page-action-trigger"
                  aria-label="Open page actions"
                  aria-expanded={mobileActionsOpen}
                  onClick={() => {
                    setMobileActionsOpen((open) => !open);
                    setMobileProfileOpen(false);
                    setMobileNavOpen(false);
                  }}
                >
                  <MoreHorizontal size={18} />
                </button>
                <div className="admin-header-page-action-content">{action}</div>
              </div>
        ) : undefined}
        controls={
          <div className="admin-header-controls qx-header-controls">
              <div className="admin-header-language"><LanguageSelector /></div>
              <button
                type="button"
                className="admin-header-icon-btn qx-header-icon-btn qx-mobile-theme-btn"
                aria-label={isDark ? t('adminShell.light') : t('adminShell.dark')}
                aria-pressed={isDark}
                title={isDark ? t('adminShell.light') : t('adminShell.dark')}
                data-testid="button-admin-mobile-theme"
                onClick={() => toggleTheme(!isDark)}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <Link
                href="/admin"
                className="admin-header-icon-btn qx-header-icon-btn"
                aria-label={t('adminShell.notifications')}
                title={t('adminShell.notifications')}
                data-testid="link-admin-notifications"
              >
                <span className="qx-mobile-test-target" data-testid="link-admin-mobile-notifications" aria-hidden="true" />
                <Bell size={16} />
              </Link>
              <div className="admin-header-profile-wrap qx-header-profile-wrap" ref={mobileProfileRef}>
                <button
                  type="button"
                  className="admin-header-profile-btn qx-header-profile-btn"
                  ref={(node) => {
                    desktopProfileButtonRef.current = node;
                    mobileProfileButtonRef.current = node;
                  }}
                  data-testid="button-admin-profile"
                  aria-label={t('adminShell.openProfile')}
                  aria-expanded={mobileProfileOpen}
                  aria-controls="admin-mobile-profile-menu"
                  onClick={() => {
                    setMobileProfileOpen((open) => !open);
                    setMobileNavOpen(false);
                    setMobileActionsOpen(false);
                  }}
                >
                  <span className="qx-mobile-test-target" data-testid="button-admin-mobile-profile" aria-hidden="true" />
                  <div className="admin-header-avatar qx-profile-avatar">{initials}</div>
                  <div className="admin-header-profile-info qx-profile-info">
                    <strong>{displayName}</strong>
                    <small>{email}</small>
                  </div>
                  <ChevronDown size={14} className="admin-header-chevron qx-profile-chevron" aria-hidden="true" />
                </button>
              </div>
            </div>
        }
      >
        {children}
      </AdminHeader>
      {mobileProfileOpen && createPortal(
                <div
                  ref={mobileProfileMenuRef}
                  id="admin-mobile-profile-menu"
                  className="admin-mobile-profile-menu"
                  style={mobileProfileStyle}
                >
                  <div className="admin-mobile-profile-summary">
                    <span>{initials}</span>
                    <div><strong>{displayName}</strong><small>{email}</small></div>
                  </div>
                  <Link href="/account" className="admin-mobile-profile-item" data-testid="link-admin-mobile-account">
                    <UserRound size={15} /> {t('adminShell.account')}
                  </Link>
                  <div className="admin-mobile-profile-theme">
                    <span>{t('header.appearance')}</span>
                    <ThemeToggle testIdPrefix="mobile" />
                  </div>
                  <button type="button" className="admin-mobile-profile-item admin-mobile-profile-signout" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-admin-mobile-signout">
                    <LogOut size={15} /> {t('adminShell.logOut')}
                  </button>
                </div>,
                document.body,
              )}
    </div>
  </div>;
}



const operatorAuthorizationParams = {
  product: 'swap' as const,
  from: '1970-01-01T00:00:00.000Z',
  to: '1970-01-01T00:00:00.000Z',
};

function OperatorAuthorizationGate({ component: Component }: { component: React.ComponentType }) {
  const { signOut } = useClerk();
  const { t } = useI18n();
  const currentQueryClient = useQueryClient();
  const authorizationQueryKey = getGetAdminSummaryQueryKey(operatorAuthorizationParams);
  const authorization = useGetAdminSummary(operatorAuthorizationParams, {
    query: {
      queryKey: authorizationQueryKey,
      retry: false,
      staleTime: 0,
      refetchInterval: 10_000,
    },
  });
  const authorizationStatus = apiErrorStatus(authorization.error);
  const mfaRequired = apiErrorData(authorization.error)?.code === 'ADMIN_MFA_REQUIRED';
  const accessDenied = authorization.isError && authorizationStatus === 403;

  useEffect(() => {
    if (!accessDenied) return;
    currentQueryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== authorizationQueryKey[0],
    });
  }, [accessDenied, authorizationQueryKey, currentQueryClient]);

  if (authorization.isPending) {
    return <main className="operator-access-page" aria-label={t('adminShell.loading')} aria-busy="true">
      <Loader2 className="spin" size={24} />
    </main>;
  }

  if (mfaRequired) {
    return <main className="operator-access-page">
      <BrandLogo />
      <div className="operator-access-card" data-testid="operator-mfa-required">
        <ShieldCheck size={28} />
        <span className="section-kicker">{t('adminShell.securityRequired')}</span>
        <h1>{t('adminShell.setupAuthenticator')}</h1>
        <p>{t('adminShell.setupAuthenticatorDescription')}</p>
        <div className="operator-access-actions">
          <Link href="/account/settings" className="button button-primary">{t('adminShell.openSecuritySettings')}</Link>
          <Link href="/" className="button button-secondary">{t('adminShell.backExchange')}</Link>
        </div>
      </div>
    </main>;
  }

  if (accessDenied) {
    return <main className="operator-access-page">
      <BrandLogo />
      <div className="operator-access-card operator-access-denied" data-testid="operator-access-denied">
        <ShieldCheck size={28} />
        <span className="section-kicker">{t('adminShell.accessDenied')}</span>
        <h1>{t('adminShell.notApproved')}</h1>
        <p>{t('adminShell.accessDescription')}</p>
        <div className="operator-access-actions">
          <Link href="/" className="button button-secondary">{t('adminShell.backExchange')}</Link>
          <button type="button" className="button button-primary" onClick={() => signOut({ redirectUrl: basePath || '/' })}>{t('auth.signOut')}</button>
        </div>
      </div>
    </main>;
  }

  if (authorization.isError) {
    const sessionCouldNotBeVerified = authorizationStatus === 401;
    return <main className="operator-access-page">
      <BrandLogo />
      <div className="operator-access-card" data-testid="operator-access-unavailable">
        <CircleAlert size={28} />
        <span className="section-kicker">{sessionCouldNotBeVerified ? t('adminShell.sessionUnverified') : t('adminShell.deskUnavailable')}</span>
        <h1>{sessionCouldNotBeVerified ? t('adminShell.verifySession') : t('adminShell.checkAccess')}</h1>
        <p>{sessionCouldNotBeVerified
          ? t('adminShell.sessionRetryDescription')
          : t('adminShell.registryUnavailableDescription')}</p>
        <div className="operator-access-actions">
          <button type="button" className="button button-secondary" onClick={() => authorization.refetch()}>
            <RefreshCw size={14} /> {t('common.retry')}
          </button>
          {sessionCouldNotBeVerified
            ? <button type="button" className="button button-primary" onClick={() => signOut({ redirectUrl: basePath || '/' })}>{t('auth.signOut')}</button>
            : <Link href="/" className="button button-primary">{t('adminShell.backExchange')}</Link>}
        </div>
      </div>
    </main>;
  }

  return <AdminPermissionsProvider><Component /></AdminPermissionsProvider>;
}

function AdminGate({ component: Component }: { component: React.ComponentType }) {
  useLayoutEffect(() => {
    void import('./admin-redesign.css');
  }, []);
  return <>
    <Show when="signed-in"><OwnerAuthorizationGate component={Component} /></Show>
    <Show when="signed-out"><Redirect to="/" /></Show>
  </>;
}

function OwnerAuthorizationGate({ component: Component }: { component: React.ComponentType }) {
  const { t } = useI18n();
  const authorization = useGetOperators({
    query: {
      queryKey: getGetOperatorsQueryKey(),
      retry: false,
      staleTime: 0,
      refetchInterval: 10_000,
    },
  });
  const authorizationStatus = apiErrorStatus(authorization.error);
  const mfaRequired = apiErrorData(authorization.error)?.code === 'ADMIN_MFA_REQUIRED';

  if (authorization.isPending) {
    return <main className="operator-access-page" aria-busy="true">
      <Loader2 className="spin" size={24} />
    </main>;
  }

  if (authorization.isError) {
    if (mfaRequired) {
      return <main className="operator-access-page">
        <BrandLogo />
        <div className="operator-access-card" data-testid="operator-mfa-required">
          <ShieldCheck size={28} />
          <span className="section-kicker">{t('adminShell.securityRequired')}</span>
          <h1>{t('adminShell.setupAuthenticator')}</h1>
          <p>{t('adminShell.setupAuthenticatorDescription')}</p>
          <div className="operator-access-actions">
            <Link href="/account/settings" className="button button-primary">{t('adminShell.openSecuritySettings')}</Link>
            <Link href="/" className="button button-secondary">{t('adminShell.backExchange')}</Link>
          </div>
        </div>
      </main>;
    }
    if (authorizationStatus === 401 || authorizationStatus === 403) {
      return <Redirect to="/" />;
    }
    return <main className="operator-access-page">
      <BrandLogo />
      <div className="operator-access-card" data-testid="owner-access-unavailable">
        <CircleAlert size={28} />
        <span className="section-kicker">{t('adminShell.deskUnavailable')}</span>
        <h1>{t('adminShell.checkAccess')}</h1>
        <p>{t('adminShell.registryUnavailableDescription')}</p>
        <div className="operator-access-actions">
          <button type="button" className="button button-secondary" onClick={() => authorization.refetch()}>
            <RefreshCw size={14} /> {t('common.retry')}
          </button>
          <Link href="/" className="button button-primary">{t('adminShell.backExchange')}</Link>
        </div>
      </div>
    </main>;
  }

  return <Component />;
}

function authorizedAdminRoute(Component: React.ComponentType) {
  return function AuthorizedAdminRoute() {
    return <AdminGate component={Component} />;
  };
}

const AdminOverviewRoute = authorizedAdminRoute(AdminOverview);
const AdminOrdersRoute = authorizedAdminRoute(AdminOrders);
const AdminRevenueRoute = authorizedAdminRoute(AdminRevenue);
const AdminCustomersRoute = authorizedAdminRoute(AdminCustomers);
const AdminCustomerProfileRoute = authorizedAdminRoute(AdminCustomerProfile);
const AdminAffiliatesOverviewRoute = authorizedAdminRoute(AdminAffiliatesOverviewPage);
const AdminAffiliateDetailRoute = authorizedAdminRoute(AdminAffiliateDetailPage);
const AdminAffiliatePayoutsRoute = authorizedAdminRoute(AdminAffiliatePayoutsPage);
const AdminAffiliateSettingsRoute = authorizedAdminRoute(AdminAffiliateSettingsPage);
const AdminProvidersRoute = authorizedAdminRoute(AdminProviders);
const AdminIntegrationsRoute = authorizedAdminRoute(AdminIntegrations);
const AdminCurrenciesRoute = authorizedAdminRoute(AdminCurrencies);
const AdminManualPricingRoute = authorizedAdminRoute(AdminManualPricing);
const AdminLandingBackgroundStudioRoute = authorizedAdminRoute(AdminLandingBackgroundStudio);
const AdminAppearanceRoute = authorizedAdminRoute(AdminAppearancePage);
const AdminTeamRoute = authorizedAdminRoute(AdminTeamPage);
const AdminSiteContentRoute = authorizedAdminRoute(AdminSiteContentPage);
const AdminBlogRoute = authorizedAdminRoute(AdminBlogPage);
const AdminBlogEditorRoute = authorizedAdminRoute(AdminBlogEditorPage);
const AdminBlogAutomationRoute = authorizedAdminRoute(AdminBlogAutomationPage);
const AdminNewsletterRoute = authorizedAdminRoute(AdminNewsletterPage);

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const currentQueryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        currentQueryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, currentQueryClient]);

  return null;
}

function AffiliateReferralTracker() {
  const code = new URLSearchParams(window.location.search).get('ref');
  const { isLoaded, isSignedIn, user } = useUser();
  const currentQueryClient = useQueryClient();
  const consumedUserRef = useRef<string | null>(null);
  const [attributionStatus, setAttributionStatus] = useState<'bound' | 'already_bound' | 'no_referral' | 'invalid' | 'unavailable' | null>(null);
  const [attributionError, setAttributionError] = useState<unknown>(null);
  const [isConsuming, setIsConsuming] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const capture = useCaptureAffiliateReferral(code || '', {
    query: {
      enabled: !!code,
      queryKey: getCaptureAffiliateReferralQueryKey(code || ''),
      retry: (failureCount, error) => {
        const status = error && typeof error === 'object' && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : undefined;
        return failureCount < 3 && (!status || status === 401 || status >= 500);
      },
    }
  });

  const consumeCapturedAttribution = useCallback(async () => {
    setIsConsuming(true);
    setAttributionError(null);
    try {
      let status: 'bound' | 'already_bound' | 'no_referral' | 'invalid' | 'unavailable' | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (code && capture.isSuccess) {
            try {
              await bindAffiliateReferrer({ code: code.trim().toUpperCase() });
              status = 'bound';
            } catch (error) {
              const errorCode = apiErrorData(error)?.code;
              if (errorCode === 'REFERRER_IMMUTABLE') status = 'already_bound';
              else if (errorCode === 'REFERRAL_INVALID') status = 'invalid';
              else if (errorCode === 'AFFILIATE_DISABLED') status = 'unavailable';
              else throw error;
            }
          } else {
            status = (await consumeAffiliateAttribution()).status;
          }
          break;
        } catch (error) {
          const status = error && typeof error === 'object' && 'status' in error
            ? Number((error as { status?: unknown }).status)
            : undefined;
          if (attempt === 2 || (status !== 401 && (!status || status < 500))) throw error;
          await new Promise(resolve => window.setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
      if (!status) return null;
      setAttributionStatus(status);
      if (status === 'bound') {
        await Promise.all([
          currentQueryClient.invalidateQueries({ queryKey: getGetAffiliateDashboardQueryKey() }),
          currentQueryClient.invalidateQueries({ queryKey: getGetAffiliateReferralsQueryKey() }),
        ]);
      }
      return status;
    } catch (error) {
      setAttributionError(error);
      return null;
    } finally {
      setIsConsuming(false);
    }
  }, [capture.isSuccess, code, currentQueryClient]);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (!isLoaded || !isSignedIn || !userId || consumedUserRef.current === userId) return;
    void consumeCapturedAttribution().then(status => {
      // A URL capture can still be in flight when auth completes. no_referral
      // is terminal only when there is no pending URL referral to consume.
      if (status && status !== 'unavailable' && !(status === 'no_referral' && code && !capture.isSuccess)) {
        consumedUserRef.current = userId;
      }
    });
  }, [capture.isSuccess, code, consumeCapturedAttribution, isLoaded, isSignedIn, user?.id]);

  useEffect(() => {
    if (!capture.isSuccess || !isSignedIn) return;
    // Capture and authentication can complete in either order. Always consume
    // once more after capture succeeds so the earlier no-cookie check cannot win.
    void consumeCapturedAttribution().then(status => {
      if (status && status !== 'unavailable' && user?.id) consumedUserRef.current = user.id;
    });
  }, [capture.isSuccess, consumeCapturedAttribution, isSignedIn, user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!isLoaded || !isSignedIn || !userId) return;
    const retryPendingAttribution = () => {
      if (consumedUserRef.current === userId || (code && !capture.isSuccess)) return;
      void consumeCapturedAttribution().then(status => {
        if (status && status !== 'unavailable') consumedUserRef.current = userId;
      });
    };
    window.addEventListener('online', retryPendingAttribution);
    window.addEventListener('focus', retryPendingAttribution);
    const interval = window.setInterval(retryPendingAttribution, 60_000);
    return () => {
      window.removeEventListener('online', retryPendingAttribution);
      window.removeEventListener('focus', retryPendingAttribution);
      window.clearInterval(interval);
    };
  }, [capture.isSuccess, code, consumeCapturedAttribution, isLoaded, isSignedIn, user?.id]);

  useEffect(() => {
    setDismissed(false);
  }, [code]);

  useEffect(() => {
    if (!code || !capture.error) return;
    const status = typeof capture.error === 'object' && 'status' in capture.error
      ? Number((capture.error as { status?: unknown }).status)
      : undefined;
    const errorCode = apiErrorData(capture.error)?.code;
    const shouldRetry = errorCode === 'AFFILIATE_DISABLED'
      || !status
      || status === 401
      || status >= 500;
    if (!shouldRetry) return;
    const retryCapture = () => void capture.refetch();
    window.addEventListener('online', retryCapture);
    window.addEventListener('focus', retryCapture);
    const interval = window.setInterval(retryCapture, 60_000);
    return () => {
      window.removeEventListener('online', retryCapture);
      window.removeEventListener('focus', retryCapture);
      window.clearInterval(interval);
    };
  }, [capture.error, capture.refetch, code]);

  const showNotice = !dismissed && Boolean(
    code || attributionError || (attributionStatus && attributionStatus !== 'no_referral'),
  );
  if (!showNotice) return null;

  const error = capture.error ?? attributionError;
  const isUnavailable = attributionStatus === 'unavailable'
    || apiErrorData(capture.error)?.code === 'AFFILIATE_DISABLED';
  const isError = Boolean(error) && !isUnavailable || attributionStatus === 'invalid';
  const message = capture.isLoading
    ? 'Checking affiliate code…'
    : isConsuming
      ? 'Connecting the referral to your account…'
      : isUnavailable
        ? 'The affiliate program is paused. Your saved code will be checked again when the program is available.'
      : isError
        ? publicApiErrorText(error, 'This affiliate code could not be connected. It remains safe to try again.')
        : attributionStatus === 'bound'
          ? 'Referral connected to your account.'
          : attributionStatus === 'already_bound'
            ? 'Your account already has a referral attribution, so it was not changed.'
            : 'Affiliate code saved. Sign in or create an account to connect it.';

  return (
    <div
      className={cn(
        'fixed inset-x-4 top-24 z-[120] mx-auto flex max-w-lg items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur',
        isError
          ? 'border-destructive/30 bg-destructive/95 text-destructive-foreground'
          : isUnavailable
            ? 'border-amber-500/30 bg-amber-500/95 text-amber-950'
          : 'border-primary/25 bg-card/95 text-foreground',
      )}
      role={isError ? 'alert' : 'status'}
      data-testid="affiliate-referral-capture-status"
    >
      {capture.isLoading || isConsuming
        ? <Loader2 size={17} className="shrink-0 animate-spin" aria-hidden="true" />
        : isError || isUnavailable
          ? <CircleAlert size={17} className="shrink-0" aria-hidden="true" />
          : <Check size={17} className="shrink-0 text-emerald-500" aria-hidden="true" />}
      <span className="min-w-0 flex-1 leading-relaxed">{message}</span>
      {attributionError || capture.error ? (
        <button
          type="button"
          className="button button-secondary h-9 shrink-0 rounded-lg px-3 text-xs"
          onClick={() => {
            if (capture.error) void capture.refetch();
            else void consumeCapturedAttribution();
          }}
        >
          Retry
        </button>
      ) : null}
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
        aria-label="Dismiss referral status"
        onClick={() => setDismissed(true)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function CryptoIdentityCatalog({ children }: { children: React.ReactNode }) {
  const config = useGetExchangeConfig({
    query: {
      queryKey: getGetExchangeConfigQueryKey(),
      retry: false,
      staleTime: 5 * 60_000,
    },
  });
  const options = [
    ...(config.data?.manualSettlementOptions || []),
    ...(config.data?.instantSettlementOptions || []),
  ];
  return <CryptoIdentityProvider options={options}>{children}</CryptoIdentityProvider>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const isDark = useAppTheme();
  const { t } = useI18n();
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({
    query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 }
  });
  const branding = (preview.active && preview.branding) ? preview.branding : published.data?.branding;
  const appearance = useMemo(() => clerkAppearance(isDark, branding), [isDark, branding]);

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={appearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: t('auth.welcomeBack'), subtitle: t('auth.signInSubtitle') } },
        signUp: { start: { title: t('auth.createAccount'), subtitle: t('auth.signUpSubtitle') } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkQueryClientCacheInvalidator />
      <AffiliateReferralTracker />
      <CryptoIdentityCatalog>
        <ErrorBoundary>
          <Suspense fallback={<main className="public-main"><LoadingBlock rows={6} /></main>}>
            <Switch>
            <Route path="/" component={ExchangePage} />
            <Route path="/convert" component={() => <ConfiguredExchangePage pageKey="convert" />} />
            <Route path="/swap" component={() => <ConfiguredExchangePage pageKey="swap" />} />
            {PUBLIC_PAGE_REGISTRY.filter(({ key }) => !['home', 'convert', 'swap'].includes(key)).map((page) => {
              const Component = customPublicContentPages[page.key];
              return <Route
                key={page.key}
                path={page.path}
                component={Component ?? (() => <PublicSitePage pageKey={page.key} />)}
              />;
            })}
            <Route path="/about-us" component={() => <Redirect to="/about" />} />
            <Route path="/affiliate-program" component={() => <Redirect to="/affiliates" />} />
            <Route path="/contact-us" component={() => <Redirect to="/contact" />} />

            <Route path="/blog/:slug" component={BlogDetailPage} />

            <Route path="/order/:id" component={OrderConfirmationPage} />
            <Route path="/status" component={StatusPage} />
            <Route path="/account/affiliate" component={AffiliateDashboardPage} />
            <Route path="/account/deposits" component={AccountDepositsPage} />
            <Route path="/account/orders" component={AccountOrdersPage} />
            <Route path="/account/orders/:id" component={AccountOrderDetailPage} />
            <Route path="/account/settings" component={AccountSettingsPage} />
            <Route path="/account" component={AccountPage} />
            <Route path="/telegram/connect" component={TelegramConnectPage} />
            <Route path="/sign-in/*?" component={CustomerSignInPage} />
            <Route path="/sign-up/*?" component={CustomerSignUpPage} />
            <Route path="/admin" component={AdminOverviewRoute} />
            <Route path="/admin/orders/:id?" component={AdminOrdersRoute} />
            <Route path="/admin/revenue" component={AdminRevenueRoute} />
            <Route path="/admin/customers" component={AdminCustomersRoute} />
            <Route path="/admin/customers/:id" component={AdminCustomerProfileRoute} />
            <Route path="/admin/affiliates" component={AdminAffiliatesOverviewRoute} />
            <Route path="/admin/affiliates/:id" component={AdminAffiliateDetailRoute} />
            <Route path="/admin/payouts" component={AdminAffiliatePayoutsRoute} />
            <Route path="/admin/affiliate-settings" component={AdminAffiliateSettingsRoute} />
            <Route path="/admin/providers" component={AdminProvidersRoute} />
            <Route path="/admin/integrations" component={AdminIntegrationsRoute} />
            <Route path="/admin/currencies" component={AdminCurrenciesRoute} />
            <Route path="/admin/pricing" component={AdminManualPricingRoute} />
            <Route path="/admin/appearance" component={AdminAppearanceRoute} />
            <Route path="/admin/landing-background" component={AdminLandingBackgroundStudioRoute} />
            <Route path="/admin/team" component={AdminTeamRoute} />
            <Route path="/admin/staff"><Redirect to="/admin/team" /></Route>
            <Route path="/admin/site-content" component={AdminSiteContentRoute} />
            <Route path="/admin/blog" component={AdminBlogRoute} />
            <Route path="/admin/blog/new" component={AdminBlogEditorRoute} />
            <Route path="/admin/blog/edit/:id" component={AdminBlogEditorRoute} />
            <Route path="/admin/blog/automation" component={AdminBlogAutomationRoute} />
            <Route path="/admin/newsletter" component={AdminNewsletterRoute} />
            <Route component={NotFound} />
            </Switch>
          </Suspense>
        </ErrorBoundary>
      </CryptoIdentityCatalog>
    </ClerkProvider>
  );
}


export default function App() {
  return (
    <SitePreviewProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <FaviconUpdater />
          <WouterRouter base={basePath}>
            <ClerkProviderWithRoutes />
          </WouterRouter>
        </QueryClientProvider>
      </I18nProvider>
    </SitePreviewProvider>
  );
}
