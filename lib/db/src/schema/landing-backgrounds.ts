import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const LANDING_BACKGROUND_PRESET_IDS = [
  "neon-orbit",
  "crystal-ledger",
  "quantum-grid",
  "liquid-token",
  "aurora-chain",
  "prism-vault",
  "network-bloom",
  "electric-canyon",
  "cosmic-exchange",
  "blueprint-future",
] as const;

export type LandingBackgroundPlacement = {
  desktop: { x: number; y: number; zoom: number; opacity: number; blur: number };
  mobile: { x: number; y: number; zoom: number; opacity: number; blur: number };
};

/** Immutable history: the row with the greatest version is the active selection. */
export const landingBackgroundSettingsTable = pgTable("landing_background_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull(),
  mode: text("mode").notNull().default("preset"),
  presetId: text("preset_id").default("neon-orbit"),
  customObjectPath: text("custom_object_path"),
  focalX: integer("focal_x").notNull().default(50),
  focalY: integer("focal_y").notNull().default(50),
  placements: jsonb("placements").$type<Record<string, LandingBackgroundPlacement>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
}, (table) => [
  uniqueIndex("landing_background_settings_version_uidx").on(table.version),
  check("landing_background_settings_version_check", sql`${table.version} > 0`),
  check("landing_background_settings_focal_x_check", sql`${table.focalX} between 0 and 100`),
  check("landing_background_settings_focal_y_check", sql`${table.focalY} between 0 and 100`),
  check("landing_background_settings_placements_object_check", sql`jsonb_typeof(${table.placements}) = 'object'`),
  check("landing_background_settings_selection_check", sql`
    (${table.mode} = 'preset'
      AND ${table.presetId} IN ('neon-orbit','crystal-ledger','quantum-grid','liquid-token','aurora-chain','prism-vault','network-bloom','electric-canyon','cosmic-exchange','blueprint-future')
      AND ${table.customObjectPath} IS NULL)
    OR
    (${table.mode} = 'custom'
      AND ${table.presetId} IS NULL
      AND ${table.customObjectPath} ~ '^/objects/landing-backgrounds/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  `),
]);

export const landingBackgroundAuditLogsTable = pgTable("landing_background_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull().default("landing_background.published"),
  actorId: text("actor_id").notNull(),
  settingId: uuid("setting_id").notNull().references(() => landingBackgroundSettingsTable.id),
  version: integer("version").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("landing_background_audit_setting_idx").on(table.settingId),
]);

export type LandingBackgroundSetting = typeof landingBackgroundSettingsTable.$inferSelect;