export type TelegramRouteOption = {
  id: string;
  assetCode: string;
  routeNetwork: string;
  kind: string;
  requiresMemo?: boolean;
};

export type TelegramSearchableRouteOption = TelegramRouteOption & {
  title?: string;
  assetName?: string;
  networkTitle?: string;
  paymentMethodId?: string;
};

export type TelegramConvertInstrument = {
  slug: string;
  currencyTitle: string;
  networkTitle: string;
  instrumentType: string;
  fullName?: string;
  currencyFriendlyTitle?: string;
  requiresMemo?: boolean;
};

export function telegramAssetNetworkKey(assetCode: string, routeNetwork: string) {
  return `${assetCode.trim().toUpperCase()}\0${routeNetwork.trim().toUpperCase()}`;
}

export function buildTelegramConvertOptions(
  instruments: TelegramConvertInstrument[],
  pairs: Array<{ fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string }>,
) {
  const executableKeys = new Set<string>();
  for (const pair of pairs) {
    executableKeys.add(telegramAssetNetworkKey(pair.fromAsset, pair.fromNetwork));
    executableKeys.add(telegramAssetNetworkKey(pair.toAsset, pair.toNetwork));
  }
  const seen = new Set<string>();
  return instruments.flatMap(instrument => {
    if (
      instrument.instrumentType.trim().toLowerCase() !== "crypto" ||
      !instrument.currencyTitle.trim() ||
      !instrument.networkTitle.trim()
    ) return [];
    const key = telegramAssetNetworkKey(instrument.currencyTitle, instrument.networkTitle);
    if (!executableKeys.has(key) || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: `quickex:${instrument.slug}`,
      assetCode: instrument.currencyTitle,
      routeNetwork: instrument.networkTitle,
      kind: "crypto-network",
      direction: "both",
      executionMode: "api",
      title: instrument.fullName || instrument.currencyFriendlyTitle || instrument.currencyTitle,
      assetName: instrument.currencyFriendlyTitle || instrument.fullName || instrument.currencyTitle,
      networkTitle: instrument.networkTitle,
      requiresMemo: Boolean(instrument.requiresMemo),
    }];
  });
}

export function filterTelegramRouteOptions<T extends TelegramSearchableRouteOption>(
  options: T[],
  query: string,
): T[] {
  const terms = query
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return options;
  return options.filter(option => {
    const searchable = [
      option.assetCode,
      option.assetName,
      option.title,
      option.routeNetwork,
      option.networkTitle,
      option.paymentMethodId,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}

export function filterManualSourceOptions<T extends TelegramRouteOption & {
  direction: string;
  lifecycle?: string;
}>(
  options: T[],
  routes: Array<{ sourceSettlementOptionId: string }>,
): T[] {
  const availableSourceIds = new Set(routes.map(route => route.sourceSettlementOptionId));
  return options.filter(option =>
    ["send", "both"].includes(option.direction) &&
    availableSourceIds.has(option.id),
  );
}

export function telegramFieldSkipIndex(data: string): number | undefined {
  const match = /^fieldskip:(0|[1-9]\d*)$/.exec(data);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : undefined;
}

export function nextSourceAmountForReceiveTarget(
  sourceAmount: number,
  quotedReceiveAmount: number,
  requestedReceiveAmount: number,
): number | undefined {
  if (
    !Number.isFinite(sourceAmount) ||
    !Number.isFinite(quotedReceiveAmount) ||
    !Number.isFinite(requestedReceiveAmount) ||
    sourceAmount <= 0 ||
    quotedReceiveAmount <= 0 ||
    requestedReceiveAmount <= 0
  ) return undefined;
  const next = sourceAmount * requestedReceiveAmount / quotedReceiveAmount;
  if (!Number.isFinite(next) || next <= 0) return undefined;
  return Number(next.toPrecision(12));
}

export function routeFields(source: TelegramRouteOption, target: TelegramRouteOption) {
  return {
    fromAsset: source.assetCode,
    fromNetwork: source.routeNetwork,
    toAsset: target.assetCode,
    toNetwork: target.routeNetwork,
    sourceSettlementOptionId: source.id,
    targetSettlementOptionId: target.id,
  };
}

export function buildQuotePayload(
  mode: "swap" | "convert",
  source: TelegramRouteOption,
  target: TelegramRouteOption,
  amount: number,
) {
  return {
    type: mode === "convert" ? "instant" : "manual",
    ...routeFields(source, target),
    amount,
    rateMode: "FLOATING" as const,
    ...(mode === "swap"
      ? { sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id }
      : {}),
  };
}

export function shouldAskDestination(mode: "swap" | "convert", target: TelegramRouteOption) {
  return mode === "convert" || target.kind === "crypto-network";
}

export function withoutTelegramRefundFields<T extends Record<string, unknown>>(data: T): Omit<T, "refundAddress" | "refundMemo"> {
  const { refundAddress: _refundAddress, refundMemo: _refundMemo, ...safe } = data;
  return safe;
}

export function filterManualTargets(
  allOptions: Array<TelegramRouteOption & { direction: string }>,
  routes: Array<{ sourceSettlementOptionId: string; targetSettlementOptionId: string }>,
  sourceId: string,
) {
  const ids = new Set(routes.filter(route => route.sourceSettlementOptionId === sourceId).map(route => route.targetSettlementOptionId));
  return allOptions.filter(option => ["receive", "both"].includes(option.direction) && ids.has(option.id));
}

export function filterConvertTargets(
  allOptions: Array<TelegramRouteOption & { direction: string }>,
  pairs: Array<{ fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string }>,
  source: TelegramRouteOption,
) {
  const sourceKey = telegramAssetNetworkKey(source.assetCode, source.routeNetwork);
  const ids = new Set(pairs
    .filter(pair => telegramAssetNetworkKey(pair.fromAsset, pair.fromNetwork) === sourceKey)
    .map(pair => telegramAssetNetworkKey(pair.toAsset, pair.toNetwork)));
  return allOptions.filter(option =>
    ["receive", "both"].includes(option.direction) &&
    ids.has(telegramAssetNetworkKey(option.assetCode, option.routeNetwork))
  );
}

export function requiredFieldActive(
  field: { required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } },
  values: Record<string, unknown>,
) {
  if (field.requiredWhen) {
    const actual = String(values[field.requiredWhen.fieldKey] ?? "");
    const expected = Array.isArray(field.requiredWhen.equals)
      ? field.requiredWhen.equals
      : [field.requiredWhen.equals];
    if (!expected.includes(actual)) return false;
  }
  return field.required !== false;
}

export function nextRequiredField(
  fields: Array<{ required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } }>,
  start: number,
  values: Record<string, unknown>,
) {
  for (let index = start; index < fields.length; index += 1) {
    const condition = fields[index].requiredWhen;
    if (!condition) return index;
    const actual = String(values[condition.fieldKey] ?? "");
    const expected = Array.isArray(condition.equals) ? condition.equals : [condition.equals];
    if (expected.includes(actual)) return index;
  }
  return -1;
}

export function buildCreatePayload(
  mode: "swap" | "convert",
  source: TelegramRouteOption,
  target: TelegramRouteOption,
  data: Record<string, unknown>,
) {
  const quote = data.quote as Record<string, unknown> | undefined;
  const route = routeFields(source, target);
  const canonical = quote?.fromAsset && quote?.toAsset
    ? {
        fromAsset: quote.fromAsset,
        fromNetwork: quote.fromNetwork,
        toAsset: quote.toAsset,
        toNetwork: quote.toNetwork,
      }
    : {};
  return {
    type: mode === "convert" ? "instant" : "manual",
    ...route,
    ...canonical,
    amount: data.amount,
    customerEmail: data.email,
    customerName: data.customerName,
    destinationAddress: data.destinationAddress,
    destinationMemo: data.destinationMemo,
    ...(mode === "swap"
      ? {
          sourceSettlementOptionId: source.id,
          targetSettlementOptionId: target.id,
          settlementDetails: data.values,
        }
      : {}),
    quoteId: quote?.quoteId,
    clientRequestId: data.clientRequestId,
    rateMode: "FLOATING" as const,
  };
}