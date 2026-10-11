import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import {
  db, pool, operatorsTable, paymentMethodsTable, fiatCurrenciesTable,
  fiatCurrencyPaymentMethodsTable, bestchangeSettingsTable,
} from "@workspace/db";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";
import router from "../src/routes/rates-xml";

if (process.env.API_TEST_DISPOSABLE_DATABASE !== "1") throw new Error("XML API tests require a disposable database.");
after(() => pool.end());

test("Owner-only method metadata persists; stale or invalid changes roll back and legacy settings survive", async () => {
  const nativeFetch = globalThis.fetch;
  // Never contact real providers using cloned configuration.
  globalThis.fetch = async () => { throw new Error("External I/O disabled in isolated XML API tests."); };
  const [currency] = await db.select().from(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.code, "USD"));
  assert.ok(currency);
  const id = `xml-method-${randomUUID()}`, userId = `xml-operator-${randomUUID()}`;
  const email = `${userId}@example.test`;
  const [operator] = await db.insert(operatorsTable).values({
    clerkUserId: userId, email, role: "operator", status: "active", permissionAllows: ["site_settings.manage"],
  }).returning();
  await db.insert(paymentMethodsTable).values({ id, name: "XML test method", enabled: true, canSend: true, canReceive: true });
  const [attachment] = await db.insert(fiatCurrencyPaymentMethodsTable).values({
    fiatCurrencyId: currency.id, paymentMethodId: id,
  }).returning();
  assert.equal(Number(attachment.reserve), 1000000, "new attachment default is one million");
  const beforeLegacy = (await db.select().from(bestchangeSettingsTable).where(eq(bestchangeSettingsTable.id, 1)))[0];
  configureOperatorAuthorizationForTests({
    getUserId: () => userId, getVerifiedEmail: () => email,
    getTotpEnabled: () => true, getSecondFactorVerified: () => true,
  });
  const app = express(); app.use(express.json()); app.use("/api", router);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? error.statusCode ?? 500).json({ message: error.message }));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/admin/rates-xml`;
  const patch = (body: unknown) => nativeFetch(`${base}/method`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const current = async () => {
    const response = await nativeFetch(base);
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as { version: number; methods: Array<{ optionId: string; code: string | null; reserve: string }>; currencyCodes: unknown[] };
  };
  try {
    assert.equal((await nativeFetch(base)).status, 403, "operators cannot access Owner-only XML settings");
    const [owner] = await db.select().from(operatorsTable).where(eq(operatorsTable.role, "owner")).limit(1);
    assert.ok(owner);
    configureOperatorAuthorizationForTests({
      getUserId: () => owner.clerkUserId, getVerifiedEmail: () => owner.email,
      getTotpEnabled: () => true, getSecondFactorVerified: () => true,
    });
    let config = await current();
    assert.equal(config.currencyCodes.length, 332);
    const optionId = `fiat:${currency.id}:${id}`;
    const original = config.methods.find(m => m.optionId === optionId)!;
    assert.ok(original);
    const invalid = await patch({ version: config.version, optionId, code: "INVENTED" });
    assert.equal(invalid.status, 400);
    const wrongType = await patch({ version: config.version, optionId, code: "BTC" });
    assert.equal(wrongType.status, 400);
    const staleVersion = config.version;
    const saved = await patch({
      version: config.version, optionId, code: "PPUSD", reserve: "123456.123456789",
      expectedReserve: original.reserve,
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    config = await current();
    const method = config.methods.find(m => m.optionId === optionId)!;
    assert.equal(method.code, "PPUSD");
    assert.equal(Number(method.reserve), 123456.123456789);
    assert.equal(config.version, staleVersion + 1);
    assert.equal((await patch({ version: staleVersion, optionId, code: "PMUSD" })).status, 409);
    // An independent Payment Methods save must fence an older XML reserve draft.
    await db.update(fiatCurrencyPaymentMethodsTable).set({ reserve: "42" })
      .where(eq(fiatCurrencyPaymentMethodsTable.id, attachment.id));
    assert.equal((await patch({
      version: config.version, optionId, code: "PMUSD", reserve: "500", expectedReserve: method.reserve,
    })).status, 409);
    config = await current();
    assert.equal(config.methods.find(m => m.optionId === optionId)!.code, "PPUSD", "failed reserve save rolls back its code change");
    assert.equal(Number(config.methods.find(m => m.optionId === optionId)!.reserve), 42);
    assert.equal((await patch({ version: config.version, optionId, code: null })).status, 200);
    config = await current();
    assert.equal(config.methods.find(m => m.optionId === optionId)!.code, null);
    assert.equal(Number(config.methods.find(m => m.optionId === optionId)!.reserve), 42, "code-only update never changes reserve");
    const confirmation = await nativeFetch(`${base}/activate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: config.version, reviewHash: "not-reviewed", confirm: false }),
    });
    assert.equal(confirmation.status, 400);
    const afterLegacy = (await db.select().from(bestchangeSettingsTable).where(eq(bestchangeSettingsTable.id, 1)))[0];
    assert.deepEqual(afterLegacy.directions, beforeLegacy?.directions ?? []);
    assert.deepEqual(afterLegacy.xmlPercentageAdjustment, beforeLegacy?.xmlPercentageAdjustment ?? {
      enabled: false, activeOrderPercent: "0", noActiveOrderPercent: "0",
    });
    assert.equal(afterLegacy.ratesXmlPublished, beforeLegacy?.ratesXmlPublished ?? false);
  } finally {
    globalThis.fetch = nativeFetch;
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
