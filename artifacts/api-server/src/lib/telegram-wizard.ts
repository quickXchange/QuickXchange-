export type TelegramRouteOption = {
  id: string;
  assetCode: string;
  routeNetwork: string;
  kind: string;
  requiresMemo?: boolean;
};

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
export function shouldAskRefund(source: TelegramRouteOption) {
  return source.kind === "crypto-network";
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
  const ids = new Set(pairs.filter(pair => pair.fromAsset === source.assetCode && pair.fromNetwork === source.routeNetwork)
    .map(pair => `${pair.toAsset}\0${pair.toNetwork}`));
  return allOptions.filter(option => ["receive", "both"].includes(option.direction) && ids.has(`${option.assetCode}\0${option.routeNetwork}`));
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
    refundAddress: data.refundAddress,
    refundMemo: data.refundMemo,
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