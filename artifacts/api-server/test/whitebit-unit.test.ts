import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { assetIdentity, classifyWhitebitHttpStatus, historyRecords, isCreditEligible, normalizeWhitebitMemo, parseWhitebitAddressResponse, verifyWhitebitSignature } from "../src/routes/whitebit";
import { matchWhitebitCapability, matchWhitebitRouteCapability, parseWhitebitAssets, parseWhitebitCatalogAssets, shouldReserveWhitebitOrderFunding } from "../src/lib/whitebit-capabilities";
import { listDepositProviderOptions } from "../src/lib/deposit-provider-registry";
import {
  canAcceptManualCryptoDeposit,
  isConfiguredYouSendCryptoNetwork,
  isManualMonitoringRuntimeReady,
} from "../src/lib/manual-crypto";
import {
  getSelectedWhitebitCredentialState,
  getWhitebitCredentialStateForSource,
  whitebitCredentialSourceConfiguration,
  whitebitHistoricalReconciliationAllowed,
} from "../src/lib/provider-credentials";
import { whitebitHistoryWorkerConfiguration } from "../src/lib/whitebit-history-health";

const secret = "unit-test-webhook-secret";

test("WhiteBIT credential source selector is explicit and canonical", () => {
  const original = process.env.WHITEBIT_CREDENTIAL_SOURCE;
  try {
    delete process.env.WHITEBIT_CREDENTIAL_SOURCE;
    assert.deepEqual(whitebitCredentialSourceConfiguration(), {
      explicit: false, valid: true, source: null,
    });
    process.env.WHITEBIT_CREDENTIAL_SOURCE = "environment";
    assert.deepEqual(whitebitCredentialSourceConfiguration(), {
      explicit: true, valid: true, source: "environment",
    });
    process.env.WHITEBIT_CREDENTIAL_SOURCE = "stored";
    assert.deepEqual(whitebitCredentialSourceConfiguration(), {
      explicit: true, valid: true, source: "stored",
    });
    process.env.WHITEBIT_CREDENTIAL_SOURCE = "Environment";
    assert.deepEqual(whitebitCredentialSourceConfiguration(), {
      explicit: true, valid: false, source: null,
    });
  } finally {
    if (original === undefined) delete process.env.WHITEBIT_CREDENTIAL_SOURCE;
    else process.env.WHITEBIT_CREDENTIAL_SOURCE = original;
  }
});

test("explicit environment source never reads stored credentials or allows a stored History Worker", async () => {
  const original = {
    source: process.env.WHITEBIT_CREDENTIAL_SOURCE,
    key: process.env.WHITEBIT_API_KEY,
    secret: process.env.WHITEBIT_API_SECRET,
    history: process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE,
    enabled: process.env.WHITEBIT_HISTORY_WORKER_ENABLED,
    approved: process.env.WHITEBIT_HISTORICAL_RECONCILIATION_APPROVED,
  };
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  try {
    process.env.WHITEBIT_CREDENTIAL_SOURCE = "environment";
    process.env.WHITEBIT_API_KEY = "fixture-environment-key";
    process.env.WHITEBIT_API_SECRET = "fixture-environment-secret";
    process.env.WHITEBIT_HISTORY_WORKER_ENABLED = "true";
    process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE = "stored";
    delete process.env.WHITEBIT_HISTORICAL_RECONCILIATION_APPROVED;
    const forbiddenStoredRead = { select: () => { throw new Error("Stored credentials were read"); } };
    const selected = await getSelectedWhitebitCredentialState(forbiddenStoredRead);
    assert.equal(selected.status, "available");
    assert.equal(selected.source, "environment");
    assert.equal(selected.status === "available" && selected.credentials.apiKey, "fixture-environment-key");
    assert.equal((await getWhitebitCredentialStateForSource("stored", forbiddenStoredRead)).status, "unavailable");
    assert.equal(whitebitHistoryWorkerConfiguration().source, null);
    process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE = "environment";
    assert.equal(whitebitHistoryWorkerConfiguration().source, "environment");
    assert.equal(whitebitHistoryWorkerConfiguration().enabled, false);
    assert.equal(whitebitHistoricalReconciliationAllowed(), false);
    process.env.WHITEBIT_HISTORICAL_RECONCILIATION_APPROVED = "true";
    assert.equal(whitebitHistoryWorkerConfiguration().enabled, true);
    delete process.env.WHITEBIT_API_KEY;
    assert.equal((await getSelectedWhitebitCredentialState(forbiddenStoredRead)).status, "absent");
  } finally {
    restore("WHITEBIT_CREDENTIAL_SOURCE", original.source);
    restore("WHITEBIT_API_KEY", original.key);
    restore("WHITEBIT_API_SECRET", original.secret);
    restore("WHITEBIT_HISTORY_CREDENTIAL_SOURCE", original.history);
    restore("WHITEBIT_HISTORY_WORKER_ENABLED", original.enabled);
    restore("WHITEBIT_HISTORICAL_RECONCILIATION_APPROVED", original.approved);
  }
});

const raw = Buffer.from(JSON.stringify({
  method: "deposit.processed",
  params: { nonce: 1001, uniqueId: "deposit-1", status: 3 },
  id: "delivery-1",
}));

function headers() {
  const payload = raw.toString("base64");
  return {
    payload,
    signature: crypto.createHmac("sha512", secret).update(payload).digest("hex"),
  };
}

test("WhiteBIT official HMAC signature accepts exact raw payload", () => {
  const signed = headers();
  assert.equal(verifyWhitebitSignature(raw, signed.payload, signed.signature, secret), true);
});

test("WhiteBIT signature rejects invalid signature, payload mismatch, and wrong secret", () => {
  const signed = headers();
  assert.equal(verifyWhitebitSignature(raw, signed.payload, `${signed.signature.slice(0, -1)}0`, secret), false);
  assert.equal(verifyWhitebitSignature(raw, Buffer.from("different").toString("base64"), signed.signature, secret), false);
  assert.equal(verifyWhitebitSignature(raw, signed.payload, signed.signature, "wrong-secret"), false);
});

test("WhiteBIT history parser accepts bounded array/object envelopes and rejects malformed responses", () => {
  const rows = [{ uniqueId: "one" }, { uniqueId: "two" }];
  assert.deepEqual(historyRecords(rows), rows);
  assert.deepEqual(historyRecords({ records: rows }), rows);
  assert.deepEqual(historyRecords({ data: rows }), rows);
  assert.throws(() => historyRecords({ records: "not-an-array" }));
  assert.throws(() => historyRecords("not-an-object"));
});

test("WhiteBIT credit policy is terminal-only and requires a known address", () => {
  assert.equal(isCreditEligible("deposit.accepted", 3, true), false);
  assert.equal(isCreditEligible("deposit.updated", 7, true), false);
  assert.equal(isCreditEligible("deposit.processed", 15, true), false);
  assert.equal(isCreditEligible("deposit.processed", 3, false), false);
  assert.equal(isCreditEligible("deposit.processed", 3, true), true);
  assert.equal(isCreditEligible("deposit.processed", 7, true), true);
});

test("WhiteBIT create-address parser requires the documented nested account shape", () => {
  assert.deepEqual(parseWhitebitAddressResponse({ account: { address: "ADDR", memo: "MEMO" }, required: {} }), { address: "ADDR", memo: "MEMO" });
  assert.deepEqual(parseWhitebitAddressResponse({ account: { address: "ADDR", memo: " \t " } }), { address: "ADDR", memo: null });
  assert.equal(parseWhitebitAddressResponse({ address: "ADDR" }), null);
});

test("WhiteBIT absent memo forms normalize together without weakening real tags", () => {
  for (const value of [null, undefined, "", " ", "\t\n", "\u00a0"]) {
    assert.equal(normalizeWhitebitMemo(value), null);
  }
  assert.equal(normalizeWhitebitMemo(" TAG-1 \t"), "TAG-1");
  assert.notEqual(normalizeWhitebitMemo("TAG-1"), normalizeWhitebitMemo("tag-1"));
  assert.notEqual(normalizeWhitebitMemo("TAG-1"), normalizeWhitebitMemo("TAG-2"));
});

test("deposit capability uses exact asset and network codes, not display names or fallback wallets", () => {
  const assets = parseWhitebitAssets({
    BTC: { can_deposit: true, networks: { deposits: ["BTC"] } },
    XMR: { can_deposit: true, networks: { deposits: ["XMR"] } },
  });
  assert.ok(assets);
  const snapshot = { fetchedAt: Date.now(), assets };
  assert.equal(matchWhitebitCapability(snapshot, "BTC", "BITCOIN"), null);
  assert.equal(matchWhitebitCapability(snapshot, "BTC", "BTC")?.providerNetwork, "BTC");
  assert.equal(matchWhitebitCapability(snapshot, "XMR", "XMR")?.providerNetwork, "XMR");
  assert.equal(matchWhitebitCapability(snapshot, "XMR", "BITCOIN"), null);
  assert.equal(isConfiguredYouSendCryptoNetwork({
    enabled: true, depositProvider: "whitebit", customerDepositsEnabled: false,
  }), false);
});

test("WhiteBIT route mappings require exact canonical matches or an explicit advertised provider route", () => {
  const assets = parseWhitebitAssets({
    BTC: { can_deposit: true, networks: { deposits: ["BTC"] } },
    BNB: { can_deposit: true, networks: { deposits: ["BEP20"] } },
    AVAX: { can_deposit: true, networks: { deposits: ["CCHAIN", "XCHAIN"] } },
  });
  assert.ok(assets);
  const snapshot = { fetchedAt: 1, assets: assets! };

  // An unmapped exact internal route retains backwards-compatible behavior.
  assert.equal(matchWhitebitRouteCapability(snapshot, "BTC", "BTC")?.providerNetwork, "BTC");
  // BTC / BITCOIN is not inferred from a similar name.
  assert.equal(matchWhitebitRouteCapability(snapshot, "BTC", "BITCOIN"), null);
  assert.equal(matchWhitebitRouteCapability(snapshot, "BTC", "BITCOIN", "BTC", "BTC")?.providerNetwork, "BTC");
  assert.equal(matchWhitebitRouteCapability(snapshot, "BNB", "BNB"), null);
  assert.equal(matchWhitebitRouteCapability(snapshot, "BNB", "BNB", "BNB", "BEP20")?.providerNetwork, "BEP20");

  // AVAXC does not implicitly resolve to either of two provider networks.
  assert.equal(matchWhitebitRouteCapability(snapshot, "AVAX", "AVAXC"), null);
  assert.equal(matchWhitebitRouteCapability(snapshot, "AVAX", "AVAXC", "AVAX", "CCHAIN")?.providerNetwork, "CCHAIN");
  assert.equal(matchWhitebitRouteCapability(snapshot, "AVAX", "AVAXC", "AVAX", "XCHAIN")?.providerNetwork, "XCHAIN");
  assert.equal(matchWhitebitRouteCapability(snapshot, "AVAX", "AVAXC", "AVAX", "BSC"), null);
  assert.equal(matchWhitebitRouteCapability(snapshot, "AVAX", "AVAXC", "AVAX", null), null);
  assert.equal(matchWhitebitRouteCapability(snapshot, "AVAX", "AVAXC", null, "CCHAIN"), null);
});

test("WhiteBIT asset identity keeps create requests base-ticker safe and parses provider network tickers", () => {
  assert.deepEqual(assetIdentity("USDT", "TRC20"), { ticker: "USDT", network: "TRC20", providerTicker: "USDT" });
  assert.deepEqual(assetIdentity("USDT_ETH", ""), { ticker: "USDT", network: "ERC20", providerTicker: "USDT_ETH" });
  assert.deepEqual(assetIdentity("BTC", "BITCOIN"), { ticker: "BTC", network: "BITCOIN", providerTicker: "BTC" });
});

test("WhiteBIT array history pages preserve full 500-record pages without a total", () => {
  const first = Array.from({ length: 500 }, (_, index) => ({ uniqueId: `page-${index}` }));
  const second = [{ uniqueId: "prepended-new-record" }];
  assert.equal(historyRecords(first).length, 500);
  assert.equal(historyRecords(second)[0]?.uniqueId, "prepended-new-record");
});

test("WhiteBIT capability parser requires strict keyed assets and exact deposit networks", () => {
  const parsed = parseWhitebitAssets({
    USDT: {
      can_deposit: true,
      networks: { deposits: ["TRC20"], withdraws: ["TRC20"], default: "TRC20" },
      confirmations: { TRC20: 19 },
    },
    BTC: {
      can_deposit: false,
      networks: { deposits: ["BTC"], withdraws: ["BTC"], default: "BTC" },
    },
  });
  assert.ok(parsed);
  assert.deepEqual(matchWhitebitCapability({ fetchedAt: Date.now(), assets: parsed! }, "usdt", "trc20"), {
    providerTicker: "USDT",
    providerNetwork: "TRC20",
    requiredConfirmations: 19,
  });
  assert.equal(matchWhitebitCapability({ fetchedAt: Date.now(), assets: parsed! }, "USDT", "ERC20"), null);
  assert.equal(parseWhitebitAssets({ USDT: { can_deposit: true, networks: { deposits: ["TRC20"] }, confirmations: [] } }), null);
});

test("WhiteBIT catalog parser uses live withdraws/default and preserves memo and limits", () => {
  const [asset] = parseWhitebitCatalogAssets({
    USD: { providers: { fiat: true }, networks: { deposits: ["SEPA"], withdraws: ["SEPA"] } },
    USDT: {
      name: "Tether", precision: 6, can_deposit: true, can_withdraw: true, is_memo: true,
      memo: { deposit: "memo", withdraw: "tag" },
      limits: { deposit: { TRC20: { min: "1", max: "100" } }, withdraw: { TRC20: { min: "2" } } },
      networks: { deposits: ["TRC20"], withdraws: ["ERC20", "TRC20"], default: "TRC20" },
    },
  });
  assert.equal(asset.normalizedTicker, "USDT");
  assert.equal(asset.defaultNetwork, "TRC20");
  assert.deepEqual(asset.networks.map((network) => network.providerNetwork), ["TRC20", "ERC20"]);
  assert.equal(asset.networks[0]?.canDeposit, true);
  assert.equal(asset.networks[0]?.canWithdraw, true);
  assert.equal(asset.networks[0]?.requiresMemo, true);
  assert.deepEqual((asset.networks[0]?.metadata as { limits: unknown }).limits, {
    deposit: { min: "1", max: "100" }, withdraw: { min: "2" },
  });
});

test("enabled WhiteBIT keeps order funding ownership while capabilities are temporarily unavailable", () => {
  const unavailable = { enabled: false, explicitDisabled: false, credentialsReady: true, state: "unavailable" };
  assert.equal(shouldReserveWhitebitOrderFunding(unavailable, null), true);
  assert.equal(shouldReserveWhitebitOrderFunding({ ...unavailable, explicitDisabled: true, state: "disabled" }, null), false);
  assert.equal(shouldReserveWhitebitOrderFunding({ ...unavailable, credentialsReady: false, state: "not_configured" }, null), false);
  assert.equal(shouldReserveWhitebitOrderFunding({ ...unavailable, enabled: true, state: "ready" }, { providerTicker: "USDT" }), true);
  assert.equal(shouldReserveWhitebitOrderFunding({ ...unavailable, enabled: true, state: "ready" }, null), false);
});

test("WhiteBIT HTTP classification distinguishes definitive and ambiguous provider outcomes", () => {
  for (const status of [408, 409, 429, 500, 502, 503, 504]) {
    assert.equal(classifyWhitebitHttpStatus(status), "ambiguous");
  }
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(classifyWhitebitHttpStatus(status), "definitive");
  }
});

test("deposit provider registry exposes only selectable adapters and fallback policies", () => {
  assert.deepEqual(listDepositProviderOptions(), [
    { id: "whitebit", label: "WhiteBIT", implemented: true },
    { id: "manual", label: "Manual Only", implemented: true },
    { id: "none", label: "None", implemented: true },
  ]);
});

test("You Send visibility follows the explicit enabled state and provider assignment", () => {
  const whitebit = {
    id: "btc-bitcoin",
    networkCode: "BTC",
    networkName: "Bitcoin",
    networkFamily: "native",
    enabled: true,
    depositProvider: "whitebit",
    customerDepositsEnabled: false,
    sharedDepositAddress: "",
    requiresMemo: false,
    sharedDepositMemo: null,
  } as never;
  const manualWithoutWallet = {
    ...whitebit,
    depositProvider: "manual",
  } as never;
  const manualWithWallet = {
    ...manualWithoutWallet,
    sharedDepositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  } as never;

  assert.equal(isConfiguredYouSendCryptoNetwork(whitebit), false);
  assert.equal(canAcceptManualCryptoDeposit(whitebit), false);
  assert.equal(isConfiguredYouSendCryptoNetwork(manualWithoutWallet), false);
  assert.equal(canAcceptManualCryptoDeposit(manualWithoutWallet), false);
  assert.equal(canAcceptManualCryptoDeposit({
    ...manualWithWallet,
    customerDepositsEnabled: true,
  }), true);
  assert.equal(isConfiguredYouSendCryptoNetwork({
    enabled: true,
    depositProvider: "none",
    customerDepositsEnabled: true,
  }), false);
});

test("manual customer deposits require a connected exact monitoring identity", () => {
  const ready = {
    routeId: "usdt-bep20",
    routeNetworkCode: "BEP20",
    monitorAssetRouteId: "usdt-bep20",
    monitorNetworkCode: "BEP20",
    monitorChainId: "0x38",
    assetEnabled: true,
    networkEnabled: true,
    providerKind: "rpc",
    endpointConfigured: true,
    healthStatus: "connected",
    healthCheckedAtMs: Date.now(),
    healthProofCapturedAtMs: Date.now(),
    pollIntervalSeconds: 15,
    adapterKind: "evm",
    identityKind: "token",
    contractOrMint: "0x55d398326f99059ff775485246999027b3197955",
    providerCompatible: true,
    receivingAddressValid: true,
    memoValid: true,
    readinessProofFingerprint: "proof-usdt-bep20",
    routeDigest: "proof-usdt-bep20",
    networkHealthProofFingerprint: "network-bep20",
    networkDigest: "network-bep20",
  };
  assert.equal(isManualMonitoringRuntimeReady(ready), true);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, endpointConfigured: false }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, healthStatus: "disconnected" }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, healthCheckedAtMs: Date.now() - 180_000 }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, monitorAssetRouteId: "usdc-bep20" }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, monitorNetworkCode: "ERC20" }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, adapterKind: "bitcoin" }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, providerCompatible: false }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, receivingAddressValid: false }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, identityKind: "native", contractOrMint: null }), true);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, identityKind: "native" }), false);
  assert.equal(isManualMonitoringRuntimeReady({ ...ready, contractOrMint: "not-a-contract" }), false);
});