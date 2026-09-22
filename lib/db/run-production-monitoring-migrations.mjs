import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set before running production monitoring migrations.",
  );
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const [ethereumMigrationSql, ethereumRangeMigrationSql, bscRpcMigrationSql, bscRangeMigrationSql, bscStablecoinIdentitySql] =
  await Promise.all([
    readFile(new URL("./migrations/0101_configure_ethereum_mainnet_monitor.sql", import.meta.url), "utf8"),
    readFile(new URL("./migrations/0102_ethereum_rpc_scan_range.sql", import.meta.url), "utf8"),
    readFile(new URL("./migrations/0103_bsc_monitor_rpc_v2.sql", import.meta.url), "utf8"),
    readFile(new URL("./migrations/0104_bsc_alchemy_log_range.sql", import.meta.url), "utf8"),
    readFile(new URL("./migrations/0110_bsc_stablecoin_monitor_identities.sql", import.meta.url), "utf8"),
  ]);

const exactBscConfigurationQuery = (secretReference, maxScanRange, includeUsdc = false) => `
  SELECT 1
  FROM blockchain_monitor_networks monitor
  WHERE monitor.id = 'monitor-bep20'
    AND monitor.network_code = 'BEP20'
    AND monitor.adapter_kind = 'evm'
    AND monitor.provider_kind = 'rpc'
    AND monitor.enabled = true
    AND lower(monitor.chain_id) = '0x38'
    AND monitor.endpoint_secret_ref = '${secretReference}'
    ${maxScanRange === undefined ? "" : `AND monitor.max_scan_range = ${maxScanRange}`}
    AND monitor.finality_policy = 'confirmations'
    AND (
      SELECT count(*)
      FROM blockchain_monitor_assets identity
      WHERE identity.monitor_network_id = monitor.id
    ) = ${includeUsdc ? 3 : 2}
    AND EXISTS (
      SELECT 1
      FROM blockchain_monitor_assets identity
      WHERE identity.monitor_network_id = monitor.id
        AND identity.asset_network_id = 'bnb-bep20'
        AND identity.identity_kind = 'native'
        AND identity.contract_or_mint IS NULL
        AND identity.decimals = 18
        AND identity.enabled = true
    )
    AND EXISTS (
      SELECT 1
      FROM blockchain_monitor_assets identity
      WHERE identity.monitor_network_id = monitor.id
        AND identity.asset_network_id = 'usdt-bep20'
        AND identity.identity_kind = 'token'
        AND lower(identity.contract_or_mint) =
          '0x55d398326f99059ff775485246999027b3197955'
        AND identity.decimals = 18
        AND identity.enabled = true
    )
    ${includeUsdc ? `AND EXISTS (
      SELECT 1
      FROM blockchain_monitor_assets identity
      WHERE identity.monitor_network_id = monitor.id
        AND identity.asset_network_id = 'usdc-bep20'
        AND identity.identity_kind = 'token'
        AND lower(identity.contract_or_mint) =
          '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'
        AND identity.decimals = 18
    )` : ""}
`;

const exactEthereumConfigurationQuery = `
  SELECT 1
  FROM blockchain_monitor_networks monitor
  WHERE monitor.id = 'monitor-ethereum-mainnet'
    AND monitor.network_code = 'ERC20'
    AND monitor.adapter_kind = 'evm'
    AND monitor.provider_kind = 'rpc'
    AND monitor.enabled = true
    AND lower(monitor.chain_id) = '0x1'
    AND monitor.endpoint_secret_ref = 'ETHEREUM_MONITOR_RPC_URL'
    AND monitor.api_key_secret_ref IS NULL
    AND monitor.confirmations_required = 12
    AND monitor.finality_policy = 'confirmations'
    AND monitor.poll_interval_seconds = 15
    AND monitor.max_scan_range = 9
    AND (
      (
        monitor.health_status = 'not_configured'
        AND monitor.health_checked_at IS NULL
        AND monitor.health_error = 'Ethereum RPC capabilities must be revalidated.'
        AND monitor.health_proof_fingerprint IS NULL
        AND monitor.health_proof_captured_at IS NULL
      )
      OR (
        monitor.health_status = 'connected'
        AND monitor.health_checked_at IS NOT NULL
        AND monitor.health_error IS NULL
        AND monitor.consecutive_failures = 0
        AND monitor.health_proof_fingerprint IS NOT NULL
        AND monitor.health_proof_captured_at IS NOT NULL
      )
    )
    AND (
      SELECT count(*)
      FROM blockchain_monitor_assets identity
      WHERE identity.monitor_network_id = monitor.id
    ) = 3
    AND (
      SELECT count(*)
      FROM blockchain_monitor_assets identity
      WHERE identity.monitor_network_id = monitor.id
        AND identity.enabled = false
        AND identity.readiness_proof_fingerprint IS NULL
        AND identity.readiness_proof_captured_at IS NULL
        AND (
          (
            identity.asset_network_id = 'eth-ethereum'
            AND identity.identity_kind = 'native'
            AND identity.contract_or_mint IS NULL
            AND identity.decimals = 18
          )
          OR (
            identity.asset_network_id = 'usdt-erc20'
            AND identity.identity_kind = 'token'
            AND lower(identity.contract_or_mint) =
              '0xdac17f958d2ee523a2206206994597c13d831ec7'
            AND identity.decimals = 6
          )
          OR (
            identity.asset_network_id = 'usdc-erc20'
            AND identity.identity_kind = 'token'
            AND lower(identity.contract_or_mint) =
              '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
            AND identity.decimals = 6
          )
        )
    ) = 3
    AND (
      SELECT count(*)
      FROM crypto_asset_networks route
      WHERE route.id IN ('eth-ethereum', 'usdt-erc20', 'usdc-erc20')
        AND route.customer_deposits_enabled = false
    ) = 3
`;

const orderFingerprintQuery = `
  SELECT
    count(*)::text AS count,
    md5(
      coalesce(
        string_agg(row_to_json(exchange_orders)::text, E'\\n' ORDER BY id),
        ''
      )
    ) AS fingerprint
  FROM exchange_orders
`;

const bscImmutableFingerprintQuery = `
  SELECT
    (
      SELECT md5(coalesce(string_agg(row_to_json(watch)::text, E'\\n' ORDER BY id), ''))
      FROM blockchain_monitor_watches watch
      WHERE watch.monitor_network_id = 'monitor-bep20'
    ) AS watches,
    (
      SELECT md5(coalesce(string_agg(row_to_json(observation)::text, E'\\n' ORDER BY id), ''))
      FROM blockchain_monitor_observations observation
      WHERE observation.monitor_network_id = 'monitor-bep20'
    ) AS observations,
    (
      SELECT md5(coalesce(string_agg(row_to_json(m)::text, E'\\n' ORDER BY m.id), ''))
      FROM blockchain_monitor_matches m
      JOIN blockchain_monitor_watches watch ON watch.id = m.watch_id
      WHERE watch.monitor_network_id = 'monitor-bep20'
    ) AS matches,
    (
      SELECT md5(concat_ws('|', cursor, last_head))
      FROM blockchain_monitor_networks
      WHERE id = 'monitor-bep20'
    ) AS cursors
`;

const client = await pool.connect();
let transactionOpen = false;
let advisoryLockHeld = false;
try {
  await client.query(
    "SELECT pg_advisory_lock(hashtext('quickex:production-monitoring-migrations'))",
  );
  advisoryLockHeld = true;
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  transactionOpen = true;

  const orderFingerprintBefore = (await client.query(orderFingerprintQuery)).rows[0];
  const bscFingerprintBefore = (await client.query(bscImmutableFingerprintQuery)).rows[0];

  const existingBsc = await client.query(
    exactBscConfigurationQuery("BSC_MONITOR_RPC_URL"),
  );
  const existingBscV2 = await client.query(
    exactBscConfigurationQuery("BSC_MONITOR_RPC_URL_V2"),
  );
  const existingBscWithUsdc = await client.query(
    exactBscConfigurationQuery("BSC_MONITOR_RPC_URL_V2", 9, true),
  );
  if (existingBsc.rowCount + existingBscV2.rowCount + existingBscWithUsdc.rowCount !== 1) {
    throw new Error(
      "Production BSC monitor or its exact BNB/USDT identities differ from the verified baseline.",
    );
  }

  if (existingBscV2.rowCount === 0) {
    await client.query(bscRpcMigrationSql);
  }
  await client.query(bscRangeMigrationSql);
  await client.query(bscStablecoinIdentitySql);

  const existingEthereum = await client.query(exactEthereumConfigurationQuery);
  if (existingEthereum.rowCount === 0) {
    await client.query(ethereumMigrationSql);
    await client.query(ethereumRangeMigrationSql);
  }

  const verifiedBsc = await client.query(
    exactBscConfigurationQuery("BSC_MONITOR_RPC_URL_V2", 9, true),
  );
  if (verifiedBsc.rowCount !== 1) {
    throw new Error(
      "Production monitoring migration did not preserve the exact BNB, USDT, and USDC identities on the BSC V2 monitor.",
    );
  }

  const verifiedEthereum = await client.query(exactEthereumConfigurationQuery);
  if (verifiedEthereum.rowCount !== 1) {
    throw new Error(
      "Production monitoring migration did not produce the exact fail-closed Ethereum Mainnet monitor configuration.",
    );
  }

  const orderFingerprintAfter = (await client.query(orderFingerprintQuery)).rows[0];
  const bscFingerprintAfter = (await client.query(bscImmutableFingerprintQuery)).rows[0];
  if (
    orderFingerprintAfter.count !== orderFingerprintBefore.count ||
    orderFingerprintAfter.fingerprint !== orderFingerprintBefore.fingerprint
  ) {
    throw new Error(
      "Production monitoring migration changed the production order dataset.",
    );
  }
  if (
    JSON.stringify(bscFingerprintAfter) !== JSON.stringify(bscFingerprintBefore)
  ) {
    throw new Error(
      "Production monitoring migration changed BSC watches, cursors, observations, or matches.",
    );
  }

  await client.query("COMMIT");
  transactionOpen = false;
  console.log(
    `Production monitoring configuration verified; transaction left ${orderFingerprintAfter.count} orders and BSC monitoring history unchanged.`,
  );
} catch (error) {
  if (transactionOpen) await client.query("ROLLBACK");
  throw error;
} finally {
  if (advisoryLockHeld) {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext('quickex:production-monitoring-migrations'))",
    );
  }
  client.release();
  await pool.end();
}