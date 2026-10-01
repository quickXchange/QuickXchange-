import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const telegramSupportBotSettingsTable = pgTable("telegram_support_bot_settings", {
  id: text("id").primaryKey().default("global"),
  settings: jsonb("settings").notNull(),
  webhookAttestedTokenDigest: text("webhook_attested_token_digest"),
  webhookAttestedSecretDigest: text("webhook_attested_secret_digest"),
  webhookAttestedUrl: text("webhook_attested_url"),
  webhookAttestedAt: timestamp("webhook_attested_at", { withTimezone: true }),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** This inbox deliberately stores only a logical action, never Telegram text or user profile fields. */
export const telegramSupportBotUpdatesTable = pgTable("telegram_support_bot_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  botId: text("bot_id").notNull(),
  updateId: text("update_id").notNull(),
  actionKind: text("action_kind").notNull(),
  chatId: text("chat_id").notNull(),
  locale: text("locale").notNull(),
  faqId: text("faq_id"),
  callbackQueryId: text("callback_query_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("telegram_support_bot_update_identity_uidx").on(table.botId, table.updateId),
  index("telegram_support_bot_updates_created_idx").on(table.createdAt),
]);

/** Dedicated retry queue, isolated from exchange/customer/news delivery pipelines. */
export const telegramSupportBotOutboxTable = pgTable("telegram_support_bot_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  updateId: uuid("update_id").notNull().references(() => telegramSupportBotUpdatesTable.id, { onDelete: "cascade" }),
  botId: text("bot_id").notNull(),
  incomingUpdateId: text("incoming_update_id").notNull(),
  actionKind: text("action_kind").notNull(),
  chatId: text("chat_id").notNull(),
  locale: text("locale").notNull(),
  faqId: text("faq_id"),
  callbackQueryId: text("callback_query_id"),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code").notNull().default(""),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("telegram_support_bot_outbox_update_uidx").on(table.botId, table.incomingUpdateId),
  index("telegram_support_bot_outbox_delivery_idx").on(
    table.deliveryStatus, table.nextAttemptAt, table.claimExpiresAt, table.createdAt,
  ),
]);

export type TelegramSupportBotSettings = typeof telegramSupportBotSettingsTable.$inferSelect;
export type TelegramSupportBotUpdate = typeof telegramSupportBotUpdatesTable.$inferSelect;
export type TelegramSupportBotOutbox = typeof telegramSupportBotOutboxTable.$inferSelect;