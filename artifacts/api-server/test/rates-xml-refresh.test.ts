import assert from "node:assert/strict";
import { test } from "node:test";
import { XmlQuoteRefresh, xmlDiscoveryDeadline, type XmlCachedQuote } from "../src/lib/rates-xml-refresh";

test("bounded HTTP wait continues all quotes, caps concurrency, and shares simultaneous refreshes", async () => {
  const refresh = new XmlQuoteRefresh<number>(), cache = new Map<string, XmlCachedQuote<number>>();
  let calls = 0, active = 0, maximum = 0;
  const release: Array<() => void> = [];
  const tasks = Array.from({ length: 6 }, (_, i) => ({
    key: String(i), run: async () => {
      calls++; active++; maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => release.push(resolve));
      active--; return i;
    },
  }));
  await Promise.all([
    refresh.refresh("same", tasks, cache, () => true, 5),
    refresh.refresh("same", tasks, cache, () => true, 5),
  ]);
  assert.equal(calls, 3, "HTTP response does not await every provider quote or duplicate requests");
  assert.equal(cache.size, 0, "no invented result for pending quotes");
  release.splice(0).forEach(resolve => resolve());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 6, "remaining directions continue after the bounded wait");
  release.splice(0).forEach(resolve => resolve());
  await refresh.refresh("same", tasks, cache, () => true, 100);
  assert.equal(cache.size, 6);
  assert.equal(maximum, 3);
  await refresh.refresh("same", tasks, cache, () => true, 100);
  assert.equal(calls, 6, "fresh cached quotes are not fetched again");
});

test("configuration invalidation fences late quotes and stops old queued directions", async () => {
  const refresh = new XmlQuoteRefresh<number>(), cache = new Map<string, XmlCachedQuote<number>>();
  let current = true, calls = 0;
  const release: Array<() => void> = [];
  const tasks = Array.from({ length: 6 }, (_, i) => ({
    key: String(i), run: async () => {
      calls++; await new Promise<void>(resolve => release.push(resolve)); return i;
    },
  }));
  await refresh.refresh("old", tasks, cache, () => current, 5);
  current = false;
  release.splice(0).forEach(resolve => resolve());
  await refresh.refresh("old", tasks, cache, () => current, 100);
  assert.equal(calls, 3);
  assert.equal(cache.size, 0);
});

test("provider failures remain explicit and do not block the rest of the refresh", async () => {
  const refresh = new XmlQuoteRefresh<number>(), cache = new Map<string, XmlCachedQuote<number>>();
  await refresh.refresh("errors", [
    { key: "bad", run: async () => { throw new Error("Provider unavailable"); } },
    { key: "good", run: async () => 123 },
  ], cache, () => true, 100);
  assert.equal(cache.get("bad")?.reason, "Provider unavailable");
  assert.equal(cache.get("bad")?.item, undefined);
  assert.equal(cache.get("good")?.item, 123);
});

test("expired successful rates survive both slow refreshes and provider failures", async () => {
  const refresh = new XmlQuoteRefresh<number>();
  const cache = new Map<string, XmlCachedQuote<number>>([
    ["route", { item: 123, quotedAt: 1, until: 0 }],
  ]);
  let release!: () => void;
  const tasks = [{ key: "route", run: async () => {
    await new Promise<void>(resolve => { release = resolve; });
    throw new Error("Provider timeout");
  } }];
  await refresh.refresh("config", tasks, cache, () => true, 5);
  assert.equal(cache.get("route")?.item, 123, "TTL does not remove the previous successful item");
  release();
  await refresh.refresh("config", tasks, cache, () => true, 100);
  assert.equal(cache.get("route")?.item, 123, "failed refresh cannot overwrite it with an error");
  assert.equal(cache.get("route")?.quotedAt, 1);
  assert.equal(cache.get("route")?.reason, "Provider timeout");
});

test("a restored cold-start publication refreshes successfully without creating an empty interval", async () => {
  const refresh = new XmlQuoteRefresh<number>();
  const cache = new Map<string, XmlCachedQuote<number>>([
    ["saved:route", { item: 123, quotedAt: 1, until: 0 }],
  ]);
  const persisted: number[] = [];
  await refresh.refresh("saved", [{ key: "saved:route", run: async () => 456 }],
    cache, () => true, 100, async (_key, value) => { persisted.push(value); });
  assert.equal(cache.get("saved:route")?.item, 456);
  assert.equal(cache.get("saved:route")?.reason, undefined);
  assert.deepEqual(persisted, [456]);
  assert.ok(cache.get("saved:route")!.quotedAt! > 1);
});

test("a different configuration never reuses the previous configuration's cached rates", async () => {
  const refresh = new XmlQuoteRefresh<number>();
  const cache = new Map<string, XmlCachedQuote<number>>([
    ["old:route", { item: 123, until: 0 }],
  ]);
  await refresh.refresh("new", [{ key: "new:route", run: async () => { throw new Error("Pending"); } }],
    cache, () => true, 100);
  assert.equal(cache.get("new:route")?.item, undefined);
  assert.equal(cache.get("old:route")?.item, 123);
});

test("slow catalogue discovery has a bounded wait without losing its eventual result", async () => {
  let release!: (value: number) => void;
  const work = new Promise<number>(resolve => { release = resolve; });
  await assert.rejects(xmlDiscoveryDeadline(work, 5), /discovery is slow/);
  release(123);
  assert.equal(await work, 123);
});
