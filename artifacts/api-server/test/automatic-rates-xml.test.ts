import assert from "node:assert/strict";
import { test, after } from "node:test";
import { spawnSync } from "node:child_process";
import { pool } from "@workspace/db";
import { serializeRatesXml, applyXmlParts, divideXmlDecimals, relativeXmlPercentage } from "../src/lib/rates-xml-format";
import { priceXmlSwap, xmlMethodProblem } from "../src/lib/rates-xml-export";
import { XML_CODES, DEFAULT_XML_RESERVE } from "../src/lib/rates-xml-methods";
import { parsePartnerPair, partnerRateParams, partnerRateToXml } from "../src/lib/quickex-xml-public";
import { discoverXmlSwapRoutes } from "../src/lib/rates-xml-routes";
import { automaticXmlCryptoCode, resolveXmlCryptoCode, XML_CRYPTO_IDENTITIES } from "../src/lib/rates-xml-crypto-codes";

after(() => pool.end());
test("all approved crypto codes have unique exact asset/network identities", () => {
  assert.equal(XML_CRYPTO_IDENTITIES.length, 98);
  for (const entry of XML_CRYPTO_IDENTITIES)
    assert.equal(automaticXmlCryptoCode(entry.asset, entry.network), entry.code);
});
test("crypto publication codes are automatic and chain-specific, including provider aliases", () => {
  for (const [asset, chain, code] of [
    ["USDT", "TRC20", "USDTTRC20"], ["usdt", "tron", "USDTTRC20"],
    ["USDT", "ERC20", "USDTERC20"], ["USDT", "BSC", "USDTBEP20"],
    ["USDT", "SPL", "USDTSOL"], ["USDC", "BASE", "USDCBASE"],
    ["ETH", "ERC20", "ETH"], ["BTC", "BTC", "BTC"],
    ["BNB", "BEP20", "BNBBEP20"], ["POL", "POLYGON", "POL"],
    ["USDT", "ARBITRUM", "USDTARBTM"], ["TON", "TON", "GRAM"],
  ]) assert.equal(automaticXmlCryptoCode(asset, chain), code);
  for (const [asset, chain] of [
    ["USDT", "BASE"], ["BTC", "ERC20"], ["USDT", ""], ["DAI", "ERC20"],
    ["UNKNOWN", "TRC20"], ["BNB", "BNB"], ["EUR", "TRC20"],
  ]) assert.equal(automaticXmlCryptoCode(asset, chain), null);
  assert.equal(resolveXmlCryptoCode(null, "USDT", "TRC20"), "USDTTRC20");
  assert.equal(resolveXmlCryptoCode("USDTERC20", "USDT", "TRC20"), "USDTERC20");
});
test("configured Revolut USD to automatically mapped USDT TRC20 emits the existing route", async () => {
  const source = { id: "fiat:usd:revolut", kind: "fiat-payment-method", assetCode: "USD",
    routeNetwork: "fiat", direction: "send" };
  const target = { id: "crypto:usdt-tron", kind: "crypto-network", assetId: "usdt", assetCode: "USDT",
    routeNetwork: "TRC20", direction: "receive" };
  const rule = { id: "route", enabled: true, sourceAsset: "USD", targetAsset: "USDT",
    sourceNetwork: "fiat", targetNetwork: "TRC20", sourceCryptoAssetId: null, targetCryptoAssetId: null,
    sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
    exactRate: "1", createdAt: new Date(0), updatedAt: new Date(0) } as any;
  assert.equal(discoverXmlSwapRoutes([source, target], [rule]).length, 1);
  const item = await priceXmlSwap(source.id, target.id, {
    code: "REVBUSD", assetCode: "USD",
  } as any, {
    code: resolveXmlCryptoCode(null, target.assetCode, target.routeNetwork), reserve: "500",
  } as any, async () => ({
    effectiveMinAmount: 10, effectiveMaxAmount: 100, rangeOnlyPricing: false, tiers: [],
    quote: async () => "1",
    publicationQuote: async (amount: number) => ({ receiveAmount: String(amount), fixedFees: ["0"] }),
  }) as any);
  const xml = serializeRatesXml([item]);
  assert.match(xml, /<from>REVBUSD<\/from>/);
  assert.match(xml, /<to>USDTTRC20<\/to>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 1);
});
test("current canonical routes appear automatically and disappear when disabled or deleted", () => {
  const source = { id: "crypto:usdt", kind: "crypto-network", assetId: "usdt", assetCode: "USDT",
    routeNetwork: "TRC20", direction: "send" };
  const target = { id: "fiat:usd:paypal", kind: "fiat-payment-method", assetCode: "USD",
    routeNetwork: "fiat", direction: "receive" };
  const rule = {
    id: "rule", name: "Live route", enabled: true,
    sourceAsset: "USDT", sourceNetwork: "TRC20", sourceCryptoAssetId: null,
    sourceSettlementOptionId: source.id, targetAsset: "USD", targetNetwork: "fiat",
    targetCryptoAssetId: null, targetSettlementOptionId: target.id, exactRate: "0.98",
    createdAt: new Date(0), updatedAt: new Date(0),
  } as any;
  assert.equal(discoverXmlSwapRoutes([source, target], [rule]).length, 1);
  assert.equal(discoverXmlSwapRoutes([source, target], [{ ...rule, enabled: false }]).length, 0);
  assert.equal(discoverXmlSwapRoutes([source, target], []).length, 0);
  assert.equal(discoverXmlSwapRoutes([source], [rule]).length, 0);
  assert.equal(discoverXmlSwapRoutes([{ ...source, direction: "receive" }, target], [rule]).length, 0);
});
test("XML route discovery retains existing Any-side and reciprocal exact pricing", () => {
  const source = { id: "crypto:usdt", kind: "crypto-network", assetCode: "USDT", assetId: "usdt",
    routeNetwork: "TRC20", direction: "send" };
  const target = { id: "fiat:usd:paypal", kind: "fiat-payment-method", assetCode: "USD",
    routeNetwork: "fiat", direction: "receive" };
  const rule = {
    id: "rule", name: "Existing inverse", enabled: true,
    sourceAsset: "USD", sourceNetwork: null, sourceCryptoAssetId: null, sourceSettlementOptionId: null,
    targetAsset: "USDT", targetNetwork: null, targetCryptoAssetId: null, targetSettlementOptionId: null,
    exactRate: "1.02", createdAt: new Date(0), updatedAt: new Date(0),
  } as any;
  assert.equal(discoverXmlSwapRoutes([source, target], [rule]).length, 1);
  assert.equal(discoverXmlSwapRoutes([source, target], [{
    ...rule, sourceAsset: null, targetAsset: null, exactRate: null,
  }]).length, 1);
});
test("changing Edit Path fees and bounds changes export without storing XML direction overrides", async () => {
  let fee = 2, min = 10, max = 100;
  const prepare = async () => ({
    effectiveMinAmount: min, effectiveMaxAmount: max, rangeOnlyPricing: false, tiers: [],
    quote: async (amount: number) => String(amount * (1 - fee / 100)),
    publicationQuote: async (amount: number) => ({
      receiveAmount: String(amount * (1 - fee / 100)), fixedFees: ["0"],
    }),
  });
  const from = { optionId: "source", name: "USDT", assetCode: "USDT", code: "USDTTRC20",
    kind: "crypto" as const, enabled: true, reserve: "1000000" };
  const to = { ...from, optionId: "target", name: "PayPal", assetCode: "USD", code: "PPUSD", kind: "fiat" as const };
  const first = await priceXmlSwap(from.optionId, to.optionId, from, to, prepare as any);
  assert.equal(Number(first.out), .98);
  fee = 5; min = 20; max = 200;
  const second = await priceXmlSwap(from.optionId, to.optionId, from, to, prepare as any);
  assert.equal(Number(second.out), .95);
  assert.equal(second.minamount, "20"); assert.equal(second.maxamount, "200");
});
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
const pair = parsePartnerPair({
  instrumentFrom: { currencyTitle: "BTC", networkTitle: "BTC", bestChangeCurrencyName: "BTC" },
  instrumentTo: { currencyTitle: "USDT", networkTitle: "TRX", bestChangeCurrencyName: "USDTTRC20", reservesAmount: "250000" },
  isActive: true, minAmount: "0.0001", maxAmount: "20",
});
test("Convert publishes partner JSON values rather than customer tickets or local reserves", () => {
  const item = partnerRateToXml(pair, {
    quotesWithoutNetworkFee: { sellQuote: { baseValue: "1", quoteValue: "62123.123456789" } },
    finalNetworkFeeAmount: "1.5",
  });
  assert.equal(item.out, "62123.123456789");
  assert.equal(item.param, "floating, language"); assert.equal(item.amount, "250000");
  assert.equal(item.minamount, "0.0001"); assert.equal(item.fixedFee, "1.5");
});
test("Convert public XML requests use the provider minimum without probing customer quotes", () => {
  assert.equal(partnerRateParams(pair).claimedDepositAmount, "0.0001");
  assert.equal(partnerRateParams(pair).rateMode, "FLOATING");
});
test("Convert fails explicitly if authoritative provider JSON fields are unavailable", () => {
  assert.throws(() => partnerRateToXml(pair, { quotesWithoutNetworkFee: {} }), /object/);
});
test("escaping prevents malformed XML without altering canonical data", () => {
  const xml = serializeRatesXml([{ ...base, from: "A&B", symbol: '<USDT>"', out: "1" }]);
  assert.ok(xml.includes("<from>A&amp;B</from>")); assert.ok(xml.includes("&lt;USDT&gt;&quot;"));
});
