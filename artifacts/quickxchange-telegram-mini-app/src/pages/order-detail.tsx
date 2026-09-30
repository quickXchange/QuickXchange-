import { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import {
  useGetTelegramMiniAppOrder, getGetTelegramMiniAppOrderQueryKey,
  useGetPublicOrderStatus, getGetPublicOrderStatusQueryKey,
  useGetExchangeConfig, getGetExchangeConfigQueryKey,
  getListTelegramMiniAppOrdersQueryKey,
  useMarkOrderPaid
} from '@workspace/api-client-react';
import { useAuth, useAuthHeaders } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { useBackButton, useHapticFeedback } from '@/lib/hooks';
import {
  ChevronLeft, RefreshCcw, Check, Copy, ArrowDown, ExternalLink,
  AlertCircle, Loader2, CheckCircle2, XCircle, Clock3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MiniAppLogo } from '@/components/mini-app-logo';
import { resolveOrderVisual } from '@/lib/logo-catalog';
import {
  normalizeSwapOrderStatus,
  orderTimelineLineWidthPercent,
  projectSwapOrderTimeline,
  swapOrderStatusCompleted,
  swapOrderStatusFailed,
  swapOrderStatusTerminal,
} from '@/lib/swap-order-status';
import {
  convertOrderStatusLabel,
  convertOrderStatusStep,
  isConvertTerminalStatus,
} from '@/lib/convert-order-status';
import { DepositDetailsModal } from '@/components/deposit-details-modal';
import { isOrderDepositActionable } from '@/lib/deposit-actionability';

function formatFeeAmount(value: unknown): string {
  if (value === null || value === undefined) return '';
  const amount = String(value);
  if (!amount.includes('.')) return amount;
  return amount.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function hasNonZeroFeeAmount(value: unknown): boolean {
  return formatFeeAmount(value).replace('.', '').replace(/^0+/, '') !== '';
}

export default function OrderDetail() {
  const [, params] = useRoute('/orders/:id');
  const [, setLocation] = useLocation();
  const { supportUrl } = useAuth();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();
  const { data: exchangeConfig } = useGetExchangeConfig({
    query: { queryKey: getGetExchangeConfigQueryKey(), staleTime: 60_000 },
  });

  const orderId = params?.id || '';

  useBackButton(() => {
    setLocation('/orders');
  });

  const { data: orderData, isLoading: isOrderLoading } = useGetTelegramMiniAppOrder(
    orderId,
    {
      query: {
        queryKey: getGetTelegramMiniAppOrderQueryKey(orderId),
        enabled: !!orderId && Boolean(headers.Authorization)
      },
      request: { headers }
    }
  );

  const trackingToken = orderData?.trackingToken;

  const { data: publicStatus, refetch: refetchStatus, isFetching: isRefreshingStatus } = useGetPublicOrderStatus(
    orderId,
    { trackingToken: trackingToken || '' },
    {
      query: {
        queryKey: getGetPublicOrderStatusQueryKey(orderId, { trackingToken: trackingToken || '' }),
        enabled: !!trackingToken,
        refetchOnWindowFocus: 'always',
          refetchOnReconnect: 'always',
        refetchIntervalInBackground: true,
        refetchInterval: (query) => {
          const status = query.state.data?.status || '';
          if (orderData?.orderKind !== 'convert' && swapOrderStatusTerminal(status)) return false;
          if (orderData?.orderKind === 'convert' && isConvertTerminalStatus(status)) return false;
          return 3000;
        }
      }
    }
  );

  const markPaid = useMarkOrderPaid({ request: { headers } });

  const [copied, setCopied] = useState<string | null>(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const handleCopy = async (text: string): Promise<boolean> => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(text);
      setCopied(text);
      haptic.selection();
      setTimeout(() => setCopied(null), 2000);
      return true;
    } catch {
      alert('Could not copy automatically. Please select and copy the value manually.');
      return false;
    }
  };

  const handleMarkPaid = async () => {
    if (!orderId || !trackingToken) return;
    haptic.impact('medium');
    try {
      await markPaid.mutateAsync({ id: orderId, data: { trackingToken } });
      haptic.notification('success');
      queryClient.setQueryData(getGetPublicOrderStatusQueryKey(orderId, { trackingToken }), (old: any) =>
        old ? { ...old, customerMarkedPaidAt: new Date().toISOString() } : old
      );
      queryClient.invalidateQueries({ queryKey: getGetTelegramMiniAppOrderQueryKey(orderId) });
      queryClient.invalidateQueries({ queryKey: getListTelegramMiniAppOrdersQueryKey() });
    } catch (err: any) {
      haptic.notification('error');
      alert(err.message || 'Failed to update order');
    }
  };

  const openSupport = () => {
    const tg = window.Telegram?.WebApp;
    if (supportUrl) {
      if (supportUrl.includes('t.me/')) {
        tg?.openTelegramLink(supportUrl);
      } else {
        tg?.openLink(supportUrl);
      }
    }
  };

  const lastStatusRef = useRef<{ orderId: string; status: string }>({ orderId: '', status: '' });
  useEffect(() => {
    const freshStatus = publicStatus?.status ?? orderData?.status;
    const normalizedStatus = normalizeSwapOrderStatus(freshStatus);
    if (!orderId || !normalizedStatus) return;
    if (lastStatusRef.current.orderId !== orderId) {
      lastStatusRef.current = { orderId, status: normalizedStatus };
      return;
    }
    if (lastStatusRef.current.status !== normalizedStatus) {
      lastStatusRef.current.status = normalizedStatus;
      void queryClient.invalidateQueries({ queryKey: getListTelegramMiniAppOrdersQueryKey() });
    }
  }, [orderData?.status, orderId, publicStatus?.status, queryClient]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        if (trackingToken?.trim()) void refetchStatus();
        void queryClient.invalidateQueries({ queryKey: getGetTelegramMiniAppOrderQueryKey(orderId) });
        void queryClient.invalidateQueries({ queryKey: getListTelegramMiniAppOrdersQueryKey() });
      }
    };
    window.addEventListener('online', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('online', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [orderId, queryClient, refetchStatus, trackingToken]);

  if (isOrderLoading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-background">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <Loader2 className="w-8 h-8 text-primary animate-spin relative z-10" />
        </div>
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background p-6 text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-bold mb-2">Order Not Found</h2>
        <p className="text-muted-foreground text-sm max-w-[240px] mx-auto mb-6">
          The order you're looking for doesn't exist or you don't have access.
        </p>
        <Button onClick={() => setLocation('/orders')} variant="secondary" className="rounded-xl font-bold">Go Back</Button>
      </div>
    );
  }

  const targetStatus = { ...orderData, ...(publicStatus || {}) };
  const status = normalizeSwapOrderStatus(targetStatus.status);
  const isManualSwap = orderData.orderKind !== 'convert' && orderData.type === 'manual';
  const canonicalSwapStatus = status;
  const swapTimeline = projectSwapOrderTimeline(targetStatus);
  const isCancelled = status === 'cancelled' || status === 'canceled';
  const isConvertCompletionAlias = ['complete', 'finished', 'paid'].includes(status);
  const convertDisplayLabel = isConvertCompletionAlias ? status.toUpperCase() : convertOrderStatusLabel(status);
  const isCompleted = isManualSwap
    ? swapOrderStatusCompleted(canonicalSwapStatus)
    : isConvertTerminalStatus(status) && status === 'completed';
  const isFailed = isManualSwap ? swapOrderStatusFailed(canonicalSwapStatus) : isConvertTerminalStatus(status) && !isCompleted;
  const currentStep = isManualSwap
    ? swapTimeline.step
    : isConvertCompletionAlias ? 3 : convertOrderStatusStep(status) + 1;
  const isConfirming = isManualSwap
    ? currentStep === 2 && !isFailed
    : !isCompleted && !isFailed && convertDisplayLabel === 'CONFIRMING';
  const isProcessing = isManualSwap
    ? currentStep === 3 && !isFailed
    : !isCompleted && !isFailed && convertDisplayLabel === 'PROCESSING';
  const isAwaitingFunding = status === 'awaiting funds' || status === 'pending';
  const showPaymentActions = isAwaitingFunding && !targetStatus?.customerMarkedPaidAt && targetStatus?.paymentDetailsApplicable;
  const verifiedFundingTransaction = targetStatus.verifiedFundingTransaction;

  const sourcePaymentMethod = (targetStatus as any).sourcePaymentMethod;
  const sourceVisual = resolveOrderVisual(exchangeConfig?.settlementOptions, targetStatus, 'source');
  const targetVisual = resolveOrderVisual(exchangeConfig?.settlementOptions, targetStatus, 'target');
  const depositAsset = targetStatus.depositAsset || targetStatus.fromAsset;
  const depositNetwork = targetStatus.depositNetwork || targetStatus.fromNetwork;
  const depositAmount = targetStatus.depositAmount || targetStatus.amount;
  const depositAssetLabel = typeof depositAsset === 'string' ? depositAsset.trim() : '';
  const depositNetworkLabel = typeof depositNetwork === 'string' ? depositNetwork.trim() : '';
  const depositAmountLabel = depositAmount === null || depositAmount === undefined ? '' : String(depositAmount).trim();
  const isCryptoDeposit = Boolean(targetStatus.depositAddress);
  const depositDetailsReady = Boolean(isCryptoDeposit && depositAssetLabel && depositNetworkLabel && depositAmountLabel);
  const depositDetailsActionable = isOrderDepositActionable(
    status,
    depositDetailsReady,
    targetStatus.customerMarkedPaidAt,
    targetStatus.outcomeUnknown,
  );
  const sourceIdentity = sourcePaymentMethod?.name || depositNetworkLabel || depositAssetLabel;
  const parsedSendAmount = Number(depositAmount);
  const parsedReceiveAmount = Number(targetStatus.receiveAmount);
  const exchangeRate = Number.isFinite(parsedSendAmount) && parsedSendAmount > 0 && Number.isFinite(parsedReceiveAmount)
    ? parsedReceiveAmount / parsedSendAmount
    : null;
  const manualSwapFees = isManualSwap
    ? (targetStatus as any).pricingSnapshot?.manualSwapFees || (targetStatus as any).manualSwapFees
    : null;

  const statusPresentation = isManualSwap
    ? isCompleted
      ? { label: swapTimeline.label, description: 'Your exchange has been completed successfully.', icon: CheckCircle2, tone: 'text-primary', surface: 'bg-primary/10' }
      : isFailed
        ? { label: swapTimeline.label, description: 'This order is no longer active.', icon: XCircle, tone: 'text-destructive', surface: 'bg-destructive/10' }
        : isProcessing
          ? { label: swapTimeline.label, description: 'Your payment was received and your order is being processed.', icon: RefreshCcw, tone: 'text-accent', surface: 'bg-accent/10' }
          : isConfirming
            ? { label: swapTimeline.label, description: 'Your payment has been detected and is confirming.', icon: Clock3, tone: 'text-amber-500', surface: 'bg-amber-500/10' }
            : { label: swapTimeline.label, description: 'Complete the payment using the order-specific details below.', icon: Clock3, tone: 'text-secondary', surface: 'bg-secondary/10' }
    : isCompleted
     ? { label: convertDisplayLabel, description: 'Your exchange has been completed successfully.', icon: CheckCircle2, tone: 'text-primary', surface: 'bg-primary/10' }
     : isFailed
        ? { label: convertDisplayLabel, description: 'This order is no longer active.', icon: XCircle, tone: 'text-destructive', surface: 'bg-destructive/10' }
       : isProcessing
        ? { label: convertDisplayLabel, description: 'Your payment is being processed for delivery.', icon: RefreshCcw, tone: 'text-accent', surface: 'bg-accent/10' }
        : isConfirming
           ? { label: convertDisplayLabel, description: 'Your payment has been detected and is confirming.', icon: Clock3, tone: 'text-amber-500', surface: 'bg-amber-500/10' }
           : { label: convertDisplayLabel, description: isConvertCompletionAlias ? 'Waiting for the canonical completion status update.' : 'Complete the payment using the order-specific details below.', icon: Clock3, tone: 'text-secondary', surface: 'bg-secondary/10' };
  const StatusIcon = statusPresentation.icon;
  const paymentFieldLabels: Record<string, string> = {
    name: 'Name',
    iban: 'IBAN',
    bankName: 'Bank Name',
    bicSwift: 'BIC / SWIFT',
    accountNumber: 'Account Number',
    paymentReference: 'Payment Description / Reference',
    reference: 'Payment Description / Reference',
    amount: 'Amount',
    customInstructions: 'Instructions',
  };

  const paymentElements: React.ReactNode[] = [];
  if (!targetStatus.depositAddress && targetStatus.depositMemo) {
    paymentElements.push(
      <div key="depositMemo" className="group relative bg-black/20 dark:bg-white/5 rounded-xl p-3 border border-border/50 shadow-inner">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Memo / Tag</div>
        <div className="font-mono text-[13px] font-bold break-all pr-10 text-yellow-600 dark:text-yellow-400">{targetStatus.depositMemo}</div>
        <button onClick={() => handleCopy(targetStatus.depositMemo!)} className="absolute top-1/2 -translate-y-1/2 right-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-muted-foreground">
          {copied === targetStatus.depositMemo ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    );
  }
  if (!targetStatus.depositAddress && targetStatus.paymentDetails && typeof targetStatus.paymentDetails === 'object') {
    for (const [key, value] of Object.entries(targetStatus.paymentDetails)) {
      if (value) {
        const strValue = String(value);
        paymentElements.push(
          <div key={key} className="group relative bg-black/20 dark:bg-white/5 rounded-xl p-3 border border-border/50 shadow-inner mt-2">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {paymentFieldLabels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')}
            </div>
            <div className="font-mono text-[13px] font-medium break-all pr-10">{strValue}</div>
            <button onClick={() => handleCopy(strValue)} className="absolute top-1/2 -translate-y-1/2 right-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-muted-foreground">
              {copied === strValue ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        );
      }
    }
  }

  const statusPanel = (
    <div className={cn(
      "premium-card p-4 illuminated-border",
      isFailed ? "border-destructive/20" : "border-primary/20",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn("relative w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center", statusPresentation.surface)}>
          {!isFailed && <div className="absolute inset-1 rounded-xl bg-gradient-to-br from-secondary/30 via-primary/20 to-accent/30 blur-md" />}
          <StatusIcon className={cn("relative z-10 w-5 h-5", statusPresentation.tone, isProcessing && "animate-spin")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Current Status</p>
          <h2 className={cn("text-[18px] font-bold tracking-tight", statusPresentation.tone)}>{statusPresentation.label}</h2>
          <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">{statusPresentation.description}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-primary/[0.04] dark:bg-white/[0.03] border border-border/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Order ID</p>
          <p className="font-mono text-[12px] font-semibold truncate">{orderId}</p>
        </div>
        <button
          onClick={() => handleCopy(orderId)}
          className="shrink-0 p-2 rounded-lg bg-primary/10 text-primary active:scale-95 transition-transform"
          aria-label="Copy order ID"
        >
          {copied === orderId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {!isFailed && <div className="mt-4 border-t border-border/50 pt-4">
      <div className="relative pt-2 pb-1">
        <div className="absolute top-[15px] left-[10%] right-[10%] h-[2px] bg-border z-0" />
        <div className="absolute top-[15px] left-[10%] h-[2px] bg-gradient-to-r from-secondary via-primary to-accent z-0 transition-all duration-500" style={{ width: `${orderTimelineLineWidthPercent(currentStep)}%` }} />

        <div className="flex justify-between relative z-10">
          {(isManualSwap ? ['Created', 'Detected', 'Processing', 'Done'] : ['Created', 'Confirming', 'Processing', 'Done']).map((label, idx) => {
            const step = idx + 1;
            const isPast = currentStep > step;
            const isCurrent = currentStep === step;
            return (
              <div key={label} className="flex flex-col items-center gap-1.5 w-[70px]">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 border-2",
                  isPast ? "bg-primary border-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.6)]" :
                  isCurrent ? "bg-background border-primary text-primary shadow-[0_0_14px_hsl(var(--primary)/0.7)] scale-110" :
                  "bg-background border-border text-muted-foreground/50"
                )}>
                  {isPast ? <Check className="w-3.5 h-3.5" /> : step}
                </div>
                <span className={cn(
                  "text-[9px] leading-tight font-semibold transition-colors text-center",
                  isPast || isCurrent ? "text-foreground" : "text-muted-foreground/50"
                )}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
      </div>}
    </div>
  );

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background premium-glow-bg">
      <header className="sticky top-0 z-20 flex items-center justify-between p-3 glass-nav">
        <button onClick={() => { haptic.selection(); setLocation('/orders'); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-[22px] h-[22px]" />
        </button>
        <div className="flex flex-col items-center">
          <span className="font-bold text-[15px] tracking-tight">Order Details</span>
          <span className="text-[10px] font-mono text-muted-foreground">#{orderId.slice(0, 8)}</span>
        </div>
        <div className="w-9">
          {!isFailed && !isCompleted && (
             <button onClick={() => { haptic.selection(); queryClient.invalidateQueries({ queryKey: getGetPublicOrderStatusQueryKey(orderId, { trackingToken }) }); }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <RefreshCcw className="w-[18px] h-[18px] text-muted-foreground" />
             </button>
          )}
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-8 animate-in slide-in-from-bottom-4 duration-500">

        {statusPanel}

        <div className="premium-card p-4 space-y-4">
          <h3 className="font-bold text-[14px] uppercase tracking-wider text-muted-foreground/80">Exchange Summary</h3>

          <div className="relative">
            <div className="flex items-center justify-between bg-secondary/[0.06] rounded-t-xl p-3.5 border border-border/50 border-b-0">
              <div className="flex items-center gap-3 overflow-hidden mr-3">
                <MiniAppLogo
                  {...sourceVisual}
                  alt={targetStatus.fromAsset}
                  size="medium"
                />
                <div className="flex flex-col justify-center min-w-0">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em] leading-none mb-1.5">You Send</div>
                  <div className="font-bold text-[17px] leading-none truncate">{targetStatus.amount} {targetStatus.fromAsset}</div>
                  {sourceIdentity && sourceIdentity !== targetStatus.fromAsset && (
                    <span className="text-[10px] text-muted-foreground font-semibold mt-1 truncate">{sourceIdentity}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-gradient-to-br from-primary/[0.08] to-accent/[0.07] rounded-b-xl p-3.5 border border-border/50">
              <div className="flex items-center gap-3 overflow-hidden mr-3">
                <MiniAppLogo
                  {...targetVisual}
                  alt={targetStatus.toAsset}
                  size="medium"
                />
                <div className="flex flex-col justify-center min-w-0">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em] leading-none mb-1.5">You Receive</div>
                  <div className="font-bold text-[17px] leading-none text-primary truncate">{targetStatus.receiveAmount} {targetStatus.toAsset}</div>
                  {targetStatus.toNetwork && targetStatus.toNetwork !== targetStatus.toAsset && (
                    <span className="text-[10px] text-primary/70 font-semibold mt-1 truncate">{targetStatus.toNetwork}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="absolute left-6 top-1/2 -translate-y-1/2 w-7 h-7 bg-background border border-border/50 rounded-full flex items-center justify-center shadow-md">
               <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>

          <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-background/40 px-3">
            {exchangeRate !== null && (
              <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
                <span className="text-muted-foreground">Exchange Rate</span>
                <span className="font-mono font-semibold text-right">1 {targetStatus.fromAsset} = {exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 8 })} {targetStatus.toAsset}</span>
              </div>
            )}
            {isManualSwap && manualSwapFees && (
              <div className="space-y-2 py-3" data-testid="manual-swap-fee-breakdown">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Selected add-ons are deducted from receive</p>
                {hasNonZeroFeeAmount(manualSwapFees.existingPricingFee) && (
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-muted-foreground">Existing pricing fee</span>
                    <span className="font-semibold">{formatFeeAmount(manualSwapFees.existingPricingFee)} {targetStatus.toAsset}</span>
                  </div>
                )}
                {hasNonZeroFeeAmount(manualSwapFees.exchangeFee?.totalAmount) && <div className="flex items-start justify-between gap-3 text-[11px]">
                  <span className="text-muted-foreground">Exchange fee</span>
                  <span className="text-right font-semibold">
                    {formatFeeAmount(manualSwapFees.exchangeFee?.totalAmount)} {targetStatus.toAsset}
                    {manualSwapFees.exchangeFee?.fixedAmount !== null &&
                      manualSwapFees.exchangeFee?.fixedAmount !== undefined && (
                      <span className="block text-[10px] font-medium text-muted-foreground">
                        Fixed component: {formatFeeAmount(manualSwapFees.exchangeFee.fixedAmount)} {manualSwapFees.exchangeFee.fixedCurrency}
                      </span>
                    )}
                  </span>
                </div>}
                {(manualSwapFees.selectedAddons || []).map((addon: any) => (
                  <div key={addon.id || addon.key} className="flex items-start justify-between gap-3 text-[11px]">
                    <span className="text-muted-foreground">{addon.name}</span>
                    <span className="text-right font-semibold">
                      {formatFeeAmount(addon.amount)} {addon.currency}
                      <span className="block text-[10px] font-medium text-muted-foreground">
                        {formatFeeAmount(addon.targetAmount)} {targetStatus.toAsset} deducted
                      </span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2 text-[11px] font-bold">
                  <span>Total fees</span>
                  <span>{formatFeeAmount(manualSwapFees.totalFees)} {targetStatus.toAsset}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2 text-[11px] font-bold text-primary">
                  <span>Final receive</span>
                  <span>{formatFeeAmount(targetStatus.receiveAmount)} {targetStatus.toAsset}</span>
                </div>
              </div>
            )}
            {isManualSwap && !manualSwapFees && (
              <div className="py-2.5 text-[11px] text-muted-foreground" data-testid="manual-swap-fee-breakdown-unavailable">
                Fee breakdown is not available in the saved order details.
              </div>
            )}
            <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
              <span className="text-muted-foreground">Created Date</span>
              <span className="font-semibold text-right">{format(new Date(orderData.createdAt), 'MMM d, yyyy · HH:mm')}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
              <span className="text-muted-foreground">Order ID</span>
              <button onClick={() => handleCopy(orderId)} className="inline-flex items-center gap-1.5 font-mono font-semibold text-primary min-w-0">
                <span className="truncate max-w-[180px]">{orderId}</span>
                {copied === orderId ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
              </button>
            </div>
            {isManualSwap && verifiedFundingTransaction?.transactionHash && (
              <div className="py-3" data-testid="verified-transaction">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Transaction ID</div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs font-semibold" title={verifiedFundingTransaction.transactionHash}>
                    <span className="sm:hidden">
                      {verifiedFundingTransaction.transactionHash.length > 18
                        ? `${verifiedFundingTransaction.transactionHash.slice(0, 10)}…${verifiedFundingTransaction.transactionHash.slice(-8)}`
                        : verifiedFundingTransaction.transactionHash}
                    </span>
                    <span className="hidden sm:inline">{verifiedFundingTransaction.transactionHash}</span>
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(verifiedFundingTransaction.transactionHash)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/60 px-2 py-1.5 text-[10px] font-semibold"
                    aria-label="Copy transaction ID"
                  >
                    {copied === verifiedFundingTransaction.transactionHash ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === verifiedFundingTransaction.transactionHash ? 'Copied' : 'Copy'}
                  </button>
                  {verifiedFundingTransaction.explorerUrl && (
                    <a
                      href={verifiedFundingTransaction.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/60 px-2 py-1.5 text-[10px] font-semibold text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View on Explorer
                    </a>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  <span>Network: <strong className="text-foreground">{verifiedFundingTransaction.networkName || verifiedFundingTransaction.networkCode || '—'}</strong></span>
                  <span>Confirmations: <strong className="text-foreground">{verifiedFundingTransaction.confirmations}</strong></span>
                  {verifiedFundingTransaction.detectedAt && <span>Detected: <strong className="text-foreground">{format(new Date(verifiedFundingTransaction.detectedAt), 'MMM d, yyyy · HH:mm')}</strong></span>}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isCompleted && !isFailed && (
          <div className="relative rounded-2xl p-[1px] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-secondary via-primary to-accent opacity-50 animated-gradient-bg" />
            <div className="relative bg-card/95 backdrop-blur-xl rounded-2xl h-full p-4 space-y-4">

              <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                <MiniAppLogo {...sourceVisual} alt={targetStatus.fromAsset} size="normal" />
                <div>
                  <h3 className="font-bold text-[15px] tracking-tight">{isCryptoDeposit ? 'Crypto Deposit Details' : 'Payment Details'}</h3>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {isCryptoDeposit
                      ? depositDetailsReady
                        ? depositDetailsActionable
                          ? `Send exactly ${depositAmountLabel} ${depositAssetLabel} on ${depositNetworkLabel}`
                          : 'This order is not awaiting funds. No additional deposits should be sent.'
                        : 'Deposit instructions are incomplete. Do not send funds yet.'
                      : sourcePaymentMethod?.name || 'Use the assigned order instructions'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {isCryptoDeposit && depositDetailsReady && (
                  <div className="flex items-center justify-between rounded-xl bg-secondary/[0.07] border border-secondary/15 p-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
                        {depositDetailsActionable ? 'Send Exactly' : 'Order Deposit Amount'}
                      </p>
                      <p className="font-mono text-[17px] font-bold">{depositAmountLabel} {depositAssetLabel}</p>
                    </div>
                    <span className="text-[10px] font-bold rounded-full bg-secondary/10 text-secondary border border-secondary/20 px-2 py-1">
                      {depositNetworkLabel}
                    </span>
                  </div>
                )}
                {isCryptoDeposit && depositDetailsReady ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDepositModalOpen(true)}
                    className="w-full h-11 rounded-xl border-primary/25 bg-primary/[0.05] text-primary font-bold text-xs"
                  >
                    View Deposit Details
                  </Button>
                ) : isCryptoDeposit ? (
                  <div role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                    Deposit amount, asset, or network details are unavailable. Do not send funds; contact support for confirmation.
                    {supportUrl && (
                      <button type="button" onClick={openSupport} className="ml-1 font-bold underline">Contact support</button>
                    )}
                  </div>
                ) : paymentElements.length > 0 ? (
                  paymentElements
                ) : (
                  <div className="bg-black/20 rounded-xl p-4 text-center border border-white/5">
                    <span className="text-[13px] text-muted-foreground block mb-3">Payment details are not available yet.</span>
                    {supportUrl && (
                      <button
                        onClick={openSupport}
                        className="inline-flex items-center justify-center rounded-lg font-bold bg-white text-black h-8 px-4 text-xs hover:bg-white/90 active:scale-95 transition-all"
                      >
                        Contact Support
                      </button>
                    )}
                  </div>
                )}

                {showPaymentActions && (
                  <div className="pt-3">
                    <Button
                      onClick={handleMarkPaid}
                      disabled={markPaid.isPending || (isCryptoDeposit ? !depositDetailsReady : paymentElements.length === 0)}
                      className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white font-bold border-0 shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.5)] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {markPaid.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (isCryptoDeposit ? 'I Have Sent Crypto' : 'Mark as Paid')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(isCompleted || isFailed) && isCryptoDeposit && (
          <div className="premium-card p-4">
            {depositDetailsReady ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDepositModalOpen(true)}
                className="w-full h-11 rounded-xl border-border/60 bg-background/50 font-bold text-xs"
              >
                View Recorded Deposit Details
              </Button>
            ) : (
              <p role="alert" className="text-center text-xs text-muted-foreground">
                Recorded deposit details are incomplete. Contact support before relying on these instructions.
              </p>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="premium-card border-primary/20 bg-primary/[0.06] p-4 flex items-center justify-center gap-2 text-primary font-bold text-[13px] uppercase tracking-[0.16em]">
            <CheckCircle2 className="w-5 h-5" /> Completed
          </div>
        )}
        {isCancelled && (
          <div className="premium-card border-destructive/20 bg-destructive/[0.06] p-4 flex items-center justify-center gap-2 text-destructive font-bold text-[13px] uppercase tracking-[0.16em]">
            <XCircle className="w-5 h-5" /> Cancelled
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1 pb-[calc(24px+env(safe-area-inset-bottom))]">
          <Button
            variant="outline"
            onClick={async () => {
              haptic.selection();
              await refetchStatus();
              queryClient.invalidateQueries({ queryKey: getGetTelegramMiniAppOrderQueryKey(orderId) });
              queryClient.invalidateQueries({ queryKey: getListTelegramMiniAppOrdersQueryKey() });
            }}
            disabled={isRefreshingStatus}
            className="h-11 rounded-xl border-primary/20 bg-primary/[0.05] text-primary font-bold text-[11px]"
          >
            <RefreshCcw className={cn("w-4 h-4 mr-2", isRefreshingStatus && "animate-spin")} />
            Track / Refresh
          </Button>
          <Button
            variant="outline"
            onClick={openSupport}
            disabled={!supportUrl}
            className="h-11 rounded-xl border-border/60 bg-background/50 font-bold text-[11px]"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Contact Support
          </Button>
        </div>
      </div>
      {depositDetailsReady && targetStatus.depositAddress && (
        <DepositDetailsModal
          open={depositModalOpen}
          onOpenChange={setDepositModalOpen}
          amount={depositAmountLabel}
          asset={depositAssetLabel}
          network={depositNetworkLabel}
          address={targetStatus.depositAddress}
          qrData={(targetStatus as any).depositQrData}
          memo={targetStatus.depositMemo}
          orderId={orderId}
          copied={copied}
          onCopy={handleCopy}
          actionable={depositDetailsActionable}
        />
      )}
    </div>
  );
}
