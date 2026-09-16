import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateManualDeskRevenue,
  manualDeskRevenueCsv,
  revenueStatus,
  type RevenueOrder,
} from "../src/lib/manual-desk-revenue";

function order(overrides: Partial<RevenueOrder> = {}): RevenueOrder {
  return {
    id: "order-1",
    status: "completed",
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    fromAsset: "EUR",
    fromNetwork: "SEPA",
    toAsset: "USDT",
    toNetwork: "TRC20",
    pricingSnapshot: {
      rule: { id: "rule-1", version: 2, name: 'Desk "standard"' },
      context: {
        sourceAsset: "EUR",
        sourceNetwork: "SEPA",
        targetAsset: "USDT",
        targetNetwork: "TRC20",
      },
      reference: {
        source: { currency: "EUR", unitsPerUsd: "0.8" },
        target: { currency: "USDT", unitsPerUsd: "1" },
      },
      amounts: {
        grossMarketAmount: "100000000000000000000.00000001",
        totalFee: "0.10000001",
      },
    },
    ...overrides,
  };
}

test("maps active, completed, failed, and cancelled revenue states", () => {
  assert.equal(revenueStatus("pending"), "active");
  assert.equal(revenueStatus("verification required"), "active");
  assert.equal(revenueStatus("completed"), "completed");
  assert.equal(revenueStatus("failed"), "failed");
  assert.equal(revenueStatus("cancelled"), "cancelled");
  assert.equal(revenueStatus("expired"), "cancelled");
  assert.equal(revenueStatus("refunded"), "cancelled");
});

test("aggregates immutable snapshot decimals without floating-point loss", () => {
  const report = aggregateManualDeskRevenue([
    order(),
    order({
      id: "order-2",
      pricingSnapshot: {
        ...order().pricingSnapshot,
        amounts: { grossMarketAmount: "0.99999999", totalFee: "0.00000009" },
      },
    }),
  ], "route", new Date("2026-08-01T00:00:00.000Z"), new Date("2026-09-01T00:00:00.000Z"), "USD");

  assert.deepEqual(report.totals, [{
    status: "completed",
    targetAsset: "USDT",
    orderCount: 2,
    grossCustomerVolume: "100000000000000000001",
    expectedFeeRevenue: "0.1000001",
  }]);
  assert.equal(report.groups[0]?.key, "EUR:SEPA->USDT:TRC20");
  assert.equal(report.normalizedTotals[0]?.historicalExpectedFeeRevenue, "0.1000001");
});

test("keeps rule versions separate and preserves CSV filters and exact strings", () => {
  const report = aggregateManualDeskRevenue([
    order(),
    order({
      id: "order-2",
      status: "failed",
      pricingSnapshot: {
        ...order().pricingSnapshot,
        rule: { id: "rule-1", version: 3, name: "Desk replacement" },
      },
    }),
  ], "pricingRule", new Date("2026-08-01T00:00:00.000Z"), new Date("2026-09-01T00:00:00.000Z"), "EUR");
  const csv = manualDeskRevenueCsv(report);

  assert.equal(report.groups.length, 2);
  assert.match(csv, /^"filter_from","2026-08-01T00:00:00.000Z"\r\n/);
  assert.match(csv, /"group_by","pricingRule"/);
  assert.match(csv, /"reporting_currency","EUR"/);
  assert.match(csv, /"Desk ""standard"" · v2"/);
  assert.match(csv, /"100000000000000000000.00000001"/);
  assert.ok(csv.endsWith("\r\n"));
});

test("normalizes with immutable reference legs and rejects unavailable currencies", () => {
  const report = aggregateManualDeskRevenue(
    [order()],
    "route",
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
    "EUR",
  );
  assert.equal(report.normalizedTotals[0]?.historicalExpectedFeeRevenue, "0.080000008");
  assert.deepEqual(report.normalizationPolicy, {
    decimalScale: 30,
    rounding: "truncateAfterAggregation",
  });
  assert.throws(() => aggregateManualDeskRevenue(
    [order()],
    "route",
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
    "GBP",
  ), /no immutable GBP/);
});

test("aggregates exact repeating ratios before the documented decimal truncation", () => {
  const repeating = order({
    pricingSnapshot: {
      ...order().pricingSnapshot,
      reference: {
        source: { currency: "EUR", unitsPerUsd: "0.8" },
        target: { currency: "USDT", unitsPerUsd: "3" },
      },
      amounts: { grossMarketAmount: "1", totalFee: "1" },
    },
  });
  const report = aggregateManualDeskRevenue(
    [repeating, { ...repeating, id: "order-2" }, { ...repeating, id: "order-3" }],
    "route",
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
    "USD",
  );
  assert.equal(report.normalizedTotals[0]?.historicalExpectedFeeRevenue, "1");
  const csv = manualDeskRevenueCsv(report);
  assert.match(csv, /"normalized_decimal_scale","30"/);
  assert.match(csv, /"normalized_rounding","truncateAfterAggregation"/);
});