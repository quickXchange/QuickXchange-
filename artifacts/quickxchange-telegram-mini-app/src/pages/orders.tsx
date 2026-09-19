import { useAuth, useAuthHeaders } from '@/lib/auth';
import { useListTelegramMiniAppOrders, getListTelegramMiniAppOrdersQueryKey } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { History, Search, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/lib/hooks';

export default function Orders() {
  const { isMock } = useAuth();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();

  const { data: ordersData, isLoading } = useListTelegramMiniAppOrders(
    { 
      query: { 
        queryKey: getListTelegramMiniAppOrdersQueryKey(),
        enabled: Boolean(headers.Authorization) && !isMock
      },
      request: { headers }
    }
  );

  return (
    <div className="flex flex-col p-4 space-y-4 pt-6">
      <h1 className="text-2xl font-bold">My Orders</h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="premium-card p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : ordersData && ordersData.length > 0 ? (
        <div className="space-y-3 pb-6">
          {ordersData.map((order: any) => (
            <Link key={order.id} href={`/orders/${order.id}`} onClick={() => haptic.selection()}>
              <div className="premium-card p-4 flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <History className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <div className="font-semibold text-sm flex items-center">
                      <span className="truncate max-w-[80px]">{order.amount} {order.fromAsset}</span>
                      <ArrowRight className="w-3 h-3 mx-1 text-muted-foreground" />
                      <span className="truncate max-w-[80px]">{order.toAsset}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(order.createdAt), 'MMM d, HH:mm')}
                    </div>
                  </div>
                </div>
                <div className={cn(
                  "text-[10px] px-2 py-1 rounded-md font-semibold tracking-wider",
                  order.status === 'completed' ? "bg-green-500/10 text-green-500" :
                  order.status === 'failed' || order.status === 'cancelled' ? "bg-red-500/10 text-red-500" :
                  "bg-yellow-500/10 text-yellow-500"
                )}>
                  {order.status.toUpperCase()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-3 min-h-[40vh]">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Search className="w-8 h-8 text-primary/50" />
          </div>
          <p className="text-muted-foreground text-sm">No orders found.</p>
        </div>
      )}
    </div>
  );
}
