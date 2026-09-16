CREATE TABLE IF NOT EXISTS "newsletter_rate_limits" (
  "key" text PRIMARY KEY,
  "window_started_at" timestamptz NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "newsletter_rate_limits_attempts_check" CHECK ("attempts" between 0 and 1000)
);
CREATE INDEX IF NOT EXISTS "newsletter_rate_limits_updated_idx" ON "newsletter_rate_limits" ("updated_at");
ALTER TABLE "newsletter_deliveries"
  ADD COLUMN IF NOT EXISTS "claim_heartbeat_at" timestamptz;
ALTER TABLE "newsletter_deliveries"
  ADD COLUMN IF NOT EXISTS "retry_after_at" timestamptz;