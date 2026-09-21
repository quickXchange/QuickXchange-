import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { quickexOrdersTable } from "./quickex-orders";

/**
 * Convert's customer email queue is intentionally a separate aggregate.  In
 * particular, this must never be made to reference exchange_orders: provider
 * Convert records have no Swap lifecycle or payment evidence.
 */
export const convertNotificationOutboxTable = pgTable("convert_notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  quickexOrderId: text("quickex_order_id").notNull()
    .references(() => quickexOrdersTable.legacyOrderId, { onDelete: "cascade" }),
  customerClerkUserId: text("customer_clerk_user_id").notNull(),
  recipientEmail: text("recipient_email").notNull().default(""),
  eventKind: text("event_kind").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  statusVersion: integer("status_version").notNull(),
  evidenceKey: text("evidence_key").notNull().default(""),
  payload: jsonb("payload").notNull().default({}),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  providerIdempotencyStartedAt: timestamp("provider_idempotency_started_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("convert_notification_outbox_identity_uidx").on(
    table.quickexOrderId, table.eventKind, table.statusVersion, table.evidenceKey,
  ),
  index("convert_notification_outbox_delivery_idx").on(
    table.deliveryStatus, table.nextAttemptAt, table.claimExpiresAt, table.createdAt,
  ),
]);

export type ConvertNotificationOutbox = typeof convertNotificationOutboxTable.$inferSelect;