import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { assetIdentity, classifyWhitebitHttpStatus, historyRecords, isCreditEligible, parseWhitebitAddressResponse, verifyWhitebitSignature } from "../src/routes/whitebit";
import { matchWhitebitCapability, parseWhitebitAssets, shouldReserveWhitebitOrderFunding } from "../src/lib/whitebit-capabilities";

const secret = "unit-test-webhook-secret";
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
  assert.equal(parseWhitebitAddressResponse({ address: "ADDR" }), null);
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