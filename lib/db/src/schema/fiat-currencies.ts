import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fiatCurrenciesTable = pgTable("fiat_currencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  flagObjectPath: text("flag_object_path"),
  network: text("network").notNull().default("fiat"),
  precision: integer("precision").notNull().default(2),
  lifecycle: text("lifecycle").notNull().default("active"),
  regions: jsonb("regions").$type<string[]>().notNull().default([]),
  countries: jsonb("countries").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  rateMode: text("rate_mode").notNull().default("automatic"),
  manualRate: text("manual_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("fiat_currencies_code_uidx").on(table.code),
]);

export const insertFiatCurrencySchema = createInsertSchema(fiatCurrenciesTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFiatCurrency = z.infer<typeof insertFiatCurrencySchema>;
export type FiatCurrency = typeof fiatCurrenciesTable.$inferSelect;