import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { monitoringCadenceMs, monitoringCycleDue, requiresManualMonitoringReadiness, type MonitoringWorkload } from "../src/lib/blockchain-monitoring/workload-policy";
import { RpcUsageMeter, rpcUsageMeter, rpcUsageProvider } from "../src/lib/blockchain-monitoring/rpc-usage";
import { EvmJsonRpcAdapter } from "../src/lib/blockchain-monitoring/evm";

test("Manual wallet readiness needs tracking and effective Manual/fallback use", () => {
  for (const depositProvider of ["whitebit", "none"]) {
    assert.equal(requiresManualMonitoringReadiness({
      depositProvider, manualWalletTrackingEnabled: true, manualFallbackEnabled: false,
    }), false);
  }
  assert.equal(requiresManualMonitoringReadiness({
    depositProvider: "manual", manualWalletTrackingEnabled: true, manualFallbackEnabled: false,
  }), true);
  assert.equal(requiresManualMonitoringReadiness({
    depositProvider: "whitebit", manualWalletTrackingEnabled: true, manualFallbackEnabled: true,
  }), true);
  for (const depositProvider of ["manual", "whitebit"]) {
    assert.equal(requiresManualMonitoringReadiness({
      depositProvider, manualWalletTrackingEnabled: false, manualFallbackEnabled: true,
    }), false);
  }
});

const idle: MonitoringWorkload = {
  activeWatches: false, pendingEvidence: false, registrationGaps: false, manualReadiness: false,
};
test("unused/WhiteBIT-only networks make no periodic RPC even with no due timer", () => {
  for (const healthStatus of ["connected", "disconnected", "not_configured"]) {
    for (const nextAttemptAt of [null, new Date(0)]) {
      assert.equal(monitoringCycleDue({
        now: Date.now(), healthStatus, nextAttemptAt,
        healthCheckedAt: null, pollSeconds: 15, workload: idle,
      }), false);
    }
  }
});
test("manual/fallback readiness remains inside the existing freshness fence", () => {
  for (const poll of [5, 15, 30, 60, 120]) {
    const cadence = monitoringCadenceMs(poll, { ...idle, manualReadiness: true });
    assert.ok(cadence <= Math.max(120_000, poll * 3000));
    assert.ok(cadence >= poll * 1000);
  }
});
for (const field of ["activeWatches", "pendingEvidence", "registrationGaps"] as const) {
  test(`${field} preserves fast monitoring even with no enabled Manual catalog routes`, () => {
    assert.equal(monitoringCadenceMs(15, { ...idle, [field]: true }), 15_000);
  });
}
test("configured slower polling is honored without increasing any network's requested rate", () => {
  assert.equal(monitoringCadenceMs(90, { ...idle, activeWatches: true }), 90_000);
});
test("a new watch wakes a connected network before its idle interval expires", () => {
  const now = Date.now();
  assert.equal(monitoringCycleDue({
    now, nextAttemptAt: new Date(now + 240_000), healthStatus: "connected",
    healthCheckedAt: new Date(now - 20_000), pollSeconds: 15,
    workload: { ...idle, activeWatches: true },
  }), true);
});
test("new work does not bypass provider failure or quota backoff", () => {
  const now = Date.now();
  assert.equal(monitoringCycleDue({
    now, nextAttemptAt: new Date(now + 900_000), healthStatus: "disconnected",
    healthCheckedAt: new Date(now - 60_000), pollSeconds: 15,
    workload: { ...idle, activeWatches: true, pendingEvidence: true },
  }), false);
});
test("new Manual/fallback availability wakes standby before its readiness can expire", () => {
  const now = Date.now();
  assert.equal(monitoringCycleDue({
    now, nextAttemptAt: new Date(now + 240_000), healthStatus: "connected",
    healthCheckedAt: new Date(now - 65_000), pollSeconds: 15,
    workload: { ...idle, manualReadiness: true },
  }), true);
});
test("new work cannot make a connected network poll faster than configured", () => {
  const now = Date.now();
  assert.equal(monitoringCycleDue({
    now, nextAttemptAt: new Date(now + 240_000), healthStatus: "connected",
    healthCheckedAt: new Date(now - 1000), pollSeconds: 15,
    workload: { ...idle, activeWatches: true },
  }), false);
});
test("paused networks stay paused; selected Manual routes recover when backoff expires", () => {
  const now = Date.now();
  const input = {
    now, nextAttemptAt: new Date(now + 1000), healthStatus: "connected",
    healthCheckedAt: new Date(now - 60_000), pollSeconds: 15, workload: idle,
  };
  assert.equal(monitoringCycleDue(input), false);
  assert.equal(monitoringCycleDue({ ...input, nextAttemptAt: new Date(now - 1), healthStatus: "disconnected" }), false);
  assert.equal(monitoringCycleDue({
    ...input, nextAttemptAt: new Date(now - 1), healthStatus: "disconnected",
    workload: { ...idle, manualReadiness: true },
  }), true);
});
test("usage windows contain exact dispatched counts and purpose, not endpoints or billed-CU claims", () => {
  const meter = new RpcUsageMeter(0);
  meter.record("ERC20", "alchemy", "monitoring", "eth_getLogs");
  meter.record("ERC20", "alchemy", "monitoring", "eth_getLogs");
  meter.record("BEP20", "alchemy", "registration", "eth_blockNumber");
  assert.equal(meter.flush(1000), undefined);
  const usage = meter.flush(300_000)!;
  assert.equal(usage.requests.reduce((sum, row) => sum + row.requests, 0), 3);
  assert.equal(usage.requests[0]!.requests, 2);
  assert.equal(usage.elapsedMs, 300_000);
  assert.equal(usage.measurement, "actual_fetch_dispatches_not_billed_cus");
  assert.equal("endpoint" in usage.requests[0]!, false);
  assert.equal(meter.flush(600_000)!.requests.length, 0);
  assert.equal(rpcUsageProvider("https://eth-mainnet.g.alchemy.com/v2/private"), "alchemy");
  assert.equal(rpcUsageProvider("https://alchemy.com.evil.invalid/private"), "other");
});
test("quota cooldown is not counted as an additional dispatched RPC", async t => {
  rpcUsageMeter.flush(Date.now(), true);
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: 429, message: "Monthly capacity exceeded" } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const adapter = new EvmJsonRpcAdapter({
    networkCode: "METER_TEST", provider: "rpc", rpcPurpose: "monitoring",
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/private-key`,
  });
  await assert.rejects(adapter.getHead());
  await assert.rejects(adapter.getHead());
  assert.equal(calls, 1);
  const snapshot = rpcUsageMeter.flush(Date.now(), true)!;
  assert.deepEqual(snapshot.requests, [{
    network: "METER_TEST", provider: "other", purpose: "monitoring", method: "eth_blockNumber", requests: 1,
  }]);
  assert.ok(!JSON.stringify(snapshot).includes("private-key"));
});
test("meter capacity limits never silently discard request totals", () => {
  const meter = new RpcUsageMeter(0);
  for (let n = 0; n < 260; n++) meter.record(`TEST_${n}`, "other", "monitoring", "eth_blockNumber");
  const snapshot = meter.flush(300_000)!;
  assert.equal(snapshot.requests.length, 256);
  assert.equal(snapshot.unattributedRequests, 4);
  assert.equal(meter.flush(600_000)!.unattributedRequests, 0);
});
