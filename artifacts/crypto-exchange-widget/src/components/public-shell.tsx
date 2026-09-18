import { useEffect, useRef, useState, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useUser } from '@clerk/react';
import { ArrowRight, ChevronDown, CircleUserRound, Gauge, Globe2, Handshake, House, Menu, Moon, Search, ShieldCheck, Sun, X, Link2, Pause, Play, Mail, Clock3 } from 'lucide-react';
import { SiTelegram } from 'react-icons/si';
import { Link, useLocation } from 'wouter';
import { useGetOperators, getGetOperatorsQueryKey, useGetPublishedSiteContent, getGetPublishedSiteContentQueryKey } from '@workspace/api-client-react';
import type { PartnerLogo, SiteNavLink, SocialTrustConfig, SocialTrustItem } from '@workspace/api-client-react';
import { LanguageSelector } from '@/components/language-selector';
import { useI18n } from '@/i18n';
import { PUBLIC_PAGE_REGISTRY } from '../lib/public-page-registry';
import { basePath, cn, SUPPORT_TELEGRAM, SUPPORT_EMAIL, SUPPORT_HOURS } from '@/components/shared-app-ui';
import { SideDrawer } from '@/components/side-drawer';
import { setAppTheme, useAppTheme } from '@/theme';
import { useSitePreview } from './site-preview-context';
import { BrandLogo } from '@/components/brand-logo';
import { DesktopMegaMenu, NAVIGATION_DATA } from '@/components/mega-menu';
import type { NavGroup } from '@/components/mega-menu';

const COMPANY_FOOTER_LINKS = [
  ['Home', '/'],
  ['About Us', '/about'],
  ['How It Works', '/how-it-works'],
  ['Affiliate Program', '/affiliates'],
] as const;

const INFORMATION_FOOTER_LINKS = [
  ['User Agreement', '/terms'],
  ['AML / KYC Policy', '/aml-kyc'],
  ['FAQ', '/faq'],
  ['Contacts', '/contact'],
  ['Privacy Policy', '/privacy'],
] as const;

const EXCHANGE_FOOTER_LINKS = [
  ['Swap', '/swap'],
  ['Convert', '/convert'],
  ['Track Order', '/status'],
  ['Exchange Rates', '/market-rates'],
  ['Supported Assets', '/crypto-pairs'],
] as const;

const normalizeFooterLabel = (label: string) => label.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

function ThemeToggle({ testIdPrefix = '' }: { testIdPrefix?: string } = {}) {
  const isDark = useAppTheme();
  const { t } = useI18n();
  const testId = (mode: 'light' | 'dark') => `button-${testIdPrefix ? `${testIdPrefix}-` : ''}theme-${mode}`;

  const toggleTheme = (nextIsDark: boolean) => {
    setAppTheme(nextIsDark);
  };

  return (
    <div className="theme-toggle-group" role="group" aria-label={t('header.appearance')}>
      <button
        type="button"
        className={cn("theme-toggle-btn", !isDark && "active")}
        onClick={() => toggleTheme(false)}
        aria-pressed={!isDark}
        data-testid={testId('light')}
      >
        <Sun size={14} /> <span>{t('adminShell.light')}</span>
      </button>
      <button
        type="button"
        className={cn("theme-toggle-btn", isDark && "active")}
        onClick={() => toggleTheme(true)}
        aria-pressed={isDark}
        data-testid={testId('dark')}
      >
        <Moon size={14} /> <span>{t('adminShell.dark')}</span>
      </button>
    </div>
  );
}

function publishedPartnerLogoUrl(objectPath: string) {
  const id = objectPath.split('/').pop();
  return id ? `${basePath}/api/storage/objects/partner-logos/${id}` : '';
}

function PartnerLogoSlider({ logos }: { logos: PartnerLogo[] }) {
  const preview = useSitePreview();
  const logoUrl = (logo: PartnerLogo) => preview.assetUrls?.[logo.objectPath]
    ?? (preview.active
      ? `${basePath}/api/admin/partner-logos/${logo.id}/preview`
      : publishedPartnerLogoUrl(logo.objectPath));
  const [manualPaused, setManualPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const paused = manualPaused || interactionPaused || reducedMotion;
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  if (!logos.length) return null;
  const slides = logos.map((logo) => (
    <li key={logo.id} className="partner-slide" data-testid={`public-partner-logo-${logo.id}`}>
      {logo.link ? <a href={logo.link} target="_blank" rel="noreferrer" aria-label={logo.name}><img src={logoUrl(logo)} alt={logo.name} loading="lazy" /></a> : <img src={logoUrl(logo)} alt={logo.name} loading="lazy" />}
    </li>
  ));
  return (
    <section className="partner-slider mx-auto w-full max-w-7xl px-6 py-12 md:px-8" aria-labelledby="public-partner-slider-title">
      <div className="mb-6 flex items-center justify-center gap-3">
        <h2 id="public-partner-slider-title" className="text-center text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Trusted partners</h2>
        <button
          type="button"
          className="button button-secondary h-8 px-2 text-xs"
          onClick={() => setManualPaused((value) => !value)}
          aria-label={paused ? 'Play partner logo slider' : 'Pause partner logo slider'}
          aria-pressed={paused}
          data-testid="button-partner-slider-toggle"
        >
          {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
          <span className="sr-only">{paused ? 'Play' : 'Pause'} partner logo slider</span>
        </button>
      </div>
      <div className={cn('partner-slider-viewport', paused && 'is-paused')} onMouseEnter={() => setInteractionPaused(true)} onMouseLeave={() => setInteractionPaused(false)} onFocus={() => setInteractionPaused(true)} onBlur={() => setInteractionPaused(false)} data-testid="partner-slider">
        <ul className="partner-slider-track" aria-live="polite">{slides}{logos.map((logo) => <li key={`duplicate-${logo.id}`} className="partner-slide" aria-hidden="true"><img src={logoUrl(logo)} alt="" /></li>)}</ul>
      </div>
    </section>
  );
}

function ConfiguredLink({ link, placement }: { link: SiteNavLink; placement: 'header' | 'footer' }) {
  const className = cn("hover:text-primary transition-colors", placement === 'footer' && "public-footer-link");
  const testId = `link-published-${placement}-${link.id}`;
  return /^https?:\/\//i.test(link.href)
    ? <a href={link.href} target="_blank" rel="noreferrer" className={className} data-testid={testId}>{link.label}</a>
    : <Link href={link.href} className={className} data-testid={testId}>{link.label}</Link>;
}

function ConfiguredLinks({ links, placement }: { links: SiteNavLink[]; placement: 'header' | 'footer' }) {
  return <>{links.filter((link) => (placement === 'header' ? link.header : link.footer)).map((link) => (
    <ConfiguredLink key={link.id} link={link} placement={placement} />
  ))}</>;
}

type RenderableSocialItem = Pick<SocialTrustItem, 'id' | 'name' | 'href'> & {
  objectPath?: string | null;
  defaultAssetPath?: string | null;
};

const LEGACY_SOCIAL_FIELDS = [
  ['instagramUrl', 'Instagram'],
  ['xUrl', 'X'],
  ['facebookUrl', 'Facebook'],
] as const;

function initialsForSocialName(name: string) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');
  return (initials || '?').toUpperCase();
}

function footerSocialAppearance(socialTrust?: SocialTrustConfig): CSSProperties {
  const appearance = (socialTrust as (SocialTrustConfig & { appearance?: Record<string, unknown> }) | undefined)?.appearance;
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = typeof appearance?.[key] === 'number' ? appearance[key] as number : fallback;
    return Math.min(max, Math.max(min, value));
  };
  const color = (key: string, fallback: string) => {
    const value = appearance?.[key];
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  };
  const radius = appearance?.radiusMode === 'square' ? '0' : appearance?.radiusMode === 'rounded' ? '0.55rem' : '999px';
  return {
    '--qx-social-icon-size': `${number('iconSize', 16, 8, 48)}px`,
    '--qx-social-logo-size': `${number('logoSize', 72, 20, 100)}%`,
    '--qx-social-circle-size': `${number('circleSize', 36, 24, 80)}px`,
    '--qx-social-border-width': `${number('borderThickness', 1, 0, 8)}px`,
    '--qx-social-radius': radius,
    '--qx-social-background': color('backgroundColor', 'hsl(var(--background) / 0.52)'),
    '--qx-social-border': color('borderColor', 'hsl(var(--border) / 0.65)'),
    '--qx-social-glow': color('glowColor', 'hsl(var(--primary))'),
    '--qx-social-glow-intensity': `${number('glowIntensity', 0, 0, 100) / 100}`,
    '--qx-social-opacity': `${number('iconOpacity', 100, 0, 100) / 100}`,
  } as CSSProperties;
}

function FooterSocialIcon({ item, preview }: { item: RenderableSocialItem; preview: ReturnType<typeof useSitePreview> }) {
  const objectPath = item.objectPath || '';
  const src = objectPath
    ? preview.assetUrls?.[objectPath]
      ?? (preview.active
        ? `${basePath}/api/admin/social-trust/items/${item.id}/preview`
        : `${basePath}/api/storage/objects/social-trust-icons/${objectPath.split('/').pop()}`)
    : item.defaultAssetPath || null;
  return src
    ? <img src={src} alt="" className="qx-footer-social-image" loading="lazy" />
    : <span className="qx-footer-social-initials" aria-hidden="true">{initialsForSocialName(item.name)}</span>;
}

function FooterSocialLinksDataDriven({ socialTrust, socialItems, trustItems, preview }: {
  socialTrust?: SocialTrustConfig;
  socialItems: SocialTrustItem[];
  trustItems: SocialTrustItem[];
  preview: ReturnType<typeof useSitePreview>;
}) {
  const legacyItems: RenderableSocialItem[] = LEGACY_SOCIAL_FIELDS.flatMap(([field, name]) => {
    const href = socialTrust?.[field];
    if (!href || socialItems.some((item) => item.href === href)) return [];
    return [{ id: `legacy-${field}`, name, href, objectPath: null }];
  });
  const allSocialItems: RenderableSocialItem[] = [...socialItems, ...legacyItems];
  const appearanceStyle = footerSocialAppearance(socialTrust);
  return (
    <div className="flex flex-col gap-4" aria-label="Social connections">
      <div className="flex flex-wrap items-center gap-2">
        {allSocialItems.map((item) => (
          <a key={item.id} href={item.href} target="_blank" rel="noreferrer noopener" aria-label={item.name} data-testid={`link-published-social-${item.id}`} className="qx-footer-social-link" style={appearanceStyle}>
            <FooterSocialIcon item={item} preview={preview} />
          </a>
        ))}
      </div>
      {trustItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {trustItems.map((item) => (
            <a key={item.id} href={item.href} target="_blank" rel="noreferrer noopener" data-testid={`link-published-trust-${item.id}`} className="group flex items-center gap-2 hover:text-primary transition-colors">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/40 border border-border/50 group-hover:border-border transition-colors">
                <FooterSocialIcon item={item} preview={preview} />
              </span>
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{item.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function pageNavigationLinks(pages: Array<{ pageKey: string; content: Record<string, unknown> }> = []): SiteNavLink[] {
  return PUBLIC_PAGE_REGISTRY.flatMap((definition) => {
    const content = pages.find((page) => page.pageKey === definition.key)?.content ?? {};
    const visibility = content.visibility && typeof content.visibility === 'object'
      ? content.visibility as Record<string, unknown>
      : {};
    if (visibility.enabled === false) return [];
    const navigation = content.navigation && typeof content.navigation === 'object'
      ? content.navigation as Record<string, unknown>
      : {};
    const header = navigation.header && typeof navigation.header === 'object'
      ? navigation.header as Record<string, unknown>
      : {};
    const footer = navigation.footer && typeof navigation.footer === 'object'
      ? navigation.footer as Record<string, unknown>
      : {};
    const inHeader = typeof header.enabled === 'boolean' ? header.enabled : Boolean('defaultHeader' in definition && definition.defaultHeader);
    const inFooter = typeof footer.enabled === 'boolean' ? footer.enabled : Boolean('defaultFooter' in definition && definition.defaultFooter);
    if (!inHeader && !inFooter) return [];
    return [{
      id: `page-${definition.key}`,
      label: typeof navigation.label === 'string' && navigation.label.trim() ? navigation.label.trim() : definition.label,
      href: definition.path,
      enabled: true,
      header: inHeader,
      footer: inFooter,
      widget: false,
    }];
  });
}

function automaticNavigationOrder(left: Pick<SiteNavLink, 'label' | 'href' | 'id' | 'enabled'>, right: Pick<SiteNavLink, 'label' | 'href' | 'id' | 'enabled'>) {
  return Number(right.enabled) - Number(left.enabled)
    || left.label.localeCompare(right.label)
    || left.href.localeCompare(right.href)
    || left.id.localeCompare(right.id);
}

function automaticNameOrder(left: { name: string; href?: string; id: string; enabled?: boolean }, right: { name: string; href?: string; id: string; enabled?: boolean }) {
  return Number(Boolean(right.enabled)) - Number(Boolean(left.enabled))
    || left.name.localeCompare(right.name)
    || (left.href ?? '').localeCompare(right.href ?? '')
    || left.id.localeCompare(right.id);
}

function hiddenManagedPageHrefs(pages: Array<{ pageKey: string; content: Record<string, unknown> }> = []): Set<string> {
  return new Set(PUBLIC_PAGE_REGISTRY.flatMap((definition) => {
    const content = pages.find((page) => page.pageKey === definition.key)?.content;
    if (!content?.visibility || typeof content.visibility !== 'object') return [];
    return (content.visibility as Record<string, unknown>).enabled === false ? [definition.path] : [];
  }));
}

function ConfiguredMobileLink({ link, active, onClick }: { link: SiteNavLink; active: boolean; onClick: () => void }) {
  const className = cn('qx-menu-row', active && 'active');
  const content = <><div className="qx-menu-icon"><Link2 size={20} /></div><span className="qx-menu-row-label">{link.label}</span></>;
  return /^https?:\/\//i.test(link.href)
    ? <a href={link.href} target="_blank" rel="noreferrer" className={className} onClick={onClick} data-testid={`link-published-mobile-${link.id}`}>{content}</a>
    : <Link href={link.href} className={className} onClick={onClick} data-testid={`link-published-mobile-${link.id}`}>{content}</Link>;
}

type PublicMenuItem = {
  href: string;
  label: string;
  icon: typeof House;
  testId: string;
  special?: boolean;
};

function PublicMenuLink({ item, active, onClick }: { item: PublicMenuItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn('qx-menu-row', active && 'active', item.special && 'owner-access')}
      onClick={onClick}
      data-testid={item.testId}
    >
      <div className="qx-menu-icon"><Icon size={20} /></div>
      <span className="qx-menu-row-label">{item.label}</span>
    </Link>
  );
}

function MobileNavGroup({ group, location, closeMobileMenu }: { group: NavGroup, location: string, closeMobileMenu: () => void }) {
  const [open, setOpen] = useState(false);
  const panelId = `mobile-nav-group-${group.title.toLocaleLowerCase().replace(/\s+/g, '-')}`;
  return (
    <>
      <button
        type="button"
        className="qx-mobile-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {group.title}
        <ChevronDown size={16} className="qx-mobile-trigger-icon" />
      </button>
      <div
        id={panelId}
        className="qx-mobile-content"
        role="region"
        aria-label={`${group.title} navigation`}
        aria-hidden={!open}
        inert={!open}
      >
        {group.items.map(item => {
          const Icon = item.icon;
          const content = (
            <>
              <Icon size={18} className="qx-mobile-item-icon" />
              <span className="qx-mobile-item-copy">
                <span className="qx-mobile-item-title">
                  {item.label}
                  {item.disabled && <span className="qx-badge-soon ml-2">Soon</span>}
                </span>
                <span className="qx-mobile-item-description">{item.description}</span>
              </span>
              {!item.disabled && <ArrowRight size={15} className="qx-mobile-item-arrow" aria-hidden="true" />}
            </>
          );

          if (item.disabled) {
            return (
              <div key={item.label} className="qx-mobile-item is-disabled">
                {content}
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn("qx-mobile-item", (location === item.href || (item.href !== '/' && location.startsWith(`${item.href}/`))) && "active")}
              onClick={closeMobileMenu}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </>
  );
}

function PublicHeader() {
  const [location] = useLocation();
  const { isLoaded, isSignedIn } = useUser();
  const { t } = useI18n();
  const preview = useSitePreview();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });
  const navigation = preview.active && preview.navigation ? preview.navigation : (published.data?.navigation ?? []);

  const effectivePages = useMemo(() => {
    const pages = published.data?.pages ? [...published.data.pages] : [];
    if (preview.active && preview.pageKey && preview.content) {
      const idx = pages.findIndex(p => p.pageKey === preview.pageKey);
      if (idx !== -1) pages[idx] = { ...pages[idx], content: preview.content as any };
      else pages.push({ pageKey: preview.pageKey as any, content: preview.content as any } as any);
    }
    return pages;
  }, [published.data?.pages, preview.active, preview.pageKey, preview.content]);

  const pageLinks = useMemo(() => pageNavigationLinks(effectivePages), [effectivePages]);
  const hiddenPageHrefs = hiddenManagedPageHrefs(effectivePages);
  const configuredNavigation = navigation.filter((link) => link.enabled && !hiddenPageHrefs.has(link.href));
  const configuredHrefs = new Set(configuredNavigation.map((link) => link.href));
  const allNavigation = [...configuredNavigation, ...pageLinks.filter((link) => !configuredHrefs.has(link.href))].sort(automaticNavigationOrder);
  const headerLinks = allNavigation.filter((link) => link.header);
  const publicNavigationGroups = NAVIGATION_DATA
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !hiddenPageHrefs.has(item.href)),
    }))
    .filter((group) => group.direct || group.items.length > 0);
  const ownerAccess = useGetOperators({
    query: {
      enabled: isLoaded && Boolean(isSignedIn),
      queryKey: getGetOperatorsQueryKey(),
      retry: false,
      staleTime: 30_000,
    },
  });
  const menuItems: PublicMenuItem[] = [
    { href: '/', label: 'Home', icon: House, testId: 'link-mobile-home' },
    { href: '/status', label: 'Track an Order', icon: Search, testId: 'link-mobile-track-order' },
    ...(!hiddenPageHrefs.has('/affiliates')
      ? [{ href: '/affiliates', label: 'Affiliate Program', icon: Handshake, testId: 'link-mobile-affiliate-program' }]
      : []),
    { href: '/account', label: 'Account', icon: CircleUserRound, testId: 'link-mobile-account' },
    ...(ownerAccess.isSuccess
      ? [{ href: '/admin', label: 'Admin Panel', icon: ShieldCheck, testId: 'link-mobile-admin-panel', special: true }]
      : []),
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (mobileMenuOpen) {
      setHeaderHidden(false);
      return;
    }

    const hideThreshold = 14;
    const topThreshold = 1;
    let lastScrollY = Math.max(0, window.scrollY);
    let downwardDistance = 0;
    let frameRequested = false;
    let pendingHidden: boolean | null = null;

    const applyHeaderVisibility = () => {
      frameRequested = false;
      if (pendingHidden !== null) {
        setHeaderHidden(pendingHidden);
        pendingHidden = null;
      }
    };

    const onScroll = () => {
      const currentScrollY = Math.max(0, window.scrollY);
      const delta = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      if (currentScrollY <= topThreshold || delta < 0) {
        downwardDistance = 0;
        pendingHidden = false;
      } else if (delta > 0) {
        downwardDistance += delta;
        if (downwardDistance >= hideThreshold) {
          downwardDistance = 0;
          pendingHidden = true;
        }
      }

      if (pendingHidden === null) return;
      if (frameRequested) return;
      frameRequested = true;
      window.requestAnimationFrame(applyHeaderVisibility);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    if (lastScrollY <= topThreshold) setHeaderHidden(false);
    return () => window.removeEventListener('scroll', onScroll);
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return <div className="public-header-slot">
    <header className={cn(
      'public-header',
      mobileMenuOpen && 'is-menu-open',
      headerHidden && !mobileMenuOpen && 'is-scroll-hidden',
    )}>
    <BrandLogo />
    <DesktopMegaMenu groups={publicNavigationGroups} />
    <nav className="public-nav hidden" aria-label="Published primary navigation">
      <ConfiguredLinks links={headerLinks} placement="header" />
    </nav>
    <div className="header-trust hidden lg:flex">
      <ThemeToggle />
      <LanguageSelector />
      <Link href="/account" className="button button-primary rounded-full px-5 py-2 h-9 text-sm" data-testid="link-header-account">Account</Link>
    </div>
    <div className="mobile-nav-wrap">
      <LanguageSelector />
      <button
        ref={mobileMenuButtonRef}
        type="button"
        className="mobile-menu icon-button"
        data-testid="button-mobile-menu"
        aria-label={mobileMenuOpen ? t('public.closeNavigation') : t('public.openNavigation')}
        aria-expanded={mobileMenuOpen}
        aria-controls="mobile-navigation"
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
    </div>
    <SideDrawer
      open={mobileMenuOpen}
      onClose={closeMobileMenu}
      triggerRef={mobileMenuButtonRef}
      id="mobile-navigation"
      ariaLabel={t('public.mobileNav')}
      closeLabel={t('public.closeNavigation')}
      layerTestId="site-menu-drawer-layer"
      drawerTestId="site-menu-drawer"
      backdropTestId="site-menu-drawer-backdrop"
      closeTestId="button-close-site-menu"
    >
       <nav className="qx-mobile-nav" aria-label={t('public.mobileNav')}>
          {publicNavigationGroups.map((group) => (
            <div key={group.title} className="qx-mobile-group">
              {group.direct ? (
                <Link
                  href={group.items[0]?.href ?? '/'}
                  className={cn(
                    'qx-mobile-item',
                    group.items[0] && (location === group.items[0].href || location.startsWith(`${group.items[0].href}/`)) && 'active',
                  )}
                  onClick={closeMobileMenu}
                  data-testid={`link-mobile-${group.title.toLowerCase()}`}
                >
                  <span className="qx-mobile-item-copy">
                    <span className="qx-mobile-item-title">{group.title}</span>
                    <span className="qx-mobile-item-description">{group.items[0]?.description}</span>
                  </span>
                </Link>
              ) : (
                <MobileNavGroup group={group} location={location} closeMobileMenu={closeMobileMenu} />
              )}
            </div>
          ))}

          <div className="qx-mobile-base-links">
            {menuItems.filter(i => i.label === 'Account' || i.label === 'Admin Panel').map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn('qx-mobile-item', location === item.href && 'active', item.special && 'owner-access')}
                  onClick={closeMobileMenu}
                  data-testid={item.testId}
                >
                  <Icon size={20} className="qx-mobile-item-icon" />
                  <span className="qx-mobile-item-title">{item.label}</span>
                </Link>
              );
            })}
          </div>
      </nav>
      </SideDrawer>
    </header>
  </div>;
}

export function PublicShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });

  const effectivePages = useMemo(() => {
    const pages = published.data?.pages ? [...published.data.pages] : [];
    if (preview.active && preview.pageKey && preview.content) {
      const idx = pages.findIndex(p => p.pageKey === preview.pageKey);
      if (idx !== -1) pages[idx] = { ...pages[idx], content: preview.content as any };
      else pages.push({ pageKey: preview.pageKey as any, content: preview.content as any } as any);
    }
    return pages;
  }, [published.data?.pages, preview.active, preview.pageKey, preview.content]);

  const pageLinks = pageNavigationLinks(effectivePages);
  const hiddenPageHrefs = hiddenManagedPageHrefs(effectivePages);

  const navigation = preview.active && preview.navigation ? preview.navigation : (published.data?.navigation ?? []);

  const configuredNavigation = navigation.filter((link) => link.enabled && !hiddenPageHrefs.has(link.href));
  const configuredHrefs = new Set(configuredNavigation.map((link) => link.href));
  const sortedFooterLinks = [...configuredNavigation, ...pageLinks.filter((link) => !configuredHrefs.has(link.href))]
    .filter((link) => link.footer)
    .sort(automaticNavigationOrder);
  const seenFooterLabels = new Set<string>();
  const footerLinks = sortedFooterLinks.filter((link) => {
    const label = normalizeFooterLabel(link.label);
    if (seenFooterLabels.has(label)) return false;
    seenFooterLabels.add(label);
    return true;
  });
  const resolveFooterLinks = (definitions: ReadonlyArray<readonly [string, string]>) => definitions.flatMap(([label, href]) => {
    if (hiddenPageHrefs.has(href)) return [];
    const existing = footerLinks.find((link) => link.href === href || normalizeFooterLabel(link.label) === normalizeFooterLabel(label));
    return [{
      ...(existing ?? {
        id: `footer-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        enabled: true,
        header: false,
        footer: true,
        widget: false,
      }),
      label,
      href,
      footer: true,
    } satisfies SiteNavLink];
  });
  const companyFooterLinks = resolveFooterLinks(COMPANY_FOOTER_LINKS);
  const informationFooterLinks = resolveFooterLinks(INFORMATION_FOOTER_LINKS);
  const exchangeFooterLinks = resolveFooterLinks(EXCHANGE_FOOTER_LINKS);

  const socialTrust = preview.active && preview.socialTrust ? preview.socialTrust : published.data?.socialTrust;
  const partnerLogos = (preview.active && preview.partnerLogos ? preview.partnerLogos : (published.data?.partnerLogos ?? []))
    .filter((logo) => logo.enabled)
    .sort(automaticNameOrder);

  const socialItems = (socialTrust?.items ?? [])
    .filter(i => i.enabled && i.group === 'social' && normalizeFooterLabel(i.name) !== 'telegram')
    .sort(automaticNameOrder);
  const trustItems = (socialTrust?.items ?? []).filter(i => i.enabled && i.group === 'trust').sort(automaticNameOrder);
  const telegramSupportUrl = (socialTrust?.items ?? []).find((item) =>
    item.enabled && normalizeFooterLabel(item.name) === 'telegram')?.href
    ?? socialTrust?.telegramUrl
    ?? SUPPORT_TELEGRAM;

  const hasSocial = Boolean(socialItems.length || socialTrust?.instagramUrl || socialTrust?.xUrl || socialTrust?.facebookUrl || trustItems.length);

  const footerNavigationGroups = [
    { title: 'Company', links: companyFooterLinks, type: 'links' },
    { title: 'Exchange', links: exchangeFooterLinks, type: 'links' },
    { title: 'Information', links: informationFooterLinks, type: 'links' },
    { title: 'Contacts', type: 'custom', content: (
      <>
        <span className="public-footer-link flex items-center gap-2 cursor-default select-none" data-testid="text-footer-working-hours">
          <Clock3 size={15} />
          {SUPPORT_HOURS}
        </span>
        <a href={telegramSupportUrl} target="_blank" rel="noreferrer noopener" className="public-footer-link hover:text-primary transition-colors flex items-center gap-2" data-testid="link-published-footer-support-telegram">
          <SiTelegram size={14} className="opacity-80" />
          Telegram Support
        </a>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="public-footer-link hover:text-primary transition-colors flex items-center gap-2" data-testid="link-published-footer-support-email">
          <Mail size={15} />
          Support Email
        </a>
      </>
    ) }
  ];

  return <div className="min-h-[100dvh] noise public-shell flex flex-col">
    <PublicHeader />
    <main className="flex-1">
      {children}
    </main>
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 mt-16 sm:mt-24">
      <footer className="qx-premium-footer">
        <div className="qx-premium-footer-bg">
          <div className="qx-premium-footer-glow" />
          <svg className="qx-premium-footer-globe" viewBox="0 0 800 400" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g stroke="currentColor" strokeWidth="1">
              <ellipse cx="400" cy="200" rx="300" ry="150" />
              <ellipse cx="400" cy="200" rx="150" ry="150" />
              <path d="M100,200 L700,200" />
              <path d="M400,50 L400,350" />
              <path d="M188,94 L612,306" />
              <path d="M188,306 L612,94" />
            </g>
          </svg>
        </div>

        <div className="qx-premium-footer-inner">
          <div className="grid grid-cols-1 gap-x-8 gap-y-10 mb-10 sm:grid-cols-2 sm:mb-12 lg:grid-cols-12">
            <div className="flex flex-col items-start gap-5 sm:col-span-2 lg:col-span-4 lg:gap-6">
              <BrandLogo />
              <p className="qx-footer-tagline">Your Crypto Exchange Partner</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Fast. Secure. Global. Exchange, convert and move your crypto with confidence.
              </p>
              {hasSocial && (
                <div className="mt-2">
                  <FooterSocialLinksDataDriven
                    socialTrust={socialTrust as SocialTrustConfig | undefined}
                    socialItems={socialItems}
                    trustItems={trustItems}
                    preview={preview}
                  />
                </div>
              )}
            </div>

            {footerNavigationGroups.map((group) => (
              <section key={group.title} className="flex flex-col gap-4 lg:col-span-2">
                <h2 className="text-foreground text-xs font-bold tracking-widest uppercase">{group.title}</h2>
                <div className="flex flex-col gap-2.5 text-sm text-muted-foreground" aria-label={`${group.title} footer links`}>
                  {group.type === 'links'
                    ? <nav className="contents" aria-label={`${group.title} navigation`}><ConfiguredLinks links={group.links!} placement="footer" /></nav>
                    : group.content}
                </div>
              </section>
            ))}
          </div>

          <div className="qx-premium-footer-divider"></div>

          {partnerLogos.length > 0 && (
             <div className="qx-premium-footer-partner-wrapper">
                <PartnerLogoSlider logos={partnerLogos} />
             </div>
          )}

          <div className="qx-footer-bottom">
            <p>&copy; {new Date().getFullYear()} QuickXchange &mdash; All rights reserved.</p>
            <div className="qx-footer-bottom-actions">
              <div className="qx-footer-security">
                <ShieldCheck size={15} className="text-primary" aria-hidden="true" />
                <span>Secure <span aria-hidden="true">&bull;</span> Global</span>
              </div>
              <LanguageSelector className="qx-footer-language" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>;
}

