-- Persist only independently verified BSC Mainnet stablecoin identities.
-- New identities remain disabled; this migration must not activate monitoring
-- or alter customer-deposit, wallet, provider, watch, order, or cursor state.
ALTER TABLE blockchain_monitor_networks
ADD COLUMN IF NOT EXISTS last_successful_scan_at timestamp with time zone;
--> statement-breakpoint
UPDATE blockchain_monitor_networks
SET last_successful_scan_at = health_checked_at
WHERE health_status = 'connected'
  AND health_checked_at IS NOT NULL
  AND last_successful_scan_at IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM blockchain_monitor_networks
    WHERE id = 'monitor-bep20'
      AND network_code = 'BEP20'
      AND adapter_kind = 'evm'
      AND provider_kind = 'rpc'
      AND lower(chain_id) = '0x38'
  ) THEN
    RAISE EXCEPTION 'BSC stablecoin identity migration aborted: exact BSC Mainnet monitor not found';
  END IF;
END $$;
--> statement-breakpoint
-- The catalog rows were seeded with six decimals, but both verified BSC
-- contracts return 18 from decimals(). Correct only these exact routes before
-- attaching monitoring identities; immutable order snapshots are untouched.
UPDATE crypto_asset_networks
SET decimals = 18
WHERE id IN ('usdt-bep20', 'usdc-bep20')
  AND network_code = 'BEP20'
  AND decimals IN (6, 18);
--> statement-breakpoint
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM crypto_asset_networks
    WHERE id IN ('usdt-bep20', 'usdc-bep20')
      AND network_code = 'BEP20'
      AND decimals = 18
  ) <> 2 THEN
    RAISE EXCEPTION 'BSC stablecoin identity migration aborted: exact routes do not match verified on-chain decimals';
  END IF;
END $$;
--> statement-breakpoint
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
  'token',
  verified.contract,
  18,
  false
FROM (
  VALUES
    ('usdt-bep20', 'USDT', '0x55d398326f99059ff775485246999027b3197955'),
    ('usdc-bep20', 'USDC', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d')
) AS verified(route_id, asset_code, contract)
JOIN blockchain_monitor_networks monitor
  ON monitor.id = 'monitor-bep20'
JOIN crypto_asset_networks route
  ON route.id = verified.route_id
WHERE monitor.network_code = 'BEP20'
  AND monitor.adapter_kind = 'evm'
  AND monitor.provider_kind = 'rpc'
  AND lower(monitor.chain_id) = '0x38'
  AND route.network_code = 'BEP20'
  AND route.decimals = 18
ON CONFLICT (monitor_network_id, asset_network_id) DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM blockchain_monitor_assets identity
    WHERE identity.monitor_network_id = 'monitor-bep20'
      AND (
        (
          identity.asset_network_id = 'usdt-bep20'
          AND identity.identity_kind = 'token'
          AND lower(identity.contract_or_mint) = '0x55d398326f99059ff775485246999027b3197955'
          AND identity.decimals = 18
        )
        OR
        (
          identity.asset_network_id = 'usdc-bep20'
          AND identity.identity_kind = 'token'
          AND lower(identity.contract_or_mint) = '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'
          AND identity.decimals = 18
        )
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'BSC stablecoin identity migration aborted: exact verified identities were not preserved';
  END IF;
END $$;