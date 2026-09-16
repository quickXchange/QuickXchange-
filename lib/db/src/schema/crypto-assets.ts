import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Operator-managed crypto assets. IDs are stable slugs rather than provider IDs,
 * so an asset can be referenced consistently by manual desk configuration.
 */
export const cryptoAssetsTable = pgTable(
  "crypto_assets",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    logoObjectPath: text("logo_object_path"),
    decimals: integer("decimals").notNull(),
    lifecycle: text("lifecycle").notNull().default("active"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("crypto_assets_code_uidx").on(table.code),
  ],
);

/**
 * A manually operated asset/network route. Each route has one deliberately
 * shared deposit address; customer deposits remain disabled until an operator
 * has configured and enabled that address.
 */
export const cryptoAssetNetworksTable = pgTable(
  "crypto_asset_networks",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => cryptoAssetsTable.id, { onDelete: "cascade" }),
    networkCode: text("network_code").notNull(),
    networkName: text("network_name").notNull(),
    logoObjectPath: text("logo_object_path"),
    networkFamily: text("network_family").notNull().default("native"),
    decimals: integer("decimals").notNull(),
    executionMode: text("execution_mode").notNull().default("manual"),
    lifecycle: text("lifecycle").notNull().default("active"),
    regions: jsonb("regions").$type<string[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    customerDepositsEnabled: boolean("customer_deposits_enabled").notNull().default(false),
    requiresMemo: boolean("requires_memo").notNull().default(false),
    requiredConfirmations: integer("required_confirmations").notNull().default(0),
    confirmationGuidance: text("confirmation_guidance"),
    explorerUrlTemplate: text("explorer_url_template"),
    depositInstructions: text("deposit_instructions"),
    depositWarning: text("deposit_warning"),
    sharedDepositAddress: text("shared_deposit_address").notNull().default(""),
    sharedDepositMemo: text("shared_deposit_memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("crypto_asset_networks_asset_network_code_uidx").on(
      table.assetId,
      table.networkCode,
    ),
  ],
);

export const insertCryptoAssetSchema = createInsertSchema(cryptoAssetsTable)
  .omit({ createdAt: true, updatedAt: true });
export const insertCryptoAssetNetworkSchema = createInsertSchema(cryptoAssetNetworksTable)
  .omit({ createdAt: true, updatedAt: true });
export type InsertCryptoAsset = z.infer<typeof insertCryptoAssetSchema>;
export type CryptoAsset = typeof cryptoAssetsTable.$inferSelect;
export type InsertCryptoAssetNetwork = z.infer<typeof insertCryptoAssetNetworkSchema>;
export type CryptoAssetNetwork = typeof cryptoAssetNetworksTable.$inferSelect;