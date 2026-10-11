import assert from "node:assert/strict";
import { test } from "node:test";
import { XmlQuoteRefresh, type XmlCachedQuote } from "../src/lib/rates-xml-refresh";

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
