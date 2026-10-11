import assert from "node:assert/strict";
import { test, after } from "node:test";
import { spawnSync } from "node:child_process";
import { pool } from "@workspace/db";
import { serializeRatesXml, applyXmlParts, divideXmlDecimals, relativeXmlPercentage } from "../src/lib/rates-xml-format";
import { priceXmlSwap, priceXmlConvert, xmlMethodProblem } from "../src/lib/rates-xml-export";
import { XML_CODES, DEFAULT_XML_RESERVE } from "../src/lib/rates-xml-methods";
import { QuickexApiError } from "../src/lib/quickex";

after(() => pool.end());
const method = (code: string, kind: "fiat" | "crypto" = "crypto", reserve = DEFAULT_XML_RESERVE) => ({
  optionId: code, code, kind, reserve, name: code, assetCode: kind === "fiat" ? "USD" : "USDT", enabled: true,
});
const base = {
  from: "USDTBEP20", to: "PPUSD", amount: DEFAULT_XML_RESERVE,
  minamount: "1000", maxamount: "200000", symbol: "USDT", param: "manual" as const,
};
test("supplied currency-code whitelist is complete, unique and contains no generated additions", () => {
  assert.equal(XML_CODES.length, 332);
  assert.equal(new Set(XML_CODES.map(c => c.code)).size, 332);
  assert.equal(XML_CODES.filter(c => c.type === "crypto").length, 98);
  assert.equal(XML_CODES.filter(c => c.type === "fiat").length, 234);
});
test("required UTF-8 declaration, one-unit format, ticker limits, no floating tag and valid XML", () => {
  const xml = serializeRatesXml([{ ...base, out: "0.98" }]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rates>'));
  for (const value of ["<in>1</in>", "<out>0.98</out>", "<amount>1000000</amount>",
    "<minamount>1000 USDT</minamount>", "<maxamount>200000 USDT</maxamount>", "<param>manual</param>"])
    assert.ok(xml.includes(value));
  assert.ok(!xml.includes("<floating>"));
  const parsed = spawnSync("python3", ["-c", "import sys,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.read()); assert r.tag=='rates' and len(r.findall('item'))==1"], { input: xml });
  assert.equal(parsed.status, 0, parsed.stderr.toString());
});
test("uniform percentage-adjusted rate is folded into out; fixed receiving fee is applied only once", () => {
  const item = applyXmlParts(base, [{ frommin: "1000", frommax: "200000", rate: "0.98", fixedFee: "3" }]);
  const xml = serializeRatesXml([item]);
  assert.ok(xml.includes("<out>0.98</out>"));
  assert.ok(xml.includes("<tofee>3</tofee>"));
  assert.ok(!xml.includes("<step"));
  assert.equal(1000 * Number(item.out) - Number(item.fixedFee), 977);
});
test("one item carries percentage and fixed-fee steps without double charging", () => {
  const item = applyXmlParts(base, [
    { frommin: "1000", frommax: "2000", rate: "0.98", fixedFee: "3" },
    { frommin: "2000", frommax: "200000", rate: "1", fixedFee: "5" },
  ]);
  const xml = serializeRatesXml([item]);
  assert.equal((xml.match(/<item>/g) ?? []).length, 1);
  assert.equal((xml.match(/<step /g) ?? []).length, 2);
  assert.ok(xml.includes('<tofee type="%">2</tofee>'));
  assert.ok(xml.includes("<tofee>3</tofee>"));
  assert.equal(1000 * Number(item.out) * (1 - Number(relativeXmlPercentage(item.out, "0.98")) / 100) - 3, 977);
});
test("machine decimals retain provider precision rather than human three-decimal formatting", () => {
  assert.equal(divideXmlDecimals("1", "3"), "0.333333333333333333333333");
  const xml = serializeRatesXml([{ ...base, param: "floating", out: "0.000000000000123456789123" }]);
  assert.ok(xml.includes("<out>0.000000000000123456789123</out>"));
  assert.ok(xml.includes("<param>floating</param>"));
  assert.ok(!xml.includes("<floating>"));
});
test("missing, disabled, invented and wrong-type codes are omitted, not guessed", () => {
  assert.match(xmlMethodProblem({ ...method("BTC"), code: null }, true)!, /Missing/);
  assert.match(xmlMethodProblem({ ...method("BTC"), enabled: false }, true)!, /disabled/);
  assert.match(xmlMethodProblem(method("INVENTED"), true)!, /Invalid/);
  assert.match(xmlMethodProblem(method("BTC", "fiat"), true)!, /Invalid/);
});
test("Perfect Money is allowed only in staging, never in production", () => {
  for (const code of ["PMUSD", "PMEUR"]) {
    assert.equal(xmlMethodProblem(method(code, "fiat"), true), undefined);
    assert.match(xmlMethodProblem(method(code, "fiat"), false)!, /staging-only/);
  }
});
test("receiving method reserve fans out across Swap directions and quote amounts are not reused as reserves", async () => {
  const prepare = async () => ({
    effectiveMinAmount: 10, effectiveMaxAmount: 100,
    tiers: [], rangeOnlyPricing: false,
    quote: async (amount: number) => String(amount * 0.98 - 3),
    publicationQuote: async (amount: number) => ({ receiveAmount: String(amount * 0.98 - 3), fixedFees: ["3", "0"] }),
  });
  for (const source of [method("USDTBEP20"), method("USDTTRC20")]) {
    const item = await priceXmlSwap(source.optionId, "PPUSD", source, method("PPUSD", "fiat", "123456.789"), prepare as any);
    assert.equal(item.amount, "123456.789"); assert.equal(item.out, "0.98"); assert.equal(item.fixedFee, "3");
  }
});
test("actual existing quote projection determines range rates and inherited fixed fees", async () => {
  const prepare = async () => ({
    effectiveMinAmount: 10, effectiveMaxAmount: 100, rangeOnlyPricing: true,
    tiers: [
      { minAmount: "10", maxAmount: "50", percentage: "2", direction: "MARKUP", fixedFee: "3" },
      { minAmount: "50", maxAmount: "100", percentage: "1", direction: "MARKUP" },
    ],
    quote: async (amount: number) => String(amount * (amount <= 50 ? 0.98 : 0.99) - 3),
    publicationQuote: async (amount: number) => ({ receiveAmount: String(amount * (amount <= 50 ? 0.98 : 0.99) - 3), fixedFees: ["3"] }),
  });
  const item = await priceXmlSwap("USDTBEP20", "PPUSD", method("USDTBEP20"), method("PPUSD", "fiat"), prepare as any);
  assert.equal(item.steps?.length, 2);
  assert.equal(item.steps?.[0].rate, "0.98"); assert.equal(item.steps?.[1].rate, "0.99");
  assert.equal(item.steps?.[1].fixedFee, "3");
});
test("range-only gaps and absent limits never produce fictional executable rates", async () => {
  const prepare = async () => ({
    effectiveMinAmount: 10, effectiveMaxAmount: 100, rangeOnlyPricing: true,
    tiers: [{ minAmount: "10", maxAmount: "40" }, { minAmount: "60", maxAmount: "100" }],
    quote: async () => "1", publicationQuote: async () => ({ receiveAmount: "1", fixedFees: ["0"] }),
  });
  await assert.rejects(priceXmlSwap("a", "b", method("USDTBEP20"), method("PPUSD", "fiat"), prepare as any), /gap/);
});
const pair = { fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20" };
test("Convert reads existing floating provider quote once and never creates an order", async () => {
  let calls = 0;
  const quote = async (input: any) => {
    calls++; assert.equal(input.rateMode, "FLOATING");
    return { quickexQuote: { price: "62123.123456789", generalMinAmount: "0.0001", generalMaxAmount: "20" } };
  };
  const item = await priceXmlConvert(pair, { ...method("BTC"), assetCode: "BTC" }, method("USDTTRC20"), quote as any);
  assert.equal(calls, 1); assert.equal(item.out, "62123.123456789");
  assert.equal(item.param, "floating"); assert.equal(item.amount, DEFAULT_XML_RESERVE);
  assert.equal(item.minamount, "0.0001");
});
test("Convert may retry only with a validated provider-reported amount bound", async () => {
  const amounts: number[] = [];
  const quote = async (input: any) => {
    amounts.push(input.amount);
    if (input.amount === 1) throw new QuickexApiError("QUICKEX_AMOUNT_TOO_SMALL", "Below minimum", 400, 400, false, false, "25");
    return { quickexQuote: { price: "0.98", generalMinAmount: "25", generalMaxAmount: "1000" } };
  };
  await priceXmlConvert(pair, method("BTC"), method("USDTTRC20"), quote as any);
  assert.deepEqual(amounts, [1, 25]);
});
test("Convert fails explicitly if current quotes or authoritative limits are unavailable", async () => {
  await assert.rejects(priceXmlConvert(pair, method("BTC"), method("USDTTRC20"),
    (async () => ({ quickexQuote: { price: "1" } })) as any), /limits/);
});
test("escaping prevents malformed XML without altering canonical data", () => {
  const xml = serializeRatesXml([{ ...base, from: "A&B", symbol: '<USDT>"', out: "1" }]);
  assert.ok(xml.includes("<from>A&amp;B</from>")); assert.ok(xml.includes("&lt;USDT&gt;&quot;"));
});
