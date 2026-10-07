import { db, quickexOrdersTable } from "@workspace/db";
import { notInArray, sql } from "drizzle-orm";
import { TERMINAL_STATUSES } from "./quickex";

/**
 * Read the canonical Convert aggregate only. Swap orders, provider API calls,
 * editable operational references and customer projections are not consulted.
 */
export async function hasActiveConvertOrderForXml(): Promise<boolean> {
  const rows = await db.select({ present: sql<number>`1` }).from(quickexOrdersTable)
    .where(notInArray(sql<string>`lower(${quickexOrdersTable.status})`, [...TERMINAL_STATUSES]))
    .limit(1);
  return rows.length > 0;
}
