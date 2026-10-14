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
  return filterIndexedExchangeOptions(indexExchangeOptions(options), filter, query);
}

function searchableValues(option: ExchangeSearchOption) {
  return isExchangePaymentMethod(option)
    ? [option.title, option.assetCode, option.paymentMethodId, ...(option.searchAliases || [])]
    : [
        option.id, option.title, option.assetCode, option.routeNetwork,
        option.networkTitle, option.paymentMethodId, option.family,
        ...(option.searchAliases || []),
      ];
}

export function indexExchangeOptions<T extends ExchangeSearchOption>(options: T[]) {
  return options.map(option => ({
    option,
    // Keep fields separate: joining them would introduce cross-field matches.
    values: searchableValues(option)
      .filter(value => value != null)
      .map(value => normalizeExchangeSearchValue(String(value))),
  }));
}

export function filterIndexedExchangeOptions<T extends ExchangeSearchOption>(
  index: Array<{ option: T; values: string[] }>,
  filter: ExchangeOptionFilter,
  query: string,
): T[] {
  const normalizedQuery = normalizeExchangeSearchValue(query);
  return index.filter(({ option, values }) => {
    if (filter === 'crypto' && option.kind !== 'crypto-network') return false;
    if (filter === 'fiat' && !isExchangePaymentMethod(option)) return false;
    return !normalizedQuery || values.some(value => value.includes(normalizedQuery));
  }).map(({ option }) => option);
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

  return searchableValues(option).some(
    value => value != null && normalizeExchangeSearchValue(String(value)).includes(normalizedQuery),
  );
}