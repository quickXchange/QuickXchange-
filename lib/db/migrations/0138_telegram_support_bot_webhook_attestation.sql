ALTER TABLE "telegram_support_bot_settings" ADD COLUMN "webhook_attested_token_digest" text;--> statement-breakpoint
ALTER TABLE "telegram_support_bot_settings" ADD COLUMN "webhook_attested_secret_digest" text;--> statement-breakpoint
ALTER TABLE "telegram_support_bot_settings" ADD COLUMN "webhook_attested_url" text;--> statement-breakpoint
ALTER TABLE "telegram_support_bot_settings" ADD COLUMN "webhook_attested_at" timestamp with time zone;