import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

/**
 * Blog content is deliberately kept separate from the site-content revision
 * system.  Article body is either a structured, renderer-owned block array or
 * sanitized HTML; callers must never treat this JSON as trusted HTML.
 */
export const blogCategoriesTable = pgTable("blog_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  normalizedSlug: text("normalized_slug").notNull(),
  description: text("description").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("blog_categories_normalized_slug_uidx").on(table.normalizedSlug),
  check("blog_categories_slug_check", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  check("blog_categories_normalized_slug_check", sql`${table.normalizedSlug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
]);

export const blogArticlesTable = pgTable("blog_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").notNull().references(() => blogCategoriesTable.id),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull().default(""),
  status: text("status").notNull().default("draft"),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  normalizedSlug: text("normalized_slug").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  body: jsonb("body").$type<string | Record<string, unknown> | Array<Record<string, unknown>>>().notNull().default([]),
  bodyFormat: text("body_format").notNull().default("blocks"),
  featuredImagePath: text("featured_image_path"),
  featuredImageAlt: text("featured_image_alt"),
  socialImagePath: text("social_image_path"),
  isFeatured: boolean("is_featured").notNull().default(false),
  readingTimeMinutes: integer("reading_time_minutes").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  canonicalUrl: text("canonical_url"),
  sourceKey: text("source_key"),
  indexPage: boolean("index_page").notNull().default(true),
  followLinks: boolean("follow_links").notNull().default(true),
  generationMetadata: jsonb("generation_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("blog_articles_normalized_slug_uidx").on(table.normalizedSlug),
  index("blog_articles_public_listing_idx").on(table.status, table.publishedAt, table.id),
  index("blog_articles_category_listing_idx").on(table.categoryId, table.status, table.publishedAt),
  index("blog_articles_scheduled_idx").on(table.status, table.scheduledAt),
  uniqueIndex("blog_articles_source_key_uidx").on(table.sourceKey),
  check("blog_articles_status_check", sql`${table.status} in ('draft','scheduled','published','unpublished')`),
  check("blog_articles_body_format_check", sql`${table.bodyFormat} in ('blocks','html')`),
  check("blog_articles_reading_time_check", sql`${table.readingTimeMinutes} between 1 and 120`),
  check("blog_articles_body_type_check", sql`jsonb_typeof(${table.body}) in ('string','object','array')`),
  check("blog_articles_schedule_check", sql`
    (${table.status} <> 'scheduled' OR ${table.scheduledAt} IS NOT NULL)
    AND (${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL)
  `),
]);

export const blogTagsTable = pgTable("blog_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  normalizedSlug: text("normalized_slug").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("blog_tags_normalized_slug_uidx").on(table.normalizedSlug),
  check("blog_tags_slug_check", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  check("blog_tags_normalized_slug_check", sql`${table.normalizedSlug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
]);

export const blogArticleTagsTable = pgTable("blog_article_tags", {
  articleId: uuid("article_id").notNull().references(() => blogArticlesTable.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => blogTagsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("blog_article_tags_article_tag_uidx").on(table.articleId, table.tagId),
  index("blog_article_tags_tag_article_idx").on(table.tagId, table.articleId),
]);

export const blogArticleCitationsTable = pgTable("blog_article_citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id").notNull().references(() => blogArticlesTable.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  sourceTitle: text("source_title").notNull().default(""),
  publisher: text("publisher").notNull().default(""),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  claim: text("claim").notNull().default(""),
  sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("blog_article_citations_article_idx").on(table.articleId, table.id),
  check("blog_article_citations_url_check", sql`${table.sourceUrl} ~ '^https?://'`),
]);

export const blogAutomationSettingsTable = pgTable("blog_automation_settings", {
  id: text("id").primaryKey().default("global"),
  enabled: boolean("enabled").notNull().default(false),
  reviewFirst: boolean("review_first").notNull().default(true),
  publishAutomatically: boolean("publish_automatically").notNull().default(false),
  scheduleAutomatically: boolean("schedule_automatically").notNull().default(false),
  requireTwoSources: boolean("require_two_sources").notNull().default(true),
  freshnessWindowMinutes: integer("freshness_window_minutes").notNull().default(240),
  maxCandidatesPerRun: integer("max_candidates_per_run").notNull().default(20),
  cadenceUnit: text("cadence_unit").notNull().default("day"),
  articlesPerPeriod: integer("articles_per_period").notNull().default(1),
  scheduleTimes: jsonb("schedule_times").$type<string[]>().notNull().default([]),
  timezone: text("timezone").notNull().default("UTC"),
  topics: jsonb("topics").$type<string[]>().notNull().default([]),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  language: text("language").notNull().default("en"),
  minimumArticleLength: integer("minimum_article_length").notNull().default(600),
  publicationMode: text("publication_mode").notNull().default("review"),
  featuredImageGeneration: boolean("featured_image_generation").notNull().default(false),
  seoGeneration: boolean("seo_generation").notNull().default(true),
  seoIndex: boolean("seo_index").notNull().default(true),
  seoFollow: boolean("seo_follow").notNull().default(true),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  checkInProgressUntil: timestamp("check_in_progress_until", { withTimezone: true }),
  leaseId: text("lease_id"),
}, (table) => [
  check("blog_automation_settings_id_check", sql`${table.id} = 'global'`),
  check("blog_automation_settings_freshness_check", sql`${table.freshnessWindowMinutes} between 1 and 10080`),
  check("blog_automation_settings_candidates_check", sql`${table.maxCandidatesPerRun} between 1 and 1000`),
  check("blog_automation_settings_cadence_check", sql`${table.cadenceUnit} in ('day','week') AND ${table.articlesPerPeriod} between 1 and 100`),
  check("blog_automation_settings_publication_check", sql`${table.publicationMode} in ('draft','review','auto')`),
  check("blog_automation_settings_length_check", sql`${table.minimumArticleLength} between 100 and 100000`),
]);

export const blogAutomationSourcesTable = pgTable("blog_automation_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull().default("rss"),
  url: text("url").notNull(),
  allowedHost: text("allowed_host").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  reliability: text("reliability").notNull().default("standard"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("blog_automation_sources_url_uidx").on(table.url),
  index("blog_automation_sources_enabled_idx").on(table.enabled, table.sourceType),
  check("blog_automation_sources_type_check", sql`${table.sourceType} in ('rss','atom','coinmarketcap')`),
  check("blog_automation_sources_reliability_check", sql`${table.reliability} in ('standard','reliable','official')`),
  check("blog_automation_sources_url_check", sql`${table.url} ~ '^https://'`),
]);

export const blogAutomationRunsTable = pgTable("blog_automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  trigger: text("trigger").notNull().default("scheduled"),
  status: text("status").notNull().default("running"),
  dryRun: boolean("dry_run").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  createdBy: text("created_by"),
}, (table) => [
  index("blog_automation_runs_started_idx").on(table.startedAt),
  check("blog_automation_runs_trigger_check", sql`${table.trigger} in ('scheduled','manual','preview')`),
  check("blog_automation_runs_status_check", sql`${table.status} in ('running','completed','failed','skipped')`),
]);

export const blogAutomationSlotsTable = pgTable("blog_automation_slots", {
  occurrenceKey: text("occurrence_key").primaryKey(),
  runId: uuid("run_id").notNull().references(() => blogAutomationRunsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("blog_automation_slots_run_uidx").on(table.runId),
]);

export const blogAutomationCandidatesTable = pgTable("blog_automation_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => blogAutomationRunsTable.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => blogAutomationSourcesTable.id),
  sourceUrl: text("source_url").notNull(),
  sourceTitle: text("source_title").notNull().default(""),
  topic: text("topic").notNull(),
  normalizedTopic: text("normalized_topic").notNull(),
  status: text("status").notNull().default("discovered"),
  skipReason: text("skip_reason"),
  sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  verification: jsonb("verification").$type<Record<string, unknown>>().notNull().default({}),
  quality: jsonb("quality").$type<Record<string, unknown>>().notNull().default({}),
  generatedArticleId: uuid("generated_article_id").references(() => blogArticlesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("blog_automation_candidates_run_idx").on(table.runId, table.createdAt),
  index("blog_automation_candidates_status_idx").on(table.status, table.createdAt),
  check("blog_automation_candidates_status_check", sql`${table.status} in ('discovered','verified','generated','skipped','accepted','rejected')`),
]);

export const blogDuplicateTopicFingerprintsTable = pgTable("blog_duplicate_topic_fingerprints", {
  id: uuid("id").primaryKey().defaultRandom(),
  fingerprint: text("fingerprint").notNull(),
  normalizedTopic: text("normalized_topic").notNull(),
  articleId: uuid("article_id").references(() => blogArticlesTable.id),
  candidateId: uuid("candidate_id").references(() => blogAutomationCandidatesTable.id),
  similarity: integer("similarity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("blog_duplicate_topic_fingerprints_fingerprint_uidx").on(table.fingerprint),
  index("blog_duplicate_topic_fingerprints_topic_idx").on(table.normalizedTopic),
  check("blog_duplicate_topic_fingerprints_similarity_check", sql`${table.similarity} IS NULL OR ${table.similarity} between 0 and 100`),
]);

/** Append-only administrative and automation audit trail. */
export const blogAuditLogsTable = pgTable("blog_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  actorId: text("actor_id"),
  articleId: uuid("article_id").references(() => blogArticlesTable.id),
  runId: uuid("run_id").references(() => blogAutomationRunsTable.id),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("blog_audit_logs_article_created_idx").on(table.articleId, table.createdAt),
  index("blog_audit_logs_run_created_idx").on(table.runId, table.createdAt),
]);

export const insertBlogCategorySchema = createInsertSchema(blogCategoriesTable);
export const insertBlogArticleSchema = createInsertSchema(blogArticlesTable);
export const insertBlogTagSchema = createInsertSchema(blogTagsTable);
export const insertBlogArticleTagSchema = createInsertSchema(blogArticleTagsTable);
export const insertBlogArticleCitationSchema = createInsertSchema(blogArticleCitationsTable);
export const insertBlogAutomationSettingsSchema = createInsertSchema(blogAutomationSettingsTable);
export const insertBlogAutomationSourceSchema = createInsertSchema(blogAutomationSourcesTable);
export const insertBlogAutomationRunSchema = createInsertSchema(blogAutomationRunsTable);
export const insertBlogAutomationSlotSchema = createInsertSchema(blogAutomationSlotsTable);
export const insertBlogAutomationCandidateSchema = createInsertSchema(blogAutomationCandidatesTable);
export const insertBlogDuplicateTopicFingerprintSchema = createInsertSchema(blogDuplicateTopicFingerprintsTable);
export const insertBlogAuditLogSchema = createInsertSchema(blogAuditLogsTable);

export type BlogCategory = typeof blogCategoriesTable.$inferSelect;
export type BlogArticle = typeof blogArticlesTable.$inferSelect;
export type BlogTag = typeof blogTagsTable.$inferSelect;
export type BlogArticleTag = typeof blogArticleTagsTable.$inferSelect;
export type BlogArticleCitation = typeof blogArticleCitationsTable.$inferSelect;
export type BlogAutomationSettings = typeof blogAutomationSettingsTable.$inferSelect;
export type BlogAutomationSource = typeof blogAutomationSourcesTable.$inferSelect;
export type BlogAutomationRun = typeof blogAutomationRunsTable.$inferSelect;
export type BlogAutomationSlot = typeof blogAutomationSlotsTable.$inferSelect;
export type BlogAutomationCandidate = typeof blogAutomationCandidatesTable.$inferSelect;
export type BlogDuplicateTopicFingerprint = typeof blogDuplicateTopicFingerprintsTable.$inferSelect;
export type BlogAuditLog = typeof blogAuditLogsTable.$inferSelect;