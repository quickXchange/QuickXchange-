import assert from "node:assert/strict";
import { once } from "node:events";
import test, { before, after } from "node:test";
import express from "express";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool, operatorsTable, ordersTable, quickexOrdersTable, profitRecordsTable, profitRatesTable, orderAuditLogsTable } from "@workspace/db";
import { calculateProfit, calculateTradeProfit, sum } from "../src/lib/order-profit-math";
import { ProfitTradeBasisInput, ProfitTradeRecordInput, type ProfitTradeBasis } from "@workspace/api-zod";
import { profitReport } from "../src/lib/order-profit";
import { profitPeriods } from "../src/lib/order-profit-periods";
import { processRevenueCompletions } from "../src/lib/order-profit-automatic";
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
  assert.equal(report.rows.length, 6, "Non-completed Swaps are visible without contributing profit");
  assert.equal(report.rows.filter(r => r.state === "not_completed").length, 4);
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

const trade: ProfitTradeBasis = {
  calculation: "trade", currency: "EUR", quantitySide: "source",
  buyMode: "unit", sellMode: "unit", buyValue: "60000", sellValue: "61000",
  buyCurrency: "EUR", sellCurrency: "EUR", buyFx: "1", sellFx: "1",
  commission1Percent: "0", receivingCommissionPercent: "0", additionalFixedFee: "0",
  evidence: "Synthetic verified purchase and sale receipts", costsVerified: true,
};

test("per-order BTC, ETH, Buy/Sell, partial execution and tiny quantities use one exact arithmetic engine", () => {
  assert.equal(calculateTradeProfit("1", "61000", trade).grossSpread, "1000");
  assert.equal(calculateTradeProfit("15000", "0.25", { ...trade, quantitySide: "target" }).netProfit, "250");
  assert.equal(calculateTradeProfit("1.5", "2850", { ...trade, buyValue: "2000", sellValue: "1900", additionalFixedFee: "2" }).netProfit, "-152");
  assert.equal(calculateTradeProfit("0.00000001", "0.00061", trade).netProfit, "0.00001");
  assert.equal(calculateTradeProfit("1000", "898", { ...trade, buyValue: "0.890", sellValue: "0.898" }).netProfit, "8");
  assert.equal(calculateTradeProfit("0.25", "15250", { ...trade, buyMode: "total", sellMode: "total", buyValue: "15000", sellValue: "15250" }).netProfit, "250");
});

test("commissions use independent disclosed bases and fixed fees are deducted exactly once", () => {
  const result = calculateTradeProfit("1", "61000", {
    ...trade, commission1Percent: "1", receivingCommissionPercent: "0.5", additionalFixedFee: "10",
  });
  assert.equal(result.commission1, "600"); assert.equal(result.receivingCommission, "305");
  assert.equal(result.fees, "915"); assert.equal(result.netProfit, "85");
  assert.equal(calculateTradeProfit("1", "61000", { ...trade, commission1Percent: "100" }).netProfit, "-59000");
  assert(!ProfitTradeBasisInput.safeParse({ ...trade, commission1Percent: "100.000000000000000001" }).success);
  assert(!ProfitTradeBasisInput.safeParse({ ...trade, commission1Percent: "abc" }).success);
  assert(!ProfitTradeBasisInput.safeParse({ ...trade, receivingCommissionPercent: "-1" }).success);
});

test("foreign-currency rates require explicit historical FX; no guessed conversions or missing buy/sell values", () => {
  const input = { ...trade, buyCurrency: "USD", buyValue: "60000", buyFx: "0.9", sellValue: "55000" };
  assert.equal(calculateTradeProfit("1", "55000", input).netProfit, "1000");
  const parsed = ProfitTradeBasisInput.parse({ ...trade, currency: "USD", buyCurrency: "EUR", sellCurrency: "USD", buyFx: "1.1", buyValue: "60000", sellValue: "67000" });
  assert.equal(calculateTradeProfit("1", "67000", parsed).netProfit, "1000");
  assert(!ProfitTradeBasisInput.safeParse({ ...input, buyFx: undefined }).success);
  assert(!ProfitTradeBasisInput.safeParse({ ...trade, sellFx: "0.9" }).success);
  assert(!ProfitTradeRecordInput.safeParse({ ...trade, buyValue: "", requestId: randomUUID() }).success);
  assert(!ProfitTradeRecordInput.safeParse({ ...trade, sellValue: "0", requestId: randomUUID() }).success);
  assert(!ProfitTradeRecordInput.safeParse({ ...trade, requestId: randomUUID(), quantity: "999" }).success);
});

test("all Swap currencies/networks are discovered and individual trades persist without changing order snapshots", async () => {
  for (const [id, source, target, qty] of [
    ["TRADE-BTC", "BTC", "EUR", "1"], ["TRADE-FUTURE", "NEWCOIN", "USD", "0.25"],
  ]) await seed(id, { fromAsset: source, fromNetwork: "Any future network", toAsset: target, amount: qty, receiveAmount: "61000" });
  const beforeOrder = (await db.select().from(ordersTable).where(eq(ordersTable.id, "TRADE-BTC")))[0];
  const input = { ...trade, requestId: randomUUID() };
  const saves = await Promise.all(Array.from({ length: 4 }, () => request("/orders/Swap/TRADE-BTC/trade", input)));
  assert(saves.every(r => r.ok));
  assert.equal((await request("/orders/Swap/TRADE-BTC/trade", { ...input, sellValue: "62000" })).status, 409);
  assert.equal((await db.select().from(profitRecordsTable).where(eq(profitRecordsTable.orderKey, "Swap:TRADE-BTC"))).length, 1);
  let report = await profitReport({ page: 1, search: "TRADE-" }, true);
  assert(report.currencies.includes("NEWCOIN"));
  assert.equal(report.rows.find(r => r.id === "TRADE-FUTURE")?.netProfit, null);
  assert.equal(report.rows.find(r => r.id === "TRADE-BTC")?.netProfit, "1000");
  assert.equal(report.rows.find(r => r.id === "TRADE-BTC")?.tradeDetails?.quantity, "1");
  assert((await request("/orders/Swap/TRADE-FUTURE/trade", { ...trade, currency: "USD", buyCurrency: "USD", sellCurrency: "USD", buyValue: "100", sellValue: "120", requestId: randomUUID() })).ok);
  report = await profitReport({ page: 1, search: "TRADE-" }, true);
  assert.equal(report.rows.find(r => r.id === "TRADE-FUTURE")?.netProfit, "5");
  assert.equal(report.summary.find(s => s.currency === "EUR")?.profit, "1000");
  assert.equal(report.summary.find(s => s.currency === "USD")?.profit, "5");
  assert.deepEqual((await db.select().from(ordersTable).where(eq(ordersTable.id, "TRADE-BTC")))[0], beforeOrder);
});

test("new trade basis replaces old fees, preserves history, and keeps existing same-currency adjustments once", async () => {
  await seed("TRADE-REPLACE", { fromAsset: "BTC", amount: "1", receiveAmount: "61000", toAsset: "EUR" });
  assert((await request("/orders/Swap/TRADE-REPLACE/basis", { ...basis, sourceUnitValue: "61000", targetUnitCost: "1", requestId: randomUUID() })).ok);
  assert((await request("/orders/Swap/TRADE-REPLACE/adjustments", { currency: "EUR", amount: "-2", reason: "Verified adjustment evidence", requestId: randomUUID() })).ok);
  assert((await request("/orders/Swap/TRADE-REPLACE/trade", { ...trade, additionalFixedFee: "10", requestId: randomUUID() })).ok);
  const report = await profitReport({ page: 1, search: "TRADE-REPLACE" }, true);
  assert.equal(report.rows[0].fees, "10");
  assert.equal(report.rows[0].netProfit, "988", "1000 spread less new 10 fee and existing 2 adjustment, never old fees");
  assert.equal(report.rows[0].audit.length, 3);
  assert.equal((await request("/orders/Swap/TRADE-REPLACE/trade", { ...trade, currency: "USD", buyCurrency: "USD", sellCurrency: "USD", requestId: randomUUID() })).status, 409);
  await db.update(ordersTable).set({ status: "processing" }).where(eq(ordersTable.id, "TRADE-REPLACE"));
  assert.equal((await profitReport({ page: 1, search: "TRADE-REPLACE" }, true)).rows[0].netProfit, null);
});

test("new per-order accounting is Owner-only, completed Swap/Convert-only, with clear validation failures", async () => {
  assert.equal((await request("/orders/Swap/TRADE-BTC/trade", { ...trade, requestId: randomUUID() }, "profit-viewer")).status, 403);
  assert.equal((await request("/orders/Swap/EXCLUDE-pending/trade", { ...trade, requestId: randomUUID() })).status, 409);
  assert.equal((await request("/orders/Convert/PROFIT-CONVERT/trade", { ...trade, requestId: randomUUID() })).status, 201);
  assert.equal((await request("/orders/Swap/TRADE-BTC/trade", { ...trade, buyFx: "0.9", requestId: randomUUID() })).status, 400);
  const csv = await (await request(".csv?search=TRADE-BTC")).text();
  assert(csv.includes('"Commission 1 %"')); assert(csv.includes('"60000"')); assert(csv.includes('"1000"'));
});

test("UTC daily, ISO-week, month and total summaries exclude uncompleted and missing-cost orders without currency conversion", async () => {
  const now = new Date("2026-11-04T12:00:00.000Z");
  const templates = (await profitReport({ page: 1, search: "TRADE-BTC" }, true)).rows[0];
  const row = (createdAt: string, netProfit: string | null, currency = "EUR", status = "completed") =>
    ({ ...templates, createdAt, netProfit, status, basis: { ...trade, currency } });
  const periods = profitPeriods([
    row("2026-11-04T00:00:00.000Z", "1000"),
    row("2026-11-03T23:59:59.999Z", "-100"),
    row("2026-11-01T12:00:00.000Z", "50"),
    row("2026-10-31T12:00:00.000Z", "25"),
    row("2026-11-04T01:00:00.000Z", "9999", "EUR", "pending"),
    row("2026-11-04T02:00:00.000Z", null),
    row("2026-11-04T03:00:00.000Z", "5", "USD"),
    row("2026-11-04T04:00:00.000Z", "8888", "EUR", "cancelled"),
  ], now);
  assert.equal(periods.daily.find(r => r.currency === "EUR")?.profit, "1000");
  assert.equal(periods.weekly.find(r => r.currency === "EUR")?.profit, "900");
  assert.equal(periods.monthly.find(r => r.currency === "EUR")?.profit, "950");
  assert.equal(periods.total.find(r => r.currency === "EUR")?.profit, "975");
  assert.equal(periods.total.find(r => r.currency === "USD")?.profit, "5");
  assert.equal(periods.total.find(r => r.currency === "EUR")?.orders, 4);
  assert.equal(periods.timeZone, "UTC");
  const endpoint = await (await request("?search=TRADE-BTC")).json();
  assert.equal(endpoint.periods.total[0].profit, "1000");
});

const myRate = {
  kind: "my_rate", asset: "USDT", currency: "EUR", network: "",
  buyRate: "0.890", sellRate: "0.900", partnerFeePercent: "0", receivingFeePercent: "0", active: true,
};
async function saveMyRate(values: Partial<typeof myRate> = {}) {
  const response = await request("/my-rates", { ...myRate, ...values, requestId: randomUUID() });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}
async function pendingSwap(id: string, values: Partial<typeof ordersTable.$inferInsert> = {}) {
  await seed(id, { status: "pending", fromAsset: "USDT", fromNetwork: "TRC20",
    toAsset: "EUR", toNetwork: "SEPA", amount: "1000", receiveAmount: "900", ...values });
}
async function completeSwap(id: string) {
  await db.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, id));
}

test("My Rates is Owner-only, exact, append-only and idempotent; invalid percentages fail clearly", async () => {
  const body = { ...myRate, requestId: randomUUID() };
  assert.equal((await request("/my-rates", body, "profit-viewer")).status, 403);
  const saves = await Promise.all(Array.from({ length: 4 }, () => request("/my-rates", body)));
  assert(saves.every(r => r.ok)); assert.equal(saves.filter(r => r.status === 201).length, 1);
  assert.equal((await request("/my-rates", { ...body, sellRate: "0.901" })).status, 409);
  assert.equal((await request("/my-rates", { ...body, requestId: randomUUID(), partnerFeePercent: "abc" })).status, 400);
  assert.equal((await request("/my-rates", { ...body, requestId: randomUUID(), buyRate: "0" })).status, 400);
  assert.equal((await request("/my-rates", { ...body, requestId: randomUUID(), asset: "EUR" })).status, 400);
  const report = await profitReport({ page: 1 }, true);
  assert.equal(report.myRates?.filter(r => r.asset === "USDT").length, 1);
});

test("completion freezes committed My Rates, not creation time or delayed worker recovery time", async () => {
  await pendingSwap("AUTO-YESTERDAY");
  await pendingSwap("AUTO-TOMORROW");
  await completeSwap("AUTO-YESTERDAY");
  await saveMyRate({ buyRate: "0.892", sellRate: "0.905" });
  // Worker intentionally runs AFTER the change: yesterday must still use A.
  await completeSwap("AUTO-TOMORROW");
  await Promise.all([processRevenueCompletions(), processRevenueCompletions()]);
  const report = await profitReport({ page: 1, search: "AUTO-", completedOnly: true }, true);
  const yesterday = report.rows.find(r => r.id === "AUTO-YESTERDAY")!;
  const tomorrow = report.rows.find(r => r.id === "AUTO-TOMORROW")!;
  assert.equal(yesterday.grossSpread, "10"); assert.equal(yesterday.netProfit, "10");
  assert.equal(tomorrow.netProfit, "13");
  assert.equal(yesterday.basis && "calculation" in yesterday.basis && yesterday.basis.buyValue, "0.890");
  assert(yesterday.completedAt); assert.equal(report.periods?.dateBasis, "completion");
  assert.equal(report.periods?.daily.find(p => p.currency === "EUR")?.profit, "23");
  const entries = await db.select().from(profitRecordsTable).where(eq(profitRecordsTable.orderKey, "Swap:AUTO-YESTERDAY"));
  assert.equal(entries.filter(r => r.kind === "basis").length, 1);
  assert.equal(entries.find(r => r.kind === "basis")?.execution?.profit?.netProfit, "10");
  await db.update(ordersTable).set({ sentAmountOverride: "2000" }).where(eq(ordersTable.id, "AUTO-YESTERDAY"));
  const frozen = (await profitReport({ page: 1, search: "AUTO-YESTERDAY" }, true)).rows[0];
  assert.equal(frozen.amount, "1000"); assert.equal(frozen.netProfit, "10");
});

test("a concurrent uncommitted My Rates edit cannot be applied retroactively to a completion", async () => {
  await pendingSwap("AUTO-COMMITTED");
  await db.transaction(async tx => {
    await tx.insert(profitRatesTable).values({
      config: { ...myRate, buyRate: "0.8", sellRate: "1", requestId: randomUUID() },
      actorId: "profit-owner", effectiveAt: sql`clock_timestamp()`,
    });
    await completeSwap("AUTO-COMMITTED");
  });
  await processRevenueCompletions();
  assert.equal((await profitReport({ page: 1, search: "AUTO-COMMITTED" }, true)).rows[0].netProfit, "13");
});

test("per-order Edit overrides rates and both fees, retains immutable snapshots and cannot duplicate on repeated Done", async () => {
  await saveMyRate({ partnerFeePercent: "1", receivingFeePercent: "2" });
  await pendingSwap("AUTO-FEES"); await completeSwap("AUTO-FEES"); await processRevenueCompletions();
  let row = (await profitReport({ page: 1, search: "AUTO-FEES" }, true)).rows[0];
  assert.equal(row.tradeDetails?.commission1, "8.9"); assert.equal(row.tradeDetails?.receivingCommission, "18");
  assert.equal(row.netProfit, "-16.9");
  const original = (await db.select().from(ordersTable).where(eq(ordersTable.id, "AUTO-FEES")))[0];
  const edit = { ...trade, buyValue: "0.880", sellValue: "0.910", commission1Percent: "1", receivingCommissionPercent: "1", requestId: randomUUID() };
  assert((await request("/orders/Swap/AUTO-FEES/trade", edit)).ok);
  assert((await request("/orders/Swap/AUTO-FEES/trade", edit)).ok);
  row = (await profitReport({ page: 1, search: "AUTO-FEES" }, true)).rows[0];
  assert.equal(row.netProfit, "12.1");
  assert.deepEqual((await db.select().from(ordersTable).where(eq(ordersTable.id, "AUTO-FEES")))[0], original);
  await db.update(ordersTable).set({ status: "processing" }).where(eq(ordersTable.id, "AUTO-FEES"));
  await completeSwap("AUTO-FEES"); await completeSwap("AUTO-FEES"); await processRevenueCompletions();
  const entries = await db.select().from(profitRecordsTable).where(eq(profitRecordsTable.orderKey, "Swap:AUTO-FEES"));
  assert.equal(entries.filter(r => r.kind === "completion").length, 1);
  assert.equal(entries.filter(r => r.kind === "basis").length, 2);
  assert.equal((await profitReport({ page: 1, search: "AUTO-FEES" }, true)).rows[0].netProfit, "12.1");
});

test("missing rates stay unavailable permanently; disabled exact network does not silently use Any", async () => {
  await pendingSwap("AUTO-NO-RATE", { fromAsset: "FUTURECOIN" });
  await completeSwap("AUTO-NO-RATE");
  await saveMyRate({ asset: "FUTURECOIN", buyRate: "10", sellRate: "11" });
  await saveMyRate({ network: "BEP20", active: false });
  await pendingSwap("AUTO-DISABLED", { fromNetwork: "BEP20" }); await completeSwap("AUTO-DISABLED");
  await processRevenueCompletions(); await processRevenueCompletions();
  for (const id of ["AUTO-NO-RATE", "AUTO-DISABLED"]) {
    const row = (await profitReport({ page: 1, search: id }, true)).rows[0];
    assert.equal(row.netProfit, null); assert.equal(row.completion?.state, "unavailable");
  }
  const pending = await db.select().from(profitRecordsTable).where(eq(profitRecordsTable.orderKey, "Swap:AUTO-NO-RATE"));
  assert.equal(pending.filter(r => r.kind === "unavailable").length, 1);
});

test("canonical Convert completion uses verified paid quantity, ignores its mirror and supports individual editing", async () => {
  await saveMyRate();
  await seed("AUTO-CONVERT", { type: "instant", status: "awaiting funds" });
  await db.insert(quickexOrdersTable).values({
    legacyOrderId: "AUTO-CONVERT", status: "awaiting funds", requestFingerprint: "auto-convert", idempotencyKey: "auto-convert",
    route: { fromAsset: "USDT", fromNetwork: "TRC20", toAsset: "BTC", toNetwork: "BTC" },
    amounts: { amount: "999", receiveAmount: "0.01" }, addresses: {}, createdAt: new Date(), updatedAt: new Date(),
  });
  await db.update(quickexOrdersTable).set({ status: "completed",
    amounts: { amount: "999", paidAmount: "500", actualReceiveAmount: "0.005" },
  }).where(eq(quickexOrdersTable.legacyOrderId, "AUTO-CONVERT"));
  await db.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, "AUTO-CONVERT"));
  await processRevenueCompletions();
  let row = (await profitReport({ page: 1, search: "AUTO-CONVERT", completedOnly: true }, true)).rows[0];
  assert.equal(row.amount, "500"); assert.equal(row.netProfit, "5");
  assert.equal(row.tradeDetails?.quantity, "500");
  const entries = await db.select().from(profitRecordsTable).where(eq(profitRecordsTable.orderKey, "Convert:AUTO-CONVERT"));
  assert.equal(entries.filter(r => r.kind === "completion").length, 1);
  assert((await request("/orders/Convert/AUTO-CONVERT/trade", { ...trade, buyValue: "0.89", sellValue: "0.91", requestId: randomUUID() })).ok);
  row = (await profitReport({ page: 1, search: "AUTO-CONVERT" }, true)).rows[0];
  assert.equal(row.netProfit, "10");
});

test("completed-only summaries exclude refunds, unfinished orders and unavailable profit", async () => {
  await db.update(ordersTable).set({ status: "refunded" }).where(eq(ordersTable.id, "AUTO-YESTERDAY"));
  const report = await profitReport({ page: 1, search: "AUTO-", completedOnly: true }, true);
  assert(report.rows.every(r => r.status === "completed"));
  assert(!report.rows.some(r => r.id === "AUTO-YESTERDAY"));
  assert.equal(report.missingCosts, 2);
  assert.equal(report.summary.find(s => s.currency === "EUR")?.profit, "48.1");
});

test("automatic Buy, partial BTC/USD and future asset/network pairs use their own unit and quote currencies", async () => {
  await saveMyRate({ asset: "BTC", currency: "USD", buyRate: "60000", sellRate: "61000" });
  await pendingSwap("DYNAMIC-BUY", { fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "USDT",
    toNetwork: "TRC20", amount: "900", receiveAmount: "1000" });
  await pendingSwap("DYNAMIC-BTC", { fromAsset: "BTC", fromNetwork: "BTC", toAsset: "USD",
    amount: "0.25", receiveAmount: "15250" });
  await pendingSwap("DYNAMIC-FUTURE", { fromAsset: "FUTURECOIN", fromNetwork: "FutureChain", toAsset: "EUR" });
  for (const id of ["DYNAMIC-BUY", "DYNAMIC-BTC", "DYNAMIC-FUTURE"]) await completeSwap(id);
  await processRevenueCompletions();
  const report = await profitReport({ page: 1, search: "DYNAMIC-", completedOnly: true }, true);
  assert.equal(report.rows.find(r => r.id === "DYNAMIC-BUY")?.tradeDetails?.asset, "USDT");
  assert.equal(report.rows.find(r => r.id === "DYNAMIC-BUY")?.netProfit, "10");
  assert.equal(report.rows.find(r => r.id === "DYNAMIC-BTC")?.netProfit, "250");
  assert.equal(report.rows.find(r => r.id === "DYNAMIC-BTC")?.basis?.currency, "USD");
  assert.equal(report.rows.find(r => r.id === "DYNAMIC-FUTURE")?.netProfit, "1000");
  assert.equal(report.summary.length, 2, "EUR and USD profits must remain separate, never silently converted");
});
