ALTER TABLE "crypto_asset_networks"
  ADD COLUMN IF NOT EXISTS "manual_wallet_tracking_enabled" boolean NOT NULL DEFAULT true;