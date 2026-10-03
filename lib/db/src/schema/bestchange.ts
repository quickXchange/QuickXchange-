import { boolean, integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

// Publication configuration only. Never stores balances, orders or credentials.
export const bestchangeSettingsTable = pgTable("bestchange_settings", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  version: integer("version").notNull().default(1),
  directions: jsonb("directions").$type<Record<string, unknown>[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});