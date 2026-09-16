import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const websiteBrandingSettingsTable = pgTable("website_branding_settings", {
  id: text("id").primaryKey().default("global"),
  lightLogoPath: text("light_logo_path"),
  darkLogoPath: text("dark_logo_path"),
  mobileLogoPath: text("mobile_logo_path"),
  faviconPath: text("favicon_path"),
  logoWidth: integer("logo_width").notNull().default(180),
  logoHeight: integer("logo_height").notNull().default(44),
  logoMaxWidth: integer("logo_max_width").notNull().default(240),
  alignment: text("alignment").notNull().default("left"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("website_branding_id_check", sql`${table.id} = 'global'`),
  check("website_branding_logo_width_check", sql`${table.logoWidth} between 1 and 4096`),
  check("website_branding_logo_height_check", sql`${table.logoHeight} between 1 and 4096`),
  check("website_branding_logo_max_width_check", sql`${table.logoMaxWidth} between 1 and 4096`),
  check("website_branding_alignment_check", sql`${table.alignment} in ('left','center','right')`),
  check("website_branding_paths_check", sql`
    (${table.lightLogoPath} IS NULL OR ${table.lightLogoPath} ~ '^/objects/website-branding/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    AND (${table.darkLogoPath} IS NULL OR ${table.darkLogoPath} ~ '^/objects/website-branding/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    AND (${table.mobileLogoPath} IS NULL OR ${table.mobileLogoPath} ~ '^/objects/website-branding/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    AND (${table.faviconPath} IS NULL OR ${table.faviconPath} ~ '^/objects/website-branding/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  `),
]);

export const insertWebsiteBrandingSettingsSchema = createInsertSchema(websiteBrandingSettingsTable);
export type WebsiteBrandingSettings = typeof websiteBrandingSettingsTable.$inferSelect;