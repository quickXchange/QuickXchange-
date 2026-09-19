import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GlobalAssetSelector,
  type GlobalAssetSelectorOption,
} from '@/components/global-asset-selector';
import { ArrowDownUp, ArrowRight, Loader2, ShieldCheck, Zap, Mail, Menu, TrendingUp, Wallet, AlertCircle, ChevronLeft } from 'lucide-react';
import {
  getGetQuickexConfigQueryKey,
  useCreateQuickexOrder,
  useCreateQuickexQuote,
  useGetQuickexConfig,
  useValidateQuickexAddress,
} from '@workspace/api-client-react';
import type { ApiError, QuickexInstrument, QuickexRateMode } from '@workspace/api-client-react';
import { CryptoIdentity } from '@/components/crypto-identity';
import { trackEvent } from '@/lib/analytics';
import { useI18n } from '@/i18n/provider';
import { useLocation, useSearch } from 'wouter';
import {
  MARKET_CONVERT_SELECTION_EVENT,
  type MarketConvertSelection,
} from '@/lib/market-convert-selection';

type Notice = { kind: 'error' | 'success'; text: string };

const errorText = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: unknown } }).data;
    if (typeof data?.error === 'string') return data.error.replace(/\bQUICKEX_\w+\b/g, '').replace(/Quickex/gi, 'exchange service');
  }
  return fallback;
};

const normalizedInstrumentParts = (option: QuickexInstrument) => [
  option.currencyTitle,
  option.currencyFriendlyTitle,
  option.fullName,
  option.networkTitle,
].map(part => part?.trim().toLowerCase() || '');

type ConvertGlobalSelectorOption = GlobalAssetSelectorOption & {
  instrument: QuickexInstrument;
};

function ConvertAssetCombobox({
  value,
  options,
  onChange,
  onOpenChange,
  label,
  testId,
}: {
  value: string;
  options: QuickexInstrument[];
  onChange: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  label: string;
  testId: string;
}) {
  const { t } = useI18n();

  const mappedOptions = useMemo(() => {
    return options.map((option): ConvertGlobalSelectorOption => {
      const searchText = [
        option.currencyTitle,
        option.networkTitle,
        option.fullName,
        option.currencyFriendlyTitle
      ].filter(Boolean).join(' ').toLowerCase();

      return {
        id: option.slug,
        category: 'crypto' as const,
        searchText,
        instrument: option,
      };
    });
  }, [options]);

  const renderIdentity = useCallback((opt: ConvertGlobalSelectorOption, placement: 'trigger' | 'option') => {
    const inst = opt.instrument;
    return (
      <CryptoIdentity
        symbol={inst.currencyTitle}
        name={inst.fullName || inst.currencyFriendlyTitle}
        network={inst.networkTitle}
        logoUrl={inst.currencyLogoLink}
        size={placement === 'trigger' ? 'lg' : 'md'}
        className={placement === 'trigger' ? 'convert-trigger-identity' : 'convert-option-identity'}
        testId={placement === 'option' ? `crypto-identity-${inst.slug}` : undefined}
      />
    );
  }, []);

  return (
    <GlobalAssetSelector
      value={value}
      options={mappedOptions}
      onChange={onChange}
      onOpenChange={onOpenChange}
      label={label}
      title={label === t('convert.sendCurrency') ? t('convert.youSend') : t('convert.youReceive')}
      searchPlaceholder={t('convert.searchPlaceholder', { label })}
      closeLabel={t('convert.closeSelector', { label })}
      closeSearchLabel={t('convert.closeSearch', { label })}
      testId={testId}
      renderIdentity={renderIdentity}
      noOptionsText={t('convert.noCurrencies')}
      noFilteredOptionsText={t('convert.noFilteredCurrencies')}
    />
  );
}

/** Quickex Convert stays mounted so mode switches preserve state and feel immediate. */
export function QuickexConvertWidget({
  dataEnabled,
  onSwap,
  onOpenMenu,
}: {
  dataEnabled: boolean;
  onSwap: () => void;
  onOpenMenu: () => void;
}) {
  const { t, formatNumber } = useI18n();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const formatNum = (value: number) => formatNumber(value, { maximumFractionDigits: 6 });
  const config = useGetQuickexConfig({
    query: {
      queryKey: getGetQuickexConfigQueryKey(),
      staleTime: 300000,
      gcTime: 1800000,
      enabled: dataEnabled,
      refetchOnWindowFocus: true,
      retry: 3,
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
      refetchInterval: (query: any) => query.state.status === 'error' ? 15000 : false,
    },
  });
  const quoteMutation = useCreateQuickexQuote();
  const validateAddress = useValidateQuickexAddress();
  const createOrder = useCreateQuickexOrder();
  const [fromSlug, setFromSlug] = useState('');
  const [marketRequest, setMarketRequest] = useState<MarketConvertSelection | null>(null);
  const [urlAssetInitialized, setUrlAssetInitialized] = useState(false);
  const [toSlug, setToSlug] = useState('');
  const [amount, setAmount] = useState('');
  const [rateMode, setRateMode] = useState<QuickexRateMode>('FLOATING');
  const [fromSelectorOpen, setFromSelectorOpen] = useState(false);
  const [toSelectorOpen, setToSelectorOpen] = useState(false);
  const selectorOpen = fromSelectorOpen || toSelectorOpen;
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationMemo, setDestinationMemo] = useState('');
  const [refundAddress, setRefundAddress] = useState('');
  const [refundMemo, setRefundMemo] = useState('');
  const [showRefundDetails, setShowRefundDetails] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [quote, setQuote] = useState<{ id: string; receive: number; rate: number; expiresAt: string; minAmount?: number; maxAmount?: number } | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [swapFlipped, setSwapFlipped] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [createOutcomeUncertain, setCreateOutcomeUncertain] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const quoteRequestVersionRef = useRef(0);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const destinationAddressInputRef = useRef<HTMLInputElement>(null);
  const stepFocusPendingRef = useRef(false);

  const instruments = config.data?.instruments || [];
  const cryptoInstruments = useMemo(
    () => instruments.filter(item =>
      item.instrumentType.toLowerCase() === 'crypto'
      && item.currencyTitle.trim().length >= 2
      && item.networkTitle.trim().length >= 1
    ),
    [instruments],
  );
  const instrumentKey = (currencyTitle: string, networkTitle: string) =>
    `${currencyTitle.trim().toUpperCase()}\0${networkTitle.trim().toUpperCase()}`;
  const fromOptions = useMemo(() => {
    if (!config.data) return [];
    const sourceKeys = new Set(config.data.pairs.map(pair =>
      instrumentKey(pair.fromAsset, pair.fromNetwork)
    ));
    return cryptoInstruments.filter(item =>
      sourceKeys.has(instrumentKey(item.currencyTitle, item.networkTitle))
    );
  }, [config.data, cryptoInstruments]);
  const from = fromOptions.find(item => item.slug === fromSlug);
  const pairOptions = useMemo(() => {
    if (!from || !config.data) return [];
    const sourceKey = instrumentKey(from.currencyTitle, from.networkTitle);
    const targetKeys = new Set(config.data.pairs
      .filter(pair => instrumentKey(pair.fromAsset, pair.fromNetwork) === sourceKey)
      .map(pair => instrumentKey(pair.toAsset, pair.toNetwork)));
    return cryptoInstruments.filter(item =>
      targetKeys.has(instrumentKey(item.currencyTitle, item.networkTitle))
    );
  }, [config.data, from, cryptoInstruments]);
  const to = pairOptions.find(item => item.slug === toSlug);
  const reverseSelection = useMemo(() => {
    if (!from || !to) return null;
    const reverseFrom = fromOptions.find(item =>
      instrumentKey(item.currencyTitle, item.networkTitle) === instrumentKey(to.currencyTitle, to.networkTitle)
    );
    const reverseSourceKey = instrumentKey(to.currencyTitle, to.networkTitle);
    const reverseAllowed = config.data?.pairs.some(pair =>
      instrumentKey(pair.fromAsset, pair.fromNetwork) === reverseSourceKey &&
      instrumentKey(pair.toAsset, pair.toNetwork) === instrumentKey(from.currencyTitle, from.networkTitle)
    );
    const reverseTo = reverseAllowed && cryptoInstruments.find(item =>
      instrumentKey(item.currencyTitle, item.networkTitle) === instrumentKey(from.currencyTitle, from.networkTitle)
    );
    return reverseFrom && reverseTo ? { fromSlug: reverseFrom.slug, toSlug: reverseTo.slug } : null;
  }, [config.data?.pairs, cryptoInstruments, from, fromOptions, to]);
  const noReceiveRoutes = Boolean(from && pairOptions.length === 0);
  const configPending = !config.data && !config.isError;
  useEffect(() => {
    const handleMarketSelection = (event: Event) => {
      setMarketRequest((event as CustomEvent<MarketConvertSelection>).detail);
    };
    window.addEventListener(MARKET_CONVERT_SELECTION_EVENT, handleMarketSelection);
    return () => window.removeEventListener(MARKET_CONVERT_SELECTION_EVENT, handleMarketSelection);
  }, []);

  useEffect(() => {
    setStep(1);
    setTermsAccepted(false);
  }, [amount, fromSlug, toSlug, rateMode]);

  useEffect(() => {
    if (!stepFocusPendingRef.current) return;
    stepFocusPendingRef.current = false;
    window.requestAnimationFrame(() => {
      if (step === 2) destinationAddressInputRef.current?.focus({ preventScroll: true });
      else amountInputRef.current?.focus({ preventScroll: true });
    });
  }, [step]);

  useEffect(() => {
    if (!fromOptions.length) return;

    if (!urlAssetInitialized) {
      const params = new URLSearchParams(searchString);
      const urlAsset = params.get('asset')?.trim().toUpperCase();
      const urlSource = params.get('source')?.trim().toUpperCase();
      const urlSourceNetwork = params.get('sourceNetwork')?.trim().toUpperCase();
      const urlDest = params.get('dest')?.trim().toUpperCase();
      const urlDestNetwork = params.get('destNetwork')?.trim().toUpperCase();
      const urlOpen = params.get('open') as MarketConvertSelection['openSelector'] | undefined;

      const reqSource = urlSource || urlAsset;

      if (reqSource || urlDest || urlOpen) {
        setMarketRequest({
          symbol: reqSource || undefined,
          sourceNetwork: urlSourceNetwork || undefined,
          destinationSymbol: urlDest || undefined,
          destinationNetwork: urlDestNetwork || undefined,
          openSelector: urlOpen || undefined,
        });
      } else if (!fromOptions.some(item => item.slug === fromSlug)) {
        setFromSlug(fromOptions[0].slug);
      }
      setUrlAssetInitialized(true);
      return;
    }

    if (!fromOptions.some(item => item.slug === fromSlug)) {
      setFromSlug(fromOptions[0].slug);
    }
  }, [fromOptions, fromSlug, searchString, urlAssetInitialized]);

  useEffect(() => {
    if (!marketRequest || !fromOptions.length) return;

    const reqSource = marketRequest.symbol?.trim().toUpperCase();
    const reqSourceNetwork = marketRequest.sourceNetwork?.trim().toUpperCase();
    const reqDest = marketRequest.destinationSymbol?.trim().toUpperCase();
    const reqDestNetwork = marketRequest.destinationNetwork?.trim().toUpperCase();

    if (reqSource && reqDest) {
      const sourceInst = fromOptions.find(item =>
        item.currencyTitle.trim().toUpperCase() === reqSource &&
        (!reqSourceNetwork || item.networkTitle.trim().toUpperCase() === reqSourceNetwork)
      );
      const targetInst = pairOptions.find(item =>
        item.currencyTitle.trim().toUpperCase() === reqDest &&
        (!reqDestNetwork || item.networkTitle.trim().toUpperCase() === reqDestNetwork)
      );
      if (sourceInst && fromSlug !== sourceInst.slug) {
        setFromSlug(sourceInst.slug);
        return;
      }
      if (targetInst && toSlug !== targetInst.slug) setToSlug(targetInst.slug);
    } else if (reqSource) {
      const sourceInst = fromOptions.find(item =>
        item.currencyTitle.trim().toUpperCase() === reqSource &&
        (!reqSourceNetwork || item.networkTitle.trim().toUpperCase() === reqSourceNetwork)
      );
      if (sourceInst) setFromSlug(sourceInst.slug);
    }

    if (marketRequest.openSelector === 'source') setFromSelectorOpen(true);
    if (marketRequest.openSelector === 'destination') setToSelectorOpen(true);

    setMarketRequest(null);
  }, [fromOptions, fromSlug, marketRequest, pairOptions, toSlug]);
  useEffect(() => {
    if (marketRequest) return;
    if (!pairOptions.length || pairOptions.some(item => item.slug === toSlug)) return;
    setToSlug(pairOptions[0].slug);
  }, [marketRequest, pairOptions, toSlug]);

  useEffect(() => {
    const requestVersion = ++quoteRequestVersionRef.current;
    setQuote(null);
    setQuoteError('');
    const numericAmount = Number(amount);
    if (!from || !to || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
    const timer = window.setTimeout(() => {
      quoteMutation.mutate({
        data: {
          type: 'instant',
          fromAsset: from.currencyTitle,
          fromNetwork: from.networkTitle,
          toAsset: to.currencyTitle,
          toNetwork: to.networkTitle,
          amount: numericAmount,
          rateMode,
        },
      }, {
        onSuccess: result => {
          if (quoteRequestVersionRef.current !== requestVersion) return;
          setQuote({
            id: result.quoteId,
            receive: result.receiveAmount,
            rate: result.rate,
            expiresAt: result.expiresAt,
            minAmount: result.minAmount,
            maxAmount: result.maxAmount,
          });
          trackEvent('quote_displayed', { mode: 'convert', rate_type: rateMode.toLowerCase() });
        },
        onError: error => {
          if (quoteRequestVersionRef.current !== requestVersion) return;
           setQuoteError(errorText(error, t('convert.quoteUnavailable')));
          trackEvent('quote_failed', { mode: 'convert', rate_type: rateMode.toLowerCase() });
        },
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [amount, from, to, rateMode, quoteRefreshKey]);

  useEffect(() => {
    if (!quote) {
      setQuoteExpired(false);
      return;
    }
    const remaining = new Date(quote.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setQuoteExpired(true);
      return;
    }
    setQuoteExpired(false);
    const timeout = window.setTimeout(() => setQuoteExpired(true), remaining + 50);
    return () => window.clearTimeout(timeout);
  }, [quote]);

  const swap = () => {
    if (!reverseSelection) return false;
    setFromSlug(reverseSelection.fromSlug);
    setToSlug(reverseSelection.toSlug);
    return true;
  };

  const moveToStep = (nextStep: 1 | 2 | 3 | 4) => {
    stepFocusPendingRef.current = true;
    setStep(nextStep);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step !== 2 || !from || !to || !quote || new Date(quote.expiresAt).getTime() <= Date.now()) return;
    if (!destinationAddress.trim()) {
      setNotice({ kind: 'error', text: t('convert.checkWallets') });
      return;
    }
    if (!customerEmail.trim()) {
      setNotice({ kind: 'error', text: t('swap.contactEmail') });
      return;
    }
    if (!termsAccepted) {
       setNotice({ kind: 'error', text: t('convert.acceptTerms') });
      return;
    }
    setNotice(null);
    let createAttempted = false;
    try {
      const destination = await validateAddress.mutateAsync({ data: { asset: to.currencyTitle, network: to.networkTitle, address: destinationAddress.trim(), memo: destinationMemo.trim() || undefined } });
      const trimmedRefundAddress = refundAddress.trim();
      if (!destination.valid) throw new Error(t('convert.checkWallets'));
      if (new Date(quote.expiresAt).getTime() <= Date.now()) {
         throw new Error(t('convert.quoteExpiredChecking'));
      }
      createAttempted = true;
      const order = await createOrder.mutateAsync({ data: {
        type: 'instant', fromAsset: from.currencyTitle, fromNetwork: from.networkTitle,
        toAsset: to.currencyTitle, toNetwork: to.networkTitle, amount: Number(amount),
        quoteId: quote.id, rateMode, destinationAddress: destinationAddress.trim(),
        destinationMemo: destinationMemo.trim() || undefined,
        ...(trimmedRefundAddress ? {
          refundAddress: trimmedRefundAddress,
          refundMemo: refundMemo.trim() || undefined,
        } : {}),
         customerEmail: customerEmail.trim(),
         clientRequestId: requestId.current,
      } });
      trackEvent('order_created', { mode: 'convert', rate_type: rateMode.toLowerCase() });
      setCreateOutcomeUncertain(false);
      const trackingQuery = order.trackingToken
        ? `&trackingToken=${encodeURIComponent(order.trackingToken)}`
        : '';
      setLocation(`/order/${encodeURIComponent(order.id)}?provider=quickex${trackingQuery}`);
    } catch (error) {
      let parsedError: ApiError | null = null;
      if (error && typeof error === 'object' && 'data' in error) {
        const data = (error as { data?: unknown }).data;
        if (data && typeof data === 'object' && 'error' in data) parsedError = data as ApiError;
      }
      const outcomeUncertain = createAttempted && (
        !parsedError ||
        parsedError.outcomeUnknown ||
        parsedError.code === 'verification-required'
      );
      if (outcomeUncertain && parsedError?.orderId) {
        setCreateOutcomeUncertain(false);
        setLocation(`/order/${encodeURIComponent(parsedError.orderId)}?provider=quickex`);
        return;
      }
      setCreateOutcomeUncertain(outcomeUncertain);
      if (!outcomeUncertain) {
        requestId.current = crypto.randomUUID();
        setTermsAccepted(false);
      }
      setNotice({
        kind: 'error',
        text: outcomeUncertain
          ? t('convert.uncertain')
          : errorText(error, error instanceof Error ? error.message : t('convert.startFailed')),
      });
    }
  };

  if (
    config.isError ||
    (!configPending && (
      !config.data?.signedOrders ||
      fromOptions.length === 0
    ))
  ) {
    return (
      <div className="exchange-card redesigned-widget convert-widget-unavailable flex flex-col p-4 text-center">
        <div className="reference-header w-full text-left">
          <div className="reference-top-bar">
            <div className="widget-tabs-pill" role="group" aria-label={t('convert.exchangeType')}>
              <button type="button" onClick={onSwap} aria-pressed="false" data-mode-target="swap">{t('convert.swap')}</button>
              <button type="button" className="active" aria-pressed="true" data-mode-target="convert">{t('convert.convert')}</button>
            </div>
            <button type="button" className="reference-menu-btn" aria-label="Open navigation" data-testid="widget-menu-button" onClick={onOpenMenu}>
              <Menu size={20} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="notice notice-error convert-widget-unavailable-notice rounded-xl p-5 max-w-sm mx-auto" data-testid="convert-unavailable">
           <strong>{t('convert.unavailableTitle')}</strong>
           <p className="mt-1">{t('convert.unavailableDescription')}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => void config.refetch()} className="button button-secondary" data-testid="button-retry-convert">{t('common.retry')}</button>
             <button type="button" onClick={onSwap} className="button button-primary" data-testid="button-use-swap">{t('convert.useSwap')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const quoting = quoteMutation.isPending;
  const ready = Boolean(quote && !quoting && !quoteExpired && new Date(quote.expiresAt).getTime() > Date.now());

  return (
    <div className={`exchange-card exchange-card-expanded redesigned-widget convert-widget convert-widget-step-${step}`}>
      <div className="reference-header">
        <div className="reference-top-bar">
          <div className="widget-tabs-pill" role="group" aria-label={t('convert.exchangeType')}>
            <button
              type="button"
              onClick={onSwap}
              disabled={createOutcomeUncertain}
              aria-pressed="false"
              title={createOutcomeUncertain ? t('convert.switchBlocked') : undefined}
              data-mode-target="swap"
            >
              {t('convert.swap')}
            </button>
            <button type="button" className="active" aria-pressed="true" data-mode-target="convert">
              {t('convert.convert')}
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
          <h2>Convert <span>Crypto</span></h2>
          <div className="reference-realtime-badge">
            <TrendingUp size={15} /> Real-time rate
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="widget-form-body convert-widget-form-viewport">
          {step === 1 && (
            <div className="convert-step-panel animate-in fade-in slide-in-from-bottom-4 duration-300" data-testid="convert-step-quote">
              <fieldset className="convert-rate-tabs">
                <legend className="sr-only">{t('convert.rateType')}</legend>
                {(['FLOATING', 'FIXED'] as QuickexRateMode[]).map(mode => (
                  <button
                    type="button"
                    key={mode}
                    className="convert-rate-tab"
                    onClick={() => setRateMode(mode)}
                    aria-pressed={rateMode === mode}
                    data-testid={`convert-rate-${mode.toLowerCase()}`}
                  >
                    {mode === 'FIXED' ? t('convert.fixedRate') : t('convert.floatingRate')}
                  </button>
                ))}
              </fieldset>

              <div className="convert-quote-flow exchange-flow-stack">
                <div className="reference-amount-panel amount-stack">
                  <div className="reference-amount-header">
                    <span className="reference-amount-label">{t('swap.youSend')}</span>
                  </div>
                  <div className="reference-amount-body exchange-amount-row">
                    <input ref={amountInputRef} aria-label={t('convert.youSend')} className="reference-amount-input" value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder="0" data-testid="convert-input-amount" />
                    {configPending ? (
                      <div className="convert-selector-skeleton skeleton" aria-label={t('common.loading')} />
                    ) : (
                      <ConvertAssetCombobox value={fromSlug} options={fromOptions} onChange={setFromSlug} onOpenChange={setFromSelectorOpen} label={t('convert.sendCurrency')} testId="convert-select-from-asset" />
                    )}
                  </div>
                  <div className="reference-amount-footer">
                    <span>Min: {quote?.minAmount != null ? formatNum(quote.minAmount) : 0} {from?.currencyTitle || ''}</span>
                    <span>
                      Max: {quote?.maxAmount != null
                        ? `${formatNum(quote.maxAmount)} ${from?.currencyTitle || ''}`
                        : 'No limit'}
                    </span>
                  </div>
                </div>

                <div className={`reference-swap-divider ${selectorOpen ? 'opacity-0 invisible pointer-events-none' : 'opacity-100 visible'} transition-opacity`} aria-hidden={selectorOpen}>
                  <button
                    type="button"
                    className={`reference-swap-button ${swapFlipped ? 'rotate-180' : ''}`}
                    onClick={() => {
                      if (swap()) setSwapFlipped(flipped => !flipped);
                    }}
                    disabled={!reverseSelection}
                    title={reverseSelection ? t('convert.swapAssets') : t('convert.reverseUnavailable')}
                    data-testid="convert-button-swap-assets"
                    aria-label={reverseSelection ? t('convert.swapAssets') : t('convert.reverseUnavailable')}
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
                    <input readOnly aria-label={t('convert.youReceive')} value={quote ? String(quote.receive) : ''} placeholder="0" data-testid="convert-input-receive-amount" className={`reference-amount-input ${quoting ? 'quoting' : !quote ? 'empty' : ''}`} />
                    {configPending ? (
                      <div className="convert-selector-skeleton skeleton" aria-label={t('common.loading')} />
                    ) : (
                      <ConvertAssetCombobox value={toSlug} options={pairOptions} onChange={setToSlug} onOpenChange={setToSelectorOpen} label={t('convert.receiveCurrency')} testId="convert-select-to-asset" />
                    )}
                  </div>
                  <div className="reference-amount-footer">
                    <span>{rateMode === 'FIXED' ? t('convert.fixedRate') : t('convert.floatingRate')}</span>
                    <span>{t('convert.automatic')}</span>
                  </div>
                </div>

                {noReceiveRoutes && (
                  <div className="notice notice-error convert-route-unavailable rounded-xl p-4 mt-4 bg-destructive/10 border border-destructive/20" data-testid="convert-receive-options-error">
                    <strong className="text-destructive">{t('convert.noReceiveTitle')}</strong>
                    <p className="mt-1 text-sm text-destructive/80">{t('convert.noReceiveDescription')}</p>
                    <button
                      type="button"
                      className="button button-secondary mt-3"
                      onClick={() => {
                        void config.refetch();
                      }}
                      data-testid="button-retry-receive-options"
                    >
                      {t('convert.refreshCurrencies')}
                    </button>
                  </div>
                )}
              </div>

              {quoteError && (
                <div className="convert-quote-error mt-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-start gap-3">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{quoteError}</span>
                </div>
              )}

              <div className="exchange-submit-wrap">
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => {
                    setNotice(null);
                    moveToStep(2);
                  }}
                  className="button button-primary widget-primary-submit group"
                  data-testid="convert-button-continue"
                >
                  {t('convert.continue')}
                  <span className="continue-arrow-accent" aria-hidden="true"><ArrowRight size={16} /></span>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="convert-step-panel animate-in fade-in slide-in-from-right-4 duration-300" data-testid="convert-step-wallets">
              {/* Compact Route Summary */}
              <div className="convert-route-summary rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-testid="convert-wallet-quote-summary">
                <button
                  type="button"
                  onClick={() => moveToStep(1)}
                  className="convert-route-summary-back flex items-center justify-center rounded-full border border-border bg-muted/30 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  data-testid="convert-button-back"
                  aria-label={t('convert.backToQuote')}
                >
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>

                <div className="convert-route-summary-main">
                  <div className="convert-route-summary-assets">
                    {from && (
                      <span className="convert-route-summary-asset convert-route-summary-asset--from" data-testid="convert-summary-from-logo">
                        <CryptoIdentity
                          symbol={from.currencyTitle}
                          network={from.networkTitle}
                          logoUrl={from.currencyLogoLink}
                          size="md"
                          compact
                        />
                      </span>
                    )}

                    <span className="convert-route-summary-arrow text-muted-foreground/60">
                    <ArrowRight size={14} strokeWidth={2.5} aria-hidden="true" />
                    </span>

                    {to && (
                      <span className="convert-route-summary-asset convert-route-summary-asset--to" data-testid="convert-summary-to-logo">
                        <CryptoIdentity
                          symbol={to.currencyTitle}
                          network={to.networkTitle}
                          logoUrl={to.currencyLogoLink}
                          size="md"
                          compact
                        />
                      </span>
                    )}
                  </div>

                  <div className="convert-route-summary-amounts font-mono">
                    <span className="convert-route-summary-amount convert-route-summary-amount--send font-bold text-foreground" data-testid="convert-summary-send-amount">
                      {formatNum(Number(amount))} {from?.currencyTitle}
                    </span>
                    <span className="convert-route-summary-amount convert-route-summary-amount--receive truncate" data-testid="convert-summary-receive-amount">
                      {quote ? `≈${formatNum(quote.receive)}` : '—'} {to?.currencyTitle}
                    </span>
                  </div>
                </div>
              </div>

              {!ready && (
                <div className="notice notice-error convert-expired-quote mb-5" data-testid="convert-expired-quote">
                  <strong>{t('convert.quoteRefresh')}</strong>
                  <p className="mt-1">{t('convert.refreshQuote')}</p>
                  <button
                    type="button"
                    className="button button-secondary mt-3"
                    onClick={() => {
                      moveToStep(1);
                      setQuoteRefreshKey(key => key + 1);
                    }}
                  >
                    {t('convert.refreshQuote')}
                  </button>
                </div>
              )}

              <div className="order-details-content convert-order-details-content flex flex-col gap-4">
                {/* Destination */}
                <div className="order-detail-field order-detail-field--destination flex flex-col gap-1.5">
                  <label htmlFor="convert-destination" className="text-[13px] font-semibold text-muted-foreground">
                    {t('convert.destinationAddress')} · {to?.currencyTitle} {to?.networkTitle ? `(${to.networkTitle})` : ''}
                  </label>
                  <div className="relative">
                    <Wallet size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      id="convert-destination"
                      ref={destinationAddressInputRef}
                      required
                      value={destinationAddress}
                      onChange={event => setDestinationAddress(event.target.value)}
                      data-testid="convert-input-destination-address"
                      placeholder={t('convert.destinationAddressPlaceholder', { asset: to?.currencyTitle || '' })}
                      className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm"
                    />
                  </div>
                </div>

                <div className="order-detail-field order-detail-field--memo flex flex-col gap-1.5">
                  <label htmlFor="convert-destination-memo" className="text-[13px] font-semibold text-muted-foreground">
                    {t('convert.memoOrTag')} <small className="font-normal">({t('convert.optional')})</small>
                  </label>
                  <div className="relative">
                    <input
                      id="convert-destination-memo"
                      value={destinationMemo}
                      onChange={event => setDestinationMemo(event.target.value)}
                      data-testid="convert-input-destination-memo"
                      placeholder={t('convert.memoPlaceholder')}
                      className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] px-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="order-detail-field order-detail-field--email flex flex-col gap-1.5">
                  <label htmlFor="convert-email" className="text-[13px] font-semibold text-muted-foreground">
                    {t('convert.emailAddress')}
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      id="convert-email"
                      type="email"
                      required
                      value={customerEmail}
                      onChange={event => setCustomerEmail(event.target.value)}
                      autoComplete="email"
                      data-testid="convert-input-email"
                      placeholder={t('convert.emailPlaceholder')}
                      className="font-sans text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm"
                    />
                  </div>
                </div>

                {/* Refund Address */}
                <div className="order-detail-field order-detail-field--refund flex flex-col gap-1.5">
                  <label htmlFor="convert-refund" className="text-[13px] font-semibold text-muted-foreground">
                    {t('convert.refundAddress')} <small className="font-normal">({t('convert.optional')})</small>
                  </label>
                  <div className="relative">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <input
                      id="convert-refund"
                      value={refundAddress}
                      onChange={event => setRefundAddress(event.target.value)}
                      data-testid="convert-input-refund-address"
                      placeholder={t('convert.addRefund')}
                      className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm"
                    />
                  </div>
                </div>

                <div className={`order-detail-field order-detail-field--refund-memo transition-all duration-300 overflow-hidden ${refundAddress.trim() ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="convert-refund-memo" className="text-[13px] font-semibold text-muted-foreground">
                      {t('convert.refundMemo')} <small className="font-normal">({t('convert.optional')})</small>
                    </label>
                    <input
                      id="convert-refund-memo"
                      value={refundMemo}
                      onChange={event => setRefundMemo(event.target.value)}
                      disabled={!refundAddress.trim()}
                      data-testid="convert-input-refund-memo"
                      placeholder={t('convert.memoPlaceholder')}
                      className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] px-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="order-terms convert-terms-card mt-2 flex items-start gap-3">
                   <input
                     type="checkbox"
                     id="convert-terms"
                     required
                     checked={termsAccepted}
                     onChange={e => setTermsAccepted(e.target.checked)}
                     className="mt-1 w-[18px] h-[18px] rounded border-border text-primary focus:ring-primary/20 shrink-0"
                   />
                   <label htmlFor="convert-terms" className="text-[14px] font-medium text-foreground leading-relaxed cursor-pointer select-none">
                     {t('convert.terms')}
                   </label>
                </div>

                {notice && (
                  <div className={`p-4 rounded-xl text-sm font-medium flex items-start gap-3 border ${notice.kind === 'error' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-success/10 text-success border-success/20'}`} data-testid="convert-notice">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{notice.text}</span>
                  </div>
                )}

                <div className="order-actions convert-order-actions mt-2 flex flex-col gap-4">
                  <button
                    type="submit"
                    disabled={createOrder.isPending || validateAddress.isPending || !ready || !termsAccepted || !destinationAddress.trim() || !customerEmail.trim()}
                    className="button button-primary widget-primary-submit w-full h-[54px] rounded-xl text-[16px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="convert-button-submit"
                  >
                    {createOrder.isPending || validateAddress.isPending ? <Loader2 size={18} className="animate-spin" /> : null}
                    {createOrder.isPending || validateAddress.isPending ? t('convert.starting') : createOutcomeUncertain ? t('convert.checkSameRequest') : t('convert.placeOrder')}
                    {!createOrder.isPending && !validateAddress.isPending && <ArrowRight size={18} />}
                  </button>

                </div>
              </div>
            </div>
          )}

        </form>
      </div>
  );
}
