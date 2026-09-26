export function normalizeSelectorSearchValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function selectorOptionMatchesQuery(searchText: string, query: string): boolean {
  const normalizedQuery = normalizeSelectorSearchValue(query);
  return !normalizedQuery
    || normalizeSelectorSearchValue(searchText).includes(normalizedQuery);
}

type SettlementSearchIdentity = {
  assetCode: string;
  kind: string;
  title: string;
  paymentMethodId?: string;
  networkTitle?: string;
  networkSlug?: string;
  routeNetwork?: string;
};

/**
 * Search only the identity the customer sees for a settlement option.
 * Payment methods intentionally omit shared route/network metadata.
 */
export function settlementOptionSearchText(
  option: SettlementSearchIdentity,
  officialCryptoName?: string,
): string {
  const parts = option.kind === 'crypto-network'
    ? [
        option.assetCode,
        option.title,
        option.networkTitle,
        option.networkSlug,
        option.routeNetwork,
        officialCryptoName,
      ]
    : option.paymentMethodId
      ? [option.assetCode, option.title, option.paymentMethodId]
      : [option.assetCode, option.title];

  return parts.filter(Boolean).join(' ');
}

type ConvertSearchIdentity = {
  currencyTitle: string;
  networkTitle: string;
  fullName: string;
  currencyFriendlyTitle: string;
  slug: string;
};

export function convertInstrumentSearchText(option: ConvertSearchIdentity): string {
  return [
    option.currencyTitle,
    option.networkTitle,
    option.fullName,
    option.currencyFriendlyTitle,
    option.slug,
  ].filter(Boolean).join(' ');
}