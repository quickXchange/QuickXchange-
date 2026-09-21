CREATE TABLE IF NOT EXISTS "notification_settings" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "email_enabled" boolean DEFAULT true NOT NULL,
  "telegram_enabled" boolean DEFAULT true NOT NULL,
  "payment_received_enabled" boolean DEFAULT true NOT NULL,
  "processing_enabled" boolean DEFAULT true NOT NULL,
  "completed_enabled" boolean DEFAULT true NOT NULL,
  "failed_cancelled_enabled" boolean DEFAULT true NOT NULL,
  "admin_notification_email" text DEFAULT '' NOT NULL,
  "admin_telegram_chat_id" text DEFAULT '' NOT NULL,
  "trustpilot_review_url" text DEFAULT '' NOT NULL,
  "updated_by" text,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

INSERT INTO "notification_settings" ("id")
VALUES ('global')
ON CONFLICT ("id") DO NOTHING;