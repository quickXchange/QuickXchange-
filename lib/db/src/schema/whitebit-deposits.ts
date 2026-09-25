import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
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
import { customersTable, ordersTable } from "./index";

export const whitebitDepositAddressesTable = pgTable(
  "whitebit_deposit_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: text("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    providerTicker: text("provider_ticker").notNull(),
    network: text("network").notNull().default(""),
    address: text("address"),
    memo: text("memo"),
    status: text("status").notNull().default("pending"),
    claimToken: uuid("claim_token").defaultRandom(),
    providerError: text("provider_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("whitebit_address_customer_asset_uidx").on(table.customerId, table.ticker, table.network),
    index("whitebit_address_lookup_idx").on(table.address, table.memo),
  ],
);

/**
 * Swap orders use one provider address per order. This is intentionally
 * separate from whitebit_deposit_addresses, whose customer+ticker+network
 * uniqueness is correct for the account-deposit product but not for an
 * anonymous manual Swap.
 */
export const whitebitOrderAddressesTable = pgTable(
  "whitebit_order_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id").notNull().references(() => ordersTable.id, { onDelete: "restrict" }),
    ticker: text("ticker").notNull(),
    providerTicker: text("provider_ticker").notNull(),
    network: text("network").notNull(),
    address: text("address"),
    memo: text("memo"),
    status: text("status").notNull().default("claiming"),
    claimToken: uuid("claim_token").defaultRandom(),
    providerError: text("provider_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("whitebit_order_address_order_uidx").on(table.orderId),
    index("whitebit_order_address_lookup_idx").on(table.address, table.memo, table.ticker, table.network),
  ],
);

export const whitebitApiNonceTable = pgTable("whitebit_api_nonce", {
  id: integer("id").primaryKey(),
  lastNonce: numeric("last_nonce").notNull(),
});

export const whitebitProviderSettingsTable = pgTable("whitebit_provider_settings", {
  provider: text("provider").primaryKey().default("whitebit"),
  disabled: boolean("disabled").notNull().default(true),
  version: integer("version").notNull().default(1),
  credentialVerifiedFingerprint: text("credential_verified_fingerprint"),
  credentialVerifiedAt: timestamp("credential_verified_at", { withTimezone: true }),
  depositRouteProofs: jsonb("deposit_route_proofs").$type<Array<{
    networkId: string;
    assetCode: string;
    networkCode: string;
    configurationDigest: string;
    credentialFingerprint: string;
    verifiedAt: string;
  }>>().notNull().default([]),
  updatedByOperatorId: text("updated_by_operator_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const whitebitHistoryCheckpointsTable = pgTable("whitebit_history_checkpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  addressId: uuid("address_id").notNull().references(() => whitebitDepositAddressesTable.id, { onDelete: "cascade" }),
  highWaterIdentity: text("high_water_identity"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("whitebit_history_checkpoint_address_uidx").on(table.addressId)]);

export const whitebitOrderHistoryCheckpointsTable = pgTable("whitebit_order_history_checkpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderAddressId: uuid("order_address_id").notNull().references(() => whitebitOrderAddressesTable.id, { onDelete: "cascade" }),
  highWaterIdentity: text("high_water_identity"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("whitebit_order_history_checkpoint_address_uidx").on(table.orderAddressId)]);

/** One fenced, observable lease for the order-only history poller. Never used by account deposits. */
export const whitebitHistoryWorkerStateTable = pgTable("whitebit_history_worker_state", {
  id: integer("id").primaryKey(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  leaseToken: uuid("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  cursorOrderId: text("cursor_order_id"),
  credentialSource: text("credential_source"),
  lastPollAt: timestamp("last_poll_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastErrorCode: text("last_error_code"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  failureCount: integer("failure_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const whitebitWebhookDeliveriesTable = pgTable(
  "whitebit_webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    envelopeId: text("envelope_id").notNull(),
    nonce: numeric("nonce").notNull(),
    method: text("method").notNull(),
    payload: jsonb("payload").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("whitebit_webhook_envelope_uidx").on(table.envelopeId),
    uniqueIndex("whitebit_webhook_nonce_uidx").on(table.nonce),
  ],
);

export const whitebitDepositsTable = pgTable(
  "whitebit_deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: text("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
    addressId: uuid("address_id").references(() => whitebitDepositAddressesTable.id, { onDelete: "set null" }),
    orderAddressId: uuid("order_address_id").references(() => whitebitOrderAddressesTable.id, { onDelete: "set null" }),
    orderId: text("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
    ticker: text("ticker").notNull(),
    providerTicker: text("provider_ticker").notNull(),
    network: text("network"),
    address: text("address").notNull(),
    memo: text("memo"),
    amount: numeric("amount").notNull(),
    fee: numeric("fee").notNull().default("0"),
    status: text("status").notNull().default("unknown"),
    providerStatus: integer("provider_status"),
    transactionHash: text("transaction_hash"),
    uniqueId: text("unique_id"),
    transactionId: text("transaction_id"),
    envelopeId: text("envelope_id"),
    payloadDigest: text("payload_digest"),
    providerIdentity: text("provider_identity").notNull(),
    supersededBy: uuid("superseded_by"),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
    confirmationsActual: integer("confirmations_actual"),
    confirmationsRequired: integer("confirmations_required"),
    rawPayload: jsonb("raw_payload"),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    conflict: text("conflict"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("whitebit_deposit_identity_uidx").on(table.providerIdentity),
    index("whitebit_deposit_customer_created_idx").on(table.customerId, table.createdAt),
    index("whitebit_deposit_address_idx").on(table.address),
  ],
);

export const whitebitLedgerEntriesTable = pgTable(
  "whitebit_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: text("customer_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
    ticker: text("ticker").notNull(),
    amount: numeric("amount").notNull(),
    sourceKey: text("source_key").notNull(),
    depositId: uuid("deposit_id").references(() => whitebitDepositsTable.id, { onDelete: "restrict" }),
    description: text("description").notNull().default("WhiteBIT deposit"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("whitebit_ledger_source_uidx").on(table.sourceKey),
    index("whitebit_ledger_customer_ticker_idx").on(table.customerId, table.ticker),
  ],
);

export const insertWhitebitDepositAddressSchema = createInsertSchema(whitebitDepositAddressesTable);
export const insertWhitebitDepositSchema = createInsertSchema(whitebitDepositsTable);
export const insertWhitebitLedgerEntrySchema = createInsertSchema(whitebitLedgerEntriesTable);
export type WhitebitDepositAddress = typeof whitebitDepositAddressesTable.$inferSelect;
export type WhitebitOrderAddress = typeof whitebitOrderAddressesTable.$inferSelect;
export type WhitebitDeposit = typeof whitebitDepositsTable.$inferSelect;
export type WhitebitLedgerEntry = typeof whitebitLedgerEntriesTable.$inferSelect;