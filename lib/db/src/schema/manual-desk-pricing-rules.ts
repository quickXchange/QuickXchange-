import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cryptoAssetsTable } from "./crypto-assets";

export const manualDeskPricingRulesTable = pgTable("manual_desk_pricing_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sourceAsset: text("source_asset"),
  targetAsset: text("target_asset"),
  sourceCryptoAssetId: text("source_crypto_asset_id").references(() => cryptoAssetsTable.id, { onDelete: "restrict" }),
  targetCryptoAssetId: text("target_crypto_asset_id").references(() => cryptoAssetsTable.id, { onDelete: "restrict" }),
  sourceNetwork: text("source_network"),
  targetNetwork: text("target_network"),
  paymentMethod: text("payment_method"),
  payoutMethod: text("payout_method"),
  sourceSettlementOptionId: text("source_settlement_option_id"),
  targetSettlementOptionId: text("target_settlement_option_id"),
  minAmount: numeric("min_amount", { precision: 38, scale: 18 }),
  maxAmount: numeric("max_amount", { precision: 38, scale: 18 }),
  operatorInstructions: text("operator_instructions"),
  customerInstructions: text("customer_instructions"),
  expectedSettlementMinutes: integer("expected_settlement_minutes"),
  markupBasisPoints: integer("markup_basis_points").notNull(),
  adjustmentDirection: text("adjustment_direction").notNull().default("MARKUP"),
  fixedFee: numeric("fixed_fee", { precision: 38, scale: 18 }),
  /** Optional exact base rate, expressed as target units per source unit. */
  exactRate: numeric("exact_rate", { precision: 78, scale: 36 }),
  priority: integer("priority").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertManualDeskPricingRuleSchema =
  createInsertSchema(manualDeskPricingRulesTable)
    .omit({ id: true, version: true, createdAt: true, updatedAt: true });
export type InsertManualDeskPricingRule =
  z.infer<typeof insertManualDeskPricingRuleSchema>;
export type ManualDeskPricingRule =
  typeof manualDeskPricingRulesTable.$inferSelect;