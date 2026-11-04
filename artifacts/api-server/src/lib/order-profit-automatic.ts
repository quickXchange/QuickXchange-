import { db, profitRecordsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { ProfitMyRateInput, ProfitTradeBasisInput, type ProfitMyRate } from "@workspace/api-zod";
import { calculateTradeProfit } from "./order-profit-math";
import { logger } from "./logger";

export type CompletionFacts = {
  fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string;
  amount: string; receiveAmount: string; executionVerified: boolean;
  rateCandidates: { id: string; config: unknown; effectiveAt: string }[];
  assetKinds: Record<string, string>;
};
export function chooseCompletionRate(facts: CompletionFacts, rates: ProfitMyRate[], kinds: Record<string, string>) {
  // Versions are already newest-first and fenced to the completion timestamp.
  const latest = new Map<string, ProfitMyRate>();
  for (const r of rates) {
    const key = JSON.stringify([r.asset, r.currency, r.network]);
    if (!latest.has(key)) latest.set(key, r);
  }
  const side = kinds[facts.fromAsset] === "crypto" ? "source"
    : kinds[facts.toAsset] === "crypto" ? "target" : null;
  let candidates = [...latest.values()].filter(r => side
    ? r.asset === (side === "source" ? facts.fromAsset : facts.toAsset) &&
      (!r.network || r.network === (side === "source" ? facts.fromNetwork : facts.toNetwork))
    : ((r.asset === facts.fromAsset && (!r.network || r.network === facts.fromNetwork)) ||
      (r.asset === facts.toAsset && (!r.network || r.network === facts.toNetwork))));
  const direct = candidates.filter(r => r.currency === (r.asset === facts.fromAsset ? facts.toAsset : facts.fromAsset));
  if (direct.length) candidates = direct;
  // An exact network overrides Any, including an explicitly disabled exact row.
  candidates = candidates.filter(r => r.network || !candidates.some(other =>
    other.asset === r.asset && other.currency === r.currency && other.network));
  if (candidates.length !== 1 || !candidates[0].active) return null;
  return { rate: candidates[0], quantitySide: candidates[0].asset === facts.fromAsset ? "source" as const : "target" as const };
}

export async function processRevenueCompletions(limit = 100): Promise<number> {
  const pending = await db.select().from(profitRecordsTable).where(sql`
    ${profitRecordsTable.kind} = 'completion' AND NOT EXISTS (
      SELECT 1 FROM order_profit_records processed
      WHERE processed.request_id = 'automatic:' || ${profitRecordsTable.id}::text
    )`).orderBy(profitRecordsTable.createdAt).limit(limit);
  if (!pending.length) return 0;
  for (const completion of pending) {
    try { await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${completion.orderKey}, 0))`);
      const requestId = `automatic:${completion.id}`;
      const [existing] = await tx.select().from(profitRecordsTable).where(eq(profitRecordsTable.requestId, requestId));
      if (existing) return;
      const facts = completion.basis as unknown as CompletionFacts;
      const parsedRates = (facts.rateCandidates ?? []).map(r => ({ ...ProfitMyRateInput.parse(r.config), id: r.id, effectiveAt: r.effectiveAt }));
      const selection = chooseCompletionRate(facts, parsedRates, facts.assetKinds ?? {});
      const [manual] = await tx.select().from(profitRecordsTable).where(sql`
        ${profitRecordsTable.orderKey} = ${completion.orderKey} AND ${profitRecordsTable.kind} = 'basis'`).limit(1);
      let basis: Record<string, unknown> | null = null;
      let profit: ReturnType<typeof calculateTradeProfit> | undefined;
      let reason = manual ? "Existing Owner accounting basis retained."
        : !facts.executionVerified ? "Verified executed quantities were missing at completion."
        : "No unambiguous active My Rates pair existed at completion.";
      if (!manual && facts.executionVerified && selection) {
        const { rate, quantitySide } = selection;
        const candidate = ProfitTradeBasisInput.parse({
          calculation: "trade", currency: rate.currency, quantitySide,
          buyMode: "unit", sellMode: "unit", buyValue: rate.buyRate, sellValue: rate.sellRate,
          buyCurrency: rate.currency, sellCurrency: rate.currency, buyFx: "1", sellFx: "1",
          commission1Percent: rate.partnerFeePercent, receivingCommissionPercent: rate.receivingFeePercent,
          additionalFixedFee: "0", costsVerified: true,
          evidence: `Owner My Rates ${rate.id}; frozen at completion ${completion.createdAt.toISOString()}`,
        });
        try {
          profit = calculateTradeProfit(facts.amount, facts.receiveAmount, candidate);
          basis = candidate;
          reason = candidate.evidence;
        } catch {
          reason = "Positive verified executed quantity was missing at completion.";
        }
      }
      await tx.insert(profitRecordsTable).values({
        orderKey: completion.orderKey, kind: basis ? "basis" : "unavailable",
        basis: basis ?? { reason }, execution: completion.execution ? { ...completion.execution, ...(profit ? { profit } : {}) } : null,
        currency: basis ? String(basis.currency) : "", reason,
        requestId, actorId: "revenue-automatic", createdAt: sql`clock_timestamp()`,
      }).onConflictDoNothing({ target: profitRecordsTable.requestId });
    }); } catch (error) {
      logger.error({ err: error, completionId: completion.id }, "Revenue snapshot remains pending and will retry");
    }
  }
  return pending.length;
}

export function startRevenueCompletionWorker() {
  let running = false, stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await processRevenueCompletions(); }
    catch (error) { logger.error({ err: error }, "Revenue completion accounting will retry"); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 5000);
  timer.unref(); void tick();
  return () => { stopped = true; clearInterval(timer); };
}
