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

test("real scheduler pauses WhiteBIT-only RPC, preserves configurations and resumes Manual/fallback work", async t => {
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
      if (req.url?.startsWith("/tron/wallet/getnowblock")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ block_header: { raw_data: { number: 100 } } }));
        return;
      }
      const { method } = JSON.parse(body || "{}");
      const result = method === "eth_chainId" ? req.url?.startsWith("/tron") ? "0x2b6653dc" : "0x1" :
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
  assert.equal(calls, 0);
  let row = await network();
  assert.equal(row.healthStatus, "not_configured");
  assert.equal(row.enabled, true);
  assert.equal(row.endpointSecretRef, secretRef);
  assert.equal(row.healthCheckedAt, null, "Pausing must not renew a readiness proof");
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 0, "WhiteBIT-only idle network must not make periodic health requests.");

  const insertOrder = async (id: string, fallback = false, manual = false) => {
    await db.insert(ordersTable).values({
      id, type: "manual", status: "awaiting funds", fromAsset: "CUTEST", toAsset: "EUR",
      provider: "manual",
      fromNetwork: key.toUpperCase(), amount: "1", receiveAmount: "1", customerEmail: "synthetic@example.test",
      fundingProviderSource: manual ? "manual" : "whitebit",
      providerState: manual ? "" : fallback ? "whitebit_fallback" : "whitebit",
      fundingStatus: manual || fallback ? "ready_manual" : "ready_whitebit",
      manualSettlementState: "awaiting_funds",
      sourceSettlementOptionId: `crypto:${key}`,
      fundingDetailsSnapshot: { networkId: key, addressSource: manual || fallback ? "manual_fallback" : "whitebit", address: `0x${"11".repeat(20)}` },
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
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 0, "Provider-created WhiteBIT deposit must not create parallel chain polling.");

  const manualOrder = `${key}-manual`;
  await insertOrder(manualOrder, false, true);
  await insertWatch(manualOrder);
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 5, "New Manual watch wakes a paused network at the next normal cadence.");
  row = await network();
  assert.equal(row.nextAttemptAt!.getTime() - row.healthCheckedAt!.getTime(), 15_000);
  assert.equal((await db.select().from(blockchainMonitorWatchesTable)
    .where(eq(blockchainMonitorWatchesTable.orderId, manualOrder)))[0]!.active, true);

  await db.update(blockchainMonitorWatchesTable).set({ active: false })
    .where(eq(blockchainMonitorWatchesTable.orderId, manualOrder));
  await db.update(ordersTable).set({ status: "cancelled", manualSettlementState: "cancelled" })
    .where(eq(ordersTable.id, manualOrder));
  const fallbackOrder = `${key}-fallback`;
  await insertOrder(fallbackOrder, true);
  await insertWatch(fallbackOrder);
  await resetIdle();
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 10, "Frozen Manual fallback watch remains protected despite WhiteBIT catalog selection.");
  assert.equal((await db.select().from(blockchainMonitorWatchesTable)
    .where(eq(blockchainMonitorWatchesTable.orderId, fallbackOrder)))[0]!.active, true);

  await db.update(blockchainMonitorWatchesTable).set({ active: false })
    .where(eq(blockchainMonitorWatchesTable.orderId, fallbackOrder));
  await db.update(ordersTable).set({ status: "cancelled", manualSettlementState: "cancelled" })
    .where(eq(ordersTable.id, fallbackOrder));
  await db.update(cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(cryptoAssetNetworksTable.id, key));
  await db.update(blockchainMonitorNetworksTable).set({
    healthCheckedAt: new Date(Date.now() - 65_000), nextAttemptAt: new Date(Date.now() + 240_000),
  })
    .where(eq(blockchainMonitorNetworksTable.id, key));
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 10, "Remembered fallback with tracking OFF must not cause idle RPC.");
  await db.update(cryptoAssetNetworksTable).set({ manualWalletTrackingEnabled: true })
    .where(eq(cryptoAssetNetworksTable.id, key));
  await runBlockchainMonitoringCycle();
  row = await network();
  assert.equal(row.nextAttemptAt!.getTime() - row.healthCheckedAt!.getTime(), 60_000,
    "Effective opted-in tracked fallback retains fresh readiness.");
  assert.equal(calls, 15);

  await db.update(cryptoAssetNetworksTable).set({
    manualFallbackEnabled: false, depositProvider: "whitebit",
  }).where(eq(cryptoAssetNetworksTable.id, key));
  await db.update(blockchainMonitorNetworksTable).set({ nextAttemptAt: new Date(0) })
    .where(eq(blockchainMonitorNetworksTable.id, key));
  const paused = await network();
  await runBlockchainMonitoringCycle();
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 15, "Switching back to WhiteBIT pauses idle health checks, even when previously due.");
  assert.deepEqual(await network(), paused, "Pausing must preserve network configuration and health timestamps.");

  await db.update(cryptoAssetNetworksTable).set({
    depositProvider: "manual", customerDepositsEnabled: false, manualWalletTrackingEnabled: false,
  }).where(eq(cryptoAssetNetworksTable.id, key));
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 20, "Selecting Manual alone resumes readiness; enabling deposits still requires separate proof.");
  row = await network();
  assert.equal(row.endpointSecretRef, secretRef);
  assert.equal(row.enabled, true);
  assert.equal(row.chainId, "0x1");
  assert.equal(row.maxScanRange, 9);
  assert.equal(row.nextAttemptAt!.getTime() - row.healthCheckedAt!.getTime(), 60_000);
  const selectedRoute = (await db.select().from(cryptoAssetNetworksTable)
    .where(eq(cryptoAssetNetworksTable.id, key)))[0]!;
  assert.equal(selectedRoute.customerDepositsEnabled, false, "Resume must not silently enable deposits.");
  assert.equal(selectedRoute.manualWalletTrackingEnabled, false);

  await db.update(cryptoAssetNetworksTable).set({ depositProvider: "whitebit" })
    .where(eq(cryptoAssetNetworksTable.id, key));
  await db.update(blockchainMonitorNetworksTable).set({ nextAttemptAt: new Date(0) })
    .where(eq(blockchainMonitorNetworksTable.id, key));
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 20);

  await insertOrder(`${key}-unregistered`, false, true);
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 25, "An unregistered legacy Manual obligation must prevent RPC retirement.");

  // Isolate the independent TRON scheduler case from this synthetic EVM work.
  await db.update(blockchainMonitorNetworksTable).set({ enabled: false })
    .where(eq(blockchainMonitorNetworksTable.id, key));
  const tronId = `${key}-tron`;
  const tronRef = `${secretRef}_TRON`;
  process.env[tronRef] = `${process.env[secretRef]}/tron`;
  t.after(() => { delete process.env[tronRef]; });
  await db.insert(blockchainMonitorNetworksTable).values({
    id: tronId, networkCode: tronId.toUpperCase(), networkName: "Synthetic TRON",
    adapterKind: "tron", providerKind: "indexer", chainId: "0x2b6653dc",
    endpointSecretRef: tronRef, enabled: true, pollIntervalSeconds: 15,
  });
  await db.insert(cryptoAssetNetworksTable).values({
    id: tronId, assetId: key, networkCode: tronId.toUpperCase(), networkName: "Synthetic TRON",
    decimals: 6, depositProvider: "whitebit", manualFallbackEnabled: false,
    manualWalletTrackingEnabled: true,
  });
  await db.insert(blockchainMonitorAssetsTable).values({
    monitorNetworkId: tronId, assetNetworkId: tronId, identityKind: "native",
    decimals: 6, enabled: true,
  });
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 25, "WhiteBIT-only TRON must not poll its indexer.");
  await db.update(cryptoAssetNetworksTable).set({ depositProvider: "manual" })
    .where(eq(cryptoAssetNetworksTable.id, tronId));
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 27, "TRON Manual selection verifies chain/head once, without duplicate head reads.");
  const [tron] = await db.select().from(blockchainMonitorNetworksTable)
    .where(eq(blockchainMonitorNetworksTable.id, tronId));
  assert.equal(tron!.healthStatus, "connected");
  assert.equal(tron!.nextAttemptAt!.getTime() - tron!.healthCheckedAt!.getTime(), 60_000);
  await db.update(cryptoAssetNetworksTable).set({ depositProvider: "whitebit" })
    .where(eq(cryptoAssetNetworksTable.id, tronId));
  await db.update(blockchainMonitorNetworksTable).set({ nextAttemptAt: new Date(0) })
    .where(eq(blockchainMonitorNetworksTable.id, tronId));
  await runBlockchainMonitoringCycle();
  assert.equal(calls, 27, "Switching TRON back to WhiteBIT pauses without disabling configuration.");
  await db.update(cryptoAssetNetworksTable).set({ depositProvider: "manual" })
    .where(eq(cryptoAssetNetworksTable.id, tronId));
  await db.update(blockchainMonitorNetworksTable).set({ endpointSecretRef: null })
    .where(eq(blockchainMonitorNetworksTable.id, tronId));
  await runBlockchainMonitoringCycle();
  const [unconfigured] = await db.select().from(blockchainMonitorNetworksTable)
    .where(eq(blockchainMonitorNetworksTable.id, tronId));
  assert.equal(unconfigured!.healthStatus, "not_configured");
  assert.match(unconfigured!.healthError!, /configuration is unavailable/);
  assert.equal(calls, 27, "Missing configuration must not dispatch an RPC.");
  await runBlockchainMonitoringCycle();
  const [backedOff] = await db.select().from(blockchainMonitorNetworksTable)
    .where(eq(blockchainMonitorNetworksTable.id, tronId));
  assert.equal(backedOff!.healthCheckedAt!.getTime(), unconfigured!.healthCheckedAt!.getTime());
  await db.update(blockchainMonitorNetworksTable).set({
    endpointSecretRef: tronRef, nextAttemptAt: new Date(0),
  }).where(eq(blockchainMonitorNetworksTable.id, tronId));
  await runBlockchainMonitoringCycle();
  const [recovered] = await db.select().from(blockchainMonitorNetworksTable)
    .where(eq(blockchainMonitorNetworksTable.id, tronId));
  assert.equal(recovered!.healthStatus, "connected");
  assert.equal(calls, 29, "Restored exact configuration must recover through live readiness checks.");
});
