import { db, manualDeskPricingRulesTable } from "@workspace/db";
import { GetAdminRatesXmlPreviewResponse } from "@workspace/api-zod";
import { listPublicFiatSettlementOptions } from "./payment-methods";
import { listPublicManualCryptoSettlementOptions } from "./manual-crypto";
import { discoverXmlSwapRoutes } from "./rates-xml-routes";
import { prepareManualSwapPublicationQuotes } from "../routes/exchange";
import { readConvertXmlPublication } from "./rates-xml-convert";
import { compareDecimal, plainDecimal } from "./rates-xml-decimal";
import {
  applyXmlParts, divideXmlDecimals, serializeRatesXml, sumXmlDecimals,
  type RatesXmlItem, type RatesXmlPart,
} from "./rates-xml-format";
import {
  readXmlSettings, readXmlMethods, XML_CODE_LOOKUP, STAGING_ONLY_XML_CODES,
  xmlStaging, xmlPublicationConfigurationHash, type XmlMethod,
} from "./rates-xml-methods";
import { onRatesXmlChange } from "./rates-xml-cache";
import { XmlQuoteRefresh, type XmlCachedQuote } from "./rates-xml-refresh";
import { readPublishedXmlQuotes, savePublishedXmlQuote } from "./rates-xml-publication";

type Diagnostic = typeof GetAdminRatesXmlPreviewResponse._output.diagnostics[number];
const quoteCache = new Map<string, XmlCachedQuote<RatesXmlItem>>();
const quoteRefresh = new XmlQuoteRefresh<RatesXmlItem>();
let cacheGeneration = 0;
export function invalidateRatesXml() { cacheGeneration++; quoteCache.clear(); }
onRatesXmlChange(invalidateRatesXml);
const problem = (error: unknown) => error instanceof Error ? error.message : "Current pricing is unavailable.";
export function xmlMethodProblem(method: XmlMethod | undefined, staging: boolean) {
  if (!method) return "The settlement method no longer exists.";
  if (!method.enabled) return "The settlement method is disabled.";
  if (!method.code) return `Missing XML code for ${method.name}. Set it in the method settings.`;
  const entry = XML_CODE_LOOKUP.get(method.code);
  if (!entry || (entry.type === "fiat") !== (method.kind === "fiat")) return `Invalid supplied-list code for ${method.name}.`;
  if (!staging && STAGING_ONLY_XML_CODES.has(method.code)) return "Perfect Money is staging-only and is excluded from production.";
  return undefined;
}
/** Reject gaps rather than advertise amounts the site's existing engine rejects. */
export async function priceXmlSwap(
  sourceId: string, targetId: string, source: XmlMethod, target: XmlMethod,
  prepare = prepareManualSwapPublicationQuotes,
): Promise<RatesXmlItem> {
  const live = await prepare(sourceId, targetId, []);
  const min = live.effectiveMinAmount, max = live.effectiveMaxAmount;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min! < 0 || max! <= min!)
    throw new Error("Set a nonnegative source minimum and a finite larger maximum in Edit Path / Add Range.");
  const bounds = new Set([min!, max!]);
  for (const tier of live.tiers) {
    for (const boundary of [tier.minAmount, tier.maxAmount]) {
      const n = Number(boundary);
      if (boundary != null && Number.isFinite(n) && n > min! && n < max!) bounds.add(n);
    }
  }
  const points = [...bounds].sort((a, b) => a - b);
  const parts: RatesXmlPart[] = [];
  // A quote at each boundary proves the route remains executable there.
  if (min! > 0) await live.quote(min!);
  await live.quote(max!);
  for (let i = 0; i < points.length - 1; i++) {
    const amount = points[i] + (points[i + 1] - points[i]) / 2;
    if (live.rangeOnlyPricing && !live.tiers.some(t =>
      amount >= Number(t.minAmount) && (t.maxAmount == null || amount <= Number(t.maxAmount))))
      throw new Error("Amount ranges contain a gap. Complete the ranges before publishing this direction.");
    const result = await live.publicationQuote(amount);
    const fixedFee = sumXmlDecimals(result.fixedFees);
    const rate = divideXmlDecimals(sumXmlDecimals([result.receiveAmount, fixedFee]), plainDecimal(amount));
    parts.push({ frommin: plainDecimal(points[i]), frommax: plainDecimal(points[i + 1]), rate, fixedFee });
  }
  return applyXmlParts({
    from: source.code!, to: target.code!, amount: target.reserve,
    minamount: plainDecimal(min!), maxamount: plainDecimal(max!), symbol: source.assetCode, param: "manual",
  }, parts);
}
export async function buildRatesXmlPreview(staging = xmlStaging()) {
  const row = await readXmlSettings();
  const [{ methods, catalogFingerprint }, pricing, fiat, crypto] = await Promise.all([
    readXmlMethods(row, { cacheOnly: true }), db.select().from(manualDeskPricingRulesTable),
    listPublicFiatSettlementOptions(), listPublicManualCryptoSettlementOptions(),
  ]);
  const reviewHash = xmlPublicationConfigurationHash(row?.version ?? 0, methods, pricing, catalogFingerprint, staging);
  const published = await readPublishedXmlQuotes(reviewHash);
  for (const saved of published) {
    if (saved.quote.diagnostic.functionType !== "swap") continue;
    const current = quoteCache.get(saved.key);
    if (!current || (current.quotedAt ?? 0) < saved.quotedAt)
      quoteCache.set(saved.key, {
        until: saved.quotedAt + 30_000, quotedAt: saved.quotedAt, item: saved.quote.item,
      });
  }
  const byId = new Map(methods.map(m => [m.optionId, m]));
  const candidates: Array<{ d: Diagnostic; run: () => Promise<RatesXmlItem> }> = [];
  const diagnostics: Diagnostic[] = [], items: Array<{ item: RatesXmlItem; d: Diagnostic }> = [];
  const generation = cacheGeneration;
  const add = (type: "swap" | "convert", id: string, sourceId: string, targetId: string, run: () => Promise<RatesXmlItem>) => {
    const source = byId.get(sourceId), target = byId.get(targetId);
    const d: Diagnostic = {
      routeId: id, functionType: type, sourceOptionId: sourceId, targetOptionId: targetId,
      fromName: source?.name ?? sourceId, toName: target?.name ?? targetId, state: "omitted", message: "",
    };
    diagnostics.push(d);
    const error = xmlMethodProblem(source, staging) ?? xmlMethodProblem(target, staging);
    if (error) { d.message = error; return; }
    candidates.push({ d, run });
  };
  const swap = discoverXmlSwapRoutes([...fiat, ...crypto], pricing);
  for (const d of swap) {
    add("swap", d.id, d.sourceOptionId, d.targetOptionId, () =>
      priceXmlSwap(d.sourceOptionId, d.targetOptionId, byId.get(d.sourceOptionId)!, byId.get(d.targetOptionId)!));
  }
  try {
    const convert = await readConvertXmlPublication();
    diagnostics.push(...convert.diagnostics);
    for (const published of convert.items) {
      if (!staging && (STAGING_ONLY_XML_CODES.has(published.item.from) || STAGING_ONLY_XML_CODES.has(published.item.to))) {
        published.d.state = "omitted";
        published.d.message = "This direction remains staging-only until explicitly approved for Production.";
      } else items.push(published);
    }
  } catch (error) {
    diagnostics.push({
      routeId: "convert:availability", functionType: "convert", sourceOptionId: "", targetOptionId: "",
      fromName: "Convert", toName: "Provider routes", state: "omitted", message: problem(error),
    });
  }
  // Reject ambiguous code pairs BEFORE fetching quotes; availability must not
  // arbitrarily select one method simply because another quote was slower.
  const pairs = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = `${byId.get(candidate.d.sourceOptionId)!.code}\0${byId.get(candidate.d.targetOptionId)!.code}`;
    pairs.set(key, [...pairs.get(key) ?? [], candidate]);
  }
  const readyCandidates: typeof candidates = [];
  for (const group of pairs.values()) {
    if (group.length === 1) readyCandidates.push(group[0]);
    else for (const candidate of group)
      candidate.d.message = "Multiple methods map to the same XML currency pair. Assign distinct appropriate codes.";
  }
  const candidateByKey = new Map<string, typeof readyCandidates[number]>(readyCandidates.map(candidate =>
    [`${reviewHash}:${candidate.d.routeId}`, candidate] as const));
  const hasPublishedRates = items.length > 0 || readyCandidates.some(candidate =>
    quoteCache.get(`${reviewHash}:${candidate.d.routeId}`)?.item);
  await quoteRefresh.refresh(`${generation}:${reviewHash}`, readyCandidates.map(candidate => ({
    key: `${reviewHash}:${candidate.d.routeId}`, run: candidate.run,
  })), quoteCache, () => generation === cacheGeneration, hasPublishedRates ? 0 : 8_000,
  async (key, item, quotedAt) => {
    const candidate = candidateByKey.get(key)!;
    await savePublishedXmlQuote(reviewHash, key, {
      item, source: byId.get(candidate.d.sourceOptionId)!,
      target: byId.get(candidate.d.targetOptionId)!, diagnostic: candidate.d,
    }, quotedAt);
  });
  for (const candidate of readyCandidates) {
    const cached = quoteCache.get(`${reviewHash}:${candidate.d.routeId}`);
    // Freshness controls refresh scheduling, not whether a successful rate disappears.
    const entry = cached;
    if (entry?.item) {
      candidate.d.state = "ready";
      candidate.d.message = entry.until > Date.now() && !entry.reason
        ? "Current executable pricing."
        : `Last successful XML rate (${new Date(entry.quotedAt!).toISOString()}); refresh pending.`;
      items.push({ item: entry.item, d: candidate.d });
    } else candidate.d.message = entry?.reason ?? "Current quote refresh is pending. Retry shortly.";
  }
  // Never silently choose an arbitrary method when two routes share XML codes.
  const grouped = new Map<string, typeof items>();
  for (const result of items) {
    const key = `${result.item.from}\0${result.item.to}`;
    grouped.set(key, [...grouped.get(key) ?? [], result]);
  }
  const accepted: RatesXmlItem[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1) accepted.push(group[0].item);
    else for (const result of group) {
      result.d.state = "omitted";
      result.d.message = "Multiple methods map to the same XML currency pair. Review their codes before publication.";
    }
  }
  const latestRow = await readXmlSettings();
  const [{ methods: latestMethods, catalogFingerprint: latestCatalog }, latestPricing] = await Promise.all([
    readXmlMethods(latestRow, { cacheOnly: true }), db.select().from(manualDeskPricingRulesTable),
  ]);
  if (generation !== cacheGeneration || reviewHash !== xmlPublicationConfigurationHash(latestRow?.version ?? 0,
    latestMethods, latestPricing, latestCatalog, staging))
    throw new Error("Configuration changed during XML generation. Refresh to use the latest settings.");
  if (quoteCache.size > 10_000) {
    for (const key of quoteCache.keys()) if (!key.startsWith(`${reviewHash}:`)) quoteCache.delete(key);
  }
  accepted.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return GetAdminRatesXmlPreviewResponse.parse({
    xml: serializeRatesXml(accepted), generatedAt: new Date().toISOString(),
    exportedCount: accepted.length, diagnostics,
  });
}
