import { useEffect } from 'react';
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
import { ChevronLeft, RefreshCcw, Check, X, Clock, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function OrderDetail() {
  const [, params] = useRoute('/orders/:id');
  const [, setLocation] = useLocation();
  const { isMock } = useAuth();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  
  const orderId = params?.id || '';

  // Setup back button
  useBackButton(() => {
    setLocation('/orders');
  });

  // Fetch linked order info
  const { data: orderData, isLoading: isOrderLoading } = useGetTelegramMiniAppOrder(
    orderId,
    { 
      query: { 
        queryKey: getGetTelegramMiniAppOrderQueryKey(orderId),
        enabled: !!orderId && !isMock
      },
      request: { headers }
    }
  );

  // Poll public status
  const trackingToken = orderData?.trackingToken;
  const { data: publicStatus, refetch } = useGetPublicOrderStatus(
    orderId,
    { trackingToken: trackingToken || '' },
    { 
      query: { 
        queryKey: getGetPublicOrderStatusQueryKey(orderId, { trackingToken: trackingToken || '' }),
        enabled: !!trackingToken,
        refetchInterval: 5000 // Poll every 5s
      }
    }
  );

  const markPaid = useMarkOrderPaid({ request: { headers } });
  const cancelOrder = useCancelCustomerOrder({ request: { headers } });

  const handleMarkPaid = async () => {
    if (!orderId || !trackingToken) return;
    haptic.impact('medium');
    try {
      await markPaid.mutateAsync({ id: orderId, data: { trackingToken } });
      haptic.notification('success');
      refetch();
    } catch (err) {
      haptic.notification('error');
    }
  };

  const handleCancel = async () => {
    if (!orderId || !trackingToken) return;
    if (confirm('Are you sure you want to cancel this order?')) {
      haptic.impact('heavy');
      try {
        await cancelOrder.mutateAsync({ id: orderId, data: { trackingToken } });
        haptic.notification('success');
        refetch();
      } catch (err) {
        haptic.notification('error');
      }
    }
  };

  if (isMock) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 pt-12">
        <h1 className="text-xl font-bold">Preview Mode</h1>
        <p className="text-sm text-muted-foreground">Order details are not available in preview mode.</p>
        <Button onClick={() => setLocation('/orders')} variant="secondary" className="rounded-xl">Go Back</Button>
      </div>
    );
  }

  if (isOrderLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center pt-12">
        <p className="text-muted-foreground">Order not found.</p>
      </div>
    );
  }

  const status = publicStatus?.status || orderData.status;
  
  const statusConfig = {
    pending: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: Clock, label: 'Awaiting Payment' },
    processing: { color: 'text-primary', bg: 'bg-primary/10', icon: RefreshCcw, label: 'Processing' },
    completed: { color: 'text-green-500', bg: 'bg-green-500/10', icon: Check, label: 'Completed' },
    failed: { color: 'text-red-500', bg: 'bg-red-500/10', icon: X, label: 'Failed' },
    cancelled: { color: 'text-red-500', bg: 'bg-red-500/10', icon: X, label: 'Cancelled' },
  }[status.toLowerCase()] || { color: 'text-muted-foreground', bg: 'bg-muted', icon: Clock, label: status };

  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between p-4 bg-background/80 backdrop-blur-xl border-b border-border">
        <button onClick={() => setLocation('/orders')} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="font-semibold text-sm">Order #{orderId.slice(0, 8)}</span>
        <div className="w-8" />
      </header>

      <div className="flex-1 p-4 space-y-6 overflow-y-auto pb-8">
        
        {/* Status Card */}
        <div className="premium-card p-6 flex flex-col items-center justify-center space-y-3">
          <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", statusConfig.bg)}>
            <StatusIcon className={cn("w-8 h-8", statusConfig.color)} />
          </div>
          <h2 className="text-2xl font-bold">{statusConfig.label}</h2>
          <p className="text-xs text-muted-foreground max-w-[250px] text-center">
            {status === 'pending' 
              ? 'Please send the exact amount to the address below.'
              : status === 'processing'
              ? 'We are confirming your transaction.'
              : status === 'completed'
              ? 'Your exchange was successful.'
              : 'This order is no longer active.'}
          </p>
        </div>

        {/* Exchange Details */}
        <div className="premium-card p-4 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground border-b border-white/5 pb-2">Exchange Details</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">You Send</span>
              <div className="font-bold text-lg">{publicStatus?.amount || orderData.amount}</div>
              <span className="text-xs font-medium bg-secondary/10 text-secondary px-2 py-0.5 rounded w-fit">
                {publicStatus?.fromAsset || orderData.fromAsset}
              </span>
            </div>
            
            <div className="space-y-1 text-right">
              <span className="text-xs text-muted-foreground">You Receive</span>
              <div className="font-bold text-lg text-primary">{publicStatus?.receiveAmount || orderData.receiveAmount}</div>
              <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded w-fit ml-auto">
                {publicStatus?.toAsset || orderData.toAsset}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Instructions (If Pending) */}
        {status === 'pending' && (
          <div className="premium-card p-5 space-y-4 border-primary/30">
            <h3 className="font-bold text-lg text-primary flex items-center">
              Payment Instructions
            </h3>
            <div className="space-y-3">
              <div className="bg-background/50 p-3 rounded-xl break-all">
                <span className="text-xs text-muted-foreground block mb-1">Pay to Address:</span>
                <span className="font-mono text-sm font-bold select-all">
                  {publicStatus?.depositAddress || 'Generating...'}
                </span>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  onClick={handleMarkPaid}
                  disabled={markPaid.isPending}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground"
                >
                  {markPaid.isPending ? 'Updating...' : 'I have paid'}
                </Button>
                <Button 
                  onClick={handleCancel}
                  disabled={cancelOrder.isPending}
                  variant="destructive"
                  className="rounded-xl px-4 bg-destructive/10 text-destructive hover:bg-destructive/20 border-0"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Support Link */}
        <div className="flex justify-center pt-2">
          <Link href="/support">
            <button className="flex items-center text-xs text-muted-foreground hover:text-primary transition-colors">
              <ExternalLink className="w-3 h-3 mr-1" />
              Need help with this order?
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
