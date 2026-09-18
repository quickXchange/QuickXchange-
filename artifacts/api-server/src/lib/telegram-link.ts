import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  telegramAccountLinkChallengesTable,
  telegramChatsTable,
} from "@workspace/db";

export type TelegramLinkIntent = "signin" | "signup";

const TOKEN_BYTES = 32;
const CHALLENGE_TTL_MS = 10 * 60_000;

export class TelegramLinkChallengeError extends Error {
  constructor(message = "Telegram link challenge is expired, consumed, or invalid.") {
    super(message);
    this.name = "TelegramLinkChallengeError";
  }
}

export class TelegramLinkConflictError extends Error {
  constructor(message = "This Telegram chat or QuickXchange account is already linked.") {
    super(message);
    this.name = "TelegramLinkConflictError";
  }
}

export function hashTelegramLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Creates a short-lived opaque token. Only its SHA-256 digest is persisted.
 * Callers must validate a private Telegram chat before invoking this function.
 */
export async function createTelegramLinkChallenge(
  chatId: string,
  telegramUserId: string,
  intent: TelegramLinkIntent,
): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await db.insert(telegramAccountLinkChallengesTable).values({
    tokenHash: hashTelegramLinkToken(token),
    chatId,
    telegramUserId,
    intent,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return token;
}

/**
 * Consumes and binds in one transaction. The conditional update makes replay,
 * expiry, and concurrent browser requests fail closed.
 */
export async function consumeTelegramLinkChallenge(
  token: string,
  telegramUserId: string | undefined,
  clerkCustomerUserId: string,
): Promise<{ chatId: string; intent: TelegramLinkIntent }> {
  const tokenHash = hashTelegramLinkToken(token);
  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [challenge] = await tx
        .update(telegramAccountLinkChallengesTable)
        .set({ consumedAt: now })
        .where(and(
          eq(telegramAccountLinkChallengesTable.tokenHash, tokenHash),
          ...(telegramUserId ? [eq(telegramAccountLinkChallengesTable.telegramUserId, telegramUserId)] : []),
          gt(telegramAccountLinkChallengesTable.expiresAt, now),
          isNull(telegramAccountLinkChallengesTable.consumedAt),
        ))
        .returning({
          chatId: telegramAccountLinkChallengesTable.chatId,
          intent: telegramAccountLinkChallengesTable.intent,
        });
      if (!challenge || !["signin", "signup"].includes(challenge.intent)) {
        throw new TelegramLinkChallengeError();
      }
      const [chat] = await tx
        .update(telegramChatsTable)
        .set({ clerkCustomerUserId, updatedAt: now })
        .where(and(
          eq(telegramChatsTable.chatId, challenge.chatId),
          isNull(telegramChatsTable.clerkCustomerUserId),
        ))
        .returning({ chatId: telegramChatsTable.chatId });
      if (!chat) throw new TelegramLinkConflictError();
      return { chatId: chat.chatId, intent: challenge.intent as TelegramLinkIntent };
    });
  } catch (error) {
    const wrapped = error as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    };
    const databaseError = wrapped.cause ?? wrapped;
    if (
      databaseError.code === "23505" &&
      databaseError.constraint === "telegram_chats_clerk_customer_user_uidx"
    ) {
      throw new TelegramLinkConflictError();
    }
    throw error;
  }
}