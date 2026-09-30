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

export type TelegramManualSwapAddon = {
  key: string;
  name: string;
  description?: string;
  fixedAmount?: string;
  feeCurrency?: string;
  feeType?: "fixed" | "percentage";
  percentage?: string | null;
  selectionRule: "none" | "one" | "multiple";
  presentation: { group: string };
};

export type TelegramCanonicalSettlementOption = TelegramRouteOption & {
  assetId?: string;
  title?: string;
  direction?: string;
  executionMode?: string;
  networkTitle?: string;
  providerId?: string;
  fields?: unknown[];
};

export function telegramAssetNetworkKey(assetCode: string, routeNetwork: string) {
  return `${assetCode.trim().toUpperCase()}\0${routeNetwork.trim().toUpperCase()}`;
}

/** Presentation for the backend's canonical customer status values. */
export function telegramStatusLabel(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "awaiting funds": return "AWAITING FUNDS";
    case "payment detected": return "PAYMENT DETECTED";
    case "confirming": return "CONFIRMING";
    case "processing": return "PROCESSING";
    case "completed": return "DONE ✅";
    case "failed": return "FAILED";
    case "cancelled":
    case "canceled": return "CANCELLED";
    case "refunded": return "REFUNDED";
    case "expired": return "EXPIRED";
    default: return status;
  }
}

export function buildTelegramConvertOptions(
  instruments: TelegramConvertInstrument[],
  pairs: Array<{ fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string }>,
  canonicalOptions?: TelegramCanonicalSettlementOption[],
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
    const canonical = canonicalOptions?.find(option =>
      telegramAssetNetworkKey(option.assetCode, option.routeNetwork) === key,
    );
    if (canonicalOptions && !canonical) return [];
    return [{
      ...canonical,
      id: canonical?.id ?? `quickex:${instrument.slug}`,
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

export function telegramCallbackIndexes(data: string, prefix: string, indexCount = 1): number[] | undefined {
  if (!/^[a-z]+$/.test(prefix) || !Number.isSafeInteger(indexCount) || indexCount < 1) return undefined;
  const parts = data.split(":");
  if (parts.length !== indexCount + 1 || parts[0] !== prefix) return undefined;
  const indexes = parts.slice(1).map(part => /^(0|[1-9]\d*)$/.test(part) ? Number(part) : Number.NaN);
  return indexes.every(Number.isSafeInteger) ? indexes : undefined;
}

export function telegramFieldSkipIndex(data: string): number | undefined {
  return telegramCallbackIndexes(data, "fieldskip")?.[0];
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
  rateMode: "FLOATING" | "FIXED" = "FLOATING",
  selectedAddOnKeys: string[] = [],
) {
  return {
    type: mode === "convert" ? "instant" : "manual",
    ...routeFields(source, target),
    amount,
    rateMode,
    ...(mode === "swap"
      ? {
          sourceSettlementOptionId: source.id,
          targetSettlementOptionId: target.id,
          ...(selectedAddOnKeys.length ? { selectedAddOnKeys } : {}),
        }
      : {}),
  };
}

export function buildQuoteByReceivePayload(
  mode: "swap" | "convert",
  source: TelegramRouteOption,
  target: TelegramRouteOption,
  desiredReceiveAmount: number,
  rateMode: "FLOATING" | "FIXED" = "FLOATING",
  selectedAddOnKeys: string[] = [],
) {
  return {
    fromAsset: source.assetCode,
    fromNetwork: source.routeNetwork,
    toAsset: target.assetCode,
    toNetwork: target.routeNetwork,
    ...(mode === "swap"
      ? {
          sourceSettlementOptionId: source.id,
          targetSettlementOptionId: target.id,
          ...(selectedAddOnKeys.length ? { selectedAddOnKeys } : {}),
        }
      : {}),
    desiredReceiveAmount,
    rateMode,
  };
}

export function toggleTelegramManualSwapAddonSelection(
  selectedKeys: string[],
  key: string,
  addons: TelegramManualSwapAddon[],
) {
  const addon = addons.find(item => item.key === key);
  if (!addon || addon.selectionRule === "none") return selectedKeys;
  if (selectedKeys.includes(key)) return selectedKeys.filter(item => item !== key);
  const group = addon.presentation.group.trim().toLowerCase() || "default";
  const singleSelectionKeys = new Set(addons
    .filter(item =>
      (item.presentation.group.trim().toLowerCase() || "default") === group &&
      item.selectionRule === "one",
    )
    .map(item => item.key));
  if (addon.selectionRule === "one") {
    const groupKeys = new Set(addons
      .filter(item => (item.presentation.group.trim().toLowerCase() || "default") === group)
      .map(item => item.key));
    return [...selectedKeys.filter(item => !groupKeys.has(item)), key];
  }
  return [...new Set([...selectedKeys.filter(item => !singleSelectionKeys.has(item)), key])];
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
    if (requiredFieldActive(fields[index], values)) return index;
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
  const fields = (data.fields ?? quote?.requiredSettlementFields) as Array<{ key: string; type?: string }> | undefined;
  const values = (data.values && typeof data.values === "object" && !Array.isArray(data.values)
    ? data.values
    : {}) as Record<string, unknown>;
  const settlementDetails = Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const fieldType = fields?.find(field => field.key === key)?.type;
    return [
      key,
      typeof value === "string" &&
      value.trim() !== "" &&
      ["integer", "numeric", "decimal", "number"].includes(fieldType ?? "")
        ? Number(value)
        : value,
    ];
  }));
  const route = {
    fromAsset: source.assetCode,
    fromNetwork: source.routeNetwork,
    toAsset: target.assetCode,
    toNetwork: target.routeNetwork,
  };
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
    settlementDetails,
    ...(mode === "swap" ? {
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
      selectedAddOnKeys: Array.isArray(data.selectedAddOnKeys)
        ? data.selectedAddOnKeys
        : [],
    } : {}),
    quoteId: quote?.quoteId,
    clientRequestId: data.clientRequestId,
    rateMode: quote?.rateMode === "FIXED"
      ? "FIXED" as const
      : quote?.rateMode === "FLOATING"
        ? "FLOATING" as const
        : data.rateMode === "FIXED"
          ? "FIXED" as const
          : "FLOATING" as const,
  };
}