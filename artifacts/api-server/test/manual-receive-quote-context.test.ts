import assert from "node:assert/strict";
import test from "node:test";
import { solveManualReceiveQuote } from "../src/lib/manual-receive-quote";
import { createRequestScopedManualReceiveContext } from "../src/lib/manual-receive-quote-context";
import { applyManualSwapFees } from "../src/lib/manual-swap-fees";

test("reverse probes reuse prepared USDT/TRC20 to EUR/SEPAInstant pricing and return the canonical forward amount", async () => {
  const pricingContext = {
    route: {
      fromAsset: "USDT",
      fromNetwork: "TRC20",
      toAsset: "EUR",
      toNetwork: "SEPAInstant",
      targetPrecision: 2,
    },
    rule: {
      amountBasedPricingTiers: [
        { minAmount: "100", maxAmount: "499.99", percentage: "1", direction: "MARKUP" as const, fixedFee: "2" },
        { minAmount: "500", maxAmount: "999.99", percentage: "2", direction: "GIVE_MORE" as const, fixedFee: "1" },
        { minAmount: "1000", maxAmount: "3000", percentage: "2.5", direction: "MARKUP" as const, fixedFee: "3" },
      ],
      adjustmentDirection: "MARKUP" as const,
      markupBasisPoints: 100,
      fixedFee: "1",
    },
    addons: [{
      id: "priority-addon",
      key: "priority",
      name: "Priority processing",
      fixedAmount: "7.50",
      feeCurrency: "EUR",
      feeType: "fixed" as const,
      selectionRule: "multiple",
      selectionGroup: "service",
    }],
  };
  let contextResolveCount = 0;
  const resolveContext = createRequestScopedManualReceiveContext(async () => {
    contextResolveCount++;
    return pricingContext;
  });
  const forwardQuotes = new Map<number, {
    receiveAmount: number;
    selectedTierMinimum?: string;
  }>();
  const quoteWithForwardPricing = async (amount: number) => {
    const context = await resolveContext();
    const selectedTier = context.rule.amountBasedPricingTiers.find((tier) =>
      amount >= Number(tier.minAmount) &&
      amount <= Number(tier.maxAmount),
    );
    const direction = selectedTier?.direction ?? context.rule.adjustmentDirection;
    const percentage = selectedTier?.percentage ?? String(context.rule.markupBasisPoints / 100);
    const fixedFee = selectedTier?.fixedFee ?? context.rule.fixedFee;
    // The configured exact route rate is 0.93 EUR per USDT; calculate the
    // tiered desk amount at currency precision before applying selected add-ons.
    const grossMinor = Math.floor(amount * 93 + 1e-7);
    const percentageNumerator = grossMinor * Number(percentage);
    const percentageMinor = direction === "GIVE_MORE"
      ? Math.floor(percentageNumerator / 100)
      : Math.ceil(percentageNumerator / 100);
    const fixedMinor = Math.ceil(Number(fixedFee) * 100);
    const legacyReceiveMinor = direction === "GIVE_MORE"
      ? grossMinor + percentageMinor - fixedMinor
      : grossMinor - percentageMinor - fixedMinor;
    const money = (minor: number) => (minor / 100).toFixed(2);
    const feeAdjusted = applyManualSwapFees({
      grossAmount: money(grossMinor),
      legacyReceiveAmount: money(legacyReceiveMinor),
      legacyTotalFee: money(direction === "GIVE_MORE"
        ? fixedMinor
        : percentageMinor + fixedMinor),
      amount,
      targetCurrency: context.route.toAsset,
      targetPrecision: context.route.targetPrecision,
      addons: context.addons,
      config: {
        enabled: false,
        percentage: null,
        fixedAmount: null,
        fixedCurrency: "USD",
      },
      references: [
        {
          currency: "USDT",
          unitsPerUsd: "1",
          provider: "test adapter",
          source: "test",
          observedAt: "2026-01-01T00:00:00.000Z",
          timestampKind: "fetchedAt",
        },
        {
          currency: "EUR",
          unitsPerUsd: "1",
          provider: "test adapter",
          source: "test",
          observedAt: "2026-01-01T00:00:00.000Z",
          timestampKind: "fetchedAt",
        },
      ],
    });
    forwardQuotes.set(amount, {
      receiveAmount: feeAdjusted.receiveAmount,
      selectedTierMinimum: selectedTier?.minAmount,
    });
    return feeAdjusted.receiveAmount;
  };

  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 1_000,
    minAmount: 100,
    maxAmount: 3_000,
    initialUpperAmount: 1_000 / 0.93,
    tierBoundaries: pricingContext.rule.amountBasedPricingTiers.flatMap((tier) => [
      Number(tier.minAmount),
      Number(tier.maxAmount),
    ]),
    receiveQuantum: 0.01,
    maxAttempts: 44,
    quote: quoteWithForwardPricing,
  });

  assert.ok(solution);
  assert.equal(contextResolveCount, 1);
  assert.equal(pricingContext.route.fromAsset, "USDT");
  assert.equal(pricingContext.route.fromNetwork, "TRC20");
  assert.equal(pricingContext.route.toAsset, "EUR");
  assert.equal(pricingContext.route.toNetwork, "SEPAInstant");
  assert.ok(forwardQuotes.has(499.99));
  assert.ok(forwardQuotes.has(500));
  assert.ok(forwardQuotes.has(999.99));
  assert.ok(forwardQuotes.has(1_000));

  const finalForwardQuote = forwardQuotes.get(solution.amount);
  assert.ok(finalForwardQuote);
  assert.equal(finalForwardQuote.selectedTierMinimum, "1000");
  assert.equal(finalForwardQuote.receiveAmount, solution.receiveAmount);
  assert.ok(solution.receiveAmount >= 1_000);
});