ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "admin_notification_phone" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "admin_telegram_username" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_telegram_link_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "created_by" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "connected_chat_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_telegram_link_challenges_owner_idx"
  ON "admin_telegram_link_challenges" USING btree ("created_by", "expires_at");