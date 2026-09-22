-- Alchemy's BNB Smart Chain Free tier accepts eth_getLogs over at most
-- 10 inclusive blocks. Keep existing identities, watches, and cursors intact.
UPDATE blockchain_monitor_networks
SET
  endpoint_secret_ref = 'BSC_MONITOR_RPC_URL_V2',
  max_scan_range = 9,
  health_status = 'not_configured',
  health_checked_at = NULL,
  health_error = 'BSC RPC capabilities must be revalidated.',
  health_proof_fingerprint = NULL,
  health_proof_captured_at = NULL,
  consecutive_failures = 0,
  next_attempt_at = NULL,
  lease_token = NULL,
  lease_expires_at = NULL,
  updated_at = now()
WHERE network_code = 'BEP20'
  AND adapter_kind = 'evm'
  AND provider_kind = 'rpc'
  AND enabled = true
  AND lower(chain_id) = '0x38'
  AND endpoint_secret_ref IN (
    'BSC_MONITOR_RPC_URL',
    'BSC_MONITOR_RPC_URL_V2'
  )
  AND (
    endpoint_secret_ref IS DISTINCT FROM 'BSC_MONITOR_RPC_URL_V2'
    OR max_scan_range IS DISTINCT FROM 9
  );