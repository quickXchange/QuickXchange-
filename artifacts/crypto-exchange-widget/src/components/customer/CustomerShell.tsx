import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'wouter';
import { useUser, useClerk } from '@clerk/react';
import {
  Menu, X, LayoutDashboard, History, Settings, LogOut,
  ChevronDown, ExternalLink, Network, ArrowRightLeft, Sun, Moon, UserRound, ShieldCheck, WalletCards
} from 'lucide-react';
import { getGetOperatorsQueryKey, useGetOperators } from '@workspace/api-client-react';
import { cn, basePath } from '@/components/shared-app-ui';
import { LanguageSelector } from '@/components/language-selector';
import { useI18n } from '@/i18n';
import { setAppTheme, useAppTheme } from '@/theme';
import { BrandLogo } from '@/components/brand-logo';

function useCustomerTheme() {
  const isDark = useAppTheme();

  const setTheme = (nextIsDark: boolean) => {
    setAppTheme(nextIsDark);
  };

  return { isDark, setTheme };
}

export function ThemeToggle({ testIdPrefix = 'customer' }: { testIdPrefix?: string }) {
  const { isDark, setTheme } = useCustomerTheme();
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full border border-border">
      <button
        type="button"
        className={cn("px-3 py-1.5 text-xs font-semibold rounded-full transition-all", !isDark ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        onClick={() => setTheme(false)}
        aria-pressed={!isDark}
        data-testid={`button-${testIdPrefix}-theme-light`}
      >
        {t('adminShell.light')}
      </button>
      <button
        type="button"
        className={cn("px-3 py-1.5 text-xs font-semibold rounded-full transition-all", isDark ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        onClick={() => setTheme(true)}
        aria-pressed={isDark}
        data-testid={`button-${testIdPrefix}-theme-dark`}
      >
        {t('adminShell.dark')}
      </button>
    </div>
  );
}

function CustomerThemeButton() {
  const { isDark, setTheme } = useCustomerTheme();
  const { t } = useI18n();
  const label = isDark ? t('adminShell.light') : t('adminShell.dark');

  return (
    <button
      type="button"
      className="grid size-10 shrink-0 place-items-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
      onClick={() => setTheme(!isDark)}
      aria-label={label}
      title={label}
      data-testid="button-customer-theme"
    >
      {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}

function CustomerBrandLogo({
  onNavigate,
  forceDark = false,
}: {
  onNavigate?: () => void;
  forceDark?: boolean;
}) {
  return (
    <BrandLogo
      forceDark={forceDark}
      onNavigate={onNavigate}
      testId="link-customer-brand"
      className="inline-flex min-h-11 min-w-0 items-center !p-0 !bg-transparent !border-0"
      imgClassName="h-auto w-[132px] max-w-full object-contain"
    />
  );
}

function ProfileDropdown({ hideAppearance = false }: { hideAppearance?: boolean }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsidePress = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', closeOnOutsidePress);
      document.addEventListener('keydown', closeOnEscape);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = user?.fullName || user?.firstName || email;
  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map(part => part?.slice(0, 1))
    .join('')
    .toUpperCase() || email.slice(0, 2).toUpperCase() || 'U';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-h-10 items-center gap-1 rounded-full border border-transparent p-1 transition-colors hover:border-border hover:bg-muted/50"
        aria-label={t('customerPortal.profile')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-testid="button-profile-menu"
      >
        {user?.imageUrl ? (
          <img className="size-8 shrink-0 rounded-full border border-primary/20 object-cover" src={user.imageUrl} alt="" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-sm font-bold text-primary">
            {initials}
          </span>
        )}
        <ChevronDown size={14} className="mr-1 text-muted-foreground" aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg animate-in fade-in slide-in-from-top-2 duration-200" role="menu">
          <div className="p-4 border-b border-border/50 bg-muted/20">
            <div className="mb-1 truncate text-sm font-semibold">{displayName}</div>
            <div className="text-xs text-muted-foreground truncate" data-testid="text-user-email">{email}</div>
          </div>
          <div className="p-2">
            <Link
              href="/account/settings"
              className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              data-testid="link-profile-account"
            >
              <UserRound size={16} aria-hidden="true" />
              {t('customerPortal.account')}
            </Link>
            {!hideAppearance && (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-1">
                  {t('header.appearance')}
                </div>
                <div className="px-2 mb-2">
                  <ThemeToggle testIdPrefix="profile" />
                </div>
              </>
            )}
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2 mt-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left"
              onClick={() => { setIsOpen(false); signOut({ redirectUrl: basePath || '/' }); }}
              role="menuitem"
              data-testid="button-sign-out"
            >
              <LogOut size={16} />
              <span className="font-semibold">{t('auth.signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerSidebar({
  mobileOpen,
  setMobileOpen,
}: {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const [location] = useLocation();
  const { t } = useI18n();
  const ownerAccess = useGetOperators({
    query: {
      queryKey: getGetOperatorsQueryKey(),
      retry: false,
      staleTime: 30_000,
    },
  });
  
  const navItems = [
    { href: '/account', icon: LayoutDashboard, label: t('customerPortal.dashboard'), exact: true },
    { href: '/account/deposits', icon: WalletCards, label: 'Deposits', exact: true },
    { href: '/account/orders', icon: History, label: t('customerPortal.myOrders'), exact: false },
    { href: '/', icon: ArrowRightLeft, label: t('customerPortal.newExchange'), exact: true },
    { href: '/account/affiliate', icon: Network, label: t('customerPortal.affiliates'), exact: false },
    { href: '/account/settings', icon: Settings, label: t('customerPortal.account'), exact: true },
    ...(ownerAccess.isSuccess
      ? [{ href: '/admin', icon: ShieldCheck, label: 'Admin Panel', exact: false, ownerAdmin: true }]
      : []),
  ];

  const content = (
    <div className="customer-sidebar-surface flex h-full flex-col border-r border-border bg-card text-foreground">
      <div className="p-5 flex items-center justify-between border-b border-border/50">
        <CustomerBrandLogo onNavigate={() => setMobileOpen(false)} />
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label={t('customerPortal.closeMenu')}
          data-testid="button-customer-menu-close"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        <div className="mt-auto">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 px-3">
            {t('customerPortal.customerNav')}
          </div>
          <nav className="flex flex-col gap-1" aria-label={t('customerPortal.customerNav')}>
            {navItems.map(item => {
              const active = item.exact ? location === item.href : location.startsWith(item.href) && item.href !== '/account';
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "customer-sidebar-link flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold transition-all",
                    item.ownerAdmin && "customer-owner-admin-link",
                    active
                      ? "customer-sidebar-link-active bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={item.ownerAdmin ? 'nav-owner-admin' : `nav-${item.href.replace(/\//g, '-')}`}
                >
                  <item.icon size={18} className={cn(active ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 px-3">
            {t('customerPortal.quickActions')}
          </div>
          <nav className="flex flex-col gap-1">
            <Link href="/status" onClick={() => setMobileOpen(false)} className="customer-sidebar-link group flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:bg-muted hover:text-foreground" data-testid="nav-quick-track">
              <ExternalLink size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
              {t('customerPortal.trackOrder')}
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] md:block" aria-label={t('customerPortal.customerNav')}>
        {content}
      </aside>

      {mobileOpen && createPortal(
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button 
            className="absolute inset-0 bg-background/82"
            onClick={() => setMobileOpen(false)} 
            aria-label={t('customerPortal.closeMenu')}
          />
           <div className="relative h-full w-[280px] max-w-[86vw] shadow-lg" role="dialog" aria-modal="true" aria-label={t('customerPortal.customerNav')} data-customer-drawer>
            <div className="h-full" role="navigation" aria-label={t('customerPortal.mobileNav')}>
              {content}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function CustomerShell({
  children,
  contentClassName,
}: {
  children: React.ReactNode;
  contentClassName?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { t } = useI18n();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasMobileOpen = useRef(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
      if (e.key !== 'Tab') return;
      const drawer = document.querySelector<HTMLElement>('[data-customer-drawer]');
      const focusable = drawer
        ? Array.from(drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ))
        : [];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileOpen) {
      document.querySelector<HTMLElement>('[data-customer-drawer] button')?.focus();
    } else if (wasMobileOpen.current) {
      menuButtonRef.current?.focus();
    }
    wasMobileOpen.current = mobileOpen;
  }, [mobileOpen]);

  return (
    <div className="customer-shell flex min-h-[100dvh] flex-col bg-background font-sans text-foreground md:flex-row">
      <CustomerSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      
      <div className="flex-1 flex flex-col min-w-0 md:ml-[260px]">
        <header className="customer-header sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b px-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button 
              ref={menuButtonRef}
              type="button" 
              className="md:hidden w-11 h-11 -ml-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label={t('customerPortal.openMenu')}
              data-testid="button-mobile-menu"
            >
              <Menu size={22} aria-hidden="true" />
            </button>
            <div className="w-[104px] md:hidden min-[390px]:w-[124px]">
              <CustomerBrandLogo />
            </div>
          </div>
          
          <div className="flex items-center gap-0.5 sm:gap-2">
            <LanguageSelector compact={true} />
            <CustomerThemeButton />
            <ProfileDropdown />
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-x-hidden rise-in">
          <div className={`${contentClassName ?? 'max-w-6xl'} mx-auto w-full`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function CustomerPageHeader({ title, description, actions }: { title: React.ReactNode, description?: React.ReactNode, actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div className="min-w-0">
        <h1 className="customer-page-title mb-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
