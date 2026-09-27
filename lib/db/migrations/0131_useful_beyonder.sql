ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "sending_payment_method_label" text;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "receiving_payment_method_label" text;