import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverTelegramConvertCreation,
  telegramConvertCreationMessage,
  type ConvertCreationProgress,
  type ConvertDepositSnapshot,
} from "../src/lib/telegram-convert-creation";

for (const rateMode of ["fixed", "floating"]) {
  test(`Telegram ${rateMode} Convert delivers exactly one confirmation then one captionless QR`, async () => {
    const createdOrder = {
      id: `convert-${rateMode}`, status: "awaiting funds",
      route: { rateMode, fromAsset: "BTC", fromNetwork: "BTC" },
      amounts: { amount: "0.000123456789", receiveAmount: "12.987654" },
      addresses: { depositAddress: "frozen-address", depositMemo: "123" },
    };
    const original = structuredClone(createdOrder);
    let stored: ConvertCreationProgress = {};
    let orderReads = 0;
    const deliveries: Array<{ kind: string; text?: string; data?: string; caption?: string }> = [];
    const transport = {
      loadDeposit: async (): Promise<ConvertDepositSnapshot> => {
        orderReads++;
        return {
          amount: createdOrder.amounts.amount, asset: createdOrder.route.fromAsset,
          network: createdOrder.route.fromNetwork, address: createdOrder.addresses.depositAddress,
          memo: createdOrder.addresses.depositMemo,
        };
      },
      text: async (text: string) => { deliveries.push({ kind: "message", text }); },
      qr: async (data: string) => { deliveries.push({ kind: "qr", data, caption: "" }); },
      checkpoint: async (progress: ConvertCreationProgress) => { stored = structuredClone(progress); },
    };
    await deliverTelegramConvertCreation(createdOrder.id, createdOrder.status, structuredClone(stored), transport);
    // A subsequent outbox pass must not deliver the same financial notice again.
    await deliverTelegramConvertCreation(createdOrder.id, createdOrder.status, structuredClone(stored), transport);
    assert.deepEqual(deliveries.map(item => item.kind), ["message", "qr"]);
    const message = deliveries[0].text!;
    for (const label of ["Order created", "Order ID:", "Status:", "Deposit address:"]) {
      assert.equal(message.split(label).length - 1, 1);
    }
    assert.match(message, /Status: <b>AWAITING FUNDS<\/b>/);
    assert.match(message, /Send exactly: <code>0\.000123456789<\/code> BTC \(BTC\)/);
    assert.match(message, /Deposit address: <code>frozen-address<\/code>/);
    assert.match(message, /Memo \/ tag: <code>123<\/code>/);
    assert.equal(deliveries[1].caption, "");
    assert.equal(deliveries[1].data, createdOrder.addresses.depositAddress);
    assert.equal(orderReads, 1);
    assert.deepEqual(createdOrder, original, "provider amounts and route are never modified");
  });
}

test("QR failure retries only the QR, using the frozen instructions", async () => {
  let stored: ConvertCreationProgress = {};
  let texts = 0, photos = 0, reads = 0;
  const transport = {
    loadDeposit: async () => {
      reads++;
      return { amount: "25.000000", asset: "USDT", network: "TRC20", address: "address", qrData: "provider-qr" };
    },
    text: async () => { texts++; },
    qr: async (data: string) => {
      assert.equal(data, "provider-qr");
      photos++;
      if (photos === 1) throw new Error("QR unavailable");
    },
    checkpoint: async (progress: ConvertCreationProgress) => { stored = structuredClone(progress); },
  };
  await assert.rejects(deliverTelegramConvertCreation("order", "awaiting funds", structuredClone(stored), transport));
  assert.equal(stored.convertCreationTextDelivered, true);
  assert.equal(stored.convertCreationQrDelivered, undefined);
  await deliverTelegramConvertCreation("order", "awaiting funds", structuredClone(stored), transport);
  assert.equal(texts, 1);
  assert.equal(photos, 2);
  assert.equal(reads, 1);
});

test("Missing deposit instructions send neither a confirmation nor a QR", async () => {
  let sends = 0;
  await assert.rejects(deliverTelegramConvertCreation("order", "awaiting funds", {}, {
    loadDeposit: async () => { throw new Error("instructions pending"); },
    text: async () => { sends++; },
    qr: async () => { sends++; },
    checkpoint: async () => {},
  }));
  assert.equal(sends, 0);
});

test("Payment instruction uses three decimals only when that preserves the exact amount", () => {
  const deposit = { amount: "1.230000", asset: "ETH", network: "ERC20", address: "<unsafe>" };
  assert.match(telegramConvertCreationMessage("order<&", "awaiting funds", deposit), /Send exactly: <code>1\.23<\/code> ETH \(ERC20\)/);
  assert.match(telegramConvertCreationMessage("order", "awaiting funds", { ...deposit, amount: "1.23456789" }), /<code>1\.23456789<\/code>/);
  assert.match(telegramConvertCreationMessage("order", "awaiting funds", deposit), /&lt;unsafe&gt;/);
});
