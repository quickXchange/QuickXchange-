ALTER TABLE "blog_articles"
  ADD COLUMN IF NOT EXISTS "is_featured" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reading_time_minutes" integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blog_articles_reading_time_check'
  ) THEN
    ALTER TABLE "blog_articles"
      ADD CONSTRAINT "blog_articles_reading_time_check"
      CHECK ("reading_time_minutes" BETWEEN 1 AND 120);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "blog_articles_featured_listing_idx"
  ON "blog_articles" ("status", "is_featured", "published_at");