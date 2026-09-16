ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "provider_claimed_deposit_amount" numeric;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "provider_expected_receive_amount" numeric;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "provider_paid_amount" numeric;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "provider_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "provider_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "provider_completed" boolean;