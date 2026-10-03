import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool, fiatCurrenciesTable, fiatCurrencyPaymentMethodsTable, paymentMethodsTable, operatorsTable } from "@workspace/db";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";
import { normalizePaymentMethodReserve } from "../src/lib/payment-method-reserves";
import { onBestchangeConfigurationChange } from "../src/lib/bestchange-cache-invalidation";
import { generate } from "../src/routes/bestchange";
import router from "../src/routes/exchange";

if (process.env.API_TEST_DISPOSABLE_DATABASE !== "1") throw new Error("Reserve tests require a disposable database.");
after(() => pool.end());

test("reserves preserve exact decimals and respect currency precision without floating point", () => {
  assert.equal(normalizePaymentMethodReserve("00015000.250000", 2), "15000.25");
  assert.equal(normalizePaymentMethodReserve("99999999999999999999.99", 2), "99999999999999999999.99");
  assert.equal(normalizePaymentMethodReserve("0.000", 0), "0");
  assert.equal(normalizePaymentMethodReserve("1.234", 3), "1.234");
  for (const invalid of ["-1", "NaN", "Infinity", "1e3", "15,000", "0.001"]) {
    assert.throws(() => normalizePaymentMethodReserve(invalid, 2));
  }
  assert.throws(() => normalizePaymentMethodReserve("1.1", 0));
});

test("Admin Add/Edit stores independent currency reserves atomically; feed shares current destination reserve and omits zero", async () => {
  const eurId = randomUUID(), usdId = randomUUID();
  const methodId = `reserve-test-${randomUUID().slice(0, 8)}`;
  const userId = `reserve-user-${randomUUID()}`;
  const email = `${userId}@example.test`;
  configureOperatorAuthorizationForTests({ getUserId: () => userId, getVerifiedEmail: () => email });
  const [operator] = await db.insert(operatorsTable).values({
    clerkUserId: userId, email, role: "operator", status: "active", permissionAllows: ["payment_methods.manage", "payment_methods.view"],
  }).returning();
  await db.insert(fiatCurrenciesTable).values([
    { id: eurId, code: "RVE", name: "Reserve test Euro", precision: 2, enabled: false },
    { id: usdId, code: "RVU", name: "Reserve test Dollar", precision: 2, enabled: false },
  ]);
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? error.status ?? 400).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server unavailable.");
  const base = `http://127.0.0.1:${address.port}/api`;
  let invalidations = 0;
  onBestchangeConfigurationChange(() => { invalidations++; });
  const request = (path: string, method: string, data?: unknown) => fetch(base + path, {
    method, headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined,
  });
  try {
    const created = await request("/admin/payment-methods", "POST", {
      id: methodId, name: "Reserve fixture", enabled: true, canSend: true, canReceive: true, fieldDefinitions: [],
      reserves: [{ fiatCurrencyId: eurId, reserve: "15000.25" }, { fiatCurrencyId: usdId, reserve: "99.30" }],
    });
    assert.equal(created.status, 201, await created.text());
    const getRows = async () => {
      const response = await request("/admin/fiat-currency-payment-methods", "GET");
      return (await response.json() as any[]).filter(row => row.paymentMethodId === methodId);
    };
    let rows = await getRows();
    assert.equal(rows.find(row => row.fiatCurrencyId === eurId).reserve, "15000.25");
    assert.equal(rows.find(row => row.fiatCurrencyId === usdId).reserve, "99.3");
    const targetOptionId = `fiat:${eurId}:${methodId}`;
    const direction = {
      id: randomUUID(), enabled: true, sourceOptionId: "crypto:fixture", targetOptionId,
      fromCode: "USDTTRC20", toCode: "SEPAEUR", reserve: "999999",
      minAmount: "100", maxAmount: "1000", params: [], cities: [], selectedAddOnKeys: [], includeFeeTags: false,
    };
    const config = { enabled: false, version: 1, directions: [direction, { ...direction, id: randomUUID(), sourceOptionId: "crypto:fixture-2" }] };
    let quoteCalls = 0;
    const prepare = async () => ({
      effectiveMinAmount: 1, effectiveMaxAmount: 1000, targetPrecision: 2,
      tiers: [], rangeOnlyPricing: false,
      quote: async (amount: number) => { quoteCalls++; return String(amount * 2); },
    });
    let feed = await generate(config, prepare);
    // This also proves the informational reserve is not capped by this route's maximum payout.
    assert.equal((feed.xml.match(/<amount>15000.25<\/amount>/g) ?? []).length, 2);
    assert.equal(feed.exportedCount, 2);
    assert.ok(!feed.xml.includes("999999"), "Legacy direction reserves must not override Payment Methods.");

    const updated = await request(`/admin/payment-methods/${methodId}`, "PATCH", {
      reserves: [{ fiatCurrencyId: eurId, reserve: "20000.75" }],
    });
    assert.equal(updated.status, 200);
    assert.equal(invalidations, 2, "Successful reserve writes must invalidate cached and in-flight feeds.");
    rows = await getRows();
    assert.equal(rows.find(row => row.fiatCurrencyId === usdId).reserve, "99.3", "Unedited currency must not be overwritten.");
    feed = await generate(config, prepare);
    assert.equal((feed.xml.match(/<amount>20000.75<\/amount>/g) ?? []).length, 2);

    const invalid = await request(`/admin/payment-methods/${methodId}`, "PATCH", {
      name: "Must roll back", reserves: [{ fiatCurrencyId: eurId, reserve: "0.001" }],
    });
    assert.equal(invalid.status, 400);
    const [method] = await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.id, methodId));
    assert.equal(method.name, "Reserve fixture", "Invalid money must roll back the entire method edit.");
    const eur = rows.find(row => row.fiatCurrencyId === eurId);
    const negative = await request(`/admin/fiat-currency-payment-methods/${eur.id}`, "PATCH", { reserve: "-1" });
    assert.equal(negative.status, 400);
    await assert.rejects(db.update(fiatCurrencyPaymentMethodsTable).set({ reserve: "-1" }).where(eq(fiatCurrencyPaymentMethodsTable.id, eur.id)));
    const zero = await request(`/admin/fiat-currency-payment-methods/${eur.id}`, "PATCH", { reserve: "0" });
    assert.equal(zero.status, 200);
    const before = quoteCalls;
    feed = await generate(config, prepare);
    assert.equal(feed.exportedCount, 0);
    assert.equal(quoteCalls, before, "Zero reserves must skip live pricing work.");
    assert.ok(feed.diagnostics.every(row => /Zero destination reserve/.test(row.message)));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.id, methodId));
    await db.delete(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.id, eurId));
    await db.delete(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.id, usdId));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
  }
});