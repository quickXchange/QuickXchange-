import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db, pool, DatabaseLockClient, manualDeskPricingRulesTable } from '@workspace/db';
import { bulkUpdateManualPricingRules } from '../src/lib/manual-desk-pricing';

if (process.env.API_TEST_DISPOSABLE_DATABASE !== '1' ||
    !new URL(process.env.DATABASE_URL ?? 'postgres://invalid/').pathname.startsWith('/api_test_')) {
  throw new Error('Run orphan deletion regressions only through test/run-api-isolated.mjs.');
}
after(() => pool.end());

test('orphan cleanup preserves unrelated prices and survives independent database reloads', async t => {
  // Read-only investigation identified these three records, not a uniquely
  // identifiable pair. Reproduce all three in a disposable database only.
  const copies = [
    { id: 'fc82875c-a45a-4688-ace0-ae025c127467', method: 'bnp-paribas', asset: 'usdc' },
    { id: '328d41fe-e477-4570-9a9c-55eb8528d6f1', method: 'bbva', asset: 'usdc' },
    { id: '1a43a48f-35fe-45b8-8212-b6b75c72484f', method: 'bnp-paribas', asset: 'usdt' },
  ];
  const ids = copies.map(row => row.id);
  await db.delete(manualDeskPricingRulesTable).where(inArray(manualDeskPricingRulesTable.id, ids));
  // The disposable Development clone can have the same selectors under
  // different IDs. Remove just those test-copy collisions before seeding.
  await db.delete(manualDeskPricingRulesTable).where(or(...copies.map(row => and(
    eq(manualDeskPricingRulesTable.sourceSettlementOptionId, `fiat:00000000-0000-4000-8000-000000000002:${row.method}`),
    eq(manualDeskPricingRulesTable.targetCryptoAssetId, row.asset),
    eq(manualDeskPricingRulesTable.priority, 0),
  ))));
  await db.insert(manualDeskPricingRulesTable).values(copies.map(row => ({
    id: row.id, name: 'Coin to Eur', version: 5, enabled: true,
    sourceAsset: 'EUR', sourceNetwork: 'SEPA',
    sourceSettlementOptionId: `fiat:00000000-0000-4000-8000-000000000002:${row.method}`,
    targetCryptoAssetId: row.asset, markupBasisPoints: 120, adjustmentDirection: 'MARKUP',
    fixedFee: null, exactRate: '0.95', minAmount: '500', maxAmount: '20000', priority: 0,
  })));
  const before = await db.select().from(manualDeskPricingRulesTable);
  const knownOptions = new Set<string>(); // Both deleted payment methods are unavailable.

  await t.test('the two USDC orphan copies delete even with no available settlement options', async () => {
    const selected = ids.slice(0, 2);
    const result = await bulkUpdateManualPricingRules(selected.map(id => ({ id, version: 5 })), 'delete', undefined, knownOptions);
    assert.deepEqual(result.updatedIds, selected);
    assert.deepEqual(result.skipped, []);
    const fresh = await db.select().from(manualDeskPricingRulesTable);
    assert.deepEqual(fresh, before.filter(row => !selected.includes(row.id)));
    const loaded = await pool.query('SELECT id FROM manual_desk_pricing_rules WHERE id = ANY($1::uuid[])', [selected]);
    assert.equal(loaded.rowCount, 0, 'a fresh database read must not resurrect deleted rules');
    assert.equal(result.rows.length, before.length - 2);
  });

  await t.test('a stale version is skipped visibly and never deleted', async () => {
    const result = await bulkUpdateManualPricingRules([{ id: ids[2], version: 4 }], 'delete', undefined, knownOptions);
    assert.deepEqual(result.updatedIds, []);
    assert.equal(result.skipped[0].code, 'MANUAL_PRICING_RULE_VERSION_CONFLICT');
    assert.equal(result.skipped[0].id, ids[2]);
    assert.equal(result.skipped[0].currentVersion, 5);
  });

  await t.test('availability validation remains enforced for enabling the orphan', async () => {
    const result = await bulkUpdateManualPricingRules([{ id: ids[2], version: 5 }], 'enable', undefined, knownOptions);
    assert.deepEqual(result.updatedIds, []);
    assert.equal(result.skipped[0].code, 'SETTLEMENT_OPTION_INVALID');
    assert.deepEqual(result.rows.find(row => row.id === ids[2]), before.find(row => row.id === ids[2]));
  });

  await t.test('partial deletion reports missing selections and deletes only the permitted third copy', async () => {
    const missing = randomUUID();
    const result = await bulkUpdateManualPricingRules([{ id: missing, version: 1 }, { id: ids[2], version: 5 }], 'delete', undefined, knownOptions);
    assert.deepEqual(result.updatedIds, [ids[2]]);
    assert.equal(result.skipped[0].id, missing);
    assert.equal(result.skipped[0].code, 'MANUAL_PRICING_RULE_NOT_FOUND');
    assert.deepEqual(await db.select().from(manualDeskPricingRulesTable), before.filter(row => !ids.includes(row.id)));
  });

  await t.test('read-only legacy selectors can be deliberately deleted without repricing anything', async () => {
    const id = randomUUID();
    await db.insert(manualDeskPricingRulesTable).values({ id, name: 'Legacy orphan', sourceAsset: 'EUR', sourceNetwork: 'SEPA', priority: 1000003, markupBasisPoints: 0 });
    const result = await bulkUpdateManualPricingRules([{ id, version: 1 }], 'delete', undefined, knownOptions);
    assert.deepEqual(result.updatedIds, [id]);
    assert.deepEqual(result.skipped, []);
  });

  await t.test('an actual referencing constraint returns a clear conflict and rolls back all deletions', async () => {
    const referenced = randomUUID();
    const other = randomUUID();
    await db.insert(manualDeskPricingRulesTable).values([
      { id: referenced, name: 'Referenced synthetic rule', priority: 1000001, markupBasisPoints: 0 },
      { id: other, name: 'Unreferenced synthetic rule', priority: 1000002, markupBasisPoints: 0 },
    ]);
    // DDL uses only the disposable database owner. The actual deletion below
    // still runs through the normal restricted application role.
    const owner = new DatabaseLockClient({ connectionString: process.env.DATABASE_URL });
    await owner.connect();
    try {
      await owner.query(`CREATE TABLE manual_pricing_delete_regression_refs (
        rule_id uuid REFERENCES manual_desk_pricing_rules(id) ON DELETE RESTRICT
      )`);
      await owner.query('INSERT INTO manual_pricing_delete_regression_refs(rule_id) VALUES ($1)', [referenced]);
      await assert.rejects(bulkUpdateManualPricingRules([{ id: referenced, version: 1 }, { id: other, version: 1 }], 'delete', undefined, knownOptions),
        (error: any) => error.code === 'MANUAL_PRICING_RULE_DELETE_BLOCKED' && /No selected pricing rules were deleted/.test(error.message));
      const retained = await db.select().from(manualDeskPricingRulesTable).where(inArray(manualDeskPricingRulesTable.id, [referenced, other]));
      assert.equal(retained.length, 2);
    } finally {
      await owner.query('DROP TABLE IF EXISTS manual_pricing_delete_regression_refs');
      await owner.end();
      await db.delete(manualDeskPricingRulesTable).where(inArray(manualDeskPricingRulesTable.id, [referenced, other]));
    }
  });
});
