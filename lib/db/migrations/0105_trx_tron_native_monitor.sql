-- Add the exact native TRX identity to the existing TRON indexer monitor.
-- Native TRX has 6 decimals and deliberately has no token contract address.
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
  'native',
  NULL,
  6,
  false
FROM blockchain_monitor_networks monitor
JOIN crypto_asset_networks route
  ON route.id = 'trx-tron'
JOIN crypto_assets asset
  ON asset.id = route.asset_id
WHERE monitor.id = 'monitor-trc20'
  AND monitor.network_code = 'TRC20'
  AND monitor.adapter_kind = 'tron'
  AND monitor.provider_kind = 'indexer'
  AND monitor.endpoint_secret_ref = 'TRON_MONITOR_API_URL'
  AND asset.code = 'TRX'
  AND asset.enabled = true
  AND asset.lifecycle = 'active'
  AND route.network_code = 'TRC20'
  AND route.network_name = 'Tron'
  AND route.decimals = 6
  AND route.enabled = true
  AND route.lifecycle = 'active'
  AND route.execution_mode = 'manual'
  AND route.deposit_provider = 'manual'
ON CONFLICT (monitor_network_id, asset_network_id) DO UPDATE
SET
  identity_kind = 'native',
  contract_or_mint = NULL,
  decimals = 6,
  enabled = false,
  readiness_proof_fingerprint = NULL,
  readiness_proof_captured_at = NULL,
  updated_at = now();