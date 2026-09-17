import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import {
  getGetCustomerOrdersQueryKey,
  getGetExchangeConfigQueryKey,
  getGetExchangeRoutePricingQueryKey,
  getGetQuickexConfigQueryKey,
  getGetPublishedNavigationQueryKey,
  useCreateExchangeQuote,
  useCreateOrder,
  useGetExchangeConfig,
  useGetExchangeRoutePricing,
  useGetQuickexConfig,
  useGetPublishedNavigation,
} from '@workspace/api-client-react';
import type { ApiError, PaymentMethodFieldDefinition, SettlementOption, SiteNavLink } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import {
  ArrowDownUp, ArrowLeftRight, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight,
  Clock3, Copy, CreditCard, FileText, Home, Landmark, Loader2, Mail, Menu,
  MessageCircle, Package, Search, ShieldCheck, TrendingUp,
  UserRound, Users, WalletCards,
  X, Zap,
} from 'lucide-react';
import {
  SiAlipay, SiCashapp, SiN26, SiPaypal, SiPix, SiRevolut,
  SiVenmo, SiVisa, SiWise, SiZelle,
} from 'react-icons/si';
import { getBrandfetchLogoUrl } from '@/lib/brandfetch';
import { QuickexConvertWidget } from '@/components/quickex-convert-widget';
import { QuickXchangeOverlayHeader } from '@/components/quickxchange-overlay';
import { LogoAvatar } from '@/components/logo-avatar';
import { CryptoIdentity, CryptoLogo, CryptoNetworkBadge, cryptoLogoFallbackUrls } from '@/components/crypto-identity';
import type { OfficialCryptoBySymbol } from '@/components/crypto-identity';
import { useI18n } from '@/i18n';
import { trackEvent } from '@/lib/analytics';
import { GlobalAssetSelector, type GlobalAssetSelectorOption } from '@/components/global-asset-selector';
import { UniversalSearchSheet } from '@/components/universal-search-sheet';
import { FiatCurrencyFlag, isFiatCurrencyCode } from '@/components/fiat-flag';
import { getUniqueSettlementOptions } from '@/components/settlement-option-utils';
import {
  basePath, cn, ErrorState, InlineNotice, number, publicApiErrorText, shortId,
} from '@/components/shared-app-ui';
import bbvaLogoUrl from '../../../../attached_assets/bbva-logo-png_seeklogo-474433_1788988228546.png';
import { useSitePreview } from '@/components/site-preview-context';
import {
  MARKET_CONVERT_SELECTION_EVENT,
  type MarketConvertSelection,
} from '@/lib/market-convert-selection';

export { FiatCurrencyFlag, isFiatCurrencyCode } from '@/components/fiat-flag';

export const sameSettlementOptionId = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.toUpperCase() === right.toUpperCase());

const formatSwapRate = (value: number | string) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value));

function settlementAssetName(option: SettlementOption) {
  if (option.kind === 'crypto-network') return option.title || option.assetCode;
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(option.assetCode.toUpperCase())
      || option.assetCode;
  } catch {
    return option.assetCode;
  }
}

function settlementRouteName(option: SettlementOption) {
  return option.kind === 'crypto-network'
    ? option.routeNetwork || option.networkTitle || option.networkSlug
    : option.title || option.networkTitle || option.routeNetwork;
}

type SettlementGlobalSelectorOption = GlobalAssetSelectorOption & {
  settlementOption: SettlementOption;
};

export function SettlementOptionCombobox({
  value,
  options,
  onChange,
  onOpenChange,
  label,
  testId,
  allowAny = false,
  variant = 'default',
  officialCryptoBySymbol,
  searchPlaceholder,
  paymentMethodFirst = false,
  terminalPresentation = false,
  selectorTitle,
  mobileContainedMenu = false,
}: {
  value: string;
  options: SettlementOption[];
  onChange: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  label: string;
  testId: string;
  allowAny?: boolean;
  variant?: 'default' | 'swap';
  officialCryptoBySymbol?: OfficialCryptoBySymbol;
  matchMenuWidth?: boolean;
  searchPlaceholder?: string;
  paymentMethodFirst?: boolean;
  terminalPresentation?: boolean;
  selectorTitle?: string;
  searchAppearance?: 'default' | 'admin';
  mobileContainedMenu?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    onOpenChange?.(open);
    return () => {
      if (open) onOpenChange?.(false);
    };
  }, [open, onOpenChange]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'crypto' | 'fiat' | 'payment-method'>('all');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalContainer(
      mobileContainedMenu
        ? triggerRef.current?.closest<HTMLElement>('.pricing-preview, .pricing-drawer') || document.body
        : document.body,
    );
  }, [mobileContainedMenu]);

  const selected = options.find(option => sameSettlementOptionId(option.id, value)) || (allowAny ? undefined : options[0]);
  const normalizedQuery = query.trim().toLowerCase();

  const hasCategories = options.length > 0;

  const mappedOptions = useMemo(() => {
    const list: SettlementGlobalSelectorOption[] = [];
    if (allowAny) {
      list.push({
        id: '',
        category: 'crypto',
        searchText: t('selectors.anyOption').toLowerCase() + ' ' + t('selectors.anyOptionDescription').toLowerCase(),
        settlementOption: {
          id: '',
          kind: 'crypto-network',
          assetCode: '*',
          title: t('selectors.anyOption'),
          networkTitle: t('selectors.anyOptionDescription'),
        } as unknown as SettlementOption,
      });
    }

    list.push(...[...options].sort((a, b) =>
      `${a.assetCode} ${a.title} ${a.networkTitle || a.networkSlug || ''}`
        .localeCompare(`${b.assetCode} ${b.title} ${b.networkTitle || b.networkSlug || ''}`)
    ).map((option): SettlementGlobalSelectorOption => ({
      id: option.id,
      category: option.kind === 'crypto-network'
        ? 'crypto'
        : option.paymentMethodId
          ? 'payment-method'
          : 'fiat',
      searchText: [
        option.assetCode,
        option.title,
        option.networkTitle,
        option.networkSlug,
        option.routeNetwork,
        officialCryptoBySymbol?.get(option.assetCode.trim().toUpperCase())?.name,
      ].filter(Boolean).join(' ').toLowerCase(),
      settlementOption: option,
    })));
    return list;
  }, [options, allowAny, officialCryptoBySymbol, t]);

  const filteredOptions = mappedOptions.filter(option => {
    const matchesCategory = category === 'all'
      || (option.id !== '' && (
        category === 'fiat'
          ? option.settlementOption.kind === 'fiat-payment-method'
          : option.category === category
      ));
    return matchesCategory && (!normalizedQuery || option.searchText.includes(normalizedQuery));
  });

  const availableCategories = useMemo(() => {
    const cats = [
      { id: 'all', label: t('selectors.all'), testSuffix: 'all' },
      { id: 'crypto', label: t('selectors.crypto'), testSuffix: 'crypto' },
      { id: 'fiat', label: t('selectors.fiat'), testSuffix: 'fiat' },
      { id: 'payment-method', label: t('selectors.paymentMethods'), testSuffix: 'payment-methods' },
    ];
    return cats;
  }, [t]);

  const listboxId = `${testId}-listbox`;
  const logoFallbackUrls = useCallback((symbol: string) => {
    return cryptoLogoFallbackUrls(symbol, officialCryptoBySymbol);
  }, [officialCryptoBySymbol]);

  const cryptoName = useCallback((option: SettlementOption) =>
    officialCryptoBySymbol?.get(option.assetCode.trim().toUpperCase())?.name
    || settlementAssetName(option), [officialCryptoBySymbol]);

  const renderSwapIdentity = useCallback((
    selectorOption: SettlementGlobalSelectorOption,
    placement: 'trigger' | 'option',
  ) => {
    const option = selectorOption.settlementOption;
    const identityClassName = cn(
      placement === 'trigger' ? 'convert-trigger-identity' : 'convert-option-identity',
      placement === 'option' && 'swap-search-option-identity',
    );
    if (allowAny && option.id === '') {
       return (
        <span className={identityClassName}>
          <span className="crypto-logo admin-widget-any-logo" aria-hidden="true">∗</span>
          <span className="crypto-identity-copy">
            <span className="crypto-identity-primary">
              <strong>{t('selectors.anyOption')}</strong>
            </span>
            <span className="crypto-identity-name">{t('selectors.anyOptionDescription')}</span>
          </span>
        </span>
      );
    }
    if (option.kind === 'crypto-network') {
      return (
        <CryptoIdentity
          symbol={option.assetCode}
          name={cryptoName(option)}
          network={settlementRouteName(option)}
          logoUrl={option.logoUrl}
          networkLogoUrl={(option as SettlementOption & { networkLogoUrl?: string | null }).networkLogoUrl}
          logoFallbackUrls={logoFallbackUrls(option.assetCode)}
          size={placement === 'trigger' ? 'lg' : 'md'}
          className={identityClassName}
        />
      );
    }
    return (
      <SettlementOptionIdentity
        option={option}
        paymentMethodFirst
        showTypeLabel={false}
        className={identityClassName}
      />
    );
  }, [cryptoName, logoFallbackUrls, allowAny, t]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setCategory('all');
      return;
    }
  }, [open]);

  if (variant === 'swap') {
    return (
      <GlobalAssetSelector
        value={selected?.id || value}
        options={mappedOptions.filter(o => o.id !== '')}
        onChange={onChange}
        onOpenChange={onOpenChange}
        label={label}
        title={selectorTitle || label}
        searchPlaceholder={t('selectors.search', { label })}
        closeLabel={t('selectors.close')}
        closeSearchLabel={t('convert.closeSearch', { label })}
        testId={testId}
        renderIdentity={renderSwapIdentity}
        triggerClassName="swap-asset-trigger flex items-center justify-between w-full h-[68px] px-4 bg-background hover:bg-muted/30 border border-input rounded-[20px] transition-all ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
    );
  }

  return (
    <DialogPrimitive.Root modal={false} open={open} onOpenChange={setOpen}>
      <div className={cn('asset-combobox', open && 'open', terminalPresentation && 'terminal-combobox')}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            ref={triggerRef}
            className="asset-combobox-trigger"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="dialog"
            data-value={selected?.id || ''}
            data-testid={testId}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span>
              {selected ? (
                terminalPresentation
                  ? <TerminalSettlementOptionIdentity option={selected} officialCryptoBySymbol={officialCryptoBySymbol} />
                  : selected.kind === 'crypto-network'
                  ? <CryptoIdentity symbol={selected.assetCode} name={selected.title} network={selected.routeNetwork || selected.networkTitle} logoUrl={selected.logoUrl} networkLogoUrl={(selected as SettlementOption & { networkLogoUrl?: string | null }).networkLogoUrl} size="sm" compact />
                  : <SettlementOptionIdentity option={selected} compact paymentMethodFirst={paymentMethodFirst} />
              ) : allowAny ? t('selectors.anyOption') : t('selectors.select')}
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </DialogPrimitive.Trigger>
      </div>
      {portalContainer && (
        <UniversalSearchSheet
          open={open}
          onOpenChange={setOpen}
          title={selectorTitle || label}
          subtitle={t('selectors.optionsAvailable', { count: mappedOptions.length })}
          closeLabel={t('selectors.close')}
          searchPlaceholder={searchPlaceholder || t('selectors.search', { label: label.toLowerCase() })}
          closeSearchLabel={t('convert.closeSearch', { label })}
          query={query}
          onQueryChange={setQuery}
          categories={hasCategories ? availableCategories : undefined}
          activeCategory={category}
          onCategoryChange={(id) => setCategory(id as typeof category)}
          options={filteredOptions}
          renderOption={(option) => renderSwapIdentity(option, 'option')}
          onSelectOption={(option) => onChange(option.id)}
          isSelected={(option) => option.id === '' ? !value : sameSettlementOptionId(option.id, selected?.id)}
          noOptionsText={t(terminalPresentation ? 'selectors.noOptions' : 'selectors.noCurrencies')}
          testIdBase={testId.replace('select-', '')}
          clearSearchTestId={`search-${testId.replace('select-', '')}-clear`}
          triggerRef={triggerRef}
          portalContainer={portalContainer}
          anchoredInsideWidget={mobileContainedMenu && portalContainer !== document.body}
          listboxId={listboxId}
          label={label}
          getOptionId={(option) => option.id || 'any'}
        />
      )}
    </DialogPrimitive.Root>
  );
}

function terminalCryptoName(option: SettlementOption, officialCryptoBySymbol?: OfficialCryptoBySymbol) {
  const symbol = option.assetCode.trim().toUpperCase();
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rawName = officialCryptoBySymbol?.get(symbol)?.name || settlementAssetName(option);
  const cleanedName = rawName
    .replace(new RegExp(`\\b${escapedSymbol}\\b`, 'gi'), ' ')
    .replace(/[|/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·—–-]+|[\s·—–-]+$/g, '')
    .trim();
  return cleanedName || symbol;
}

export function PaymentMethodCopy({
  methodName,
  currencyCode,
  typeLabel = 'Payment Method',
  showTypeLabel = true,
  className,
}: {
  methodName: string;
  currencyCode: string;
  typeLabel?: string;
  showTypeLabel?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('payment-method-copy', className)}>
      <strong className="payment-method-copy-name">{methodName}</strong>
      <span className="payment-method-copy-meta">
        <span className="payment-method-copy-currency">{currencyCode}</span>
        {showTypeLabel && (
          <>
            <span className="payment-method-copy-separator" aria-hidden="true">·</span>
            <span className="payment-method-copy-type">{typeLabel}</span>
          </>
        )}
      </span>
    </span>
  );
}

function TerminalSettlementOptionIdentity({
  option,
  officialCryptoBySymbol,
}: {
  option: SettlementOption;
  officialCryptoBySymbol?: OfficialCryptoBySymbol;
}) {
  const { t } = useI18n();
  if (option.kind === 'crypto-network') {
    const symbol = option.assetCode.trim().toUpperCase();
    const name = terminalCryptoName(option, officialCryptoBySymbol);
    const routeName = settlementRouteName(option)?.trim() || '';
    const showRoute = routeName
      && routeName.toLowerCase() !== name.toLowerCase()
      && routeName.toLowerCase() !== symbol.toLowerCase();
    return (
      <span className="terminal-option-identity">
        <span className="terminal-option-logo">
          <CryptoLogo
            symbol={symbol}
            logoUrl={option.logoUrl}
            logoFallbackUrls={cryptoLogoFallbackUrls(symbol, officialCryptoBySymbol)}
            size="md"
          />
        </span>
        <span className="terminal-option-copy">
          <strong>{symbol}</strong>
          <span>{name}</span>
          {showRoute && (
            <small>· <CryptoNetworkBadge network={routeName} assetSymbol={symbol} networkLogoUrl={(option as SettlementOption & { networkLogoUrl?: string | null }).networkLogoUrl} /></small>
          )}
        </span>
      </span>
    );
  }

  const methodName = option.title || option.networkTitle || option.networkSlug || option.routeNetwork || t('public.paymentMethod');
  const isPaymentMethod = Boolean(option.paymentMethodId);
  const fiatName = settlementAssetName(option);
  return (
    <span className="terminal-option-identity">
      <span className={cn('terminal-option-logo', isPaymentMethod && 'terminal-option-logo-payment')}>
        {isPaymentMethod
          ? <PaymentMethodLogo name={methodName} logoUrl={option.logoUrl} flagUrl={(option as SettlementOption & { flagUrl?: string | null }).flagUrl} badgeCode={option.assetCode} />
          : <FiatCurrencyFlag code={option.assetCode} flagUrl={(option as SettlementOption & { flagUrl?: string | null }).flagUrl} />}
      </span>
      {isPaymentMethod ? (
        <PaymentMethodCopy
          methodName={methodName}
          currencyCode={option.assetCode}
          typeLabel={t('public.paymentMethod')}
          className="terminal-option-copy"
        />
      ) : (
        <span className="terminal-option-copy">
          <><strong>{option.assetCode}</strong><span>{fiatName}</span><small>· {t('selectors.fiat')}</small></>
        </span>
      )}
    </span>
  );
}


function settlementFieldDisplayLabel(field: any, t: (key: any) => string) {
  const normalizedKey = String(field.key || '').replace(/^(source|target)_/, '');
  if (normalizedKey === 'name') return field.label || 'Name';
  return ({
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
  const isMono = renderType === 'account-iban' || renderType === 'wallet-address' || renderType === 'memo-tag' || normalizedKey === 'bank_detail';
  const isRequired = field.required || Boolean(field.requiredWhen);
  const FieldIcon = normalizedKey.includes('name') && normalizedKey !== 'bank_name'
    ? UserRound
    : normalizedKey.includes('bank') || normalizedKey.includes('iban') || renderType === 'account-iban'
      ? (normalizedKey === 'bank_name' ? Landmark : CreditCard)
      : normalizedKey === 'payment_description'
        ? FileText
        : normalizedKey.includes('telegram') || normalizedKey.includes('whatsapp')
          ? MessageCircle
          : renderType === 'email'
            ? Mail
            : renderType === 'wallet-address'
              ? WalletCards
              : FileText;
  const placeholder = ({
    name: 'Enter your full name',
    account_holder_name: 'Enter your full name',
    bank_detail: 'Enter IBAN or account number',
    iban: 'Enter IBAN or account number',
    bank_name: 'Enter bank name',
    payment_description: 'e.g. Payment for crypto exchange',
    telegram_or_whatsapp: 'Enter your Telegram or WhatsApp',
  } as Record<string, string>)[normalizedKey] || `Enter ${displayLabel.toLowerCase()}`;
  const commonProps = {
    id: `swap-detail-${field.key}`,
    required: isRequired,
    placeholder,
    value: value || '',
    onChange: (e: any) => onChange(e.target.value),
    "data-testid": `input-detail-${field.key}`,
    maxLength: field.max,
    minLength: field.min,
    pattern: field.pattern,
    className: `${isMono ? 'font-mono' : 'font-sans'} swap-step2-input text-[14px] placeholder:font-sans placeholder:text-[14px] w-full disabled:cursor-not-allowed disabled:opacity-50`,
  };

  let input;
  switch (renderType) {
    case 'select':
      input = <select {...commonProps}>
        <option value="" disabled>{t('selectors.select')}...</option>
        {field.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>;
      break;
    case 'textarea':
    case 'long-text':
    case 'postal-address':
      input = <textarea {...commonProps} rows={3} />;
      break;
    case 'number':
    case 'integer':
    case 'numeric':
    case 'decimal':
      input = <input type="number" {...commonProps} step={field.type === 'integer' ? "1" : "any"} />;
      break;
    case 'date':
      input = <input type="date" {...commonProps} />;
      break;
    case 'email':
      input = <input type="email" {...commonProps} />;
      break;
    case 'phone':
      input = <input type="tel" {...commonProps} />;
      break;
    case 'private-image':
      input = (
        <input
          id={`swap-detail-${field.key}`}
          type="file"
          disabled
          aria-label={displayLabel}
          data-testid={`input-detail-${field.key}`}
          className={`${commonProps.className} !py-2`}
        />
      );
      break;
    case 'account-iban':
    case 'wallet-address':
    case 'memo-tag':
    case 'short-text':
    case 'text':
    default:
      input = <input type="text" {...commonProps} />;
  }

  return (
    <div className="order-detail-field swap-direct-field-card flex flex-col gap-1.5" data-testid={`swap-detail-card-${field.key}`}>
      <label htmlFor={`swap-detail-${field.key}`} className="swap-step2-field-label">
        {field.emphasizedLabel ? <strong className="text-foreground">{displayLabel}</strong> : displayLabel}
        {isRequired
          ? <span className="required-field-mark" aria-hidden="true">*</span>
          : <small className="swap-step2-optional-badge">({t('swap.optional')})</small>}
      </label>
      <div className="swap-step2-input-shell">
        <FieldIcon size={18} className="swap-step2-input-icon" aria-hidden="true" />
        {input}
      </div>
      {field.type === 'private-image' && <p className="text-[11px] text-muted-foreground mt-1">{t('selectors.secureUploadUnavailable')}</p>}
      {field.help && field.type !== 'private-image' && <p className="text-[11px] text-muted-foreground">{field.help}</p>}
    </div>
  );
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


const PAYMENT_METHOD_LOGO_DOMAINS: Array<[RegExp, string]> = [
  [/\bach\b/i, 'nacha.org'],
  [/fedwire/i, 'frbservices.org'],
  [/faster payments/i, 'wearepay.uk'],
  [/chaps/i, 'bankofengland.co.uk'],
  [/swift/i, 'swift.com'],
  [/interac/i, 'interac.ca'],
  [/spei/i, 'www.banxico.org.mx'],
  [/\bupi\b/i, 'npci.org.in'],
  [/imps|neft|rtgs/i, 'rbi.org.in'],
  [/\bsepa\b/i, 'europeanpaymentscouncil.eu'],
  [/payid|\bnpp\b/i, 'auspayplus.com.au'],
  [/paynow/i, 'abs.org.sg'],
  [/promptpay/i, 'www.bot.or.th'],
  [/paysera/i, 'paysera.lt'],
  [/\bbunq\b/i, 'bunq.com'],
  [/\bbbva\b/i, 'bbva.com'],
  [/\bicard\b/i, 'icard.com'],
  [/\bbnp(?:\s+paribas)?\b/i, 'group.bnpparibas'],
  [/\bing\b/i, 'ing.com'],
  [/commerzbank/i, 'commerzbank.com'],
  [/caixabank/i, 'caixabank.com'],
  [/skrill/i, 'skrill.com'],
  [/kaspi/i, 'kaspi.kz'],
  [/\bwio\b/i, 'wio.io'],
  [/zira+t|zirrat/i, 'ziraatbank.com.tr'],
  [/perfect money/i, 'perfectmoney.com'],
  [/payeer/i, 'payeer.com'],
  [/capitalist/i, 'capitalist.net'],
  [/volet/i, 'volet.com'],
  [/neteller/i, 'neteller.com'],
  [/m-?pesa/i, 'mpesa.com'],
  [/gcash/i, 'gcash.com'],
  [/bkash/i, 'bkash.com'],
  [/easypaisa/i, 'easypaisa.com.pk'],
  [/wechat/i, 'pay.weixin.qq.com'],
];

const PAYMENT_METHOD_OFFICIAL_LOGOS: Array<[RegExp, string]> = [
  [/\bbbva\b/i, bbvaLogoUrl],
  [/\bi\s*card\b/i, 'https://cdn.icard.com/icard.com/img/common/logo.png?53'],
];

const PAYMENT_METHOD_VISUAL_PROFILES: Array<[
  RegExp,
  { brand: string; logoScale: number },
]> = [
  [/\bwio\b/i, { brand: 'wio', logoScale: 1.26 }],
  [/perfect money/i, { brand: 'perfect-money', logoScale: 1.4 }],
  [/\bswift\b/i, { brand: 'swift', logoScale: 1.24 }],
  [/\bcapitalist\b/i, { brand: 'capitalist', logoScale: 1.18 }],
  [/\brevolut\b/i, { brand: 'revolut', logoScale: 1.08 }],
  [/\bwise\b/i, { brand: 'wise', logoScale: 1.08 }],
  [/\bpaysera\b/i, { brand: 'paysera', logoScale: 1.1 }],
  [/\bn26\b/i, { brand: 'n26', logoScale: 1.08 }],
  [/\bbbva\b/i, { brand: 'bbva', logoScale: 1.4 }],
  [/\bbunq\b/i, { brand: 'bunq', logoScale: 1.1 }],
  [/\bqonto\b/i, { brand: 'qonto', logoScale: 1.08 }],
  [/\bnickel\b/i, { brand: 'nickel', logoScale: 1.1 }],
  [/\bsumup\b/i, { brand: 'sumup', logoScale: 1.08 }],
  [/\b(?:zira+t|zirrat)\b/i, { brand: 'ziraat', logoScale: 1.08 }],
  [/\bsepa\b/i, { brand: 'sepa', logoScale: 1.0 }],
  [/\bbnp(?:\s+paribas)?\b/i, { brand: 'bnp-paribas', logoScale: 1.0 }],
  [/\bicard\b/i, { brand: 'icard', logoScale: 1.0 }],
  [/\bchaps\b/i, { brand: 'chaps', logoScale: 1.0 }],
  [/\binterac\b/i, { brand: 'interac', logoScale: 1.0 }],
];

export function PaymentMethodLogo({
  name,
  logoUrl,
  flagUrl,
  badgeCode,
  badgeVariant = 'badge',
  className,
  priority = true,
}: {
  name: string;
  logoUrl?: string | null;
  flagUrl?: string | null;
  badgeCode?: string | null;
  badgeVariant?: 'badge' | 'admin';
  className?: string;
  priority?: boolean;
}) {
  const normalized = name.toLowerCase();
  const visualProfile = PAYMENT_METHOD_VISUAL_PROFILES.find(([pattern]) => pattern.test(name))?.[1];
  let logo: React.ReactNode = null;
  let brand = visualProfile?.brand || 'generic';
  if (normalized.includes('bbva')) { brand = 'bbva'; }
  else if (normalized.includes('sepa')) { brand = 'sepa'; }
  else if (normalized.includes('ziraat') || normalized.includes('zirrat')) { brand = 'ziraat'; }
  else if (normalized.includes('paysera')) { brand = 'paysera'; }
  else if (normalized.includes('wise')) { logo = <SiWise color="#9FE870" />; brand = 'wise'; }
  else if (normalized.includes('revolut')) { logo = <SiRevolut />; brand = 'revolut'; }
  else if (normalized.includes('n26')) { logo = <SiN26 color="#36A18B" />; brand = 'n26'; }
  else if (normalized.includes('paypal')) { logo = <SiPaypal color="#00457C" />; brand = 'paypal'; }
  else if (normalized.includes('zelle')) { logo = <SiZelle color="#741AFC" />; brand = 'zelle'; }
  else if (normalized.includes('cash app')) { logo = <SiCashapp color="#00D632" />; brand = 'cashapp'; }
  else if (normalized.includes('venmo')) { logo = <SiVenmo color="#008CFF" />; brand = 'venmo'; }
  else if (normalized.includes('visa')) { logo = <SiVisa color="#1434CB" />; brand = 'visa'; }
  else if (normalized.includes('mastercard')) {
    logo = (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8.5" cy="12" r="6.5" fill="#EB001B" />
        <circle cx="15.5" cy="12" r="6.5" fill="#F79E1B" />
        <path d="M12 6.52a6.5 6.5 0 0 1 0 10.96 6.5 6.5 0 0 1 0-10.96Z" fill="#FF5F00" />
      </svg>
    );
    brand = 'mastercard';
  }
  else if (normalized.includes('alipay')) { logo = <SiAlipay color="#00A1E9" />; brand = 'alipay'; }
  else if (normalized === 'pix' || normalized.includes(' pix')) { logo = <SiPix color="#32BCAD" />; brand = 'pix'; }

  const officialLogoUrl = PAYMENT_METHOD_OFFICIAL_LOGOS.find(([pattern]) => pattern.test(name))?.[1];
  const remoteDomain = PAYMENT_METHOD_LOGO_DOMAINS.find(([pattern]) => pattern.test(name))?.[1];
  const brandfetchUrl = remoteDomain ? getBrandfetchLogoUrl(remoteDomain, { type: 'icon' }) : null;
  const fallbackRemoteUrl = remoteDomain
    ? remoteDomain === 'perfectmoney.com'
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(remoteDomain)}&sz=256`
      : `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${remoteDomain}`)}&sz=256`
    : null;
  const bundledUrl = brand === 'sepa'
    ? `${basePath}/payment-methods/sepa-logo.png`
    : brand === 'ziraat'
      ? `${basePath}/payment-methods/ziraat-bank-logo.jpg`
      : null;
  const sourceKey = brand === 'sepa' || brand === 'ziraat'
    ? [logoUrl, bundledUrl, brandfetchUrl, fallbackRemoteUrl].filter(Boolean).join('\0')
    : [logoUrl, officialLogoUrl, brandfetchUrl, fallbackRemoteUrl].filter(Boolean).join('\0');
  const imageSources = useMemo(() => Array.from(new Set(sourceKey.split('\0').filter(Boolean))), [sourceKey]);
  const logoType = /\b(?:bank|bbva|n26|bunq|commerzbank|caixabank|ziraat|zirrat|icard|bnp|ing)\b/iu.test(name)
    ? 'bank'
    : 'payment';

  if (!logo) {
    logo = name.trim().slice(0, 1).toUpperCase() || '¤';
  }

  return (
    <span
      className={cn('payment-method-logo-stack', Boolean(badgeCode) && 'payment-method-logo-stack-badged', className)}
      aria-hidden="true"
    >
      <LogoAvatar
        sources={imageSources}
        fallback={logo}
        type={logoType}
        priority={priority}
        brand={brand}
        logoScale={visualProfile?.logoScale}
        size="responsive"
        className="payment-method-logo"
      />
      {badgeCode && <FiatCurrencyFlag code={badgeCode} flagUrl={flagUrl} variant={badgeVariant} size="sm" />}
    </span>
  );
}

function SettlementOptionIdentity({
  option,
  compact = false,
  showTypeLabel = true,
  className,
}: {
  option: SettlementOption;
  compact?: boolean;
  paymentMethodFirst?: boolean;
  showTypeLabel?: boolean;
  className?: string;
}) {
  const paymentMethodName = option.title || option.networkTitle || option.networkSlug || option.routeNetwork || 'Payment method';

  if (option.kind !== 'fiat-payment-method') {
    return (
      <CryptoIdentity
        symbol={option.assetCode}
        name={option.title}
        network={option.routeNetwork || option.networkTitle || option.networkSlug}
        logoUrl={option.logoUrl}
        networkLogoUrl={(option as SettlementOption & { networkLogoUrl?: string | null }).networkLogoUrl}
        size={compact ? 'sm' : 'md'}
        compact={compact}
        className={cn(compact ? undefined : 'crypto-identity-selector flex-1 min-w-0', className)}
      />
    );
  }

  return (
    <span className={cn('settlement-option-identity', compact && 'settlement-option-identity-compact', className)}>
      <PaymentMethodLogo
        name={paymentMethodName}
        logoUrl={option.logoUrl}
        flagUrl={(option as SettlementOption & { flagUrl?: string | null }).flagUrl}
        badgeCode={option.assetCode}
        className="settlement-payment-avatar"
      />
      <PaymentMethodCopy
        methodName={paymentMethodName}
        currencyCode={option.assetCode}
        showTypeLabel={showTypeLabel}
        className="settlement-option-copy"
      />
    </span>
  );
}

function paymentMethodBadgeCode(option: SettlementOption): string {
  return option.assetCode;
}

function SwapRouteRecapIcon({
  option,
  officialCryptoBySymbol,
}: {
  option: SettlementOption;
  officialCryptoBySymbol?: OfficialCryptoBySymbol;
}) {
  return (
    <span className={cn(
      'swap-route-recap-icon',
      option.kind === 'fiat-payment-method' && 'swap-payment-method-icon',
    )}>
      {option.kind === 'crypto-network' ? (
        <CryptoLogo
          symbol={option.assetCode}
          logoUrl={option.logoUrl}
          logoFallbackUrls={cryptoLogoFallbackUrls(option.assetCode, officialCryptoBySymbol)}
          size="lg"
        />
      ) : (
        <>
          <PaymentMethodLogo
            name={option.title || option.networkTitle || option.networkSlug || option.routeNetwork || ''}
            logoUrl={option.logoUrl}
            flagUrl={(option as SettlementOption & { flagUrl?: string | null }).flagUrl}
            badgeCode={paymentMethodBadgeCode(option)}
          />
        </>
      )}
    </span>
  );
}

function QuoteExpiryIndicator({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));

  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    setTimeLeft(Math.max(0, end - Date.now()));

    const timer = setInterval(() => {
      const remaining = Math.max(0, end - Date.now());
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  if (timeLeft <= 0) return null;

  const seconds = Math.ceil(timeLeft / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold" aria-live="polite">
      <Clock3 size={10} /> {m}:{s.toString().padStart(2, '0')}
    </span>
  );
}

export function ManualSwapWidget({
  onConvert,
  onOpenMenu,
}: {
  onConvert: () => void;
  onOpenMenu: () => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { isLoaded: isCustomerLoaded, isSignedIn, user } = useUser();
  const config = useGetExchangeConfig({ query: { queryKey: getGetExchangeConfigQueryKey(), staleTime: 300000 } });
  const quickexConfig = useGetQuickexConfig({ query: { queryKey: getGetQuickexConfigQueryKey(), staleTime: 300000 } });
  const officialCryptoBySymbol = useMemo(() => {
    const catalog = new Map<string, { name: string; logoUrl?: string }>();
    for (const instrument of quickexConfig.data?.instruments || []) {
      const symbol = instrument.currencyTitle.trim().toUpperCase();
      const name = instrument.fullName?.trim();
      const logoUrl = instrument.currencyLogoLink?.trim();
      if (!symbol) continue;
      const current = catalog.get(symbol);
      catalog.set(symbol, {
        name: name && name.toUpperCase() !== symbol ? name : current?.name || symbol,
        logoUrl: current?.logoUrl || (logoUrl && !logoUrl.endsWith('/generic.svg') ? logoUrl : undefined),
      });
    }
    return catalog;
  }, [quickexConfig.data?.instruments]);
  const orderMutation = useCreateOrder();
  const quoteMutation = useCreateExchangeQuote();

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [fromSelectorOpen, setFromSelectorOpen] = useState(false);
  const [toSelectorOpen, setToSelectorOpen] = useState(false);
  const selectorOpen = fromSelectorOpen || toSelectorOpen;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [settlementDetails, setSettlementDetails] = useState<Record<string, string>>({});
  const [destinationAddress, setDestinationAddress] = useState('');
  const [refundAddress, setRefundAddress] = useState('');
  const [destinationMemo, setDestinationMemo] = useState('');
  const [refundMemo, setRefundMemo] = useState('');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const stepPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSettlementDetails({});
    setDestinationAddress('');
    setRefundAddress('');
    setDestinationMemo('');
    setRefundMemo('');
  }, [fromId, toId]);

  const [quotePreview, setQuotePreview] = useState<{
    requestKey: string;
    quoteId: string;
    receiveAmount: number;
    rate: number;
    fee: number;
    minAmount?: number;
    maxAmount?: number;
    expiresAt?: string;
    grossMarketAmount?: number;
    percentageCommission?: number;
    fixedCommission?: number;
    totalFee?: number;
    pricingRuleName?: string;
    requiredSettlementFields?: PaymentMethodFieldDefinition[];
    customerInstructions?: string;
    expectedSettlementMinutes?: number;
  } | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [quoteError, setQuoteError] = useState('');
  const [quoteRefreshCounter, setQuoteRefreshCounter] = useState(0);
  const [swapFlipped, setSwapFlipped] = useState(false);

  const handleQuoteExpire = useCallback(() => {
    setStep(1);
    setTermsAccepted(false);
    setQuotePreview(null);
    setQuoteStatus('idle');
    if (document.visibilityState === 'visible') {
      setQuoteRefreshCounter(c => c + 1);
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !quotePreview) {
        setQuoteRefreshCounter(c => c + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [quotePreview]);

  const [notice, setNotice] = useState<{ kind: 'error' | 'success' | 'info'; text: string; orderId?: string } | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  const moveToStep = useCallback((nextStep: 1 | 2 | 3 | 4) => {
    setNotice(null);
    setStep(nextStep);
    window.requestAnimationFrame(() => {
      stepPanelRef.current?.focus({ preventScroll: true });
      stepPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const [, setLocation] = useLocation();
  const signedInCustomer = isCustomerLoaded && isSignedIn;

  const allOptions = useMemo(() => getUniqueSettlementOptions(config.data), [config.data]);

  const availableManualRoutes = config.data?.manualRouteAvailability?.routes || [];
  const availableSourceIds = useMemo(
    () => new Set(availableManualRoutes.map(route => route.sourceSettlementOptionId)),
    [availableManualRoutes],
  );
  const fromOptions = useMemo(() => allOptions.filter(o => {
    if (o.kind === 'crypto-network' && o.lifecycle === 'active') {
      return true;
    }
    return (o.direction === 'send' || o.direction === 'both') && availableSourceIds.has(o.id);
  }), [allOptions, availableSourceIds]);

  const fromOption = fromOptions.find(o => o.id === fromId) || fromOptions[0];

  const availableTargetIds = useMemo(
    () => new Set(availableManualRoutes
      .filter(route => route.sourceSettlementOptionId === fromOption?.id)
      .map(route => route.targetSettlementOptionId)),
    [availableManualRoutes, fromOption?.id],
  );
  const toOptions = useMemo(() => allOptions.filter(o =>
    (o.direction === 'receive' || o.direction === 'both') &&
    availableTargetIds.has(o.id)
  ), [allOptions, availableTargetIds]);

  const toOption = toOptions.find(o => o.id === toId) || toOptions[0];
  const routePricing = useGetExchangeRoutePricing({
    sourceSettlementOptionId: fromOption?.id || '',
    targetSettlementOptionId: toOption?.id || '',
  }, {
    query: {
      queryKey: getGetExchangeRoutePricingQueryKey({
        sourceSettlementOptionId: fromOption?.id || '',
        targetSettlementOptionId: toOption?.id || '',
      }),
      enabled: Boolean(
        fromId &&
        toId &&
        fromOption &&
        toOption &&
        fromOption.id === fromId &&
        toOption.id === toId &&
        fromOption.id !== toOption.id
      ),
      staleTime: 30_000,
    },
  });
  const manualRouteUnavailable = !config.data?.manualRouteAvailability?.available;
  const canReverseRoute = Boolean(
    fromOption &&
    toOption &&
    availableManualRoutes.some(route =>
      route.sourceSettlementOptionId === toOption.id &&
      route.targetSettlementOptionId === fromOption.id
    )
  );
  const manualRouteUnavailableMessage = config.data?.manualRouteAvailability?.unavailableMessage
    || t('swap.unavailable');

  // Keep the two legs canonical when a route or mode changes. A stale target
  // must never remain addressable in the form or be sent to the quote API.
  useEffect(() => {
    if (fromOptions.length && !fromOptions.some(option => option.id === fromId)) {
      setFromId(fromOptions[0].id);
    }
  }, [fromOptions, fromId]);
  useEffect(() => {
    const validTarget = toOptions.find(option => option.id === toId);
    if (toOptions.length && !validTarget) {
      setToId(toOptions[0].id);
      invalidateQuote();
    }
  }, [toOptions, toId]);

  const quoteRequestKey = fromOption && toOption
    ? JSON.stringify([
        'manual',
        fromOption.id,
        toOption.id,
        amount,
      ])
    : '';
  const currentQuote = quotePreview?.requestKey === quoteRequestKey ? quotePreview : null;
  const hasAccountHolderNameField = Boolean(currentQuote?.requiredSettlementFields?.some(field => {
    const normalizedKey = field.key.replace(/^(source|target)_/, '').toLowerCase();
    const normalizedLabel = field.label.trim().toLowerCase();
    return normalizedKey === 'name'
      || /^(account holder|beneficiary|recipient) name$/.test(normalizedLabel)
      || normalizedLabel === 'name';
  }));
  const quoteReady = Boolean(
    currentQuote &&
    quoteStatus === 'idle' &&
    (!currentQuote.expiresAt || new Date(currentQuote.expiresAt).getTime() > Date.now())
  );

  useEffect(() => {
    if (step !== 2 || !currentQuote?.expiresAt) return;
    const remaining = new Date(currentQuote.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      handleQuoteExpire();
      return;
    }
    const timeout = window.setTimeout(handleQuoteExpire, remaining + 25);
    return () => window.clearTimeout(timeout);
  }, [step, currentQuote?.expiresAt, handleQuoteExpire]);

  const invalidateQuote = () => {
    setStep(1);
    setTermsAccepted(false);
    setQuotePreview(null);
    setQuoteStatus('idle');
    setQuoteError('');
  };

  const initializedForConfig = useRef(false);
  useEffect(() => {
    if (!config.data || initializedForConfig.current) return;
    initializedForConfig.current = true;

    const fiatOptions = allOptions.filter(o => o.kind === 'fiat-payment-method');
    const cryptoOptions = allOptions.filter(o => o.kind === 'crypto-network');

    if (fiatOptions.length > 0 && cryptoOptions.length > 0) {
      setFromId(fiatOptions[0]?.id || '');
      setToId(cryptoOptions[0]?.id || '');
    } else if (cryptoOptions.length > 1) {
      setFromId(cryptoOptions[0]?.id || '');
      setToId(cryptoOptions[1]?.id || '');
    }
  }, [config.data, allOptions]);

  useEffect(() => {
    const parsedAmount = Number(amount);
    const canQuote = Boolean(fromOption && toOption)
      && fromOption?.id !== toOption?.id
      && Number.isFinite(parsedAmount)
      && parsedAmount > 0;

    if (!canQuote || !fromOption || !toOption) {
      setQuotePreview(null);
      setQuoteStatus('idle');
      setQuoteError('');
      return;
    }

    let active = true;
    setQuotePreview(null);
    setQuoteStatus('loading');
    setQuoteError('');
    const timeout = window.setTimeout(() => {
      const requestKey = quoteRequestKey;
      quoteMutation.mutate({
        data: {
          type: 'manual',
          fromAsset: fromOption.assetCode,
          fromNetwork: fromOption.routeNetwork,
          toAsset: toOption.assetCode,
          toNetwork: toOption.routeNetwork,
          amount: parsedAmount,
          sourceSettlementOptionId: fromOption.id,
          targetSettlementOptionId: toOption.id,
        },
      }, {
        onSuccess: (quote) => {
          if (!active) return;
          setQuotePreview({
            requestKey,
            quoteId: quote.quoteId,
            receiveAmount: quote.receiveAmount,
            rate: quote.rate,
            fee: quote.fee,
            minAmount: quote.minAmount,
            maxAmount: quote.maxAmount,
            expiresAt: quote.expiresAt,
            grossMarketAmount: quote.grossMarketAmount,
            percentageCommission: quote.percentageCommission,
            fixedCommission: quote.fixedCommission,
            totalFee: quote.totalFee,
            pricingRuleName: quote.pricingRuleName,
            requiredSettlementFields: quote.requiredSettlementFields,
            customerInstructions: quote.customerInstructions,
            expectedSettlementMinutes: quote.expectedSettlementMinutes,
          });
          setQuoteStatus('idle');
          setQuoteError('');
          trackEvent('quote_displayed', { mode: 'swap' });
        },
        onError: (error) => {
          if (!active) return;
          setQuotePreview(null);
          setQuoteStatus('error');
          setQuoteError(publicApiErrorText(error, t('swap.quoteUnavailable'), t));
          trackEvent('quote_failed', { mode: 'swap' });
        },
      });
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [
    amount,
    fromOption?.id,
    toOption?.id,
    quoteRequestKey,
    quoteRefreshCounter,
  ]);

  const swap = () => {
    if (!fromOption || !toOption || !canReverseRoute) return;
    invalidateQuote();
    const oldFrom = fromId;
    const oldTo = toId;
    setFromId(oldTo);
    setToId(oldFrom);
    setSettlementDetails({});
    setSwapFlipped(flipped => !flipped);
  };

  const canContinue = Boolean(
    quoteReady &&
    currentQuote &&
    fromOption &&
    toOption &&
    fromOption.id !== toOption.id &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0 &&
    !manualRouteUnavailable
  );

  const continueToDetails = () => {
    if (!canContinue) return;
    moveToStep(2);
  };

  const changeFromAsset = (id: string) => {
    invalidateQuote();
    setFromId(id);
    setNotice(null);
    setSettlementDetails({});
  };

  const changeToAsset = (id: string) => {
    invalidateQuote();
    setToId(id);
    setNotice(null);
    setSettlementDetails({});
  };

  const handleSettlementDetailChange = (key: string, val: string) => {
    setSettlementDetails(prev => {
      const next = { ...prev, [key]: val };
      if (currentQuote?.requiredSettlementFields) {
        for (const field of currentQuote.requiredSettlementFields) {
          if (field.requiredWhen) {
            const targetValue = next[field.requiredWhen.fieldKey];
            const matches = Array.isArray(field.requiredWhen.equals)
              ? field.requiredWhen.equals.includes(targetValue)
              : field.requiredWhen.equals === targetValue;
            if (!matches && next[field.key] !== undefined) {
              delete next[field.key];
            }
          }
        }
      }
      return next;
    });
  };
  const submitExchange = (event: React.FormEvent) => {
    event.preventDefault();
    if (step !== 2) return;
    const parsed = Number(amount);
    if (!fromOption || !toOption || !parsed || parsed <= 0 || fromOption.id === toOption.id) {
      setNotice({ kind: 'error', text: t('swap.differentInstruments') }); return;
    }
    if (!currentQuote || !quoteReady) {
      setNotice({
        kind: 'error',
        text: t('public.waitEstimateSubmit'),
      }); return;
    }
    if (currentQuote.expiresAt && new Date(currentQuote.expiresAt).getTime() <= Date.now()) {
      handleQuoteExpire();
      setNotice({ kind: 'info', text: t('public.quoteExpiredReview') });
      return;
    }
    if (!signedInCustomer && !email.trim()) {
      setNotice({ kind: 'error', text: t('swap.contactEmail') }); return;
    }
    if (toOption.kind === 'crypto-network' && !destinationAddress.trim()) {
      setNotice({ kind: 'error', text: t('swap.requiredField', { field: t('swap.destinationAddress') }) }); return;
    }
    if (toOption.kind === 'crypto-network' && toOption.requiresMemo && !destinationMemo.trim()) {
      setNotice({ kind: 'error', text: t('swap.requiredField', { field: t('swap.destinationMemo') }) }); return;
    }
    if (
      fromOption.kind === 'crypto-network'
      && refundAddress.trim()
      && fromOption.requiresMemo
      && !refundMemo.trim()
    ) {
      setNotice({ kind: 'error', text: t('swap.requiredField', { field: t('swap.refundMemo') }) }); return;
    }
    if (!termsAccepted) {
      setNotice({ kind: 'error', text: t('convert.acceptTerms') }); return;
    }

    setNotice(null);

    const parsedDetails: Record<string, string | number> = {};
    if (currentQuote?.requiredSettlementFields) {
      for (const field of currentQuote.requiredSettlementFields) {
        if (field.requiredWhen) {
          const targetValue = settlementDetails[field.requiredWhen.fieldKey];
          const matches = Array.isArray(field.requiredWhen.equals)
            ? field.requiredWhen.equals.includes(targetValue)
            : field.requiredWhen.equals === targetValue;
          if (!matches) continue;
        }

        const val = settlementDetails[field.key];
        if (val !== undefined && val !== '') {
          if (['number', 'integer', 'numeric', 'decimal'].includes(field.type)) {
            parsedDetails[field.key] = Number(val);
          } else {
            parsedDetails[field.key] = val;
          }
        } else if (field.required || field.requiredWhen) {
          setNotice({ kind: 'error', text: t('swap.requiredField', { field: settlementFieldDisplayLabel(field, t) }) });
          return;
        }
      }
    }
    const settlementCustomerName = Object.entries(parsedDetails).find(
      ([key, value]) => /^(source|target)_name$/.test(key) && typeof value === 'string',
    )?.[1] as string | undefined;

    orderMutation.mutate({
      data: {
        type: 'manual',
        fromAsset: fromOption.assetCode,
        fromNetwork: fromOption.routeNetwork,
        toAsset: toOption.assetCode,
        toNetwork: toOption.routeNetwork,
        amount: parsed,
        customerEmail: signedInCustomer ? undefined : email.trim(),
        customerName: name || settlementCustomerName || undefined,
        clientRequestId: clientRequestId,
        sourceSettlementOptionId: fromOption.id,
        targetSettlementOptionId: toOption.id,
        destinationAddress: toOption.kind === 'crypto-network' ? destinationAddress.trim() : undefined,
        destinationMemo: toOption.kind === 'crypto-network' ? destinationMemo.trim() : undefined,
        refundAddress: refundAddress.trim() || undefined,
        refundMemo: fromOption.kind === 'crypto-network' ? refundMemo.trim() : undefined,
        settlementDetails: Object.keys(parsedDetails).length > 0 ? parsedDetails : undefined,
        note: note || undefined,
        quoteId: currentQuote.quoteId,
      }
    }, {
      onSuccess: (order) => {
        if (order.status === 'failed' && !order.outcomeUnknown) {
          setClientRequestId(crypto.randomUUID());
          setNotice({
            kind: 'error',
            text: t('public.submitFailed'),
            orderId: order.id,
          });
          setTermsAccepted(false);
          return;
        }
        trackEvent('order_created', { mode: 'swap' });
        queryClient.invalidateQueries({ queryKey: getGetCustomerOrdersQueryKey() });
        const trackingQuery = order.trackingToken
          ? `&trackingToken=${encodeURIComponent(order.trackingToken)}`
          : '';
        setLocation(`/order/${encodeURIComponent(order.id)}?provider=manual${trackingQuery}`);
      },
      onError: (error) => {
        let parsedError: ApiError | null = null;
        if (error && typeof error === 'object' && 'data' in error) {
          const data = (error as { data?: unknown }).data;
          if (data && typeof data === 'object' && 'error' in data) {
            parsedError = data as ApiError;
          }
        }

        if (parsedError?.outcomeUnknown || parsedError?.code === 'verification-required') {
          setNotice({
            kind: 'error',
            text: publicApiErrorText(error, t('errors.confirmationPending'), t),
            orderId: parsedError.orderId
          });
        } else {
          setNotice({
            kind: 'error',
            text: publicApiErrorText(error, t('public.placeFailed'), t),
            orderId: parsedError?.orderId
          });
        }

        if (
          parsedError &&
          !parsedError.outcomeUnknown &&
          (parsedError.retryable || Boolean(parsedError.orderId))
        ) {
          setClientRequestId(crypto.randomUUID());
        }
      },
    });
  };

  if (config.isLoading) {
    return <div className="exchange-card redesigned-widget skeleton h-[620px] rounded-3xl" />;
  }
  if (config.isError) {
    return <div className="exchange-card redesigned-widget h-[620px] rounded-3xl"><ErrorState message={t('swap.unavailable')} retry={() => config.refetch()} /></div>;
  }

  return (
    <form className={cn('exchange-card exchange-card-expanded redesigned-widget swap-widget-flow', `swap-widget-step-${step}`, step === 2 && 'swap-compact-step-2', selectorOpen && 'selector-panel-open')} onSubmit={submitExchange} data-testid="form-exchange">
      <div className="reference-header">
        <div className="reference-top-bar">
          <div className="widget-tabs-pill" role="group" aria-label={t('convert.exchangeType')}>
            <button
              type="button"
              className="active"
              aria-pressed="true"
              data-mode-target="swap"
            >
              {t('swap.swap')}
            </button>
            <button
              type="button"
              onClick={onConvert}
              aria-pressed={false}
              data-mode-target="convert"
            >
              {t('swap.convert')}
            </button>
          </div>
          <button
            type="button"
            className="reference-menu-btn"
            aria-label="Open navigation"
            data-testid="widget-menu-button"
            onClick={onOpenMenu}
          >
            <Menu size={20} />
          </button>
        </div>

        <div className="reference-title-row">
          <h2>Swap <span>Currencies</span></h2>
          {step === 2 ? (
            <div className="swap-step2-progress" aria-label="Step 2 of 3">
              <span>Step 2 of 3</span>
              <span className="swap-step2-progress-track" aria-hidden="true">
                <i />
                <i className="is-active" />
                <i />
              </span>
            </div>
          ) : (
            <div className="reference-realtime-badge">
              <TrendingUp size={15} /> Real-time rate
            </div>
          )}
        </div>
      </div>

      {manualRouteUnavailable && (
        <InlineNotice kind="error">{manualRouteUnavailableMessage}</InlineNotice>
      )}

          {step === 1 ? (
            <div ref={stepPanelRef} className="swap-step-panel swap-quote-step animate-in fade-in slide-in-from-bottom-4 duration-300" tabIndex={-1}>
              <div className="convert-quote-flow exchange-flow-stack">
                <div className="reference-amount-panel amount-stack">
                  <div className="reference-amount-header">
                    <span className="reference-amount-label">{t('swap.youSend')}</span>
                  </div>
                  <div className="reference-amount-body exchange-amount-row">
                    <input id="amount" className="reference-amount-input" inputMode="decimal" value={amount} onChange={(event) => { invalidateQuote(); setAmount(event.target.value); setNotice(null); }} placeholder="0" disabled={manualRouteUnavailable} data-testid="input-amount" />
                    <SettlementOptionCombobox value={fromOption?.id || ''} options={fromOptions} onChange={changeFromAsset} onOpenChange={setFromSelectorOpen} label={t('swap.sendMethod')} selectorTitle={t('swap.youSend')} testId="select-from-asset" variant="swap" officialCryptoBySymbol={officialCryptoBySymbol} />
                  </div>
                  <div className="reference-amount-footer">
                    <span>Min: {routePricing.data?.minAmount != null ? number(routePricing.data.minAmount) : 0} {fromOption?.assetCode || ''}</span>
                    <span>
                      Max: {routePricing.data?.maxAmount != null
                        ? `${number(routePricing.data.maxAmount)} ${fromOption?.assetCode || ''}`
                        : 'No limit'}
                    </span>
                  </div>
                  {((fromOption?.sendInstructions || fromOption?.instructions) || (currentQuote?.customerInstructions)) && (
                    <div className="field-hint text-primary mt-2">
                      <strong>{t('swap.note')}</strong>
                      {fromOption?.sendInstructions || fromOption?.instructions || ''}
                      {currentQuote?.customerInstructions ? ` ${currentQuote.customerInstructions}` : ''}
                      {currentQuote?.expectedSettlementMinutes ? ` (Expected time: ~${currentQuote.expectedSettlementMinutes}m)` : ''}
                    </div>
                  )}
                </div>

                <div className={`reference-swap-divider ${selectorOpen ? 'opacity-0 invisible pointer-events-none' : 'opacity-100 visible'} transition-opacity`} aria-hidden={selectorOpen}>
                  <button
                    type="button"
                    className={`reference-swap-button ${swapFlipped ? 'rotate-180' : ''}`}
                    onClick={swap}
                    aria-label={canReverseRoute ? t('swap.reverse') : t('swap.reverseUnavailable')}
                    title={canReverseRoute ? t('swap.reverse') : t('swap.reverseUnavailable')}
                    data-testid="button-swap-assets"
                    disabled={!canReverseRoute || selectorOpen}
                    tabIndex={selectorOpen ? -1 : undefined}
                  >
                    <ArrowDownUp size={16} />
                  </button>
                </div>

                <div className="reference-amount-panel amount-stack">
                  <div className="reference-amount-header">
                    <span className="reference-amount-label">{t('swap.youReceive')}</span>
                  </div>
                  <div className="reference-amount-body exchange-amount-row">
                    <input id="receive" className={`reference-amount-input ${quoteStatus === 'loading' ? 'quoting' : !currentQuote ? 'empty' : ''}`} value={currentQuote ? number(currentQuote.receiveAmount) : ''} readOnly placeholder="0" data-testid="input-receive-amount" />
                    <SettlementOptionCombobox value={toOption?.id || ''} options={toOptions} onChange={changeToAsset} onOpenChange={setToSelectorOpen} label={t('swap.receiveMethod')} selectorTitle={t('swap.youReceive')} testId="select-to-asset" variant="swap" officialCryptoBySymbol={officialCryptoBySymbol} />
                  </div>
                  <div className="reference-amount-footer">
                    <span>{t('swap.estimated')}</span>
                    <span>{t('swap.rateChecked')}</span>
                  </div>
                  {(toOption?.receiveInstructions || toOption?.instructions) && (
                    <p className="field-hint text-primary mt-2"><strong>{t('swap.note')}</strong> {toOption.receiveInstructions || toOption.instructions}</p>
                  )}
                  {quoteStatus === 'error' && quoteError && (
                    <p className="field-hint quote-error">{quoteError}</p>
                  )}
                </div>
              </div>

              {fromOption && toOption && (
                <div className="reference-rate-summary mt-4" data-testid="route-summary" aria-live="polite">
                  <ArrowLeftRight size={18} className="reference-rate-icon" />
                  <div className="reference-rate-content">
                    <div className="reference-rate-text">
                      <span className="reference-rate-label">Exchange Rate</span>
                      <strong className="reference-rate-value">
                        {currentQuote
                          ? <>1 {fromOption.assetCode} = <span>{formatSwapRate(currentQuote.rate)} {toOption.assetCode}</span></>
                          : routePricing.data
                            ? <>1 {fromOption.assetCode} = <span>{formatSwapRate(routePricing.data.rate)} {toOption.assetCode}</span></>
                            : <>1 {fromOption.assetCode} = <span>-- {toOption.assetCode}</span></>}
                      </strong>
                    </div>
                    {currentQuote?.expiresAt && (
                      <div className="reference-rate-timer">
                        <Clock3 size={14} /> <QuoteExpiryIndicator expiresAt={currentQuote.expiresAt} onExpire={handleQuoteExpire} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="exchange-submit-wrap">
                <button type="button" className="button button-primary widget-primary-submit group" disabled={!canContinue} onClick={continueToDetails} data-testid="button-swap-continue">
                  {t('actions.continue')}
                  <span className="continue-arrow-accent" aria-hidden="true"><ArrowRight size={16} /></span>
                </button>
              </div>
            </div>
          ) : step === 2 && quoteReady && currentQuote ? (
            <div ref={stepPanelRef} className="swap-step-panel swap-fulfillment-step animate-in fade-in slide-in-from-right-4 duration-300" data-testid="swap-step-wallets" tabIndex={-1}>
              <div className="swap-step2-summary" data-testid="swap-wallet-quote-summary">
                <button
                  type="button"
                  onClick={() => moveToStep(1)}
                  className="swap-step2-change"
                  data-testid="swap-button-back"
                  aria-label={t('swap.backToQuote')}
                >
                  <ArrowLeftRight size={13} strokeWidth={2.3} />
                  <span>Change</span>
                </button>

                <div className="swap-step2-route">
                  {fromOption && (
                    <div className="swap-step2-party" data-testid="swap-summary-from-logo">
                      <span className="swap-step2-party-icon">
                        <SwapRouteRecapIcon option={fromOption} officialCryptoBySymbol={officialCryptoBySymbol} />
                      </span>
                      <strong>{fromOption.kind === 'crypto-network' ? fromOption.assetCode : fromOption.title}</strong>
                      {fromOption.kind === 'crypto-network' ? (
                        <CryptoNetworkBadge
                          className="swap-step2-party-badge"
                          network={settlementRouteName(fromOption)}
                          assetSymbol={fromOption.assetCode}
                          networkLogoUrl={(fromOption as SettlementOption & { networkLogoUrl?: string | null }).networkLogoUrl}
                        />
                      ) : (
                        <span className="swap-step2-party-badge">{fromOption.assetCode}</span>
                      )}
                    </div>
                  )}

                  <span className="swap-step2-route-arrow">
                    <ArrowRight size={24} strokeWidth={2.3} aria-hidden="true" />
                  </span>

                  {toOption && (
                    <div className="swap-step2-party" data-testid="swap-summary-to-logo">
                      <span className="swap-step2-party-icon">
                        <SwapRouteRecapIcon option={toOption} officialCryptoBySymbol={officialCryptoBySymbol} />
                      </span>
                      <strong>{toOption.kind === 'crypto-network' ? toOption.assetCode : toOption.title}</strong>
                      {toOption.kind === 'crypto-network' ? (
                        <CryptoNetworkBadge
                          className="swap-step2-party-badge"
                          network={settlementRouteName(toOption)}
                          assetSymbol={toOption.assetCode}
                          networkLogoUrl={(toOption as SettlementOption & { networkLogoUrl?: string | null }).networkLogoUrl}
                        />
                      ) : (
                        <span className="swap-step2-party-badge">
                          <FiatCurrencyFlag code={toOption.assetCode} flagUrl={(toOption as SettlementOption & { flagUrl?: string | null }).flagUrl} size="sm" />
                          {toOption.assetCode}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="swap-step2-equation font-mono">
                  <span data-testid="swap-summary-send-amount">
                    {number(Number(amount))} {fromOption.assetCode}
                  </span>
                  <span aria-hidden="true">≈</span>
                  <span data-testid="swap-summary-receive-amount">
                    {number(currentQuote.receiveAmount)} {toOption.assetCode}
                  </span>
                </div>
              </div>

              {currentQuote.expiresAt && (
                <div className="swap-step2-rate-row">
                  <span className="swap-step2-rate-icon" aria-hidden="true">
                    <Clock3 size={18} />
                  </span>
                  <span className="swap-step2-rate-copy">
                    <strong>{t('swap.rateReserved')}</strong>
                    <small>Complete your details to proceed</small>
                  </span>
                  <span className="swap-step2-countdown">
                    <Clock3 size={13} aria-hidden="true" />
                    <QuoteExpiryIndicator expiresAt={currentQuote.expiresAt} onExpire={handleQuoteExpire} />
                  </span>
                </div>
              )}

              <div className="order-details-content swap-step2-fields">
                {toOption?.kind === 'crypto-network' && (
                  <>
                    <div className="order-detail-field order-detail-field--destination">
                      <label htmlFor="swap-destination" className="swap-step2-field-label">
                        {t('swap.destinationAddress')} · {toOption.assetCode} {toOption.networkTitle ? `(${toOption.networkTitle})` : ''}
                        <span className="required-field-mark" aria-hidden="true">*</span>
                      </label>
                      <div className="swap-step2-input-shell">
                        <WalletCards size={18} className="swap-step2-input-icon" aria-hidden="true" />
                        <input
                          id="swap-destination"
                          required
                          value={destinationAddress}
                          onChange={(e) => setDestinationAddress(e.target.value)}
                          placeholder={t('convert.destinationAddressPlaceholder', { asset: toOption.assetCode })}
                          spellCheck={false}
                          autoCapitalize="none"
                          data-testid="input-destination-address"
                          className="swap-step2-input font-mono"
                        />
                      </div>
                    </div>

                    {toOption.requiresMemo && (
                      <div className="order-detail-field order-detail-field--memo">
                        <label htmlFor="swap-destination-memo" className="swap-step2-field-label">
                          {t('swap.destinationMemo')}
                          <span className="required-field-mark" aria-hidden="true">*</span>
                        </label>
                        <div className="swap-step2-input-shell">
                          <FileText size={18} className="swap-step2-input-icon" aria-hidden="true" />
                          <input
                            id="swap-destination-memo"
                            required
                            value={destinationMemo}
                            onChange={(e) => setDestinationMemo(e.target.value)}
                            placeholder={t('convert.memoPlaceholder')}
                            data-testid="input-destination-memo"
                            className="swap-step2-input font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!hasAccountHolderNameField && (
                  <div className="order-detail-field order-detail-field--name">
                    <label htmlFor="swap-name" className="swap-step2-field-label">
                      {t('swap.yourName')} <small className="swap-step2-optional-badge">{t('swap.optional')}</small>
                    </label>
                    <div className="swap-step2-input-shell">
                      <UserRound size={18} className="swap-step2-input-icon" aria-hidden="true" />
                      <input
                        id="swap-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t('swap.nameOnOrder')}
                        data-testid="input-customer-name"
                        className="swap-step2-input font-sans"
                      />
                    </div>
                  </div>
                )}

                {currentQuote?.requiredSettlementFields?.filter((field: any) => {
                  if (field.requiredWhen) {
                    const targetValue = settlementDetails[field.requiredWhen.fieldKey];
                    const matches = Array.isArray(field.requiredWhen.equals)
                      ? field.requiredWhen.equals.includes(targetValue)
                      : field.requiredWhen.equals === targetValue;
                    return matches;
                  }
                  return true;
                }).map((field: any) => {
                  const fieldValue = settlementDetails[field.key] || '';
                  return (
                    <DynamicField
                      key={field.key}
                      field={field}
                      value={fieldValue}
                      onChange={(val) => handleSettlementDetailChange(field.key, val)}
                    />
                  );
                })}

                <div className="order-detail-field order-detail-field--refund flex flex-col gap-1.5">
                  <label htmlFor="swap-refund" className="text-[13px] font-semibold text-muted-foreground">
                    {t('swap.refundAddress')}{fromOption?.kind === 'crypto-network' ? ` · ${fromOption.assetCode}` : ''} <small className="font-normal">({t('swap.optional')})</small>
                  </label>
                  <div className="relative">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <input
                      id="swap-refund"
                      value={refundAddress}
                      onChange={(e) => setRefundAddress(e.target.value)}
                      placeholder={t('convert.addRefund')}
                      spellCheck={false}
                      autoCapitalize="none"
                      data-testid="input-refund-address"
                      className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm"
                    />
                  </div>
                </div>

                {fromOption?.kind === 'crypto-network' && (
                  <div
                    hidden={!refundAddress.trim()}
                    className={`order-detail-field order-detail-field--refund-memo transition-all duration-300 overflow-hidden ${refundAddress.trim() ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="swap-refund-memo" className="text-[13px] font-semibold text-muted-foreground">
                        {t('swap.refundMemo')} <small className="font-normal">({fromOption.requiresMemo ? t('swap.required') : t('swap.optional')})</small>
                      </label>
                      <input
                        id="swap-refund-memo"
                        required={fromOption.requiresMemo && Boolean(refundAddress.trim())}
                        value={refundMemo}
                        onChange={(e) => setRefundMemo(e.target.value)}
                        disabled={!refundAddress.trim()}
                        placeholder={t('swap.refundMemo')}
                        data-testid="input-refund-memo"
                        className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] px-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>
                )}

                <div className="order-detail-field order-detail-field--email flex flex-col gap-1.5">
                  <label htmlFor="swap-email" className="text-[13px] font-semibold text-muted-foreground">
                    {t('convert.emailAddress')}
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      id="swap-email"
                      type="email"
                      required={!signedInCustomer}
                      disabled={Boolean(signedInCustomer)}
                      value={signedInCustomer ? user?.primaryEmailAddress?.emailAddress ?? '' : email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t('convert.emailPlaceholder')}
                      data-testid="input-customer-email"
                      className="font-sans text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-75"
                    />
                  </div>
                </div>

                <div className="order-terms convert-terms-card mt-2 flex items-start gap-3">
                   <input
                     type="checkbox"
                     id="swap-terms"
                     required
                     checked={termsAccepted}
                     onChange={e => setTermsAccepted(e.target.checked)}
                     className="mt-1 w-[18px] h-[18px] rounded border-border text-primary focus:ring-primary/20 shrink-0"
                   />
                   <label htmlFor="swap-terms" className="text-[14px] font-medium text-foreground leading-relaxed cursor-pointer select-none">
                     {t('swap.terms')}
                   </label>
                </div>

                <div className="order-actions convert-order-actions mt-2 flex flex-col gap-4">
                  <button
                    type="submit"
                    disabled={orderMutation.isPending || !quoteReady || !termsAccepted || (!signedInCustomer && !email.trim())}
                    className="button button-primary widget-primary-submit w-full h-[54px] rounded-xl text-[16px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="swap-button-submit"
                  >
                    {orderMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : null}
                    {orderMutation.isPending ? t('swap.submitting') : t('swap.placeOrder')}
                    {!orderMutation.isPending && <ArrowRight size={18} />}
                  </button>
                  <p className="swap-step2-security">
                    <ShieldCheck size={14} aria-hidden="true" />
                    <span>Your information is secure and encrypted</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div ref={stepPanelRef} className="swap-step-panel swap-quote-refresh" tabIndex={-1}>
              <InlineNotice kind="info">{t('swap.quoteRefreshing')}</InlineNotice>
              <button type="button" className="swap-step-back" onClick={() => moveToStep(1)} data-testid="button-swap-back">
                <ChevronLeft size={17} /> {t('swap.backToQuote')}
              </button>
            </div>
          )}

          {notice && (
            <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>
              <div>{notice.text}</div>
              {notice.orderId && (
                <div className="mt-2">
                  <Link href={`/status?order=${notice.orderId}`} className="text-link">
                    {t('swap.trackOrder', { id: shortId(notice.orderId) })} <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </InlineNotice>
          )}
        </form>
  );
}

function WidgetNavigationScreen({
  closeButtonRef,
  onClose,
  links,
}: {
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  links: SiteNavLink[];
}) {
  const [location] = useLocation();
  const { t } = useI18n();

  return (
    <div className="exchange-card redesigned-widget widget-navigation-screen" data-testid="widget-navigation-screen">
      <QuickXchangeOverlayHeader
        title="Menu"
        closeControl={(
          <button
            ref={closeButtonRef}
            type="button"
            className="qx-overlay-close"
            onClick={onClose}
            aria-label={t('public.closeNavigation')}
            data-testid="button-close-widget-menu"
          >
            <X size={24} />
          </button>
        )}
      />
      <nav className="qx-overlay-list" aria-label={t('public.mobileNav')}>
        {links.map((link) => {
          const Icon = link.href === '/' ? Home : link.href.startsWith('/status') ? Package : link.href.includes('aml') ? ShieldCheck : FileText;
          const content = <><div className="qx-menu-icon"><Icon size={20} /></div><span className="qx-menu-row-label">{link.label}</span><ChevronRight size={20} className="qx-menu-row-arrow" /></>;
          const className = cn('qx-menu-row', (location === link.href || (link.href !== '/' && location.startsWith(link.href))) && 'active');
          return /^https?:\/\//i.test(link.href)
            ? <a key={link.id} href={link.href} target="_blank" rel="noreferrer" className={className} onClick={onClose}>{content}</a>
            : <Link key={link.id} href={link.href} className={className} onClick={onClose}>{content}</Link>;
        })}
      </nav>
    </div>
  );
}

export function ExchangeModeSwitcher({ onModeChange, initialMode = 'swap' }: { onModeChange?: (mode: 'swap' | 'convert') => void; initialMode?: 'swap' | 'convert' }) {
  const { t } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const convertLayerRef = useRef<HTMLDivElement>(null);
  const swapLayerRef = useRef<HTMLDivElement>(null);
  const menuCloseButtonRef = useRef<HTMLButtonElement>(null);
  const menuWasOpenRef = useRef(false);
  const activeModeRef = useRef<'swap' | 'convert'>(initialMode);
  const [convertDataEnabled, setConvertDataEnabled] = useState(initialMode === 'convert');
  const [menuOpen, setMenuOpen] = useState(false);
  const preview = useSitePreview();
  const publishedNavigation = useGetPublishedNavigation({ query: { queryKey: getGetPublishedNavigationQueryKey(), staleTime: 60_000 } });
  const configuredWidgetLinks = (preview.active && preview.navigation ? preview.navigation : publishedNavigation.data ?? [])
    .filter((link) => link.enabled && link.widget)
    .sort((a, b) => a.label.localeCompare(b.label) || a.href.localeCompare(b.href) || a.id.localeCompare(b.id));
  const widgetLinks: SiteNavLink[] = configuredWidgetLinks.length ? configuredWidgetLinks : [
    { id: 'widget-home', label: t('navigation.home'), href: '/', enabled: true, header: false, footer: false, widget: true },
    { id: 'widget-track', label: t('header.trackOrder'), href: '/status', enabled: true, header: false, footer: false, widget: true },
    { id: 'widget-aml', label: 'AML / KYC', href: '/aml-kyc', enabled: true, header: false, footer: false, widget: true },
    { id: 'widget-terms', label: 'Terms and Conditions', href: '/terms-conditions', enabled: true, header: false, footer: false, widget: true },
    { id: 'widget-privacy', label: 'Privacy Policy', href: '/privacy-policy', enabled: true, header: false, footer: false, widget: true },
  ];

  const syncModeTestIds = useCallback((activeMode: 'swap' | 'convert') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.querySelectorAll('[data-testid="button-mode-select-instant"], [data-testid="button-mode-select-manual"]')
      .forEach(element => element.removeAttribute('data-testid'));
    const activeLayer = activeMode === 'convert' ? convertLayerRef.current : swapLayerRef.current;
    activeLayer?.querySelector('[data-mode-target="convert"]')?.setAttribute('data-testid', 'button-mode-select-instant');
    activeLayer?.querySelector('[data-mode-target="swap"]')?.setAttribute('data-testid', 'button-mode-select-manual');
  }, []);

  const changeProduct = useCallback((nextProduct: 'swap' | 'convert') => {
    const currentProduct = activeModeRef.current;
    if (nextProduct === currentProduct) return;
    const convertActive = nextProduct === 'convert';
    if (convertActive) setConvertDataEnabled(true);
    const currentLayer = currentProduct === 'convert' ? convertLayerRef.current : swapLayerRef.current;
    const nextLayer = convertActive ? convertLayerRef.current : swapLayerRef.current;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && currentLayer?.contains(activeElement)) {
      activeElement.blur();
    }
    convertLayerRef.current?.classList.toggle('active-layer', convertActive);
    convertLayerRef.current?.classList.toggle('inactive-layer', !convertActive);
    convertLayerRef.current?.setAttribute('aria-hidden', String(!convertActive));
    convertLayerRef.current?.toggleAttribute('inert', !convertActive);
    swapLayerRef.current?.classList.toggle('active-layer', !convertActive);
    swapLayerRef.current?.classList.toggle('inactive-layer', convertActive);
    swapLayerRef.current?.setAttribute('aria-hidden', String(convertActive));
    swapLayerRef.current?.toggleAttribute('inert', convertActive);
    activeModeRef.current = nextProduct;
    viewportRef.current?.closest('.exchange-wrapper')?.setAttribute('data-exchange-mode', nextProduct);
    syncModeTestIds(nextProduct);
    if (onModeChange) onModeChange(nextProduct);
    window.requestAnimationFrame(() => {
      const activeTab = nextLayer?.querySelector<HTMLElement>(`[data-mode-target="${nextProduct}"]`);
      activeTab?.focus({ preventScroll: true });
    });
    window.setTimeout(() => {
      trackEvent('exchange_mode_changed', { from_mode: currentProduct, to_mode: nextProduct });
    }, 300);
  }, [onModeChange, syncModeTestIds]);
  const selectSwap = useCallback(() => changeProduct('swap'), [changeProduct]);
  const selectConvert = useCallback(() => changeProduct('convert'), [changeProduct]);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (convertDataEnabled) return;
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(() => setConvertDataEnabled(true), { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setConvertDataEnabled(true), 300);
    return () => window.clearTimeout(id);
  }, [convertDataEnabled]);

  useEffect(() => {
    const handleMarketSelection = (event: Event) => {
      const selection = (event as CustomEvent<MarketConvertSelection>).detail;
      if (selection?.symbol) selectConvert();
    };
    window.addEventListener(MARKET_CONVERT_SELECTION_EVENT, handleMarketSelection);
    return () => window.removeEventListener(MARKET_CONVERT_SELECTION_EVENT, handleMarketSelection);
  }, [selectConvert]);

  useEffect(() => {
    viewportRef.current?.closest('.exchange-wrapper')?.setAttribute('data-exchange-mode', initialMode);
    syncModeTestIds(initialMode);
    onModeChange?.(initialMode);
  }, [initialMode, onModeChange, syncModeTestIds]);

  useEffect(() => {
    const convertActive = activeModeRef.current === 'convert';
    if (menuOpen) {
      menuWasOpenRef.current = true;
      convertLayerRef.current?.setAttribute('aria-hidden', 'true');
      convertLayerRef.current?.setAttribute('inert', '');
      swapLayerRef.current?.setAttribute('aria-hidden', 'true');
      swapLayerRef.current?.setAttribute('inert', '');
      window.requestAnimationFrame(() => menuCloseButtonRef.current?.focus({ preventScroll: true }));
    } else {
      convertLayerRef.current?.setAttribute('aria-hidden', String(!convertActive));
      convertLayerRef.current?.toggleAttribute('inert', !convertActive);
      swapLayerRef.current?.setAttribute('aria-hidden', String(convertActive));
      swapLayerRef.current?.toggleAttribute('inert', convertActive);
      if (menuWasOpenRef.current) {
        menuWasOpenRef.current = false;
        window.requestAnimationFrame(() => {
          const activeLayer = convertActive ? convertLayerRef.current : swapLayerRef.current;
          activeLayer?.querySelector<HTMLButtonElement>('[data-testid="widget-menu-button"]')
            ?.focus({ preventScroll: true });
        });
      }
    }

    if (!menuOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeMenu, menuOpen]);

  useEffect(() => {
    syncModeTestIds(activeModeRef.current);
    const observer = new MutationObserver(() => syncModeTestIds(activeModeRef.current));
    if (viewportRef.current) observer.observe(viewportRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [syncModeTestIds]);

  return (
    <div ref={viewportRef} className={cn('exchange-mode-viewport', menuOpen && 'menu-open')}>
      <div
        ref={convertLayerRef}
        className={cn('exchange-mode-layer', initialMode === 'convert' ? 'active-layer' : 'inactive-layer')}
        aria-hidden={initialMode !== 'convert'}
        inert={initialMode !== 'convert'}
      >
        <QuickexConvertWidget dataEnabled={convertDataEnabled} onSwap={selectSwap} onOpenMenu={openMenu} />
      </div>

      <div
        ref={swapLayerRef}
        className={cn('exchange-mode-layer', initialMode === 'swap' ? 'active-layer' : 'inactive-layer')}
        aria-hidden={initialMode === 'convert'}
        inert={initialMode === 'convert'}
      >
        <ManualSwapWidget onConvert={selectConvert} onOpenMenu={openMenu} />
      </div>
      <div
        className={cn('exchange-mode-layer exchange-menu-layer', menuOpen ? 'active-layer' : 'inactive-layer')}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <div
          className="exchange-card redesigned-widget exchange-menu-shell"
          data-testid="exchange-menu-shell"
        >
          <WidgetNavigationScreen closeButtonRef={menuCloseButtonRef} onClose={closeMenu} links={widgetLinks} />
        </div>
      </div>
    </div>
  );
}
