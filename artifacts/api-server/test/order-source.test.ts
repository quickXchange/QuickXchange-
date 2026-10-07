import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { requestOrderSource, telegramBotOrderSourceHeaders } from "../src/lib/order-source";
import { operatorRecord } from "../src/lib/order-history";
import { outputQuickexOrder } from "../src/lib/quickex-order-service";
import { GetOrderResponse } from "@workspace/api-zod";
import { adminOrderInformationLabels, viewOrderInformationRows } from "../../crypto-exchange-widget/src/components/view-order-fields";

test("Order origin uses attested bot requests and verified Mini App sessions, not body claims", () => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "synthetic-order-origin-test-secret";
  try {
    const now = Date.now();
    const body = { clientRequestId: "synthetic-request", orderSource: "telegram_bot" };
    assert.equal(requestOrderSource({ body, headers: {} }, now), "website");
    const headers = telegramBotOrderSourceHeaders(body, now);
    assert.equal(requestOrderSource({ body, headers }, now), "telegram_bot");
    assert.equal(requestOrderSource({ body: { clientRequestId: "other" }, headers }, now), "unknown");
    assert.equal(requestOrderSource({ body, headers }, now + 6 * 60_000), "unknown");
    const encoded = Buffer.from(JSON.stringify({ v: 1, userId: "123", chatId: "123", exp: now + 60_000 })).toString("base64url");
    const sig = createHmac("sha256", process.env.SESSION_SECRET).update(`telegram-mini:${encoded}`).digest("base64url");
    assert.equal(requestOrderSource({ body, headers: { authorization: `Bearer ${encoded}.${sig}` } }, now), "telegram_mini_app");
    assert.equal(requestOrderSource({ body, headers: { authorization: "Bearer clerk-website-session" } }, now), "website");
  } finally {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  }
});

test("Admin Order Information replaces only Rate at the same position; customer rows stay unchanged", () => {
  const rows: Array<[string, string]> = [
    ["User", "Guest"], ["Order ID", "order"], ["Sending Address", "address"],
    ["Created At", "date"], ["Rate", "unchanged exchange rate"], ["Order Source", "Telegram Bot"],
  ];
  assert.deepEqual(viewOrderInformationRows(rows, adminOrderInformationLabels).map(row => row[0]),
    ["User", "Order ID", "Sending Address", "Created At", "Order Source"]);
  assert.deepEqual(viewOrderInformationRows(rows).map(row => row[0]),
    ["User", "Order ID", "Sending Address", "Created At", "Rate"]);
});

test("Historical Convert origin is Unknown; recorded origin survives Admin detail validation", () => {
  const row = {
    legacyOrderId: "synthetic-order", orderSource: null, status: "awaiting funds", recordVersion: 0,
    route: { fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "TRC20", rateMode: "FIXED" },
    amounts: { amount: "1", receiveAmount: "100" }, addresses: {},
    customerEmail: "", customerName: "Guest", customerClerkUserId: null,
    providerState: "created", providerOrderId: "", providerReference: "", quoteId: "", clientRequestId: null,
    outcomeUnknown: false, providerCreatedAt: null, providerUpdatedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  } as Parameters<typeof operatorRecord>[0];
  assert.equal(GetOrderResponse.parse(operatorRecord(row)).orderSource, "unknown");
  assert.equal(outputQuickexOrder(row).orderSource, "unknown");
  for (const orderSource of ["website", "telegram_mini_app", "telegram_bot"]) {
    assert.equal(GetOrderResponse.parse(operatorRecord({ ...row, orderSource })).orderSource, orderSource);
    assert.equal(outputQuickexOrder({ ...row, orderSource }).orderSource, orderSource);
  }
});
