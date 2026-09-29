import { ApiError } from "./api-error";

type Decimal = { coefficient: bigint; scale: number };
export type FeeReference = {
  currency: string;
  unitsPerUsd: string;
  provider: "1Forge" | "manual" | "Coinbase" | "USD identity" | "test adapter";
  source: string;
  observedAt: string;
  timestampKind: "upstreamObservedAt" | "fetchedAt";
};
export type ManualSwapFeeSnapshot = {
  selectedAddons: Array<{
    id: string;
    key: string;
    name: string;
    amount: string;
    currency: string;
    targetAmount: string;
    feeType?: "fixed" | "percentage";
    percentage?: string | null;
    selectionRule?: string;
    selectionGroup?: string;
  }>;
  exchangeFee: {
    enabled: boolean;
    percentage: string | null;
    fixedAmount: string | null;
    fixedCurrency: string;
    percentageAmount: string;
    fixedTargetAmount: string;
    totalAmount: string;
  };
  addonFee: string;
  totalAdditionalFee: string;
  existingPricingFee: string;
  totalFees: string;
  referenceLegs: FeeReference[];
};
export type ManualSwapAddonOption = {
  id: string;
  key: string;
  name: string;
  fixedAmount: string;
  feeCurrency: string;
  feeType?: string;
  percentage?: string | null;
  enabled: boolean;
  deletedAt: Date | null;
  selectionRule: string;
  presentation: { group: string };
};

export function assertManualSwapFixedFeeCurrencyAllowed(input: {
  feeType: "fixed" | "percentage";
  feeAmount: string;
  feeCurrency: string;
  existing?: {
    feeType?: string;
    fixedAmount: string;
    feeCurrency: string;
  };
}): void {
  if (input.feeType !== "fixed" || input.feeCurrency.trim().toUpperCase() === "USD") return;

  const unchangedLegacyFixedFee = input.existing &&
    (input.existing.feeType ?? "fixed") === "fixed" &&
    canonicalConfiguredDecimal(input.feeAmount) === canonicalConfiguredDecimal(input.existing.fixedAmount) &&
    input.feeCurrency.trim().toUpperCase() === input.existing.feeCurrency.trim().toUpperCase();
  if (unchangedLegacyFixedFee) return;

  throw new ApiError(
    "MANUAL_SWAP_ADDON_CURRENCY_INVALID",
    "Fixed Manual Swap add-ons must use USD unless preserving an unchanged legacy fee.",
    400,
  );
}

export function validateManualSwapAddonSelection(
  keys: string[],
  catalog: ManualSwapAddonOption[],
) {
  if (new Set(keys).size !== keys.length) {
    throw new ApiError("MANUAL_SWAP_ADDON_DUPLICATE", "An add-on cannot be selected more than once.", 400);
  }
  if (keys.length === 0) return [];
  const selected = keys.map((key) => {
    const row = catalog.find((option) => option.key === key);
    if (!row || !row.enabled || row.deletedAt !== null) {
      throw new ApiError("MANUAL_SWAP_ADDON_UNAVAILABLE", "A selected Manual Swap add-on is unavailable.", 422);
    }
    if (row.feeType !== undefined && row.feeType !== "fixed" && row.feeType !== "percentage") {
      throw new ApiError("MANUAL_SWAP_FEE_INVALID", "A configured Manual Swap add-on fee type is invalid.", 422);
    }
    return row;
  });
  const selectedPerGroup = new Map<string, number>();
  const onePerGroup = new Set<string>();
  for (const row of selected) {
    if (row.selectionRule === "none") {
      throw new ApiError("MANUAL_SWAP_ADDON_OPT_OUT", "This Manual Swap add-on cannot be selected.", 422);
    }
    if (row.feeType === "percentage" && row.percentage == null) {
      throw new ApiError("MANUAL_SWAP_FEE_INVALID", "A configured Manual Swap percentage add-on is invalid.", 422);
    }
    const group = row.presentation.group.trim().toLowerCase() || "default";
    selectedPerGroup.set(group, (selectedPerGroup.get(group) ?? 0) + 1);
    if (row.selectionRule === "one") onePerGroup.add(group);
  }
  if ([...onePerGroup].some((group) => (selectedPerGroup.get(group) ?? 0) > 1)) {
    throw new ApiError("MANUAL_SWAP_ADDON_SELECTION_INVALID", "Only one add-on from this group may be selected.", 422);
  }
  return selected;
}

function parseDecimal(input: string): Decimal {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(input)) {
    throw new ApiError("MANUAL_SWAP_FEE_INVALID", "A configured Manual Swap fee is invalid.", 422);
  }
  const [whole, fraction = ""] = input.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function decimalString(value: bigint, scale: number): string {
  let coefficient = value;
  let normalizedScale = scale;
  while (normalizedScale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    normalizedScale--;
  }
  const digits = coefficient.toString().padStart(normalizedScale + 1, "0");
  return normalizedScale
    ? `${digits.slice(0, -normalizedScale)}.${digits.slice(-normalizedScale)}`
    : digits;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function referenceMap(references: FeeReference[]) {
  const values = new Map<string, Decimal>();
  for (const reference of references) {
    const currency = reference.currency.toUpperCase();
    const rate = parseDecimal(reference.unitsPerUsd);
    if (rate.coefficient <= 0n || values.has(currency)) {
      throw new ApiError("MANUAL_SWAP_REFERENCE_UNAVAILABLE", "A required fee currency reference rate is unavailable.", 422);
    }
    values.set(currency, rate);
  }
  return values;
}

function convertToTarget(amount: string, sourceCurrency: string, targetCurrency: string,
  references: Map<string, Decimal>, precision: number) {
  const sourceRate = references.get(sourceCurrency.toUpperCase());
  const targetRate = references.get(targetCurrency.toUpperCase());
  if (!sourceRate || !targetRate) {
    throw new ApiError("MANUAL_SWAP_REFERENCE_UNAVAILABLE", "A required fee currency reference rate is unavailable.", 422);
  }
  const value = parseDecimal(amount);
  const numerator = value.coefficient * targetRate.coefficient *
    (10n ** BigInt(sourceRate.scale + precision));
  const denominator = sourceRate.coefficient * (10n ** BigInt(value.scale + targetRate.scale));
  const atomic = ceilDiv(numerator, denominator);
  return { atomic, exact: decimalString(atomic, precision) };
}

function checkedNumber(value: string): number {
  const parsed = Number(value);
  const significantDigits = value.replace(".", "").replace(/^0+/, "").length;
  if (!Number.isFinite(parsed) || parsed < 0 || significantDigits > 15) {
    throw new ApiError("MANUAL_SWAP_FEE_INVALID", "The resulting Manual Swap amount is not representable.", 422);
  }
  return parsed;
}

function checkedRate(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError("MANUAL_SWAP_RATE_INVALID", "The resulting Manual Swap rate is not representable.", 422);
  }
  return parsed;
}

export function applyManualSwapFees(input: {
  grossAmount: string;
  legacyReceiveAmount: string;
  legacyTotalFee: string;
  amount: number;
  targetCurrency: string;
  targetPrecision: number;
  addons: Array<{
    id: string; key: string; name: string; fixedAmount: string; feeCurrency: string;
    feeType?: "fixed" | "percentage"; percentage?: string | null;
    selectionRule?: string; selectionGroup?: string;
  }>;
  config: { enabled: boolean; percentage: string | null; fixedAmount: string | null; fixedCurrency: string };
  references: FeeReference[];
}) {
  const precision = input.targetPrecision;
  const atomicScale = 10n ** BigInt(precision);
  const rates = referenceMap(input.references);
  const gross = parseDecimal(input.grossAmount);
  const grossAtomic = gross.coefficient * atomicScale / (10n ** BigInt(gross.scale));
  const selectedAddons = input.addons.map((addon) => {
    const feeType = addon.feeType ?? "fixed";
    const percentage = addon.percentage ?? null;
    const configuredPercentage = feeType === "percentage" && percentage !== null
      ? parseDecimal(percentage)
      : { coefficient: 0n, scale: 0 };
    const converted = feeType === "percentage"
      ? {
          atomic: ceilDiv(
            grossAtomic * configuredPercentage.coefficient,
            100n * (10n ** BigInt(configuredPercentage.scale)),
          ),
          exact: "",
        }
      : convertToTarget(
          addon.fixedAmount, addon.feeCurrency, input.targetCurrency, rates, precision,
        );
    if (feeType === "percentage") converted.exact = decimalString(converted.atomic, precision);
    return {
      id: addon.id, key: addon.key, name: addon.name,
      amount: addon.fixedAmount, currency: addon.feeCurrency,
      targetAmount: converted.exact,
      ...(addon.feeType === undefined ? {} : { feeType }),
      ...(addon.percentage === undefined ? {} : { percentage }),
      ...(addon.selectionRule === undefined ? {} : { selectionRule: addon.selectionRule }),
      ...(addon.selectionGroup === undefined ? {} : { selectionGroup: addon.selectionGroup }),
      atomic: converted.atomic,
    };
  });
  const addonAtomic = selectedAddons.reduce((total, addon) => total + addon.atomic, 0n);
  const percentage = input.config.enabled && input.config.percentage
    ? parseDecimal(input.config.percentage)
    : { coefficient: 0n, scale: 0 };
  const percentageAtomic = ceilDiv(
    grossAtomic * percentage.coefficient,
    100n * (10n ** BigInt(percentage.scale)),
  );
  const fixedAmount = input.config.enabled ? input.config.fixedAmount : null;
  const fixedTarget = fixedAmount
    ? convertToTarget(fixedAmount, input.config.fixedCurrency, input.targetCurrency, rates, precision)
    : { atomic: 0n, exact: "0" };
  const exchangeAtomic = percentageAtomic + fixedTarget.atomic;
  const additionalAtomic = addonAtomic + exchangeAtomic;
  const legacyReceive = parseDecimal(input.legacyReceiveAmount);
  const legacyReceiveAtomic = legacyReceive.coefficient * atomicScale /
    (10n ** BigInt(legacyReceive.scale));
  const finalReceiveAtomic = legacyReceiveAtomic - additionalAtomic;
  if (finalReceiveAtomic <= 0n) {
    throw new ApiError("MANUAL_DESK_FEE_EXCEEDS_AMOUNT", "The pricing fees are greater than the gross market amount.", 422);
  }
  const addonAmount = decimalString(addonAtomic, precision);
  const percentageAmount = decimalString(percentageAtomic, precision);
  const exchangeAmount = decimalString(exchangeAtomic, precision);
  const totalAdditionalFee = decimalString(additionalAtomic, precision);
  const legacyFee = parseDecimal(input.legacyTotalFee);
  const legacyAtomic = legacyFee.coefficient * atomicScale /
    (10n ** BigInt(legacyFee.scale));
  const totalFee = decimalString(legacyAtomic + additionalAtomic, precision);
  const existingPricingFee = decimalString(legacyAtomic, precision);
  const receiveAmount = decimalString(finalReceiveAtomic, precision);
  const sourceAmount = parseDecimal(String(input.amount));
  const finalRate = decimalString(
    (finalReceiveAtomic * (10n ** BigInt(sourceAmount.scale + 30))) /
      (atomicScale * sourceAmount.coefficient),
    30,
  );
  return {
    receiveAmount: checkedNumber(receiveAmount),
    totalFee: checkedNumber(totalFee),
    rate: checkedRate(finalRate),
    receiveAmountExact: receiveAmount,
    totalFeeExact: totalFee,
    rateExact: finalRate,
    feeSnapshot: {
      selectedAddons: selectedAddons.map(({ atomic: _atomic, ...addon }) => addon),
      addonFee: addonAmount,
      exchangeFee: {
        enabled: input.config.enabled,
        percentage: input.config.enabled ? input.config.percentage : null,
        fixedAmount: input.config.enabled ? input.config.fixedAmount : null,
        fixedCurrency: input.config.fixedCurrency,
        percentageAmount,
        fixedTargetAmount: fixedTarget.exact,
        totalAmount: exchangeAmount,
      },
      totalAdditionalFee,
      existingPricingFee,
      totalFees: totalFee,
      referenceLegs: input.references,
    } satisfies ManualSwapFeeSnapshot,
  };
}

export function verifyManualSwapFeeSnapshot(input: {
  snapshot: ManualSwapFeeSnapshot;
  grossAmount: string;
  legacyReceiveAmount: string;
  legacyTotalFee: string;
  amount: number;
  targetCurrency: string;
  targetPrecision: number;
}): { receiveAmount: string; totalFee: string; rate: string } | undefined {
  try {
    const expected = applyManualSwapFees({
      grossAmount: input.grossAmount,
      legacyReceiveAmount: input.legacyReceiveAmount,
      legacyTotalFee: input.legacyTotalFee,
      amount: input.amount,
      targetCurrency: input.targetCurrency,
      targetPrecision: input.targetPrecision,
      addons: input.snapshot.selectedAddons.map((addon) => ({
        id: addon.id,
        key: addon.key,
        name: addon.name,
        fixedAmount: addon.amount,
        feeCurrency: addon.currency,
        ...(addon.feeType === undefined ? {} : { feeType: addon.feeType }),
        ...(addon.percentage === undefined ? {} : { percentage: addon.percentage }),
        selectionRule: addon.selectionRule,
        selectionGroup: addon.selectionGroup,
      })),
      config: {
        enabled: input.snapshot.exchangeFee.enabled,
        percentage: input.snapshot.exchangeFee.percentage,
        fixedAmount: input.snapshot.exchangeFee.fixedAmount,
        fixedCurrency: input.snapshot.exchangeFee.fixedCurrency,
      },
      references: input.snapshot.referenceLegs,
    });
    if (JSON.stringify(expected.feeSnapshot) !== JSON.stringify(input.snapshot)) return undefined;
    return {
      receiveAmount: expected.receiveAmountExact,
      totalFee: expected.totalFeeExact,
      rate: expected.rateExact,
    };
  } catch {
    return undefined;
  }
}

function canonicalConfiguredDecimal(value: string | null): string | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return value;
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return `${whole}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
}

/**
 * Check current catalog and fee settings against the signed quote. This only
 * authorizes the original signed price; it never recalculates a replacement.
 */
export function assertManualSwapFeeConfigurationMatches(input: {
  snapshot: ManualSwapFeeSnapshot;
  selectedAddOnKeys: string[];
  catalog: ManualSwapAddonOption[];
  config: { enabled: boolean; percentage: string | null; fixedAmount: string | null; fixedCurrency: string };
}): void {
  const fail = (): never => {
    throw new ApiError(
      "MANUAL_QUOTE_CONFIGURATION_CHANGED",
      "A selected Manual Swap add-on or fee setting changed after this quote was issued. Please request a new quote.",
      409,
    );
  };

  let selected: ManualSwapAddonOption[];
  try {
    selected = validateManualSwapAddonSelection(input.selectedAddOnKeys, input.catalog);
  } catch {
    return fail();
  }

  const signedAddons = input.snapshot.selectedAddons;
  if (signedAddons.length !== selected.length ||
      signedAddons.some((signed, index) => {
        const current = selected[index];
        return !current ||
          signed.id !== current.id ||
          signed.key !== current.key ||
          signed.name !== current.name ||
          canonicalConfiguredDecimal(signed.amount) !== canonicalConfiguredDecimal(current.fixedAmount) ||
          signed.currency.trim().toUpperCase() !== current.feeCurrency.trim().toUpperCase() ||
          (signed.feeType !== undefined && signed.feeType !== current.feeType) ||
          (signed.feeType === undefined && (current.feeType ?? "fixed") !== "fixed") ||
          (signed.percentage !== undefined &&
            canonicalConfiguredDecimal(signed.percentage) !== canonicalConfiguredDecimal(current.percentage ?? null)) ||
          (signed.selectionRule !== undefined && signed.selectionRule !== current.selectionRule) ||
          (signed.selectionGroup !== undefined &&
            signed.selectionGroup.trim().toLowerCase() !==
              (current.presentation.group.trim().toLowerCase() || "default"));
      })) {
    return fail();
  }

  const signedFee = input.snapshot.exchangeFee;
  const currentPercentage = input.config.enabled ? input.config.percentage : null;
  const currentFixedAmount = input.config.enabled ? input.config.fixedAmount : null;
  if (signedFee.enabled !== input.config.enabled ||
      canonicalConfiguredDecimal(signedFee.percentage) !==
        canonicalConfiguredDecimal(currentPercentage) ||
      canonicalConfiguredDecimal(signedFee.fixedAmount) !==
        canonicalConfiguredDecimal(currentFixedAmount) ||
      signedFee.fixedCurrency.trim().toUpperCase() !== input.config.fixedCurrency.trim().toUpperCase()) {
    return fail();
  }
}