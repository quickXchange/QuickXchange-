import assert from "node:assert/strict";
import { test, after } from "node:test";
import { pool } from "@workspace/db";
import { generate } from "../src/routes/bestchange";
import { decimalParts, serializeBestchangeXml, type BestchangeItem } from "../src/lib/bestchange-xml";

after(async () => { await pool.end(); });

const item: BestchangeItem = {
  from: "USDTBEP20", to: "WIREEUR", in: "10", out: "8.5",
  amount: "400000", minamount: "100", maxamount: "5000",
  param: "manual", sourceAssetCode: "USDT",
};

test("reference XML matches declaration, nesting, tag order, indentation and currency-labelled limits", () => {
  assert.equal(serializeBestchangeXml([item], "reference"), `<?xml version="1.0"?>
<rates>
  <item>
    <from>USDTBEP20</from>
    <to>WIREEUR</to>
    <in>1</in>
    <out>0.85</out>
    <amount>400000</amount>
    <minamount>100 USDT</minamount>
    <maxamount>5000 USDT</maxamount>
    <param>manual</param>
  </item>
</rates>
`);
});

test("reference optional step layout reports included fees, never charges range fees twice", () => {
  const xml = serializeBestchangeXml([{ ...item, pricingRanges: [{ frommin: "100", frommax: "800" }, { frommin: "800", frommax: "5000" }] }], "reference");
  assert.match(xml, /<param>manual<\/param>\n    <step frommin="100" frommax="800">\n      <fromfee type="%">0<\/fromfee>\n      <fromfee>0<\/fromfee>\n    <\/step>/);
  assert.match(xml, /<frommin>100<\/frommin>\n    <frommax>5000<\/frommax>/);
  assert.equal((xml.match(/<step /g) ?? []).length, 2);
});

test("classic serialization stays unchanged and publication metadata is never emitted as arbitrary tags", () => {
  const classic = serializeBestchangeXml([item]);
  assert.match(classic, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(classic, /<in>10<\/in>\n    <out>8.5<\/out>/);
  assert.match(classic, /<minamount>100<\/minamount>/);
  assert.doesNotMatch(classic, /sourceAssetCode|pricingRanges|USDT<\/minamount>/);
});

test("ratio division is exact when terminating, downward when repeating, and never uses floating point", () => {
  const xml = serializeBestchangeXml([{ ...item, in: "3", out: "1" }], "reference");
  const output = xml.match(/<out>([^<]+)<\/out>/)![1];
  const p = decimalParts(output);
  assert.equal(output, "0.333333333333333333333333");
  assert.ok(p.units * 3n <= 10n ** BigInt(p.scale));
  assert.match(serializeBestchangeXml([{ ...item, in: "100000000000", out: "0.00000001" }], "reference"), /<out>0.0000000000000000001<\/out>/);
  assert.throws(() => serializeBestchangeXml([{ ...item, in: "0" }], "reference"), /positive/);
  assert.throws(() => serializeBestchangeXml([{ ...item, sourceAssetCode: undefined }], "reference"), /symbol/);
});

test("XML values, symbols and step attributes are escaped; source data is unchanged", () => {
  const data = { ...item, from: "A&B", sourceAssetCode: "<EUR>", pricingRanges: [{ frommin: '1"2', frommax: "5&6" }] };
  const original = JSON.stringify(data);
  const xml = serializeBestchangeXml([data], "reference");
  assert.match(xml, /<from>A&amp;B<\/from>/);
  assert.match(xml, /100 &lt;EUR&gt;<\/minamount>/);
  assert.match(xml, /frommin="1&quot;2" frommax="5&amp;6"/);
  assert.equal(JSON.stringify(data), original);
  assert.equal(serializeBestchangeXml([], "reference"), '<?xml version="1.0"?>\n<rates>\n</rates>\n');
});

test("reference and classic feed reuse one dynamic pricing snapshot and one XML-only percentage", async () => {
  let calls = 0;
  const direction = {
    id: "80000000-0000-4000-8000-000000000001", enabled: true,
    sourceOptionId: "crypto:source", targetOptionId: "crypto:target",
    fromCode: "BTC", toCode: "ETH", reserve: "400000", minAmount: "10", maxAmount: "20",
    selectedAddOnKeys: [], includeFeeTags: true, params: [], cities: [],
  };
  const prepare = async () => ({
    sourceAssetCode: "BTC", effectiveMinAmount: 10, effectiveMaxAmount: 20, targetPrecision: 8,
    tiers: [{ minAmount: "5", maxAmount: "30", percentage: "2", fixedFee: "1", direction: "MARKUP" as const }],
    rangeOnlyPricing: false,
    quote: async (amount: number) => { calls++; return (amount * 2).toFixed(8); },
  });
  const feed = await generate({
    enabled: true, version: 0, directions: [direction],
    xmlPercentageAdjustment: { enabled: true, activeOrderPercent: "5", noActiveOrderPercent: "2" },
  }, prepare, async () => true);
  assert.equal(feed.exportedCount, 1);
  const quoted = calls;
  const reference = serializeBestchangeXml(feed.items!, "reference");
  assert.equal(calls, quoted);
  assert.match(reference, /<in>1<\/in>/);
  assert.match(reference, /<minamount>10 BTC<\/minamount>/);
  assert.match(reference, /<step frommin="10" frommax="20">/);
  assert.equal(feed.xml, serializeBestchangeXml(feed.items!));
  const advertised = decimalParts(reference.match(/<out>([^<]+)<\/out>/)![1]);
  const originalInput = decimalParts(feed.items![0].in);
  const originalOutput = decimalParts(feed.items![0].out);
  const numerator = originalOutput.units * 10n ** BigInt(originalInput.scale + advertised.scale);
  const denominator = originalInput.units * 10n ** BigInt(originalOutput.scale);
  assert.ok(advertised.units * denominator <= numerator);
  assert.ok((advertised.units + 1n) * denominator > numerator);
});
