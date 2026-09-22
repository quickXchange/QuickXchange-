import assert from "node:assert/strict";
import test from "node:test";
import { boundedWatchScanEnd, canApplyConfirmedMatchWatch, canResolveRegistrationGap, cursorAfterCapturedHead, deriveBlockchainMonitoringSetupStatus, evidenceWithinWatchCursor, exactAmountMatches, exactWatchMatchesOrderSnapshot, evidenceMeetsWatchTimeAndMemo, immutableIdentityMatches, isFinalitySatisfied, selectReadyBlockchainMonitoringSetupRoutes, selectWatchScanCursor } from "../src/lib/blockchain-monitoring/service";
import { canEnqueueSwapPaymentReceived } from "../src/lib/telegram-swap-notifications";

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

test("native watch ranges make bounded progress while token ranges retain bulk log scans", () => {
  assert.equal(boundedWatchScanEnd("100", "10000", "native"), "107");
  assert.equal(boundedWatchScanEnd("100", "105", "native"), "105");
  assert.equal(boundedWatchScanEnd("100", "10000", "token"), "1100");
  assert.equal(boundedWatchScanEnd("100", "10000", "token", 9), "109");
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
    { assetNetworkId: "missing", status: "missing_rpc" as const, monitorNetworkId: "network-c", monitorAssetId: "asset-c" },
  ];
  const selected = selectReadyBlockchainMonitoringSetupRoutes(routes, ["ready-a", "missing", "unknown"]);
  assert.deepEqual(selected.ready.map(route => route.assetNetworkId), ["ready-a"]);
  assert.equal(selected.skippedRoutes, 2);
  const all = selectReadyBlockchainMonitoringSetupRoutes(routes);
  assert.deepEqual(all.ready.map(route => route.assetNetworkId), ["ready-a", "ready-b"]);
  assert.equal(all.skippedRoutes, 1);
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