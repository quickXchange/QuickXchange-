import { and, eq } from "drizzle-orm";
import { db, fiatCurrenciesTable, fiatCurrencyPaymentMethodsTable } from "@workspace/db";
import { ApiError } from "./api-error";
import { normalizePaymentMethodReserve } from "./payment-method-reserve-validation";
export { normalizePaymentMethodReserve } from "./payment-method-reserve-validation";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function validateCurrencyReserve(executor: Transaction | typeof db, currencyId: string, value: string) {
  const [currency] = await executor.select().from(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.id, currencyId));
  if (!currency) throw new ApiError("FIAT_CURRENCY_NOT_FOUND", "Reserve currency does not exist.", 404);
  return normalizePaymentMethodReserve(value, currency.precision);
}

export async function savePaymentMethodReserves(
  tx: Transaction, paymentMethodId: string,
  rows: Array<{ fiatCurrencyId: string; reserve: string }> | undefined,
) {
  if (!rows) return;
  if (new Set(rows.map(row => row.fiatCurrencyId)).size !== rows.length) {
    throw new ApiError("INVALID_PAYMENT_METHOD_RESERVE", "Each reserve currency must appear only once.", 400);
  }
  for (const row of [...rows].sort((a, b) => a.fiatCurrencyId.localeCompare(b.fiatCurrencyId))) {
    const reserve = await validateCurrencyReserve(tx, row.fiatCurrencyId, row.reserve);
    await tx.insert(fiatCurrencyPaymentMethodsTable).values({ fiatCurrencyId: row.fiatCurrencyId, paymentMethodId, reserve })
      .onConflictDoUpdate({
        target: [fiatCurrencyPaymentMethodsTable.fiatCurrencyId, fiatCurrencyPaymentMethodsTable.paymentMethodId],
        set: { reserve, updatedAt: new Date() },
      });
  }
}

export async function getDestinationPaymentMethodReserve(optionId: string): Promise<string | undefined> {
  const match = /^fiat:([0-9a-fA-F-]{36}):(.+)$/.exec(optionId);
  if (!match) return undefined;
  const [row] = await db.select({ reserve: fiatCurrencyPaymentMethodsTable.reserve })
    .from(fiatCurrencyPaymentMethodsTable).where(and(
      eq(fiatCurrencyPaymentMethodsTable.fiatCurrencyId, match[1]),
      eq(fiatCurrencyPaymentMethodsTable.paymentMethodId, match[2]),
    ));
  return row?.reserve;
}