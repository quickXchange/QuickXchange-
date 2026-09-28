export function normalizeExchangeSearchValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export type ExchangeSearchOption = {
  id?: string | null;
  kind?: string | null;
  title?: string | null;
  assetCode?: string | null;
  routeNetwork?: string | null;
  networkTitle?: string | null;
  paymentMethodId?: string | null;
  family?: string | null;
  searchAliases?: string[];
};

export type ExchangeOptionFilter = 'all' | 'crypto' | 'fiat';

export function isExchangePaymentMethod(option: ExchangeSearchOption): boolean {
  return option.kind === 'payment-method' || option.kind === 'fiat-payment-method';
}

export function filterExchangeOptions<T extends ExchangeSearchOption>(
  options: T[],
  filter: ExchangeOptionFilter,
  query: string,
): T[] {
  return options.filter(option => {
    if (filter === 'crypto' && option.kind !== 'crypto-network') return false;
    if (filter === 'fiat' && !isExchangePaymentMethod(option)) return false;
    return exchangeOptionMatchesSearch(option, query);
  });
}

export function exchangeSelectorEmptyMessage(filter: ExchangeOptionFilter): string {
  return filter === 'fiat' ? 'No payment methods found' : 'No matching options found.';
}

export function exchangeOptionMatchesSearch(
  option: ExchangeSearchOption,
  query: string,
): boolean {
  const normalizedQuery = normalizeExchangeSearchValue(query);
  if (!normalizedQuery) return true;

  const searchableValues = isExchangePaymentMethod(option)
    ? [
        option.title,
        option.assetCode,
        option.paymentMethodId,
        ...(option.searchAliases || []),
      ]
    : [
        option.id,
        option.title,
        option.assetCode,
        option.routeNetwork,
        option.networkTitle,
        option.paymentMethodId,
        option.family,
        ...(option.searchAliases || []),
      ];

  return searchableValues.some(
    value => value != null && normalizeExchangeSearchValue(String(value)).includes(normalizedQuery),
  );
}