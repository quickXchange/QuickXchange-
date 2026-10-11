import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

/** Publication metadata only; not read by quotes, orders, or settlement. */
export const ratesXmlSettingsTable = pgTable("rates_xml_settings", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull().default(0),
  methods: jsonb("methods").$type<Array<{
    optionId: string; code: string | null; reserve?: string;
  }>>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
