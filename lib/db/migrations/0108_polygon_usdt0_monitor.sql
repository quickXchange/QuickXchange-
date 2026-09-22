-- Preserve the legacy Polygon USDT route for historical references, but keep
-- it out of all new customer selections. Its old network code must be released
-- before the replacement route can use the canonical Polygon code because
-- asset/network codes are unique within the catalog.
UPDATE crypto_asset_networks
SET
  network_code = 'POLYGON_LEGACY',
  enabled = false,
  customer_deposits_enabled = false,
  lifecycle = 'deprecated',
  updated_at = now()
WHERE id = 'usdt-polygon'
  AND asset_id = 'usdt';

--> statement-breakpoint

-- The customer-facing asset remains USDT, while the immutable route ID records
-- that Polygon now uses the on-chain USDT0 identity.
INSERT INTO crypto_asset_networks (
  id,
  asset_id,
  network_code,
  network_name,
  decimals,
  enabled,
  customer_deposits_enabled,
  requires_memo,
  required_confirmations,
  confirmation_guidance,
  explorer_url_template,
  deposit_warning,
  network_family,
  execution_mode,
  lifecycle,
  regions,
  deposit_provider
)
SELECT
  'usdt0-polygon',
  asset.id,
  'POLYGON',
  'Polygon',
  6,
  true,
  false,
  false,
  128,
  'Wait for at least 128 Polygon confirmations.',
  'https://polygonscan.com/tx/{txid}',
  'Deposits are unavailable until an operator configures this route.',
  'native',
  'manual',
  'active',
  '[]'::jsonb,
  'manual'
FROM crypto_assets asset
WHERE asset.id = 'usdt'
  AND asset.code = 'USDT'
  AND asset.enabled = true
  AND asset.lifecycle = 'active'
ON CONFLICT (id) DO UPDATE
SET
  asset_id = EXCLUDED.asset_id,
  network_code = EXCLUDED.network_code,
  network_name = EXCLUDED.network_name,
  decimals = EXCLUDED.decimals,
  enabled = EXCLUDED.enabled,
  customer_deposits_enabled = false,
  requires_memo = EXCLUDED.requires_memo,
  required_confirmations = EXCLUDED.required_confirmations,
  confirmation_guidance = EXCLUDED.confirmation_guidance,
  explorer_url_template = EXCLUDED.explorer_url_template,
  deposit_warning = EXCLUDED.deposit_warning,
  network_family = EXCLUDED.network_family,
  execution_mode = EXCLUDED.execution_mode,
  lifecycle = EXCLUDED.lifecycle,
  regions = EXCLUDED.regions,
  deposit_provider = EXCLUDED.deposit_provider,
  updated_at = now();

--> statement-breakpoint

-- Keep the exact USDT0 contract identity disabled until an operator separately
-- enables monitoring after readiness proofs and receiving-wallet validation.
INSERT INTO blockchain_monitor_assets (
  monitor_network_id,
  asset_network_id,
  identity_kind,
  contract_or_mint,
  decimals,
  enabled
)
SELECT
  monitor.id,
  route.id,
  'token',
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
  6,
  false
FROM blockchain_monitor_networks monitor
JOIN crypto_asset_networks route
  ON route.id = 'usdt0-polygon'
JOIN crypto_assets asset
  ON asset.id = route.asset_id
WHERE monitor.id = 'monitor-polygon'
  AND monitor.network_code = 'POLYGON'
  AND monitor.adapter_kind = 'evm'
  AND monitor.provider_kind = 'rpc'
  AND lower(monitor.chain_id) = '0x89'
  AND monitor.endpoint_secret_ref = 'POLYGON_MONITOR_RPC_URL'
  AND monitor.enabled = false
  AND asset.id = 'usdt'
  AND asset.code = 'USDT'
  AND route.network_code = 'POLYGON'
  AND route.network_name = 'Polygon'
  AND route.decimals = 6
  AND route.enabled = true
  AND route.customer_deposits_enabled = false
  AND route.execution_mode = 'manual'
  AND route.deposit_provider = 'manual'
  AND route.lifecycle = 'active'
ON CONFLICT (monitor_network_id, asset_network_id) DO UPDATE
SET
  identity_kind = 'token',
  contract_or_mint = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
  decimals = 6,
  enabled = false,
  readiness_proof_fingerprint = NULL,
  readiness_proof_captured_at = NULL,
  updated_at = now();