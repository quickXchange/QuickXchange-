import { boolean, integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

// Publication configuration only. Never stores balances, orders or credentials.
export const bestchangeSettingsTable = pgTable("bestchange_settings", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  // Method-level XML metadata; never used by quotes, deposits or orders.
  xmlMethodSettings: jsonb("xml_method_settings").$type<Array<{
    optionId: string; code: string | null; reserve?: string;
  }>>().notNull().default([]),
  // Retain the legacy production feed until an Owner reviews the replacement.
  ratesXmlPublished: boolean("rates_xml_published").notNull().default(false),
  // Generic XML publication settings; never consumed by executable pricing.
  xmlPercentageAdjustment: jsonb("xml_percentage_adjustment").$type<{
    enabled: boolean; activeOrderPercent: string; noActiveOrderPercent: string;
  }>().notNull().default({ enabled: false, activeOrderPercent: "0", noActiveOrderPercent: "0" }),
  version: integer("version").notNull().default(1),
  directions: jsonb("directions").$type<Record<string, unknown>[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});