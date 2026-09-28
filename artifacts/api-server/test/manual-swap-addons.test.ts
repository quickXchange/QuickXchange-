import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateManualSwapAddonBody,
  ListPublicManualSwapAddonsResponse,
  PreviewManualSwapFeesBody,
  PreviewManualSwapFeesResponse,
} from "@workspace/api-zod";
import {
  applyManualSwapFees,
  validateManualSwapAddonSelection,
  verifyManualSwapFeeSnapshot,
} from "../src/lib/manual-swap-fees";
import { signQuoteTicket, verifyQuoteTicket } from "../src/lib/quote-ticket";

const addon = {
  id: "8ca90db0-5d87-4f17-96c2-5102720b936f",
  key: "priority",
  name: "Priority processing",
  fixedAmount: "1",
  feeCurrency: "EUR",
  enabled: true,
  displayOrder: 10,
  deletedAt: null,
  selectionRule: "multiple",
  presentation: { group: "", displayOrder: 10 },
};

test("Manual Swap add-on display order is validated and backward-compatible in API contracts", () => {
  const input = CreateManualSwapAddonBody.parse({
    key: "priority",
    name: "Priority processing",
    fixedAmount: "1",
    feeCurrency: "EUR",
  });
  assert.equal(input.displayOrder, undefined);
  assert.equal(CreateManualSwapAddonBody.parse({
    key: "priority",
    name: "Priority processing",
    fixedAmount: "1",
    feeCurrency: "EUR",
    displayOrder: 4,
  }).displayOrder, 4);
  assert.throws(() => CreateManualSwapAddonBody.parse({
    key: "priority",
    name: "Priority processing",
    fixedAmount: "1",
    feeCurrency: "EUR",
    displayOrder: -1,
  }));
  assert.equal(ListPublicManualSwapAddonsResponse.parse({
    items: [{
      id: addon.id,
      key: addon.key,
      name: addon.name,
      description: "",
      fixedAmount: addon.fixedAmount,
      feeCurrency: addon.feeCurrency,
      enabled: true,
      displayOrder: addon.displayOrder,
      selectionRule: addon.selectionRule,
      presentation: { group: addon.presentation.group },
    }],
  }).items[0]?.displayOrder, 10);
});

test("Manual Swap add-ons are opt-in and unavailable or forbidden options fail closed", () => {
  assert.deepEqual(validateManualSwapAddonSelection([], [addon]), []);
  assert.deepEqual(validateManualSwapAddonSelection(["priority"], [addon]), [addon]);
  assert.throws(
    () => validateManualSwapAddonSelection(["missing"], [addon]),
    { code: "MANUAL_SWAP_ADDON_UNAVAILABLE" },
  );
  assert.throws(
    () => validateManualSwapAddonSelection(["priority"], [{ ...addon, enabled: false }]),
    { code: "MANUAL_SWAP_ADDON_UNAVAILABLE" },
  );
  assert.throws(
    () => validateManualSwapAddonSelection(["priority"], [{ ...addon, deletedAt: new Date() }]),
    { code: "MANUAL_SWAP_ADDON_UNAVAILABLE" },
  );
  assert.throws(
    () => validateManualSwapAddonSelection(["priority", "priority"], [addon]),
    { code: "MANUAL_SWAP_ADDON_DUPLICATE" },
  );
  assert.throws(
    () => validateManualSwapAddonSelection(["priority"], [{ ...addon, selectionRule: "none" }]),
    { code: "MANUAL_SWAP_ADDON_OPT_OUT" },
  );
  assert.throws(
    () => validateManualSwapAddonSelection(["priority", "other"], [
      { ...addon, selectionRule: "one", presentation: { group: "service" } },
      { ...addon, id: "9ca90db0-5d87-4f17-96c2-5102720b936f", key: "other",
        selectionRule: "multiple", presentation: { group: "service" } },
    ]),
    { code: "MANUAL_SWAP_ADDON_SELECTION_INVALID" },
  );
});

test("Manual Swap fee preview validates configuration and prices exchange fee components independently", () => {
  const previewInput = PreviewManualSwapFeesBody.parse({
    feeConfig: {
      enabled: false,
      percentage: "",
      fixedAmount: null,
      fixedCurrency: "USD",
    },
  });
  assert.equal(previewInput.exchangeAmount, 1000);
  assert.equal(previewInput.feeConfig.percentage, "");
  assert.equal(previewInput.feeConfig.fixedAmount, null);
  assert.throws(() => PreviewManualSwapFeesBody.parse({
    exchangeAmount: 0,
    feeConfig: { enabled: false, percentage: null, fixedAmount: null, fixedCurrency: "USD" },
  }));
  assert.throws(() => PreviewManualSwapFeesBody.parse({
    exchangeAmount: 1_000_000_001,
    feeConfig: { enabled: false, percentage: null, fixedAmount: null, fixedCurrency: "USD" },
  }));

  const applyPreview = (config: {
    enabled: boolean; percentage: string | null; fixedAmount: string | null; fixedCurrency: string;
  }, addons: Array<{ id: string; key: string; name: string; fixedAmount: string; feeCurrency: string }> = []) =>
    applyManualSwapFees({
      grossAmount: "1000",
      legacyReceiveAmount: "1000",
      legacyTotalFee: "0",
      amount: 1000,
      targetCurrency: "USD",
      targetPrecision: 2,
      addons,
      config,
      references: [{
        currency: "USD",
        unitsPerUsd: "1",
        provider: "USD identity",
        source: "identity",
        observedAt: "2026-01-01T00:00:00.000Z",
        timestampKind: "fetchedAt",
      }],
    });

  const both = applyPreview(
    { enabled: true, percentage: "1", fixedAmount: "2", fixedCurrency: "USD" },
    [{
      id: addon.id,
      key: addon.key,
      name: addon.name,
      fixedAmount: "3",
      feeCurrency: "USD",
    }],
  );
  assert.equal(both.feeSnapshot.exchangeFee.percentageAmount, "10");
  assert.equal(both.feeSnapshot.exchangeFee.fixedTargetAmount, "2");
  assert.equal(both.feeSnapshot.addonFee, "3");
  assert.equal(both.receiveAmountExact, "985");

  const fixedOnly = applyPreview({
    enabled: true, percentage: null, fixedAmount: "2", fixedCurrency: "USD",
  });
  assert.equal(fixedOnly.feeSnapshot.exchangeFee.totalAmount, "2");
  assert.equal(fixedOnly.receiveAmountExact, "998");

  const percentageOnly = applyPreview({
    enabled: true, percentage: "1", fixedAmount: null, fixedCurrency: "USD",
  });
  assert.equal(percentageOnly.feeSnapshot.exchangeFee.totalAmount, "10");
  assert.equal(percentageOnly.receiveAmountExact, "990");
  const disabled = applyPreview({
    enabled: false, percentage: "", fixedAmount: null, fixedCurrency: "USD",
  });
  assert.equal(disabled.receiveAmountExact, "1000");
  assert.throws(() => applyPreview({
    enabled: true, percentage: null, fixedAmount: "1001", fixedCurrency: "USD",
  }), { code: "MANUAL_DESK_FEE_EXCEEDS_AMOUNT" });

  const disabledResponse = PreviewManualSwapFeesResponse.parse({
    exchangeAmount: 1000,
    receiveAmount: disabled.receiveAmount,
    currency: "USD",
    feeSnapshot: disabled.feeSnapshot,
    feeConfig: previewInput.feeConfig,
    illustrativeOnly: true,
  });
  assert.equal(disabledResponse.feeConfig.enabled, false);
  assert.equal(disabledResponse.feeConfig.percentage, "");
  assert.equal(disabledResponse.feeConfig.fixedAmount, null);
  assert.equal(PreviewManualSwapFeesResponse.parse({
    exchangeAmount: 1000,
    receiveAmount: both.receiveAmount,
    currency: "USD",
    feeSnapshot: both.feeSnapshot,
    feeConfig: { enabled: true, percentage: "1", fixedAmount: "2", fixedCurrency: "USD" },
    illustrativeOnly: true,
  }).feeSnapshot.totalAdditionalFee, "15");
});

test("fees convert fixed amounts exactly, deduct only from receive, and snapshot references", () => {
  const optedOut = applyManualSwapFees({
    grossAmount: "100",
    legacyReceiveAmount: "95",
    legacyTotalFee: "5",
    amount: 10,
    targetCurrency: "USD",
    targetPrecision: 2,
    addons: [],
    config: { enabled: false, percentage: null, fixedAmount: null, fixedCurrency: "USD" },
    references: [],
  });
  assert.equal(optedOut.receiveAmountExact, "95");
  assert.equal(optedOut.totalFeeExact, "5");
  assert.equal(optedOut.feeSnapshot.existingPricingFee, "5");
  assert.equal(optedOut.feeSnapshot.totalFees, "5");

  const result = applyManualSwapFees({
    grossAmount: "100",
    legacyReceiveAmount: "95",
    legacyTotalFee: "5",
    amount: 10,
    targetCurrency: "USD",
    targetPrecision: 2,
    addons: [addon],
    config: {
      enabled: true,
      percentage: "2",
      fixedAmount: "0.25",
      fixedCurrency: "USD",
    },
    references: [
      { currency: "EUR", unitsPerUsd: "2", provider: "manual", source: "test",
        observedAt: "2026-01-01T00:00:00.000Z", timestampKind: "fetchedAt" },
      { currency: "USD", unitsPerUsd: "1", provider: "USD identity", source: "identity",
        observedAt: "2026-01-01T00:00:00.000Z", timestampKind: "fetchedAt" },
    ],
  });
  assert.equal(result.feeSnapshot.selectedAddons[0]?.targetAmount, "0.5");
  assert.equal(result.feeSnapshot.addonFee, "0.5");
  assert.equal(result.feeSnapshot.exchangeFee.percentageAmount, "2");
  assert.equal(result.feeSnapshot.exchangeFee.fixedTargetAmount, "0.25");
  assert.equal(result.feeSnapshot.totalAdditionalFee, "2.75");
  assert.equal(result.feeSnapshot.existingPricingFee, "5");
  assert.equal(result.feeSnapshot.totalFees, "7.75");
  assert.equal(result.receiveAmountExact, "92.25");
  assert.equal(result.totalFeeExact, "7.75");
  assert.throws(() => applyManualSwapFees({
    grossAmount: "100",
    legacyReceiveAmount: "95",
    legacyTotalFee: "5",
    amount: 10,
    targetCurrency: "USD",
    targetPrecision: 2,
    addons: [addon],
    config: { enabled: false, percentage: null, fixedAmount: null, fixedCurrency: "USD" },
    references: [{ currency: "USD", unitsPerUsd: "1", provider: "USD identity",
      source: "identity", observedAt: "2026-01-01T00:00:00.000Z", timestampKind: "fetchedAt" }],
  }), { code: "MANUAL_SWAP_REFERENCE_UNAVAILABLE" });

  const verified = verifyManualSwapFeeSnapshot({
    snapshot: result.feeSnapshot,
    grossAmount: "100",
    legacyReceiveAmount: "95",
    legacyTotalFee: "5",
    amount: 10,
    targetCurrency: "USD",
    targetPrecision: 2,
  });
  assert.deepEqual(verified, {
    receiveAmount: "92.25",
    totalFee: "7.75",
    rate: "9.225",
  });
  const tampered = structuredClone(result.feeSnapshot);
  tampered.selectedAddons[0]!.targetAmount = "0.49";
  assert.equal(verifyManualSwapFeeSnapshot({
    snapshot: tampered,
    grossAmount: "100",
    legacyReceiveAmount: "95",
    legacyTotalFee: "5",
    amount: 10,
    targetCurrency: "USD",
    targetPrecision: 2,
  }), undefined);
  const tamperedExisting = structuredClone(result.feeSnapshot);
  tamperedExisting.existingPricingFee = "4.99";
  assert.equal(verifyManualSwapFeeSnapshot({
    snapshot: tamperedExisting,
    grossAmount: "100",
    legacyReceiveAmount: "95",
    legacyTotalFee: "5",
    amount: 10,
    targetCurrency: "USD",
    targetPrecision: 2,
  }), undefined);
  const tamperedTotal = structuredClone(result.feeSnapshot);
  tamperedTotal.totalFees = "7.74";
  assert.equal(verifyManualSwapFeeSnapshot({
    snapshot: tamperedTotal,
    grossAmount: "100",
    legacyReceiveAmount: "95",
    legacyTotalFee: "5",
    amount: 10,
    targetCurrency: "USD",
    targetPrecision: 2,
  }), undefined);
});

test("30-place repeating final rates remain representable with fees off and on", () => {
  const base = {
    grossAmount: "100",
    legacyReceiveAmount: "95",
    legacyTotalFee: "5",
    amount: 3,
    targetCurrency: "USD",
    targetPrecision: 0,
    addons: [],
    references: [],
  };
  const disabled = applyManualSwapFees({
    ...base,
    config: { enabled: false, percentage: null, fixedAmount: null, fixedCurrency: "USD" },
  });
  assert.equal(disabled.receiveAmountExact, "95");
  assert.equal(disabled.rateExact, "31.666666666666666666666666666666");
  assert.ok(Number.isFinite(disabled.rate));

  const enabled = applyManualSwapFees({
    ...base,
    config: { enabled: true, percentage: "1", fixedAmount: null, fixedCurrency: "USD" },
  });
  assert.equal(enabled.receiveAmountExact, "94");
  assert.equal(enabled.rateExact, "31.333333333333333333333333333333");
  assert.ok(Number.isFinite(enabled.rate));
});

test("legacy signed Manual Swap quote tickets remain valid without fee snapshots", () => {
  process.env.SESSION_SECRET = "manual-swap-test-secret";
  const quoteId = signQuoteTicket({
    v: 1,
    type: "manual",
    fromAsset: "EUR",
    fromNetwork: "EUR",
    toAsset: "USD",
    toNetwork: "USD",
    amount: 1,
    receiveAmount: 2,
    rate: 2,
    fee: 0,
    grossMarketAmount: 2,
    percentageCommission: 0,
    fixedCommission: 0,
    totalFee: 0,
    pricingRuleId: "rule-1",
    pricingRuleVersion: 1,
    pricingRuleName: "Legacy",
    pricingSnapshot: {
      policyVersion: "manual-desk-pricing-v1",
      rule: {
        id: "rule-1", version: 1, name: "Legacy",
        selectors: {
          sourceAsset: null, targetAsset: null, sourceNetwork: null,
          targetNetwork: null, paymentMethod: null, payoutMethod: null,
        },
        markupBasisPoints: 0,
        adjustmentDirection: "MARKUP",
        fixedFee: null,
      },
      context: {
        sourceAsset: "EUR", targetAsset: "USD", sourceNetwork: "EUR",
        targetNetwork: "USD", paymentMethod: "", payoutMethod: "",
      },
      reference: {
        source: {
          currency: "EUR", unitsPerUsd: "0.5", provider: "manual", source: "test",
          observedAt: "2026-01-01T00:00:00.000Z", timestampKind: "fetchedAt",
        },
        target: {
          currency: "USD", unitsPerUsd: "1", provider: "USD identity", source: "identity",
          observedAt: "2026-01-01T00:00:00.000Z", timestampKind: "fetchedAt",
        },
        executionProvider: "Manual desk",
      },
      targetPrecision: 0,
      rounding: {
        grossMarketAmount: "truncate",
        percentageCommission: "ceil",
        fixedCommission: "ceil",
        finalRate: "truncate",
        finalRateScale: 30,
      },
      amounts: {
        grossMarketAmount: "2", percentageCommission: "0", fixedCommission: "0",
        totalFee: "0", receiveAmount: "2", finalRate: "2",
      },
    },
    provider: "Manual desk",
    expiresAt: Date.now() + 60_000,
  });
  const ticket = verifyQuoteTicket(quoteId, {
    type: "manual",
    fromAsset: "EUR",
    fromNetwork: "EUR",
    toAsset: "USD",
    toNetwork: "USD",
    amount: 1,
  });
  assert.equal(ticket.receiveAmount, 2);
  assert.deepEqual(ticket.selectedAddOnKeys, undefined);
  assert.throws(() => verifyQuoteTicket(quoteId, {
    type: "manual",
    fromAsset: "EUR",
    fromNetwork: "EUR",
    toAsset: "USD",
    toNetwork: "USD",
    amount: 1,
    selectedAddOnKeys: ["priority"],
  }), { code: "QUOTE_MISMATCH" });
});