export type ExchangeRouteSelection = {
  sourceId: string;
  targetId: string;
};

type ManualRoute = {
  sourceSettlementOptionId: string;
  targetSettlementOptionId: string;
};

type ManualSettlementOption = {
  id: string;
  direction: string;
};

export function getCanonicalManualRoutes<
  TRoute extends ManualRoute,
  TOption extends ManualSettlementOption,
>(
  routes: readonly TRoute[],
  options: readonly TOption[],
): TRoute[] {
  const optionsById = new Map(options.map((option) => [option.id, option]));
  return routes.filter((route) => {
    const source = optionsById.get(route.sourceSettlementOptionId);
    const target = optionsById.get(route.targetSettlementOptionId);
    return Boolean(
      source &&
      (source.direction === 'send' || source.direction === 'both') &&
      target &&
      (target.direction === 'receive' || target.direction === 'both'),
    );
  });
}

export function getManualRouteSourceIds(routes: readonly ManualRoute[]): Set<string> {
  return new Set(routes.map((route) => route.sourceSettlementOptionId));
}

export function getManualRouteTargetIds(
  routes: readonly ManualRoute[],
  sourceId: string,
): Set<string> {
  return new Set(
    routes
      .filter((route) => route.sourceSettlementOptionId === sourceId)
      .map((route) => route.targetSettlementOptionId),
  );
}

export type QuickexInstrumentLike = {
  slug: string;
  instrumentType: string;
  currencyTitle: string;
  networkTitle: string;
};

export type QuickexPairLike = {
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
};

export type QuickexConvertRoute<TInstrument extends QuickexInstrumentLike, TPair extends QuickexPairLike> = {
  sourceId: string;
  targetId: string;
  source: TInstrument;
  target: TInstrument;
  pair: TPair;
};

export function quickexInstrumentKey(asset: string, network: string): string {
  return `${asset.trim().toUpperCase()}\0${network.trim().toUpperCase()}`;
}

export function quickexQuoteMatchesRoute(
  quote: QuickexPairLike | null | undefined,
  source: { assetCode: string; routeNetwork: string } | undefined,
  target: { assetCode: string; routeNetwork: string } | undefined,
): boolean {
  if (!quote || !source || !target) return false;
  // Catalog titles and signed quote codes can differ in casing. Compare the
  // same exact asset/network identity used by the directed route resolver;
  // never collapse different networks or substitute network aliases.
  return quickexInstrumentKey(quote.fromAsset, quote.fromNetwork) ===
    quickexInstrumentKey(source.assetCode, source.routeNetwork) &&
    quickexInstrumentKey(quote.toAsset, quote.toNetwork) ===
    quickexInstrumentKey(target.assetCode, target.routeNetwork);
}

export function getQuickexConvertRoutes<
  TInstrument extends QuickexInstrumentLike,
  TPair extends QuickexPairLike,
>(
  instruments: readonly TInstrument[],
  pairs: readonly TPair[],
): QuickexConvertRoute<TInstrument, TPair>[] {
  const instrumentByKey = new Map<string, TInstrument>();
  for (const instrument of instruments) {
    if (
      instrument.instrumentType.toLowerCase() !== 'crypto' ||
      !instrument.currencyTitle.trim() ||
      !instrument.networkTitle.trim()
    ) continue;
    const key = quickexInstrumentKey(instrument.currencyTitle, instrument.networkTitle);
    if (!instrumentByKey.has(key)) instrumentByKey.set(key, instrument);
  }

  return pairs.flatMap((pair) => {
    const source = instrumentByKey.get(quickexInstrumentKey(pair.fromAsset, pair.fromNetwork));
    const target = instrumentByKey.get(quickexInstrumentKey(pair.toAsset, pair.toNetwork));
    if (!source || !target) return [];
    return [{
      sourceId: source.slug,
      targetId: target.slug,
      source,
      target,
      pair,
    }];
  });
}

export function findQuickexDefaultRoute<
  TInstrument extends QuickexInstrumentLike,
  TPair extends QuickexPairLike,
>(
  routes: readonly QuickexConvertRoute<TInstrument, TPair>[],
  defaultPair?: QuickexPairLike,
): QuickexConvertRoute<TInstrument, TPair> | undefined {
  if (!defaultPair) return routes[0];
  return routes.find((route) =>
    quickexInstrumentKey(route.pair.fromAsset, route.pair.fromNetwork) ===
      quickexInstrumentKey(defaultPair.fromAsset, defaultPair.fromNetwork) &&
    quickexInstrumentKey(route.pair.toAsset, route.pair.toNetwork) ===
      quickexInstrumentKey(defaultPair.toAsset, defaultPair.toNetwork),
  ) ?? routes[0];
}

export function resolveExchangeRouteSelection<TRoute extends ExchangeRouteSelection>(
  routes: readonly TRoute[],
  current: ExchangeRouteSelection | null,
  preferred?: ExchangeRouteSelection,
): TRoute | undefined {
  if (current) {
    const exact = routes.find((route) =>
      route.sourceId === current.sourceId && route.targetId === current.targetId,
    );
    if (exact) return exact;
    const remainingFromSource = routes.find((route) => route.sourceId === current.sourceId);
    if (remainingFromSource) return remainingFromSource;
  }

  if (preferred) {
    const preferredRoute = routes.find((route) =>
      route.sourceId === preferred.sourceId && route.targetId === preferred.targetId,
    );
    if (preferredRoute) return preferredRoute;
  }
  return routes[0];
}

export function parseExchangeQuoteAmount(value: string): number {
  if (!value.trim()) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function getExchangePricingTermsKey(
  pricing: {
    sourceSettlementOptionId: string;
    targetSettlementOptionId: string;
    fromAsset: string;
    toAsset: string;
    rate: number;
    minAmount?: number;
    maxAmount?: number;
    pricingRuleName: string;
    amountBasedPricingEnabled?: boolean;
    amountBasedPricingTiers?: unknown;
    pricingConfigurationFingerprint?: string;
  } | undefined,
  sourceId: string,
  targetId: string,
): string {
  if (
    !pricing ||
    pricing.sourceSettlementOptionId !== sourceId ||
    pricing.targetSettlementOptionId !== targetId
  ) return '';
  return JSON.stringify([
    pricing.fromAsset,
    pricing.toAsset,
    pricing.rate,
    pricing.minAmount ?? null,
    pricing.maxAmount ?? null,
    pricing.pricingRuleName,
    pricing.amountBasedPricingEnabled ?? false,
    pricing.amountBasedPricingTiers ?? [],
    pricing.pricingConfigurationFingerprint ?? null,
  ]);
}

export function clearQuotePreservingExchangeAmounts(state: {
  amount: string;
  desiredReceiveAmount: string;
  activeAmountSide: 'send' | 'receive';
}) {
  return { ...state, quoteData: null };
}