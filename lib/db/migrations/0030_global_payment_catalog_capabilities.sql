ALTER TABLE "fiat_currencies"
  ADD COLUMN IF NOT EXISTS "lifecycle" text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "countries" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_methods"
  ADD COLUMN IF NOT EXISTS "family" text DEFAULT 'bank-transfer' NOT NULL,
  ADD COLUMN IF NOT EXISTS "execution_mode" text DEFAULT 'manual' NOT NULL,
  ADD COLUMN IF NOT EXISTS "provider_id" text,
  ADD COLUMN IF NOT EXISTS "lifecycle" text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "requires_provider_configuration" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiat_currency_payment_methods"
  ADD COLUMN IF NOT EXISTS "min_amount" numeric(38, 18),
  ADD COLUMN IF NOT EXISTS "max_amount" numeric(38, 18),
  ADD COLUMN IF NOT EXISTS "countries" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "crypto_assets"
  ADD COLUMN IF NOT EXISTS "lifecycle" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "crypto_asset_networks"
  ADD COLUMN IF NOT EXISTS "network_family" text DEFAULT 'native' NOT NULL,
  ADD COLUMN IF NOT EXISTS "execution_mode" text DEFAULT 'manual' NOT NULL,
  ADD COLUMN IF NOT EXISTS "lifecycle" text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "regions" jsonb DEFAULT '[]'::jsonb NOT NULL;