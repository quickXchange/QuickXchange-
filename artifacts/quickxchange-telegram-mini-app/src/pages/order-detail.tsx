import { useState, useEffect } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import {
  useGetTelegramMiniAppOrder, getGetTelegramMiniAppOrderQueryKey,
  useGetPublicOrderStatus, getGetPublicOrderStatusQueryKey,
  useMarkOrderPaid,
  useCancelCustomerOrder
} from '@workspace/api-client-react';
import { useAuth, useAuthHeaders } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { useBackButton, useHapticFeedback } from '@/lib/hooks';
import { ChevronLeft, RefreshCcw, Check, X, Clock, Copy, ArrowRight, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

export default function OrderDetail() {
  const [, params] = useRoute('/orders/:id');
  const [, setLocation] = useLocation();
  const { supportUrl } = useAuth();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();

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

  const { data: publicStatus, refetch } = useGetPublicOrderStatus(
    orderId,
    { trackingToken: trackingToken || '' },
    {
      query: {
        queryKey: getGetPublicOrderStatusQueryKey(orderId, { trackingToken: trackingToken || '' }),
        enabled: !!trackingToken,
        refetchInterval: (query) => {
          const status = query.state.data?.status?.toLowerCase() || '';
          if (['completed', 'paid', 'failed', 'cancelled', 'expired'].includes(status)) return false;
          return 5000;
        }
      }
    }
  );

  const markPaid = useMarkOrderPaid({ request: { headers } });
  const cancelOrder = useCancelCustomerOrder({ request: { headers } });

  const [copied, setCopied] = useState(false);
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    haptic.selection();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMarkPaid = async () => {
    if (!orderId || !trackingToken) return;
    haptic.impact('medium');
    try {
      await markPaid.mutateAsync({ id: orderId, data: { trackingToken } });
      haptic.notification('success');
      queryClient.invalidateQueries({ queryKey: getGetPublicOrderStatusQueryKey(orderId, { trackingToken }) });
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
        <Button onClick={() => setLocation('/orders')} variant="secondary" className="rounded-xl">Go Back</Button>
      </div>
    );
  }

  const status = (publicStatus?.status || orderData.status || '').toLowerCase();

  const isPending = status === 'pending' || status === 'awaiting_funds';
  const isProcessing = status === 'processing' || status === 'exchanging' || status === 'sending';
  const isCompleted = status === 'completed' || status === 'paid';
  const isFailed = status === 'failed' || status === 'cancelled' || status === 'expired';

  const statusConfig = {
    color: isCompleted ? 'text-primary' : isFailed ? 'text-destructive' : isProcessing ? 'text-secondary' : 'text-yellow-500',
    bg: isCompleted ? 'bg-primary/10' : isFailed ? 'bg-destructive/10' : isProcessing ? 'bg-secondary/10' : 'bg-yellow-500/10',
    icon: isCompleted ? Check : isFailed ? X : isProcessing ? RefreshCcw : Clock,
    label: isCompleted ? 'Completed' : isFailed ? (status === 'cancelled' ? 'Cancelled' : 'Failed') : isProcessing ? 'Processing' : 'Awaiting Payment',
    message: isCompleted
      ? 'Your exchange was successful.'
      : isFailed
      ? 'This order is no longer active.'
      : isProcessing
      ? 'We are confirming your transaction.'
      : 'Please send the exact amount to the details below.'
  };

  const StatusIcon = statusConfig.icon;
  const currentStep = isCompleted ? 4 : isProcessing ? 3 : isPending ? (publicStatus?.customerMarkedPaidAt ? 2 : 1) : 0;

  const targetStatus = publicStatus || orderData;
  const showPaymentActions = isPending && !targetStatus?.customerMarkedPaidAt && !isFailed && targetStatus?.paymentDetailsApplicable;

  const getLogoUrl = (url?: string) => {
    if (!url) return undefined;
    return url.startsWith('/objects/') ? `/api/storage${url}` : url;
  };

  const logos = (targetStatus as any).logos;
  const sourcePaymentMethod = (targetStatus as any).sourcePaymentMethod;

  const fromLogo = getLogoUrl(sourcePaymentMethod?.logoUrl || logos?.sourceLogoUrl || logos?.fromAssetLogoUrl);
  const toLogo = getLogoUrl(logos?.targetLogoUrl || logos?.toAssetLogoUrl);
  const sourceIdentity = sourcePaymentMethod?.name || targetStatus.fromNetwork || targetStatus.fromAsset;

  const paymentFields = () => {
    if (!publicStatus && !orderData) return null;
    const targetStatus = publicStatus || orderData;
    const elements: React.ReactNode[] = [];

    if (targetStatus.depositAddress) {
      elements.push(
        <div key="depositAddress" className="bg-background/80 p-4 rounded-2xl shadow-inner border border-white/5 relative group">
          <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Deposit Address</span>
          <div className="font-mono text-[13px] font-medium leading-relaxed break-all whitespace-pre-wrap">{targetStatus.depositAddress}</div>
          <button onClick={() => handleCopy(targetStatus.depositAddress!)} className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-muted-foreground">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      );
    }

    if (targetStatus.depositMemo) {
      elements.push(
        <div key="depositMemo" className="bg-background/80 p-4 rounded-2xl shadow-inner border border-white/5 relative group mt-3">
          <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Memo / TAG</span>
          <div className="font-mono text-[13px] font-medium leading-relaxed break-all whitespace-pre-wrap">{targetStatus.depositMemo}</div>
          <button onClick={() => handleCopy(targetStatus.depositMemo!)} className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-muted-foreground">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      );
    }

    if (!targetStatus.depositAddress && targetStatus.paymentDetails && typeof targetStatus.paymentDetails === 'object') {
      for (const [key, value] of Object.entries(targetStatus.paymentDetails)) {
        if (value) {
          elements.push(
            <div key={key} className="bg-background/80 p-4 rounded-2xl shadow-inner border border-white/5 relative group mt-3">
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">{key.replace(/_/g, ' ')}</span>
              <div className="font-mono text-[13px] font-medium leading-relaxed break-all whitespace-pre-wrap">{String(value)}</div>
              <button onClick={() => handleCopy(String(value))} className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-muted-foreground">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          );
        }
      }
    }

    return elements;
  };

  const paymentElements = paymentFields();

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between p-3 glass-nav">
        <button onClick={() => { haptic.selection(); setLocation('/orders'); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-[22px] h-[22px]" />
        </button>
        <span className="font-bold text-[15px] tracking-tight">Order #{orderId.slice(0, 8)}</span>
        <div className="w-9" />
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-8 animate-in slide-in-from-bottom-4 duration-500">

        <div className="premium-card p-6 flex flex-col items-center justify-center space-y-4 surface-animated">
          <div className={cn("w-[72px] h-[72px] rounded-full flex items-center justify-center relative", statusConfig.bg)}>
            <div className={cn("absolute inset-0 blur-md rounded-full opacity-50", statusConfig.bg)} />
            <StatusIcon className={cn("w-9 h-9 relative z-10", statusConfig.color, isProcessing && "animate-spin-slow")} />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-[22px] font-bold tracking-tight">{statusConfig.label}</h2>
            <p className="text-[13px] text-muted-foreground max-w-[250px] leading-relaxed">
              {statusConfig.message}
            </p>
          </div>

          {!isFailed && (
            <div className="w-full max-w-[280px] mt-2">
              <div className="flex justify-between mb-2">
                {[1, 2, 3, 4].map(step => (
                  <div key={step} className={cn(
                    "h-1.5 flex-1 mx-0.5 rounded-full transition-all duration-500",
                    step <= currentStep ? "bg-primary shadow-[0_0_8px_hsl(var(--primary))]" : "bg-white/10"
                  )} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="premium-card p-5 space-y-4">
          <h3 className="font-bold text-[14px] uppercase tracking-wider text-muted-foreground/80 border-b border-border/50 pb-3">Conversion Summary</h3>

          <div className="grid grid-cols-2 gap-4 items-center">
            <div className="space-y-1.5 flex flex-col items-start">
              <span className="text-[12px] font-semibold text-muted-foreground">You Send</span>
              <div className="font-bold text-[20px] tracking-tight">{targetStatus.amount}</div>
              <div className="flex items-center gap-2 bg-secondary/10 text-secondary border border-secondary/20 px-2 py-1 rounded-md w-fit shadow-sm">
                {fromLogo && <img src={fromLogo} alt="" className="w-4 h-4 rounded-full object-contain" />}
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  {targetStatus.fromAsset} {sourceIdentity ? `(${sourceIdentity})` : ''}
                </span>
              </div>
            </div>

            <div className="flex justify-center -mx-4">
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground border border-white/10">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            <div className="space-y-1.5 flex flex-col items-end text-right">
              <span className="text-[12px] font-semibold text-muted-foreground">You Receive</span>
              <div className="font-bold text-[20px] tracking-tight text-primary">{targetStatus.receiveAmount}</div>
              <div className="flex items-center gap-2 bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-md w-fit shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  {targetStatus.toAsset} {targetStatus.toNetwork ? `(${targetStatus.toNetwork})` : ''}
                </span>
                {toLogo && <img src={toLogo} alt="" className="w-4 h-4 rounded-full object-contain" />}
              </div>
            </div>
          </div>
        </div>

        {isPending && (
          <div className="premium-card p-5 space-y-4 illuminated-border bg-primary/5">
            <h3 className="font-bold text-[16px] text-primary flex items-center tracking-tight">
              Payment Instructions
            </h3>
            <div className="space-y-4">
              {paymentElements && paymentElements.length > 0 ? (
                paymentElements
              ) : (
                <div className="bg-background/80 p-4 rounded-2xl shadow-inner border border-white/5 relative group">
                  <div className="flex flex-col items-center justify-center py-2 space-y-3">
                    <span className="text-[13px] font-medium text-center">Payment details not assigned automatically.</span>
                    <button
                      onClick={() => {
                        const tg = window.Telegram?.WebApp;
                        if (supportUrl) {
                          if (supportUrl.includes('t.me/')) {
                            tg?.openTelegramLink(supportUrl);
                          } else {
                            tg?.openLink(supportUrl);
                          }
                        }
                      }}
                      className={cn("inline-flex items-center justify-center rounded-xl font-bold bg-secondary text-secondary-foreground h-9 px-4 text-sm", !supportUrl && "hidden")}
                    >
                      Contact Support
                    </button>
                  </div>
                </div>
              )}

              {showPaymentActions && (
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleMarkPaid}
                    disabled={markPaid.isPending || (!paymentElements || paymentElements.length === 0)}
                    className="flex-1 h-[48px] rounded-xl bg-primary text-primary-foreground font-bold shadow-[0_4px_14px_-6px_hsl(var(--primary))] active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {markPaid.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'I have paid'}
                  </Button>
                  <Button
                    onClick={handleCancel}
                    disabled={cancelOrder.isPending}
                    variant="destructive"
                    className="h-[48px] px-5 rounded-xl bg-destructive/10 text-destructive font-bold border border-destructive/20 hover:bg-destructive/20 active:scale-95 transition-all"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-center pt-4 pb-10">
          <button
            onClick={() => {
              const tg = window.Telegram?.WebApp;
              if (supportUrl) {
                if (supportUrl.includes('t.me/')) {
                  tg?.openTelegramLink(supportUrl);
                } else {
                  tg?.openLink(supportUrl);
                }
              }
            }}
            className={cn("flex items-center text-[13px] font-semibold text-muted-foreground hover:text-primary transition-colors bg-white/5 px-4 py-2 rounded-full border border-white/5", !supportUrl && "hidden")}
          >
            Need help with this order?
            <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-70" />
          </button>
        </div>
      </div>
    </div>
  );
}