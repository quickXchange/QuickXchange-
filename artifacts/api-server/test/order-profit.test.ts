import assert from "node:assert/strict";
import { once } from "node:events";
import test, { before, after } from "node:test";
import express from "express";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool, operatorsTable, ordersTable, quickexOrdersTable, profitRecordsTable, profitRatesTable, orderAuditLogsTable } from "@workspace/db";
import { calculateProfit, sum } from "../src/lib/order-profit-math";
import { profitReport } from "../src/lib/order-profit";
import router from "../src/routes/order-profit";
import { adminPolicy } from "../src/lib/admin-policy";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";
import { ApiError } from "../src/lib/api-error";
import { assertIsolatedWhitebitDatabase } from "./assert-isolated-whitebit-database";

assertIsolatedWhitebitDatabase();
configureOperatorAuthorizationForTests({
  getUserId: req => req.get("x-test-operator") ?? null,
  getVerifiedEmail: id => `${id}@example.test`,
  getTotpEnabled: () => true, getSecondFactorVerified: () => true,
});
const app = express();
app.use(pinoHttp({ level: "silent" }), express.json());
app.use("/api", adminPolicy, router);
app.use((err: ApiError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err.status || 500).json({ code: err.code, error: err.message });
});
let server: ReturnType<typeof app.listen>, base = "";
const basis = {
  currency: "EUR", sourceUnitValue: "1", targetUnitCost: "0.890",
  providerFee: "1", networkFee: "0.5", bankFee: "2", otherFee: "0",
  evidence: "Synthetic verified acquisition and executed payout receipt", costsVerified: true as const,
};
async function request(path = "", body?: unknown, actor = "profit-owner") {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-test-operator": actor }, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function seed(id: string, overrides: Partial<typeof ordersTable.$inferInsert> = {}) {
  await db.insert(ordersTable).values({
    id, type: "manual", status: "completed", fromAsset: "EUR", fromNetwork: "SEPA Instant",
    toAsset: "USDT", toNetwork: "TRC20", amount: "898", receiveAmount: "1000",
    customerEmail: "synthetic-profit@example.test", provider: "Manual desk", createdAt: new Date("2025-01-01"),
    pricingSnapshot: { original: "never revalue or overwrite" }, ...overrides,
  });
}
before(async () => {
  for (const [id, role, allows] of [
    ["profit-owner", "owner", []], ["profit-viewer", "operator", ["statistics.view"]],
    ["profit-no-access", "operator", []],
  ] as const) await db.insert(operatorsTable).values({
    clerkUserId: id, email: `${id}@example.test`, name: "Synthetic Profit Tester",
    role, status: "active", legacyPermissionEligible: false, permissionAllows: [...allows],
  });
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/profit-dashboard`;
});
after(async () => { server.close(); await once(server, "close"); await pool.end(); });

test("exact EUR Buy/Sell, crypto pairs, networks, fees, losses and large decimal arithmetic", () => {
  const buy = calculateProfit("898", "1000", basis);
  assert.equal(buy.grossSpread, "8"); assert.equal(buy.netProfit, "4.5");
  const sell = calculateProfit("1000", "890", { ...basis, sourceUnitValue: "0.898", targetUnitCost: "1" });
  assert.equal(sell.grossSpread, "8"); assert.equal(sell.netProfit, "4.5");
  const cross = calculateProfit("1", "30", { ...basis, sourceUnitValue: "60000", targetUnitCost: "1900" });
  assert.equal(cross.netProfit, "2996.5");
  const loss = calculateProfit("890", "1000", { ...basis, targetUnitCost: "0.9" });
  assert.equal(loss.netProfit, "-13.5");
  const usd = calculateProfit("100.01", "100", { ...basis, currency: "USD", targetUnitCost: "0.99" });
  assert.equal(usd.grossSpread, "1.01");
  assert.equal(sum("9007199254740993.000000000000000001", "0.000000000000000009"), "9007199254740993.00000000000000001");
  assert.throws(() => calculateProfit("0", "100", basis));
});

test("only completed orders count; missing costs stay unavailable; canonical Convert deduplicates legacy mirror", async () => {
  await seed("PROFIT-BUY");
  for (const status of ["pending", "processing", "failed", "cancelled"]) await seed(`EXCLUDE-${status}`, { status });
  await seed("PROFIT-CONVERT", { type: "instant" });
  await db.insert(quickexOrdersTable).values({
    legacyOrderId: "PROFIT-CONVERT", status: "completed", route: { fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "BEP20" },
    amounts: { amount: "1", paidAmount: "1", receiveAmount: "65000", actualReceiveAmount: "65000" }, addresses: {}, createdAt: new Date("2025-01-02"), updatedAt: new Date(),
  });
  const report = await profitReport({ page: 1 }, true);
  assert.equal(report.completedOrders, 2); assert.equal(report.missingCosts, 2);
  assert.equal(report.rows.filter(r => r.id === "PROFIT-CONVERT").length, 1);
  assert.equal(report.rows.find(r => r.id === "PROFIT-CONVERT")?.type, "Convert");
  assert.equal(report.summary.length, 0);
  assert(report.rows.every(r => r.netProfit === null));
  assert(report.rows.every(r => r.href.includes(`/admin/orders/${r.id}?type=`)));
});

test("permissions, validation and exact units are enforced, without bypassing Admin policy", async () => {
  assert.equal((await request("", undefined, "profit-no-access")).status, 403);
  assert.equal((await request("", undefined, "profit-viewer")).status, 200);
  assert.equal((await request("/rates", { ...basis, fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "USDT", toNetwork: "TRC20" }, "profit-viewer")).status, 403);
  assert.equal((await request("/orders/Swap/PROFIT-BUY/basis", { ...basis, requestId: randomUUID(), costsVerified: false })).status, 400);
  assert.equal((await request("/orders/Swap/PROFIT-BUY/basis", { ...basis, requestId: randomUUID(), sourceUnitValue: "1.000000000000000001" })).status, 400);
  assert.equal((await request("?from=2025-03-01&to=2025-01-01")).status, 400);
});

test("Owner historical cost attestation is idempotent, exact and append-only; order pricing is unchanged", async () => {
  const body = { ...basis, requestId: randomUUID() };
  const responses = await Promise.all(Array.from({ length: 4 }, () => request("/orders/Swap/PROFIT-BUY/basis", body)));
  assert(responses.every(r => r.ok));
  assert.equal((await db.select().from(profitRecordsTable).where(eq(profitRecordsTable.orderKey, "Swap:PROFIT-BUY"))).length, 1);
  assert.equal((await request("/orders/Swap/PROFIT-BUY/basis", { ...body, providerFee: "9" })).status, 409);
  const report = await profitReport({ page: 1, search: "PROFIT-BUY" }, true);
  assert.equal(report.rows[0].grossSpread, "8"); assert.equal(report.rows[0].netProfit, "4.5");
  assert.equal(report.summary[0].costs, "893.5");
  assert.deepEqual((await db.select().from(ordersTable).where(eq(ordersTable.id, "PROFIT-BUY")))[0].pricingSnapshot, { original: "never revalue or overwrite" });
  await assert.rejects(db.update(profitRecordsTable).set({ reason: "rewrite" }).where(eq(profitRecordsTable.requestId, body.requestId)));
});

test("new rate versions only value future orders and never backfill historical completed orders", async () => {
  const route = { ...basis, fromAsset: "EUR", fromNetwork: "SEPA Instant", toAsset: "USDT", toNetwork: "TRC20" };
  assert.equal((await request("/rates", route)).status, 201);
  await seed("PROFIT-OLD-MISSING");
  await seed("PROFIT-FUTURE", { createdAt: new Date("2040-01-01") });
  const report = await profitReport({ page: 1 }, true);
  assert.equal(report.rows.find(r => r.id === "PROFIT-OLD-MISSING")?.state, "missing");
  assert.equal(report.rows.find(r => r.id === "PROFIT-FUTURE")?.netProfit, "4.5");
  await assert.rejects(db.delete(profitRatesTable));
});

test("Convert actual payout facts and independently verified costs are required; USD stays separate", async () => {
  await request("/orders/Convert/PROFIT-CONVERT/basis", { ...basis, currency: "USD", sourceUnitValue: "66000", targetUnitCost: "1", requestId: randomUUID() });
  let report = await profitReport({ page: 1, search: "PROFIT-CONVERT" }, true);
  assert.equal(report.rows[0].netProfit, "996.5"); assert.equal(report.summary[0].currency, "USD");
  assert.equal((await profitReport({ page: 1 }, true)).summary.length, 2);
});

test("auditable adjustment is idempotent, currency locked, and refunds remove base profit without duplicating entries", async () => {
  const input = { currency: "EUR", amount: "-10", reason: "Synthetic corrected bank cost", requestId: randomUUID() };
  assert((await request("/orders/Swap/PROFIT-BUY/adjustments", input)).ok);
  assert((await request("/orders/Swap/PROFIT-BUY/adjustments", input)).ok);
  assert.equal((await profitReport({ page: 1, search: "PROFIT-BUY" }, true)).rows[0].netProfit, "-5.5");
  assert.equal((await request("/orders/Swap/PROFIT-BUY/basis", { ...basis, currency: "USD", requestId: randomUUID() })).status, 409);
  await db.update(ordersTable).set({ status: "refunded" }).where(eq(ordersTable.id, "PROFIT-BUY"));
  await db.insert(orderAuditLogsTable).values({
    orderId: "PROFIT-BUY", action: "status_changed", actorType: "operator", actorId: "synthetic", previousVersion: 1, nextVersion: 2, details: { status: "refunded" },
  });
  const report = await profitReport({ page: 1, search: "PROFIT-BUY" }, true);
  assert.equal(report.completedOrders, 0); assert.equal(report.rows[0].netProfit, "-10");
  assert.equal(report.rows[0].state, "reversed");
  assert.equal(report.rows[0].audit.filter(a => a.kind === "reversal").length, 1);
  assert.equal(report.rows[0].audit.find(a => a.kind === "reversal")?.amount, "-4.5");
  assert.equal((await db.select().from(profitRecordsTable).where(eq(profitRecordsTable.orderKey, "Swap:PROFIT-BUY"))).length, 2);
});

test("filters, totals, search, CSV and enabled currency discovery preserve exact values", async () => {
  const loss = await profitReport({ page: 1, profit: "loss" }, true);
  assert(loss.rows.every(r => r.netProfit?.startsWith("-")));
  const report = await profitReport({ page: 1, type: "Convert", currency: "USD" }, true);
  assert.equal(report.total, 1); assert.equal(report.rows[0].id, "PROFIT-CONVERT");
  assert(report.currencies.includes("EUR")); assert(report.currencies.includes("BTC"));
  const csv = await (await request(".csv?type=Convert")).text();
  assert(csv.includes('"PROFIT-CONVERT"')); assert(csv.includes('"996.5"'));
  assert(!csv.includes("synthetic-profit@example.test"));
  assert.equal((await request(".csv", undefined, "profit-viewer")).status, 403);
});

test("automatic Convert basis requires paid and actual payout facts, never expected quote amounts", async () => {
  assert.equal((await request("/rates", { ...basis, fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "BEP20", sourceUnitValue: "60000", targetUnitCost: "0.9" })).status, 201);
  for (const actual of [false, true]) await db.insert(quickexOrdersTable).values({
    legacyOrderId: `FACT-PROOF-${actual}`, status: "completed",
    route: { fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USDT", toNetwork: "BEP20" },
    amounts: { amount: "1", paidAmount: "1", receiveAmount: "65000", ...(actual ? { actualReceiveAmount: "65000" } : {}) },
    addresses: {}, createdAt: new Date("2040-01-01"), updatedAt: new Date(),
  });
  const report = await profitReport({ page: 1, search: "FACT-PROOF" }, true);
  assert.equal(report.rows.find(r => r.id === "FACT-PROOF-false")?.netProfit, null);
  assert.equal(report.rows.find(r => r.id === "FACT-PROOF-true")?.netProfit, "1496.5");
});

test("CSV includes all matching pages and report totals are not limited to the first 25 rows", async () => {
  for (let n = 0; n < 30; n++) await seed(`PROFIT-PAGE-${n}`, { createdAt: new Date("2040-01-01") });
  const report = await profitReport({ page: 1, search: "PROFIT-PAGE-" }, true);
  assert.equal(report.rows.length, 25); assert.equal(report.total, 30);
  assert.equal(report.summary[0].profit, "135");
  assert.equal((await profitReport({ page: 2, search: "PROFIT-PAGE-" }, true)).rows.length, 5);
  const csv = await (await request(".csv?search=PROFIT-PAGE-")).text();
  assert.equal(csv.split("\r\n").length, 31);
});

test("saved execution overrides and exact bank option identities prevent mixing route costs", async () => {
  assert.equal((await request("/rates", {
    ...basis, providerFee: "10", fromAsset: "EUR", fromNetwork: "SEPA Instant", toAsset: "USDT", toNetwork: "TRC20",
    fromOptionId: "fiat:synthetic-eur:wise", toOptionId: "",
  })).status, 201);
  for (const bank of ["wise", "ing"]) await seed(`PROFIT-BANK-${bank}`, {
    createdAt: new Date("2040-01-01"), sentAmountOverride: "900",
    pricingSnapshot: { rule: { selectors: { sourceSettlementOptionId: `fiat:synthetic-eur:${bank}` } } },
  });
  const report = await profitReport({ page: 1, search: "PROFIT-BANK" }, true);
  assert.equal(report.rows.find(r => r.id === "PROFIT-BANK-wise")?.netProfit, "-2.5");
  assert.equal(report.rows.find(r => r.id === "PROFIT-BANK-ing")?.netProfit, "6.5");
  assert.equal(report.routes.filter(r => r.fromOptionId?.startsWith("fiat:synthetic-eur:")).length, 2);
  assert.equal((await request("/rates", {
    ...basis, targetUnitCost: "0", fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "USDT", toNetwork: "TRC20",
  })).status, 400);
});

test("cost effective timestamps preserve PostgreSQL microseconds, not rounded JavaScript milliseconds", async () => {
  await db.execute(sql`insert into order_profit_rates(config, actor_id, effective_at)
    values (${JSON.stringify({ ...basis, fromAsset: "EUR", fromNetwork: "MICRO", toAsset: "USDT", toNetwork: "TRC20" })}::jsonb,
      'synthetic', '2040-01-01T00:00:00.000500Z')`);
  await seed("MICRO-BEFORE", { fromNetwork: "MICRO" });
  await seed("MICRO-AFTER", { fromNetwork: "MICRO" });
  await db.execute(sql`update exchange_orders set created_at = '2040-01-01T00:00:00.000499Z' where id = 'MICRO-BEFORE'`);
  await db.execute(sql`update exchange_orders set created_at = '2040-01-01T00:00:00.000501Z' where id = 'MICRO-AFTER'`);
  const report = await profitReport({ page: 1, search: "MICRO-" }, true);
  assert.equal(report.rows.find(r => r.id === "MICRO-BEFORE")?.netProfit, null);
  assert.equal(report.rows.find(r => r.id === "MICRO-AFTER")?.netProfit, "4.5");
});
