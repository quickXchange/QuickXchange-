CREATE TABLE IF NOT EXISTS "exchange_order_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"request_id" text,
	"previous_version" integer NOT NULL,
	"next_version" integer NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exchange_provider_sync_states" (
	"provider" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"last_error_code" text DEFAULT '' NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "record_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_order_audit_order_created_idx" ON "exchange_order_audit_logs" USING btree ("order_id","created_at");