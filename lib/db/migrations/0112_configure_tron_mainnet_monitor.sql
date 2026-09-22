-- Keep both TRON routes unavailable to customers while the newly configured
-- monitor establishes a provider health proof and exact-route readiness proofs.
UPDATE crypto_asset_networks
SET
  customer_deposits_enabled = false,
  updated_at = now()
WHERE id IN ('trx-tron', 'usdt-trc20')
  AND customer_deposits_enabled = true;
--> statement-breakpoint
INSERT INTO blockchain_monitor_networks (
  id,
  network_code,
  network_name,
  adapter_kind,
  chain_id,
  provider_kind,
  enabled,
  endpoint_secret_ref,
  api_key_secret_ref,
  confirmations_required,
  finality_policy,
  poll_interval_seconds,
  max_scan_range,
  health_status,
  health_checked_at,
  health_error,
  consecutive_failures,
  health_proof_fingerprint,
  health_proof_captured_at,
  next_attempt_at,
  lease_token,
  lease_expires_at,
  updated_at
)
VALUES (
  'monitor-trc20',
  'TRC20',
  'TRON Mainnet',
  'tron',
  '0x2b6653dc',
  'indexer',
  true,
  'TRON_MONITOR_API_URL',
  NULL,
  19,
  'confirmations',
  15,
  1000,
  'not_configured',
  NULL,
  NULL,
  0,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  network_code = EXCLUDED.network_code,
  network_name = EXCLUDED.network_name,
  adapter_kind = EXCLUDED.adapter_kind,
  chain_id = EXCLUDED.chain_id,
  provider_kind = EXCLUDED.provider_kind,
  enabled = EXCLUDED.enabled,
  endpoint_secret_ref = EXCLUDED.endpoint_secret_ref,
  api_key_secret_ref = EXCLUDED.api_key_secret_ref,
  confirmations_required = EXCLUDED.confirmations_required,
  finality_policy = EXCLUDED.finality_policy,
  poll_interval_seconds = EXCLUDED.poll_interval_seconds,
  max_scan_range = EXCLUDED.max_scan_range,
  health_status = 'not_configured',
  health_checked_at = NULL,
  health_error = NULL,
  consecutive_failures = 0,
  health_proof_fingerprint = NULL,
  health_proof_captured_at = NULL,
  next_attempt_at = NULL,
  lease_token = NULL,
  lease_expires_at = NULL,
  updated_at = now();
--> statement-breakpoint
UPDATE blockchain_monitor_assets
SET
  enabled = false,
  readiness_proof_fingerprint = NULL,
  readiness_proof_captured_at = NULL,
  updated_at = now()
WHERE monitor_network_id = 'monitor-trc20'
  AND asset_network_id IN ('trx-tron', 'usdt-trc20');
--> statement-breakpoint
INSERT INTO blockchain_monitor_assets (
  monitor_network_id,
  asset_network_id,
  identity_kind,
  contract_or_mint,
  decimals,
  enabled,
  readiness_proof_fingerprint,
  readiness_proof_captured_at,
  updated_at
)
SELECT
  'monitor-trc20',
  configured.asset_network_id,
  configured.identity_kind,
  configured.contract_or_mint,
  6,
  true,
  NULL,
  NULL,
  now()
FROM (
  VALUES
    ('trx-tron', 'native', NULL::text),
    ('usdt-trc20', 'token', '41a614f803b6fd780986a42c78ec9c7f77e6ded13c')
) AS configured(asset_network_id, identity_kind, contract_or_mint)
JOIN crypto_asset_networks route
  ON route.id = configured.asset_network_id
 AND route.network_code = 'TRC20'
 AND route.decimals = 6
 AND route.enabled = true
 AND route.lifecycle = 'active'
 AND route.shared_deposit_address = 'TBLc145ZDNs4LjPqQtuvqkEDjhesemTosd'
JOIN crypto_assets asset
  ON asset.id = route.asset_id
 AND asset.enabled = true
 AND asset.lifecycle = 'active'
ON CONFLICT (monitor_network_id, asset_network_id) DO UPDATE
SET
  identity_kind = EXCLUDED.identity_kind,
  contract_or_mint = EXCLUDED.contract_or_mint,
  decimals = EXCLUDED.decimals,
  enabled = true,
  readiness_proof_fingerprint = NULL,
  readiness_proof_captured_at = NULL,
  updated_at = now();