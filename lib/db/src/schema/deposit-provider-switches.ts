import { pgTable, text, boolean, integer, timestamp, jsonb, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const depositProviderSwitchJobsTable = pgTable("deposit_provider_switch_jobs", {
  id: text("id").primaryKey(),
  requestDigest: text("request_digest").notNull(),
  depositProvider: text("deposit_provider").notNull(),
  actorId: text("actor_id").notNull(),
  actorAuthVersion: integer("actor_auth_version").notNull().default(0),
  actorClerkUserId: text("actor_clerk_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const depositProviderSwitchRoutesTable = pgTable("deposit_provider_switch_routes", {
  jobId: text("job_id").notNull().references(() => depositProviderSwitchJobsTable.id),
  networkId: text("network_id").notNull(),
  originalCustomerDepositsEnabled: boolean("original_customer_deposits_enabled").notNull(),
  sourceDigest: text("source_digest").notNull(),
  mapping: jsonb("mapping").$type<{ assetCode: string; networkCode: string } | null>(),
  status: text("status").notNull().default("queued"),
  step: text("step").notNull().default("pending"),
  message: text("message").notNull().default("Waiting to start"),
  errorCode: text("error_code"),
  attempts: integer("attempts").notNull().default(0),
  verificationStartedAt: timestamp("verification_started_at", { withTimezone: true }),
  runToken: text("run_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.jobId, table.networkId] }),
  uniqueIndex("deposit_provider_switch_active_route").on(table.networkId)
    .where(sql`${table.status} in ('queued', 'running')`),
]);

export const insertDepositProviderSwitchJobSchema = createInsertSchema(depositProviderSwitchJobsTable);
export const insertDepositProviderSwitchRouteSchema = createInsertSchema(depositProviderSwitchRoutesTable);
