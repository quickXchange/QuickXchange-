import assert from "node:assert/strict";
import test from "node:test";
import {
  customerDepositEligibilityContextMatchesState,
  customerDepositRouteConfigurationDigest,
  customerDepositRouteProofMatchesConfiguration,
  hasUsableSavedReceivingWallet,
  isCustomerDepositEligible,
  whitebitRouteMappingChanged,
  type CustomerDepositEligibilityContext,
} from "../src/lib/customer-deposit-eligibility";

const btcAsset = { code: "BTC", enabled: true, lifecycle: "active" };
const ethAsset = { code: "ETH", enabled: true, lifecycle: "active" };

test("canonical XMR mapping saves retain both legacy proof digests while real mapping changes do not", () => {
  const xmrAsset = { code: "XMR", enabled: true, lifecycle: "active" };
  const implicit = network({
    id: "xmr-monero",
    networkCode: "XMR",
    networkName: "Monero",
    networkFamily: "xmr",
    depositProvider: "whitebit",
  });
  const explicit = { ...implicit, whitebitAssetCode: " xmr ", whitebitNetworkCode: "XMR" };
  const implicitDigest = customerDepositRouteConfigurationDigest(xmrAsset, implicit);
  const explicitDigest = customerDepositRouteConfigurationDigest(xmrAsset, explicit);
  assert.notEqual(implicitDigest, explicitDigest, "existing explicit proofs keep their original digest");
  assert.equal(whitebitRouteMappingChanged("XMR", "XMR", null, null, "xmr", "XMR"), false);
  assert.equal(customerDepositRouteProofMatchesConfiguration(implicitDigest, xmrAsset, explicit), true);
  assert.equal(customerDepositRouteProofMatchesConfiguration(explicitDigest, xmrAsset, implicit), true);
  const context: CustomerDepositEligibilityContext = {
    whitebitReady: true,
    whitebitCapabilities: {
      fetchedAt: 1,
      assets: [{ ticker: "XMR", canDeposit: true, depositNetworks: ["XMR"], confirmations: {} }],
    },
    whitebitProofs: new Map([[explicit.id, implicitDigest]]),
    credentialUpdatedAtMs: null,
    providerSettingVersion: null,
  };
  assert.equal(isCustomerDepositEligible(xmrAsset, explicit, context), true);
  const fallbackEdit = {
    ...explicit,
    manualFallbackEnabled: true,
    sharedDepositAddress: "a-valid-looking-fallback-is-not-proof",
  };
  assert.equal(customerDepositRouteProofMatchesConfiguration(implicitDigest, xmrAsset, fallbackEdit), true);
  assert.equal(isCustomerDepositEligible(xmrAsset, fallbackEdit, context), true);
  const changed = { ...explicit, whitebitNetworkCode: "OTHER" };
  assert.equal(whitebitRouteMappingChanged("XMR", "XMR", null, null, "XMR", "OTHER"), true);
  assert.equal(customerDepositRouteProofMatchesConfiguration(implicitDigest, xmrAsset, changed), false);
  assert.equal(customerDepositRouteProofMatchesConfiguration(explicitDigest, xmrAsset, changed), false);
  assert.equal(isCustomerDepositEligible(xmrAsset, changed, context), false);
  assert.equal(whitebitRouteMappingChanged("XMR", "XMR", null, null, "XMR", null), true);
});

const unavailable: CustomerDepositEligibilityContext = {
  whitebitReady: false,
  whitebitCapabilities: null,
  whitebitProofs: new Map(),
  credentialUpdatedAtMs: null,
  providerSettingVersion: null,
};

function network(overrides: Record<string, unknown> = {}) {
  return {
    id: "btc-btc",
    networkCode: "BTC",
    networkName: "Bitcoin",
    networkFamily: "native",
    depositProvider: "manual",
    whitebitAssetCode: null,
    whitebitNetworkCode: null,
    requiresMemo: false,
    sharedDepositAddress: "",
    sharedDepositMemo: null,
    customerDepositsEnabled: false,
    enabled: true,
    lifecycle: "active",
    ...overrides,
  };
}

test("saved receiving wallets require valid network syntax and required memos", () => {
  assert.equal(hasUsableSavedReceivingWallet(network({
    sharedDepositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  })), true);
  assert.equal(hasUsableSavedReceivingWallet(network({
    sharedDepositAddress: "not-a-bitcoin-address",
  })), false);
  assert.equal(hasUsableSavedReceivingWallet(network({
    id: "xrp-xrpl",
    networkCode: "XRP",
    networkName: "XRP Ledger",
    requiresMemo: true,
    sharedDepositAddress: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh",
    sharedDepositMemo: null,
  })), false);
  assert.equal(hasUsableSavedReceivingWallet(network({
    id: "xrp-xrpl",
    networkCode: "XRP",
    networkName: "XRP Ledger",
    requiresMemo: true,
    sharedDepositAddress: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh",
    sharedDepositMemo: "12345",
  })), true);
});

test("eligibility accepts valid fallbacks or exact active WhiteBIT capabilities", () => {
  assert.equal(isCustomerDepositEligible(btcAsset, network({
    depositProvider: "none",
    sharedDepositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  }), unavailable), false);
  assert.equal(isCustomerDepositEligible(btcAsset, network({
    depositProvider: "whitebit",
  }), {
    whitebitReady: true,
    whitebitProofs: new Map([[
      "btc-btc",
      customerDepositRouteConfigurationDigest(btcAsset, network({
        depositProvider: "whitebit",
      })),
    ]]),
    whitebitCapabilities: {
      fetchedAt: Date.now(),
      assets: [{
        ticker: "BTC",
        canDeposit: true,
        depositNetworks: ["BTC"],
        confirmations: { BTC: 2 },
      }],
    },
    credentialUpdatedAtMs: null,
    providerSettingVersion: null,
  }), true);
  assert.equal(isCustomerDepositEligible(ethAsset, network({
    depositProvider: "whitebit",
  }), {
    whitebitReady: true,
    whitebitProofs: new Map(),
    whitebitCapabilities: {
      fetchedAt: Date.now(),
      assets: [{
        ticker: "BTC",
        canDeposit: true,
        depositNetworks: ["BTC"],
        confirmations: { BTC: 2 },
      }],
    },
    credentialUpdatedAtMs: null,
    providerSettingVersion: null,
  }), false);
});

test("WhiteBIT eligibility requires a durable proof for the exact route configuration", () => {
  const verifiedNetwork = network({
    depositProvider: "whitebit",
    customerDepositsEnabled: true,
  });
  const context: CustomerDepositEligibilityContext = {
    whitebitReady: true,
    whitebitProofs: new Map([[
      verifiedNetwork.id,
      customerDepositRouteConfigurationDigest(btcAsset, verifiedNetwork),
    ]]),
    whitebitCapabilities: {
      fetchedAt: Date.now(),
      assets: [{
        ticker: "BTC",
        canDeposit: true,
        depositNetworks: ["BTC"],
        confirmations: { BTC: 2 },
      }],
    },
    credentialUpdatedAtMs: null,
    providerSettingVersion: null,
  };

  assert.equal(isCustomerDepositEligible(btcAsset, network({
    depositProvider: "whitebit",
    customerDepositsEnabled: false,
  }), {
    ...context,
    whitebitProofs: new Map(),
  }), false);
  assert.equal(isCustomerDepositEligible(btcAsset, verifiedNetwork, context), true);
  assert.equal(isCustomerDepositEligible(btcAsset, {
    ...verifiedNetwork,
    requiresMemo: true,
  }, context), false);
});

test("proof-backed WhiteBIT XMR eligibility does not require a Manual fallback wallet", () => {
  const xmrAsset = { code: "XMR", enabled: true, lifecycle: "active" };
  const xmrRoute = network({
    id: "xmr-monero",
    networkCode: "XMR",
    networkName: "Monero",
    networkFamily: "monero",
    depositProvider: "whitebit",
    sharedDepositAddress: "",
    sharedDepositMemo: null,
  });
  const context: CustomerDepositEligibilityContext = {
    whitebitReady: true,
    whitebitProofs: new Map([[
      "xmr-monero",
      customerDepositRouteConfigurationDigest(xmrAsset, xmrRoute),
    ]]),
    whitebitCapabilities: {
      fetchedAt: Date.now(),
      assets: [{
        ticker: "XMR",
        canDeposit: true,
        depositNetworks: ["XMR"],
        confirmations: { XMR: 10 },
      }],
    },
    credentialUpdatedAtMs: null,
    providerSettingVersion: null,
  };
  assert.equal(isCustomerDepositEligible(xmrAsset, xmrRoute, context), true);
  assert.equal(isCustomerDepositEligible(xmrAsset, xmrRoute, unavailable), false);
});

test("explicit WhiteBIT route mapping is catalog-checked and proof-bound while exact legacy routes remain valid", () => {
  const capabilities = {
    fetchedAt: 1,
    assets: [
      { ticker: "BTC", canDeposit: true as const, depositNetworks: ["BTC"], confirmations: { BTC: 2 } },
      { ticker: "AVAX", canDeposit: true as const, depositNetworks: ["CCHAIN", "XCHAIN"], confirmations: {} },
    ],
  };
  const baseContext: CustomerDepositEligibilityContext = {
    whitebitReady: true,
    whitebitProofs: new Map(),
    whitebitCapabilities: capabilities,
    credentialUpdatedAtMs: null,
    providerSettingVersion: null,
  };

  const exactBtc = network({ depositProvider: "whitebit" });
  const exactBtcDigest = customerDepositRouteConfigurationDigest(btcAsset, exactBtc);
  assert.equal(isCustomerDepositEligible(btcAsset, exactBtc, {
    ...baseContext,
    whitebitProofs: new Map([[exactBtc.id, exactBtcDigest]]),
  }), true);

  const mappedBtc = network({
    id: "btc-bitcoin",
    networkCode: "BITCOIN",
    depositProvider: "whitebit",
    whitebitAssetCode: "BTC",
    whitebitNetworkCode: "BTC",
  });
  const mappedBtcDigest = customerDepositRouteConfigurationDigest(btcAsset, mappedBtc);
  assert.equal(mappedBtcDigest, customerDepositRouteConfigurationDigest(btcAsset, {
    ...mappedBtc,
    whitebitAssetCode: "btc",
    whitebitNetworkCode: "btc",
  }));
  assert.notEqual(mappedBtcDigest, customerDepositRouteConfigurationDigest(btcAsset, {
    ...mappedBtc,
    whitebitNetworkCode: "BITCOIN",
  }));
  assert.equal(isCustomerDepositEligible(btcAsset, mappedBtc, {
    ...baseContext,
    whitebitProofs: new Map([[mappedBtc.id, mappedBtcDigest]]),
  }), true);
  // A proof captured for the previous route configuration cannot authorize
  // the new explicit mapping.
  assert.equal(isCustomerDepositEligible(btcAsset, mappedBtc, {
    ...baseContext,
    whitebitProofs: new Map([[mappedBtc.id, exactBtcDigest]]),
  }), false);
  assert.equal(isCustomerDepositEligible(btcAsset, {
    ...mappedBtc,
    whitebitNetworkCode: "NOT-ADVERTISED",
  }, {
    ...baseContext,
    whitebitProofs: new Map([[mappedBtc.id, mappedBtcDigest]]),
  }), false);
  assert.equal(isCustomerDepositEligible(btcAsset, {
    ...mappedBtc,
    whitebitNetworkCode: null,
  }, {
    ...baseContext,
    whitebitProofs: new Map([[mappedBtc.id, mappedBtcDigest]]),
  }), false);

  const avaxRoute = network({
    id: "avax-avaxc",
    networkCode: "AVAXC",
    depositProvider: "whitebit",
  });
  assert.equal(isCustomerDepositEligible({ ...btcAsset, code: "AVAX" }, avaxRoute, {
    ...baseContext,
    whitebitProofs: new Map([[avaxRoute.id, customerDepositRouteConfigurationDigest({ ...btcAsset, code: "AVAX" }, avaxRoute)]]),
  }), false);
  const explicitAvax = { ...avaxRoute, whitebitAssetCode: "AVAX", whitebitNetworkCode: "CCHAIN" };
  const explicitAvaxDigest = customerDepositRouteConfigurationDigest({ ...btcAsset, code: "AVAX" }, explicitAvax);
  assert.equal(isCustomerDepositEligible({ ...btcAsset, code: "AVAX" }, explicitAvax, {
    ...baseContext,
    whitebitProofs: new Map([[explicitAvax.id, explicitAvaxDigest]]),
  }), true);
});

test("stale eligibility contexts are rejected after credential or provider-state changes", () => {
  const context: CustomerDepositEligibilityContext = {
    ...unavailable,
    credentialUpdatedAtMs: 1_700_000_000_000,
    providerSettingVersion: 7,
  };
  assert.equal(customerDepositEligibilityContextMatchesState(
    context,
    1_700_000_000_000,
    7,
  ), true);
  assert.equal(customerDepositEligibilityContextMatchesState(
    context,
    1_700_000_000_001,
    7,
  ), false);
  assert.equal(customerDepositEligibilityContextMatchesState(
    context,
    1_700_000_000_000,
    8,
  ), false);
});