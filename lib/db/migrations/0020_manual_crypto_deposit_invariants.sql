DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crypto_asset_networks_deposit_configuration_check'
  ) THEN
    ALTER TABLE "crypto_asset_networks"
      ADD CONSTRAINT "crypto_asset_networks_deposit_configuration_check"
      CHECK (
        NOT "customer_deposits_enabled"
        OR (
          btrim("shared_deposit_address") <> ''
          AND (
            NOT "requires_memo"
            OR btrim(COALESCE("shared_deposit_memo", '')) <> ''
          )
        )
      );
  END IF;
END $$;