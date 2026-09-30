import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import {
  affiliateCompletionEventsTable,
  adminTelegramLinkChallengesTable,
  db,
  notificationSettingsTable,
  ordersTable,
  telegramAccountLinkChallengesTable,
  telegramChatsTable,
  telegramNotificationOutboxTable,
  telegramOrderLinksTable,
} from "@workspace/db";
import { DepositInstructionsPending, menu, parseTelegramOrderCallback, shouldApplyUpdate, reconciliationClaimEligible, reconciliationWinnerTransition, telegramAdvisoryChatKey, telegramCreateActionBlocked, telegramCreateRetryDecision, telegramCreatingOrderMessage, telegramCreationDeliveryDecision, telegramCreationOutboxPayload, telegramCreateState, telegramDepositInstruction, telegramInboxDisposition, telegramManualOrderKinds, telegramNextChatCursor, telegramOrderCallbackData, telegramOrderLinkOwnedByChat, telegramOrderCreatedMessage, telegramOrderStatusMessage, telegramOutboxFailureDisposition, telegramPrivateUpdate, telegramRequiresDeposit, telegramSecretMatches, telegramTrackingTokenForOrder, telegramUpdateIdValid, telegramWebhookDisposition } from "../src/routes/telegram";
import { localeOf, t } from "../src/lib/telegram-localization";
import { consumeTelegramLinkChallenge, createTelegramLinkChallenge, hashTelegramLinkToken, TelegramLinkChallengeError, TelegramLinkConflictError } from "../src/lib/telegram-link";
import { AdminTelegramLinkChallengeError, consumeAdminTelegramLinkChallenge, createAdminTelegramLinkChallenge } from "../src/lib/admin-telegram-link";
import { buildCreatePayload, buildQuoteByReceivePayload, buildQuotePayload, buildTelegramConvertOptions, filterConvertTargets, filterManualSourceOptions, filterManualTargets, filterTelegramRouteOptions, nextRequiredField, nextSourceAmountForReceiveTarget, shouldAskDestination, telegramAssetNetworkKey, telegramCallbackIndexes, telegramFieldSkipIndex, toggleTelegramManualSwapAddonSelection, withoutTelegramRefundFields } from "../src/lib/telegram-wizard";
import { adminEmailEventEnabled, adminTelegramEventEnabled, customerEmailEventEnabled } from "../src/lib/notification-policy";
import { normalizeRefundFields } from "../src/lib/manual-wallet-validation";
import { manualProjection, quickexProjection, telegramAccountLinkRelativeUrl, validateTelegramMiniAppInitData, verifyTelegramMiniAppSession } from "../src/routes/telegram-mini-app";
import { enqueueSwapTelegramNotification, formatSwapTelegramNotification } from "../src/lib/telegram-swap-notifications";
import { buildCustomerStatusNotificationContent, resolveCompletedReviewUrl } from "../src/lib/customer-status-notifications";
import { adminTelegramTestFailureReason, telegramHealthReport, validateNotificationTemplateVariables } from "../src/routes/notification-settings";
import { sanitizeTelegramFailureReason, TelegramApiError, validateTelegramBotIdentity } from "../src/lib/telegram-api";
import {
  convertTelegramMilestoneKinds,
  convertTelegramStatusLabel,
  formatConvertTelegramNotification,
} from "../src/lib/telegram-convert-notifications";
import { updateOrderAndQueueStatusNotification } from "../src/lib/customer-status-notifications";
import { signOrderTrackingToken, verifyOrderTrackingToken } from "../src/lib/order-access";

test("Telegram Mini App Convert projection exposes only persisted provider deposit instructions", () => {
  const projected = quickexProjection({
    legacyOrderId: "QX-test",
    route: { fromAsset: "USDT", fromNetwork: "TRC20", toAsset: "BTC", toNetwork: "Bitcoin" },
    amounts: { amount: "25.000000", receiveAmount: "0.001" },
    addresses: {
      destinationAddress: "customer-destination",
      destinationMemo: "",
      refundAddress: "",
      refundMemo: "",
      depositAddress: "provider-deposit",
      depositMemo: "memo-42",
      depositQrData: "bitcoin:provider-deposit?amount=25",
      settlementDetails: { accountReference: "REF-42" },
    },
    status: "awaiting funds",
    outcomeUnknown: false,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  } as never, {
    orderId: "QX-test",
    orderKind: "convert",
    trackingToken: "signed-tracking-token",
  } as never);
  assert.equal(projected.depositAsset, "USDT");
  assert.equal(projected.depositNetwork, "TRC20");
  assert.equal(projected.depositAmount, "25.000000");
  assert.equal(projected.depositAddress, "provider-deposit");
  assert.equal(projected.depositMemo, "memo-42");
  assert.equal(projected.depositQrData, "bitcoin:provider-deposit?amount=25");
  assert.equal(projected.depositStatus, "awaiting funds");
  assert.deepEqual(projected.settlementDetails, { accountReference: "REF-42" });
});

test("Telegram Mini App Manual Swap projection exposes only validated saved fee snapshots", () => {
  const manualSwapFees = {
    selectedAddons: [{
      id: "8ca90db0-5d87-4f17-96c2-5102720b936f",
      key: "priority",
      name: "Priority processing",
      amount: "1",
      currency: "USD",
      targetAmount: "1",
    }],
    addonFee: "1",
    exchangeFee: {
      enabled: false,
      percentage: null,
      fixedAmount: null,
      fixedCurrency: "USD",
      percentageAmount: "0",
      fixedTargetAmount: "0",
      totalAmount: "0",
    },
    totalAdditionalFee: "1",
    existingPricingFee: "0",
    totalFees: "1",
    referenceLegs: [],
  };
  const row = {
    id: "manual-order",
    type: "manual",
    status: "pending",
    fromAsset: "USD",
    fromNetwork: "USD",
    sourceSettlementOptionId: "source",
    toAsset: "BTC",
    toNetwork: "Bitcoin",
    targetSettlementOptionId: "target",
    amount: "10",
    receiveAmount: "9",
    trackingToken: "tracking",
    settlementSnapshot: { source: { kind: "fiat-payment-method" }, target: { kind: "crypto-network" } },
    pricingSnapshot: { manualSwapFees },
    paymentDetails: null,
    customerMarkedPaidAt: null,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    outcomeUnknown: false,
    manualSettlementState: "awaiting_customer",
    fundingStatus: "provisioning",
    fundingProviderSource: "manual",
    depositAddress: null,
    depositMemo: null,
    settlementDetails: null,
    customerSafeNote: null,
  } as never;
  const link = {
    orderId: "manual-order",
    orderKind: "manual",
    trackingToken: "verified-owner-tracking-token",
  } as never;
  const projection = manualProjection(row, link);
  assert.deepEqual(projection.manualSwapFees, manualSwapFees);

  const invalidSnapshot = manualProjection({
    ...row,
    pricingSnapshot: { manualSwapFees: { ...manualSwapFees, addonFee: "-1" } },
  } as never, link);
  assert.equal(invalidSnapshot.manualSwapFees, undefined);
});

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

test("Notification templates allow only safe variables and escape rendered values", () => {
  assert.doesNotThrow(() => validateNotificationTemplateVariables("Hello {{customerName}} {{orderId}}"));
  assert.throws(() => validateNotificationTemplateVariables("{{unknownSecret}}"), /Unsupported template variable/);
  const content = buildCustomerStatusNotificationContent({
    eventId: "template-test",
    customerClerkUserId: "guest:test",
    recipientEmail: "customer@example.test",
    orderId: "QX-<unsafe>",
    fromStatus: "processing",
    status: "processing",
    fromAsset: "USDT",
    fromNetwork: "TRC20",
    toAsset: "EUR",
    toNetwork: "SEPA",
    amount: "1",
    receiveAmount: "0.9",
    receiveMethod: "SEPA",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    eventKind: "processing",
    trustpilotUrl: "https://trustpilot.test/review",
    template: {
      subject: "Order {{orderId}}",
      heading: "Hello {{customerName}}",
      message: "Status {{status}}",
      buttonText: "View {{orderId}}",
      footerText: "Footer",
    },
  });
  assert.match(content.html, /QX-&lt;unsafe&gt;/);
  assert.doesNotMatch(content.html, /trustpilot\.test/);
});

test("Customer lifecycle emails render premium event-specific content from safe order data", () => {
  const previousPublicAppUrl = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://quickchange.exchange";
  const baseNotification = {
    eventId: "email-render-test",
    customerClerkUserId: "user_email_render_test",
    recipientEmail: "customer@example.test",
    customerName: "Amina",
    orderId: "QX-EMAIL-001",
    fromStatus: "pending",
    status: "pending",
    fromAsset: "USDT",
    fromNetwork: "TRC20",
    toAsset: "EUR",
    toNetwork: "",
    amount: "250.00",
    receiveAmount: "229.50",
    paymentMethod: "Crypto wallet",
    receiveMethod: "SEPA transfer",
    orderType: "manual",
    createdAt: new Date("2026-09-21T12:00:00.000Z"),
    socialLinks: [
      { name: "X", href: "https://x.com/quickxchange" },
      { name: "Telegram", href: "javascript:alert(1)" },
    ],
  };

  try {
    const created = buildCustomerStatusNotificationContent({
      ...baseNotification,
      eventKind: "order_created",
    });
    assert.match(created.html, /Hello Amina/);
    assert.match(created.html, /Awaiting payment/);
    assert.match(created.html, /Manual Swap/);
    assert.match(created.html, /within the given time/);
    assert.match(created.html, /https:\/\/x\.com\/quickxchange/);
    assert.doesNotMatch(created.html, /javascript:/);

    const payment = buildCustomerStatusNotificationContent({
      ...baseNotification,
      eventKind: "payment_received",
      fromStatus: "pending",
      status: "processing",
      transactionHash: "0x1234567890abcdef1234567890abcdef",
      confirmations: 12,
      confirmationsRequired: 12,
    });
    assert.match(payment.html, /Payment Received/);
    assert.match(payment.html, /You Sent/);
    assert.match(payment.html, /0x1234567890abcdef1234567890abcdef/);
    assert.match(payment.html, /12 \/ 12/);
    assert.doesNotMatch(payment.html, /Received at/);
    assert.match(payment.text, /0x1234567890abcdef1234567890abcdef/);

    const completed = buildCustomerStatusNotificationContent({
      ...baseNotification,
      eventKind: "completed",
      fromStatus: "processing",
      status: "completed",
      completedAt: new Date("2026-09-21T12:15:00.000Z"),
      paymentReference: "SEPA-REF-123",
      trustpilotUrl: "https://www.trustpilot.com/evaluate/quickchange.exchange",
    });
    assert.match(completed.html, /You Received/);
    assert.match(completed.html, /SEPA-REF-123/);
    assert.match(completed.html, /Download PDF/);
    assert.match(completed.html, /invoice=1/);
    assert.match(completed.html, /account\/orders\/QX-EMAIL-001\?invoice=1/);
    assert.match(completed.html, /Rate your experience on Trustpilot/);
    assert.match(completed.html, /quickxchange-header-light\.png/);
    assert.match(completed.html, /quickxchange-header-dark\.png/);
    assert.doesNotMatch(payment.html, /Rate your experience on Trustpilot/);
    const notDone = buildCustomerStatusNotificationContent({
      ...baseNotification,
      eventKind: "completed",
      status: "processing",
      completedAt: new Date("2026-09-21T12:15:00.000Z"),
      trustpilotUrl: "https://www.trustpilot.com/evaluate/quickchange.exchange",
    });
    assert.doesNotMatch(notDone.html, /Rate your experience on Trustpilot/);
    assert.doesNotMatch(notDone.html, /Download PDF/);
  } finally {
    if (previousPublicAppUrl === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = previousPublicAppUrl;
    }
  }
});

test("Convert lifecycle emails use Quickex data without Swap settlement claims", () => {
  const previousPublicAppUrl = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://quickchange.exchange";
  try {
    const completed = buildCustomerStatusNotificationContent({
      eventId: "convert-email-render-test",
      customerClerkUserId: "guest:convert@example.test",
      recipientEmail: "convert@example.test",
      customerName: "Amina",
      orderId: "QX-00000000-0000-4000-8000-000000000001",
      fromStatus: "processing",
      status: "completed",
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "1.25",
      receiveAmount: "99",
      createdAt: new Date("2026-09-21T12:00:00.000Z"),
      completedAt: new Date("2026-09-21T12:15:00.000Z"),
      eventKind: "completed",
      orderType: "convert",
      paymentReference: "quickex-reference-800",
      trustpilotUrl: "https://www.trustpilot.com/evaluate/quickchange.exchange",
    });
    assert.match(completed.html, /Exchange Completed/);
    assert.match(completed.html, /Convert/);
    assert.match(completed.html, /1\.25 BTC/);
    assert.match(completed.html, /99 USDT/);
    assert.doesNotMatch(completed.html, /100 USDT/);
    assert.match(completed.html, /Bitcoin/);
    assert.match(completed.html, /TRC20/);
    assert.match(completed.html, /quickex-reference-800/);
    assert.match(completed.html, /invoice=1/);
    assert.match(completed.html, /trackingToken=[^"&]+&amp;invoice=1/);
    assert.match(completed.html, /Rate your experience on Trustpilot/);
    assert.doesNotMatch(completed.html, /Confirmations/);
    assert.doesNotMatch(completed.html, /Transaction Hash/);
  } finally {
    if (previousPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousPublicAppUrl;
  }
});

test("completed reviews prefer published Trustpilot content and reject untrusted links", () => {
  const publication = {
    socialTrust: { items: [
      { name: "Trustpilot", enabled: true, removedAt: null, href: "https://www.trustpilot.com/evaluate/published" },
      { name: "Trustpilot", enabled: false, removedAt: null, href: "https://www.trustpilot.com/evaluate/disabled" },
    ] },
    partnerLogos: [
      { name: "Trustpilot", enabled: true, removedAt: null, link: "https://www.trustpilot.com/evaluate/partner" },
    ],
  } as unknown as Parameters<typeof resolveCompletedReviewUrl>[0];
  assert.equal(resolveCompletedReviewUrl(publication, "https://www.trustpilot.com/evaluate/settings"),
    "https://www.trustpilot.com/evaluate/published");
  assert.equal(resolveCompletedReviewUrl({ ...publication!, socialTrust: null },
    "https://www.trustpilot.com/evaluate/settings"), "https://www.trustpilot.com/evaluate/settings");
  assert.equal(resolveCompletedReviewUrl({ ...publication!, socialTrust: null },
    "https://example.com/redirect"), "https://www.trustpilot.com/evaluate/partner");
  assert.equal(resolveCompletedReviewUrl(null, "https://trustpilot.com.evil.example/review"), "");
});

test("Admin and customer notification channel gates remain independent", () => {
  const settings = {
    adminNotificationsEnabled: true,
    adminEmailEnabled: true,
    emailEnabled: true,
    telegramEnabled: true,
    adminEmailOrderCreatedEnabled: false,
    adminEmailPaymentReceivedEnabled: true,
    adminEmailProcessingEnabled: true,
    adminEmailCompletedEnabled: true,
    adminEmailFailedCancelledEnabled: true,
    adminTelegramOrderCreatedEnabled: false,
    adminTelegramPaymentReceivedEnabled: false,
    adminTelegramProcessingEnabled: true,
    adminTelegramCompletedEnabled: true,
    adminTelegramFailedCancelledEnabled: true,
    customerEmailOrderCreatedEnabled: true,
    customerEmailPaymentReceivedEnabled: true,
    customerEmailProcessingEnabled: false,
    customerEmailCompletedEnabled: true,
    customerEmailFailedCancelledEnabled: true,
  } as Parameters<typeof adminEmailEventEnabled>[0];

  assert.equal(adminEmailEventEnabled(settings, "payment_received"), true);
  assert.equal(adminTelegramEventEnabled(settings, "payment_received"), false);
  assert.equal(customerEmailEventEnabled(settings, "processing"), false);
  assert.equal(customerEmailEventEnabled(settings, "payment_received"), true);
  assert.equal(adminEmailEventEnabled({ ...settings, adminNotificationsEnabled: false }, "payment_received"), false);
  assert.equal(customerEmailEventEnabled({ ...settings, adminNotificationsEnabled: false }, "payment_received"), true);
});

test("Admin Telegram links are one-time and bind the verified private chat identity", async () => {
  const ownerId = `owner-${randomUUID()}`;
  const chatId = `admin-chat-${randomUUID()}`;
  const [original] = await db.select().from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, "global"))
    .limit(1);
  if (!original) {
    await db.insert(notificationSettingsTable).values({ id: "global" });
  }

  const challenge = await createAdminTelegramLinkChallenge(ownerId);
  try {
    const linked = await consumeAdminTelegramLinkChallenge(challenge.token, chatId, "admin_operator", async () => {});
    assert.equal(linked.adminTelegramChatId, chatId);
    assert.equal(linked.adminTelegramUsername, "admin_operator");
    assert.equal(linked.telegramEnabled, true);
    await assert.rejects(
      () => consumeAdminTelegramLinkChallenge(challenge.token, "other-chat", "other_operator"),
      AdminTelegramLinkChallengeError,
    );
  } finally {
    await db.delete(adminTelegramLinkChallengesTable)
      .where(eq(adminTelegramLinkChallengesTable.createdBy, ownerId));
    if (original) {
      await db.update(notificationSettingsTable).set({
        emailEnabled: original.emailEnabled,
        telegramEnabled: original.telegramEnabled,
        paymentReceivedEnabled: original.paymentReceivedEnabled,
        processingEnabled: original.processingEnabled,
        completedEnabled: original.completedEnabled,
        failedCancelledEnabled: original.failedCancelledEnabled,
        adminNotificationEmail: original.adminNotificationEmail,
        adminNotificationPhone: original.adminNotificationPhone,
        adminTelegramChatId: original.adminTelegramChatId,
        adminTelegramUsername: original.adminTelegramUsername,
        trustpilotReviewUrl: original.trustpilotReviewUrl,
        updatedBy: original.updatedBy,
        updatedAt: original.updatedAt,
      }).where(eq(notificationSettingsTable.id, "global"));
    }
  }
});

test("Admin Telegram link identity uses Telegram getMe username and rejects a mismatched configured bot", () => {
  assert.deepEqual(validateTelegramBotIdentity({
    id: 123456,
    is_bot: true,
    username: "ActualQuickXBot",
  }, "ActualQuickXBot"), {
    id: 123456,
    is_bot: true,
    username: "ActualQuickXBot",
  });
  assert.throws(() => validateTelegramBotIdentity({
    id: 123456,
    is_bot: true,
    username: "DifferentQuickXBot",
  }, "ActualQuickXBot"), /does not match TELEGRAM_BOT_USERNAME/);
  assert.throws(() => validateTelegramBotIdentity({ id: 123456, is_bot: false, username: "not_a_bot" }), /invalid bot identity/);
});

test("Admin Telegram challenge remains pending when the private-chat delivery handshake fails", async () => {
  const ownerId = `owner-handshake-${randomUUID()}`;
  const privateChatId = `private-${randomUUID()}`;
  const [original] = await db.select().from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, "global"))
    .limit(1);
  if (!original) await db.insert(notificationSettingsTable).values({ id: "global" });
  const challenge = await createAdminTelegramLinkChallenge(ownerId);
  let sendAttempts = 0;
  try {
    await assert.rejects(() => consumeAdminTelegramLinkChallenge(
      challenge.token,
      privateChatId,
      "owner_user",
      async () => {
        sendAttempts += 1;
        throw new Error("Telegram send was rejected");
      },
    ), /Telegram send was rejected/);
    const [pending] = await db.select().from(adminTelegramLinkChallengesTable)
      .where(eq(adminTelegramLinkChallengesTable.id, challenge.id)).limit(1);
    const [settings] = await db.select().from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.id, "global")).limit(1);
    assert.equal(pending?.consumedAt, null);
    assert.equal(pending?.connectedChatId, null);
    assert.notEqual(settings?.adminTelegramChatId, privateChatId);
    assert.equal(sendAttempts, 1);

    let invalidLinkSendAttempts = 0;
    await assert.rejects(() => consumeAdminTelegramLinkChallenge(
      "not-a-valid-token",
      privateChatId,
      "owner_user",
      async () => { invalidLinkSendAttempts += 1; },
    ), AdminTelegramLinkChallengeError);
    assert.equal(invalidLinkSendAttempts, 0);
  } finally {
    await db.delete(adminTelegramLinkChallengesTable)
      .where(eq(adminTelegramLinkChallengesTable.createdBy, ownerId));
    if (original) {
      await db.update(notificationSettingsTable).set({
        adminTelegramChatId: original.adminTelegramChatId,
        adminTelegramUsername: original.adminTelegramUsername,
        telegramEnabled: original.telegramEnabled,
      }).where(eq(notificationSettingsTable.id, "global"));
    } else {
      await db.delete(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global"));
    }
  }
});

test("Admin Telegram test delivery exposes only the exact safe Telegram provider reason", () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "123456:secret-token-for-test";
  try {
    const error = new TelegramApiError("sendMessage", "Forbidden: bot was blocked by the user");
    assert.equal(adminTelegramTestFailureReason(error), "Forbidden: bot was blocked by the user");
    assert.equal(
      sanitizeTelegramFailureReason(new Error("request https://api.telegram.org/bot123456:secret-token-for-test/sendMessage")),
      "request [url]",
    );
  } finally {
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
  }
});

test("Owner Telegram health projection reports expected webhook health without chat IDs or tokens", () => {
  const matching = telegramHealthReport(true, "ActualQuickXBot", "https://quickchange.exchange/api/telegram/webhook", null);
  assert.equal(matching.webhookUrlMatchesExpected, true);
  assert.equal(matching.botUsername, "ActualQuickXBot");
  assert.equal("chatId" in matching, false);
  assert.equal(JSON.stringify(matching).includes("secret-token"), false);
  const mismatch = telegramHealthReport(true, "ActualQuickXBot", "https://wrong.example/telegram/webhook", "Webhook delivery failed");
  assert.equal(mismatch.webhookUrlMatchesExpected, false);
  assert.equal(mismatch.lastWebhookError, "Webhook delivery failed");
  const unconfigured = telegramHealthReport(false, null, undefined, null, "Telegram bot is not configured.");
  assert.equal(unconfigured.webhookUrlMatchesExpected, false);
  assert.equal(unconfigured.botIdentityError, "Telegram bot is not configured.");
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

test("Telegram Swap and Convert use canonical reverse-quote contracts and frozen create identities", () => {
  const source = { id: "canonical-source", assetCode: "BTC", routeNetwork: "Bitcoin", kind: "crypto-network" };
  const target = { id: "canonical-target", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network" };
  assert.deepEqual(buildQuoteByReceivePayload("swap", source, target, 250), {
    fromAsset: "BTC",
    fromNetwork: "Bitcoin",
    toAsset: "USDT",
    toNetwork: "TRC20",
    sourceSettlementOptionId: "canonical-source",
    targetSettlementOptionId: "canonical-target",
    desiredReceiveAmount: 250,
    rateMode: "FLOATING",
  });
  assert.deepEqual(buildQuoteByReceivePayload("convert", source, target, 250), {
    fromAsset: "BTC",
    fromNetwork: "Bitcoin",
    toAsset: "USDT",
    toNetwork: "TRC20",
    desiredReceiveAmount: 250,
    rateMode: "FLOATING",
  });

  const clientRequestId = randomUUID();
  const data = { amount: 1.25, email: "customer@example.test", clientRequestId, quote: { quoteId: "canonical-quote" } };
  const swapCreate = buildCreatePayload("swap", source, target, data);
  const convertCreate = buildCreatePayload("convert", source, target, data);
  assert.equal(swapCreate.type, "manual");
  assert.equal(convertCreate.type, "instant");
  assert.equal(swapCreate.clientRequestId, clientRequestId);
  assert.equal(convertCreate.clientRequestId, clientRequestId);
  assert.deepEqual(
    buildCreatePayload("convert", source, target, data),
    convertCreate,
    "retries reuse the frozen request identity and canonical quote",
  );
});

test("Telegram quote and create contracts preserve rate modes, settlement keys, and add-on selections", () => {
  const source = { id: "canonical-source", assetCode: "BTC", routeNetwork: "Bitcoin", kind: "crypto-network" };
  const target = { id: "canonical-target", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network" };
  const selectedAddOnKeys = ["priority", "insurance"];
  assert.deepEqual(
    buildQuotePayload("swap", source, target, 2, "FLOATING", selectedAddOnKeys),
    {
      type: "manual",
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      sourceSettlementOptionId: "canonical-source",
      targetSettlementOptionId: "canonical-target",
      amount: 2,
      rateMode: "FLOATING",
      selectedAddOnKeys,
    },
  );
  assert.deepEqual(
    buildQuoteByReceivePayload("swap", source, target, 25, "FLOATING", selectedAddOnKeys),
    {
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      sourceSettlementOptionId: "canonical-source",
      targetSettlementOptionId: "canonical-target",
      selectedAddOnKeys,
      desiredReceiveAmount: 25,
      rateMode: "FLOATING",
    },
  );
  assert.deepEqual(
    buildQuotePayload("convert", source, target, 2, "FIXED"),
    {
      type: "instant",
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      sourceSettlementOptionId: "canonical-source",
      targetSettlementOptionId: "canonical-target",
      amount: 2,
      rateMode: "FIXED",
    },
  );

  const fields = [
    { key: "beneficiary_count", type: "integer" },
    { key: "transfer_amount", type: "decimal" },
    { key: "fee_percent", type: "number" },
    { key: "bank_name", type: "short-text" },
  ];
  const convertCreate = buildCreatePayload("convert", source, target, {
    amount: 2,
    email: "convert@example.test",
    destinationAddress: "provider-destination",
    destinationMemo: "provider-memo",
    clientRequestId: "convert-request",
    rateMode: "FIXED",
    quote: { quoteId: "convert-quote", rateMode: "FIXED", requiredSettlementFields: fields },
    fields,
    values: { beneficiary_count: "4", transfer_amount: "12.50", fee_percent: "1.25", bank_name: "Example Bank" },
  });
  assert.equal(convertCreate.destinationAddress, "provider-destination");
  assert.equal(convertCreate.destinationMemo, "provider-memo");
  assert.deepEqual(convertCreate.settlementDetails, {
    beneficiary_count: 4,
    transfer_amount: 12.5,
    fee_percent: 1.25,
    bank_name: "Example Bank",
  });
  assert.deepEqual(
    [convertCreate.fromAsset, convertCreate.fromNetwork, convertCreate.toAsset, convertCreate.toNetwork],
    ["BTC", "Bitcoin", "USDT", "TRC20"],
  );
  assert.equal("sourceSettlementOptionId" in convertCreate, false);
  assert.equal("targetSettlementOptionId" in convertCreate, false);
  assert.equal(convertCreate.rateMode, "FIXED");
  assert.equal("selectedAddOnKeys" in convertCreate, false);

  const manualCreate = buildCreatePayload("swap", source, target, {
    amount: 2,
    email: "swap@example.test",
    clientRequestId: "swap-request",
    rateMode: "FLOATING",
    selectedAddOnKeys,
    quote: { quoteId: "manual-quote", rateMode: "FLOATING", requiredSettlementFields: fields },
    fields,
    values: { beneficiary_count: "4", transfer_amount: "12.50", fee_percent: "1.25", bank_name: "Example Bank" },
  });
  assert.deepEqual(manualCreate.settlementDetails, {
    beneficiary_count: 4,
    transfer_amount: 12.5,
    fee_percent: 1.25,
    bank_name: "Example Bank",
  });
  assert.deepEqual(manualCreate.selectedAddOnKeys, selectedAddOnKeys);
  assert.equal(manualCreate.sourceSettlementOptionId, source.id);
  assert.equal(manualCreate.targetSettlementOptionId, target.id);
  assert.equal(manualCreate.rateMode, "FLOATING");
});

test("Telegram Manual Swap add-on selection follows public group selection rules", () => {
  const addons = [
    { key: "priority", name: "Priority", selectionRule: "one" as const, presentation: { group: "speed" } },
    { key: "express", name: "Express", selectionRule: "one" as const, presentation: { group: "speed" } },
    { key: "standard", name: "Standard", selectionRule: "multiple" as const, presentation: { group: "speed" } },
    { key: "cover", name: "Cover", selectionRule: "multiple" as const, presentation: { group: "extras" } },
    { key: "gift", name: "Gift", selectionRule: "multiple" as const, presentation: { group: "extras" } },
    { key: "disabled", name: "Disabled", selectionRule: "none" as const, presentation: { group: "extras" } },
  ];
  assert.deepEqual(toggleTelegramManualSwapAddonSelection([], "priority", addons), ["priority"]);
  assert.deepEqual(toggleTelegramManualSwapAddonSelection(["priority"], "express", addons), ["express"]);
  assert.deepEqual(toggleTelegramManualSwapAddonSelection(["standard"], "cover", addons), ["standard", "cover"]);
  assert.deepEqual(toggleTelegramManualSwapAddonSelection(["priority"], "standard", addons), ["standard"]);
  assert.deepEqual(toggleTelegramManualSwapAddonSelection(["cover"], "gift", addons), ["cover", "gift"]);
  assert.deepEqual(toggleTelegramManualSwapAddonSelection(["cover"], "disabled", addons), ["cover"]);
});

test("Telegram order tracking callbacks are canonical, scoped, and safely parse legacy buttons", () => {
  const callback = telegramOrderCallbackData("QX-123/abc");
  assert.ok(callback);
  assert.deepEqual(parseTelegramOrderCallback(callback), { orderId: "QX-123/abc" });
  assert.deepEqual(parseTelegramOrderCallback("order:0"), { legacyIndex: 0 });
  assert.deepEqual(parseTelegramOrderCallback("order:12"), { legacyIndex: 12 });
  assert.equal(parseTelegramOrderCallback("order:-1"), undefined);
  assert.equal(parseTelegramOrderCallback("order:1:extra"), undefined);
  assert.equal(parseTelegramOrderCallback("order:id:bad==="), undefined);
  assert.equal(telegramOrderCallbackData("x".repeat(100)), undefined);
  assert.equal(
    telegramOrderLinkOwnedByChat({ chatId: "private-chat", orderId: "QX-123" }, "private-chat", "QX-123"),
    true,
  );
  assert.equal(
    telegramOrderLinkOwnedByChat({ chatId: "another-chat", orderId: "QX-123" }, "private-chat", "QX-123"),
    false,
  );
  assert.equal(
    telegramOrderLinkOwnedByChat({ chatId: "private-chat", orderId: "other-order" }, "private-chat", "QX-123"),
    false,
  );
  assert.equal(telegramOrderLinkOwnedByChat(undefined, "private-chat", "QX-123"), false);
});

test("Telegram successful order creation repairs an empty tracking capability without changing a valid one", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "telegram-test-session-secret";
  try {
    const repaired = telegramTrackingTokenForOrder("QX-track-1", "");
    assert.ok(repaired);
    assert.equal(verifyOrderTrackingToken(repaired, "QX-track-1"), true);
    assert.equal(verifyOrderTrackingToken(repaired, "QX-track-2"), false);
    const creationNotice = telegramCreationOutboxPayload(
      "QX-track-1",
      "convert",
      { status: "awaiting", statusVersion: 1 },
      repaired,
      true,
    );
    assert.equal(creationNotice.trackingToken, repaired);
    const existing = signOrderTrackingToken("QX-track-1");
    assert.equal(telegramTrackingTokenForOrder("QX-track-1", ` ${existing} `), existing);
    assert.notEqual(telegramTrackingTokenForOrder("QX-track-1", "invalid-capability"), "invalid-capability");
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
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
  assert.equal(nextRequiredField(fields, 1, { method: "cash" }), -1);
  assert.equal(nextRequiredField(fields, 1, { method: "bank" }), 1);
});

test("Telegram Convert keeps canonical API settlement capability IDs", () => {
  const options = buildTelegramConvertOptions([
    { slug: "btc-bitcoin", currencyTitle: "BTC", networkTitle: "Bitcoin", instrumentType: "crypto", fullName: "Bitcoin" },
  ], [
    { fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "BTC", toNetwork: "Bitcoin" },
  ], [
    {
      id: "api:quickex:btc-bitcoin",
      assetCode: "BTC",
      routeNetwork: "Bitcoin",
      kind: "crypto-network",
      direction: "both",
      executionMode: "api",
    },
  ]);
  assert.equal(options[0]?.id, "api:quickex:btc-bitcoin");
});

test("Telegram route filtering preserves receive-only options without cross-products", () => {
  const source = { id: "s", assetCode: "BTC", routeNetwork: "BTC", kind: "crypto-network", direction: "send" };
  const receiveOnly = { id: "r", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network", direction: "receive" };
  const unrelated = { id: "x", assetCode: "ETH", routeNetwork: "ETH", kind: "crypto-network", direction: "receive" };
  assert.deepEqual(filterManualTargets([source, receiveOnly, unrelated], [{ sourceSettlementOptionId: "s", targetSettlementOptionId: "r" }], "s").map(x => x.id), ["r"]);
  assert.deepEqual(filterConvertTargets([source, receiveOnly, unrelated], [{ fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "TRC20" }], source).map(x => x.id), ["r"]);
});

test("Telegram Convert preserves same-symbol networks and normalizes exact route keys", () => {
  const source = { id: "btc-mainnet", assetCode: " BTC ", routeNetwork: "bitcoin", kind: "crypto-network", direction: "send" };
  const options = [
    source,
    { id: "usdt-trc20", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network", direction: "receive" },
    { id: "usdt-erc20", assetCode: "usdt", routeNetwork: " erc20 ", kind: "crypto-network", direction: "receive" },
    { id: "usdt-ton", assetCode: "USDT", routeNetwork: "TON", kind: "crypto-network", direction: "receive" },
  ];
  const pairs = [
    { fromAsset: "btc", fromNetwork: " BITCOIN ", toAsset: " usdt ", toNetwork: "trc20" },
    { fromAsset: "BTC", fromNetwork: "bitcoin", toAsset: "USDT", toNetwork: "ERC20" },
  ];

  assert.equal(telegramAssetNetworkKey(" usdt ", "trc20"), "USDT\0TRC20");
  assert.deepEqual(
    filterConvertTargets(options, pairs, source).map(option => option.id),
    ["usdt-trc20", "usdt-erc20"],
  );
});

test("Telegram Convert builds executable options from the Quickex catalog", () => {
  const options = buildTelegramConvertOptions([
    { slug: "btc-bitcoin", currencyTitle: "BTC", networkTitle: "Bitcoin", instrumentType: "crypto", fullName: "Bitcoin", requiresMemo: false },
    { slug: "usdt-trc20", currencyTitle: "USDT", networkTitle: "TRC20", instrumentType: "crypto", fullName: "Tether", requiresMemo: true },
    { slug: "orphan", currencyTitle: "ORPHAN", networkTitle: "NONE", instrumentType: "crypto", fullName: "Orphan" },
    { slug: "fiat", currencyTitle: "EUR", networkTitle: "SEPA", instrumentType: "fiat", fullName: "Euro" },
  ], [
    { fromAsset: "BTC", fromNetwork: "BITCOIN", toAsset: "USDT", toNetwork: "TRC20" },
  ]);

  assert.deepEqual(options.map(option => option.id), ["quickex:btc-bitcoin", "quickex:usdt-trc20"]);
  assert.equal(options[1]?.requiresMemo, true);
  assert.deepEqual(
    filterConvertTargets(options, [{ fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20" }], options[0]!).map(option => option.id),
    ["quickex:usdt-trc20"],
  );
});

test("Telegram Swap sources match executable website routes", () => {
  const options = [
    { id: "usdt-trc20", assetCode: "USDT", routeNetwork: "TRC20", kind: "crypto-network", lifecycle: "active", direction: "send" },
    { id: "usdt-bep20", assetCode: "USDT", routeNetwork: "BEP20", kind: "crypto-network", lifecycle: "active", direction: "both" },
    { id: "usdt-disabled", assetCode: "USDT", routeNetwork: "ERC20", kind: "crypto-network", lifecycle: "disabled", direction: "send" },
    { id: "eur-sepa", assetCode: "EUR", routeNetwork: "SEPA", kind: "fiat-payment-method", lifecycle: "active", direction: "send" },
    { id: "usd-wire", assetCode: "USD", routeNetwork: "WIRE", kind: "fiat-payment-method", lifecycle: "active", direction: "send" },
  ];
  const routes = [
    { sourceSettlementOptionId: "usdt-trc20" },
    { sourceSettlementOptionId: "usdt-bep20" },
    { sourceSettlementOptionId: "eur-sepa" },
  ];
  assert.deepEqual(
    filterManualSourceOptions(options, routes).map(option => option.id),
    ["usdt-trc20", "usdt-bep20", "eur-sepa"],
  );
});

test("Telegram optional-field Skip callback resolves the clicked field index", () => {
  assert.equal(telegramFieldSkipIndex("fieldskip:0"), 0);
  assert.equal(telegramFieldSkipIndex("fieldskip:12"), 12);
  assert.equal(telegramFieldSkipIndex("fieldskip:"), undefined);
  assert.equal(telegramFieldSkipIndex("fieldskip:-1"), undefined);
  assert.equal(telegramFieldSkipIndex("fieldskip:2:3"), undefined);
  assert.deepEqual(telegramCallbackIndexes("fieldopt:0:12", "fieldopt", 2), [0, 12]);
  assert.deepEqual(telegramCallbackIndexes("srcpage:3", "srcpage"), [3]);
  assert.equal(telegramCallbackIndexes("fieldopt:0:2:3", "fieldopt", 2), undefined);
  assert.equal(telegramCallbackIndexes("fieldopt:01:2", "fieldopt", 2), undefined);
  assert.equal(telegramCallbackIndexes("fieldopt:9007199254740992:2", "fieldopt", 2), undefined);
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

test("unresolved Telegram creates block session-replacing commands and callbacks", () => {
  const clientRequestId = "frozen-create-request";
  const session = {
    state: "processing",
    data: { clientRequestId, frozenCreateBody: { clientRequestId } },
  };
  const replacingActions = [
    "/exchange",
    "/convert",
    "/track",
    "mode:swap",
    "mode:convert",
    "track",
    "cancel",
    "retry:create",
  ];

  for (const pendingState of ["processing", "reconciling"]) {
    session.state = pendingState;
    for (const action of replacingActions) {
      assert.equal(telegramCreateActionBlocked(session.state, action), true, `${pendingState} blocks ${action}`);
      assert.equal(session.data.clientRequestId, clientRequestId);
      assert.equal(session.data.frozenCreateBody.clientRequestId, clientRequestId);
    }
  }

  for (const finalState of ["idle", "review", "expired"]) {
    assert.equal(telegramCreateActionBlocked(finalState, "/exchange"), false);
    assert.equal(telegramCreateActionBlocked(finalState, "cancel"), false);
  }
  assert.equal(telegramCreateActionBlocked("processing", "/orders"), false);
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
  assert.equal(telegramCreatingOrderMessage(), "⏳ <b>Creating your order...</b>");
  const created = telegramOrderCreatedMessage("O<&123", "awaiting", "en", { address: "0x<&", memo: "42" });
  assert.match(created, /<b>Order ID<\/b>\n<code>O&lt;&amp;123<\/code>/);
  assert.match(created, /Deposit address: <code>0x&lt;&amp;<\/code>/);
  const status = telegramOrderStatusMessage("O<&123", "PROCESSING", "en");
  assert.match(status, /<b>Order ID<\/b>\n<code>O&lt;&amp;123<\/code>/);
  assert.match(status, /Status: <b>PROCESSING<\/b>/);
});

test("Required deposit provisioning never terminally fails, while Telegram errors do", () => {
  assert.equal(telegramOutboxFailureDisposition(new DepositInstructionsPending(), 100), "pending");
  assert.equal(telegramOutboxFailureDisposition(new Error("Telegram send failed"), 5), "failed");
  assert.equal(telegramOutboxFailureDisposition(new Error("Telegram send failed"), 4), "pending");
});

test("Swap Telegram payment and completion messages use stored event details", () => {
  const base = {
    orderId: "0996522166",
    status: "completed",
    sendAmount: "20",
    sendAsset: "USDT",
    sendMethod: "USDT",
    sendNetwork: "BEP20",
    receiveAmount: "18.75",
    receiveAsset: "EUR",
    receiveMethod: "SEPA",
    receiveNetwork: "",
  };
  const payment = formatSwapTelegramNotification({
    ...base,
    eventKind: "payment_received",
    receivedAmount: "20",
    receivedAsset: "USDT",
    receivedNetwork: "BEP20",
  });
  assert.match(payment, /Payment Received/);
  assert.match(payment, /<b>Order ID<\/b>\n<code>0996522166<\/code>/);
  assert.match(payment, /Received: <b>20 USDT<\/b>/);
  assert.match(payment, /Network: <b>BEP20<\/b>/);
  const verifiedTx = "0x174c2400abcdef0123456789abcdef0123456789abcdef0123456789fcb58c";
  const paymentWithTx = formatSwapTelegramNotification({
    ...base,
    eventKind: "payment_received",
    receivedAmount: "20",
    receivedAsset: "USDT",
    receivedNetwork: "BEP20",
    transactionHash: verifiedTx,
  });
  assert.match(paymentWithTx, new RegExp(`TxID: <code>${verifiedTx}</code>`));
  assert.doesNotMatch(payment, /TxID:/);
  assert.match(payment, /now being processed/);

  const completed = formatSwapTelegramNotification({
    ...base,
    eventKind: "completed",
  });
  assert.match(completed, /Done ✅/);
  assert.match(completed, /20 USDT \(BEP20\)/);
  assert.match(completed, /18\.75 SEPA/);
  assert.match(completed, /Status: <b>Done ✅<\/b>/);
});

test("Convert Telegram milestone messages use canonical status labels and stored details", () => {
  assert.deepEqual(convertTelegramMilestoneKinds("Completed"), ["payment_received", "completed"]);
  assert.deepEqual(convertTelegramMilestoneKinds("PROCESSING"), ["payment_received"]);
  assert.deepEqual(convertTelegramMilestoneKinds("failed"), []);
  assert.equal(convertTelegramStatusLabel("awaiting funds"), "AWAITING FUNDS");
  assert.equal(convertTelegramStatusLabel("processing"), "PROCESSING");
  assert.equal(convertTelegramStatusLabel("completed"), "DONE ✅");
  const payment = formatConvertTelegramNotification({
    eventKind: "payment_received",
    orderKind: "convert",
    orderId: "QX-123",
    status: "processing",
    sendAmount: "1.25",
    sendAsset: "BTC",
    sendNetwork: "Bitcoin",
    receiveAmount: "100",
    receiveAsset: "USDT",
    receiveNetwork: "TRC20",
    receivedAmount: "1.25",
    receivedAsset: "BTC",
    receivedNetwork: "Bitcoin",
  });
  assert.match(payment, /Payment Received/);
  assert.match(payment, /<b>Order ID<\/b>\n<code>QX-123<\/code>/);
  assert.match(payment, /Received: <b>1\.25 BTC<\/b>/);
  assert.match(payment, /Your conversion is now being processed/);
  const completed = formatConvertTelegramNotification({
    eventKind: "completed",
    orderKind: "convert",
    orderId: "QX-123",
    status: "completed",
    sendAmount: "1.25",
    sendAsset: "BTC",
    sendNetwork: "Bitcoin",
    receiveAmount: "100",
    receiveAsset: "USDT",
    receiveNetwork: "TRC20",
  });
  assert.match(completed, /1\.25 BTC \(Bitcoin\)/);
  assert.match(completed, /100 USDT \(TRC20\)/);
  assert.match(completed, /QuickXchange Convert order has been completed/);
  assert.match(completed, /<b>Order ID<\/b>\n<code>QX-123<\/code>/);
});

test("Manual Swap completion does not queue customer Telegram lifecycle notices", async () => {
  const id = `O${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const chatId = `92${Date.now()}`;
  await db.insert(ordersTable).values({
    id,
    type: "manual",
    status: "processing",
    manualSettlementState: "funds_confirmed",
    fromAsset: "USDT",
    fromNetwork: "BEP20",
    toAsset: "EUR",
    toNetwork: "SEPA",
    amount: "20",
    receiveAmount: "18.75",
    customerEmail: `${id}@example.test`,
    customerName: "Telegram completion",
    destinationAddress: "",
    destinationMemo: "",
    refundAddress: "",
    refundMemo: "",
    provider: "Manual desk",
    settlementSnapshot: {
      source: { kind: "crypto-network", title: "USDT", routeNetwork: "BEP20" },
      target: { kind: "fiat-payment-method", title: "SEPA" },
    },
  });
  await db.insert(telegramChatsTable).values({ chatId, userId: chatId, locale: "en" });
  await db.insert(telegramOrderLinksTable).values({
    chatId,
    orderId: id,
    orderKind: "swap",
    trackingToken: "completion-test-token",
  });

  try {
    const [current] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    const completed = await updateOrderAndQueueStatusNotification(current, {
      status: "completed",
      manualSettlementState: "completed",
      manualSettlementStateUpdatedAt: new Date(),
      manualSettlementPaidAt: new Date(),
    });
    assert.equal(completed?.status, "completed");

    const notices = await db.select().from(telegramNotificationOutboxTable)
      .where(eq(telegramNotificationOutboxTable.orderId, id));
    const customerLifecycleNotices = notices.filter((notice) =>
      notice.chatId === chatId &&
      ["payment_received", "processing", "completed", "failed_cancelled"].includes(notice.eventKind),
    );
    assert.deepEqual(customerLifecycleNotices, []);
    const customerStatusMarker = notices.find((notice) =>
      notice.chatId === chatId && notice.eventKind === "status",
    );
    assert.equal(customerStatusMarker?.deliveryStatus, "delivered");
  } finally {
    await db.delete(telegramNotificationOutboxTable)
      .where(eq(telegramNotificationOutboxTable.orderId, id));
    await db.delete(telegramOrderLinksTable)
      .where(eq(telegramOrderLinksTable.orderId, id));
    await db.delete(telegramChatsTable).where(eq(telegramChatsTable.chatId, chatId));
    await db.delete(affiliateCompletionEventsTable)
      .where(eq(affiliateCompletionEventsTable.aggregateId, id));
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
  }
});

test("Manual payment receipt is not queued as a customer Telegram lifecycle notice", async () => {
  const id = `O${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const chatId = `93${Date.now()}`;
  const txHash = "0xverified-observation-payment";
  await db.insert(ordersTable).values({
    id,
    type: "manual",
    status: "processing",
    manualSettlementState: "funds_confirmed",
    transactionHash: "0xeditable-order-field-must-be-ignored",
    fromAsset: "USDT",
    fromNetwork: "BEP20",
    toAsset: "EUR",
    toNetwork: "SEPA",
    amount: "20",
    receiveAmount: "18.75",
    customerEmail: `${id}@example.test`,
    destinationAddress: "",
    destinationMemo: "",
    refundAddress: "",
    refundMemo: "",
    provider: "Manual desk",
  });
  await db.insert(telegramChatsTable).values({ chatId, userId: chatId, locale: "en" });
  await db.insert(telegramOrderLinksTable).values({ chatId, orderId: id, orderKind: "swap", trackingToken: "txid-test-token" });
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    await db.transaction((tx) => enqueueSwapTelegramNotification(tx, order, "payment_received", {
      amount: "20", asset: "USDT", network: "BEP20",
    }, {
      transactionHash: txHash,
      explorerUrlTemplate: "https://bscscan.com/tx/{tx}",
    }));
    const paymentNotices = await db.select().from(telegramNotificationOutboxTable).where(and(
      eq(telegramNotificationOutboxTable.orderId, id),
      eq(telegramNotificationOutboxTable.eventKind, "payment_received"),
    ));
    assert.equal(paymentNotices.some((notice) => notice.chatId === chatId), false);
  } finally {
    await db.delete(telegramNotificationOutboxTable).where(eq(telegramNotificationOutboxTable.orderId, id));
    await db.delete(telegramOrderLinksTable).where(eq(telegramOrderLinksTable.orderId, id));
    await db.delete(telegramChatsTable).where(eq(telegramChatsTable.chatId, chatId));
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
  }
});