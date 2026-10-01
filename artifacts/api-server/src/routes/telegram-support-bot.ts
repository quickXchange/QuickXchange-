import { Router, type Request } from "express";
import {
  CheckTelegramSupportBotConnectionResponse,
  GetTelegramSupportBotResponse,
  RegisterTelegramSupportBotWebhookResponse,
} from "@workspace/api-zod";
import { requireOwner } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";
import { enqueueSupportBotUpdate } from "../lib/telegram-support-bot-outbox";
import {
  DEFAULT_SUPPORT_BOT_SETTINGS,
  getSupportBotSettings,
  checkSupportBotConnection,
  localeForSupport,
  planSupportBotAction,
  registerSupportBotWebhook,
  safeSupportApiError,
  saveSupportBotSettings,
  supportBotCredentialsSafe,
  supportBotStatus,
  webhookSecretMatches,
  type SupportAction,
} from "../lib/telegram-support-bot";

const router = Router();

function ownerError(error: unknown): ApiError {
  const safe = safeSupportApiError(error);
  return new ApiError(safe.code, safe.message, safe.status);
}

function webhookChatId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d{1,20}$/.test(value) && value !== "0") return value;
  return null;
}

function telegramUserIdValid(value: unknown): boolean {
  return (typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === "string" && /^\d{1,20}$/.test(value) && value !== "0");
}

function callbackIdValid(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 256 && /^[\x21-\x7e]+$/.test(value);
}

type ParsedWebhookAction =
  | { kind: "ignore" }
  | { kind: "invalid" }
  | { kind: "action"; updateId: number; botId: string; action: SupportAction };

export function parseSupportBotWebhookUpdate(
  update: unknown,
  botId: string,
  settings = DEFAULT_SUPPORT_BOT_SETTINGS,
): ParsedWebhookAction {
  if (!update || typeof update !== "object" || Array.isArray(update)) return { kind: "invalid" };
  const body = update as Record<string, unknown>;
  if (!Number.isSafeInteger(body.update_id) || Number(body.update_id) < 0) return { kind: "invalid" };
  const updateId = Number(body.update_id);
  const message = body.message && typeof body.message === "object" && !Array.isArray(body.message)
    ? body.message as Record<string, unknown>
    : null;
  const callback = body.callback_query && typeof body.callback_query === "object" && !Array.isArray(body.callback_query)
    ? body.callback_query as Record<string, unknown>
    : null;
  if (!message && !callback) {
    const channelPost = body.channel_post && typeof body.channel_post === "object" && !Array.isArray(body.channel_post)
      ? body.channel_post as Record<string, unknown>
      : null;
    const channelChat = channelPost?.chat && typeof channelPost.chat === "object" && !Array.isArray(channelPost.chat)
      ? channelPost.chat as Record<string, unknown>
      : null;
    return channelChat?.type === "channel" ? { kind: "ignore" } : { kind: "invalid" };
  }
  if (Boolean(message) === Boolean(callback)) return { kind: "invalid" };

  let chat: Record<string, unknown> | null = null;
  let from: Record<string, unknown> | null = null;
  let callbackQueryId: string | null = null;
  let callbackData: string | undefined;
  let text: string | undefined;
  let languageCode: unknown;
  if (message) {
    chat = message.chat && typeof message.chat === "object" && !Array.isArray(message.chat)
      ? message.chat as Record<string, unknown>
      : null;
    from = message.from && typeof message.from === "object" && !Array.isArray(message.from)
      ? message.from as Record<string, unknown>
      : null;
    if (chat?.type && chat.type !== "private") return { kind: "ignore" };
    if (message.text !== undefined) {
      if (typeof message.text !== "string" || message.text.length > 4000) return { kind: "invalid" };
      text = message.text;
    }
  } else if (callback) {
    const callbackMessage = callback.message && typeof callback.message === "object" && !Array.isArray(callback.message)
      ? callback.message as Record<string, unknown>
      : null;
    chat = callbackMessage?.chat && typeof callbackMessage.chat === "object" && !Array.isArray(callbackMessage.chat)
      ? callbackMessage.chat as Record<string, unknown>
      : null;
    from = callback.from && typeof callback.from === "object" && !Array.isArray(callback.from)
      ? callback.from as Record<string, unknown>
      : null;
    if (chat?.type && chat.type !== "private") return { kind: "ignore" };
    if (!callbackIdValid(callback.id) || typeof callback.data !== "string" ||
      Buffer.byteLength(callback.data, "utf8") > 64 || !/^[\x20-\x7e]*$/.test(callback.data)) {
      return { kind: "ignore" };
    }
    callbackQueryId = callback.id;
    callbackData = callback.data;
  }

  // Groups, supergroups, channels, and inline-mode callbacks are intentionally ignored.
  if (!chat || chat.type !== "private") return { kind: "ignore" };
  const chatId = webhookChatId(chat.id);
  if (!chatId || !from || !telegramUserIdValid(from.id)) return { kind: "invalid" };
  languageCode = from.language_code;
  const locale = localeForSupport(languageCode);
  const action = planSupportBotAction({
    settings,
    chatId,
    locale,
    ...(text !== undefined ? { text } : {}),
    ...(callbackData !== undefined ? { callbackData } : {}),
    ...(callbackQueryId ? { callbackQueryId } : {}),
  });
  return { kind: "action", updateId, botId, action };
}

// Routing decisions are only logical at ingest. The worker re-renders every
// queued action using current approved settings immediately before delivery.
function hasUnexpectedBody(req: Request): boolean {
  return req.body !== undefined && (!req.body || typeof req.body !== "object" ||
    Array.isArray(req.body) || Object.keys(req.body).length > 0);
}

function hasUnexpectedQuery(req: Request): boolean {
  return Object.keys(req.query).length > 0;
}

router.get("/admin/telegram/support-bot", requireOwner, async (req, res): Promise<void> => {
  if (hasUnexpectedQuery(req)) {
    throw new ApiError("INVALID_SUPPORT_BOT_REQUEST", "This settings request does not accept query parameters.", 400);
  }
  try {
    const settings = await getSupportBotSettings();
    res.json(GetTelegramSupportBotResponse.parse({ settings, status: await supportBotStatus(settings.enabled) }));
  } catch (error) {
    throw ownerError(error);
  }
});

router.put("/admin/telegram/support-bot", requireOwner, async (req, res): Promise<void> => {
  if (hasUnexpectedQuery(req)) {
    throw new ApiError("INVALID_SUPPORT_BOT_REQUEST", "This settings request does not accept query parameters.", 400);
  }
  try {
    const operatorId = String(res.locals.operator.id);
    const settings = await saveSupportBotSettings(req.body, operatorId);
    res.json(GetTelegramSupportBotResponse.parse({ settings, status: await supportBotStatus(settings.enabled) }));
  } catch (error) {
    throw ownerError(error);
  }
});

router.post("/admin/telegram/support-bot/connection/check", requireOwner, async (req, res): Promise<void> => {
  if (hasUnexpectedBody(req) || hasUnexpectedQuery(req)) {
    throw new ApiError("INVALID_SUPPORT_BOT_REQUEST", "This connection check does not accept a request body.", 400);
  }
  try {
    res.json(CheckTelegramSupportBotConnectionResponse.parse(await checkSupportBotConnection()));
  } catch (error) {
    throw ownerError(error);
  }
});

router.post("/admin/telegram/support-bot/connection/register", requireOwner, async (req, res): Promise<void> => {
  if (hasUnexpectedBody(req) || hasUnexpectedQuery(req)) {
    throw new ApiError("INVALID_SUPPORT_BOT_REQUEST", "This registration request does not accept a request body.", 400);
  }
  try {
    res.json(RegisterTelegramSupportBotWebhookResponse.parse(await registerSupportBotWebhook()));
  } catch (error) {
    throw ownerError(error);
  }
});

router.post("/telegram/support/webhook", async (req, res): Promise<void> => {
  if (!webhookSecretMatches(req.get("x-telegram-bot-api-secret-token"))) {
    res.status(401).json({ error: "Invalid support bot webhook secret." });
    return;
  }
  if (!supportBotCredentialsSafe()) {
    res.sendStatus(200);
    return;
  }
  if (hasUnexpectedQuery(req)) {
    res.status(400).json({ error: "Invalid support bot update." });
    return;
  }
  const rawSize = Buffer.byteLength(JSON.stringify(req.body ?? null), "utf8");
  if (rawSize > 64 * 1024) {
    res.status(413).json({ error: "Support bot update is too large." });
    return;
  }
  const settings = await getSupportBotSettings();
  if (!settings.enabled) {
    res.sendStatus(200);
    return;
  }
  const token = process.env.TELEGRAM_SUPPORT_BOT_TOKEN?.trim() ?? "";
  const botId = /^(\d+):/.exec(token)?.[1];
  if (!botId) {
    res.sendStatus(200);
    return;
  }
  const parsed = parseSupportBotWebhookUpdate(req.body, botId, settings);
  if (parsed.kind === "ignore") {
    res.sendStatus(200);
    return;
  }
  if (parsed.kind === "invalid") {
    res.status(400).json({ error: "Invalid support bot update." });
    return;
  }
  await enqueueSupportBotUpdate(parsed.botId, parsed.updateId, parsed.action);
  // A duplicate was durably accepted by the first request.
  res.sendStatus(200);
});

export default router;