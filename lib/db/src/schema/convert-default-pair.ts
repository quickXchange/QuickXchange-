import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const convertDefaultPairSettingsTable = pgTable("convert_default_pair_settings", {
  id: text("id").primaryKey().default("global"),
  fromAsset: text("from_asset").notNull(),
  fromNetwork: text("from_network").notNull(),
  toAsset: text("to_asset").notNull(),
  toNetwork: text("to_network").notNull(),
}, (table) => [
  check("convert_default_pair_settings_id_check", sql`${table.id} = 'global'`),
]);

export const insertConvertDefaultPairSettingsSchema =
  createInsertSchema(convertDefaultPairSettingsTable).omit({ id: true });
export type InsertConvertDefaultPairSettings =
  z.infer<typeof insertConvertDefaultPairSettingsSchema>;
export type ConvertDefaultPairSettings =
  typeof convertDefaultPairSettingsTable.$inferSelect;