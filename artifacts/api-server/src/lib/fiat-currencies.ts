import { asc, desc, eq, sql } from "drizzle-orm";
import { db, fiatCurrenciesTable } from "@workspace/db";

export async function listFiatCurrencies() {
  return db
    .select()
    .from(fiatCurrenciesTable)
    .orderBy(
      desc(fiatCurrenciesTable.enabled),
      sql`case ${fiatCurrenciesTable.lifecycle} when 'active' then 0 when 'restricted' then 1 else 2 end`,
      asc(fiatCurrenciesTable.code),
      asc(fiatCurrenciesTable.name),
      asc(fiatCurrenciesTable.id),
    );
}

export async function listEnabledFiatCurrencies() {
  return db
    .select()
    .from(fiatCurrenciesTable)
    .where(eq(fiatCurrenciesTable.enabled, true))
    .orderBy(
      sql`case ${fiatCurrenciesTable.lifecycle} when 'active' then 0 when 'restricted' then 1 else 2 end`,
      asc(fiatCurrenciesTable.code),
      asc(fiatCurrenciesTable.name),
      asc(fiatCurrenciesTable.id),
    );
}