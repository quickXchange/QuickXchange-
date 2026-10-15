import assert from "node:assert/strict";
import test from "node:test";
import { xmlDiscoveryDeadline, xmlDiscoverySingleFlight } from "../src/lib/rates-xml-refresh";

test("HTTP discovery timeout does not abort the shared background flight or duplicate provider work", async () => {
  let calls = 0, release!: (value: { signedOrders: boolean; pairs: string[] }) => void;
  const discover = xmlDiscoverySingleFlight(async () => {
    calls++;
    return new Promise<{ signedOrders: boolean; pairs: string[] }>(resolve => { release = resolve; });
  });
  const background = discover();
  assert.equal(discover(), background);
  await assert.rejects(xmlDiscoveryDeadline(discover(), 5),
    (error: { code?: string }) => error.code === "XML_DISCOVERY_TIMEOUT");
  assert.equal(calls, 1);
  assert.equal(discover(), background, "the timed-out request must not restart background discovery");
  const current = { signedOrders: true, pairs: ["BTC:BTC->USDT:TRC20"] };
  release(current);
  assert.equal(await background, current, "background work receives the real executable catalogue");
  const next = discover();
  assert.notEqual(next, background, "do not cache route permissions after discovery finishes");
  await Promise.resolve();
  release({ signedOrders: false, pairs: [] });
  assert.deepEqual(await next, { signedOrders: false, pairs: [] });
});

test("failed executable discovery clears the flight and recovers without treating failure as an empty catalogue", async () => {
  let calls = 0;
  const discover = xmlDiscoverySingleFlight(async () => {
    if (++calls === 1) throw new Error("provider unavailable");
    return { signedOrders: true, pairs: ["recovered"] };
  });
  const first = discover();
  assert.equal(discover(), first);
  await assert.rejects(first, /provider unavailable/);
  assert.deepEqual(await discover(), { signedOrders: true, pairs: ["recovered"] });
  assert.equal(calls, 2);
});
