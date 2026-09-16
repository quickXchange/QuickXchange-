export type RevenueStatus = "active" | "completed" | "failed" | "cancelled";
export type RevenueGroupBy = "pricingRule" | "route";

export interface RevenueOrder {
  id: string;
  status: string;
  createdAt: Date;
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  pricingSnapshot: {
    rule: { id: string; version: number; name: string };
    context: {
      sourceAsset: string;
      sourceNetwork: string;
      targetAsset: string;
      targetNetwork: string;
    };
    reference: {
      source: { currency: string; unitsPerUsd: string };
      target: { currency: string; unitsPerUsd: string };
    };
    amounts: { grossMarketAmount: string; totalFee: string };
  };
}

interface Decimal {
  coefficient: bigint;
  scale: number;
}

function parseDecimal(value: string): Decimal {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`Invalid exact decimal: ${value}`);
  const fraction = match[3] ?? "";
  return {
    coefficient: BigInt(`${match[1]}${match[2]}${fraction}`),
    scale: fraction.length,
  };
}

function addDecimals(left: string, right: string): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const scale = Math.max(a.scale, b.scale);
  const coefficient =
    a.coefficient * 10n ** BigInt(scale - a.scale) +
    b.coefficient * 10n ** BigInt(scale - b.scale);
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

interface Rational {
  numerator: bigint;
  denominator: bigint;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function decimalRational(value: string): Rational {
  const decimal = parseDecimal(value);
  return { numerator: decimal.coefficient, denominator: 10n ** BigInt(decimal.scale) };
}

function multiplyDivide(value: string, multiplier: string, divisor: string): Rational {
  const amount = decimalRational(value);
  const rate = decimalRational(multiplier);
  const denominatorRate = decimalRational(divisor);
  if (denominatorRate.numerator <= 0n || rate.numerator <= 0n) {
    throw new Error("Historical reference rates must be positive.");
  }
  const numerator = amount.numerator * rate.numerator * denominatorRate.denominator;
  const denominator = amount.denominator * rate.denominator * denominatorRate.numerator;
  const factor = gcd(numerator, denominator);
  return { numerator: numerator / factor, denominator: denominator / factor };
}

function addRationals(left: Rational, right: Rational): Rational {
  const factor = gcd(left.denominator, right.denominator);
  const numerator =
    left.numerator * (right.denominator / factor) +
    right.numerator * (left.denominator / factor);
  const denominator = left.denominator * (right.denominator / factor);
  const reduction = gcd(numerator, denominator);
  return { numerator: numerator / reduction, denominator: denominator / reduction };
}

function rationalToDecimal(value: Rational, scale = 30): string {
  const coefficient = value.numerator * 10n ** BigInt(scale) / value.denominator;
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function reportingUnitsPerUsd(order: RevenueOrder, reportingCurrency: string): string {
  if (reportingCurrency === "USD") return "1";
  const references = [order.pricingSnapshot.reference.source, order.pricingSnapshot.reference.target];
  const reference = references.find(item => item.currency.toUpperCase() === reportingCurrency);
  if (!reference) {
    throw new Error(
      `Order ${order.id} has no immutable ${reportingCurrency} historical reference rate.`,
    );
  }
  return reference.unitsPerUsd;
}

export function revenueStatus(status: string): RevenueStatus {
  switch (status.toLowerCase()) {
    case "completed": return "completed";
    case "failed": return "failed";
    case "cancelled":
    case "expired":
    case "refunded": return "cancelled";
    default: return "active";
  }
}

export function aggregateManualDeskRevenue(
  orders: RevenueOrder[],
  groupBy: RevenueGroupBy,
  from: Date,
  to: Date,
  reportingCurrencyInput: string,
) {
  const reportingCurrency = reportingCurrencyInput.toUpperCase();
  const zero = (): Rational => ({ numerator: 0n, denominator: 1n });
  const normalizedTotals = new Map<RevenueStatus, {
    status: RevenueStatus;
    orderCount: number;
    gross: Rational;
    fees: Rational;
  }>();
  const totals = new Map<string, {
    status: RevenueStatus;
    targetAsset: string;
    orderCount: number;
    grossCustomerVolume: string;
    expectedFeeRevenue: string;
  }>();
  const groups = new Map<string, {
    key: string;
    label: string;
    status: RevenueStatus;
    targetAsset: string;
    orderCount: number;
    grossCustomerVolume: string;
    expectedFeeRevenue: string;
    normalizedGrossCustomerVolume: Rational;
    normalizedExpectedFeeRevenue: Rational;
  }>();

  for (const order of orders) {
    const status = revenueStatus(order.status);
    const targetAsset = order.pricingSnapshot.context.targetAsset;
    const totalKey = `${status}\u0000${targetAsset}`;
    const total = totals.get(totalKey) ?? {
      status, targetAsset, orderCount: 0, grossCustomerVolume: "0", expectedFeeRevenue: "0",
    };
    total.orderCount += 1;
    total.grossCustomerVolume = addDecimals(
      total.grossCustomerVolume,
      order.pricingSnapshot.amounts.grossMarketAmount,
    );
    total.expectedFeeRevenue = addDecimals(
      total.expectedFeeRevenue,
      order.pricingSnapshot.amounts.totalFee,
    );
    totals.set(totalKey, total);

    const targetUnitsPerUsd = order.pricingSnapshot.reference.target.unitsPerUsd;
    const reportUnitsPerUsd = reportingUnitsPerUsd(order, reportingCurrency);
    const normalizedGross = multiplyDivide(
      order.pricingSnapshot.amounts.grossMarketAmount,
      reportUnitsPerUsd,
      targetUnitsPerUsd,
    );
    const normalizedFee = multiplyDivide(
      order.pricingSnapshot.amounts.totalFee,
      reportUnitsPerUsd,
      targetUnitsPerUsd,
    );
    const normalizedTotal = normalizedTotals.get(status) ?? {
      status, orderCount: 0, gross: zero(), fees: zero(),
    };
    normalizedTotal.orderCount += 1;
    normalizedTotal.gross = addRationals(normalizedTotal.gross, normalizedGross);
    normalizedTotal.fees = addRationals(normalizedTotal.fees, normalizedFee);
    normalizedTotals.set(status, normalizedTotal);

    const context = order.pricingSnapshot.context;
    const rule = order.pricingSnapshot.rule;
    const key = groupBy === "pricingRule"
      ? `${rule.id}:v${rule.version}`
      : `${context.sourceAsset}:${context.sourceNetwork}->${context.targetAsset}:${context.targetNetwork}`;
    const label = groupBy === "pricingRule"
      ? `${rule.name} · v${rule.version}`
      : `${context.sourceAsset} (${context.sourceNetwork}) → ${context.targetAsset} (${context.targetNetwork})`;
    const groupKey = `${key}\u0000${status}\u0000${targetAsset}`;
    const group = groups.get(groupKey) ?? {
      key, label, status, targetAsset, orderCount: 0,
      grossCustomerVolume: "0", expectedFeeRevenue: "0",
      normalizedGrossCustomerVolume: zero(),
      normalizedExpectedFeeRevenue: zero(),
    };
    group.orderCount += 1;
    group.grossCustomerVolume = addDecimals(
      group.grossCustomerVolume,
      order.pricingSnapshot.amounts.grossMarketAmount,
    );
    group.expectedFeeRevenue = addDecimals(
      group.expectedFeeRevenue,
      order.pricingSnapshot.amounts.totalFee,
    );
    group.normalizedGrossCustomerVolume = addRationals(
      group.normalizedGrossCustomerVolume,
      normalizedGross,
    );
    group.normalizedExpectedFeeRevenue = addRationals(
      group.normalizedExpectedFeeRevenue,
      normalizedFee,
    );
    groups.set(groupKey, group);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    groupBy,
    reportingCurrency,
    normalizationPolicy: {
      decimalScale: 30 as const,
      rounding: "truncateAfterAggregation" as const,
    },
    generatedAt: new Date().toISOString(),
    totals: [...totals.values()].sort((a, b) =>
      a.targetAsset.localeCompare(b.targetAsset) || a.status.localeCompare(b.status)),
    normalizedTotals: [...normalizedTotals.values()]
      .map(total => ({
        status: total.status,
        orderCount: total.orderCount,
        historicalGrossCustomerVolume: rationalToDecimal(total.gross),
        historicalExpectedFeeRevenue: rationalToDecimal(total.fees),
      }))
      .sort((a, b) => a.status.localeCompare(b.status)),
    groups: [...groups.values()].map(group => ({
      ...group,
      normalizedGrossCustomerVolume: rationalToDecimal(group.normalizedGrossCustomerVolume),
      normalizedExpectedFeeRevenue: rationalToDecimal(group.normalizedExpectedFeeRevenue),
    })).sort((a, b) =>
      a.label.localeCompare(b.label) ||
      a.targetAsset.localeCompare(b.targetAsset) ||
      a.status.localeCompare(b.status)),
  };
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function manualDeskRevenueCsv(
  report: ReturnType<typeof aggregateManualDeskRevenue>,
): string {
  const rows: Array<Array<string | number>> = [
    ["filter_from", report.from],
    ["filter_to", report.to],
    ["group_by", report.groupBy],
    ["reporting_currency", report.reportingCurrency],
    ["normalized_decimal_scale", report.normalizationPolicy.decimalScale],
    ["normalized_rounding", report.normalizationPolicy.rounding],
    [],
    ["group_key", "group_label", "status", "target_asset", "order_count", "gross_customer_volume", "expected_fee_revenue", "reporting_currency", "historical_normalized_gross_customer_volume", "historical_normalized_expected_fee_revenue"],
    ...report.groups.map((group) => [
      group.key,
      group.label,
      group.status,
      group.targetAsset,
      group.orderCount,
      group.grossCustomerVolume,
      group.expectedFeeRevenue,
      report.reportingCurrency,
      group.normalizedGrossCustomerVolume,
      group.normalizedExpectedFeeRevenue,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}