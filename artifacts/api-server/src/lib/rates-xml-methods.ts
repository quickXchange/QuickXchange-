import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db, bestchangeSettingsTable, fiatCurrencyPaymentMethodsTable, fiatCurrenciesTable,
  paymentMethodsTable, cryptoAssetsTable, cryptoAssetNetworksTable,
} from "@workspace/db";
import { GetAdminRatesXmlResponse } from "@workspace/api-zod";
import codes from "../data/rates-currency-codes.json";
import { listExecutableProviderCapabilities } from "./provider-capabilities";

export const DEFAULT_XML_RESERVE = "1000000";
export const XML_CODES = codes as Array<{ code: string; description: string; type: "crypto" | "fiat" }>;
export const XML_CODE_LOOKUP = new Map(XML_CODES.map(c => [c.code, c]));
export const STAGING_ONLY_XML_CODES = new Set(["PMUSD", "PMEUR"]);
export type XmlSettingsRow = typeof bestchangeSettingsTable.$inferSelect;
export type XmlMethod = typeof GetAdminRatesXmlResponse._output.methods[number];
export const xmlStaging = () => process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT;

/** Existing explicit declarations may be migrated; never infer a code by name. */
function legacyDeclarations(row: XmlSettingsRow | undefined, optionId: string) {
  const declaredCodes = new Set<string>(), reserves = new Set<string>();
  for (const d of row?.directions ?? []) {
    if (d.sourceOptionId === optionId && typeof d.fromCode === "string") declaredCodes.add(d.fromCode);
    if (d.targetOptionId === optionId) {
      if (typeof d.toCode === "string") declaredCodes.add(d.toCode);
      if (typeof d.reserve === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(d.reserve) && Number(d.reserve) > 0)
        reserves.add(d.reserve);
    }
  }
  return {
    code: declaredCodes.size === 1 && XML_CODE_LOOKUP.has([...declaredCodes][0]) ? [...declaredCodes][0] : null,
    reserve: reserves.size === 1 ? [...reserves][0] : DEFAULT_XML_RESERVE,
  };
}
export async function readXmlSettings() {
  return (await db.select().from(bestchangeSettingsTable).where(eq(bestchangeSettingsTable.id, 1)))[0];
}
export async function readXmlMethods(row: XmlSettingsRow | undefined) {
  const [fiat, crypto, capabilities] = await Promise.all([
    db.select({
      id: fiatCurrencyPaymentMethodsTable.id, currencyId: fiatCurrencyPaymentMethodsTable.fiatCurrencyId,
      methodId: fiatCurrencyPaymentMethodsTable.paymentMethodId,
      currencyCode: fiatCurrenciesTable.code, currencyEnabled: fiatCurrenciesTable.enabled,
      methodName: paymentMethodsTable.name, methodEnabled: paymentMethodsTable.enabled,
      enabled: fiatCurrencyPaymentMethodsTable.enabled, reserve: fiatCurrencyPaymentMethodsTable.reserve,
      minAmount: fiatCurrencyPaymentMethodsTable.minAmount, maxAmount: fiatCurrencyPaymentMethodsTable.maxAmount,
      canSend: fiatCurrencyPaymentMethodsTable.canSend, canReceive: fiatCurrencyPaymentMethodsTable.canReceive,
    }).from(fiatCurrencyPaymentMethodsTable)
      .innerJoin(fiatCurrenciesTable, eq(fiatCurrenciesTable.id, fiatCurrencyPaymentMethodsTable.fiatCurrencyId))
      .innerJoin(paymentMethodsTable, eq(paymentMethodsTable.id, fiatCurrencyPaymentMethodsTable.paymentMethodId)),
    db.select({
      id: cryptoAssetNetworksTable.id, assetCode: cryptoAssetsTable.code, name: cryptoAssetsTable.name,
      network: cryptoAssetNetworksTable.networkCode, enabled: cryptoAssetNetworksTable.enabled,
      assetEnabled: cryptoAssetsTable.enabled, lifecycle: cryptoAssetNetworksTable.lifecycle,
      assetLifecycle: cryptoAssetsTable.lifecycle,
      decimals: cryptoAssetNetworksTable.decimals, executionMode: cryptoAssetNetworksTable.executionMode,
    }).from(cryptoAssetNetworksTable).innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId)),
    listExecutableProviderCapabilities(),
  ]);
  const configured = new Map(row?.xmlMethodSettings.map(m => [m.optionId, m]) ?? []);
  const metadata = (id: string) => configured.get(id) ??
    (row?.ratesXmlPublished ? { code: null, reserve: DEFAULT_XML_RESERVE } : legacyDeclarations(row, id));
  const methods: XmlMethod[] = fiat.map(f => {
    const optionId = `fiat:${f.currencyId}:${f.methodId}`;
    return {
      optionId, name: `${f.methodName} · ${f.currencyCode}`, assetCode: f.currencyCode, kind: "fiat",
      enabled: f.enabled && f.currencyEnabled && f.methodEnabled,
      code: metadata(optionId).code, reserve: f.reserve,
    };
  });
  methods.push(...crypto.map(c => {
    const optionId = `crypto:${c.id}`, m = metadata(optionId);
    return {
      optionId, name: `${c.name} · ${c.network}`, assetCode: c.assetCode, network: c.network, kind: "crypto" as const,
      enabled: c.enabled && c.assetEnabled && c.lifecycle !== "deprecated" && c.assetLifecycle !== "deprecated",
      code: m.code, reserve: m.reserve ?? DEFAULT_XML_RESERVE,
    };
  }));
  const cryptoIds = new Set(crypto.map(c => c.id));
  for (const c of capabilities) {
    if (cryptoIds.has(c.networkId)) continue;
    const optionId = `api:${c.providerId}:${c.networkId}`, m = metadata(optionId);
    methods.push({
      optionId, name: `${c.assetCode} · ${c.networkCode}`, assetCode: c.assetCode, network: c.networkCode,
      kind: "provider", enabled: true, code: m.code, reserve: m.reserve ?? DEFAULT_XML_RESERVE,
    });
  }
  methods.sort((a, b) => a.name.localeCompare(b.name) || a.optionId.localeCompare(b.optionId));
  const catalogFingerprint = createHash("sha256").update(JSON.stringify({ fiat, crypto,
    capabilities: capabilities.map(c => [c.providerId, c.networkId, c.assetCode, c.networkCode]),
  })).digest("hex");
  return { methods, capabilities, catalogFingerprint };
}
export async function readXmlAdmin() {
  const row = await readXmlSettings(), { methods } = await readXmlMethods(row);
  return GetAdminRatesXmlResponse.parse({
    version: row?.version ?? 0, published: row?.ratesXmlPublished ?? false, staging: xmlStaging(),
    methods, currencyCodes: XML_CODES, feedPath: "/api/rates.xml",
  });
}
export function xmlReviewHash(version: number, methods: XmlMethod[], pricing: unknown) {
  return createHash("sha256").update(JSON.stringify({ version, methods, pricing })).digest("hex");
}
