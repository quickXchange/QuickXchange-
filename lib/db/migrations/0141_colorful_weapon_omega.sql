ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "order_source" text;--> statement-breakpoint
ALTER TABLE "quickex_orders" ADD COLUMN IF NOT EXISTS "order_source" text;