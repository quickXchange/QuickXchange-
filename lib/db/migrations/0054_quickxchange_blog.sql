CREATE TABLE IF NOT EXISTS "blog_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "normalized_slug" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blog_categories_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT "blog_categories_normalized_slug_check" CHECK ("normalized_slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_categories_normalized_slug_uidx" ON "blog_categories" ("normalized_slug");
CREATE INDEX IF NOT EXISTS "blog_categories_enabled_order_idx" ON "blog_categories" ("enabled", "sort_order");

CREATE TABLE IF NOT EXISTS "blog_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category_id" uuid NOT NULL REFERENCES "blog_categories"("id"),
  "author_id" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "normalized_slug" text NOT NULL,
  "excerpt" text DEFAULT '' NOT NULL,
  "body" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "body_format" text DEFAULT 'blocks' NOT NULL,
  "featured_image_path" text,
  "featured_image_alt" text,
  "social_image_path" text,
  "published_at" timestamp with time zone,
  "scheduled_at" timestamp with time zone,
  "seo_title" text,
  "seo_description" text,
  "canonical_url" text,
  "index_page" boolean DEFAULT true NOT NULL,
  "follow_links" boolean DEFAULT true NOT NULL,
  "generation_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blog_articles_status_check" CHECK ("status" in ('draft','scheduled','published','unpublished')),
  CONSTRAINT "blog_articles_body_format_check" CHECK ("body_format" in ('blocks','html')),
  CONSTRAINT "blog_articles_body_object_check" CHECK (jsonb_typeof("body") in ('object','array')),
  CONSTRAINT "blog_articles_schedule_check" CHECK (
    ("status" <> 'scheduled' OR "scheduled_at" IS NOT NULL)
    AND ("status" <> 'published' OR "published_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_articles_normalized_slug_uidx" ON "blog_articles" ("normalized_slug");
CREATE INDEX IF NOT EXISTS "blog_articles_public_listing_idx" ON "blog_articles" ("status", "published_at", "id");
CREATE INDEX IF NOT EXISTS "blog_articles_category_listing_idx" ON "blog_articles" ("category_id", "status", "published_at");
CREATE INDEX IF NOT EXISTS "blog_articles_scheduled_idx" ON "blog_articles" ("status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "blog_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "normalized_slug" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blog_tags_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT "blog_tags_normalized_slug_check" CHECK ("normalized_slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_tags_normalized_slug_uidx" ON "blog_tags" ("normalized_slug");

CREATE TABLE IF NOT EXISTS "blog_article_tags" (
  "article_id" uuid NOT NULL REFERENCES "blog_articles"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "blog_tags"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_article_tags_article_tag_uidx" ON "blog_article_tags" ("article_id", "tag_id");
CREATE INDEX IF NOT EXISTS "blog_article_tags_tag_article_idx" ON "blog_article_tags" ("tag_id", "article_id");

CREATE TABLE IF NOT EXISTS "blog_article_citations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "article_id" uuid NOT NULL REFERENCES "blog_articles"("id") ON DELETE CASCADE,
  "source_url" text NOT NULL,
  "source_title" text DEFAULT '' NOT NULL,
  "publisher" text DEFAULT '' NOT NULL,
  "retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claim" text DEFAULT '' NOT NULL,
  "source_published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blog_article_citations_url_check" CHECK ("source_url" ~ '^https?://')
);
CREATE INDEX IF NOT EXISTS "blog_article_citations_article_idx" ON "blog_article_citations" ("article_id", "id");

CREATE TABLE IF NOT EXISTS "blog_automation_settings" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "review_first" boolean DEFAULT true NOT NULL,
  "publish_automatically" boolean DEFAULT false NOT NULL,
  "schedule_automatically" boolean DEFAULT false NOT NULL,
  "require_two_sources" boolean DEFAULT true NOT NULL,
  "freshness_window_minutes" integer DEFAULT 240 NOT NULL,
  "max_candidates_per_run" integer DEFAULT 20 NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "check_in_progress_until" timestamp with time zone,
  CONSTRAINT "blog_automation_settings_id_check" CHECK ("id" = 'global'),
  CONSTRAINT "blog_automation_settings_freshness_check" CHECK ("freshness_window_minutes" between 1 and 10080),
  CONSTRAINT "blog_automation_settings_candidates_check" CHECK ("max_candidates_per_run" between 1 and 1000)
);

CREATE TABLE IF NOT EXISTS "blog_automation_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "source_type" text DEFAULT 'rss' NOT NULL,
  "url" text NOT NULL,
  "allowed_host" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "reliability" text DEFAULT 'standard' NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_fetched_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blog_automation_sources_type_check" CHECK ("source_type" in ('rss','atom','coinmarketcap')),
  CONSTRAINT "blog_automation_sources_reliability_check" CHECK ("reliability" in ('standard','reliable','official')),
  CONSTRAINT "blog_automation_sources_url_check" CHECK ("url" ~ '^https://')
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_automation_sources_url_uidx" ON "blog_automation_sources" ("url");
CREATE INDEX IF NOT EXISTS "blog_automation_sources_enabled_idx" ON "blog_automation_sources" ("enabled", "source_type");

CREATE TABLE IF NOT EXISTS "blog_automation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trigger" text DEFAULT 'scheduled' NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "dry_run" boolean DEFAULT false NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "created_by" text,
  CONSTRAINT "blog_automation_runs_trigger_check" CHECK ("trigger" in ('scheduled','manual','preview')),
  CONSTRAINT "blog_automation_runs_status_check" CHECK ("status" in ('running','completed','failed','skipped'))
);
CREATE INDEX IF NOT EXISTS "blog_automation_runs_started_idx" ON "blog_automation_runs" ("started_at");

CREATE TABLE IF NOT EXISTS "blog_automation_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "blog_automation_runs"("id") ON DELETE CASCADE,
  "source_id" uuid REFERENCES "blog_automation_sources"("id"),
  "source_url" text NOT NULL,
  "source_title" text DEFAULT '' NOT NULL,
  "topic" text NOT NULL,
  "normalized_topic" text NOT NULL,
  "status" text DEFAULT 'discovered' NOT NULL,
  "skip_reason" text,
  "source_published_at" timestamp with time zone,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generated_article_id" uuid REFERENCES "blog_articles"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blog_automation_candidates_status_check" CHECK ("status" in ('discovered','verified','generated','skipped','accepted','rejected'))
);
CREATE INDEX IF NOT EXISTS "blog_automation_candidates_run_idx" ON "blog_automation_candidates" ("run_id", "created_at");
CREATE INDEX IF NOT EXISTS "blog_automation_candidates_status_idx" ON "blog_automation_candidates" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "blog_duplicate_topic_fingerprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" text NOT NULL,
  "normalized_topic" text NOT NULL,
  "article_id" uuid REFERENCES "blog_articles"("id"),
  "candidate_id" uuid REFERENCES "blog_automation_candidates"("id"),
  "similarity" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blog_duplicate_topic_fingerprints_similarity_check" CHECK ("similarity" IS NULL OR "similarity" between 0 and 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_duplicate_topic_fingerprints_fingerprint_uidx" ON "blog_duplicate_topic_fingerprints" ("fingerprint");
CREATE INDEX IF NOT EXISTS "blog_duplicate_topic_fingerprints_topic_idx" ON "blog_duplicate_topic_fingerprints" ("normalized_topic");

CREATE TABLE IF NOT EXISTS "blog_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "actor_id" text,
  "article_id" uuid REFERENCES "blog_articles"("id"),
  "run_id" uuid REFERENCES "blog_automation_runs"("id"),
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "blog_audit_logs_article_created_idx" ON "blog_audit_logs" ("article_id", "created_at");
CREATE INDEX IF NOT EXISTS "blog_audit_logs_run_created_idx" ON "blog_audit_logs" ("run_id", "created_at");

INSERT INTO "blog_automation_settings" ("id", "updated_by")
VALUES ('global', 'system')
ON CONFLICT ("id") DO NOTHING;

-- Audit rows are append-only. The application role can insert and select them,
-- but cannot rewrite history through the normal ORM path.
CREATE OR REPLACE FUNCTION prevent_blog_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'blog_audit_logs is append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS blog_audit_append_only ON "blog_audit_logs";
CREATE TRIGGER blog_audit_append_only
BEFORE UPDATE OR DELETE ON "blog_audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_blog_audit_mutation();