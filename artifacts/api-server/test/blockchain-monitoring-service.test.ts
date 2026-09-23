import assert from "node:assert/strict";
import test from "node:test";
import { boundedBitcoinWatchScanRange, boundedWatchScanEnd, canApplyConfirmedMatchWatch, canResolveRegistrationGap, classifyWatchRegistrationIdentity, cursorAfterCapturedHead, deriveBlockchainMonitoringSetupStatus, evidenceWithinWatchCursor, exactAmountMatches, exactWatchMatchesOrderSnapshot, evidenceMeetsWatchTimeAndMemo, immutableIdentityMatches, isFinalitySatisfied, isTerminalBlockchainWatchOrder, MAX_CATCH_UP_RANGES_PER_WATCH_CYCLE, maxWatchCatchUpRanges, planBoundedWatchCatchUpRanges, processBoundedWatchCatchUpRanges, selectReadyBlockchainMonitoringSetupRoutes, selectWatchScanCursor, shouldRefreshStrictManualReadinessProof } from "../src/lib/blockchain-monitoring/service";
import { canEnqueueSwapPaymentReceived } from "../src/lib/telegram-swap-notifications";
import { signedCryptoRouteId } from "../src/lib/manual-crypto";
import { classifyDatabasePoolError, databasePoolTelemetry, pool } from "@workspace/db";

test("Database pool telemetry classifies connection failures without sensitive configuration", () => {
  const physicalTimeout = new Error("query failed", {
    cause: new Error("Connection terminated due to connection timeout"),
  });
  assert.equal(
    classifyDatabasePoolError(physicalTimeout),
    "physical_connection_establishment_timeout",
  );
  assert.equal(
    classifyDatabasePoolError(new Error("timeout exceeded when trying to connect")),
    "pool_acquisition_timeout",
  );
  assert.equal(
    classifyDatabasePoolError(new Error("duplicate key value violates unique constraint")),
    "database_query_failure",
  );

  const telemetry = databasePoolTelemetry(
    "test-worker",
    physicalTimeout,
  );
  assert.equal(telemetry.processId, process.pid);
  assert.equal(telemetry.component, "test-worker");
  assert.equal(telemetry.errorCategory, "physical_connection_establishment_timeout");
  assert.equal(Number.isInteger(telemetry.totalCount), true);
  assert.equal(Number.isInteger(telemetry.idleCount), true);
  assert.equal(Number.isInteger(telemetry.waitingCount), true);
  assert.equal("connectionString" in telemetry, false);
});

test("Database pool keeps one warm keepalive client without changing its connection cap or timeout", () => {
  assert.equal(pool.options.max, 10);
  assert.equal(pool.options.min, 1);
  assert.equal(pool.options.idleTimeoutMillis, 300_000);
  assert.equal(pool.options.connectionTimeoutMillis, 5_000);
  assert.equal(pool.options.keepAlive, true);
  assert.equal(pool.options.allowExitOnIdle, true);
});

test("Manual monitoring matches decimal order amounts only at configured precision", () => {
    assert.equal(exactAmountMatches("1.25", 6, "1250000"), true);
    assert.equal(exactAmountMatches("1.25", 6, "1250001"), false);
    assert.equal(exactAmountMatches("1.2500001", 6, "1250000"), false);
  });

test("Manual monitoring rejects malformed, negative, and zero observations", () => {
    assert.equal(exactAmountMatches("1", 6, "0"), false);
    assert.equal(exactAmountMatches("1", 6, "-1000000"), false);
    assert.equal(exactAmountMatches("1.2.3", 6, "1200000"), false);
  });

test("Manual monitoring enforces chain timestamp boundary and actual memo", () => {
  const created = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(evidenceMeetsWatchTimeAndMemo(created, "2025-12-31T23:59:59.000Z", null, undefined), false);
  assert.equal(evidenceMeetsWatchTimeAndMemo(created, "2026-01-01T00:00:00.000Z", "123", undefined), false);
  assert.equal(evidenceMeetsWatchTimeAndMemo(created, "2026-01-01T00:00:00.000Z", "123", "123"), true);
});

test("Manual monitoring applies configured finality and immutable identity", () => {
  assert.equal(isFinalitySatisfied("confirmations", 2, 2, false), true);
  assert.equal(isFinalitySatisfied("finalized", 99, 2, false), false);
  assert.equal(isFinalitySatisfied("finalized", 0, 2, true), true);
  const watch = { identityKind: "token", contractOrMint: "0xAbC", decimals: 6 };
  assert.equal(immutableIdentityMatches(watch, { identityKind: "token", contractOrMint: "0xabc", decimals: 6 }), true);
  assert.equal(immutableIdentityMatches(watch, { identityKind: "native", contractOrMint: null, decimals: 6 }), false);
  assert.equal(selectWatchScanCursor(null, "12"), "12");
  assert.equal(selectWatchScanCursor("18", "12"), "18");
  assert.equal(cursorAfterCapturedHead("18"), "19");
  assert.equal(cursorAfterCapturedHead("opaque-cursor"), undefined);
  assert.equal(evidenceWithinWatchCursor("19", "18"), false);
  assert.equal(evidenceWithinWatchCursor("19", "19"), true);
  assert.equal(evidenceWithinWatchCursor(null, "19"), false);
  assert.equal(canResolveRegistrationGap("pending_review", false), false);
  assert.equal(canResolveRegistrationGap("active", true), true);
  const snapshot = { orderId: "o", monitorNetworkId: "n", monitorAssetId: "a", assetNetworkId: "r", expectedAmount: "1", receivingAddress: "x", memoOrTag: null, identityKind: "native", contractOrMint: null, decimals: 18, orderCreatedAt: new Date(0) };
  assert.equal(exactWatchMatchesOrderSnapshot(snapshot, snapshot), true);
});

test("eligible signed blockchain routes resolve once without display-label fallbacks", () => {
  const routes = [
    { id: "btc-bitcoin", displayNetwork: "Bitcoin" },
    { id: "usdt-bep20", displayNetwork: "BNB Smart Chain" },
    { id: "usdc-erc20", displayNetwork: "Ethereum" },
    { id: "usdt-trc20", displayNetwork: "Tron" },
    { id: "usdc-polygon", displayNetwork: "Polygon" },
  ];
  const watchOrderIds = new Set<string>();
  for (const [index, route] of routes.entries()) {
    assert.equal(
      signedCryptoRouteId({
        id: `crypto:${route.id}`,
        networkId: route.id,
      }),
      route.id,
    );
    assert.equal(classifyWatchRegistrationIdentity({
      routeFound: true,
      routeAssetMatches: true,
      exactAssetIdentity: true,
      networkFound: true,
      networkEnabled: true,
      assetFound: true,
      assetEnabled: true,
      networkProofPresent: true,
      assetProofPresent: true,
    }), null, route.displayNetwork);
    const orderId = `eligible-route-${index}`;
    watchOrderIds.add(orderId);
    watchOrderIds.add(orderId);
  }
  assert.equal(watchOrderIds.size, routes.length);
});

test("watch registration diagnostics distinguish every blocked identity gate", () => {
  const ready = {
    routeFound: true,
    routeAssetMatches: true,
    exactAssetIdentity: true,
    networkFound: true,
    networkEnabled: true,
    assetFound: true,
    assetEnabled: true,
    networkProofPresent: true,
    assetProofPresent: true,
  };
  assert.equal(classifyWatchRegistrationIdentity({ ...ready, routeFound: false }), "ROUTE_IDENTITY_MISMATCH");
  assert.equal(classifyWatchRegistrationIdentity({ ...ready, networkFound: false }), "NETWORK_MONITOR_MISSING");
  assert.equal(classifyWatchRegistrationIdentity({ ...ready, networkEnabled: false }), "NETWORK_MONITOR_DISABLED");
  assert.equal(classifyWatchRegistrationIdentity({ ...ready, assetFound: false }), "ASSET_MONITOR_MISSING");
  assert.equal(classifyWatchRegistrationIdentity({ ...ready, assetEnabled: false }), "ASSET_MONITOR_DISABLED");
  assert.equal(classifyWatchRegistrationIdentity({ ...ready, assetProofPresent: false }), "READINESS_PROOF_MISSING");
});

test("strict scheduler proof refresh accepts only canonical Polygon", () => {
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "evm",
    networkCode: "POLYGON",
    chainId: "0x89",
  }), true);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "evm",
    networkCode: "POLYGON_LEGACY",
    chainId: "0x89",
  }), false);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "evm",
    networkCode: "POLYGON",
    chainId: "0x1",
  }), false);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "evm",
    networkCode: "POLYGON",
    chainId: null,
  }), false);
});

test("strict scheduler proof refresh accepts only canonical Ethereum", () => {
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "evm",
    networkCode: "ERC20",
    chainId: "0x1",
  }), true);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "evm",
    networkCode: "ERC20",
    chainId: "0x89",
  }), false);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "evm",
    networkCode: "ETHEREUM_LEGACY",
    chainId: "0x1",
  }), false);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "tron",
    networkCode: "ERC20",
    chainId: "0x1",
  }), false);
});

test("strict scheduler proof refresh accepts only canonical TRON Mainnet", () => {
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "tron",
    networkCode: "TRC20",
    chainId: "0x2b6653dc",
  }), true);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "tron",
    networkCode: "TRC20",
    chainId: null,
  }), false);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "tron",
    networkCode: "TRC20",
    chainId: "0x1",
  }), false);
  assert.equal(shouldRefreshStrictManualReadinessProof({
    adapterKind: "evm",
    networkCode: "TRC20",
    chainId: "0x2b6653dc",
  }), false);
});

test("native watch ranges make bounded progress while token ranges retain bulk log scans", () => {
  assert.equal(boundedWatchScanEnd("100", "10000", "native"), "107");
  assert.equal(boundedWatchScanEnd("100", "105", "native"), "105");
  assert.equal(boundedWatchScanEnd("100", "10000", "token"), "1100");
  assert.equal(boundedWatchScanEnd("100", "10000", "token", 9), "109");
  assert.deepEqual(
    boundedBitcoinWatchScanRange("100", "50", "120", 8, 6),
    { from: "94", to: "102" },
  );
  assert.deepEqual(
    boundedBitcoinWatchScanRange("100", "98", "100", 8, 6),
    { from: "98", to: "100" },
  );
});

test("BEP20 catch-up uses multiple bounded ranges and catches an advancing live head", () => {
  let cursor = 1_000;
  let head = 1_300;
  for (let cycle = 0; cycle < 4; cycle += 1) {
    const ranges = planBoundedWatchCatchUpRanges(
      String(cursor),
      String(head),
      "token",
      9,
    );
    assert.ok(ranges.length <= MAX_CATCH_UP_RANGES_PER_WATCH_CYCLE);
    assert.ok(ranges.every((range) => Number(range.to) - Number(range.from) <= 9));
    assert.ok(ranges.every((range, index) =>
      index === 0 || range.from === ranges[index - 1]?.to
    ));
    cursor = Number(ranges.at(-1)?.to ?? cursor);
    head += 30;
  }
  assert.ok(head - cursor <= 30, `expected catch-up cursor ${cursor} near live head ${head}`);
});

test("BEP20 catch-up caps work per cycle and terminal orders stop scanning", () => {
  const ranges = planBoundedWatchCatchUpRanges("100", "10000", "token", 9);
  assert.equal(ranges.length, MAX_CATCH_UP_RANGES_PER_WATCH_CYCLE);
  assert.equal(ranges.at(-1)?.to, "244");
  assert.equal(isTerminalBlockchainWatchOrder("completed", "funds_confirmed"), true);
  assert.equal(isTerminalBlockchainWatchOrder("cancelled", "cancelled"), true);
  assert.equal(isTerminalBlockchainWatchOrder("expired", "awaiting_funds"), true);
  assert.equal(isTerminalBlockchainWatchOrder("failed", "failed"), true);
  assert.equal(isTerminalBlockchainWatchOrder("refunded", "refunded"), true);
  assert.equal(isTerminalBlockchainWatchOrder("processing", "funds_confirmed"), false);
  assert.equal(isTerminalBlockchainWatchOrder("awaiting funds", "awaiting_funds"), false);
});

test("multi-range catch-up is isolated to BEP20 token watches", () => {
  assert.equal(maxWatchCatchUpRanges("BEP20", "token"), MAX_CATCH_UP_RANGES_PER_WATCH_CYCLE);
  assert.equal(maxWatchCatchUpRanges("BEP20", "native"), 1);
  assert.equal(maxWatchCatchUpRanges("BSC", "token"), 1);
  assert.equal(maxWatchCatchUpRanges("BSC_BEP20", "token"), 1);
  assert.equal(maxWatchCatchUpRanges("ERC20", "token"), 1);
  assert.equal(maxWatchCatchUpRanges("POLYGON", "token"), 1);
  assert.equal(maxWatchCatchUpRanges("TRC20", "token"), 1);
});

test("BEP20 catch-up never advances a failed range and preserves prior progress", async () => {
  const ranges = planBoundedWatchCatchUpRanges("100", "200", "token", 9, 4);
  const committed: Array<{ expected: string | null; next: string }> = [];
  await assert.rejects(
    processBoundedWatchCatchUpRanges({
      ranges,
      initialCursor: "100",
      processRange: async (range) => {
        if (range.from === "109") throw new Error("simulated RPC failure");
        return range.to;
      },
      advanceCursor: async (expected, next) => {
        committed.push({ expected, next });
        return true;
      },
    }),
    /simulated RPC failure/,
  );
  assert.deepEqual(committed, [{ expected: "100", next: "109" }]);
});

test("bulk monitoring setup keeps disabled routes disabled and never infers token identity", () => {
  assert.equal(deriveBlockchainMonitoringSetupStatus({
    catalogEnabled: false,
    catalogActive: true,
    networkConfigured: false,
  }), "disabled");
  assert.equal(deriveBlockchainMonitoringSetupStatus({
    catalogEnabled: true,
    catalogActive: true,
    networkConfigured: false,
    identityKind: "native",
  }), "missing_rpc");
  assert.equal(deriveBlockchainMonitoringSetupStatus({
    catalogEnabled: true,
    catalogActive: true,
    networkConfigured: true,
  }), "missing_contract_or_mint");
  assert.equal(deriveBlockchainMonitoringSetupStatus({
    catalogEnabled: true,
    catalogActive: true,
    networkConfigured: true,
    identityKind: "token",
    contractOrMint: null,
  }), "missing_contract_or_mint");
  assert.equal(deriveBlockchainMonitoringSetupStatus({
    catalogEnabled: true,
    catalogActive: true,
    networkConfigured: true,
    identityKind: "native",
    contractOrMint: null,
  }), "ready");
  assert.equal(deriveBlockchainMonitoringSetupStatus({
    catalogEnabled: true,
    catalogActive: true,
    networkConfigured: true,
    identityKind: "token",
    contractOrMint: "mint-or-contract",
  }), "ready");
});

test("selected monitoring setup enables only requested ready routes", () => {
  const routes = [
    { assetNetworkId: "ready-a", status: "ready" as const, monitorNetworkId: "network-a", monitorAssetId: "asset-a" },
    { assetNetworkId: "ready-b", status: "ready" as const, monitorNetworkId: "network-b", monitorAssetId: "asset-b" },
    { assetNetworkId: "bitcoin-disabled", status: "ready" as const, monitorNetworkId: "network-bitcoin", monitorAssetId: "asset-bitcoin", autoEnableEligible: false },
    { assetNetworkId: "missing", status: "missing_rpc" as const, monitorNetworkId: "network-c", monitorAssetId: "asset-c" },
  ];
  const selected = selectReadyBlockchainMonitoringSetupRoutes(routes, ["ready-a", "missing", "unknown"]);
  assert.deepEqual(selected.ready.map(route => route.assetNetworkId), ["ready-a"]);
  assert.equal(selected.skippedRoutes, 2);
  const all = selectReadyBlockchainMonitoringSetupRoutes(routes);
  assert.deepEqual(all.ready.map(route => route.assetNetworkId), ["ready-a", "ready-b"]);
  assert.equal(all.skippedRoutes, 2);
});

test("Payment Received notifications require the canonical funded processing state", () => {
  assert.equal(canEnqueueSwapPaymentReceived({
    type: "manual",
    status: "processing",
    manualSettlementState: "funds_confirmed",
  }), true);
  assert.equal(canEnqueueSwapPaymentReceived({
    type: "manual",
    status: "awaiting funds",
    manualSettlementState: "awaiting_funds",
  }), false);
  assert.equal(canEnqueueSwapPaymentReceived({
    type: "manual",
    status: "processing",
    manualSettlementState: "awaiting_funds",
  }), false);
});

test("verified receipt recovery is bounded to an inactive cursorless recovery watch", () => {
  const verified = {
    active: false,
    registrationState: "active",
    registrationReason: "Verified receipt recovery; inactive to prevent unbounded rescanning.",
    startCursor: null,
    currentCursor: null,
  };
  assert.equal(canApplyConfirmedMatchWatch(verified), true);
  assert.equal(canApplyConfirmedMatchWatch({ ...verified, registrationState: "pending_review" }), false);
  assert.equal(canApplyConfirmedMatchWatch({ ...verified, startCursor: "123" }), false);
  assert.equal(canApplyConfirmedMatchWatch({ ...verified, registrationReason: "operator override" }), false);
  assert.equal(canApplyConfirmedMatchWatch({ ...verified, active: true, registrationReason: null }), true);
});