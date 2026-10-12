import { and, eq, lt } from "drizzle-orm";
import { db, ratesXmlPublishedQuotesTable } from "@workspace/db";
import type { GetAdminRatesXmlPreviewResponse } from "@workspace/api-zod";
import type { RatesXmlItem } from "./rates-xml-format";
import type { XmlMethod } from "./rates-xml-methods";

type Diagnostic = typeof GetAdminRatesXmlPreviewResponse._output.diagnostics[number];
export type PublishedXmlQuote = {
  item: RatesXmlItem; source: XmlMethod; target: XmlMethod; diagnostic: Diagnostic;
};

/** Stored data is exclusively public publication metadata, never a signed provider ticket. */
export async function readPublishedXmlQuotes(configurationHash: string) {
  const rows = await db.select().from(ratesXmlPublishedQuotesTable)
    .where(eq(ratesXmlPublishedQuotesTable.configurationHash, configurationHash));
  return rows.map(row => ({
    key: row.key, quotedAt: row.quotedAt.getTime(),
    quote: row.payload as unknown as PublishedXmlQuote,
  }));
}

export async function savePublishedXmlQuote(
  configurationHash: string, key: string, quote: PublishedXmlQuote, quotedAt: number,
) {
  await db.insert(ratesXmlPublishedQuotesTable).values({
    key, configurationHash, payload: quote, quotedAt: new Date(quotedAt),
  }).onConflictDoUpdate({
    target: ratesXmlPublishedQuotesTable.key,
    set: { payload: quote, quotedAt: new Date(quotedAt) },
    // Concurrent replicas must not overwrite a newer successful publication.
    setWhere: and(eq(ratesXmlPublishedQuotesTable.configurationHash, configurationHash),
      lt(ratesXmlPublishedQuotesTable.quotedAt, new Date(quotedAt))),
  });
}
