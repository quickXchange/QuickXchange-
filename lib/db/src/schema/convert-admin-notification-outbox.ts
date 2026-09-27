import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { quickexOrdersTable } from "./quickex-orders";

/** Independent durable Admin-channel delivery state for Quickex Convert lifecycle events. */
export const convertAdminNotificationOutboxTable = pgTable("convert_admin_notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  quickexOrderId: text("quickex_order_id").notNull()
    .references(() => quickexOrdersTable.legacyOrderId, { onDelete: "cascade" }),
  eventKind: text("event_kind").notNull(),
  channel: text("channel").notNull(),
  recipient: text("recipient").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  statusVersion: integer("status_version").notNull().default(0),
  evidenceKey: text("evidence_key").notNull().default(""),
  payload: jsonb("payload").notNull().default({}),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  providerIdempotencyStartedAt: timestamp("provider_idempotency_started_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("convert_admin_notification_identity_uidx").on(
    table.quickexOrderId, table.eventKind, table.statusVersion, table.channel, table.recipient, table.evidenceKey,
  ),
  index("convert_admin_notification_delivery_idx").on(
    table.deliveryStatus, table.nextAttemptAt, table.claimExpiresAt, table.createdAt,
  ),
]);

export type ConvertAdminNotificationOutbox = typeof convertAdminNotificationOutboxTable.$inferSelect;