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

type TelegramCollectedField = {
  key?: unknown;
  type?: unknown;
  enabled?: unknown;
};

function normalizedFieldKey(field: TelegramCollectedField): string {
  return String(field.key ?? "")
    .replace(/^(?:source|target)_/i, "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
}

function hasCollectedField(
  fields: TelegramCollectedField[],
  values: Record<string, unknown>,
  kind: "email" | "wallet",
): boolean {
  const aliases = kind === "email"
    ? new Set(["email", "customer_email", "contact_email"])
    : new Set(["address", "wallet_address", "destination_address", "recipient_address"]);
  return fields.some((field) => {
    if (field.enabled === false) return false;
    const type = String(field.type ?? "").toLowerCase();
    const key = normalizedFieldKey(field);
    if (kind === "email" ? type !== "email" && !aliases.has(key) : type !== "wallet-address" && !aliases.has(key)) {
      return false;
    }
    const value = values[String(field.key ?? "")];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function shouldAskConfiguredEmail(
  mode: "swap" | "convert",
  fields: TelegramCollectedField[] = [],
  values: Record<string, unknown> = {},
) {
  return mode === "convert" || !hasCollectedField(fields, values, "email");
}

export function shouldAskConfiguredDestination(
  mode: "swap" | "convert",
  target: TelegramRouteOption,
  fields: TelegramCollectedField[] = [],
  values: Record<string, unknown> = {},
) {
  return shouldAskDestination(mode, target) &&
    (mode === "convert" || !hasCollectedField(fields, values, "wallet"));
}

export function configuredContactValues(
  fields: TelegramCollectedField[],
  values: Record<string, unknown>,
) {
  let email: string | undefined;
  let destinationAddress: string | undefined;
  for (const field of fields) {
    if (field.enabled === false) continue;
    const value = values[String(field.key ?? "")];
    if (typeof value !== "string" || !value.trim()) continue;
    const key = normalizedFieldKey(field);
    const type = String(field.type ?? "").toLowerCase();
    if (!email && (type === "email" || ["email", "customer_email", "contact_email"].includes(key))) email = value.trim();
    if (!destinationAddress && (type === "wallet-address" || ["address", "wallet_address", "destination_address", "recipient_address"].includes(key))) destinationAddress = value.trim();
  }
  return { email, destinationAddress };
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
  fields: Array<{ enabled?: boolean; required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } }>,
  start: number,
  values: Record<string, unknown>,
) {
  for (let index = start; index < fields.length; index += 1) {
    if (fields[index].enabled === false) continue;
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
  const configured: { email?: string; destinationAddress?: string } = mode === "swap"
    ? configuredContactValues(
        (data.fields as TelegramCollectedField[] | undefined) ?? [],
        (data.values as Record<string, unknown> | undefined) ?? {},
      )
        : { email: undefined, destinationAddress: undefined };
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
    customerEmail: data.email ?? configured.email,
    customerName: data.customerName,
    destinationAddress: data.destinationAddress ??
      (mode === "swap"
        ? configuredContactValues(
            (data.fields as TelegramCollectedField[] | undefined) ?? [],
            (data.values as Record<string, unknown> | undefined) ?? {},
          ).destinationAddress
        : undefined),
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