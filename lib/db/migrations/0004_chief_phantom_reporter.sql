ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "rate_mode" text DEFAULT '' NOT NULL;
UPDATE "exchange_orders"
SET "rate_mode" = 'FLOATING'
WHERE "rate_mode" = '' AND "provider" = 'Quickex';