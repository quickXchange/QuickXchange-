import { useState } from 'react';
import { useAuthHeaders } from '@/lib/auth';
import {
  useListTelegramMiniAppOrders, getListTelegramMiniAppOrdersQueryKey,
  useGetExchangeConfig, getGetExchangeConfigQueryKey,
} from '@workspace/api-client-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useHapticFeedback } from '@/lib/hooks';
import { MiniAppLogo } from '@/components/mini-app-logo';
import { resolveOrderVisual } from '@/lib/logo-catalog';

export default function Orders() {
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: exchangeConfig } = useGetExchangeConfig({
    query: { queryKey: getGetExchangeConfigQueryKey(), staleTime: 60_000 },
  });

  const { data: ordersData, isLoading } = useListTelegramMiniAppOrders({
    query: {
      queryKey: getListTelegramMiniAppOrdersQueryKey(),
      enabled: Boolean(headers.Authorization),
      refetchInterval: (query) => {
        const orders = query.state.data || [];
        const hasActive = orders.some((o: any) => !['completed', 'paid', 'failed', 'cancelled', 'expired'].includes((o.status || '').toLowerCase()));
        return hasActive ? 10000 : false;
      },
    },
    request: { headers }
  });

  const filteredOrders = ordersData?.filter((order: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      order.id.toLowerCase().includes(query) ||
      order.fromAsset.toLowerCase().includes(query) ||
      order.toAsset.toLowerCase().includes(query) ||
      order.status.toLowerCase().includes(query)
    );
  }) || [];

  return (
    <div className="flex flex-col p-4 space-y-4 pt-6 max-w-md mx-auto w-full pb-24 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-[22px] font-bold tracking-tight">My Orders</h1>
        <Link
          href="/track"
          onClick={() => haptic.selection()}
          className="text-[13px] font-semibold text-primary hover:text-primary/80 transition-colors px-3 py-1.5 bg-primary/10 rounded-full"
        >
          Track ID
        </Link>
      </div>

      <div className="relative mb-2">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-muted-foreground/70" />
        </div>
        <Input
          type="text"
          placeholder="Search orders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-background/50 h-12 rounded-2xl border-white/5 focus-visible:ring-primary/50 text-[14px] shadow-sm placeholder:text-muted-foreground/50"
        />
        {searchQuery && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md">
              {filteredOrders.length}
            </span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="premium-card p-4 flex justify-between items-center opacity-70">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-full bg-muted animate-pulse" />
                <div className="space-y-2.5">
                  <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="space-y-3 pb-6">
          {filteredOrders.map((order: any) => {
            const sourceVisual = resolveOrderVisual(exchangeConfig?.settlementOptions, order, 'source');
            const targetVisual = resolveOrderVisual(exchangeConfig?.settlementOptions, order, 'target');

            return (
            <Link key={order.id} href={`/orders/${order.id}`} onClick={() => haptic.selection()}>
              <div className="premium-card p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all group">
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className="flex -space-x-2 shrink-0">
                    <MiniAppLogo {...sourceVisual} alt={order.fromAsset} size="medium" className="z-10" />
                    <MiniAppLogo {...targetVisual} alt={order.toAsset} size="medium" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="text-[10px] text-muted-foreground font-mono mb-0.5">#{order.id.slice(0, 8)}</div>
                    <div className="font-bold text-[15px] flex items-center truncate">
                      <span className="text-[12px] text-muted-foreground mr-1">Send</span>
                      <span className="truncate">{order.amount} {order.fromAsset}</span>
                    </div>
                    <div className="font-bold text-[15px] flex items-center truncate text-primary mt-0.5">
                      <span className="text-[12px] text-muted-foreground mr-1">Receive</span>
                      <span className="truncate">{order.toAsset}</span>
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-1 flex items-center gap-1.5">
                      <span>{format(new Date(order.createdAt), 'MMM d, yyyy')}</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>{format(new Date(order.createdAt), 'HH:mm')}</span>
                    </div>
                  </div>
                </div>
                <div className={cn(
                  "text-[10px] px-2.5 py-1 rounded-full font-bold tracking-widest uppercase shrink-0 shadow-sm ml-3",
                  order.status === 'completed' || order.status === 'paid' ? "bg-primary/10 text-primary border border-primary/20" :
                  order.status === 'failed' || order.status === 'cancelled' || order.status === 'expired' ? "bg-destructive/10 text-destructive border border-destructive/20" :
                  "bg-secondary/10 text-secondary border border-secondary/20"
                )}>
                  {order.status}
                </div>
              </div>
            </Link>
          )})}
        </div>
      ) : (
        <div className="premium-card p-10 flex flex-col items-center justify-center text-center space-y-4 surface-animated mt-4">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
            {searchQuery ? (
              <Filter className="w-7 h-7 text-muted-foreground/50" />
            ) : (
              <Search className="w-7 h-7 text-muted-foreground/50" />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-[16px]">
              {searchQuery ? 'No matching orders' : 'No orders yet'}
            </h3>
            <p className="text-muted-foreground text-[13px] max-w-[200px] leading-relaxed">
              {searchQuery ? `We couldn't find any orders matching "${searchQuery}".` : "You haven't made any exchanges yet. Start one now!"}
            </p>
          </div>
          {!searchQuery && (
            <Link href="/exchange" onClick={() => haptic.selection()} className="mt-2">
              <div className="bg-primary text-primary-foreground text-[13px] font-bold px-4 py-2 rounded-xl shadow-md">
                Start an Exchange
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}