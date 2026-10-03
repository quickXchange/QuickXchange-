import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
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

test("bulk reserve requires Owner and atomically sets each existing currency without altering other fields", async () => {
  const eurId = randomUUID(), usdId = randomUUID(), integerId = randomUUID();
  const ids = [0, 1, 2, 3].map(() => `bulk-reserve-${randomUUID().slice(0, 8)}`);
  const userId = `bulk-reserve-user-${randomUUID()}`, email = `${userId}@example.test`;
  configureOperatorAuthorizationForTests({ getUserId: () => userId, getVerifiedEmail: () => email });
  const [operator] = await db.insert(operatorsTable).values({
    clerkUserId: userId, email, role: "operator", status: "active", permissionAllows: ["payment_methods.manage"],
  }).returning();
  await db.insert(fiatCurrenciesTable).values([
    { id: eurId, code: "BVE", name: "Bulk Euro", precision: 2, enabled: false },
    { id: usdId, code: "BVU", name: "Bulk Dollar", precision: 2, enabled: false },
    { id: integerId, code: "BVI", name: "Bulk integer", precision: 0, enabled: false },
  ]);
  await db.insert(paymentMethodsTable).values(ids.map((id, index) => ({
    id, name: `Bulk fixture ${index}`, enabled: false, canSend: false, canReceive: true,
    fieldDefinitions: [{ key: "account", label: "Account", type: "text", required: true }],
  })));
  const rows = await db.insert(fiatCurrencyPaymentMethodsTable).values([
    { paymentMethodId: ids[0], fiatCurrencyId: eurId, reserve: "7.25", enabled: false, feePercent: "2.5" },
    { paymentMethodId: ids[0], fiatCurrencyId: usdId, reserve: "9.50", enabled: true },
    { paymentMethodId: ids[1], fiatCurrencyId: eurId, reserve: "11.25", enabled: true },
    { paymentMethodId: ids[2], fiatCurrencyId: integerId, reserve: "12", enabled: false },
  ]).returning();
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? error.status ?? 400).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server unavailable.");
  const request = (data: unknown) => fetch(`http://127.0.0.1:${address.port}/api/admin/payment-methods/bulk-reserve`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  const selected = ids.slice(0, 2);
  const expectedAttachmentIds = rows.filter(row => selected.includes(row.paymentMethodId)).map(row => row.id);
  const input = { methodIds: selected, reserve: "10000", expectedAttachmentIds };
  const readAttachments = () => db.select().from(fiatCurrencyPaymentMethodsTable)
    .where(inArray(fiatCurrencyPaymentMethodsTable.paymentMethodId, ids));
  const stripReserve = ({ reserve: _reserve, updatedAt: _updatedAt, ...rest }: any) => rest;
  try {
    assert.equal((await request(input)).status, 403, "Staff with management permission cannot bulk set reserves.");
    const [owner] = await db.select().from(operatorsTable).where(eq(operatorsTable.role, "owner")).limit(1);
    assert.ok(owner, "The isolated snapshot must include its existing Owner.");
    configureOperatorAuthorizationForTests({ getUserId: () => owner.clerkUserId, getVerifiedEmail: () => owner.email });
    const beforeMethods = await db.select().from(paymentMethodsTable).where(inArray(paymentMethodsTable.id, ids));
    const beforeRows = await readAttachments();
    let invalidations = 0;
    onBestchangeConfigurationChange(() => { invalidations++; });
    const applied = await request(input);
    assert.equal(applied.status, 200, await applied.clone().text());
    assert.deepEqual(await applied.json(), { updatedMethods: 2, updatedReserves: 3 });
    assert.equal(invalidations, 1);
    const afterRows = await readAttachments();
    for (const row of afterRows) {
      assert.equal(Number(row.reserve), selected.includes(row.paymentMethodId) ? 10000 : 12);
      assert.deepEqual(stripReserve(row), stripReserve(beforeRows.find(before => before.id === row.id)));
    }
    assert.deepEqual(await db.select().from(paymentMethodsTable).where(inArray(paymentMethodsTable.id, ids)), beforeMethods);
    const direction = {
      id: randomUUID(), enabled: true, sourceOptionId: "crypto:bulk-fixture",
      targetOptionId: `fiat:${eurId}:${ids[1]}`, fromCode: "USDTTRC20", toCode: "SEPAEUR",
      reserve: "7", minAmount: "100", maxAmount: "1000", params: [], cities: [],
      selectedAddOnKeys: [], includeFeeTags: false,
    };
    const config = { enabled: false, version: 1, directions: [direction] };
    const prepare = async () => ({
      effectiveMinAmount: 1, effectiveMaxAmount: 1000, targetPrecision: 2, tiers: [], rangeOnlyPricing: false,
      quote: async (amount: number) => String(amount * 2),
    });
    assert.match((await generate(config, prepare)).xml, /<amount>10000<\/amount>/);
    for (const reserve of ["-1", "1e4", "NaN", "0.001", "100000000000000000000"]) {
      assert.equal((await request({ ...input, reserve })).status, 400);
    }
    assert.equal((await request({ ...input, name: "Not allowed" })).status, 400);
    assert.equal((await request({ ...input, methodIds: [ids[0], ids[0]] })).status, 400);
    assert.equal((await request({ ...input, methodIds: [] })).status, 400);
    assert.equal((await request({ ...input, expectedAttachmentIds: expectedAttachmentIds.slice(1) })).status, 409);
    assert.equal((await request({ ...input, methodIds: [ids[0], ids[3]] })).status, 400);
    assert.equal((await request({ ...input, methodIds: [ids[0], "missing-fixture"] })).status, 404);
    const mixed = { ...input, methodIds: [ids[0], ids[2]], reserve: "1.25",
      expectedAttachmentIds: rows.filter(row => [ids[0], ids[2]].includes(row.paymentMethodId)).map(row => row.id) };
    assert.equal((await request(mixed)).status, 400, "A single currency precision failure must roll back all selected reserves.");
    assert.deepEqual(await readAttachments(), afterRows, "Invalid bulk requests must not partially save.");
    assert.equal(invalidations, 1, "Rejected requests must not invalidate feeds.");
    assert.equal((await request({ ...input, reserve: "0" })).status, 200);
    assert.ok((await readAttachments()).filter(row => selected.includes(row.paymentMethodId)).every(row => Number(row.reserve) === 0));
    assert.equal((await generate(config, prepare)).exportedCount, 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const id of ids) await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.id, id));
    for (const id of [eurId, usdId, integerId]) await db.delete(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.id, id));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
  }
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