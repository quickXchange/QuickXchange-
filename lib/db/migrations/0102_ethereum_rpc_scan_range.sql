ALTER TABLE blockchain_monitor_networks
  ADD COLUMN IF NOT EXISTS max_scan_range integer NOT NULL DEFAULT 1000;
--> statement-breakpoint
ALTER TABLE blockchain_monitor_networks
  DROP CONSTRAINT IF EXISTS blockchain_monitor_networks_max_scan_range_check;
--> statement-breakpoint
ALTER TABLE blockchain_monitor_networks
  ADD CONSTRAINT blockchain_monitor_networks_max_scan_range_check
  CHECK (max_scan_range BETWEEN 0 AND 10000);
--> statement-breakpoint
-- The configured Ethereum provider accepts eth_getLogs for at most ten
-- inclusive blocks. An offset of nine keeps every request within that limit.
UPDATE blockchain_monitor_networks
SET
  max_scan_range = 9,
  health_status = 'not_configured',
  health_checked_at = NULL,
  health_error = 'Ethereum RPC capabilities must be revalidated.',
  health_proof_fingerprint = NULL,
  health_proof_captured_at = NULL,
  updated_at = now()
WHERE network_code = 'ERC20';