ALTER TABLE "manual_desk_pricing_rules"
  ADD COLUMN IF NOT EXISTS "source_crypto_asset_id" text
    REFERENCES "crypto_assets"("id") ON DELETE RESTRICT;
ALTER TABLE "manual_desk_pricing_rules"
  ADD COLUMN IF NOT EXISTS "target_crypto_asset_id" text
    REFERENCES "crypto_assets"("id") ON DELETE RESTRICT;

UPDATE "manual_desk_pricing_rules" r
SET "source_crypto_asset_id" = a."id",
    "source_asset" = NULL, "source_network" = NULL,
    "source_settlement_option_id" = NULL
FROM "crypto_assets" a
WHERE upper(r."source_network") = '__ALL_NETWORKS__'
  AND upper(r."source_asset") = upper(a."code")
  AND (SELECT count(*) FROM "crypto_assets" a2
       WHERE upper(a2."code") = upper(r."source_asset")) = 1;
UPDATE "manual_desk_pricing_rules" r
SET "target_crypto_asset_id" = a."id",
    "target_asset" = NULL, "target_network" = NULL,
    "target_settlement_option_id" = NULL
FROM "crypto_assets" a
WHERE upper(r."target_network") = '__ALL_NETWORKS__'
  AND upper(r."target_asset") = upper(a."code")
  AND (SELECT count(*) FROM "crypto_assets" a2
       WHERE upper(a2."code") = upper(r."target_asset")) = 1;

DROP INDEX IF EXISTS "manual_desk_pricing_selector_priority_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "manual_desk_pricing_selector_priority_uidx"
ON "manual_desk_pricing_rules" (
  COALESCE("source_asset", ''), COALESCE("target_asset", ''),
  COALESCE("source_crypto_asset_id", ''), COALESCE("target_crypto_asset_id", ''),
  COALESCE("source_network", ''), COALESCE("target_network", ''),
  COALESCE("payment_method", ''), COALESCE("payout_method", ''),
  COALESCE("source_settlement_option_id", ''), COALESCE("target_settlement_option_id", ''),
  "priority"
);