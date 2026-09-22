-- Canonical Ethereum Mainnet monitor. The endpoint is supplied only through
-- Replit Secrets; no private RPC URL or API key is stored in the database.
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
  health_status,
  health_error
)
VALUES (
  'monitor-ethereum-mainnet',
  'ERC20',
  'Ethereum Mainnet',
  'evm',
  '0x1',
  'rpc',
  true,
  'ETHEREUM_MONITOR_RPC_URL',
  NULL,
  12,
  'confirmations',
  15,
  'not_configured',
  'ETHEREUM_MONITOR_RPC_URL is not configured.'
)
ON CONFLICT (network_code) DO UPDATE
SET
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
  health_status = 'not_configured',
  health_checked_at = NULL,
  health_error = EXCLUDED.health_error,
  health_proof_fingerprint = NULL,
  health_proof_captured_at = NULL,
  updated_at = now();
--> statement-breakpoint
-- Exact identities verified for Ethereum Mainnet only:
-- ETH is native (18 decimals).
-- USDT: 0xdAC17F958D2ee523a2206206994597C13D831ec7 (6 decimals).
-- USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 (6 decimals).
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
  configured.asset_network_id,
  configured.identity_kind,
  configured.contract_or_mint,
  configured.decimals,
  false
FROM (
  VALUES
    ('eth-ethereum', 'native', NULL::text, 18),
    ('usdt-erc20', 'token', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6),
    ('usdc-erc20', 'token', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6)
) AS configured(asset_network_id, identity_kind, contract_or_mint, decimals)
JOIN blockchain_monitor_networks monitor
  ON monitor.network_code = 'ERC20'
JOIN crypto_asset_networks route
  ON route.id = configured.asset_network_id
 AND route.network_code = 'ERC20'
 AND route.decimals = configured.decimals
ON CONFLICT (monitor_network_id, asset_network_id) DO UPDATE
SET
  identity_kind = EXCLUDED.identity_kind,
  contract_or_mint = EXCLUDED.contract_or_mint,
  decimals = EXCLUDED.decimals,
  enabled = false,
  readiness_proof_fingerprint = NULL,
  readiness_proof_captured_at = NULL,
  updated_at = now();
--> statement-breakpoint
UPDATE crypto_asset_networks
SET customer_deposits_enabled = false
WHERE id IN ('eth-ethereum', 'usdt-erc20', 'usdc-erc20');