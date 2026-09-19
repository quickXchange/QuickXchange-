import { useEffect, useState } from 'react';
import { useGetWebsiteBranding, getGetWebsiteBrandingQueryKey } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

export type MiniAppLogoSize = 'small' | 'normal' | 'medium' | 'large';

const sizeClasses: Record<MiniAppLogoSize, { container: string; image: string; text: string; badge: string }> = {
  small: { container: 'w-6 h-6', image: 'w-4 h-4', text: 'text-[8px]', badge: 'w-2.5 h-2.5 -right-0.5 -bottom-0.5' },
  normal: { container: 'w-8 h-8', image: 'w-5 h-5', text: 'text-[9px]', badge: 'w-3 h-3 -right-0.5 -bottom-0.5' },
  medium: { container: 'w-10 h-10', image: 'w-7 h-7', text: 'text-[10px]', badge: 'w-3.5 h-3.5 -right-0.5 -bottom-0.5' },
  large: { container: 'w-14 h-14', image: 'w-10 h-10', text: 'text-xs', badge: 'w-4.5 h-4.5 -right-0.5 -bottom-0.5' },
};

export function normalizeMiniAppImageUrl(url?: string | null) {
  if (!url) return undefined;
  return url.startsWith('/objects/') ? `/api/storage${url}` : url;
}

export function MiniAppLogo({
  src,
  fallbackSrcs = [],
  badgeSrc,
  fallback,
  alt = '',
  size = 'normal',
  badgeVariant = 'network',
  variant = 'asset',
  className,
}: {
  src?: string | null;
  fallbackSrcs?: Array<string | null | undefined>;
  badgeSrc?: string | null;
  fallback?: string | null;
  alt?: string;
  size?: MiniAppLogoSize;
  badgeVariant?: 'network' | 'flag';
  variant?: 'asset' | 'payment';
  className?: string;
}) {
  const sources = Array.from(new Set(
    [src, ...fallbackSrcs]
      .map(normalizeMiniAppImageUrl)
      .filter((value): value is string => Boolean(value)),
  ));
  const sourceKey = sources.join('\0');
  const normalizedBadge = normalizeMiniAppImageUrl(badgeSrc);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [badgeFailed, setBadgeFailed] = useState(false);
  const classes = sizeClasses[size];

  useEffect(() => setSourceIndex(0), [sourceKey]);
  useEffect(() => setBadgeFailed(false), [normalizedBadge]);

  const currentSrc = sources[sourceIndex];

  return (
    <span className={cn(
      'relative inline-flex shrink-0 items-center justify-center rounded-full',
      classes.container,
      className,
    )}>
      <span className={cn(
        'flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-primary/10',
        'bg-primary/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_14px_-10px_hsl(var(--primary))]',
        'dark:border-white/10 dark:bg-white/[0.055]',
      )}>
        {currentSrc ? (
          <img
            src={currentSrc}
            alt={alt}
            className={cn(
              'block rounded-full object-center',
              variant === 'payment'
                ? 'h-full w-full object-cover'
                : cn('object-contain', classes.image),
            )}
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
    <span className={cn('relative inline-flex min-w-0 items-center', className)}>
      <span className="font-bold tracking-tight text-primary">QuickXchange</span>
      {light && !lightFailed && <img src={light} alt="QuickXchange" onError={() => setLightFailed(true)} className="absolute inset-y-0 left-0 block dark:hidden h-7 max-w-[150px] object-contain object-left bg-background" />}
      {dark && !darkFailed && <img src={dark} alt="QuickXchange" onError={() => setDarkFailed(true)} className="absolute inset-y-0 left-0 hidden dark:block h-7 max-w-[150px] object-contain object-left bg-background" />}
    </span>
  );
}
