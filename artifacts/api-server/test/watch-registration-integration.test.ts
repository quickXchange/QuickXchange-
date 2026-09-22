import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  blockchainMonitorRegistrationGapsTable,
  blockchainMonitorWatchesTable,
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
  ordersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { registerManualBlockchainWatch } from "../src/lib/blockchain-monitoring/service";

const routeIds = [
  "btc-bitcoin",
  "usdt-bep20",
  "usdc-erc20",
  "usdt-trc20",
  "usdc-polygon",
] as const;

test("eligible signed routes create exactly one automatic watch per order", async () => {
  const routes = await db.select({
    route: cryptoAssetNetworksTable,
    assetCode: cryptoAssetsTable.code,
  }).from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(inArray(cryptoAssetNetworksTable.id, [...routeIds]));
  assert.equal(routes.length, routeIds.length);

  const suffix = randomUUID();
  const orderIds = routes.map((route) => `watch-regression-${route.route.id}-${suffix}`);
  try {
    await db.insert(ordersTable).values(routes.map((route, index) => ({
      id: orderIds[index],
      type: "manual",
      status: "awaiting funds",
      fromAsset: route.assetCode,
      fromNetwork: route.route.networkCode,
      toAsset: "EUR",
      toNetwork: "SEPA",
      amount: "1",
      receiveAmount: "1",
      customerEmail: `watch-regression-${index}-${suffix}@example.test`,
      depositAddress: route.route.sharedDepositAddress,
      depositMemo: route.route.sharedDepositMemo ?? "",
      provider: "Manual desk",
      sourceSettlementOptionId: `crypto:${route.route.id}`,
      fundingStatus: "ready_manual",
      fundingProviderSource: "manual",
      manualSettlementState: "awaiting_funds",
      fundingDetailsSnapshot: {
        address: route.route.sharedDepositAddress,
        memo: route.route.sharedDepositMemo ?? "",
        assetCode: route.assetCode,
        networkId: route.route.id,
      },
      clientRequestId: randomUUID(),
    })));

    for (const orderId of orderIds) {
      await Promise.all([
        registerManualBlockchainWatch(orderId),
        registerManualBlockchainWatch(orderId),
        registerManualBlockchainWatch(orderId),
      ]);
    }

    const watches = await db.select().from(blockchainMonitorWatchesTable)
      .where(inArray(blockchainMonitorWatchesTable.orderId, orderIds));
    assert.equal(watches.length, routeIds.length);
    assert.equal(new Set(watches.map((watch) => watch.orderId)).size, routeIds.length);
    for (const routeId of routeIds) {
      const watch = watches.find((candidate) => candidate.assetNetworkId === routeId);
      assert.ok(watch, routeId);
      assert.equal(watch.registrationState, "active");
      assert.equal(watch.active, true);
    }
  } finally {
    await db.delete(blockchainMonitorWatchesTable)
      .where(inArray(blockchainMonitorWatchesTable.orderId, orderIds));
    await db.delete(blockchainMonitorRegistrationGapsTable)
      .where(inArray(blockchainMonitorRegistrationGapsTable.orderId, orderIds));
    await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  }
});