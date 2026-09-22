ALTER TABLE blockchain_monitor_networks
  ADD COLUMN IF NOT EXISTS health_proof_fingerprint text,
  ADD COLUMN IF NOT EXISTS health_proof_captured_at timestamptz;

ALTER TABLE blockchain_monitor_assets
  ADD COLUMN IF NOT EXISTS readiness_proof_fingerprint text,
  ADD COLUMN IF NOT EXISTS readiness_proof_captured_at timestamptz;

-- Non-BEP20 manual routes must earn a fresh exact-route proof after this
-- migration. Clear legacy flags so catalog state agrees with runtime gating.
UPDATE crypto_asset_networks
SET customer_deposits_enabled = false
WHERE deposit_provider = 'manual'
  AND upper(network_code) NOT IN ('BSC', 'BEP20', 'BSC_BEP20');