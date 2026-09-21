ALTER TABLE "quickex_orders"
  ADD COLUMN IF NOT EXISTS "provider_created_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "provider_updated_at" timestamptz;

ALTER TABLE "convert_notification_outbox"
  ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL DEFAULT '{}'::jsonb;