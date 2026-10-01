import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { and, eq, sql } from "drizzle-orm";
import { UpdateTelegramSupportBotBody, type ApiTypes } from "@workspace/api-zod";
import {
  db,
  telegramSupportBotOutboxTable,
  telegramSupportBotSettingsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { InvalidTelegramSupportValueError, normalizeTelegramSupportUrl } from "@workspace/api-zod";

export type SupportLocale = "en" | "fr" | "ar" | "es" | "de" | "ru" | "uk" | "ko";
export type SupportSettings = ApiTypes.SupportBotSettingsInput;
export type SupportActionKind = "welcome" | "menu" | "category" | "faq" | "fallback";
export type SupportAction = {
  kind: SupportActionKind;
  chatId: string;
  locale: SupportLocale;
  faqId?: string | null;
  callbackQueryId?: string | null;
};
export type SupportStatus = {
  tokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  connected: boolean;
  botUsername: string | null;
  webhookUrl: string | null;
  webhookRegistered: boolean;
  registrationAllowed: boolean;
  lastCheckedAt: string | null;
  error: string | null;
};
export type TelegramIdentity = { id: number; username: string };

export class SupportBotError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "SupportBotError";
  }
}

export const SUPPORTED_SUPPORT_LOCALES: readonly SupportLocale[] =
  ["en", "fr", "ar", "es", "de", "ru", "uk", "ko"];
const supportedLocaleSet = new Set<string>(SUPPORTED_SUPPORT_LOCALES);

const localizedWelcome: Record<SupportLocale, string> = {
  en: "Welcome to QuickXchange Support. Choose a topic below to browse approved answers, or contact our support team.",
  fr: "Bienvenue au support QuickXchange. Choisissez un sujet pour consulter les réponses approuvées ou contactez notre équipe.",
  ar: "مرحباً بك في دعم QuickXchange. اختر موضوعاً للاطلاع على الإجابات المعتمدة أو تواصل مع فريق الدعم.",
  es: "Te damos la bienvenida al soporte de QuickXchange. Elige un tema para consultar respuestas aprobadas o contacta con nuestro equipo.",
  de: "Willkommen beim QuickXchange-Support. Wähle ein Thema für freigegebene Antworten oder kontaktiere unser Support-Team.",
  ru: "Добро пожаловать в службу поддержки QuickXchange. Выберите тему, чтобы посмотреть одобренные ответы, или свяжитесь с нашей командой.",
  uk: "Вітаємо у службі підтримки QuickXchange. Оберіть тему, щоб переглянути схвалені відповіді, або зв’яжіться з нашою командою.",
  ko: "QuickXchange 고객 지원에 오신 것을 환영합니다. 승인된 답변을 보려면 주제를 선택하거나 지원팀에 문의하세요.",
};

const categoryLabels: Record<string, Record<SupportLocale, string>> = {
  order: {
    en: "Orders", fr: "Commandes", ar: "الطلبات", es: "Pedidos", de: "Bestellungen",
    ru: "Заказы", uk: "Замовлення", ko: "주문",
  },
  payment: {
    en: "Payments", fr: "Paiements", ar: "المدفوعات", es: "Pagos", de: "Zahlungen",
    ru: "Платежи", uk: "Платежі", ko: "결제",
  },
  exchange: {
    en: "Exchange", fr: "Échange", ar: "التبادل", es: "Intercambio", de: "Tausch",
    ru: "Обмен", uk: "Обмін", ko: "교환",
  },
  account: {
    en: "Account", fr: "Compte", ar: "الحساب", es: "Cuenta", de: "Konto",
    ru: "Аккаунт", uk: "Обліковий запис", ko: "계정",
  },
  other: {
    en: "Other", fr: "Autre", ar: "أخرى", es: "Otros", de: "Sonstiges",
    ru: "Другое", uk: "Інше", ko: "기타",
  },
};

export const DEFAULT_SUPPORT_BOT_SETTINGS: SupportSettings = {
  enabled: false,
  automaticRepliesEnabled: true,
  contactSupportEnabled: true,
  supportUrl: null,
  welcomeMessages: localizedWelcome,
  categories: ["order", "payment", "exchange", "account", "other"].map((id) => ({
    id,
    label: categoryLabels[id],
    enabled: true,
  })),
  faqs: [],
};

export function localeForSupport(value?: unknown): SupportLocale {
  if (typeof value !== "string") return "en";
  const locale = value.toLowerCase().split("-")[0] ?? "en";
  return supportedLocaleSet.has(locale) ? locale as SupportLocale : "en";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, allowed: readonly string[]): boolean {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function normalizeSupportUrl(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const bareUsername = /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(trimmed);
    return normalizeTelegramSupportUrl(bareUsername ? `@${trimmed}` : trimmed);
  } catch (error) {
    if (error instanceof InvalidTelegramSupportValueError) {
      throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Enter a Telegram support username or username URL.");
    }
    throw error;
  }
}

export function normalizeSupportQuestion(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("und")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cleanTextMap(
  value: unknown,
  name: string,
  maxLength: number,
  requireEnglish: boolean,
): Partial<Record<SupportLocale, string>> {
  if (!isRecord(value) || !hasOnlyKeys(value, SUPPORTED_SUPPORT_LOCALES)) {
    throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", `${name} must use supported Telegram locales only.`);
  }
  const cleaned: Partial<Record<SupportLocale, string>> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string" || raw.trim().length === 0 || raw.trim().length > maxLength) {
      throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", `${name} values must be nonempty and within their length limit.`);
    }
    cleaned[key as SupportLocale] = raw.trim();
  }
  if (requireEnglish && !cleaned.en) {
    throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", `${name} must include a nonempty English value.`);
  }
  return cleaned;
}

export function validateSupportBotSettings(value: unknown): SupportSettings {
  const settingKeys = [
    "enabled", "automaticRepliesEnabled", "contactSupportEnabled", "supportUrl",
    "welcomeMessages", "categories", "faqs",
  ];
  if (!isRecord(value) || !hasOnlyKeys(value, settingKeys)) {
    throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "The support bot settings are invalid.");
  }
  if (isRecord(value.welcomeMessages) && !hasOnlyKeys(value.welcomeMessages, SUPPORTED_SUPPORT_LOCALES)) {
    throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Welcome messages must use supported Telegram locales only.");
  }
  if (Array.isArray(value.categories)) {
    for (const category of value.categories) {
      if (!isRecord(category)) continue;
      if (!hasOnlyKeys(category, ["id", "label", "enabled"])) {
        throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Support categories contain unsupported fields.");
      }
      if (isRecord(category.label) && !hasOnlyKeys(category.label, SUPPORTED_SUPPORT_LOCALES)) {
        throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Category labels must use supported Telegram locales only.");
      }
    }
  }
  if (Array.isArray(value.faqs)) {
    for (const faq of value.faqs) {
      if (!isRecord(faq)) continue;
      if (!hasOnlyKeys(faq, ["id", "categoryId", "approved", "translations"])) {
        throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Support FAQs contain unsupported fields.");
      }
      if (!isRecord(faq.translations)) continue;
      if (!hasOnlyKeys(faq.translations, SUPPORTED_SUPPORT_LOCALES)) {
        throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "FAQ translations must use supported Telegram locales only.");
      }
      for (const translation of Object.values(faq.translations)) {
        if (isRecord(translation) && !hasOnlyKeys(translation, ["question", "answer", "aliases"])) {
          throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "FAQ translations contain unsupported fields.");
        }
      }
    }
  }

  const parsed = UpdateTelegramSupportBotBody.safeParse(value);
  if (!parsed.success) {
    throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "The support bot settings are invalid.");
  }
  const settings = parsed.data as SupportSettings;
  const supportUrl = normalizeSupportUrl(settings.supportUrl);
  const welcomeMessages = cleanTextMap(settings.welcomeMessages, "Welcome messages", 1200, true);
  if (!Array.isArray(settings.categories) || settings.categories.length > 20) {
    throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Use no more than 20 support categories.");
  }
  const categoryIds = new Set<string>();
  const categories = settings.categories.map((category) => {
    if (!hasOnlyKeys(category, ["id", "label", "enabled"]) ||
      !/^[a-z0-9][a-z0-9_-]{0,54}$/.test(category.id) ||
      categoryIds.has(category.id) ||
      typeof category.enabled !== "boolean") {
      throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Support category IDs must be unique and stable.");
    }
    categoryIds.add(category.id);
    const label = cleanTextMap(category.label, "Category labels", 64, true);
    return { id: category.id, label, enabled: category.enabled };
  });
  if (!Array.isArray(settings.faqs) || settings.faqs.length > 99) {
    throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Use no more than 99 support FAQs.");
  }
  const faqIds = new Set<string>();
  const approvedQuestionOwners = new Map<string, string>();
  const faqs = settings.faqs.map((faq) => {
    if (!hasOnlyKeys(faq, ["id", "categoryId", "approved", "translations"]) ||
      !/^[a-z0-9][a-z0-9_-]{0,54}$/.test(faq.id) ||
      faqIds.has(faq.id) || !categoryIds.has(faq.categoryId) ||
      typeof faq.approved !== "boolean" ||
      !isRecord(faq.translations) ||
      !hasOnlyKeys(faq.translations, SUPPORTED_SUPPORT_LOCALES) ||
      !faq.translations.en) {
      throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "FAQ IDs, categories, and English translations are required and must be valid.");
    }
    faqIds.add(faq.id);
    const translations: Partial<Record<SupportLocale, { question: string; answer: string; aliases: string[] }>> = {};
    for (const [rawLocale, rawTranslation] of Object.entries(faq.translations)) {
      const locale = rawLocale as SupportLocale;
      if (!hasOnlyKeys(rawTranslation, ["question", "answer", "aliases"])) {
        throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "FAQ translations contain unsupported fields.");
      }
      const translation = rawTranslation as { question?: unknown; answer?: unknown; aliases?: unknown };
      if (typeof translation.question !== "string" || !translation.question.trim() || translation.question.trim().length > 200 ||
        typeof translation.answer !== "string" || !translation.answer.trim() || translation.answer.trim().length > 3500 ||
        !Array.isArray(translation.aliases) || translation.aliases.length > 10 ||
        translation.aliases.some((alias) => typeof alias !== "string" || !alias.trim() || alias.trim().length > 200)) {
        throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "FAQ questions, answers, and aliases must be nonempty and within their length limits.");
      }
      const aliases = translation.aliases.map((alias) => (alias as string).trim());
      translations[locale] = {
        question: translation.question.trim(),
        answer: translation.answer.trim(),
        aliases,
      };
      if (faq.approved) {
        for (const phrase of [translation.question.trim(), ...aliases]) {
          const normalized = normalizeSupportQuestion(phrase);
          if (!normalized) {
            throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Approved FAQ matching phrases cannot be empty.");
          }
          const owner = approvedQuestionOwners.get(normalized);
          if (owner && owner !== faq.id) {
            throw new SupportBotError("AMBIGUOUS_SUPPORT_BOT_FAQ", "Approved FAQ questions and aliases must map to only one FAQ.");
          }
          approvedQuestionOwners.set(normalized, faq.id);
        }
      }
    }
    const category = categories.find((candidate) => candidate.id === faq.categoryId);
    if (faq.approved && !category?.enabled) {
      throw new SupportBotError("INVALID_SUPPORT_BOT_SETTINGS", "Approved FAQs must belong to an enabled category.");
    }
    return { id: faq.id, categoryId: faq.categoryId, approved: faq.approved, translations };
  });
  return {
    enabled: settings.enabled,
    automaticRepliesEnabled: settings.automaticRepliesEnabled,
    contactSupportEnabled: settings.contactSupportEnabled,
    supportUrl,
    welcomeMessages: welcomeMessages as Record<SupportLocale, string>,
    categories,
    faqs,
  };
}

function supportToken(): string {
  return process.env.TELEGRAM_SUPPORT_BOT_TOKEN?.trim() ?? "";
}

function supportWebhookSecret(): string {
  return process.env.TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET?.trim() ?? "";
}

function tokenBotId(token: string): string | null {
  const match = /^(\d+):[A-Za-z0-9_-]{20,}$/.exec(token);
  return match?.[1] ?? null;
}

function webhookSecretValid(secret: string): boolean {
  return secret.length >= 32 && secret.length <= 256 && /^[A-Za-z0-9_-]+$/.test(secret);
}

function supportWebhookSecretSafe(secret: string): boolean {
  if (!webhookSecretValid(secret)) return false;
  const exchangeSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  return secret !== supportToken() && secret !== (process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "") &&
    secret !== (process.env.TELEGRAM_NEWS_BOT_TOKEN?.trim() ?? "") &&
    (!exchangeSecret || secret !== exchangeSecret);
}

export function supportBotCredentialsSafe(token = supportToken(), secret = supportWebhookSecret()): boolean {
  return supportBotTokenSafe(token) && supportWebhookSecretSafe(secret);
}

export function supportBotTokenSafe(token = supportToken()): boolean {
  const botId = tokenBotId(token);
  if (!botId) return false;
  const exchangeToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const newsToken = process.env.TELEGRAM_NEWS_BOT_TOKEN?.trim() ?? "";
  if (token === exchangeToken || token === newsToken) return false;
  if (botId === tokenBotId(exchangeToken) || botId === tokenBotId(newsToken)) return false;
  return true;
}

export function parseSupportBotIdentity(value: unknown): TelegramIdentity | null {
  if (!isRecord(value) || value.is_bot !== true ||
    typeof value.id !== "number" || !Number.isSafeInteger(value.id) ||
    typeof value.username !== "string" || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value.username)) return null;
  return { id: value.id, username: value.username };
}

function isPublicSupportHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.includes(".") &&
    !host.endsWith(".") &&
    !isIP(host.replace(/^\[|\]$/g, "")) &&
    !/(?:^|\.)(?:localhost|local|internal|lan|home|localdomain|onion|home\.arpa|replit\.dev|replit\.app|test|invalid|example|example\.com|example\.net|example\.org)$/i.test(host);
}

export function trustedSupportPublicOrigin(value = process.env.PUBLIC_APP_URL): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.port || !isPublicSupportHostname(url.hostname)) return null;
    return `https://${url.host.toLowerCase()}`;
  } catch {
    return null;
  }
}

export function supportBotRegistrationAllowed(
  deployment = process.env.REPLIT_DEPLOYMENT,
  nodeEnvironment = process.env.NODE_ENV,
  publicAppUrl = process.env.PUBLIC_APP_URL,
): boolean {
  const deployed = Boolean(deployment?.trim() && !["0", "false", "no"].includes(deployment.trim().toLowerCase()));
  return deployed && nodeEnvironment === "production" && Boolean(trustedSupportPublicOrigin(publicAppUrl));
}

export function expectedSupportWebhookUrl(): string | null {
  const origin = trustedSupportPublicOrigin();
  return origin ? `${origin}/api/telegram/support/webhook` : null;
}

function safePublicWebhookUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !isPublicSupportHostname(url.hostname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

type CachedConnection = {
  tokenDigest: string;
  webhookSecretDigest: string;
  connected: boolean;
  username: string | null;
  webhookUrl: string | null;
  webhookRegistered: boolean;
  checkedAt: string;
  error: string | null;
};
let cachedConnection: CachedConnection | null = null;
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

export async function supportBotStatus(enabled = false): Promise<SupportStatus> {
  const token = supportToken();
  const secret = supportWebhookSecret();
  const tokenConfigured = Boolean(token);
  const webhookSecretConfigured = supportWebhookSecretSafe(secret);
  const cacheIsCurrent = Boolean(token && cachedConnection?.tokenDigest === fingerprint(token));
  const cached = cacheIsCurrent ? cachedConnection : null;
  const expectedUrl = expectedSupportWebhookUrl();
  const [attestation] = await db.select({
    tokenDigest: telegramSupportBotSettingsTable.webhookAttestedTokenDigest,
    secretDigest: telegramSupportBotSettingsTable.webhookAttestedSecretDigest,
    url: telegramSupportBotSettingsTable.webhookAttestedUrl,
    at: telegramSupportBotSettingsTable.webhookAttestedAt,
  }).from(telegramSupportBotSettingsTable)
    .where(eq(telegramSupportBotSettingsTable.id, "global"))
    .limit(1);
  const attestationIsCurrent = Boolean(
    attestation?.at &&
    token &&
    secret &&
    supportBotCredentialsSafe(token, secret) &&
    attestation.tokenDigest === fingerprint(token) &&
    attestation.secretDigest === fingerprint(secret) &&
    expectedUrl &&
    attestation.url === expectedUrl,
  );
  return {
    tokenConfigured,
    webhookSecretConfigured,
    connected: Boolean(cached?.connected),
    botUsername: cached?.username ?? null,
    webhookUrl: cached?.webhookUrl ?? null,
    webhookRegistered: Boolean(
      cached?.webhookRegistered &&
      cached.webhookSecretDigest === fingerprint(secret) &&
      expectedUrl &&
      cached.webhookUrl === expectedUrl &&
      attestationIsCurrent,
    ),
    registrationAllowed: enabled && supportBotRegistrationAllowed() && supportBotCredentialsSafe(),
    lastCheckedAt: cached?.checkedAt ?? null,
    error: !tokenConfigured ? "Support bot token is not configured." :
      !supportBotTokenSafe(token) ? "Support bot token is not distinct from other Telegram bots." :
        !webhookSecretConfigured ? "Support bot webhook secret is not configured correctly." :
          cached?.error ?? null,
  };
}

const SUPPORT_PROVIDER_TIMEOUT_MS = 6_000;
const SUPPORT_DELIVERY_DEADLINE_MS = 15_000;
export const SUPPORT_OUTBOX_LEASE_MS = 30_000;

async function supportTelegramCall<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  deadlineAt?: number,
): Promise<T> {
  const timeoutMs = deadlineAt === undefined
    ? SUPPORT_PROVIDER_TIMEOUT_MS
    : Math.min(SUPPORT_PROVIDER_TIMEOUT_MS, deadlineAt - Date.now());
  if (timeoutMs <= 0) {
    throw new SupportBotError("SUPPORT_BOT_DELIVERY_DEADLINE_EXCEEDED", "Support bot delivery deadline expired.", 504);
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => null);
  if (!response) throw new SupportBotError("SUPPORT_BOT_PROVIDER_UNAVAILABLE", "Telegram support bot request failed.", 502);
  const data = await response.json().catch(() => null) as { ok?: unknown; result?: T } | null;
  if (!response.ok || data?.ok !== true) {
    throw new SupportBotError("SUPPORT_BOT_PROVIDER_UNAVAILABLE", "Telegram support bot request failed.", 502);
  }
  return data.result as T;
}

export async function checkSupportBotConnection(): Promise<SupportStatus> {
  const token = supportToken();
  const secret = supportWebhookSecret();
  const settings = await getSupportBotSettings();
  if (!token || !supportBotTokenSafe(token)) {
    cachedConnection = null;
    return supportBotStatus(settings.enabled);
  }
  const checkedAt = new Date().toISOString();
  try {
    const identity = parseSupportBotIdentity(await supportTelegramCall<unknown>(token, "getMe", {}));
    if (!identity) throw new SupportBotError("SUPPORT_BOT_IDENTITY_INVALID", "Telegram returned an invalid support bot identity.", 502);
    const info = await supportTelegramCall<{ url?: unknown }>(token, "getWebhookInfo", {});
    const webhookUrl = safePublicWebhookUrl(info?.url);
    const expectedUrl = expectedSupportWebhookUrl();
    cachedConnection = {
      tokenDigest: fingerprint(token),
      webhookSecretDigest: fingerprint(secret),
      connected: true,
      username: identity.username,
      webhookUrl,
      webhookRegistered: Boolean(expectedUrl && info?.url === expectedUrl),
      checkedAt,
      error: null,
    };
  } catch (error) {
    cachedConnection = {
      tokenDigest: fingerprint(token),
      webhookSecretDigest: fingerprint(secret),
      connected: false,
      username: null,
      webhookUrl: null,
      webhookRegistered: false,
      checkedAt,
      error: error instanceof SupportBotError ? error.message : "Telegram support bot request failed.",
    };
  }
  return supportBotStatus(settings.enabled);
}

export async function registerSupportBotWebhook(): Promise<SupportStatus> {
  if (!supportBotRegistrationAllowed()) {
    throw new SupportBotError("SUPPORT_BOT_REGISTRATION_NOT_ALLOWED", "Webhook registration is available only on the trusted production deployment.", 400);
  }
  const token = supportToken();
  const secret = supportWebhookSecret();
  const settings = await getSupportBotSettings();
  const webhookUrl = expectedSupportWebhookUrl();
  if (!settings.enabled || !webhookUrl || !supportBotCredentialsSafe(token, secret)) {
    throw new SupportBotError("SUPPORT_BOT_CONFIGURATION_INCOMPLETE", "Enable the support bot and configure distinct support bot credentials before registering its webhook.", 400);
  }
  cachedConnection = null;
  const identity = parseSupportBotIdentity(await supportTelegramCall<unknown>(token, "getMe", {}));
  if (!identity) throw new SupportBotError("SUPPORT_BOT_IDENTITY_INVALID", "Telegram returned an invalid support bot identity.", 502);
  await supportTelegramCall(token, "setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    max_connections: 20,
  });
  await supportTelegramCall(token, "setMyCommands", {
    commands: [
      { command: "start", description: "Start QuickXchange Support" },
      { command: "menu", description: "Browse support topics" },
      { command: "help", description: "Get support options" },
    ],
  });
  await supportTelegramCall(token, "setMyName", { name: "QuickXchange Support" });
  await supportTelegramCall(token, "setMyDescription", {
    description: "QuickXchange customer support. Browse approved help topics or contact our support team.",
  });
  const webhookInfo = await supportTelegramCall<{ url?: unknown }>(token, "getWebhookInfo", {});
  const confirmedWebhookUrl = safePublicWebhookUrl(webhookInfo?.url);
  if (webhookInfo?.url !== webhookUrl || confirmedWebhookUrl !== webhookUrl) {
    throw new SupportBotError("SUPPORT_BOT_WEBHOOK_CONFIRMATION_FAILED", "Telegram did not confirm the registered support webhook URL.", 502);
  }
  const attestedAt = new Date();
  const [attested] = await db.update(telegramSupportBotSettingsTable).set({
    webhookAttestedTokenDigest: fingerprint(token),
    webhookAttestedSecretDigest: fingerprint(secret),
    webhookAttestedUrl: webhookUrl,
    webhookAttestedAt: attestedAt,
  }).where(eq(telegramSupportBotSettingsTable.id, "global"))
    .returning({ id: telegramSupportBotSettingsTable.id });
  if (!attested) {
    throw new SupportBotError("SUPPORT_BOT_ATTESTATION_UNAVAILABLE", "Support bot registration evidence could not be saved.", 500);
  }
  cachedConnection = {
    tokenDigest: fingerprint(token),
    webhookSecretDigest: fingerprint(secret),
    connected: true,
    username: identity.username,
    webhookUrl: confirmedWebhookUrl,
    webhookRegistered: true,
    checkedAt: new Date().toISOString(),
    error: null,
  };
  return supportBotStatus(true);
}

export async function getSupportBotSettings(): Promise<SupportSettings> {
  const [saved] = await db.select({ settings: telegramSupportBotSettingsTable.settings })
    .from(telegramSupportBotSettingsTable)
    .where(eq(telegramSupportBotSettingsTable.id, "global"))
    .limit(1);
  if (saved) {
    try {
      return validateSupportBotSettings(saved.settings);
    } catch {
      throw new SupportBotError("SUPPORT_BOT_SETTINGS_INVALID", "Saved support bot settings need Owner review.", 500);
    }
  }
  await db.insert(telegramSupportBotSettingsTable).values({
    id: "global",
    settings: DEFAULT_SUPPORT_BOT_SETTINGS,
    revision: 1,
  }).onConflictDoNothing();
  const [created] = await db.select({ settings: telegramSupportBotSettingsTable.settings })
    .from(telegramSupportBotSettingsTable)
    .where(eq(telegramSupportBotSettingsTable.id, "global"))
    .limit(1);
  if (!created) throw new SupportBotError("SUPPORT_BOT_SETTINGS_UNAVAILABLE", "Support bot settings are unavailable.", 500);
  return validateSupportBotSettings(created.settings);
}

export async function saveSupportBotSettings(value: unknown, updatedBy: string): Promise<SupportSettings> {
  const settings = validateSupportBotSettings(value);
  const current = await getSupportBotSettings();
  const enablingContact = settings.contactSupportEnabled && !current.contactSupportEnabled;
  if ((settings.enabled || enablingContact) && settings.contactSupportEnabled && !settings.supportUrl) {
    throw new SupportBotError("SUPPORT_BOT_CONTACT_URL_REQUIRED", "Configure a Telegram support username before enabling Contact Support.");
  }
  if (settings.enabled && !supportBotCredentialsSafe()) {
    throw new SupportBotError("SUPPORT_BOT_CREDENTIALS_REQUIRED", "Configure a distinct support bot token and webhook secret before enabling the support bot.");
  }
  await db.update(telegramSupportBotSettingsTable).set({
    settings,
    updatedBy,
    revision: sql`${telegramSupportBotSettingsTable.revision} + 1`,
    updatedAt: new Date(),
  }).where(eq(telegramSupportBotSettingsTable.id, "global"));
  return settings;
}

export function webhookSecretMatches(provided: string | undefined): boolean {
  const expected = supportWebhookSecret();
  if (!provided || !supportWebhookSecretSafe(expected)) return false;
  const suppliedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

const humanEscalationPatterns: RegExp[] = [
  /\b(?:human|agent|person|representative|live support|speak to|talk to|real person|contact support|support)\b/i,
  /\b(?:support agent|service client|conseiller|conseillère|parler à|parler au|une personne|contacter le support|assistance)\b/i,
  /(?:مساعدة بشرية|موظف دعم|تحدث إلى|التحدث إلى|الدعم البشري|الدعم)/u,
  /\b(?:agente|persona real|hablar con|hablar a|atención humana|soporte humano|soporte)\b/i,
  /\b(?:mitarbeiter|mensch|mit einer person|mit dem support sprechen|kundenservice|support)\b/i,
  /(?:оператор|живой человек|поговорить с|сотрудник поддержки|поддержка)/u,
  /(?:оператор|жива людина|поговорити з|працівник підтримки|підтримка)/u,
  /(?:상담원|사람과 상담|직원 연결|상담원 연결|지원)/u,
];

export function isHumanSupportRequest(text: string): boolean {
  return humanEscalationPatterns.some((pattern) => pattern.test(text));
}

export function exactApprovedFaqMatch(settings: SupportSettings, text: string, locale: SupportLocale): string | null {
  if (!settings.automaticRepliesEnabled || isHumanSupportRequest(text)) return null;
  const normalized = normalizeSupportQuestion(text);
  if (!normalized) return null;
  const activeCategories = new Set(settings.categories.filter((category) => category.enabled).map((category) => category.id));
  const matches: string[] = [];
  for (const faq of settings.faqs) {
    if (!faq.approved || !activeCategories.has(faq.categoryId)) continue;
    const phrases = [faq.translations[locale], faq.translations.en]
      .filter((translation): translation is NonNullable<typeof translation> => Boolean(translation))
      .flatMap((translation) => [translation.question, ...translation.aliases]);
    if (phrases.some((phrase) => normalizeSupportQuestion(phrase) === normalized)) matches.push(faq.id);
  }
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function planSupportBotAction(input: {
  settings: SupportSettings;
  chatId: string;
  locale: SupportLocale;
  text?: string;
  callbackData?: string;
  callbackQueryId?: string;
}): SupportAction {
  const { settings, chatId, locale, callbackData, callbackQueryId } = input;
  const base = { chatId, locale, callbackQueryId: callbackQueryId ?? null };
  if (callbackData === "start" || callbackData === "menu" || callbackData === "help") return { ...base, kind: "welcome" };
  const category = callbackData?.match(/^category:([a-z0-9][a-z0-9_-]{0,63})$/)?.[1];
  if (category) return { ...base, kind: "category", faqId: category };
  const faq = callbackData?.match(/^faq:([a-z0-9][a-z0-9_-]{0,63})$/)?.[1];
  if (faq) return { ...base, kind: "faq", faqId: faq };
  if (callbackData) return { ...base, kind: "fallback" };
  const text = input.text ?? "";
  if (/^\/(?:start|menu|help)(?:@\w+)?(?:\s|$)/i.test(text.trim())) return { ...base, kind: "welcome" };
  if (isHumanSupportRequest(text)) return { ...base, kind: "fallback" };
  const faqId = exactApprovedFaqMatch(settings, text, locale);
  return faqId ? { ...base, kind: "faq", faqId } : { ...base, kind: "fallback" };
}

const fallbackCopy: Record<SupportLocale, string> = {
  en: "Thanks for contacting QuickXchange Support. I could not find an approved answer for this request. Our support team can help you further.",
  fr: "Merci d’avoir contacté le support QuickXchange. Je n’ai pas trouvé de réponse approuvée pour cette demande. Notre équipe peut vous aider.",
  ar: "شكراً لتواصلك مع دعم QuickXchange. لم أجد إجابة معتمدة لهذا الطلب. يمكن لفريق الدعم مساعدتك.",
  es: "Gracias por contactar con el soporte de QuickXchange. No encontré una respuesta aprobada para esta consulta. Nuestro equipo puede ayudarte.",
  de: "Danke, dass du den QuickXchange-Support kontaktierst. Dafür gibt es keine freigegebene Antwort. Unser Support-Team hilft dir gerne weiter.",
  ru: "Спасибо, что обратились в поддержку QuickXchange. Для этого запроса нет одобренного ответа. Наша команда поможет вам.",
  uk: "Дякуємо, що звернулися до підтримки QuickXchange. Для цього запиту немає схваленої відповіді. Наша команда допоможе вам.",
  ko: "QuickXchange 고객 지원에 문의해 주셔서 감사합니다. 이 요청에 대한 승인된 답변이 없습니다. 지원팀이 도와드리겠습니다.",
};
const contactLabels: Record<SupportLocale, string> = {
  en: "Contact Support", fr: "Contacter le support", ar: "تواصل مع الدعم", es: "Contactar con soporte",
  de: "Support kontaktieren", ru: "Связаться с поддержкой", uk: "Зв’язатися з підтримкою", ko: "고객 지원 문의",
};
const backLabels: Record<SupportLocale, string> = {
  en: "Back to topics", fr: "Retour aux sujets", ar: "العودة إلى المواضيع", es: "Volver a los temas",
  de: "Zurück zu Themen", ru: "К темам", uk: "До тем", ko: "주제로 돌아가기",
};
const chooseTopicLabels: Record<SupportLocale, string> = {
  en: "Choose a support topic:", fr: "Choisissez un sujet :", ar: "اختر موضوع دعم:", es: "Elige un tema de soporte:",
  de: "Wähle ein Support-Thema:", ru: "Выберите тему поддержки:", uk: "Оберіть тему підтримки:", ko: "지원 주제를 선택하세요:",
};

export type RenderedSupportReply = {
  text: string;
  keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
};

function contactButton(settings: SupportSettings, locale: SupportLocale) {
  return settings.contactSupportEnabled && settings.supportUrl
    ? [[{ text: contactLabels[locale], url: settings.supportUrl }]]
    : undefined;
}

export function renderSupportBotReply(settings: SupportSettings, action: SupportAction): RenderedSupportReply | null {
  if (!settings.enabled) return null;
  const locale = action.locale;
  const safeAction = action.kind === "faq" && !settings.automaticRepliesEnabled
    ? { ...action, kind: "fallback" as const }
    : action;
  if (safeAction.kind === "welcome" || safeAction.kind === "menu") {
    const categories = settings.categories.filter((category) => category.enabled);
    const keyboard = categories.map((category) => [{
      text: category.label[locale] ?? category.label.en ?? category.id,
      callback_data: `category:${category.id}`,
    }]);
    const contact = contactButton(settings, locale);
    return {
      text: `${settings.welcomeMessages[locale] ?? settings.welcomeMessages.en}\n\n${chooseTopicLabels[locale]}`,
      keyboard: [...keyboard, ...(contact ?? [])],
    };
  }
  if (safeAction.kind === "category") {
    const category = settings.categories.find((item) => item.id === safeAction.faqId && item.enabled);
    if (!category) return { text: fallbackCopy[locale], keyboard: contactButton(settings, locale) };
    const faqs = settings.faqs.filter((faq) => faq.approved && faq.categoryId === category.id);
    const keyboard = faqs.map((faq) => [{
      text: faq.translations[locale]?.question ?? faq.translations.en?.question ?? "QuickXchange FAQ",
      callback_data: `faq:${faq.id}`,
    }]);
    keyboard.push([{ text: backLabels[locale], callback_data: "menu" }]);
    const contact = contactButton(settings, locale);
    return {
      text: `${category.label[locale] ?? category.label.en ?? category.id}\n\n${chooseTopicLabels[locale]}`,
      keyboard: [...keyboard, ...(contact ?? [])],
    };
  }
  if (safeAction.kind === "faq") {
    const faq = settings.faqs.find((candidate) => candidate.id === safeAction.faqId);
    const category = faq && settings.categories.find((item) => item.id === faq.categoryId && item.enabled);
    if (!faq?.approved || !category || !settings.automaticRepliesEnabled) {
      return { text: fallbackCopy[locale], keyboard: contactButton(settings, locale) };
    }
    const answer = faq.translations[locale]?.answer ?? faq.translations.en?.answer;
    if (!answer) return { text: fallbackCopy[locale], keyboard: contactButton(settings, locale) };
    const keyboard = [[{ text: backLabels[locale], callback_data: `category:${faq.categoryId}` }]];
    const contact = contactButton(settings, locale);
    return { text: answer, keyboard: [...keyboard, ...(contact ?? [])] };
  }
  return { text: fallbackCopy[locale], keyboard: contactButton(settings, locale) };
}

export function safeSupportApiError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof SupportBotError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return { code: "SUPPORT_BOT_UNAVAILABLE", message: "Support bot operation failed.", status: 500 };
}

export function generateSupportClaimToken(): string {
  return randomUUID();
}

export async function dispatchSupportBotAction(
  action: SupportAction,
  expectedBotId: string,
  claim: { id: string; claimToken: string },
): Promise<void> {
  const token = supportToken();
  if (tokenBotId(token) !== expectedBotId) {
    throw new SupportBotError("SUPPORT_BOT_CREDENTIAL_ROTATED", "Support bot credentials changed before delivery.", 409);
  }
  if (!supportBotCredentialsSafe(token, supportWebhookSecret())) {
    throw new SupportBotError("SUPPORT_BOT_CREDENTIALS_UNAVAILABLE", "Support bot credentials are not available for delivery.", 503);
  }
  const deadlineAt = Date.now() + SUPPORT_DELIVERY_DEADLINE_MS;
  await db.transaction(async (tx) => {
    // Acquire locks in settings-then-outbox order. The settings lock preserves
    // the approved FAQ snapshot; the claimed outbox row lock fences delivery
    // against another worker reclaiming a lease while Telegram is in flight.
    const [saved] = await tx.select({ settings: telegramSupportBotSettingsTable.settings })
      .from(telegramSupportBotSettingsTable)
      .where(eq(telegramSupportBotSettingsTable.id, "global"))
      .limit(1)
      .for("share");
    const claimWhere = and(
      eq(telegramSupportBotOutboxTable.id, claim.id),
      eq(telegramSupportBotOutboxTable.claimToken, claim.claimToken),
      eq(telegramSupportBotOutboxTable.deliveryStatus, "sending"),
      sql`${telegramSupportBotOutboxTable.claimExpiresAt} > clock_timestamp()`,
    );
    const [lockedClaim] = await tx.update(telegramSupportBotOutboxTable)
      .set({
        claimExpiresAt: sql`clock_timestamp() + (${SUPPORT_OUTBOX_LEASE_MS} * interval '1 millisecond')`,
      })
      .where(claimWhere)
      .returning({ id: telegramSupportBotOutboxTable.id });
    if (!lockedClaim) {
      throw new SupportBotError("SUPPORT_BOT_CLAIM_LOST", "Support bot delivery claim expired before send.", 409);
    }
    const settings = saved ? validateSupportBotSettings(saved.settings) : DEFAULT_SUPPORT_BOT_SETTINGS;
    if (!settings.enabled) {
      await tx.update(telegramSupportBotOutboxTable).set({
        deliveryStatus: "delivered",
        lastErrorCode: "",
        deliveredAt: new Date(),
        claimToken: null,
        claimExpiresAt: null,
      }).where(and(
        eq(telegramSupportBotOutboxTable.id, claim.id),
        eq(telegramSupportBotOutboxTable.claimToken, claim.claimToken),
        eq(telegramSupportBotOutboxTable.deliveryStatus, "sending"),
      ));
      return;
    }
    if (action.callbackQueryId) {
      try {
        await supportTelegramCall(token, "answerCallbackQuery", {
          callback_query_id: action.callbackQueryId,
          text: "QuickXchange Support",
        }, deadlineAt);
      } catch (error) {
        const errorCode = error instanceof SupportBotError &&
          /^[A-Z0-9_]{1,80}$/.test(error.code)
          ? error.code
          : "SUPPORT_BOT_CALLBACK_ACK_FAILED";
        logger.warn({
          code: errorCode,
        }, "Telegram support callback acknowledgement failed");
      }
    }
    const reply = renderSupportBotReply(settings, action);
    if (!reply) {
      await tx.update(telegramSupportBotOutboxTable).set({
        deliveryStatus: "delivered",
        lastErrorCode: "",
        deliveredAt: new Date(),
        claimToken: null,
        claimExpiresAt: null,
      }).where(and(
        eq(telegramSupportBotOutboxTable.id, claim.id),
        eq(telegramSupportBotOutboxTable.claimToken, claim.claimToken),
        eq(telegramSupportBotOutboxTable.deliveryStatus, "sending"),
      ));
      return;
    }
    const [stillClaimed] = await tx.update(telegramSupportBotOutboxTable)
      .set({
        claimExpiresAt: sql`clock_timestamp() + (${SUPPORT_OUTBOX_LEASE_MS} * interval '1 millisecond')`,
      })
      .where(claimWhere)
      .returning({ id: telegramSupportBotOutboxTable.id });
    if (!stillClaimed) {
      throw new SupportBotError("SUPPORT_BOT_CLAIM_LOST", "Support bot delivery claim expired before send.", 409);
    }
    const replyMarkup = reply.keyboard?.length
      ? { inline_keyboard: reply.keyboard }
      : undefined;
    await supportTelegramCall(token, "sendMessage", {
      chat_id: action.chatId,
      text: reply.text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }, deadlineAt);
    await tx.update(telegramSupportBotOutboxTable).set({
      deliveryStatus: "delivered",
      lastErrorCode: "",
      deliveredAt: new Date(),
      claimToken: null,
      claimExpiresAt: null,
    }).where(and(
      eq(telegramSupportBotOutboxTable.id, claim.id),
      eq(telegramSupportBotOutboxTable.claimToken, claim.claimToken),
      eq(telegramSupportBotOutboxTable.deliveryStatus, "sending"),
    ));
  });
}