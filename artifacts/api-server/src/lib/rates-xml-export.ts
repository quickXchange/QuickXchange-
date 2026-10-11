import { db, manualDeskPricingRulesTable } from "@workspace/db";
import { GetAdminRatesXmlPreviewResponse } from "@workspace/api-zod";
import { listPublicFiatSettlementOptions } from "./payment-methods";
import { listPublicManualCryptoSettlementOptions } from "./manual-crypto";
import { discoverXmlSwapRoutes } from "./rates-xml-routes";
import { prepareManualSwapPublicationQuotes } from "../routes/exchange";
import { buildProviderQuoteTicket, getQuickexPublicCapabilityConfig } from "./provider-capabilities";
import { QuickexApiError } from "./quickex";
import { compareDecimal, plainDecimal } from "./rates-xml-decimal";
import {
  applyXmlParts, divideXmlDecimals, serializeRatesXml, sumXmlDecimals,
  type RatesXmlItem, type RatesXmlPart,
} from "./rates-xml-format";
import {
  readXmlSettings, readXmlMethods, XML_CODE_LOOKUP, STAGING_ONLY_XML_CODES,
  xmlStaging, xmlReviewHash, type XmlMethod,
} from "./rates-xml-methods";
import { onRatesXmlChange } from "./rates-xml-cache";

type Diagnostic = typeof GetAdminRatesXmlPreviewResponse._output.diagnostics[number];
const quoteCache = new Map<string, { until: number; item?: RatesXmlItem; reason?: string }>();
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
/** Provider-owned floating quote only; never create an exchange or sign an order. */
export async function priceXmlConvert(
  route: { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string },
  source: XmlMethod, target: XmlMethod,
  quote = buildProviderQuoteTicket,
): Promise<RatesXmlItem> {
  let ticket: Awaited<ReturnType<typeof buildProviderQuoteTicket>>;
  try {
    ticket = await quote({ ...route, amount: 1, rateMode: "FLOATING" });
  } catch (error) {
    // Use ONLY limits returned by the existing provider, never a guessed probe amount.
    const bound = error instanceof QuickexApiError &&
      ["QUICKEX_AMOUNT_TOO_SMALL", "QUICKEX_AMOUNT_TOO_LARGE"].includes(error.code)
      ? Number(error.providerExpectedClaimedAmount) : NaN;
    if (!Number.isFinite(bound) || bound <= 0) throw error;
    ticket = await quote({ ...route, amount: bound, rateMode: "FLOATING" });
  }
  const live = ticket.quickexQuote;
  if (!live.generalMinAmount || !live.generalMaxAmount ||
      compareDecimal(live.generalMinAmount, "0") <= 0 ||
      compareDecimal(live.generalMaxAmount, live.generalMinAmount) <= 0)
    throw new Error("Quickex has not supplied valid source minimum and maximum limits.");
  if (compareDecimal(live.price, "0") <= 0) throw new Error("Quickex pair rate is unavailable.");
  return {
    from: source.code!, to: target.code!, out: plainDecimal(live.price), amount: target.reserve,
    minamount: plainDecimal(live.generalMinAmount), maxamount: plainDecimal(live.generalMaxAmount),
    symbol: source.assetCode, param: "floating",
  };
}
export async function buildRatesXmlPreview(staging = xmlStaging()) {
  const row = await readXmlSettings();
  const [{ methods, capabilities, catalogFingerprint }, pricing, fiat, crypto] = await Promise.all([
    readXmlMethods(row), db.select().from(manualDeskPricingRulesTable),
    listPublicFiatSettlementOptions(), listPublicManualCryptoSettlementOptions(),
  ]);
  const reviewHash = xmlReviewHash(row?.version ?? 0, methods, { pricing, catalogFingerprint });
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
    const config = await getQuickexPublicCapabilityConfig();
    if (!config.signedOrders) throw new Error("Convert order execution is not currently enabled and verified.");
    const pairs = config.pairs;
    const capability = new Map(capabilities.map(c => [`${c.assetCode}\0${c.networkCode}`, c]));
    const methodId = (c: typeof capabilities[number]) =>
      byId.has(`crypto:${c.networkId}`) ? `crypto:${c.networkId}` : `api:${c.providerId}:${c.networkId}`;
    for (const pair of pairs) {
      const from = capability.get(`${pair.fromAsset}\0${pair.fromNetwork}`);
      const to = capability.get(`${pair.toAsset}\0${pair.toNetwork}`);
      if (!from || !to) continue;
      const sourceId = methodId(from), targetId = methodId(to);
      add("convert", `convert:${sourceId}:${targetId}`, sourceId, targetId,
        () => priceXmlConvert(pair, byId.get(sourceId)!, byId.get(targetId)!));
    }
    if (!pairs.length) throw new Error("No executable Convert directions are currently available from the existing provider route catalog.");
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
  let next = 0;
  const run = async () => {
    while (next < readyCandidates.length) {
      const candidate = readyCandidates[next++], key = `${reviewHash}:${candidate.d.routeId}`;
      const cached = quoteCache.get(key);
      let entry = cached && cached.until > Date.now() ? cached : undefined;
      if (!entry) {
        try {
          entry = { until: Date.now() + 30_000, item: await candidate.run() };
        } catch (error) {
          entry = { until: Date.now() + 5_000, reason: problem(error) };
        }
        if (generation === cacheGeneration) quoteCache.set(key, entry);
      }
      if (entry.item) {
        candidate.d.state = "ready"; candidate.d.message = "Current executable pricing.";
        items.push({ item: entry.item, d: candidate.d });
      } else candidate.d.message = entry.reason ?? "Current pricing is unavailable.";
    }
  };
  await Promise.all([run(), run(), run()]);
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
    readXmlMethods(latestRow), db.select().from(manualDeskPricingRulesTable),
  ]);
  if (generation !== cacheGeneration || reviewHash !== xmlReviewHash(latestRow?.version ?? 0,
    latestMethods, { pricing: latestPricing, catalogFingerprint: latestCatalog }))
    throw new Error("Configuration changed during XML generation. Refresh to use the latest settings.");
  if (quoteCache.size > 10_000) {
    for (const [key, entry] of quoteCache) if (entry.until <= Date.now()) quoteCache.delete(key);
  }
  accepted.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return GetAdminRatesXmlPreviewResponse.parse({
    xml: serializeRatesXml(accepted), generatedAt: new Date().toISOString(),
    exportedCount: accepted.length, diagnostics,
  });
}
