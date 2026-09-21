import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Global Manual Swap notification policy. The singleton row is owner-managed. */
export const notificationSettingsTable = pgTable("notification_settings", {
  id: text("id").primaryKey().default("global"),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
  paymentReceivedEnabled: boolean("payment_received_enabled").notNull().default(true),
  processingEnabled: boolean("processing_enabled").notNull().default(true),
  completedEnabled: boolean("completed_enabled").notNull().default(true),
  failedCancelledEnabled: boolean("failed_cancelled_enabled").notNull().default(true),
  adminNotificationEmail: text("admin_notification_email").notNull().default(""),
  adminTelegramChatId: text("admin_telegram_chat_id").notNull().default(""),
  trustpilotReviewUrl: text("trustpilot_review_url").notNull().default(""),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationSettings = typeof notificationSettingsTable.$inferSelect;