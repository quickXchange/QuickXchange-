import React, { useEffect, useState } from 'react';
import { useGetWebsiteBranding, getGetWebsiteBrandingQueryKey } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';
import { getCachedPaymentLogoFit, measurePaymentLogoFit, type PaymentLogoFit } from '@/lib/payment-logo-fit';
import bbvaTransparentLogoUrl from '../../../../attached_assets/bbva-logo-transparent.png';
import bbvaWhiteLogoUrl from '../../../../attached_assets/bbva-logo-white-transparent.png';

export type MiniAppLogoSize = 'small' | 'normal' | 'medium' | 'large';

const sizeClasses: Record<MiniAppLogoSize, { container: string; image: string; text: string; badge: string }> = {
  small: { container: 'w-6 h-6', image: 'w-[90%] h-[90%]', text: 'text-[8px]', badge: 'w-2 h-2 -right-0.5 -bottom-0.5' },
  normal: { container: 'w-8 h-8', image: 'w-[90%] h-[90%]', text: 'text-[9px]', badge: 'w-2.5 h-2.5 -right-0.5 -bottom-0.5' },
  medium: { container: 'w-10 h-10', image: 'w-[90%] h-[90%]', text: 'text-[10px]', badge: 'w-2.5 h-2.5 -right-0.5 -bottom-0.5' },
  large: { container: 'w-14 h-14', image: 'w-[90%] h-[90%]', text: 'text-xs', badge: 'w-3 h-3 -right-0.5 -bottom-0.5' },
};

const compactLogoChecks = new Map<string, Promise<boolean>>();
const unavailableCompactLogos = new Set<string>();

async function findCompactPaymentLogo(sources: string[]): Promise<string | undefined> {
  for (const source of sources) {
    if (unavailableCompactLogos.has(source)) continue;
    let check = compactLogoChecks.get(source);
    if (!check) {
      check = new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth >= 32 && image.naturalHeight >= 32
          && Math.max(image.naturalWidth / image.naturalHeight, image.naturalHeight / image.naturalWidth) < 1.6);
        image.onerror = () => resolve(false);
        image.src = source;
      });
      compactLogoChecks.set(source, check);
    }
    if (await check) return source;
  }
  return undefined;
}

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
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
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
  const [compactLogo, setCompactLogo] = useState<{ original: string; url: string } | null>(null);
  const classes = sizeClasses[size];

  useEffect(() => setSourceIndex(0), [sourceKey]);
  useEffect(() => setBadgeFailed(false), [normalizedBadge]);

  const currentSrc = sources[sourceIndex];
  const displayedSrc = compactLogo?.original === currentSrc && !unavailableCompactLogos.has(compactLogo.url)
    ? compactLogo.url : currentSrc;
  const paymentFit = variant === 'payment' && displayedSrc
    ? (measuredFit?.src === displayedSrc ? measuredFit.fit : getCachedPaymentLogoFit(displayedSrc))
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
        {displayedSrc ? (
          <img
            src={displayedSrc}
            alt={alt}
            className={cn(
              'block bg-transparent object-contain object-center',
              variant === 'payment' ? 'h-full w-full max-h-full max-w-full' : 'max-h-[90%] max-w-[90%]',
              variant !== 'payment' && classes.image,
            )}
            style={variant === 'payment' ? {
              transform: `translate(${paymentFit?.x ?? 0}%, ${paymentFit?.y ?? 0}%) scale(${paymentFit?.scale ?? 0.92})`,
            } : undefined}
            onLoad={event => {
              if (variant === 'payment') {
                const fit = measurePaymentLogoFit(displayedSrc, event.currentTarget);
                setMeasuredFit({ src: displayedSrc, fit });
                // A long wordmark cannot fill a small circle without cropping or distorting it.
                // Prefer a square site icon when one of the existing fallbacks provides it.
                if (!isBbva && displayedSrc === currentSrc && fit.artworkAspect > 2.2) {
                  const icons = sources.filter(source => source !== currentSrc
                    && (/google\.com\/s2\/favicons/.test(source) || /icons\.duckduckgo\.com\/ip3/.test(source)));
                  void findCompactPaymentLogo(icons).then(url => {
                    if (url) setCompactLogo({ original: currentSrc, url });
                  });
                }
              }
            }}
            onError={() => {
              if (displayedSrc !== currentSrc) {
                unavailableCompactLogos.add(displayedSrc);
                setCompactLogo(null);
              } else setSourceIndex(index => index + 1);
            }}
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
