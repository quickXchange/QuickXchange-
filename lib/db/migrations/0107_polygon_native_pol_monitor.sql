-- Add only the exact native POL identity to the existing Polygon Mainnet
-- monitor. Native POL has 18 decimals and no token contract address.
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
  18,
  false
FROM blockchain_monitor_networks monitor
JOIN crypto_asset_networks route
  ON route.id = 'pol-polygon'
JOIN crypto_assets asset
  ON asset.id = route.asset_id
WHERE monitor.id = 'monitor-polygon'
  AND monitor.network_code = 'POLYGON'
  AND monitor.adapter_kind = 'evm'
  AND monitor.provider_kind = 'rpc'
  AND lower(monitor.chain_id) = '0x89'
  AND monitor.endpoint_secret_ref = 'POLYGON_MONITOR_RPC_URL'
  AND asset.code = 'POL'
  AND asset.enabled = true
  AND asset.lifecycle = 'active'
  AND route.network_code = 'POLYGON'
  AND route.network_name = 'Polygon PoS'
  AND route.decimals = 18
  AND route.enabled = true
  AND route.lifecycle = 'active'
  AND route.execution_mode = 'manual'
ON CONFLICT (monitor_network_id, asset_network_id) DO UPDATE
SET
  identity_kind = 'native',
  contract_or_mint = NULL,
  decimals = 18,
  enabled = false,
  readiness_proof_fingerprint = NULL,
  readiness_proof_captured_at = NULL,
  updated_at = now();