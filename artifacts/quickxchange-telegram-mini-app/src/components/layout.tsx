import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { Link, useLocation } from 'wouter';
import { Home, ArrowLeftRight, ListOrdered, LifeBuoy, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';

export function BottomNav() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const [location] = useLocation();
  const haptic = useHapticFeedback();
  const { sessionToken, isLoading } = useAuth();

  const navItems = [
    { href: '/', icon: Home, label: uiT("customer.m3a78695388b3") },
    { href: '/exchange?mode=swap', activeMatch: '/exchange', icon: ArrowLeftRight, label: uiT("customer.md60a318dd8a0") },
    { href: '/orders', activeMatch: '/orders', icon: ListOrdered, label: uiT("customer.mb7e8acdd522e") },
    { href: '/support', activeMatch: '/support', icon: LifeBuoy, label: uiT("customer.mbe91940b79f4") },
    { href: '/account', activeMatch: '/account', icon: User, label: uiT("customer.m7e1b0d5641f2") },
  ];

  // Hide nav on order details
  if (isLoading || !sessionToken || (location.startsWith('/orders/') && location !== '/orders')) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass-nav pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="flex items-center justify-around px-2 py-1.5 max-w-md mx-auto relative">
        {uiText(navItems.map((item) => {
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
                <Icon className={cn("w-[22px] h-[22px] transition-all duration-300", isActive && "scale-110 stroke-[2.5px] drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]")} />
                <span className={cn("text-[10px] font-semibold tracking-wide transition-all duration-300 opacity-0 h-0 group-hover:opacity-100 group-hover:h-auto", isActive && "opacity-100 h-auto")}>
                  {uiText(item.label)}
                </span>
              </div>
            </Link>
          );
        }))}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const { locale, availableLocales, setLocale, t, isLoading: languageLoading } = useCustomerI18n();
  const { sessionToken, isLoading } = useAuth();
  const showBottomNavigation = !isLoading && Boolean(sessionToken);

  return (
    <div className={cn(
      "premium-glow-bg text-foreground min-h-[100dvh] flex flex-col",
      showBottomNavigation && "pb-[calc(64px+env(safe-area-inset-bottom))]",
    )}>
      <div className="flex justify-end px-4 pt-3">
        <select
          aria-label={t('language.title')}
          data-testid="mini-app-language-selector"
          value={locale}
          disabled={languageLoading}
          onChange={event => void setLocale(event.target.value as typeof locale)}
          className="max-w-40 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          {uiText(availableLocales.map(language => <option key={language.code} value={language.code}>{uiText(language.nativeName)}</option>))}
        </select>
      </div>
      {uiText(children)}
      <BottomNav />
    </div>
  );
}