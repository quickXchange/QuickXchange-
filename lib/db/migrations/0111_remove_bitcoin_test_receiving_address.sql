-- Remove the exact development/test placeholder from the Bitcoin Mainnet route.
-- Never substitute a customer address. Deposits must already be disabled.
UPDATE crypto_asset_networks
SET shared_deposit_address = ''
WHERE id = 'btc-bitcoin'
  AND network_code = 'BTC'
  AND shared_deposit_address = 'fixture-manual-address'
  AND customer_deposits_enabled = false;