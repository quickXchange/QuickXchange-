import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, SyntheticEvent } from 'react';
import { cn } from '@/components/shared-app-ui';

export type LogoFitProfile = 'cover' | 'contain' | 'wordmark' | 'icon' | 'badge' | 'tall';
export type LogoAvatarType = 'crypto' | 'fiat' | 'payment' | 'bank' | 'network' | 'generic';

export interface LogoAvatarProps {
  sources?: (string | null | undefined)[];
  fallback?: ReactNode;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'responsive' | 'badge' | string;
  type?: LogoAvatarType;
  brand?: string;
  fit?: LogoFitProfile;
  logoScale?: number;
  className?: string;
  imageClassName?: string;
  'data-symbol'?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
  onFailAll?: () => void;
  priority?: boolean;
}

export function LogoAvatar({
  sources = [],
  fallback,
  alt = '',
  size = 'md',
  type = 'generic',
  brand,
  fit,
  logoScale = 1,
  className,
  imageClassName,
  'data-symbol': dataSymbol,
  'aria-hidden': ariaHidden,
  onFailAll,
  priority = false,
}: LogoAvatarProps) {
  const validSources = useMemo(() => Array.from(new Set(sources.filter((s): s is string => Boolean(s)))), [sources]);
  const sourceKey = validSources.join('\0');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [intrinsicAspect, setIntrinsicAspect] = useState<number | null>(null);
  const renderedSourceKey = useRef(sourceKey);
  const sourceChanged = renderedSourceKey.current !== sourceKey;
  const effectiveSourceIndex = sourceChanged ? 0 : sourceIndex;

  useEffect(() => {
    renderedSourceKey.current = sourceKey;
    setSourceIndex(0);
    setIntrinsicAspect(null);
  }, [sourceKey]);

  const currentSource = validSources[effectiveSourceIndex];
  const hasFailedAll = validSources.length === 0 || effectiveSourceIndex >= validSources.length;

  useEffect(() => {
    if (hasFailedAll && onFailAll) onFailAll();
  }, [hasFailedAll, onFailAll]);

  let effectiveFit: LogoFitProfile = fit || 'contain';
  if (!fit && (type === 'payment' || type === 'bank')) {
    if (intrinsicAspect !== null) {
      if (intrinsicAspect >= 1.4) {
        effectiveFit = 'wordmark';
      } else if (intrinsicAspect <= 0.7) {
        effectiveFit = 'tall';
      } else {
        effectiveFit = 'icon';
      }
    } else if (brand && ['sepa', 'sofort', 'ideal', 'bbva'].includes(brand)) {
      effectiveFit = 'wordmark';
    } else {
      effectiveFit = 'icon';
    }
  }

  const isImage = !hasFailedAll && Boolean(currentSource);
  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    setIntrinsicAspect(image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : null);
  };

  return (
    <span
      className={cn(
        'logo-avatar',
        `logo-avatar-${size}`,
        `logo-avatar-${type}`,
        `logo-avatar-fit-${effectiveFit}`,
        brand && `logo-avatar-brand-${brand}`,
        className
      )}
      data-brand={brand}
      data-symbol={dataSymbol}
      aria-hidden={ariaHidden}
      style={{ '--qx-logo-scale': String(logoScale) } as CSSProperties}
    >
      {isImage ? (
        <img
          src={currentSource!}
          alt={alt}
          loading={priority || type === 'crypto' ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={handleImageLoad}
          onError={() => {
            setIntrinsicAspect(null);
            setSourceIndex(effectiveSourceIndex + 1);
          }}
          className={cn('logo-avatar-img', imageClassName)}
        />
      ) : fallback ? (
        <span className="logo-avatar-fallback">{fallback}</span>
      ) : null}
    </span>
  );
}
