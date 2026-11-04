import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Append-only accounting metadata. No foreign-key cascade into operational
// orders, no replacement of customer pricing snapshots.
export const profitRatesTable = pgTable("order_profit_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  actorId: text("actor_id").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
});
export const profitRecordsTable = pgTable("order_profit_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderKey: text("order_key").notNull(),
  kind: text("kind").notNull(),
  basis: jsonb("basis").$type<Record<string, unknown>>(),
  execution: jsonb("execution").$type<{ amount: string; receiveAmount: string }>(),
  amount: text("amount"),
  currency: text("currency").notNull(),
  reason: text("reason").notNull(),
  requestId: text("request_id").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("order_profit_records_order_idx").on(table.orderKey, table.createdAt),
  uniqueIndex("order_profit_records_request_idx").on(table.requestId),
]);
