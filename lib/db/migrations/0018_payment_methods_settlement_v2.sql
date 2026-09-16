ALTER TABLE "fiat_currencies" ALTER COLUMN "network" SET DEFAULT 'fiat';
ALTER TABLE "fiat_currencies" ALTER COLUMN "precision" SET DEFAULT 2;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "logo_object_path" text,
  "description" text,
  "instructions" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "can_send" boolean DEFAULT true NOT NULL,
  "can_receive" boolean DEFAULT true NOT NULL,
  "field_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_methods_id_check" CHECK ("id" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fiat_currency_payment_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fiat_currency_id" uuid NOT NULL REFERENCES "fiat_currencies"("id") ON DELETE CASCADE,
  "payment_method_id" text NOT NULL REFERENCES "payment_methods"("id") ON DELETE CASCADE,
  "enabled" boolean DEFAULT true NOT NULL,
  "can_send" boolean,
  "can_receive" boolean,
  "send_instructions" text,
  "receive_instructions" text,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "fiat_currency_payment_methods_currency_method_uidx"
  ON "fiat_currency_payment_methods" ("fiat_currency_id", "payment_method_id");
--> statement-breakpoint
ALTER TABLE "manual_desk_pricing_rules" ADD COLUMN IF NOT EXISTS "source_settlement_option_id" text;
ALTER TABLE "manual_desk_pricing_rules" ADD COLUMN IF NOT EXISTS "target_settlement_option_id" text;
ALTER TABLE "manual_desk_pricing_rules" ADD COLUMN IF NOT EXISTS "min_amount" numeric(38,18);
ALTER TABLE "manual_desk_pricing_rules" ADD COLUMN IF NOT EXISTS "max_amount" numeric(38,18);
ALTER TABLE "manual_desk_pricing_rules" ADD COLUMN IF NOT EXISTS "operator_instructions" text;
ALTER TABLE "manual_desk_pricing_rules" ADD COLUMN IF NOT EXISTS "customer_instructions" text;
ALTER TABLE "manual_desk_pricing_rules" ADD COLUMN IF NOT EXISTS "expected_settlement_minutes" integer;
ALTER TABLE "manual_desk_pricing_rules"
  ADD CONSTRAINT "manual_desk_pricing_amount_range_check"
  CHECK (("min_amount" IS NULL OR "min_amount" > 0)
    AND ("max_amount" IS NULL OR "max_amount" > 0)
    AND ("min_amount" IS NULL OR "max_amount" IS NULL OR "min_amount" <= "max_amount"));
ALTER TABLE "manual_desk_pricing_rules"
  ADD CONSTRAINT "manual_desk_pricing_settlement_minutes_check"
  CHECK ("expected_settlement_minutes" IS NULL OR "expected_settlement_minutes" > 0);
DROP INDEX IF EXISTS "manual_desk_pricing_selector_priority_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "manual_desk_pricing_selector_priority_uidx"
ON "manual_desk_pricing_rules" (
  COALESCE("source_asset", ''), COALESCE("target_asset", ''),
  COALESCE("source_network", ''), COALESCE("target_network", ''),
  COALESCE("payment_method", ''), COALESCE("payout_method", ''),
  COALESCE("source_settlement_option_id", ''),
  COALESCE("target_settlement_option_id", ''),
  "priority"
);
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "source_settlement_option_id" text;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "target_settlement_option_id" text;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "settlement_snapshot" jsonb;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "settlement_details" jsonb;
--> statement-breakpoint
INSERT INTO "payment_methods" ("id", "name", "description", "display_order")
VALUES
  ('perfect-money', 'Perfect Money', 'Perfect Money account transfer', 10),
  ('capitalist', 'Capitalist', 'Capitalist account transfer', 20),
  ('payeer', 'Payeer', 'Payeer account transfer', 30)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "fiat_currency_payment_methods"
  ("fiat_currency_id", "payment_method_id", "enabled", "display_order")
SELECT f."id", p."id", true, p."display_order"
FROM "fiat_currencies" f CROSS JOIN "payment_methods" p
WHERE f."enabled" = true
ON CONFLICT ("fiat_currency_id", "payment_method_id") DO NOTHING;