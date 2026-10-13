import assert from "node:assert/strict";
import { test } from "node:test";
import { XMLParser } from "fast-xml-parser";
import { parsePartnerJson, parsePartnerPair, partnerPairKey, partnerRateParams, partnerRateToXml, partnerRequestQuery,
  fetchPartnerPairs, type PartnerXmlClient, type PartnerPair } from "../src/lib/quickex-xml-public";
import { serializeRatesXml } from "../src/lib/rates-xml-format";
import { ConvertXmlRefresh, freshExecutableXmlRows, type ConvertXmlSaved } from "../src/lib/rates-xml-convert-refresh";

const pair = parsePartnerPair({
  instrumentFrom: { currencyTitle: "BTC", networkTitle: "BTC", slug: "btc", bestChangeCurrencyName: "BTC", reservesAmount: "12.5" },
  instrumentTo: { currencyTitle: "USDT", networkTitle: "TRX", slug: "usdt-trx", bestChangeCurrencyName: "USDTTRC20", reservesAmount: "250000.000000000000000001" },
  isActive: true, minAmount: "0.001", maxAmount: "5",
});
const rate = { quotesWithoutNetworkFee: { sellQuote: { baseValue: "0.001", quoteValue: "109.532123456789123456789" } },
  finalNetworkFeeAmount: "1.500000000000000001" };
const client = (read: PartnerXmlClient["read"]): PartnerXmlClient =>
  ({ identity: "partner", referrerId: "same-partner", authenticated: true, read });
const fixture = (read: PartnerXmlClient["read"], saved: ConvertXmlSaved[] = []) => {
  let clock = 0;
  const stored = new Map(saved.map(row => [row.key, row]));
  const refresh = new ConvertXmlRefresh({
    client: async () => client(read), codeAllowed: code => !!code,
    load: async () => [...stored.values()],
    save: async (_scope, row) => { stored.set(row.key, row); },
    remove: async (_scope, keys) => { if (keys) keys.forEach(key => stored.delete(key)); else stored.clear(); },
    now: () => clock, sleep: async () => {},
  });
  return { refresh, stored, advance: () => { clock += 300001; } };
};
const saved = (): ConvertXmlSaved => ({ key: partnerPairKey(pair), pair, item: partnerRateToXml(pair, rate), quotedAt: 0 });
const failure = (providerStatus: number) => Object.assign(new Error(`Upstream ${providerStatus}`), { providerStatus });

test("public XML requires fresh rates and an executable directed route, preserving canonical network identities", () => {
  const row = saved();
  const snapshot = { freshRows: [row] };
  const route = { fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "TRC20" };
  assert.deepEqual(freshExecutableXmlRows(snapshot, [route]), [row]);
  assert.deepEqual(freshExecutableXmlRows(snapshot, []), []);
  assert.deepEqual(freshExecutableXmlRows(snapshot, [{ ...route, toNetwork: "BEP20" }]), []);
  assert.deepEqual(freshExecutableXmlRows({ freshRows: [] }, [route]), []);
  assert.deepEqual(freshExecutableXmlRows(snapshot, [{
    fromAsset: "USDT", fromNetwork: "TRC20", toAsset: "BTC", toNetwork: "BTC",
  }]), []);
});

test("expired and future-dated cached provider rates remain retained but are not publishable", async () => {
  const old = saved();
  const future = { ...saved(), key: "future", quotedAt: 900_000 };
  const f = fixture(async () => { throw failure(503); }, [old, future]);
  f.advance();
  const result = await f.refresh.snapshot(100);
  assert.equal(result.rows.length, 2);
  assert.equal(result.freshRows.length, 0);
  assert.equal(f.stored.size, 2);
});

test("catalogue and rate requests carry the identical owned affiliate ID and cannot override it", () => {
  const catalogue = partnerRequestQuery({ limit: "1000", offset: "0" }, "same-partner");
  const quote = partnerRequestQuery({ ...partnerRateParams(pair), referrerId: "wrong-partner" }, "same-partner");
  assert.equal(catalogue.get("referrerId"), "same-partner");
  assert.equal(quote.get("referrerId"), "same-partner");
  assert.equal(quote.getAll("referrerId").length, 1);
});
test("a successful slow batch retains expired rates but never identifies them as live", async () => {
  let clock = 0, reads = 0, block = false, release!: () => void;
  const pairs = Array.from({ length: 9 }, (_, i) => ({
    ...pair, instrumentFrom: { ...pair.instrumentFrom, currencyTitle: `COIN${i}`, bestChangeCurrencyName: `COIN${i}` },
  }));
  const refresh = new ConvertXmlRefresh({
    client: async () => client(async path => {
      if (path === "/pairs/all") {
        if (block) await new Promise<void>(resolve => { release = resolve; });
        return { total: pairs.length, pairs };
      }
      if (++reads === 9) {
        // Let the first eight workers persist their quotes before the final slow response.
        await new Promise(resolve => setTimeout(resolve, 1));
        clock += 300_001;
      }
      return rate;
    }),
    codeAllowed: code => !!code, load: async () => [], save: async () => {},
    remove: async () => {}, now: () => clock,
  });
  const completed = await refresh.snapshot(1000);
  assert.equal(completed.rows.length, 9);
  assert.equal(completed.refreshing, false);
  assert.equal(completed.stale, true);
  block = true;
  clock += 300_001;
  const pending = await refresh.snapshot(1);
  assert.equal(pending.rows.length, 9);
  assert.equal(pending.stale, true);
  assert.equal(pending.refreshing, true);
  release();
  await refresh.snapshot(1000);
});
test("expiry, temporary provider outage and recovery preserve publication without live mislabeling", async () => {
  let unavailable = false;
  const { refresh, advance } = fixture(async path => {
    if (unavailable) throw failure(503);
    return path === "/pairs/all" ? { total: 1, pairs: [pair] } : rate;
  });
  assert.equal((await refresh.snapshot(1000)).stale, false);
  advance(); unavailable = true;
  const failed = await refresh.snapshot(1000);
  assert.equal(failed.rows.length, 1);
  assert.equal(failed.stale, true);
  assert.ok(failed.error);
  advance(); unavailable = false;
  const recovered = await refresh.snapshot(1000);
  assert.equal(recovered.rows.length, 1);
  assert.equal(recovered.stale, false);
  assert.equal(recovered.error, undefined);
});
test("partner JSON numbers retain their original precision and scientific notation", () => {
  const json = parsePartnerJson('{"price":109.532123456789123456789,"fee":1.234567890123456789e-8,"total":1001,"active":true}') as any;
  assert.equal(json.price, "109.532123456789123456789");
  assert.equal(json.fee, "1.234567890123456789e-8");
  assert.equal(json.total, "1001"); assert.equal(json.active, true);
});
test("PDF XML format preserves base/out/reserve/limits and lists the network fee once", () => {
  const xml = serializeRatesXml([partnerRateToXml(pair, rate)]);
  const parsed = new XMLParser({ parseTagValue: false }).parse(xml).rates.item;
  assert.equal(parsed.in, "0.001");
  assert.equal(parsed.out, "109.532123456789123456789");
  assert.equal(parsed.amount, "250000.000000000000000001");
  assert.equal(parsed.minamount, "0.001"); assert.equal(parsed.maxamount, "5");
  assert.equal(parsed.tofee, "1.500000000000000001");
  assert.equal(parsed.param, "floating, language");
  assert.equal((xml.match(/<tofee>/g) ?? []).length, 1);
  assert.ok(!xml.includes("BTC</minamount>"));
});
test("zero network fee remains explicit and missing reserve/rate/fee is never invented", () => {
  assert.ok(serializeRatesXml([partnerRateToXml(pair, { ...rate, finalNetworkFeeAmount: "0" })]).includes("<tofee>0</tofee>"));
  assert.throws(() => partnerRateToXml({ ...pair, instrumentTo: { ...pair.instrumentTo, reservesAmount: undefined } }, rate));
  assert.throws(() => partnerRateToXml(pair, { ...rate, finalNetworkFeeAmount: undefined }));
  assert.throws(() => partnerRateToXml(pair, { quotesWithoutNetworkFee: { sellQuote: { baseValue: 1, quoteValue: 0 } }, finalNetworkFeeAmount: 0 }));
});
test("full catalogue pagination advances by actual page size without popular-pair caps", async () => {
  const offsets: string[] = [];
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    ...pair, instrumentFrom: { ...pair.instrumentFrom, currencyTitle: `TOKEN${i}` },
  }));
  const result = await fetchPartnerPairs(client(async (path, params) => {
    assert.equal(path, "/pairs/all"); assert.equal(params.limit, "1000");
    offsets.push(params.offset);
    return { total: "1001", pairs: rows.slice(Number(params.offset), Number(params.offset) + 1000) };
  }));
  assert.deepEqual(offsets, ["0", "1000"]); assert.equal(result.length, 1001);
});
test("truncated/repeated/invalid-total catalogue is rejected rather than silently published", async () => {
  await assert.rejects(fetchPartnerPairs(client(async () => ({ total: "2", pairs: [pair] }))), /repeated/);
  await assert.rejects(fetchPartnerPairs(client(async () => ({ total: "2", pairs: [] }))), /ended/);
  await assert.rejects(fetchPartnerPairs(client(async () => ({ total: null, pairs: [] }))), /pagination/);
});
test("malformed and inactive entries do not block valid pairs", async () => {
  const result = await fetchPartnerPairs(client(async () => ({
    total: "3", pairs: [pair, { ...pair, minAmount: null }, { ...pair, isActive: false, minAmount: null, maxAmount: null }],
  })));
  assert.equal(result.length, 2); assert.equal(result[1].isActive, false);
});
test("rate parameters use exact minimum, source/target network and FLOATING; no guessed probe", () => {
  assert.deepEqual(partnerRateParams(pair), {
    instrumentFromCurrencyTitle: "BTC", instrumentFromNetworkTitle: "BTC",
    instrumentToCurrencyTitle: "USDT", instrumentToNetworkTitle: "TRX",
    rateMode: "FLOATING", claimedDepositAmount: "0.001",
  });
  assert.equal("claimedDepositAmount" in partnerRateParams({ ...pair, minAmount: "0" }), false);
});
test("successful publication persists provider data and never calls a customer order endpoint", async () => {
  const paths: string[] = [];
  const { refresh, stored } = fixture(async (path, params) => {
    paths.push(path);
    if (path === "/pairs/all") return { total: "1", pairs: [pair] };
    assert.equal(params.claimedDepositAmount, "0.001"); return rate;
  });
  const snapshot = await refresh.snapshot(1000);
  assert.equal(snapshot.rows.length, 1); assert.equal(stored.size, 1);
  assert.deepEqual(paths, ["/pairs/all", "/rates/public/one"]);
  assert.equal(snapshot.stale, false);
});
test("warm requests do not refetch the pair matrix for every feed request", async () => {
  let calls = 0;
  const { refresh } = fixture(async path => { calls++; return path === "/pairs/all" ? { total: 1, pairs: [pair] } : rate; });
  await refresh.snapshot(1000); await refresh.snapshot(1000); await refresh.snapshot(1000);
  assert.equal(calls, 2);
});
test("slow refresh serves persisted rates promptly and resumes once the provider responds", async () => {
  let release!: (v: unknown) => void;
  const { refresh } = fixture(() => new Promise(resolve => { release = resolve; }), [saved()]);
  const start = Date.now(), snapshot = await refresh.snapshot(5);
  assert.ok(Date.now() - start < 200);
  assert.equal(snapshot.rows.length, 1); assert.equal(snapshot.refreshing, true);
  refresh.stop(); release({ total: "0", pairs: [] });
});
test("transient catalogue/quote outages retain only previous successful rates", async () => {
  for (const catalogueFailure of [true, false]) {
    const { refresh, stored } = fixture(async path => {
      if (path === "/pairs/all" && !catalogueFailure) return { total: 1, pairs: [pair] };
      throw failure(503);
    }, [saved()]);
    const snapshot = await refresh.snapshot(1000);
    assert.equal(snapshot.rows.length, 1); assert.equal(stored.size, 1); assert.equal(snapshot.stale, true);
  }
});
test("404 affiliate, removed/inactive pairs and 422 unavailable quotes retire old publication", async () => {
  for (const read of [
    async () => { throw failure(404); },
    async () => ({ total: 0, pairs: [] }),
    async () => ({ total: 1, pairs: [{ ...pair, isActive: false }] }),
    async (path: string) => { if (path === "/pairs/all") return { total: 1, pairs: [pair] }; throw failure(422); },
  ]) {
    const { refresh, stored } = fixture(read, [saved()]);
    assert.equal((await refresh.snapshot(1000)).rows.length, 0); assert.equal(stored.size, 0);
  }
});
test("updated limits/reserves cannot reuse an old rate when the new quote is unavailable", async () => {
  const updated = { ...pair, minAmount: "0.002", instrumentTo: { ...pair.instrumentTo, reservesAmount: "1" } };
  const { refresh } = fixture(async path => {
    if (path === "/pairs/all") return { total: 1, pairs: [updated] };
    throw failure(503);
  }, [saved()]);
  assert.equal((await refresh.snapshot(1000)).rows.length, 0);
});
test("duplicate published tickers and missing codes never export ambiguous/invented directions", async () => {
  const second: PartnerPair = { ...pair, instrumentFrom: { ...pair.instrumentFrom, networkTitle: "OTHER" } };
  const { refresh } = fixture(async () => ({
    total: 3, pairs: [pair, second, { ...pair, instrumentTo: { ...pair.instrumentTo, bestChangeCurrencyName: "" } }],
  }));
  const snapshot = await refresh.snapshot(1000);
  assert.equal(snapshot.rows.length, 0); assert.equal(snapshot.skipped, 3);
});
test("same-code self exchanges are not advertised as Convert directions", async () => {
  const { refresh } = fixture(async () => ({
    total: 1, pairs: [{ ...pair, instrumentTo: { ...pair.instrumentTo, bestChangeCurrencyName: "BTC" } }],
  }));
  const snapshot = await refresh.snapshot(1000);
  assert.equal(snapshot.rows.length, 0); assert.equal(snapshot.skipped, 1);
});
test("temporary publication-store load failure can recover on the next request", async () => {
  let loads = 0;
  const refresh = new ConvertXmlRefresh({
    client: async () => client(async path => path === "/pairs/all" ? { total: 1, pairs: [pair] } : rate),
    load: async () => { if (++loads === 1) throw new Error("Temporary store outage"); return []; },
    save: async () => {}, remove: async () => {}, codeAllowed: code => !!code,
  });
  await assert.rejects(refresh.snapshot(1000), /store outage/);
  assert.equal((await refresh.snapshot(1000)).rows.length, 1);
});
test("credential/affiliate identity rotation fences old in-flight quotes and cached publication", async () => {
  let identity = "old", release!: (value: unknown) => void;
  const scopes: string[] = [];
  const refresh = new ConvertXmlRefresh({
    client: async () => {
      const captured = identity;
      return { ...client(async path => {
        if (path === "/pairs/all") return { total: 1, pairs: [pair] };
        if (captured === "old") return new Promise(resolve => { release = resolve; });
        return { ...rate, quotesWithoutNetworkFee: { sellQuote: { baseValue: "1", quoteValue: "2" } } };
      }), identity: captured };
    },
    load: async () => [], save: async scope => { scopes.push(scope); },
    remove: async () => {}, codeAllowed: code => !!code,
  });
  await refresh.snapshot(5);
  identity = "new";
  assert.equal((await refresh.snapshot(1000)).rows[0].item.out, "2");
  release(rate); await new Promise(resolve => setTimeout(resolve, 1));
  assert.deepEqual(scopes, ["quickex-partner-xml-v1:new"]);
});
test("429/5xx receive bounded retries and the same partner context remains in use", async () => {
  let rates = 0;
  const { refresh } = fixture(async path => {
    if (path === "/pairs/all") return { total: 1, pairs: [pair] };
    if (++rates < 3) throw failure(rates === 1 ? 429 : 503);
    return rate;
  });
  assert.equal((await refresh.snapshot(1000)).rows.length, 1); assert.equal(rates, 3);
});
test("rate work is bounded to eight concurrent reads", async () => {
  let active = 0, max = 0;
  const pairs = Array.from({ length: 20 }, (_, i) => ({
    ...pair, instrumentFrom: { ...pair.instrumentFrom, currencyTitle: `COIN${i}`, bestChangeCurrencyName: `COIN${i}` },
  }));
  const { refresh } = fixture(async path => {
    if (path === "/pairs/all") return { total: 20, pairs };
    active++; max = Math.max(max, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--; return rate;
  });
  assert.equal((await refresh.snapshot(1000)).rows.length, 20); assert.equal(max, 8);
});
test("a five-minute schedule refreshes independently of real customer quote/order state", async () => {
  let calls = 0;
  const { refresh, advance } = fixture(async path => { calls++; return path === "/pairs/all" ? { total: 1, pairs: [pair] } : rate; });
  await refresh.snapshot(1000); advance(); await refresh.snapshot(1000);
  assert.equal(calls, 4);
});
test("existing Swap XML retains one-unit input, asset-suffixed limits and manual fee format", () => {
  const xml = serializeRatesXml([{
    from: "SBERRUB", to: "USDTTRC20", out: "0.01", amount: "400000",
    minamount: "100", maxamount: "1000", symbol: "RUB", param: "manual", fixedFee: "1",
  }]);
  assert.ok(xml.includes("<in>1</in>")); assert.ok(xml.includes("<minamount>100 RUB</minamount>"));
  assert.ok(xml.includes("<param>manual</param>")); assert.ok(xml.includes("<tofee>1</tofee>"));
});
