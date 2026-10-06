import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db, pool, fiatCurrenciesTable, fiatCurrencyPaymentMethodsTable,
  paymentMethodsTable, operatorsTable,
} from "@workspace/db";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";
import { onBestchangeConfigurationChange } from "../src/lib/bestchange-cache-invalidation";
import { getDestinationPaymentMethodReserve } from "../src/lib/payment-method-reserves";
import router from "../src/routes/bestchange";

if (process.env.API_TEST_DISPOSABLE_DATABASE !== "1") throw new Error("BestChange reserve tests require a disposable database.");
after(() => pool.end());

test("Owner reviews an exact reserve transfer; stale, tampered, unauthorized or unavailable selections never write", async () => {
  const currency = (await db.select().from(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.code, "EUR")))[0];
  assert.ok(currency);
  const ids = [`bestchange-fixture-${randomUUID().slice(0, 8)}`, `bestchange-fixture-${randomUUID().slice(0, 8)}`];
  const userId = `bestchange-operator-${randomUUID()}`, email = `${userId}@example.test`;
  configureOperatorAuthorizationForTests({ getUserId: () => userId, getVerifiedEmail: () => email });
  const [operator] = await db.insert(operatorsTable).values({
    clerkUserId: userId, email, role: "operator", status: "active", permissionAllows: ["site_settings.manage"],
  }).returning();
  await db.insert(paymentMethodsTable).values(ids.map((id, index) => ({
    id, name: `BestChange fixture ${index}`, enabled: true, canSend: true, canReceive: true,
    fieldDefinitions: [{ key: "account", label: "Account", type: "text", required: true }],
  })));
  await db.insert(fiatCurrencyPaymentMethodsTable).values(ids.map((id, index) => ({
    fiatCurrencyId: currency.id, paymentMethodId: id, reserve: index ? "25" : "400000",
    enabled: true, sendInstructions: `fixture ${index}`, maxAmount: "500000",
  })));
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 400).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not open isolated server.");
  const base = `http://127.0.0.1:${address.port}/api/admin/bestchange/reserves`;
  const post = (endpoint: string, body: unknown) => fetch(`${base}/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const read = () => db.select().from(fiatCurrencyPaymentMethodsTable)
    .where(inArray(fiatCurrencyPaymentMethodsTable.paymentMethodId, ids));
  try {
    assert.equal((await fetch(`${base}/export`)).status, 403);
    assert.equal((await post("preview", { format: "qx-bestchange-reserves-v1", reserves: [] })).status, 403);
    const [owner] = await db.select().from(operatorsTable).where(eq(operatorsTable.role, "owner")).limit(1);
    assert.ok(owner);
    configureOperatorAuthorizationForTests({ getUserId: () => owner.clerkUserId, getVerifiedEmail: () => owner.email });
    const exported = await fetch(`${base}/export`);
    assert.equal(exported.status, 200, await exported.clone().text());
    const bundle = await exported.json() as { format: string; reserves: Array<{ currencyCode: string; paymentMethodId: string; reserve: string }> };
    const chosen = bundle.reserves.filter(row => ids.includes(row.paymentMethodId));
    assert.deepEqual(chosen.map(row => row.reserve).sort(), ["25", "400000"]);
    assert.deepEqual(Object.keys(chosen[0]).sort(), ["currencyCode", "paymentMethodId", "reserve"]);
    const transfer = { format: bundle.format, reserves: chosen };
    assert.equal((await post("preview", { ...transfer, instructions: "should be rejected" })).status, 400);
    assert.equal((await post("preview", { ...transfer, reserves: [chosen[0], chosen[0]] })).status, 400);
    assert.equal((await post("preview", { ...transfer, reserves: [{ ...chosen[0], paymentMethodId: "missing" }] })).status, 409);
    const before = await read();
    await db.update(fiatCurrencyPaymentMethodsTable).set({ reserve: "0" })
      .where(inArray(fiatCurrencyPaymentMethodsTable.paymentMethodId, ids));
    const zero = await read();
    assert.ok(zero.every(row => row.reserve === "0.000000000000000000"));
    const reviewed = await post("preview", transfer);
    assert.equal(reviewed.status, 200, await reviewed.clone().text());
    const review = await reviewed.json() as { reviewHash: string; changes: Array<{ currentReserve: string; proposedReserve: string }> };
    assert.deepEqual(review.changes.map(row => row.proposedReserve).sort(), ["25", "400000"]);
    assert.ok(review.changes.every(row => row.currentReserve === "0"));
    const tampered = { ...transfer, reserves: chosen.map(row => ({ ...row, reserve: "999999" })) };
    assert.equal((await post("apply", { transfer: tampered, reviewHash: review.reviewHash })).status, 409);
    assert.deepEqual(await read(), zero);
    await db.update(fiatCurrencyPaymentMethodsTable).set({ reserve: "1" })
      .where(eq(fiatCurrencyPaymentMethodsTable.paymentMethodId, ids[0]));
    assert.equal((await post("apply", { transfer, reviewHash: review.reviewHash })).status, 409);
    assert.equal((await read()).find(row => row.paymentMethodId === ids[0])?.reserve, "1.000000000000000000");
    const fresh = await (await post("preview", transfer)).json() as { reviewHash: string };
    let invalidations = 0;
    onBestchangeConfigurationChange(() => { invalidations++; });
    const applied = await post("apply", { transfer, reviewHash: fresh.reviewHash });
    assert.equal(applied.status, 200, await applied.clone().text());
    assert.deepEqual(await applied.json(), { updatedCount: 2 });
    assert.equal(invalidations, 1);
    const afterRows = await read();
    assert.deepEqual(afterRows.map(row => Number(row.reserve)).sort((a, b) => a - b), [25, 400000]);
    for (const row of afterRows) {
      const original = before.find(item => item.id === row.id)!;
      assert.equal(row.sendInstructions, original.sendInstructions);
      assert.equal(row.maxAmount, original.maxAmount);
    }
    assert.equal(await getDestinationPaymentMethodReserve(`fiat:${currency.id}:${ids[0]}`),
      afterRows.find(row => row.paymentMethodId === ids[0])!.reserve);
    assert.equal((await post("apply", { transfer, reviewHash: fresh.reviewHash })).status, 409);
    await db.update(fiatCurrencyPaymentMethodsTable).set({ enabled: false })
      .where(eq(fiatCurrencyPaymentMethodsTable.paymentMethodId, ids[0]));
    assert.equal((await post("preview", transfer)).status, 409);
    assert.equal(invalidations, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(paymentMethodsTable).where(inArray(paymentMethodsTable.id, ids));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
  }
});
