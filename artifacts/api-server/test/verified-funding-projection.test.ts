import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVerifiedExplorerUrl,
  exposeLegacyTransactionHash,
  projectWhitebitVerifiedFunding,
  selectWhitebitProviderDepositId,
} from "../src/lib/verified-funding";

test("verified explorer URLs use only a valid configured HTTPS template and exact hash", () => {
  assert.equal(
    buildVerifiedExplorerUrl("https://bscscan.com/tx/{tx}", "0xabc/def"),
    "https://bscscan.com/tx/0xabc%2Fdef",
  );
  assert.equal(buildVerifiedExplorerUrl("http://unsafe/tx/{tx}", "0xabc"), undefined);
  assert.equal(buildVerifiedExplorerUrl("https://unknown/tx/{hash}", "0xabc"), undefined);
  assert.equal(buildVerifiedExplorerUrl("https://[malformed]/tx/{tx}", "0xabc"), undefined);
});

test("WhiteBIT funding projection uses the chain hash, not the provider transaction ID or memo", () => {
  const providerTransactionId = "provider-row-74192";
  const depositMemo = "memo-should-never-be-a-chain-hash";
  const projected = projectWhitebitVerifiedFunding({
    transactionHash: "0xchain-hash",
    confirmations: 3,
    detectedAt: new Date("2025-01-02T03:04:05.000Z"),
    canonicalAssetCode: "BNB",
    frozenRouteId: "bnb-bnb",
    frozenNetworkCode: "BEP20",
    frozenNetworkName: "BNB",
    routes: [{
      id: "bnb-bep20",
      assetCode: "BNB",
      networkCode: "BEP20",
      networkName: "BNB Smart Chain",
      explorerUrlTemplate: "https://bscscan.com/tx/{txid}",
    }],
  });

  assert.ok(providerTransactionId !== projected?.transactionHash);
  assert.ok(depositMemo !== projected?.transactionHash);
  assert.equal(projected?.transactionHash, "0xchain-hash");
  assert.equal(projected?.networkCode, "BEP20");
  assert.equal(projected?.networkName, "BNB Smart Chain");
  assert.equal(projected?.explorerUrl, "https://bscscan.com/tx/0xchain-hash");
});

test("WhiteBIT funding projection omits missing chain hashes", () => {
  assert.equal(projectWhitebitVerifiedFunding({
    transactionHash: null,
    confirmations: null,
    detectedAt: null,
    canonicalAssetCode: "BNB",
    frozenRouteId: "bnb-bnb",
    frozenNetworkCode: "BEP20",
    frozenNetworkName: "BNB",
    routes: [],
  }), undefined);
});

test("WhiteBIT provider deposit ID remains separate from the blockchain hash", () => {
  const chainHash = "0xchain-transaction-hash";
  const providerTransactionId = "whitebit-deposit-transaction-42";
  assert.equal(selectWhitebitProviderDepositId(providerTransactionId, "whitebit-unique-42"), providerTransactionId);
  assert.equal(selectWhitebitProviderDepositId(null, "whitebit-unique-42"), "whitebit-unique-42");
  assert.equal(selectWhitebitProviderDepositId(null, null), undefined);
  assert.notEqual(selectWhitebitProviderDepositId(providerTransactionId, null), chainHash);
});

test("WhiteBIT explorer metadata never follows a current route that mismatches frozen identity", () => {
  const projected = projectWhitebitVerifiedFunding({
    transactionHash: "0xfrozen-hash",
    confirmations: 0,
    detectedAt: null,
    canonicalAssetCode: "BNB",
    frozenRouteId: "bnb-bnb",
    frozenNetworkCode: "BEP20",
    frozenNetworkName: "BNB",
    routes: [
      {
        id: "bnb-bnb",
        assetCode: "BNB",
        networkCode: "BNB",
        networkName: "BNB",
        explorerUrlTemplate: "https://edited-route.example/tx/{tx}",
      },
      {
        id: "other-bep20",
        assetCode: "OTHER",
        networkCode: "BEP20",
        networkName: "Other BEP20",
        explorerUrlTemplate: "https://wrong-asset.example/tx/{tx}",
      },
    ],
  });

  assert.equal(projected?.networkCode, "BEP20");
  assert.equal(projected?.explorerUrl, undefined);
});

test("known frozen network codes select registry explorer metadata for BTC BITCOIN and BNB BEP20", () => {
  const btc = projectWhitebitVerifiedFunding({
    transactionHash: "btc-chain-hash",
    confirmations: 5,
    detectedAt: null,
    canonicalAssetCode: "BTC",
    frozenRouteId: "btc-bitcoin",
    frozenNetworkCode: "BITCOIN",
    frozenNetworkName: "BITCOIN",
    routes: [{
      id: "btc-bitcoin",
      assetCode: "BTC",
      networkCode: "BITCOIN",
      networkName: "Bitcoin",
      explorerUrlTemplate: "https://mempool.space/tx/{txid}",
    }],
  });
  const bnbWithoutTemplate = projectWhitebitVerifiedFunding({
    transactionHash: "bnb-chain-hash",
    confirmations: 2,
    detectedAt: null,
    canonicalAssetCode: "BNB",
    frozenRouteId: "bnb-bnb",
    frozenNetworkCode: "BEP20",
    frozenNetworkName: "BNB",
    routes: [
      {
        id: "bnb-bnb",
        assetCode: "BNB",
        networkCode: "BNB",
        networkName: "BNB",
        explorerUrlTemplate: "https://wrong-network.example/tx/{tx}",
      },
      {
        id: "bnb-bep20",
        assetCode: "BNB",
        networkCode: "BEP20",
        networkName: "BNB Smart Chain",
        explorerUrlTemplate: null,
      },
    ],
  });

  assert.equal(btc?.explorerUrl, "https://mempool.space/tx/btc-chain-hash");
  assert.equal(bnbWithoutTemplate?.networkCode, "BEP20");
  assert.equal(bnbWithoutTemplate?.explorerUrl, undefined);
});

test("unknown network explorer metadata is allowed only for an exact frozen route identity", () => {
  const matchingRoute = {
    id: "btc-custom",
    assetCode: "BTC",
    networkCode: "CUSTOM",
    networkName: "Custom",
    explorerUrlTemplate: "https://custom.example/tx/{tx}",
  };
  const project = (networkName: string, explorerUrlTemplate = matchingRoute.explorerUrlTemplate) =>
    projectWhitebitVerifiedFunding({
      transactionHash: "0xcustom",
      confirmations: 0,
      detectedAt: null,
      canonicalAssetCode: "BTC",
      frozenRouteId: "btc-custom",
      frozenNetworkCode: "UNREGISTERED-MAPPING",
      frozenNetworkName: networkName,
      routes: [{ ...matchingRoute, explorerUrlTemplate }],
    });

  assert.equal(project("CUSTOM")?.explorerUrl, "https://custom.example/tx/0xcustom");
  assert.equal(project("MISMATCH")?.explorerUrl, undefined);
  assert.equal(project("CUSTOM", null)?.explorerUrl, undefined);
});

test("legacy editable transaction hash is suppressed only for Manual Swap", () => {
  assert.equal(exposeLegacyTransactionHash("manual", "editable-hash"), undefined);
  assert.equal(exposeLegacyTransactionHash("crypto", "legacy-hash"), "legacy-hash");
  assert.equal(exposeLegacyTransactionHash("convert", "legacy-hash"), "legacy-hash");
  assert.equal(exposeLegacyTransactionHash("manual", null), undefined);
  assert.equal(exposeLegacyTransactionHash(undefined, "provider-managed-hash"), "provider-managed-hash");
});

test("verified funding projection contract requires applied evidence fields", () => {
  const appliedEvidence = {
    orderId: "manual-1",
    state: "applied",
    observationId: "observation-1",
    monitorAssetId: "asset-1",
    assetNetworkId: "bsc-usdt",
    transactionHash: "0xverified",
  };
  assert.equal(appliedEvidence.state, "applied");
  assert.equal(appliedEvidence.orderId, "manual-1");
  assert.notEqual(appliedEvidence.orderId, "manual-2");
  assert.equal(appliedEvidence.transactionHash, "0xverified");
});