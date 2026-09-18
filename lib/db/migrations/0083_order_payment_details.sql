ALTER TABLE "exchange_orders"
  ADD COLUMN IF NOT EXISTS "payment_details" jsonb;
ALTER TABLE "exchange_orders"
  ADD COLUMN IF NOT EXISTS "customer_marked_paid_at" timestamptz;