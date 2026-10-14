import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { BlockchainMonitorError, providerFailureDetails } from "../src/lib/blockchain-monitoring/errors";
import { providerJson } from "../src/lib/blockchain-monitoring/http";
import { EvmJsonRpcAdapter } from "../src/lib/blockchain-monitoring/evm";

test("quota diagnostics contain only whitelisted numbers/enums, never provider messages", () => {
  const details = providerFailureDetails({ error: { code: 429, message:
    "Monthly capacity limit exceeded. https://provider/private-key" } }, 429);
  assert.deepEqual(details, {
    httpStatus: 429, rpcCode: 429, reason: "quota_exhausted", retryAfterMs: 900_000,
  });
  assert.ok(!JSON.stringify(details).includes("private-key"));
  assert.equal(providerFailureDetails({}, 401).reason, "unauthorized");
  assert.equal(providerFailureDetails({}, 403).reason, "forbidden");
});

test("Retry-After is bounded and does not collapse monthly quota into rapid retries", () => {
  assert.equal(providerFailureDetails({}, 429, "120").retryAfterMs, 120_000);
  assert.equal(providerFailureDetails({}, 429, "99999999").retryAfterMs, 3_600_000);
  assert.equal(providerFailureDetails({ error: "Monthly quota exceeded" }, 429, "1").retryAfterMs, 900_000);
  assert.equal(providerFailureDetails({}, 429, "bad").retryAfterMs, 30_000);
});

for (const httpStatus of [200, 429]) test(`HTTP ${httpStatus} JSON-RPC quota errors stop repeated endpoint calls`, async t => {
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++; res.writeHead(httpStatus, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: 429, message: "Monthly capacity limit exceeded; secret/path" } }));
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address() as { port: number };
  const endpoint = `http://127.0.0.1:${address.port}/private-endpoint`;
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(providerJson(endpoint, {}, 1000), error => {
      assert.ok(error instanceof BlockchainMonitorError);
      assert.equal(error.code, "PROVIDER");
      assert.equal(error.providerFailure?.reason, "quota_exhausted");
      assert.ok(error.providerFailure!.retryAfterMs! > 800_000);
      assert.ok(!error.message.includes("secret"));
      assert.ok(!error.message.includes("private-endpoint"));
      return true;
    });
  }
  assert.equal(calls, 1, "the second call must fail closed without consuming more quota");
});

test("EVM readiness preserves safe provider diagnostics through its wrapper", async t => {
  const events: Array<{ providerFailure?: { httpStatus?: number; reason?: string } }> = [];
  const server = createServer((_req, res) => {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: 429, message: "Monthly limit exceeded" } }));
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const adapter = new EvmJsonRpcAdapter({
    networkCode: "BEP20", provider: "rpc", endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    rpcTrace: event => events.push(event),
  });
  await assert.rejects(adapter.testConnection(), error => {
    assert.ok(error instanceof BlockchainMonitorError);
    assert.equal(error.providerFailure?.httpStatus, 429);
    assert.equal(error.providerFailure?.reason, "quota_exhausted");
    return true;
  });
  assert.ok(events.some(event => event.providerFailure?.httpStatus === 429));
});

test("expired cooldown permits recovery instead of permanently poisoning the endpoint", async t => {
  let calls = 0;
  const server = createServer((_req, res) => {
    const limited = ++calls === 1;
    res.writeHead(limited ? 429 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(limited
      ? { error: { code: 429, message: "Monthly capacity limit exceeded" } } : { result: "0x38" }));
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  await assert.rejects(providerJson(endpoint, {}, 1000), BlockchainMonitorError);
  await assert.rejects(providerJson(endpoint, {}, 1000), BlockchainMonitorError);
  assert.equal(calls, 1);
  t.mock.timers.tick(900_001);
  assert.deepEqual(await providerJson(endpoint, {}, 1000), { result: "0x38" });
  assert.equal(calls, 2);
});
