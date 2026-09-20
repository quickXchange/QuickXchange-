import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import {
  useGetTelegramMiniAppOrder, getGetTelegramMiniAppOrderQueryKey,
  useGetPublicOrderStatus, getGetPublicOrderStatusQueryKey,
  useGetExchangeConfig, getGetExchangeConfigQueryKey,
  useMarkOrderPaid,
  useCancelCustomerOrder
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
import { QRCodeSVG } from 'qrcode.react';
import { MiniAppLogo } from '@/components/mini-app-logo';
import { resolveOrderVisual } from '@/lib/logo-catalog';
import {
  normalizeSwapOrderStatus,
  swapOrderStatusLabel,
  swapOrderStatusStep,
  swapOrderStatusTerminal,
} from '@/lib/swap-order-status';

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
        refetchInterval: (query) => {
          const status = query.state.data?.status?.toLowerCase() || '';
          if (orderData?.orderKind !== 'convert' && swapOrderStatusTerminal(status)) return false;
          if (['completed', 'paid', 'failed', 'cancelled', 'expired'].includes(status)) return false;
          return 5000;
        }
      }
    }
  );

  const markPaid = useMarkOrderPaid({ request: { headers } });
  const cancelOrder = useCancelCustomerOrder({ request: { headers } });

  const [copied, setCopied] = useState<string | null>(null);
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    haptic.selection();
    setTimeout(() => setCopied(null), 2000);
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
      queryClient.invalidateQueries({ queryKey: ['listTelegramMiniAppOrders'] });
    } catch (err: any) {
      haptic.notification('error');
      alert(err.message || 'Failed to update order');
    }
  };

  const handleCancel = async () => {
    if (!orderId || !trackingToken) return;
    haptic.impact('heavy');
    try {
      await cancelOrder.mutateAsync({ id: orderId, data: { trackingToken } });
      haptic.notification('success');
      queryClient.invalidateQueries({ queryKey: getGetPublicOrderStatusQueryKey(orderId, { trackingToken }) });
      queryClient.invalidateQueries({ queryKey: getGetTelegramMiniAppOrderQueryKey(orderId) });
      queryClient.invalidateQueries({ queryKey: ['listTelegramMiniAppOrders'] });
    } catch (err: any) {
      haptic.notification('error');
      alert(err.message || 'Failed to cancel order');
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

  const status = (publicStatus?.status || orderData.status || '').toLowerCase();
  const targetStatus = { ...orderData, ...(publicStatus || {}) };
  const isManualSwap = orderData.orderKind !== 'convert' && orderData.type === 'manual';
  const canonicalSwapStatus = normalizeSwapOrderStatus(status);
  const isCancelled = status === 'cancelled';
  const isRefunded = isManualSwap && canonicalSwapStatus === 'refunded';
  const isFailed = isCancelled || isRefunded || /failed|expired/.test(status);
  const isCompleted = isManualSwap
    ? canonicalSwapStatus === 'completed'
    : /completed|complete|finished|success/.test(status) || status === 'paid';
  const isProcessing = isManualSwap
    ? canonicalSwapStatus === 'processing'
    : !isCompleted && !isFailed && /processing|exchanging|sending|payout/.test(status);
  const isPaymentReceived = !isManualSwap && !isCompleted && !isFailed && (
    Boolean(targetStatus?.customerMarkedPaidAt) ||
    /payment_received|funds_received|funds_confirmed|confirmed/.test(status)
  );
  const isPending = !isCompleted && !isFailed && !isProcessing && !isPaymentReceived;
  const currentStep = isManualSwap
    ? swapOrderStatusStep(canonicalSwapStatus)
    : isCompleted ? 4 : isProcessing ? 3 : isPaymentReceived ? 2 : 1;

  const showPaymentActions = isPending && !targetStatus?.customerMarkedPaidAt && !isFailed && targetStatus?.paymentDetailsApplicable;

  const sourcePaymentMethod = (targetStatus as any).sourcePaymentMethod;
  const sourceVisual = resolveOrderVisual(exchangeConfig?.settlementOptions, targetStatus, 'source');
  const targetVisual = resolveOrderVisual(exchangeConfig?.settlementOptions, targetStatus, 'target');
  const sourceIdentity = sourcePaymentMethod?.name || targetStatus.fromNetwork || targetStatus.fromAsset;
  const isCryptoDeposit = Boolean(targetStatus.depositAddress);
  const parsedSendAmount = Number(targetStatus.amount);
  const parsedReceiveAmount = Number(targetStatus.receiveAmount);
  const exchangeRate = Number.isFinite(parsedSendAmount) && parsedSendAmount > 0 && Number.isFinite(parsedReceiveAmount)
    ? parsedReceiveAmount / parsedSendAmount
    : null;

  const statusPresentation = isManualSwap
    ? isCompleted
      ? { label: swapOrderStatusLabel(canonicalSwapStatus), description: 'Your exchange has been completed successfully.', icon: CheckCircle2, tone: 'text-primary', surface: 'bg-primary/10' }
      : isFailed
        ? { label: swapOrderStatusLabel(canonicalSwapStatus), description: 'This order is no longer active.', icon: XCircle, tone: 'text-destructive', surface: 'bg-destructive/10' }
        : isProcessing
          ? { label: swapOrderStatusLabel(canonicalSwapStatus), description: 'Your payment was received and your order is being processed.', icon: RefreshCcw, tone: 'text-accent', surface: 'bg-accent/10' }
          : { label: swapOrderStatusLabel(canonicalSwapStatus), description: 'Complete the payment using the order-specific details below.', icon: Clock3, tone: 'text-secondary', surface: 'bg-secondary/10' }
    : isCompleted
    ? { label: 'Completed', description: 'Your exchange has been completed successfully.', icon: CheckCircle2, tone: 'text-primary', surface: 'bg-primary/10' }
    : isFailed
      ? { label: isCancelled ? 'Cancelled' : status === 'expired' ? 'Expired' : 'Failed', description: 'This order is no longer active.', icon: XCircle, tone: 'text-destructive', surface: 'bg-destructive/10' }
      : isProcessing
        ? { label: 'Processing', description: 'Your payment is being processed for delivery.', icon: RefreshCcw, tone: 'text-accent', surface: 'bg-accent/10' }
        : isPaymentReceived
          ? { label: 'Payment Received', description: 'Your payment has been reported and is awaiting processing.', icon: Check, tone: 'text-secondary', surface: 'bg-secondary/10' }
          : { label: 'Awaiting Payment', description: 'Complete the payment using the order-specific details below.', icon: Clock3, tone: 'text-secondary', surface: 'bg-secondary/10' };
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
  if (targetStatus.depositAddress) {
    paymentElements.push(
      <div key="depositAddress" className="group relative bg-black/20 dark:bg-white/5 rounded-xl p-3 border border-border/50 shadow-inner">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Deposit Address</div>
        <div className="font-mono text-[13px] font-medium break-all pr-10">{targetStatus.depositAddress}</div>
        <button onClick={() => handleCopy(targetStatus.depositAddress!)} className="absolute top-1/2 -translate-y-1/2 right-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-muted-foreground">
          {copied === targetStatus.depositAddress ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    );
  }
  if (targetStatus.depositMemo) {
    paymentElements.push(
      <div key="depositMemo" className="group relative bg-black/20 dark:bg-white/5 rounded-xl p-3 border border-border/50 shadow-inner mt-2">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Memo / Tag (Required)</div>
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
        <div className="absolute top-[15px] left-[10%] h-[2px] bg-gradient-to-r from-secondary via-primary to-accent z-0 transition-all duration-500" style={{ width: `${(Math.max(0, currentStep - 1) / ((isManualSwap ? 3 : 4) - 1)) * 80}%` }} />

        <div className="flex justify-between relative z-10">
          {(isManualSwap ? ['Created', 'Processing', 'Done'] : ['Order Created', 'Payment Received', 'Processing', 'Completed']).map((label, idx) => {
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
                <MiniAppLogo {...sourceVisual} alt={targetStatus.fromAsset} size="medium" />
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
                <MiniAppLogo {...targetVisual} alt={targetStatus.toAsset} size="medium" />
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
                    {isCryptoDeposit ? `Send exactly ${targetStatus.amount} ${targetStatus.fromAsset}` : sourcePaymentMethod?.name || 'Use the assigned order instructions'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {isCryptoDeposit && (
                  <div className="flex items-center justify-between rounded-xl bg-secondary/[0.07] border border-secondary/15 p-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Send Exactly</p>
                      <p className="font-mono text-[17px] font-bold">{targetStatus.amount} {targetStatus.fromAsset}</p>
                    </div>
                    <span className="text-[10px] font-bold rounded-full bg-secondary/10 text-secondary border border-secondary/20 px-2 py-1">
                      {targetStatus.fromNetwork || 'Crypto'}
                    </span>
                  </div>
                )}
                {paymentElements && paymentElements.length > 0 ? (
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

                {isCryptoDeposit && paymentElements.length > 0 && (
                  <>
                    <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-[0_8px_28px_-12px_hsl(var(--primary)/0.5)]">
                      <QRCodeSVG value={targetStatus.depositAddress!} size={136} level="M" />
                    </div>
                    <p className="text-center text-[10px] font-semibold text-muted-foreground">Scan the deposit address</p>
                    <div className="flex items-start gap-2 rounded-xl bg-yellow-500/[0.08] border border-yellow-500/15 p-3 text-[11px] leading-relaxed text-muted-foreground">
                      <AlertCircle className="w-4 h-4 shrink-0 text-yellow-500 mt-0.5" />
                      <span>Send only {targetStatus.fromAsset} on the {targetStatus.fromNetwork || 'shown'} network. Using another network may result in permanent loss.</span>
                    </div>
                  </>
                )}

                {showPaymentActions && (
                  <div className="flex gap-2 pt-3">
                    <Button
                      onClick={handleMarkPaid}
                      disabled={markPaid.isPending || (!paymentElements || paymentElements.length === 0)}
                      className="flex-1 h-11 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white font-bold border-0 shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.5)] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {markPaid.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (isCryptoDeposit ? 'I Have Sent Crypto' : 'Mark as Paid')}
                    </Button>
                    <Button
                      onClick={handleCancel}
                      disabled={cancelOrder.isPending}
                      variant="outline"
                      className="h-11 px-4 rounded-xl bg-transparent border-white/10 hover:bg-white/5 text-muted-foreground font-semibold active:scale-95 transition-all disabled:opacity-50"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
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
              queryClient.invalidateQueries({ queryKey: ['listTelegramMiniAppOrders'] });
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
    </div>
  );
}
