CREATE TABLE IF NOT EXISTS "telegram_chats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" text NOT NULL UNIQUE,
  "user_id" text NOT NULL,
  "username" text,
  "first_name" text,
  "locale" text NOT NULL DEFAULT 'en',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "telegram_wizard_sessions" (
  "chat_id" text PRIMARY KEY REFERENCES "telegram_chats"("chat_id") ON DELETE CASCADE,
  "state" text NOT NULL DEFAULT 'idle',
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "version" integer NOT NULL DEFAULT 0,
  "last_applied_update_id" text,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "telegram_wizard_sessions" ADD COLUMN IF NOT EXISTS "last_applied_update_id" text;
ALTER TABLE "telegram_wizard_sessions" ADD COLUMN IF NOT EXISTS "reconciliation_claim_token" text;
ALTER TABLE "telegram_wizard_sessions" ADD COLUMN IF NOT EXISTS "reconciliation_claim_expires_at" timestamptz;
CREATE TABLE IF NOT EXISTS "telegram_order_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" text NOT NULL REFERENCES "telegram_chats"("chat_id") ON DELETE CASCADE,
  "order_id" text NOT NULL,
  "order_kind" text NOT NULL DEFAULT 'manual',
  "tracking_token" text NOT NULL,
  "source" text NOT NULL DEFAULT 'telegram',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "telegram_order_links" ADD COLUMN IF NOT EXISTS "order_kind" text NOT NULL DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_order_links_chat_order_uidx" ON "telegram_order_links" ("chat_id", "order_id");
CREATE INDEX IF NOT EXISTS "telegram_order_links_chat_created_idx" ON "telegram_order_links" ("chat_id", "created_at");
CREATE TABLE IF NOT EXISTS "telegram_processed_updates" (
  "update_id" text PRIMARY KEY,
  "status" text NOT NULL DEFAULT 'processing',
  "claim_token" text,
  "claim_expires_at" timestamptz,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_error" text NOT NULL DEFAULT '',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "received_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "telegram_processed_updates" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'processing';
ALTER TABLE "telegram_processed_updates" ADD COLUMN IF NOT EXISTS "claim_token" text;
ALTER TABLE "telegram_processed_updates" ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamptz;
ALTER TABLE "telegram_processed_updates" ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "telegram_processed_updates" ADD COLUMN IF NOT EXISTS "last_error" text NOT NULL DEFAULT '';
ALTER TABLE "telegram_processed_updates" ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS "telegram_notification_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" text NOT NULL,
  "order_id" text NOT NULL,
  "status_version" integer NOT NULL,
  "event_kind" text NOT NULL DEFAULT 'status',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "delivery_status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "claim_token" text,
  "claim_expires_at" timestamptz,
  "last_error" text NOT NULL DEFAULT '',
  "delivered_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_notification_order_status_uidx" ON "telegram_notification_outbox" ("order_id", "status_version", "chat_id");
ALTER TABLE "telegram_notification_outbox" ADD COLUMN IF NOT EXISTS "event_kind" text NOT NULL DEFAULT 'status';
DROP INDEX IF EXISTS "telegram_notification_order_status_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_notification_order_status_uidx" ON "telegram_notification_outbox" ("order_id", "status_version", "chat_id", "event_kind");
CREATE INDEX IF NOT EXISTS "telegram_notification_delivery_idx" ON "telegram_notification_outbox" ("delivery_status", "next_attempt_at", "claim_expires_at");