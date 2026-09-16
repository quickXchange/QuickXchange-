UPDATE "crypto_asset_networks"
SET "enabled" = false, "updated_at" = now()
WHERE "id" = 'trx-trx';
--> statement-breakpoint
UPDATE "crypto_assets"
SET "enabled" = false, "updated_at" = now()
WHERE "id" = 'trx';