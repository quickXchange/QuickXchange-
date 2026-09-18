ALTER TABLE "telegram_chats"
  ADD COLUMN IF NOT EXISTS "clerk_customer_user_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_chats_clerk_customer_user_uidx"
  ON "telegram_chats" USING btree ("clerk_customer_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_account_link_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL,
  "chat_id" text NOT NULL REFERENCES "telegram_chats"("chat_id") ON DELETE cascade,
  "telegram_user_id" text NOT NULL,
  "intent" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_account_link_challenges_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_account_link_challenges_active_idx"
  ON "telegram_account_link_challenges" USING btree ("chat_id", "expires_at");