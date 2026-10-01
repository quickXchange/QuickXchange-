import assert from "node:assert/strict";
import test from "node:test";
import {
  createManualDeskEstimateReferenceContext,
  getManualDeskEstimate,
  type ManualDeskEstimateReferenceInput,
} from "../src/lib/manual-desk-rates";

function quoteWithoutFreshObservationTime(quote: Awaited<ReturnType<typeof getManualDeskEstimate>>) {
  const reference = (value: typeof quote.exact.sourceReference) => ({
    currency: value.currency,
    unitsPerUsd: value.unitsPerUsd,
    provider: value.provider,
    source: value.source,
  });
  return {
    grossMarketAmount: quote.grossMarketAmount,
    percentageCommission: quote.percentageCommission,
    fixedCommission: quote.fixedCommission,
    totalFee: quote.totalFee,
    receiveAmount: quote.receiveAmount,
    rate: quote.rate,
    fee: quote.fee,
    exact: {
      ...quote.exact,
      sourceReference: reference(quote.exact.sourceReference),
      targetReference: reference(quote.exact.targetReference),
      additionalReferences: quote.exact.additionalReferences.map(reference),
    },
  };
}

test("reverse quote reference basis is shared across probes without caching amounts or fee math", async () => {
  const context = createManualDeskEstimateReferenceContext();
  const referenceInput: ManualDeskEstimateReferenceInput = {
    sourceCurrency: "USDT",
    targetCurrency: "EUR",
    exactRate: "0.93",
  };
  const resolutions = Array.from({ length: 44 }, () => context.resolve(referenceInput));
  assert.ok(resolutions.every((resolution) => resolution === resolutions[0]));
  const referenceBasis = await resolutions[0]!;

  const cases = [
    { amount: 100, percentage: "1", fixedFee: "2", adjustmentDirection: "MARKUP" as const },
    { amount: 499.99, percentage: "1", fixedFee: "2", adjustmentDirection: "MARKUP" as const },
    { amount: 500, percentage: "2", fixedFee: "1", adjustmentDirection: "GIVE_MORE" as const },
    { amount: 999.99, percentage: "2", fixedFee: "1", adjustmentDirection: "GIVE_MORE" as const },
    { amount: 1_000, percentage: "2.5", fixedFee: "3", adjustmentDirection: "MARKUP" as const },
  ];

  for (const pricingCase of cases) {
    const input = {
      ...referenceInput,
      targetPrecision: 2,
      markupBasisPoints: 100,
      ...pricingCase,
    };
    const withoutBasis = await getManualDeskEstimate(input);
    const withBasis = await getManualDeskEstimate({ ...input, referenceBasis });
    assert.deepEqual(
      quoteWithoutFreshObservationTime(withBasis),
      quoteWithoutFreshObservationTime(withoutBasis),
    );
  }
});

test("reference bases are isolated by request, route, rate, and add-on currency set", async () => {
  let resolutionCount = 0;
  const resolveBasis = async () => {
    resolutionCount++;
    return Object.freeze({});
  };
  const firstContext = createManualDeskEstimateReferenceContext(resolveBasis);
  const secondContext = createManualDeskEstimateReferenceContext(resolveBasis);
  const first: ManualDeskEstimateReferenceInput = {
    sourceCurrency: "USDT",
    targetCurrency: "EUR",
    exactRate: "0.93",
    additionalCurrencies: ["USD", "EUR"],
  };
  const normalizedEquivalent: ManualDeskEstimateReferenceInput = {
    sourceCurrency: "usdt",
    targetCurrency: "eur",
    exactRate: "0.9300",
    additionalCurrencies: ["eur", "usd", "EUR"],
  };
  const basis = await firstContext.resolve(first);
  assert.equal(await firstContext.resolve(normalizedEquivalent), basis);
  assert.notEqual(await secondContext.resolve(first), basis);
  assert.notEqual(await firstContext.resolve({
    ...first,
    targetCurrency: "GBP",
  }), basis);
  assert.notEqual(await firstContext.resolve({
    ...first,
    additionalCurrencies: ["USD", "GBP"],
  }), basis);
  assert.equal(resolutionCount, 4);
});

test("reference basis preparation rejects invalid rates and memoizes the failure per request key", async () => {
  const failure = new Error("basis preparation failed");
  let resolutionCount = 0;
  const context = createManualDeskEstimateReferenceContext(async () => {
    resolutionCount++;
    throw failure;
  });
  const input: ManualDeskEstimateReferenceInput = {
    sourceCurrency: "USDT",
    targetCurrency: "EUR",
    exactRate: "0.93",
  };
  const first = context.resolve(input);
  const second = context.resolve(input);
  assert.equal(first, second);
  await assert.rejects(first, (error) => error === failure);
  await assert.rejects(second, (error) => error === failure);
  assert.equal(resolutionCount, 1);
});