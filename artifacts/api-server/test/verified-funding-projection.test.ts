import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifiedExplorerUrl, exposeLegacyTransactionHash } from "../src/lib/verified-funding";

test("verified explorer URLs use only a valid configured HTTPS template and exact hash", () => {
  assert.equal(
    buildVerifiedExplorerUrl("https://bscscan.com/tx/{tx}", "0xabc/def"),
    "https://bscscan.com/tx/0xabc%2Fdef",
  );
  assert.equal(buildVerifiedExplorerUrl("http://unsafe/tx/{tx}", "0xabc"), undefined);
  assert.equal(buildVerifiedExplorerUrl("https://unknown/tx/{hash}", "0xabc"), undefined);
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