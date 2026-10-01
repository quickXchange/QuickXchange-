import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "@workspace/db";
import {
  manualRoutePricingFallbackTerms,
  manualRoutePricingFingerprint,
  type ManualRoutePricingFingerprintInput,
} from "../src/lib/manual-route-pricing-fingerprint";
import { resolveManualPricingTerms } from "../src/lib/manual-desk-pricing";

after(async () => {
  await pool.end();
});

const baseRule: ManualRoutePricingFingerprintInput = {
  id: "rule-1",
  exactRate: "1.25",
  markupBasisPoints: 125,
  adjustmentDirection: "MARKUP",
  fixedFee: "3",
  effectiveMinAmount: 100,
  effectiveMaxAmount: undefined,
  rangeOnlyPricing: false,
  amountBasedPricingEnabled: true,
  amountBasedPricingTiers: [
    {
      minAmount: "100",
      maxAmount: "500",
      percentage: "1",
      direction: "MARKUP",
      fixedFee: "2",
    },
  ],
};

test("manual route fingerprint includes fallback terms hidden by a tier at the route minimum", () => {
  const changedBaseFee = { ...baseRule, fixedFee: "4" };

  assert.equal(manualRoutePricingFallbackTerms(baseRule)?.fixedFee, "3");
  assert.equal(manualRoutePricingFallbackTerms(changedBaseFee)?.fixedFee, "4");
  assert.notEqual(
    manualRoutePricingFingerprint(baseRule),
    manualRoutePricingFingerprint(changedBaseFee),
  );

  assert.equal(resolveManualPricingTerms(baseRule, 100).fixedFee, "2");
  // Above the configured 100–500 tier, the quote resolver uses base terms.
  assert.deepEqual(resolveManualPricingTerms(baseRule, 501), {
    selectedTier: undefined,
    adjustmentDirection: "MARKUP",
    markupBasisPoints: 125,
    percentage: undefined,
    fixedFee: "3",
  });
  assert.deepEqual(resolveManualPricingTerms(changedBaseFee, 501), {
    selectedTier: undefined,
    adjustmentDirection: "MARKUP",
    markupBasisPoints: 125,
    percentage: undefined,
    fixedFee: "4",
  });
  const changedBaseDirection = { ...baseRule, adjustmentDirection: "GIVE_MORE" };
  assert.deepEqual(resolveManualPricingTerms(changedBaseDirection, 501), {
    selectedTier: undefined,
    adjustmentDirection: "GIVE_MORE",
    markupBasisPoints: 125,
    percentage: undefined,
    fixedFee: "3",
  });
  assert.notEqual(
    manualRoutePricingFingerprint(baseRule),
    manualRoutePricingFingerprint(changedBaseDirection),
  );
});

test("manual route fingerprint is stable for cloned configuration and ignores timestamps or market rates", () => {
  const clone = structuredClone(baseRule);
  assert.equal(manualRoutePricingFingerprint(baseRule), manualRoutePricingFingerprint(clone));

  const decoratedConfig = {
    ...baseRule,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-02-01T00:00:00.000Z",
    referenceMarketRate: 1.2345,
  };
  assert.equal(
    manualRoutePricingFingerprint(baseRule),
    manualRoutePricingFingerprint(decoratedConfig),
  );
});

test("range-only pricing hashes tiers but has no active fallback terms", () => {
  const rangeOnly = { ...baseRule, rangeOnlyPricing: true };
  assert.equal(manualRoutePricingFallbackTerms(rangeOnly), null);
  assert.equal(
    manualRoutePricingFingerprint(rangeOnly),
    manualRoutePricingFingerprint({ ...rangeOnly, fixedFee: "4", adjustmentDirection: "GIVE_MORE" }),
  );
  assert.notEqual(
    manualRoutePricingFingerprint(baseRule),
    manualRoutePricingFingerprint(rangeOnly),
  );
});