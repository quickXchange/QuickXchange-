import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import { 
  useGetExchangeConfig, getGetExchangeConfigQueryKey,
  useGetExchangeRoutePricing, getGetExchangeRoutePricingQueryKey,
  useCreateExchangeQuote,
  useCreateExchangeOrder,
  useLinkTelegramMiniAppOrder
} from '@workspace/api-client-react';
import { useAuth, useAuthHeaders } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, CheckCircle2, AlertCircle, ChevronDown, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/lib/hooks';

export default function Exchange() {
  const [, setLocation] = useLocation();
  const { isMock } = useAuth();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const searchParams = new URLSearchParams(window.location.search);
  const initMode = searchParams.get('mode') || 'convert'; // convert or swap

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [amount, setAmount] = useState<string>('100');
  
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [showTargetSelector, setShowTargetSelector] = useState(false);

  // Form state
  const [destinationAddress, setDestinationAddress] = useState('');
  const [settlementFields, setSettlementFields] = useState<Record<string, string>>({});
  
  // Data hooks
  const { data: config, isLoading: isConfigLoading } = useGetExchangeConfig({
    query: { queryKey: getGetExchangeConfigQueryKey() }
  });

  const sourceOpts = useMemo(() => {
    if (!config) return [];
    return config.settlementOptions.filter(o => o.direction === 'send' || o.direction === 'both');
  }, [config]);

  const targetOpts = useMemo(() => {
    if (!config) return [];
    return config.settlementOptions.filter(o => o.direction === 'receive' || o.direction === 'both');
  }, [config]);

  // Set defaults
  useEffect(() => {
    if (config && !sourceId && sourceOpts.length > 0) {
      setSourceId(sourceOpts[0].id);
    }
    if (config && !targetId && targetOpts.length > 0) {
      const validTargets = targetOpts.filter(o => o.id !== (sourceId || sourceOpts[0]?.id));
      if (validTargets.length > 0) {
        setTargetId(validTargets[0].id);
      } else {
        setTargetId(targetOpts[0].id);
      }
    }
  }, [config, sourceId, targetId, sourceOpts, targetOpts]);

  const sourceOpt = sourceOpts.find(o => o.id === sourceId);
  const targetOpt = targetOpts.find(o => o.id === targetId);

  // Pricing
  const { data: pricing, isLoading: isPricingLoading } = useGetExchangeRoutePricing(
    { sourceSettlementOptionId: sourceId, targetSettlementOptionId: targetId },
    { query: { 
        enabled: !!sourceId && !!targetId && step === 1,
        queryKey: getGetExchangeRoutePricingQueryKey({ sourceSettlementOptionId: sourceId, targetSettlementOptionId: targetId })
      } 
    }
  );

  const parsedAmount = parseFloat(amount) || 0;
  const receiveAmount = pricing ? parsedAmount * pricing.rate : 0;

  // Mutations
  const createQuote = useCreateExchangeQuote({ request: { headers } });
  const createOrder = useCreateExchangeOrder({ request: { headers } });
  const linkOrder = useLinkTelegramMiniAppOrder({ request: { headers } });

  const [quoteData, setQuoteData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
      if (pricing?.minAmount && parsedAmount < pricing.minAmount) {
        setErrorMsg(`Minimum amount is ${pricing.minAmount}`);
        haptic.notification('error');
        return;
      }
      if (pricing?.maxAmount && parsedAmount > pricing.maxAmount) {
        setErrorMsg(`Maximum amount is ${pricing.maxAmount}`);
        haptic.notification('error');
        return;
      }
      
      setErrorMsg('');
      setIsProcessing(true);
      
      try {
        const quote = await createQuote.mutateAsync({
          data: {
            type: sourceOpt?.executionMode === 'manual' ? 'manual' : 'instant',
            fromAsset: sourceOpt.assetCode,
            fromNetwork: sourceOpt.routeNetwork,
            toAsset: targetOpt.assetCode,
            toNetwork: targetOpt.routeNetwork,
            amount: parsedAmount,
            sourceSettlementOptionId: sourceOpt.id,
            targetSettlementOptionId: targetOpt.id
          }
        });
        setQuoteData(quote);
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
      if (targetOpt.kind === 'crypto-network' && !destinationAddress) {
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

      setErrorMsg('');
      haptic.impact('medium');
      setStep(3);
    } else if (step === 3) {
      if (!sourceOpt || !targetOpt) return;
      // Place Order
      if (isMock) {
        haptic.notification('error');
        setErrorMsg('Orders cannot be placed in Preview Mode');
        return;
      }

      setIsProcessing(true);
      try {
        const order = await createOrder.mutateAsync({
          data: {
            type: sourceOpt.executionMode === 'manual' ? 'manual' : 'instant',
            fromAsset: sourceOpt.assetCode,
            fromNetwork: sourceOpt.routeNetwork,
            toAsset: targetOpt.assetCode,
            toNetwork: targetOpt.routeNetwork,
            amount: parsedAmount,
            quoteId: quoteData.quoteId,
            clientRequestId: crypto.randomUUID(),
            destinationAddress: destinationAddress || undefined,
            settlementDetails: Object.keys(settlementFields).length > 0 ? settlementFields : undefined,
            sourceSettlementOptionId: sourceOpt.id,
            targetSettlementOptionId: targetOpt.id
          }
        });

        haptic.notification('success');

        // Link order
        await linkOrder.mutateAsync({
          data: {
            orderId: order.id,
            trackingToken: order.trackingToken,
            orderKind: quoteData.type === 'manual' ? 'swap' : 'convert'
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

  if (isConfigLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 space-y-4 pt-6 max-w-md mx-auto w-full relative">
      
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">
          {step === 1 ? 'Exchange' : step === 2 ? 'Details' : 'Review'}
        </h1>
        {step > 1 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              setStep((s) => s - 1 as any);
              haptic.selection();
            }}
            className="text-xs"
          >
            Back
          </Button>
        )}
      </div>

      {errorMsg && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-xl flex items-start text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 mr-2 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          {/* You Send */}
          <div className="premium-card p-4 space-y-3">
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>You Send</span>
            </div>
            <div className="flex items-center justify-between">
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-transparent text-3xl font-bold w-full outline-none focus:ring-0 appearance-none placeholder:text-muted"
                placeholder="0"
              />
              <button 
                onClick={() => setShowSourceSelector(!showSourceSelector)}
                className="flex items-center space-x-2 bg-secondary/10 hover:bg-secondary/20 transition-colors px-3 py-1.5 rounded-full shrink-0 ml-2"
              >
                {getLogoUrl(sourceOpt?.logoUrl) ? (
                  <img src={getLogoUrl(sourceOpt?.logoUrl)} alt="" className="w-6 h-6 rounded-full object-contain" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-secondary/20" />
                )}
                <span className="font-bold text-sm">{sourceOpt?.assetCode || 'Select'}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            
            {showSourceSelector && (
              <div className="pt-3 mt-3 border-t border-border/50 max-h-48 overflow-y-auto hide-scrollbar space-y-1">
                {sourceOpts.map(o => (
                  <button 
                    key={o.id}
                    onClick={() => { setSourceId(o.id); setShowSourceSelector(false); haptic.selection(); }}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors",
                      sourceId === o.id && "bg-primary/10"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      {getLogoUrl(o.logoUrl) ? (
                        <img src={getLogoUrl(o.logoUrl)} alt="" className="w-6 h-6 rounded-full object-contain" />
                      ) : <div className="w-6 h-6 rounded-full bg-muted" />}
                      <span className="font-medium text-sm">{o.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-center -my-2 relative z-10">
            <button 
              onClick={handleSwapAssets}
              className="w-10 h-10 rounded-full bg-card border-4 border-background flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shadow-sm"
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>
          </div>

          {/* You Receive */}
          <div className="premium-card p-4 space-y-3">
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>You Receive</span>
              {isPricingLoading && <span className="animate-pulse">Fetching rate...</span>}
            </div>
            <div className="flex items-center justify-between">
              <input 
                type="text" 
                value={receiveAmount ? receiveAmount.toFixed(6) : ''}
                readOnly
                className="bg-transparent text-3xl font-bold w-full outline-none focus:ring-0 appearance-none text-foreground/80"
                placeholder="0"
              />
              <button 
                onClick={() => setShowTargetSelector(!showTargetSelector)}
                className="flex items-center space-x-2 bg-primary/10 hover:bg-primary/20 transition-colors px-3 py-1.5 rounded-full shrink-0 ml-2"
              >
                {getLogoUrl(targetOpt?.logoUrl) ? (
                  <img src={getLogoUrl(targetOpt?.logoUrl)} alt="" className="w-6 h-6 rounded-full object-contain" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary/20" />
                )}
                <span className="font-bold text-sm">{targetOpt?.assetCode || 'Select'}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            
            {showTargetSelector && (
              <div className="pt-3 mt-3 border-t border-border/50 max-h-48 overflow-y-auto hide-scrollbar space-y-1">
                {targetOpts.map(o => (
                  <button 
                    key={o.id}
                    onClick={() => { setTargetId(o.id); setShowTargetSelector(false); haptic.selection(); }}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors",
                      targetId === o.id && "bg-primary/10"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      {getLogoUrl(o.logoUrl) ? (
                        <img src={getLogoUrl(o.logoUrl)} alt="" className="w-6 h-6 rounded-full object-contain" />
                      ) : <div className="w-6 h-6 rounded-full bg-muted" />}
                      <span className="font-medium text-sm">{o.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="pt-4 text-xs text-center text-muted-foreground">
            {pricing ? `1 ${sourceOpt?.assetCode} = ${pricing.rate} ${targetOpt?.assetCode}` : 'Select pairs to see rate'}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="premium-card p-4 space-y-4">
            <h3 className="font-semibold flex items-center">
              <Wallet className="w-4 h-4 mr-2 text-primary" />
              Receiving Details
            </h3>
            
            {targetOpt?.kind === 'crypto-network' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Destination {targetOpt.assetCode} Address
                </label>
                <Input 
                  value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value)}
                  placeholder="Enter wallet address"
                  className="bg-background/50 h-12 rounded-xl border-white/10 focus-visible:ring-primary/30"
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
                <div key={field.key} className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {field.label} {field.required && '*'}
                  </label>
                  <Input 
                    value={settlementFields[field.key] || ''}
                    onChange={(e) => setSettlementFields(prev => ({...prev, [field.key]: e.target.value}))}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    className="bg-background/50 h-12 rounded-xl border-white/10 focus-visible:ring-primary/30"
                  />
                </div>
              );
            })}
            
            {(!quoteData?.requiredSettlementFields || quoteData.requiredSettlementFields.length === 0) && targetOpt?.kind !== 'crypto-network' && (
              <p className="text-sm text-muted-foreground">No additional details required.</p>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="premium-card p-4 space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-sm text-muted-foreground">You Send</span>
              <span className="font-bold">{amount} {sourceOpt?.assetCode}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-sm text-muted-foreground">You Receive</span>
              <span className="font-bold text-primary">{quoteData?.receiveAmount} {targetOpt?.assetCode}</span>
            </div>
            {targetOpt?.kind === 'crypto-network' && (
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-muted-foreground">Destination</span>
                <span className="text-xs font-mono max-w-[150px] truncate">{destinationAddress}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-sm text-muted-foreground">Network Fee</span>
              <span className="text-sm">{quoteData?.fee || 0}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Exchange Rate</span>
              <span className="text-sm font-medium">1 {sourceOpt?.assetCode} = {quoteData?.rate} {targetOpt?.assetCode}</span>
            </div>
          </div>
          
          <div className="flex items-center text-xs text-muted-foreground px-2">
            <CheckCircle2 className="w-4 h-4 mr-2 text-green-500 shrink-0" />
            <span>By placing this order, you agree to the terms of service and confirm the destination details are correct.</span>
          </div>
        </div>
      )}

      <div className="pt-4">
        <Button 
          className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]" 
          onClick={handleContinue}
          disabled={isProcessing || isPricingLoading || (!pricing && step === 1)}
        >
          {isProcessing ? 'Processing...' : step === 1 ? 'Continue' : step === 2 ? 'Review Order' : 'Place Order'}
        </Button>
      </div>

    </div>
  );
}
