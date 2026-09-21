CREATE TABLE IF NOT EXISTS "convert_notification_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "quickex_order_id" text NOT NULL REFERENCES "quickex_orders"("legacy_order_id") ON DELETE CASCADE,
  "customer_clerk_user_id" text NOT NULL,
  "recipient_email" text NOT NULL DEFAULT '',
  "event_kind" text NOT NULL,
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "status_version" integer NOT NULL,
  "evidence_key" text NOT NULL DEFAULT '',
  "delivery_status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "claim_token" text,
  "claim_expires_at" timestamptz,
  "last_attempt_at" timestamptz,
  "provider_idempotency_started_at" timestamptz,
  "delivered_at" timestamptz,
  "last_error_code" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "convert_notification_outbox_identity_uidx"
  ON "convert_notification_outbox" ("quickex_order_id","event_kind","status_version","evidence_key");
CREATE INDEX IF NOT EXISTS "convert_notification_outbox_delivery_idx"
  ON "convert_notification_outbox" ("delivery_status","next_attempt_at","claim_expires_at","created_at");