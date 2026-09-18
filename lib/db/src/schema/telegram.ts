import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const telegramChatsTable = pgTable("telegram_chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: text("chat_id").notNull().unique(),
  userId: text("user_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  clerkCustomerUserId: text("clerk_customer_user_id"),
  locale: text("locale").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("telegram_chats_clerk_customer_user_uidx").on(table.clerkCustomerUserId),
]);

/** One-time browser account-link challenges. Raw tokens are never persisted. */
export const telegramAccountLinkChallengesTable = pgTable("telegram_account_link_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  chatId: text("chat_id").notNull().references(() => telegramChatsTable.chatId, { onDelete: "cascade" }),
  telegramUserId: text("telegram_user_id").notNull(),
  intent: text("intent").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("telegram_account_link_challenges_active_idx").on(table.chatId, table.expiresAt),
]);

export const telegramWizardSessionsTable = pgTable("telegram_wizard_sessions", {
  chatId: text("chat_id").primaryKey().references(() => telegramChatsTable.chatId, { onDelete: "cascade" }),
  state: text("state").notNull().default("idle"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(0),
  lastAppliedUpdateId: text("last_applied_update_id"),
  reconciliationClaimToken: text("reconciliation_claim_token"),
  reconciliationClaimExpiresAt: timestamp("reconciliation_claim_expires_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const telegramOrderLinksTable = pgTable("telegram_order_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: text("chat_id").notNull().references(() => telegramChatsTable.chatId, { onDelete: "cascade" }),
  orderId: text("order_id").notNull(),
  orderKind: text("order_kind").notNull().default("manual"),
  trackingToken: text("tracking_token").notNull(),
  source: text("source").notNull().default("telegram"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("telegram_order_links_chat_order_uidx").on(table.chatId, table.orderId),
  index("telegram_order_links_chat_created_idx").on(table.chatId, table.createdAt),
]);

export const telegramProcessedUpdatesTable = pgTable("telegram_processed_updates", {
  updateId: text("update_id").primaryKey(),
  status: text("status").notNull().default("processing"),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const telegramNotificationOutboxTable = pgTable("telegram_notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: text("chat_id").notNull(),
  orderId: text("order_id").notNull(),
  statusVersion: integer("status_version").notNull(),
  eventKind: text("event_kind").notNull().default("status"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  lastError: text("last_error").notNull().default(""),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("telegram_notification_order_status_uidx").on(table.orderId, table.statusVersion, table.chatId, table.eventKind),
  index("telegram_notification_delivery_idx").on(table.deliveryStatus, table.nextAttemptAt, table.claimExpiresAt),
]);