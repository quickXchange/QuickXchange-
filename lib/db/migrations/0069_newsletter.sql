CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "unsubscribe_token_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "unsubscribed_at" timestamptz,
  CONSTRAINT "newsletter_subscribers_status_check" CHECK ("status" in ('active','unsubscribed','disabled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_email_uidx" ON "newsletter_subscribers" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_token_hash_uidx" ON "newsletter_subscribers" ("unsubscribe_token_hash");
CREATE INDEX IF NOT EXISTS "newsletter_subscribers_status_created_idx" ON "newsletter_subscribers" ("status","created_at");

CREATE TABLE IF NOT EXISTS "newsletter_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dedupe_key" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "read_more_path" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_campaigns_dedupe_uidx" ON "newsletter_campaigns" ("dedupe_key");

CREATE TABLE IF NOT EXISTS "newsletter_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES "newsletter_campaigns"("id") ON DELETE CASCADE,
  "subscriber_id" uuid NOT NULL REFERENCES "newsletter_subscribers"("id") ON DELETE CASCADE,
  "delivery_status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "claim_token" text,
  "claim_expires_at" timestamptz,
  "provider_idempotency_started_at" timestamptz,
  "delivered_at" timestamptz,
  "last_error_code" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "newsletter_deliveries_status_check" CHECK ("delivery_status" in ('pending','sending','delivered','failed','suppressed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_deliveries_campaign_subscriber_uidx" ON "newsletter_deliveries" ("campaign_id","subscriber_id");
CREATE INDEX IF NOT EXISTS "newsletter_deliveries_delivery_idx" ON "newsletter_deliveries" ("delivery_status","next_attempt_at");