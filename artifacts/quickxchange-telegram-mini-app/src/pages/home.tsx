import { Link } from 'wouter';
import { useAuth, useAuthHeaders } from '@/lib/auth';
import { ArrowLeftRight, CreditCard, Search, ArrowRight } from 'lucide-react';
import {
  useListTelegramMiniAppOrders, getListTelegramMiniAppOrdersQueryKey,
  useGetExchangeConfig, getGetExchangeConfigQueryKey,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useHapticFeedback } from '@/lib/hooks';
import { MiniAppBrandLogo, MiniAppLogo } from '@/components/mini-app-logo';
import { resolveOrderVisual } from '@/lib/logo-catalog';
import { swapOrderStatusLabel, swapOrderStatusTerminal } from '@/lib/swap-order-status';
import { convertOrderStatusLabel, isConvertTerminalStatus } from '@/lib/convert-order-status';

export default function Home() {
  const { user } = useAuth();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const { data: exchangeConfig } = useGetExchangeConfig({
    query: { queryKey: getGetExchangeConfigQueryKey(), staleTime: 60_000 },
  });

  const { data: ordersData, isLoading } = useListTelegramMiniAppOrders({
    query: {
      queryKey: getListTelegramMiniAppOrdersQueryKey(),
      enabled: Boolean(headers.Authorization),
      refetchOnWindowFocus: 'always',
      refetchIntervalInBackground: true,
      refetchInterval: (query) => {
        const orders = query.state.data || [];
        const hasActive = orders.some((o: any) => o.orderKind === 'convert'
          ? !isConvertTerminalStatus(o.status)
          : !swapOrderStatusTerminal(o.status));
        return hasActive ? 3000 : false;
      },
    },
    request: { headers }
  });

  return (
    <div className="flex flex-col p-4 space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="flex items-center justify-between pt-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center min-h-7 mb-1">
            <MiniAppBrandLogo />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Hi, {user?.firstName || user?.displayName || 'User'}
          </h1>
          <p className="text-sm font-medium text-muted-foreground">
            Welcome to QuickXchange
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/exchange?mode=swap" onClick={() => haptic.selection()}>
          <div className="premium-card surface-animated p-4 flex flex-col items-center justify-center space-y-3 cursor-pointer group">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors duration-300 relative">
              <div className="absolute inset-0 bg-primary/20 blur-md rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <ArrowLeftRight className="w-6 h-6 relative z-10" />
            </div>
            <span className="font-bold tracking-wide text-sm">Swap</span>
          </div>
        </Link>
        <Link href="/exchange?mode=convert" onClick={() => haptic.selection()}>
          <div className="premium-card p-4 flex flex-col items-center justify-center space-y-3 cursor-pointer group hover:bg-white/5 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary group-hover:bg-secondary/20 transition-colors duration-300 relative">
              <div className="absolute inset-0 bg-secondary/20 blur-md rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CreditCard className="w-6 h-6 relative z-10" />
            </div>
            <span className="font-bold tracking-wide text-sm">Convert</span>
          </div>
        </Link>
      </div>

      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[17px] font-bold tracking-tight">Recent Orders</h2>
          <Link href="/orders" onClick={() => haptic.selection()} className="text-[13px] font-semibold text-primary active:opacity-70 flex items-center gap-1">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            Array(2).fill(0).map((_, i) => (
              <div key={i} className="premium-card p-4 flex justify-between items-center opacity-70">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  </div>
                </div>
                <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
              </div>
            ))
          ) : ordersData && ordersData.length > 0 ? (
            ordersData.slice(0, 3).map((order: any) => {
              const sourceVisual = resolveOrderVisual(exchangeConfig?.settlementOptions, order, 'source');
              const targetVisual = resolveOrderVisual(exchangeConfig?.settlementOptions, order, 'target');
              return <Link key={order.id} href={`/orders/${order.id}`} onClick={() => haptic.selection()}>
                <div className="premium-card p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors group">
                  <div className="flex items-center space-x-3 min-w-0">
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
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "text-[10px] px-2.5 py-1 rounded-full font-bold tracking-widest uppercase shrink-0 shadow-sm ml-3",
                    order.status === 'completed' || order.status === 'paid' ? "bg-primary/10 text-primary border border-primary/20" :
                    order.status === 'failed' || order.status === 'cancelled' || order.status === 'expired' ? "bg-destructive/10 text-destructive border border-destructive/20" :
                    "bg-secondary/10 text-secondary border border-secondary/20"
                  )}>
                     {order.orderKind === 'convert' ? convertOrderStatusLabel(order.status) : swapOrderStatusLabel(order.status)}
                  </div>
                </div>
              </Link>;
            })
          ) : (
            <div className="premium-card p-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/50 mb-1">
                <Search className="w-5 h-5" />
              </div>
              <p className="text-[14px] font-medium text-muted-foreground">No recent orders yet</p>
              <Link href="/exchange" onClick={() => haptic.selection()}>
                <Button className="rounded-xl mt-2 font-bold px-6 bg-primary text-primary-foreground">
                  Start an Exchange
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}