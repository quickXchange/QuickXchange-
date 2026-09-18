ALTER TABLE "blog_articles" ADD COLUMN IF NOT EXISTS "source_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "blog_articles_source_key_uidx" ON "blog_articles" ("source_key");

CREATE TABLE IF NOT EXISTS "telegram_news_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL REFERENCES "blog_articles"("id") ON DELETE CASCADE,
  "channel_id" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "article_slug" text NOT NULL,
  "source_url" text NOT NULL,
  "source_publisher" text NOT NULL DEFAULT '',
  "delivery_status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "claim_token" text,
  "claim_expires_at" timestamptz,
  "last_error" text NOT NULL DEFAULT '',
  "delivered_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_news_outbox_article_uidx" ON "telegram_news_outbox" ("article_id");
CREATE INDEX IF NOT EXISTS "telegram_news_outbox_delivery_idx" ON "telegram_news_outbox" ("delivery_status", "next_attempt_at", "claim_expires_at");
DO $$ BEGIN
  ALTER TABLE "telegram_news_outbox"
    ADD CONSTRAINT "telegram_news_outbox_status_check"
    CHECK ("delivery_status" in ('pending','sending','delivered','failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Reset the public newsroom without deleting editorial rows.  The CTE makes
-- this safe to replay and gives every newly archived article an audit event.
WITH archived AS (
  UPDATE "blog_articles"
  SET "status" = 'unpublished',
      "scheduled_at" = NULL,
      "updated_by" = 'migration:0082',
      "updated_at" = now(),
      "generation_metadata" = jsonb_set(
        COALESCE("generation_metadata", '{}'::jsonb), '{archivedAt}', to_jsonb(now()::text)
      )
  WHERE "status" <> 'unpublished'
  RETURNING "id"
)
INSERT INTO "blog_audit_logs" ("action", "actor_id", "article_id", "details")
SELECT 'article.archived', 'migration:0082', "id", '{"migration":"0082","reason":"public newsroom reset"}'::jsonb
FROM archived;

-- The cutoff is immutable once established.  It intentionally lives in the
-- JSON settings bag so older deployments can initialize it at runtime.
INSERT INTO "blog_automation_settings" ("id", "updated_by", "settings")
VALUES ('global', 'migration:0082', jsonb_build_object('newsIngestionStartedAt', now()::text))
ON CONFLICT ("id") DO UPDATE
SET "settings" = CASE
  WHEN COALESCE("blog_automation_settings"."settings", '{}'::jsonb) ? 'newsIngestionStartedAt'
    THEN "blog_automation_settings"."settings"
  ELSE jsonb_set(COALESCE("blog_automation_settings"."settings", '{}'::jsonb),
                 '{newsIngestionStartedAt}', to_jsonb(now()::text))
END,
"updated_at" = now();

-- Match by the security allowlist identity rather than URL text.  This keeps
-- older trailing-slash variants from creating a second official source.
UPDATE "blog_automation_sources"
SET "name" = CASE "allowed_host"
      WHEN 'www.coindesk.com' THEN 'CoinDesk Official News'
      WHEN 'cointelegraph.com' THEN 'Cointelegraph Official News'
    END,
    "enabled" = true,
    "reliability" = 'official',
    "config" = CASE "allowed_host"
      WHEN 'www.coindesk.com' THEN '{"publisher":"CoinDesk","newsPublisher":true}'::jsonb
      WHEN 'cointelegraph.com' THEN '{"publisher":"Cointelegraph","newsPublisher":true}'::jsonb
    END,
    "updated_by" = 'system',
    "updated_at" = now()
WHERE "source_type" = 'rss'
  AND "allowed_host" IN ('www.coindesk.com', 'cointelegraph.com');

INSERT INTO "blog_automation_sources"
  ("name", "source_type", "url", "allowed_host", "enabled", "reliability", "config", "created_by", "updated_by")
SELECT seed."name", seed."source_type", seed."url", seed."allowed_host",
       seed."enabled", seed."reliability", seed."config", seed."created_by", seed."updated_by"
FROM (VALUES
  ('CoinDesk Official News', 'rss', 'https://www.coindesk.com/arc/outboundfeeds/rss', 'www.coindesk.com', true, 'official', '{"publisher":"CoinDesk","newsPublisher":true}'::jsonb, 'system', 'system'),
  ('Cointelegraph Official News', 'rss', 'https://cointelegraph.com/rss', 'cointelegraph.com', true, 'official', '{"publisher":"Cointelegraph","newsPublisher":true}'::jsonb, 'system', 'system')
) AS seed("name", "source_type", "url", "allowed_host", "enabled", "reliability", "config", "created_by", "updated_by")
WHERE NOT EXISTS (
  SELECT 1
  FROM "blog_automation_sources" existing
  WHERE existing."source_type" = 'rss'
    AND existing."allowed_host" = seed."allowed_host"
);