import { Link } from 'wouter';
import { useAuth } from '@/lib/auth';
import { ArrowLeftRight, CreditCard, LifeBuoy, History, Search } from 'lucide-react';
import { useListTelegramMiniAppOrders, getListTelegramMiniAppOrdersQueryKey } from '@workspace/api-client-react';
import { useAuthHeaders } from '@/lib/auth';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useHapticFeedback } from '@/lib/hooks';

export default function Home() {
  const { user, isMock } = useAuth();
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
    <div className="flex flex-col p-4 space-y-6">
      <header className="flex items-center justify-between pt-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Hi, {user?.displayName || 'Guest'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Welcome to QuickXchange
          </p>
        </div>
      </header>

      {isMock && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-primary font-medium">
          Preview Mode: Running outside Telegram. Data is mocked and orders will not be processed.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/exchange?mode=swap" onClick={() => haptic.selection()}>
          <div className="premium-card p-4 flex flex-col items-center justify-center space-y-2 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <span className="font-semibold text-sm">Crypto Swap</span>
          </div>
        </Link>
        <Link href="/exchange?mode=convert" onClick={() => haptic.selection()}>
          <div className="premium-card p-4 flex flex-col items-center justify-center space-y-2 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
              <CreditCard className="w-5 h-5" />
            </div>
            <span className="font-semibold text-sm">Buy / Sell</span>
          </div>
        </Link>
      </div>

      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent Orders</h2>
          <Link href="/orders" className="text-xs font-medium text-primary active:opacity-70">
            View All
          </Link>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            Array(2).fill(0).map((_, i) => (
              <div key={i} className="premium-card p-4 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-1/3 mb-2" />
                <div className="h-3 bg-white/5 rounded w-1/4" />
              </div>
            ))
          ) : ordersData && ordersData.length > 0 ? (
            ordersData.slice(0, 3).map((order: any) => (
              <Link key={order.id} href={`/orders/${order.id}`} onClick={() => haptic.selection()}>
                <div className="premium-card p-4 flex items-center justify-between active:bg-white/5 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">
                        {order.amount} {order.fromAsset} &rarr; {order.toAsset}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(order.createdAt), 'MMM d, yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "text-xs px-2 py-1 rounded-md font-semibold",
                    order.status === 'completed' ? "bg-green-500/10 text-green-500" :
                    order.status === 'failed' || order.status === 'cancelled' ? "bg-red-500/10 text-red-500" :
                    "bg-yellow-500/10 text-yellow-500"
                  )}>
                    {order.status.toUpperCase()}
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="premium-card p-8 flex flex-col items-center justify-center text-center space-y-2">
              <Search className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No recent orders found</p>
              <Link href="/exchange">
                <Button size="sm" variant="secondary" className="mt-2 rounded-xl">
                  Start an Exchange
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      <Link href="/support" onClick={() => haptic.selection()}>
        <div className="premium-card bg-gradient-to-r from-primary/10 to-transparent p-4 flex items-center space-x-3 active:scale-[0.98] transition-transform">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Need Help?</h3>
            <p className="text-xs text-muted-foreground">Contact 24/7 Support</p>
          </div>
        </div>
      </Link>
    </div>
  );
}
