import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, telegramAccountLinkChallengesTable, telegramChatsTable } from "@workspace/db";
import { DepositInstructionsPending, menu, shouldApplyUpdate, reconciliationClaimEligible, reconciliationWinnerTransition, telegramAdvisoryChatKey, telegramCreateRetryDecision, telegramCreationDeliveryDecision, telegramCreationOutboxPayload, telegramCreateState, telegramDepositInstruction, telegramInboxDisposition, telegramManualOrderKinds, telegramNextChatCursor, telegramOutboxFailureDisposition, telegramPrivateUpdate, telegramRequiresDeposit, telegramSecretMatches, telegramUpdateIdValid, telegramWebhookDisposition } from "../src/routes/telegram";
import { localeOf, t } from "../src/lib/telegram-localization";
import { consumeTelegramLinkChallenge, createTelegramLinkChallenge, hashTelegramLinkToken, TelegramLinkChallengeError, TelegramLinkConflictError } from "../src/lib/telegram-link";
import { buildCreatePayload, buildQuotePayload, filterConvertTargets, filterManualSourceOptions, filterManualTargets, filterTelegramRouteOptions, nextRequiredField, nextSourceAmountForReceiveTarget, shouldAskDestination, telegramFieldSkipIndex, withoutTelegramRefundFields } from "../src/lib/telegram-wizard";
import { normalizeRefundFields } from "../src/lib/manual-wallet-validation";
import { telegramAccountLinkRelativeUrl, validateTelegramMiniAppInitData, verifyTelegramMiniAppSession } from "../src/routes/telegram-mini-app";

test("Telegram Mini App initData validates authentic user data", () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-only-bot-token";
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: "query", user: JSON.stringify({ id: 741852, first_name: "Test", username: "tester", language_code: "uk-UA", photo_url: "https://t.me/i/userpic/320/test.jpg" }) });
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  const validated = validateTelegramMiniAppInitData(params.toString());
  assert.equal(validated.id, 741852);
  assert.equal(validated.languageCode, "uk-UA");
  assert.equal(validated.photoUrl, "https://t.me/i/userpic/320/test.jpg");
  if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous;
});

test("Telegram Mini App initData includes the modern signature field in bot-token HMAC validation", () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-only-bot-token";
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "modern-query",
    signature: "base64url-telegram-signature",
    user: JSON.stringify({ id: 963258, first_name: "Modern" }),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));

  assert.equal(validateTelegramMiniAppInitData(params.toString()).id, 963258);

  if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous;
});

test("Telegram Mini App rejects tampered hashes and expired auth dates", () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-only-bot-token";
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - 901), user: JSON.stringify({ id: 741852 }) });
  params.set("hash", "0".repeat(64));
  assert.throws(() => validateTelegramMiniAppInitData(params.toString()), /Invalid Telegram init data/);
  const check = [...params.entries()].filter(([key]) => key !== "hash").sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  assert.throws(() => validateTelegramMiniAppInitData(params.toString()), /expired/);
  if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous;
});

test("Telegram Mini App signed sessions verify, reject tampering, and expire", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-only-session-secret";
  const encoded = Buffer.from(JSON.stringify({ v: 1, userId: "741852", chatId: "741852", exp: Date.now() + 60_000 })).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET).update(`telegram-mini:${encoded}`).digest("base64url");
  const token = `${encoded}.${signature}`;
  assert.equal(verifyTelegramMiniAppSession(token).userId, "741852");
  assert.throws(() => verifyTelegramMiniAppSession(`${encoded}.${signature.slice(0, -1)}x`), /Invalid session/);
  assert.throws(() => verifyTelegramMiniAppSession(token, Date.now() + 61_000), /expired/);
  if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous;
});

test("refund fields normalize all absence forms and trim supplied values", () => {
  assert.deepEqual(normalizeRefundFields({}), { refundAddress: undefined, refundMemo: undefined });
  assert.deepEqual(normalizeRefundFields({ refundAddress: null, refundMemo: null }), { refundAddress: undefined, refundMemo: undefined });
  assert.deepEqual(normalizeRefundFields({ refundAddress: "", refundMemo: "" }), { refundAddress: undefined, refundMemo: undefined });
  assert.deepEqual(normalizeRefundFields({ refundAddress: " \t", refundMemo: " memo " }), { refundAddress: undefined, refundMemo: undefined });
  assert.deepEqual(normalizeRefundFields({ refundMemo: " memo " }), { refundAddress: undefined, refundMemo: undefined });
  assert.deepEqual(normalizeRefundFields({ refundAddress: "  Tabc  ", refundMemo: " 123 " }), { refundAddress: "Tabc", refundMemo: "123" });
});

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

test("Telegram main menu keeps the requested two-column signed-out and signed-in layouts", () => {
  const previousWebsiteUrl = process.env.TELEGRAM_WEBSITE_URL;
  const previousMiniAppUrl = process.env.TELEGRAM_MINI_APP_URL;
  process.env.TELEGRAM_WEBSITE_URL = "https://quickxchange.example";
  process.env.TELEGRAM_MINI_APP_URL = "https://quickxchange.example/telegram-mini-app/";
  const signedOut = menu("en", false);
  assert.deepEqual(signedOut.slice(0, 4).map(row => row.map(button => button.text)), [
    ["⚡ Exchange", "📦 Track Order"],
    ["📋 My Orders", "👤 Sign In"],
    ["📝 Sign Up", "🌐 Language"],
    ["💬 Support", "🌍 Website"],
  ]);
  assert.deepEqual(signedOut.slice(0, 4).map(row => row.map(button => button.callback_data ?? "url")), [
    ["exchange", "track"],
    ["orders", "signin"],
    ["signup", "language"],
    ["support", "url"],
  ]);
  assert.deepEqual(signedOut[4], [{ text: "📱 Open App", web_app: { url: "https://quickxchange.example/telegram-mini-app/" } }]);

  const signedIn = menu("en", true);
  assert.deepEqual(signedIn.slice(0, 4).map(row => row.map(button => button.text)), [
    ["⚡ Exchange", "📦 Track Order"],
    ["📋 My Orders", "👤 My Account"],
    ["🚪 Sign Out", "🌐 Language"],
    ["💬 Support", "🌍 Website"],
  ]);
  assert.deepEqual(signedIn.slice(0, 4).map(row => row.map(button => button.callback_data ?? "url")), [
    ["exchange", "track"],
    ["orders", "account"],
    ["signout", "language"],
    ["support", "url"],
  ]);
  assert.deepEqual(signedIn[4], [{ text: "📱 Open App", web_app: { url: "https://quickxchange.example/telegram-mini-app/" } }]);
  if (previousWebsiteUrl === undefined) delete process.env.TELEGRAM_WEBSITE_URL; else process.env.TELEGRAM_WEBSITE_URL = previousWebsiteUrl;
  if (previousMiniAppUrl === undefined) delete process.env.TELEGRAM_MINI_APP_URL; else process.env.TELEGRAM_MINI_APP_URL = previousMiniAppUrl;
});

test("Telegram initData projection rejects invalid optional language and photo values", () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-only-bot-token";
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 741853, language_code: "not a locale", photo_url: "javascript:alert(1)" }),
  });
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  const validated = validateTelegramMiniAppInitData(params.toString());
  assert.equal(validated.languageCode, undefined);
  assert.equal(validated.photoUrl, undefined);
  if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous;
});

test("Telegram account-link response remains same-origin and URL-encoded", () => {
  const relativeUrl = telegramAccountLinkRelativeUrl("token with/slash");
  assert.match(relativeUrl, /^\/telegram\/connect\?token=/);
  assert.equal(new URL(relativeUrl, "https://example.test").origin, "https://example.test");
  assert.equal(relativeUrl, "/telegram/connect?token=token%20with%2Fslash");
});

test("Telegram account links are one-time, expiring, and one-to-one", async () => {
  const suffix = randomUUID();
  const chatIds = [`tg-a-${suffix}`, `tg-b-${suffix}`];
  const clerkA = `clerk-a-${suffix}`;
  const clerkB = `clerk-b-${suffix}`;
  await db.insert(telegramChatsTable).values(chatIds.map((chatId, index) => ({
    chatId,
    userId: `user-${index}-${suffix}`,
  })));

  try {
    const token = await createTelegramLinkChallenge(chatIds[0], `user-0-${suffix}`, "signin");
    const linked = await consumeTelegramLinkChallenge(token, undefined, clerkA);
    assert.equal(linked.chatId, chatIds[0]);
    await assert.rejects(
      () => consumeTelegramLinkChallenge(token, undefined, clerkA),
      TelegramLinkChallengeError,
    );

    const expiredToken = await createTelegramLinkChallenge(chatIds[1], `user-1-${suffix}`, "signup");
    await db.update(telegramAccountLinkChallengesTable)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(telegramAccountLinkChallengesTable.tokenHash, hashTelegramLinkToken(expiredToken)));
    await assert.rejects(
      () => consumeTelegramLinkChallenge(expiredToken, undefined, clerkB),
      TelegramLinkChallengeError,
    );

    const duplicateAccountToken = await createTelegramLinkChallenge(chatIds[1], `user-1-${suffix}`, "signin");
    await assert.rejects(
      () => consumeTelegramLinkChallenge(duplicateAccountToken, undefined, clerkA),
      TelegramLinkConflictError,
    );
    const [unconsumed] = await db.select({ consumedAt: telegramAccountLinkChallengesTable.consumedAt })
      .from(telegramAccountLinkChallengesTable)
      .where(eq(telegramAccountLinkChallengesTable.tokenHash, hashTelegramLinkToken(duplicateAccountToken)))
      .limit(1);
    assert.equal(unconsumed?.consumedAt, null);

    const duplicateChatToken = await createTelegramLinkChallenge(chatIds[0], `user-0-${suffix}`, "signup");
    await assert.rejects(
      () => consumeTelegramLinkChallenge(duplicateChatToken, undefined, clerkB),
      TelegramLinkConflictError,
    );
  } finally {
    await db.delete(telegramAccountLinkChallengesTable).where(inArray(telegramAccountLinkChallengesTable.chatId, chatIds));
    await db.delete(telegramChatsTable).where(inArray(telegramChatsTable.chatId, chatIds));
  }
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
  const withLegacyRefund = buildCreatePayload("swap", source, target, {
    amount: 100,
    email: "a@b.test",
    quote: { quoteId: "quoted" },
    clientRequestId: "id-2",
    refundAddress: "fiat-refund-destination",
    refundMemo: "optional-tag",
    values: {},
  });
  assert.equal("refundAddress" in withLegacyRefund, false);
  assert.equal("refundMemo" in withLegacyRefund, false);
  assert.deepEqual(withoutTelegramRefundFields({
    refundAddress: "legacy-address",
    refundMemo: "legacy-memo",
    frozenCreateBody: "kept-for-confirm-sanitization",
  }), {
    frozenCreateBody: "kept-for-confirm-sanitization",
  });
  assert.equal(shouldAskDestination("swap", source), false);
  assert.equal(shouldAskDestination("swap", target), true);
});

test("Telegram Convert omits absent refund fields for USDT TRC20 to fiat", () => {
  const source = { id: "send-usdt-trc20", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network" };
  const target = { id: "receive-eur", assetCode: "EUR", routeNetwork: "SEPA", kind: "fiat-payment-method" };
  for (const value of [null, "", " \t"]) {
    const body = buildCreatePayload("convert", source, target, {
      amount: 10, email: "convert@example.test", quote: { quoteId: "quoted" },
      clientRequestId: randomUUID(), destinationAddress: "iban", refundAddress: value, refundMemo: value,
    });
    assert.equal("refundAddress" in body, false);
    assert.equal("refundMemo" in body, false);
  }
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

test("Telegram Swap sources match executable website routes", () => {
  const options = [
    { id: "usdt-trc20", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network", lifecycle: "active", direction: "send" },
    { id: "usdt-bep20", assetCode: "USDT", routeNetwork: "BEP20", kind: "crypto-network", lifecycle: "active", direction: "receive" },
    { id: "usdt-disabled", assetCode: "USDT", routeNetwork: "ERC20", kind: "crypto-network", lifecycle: "disabled", direction: "send" },
    { id: "eur-sepa", assetCode: "EUR", routeNetwork: "SEPA", kind: "fiat-payment-method", lifecycle: "active", direction: "send" },
    { id: "usd-wire", assetCode: "USD", routeNetwork: "WIRE", kind: "fiat-payment-method", lifecycle: "active", direction: "send" },
  ];
  const routes = [
    { sourceSettlementOptionId: "usdt-trc20" },
    { sourceSettlementOptionId: "eur-sepa" },
  ];
  assert.deepEqual(
    filterManualSourceOptions(options, routes).map(option => option.id),
    ["usdt-trc20", "eur-sepa"],
  );
});

test("Telegram optional-field Skip callback resolves the clicked field index", () => {
  assert.equal(telegramFieldSkipIndex("fieldskip:0"), 0);
  assert.equal(telegramFieldSkipIndex("fieldskip:12"), 12);
  assert.equal(telegramFieldSkipIndex("fieldskip:"), undefined);
  assert.equal(telegramFieldSkipIndex("fieldskip:-1"), undefined);
  assert.equal(telegramFieldSkipIndex("fieldskip:2:3"), undefined);
});

test("Telegram option search covers currency, symbol, payment method, crypto, and network names", () => {
  const options = [
    { id: "fiat-eur-sepa", assetCode: "EUR", assetName: "Euro", routeNetwork: "SEPA", title: "Paysera", paymentMethodId: "paysera", kind: "fiat-payment-method" },
    { id: "crypto-usdt-trc20", assetCode: "USDT", assetName: "Tether", routeNetwork: "TRC20", networkTitle: "Tron", title: "USDT Tron", kind: "crypto-network" },
  ];
  assert.deepEqual(filterTelegramRouteOptions(options, "euro").map(option => option.id), ["fiat-eur-sepa"]);
  assert.deepEqual(filterTelegramRouteOptions(options, "EUR paysera").map(option => option.id), ["fiat-eur-sepa"]);
  assert.deepEqual(filterTelegramRouteOptions(options, "tether tron").map(option => option.id), ["crypto-usdt-trc20"]);
  assert.deepEqual(filterTelegramRouteOptions(options, "trc20").map(option => option.id), ["crypto-usdt-trc20"]);
  assert.deepEqual(filterTelegramRouteOptions(options, "missing"), []);
});

test("Telegram receive-side amount convergence stays finite and fee-aware", () => {
  assert.equal(nextSourceAmountForReceiveTarget(100, 195, 200), 102.564102564);
  assert.equal(nextSourceAmountForReceiveTarget(100, 0, 200), undefined);
  assert.equal(nextSourceAmountForReceiveTarget(Number.NaN, 195, 200), undefined);
});

test("Telegram completion and validation decisions follow route kind", () => {
  const fiat = { id: "eur", assetCode: "EUR", routeNetwork: "SEPA", kind: "fiat" };
  const crypto = { id: "btc", assetCode: "BTC", routeNetwork: "BTC", kind: "crypto-network" };
  assert.equal(shouldAskDestination("swap", fiat), false);
  assert.equal(shouldAskDestination("swap", crypto), true);
  assert.equal(shouldAskDestination("convert", fiat), true);
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
  assert.deepEqual(telegramManualOrderKinds, ["manual", "swap"]);
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