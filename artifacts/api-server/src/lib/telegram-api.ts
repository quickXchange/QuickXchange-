import QRCode from "qrcode";
const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim();
const api = () => token() ? `https://api.telegram.org/bot${token()}` : null;

export type TelegramButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

export function sanitizeTelegramFailureReason(reason: unknown): string {
  const secret = token();
  let safe = reason instanceof Error ? reason.message : String(reason ?? "");
  if (secret) safe = safe.replaceAll(secret, "[redacted]");
  safe = safe
    .replace(/bot\d+:[A-Za-z0-9_-]+/gi, "bot[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return safe.slice(0, 300) || "Telegram request failed.";
}

export class TelegramApiError extends Error {
  readonly safeReason: string;
  constructor(method: string, reason: unknown) {
    const safeReason = sanitizeTelegramFailureReason(reason);
    super(`Telegram ${method} failed: ${safeReason}`);
    this.name = "TelegramApiError";
    this.safeReason = safeReason;
  }
}

export class TelegramBotIdentityError extends Error {
  constructor(message = "Telegram bot identity could not be verified. Check TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME, then retry.") {
    super(message);
    this.name = "TelegramBotIdentityError";
  }
}

export type TelegramBotIdentity = { id: number; is_bot: true; username: string };

export function validateTelegramBotIdentity(
  value: unknown,
  expectedUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, ""),
): TelegramBotIdentity {
  if (!value || typeof value !== "object") throw new TelegramBotIdentityError();
  const identity = value as Partial<TelegramBotIdentity>;
  if (identity.is_bot !== true || typeof identity.id !== "number" || !Number.isSafeInteger(identity.id) || typeof identity.username !== "string"
    || !/^[A-Za-z0-9_]{5,32}$/.test(identity.username)) {
    throw new TelegramBotIdentityError("Telegram returned an invalid bot identity. Verify that TELEGRAM_BOT_TOKEN belongs to a bot, then retry.");
  }
  if (expectedUsername && identity.username.toLowerCase() !== expectedUsername.toLowerCase()) {
    throw new TelegramBotIdentityError("The Telegram bot token does not match TELEGRAM_BOT_USERNAME. Update the bot configuration, then retry.");
  }
  return { id: identity.id, is_bot: true, username: identity.username };
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatTelegramOrderId(orderId: unknown): string {
  return `<b>Order ID</b>\n<code>${escapeTelegramHtml(orderId)}</code>`;
}

export async function telegramCall<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T | undefined> {
  const base = api();
  if (!base) return undefined;
  try {
    const response = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json() as { ok?: boolean; result?: T; description?: string };
    if (!response.ok || !payload.ok) throw new TelegramApiError(method, payload.description ?? `HTTP ${response.status}`);
    return payload.result;
  } catch (error) {
    if (error instanceof TelegramApiError) throw error;
    throw new TelegramApiError(method, error);
  }
}

export function telegramEnabled() {
  return Boolean(token());
}

export async function getTelegramBotIdentity(): Promise<TelegramBotIdentity> {
  if (!telegramEnabled()) {
    throw new TelegramBotIdentityError("Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN, then retry.");
  }
  try {
    return validateTelegramBotIdentity(await telegramCall("getMe", {}));
  } catch (error) {
    if (error instanceof TelegramBotIdentityError) throw error;
    throw new TelegramBotIdentityError("Telegram could not verify the configured bot token. Check TELEGRAM_BOT_TOKEN and retry.");
  }
}

export async function getTelegramWebhookInfo() {
  return telegramCall<{ url?: string; last_error_message?: string }>("getWebhookInfo", {});
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  keyboard?: TelegramButton[][],
) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  keyboard?: TelegramButton[][],
) {
  return telegramCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

export async function sendTelegramPhoto(chatId: string, photo: string, caption: string) {
  const base = api();
  if (!base) return undefined;
  const png = await QRCode.toBuffer(photo, { type: "png", width: 360, margin: 2 });
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  form.set("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "quickxchange-qr.png");
  const response = await fetch(`${base}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
  const payload = await response.json() as { ok?: boolean; result?: unknown; description?: string };
  if (!response.ok || !payload.ok) throw new Error(`Telegram sendPhoto failed: ${payload.description ?? response.status}`);
  return payload.result;
}