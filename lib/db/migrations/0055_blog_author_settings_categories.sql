ALTER TABLE "blog_articles"
  ADD COLUMN IF NOT EXISTS "author_name" text NOT NULL DEFAULT '';

ALTER TABLE "blog_articles"
  DROP CONSTRAINT IF EXISTS "blog_articles_body_object_check";
ALTER TABLE "blog_articles"
  ADD CONSTRAINT "blog_articles_body_type_check"
  CHECK (jsonb_typeof("body") in ('string','object','array'));

ALTER TABLE "blog_automation_settings"
  ADD COLUMN IF NOT EXISTS "cadence_unit" text NOT NULL DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS "articles_per_period" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "schedule_times" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "topics" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "categories" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "keywords" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "language" text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "minimum_article_length" integer NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS "publication_mode" text NOT NULL DEFAULT 'review',
  ADD COLUMN IF NOT EXISTS "featured_image_generation" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "seo_generation" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "seo_index" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "seo_follow" boolean NOT NULL DEFAULT true;

ALTER TABLE "blog_automation_settings"
  ADD CONSTRAINT "blog_automation_settings_cadence_check"
  CHECK ("cadence_unit" in ('day','week') AND "articles_per_period" between 1 and 100),
  ADD CONSTRAINT "blog_automation_settings_publication_check"
  CHECK ("publication_mode" in ('draft','review','auto')),
  ADD CONSTRAINT "blog_automation_settings_length_check"
  CHECK ("minimum_article_length" between 100 and 100000);

INSERT INTO "blog_categories" ("name", "slug", "normalized_slug", "description", "sort_order", "enabled", "created_by", "updated_by")
VALUES
  ('Crypto News', 'crypto-news', 'crypto-news', '', 10, true, 'system', 'system'),
  ('Guides', 'guides', 'guides', '', 20, true, 'system', 'system'),
  ('Exchange', 'exchange', 'exchange', '', 30, true, 'system', 'system'),
  ('Bitcoin', 'bitcoin', 'bitcoin', '', 40, true, 'system', 'system'),
  ('Ethereum', 'ethereum', 'ethereum', '', 50, true, 'system', 'system'),
  ('Stablecoins', 'stablecoins', 'stablecoins', '', 60, true, 'system', 'system'),
  ('Security', 'security', 'security', '', 70, true, 'system', 'system'),
  ('Market Insights', 'market-insights', 'market-insights', '', 80, true, 'system', 'system'),
  ('QuickXchange Updates', 'quickxchange-updates', 'quickxchange-updates', '', 90, true, 'system', 'system')
ON CONFLICT ("normalized_slug") DO NOTHING;