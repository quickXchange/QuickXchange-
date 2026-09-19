import { Link, useLocation } from 'wouter';
import { Home, ArrowLeftRight, ListOrdered, LifeBuoy, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';

export function BottomNav() {
  const [location] = useLocation();
  const haptic = useHapticFeedback();
  const { sessionToken, isLoading } = useAuth();

  const navItems = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/exchange?mode=swap', activeMatch: '/exchange', icon: ArrowLeftRight, label: 'Exchange' },
    { href: '/orders', activeMatch: '/orders', icon: ListOrdered, label: 'Orders' },
    { href: '/support', activeMatch: '/support', icon: LifeBuoy, label: 'Support' },
    { href: '/account', activeMatch: '/account', icon: User, label: 'Account' },
  ];

  // Hide nav on order details
  if (isLoading || !sessionToken || (location.startsWith('/orders/') && location !== '/orders')) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass-nav pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-2 py-1.5 max-w-md mx-auto relative">
        {navItems.map((item) => {
          const isActive = item.activeMatch ? location.startsWith(item.activeMatch) : location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic.selection()}
              className={cn(
                "group relative flex flex-col items-center justify-center w-[60px] h-12 rounded-xl transition-all duration-300",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 bg-primary/10 rounded-xl blur-sm" />
              )}
              <div className="relative flex flex-col items-center gap-1 z-10">
                <Icon className={cn("w-[22px] h-[22px] transition-all duration-300", isActive && "scale-110 stroke-[2.5px] drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]")} />
                <span className={cn("text-[10px] font-semibold tracking-wide transition-all duration-300 opacity-0 h-0 group-hover:opacity-100 group-hover:h-auto", isActive && "opacity-100 h-auto")}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { sessionToken, isLoading } = useAuth();
  const showBottomNavigation = !isLoading && Boolean(sessionToken);

  return (
    <div className={cn(
      "premium-glow-bg text-foreground min-h-[100dvh] flex flex-col",
      showBottomNavigation && "pb-[calc(60px+env(safe-area-inset-bottom))]",
    )}>
      {children}
      <BottomNav />
    </div>
  );
}