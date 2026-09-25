ALTER TABLE "crypto_asset_networks"
  ADD COLUMN IF NOT EXISTS "manual_fallback_enabled" boolean NOT NULL DEFAULT false;