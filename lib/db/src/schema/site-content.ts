import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const SITE_CONTENT_PAGE_KEYS = [
  "home",
  "convert",
  "swap",
  "market-rates",
  "about-us",
  "affiliate-program",
  "operations",
  "contact-us",
  "privacy-policy",
  "terms-conditions",
  "aml-kyc",
  "widget-exchange-information",
] as const;
export type SiteContentPageKey = typeof SITE_CONTENT_PAGE_KEYS[number];

export type SiteNavigationSnapshot = {
  id: string;
  label: string;
  href: string;
  enabled: boolean;
  header: boolean;
  footer: boolean;
  widget: boolean;
};

export type SitePartnerLogoSnapshot = {
  id: string;
  name: string;
  objectPath: string;
  lightObjectPath?: string | null;
  darkObjectPath?: string | null;
  appearance?: "auto" | "same" | "separate";
  sortOrder?: number;
  link: string | null;
  enabled: boolean;
  removedAt: string | null;
  createdAt: string;
};

export type PartnerLogoSettings = {
  layout: "horizontal-row" | "carousel" | "grid" | "vertical-list" | "stacked-rows" | "marquee";
  animation: "static" | "auto-scroll";
  direction: "ltr" | "rtl";
  speed: "very-slow" | "slow" | "normal" | "fast" | "very-fast" | "custom";
  customSpeed?: number;
  pauseOnHover: boolean;
  manualInteraction: boolean;
  resumeAfterInteraction: boolean;
  columnsDesktop: number;
  columnsTablet: number;
  columnsMobile: number;
  size: "small" | "medium" | "large" | "custom";
  customSize: number;
  container: "none" | "subtle-card" | "glow-card";
  spacing: "compact" | "normal" | "wide";
  alignment: "left" | "center" | "right";
};

export type SiteSocialTrustSnapshot = {
  socialTitle: string;
  trustTitle: string;
  instagramUrl?: string | null;
  xUrl?: string | null;
  facebookUrl?: string | null;
  telegramUrl?: string | null;
  appearance?: SocialIconAppearance;
  items: SiteSocialTrustLinkSnapshot[];
};

export type SocialIconAppearance = {
  iconSize: number;
  logoSize: number;
  circleSize: number;
  borderThickness: number;
  radiusMode: "circle" | "rounded" | "square";
  backgroundColor: string;
  borderColor: string;
  glowColor: string;
  glowIntensity: number;
  iconOpacity: number;
};

export type SiteSocialTrustLinkSnapshot = {
  id: string;
  group: "social" | "trust";
  name: string;
  href: string;
  objectPath: string | null;
  enabled: boolean;
  removedAt: string | null;
  createdAt: string;
};

export const siteContentRevisionsTable = pgTable("site_content_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageKey: text("page_key").notNull(),
  revision: integer("revision").notNull(),
  status: text("status").notNull().default("draft"),
  content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text("created_by").notNull(),
  publishedBy: text("published_by"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("site_content_page_revision_uidx").on(table.pageKey, table.revision),
  index("site_content_page_status_idx").on(table.pageKey, table.status, table.revision),
  check("site_content_status_check", sql`${table.status} in ('draft','published')`),
  check("site_content_content_object_check", sql`jsonb_typeof(${table.content}) = 'object'`),
]);

/** Immutable owner-published snapshot for navigation and partner logos. */
export const sitePublicationRevisionsTable = pgTable("site_publication_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull(),
  navigation: jsonb("navigation").$type<SiteNavigationSnapshot[]>().notNull().default([]),
  partnerLogos: jsonb("partner_logos").$type<SitePartnerLogoSnapshot[]>().notNull().default([]),
  partnerLogoSettings: jsonb("partner_logo_settings").$type<PartnerLogoSettings>(),
  socialTrust: jsonb("social_trust").$type<SiteSocialTrustSnapshot>().notNull().default({ socialTitle: "Stay connected with us", trustTitle: "Share your feedback with us", appearance: { iconSize: 16, logoSize: 72, circleSize: 36, borderThickness: 1, radiusMode: "circle", backgroundColor: "#111827", borderColor: "#374151", glowColor: "#6366f1", glowIntensity: 0, iconOpacity: 100 }, items: [] }),
  createdBy: text("created_by").notNull(),
  publishedBy: text("published_by").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("site_publication_revision_version_uidx").on(table.version),
  check("site_publication_navigation_array_check", sql`jsonb_typeof(${table.navigation}) = 'array'`),
  check("site_publication_partner_logos_array_check", sql`jsonb_typeof(${table.partnerLogos}) = 'array'`),
  check("site_publication_partner_logo_settings_object_check", sql`${table.partnerLogoSettings} is null or jsonb_typeof(${table.partnerLogoSettings}) = 'object'`),
  check("site_publication_social_trust_object_check", sql`jsonb_typeof(${table.socialTrust}) = 'object'`),
]);

export const siteContentAuditLogsTable = pgTable("site_content_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  pageKey: text("page_key"),
  revisionId: uuid("revision_id").references(() => siteContentRevisionsTable.id),
  publicationRevisionId: uuid("publication_revision_id").references(() => sitePublicationRevisionsTable.id),
  targetId: uuid("target_id"),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("site_content_audit_page_idx").on(table.pageKey, table.createdAt),
]);

export const navLinksTable = pgTable("site_nav_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  href: text("href").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  header: boolean("header").notNull().default(false),
  footer: boolean("footer").notNull().default(false),
  widget: boolean("widget").notNull().default(false),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
]);

export const partnerLogosTable = pgTable("site_partner_logos", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  lightObjectPath: text("light_object_path"),
  darkObjectPath: text("dark_object_path"),
  appearance: text("appearance").notNull().default("auto"),
  sortOrder: integer("sort_order"),
  link: text("link"),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by").notNull(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("site_partner_logos_path_check", sql`${table.objectPath} ~ '^/objects/partner-logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`),
  check("site_partner_logos_light_path_check", sql`${table.lightObjectPath} is null or ${table.lightObjectPath} ~ '^/objects/partner-logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`),
  check("site_partner_logos_dark_path_check", sql`${table.darkObjectPath} is null or ${table.darkObjectPath} ~ '^/objects/partner-logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`),
  check("site_partner_logos_appearance_check", sql`${table.appearance} in ('auto','same','separate')`),
]);

export const partnerLogoSettingsTable = pgTable("site_partner_logo_settings", {
  id: text("id").primaryKey().default("global"),
  settings: jsonb("settings").$type<PartnerLogoSettings>().notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("site_partner_logo_settings_object_check", sql`jsonb_typeof(${table.settings}) = 'object'`),
]);

export const socialTrustSettingsTable = pgTable("site_social_trust_settings", {
  id: text("id").primaryKey().default("footer"),
  socialTitle: text("social_title").notNull().default("Stay connected with us"),
  trustTitle: text("trust_title").notNull().default("Share your feedback with us"),
  instagramUrl: text("instagram_url"),
  xUrl: text("x_url"),
  facebookUrl: text("facebook_url"),
  telegramUrl: text("telegram_url"),
  appearance: jsonb("appearance").$type<SocialIconAppearance>().notNull().default({ iconSize: 16, logoSize: 72, circleSize: 36, borderThickness: 1, radiusMode: "circle", backgroundColor: "#111827", borderColor: "#374151", glowColor: "#6366f1", glowIntensity: 0, iconOpacity: 100 }),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialTrustLinksTable = pgTable("site_social_trust_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  group: text("group_name").notNull().default("social"),
  name: text("name").notNull(),
  href: text("href").notNull(),
  objectPath: text("object_path"),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by").notNull(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("site_social_trust_links_group_check", sql`${table.group} in ('social','trust')`),
  check("site_social_trust_links_path_check", sql`${table.objectPath} is null or ${table.objectPath} ~ '^/objects/social-trust-icons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`),
]);

export const contactSubmissionsTable = pgTable("site_contact_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  ipAddress: text("ip_address").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("site_contact_submissions_created_idx").on(table.createdAt),
  index("site_contact_submissions_ip_created_idx").on(table.ipAddress, table.createdAt),
]);

export const insertSiteContentRevisionSchema = createInsertSchema(siteContentRevisionsTable);
export const insertSitePublicationRevisionSchema = createInsertSchema(sitePublicationRevisionsTable);
export const insertNavLinkSchema = createInsertSchema(navLinksTable);
export const insertPartnerLogoSchema = createInsertSchema(partnerLogosTable);
export const insertPartnerLogoSettingsSchema = createInsertSchema(partnerLogoSettingsTable);
export const insertSocialTrustSettingsSchema = createInsertSchema(socialTrustSettingsTable);
export const insertSocialTrustLinkSchema = createInsertSchema(socialTrustLinksTable);
export const insertContactSubmissionSchema = createInsertSchema(contactSubmissionsTable);
export type SiteContentRevision = typeof siteContentRevisionsTable.$inferSelect;
export type SitePublicationRevision = typeof sitePublicationRevisionsTable.$inferSelect;
export type NavLink = typeof navLinksTable.$inferSelect;
export type PartnerLogo = typeof partnerLogosTable.$inferSelect;
export type PartnerLogoSettingsRow = typeof partnerLogoSettingsTable.$inferSelect;
export type SocialTrustSettings = typeof socialTrustSettingsTable.$inferSelect;
export type SocialTrustLink = typeof socialTrustLinksTable.$inferSelect;
export type ContactSubmission = typeof contactSubmissionsTable.$inferSelect;