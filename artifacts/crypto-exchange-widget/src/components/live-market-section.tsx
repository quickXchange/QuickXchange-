import { useMemo } from 'react';
import { Link } from 'wouter';
import { ArrowRight, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import { useCryptoMarket, formatMoney, type CoinGeckoMarket } from '@/hooks/use-crypto-market';
import { cn } from '@/components/shared-app-ui';
import { Skeleton } from '@/components/ui/skeleton';
import { CryptoLogo } from '@/components/crypto-identity';
import { requestMarketConvertSelection } from '@/lib/market-convert-selection';

function MarketRow({ coin, rank }: { coin: CoinGeckoMarket; rank?: number }) {
  const isPositive = coin.price_change_percentage_24h >= 0;
  
  return (
    <button
      type="button"
      onClick={() => requestMarketConvertSelection({
        id: coin.id,
        symbol: coin.symbol.trim().toUpperCase(),
      })}
      aria-label={`Convert ${coin.name}`}
      className="market-crypto-row group relative flex w-full cursor-pointer items-center justify-between border-b border-border/50 p-3 text-left transition-[background-color,border-color,box-shadow] duration-200 last:border-0 hover:border-primary/30 hover:bg-primary/[0.07] hover:shadow-[inset_0_0_18px_rgba(8,123,255,0.12)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-primary/[0.1] sm:p-4"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/0 to-primary/0 group-hover:from-primary/[0.02] group-hover:to-transparent transition-all pointer-events-none" />
      <div className="flex items-center gap-3 sm:gap-4 relative z-10 min-w-0">
        {rank && <span className="text-xs font-bold text-muted-foreground w-4 hidden sm:block">{rank}</span>}
        <CryptoLogo symbol={coin.symbol} logoUrl={coin.image} size="sm" className="shadow-sm border border-border/50 bg-background shrink-0" />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground truncate">{coin.name}</span>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:block">{coin.symbol}</span>
          </div>
          <span className="text-[11px] text-muted-foreground sm:hidden uppercase font-semibold">{coin.symbol}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 relative z-10 shrink-0 pl-4">
        <span className="font-bold font-mono tracking-tight text-foreground text-sm sm:text-base">
          {formatMoney(coin.current_price)}
        </span>
        <span className={cn(
          "text-[12px] font-semibold flex items-center gap-0.5",
          isPositive ? "text-success" : "text-destructive"
        )}>
          {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
        </span>
      </div>
    </button>
  );
}

function MiniRankRow({ coin, rank }: { coin: CoinGeckoMarket; rank: number }) {
  const isPositive = coin.price_change_percentage_24h >= 0;
  
  return (
    <button
      type="button"
      onClick={() => requestMarketConvertSelection({
        id: coin.id,
        symbol: coin.symbol.trim().toUpperCase(),
      })}
      aria-label={`Convert ${coin.name}`}
      className="market-mini-row -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between rounded-lg border-b border-border/50 px-2 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200 last:border-0 last:pb-1 hover:border-primary/30 hover:bg-primary/[0.07] hover:shadow-[inset_0_0_16px_rgba(8,123,255,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-primary/[0.1]"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-bold text-muted-foreground w-3 shrink-0">{rank}</span>
        <CryptoLogo symbol={coin.symbol} logoUrl={coin.image} size="sm" className="shadow-sm border border-border/50 bg-background shrink-0 w-7 h-7" />
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-foreground text-sm truncate">{coin.name}</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{coin.symbol}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0 pl-2">
        <span className="font-bold font-mono tracking-tight text-foreground text-sm">
          {formatMoney(coin.current_price)}
        </span>
        <span className={cn(
          "text-[11px] font-semibold flex items-center gap-0.5",
          isPositive ? "text-success" : "text-destructive"
        )}>
          {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
        </span>
      </div>
    </button>
  );
}

function RankingListCard({ coins, title, type }: { coins: CoinGeckoMarket[]; title: string; type: 'gainers' | 'losers' }) {
  const Icon = type === 'gainers' ? TrendingUp : TrendingDown;
  
  return (
    <div className={cn(
      "market-ranking-card flex-none w-[300px] md:w-full min-w-0 p-5 rounded-2xl border border-border/60 bg-card shadow-sm relative overflow-hidden group",
      type === 'gainers' ? "market-ranking-card-gainers" : "market-ranking-card-losers",
    )}>
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-10 pointer-events-none transition-opacity group-hover:opacity-20",
        type === 'gainers' ? "bg-success" : "bg-destructive"
      )} />
      
      <div className="flex items-center justify-between mb-2 relative z-10">
        <span className={cn(
          "text-xs font-bold uppercase tracking-wider flex items-center gap-1.5",
          type === 'gainers' ? "text-success" : "text-destructive"
        )}>
          <Icon size={14} />
          {title}
        </span>
      </div>
      
      <div className="flex flex-col relative z-10">
        {coins.map((coin, idx) => (
          <MiniRankRow key={coin.id} coin={coin} rank={idx + 1} />
        ))}
      </div>
    </div>
  );
}

export function LiveMarketSection() {
  const { data: markets, isLoading, isError, isRefetchError, dataUpdatedAt } = useCryptoMarket(100);
  
  const { top10, topGainers, topLosers } = useMemo(() => {
    if (!markets) return { top10: [], topGainers: [], topLosers: [] };
    const sortedByChange = [...markets].sort((a, b) => 
      (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0)
    );
    return { 
      top10: markets.slice(0, 10),
      topGainers: sortedByChange.slice(0, 5), 
      topLosers: sortedByChange.reverse().slice(0, 5) 
    };
  }, [markets]);

  const staleness = Date.now() - dataUpdatedAt;
  const isStale = isRefetchError || (staleness > 10 * 60_000 && !isLoading);

  return (
    <section className="market-neon-section w-full max-w-[1440px] mx-auto px-4 md:px-8 py-16 md:py-24 relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-[#00d2ff]/5 via-[#3a7bd5]/5 to-[#8e2de2]/5 rounded-full blur-[100px] pointer-events-none" />
      
      {/* SECTION 1: Top 10 */}
      <div className="market-section-heading relative z-10 flex flex-col items-center text-center mb-10">
        <span className="market-section-kicker text-sm font-bold uppercase tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-[#00d2ff] via-[#3a7bd5] to-[#8e2de2] mb-3">
          TOP CRYPTO
        </span>
        <h2 className="market-section-title text-3xl md:text-4xl font-marketing font-extrabold tracking-tight mb-2">
          Top 10 Cryptocurrencies
        </h2>
        <p className="text-muted-foreground font-medium text-lg">by market capitalization</p>
        
        <div className="flex items-center gap-3 mt-4">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock size={14} /> 
            Updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '...'}
          </span>
          {isStale && (
            <span className="text-xs font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertCircle size={10} /> Data may be delayed
            </span>
          )}
        </div>
      </div>

      {isError && !markets ? (
        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-8 text-center flex flex-col items-center gap-3 relative z-10 max-w-3xl mx-auto mb-16">
          <AlertCircle className="text-destructive" size={32} />
          <h3 className="font-bold text-lg">Market data temporarily unavailable</h3>
          <p className="text-muted-foreground text-sm">We're having trouble reaching our market data provider. Please check back shortly.</p>
        </div>
      ) : (
        <>
          <div className="relative z-10 max-w-3xl mx-auto mb-6">
            <div className="market-top10-card bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              {isLoading && !markets ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-4 h-4 hidden sm:block" />
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="w-24 h-4" />
                        <Skeleton className="w-12 h-3" />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Skeleton className="w-20 h-4" />
                      <Skeleton className="w-12 h-3" />
                    </div>
                  </div>
                ))
              ) : (
                top10.map((coin, idx) => (
                  <MarketRow key={coin.id} coin={coin} rank={idx + 1} />
                ))
              )}
            </div>
          </div>
          
          <div className="relative z-10 text-center mb-20">
            <Link href="/market-rates" className="market-view-all-link group inline-flex items-center justify-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-[color,text-shadow,filter] duration-200">
              View All Cryptocurrencies
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* SECTION 2: 24 Hour Rankings */}
          <div className="market-rankings-section relative z-10 max-w-4xl mx-auto">
            <h3 className="market-rankings-title text-2xl font-bold tracking-tight mb-6 md:text-center">24 Hour Rankings</h3>
            
            <div className="flex md:grid md:grid-cols-2 gap-6 overflow-x-auto -mx-4 px-4 pb-4 md:mx-0 md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {isLoading && !markets ? (
                <>
                  <Skeleton className="flex-none w-[300px] md:w-full h-[320px] rounded-2xl" />
                  <Skeleton className="flex-none w-[300px] md:w-full h-[320px] rounded-2xl" />
                </>
              ) : (
                <>
                  <RankingListCard coins={topGainers} title="Top Gainers" type="gainers" />
                  <RankingListCard coins={topLosers} title="Top Losers" type="losers" />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
