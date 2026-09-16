import { useEffect, useMemo } from 'react';
import { ArrowRight, Zap, TrendingUp, RefreshCw } from 'lucide-react';
import { getGetQuickexConfigQueryKey, useGetQuickexConfig } from '@workspace/api-client-react';
import { requestMarketConvertSelection } from '@/lib/market-convert-selection';
import { CryptoLogo } from '@/components/crypto-identity';

const DESIRED_PAIRS = [
  { source: 'BTC', dest: 'ETH' },
  { source: 'BTC', dest: 'XMR' },
  { source: 'BTC', dest: 'USDC' },
  { source: 'USDT', dest: 'XMR' },
  { source: 'USDT', dest: 'ETH' },
  { source: 'TRX', dest: 'XMR' },
];

type PopularPair = {
  fromAsset: string;
  toAsset: string;
  unavailable: boolean;
  checking?: boolean;
};

const POPULAR_PAIR_CACHE_KEY = 'qx-popular-pairs-v1';
const POPULAR_PAIR_CACHE_TTL_MS = 30 * 60 * 1000;

function readCachedPairs(): PopularPair[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(POPULAR_PAIR_CACHE_KEY) ?? '') as {
      savedAt?: number;
      pairs?: PopularPair[];
    };
    if (
      typeof parsed.savedAt !== 'number'
      || Date.now() - parsed.savedAt > POPULAR_PAIR_CACHE_TTL_MS
      || !Array.isArray(parsed.pairs)
    ) return null;
    return parsed.pairs;
  } catch {
    return null;
  }
}

export function PopularExchangePairs() {
  const cachedPairs = useMemo(readCachedPairs, []);
  const { data: config, isFetching, isError } = useGetQuickexConfig({
    query: {
      queryKey: getGetQuickexConfigQueryKey(),
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  });

  const availablePairs = useMemo<PopularPair[]>(() => {
    if (!config?.pairs) {
      return (cachedPairs ?? DESIRED_PAIRS.map(({ source, dest }) => ({
        fromAsset: source,
        toAsset: dest,
        unavailable: false,
      }))).map((pair) => ({ ...pair, checking: true }));
    }

    return DESIRED_PAIRS.map(desired => {
      const match = config.pairs.find(p => 
        p.fromAsset.trim().toUpperCase() === desired.source &&
        p.toAsset.trim().toUpperCase() === desired.dest
      );
      if (match) return { fromAsset: match.fromAsset, toAsset: match.toAsset, unavailable: false };
      if (desired.source === 'TRX' && desired.dest === 'XMR') {
        return { fromAsset: desired.source, toAsset: desired.dest, unavailable: true };
      }
      return null;
    }).filter(Boolean) as PopularPair[];
  }, [cachedPairs, config?.pairs]);

  useEffect(() => {
    if (!config?.pairs || availablePairs.length === 0) return;
    try {
      localStorage.setItem(POPULAR_PAIR_CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        pairs: availablePairs,
      }));
    } catch {
      // Browser storage is optional; the cards still render immediately.
    }
  }, [availablePairs, config?.pairs]);

  const viewAllPairs = () => {
    requestMarketConvertSelection({
      openSelector: 'source'
    });
  };

  if (isError && !cachedPairs) {
    return (
      <section className="mx-auto w-full max-w-[1440px] px-4 py-12 text-center md:px-8" data-testid="popular-pairs-section">
         <div className="bg-card border border-border/50 rounded-2xl p-8 max-w-2xl mx-auto flex flex-col items-center gap-3">
            <RefreshCw className="text-muted-foreground" size={24} />
            <h3 className="font-bold text-lg text-foreground">Exchange routes unavailable</h3>
            <p className="text-muted-foreground text-sm">We couldn't load the popular exchange pairs at this time.</p>
         </div>
      </section>
    );
  }

  if (availablePairs.length === 0) {
    return (
      <section className="mx-auto w-full max-w-[1440px] px-4 py-12 text-center md:px-8" data-testid="popular-pairs-section">
         <div className="bg-card border border-border/50 rounded-2xl p-8 max-w-2xl mx-auto flex flex-col items-center gap-3">
            <TrendingUp className="text-muted-foreground" size={24} />
            <h3 className="font-bold text-lg text-foreground">Market Routes</h3>
            <p className="text-muted-foreground text-sm">These popular pairs are not currently available. Use the exchange widget to find active routes.</p>
         </div>
      </section>
    );
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-[1440px] px-4 py-12 md:px-8" data-testid="popular-pairs-section">
      <div className="flex flex-col items-center text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-marketing font-extrabold tracking-tight mb-2 text-foreground">
          Popular Exchange Pairs
        </h2>
        <p className="text-muted-foreground font-medium text-lg max-w-2xl">
          Choose an active route and continue directly in the QuickXchange widget.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        {availablePairs.map((pair) => {
          return (
            <button
              type="button"
              key={`${pair.fromAsset}-${pair.toAsset}`}
              onClick={pair.unavailable || pair.checking ? undefined : () => requestMarketConvertSelection({
                symbol: pair.fromAsset,
                destinationSymbol: pair.toAsset,
              })}
              disabled={pair.unavailable || pair.checking}
              aria-label={pair.unavailable
                ? `${pair.fromAsset} to ${pair.toAsset} is currently unavailable`
                : pair.checking
                  ? `Checking ${pair.fromAsset} to ${pair.toAsset} availability`
                : `Convert ${pair.fromAsset} to ${pair.toAsset}`}
              className={`group relative overflow-hidden rounded-[20px] border border-[#258cff]/30 bg-card p-5 text-left shadow-[inset_0_0_24px_rgba(19,221,244,0.10),inset_0_0_42px_rgba(122,44,255,0.06),0_0_0_1px_rgba(37,140,255,0.04)] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-[#438cff]/35 dark:bg-[#0b1424] dark:shadow-[inset_0_0_30px_rgba(19,221,244,0.12),inset_0_0_52px_rgba(122,44,255,0.12),0_0_0_1px_rgba(67,140,255,0.06)] md:p-6 ${pair.unavailable || pair.checking ? 'cursor-wait opacity-75' : 'hover:-translate-y-0.5 hover:border-[#13ddf4]/55 hover:shadow-[inset_0_0_34px_rgba(19,221,244,0.18),inset_0_0_56px_rgba(122,44,255,0.12),0_8px_28px_rgba(37,140,255,0.14)] active:border-[#13ddf4]/60 active:shadow-[inset_0_0_38px_rgba(19,221,244,0.20),inset_0_0_60px_rgba(122,44,255,0.14)] dark:hover:border-[#13ddf4]/60 dark:hover:shadow-[inset_0_0_40px_rgba(19,221,244,0.22),inset_0_0_68px_rgba(122,44,255,0.20),0_10px_30px_rgba(20,90,210,0.18)]'}`}
              data-testid={`popular-pair-${pair.fromAsset}-${pair.toAsset}`}
            >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(19,221,244,0.16),transparent_42%),radial-gradient(circle_at_100%_100%,rgba(122,44,255,0.13),transparent_44%)] opacity-70 transition-opacity duration-500 group-hover:opacity-100 dark:opacity-90" />

              <div className="flex items-center justify-between mb-5 relative z-10">
                <div className="flex items-center gap-3.5">
                  <div className="flex items-center -space-x-2.5">
                    <CryptoLogo 
                      symbol={pair.fromAsset} 
                      size="md" 
                      className="ring-[3px] ring-card z-10 relative shadow-sm"
                    />
                    <CryptoLogo 
                      symbol={pair.toAsset} 
                      size="md" 
                      className="ring-[3px] ring-card z-0 relative shadow-sm"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-bold text-foreground tracking-tight text-lg leading-tight truncate">
                      {pair.fromAsset}/{pair.toAsset}
                    </span>
                  </div>
                </div>
              </div>

              <span
                className="relative z-10 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-[#258cff]/25 bg-[#158cff]/10 py-2.5 font-bold text-primary shadow-[inset_0_0_18px_rgba(19,221,244,0.14),inset_0_0_28px_rgba(122,44,255,0.08)] transition-all duration-300 group-hover:border-[#13ddf4]/45 group-hover:bg-[#158cff]/15 group-hover:shadow-[inset_0_0_24px_rgba(19,221,244,0.22),inset_0_0_38px_rgba(122,44,255,0.16)] dark:bg-[#087bff]/12 dark:shadow-[inset_0_0_22px_rgba(19,221,244,0.18),inset_0_0_34px_rgba(122,44,255,0.14)]"
                data-testid={`btn-exchange-${pair.fromAsset}-${pair.toAsset}`}
              >
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#13ddf4]/10 via-[#258cff]/8 to-[#7a2cff]/10 opacity-80 transition-opacity group-hover:opacity-100" />
                 {pair.unavailable || pair.checking ? <RefreshCw size={16} className={`relative z-10 ${pair.checking && isFetching ? 'animate-spin' : ''}`} /> : <Zap size={16} className="relative z-10" />}
                 <span className="relative z-10">{pair.checking ? 'Checking' : pair.unavailable ? 'Unavailable' : 'Convert'}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 text-center relative z-10">
        <button
          type="button"
          onClick={viewAllPairs}
          className="group inline-flex items-center justify-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary transition-colors duration-200"
          data-testid="btn-view-all-pairs"
        >
          View all pairs
          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </section>
  );
}
