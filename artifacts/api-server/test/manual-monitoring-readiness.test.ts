import assert from "node:assert/strict";
import test from "node:test";
import {
  isLegacyBep20Network,
  isValidManualMonitoringTokenIdentity,
  manualMonitoringProofFingerprint,
  usesLegacyBep20Readiness,
} from "../src/lib/manual-monitoring-readiness";
import {
  isManualCryptoCustomerSendReady,
  isManualMonitoringRuntimeReady,
} from "../src/lib/manual-crypto";
import { isSyntacticallyValidManualWalletAddress } from "../src/lib/manual-wallet-validation";

const network = {
  id: "polygon",
  networkCode: "POLYGON",
  adapterKind: "evm",
  providerKind: "rpc",
  chainId: "137",
  endpointSecretRef: "POLYGON_RPC",
  apiKeySecretRef: "POLYGON_KEY",
  enabled: true,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
} as never;
const asset = {
  id: "asset-monitor",
  identityKind: "token",
  contractOrMint: "0x0000000000000000000000000000000000000001",
  decimals: 6,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
} as never;
const route = {
  id: "usdc-polygon",
  networkCode: "POLYGON",
  assetId: "usdc",
  decimals: 6,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
} as never;

test("BEP20 remains on the established legacy readiness path", () => {
  assert.equal(isLegacyBep20Network("BSC"), true);
  assert.equal(isLegacyBep20Network("BEP20"), true);
  assert.equal(isLegacyBep20Network("POLYGON"), false);
  assert.equal(usesLegacyBep20Readiness("BEP20", null), true);
  assert.equal(usesLegacyBep20Readiness("BEP20", "0x38"), false);
});

test("manual readiness proof fingerprints include route identity and secret material hashes", () => {
  const base = manualMonitoringProofFingerprint({
    network,
    asset,
    route,
    endpoint: "https://rpc.example.invalid",
    apiKey: "secret-a",
    capturedAt: new Date("2026-01-01T00:00:01Z"),
    head: "123",
  });
  const changedIdentity = manualMonitoringProofFingerprint({
    network,
    asset: { ...asset, contractOrMint: "0x0000000000000000000000000000000000000002" },
    route,
    endpoint: "https://rpc.example.invalid",
    apiKey: "secret-a",
    capturedAt: new Date("2026-01-01T00:00:01Z"),
    head: "123",
  });
  const changedSecret = manualMonitoringProofFingerprint({
    network,
    asset,
    route,
    endpoint: "https://rpc.example.invalid",
    apiKey: "secret-b",
    capturedAt: new Date("2026-01-01T00:00:01Z"),
    head: "123",
  });
  const changedRoute = manualMonitoringProofFingerprint({
    network,
    asset,
    route: { ...route, decimals: 18 },
    endpoint: "https://rpc.example.invalid",
    apiKey: "secret-a",
    capturedAt: new Date("2026-01-01T00:00:01Z"),
    head: "123",
  });
  const changedHead = manualMonitoringProofFingerprint({
    network,
    asset,
    route,
    endpoint: "https://rpc.example.invalid",
    apiKey: "secret-a",
    capturedAt: new Date("2026-01-01T00:00:01Z"),
    head: "124",
  });
  assert.notEqual(base, changedIdentity);
  assert.notEqual(base, changedSecret);
  assert.notEqual(base, changedRoute);
  assert.equal(base, changedHead);
  assert.equal(base, manualMonitoringProofFingerprint({
    network,
    asset,
    route,
    endpoint: "https://rpc.example.invalid",
    apiKey: "secret-a",
    capturedAt: new Date("2026-01-01T00:00:02Z"),
    head: "999",
  }));
  assert.equal(base.includes("secret-a"), false);
});

function runtimeInput(overrides: Record<string, unknown> = {}) {
  return {
    routeId: "usdc-polygon",
    routeNetworkCode: "POLYGON",
    monitorAssetRouteId: "usdc-polygon",
    monitorNetworkCode: "POLYGON",
    monitorChainId: "137",
    assetEnabled: true,
    networkEnabled: true,
    providerKind: "rpc",
    endpointConfigured: true,
    healthStatus: "connected",
    healthCheckedAtMs: Date.now() - 1_000,
    healthProofCapturedAtMs: Date.now() - 1_000,
    pollIntervalSeconds: 15,
    adapterKind: "evm",
    identityKind: "token",
    contractOrMint: "0x0000000000000000000000000000000000000001",
    providerCompatible: true,
    receivingAddressValid: true,
    memoValid: true,
    readinessProofFingerprint: "proof-polygon-usdc",
    routeDigest: "proof-polygon-usdc",
    networkDigest: "network-polygon",
    networkHealthProofFingerprint: "network-polygon",
    ...overrides,
  };
}

test("non-BSC routes require a fresh proof and exact provider compatibility before customer deposits", () => {
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput()), true);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({ readinessProofFingerprint: null })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({
    healthCheckedAtMs: Date.now() - 180_000,
  })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({ providerCompatible: false })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({
    routeId: "btc-bitcoin",
    routeNetworkCode: "BTC",
    monitorAssetRouteId: "btc-bitcoin",
    monitorNetworkCode: "BTC",
    adapterKind: "bitcoin",
    providerKind: "rpc",
    identityKind: "native",
    contractOrMint: null,
  })), true);
});

test("native and token identities are not interchangeable and malformed identities stay unavailable", () => {
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({
    identityKind: "native",
    contractOrMint: null,
  })), true);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({
    identityKind: "native",
    contractOrMint: "0x0000000000000000000000000000000000000001",
  })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({
    identityKind: "token",
    contractOrMint: "not-a-contract",
  })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({
    routeId: "usdc-polygon",
    monitorAssetRouteId: "usdt-polygon",
  })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({
    routeNetworkCode: "POLYGON",
    monitorNetworkCode: "ARBITRUM",
  })), false);
});

test("BEP20 keeps the established native BNB path but token routes require proof", () => {
  const bsc = runtimeInput({
    routeId: "bnb-bep20",
    routeNetworkCode: "BEP20",
    monitorAssetRouteId: "bnb-bep20",
    monitorNetworkCode: "BEP20",
    monitorChainId: null,
    identityKind: "native",
    contractOrMint: null,
    readinessProofFingerprint: null,
  });
  assert.equal(isManualMonitoringRuntimeReady(bsc), true);
  assert.equal(isManualMonitoringRuntimeReady({
    ...bsc,
    monitorChainId: "0x38",
  }), false);
  assert.equal(isManualMonitoringRuntimeReady({
    ...bsc,
    monitorChainId: "0x38",
    readinessProofFingerprint: "proof-bnb",
    healthProofCapturedAtMs: Date.now() - 1_000,
    networkHealthProofFingerprint: "network-bnb",
    networkDigest: "network-bnb",
    routeDigest: "proof-bnb",
  }), true);
  assert.equal(isManualMonitoringRuntimeReady({
    ...bsc,
    identityKind: "token",
    contractOrMint: "0x0000000000000000000000000000000000000001",
  }), false);
});

test("address, memo, asset, and network changes fail closed", () => {
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({ receivingAddressValid: false })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({ memoValid: false })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({ assetEnabled: false })), false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({ networkEnabled: false })), false);
});

test("TRON receiving-address readiness requires a valid Base58Check checksum", () => {
  const tronRoute = {
    id: "usdt-trc20",
    networkCode: "TRC20",
    networkName: "TRON",
    networkFamily: "TRON",
  };
  const valid = isSyntacticallyValidManualWalletAddress(
    tronRoute,
    "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
  );
  const invalid = isSyntacticallyValidManualWalletAddress(
    tronRoute,
    "T111111111111111111111111111111111",
  );
  assert.equal(valid, true);
  assert.equal(invalid, false);
  assert.equal(isManualMonitoringRuntimeReady(runtimeInput({
    routeId: "usdt-trc20",
    routeNetworkCode: "TRC20",
    monitorAssetRouteId: "usdt-trc20",
    monitorNetworkCode: "TRC20",
    monitorChainId: "0x2b6653dc",
    adapterKind: "tron",
    providerKind: "indexer",
    contractOrMint: "41a614f803b6fd780986a42c78ec9c7f77e6ded13c",
    receivingAddressValid: invalid,
  })), false);
});

test("an invalid configured TRON address blocks only its exact customer-send route", () => {
  const shared = {
    networkCode: "TRC20",
    networkName: "TRON",
    networkFamily: "TRON",
    enabled: true,
    depositProvider: "whitebit",
    customerDepositsEnabled: true,
  } as const;
  const readyRoutes = new Map([
    ["usdt-trc20", "TRC20"],
    ["other-trc20", "TRC20"],
  ]);

  assert.equal(isManualCryptoCustomerSendReady({
    ...shared,
    id: "usdt-trc20",
    sharedDepositAddress: "T111111111111111111111111111111111",
  }, readyRoutes), false);
  assert.equal(isManualCryptoCustomerSendReady({
    ...shared,
    id: "other-trc20",
    sharedDepositAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
  }, readyRoutes), true);
});

test("TRON token identity requires a checksum-valid normalized address", () => {
  assert.equal(
    isValidManualMonitoringTokenIdentity(
      "tron",
      "41a614f803b6fd780986a42c78ec9c7f77e6ded13c",
    ),
    true,
  );
  assert.equal(
    isValidManualMonitoringTokenIdentity(
      "tron",
      "TR7NHqjeKQxHTCi8q8ZY4pL8otSzgjLj6O",
    ),
    false,
  );
  assert.equal(
    isValidManualMonitoringTokenIdentity(
      "tron",
      "41a614f803b6fd780986a42c78ec9c7f77e6ded1",
    ),
    false,
  );
  assert.equal(
    isValidManualMonitoringTokenIdentity(
      "tron",
      "T111111111111111111111111111111111",
    ),
    false,
  );
});

test("receiving-address changes produce a distinct route proof", () => {
  const first = manualMonitoringProofFingerprint({
    network,
    asset,
    route: { ...route, sharedDepositAddress: "0x0000000000000000000000000000000000000001" },
    endpoint: "https://rpc.example.invalid",
    apiKey: "secret-a",
    capturedAt: new Date(),
    head: "1",
  });
  const changed = manualMonitoringProofFingerprint({
    network,
    asset,
    route: { ...route, sharedDepositAddress: "0x0000000000000000000000000000000000000002" },
    endpoint: "https://rpc.example.invalid",
    apiKey: "secret-a",
    capturedAt: new Date(),
    head: "1",
  });
  assert.notEqual(first, changed);
});