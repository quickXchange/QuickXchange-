import React, { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const networkIcons: Record<string, string> = {
  erc20: 'eth', ethereum: 'eth',
  trc20: 'trx', tron: 'trx',
  bep20: 'bnb', bsc: 'bnb', binancesmartchain: 'bnb',
  solana: 'sol', polygon: 'matic',
};

export function resolveNetworkBadgeSource(network?: string | null, configured?: string | null) {
  const source = configured?.trim();
  if (source) return source.startsWith('/objects/') ? `/api/storage${source}` : source;
  const symbol = networkIcons[(network || '').replace(/[\s_-]+/g, '').toLowerCase()];
  return symbol ? `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${symbol}.png` : undefined;
}

/** Artwork-only badge. Its enclosing identity controls placement; this component controls the circle. */
export function NetworkBadge({
  network,
  src,
  variant = 'network',
  size = 18,
  className = '',
  children,
  ariaLabel,
}: {
  network?: string | null;
  src?: string | null;
  variant?: 'network' | 'flag';
  size?: number;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const configured = src?.trim();
  const sources = variant === 'network'
    ? Array.from(new Set([resolveNetworkBadgeSource(network, configured), resolveNetworkBadgeSource(network)].filter((value): value is string => Boolean(value))))
    : configured ? [configured] : [];
  const sourceKey = sources.join('\0');
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [sourceKey]);
  if (!children && !sources.length && (variant === 'flag' || !network)) return null;
  const fallback = (network || '?').trim().slice(0, 1).toUpperCase();
  return (
    <span
      className={`qx-network-badge qx-network-badge-${variant} ${className}`.trim()}
      style={{ '--qx-network-badge-size': `${size}px` } as CSSProperties}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    >
      {children || (sources[sourceIndex]
        ? <img className="qx-network-badge-image" src={sources[sourceIndex]} alt="" onError={() => setSourceIndex(index => index + 1)} />
        : <span className="qx-network-badge-fallback">{fallback}</span>)}
    </span>
  );
}