INSERT INTO "fiat_currencies"
  ("id", "code", "name", "network", "precision", "enabled")
VALUES
  ('00000000-0000-4000-8000-000000000005', 'DZD', 'Algerian Dinar', 'BaridiMob', 2, true),
  ('00000000-0000-4000-8000-000000000006', 'KZT', 'Kazakhstani Tenge', 'Kaspi Bank', 2, true),
  ('00000000-0000-4000-8000-000000000007', 'TRY', 'Turkish Lira', 'Ziraat Bank', 2, true)
ON CONFLICT ("code") DO UPDATE
SET "enabled" = true, "updated_at" = now();
--> statement-breakpoint
UPDATE "fiat_currencies"
SET "enabled" = true, "updated_at" = now()
WHERE "enabled" = false;
--> statement-breakpoint
UPDATE "payment_methods"
SET "enabled" = true, "updated_at" = now()
WHERE "enabled" = false;
--> statement-breakpoint
INSERT INTO "fiat_currency_payment_methods"
  ("fiat_currency_id", "payment_method_id", "enabled", "display_order")
SELECT f."id", p."id", true, p."display_order"
FROM "fiat_currencies" f
JOIN "payment_methods" p
  ON p."id" IN ('perfect-money', 'capitalist', 'payeer', '0', 'w0')
WHERE f."enabled" = true AND p."enabled" = true
ON CONFLICT ("fiat_currency_id", "payment_method_id") DO UPDATE
SET "enabled" = true, "updated_at" = now();
--> statement-breakpoint
INSERT INTO "fiat_currency_payment_methods"
  ("fiat_currency_id", "payment_method_id", "enabled", "display_order")
SELECT f."id", p."id", true, p."display_order"
FROM (
  VALUES
    ('DZD', 'baridi'),
    ('KZT', 'kzt'),
    ('TRY', 'try')
) AS mapping("currency_code", "payment_method_id")
JOIN "fiat_currencies" f ON f."code" = mapping."currency_code"
JOIN "payment_methods" p ON p."id" = mapping."payment_method_id"
WHERE f."enabled" = true AND p."enabled" = true
ON CONFLICT ("fiat_currency_id", "payment_method_id") DO UPDATE
SET "enabled" = true, "updated_at" = now();
--> statement-breakpoint
UPDATE "fiat_currency_payment_methods"
SET "enabled" = true, "updated_at" = now()
WHERE "enabled" = false;
--> statement-breakpoint
UPDATE "crypto_assets"
SET "enabled" = true, "updated_at" = now()
WHERE "enabled" = false;
--> statement-breakpoint
UPDATE "crypto_asset_networks"
SET "enabled" = true, "updated_at" = now()
WHERE "enabled" = false;
--> statement-breakpoint
UPDATE "manual_desk_pricing_rules"
SET "enabled" = true, "updated_at" = now(), "version" = "version" + 1
WHERE "enabled" = false
  AND (
    "source_settlement_option_id" IS NOT NULL
    OR "target_settlement_option_id" IS NOT NULL
    OR (
      "source_asset" IS NULL
      AND "target_asset" IS NULL
      AND "source_network" IS NULL
      AND "target_network" IS NULL
      AND "payment_method" IS NULL
      AND "payout_method" IS NULL
    )
  );
--> statement-breakpoint
INSERT INTO "manual_desk_pricing_rules"
  (
    "name",
    "source_asset",
    "target_asset",
    "source_network",
    "target_network",
    "payment_method",
    "payout_method",
    "source_settlement_option_id",
    "target_settlement_option_id",
    "markup_basis_points",
    "fixed_fee",
    "priority",
    "enabled"
  )
SELECT
  'Global 0.6% fallback',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  60,
  NULL,
  -1000,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM "manual_desk_pricing_rules"
  WHERE "source_asset" IS NULL
    AND "target_asset" IS NULL
    AND "source_network" IS NULL
    AND "target_network" IS NULL
    AND "payment_method" IS NULL
    AND "payout_method" IS NULL
    AND "source_settlement_option_id" IS NULL
    AND "target_settlement_option_id" IS NULL
);