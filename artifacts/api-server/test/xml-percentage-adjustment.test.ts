import assert from "node:assert/strict";
import { test, after } from "node:test";
import { db, pool } from "@workspace/db";
import { UpdateAdminBestchangeBody } from "@workspace/api-zod";
import { TERMINAL_STATUSES } from "../src/lib/quickex";
import { adjustXmlOutput, DEFAULT_XML_PERCENTAGE_ADJUSTMENT } from "../src/lib/xml-percentage-adjustment";
import { hasActiveConvertOrderForXml } from "../src/lib/xml-convert-order-activity";
import { generate, snapshot } from "../src/routes/bestchange";
import { invalidateBestchangeFeed } from "../src/lib/bestchange-cache-invalidation";

after(async () => { await pool.end(); });

const adjustment = { enabled: true, activeOrderPercent: "5", noActiveOrderPercent: "2" };
const direction = {
  id: "70000000-0000-4000-8000-000000000001", enabled: true,
  sourceOptionId: "crypto:xml-source", targetOptionId: "crypto:xml-target",
  fromCode: "BTC", toCode: "ETH", reserve: "1000", minAmount: "1", maxAmount: "1",
  selectedAddOnKeys: [], includeFeeTags: false, params: [], cities: [],
};
const config = { enabled: true, version: 0, directions: [direction] };
let pricingCalls = 0;
const prepare = async () => ({
  effectiveMinAmount: 1, effectiveMaxAmount: 1, targetPrecision: 8,
  tiers: [], rangeOnlyPricing: false,
  quote: async () => { pricingCalls++; return "100.00000004"; },
});

test("admin-configured 5/2 percentages implement 105/102/100 exactly and keep settings intact", () => {
  assert.equal(adjustXmlOutput("100", adjustment, true), "105");
  assert.equal(adjustXmlOutput("100", adjustment, false), "102");
  assert.equal(adjustXmlOutput("100", { ...adjustment, enabled: false }, true), "100");
  assert.equal(adjustXmlOutput("100", { ...adjustment, enabled: false }, false), "100");
  assert.equal(adjustXmlOutput("100", DEFAULT_XML_PERCENTAGE_ADJUSTMENT, true), "100");
  assert.deepEqual(adjustment, { enabled: true, activeOrderPercent: "5", noActiveOrderPercent: "2" });
});

test("XML multiplication preserves arbitrary source precision and uses the configured percentage", () => {
  assert.equal(adjustXmlOutput("0.000000000000000001", adjustment, true), "0.00000000000000000105");
  assert.equal(adjustXmlOutput("12345678901234567890.123456789", adjustment, false), "12592592479259259247.92592592478");
  assert.equal(adjustXmlOutput("100", { ...adjustment, activeOrderPercent: "0.125" }, true), "100.125");
  assert.equal(adjustXmlOutput("100.000", { ...adjustment, activeOrderPercent: "0" }, true), "100.000");
});

test("settings validate percentages, retain OFF values and accept legacy bodies without resetting them", () => {
  const parsed = UpdateAdminBestchangeBody.parse({ ...config, xmlPercentageAdjustment: { ...adjustment, enabled: false } });
  assert.deepEqual(parsed.xmlPercentageAdjustment, { ...adjustment, enabled: false });
  assert.equal(UpdateAdminBestchangeBody.parse(config).xmlPercentageAdjustment, undefined);
  for (const invalid of ["-1", "101", "NaN", "", "1e2", "0.0000001"]) {
    assert.throws(() => UpdateAdminBestchangeBody.parse({ ...config, xmlPercentageAdjustment: { ...adjustment, activeOrderPercent: invalid } }));
  }
  assert.doesNotThrow(() => UpdateAdminBestchangeBody.parse({ ...config, xmlPercentageAdjustment: { ...adjustment, activeOrderPercent: "100.000000" } }));
});

test("full feed changes only out; base pricing, reserves, limits and future OFF output stay unchanged", async () => {
  pricingCalls = 0;
  const original = JSON.stringify(config);
  let activityReads = 0;
  const readActive = async () => { activityReads++; return true; };
  const baseline = await generate(config, prepare, () => { throw new Error("OFF must not read orders"); });
  const active = await generate({ ...config, xmlPercentageAdjustment: adjustment }, prepare, readActive);
  const inactive = await generate({ ...config, xmlPercentageAdjustment: adjustment }, prepare, async () => false);
  const off = await generate({ ...config, xmlPercentageAdjustment: { ...adjustment, enabled: false } }, prepare,
    () => { throw new Error("OFF must not read orders"); });
  assert.match(baseline.xml, /<out>100<\/out>/);
  assert.equal(active.xml, baseline.xml.replace("<out>100</out>", "<out>105</out>"));
  assert.equal(inactive.xml, baseline.xml.replace("<out>100</out>", "<out>102</out>"));
  assert.equal(off.xml, baseline.xml);
  assert.equal(off.enabled, true);
  assert.equal(off.exportedCount, 1);
  assert.equal(activityReads, 1);
  assert.equal(pricingCalls, 4);
  assert.equal(JSON.stringify(config), original);
});

test("one canonical Convert activity read covers the whole document; failure never silently picks another percentage", async () => {
  let reads = 0;
  const result = await generate({ ...config, directions: [direction, { ...direction, id: "70000000-0000-4000-8000-000000000002" }], xmlPercentageAdjustment: adjustment },
    prepare, async () => { reads++; return true; });
  assert.equal(reads, 1);
  assert.equal(result.exportedCount, 2);
  assert.equal(result.xml.match(/<out>105<\/out>/g)?.length, 2);
  await assert.rejects(generate({ ...config, xmlPercentageAdjustment: adjustment }, prepare,
    async () => { throw new Error("activity unavailable"); }), /activity unavailable/);
});

test("a live Convert creation or terminal transition changes XML immediately, even inside the rate cache TTL", async () => {
  let active = false;
  const readSettings = async () => ({ ...config, xmlPercentageAdjustment: adjustment });
  const readActivity = async () => active;
  invalidateBestchangeFeed();
  try {
    assert.match((await snapshot(readSettings, prepare, readActivity)).xml, /<out>102<\/out>/);
    active = true;
    assert.match((await snapshot(readSettings, prepare, readActivity)).xml, /<out>105<\/out>/);
    active = false;
    assert.match((await snapshot(readSettings, prepare, readActivity)).xml, /<out>102<\/out>/);
    invalidateBestchangeFeed();
    const off = async () => ({ ...config, xmlPercentageAdjustment: { ...adjustment, enabled: false } });
    const mustNotRead = async () => { throw new Error("OFF must not read orders"); };
    assert.match((await snapshot(off, prepare, mustNotRead)).xml, /<out>100<\/out>/);
    assert.match((await snapshot(off, prepare, mustNotRead)).xml, /<out>100<\/out>/);
  } finally { invalidateBestchangeFeed(); }
});

test("activity query uses existing Convert terminal states, never the Swap table or a provider request", async () => {
  const originalSelect = db.select;
  let query: any;
  let present = false;
  db.select = (() => ({
    from: (table: unknown) => ({
      where: (condition: unknown) => ({
        limit: async (limit: number) => { query = { table, condition, limit }; return present ? [{ present: 1 }] : []; },
      }),
    }),
  })) as typeof db.select;
  try {
    assert.equal(await hasActiveConvertOrderForXml(), false);
    present = true;
    assert.equal(await hasActiveConvertOrderForXml(), true);
    assert.equal(query.limit, 1);
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const sql = new PgDialect().sqlToQuery(query.condition);
    assert.deepEqual(sql.params, [...TERMINAL_STATUSES]);
    assert.match(sql.sql, /"quickex_orders"\."status"/);
    assert.doesNotMatch(sql.sql, /exchange_orders/);
  } finally { db.select = originalSelect; }
});
