import { writeFile } from "node:fs/promises";
import {
  db, cryptoAssetsTable, cryptoAssetNetworksTable, fiatCurrenciesTable,
  paymentMethodsTable, fiatCurrencyPaymentMethodsTable,
  manualDeskPricingRulesTable, siteContentRevisionsTable,
  sitePublicationRevisionsTable, landingBackgroundSettingsTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const output = process.argv.find((value, index) => index > 1 && value !== "--");
if (!output) throw new Error("Usage: export:workspace-config <output.json>");
if (process.env.NODE_ENV === "production") throw new Error("Workspace export is disabled in production.");
if (process.env.USE_DATABASE_OWNER === "true") throw new Error("Workspace export is disabled for the production database owner.");
if (process.env.WORKSPACE_CONFIG_EXPORT !== "1") throw new Error("Set WORKSPACE_CONFIG_EXPORT=1 to acknowledge a development configuration export.");
const databaseUrl = process.env.DATABASE_URL ?? "";
let databaseName = "";
try { databaseName = new URL(databaseUrl).pathname.replace(/^\//, ""); } catch {}
if (databaseName !== "heliumdb") throw new Error(`Refusing to export from unexpected database "${databaseName || "unknown"}".`);

async function main() {
const [assets, networks, fiats, methods, links, rules, revisions, publications, backgrounds] = await Promise.all([
  db.select().from(cryptoAssetsTable), db.select().from(cryptoAssetNetworksTable),
  db.select().from(fiatCurrenciesTable), db.select().from(paymentMethodsTable),
  db.select().from(fiatCurrencyPaymentMethodsTable), db.select().from(manualDeskPricingRulesTable),
  db.select().from(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.status, "published")).orderBy(desc(siteContentRevisionsTable.revision)),
  db.select().from(sitePublicationRevisionsTable).orderBy(desc(sitePublicationRevisionsTable.version)),
  db.select().from(landingBackgroundSettingsTable).orderBy(desc(landingBackgroundSettingsTable.version)),
]);
if (backgrounds[0]?.mode === "custom") throw new Error("Custom landing backgrounds require an explicit object-storage transfer and cannot be exported automatically.");
const fiatById = new Map(fiats.map((f) => [f.id, f.code]));
const latestPages = [...new Map(revisions.map((r) => [r.pageKey, r])).values()];
const snapshot = {
  schemaVersion: 1,
  source: { environment: "development" as const, exportedAt: new Date().toISOString() },
  cryptoAssets: assets.map(({ id, code, name, logoObjectPath, decimals, lifecycle, enabled }) => ({ id, code, name, logoObjectPath, decimals, lifecycle, enabled })),
  cryptoNetworks: networks.map(({ id, assetId, networkCode, networkName, logoObjectPath, networkFamily, decimals, executionMode, depositProvider, lifecycle, regions, enabled, requiresMemo, requiredConfirmations, confirmationGuidance, explorerUrlTemplate, depositInstructions, depositWarning }) => ({ id, assetId, networkCode, networkName, logoObjectPath, networkFamily, decimals, executionMode, depositProvider, lifecycle, regions, enabled, requiresMemo, requiredConfirmations, confirmationGuidance, explorerUrlTemplate, depositInstructions, depositWarning })),
  fiatCurrencies: fiats.map(({ id, code, name, flagObjectPath, network, precision, lifecycle, regions, countries, enabled, rateMode, manualRate }) => ({ id, code, name, flagObjectPath, network, precision, lifecycle, regions, countries, enabled, rateMode, manualRate })),
  paymentMethods: methods.map(({ id, name, logoObjectPath, description, instructions, family, executionMode, providerId, lifecycle, regions, countries, requiresProviderConfiguration, enabled, canSend, canReceive, fieldDefinitions }) => ({ id, name, logoObjectPath, description, instructions, family, executionMode, providerId, lifecycle, regions, countries, requiresProviderConfiguration, enabled, canSend, canReceive, fieldDefinitions })),
  fiatCurrencyPaymentMethods: links.map(({ fiatCurrencyId, paymentMethodId, enabled, canSend, canReceive, sendInstructions, receiveInstructions, minAmount, maxAmount, countries }) => ({ fiatCode: fiatById.get(fiatCurrencyId) ?? "", paymentMethodId, enabled, canSend, canReceive, sendInstructions, receiveInstructions, minAmount, maxAmount, countries })),
  manualDeskPricingRules: rules.map(({ id, name, sourceAsset, targetAsset, sourceCryptoAssetId, targetCryptoAssetId, sourceNetwork, targetNetwork, paymentMethod, payoutMethod, sourceSettlementOptionId, targetSettlementOptionId, minAmount, maxAmount, operatorInstructions, customerInstructions, expectedSettlementMinutes, markupBasisPoints, adjustmentDirection, fixedFee, exactRate, priority, enabled }) => ({ id, name, sourceAsset, targetAsset, sourceCryptoAssetId, targetCryptoAssetId, sourceNetwork, targetNetwork, paymentMethod, payoutMethod, sourceSettlementOptionId, targetSettlementOptionId, minAmount, maxAmount, operatorInstructions, customerInstructions, expectedSettlementMinutes, markupBasisPoints, adjustmentDirection, fixedFee, exactRate, priority, enabled })),
  site: {
    publishedPages: latestPages.map(({ pageKey, content }) => ({ pageKey, content })),
    publication: publications[0] ? { navigation: publications[0].navigation, partnerLogos: publications[0].partnerLogos, socialTrust: publications[0].socialTrust } : null,
  },
  landingBackground: backgrounds[0] ? {
    mode: "preset" as const,
    presetId: backgrounds[0].presetId!,
    focalX: backgrounds[0].focalX,
    focalY: backgrounds[0].focalY,
    placements: backgrounds[0].placements,
  } : null,
};
await writeFile(output!, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Exported workspace configuration to ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});