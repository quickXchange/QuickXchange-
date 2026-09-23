import { randomUUID } from "node:crypto";
import { and, asc, eq, lte, or, isNull } from "drizzle-orm";
import { databasePoolTelemetry, db, telegramNewsOutboxTable } from "@workspace/db";

const CLAIM_MS = 2 * 60_000;
const MAX_ATTEMPTS = 8;
const MAX_TELEGRAM_LENGTH = 3900;

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function trimTelegram(value: string): string {
  return value.length <= MAX_TELEGRAM_LENGTH ? value : `${value.slice(0, MAX_TELEGRAM_LENGTH - 1).trimEnd()}…`;
}

function publicBaseUrl(): string {
  const value = process.env.PUBLIC_APP_URL?.trim();
  if (!value) throw new Error("PUBLIC_APP_URL is required for Telegram news links.");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS.");
  return url.toString().replace(/\/$/, "");
}

export function telegramNewsText(item: Pick<typeof telegramNewsOutboxTable.$inferSelect, "title" | "summary" | "articleSlug" | "sourceUrl" | "sourcePublisher">): string {
  const articleUrl = `${publicBaseUrl()}/blog/${encodeURIComponent(item.articleSlug)}`;
  return trimTelegram(
    `<b>${escapeHtml(item.title)}</b>\n\n${escapeHtml(item.summary)}\n\n` +
    `🔗 <a href="${escapeHtml(articleUrl)}">Read on QuickXchange</a>\n` +
    `Source: <a href="${escapeHtml(item.sourceUrl)}">${escapeHtml(item.sourcePublisher || "Original publisher")}</a>`,
  );
}

export async function enqueueTelegramNewsTx(tx: any, article: {
  id: string; title: string; excerpt: string; slug: string; sourceUrl?: string; sourcePublisher?: string;
}): Promise<void> {
  if (!process.env.TELEGRAM_NEWS_CHANNEL_ID?.trim()) throw new Error("telegram_news_channel_not_configured");
  if (!article.sourceUrl) return;
  await tx.insert(telegramNewsOutboxTable).values({
    articleId: article.id,
    channelId: process.env.TELEGRAM_NEWS_CHANNEL_ID.trim(),
    title: article.title,
    summary: article.excerpt,
    articleSlug: article.slug,
    sourceUrl: article.sourceUrl,
    sourcePublisher: article.sourcePublisher ?? "",
  }).onConflictDoNothing({ target: telegramNewsOutboxTable.articleId });
}

async function send(item: typeof telegramNewsOutboxTable.$inferSelect): Promise<void> {
  const token = process.env.TELEGRAM_NEWS_BOT_TOKEN?.trim();
  if (!token) throw new Error("telegram_news_bot_not_configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: item.channelId,
      text: telegramNewsText(item),
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !payload.ok) throw new Error(`telegram_news_${payload.description ?? response.status}`);
}

function eligible(now: Date) {
  return or(
    and(eq(telegramNewsOutboxTable.deliveryStatus, "pending"), lte(telegramNewsOutboxTable.nextAttemptAt, now)),
    and(eq(telegramNewsOutboxTable.deliveryStatus, "sending"), or(isNull(telegramNewsOutboxTable.claimExpiresAt), lte(telegramNewsOutboxTable.claimExpiresAt, now))),
  );
}

export async function processTelegramNewsOutbox(limit = 10): Promise<number> {
  if (!process.env.TELEGRAM_NEWS_BOT_TOKEN?.trim()) {
    return 0;
  }
  const now = new Date();
  const rows = await db.select().from(telegramNewsOutboxTable).where(eligible(now))
    .orderBy(asc(telegramNewsOutboxTable.createdAt), asc(telegramNewsOutboxTable.id)).limit(limit);
  let delivered = 0;
  for (const candidate of rows) {
    const claimToken = randomUUID();
    const [claimed] = await db.update(telegramNewsOutboxTable).set({
      deliveryStatus: "sending", claimToken, claimExpiresAt: new Date(Date.now() + CLAIM_MS),
      attemptCount: candidate.attemptCount + 1,
    }).where(and(eq(telegramNewsOutboxTable.id, candidate.id), eligible(now))).returning();
    if (!claimed) continue;
    try {
      await send(claimed);
      const [done] = await db.update(telegramNewsOutboxTable).set({
        deliveryStatus: "delivered", deliveredAt: new Date(), claimToken: null, claimExpiresAt: null,
      }).where(and(eq(telegramNewsOutboxTable.id, claimed.id), eq(telegramNewsOutboxTable.claimToken, claimToken))).returning();
      if (done) delivered += 1;
    } catch (error) {
      const exhausted = claimed.attemptCount >= MAX_ATTEMPTS;
      await db.update(telegramNewsOutboxTable).set({
        deliveryStatus: exhausted ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.max(0, claimed.attemptCount - 1))),
        claimToken: null, claimExpiresAt: null,
        lastError: error instanceof Error ? error.message.slice(0, 240) : "telegram_delivery_failed",
      }).where(and(eq(telegramNewsOutboxTable.id, claimed.id), eq(telegramNewsOutboxTable.claimToken, claimToken)));
      const { logger } = await import("./logger");
      logger.warn({ err: error, telegramNewsOutboxId: claimed.id }, "Telegram news delivery failed");
    }
  }
  return delivered;
}

export function startTelegramNewsWorker(): () => void {
  if (!process.env.TELEGRAM_NEWS_BOT_TOKEN?.trim()) {
    void import("./logger").then(({ logger }) =>
      logger.warn({ once: true }, "Telegram news worker paused: TELEGRAM_NEWS_BOT_TOKEN is not configured"));
  }
  const timer = setInterval(() => {
    void processTelegramNewsOutbox().catch(async (error) => {
      const { logger } = await import("./logger");
      logger.warn({
        err: error,
        dbPool: databasePoolTelemetry("telegram-news-worker", error),
      }, "Telegram news worker failed");
    });
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}