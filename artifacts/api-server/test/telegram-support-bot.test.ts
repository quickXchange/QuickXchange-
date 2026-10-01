import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import {
  db,
  pool,
  operatorsTable,
  telegramSupportBotOutboxTable,
  telegramSupportBotSettingsTable,
  telegramSupportBotUpdatesTable,
} from "@workspace/db";
import {
  DEFAULT_SUPPORT_BOT_SETTINGS,
  exactApprovedFaqMatch,
  checkSupportBotConnection,
  isHumanSupportRequest,
  normalizeSupportQuestion,
  parseSupportBotIdentity,
  registerSupportBotWebhook,
  renderSupportBotReply,
  saveSupportBotSettings,
  dispatchSupportBotAction,
  supportBotCredentialsSafe,
  supportBotRegistrationAllowed,
  supportBotStatus,
  trustedSupportPublicOrigin,
  validateSupportBotSettings,
  type SupportSettings,
} from "../src/lib/telegram-support-bot";
import { dispatchNextSupportBotAction } from "../src/lib/telegram-support-bot-outbox";
import { adminPolicy, classifyAdminRoute } from "../src/lib/admin-policy";
import { requireOperator, configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";
import telegramSupportBotRouter, { parseSupportBotWebhookUpdate } from "../src/routes/telegram-support-bot";

if (process.env.API_TEST_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Support bot tests require the schema-only disposable API test database.");
}

const token = "912345678:SupportBotSyntheticToken_012345678901234567";
const secret = "SupportBotWebhookSecretSynthetic_0123456789012345";
const ownerUserId = "support_bot_test_owner";
const staffUserId = "support_bot_test_staff";
const ownerOperatorId = randomUUID();
const staffOperatorId = randomUUID();
const originalEnvironment = new Map<string, string | undefined>();
const providerCalls: string[] = [];
const sentMessages: Record<string, unknown>[] = [];
let providerWebhookUrl = "https://user:password@quickchange.exchange/api/telegram/support/webhook?secret=unsafe#fragment";
let originalFetch: typeof fetch;
let server: ReturnType<express.Express["listen"]>;
let apiUrl = "";

function setTestEnv(key: string, value: string) {
  if (!originalEnvironment.has(key)) originalEnvironment.set(key, process.env[key]);
  process.env[key] = value;
}

function restoreEnvironment() {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnvironment.clear();
}

function faqSettings(overrides: Partial<SupportSettings> = {}): SupportSettings {
  return validateSupportBotSettings({
    ...DEFAULT_SUPPORT_BOT_SETTINGS,
    enabled: true,
    supportUrl: "QuickXchangeHelp",
    categories: DEFAULT_SUPPORT_BOT_SETTINGS.categories,
    faqs: [{
      id: "order-status",
      categoryId: "order",
      approved: true,
      translations: {
        en: { question: "How do I check an order?", answer: "Use the order status page for updates.", aliases: ["check my order"] },
        fr: { question: "Comment suivre une commande ?", answer: "Consultez la page de suivi de commande.", aliases: [] },
      },
    }],
    ...overrides,
  });
}

async function request(path: string, init: RequestInit = {}, userId?: string) {
  return originalFetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(userId ? { "x-support-test-user": userId } : {}),
    },
  });
}

before(async () => {
  for (const [key, value] of Object.entries({
    TELEGRAM_SUPPORT_BOT_TOKEN: token,
    TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET: secret,
    TELEGRAM_BOT_TOKEN: "812345678:ExchangeSyntheticToken_012345678901234567",
    TELEGRAM_NEWS_BOT_TOKEN: "812345679:NewsSyntheticToken_012345678901234567",
    TELEGRAM_WEBHOOK_SECRET: "ExchangeWebhookSyntheticSecret_0123456789012345",
    NODE_ENV: "test",
    PUBLIC_APP_URL: "https://quickchange.exchange",
    REPLIT_DEPLOYMENT: "",
  })) setTestEnv(key, value);

  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = url.pathname.split("/").at(-1) ?? "";
    providerCalls.push(method);
    if (method === "sendMessage") {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      sentMessages.push(payload);
    }
    const result = method === "getMe"
      ? { id: 912345678, is_bot: true, username: "QuickXchangeSupport" }
      : method === "getWebhookInfo"
        ? { url: providerWebhookUrl, last_error_message: "provider secret must stay private" }
        : true;
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-support-test-user") ?? null,
    getVerifiedEmail: () => null,
    getSecondFactorVerified: () => true,
    getTotpEnabled: () => true,
  });

  await db.delete(telegramSupportBotOutboxTable);
  await db.delete(telegramSupportBotUpdatesTable);
  await db.delete(telegramSupportBotSettingsTable);
  await db.delete(operatorsTable).where(eq(operatorsTable.id, ownerOperatorId));
  await db.delete(operatorsTable).where(eq(operatorsTable.id, staffOperatorId));
  await db.insert(operatorsTable).values({
    id: ownerOperatorId,
    email: "support-bot-owner-fixture@example.invalid",
    clerkUserId: ownerUserId,
    name: "Support Bot Owner",
    role: "owner",
    status: "active",
  });
  await db.insert(operatorsTable).values({
    id: staffOperatorId,
    email: "support-bot-staff-fixture@example.invalid",
    clerkUserId: staffUserId,
    name: "Support Bot Staff",
    role: "operator",
    status: "active",
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/admin", requireOperator);
  app.use(adminPolicy);
  app.use(telegramSupportBotRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  apiUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.delete(telegramSupportBotOutboxTable);
  await db.delete(telegramSupportBotUpdatesTable);
  await db.delete(telegramSupportBotSettingsTable);
  await db.delete(operatorsTable).where(eq(operatorsTable.id, ownerOperatorId));
  await db.delete(operatorsTable).where(eq(operatorsTable.id, staffOperatorId));
  await pool.end();
  if (originalFetch) globalThis.fetch = originalFetch;
  restoreEnvironment();
});

test("localized defaults are disabled, ordered, professional, and contain no financial FAQ answers", () => {
  assert.equal(DEFAULT_SUPPORT_BOT_SETTINGS.enabled, false);
  assert.equal(DEFAULT_SUPPORT_BOT_SETTINGS.automaticRepliesEnabled, true);
  assert.equal(DEFAULT_SUPPORT_BOT_SETTINGS.contactSupportEnabled, true);
  assert.deepEqual(DEFAULT_SUPPORT_BOT_SETTINGS.categories.map(({ id }) => id), [
    "order", "payment", "exchange", "account", "other",
  ]);
  assert.deepEqual(DEFAULT_SUPPORT_BOT_SETTINGS.faqs, []);
  for (const welcome of Object.values(DEFAULT_SUPPORT_BOT_SETTINGS.welcomeMessages)) {
    assert.ok(welcome.includes("QuickXchange"));
  }
});

test("settings enforce supported partial locale maps, strict input keys, stable IDs, and unambiguous approved FAQ phrases", () => {
  const partial = validateSupportBotSettings({
    ...DEFAULT_SUPPORT_BOT_SETTINGS,
    welcomeMessages: { en: "Welcome to QuickXchange Support." },
    categories: [{ id: "order", label: { en: "Orders" }, enabled: true }],
    faqs: [],
  });
  assert.deepEqual(Object.keys(partial.welcomeMessages), ["en"]);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    token: "not accepted",
  }), /settings are invalid/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    welcomeMessages: { en: "Welcome", xx: "Unsupported" },
  }), /supported Telegram locales/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    welcomeMessages: { en: "Welcome", token: "hidden" },
  }), /supported Telegram locales/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    categories: [{ id: "order", label: { en: "Orders" }, enabled: true }, { id: "order", label: { en: "Again" }, enabled: true }],
  }), /unique and stable/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    categories: [{ id: "order", label: { en: "Orders", secret: "hidden" }, enabled: true }],
  }), /supported Telegram locales/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    categories: [{ id: "order", label: { en: "Orders" }, enabled: true, token: "hidden" }],
  }), /unsupported fields/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    categories: [{ id: `x${"a".repeat(55)}`, label: { en: "Too long for Telegram callback data" }, enabled: true }],
  }), /settings are invalid|unique and stable/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    faqs: [
      { id: "faq-a", categoryId: "order", approved: true, translations: { en: { question: "How is my order?", answer: "One.", aliases: ["order status"] } } },
      { id: "faq-b", categoryId: "order", approved: true, translations: { en: { question: "Where is my order?", answer: "Two.", aliases: ["ORDER STATUS!"] } } },
    ],
  }), /only one FAQ/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    faqs: [{
      id: "faq-a",
      categoryId: "order",
      approved: false,
      translations: { en: { question: "Where is my order?", answer: "Two.", aliases: [], token: "hidden" } },
    }],
  }), /unsupported fields/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    faqs: [{
      id: "faq-a",
      categoryId: "order",
      approved: false,
      translations: { en: { question: "Where is my order?", answer: "Two.", aliases: [] } },
      secret: "hidden",
    }],
  }), /unsupported fields/);
  assert.throws(() => validateSupportBotSettings({
    ...partial,
    faqs: [{
      id: "faq-a",
      categoryId: "order",
      approved: false,
      translations: { en: { question: "Where is my order?", answer: "Two.", aliases: [] }, secret: {} },
    }],
  }), /supported Telegram locales/);
});

test("FAQ matching is normalized exact-only, approved, category-aware, and escalation wins before a match", () => {
  const settings = faqSettings();
  assert.equal(normalizeSupportQuestion("  CHECK\tMY Order! "), "check my order");
  assert.equal(exactApprovedFaqMatch(settings, "CHECK MY ORDER", "en"), "order-status");
  assert.equal(exactApprovedFaqMatch(settings, "check my order please", "en"), null);
  assert.equal(exactApprovedFaqMatch(settings, "check my order", "ko"), "order-status");
  assert.equal(isHumanSupportRequest("Please connect me with a support agent."), true);
  assert.equal(exactApprovedFaqMatch(settings, "I need a support agent", "en"), null);
  const humanAction = parseSupportBotWebhookUpdate({
    update_id: 9,
    message: { chat: { id: 123, type: "private" }, from: { id: 456, language_code: "en" }, text: "I need a support agent" },
  }, "912345678", settings);
  assert.equal(humanAction.kind, "action");
  if (humanAction.kind === "action") assert.equal(humanAction.action.kind, "fallback");
});

test("disabled auto replies retain welcome/navigation and fallback but never render FAQ answers or hidden contact targets", () => {
  const settings = faqSettings({ automaticRepliesEnabled: false });
  const welcome = renderSupportBotReply(settings, { kind: "welcome", chatId: "123", locale: "en" });
  assert.ok(welcome?.text.includes("QuickXchange"));
  assert.ok(welcome?.keyboard?.some((row) => row.some((button) => button.callback_data === "category:order")));
  const faq = renderSupportBotReply(settings, { kind: "faq", faqId: "order-status", chatId: "123", locale: "en" });
  assert.ok(faq?.text.includes("could not find an approved answer"));
  assert.ok(!faq?.text.includes("order status page"));
  assert.ok(faq?.keyboard?.some((row) => row.some((button) => button.url === "https://t.me/QuickXchangeHelp")));
  const noContact = renderSupportBotReply(faqSettings({ contactSupportEnabled: false }), {
    kind: "fallback", chatId: "123", locale: "en",
  });
  assert.equal(noContact?.keyboard, undefined);
  const missingContact = renderSupportBotReply(validateSupportBotSettings({
    ...DEFAULT_SUPPORT_BOT_SETTINGS, enabled: true,
  }), { kind: "fallback", chatId: "123", locale: "en" });
  assert.equal(missingContact?.keyboard, undefined);
});

test("private webhook routing never stores raw input or profile fields and ignores groups and malformed callbacks", () => {
  const settings = faqSettings();
  const text = "How do I check an order?";
  const parsed = parseSupportBotWebhookUpdate({
    update_id: 100,
    message: { chat: { id: 112233, type: "private" }, from: { id: 445566, language_code: "fr-CA" }, text },
  }, "912345678", settings);
  assert.equal(parsed.kind, "action");
  if (parsed.kind === "action") {
    assert.equal(parsed.action.kind, "faq");
    assert.equal(parsed.action.faqId, "order-status");
    assert.equal(parsed.action.locale, "fr");
    assert.deepEqual(Object.keys(parsed.action).sort(), ["callbackQueryId", "chatId", "faqId", "kind", "locale"]);
    assert.ok(!JSON.stringify(parsed.action).includes(text));
    assert.ok(!JSON.stringify(parsed.action).includes("445566"));
  }
  assert.deepEqual(parseSupportBotWebhookUpdate({
    update_id: 101,
    message: { chat: { id: 999, type: "group" }, from: { id: 888 }, text: "hello" },
  }, "912345678", settings), { kind: "ignore" });
  assert.deepEqual(parseSupportBotWebhookUpdate({
    update_id: 102,
    callback_query: {
      id: "bad\ncallback",
      data: "faq:order-status",
      from: { id: 888 },
      message: { chat: { id: 999, type: "private" } },
    },
  }, "912345678", settings), { kind: "ignore" });
  const forged = parseSupportBotWebhookUpdate({
    update_id: 103,
    callback_query: {
      id: "valid-callback-id",
      data: "faq:unknown",
      from: { id: 888 },
      message: { chat: { id: 999, type: "private" } },
    },
  }, "912345678", settings);
  assert.equal(forged.kind, "action");
  if (forged.kind === "action") {
    assert.equal(forged.action.faqId, "unknown");
    assert.equal(renderSupportBotReply(settings, forged.action)?.text.includes("could not find an approved answer"), true);
  }
});

test("credential separation rejects equal and rotated same-bot IDs; production registration guard denies dev and unsafe URLs", () => {
  assert.equal(supportBotCredentialsSafe(token, secret), true);
  assert.equal(supportBotCredentialsSafe("812345678:RotatedExchangeToken_012345678901234567", secret), false);
  assert.equal(supportBotCredentialsSafe(process.env.TELEGRAM_BOT_TOKEN ?? "", secret), false);
  assert.equal(parseSupportBotIdentity({ id: 1, is_bot: true, username: "QuickXchangeSupport" })?.username, "QuickXchangeSupport");
  assert.equal(parseSupportBotIdentity({ id: 1, is_bot: false, username: "QuickXchangeSupport" }), null);
  assert.equal(supportBotRegistrationAllowed("1", "test", "https://quickchange.exchange"), false);
  assert.equal(supportBotRegistrationAllowed("false", "production", "https://quickchange.exchange"), false);
  assert.equal(trustedSupportPublicOrigin("https://user:pass@quickchange.exchange"), null);
  assert.equal(trustedSupportPublicOrigin("https://quickchange.exchange/path"), null);
  assert.equal(trustedSupportPublicOrigin("https://preview.replit.dev"), null);
  assert.equal(trustedSupportPublicOrigin("https://127.0.0.1"), null);
  assert.equal(trustedSupportPublicOrigin("https://quickchange.exchange?token=hidden"), null);
  assert.equal(trustedSupportPublicOrigin("https://quickchange.exchange:8443"), null);
  assert.equal(trustedSupportPublicOrigin("https://example.com"), null);
});

test("Owner-only GET/PUT and read-only connection checks expose no secrets or unsafe provider webhook metadata", async () => {
  for (const [method, path] of [
    ["GET", "/admin/telegram/support-bot"],
    ["PUT", "/admin/telegram/support-bot"],
    ["POST", "/admin/telegram/support-bot/connection/check"],
    ["POST", "/admin/telegram/support-bot/connection/register"],
  ]) {
    assert.equal(classifyAdminRoute(method, path)?.ownerOnly, true);
  }
  const unauthenticated = await request("/admin/telegram/support-bot");
  assert.equal(unauthenticated.status, 401);
  const staff = await request("/admin/telegram/support-bot", {}, staffUserId);
  assert.equal(staff.status, 403);
  const staffCheck = await request("/admin/telegram/support-bot/connection/check", { method: "POST" }, staffUserId);
  assert.equal(staffCheck.status, 403);
  const staffRegister = await request("/admin/telegram/support-bot/connection/register", { method: "POST" }, staffUserId);
  assert.equal(staffRegister.status, 403);
  const owner = await request("/admin/telegram/support-bot", {}, ownerUserId);
  assert.equal(owner.status, 200);
  const initial = await owner.json() as { settings: SupportSettings; status: Record<string, unknown> };
  assert.equal(initial.settings.enabled, false);
  assert.equal(initial.status.tokenConfigured, true);
  assert.equal(initial.status.webhookSecretConfigured, true);
  assert.equal(JSON.stringify(initial).includes(token), false);
  assert.equal(JSON.stringify(initial).includes(secret), false);

  const settings = faqSettings();
  const savedResponse = await request("/admin/telegram/support-bot", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  }, ownerUserId);
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json() as { settings: SupportSettings };
  assert.equal(saved.settings.supportUrl, "https://t.me/QuickXchangeHelp");

  const rejected = await request("/admin/telegram/support-bot", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...settings, token }),
  }, ownerUserId);
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.text()).includes(token), false);
  const nestedInvalidSettings = [
    { ...settings, welcomeMessages: { en: "Welcome", secret: "hidden" } },
    { ...settings, categories: settings.categories.map((category, index) => index === 0
      ? { ...category, label: { ...category.label, token: "hidden" } }
      : category) },
    { ...settings, faqs: settings.faqs.map((faq) => ({ ...faq, token: "hidden" })) },
    { ...settings, faqs: settings.faqs.map((faq) => ({
      ...faq,
      translations: {
        ...faq.translations,
        en: { ...faq.translations.en!, secret: "hidden" },
      },
    })) },
  ];
  for (const invalidSettings of nestedInvalidSettings) {
    const nestedRejected = await request("/admin/telegram/support-bot", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalidSettings),
    }, ownerUserId);
    assert.equal(nestedRejected.status, 400);
    const body = await nestedRejected.text();
    assert.equal(body.includes("hidden"), false);
    assert.equal(body.includes(token), false);
  }

  const configuredSecret = process.env.TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET;
  process.env.TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET = "";
  providerCalls.length = 0;
  const tokenOnlyCheck = await request("/admin/telegram/support-bot/connection/check", { method: "POST" }, ownerUserId);
  const tokenOnlyStatus = await tokenOnlyCheck.json() as Record<string, unknown>;
  assert.equal(tokenOnlyStatus.connected, true);
  assert.equal(tokenOnlyStatus.webhookSecretConfigured, false);
  assert.deepEqual(providerCalls, ["getMe", "getWebhookInfo"]);
  process.env.TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET = configuredSecret;

  providerCalls.length = 0;
  const checkedResponse = await request("/admin/telegram/support-bot/connection/check", { method: "POST" }, ownerUserId);
  assert.equal(checkedResponse.status, 200);
  const checked = await checkedResponse.json() as Record<string, unknown>;
  assert.equal(checked.connected, true);
  assert.equal(checked.webhookUrl, null);
  assert.equal(checked.lastCheckedAt !== null, true);
  assert.deepEqual(providerCalls, ["getMe", "getWebhookInfo"]);
  assert.equal(JSON.stringify(checked).includes(token), false);
  assert.equal(JSON.stringify(checked).includes("password"), false);
  assert.equal(JSON.stringify(checked).includes("unsafe"), false);
  process.env.TELEGRAM_SUPPORT_BOT_TOKEN = "912345678:RotatedSupportToken_012345678901234567";
  assert.equal((await supportBotStatus(true)).connected, false);
  process.env.TELEGRAM_SUPPORT_BOT_TOKEN = token;
  const beforeRegister = providerCalls.length;
  const registerResponse = await request("/admin/telegram/support-bot/connection/register", { method: "POST" }, ownerUserId);
  assert.equal(registerResponse.status, 400);
  assert.equal(providerCalls.length, beforeRegister);
  assert.equal(providerCalls.includes("setWebhook"), false);
});

test("only explicit successful registration attests the current token, secret, and canonical URL", async () => {
  await saveSupportBotSettings(faqSettings(), ownerOperatorId);
  const originalWebhookUrl = providerWebhookUrl;
  setTestEnv("NODE_ENV", "production");
  setTestEnv("REPLIT_DEPLOYMENT", "1");
  setTestEnv("PUBLIC_APP_URL", "https://quickchange.exchange");
  providerWebhookUrl = "https://quickchange.exchange/api/telegram/support/webhook";
  providerCalls.length = 0;

  const unregisteredStatus = await checkSupportBotConnection();
  assert.equal(unregisteredStatus.webhookUrl, providerWebhookUrl);
  assert.equal(unregisteredStatus.webhookRegistered, false);
  assert.deepEqual(providerCalls, ["getMe", "getWebhookInfo"]);

  providerCalls.length = 0;
  providerWebhookUrl = "https://quickchange.exchange/not-the-support-webhook";
  await assert.rejects(
    registerSupportBotWebhook(),
    (error: unknown) => Boolean(error && typeof error === "object" &&
      "code" in error && error.code === "SUPPORT_BOT_WEBHOOK_CONFIRMATION_FAILED"),
  );
  assert.deepEqual(providerCalls, [
    "getMe", "setWebhook", "setMyCommands", "setMyName", "setMyDescription", "getWebhookInfo",
  ]);
  const [unconfirmed] = await db.select().from(telegramSupportBotSettingsTable)
    .where(eq(telegramSupportBotSettingsTable.id, "global"));
  assert.equal(unconfirmed?.webhookAttestedAt, null);

  providerWebhookUrl = "https://quickchange.exchange/api/telegram/support/webhook";
  providerCalls.length = 0;
  const registeredStatus = await registerSupportBotWebhook();
  assert.equal(registeredStatus.webhookRegistered, true);
  assert.deepEqual(providerCalls, [
    "getMe", "setWebhook", "setMyCommands", "setMyName", "setMyDescription", "getWebhookInfo",
  ]);
  assert.equal(JSON.stringify(registeredStatus).includes(token), false);
  assert.equal(JSON.stringify(registeredStatus).includes(secret), false);

  const [saved] = await db.select().from(telegramSupportBotSettingsTable)
    .where(eq(telegramSupportBotSettingsTable.id, "global"));
  assert.equal(saved?.webhookAttestedTokenDigest?.length, 64);
  assert.equal(saved?.webhookAttestedSecretDigest?.length, 64);
  assert.equal(saved?.webhookAttestedUrl, providerWebhookUrl);
  assert.ok(saved?.webhookAttestedAt);
  assert.equal(JSON.stringify(saved).includes(token), false);
  assert.equal(JSON.stringify(saved).includes(secret), false);

  process.env.TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET = "RotatedSupportWebhookSecretSynthetic_0123456789012345";
  const rotatedSecretStatus = await supportBotStatus(true);
  assert.equal(rotatedSecretStatus.webhookRegistered, false);
  process.env.TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET = secret;

  providerCalls.length = 0;
  const confirmedStatus = await checkSupportBotConnection();
  assert.equal(confirmedStatus.webhookRegistered, true);
  assert.deepEqual(providerCalls, ["getMe", "getWebhookInfo"]);

  providerWebhookUrl = originalWebhookUrl;
  process.env.NODE_ENV = "test";
  process.env.REPLIT_DEPLOYMENT = "";
});

test("webhook authenticates the dedicated secret, durably deduplicates, and skips groups/malformed callbacks", async () => {
  const settings = faqSettings();
  await saveSupportBotSettings(settings, ownerOperatorId);
  const rawQuestion = "How do I check an order?";
  const update = {
    update_id: 500,
    message: {
      chat: { id: 234567, type: "private" },
      from: { id: 7654321, language_code: "en" },
      text: rawQuestion,
    },
  };
  const badSecret = await request("/telegram/support/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "wrong-secret" },
    body: JSON.stringify(update),
  });
  assert.equal(badSecret.status, 401);
  const valid = () => request("/telegram/support/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(update),
  });
  assert.equal((await valid()).status, 200);
  assert.equal((await valid()).status, 200);
  let inbox = await db.select().from(telegramSupportBotUpdatesTable);
  let outbox = await db.select().from(telegramSupportBotOutboxTable);
  assert.equal(inbox.length, 1);
  assert.equal(outbox.length, 1);
  assert.equal(inbox[0]?.actionKind, "faq");
  const persisted = JSON.stringify({ inbox, outbox });
  assert.equal(persisted.includes(rawQuestion), false);
  assert.equal(persisted.includes("7654321"), false);

  const groupResponse = await request("/telegram/support/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({
      update_id: 501,
      message: { chat: { id: -12345, type: "supergroup" }, from: { id: 7654321 }, text: "private text" },
    }),
  });
  assert.equal(groupResponse.status, 200);
  const malformedCallback = await request("/telegram/support/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({
      update_id: 502,
      callback_query: {
        id: "malformed\nid",
        data: "faq:order-status",
        from: { id: 7654321 },
        message: { chat: { id: 234567, type: "private" } },
      },
    }),
  });
  assert.equal(malformedCallback.status, 200);
  inbox = await db.select().from(telegramSupportBotUpdatesTable);
  assert.equal(inbox.length, 1);
});

test("queued approved FAQ is re-rendered after revocation; retries and lease claims remain isolated", async () => {
  const current = await db.select().from(telegramSupportBotSettingsTable);
  assert.equal(current.length, 1);
  const settings = validateSupportBotSettings(current[0]?.settings);
  const revoked = {
    ...settings,
    faqs: settings.faqs.map((faq) => ({ ...faq, approved: false })),
  };
  await saveSupportBotSettings(revoked, ownerOperatorId);
  await dispatchNextSupportBotAction();
  assert.equal(sentMessages.length, 1);
  assert.ok(String(sentMessages[0]?.text).includes("could not find an approved answer"));
  assert.equal(String(sentMessages[0]?.text).includes("order status page"), false);
  let outbox = await db.select().from(telegramSupportBotOutboxTable);
  assert.equal(outbox[0]?.deliveryStatus, "delivered");

  const fallbackAction = {
    kind: "fallback" as const,
    chatId: "234567",
    locale: "en" as const,
  };
  const { enqueueSupportBotUpdate } = await import("../src/lib/telegram-support-bot-outbox");
  await enqueueSupportBotUpdate("912345678", 503, fallbackAction);
  const successFetch = globalThis.fetch;
  let failOnce = true;
  globalThis.fetch = (async () => {
    if (failOnce) {
      failOnce = false;
      return new Response(JSON.stringify({ ok: false, description: "sensitive provider detail" }), { status: 502 });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  }) as typeof fetch;
  await dispatchNextSupportBotAction();
  outbox = await db.select().from(telegramSupportBotOutboxTable);
  const retry = outbox.find((row) => row.incomingUpdateId === "503");
  assert.equal(retry?.deliveryStatus, "pending");
  assert.equal(retry?.attemptCount, 1);
  assert.notEqual(retry?.lastErrorCode, "sensitive provider detail");
  if (retry) {
    await db.update(telegramSupportBotOutboxTable)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(telegramSupportBotOutboxTable.id, retry.id));
  }
  await dispatchNextSupportBotAction();
  outbox = await db.select().from(telegramSupportBotOutboxTable);
  assert.equal(outbox.find((row) => row.incomingUpdateId === "503")?.deliveryStatus, "delivered");
  globalThis.fetch = successFetch;

  const callbackAction = { ...fallbackAction, callbackQueryId: "expired-callback-query" };
  await enqueueSupportBotUpdate("912345678", 504, callbackAction);
  const callbackCalls: string[] = [];
  const sentBeforeCallback = sentMessages.length;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = new URL(String(input)).pathname.split("/").at(-1) ?? "";
    callbackCalls.push(method);
    if (method === "sendMessage") {
      sentMessages.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    }
    if (method === "answerCallbackQuery") {
      return new Response(JSON.stringify({ ok: false, description: "query is too old" }), { status: 400 });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await dispatchNextSupportBotAction(), true);
  outbox = await db.select().from(telegramSupportBotOutboxTable);
  assert.equal(outbox.find((row) => row.incomingUpdateId === "504")?.deliveryStatus, "delivered");
  assert.deepEqual(callbackCalls, ["answerCallbackQuery", "sendMessage"]);
  assert.equal(sentMessages.length, sentBeforeCallback + 1);
  globalThis.fetch = successFetch;

  await enqueueSupportBotUpdate("912345678", 505, fallbackAction);
  let releaseDelivery = () => {};
  let markDeliveryStarted = () => {};
  const deliveryStarted = new Promise<void>((resolve) => { markDeliveryStarted = resolve; });
  const holdDelivery = new Promise<void>((resolve) => { releaseDelivery = resolve; });
  let deliveryCount = 0;
  globalThis.fetch = (async () => {
    deliveryCount += 1;
    markDeliveryStarted();
    await holdDelivery;
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  }) as typeof fetch;
  const firstClaim = dispatchNextSupportBotAction();
  await deliveryStarted;
  assert.equal(await dispatchNextSupportBotAction(), false);
  assert.equal(deliveryCount, 1);
  releaseDelivery();
  await firstClaim;
  outbox = await db.select().from(telegramSupportBotOutboxTable);
  assert.equal(outbox.find((row) => row.incomingUpdateId === "505")?.deliveryStatus, "delivered");
  globalThis.fetch = successFetch;

  await enqueueSupportBotUpdate("912345678", 506, fallbackAction);
  let releaseSettingsLock = () => {};
  let signalSettingsLocked = () => {};
  const settingsLocked = new Promise<void>((resolve) => { signalSettingsLocked = resolve; });
  const holdSettingsLock = new Promise<void>((resolve) => { releaseSettingsLock = resolve; });
  const settingsLockTransaction = db.transaction(async (tx) => {
    await tx.select({ id: telegramSupportBotSettingsTable.id })
      .from(telegramSupportBotSettingsTable)
      .where(eq(telegramSupportBotSettingsTable.id, "global"))
      .for("update");
    signalSettingsLocked();
    await holdSettingsLock;
  });
  await settingsLocked;
  const sendCalls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const method = new URL(String(input)).pathname.split("/").at(-1) ?? "";
    sendCalls.push(method);
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  }) as typeof fetch;
  const oldDispatcher = dispatchNextSupportBotAction();
  let newDispatcher: Promise<boolean> | null = null;
  let lease: { id: string; claimToken: string } | null = null;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const rows = await db.select().from(telegramSupportBotOutboxTable)
        .where(eq(telegramSupportBotOutboxTable.incomingUpdateId, "506"));
      const row = rows[0];
      if (row?.deliveryStatus === "sending" && row.claimToken) {
        lease = { id: row.id, claimToken: row.claimToken };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(lease);
    if (!lease) throw new Error("The first worker did not claim the test outbox row.");
    const oldClaimToken = lease.claimToken;
    const leasedId = lease.id;
    await db.update(telegramSupportBotOutboxTable)
      .set({ claimExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(telegramSupportBotOutboxTable.id, leasedId));
    newDispatcher = dispatchNextSupportBotAction();
    let replacedToken: string | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [row] = await db.select().from(telegramSupportBotOutboxTable)
        .where(eq(telegramSupportBotOutboxTable.id, leasedId));
      if (row?.claimToken && row.claimToken !== oldClaimToken) {
        replacedToken = row.claimToken;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(replacedToken);
    releaseSettingsLock();
    await Promise.all([settingsLockTransaction, oldDispatcher, newDispatcher]);
    outbox = await db.select().from(telegramSupportBotOutboxTable);
    const fenced = outbox.find((row) => row.incomingUpdateId === "506");
    assert.equal(fenced?.deliveryStatus, "delivered");
    assert.equal(fenced?.attemptCount, 2);
    assert.equal(sendCalls.filter((method) => method === "sendMessage").length, 1);
    await assert.rejects(
      dispatchSupportBotAction(fallbackAction, "912345678", { id: leasedId, claimToken: oldClaimToken }),
      (error: unknown) => Boolean(error && typeof error === "object" &&
        "code" in error && error.code === "SUPPORT_BOT_CLAIM_LOST"),
    );
    assert.equal(sendCalls.filter((method) => method === "sendMessage").length, 1);
  } finally {
    releaseSettingsLock();
    await settingsLockTransaction;
    if (newDispatcher) await Promise.all([oldDispatcher, newDispatcher]);
    else await oldDispatcher;
  }
  globalThis.fetch = successFetch;
});