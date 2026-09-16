import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const orderAuditLogsTable = pgTable(
  "exchange_order_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id").notNull(),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    requestId: text("request_id"),
    previousVersion: integer("previous_version").notNull(),
    nextVersion: integer("next_version").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("exchange_order_audit_order_created_idx").on(
      table.orderId,
      table.createdAt,
    ),
  ],
);

export const providerSyncStatesTable = pgTable("exchange_provider_sync_states", {
  provider: text("provider").primaryKey(),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastSucceededAt: timestamp("last_succeeded_at", { withTimezone: true }),
  lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code").notNull().default(""),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  cursorCreatedAt: timestamp("cursor_created_at", { withTimezone: true }),
  cursorOrderId: text("cursor_order_id"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const orderSupportMetadataTable = pgTable("order_support_metadata", {
  orderId: text("order_id").primaryKey(),
  providerKind: text("provider_kind").notNull(),
  supportStatus: text("support_status").notNull().default("open"),
  sendingStatus: text("sending_status").notNull().default("pending"),
  receivingStatus: text("receiving_status").notNull().default("pending"),
  sentAmountOverride: text("sent_amount_override"),
  receiveAmountOverride: text("receive_amount_override"),
  exchangeRateOverride: text("exchange_rate_override"),
  networkFeeAmount: text("network_fee_amount"),
  transactionHash: text("transaction_hash"),
  paymentReference: text("payment_reference"),
  assignedOperatorId: uuid("assigned_operator_id"),
  note: text("note").notNull().default(""),
  recordVersion: integer("record_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderAuditLogSchema = createInsertSchema(orderAuditLogsTable);
export const insertProviderSyncStateSchema = createInsertSchema(providerSyncStatesTable);
export type OrderAuditLog = typeof orderAuditLogsTable.$inferSelect;
export type ProviderSyncState = typeof providerSyncStatesTable.$inferSelect;