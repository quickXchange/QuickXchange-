UPDATE blockchain_monitor_networks AS monitor
SET
  chain_id = '0x89',
  endpoint_secret_ref = 'POLYGON_MONITOR_RPC_URL'
WHERE monitor.id = 'mon-polygon'
  AND monitor.network_code = 'POLYGON'
  AND monitor.adapter_kind = 'evm'
  AND monitor.provider_kind = 'rpc'
  AND monitor.enabled = true
  AND monitor.chain_id IS NULL
  AND monitor.endpoint_secret_ref IS NULL
  AND monitor.api_key_secret_ref IS NULL
  AND EXISTS (
    SELECT 1
    FROM blockchain_monitor_assets identity
    WHERE identity.monitor_network_id = monitor.id
      AND identity.asset_network_id = 'pol-polygon'
      AND identity.identity_kind = 'native'
      AND identity.contract_or_mint IS NULL
      AND identity.decimals = 18
      AND identity.enabled = true
  )
  AND EXISTS (
    SELECT 1
    FROM crypto_asset_networks route
    WHERE route.id = 'pol-polygon'
      AND route.network_code = 'POLYGON'
      AND route.decimals = 18
      AND route.enabled = true
      AND route.lifecycle = 'active'
      AND route.shared_deposit_address =
        '0x961fFd69412BdD402B8a63FC67D5d7f1A105abDb'
      AND route.customer_deposits_enabled = false
  );