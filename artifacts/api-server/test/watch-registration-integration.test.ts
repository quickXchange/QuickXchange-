import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  blockchainMonitorRegistrationGapsTable,
  blockchainMonitorAssetsTable,
  blockchainMonitorNetworksTable,
  blockchainMonitorWatchesTable,
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
  ordersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { registerManualBlockchainWatch } from "../src/lib/blockchain-monitoring/service";
import {
  manualMonitoringNetworkConfigDigest,
  manualMonitoringProofFingerprint,
} from "../src/lib/manual-monitoring-readiness";

const validTronMainnetAddress = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const invalidTronAddress = "T111111111111111111111111111111111";
const evmAddress = "0x1111111111111111111111111111111111111111";
const evmContract = "0x2222222222222222222222222222222222222222";
const scenarios = [
  { key: "bitcoin", adapterKind: "bitcoin", symbol: "BTC", decimals: 8, address: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT", contract: null },
  { key: "bep20", adapterKind: "evm", symbol: "USDT", decimals: 18, address: evmAddress, contract: evmContract },
  { key: "erc20", adapterKind: "evm", symbol: "USDC", decimals: 6, address: evmAddress, contract: evmContract },
  { key: "trc20", adapterKind: "tron", symbol: "USDT", decimals: 6, address: validTronMainnetAddress, contract: validTronMainnetAddress },
  { key: "polygon", adapterKind: "evm", symbol: "USDC", decimals: 6, address: evmAddress, contract: evmContract },
] as const;

type Scenario = typeof scenarios[number];
type FixtureRoute = {
  route: typeof cryptoAssetNetworksTable.$inferSelect;
  assetCode: string;
  monitorAsset: typeof blockchainMonitorAssetsTable.$inferSelect;
  monitorNetwork: typeof blockchainMonitorNetworksTable.$inferSelect;
  orderId: string;
};

async function withRegistrationFixtures(
  selected: readonly Scenario[],
  check: (fixtures: FixtureRoute[]) => Promise<void>,
) {
  const suffix = randomUUID().replaceAll("-", "");
  const endpoint = "http://127.0.0.1:1/test-only-monitor";
  const rows = selected.map((scenario) => ({
    scenario,
    assetId: `watch-fixture-asset-${scenario.key}-${suffix}`,
    assetCode: `WATCH${scenario.symbol}${scenario.key.toUpperCase()}${suffix.toUpperCase()}`,
    routeId: `watch-fixture-route-${scenario.key}-${suffix}`,
    networkId: `watch-fixture-network-${scenario.key}-${suffix}`,
    endpointRef: `WATCH_FIXTURE_RPC_${scenario.key.toUpperCase()}_${suffix.toUpperCase()}`,
    orderId: `watch-fixture-order-${scenario.key}-${suffix}`,
  }));
  const fixtures: FixtureRoute[] = [];
  try {
    for (const row of rows) process.env[row.endpointRef] = endpoint;
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const { scenario } = row;
        const networkCode = `WATCH-${scenario.key.toUpperCase()}-${suffix.toUpperCase()}`;
        await tx.insert(cryptoAssetsTable).values({
          id: row.assetId, code: row.assetCode, name: `Watch fixture ${scenario.key}`,
          decimals: scenario.decimals,
        });
        const [route] = await tx.insert(cryptoAssetNetworksTable).values({
          id: row.routeId, assetId: row.assetId, networkCode,
          networkName: `Watch fixture ${scenario.key}`, decimals: scenario.decimals,
          sharedDepositAddress: scenario.address,
          customerDepositsEnabled: true,
        }).returning();
        const capturedAt = new Date();
        const [network] = await tx.insert(blockchainMonitorNetworksTable).values({
          id: row.networkId, networkCode, networkName: `Watch fixture ${scenario.key}`,
          adapterKind: scenario.adapterKind,
          chainId: scenario.adapterKind === "tron" ? "tron-mainnet" :
            scenario.adapterKind === "bitcoin" ? "bitcoin-mainnet" : "0x1",
          providerKind: scenario.adapterKind === "tron" ? "indexer" : "rpc",
          endpointSecretRef: row.endpointRef,
          enabled: true, healthStatus: "connected", healthCheckedAt: capturedAt,
          lastHead: "100",
          // Never let a background monitor poll a test-only endpoint.
          nextAttemptAt: new Date(Date.now() + 86_400_000),
        }).returning();
        const [monitorAsset] = await tx.insert(blockchainMonitorAssetsTable).values({
          monitorNetworkId: network.id, assetNetworkId: route.id,
          identityKind: scenario.contract ? "token" : "native",
          contractOrMint: scenario.contract, decimals: scenario.decimals, enabled: true,
        }).returning();
        await tx.update(blockchainMonitorNetworksTable).set({
          healthProofFingerprint: manualMonitoringNetworkConfigDigest({ network, endpoint }),
          healthProofCapturedAt: capturedAt,
        }).where(eq(blockchainMonitorNetworksTable.id, network.id));
        await tx.update(blockchainMonitorAssetsTable).set({
          readinessProofFingerprint: manualMonitoringProofFingerprint({
            network, asset: monitorAsset, route, endpoint, capturedAt, head: network.lastHead!,
          }),
          readinessProofCapturedAt: capturedAt,
        }).where(eq(blockchainMonitorAssetsTable.id, monitorAsset.id));
        fixtures.push({
          route, assetCode: row.assetCode, monitorAsset, monitorNetwork: network,
          orderId: row.orderId,
        });
      }
    });
    await check(fixtures);
  } finally {
    const orderIds = rows.map((row) => row.orderId);
    await db.delete(blockchainMonitorWatchesTable)
      .where(inArray(blockchainMonitorWatchesTable.orderId, orderIds));
    await db.delete(blockchainMonitorRegistrationGapsTable)
      .where(inArray(blockchainMonitorRegistrationGapsTable.orderId, orderIds));
    await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
    await db.delete(blockchainMonitorAssetsTable)
      .where(inArray(blockchainMonitorAssetsTable.monitorNetworkId, rows.map((row) => row.networkId)));
    await db.delete(blockchainMonitorNetworksTable)
      .where(inArray(blockchainMonitorNetworksTable.id, rows.map((row) => row.networkId)));
    await db.delete(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, rows.map((row) => row.routeId)));
    await db.delete(cryptoAssetsTable)
      .where(inArray(cryptoAssetsTable.id, rows.map((row) => row.assetId)));
    for (const row of rows) delete process.env[row.endpointRef];
  }
}

test("eligible signed routes create exactly one automatic watch per order", async () => {
  await withRegistrationFixtures(scenarios, async (fixtures) => {
    assert.equal(fixtures.length, scenarios.length);
    const orderIds = fixtures.map((fixture) => fixture.orderId);
    await db.insert(ordersTable).values(fixtures.map((fixture, index) => ({
      id: fixture.orderId,
      type: "manual",
      status: "awaiting funds",
      fromAsset: fixture.assetCode,
      fromNetwork: fixture.route.networkCode,
      toAsset: "EUR",
      toNetwork: "SEPA",
      amount: "1",
      receiveAmount: "1",
      customerEmail: `watch-regression-${index}-${fixture.orderId}@example.test`,
      depositAddress: fixture.route.sharedDepositAddress,
      depositMemo: fixture.route.sharedDepositMemo ?? "",
      fundingDetailsSnapshot: {
        address: fixture.route.sharedDepositAddress,
        memo: fixture.route.sharedDepositMemo ?? "",
        assetCode: fixture.assetCode,
        networkId: fixture.route.id,
      },
      provider: "Manual desk",
      sourceSettlementOptionId: `crypto:${fixture.route.id}`,
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
    assert.equal(watches.length, scenarios.length);
    assert.equal(new Set(watches.map((watch) => watch.orderId)).size, scenarios.length);
    for (const fixture of fixtures) {
      const watch = watches.find((candidate) => candidate.assetNetworkId === fixture.route.id);
      assert.ok(watch, fixture.route.id);
      assert.equal(watch.monitorNetworkId, fixture.monitorNetwork.id);
      assert.equal(watch.monitorAssetId, fixture.monitorAsset.id);
      assert.equal(watch.registrationState, "active");
      assert.equal(watch.active, true);
    }
  });
});

test("invalid TRON receiving addresses create one actionable gap and no watch", async () => {
  await withRegistrationFixtures([scenarios[3]], async (fixtures) => {
    const [fixture] = fixtures;
    assert.ok(fixture);
    const { route, monitorAsset, orderId } = fixture;
    await db.insert(ordersTable).values({
      id: orderId,
      type: "manual",
      status: "awaiting funds",
      fromAsset: fixture.assetCode,
      fromNetwork: route.networkCode,
      toAsset: "EUR",
      toNetwork: "SEPA",
      amount: "1",
      receiveAmount: "1",
      customerEmail: `${orderId}@example.test`,
      depositAddress: invalidTronAddress,
      depositMemo: "",
      provider: "Manual desk",
      sourceSettlementOptionId: `crypto:${route.id}`,
      fundingStatus: "ready_manual",
      fundingProviderSource: "manual",
      manualSettlementState: "awaiting_funds",
      fundingDetailsSnapshot: {
        address: invalidTronAddress,
        memo: "",
        assetCode: fixture.assetCode,
        networkId: route.id,
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
        `routeId=${route.id}`,
        `monitorNetworkId=${fixture.monitorNetwork.id}`,
        `monitorAssetId=${monitorAsset.id}`,
      ].join(" "),
    );
  });
});
