import assert from "node:assert/strict";
import test from "node:test";
import {
  hasUsableSavedReceivingWallet,
  isCustomerDepositEligible,
  type CustomerDepositEligibilityContext,
} from "../src/lib/customer-deposit-eligibility";

const unavailable: CustomerDepositEligibilityContext = {
  whitebitReady: false,
  whitebitCapabilities: null,
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
  assert.equal(isCustomerDepositEligible("BTC", network({
    depositProvider: "none",
    sharedDepositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  }), unavailable), false);
  assert.equal(isCustomerDepositEligible("BTC", network({
    depositProvider: "whitebit",
  }), {
    whitebitReady: true,
    whitebitCapabilities: {
      fetchedAt: Date.now(),
      assets: [{
        ticker: "BTC",
        canDeposit: true,
        depositNetworks: ["BTC"],
        confirmations: { BTC: 2 },
      }],
    },
  }), true);
  assert.equal(isCustomerDepositEligible("ETH", network({
    depositProvider: "whitebit",
  }), {
    whitebitReady: true,
    whitebitCapabilities: {
      fetchedAt: Date.now(),
      assets: [{
        ticker: "BTC",
        canDeposit: true,
        depositNetworks: ["BTC"],
        confirmations: { BTC: 2 },
      }],
    },
  }), false);
});