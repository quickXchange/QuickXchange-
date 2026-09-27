CREATE TABLE IF NOT EXISTS "convert_admin_notification_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "quickex_order_id" text NOT NULL REFERENCES "quickex_orders"("legacy_order_id") ON DELETE CASCADE,
  "event_kind" text NOT NULL,
  "channel" text NOT NULL,
  "recipient" text NOT NULL,
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "status_version" integer NOT NULL DEFAULT 0,
  "evidence_key" text NOT NULL DEFAULT '',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "delivery_status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "claim_token" text,
  "claim_expires_at" timestamptz,
  "provider_idempotency_started_at" timestamptz,
  "delivered_at" timestamptz,
  "last_error_code" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "convert_admin_notification_identity_uidx"
  ON "convert_admin_notification_outbox"
  ("quickex_order_id", "event_kind", "status_version", "channel", "recipient", "evidence_key");
CREATE INDEX IF NOT EXISTS "convert_admin_notification_delivery_idx"
  ON "convert_admin_notification_outbox"
  ("delivery_status", "next_attempt_at", "claim_expires_at", "created_at");