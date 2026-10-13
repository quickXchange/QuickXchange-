import { getQuickexXmlPublicClient } from "./quickex";
import { partnerPairKey, type PartnerPair } from "./quickex-xml-public";
import { ConvertXmlRefresh, type ConvertXmlSaved } from "./rates-xml-convert-refresh";
import { readPublishedXmlQuotes, savePublishedXmlQuote, removePublishedXmlQuotes } from "./rates-xml-publication";
import type { XmlMethod } from "./rates-xml-methods";
import type { GetAdminRatesXmlPreviewResponse } from "@workspace/api-zod";

type Diagnostic = typeof GetAdminRatesXmlPreviewResponse._output.diagnostics[number];
const method = (pair: PartnerPair, side: "instrumentFrom" | "instrumentTo"): XmlMethod => {
  const instrument = pair[side];
  return {
    optionId: `quickex-xml:${instrument.currencyTitle}:${instrument.networkTitle}`,
    name: `${instrument.currencyTitle} · ${instrument.networkTitle}`,
    assetCode: instrument.currencyTitle, network: instrument.networkTitle,
    kind: "provider", enabled: true, code: instrument.bestChangeCurrencyName,
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
  client: getQuickexXmlPublicClient,
  // The affiliate API supplies authoritative BestChange identities; no local Admin mapping is needed.
  codeAllowed: code => /^[A-Z][A-Z0-9_-]{0,63}$/.test(code),
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
  const retained = snapshot.stale || snapshot.refreshing;
  const diagnostics = snapshot.rows.map(row => diagnostic(row, retained));
  if (snapshot.error || snapshot.skipped || !snapshot.rows.length) diagnostics.push({
    routeId: "convert-json:availability", functionType: "convert", sourceOptionId: "", targetOptionId: "",
    fromName: "Convert", toName: "Quickex partner JSON", state: "omitted",
    message: snapshot.error ?? (snapshot.skipped
      ? `${snapshot.skipped} inactive, ambiguous, unmapped or unavailable partner directions omitted.`
      : snapshot.refreshing ? "Initial Quickex partner JSON refresh is in progress."
      : "No active affiliate directions with valid provider codes, reserves, limits and rates are available."),
  });
  return { items: snapshot.rows.map((row, i) => ({ item: row.item, d: diagnostics[i] })), diagnostics };
}

/** Refresh even when aggregators are not polling; snapshots persist across restarts. */
export function startConvertXmlPublicationWorker() {
  let stopped = false;
  const tick = () => {
    if (!stopped) void readConvertXmlPublication(0).catch(() => {
      // XML requests surface diagnostics; do not log credentials/provider payloads.
      console.warn("Quickex partner XML background refresh is temporarily unavailable.");
    });
  };
  const timer = setInterval(tick, 30_000);
  timer.unref(); tick();
  return () => { stopped = true; clearInterval(timer); refresh.stop(); };
}
