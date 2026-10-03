import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { bestchangeSettingsTable, db, pool } from "@workspace/db";
import {
  conservativePrice, decimalParts, pricingSamples, serializeBestchangeXml,
  plainDecimal, smallerDecimal, type BestchangeItem,
} from "../src/lib/bestchange-xml";
import { getManualDeskEstimate } from "../src/lib/manual-desk-rates";
import { resolveManualPricingTerms, type ManualPricingTier } from "../src/lib/manual-desk-pricing";
import { classifyAdminRoute, adminPolicy } from "../src/lib/admin-policy";
import router from "../src/routes/bestchange";
import reference from "../src/data/bestchange-reference.json";

if (process.env.API_TEST_DISPOSABLE_DATABASE !== "1") {
  throw new Error("BestChange tests require the disposable API database.");
}
after(async () => { await pool.end(); });

test("official reference includes the complete currency/city catalogs and four original example items", () => {
  assert.equal(reference.currencyCodes.length, 330);
  assert.equal(reference.cityCodes.length, 567);
  assert.equal((reference.exampleXml.match(/<item>/g) ?? []).length, 4);
  assert.ok(reference.currencyCodes.some(row => row.code === "USDTTRC20"));
  assert.ok(reference.cityCodes.some(row => row.code === "ANKR"));
});

test("standard XML emits every required/optional tag, escapes values and uses one tag per line", () => {
  const item: BestchangeItem = {
    from: "PPEUR", to: "BTC", in: "100", out: "0.001", amount: "1.5",
    minamount: "10", maxamount: "500", fromfee: "0", tofee: "0",
    floating: "0.5%", delay: "2", param: "manual, verifying", city: "ANKR",
  };
  const xml = serializeBestchangeXml([item]);
  for (const tag of ["from", "to", "in", "out", "amount", "minamount", "maxamount",
    "fromfee", "tofee", "floating", "delay", "param", "city"]) {
    assert.match(xml, new RegExp(`\\n    <${tag}>[^\\n]+</${tag}>\\n`));
  }
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rates>'));
  assert.ok(xml.endsWith("</rates>\n"));
  assert.ok(!serializeBestchangeXml([]).includes("<item>"));
  assert.match(serializeBestchangeXml([{ ...item, from: "<&\"'>" }]), /&lt;&amp;&quot;&apos;&gt;/);
});

test("decimal presentation is exact and never uses scientific notation or floating-point reserve comparisons", () => {
  assert.equal(plainDecimal(1e-8), "0.00000001");
  assert.equal(plainDecimal("001.5000"), "1.5");
  assert.equal(smallerDecimal("999999999999.999999999999", "999999999999.999999999998"), "999999999999.999999999998");
});

test("pricing samples cover right-hand shared boundaries and reject unavailable range gaps", () => {
  const tiers: ManualPricingTier[] = [
    { minAmount: "10", maxAmount: "100", percentage: "1", direction: "MARKUP", fixedFee: "1" },
    { minAmount: "100", maxAmount: "200", percentage: "5", direction: "MARKUP", fixedFee: "2" },
  ];
  const samples = pricingSamples(10, 200, tiers, true);
  assert.ok(samples.includes(100));
  assert.ok(samples.some(value => value > 100 && value < 100.000001));
  assert.throws(() => pricingSamples(10, 200, [
    tiers[0], { ...tiers[1], minAmount: "101" },
  ], true), /gap/);
  assert.doesNotThrow(() => pricingSamples(10, 200, [
    tiers[0], { ...tiers[1], minAmount: "101" },
  ], false));
});

function assertNotOverstated(price: { input: string; output: string }, amount: number, receive: string) {
  const input = decimalParts(price.input), output = decimalParts(price.output);
  const sent = decimalParts(String(amount)), received = decimalParts(receive);
  const left = output.units * sent.units * 10n ** BigInt(input.scale + received.scale);
  const right = received.units * input.units * 10n ** BigInt(output.scale + sent.scale);
  assert.ok(left <= right, `Advertised rate exceeded executable payout for ${amount}.`);
}
test("conservative full-fee rate never exceeds canonical Swap payouts, including tier changes, benefits and rounding plateaus", async () => {
  const tiers: ManualPricingTier[] = [
    { minAmount: "10", maxAmount: "25", percentage: "1.125", direction: "MARKUP", fixedFee: "0.73" },
    { minAmount: "25", maxAmount: "50", percentage: "12.5", direction: "MARKUP", fixedFee: "0.03" },
    { minAmount: "50", maxAmount: "100", percentage: "2.125", direction: "GIVE_MORE", fixedFee: "1.01" },
  ];
  const rule = { amountBasedPricingEnabled: true, amountBasedPricingTiers: tiers, rangeOnlyPricing: true,
    markupBasisPoints: 0, adjustmentDirection: "MARKUP", fixedFee: "0" };
  const quote = async (amount: number) => {
    const terms = resolveManualPricingTerms(rule, amount);
    return getManualDeskEstimate({
      sourceCurrency: "EUR", targetCurrency: "USD", targetPrecision: 2, amount,
      exactRate: "1.23456789", markupBasisPoints: terms.markupBasisPoints,
      adjustmentDirection: terms.adjustmentDirection, percentage: terms.percentage, fixedFee: terms.fixedFee,
    });
  };
  const snapshots = await Promise.all(pricingSamples(10, 100, tiers, true).map(async amount =>
    ({ amount, receive: (await quote(amount)).exact.receiveAmount })));
  const price = conservativePrice(snapshots, 2, 0);
  for (let cents = 1_000; cents <= 10_000; cents += 7) {
    const amount = cents / 100;
    assertNotOverstated(price, amount, (await quote(amount)).exact.receiveAmount);
  }
  assert.throws(() => conservativePrice([{ amount: 1, receive: "0.01" }], 2, 0), /too small/);
});

test("all BestChange Admin operations remain Owner-only even with staff permission overrides", async () => {
  for (const [method, path, permission] of [
    ["GET", "/admin/bestchange", "site_settings.view"],
    ["GET", "/admin/bestchange/preview", "site_settings.view"],
    ["PUT", "/admin/bestchange", "site_settings.manage"],
  ] as const) {
    assert.deepEqual(classifyAdminRoute(method, path), { permission, ownerOnly: true });
    const error = await new Promise<unknown>(resolve => {
      adminPolicy({ method, path } as never, {
        locals: { operator: { role: "operator", effectivePermissions: [permission] } },
      } as never, resolve);
    });
    assert.equal((error as { statusCode?: number; status?: number }).statusCode ?? (error as { status: number }).status, 403);
  }
});

test("public feed is anonymous, no-store, always full XML on repeat polling, and omits zero-reserve/disabled directions", async () => {
  await db.delete(bestchangeSettingsTable).where(eq(bestchangeSettingsTable.id, 1));
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/bestchange.xml`;
  try {
    const responses = await Promise.all(Array.from({ length: 25 }, () => fetch(url, { headers: { "If-None-Match": "*" } })));
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
      assert.match(response.headers.get("content-type") ?? "", /application\/xml.*utf-8/);
      assert.equal(await response.text(), serializeBestchangeXml([]));
      assert.equal(response.headers.get("etag"), null);
    }
    await db.insert(bestchangeSettingsTable).values({
      id: 1, enabled: true, version: 1, directions: [
        { id: "10000000-0000-4000-8000-000000000001", enabled: false, sourceOptionId: "unavailable-source",
          targetOptionId: "unavailable-target", fromCode: "PPEUR", toCode: "BTC", reserve: "100", minAmount: "10",
          maxAmount: "100", params: [], cities: [], selectedAddOnKeys: [], includeFeeTags: false },
        { id: "10000000-0000-4000-8000-000000000002", enabled: true, sourceOptionId: "unavailable-source",
          targetOptionId: "unavailable-target", fromCode: "PPEUR", toCode: "BTC", reserve: "0", minAmount: "10",
          maxAmount: "100", params: [], cities: [], selectedAddOnKeys: [], includeFeeTags: false },
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 1_050));
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), serializeBestchangeXml([]));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.delete(bestchangeSettingsTable).where(eq(bestchangeSettingsTable.id, 1));
  }
});