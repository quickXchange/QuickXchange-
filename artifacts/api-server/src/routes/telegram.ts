import { Router, type IRouter, type Request } from "express";
import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, ordersTable, quickexOrdersTable, telegramChatsTable, telegramNotificationOutboxTable, telegramOrderLinksTable, telegramProcessedUpdatesTable, telegramWizardSessionsTable } from "@workspace/db";
import { editTelegramMessage, formatTelegramOrderId, sendTelegramMessage, sendTelegramPhoto, telegramCall, telegramEnabled, type TelegramButton } from "../lib/telegram-api";
import { languageButtons, localeOf, t, type TelegramLocale } from "../lib/telegram-localization";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { signOrderTrackingToken } from "../lib/order-access";
import { buildCreatePayload, buildQuotePayload, buildTelegramConvertOptions, filterConvertTargets, filterManualSourceOptions, filterManualTargets, filterTelegramRouteOptions, nextRequiredField, nextSourceAmountForReceiveTarget, requiredFieldActive, shouldAskDestination, telegramFieldSkipIndex, withoutTelegramRefundFields, type TelegramConvertInstrument, type TelegramRouteOption } from "../lib/telegram-wizard";
import { createTelegramLinkChallenge } from "../lib/telegram-link";
import { AdminTelegramLinkChallengeError, consumeAdminTelegramLinkChallenge } from "../lib/admin-telegram-link";
import { getCustomerVerifiedEmail, requireActiveCustomerIdentity } from "../lib/customer-auth";
import { getCustomerOrderHistory } from "../lib/order-history";
import { logger } from "../lib/logger";
import {
  adminSwapTelegramRecipientIsCurrent,
  formatSwapTelegramNotification,
  swapTelegramStatusLabel,
  swapTelegramRecipientIsCurrent,
  type SwapTelegramEventKind,
  type SwapTelegramNotificationPayload,
} from "../lib/telegram-swap-notifications";
import {
  convertTelegramRecipientIsCurrent,
  convertTelegramStatusLabel,
  enqueueConvertTelegramMilestones,
  formatConvertTelegramNotification,
  type ConvertNotificationPayload,
} from "../lib/telegram-convert-notifications";

const router: IRouter = Router();
export const telegramManualOrderKinds = ["manual", "swap"] as const;
const website = () => process.env.TELEGRAM_WEBSITE_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim();
const miniAppUrl = () => {
  const configured = process.env.TELEGRAM_MINI_APP_URL?.trim();
  if (configured) return configured;
  const publicWebsite = website();
  return publicWebsite ? `${publicWebsite.replace(/\/+$/, "")}/telegram-mini-app/` : undefined;
};
const html = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const baseUrl = () => `http://127.0.0.1:${process.env.PORT ?? "8080"}`;
const adminOrderUrl = (orderId: string) => {
  const configured = process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || "";
  return /^https:\/\//i.test(configured)
    ? `${configured}/admin/orders/${encodeURIComponent(orderId)}`
    : undefined;
};
export const telegramSecretMatches = (provided: string | undefined) => {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
export function telegramUpdateIdValid(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
export function telegramWebhookDisposition(enabled: boolean, secretValid: boolean, alreadyProcessed: boolean) {
  if (!enabled) return 404;
  if (!secretValid) return 401;
  return alreadyProcessed ? 200 : 202;
}
export function telegramCreateState(state: string) {
  return state === "review" ? "processing" : state;
}
export function telegramPrivateUpdate(update: Update) {
  const chat = update.message?.chat ?? update.callback_query?.message?.chat;
  return chat?.type === "private" && typeof (update.message?.from?.id ?? update.callback_query?.from?.id) === "number";
}
export function telegramInboxDisposition(status: string, leaseExpired: boolean) {
  if (status === "completed") return "ack";
  if (status === "processing" && !leaseExpired) return "retry";
  return "claim";
}
export function telegramNextChatCursor(lastChatId: string | undefined, pageSize: number, returned: number) {
  return returned < pageSize ? undefined : lastChatId;
}
export function telegramAdvisoryChatKey(chatId: string) {
  if (!/^-?\d+$/.test(chatId)) throw new Error("Invalid Telegram chat id");
  return chatId;
}
export function shouldApplyUpdate(lastAppliedUpdateId: string | null | undefined, updateId: string) {
  return !lastAppliedUpdateId || lastAppliedUpdateId !== updateId;
}
export function reconciliationClaimEligible(state: string, claimExpiresAt: Date | null | undefined, now: Date) {
  return state === "processing" && (!claimExpiresAt || claimExpiresAt <= now);
}
export function reconciliationWinnerTransition(claimed: boolean, found: boolean) {
  return claimed && found;
}
export function telegramCreateRetryDecision(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "review" : "processing";
}
export function telegramCreationOutboxPayload(orderId: string, orderKind: string, result: Record<string, unknown>, trackingToken = "", requiresDeposit = false) {
  return {
    eventKind: "order_created",
    orderId,
    orderKind,
    trackingToken,
    requiresDeposit,
    status: result.status,
    statusVersion: Number(result.statusVersion ?? result.recordVersion ?? 0),
    depositAddress: result.depositAddress,
    depositMemo: result.depositMemo,
    amount: result.amount,
    receiveAmount: result.receiveAmount,
  };
}
export function telegramCreatingOrderMessage() {
  return "⏳ <b>Creating your order...</b>";
}
export function telegramOrderCreatedMessage(
  orderId: string,
  status: unknown,
  locale: TelegramLocale = "en",
  deposit?: { address: string; memo?: string },
) {
  return [
    `✅ <b>${t(locale, "order")} created</b>`,
    "",
    formatTelegramOrderId(orderId),
    "",
    `${t(locale, "status")}: <b>${html(status ?? "updated")}</b>`,
    ...(deposit ? [
      `${t(locale, "deposit")}: <code>${html(deposit.address)}</code>`,
      ...(deposit.memo ? [`${t(locale, "memo")}: <code>${html(deposit.memo)}</code>`] : []),
    ] : []),
  ].join("\n");
}
export function telegramOrderStatusMessage(orderId: string, status: unknown, locale: TelegramLocale = "en") {
  return [
    "🔔 <b>QuickXchange order update</b>",
    "",
    formatTelegramOrderId(orderId),
    "",
    `${t(locale, "status")}: <b>${html(status ?? "updated")}</b>`,
  ].join("\n");
}
export function telegramRequiresDeposit(orderKind: string, sourceKind?: string) {
  return orderKind === "convert" || sourceKind === "crypto-network";
}
export function telegramCreationDeliveryDecision(requiresDeposit: boolean, hasAddress: boolean) {
  if (requiresDeposit && !hasAddress) return "refresh";
  return hasAddress ? "photo" : "message";
}
export class DepositInstructionsPending extends Error {
  constructor(message = "Deposit instructions are not available yet") {
    super(message);
    this.name = "DepositInstructionsPending";
  }
}
export function telegramOutboxFailureDisposition(error: unknown, attemptCount: number) {
  if (error instanceof DepositInstructionsPending) return "pending";
  return attemptCount >= 5 ? "failed" : "pending";
}
const telegramContext = new AsyncLocalStorage<{ updateId: string }>();
export function telegramDepositInstruction(status: Record<string, unknown>) {
  const address = typeof status.depositAddress === "string" ? status.depositAddress.trim() : "";
  return address && address !== "undefined" ? { address, memo: typeof status.depositMemo === "string" ? status.depositMemo : undefined } : undefined;
}
async function withTelegramChatLock<T>(chatId: string, handler: () => Promise<T>) {
  telegramAdvisoryChatKey(chatId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chatId}))`);
    return handler();
  });
}
type Update = {
  update_id?: number;
  message?: { chat?: { id?: number | string; type?: string }; from?: { id?: number; language_code?: string; first_name?: string; username?: string }; text?: string };
  callback_query?: { id?: string; data?: string; message?: { message_id?: number; chat?: { id?: number | string; type?: string } }; from?: { id?: number; language_code?: string; first_name?: string; username?: string } };
};
type TelegramFrom = { id?: number; language_code?: string; first_name?: string; username?: string };
export const menu = (locale: TelegramLocale, linked = false): TelegramButton[][] => [
  [{ text: `⚡ ${t(locale, "exchange")}`, callback_data: "exchange" }, { text: `📦 ${t(locale, "track")}`, callback_data: "track" }],
  [{ text: `📋 ${t(locale, "orders")}`, callback_data: "orders" }, { text: linked ? "👤 My Account" : "👤 Sign In", callback_data: linked ? "account" : "signin" }],
  linked
    ? [{ text: "🚪 Sign Out", callback_data: "signout" }, { text: `🌐 ${t(locale, "language")}`, callback_data: "language" }]
    : [{ text: "📝 Sign Up", callback_data: "signup" }, { text: `🌐 ${t(locale, "language")}`, callback_data: "language" }],
  [{ text: `💬 ${t(locale, "support")}`, callback_data: "support" }, website()
    ? { text: `🌍 ${t(locale, "website")}`, url: website()! }
    : { text: `🌍 ${t(locale, "website")} unavailable`, callback_data: "website_unavailable" }],
  ...(miniAppUrl() ? [[{ text: "📱 Open App", web_app: { url: miniAppUrl()! } }]] : []),
];
async function chatFor(chatId: string, from: TelegramFrom | undefined) {
  const locale = localeOf(from?.language_code);
  await db.insert(telegramChatsTable).values({ chatId, userId: String(from?.id ?? chatId), username: from?.username ?? null, firstName: from?.first_name ?? null, locale })
    .onConflictDoUpdate({ target: telegramChatsTable.chatId, set: { username: from?.username ?? null, firstName: from?.first_name ?? null, updatedAt: new Date() } });
  const [chat] = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.chatId, chatId)).limit(1);
  return chat;
}
async function saveSession(chatId: string, state: string, data: Record<string, unknown>) {
  const updateId = telegramContext.getStore()?.updateId;
  const safeData = withoutTelegramRefundFields(data);
  await db.insert(telegramWizardSessionsTable).values({ chatId, state, data: safeData, lastAppliedUpdateId: updateId ?? null, expiresAt: new Date(Date.now() + 30 * 60_000) })
    .onConflictDoUpdate({ target: telegramWizardSessionsTable.chatId, set: { state, data: safeData, ...(updateId ? { lastAppliedUpdateId: updateId } : {}), expiresAt: new Date(Date.now() + 30 * 60_000), updatedAt: new Date() } });
}
async function getSession(chatId: string) {
  const [row] = await db.select().from(telegramWizardSessionsTable).where(and(eq(telegramWizardSessionsTable.chatId, chatId), gte(telegramWizardSessionsTable.expiresAt, new Date()))).limit(1);
  return row;
}
async function mainMenu(chatId: string, locale: TelegramLocale) {
     const [chat] = await db.select({ linked: telegramChatsTable.clerkCustomerUserId }).from(telegramChatsTable).where(eq(telegramChatsTable.chatId, chatId)).limit(1);
     await sendTelegramMessage(chatId, `${t(locale, "welcome")}\n\n${t(locale, "choose")}`, menu(locale, Boolean(chat?.linked)));
}
async function sendBrowserLink(chatId: string, locale: TelegramLocale, intent: "signin" | "signup") {
  const chat = await db.select({ userId: telegramChatsTable.userId }).from(telegramChatsTable).where(eq(telegramChatsTable.chatId, chatId)).limit(1);
  const token = await createTelegramLinkChallenge(chatId, String(chat[0]?.userId ?? chatId), intent);
  const target = website();
  if (!target) {
    await sendTelegramMessage(chatId, "Website account linking is temporarily unavailable.");
    return;
  }
  const url = `${target.replace(/\/+$/, "")}/telegram/connect?token=${encodeURIComponent(token)}&intent=${intent}`;
  await sendTelegramMessage(chatId, intent === "signup"
    ? "Open the website to create your customer account and link Telegram."
    : "Open the website to sign in and link Telegram.", [[{ text: intent === "signup" ? "📝 Sign Up on website" : "🔐 Sign In on website", url }]]);
}
type SettlementOption = TelegramRouteOption & {
  assetId?: string;
  assetName?: string;
  title: string;
  direction: string;
  executionMode?: string;
  networkTitle?: string;
  paymentMethodId?: string;
  minAmount?: string;
  maxAmount?: string;
  fields?: Array<{ key: string; label: string; type: string; options?: Array<{ value: string; label: string }>; required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] }; min?: number; max?: number; pattern?: string }>;
};
type ConvertPair = { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string };
type RoutePricing = {
  rate: number;
  minAmount?: number;
  maxAmount?: number;
};
const TELEGRAM_OPTION_PAGE_SIZE = 8;

function optionLabel(option: SettlementOption) {
  return option.kind === "crypto-network"
    ? `${option.assetCode} · ${option.networkTitle || option.routeNetwork}`
    : `${option.assetCode} · ${option.title}`;
}

function optionPrompt(side: "source" | "target", query = "") {
  const heading = side === "source"
    ? "👇 Which currency or payment method do you send?"
    : "👇 Which currency or payment method do you receive?";
  const search = "Tap a button below or type a name to search.";
  return query
    ? `${heading}\n\n${search}\n\n🔎 Results for: <b>${html(query)}</b>`
    : `${heading}\n\n${search}`;
}

function optionRows(
  matches: SettlementOption[],
  allOptions: SettlementOption[],
  callbackPrefix: "src" | "tgt",
  page: number,
): TelegramButton[][] {
  const requestedPage = Number.isSafeInteger(page) && page >= 0 ? page : 0;
  const lastPage = Math.max(0, Math.ceil(matches.length / TELEGRAM_OPTION_PAGE_SIZE) - 1);
  const safePage = Math.min(requestedPage, lastPage);
  const start = safePage * TELEGRAM_OPTION_PAGE_SIZE;
  const rows: TelegramButton[][] = matches
    .slice(start, start + TELEGRAM_OPTION_PAGE_SIZE)
    .map(option => [{
      text: optionLabel(option),
      callback_data: `${callbackPrefix}:${allOptions.findIndex(candidate => candidate.id === option.id)}`,
    }]);
  const navigation: TelegramButton[] = [];
  if (start > 0) navigation.push({
    text: "⬅️ Back",
    callback_data: `${callbackPrefix}page:${safePage - 1}`,
  });
  if (start + TELEGRAM_OPTION_PAGE_SIZE < matches.length) navigation.push({
    text: "Next ➡️",
    callback_data: `${callbackPrefix}page:${safePage + 1}`,
  });
  if (navigation.length) rows.push(navigation);
  return rows;
}

async function showSourceOptions(
  chatId: string,
  sessionData: Record<string, unknown>,
  page = 0,
) {
  const options = (sessionData.options as SettlementOption[] | undefined) ?? [];
  const query = String(sessionData.sourceQuery ?? "");
  const matches = filterTelegramRouteOptions(options, query);
  const rows = optionRows(matches, options, "src", page);
  rows.push([{ text: "❌ Cancel Exchange", callback_data: "cancel" }]);
  await sendTelegramMessage(
    chatId,
    matches.length ? optionPrompt("source", query) : `${optionPrompt("source", query)}\n\nNo available options match your search.`,
    rows,
  );
}

async function showTargetOptions(
  chatId: string,
  sessionData: Record<string, unknown>,
  page = 0,
) {
  const targets = (sessionData.targets as SettlementOption[] | undefined) ?? [];
  const query = String(sessionData.targetQuery ?? "");
  const matches = filterTelegramRouteOptions(targets, query);
  const rows = optionRows(matches, targets, "tgt", page);
  rows.push([{ text: "❌ Cancel Exchange", callback_data: "cancel" }]);
  await sendTelegramMessage(
    chatId,
    matches.length ? optionPrompt("target", query) : `${optionPrompt("target", query)}\n\nNo available options match your search.`,
    rows,
  );
}

async function exchangeOptions(chatId: string, locale: TelegramLocale, mode: "swap" | "convert") {
  const response = await fetch(`${baseUrl()}/api/exchange/config`);
  if (!response.ok) { await sendTelegramMessage(chatId, t(locale, "unavailable")); return; }
  const config = await response.json() as {
    assets?: Array<{ id: string; name: string }>;
    settlementOptions?: SettlementOption[];
    manualRouteAvailability?: { routes?: Array<{ sourceSettlementOptionId: string; targetSettlementOptionId: string }> };
  };
  const assetNames = new Map((config.assets ?? []).map(asset => [asset.id, asset.name]));
  const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });
  const allOptions = (config.settlementOptions ?? []).map(option => ({
    ...option,
    assetName: option.kind === "fiat-payment-method"
      ? currencyNames.of(option.assetCode)
      : option.assetId ? assetNames.get(option.assetId) : undefined,
  }));
  const manualRoutes = config.manualRouteAvailability?.routes ?? [];
  let convertPairs: ConvertPair[] = [];
  let convertOptions: SettlementOption[] = [];
  if (mode === "convert") {
    const quickexResponse = await fetch(`${baseUrl()}/api/quickex/config`);
    if (quickexResponse.ok) {
      const quickex = await quickexResponse.json() as {
        instruments?: TelegramConvertInstrument[];
        pairs?: ConvertPair[];
      };
      convertPairs = quickex.pairs ?? [];
      convertOptions = buildTelegramConvertOptions(
        quickex.instruments ?? [],
        convertPairs,
      ) as SettlementOption[];
    }
  }
  const options = mode === "convert"
    ? convertOptions
    : filterManualSourceOptions(allOptions, manualRoutes);
  if (!options.length) { await sendTelegramMessage(chatId, t(locale, "unavailable")); return; }
  const data = {
    mode,
    options,
    allOptions: mode === "convert" ? convertOptions : allOptions,
    manualRoutes,
    convertPairs,
    sourceQuery: "",
    clientRequestId: randomUUID(),
  };
  await saveSession(chatId, "source", data);
  await showSourceOptions(chatId, data);
}
async function chooseTarget(chatId: string, locale: TelegramLocale, source: SettlementOption) {
  const session = await getSession(chatId);
  if (session?.state === "processing") {
    await sendTelegramMessage(chatId, t(locale, "processing"));
    return;
  }
  if (session?.state !== "source") return;
  const allOptions = (session.data.allOptions as SettlementOption[] | undefined) ?? [];
  let targets: SettlementOption[];
  if (session.data.mode === "convert") {
    targets = filterConvertTargets(
      allOptions,
      (session.data.convertPairs as ConvertPair[] | undefined) ?? [],
      source,
    ) as SettlementOption[];
  } else {
    targets = filterManualTargets(allOptions, (session.data.manualRoutes as Array<{ sourceSettlementOptionId: string; targetSettlementOptionId: string }> | undefined) ?? [], source.id) as SettlementOption[];
  }
  if (!targets.length) { await sendTelegramMessage(chatId, t(locale, "unavailable")); return; }
  const data = { ...session.data, source, targets, targetQuery: "" };
  await saveSession(chatId, "target", data);
  await sendTelegramMessage(chatId, `✅ You Send: <b>${html(optionLabel(source))}</b>`);
  await showTargetOptions(chatId, data);
}
async function askField(chatId: string, field: Record<string, unknown>, fieldIndex = 0, locale: TelegramLocale = "en", page = 0) {
  const label = String(field.label ?? field.key ?? "Required detail");
  const options = field.options as Array<{ value: string; label: string }> | undefined;
  const start = page * 20;
  const keyboard: TelegramButton[][] = options?.length
    ? options.slice(start, start + 20).map((option, index) => [{ text: `🔹 ${option.label}`, callback_data: `fieldopt:${fieldIndex}:${index + start}` }])
    : [];
  if (start > 0) keyboard.push([{ text: "⬅️ Back", callback_data: `fieldpage:${fieldIndex}:${page - 1}` }]);
  if (options && start + 20 < options.length) keyboard.push([{ text: "➡️ Next", callback_data: `fieldpage:${fieldIndex}:${page + 1}` }]);
  if (field.required === false) keyboard.push([{ text: `⏭️ ${t(locale, "skip")}`, callback_data: `fieldskip:${fieldIndex}` }]);
  await sendTelegramMessage(chatId, label, keyboard.length ? keyboard : undefined);
}
function validFieldValue(field: Record<string, unknown>, value: string) {
  const min = typeof field.min === "number" ? field.min : undefined;
  const max = typeof field.max === "number" ? field.max : undefined;
  const numeric = ["integer", "numeric", "decimal", "number"].includes(String(field.type));
  if (numeric && !Number.isFinite(Number(value))) return false;
  if (min !== undefined && Number(value) < min) return false;
  if (max !== undefined && Number(value) > max) return false;
  if (typeof field.pattern === "string") {
    try { if (!new RegExp(field.pattern).test(value)) return false; } catch { return false; }
  }
  return value.length > 0;
}
function displayNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not configured";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 10 }).format(numeric);
}

async function selectTarget(chatId: string, locale: TelegramLocale, target: SettlementOption) {
  const session = await getSession(chatId);
  if (!session || session.state !== "target") return;
  const source = session.data.source as SettlementOption | undefined;
  if (!source) return;

  let routePricing: RoutePricing | undefined;
  if (session.data.mode !== "convert") {
    const response = await fetch(
      `${baseUrl()}/api/exchange/route-pricing?sourceSettlementOptionId=${encodeURIComponent(source.id)}&targetSettlementOptionId=${encodeURIComponent(target.id)}`,
    );
    const result = await response.json() as RoutePricing & { error?: string };
    if (!response.ok) {
      await sendTelegramMessage(chatId, `QuickXchange could not load this route: ${html(result.error ?? "route unavailable")}`);
      return;
    }
    routePricing = result;
  }

  const min = routePricing?.minAmount ?? source.minAmount;
  const max = routePricing?.maxAmount ?? source.maxAmount;
  const rateText = routePricing
    ? `1 ${html(source.assetCode)} = ${html(displayNumber(routePricing.rate))} ${html(target.assetCode)}`
    : "Live rate confirmed after amount entry";
  const limitsText = `${min == null ? "No minimum" : `${html(displayNumber(min))} ${html(source.assetCode)}`} / ${max == null ? "No maximum" : `${html(displayNumber(max))} ${html(source.assetCode)}`}`;
  const data = { ...session.data, target, routePricing };
  await saveSession(chatId, "amountSide", data);
  await sendTelegramMessage(chatId, `✅ You Receive: <b>${html(optionLabel(target))}</b>`);
  await sendTelegramMessage(
    chatId,
    [
      `📤 You Send: <b>${html(optionLabel(source))}</b>`,
      `📥 You Receive: <b>${html(optionLabel(target))}</b>`,
      `📈 Exchange Rate: <b>${rateText}</b>`,
      `📊 Min / Max: <b>${limitsText}</b>`,
      "",
      "👇 Choose which side you want to use to enter the exchange amount",
    ].join("\n"),
    [
      [
        { text: source.assetCode, callback_data: "amountside:source" },
        { text: target.assetCode, callback_data: "amountside:target" },
      ],
      [{ text: "❌ Cancel Exchange", callback_data: "cancel" }],
    ],
  );
}

async function requestTelegramQuote(
  mode: "swap" | "convert",
  source: SettlementOption,
  target: SettlementOption,
  amount: number,
) {
  const type = mode === "convert" ? "instant" : "manual";
  const response = await fetch(`${baseUrl()}${type === "instant" ? "/api/quickex/quote" : "/api/exchange/quote"}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildQuotePayload(mode, source, target, amount)),
  });
  return {
    ok: response.ok,
    result: await response.json() as Record<string, unknown>,
  };
}

async function quoteTelegramEnteredAmount(
  sessionData: Record<string, unknown>,
  enteredAmount: number,
) {
  const source = sessionData.source as SettlementOption;
  const target = sessionData.target as SettlementOption;
  const mode = sessionData.mode === "convert" ? "convert" : "swap";
  if (sessionData.amountSide !== "target") {
    const quoted = await requestTelegramQuote(mode, source, target, enteredAmount);
    return { ...quoted, amount: enteredAmount };
  }

  const previewRate = Number((sessionData.routePricing as RoutePricing | undefined)?.rate);
  let sourceAmount = Number.isFinite(previewRate) && previewRate > 0
    ? enteredAmount / previewRate
    : 1;
  let latest: Awaited<ReturnType<typeof requestTelegramQuote>> | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    latest = await requestTelegramQuote(mode, source, target, sourceAmount);
    if (!latest.ok) return { ...latest, amount: sourceAmount };
    const quotedReceiveAmount = Number(latest.result.receiveAmount);
    if (!Number.isFinite(quotedReceiveAmount) || quotedReceiveAmount <= 0) {
      return { ok: false, result: { error: "The route returned an invalid receive amount." }, amount: sourceAmount };
    }
    const tolerance = Math.max(1e-8, enteredAmount * 0.0001);
    if (Math.abs(quotedReceiveAmount - enteredAmount) <= tolerance) {
      return { ...latest, amount: Number(latest.result.amount ?? sourceAmount) };
    }
    const next = nextSourceAmountForReceiveTarget(sourceAmount, quotedReceiveAmount, enteredAmount);
    if (!next || next === sourceAmount) break;
    sourceAmount = next;
  }
  return {
    ok: false,
    result: { error: "The live quote could not match the requested receive amount. Please try again." },
    amount: sourceAmount,
  };
}

async function sendOrders(chatId: string, locale: TelegramLocale) {
  const [linked] = await db.select({ customerClerkUserId: telegramChatsTable.clerkCustomerUserId })
    .from(telegramChatsTable).where(eq(telegramChatsTable.chatId, chatId)).limit(1);
  if (linked?.customerClerkUserId) {
    const email = await getCustomerVerifiedEmail(linked.customerClerkUserId);
    await requireActiveCustomerIdentity(linked.customerClerkUserId, email);
    const owned = await getCustomerOrderHistory(linked.customerClerkUserId, 10);
    if (!owned.length) { await sendTelegramMessage(chatId, t(locale, "noOrders")); return; }
    const buttons = owned.map(item => [{ text: `🔎 ${item.id}`, url: website() ? `${website()!.replace(/\/+$/, "")}/account/orders/${encodeURIComponent(item.id)}` : undefined, callback_data: website() ? undefined : "website_unavailable" }]);
    await sendTelegramMessage(chatId, owned.map(item => [
      formatTelegramOrderId(item.id),
      `${t(locale, "status")}: <b>${html(item.type === "manual" ? swapTelegramStatusLabel(item.status) : item.type === "instant" ? convertTelegramStatusLabel(item.status) : item.status)}</b>`,
    ].join("\n")).join("\n\n"), buttons);
    return;
  }
  const links = await db.select().from(telegramOrderLinksTable).where(eq(telegramOrderLinksTable.chatId, chatId)).orderBy(telegramOrderLinksTable.createdAt).limit(10);
  if (!links.length) { await sendTelegramMessage(chatId, t(locale, "noOrders")); return; }
  const lines: string[] = [];
  const buttons: TelegramButton[][] = [];
  for (let index = 0; index < links.length; index += 1) {
    const item = links[index];
    const path = item.orderKind === "convert" ? "/api/quickex/orders" : "/api/orders";
    const response = await fetch(`${baseUrl()}${path}/${encodeURIComponent(item.orderId)}/status?trackingToken=${encodeURIComponent(item.trackingToken)}`);
    const result = await response.json() as Record<string, unknown>;
    lines.push([
      formatTelegramOrderId(item.orderId),
      response.ok
        ? `${t(locale, "status")}: <b>${html(item.orderKind === "convert" ? convertTelegramStatusLabel(String(result.status ?? "")) : swapTelegramStatusLabel(String(result.status ?? "")))}</b>`
        : `${t(locale, "status")}: <b>unavailable</b>`,
    ].join("\n"));
    buttons.push([{ text: `🔎 Track ${item.orderId}`, callback_data: `order:${index}` }]);
  }
  await sendTelegramMessage(chatId, lines.join("\n"), buttons);
}
async function sendDepositInstructions(chatId: string, orderId: string, orderKind: string, trackingToken: string, known?: Record<string, unknown>) {
  const status = known ?? await (async () => {
    const path = orderKind === "convert" ? "/api/quickex/orders" : "/api/orders";
    const response = await fetch(`${baseUrl()}${path}/${encodeURIComponent(orderId)}/status?trackingToken=${encodeURIComponent(trackingToken)}`);
    return response.ok ? await response.json() as Record<string, unknown> : {};
  })();
  const deposit = telegramDepositInstruction(status);
  if (!deposit) return;
  const memo = deposit.memo ? `\n${html(t("en", "memo"))}: <code>${html(deposit.memo)}</code>` : "";
  await sendTelegramPhoto(chatId, deposit.address, `${formatTelegramOrderId(orderId)}\n\n${t("en", "deposit")}:\n<code>${html(deposit.address)}</code>${memo}`);
}
type TelegramDbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function claimTelegramOrderOwnership(
  tx: TelegramDbTransaction,
  orderId: string,
  orderKind: string,
  clerkCustomerUserId: string | undefined,
) {
  if (!clerkCustomerUserId) return;
  if (orderKind === "convert") {
    const [claimed] = await tx.update(quickexOrdersTable)
      .set({ customerClerkUserId: clerkCustomerUserId })
      .where(and(eq(quickexOrdersTable.legacyOrderId, orderId), isNull(quickexOrdersTable.customerClerkUserId)))
      .returning({ customerClerkUserId: quickexOrdersTable.customerClerkUserId });
    if (claimed) return;
    const [existing] = await tx.select({ customerClerkUserId: quickexOrdersTable.customerClerkUserId })
      .from(quickexOrdersTable).where(eq(quickexOrdersTable.legacyOrderId, orderId)).limit(1);
    if (existing?.customerClerkUserId !== clerkCustomerUserId) {
      throw new Error("Telegram order ownership conflict.");
    }
    return;
  }
  const [claimed] = await tx.update(ordersTable)
    .set({ customerClerkUserId: clerkCustomerUserId, customerOwnershipSource: "telegram_link" })
    .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.customerClerkUserId)))
    .returning({ customerClerkUserId: ordersTable.customerClerkUserId });
  if (claimed) return;
  const [existing] = await tx.select({ customerClerkUserId: ordersTable.customerClerkUserId })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (existing?.customerClerkUserId !== clerkCustomerUserId) {
    throw new Error("Telegram order ownership conflict.");
  }
}

async function persistCreatedOrder(
  chatId: string,
  orderId: string,
  trackingToken: string,
  orderKind: string,
  result: Record<string, unknown>,
  requiresDeposit: boolean,
  clerkCustomerUserId?: string,
) {
  await db.transaction(async (tx) => {
    await claimTelegramOrderOwnership(tx, orderId, orderKind, clerkCustomerUserId);
    await tx.insert(telegramOrderLinksTable).values({ chatId, orderId, trackingToken, orderKind }).onConflictDoNothing();
    await tx.insert(telegramNotificationOutboxTable).values({
      chatId, orderId, statusVersion: Number(result.statusVersion ?? result.recordVersion ?? 0), eventKind: "status",
      payload: { status: result.status, amount: result.amount, receiveAmount: result.receiveAmount },
      deliveryStatus: "delivered", deliveredAt: new Date(),
    }).onConflictDoNothing();
    const creation = telegramCreationOutboxPayload(orderId, orderKind, result, trackingToken, requiresDeposit);
    await tx.insert(telegramNotificationOutboxTable).values({
      chatId, orderId, statusVersion: creation.statusVersion, eventKind: "order_created",
      payload: creation, deliveryStatus: "pending",
    }).onConflictDoNothing();
  });
}

async function replaceOrSendTelegramMessage(
  chatId: string,
  messageId: number | undefined,
  text: string,
  keyboard?: TelegramButton[][],
) {
  if (messageId !== undefined) {
    try {
      await editTelegramMessage(chatId, messageId, text, keyboard);
      return;
    } catch (error) {
      logger.warn(
        { chatId, messageId, reason: error instanceof Error ? error.message : "unknown" },
        "Telegram message edit failed; sending a replacement",
      );
    }
  }
  await sendTelegramMessage(chatId, text, keyboard);
}

async function deliverCreatedOrderImmediately(
  chatId: string,
  orderId: string,
  messageId: number | undefined,
  locale: TelegramLocale,
) {
  if (messageId === undefined) return;
  const claimToken = randomUUID();
  const claimExpiresAt = new Date(Date.now() + 5 * 60_000);
  const [claimed] = await db.update(telegramNotificationOutboxTable).set({
    deliveryStatus: "sending",
    attemptCount: sql`${telegramNotificationOutboxTable.attemptCount} + 1`,
    claimToken,
    claimExpiresAt,
  }).where(and(
    eq(telegramNotificationOutboxTable.chatId, chatId),
    eq(telegramNotificationOutboxTable.orderId, orderId),
    eq(telegramNotificationOutboxTable.eventKind, "order_created"),
    eq(telegramNotificationOutboxTable.deliveryStatus, "pending"),
  )).returning();
  if (!claimed) return;

  try {
    const payload = claimed.payload as {
      status?: string;
      requiresDeposit?: boolean;
      depositAddress?: string;
      depositMemo?: string;
    };
    const deposit = telegramDepositInstruction(payload as Record<string, unknown>);
    const text = telegramOrderCreatedMessage(orderId, payload.status, locale, deposit);
    await replaceOrSendTelegramMessage(chatId, messageId, deposit || !payload.requiresDeposit
      ? text
      : `${text}\n\n⏳ Deposit instructions are being prepared.`);

    if (payload.requiresDeposit && !deposit) {
      await db.update(telegramNotificationOutboxTable).set({
        deliveryStatus: "pending",
        claimToken: null,
        claimExpiresAt: null,
        nextAttemptAt: new Date(),
      }).where(and(
        eq(telegramNotificationOutboxTable.id, claimed.id),
        eq(telegramNotificationOutboxTable.claimToken, claimToken),
      ));
      return;
    }
    if (deposit) await sendTelegramPhoto(chatId, deposit.address, text);
    await db.update(telegramNotificationOutboxTable).set({
      deliveryStatus: "delivered",
      deliveredAt: new Date(),
      claimToken: null,
      claimExpiresAt: null,
    }).where(and(
      eq(telegramNotificationOutboxTable.id, claimed.id),
      eq(telegramNotificationOutboxTable.claimToken, claimToken),
    ));
  } catch (error) {
    await db.update(telegramNotificationOutboxTable).set({
      deliveryStatus: "pending",
      lastError: error instanceof Error ? error.message.slice(0, 500) : "delivery failed",
      nextAttemptAt: new Date(),
      claimToken: null,
      claimExpiresAt: null,
    }).where(and(
      eq(telegramNotificationOutboxTable.id, claimed.id),
      eq(telegramNotificationOutboxTable.claimToken, claimToken),
    ));
    logger.warn(
      { chatId, orderId, reason: error instanceof Error ? error.message : "unknown" },
      "Immediate Telegram order delivery failed; queued retry remains pending",
    );
  }
}
async function handleText(chatId: string, locale: TelegramLocale, text: string) {
  const command = text.trim().split(/\s+/)[0].toLowerCase();
  if (command === "/exchange") { await exchangeOptions(chatId, locale, "swap"); return; }
  if (command === "/convert") { await exchangeOptions(chatId, locale, "convert"); return; }
  if (command === "/track") { await saveSession(chatId, "track", {}); await sendTelegramMessage(chatId, t(locale, "tracking")); return; }
  if (command === "/orders") { await sendOrders(chatId, locale); return; }
  if (command === "/support") { await callback(chatId, locale, "support"); return; }
  if (command === "/language") { await sendTelegramMessage(chatId, t(locale, "language"), languageButtons()); return; }
  const session = await getSession(chatId);
  if (session?.state === "source") {
    const data = { ...session.data, sourceQuery: text.trim() };
    await saveSession(chatId, "source", data);
    await showSourceOptions(chatId, data);
    return;
  }
  if (session?.state === "target") {
    const data = { ...session.data, targetQuery: text.trim() };
    await saveSession(chatId, "target", data);
    await showTargetOptions(chatId, data);
    return;
  }
  if (session?.state === "amount") {
    const enteredAmount = Number(text.trim());
    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
      const selected = session.data.amountSide === "target"
        ? session.data.target as SettlementOption
        : session.data.source as SettlementOption;
      await sendTelegramMessage(chatId, `Enter a valid positive amount in ${html(selected.assetCode)}.`);
      return;
    }
    const quoted = await quoteTelegramEnteredAmount(session.data, enteredAmount);
    const result = quoted.result;
    if (!quoted.ok) { await sendTelegramMessage(chatId, `QuickXchange could not quote this route: ${html(result.error ?? "route unavailable")}`); return; }
    const amount = quoted.amount;
    const target = session.data.target as SettlementOption;
    const mode = session.data.mode === "convert" ? "convert" : "swap";
    const fields = (result.requiredSettlementFields as Array<Record<string, unknown>> | undefined) ?? [];
    const firstField = nextRequiredField(fields as Array<{ required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } }>, 0, {});
    const needsDestination = shouldAskDestination(mode, target);
    const initialState = firstField >= 0 ? "field" : needsDestination ? "destination" : "email";
    await saveSession(chatId, initialState, { ...session.data, amount, enteredAmount, quote: result, fieldIndex: firstField, fields, values: {} });
    if (firstField >= 0) await askField(chatId, fields[firstField], firstField, locale);
    else await sendTelegramMessage(chatId, needsDestination ? t(locale, "destination") : t(locale, "email"));
    return;
  }
  if (session?.state === "field") {
    const fields = session.data.fields as Array<Record<string, unknown>>;
    const index = Number(session.data.fieldIndex ?? 0);
    if (!validFieldValue(fields[index] ?? {}, text.trim())) { await sendTelegramMessage(chatId, t(locale, "invalid")); return; }
    const key = String(fields[index]?.key ?? "");
    const values = { ...((session.data.values as Record<string, unknown>) ?? {}), [key]: text.trim() };
    const next = nextRequiredField(fields as Array<{ required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } }>, index + 1, values);
    if (next >= 0) {
      await saveSession(chatId, "field", { ...session.data, values, fieldIndex: next });
      await askField(chatId, fields[next], next, locale);
    } else {
      const needsDestination = shouldAskDestination(session.data.mode === "convert" ? "convert" : "swap", session.data.target as SettlementOption);
      await saveSession(chatId, needsDestination ? "destination" : "email", { ...session.data, values });
      await sendTelegramMessage(chatId, needsDestination ? t(locale, "destination") : t(locale, "email"));
    }
    return;
  }
  if (session?.state === "destination") {
    const isConvert = session.data.mode === "convert";
    if (isConvert && (session.data.target as SettlementOption).requiresMemo) {
      await saveSession(chatId, "destinationMemo", { ...session.data, destinationAddress: text.trim() });
      await sendTelegramMessage(chatId, t(locale, "memo"));
      return;
    }
    if (isConvert) {
      const response = await fetch(`${baseUrl()}/api/quickex/validate-address`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: (session.data.target as SettlementOption).assetCode, network: (session.data.target as SettlementOption).routeNetwork, address: text.trim() }) });
      if (!response.ok) { await sendTelegramMessage(chatId, t(locale, "invalidAddress")); return; }
    }
    await saveSession(chatId, "email", { ...session.data, destinationAddress: text.trim() });
    await sendTelegramMessage(chatId, t(locale, "email"));
    return;
  }
  if (session?.state === "destinationMemo") {
    if (session.data.mode === "convert") {
      const response = await fetch(`${baseUrl()}/api/quickex/validate-address`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: (session.data.target as SettlementOption).assetCode, network: (session.data.target as SettlementOption).routeNetwork, address: session.data.destinationAddress, memo: text.trim() }) });
      if (!response.ok) { await sendTelegramMessage(chatId, t(locale, "invalidAddress")); return; }
    }
    await saveSession(chatId, "email", { ...session.data, destinationMemo: text.trim() });
    await sendTelegramMessage(chatId, t(locale, "email"));
    return;
  }
  if (session?.state === "refundAddress" || session?.state === "refundMemo") {
    await saveSession(chatId, "email", session.data);
    await sendTelegramMessage(chatId, t(locale, "email"));
    return;
  }
  if (session?.state === "email") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text.trim())) { await sendTelegramMessage(chatId, t(locale, "invalidEmail")); return; }
    await saveSession(chatId, "review", { ...session.data, email: text.trim() });
    const source = session.data.source as SettlementOption;
    const target = session.data.target as SettlementOption;
    await sendTelegramMessage(chatId, `${t(locale, "review")}\n${html(session.data.amount)} ${html(source.assetCode)} (${html(source.routeNetwork)}) → ${html(target.assetCode)} (${html(target.routeNetwork)})\n${session.data.destinationAddress ? `${t(locale, "destination")} ${html(session.data.destinationAddress)}\n` : ""}${t(locale, "email")} ${html(text.trim())}`, [[{ text: `✅ ${t(locale, "confirm")}`, callback_data: "confirm" }], [{ text: `❌ ${t(locale, "cancel")}`, callback_data: "cancel" }]]);
    return;
  }
  if (session?.state === "track") {
    const [id, trackingToken] = text.trim().split(/\s+/);
    if (!id || !trackingToken) { await sendTelegramMessage(chatId, t(locale, "tracking")); return; }
    const [storedLink] = await db.select({ orderKind: telegramOrderLinksTable.orderKind }).from(telegramOrderLinksTable).where(and(eq(telegramOrderLinksTable.chatId, chatId), eq(telegramOrderLinksTable.orderId, id))).limit(1);
    const paths = storedLink ? [storedLink.orderKind === "convert" ? "/api/quickex/orders" : "/api/orders"] : ["/api/orders", "/api/quickex/orders"];
    let response: Response | undefined;
    let usedPath = paths[0];
    let result: Record<string, unknown> = {};
    for (const statusPath of paths) {
      usedPath = statusPath;
      response = await fetch(`${baseUrl()}${statusPath}/${encodeURIComponent(id)}/status?trackingToken=${encodeURIComponent(trackingToken)}`);
      result = await response.json() as Record<string, unknown>;
      if (response.ok || ![400, 404, 422].includes(response.status)) break;
    }
    if (response?.ok && !storedLink) {
      await db.insert(telegramOrderLinksTable).values({ chatId, orderId: id, trackingToken, orderKind: usedPath === "/api/quickex/orders" ? "convert" : "swap" }).onConflictDoNothing();
    }
    await sendTelegramMessage(chatId, response?.ok ? `<b>${t(locale, "order")}</b> <code>${html(id)}</code>\n${t(locale, "status")}: ${html(result.status)}\n${t(locale, "amount")}: ${html(result.amount)} ${html(result.fromAsset)} → ${html(result.receiveAmount)} ${html(result.toAsset)}` : `${t(locale, "unavailable")}: ${html(result.error ?? "invalid tracking capability")}`);
    if (response?.ok) await sendDepositInstructions(chatId, id, usedPath === "/api/quickex/orders" ? "convert" : "swap", trackingToken, result);
    return;
  }
  if (text.startsWith("/start")) { await mainMenu(chatId, locale); return; }
  await mainMenu(chatId, locale);
}
async function callback(chatId: string, locale: TelegramLocale, data: string, messageId?: number) {
  if (data.startsWith("lang:")) {
    const next = localeOf(data.slice(5));
    await db.update(telegramChatsTable).set({ locale: next, updatedAt: new Date() }).where(eq(telegramChatsTable.chatId, chatId));
    await mainMenu(chatId, next); return;
  }
  if (data === "language") { await sendTelegramMessage(chatId, t(locale, "language"), languageButtons()); return; }
  if (data === "exchange") { await sendTelegramMessage(chatId, t(locale, "choose"), [[{ text: `🔄 ${t(locale, "swap")}`, callback_data: "mode:swap" }, { text: `⚡ ${t(locale, "convert")}`, callback_data: "mode:convert" }]]); return; }
  if (data.startsWith("mode:")) { await exchangeOptions(chatId, locale, data.slice(5) as "swap" | "convert"); return; }
  if (data.startsWith("src:")) {
    const session = await getSession(chatId);
    if (!session || session.state !== "source") return;
    const options = (session.data.options as SettlementOption[] | undefined) ?? [];
    const source = options[Number(data.slice(4))];
    if (source) await chooseTarget(chatId, locale, source);
    return;
  }
  if (data.startsWith("srcpage:")) {
    const session = await getSession(chatId);
    if (session?.state === "source") await showSourceOptions(chatId, session.data, Number(data.slice(8)));
    return;
  }
  if (data.startsWith("tgt:")) {
    const session = await getSession(chatId);
    if (!session || session.state !== "target") return;
    const targets = (session.data.targets as SettlementOption[] | undefined) ?? [];
    const target = targets[Number(data.slice(4))];
    if (target) await selectTarget(chatId, locale, target);
    return;
  }
  if (data.startsWith("tgtpage:")) {
    const session = await getSession(chatId);
    if (session?.state === "target") await showTargetOptions(chatId, session.data, Number(data.slice(8)));
    return;
  }
  if (data.startsWith("amountside:")) {
    const session = await getSession(chatId);
    if (!session || session.state !== "amountSide") return;
    const amountSide = data.slice(11) === "target" ? "target" : "source";
    const selected = amountSide === "target"
      ? session.data.target as SettlementOption
      : session.data.source as SettlementOption;
    await saveSession(chatId, "amount", { ...session.data, amountSide, type: session.data.mode });
    await sendTelegramMessage(chatId, `👇 Enter the exchange amount in <b>${html(selected.assetCode)}</b>.`);
    return;
  }
  if (data.startsWith("fieldopt:")) {
    const session = await getSession(chatId);
    if (!session || session.state !== "field") return;
    const fields = session.data.fields as Array<Record<string, unknown>>;
    const [, indexText, optionText] = data.split(":");
    const index = Number(indexText), optionIndex = Number(optionText);
    const option = (fields[index]?.options as Array<{ value: string }> | undefined)?.[optionIndex];
    if (!option) return;
    const values = { ...((session.data.values as Record<string, unknown>) ?? {}), [String(fields[index]?.key ?? "")]: option.value };
    const next = nextRequiredField(fields as Array<{ required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } }>, index + 1, values);
    if (next >= 0) { await saveSession(chatId, "field", { ...session.data, values, fieldIndex: next }); await askField(chatId, fields[next], next, locale); }
    else {
      const needs = shouldAskDestination(session.data.mode === "convert" ? "convert" : "swap", session.data.target as SettlementOption);
      await saveSession(chatId, needs ? "destination" : "email", { ...session.data, values });
      await sendTelegramMessage(chatId, needs ? t(locale, "destination") : t(locale, "email"));
    }
    return;
  }
  if (data.startsWith("fieldpage:")) {
    const session = await getSession(chatId);
    if (!session || session.state !== "field") return;
    const [, indexText, pageText] = data.split(":");
    const index = Number(indexText), page = Number(pageText);
    const field = (session.data.fields as Array<Record<string, unknown>>)[index];
    if (field) await askField(chatId, field, index, locale, page);
    return;
  }
  if (data.startsWith("fieldskip:")) {
    const session = await getSession(chatId);
    if (!session || session.state !== "field") return;
    const fields = session.data.fields as Array<Record<string, unknown>>;
    const index = telegramFieldSkipIndex(data);
    if (index === undefined) return;
    if (fields[index]?.required !== false) return;
    const values = (session.data.values as Record<string, unknown>) ?? {};
    const next = nextRequiredField(fields as Array<{ required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } }>, index + 1, values);
    if (next >= 0) { await saveSession(chatId, "field", { ...session.data, fieldIndex: next }); await askField(chatId, fields[next], next, locale); }
    else { const needs = shouldAskDestination(session.data.mode === "convert" ? "convert" : "swap", session.data.target as SettlementOption); const state = needs ? "destination" : "email"; await saveSession(chatId, state, session.data); await sendTelegramMessage(chatId, needs ? t(locale, "destination") : t(locale, "email")); }
    return;
  }
  if (data === "skip:refund") {
    const session = await getSession(chatId);
    if (session?.state === "refundAddress" || session?.state === "refundMemo") {
      await saveSession(chatId, "email", session.data);
      await sendTelegramMessage(chatId, t(locale, "email"));
    }
    return;
  }
  if (data === "track") { await saveSession(chatId, "track", {}); await sendTelegramMessage(chatId, t(locale, "tracking")); return; }
  if (data === "support") { await sendTelegramMessage(chatId, `${t(locale, "supportText")}${process.env.TELEGRAM_SUPPORT_URL ? `\n${process.env.TELEGRAM_SUPPORT_URL}` : ""}`); return; }
  if (data === "website_unavailable") { await sendTelegramMessage(chatId, "The website is temporarily unavailable."); return; }
  if (data === "orders") {
    await sendOrders(chatId, locale); return;
  }
  if (data === "signin" || data === "signup") {
    await sendBrowserLink(chatId, locale, data);
    return;
  }
  if (data === "account") {
    const target = website();
    await sendTelegramMessage(chatId, "Your Telegram account is linked.", [[target
      ? { text: "👤 My Account", url: `${target.replace(/\/+$/, "")}/account` }
      : { text: "👤 My Account unavailable", callback_data: "website_unavailable" }]]);
    return;
  }
  if (data === "signout") {
    await db.update(telegramChatsTable).set({ clerkCustomerUserId: null, updatedAt: new Date() }).where(eq(telegramChatsTable.chatId, chatId));
    await sendTelegramMessage(chatId, "You have been signed out of Telegram.");
    await mainMenu(chatId, locale);
    return;
  }
  if (data.startsWith("order:")) {
    const index = Number(data.slice(6));
    const links = await db.select().from(telegramOrderLinksTable).where(eq(telegramOrderLinksTable.chatId, chatId)).orderBy(telegramOrderLinksTable.createdAt).limit(10);
    const link = links[index];
    if (link) await sendDepositInstructions(chatId, link.orderId, link.orderKind, link.trackingToken);
    await sendOrders(chatId, locale); return;
  }
  if (data === "cancel") { await saveSession(chatId, "idle", {}); await sendTelegramMessage(chatId, t(locale, "cancelled")); return; }
  if (data === "retry:create") {
    const session = await getSession(chatId);
    if (!session || session.state !== "processing") return;
    await saveSession(chatId, "review", session.data);
    await callback(chatId, locale, "confirm", messageId);
    return;
  }
  if (data === "confirm") {
    const session = await getSession(chatId);
    if (!session) {
      await replaceOrSendTelegramMessage(chatId, messageId, t(locale, "expired"));
      return;
    }
    if (session.state !== "review") return;
    const body = withoutTelegramRefundFields(
      (session.data.frozenCreateBody as ReturnType<typeof buildCreatePayload> | undefined)
        ?? buildCreatePayload(session.data.mode === "convert" ? "convert" : "swap", session.data.source as SettlementOption, session.data.target as SettlementOption, session.data),
    );
    const [linkedChat] = await db.select({ clerkCustomerUserId: telegramChatsTable.clerkCustomerUserId })
      .from(telegramChatsTable).where(eq(telegramChatsTable.chatId, chatId)).limit(1);
    const linkedCustomerClerkUserId = linkedChat?.clerkCustomerUserId ?? undefined;
    await saveSession(chatId, telegramCreateState(session.state), {
      ...session.data,
      frozenCreateBody: body,
      linkedCustomerClerkUserId,
    });
    await replaceOrSendTelegramMessage(chatId, messageId, telegramCreatingOrderMessage());
    const response = await fetch(`${baseUrl()}${body.type === "instant" ? "/api/quickex/create-order" : "/api/exchange/orders"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        await saveSession(chatId, "review", session.data);
        await replaceOrSendTelegramMessage(chatId, messageId, `QuickXchange could not create the order: ${html(result.error ?? "please check the details and try again")}\nYour review is still saved; you may retry safely.`);
      } else {
        await replaceOrSendTelegramMessage(chatId, messageId, `QuickXchange could not confirm whether the order was created: ${html(result.error ?? "provider timeout")}\nPlease do not start over. Retry only when reconciliation confirms no order exists.`, [[{ text: `🔁 ${t(locale, "retry")}`, callback_data: "retry:create" }]]);
      }
      return;
    }
    const orderId = String(result.id), trackingToken = String(result.trackingToken ?? "");
    const orderKind = body.type === "instant" ? "convert" : "swap";
    await persistCreatedOrder(
      chatId,
      orderId,
      trackingToken,
      orderKind,
      result,
      telegramRequiresDeposit(orderKind, (session.data.source as SettlementOption)?.kind),
      linkedCustomerClerkUserId,
    );
    await saveSession(chatId, "idle", {});
    await deliverCreatedOrderImmediately(chatId, orderId, messageId, locale);
    return;
  }
}
router.post("/telegram/webhook", async (req: Request, res) => {
  const disposition = telegramWebhookDisposition(telegramEnabled(), telegramSecretMatches(req.get("x-telegram-bot-api-secret-token")), false);
  if (disposition === 404) { res.status(404).json({ error: "Telegram bot is disabled." }); return; }
  if (disposition === 401) { res.status(401).json({ error: "Invalid Telegram webhook secret." }); return; }
  const update = req.body as Update;
  if (!telegramUpdateIdValid(update?.update_id)) { res.status(400).json({ error: "Invalid Telegram update." }); return; }
  const message = update.message, query = update.callback_query;
  const chatId = String(message?.chat?.id ?? query?.message?.chat?.id ?? "");
  const from = message?.from ?? query?.from;
  if (!chatId || !from?.id) { res.status(400).json({ error: "Telegram update has no private user." }); return; }
  if (!telegramPrivateUpdate(update)) {
    await sendTelegramMessage(chatId, t(localeOf(from.language_code), "privateOnly"));
    res.sendStatus(200);
    return;
  }
  if (query?.id) {
    void telegramCall("answerCallbackQuery", {
      callback_query_id: query.id,
      ...(query.data === "confirm" || query.data === "retry:create"
        ? { text: "Creating your order..." }
        : {}),
    }).catch(error => {
      logger.warn(
        { reason: error instanceof Error ? error.message : "unknown" },
        "Telegram callback acknowledgement failed",
      );
    });
  }
  const updateId = String(update.update_id);
  const claimToken = randomUUID();
  const claimExpiresAt = new Date(Date.now() + 120_000);
  const [inserted] = await db.insert(telegramProcessedUpdatesTable).values({ updateId, claimToken, claimExpiresAt, attemptCount: 1, payload: update as unknown as Record<string, unknown> }).onConflictDoNothing().returning();
  let claimed = inserted;
  if (!claimed) {
    const [existing] = await db.select().from(telegramProcessedUpdatesTable).where(eq(telegramProcessedUpdatesTable.updateId, updateId)).limit(1);
    if (existing?.status === "completed") { res.sendStatus(200); return; }
    const expired = !existing?.claimExpiresAt || existing.claimExpiresAt <= new Date();
    if (!existing || telegramInboxDisposition(existing.status, expired) === "retry") { res.status(500).json({ error: "Telegram update is already being processed." }); return; }
    [claimed] = await db.update(telegramProcessedUpdatesTable).set({ status: "processing", claimToken, claimExpiresAt, attemptCount: (existing.attemptCount ?? 0) + 1, lastError: "" }).where(and(eq(telegramProcessedUpdatesTable.updateId, updateId), or(eq(telegramProcessedUpdatesTable.status, "failed"), and(eq(telegramProcessedUpdatesTable.status, "processing"), or(isNull(telegramProcessedUpdatesTable.claimExpiresAt), lte(telegramProcessedUpdatesTable.claimExpiresAt, new Date())))))).returning();
    if (!claimed) { res.status(500).json({ error: "Telegram update is already being processed." }); return; }
  }
  const chat = await chatFor(chatId, from);
  if (!chat || chat.userId !== String(from.id)) {
    await db.update(telegramProcessedUpdatesTable).set({ status: "completed", claimToken: null, claimExpiresAt: null }).where(and(eq(telegramProcessedUpdatesTable.updateId, updateId), eq(telegramProcessedUpdatesTable.claimToken, claimToken)));
    await sendTelegramMessage(chatId, t(localeOf(from.language_code), "privateOnly"));
    res.sendStatus(200);
    return;
  }
  const locale = localeOf(chat?.locale);
  const processClaimedUpdate = async () => {
    try {
    await withTelegramChatLock(chatId, () => telegramContext.run({ updateId }, async () => {
      const [session] = await db.select({ lastAppliedUpdateId: telegramWizardSessionsTable.lastAppliedUpdateId }).from(telegramWizardSessionsTable).where(eq(telegramWizardSessionsTable.chatId, chatId)).limit(1);
      if (!session || shouldApplyUpdate(session.lastAppliedUpdateId, updateId)) {
        if (query?.data) await callback(chatId, locale, query.data, query.message?.message_id);
        else if (message?.text) {
          if (message.text.startsWith("/start admin_")) {
            const token = message.text.trim().slice("/start admin_".length);
            try {
              await consumeAdminTelegramLinkChallenge(token, chatId, from?.username?.trim() ?? "");
              await sendTelegramMessage(chatId, "✅ <b>Telegram Connected</b>\n\nThis private chat will now receive enabled QuickXchange Admin notifications.");
            } catch (error) {
              if (error instanceof AdminTelegramLinkChallengeError) {
                await sendTelegramMessage(chatId, "This Admin connection link has expired or was already used. Create a new link in Notification Settings.");
              } else {
                throw error;
              }
            }
          } else {
            await handleText(chatId, locale, message.text);
          }
        }
      }
    }));
    await db.update(telegramProcessedUpdatesTable).set({ status: "completed", claimToken: null, claimExpiresAt: null, lastError: "" }).where(and(eq(telegramProcessedUpdatesTable.updateId, updateId), eq(telegramProcessedUpdatesTable.claimToken, claimToken)));
    } catch (error) {
      await sendTelegramMessage(chatId, t(locale, "stepError"));
      await db.update(telegramProcessedUpdatesTable).set({ status: "failed", claimToken: null, claimExpiresAt: null, lastError: error instanceof Error ? error.message.slice(0, 500) : "processing failed" }).where(and(eq(telegramProcessedUpdatesTable.updateId, updateId), eq(telegramProcessedUpdatesTable.claimToken, claimToken)));
      throw error;
    }
  };
  try {
    await processClaimedUpdate();
    res.sendStatus(200);
  } catch {
    res.status(500).json({ error: "Telegram update processing failed." });
  }
});
export default router;

export async function setupTelegramCommands() {
  if (!telegramEnabled()) return false;
  const safelyConfigure = async (operation: string, configure: () => Promise<unknown>) => {
    try {
      await configure();
      return true;
    } catch (error) {
      logger.warn(
        { operation, reason: error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "unknown" },
        "Telegram bot configuration operation failed",
      );
      return false;
    }
  };
  const appUrl = miniAppUrl();
  const menuConfigured = appUrl
    ? await safelyConfigure("setChatMenuButton", () => telegramCall("setChatMenuButton", { menu_button: { type: "web_app", text: "Open App", web_app: { url: appUrl } } }))
    : false;
  await safelyConfigure("setMyCommands", () => telegramCall("setMyCommands", { commands: [
    { command: "start", description: "Start QuickXchange" },
    { command: "exchange", description: "Start an exchange" },
    { command: "track", description: "Track an order" },
    { command: "orders", description: "My orders" },
    { command: "support", description: "Contact support" },
    { command: "language", description: "Choose language" },
  ] }));
  await safelyConfigure("setMyName", () => telegramCall("setMyName", { name: "QuickXchange" }));
  const websiteUrl = website();
  const supportUrl = process.env.TELEGRAM_SUPPORT_URL?.trim();
  await safelyConfigure("setMyShortDescription", () => telegramCall("setMyShortDescription", {
    short_description: ["💱 Crypto Exchange", websiteUrl && `🔗 Website: ${websiteUrl}`, supportUrl && `💬 Support: ${supportUrl}`].filter(Boolean).join("\n"),
  }));
  await safelyConfigure("setMyDescription", () => telegramCall("setMyDescription", {
    description: ["QuickXchange", "", "💱 Crypto Exchange", websiteUrl && `🔗 Website: ${websiteUrl}`, supportUrl && `💬 Support: ${supportUrl}`].filter((line): line is string => typeof line === "string").join("\n"),
  }));
  return menuConfigured;
}

let telegramWorker: ReturnType<typeof setInterval> | undefined;
let telegramWorkerRunning = false;
export function startTelegramNotificationWorker(): () => void {
  if (telegramWorker || !telegramEnabled()) return () => {};
  const run = async () => {
    if (telegramWorkerRunning) return;
    telegramWorkerRunning = true;
    try {
    let cursor: string | undefined;
    for (;;) {
      const processing = await db.select().from(telegramWizardSessionsTable)
        .where(and(
          cursor ? gt(telegramWizardSessionsTable.chatId, cursor) : sql`true`,
          or(
            eq(telegramWizardSessionsTable.state, "processing"),
            and(eq(telegramWizardSessionsTable.state, "reconciling"), or(isNull(telegramWizardSessionsTable.reconciliationClaimExpiresAt), lte(telegramWizardSessionsTable.reconciliationClaimExpiresAt, new Date()))),
          ),
        ))
        .orderBy(telegramWizardSessionsTable.chatId).limit(25);
      if (!processing.length) break;
      cursor = processing[processing.length - 1].chatId;
      for (const session of processing) {
       try {
      const claimToken = randomUUID();
      const claimExpiresAt = new Date(Date.now() + 120_000);
      const [claimedSession] = await db.update(telegramWizardSessionsTable).set({
        state: "reconciling", version: session.version + 1,
        reconciliationClaimToken: claimToken, reconciliationClaimExpiresAt: claimExpiresAt,
      }).where(and(
        eq(telegramWizardSessionsTable.chatId, session.chatId),
        or(
          eq(telegramWizardSessionsTable.state, "processing"),
          and(eq(telegramWizardSessionsTable.state, "reconciling"), or(isNull(telegramWizardSessionsTable.reconciliationClaimExpiresAt), lte(telegramWizardSessionsTable.reconciliationClaimExpiresAt, new Date()))),
        ),
        eq(telegramWizardSessionsTable.version, session.version),
        or(isNull(telegramWizardSessionsTable.reconciliationClaimExpiresAt), lte(telegramWizardSessionsTable.reconciliationClaimExpiresAt, new Date())),
      )).returning();
      if (!claimedSession) continue;
      const requestId = String(session.data.clientRequestId ?? "");
      if (!requestId) continue;
      const [manual] = await db.select({ id: ordersTable.id, status: ordersTable.status, statusVersion: ordersTable.statusVersion, amount: ordersTable.amount, receiveAmount: ordersTable.receiveAmount }).from(ordersTable).where(eq(ordersTable.clientRequestId, requestId)).limit(1);
      const [quickex] = manual ? [] : await db.select({ id: quickexOrdersTable.legacyOrderId, status: quickexOrdersTable.status, statusVersion: quickexOrdersTable.recordVersion, amount: quickexOrdersTable.amounts, receiveAmount: quickexOrdersTable.amounts }).from(quickexOrdersTable).where(eq(quickexOrdersTable.clientRequestId, requestId)).limit(1);
      const found = manual ? { ...manual, orderKind: "swap" } : quickex ? { ...quickex, orderKind: "convert" } : undefined;
      if (!found) {
        const frozen = session.data.frozenCreateBody as Record<string, unknown> | undefined;
        if (frozen && session.expiresAt > new Date()) {
          const endpoint = frozen.type === "instant" ? "/api/quickex/create-order" : "/api/exchange/orders";
          const response = await fetch(`${baseUrl()}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(frozen) });
          const result = await response.json() as Record<string, unknown>;
          if (response.ok) {
            const orderId = String(result.id), orderKind = frozen.type === "instant" ? "convert" : "swap";
            await persistCreatedOrder(
              session.chatId,
              orderId,
              String(result.trackingToken ?? signOrderTrackingToken(orderId)),
              orderKind,
              result,
              telegramRequiresDeposit(orderKind, (session.data.source as SettlementOption)?.kind),
              typeof session.data.linkedCustomerClerkUserId === "string" ? session.data.linkedCustomerClerkUserId : undefined,
            );
            await db.update(telegramWizardSessionsTable).set({ state: "idle", data: {}, reconciliationClaimToken: null, reconciliationClaimExpiresAt: null, updatedAt: new Date() }).where(and(eq(telegramWizardSessionsTable.chatId, session.chatId), eq(telegramWizardSessionsTable.state, "reconciling"), eq(telegramWizardSessionsTable.reconciliationClaimToken, claimToken)));
            continue;
          }
          if (telegramCreateRetryDecision(response.status) === "review") {
            await db.update(telegramWizardSessionsTable).set({ state: "review", reconciliationClaimToken: null, reconciliationClaimExpiresAt: null, updatedAt: new Date() }).where(and(eq(telegramWizardSessionsTable.chatId, session.chatId), eq(telegramWizardSessionsTable.state, "reconciling"), eq(telegramWizardSessionsTable.reconciliationClaimToken, claimToken)));
            continue;
          }
          await db.update(telegramWizardSessionsTable).set({ state: "processing", reconciliationClaimToken: null, reconciliationClaimExpiresAt: null, updatedAt: new Date() }).where(and(eq(telegramWizardSessionsTable.chatId, session.chatId), eq(telegramWizardSessionsTable.state, "reconciling"), eq(telegramWizardSessionsTable.reconciliationClaimToken, claimToken)));
          continue;
        }
        if (session.expiresAt <= new Date()) {
          await db.update(telegramWizardSessionsTable).set({ state: "expired", data: {}, reconciliationClaimToken: null, reconciliationClaimExpiresAt: null, updatedAt: new Date() }).where(and(eq(telegramWizardSessionsTable.chatId, session.chatId), eq(telegramWizardSessionsTable.state, "reconciling"), eq(telegramWizardSessionsTable.reconciliationClaimToken, claimToken)));
          const [expiredChat] = await db.select({ locale: telegramChatsTable.locale }).from(telegramChatsTable).where(eq(telegramChatsTable.chatId, session.chatId)).limit(1);
          await sendTelegramMessage(session.chatId, t(localeOf(expiredChat?.locale), "expired"));
        }
        else await db.update(telegramWizardSessionsTable).set({ state: "processing", reconciliationClaimToken: null, reconciliationClaimExpiresAt: null, updatedAt: new Date() }).where(and(eq(telegramWizardSessionsTable.chatId, session.chatId), eq(telegramWizardSessionsTable.state, "reconciling"), eq(telegramWizardSessionsTable.reconciliationClaimToken, claimToken)));
        continue;
      }
      const amounts = found.orderKind === "convert" && found.amount && typeof found.amount === "object" ? found.amount as { amount?: string; receiveAmount?: string } : undefined;
      const recoveredToken = signOrderTrackingToken(found.id);
      const recoveredPath = found.orderKind === "convert" ? "/api/quickex/orders" : "/api/orders";
      const recoveredResponse = await fetch(`${baseUrl()}${recoveredPath}/${encodeURIComponent(found.id)}/status?trackingToken=${encodeURIComponent(recoveredToken)}`);
      const recoveredStatus = recoveredResponse.ok ? await recoveredResponse.json() as Record<string, unknown> : {};
      const [winner] = await db.transaction(async (tx) => {
        const [transitioned] = await tx.update(telegramWizardSessionsTable).set({ state: "idle", data: {}, reconciliationClaimToken: null, reconciliationClaimExpiresAt: null, updatedAt: new Date() }).where(and(eq(telegramWizardSessionsTable.chatId, session.chatId), eq(telegramWizardSessionsTable.state, "reconciling"), eq(telegramWizardSessionsTable.reconciliationClaimToken, claimToken))).returning();
        if (!transitioned) return [];
        await claimTelegramOrderOwnership(
          tx,
          found.id,
          found.orderKind,
          typeof session.data.linkedCustomerClerkUserId === "string" ? session.data.linkedCustomerClerkUserId : undefined,
        );
        await tx.insert(telegramOrderLinksTable).values({ chatId: session.chatId, orderId: found.id, trackingToken: recoveredToken, orderKind: found.orderKind }).onConflictDoNothing();
        await tx.insert(telegramNotificationOutboxTable).values({ chatId: session.chatId, orderId: found.id, statusVersion: found.statusVersion, payload: { status: found.status, amount: amounts?.amount ?? found.amount, receiveAmount: amounts?.receiveAmount ?? found.receiveAmount }, deliveryStatus: "delivered", deliveredAt: new Date() }).onConflictDoNothing();
        await tx.insert(telegramNotificationOutboxTable).values({ chatId: session.chatId, orderId: found.id, statusVersion: found.statusVersion, eventKind: "order_created", payload: { eventKind: "order_created", orderId: found.id, orderKind: found.orderKind, trackingToken: recoveredToken, requiresDeposit: telegramRequiresDeposit(found.orderKind, (session.data.source as SettlementOption)?.kind), status: found.status, statusVersion: found.statusVersion, amount: amounts?.amount ?? found.amount, receiveAmount: amounts?.receiveAmount ?? found.receiveAmount, depositAddress: recoveredStatus.depositAddress, depositMemo: recoveredStatus.depositMemo }, deliveryStatus: "pending" }).onConflictDoNothing();
        return [transitioned];
      });
      if (!winner) continue;
       } catch { /* A failed provider row is retried on the next keyset page. */ }
      }
      if (processing.length < 25) break;
    }
    const missingManualNotifications = await db.select({
      chatId: telegramOrderLinksTable.chatId,
      orderId: ordersTable.id,
      status: ordersTable.status,
      statusVersion: ordersTable.statusVersion,
      amount: ordersTable.amount,
      receiveAmount: ordersTable.receiveAmount,
    }).from(telegramOrderLinksTable)
      .innerJoin(ordersTable, and(
        inArray(telegramOrderLinksTable.orderKind, telegramManualOrderKinds),
        eq(telegramOrderLinksTable.orderId, ordersTable.id),
      ))
      .leftJoin(telegramNotificationOutboxTable, and(
        eq(telegramNotificationOutboxTable.chatId, telegramOrderLinksTable.chatId),
        eq(telegramNotificationOutboxTable.orderId, ordersTable.id),
        eq(telegramNotificationOutboxTable.statusVersion, ordersTable.statusVersion),
        eq(telegramNotificationOutboxTable.eventKind, "status"),
      ))
      .where(isNull(telegramNotificationOutboxTable.id))
      .limit(100);
    const missingConvertNotifications = await db.select({
      chatId: telegramOrderLinksTable.chatId,
      orderId: quickexOrdersTable.legacyOrderId,
      status: quickexOrdersTable.status,
      statusVersion: quickexOrdersTable.recordVersion,
      amounts: quickexOrdersTable.amounts,
    }).from(telegramOrderLinksTable)
      .innerJoin(quickexOrdersTable, and(
        eq(telegramOrderLinksTable.orderKind, "convert"),
        eq(telegramOrderLinksTable.orderId, quickexOrdersTable.legacyOrderId),
      ))
      .leftJoin(telegramNotificationOutboxTable, and(
        eq(telegramNotificationOutboxTable.chatId, telegramOrderLinksTable.chatId),
        eq(telegramNotificationOutboxTable.orderId, quickexOrdersTable.legacyOrderId),
        eq(telegramNotificationOutboxTable.statusVersion, quickexOrdersTable.recordVersion),
        eq(telegramNotificationOutboxTable.eventKind, "status"),
      ))
      .where(isNull(telegramNotificationOutboxTable.id))
      .limit(100);
    for (const order of missingManualNotifications) {
      await db.insert(telegramNotificationOutboxTable).values({
        chatId: order.chatId,
        orderId: order.orderId,
        statusVersion: order.statusVersion,
        payload: { status: order.status, amount: order.amount, receiveAmount: order.receiveAmount, orderKind: "manual" },
      }).onConflictDoNothing();
    }
    for (const order of missingConvertNotifications) {
      const amounts = order.amounts as { amount?: string; receiveAmount?: string };
      await db.insert(telegramNotificationOutboxTable).values({
        chatId: order.chatId,
        orderId: order.orderId,
        statusVersion: order.statusVersion,
        payload: { status: order.status, amount: amounts.amount, receiveAmount: amounts.receiveAmount, orderKind: "convert" },
      }).onConflictDoNothing();
    }
    const convertMilestoneOrders = await db.select({
      order: quickexOrdersTable,
    }).from(telegramOrderLinksTable)
      .innerJoin(quickexOrdersTable, and(
        eq(telegramOrderLinksTable.orderKind, "convert"),
        eq(telegramOrderLinksTable.orderId, quickexOrdersTable.legacyOrderId),
      ))
      .where(inArray(quickexOrdersTable.status, ["processing", "completed"]))
      .limit(100);
    for (const { order } of convertMilestoneOrders) {
      await db.transaction((tx) => enqueueConvertTelegramMilestones(tx, order));
    }
    const now = new Date();
    const pending = await db.select().from(telegramNotificationOutboxTable)
      .where(or(
        and(eq(telegramNotificationOutboxTable.deliveryStatus, "pending"), lte(telegramNotificationOutboxTable.nextAttemptAt, now)),
        and(eq(telegramNotificationOutboxTable.deliveryStatus, "sending"), or(isNull(telegramNotificationOutboxTable.claimExpiresAt), lte(telegramNotificationOutboxTable.claimExpiresAt, now))),
      )).limit(25);
    for (const item of pending.slice(0, 25)) {
      const claimToken = randomUUID();
      const claimExpiresAt = new Date(now.getTime() + 5 * 60_000);
      const [claimed] = await db.update(telegramNotificationOutboxTable).set({
        deliveryStatus: "sending", attemptCount: item.attemptCount + 1, claimToken, claimExpiresAt,
      }).where(and(eq(telegramNotificationOutboxTable.id, item.id), or(
        eq(telegramNotificationOutboxTable.deliveryStatus, "pending"),
        and(eq(telegramNotificationOutboxTable.deliveryStatus, "sending"), or(isNull(telegramNotificationOutboxTable.claimExpiresAt), lte(telegramNotificationOutboxTable.claimExpiresAt, now))),
      ))).returning();
      if (!claimed) continue;
      try {
         const payload = claimed.payload as { status?: string; eventKind?: string; requiresDeposit?: boolean; trackingToken?: string; depositAddress?: string; depositMemo?: string; orderKind?: string };
        const [noticeChat] = await db.select({ locale: telegramChatsTable.locale }).from(telegramChatsTable).where(eq(telegramChatsTable.chatId, claimed.chatId)).limit(1);
        const noticeLocale = localeOf(noticeChat?.locale);
        if (claimed.eventKind === "order_created") {
          const adminRecipient = Boolean((payload as { adminRecipient?: boolean }).adminRecipient);
          if (adminRecipient) {
            const eventKind = "order_created" as SwapTelegramEventKind;
            if (!await adminSwapTelegramRecipientIsCurrent(claimed.chatId, claimed.orderId, eventKind)) {
              throw new Error("Telegram Admin recipient is no longer current.");
            }
            const orderUrl = adminOrderUrl(claimed.orderId);
            await sendTelegramMessage(
              claimed.chatId,
              formatSwapTelegramNotification(payload as SwapTelegramNotificationPayload),
              orderUrl ? [[{ text: "Open Order", url: orderUrl }]] : undefined,
            );
            await db.update(telegramNotificationOutboxTable).set({ deliveryStatus: "delivered", deliveredAt: new Date(), claimToken: null, claimExpiresAt: null }).where(and(eq(telegramNotificationOutboxTable.id, claimed.id), eq(telegramNotificationOutboxTable.claimToken, claimToken)));
            continue;
          }
          let deposit = telegramDepositInstruction(payload as Record<string, unknown>);
          if (!deposit && payload.requiresDeposit) {
            const path = payload.orderKind === "convert" ? "/api/quickex/orders" : "/api/orders";
            if (!payload.trackingToken) throw new DepositInstructionsPending("Missing tracking capability for required deposit delivery");
            let statusResponse: Response;
            try {
              statusResponse = await fetch(`${baseUrl()}${path}/${encodeURIComponent(claimed.orderId)}/status?trackingToken=${encodeURIComponent(payload.trackingToken)}`);
            } catch {
              throw new DepositInstructionsPending("Customer-safe deposit status temporarily unavailable");
            }
            if (!statusResponse.ok) throw new DepositInstructionsPending("Customer-safe deposit status unavailable");
            const status = await statusResponse.json() as Record<string, unknown>;
            deposit = telegramDepositInstruction(status);
            if (!deposit) throw new DepositInstructionsPending();
          }
          const caption = telegramOrderCreatedMessage(claimed.orderId, payload.status, noticeLocale, deposit);
          if (deposit) await sendTelegramPhoto(claimed.chatId, deposit.address, caption);
          else await sendTelegramMessage(claimed.chatId, caption);
        } else if (
          claimed.eventKind === "payment_received" ||
          claimed.eventKind === "processing" ||
          claimed.eventKind === "completed" ||
          claimed.eventKind === "failed_cancelled"
        ) {
          const eventKind = claimed.eventKind as SwapTelegramEventKind;
          const convert = payload.orderKind === "convert";
          const adminRecipient = Boolean((payload as { adminRecipient?: boolean }).adminRecipient);
          const recipientIsCurrent = adminRecipient
            ? convert
              ? true
              : await adminSwapTelegramRecipientIsCurrent(claimed.chatId, claimed.orderId, eventKind)
            : convert
            ? await convertTelegramRecipientIsCurrent(
                claimed.chatId,
                claimed.orderId,
                eventKind as "payment_received" | "completed",
              )
            : await swapTelegramRecipientIsCurrent(claimed.chatId, claimed.orderId, eventKind);
          if (!recipientIsCurrent) {
            await db.update(telegramNotificationOutboxTable).set({
              deliveryStatus: "failed",
              lastError: "Telegram order link or current order state is no longer valid.",
              claimToken: null,
              claimExpiresAt: null,
            }).where(and(
              eq(telegramNotificationOutboxTable.id, claimed.id),
              eq(telegramNotificationOutboxTable.claimToken, claimToken),
            ));
            continue;
          }
          const swapPayload = payload as SwapTelegramNotificationPayload;
          const transactionButton = !convert && eventKind === "payment_received" && swapPayload.explorerUrl
            ? [{ text: "View Transaction", url: swapPayload.explorerUrl }]
            : undefined;
          const adminUrl = !convert && adminRecipient ? adminOrderUrl(claimed.orderId) : undefined;
          const orderButton = adminUrl
            ? [{ text: "Open Order", url: adminUrl }]
            : undefined;
          const buttons: Array<Array<{ text: string; url: string }>> = [];
          if (orderButton) buttons.push(orderButton);
          if (transactionButton) buttons.push(transactionButton);
          await sendTelegramMessage(
            claimed.chatId,
            convert
              ? formatConvertTelegramNotification(payload as ConvertNotificationPayload)
              : formatSwapTelegramNotification(swapPayload),
            buttons.length ? buttons : undefined,
          );
        } else {
          const displayedStatus = payload.orderKind === "manual"
            ? swapTelegramStatusLabel(payload.status ?? "updated")
            : payload.orderKind === "convert"
              ? convertTelegramStatusLabel(payload.status ?? "updated")
            : payload.status ?? "updated";
          await sendTelegramMessage(claimed.chatId, telegramOrderStatusMessage(claimed.orderId, displayedStatus, noticeLocale));
        }
        await db.update(telegramNotificationOutboxTable).set({ deliveryStatus: "delivered", deliveredAt: new Date(), claimToken: null, claimExpiresAt: null }).where(and(eq(telegramNotificationOutboxTable.id, claimed.id), eq(telegramNotificationOutboxTable.claimToken, claimToken)));
      } catch (error) {
        const disposition = telegramOutboxFailureDisposition(error, claimed.attemptCount);
        await db.update(telegramNotificationOutboxTable).set({ deliveryStatus: disposition, lastError: error instanceof Error ? error.message.slice(0, 500) : "delivery failed", nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(claimed.attemptCount, 5))), claimToken: null, claimExpiresAt: null }).where(and(eq(telegramNotificationOutboxTable.id, claimed.id), eq(telegramNotificationOutboxTable.claimToken, claimToken)));
      }
    }
    } finally {
      telegramWorkerRunning = false;
    }
  };
  void run().catch(() => { telegramWorkerRunning = false; });
  telegramWorker = setInterval(() => void run().catch(() => { telegramWorkerRunning = false; }), 5_000);
  telegramWorker.unref();
  return () => { if (telegramWorker) clearInterval(telegramWorker); telegramWorker = undefined; };
}