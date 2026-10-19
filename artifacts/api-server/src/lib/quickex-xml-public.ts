import { compareDecimal, plainDecimal } from "./rates-xml-decimal";
import type { RatesXmlItem } from "./rates-xml-format";

/** Public partner data, not a customer quote ticket or an executable order. */
export type PartnerInstrument = {
  currencyTitle: string; networkTitle: string; slug: string;
  bestChangeCurrencyName: string; reservesAmount?: string;
};
export type PartnerPair = {
  instrumentFrom: PartnerInstrument; instrumentTo: PartnerInstrument;
  isActive: boolean; minAmount: string; maxAmount: string;
};
export type PartnerXmlClient = {
  identity: string; referrerId: string; authenticated: boolean;
  read(path: "/pairs/all" | "/rates/public/one", params: Record<string, string>): Promise<unknown>;
};
export class PartnerXmlDataError extends Error { readonly status = 422; }
/** An unusable provider timestamp is a transient feed failure, not a removed route. */
export class PartnerXmlQuoteUnavailableError extends Error { readonly status = 503; }
/** Node 24 supplies each primitive's original JSON token. XML must not lose provider precision. */
export function parsePartnerJson(raw: string): unknown {
  return JSON.parse(raw, (_key, value, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    if (!context?.source) throw new Error("XML precision requires JSON source-token support.");
    return context.source;
  });
}
export function partnerRequestQuery(input: Record<string, string>, referrerId: string) {
  const params = new URLSearchParams(input);
  params.set("referrerId", referrerId);
  return params;
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new PartnerXmlDataError("Invalid Quickex XML JSON object.");
  return v as Record<string, unknown>;
};
const text = (v: unknown) => {
  if (typeof v !== "string" || !v.trim()) throw new PartnerXmlDataError("Missing Quickex XML instrument identity.");
  return v.trim();
};
const decimal = (v: unknown, positive = false) => {
  if (typeof v !== "string" && typeof v !== "number") throw new PartnerXmlDataError("Missing Quickex XML monetary value.");
  let result: string;
  try { result = plainDecimal(v); }
  catch { throw new PartnerXmlDataError("Invalid Quickex XML monetary value."); }
  if (positive && compareDecimal(result, "0") <= 0) throw new PartnerXmlDataError("Quickex XML quote must be positive.");
  return result;
};
function instrument(v: unknown): PartnerInstrument {
  const row = object(v);
  return {
    currencyTitle: text(row.currencyTitle), networkTitle: text(row.networkTitle),
    slug: typeof row.slug === "string" ? row.slug : "",
    bestChangeCurrencyName: typeof row.bestChangeCurrencyName === "string" ? row.bestChangeCurrencyName.trim() : "",
    ...(row.reservesAmount != null ? { reservesAmount: decimal(row.reservesAmount) } : {}),
  };
}
/** Quickex V2 documents uppercase slug as the fallback when its XML code is empty. */
export function partnerXmlCode(instrument: PartnerInstrument): string {
  return instrument.bestChangeCurrencyName.trim() || instrument.slug.trim().toUpperCase();
}
/** Provider time, not successful HTTP receipt, determines a rate's remaining validity. */
export function partnerQuoteTimestamp(value: unknown, now: number, maxAgeMs: number): number {
  const raw = object(value).updatedAt;
  const timestamp = typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw))
    ? Number(raw) : NaN;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > now || now - timestamp >= maxAgeMs)
    throw new PartnerXmlQuoteUnavailableError("Missing, future-dated or expired Quickex XML quote timestamp.");
  return timestamp;
}
export function parsePartnerPair(v: unknown): PartnerPair {
  const row = object(v);
  if (typeof row.isActive !== "boolean") throw new PartnerXmlDataError("Missing Quickex affiliate pair activation state.");
  const pair = {
    instrumentFrom: instrument(row.instrumentFrom), instrumentTo: instrument(row.instrumentTo),
    isActive: row.isActive,
    minAmount: row.isActive && row.minAmount !== "" ? decimal(row.minAmount) : "0",
    maxAmount: row.isActive && row.maxAmount !== "" ? decimal(row.maxAmount) : "0",
  };
  if (compareDecimal(pair.maxAmount, "0") > 0 && compareDecimal(pair.maxAmount, pair.minAmount) < 0)
    throw new PartnerXmlDataError("Invalid Quickex XML source limits.");
  return pair;
}
export function partnerPairKey(pair: PartnerPair) {
  return JSON.stringify([pair.instrumentFrom.currencyTitle, pair.instrumentFrom.networkTitle,
    pair.instrumentTo.currencyTitle, pair.instrumentTo.networkTitle]);
}
/** Adapt provider-owned identities to the existing executable-route resolver. */
export function partnerPairRoute(pair: PartnerPair) {
  return {
    instrumentFromCurrencyTitle: pair.instrumentFrom.currencyTitle,
    instrumentFromNetworkTitle: pair.instrumentFrom.networkTitle,
    instrumentToCurrencyTitle: pair.instrumentTo.currencyTitle,
    instrumentToNetworkTitle: pair.instrumentTo.networkTitle,
  };
}
export function partnerRateParams(pair: PartnerPair) {
  return {
    instrumentFromCurrencyTitle: pair.instrumentFrom.currencyTitle,
    instrumentFromNetworkTitle: pair.instrumentFrom.networkTitle,
    instrumentToCurrencyTitle: pair.instrumentTo.currencyTitle,
    instrumentToNetworkTitle: pair.instrumentTo.networkTitle,
    rateMode: "FLOATING",
    ...(compareDecimal(pair.minAmount, "0") > 0 ? { claimedDepositAmount: pair.minAmount } : {}),
  };
}
/** Preserve provider base/quote values: no local markup, fee calculation or normalization to 1. */
export function partnerRateToXml(pair: PartnerPair, value: unknown): RatesXmlItem {
  if (!pair.isActive) throw new PartnerXmlDataError("Quickex affiliate pair is inactive.");
  const rate = object(value);
  const quote = object(object(rate.quotesWithoutNetworkFee).sellQuote);
  const minamount = decimal(rate.generalMinAmount), maxamount = decimal(rate.generalMaxAmount, true);
  if (compareDecimal(minamount, "0") < 0 || compareDecimal(maxamount, minamount) < 0)
    throw new PartnerXmlDataError("Invalid Quickex XML live quote limits.");
  return {
    from: text(partnerXmlCode(pair.instrumentFrom)),
    to: text(partnerXmlCode(pair.instrumentTo)),
    in: decimal(quote.baseValue, true), out: decimal(quote.quoteValue, true),
    amount: decimal(pair.instrumentTo.reservesAmount),
    minamount, maxamount,
    fixedFee: decimal(rate.finalNetworkFeeAmount),
    symbol: pair.instrumentFrom.currencyTitle, param: "floating, language", providerJson: true,
  };
}
export async function fetchPartnerPairs(client: PartnerXmlClient) {
  const pairs: PartnerPair[] = [], seenPages = new Set<string>();
  let offset = 0;
  for (;;) {
    const body = object(await client.read("/pairs/all", { limit: "1000", offset: String(offset) }));
    const total = Number(body.total);
    if ((typeof body.total !== "number" && (typeof body.total !== "string" || !/^\d+$/.test(body.total))) ||
        !Number.isSafeInteger(total) || total < 0 || !Array.isArray(body.pairs) ||
        body.pairs.length > 1000 || offset + body.pairs.length > total)
      throw new Error("Invalid Quickex affiliate pair pagination.");
    const page: PartnerPair[] = [];
    for (const raw of body.pairs) {
      try { page.push(parsePartnerPair(raw)); }
      catch { /* One malformed direction must not prevent valid directions from refreshing. */ }
    }
    const signature = JSON.stringify(body.pairs);
    if (body.pairs.length && seenPages.has(signature)) throw new Error("Quickex affiliate pagination repeated a page.");
    seenPages.add(signature);
    pairs.push(...page); offset += body.pairs.length;
    if (offset >= total) return pairs;
    if (!body.pairs.length) throw new Error("Quickex affiliate catalogue ended before its reported total.");
  }
}
