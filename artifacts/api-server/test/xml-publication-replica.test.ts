import assert from "node:assert/strict";
import test from "node:test";
import { ConvertXmlRefresh, freshExecutableXmlRows, type ConvertXmlSaved } from "../src/lib/rates-xml-convert-refresh";
import { parsePartnerPair, partnerPairKey, partnerRateToXml } from "../src/lib/quickex-xml-public";

const pair = parsePartnerPair({
  instrumentFrom: { currencyTitle: "BTC", networkTitle: "BTC", bestChangeCurrencyName: "BTC" },
  instrumentTo: { currencyTitle: "USDT", networkTitle: "TRX", bestChangeCurrencyName: "USDTTRC20", reservesAmount: "10" },
  isActive: true, minAmount: "0.001", maxAmount: "5",
});
const rate = {
  quotesWithoutNetworkFee: { sellQuote: { baseValue: "1", quoteValue: "10" } },
  finalNetworkFeeAmount: "0", generalMinAmount: "0.001", generalMaxAmount: "5",
};
const saved = (quotedAt: number, p = pair): ConvertXmlSaved => ({
  key: partnerPairKey(p), pair: p, item: partnerRateToXml(p, rate), quotedAt,
});
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const routes = [{ fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "TRX" }];

test("JSONB key ordering and omitted undefined fields do not retire identical live publications", async () => {
  let now = 1_000, removals = 0;
  const jsonb = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(jsonb);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
      .map(([key, item]) => [key, jsonb(item)]));
    return value;
  };
  const stored = () => ({ ...saved(now), pair: jsonb(pair) as typeof pair });
  assert.notEqual(JSON.stringify(stored().pair), JSON.stringify(pair), "fixture reproduces JSONB serialization");
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "jsonb", referrerId: "test", authenticated: true,
      read: async path => {
        if (path === "/pairs/all") return { total: 1, pairs: [pair] };
        throw Object.assign(new Error("Temporary provider timeout"), { status: 503 });
      } }),
    load: async () => [stored()], reload: async () => [stored()],
    save: async () => {}, remove: async () => { removals++; }, codeAllowed: () => true,
    now: () => now, sleep: async () => {},
  });
  try {
    assert.equal((await refresh.snapshot(1_000)).freshRows.length, 1);
    assert.equal(removals, 0, "identical stored metadata must not be deleted");
    now += 15_000; await refresh.snapshot(0); await flush();
    assert.equal((await refresh.snapshot(0)).freshRows[0].quotedAt, now,
      "replica recovery also compares metadata independently of JSON property order");
  } finally { refresh.stop(); }
});

test("a warm empty replica imports a fresh shared publication while provider discovery is stalled", async () => {
  let now = 1_000, reloads = 0, quotes = 0, warmed = 0;
  let release!: (value: unknown) => void;
  const catalogue = new Promise<unknown>(resolve => { release = resolve; });
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "replica", referrerId: "test", authenticated: true,
      read: async path => {
        if (path === "/pairs/all") return catalogue;
        quotes++; throw new Error("No quote should be needed for store recovery");
      } }),
    load: async () => [], reload: async () => { reloads++; return [saved(now)]; },
    warm: async () => { warmed++; },
    save: async () => {}, remove: async () => {}, codeAllowed: () => true, now: () => now,
  });
  try {
    assert.equal((await refresh.snapshot(0)).freshRows.length, 0);
    await flush();
    assert.equal(warmed, 1, "warm real instrument capabilities before the full catalogue finishes");
    now += 15_000;
    await refresh.snapshot(0);
    await flush();
    const recovered = await refresh.snapshot(0);
    assert.equal(recovered.freshRows.length, 1);
    assert.equal(freshExecutableXmlRows(recovered, routes).length, 1);
    assert.equal(freshExecutableXmlRows(recovered, []).length, 0, "current permissions still gate imported rates");
    assert.equal(reloads, 1, "do not query the store for every HTTP request");
    assert.equal(quotes, 0, "recovery never creates a quote or an order");
    now += 300_000;
    const expired = await refresh.snapshot(0);
    assert.equal(expired.freshRows.length, 0, "reading a shared row cannot renew its provider timestamp");
  } finally {
    refresh.stop(); release({ total: 1, pairs: [pair] }); await flush();
  }
});

test("replica synchronization cannot replace newer rates or import expired and future rates", async () => {
  let now = 1_000;
  let release!: (value: unknown) => void;
  const catalogue = new Promise<unknown>(resolve => { release = resolve; });
  const alternate = (currencyTitle: string) => ({
    ...pair, instrumentFrom: { ...pair.instrumentFrom, currencyTitle, bestChangeCurrencyName: currencyTitle },
  });
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "timestamps", referrerId: "test", authenticated: true, read: async () => catalogue }),
    load: async () => [saved(1_000)],
    reload: async () => [saved(999), saved(now - 300_000, alternate("OLD")), saved(now + 1, alternate("FUTURE"))],
    save: async () => {}, remove: async () => {}, codeAllowed: () => true, now: () => now,
  });
  try {
    await refresh.snapshot(0); now += 15_000;
    await refresh.snapshot(0); await flush();
    const result = await refresh.snapshot(0);
    assert.equal(result.rows.length, 1);
    assert.equal(result.freshRows[0].quotedAt, 1_000);
  } finally {
    refresh.stop(); release({ total: 1, pairs: [pair] }); await flush();
  }
});

test("credential rotation fences an in-flight publication reload", async () => {
  let now = 1_000, identity = "old";
  let finishReload!: (value: ConvertXmlSaved[]) => void;
  const pending = new Promise<ConvertXmlSaved[]>(resolve => { finishReload = resolve; });
  const catalogues: Array<(value: unknown) => void> = [];
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity, referrerId: "test", authenticated: true,
      read: async () => new Promise(resolve => { catalogues.push(resolve); }) }),
    load: async () => [], reload: async scope => {
      assert.ok(scope.endsWith(":old")); return pending;
    },
    save: async () => {}, remove: async () => {}, codeAllowed: () => true, now: () => now,
  });
  try {
    await refresh.snapshot(0); now += 15_000;
    await refresh.snapshot(0); await flush();
    identity = "new"; await refresh.snapshot(0);
    finishReload([saved(now)]); await flush();
    assert.equal((await refresh.snapshot(0)).rows.length, 0);
  } finally {
    refresh.stop(); for (const resolve of catalogues) resolve({ total: 1, pairs: [pair] }); await flush();
  }
});

test("a delayed store read cannot resurrect an authoritatively retired direction", async () => {
  let now = 1_000, removals = 0;
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "retired", referrerId: "test", authenticated: true,
      read: async path => {
        if (path === "/pairs/all") return { total: 1, pairs: [pair] };
        throw Object.assign(new Error("Pair unavailable"), { status: 422 });
      } }),
    load: async () => [saved(now)], reload: async () => [saved(now)],
    save: async () => {}, remove: async () => { removals++; }, codeAllowed: () => true, now: () => now,
  });
  try {
    assert.equal((await refresh.snapshot(1_000)).rows.length, 0);
    assert.ok(removals > 0);
    now += 15_000; await refresh.snapshot(0); await flush();
    assert.equal((await refresh.snapshot(0)).freshRows.length, 0);
  } finally { refresh.stop(); }
});

test("publication-store failure is single-flight and retains valid rates until a bounded retry", async () => {
  let now = 1_000, reloads = 0;
  let rejectReload!: (error: Error) => void;
  let release!: (value: unknown) => void;
  const catalogue = new Promise<unknown>(resolve => { release = resolve; });
  const refresh = new ConvertXmlRefresh({
    client: async () => ({ identity: "store-outage", referrerId: "test", authenticated: true, read: async () => catalogue }),
    load: async () => [saved(1_000)], reload: async () => {
      reloads++;
      if (reloads === 1) return new Promise((_resolve, reject) => { rejectReload = reject; });
      return [saved(now)];
    },
    save: async () => {}, remove: async () => {}, codeAllowed: () => true, now: () => now,
  });
  try {
    await refresh.snapshot(0); now += 15_000;
    await refresh.snapshot(0); await flush();
    for (let i = 0; i < 5; i++) assert.equal((await refresh.snapshot(0)).freshRows.length, 1);
    assert.equal(reloads, 1);
    rejectReload(new Error("Database unavailable")); await flush();
    const failed = await refresh.snapshot(0);
    assert.equal(failed.freshRows[0].quotedAt, 1_000);
    assert.match(failed.error!, /Shared XML publication recovery/);
    now += 15_000; await refresh.snapshot(0); await flush();
    assert.equal((await refresh.snapshot(0)).freshRows[0].quotedAt, now);
    assert.equal((await refresh.snapshot(0)).error, undefined);
    assert.equal(reloads, 2);
  } finally {
    refresh.stop(); release({ total: 1, pairs: [pair] }); await flush();
  }
});
