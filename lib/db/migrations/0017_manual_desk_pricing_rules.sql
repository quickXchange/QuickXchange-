CREATE TABLE IF NOT EXISTS "manual_desk_pricing_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "source_asset" text,
  "target_asset" text,
  "source_network" text,
  "target_network" text,
  "payment_method" text,
  "payout_method" text,
  "markup_basis_points" integer NOT NULL,
  "fixed_fee" numeric(38,18),
  "priority" integer DEFAULT 0 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "manual_desk_pricing_markup_check" CHECK ("markup_basis_points" >= 0 AND "markup_basis_points" <= 10000),
  CONSTRAINT "manual_desk_pricing_fixed_fee_check" CHECK ("fixed_fee" IS NULL OR "fixed_fee" >= 0),
  CONSTRAINT "manual_desk_pricing_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "manual_desk_pricing_selector_priority_uidx"
ON "manual_desk_pricing_rules" (
  COALESCE("source_asset", ''), COALESCE("target_asset", ''),
  COALESCE("source_network", ''), COALESCE("target_network", ''),
  COALESCE("payment_method", ''), COALESCE("payout_method", ''), "priority"
);
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "pricing_rule_id" uuid;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "pricing_rule_version" integer;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "pricing_rule_name" text DEFAULT '' NOT NULL;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "gross_market_amount" numeric;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "percentage_commission" numeric;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "fixed_commission" numeric;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "total_commission" numeric;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "final_rate" numeric;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "pricing_snapshot" jsonb;
--> statement-breakpoint
INSERT INTO "manual_desk_pricing_rules" (
  "id", "name", "markup_basis_points", "fixed_fee", "priority", "enabled", "version"
) VALUES (
  '00000000-0000-4000-8000-000000000035',
  'Global 0.6% fallback', 60, NULL, -1000, true, 1
)
ON CONFLICT DO NOTHING;