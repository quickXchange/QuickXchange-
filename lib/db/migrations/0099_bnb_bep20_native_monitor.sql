-- Configure only the exact BNB/BEP20 native identity on the existing,
-- production-tested BSC monitor. Never infer or alter sibling token identities.
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
  true
FROM blockchain_monitor_networks monitor
JOIN crypto_asset_networks route
  ON route.id = 'bnb-bep20'
JOIN crypto_assets asset
  ON asset.id = route.asset_id
WHERE monitor.network_code = 'BEP20'
  AND monitor.adapter_kind = 'evm'
  AND monitor.provider_kind = 'rpc'
  AND monitor.enabled = true
  AND lower(monitor.chain_id) = '0x38'
  AND monitor.endpoint_secret_ref = 'BSC_MONITOR_RPC_URL'
  AND monitor.finality_policy = 'confirmations'
  AND asset.code = 'BNB'
  AND asset.enabled = true
  AND asset.lifecycle = 'active'
  AND route.enabled = true
  AND route.lifecycle = 'active'
  AND route.execution_mode = 'manual'
  AND route.deposit_provider = 'manual'
  AND route.network_code = 'BEP20'
  AND route.decimals = 18
ON CONFLICT (monitor_network_id, asset_network_id) DO UPDATE
SET
  identity_kind = 'native',
  contract_or_mint = NULL,
  decimals = 18,
  enabled = true,
  updated_at = now()
WHERE blockchain_monitor_assets.identity_kind = 'native'
  AND blockchain_monitor_assets.contract_or_mint IS NULL;