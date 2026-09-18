import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import {
  getGetQuickexPairsQueryKey,
  useGetQuickexConfig,
  useGetQuickexPairs,
  type QuickexPair,
  type QuickexInstrument,
} from '@workspace/api-client-react';
import { useCryptoMarket, type CoinGeckoMarket } from '@/hooks/use-crypto-market';
import { PublicShell } from '@/components/public-shell';
import { CryptoLogo, normalizeCryptoSymbol } from '@/components/crypto-identity';
import { requestMarketConvertSelection } from '@/lib/market-convert-selection';
import { cn, ErrorState, StatusPill } from '@/components/shared-app-ui';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap, TrendingUp, RefreshCw, ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';

const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDP', 'PYUSD', 'EURC']);
const TABLE_PAGE_SIZE = 50;

type DeduplicatedPair = {
  id: string;
  sourceSymbol: string;
  destSymbol: string;
  sourceInstrument: QuickexInstrument;
  destInstrument: QuickexInstrument;
  apiRoute: QuickexPair;
};

type PairMarketData = {
  rate: number | null;
  change24h: number | null;
  absChange: number;
};

const formatRate = (value: number | null) => {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : 2
  }).format(value);
};

function PairCardRow({ pair, marketData, onConvert }: { pair: DeduplicatedPair; marketData: PairMarketData; onConvert: () => void }) {
  const isPositive = marketData.change24h !== null && marketData.change24h >= 0;
  
  return (
    <div className="flex items-center justify-between p-3.5 hover:bg-muted/30 rounded-xl transition-colors group border border-transparent hover:border-border/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center -space-x-2">
          <CryptoLogo symbol={pair.sourceSymbol} logoUrl={pair.sourceInstrument.currencyLogoLink} size="sm" className="ring-2 ring-card relative z-10 shadow-sm" />
          <CryptoLogo symbol={pair.destSymbol} logoUrl={pair.destInstrument.currencyLogoLink} size="sm" className="ring-2 ring-card relative z-0 shadow-sm opacity-90" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-foreground text-sm tracking-tight truncate">{pair.sourceSymbol} / {pair.destSymbol}</span>
          <span className="max-w-[150px] truncate text-[10px] font-semibold uppercase tracking-wide text-primary/80">
            {pair.apiRoute.fromNetwork} → {pair.apiRoute.toNetwork}
          </span>
          <span className="max-w-[150px] truncate text-[11px] font-semibold text-muted-foreground">
            {marketData.rate !== null
              ? `1 ${pair.sourceSymbol} ≈ ${formatRate(marketData.rate)} ${pair.destSymbol}`
              : 'Live data unavailable'}
          </span>
          {marketData.change24h !== null && (
            <span className={cn("text-[11px] font-semibold", isPositive ? "text-success" : "text-destructive")}>
              {isPositive ? '+' : ''}{(marketData.change24h * 100).toFixed(2)}%
            </span>
          )}
        </div>
      </div>
      
      <button
        type="button"
        onClick={onConvert}
        className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 text-xs font-bold text-primary transition-all hover:border-primary/40 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Convert ${pair.sourceSymbol} to ${pair.destSymbol}`}
        data-testid={`btn-quick-convert-${pair.sourceSymbol}-${pair.destSymbol}`}
      >
        <Zap size={13} />
        Convert
      </button>
    </div>
  );
}

function CategoryCard({ 
  title, 
  icon: Icon,
  pairs, 
  marketDataMap,
  onConvert 
}: { 
  title: string; 
  icon: any;
  pairs: DeduplicatedPair[]; 
  marketDataMap: Map<string, PairMarketData>;
  onConvert: (pair: DeduplicatedPair) => void;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 3;
  const totalPages = Math.ceil(pairs.length / pageSize);
  
  const visiblePairs = pairs.slice(page * pageSize, (page + 1) * pageSize);

  const prev = () => setPage(p => Math.max(0, p - 1));
  const next = () => setPage(p => Math.min(totalPages - 1, p + 1));

  return (
    <div
      className="bg-card border border-[#258cff]/20 dark:border-[#438cff]/20 rounded-2xl shadow-[inset_0_0_24px_rgba(19,221,244,0.05),0_4px_12px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden h-[340px]"
      data-testid={`category-${title.toLowerCase().replaceAll(' ', '-')}`}
    >
      <div className="p-5 border-b border-border/50 flex items-center justify-between bg-muted/10">
        <div className="flex items-center gap-2.5 text-foreground">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Icon size={18} />
          </div>
          <h3 className="font-bold tracking-tight">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prev}
            disabled={page === 0}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-all"
            aria-label="Previous pairs"
            data-testid={`category-${title.toLowerCase().replaceAll(' ', '-')}-previous`}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-medium text-muted-foreground w-8 text-center">{page + 1} / {Math.max(1, totalPages)}</span>
          <button
            type="button"
            onClick={next}
            disabled={page >= totalPages - 1}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-all"
            aria-label="Next pairs"
            data-testid={`category-${title.toLowerCase().replaceAll(' ', '-')}-next`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1 overflow-y-auto">
        {pairs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <span className="text-muted-foreground text-sm">No pairs available for this category right now.</span>
          </div>
        ) : (
          visiblePairs.map(pair => (
            <PairCardRow 
              key={pair.id} 
              pair={pair} 
              marketData={marketDataMap.get(pair.id) || { rate: null, change24h: null, absChange: 0 }}
              onConvert={() => onConvert(pair)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function CryptoPairsPage() {
  const [, setLocation] = useLocation();
  const config = useGetQuickexConfig();
  const routes = useGetQuickexPairs(undefined, {
    query: {
      queryKey: getGetQuickexPairsQueryKey(),
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry: 2,
    },
  });
  const { data: markets } = useCryptoMarket(100);
  
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [destFilter, setDestFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [tablePage, setTablePage] = useState(0);

  useLayoutEffect(() => {
    const title = 'Crypto Pairs | QuickXchange';
    const description = 'Browse available QuickXchange Convert routes, filter crypto pairs, and continue with the selected pair in the Convert widget.';
    document.title = title;
    const setMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
      let meta = document.querySelector<HTMLMetaElement>(selector);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
  }, []);

  const { pairs: allPairs, marketDataMap, sourceOptions, destOptions, topCategories } = useMemo(() => {
    if (!routes.data || !config.data?.instruments) {
      return { 
        pairs: [], 
        marketDataMap: new Map<string, PairMarketData>(),
        sourceOptions: [] as string[],
        destOptions: [] as string[],
        topCategories: { popular: [], stable: [], trending: [] }
      };
    }

    const instrumentsBySymbolAndNetwork = new Map<string, QuickexInstrument>();
    for (const inst of config.data.instruments) {
      if (inst.instrumentType.toLowerCase() === 'crypto') {
        const key = `${inst.currencyTitle.trim().toUpperCase()}-${inst.networkTitle.trim().toUpperCase()}`;
        instrumentsBySymbolAndNetwork.set(key, inst);
      }
    }

    // Preserve each exact directed network route. Different networks for the
    // same symbols are distinct Convert routes and must remain selectable.
    const pairMap = new Map<string, DeduplicatedPair>();
    for (const pair of routes.data) {
      const srcSymbol = pair.fromAsset.trim().toUpperCase();
      const destSymbol = pair.toAsset.trim().toUpperCase();
      
      const id = [
        srcSymbol,
        pair.fromNetwork.trim().toUpperCase(),
        destSymbol,
        pair.toNetwork.trim().toUpperCase(),
      ].join('-');
      if (!pairMap.has(id)) {
        const srcKey = `${srcSymbol}-${pair.fromNetwork.trim().toUpperCase()}`;
        const destKey = `${destSymbol}-${pair.toNetwork.trim().toUpperCase()}`;
        const srcInst = instrumentsBySymbolAndNetwork.get(srcKey);
        const destInst = instrumentsBySymbolAndNetwork.get(destKey);
        
        if (srcInst && destInst) {
          pairMap.set(id, {
            id,
            sourceSymbol: srcSymbol,
            destSymbol: destSymbol,
            sourceInstrument: srcInst,
            destInstrument: destInst,
            apiRoute: pair
          });
        }
      }
    }

    const deduplicated = Array.from(pairMap.values());

    // Compute market data
    const mDataMap = new Map<string, PairMarketData>();
    const marketBySymbol = new Map<string, CoinGeckoMarket>();
    if (markets) {
      for (const m of markets) {
        marketBySymbol.set(normalizeCryptoSymbol(m.symbol), m);
      }
    }

    for (const pair of deduplicated) {
      const srcM = marketBySymbol.get(normalizeCryptoSymbol(pair.sourceSymbol));
      const destM = marketBySymbol.get(normalizeCryptoSymbol(pair.destSymbol));
      
      let rate: number | null = null;
      let change24h: number | null = null;
      
      if (srcM?.current_price && destM?.current_price && srcM.current_price > 0 && destM.current_price > 0) {
        rate = srcM.current_price / destM.current_price;
      }
      
      if (
        srcM?.price_change_percentage_24h !== undefined && srcM.price_change_percentage_24h !== null &&
        destM?.price_change_percentage_24h !== undefined && destM.price_change_percentage_24h !== null
      ) {
        const d = (1 + destM.price_change_percentage_24h / 100);
        if (d !== 0) {
          change24h = ((1 + srcM.price_change_percentage_24h / 100) / d) - 1;
        }
      }

      mDataMap.set(pair.id, {
        rate,
        change24h,
        absChange: change24h !== null ? Math.abs(change24h) : 0
      });
    }

    // Build categories
    const popular: DeduplicatedPair[] = [];
    const stable: DeduplicatedPair[] = [];
    const trending: DeduplicatedPair[] = [];

    // Helper to get rank
    const getRank = (p: DeduplicatedPair) => {
      const srcRank = marketBySymbol.get(normalizeCryptoSymbol(p.sourceSymbol))?.market_cap_rank || 999999;
      const destRank = marketBySymbol.get(normalizeCryptoSymbol(p.destSymbol))?.market_cap_rank || 999999;
      return srcRank + destRank; // lower sum = more popular generally
    };

    const sortedByRank = [...deduplicated].sort((a, b) => getRank(a) - getRank(b));
    
    // Popular Stablecoin Pairs: at least one side is stablecoin
    stable.push(...sortedByRank.filter(p => STABLECOINS.has(p.sourceSymbol) || STABLECOINS.has(p.destSymbol)));
    
    // Popular Crypto Pairs: non-stable/stable-mixed, just top overall
    popular.push(...sortedByRank.filter(p => !stable.includes(p) || (STABLECOINS.has(p.sourceSymbol) !== STABLECOINS.has(p.destSymbol))));

    // Trending: both 24h data values exist, ordered by absolute 24h move
    const withChange = deduplicated.filter(p => mDataMap.get(p.id)?.change24h !== null);
    withChange.sort((a, b) => (mDataMap.get(b.id)?.absChange || 0) - (mDataMap.get(a.id)?.absChange || 0));
    trending.push(...withChange);

    const sOptions = Array.from(new Set(deduplicated.map(p => p.sourceSymbol))).sort();
    const dOptions = Array.from(new Set(deduplicated.map(p => p.destSymbol))).sort();

    return { 
      pairs: deduplicated, 
      marketDataMap: mDataMap, 
      sourceOptions: sOptions,
      destOptions: dOptions,
      topCategories: {
        popular: popular.slice(0, 20),
        stable: stable.slice(0, 20),
        trending: trending.slice(0, 20)
      }
    };
  }, [config.data?.instruments, markets, routes.data]);

  const handleConvert = (pair: DeduplicatedPair) => {
    requestMarketConvertSelection({
      symbol: pair.sourceSymbol,
      sourceNetwork: pair.apiRoute.fromNetwork,
      destinationSymbol: pair.destSymbol,
      destinationNetwork: pair.apiRoute.toNetwork,
    }, setLocation);
  };

  const filteredPairs = useMemo(() => {
    return allPairs.filter(p => {
      if (sourceFilter !== 'ALL' && p.sourceSymbol !== sourceFilter) return false;
      if (destFilter !== 'ALL' && p.destSymbol !== destFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const str = `${p.sourceSymbol} ${p.destSymbol} ${p.sourceInstrument.fullName} ${p.destInstrument.fullName} ${p.sourceInstrument.currencyFriendlyTitle} ${p.destInstrument.currencyFriendlyTitle} ${p.sourceSymbol}/${p.destSymbol} ${p.sourceSymbol} / ${p.destSymbol}`.toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });
  }, [allPairs, sourceFilter, destFilter, search]);

  useEffect(() => {
    setTablePage(0);
  }, [sourceFilter, destFilter, search]);

  const tablePageCount = Math.max(1, Math.ceil(filteredPairs.length / TABLE_PAGE_SIZE));
  const visiblePairs = filteredPairs.slice(
    tablePage * TABLE_PAGE_SIZE,
    (tablePage + 1) * TABLE_PAGE_SIZE,
  );
  const firstVisiblePair = filteredPairs.length === 0 ? 0 : tablePage * TABLE_PAGE_SIZE + 1;
  const lastVisiblePair = Math.min(filteredPairs.length, (tablePage + 1) * TABLE_PAGE_SIZE);

  return (
    <PublicShell>
      <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-4 md:px-8 py-12 md:py-16" data-testid="crypto-pairs-page">
        
        {/* Hero */}
        <div className="flex flex-col items-center text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-sm mb-6 border border-primary/20">
            <Zap size={16} /> Available Convert Routes
          </div>
          <h1 className="text-4xl md:text-5xl font-marketing font-extrabold tracking-tight mb-4">
            Crypto <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#13ddf4] to-[#7a2cff]">Pairs</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
            Browse enabled crypto conversion routes and continue with your selected pair in the QuickXchange Convert flow.
          </p>
        </div>

        {config.isLoading || routes.isLoading ? (
          <div className="mb-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
          </div>
        ) : config.isError || routes.isError ? (
          <div className="mb-12">
            <ErrorState message="Unable to load pairs. Please try again later." />
          </div>
        ) : allPairs.length === 0 ? (
          <div className="mb-12 text-center p-12 bg-card rounded-3xl border border-border">
            <span className="text-muted-foreground font-medium">No conversion routes currently available.</span>
          </div>
        ) : (
          <>
            {/* Top Cards */}
            <div className="mb-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 fill-mode-both">
              <CategoryCard 
                title="Popular Crypto Pairs" 
                icon={TrendingUp} 
                pairs={topCategories.popular} 
                marketDataMap={marketDataMap}
                onConvert={handleConvert}
              />
              <CategoryCard 
                title="Popular Stablecoin Pairs" 
                icon={RefreshCw} 
                pairs={topCategories.stable} 
                marketDataMap={marketDataMap}
                onConvert={handleConvert}
              />
              <CategoryCard 
                title="Trending Crypto Pairs" 
                icon={Zap} 
                pairs={topCategories.trending} 
                marketDataMap={marketDataMap}
                onConvert={handleConvert}
              />
            </div>

            {/* Table Section */}
            <div className="flex flex-col relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both" id="all-pairs">
              <div className="mb-6">
                <h2 className="text-2xl font-marketing font-extrabold tracking-tight text-foreground md:text-3xl">All Available Crypto Pairs</h2>
                <p className="mt-2 text-sm text-muted-foreground md:text-base">Filter the enabled Convert routes published by QuickXchange.</p>
              </div>
              
              {/* Filters */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 p-4 rounded-2xl bg-card border border-border/60 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-4 flex-1">
                  <label className="flex flex-col gap-1.5 flex-1 max-w-[200px]">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Send</span>
                    <select 
                      value={sourceFilter}
                      onChange={e => setSourceFilter(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl h-11 px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                      data-testid="filter-send-asset"
                    >
                      <option value="ALL">All Assets</option>
                      {sourceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </label>
                  
                  <div className="hidden sm:flex items-end justify-center pb-3">
                    <TrendingUp size={16} className="text-muted-foreground/50" />
                  </div>

                  <label className="flex flex-col gap-1.5 flex-1 max-w-[200px]">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Receive</span>
                    <select 
                      value={destFilter}
                      onChange={e => setDestFilter(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl h-11 px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                      data-testid="filter-receive-asset"
                    >
                      <option value="ALL">All Assets</option>
                      {destOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </label>
                </div>

                <div className="relative w-full md:w-80 shrink-0">
                  <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    aria-label="Search pairs"
                    placeholder="Search pairs, e.g. BTC/ETH..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl h-11 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                    data-testid="input-search-pairs"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="bg-card border border-border/60 rounded-3xl shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap min-w-[700px]">
                    <thead className="bg-muted/30 border-b border-border/60">
                      <tr>
                        <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs w-[30%]">Pair</th>
                        <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs text-right w-[20%]">Rate / Price</th>
                        <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs text-right w-[20%]">24h Change</th>
                        <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs text-center w-[15%]">Status</th>
                        <th className="px-6 py-4 font-bold text-muted-foreground tracking-wider uppercase text-xs text-right w-[15%]">Convert</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredPairs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-16 text-center text-muted-foreground">
                            <Filter className="mx-auto mb-3 opacity-20" size={32} />
                            No conversion routes match your filters.
                          </td>
                        </tr>
                      ) : (
                        visiblePairs.map((pair) => {
                          const marketData = marketDataMap.get(pair.id);
                          const rate = marketData?.rate ?? null;
                          const change = marketData?.change24h ?? null;
                          const isPositive = change !== null && change >= 0;
                          const openConvert = () => handleConvert(pair);

                          return (
                            <tr
                              key={pair.id}
                              className="group hover:bg-primary/[0.03] transition-colors"
                              data-testid={`row-pair-${pair.id}`}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                  <div className="flex items-center -space-x-3">
                                    <CryptoLogo symbol={pair.sourceSymbol} logoUrl={pair.sourceInstrument.currencyLogoLink} size="md" className="ring-2 ring-card relative z-10 shadow-sm" />
                                    <CryptoLogo symbol={pair.destSymbol} logoUrl={pair.destInstrument.currencyLogoLink} size="md" className="ring-2 ring-card relative z-0 shadow-sm opacity-90" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-bold text-foreground text-[15px]">{pair.sourceSymbol} / {pair.destSymbol}</span>
                                    <span className="text-xs font-semibold text-muted-foreground">
                                      {pair.sourceInstrument.currencyFriendlyTitle || pair.sourceInstrument.fullName} to {pair.destInstrument.currencyFriendlyTitle || pair.destInstrument.fullName}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {rate !== null ? (
                                  <div className="flex flex-col items-end">
                                    <span className="font-bold font-mono tracking-tight text-foreground">
                                      1 {pair.sourceSymbol} = {formatRate(rate)} {pair.destSymbol}
                                    </span>
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mt-0.5">Live Ref Rate</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground font-medium">—</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {change !== null ? (
                                  <span className={cn(
                                    "inline-flex items-center justify-end font-bold px-2 py-1 rounded-md",
                                    isPositive ? "text-success bg-success/10" : "text-destructive bg-destructive/10"
                                  )}>
                                    {isPositive ? '+' : ''}{(change * 100).toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground font-medium">—</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex">
                                  <StatusPill status="Available" />
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={openConvert}
                                  className="inline-flex items-center justify-center gap-2 bg-foreground text-background font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-full hover:bg-primary hover:text-primary-foreground hover:shadow-[0_4px_12px_rgba(37,140,255,0.25)] transition-all transform active:scale-95"
                                  data-testid={`btn-convert-${pair.id}`}
                                >
                                  Convert
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredPairs.length > 0 && (
                  <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="text-xs font-semibold text-muted-foreground sm:text-sm" aria-live="polite">
                      Showing {firstVisiblePair.toLocaleString()}–{lastVisiblePair.toLocaleString()} of {filteredPairs.length.toLocaleString()} pairs
                    </p>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setTablePage(page => Math.max(0, page - 1))}
                        disabled={tablePage === 0}
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                        data-testid="pairs-table-previous"
                      >
                        <ChevronLeft size={15} />
                        Previous
                      </button>
                      <span className="min-w-14 text-center text-xs font-bold text-muted-foreground" data-testid="pairs-table-page">
                        {tablePage + 1} / {tablePageCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTablePage(page => Math.min(tablePageCount - 1, page + 1))}
                        disabled={tablePage >= tablePageCount - 1}
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                        data-testid="pairs-table-next"
                      >
                        Next
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </PublicShell>
  );
}
