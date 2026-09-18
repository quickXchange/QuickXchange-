import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, manualDeskPricingRulesTable } from "@workspace/db";
import { getManualDeskEstimate } from "../src/lib/manual-desk-rates";
import {
  matchManualDeskPricingRule,
  reciprocalExactRate,
  selectManualPricingRule,
} from "../src/lib/manual-desk-pricing";

after(async () => {
  await pool.end();
});

test("exact path rate scales target atomic units once", async () => {
  const quote = await getManualDeskEstimate({
    sourceCurrency: "EUR",
    targetCurrency: "XMR",
    targetPrecision: 8,
    amount: 1,
    exactRate: "4",
    markupBasisPoints: 0,
  });
  assert.equal(quote.exact.grossMarketAmount, "4");
  assert.equal(quote.grossMarketAmount, 4);
});

test("give-more direction increases the market rate with floor adjustment rounding", async () => {
  const quote = await getManualDeskEstimate({
    sourceCurrency: "USDT",
    targetCurrency: "EUR",
    targetPrecision: 4,
    amount: 1,
    exactRate: "0.86",
    markupBasisPoints: 200,
    adjustmentDirection: "GIVE_MORE",
  });
  assert.equal(quote.exact.grossMarketAmount, "0.86");
  assert.equal(quote.exact.percentageCommission, "0.0172");
  assert.equal(quote.exact.receiveAmount, "0.8772");
  assert.equal(quote.rate, 0.8772);
});

test("exact reciprocal uses canonical decimal integer arithmetic", () => {
  assert.equal(reciprocalExactRate("4"), "0.25");
  assert.equal(reciprocalExactRate("0.125"), "8");
  assert.equal(reciprocalExactRate("3"), "0.333333333333333333333333333333333333");
});

test("exact route reference rate applies markup without binary floating point", async () => {
  const { getManualDeskReferenceRate } = await import("../src/lib/manual-desk-rates");
  assert.equal(
    await getManualDeskReferenceRate({
      sourceCurrency: "EUR",
      targetCurrency: "XMR",
      exactRate: "4",
      markupBasisPoints: 250,
    }),
    3.9,
  );
});

test("selector matching keeps settlement option and network paths isolated", () => {
  const rules = [
    {
      id: "direct", priority: 1, enabled: true, exactRate: "4",
      sourceAsset: "EUR", targetAsset: "XMR", sourceNetwork: "SEPA",
      targetNetwork: "MONERO", sourceSettlementOptionId: "pay-a",
      targetSettlementOptionId: "net-a",
    },
    {
      id: "other-network", priority: 99, enabled: true, exactRate: "9",
      sourceAsset: "EUR", targetAsset: "XMR", sourceNetwork: "SEPA",
      targetNetwork: "MONERO-ALT", sourceSettlementOptionId: "pay-a",
      targetSettlementOptionId: "net-b",
    },
  ];
  assert.equal(selectManualPricingRule(rules, {
    sourceAsset: "EUR", targetAsset: "XMR", sourceNetwork: "SEPA",
    targetNetwork: "MONERO", sourceSettlementOptionId: "pay-a",
    targetSettlementOptionId: "net-a",
  })?.id, "direct");
  assert.equal(selectManualPricingRule(rules, {
    sourceAsset: "EUR", targetAsset: "XMR", sourceNetwork: "SEPA",
    targetNetwork: "MONERO", sourceSettlementOptionId: "pay-a",
    targetSettlementOptionId: "net-b",
  }), undefined);
});

test("database matcher prefers direct paths and synthesizes reciprocal paths", async () => {
  const suffix = randomUUID();
  const eurOption = `test:eur:${suffix}`;
  const xmrOption = `test:xmr:${suffix}`;
  const ids: string[] = [];

  try {
    const [forward] = await db.insert(manualDeskPricingRulesTable).values({
      name: `Exact EUR to XMR ${suffix}`,
      sourceAsset: "EUR",
      targetAsset: "XMR",
      sourceNetwork: "SEPA",
      targetNetwork: "MONERO",
      sourceSettlementOptionId: eurOption,
      targetSettlementOptionId: xmrOption,
      markupBasisPoints: 0,
      exactRate: "4",
      priority: 0,
      enabled: true,
    }).returning({ id: manualDeskPricingRulesTable.id });
    ids.push(forward!.id);

    const direct = await matchManualDeskPricingRule({
      sourceAsset: "EUR",
      targetAsset: "XMR",
      sourceNetwork: "SEPA",
      targetNetwork: "MONERO",
      sourceSettlementOptionId: eurOption,
      targetSettlementOptionId: xmrOption,
    });
    assert.equal(direct.id, forward!.id);
    assert.equal(direct.exactRateSource, "direct");
    assert.equal(Number(direct.exactRate), 4);

    const reciprocal = await matchManualDeskPricingRule({
      sourceAsset: "XMR",
      targetAsset: "EUR",
      sourceNetwork: "MONERO",
      targetNetwork: "SEPA",
      sourceSettlementOptionId: xmrOption,
      targetSettlementOptionId: eurOption,
    });
    assert.equal(reciprocal.id, forward!.id);
    assert.equal(reciprocal.exactRateSource, "reciprocal");
    assert.equal(reciprocal.exactRate, "0.25");

    const [reverse] = await db.insert(manualDeskPricingRulesTable).values({
      name: `Exact XMR to EUR ${suffix}`,
      sourceAsset: "XMR",
      targetAsset: "EUR",
      sourceNetwork: "MONERO",
      targetNetwork: "SEPA",
      sourceSettlementOptionId: xmrOption,
      targetSettlementOptionId: eurOption,
      markupBasisPoints: 0,
      exactRate: "0.3",
      priority: 0,
      enabled: true,
    }).returning({ id: manualDeskPricingRulesTable.id });
    ids.push(reverse!.id);

    const explicitReverse = await matchManualDeskPricingRule({
      sourceAsset: "XMR",
      targetAsset: "EUR",
      sourceNetwork: "MONERO",
      targetNetwork: "SEPA",
      sourceSettlementOptionId: xmrOption,
      targetSettlementOptionId: eurOption,
    });
    assert.equal(explicitReverse.id, reverse!.id);
    assert.equal(explicitReverse.exactRateSource, "direct");
    assert.equal(Number(explicitReverse.exactRate), 0.3);
  } finally {
    if (ids.length) {
      await db.delete(manualDeskPricingRulesTable)
        .where(inArray(manualDeskPricingRulesTable.id, ids));
    }
  }
});

test("database matcher falls back to legacy selector/provider pricing", async () => {
  const suffix = randomUUID();
  const sourceOption = `test:legacy-source:${suffix}`;
  const targetOption = `test:legacy-target:${suffix}`;
  const [legacy] = await db.insert(manualDeskPricingRulesTable).values({
    name: `Legacy exact-less ${suffix}`,
    sourceSettlementOptionId: sourceOption,
    targetSettlementOptionId: targetOption,
    markupBasisPoints: 60,
    priority: 0,
    enabled: true,
  }).returning({ id: manualDeskPricingRulesTable.id });

  try {
    const matched = await matchManualDeskPricingRule({
      sourceSettlementOptionId: sourceOption,
      targetSettlementOptionId: targetOption,
    });
    assert.equal(matched.id, legacy!.id);
    assert.equal(matched.exactRate, null);
    const fallback = await matchManualDeskPricingRule({
      sourceSettlementOptionId: `test:unmatched-source:${suffix}`,
      targetSettlementOptionId: `test:unmatched-target:${suffix}`,
    });
    assert.equal(fallback.exactRate, null);
  } finally {
    await db.delete(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, legacy!.id));
  }
});