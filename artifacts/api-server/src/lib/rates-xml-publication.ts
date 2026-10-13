import { and, eq, lt, inArray } from "drizzle-orm";
import { db, ratesXmlPublishedQuotesTable } from "@workspace/db";
import type { GetAdminRatesXmlPreviewResponse } from "@workspace/api-zod";
import type { RatesXmlItem } from "./rates-xml-format";
import type { XmlMethod } from "./rates-xml-methods";
import type { PartnerPair } from "./quickex-xml-public";

type Diagnostic = typeof GetAdminRatesXmlPreviewResponse._output.diagnostics[number];
export type PublishedXmlQuote = {
  item: RatesXmlItem; source: XmlMethod; target: XmlMethod; diagnostic: Diagnostic;
  providerPair?: PartnerPair;
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

/** Retire only publication records, never financial orders or provider state. */
export async function removePublishedXmlQuotes(configurationHash: string, keys?: string[]) {
  if (keys && !keys.length) return;
  await db.delete(ratesXmlPublishedQuotesTable).where(and(
    eq(ratesXmlPublishedQuotesTable.configurationHash, configurationHash),
    ...(keys ? [inArray(ratesXmlPublishedQuotesTable.key, keys)] : []),
  ));
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
