import { useI18n as useCustomerI18n, type Locale } from "@workspace/i18n";
import { formatAmountInputValue, formatDisplayAmount } from '@workspace/amount-format';
import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import {
  useGetExchangeConfig, getGetExchangeConfigQueryKey,
  useGetExchangeRoutePricing, getGetExchangeRoutePricingQueryKey,
  useListPublicManualSwapAddons, getListPublicManualSwapAddonsQueryKey,
  createExchangeQuote as requestSwapQuote,
  createExchangeQuoteByReceive as requestSwapReceiveQuote,
  useCreateExchangeOrder,
  useGetQuickexConfig, getGetQuickexConfigQueryKey,
  createQuickexQuote as requestConvertQuote,
  createQuickexQuoteByReceive as requestConvertReceiveQuote,
  useCreateQuickexOrder,
  useLinkTelegramMiniAppOrder
} from '@workspace/api-client-react';
import { useAuth, useAuthHeaders } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, CheckCircle2, AlertCircle, ChevronDown, Loader2, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/lib/hooks';
import { MiniAppLogo } from '@/components/mini-app-logo';
import { ExchangeRateSummary } from '@/components/exchange-rate-summary';
import { getFallbackPaymentLogos, getFallbackCryptoLogos, getLogoFallbackText } from '@/lib/logo-catalog';
import {
  exchangeSelectorEmptyMessage,
  filterExchangeOptions,
} from '@/lib/exchange-search';
import { createClientRequestId } from '@/lib/client-request-id';
import { runSwapQuoteRequest, SwapQuoteTimeoutError } from '@/lib/swap-quote-request';
import { createSwapQuoteTiming, type SwapQuoteTiming } from '@/lib/swap-quote-timing';
import {
  buildSettlementDetails,
  isConvertDedicatedSettlementField,
  isExchangeFieldRequired,
  isExchangeFieldVisible,
} from '@/lib/exchange-quote';
import {
  clearExchangeRecovery,
  isDefinitiveCreateRejection,
  persistExchangeRecovery,
  readExchangeRecovery,
  type ExchangeRecovery,
} from '@/lib/exchange-recovery';
import {
  clearQuotePreservingExchangeAmounts,
  findQuickexDefaultRoute,
  getCanonicalManualRoutes,
  getExchangePricingTermsKey,
  getManualRouteSourceIds,
  getManualRouteTargetIds,
  getQuickexConvertRoutes,
  parseExchangeQuoteAmount,
  quickexQuoteMatchesRoute,
  resolveExchangeRouteSelection,
} from '@/lib/exchange-routes';

const EMPTY_MANUAL_SWAP_ADDONS: any[] = [];
const exchangeRecoveryStorage = () => window.sessionStorage;

function formatFeeAmount(value: unknown): string {
  if (value === null || value === undefined) return '';
  return formatDisplayAmount(String(value));
}

function hasNonZeroFeeAmount(value: unknown): boolean {
  return value !== null && value !== undefined && !/^0*(?:\.0*)?$/.test(String(value));
}

type AddonLocale = Locale;

function getLocalizedAddonText(addon: any, _locale: AddonLocale) {
  return { title: addon?.name || "", description: addon?.description || "" };
}

function getAddonFeeLabel(addon: any): string {
  if (addon?.feeType === 'percentage') {
    return addon.percentage === null || addon.percentage === undefined
      ? 'Percentage fee'
      : `${formatFeeAmount(addon.percentage)}%`;
  }
  if (addon?.feeType === 'fixed') {
    return `${formatFeeAmount(addon.fixedAmount)} ${addon.feeCurrency || 'USD'}`;
  }
  return 'Fee details unavailable';
}

function ManualSwapFeeSummary({
  fees,
  targetAsset,
  receiveAmount,
  addons,
  locale,
}: {
  fees?: any;
  targetAsset?: string;
  receiveAmount?: string | number;
  addons?: any[];
  locale: AddonLocale;
}) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  if (!fees) return null;
  const exchangeFee = fees.exchangeFee;
  return (
    <div className="space-y-2 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{uiT("customer.m6a2adef6fa1b")}</p>
      {hasNonZeroFeeAmount(fees.existingPricingFee) && (
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-muted-foreground">{uiT("customer.ma94d19a8649e")}</span>
          <span className="font-semibold">{formatFeeAmount(fees.existingPricingFee)} {targetAsset}</span>
        </div>
      )}
      {hasNonZeroFeeAmount(exchangeFee?.totalAmount) && (
        <div className="flex items-start justify-between gap-3 text-[12px]">
          <span className="text-muted-foreground">{uiT("customer.mc84b4c4666c3")}</span>
          <span className="text-right font-semibold">
            {formatFeeAmount(exchangeFee.totalAmount)} {targetAsset}
            {exchangeFee.fixedAmount !== null && exchangeFee.fixedAmount !== undefined && (
              <span className="block text-[10px] font-medium text-muted-foreground">
                {uiT("customer.m2eeaba703e0e")}{' '}{formatFeeAmount(exchangeFee.fixedAmount)} {exchangeFee.fixedCurrency}
              </span>
            )}
          </span>
        </div>
      )}
      {(fees.selectedAddons ?? []).map((addon: any) => (
        <div key={addon.id || addon.key} className="flex items-start justify-between gap-3 text-[12px]">
          <span className="text-muted-foreground">
            {uiText(getLocalizedAddonText(
              addons?.find((item) => item.id === addon.id || item.key === addon.key) ?? addon,
              locale,
            ).title)}
          </span>
          <span className="text-right font-semibold">
            {addon.feeType === 'percentage'
              ? addon.percentage === null || addon.percentage === undefined
                ? uiT("customer.mf550b356a519")
                : `${formatFeeAmount(addon.percentage)}%`
              : `${formatFeeAmount(addon.amount)} ${addon.currency}`}
            {targetAsset && (
              <span className="block text-[10px] font-medium text-muted-foreground">
                {formatFeeAmount(addon.targetAmount)} {targetAsset} {' '}{uiT("customer.m4268172c8992")}{' '}</span>
            )}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2 text-[12px] font-bold">
        <span>{uiT("customer.m47e44854816e")}</span>
        <span>{formatFeeAmount(fees.totalFees)} {targetAsset}</span>
      </div>
      {receiveAmount !== undefined && (
        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2 text-[12px] font-bold text-primary">
          <span>{uiT("customer.m9bbf721e900b")}</span>
          <span>{formatFeeAmount(receiveAmount)} {targetAsset}</span>
        </div>
      )}
    </div>
  );
}

export default function Exchange() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const [, setLocation] = useLocation();
  const { user: authenticatedUser, isLoading: isAuthLoading } = useAuth();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const verifiedUserId = typeof authenticatedUser?.id === 'string' && authenticatedUser.id.trim()
    ? authenticatedUser.id.trim()
    : typeof authenticatedUser?.id === 'number' && Number.isSafeInteger(authenticatedUser.id)
      ? String(authenticatedUser.id)
      : null;
  const [recoveryBootstrap, setRecoveryBootstrap] = useState<{
    ownerId: string | null;
    recovery: ExchangeRecovery | null;
    error: string;
    pending: boolean;
  }>({
    ownerId: null,
    recovery: null,
    error: '',
    pending: true,
  });
  const recoveryIdentityChanged = recoveryBootstrap.ownerId !== null &&
    recoveryBootstrap.ownerId !== verifiedUserId;
  const recoveryRecord = verifiedUserId && recoveryBootstrap.ownerId === verifiedUserId && !recoveryBootstrap.error
    ? recoveryBootstrap.recovery
    : null;
  const recoveryRecordRef = useRef<ExchangeRecovery | null>(recoveryRecord);
  recoveryRecordRef.current = recoveryRecord;
  const recoveryLoadError = !isAuthLoading
    ? !verifiedUserId
      ? 'A verified server-authenticated Telegram user is required to access exchange recovery. Pending recovery data has been preserved.'
      : recoveryIdentityChanged
        ? 'The authenticated account changed during exchange recovery. The pending order was preserved; sign back into its original verified account to continue.'
        : recoveryBootstrap.ownerId === verifiedUserId
          ? recoveryBootstrap.error
          : ''
    : '';
  const recoveryBootstrapPending = isAuthLoading ||
    (!recoveryLoadError && (!verifiedUserId || recoveryBootstrap.pending || recoveryBootstrap.ownerId !== verifiedUserId));
  const quoteRequestVersionRef = useRef(0);
  const quoteRequestControllerRef = useRef<AbortController | null>(null);
  const orderRequestIdRef = useRef<string | null>(recoveryRecord?.requestId ?? null);
  if (orderRequestIdRef.current === null) orderRequestIdRef.current = createClientRequestId();

  const searchParams = new URLSearchParams(window.location.search);
  const mode = recoveryRecord?.mode ?? (searchParams.get('mode') === 'swap' ? 'swap' : 'convert');

  const setMode = (newMode: 'swap' | 'convert') => {
    if (createOutcomeUncertain) return;
    invalidateQuote();
    preserveDetailsOnNextRouteResetRef.current = false;
    haptic.selection();
    setLocation(`/exchange?mode=${newMode}`);
    setStep(1);
    setSourceId('');
    setTargetId('');
    setAmount('');
    setDesiredReceiveAmount('');
    setActiveAmountSide('send');
    setSelectedAddonKeys([]);
    setTermsAccepted(false);
    setErrorMsg('');
  };

  const [step, setStep] = useState<1 | 2 | 3>(recoveryRecord ? 3 : 1);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  const [sourceId, setSourceId] = useState<string>(recoveryRecord?.sourceId ?? '');
  const [targetId, setTargetId] = useState<string>(recoveryRecord?.targetId ?? '');
  const routeSelectionKey = JSON.stringify([mode, sourceId, targetId]);
  const [settledRouteSelectionKey, setSettledRouteSelectionKey] = useState<string | null>(null);
  const initializedSelectionModeRef = useRef<string | null>(null);
  const [amount, setAmount] = useState<string>(recoveryRecord?.amount ?? '');
  const [desiredReceiveAmount, setDesiredReceiveAmount] = useState(recoveryRecord?.desiredReceiveAmount ?? '');
  const [activeAmountSide, setActiveAmountSide] = useState<'send' | 'receive'>(recoveryRecord?.activeAmountSide ?? 'send');
  const [editingAmountSide, setEditingAmountSide] = useState<'send' | 'receive' | null>(null);
  const [rateMode, setRateMode] = useState<'FLOATING' | 'FIXED'>(recoveryRecord?.rateMode ?? 'FLOATING');
  const [termsAccepted, setTermsAccepted] = useState(Boolean(recoveryRecord));
  const [createOutcomeUncertain, setCreateOutcomeUncertain] = useState(Boolean(recoveryRecord));
  const [selectedAddonKeys, setSelectedAddonKeys] = useState<string[]>(recoveryRecord?.selectedAddonKeys ?? []);
  const [quoteData, setQuoteData] = useState<any>(recoveryRecord?.quoteData ?? null);
  const preserveDetailsOnNextRouteResetRef = useRef(false);

  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all'|'crypto'|'fiat'>('all');
  const [targetFilter, setTargetFilter] = useState<'all'|'crypto'|'fiat'>('all');

  // Form state
  const [destinationAddress, setDestinationAddress] = useState(recoveryRecord?.destinationAddress ?? '');
  const [destinationMemo, setDestinationMemo] = useState(recoveryRecord?.destinationMemo ?? '');
  const [customerEmail, setCustomerEmail] = useState(recoveryRecord?.customerEmail ?? '');
  const [settlementFields, setSettlementFields] = useState<Record<string, string>>(recoveryRecord?.settlementFields ?? {});

  useEffect(() => {
    if (isAuthLoading || !verifiedUserId) return;
    if (recoveryBootstrap.ownerId !== null && recoveryBootstrap.ownerId !== verifiedUserId) return;
    if (recoveryBootstrap.ownerId === verifiedUserId && !recoveryBootstrap.pending) return;

    try {
      const recovery = readExchangeRecovery(exchangeRecoveryStorage(), verifiedUserId);
      recoveryRecordRef.current = recovery;
      orderRequestIdRef.current = recovery?.requestId ?? orderRequestIdRef.current;
      if (recovery) {
        setStep(3);
        setSourceId(recovery.sourceId);
        setTargetId(recovery.targetId);
        setAmount(recovery.amount);
        setDesiredReceiveAmount(recovery.desiredReceiveAmount);
        setActiveAmountSide(recovery.activeAmountSide);
        setRateMode(recovery.rateMode);
        setTermsAccepted(true);
        setCreateOutcomeUncertain(true);
        setSelectedAddonKeys(recovery.selectedAddonKeys);
        setDestinationAddress(recovery.destinationAddress);
        setDestinationMemo(recovery.destinationMemo);
        setCustomerEmail(recovery.customerEmail);
        setSettlementFields(recovery.settlementFields);
        setQuoteData(recovery.quoteData);
      }
      setRecoveryBootstrap({ ownerId: verifiedUserId, recovery, error: '', pending: false });
    } catch (error) {
      setRecoveryBootstrap({
        ownerId: verifiedUserId,
        recovery: null,
        error: error instanceof Error ? error.message : 'Saved exchange recovery data could not be read.',
        pending: false,
      });
    }
  }, [isAuthLoading, verifiedUserId]);

  // Data hooks
  const { data: config, isLoading: isConfigLoading } = useGetExchangeConfig({
    query: {
      queryKey: getGetExchangeConfigQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always',
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    }
  });

  const { data: quickexConfig, isLoading: isQuickexConfigLoading } = useGetQuickexConfig({
    query: {
      queryKey: getGetQuickexConfigQueryKey(),
      staleTime: 0,
      enabled: mode === 'convert',
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always',
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    }
  });
  const manualSwapAddonsQuery = useListPublicManualSwapAddons({
    query: {
      queryKey: getListPublicManualSwapAddonsQueryKey(),
      enabled: mode === 'swap',
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always',
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });
  const manualSwapAddons = manualSwapAddonsQuery.data?.items ?? EMPTY_MANUAL_SWAP_ADDONS;
  const { locale: addonLocale } = useCustomerI18n();
  const selectedAddonKeySet = useMemo(() => new Set(selectedAddonKeys), [selectedAddonKeys]);
  const addonSelectionMode = manualSwapAddons.some((addon) => addon.selectionRule === 'multiple')
    ? 'multiple'
    : manualSwapAddons.some((addon) => addon.selectionRule === 'one')
      ? 'one'
      : 'none';
  const getAddonGroupSelectionRule = (group: string) => {
    const groupAddons = manualSwapAddons.filter((addon) => addon.presentation.group === group);
    if (groupAddons.some((addon) => addon.selectionRule === 'multiple')) return 'multiple';
    if (groupAddons.some((addon) => addon.selectionRule === 'one')) return 'one';
    return 'none';
  };

  const manualRoutes = useMemo(
    () => getCanonicalManualRoutes(
      config?.manualRouteAvailability?.routes ?? [],
      config?.manualSettlementOptions ?? [],
    ),
    [config],
  );
  const quickexRoutes = useMemo(
    () => getQuickexConvertRoutes(quickexConfig?.instruments ?? [], quickexConfig?.pairs ?? []),
    [quickexConfig],
  );
  const toConvertOption = (inst: any) => {
    const configured = config?.settlementOptions?.find(option =>
      option.kind === 'crypto-network' &&
      option.assetCode.trim().toUpperCase() === inst.currencyTitle.trim().toUpperCase() &&
      option.routeNetwork.trim().toUpperCase() === inst.networkTitle.trim().toUpperCase()
    );
    return {
      id: inst.slug,
      title: inst.fullName || inst.currencyFriendlyTitle || inst.currencyTitle,
      assetCode: inst.currencyTitle,
      routeNetwork: inst.networkTitle,
      networkTitle: inst.networkTitle,
      logoUrl: configured?.logoUrl || (inst.currencyLogoLink && !inst.currencyLogoLink.endsWith('/generic.svg') ? inst.currencyLogoLink : undefined),
      networkLogoUrl: configured?.networkLogoUrl,
      flagUrl: configured?.flagUrl,
      kind: 'crypto-network',
      searchAliases: [inst.currencyFriendlyTitle],
      executionMode: 'api',
      original: inst,
    };
  };

  const sourceOpts = useMemo(() => {
    if (mode === 'swap') {
      if (!config) return [];
      const availableSourceIds = getManualRouteSourceIds(manualRoutes);
      return (config.manualSettlementOptions || [])
        .filter(o =>
          (o.direction === 'send' || o.direction === 'both') &&
          availableSourceIds.has(o.id),
        )
        .map(o => ({
        id: o.id,
        title: o.title,
        assetCode: o.assetCode,
        routeNetwork: o.routeNetwork,
        networkTitle: o.networkTitle,
        logoUrl: o.logoUrl,
        networkLogoUrl: o.networkLogoUrl,
        flagUrl: o.flagUrl,
        kind: o.kind,
        paymentMethodId: o.paymentMethodId,
        searchAliases: o.kind === 'fiat-payment-method'
          ? []
          : [o.title, o.assetCode, o.routeNetwork, o.networkTitle, o.paymentMethodId]
            .filter((value): value is string => Boolean(value)),
        executionMode: o.executionMode,
        original: o
      }));
    } else {
      if (!quickexConfig) return [];
      const sourceIds = new Set(quickexRoutes.map(route => route.sourceId));
      const seen = new Set<string>();
      const list: any[] = [];
      quickexConfig.instruments.forEach(inst => {
        if (inst.instrumentType.toLowerCase() !== 'crypto' || !inst.currencyTitle || !inst.networkTitle) return;
        if (!sourceIds.has(inst.slug)) return;
        const key = `${inst.currencyTitle.trim().toUpperCase()}\0${inst.networkTitle.trim().toUpperCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push(toConvertOption(inst));
      });
      return list;
    }
  }, [config, manualRoutes, quickexConfig, quickexRoutes, mode]);

  const targetOpts = useMemo(() => {
    if (mode === 'swap') {
      if (!config) return [];
      if (!sourceId) return [];
      const validTargets = getManualRouteTargetIds(manualRoutes, sourceId);
      return (config.manualSettlementOptions || [])
        .filter(o => (o.direction === 'receive' || o.direction === 'both') && validTargets.has(o.id))
        .map(o => ({
          id: o.id,
          title: o.title,
          assetCode: o.assetCode,
          routeNetwork: o.routeNetwork,
          networkTitle: o.networkTitle,
          logoUrl: o.logoUrl,
          networkLogoUrl: o.networkLogoUrl,
          flagUrl: o.flagUrl,
          kind: o.kind,
          paymentMethodId: o.paymentMethodId,
          searchAliases: o.kind === 'fiat-payment-method'
            ? []
            : [o.title, o.assetCode, o.routeNetwork, o.networkTitle, o.paymentMethodId]
              .filter((value): value is string => Boolean(value)),
          executionMode: o.executionMode,
          original: o
        }));
    } else {
      if (!quickexConfig) return [];
      const targetIds = new Set(quickexRoutes
        .filter(route => route.sourceId === sourceId)
        .map(route => route.targetId));
      const seen = new Set<string>();
      const list: any[] = [];
      quickexConfig.instruments.forEach(inst => {
        if (inst.instrumentType.toLowerCase() !== 'crypto' || !inst.currencyTitle || !inst.networkTitle) return;
        if (!targetIds.has(inst.slug)) return;
        const key = `${inst.currencyTitle.trim().toUpperCase()}\0${inst.networkTitle.trim().toUpperCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push(toConvertOption(inst));
      });
      return list;
    }
  }, [config, manualRoutes, quickexConfig, quickexRoutes, mode, sourceId]);

  const filteredSourceOpts = useMemo(() => {
    return filterExchangeOptions(sourceOpts, sourceFilter, sourceSearch);
  }, [sourceOpts, sourceSearch, sourceFilter, mode]);

  const filteredTargetOpts = useMemo(() => {
    return filterExchangeOptions(targetOpts, targetFilter, targetSearch);
  }, [targetOpts, targetSearch, targetFilter, mode]);

  const routeChoices = useMemo(
    () => mode === 'swap'
      ? manualRoutes.map(route => ({
          sourceId: route.sourceSettlementOptionId,
          targetId: route.targetSettlementOptionId,
        }))
      : quickexRoutes.map(route => ({ sourceId: route.sourceId, targetId: route.targetId })),
    [manualRoutes, mode, quickexRoutes],
  );
  const preferredRoute = useMemo(() => {
    if (mode === 'swap') {
      return config?.defaultSwapPair
        ? {
            sourceId: config.defaultSwapPair.sourceSettlementOptionId,
            targetId: config.defaultSwapPair.targetSettlementOptionId,
          }
        : undefined;
    }
    const defaultRoute = findQuickexDefaultRoute(quickexRoutes, quickexConfig?.defaultConvertPair);
    return defaultRoute
      ? { sourceId: defaultRoute.sourceId, targetId: defaultRoute.targetId }
      : undefined;
  }, [config?.defaultSwapPair, mode, quickexConfig?.defaultConvertPair, quickexRoutes]);

  useEffect(() => {
    if (
      recoveryBootstrapPending ||
      recoveryLoadError ||
      recoveryRecordRef.current ||
      createOutcomeUncertain ||
      step !== 1 ||
      (mode === 'swap' ? !config : !quickexConfig)
    ) return;

    const isFirstSelectionForMode = initializedSelectionModeRef.current !== mode;
    const currentSelection = isFirstSelectionForMode ? null : { sourceId, targetId };
    const nextSelection = resolveExchangeRouteSelection(routeChoices, currentSelection, preferredRoute);
    initializedSelectionModeRef.current = mode;
    const nextSourceId = nextSelection?.sourceId ?? '';
    const nextTargetId = nextSelection?.targetId ?? '';
    if (nextSourceId !== sourceId) setSourceId(nextSourceId);
    if (nextTargetId !== targetId) setTargetId(nextTargetId);
  }, [
    config,
    quickexConfig,
    mode,
    sourceId,
    targetId,
    routeChoices,
    preferredRoute,
    recoveryBootstrapPending,
    recoveryLoadError,
    createOutcomeUncertain,
    step,
  ]);

  useEffect(() => {
    if (createOutcomeUncertain || recoveryRecordRef.current) {
      setSettledRouteSelectionKey(routeSelectionKey);
      return;
    }
    // Route changes invalidate quote-owned fields; amount edits retain entered
    // receiving details while the fresh signed quote is fetched.
    setQuoteData(null);
    setErrorMsg('');
    setTermsAccepted(false);
    orderRequestIdRef.current = createClientRequestId();
    setSettledRouteSelectionKey(routeSelectionKey);
  }, [mode, sourceId, targetId, routeSelectionKey]);

  useEffect(() => {
    if (createOutcomeUncertain || recoveryRecordRef.current) return;
    if (preserveDetailsOnNextRouteResetRef.current) {
      preserveDetailsOnNextRouteResetRef.current = false;
      return;
    }
    setDestinationAddress('');
    setDestinationMemo('');
    setSettlementFields({});
    setTermsAccepted(false);
  }, [mode, sourceId, targetId]);

  useEffect(() => {
    if (recoveryRecordRef.current || step !== 1) return;
    setQuoteData(null);
    setErrorMsg('');
  }, [selectedAddonKeys]);

  useEffect(() => {
    if (recoveryRecordRef.current || step !== 1 || mode !== 'swap') return;
    const availableKeys = new Set(manualSwapAddons.map((addon) => addon.key));
    setSelectedAddonKeys((current) => {
      const filtered = current.filter((key) => availableKeys.has(key));
      return filtered.length === current.length ? current : filtered;
    });
  }, [manualSwapAddons, mode, step]);

  const liveSourceOpt = sourceOpts.find(o => o.id === sourceId);
  const liveTargetOpt = targetOpts.find(o => o.id === targetId);
  // Step 2/3 are quote-owned snapshots. Keep presenting the exact quoted pair
  // even when a refreshed catalog no longer offers it; live options below are
  // still used to validate whether the quote may advance.
  const sourceOpt = step > 1
    ? quoteData?._sourceOptionSnapshot ?? liveSourceOpt
    : liveSourceOpt;
  const targetOpt = step > 1
    ? quoteData?._targetOptionSnapshot ?? liveTargetOpt
    : liveTargetOpt;
  const selectedRouteAvailable = Boolean(
    liveSourceOpt &&
    liveTargetOpt &&
    routeChoices.some(route => route.sourceId === sourceId && route.targetId === targetId),
  );
  const exchangeRouteReady = Boolean(
    !recoveryBootstrapPending &&
    !recoveryLoadError &&
    settledRouteSelectionKey === routeSelectionKey &&
    selectedRouteAvailable,
  );

  // Pricing (Manual Swap Only)
  const { data: pricing, isLoading: isPricingLoading } = useGetExchangeRoutePricing(
    { sourceSettlementOptionId: sourceId, targetSettlementOptionId: targetId },
    {
      request: { cache: 'no-store' },
      query: {
        enabled: mode === 'swap' && !!sourceId && !!targetId && !!liveSourceOpt && !!liveTargetOpt &&
          manualRoutes.some(route =>
            route.sourceSettlementOptionId === sourceId &&
            route.targetSettlementOptionId === targetId,
          ),
        queryKey: getGetExchangeRoutePricingQueryKey({
          sourceSettlementOptionId: sourceId,
          targetSettlementOptionId: targetId,
        }),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: 'always',
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
      },
    }
  );

  const parsedAmount = parseExchangeQuoteAmount(activeAmountSide === 'send' ? amount : desiredReceiveAmount);
  const quoteInputAmount = parsedAmount;
  const selectedRouteTermsKey = useMemo(() => {
    if (mode === 'swap') {
      return JSON.stringify({
        route: manualRoutes.find(route =>
          route.sourceSettlementOptionId === sourceId &&
          route.targetSettlementOptionId === targetId,
        ) ?? null,
        source: liveSourceOpt?.original ?? null,
        target: liveTargetOpt?.original ?? null,
      });
    }
    const route = quickexRoutes.find(item => item.sourceId === sourceId && item.targetId === targetId);
    return JSON.stringify({
      route: route?.pair ?? null,
      source: liveSourceOpt?.original ?? null,
      target: liveTargetOpt?.original ?? null,
    });
  }, [mode, manualRoutes, quickexRoutes, sourceId, targetId, liveSourceOpt, liveTargetOpt]);
  const selectedPricingTermsKey = mode === 'swap'
    ? getExchangePricingTermsKey(pricing, sourceId, targetId)
    : '';
  const selectedAddonsTermsKey = mode === 'swap'
    ? JSON.stringify(manualSwapAddons.filter(addon => selectedAddonKeySet.has(addon.key)))
    : '[]';

  useEffect(() => {
    if (recoveryRecordRef.current) return;
    setQuoteData(null);
    setErrorMsg('');
    setTermsAccepted(false);
  }, [quoteInputAmount, activeAmountSide, rateMode]);

  // Mutations
  // Keep quote errors in the session-aware mutation cache (including 401
  // expiry), while passing a request-specific signal to the existing APIs.
  const createQuote = useMutation({
    mutationKey: ['createExchangeQuote'],
    retry: false,
    mutationFn: ({ data, signal, traceId }: { data: Parameters<typeof requestSwapQuote>[0]; signal?: AbortSignal; traceId?: string }) =>
      requestSwapQuote(data, { headers: { ...headers, ...(traceId ? { 'x-development-quote-id': traceId } : {}) }, signal }),
  });
  const createReceiveQuote = useMutation({
    mutationKey: ['createExchangeQuoteByReceive'],
    retry: false,
    mutationFn: ({ data, signal, traceId }: { data: Parameters<typeof requestSwapReceiveQuote>[0]; signal?: AbortSignal; traceId?: string }) =>
      requestSwapReceiveQuote(data, { headers: { ...headers, ...(traceId ? { 'x-development-quote-id': traceId } : {}) }, signal }),
  });
  const createOrder = useCreateExchangeOrder({ request: { headers } });
  const createQuickexQuote = useMutation({
    mutationKey: ['createQuickexQuote'],
    retry: false,
    mutationFn: ({ data, signal }: { data: Parameters<typeof requestConvertQuote>[0]; signal: AbortSignal }) =>
      requestConvertQuote(data, { headers, signal }),
  });
  const createQuickexReceiveQuote = useMutation({
    mutationKey: ['createQuickexQuoteByReceive'],
    retry: false,
    mutationFn: ({ data, signal }: { data: Parameters<typeof requestConvertReceiveQuote>[0]; signal: AbortSignal }) =>
      requestConvertReceiveQuote(data, { headers, signal }),
  });
  const createQuickexOrder = useCreateQuickexOrder({ request: { headers } });
  const linkOrder = useLinkTelegramMiniAppOrder({ request: { headers } });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isQuoteProcessing, setIsQuoteProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [quoteNow, setQuoteNow] = useState(() => Date.now());
  const [quoteRefreshNonce, setQuoteRefreshNonce] = useState(0);
  const swapQuoteInputAtRef = useRef<number | undefined>(undefined);
  const swapQuoteTimingRef = useRef<SwapQuoteTiming | null>(null);
  const swapQuotePaintRef = useRef<{ quoteId: string; timing: SwapQuoteTiming } | null>(null);
  // Fence at the input event, not just effect cleanup: a completed older
  // request must never write amounts between a new edit and React's next effect.
  const invalidateQuote = () => {
    swapQuoteTimingRef.current?.finish('aborted');
    swapQuoteTimingRef.current = null;
    swapQuotePaintRef.current = null;
    swapQuoteInputAtRef.current = undefined;
    quoteRequestVersionRef.current++;
    quoteRequestControllerRef.current?.abort();
    quoteRequestControllerRef.current = null;
    setQuoteData(null);
    setTermsAccepted(false);
    setIsQuoteProcessing(false);
    setErrorMsg('');
  };
  const editAmount = (side: 'send' | 'receive', value: string) => {
    if (side !== activeAmountSide || parseExchangeQuoteAmount(value) !== quoteInputAmount) {
      invalidateQuote();
      if (mode === 'swap') swapQuoteInputAtRef.current = performance.now();
    }
    setActiveAmountSide(side);
    if (side === 'send') setAmount(value);
    else setDesiredReceiveAmount(value);
  };
  useEffect(() => {
    if (createOutcomeUncertain || recoveryRecordRef.current || step !== 1) return;
    const refreshedState = clearQuotePreservingExchangeAmounts({
      amount,
      desiredReceiveAmount,
      activeAmountSide,
    });
    setAmount(refreshedState.amount);
    setDesiredReceiveAmount(refreshedState.desiredReceiveAmount);
    setActiveAmountSide(refreshedState.activeAmountSide);
    setQuoteData(null);
    setErrorMsg('');
    setTermsAccepted(false);
  }, [
    selectedRouteTermsKey,
    selectedPricingTermsKey,
    selectedAddonsTermsKey,
    step,
    createOutcomeUncertain,
  ]);
  const saveRecovery = (recovery: ExchangeRecovery) => {
    if (!verifiedUserId) throw new Error('A verified Telegram user is required to save exchange recovery safely.');
    persistExchangeRecovery(exchangeRecoveryStorage(), recovery, verifiedUserId);
    recoveryRecordRef.current = recovery;
    setRecoveryBootstrap({ ownerId: verifiedUserId, recovery, error: '', pending: false });
    setCreateOutcomeUncertain(true);
  };
  const removeRecovery = () => {
    if (!verifiedUserId) throw new Error('The verified Telegram user is unavailable; saved recovery was preserved.');
    clearExchangeRecovery(exchangeRecoveryStorage(), verifiedUserId);
    recoveryRecordRef.current = null;
    setRecoveryBootstrap({ ownerId: verifiedUserId, recovery: null, error: '', pending: false });
    setCreateOutcomeUncertain(false);
  };
  const convertFieldValues: Record<string, string> = {
    ...settlementFields,
    destinationAddress,
    destinationMemo,
  };
  const convertDestinationMemoField = (quoteData?.requiredSettlementFields ?? [])
    .find((field: any) => field.key === 'destinationMemo' && isExchangeFieldVisible(field, convertFieldValues));
  const convertSettlementDetails = () => buildSettlementDetails(quoteData?.requiredSettlementFields ?? [], convertFieldValues);
  const quoteExpired = Boolean(
    quoteData?.expiresAt && new Date(quoteData.expiresAt).getTime() <= quoteNow,
  );

  useEffect(() => {
    if (!quoteData?.expiresAt) return undefined;
    const timer = window.setInterval(() => setQuoteNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quoteData?.expiresAt]);

  useEffect(() => {
    const paint = swapQuotePaintRef.current;
    if (!paint || paint.quoteId !== quoteData?.quoteId) return;
    // The effect observes the committed controlled input. Two frames allow
    // the browser to paint it; aborted/obsolete results never count as rendered.
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        if (swapQuotePaintRef.current !== paint || swapQuoteTimingRef.current !== paint.timing) return;
        paint.timing.rendered();
        swapQuoteInputAtRef.current = undefined;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
    };
  }, [quoteData?.quoteId]);

  useEffect(() => {
    const requestVersion = ++quoteRequestVersionRef.current;
    if (exchangeRouteReady && !recoveryBootstrapPending && !recoveryLoadError &&
      step === 1 && sourceOpt && targetOpt && Number.isFinite(quoteInputAmount) && quoteInputAmount > 0 &&
      !(mode === 'swap' && manualSwapAddonsQuery.isError)) {
      const controller = new AbortController();
      const timing = mode === 'swap' ? createSwapQuoteTiming(swapQuoteInputAtRef.current) : null;
      swapQuoteTimingRef.current = timing;
      quoteRequestControllerRef.current = controller;
      setIsQuoteProcessing(true);
      const timer = setTimeout(async () => {
        if (quoteRequestVersionRef.current !== requestVersion || controller?.signal.aborted) return;
        setIsQuoteProcessing(true);
        timing?.requestStarted();
        try {
          const quote = await runSwapQuoteRequest(controller, signal => mode === 'swap'
            ? activeAmountSide === 'receive'
              ? createReceiveQuote.mutateAsync({ data: {
                  fromAsset: sourceOpt.assetCode,
                  fromNetwork: sourceOpt.routeNetwork,
                  toAsset: targetOpt.assetCode,
                  toNetwork: targetOpt.routeNetwork,
                  sourceSettlementOptionId: sourceOpt.id,
                  targetSettlementOptionId: targetOpt.id,
                  desiredReceiveAmount: quoteInputAmount,
                  selectedAddOnKeys: selectedAddonKeys,
                }, signal, traceId: timing?.traceId })
              : createQuote.mutateAsync({ data: {
                  type: 'manual',
                  fromAsset: sourceOpt.assetCode,
                  fromNetwork: sourceOpt.routeNetwork,
                  toAsset: targetOpt.assetCode,
                  toNetwork: targetOpt.routeNetwork,
                  amount: quoteInputAmount,
                  sourceSettlementOptionId: sourceOpt.id,
                  targetSettlementOptionId: targetOpt.id,
                  selectedAddOnKeys: selectedAddonKeys,
                }, signal, traceId: timing?.traceId })
            : activeAmountSide === 'receive'
              ? createQuickexReceiveQuote.mutateAsync({
                  data: {
                    fromAsset: sourceOpt.assetCode,
                    fromNetwork: sourceOpt.routeNetwork,
                    toAsset: targetOpt.assetCode,
                    toNetwork: targetOpt.routeNetwork,
                    desiredReceiveAmount: quoteInputAmount,
                    rateMode,
                  },
                  signal,
                })
              : createQuickexQuote.mutateAsync({
                  data: {
                    type: 'instant',
                    fromAsset: sourceOpt.assetCode,
                    fromNetwork: sourceOpt.routeNetwork,
                    toAsset: targetOpt.assetCode,
                    toNetwork: targetOpt.routeNetwork,
                    amount: quoteInputAmount,
                    rateMode,
                  },
                  signal,
                }));
          if (quoteRequestVersionRef.current !== requestVersion || controller?.signal.aborted) return;
          timing?.responseReceived();
          timing?.stateQueued();
          if (timing) swapQuotePaintRef.current = { quoteId: quote.quoteId, timing };
          setQuoteData({
            ...quote,
            type: mode === 'swap' ? 'manual' : 'instant',
            _selectedAddOnKeys: [...selectedAddonKeys],
            _selectedAddOnSnapshots: mode === 'swap'
              ? manualSwapAddons.filter((addon) => selectedAddonKeySet.has(addon.key))
              : [],
            _sourceOptionSnapshot: sourceOpt,
            _targetOptionSnapshot: targetOpt,
            _amountSide: activeAmountSide,
            _requestedAmount: quoteInputAmount,
            _rateMode: rateMode,
            _routeTermsKey: selectedRouteTermsKey,
            _pricingTermsKey: selectedPricingTermsKey,
            _addonsTermsKey: selectedAddonsTermsKey,
          });
          setAmount(String(quote.amount));
          if (activeAmountSide === 'send') setDesiredReceiveAmount(String(quote.receiveAmount));
          setQuoteNow(Date.now());
          setErrorMsg('');
        } catch (err: any) {
          if (quoteRequestVersionRef.current !== requestVersion ||
              (controller?.signal.aborted && !(err instanceof SwapQuoteTimeoutError))) return;
          timing?.responseReceived();
          timing?.finish('error');
          setErrorMsg(err.message || 'Failed to get quote');
          setQuoteData(null);
        } finally {
          if (quoteRequestVersionRef.current === requestVersion) {
            setIsQuoteProcessing(false);
          }
          if (quoteRequestControllerRef.current === controller) quoteRequestControllerRef.current = null;
        }
      }, mode === 'swap' ? 200 : 450);
      return () => {
        timing?.finish('aborted');
        clearTimeout(timer);
        controller?.abort();
        if (quoteRequestVersionRef.current === requestVersion) {
          quoteRequestVersionRef.current++;
        }
        if (quoteRequestControllerRef.current === controller) quoteRequestControllerRef.current = null;
      };
    } else {
      setIsQuoteProcessing(false);
    }
    if (
      mode === 'swap' && manualSwapAddonsQuery.isError
    ) setErrorMsg('Optional add-ons could not be loaded. Retry before continuing.');
    return undefined;
  }, [
    mode,
    step,
    sourceId,
    targetId,
    quoteInputAmount,
    activeAmountSide,
    // Route/input/configuration identity is serialized below. Option object
    // identity can change during harmless catalog refreshes; it is not a new
    // quote request and must not abort a pending canonical reverse quote.
    quoteRefreshNonce,
    selectedAddonKeys,
    selectedRouteTermsKey,
    selectedPricingTermsKey,
    selectedAddonsTermsKey,
    rateMode,
    manualSwapAddonsQuery.isError,
    recoveryBootstrapPending,
    recoveryLoadError,
    exchangeRouteReady,
  ]);

  const toggleAddon = (key: string) => {
    const addon = manualSwapAddons.find((item) => item.key === key);
    if (!addon || addon.selectionRule === 'none') return;
    invalidateQuote();
    setSelectedAddonKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (getAddonGroupSelectionRule(addon.presentation.group) === 'one') {
        const groupKeys = manualSwapAddons
          .filter((item) => item.presentation.group === addon.presentation.group)
          .map((item) => item.key);
        return [...current.filter((item) => !groupKeys.includes(item)), key];
      }
      return [...current, key];
    });
    setErrorMsg('');
  };

  const quoteMatchesCurrentSelection = Boolean(
    quoteData &&
    selectedRouteAvailable &&
    quoteData._selectedAddOnKeys?.length === selectedAddonKeys.length &&
    selectedAddonKeys.every((key) => quoteData._selectedAddOnKeys.includes(key)) &&
    (activeAmountSide === 'send' ? quoteData.amount === parsedAmount : quoteData._requestedAmount === quoteInputAmount) &&
    quoteData.fromAsset === liveSourceOpt?.assetCode &&
    quoteData.fromNetwork === liveSourceOpt?.routeNetwork &&
    quoteData.toAsset === liveTargetOpt?.assetCode &&
    quoteData.toNetwork === liveTargetOpt?.routeNetwork &&
    quoteData.sourceSettlementOptionId === liveSourceOpt?.id &&
    quoteData.targetSettlementOptionId === liveTargetOpt?.id &&
    quoteData._amountSide === activeAmountSide &&
    quoteData._requestedAmount === quoteInputAmount &&
    quoteData._rateMode === rateMode &&
    quoteData._routeTermsKey === selectedRouteTermsKey &&
    quoteData._pricingTermsKey === selectedPricingTermsKey &&
    quoteData._addonsTermsKey === selectedAddonsTermsKey
  );
  const convertQuoteMatchesCurrentSelection = Boolean(
    quoteData &&
    quoteData.type === 'instant' &&
    selectedRouteAvailable &&
    quickexQuoteMatchesRoute(quoteData, liveSourceOpt, liveTargetOpt) &&
    quoteData._amountSide === activeAmountSide &&
    quoteData._requestedAmount === quoteInputAmount &&
    quoteData._rateMode === rateMode &&
    quoteData._routeTermsKey === selectedRouteTermsKey &&
    Number(quoteData.amount) > 0 &&
    Number(quoteData.receiveAmount) > 0 &&
    (activeAmountSide !== 'receive' || Number(quoteData.receiveAmount) === quoteInputAmount)
  );
  const selectedServerPricing = mode === 'swap' &&
    pricing?.sourceSettlementOptionId === sourceId &&
    pricing?.targetSettlementOptionId === targetId
    ? pricing
    : undefined;
  const authoritativeExchangeRate = mode === 'swap'
    ? quoteMatchesCurrentSelection
      ? quoteData?.rate
      : selectedServerPricing?.rate
    : convertQuoteMatchesCurrentSelection
      ? quoteData?.rate
      : undefined;
  const quoteMatchesCurrentSelectionForMode = mode === 'swap'
    ? quoteMatchesCurrentSelection
    : convertQuoteMatchesCurrentSelection;

  const returnToExchangeStep = () => {
    if (!selectedRouteAvailable) preserveDetailsOnNextRouteResetRef.current = true;
    setQuoteData(null);
    setErrorMsg('');
    setTermsAccepted(false);
    setStep(1);
    setQuoteRefreshNonce((nonce) => nonce + 1);
  };

  const handleContinue = async () => {
    if (step === 1) {
      if (!sourceOpt || !targetOpt) {
        setErrorMsg('Please select both source and target assets');
        return;
      }
      if (parsedAmount <= 0) return;

      if (mode === 'convert' && (!convertQuoteMatchesCurrentSelection || quoteExpired)) {
        setErrorMsg(quoteExpired ? 'Quote expired' : 'Waiting for a quote for your current selection...');
        return;
      }
      if (mode === 'swap' && (!quoteMatchesCurrentSelection || (quoteExpired && !createOutcomeUncertain))) {
        setErrorMsg(quoteExpired ? 'Quote expired. Refresh the quote before continuing.' : 'Waiting for a quote for your current selection...');
        return;
      }
      const limitAmount = activeAmountSide === 'send' ? parsedAmount : Number(quoteData?.amount);
      const minAmount = mode === 'swap' ? quoteData?.minAmount ?? pricing?.minAmount : quoteData?.minAmount;
      const maxAmount = mode === 'swap' ? quoteData?.maxAmount ?? pricing?.maxAmount : quoteData?.maxAmount;

      if (minAmount !== null && minAmount !== undefined && limitAmount < minAmount) {
        setErrorMsg(`Minimum amount is ${formatDisplayAmount(minAmount)}`);
        haptic.notification('error');
        return;
      }
      if (maxAmount !== null && maxAmount !== undefined && limitAmount > maxAmount) {
        setErrorMsg(`Maximum amount is ${formatDisplayAmount(maxAmount)}`);
        haptic.notification('error');
        return;
      }

      setErrorMsg('');
      haptic.impact('medium');
      setStep(2);
    } else if (step === 2) {
      if (mode === 'swap' && (!quoteMatchesCurrentSelection || quoteExpired)) {
        setErrorMsg(quoteExpired
          ? 'Quote expired. Refresh the quote before continuing.'
          : 'The selected Swap route, pricing, or add-ons changed. Return to Swap to review the current route and get an updated quote.');
        return;
      }
      if (mode === 'convert' && (!convertQuoteMatchesCurrentSelection || quoteExpired)) {
        setErrorMsg(quoteExpired
          ? 'Quote expired. Refresh the quote before continuing.'
          : 'The Convert route or quote changed. Return to Convert to review the current route and get an updated quote.');
        return;
      }
      if (!sourceOpt || !targetOpt) {
        setErrorMsg('The quoted route details are unavailable. Return to the exchange step and get a fresh quote.');
        return;
      }
      // Validate fields
      if (targetOpt.kind === 'crypto-network' && !destinationAddress.trim()) {
        setErrorMsg('Destination address is required');
        haptic.notification('warning');
        return;
      }
      if (targetOpt.kind === 'crypto-network' && targetOpt.original.requiresMemo && !destinationMemo.trim()) {
        setErrorMsg('Destination memo is required');
        haptic.notification('warning');
        return;
      }
      if (mode === 'convert') {
        if (!destinationAddress.trim()) {
          setErrorMsg('Destination address is required');
          haptic.notification('warning');
          return;
        }
        if (targetOpt.original.requiresMemo && !destinationMemo.trim()) {
          setErrorMsg('Destination memo is required');
          haptic.notification('warning');
          return;
        }
        for (const field of quoteData?.requiredSettlementFields ?? []) {
          const visible = isExchangeFieldVisible(field, convertFieldValues);
          if (visible && isExchangeFieldRequired(field) && !convertFieldValues[field.key]?.trim()) {
            setErrorMsg(`${field.label} is required`);
            haptic.notification('warning');
            return;
          }
        }
      } else {
        if (quoteData?.requiredSettlementFields) {
          for (const field of quoteData.requiredSettlementFields) {
            const isVisible = isExchangeFieldVisible(field, settlementFields);
            if (isVisible && isExchangeFieldRequired(field) && !settlementFields[field.key]?.trim()) {
              setErrorMsg(`${field.label} is required`);
              haptic.notification('warning');
              return;
            }
          }
        }
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail.trim())) {
        setErrorMsg('Enter a valid customer email');
        haptic.notification('warning');
        return;
      }

      setErrorMsg('');
      haptic.impact('medium');
      setStep(3);
    } else if (step === 3) {
      const existingRecovery = recoveryRecordRef.current;
      if (existingRecovery && existingRecovery.mode !== mode) {
        setErrorMsg('The pending order request cannot be replaced. Retry its unchanged recovery action.');
        return;
      }
      if (!existingRecovery && mode === 'swap' && (!quoteMatchesCurrentSelection || quoteExpired)) {
        setErrorMsg(quoteExpired
          ? 'Quote expired. Refresh the quote before submitting.'
          : 'The live Swap route, pricing, or selected add-ons changed. Return to Swap to review the current route and get a fresh quote.');
        haptic.notification('error');
        return;
      }
      if (!existingRecovery && mode === 'convert' && (!convertQuoteMatchesCurrentSelection || quoteExpired)) {
        setErrorMsg(quoteExpired
          ? 'Quote expired. Refresh the quote before submitting.'
          : 'The live Convert route no longer matches this quote. Return to Convert to review the current route and get a fresh quote.');
        haptic.notification('error');
        return;
      }
      if (!existingRecovery && (!sourceOpt || !targetOpt)) {
        setErrorMsg('The quoted route details are unavailable. Return to the exchange step and get a fresh quote.');
        return;
      }
      if (!existingRecovery && !termsAccepted) {
        setErrorMsg('Accept the Terms & Conditions and AML / KYC policy before placing your order.');
        haptic.notification('warning');
        return;
      }

      setIsProcessing(true);
      let createRequestInFlight = false;
      try {
        let order = existingRecovery?.phase === 'link-pending'
          ? existingRecovery.order
          : undefined;
        let recovery = existingRecovery;

        if (!order) {
          let data: Record<string, unknown>;
          if (existingRecovery) {
            data = existingRecovery.data;
          } else if (mode === 'convert') {
            if (!quoteData?.quoteId || !quoteData?.fromAsset || !quoteData?.fromNetwork ||
              !quoteData?.toAsset || !quoteData?.toNetwork || !quoteData?.amount) {
              throw new Error('The current Convert quote is incomplete. Refresh the quote and try again.');
            }
            data = {
              type: 'instant',
              fromAsset: quoteData.fromAsset,
              fromNetwork: quoteData.fromNetwork,
              toAsset: quoteData.toAsset,
              toNetwork: quoteData.toNetwork,
              amount: quoteData.amount,
              customerEmail: customerEmail.trim(),
              quoteId: quoteData.quoteId,
              rateMode,
              destinationAddress: destinationAddress.trim(),
              destinationMemo: destinationMemo.trim() || undefined,
              ...(quoteData.requiredSettlementFields?.length
                ? { settlementDetails: convertSettlementDetails() }
                : {}),
              clientRequestId: orderRequestIdRef.current!,
            };
          } else {
            const swapSettlementDetails = buildSettlementDetails(
              quoteData?.requiredSettlementFields ?? [],
              settlementFields,
            );
            data = {
              type: 'manual',
              fromAsset: sourceOpt!.assetCode,
              fromNetwork: sourceOpt!.routeNetwork,
              toAsset: targetOpt!.assetCode,
              toNetwork: targetOpt!.routeNetwork,
              amount: quoteData.amount,
              quoteId: quoteData.quoteId,
              clientRequestId: orderRequestIdRef.current!,
              selectedAddOnKeys: selectedAddonKeys,
              customerEmail: customerEmail.trim(),
              destinationAddress: destinationAddress.trim() || undefined,
              destinationMemo: targetOpt!.kind === 'crypto-network' ? destinationMemo.trim() || undefined : undefined,
              settlementDetails: Object.keys(swapSettlementDetails).length > 0 ? swapSettlementDetails : undefined,
              sourceSettlementOptionId: sourceOpt!.id,
              targetSettlementOptionId: targetOpt!.id,
            };
          }

          recovery = existingRecovery ?? {
            version: 1,
            phase: 'create-pending',
            mode,
            requestId: orderRequestIdRef.current!,
            data,
            sourceId,
            targetId,
            amount,
            desiredReceiveAmount,
            activeAmountSide,
            rateMode,
            quoteData,
            selectedAddonKeys,
            destinationAddress,
            destinationMemo,
            customerEmail,
            settlementFields,
          };
          if (!existingRecovery) saveRecovery(recovery);
          createRequestInFlight = true;
          order = mode === 'convert'
            ? await createQuickexOrder.mutateAsync({ data: recovery.data as any })
            : await createOrder.mutateAsync({ data: recovery.data as any });
          createRequestInFlight = false;
          recovery = {
            ...recovery,
            phase: 'link-pending',
            order: { id: order.id, trackingToken: order.trackingToken },
          };
          saveRecovery(recovery);
        }

        haptic.notification('success');

        await linkOrder.mutateAsync({
          data: {
            orderId: order!.id,
            trackingToken: order!.trackingToken,
            orderKind: mode === 'convert' ? 'convert' : 'manual',
          },
        });

        removeRecovery();
        setLocation(`/orders/${order!.id}`);
      } catch (err: any) {
        if (createRequestInFlight && isDefinitiveCreateRejection(err)) {
          removeRecovery();
          orderRequestIdRef.current = createClientRequestId();
        }
        setErrorMsg(err.message || 'Failed to place order');
        haptic.notification('error');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleSwapAssets = () => {
    if (createOutcomeUncertain) return;
    if (sourceId !== targetId) invalidateQuote();
    haptic.impact('light');
    setSourceId(targetId);
    setTargetId(sourceId);
  };

  if (recoveryLoadError) {
    return (
      <div className="mx-auto max-w-md p-4 pt-8">
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {uiText(recoveryLoadError)}
        </p>
      </div>
    );
  }

  if (
    recoveryBootstrapPending ||
    (mode === 'swap' && isConfigLoading) ||
    (mode === 'convert' && isQuickexConfigLoading)
  ) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <Loader2 className="w-8 h-8 text-primary animate-spin relative z-10" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn(
        "qx-page-main qx-exchange-widget flex flex-col p-4 space-y-4 pt-6 max-w-md mx-auto w-full relative animate-in slide-in-from-bottom-4 duration-500",
      )}>


      {uiText(step === 1 && (
        <div className="qx-exchange-tabs flex bg-muted/50 p-1 rounded-2xl mb-2 backdrop-blur-md border border-white/5 relative z-10">
          <button
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
              mode === 'swap' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode('swap')}
            disabled={createOutcomeUncertain}
          >
            {uiT("customer.m6ec282d40a8a")}{' '}</button>
          <button
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
              mode === 'convert' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode('convert')}
            disabled={createOutcomeUncertain}
          >
            {uiT("customer.m5cd425f518c2")}{' '}</button>
        </div>
      ))}

      <div className="flex items-center justify-between mb-2 mt-2">
        <h1 className="qx-exchange-heading text-[22px] font-bold tracking-tight">
          {uiText(step === 1 ? (mode === 'convert' ? uiT("customer.m5cd425f518c2") : uiT("customer.m6ec282d40a8a")) : step === 2 ? uiT("customer.m45989de49fb7") : uiT("customer.maff0766a5290"))}
        </h1>
        {uiText(step > 1 && (
          <button
            onClick={() => {
              if (createOutcomeUncertain) return;
            if (step === 2 && !selectedRouteAvailable) {
              preserveDetailsOnNextRouteResetRef.current = true;
            }
              setStep((s) => s - 1 as any);
              haptic.selection();
            }}
            className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1 bg-white/5 rounded-full"
            disabled={createOutcomeUncertain}
          >
            {uiT("customer.m76900f1bfd16")}{' '}</button>
        ))}
      </div>

      {errorMsg && (
        <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive p-3.5 rounded-2xl flex items-start text-sm animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-[18px] h-[18px] mt-[1px] mr-2 shrink-0 opacity-80" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-medium leading-tight">{uiText(errorMsg)}</p>
            {step === 1 && mode === 'convert' && exchangeRouteReady &&
              parsedAmount > 0 && !isQuoteProcessing && !createOutcomeUncertain && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    invalidateQuote();
                    setQuoteRefreshNonce((nonce) => nonce + 1);
                  }}
                >
                  {uiT("customer.m9dfe841c4110")}{' '}</Button>
              )}
          </div>
        </div>
      )}
      {uiText(quoteExpired && !createOutcomeUncertain && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-semibold">{uiT("customer.m0d17dd31932f")}</p>
              <p className="text-xs leading-relaxed">{uiT("customer.m294e87ea30a1")}</p>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl border-amber-500/40 text-xs font-bold"
                onClick={() => {
                  returnToExchangeStep();
                }}
              >
                {uiT("customer.m0acd5b8550cc")}{' '}</Button>
            </div>
          </div>
        </div>
      ))}
      {uiText(step > 1 && quoteData && !recoveryRecordRef.current && !quoteMatchesCurrentSelectionForMode && (
        <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-semibold">{uiT("customer.mda268e02eeae")}</p>
              <p className="text-xs leading-relaxed">{uiT("customer.m05ca6fe9b997")}</p>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl border-amber-500/40 text-xs font-bold"
                onClick={returnToExchangeStep}
              >
                {uiT("customer.m3a34aab083d2")}{' '}</Button>
            </div>
          </div>
        </div>
      ))}

      {step === 1 && (
        <div className={cn("space-y-2 relative", mode === 'swap' && 'qx-swap-amounts')}>
          {uiText(mode === 'convert' && (
            <div className="flex rounded-xl border border-border/60 bg-muted/40 p-1" role="group" aria-label={uiT("customer.mbd71870a83b6")}>
              {(['FLOATING', 'FIXED'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={rateMode === option}
                  disabled={!exchangeRouteReady || createOutcomeUncertain}
                  onClick={() => setRateMode(option)}
                  className={cn(
                    'flex-1 rounded-lg py-2 text-xs font-bold transition-colors',
                    rateMode === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                  data-testid={`convert-rate-${option.toLowerCase()}`}
                >
                  {option === 'FIXED' ? uiT("customer.m143b16eb2984") : uiT("customer.m430be4ed7cb4")}
                </button>
              ))}
            </div>
          ))}
          <div className="premium-card qx-swap-amount-card p-5 space-y-4">
            <div className="flex justify-between text-[13px] text-muted-foreground font-semibold uppercase tracking-wider">
              <span>{uiT("customer.md9329f18a2ae")}</span>
            </div>
            <div className="qx-swap-amount-row flex items-center justify-between gap-4">
              <input
                data-testid="input-send-amount"
                aria-label={uiT("customer.m59ce39c2257b")}
                type="text"
                inputMode="decimal"
                value={formatAmountInputValue(amount, editingAmountSide === 'send')}
                onFocus={() => setEditingAmountSide('send')}
                onBlur={() => setEditingAmountSide(null)}
                disabled={!exchangeRouteReady || createOutcomeUncertain}
                onChange={(e) => editAmount('send', e.target.value)}
                className="qx-exchange-amount bg-transparent font-bold w-full outline-none focus:ring-0 appearance-none placeholder:text-muted/50 tracking-tighter"
                placeholder="0"
              />
              <button
                data-testid="source-selector-trigger"
                aria-label={uiT("customer.m1d7cbda7ea24")}
                disabled={createOutcomeUncertain}
                onClick={() => setShowSourceSelector(true)}
                className="qx-asset-trigger flex min-w-0 max-w-[48%] items-center gap-2 bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 transition-all px-2.5 py-2 rounded-2xl shrink-0 active:scale-95"
              >
                <MiniAppLogo
                  src={sourceOpt?.logoUrl}
                  fallbackSrcs={sourceOpt?.kind === 'payment-method' || sourceOpt?.kind === 'fiat-payment-method' ? getFallbackPaymentLogos(sourceOpt?.title, sourceOpt?.paymentMethodId || sourceOpt?.id) : getFallbackCryptoLogos(sourceOpt?.assetCode)}
                  badgeSrc={sourceOpt?.kind === 'crypto-network' ? sourceOpt?.networkLogoUrl : sourceOpt?.flagUrl}
                  badgeVariant={sourceOpt?.kind === 'crypto-network' ? 'network' : 'flag'}
                  network={sourceOpt?.routeNetwork}
                  variant={sourceOpt?.kind === 'payment-method' || sourceOpt?.kind === 'fiat-payment-method' ? 'payment' : 'asset'}
                  fallback={getLogoFallbackText(sourceOpt?.kind, sourceOpt?.title, sourceOpt?.assetCode)}
                  alt={uiText(sourceOpt?.title)}
                  size="normal"
                  className="shrink-0"
                />
                <span className="qx-asset-copy flex min-w-0 flex-1 flex-col items-start leading-tight">
                  <span className="qx-asset-primary max-w-full truncate text-left text-[13px] font-bold">
                    {uiText(sourceOpt?.kind === 'payment-method' || sourceOpt?.kind === 'fiat-payment-method'
                      ? sourceOpt.title
                      : sourceOpt?.assetCode || uiT("customer.m2a78025de6aa"))}
                  </span>
                  <span className="qx-asset-secondary max-w-full truncate text-left text-[10px] font-medium text-muted-foreground">
                    {uiText(sourceOpt?.kind === 'crypto-network'
                      ? sourceOpt.routeNetwork
                      : sourceOpt?.kind === 'payment-method' || sourceOpt?.kind === 'fiat-payment-method'
                        ? sourceOpt.assetCode
                        : sourceOpt?.title)}
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 text-secondary/70 stroke-[3px]" />
              </button>
            </div>

          </div>

          <div className="flex justify-center -my-[18px] relative z-20">
            <button
              onClick={handleSwapAssets}
              disabled={createOutcomeUncertain}
              className="w-12 h-12 rounded-full bg-card border-[4px] border-background flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all shadow-lg active:scale-90"
            >
              <ArrowDownUp className="w-5 h-5 stroke-[2.5px]" />
            </button>
          </div>

          <div className="premium-card qx-swap-amount-card p-5 space-y-4">
            <div className="flex justify-between text-[13px] text-muted-foreground font-semibold uppercase tracking-wider">
              <span>{uiT("customer.m8f3cfce06ac5")}</span>
              {uiText(isPricingLoading && <span className="animate-pulse text-primary">{uiT("customer.mef71e1114ca3")}</span>)}
            </div>
            <div className="qx-swap-amount-row flex items-center justify-between gap-4">
              <input
                data-testid="input-receive-amount"
                aria-label={uiT("customer.m5fc013f5c6f4")}
                type="text"
                inputMode="decimal"
                value={formatAmountInputValue(desiredReceiveAmount, editingAmountSide === 'receive')}
                onFocus={() => setEditingAmountSide('receive')}
                onBlur={() => setEditingAmountSide(null)}
                onChange={(e) => editAmount('receive', e.target.value)}
                disabled={!exchangeRouteReady || createOutcomeUncertain}
                className="qx-exchange-amount bg-transparent font-bold w-full outline-none focus:ring-0 appearance-none text-foreground/80 tracking-tighter truncate"
                placeholder="0"
              />
              <button
                data-testid="target-selector-trigger"
                aria-label={uiT("customer.m8c76c14c88c3")}
                disabled={createOutcomeUncertain}
                onClick={() => setShowTargetSelector(true)}
                className="qx-asset-trigger flex min-w-0 max-w-[48%] items-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all px-2.5 py-2 rounded-2xl shrink-0 active:scale-95"
              >
                <MiniAppLogo
                  src={targetOpt?.logoUrl}
                  fallbackSrcs={targetOpt?.kind === 'payment-method' || targetOpt?.kind === 'fiat-payment-method' ? getFallbackPaymentLogos(targetOpt?.title, targetOpt?.paymentMethodId || targetOpt?.id) : getFallbackCryptoLogos(targetOpt?.assetCode)}
                  badgeSrc={targetOpt?.kind === 'crypto-network' ? targetOpt?.networkLogoUrl : targetOpt?.flagUrl}
                  badgeVariant={targetOpt?.kind === 'crypto-network' ? 'network' : 'flag'}
                  network={targetOpt?.routeNetwork}
                  variant={targetOpt?.kind === 'payment-method' || targetOpt?.kind === 'fiat-payment-method' ? 'payment' : 'asset'}
                  fallback={getLogoFallbackText(targetOpt?.kind, targetOpt?.title, targetOpt?.assetCode)}
                  alt={uiText(targetOpt?.title)}
                  size="normal"
                  className="shrink-0"
                />
                <span className="qx-asset-copy flex min-w-0 flex-1 flex-col items-start leading-tight">
                  <span className="qx-asset-primary max-w-full truncate text-left text-[13px] font-bold">
                    {uiText(targetOpt?.kind === 'payment-method' || targetOpt?.kind === 'fiat-payment-method'
                      ? targetOpt.title
                      : targetOpt?.assetCode || uiT("customer.m2a78025de6aa"))}
                  </span>
                  <span className="qx-asset-secondary max-w-full truncate text-left text-[10px] font-medium text-muted-foreground">
                    {uiText(targetOpt?.kind === 'crypto-network'
                      ? targetOpt.routeNetwork
                      : targetOpt?.kind === 'payment-method' || targetOpt?.kind === 'fiat-payment-method'
                        ? targetOpt.assetCode
                        : targetOpt?.title)}
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 text-primary/70 stroke-[3px]" />
              </button>
            </div>

          </div>

          <ExchangeRateSummary
            mode={mode}
            sourceAsset={sourceOpt?.assetCode}
            targetAsset={targetOpt?.assetCode}
            rate={quoteExpired && parsedAmount > 0 ? null : authoritativeExchangeRate}
            loading={!errorMsg && (isQuoteProcessing ||
              (mode === 'swap' && isPricingLoading && !quoteMatchesCurrentSelection))}
            error={Boolean(errorMsg)}
            unavailable={quoteExpired && parsedAmount > 0}
          />

          {uiText(mode === 'swap' && (
            <div className="premium-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[13px] font-bold">{uiT("customer.mfbab18e6e913")}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {addonSelectionMode === 'none'
                      ? uiT("customer.m12cd0a875132")
                      : uiT("customer.me22ae8f538cd")}
                  </p>
                </div>
                {selectedAddonKeys.length > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
                    {uiText(selectedAddonKeys.length)} {' '}{uiT("customer.md7cbbb688b2e")}{' '}</span>
                )}
              </div>
              {manualSwapAddonsQuery.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {' '}{uiT("customer.m3264de099fe0")}{' '}</div>
              ) : manualSwapAddonsQuery.isError ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                  <span className="text-xs text-destructive">{uiT("customer.m6ad5957f30fd")}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => manualSwapAddonsQuery.refetch()}>
                    {uiT("customer.m942087cc2d41")}{' '}</Button>
                </div>
              ) : manualSwapAddons.length > 0 ? (
                <div className="space-y-2">
                  {uiText(manualSwapAddons.map((addon) => {
                    const checked = selectedAddonKeySet.has(addon.key);
                    const groupSelectionRule = getAddonGroupSelectionRule(addon.presentation.group);
                    const disabled = addon.selectionRule === 'none' || groupSelectionRule === 'none';
                    const localizedAddon = getLocalizedAddonText(addon, addonLocale);
                    return (
                      <label
                        key={addon.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                          checked ? 'border-primary/40 bg-primary/[0.07]' : 'border-border/60 bg-background/40',
                          disabled && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          name={`manual-swap-addon-${addon.presentation.group}`}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleAddon(addon.key)}
                          className="mt-0.5 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2 text-[13px] font-bold">
                            <span>{uiText(localizedAddon.title)}</span>
                            <span className="shrink-0 text-primary">{uiText(getAddonFeeLabel(addon))}</span>
                          </span>
                          {localizedAddon.description && (
                            <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{uiText(localizedAddon.description)}</span>
                          )}
                          {addon.presentation.group && (
                            <span className="mt-1.5 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                              {addon.presentation.group}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  }))}
                </div>
              ) : (
                <p className="rounded-xl border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
                  {uiT("customer.md41b8d1a356e")}{' '}</p>
              )}
            </div>
          ))}

        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <div className={cn(
            'premium-card p-5 space-y-5',
            mode === 'swap' ? 'qx-swap-details' : 'animated-gradient-bg',
          )}>
            <h3 className="font-bold text-lg flex items-center tracking-tight text-white drop-shadow-md">
              <MiniAppLogo
                src={targetOpt?.logoUrl}
                fallbackSrcs={targetOpt?.kind === 'payment-method' || targetOpt?.kind === 'fiat-payment-method' ? getFallbackPaymentLogos(targetOpt?.title, targetOpt?.paymentMethodId || targetOpt?.id) : getFallbackCryptoLogos(targetOpt?.assetCode)}
                badgeSrc={targetOpt?.kind === 'crypto-network' ? targetOpt?.networkLogoUrl : targetOpt?.flagUrl}
                badgeVariant={targetOpt?.kind === 'crypto-network' ? 'network' : 'flag'}
                network={targetOpt?.routeNetwork}
                variant={targetOpt?.kind === 'payment-method' || targetOpt?.kind === 'fiat-payment-method' ? 'payment' : 'asset'}
                fallback={getLogoFallbackText(targetOpt?.kind, targetOpt?.title, targetOpt?.assetCode)}
                alt={uiText(targetOpt?.title)}
                size="small"
                className="mr-2"
              />
              {uiT("customer.mef0d77693265")}{' '}</h3>

            {mode === 'convert' ? (
              <>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-white/90 uppercase tracking-wider">
                    {uiT("customer.m293d404a500f")}{' '}{targetOpt?.assetCode} {' '}{uiT("customer.m56ef8f20955f")}{' '}</label>
                  <Input
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    disabled={createOutcomeUncertain}
                    placeholder={uiT("customer.m9fcfe079b4aa")}
                    className="bg-black/20 h-14 rounded-2xl border-white/20 focus-visible:ring-white/50 text-[15px] shadow-inner font-mono text-white placeholder:text-white/50"
                  />
                </div>
                {(targetOpt?.original?.requiresMemo || convertDestinationMemoField) && (
                  <div className="space-y-2 mt-4">
                    <label className="text-[13px] font-bold text-white/90 uppercase tracking-wider">
                      {uiText(convertDestinationMemoField?.label || uiT("customer.m35f86978cc18"))}
                      {uiText(convertDestinationMemoField && isExchangeFieldRequired(convertDestinationMemoField) && ' *')}
                    </label>
                    <Input
                      value={destinationMemo}
                      onChange={(e) => setDestinationMemo(e.target.value)}
                      disabled={createOutcomeUncertain}
                      placeholder={uiT("customer.m8b457d08fa69")}
                      className="bg-black/20 h-14 rounded-2xl border-white/20 focus-visible:ring-white/50 text-[15px] shadow-inner font-mono text-white placeholder:text-white/50"
                    />
                  </div>
                )}

                {quoteData?.requiredSettlementFields
                  ?.filter((field: any) => !isConvertDedicatedSettlementField(field))
                  .map((field: any) => {
                    const visible = isExchangeFieldVisible(field, { ...settlementFields, destinationAddress, destinationMemo });
                    if (!visible || field.enabled === false) return null;
                    return (
                      <div key={field.key} className="space-y-2 mt-4">
                        <label className="text-[13px] font-bold text-white/90 uppercase tracking-wider">
                          {uiText(field.label)} {uiText(isExchangeFieldRequired(field) && <span className="text-white">*</span>)}
                        </label>
                        {field.type === 'select' && field.options?.length ? (
                          <select
                            value={settlementFields[field.key] || ''}
                            required={isExchangeFieldRequired(field)}
                            disabled={createOutcomeUncertain}
                            onChange={(e) => setSettlementFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full bg-black/20 h-14 rounded-2xl border border-white/20 px-3 text-[15px] text-white"
                          >
                            <option value="">{uiT("customer.m2a78025de6aa")}{' '}{uiText(field.label.toLowerCase())}</option>
                            {uiText(field.options.map((option: any) => (
                              <option key={option.value} value={option.value}>{uiText(option.label)}</option>
                            )))}
                          </select>
                        ) : (
                          <Input
                            value={settlementFields[field.key] || ''}
                            required={isExchangeFieldRequired(field)}
                            disabled={createOutcomeUncertain}
                            onChange={(e) => setSettlementFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={field.placeholder || uiT("customer.m43e95aa600c4", { v0: field.label.toLowerCase() })}
                            type={field.type === 'email' ? 'email' : field.type === 'number' || field.type === 'integer' || field.type === 'numeric' || field.type === 'decimal' ? 'number' : 'text'}
                            className="bg-black/20 h-14 rounded-2xl border-white/20 focus-visible:ring-white/50 text-[15px] shadow-inner text-white placeholder:text-white/50"
                          />
                        )}
                      </div>
                    );
                  })}
              </>
            ) : (
              <>
                {targetOpt?.kind === 'crypto-network' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[13px] font-bold text-white/90 uppercase tracking-wider">
                        {uiT("customer.m293d404a500f")}{' '}{targetOpt?.assetCode} {' '}{uiT("customer.m56ef8f20955f")}{' '}</label>
                      <Input
                        value={destinationAddress}
                        onChange={(e) => setDestinationAddress(e.target.value)}
                        disabled={createOutcomeUncertain}
                        placeholder={uiT("customer.m9fcfe079b4aa")}
                        className="bg-black/20 h-14 rounded-2xl border-white/20 focus-visible:ring-white/50 text-[15px] shadow-inner font-mono text-white placeholder:text-white/50"
                      />
                    </div>
                    {targetOpt.original.requiresMemo && (
                      <div className="space-y-2 mt-4">
                        <label className="text-[13px] font-bold text-white/90 uppercase tracking-wider">{uiT("customer.m35f86978cc18")}</label>
                        <Input
                          value={destinationMemo}
                          onChange={(e) => setDestinationMemo(e.target.value)}
                          disabled={createOutcomeUncertain}
                          placeholder={uiT("customer.m8b457d08fa69")}
                          className="bg-black/20 h-14 rounded-2xl border-white/20 focus-visible:ring-white/50 text-[15px] shadow-inner font-mono text-white placeholder:text-white/50"
                        />
                      </div>
                    )}
                  </>
                )}
                {quoteData?.requiredSettlementFields
                  .map((field: any) => {
                  if (!isExchangeFieldVisible(field, settlementFields)) return null;

                  return (
                    <div key={field.key} className="space-y-2 mt-4">
                      <label className="text-[13px] font-bold text-white/90 uppercase tracking-wider">
                        {uiText(field.label)} {uiText(isExchangeFieldRequired(field) && <span className="text-white">*</span>)}
                      </label>
                      {field.type === 'select' && field.options?.length ? (
                        <select
                          value={settlementFields[field.key] || ''}
                          disabled={createOutcomeUncertain}
                          onChange={(e) => setSettlementFields(prev => ({...prev, [field.key]: e.target.value}))}
                          className="w-full bg-black/20 h-14 rounded-2xl border border-white/20 px-3 text-[15px] text-white"
                        >
                          <option value="">{uiT("customer.m2a78025de6aa")}{' '}{uiText(field.label.toLowerCase())}</option>
                          {uiText(field.options.map((option: any) => <option key={option.value} value={option.value}>{uiText(option.label)}</option>))}
                        </select>
                      ) : (
                        <Input
                          value={settlementFields[field.key] || ''}
                          disabled={createOutcomeUncertain}
                          onChange={(e) => setSettlementFields(prev => ({...prev, [field.key]: e.target.value}))}
                          placeholder={field.placeholder || uiT("customer.m43e95aa600c4", { v0: field.label.toLowerCase() })}
                          type={field.type === 'email' ? 'email' : field.type === 'number' || field.type === 'integer' || field.type === 'numeric' || field.type === 'decimal' ? 'number' : 'text'}
                          className="bg-black/20 h-14 rounded-2xl border-white/20 focus-visible:ring-white/50 text-[15px] shadow-inner text-white placeholder:text-white/50"
                        />
                      )}
                    </div>
                  );
                })}

              </>
            )}

            <div className="space-y-2 pt-4 border-t border-white/20">
              <label className="text-[13px] font-bold text-white/90 uppercase tracking-wider">{uiT("customer.m953b9c40804e")}</label>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                disabled={createOutcomeUncertain}
                placeholder={uiT("customer.m53e6cdc30765")}
                className="bg-black/20 h-14 rounded-2xl border-white/20 focus-visible:ring-white/50 text-[15px] shadow-inner text-white placeholder:text-white/50"
              />
            </div>

            {uiText(mode === 'swap' && (!quoteData?.requiredSettlementFields || quoteData.requiredSettlementFields.length === 0) && targetOpt?.kind !== 'crypto-network' && (
              <div className="bg-black/10 border border-white/10 rounded-2xl p-4 text-center">
                <p className="text-[14px] font-medium text-white/80">{uiT("customer.m12d50c3b0cee")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <div className="premium-card p-5 space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-[14px] font-semibold text-muted-foreground">{uiT("customer.md9329f18a2ae")}</span>
              <span className="flex items-center gap-2 font-bold text-[16px]">
                <MiniAppLogo src={sourceOpt?.logoUrl} fallbackSrcs={sourceOpt?.kind === 'payment-method' || sourceOpt?.kind === 'fiat-payment-method' ? getFallbackPaymentLogos(sourceOpt?.title, sourceOpt?.paymentMethodId || sourceOpt?.id) : getFallbackCryptoLogos(sourceOpt?.assetCode)} badgeSrc={sourceOpt?.kind === 'crypto-network' ? sourceOpt?.networkLogoUrl : sourceOpt?.flagUrl} badgeVariant={sourceOpt?.kind === 'crypto-network' ? 'network' : 'flag'} network={sourceOpt?.routeNetwork} variant={sourceOpt?.kind === 'payment-method' || sourceOpt?.kind === 'fiat-payment-method' ? 'payment' : 'asset'} fallback={getLogoFallbackText(sourceOpt?.kind, sourceOpt?.title, sourceOpt?.assetCode)} size="small" />
                {formatDisplayAmount(quoteData?.amount ?? amount)} {sourceOpt?.assetCode}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-[14px] font-semibold text-muted-foreground">{uiT("customer.m8f3cfce06ac5")}</span>
              <span className="flex items-center gap-2 font-bold text-[16px] text-primary">
                <MiniAppLogo src={targetOpt?.logoUrl} fallbackSrcs={targetOpt?.kind === 'payment-method' || targetOpt?.kind === 'fiat-payment-method' ? getFallbackPaymentLogos(targetOpt?.title, targetOpt?.paymentMethodId || targetOpt?.id) : getFallbackCryptoLogos(targetOpt?.assetCode)} badgeSrc={targetOpt?.kind === 'crypto-network' ? targetOpt?.networkLogoUrl : targetOpt?.flagUrl} badgeVariant={targetOpt?.kind === 'crypto-network' ? 'network' : 'flag'} network={targetOpt?.routeNetwork} variant={targetOpt?.kind === 'payment-method' || targetOpt?.kind === 'fiat-payment-method' ? 'payment' : 'asset'} fallback={getLogoFallbackText(targetOpt?.kind, targetOpt?.title, targetOpt?.assetCode)} size="small" />
                {formatDisplayAmount(quoteData?.receiveAmount)} {targetOpt?.assetCode}
              </span>
            </div>
            {targetOpt?.kind === 'crypto-network' && (
              <div className="flex justify-between items-center py-3 border-b border-border/50">
                <span className="text-[14px] font-semibold text-muted-foreground">{uiT("customer.m293d404a500f")}</span>
                <span className="text-[13px] font-mono max-w-[150px] truncate text-foreground/80 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                  {destinationAddress || Object.values(settlementFields)[0] || uiT("customer.m331551b0de41")}
                </span>
              </div>
            )}
            {customerEmail && (
              <div className="flex justify-between items-center gap-4 py-3 border-b border-border/50">
                <span className="text-[14px] font-semibold text-muted-foreground">{uiT("customer.m969ccbd3cf63")}</span>
                <span className="text-[13px] text-right break-all text-foreground/80">
                  {customerEmail}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-[14px] font-semibold text-muted-foreground">{uiT("customer.m90297f42dfd2")}</span>
              <span className="text-[14px] font-bold">{quoteData?.fee ? formatDisplayAmount(quoteData.fee) : uiT("customer.mba829a98b799")}</span>
            </div>
            {mode === 'swap' && (
              <div className="border-b border-border/50 py-3">
                <ManualSwapFeeSummary
                  fees={quoteData?.manualSwapFees}
                  targetAsset={targetOpt?.assetCode}
                  receiveAmount={quoteData?.receiveAmount}
                  addons={quoteData?._selectedAddOnSnapshots ?? manualSwapAddons}
                  locale={addonLocale}
                />
              </div>
            )}
            <div className="flex justify-between items-center py-3">
              <span className="text-[14px] font-semibold text-muted-foreground">{uiT("customer.m5b21b52b58cb")}</span>
              <span className="text-[14px] font-bold bg-secondary/10 text-secondary px-2 py-1 rounded-lg">1 {sourceOpt?.assetCode} = {formatDisplayAmount(quoteData?.rate)} {targetOpt?.assetCode}</span>
            </div>
          </div>

          <div className="flex items-start text-[12px] text-muted-foreground px-3 pt-2 bg-primary/5 p-3 rounded-xl border border-primary/10">
            <CheckCircle2 className="w-[18px] h-[18px] mr-2.5 text-primary shrink-0 opacity-80" />
            <label htmlFor="telegram-exchange-policy-acceptance" className="leading-snug">
              <input
                id="telegram-exchange-policy-acceptance"
                type="checkbox"
                checked={termsAccepted}
                disabled={createOutcomeUncertain}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                className="mr-2 accent-primary"
                data-testid="telegram-exchange-policy-checkbox"
              />
              {uiT("customer.m26a58d002b08")}{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">{uiT("customer.m2af9bc0ac247")}</a>
              {' '}{uiT("customer.mfd6cc4b3d6ca")}{' '}
              <a href="/aml-kyc" target="_blank" rel="noopener noreferrer" className="text-primary underline">{uiT("customer.mc919b05df73d")}</a>.
              {' '}{uiT("customer.me72d5d60442c")}{' '}</label>
          </div>
          {uiText(createOutcomeUncertain && (
            <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              {recoveryRecord?.phase === 'link-pending'
                ? uiT("customer.m662dfcfba40c")
                : uiT("customer.ma7b877724ae1")}
            </p>
          ))}
        </div>
      )}

      </div>

      <div className={cn(
        "qx-sticky-action",
        step === 2
          ? "border-t border-border/60 bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.15)] backdrop-blur-xl"
          : "pt-6",
      )}>
        <div className={cn(step === 2 && "mx-auto max-w-md")}>
          {uiText(step > 1 && errorMsg && (
            <p role="alert" className="mb-2 text-sm font-medium text-destructive">
              {uiText(errorMsg)}
            </p>
          ))}
          <Button
            className="w-full h-[56px] rounded-2xl text-[17px] font-bold shadow-[0_8px_20px_-8px_hsl(var(--primary))] transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 illuminated-border"
            onClick={handleContinue}
            disabled={
              isProcessing || (step === 1 && isQuoteProcessing) ||
              isPricingLoading ||
              (quoteExpired && !createOutcomeUncertain) ||
              (step > 1 && !recoveryRecord && !quoteMatchesCurrentSelectionForMode) ||
              (mode === 'swap' && manualSwapAddonsQuery.isError && step === 1) ||
              (mode === 'swap' && (!quoteMatchesCurrentSelection || isPricingLoading) && step === 1) ||
              (mode === 'convert' && (!convertQuoteMatchesCurrentSelection || isQuoteProcessing) && step === 1)
            }
          >
            {uiText(isProcessing || (step === 1 && isQuoteProcessing) ? (
              <span className="flex items-center">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> {' '}{uiT("customer.mf40a853e58a1")}{' '}</span>
            ) : step === 1 ? uiT("customer.m31fbef162594") : step === 2 ? uiT("customer.m1f1edc737710") : recoveryRecord?.phase === 'link-pending' ? uiT("customer.m66a5026deb5e") : recoveryRecord ? uiT("customer.ma612d624a1bb") : uiT("customer.m6276fa0157d0"))}
          </Button>
        </div>
      </div>

      {(showSourceSelector || showTargetSelector) && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-300">
          <div className="flex items-center justify-between p-4 border-b border-white/10 glass-nav pt-[env(safe-area-inset-top,1rem)]">
            <h2 className="font-bold text-lg">{uiT("customer.m2a78025de6aa")}{' '}{uiText(showSourceSelector ? uiT("customer.m7e291a73f0e8") : uiT("customer.mbe488512faf8"))}</h2>
            <button
              onClick={() => { setShowSourceSelector(false); setShowTargetSelector(false); haptic.selection(); }}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto pb-[env(safe-area-inset-bottom,1rem)]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                value={showSourceSelector ? sourceSearch : targetSearch}
                onChange={(e) => showSourceSelector ? setSourceSearch(e.target.value) : setTargetSearch(e.target.value)}
                placeholder={uiT("customer.mab51ea7cf425")}
                className="bg-white/5 h-12 rounded-2xl pl-10 border-white/10 focus-visible:ring-primary/50 text-[15px] shadow-sm"
              />
            </div>

            <div className="flex space-x-2">
              {(['all', 'crypto', 'fiat'] as const).map(f => {
                const isActive = (showSourceSelector ? sourceFilter : targetFilter) === f;
                return (
                  <button
                    key={f}
                    onClick={() => {
                      showSourceSelector ? setSourceFilter(f) : setTargetFilter(f);
                      haptic.selection();
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all",
                      isActive ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(var(--primary),0.3)]" : "bg-white/5 text-muted-foreground hover:bg-white/10"
                    )}
                  >
                    {uiText(f === 'fiat' ? uiT("customer.m9f4e2cbe3be2") : f)}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 space-y-2">
              {uiText((showSourceSelector ? filteredSourceOpts : filteredTargetOpts).length === 0 && (
                <div className="p-8 text-center text-[13px] text-muted-foreground flex flex-col items-center">
                  <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-3">
                    <Search className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  {uiText(exchangeSelectorEmptyMessage(showSourceSelector ? sourceFilter : targetFilter))}
                </div>
              ))}
              {(showSourceSelector ? filteredSourceOpts : filteredTargetOpts).map(o => (
                <button
                  key={o.id}
                  onClick={() => {
                    if (showSourceSelector) {
                      if (o.id !== sourceId) invalidateQuote();
                      setSourceId(o.id);
                      setShowSourceSelector(false);
                      setSourceSearch('');
                    } else {
                      if (o.id !== targetId) invalidateQuote();
                      setTargetId(o.id);
                      setShowTargetSelector(false);
                      setTargetSearch('');
                    }
                    haptic.selection();
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-colors group border border-transparent"
                >
                  <div className="flex items-center space-x-4">
                    <MiniAppLogo
                      src={o.logoUrl}
                      fallbackSrcs={o.kind === 'payment-method' || o.kind === 'fiat-payment-method' ? getFallbackPaymentLogos(o.title, o.paymentMethodId || o.id) : getFallbackCryptoLogos(o.assetCode)}
                      badgeSrc={o.kind === 'crypto-network' ? o.networkLogoUrl : o.flagUrl}
                      badgeVariant={o.kind === 'crypto-network' ? 'network' : 'flag'}
                      network={o.routeNetwork}
                      variant={o.kind === 'payment-method' || o.kind === 'fiat-payment-method' ? 'payment' : 'asset'}
                      fallback={getLogoFallbackText(o.kind, o.title, o.assetCode)}
                      alt={uiText(o.title)}
                      size="medium"
                    />
                    <div className="flex flex-col items-start text-left">
                      <span className="font-bold text-[16px] group-hover:text-primary transition-colors">{uiText(o.title)}</span>
                      <span className="text-[12px] font-medium text-muted-foreground/80 mt-0.5">
                        {uiText(o.kind === 'crypto-network' ? `${o.assetCode} · ${o.routeNetwork}` : uiT("customer.ma797c5cc495a", { v0: o.assetCode }))}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}