import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const swapDefaultPairSettingsTable = pgTable("swap_default_pair_settings", {
  id: text("id").primaryKey().default("global"),
  sourceSettlementOptionId: text("source_settlement_option_id").notNull(),
  targetSettlementOptionId: text("target_settlement_option_id").notNull(),
}, (table) => [
  check("swap_default_pair_settings_id_check", sql`${table.id} = 'global'`),
]);

export const insertSwapDefaultPairSettingsSchema =
  createInsertSchema(swapDefaultPairSettingsTable).omit({ id: true });
export type InsertSwapDefaultPairSettings =
  z.infer<typeof insertSwapDefaultPairSettingsSchema>;
export type SwapDefaultPairSettings =
  typeof swapDefaultPairSettingsTable.$inferSelect;