import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Publication metadata only; not read by quotes, orders, or settlement. */
export const ratesXmlSettingsTable = pgTable("rates_xml_settings", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull().default(0),
  methods: jsonb("methods").$type<Array<{
    optionId: string; code: string | null; reserve?: string;
  }>>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Last successful public XML items only. Never contains order data or quote tickets. */
export const ratesXmlPublishedQuotesTable = pgTable("rates_xml_published_quotes", {
  key: text("key").primaryKey(),
  configurationHash: text("configuration_hash").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
}, table => [index("rates_xml_published_quotes_configuration_idx").on(table.configurationHash)]);
