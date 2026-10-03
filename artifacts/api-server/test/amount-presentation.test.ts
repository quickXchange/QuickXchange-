import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pool } from "@workspace/db";
import { formatSwapTelegramNotification } from "../src/lib/telegram-swap-notifications";
import { formatConvertTelegramNotification } from "../src/lib/telegram-convert-notifications";

if (process.env.API_TEST_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Presentation integration tests require the disposable API database.");
}
after(async () => { await pool.end(); });

const amounts = {
  orderId: "DISPLAY-TEST-ONLY",
  sendAmount: "123.456789",
  receiveAmount: "10.12345",
  receivedAmount: "1000.500000",
  sendMethod: "USD", sendAsset: "USD", sendNetwork: "",
  receiveMethod: "USDT", receiveAsset: "USDT", receiveNetwork: "TRC20",
  receivedAsset: "USD", status: "awaiting_deposit",
  trackingUrl: "https://example.test/order",
};

test("Swap and Convert Telegram rendering rounds without modifying stored payload economics", () => {
  for (const [render, eventKind] of [
    [formatSwapTelegramNotification, "order_created"],
    [formatConvertTelegramNotification, "order_created"],
  ] as const) {
    const payload = { ...amounts, eventKind };
    const before = JSON.stringify(payload);
    const html = render(payload as never);
    assert.match(html, /123\.457/);
    assert.match(html, /10\.123/);
    assert.doesNotMatch(html, /123\.456789|10\.12345/);
    assert.equal(JSON.stringify(payload), before);
  }
});

test("received-payment Telegram display preserves exact funding evidence in its input", () => {
  for (const render of [formatSwapTelegramNotification, formatConvertTelegramNotification]) {
    const payload = { ...amounts, eventKind: "payment_received" };
    const before = JSON.stringify(payload);
    assert.match(render(payload as never), /1000\.5/);
    assert.equal(JSON.stringify(payload), before);
  }
});