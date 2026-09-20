-- Configure only blockchain families supported by the existing Manual Swap
-- monitoring adapters. Public endpoint values remain environment variables;
-- token identities below come from Circle and Tether's official mainnet lists.
INSERT INTO "blockchain_monitor_networks" (
  "id",
  "network_code",
  "network_name",
  "adapter_kind",
  "chain_id",
  "provider_kind",
  "enabled",
  "endpoint_secret_ref",
  "confirmations_required",
  "finality_policy",
  "poll_interval_seconds"
)
VALUES
  ('monitor-arbitrum', 'ARBITRUM', 'Arbitrum One', 'evm', '0xa4b1', 'rpc', false, 'ARBITRUM_MONITOR_RPC_URL', 1, 'confirmations', 15),
  ('monitor-avaxc', 'AVAXC', 'Avalanche C-Chain', 'evm', '0xa86a', 'rpc', false, 'AVAXC_MONITOR_RPC_URL', 1, 'confirmations', 15),
  ('monitor-base', 'BASE', 'Base', 'evm', '0x2105', 'rpc', false, 'BASE_MONITOR_RPC_URL', 1, 'confirmations', 15),
  ('monitor-polygon', 'POLYGON', 'Polygon PoS', 'evm', '0x89', 'rpc', false, 'POLYGON_MONITOR_RPC_URL', 128, 'confirmations', 15),
  ('monitor-spl', 'SPL', 'Solana', 'solana', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'rpc', false, 'SOLANA_MONITOR_RPC_URL', 0, 'finalized', 15),
  ('monitor-trc20', 'TRC20', 'Tron', 'tron', null, 'indexer', false, 'TRON_MONITOR_API_URL', 19, 'confirmations', 15)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "blockchain_monitor_assets" (
  "monitor_network_id",
  "asset_network_id",
  "identity_kind",
  "contract_or_mint",
  "decimals",
  "enabled"
)
SELECT
  configured."monitor_network_id",
  configured."asset_network_id",
  'token',
  configured."contract_or_mint",
  configured."decimals",
  false
FROM (
  VALUES
    ('monitor-arbitrum', 'usdc-arbitrum', '0xaf88d065e77c8cc2239327c5edb3a432268e5831', 6),
    ('monitor-avaxc', 'usdt-avalanche-c', '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', 6),
    ('monitor-base', 'usdc-base', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6),
    ('monitor-polygon', 'usdc-polygon', '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', 6),
    ('monitor-spl', 'usdc-solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6),
    ('monitor-spl', 'usdt-solana', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 6),
    ('monitor-trc20', 'usdt-trc20', '41a614f803b6fd780986a42c78ec9c7f77e6ded13c', 6)
) AS configured("monitor_network_id", "asset_network_id", "contract_or_mint", "decimals")
JOIN "blockchain_monitor_networks" networks
  ON networks."id" = configured."monitor_network_id"
JOIN "crypto_asset_networks" routes
  ON routes."id" = configured."asset_network_id"
 AND routes."execution_mode" = 'manual'
 AND routes."deposit_provider" = 'manual'
ON CONFLICT ("monitor_network_id", "asset_network_id") DO NOTHING;