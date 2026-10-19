import assert from "node:assert/strict";
import test from "node:test";
import { ConvertXmlRefresh, freshExecutableXmlRows } from "../src/lib/rates-xml-convert-refresh";
import { parsePartnerPair, partnerPairKey, partnerRateToXml } from "../src/lib/quickex-xml-public";
import { XmlQuoteRefresh, type XmlCachedQuote } from "../src/lib/rates-xml-refresh";

const pair = parsePartnerPair({
  instrumentFrom: { currencyTitle: "BTC", networkTitle: "BTC", bestChangeCurrencyName: "BTC" },
  instrumentTo: { currencyTitle: "USDT", networkTitle: "TRX", bestChangeCurrencyName: "USDTTRC20", reservesAmount: "1" },
  isActive: true, minAmount: "0.001", maxAmount: "5",
});
const rate = { quotesWithoutNetworkFee: { sellQuote: { baseValue: "1", quoteValue: "10" } },
  finalNetworkFeeAmount: "0", generalMinAmount: "0.001", generalMaxAmount: "5" };

test("XML validates full affiliate candidates without depending on the popular-pair catalogue", async () => {
  const paths: string[] = [];
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "affiliate-authority", referrerId: "test", authenticated: true,
      read: async path => {
        paths.push(path);
        if (path === "/pairs/all") return { total: 1, pairs: [pair] };
        return { ...rate, updatedAt: Date.now() };
      } }),
    executableRoutes: async candidates => {
      assert.deepEqual(candidates, [pair], "reuse the affiliate directions in the existing capability resolver");
      return [{ fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "TRX" }];
    },
    codeAllowed: () => true, load: async () => [], save: async () => {}, remove: async () => {},
  });
  assert.equal((await refresh.snapshot(1000)).freshRows.length, 1);
  assert.deepEqual(paths, ["/pairs/all", "/rates/public/one"]);
  refresh.stop();
});

test("slow background discovery does not hide a retained fresh rate or revive an expired one", async () => {
  let clock = 1000;
  let release!: (value: unknown) => void;
  const catalog = new Promise<unknown>(resolve => { release = resolve; });
  const saved = { key: partnerPairKey(pair), pair, item: partnerRateToXml(pair, rate), quotedAt: clock };
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "slow-discovery", referrerId: "test", authenticated: true,
      read: async path => path === "/pairs/all" ? catalog : { ...rate, updatedAt: clock } }),
    codeAllowed: () => true, load: async () => [saved], save: async () => {}, remove: async () => {},
    now: () => clock,
  });
  const snapshot = await refresh.snapshot(0);
  assert.equal(snapshot.refreshing, true);
  const currentRoutes = [{ fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "TRX" }];
  assert.equal(freshExecutableXmlRows(snapshot, currentRoutes).length, 1);
  assert.equal(freshExecutableXmlRows(snapshot, []).length, 0, "current permissions still gate publication");
  clock += 300_000;
  assert.equal((await refresh.snapshot(0)).freshRows.length, 0, "background work cannot extend provider validity");
  refresh.stop();
  release({ total: 1, pairs: [pair] });
});

test("large XML catalogs yield bounded batches and refresh existing rows before expiry", async () => {
  let clock = 0, catalogs = 0, quotes = 0;
  const pairs = Array.from({ length: 300 }, (_, index) => ({
    ...pair, instrumentFrom: { ...pair.instrumentFrom, currencyTitle: `COIN${index}`, bestChangeCurrencyName: `COIN${index}` },
  }));
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "rolling", referrerId: "test", authenticated: true,
      read: async path => {
        if (path === "/pairs/all") { catalogs++; return { total: pairs.length, pairs }; }
         quotes++; return { ...rate, updatedAt: clock };
      } }),
    codeAllowed: () => true, load: async () => [], save: async () => {}, remove: async () => {},
    now: () => clock, sleep: async () => {},
  });
  assert.equal((await refresh.snapshot(1000)).freshRows.length, 256);
  clock = 2_000;
  assert.equal((await refresh.snapshot(1000)).freshRows.length, 300);
  assert.equal(catalogs, 1, "do not download the entire catalog for every small rate batch");
  clock = 241_001;
  const proactivelyRefreshed = await refresh.snapshot(1000);
  assert.equal(proactivelyRefreshed.freshRows.length, 300);
  assert.equal(proactivelyRefreshed.rows.filter(row => row.quotedAt === clock).length, 256);
  assert.equal(quotes, 556, "the next batch renews early publications, not the whole matrix");
  assert.equal(catalogs, 1);
});

test("nonexecutable partner directions consume no rate requests", async () => {
  let calls = 0;
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "filtered", referrerId: "test", authenticated: true,
      read: async path => {
        if (path === "/pairs/all") return { total: 1, pairs: [pair] };
        calls++; return rate;
      } }),
    executableRoutes: async () => [{ fromAsset: "ETH", fromNetwork: "ETH", toAsset: "BTC", toNetwork: "BTC" }],
    codeAllowed: () => true, load: async () => [], save: async () => {}, remove: async () => {},
  });
  assert.equal((await refresh.snapshot(1000)).freshRows.length, 0);
  assert.equal(calls, 0);
});

test("a full refresh rotates beyond the first batch even while old rows need renewal", async () => {
  let clock = 241_000;
  const pairs = Array.from({ length: 600 }, (_, index) => ({
    ...pair, instrumentFrom: { ...pair.instrumentFrom, currencyTitle: `COIN${index}`, bestChangeCurrencyName: `COIN${index}` },
  }));
  const attempted = new Set<string>();
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "no-starvation", referrerId: "test", authenticated: true,
      read: async (path, params) => {
        if (path === "/pairs/all") return { total: pairs.length, pairs };
        attempted.add(params.instrumentFromCurrencyTitle);
        return { ...rate, updatedAt: clock };
      } }),
    codeAllowed: () => true,
    load: async () => pairs.slice(0, 256).map(p => ({
      key: partnerPairKey(p), pair: p, item: partnerRateToXml(p, rate), quotedAt: 0,
    })),
    save: async () => {}, remove: async () => {}, now: () => clock, sleep: async () => {},
  });
  try {
    const first = await refresh.snapshot(1000);
    assert.equal(first.rows.length, 320, "renew 192 old rows AND discover 64 later directions");
    for (let cycle = 0; cycle < 10 && attempted.size < pairs.length; cycle++) {
      clock += 61_000;
      await refresh.snapshot(1000);
    }
    assert.equal(attempted.size, pairs.length);
    clock += 300_001;
    refresh.stop();
    assert.equal((await refresh.snapshot(0)).freshRows.length, 0, "coverage must not extend freshness");
  } finally { refresh.stop(); }
});

test("a batch completing after freshness expiry never renews its early rows' clock", async () => {
  let clock = 0;
  const pairs = [pair, { ...pair, instrumentFrom: { ...pair.instrumentFrom, currencyTitle: "ETH", bestChangeCurrencyName: "ETH" } }];
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "delayed", referrerId: "test", authenticated: true,
      read: async (path, params) => {
        if (path === "/pairs/all") return { total: 2, pairs };
        if (params.instrumentFromCurrencyTitle === "ETH") {
          await new Promise(resolve => setTimeout(resolve, 5)); clock = 300_001;
        }
        return { ...rate, updatedAt: clock };
      } }),
    codeAllowed: () => true, load: async () => [], save: async () => {}, remove: async () => {},
    now: () => clock, sleep: async () => {},
  });
  const snapshot = await refresh.snapshot(1000);
  assert.equal(snapshot.rows.length, 2);
  assert.equal(snapshot.freshRows.length, 1, "the first rate is retained but cannot be advertised as live");
  assert.equal(snapshot.freshRows[0].pair.instrumentFrom.currencyTitle, "ETH");
});

test("Swap XML renews a still-valid rate before expiry without changing its 30s validity", async () => {
  const cache = new Map<string, XmlCachedQuote<number>>([
    ["active", { item: 1, quotedAt: Date.now() - 25_000, until: Date.now() + 5_000 }],
  ]);
  const refresh = new XmlQuoteRefresh<number>();
  await refresh.refresh("proactive", [{ key: "active", run: async () => 2 }], cache, () => true, 100);
  assert.equal(cache.get("active")?.item, 2);
  assert.ok(cache.get("active")!.until - cache.get("active")!.quotedAt! === 30_000);
});
