import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { SettlementOption } from '@workspace/api-client-react';
import { getBrandfetchLogoUrl } from '@/lib/brandfetch';
import { LogoAvatar } from '@/components/logo-avatar';

type CryptoIdentityProps = {
  symbol: string;
  name?: string | null;
  network?: string | null;
  logoUrl?: string | null;
  networkLogoUrl?: string | null;
  logoFallbackUrls?: string[];
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  preferSymbolLogo?: boolean;
  className?: string;
  testId?: string;
};

const clean = (value?: string | null) => value?.trim() || '';

/**
 * Produces an asset key, not a network key. It deliberately selects the first
 * known asset in composite route values such as "USDT-ERC20".
 */
export function normalizeCryptoSymbol(value?: string | null): string {
  const input = clean(value).normalize('NFKC').replace(/\s+/gu, ' ');
  if (!input) return '';
  const upper = input.toUpperCase();
  const tokens = upper.split(/[\s_:/|,;()[\]{}-]+/u).filter(Boolean);
  const known = new Set([...OFFICIAL_CRYPTO_LOGOS.keys(), 'XBT']);
  const matched = tokens.find(token => known.has(token));
  const candidate = matched || tokens[0] || upper;
  return (candidate === 'XBT' ? 'BTC' : candidate).replace(/[^A-Z0-9]/gu, '');
}

const normalized = (value?: string | null) => clean(value).normalize('NFKC').replace(/[\s_-]+/gu, '').toLowerCase();

export type OfficialCryptoBySymbol = ReadonlyMap<string, { name: string; logoUrl?: string }>;

const officialLogo = (symbol: string) =>
  `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${symbol.toLowerCase()}.png`;

const automaticSymbolLogoUrls = (symbol: string) => {
  if (!/^[A-Z0-9]{2,20}$/u.test(symbol)) return [];
  const lowerSymbol = symbol.toLowerCase();
  return [
    `https://assets.coincap.io/assets/icons/${lowerSymbol}@2x.png`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${lowerSymbol}.png`,
  ];
};

/** Stable transparent logo sources for the assets most commonly offered by QuickXchange. */
export const OFFICIAL_CRYPTO_LOGOS: ReadonlyMap<string, { name: string; logoUrl: string }> = new Map([
  ['BTC', { name: 'Bitcoin', logoUrl: officialLogo('btc') }],
  ['ETH', { name: 'Ethereum', logoUrl: officialLogo('eth') }],
  ['USDT', { name: 'Tether', logoUrl: officialLogo('usdt') }],
  ['USDC', { name: 'USD Coin', logoUrl: officialLogo('usdc') }],
  ['TRX', { name: 'TRON', logoUrl: officialLogo('trx') }],
  ['BNB', { name: 'BNB', logoUrl: officialLogo('bnb') }],
  ['SOL', { name: 'Solana', logoUrl: officialLogo('sol') }],
  ['XRP', { name: 'XRP', logoUrl: officialLogo('xrp') }],
  ['DOGE', { name: 'Dogecoin', logoUrl: officialLogo('doge') }],
  ['LTC', { name: 'Litecoin', logoUrl: officialLogo('ltc') }],
  ['XMR', { name: 'Monero', logoUrl: officialLogo('xmr') }],
  ['ADA', { name: 'Cardano', logoUrl: officialLogo('ada') }],
  ['DOT', { name: 'Polkadot', logoUrl: officialLogo('dot') }],
  ['AVAX', { name: 'Avalanche', logoUrl: officialLogo('avax') }],
  ['MATIC', { name: 'Polygon', logoUrl: officialLogo('matic') }],
  ['LINK', { name: 'Chainlink', logoUrl: officialLogo('link') }],
  ['ATOM', { name: 'Cosmos', logoUrl: officialLogo('atom') }],
  ['BCH', { name: 'Bitcoin Cash', logoUrl: officialLogo('bch') }],
  ['DAI', { name: 'Dai', logoUrl: officialLogo('dai') }],
  ['SHIB', { name: 'Shiba Inu', logoUrl: officialLogo('shib') }],
]);

export function cryptoLogoFallbackUrls(symbol: string, officialCryptoBySymbol?: OfficialCryptoBySymbol) {
  const normalizedSymbol = normalizeCryptoSymbol(symbol);
  const brandfetchUrl = getBrandfetchLogoUrl(normalizedSymbol, { namespace: 'crypto' });
  return dedupeUrls([
    officialCryptoBySymbol?.get(normalizedSymbol)?.logoUrl,
    OFFICIAL_CRYPTO_LOGOS.get(normalizedSymbol)?.logoUrl,
    brandfetchUrl,
    ...automaticSymbolLogoUrls(normalizedSymbol),
  ]);
}

type CryptoCatalogEntry = {
  id?: string;
  assetId?: string;
  symbol: string;
  name: string;
  networks: string[];
  logoUrl?: string;
};

const CryptoCatalogContext = createContext<CryptoCatalogEntry[]>([]);

/** Resolves an asset code or a settlement/asset id without treating a route network as the asset. */
export function resolveCryptoAsset(value: string | null | undefined, catalog: readonly CryptoCatalogEntry[] = []) {
  const raw = clean(value);
  const idMatch = catalog.find(entry => entry.id === raw || entry.assetId === raw);
  if (idMatch) return { symbol: normalizeCryptoSymbol(idMatch.symbol), entry: idMatch };
  const symbol = normalizeCryptoSymbol(raw);
  const entry = catalog.find(item => normalizeCryptoSymbol(item.symbol) === symbol);
  return { symbol, entry };
}

const dedupeUrls = (urls: Array<string | null | undefined>) =>
  Array.from(new Set(urls.map(clean).filter(Boolean)));

/** The deterministic global source chain used by both CryptoLogo and CryptoIdentity. */
export function resolveCryptoLogoSources({
  symbol,
  logoUrl,
  logoFallbackUrls = [],
  catalog = [],
}: {
  symbol: string;
  logoUrl?: string | null;
  logoFallbackUrls?: string[];
  catalog?: readonly CryptoCatalogEntry[];
}) {
  const { symbol: resolvedSymbol, entry } = resolveCryptoAsset(symbol, catalog);
  const brandfetchUrl = getBrandfetchLogoUrl(resolvedSymbol, { namespace: 'crypto' });
  return {
    symbol: resolvedSymbol,
    sources: dedupeUrls([
      logoUrl,
      entry?.logoUrl,
      OFFICIAL_CRYPTO_LOGOS.get(resolvedSymbol)?.logoUrl,
      brandfetchUrl,
      ...logoFallbackUrls,
      ...automaticSymbolLogoUrls(resolvedSymbol),
    ]),
  };
}

export function CryptoIdentityProvider({
  options,
  children,
}: {
  options: SettlementOption[];
  children: ReactNode;
}) {
  const entries = useMemo(() => options
    .filter(option => option.kind === 'crypto-network')
    .map(option => ({
      id: option.id,
      assetId: option.assetId,
      symbol: option.assetCode,
      name: option.title,
      networks: [option.routeNetwork, option.networkTitle, option.networkSlug].filter((value): value is string => Boolean(value)),
      logoUrl: option.logoUrl,
    })), [options]);

  return <CryptoCatalogContext.Provider value={entries}>{children}</CryptoCatalogContext.Provider>;
}

export function CryptoLogo({
  symbol,
  logoUrl,
  logoFallbackUrls = [],
  size = 'md',
  preferSymbolLogo = false,
  className = '',
}: Pick<CryptoIdentityProps, 'symbol' | 'logoUrl' | 'logoFallbackUrls' | 'size' | 'preferSymbolLogo' | 'className'>) {
  const catalog = useContext(CryptoCatalogContext);
  const { symbol: normalizedSymbol, sources } = useMemo(
    () => resolveCryptoLogoSources({ symbol, logoUrl, logoFallbackUrls, catalog: preferSymbolLogo ? [] : catalog }),
    [catalog, logoFallbackUrls, logoUrl, preferSymbolLogo, symbol],
  );

  return (
    <LogoAvatar
      sources={sources}
      fallback={normalizedSymbol.slice(0, 1) || '¤'}
      size={size}
      type="crypto"
      fit="cover"
      data-symbol={normalizedSymbol}
      aria-hidden={true}
      className={`crypto-logo ${className}`.trim()}
    />
  );
}

const NETWORK_BADGE_LOGOS: ReadonlyMap<string, string> = new Map([
  ['erc20', officialLogo('eth')], ['ethereum', officialLogo('eth')],
  ['trc20', officialLogo('trx')], ['tron', officialLogo('trx')],
  ['bep20', officialLogo('bnb')], ['bsc', officialLogo('bnb')], ['binancesmartchain', officialLogo('bnb')],
  ['solana', officialLogo('sol')], ['polygon', officialLogo('matic')],
]);

export function CryptoNetworkBadge({
  network,
  assetSymbol,
  networkLogoUrl,
  className = '',
  logoUrl,
}: {
  network?: string | null;
  assetSymbol?: string | null;
  className?: string;
  logoUrl?: string | null;
  networkLogoUrl?: string | null;
}) {
  const code = clean(network);
  const isEquivalent = normalized(code) === normalized(assetSymbol);
  const image = networkLogoUrl || logoUrl || NETWORK_BADGE_LOGOS.get(normalized(code));
  if (!code || isEquivalent) return null;
  return (
    <span className={`crypto-network-badge ${className}`.trim()} title={code}>
      {image && (
        <LogoAvatar
          sources={[image]}
          fallback={code.slice(0, 1).toUpperCase()}
          size="badge"
          type="network"
          fit="contain"
          aria-hidden={true}
        />
      )}
      <span>{code}</span>
    </span>
  );
}

export function CryptoIdentity({
  symbol,
  name,
  network,
  networkLogoUrl,
  logoUrl,
  logoFallbackUrls,
  size = 'md',
  compact = false,
  preferSymbolLogo = false,
  className = '',
  testId,
}: CryptoIdentityProps) {
  const catalog = useContext(CryptoCatalogContext);
  const { symbol: normalizedSymbol, entry: matched } = resolveCryptoAsset(symbol, catalog);
  const displayName = clean(name) || (preferSymbolLogo ? '' : clean(matched?.name));
  const displayNetwork = clean(network);
  const displayLogoUrl = clean(logoUrl) || (preferSymbolLogo ? '' : clean(matched?.logoUrl));
  const accessibleName = [
    displayName && displayName.toUpperCase() !== normalizedSymbol ? displayName : normalizedSymbol,
    normalizedSymbol,
    displayNetwork ? `on ${displayNetwork}` : '',
  ].filter(Boolean).join(', ');

  return (
    <span className={`crypto-identity ${compact ? 'crypto-identity-compact' : ''} ${className}`.trim()} aria-label={accessibleName} data-testid={testId}>
      <CryptoLogo symbol={normalizedSymbol} logoUrl={displayLogoUrl} logoFallbackUrls={logoFallbackUrls} size={size} preferSymbolLogo={preferSymbolLogo} />
      <span className="crypto-identity-copy">
        <span className="crypto-identity-primary">
          <strong>{normalizedSymbol}</strong>
          <CryptoNetworkBadge network={displayNetwork} assetSymbol={normalizedSymbol} networkLogoUrl={networkLogoUrl} />
        </span>
        {displayName && displayName.toUpperCase() !== normalizedSymbol && <span className="crypto-identity-name">{displayName}</span>}
      </span>
    </span>
  );
}
