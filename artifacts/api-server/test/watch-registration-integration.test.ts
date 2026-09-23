import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  blockchainMonitorRegistrationGapsTable,
  blockchainMonitorAssetsTable,
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
const validTronMainnetAddress = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const invalidTronAddress = "T111111111111111111111111111111111";

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
      ...(route.route.id === "usdt-trc20"
        ? {
            depositAddress: validTronMainnetAddress,
            fundingDetailsSnapshot: {
              address: validTronMainnetAddress,
              memo: route.route.sharedDepositMemo ?? "",
              assetCode: route.assetCode,
              networkId: route.route.id,
            },
          }
        : {
            depositAddress: route.route.sharedDepositAddress,
            fundingDetailsSnapshot: {
              address: route.route.sharedDepositAddress,
              memo: route.route.sharedDepositMemo ?? "",
              assetCode: route.assetCode,
              networkId: route.route.id,
            },
          }),
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
      depositMemo: route.route.sharedDepositMemo ?? "",
      provider: "Manual desk",
      sourceSettlementOptionId: `crypto:${route.route.id}`,
      fundingStatus: "ready_manual",
      fundingProviderSource: "manual",
      manualSettlementState: "awaiting_funds",
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

test("invalid TRON receiving addresses create one actionable gap and no watch", async () => {
  const [route] = await db.select({
    route: cryptoAssetNetworksTable,
    assetCode: cryptoAssetsTable.code,
  }).from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(eq(cryptoAssetNetworksTable.id, "usdt-trc20"))
    .limit(1);
  assert.ok(route);
  const [monitorAsset] = await db.select().from(blockchainMonitorAssetsTable)
    .where(eq(blockchainMonitorAssetsTable.assetNetworkId, route.route.id))
    .limit(1);
  assert.ok(monitorAsset);

  const orderId = `watch-invalid-tron-${randomUUID()}`;
  try {
    await db.insert(ordersTable).values({
      id: orderId,
      type: "manual",
      status: "awaiting funds",
      fromAsset: route.assetCode,
      fromNetwork: route.route.networkCode,
      toAsset: "EUR",
      toNetwork: "SEPA",
      amount: "1",
      receiveAmount: "1",
      customerEmail: `${orderId}@example.test`,
      depositAddress: invalidTronAddress,
      depositMemo: "",
      provider: "Manual desk",
      sourceSettlementOptionId: `crypto:${route.route.id}`,
      fundingStatus: "ready_manual",
      fundingProviderSource: "manual",
      manualSettlementState: "awaiting_funds",
      fundingDetailsSnapshot: {
        address: invalidTronAddress,
        memo: "",
        assetCode: route.assetCode,
        networkId: route.route.id,
      },
      clientRequestId: randomUUID(),
    });

    await Promise.all([
      registerManualBlockchainWatch(orderId),
      registerManualBlockchainWatch(orderId),
      registerManualBlockchainWatch(orderId),
    ]);

    const watches = await db.select().from(blockchainMonitorWatchesTable)
      .where(eq(blockchainMonitorWatchesTable.orderId, orderId));
    const gaps = await db.select().from(blockchainMonitorRegistrationGapsTable)
      .where(eq(blockchainMonitorRegistrationGapsTable.orderId, orderId));
    assert.equal(watches.length, 0);
    assert.equal(gaps.length, 1);
    assert.equal(
      gaps[0]?.reason,
      [
        "INVALID_RECEIVING_ADDRESS",
        `routeId=${route.route.id}`,
        `monitorNetworkId=${monitorAsset.monitorNetworkId}`,
        `monitorAssetId=${monitorAsset.id}`,
      ].join(" "),
    );
  } finally {
    await db.delete(blockchainMonitorWatchesTable)
      .where(eq(blockchainMonitorWatchesTable.orderId, orderId));
    await db.delete(blockchainMonitorRegistrationGapsTable)
      .where(eq(blockchainMonitorRegistrationGapsTable.orderId, orderId));
    await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
  }
});
