import { db, profitRatesTable, profitRecordsTable, cryptoAssetsTable, fiatCurrenciesTable, orderAuditLogsTable } from "@workspace/db";
import { desc, eq, sql, inArray, getTableColumns } from "drizzle-orm";
import { ProfitBasisInput, ProfitRateInput, type ProfitReport, type ProfitRow, type ProfitRate } from "@workspace/api-zod";
import { calculateProfit, divide, negative, positive, sum, negate } from "./order-profit-math";

export type ProfitFilters = {
  from?: string; to?: string; search?: string; currency?: string; paymentMethod?: string;
  type?: string; profit?: string; page: number;
};
type Execution = {
  id: string; type: "Swap" | "Convert"; status: string; createdAt: string;
  fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string;
  amount: string; receiveAmount: string; paymentMethod: string;
  fromOptionId: string; toOptionId: string;
  executionVerified: boolean;
  createdMicros: string;
};
const routeKey = (r: Pick<Execution, "fromAsset" | "fromNetwork" | "toAsset" | "toNetwork">) =>
  JSON.stringify([r.fromAsset, r.fromNetwork, r.toAsset, r.toNetwork]);

export async function profitExecutions(): Promise<Execution[]> {
  // Only project accounting fields. Never read customer identities, addresses
  // or payment details. Canonical Convert rows outrank their legacy mirrors.
  const result = await db.execute(sql`
    SELECT id, case when type = 'manual' then 'Swap' else 'Convert' end AS type,
      status, created_at AS "createdAt", from_asset AS "fromAsset", from_network AS "fromNetwork",
      to_asset AS "toAsset", to_network AS "toNetwork",
      CASE WHEN type <> 'manual' THEN coalesce(provider_paid_amount, sent_amount_override, amount)::text ELSE coalesce(sent_amount_override, amount)::text END AS amount,
      coalesce(receive_amount_override, receive_amount)::text AS "receiveAmount",
      coalesce(pricing_snapshot#>>'{rule,selectors,sourceSettlementOptionId}', '') AS "fromOptionId",
      coalesce(pricing_snapshot#>>'{rule,selectors,targetSettlementOptionId}', '') AS "toOptionId",
      concat_ws(' → ', nullif(sending_payment_method_label, ''), nullif(receiving_payment_method_label, ''),
        nullif(payment_method, ''), nullif(payout_method, '')) AS "paymentMethod",
      (type = 'manual') AS "executionVerified",
      (extract(epoch from created_at) * 1000000)::bigint::text AS "createdMicros"
    FROM exchange_orders e
    WHERE status IN ('completed', 'refunded', 'reversed') AND is_test = false
      AND (type = 'manual' OR NOT EXISTS (SELECT 1 FROM quickex_orders q WHERE q.legacy_order_id = e.id))
    UNION ALL
    SELECT legacy_order_id, 'Convert', status, created_at,
      route->>'fromAsset', coalesce(route->>'fromNetwork',''), route->>'toAsset', coalesce(route->>'toNetwork',''),
      coalesce(nullif(amounts->>'paidAmount',''), nullif(amounts->>'providerPaidAmount',''), amounts->>'amount'),
      coalesce(nullif(amounts->>'actualReceiveAmount',''), amounts->>'receiveAmount'), '', '',
      '',
      (coalesce(nullif(amounts->>'paidAmount',''), '0')::numeric > 0 AND nullif(amounts->>'actualReceiveAmount','') IS NOT NULL),
      (extract(epoch from created_at) * 1000000)::bigint::text
    FROM quickex_orders WHERE status IN ('completed', 'refunded', 'reversed')
    ORDER BY "createdAt" DESC, id
  `);
  return result.rows.map(r => ({ ...r, createdAt: new Date(r.createdAt as string).toISOString() })) as Execution[];
}

export async function profitReport(filters: ProfitFilters, owner: boolean, allRows = false): Promise<ProfitReport> {
  const [executions, storedRates, records, assets, fiat] = await Promise.all([
    profitExecutions(),
    db.select({ ...getTableColumns(profitRatesTable),
      effectiveMicros: sql<string>`(extract(epoch from ${profitRatesTable.effectiveAt}) * 1000000)::bigint::text`,
    }).from(profitRatesTable).orderBy(desc(profitRatesTable.effectiveAt), desc(profitRatesTable.id)),
    db.select().from(profitRecordsTable).orderBy(desc(profitRecordsTable.createdAt), desc(profitRecordsTable.id)),
    db.select({ code: cryptoAssetsTable.code }).from(cryptoAssetsTable).where(eq(cryptoAssetsTable.enabled, true)),
    db.select({ code: fiatCurrenciesTable.code }).from(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.enabled, true)),
  ]);
  const rules: ProfitRate[] = storedRates.map(r => ({
    ...ProfitRateInput.parse(r.config), id: r.id, effectiveAt: r.effectiveAt.toISOString(),
  }));
  const reversedIds = executions.filter(e => e.status !== "completed").map(e => e.id);
  const lifecycle = reversedIds.length ? await db.select({
    id: orderAuditLogsTable.id, orderId: orderAuditLogsTable.orderId, action: orderAuditLogsTable.action,
    details: orderAuditLogsTable.details, createdAt: orderAuditLogsTable.createdAt,
  }).from(orderAuditLogsTable).where(inArray(orderAuditLogsTable.orderId, reversedIds)) : [];
  const rows: ProfitRow[] = [];
  const effectiveMicros = new Map(storedRates.map(r => [r.id, BigInt(r.effectiveMicros)]));
  const routes = new Map<string, ProfitReport["routes"][number]>();
  const methods = new Set<string>();
  const recordsByOrder = new Map<string, typeof records>();
  for (const record of records) {
    const history = recordsByOrder.get(record.orderKey) || [];
    history.push(record);
    recordsByOrder.set(record.orderKey, history);
  }
  const rulesByRoute = new Map<string, ProfitRate[]>();
  for (const rule of rules) {
    const versions = rulesByRoute.get(routeKey(rule)) || [];
    versions.push(rule);
    rulesByRoute.set(routeKey(rule), versions);
  }
  for (const order of executions) {
    const key = `${order.type}:${order.id}`;
    routes.set(`${routeKey(order)}\0${order.fromOptionId}\0${order.toOptionId}`, {
      fromAsset: order.fromAsset, fromNetwork: order.fromNetwork, toAsset: order.toAsset, toNetwork: order.toNetwork,
      fromOptionId: order.fromOptionId, toOptionId: order.toOptionId,
    });
    if (order.paymentMethod) methods.add(order.paymentMethod);
    const audit = recordsByOrder.get(key) || [];
    const record = audit.find(r => r.kind === "basis");
    const rule = rulesByRoute.get(routeKey(order))?.filter(r => effectiveMicros.get(r.id)! <= BigInt(order.createdMicros) &&
      (!r.fromOptionId || r.fromOptionId === order.fromOptionId) &&
      (!r.toOptionId || r.toOptionId === order.toOptionId)
    ).sort((a, b) => Number(!!b.fromOptionId) + Number(!!b.toOptionId) - Number(!!a.fromOptionId) - Number(!!a.toOptionId))[0];
    // Historical execution attestation always wins; later rules never backfill.
    const basis = record ? ProfitBasisInput.parse(record.basis) : rule ? ProfitBasisInput.parse({
      currency: rule.currency, sourceUnitValue: rule.sourceUnitValue, targetUnitCost: rule.targetUnitCost,
      providerFee: rule.providerFee, networkFee: rule.networkFee, bankFee: rule.bankFee, otherFee: rule.otherFee,
      evidence: rule.evidence, costsVerified: rule.costsVerified,
    }) : null;
    let executionMatches = !record;
    try {
      if (record?.execution) executionMatches =
        sum(record.execution.amount, negate(order.amount)) === "0" &&
        sum(record.execution.receiveAmount, negate(order.receiveAmount)) === "0";
    } catch { /* A changed/malformed execution cannot reuse an attested basis. */ }
    let values: ReturnType<typeof calculateProfit> | null = null;
    try {
      if (basis && executionMatches && (order.executionVerified || record)) values = calculateProfit(order.amount, order.receiveAmount, basis);
    } catch { /* Malformed legacy execution is unavailable, never invented. */ }
    const adjustments = sum(...audit.filter(r => r.kind === "adjustment" && r.currency === basis?.currency).map(r => r.amount || "0"));
    const reversed = order.status !== "completed";
    rows.push({
      ...order, key, completedAt: null, basis, basisId: record?.id || rule?.id || null,
      customerRate: (() => { try { return divide(order.receiveAmount, order.amount); } catch { return null; } })(),
      revenue: values?.revenue ?? null, acquisitionCost: values?.acquisitionCost ?? null, fees: values?.fees ?? null,
      grossSpread: values?.grossSpread ?? null,
      netProfit: values ? reversed ? adjustments : sum(values.netProfit, adjustments) : null,
      adjustments, state: reversed ? "reversed" : values ? "verified" : "missing",
      href: `/admin/orders/${encodeURIComponent(order.id)}?type=${order.type === "Convert" ? "instant" : "manual"}`,
      audit: [
        ...audit.map(r => ({ id: r.id, kind: r.kind, currency: r.currency, amount: r.amount, reason: r.reason, createdAt: r.createdAt.toISOString() })),
        ...reversed && values && basis ? lifecycle.filter(log => log.orderId === order.id &&
          /refund|revers/.test(JSON.stringify(log.details).toLowerCase() + log.action.toLowerCase())
        ).map(log => ({
          id: `reversal:${log.id}`, kind: "reversal", currency: basis.currency,
          amount: negate(values.netProfit), reason: "Base profit excluded by recorded refund/reversal; lifecycle audit retained.",
          createdAt: log.createdAt.toISOString(),
        })).slice(0, 1) : [],
      ],
    });
  }
  const filtered = rows.filter(r => {
    if (filters.from && r.createdAt.slice(0, 10) < filters.from || filters.to && r.createdAt.slice(0, 10) > filters.to) return false;
    if (filters.type && filters.type !== "all" && r.type !== filters.type) return false;
    if (filters.currency && ![r.fromAsset, r.toAsset, r.basis?.currency].includes(filters.currency)) return false;
    if (filters.paymentMethod && ![r.paymentMethod, r.fromNetwork, r.toNetwork].includes(filters.paymentMethod)) return false;
    if (filters.search && !`${r.id} ${r.fromAsset} ${r.toAsset} ${r.fromNetwork} ${r.toNetwork} ${r.paymentMethod}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.profit === "missing" && r.state !== "missing") return false;
    if (filters.profit === "profit" && !(r.netProfit && positive(r.netProfit))) return false;
    if (filters.profit === "loss" && !(r.netProfit && negative(r.netProfit))) return false;
    return true;
  });
  const summaries = new Map<string, ProfitReport["summary"][number]>();
  const volume = new Map<string, string>();
  for (const row of filtered) {
    if (row.status === "completed") volume.set(row.fromAsset, sum(volume.get(row.fromAsset) || "0", row.amount));
    if (!row.basis || row.netProfit === null) continue;
    const currency = row.basis.currency;
    const bucket = summaries.get(currency) || { currency, revenue: "0", acquisitionCost: "0", fees: "0", costs: "0", profit: "0", adjustments: "0", valued: 0 };
    if (row.status === "completed") {
      bucket.revenue = sum(bucket.revenue, row.revenue!);
      bucket.acquisitionCost = sum(bucket.acquisitionCost, row.acquisitionCost!);
      bucket.fees = sum(bucket.fees, row.fees!);
      bucket.costs = sum(bucket.costs, row.acquisitionCost!, row.fees!);
      bucket.valued++;
    }
    bucket.profit = sum(bucket.profit, row.netProfit);
    bucket.adjustments = sum(bucket.adjustments, row.adjustments);
    summaries.set(currency, bucket);
  }
  const pageSize = 25;
  const page = Math.min(filters.page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  return {
    rows: allRows ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length, page, pageSize, owner,
    currencies: [...new Set(["EUR", ...assets.map(a => a.code), ...fiat.map(f => f.code), ...rules.map(r => r.currency), ...executions.flatMap(r => [r.fromAsset, r.toAsset])])].sort(),
    routes: [...routes.values()], methods: [...new Set([...methods, ...executions.flatMap(r => [r.fromNetwork, r.toNetwork])])].filter(Boolean).sort(),
    rules, summary: [...summaries.values()].sort((a, b) => a.currency === "EUR" ? -1 : b.currency === "EUR" ? 1 : a.currency.localeCompare(b.currency)),
    completedOrders: filtered.filter(r => r.status === "completed").length,
    missingCosts: filtered.filter(r => r.status === "completed" && r.state === "missing").length,
    volume: [...volume].map(([currency, amount]) => ({ currency, amount })),
  };
}
