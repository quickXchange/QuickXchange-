import { Router, type IRouter, type Request } from "express";
import { and, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db, ordersTable, quickexOrdersTable, telegramChatsTable, telegramNotificationOutboxTable, telegramOrderLinksTable, telegramProcessedUpdatesTable, telegramWizardSessionsTable } from "@workspace/db";
import { sendTelegramMessage, sendTelegramPhoto, telegramCall, telegramEnabled, type TelegramButton } from "../lib/telegram-api";
import { languageButtons, localeOf, t, type TelegramLocale } from "../lib/telegram-localization";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { signOrderTrackingToken } from "../lib/order-access";
import { buildCreatePayload, buildQuotePayload, filterConvertTargets, filterManualTargets, nextRequiredField, requiredFieldActive, shouldAskDestination, shouldAskRefund, type TelegramRouteOption } from "../lib/telegram-wizard";

const router: IRouter = Router();
const website = () => process.env.TELEGRAM_WEBSITE_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim();
const html = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const baseUrl = () => `http://127.0.0.1:${process.env.PORT ?? "8080"}`;
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
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number | string; type?: string } }; from?: { id?: number; language_code?: string; first_name?: string; username?: string } };
};
type TelegramFrom = { id?: number; language_code?: string; first_name?: string; username?: string };
const menu = (locale: TelegramLocale): TelegramButton[][] => [
  [{ text: t(locale, "exchange"), callback_data: "exchange" }, { text: t(locale, "track"), callback_data: "track" }],
  [{ text: t(locale, "orders"), callback_data: "orders" }, { text: t(locale, "language"), callback_data: "language" }],
  [{ text: t(locale, "support"), callback_data: "support" }, ...(website() ? [{ text: t(locale, "website"), url: website()! }] : [])],
  ...(process.env.TELEGRAM_MINI_APP_URL ? [[{ text: "QuickXchange Mini App", web_app: { url: process.env.TELEGRAM_MINI_APP_URL } }]] : []),
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
  await db.insert(telegramWizardSessionsTable).values({ chatId, state, data, lastAppliedUpdateId: updateId ?? null, expiresAt: new Date(Date.now() + 30 * 60_000) })
    .onConflictDoUpdate({ target: telegramWizardSessionsTable.chatId, set: { state, data, ...(updateId ? { lastAppliedUpdateId: updateId } : {}), expiresAt: new Date(Date.now() + 30 * 60_000), updatedAt: new Date() } });
}
async function getSession(chatId: string) {
  const [row] = await db.select().from(telegramWizardSessionsTable).where(and(eq(telegramWizardSessionsTable.chatId, chatId), gte(telegramWizardSessionsTable.expiresAt, new Date()))).limit(1);
  return row;
}
async function mainMenu(chatId: string, locale: TelegramLocale) {
     await sendTelegramMessage(chatId, `${t(locale, "welcome")}\n\n${t(locale, "choose")}`, menu(locale));
}
type SettlementOption = TelegramRouteOption & { title: string; direction: string; executionMode?: string; fields?: Array<{ key: string; label: string; type: string; options?: Array<{ value: string; label: string }>; required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] }; min?: number; max?: number; pattern?: string }> };
async function exchangeOptions(chatId: string, locale: TelegramLocale, mode: "swap" | "convert") {
  const response = await fetch(`${baseUrl()}/api/exchange/config`);
  if (!response.ok) { await sendTelegramMessage(chatId, t(locale, "unavailable")); return; }
  const config = await response.json() as { settlementOptions?: SettlementOption[] };
  const allOptions = config.settlementOptions ?? [];
  const options = allOptions.filter(option => mode === "convert"
    ? option.executionMode === "api" && ["send", "both"].includes(option.direction)
    : option.executionMode !== "api" && ["send", "both"].includes(option.direction));
  const manualRoutes = (config as { manualRouteAvailability?: { routes?: Array<{ sourceSettlementOptionId: string; targetSettlementOptionId: string }> } }).manualRouteAvailability?.routes ?? [];
  await saveSession(chatId, "source", { mode, options, allOptions, manualRoutes, clientRequestId: randomUUID() });
  await sendTelegramMessage(chatId, t(locale, "send"), [
    ...options.slice(0, 8).map((option, index) => [{ text: `${option.assetCode} · ${option.title}`, callback_data: `src:${index}` }]),
    ...(options.length > 8 ? [[{ text: "Next ›", callback_data: "srcpage:1" }]] : []),
  ]);
}
async function chooseTarget(chatId: string, locale: TelegramLocale, sourceIndex: number, page = 0) {
  const session = await getSession(chatId);
  if (session?.state === "processing") {
    await sendTelegramMessage(chatId, t(locale, "processing"));
    return;
  }
  const options = (session?.data.options as SettlementOption[] | undefined) ?? [];
  const allOptions = (session?.data.allOptions as SettlementOption[] | undefined) ?? options;
  const source = options[sourceIndex];
  if (!source) return;
  let targets: SettlementOption[];
  if (session?.data.mode === "convert") {
    const response = await fetch(`${baseUrl()}/api/quickex/pairs?fromAsset=${encodeURIComponent(source.assetCode)}&fromNetwork=${encodeURIComponent(source.routeNetwork)}`);
    const pairs = response.ok ? await response.json() as Array<{ fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string }> : [];
    targets = filterConvertTargets(allOptions, pairs, source) as SettlementOption[];
  } else {
    targets = filterManualTargets(allOptions, (session?.data.manualRoutes as Array<{ sourceSettlementOptionId: string; targetSettlementOptionId: string }>) ?? [], source.id) as SettlementOption[];
  }
  await saveSession(chatId, "target", { ...session?.data, source, targets });
  const start = page * 8;
  await sendTelegramMessage(chatId, t(locale, "receive"), [
    ...targets.slice(start, start + 8).map((option, index) => [{ text: `${option.assetCode} · ${option.title}`, callback_data: `tgt:${index + start}` }]),
    ...(start + 8 < targets.length ? [[{ text: "Next ›", callback_data: `tgtpage:${page + 1}` }]] : []),
  ]);
}
async function askField(chatId: string, field: Record<string, unknown>, fieldIndex = 0, locale: TelegramLocale = "en", page = 0) {
  const label = String(field.label ?? field.key ?? "Required detail");
  const options = field.options as Array<{ value: string; label: string }> | undefined;
  const start = page * 20;
  const keyboard: TelegramButton[][] = options?.length
    ? options.slice(start, start + 20).map((option, index) => [{ text: option.label, callback_data: `fieldopt:${fieldIndex}:${index + start}` }])
    : [];
  if (start > 0) keyboard.push([{ text: "‹", callback_data: `fieldpage:${fieldIndex}:${page - 1}` }]);
  if (options && start + 20 < options.length) keyboard.push([{ text: "›", callback_data: `fieldpage:${fieldIndex}:${page + 1}` }]);
  if (field.required === false) keyboard.push([{ text: t(locale, "skip"), callback_data: `fieldskip:${fieldIndex}` }]);
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
async function sendOrders(chatId: string, locale: TelegramLocale) {
  const links = await db.select().from(telegramOrderLinksTable).where(eq(telegramOrderLinksTable.chatId, chatId)).orderBy(telegramOrderLinksTable.createdAt).limit(10);
  if (!links.length) { await sendTelegramMessage(chatId, t(locale, "noOrders")); return; }
  const lines: string[] = [];
  const buttons: TelegramButton[][] = [];
  for (let index = 0; index < links.length; index += 1) {
    const item = links[index];
    const path = item.orderKind === "convert" ? "/api/quickex/orders" : "/api/orders";
    const response = await fetch(`${baseUrl()}${path}/${encodeURIComponent(item.orderId)}/status?trackingToken=${encodeURIComponent(item.trackingToken)}`);
    const result = await response.json() as Record<string, unknown>;
    lines.push(response.ok ? `• <code>${html(item.orderId)}</code> — ${html(result.status)}` : `• <code>${html(item.orderId)}</code> — unavailable`);
    buttons.push([{ text: `Track ${item.orderId}`, callback_data: `order:${index}` }]);
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
  await sendTelegramPhoto(chatId, deposit.address, `${t("en", "deposit")}: \n<code>${html(deposit.address)}</code>${memo}`);
}
async function persistCreatedOrder(chatId: string, orderId: string, trackingToken: string, orderKind: string, result: Record<string, unknown>, requiresDeposit: boolean) {
  await db.transaction(async (tx) => {
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
async function handleText(chatId: string, locale: TelegramLocale, text: string) {
  const command = text.trim().split(/\s+/)[0].toLowerCase();
  if (command === "/exchange") { await exchangeOptions(chatId, locale, "swap"); return; }
  if (command === "/convert") { await exchangeOptions(chatId, locale, "convert"); return; }
  if (command === "/track") { await saveSession(chatId, "track", {}); await sendTelegramMessage(chatId, t(locale, "tracking")); return; }
  if (command === "/orders") { await sendOrders(chatId, locale); return; }
  if (command === "/support") { await callback(chatId, locale, "support"); return; }
  if (command === "/language") { await sendTelegramMessage(chatId, t(locale, "language"), languageButtons()); return; }
  const session = await getSession(chatId);
  if (session?.state === "amount") {
    const amount = Number(text.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      await sendTelegramMessage(chatId, t(locale, "askAmount"));
      return;
    }
    const source = session.data.source as SettlementOption;
    const target = session.data.target as SettlementOption;
    const mode = session.data.mode === "convert" ? "convert" : "swap";
    const type = mode === "convert" ? "instant" : "manual";
    const response = await fetch(`${baseUrl()}${type === "instant" ? "/api/quickex/quote" : "/api/exchange/quote"}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(buildQuotePayload(mode, source, target, amount)),
    });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) { await sendTelegramMessage(chatId, `QuickXchange could not quote this route: ${html(result.error ?? "route unavailable")}`); return; }
    const fields = (result.requiredSettlementFields as Array<Record<string, unknown>> | undefined) ?? [];
    const firstField = nextRequiredField(fields as Array<{ required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } }>, 0, {});
    const needsDestination = shouldAskDestination(mode, target);
    const sourceNeedsRefund = shouldAskRefund(source);
    const initialState = firstField >= 0 ? "field" : needsDestination ? "destination" : sourceNeedsRefund ? "refundAddress" : "email";
    await saveSession(chatId, initialState, { ...session.data, amount, quote: result, fieldIndex: firstField, fields, values: {} });
    if (firstField >= 0) await askField(chatId, fields[firstField], firstField, locale);
    else await sendTelegramMessage(chatId, needsDestination ? t(locale, "destination") : sourceNeedsRefund ? t(locale, "optionalRefund") : t(locale, "email"), sourceNeedsRefund && !needsDestination ? [[{ text: t(locale, "skip"), callback_data: "skip:refund" }]] : undefined);
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
      const needsRefund = shouldAskRefund(session.data.source as SettlementOption);
      await saveSession(chatId, needsDestination ? "destination" : needsRefund ? "refundAddress" : "email", { ...session.data, values });
      await sendTelegramMessage(chatId, needsDestination ? t(locale, "destination") : needsRefund ? t(locale, "optionalRefund") : t(locale, "email"), !needsDestination && needsRefund ? [[{ text: t(locale, "skip"), callback_data: "skip:refund" }]] : undefined);
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
    if (shouldAskRefund(session.data.source as SettlementOption)) {
      await saveSession(chatId, "refundAddress", { ...session.data, destinationAddress: text.trim() });
      await sendTelegramMessage(chatId, t(locale, "optionalRefund"), [[{ text: t(locale, "skip"), callback_data: "skip:refund" }]]);
      return;
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
    if (shouldAskRefund(session.data.source as SettlementOption)) {
      await saveSession(chatId, "refundAddress", { ...session.data, destinationMemo: text.trim() });
      await sendTelegramMessage(chatId, t(locale, "optionalRefund"), [[{ text: t(locale, "skip"), callback_data: "skip:refund" }]]);
      return;
    }
    await saveSession(chatId, "email", { ...session.data, destinationMemo: text.trim() });
    await sendTelegramMessage(chatId, t(locale, "email"));
    return;
  }
  if (session?.state === "refundAddress") {
    const address = text.trim();
    if (address) {
      if (session.data.mode === "convert") {
        const response = await fetch(`${baseUrl()}/api/quickex/validate-address`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: (session.data.source as SettlementOption).assetCode, network: (session.data.source as SettlementOption).routeNetwork, address }) });
        if (!response.ok) { await sendTelegramMessage(chatId, t(locale, "refundInvalid")); return; }
      }
      const needsMemo = (session.data.source as SettlementOption).requiresMemo;
      await saveSession(chatId, needsMemo ? "refundMemo" : "email", { ...session.data, refundAddress: address });
      await sendTelegramMessage(chatId, needsMemo ? t(locale, "memo") : t(locale, "email"));
    }
    return;
  }
  if (session?.state === "refundMemo") {
    await saveSession(chatId, "email", { ...session.data, refundMemo: text.trim() });
    await sendTelegramMessage(chatId, t(locale, "email"));
    return;
  }
  if (session?.state === "email") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text.trim())) { await sendTelegramMessage(chatId, t(locale, "invalidEmail")); return; }
    await saveSession(chatId, "review", { ...session.data, email: text.trim() });
    const source = session.data.source as SettlementOption;
    const target = session.data.target as SettlementOption;
    await sendTelegramMessage(chatId, `${t(locale, "review")}\n${html(session.data.amount)} ${html(source.assetCode)} (${html(source.routeNetwork)}) → ${html(target.assetCode)} (${html(target.routeNetwork)})\n${session.data.destinationAddress ? `${t(locale, "destination")} ${html(session.data.destinationAddress)}\n` : ""}${t(locale, "email")} ${html(text.trim())}`, [[{ text: t(locale, "confirm"), callback_data: "confirm" }], [{ text: t(locale, "cancel"), callback_data: "cancel" }]]);
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
async function callback(chatId: string, locale: TelegramLocale, data: string) {
  if (data.startsWith("lang:")) {
    const next = localeOf(data.slice(5));
    await db.update(telegramChatsTable).set({ locale: next, updatedAt: new Date() }).where(eq(telegramChatsTable.chatId, chatId));
    await mainMenu(chatId, next); return;
  }
  if (data === "language") { await sendTelegramMessage(chatId, t(locale, "language"), languageButtons()); return; }
  if (data === "exchange") { await sendTelegramMessage(chatId, t(locale, "choose"), [[{ text: t(locale, "swap"), callback_data: "mode:swap" }, { text: t(locale, "convert"), callback_data: "mode:convert" }]]); return; }
  if (data.startsWith("mode:")) { await exchangeOptions(chatId, locale, data.slice(5) as "swap" | "convert"); return; }
  if (data.startsWith("src:")) { const session = await getSession(chatId); await chooseTarget(chatId, locale, Number(data.slice(4))); return; }
  if (data.startsWith("srcpage:")) { const session = await getSession(chatId); const options = (session?.data.options as SettlementOption[] | undefined) ?? []; const page = Number(data.slice(8)); await sendTelegramMessage(chatId, t(locale, "send"), options.slice(page * 8, page * 8 + 8).map((option, index) => [{ text: `${option.assetCode} · ${option.title}`, callback_data: `src:${index + page * 8}` }])); return; }
  if (data.startsWith("tgt:")) { const session = await getSession(chatId); const targets = (session?.data.targets as SettlementOption[] | undefined) ?? []; const target = targets[Number(data.slice(4))]; await saveSession(chatId, "amount", { ...session?.data, target, type: session?.data.mode }); await sendTelegramMessage(chatId, t(locale, "askAmount")); return; }
  if (data.startsWith("tgtpage:")) { const session = await getSession(chatId); const targets = (session?.data.targets as SettlementOption[] | undefined) ?? []; const page = Number(data.slice(8)); await sendTelegramMessage(chatId, t(locale, "receive"), targets.slice(page * 8, page * 8 + 8).map((option, index) => [{ text: `${option.assetCode} · ${option.title}`, callback_data: `tgt:${index + page * 8}` }])); return; }
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
    const index = Number(data.slice(9));
    if (fields[index]?.required !== false) return;
    const values = (session.data.values as Record<string, unknown>) ?? {};
    const next = nextRequiredField(fields as Array<{ required?: boolean; requiredWhen?: { fieldKey: string; equals: string | string[] } }>, index + 1, values);
    if (next >= 0) { await saveSession(chatId, "field", { ...session.data, fieldIndex: next }); await askField(chatId, fields[next], next); }
    else { const needs = shouldAskDestination(session.data.mode === "convert" ? "convert" : "swap", session.data.target as SettlementOption); await saveSession(chatId, needs ? "destination" : "email", session.data); await sendTelegramMessage(chatId, needs ? t(locale, "destination") : t(locale, "email")); }
    return;
  }
  if (data === "skip:refund") {
    const session = await getSession(chatId);
    if (session?.state !== "refundAddress") return;
    await saveSession(chatId, "email", session.data);
    await sendTelegramMessage(chatId, t(locale, "email"));
    return;
  }
  if (data === "track") { await saveSession(chatId, "track", {}); await sendTelegramMessage(chatId, t(locale, "tracking")); return; }
  if (data === "support") { await sendTelegramMessage(chatId, `${t(locale, "supportText")}${process.env.TELEGRAM_SUPPORT_URL ? `\n${process.env.TELEGRAM_SUPPORT_URL}` : ""}`); return; }
  if (data === "orders") {
    await sendOrders(chatId, locale); return;
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
    await callback(chatId, locale, "confirm");
    return;
  }
  if (data === "confirm") {
    const session = await getSession(chatId);
    if (!session || session.state !== "review") { await sendTelegramMessage(chatId, t(locale, "expired")); return; }
    const body = (session.data.frozenCreateBody as ReturnType<typeof buildCreatePayload> | undefined)
      ?? buildCreatePayload(session.data.mode === "convert" ? "convert" : "swap", session.data.source as SettlementOption, session.data.target as SettlementOption, session.data);
    await saveSession(chatId, telegramCreateState(session.state), { ...session.data, frozenCreateBody: body });
    const response = await fetch(`${baseUrl()}${body.type === "instant" ? "/api/quickex/create-order" : "/api/exchange/orders"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        await saveSession(chatId, "review", session.data);
        await sendTelegramMessage(chatId, `QuickXchange could not create the order: ${html(result.error ?? "please check the details and try again")}\nYour review is still saved; you may retry safely.`);
      } else {
        await sendTelegramMessage(chatId, `QuickXchange could not confirm whether the order was created: ${html(result.error ?? "provider timeout")}\nPlease do not start over. Retry only when reconciliation confirms no order exists.`, [[{ text: t(locale, "retry"), callback_data: "retry:create" }]]);
      }
      return;
    }
    const orderId = String(result.id), trackingToken = String(result.trackingToken ?? "");
    const orderKind = body.type === "instant" ? "convert" : "swap";
    await persistCreatedOrder(chatId, orderId, trackingToken, orderKind, result, telegramRequiresDeposit(orderKind, (session.data.source as SettlementOption)?.kind));
    await saveSession(chatId, "idle", {});
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
  try {
    await withTelegramChatLock(chatId, () => telegramContext.run({ updateId }, async () => {
      const [session] = await db.select({ lastAppliedUpdateId: telegramWizardSessionsTable.lastAppliedUpdateId }).from(telegramWizardSessionsTable).where(eq(telegramWizardSessionsTable.chatId, chatId)).limit(1);
      if (!session || shouldApplyUpdate(session.lastAppliedUpdateId, updateId)) {
        if (query?.id) await telegramCall("answerCallbackQuery", { callback_query_id: query.id });
        if (query?.data) await callback(chatId, locale, query.data);
        else if (message?.text) await handleText(chatId, locale, message.text);
      }
    }));
    await db.update(telegramProcessedUpdatesTable).set({ status: "completed", claimToken: null, claimExpiresAt: null, lastError: "" }).where(and(eq(telegramProcessedUpdatesTable.updateId, updateId), eq(telegramProcessedUpdatesTable.claimToken, claimToken)));
    res.sendStatus(200);
  } catch (error) {
    await sendTelegramMessage(chatId, t(locale, "stepError"));
    await db.update(telegramProcessedUpdatesTable).set({ status: "failed", claimToken: null, claimExpiresAt: null, lastError: error instanceof Error ? error.message.slice(0, 500) : "processing failed" }).where(and(eq(telegramProcessedUpdatesTable.updateId, updateId), eq(telegramProcessedUpdatesTable.claimToken, claimToken)));
    res.status(500).json({ error: "Telegram update processing failed." });
  }
});
export default router;

export async function setupTelegramCommands() {
  if (!telegramEnabled()) return false;
  await telegramCall("setMyCommands", { commands: [
    { command: "start", description: "Start QuickXchange" },
    { command: "exchange", description: "Start an exchange" },
    { command: "track", description: "Track an order" },
    { command: "orders", description: "My orders" },
    { command: "support", description: "Contact support" },
    { command: "language", description: "Choose language" },
  ] });
  return true;
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
            await persistCreatedOrder(session.chatId, orderId, String(result.trackingToken ?? signOrderTrackingToken(orderId)), orderKind, result, telegramRequiresDeposit(orderKind, (session.data.source as SettlementOption)?.kind));
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
    for (let offset = 0; ; offset += 100) {
      const links = await db.select().from(telegramOrderLinksTable).orderBy(telegramOrderLinksTable.createdAt).limit(100).offset(offset);
      if (!links.length) break;
      for (const link of links) {
       try {
      const [order] = link.orderKind === "convert"
        ? await db.select({ id: quickexOrdersTable.legacyOrderId, status: quickexOrdersTable.status, statusVersion: quickexOrdersTable.recordVersion, amount: quickexOrdersTable.amounts, receiveAmount: quickexOrdersTable.amounts }).from(quickexOrdersTable).where(eq(quickexOrdersTable.legacyOrderId, link.orderId)).limit(1)
        : await db.select({ id: ordersTable.id, status: ordersTable.status, statusVersion: ordersTable.statusVersion, amount: ordersTable.amount, receiveAmount: ordersTable.receiveAmount }).from(ordersTable).where(eq(ordersTable.id, link.orderId)).limit(1);
      if (!order) continue;
      const quickexAmounts = link.orderKind === "convert" && order.amount && typeof order.amount === "object"
        ? order.amount as { amount?: string; receiveAmount?: string }
        : undefined;
      await db.insert(telegramNotificationOutboxTable).values({
        chatId: link.chatId,
        orderId: order.id,
        statusVersion: order.statusVersion,
        payload: { status: order.status, amount: quickexAmounts?.amount ?? order.amount, receiveAmount: quickexAmounts?.receiveAmount ?? order.receiveAmount },
      }).onConflictDoNothing();
       } catch { /* One malformed provider row must not stop the cursor. */ }
      }
      if (links.length < 100) break;
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
        if (payload.eventKind === "order_created") {
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
          const caption = `✅ <b>${t(noticeLocale, "order")} ${html(claimed.orderId)}</b>\n${t(noticeLocale, "status")}: <b>${html(payload.status ?? "updated")}</b>${deposit ? `\n${t(noticeLocale, "deposit")}: <code>${html(deposit.address)}</code>${deposit.memo ? `\n${t(noticeLocale, "memo")}: <code>${html(deposit.memo)}</code>` : ""}` : ""}`;
          if (deposit) await sendTelegramPhoto(claimed.chatId, deposit.address, caption);
          else await sendTelegramMessage(claimed.chatId, caption);
        } else {
          await sendTelegramMessage(claimed.chatId, `🔔 QuickXchange ${t(noticeLocale, "order")} <code>${html(claimed.orderId)}</code> ${t(noticeLocale, "notification")} <b>${html(payload.status ?? "updated")}</b>.`);
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
  telegramWorker = setInterval(() => void run().catch(() => { telegramWorkerRunning = false; }), 30_000);
  telegramWorker.unref();
  return () => { if (telegramWorker) clearInterval(telegramWorker); telegramWorker = undefined; };
}