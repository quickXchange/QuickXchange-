-- Bitcoin monitoring is deliberately provisioned disabled. This migration
-- does not enable the existing customer-facing BTC route or create watches.
INSERT INTO blockchain_monitor_networks (
  id, network_code, network_name, adapter_kind, chain_id, provider_kind,
  enabled, endpoint_secret_ref, confirmations_required, finality_policy,
  poll_interval_seconds, max_scan_range
)
VALUES (
  'monitor-bitcoin', 'BTC', 'Bitcoin Mainnet', 'bitcoin', 'main', 'rpc',
  false, 'BITCOIN_MONITOR_RPC_URL', 1, 'confirmations', 15, 8
)
ON CONFLICT (id) DO UPDATE SET
  network_code = EXCLUDED.network_code,
  network_name = EXCLUDED.network_name,
  adapter_kind = EXCLUDED.adapter_kind,
  chain_id = EXCLUDED.chain_id,
  provider_kind = EXCLUDED.provider_kind,
  enabled = false,
  endpoint_secret_ref = EXCLUDED.endpoint_secret_ref,
  confirmations_required = EXCLUDED.confirmations_required,
  finality_policy = EXCLUDED.finality_policy,
  poll_interval_seconds = EXCLUDED.poll_interval_seconds,
  max_scan_range = EXCLUDED.max_scan_range,
  updated_at = now();

INSERT INTO blockchain_monitor_assets (
  monitor_network_id, asset_network_id, identity_kind, contract_or_mint,
  decimals, enabled
)
SELECT monitor.id, route.id, 'native', NULL, 8, false
FROM blockchain_monitor_networks monitor
JOIN crypto_asset_networks route ON route.id = 'btc-bitcoin'
JOIN crypto_assets asset ON asset.id = route.asset_id
WHERE monitor.id = 'monitor-bitcoin'
  AND monitor.network_code = 'BTC'
  AND monitor.adapter_kind = 'bitcoin'
  AND monitor.provider_kind = 'rpc'
  AND monitor.endpoint_secret_ref = 'BITCOIN_MONITOR_RPC_URL'
  AND asset.code = 'BTC'
  AND asset.enabled = true
  AND asset.lifecycle = 'active'
  AND route.network_code = 'BTC'
  AND route.network_name = 'Bitcoin'
  AND route.network_family = 'native'
  AND route.decimals = 8
  AND route.enabled = true
  AND route.customer_deposits_enabled = false
  AND route.execution_mode = 'manual'
  AND route.lifecycle = 'active'
ON CONFLICT (monitor_network_id, asset_network_id) DO UPDATE SET
  identity_kind = 'native',
  contract_or_mint = NULL,
  decimals = 8,
  enabled = false,
  readiness_proof_fingerprint = NULL,
  readiness_proof_captured_at = NULL,
  updated_at = now();