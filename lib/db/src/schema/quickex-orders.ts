import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Provider-owned aggregate. `legacyOrderId` is a public tracking id, not a
 * relationship to exchange_orders: any history projection is deliberately
 * one-way and optional.
 */
export const quickexOrdersTable = pgTable("quickex_orders", {
  legacyOrderId: text("legacy_order_id")
    .primaryKey(),
  providerOrderId: text("provider_order_id").notNull().default(""),
  providerReference: text("provider_reference").notNull().default(""),
  clientRequestId: text("client_request_id"),
  quoteId: text("quote_id").notNull().default(""),
  customerEmail: text("customer_email").notNull().default(""),
  customerName: text("customer_name").notNull().default("Guest"),
  customerClerkUserId: text("customer_clerk_user_id"),
  status: text("status").notNull(),
  providerState: text("provider_state").notNull().default(""),
  route: jsonb("route").notNull(),
  amounts: jsonb("amounts").notNull(),
  addresses: jsonb("addresses").notNull(),
  outcomeUnknown: boolean("outcome_unknown").notNull().default(false),
  recordVersion: integer("record_version").notNull().default(0),
  providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
  providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("quickex_orders_status_created_at_idx").on(table.status, table.createdAt),
  index("quickex_orders_provider_order_id_idx").on(table.providerOrderId),
  index("quickex_orders_customer_clerk_user_id_created_at_idx").on(table.customerClerkUserId, table.createdAt),
  uniqueIndex("quickex_orders_client_request_id_idx").on(table.clientRequestId),
]);

export type QuickexOrder = typeof quickexOrdersTable.$inferSelect;