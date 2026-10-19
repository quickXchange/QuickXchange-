import { getQuickexXmlPublicClient } from "./quickex";
import { partnerPairKey, partnerPairRoute, partnerXmlCode, type PartnerPair } from "./quickex-xml-public";
import { ConvertXmlRefresh, freshExecutableXmlRows, type ConvertXmlSaved } from "./rates-xml-convert-refresh";
import { readPublishedXmlQuotes, savePublishedXmlQuote, removePublishedXmlQuotes } from "./rates-xml-publication";
import type { XmlMethod } from "./rates-xml-methods";
import type { GetAdminRatesXmlPreviewResponse } from "@workspace/api-zod";
import { getQuickexPublicCapabilityConfig } from "./provider-capabilities";
import { CONVERT_XML_CATALOG_DISCOVERY_WAIT_MS, xmlDiscoveryDeadline } from "./rates-xml-refresh";

type Diagnostic = typeof GetAdminRatesXmlPreviewResponse._output.diagnostics[number];
const method = (pair: PartnerPair, side: "instrumentFrom" | "instrumentTo"): XmlMethod => {
  const instrument = pair[side];
  return {
    optionId: `quickex-xml:${instrument.currencyTitle}:${instrument.networkTitle}`,
    name: `${instrument.currencyTitle} · ${instrument.networkTitle}`,
    assetCode: instrument.currencyTitle, network: instrument.networkTitle,
    kind: "provider", enabled: true, code: partnerXmlCode(instrument),
    // Source reserve is bookkeeping metadata only, never an advertised substitute.
    reserve: instrument.reservesAmount ?? "0",
  };
};
const diagnostic = (row: ConvertXmlSaved, retained: boolean): Diagnostic => ({
  routeId: `convert-json:${row.key}`, functionType: "convert",
  sourceOptionId: method(row.pair, "instrumentFrom").optionId,
  targetOptionId: method(row.pair, "instrumentTo").optionId,
  fromName: method(row.pair, "instrumentFrom").name, toName: method(row.pair, "instrumentTo").name,
  state: "ready", message: retained
    ? "Last successful Quickex partner JSON XML rate; background refresh in progress or temporarily unavailable."
    : "Live Quickex partner JSON rate, limits, reserve and network fee.",
});
const refresh = new ConvertXmlRefresh({
  executableRoutes: async pairs => {
    // Only HTTP callers have a short response deadline. The background worker
    // must finish discovering the executable catalog before fetching live rates.
    const config = await getQuickexPublicCapabilityConfig({
      includeDefaultPair: false,
      pairCandidates: pairs.filter(pair => pair.isActive).map(partnerPairRoute),
    });
    return config.signedOrders ? config.pairs : [];
  },
  client: getQuickexXmlPublicClient,
  // Provider XML code or its documented uppercase slug; no local Admin mapping.
  codeAllowed: code => /^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code),
  load: async scope => (await readPublishedXmlQuotes(scope))
    .filter(row => row.quote.providerPair && row.quote.item.providerJson)
    .map(row => ({
      key: partnerPairKey(row.quote.providerPair!), pair: row.quote.providerPair!,
      item: row.quote.item, quotedAt: row.quotedAt,
    })),
  save: async (scope, row) => {
    await savePublishedXmlQuote(scope, `${scope}:${row.key}`, {
      item: row.item, providerPair: row.pair,
      source: method(row.pair, "instrumentFrom"), target: method(row.pair, "instrumentTo"),
      diagnostic: diagnostic(row, false),
    }, row.quotedAt);
  },
  remove: (scope, keys) => removePublishedXmlQuotes(scope, keys?.map(key => `${scope}:${key}`)),
});

export async function readConvertXmlPublication(waitMs = 250) {
  const snapshot = await refresh.snapshot(waitMs);
  // Preserve historical publications, but recheck the shared customer capability
  // authority against fresh affiliate directions, not the popular-pair UI list.
  const config = await xmlDiscoveryDeadline(
    // Recheck runtime credentials and current Admin permissions, but never make
    // an aggregator wait for provider catalogue refresh or UI default settings.
    getQuickexPublicCapabilityConfig({
      cacheOnly: true, includeDefaultPair: false,
      pairCandidates: snapshot.freshRows.map(row => partnerPairRoute(row.pair)),
    }),
    CONVERT_XML_CATALOG_DISCOVERY_WAIT_MS,
  );
  const publishable = new Set(freshExecutableXmlRows(snapshot,
    config.signedOrders ? config.pairs : []).map(row => row.key));
  const diagnostics = snapshot.rows.map(row => publishable.has(row.key)
    ? diagnostic(row, false)
    : { ...diagnostic(row, true), state: "omitted" as const,
      message: "Retained cached publication is expired or not currently executable; excluded from public XML." });
  if (snapshot.pending) diagnostics.push({
    routeId: "convert-json:pending", functionType: "convert", sourceOptionId: "", targetOptionId: "",
    fromName: "Convert", toName: "Quickex partner JSON", state: "omitted",
    message: `${snapshot.pending} eligible directions await a fresh provider rate. Pending rates are not published.`,
  });
  if (snapshot.error || snapshot.skipped || !snapshot.rows.length) diagnostics.push({
    routeId: "convert-json:availability", functionType: "convert", sourceOptionId: "", targetOptionId: "",
    fromName: "Convert", toName: "Quickex partner JSON", state: "omitted",
    message: snapshot.error ?? (snapshot.skipped
      ? `${snapshot.skipped} inactive, ambiguous, unmapped or unavailable partner directions omitted.`
      : snapshot.refreshing ? "Initial Quickex partner JSON refresh is in progress."
      : "No active affiliate directions with valid provider codes, reserves, limits and rates are available."),
  });
  return { items: snapshot.rows.flatMap((row, i) =>
    publishable.has(row.key) ? [{ item: row.item, d: diagnostics[i] }] : []), diagnostics };
}

/** Refresh even when aggregators are not polling; snapshots persist across restarts. */
export function startConvertXmlPublicationWorker() {
  let stopped = false;
  const tick = () => {
    // Background warming has no HTTP discovery deadline. Calling the public
    // reader here used to report XML_DISCOVERY_TIMEOUT every slow cycle even
    // while its shared provider work was still progressing successfully.
    if (!stopped) void refresh.snapshot(0).catch((error: unknown) => {
      // XML requests surface diagnostics; do not log credentials/provider payloads.
      const code = error && typeof error === "object" && "code" in error &&
        typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
        ? error.code : "XML_PUBLICATION_UNAVAILABLE";
      console.warn("Quickex partner XML background refresh is temporarily unavailable.", { code });
    });
  };
  const timer = setInterval(tick, 30_000);
  timer.unref(); tick();
  return () => { stopped = true; clearInterval(timer); refresh.stop(); };
}
