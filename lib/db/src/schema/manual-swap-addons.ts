import { boolean, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const manualSwapAddonsTable = pgTable("manual_swap_addons", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  fixedAmount: numeric("fixed_amount", { precision: 38, scale: 18 }).notNull().default("0"),
  feeCurrency: text("fee_currency").notNull(),
  feeType: text("fee_type").notNull().default("fixed"),
  percentage: numeric("percentage", { precision: 38, scale: 18 }),
  translations: jsonb("translations").$type<{
    en?: { title?: string; description?: string };
    ru?: { title?: string; description?: string };
    ar?: { title?: string; description?: string };
    uk?: { title?: string; description?: string };
  }>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  selectionRule: text("selection_rule").notNull().default("multiple"),
  presentation: jsonb("presentation").$type<{ group: string; displayOrder?: number }>().notNull().default({ group: "" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("manual_swap_addons_key_uidx").on(table.key),
  index("manual_swap_addons_public_idx").on(table.enabled, table.deletedAt),
]);

export const manualSwapFeeConfigTable = pgTable("manual_swap_fee_config", {
  id: text("id").primaryKey().default("default"),
  enabled: boolean("enabled").notNull().default(false),
  percentage: numeric("percentage", { precision: 38, scale: 18 }),
  fixedAmount: numeric("fixed_amount", { precision: 38, scale: 18 }),
  fixedCurrency: text("fixed_currency").notNull().default("USD"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ManualSwapAddon = typeof manualSwapAddonsTable.$inferSelect;
export type ManualSwapFeeConfig = typeof manualSwapFeeConfigTable.$inferSelect;