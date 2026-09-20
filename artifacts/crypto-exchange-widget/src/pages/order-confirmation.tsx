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
  CircleAlert, RefreshCw, Loader2, Copy, Network, Check, ArrowRight, ShieldCheck
} from "lucide-react";
import { useI18n } from "@/i18n";
import { CancelOrderAction, cn, PaymentDetailsCard, publicApiErrorText, SUPPORT_TELEGRAM } from "@/components/shared-app-ui";
import { OrderSettlementIdentity } from "@/components/order-settlement-identity";
import { QRCodeSVG } from "qrcode.react";
import { convertOrderStatusLabel, convertOrderStatusStep, isConvertTerminalStatus } from "@/lib/convert-order-status";

function AddressCopyBox({ text, actionable = true }: { text: string; actionable?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!actionable) return;
    void navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="oc-address-box">
      <code>{text}</code>
      {actionable && (
        <button type="button" onClick={copy} className={copied ? "copied" : ""} data-testid="button-copy-deposit" aria-label={copied ? t('actions.copied') : t('orderStatus.copyToClipboard')}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>
      )}
    </div>
  );
}

function MemoCopyBox({ text, label, actionable = true }: { text: string; label: string; actionable?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!actionable) return;
    void navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4">
      <span className="oc-label">{label}</span>
      <div className="oc-address-box mt-2">
        <code>{text}</code>
        {actionable && (
          <button type="button" onClick={copy} className={copied ? "copied" : ""} data-testid="button-copy-deposit-memo" aria-label={copied ? t('actions.copied') : t('orderStatus.copyToClipboard')}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}

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
  const [orderIdCopied, setOrderIdCopied] = useState(false);
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

  const copyOrderId = () => {
    if (!order) return;
    navigator.clipboard.writeText(order.id);
    setOrderIdCopied(true);
    setTimeout(() => setOrderIdCopied(false), 2000);
  };

  const renderLoading = () => (
    <PublicShell>
      <div className="order-confirmation-main min-h-[80vh] flex flex-col items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
          <Loader2 size={48} className="animate-spin text-blue-400 relative z-10" />
        </div>
        <h2 className="oc-loading-title mt-8 text-xl font-bold tracking-tight">Securing your order...</h2>
        <p className="mt-2 text-muted-foreground text-sm">Please wait while we confirm details.</p>
      </div>
    </PublicShell>
  );

  const renderError = () => (
    <PublicShell>
      <div className="order-confirmation-main min-h-[80vh] flex flex-col items-center justify-center">
        <div className="oc-card oc-error-card w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-6">
            <CircleAlert size={32} />
          </div>
          <h2 className="oc-error-title text-2xl font-bold tracking-tight mb-2">Order Not Found</h2>
          <p className="text-muted-foreground mb-8">{lookupErrorMessage}</p>
          <div className="flex flex-col gap-3">
            {activeStatusQuery.isError && !notFound && (
              <button className="oc-btn oc-btn-primary w-full" onClick={() => activeStatusQuery.refetch()}>
                {t('orderStatus.retry')}
              </button>
            )}
            <Link href="/" className="oc-btn oc-btn-secondary w-full">
              Return to Exchange
            </Link>
          </div>
        </div>
      </div>
    </PublicShell>
  );

  if (!order) {
    if (activeStatusQuery.isError && notFound) return renderError();
    if (activeStatusQuery.isFetching || !activeStatusQuery.isFetched) return renderLoading();
    if (activeStatusQuery.isError) return renderError();
    return renderLoading();
  }

  const isManual = order.type === 'manual' || Boolean(order.manualSettlementState);
  const mss = (order.manualSettlementState || 'awaiting_funds').toLowerCase();

  const status = order.status.toLowerCase();
  const halted = /refund|expire|fail|cancel/.test(status) || mss === 'cancelled' || mss === 'failed';
  const uncertain = /unknown|held|verification|review/.test(status) || order.outcomeUnknown;
  const completed = /complete|paid/.test(status) || mss === 'completed';
  const canCustomerCancel = !isQuickex && isManual && mss === 'awaiting_funds' &&
    !order.customerMarkedPaidAt && !halted && !uncertain && !completed && !/process|paid/.test(status);
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
  const fundingAddressSource = typeof fundingDetails?.addressSource === 'string'
    ? fundingDetails.addressSource
    : order.fundingSource === 'whitebit'
      ? 'live_api'
      : order.fundingSource === 'manual'
        ? 'manual_only'
        : undefined;
  const fundingAddressSourceLabel = fundingAddressSource === 'live_api'
    ? 'Unique API address'
    : fundingAddressSource === 'manual_fallback'
      ? 'Manual fallback address'
      : fundingAddressSource === 'manual_only'
        ? 'Manual address'
        : null;
  
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

  const timeline = isManual
    ? ['awaitingFunds', 'fundsConfirmed', 'payoutProcessing', 'payoutSent', 'completed']
    : ['created', 'processing', 'completed'];

  const current = isManual
    ? (mss === 'completed' ? 4 : mss === 'payout_sent' ? 3 : mss === 'payout_processing' ? 2 : mss === 'funds_confirmed' ? 1 : 0)
    : convertOrderStatusStep(status);
  const progressTimeline = isManual
    ? [
        { key: 'order-created', label: 'Order Created' },
        { key: 'deposit-received', label: 'Payment Detected' },
        { key: 'processing', label: 'Processing' },
        { key: 'completed', label: 'Completed' },
      ]
    : [
        { key: 'order-created', label: 'Created' },
        { key: 'confirming', label: 'Confirming' },
        { key: 'processing', label: 'Processing' },
        { key: 'completed', label: 'Done' },
      ];
  const progressCurrent = isManual
    ? completed ? 3 : current >= 2 ? 2 : current >= 1 ? 1 : 0
    : current;
  const completedProgressShare = completed
    ? 100
    : progressCurrent > 0
      ? ((progressCurrent - 1) / progressCurrent) * 100
      : 0;

  const haltedMessage = /refund/.test(status) ? t('orderStatus.refunded')
    : /expire/.test(status) ? t('orderStatus.expired')
      : t('orderStatus.stopped');

  return (
    <PublicShell>
      <main className="order-confirmation-main">
        <div className="oc-container animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          <div className="oc-topbar oc-card oc-header-card">
            <div className="oc-intro">
              <div className={cn(
                "oc-status-icon",
                completed ? "oc-completed" : halted ? "oc-halted" : uncertain ? "oc-warning" : ""
              )}>
                <Check size={28} strokeWidth={3} />
              </div>
              <div className="oc-intro-copy">
                <h1 className={cn(
                  "oc-title",
                  completed && "oc-title-completed",
                  halted && "oc-title-halted",
                )} data-testid="heading-order-created">
                  {halted ? 'Order Halted' : completed ? 'Order Completed' : 'Order Created'}
                </h1>
                <p className="oc-subtitle">
                  {halted ? haltedMessage : completed ? 'Your exchange has been completed successfully.' : 'Your exchange is being processed.'}
                </p>
              </div>
            </div>

            <div className="oc-order-card">
              <div className="oc-order-id-group">
                 <span className="oc-label">Order ID</span>
                 <div className="oc-order-id-row">
                   <code className="oc-order-id" data-testid="text-order-id">{order.id}</code>
                   <button
                     className={cn("oc-copy-btn", orderIdCopied && "copied")}
                     onClick={copyOrderId}
                     aria-label="Copy Order ID"
                     data-testid="button-copy-header-order-id"
                   >
                     {orderIdCopied ? <Check size={14} /> : <Copy size={14} />}
                   </button>
                 </div>
              </div>
              <div className={cn(
                "oc-status-badge",
                halted ? "oc-status-danger" : completed ? "oc-status-success" : uncertain ? "oc-status-warning" : "oc-status-primary"
              )} data-testid="status-order-confirmation">
                  {isQuickex ? convertOrderStatusLabel(order.status) : order.status}
              </div>
            </div>
          </div>

          {!halted && (
            <div className="oc-card oc-progress-card">
              <div className="oc-timeline">
                <div className="oc-timeline-track" />
                <div
                  className={cn("oc-timeline-fill", completed && "oc-timeline-fill-completed")}
                  style={{
                    transform: `scaleX(${progressCurrent / (progressTimeline.length - 1)})`,
                    '--oc-completed-share': `${completedProgressShare}%`,
                  } as React.CSSProperties}
                />
                
                {progressTimeline.map((item, index) => {
                  const isCompletedStep = completed || index < progressCurrent;
                  const isCurrent = index === progressCurrent;
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        "oc-timeline-step",
                        isCompletedStep && "completed-step",
                        isCurrent && !completed && "current",
                      )}
                      title={item.label}
                    >
                      <div className="oc-step-icon">
                        <Check size={14} strokeWidth={3} />
                      </div>
                      <span className="oc-step-label">{item.label}</span>
                    </div>
                  );
                })}
              </div>

              {(order.refreshUnavailable || activeStatusQuery.isError) && (
                <div className="mt-8 p-4 bg-warning/10 border border-warning/20 rounded-2xl flex gap-3 text-warning-foreground text-sm">
                  <RefreshCw size={18} className="mt-0.5 shrink-0 animate-spin-slow" />
                  <p>{t('orderStatus.liveUpdatesUnavailable')}</p>
                </div>
              )}
            </div>
          )}

          <div className="oc-dashboard-grid">
            <div className="oc-card oc-summary-card" data-testid="order-confirmation-exchange-summary">
              <h2 className="oc-section-title">Conversion Summary</h2>
              <div className="oc-summary-row">
                <div className="oc-summary-asset">
                   <span className="oc-label">You Send</span>
                   <OrderSettlementIdentity
                     assetCode={order.fromAsset}
                     routeLabel={order.fromNetwork}
                     settlementOptionId={order.sourceSettlementOptionId}
                     size="lg"
                   />
                   <div className="oc-amount">
                     <span className="oc-amount-value">{formatAmount(order.amount)}</span>
                     <span className="oc-amount-unit">{order.fromAsset}</span>
                   </div>
                </div>
                <div className="oc-summary-arrow"><ArrowRight size={24} /></div>
                <div className="oc-summary-asset">
                   <span className="oc-label">You Receive</span>
                   <OrderSettlementIdentity
                     assetCode={order.toAsset}
                     routeLabel={order.toNetwork}
                     settlementOptionId={order.targetSettlementOptionId}
                     size="lg"
                   />
                   <div className="oc-amount">
                     <span className="oc-amount-value">{isManual ? '≈ ' : ''}{formatAmount(order.receiveAmount)}</span>
                     <span className="oc-amount-unit">{order.toAsset}</span>
                   </div>
                </div>
              </div>

              <div className={`oc-summary-details ${isQuickex ? 'oc-summary-details-convert' : ''}`}>
                {!isQuickex && (
                  <div className="oc-detail">
                    <span className="oc-label">Exchange Rate</span>
                    <span className="oc-value oc-value-highlight">
                      {(() => {
                        const from = Number(order.amount);
                        const to = Number(order.receiveAmount);
                        return from > 0 && to > 0
                          ? `1 ${order.fromAsset} = ${formatNumber(to / from, { maximumFractionDigits: 6 })} ${order.toAsset}`
                          : '—';
                      })()}
                    </span>
                  </div>
                )}
                <div className="oc-detail oc-detail-center">
                   <span className="oc-label">Network Fee</span>
                    <span className="oc-value oc-value-success">Included</span>
                </div>
                <div className="oc-detail oc-detail-right">
                   <span className="oc-label">You Receive (Est.)</span>
                   <span className="oc-value">≈ {formatAmount(order.receiveAmount)} {order.toAsset}</span>
                </div>
              </div>
            </div>

            <div className="oc-deposit-column">
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
                <div className="oc-card oc-deposit-card" data-testid="order-confirmation-payment-card">
               <div className="oc-deposit-header">
                 <span className="oc-label">Deposit Instructions</span>
                 <div className="flex items-center gap-3">
                   <OrderSettlementIdentity
                     assetCode={order.fromAsset}
                     routeLabel={order.fromNetwork}
                     settlementOptionId={order.sourceSettlementOptionId}
                     size="lg"
                   />
                    {fundingAddressSourceLabel && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                        {fundingAddressSourceLabel}
                      </span>
                    )}
                 </div>
               </div>

               <div className="space-y-0 relative z-10">
                 {order.customerSafeNote && (
                   <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl mb-4">
                     <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{order.customerSafeNote}</p>
                   </div>
                 )}

                  {addressPending && (
                    <div
                      className="rounded-xl border border-primary/20 bg-primary/10 p-5"
                      data-testid="order-confirmation-address-pending"
                    >
                      <div className="flex items-start gap-3">
                        <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin text-primary" />
                        <div>
                          <strong className="block text-sm text-white">Generating your deposit address</strong>
                          <p className="mt-1 text-sm leading-relaxed text-white/70">
                            Keep this page open. Your address will appear here automatically.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {addressUnavailable && (
                    <div
                      className="rounded-xl border border-destructive/30 bg-destructive/10 p-5"
                      data-testid="order-confirmation-address-unavailable"
                    >
                      <div className="flex items-start gap-3">
                        <CircleAlert size={20} className="mt-0.5 shrink-0 text-destructive" />
                        <div>
                          <strong className="block text-sm text-white">Deposit address unavailable</strong>
                          <p className="mt-1 text-sm leading-relaxed text-white/70">
                            Do not send funds for this order. Contact support and provide order ID {order.id}.
                          </p>
                          <button
                            type="button"
                            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white"
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
                   <>
                     <div className="oc-deposit-amount-row" data-testid="text-deposit-amount">
                         <div className="oc-qr shadow-sm">
                           <QRCodeSVG
                             value={order.depositAddress}
                             size={96}
                             bgColor={"#ffffff"}
                             fgColor={"#000000"}
                             level={"M"}
                             includeMargin={false}
                           />
                         </div>

                        <div className="min-w-0">
                          <span className="oc-label">Send Exactly</span>
                          <div className="oc-send-amount">
                             <span className="oc-send-amount-value">{formatAmount(order.amount)}</span>
                             <span className="oc-send-amount-unit">{order.fromAsset}</span>
                          </div>
                          <div className="oc-network-info">
                            on {order.fromNetwork || t('orderStatus.sourceNetwork')} network
                          </div>
                         </div>
                     </div>

                     <div>
                       <span className="oc-label">Deposit Address</span>
                       <AddressCopyBox text={order.depositAddress} actionable={depositActionable} />
                     </div>

                     {depositActionable && (
                        <div className="oc-warning">
                          <CircleAlert size={20} />
                          <p>
                            Send only {order.fromAsset} {order.fromNetwork ? `(${order.fromNetwork})` : ''} to this address. Sending other assets may result in loss of funds.
                          </p>
                        </div>
                     )}
                   </>
                 )}

                 {order.depositMemo && (
                   <MemoCopyBox
                     label={depositActionable ? t('orderStatus.depositMemo') : t('orderStatus.depositMemoRecorded')}
                     text={order.depositMemo}
                     actionable={depositActionable}
                   />
                 )}

                 {depositActionable && (Boolean(fundingDetails?.warning) || Boolean(fundingDetails?.instructions) || Boolean(fundingDetails?.requiredConfirmations)) && (
                   <div className="mt-6 space-y-3 text-sm text-muted-foreground bg-muted/20 p-4 rounded-xl border border-white/10">
                     {Boolean(fundingDetails?.warning) && (
                       <div className="flex gap-3 text-warning">
                         <CircleAlert size={16} className="shrink-0 mt-0.5" />
                         <p className="leading-relaxed">{String(fundingDetails?.warning)}</p>
                       </div>
                     )}
                     {Boolean(fundingDetails?.instructions) && (
                       <div className="flex gap-3 text-white/80">
                         <ShieldCheck size={16} className="shrink-0 mt-0.5 opacity-70" />
                         <p className="leading-relaxed">{String(fundingDetails?.instructions)}</p>
                       </div>
                     )}
                     {Boolean(fundingDetails?.requiredConfirmations) && (
                       <div className="flex gap-3 text-white/80">
                         <Network size={16} className="shrink-0 mt-0.5 text-primary/70" />
                         <p className="leading-relaxed">{t('orderStatus.requiresConfirmations', { count: String(fundingDetails?.requiredConfirmations) })}</p>
                       </div>
                     )}
                   </div>
                 )}
               </div>
                </div>
              )}
            </div>
          </div>

          <div className="oc-actions">
            <Link href={`/status?order=${encodeURIComponent(order.id)}${trackingToken ? `&trackingToken=${encodeURIComponent(trackingToken)}` : ''}`} className="oc-btn oc-btn-primary" data-testid="button-track-this-order">
              TRACK THIS ORDER
              <ArrowRight size={18} />
            </Link>

            <div className="oc-secondary-actions">
              <button
                type="button"
                className={cn("oc-btn oc-btn-secondary", orderIdCopied && "copied")}
                onClick={copyOrderId}
                data-testid="button-copy-order-id"
              >
                {orderIdCopied ? <Check size={16} /> : <Copy size={16} />}
                {orderIdCopied ? 'ORDER ID COPIED' : 'COPY ORDER ID'}
              </button>

              <Link href="/" className="oc-btn oc-btn-secondary oc-btn-start-another" data-testid="button-start-another-conversion">
                START ANOTHER CONVERSION
              </Link>
            </div>
             {canCustomerCancel && (
               <div className="mt-4 border-t border-destructive/15 pt-4">
                 <CancelOrderAction
                   onConfirm={cancelOrder}
                   pending={cancelOrderMutation.isPending}
                   errorMessage={cancelError}
                   triggerClassName="w-full sm:w-auto"
                 />
               </div>
             )}
          </div>

        </div>
      </main>
    </PublicShell>
  );
}
