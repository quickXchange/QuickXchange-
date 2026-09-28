import React, { useEffect, useState } from 'react';
import { useGetWebsiteBranding, getGetWebsiteBrandingQueryKey } from '@workspace/api-client-react';
import { PaymentLogo } from '@workspace/payment-logo';
import { cn } from '@/lib/utils';
import { getCachedPaymentLogoFit, measurePaymentLogoFit, type PaymentLogoFit } from '@/lib/payment-logo-fit';
import type { MiniAppVisual } from '@/lib/logo-catalog';
import bbvaTransparentLogoUrl from '../../../../attached_assets/bbva-logo-transparent.png';
import bbvaWhiteLogoUrl from '../../../../attached_assets/bbva-logo-white-transparent.png';

// The component is also server-rendered in the unit tests, where CSS imports
// are not supported by Node. In the browser this module loads the shared styles
// once, alongside the shared renderer.
if (typeof document !== 'undefined') void import('@workspace/payment-logo/styles.css');

export type MiniAppLogoSize = 'small' | 'normal' | 'medium' | 'large';

const sizeClasses: Record<MiniAppLogoSize, { container: string; text: string; badge: string }> = {
  small: { container: 'size-6', text: 'text-[8px]', badge: 'size-2 -right-0.5 -bottom-0.5' },
  normal: { container: 'size-8', text: 'text-[9px]', badge: 'size-2.5 -right-0.5 -bottom-0.5' },
  medium: { container: 'size-10', text: 'text-[10px]', badge: 'size-2.5 -right-0.5 -bottom-0.5' },
  large: { container: 'size-14', text: 'text-xs', badge: 'size-3 -right-0.5 -bottom-0.5' },
};

export function normalizeMiniAppImageUrl(url?: string | null) {
  if (!url) return undefined;
  return url.startsWith('/objects/') ? `/api/storage${url}` : url;
}

export function MiniAppLogo({
  src,
  logoUrl,
  fallbackSrcs = [],
  badgeSrc,
  badgeUrl,
  fallback,
  alt = '',
  size = 'normal',
  badgeVariant = 'network',
  variant = 'asset',
  className,
}: {
  src?: string | null;
  logoUrl?: string | null;
  fallbackSrcs?: Array<string | null | undefined>;
  badgeSrc?: string | null;
  badgeUrl?: string | null;
  fallback?: string | null;
  alt?: string;
  size?: MiniAppLogoSize;
  badgeVariant?: 'network' | 'flag';
  variant?: 'asset' | 'payment';
  className?: string;
}) {
  const isBbva = (src || logoUrl) === bbvaTransparentLogoUrl;
  const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    if (!isBbva) return;
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isBbva]);
  const sources = Array.from(new Set(
    [isBbva && isDark ? bbvaWhiteLogoUrl : src || logoUrl, ...fallbackSrcs]
      .map(normalizeMiniAppImageUrl)
      .filter((value): value is string => Boolean(value)),
  ));
  const sourceKey = sources.join('\0');
  const normalizedBadge = normalizeMiniAppImageUrl(badgeSrc || badgeUrl);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [badgeFailed, setBadgeFailed] = useState(false);
  const [measuredFit, setMeasuredFit] = useState<{ src: string; fit: PaymentLogoFit } | null>(null);
  const classes = sizeClasses[size];

  useEffect(() => setSourceIndex(0), [sourceKey]);
  useEffect(() => setBadgeFailed(false), [normalizedBadge]);

  const currentSrc = sources[sourceIndex];
  const logoFit = currentSrc
    ? (measuredFit?.src === currentSrc ? measuredFit.fit : getCachedPaymentLogoFit(currentSrc))
    : undefined;

  return (
    <span className={cn(
      'relative inline-flex shrink-0 items-center justify-center rounded-full',
      classes.container,
      className,
    )}>
      <span className={cn(
        'flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-primary/10',
        variant === 'payment'
          ? 'border-black/10 bg-transparent dark:border-white/15 dark:bg-transparent'
          : 'border-primary/10 bg-primary/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_14px_-10px_hsl(var(--primary))] dark:border-white/10 dark:bg-white/[0.055]',
      )}>
        {variant === 'payment' ? (
          <PaymentLogo
            sources={sources}
            size="100%"
            alt={alt}
            className="!border-0"
            fallback={(
              <span className={cn('font-bold uppercase tracking-tight text-primary', classes.text)}>
                {(fallback || '?').slice(0, 4)}
              </span>
            )}
          />
        ) : currentSrc ? (
          <img
            src={currentSrc}
            alt={alt}
            className={cn(
              'block h-full w-full max-h-full max-w-full bg-transparent object-contain object-center',
            )}
            style={{
              transform: `translate(${logoFit?.x ?? 0}%, ${logoFit?.y ?? 0}%) scale(${logoFit?.scale ?? 0.92})`,
            }}
            onLoad={event => {
              const fit = measurePaymentLogoFit(currentSrc, event.currentTarget);
              setMeasuredFit({ src: currentSrc, fit });
            }}
            onError={() => setSourceIndex(index => index + 1)}
          />
        ) : (
          <span className={cn('font-bold uppercase tracking-tight text-primary', classes.text)}>
            {(fallback || '?').slice(0, 4)}
          </span>
        )}
      </span>
      {normalizedBadge && !badgeFailed && (
        <span className={cn(
          'absolute overflow-hidden rounded-full border-2 border-background bg-background shadow-sm flex items-center justify-center',
          classes.badge,
        )}>
          <img
            src={normalizedBadge}
            alt=""
            className={cn(
              'h-full w-full rounded-full object-contain object-center',
              badgeVariant === 'network' && 'p-[1px]',
            )}
            onError={() => setBadgeFailed(true)}
          />
        </span>
      )}
    </span>
  );
}

export function MiniAppLogoPair({
  source,
  target,
  sourceAlt,
  targetAlt,
}: {
  source: MiniAppVisual;
  target: MiniAppVisual;
  sourceAlt: string;
  targetAlt: string;
}) {
  const cryptoInFront = source.variant === 'payment' && target.variant !== 'payment';
  return (
    <span className="flex -space-x-2 shrink-0">
      <MiniAppLogo {...source} alt={sourceAlt} size="medium" className={cryptoInFront ? undefined : 'z-10'} />
      <MiniAppLogo {...target} alt={targetAlt} size="medium" className={cryptoInFront ? 'z-10' : undefined} />
    </span>
  );
}

export function MiniAppBrandLogo({ className }: { className?: string }) {
  const { data: branding } = useGetWebsiteBranding({
    query: { queryKey: getGetWebsiteBrandingQueryKey(), staleTime: 60_000 },
  });
  const light = normalizeMiniAppImageUrl(branding?.mobileLogoPath || branding?.lightLogoPath);
  const dark = normalizeMiniAppImageUrl(branding?.mobileLogoPath || branding?.darkLogoPath);
  const [lightFailed, setLightFailed] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);

  if (!light && !dark) {
    return <span className={cn('font-bold tracking-tight text-primary', className)}>QuickXchange</span>;
  }

  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center', className)}>
      {light && !lightFailed && <img src={light} alt="QuickXchange" onError={() => setLightFailed(true)} className="block h-7 w-auto max-w-full object-contain object-left dark:hidden" />}
      {dark && !darkFailed && <img src={dark} alt="QuickXchange" onError={() => setDarkFailed(true)} className="hidden h-7 w-auto max-w-full object-contain object-left dark:block" />}
      {lightFailed && darkFailed && <span className="font-bold tracking-tight text-primary">QuickXchange</span>}
    </span>
  );
}
