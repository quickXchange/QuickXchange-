import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  useGetExchangeConfig, getGetExchangeConfigQueryKey,
  useGetExchangeRoutePricing, getGetExchangeRoutePricingQueryKey,
  useCreateExchangeQuote,
  useCreateExchangeOrder,
  useGetQuickexConfig, getGetQuickexConfigQueryKey,
  useCreateQuickexQuote,
  useCreateQuickexOrder,
  useLinkTelegramMiniAppOrder
} from '@workspace/api-client-react';
import { useAuthHeaders } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, CheckCircle2, AlertCircle, ChevronDown, Wallet, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/lib/hooks';

export default function Exchange() {
  const [, setLocation] = useLocation();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const quoteRequestVersionRef = useRef(0);
  const orderRequestIdRef = useRef(crypto.randomUUID());

  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get('mode') === 'swap' ? 'swap' : 'convert';

  const setMode = (newMode: 'swap' | 'convert') => {
    haptic.selection();
    setLocation(`/exchange?mode=${newMode}`);
    setStep(1);
    setSourceId('');
    setTargetId('');
    setAmount('100');
    setErrorMsg('');
  };

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [amount, setAmount] = useState<string>('100');

  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all'|'crypto'|'fiat'>('all');
  const [targetFilter, setTargetFilter] = useState<'all'|'crypto'|'fiat'>('all');

  // Form state
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationMemo, setDestinationMemo] = useState('');
  const [refundAddress, setRefundAddress] = useState('');
  const [refundMemo, setRefundMemo] = useState('');
  const [settlementFields, setSettlementFields] = useState<Record<string, string>>({});

  // Data hooks
  const { data: config, isLoading: isConfigLoading } = useGetExchangeConfig({
    query: { queryKey: getGetExchangeConfigQueryKey(), staleTime: 60000, enabled: mode === 'swap' }
  });

  const { data: quickexConfig, isLoading: isQuickexConfigLoading } = useGetQuickexConfig({
    query: { queryKey: getGetQuickexConfigQueryKey(), staleTime: 60000, enabled: mode === 'convert' }
  });

  const sourceOpts = useMemo(() => {
    if (mode === 'swap') {
      if (!config) return [];
      return (config.manualSettlementOptions || []).filter(o => o.direction === 'send' || o.direction === 'both').map(o => ({
        id: o.id,
        title: o.title,
        assetCode: o.assetCode,
        routeNetwork: o.routeNetwork,
        logoUrl: o.logoUrl,
        kind: o.kind,
        executionMode: o.executionMode,
        original: o
      }));
    } else {
      if (!quickexConfig) return [];
      const seen = new Set<string>();
      const list: any[] = [];
      quickexConfig.instruments.forEach(inst => {
        if (inst.instrumentType.toLowerCase() !== 'crypto' || !inst.currencyTitle || !inst.networkTitle) return;
        const key = `${inst.currencyTitle.trim().toUpperCase()}\0${inst.networkTitle.trim().toUpperCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push({
          id: inst.slug,
          title: inst.fullName || inst.currencyFriendlyTitle || inst.currencyTitle,
          assetCode: inst.currencyTitle,
          routeNetwork: inst.networkTitle,
          logoUrl: inst.currencyLogoLink && !inst.currencyLogoLink.endsWith('/generic.svg') ? inst.currencyLogoLink : undefined,
          kind: 'crypto-network',
          executionMode: 'api',
          original: inst
        });
      });
      return list;
    }
  }, [config, quickexConfig, mode]);

  const targetOpts = useMemo(() => {
    if (mode === 'swap') {
      if (!config) return [];
      if (!sourceId) return [];
      const validTargets = new Set(
        config.manualRouteAvailability.routes
          .filter(r => r.sourceSettlementOptionId === sourceId)
          .map(r => r.targetSettlementOptionId)
      );
      return (config.manualSettlementOptions || [])
        .filter(o => (o.direction === 'receive' || o.direction === 'both') && validTargets.has(o.id))
        .map(o => ({
          id: o.id,
          title: o.title,
          assetCode: o.assetCode,
          routeNetwork: o.routeNetwork,
          logoUrl: o.logoUrl,
          kind: o.kind,
          executionMode: o.executionMode,
          original: o
        }));
    } else {
      if (!quickexConfig) return [];
      const seen = new Set<string>();
      const list: any[] = [];
      quickexConfig.instruments.forEach(inst => {
        if (inst.instrumentType.toLowerCase() !== 'crypto' || !inst.currencyTitle || !inst.networkTitle) return;
        const key = `${inst.currencyTitle.trim().toUpperCase()}\0${inst.networkTitle.trim().toUpperCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (inst.slug === sourceId) return; // exclude identical instrument
        list.push({
          id: inst.slug,
          title: inst.fullName || inst.currencyFriendlyTitle || inst.currencyTitle,
          assetCode: inst.currencyTitle,
          routeNetwork: inst.networkTitle,
          logoUrl: inst.currencyLogoLink && !inst.currencyLogoLink.endsWith('/generic.svg') ? inst.currencyLogoLink : undefined,
          kind: 'crypto-network',
          executionMode: 'api',
          original: inst
        });
      });
      return list;
    }
  }, [config, quickexConfig, mode, sourceId]);

  const filteredSourceOpts = useMemo(() => {
    let list = sourceOpts;
    if (sourceFilter === 'crypto') list = list.filter(o => o.kind === 'crypto-network');
    if (sourceFilter === 'fiat') list = list.filter(o => o.kind !== 'crypto-network');
    if (!sourceSearch) return list;
    const q = sourceSearch.toLowerCase();
    return list.filter(o => o.title.toLowerCase().includes(q) || o.assetCode.toLowerCase().includes(q) || (o.routeNetwork || '').toLowerCase().includes(q));
  }, [sourceOpts, sourceSearch, sourceFilter]);

  const filteredTargetOpts = useMemo(() => {
    let list = targetOpts;
    if (targetFilter === 'crypto') list = list.filter(o => o.kind === 'crypto-network');
    if (targetFilter === 'fiat') list = list.filter(o => o.kind !== 'crypto-network');
    if (!targetSearch) return list;
    const q = targetSearch.toLowerCase();
    return list.filter(o => o.title.toLowerCase().includes(q) || o.assetCode.toLowerCase().includes(q) || (o.routeNetwork || '').toLowerCase().includes(q));
  }, [targetOpts, targetSearch, targetFilter]);

  useEffect(() => {
    if ((mode === 'swap' && config) || (mode === 'convert' && quickexConfig)) {
      if (!sourceId && sourceOpts.length > 0) {
        setSourceId(sourceOpts[0].id);
      }
    }
  }, [config, quickexConfig, sourceId, sourceOpts, mode]);

  useEffect(() => {
    if (sourceId && targetOpts.length > 0) {
      if (!targetOpts.find(o => o.id === targetId)) {
        setTargetId(targetOpts[0].id);
      }
    }
  }, [sourceId, targetOpts, targetId]);

  useEffect(() => {
    // Reset quote and destination fields when route or amount changes
    setQuoteData(null);
    setDestinationAddress('');
    setDestinationMemo('');
    setRefundAddress('');
    setRefundMemo('');
    setSettlementFields({});
    setErrorMsg('');
    orderRequestIdRef.current = crypto.randomUUID();
  }, [mode, sourceId, targetId, amount]);

  const sourceOpt = sourceOpts.find(o => o.id === sourceId);
  const targetOpt = targetOpts.find(o => o.id === targetId);

  // Pricing (Manual Swap Only)
  const { data: pricing, isLoading: isPricingLoading } = useGetExchangeRoutePricing(
    { sourceSettlementOptionId: sourceId, targetSettlementOptionId: targetId },
    { query: {
        enabled: mode === 'swap' && !!sourceId && !!targetId && step === 1,
        queryKey: getGetExchangeRoutePricingQueryKey({ sourceSettlementOptionId: sourceId, targetSettlementOptionId: targetId })
      }
    }
  );

  const parsedAmount = parseFloat(amount) || 0;

  // Mutations
  const createQuote = useCreateExchangeQuote({ request: { headers } });
  const createOrder = useCreateExchangeOrder({ request: { headers } });
  const createQuickexQuote = useCreateQuickexQuote({ request: { headers } });
  const createQuickexOrder = useCreateQuickexOrder({ request: { headers } });
  const linkOrder = useLinkTelegramMiniAppOrder({ request: { headers } });

  const [quoteData, setQuoteData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const receiveAmount = mode === 'swap'
    ? (pricing ? parsedAmount * pricing.rate : 0)
    : quoteData?.receiveAmount;

  useEffect(() => {
    const requestVersion = ++quoteRequestVersionRef.current;
    if (mode === 'convert' && step === 1 && sourceOpt && targetOpt && parsedAmount > 0) {
      const timer = setTimeout(async () => {
        setIsProcessing(true);
        try {
          const res = await createQuickexQuote.mutateAsync({
            data: {
              type: 'instant',
              fromAsset: sourceOpt.assetCode,
              fromNetwork: sourceOpt.routeNetwork,
              toAsset: targetOpt.assetCode,
              toNetwork: targetOpt.routeNetwork,
              amount: parsedAmount,
              rateMode: 'FLOATING'
            }
          });
          if (quoteRequestVersionRef.current !== requestVersion) return;
          setQuoteData({
            quoteId: res.quoteId,
            receiveAmount: res.receiveAmount,
            rate: res.rate,
            fee: res.fee,
            minAmount: res.minAmount,
            maxAmount: res.maxAmount,
            type: 'instant'
          });
          setErrorMsg('');
        } catch (err: any) {
          if (quoteRequestVersionRef.current !== requestVersion) return;
          setErrorMsg(err.message || 'Failed to get quote');
          setQuoteData(null);
        } finally {
          if (quoteRequestVersionRef.current === requestVersion) setIsProcessing(false);
        }
      }, 450);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [mode, step, sourceId, targetId, parsedAmount, sourceOpt, targetOpt]);

  const getLogoUrl = (url?: string) => {
    if (!url) return undefined;
    return url.startsWith('/objects/') ? `/api/storage${url}` : url;
  };

  const handleContinue = async () => {
    if (step === 1) {
      if (!sourceOpt || !targetOpt) {
        setErrorMsg('Please select both source and target assets');
        return;
      }
      if (parsedAmount <= 0) return;

      const minAmount = mode === 'swap' ? pricing?.minAmount : quoteData?.minAmount;
      const maxAmount = mode === 'swap' ? pricing?.maxAmount : quoteData?.maxAmount;

      if (minAmount && parsedAmount < minAmount) {
        setErrorMsg(`Minimum amount is ${minAmount}`);
        haptic.notification('error');
        return;
      }
      if (maxAmount && parsedAmount > maxAmount) {
        setErrorMsg(`Maximum amount is ${maxAmount}`);
        haptic.notification('error');
        return;
      }

      if (mode === 'convert') {
        if (!quoteData) {
          setErrorMsg('Waiting for quote...');
          return;
        }
        setErrorMsg('');
        haptic.impact('medium');
        setStep(2);
        return;
      }

      setErrorMsg('');
      setIsProcessing(true);

      try {
        const quote = await createQuote.mutateAsync({
          data: {
            type: 'manual',
            fromAsset: sourceOpt.assetCode,
            fromNetwork: sourceOpt.routeNetwork,
            toAsset: targetOpt.assetCode,
            toNetwork: targetOpt.routeNetwork,
            amount: parsedAmount,
            sourceSettlementOptionId: sourceOpt.id,
            targetSettlementOptionId: targetOpt.id
          }
        });
        setQuoteData({ ...quote, type: 'manual' });
        haptic.impact('medium');
        setStep(2);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to get quote');
        haptic.notification('error');
      } finally {
        setIsProcessing(false);
      }
    } else if (step === 2) {
      if (!sourceOpt || !targetOpt) return;
      // Validate fields
      if (mode === 'convert') {
        if (!destinationAddress) {
          setErrorMsg('Destination address is required');
          haptic.notification('warning');
          return;
        }
        if (targetOpt.original.requiresMemo && !destinationMemo) {
          setErrorMsg('Destination memo is required');
          haptic.notification('warning');
          return;
        }
        if (refundAddress && sourceOpt.original.requiresMemo && !refundMemo) {
          setErrorMsg('Refund memo is required if refund address is provided');
          haptic.notification('warning');
          return;
        }
      } else {
        if (targetOpt.kind === 'crypto-network' && !destinationAddress && !quoteData?.requiredSettlementFields?.some((f: any) => f.type === 'wallet-address' || f.key.includes('address'))) {
          setErrorMsg('Destination address is required');
          haptic.notification('warning');
          return;
        }

        if (quoteData?.requiredSettlementFields) {
          for (const field of quoteData.requiredSettlementFields) {
            let isVisible = true;
            if (field.requiredWhen) {
              const { fieldKey, equals } = field.requiredWhen;
              const matchVal = settlementFields[fieldKey];
              const equalsArr = Array.isArray(equals) ? equals : [equals];
              if (!equalsArr.includes(matchVal)) {
                isVisible = false;
              }
            }
            if (isVisible && field.required && !settlementFields[field.key]) {
              setErrorMsg(`${field.label} is required`);
              haptic.notification('warning');
              return;
            }
          }
        }
      }

      setErrorMsg('');
      haptic.impact('medium');
      setStep(3);
    } else if (step === 3) {
      if (!sourceOpt || !targetOpt) return;
      // Place Order

      setIsProcessing(true);
      try {
        let order;
        if (mode === 'convert') {
          order = await createQuickexOrder.mutateAsync({
            data: {
              type: 'instant',
              fromAsset: sourceOpt.assetCode,
              fromNetwork: sourceOpt.routeNetwork,
              toAsset: targetOpt.assetCode,
              toNetwork: targetOpt.routeNetwork,
              amount: parsedAmount,
              quoteId: quoteData.quoteId,
              rateMode: 'FLOATING',
              destinationAddress: destinationAddress.trim(),
              destinationMemo: destinationMemo.trim() || undefined,
              ...(refundAddress.trim() ? {
                refundAddress: refundAddress.trim(),
                refundMemo: refundMemo.trim() || undefined,
              } : {}),
              clientRequestId: orderRequestIdRef.current
            }
          });
        } else {
          order = await createOrder.mutateAsync({
            data: {
              type: 'manual',
              fromAsset: sourceOpt.assetCode,
              fromNetwork: sourceOpt.routeNetwork,
              toAsset: targetOpt.assetCode,
              toNetwork: targetOpt.routeNetwork,
              amount: parsedAmount,
              quoteId: quoteData.quoteId,
              clientRequestId: orderRequestIdRef.current,
              destinationAddress: destinationAddress || undefined,
              settlementDetails: Object.keys(settlementFields).length > 0 ? settlementFields : undefined,
              sourceSettlementOptionId: sourceOpt.id,
              targetSettlementOptionId: targetOpt.id
            }
          });
        }

        haptic.notification('success');

        await linkOrder.mutateAsync({
          data: {
            orderId: order.id,
            trackingToken: order.trackingToken,
            orderKind: mode === 'convert' ? 'convert' : (quoteData.type === 'manual' ? 'manual' : 'swap')
          }
        });

        setLocation(`/orders/${order.id}`);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to place order');
        haptic.notification('error');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleSwapAssets = () => {
    haptic.impact('light');
    setSourceId(targetId);
    setTargetId(sourceId);
  };

  if ((mode === 'swap' && isConfigLoading) || (mode === 'convert' && isQuickexConfigLoading)) {
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
    <div className="flex flex-col p-4 space-y-4 pt-6 max-w-md mx-auto w-full relative pb-24 animate-in slide-in-from-bottom-4 duration-500">

      {step === 1 && (
        <div className="flex bg-muted/50 p-1 rounded-2xl mb-2 backdrop-blur-md border border-white/5 relative z-10">
          <button
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
              mode === 'swap' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode('swap')}
          >
            Swap
          </button>
          <button
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
              mode === 'convert' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode('convert')}
          >
            Convert
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-2 mt-2">
        <h1 className="text-[22px] font-bold tracking-tight">
          {step === 1 ? (mode === 'convert' ? 'Convert' : 'Swap') : step === 2 ? 'Details' : 'Review'}
        </h1>
        {step > 1 && (
          <button
            onClick={() => {
              setStep((s) => s - 1 as any);
              haptic.selection();
            }}
            className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1 bg-white/5 rounded-full"
          >
            Back
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3.5 rounded-2xl flex items-start text-sm animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-[18px] h-[18px] mt-[1px] mr-2 shrink-0 opacity-80" />
          <span className="font-medium leading-tight">{errorMsg}</span>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2 relative">
          <div className="premium-card p-5 space-y-4">
            <div className="flex justify-between text-[13px] text-muted-foreground font-semibold uppercase tracking-wider">
              <span>You Send</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-transparent text-[40px] font-bold w-full outline-none focus:ring-0 appearance-none placeholder:text-muted/50 tracking-tighter"
                placeholder="0"
              />
              <button
                onClick={() => setShowSourceSelector(!showSourceSelector)}
                className="flex items-center space-x-2 bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 transition-all px-3.5 py-2 rounded-2xl shrink-0 active:scale-95"
              >
                {getLogoUrl(sourceOpt?.logoUrl) ? (
                  <img src={getLogoUrl(sourceOpt?.logoUrl)} alt="" className="w-[26px] h-[26px] rounded-full object-contain" />
                ) : (
                  <div className="w-[26px] h-[26px] rounded-full bg-secondary/30" />
                )}
                <span className="font-bold text-[15px]">{sourceOpt?.assetCode || 'Select'}</span>
                <ChevronDown className="w-4 h-4 text-secondary/70 stroke-[3px]" />
              </button>
            </div>

            {showSourceSelector && (
              <div className="pt-3 mt-4 border-t border-border/50 space-y-2">
                <div className="relative">
                  <Input
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                    placeholder="Search asset or method..."
                    autoFocus={false}
                    className="bg-background/50 h-10 rounded-xl border-white/5 focus-visible:ring-primary/50 text-[13px] shadow-sm"
                  />
                </div>
                <div className="flex space-x-2 pt-1">
                  {(['all', 'crypto', 'fiat'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setSourceFilter(f)}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors",
                        sourceFilter === f ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground hover:bg-white/10"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="max-h-[220px] overflow-y-auto hide-scrollbar space-y-1 pt-1">
                  {filteredSourceOpts.length === 0 && (
                    <div className="p-3 text-center text-[12px] text-muted-foreground">No options found.</div>
                  )}
                  {filteredSourceOpts.map(o => (
                    <button
                      key={o.id}
                      onClick={() => { setSourceId(o.id); setShowSourceSelector(false); setSourceSearch(''); haptic.selection(); }}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors group",
                        sourceId === o.id && "bg-primary/10 border border-primary/20"
                      )}
                    >
                    <div className="flex items-center space-x-3">
                      {getLogoUrl(o.logoUrl) ? (
                        <img src={getLogoUrl(o.logoUrl)} alt="" className="w-[28px] h-[28px] rounded-full object-contain bg-white/10" />
                      ) : <div className="w-[28px] h-[28px] rounded-full bg-muted/50" />}
                      <div className="flex flex-col items-start">
                        <span className="font-bold text-[15px] group-hover:text-primary transition-colors">{o.title}</span>
                        <span className="text-[11px] font-medium text-muted-foreground">{o.assetCode}</span>
                      </div>
                    </div>
                  </button>
                ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center -my-[18px] relative z-20">
            <button
              onClick={handleSwapAssets}
              className="w-12 h-12 rounded-full bg-card border-[4px] border-background flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all shadow-lg active:scale-90"
            >
              <ArrowDownUp className="w-5 h-5 stroke-[2.5px]" />
            </button>
          </div>

          <div className="premium-card p-5 space-y-4">
            <div className="flex justify-between text-[13px] text-muted-foreground font-semibold uppercase tracking-wider">
              <span>You Receive</span>
              {isPricingLoading && <span className="animate-pulse text-primary">Fetching rate...</span>}
            </div>
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                value={receiveAmount ? receiveAmount.toFixed(6) : ''}
                readOnly
                className="bg-transparent text-[40px] font-bold w-full outline-none focus:ring-0 appearance-none text-foreground/80 tracking-tighter truncate"
                placeholder="0"
              />
              <button
                onClick={() => setShowTargetSelector(!showTargetSelector)}
                className="flex items-center space-x-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all px-3.5 py-2 rounded-2xl shrink-0 active:scale-95"
              >
                {getLogoUrl(targetOpt?.logoUrl) ? (
                  <img src={getLogoUrl(targetOpt?.logoUrl)} alt="" className="w-[26px] h-[26px] rounded-full object-contain" />
                ) : (
                  <div className="w-[26px] h-[26px] rounded-full bg-primary/30" />
                )}
                <span className="font-bold text-[15px]">{targetOpt?.assetCode || 'Select'}</span>
                <ChevronDown className="w-4 h-4 text-primary/70 stroke-[3px]" />
              </button>
            </div>

            {showTargetSelector && (
              <div className="pt-3 mt-4 border-t border-border/50 space-y-2">
                <div className="relative">
                  <Input
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                    placeholder="Search asset or method..."
                    autoFocus={false}
                    className="bg-background/50 h-10 rounded-xl border-white/5 focus-visible:ring-primary/50 text-[13px] shadow-sm"
                  />
                </div>
                <div className="flex space-x-2 pt-1">
                  {(['all', 'crypto', 'fiat'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setTargetFilter(f)}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors",
                        targetFilter === f ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground hover:bg-white/10"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="max-h-[220px] overflow-y-auto hide-scrollbar space-y-1 pt-1">
                  {filteredTargetOpts.length === 0 && (
                    <div className="p-3 text-center text-[12px] text-muted-foreground">No options found.</div>
                  )}
                  {filteredTargetOpts.map(o => (
                    <button
                      key={o.id}
                      onClick={() => { setTargetId(o.id); setShowTargetSelector(false); setTargetSearch(''); haptic.selection(); }}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors group",
                        targetId === o.id && "bg-primary/10 border border-primary/20"
                      )}
                    >
                    <div className="flex items-center space-x-3">
                      {getLogoUrl(o.logoUrl) ? (
                        <img src={getLogoUrl(o.logoUrl)} alt="" className="w-[28px] h-[28px] rounded-full object-contain bg-white/10" />
                      ) : <div className="w-[28px] h-[28px] rounded-full bg-muted/50" />}
                      <div className="flex flex-col items-start">
                        <span className="font-bold text-[15px] group-hover:text-primary transition-colors">{o.title}</span>
                        <span className="text-[11px] font-medium text-muted-foreground">{o.assetCode}</span>
                      </div>
                    </div>
                  </button>
                ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 text-[13px] font-medium text-center text-muted-foreground/80">
            {mode === 'swap' && pricing
              ? `1 ${sourceOpt?.assetCode} = ${pricing.rate} ${targetOpt?.assetCode}`
              : mode === 'convert' && quoteData
              ? `1 ${sourceOpt?.assetCode} = ${quoteData.rate} ${targetOpt?.assetCode}`
              : 'Select a valid pair and amount to see the rate'}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <div className="premium-card p-5 space-y-5 surface-animated">
            <h3 className="font-bold text-lg flex items-center tracking-tight">
              <Wallet className="w-[18px] h-[18px] mr-2 text-primary" />
              Receiving Details
            </h3>

            {mode === 'convert' ? (
              <>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-wider">
                    Destination {targetOpt.assetCode} Address
                  </label>
                  <Input
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    placeholder="Enter wallet address"
                    className="bg-background/80 h-14 rounded-2xl border-white/10 focus-visible:ring-primary/50 text-[15px] shadow-inner font-mono"
                  />
                </div>
                {targetOpt?.original?.requiresMemo && (
                  <div className="space-y-2 mt-4">
                    <label className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-wider">
                      Destination Memo / Tag
                    </label>
                    <Input
                      value={destinationMemo}
                      onChange={(e) => setDestinationMemo(e.target.value)}
                      placeholder="Enter memo"
                      className="bg-background/80 h-14 rounded-2xl border-white/10 focus-visible:ring-primary/50 text-[15px] shadow-inner font-mono"
                    />
                  </div>
                )}

                <div className="pt-4 border-t border-border/50 mt-6">
                  <h4 className="text-[14px] font-bold text-muted-foreground mb-3">Optional Refund Details</h4>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-wider">
                      Refund {sourceOpt.assetCode} Address
                    </label>
                    <Input
                      value={refundAddress}
                      onChange={(e) => setRefundAddress(e.target.value)}
                      placeholder="Enter refund address (optional)"
                      className="bg-background/80 h-14 rounded-2xl border-white/10 focus-visible:ring-primary/50 text-[15px] shadow-inner font-mono"
                    />
                  </div>
                  {sourceOpt?.original?.requiresMemo && (
                    <div className="space-y-2 mt-4">
                      <label className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-wider">
                        Refund Memo / Tag
                      </label>
                      <Input
                        value={refundMemo}
                        onChange={(e) => setRefundMemo(e.target.value)}
                        placeholder="Enter refund memo"
                        className="bg-background/80 h-14 rounded-2xl border-white/10 focus-visible:ring-primary/50 text-[15px] shadow-inner font-mono"
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {targetOpt?.kind === 'crypto-network' && !quoteData?.requiredSettlementFields?.some((f: any) => f.type === 'wallet-address' || f.key.includes('address')) && (
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-wider">
                      Destination {targetOpt.assetCode} Address
                    </label>
                    <Input
                      value={destinationAddress}
                      onChange={(e) => setDestinationAddress(e.target.value)}
                      placeholder="Enter wallet address"
                      className="bg-background/80 h-14 rounded-2xl border-white/10 focus-visible:ring-primary/50 text-[15px] shadow-inner font-mono"
                    />
                  </div>
                )}

                {quoteData?.requiredSettlementFields && quoteData.requiredSettlementFields.map((field: any) => {
                  let isVisible = true;
                  if (field.requiredWhen) {
                    const { fieldKey, equals } = field.requiredWhen;
                    const matchVal = settlementFields[fieldKey];
                    const equalsArr = Array.isArray(equals) ? equals : [equals];
                    if (!equalsArr.includes(matchVal)) {
                      isVisible = false;
                    }
                  }
                  if (!isVisible) return null;

                  return (
                    <div key={field.key} className="space-y-2 mt-4">
                      <label className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-wider">
                        {field.label} {field.required && <span className="text-primary">*</span>}
                      </label>
                      <Input
                        value={settlementFields[field.key] || ''}
                        onChange={(e) => setSettlementFields(prev => ({...prev, [field.key]: e.target.value}))}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                        className="bg-background/80 h-14 rounded-2xl border-white/10 focus-visible:ring-primary/50 text-[15px] shadow-inner"
                      />
                    </div>
                  );
                })}
              </>
            )}

            {mode === 'swap' && (!quoteData?.requiredSettlementFields || quoteData.requiredSettlementFields.length === 0) && targetOpt?.kind !== 'crypto-network' && (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center">
                <p className="text-[14px] font-medium text-muted-foreground">No additional details required.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <div className="premium-card p-5 space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-[14px] font-semibold text-muted-foreground">You Send</span>
              <span className="font-bold text-[16px]">{amount} {sourceOpt?.assetCode}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-[14px] font-semibold text-muted-foreground">You Receive</span>
              <span className="font-bold text-[16px] text-primary">{quoteData?.receiveAmount} {targetOpt?.assetCode}</span>
            </div>
            {targetOpt?.kind === 'crypto-network' && (
              <div className="flex justify-between items-center py-3 border-b border-border/50">
                <span className="text-[14px] font-semibold text-muted-foreground">Destination</span>
                <span className="text-[13px] font-mono max-w-[150px] truncate text-foreground/80 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                  {destinationAddress || Object.values(settlementFields)[0] || 'Pending'}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center py-3 border-b border-border/50">
              <span className="text-[14px] font-semibold text-muted-foreground">Network Fee</span>
              <span className="text-[14px] font-bold">{quoteData?.fee || 'Included'}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-[14px] font-semibold text-muted-foreground">Exchange Rate</span>
              <span className="text-[14px] font-bold bg-secondary/10 text-secondary px-2 py-1 rounded-lg">1 {sourceOpt?.assetCode} = {quoteData?.rate} {targetOpt?.assetCode}</span>
            </div>
          </div>

          <div className="flex items-start text-[12px] text-muted-foreground px-3 pt-2 bg-primary/5 p-3 rounded-xl border border-primary/10">
            <CheckCircle2 className="w-[18px] h-[18px] mr-2.5 text-primary shrink-0 opacity-80" />
            <span className="leading-snug">By placing this order, you agree to the terms of service and confirm the destination details are correct.</span>
          </div>
        </div>
      )}

      <div className="pt-6">
        <Button
          className="w-full h-[56px] rounded-2xl text-[17px] font-bold shadow-[0_8px_20px_-8px_hsl(var(--primary))] transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 illuminated-border"
          onClick={handleContinue}
          disabled={isProcessing || isPricingLoading || (mode === 'swap' && !pricing && step === 1) || (mode === 'convert' && !quoteData && step === 1)}
        >
          {isProcessing ? (
            <span className="flex items-center">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...
            </span>
          ) : step === 1 ? 'Continue' : step === 2 ? 'Review Order' : 'Place Order'}
        </Button>
      </div>

    </div>
  );
}