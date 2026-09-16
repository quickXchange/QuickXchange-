ALTER TABLE "crypto_asset_networks" ADD COLUMN IF NOT EXISTS "logo_object_path" text;--> statement-breakpoint
ALTER TABLE "crypto_assets" ADD COLUMN IF NOT EXISTS "logo_object_path" text;--> statement-breakpoint
ALTER TABLE "fiat_currencies" ADD COLUMN IF NOT EXISTS "flag_object_path" text;