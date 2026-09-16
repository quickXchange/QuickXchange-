import { and, eq, gte, lte } from "drizzle-orm";
import { db, ordersTable, quickexOrdersTable } from "@workspace/db";
import { TERMINAL_ORDER_STATUSES } from "./order-status";
import { getCurrentUsdSourceValue } from "./manual-desk-rates";

type Product = "swap" | "convert";

const failedStatuses = new Set(["failed", "cancelled", "refunded", "expired"]);
const terminalStatuses = TERMINAL_ORDER_STATUSES;

const finite = (value: number) => Number.isFinite(value) && value >= 0 ? value : 0;

function utcDays(from: Date, to: Date) {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
  ));
  const last = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor.getTime() <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function countedEntries(values: Map<string, number>, key: "method" | "currency") {
  return [...values.entries()]
    .map(([value, count]) => ({ [key]: value, count }))
    .sort((left, right) => right.count - left.count ||
      String(left[key]).localeCompare(String(right[key])));
}

export async function buildAdminSummaryAnalytics(input: {
  product: Product;
  from: Date;
  to: Date;
}) {
  const manualRows = input.product === "swap" ? await db.select({
    id: ordersTable.id,
    type: ordersTable.type,
    status: ordersTable.status,
    fromAsset: ordersTable.fromAsset,
    toAsset: ordersTable.toAsset,
    amount: ordersTable.amount,
    customerEmail: ordersTable.customerEmail,
    customerName: ordersTable.customerName,
    customerClerkUserId: ordersTable.customerClerkUserId,
    paymentMethod: ordersTable.paymentMethod,
    payoutMethod: ordersTable.payoutMethod,
    createdAt: ordersTable.createdAt,
    manualSettlementStartedAt: ordersTable.manualSettlementStartedAt,
    manualSettlementPaidAt: ordersTable.manualSettlementPaidAt,
  }).from(ordersTable).where(and(
    eq(ordersTable.type, "manual"),
    gte(ordersTable.createdAt, input.from),
    lte(ordersTable.createdAt, input.to),
  )) : [];
  const providerRows = input.product === "convert" ? await db.select()
    .from(quickexOrdersTable).where(and(
      gte(quickexOrdersTable.createdAt, input.from),
      lte(quickexOrdersTable.createdAt, input.to),
    )) : [];
  const rows = input.product === "swap" ? manualRows : providerRows.map(order => {
    const route = order.route as {
      fromAsset: string;
      toAsset: string;
    };
    const amounts = order.amounts as { amount: string };
    return {
      id: order.legacyOrderId,
      type: "instant",
      status: order.status,
      fromAsset: route.fromAsset,
      toAsset: route.toAsset,
      amount: amounts.amount,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      customerClerkUserId: order.customerClerkUserId,
      paymentMethod: "",
      payoutMethod: "",
      createdAt: order.createdAt,
      manualSettlementStartedAt: null,
      manualSettlementPaidAt: null,
    };
  });

  const customers = new Set<string>();
  const users = new Set<string>();
  const methods = new Map<string, number>();
  const currencies = new Map<string, number>();
  const tradingPairs = new Map<
    string,
    { pair: string; fromAsset: string; toAsset: string; count: number }
  >();
  const series = new Map(utcDays(input.from, input.to).map(date => [
    date, { date, orders: 0, approximateUsdVolume: 0 },
  ]));
  let pendingOrders = 0;
  let completedOrders = 0;
  let failedCancelledOrders = 0;
  let completionMinutesTotal = 0;
  let completionMinutesCount = 0;

  for (const order of rows) {
    const status = order.status.toLowerCase();
    customers.add(order.customerEmail);
    if (order.customerClerkUserId) users.add(order.customerClerkUserId);
    if (!terminalStatuses.has(status)) pendingOrders++;
    if (status === "completed") {
      completedOrders++;
      const startedAt = order.manualSettlementStartedAt ?? order.createdAt;
      if (input.product === "swap" && order.manualSettlementPaidAt) {
        const minutes = (order.manualSettlementPaidAt.getTime() - startedAt.getTime()) / 60_000;
        if (Number.isFinite(minutes) && minutes >= 0) {
          completionMinutesTotal += minutes;
          completionMinutesCount++;
        }
      }
    }
    if (failedStatuses.has(status)) failedCancelledOrders++;
    for (const method of [order.paymentMethod, order.payoutMethod]) {
      const normalized = method.trim();
      if (normalized) methods.set(normalized, (methods.get(normalized) ?? 0) + 1);
    }
    for (const currency of [order.fromAsset, order.toAsset]) {
      const normalized = currency.trim().toUpperCase();
      if (normalized) currencies.set(normalized, (currencies.get(normalized) ?? 0) + 1);
    }
    const fromAsset = order.fromAsset.trim().toUpperCase();
    const toAsset = order.toAsset.trim().toUpperCase();
    const pair = `${fromAsset}/${toAsset}`;
    const tradingPair = tradingPairs.get(pair);
    if (tradingPair) {
      tradingPair.count++;
    } else {
      tradingPairs.set(pair, { pair, fromAsset, toAsset, count: 1 });
    }
    const daily = series.get(order.createdAt.toISOString().slice(0, 10));
    if (daily) daily.orders++;
  }

  const sourceCurrencies = new Set(
    rows.map(order => order.fromAsset.trim().toUpperCase()).filter(Boolean),
  );
  const usdPerSourceUnit = new Map<
    string,
    { usdValue: number; observedAt: string } | undefined
  >();
  await Promise.all([...sourceCurrencies].map(async currency => {
    try {
      usdPerSourceUnit.set(currency, await getCurrentUsdSourceValue(currency, 1));
    } catch {
      usdPerSourceUnit.set(currency, undefined);
    }
  }));
  const unavailableCurrencies = new Set<string>();
  let valuedOrders = 0;
  let totalUsd = 0;
  let observedAt: string | null = null;
  for (const order of rows) {
    const currency = order.fromAsset.trim().toUpperCase();
    const sourceUnitRate = usdPerSourceUnit.get(currency);
    const amount = Number(order.amount);
    if (!sourceUnitRate || !Number.isFinite(amount) || amount < 0) {
      if (currency) unavailableCurrencies.add(currency);
      continue;
    }
    const usdValue = finite(amount * sourceUnitRate.usdValue);
    valuedOrders++;
    totalUsd += usdValue;
    if (!observedAt || sourceUnitRate.observedAt > observedAt) {
      observedAt = sourceUnitRate.observedAt;
    }
    const daily = series.get(order.createdAt.toISOString().slice(0, 10));
    if (daily) daily.approximateUsdVolume += usdValue;
  }

  const totalOrders = rows.length;
  return {
    product: input.product,
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    totalOrders,
    pendingOrders,
    completedOrders,
    failedCancelledOrders,
    totalCustomers: customers.size,
    totalUsers: users.size,
    completionRate: totalOrders ? finite(completedOrders / totalOrders * 100) : 0,
    averageCompletionTimeMinutes: input.product === "swap" && completionMinutesCount
      ? finite(completionMinutesTotal / completionMinutesCount)
      : null,
    averageOrderValueUsd: valuedOrders ? finite(totalUsd / valuedOrders) : 0,
    topPaymentMethods: countedEntries(methods, "method"),
    topCurrencies: countedEntries(currencies, "currency"),
    topTradingPairs: [...tradingPairs.values()]
      .sort((left, right) => right.count - left.count ||
        left.pair.localeCompare(right.pair)),
    dailySeries: [...series.values()].map(day => ({
      ...day,
      approximateUsdVolume: finite(day.approximateUsdVolume),
    })),
    recentActivity: [...rows]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() ||
        right.id.localeCompare(left.id))
      .slice(0, 4)
      .map(order => ({
        id: order.id,
        label: `${order.customerName} created ${input.product === "swap" ? "Swap" : "Convert"} order`,
        time: order.createdAt.toISOString(),
      })),
    valuation: {
      observedAt,
      status: valuedOrders === totalOrders ? "complete" as const
        : valuedOrders ? "partial" as const : "unavailable" as const,
      valuedOrders,
      totalOrders,
      unavailableCurrencies: [...unavailableCurrencies].sort(),
    },
  };
}