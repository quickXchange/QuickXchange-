import assert from "node:assert/strict";
import test from "node:test";
import { ConvertXmlRefresh } from "../src/lib/rates-xml-convert-refresh";
import { parsePartnerPair } from "../src/lib/quickex-xml-public";
import { XmlQuoteRefresh, type XmlCachedQuote } from "../src/lib/rates-xml-refresh";

const pair = parsePartnerPair({
  instrumentFrom: { currencyTitle: "BTC", networkTitle: "BTC", bestChangeCurrencyName: "BTC" },
  instrumentTo: { currencyTitle: "USDT", networkTitle: "TRX", bestChangeCurrencyName: "USDTTRC20", reservesAmount: "1" },
  isActive: true, minAmount: "0.001", maxAmount: "5",
});
const rate = { quotesWithoutNetworkFee: { sellQuote: { baseValue: "1", quoteValue: "10" } }, finalNetworkFeeAmount: "0" };

test("large XML catalogs yield bounded batches and refresh existing rows before expiry", async () => {
  let clock = 0, catalogs = 0, quotes = 0;
  const pairs = Array.from({ length: 300 }, (_, index) => ({
    ...pair, instrumentFrom: { ...pair.instrumentFrom, currencyTitle: `COIN${index}`, bestChangeCurrencyName: `COIN${index}` },
  }));
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "rolling", referrerId: "test", authenticated: true,
      read: async path => {
        if (path === "/pairs/all") { catalogs++; return { total: pairs.length, pairs }; }
        quotes++; return rate;
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
        return rate;
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
