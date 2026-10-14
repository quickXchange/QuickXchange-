import assert from "node:assert/strict";
import test from "node:test";
import { startDrainingWorker } from "../src/lib/draining-worker";
import { XmlQuoteRefresh } from "../src/lib/rates-xml-refresh";

test("worker stop waits for lease cleanup before database shutdown and prevents overlapping ticks", async () => {
  const events: string[] = [];
  let release!: () => void;
  const stop = startDrainingWorker(async () => {
    events.push("started");
    await new Promise<void>(resolve => { release = resolve; });
    events.push("lease-released");
  }, 2, error => { throw error; });
  await new Promise(resolve => setTimeout(resolve, 12));
  assert.deepEqual(events, ["started"], "timer ticks must not overlap a running cycle");
  const drain = stop().then(() => { events.push("pool-closed"); });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(events, ["started"], "pool closure waits for the current cycle");
  release(); await drain; await stop();
  await new Promise(resolve => setTimeout(resolve, 6));
  assert.deepEqual(events, ["started", "lease-released", "pool-closed"]);
});

test("failed workers report once and still drain safely", async () => {
  let failures = 0;
  const stop = startDrainingWorker(async () => { throw new Error("Synthetic failure"); }, 1000, () => { failures++; });
  await new Promise(resolve => setTimeout(resolve, 1));
  await stop();
  assert.equal(failures, 1);
});

test("stopping before the initial microtask prevents resource use", async () => {
  let ran = false;
  const stop = startDrainingWorker(async () => { ran = true; }, 1, () => {});
  await stop();
  assert.equal(ran, false);
});

test("XML shutdown drains the in-flight save and never starts queued quotes", async () => {
  const refresh = new XmlQuoteRefresh<number>(), cache = new Map();
  let release!: () => void, saves = 0, closed = false, started = 0;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const work = refresh.refresh("shutdown", Array.from({ length: 10 }, (_, index) => ({
    key: String(index), run: async () => { started++; return index; },
  })), cache, () => true, 1, async () => {
    await barrier;
    assert.equal(closed, false); saves++;
  });
  await work;
  assert.equal(started, 3);
  const drain = refresh.stop().then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  release();
  await drain;
  assert.equal(closed, true);
  assert.equal(saves, 3);
  assert.equal(started, 3, "no queued quote may start after stop");
  await refresh.refresh("after-close", [{ key: "late", run: async () => { started++; return 99; } }],
    cache, () => true, 1);
  assert.equal(started, 3);
});
