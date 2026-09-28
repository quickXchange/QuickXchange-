CREATE TABLE IF NOT EXISTS "manual_swap_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fixed_amount" numeric(38, 18) DEFAULT '0' NOT NULL,
	"fee_currency" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"selection_rule" text DEFAULT 'multiple' NOT NULL,
	"presentation" jsonb DEFAULT '{"group":""}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manual_swap_fee_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"percentage" numeric(38, 18),
	"fixed_amount" numeric(38, 18),
	"fixed_currency" text DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "manual_swap_addons_key_uidx" ON "manual_swap_addons" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_swap_addons_public_idx" ON "manual_swap_addons" USING btree ("enabled","deleted_at");--> statement-breakpoint
INSERT INTO "manual_swap_fee_config" ("id", "enabled", "fixed_currency")
VALUES ('default', FALSE, 'USD')
ON CONFLICT ("id") DO NOTHING;