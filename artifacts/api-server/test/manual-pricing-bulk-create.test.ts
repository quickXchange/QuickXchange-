import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import { inArray } from "drizzle-orm";
import { db, manualDeskPricingRulesTable } from "@workspace/db";
import { upsertManualPricingRules } from "../src/lib/manual-desk-pricing";

test("bulk pricing creation updates identical routes instead of duplicating them", async () => {
  const suffix = randomUUID();
  const priority = randomInt(800_000, 900_000);
  const targets = [`test-target-a-${suffix}`, `test-target-b-${suffix}`];
  const rules = targets.map((target, index) => ({
    name: `Bulk route ${index + 1}`,
    sourceAsset: null,
    targetAsset: `T${index + 1}`,
    sourceNetwork: null,
    targetNetwork: `Network ${index + 1}`,
    paymentMethod: null,
    payoutMethod: null,
    sourceSettlementOptionId: null,
    targetSettlementOptionId: target,
    markupBasisPoints: 100,
    adjustmentDirection: "MARKUP" as const,
    fixedFee: "0",
    exactRate: null,
    minAmount: null,
    maxAmount: null,
    operatorInstructions: null,
    customerInstructions: null,
    expectedSettlementMinutes: null,
    priority,
    enabled: true,
  }));
  let ids: string[] = [];
  try {
    const created = await upsertManualPricingRules(rules);
    assert.equal(created.createdIds.length, 2);
    assert.equal(created.updatedIds.length, 0);
    ids = created.createdIds;

    const updated = await upsertManualPricingRules(rules.map(rule => ({
      ...rule,
      markupBasisPoints: 125,
      fixedFee: "2",
    })));
    assert.equal(updated.createdIds.length, 0);
    assert.deepEqual(new Set(updated.updatedIds), new Set(ids));

    const persisted = await db.select().from(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ids));
    assert.equal(persisted.length, 2);
    assert.ok(persisted.every(rule => rule.markupBasisPoints === 125 && Number(rule.fixedFee) === 2));
    assert.ok(persisted.every(rule => rule.version === 2));
  } finally {
    if (ids.length) {
      await db.delete(manualDeskPricingRulesTable)
        .where(inArray(manualDeskPricingRulesTable.id, ids));
    }
  }
});