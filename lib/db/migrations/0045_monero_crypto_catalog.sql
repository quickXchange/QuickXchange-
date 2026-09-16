-- Add Monero to the shared manual crypto catalog. Existing rows are operator
-- managed, so rerunning this migration must never change their configuration.
INSERT INTO "crypto_assets"
  ("id", "code", "name", "decimals", "lifecycle", "enabled", "display_order")
VALUES
  ('xmr', 'XMR', 'Monero', 12, 'active', true, 190)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "crypto_asset_networks"
  (
    "id", "asset_id", "network_code", "network_name", "network_family",
    "decimals", "execution_mode", "lifecycle", "regions", "enabled",
    "customer_deposits_enabled", "display_order", "requires_memo",
    "required_confirmations", "deposit_warning", "shared_deposit_address"
  )
VALUES
  (
    'xmr-monero', 'xmr', 'XMR', 'Monero', 'xmr', 12, 'manual', 'active',
    '[]'::jsonb, true, false, 320, false, 10,
    'Deposits are unavailable until an operator configures this route.', ''
  )
ON CONFLICT ("id") DO NOTHING;