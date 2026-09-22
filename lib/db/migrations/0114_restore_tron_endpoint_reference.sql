UPDATE blockchain_monitor_networks
SET endpoint_secret_ref = 'TRON_MONITOR_API_URL'
WHERE network_code = 'TRC20'
  AND id IN ('monitor-trc20', 'mon-trc20')
  AND endpoint_secret_ref IS NULL;