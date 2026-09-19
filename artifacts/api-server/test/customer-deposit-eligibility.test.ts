import assert from "node:assert/strict";
import test from "node:test";
import {
  customerDepositEligibilityContextMatchesState,
  customerDepositRouteConfigurationDigest,
  hasUsableSavedReceivingWallet,
  isCustomerDepositEligible,
  type CustomerDepositEligibilityContext,
} from "../src/lib/customer-deposit-eligibility";

const btcAsset = { code: "BTC", enabled: true, lifecycle: "active" };
const ethAsset = { code: "ETH", enabled: true, lifecycle: "active" };

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