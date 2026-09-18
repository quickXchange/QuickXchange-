import { Router, type IRouter } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, telegramAccountLinkChallengesTable } from "@workspace/db";
import { requireCustomer } from "../lib/customer-auth";
import { ApiError } from "../lib/api-error";
import {
  consumeTelegramLinkChallenge,
  hashTelegramLinkToken,
  TelegramLinkChallengeError,
  TelegramLinkConflictError,
} from "../lib/telegram-link";

const router: IRouter = Router();

function tokenFrom(req: { query: Record<string, unknown>; body?: unknown }) {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const token = typeof body.token === "string" ? body.token : req.query.token;
  return typeof token === "string" ? token.trim() : "";
}

router.get("/telegram/connect/status", async (req, res, next) => {
  try {
    const token = tokenFrom(req);
    if (!token) throw new ApiError("TELEGRAM_LINK_INVALID", "This Telegram link is invalid or expired.", 404);
    const [challenge] = await db.select({ intent: telegramAccountLinkChallengesTable.intent, expiresAt: telegramAccountLinkChallengesTable.expiresAt })
      .from(telegramAccountLinkChallengesTable)
      .where(and(
        eq(telegramAccountLinkChallengesTable.tokenHash, hashTelegramLinkToken(token)),
        gt(telegramAccountLinkChallengesTable.expiresAt, new Date()),
        isNull(telegramAccountLinkChallengesTable.consumedAt),
      )).limit(1);
    if (!challenge || !["signin", "signup"].includes(challenge.intent)) {
      throw new ApiError("TELEGRAM_LINK_INVALID", "This Telegram link is invalid or expired.", 404);
    }
    res.json({ entity: "telegram_link_challenge", valid: true, intent: challenge.intent, expiresAt: challenge.expiresAt.toISOString() });
  } catch (error) { next(error); }
});

router.post("/telegram/connect", requireCustomer, async (req, res, next) => {
  try {
    const token = tokenFrom(req);
    if (!token || token.length > 256) throw new ApiError("TELEGRAM_LINK_INVALID", "This Telegram link is invalid or expired.", 404);
    const result = await consumeTelegramLinkChallenge(token, undefined, String(res.locals.customerClerkUserId));
    res.json({ entity: "telegram_link", linked: true, intent: result.intent, chatId: result.chatId });
  } catch (error) {
    if (error instanceof TelegramLinkChallengeError) {
      next(new ApiError("TELEGRAM_LINK_INVALID", "This Telegram link is invalid or expired.", 404));
    } else if (error instanceof TelegramLinkConflictError) {
      next(new ApiError("TELEGRAM_ALREADY_LINKED", error.message, 409));
    } else next(error);
  }
});

export default router;