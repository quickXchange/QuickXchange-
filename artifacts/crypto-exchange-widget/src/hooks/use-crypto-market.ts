import { useQuery } from '@tanstack/react-query';

export type CoinGeckoMarket = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  roi: null;
  last_updated: string;
};

export const formatMoney = (value?: number, currency = 'USD') => {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency, 
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : 2 
  }).format(value);
};

export function useCryptoMarket(limit = 100) {
  return useQuery<CoinGeckoMarket[]>({
    queryKey: ['coingecko-markets'],
    queryFn: async () => {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h',
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch market data');
      }
      
      return response.json();
    },
    select: (markets) => markets.slice(0, limit),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
