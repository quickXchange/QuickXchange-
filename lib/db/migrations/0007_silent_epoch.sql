ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "customer_clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "customer_ownership_source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "customer_claimed_at" timestamp with time zone;