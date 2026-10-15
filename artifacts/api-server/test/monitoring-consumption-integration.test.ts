import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  db, pool, ordersTable, blockchainMonitorNetworksTable,
  blockchainMonitorAssetsTable, blockchainMonitorWatchesTable,
  cryptoAssetsTable, cryptoAssetNetworksTable,
} from "@workspace/db";
import { registerManualBlockchainWatch, runBlockchainMonitoringCycle } from "../src/lib/blockchain-monitoring/service";

test("real scheduler reduces idle calls, wakes Manual/fallback watches and never creates parallel WhiteBIT watches", async t => {
  assert.equal(process.env.API_TEST_DISPOSABLE_DATABASE, "1", "Only a disposable database may run this test.");
  t.after(async () => { await pool.end(); });
  // Prevent copied Development monitors or gaps from making real RPC calls.
  await db.update(blockchainMonitorNetworksTable).set({ enabled: false });
  const key = `cu-${randomUUID()}`;
  const secretRef = `CU_TEST_${randomUUID().replaceAll("-", "").toUpperCase()}`;
  let calls = 0;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      calls++;
      const { method } = JSON.parse(body);
      const result = method === "eth_chainId" ? "0x1" :
        method === "eth_blockNumber" ? "0x64" :
        method === "eth_getLogs" ? [] :
        method === "eth_getBlockByNumber" ? { hash: "0xblock", number: "0x64", timestamp: "0x1", transactions: ["0xtx"] } :
        method === "eth_getTransactionReceipt" ? { status: "0x1", blockHash: "0xblock", blockNumber: "0x64", logs: [] } : null;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env[secretRef] = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(() => { delete process.env[secretRef]; server.closeAllConnections(); server.close(); });
  await db.insert(blockchainMonitorNetworksTable).values({
    id: key, networkCode: key.toUpperCase(), networkName: "Synthetic CU network",
    adapterKind: "evm", chainId: "0x1", providerKind: "rpc",
    endpointSecretRef: secretRef, enabled: true, maxScanRange: 9, pollIntervalSeconds: 15,
  });
  await db.insert(cryptoAssetsTable).values({ id: key, code: "CUTEST", name: "Synthetic CU asset", decimals: 6 });
  await db.insert(cryptoAssetNetworksTable).values({
    id: key, assetId: key, networkCode: key.toUpperCase(), networkName: "Synthetic CU network",
    decimals: 6, depositProvider: "whitebit", customerDepositsEnabled: true,
    manualFallbackEnabled: false, manualWalletTrackingEnabled: false,
  });
  const [asset] = await db.insert(blockchainMonitorAssetsTable).values({
    monitorNetworkId: key, assetNetworkId: key, identityKind: "token",
    contractOrMint: `0x${"22".repeat(20)}`, decimals: 6, enabled: true,
  }).returning();
  const network = async () => (await db.select().from(blockchainMonitorNetworksTable)
    .where(eq(blockchainMonitorNetworksTable.id, key)))[0]!;
  const resetIdle = async () => {
    const now = Date.now();
    await db.update(blockchainMonitorNetworksTable).set({
      healthCheckedAt: new Date(now - 20_000), nextAttemptAt: new Date(now + 240_000),
    }).where(eq(blockchainMonitorNetworksTable.id, key));
  };
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 5);
  let row = await network();
  assert.equal(row.healthStatus, "connected");
  assert.ok(row.nextAttemptAt!.getTime() - row.healthCheckedAt!.getTime() >= 299_000);
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 5, "WhiteBIT-only idle network must not re-probe every scheduler tick.");

  const insertOrder = async (id: string, fallback = false, manual = false) => {
    await db.insert(ordersTable).values({
      id, type: "manual", status: "awaiting funds", fromAsset: "CUTEST", toAsset: "EUR",
      provider: "manual",
      fromNetwork: key.toUpperCase(), amount: "1", receiveAmount: "1", customerEmail: "synthetic@example.test",
      fundingProviderSource: manual ? "manual" : "whitebit",
      providerState: manual ? "" : fallback ? "whitebit_fallback" : "whitebit",
      fundingStatus: manual || fallback ? "ready_manual" : "ready_whitebit",
      manualSettlementState: "awaiting_funds",
      fundingDetailsSnapshot: { addressSource: manual || fallback ? "manual_fallback" : "whitebit", address: `0x${"11".repeat(20)}` },
    });
  };
  const insertWatch = async (orderId: string) => {
    await db.insert(blockchainMonitorWatchesTable).values({
      orderId, monitorNetworkId: key, monitorAssetId: asset!.id, assetNetworkId: key,
      expectedAmount: "1", receivingAddress: `0x${"11".repeat(20)}`,
      identityKind: "token", contractOrMint: asset!.contractOrMint, decimals: 6,
      orderCreatedAt: new Date(), startCursor: "101", currentCursor: "101", active: true,
    });
  };
  const whitebitOrder = `${key}-whitebit`;
  await insertOrder(whitebitOrder);
  await registerManualBlockchainWatch(whitebitOrder);
  assert.equal((await db.select().from(blockchainMonitorWatchesTable)
    .where(eq(blockchainMonitorWatchesTable.orderId, whitebitOrder))).length, 0);
  await resetIdle();
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 5, "Provider-created WhiteBIT deposit must not create parallel chain polling.");

  const manualOrder = `${key}-manual`;
  await insertOrder(manualOrder, false, true);
  await insertWatch(manualOrder);
  await resetIdle();
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 10, "New Manual watch wakes an idle network at the next normal cadence.");
  row = await network();
  assert.equal(row.nextAttemptAt!.getTime() - row.healthCheckedAt!.getTime(), 15_000);
  assert.equal((await db.select().from(blockchainMonitorWatchesTable)
    .where(eq(blockchainMonitorWatchesTable.orderId, manualOrder)))[0]!.active, true);

  await db.update(blockchainMonitorWatchesTable).set({ active: false })
    .where(eq(blockchainMonitorWatchesTable.orderId, manualOrder));
  const fallbackOrder = `${key}-fallback`;
  await insertOrder(fallbackOrder, true);
  await insertWatch(fallbackOrder);
  await resetIdle();
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 15, "Frozen Manual fallback watch remains protected despite WhiteBIT catalog selection.");
  assert.equal((await db.select().from(blockchainMonitorWatchesTable)
    .where(eq(blockchainMonitorWatchesTable.orderId, fallbackOrder)))[0]!.active, true);

  await db.update(blockchainMonitorWatchesTable).set({ active: false })
    .where(eq(blockchainMonitorWatchesTable.orderId, fallbackOrder));
  await db.update(cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(cryptoAssetNetworksTable.id, key));
  await db.update(blockchainMonitorNetworksTable).set({
    healthCheckedAt: new Date(Date.now() - 65_000), nextAttemptAt: new Date(Date.now() + 240_000),
  })
    .where(eq(blockchainMonitorNetworksTable.id, key));
  await runBlockchainMonitoringCycle();
  row = await network();
  assert.equal(row.nextAttemptAt!.getTime() - row.healthCheckedAt!.getTime(), 60_000,
    "Opted-in fallback retains fresh readiness even without Manual tracking on the catalog row.");
});
