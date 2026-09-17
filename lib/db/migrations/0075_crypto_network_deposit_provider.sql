ALTER TABLE "crypto_asset_networks"
  ADD COLUMN IF NOT EXISTS "deposit_provider" text NOT NULL DEFAULT 'manual';