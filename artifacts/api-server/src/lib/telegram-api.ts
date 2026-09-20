import QRCode from "qrcode";
const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim();
const api = () => token() ? `https://api.telegram.org/bot${token()}` : null;

export type TelegramButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

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
  const response = await fetch(`${base}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok) throw new Error(`Telegram ${method} failed: ${payload.description ?? response.status}`);
  return payload.result;
}

export function telegramEnabled() {
  return Boolean(token());
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