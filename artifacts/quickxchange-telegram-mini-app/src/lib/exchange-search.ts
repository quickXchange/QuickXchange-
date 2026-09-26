export function normalizeExchangeSearchValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export type ExchangeSearchOption = {
  title?: string | null;
  assetCode?: string | null;
  routeNetwork?: string | null;
  networkTitle?: string | null;
  paymentMethodId?: string | null;
  searchAliases?: string[];
};

export function exchangeOptionMatchesSearch(
  option: ExchangeSearchOption,
  query: string,
): boolean {
  const normalizedQuery = normalizeExchangeSearchValue(query);
  if (!normalizedQuery) return true;

  return [
    option.title,
    option.assetCode,
    option.routeNetwork,
    option.networkTitle,
    option.paymentMethodId,
    ...(option.searchAliases || []),
  ].some(value => value != null && normalizeExchangeSearchValue(String(value)).includes(normalizedQuery));
}