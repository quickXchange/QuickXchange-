import { Router } from "express";
import { z } from "zod";
import { db, profitRatesTable, profitRecordsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { ProfitAdjustmentInput, ProfitBasisRecordInput, ProfitRateInput, ProfitTradeRecordInput, ProfitMyRateInput } from "@workspace/api-zod";
import { requireOwner, type OperatorAuthorization } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";
import { profitExecutions, profitReport } from "../lib/order-profit";
import { calculateProfit, calculateTradeProfit, positive } from "../lib/order-profit-math";

const router = Router();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const filterSchema = z.object({
  from: day.optional(), to: day.optional(), search: z.string().max(160).optional(),
  currency: z.string().max(32).optional(), paymentMethod: z.string().max(500).optional(),
  type: z.enum(["all", "Swap", "Convert"]).default("all"), profit: z.enum(["all", "profit", "loss", "missing"]).default("all"),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  completedOnly: z.enum(["true", "false"]).optional().transform(v => v === "true"),
}).refine(v => !v.from || !v.to || v.from <= v.to, "From date must not exceed To date.");
const parse = <S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError("INVALID_PROFIT_INPUT", result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  return result.data;
};
router.use("/admin/profit-dashboard", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store"); next();
});
router.get("/admin/profit-dashboard", async (req, res): Promise<void> => {
  res.json(await profitReport(parse(filterSchema, req.query), (res.locals.operator as OperatorAuthorization).role === "owner"));
});
const cell = (value: unknown) => {
  const text = String(value ?? "");
  const safe = !/^-?\d+(?:\.\d+)?$/.test(text) && /^[\s]*[=+\-@]|^[\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
router.get("/admin/profit-dashboard.csv", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const report = await profitReport(parse(filterSchema, req.query), false, true);
  const headers = ["Order ID", "Created at", "Type", "Status", "Source asset", "Source network", "Target asset", "Target network", "Payment method", "Executed source", "Executed payout", "Customer rate (target/source)", "Accounting currency", "Source proceeds/unit", "Payout acquisition/unit", "Gross revenue", "Acquisition cost", "Provider fee", "Network fee", "Bank fee", "Other fee", "Total fees", "Gross spread", "Adjustments", "Net profit", "Valuation", "Evidence", "Trade asset", "Trade quantity", "Buy mode", "Buy input", "Buy currency", "Buy FX", "Sell mode", "Sell input", "Sell currency", "Sell FX", "Commission 1 %", "Commission 1 amount", "Receiving commission %", "Receiving commission amount", "Additional fixed fee"];
  const lines = report.rows.map(r => {
    const legacy = r.basis && !("calculation" in r.basis) ? r.basis : null;
    const trade = r.basis && "calculation" in r.basis ? r.basis : null;
    return [
    r.id, r.createdAt, r.type, r.status, r.fromAsset, r.fromNetwork, r.toAsset, r.toNetwork, r.paymentMethod, r.amount, r.receiveAmount,
    r.customerRate, r.basis?.currency, legacy?.sourceUnitValue, legacy?.targetUnitCost, r.revenue, r.acquisitionCost,
    legacy?.providerFee, legacy?.networkFee, legacy?.bankFee, legacy?.otherFee, r.fees, r.grossSpread, r.adjustments, r.netProfit,
    r.netProfit === null ? "Profit unavailable" : r.state, r.basis?.evidence,
    r.tradeDetails?.asset, r.tradeDetails?.quantity, trade?.buyMode, trade?.buyValue, trade?.buyCurrency, trade?.buyFx,
    trade?.sellMode, trade?.sellValue, trade?.sellCurrency, trade?.sellFx,
    trade?.commission1Percent, r.tradeDetails?.commission1, trade?.receivingCommissionPercent, r.tradeDetails?.receivingCommission,
    trade?.additionalFixedFee,
  ].map(cell).join(","); });
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="quickxchange-order-profit.csv"');
  res.send("\uFEFF" + [headers.map(cell).join(","), ...lines].join("\r\n"));
});

function checkUnits(basis: { currency: string; sourceUnitValue: string; targetUnitCost: string }, route: { fromAsset: string; toAsset: string }) {
  const unit = (v: string) => /^1(?:\.0+)?$/.test(v);
  if ((basis.currency === route.fromAsset && !unit(basis.sourceUnitValue)) ||
      (basis.currency === route.toAsset && !unit(basis.targetUnitCost))) {
    throw new ApiError("INVALID_ACCOUNTING_UNIT", "The accounting currency itself must have a unit value of 1.", 400);
  }
  calculateProfit("1", "1", { ...basis, providerFee: "0", networkFee: "0", bankFee: "0", otherFee: "0", evidence: "Unit validation", costsVerified: true });
}
router.post("/admin/profit-dashboard/rates", requireOwner, async (req, res): Promise<void> => {
  const config = parse(ProfitRateInput, req.body);
  checkUnits(config, config);
  const [saved] = await db.insert(profitRatesTable).values({ config, actorId: res.locals.operator.id }).returning();
  res.status(201).json({ ...config, id: saved.id, effectiveAt: saved.effectiveAt.toISOString() });
});
router.post("/admin/profit-dashboard/my-rates", requireOwner, async (req, res): Promise<void> => {
  const config = parse(ProfitMyRateInput, req.body);
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`my-rate:${config.requestId}`}, 0))`);
    const [existing] = await tx.select().from(profitRatesTable).where(sql`${profitRatesTable.config}->>'requestId' = ${config.requestId}`);
    if (existing) {
      if (canonical(existing.config) !== canonical(config)) throw new ApiError("PROFIT_IDEMPOTENCY_CONFLICT", "This request ID was already used for different rates.", 409);
      return { record: existing, replay: true };
    }
    const [saved] = await tx.insert(profitRatesTable).values({
      config, actorId: res.locals.operator.id, effectiveAt: sql`clock_timestamp()`,
    }).returning();
    return { record: saved, replay: false };
  });
  res.status(result.replay ? 200 : 201).json({ ...config, id: result.record.id, effectiveAt: result.record.effectiveAt.toISOString(), replay: result.replay });
});

const orderParams = z.object({ type: z.enum(["Swap", "Convert"]), id: z.string().min(1).max(160) });
for (const action of ["basis", "trade", "adjustments"] as const) {
  router.post(`/admin/profit-dashboard/orders/:type/:id/${action}`, requireOwner, async (req, res): Promise<void> => {
    const params = parse(orderParams, req.params);
    const input = action === "basis" ? parse(ProfitBasisRecordInput, req.body)
      : action === "trade" ? parse(ProfitTradeRecordInput, req.body) : parse(ProfitAdjustmentInput, req.body);
    const isBasis = action !== "adjustments";
    const orderKey = `${params.type}:${params.id}`;
    const { requestId, ...value } = input;
    const result = await db.transaction(async tx => {
    // Serialize only this order's accounting metadata. No operational order
    // locks, state transitions or financial writes are performed.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderKey}, 0))`);
    const matches = (record: typeof profitRecordsTable.$inferSelect) =>
      record.orderKey === orderKey && record.kind === (isBasis ? "basis" : "adjustment") &&
      record.currency === value.currency && (!("amount" in value)
        ? canonical(record.basis || {}) === canonical(value)
        : record.amount === value.amount && record.reason === value.reason);
    const [replay] = await tx.select().from(profitRecordsTable).where(eq(profitRecordsTable.requestId, input.requestId));
    if (replay) {
      if (!matches(replay)) {
        throw new ApiError("PROFIT_IDEMPOTENCY_CONFLICT", "This request ID belongs to a different accounting payload.", 409);
      }
      return { id: replay.id, replay: true, status: 200 };
    }
    const liveOrder = (await profitExecutions()).find(o => o.type === params.type && o.id === params.id);
    if (!liveOrder) throw new ApiError("PROFIT_ORDER_NOT_FOUND", "Only completed orders or recorded reversals can be accounted for.", 404);
    const [completion] = await tx.select().from(profitRecordsTable).where(sql`
      ${profitRecordsTable.orderKey} = ${orderKey} AND ${profitRecordsTable.kind} = 'completion'`);
    const order = completion?.execution ? { ...liveOrder,
      ...completion.execution, fromAsset: String(completion.basis?.fromAsset), toAsset: String(completion.basis?.toAsset),
    } : liveOrder;
    let tradeProfit: ReturnType<typeof calculateTradeProfit> | undefined;
    if (isBasis) {
      if (!["completed", "refunded", "reversed"].includes(order.status)) {
        throw new ApiError("PROFIT_ORDER_NOT_COMPLETED", "Profit inputs can only be saved for completed orders.", 409);
      }
      if ("calculation" in value) {
        if (order.status !== "completed") {
          throw new ApiError("PROFIT_TRADE_COMPLETED_ONLY", "Per-order buy/sell accounting is available only for completed orders.", 409);
        }
        if (!positive(value.quantitySide === "source" ? order.amount : order.receiveAmount)) {
          throw new ApiError("INVALID_EXECUTED_QUANTITY", "This order has no positive saved execution quantity for the selected asset.", 400);
        }
        tradeProfit = calculateTradeProfit(order.amount, order.receiveAmount, value);
      } else if ("sourceUnitValue" in value) checkUnits(value, order);
      const previous = await tx.select().from(profitRecordsTable).where(eq(profitRecordsTable.orderKey, orderKey));
      if (previous.some(r => r.kind === "adjustment" && r.currency !== value.currency)) {
        throw new ApiError("PROFIT_CURRENCY_LOCKED", "Existing adjustments lock this order's accounting currency.", 409);
      }
    }
    if (action === "adjustments") {
      const report = await profitReport({ page: 1, search: order.id }, true, true);
      const row = report.rows.find(r => r.key === orderKey);
      if (!row?.basis || row.netProfit === null || row.basis.currency !== value.currency) {
        throw new ApiError("PROFIT_BASIS_REQUIRED", "Record verified costs first; adjustments must use the same accounting currency.", 409);
      }
    }
    const [saved] = await tx.insert(profitRecordsTable).values({
      orderKey, kind: isBasis ? "basis" : "adjustment", currency: value.currency,
      basis: isBasis ? value : null,
      execution: isBasis ? { amount: order.amount, receiveAmount: order.receiveAmount, ...(tradeProfit ? { profit: tradeProfit } : {}) } : null,
      amount: "amount" in value ? value.amount : null,
      reason: "evidence" in value ? value.evidence : value.reason,
      requestId, actorId: res.locals.operator.id,
      createdAt: sql`clock_timestamp()`,
    }).onConflictDoNothing({ target: profitRecordsTable.requestId }).returning();
    const record = saved ?? (await tx.select().from(profitRecordsTable).where(eq(profitRecordsTable.requestId, requestId)))[0];
    if (!record || !matches(record)) throw new ApiError("PROFIT_IDEMPOTENCY_CONFLICT", "Concurrent request used a different accounting payload.", 409);
    return { id: record.id, replay: !saved, status: saved ? 201 : 200 };
    });
    res.status(result.status).json({ id: result.id, replay: result.replay });
  });
}
export default router;
