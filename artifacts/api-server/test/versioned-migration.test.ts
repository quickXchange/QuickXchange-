import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";

const privilegedTestPool = createPrivilegedTestPool();

test("versioned migration upgrades a populated legacy order table safely", async () => {
  const schema = `quickex_migration_${process.pid}_${Date.now()}`;
  const client = await privilegedTestPool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE exchange_customers (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        orders_count integer DEFAULT 0 NOT NULL,
        volume numeric DEFAULT '0' NOT NULL,
        last_activity timestamp with time zone DEFAULT now() NOT NULL,
        status text DEFAULT 'active' NOT NULL
      );
      CREATE TABLE exchange_orders (
        id text PRIMARY KEY NOT NULL,
        type text NOT NULL,
        status text NOT NULL,
        from_asset text NOT NULL,
        to_asset text NOT NULL,
        amount numeric NOT NULL,
        receive_amount numeric NOT NULL,
        customer_email text NOT NULL,
        customer_name text DEFAULT 'Guest' NOT NULL,
        destination_address text DEFAULT '' NOT NULL,
        payment_method text DEFAULT '' NOT NULL,
        payout_method text DEFAULT '' NOT NULL,
        provider text NOT NULL,
        note text DEFAULT '' NOT NULL,
        provider_reference text DEFAULT '' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        refund_address text DEFAULT '' NOT NULL,
        deposit_address text DEFAULT '' NOT NULL,
        provider_order_id text DEFAULT '' NOT NULL,
        customer_clerk_user_id text
      );
      CREATE TABLE customer_status_notification_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        order_id text NOT NULL,
        customer_clerk_user_id text NOT NULL,
        from_status text NOT NULL,
        to_status text NOT NULL,
        delivery_status text DEFAULT 'pending' NOT NULL,
        attempt_count integer DEFAULT 0 NOT NULL,
        next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
        last_attempt_at timestamp with time zone,
        delivered_at timestamp with time zone,
        last_error_code text DEFAULT '' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
      INSERT INTO exchange_orders (
        id, type, status, from_asset, to_asset, amount, receive_amount,
        customer_email, customer_name, provider, customer_clerk_user_id
      ) VALUES
        (
          'legacy-order', 'crypto', 'processing', 'BTC', 'USDT', '1', '99',
          'legacy@example.test', 'Legacy Customer', 'Quickex', NULL
        ),
        (
          'legacy-attempted-order', 'crypto', 'processing', 'ETH', 'USDT', '2', '198',
          'legacy-attempted@example.test', 'Legacy Attempted Customer', 'Quickex', NULL
        ),
        (
          'legacy-quickex-order', 'instant', 'creating', 'BTC', 'USDT', '3', '297',
          'legacy-quickex@example.test', 'Legacy Quickex Customer', 'Quickex',
          'legacy-quickex-clerk-user'
        ),
        (
          'legacy-manual-order', 'manual', 'pending', 'EUR', 'BTC', '4', '0.00008',
          'legacy-manual@example.test', 'Legacy Manual Customer', 'Manual desk', NULL
        );
      INSERT INTO customer_status_notification_events (
        order_id, customer_clerk_user_id, from_status, to_status, delivery_status
      ) VALUES (
        'legacy-order', 'legacy-clerk-user', 'pending', 'processing', 'sending'
      );
      INSERT INTO customer_status_notification_events (
        order_id, customer_clerk_user_id, from_status, to_status,
        delivery_status, attempt_count
      ) VALUES (
        'legacy-attempted-order', 'legacy-attempted-clerk-user',
        'pending', 'processing', 'pending', 1
      );
      CREATE TABLE desk_operator_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        action text NOT NULL,
        actor_clerk_user_id text,
        target_operator_id uuid,
        target_email text,
        details jsonb DEFAULT '{}'::jsonb NOT NULL,
        request_id text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE TABLE desk_operators (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        email text NOT NULL,
        clerk_user_id text,
        role text DEFAULT 'operator' NOT NULL,
        status text DEFAULT 'invited' NOT NULL,
        auth_version integer DEFAULT 1 NOT NULL,
        invited_by text,
        approved_by text,
        suspended_at timestamp with time zone,
        removed_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT desk_operators_email_unique UNIQUE(email),
        CONSTRAINT desk_operators_clerk_user_id_unique UNIQUE(clerk_user_id)
      );
      CREATE TABLE provider_integrations (
        provider text PRIMARY KEY NOT NULL,
        ciphertext text NOT NULL,
        initialization_vector text NOT NULL,
        authentication_tag text NOT NULL,
        encryption_version integer DEFAULT 1 NOT NULL,
        created_by_operator_id text,
        updated_by_operator_id text,
        last_tested_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE TABLE landing_background_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        version integer NOT NULL,
        mode text DEFAULT 'preset' NOT NULL,
        preset_id text DEFAULT 'neon-orbit',
        custom_object_path text,
        focal_x integer DEFAULT 50 NOT NULL,
        focal_y integer DEFAULT 50 NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        created_by text NOT NULL
      );
      INSERT INTO landing_background_settings
        (version, mode, preset_id, focal_x, focal_y, created_by)
      VALUES (1, 'preset', 'aurora-chain', 17, 83, 'legacy-user');
      CREATE TABLE blockchain_monitor_networks (
        id text PRIMARY KEY NOT NULL,
        network_code text NOT NULL UNIQUE,
        network_name text NOT NULL,
        adapter_kind text NOT NULL,
        chain_id text,
        provider_kind text DEFAULT 'none' NOT NULL,
        enabled boolean DEFAULT false NOT NULL,
        endpoint_secret_ref text,
        api_key_secret_ref text,
        confirmations_required integer DEFAULT 0 NOT NULL,
        finality_policy text DEFAULT 'confirmations' NOT NULL,
        poll_interval_seconds integer DEFAULT 15 NOT NULL,
        cursor text,
        last_head text,
        health_status text DEFAULT 'not_configured' NOT NULL,
        health_checked_at timestamp with time zone,
        health_error text,
        consecutive_failures integer DEFAULT 0 NOT NULL,
        next_attempt_at timestamp with time zone,
        lease_token text,
        lease_expires_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
      INSERT INTO blockchain_monitor_networks (
        id, network_code, network_name, adapter_kind, chain_id, provider_kind,
        enabled, endpoint_secret_ref, confirmations_required, finality_policy,
        poll_interval_seconds
      ) VALUES (
        'monitor-bep20', 'BEP20', 'BNB Smart Chain', 'evm', '0x38', 'rpc',
        false, 'BSC_MONITOR_RPC_URL', 15, 'confirmations', 15
      );
    `);

    await migrate(drizzle(client), {
      migrationsFolder: resolve(process.cwd(), "../../lib/db/migrations"),
      migrationsSchema: schema,
      migrationsTable: "__drizzle_migrations",
    });

    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'exchange_orders'`,
      [schema],
    );
    const names = new Set(columns.rows.map((row) => row.column_name));
    for (const name of [
      "from_network",
      "to_network",
      "destination_memo",
      "refund_memo",
      "deposit_memo",
      "provider_state",
      "quote_id",
      "client_request_id",
      "error_code",
      "error_message",
      "outcome_unknown",
      "rate_mode",
      "provider_claimed_deposit_amount",
      "provider_expected_receive_amount",
      "provider_paid_amount",
      "provider_created_at",
      "provider_updated_at",
      "provider_completed",
      "customer_clerk_user_id",
      "customer_ownership_source",
      "customer_claimed_at",
      "status_notifications_enabled",
      "status_version",
      "record_version",
      "updated_at",
       "pricing_snapshot",
    ]) {
      assert.equal(names.has(name), true, `missing migrated column ${name}`);
    }

    const preserved = await client.query(
      `SELECT id, customer_email, status, from_network, to_network,
              outcome_unknown, error_code, rate_mode, status_version
       FROM exchange_orders WHERE id = 'legacy-order'`,
    );
    assert.deepEqual(preserved.rows, [{
      id: "legacy-order",
      customer_email: "legacy@example.test",
      status: "verification required",
      from_network: "",
      to_network: "",
      outcome_unknown: true,
      error_code: "LEGACY_NETWORK_MISSING",
      rate_mode: "FLOATING",
      status_version: 1,
    }]);

    const migrationRows = await client.query(
      `SELECT count(*)::integer AS count FROM "${schema}"."__drizzle_migrations"`,
    );
    const migrationJournal = JSON.parse(await readFile(
      resolve(process.cwd(), "../../lib/db/migrations/meta/_journal.json"),
      "utf8",
    )) as { entries: unknown[] };
    assert.equal(migrationRows.rows[0]?.count, migrationJournal.entries.length);
    const landingBackgroundTables = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_name IN ('landing_background_settings', 'landing_background_audit_logs')
       ORDER BY table_name`,
      [schema],
    );
    assert.deepEqual(
      landingBackgroundTables.rows.map(({ table_name }) => table_name),
      ["landing_background_audit_logs", "landing_background_settings"],
    );
    const landingBackgroundPlacementColumn = await client.query<{
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'landing_background_settings'
         AND column_name = 'placements'`,
      [schema],
    );
    assert.equal(landingBackgroundPlacementColumn.rows[0]?.is_nullable, "NO");
    assert.match(landingBackgroundPlacementColumn.rows[0]?.column_default ?? "", /'\{\}'::jsonb/);
    const legacyLandingBackground = await client.query(
      `SELECT preset_id, focal_x, focal_y, placements
       FROM landing_background_settings WHERE version = 1`,
    );
    assert.deepEqual(legacyLandingBackground.rows, [{
      preset_id: "aurora-chain",
      focal_x: 17,
      focal_y: 83,
      placements: {},
    }]);
    const initialAffiliateSettings = await client.query(
      `SELECT version, enabled, quickex_enabled, manual_enabled,
              cookie_duration_days
       FROM affiliate_program_settings ORDER BY version`,
    );
    assert.deepEqual(initialAffiliateSettings.rows, [
      {
        version: 1,
        enabled: false,
        quickex_enabled: false,
        manual_enabled: false,
        cookie_duration_days: 30,
      },
      {
        version: 2,
        enabled: true,
        quickex_enabled: true,
        manual_enabled: true,
        cookie_duration_days: 30,
      },
      {
        version: 3,
        enabled: true,
        quickex_enabled: true,
        manual_enabled: true,
        cookie_duration_days: 30,
      },
    ]);
    const quickexBackfill = await client.query(
      `SELECT legacy_order_id, customer_email, customer_clerk_user_id,
              route->>'fromAsset' AS from_asset
       FROM quickex_orders ORDER BY legacy_order_id`,
    );
    assert.deepEqual(quickexBackfill.rows, [{
      legacy_order_id: "legacy-quickex-order",
      customer_email: "legacy-quickex@example.test",
      customer_clerk_user_id: "legacy-quickex-clerk-user",
      from_asset: "BTC",
    }]);
    const seededFiat = await client.query<{ code: string }>(
      `SELECT code FROM fiat_currencies ORDER BY code`,
    );
    assert.deepEqual(
      seededFiat.rows.map(({ code }) => code),
      ["AED", "DZD", "EUR", "GBP", "KZT", "TRY", "USD"],
    );
    const notificationConstraints = await client.query(
      `SELECT
         source_namespace.nspname AS source_schema,
         source_table.relname AS source_table,
         target_namespace.nspname AS target_schema,
         target_table.relname AS target_table
       FROM pg_constraint constraint_record
       JOIN pg_class source_table
         ON source_table.oid = constraint_record.conrelid
       JOIN pg_namespace source_namespace
         ON source_namespace.oid = source_table.relnamespace
       JOIN pg_class target_table
         ON target_table.oid = constraint_record.confrelid
       JOIN pg_namespace target_namespace
         ON target_namespace.oid = target_table.relnamespace
       WHERE constraint_record.conname = 'customer_status_notification_events_order_id_exchange_orders_id_fk'
         AND source_namespace.nspname = $1`,
      [schema],
    );
    assert.deepEqual(notificationConstraints.rows, [{
      source_schema: schema,
      source_table: "customer_status_notification_events",
      target_schema: schema,
      target_table: "exchange_orders",
    }]);
    const migratedNotification = await client.query(
      `SELECT status_version, delivery_status, claim_token, claim_expires_at,
              provider_idempotency_started_at, last_error_code
       FROM customer_status_notification_events
       WHERE order_id = 'legacy-order'`,
    );
    assert.deepEqual(migratedNotification.rows, [{
      status_version: 1,
      delivery_status: "failed",
      claim_token: null,
      claim_expires_at: null,
      provider_idempotency_started_at: null,
      last_error_code: "EMAIL_LEGACY_SEND_AMBIGUOUS",
    }]);
    const migratedAttemptedNotification = await client.query(
      `SELECT delivery_status, provider_idempotency_started_at, last_error_code
       FROM customer_status_notification_events
       WHERE order_id = 'legacy-attempted-order'`,
    );
    assert.deepEqual(migratedAttemptedNotification.rows, [{
      delivery_status: "failed",
      provider_idempotency_started_at: null,
      last_error_code: "EMAIL_LEGACY_SEND_AMBIGUOUS",
    }]);
    const operationalIndexes = await client.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = $1
         AND indexname = ANY($2::text[])
       ORDER BY indexname`,
      [
        schema,
        [
          "exchange_orders_created_at_id_idx",
          "exchange_orders_customer_created_at_id_idx",
          "exchange_orders_status_created_at_id_idx",
        ],
      ],
    );
    assert.deepEqual(operationalIndexes.rows, []);

    await client.query(
      `UPDATE exchange_orders
       SET client_request_id = 'migration-idempotency-key'
       WHERE id = 'legacy-order'`,
    );
    await assert.rejects(
      client.query(`
        INSERT INTO exchange_orders (
          id, type, status, from_asset, to_asset, amount, receive_amount,
          customer_email, provider, client_request_id
        ) VALUES (
          'duplicate-key-order', 'instant', 'creating', 'BTC', 'USDT', '1', '99',
          'duplicate@example.test', 'Quickex', 'migration-idempotency-key'
        )
      `),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "23505",
    );
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
  }
});