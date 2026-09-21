import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useSearch, Link } from "wouter";
import {
  useGetPublicOrderStatus,
  useGetQuickexOrderStatus,
  getGetPublicOrderStatusQueryKey,
  getGetQuickexOrderStatusQueryKey
  , useMarkOrderPaid, useCancelCustomerOrder
} from "@workspace/api-client-react";
import type { ApiError } from "@workspace/api-client-react";
import { PublicShell } from "@/components/public-shell";
import {
  CircleAlert, RefreshCw, Loader2, Copy, Network, Check, ArrowRight, ShieldCheck, CheckCircle2, XCircle, Clock3, ArrowDown
} from "lucide-react";
import { useI18n } from "@/i18n";
import { CancelOrderAction, cn, PaymentDetailsCard, publicApiErrorText, SUPPORT_TELEGRAM } from "@/components/shared-app-ui";
import { OrderSettlementIdentity } from "@/components/order-settlement-identity";
import { QRCodeSVG } from "qrcode.react";
import { convertOrderStatusLabel, convertOrderStatusStep, isConvertTerminalStatus } from "@/lib/convert-order-status";

const formatExactDateTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${datePart} · ${timePart}`;
};

export function OrderConfirmationPage() {
  const { id = '' } = useParams();
  const searchString = useSearch();
  const queryParams = new URLSearchParams(searchString);
  const trackingToken = queryParams.get("trackingToken") || "";
  const provider = queryParams.get("provider") || "manual";
  const isQuickex = provider === "quickex";

  const { t, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const markPaidMutation = useMarkOrderPaid();
  const cancelOrderMutation = useCancelCustomerOrder();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  const formatAmount = (value?: number | string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? formatNumber(parsed, { maximumFractionDigits: 8 }) : '—';
  };

  const trackingParams = trackingToken ? { trackingToken } : ({} as any);

  const manualStatusQuery = useGetPublicOrderStatus(id, trackingParams, { query: {
    queryKey: getGetPublicOrderStatusQueryKey(id, trackingParams),
    enabled: !isQuickex && !!id,
    refetchOnWindowFocus: 'always',
    refetchIntervalInBackground: true,
    retry: (failureCount: number, error: unknown) => {
      const status = error && typeof error === 'object' && 'status' in error
        ? (error as { status?: number }).status
        : undefined;
      return status !== 404 && failureCount < 2;
    },
     refetchInterval: (query: any) => {
       const currentOrder = query.state.data;
       if (!currentOrder) return 3000;
         if (/complete|paid|refund|expire|fail|cancel/i.test(currentOrder.status)) return false;
       return currentOrder.fundingStatus === 'provisioning' ? 2000 : 3000;
     },
  } });

  const quickexStatusQuery = useGetQuickexOrderStatus(id, trackingParams, { query: {
    queryKey: getGetQuickexOrderStatusQueryKey(id, trackingParams),
    enabled: isQuickex && !!id,
    refetchOnWindowFocus: 'always',
    refetchIntervalInBackground: true,
    refetchInterval: (query: any) => {
      const order = query.state.data;
      if (!order) return 3000;
       return isConvertTerminalStatus(order.status) ? false : 3000;
    },
  } });

  const activeStatusQuery = isQuickex ? quickexStatusQuery : manualStatusQuery;
  const lookupError = activeStatusQuery.error as ({ status?: number; data?: ApiError | null } | null);
  const notFound = lookupError?.status === 404 || lookupError?.data?.code === 'ORDER_NOT_FOUND';
  const lookupErrorMessage = notFound ? t('orderStatus.notFound') : t('orderStatus.refreshFailed');

  const order = activeStatusQuery.data?.id === id ? activeStatusQuery.data : undefined;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const markPaid = () => {
    markPaidMutation.mutate({ id, data: trackingToken ? { trackingToken } : undefined }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetPublicOrderStatusQueryKey(id, trackingParams) });
      },
    });
  };

  const cancelOrder = () => {
    setCancelError(null);
    cancelOrderMutation.mutate({
      id,
      data: trackingToken ? { trackingToken } : undefined,
    }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetPublicOrderStatusQueryKey(id, trackingParams), updated);
      },
      onError: (error) => {
        setCancelError(publicApiErrorText(error, 'This order can no longer be cancelled.'));
      },
    });
  };

  useEffect(() => {
    document.title = order
      ? `${order.id} · Order Created · QuickXchange`
      : 'Order Confirmation · QuickXchange';
  }, [order]);

  if (!order) {
    if (activeStatusQuery.isError && notFound) return (
      <PublicShell>
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-6">
            <CircleAlert size={32} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Order Not Found</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">{lookupErrorMessage}</p>
          <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
            <Link href="/" className="group relative flex h-11 w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-sm font-bold text-white shadow-[0_4px_16px_-4px_rgba(6,182,212,0.4)] transition-all hover:from-cyan-400 hover:via-blue-400 hover:to-purple-400 hover:shadow-[0_6px_24px_-6px_rgba(6,182,212,0.6)]">
              <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative z-10">Return to Exchange</span>
            </Link>
          </div>
        </div>
      </PublicShell>
    );
    return (
      <PublicShell>
        <div className="min-h-[80vh] flex flex-col items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <Loader2 size={48} className="animate-spin text-primary relative z-10" />
          </div>
          <h2 className="mt-8 text-xl font-bold tracking-tight">Securing your order...</h2>
          <p className="mt-2 text-muted-foreground text-sm">Please wait while we confirm details.</p>
        </div>
      </PublicShell>
    );
  }

  const isManual = order.type === 'manual' || Boolean(order.manualSettlementState);
  const mss = (order.manualSettlementState || 'awaiting_funds').toLowerCase();

  const status = order.status.toLowerCase();
  const halted = /refund|expire|fail|cancel/.test(status) || mss === 'cancelled' || mss === 'failed';
  const uncertain = /unknown|held|verification|review/.test(status) || order.outcomeUnknown;
  const completed = /complete|paid/.test(status) || mss === 'completed';
  const canCustomerCancel = !isQuickex && isManual && mss === 'awaiting_funds' &&
    !order.customerMarkedPaidAt && !halted && !uncertain && !completed && !/process|paid/.test(status);

  const isCancelled = status === 'cancelled' || mss === 'cancelled';
  const isConfirming = isManual
    ? mss === 'funds_confirmed' || status === 'confirming'
    : !completed && !halted && ['confirming', 'payment detected'].includes(status);
  const isProcessing = isManual
    ? mss === 'payout_processing' || mss === 'payout_sent'
    : !completed && !halted && status === 'processing';

  const currentStep = isManual
    ? (completed ? 4 : isProcessing ? 3 : isConfirming ? 2 : 1)
    : (convertOrderStatusStep(status) + 1);

  const depositActionable = Boolean(order.depositAddress) && !halted && !uncertain && !completed;
  const fundingStatus = order.fundingStatus?.toLowerCase();
  const addressPending = isManual && !order.depositAddress && fundingStatus === 'provisioning';
  const addressUnavailable = isManual && !order.depositAddress && fundingStatus === 'unresolved';

  const fundingDetails = order.fundingDetails as {
    warning?: unknown;
    instructions?: unknown;
    requiredConfirmations?: unknown;
    addressSource?: unknown;
  } | undefined;

  const hasPaymentInstructions = Boolean(
    order.depositAddress ||
    order.depositMemo ||
    order.customerSafeNote ||
    addressPending ||
    addressUnavailable ||
    fundingDetails?.warning ||
    fundingDetails?.instructions ||
    fundingDetails?.requiredConfirmations
  );

  const statusPresentation = isManual
    ? completed
      ? { label: 'Completed', description: 'Your exchange has been completed successfully.', icon: CheckCircle2, tone: 'text-primary', surface: 'bg-primary/10', border: 'border-primary/20' }
      : halted
        ? { label: isCancelled ? 'Cancelled' : status === 'expired' ? 'Expired' : 'Failed', description: 'This order is no longer active.', icon: XCircle, tone: 'text-destructive', surface: 'bg-destructive/10', border: 'border-destructive/20' }
        : isProcessing
          ? { label: 'Processing', description: 'Your payment was received and your order is being processed.', icon: RefreshCw, tone: 'text-accent', surface: 'bg-accent/10', border: 'border-accent/20' }
          : isConfirming
            ? { label: 'Confirming', description: 'Your payment has been detected and is confirming.', icon: Clock3, tone: 'text-amber-500', surface: 'bg-amber-500/10', border: 'border-amber-500/20' }
            : { label: 'Pending', description: 'Complete the payment using the order-specific details below.', icon: Clock3, tone: 'text-primary', surface: 'bg-primary/10', border: 'border-primary/20' }
    : completed
     ? { label: convertOrderStatusLabel(status), description: 'Your exchange has been completed successfully.', icon: CheckCircle2, tone: 'text-primary', surface: 'bg-primary/10', border: 'border-primary/20' }
     : halted
       ? { label: convertOrderStatusLabel(status), description: 'This order is no longer active.', icon: XCircle, tone: 'text-destructive', surface: 'bg-destructive/10', border: 'border-destructive/20' }
       : isProcessing
        ? { label: 'Processing', description: 'Your payment is being processed for delivery.', icon: RefreshCw, tone: 'text-accent', surface: 'bg-accent/10', border: 'border-accent/20' }
        : isConfirming
          ? { label: convertOrderStatusLabel(status), description: 'Your payment has been detected and is confirming.', icon: Clock3, tone: 'text-amber-500', surface: 'bg-amber-500/10', border: 'border-amber-500/20' }
          : { label: convertOrderStatusLabel(status), description: 'Complete the payment using the order-specific details below.', icon: Clock3, tone: 'text-primary', surface: 'bg-primary/10', border: 'border-primary/20' };

  const StatusIcon = statusPresentation.icon;
  const isCryptoDeposit = Boolean(order.depositAddress) || addressPending || addressUnavailable;

  const parsedSendAmount = Number(order.amount);
  const parsedReceiveAmount = Number(order.receiveAmount);
  const exchangeRate = Number.isFinite(parsedSendAmount) && parsedSendAmount > 0 && Number.isFinite(parsedReceiveAmount)
    ? parsedReceiveAmount / parsedSendAmount
    : null;

  const sourceIdentity = order.sourcePaymentMethod?.name || order.fromNetwork || order.fromAsset;
  const targetIdentity = order.toNetwork || order.toAsset;
  const fundingAddressSourceLabel = typeof fundingDetails?.addressSource === 'string'
    ? fundingDetails.addressSource === 'live_api'
      ? 'Unique API address'
      : fundingDetails.addressSource === 'manual_fallback'
        ? 'Manual fallback address'
        : fundingDetails.addressSource === 'manual_only'
          ? 'Manual address'
          : null
    : null;

  return (
    <PublicShell>
      <main className="min-h-[80vh] py-8 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto space-y-6">
        {/* Status Panel */}
        <div className={cn("relative overflow-hidden bg-card border rounded-3xl p-5 sm:p-6 shadow-sm transition-all duration-500 hover:shadow-[0_8px_30px_-12px_rgba(139,92,246,0.15)] dark:hover:shadow-[0_8px_30px_-12px_rgba(139,92,246,0.25)]", statusPresentation.border)}>
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-purple-500/10 via-blue-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />
          <div className="relative z-10">
          <div className="flex items-start gap-4">
            <div className={cn("relative w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center shadow-[0_0_16px_-4px_rgba(6,182,212,0.25)]", statusPresentation.surface)}>
              {!halted && <div className="absolute inset-1 rounded-xl bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-purple-500/20 blur-md" />}
              <StatusIcon className={cn("relative z-10 w-6 h-6", statusPresentation.tone, isProcessing && "animate-spin")} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Current Status</p>
              <h2 className={cn("text-2xl font-bold tracking-tight", statusPresentation.tone)} data-testid="heading-order-created">{statusPresentation.label}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">{statusPresentation.description}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl bg-secondary/5 border border-border/50 px-4 py-3">
             <div className="min-w-0 flex-1 w-full sm:w-auto">
               <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Order ID</p>
               <p className="font-mono text-sm font-semibold truncate text-foreground" data-testid="text-order-id">{order.id}</p>
             </div>
             <div className="flex gap-2 w-full sm:w-auto self-start sm:self-center">
               <span className={cn("text-xs font-bold rounded-xl bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 flex items-center shrink-0")} data-testid="status-order-confirmation">
                 {isQuickex ? convertOrderStatusLabel(order.status) : order.status}
               </span>
               <button
                 onClick={() => handleCopy(order.id)}
                 className="p-1.5 rounded-xl bg-secondary/10 text-secondary-foreground hover:bg-secondary/20 active:scale-95 transition-all shrink-0"
                 aria-label="Copy order ID"
                 data-testid="button-copy-header-order-id"
               >
                 {copied === order.id ? <Check size={16} /> : <Copy size={16} />}
               </button>
             </div>
          </div>

          {!halted && (
            <div className="mt-6 border-t border-border/50 pt-6">
              <div className="relative pt-2 pb-1">
                <div className="absolute top-[17px] left-[10%] right-[10%] h-[2px] bg-border z-0" />
                <div className="absolute top-[17px] left-[10%] h-[2px] bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 z-0 transition-all duration-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" style={{ width: `${(Math.max(0, currentStep - 1) / 3) * 80}%` }} />

                <div className="flex justify-between relative z-10">
                  {(isManual ? ['Created', 'Detected', 'Processing', 'Done'] : ['Created', 'Confirming', 'Processing', 'Done']).map((label, idx) => {
                    const step = idx + 1;
                    const isPast = currentStep > step;
                    const isCurrent = currentStep === step;
                    return (
                      <div key={label} className="flex flex-col items-center gap-2 w-[70px]">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2 relative overflow-hidden",
                          isPast ? "bg-gradient-to-br from-cyan-500 to-blue-500 border-transparent text-white shadow-[0_0_12px_rgba(6,182,212,0.6)]" :
                          isCurrent ? "bg-background border-cyan-500 text-cyan-600 dark:text-cyan-400 shadow-[0_0_14px_rgba(6,182,212,0.7)] scale-110" :
                          "bg-background border-border text-muted-foreground/50"
                        )}>
                          {isCurrent && <div className="absolute inset-0 bg-cyan-500/10" />}
                          {isPast ? <Check className="w-4 h-4" /> : <span className="relative z-10">{step}</span>}
                        </div>
                        <span className={cn(
                          "text-[10px] leading-tight font-semibold transition-colors text-center uppercase tracking-wider",
                          isPast || isCurrent ? "text-cyan-700 dark:text-cyan-400" : "text-muted-foreground/50"
                        )}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {(order.refreshUnavailable || activeStatusQuery.isError) && (
                <div className="mt-8 p-4 bg-warning/10 border border-warning/20 rounded-2xl flex gap-3 text-warning-foreground text-sm">
                  <RefreshCw size={18} className="mt-0.5 shrink-0 animate-spin-slow" />
                  <p>{t('orderStatus.liveUpdatesUnavailable')}</p>
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Exchange Summary */}
        <div className="relative overflow-hidden bg-card border border-border rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 transition-all hover:shadow-[0_8px_32px_-12px_rgba(59,130,246,0.15)] dark:hover:shadow-[0_8px_32px_-12px_rgba(59,130,246,0.25)] group/summary" data-testid="order-confirmation-exchange-summary">
           <div className="absolute -top-24 -left-24 w-64 h-64 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-transparent blur-3xl pointer-events-none rounded-full opacity-70 group-hover/summary:opacity-100 transition-opacity duration-500" />
           <div className="relative z-10">
           <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-5">Exchange Summary</h3>

           <div className="relative">
             <div className="flex items-center justify-between bg-secondary/5 rounded-t-2xl p-4 sm:p-5 border border-border border-b-0 relative overflow-hidden group/send">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover/send:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative z-10 flex items-center gap-4 min-w-0 w-full">
                   <div className="w-12 h-12 [&_.order-settlement-copy]:hidden [&_.crypto-identity-copy]:hidden flex items-center justify-center overflow-hidden bg-background rounded-full border border-border shrink-0 shadow-[0_0_12px_-4px_rgba(6,182,212,0.2)] group-hover/send:border-cyan-500/40 transition-colors relative [&_.order-settlement-identity]:!bg-transparent [&_.order-settlement-identity]:!p-0 [&_.order-settlement-identity]:!border-0 [&_.crypto-identity]:!bg-transparent [&_.crypto-identity]:!p-0 [&_.crypto-identity]:!border-0 [&_img]:!w-7 [&_img]:!h-7 [&_.crypto-network-badge]:hidden [&_svg]:!w-7 [&_svg]:!h-7">
                     <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-500/10 opacity-0 group-hover/send:opacity-100 transition-opacity pointer-events-none" />
                     <div className="relative z-10 flex items-center justify-center w-full h-full">
                       <OrderSettlementIdentity assetCode={order.fromAsset} routeLabel={order.fromNetwork} settlementOptionId={order.sourceSettlementOptionId} size="md" compact={true} />
                     </div>
                   </div>
                   <div className="flex flex-col justify-center min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">You Send</div>
                      <div className="font-bold text-xl sm:text-2xl leading-none text-foreground truncate">{order.amount} {order.fromAsset}</div>
                      {sourceIdentity !== order.fromAsset && (
                        <span className="text-[11px] text-muted-foreground font-semibold mt-1.5 truncate">{sourceIdentity}</span>
                      )}
                   </div>
                </div>
             </div>

             <div className="flex items-center justify-between bg-primary/5 rounded-b-2xl p-4 sm:p-5 border border-border relative overflow-hidden group/recv">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/5 to-cyan-500/0 opacity-0 group-hover/recv:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative z-10 flex items-center gap-4 min-w-0 w-full">
                   <div className="w-12 h-12 [&_.order-settlement-copy]:hidden [&_.crypto-identity-copy]:hidden flex items-center justify-center overflow-hidden bg-background rounded-full border border-border shrink-0 shadow-[0_0_12px_-4px_rgba(139,92,246,0.2)] group-hover/recv:border-purple-500/40 transition-colors relative [&_.order-settlement-identity]:!bg-transparent [&_.order-settlement-identity]:!p-0 [&_.order-settlement-identity]:!border-0 [&_.crypto-identity]:!bg-transparent [&_.crypto-identity]:!p-0 [&_.crypto-identity]:!border-0 [&_img]:!w-7 [&_img]:!h-7 [&_.crypto-network-badge]:hidden [&_svg]:!w-7 [&_svg]:!h-7">
                     <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover/recv:opacity-100 transition-opacity pointer-events-none" />
                     <div className="relative z-10 flex items-center justify-center w-full h-full">
                       <OrderSettlementIdentity assetCode={order.toAsset} routeLabel={order.toNetwork} settlementOptionId={order.targetSettlementOptionId} size="md" compact={true} />
                     </div>
                   </div>
                   <div className="flex flex-col justify-center min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">You Receive</div>
                      <div className="font-bold text-xl sm:text-2xl leading-none text-primary truncate">{isManual ? '≈ ' : ''}{order.receiveAmount} {order.toAsset}</div>
                      {targetIdentity !== order.toAsset && (
                        <span className="text-[11px] text-primary/70 font-semibold mt-1.5 truncate">{targetIdentity}</span>
                      )}
                   </div>
                </div>
             </div>

             <div className="absolute left-10 top-1/2 -translate-y-1/2 w-8 h-8 bg-background border border-border rounded-full flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(59,130,246,0.2)] z-20">
               <ArrowDown size={14} className="text-blue-500 dark:text-blue-400" />
             </div>
           </div>

           <div className="divide-y divide-border/50 rounded-2xl border border-border bg-background/50 px-4">
             {exchangeRate !== null && !isQuickex && (
               <div className="flex items-center justify-between gap-3 py-3 text-xs">
                 <span className="text-muted-foreground font-medium">Exchange Rate</span>
                 <span className="font-mono font-semibold text-right">1 {order.fromAsset} = {exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 8 })} {order.toAsset}</span>
               </div>
             )}
             <div className="flex items-center justify-between gap-3 py-3 text-xs">
               <span className="text-muted-foreground font-medium">Created Date</span>
               <span className="font-semibold text-right">{formatExactDateTime(order.createdAt)}</span>
             </div>
             <div className="flex items-center justify-between gap-3 py-3 text-xs">
               <span className="text-muted-foreground font-medium">Order ID</span>
               <button onClick={() => handleCopy(order.id)} className="inline-flex items-center gap-1.5 font-mono font-semibold text-primary min-w-0 hover:opacity-80 transition-opacity">
                 <span className="truncate max-w-[180px]">{order.id}</span>
                 {copied === order.id ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
               </button>
             </div>
           </div>
           </div>
        </div>

        {/* Payment Details */}
        {!isQuickex && order.paymentDetailsApplicable && (
          <PaymentDetailsCard
            paymentDetails={order.paymentDetails}
            paymentDetailsApplicable={order.paymentDetailsApplicable}
            sourcePaymentMethod={order.sourcePaymentMethod}
            customerMarkedPaidAt={order.customerMarkedPaidAt}
            actionsDisabled={halted || completed}
            onMarkPaid={markPaid}
            markPaidPending={markPaidMutation.isPending}
            supportHref={SUPPORT_TELEGRAM}
          />
        )}

        {hasPaymentInstructions && (
           <div className="relative rounded-3xl p-[1px] overflow-hidden group/pay" data-testid="order-confirmation-payment-card">
             <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500 opacity-30 blur-sm group-hover/pay:opacity-50 transition-opacity duration-500" />
             <div className="relative bg-card/95 backdrop-blur-xl rounded-3xl h-full p-5 sm:p-6 space-y-5 shadow-inner">
                <div className="flex items-center gap-4 border-b border-border/50 pb-4 relative z-10">
                    <div className="w-12 h-12 [&_.order-settlement-copy]:hidden [&_.crypto-identity-copy]:hidden flex items-center justify-center overflow-hidden bg-background rounded-full border border-border shrink-0 shadow-[0_0_12px_-4px_rgba(6,182,212,0.3)] relative [&_.order-settlement-identity]:!bg-transparent [&_.order-settlement-identity]:!p-0 [&_.order-settlement-identity]:!border-0 [&_.crypto-identity]:!bg-transparent [&_.crypto-identity]:!p-0 [&_.crypto-identity]:!border-0 [&_img]:!w-7 [&_img]:!h-7 [&_.crypto-network-badge]:hidden [&_svg]:!w-7 [&_svg]:!h-7">
                     <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-500/10 opacity-50" />
                     <div className="relative z-10 flex items-center justify-center w-full h-full">
                       <OrderSettlementIdentity assetCode={order.fromAsset} routeLabel={order.fromNetwork} settlementOptionId={order.sourceSettlementOptionId} size="md" compact={true} />
                     </div>
                   </div>
                   <div className="relative z-10">
                      <h3 className="font-bold text-lg tracking-tight text-foreground">{isCryptoDeposit ? 'Crypto Deposit Details' : 'Payment Details'}</h3>
                      <p className="text-sm text-muted-foreground leading-tight mt-0.5">
                         {isCryptoDeposit ? `Send exactly ${order.amount} ${order.fromAsset}` : order.sourcePaymentMethod?.name || 'Use the assigned order instructions'}
                      </p>
                   </div>
                </div>

                <div className="space-y-4">
                   {order.customerSafeNote && (
                     <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl mb-4 relative z-10">
                       <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{order.customerSafeNote}</p>
                     </div>
                   )}

                   {addressPending && (
                     <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-5 relative z-10 shadow-[0_4px_12px_-4px_rgba(6,182,212,0.15)]" data-testid="order-confirmation-address-pending">
                       <div className="flex items-start gap-3">
                         <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin text-primary" />
                         <div>
                           <strong className="block text-sm text-foreground">Generating your deposit address</strong>
                           <p className="mt-1 text-sm leading-relaxed text-foreground/70">
                             Keep this page open. Your address will appear here automatically.
                           </p>
                         </div>
                       </div>
                     </div>
                   )}

                   {addressUnavailable && (
                     <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 relative z-10" data-testid="order-confirmation-address-unavailable">
                       <div className="flex items-start gap-3">
                         <CircleAlert size={20} className="mt-0.5 shrink-0 text-destructive" />
                         <div>
                           <strong className="block text-sm text-foreground">Deposit address unavailable</strong>
                           <p className="mt-1 text-sm leading-relaxed text-foreground/70">
                             Do not send funds for this order. Contact support and provide order ID {order.id}.
                           </p>
                           <button
                             type="button"
                             className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:opacity-80 transition-opacity"
                             onClick={() => activeStatusQuery.refetch()}
                             disabled={activeStatusQuery.isFetching}
                           >
                             <RefreshCw size={15} className={activeStatusQuery.isFetching ? 'animate-spin' : ''} />
                             Check again
                           </button>
                         </div>
                       </div>
                     </div>
                   )}

                   {order.depositAddress && (
                     !showQR ? (
                       <button type="button" className="button button-primary w-full shadow-[0_4px_16px_-4px_rgba(59,130,246,0.4)] transition-all hover:shadow-[0_6px_24px_-6px_rgba(59,130,246,0.6)]" onClick={() => setShowQR(true)}>
                         Show QR
                       </button>
                     ) : (
                       <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex items-center justify-between rounded-2xl bg-secondary/5 border border-secondary/15 p-4" data-testid="text-deposit-amount">
                             <div>
                               <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Send Exactly</p>
                               <p className="font-mono text-xl font-bold">{order.amount} {order.fromAsset}</p>
                             </div>
                             <span className="text-xs font-bold rounded-full bg-secondary/10 text-secondary border border-secondary/20 px-3 py-1">
                               {order.fromNetwork || 'Crypto'}
                             </span>
                          </div>

                          <div className="mx-auto w-fit rounded-2xl bg-white p-4 shadow-[0_8px_28px_-12px_hsl(var(--primary)/0.5)] border border-border">
                            <QRCodeSVG value={order.depositAddress} size={160} level="M" includeMargin={false} />
                          </div>
                          <p className="text-center text-xs font-semibold text-muted-foreground">Scan the deposit address</p>

                          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs leading-relaxed text-muted-foreground">
                             <CircleAlert className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                             <span>Send only {order.fromAsset} on the {order.fromNetwork || 'shown'} network. Using another network may result in permanent loss.</span>
                          </div>

                          <div className="space-y-3">
                             <div className="relative bg-secondary/5 rounded-2xl p-4 border border-border shadow-sm">
                               <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
                                  Deposit Address
                                  {fundingAddressSourceLabel && (
                                    <span className="rounded-full bg-background border border-border px-2 py-0.5 text-[9px] text-muted-foreground lowercase normal-case">{fundingAddressSourceLabel}</span>
                                  )}
                               </div>
                               <div className="font-mono text-sm font-medium break-all pr-12">{order.depositAddress}</div>
                               {depositActionable && (
                                 <button onClick={() => handleCopy(order.depositAddress!)} className="absolute top-1/2 -translate-y-1/2 right-3 p-2.5 rounded-xl bg-background border border-border hover:bg-muted active:scale-95 transition-all text-muted-foreground shadow-sm" data-testid="button-copy-deposit">
                                   {copied === order.depositAddress ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                 </button>
                               )}
                             </div>

                             {order.depositMemo && (
                               <div className="relative bg-secondary/5 rounded-2xl p-4 border border-border shadow-sm">
                                 <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                   {depositActionable ? t('orderStatus.depositMemo') : t('orderStatus.depositMemoRecorded')}
                                 </div>
                                 <div className="font-mono text-sm font-bold break-all pr-12 text-amber-600 dark:text-amber-400">{order.depositMemo}</div>
                                 {depositActionable && (
                                   <button onClick={() => handleCopy(order.depositMemo!)} className="absolute top-1/2 -translate-y-1/2 right-3 p-2.5 rounded-xl bg-background border border-border hover:bg-muted active:scale-95 transition-all text-muted-foreground shadow-sm" data-testid="button-copy-deposit-memo">
                                     {copied === order.depositMemo ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                   </button>
                                 )}
                               </div>
                             )}
                          </div>

                          {(Boolean(fundingDetails?.warning) || Boolean(fundingDetails?.instructions) || Boolean(fundingDetails?.requiredConfirmations)) && (
                             <div className="space-y-3 text-sm text-muted-foreground bg-secondary/5 p-4 rounded-2xl border border-border">
                               {Boolean(fundingDetails?.warning) && (
                                 <div className="flex gap-3 text-amber-500">
                                   <CircleAlert size={16} className="shrink-0 mt-0.5" />
                                   <p className="leading-relaxed">{String(fundingDetails?.warning)}</p>
                                 </div>
                               )}
                               {Boolean(fundingDetails?.instructions) && (
                                 <div className="flex gap-3 text-foreground/80">
                                   <ShieldCheck size={16} className="shrink-0 mt-0.5 opacity-70" />
                                   <p className="leading-relaxed">{String(fundingDetails?.instructions)}</p>
                                 </div>
                               )}
                               {Boolean(fundingDetails?.requiredConfirmations) && (
                                 <div className="flex gap-3 text-foreground/80">
                                   <Network size={16} className="shrink-0 mt-0.5 text-primary/70" />
                                   <p className="leading-relaxed">{t('orderStatus.requiresConfirmations', { count: String(fundingDetails?.requiredConfirmations) })}</p>
                                 </div>
                               )}
                             </div>
                          )}

                          <button type="button" className="button button-secondary w-full" onClick={() => setShowQR(false)}>
                            Hide QR
                          </button>
                       </div>
                     )
                   )}


                </div>
             </div>
           </div>
        )}

        <div className="flex flex-col gap-3 pb-8">
          <Link href={`/status?order=${encodeURIComponent(order.id)}${trackingToken ? `&trackingToken=${encodeURIComponent(trackingToken)}` : ''}`} className="button button-primary h-14 rounded-2xl text-sm font-bold w-full shadow-[0_8px_24px_-8px_rgba(37,99,235,0.45),0_0_18px_-8px_rgba(6,182,212,0.45)] transition-all hover:shadow-[0_10px_30px_-8px_rgba(124,58,237,0.5),0_0_22px_-8px_rgba(6,182,212,0.55)]" data-testid="button-track-this-order">
            TRACK THIS ORDER
            <ArrowRight size={18} className="ml-2" />
          </Link>
          <div className="flex flex-col sm:flex-row gap-3">
             <button
               type="button"
               className="button button-secondary h-12 rounded-2xl shadow-sm text-xs font-bold flex-1 bg-secondary/5 border-border"
               onClick={() => handleCopy(order.id)}
               data-testid="button-copy-order-id"
             >
               {copied === order.id ? <Check size={16} className="mr-2" /> : <Copy size={16} className="mr-2" />}
               {copied === order.id ? 'ORDER ID COPIED' : 'COPY ORDER ID'}
             </button>
             <Link href="/" className="button button-secondary h-12 rounded-2xl shadow-sm text-xs font-bold flex-1 bg-secondary/5 border-border flex items-center justify-center text-center px-2" data-testid="button-start-another-conversion">
               START ANOTHER CONVERSION
             </Link>
          </div>
          {canCustomerCancel && (
            <div className="mt-2 border-t border-border/50 pt-4">
              <CancelOrderAction
                onConfirm={cancelOrder}
                pending={cancelOrderMutation.isPending}
                errorMessage={cancelError}
                triggerClassName="w-full sm:w-auto rounded-2xl bg-destructive/5 text-destructive border-destructive/20 hover:bg-destructive/10"
              />
            </div>
          )}
        </div>
      </main>
    </PublicShell>
  );
}
