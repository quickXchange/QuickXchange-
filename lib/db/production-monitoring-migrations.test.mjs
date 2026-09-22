import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the isolated migration test.");
}

const rootDatabaseUrl = process.env.DATABASE_URL;
const runnerUrl = new URL("./run-production-monitoring-migrations.mjs", import.meta.url);

function schemaName() {
  return `monitor_migration_test_${randomUUID().replaceAll("-", "")}`;
}

function runMigration(schema) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerUrl.pathname], {
      cwd: new URL("../..", import.meta.url),
      env: {
        ...process.env,
        DATABASE_URL: rootDatabaseUrl,
        PGOPTIONS: `-c search_path=${schema}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function waitForBlockedMigrations(client, expectedCount) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query(`
      SELECT count(*)::int AS count
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND database = (
          SELECT oid FROM pg_database WHERE datname = current_database()
        )
        AND classid = 0
        AND objid = hashtext('quickex:production-monitoring-migrations')::bigint::oid
        AND objsubid = 1
        AND granted = false
    `);
    if (result.rows[0].count === expectedCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${expectedCount} migrations to block on the advisory lock.`);
}

async function createFixture(client, schema, { malformedBscIdentity = false } = {}) {
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  await client.query(`
    CREATE TABLE exchange_orders (
      id text PRIMARY KEY,
      status text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE blockchain_monitor_networks (
      id text PRIMARY KEY,
      network_code text NOT NULL UNIQUE,
      network_name text NOT NULL,
      adapter_kind text NOT NULL,
      chain_id text,
      provider_kind text NOT NULL DEFAULT 'none',
      enabled boolean NOT NULL DEFAULT false,
      endpoint_secret_ref text,
      api_key_secret_ref text,
      confirmations_required integer NOT NULL DEFAULT 0,
      finality_policy text NOT NULL DEFAULT 'confirmations',
      poll_interval_seconds integer NOT NULL DEFAULT 15,
      max_scan_range integer NOT NULL DEFAULT 1000,
      cursor text,
      last_head text,
      health_status text NOT NULL DEFAULT 'not_configured',
      health_checked_at timestamptz,
      health_error text,
      consecutive_failures integer NOT NULL DEFAULT 0,
      health_proof_fingerprint text,
      health_proof_captured_at timestamptz,
      next_attempt_at timestamptz,
      lease_token text,
      lease_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT blockchain_monitor_networks_max_scan_range_check
        CHECK (max_scan_range BETWEEN 0 AND 10000)
    );

    CREATE TABLE blockchain_monitor_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      monitor_network_id text NOT NULL,
      asset_network_id text NOT NULL,
      identity_kind text NOT NULL,
      contract_or_mint text,
      decimals integer NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      readiness_proof_fingerprint text,
      readiness_proof_captured_at timestamptz,
      UNIQUE (monitor_network_id, asset_network_id)
    );

    CREATE TABLE blockchain_monitor_watches (
      id uuid PRIMARY KEY,
      monitor_network_id text NOT NULL,
      marker text NOT NULL
    );

    CREATE TABLE blockchain_monitor_observations (
      id uuid PRIMARY KEY,
      monitor_network_id text NOT NULL,
      marker text NOT NULL
    );

    CREATE TABLE blockchain_monitor_matches (
      id uuid PRIMARY KEY,
      watch_id uuid NOT NULL,
      marker text NOT NULL
    );

    CREATE TABLE crypto_asset_networks (
      id text PRIMARY KEY,
      network_code text NOT NULL,
      decimals integer NOT NULL,
      customer_deposits_enabled boolean NOT NULL DEFAULT false
    );
  `);

  await client.query(
    `INSERT INTO exchange_orders (id, status, payload)
     VALUES ('production-order-1', 'awaiting funds', '{"immutable":true}')`,
  );
  await client.query(`
    INSERT INTO blockchain_monitor_networks (
      id, network_code, network_name, adapter_kind, chain_id, provider_kind,
      enabled, endpoint_secret_ref, confirmations_required, finality_policy,
      poll_interval_seconds, max_scan_range, cursor, last_head, health_status,
      health_error, consecutive_failures
    )
    VALUES (
      'monitor-bep20', 'BEP20', 'BNB Smart Chain', 'evm', '0x38', 'rpc',
      true, 'BSC_MONITOR_RPC_URL', 15, 'confirmations',
      15, 1000, '100', '125', 'disconnected', 'legacy endpoint failed', 4
    )
  `);
  await client.query(
    `INSERT INTO blockchain_monitor_assets (
       id, monitor_network_id, asset_network_id, identity_kind,
       contract_or_mint, decimals, enabled
     )
     VALUES
       ($1, 'monitor-bep20', 'bnb-bep20', 'native', NULL, $2, true),
       ($3, 'monitor-bep20', 'usdt-bep20', 'token',
        '0x55d398326f99059ff775485246999027b3197955', 18, true)`,
    [
      randomUUID(),
      malformedBscIdentity ? 8 : 18,
      randomUUID(),
    ],
  );
  const watchId = randomUUID();
  await client.query(
    `INSERT INTO blockchain_monitor_watches (id, monitor_network_id, marker)
     VALUES ($1, 'monitor-bep20', 'watch-immutable')`,
    [watchId],
  );
  await client.query(
    `INSERT INTO blockchain_monitor_observations (id, monitor_network_id, marker)
     VALUES ($1, 'monitor-bep20', 'observation-immutable')`,
    [randomUUID()],
  );
  await client.query(
    `INSERT INTO blockchain_monitor_matches (id, watch_id, marker)
     VALUES ($1, $2, 'match-immutable')`,
    [randomUUID(), watchId],
  );
  await client.query(`
    INSERT INTO crypto_asset_networks (
      id, network_code, decimals, customer_deposits_enabled
    )
    VALUES
      ('eth-ethereum', 'ERC20', 18, true),
      ('usdt-erc20', 'ERC20', 6, true),
      ('usdc-erc20', 'ERC20', 6, true)
  `);
}

async function snapshot(client, schema) {
  await client.query(`SET search_path TO ${schema}`);
  const result = await client.query(`
    SELECT jsonb_build_object(
      'orders', (SELECT jsonb_agg(to_jsonb(row) ORDER BY id) FROM exchange_orders row),
      'bscAssets', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY id)
        FROM blockchain_monitor_assets row
        WHERE monitor_network_id = 'monitor-bep20'
      ),
      'bscWatches', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY id)
        FROM blockchain_monitor_watches row
        WHERE monitor_network_id = 'monitor-bep20'
      ),
      'bscObservations', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY id)
        FROM blockchain_monitor_observations row
        WHERE monitor_network_id = 'monitor-bep20'
      ),
      'bscMatches', (
        SELECT jsonb_agg(to_jsonb(match_row) ORDER BY match_row.id)
        FROM blockchain_monitor_matches match_row
        JOIN blockchain_monitor_watches watch ON watch.id = match_row.watch_id
        WHERE watch.monitor_network_id = 'monitor-bep20'
      ),
      'bscCursor', (
        SELECT jsonb_build_object('cursor', cursor, 'lastHead', last_head)
        FROM blockchain_monitor_networks
        WHERE id = 'monitor-bep20'
      )
    ) AS value
  `);
  return result.rows[0].value;
}

async function withFixture(options, callback) {
  const client = new pg.Client({ connectionString: rootDatabaseUrl });
  const schema = schemaName();
  await client.connect();
  try {
    await createFixture(client, schema, options);
    await callback({ client, schema });
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
}

test("production monitoring migration is concurrent-safe, idempotent, and immutable", async () => {
  await withFixture({}, async ({ client, schema }) => {
    const before = await snapshot(client, schema);
    await client.query(
      "SELECT pg_advisory_lock(hashtext('quickex:production-monitoring-migrations'))",
    );
    let firstSettled = false;
    let secondSettled = false;
    const first = runMigration(schema).finally(() => {
      firstSettled = true;
    });
    const second = runMigration(schema).finally(() => {
      secondSettled = true;
    });
    try {
      await waitForBlockedMigrations(client, 2);
      assert.equal(firstSettled, false);
      assert.equal(secondSettled, false);
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('quickex:production-monitoring-migrations'))",
      );
    }
    const concurrent = await Promise.all([first, second]);
    for (const result of concurrent) {
      assert.equal(result.code, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /monitoring configuration verified/);
    }

    const afterConcurrent = await snapshot(client, schema);
    assert.deepEqual(afterConcurrent, before);

    const idempotent = await runMigration(schema);
    assert.equal(idempotent.code, 0, idempotent.stderr || idempotent.stdout);
    assert.deepEqual(await snapshot(client, schema), before);

    await client.query(`SET search_path TO ${schema}`);
    const configuration = await client.query(`
      SELECT
        (SELECT endpoint_secret_ref FROM blockchain_monitor_networks WHERE id = 'monitor-bep20')
          AS bsc_secret_ref,
        (SELECT max_scan_range FROM blockchain_monitor_networks WHERE id = 'monitor-bep20')
          AS bsc_max_scan_range,
        (SELECT count(*)::int FROM blockchain_monitor_networks WHERE id = 'monitor-ethereum-mainnet')
          AS ethereum_monitors,
        (SELECT count(*)::int FROM blockchain_monitor_assets
         WHERE monitor_network_id = 'monitor-ethereum-mainnet' AND enabled = false)
          AS disabled_ethereum_identities,
        (SELECT count(*)::int FROM crypto_asset_networks
         WHERE id IN ('eth-ethereum','usdt-erc20','usdc-erc20')
           AND customer_deposits_enabled = false)
          AS disabled_ethereum_routes
    `);
    assert.deepEqual(configuration.rows[0], {
      bsc_secret_ref: "BSC_MONITOR_RPC_URL_V2",
      bsc_max_scan_range: 9,
      ethereum_monitors: 1,
      disabled_ethereum_identities: 3,
      disabled_ethereum_routes: 3,
    });
  });
});

test("production monitoring migration rolls back on an unexpected BSC identity", async () => {
  await withFixture({ malformedBscIdentity: true }, async ({ client, schema }) => {
    const before = await snapshot(client, schema);
    const failed = await runMigration(schema);
    assert.notEqual(failed.code, 0);
    assert.match(failed.stderr, /differ from the verified baseline/);
    assert.deepEqual(await snapshot(client, schema), before);

    await client.query(`SET search_path TO ${schema}`);
    const state = await client.query(`
      SELECT
        (SELECT endpoint_secret_ref FROM blockchain_monitor_networks WHERE id = 'monitor-bep20')
          AS bsc_secret_ref,
        (SELECT count(*)::int FROM blockchain_monitor_networks WHERE id = 'monitor-ethereum-mainnet')
          AS ethereum_monitors
    `);
    assert.deepEqual(state.rows[0], {
      bsc_secret_ref: "BSC_MONITOR_RPC_URL",
      ethereum_monitors: 0,
    });
  });
});