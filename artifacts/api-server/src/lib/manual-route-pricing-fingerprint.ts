import { createHash } from "node:crypto";

type ManualRoutePricingTier = {
  minAmount: string;
  maxAmount: string | null;
  percentage: string;
  direction: "MARKUP" | "GIVE_MORE";
  fixedFee?: string;
};

export type ManualRoutePricingFingerprintInput = {
  id: string;
  exactRate: string | null;
  markupBasisPoints: number;
  adjustmentDirection: string;
  fixedFee: string | null;
  effectiveMinAmount?: number;
  effectiveMaxAmount?: number;
  rangeOnlyPricing: boolean;
  amountBasedPricingEnabled: boolean;
  amountBasedPricingTiers: ManualRoutePricingTier[];
};

function canonicalPricingDecimal(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return text;
  const integer = match[2]!.replace(/^0+(?=\d)/, "");
  const fraction = match[3]?.replace(/0+$/, "");
  return `${match[1]}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function manualRoutePricingFallbackTerms(
  rule: Pick<
    ManualRoutePricingFingerprintInput,
    "markupBasisPoints" | "adjustmentDirection" | "fixedFee" | "rangeOnlyPricing"
  >,
) {
  if (rule.rangeOnlyPricing) return null;
  return {
    markupBasisPoints: rule.markupBasisPoints,
    adjustmentDirection: rule.adjustmentDirection,
    percentage: null,
    fixedFee: canonicalPricingDecimal(rule.fixedFee),
  };
}

export function manualRoutePricingFingerprint(
  rule: ManualRoutePricingFingerprintInput,
): string {
  const canonicalRule = {
    id: rule.id,
    exactRate: canonicalPricingDecimal(rule.exactRate),
    fallbackTerms: manualRoutePricingFallbackTerms(rule),
    effectiveMinAmount: canonicalPricingDecimal(rule.effectiveMinAmount),
    effectiveMaxAmount: canonicalPricingDecimal(rule.effectiveMaxAmount),
    rangeOnlyPricing: rule.rangeOnlyPricing,
    amountBasedPricingEnabled: rule.amountBasedPricingEnabled,
    amountBasedPricingTiers: rule.amountBasedPricingTiers.map((tier) => ({
      minAmount: canonicalPricingDecimal(tier.minAmount),
      maxAmount: canonicalPricingDecimal(tier.maxAmount),
      percentage: canonicalPricingDecimal(tier.percentage),
      direction: tier.direction,
      fixedFee: canonicalPricingDecimal(tier.fixedFee),
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonicalRule)).digest("hex");
}