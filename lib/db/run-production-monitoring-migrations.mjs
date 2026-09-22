import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set before running production monitoring migrations.",
  );
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const migrationSql = await readFile(
  new URL("./migrations/0099_bnb_bep20_native_monitor.sql", import.meta.url),
  "utf8",
);

const exactIdentityQuery = `
  SELECT 1
  FROM blockchain_monitor_assets identity
  JOIN blockchain_monitor_networks monitor
    ON monitor.id = identity.monitor_network_id
  JOIN crypto_asset_networks route
    ON route.id = identity.asset_network_id
  JOIN crypto_assets asset
    ON asset.id = route.asset_id
  WHERE identity.asset_network_id = 'bnb-bep20'
    AND identity.identity_kind = 'native'
    AND identity.contract_or_mint IS NULL
    AND identity.decimals = 18
    AND identity.enabled = true
    AND monitor.network_code = 'BEP20'
    AND monitor.adapter_kind = 'evm'
    AND monitor.provider_kind = 'rpc'
    AND monitor.enabled = true
    AND lower(monitor.chain_id) = '0x38'
    AND monitor.endpoint_secret_ref = 'BSC_MONITOR_RPC_URL'
    AND monitor.finality_policy = 'confirmations'
    AND asset.code = 'BNB'
    AND asset.enabled = true
    AND asset.lifecycle = 'active'
    AND route.enabled = true
    AND route.lifecycle = 'active'
    AND route.execution_mode = 'manual'
    AND route.deposit_provider = 'manual'
    AND route.network_code = 'BEP20'
    AND route.decimals = 18
`;

const client = await pool.connect();
let transactionOpen = false;
try {
  await client.query("BEGIN");
  transactionOpen = true;
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('quickex:production-monitoring-migrations'))",
  );

  const existing = await client.query(exactIdentityQuery);
  if (existing.rowCount === 0) {
    await client.query(migrationSql);
  }

  const verified = await client.query(exactIdentityQuery);
  if (verified.rowCount !== 1) {
    throw new Error(
      "Production monitoring migration did not produce exactly one verified native BNB/BEP20 identity on the existing BSC monitor.",
    );
  }

  await client.query("COMMIT");
  transactionOpen = false;
  console.log("Production BNB/BEP20 monitoring identity verified.");
} catch (error) {
  if (transactionOpen) await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}