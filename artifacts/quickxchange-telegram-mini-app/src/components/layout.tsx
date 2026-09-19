import { Link, useLocation } from 'wouter';
import { Home, ArrowLeftRight, ListOrdered, LifeBuoy, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/lib/hooks';

export function BottomNav() {
  const [location] = useLocation();
  const haptic = useHapticFeedback();

  const navItems = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/exchange', icon: ArrowLeftRight, label: 'Exchange' },
    { href: '/orders', icon: ListOrdered, label: 'Orders' },
    { href: '/support', icon: LifeBuoy, label: 'Support' },
    { href: '/account', icon: User, label: 'Account' },
  ];

  // Hide nav on order details
  if (location.startsWith('/orders/') && location !== '/orders') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-xl border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic.selection()}
              className={cn(
                "flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full mb-1 transition-all",
                isActive && "bg-primary/15"
              )}>
                <Icon className={cn("w-5 h-5", isActive && "stroke-primary/20 stroke-2")} />
              </div>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="premium-glow-bg text-foreground min-h-[100dvh] flex flex-col pb-[calc(60px+env(safe-area-inset-bottom))]">
      {children}
      <BottomNav />
    </div>
  );
}
