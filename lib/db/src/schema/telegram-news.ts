import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { blogArticlesTable } from "./blog";

export const telegramNewsOutboxTable = pgTable("telegram_news_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id").notNull().references(() => blogArticlesTable.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  articleSlug: text("article_slug").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourcePublisher: text("source_publisher").notNull().default(""),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  lastError: text("last_error").notNull().default(""),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("telegram_news_outbox_article_uidx").on(table.articleId),
  index("telegram_news_outbox_delivery_idx").on(table.deliveryStatus, table.nextAttemptAt, table.claimExpiresAt),
  check("telegram_news_outbox_status_check", sql`${table.deliveryStatus} in ('pending','sending','delivered','failed')`),
]);

export type TelegramNewsOutbox = typeof telegramNewsOutboxTable.$inferSelect;