import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { startBackgroundVerification } from "../src/lib/background-verification";

test("verification starts its fence synchronously but a stalled provider never blocks HTTP", async () => {
  let fenced = false;
  let complete!: (verified: boolean) => void;
  let calls = 0;
  const stop = startBackgroundVerification(() => {
    calls++;
    fenced = true;
    return new Promise(resolve => { complete = resolve; });
  }, 10, 10);
  assert.equal(fenced, true);
  const server = createServer((_req, res) => res.end("ready"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(await response.text(), "ready");
    assert.equal(calls, 1);
    stop();
    complete(true); // A late completion after shutdown must not reschedule.
    await delay(35);
    assert.equal(calls, 1);
  } finally {
    stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("a failed verification recovers on its next bounded schedule", async () => {
  let calls = 0;
  const stop = startBackgroundVerification(async () => {
    calls++;
    if (calls === 1) throw new Error("Synthetic connection failure");
    return true;
  }, 1000, 5);
  try {
    const deadline = Date.now() + 1000;
    while (calls < 2 && Date.now() < deadline) await delay(5);
    assert.equal(calls, 2);
    await delay(20);
    assert.equal(calls, 2);
  } finally {
    stop();
  }
});
