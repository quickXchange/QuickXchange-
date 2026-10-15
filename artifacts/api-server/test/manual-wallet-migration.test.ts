import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";
import { pool, ordersTable, blockchainMonitorWatchesTable, manualWalletTargetsTable as targets, manualWalletRegistrationsTable as registrations,
  blockchainMonitorNetworksTable as networks, blockchainMonitorAssetsTable as assets } from "@workspace/db";
import { assertIsolatedWhitebitDatabase } from "./assert-isolated-whitebit-database";

assertIsolatedWhitebitDatabase();
const migrationPool = createPrivilegedTestPool();
const db = drizzle(migrationPool);
after(async () => { await Promise.all([pool.end(), migrationPool.end()]); });

test("0150 applies atomically, enforces sharing/FKs, and rolls back without financial changes", async () => {
  const migration = readFileSync(resolve("../../lib/db/migrations/0150_redundant_satana.sql"), "utf8");
  assert.doesNotMatch(migration, /^\s*(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/im);
  const identity = () => db.execute(sql`SELECT
    'manual_wallet_targets'::regclass::oid AS targets,
    'manual_wallet_registrations'::regclass::oid AS registrations,
    (SELECT count(*) FROM ${ordersTable}) AS orders,
    (SELECT count(*) FROM ${blockchainMonitorWatchesTable}) AS watches`);
  const before = (await identity()).rows;
  const rollback = new Error("intentional isolated rollback");
  const code = (error: any, expected: string) => (error?.cause?.code ?? error?.code) === expected;
  await assert.rejects(db.transaction(async tx => {
    // Only the disposable fixture database; never run against a live database.
    await tx.execute(sql.raw("DROP TABLE manual_wallet_registrations; DROP TABLE manual_wallet_targets"));
    for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
    const networkId = `migration-${randomUUID()}`;
    await tx.insert(networks).values({ id: networkId, networkName: "Synthetic migration fixture",
      networkCode: networkId, adapterKind: "bitcoin", providerKind: "rpc" });
    const [asset] = await tx.insert(assets).values({ monitorNetworkId: networkId,
      assetNetworkId: "btc-bitcoin", identityKind: "native", decimals: 8 }).returning();
    const [target] = await tx.insert(targets).values({ monitorNetworkId: networkId,
      address: "synthetic-only", canonicalAddress: "synthetic-only", memo: "" }).returning();
    assert.match(target.id, /^[a-f0-9-]{36}$/);
    await tx.insert(registrations).values({ assetNetworkId: "btc-bitcoin", targetId: target.id,
      monitorAssetId: asset.id, address: "synthetic-only" });
    await assert.rejects(tx.transaction(async sp => {
      await sp.insert(targets).values({ monitorNetworkId: networkId,
        address: "other-display", canonicalAddress: "synthetic-only", memo: "" });
    }), error => code(error, "23505"));
    await assert.rejects(tx.transaction(async sp => {
      await sp.delete(targets).where(eq(targets.id, target.id));
    }), error => code(error, "23503"));
    await assert.rejects(tx.transaction(async sp => {
      await sp.delete(networks).where(eq(networks.id, networkId));
    }), error => code(error, "23503"));
    await tx.delete(assets).where(eq(assets.id, asset.id));
    const [detached] = await tx.select().from(registrations)
      .where(eq(registrations.assetNetworkId, "btc-bitcoin"));
    assert.equal(detached.monitorAssetId, null);
    assert.equal(detached.targetId, target.id);
    await assert.rejects(tx.transaction(async sp => {
      await sp.execute(sql.raw("DROP TABLE manual_wallet_registrations; DROP TABLE manual_wallet_targets"));
      await sp.execute(sql.raw(migration.split("--> statement-breakpoint")[0]));
      await sp.execute(sql.raw("SELECT deliberately_missing_migration_function()"));
    }), error => code(error, "42883"));
    assert.equal((await tx.select().from(registrations)).length, 1, "partial DDL failure restores the pre-step schema and rows");
    throw rollback;
  }), error => error === rollback);
  assert.deepEqual((await identity()).rows, before, "transactional rollback restores original table identities and financial counts");
});
