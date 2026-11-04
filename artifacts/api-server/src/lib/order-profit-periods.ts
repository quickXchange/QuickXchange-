import type { ProfitPeriodTotal, ProfitRow } from "@workspace/api-zod";
import { sum } from "./order-profit-math";

// Additive completed-order summaries use the same UTC order-creation date as
// the existing Revenue filters. No completion timestamps or FX are invented.
export function profitPeriods(rows: ProfitRow[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const monday = new Date(`${today}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const week = monday.toISOString().slice(0, 10);
  const month = `${today.slice(0, 7)}-01`;
  const aggregate = (from?: string): ProfitPeriodTotal[] => {
    const totals = new Map<string, ProfitPeriodTotal>();
    for (const row of rows) {
      const date = row.createdAt.slice(0, 10);
      if (row.status !== "completed" || row.netProfit === null || !row.basis ||
        (from && (date < from || date > today))) continue;
      const currency = row.basis.currency;
      const total = totals.get(currency) || { currency, profit: "0", orders: 0 };
      total.profit = sum(total.profit, row.netProfit);
      total.orders++;
      totals.set(currency, total);
    }
    return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  };
  return { asOf: now.toISOString(), timeZone: "UTC" as const, dateBasis: "order_creation" as const,
    daily: aggregate(today), weekly: aggregate(week), monthly: aggregate(month), total: aggregate() };
}
