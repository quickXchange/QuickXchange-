import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, manualDeskPricingRulesTable } from "@workspace/db";
import { getManualDeskEstimate } from "../src/lib/manual-desk-rates";
import {
  bulkUpdateManualPricingRules,
  matchManualDeskPricingRule,
  reciprocalExactRate,
  selectManualPricingRule,
} from "../src/lib/manual-desk-pricing";
import { listPublicManualCryptoSettlementOptions } from "../src/lib/manual-crypto";
import { listPublicFiatSettlementOptions } from "../src/lib/payment-methods";

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

test("one Any Source rule covers every enabled Swap crypto network and exact routes win", async () => {
  const [cryptoOptions, fiatOptions] = await Promise.all([
    listPublicManualCryptoSettlementOptions(),
    listPublicFiatSettlementOptions(),
  ]);
  const sources = cryptoOptions.filter(option =>
    option.direction === "send" || option.direction === "both");
  const sepaInstant = fiatOptions.find(option =>
    option.assetCode.toUpperCase() === "EUR" &&
    option.title.trim().toUpperCase() === "SEPA INSTANT" &&
    (option.direction === "receive" || option.direction === "both"));
  assert.ok(sepaInstant, "SEPA Instant must be an enabled EUR receive option");
  assert.ok(sources.length > 0, "Swap must expose at least one enabled crypto source");

  const wildcard = {
    id: "any-source-to-sepa-instant",
    priority: 0,
    enabled: true,
    exactRate: null,
    // These stale source fields model an older partial-wildcard row. The null
    // source option ID remains authoritative and must mean Any Source.
    sourceAsset: "STALE",
    sourceNetwork: "STALE",
    sourceSettlementOptionId: null,
    targetAsset: sepaInstant.assetCode,
    targetNetwork: sepaInstant.routeNetwork,
    targetSettlementOptionId: sepaInstant.id,
  };
  const specificSource = sources.find(option => option.assetCode.toUpperCase() === "BTC") ??
    sources[0]!;
  const specific = {
    id: "specific-source-to-sepa-instant",
    priority: 0,
    enabled: true,
    exactRate: null,
    sourceAsset: specificSource.assetCode,
    sourceNetwork: specificSource.routeNetwork,
    sourceSettlementOptionId: specificSource.id,
    targetAsset: sepaInstant.assetCode,
    targetNetwork: sepaInstant.routeNetwork,
    targetSettlementOptionId: sepaInstant.id,
  };

  for (const source of sources) {
    const context = {
      sourceAsset: source.assetCode,
      sourceNetwork: source.routeNetwork,
      sourceSettlementOptionId: source.id,
      targetAsset: sepaInstant.assetCode,
      targetNetwork: sepaInstant.routeNetwork,
      targetSettlementOptionId: sepaInstant.id,
    };
    assert.equal(
      selectManualPricingRule([wildcard], context)?.id,
      wildcard.id,
      `${source.assetCode}/${source.routeNetwork} must inherit Any Source → SEPA Instant`,
    );
    assert.equal(
      selectManualPricingRule([wildcard, specific], context)?.id,
      source.id === specificSource.id ? specific.id : wildcard.id,
      `${source.assetCode}/${source.routeNetwork} must follow exact > wildcard priority`,
    );
  }
});

test("bulk transitions from legacy partial wildcards canonicalize both Any sides", async () => {
  const ids = [randomUUID(), randomUUID()];
  try {
    await db.insert(manualDeskPricingRulesTable).values([
      {
        id: ids[0],
        name: "Legacy source to stale Any target",
        sourceAsset: "BTC",
        sourceNetwork: "BITCOIN",
        sourceSettlementOptionId: `test:btc:${ids[0]}`,
        targetAsset: "STALE",
        targetNetwork: "STALE",
        payoutMethod: "STALE",
        markupBasisPoints: 100,
        priority: 910001,
        enabled: true,
      },
      {
        id: ids[1],
        name: "Legacy stale Any source to target",
        sourceAsset: "STALE",
        sourceNetwork: "STALE",
        paymentMethod: "STALE",
        targetAsset: "EUR",
        targetNetwork: "SEPA",
        targetSettlementOptionId: `test:sepa:${ids[1]}`,
        markupBasisPoints: 100,
        priority: 910002,
        enabled: true,
      },
    ]);

    const first = await bulkUpdateManualPricingRules(
      [{ id: ids[0], version: 1 }],
      "edit",
      { sourceSettlementOptionId: null },
    );
    assert.deepEqual(first.updatedIds, [ids[0]]);
    const second = await bulkUpdateManualPricingRules(
      [{ id: ids[1], version: 1 }],
      "edit",
      { targetSettlementOptionId: null },
    );
    assert.deepEqual(second.updatedIds, [ids[1]]);

    const rows = await db.select().from(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ids));
    for (const row of rows) {
      assert.equal(row.sourceSettlementOptionId, null);
      assert.equal(row.targetSettlementOptionId, null);
      assert.equal(row.sourceAsset, null);
      assert.equal(row.sourceNetwork, null);
      assert.equal(row.paymentMethod, null);
      assert.equal(row.targetAsset, null);
      assert.equal(row.targetNetwork, null);
      assert.equal(row.payoutMethod, null);
    }
  } finally {
    await db.delete(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ids));
  }
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
  const [legacy, fallbackRule] = await db.insert(manualDeskPricingRulesTable).values([
    {
      name: `Legacy exact-less ${suffix}`,
      sourceSettlementOptionId: sourceOption,
      targetSettlementOptionId: targetOption,
      markupBasisPoints: 60,
      priority: 0,
      enabled: true,
    },
    {
      name: `Test-owned global fallback ${suffix}`,
      markupBasisPoints: 60,
      priority: -910000,
      enabled: true,
    },
  ]).returning({ id: manualDeskPricingRulesTable.id });

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
    assert.equal(fallback.id, fallbackRule!.id);
  } finally {
    await db.delete(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, [legacy!.id, fallbackRule!.id]));
  }
});