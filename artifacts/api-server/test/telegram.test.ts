import assert from "node:assert/strict";
import test from "node:test";
import { DepositInstructionsPending, shouldApplyUpdate, reconciliationClaimEligible, reconciliationWinnerTransition, telegramAdvisoryChatKey, telegramCreateRetryDecision, telegramCreationDeliveryDecision, telegramCreationOutboxPayload, telegramCreateState, telegramDepositInstruction, telegramInboxDisposition, telegramNextChatCursor, telegramOutboxFailureDisposition, telegramPrivateUpdate, telegramRequiresDeposit, telegramSecretMatches, telegramUpdateIdValid, telegramWebhookDisposition } from "../src/routes/telegram";
import { localeOf, t } from "../src/lib/telegram-localization";
import { buildCreatePayload, buildQuotePayload, filterConvertTargets, filterManualTargets, nextRequiredField, shouldAskDestination, shouldAskRefund } from "../src/lib/telegram-wizard";

test("Telegram webhook secret uses exact constant-time-length semantics", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "secret";
  assert.equal(telegramSecretMatches("secret"), true);
  assert.equal(telegramSecretMatches("wrong"), false);
  assert.equal(telegramSecretMatches("secret-long"), false);
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

test("Telegram update validation and create fencing reject duplicate processing states", () => {
  assert.equal(telegramUpdateIdValid(1), true);
  assert.equal(telegramUpdateIdValid(-1), false);
  assert.equal(telegramUpdateIdValid("1"), false);
  assert.equal(telegramCreateState("review"), "processing");
  assert.equal(telegramCreateState("processing"), "processing");
  assert.equal(telegramWebhookDisposition(true, true, true), 200);
  assert.equal(telegramWebhookDisposition(true, true, false), 202);
  assert.equal(telegramWebhookDisposition(false, true, false), 404);
  assert.equal(telegramWebhookDisposition(true, false, false), 401);
});

test("Telegram locale stays supported with safe English fallback", () => {
  assert.equal(localeOf("ar-EG"), "ar");
  assert.equal(localeOf("xx"), "en");
  assert.match(t("ar", "welcome"), /QuickXchange/);
});

test("Telegram wizard builds exact route bodies from persisted selections", () => {
  const source = { id: "send-eur", assetCode: "EUR", routeNetwork: "SEPA", kind: "fiat-payment-method" };
  const target = { id: "receive-usdt", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network" };
  assert.deepEqual(buildQuotePayload("swap", source, target, 100), {
    type: "manual", fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "USDT", toNetwork: "TRC20",
    amount: 100, rateMode: "FLOATING", sourceSettlementOptionId: "send-eur", targetSettlementOptionId: "receive-usdt",
  });
  const body = buildCreatePayload("swap", source, target, { amount: 100, email: "a@b.test", quote: { quoteId: "quoted" }, clientRequestId: "id", values: {} });
  assert.equal(body.fromAsset, "EUR");
  assert.equal(body.targetSettlementOptionId, "receive-usdt");
  assert.equal(body.refundAddress, undefined);
  assert.equal(body.refundMemo, undefined);
  const withRefund = buildCreatePayload("swap", source, target, {
    amount: 100,
    email: "a@b.test",
    quote: { quoteId: "quoted" },
    clientRequestId: "id-2",
    refundAddress: "fiat-refund-destination",
    refundMemo: "optional-tag",
    values: {},
  });
  assert.equal(withRefund.refundAddress, "fiat-refund-destination");
  assert.equal(withRefund.refundMemo, "optional-tag");
  assert.equal(shouldAskDestination("swap", source), false);
  assert.equal(shouldAskDestination("swap", target), true);
});

test("Telegram wizard honors conditional and optional fields", () => {
  const fields = [
    { key: "method", required: true },
    { key: "iban", required: true, requiredWhen: { fieldKey: "method", equals: "bank" } },
    { key: "note", required: false },
  ];
  assert.equal(nextRequiredField(fields, 0, {}), 0);
  assert.equal(nextRequiredField(fields, 1, { method: "cash" }), 2);
  assert.equal(nextRequiredField(fields, 1, { method: "bank" }), 1);
});

test("Telegram route filtering preserves receive-only options without cross-products", () => {
  const source = { id: "s", assetCode: "BTC", routeNetwork: "BTC", kind: "crypto-network", direction: "send" };
  const receiveOnly = { id: "r", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network", direction: "receive" };
  const unrelated = { id: "x", assetCode: "ETH", routeNetwork: "ETH", kind: "crypto-network", direction: "receive" };
  assert.deepEqual(filterManualTargets([source, receiveOnly, unrelated], [{ sourceSettlementOptionId: "s", targetSettlementOptionId: "r" }], "s").map(x => x.id), ["r"]);
  assert.deepEqual(filterConvertTargets([source, receiveOnly, unrelated], [{ fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "TRC20" }], source).map(x => x.id), ["r"]);
});

test("Telegram completion and validation decisions follow route kind", () => {
  const fiat = { id: "eur", assetCode: "EUR", routeNetwork: "SEPA", kind: "fiat" };
  const crypto = { id: "btc", assetCode: "BTC", routeNetwork: "BTC", kind: "crypto-network" };
  assert.equal(shouldAskDestination("swap", fiat), false);
  assert.equal(shouldAskDestination("swap", crypto), true);
  assert.equal(shouldAskDestination("convert", fiat), true);
  assert.equal(shouldAskRefund(crypto), true);
  assert.equal(shouldAskRefund(fiat), true);
});

test("Telegram financial actions require private chat and durable lease disposition", () => {
  const privateUpdate = { update_id: 1, message: { chat: { id: 1, type: "private" }, from: { id: 9 }, text: "/orders" } };
  const groupUpdate = { update_id: 2, message: { chat: { id: -1, type: "group" }, from: { id: 9 }, text: "/orders" } };
  assert.equal(telegramPrivateUpdate(privateUpdate), true);
  assert.equal(telegramPrivateUpdate(groupUpdate), false);
  assert.equal(telegramInboxDisposition("completed", false), "ack");
  assert.equal(telegramInboxDisposition("processing", false), "retry");
  assert.equal(telegramInboxDisposition("processing", true), "claim");
});

test("Telegram reconciliation cursor and customer-safe deposit projection are stable", () => {
  assert.equal(telegramNextChatCursor("chat-25", 25, 25), "chat-25");
  assert.equal(telegramNextChatCursor("chat-25", 25, 4), undefined);
  assert.deepEqual(telegramDepositInstruction({ depositAddress: "addr", depositMemo: "tag", adminSecret: "never-send" }), { address: "addr", memo: "tag" });
  assert.equal(telegramDepositInstruction({ status: "pending" }), undefined);
  assert.equal(telegramAdvisoryChatKey("123"), "123");
  assert.throws(() => telegramAdvisoryChatKey("group"));
});

test("Telegram update replay and reconciliation claims are winner-fenced", () => {
  assert.equal(shouldApplyUpdate("42", "42"), false);
  assert.equal(shouldApplyUpdate("42", "43"), true);
  assert.equal(reconciliationClaimEligible("processing", null, new Date()), true);
  assert.equal(reconciliationClaimEligible("reconciling", null, new Date()), false);
  assert.equal(reconciliationWinnerTransition(true, true), true);
  assert.equal(reconciliationWinnerTransition(false, true), false);
});

test("Telegram creation recovery preserves retry identity and durable delivery selection", () => {
  assert.equal(telegramCreateRetryDecision(422), "review");
  assert.equal(telegramCreateRetryDecision(503), "processing");
  assert.equal(telegramRequiresDeposit("convert", "fiat"), true);
  assert.equal(telegramRequiresDeposit("swap", "crypto-network"), true);
  assert.equal(telegramRequiresDeposit("swap", "fiat"), false);
  assert.equal(telegramCreationDeliveryDecision(true, false), "refresh");
  assert.equal(telegramCreationDeliveryDecision(true, true), "photo");
  assert.equal(telegramCreationDeliveryDecision(false, false), "message");
  const payload = telegramCreationOutboxPayload("order-1", "convert", { status: "awaiting", recordVersion: 3, depositAddress: "addr", depositMemo: "memo" }, "signed-token", true);
  assert.equal(payload.eventKind, "order_created");
  assert.equal(payload.statusVersion, 3);
  assert.equal(payload.depositAddress, "addr");
  assert.equal(payload.trackingToken, "signed-token");
  assert.equal(payload.requiresDeposit, true);
});

test("Required deposit provisioning never terminally fails, while Telegram errors do", () => {
  assert.equal(telegramOutboxFailureDisposition(new DepositInstructionsPending(), 100), "pending");
  assert.equal(telegramOutboxFailureDisposition(new Error("Telegram send failed"), 5), "failed");
  assert.equal(telegramOutboxFailureDisposition(new Error("Telegram send failed"), 4), "pending");
});