import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Search, ArrowUpRight, ArrowDownRight, Clock, AlertCircle } from 'lucide-react';
import { useCryptoMarket, formatMoney, type CoinGeckoMarket } from '@/hooks/use-crypto-market';
import { cn } from '@/components/shared-app-ui';
import { PublicShell } from '@/components/public-shell';
import { CryptoLogo } from '@/components/crypto-identity';
import { Skeleton } from '@/components/ui/skeleton';

export function MarketRatesPage() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const [, setLocation] = useLocation();
  const { data: markets, isLoading, isError, isRefetchError, dataUpdatedAt } = useCryptoMarket(250);
  const [search, setSearch] = useState('');
  
  const displayData = useMemo(() => {
    if (!markets) return [];
    if (!search.trim()) return markets;
    const lower = search.toLowerCase();
    return markets.filter(c => 
      c.name.toLowerCase().includes(lower) || 
      c.symbol.toLowerCase().includes(lower)
    );
  }, [markets, search]);

  const staleness = Date.now() - dataUpdatedAt;
  const isStale = isRefetchError || (staleness > 10 * 60_000 && !isLoading);

  return (
    <PublicShell>
      <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-4 md:px-8 py-12 md:py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl md:text-5xl font-marketing font-extrabold tracking-tight">{uiT("customer.me643cb2f90f0")}</h1>
            <p className="text-muted-foreground text-lg max-w-xl leading-relaxed">
              {uiT("customer.m7bb5c1601aa7")}{' '}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock size={14} /> 
                {' '}{uiT("customer.m3a5ecca188c0")}{' '}{dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '...'}
              </span>
              {isStale && (
                <span className="text-xs font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertCircle size={10} /> {' '}{uiT("customer.m0a909aed3ead")}{' '}</span>
              )}
            </div>
          </div>
          
          <div className="relative w-full md:w-72 shrink-0">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              aria-label={uiT("customer.ma22df90c5655")}
              placeholder={uiT("customer.mf64139258a09")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card border border-border/60 rounded-full h-12 pl-11 pr-4 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
            />
          </div>
        </div>

        {isError && !markets ? (
          <div className="bg-destructive/5 border border-destructive/20 rounded-3xl p-12 text-center flex flex-col items-center gap-4">
            <AlertCircle className="text-destructive" size={48} />
            <h3 className="font-bold text-xl">{uiT("customer.m484af7d6efa5")}</h3>
            <p className="text-muted-foreground max-w-md">{uiT("customer.m81c5fca6f708")}</p>
          </div>
        ) : (
          <div className="bg-card border border-border/60 rounded-3xl shadow-sm overflow-hidden flex flex-col relative z-10">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/30 border-b border-border/60">
                  <tr>
                    <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs w-16">#</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs min-w-[200px]">{uiT("customer.m80d298c9f240")}</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs text-right">{uiT("customer.m93c91c851e7a")}</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs text-right">{uiT("customer.m66f9b755298c")}</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs text-right hidden sm:table-cell">{uiT("customer.mfb25999766b1")}</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs text-right hidden md:table-cell">{uiT("customer.m03fba4e9f0e2")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {isLoading && !markets ? (
                    Array.from({ length: 15 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-6 py-4"><Skeleton className="w-4 h-4" /></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                            <div className="flex flex-col gap-1.5">
                              <Skeleton className="w-24 h-4" />
                              <Skeleton className="w-10 h-3" />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4"><Skeleton className="w-20 h-4 ml-auto" /></td>
                        <td className="px-6 py-4"><Skeleton className="w-16 h-4 ml-auto" /></td>
                        <td className="px-6 py-4 hidden sm:table-cell"><Skeleton className="w-24 h-4 ml-auto" /></td>
                        <td className="px-6 py-4 hidden md:table-cell"><Skeleton className="w-24 h-4 ml-auto" /></td>
                      </tr>
                    ))
                  ) : displayData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        {uiT("customer.m7cb13c97df06")}{uiText(search)}"
                      </td>
                    </tr>
                  ) : (
                    displayData.map((coin, idx) => {
                      const isPositive = coin.price_change_percentage_24h >= 0;
                      const openConvert = () => setLocation(`/convert?asset=${encodeURIComponent(coin.symbol.trim().toUpperCase())}`);
                      return (
                        <tr
                          key={coin.id}
                          role="link"
                          tabIndex={0}
                          aria-label={uiT("customer.mb5e041dac867", { v0: coin.name })}
                          onClick={openConvert}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openConvert();
                            }
                          }}
                          className="cursor-pointer hover:bg-primary/[0.04] hover:shadow-[inset_0_0_18px_rgba(8,123,255,0.08)] focus-visible:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 transition-[background-color,box-shadow] duration-200 group"
                        >
                          <td className="px-6 py-4 font-semibold text-muted-foreground">{coin.market_cap_rank || idx + 1}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <CryptoLogo symbol={coin.symbol} logoUrl={coin.image} size="sm" className="shadow-sm bg-background border border-border/50" />
                              <div className="flex flex-col">
                                <span className="font-bold text-foreground">{uiText(coin.name)}</span>
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase">{coin.symbol}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold font-mono tracking-tight text-foreground">{formatMoney(coin.current_price)}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={cn(
                              "inline-flex items-center justify-end gap-1 font-semibold",
                              isPositive ? "text-success" : "text-destructive"
                            )}>
                              {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                              {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right hidden sm:table-cell">
                            <span className="font-semibold text-muted-foreground font-mono">{formatMoney(coin.market_cap)}</span>
                          </td>
                          <td className="px-6 py-4 text-right hidden md:table-cell">
                            <span className="font-semibold text-muted-foreground font-mono">{formatMoney(coin.total_volume)}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
