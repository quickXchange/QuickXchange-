import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
  manualDeskPricingRulesTable,
  pool,
} from "@workspace/db";
import { getManualDeskEstimate } from "../src/lib/manual-desk-rates";
import {
  bulkUpdateManualPricingRules,
  createManualPricingRule,
  ALL_NETWORKS_PRICING_SELECTOR,
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

test("asset selectors match every network and outrank Any", () => {
  const assetRule = {
    id: "asset", priority: 0, sourceCryptoAssetId: "btc", targetCryptoAssetId: "usd",
    sourceAsset: null, targetAsset: null, sourceNetwork: null, targetNetwork: null,
    paymentMethod: null, payoutMethod: null, sourceSettlementOptionId: null,
    targetSettlementOptionId: null,
  };
  const anyRule = {
    ...assetRule, id: "any", sourceCryptoAssetId: null, targetCryptoAssetId: null,
  };
  const selected = selectManualPricingRule([anyRule, assetRule], {
    sourceCryptoAssetId: "btc", targetCryptoAssetId: "usd",
    sourceNetwork: "TRC20", targetNetwork: "SEPA",
  });
  assert.equal(selected?.id, "asset");
});

test("persisted asset pricing applies one exact rate and commission across every network", async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toLowerCase();
  const assetId = `test-asset-${suffix}`;
  const assetCode = `T${suffix.toUpperCase()}`;
  const networkIds = [`${assetId}-one`, `${assetId}-two`];
  let ruleId: string | undefined;
  try {
    await db.insert(cryptoAssetsTable).values({
      id: assetId,
      code: assetCode,
      name: `Test asset ${suffix}`,
      decimals: 8,
    });
    await db.insert(cryptoAssetNetworksTable).values(networkIds.map((id, index) => ({
      id,
      assetId,
      networkCode: `TEST${index + 1}`,
      networkName: `Test Network ${index + 1}`,
      decimals: 8,
    })));
    const rule = await createManualPricingRule({
      name: `Any to ${assetCode}`,
      targetCryptoAssetId: assetId,
      markupBasisPoints: 200,
      exactRate: "0.95",
      priority: 987655,
      enabled: true,
    });
    ruleId = rule.id;
    assert.equal(rule.targetCryptoAssetId, assetId);
    assert.equal(rule.targetAsset, null);
    assert.equal(rule.targetNetwork, null);
    assert.equal(rule.targetSettlementOptionId, null);

    for (const networkId of networkIds) {
      const matched = await matchManualDeskPricingRule({
        sourceAsset: "EUR",
        sourceNetwork: "SEPA",
        sourceSettlementOptionId: "test-eur-sepa",
        targetAsset: assetCode,
        targetNetwork: networkId.endsWith("-one") ? "TEST1" : "TEST2",
        targetSettlementOptionId: `crypto:${networkId}`,
      });
      assert.equal(matched.id, rule.id);
      const quote = await getManualDeskEstimate({
        sourceCurrency: "EUR",
        targetCurrency: assetCode,
        targetPrecision: 8,
        amount: 1000,
        exactRate: matched.exactRate,
        markupBasisPoints: matched.markupBasisPoints,
      });
      assert.equal(quote.exact.grossMarketAmount, "950");
      assert.equal(quote.exact.percentageCommission, "19");
      assert.equal(quote.exact.receiveAmount, "931");
    }
  } finally {
    if (ruleId) {
      await db.delete(manualDeskPricingRulesTable)
        .where(eq(manualDeskPricingRulesTable.id, ruleId));
    }
    await db.delete(cryptoAssetsTable).where(eq(cryptoAssetsTable.id, assetId));
  }
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
  const sources = [
    ...cryptoOptions.filter(option =>
      option.direction === "send" || option.direction === "both")
      .map(({ id, assetCode, routeNetwork }) => ({ id, assetCode, routeNetwork })),
    // Operator-managed snapshots can intentionally disable every crypto send
    // route. Keep this pure rule-selection assertion independent of that data.
    { id: "crypto:test-btc-bitcoin", assetCode: "BTC", routeNetwork: "Bitcoin" },
  ];
  const sepaInstant = fiatOptions.find(option =>
    option.assetCode.toUpperCase() === "EUR" &&
    option.title.trim().toUpperCase() === "SEPA INSTANT" &&
    (option.direction === "receive" || option.direction === "both"));
  assert.ok(sepaInstant, "SEPA Instant must be an enabled EUR receive option");

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

test("asset all-networks pricing matches current and future networks with exact network precedence", () => {
  const rules = [
    {
      id: "global", priority: 999, enabled: true, exactRate: null,
      sourceAsset: null, targetAsset: null, sourceNetwork: null, targetNetwork: null,
      sourceSettlementOptionId: null, targetSettlementOptionId: null,
    },
    {
      id: "usdt-all-networks", priority: 0, enabled: true, exactRate: "0.95",
      sourceAsset: null, sourceNetwork: null, sourceSettlementOptionId: null,
      targetAsset: "USDT", targetNetwork: ALL_NETWORKS_PRICING_SELECTOR,
      targetSettlementOptionId: null,
    },
    {
      id: "usdt-trc20", priority: 0, enabled: true, exactRate: null,
      sourceAsset: null, sourceNetwork: null, sourceSettlementOptionId: null,
      targetAsset: "USDT", targetNetwork: "TRC20",
      targetSettlementOptionId: "usdt-trc20",
    },
  ];
  const context = (asset: string, network: string, optionId: string) => ({
    sourceAsset: "EUR",
    sourceNetwork: "SEPA",
    sourceSettlementOptionId: "eur-sepa",
    targetAsset: asset,
    targetNetwork: network,
    targetSettlementOptionId: optionId,
  });
  assert.equal(selectManualPricingRule(rules, context("USDT", "TRC20", "usdt-trc20"))?.id, "usdt-trc20");
  assert.equal(selectManualPricingRule(rules, context("USDT", "BEP20", "usdt-bep20"))?.id, "usdt-all-networks");
  assert.equal(selectManualPricingRule(rules, context("USDT", "FUTURE-NETWORK", "usdt-future"))?.id, "usdt-all-networks");
  assert.equal(selectManualPricingRule(rules, context("USDC", "ERC20", "usdc-erc20"))?.id, "global");
});

test("asset all-networks exact pricing persists as one rule and matches every target network", async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const asset = `T${suffix}`;
  const ids: string[] = [];
  try {
    const wildcard = await createManualPricingRule({
      name: `Any to ${asset} all networks`,
      sourceAsset: null,
      sourceNetwork: null,
      sourceSettlementOptionId: null,
      targetAsset: asset,
      targetNetwork: ALL_NETWORKS_PRICING_SELECTOR,
      targetSettlementOptionId: null,
      markupBasisPoints: 500,
      exactRate: "0.95",
      priority: 987654,
      enabled: true,
    });
    ids.push(wildcard.id);
    const specific = await createManualPricingRule({
      name: `Any to ${asset} TRC20`,
      sourceAsset: null,
      sourceNetwork: null,
      sourceSettlementOptionId: null,
      targetAsset: asset,
      targetNetwork: "TRC20",
      targetSettlementOptionId: `test-${asset}-TRC20`,
      markupBasisPoints: 700,
      exactRate: null,
      priority: 0,
      enabled: true,
    });
    ids.push(specific.id);
    for (const network of ["TRC20", "BEP20", "ERC20", "FUTURE"]) {
      const matched = await matchManualDeskPricingRule({
        sourceAsset: "EUR",
        sourceNetwork: "SEPA",
        sourceSettlementOptionId: "test-eur-sepa",
        targetAsset: asset,
        targetNetwork: network,
        targetSettlementOptionId: `test-${asset}-${network}`,
      });
      assert.equal(matched.id, network === "TRC20" ? specific.id : wildcard.id);
      assert.equal(matched.markupBasisPoints, network === "TRC20" ? 700 : 500);
      if (network !== "TRC20") {
        assert.equal(matched.exactRate, "0.950000000000000000000000000000000000");
      }
    }
    const rows = await db.select().from(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, wildcard.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.targetAsset, asset);
    assert.equal(rows[0]?.targetNetwork, ALL_NETWORKS_PRICING_SELECTOR);
    assert.equal(rows[0]?.targetSettlementOptionId, null);
  } finally {
    if (ids.length) {
      await db.delete(manualDeskPricingRulesTable)
        .where(inArray(manualDeskPricingRulesTable.id, ids));
    }
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

test("database matcher never lets a reverse exact rate override a route-specific direct rule", async () => {
  const suffix = randomUUID();
  const eurOption = `test:eur:${suffix}`;
  const btcOption = `test:btc:${suffix}`;
  const ids: string[] = [];

  try {
    const [direct, reverseExact] = await db.insert(manualDeskPricingRulesTable).values([
      {
        name: `Any to EUR percentage ${suffix}`,
        targetAsset: "EUR",
        targetNetwork: "SEPA",
        targetSettlementOptionId: eurOption,
        markupBasisPoints: 500,
        exactRate: null,
        priority: 0,
        enabled: true,
      },
      {
        name: `EUR to BTC exact ${suffix}`,
        sourceAsset: "EUR",
        targetAsset: "BTC",
        sourceNetwork: "SEPA",
        targetNetwork: "BITCOIN",
        sourceSettlementOptionId: eurOption,
        targetSettlementOptionId: btcOption,
        markupBasisPoints: 0,
        exactRate: "0.95",
        priority: 100,
        enabled: true,
      },
    ]).returning({ id: manualDeskPricingRulesTable.id });
    ids.push(direct!.id, reverseExact!.id);

    const matched = await matchManualDeskPricingRule({
      sourceAsset: "BTC",
      targetAsset: "EUR",
      sourceNetwork: "BITCOIN",
      targetNetwork: "SEPA",
      sourceSettlementOptionId: btcOption,
      targetSettlementOptionId: eurOption,
    });

    assert.equal(matched.id, direct!.id);
    assert.equal(matched.exactRate, null);
    assert.equal(matched.markupBasisPoints, 500);
    assert.equal(matched.exactRateSource, undefined);
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