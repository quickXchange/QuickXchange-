import { and, desc, eq, ne, sql } from "drizzle-orm";
import {
  db,
  manualDeskPricingRulesTable,
  type ManualDeskPricingRule,
} from "@workspace/db";
import { ApiError } from "./api-error";

export const MANUAL_PRICING_SELECTOR_KEYS = [
  "sourceAsset",
  "targetAsset",
  "sourceNetwork",
  "targetNetwork",
  "paymentMethod",
  "payoutMethod",
  "sourceSettlementOptionId",
  "targetSettlementOptionId",
] as const;
export type ManualPricingSelector = typeof MANUAL_PRICING_SELECTOR_KEYS[number];
export type ManualPricingContext =
  Partial<Record<ManualPricingSelector, string | null | undefined>>;

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

export function manualPricingSpecificity(rule: ManualPricingContext): number {
  return MANUAL_PRICING_SELECTOR_KEYS.reduce(
    (total, key) => total + (normalized(rule[key]) === null ? 0 : 1),
    0,
  );
}

function settlementOptionSpecificity(rule: ManualPricingContext): number {
  return Number(normalized(rule.sourceSettlementOptionId) !== null) +
    Number(normalized(rule.targetSettlementOptionId) !== null);
}

export function outputManualPricingRule(rule: ManualDeskPricingRule) {
  const legacyAmbiguous = !rule.sourceSettlementOptionId &&
    !rule.targetSettlementOptionId &&
    MANUAL_PRICING_SELECTOR_KEYS
      .filter((key) => key !== "sourceSettlementOptionId" && key !== "targetSettlementOptionId")
      .some((key) => normalized(rule[key]) !== null);
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
  const normalizedContext = normalizeManualPricingSelectors(context);
  return MANUAL_PRICING_SELECTOR_KEYS.every((key) => {
    const selector = normalized(rule[key]);
    return selector === null || selector === normalizedContext[key];
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
  const rules = await db.select().from(manualDeskPricingRulesTable)
    .where(eq(manualDeskPricingRulesTable.enabled, true))
    .orderBy(desc(manualDeskPricingRulesTable.priority), manualDeskPricingRulesTable.id);
  // An exact path is an override, but it is not the only kind of executable
  // manual rule. Keep the old selector/provider-backed pricing behavior as
  // the fallback when no exact path applies.
  const exactRules = rules.filter((rule) => rule.exactRate !== null);
  const selected = selectManualPricingRule(exactRules, context);
  if (selected) return { ...selected, exactRateSource: "direct" };
  // A configured path also makes its exact reciprocal available. Keep this
  // entirely decimal/integer based and prefer a directly configured reverse
  // path (the lookup above) over this synthesized result.
  const reverse = selectManualPricingRule(exactRules, {
    ...context,
    sourceAsset: context.targetAsset,
    targetAsset: context.sourceAsset,
    sourceNetwork: context.targetNetwork,
    targetNetwork: context.sourceNetwork,
    paymentMethod: context.payoutMethod,
    payoutMethod: context.paymentMethod,
    sourceSettlementOptionId: context.targetSettlementOptionId,
    targetSettlementOptionId: context.sourceSettlementOptionId,
  });
  if (reverse) {
    const exactRate = reciprocalExactRate(String(reverse.exactRate));
    return { ...reverse, exactRate, exactRateSource: "reciprocal" };
  }
  const fallback = selectManualPricingRule(
    rules.filter((rule) => rule.exactRate === null),
    context,
  );
  if (fallback) return fallback;
  throw new ApiError(
    "MANUAL_PRICING_RULE_NOT_FOUND",
    "No manual desk pricing rule is available for this route.",
    422,
  );
}

export type ManualPricingSettlementOption = {
  id: string;
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
          sourceNetwork: source.routeNetwork,
          targetAsset: target.assetCode,
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
        targetAsset: context.sourceAsset,
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
  targetAsset?: string | null;
  sourceNetwork?: string | null;
  targetNetwork?: string | null;
  paymentMethod?: string | null;
  payoutMethod?: string | null;
  sourceSettlementOptionId?: string | null;
  targetSettlementOptionId?: string | null;
  markupBasisPoints: number;
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
  const hasLegacySelector = MANUAL_PRICING_SELECTOR_KEYS
    .filter((key) => key !== "sourceSettlementOptionId" && key !== "targetSettlementOptionId")
    .some((key) => normalized(input[key]) !== null);
  if (sourceOptionId === null && targetOptionId === null && hasLegacySelector) {
    throw new ApiError(
      "SETTLEMENT_OPTION_INVALID",
      "A rule without settlement options must use Any on both sides and cannot include legacy selectors.",
      400,
    );
  }
  if (exactRate !== null && (sourceOptionId === null || targetOptionId === null)) {
    throw new ApiError(
      "SETTLEMENT_OPTION_REQUIRED",
      "An exact path rate requires both source and target settlement option IDs.",
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
  return {
    ...input,
    ...normalizeManualPricingSelectors(input),
    sourceSettlementOptionId: input.sourceSettlementOptionId?.trim() || null,
    targetSettlementOptionId: input.targetSettlementOptionId?.trim() || null,
    name,
    fixedFee,
    exactRate,
  };
}

function overlap(left: ManualPricingContext, right: ManualPricingContext): boolean {
  return MANUAL_PRICING_SELECTOR_KEYS.every((key) => {
    const a = normalized(left[key]);
    const b = normalized(right[key]);
    return a === null || b === null || a === b;
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