import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { cryptoAssetNetworksTable } from "./crypto-assets";
import { blockchainMonitorAssetsTable, blockchainMonitorNetworksTable } from "./blockchain-monitoring";

/** Configuration registrations, never substitutes for immutable order watches. */
export const manualWalletTargetsTable = pgTable("manual_wallet_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  monitorNetworkId: text("monitor_network_id").notNull().references(() => blockchainMonitorNetworksTable.id, { onDelete: "restrict" }),
  address: text("address").notNull(),
  canonicalAddress: text("canonical_address").notNull(),
  memo: text("memo").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("manual_wallet_targets_identity_uidx").on(table.monitorNetworkId, table.canonicalAddress, table.memo)]);

export const manualWalletRegistrationsTable = pgTable("manual_wallet_registrations", {
  assetNetworkId: text("asset_network_id").primaryKey().references(() => cryptoAssetNetworksTable.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").references(() => manualWalletTargetsTable.id, { onDelete: "restrict" }),
  monitorAssetId: uuid("monitor_asset_id").references(() => blockchainMonitorAssetsTable.id, { onDelete: "set null" }),
  address: text("address").notNull(),
  memo: text("memo").notNull().default(""),
  message: text("message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertManualWalletTargetSchema = createInsertSchema(manualWalletTargetsTable);
export const insertManualWalletRegistrationSchema = createInsertSchema(manualWalletRegistrationsTable);
export type ManualWalletTarget = typeof manualWalletTargetsTable.$inferSelect;
export type ManualWalletRegistration = typeof manualWalletRegistrationsTable.$inferSelect;
