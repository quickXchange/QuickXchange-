import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cryptoAssetNetworksTable } from "./crypto-assets";
import { ordersTable } from "./index";

/**
 * Read-only monitoring configuration is deliberately independent from both
 * provider-integrated deposits and the asset/network catalog. A network row
 * may be configured once and then used by many exact asset routes.
 */
export const blockchainMonitorNetworksTable = pgTable(
  "blockchain_monitor_networks",
  {
    id: text("id").primaryKey(),
    networkCode: text("network_code").notNull(),
    networkName: text("network_name").notNull(),
    adapterKind: text("adapter_kind").notNull(),
    chainId: text("chain_id"),
    providerKind: text("provider_kind").notNull().default("none"),
    enabled: boolean("enabled").notNull().default(false),
    endpointSecretRef: text("endpoint_secret_ref"),
    apiKeySecretRef: text("api_key_secret_ref"),
    confirmationsRequired: integer("confirmations_required").notNull().default(0),
    finalityPolicy: text("finality_policy").notNull().default("confirmations"),
    pollIntervalSeconds: integer("poll_interval_seconds").notNull().default(15),
    // Inclusive block offset used to bound one adapter scan request.
    maxScanRange: integer("max_scan_range").notNull().default(1000),
    cursor: text("cursor"),
    lastHead: text("last_head"),
    healthStatus: text("health_status").notNull().default("not_configured"),
    healthCheckedAt: timestamp("health_checked_at", { withTimezone: true }),
    lastSuccessfulScanAt: timestamp("last_successful_scan_at", { withTimezone: true }),
    healthError: text("health_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    healthProofFingerprint: text("health_proof_fingerprint"),
    healthProofCapturedAt: timestamp("health_proof_captured_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("blockchain_monitor_networks_code_uidx").on(table.networkCode),
    check(
      "blockchain_monitor_networks_provider_kind_check",
      sql`${table.providerKind} in ('rpc','indexer','none')`,
    ),
    check(
      "blockchain_monitor_networks_health_status_check",
      sql`${table.healthStatus} in ('connected','disconnected','not_configured')`,
    ),
    check(
      "blockchain_monitor_networks_confirmations_check",
      sql`${table.confirmationsRequired} >= 0`,
    ),
    check(
      "blockchain_monitor_networks_poll_interval_check",
      sql`${table.pollIntervalSeconds} between 5 and 86400`,
    ),
    check(
      "blockchain_monitor_networks_max_scan_range_check",
      sql`${table.maxScanRange} between 0 and 10000`,
    ),
  ],
);

/**
 * Exact identity is required for token deposits: symbol and network names are
 * never sufficient to identify an ERC-20/TRC-20/SPL asset.
 */
export const blockchainMonitorAssetsTable = pgTable(
  "blockchain_monitor_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorNetworkId: text("monitor_network_id")
      .notNull()
      .references(() => blockchainMonitorNetworksTable.id, { onDelete: "cascade" }),
    assetNetworkId: text("asset_network_id")
      .notNull()
      .references(() => cryptoAssetNetworksTable.id, { onDelete: "restrict" }),
    identityKind: text("identity_kind").notNull().default("native"),
    contractOrMint: text("contract_or_mint"),
    decimals: integer("decimals").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    readinessProofFingerprint: text("readiness_proof_fingerprint"),
    readinessProofCapturedAt: timestamp("readiness_proof_captured_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("blockchain_monitor_assets_route_uidx").on(
      table.monitorNetworkId,
      table.assetNetworkId,
    ),
    uniqueIndex("blockchain_monitor_assets_identity_uidx").on(
      table.monitorNetworkId,
      table.identityKind,
      table.contractOrMint,
    ),
    check(
      "blockchain_monitor_assets_identity_kind_check",
      sql`${table.identityKind} in ('native','token')`,
    ),
    check("blockchain_monitor_assets_decimals_check", sql`${table.decimals} between 0 and 36`),
    check(
      "blockchain_monitor_assets_token_identity_check",
      sql`${table.identityKind} = 'native' or nullif(btrim(${table.contractOrMint}), '') is not null`,
    ),
  ],
);

/** Immutable order-time snapshot of the address and payment identity watched. */
export const blockchainMonitorWatchesTable = pgTable(
  "blockchain_monitor_watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),
    monitorNetworkId: text("monitor_network_id")
      .notNull()
      .references(() => blockchainMonitorNetworksTable.id, { onDelete: "restrict" }),
    monitorAssetId: uuid("monitor_asset_id")
      .notNull()
      .references(() => blockchainMonitorAssetsTable.id, { onDelete: "restrict" }),
    assetNetworkId: text("asset_network_id")
      .notNull()
      .references(() => cryptoAssetNetworksTable.id, { onDelete: "restrict" }),
    expectedAmount: numeric("expected_amount").notNull(),
    receivingAddress: text("receiving_address").notNull(),
    memoOrTag: text("memo_or_tag"),
    identityKind: text("identity_kind").notNull(),
    contractOrMint: text("contract_or_mint"),
    decimals: integer("decimals").notNull(),
    orderCreatedAt: timestamp("order_created_at", { withTimezone: true }).notNull(),
    startCursor: text("start_cursor"),
    currentCursor: text("current_cursor"),
    registrationState: text("registration_state").notNull().default("active"),
    registrationReason: text("registration_reason"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("blockchain_monitor_watches_order_uidx").on(table.orderId),
    index("blockchain_monitor_watches_address_idx").on(
      table.monitorNetworkId,
      table.receivingAddress,
      table.active,
    ),
    check("blockchain_monitor_watches_amount_check", sql`${table.expectedAmount} > 0`),
    check("blockchain_monitor_watches_registration_state_check", sql`${table.registrationState} in ('active','pending_review')`),
    check("blockchain_monitor_watches_decimals_check", sql`${table.decimals} between 0 and 36`),
  ],
);

export const blockchainMonitorRegistrationGapsTable = pgTable(
  "blockchain_monitor_registration_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
    networkCode: text("network_code").notNull(),
    assetCode: text("asset_code").notNull(),
    receivingAddress: text("receiving_address").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
  },
  (table) => [uniqueIndex("blockchain_monitor_registration_gaps_order_uidx").on(table.orderId)],
);

/** Immutable chain evidence. A replay of the same event is a no-op. */
export const blockchainMonitorObservationsTable = pgTable(
  "blockchain_monitor_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorNetworkId: text("monitor_network_id")
      .notNull()
      .references(() => blockchainMonitorNetworksTable.id, { onDelete: "restrict" }),
    monitorAssetId: uuid("monitor_asset_id")
      .notNull()
      .references(() => blockchainMonitorAssetsTable.id, { onDelete: "restrict" }),
    transactionHash: text("transaction_hash").notNull(),
    eventIndex: text("event_index").notNull().default("0"),
    fromAddress: text("from_address"),
    toAddress: text("to_address").notNull(),
    amount: numeric("amount").notNull(),
    blockReference: text("block_reference"),
    blockHash: text("block_hash"),
    confirmations: integer("confirmations").notNull().default(0),
    finalized: boolean("finalized").notNull().default(false),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    blockTimestamp: timestamp("block_timestamp", { withTimezone: true }),
    rawPayload: jsonb("raw_payload").notNull().default({}),
    payloadDigest: text("payload_digest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("blockchain_monitor_observations_identity_uidx").on(
      table.monitorNetworkId,
      table.transactionHash,
      table.eventIndex,
      table.monitorAssetId,
    ),
    index("blockchain_monitor_observations_address_idx").on(
      table.monitorNetworkId,
      table.toAddress,
      table.observedAt,
    ),
    check("blockchain_monitor_observations_amount_check", sql`${table.amount} > 0`),
    check("blockchain_monitor_observations_confirmations_check", sql`${table.confirmations} >= 0`),
  ],
);

export const blockchainMonitorMatchesTable = pgTable(
  "blockchain_monitor_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    watchId: uuid("watch_id")
      .notNull()
      .references(() => blockchainMonitorWatchesTable.id, { onDelete: "restrict" }),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => blockchainMonitorObservationsTable.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("confirming"),
    matchBasis: jsonb("match_basis").notNull().default({}),
    ambiguityReason: text("ambiguity_reason"),
    confirmations: integer("confirmations").notNull().default(0),
    confirmationsRequired: integer("confirmations_required").notNull().default(0),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("blockchain_monitor_matches_observation_watch_uidx").on(table.observationId, table.watchId),
    index("blockchain_monitor_matches_state_created_idx").on(table.state, table.createdAt),
    check(
      "blockchain_monitor_matches_state_check",
      sql`${table.state} in ('confirming','matched','needs_review','applied','rejected')`,
    ),
    check("blockchain_monitor_matches_confirmations_check", sql`${table.confirmations} >= 0`),
    check(
      "blockchain_monitor_matches_confirmations_required_check",
      sql`${table.confirmationsRequired} >= 0`,
    ),
  ],
);

export const insertBlockchainMonitorNetworkSchema = createInsertSchema(blockchainMonitorNetworksTable);
export const insertBlockchainMonitorAssetSchema = createInsertSchema(blockchainMonitorAssetsTable);
export const insertBlockchainMonitorWatchSchema = createInsertSchema(blockchainMonitorWatchesTable);
export const insertBlockchainMonitorObservationSchema = createInsertSchema(blockchainMonitorObservationsTable);
export const insertBlockchainMonitorMatchSchema = createInsertSchema(blockchainMonitorMatchesTable);

export type BlockchainMonitorNetwork = typeof blockchainMonitorNetworksTable.$inferSelect;
export type BlockchainMonitorAsset = typeof blockchainMonitorAssetsTable.$inferSelect;
export type BlockchainMonitorWatch = typeof blockchainMonitorWatchesTable.$inferSelect;
export type BlockchainMonitorObservation = typeof blockchainMonitorObservationsTable.$inferSelect;
export type BlockchainMonitorMatch = typeof blockchainMonitorMatchesTable.$inferSelect;