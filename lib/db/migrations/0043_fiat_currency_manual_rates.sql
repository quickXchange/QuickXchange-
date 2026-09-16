ALTER TABLE "fiat_currencies" ADD COLUMN IF NOT EXISTS "rate_mode" text DEFAULT 'automatic' NOT NULL;
ALTER TABLE "fiat_currencies" ADD COLUMN IF NOT EXISTS "manual_rate" text;