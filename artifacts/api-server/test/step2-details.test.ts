import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { operatorRecord, customerRecord } from "../src/lib/order-history";
import {
  projectManualOrderStep2Details,
  projectStep2Details,
} from "../src/lib/step2-details";
import {
  signQuoteTicket,
  verifyQuoteTicket,
  verifyQuoteTicketForHistory,
} from "../src/lib/quote-ticket";
import { quickexOrdersTable } from "@workspace/db";

process.env.SESSION_SECRET ??= "step2-details-test-secret";

const fields = [
  { key: "source_iban", label: "International Bank Account Number", type: "account-iban" },
  { key: "accountReference", label: "Account reference", type: "short-text" },
  { key: "providerOrderId", label: "Provider order ID", type: "short-text" },
  { key: "txid", label: "Transaction ID", type: "short-text" },
  { key: "tx_id", label: "TX ID", type: "short-text" },
  { key: "networkCode", label: "Network code", type: "short-text" },
  { key: "identityDocument", label: "Identity document", type: "private-image" },
] as const;

test("manual details are projected only from saved field definitions", () => {
  const result = projectStep2Details({
    customerEmail: "customer@example.test",
    destinationAddress: " wallet-address ",
    settlementDetails: {
      source_iban: " DE123456 ",
      accountReference: " REF-42 ",
      providerOrderId: "internal",
      txid: "internal",
      tx_id: "internal",
      networkCode: "internal",
      identityDocument: "uploads/private-document.pdf",
      unconfiguredField: "not shown",
    },
    requiredFields: fields,
  });

  assert.deepEqual(result, [
    { key: "email", label: "Email", value: "customer@example.test" },
    { key: "destinationAddress", label: "Receiving Address", value: "wallet-address" },
    { key: "source_iban", label: "International Bank Account Number", value: "DE123456" },
    { key: "accountReference", label: "Account reference", value: "REF-42" },
  ]);
});

test("manual projection omits server-derived signed-in email and file values", () => {
  const row = {
    type: "manual",
    customerEmail: "verified@example.test",
    customerName: "Ada",
    customerOwnershipSource: "authenticated_create",
    destinationAddress: "mutable address",
    refundAddress: "refund-address",
    settlementSnapshot: { requiredFields: fields },
    customerDetailsSnapshot: {
      destinationAddress: "saved address",
      settlementDetails: {
        source_iban: "DE123456",
        accountReference: "REF-42",
        identityDocument: "uploads/private-document.pdf",
      },
    },
    paymentDetails: { customInstructions: "operator instruction" },
    fundingDetailsSnapshot: { address: "operator funding address" },
  };

  assert.deepEqual(projectManualOrderStep2Details(row), [
    { key: "name", label: "Name", value: "Ada" },
    { key: "destinationAddress", label: "Receiving Address", value: "saved address" },
    { key: "refundAddress", label: "Refund Address", value: "refund-address" },
    { key: "source_iban", label: "International Bank Account Number", value: "DE123456" },
    { key: "accountReference", label: "Account reference", value: "REF-42" },
  ]);
  assert.deepEqual(projectManualOrderStep2Details({
    ...row,
    customerOwnershipSource: "verified_email_claim",
  })?.[0], { key: "email", label: "Email", value: "verified@example.test" });
  assert.equal(projectManualOrderStep2Details({
    ...row,
    customerOwnershipSource: "",
    customerClerkUserId: "cus-legacy",
  })?.some((detail) => detail.key === "email"), false);
  assert.equal(projectManualOrderStep2Details({
    ...row,
    customerOwnershipSource: "",
    customerClerkUserId: "cus-claimed",
    customerClaimedAt: new Date("2026-01-01T00:00:00.000Z"),
  })?.some((detail) => detail.key === "email"), true);
});

test("manual admin and customer responses both attach the safe projection", async () => {
  const source = await readFile(resolve(process.cwd(), "src/routes/exchange.ts"), "utf8");
  assert.equal(
    (source.match(/step2Details:\s*projectManualOrderStep2Details\(row\)/g) ?? []).length,
    2,
  );
});

test("historical quote verification recovers signed labels after expiry only", () => {
  const quote = signQuoteTicket({
    v: 2,
    type: "instant",
    fromAsset: "BTC",
    fromNetwork: "Bitcoin",
    toAsset: "USDT",
    toNetwork: "TRC20",
    amount: 1,
    receiveAmount: 2,
    rate: 2,
    fee: 0,
    provider: "Quickex",
    expiresAt: 1,
    requiredSettlementFields: [fields[1]],
  });

  assert.deepEqual(
    verifyQuoteTicketForHistory(quote).requiredSettlementFields,
    [fields[1]],
  );
  assert.throws(() => verifyQuoteTicket(quote, {
    type: "instant",
    fromAsset: "BTC",
    fromNetwork: "Bitcoin",
    toAsset: "USDT",
    toNetwork: "TRC20",
    amount: 1,
  }), { code: "QUOTE_EXPIRED" });
  assert.throws(() => verifyQuoteTicketForHistory(`${quote}x`), { code: "QUOTE_INVALID" });
  const malformed = signQuoteTicket({
    v: 2,
    type: "instant",
    fromAsset: "BTC",
    fromNetwork: "Bitcoin",
    toAsset: "USDT",
    toNetwork: "TRC20",
    amount: 1,
    receiveAmount: 2,
    rate: 2,
    fee: 0,
    provider: "Quickex",
    expiresAt: 1,
    requiredSettlementFields: [{ ...fields[1], type: "unsafe" }],
  } as never);
  assert.throws(() => verifyQuoteTicketForHistory(malformed), { code: "QUOTE_INVALID" });
});

test("Quickex admin and customer history share the safe Step 2 projection", () => {
  const quoteId = signQuoteTicket({
    v: 2,
    type: "instant",
    fromAsset: "BTC",
    fromNetwork: "Bitcoin",
    toAsset: "USDT",
    toNetwork: "TRC20",
    amount: 1,
    receiveAmount: 2,
    rate: 2,
    fee: 0,
    provider: "Quickex",
    expiresAt: 1,
    requiredSettlementFields: [fields[1], fields[2]],
  });
  const row = {
    legacyOrderId: "quickex-order-1",
    status: "pending",
    recordVersion: 1,
    route: {
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      rateMode: "FIXED",
    },
    amounts: { amount: "1", receiveAmount: "2" },
    addresses: {
      destinationAddress: "wallet-address",
      destinationMemo: "tag-1",
      refundAddress: "refund-address",
      settlementDetails: {
        accountReference: "REF-42",
        providerOrderId: "hidden",
        unconfiguredField: "hidden",
      },
    },
    customerEmail: "customer@example.test",
    customerName: "Ada",
    customerClerkUserId: null,
    providerReference: null,
    providerOrderId: null,
    providerState: null,
    quoteId,
    clientRequestId: null,
    outcomeUnknown: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    providerCreatedAt: null,
    providerUpdatedAt: null,
  } as unknown as typeof quickexOrdersTable.$inferSelect;

  const adminDetails = operatorRecord(row).step2Details;
  const customerDetails = customerRecord(row).step2Details;
  assert.deepEqual(adminDetails, customerDetails);
  assert.deepEqual(adminDetails, [
    { key: "email", label: "Email", value: "customer@example.test" },
    { key: "name", label: "Name", value: "Ada" },
    { key: "destinationAddress", label: "Receiving Address", value: "wallet-address" },
    { key: "destinationMemo", label: "Receiving Memo / Tag", value: "tag-1" },
    { key: "refundAddress", label: "Refund Address", value: "refund-address" },
    { key: "accountReference", label: "Account reference", value: "REF-42" },
  ]);

  const registeredRow = {
    ...row,
    customerClerkUserId: "cus-registered",
  } as typeof quickexOrdersTable.$inferSelect;
  assert.deepEqual(
    operatorRecord(registeredRow).step2Details?.some((detail) => detail.key === "email"),
    true,
  );
  assert.deepEqual(
    customerRecord(registeredRow).step2Details?.some((detail) => detail.key === "email"),
    true,
  );
});