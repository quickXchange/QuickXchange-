ALTER TABLE "customer_status_notification_events"
  ADD COLUMN IF NOT EXISTS "event_kind" text DEFAULT 'status' NOT NULL,
  ADD COLUMN IF NOT EXISTS "channel" text DEFAULT 'email' NOT NULL,
  ADD COLUMN IF NOT EXISTS "recipient_email" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "admin_recipient" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "evidence_key" text DEFAULT '' NOT NULL;

DROP INDEX IF EXISTS "customer_status_notification_version_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "customer_status_notification_event_uidx"
  ON "customer_status_notification_events" ("order_id", "event_kind", "status_version", "channel", "recipient_email", "evidence_key");