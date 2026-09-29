import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  manualDeskPricingRulesTable,
  type ManualDeskPricingRule,
} from "@workspace/db";
import { ApiError } from "./api-error";

export const MANUAL_PRICING_SELECTOR_KEYS = [
  "sourceAsset",
  "sourceCryptoAssetId",
  "targetAsset",
  "targetCryptoAssetId",
  "sourceNetwork",
  "targetNetwork",
  "paymentMethod",
  "payoutMethod",
  "sourceSettlementOptionId",
  "targetSettlementOptionId",
] as const;
const SOURCE_PRICING_SELECTOR_KEYS = [
  "sourceAsset",
  "sourceCryptoAssetId",
  "sourceNetwork",
  "paymentMethod",
] as const;
const TARGET_PRICING_SELECTOR_KEYS = [
  "targetAsset",
  "targetCryptoAssetId",
  "targetNetwork",
  "payoutMethod",
] as const;
export type ManualPricingSelector = typeof MANUAL_PRICING_SELECTOR_KEYS[number];
export type ManualPricingContext =
  Partial<Record<ManualPricingSelector, string | null | undefined>>;
export const ALL_NETWORKS_PRICING_SELECTOR = "__ALL_NETWORKS__";
export type ManualPricingTier = {
  minAmount: string;
  maxAmount: string | null;
  percentage: string;
  direction: "MARKUP" | "GIVE_MORE";
  fixedFee?: string;
};

type ExactDecimal = { coefficient: bigint; scale: number };
function exactDecimal(value: string): ExactDecimal | undefined {
  const match = /^(0|[1-9][0-9]{0,19})(?:\.([0-9]{1,18}))?$/.exec(value);
  if (!match) return undefined;
  return { coefficient: BigInt(`${match[1]}${match[2] ?? ""}`), scale: (match[2] ?? "").length };
}

function compareExactDecimals(left: ExactDecimal, right: ExactDecimal): number {
  const scale = Math.max(left.scale, right.scale);
  const a = left.coefficient * 10n ** BigInt(scale - left.scale);
  const b = right.coefficient * 10n ** BigInt(scale - right.scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

function quoteAmountDecimal(value: string | number): ExactDecimal | undefined {
  const text = String(value);
  const plain = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(text);
  if (plain) {
    const fraction = plain[2] ?? "";
    return { coefficient: BigInt(`${plain[1]}${fraction}`), scale: fraction.length };
  }
  const exponential = /^([0-9]+)(?:\.([0-9]+))?[eE]([+-]?\d+)$/.exec(text);
  if (!exponential) return undefined;
  const exponent = Number(exponential[3]);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return undefined;
  const fraction = exponential[2] ?? "";
  let coefficient = BigInt(`${exponential[1]}${fraction}`);
  let scale = fraction.length - exponent;
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { coefficient, scale };
}

export function validateManualPricingTiers(
  enabled: boolean,
  tiers: readonly ManualPricingTier[],
) {
  if (typeof enabled !== "boolean" || !Array.isArray(tiers)) {
    throw new ApiError("VALIDATION_ERROR", "Amount-based pricing configuration is invalid.", 400);
  }
  if (enabled && tiers.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Enabled amount-based pricing requires at least one tier.", 400);
  }
  const parsed = tiers.map((tier, index) => {
    if (!tier || typeof tier !== "object" ||
        typeof tier.minAmount !== "string" ||
        !(tier.maxAmount === null || typeof tier.maxAmount === "string") ||
        typeof tier.percentage !== "string" ||
        (tier.fixedFee !== undefined && typeof tier.fixedFee !== "string") ||
        (tier.direction !== "MARKUP" && tier.direction !== "GIVE_MORE")) {
      throw new ApiError("VALIDATION_ERROR", `Amount tier ${index + 1} is invalid.`, 400);
    }
    const min = exactDecimal(tier.minAmount);
    const max = tier.maxAmount === null ? null : exactDecimal(tier.maxAmount);
    const percentage = exactDecimal(tier.percentage);
    const fixedFee = tier.fixedFee === undefined ? undefined : exactDecimal(tier.fixedFee);
    if (!min || (tier.maxAmount !== null && !max) || !percentage ||
        (tier.fixedFee !== undefined && !fixedFee)) {
      throw new ApiError("VALIDATION_ERROR", `Amount tier ${index + 1} must use exact non-negative decimals.`, 400);
    }
    if (max && compareExactDecimals(max, min) <= 0) {
      throw new ApiError("VALIDATION_ERROR", `Amount tier ${index + 1} maximum must exceed its minimum.`, 400);
    }
    if (percentage.coefficient > 100n * 10n ** BigInt(percentage.scale) ||
        (tier.direction === "MARKUP" &&
          percentage.coefficient === 100n * 10n ** BigInt(percentage.scale))) {
      throw new ApiError("VALIDATION_ERROR", `Amount tier ${index + 1} percentage is outside the allowed range for ${tier.direction}.`, 400);
    }
    return { min: min!, max: tier.maxAmount === null ? null : max! };
  });
  for (let leftIndex = 0; leftIndex < parsed.length; leftIndex++) {
    const left = parsed[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < parsed.length; rightIndex++) {
      const right = parsed[rightIndex]!;
      // Ranges which only meet at one endpoint are valid. The preceding
      // range owns that shared endpoint; all intersections with positive
      // width are ambiguous and must be rejected.
      const leftExtendsPastRightMin = left.max === null ||
        compareExactDecimals(left.max, right.min) > 0;
      const rightExtendsPastLeftMin = right.max === null ||
        compareExactDecimals(right.max, left.min) > 0;
      if (leftExtendsPastRightMin && rightExtendsPastLeftMin) {
        throw new ApiError("VALIDATION_ERROR", "Amount tiers cannot overlap.", 400);
      }
    }
  }
}

export function validateRangeOnlyPricing(
  rangeOnlyPricing: boolean,
  amountBasedPricingEnabled: boolean,
  tiers: readonly ManualPricingTier[],
) {
  if (typeof rangeOnlyPricing !== "boolean" ||
      (rangeOnlyPricing && (!amountBasedPricingEnabled || tiers.length === 0))) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Range-only pricing requires enabled amount-based pricing with at least one tier.",
      400,
    );
  }
}

export function selectManualPricingTier(
  tiers: readonly ManualPricingTier[],
  amount: string | number,
): ManualPricingTier | undefined {
  const value = quoteAmountDecimal(amount);
  if (!value) return undefined;
  const parsed = tiers.map((tier) => {
    const min = exactDecimal(tier.minAmount);
    const max = tier.maxAmount === null ? null : exactDecimal(tier.maxAmount);
    if (!min || (tier.maxAmount !== null && !max)) return undefined;
    return { tier, min, max: max ?? null };
  });
  const matches = parsed.flatMap((range) => {
    if (!range) return [];
    const { tier, min, max } = range;
    const hasPrecedingSharedBoundary = parsed.some((other) =>
      other && other !== range && other.max !== null &&
      compareExactDecimals(other.max, min) === 0);
    const lowerCompare = compareExactDecimals(value, min);
    return (hasPrecedingSharedBoundary ? lowerCompare > 0 : lowerCompare >= 0) &&
      (max === null || compareExactDecimals(value, max) <= 0)
      ? [tier]
      : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveManualPricingTerms(
  rule: Pick<ManualDeskPricingRule,
    "amountBasedPricingEnabled" | "amountBasedPricingTiers" | "rangeOnlyPricing" |
    "markupBasisPoints" | "adjustmentDirection" | "fixedFee">,
  amount: string | number,
) {
  const selectedTier = rule.amountBasedPricingEnabled
    ? selectManualPricingTier(rule.amountBasedPricingTiers, amount)
    : undefined;
  const rangeOnlyPricing = rule.rangeOnlyPricing ?? false;
  return {
    selectedTier,
    adjustmentDirection: rangeOnlyPricing
      ? selectedTier?.direction ?? "MARKUP"
      : selectedTier?.direction ?? rule.adjustmentDirection as "MARKUP" | "GIVE_MORE",
    markupBasisPoints: rangeOnlyPricing ? 0 : rule.markupBasisPoints,
    percentage: rangeOnlyPricing
      ? selectedTier?.percentage ?? "0"
      : selectedTier?.percentage,
    fixedFee: rangeOnlyPricing
      ? selectedTier?.fixedFee ?? "0"
      : selectedTier?.fixedFee ?? rule.fixedFee,
  };
}

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim().toUpperCase();
  return result ? result : null;
}

export function reciprocalExactRate(value: string): string {
  const [integer, fraction = ""] = value.split(".");
  const coefficient = BigInt(`${integer}${fraction}`);
  const scale = fraction.length;
  let reciprocal = (10n ** BigInt(36 + scale)) / coefficient;
  let reciprocalScale = 36;
  while (reciprocalScale > 0 && reciprocal % 10n === 0n) {
    reciprocal /= 10n;
    reciprocalScale--;
  }
  const digits = reciprocal.toString().padStart(reciprocalScale + 1, "0");
  return reciprocalScale
    ? `${digits.slice(0, -reciprocalScale)}.${digits.slice(-reciprocalScale)}`
    : digits;
}

export function normalizeManualPricingSelectors<T extends ManualPricingContext>(value: T) {
  return Object.fromEntries(
    MANUAL_PRICING_SELECTOR_KEYS.map((key) => [key, normalized(value[key])]),
  ) as Record<ManualPricingSelector, string | null>;
}

function effectiveManualPricingSelectors(rule: ManualPricingContext) {
  const selectors = normalizeManualPricingSelectors(rule);
  const hasSourceOption = selectors.sourceSettlementOptionId !== null;
  const hasTargetOption = selectors.targetSettlementOptionId !== null;
  // Once either side uses immutable settlement-option identity, a missing ID
  // on the opposite side means a real wildcard. Ignore stale legacy fields
  // which older partial-wildcard writes may have retained on that Any side.
  if (!hasSourceOption && hasTargetOption) {
    if (selectors.sourceCryptoAssetId !== null) {
      selectors.sourceAsset = null;
      selectors.sourceNetwork = null;
      selectors.paymentMethod = null;
    } else if (selectors.sourceNetwork !== ALL_NETWORKS_PRICING_SELECTOR || selectors.sourceAsset === null) {
      for (const key of SOURCE_PRICING_SELECTOR_KEYS) selectors[key] = null;
    } else {
      selectors.paymentMethod = null;
    }
  }
  if (hasSourceOption && !hasTargetOption) {
    if (selectors.targetCryptoAssetId !== null) {
      selectors.targetAsset = null;
      selectors.targetNetwork = null;
      selectors.payoutMethod = null;
    } else if (selectors.targetNetwork !== ALL_NETWORKS_PRICING_SELECTOR || selectors.targetAsset === null) {
      for (const key of TARGET_PRICING_SELECTOR_KEYS) selectors[key] = null;
    } else {
      selectors.payoutMethod = null;
    }
  }
  return selectors;
}

export function manualPricingSpecificity(rule: ManualPricingContext): number {
  const selectors = effectiveManualPricingSelectors(rule);
  return MANUAL_PRICING_SELECTOR_KEYS.reduce(
    (total, key) => total + (
      selectors[key] === null || selectors[key] === ALL_NETWORKS_PRICING_SELECTOR ? 0 : 1
    ),
    0,
  );
}

function settlementOptionSpecificity(rule: ManualPricingContext): number {
  return Number(normalized(rule.sourceSettlementOptionId) !== null) +
    Number(normalized(rule.targetSettlementOptionId) !== null);
}

export function outputManualPricingRule(rule: ManualDeskPricingRule) {
  const sourceAssetWildcard = normalized(rule.sourceAsset) !== null &&
    normalized(rule.sourceNetwork) === ALL_NETWORKS_PRICING_SELECTOR &&
    normalized(rule.paymentMethod) === null;
  const targetAssetWildcard = normalized(rule.targetAsset) !== null &&
    normalized(rule.targetNetwork) === ALL_NETWORKS_PRICING_SELECTOR &&
    normalized(rule.payoutMethod) === null;
  const legacyAmbiguous = !rule.sourceSettlementOptionId &&
    !rule.targetSettlementOptionId &&
    !rule.sourceCryptoAssetId &&
    !rule.targetCryptoAssetId &&
    MANUAL_PRICING_SELECTOR_KEYS
      .filter((key) => key !== "sourceSettlementOptionId" && key !== "targetSettlementOptionId")
      .some((key) => normalized(rule[key]) !== null) &&
    !(
      (sourceAssetWildcard || (
        normalized(rule.sourceAsset) === null &&
        normalized(rule.sourceNetwork) === null &&
        normalized(rule.paymentMethod) === null
      )) &&
      (targetAssetWildcard || (
        normalized(rule.targetAsset) === null &&
        normalized(rule.targetNetwork) === null &&
        normalized(rule.payoutMethod) === null
      ))
    );
  return {
    ...rule,
    fixedFee: rule.fixedFee ?? null,
    specificity: manualPricingSpecificity(rule),
    legacyAmbiguous,
    readOnly: legacyAmbiguous,
    missingSettlementOptionIds: [],
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function matchesManualPricingRule(
  rule: ManualPricingContext,
  context: ManualPricingContext,
): boolean {
  const selectors = effectiveManualPricingSelectors(rule);
  const normalizedContext = normalizeManualPricingSelectors(context);
  return MANUAL_PRICING_SELECTOR_KEYS.every((key) => {
    const selector = selectors[key];
    // Asset identity is resolved from the selected network before matching.
    return selector === null ||
      ((key === "sourceNetwork" || key === "targetNetwork") &&
        selector === ALL_NETWORKS_PRICING_SELECTOR) ||
      selector === normalizedContext[key];
  });
}

export function selectManualPricingRule<T extends ManualPricingContext & {
  id: string;
  priority: number;
}>(
  rules: readonly T[],
  context: ManualPricingContext,
): T | undefined {
  return rules.filter((rule) => matchesManualPricingRule(rule, context))
    .sort((left, right) =>
      settlementOptionSpecificity(right) - settlementOptionSpecificity(left) ||
      manualPricingSpecificity(right) - manualPricingSpecificity(left) ||
      right.priority - left.priority ||
      left.id.localeCompare(right.id))[0];
}

export async function matchManualDeskPricingRule(
  context: ManualPricingContext,
): Promise<ManualDeskPricingRule & { exactRateSource?: "direct" | "reciprocal" }> {
  // Customer routes stay network-specific, while matching also carries the
  // immutable parent asset identity for asset-level rules.
  const resolvedContext = { ...context };
  const sourceNetworkId = context.sourceSettlementOptionId?.startsWith("crypto:")
    ? context.sourceSettlementOptionId.slice("crypto:".length) : null;
  const networkRows = await db.select({ assetId: cryptoAssetNetworksTable.assetId })
    .from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(and(
      sourceNetworkId
        ? eq(cryptoAssetNetworksTable.id, sourceNetworkId)
        : or(
          eq(cryptoAssetNetworksTable.networkCode, String(context.sourceNetwork ?? "")),
          eq(cryptoAssetNetworksTable.networkName, String(context.sourceNetwork ?? "")),
        ),
      eq(cryptoAssetsTable.code, String(context.sourceAsset ?? "")),
      eq(cryptoAssetNetworksTable.enabled, true),
      ne(cryptoAssetNetworksTable.lifecycle, "deprecated"),
      eq(cryptoAssetsTable.enabled, true),
      ne(cryptoAssetsTable.lifecycle, "deprecated"),
    )).limit(2);
  if (networkRows.length === 1 && resolvedContext.sourceCryptoAssetId == null) {
    resolvedContext.sourceCryptoAssetId = String(networkRows[0].assetId);
  }
  const targetNetworkId = context.targetSettlementOptionId?.startsWith("crypto:")
    ? context.targetSettlementOptionId.slice("crypto:".length) : null;
  const targetRows = await db.select({ assetId: cryptoAssetNetworksTable.assetId })
    .from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(and(
      targetNetworkId
        ? eq(cryptoAssetNetworksTable.id, targetNetworkId)
        : or(
          eq(cryptoAssetNetworksTable.networkCode, String(context.targetNetwork ?? "")),
          eq(cryptoAssetNetworksTable.networkName, String(context.targetNetwork ?? "")),
        ),
      eq(cryptoAssetsTable.code, String(context.targetAsset ?? "")),
      eq(cryptoAssetNetworksTable.enabled, true),
      ne(cryptoAssetNetworksTable.lifecycle, "deprecated"),
      eq(cryptoAssetsTable.enabled, true),
      ne(cryptoAssetsTable.lifecycle, "deprecated"),
    )).limit(2);
  if (targetRows.length === 1 && resolvedContext.targetCryptoAssetId == null) {
    resolvedContext.targetCryptoAssetId = targetRows[0].assetId;
  }
  const rules = await db.select().from(manualDeskPricingRulesTable)
    .where(eq(manualDeskPricingRulesTable.enabled, true))
    .orderBy(desc(manualDeskPricingRulesTable.priority), manualDeskPricingRulesTable.id);
  const reverseContext = {
    ...resolvedContext,
    sourceAsset: resolvedContext.targetAsset,
    sourceCryptoAssetId: resolvedContext.targetCryptoAssetId,
    targetAsset: resolvedContext.sourceAsset,
    targetCryptoAssetId: resolvedContext.sourceCryptoAssetId,
    sourceNetwork: resolvedContext.targetNetwork,
    targetNetwork: resolvedContext.sourceNetwork,
    paymentMethod: resolvedContext.payoutMethod,
    payoutMethod: resolvedContext.paymentMethod,
    sourceSettlementOptionId: resolvedContext.targetSettlementOptionId,
    targetSettlementOptionId: resolvedContext.sourceSettlementOptionId,
  };
  const direct = selectManualPricingRule(rules, resolvedContext);
  const directIsRouteSpecific = Boolean(
    direct &&
    (settlementOptionSpecificity(direct) > 0 || manualPricingSpecificity(direct) > 0),
  );
  if (direct && directIsRouteSpecific) {
    return {
      ...direct,
      ...(direct.exactRate !== null ? { exactRateSource: "direct" as const } : {}),
    };
  }
  const reciprocal = selectManualPricingRule(
    rules.filter((rule) => rule.exactRate !== null),
    reverseContext,
  );
  if (reciprocal) {
    return {
      ...reciprocal,
      exactRate: reciprocalExactRate(String(reciprocal.exactRate)),
      exactRateSource: "reciprocal",
    };
  }
  if (direct) return direct;
  throw new ApiError(
    "MANUAL_PRICING_RULE_NOT_FOUND",
    "No manual desk pricing rule is available for this route.",
    422,
  );
}

export type ManualPricingSettlementOption = {
  id: string;
  assetId?: string | null;
  assetCode: string;
  routeNetwork: string;
  kind: "fiat-payment-method" | "crypto-network";
  direction: "send" | "receive" | "both";
};

export type ManualPricingCoveragePair = {
  sourceSettlementOptionId: string;
  targetSettlementOptionId: string;
};

export function evaluateManualPricingCoverage<
  T extends ManualPricingContext & {
    id: string;
    priority: number;
    enabled: boolean;
    exactRate: string | null;
  },
>(
  rules: readonly T[],
  options: readonly ManualPricingSettlementOption[],
) {
  const optionIds = new Set(options.map((option) => normalized(option.id)));
  const orphanRules = rules.flatMap((rule) => {
    const missingSettlementOptionIds = [
      rule.sourceSettlementOptionId,
      rule.targetSettlementOptionId,
    ].flatMap((id) => id && !optionIds.has(normalized(id)) ? [id] : []);
    return missingSettlementOptionIds.length
      ? [{ ruleId: rule.id, missingSettlementOptionIds }]
      : [];
  });
  const orphanRuleIds = new Set(orphanRules.map(({ ruleId }) => ruleId));
  // Both exact paths and legacy selector/global rules are executable. Exact
  // paths win at quote time; this coverage check only answers whether a route
  // has some executable pricing rule.
  const eligibleRules = rules.filter((rule) =>
    rule.enabled && !orphanRuleIds.has(rule.id));
  const pairs: Array<{
    pair: ManualPricingCoveragePair;
    context: ManualPricingContext;
  }> = [];
  for (const source of options) {
    if (source.direction !== "send" && source.direction !== "both") continue;
    for (const target of options) {
      if (target.direction !== "receive" && target.direction !== "both") continue;
      if (
        source.id === target.id ||
        (
          normalized(source.assetCode) === normalized(target.assetCode) &&
          normalized(source.routeNetwork) === normalized(target.routeNetwork)
        ) ||
        (
          source.kind !== "fiat-payment-method" &&
          target.kind !== "fiat-payment-method"
        )
      ) continue;
      pairs.push({
        pair: {
          sourceSettlementOptionId: source.id,
          targetSettlementOptionId: target.id,
        },
        context: {
          sourceAsset: source.assetCode,
          sourceCryptoAssetId: source.assetId,
          sourceNetwork: source.routeNetwork,
          targetAsset: target.assetCode,
          targetCryptoAssetId: target.assetId,
          targetNetwork: target.routeNetwork,
          sourceSettlementOptionId: source.id,
          targetSettlementOptionId: target.id,
        },
      });
    }
  }
  const coveredRoutes: ManualPricingCoveragePair[] = [];
  const uncoveredRoutes: ManualPricingCoveragePair[] = [];
  for (const { pair, context } of pairs) {
    (selectManualPricingRule(eligibleRules, context) ||
      selectManualPricingRule(eligibleRules, {
        ...context,
        sourceAsset: context.targetAsset,
        sourceCryptoAssetId: context.targetCryptoAssetId,
        targetAsset: context.sourceAsset,
        targetCryptoAssetId: context.sourceCryptoAssetId,
        sourceNetwork: context.targetNetwork,
        targetNetwork: context.sourceNetwork,
        sourceSettlementOptionId: context.targetSettlementOptionId,
        targetSettlementOptionId: context.sourceSettlementOptionId,
      })
      ? coveredRoutes : uncoveredRoutes)
      .push(pair);
  }
  return {
    hasEnabledAnyToAnyFallback: rules.some((rule) =>
      rule.enabled && MANUAL_PRICING_SELECTOR_KEYS.every((key) => normalized(rule[key]) === null)),
    orphanRules,
    coveredRoutes,
    uncoveredRoutes,
  };
}

export type ManualPricingWrite = {
  name: string;
  sourceAsset?: string | null;
  sourceCryptoAssetId?: string | null;
  targetAsset?: string | null;
  targetCryptoAssetId?: string | null;
  sourceNetwork?: string | null;
  targetNetwork?: string | null;
  paymentMethod?: string | null;
  payoutMethod?: string | null;
  sourceSettlementOptionId?: string | null;
  targetSettlementOptionId?: string | null;
  markupBasisPoints: number;
  adjustmentDirection?: "MARKUP" | "GIVE_MORE";
  amountBasedPricingEnabled?: boolean;
  amountBasedPricingTiers?: ManualPricingTier[];
  rangeOnlyPricing?: boolean;
  fixedFee?: string | null;
  exactRate?: string | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  operatorInstructions?: string | null;
  customerInstructions?: string | null;
  expectedSettlementMinutes?: number | null;
  priority: number;
  enabled: boolean;
};

function normalizedWrite(input: ManualPricingWrite) {
  const name = input.name.trim();
  if (!name) {
    throw new ApiError("VALIDATION_ERROR", "Pricing rule name cannot be blank.", 400);
  }
  const fixedFee = input.fixedFee === undefined || input.fixedFee === null
    ? null
    : input.fixedFee;
  if (fixedFee !== null && (
    !/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/.test(fixedFee) ||
    Number(fixedFee) < 0
  )) {
    throw new ApiError("VALIDATION_ERROR", "Fixed fee must be a non-negative exact decimal.", 400);
  }
  const adjustmentDirection = input.adjustmentDirection ?? "MARKUP";
  if (adjustmentDirection !== "MARKUP" && adjustmentDirection !== "GIVE_MORE") {
    throw new ApiError("VALIDATION_ERROR", "Adjustment direction must be MARKUP or GIVE_MORE.", 400);
  }
  const amountBasedPricingEnabled = input.amountBasedPricingEnabled ?? false;
  const amountBasedPricingTiers = input.amountBasedPricingTiers ?? [];
  const rangeOnlyPricing = input.rangeOnlyPricing ?? false;
  if (typeof amountBasedPricingEnabled !== "boolean" || !Array.isArray(amountBasedPricingTiers)) {
    throw new ApiError("VALIDATION_ERROR", "Amount-based pricing configuration is invalid.", 400);
  }
  validateRangeOnlyPricing(rangeOnlyPricing, amountBasedPricingEnabled, amountBasedPricingTiers);
  validateManualPricingTiers(amountBasedPricingEnabled, amountBasedPricingTiers);
  const exactDecimal = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/;
  const exactRate = input.exactRate == null ? null : input.exactRate;
  if (exactRate !== null && (
    !/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,36})?$/.test(exactRate) ||
    /^0(?:\.0*)?$/.test(exactRate)
  )) {
    throw new ApiError("VALIDATION_ERROR", "Exact path rate must be a positive exact decimal.", 400);
  }
  for (const [label, value] of [["Minimum amount", input.minAmount], ["Maximum amount", input.maxAmount]] as const) {
    if (value != null && (!exactDecimal.test(value) || Number(value) <= 0)) {
      throw new ApiError("VALIDATION_ERROR", `${label} must be a positive exact decimal.`, 400);
    }
  }
  if (input.minAmount != null && input.maxAmount != null &&
      Number(input.minAmount) > Number(input.maxAmount)) {
    throw new ApiError("VALIDATION_ERROR", "Minimum amount cannot exceed maximum amount.", 400);
  }
  const sourceOptionId = normalized(input.sourceSettlementOptionId);
  const targetOptionId = normalized(input.targetSettlementOptionId);
  const sourceAsset = normalized(input.sourceAsset);
  const sourceCryptoAssetId = input.sourceCryptoAssetId?.trim() || null;
  const targetAsset = normalized(input.targetAsset);
  const targetCryptoAssetId = input.targetCryptoAssetId?.trim() || null;
  const sourceNetwork = normalized(input.sourceNetwork);
  const targetNetwork = normalized(input.targetNetwork);
  const validSourceAssetWildcard = sourceOptionId === null &&
    sourceCryptoAssetId === null &&
    sourceAsset !== null && sourceNetwork === ALL_NETWORKS_PRICING_SELECTOR &&
    normalized(input.paymentMethod) === null;
  const validTargetAssetWildcard = targetOptionId === null &&
    targetCryptoAssetId === null &&
    targetAsset !== null && targetNetwork === ALL_NETWORKS_PRICING_SELECTOR &&
    normalized(input.payoutMethod) === null;
  const invalidUnboundSource = sourceOptionId === null && targetOptionId === null && sourceCryptoAssetId === null && !validSourceAssetWildcard &&
    [sourceAsset, sourceCryptoAssetId, sourceNetwork, normalized(input.paymentMethod)].some((value) => value !== null);
  const invalidUnboundTarget = targetOptionId === null && sourceOptionId === null && targetCryptoAssetId === null && !validTargetAssetWildcard &&
    [targetAsset, targetCryptoAssetId, targetNetwork, normalized(input.payoutMethod)].some((value) => value !== null);
  if (invalidUnboundSource || invalidUnboundTarget) {
    throw new ApiError(
      "SETTLEMENT_OPTION_INVALID",
      "A rule side without a settlement option must use Any or an Asset — All Networks selector.",
      400,
    );
  }
  if (sourceOptionId !== null && sourceOptionId === targetOptionId) {
    throw new ApiError(
      "SETTLEMENT_OPTION_INVALID",
      "Source and target settlement options must be different.",
      400,
    );
  }
  if (sourceCryptoAssetId !== null && (
    sourceOptionId !== null || sourceAsset !== null || sourceNetwork !== null ||
    normalized(input.paymentMethod) !== null
  )) {
    throw new ApiError("SETTLEMENT_OPTION_INVALID", "An asset-level source selector cannot include network or settlement selectors.", 400);
  }
  if (targetCryptoAssetId !== null && (
    targetOptionId !== null || targetAsset !== null || targetNetwork !== null ||
    normalized(input.payoutMethod) !== null
  )) {
    throw new ApiError("SETTLEMENT_OPTION_INVALID", "An asset-level target selector cannot include network or settlement selectors.", 400);
  }
  const selectors = normalizeManualPricingSelectors(input);
  if (sourceOptionId === null && targetOptionId !== null) {
    if (sourceCryptoAssetId !== null) {
      selectors.sourceAsset = null;
      selectors.sourceNetwork = null;
      selectors.paymentMethod = null;
    } else if (validSourceAssetWildcard) {
      selectors.paymentMethod = null;
    } else {
      for (const key of SOURCE_PRICING_SELECTOR_KEYS) selectors[key] = null;
    }
  }
  if (sourceOptionId !== null && targetOptionId === null) {
    if (targetCryptoAssetId !== null) {
      selectors.targetAsset = null;
      selectors.targetNetwork = null;
      selectors.payoutMethod = null;
    } else if (validTargetAssetWildcard) {
      selectors.payoutMethod = null;
    } else {
      for (const key of TARGET_PRICING_SELECTOR_KEYS) selectors[key] = null;
    }
  }
  return {
    ...input,
    ...selectors,
    sourceSettlementOptionId: input.sourceSettlementOptionId?.trim() || null,
    targetSettlementOptionId: input.targetSettlementOptionId?.trim() || null,
    sourceCryptoAssetId,
    targetCryptoAssetId,
    name,
    fixedFee,
    adjustmentDirection,
    amountBasedPricingEnabled,
    amountBasedPricingTiers,
    rangeOnlyPricing,
    exactRate,
  };
}

function overlap(left: ManualPricingContext, right: ManualPricingContext): boolean {
  const leftSelectors = effectiveManualPricingSelectors(left);
  const rightSelectors = effectiveManualPricingSelectors(right);
  return MANUAL_PRICING_SELECTOR_KEYS.every((key) => {
    const a = leftSelectors[key];
    const b = rightSelectors[key];
    return a === null || b === null ||
      ((key === "sourceNetwork" || key === "targetNetwork") &&
        (a === ALL_NETWORKS_PRICING_SELECTOR || b === ALL_NETWORKS_PRICING_SELECTOR)) ||
      a === b;
  });
}

export async function assertNoManualPricingConflict(
  input: ManualPricingWrite,
  excludeId?: string,
) {
  const candidate = normalizedWrite(input);
  const rows = await db.select().from(manualDeskPricingRulesTable)
    .where(excludeId ? ne(manualDeskPricingRulesTable.id, excludeId) : undefined);
  const conflict = rows.find((row) =>
    row.priority === candidate.priority &&
    settlementOptionSpecificity(row) === settlementOptionSpecificity(candidate) &&
    manualPricingSpecificity(row) === manualPricingSpecificity(candidate) &&
    overlap(row, candidate));
  if (conflict) {
    throw new ApiError(
      "MANUAL_PRICING_RULE_CONFLICT",
      "A rule with the same priority and overlapping selectors would make matching ambiguous.",
      409,
    );
  }
  return candidate;
}

export async function createManualPricingRule(input: ManualPricingWrite) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(350035)`);
      const values = normalizedWrite(input);
      const rows = await tx.select().from(manualDeskPricingRulesTable);
      const conflict = rows.find((row) =>
        row.priority === values.priority &&
        settlementOptionSpecificity(row) === settlementOptionSpecificity(values) &&
        manualPricingSpecificity(row) === manualPricingSpecificity(values) &&
        overlap(row, values));
      if (conflict) {
        throw new ApiError(
          "MANUAL_PRICING_RULE_CONFLICT",
          "A rule with the same priority and overlapping selectors would make matching ambiguous.",
          409,
        );
      }
      const [created] = await tx.insert(manualDeskPricingRulesTable)
        .values(values).returning();
      return created!;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError("MANUAL_PRICING_RULE_CONFLICT", "An equivalent pricing rule already exists.", 409);
    }
    throw error;
  }
}

export async function updateManualPricingRule(
  id: string,
  version: number,
  input: ManualPricingWrite,
) {
  try {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(350035)`);
      const values = normalizedWrite(input);
      const rows = await tx.select().from(manualDeskPricingRulesTable)
        .where(ne(manualDeskPricingRulesTable.id, id));
      const conflict = rows.find((row) =>
        row.priority === values.priority &&
        settlementOptionSpecificity(row) === settlementOptionSpecificity(values) &&
        manualPricingSpecificity(row) === manualPricingSpecificity(values) &&
        overlap(row, values));
      if (conflict) {
        throw new ApiError(
          "MANUAL_PRICING_RULE_CONFLICT",
          "A rule with the same priority and overlapping selectors would make matching ambiguous.",
          409,
        );
      }
      const [result] = await tx.update(manualDeskPricingRulesTable).set({
        ...values,
        version: version + 1,
        updatedAt: new Date(),
      }).where(and(
        eq(manualDeskPricingRulesTable.id, id),
        eq(manualDeskPricingRulesTable.version, version),
      )).returning();
      return result;
    });
    if (updated) return updated;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError("MANUAL_PRICING_RULE_CONFLICT", "An equivalent pricing rule already exists.", 409);
    }
    throw error;
  }
  const [exists] = await db.select({ id: manualDeskPricingRulesTable.id })
    .from(manualDeskPricingRulesTable)
    .where(eq(manualDeskPricingRulesTable.id, id)).limit(1);
  if (!exists) throw new ApiError("MANUAL_PRICING_RULE_NOT_FOUND", "Pricing rule not found.", 404);
  throw new ApiError(
    "MANUAL_PRICING_RULE_VERSION_CONFLICT",
    "The pricing rule changed. Reload it before trying again.",
    409,
  );
}

export async function upsertManualPricingRules(inputs: ManualPricingWrite[]) {
  if (!inputs.length || inputs.length > 200) {
    throw new ApiError("VALIDATION_ERROR", "Bulk pricing creation requires between 1 and 200 rules.", 400);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(350035)`);
    const candidates = inputs.map(normalizedWrite);
    const routeKey = (rule: ManualPricingContext & { priority: number }) => [
      ...MANUAL_PRICING_SELECTOR_KEYS.map((key) => normalized(rule[key]) ?? "*"),
      rule.priority,
    ].join("\0");
    const submittedKeys = candidates.map(routeKey);
    if (new Set(submittedKeys).size !== submittedKeys.length) {
      throw new ApiError("VALIDATION_ERROR", "Bulk pricing rules must use distinct source and target routes.", 400);
    }
    const existing = await tx.select().from(manualDeskPricingRulesTable);
    const existingByKey = new Map(existing.map(row => [routeKey(row), row]));
    const matchedIds = new Set(
      candidates.map(candidate => existingByKey.get(routeKey(candidate))?.id).filter(Boolean) as string[],
    );
    const finalRows = [
      ...existing.filter(row => !matchedIds.has(row.id)),
      ...candidates,
    ];
    for (let index = 0; index < finalRows.length; index++) {
      const candidate = finalRows[index]!;
      const conflict = finalRows.some((row, otherIndex) =>
        otherIndex !== index &&
        row.priority === candidate.priority &&
        settlementOptionSpecificity(row) === settlementOptionSpecificity(candidate) &&
        manualPricingSpecificity(row) === manualPricingSpecificity(candidate) &&
        overlap(row, candidate)
      );
      if (conflict) {
        throw new ApiError(
          "MANUAL_PRICING_RULE_CONFLICT",
          "A rule with the same priority and overlapping selectors would make matching ambiguous.",
          409,
        );
      }
    }
    const createdIds: string[] = [];
    const updatedIds: string[] = [];
    for (const candidate of candidates) {
      const current = existingByKey.get(routeKey(candidate));
      if (current) {
        const [updated] = await tx.update(manualDeskPricingRulesTable).set({
          ...candidate,
          version: current.version + 1,
          updatedAt: new Date(),
        }).where(eq(manualDeskPricingRulesTable.id, current.id)).returning();
        if (updated) updatedIds.push(updated.id);
      } else {
        const [created] = await tx.insert(manualDeskPricingRulesTable).values(candidate).returning();
        if (created) createdIds.push(created.id);
      }
    }
    const rows = await tx.select().from(manualDeskPricingRulesTable);
    return { rows, createdIds, updatedIds };
  });
}

export type ManualPricingBulkAction = "enable" | "disable" | "delete" | "edit";
export type ManualPricingBulkItem = { id: string; version: number };
export type ManualPricingBulkPatch = Partial<Pick<ManualPricingWrite,
  "markupBasisPoints" | "adjustmentDirection" | "amountBasedPricingEnabled" | "rangeOnlyPricing" |
  "amountBasedPricingTiers" | "priority" | "sourceSettlementOptionId" |
  "targetSettlementOptionId" | "exactRate" | "fixedFee" | "minAmount" |
  "maxAmount" | "expectedSettlementMinutes" | "operatorInstructions" |
  "customerInstructions" | "sourceAsset" | "targetAsset" | "sourceNetwork" |
  "targetNetwork" | "sourceCryptoAssetId" | "targetCryptoAssetId">>;

export type ManualPricingBulkSkipCode =
  | "MANUAL_PRICING_RULE_NOT_FOUND"
  | "MANUAL_PRICING_RULE_VERSION_CONFLICT"
  | "MANUAL_PRICING_RULE_READ_ONLY"
  | "SETTLEMENT_OPTION_INVALID"
  | "MANUAL_PRICING_RULE_CONFLICT";

export type ManualPricingBulkSkip = {
  id: string;
  code: ManualPricingBulkSkipCode;
  reason: string;
  currentVersion?: number;
};

function rowAsWrite(row: ManualDeskPricingRule): ManualPricingWrite {
  return {
    name: row.name,
    sourceAsset: row.sourceAsset,
    sourceCryptoAssetId: row.sourceCryptoAssetId,
    targetAsset: row.targetAsset,
    targetCryptoAssetId: row.targetCryptoAssetId,
    sourceNetwork: row.sourceNetwork,
    targetNetwork: row.targetNetwork,
    paymentMethod: row.paymentMethod,
    payoutMethod: row.payoutMethod,
    sourceSettlementOptionId: row.sourceSettlementOptionId,
    targetSettlementOptionId: row.targetSettlementOptionId,
    markupBasisPoints: row.markupBasisPoints,
    adjustmentDirection: row.adjustmentDirection as "MARKUP" | "GIVE_MORE",
    amountBasedPricingEnabled: row.amountBasedPricingEnabled,
    amountBasedPricingTiers: row.amountBasedPricingTiers,
    rangeOnlyPricing: row.rangeOnlyPricing,
    fixedFee: row.fixedFee,
    exactRate: row.exactRate,
    minAmount: row.minAmount,
    maxAmount: row.maxAmount,
    operatorInstructions: row.operatorInstructions,
    customerInstructions: row.customerInstructions,
    expectedSettlementMinutes: row.expectedSettlementMinutes,
    priority: row.priority,
    enabled: row.enabled,
  };
}

function isLegacyReadOnly(row: ManualDeskPricingRule): boolean {
  return outputManualPricingRule(row).legacyAmbiguous;
}

function bulkRuleDescription(row: ManualDeskPricingRule): string {
  const side = (asset: string | null, method: string | null, network: string | null, optionId: string | null) =>
    [asset, method || network].filter(Boolean).join(" / ") || optionId || "Any";
  return `Rule "${row.name}" (${side(row.sourceAsset, row.paymentMethod, row.sourceNetwork, row.sourceSettlementOptionId)} → ${side(row.targetAsset, row.payoutMethod, row.targetNetwork, row.targetSettlementOptionId)}, ID ${row.id})`;
}

export async function bulkUpdateManualPricingRules(
  items: readonly ManualPricingBulkItem[],
  action: ManualPricingBulkAction,
  patch: ManualPricingBulkPatch | undefined,
  settlementOptionIds?: ReadonlySet<string>,
) {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new ApiError("VALIDATION_ERROR", "Selected pricing rule IDs must be unique.", 400);
  }
  if (action === "edit" && (!patch || Object.keys(patch).length === 0)) {
    throw new ApiError("VALIDATION_ERROR", "Bulk edit requires at least one field.", 400);
  }
  const commissionOnly = action === "edit" && Object.keys(patch ?? {}).every(
    (key) => key === "markupBasisPoints" || key === "adjustmentDirection" ||
      key === "amountBasedPricingEnabled" || key === "amountBasedPricingTiers" ||
      key === "rangeOnlyPricing",
  );
  if (commissionOnly) {
    if (patch?.markupBasisPoints !== undefined &&
        (!Number.isInteger(patch.markupBasisPoints) || patch.markupBasisPoints < 0 || patch.markupBasisPoints > 10000)) {
      throw new ApiError("VALIDATION_ERROR", "Percentage must be between 0% and 100%.", 400);
    }
    if (patch?.adjustmentDirection !== undefined &&
        patch.adjustmentDirection !== "MARKUP" && patch.adjustmentDirection !== "GIVE_MORE") {
      throw new ApiError("VALIDATION_ERROR", "Adjustment direction must be MARKUP or GIVE_MORE.", 400);
    }
  }
  const routeChanged = action === "edit" && Object.keys(patch ?? {}).some((key) =>
    ["sourceSettlementOptionId", "targetSettlementOptionId", "sourceCryptoAssetId",
      "targetCryptoAssetId", "sourceAsset", "targetAsset", "sourceNetwork", "targetNetwork"].includes(key));
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(350035)`);
      const rows = await tx.select().from(manualDeskPricingRulesTable);
      const skipped: ManualPricingBulkSkip[] = [];
      const updatedIds: string[] = [];
      const selected = items.map((item) => ({
        item,
        row: rows.find((candidate) => candidate.id === item.id),
      }));
      const eligible: Array<{ item: ManualPricingBulkItem; row: ManualDeskPricingRule }> = [];
      for (const { item, row } of selected) {
        if (!row) {
          skipped.push({
            id: item.id,
            code: "MANUAL_PRICING_RULE_NOT_FOUND",
            reason: "Pricing rule not found.",
          });
          continue;
        }
        if (row.version !== item.version) {
          skipped.push({
            id: row.id,
            code: "MANUAL_PRICING_RULE_VERSION_CONFLICT",
            reason: "The pricing rule changed after it was opened.",
            currentVersion: row.version,
          });
          continue;
        }
        if (action !== "delete" && !commissionOnly && isLegacyReadOnly(row)) {
          skipped.push({
            id: row.id,
            code: "MANUAL_PRICING_RULE_READ_ONLY",
            reason: "Legacy pricing rules cannot be changed.",
            currentVersion: row.version,
          });
          continue;
        }
        // A stored, now-unavailable option is not a reason to reject a field-only edit.
        // Route edits and enable/disable retain their existing availability gate.
        if (settlementOptionIds && (action !== "edit" || routeChanged) &&
            [row.sourceSettlementOptionId, row.targetSettlementOptionId]
          .some((id) => id !== null && !settlementOptionIds.has(id.toUpperCase()))) {
          skipped.push({
            id: row.id,
            code: "SETTLEMENT_OPTION_INVALID",
            reason: "The pricing rule references an unavailable settlement option.",
            currentVersion: row.version,
          });
          continue;
        }
        eligible.push({ item, row });
      }
      // Edits are all-or-nothing. In particular, an invalid ID or stale version
      // must not leave an operator's multi-selection partially commissioned.
      if (action === "edit" && skipped.length) {
        const first = skipped[0];
        const row = selected.find(({ item }) => item.id === first.id)?.row;
        throw new ApiError(first.code, `${row ? bulkRuleDescription(row) : `Rule ID ${first.id}`}: ${first.reason}`,
          first.code.endsWith("CONFLICT") ? 409 : 422);
      }
      if (action === "delete") {
        if (eligible.length > 0) {
          await tx.delete(manualDeskPricingRulesTable)
            .where(inArray(manualDeskPricingRulesTable.id, eligible.map(({ row }) => row.id)));
        }
        updatedIds.push(...eligible.map(({ row }) => row.id));
      } else {
        const finalRows = new Map(rows.map((row) => [row.id, row]));
        const pendingWrites: Array<{
          row: ManualDeskPricingRule;
          proposed: ManualDeskPricingRule;
          values: Partial<ManualPricingWrite>;
        }> = [];
        for (const { row } of eligible) {
          const canonicalPatch: ManualPricingBulkPatch & {
            paymentMethod?: string | null;
            payoutMethod?: string | null;
          } = { ...patch };
          const resultingSourceOptionId =
            Object.prototype.hasOwnProperty.call(canonicalPatch, "sourceSettlementOptionId")
              ? canonicalPatch.sourceSettlementOptionId
              : row.sourceSettlementOptionId;
          const resultingTargetOptionId =
            Object.prototype.hasOwnProperty.call(canonicalPatch, "targetSettlementOptionId")
              ? canonicalPatch.targetSettlementOptionId
              : row.targetSettlementOptionId;
          const sourceSelectorChanged = action === "edit" && [
            "sourceSettlementOptionId", "sourceCryptoAssetId", "sourceAsset", "sourceNetwork",
          ].some((key) => Object.prototype.hasOwnProperty.call(canonicalPatch, key));
          const targetSelectorChanged = action === "edit" && [
            "targetSettlementOptionId", "targetCryptoAssetId", "targetAsset", "targetNetwork",
          ].some((key) => Object.prototype.hasOwnProperty.call(canonicalPatch, key));
          if (sourceSelectorChanged && !resultingSourceOptionId) {
            const sourceNetwork = normalized(canonicalPatch.sourceNetwork ?? row.sourceNetwork);
            const sourceAsset = normalized(canonicalPatch.sourceAsset ?? row.sourceAsset);
            if (sourceNetwork !== ALL_NETWORKS_PRICING_SELECTOR || sourceAsset === null) {
              for (const key of SOURCE_PRICING_SELECTOR_KEYS) canonicalPatch[key] = null;
            }
          }
          if (targetSelectorChanged && !resultingTargetOptionId) {
            const targetNetwork = normalized(canonicalPatch.targetNetwork ?? row.targetNetwork);
            const targetAsset = normalized(canonicalPatch.targetAsset ?? row.targetAsset);
            if (targetNetwork !== ALL_NETWORKS_PRICING_SELECTOR || targetAsset === null) {
              for (const key of TARGET_PRICING_SELECTOR_KEYS) canonicalPatch[key] = null;
            }
          }
          const changedKeys = new Set(Object.keys(canonicalPatch));
          if (sourceSelectorChanged) {
            SOURCE_PRICING_SELECTOR_KEYS.forEach((key) => changedKeys.add(key));
          }
          if (targetSelectorChanged) {
            TARGET_PRICING_SELECTOR_KEYS.forEach((key) => changedKeys.add(key));
          }
          let values: Partial<ManualPricingWrite>;
          if (commissionOnly) {
            // Validated scalar columns can be written without revalidating or
            // normalizing historical route selectors that are not being edited.
            validateManualPricingTiers(
              canonicalPatch.amountBasedPricingEnabled ?? row.amountBasedPricingEnabled,
              canonicalPatch.amountBasedPricingTiers ?? row.amountBasedPricingTiers,
            );
            const resultingAmountBasedPricingEnabled =
              canonicalPatch.amountBasedPricingEnabled ?? row.amountBasedPricingEnabled;
            const resultingRangeOnlyPricing = resultingAmountBasedPricingEnabled
              ? canonicalPatch.rangeOnlyPricing ?? row.rangeOnlyPricing
              : false;
            try {
              validateRangeOnlyPricing(
                resultingRangeOnlyPricing,
                resultingAmountBasedPricingEnabled,
                canonicalPatch.amountBasedPricingTiers ?? row.amountBasedPricingTiers,
              );
            } catch (error) {
              if (error instanceof ApiError) {
                throw new ApiError(error.code, `${bulkRuleDescription(row)}: ${error.message}`, error.status);
              }
              throw error;
            }
            values = { ...canonicalPatch, rangeOnlyPricing: resultingRangeOnlyPricing };
          } else {
            let combined: ManualPricingWrite;
            try {
              combined = normalizedWrite({ ...rowAsWrite(row), ...canonicalPatch });
            } catch (error) {
              if (error instanceof ApiError) {
                throw new ApiError(error.code, `${bulkRuleDescription(row)}: ${error.message}`, error.status);
              }
              throw error;
            }
            values = action === "edit"
              ? Object.fromEntries([
                ...(canonicalPatch.amountBasedPricingEnabled === false
                  ? [...changedKeys, "rangeOnlyPricing"]
                  : [...changedKeys]),
              ].map((key) => [
                key, combined[key as keyof ManualPricingWrite],
              ]))
              : combined;
          }
          if (action === "enable") values.enabled = true;
          if (action === "disable") values.enabled = false;
          const proposed = { ...row, ...values, version: row.version + 1, updatedAt: new Date() };
          const ambiguityChanged = action === "edit" && Object.keys(patch ?? {}).some((key) =>
            key === "priority" || key === "sourceSettlementOptionId" ||
            key === "targetSettlementOptionId" || key === "sourceAsset" ||
            key === "targetAsset" || key === "sourceNetwork" || key === "targetNetwork");
          if (ambiguityChanged) {
            const conflict = [...finalRows.values()].find((other) => {
              if (other.id === row.id) return false;
              const otherWrite = rowAsWrite(other);
              const candidate = rowAsWrite(proposed);
              return other.priority === proposed.priority &&
                settlementOptionSpecificity(otherWrite) === settlementOptionSpecificity(candidate) &&
                manualPricingSpecificity(otherWrite) === manualPricingSpecificity(candidate) &&
                overlap(otherWrite, candidate);
            });
            if (conflict) {
              if (action === "edit") {
                throw new ApiError("MANUAL_PRICING_RULE_CONFLICT",
                  `${bulkRuleDescription(row)}: Overlaps rule ${conflict.id} at the same priority and selector specificity.`, 409);
              }
              skipped.push({
                id: row.id,
                code: "MANUAL_PRICING_RULE_CONFLICT",
                reason: "A rule with the same priority and overlapping selectors would make matching ambiguous.",
                currentVersion: row.version,
              });
              continue;
            }
          }
          pendingWrites.push({ row, proposed, values });
          finalRows.set(row.id, proposed);
        }
        for (const { row, proposed, values } of pendingWrites) {
          let persisted: Array<{ id: string }>;
          try {
            persisted = await tx.update(manualDeskPricingRulesTable).set({
              ...values,
              version: proposed.version,
              updatedAt: proposed.updatedAt,
            }).where(and(
              eq(manualDeskPricingRulesTable.id, row.id),
              eq(manualDeskPricingRulesTable.version, row.version),
            )).returning({ id: manualDeskPricingRulesTable.id });
          } catch (error) {
            const cause = error as { cause?: { code?: string; constraint?: string } };
            if (cause.cause?.code === "23505") {
              throw new ApiError("MANUAL_PRICING_RULE_CONFLICT",
                `${bulkRuleDescription(row)}: Database unique constraint ${cause.cause.constraint ?? "conflict"} rejected this update.`, 409);
            }
            if (cause.cause?.code && /^[A-Z0-9]{5}$/.test(cause.cause.code)) {
              throw new ApiError("MANUAL_PRICING_RULE_UPDATE_FAILED",
                `${bulkRuleDescription(row)}: Database rejected the update (${cause.cause.code}${cause.cause.constraint ? `, ${cause.cause.constraint}` : ""}).`, 422);
            }
            throw error;
          }
          if (persisted.length === 0) {
            if (action === "edit") {
              throw new ApiError("MANUAL_PRICING_RULE_VERSION_CONFLICT",
                `${bulkRuleDescription(row)}: The pricing rule changed while the bulk update was being applied.`, 409);
            }
            const [latest] = await tx.select({ version: manualDeskPricingRulesTable.version })
              .from(manualDeskPricingRulesTable)
              .where(eq(manualDeskPricingRulesTable.id, row.id))
              .limit(1);
            skipped.push({
              id: row.id,
              code: "MANUAL_PRICING_RULE_VERSION_CONFLICT",
              reason: "The pricing rule changed while the bulk update was being applied.",
              currentVersion: latest?.version,
            });
            continue;
          }
          updatedIds.push(row.id);
        }
      }
      const refreshed = await tx.select().from(manualDeskPricingRulesTable)
        .orderBy(desc(manualDeskPricingRulesTable.priority),
          manualDeskPricingRulesTable.createdAt, manualDeskPricingRulesTable.id);
      return { rows: refreshed, updatedIds, skipped };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError("MANUAL_PRICING_RULE_CONFLICT", "An equivalent pricing rule already exists.", 409);
    }
    throw error;
  }
}