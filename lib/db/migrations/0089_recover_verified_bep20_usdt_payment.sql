-- One-time recovery for the production Telegram Manual Swap whose watch could
-- not be registered because BEP20 monitoring was absent. The order itself is
-- never updated here. The regular monitoring worker must freshly revalidate
-- this confirming match's receipt, canonical block, and confirmations before
-- applying it and enqueueing the existing exactly-once Telegram notification.
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
SELECT
  'monitor-bep20',
  'BEP20',
  'BNB Smart Chain',
  'evm',
  '0x38',
  'rpc',
  true,
  'BSC_MONITOR_RPC_URL',
  15,
  'confirmations',
  15
WHERE EXISTS (
  SELECT 1 FROM "exchange_orders" WHERE "id" = 'O181633094'
)
ON CONFLICT ("network_code") DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "exchange_orders" WHERE "id" = 'O181633094'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "blockchain_monitor_networks"
    WHERE "network_code" = 'BEP20'
      AND "adapter_kind" = 'evm'
      AND lower("chain_id") = '0x38'
      AND "provider_kind" = 'rpc'
      AND "enabled" = true
      AND "endpoint_secret_ref" = 'BSC_MONITOR_RPC_URL'
      AND "confirmations_required" = 15
      AND "finality_policy" = 'confirmations'
  ) THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: incompatible monitoring network configuration';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "blockchain_monitor_assets" (
  "id",
  "monitor_network_id",
  "asset_network_id",
  "identity_kind",
  "contract_or_mint",
  "decimals",
  "enabled"
)
SELECT
  '8f1a05c3-c273-4a17-a34d-7a8e8627338c'::uuid,
  "id",
  'usdt-bep20',
  'token',
  '0x55d398326f99059ff775485246999027b3197955',
  18,
  false
FROM "blockchain_monitor_networks"
WHERE "network_code" = 'BEP20'
  AND EXISTS (
    SELECT 1 FROM "exchange_orders" WHERE "id" = 'O181633094'
  )
ON CONFLICT ("monitor_network_id", "asset_network_id") DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "exchange_orders" WHERE "id" = 'O181633094'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "blockchain_monitor_assets" assets
    JOIN "blockchain_monitor_networks" networks
      ON networks."id" = assets."monitor_network_id"
    WHERE networks."network_code" = 'BEP20'
      AND assets."asset_network_id" = 'usdt-bep20'
      AND assets."identity_kind" = 'token'
      AND lower(assets."contract_or_mint") = '0x55d398326f99059ff775485246999027b3197955'
      AND assets."decimals" = 18
  ) THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: incompatible USDT monitor identity';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "blockchain_monitor_watches" (
  "order_id",
  "monitor_network_id",
  "monitor_asset_id",
  "asset_network_id",
  "expected_amount",
  "receiving_address",
  "memo_or_tag",
  "identity_kind",
  "contract_or_mint",
  "decimals",
  "order_created_at",
  "registration_state",
  "registration_reason",
  "active"
)
SELECT
  orders."id",
  networks."id",
  assets."id",
  'usdt-bep20',
  orders."amount",
  orders."deposit_address",
  NULL,
  'token',
  '0x55d398326f99059ff775485246999027b3197955',
  18,
  orders."created_at",
  'active',
  'Verified receipt recovery; inactive to prevent unbounded rescanning.',
  false
FROM "exchange_orders" orders
JOIN "blockchain_monitor_networks" networks
  ON networks."network_code" = 'BEP20'
JOIN "blockchain_monitor_assets" assets
  ON assets."monitor_network_id" = networks."id"
 AND assets."asset_network_id" = 'usdt-bep20'
WHERE orders."id" = 'O181633094'
  AND orders."type" = 'manual'
  AND orders."status" = 'awaiting funds'
  AND orders."manual_settlement_state" = 'awaiting_funds'
  AND orders."funding_provider_source" = 'manual'
  AND orders."funding_status" = 'ready_manual'
  AND upper(orders."from_asset") = 'USDT'
  AND upper(orders."from_network") = 'BEP20'
  AND orders."amount" = 10
  AND lower(orders."deposit_address") = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
ON CONFLICT ("order_id") DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "exchange_orders" WHERE "id" = 'O181633094'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "blockchain_monitor_watches" watches
    JOIN "blockchain_monitor_networks" networks
      ON networks."id" = watches."monitor_network_id"
    JOIN "blockchain_monitor_assets" assets
      ON assets."id" = watches."monitor_asset_id"
    WHERE watches."order_id" = 'O181633094'
      AND networks."network_code" = 'BEP20'
      AND assets."asset_network_id" = 'usdt-bep20'
      AND watches."asset_network_id" = 'usdt-bep20'
      AND watches."expected_amount" = 10
      AND lower(watches."receiving_address") = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
      AND watches."memo_or_tag" IS NULL
      AND watches."identity_kind" = 'token'
      AND lower(watches."contract_or_mint") = '0x55d398326f99059ff775485246999027b3197955'
      AND watches."decimals" = 18
      AND watches."order_created_at" = '2026-09-20 22:09:34.672+00'::timestamptz
      AND watches."registration_state" = 'active'
      AND watches."active" = false
  ) THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: immutable order watch mismatch';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "blockchain_monitor_observations" (
  "monitor_network_id",
  "monitor_asset_id",
  "transaction_hash",
  "event_index",
  "from_address",
  "to_address",
  "amount",
  "block_reference",
  "block_hash",
  "confirmations",
  "finalized",
  "block_timestamp",
  "raw_payload",
  "payload_digest"
)
SELECT
  watches."monitor_network_id",
  watches."monitor_asset_id",
  '0xc452c97f774ec0dd3de8d52d00f5ab087bd1c1595913a5b9e7be409ae337deaf',
  '0xc452c97f774ec0dd3de8d52d00f5ab087bd1c1595913a5b9e7be409ae337deaf:190:' || watches."monitor_asset_id",
  '0x0d0707963952f2fba59dd06f2b425ace40b492fe',
  '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb',
  10000000000000000000,
  '123067274',
  '0xda280096d3d5d02611bdd75a13cedcf902ae9db83c77092d3fdfd05be8019e2f',
  0,
  false,
  '2026-09-20 22:13:35+00'::timestamptz,
  jsonb_build_object(
    'source', 'evm-json-rpc',
    'identityKind', 'token',
    'contractOrMint', '0x55d398326f99059ff775485246999027b3197955',
    'decimals', 18,
    'receiptStatus', '0x1',
    'logIndex', 190,
    'recoveryBoundary', watches."order_created_at"
  ),
  '15418049a369b5e0f0c4a5fbc07a5840e8df5496881c76ff9ae61bf55ca7e3b1'
FROM "blockchain_monitor_watches" watches
WHERE watches."order_id" = 'O181633094'
  AND watches."order_created_at" <= '2026-09-20 22:13:35+00'::timestamptz
ON CONFLICT (
  "monitor_network_id",
  "transaction_hash",
  "event_index",
  "monitor_asset_id"
) DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "exchange_orders" WHERE "id" = 'O181633094'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "blockchain_monitor_observations" observations
    JOIN "blockchain_monitor_watches" watches
      ON watches."monitor_network_id" = observations."monitor_network_id"
     AND watches."monitor_asset_id" = observations."monitor_asset_id"
    WHERE watches."order_id" = 'O181633094'
      AND observations."transaction_hash" = '0xc452c97f774ec0dd3de8d52d00f5ab087bd1c1595913a5b9e7be409ae337deaf'
      AND observations."event_index" = '0xc452c97f774ec0dd3de8d52d00f5ab087bd1c1595913a5b9e7be409ae337deaf:190:' || watches."monitor_asset_id"
      AND lower(observations."from_address") = '0x0d0707963952f2fba59dd06f2b425ace40b492fe'
      AND lower(observations."to_address") = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
      AND observations."amount" = 10000000000000000000
      AND observations."block_reference" = '123067274'
      AND lower(observations."block_hash") = '0xda280096d3d5d02611bdd75a13cedcf902ae9db83c77092d3fdfd05be8019e2f'
      AND observations."block_timestamp" = '2026-09-20 22:13:35+00'::timestamptz
  ) THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: immutable transaction evidence mismatch';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "blockchain_monitor_matches" (
  "watch_id",
  "observation_id",
  "order_id",
  "state",
  "match_basis",
  "confirmations",
  "confirmations_required"
)
SELECT
  watches."id",
  observations."id",
  watches."order_id",
  'confirming',
  jsonb_build_object(
    'asset', watches."asset_network_id",
    'address', watches."receiving_address",
    'amount', observations."amount",
    'transactionHash', observations."transaction_hash",
    'recoveryBoundary', watches."order_created_at"
  ),
  0,
  networks."confirmations_required"
FROM "blockchain_monitor_watches" watches
JOIN "blockchain_monitor_observations" observations
  ON observations."monitor_network_id" = watches."monitor_network_id"
 AND observations."monitor_asset_id" = watches."monitor_asset_id"
 AND observations."transaction_hash" = '0xc452c97f774ec0dd3de8d52d00f5ab087bd1c1595913a5b9e7be409ae337deaf'
JOIN "blockchain_monitor_networks" networks
  ON networks."id" = watches."monitor_network_id"
WHERE watches."order_id" = 'O181633094'
  AND observations."to_address" = lower(watches."receiving_address")
  AND observations."amount" = watches."expected_amount" * power(10::numeric, watches."decimals")
ON CONFLICT ("observation_id", "watch_id") DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "exchange_orders" WHERE "id" = 'O181633094'
  ) AND (
    SELECT count(*)
    FROM "blockchain_monitor_matches" matches
    JOIN "blockchain_monitor_watches" watches
      ON watches."id" = matches."watch_id"
    JOIN "blockchain_monitor_observations" observations
      ON observations."id" = matches."observation_id"
    WHERE matches."order_id" = 'O181633094'
      AND watches."order_id" = 'O181633094'
      AND watches."asset_network_id" = 'usdt-bep20'
      AND lower(watches."receiving_address") = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
      AND watches."expected_amount" = 10
      AND matches."state" IN ('confirming', 'applied')
      AND observations."transaction_hash" = '0xc452c97f774ec0dd3de8d52d00f5ab087bd1c1595913a5b9e7be409ae337deaf'
      AND observations."event_index" = '0xc452c97f774ec0dd3de8d52d00f5ab087bd1c1595913a5b9e7be409ae337deaf:190:' || watches."monitor_asset_id"
  ) <> 1 THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: expected exactly one confirming or applied match';
  END IF;
END $$;
--> statement-breakpoint
UPDATE "blockchain_monitor_registration_gaps"
SET
  "resolved_at" = now(),
  "resolved_by" = 'verified-receipt-recovery'
WHERE "order_id" = 'O181633094'
  AND "resolved_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "blockchain_monitor_matches"
    WHERE "blockchain_monitor_matches"."order_id" = 'O181633094'
      AND "blockchain_monitor_matches"."state" = 'confirming'
  );