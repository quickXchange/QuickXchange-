-- Operational ownership is deliberately nullable: existing orders remain
-- unassigned and archiving never removes the underlying order or its history.
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "assigned_operator_id" uuid;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "archived_by" uuid;