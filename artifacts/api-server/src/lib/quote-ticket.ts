import { createHmac, timingSafeEqual } from "node:crypto";
import { QuickexApiError, type QuickexQuote, type QuickexRateMode } from "./quickex";

export type QuoteTicket = {
  v: 1 | 2;
  type: "instant" | "manual";
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  amount: number;
  receiveAmount: number;
  rate: number;
  fee: number;
  paymentMethod?: string;
  payoutMethod?: string;
  sourceSettlementOptionId?: string;
  targetSettlementOptionId?: string;
  settlementSnapshot?: {
    source: SettlementOptionSnapshot;
    target: SettlementOptionSnapshot;
    route: {
      minAmount: string | null;
      maxAmount: string | null;
      operatorInstructions: string | null;
      customerInstructions: string | null;
      expectedSettlementMinutes: number | null;
    };
    requiredFields: Array<{
      key: string;
      type: "short-text" | "long-text" | "integer" | "numeric" | "decimal" | "account-iban" | "phone" | "email" | "date" | "select" | "wallet-address" | "memo-tag" | "private-image" | "text" | "number" | "textarea";
      label: string;
      help?: string;
      options?: Array<{ value: string; label: string }>;
      required?: boolean;
      min?: number;
      max?: number;
      pattern?: string;
    }>;
    funding?: {
      address: string; memo: string; requiresMemo: boolean; requiredConfirmations: number;
      confirmationGuidance: string; instructions: string; warning: string;
    };
  };
  manualOrderCreationDisabled?: boolean;
  pricingRuleId?: string;
  pricingRuleVersion?: number;
  pricingRuleName?: string;
  grossMarketAmount?: number;
  percentageCommission?: number;
  fixedCommission?: number;
  totalFee?: number;
  pricingSnapshot?: {
    policyVersion: "manual-desk-pricing-v1";
    rule: {
      id: string;
      version: number;
      name: string;
      selectors: {
        sourceAsset: string | null;
        targetAsset: string | null;
        sourceNetwork: string | null;
        targetNetwork: string | null;
        paymentMethod: string | null;
        payoutMethod: string | null;
        sourceSettlementOptionId?: string | null;
        targetSettlementOptionId?: string | null;
      };
      markupBasisPoints: number;
      exactRate?: string | null;
      effectiveRateSource?: "direct" | "reciprocal";
      configuredSelectors?: Record<string, string | null>;
      fixedFee: string | null;
    };
    context: {
      sourceAsset: string;
      targetAsset: string;
      sourceNetwork: string;
      targetNetwork: string;
      paymentMethod: string;
      payoutMethod: string;
    };
    reference: {
      source: PricingReferenceLeg;
      target: PricingReferenceLeg;
      executionProvider: "Manual desk";
      mode?: "market" | "exact-path";
    };
    targetPrecision: number;
    rounding: {
      grossMarketAmount: "truncate";
      percentageCommission: "ceil";
      fixedCommission: "ceil";
      finalRate: "truncate";
      finalRateScale: 30;
    };
    amounts: {
      grossMarketAmount: string;
      percentageCommission: string;
      fixedCommission: string;
      totalFee: string;
      receiveAmount: string;
      finalRate: string;
    };
  };
  minAmount?: number;
  maxAmount?: number;
  provider: string;
  expiresAt: number;
  rateMode?: QuickexRateMode;
  quickexQuote?: QuickexQuote;
};
type SettlementOptionSnapshot = {
  id: string;
  assetId: string;
  assetCode: string;
  kind: "fiat-payment-method" | "crypto-network";
  title: string;
  minAmount?: string | null;
  maxAmount?: string | null;
  networkId?: string;
  networkCode?: string;
  networkName?: string;
  requiresMemo?: boolean;
  instructions?: string;
  warning?: string;
};
function validSettlementSnapshot(snapshot: unknown): snapshot is NonNullable<QuoteTicket["settlementSnapshot"]> {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const value = snapshot as NonNullable<QuoteTicket["settlementSnapshot"]>;
  const validOption = (option: unknown) => Boolean(option && typeof option === "object" &&
    ["id", "assetId", "assetCode", "kind", "title"].every((key) =>
      typeof (option as Record<string, unknown>)[key] === "string" &&
      Boolean((option as Record<string, unknown>)[key])) &&
    ["fiat-payment-method", "crypto-network"].includes(
      (option as Record<string, string>).kind,
    ) &&
    ["minAmount", "maxAmount"].every((key) => {
      const amount = (option as Record<string, unknown>)[key];
      return amount === undefined || amount === null || typeof amount === "string";
    }));
  const validField = (field: unknown) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) return false;
    const value = field as Record<string, unknown>;
    return typeof value.key === "string" && Boolean(value.key) &&
      typeof value.label === "string" && Boolean(value.label) &&
      [
        "short-text", "long-text", "integer", "numeric", "decimal",
        "account-iban", "account-number", "account-name", "bank-code",
        "routing-number", "country-code", "postal-address", "phone",
        "email", "date", "select", "wallet-address", "memo-tag",
        "private-image", "text", "number", "textarea",
      ].includes(String(value.type)) &&
      (value.help === undefined || typeof value.help === "string") &&
      (value.required === undefined || typeof value.required === "boolean") &&
      (value.min === undefined || typeof value.min === "number") &&
      (value.max === undefined || typeof value.max === "number") &&
      (value.pattern === undefined || typeof value.pattern === "string") &&
      (value.options === undefined || Array.isArray(value.options) &&
        value.options.every((option) => option && typeof option === "object" &&
          typeof (option as Record<string, unknown>).value === "string" &&
          typeof (option as Record<string, unknown>).label === "string"));
  };
  return validOption(value.source) && validOption(value.target) &&
    value.route !== null && typeof value.route === "object" &&
    ["minAmount", "maxAmount", "operatorInstructions", "customerInstructions",
      "expectedSettlementMinutes"].every((key) => {
      const entry = (value.route as Record<string, unknown>)[key];
      return entry === null || (key === "expectedSettlementMinutes"
        ? Number.isInteger(entry) && (entry as number) > 0
        : typeof entry === "string");
    }) &&
    Array.isArray(value.requiredFields) && value.requiredFields.every(validField) &&
    (value.funding === undefined || Boolean(value.funding && typeof value.funding === "object" &&
      typeof (value.funding as Record<string, unknown>).address === "string" &&
      typeof (value.funding as Record<string, unknown>).memo === "string"));
}
type PricingReferenceLeg = {
  currency: string;
  unitsPerUsd: string;
  provider: "1Forge" | "manual" | "Coinbase" | "USD identity" | "test adapter";
  source: string;
  observedAt: string;
  timestampKind: "upstreamObservedAt" | "fetchedAt";
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new QuickexApiError(
      "QUOTE_NOT_CONFIGURED",
      "Quote signing is not configured.",
      503,
    );
  }
  return value;
}

function signature(encoded: string) {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

export function signQuoteTicket(ticket: QuoteTicket): string {
  const encoded = Buffer.from(JSON.stringify(ticket), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

function invalid(
  code: "QUOTE_INVALID" | "QUOTE_EXPIRED" | "QUOTE_MISMATCH",
  message: string,
): never {
  throw new QuickexApiError(code, message, code === "QUOTE_EXPIRED" ? 410 : 400);
}

function validReference(
  leg: PricingReferenceLeg,
  currency: string,
  decimal: (value: unknown) => boolean,
  mode: "market" | "exact-path" = "market",
) {
  return Boolean(
    leg &&
    leg.currency === currency &&
    decimal(leg.unitsPerUsd) &&
    ["1Forge", "manual", "Coinbase", "USD identity", "test adapter"].includes(leg.provider) &&
    typeof leg.source === "string" && leg.source &&
    ["upstreamObservedAt", "fetchedAt"].includes(leg.timestampKind) &&
    Number.isFinite(Date.parse(leg.observedAt)) &&
    (currency === "USD" && mode !== "exact-path"
      ? leg.provider === "USD identity" && leg.unitsPerUsd === "1"
      : leg.provider !== "USD identity"),
  );
}

type Dec = { c: bigint; s: number };
function dec(value: string): Dec | undefined {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (!match) return undefined;
  let c = BigInt(`${match[1]}${match[2] ?? ""}`);
  let s = (match[2] ?? "").length;
  while (s && c % 10n === 0n) { c /= 10n; s--; }
  return { c, s };
}
function atomic(c: bigint, precision: number) {
  let s = precision;
  while (s && c % 10n === 0n) { c /= 10n; s--; }
  const digits = c.toString().padStart(s + 1, "0");
  return s ? `${digits.slice(0, -s)}.${digits.slice(-s)}` : digits;
}
function financiallyConsistent(
  ticket: QuoteTicket,
  snapshot: NonNullable<QuoteTicket["pricingSnapshot"]>,
  canonical: (value: unknown) => boolean,
) {
  const amount = dec(String(ticket.amount));
  const source = dec(snapshot.reference.source.unitsPerUsd);
  const target = dec(snapshot.reference.target.unitsPerUsd);
  const fixed = snapshot.rule.fixedFee === null ? { c: 0n, s: 0 } : dec(snapshot.rule.fixedFee);
  if (!amount || !source || !target || !fixed) return false;
  const precision = snapshot.targetPrecision;
  const scale = 10n ** BigInt(precision);
  const gross = (amount.c * target.c * (10n ** BigInt(source.s)) * scale) /
    (source.c * (10n ** BigInt(amount.s + target.s)));
  const percentage = (gross * BigInt(snapshot.rule.markupBasisPoints) + 9_999n) / 10_000n;
  const fixedAtomic = (fixed.c * scale + (10n ** BigInt(fixed.s)) - 1n) /
    (10n ** BigInt(fixed.s));
  const total = percentage + fixedAtomic;
  if (gross <= total) return false;
  const receive = gross - total;
  const finalRateAtomic =
    (receive * (10n ** BigInt(amount.s + snapshot.rounding.finalRateScale))) /
    ((10n ** BigInt(precision)) * amount.c);
  const finalRate = atomic(finalRateAtomic, snapshot.rounding.finalRateScale);
  const values = snapshot.amounts;
  if (
    values.grossMarketAmount !== atomic(gross, precision) ||
    values.percentageCommission !== atomic(percentage, precision) ||
    values.fixedCommission !== atomic(fixedAtomic, precision) ||
    values.totalFee !== atomic(total, precision) ||
    values.receiveAmount !== atomic(receive, precision) ||
    values.finalRate !== finalRate
  ) return false;
  return [values.grossMarketAmount, values.percentageCommission, values.fixedCommission,
    values.totalFee, values.receiveAmount, values.finalRate].every(canonical) &&
    Number(values.grossMarketAmount) === ticket.grossMarketAmount &&
    Number(values.percentageCommission) === ticket.percentageCommission &&
    Number(values.fixedCommission) === ticket.fixedCommission &&
    Number(values.totalFee) === ticket.totalFee &&
    Number(values.receiveAmount) === ticket.receiveAmount &&
    Number(values.finalRate) === ticket.rate;
}

export function verifyQuoteTicket(
  quoteId: string,
  expected: Pick<
    QuoteTicket,
    "type" | "fromAsset" | "fromNetwork" | "toAsset" | "toNetwork" | "amount" |
     "rateMode" | "paymentMethod" | "payoutMethod" |
     "sourceSettlementOptionId" | "targetSettlementOptionId"
  >,
): QuoteTicket {
  const [encoded, supplied, extra] = quoteId.split(".");
  if (!encoded || !supplied || extra) invalid("QUOTE_INVALID", "The quote ticket is invalid.");
  const calculated = signature(encoded);
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  const calculatedBuffer = Buffer.from(calculated, "utf8");
  if (
    suppliedBuffer.length !== calculatedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, calculatedBuffer)
  ) {
    invalid("QUOTE_INVALID", "The quote ticket is invalid.");
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid("QUOTE_INVALID", "The quote ticket is invalid.");
  }
  if (!value || typeof value !== "object") invalid("QUOTE_INVALID", "The quote ticket is invalid.");
  const ticket = value as QuoteTicket;
  if (
    ![1, 2].includes(ticket.v) ||
    !["instant", "manual"].includes(ticket.type) ||
    !Number.isFinite(ticket.amount) ||
    !Number.isFinite(ticket.receiveAmount) ||
    !Number.isFinite(ticket.rate) ||
    !Number.isFinite(ticket.fee) ||
    !Number.isFinite(ticket.expiresAt) ||
    (ticket.rateMode !== undefined && !["FLOATING", "FIXED"].includes(ticket.rateMode)) ||
    typeof ticket.provider !== "string"
  ) {
    invalid("QUOTE_INVALID", "The quote ticket is invalid.");
  }
  if (ticket.expiresAt <= Date.now()) invalid("QUOTE_EXPIRED", "The quote has expired.");
  for (const field of ["type", "fromAsset", "fromNetwork", "toAsset", "toNetwork", "amount"] as const) {
    if (ticket[field] !== expected[field]) {
      invalid("QUOTE_MISMATCH", "The order does not match the quoted route and amount.");
    }
  }
  if (ticket.type === "manual") {
    if (ticket.v === 2) {
      if (
        !ticket.sourceSettlementOptionId ||
        !ticket.targetSettlementOptionId ||
        ticket.sourceSettlementOptionId !== expected.sourceSettlementOptionId ||
        ticket.targetSettlementOptionId !== expected.targetSettlementOptionId ||
        !validSettlementSnapshot(ticket.settlementSnapshot) ||
        ticket.settlementSnapshot.source.id !== ticket.sourceSettlementOptionId ||
        ticket.settlementSnapshot.target.id !== ticket.targetSettlementOptionId ||
        !["fiat-payment-method", "crypto-network"].includes(ticket.settlementSnapshot.source.kind) ||
        !["fiat-payment-method", "crypto-network"].includes(ticket.settlementSnapshot.target.kind) ||
        (ticket.settlementSnapshot.source.kind !== "fiat-payment-method" &&
          ticket.settlementSnapshot.target.kind !== "fiat-payment-method")
      ) {
        invalid("QUOTE_MISMATCH", "The order settlement options do not match the quote.");
      }
    }
    for (const field of ["paymentMethod", "payoutMethod"] as const) {
      const normalize = (value: string | undefined) => value?.trim().toUpperCase() ?? "";
      if (normalize(ticket[field]) !== normalize(expected[field])) {
        invalid("QUOTE_MISMATCH", "The order payment and payout methods do not match the quote.");
      }
    }
    if (
      !ticket.pricingRuleId ||
      !Number.isInteger(ticket.pricingRuleVersion) ||
      !ticket.pricingRuleName ||
      !Number.isFinite(ticket.grossMarketAmount) ||
      !Number.isFinite(ticket.percentageCommission) ||
      !Number.isFinite(ticket.fixedCommission) ||
      !Number.isFinite(ticket.totalFee) ||
      !ticket.pricingSnapshot
    ) {
      invalid("QUOTE_INVALID", "The manual quote pricing snapshot is invalid.");
    }
    const snapshot = ticket.pricingSnapshot!;
    const canonicalDecimal = (value: unknown) =>
      typeof value === "string" && /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value);
    const normalize = (value: string | undefined) => value?.trim().toUpperCase() ?? "";
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value);
    if (
      !isRecord(snapshot) ||
      !isRecord(snapshot.rule) ||
      !isRecord(snapshot.rule.selectors) ||
      !isRecord(snapshot.context) ||
      !isRecord(snapshot.reference) ||
      !isRecord(snapshot.rounding) ||
      !isRecord(snapshot.amounts)
    ) {
      invalid("QUOTE_INVALID", "The manual quote pricing snapshot is invalid.");
    }
    if (
      snapshot.policyVersion !== "manual-desk-pricing-v1" ||
      typeof snapshot.rule.id !== "string" ||
      !snapshot.rule.id ||
      typeof snapshot.rule.name !== "string" ||
      !snapshot.rule.name ||
      snapshot.rule.id !== ticket.pricingRuleId ||
      snapshot.rule.version !== ticket.pricingRuleVersion ||
      snapshot.rule.name !== ticket.pricingRuleName ||
      !Number.isInteger(snapshot.rule.markupBasisPoints) ||
      snapshot.rule.markupBasisPoints < 0 ||
      snapshot.rule.markupBasisPoints > 10_000 ||
      (snapshot.rule.fixedFee !== null && !canonicalDecimal(snapshot.rule.fixedFee)) ||
      !Number.isInteger(snapshot.targetPrecision) ||
      snapshot.targetPrecision < 0 ||
      snapshot.targetPrecision > 8 ||
      snapshot.rounding.grossMarketAmount !== "truncate" ||
      snapshot.rounding.percentageCommission !== "ceil" ||
      snapshot.rounding.fixedCommission !== "ceil" ||
      snapshot.rounding.finalRate !== "truncate" ||
      snapshot.rounding.finalRateScale !== 30 ||
      snapshot.reference.executionProvider !== "Manual desk" ||
      !validReference(snapshot.reference.source, snapshot.context.sourceAsset, canonicalDecimal, snapshot.reference.mode) ||
      !validReference(snapshot.reference.target, snapshot.context.targetAsset, canonicalDecimal, snapshot.reference.mode) ||
      Object.values(snapshot.amounts).some(value => !canonicalDecimal(value)) ||
      ["sourceAsset", "targetAsset", "sourceNetwork", "targetNetwork", "paymentMethod", "payoutMethod"]
        .some(key => {
          const value = snapshot.rule.selectors[key as keyof typeof snapshot.rule.selectors];
          return value !== null && typeof value !== "string";
        }) ||
      Object.values(snapshot.context).some(value => typeof value !== "string") ||
      ["sourceAsset", "targetAsset", "sourceNetwork", "targetNetwork", "paymentMethod", "payoutMethod"]
        .some(key => {
          const selector = snapshot.rule.selectors[key as keyof typeof snapshot.rule.selectors];
          const context = snapshot.context[key as keyof typeof snapshot.context];
          return selector !== null &&
            normalize(selector) !== normalize(String(context));
        }) ||
      snapshot.context.sourceAsset !== ticket.fromAsset ||
      snapshot.context.targetAsset !== ticket.toAsset ||
      snapshot.context.sourceNetwork !== ticket.fromNetwork ||
      snapshot.context.targetNetwork !== ticket.toNetwork ||
      normalize(snapshot.context.paymentMethod) !== normalize(ticket.paymentMethod) ||
      normalize(snapshot.context.payoutMethod) !== normalize(ticket.payoutMethod)
    ) {
      invalid("QUOTE_INVALID", "The manual quote pricing snapshot is invalid.");
    }
    if (!financiallyConsistent(ticket, snapshot, canonicalDecimal)) {
      invalid("QUOTE_INVALID", "The manual quote pricing snapshot is financially inconsistent.");
    }
  }
  if (
    ticket.type === "instant" &&
    ((ticket.rateMode ?? "FLOATING") !== (expected.rateMode ?? "FLOATING") ||
      ticket.sourceSettlementOptionId !== expected.sourceSettlementOptionId ||
      ticket.targetSettlementOptionId !== expected.targetSettlementOptionId)
  ) {
    invalid("QUOTE_MISMATCH", "The order does not match the quoted instant exchange route.");
  }
  return ticket;
}