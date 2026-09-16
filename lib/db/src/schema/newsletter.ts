import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const newsletterSubscribersTable = pgTable("newsletter_subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  status: text("status").notNull().default("active"),
  unsubscribeTokenHash: text("unsubscribe_token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("newsletter_subscribers_email_uidx").on(table.email),
  uniqueIndex("newsletter_subscribers_token_hash_uidx").on(table.unsubscribeTokenHash),
  index("newsletter_subscribers_status_created_idx").on(table.status, table.createdAt),
  check("newsletter_subscribers_status_check", sql`${table.status} in ('active','unsubscribed','disabled')`),
]);

export const newsletterCampaignsTable = pgTable("newsletter_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  dedupeKey: text("dedupe_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  readMorePath: text("read_more_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("newsletter_campaigns_dedupe_uidx").on(table.dedupeKey),
]);

export const newsletterDeliveriesTable = pgTable("newsletter_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => newsletterCampaignsTable.id, { onDelete: "cascade" }),
  subscriberId: uuid("subscriber_id").notNull().references(() => newsletterSubscribersTable.id, { onDelete: "cascade" }),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  claimHeartbeatAt: timestamp("claim_heartbeat_at", { withTimezone: true }),
  providerIdempotencyStartedAt: timestamp("provider_idempotency_started_at", { withTimezone: true }),
  retryAfterAt: timestamp("retry_after_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("newsletter_deliveries_campaign_subscriber_uidx").on(table.campaignId, table.subscriberId),
  index("newsletter_deliveries_delivery_idx").on(table.deliveryStatus, table.nextAttemptAt),
  check("newsletter_deliveries_status_check", sql`${table.deliveryStatus} in ('pending','sending','delivered','failed','suppressed')`),
]);

export const newsletterRateLimitsTable = pgTable("newsletter_rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("newsletter_rate_limits_attempts_check", sql`${table.attempts} between 0 and 1000`),
  index("newsletter_rate_limits_updated_idx").on(table.updatedAt),
]);

export const insertNewsletterSubscriberSchema = createInsertSchema(newsletterSubscribersTable);
export type NewsletterSubscriber = typeof newsletterSubscribersTable.$inferSelect;
export type NewsletterCampaign = typeof newsletterCampaignsTable.$inferSelect;
export type NewsletterDelivery = typeof newsletterDeliveriesTable.$inferSelect;