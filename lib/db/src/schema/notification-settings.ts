import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type NotificationEmailTemplate = {
  subject: string;
  heading: string;
  message: string;
  buttonText: string;
  footerText: string;
};

/** Global Manual Swap notification policy. The singleton row is owner-managed. */
export const notificationSettingsTable = pgTable("notification_settings", {
  id: text("id").primaryKey().default("global"),
  adminNotificationsEnabled: boolean("admin_notifications_enabled").notNull().default(true),
  adminEmailEnabled: boolean("admin_email_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
  paymentReceivedEnabled: boolean("payment_received_enabled").notNull().default(true),
  processingEnabled: boolean("processing_enabled").notNull().default(true),
  completedEnabled: boolean("completed_enabled").notNull().default(true),
  failedCancelledEnabled: boolean("failed_cancelled_enabled").notNull().default(true),
  adminEmailOrderCreatedEnabled: boolean("admin_email_order_created_enabled").notNull().default(false),
  adminEmailPaymentReceivedEnabled: boolean("admin_email_payment_received_enabled").notNull().default(true),
  adminEmailProcessingEnabled: boolean("admin_email_processing_enabled").notNull().default(true),
  adminEmailCompletedEnabled: boolean("admin_email_completed_enabled").notNull().default(true),
  adminEmailFailedCancelledEnabled: boolean("admin_email_failed_cancelled_enabled").notNull().default(true),
  adminTelegramOrderCreatedEnabled: boolean("admin_telegram_order_created_enabled").notNull().default(false),
  adminTelegramPaymentReceivedEnabled: boolean("admin_telegram_payment_received_enabled").notNull().default(true),
  adminTelegramProcessingEnabled: boolean("admin_telegram_processing_enabled").notNull().default(true),
  adminTelegramCompletedEnabled: boolean("admin_telegram_completed_enabled").notNull().default(true),
  adminTelegramFailedCancelledEnabled: boolean("admin_telegram_failed_cancelled_enabled").notNull().default(true),
  customerEmailOrderCreatedEnabled: boolean("customer_email_order_created_enabled").notNull().default(true),
  customerEmailPaymentReceivedEnabled: boolean("customer_email_payment_received_enabled").notNull().default(true),
  customerEmailProcessingEnabled: boolean("customer_email_processing_enabled").notNull().default(true),
  customerEmailCompletedEnabled: boolean("customer_email_completed_enabled").notNull().default(true),
  customerEmailFailedCancelledEnabled: boolean("customer_email_failed_cancelled_enabled").notNull().default(true),
  adminNotificationEmail: text("admin_notification_email").notNull().default(""),
  adminNotificationPhone: text("admin_notification_phone").notNull().default(""),
  adminTelegramChatId: text("admin_telegram_chat_id").notNull().default(""),
  adminTelegramUsername: text("admin_telegram_username").notNull().default(""),
  trustpilotReviewUrl: text("trustpilot_review_url").notNull().default(""),
  emailTemplates: jsonb("email_templates").$type<Record<string, NotificationEmailTemplate>>().notNull().default({}),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationSettings = typeof notificationSettingsTable.$inferSelect;

/** Owner-created, short-lived Telegram deep-link challenges. Raw tokens are never persisted. */
export const adminTelegramLinkChallengesTable = pgTable("admin_telegram_link_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  connectedChatId: text("connected_chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("admin_telegram_link_challenges_owner_idx").on(table.createdBy, table.expiresAt),
]);