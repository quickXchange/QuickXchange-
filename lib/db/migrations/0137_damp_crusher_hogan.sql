CREATE TABLE "telegram_support_bot_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"update_id" uuid NOT NULL,
	"bot_id" text NOT NULL,
	"incoming_update_id" text NOT NULL,
	"action_kind" text NOT NULL,
	"chat_id" text NOT NULL,
	"locale" text NOT NULL,
	"faq_id" text,
	"callback_query_id" text,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claim_token" text,
	"claim_expires_at" timestamp with time zone,
	"last_error_code" text DEFAULT '' NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_support_bot_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"settings" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_support_bot_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" text NOT NULL,
	"update_id" text NOT NULL,
	"action_kind" text NOT NULL,
	"chat_id" text NOT NULL,
	"locale" text NOT NULL,
	"faq_id" text,
	"callback_query_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_support_bot_outbox" ADD CONSTRAINT "telegram_support_bot_outbox_update_id_telegram_support_bot_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."telegram_support_bot_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_support_bot_outbox_update_uidx" ON "telegram_support_bot_outbox" USING btree ("bot_id","incoming_update_id");--> statement-breakpoint
CREATE INDEX "telegram_support_bot_outbox_delivery_idx" ON "telegram_support_bot_outbox" USING btree ("delivery_status","next_attempt_at","claim_expires_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_support_bot_update_identity_uidx" ON "telegram_support_bot_updates" USING btree ("bot_id","update_id");--> statement-breakpoint
CREATE INDEX "telegram_support_bot_updates_created_idx" ON "telegram_support_bot_updates" USING btree ("created_at");