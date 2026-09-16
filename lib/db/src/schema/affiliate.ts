import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Financial records use canonical decimal strings. Ledger rows are append-only. */
export const affiliateSettingsTable = pgTable("affiliate_program_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  quickexEnabled: boolean("quickex_enabled").notNull().default(true),
  manualEnabled: boolean("manual_enabled").notNull().default(true),
  commissionRate: numeric("commission_rate", { precision: 36, scale: 18 }).notNull().default("0.003"),
  minimumEligibleUsd: numeric("minimum_eligible_usd", { precision: 36, scale: 18 }).notNull().default("0"),
  payoutMinimumUsd: numeric("payout_minimum_usd", { precision: 36, scale: 18 }).notNull().default("0"),
  transactionCapUsd: numeric("transaction_cap_usd", { precision: 36, scale: 18 }),
  cookieDurationDays: integer("cookie_duration_days").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
});

export const affiliateAccountsTable = pgTable("affiliate_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerClerkUserId: text("customer_clerk_user_id").notNull(),
  code: text("code").notNull(),
  referrerAccountId: uuid("referrer_account_id"),
  referrerBoundAt: timestamp("referrer_bound_at", { withTimezone: true }),
  customReferralRate: numeric("custom_referral_rate", { precision: 36, scale: 18 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("affiliate_accounts_customer_uidx").on(t.customerClerkUserId),
  uniqueIndex("affiliate_accounts_code_uidx").on(t.code),
  uniqueIndex("affiliate_accounts_public_code_uidx").on(sql`right(upper(${t.code}), 8)`),
  index("affiliate_accounts_referrer_idx").on(t.referrerAccountId),
]);

export const affiliateCompletionEventsTable = pgTable("affiliate_completion_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  completionVersion: integer("completion_version").notNull(),
  eventType: text("event_type").notNull().default("completed"),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("affiliate_completion_event_uidx").on(t.aggregateType, t.aggregateId, t.completionVersion, t.eventType)]);

export const affiliateCommissionsTable = pgTable("affiliate_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateAccountId: uuid("affiliate_account_id").notNull().references(() => affiliateAccountsTable.id),
  referredCustomerAccountId: uuid("referred_customer_account_id").references(() => affiliateAccountsTable.id),
  completionEventId: uuid("completion_event_id").notNull().references(() => affiliateCompletionEventsTable.id),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  kind: text("kind").notNull().default("commission"),
  amountUsd: numeric("amount_usd", { precision: 36, scale: 18 }).notNull(),
  volumeUsd: numeric("volume_usd", { precision: 36, scale: 18 }).notNull(),
  rate: numeric("rate", { precision: 36, scale: 18 }).notNull(),
  settingsVersion: integer("settings_version").notNull(),
  valuation: jsonb("valuation").notNull(),
  reversalOfId: uuid("reversal_of_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("affiliate_commission_event_uidx").on(t.completionEventId),
  uniqueIndex("affiliate_commission_reversal_uidx").on(t.reversalOfId),
  index("affiliate_commissions_account_created_idx").on(t.affiliateAccountId, t.createdAt),
]);

export const affiliateValuationReviewsTable = pgTable("affiliate_valuation_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  completionEventId: uuid("completion_event_id").notNull().references(() => affiliateCompletionEventsTable.id),
  state: text("state").notNull().default("pending"),
  reason: text("reason").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("affiliate_valuation_review_event_uidx").on(t.completionEventId)]);

export const affiliatePayoutRequestsTable = pgTable("affiliate_payout_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateAccountId: uuid("affiliate_account_id").notNull().references(() => affiliateAccountsTable.id),
  amountUsd: numeric("amount_usd", { precision: 36, scale: 18 }).notNull(),
  status: text("status").notNull().default("requested"),
  destination: jsonb("destination").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  txid: text("txid"),
  note: text("note").notNull().default(""),
}, (t) => [index("affiliate_payout_requests_status_idx").on(t.status, t.requestedAt)]);

export const affiliateAuditLogsTable = pgTable("affiliate_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  targetId: text("target_id"),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});