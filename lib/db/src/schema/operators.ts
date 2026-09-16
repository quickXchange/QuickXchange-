import {
  index,
  integer,
  boolean,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const operatorsTable = pgTable("desk_operators", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  clerkUserId: text("clerk_user_id").unique(),
  role: text("role").notNull().default("operator"),
  customRoleId: uuid("custom_role_id").references(() => teamRolesTable.id, {
    onDelete: "set null",
  }),
  permissionAllows: text("permission_allows").array().notNull().default(sql`ARRAY[]::text[]`),
  permissionDenies: text("permission_denies").array().notNull().default(sql`ARRAY[]::text[]`),
  legacyPermissionEligible: boolean("legacy_permission_eligible").notNull().default(false),
  status: text("status").notNull().default("invited"),
  authVersion: integer("auth_version").notNull().default(1),
  invitedBy: text("invited_by"),
  approvedBy: text("approved_by"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("desk_operators_custom_role_idx").on(table.customRoleId),
]);

export const teamRolesTable = pgTable("team_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description").notNull().default(""),
  permissionKeys: text("permission_keys").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("team_roles_normalized_name_unique").on(table.normalizedName),
]);

export const adminActivityEventsTable = pgTable("admin_activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorOperatorId: uuid("actor_operator_id"),
  actorMemberName: text("actor_member_name").notNull().default(""),
  actorMemberEmail: text("actor_member_email").notNull().default(""),
  actorRole: text("actor_role").notNull().default("operator"),
  permissionKey: text("permission_key").notNull(),
  action: text("action").notNull(),
  section: text("section").notNull(),
  entityKind: text("entity_kind"),
  entityId: text("entity_id"),
  safeLabel: text("safe_label"),
  requestId: text("request_id"),
  outcome: text("outcome").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("admin_activity_events_occurred_at_id_idx").on(table.occurredAt, table.id),
  index("admin_activity_events_actor_occurred_at_idx").on(table.actorOperatorId, table.occurredAt),
  index("admin_activity_events_section_occurred_at_idx").on(table.section, table.occurredAt),
  index("admin_activity_events_permission_occurred_at_idx").on(table.permissionKey, table.occurredAt),
]);

export const operatorAuditLogsTable = pgTable("desk_operator_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  actorClerkUserId: text("actor_clerk_user_id"),
  targetOperatorId: uuid("target_operator_id"),
  targetEmail: text("target_email"),
  details: jsonb("details").notNull().default({}),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOperatorSchema = createInsertSchema(operatorsTable);
export const insertOperatorAuditLogSchema = createInsertSchema(operatorAuditLogsTable);
export const insertTeamRoleSchema = createInsertSchema(teamRolesTable);
export const insertAdminActivityEventSchema = createInsertSchema(adminActivityEventsTable);
export type Operator = typeof operatorsTable.$inferSelect;
export type OperatorAuditLog = typeof operatorAuditLogsTable.$inferSelect;
export type TeamRole = typeof teamRolesTable.$inferSelect;
export type AdminActivityEvent = typeof adminActivityEventsTable.$inferSelect;