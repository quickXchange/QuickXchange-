DROP INDEX IF EXISTS "crypto_assets_enabled_display_order_idx";
DROP INDEX IF EXISTS "crypto_asset_networks_asset_display_order_idx";
DROP INDEX IF EXISTS "site_nav_links_placement_order_idx";
DROP INDEX IF EXISTS "site_partner_logos_enabled_order_idx";
DROP INDEX IF EXISTS "site_social_trust_links_group_order_idx";
DROP INDEX IF EXISTS "blog_categories_enabled_order_idx";

ALTER TABLE "payment_methods" DROP COLUMN IF EXISTS "display_order";
ALTER TABLE "fiat_currency_payment_methods" DROP COLUMN IF EXISTS "display_order";
ALTER TABLE "crypto_assets" DROP COLUMN IF EXISTS "display_order";
ALTER TABLE "crypto_asset_networks" DROP COLUMN IF EXISTS "display_order";
ALTER TABLE "site_nav_links" DROP COLUMN IF EXISTS "sort_order";
ALTER TABLE "site_partner_logos" DROP COLUMN IF EXISTS "sort_order";
ALTER TABLE "site_social_trust_links" DROP COLUMN IF EXISTS "sort_order";
ALTER TABLE "blog_categories" DROP COLUMN IF EXISTS "sort_order";