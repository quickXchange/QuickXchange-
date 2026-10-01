import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  telegramSupportBotOutboxTable,
  telegramSupportBotUpdatesTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  dispatchSupportBotAction,
  generateSupportClaimToken,
  SUPPORT_OUTBOX_LEASE_MS,
  SupportBotError,
  type SupportAction,
} from "./telegram-support-bot";

const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 1_000;

export async function enqueueSupportBotUpdate(
  botId: string,
  telegramUpdateId: number,
  action: SupportAction,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [inbox] = await tx.insert(telegramSupportBotUpdatesTable).values({
      botId,
      updateId: String(telegramUpdateId),
      actionKind: action.kind,
      chatId: action.chatId,
      locale: action.locale,
      faqId: action.faqId ?? null,
      callbackQueryId: action.callbackQueryId ?? null,
    }).onConflictDoNothing().returning({ id: telegramSupportBotUpdatesTable.id });
    if (!inbox) return false;
    await tx.insert(telegramSupportBotOutboxTable).values({
      updateId: inbox.id,
      botId,
      incomingUpdateId: String(telegramUpdateId),
      actionKind: action.kind,
      chatId: action.chatId,
      locale: action.locale,
      faqId: action.faqId ?? null,
      callbackQueryId: action.callbackQueryId ?? null,
    });
    return true;
  });
}

type ClaimedAction = {
  id: string;
  botId: string;
  claimToken: string;
  attemptCount: number;
  action: SupportAction;
};

async function claimNextSupportBotAction(): Promise<ClaimedAction | null> {
  const claimToken = generateSupportClaimToken();
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(telegramSupportBotOutboxTable)
      .where(and(
        sql`${telegramSupportBotOutboxTable.nextAttemptAt} <= clock_timestamp()`,
        or(
          eq(telegramSupportBotOutboxTable.deliveryStatus, "pending"),
          and(
            eq(telegramSupportBotOutboxTable.deliveryStatus, "sending"),
            or(
              isNull(telegramSupportBotOutboxTable.claimExpiresAt),
              sql`${telegramSupportBotOutboxTable.claimExpiresAt} <= clock_timestamp()`,
            ),
          ),
        ),
      ))
      .orderBy(asc(telegramSupportBotOutboxTable.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;
    const [claimed] = await tx.update(telegramSupportBotOutboxTable).set({
      deliveryStatus: "sending",
      attemptCount: candidate.attemptCount + 1,
      claimToken,
      claimExpiresAt: sql`clock_timestamp() + (${SUPPORT_OUTBOX_LEASE_MS} * interval '1 millisecond')`,
    }).where(eq(telegramSupportBotOutboxTable.id, candidate.id)).returning();
    if (!claimed) return null;
    return {
      id: claimed.id,
      botId: claimed.botId,
      claimToken,
      attemptCount: claimed.attemptCount,
      action: {
        kind: claimed.actionKind as SupportAction["kind"],
        chatId: claimed.chatId,
        locale: claimed.locale as SupportAction["locale"],
        ...(claimed.faqId ? { faqId: claimed.faqId } : {}),
        ...(claimed.callbackQueryId ? { callbackQueryId: claimed.callbackQueryId } : {}),
      },
    };
  });
}

async function updateClaimedAction(
  claimed: ClaimedAction,
  update: {
    deliveryStatus: "pending" | "delivered" | "failed";
    lastErrorCode: string;
    nextAttemptAt?: Date;
    deliveredAt?: Date;
  },
): Promise<void> {
  await db.update(telegramSupportBotOutboxTable).set({
    deliveryStatus: update.deliveryStatus,
    lastErrorCode: update.lastErrorCode,
    nextAttemptAt: update.nextAttemptAt,
    deliveredAt: update.deliveredAt,
    claimToken: null,
    claimExpiresAt: null,
  }).where(and(
    eq(telegramSupportBotOutboxTable.id, claimed.id),
    eq(telegramSupportBotOutboxTable.claimToken, claimed.claimToken),
    eq(telegramSupportBotOutboxTable.deliveryStatus, "sending"),
  ));
}

export async function dispatchNextSupportBotAction(): Promise<boolean> {
  const claimed = await claimNextSupportBotAction();
  if (!claimed) return false;
  try {
    await dispatchSupportBotAction(claimed.action, claimed.botId, {
      id: claimed.id,
      claimToken: claimed.claimToken,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error &&
      typeof error.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
      ? error.code
      : "TELEGRAM_DELIVERY_FAILED";
    const exhausted = claimed.attemptCount >= MAX_ATTEMPTS;
    const retryDelay = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.min(claimed.attemptCount - 1, 10)));
    await updateClaimedAction(claimed, {
      deliveryStatus: exhausted ? "failed" : "pending",
      lastErrorCode: code,
      ...(!exhausted ? { nextAttemptAt: new Date(Date.now() + retryDelay) } : {}),
    });
  }
  return true;
}

export function startTelegramSupportBotWorker(): () => Promise<void> {
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  const schedule = () => {
    if (stopping) return;
    timer = setTimeout(() => {
      inFlight = dispatchNextSupportBotAction()
        .then(() => undefined)
        .catch((error: unknown) => {
          logger.warn({
            code: error instanceof SupportBotError ? error.code : "SUPPORT_BOT_WORKER_FAILED",
          }, "Telegram support bot worker attempt failed");
        })
        .finally(() => {
          inFlight = null;
          schedule();
        });
    }, POLL_INTERVAL_MS);
    timer.unref();
  };
  schedule();
  return async () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    if (inFlight) await inFlight;
  };
}