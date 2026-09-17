// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

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
import { createInsertSchema } from "drizzle-zod";
export * from "./operators";
export * from "./provider-integrations";
export * from "./exchange-operations";
export * from "./crypto-assets";
export * from "./fiat-currencies";
export * from "./manual-desk-pricing-rules";
export * from "./payment-methods";
export * from "./quickex-orders";
export * from "./affiliate";
export * from "./landing-backgrounds";
export * from "./site-content";
export * from "./website-branding";
export * from "./blog";
export * from "./newsletter";
export * from "./whitebit-deposits";

export const ordersTable = pgTable("exchange_orders", {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    statusVersion: integer("status_version").notNull().default(0),
    recordVersion: integer("record_version").notNull().default(0),
    assignedOperatorId: uuid("assigned_operator_id"),
    supportStatus: text("support_status").notNull().default("open"),
    sendingStatus: text("sending_status").notNull().default("pending"),
    receivingStatus: text("receiving_status").notNull().default("pending"),
    sentAmountOverride: numeric("sent_amount_override"),
    receiveAmountOverride: numeric("receive_amount_override"),
    exchangeRateOverride: numeric("exchange_rate_override"),
    networkFeeAmount: numeric("network_fee_amount"),
    transactionHash: text("transaction_hash"),
    paymentReference: text("payment_reference"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by"),
    fromAsset: text("from_asset").notNull(),
    fromNetwork: text("from_network").notNull().default(""),
    toAsset: text("to_asset").notNull(),
    toNetwork: text("to_network").notNull().default(""),
    amount: numeric("amount").notNull(),
    receiveAmount: numeric("receive_amount").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull().default("Guest"),
    destinationAddress: text("destination_address").notNull().default(""),
    destinationMemo: text("destination_memo").notNull().default(""),
    refundAddress: text("refund_address").notNull().default(""),
    refundMemo: text("refund_memo").notNull().default(""),
    depositAddress: text("deposit_address").notNull().default(""),
    depositMemo: text("deposit_memo").notNull().default(""),
    paymentMethod: text("payment_method").notNull().default(""),
    payoutMethod: text("payout_method").notNull().default(""),
    pricingRuleId: uuid("pricing_rule_id"),
    pricingRuleVersion: integer("pricing_rule_version"),
    pricingRuleName: text("pricing_rule_name").notNull().default(""),
    grossMarketAmount: numeric("gross_market_amount"),
    percentageCommission: numeric("percentage_commission"),
    fixedCommission: numeric("fixed_commission"),
    totalCommission: numeric("total_commission"),
    finalRate: numeric("final_rate"),
    pricingSnapshot: jsonb("pricing_snapshot"),
    sourceSettlementOptionId: text("source_settlement_option_id"),
    targetSettlementOptionId: text("target_settlement_option_id"),
    settlementSnapshot: jsonb("settlement_snapshot"),
    settlementDetails: jsonb("settlement_details"),
    manualSettlementState: text("manual_settlement_state").notNull().default("not_required"),
    manualSettlementStateUpdatedAt: timestamp("manual_settlement_state_updated_at", {
      withTimezone: true,
    }),
    manualSettlementStartedAt: timestamp("manual_settlement_started_at", { withTimezone: true }),
    manualSettlementFundedAt: timestamp("manual_settlement_funded_at", { withTimezone: true }),
    manualSettlementPaidAt: timestamp("manual_settlement_paid_at", { withTimezone: true }),
    manualSettlementCancelledAt: timestamp("manual_settlement_cancelled_at", {
      withTimezone: true,
    }),
    customerSafeNote: text("customer_safe_note").notNull().default(""),
    incomingTransactionReference: text("incoming_transaction_reference").notNull().default(""),
    outgoingTransactionReference: text("outgoing_transaction_reference").notNull().default(""),
    fundingDetailsSnapshot: jsonb("funding_details_snapshot"),
    fundingStatus: text("funding_status").notNull().default("ready_manual"),
    fundingProviderSource: text("funding_provider_source").notNull().default("manual"),
    fundingProviderError: text("funding_provider_error"),
    customerDetailsSnapshot: jsonb("customer_details_snapshot"),
    provider: text("provider").notNull(),
    note: text("note").notNull().default(""),
    providerReference: text("provider_reference").notNull().default(""),
    providerOrderId: text("provider_order_id").notNull().default(""),
    providerState: text("provider_state").notNull().default(""),
    rateMode: text("rate_mode").notNull().default(""),
    quoteId: text("quote_id").notNull().default(""),
    clientRequestId: text("client_request_id").unique(),
    customerClerkUserId: text("customer_clerk_user_id"),
    customerOwnershipSource: text("customer_ownership_source").notNull().default(""),
    customerClaimedAt: timestamp("customer_claimed_at", { withTimezone: true }),
    statusNotificationsEnabled: boolean("status_notifications_enabled").notNull().default(false),
    errorCode: text("error_code").notNull().default(""),
    errorMessage: text("error_message").notNull().default(""),
    outcomeUnknown: boolean("outcome_unknown").notNull().default(false),
    providerClaimedDepositAmount: numeric("provider_claimed_deposit_amount"),
    providerExpectedReceiveAmount: numeric("provider_expected_receive_amount"),
    providerPaidAmount: numeric("provider_paid_amount"),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
    providerCompleted: boolean("provider_completed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
}, (table) => [
    // These are operational indexes. On a populated database they must be built
    // online before the schema metadata is published, never by a transactional migration.
    index("exchange_orders_created_at_id_idx").on(table.createdAt, table.id),
    index("exchange_orders_status_created_at_id_idx").on(table.status, table.createdAt, table.id),
    index("exchange_orders_customer_created_at_id_idx").on(
      table.customerClerkUserId,
      table.createdAt,
      table.id,
    ),
]);

export const customerStatusNotificationEventsTable = pgTable(
  "customer_status_notification_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    customerClerkUserId: text("customer_clerk_user_id").notNull(),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    statusVersion: integer("status_version").notNull(),
    deliveryStatus: text("delivery_status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    claimToken: text("claim_token"),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    providerIdempotencyStartedAt: timestamp("provider_idempotency_started_at", {
      withTimezone: true,
    }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_status_notification_version_uidx").on(
      table.orderId,
      table.statusVersion,
    ),
    index("customer_status_notification_delivery_idx").on(
      table.deliveryStatus,
      table.nextAttemptAt,
      table.claimExpiresAt,
      table.createdAt,
    ),
  ],
);

export const customersTable = pgTable("exchange_customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  ordersCount: integer("orders_count").notNull().default(0),
  volume: numeric("volume").notNull().default("0"),
  lastActivity: timestamp("last_activity", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("active"),
});

export const customerProfilesTable = pgTable("customer_profiles", {
  customerId: text("customer_id").primaryKey().references(() => customersTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").unique(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  country: text("country").notNull().default(""),
  role: text("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("customer_profiles_clerk_user_idx").on(table.clerkUserId)]);

export const customerManagementAuditLogsTable = pgTable("customer_management_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorOperatorId: text("actor_operator_id").notNull(),
  targetCustomerId: text("target_customer_id").notNull().references(() => customersTable.id),
  action: text("action").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("customer_management_audit_target_idx").on(table.targetCustomerId, table.createdAt)]);

export const insertOrderSchema = createInsertSchema(ordersTable);
export const insertCustomerSchema = createInsertSchema(customersTable);
export type Order = typeof ordersTable.$inferSelect;
export type Customer = typeof customersTable.$inferSelect;