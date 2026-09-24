import { rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  db, cryptoAssetsTable, cryptoAssetNetworksTable, fiatCurrenciesTable,
  paymentMethodsTable, fiatCurrencyPaymentMethodsTable,
  manualDeskPricingRulesTable, siteContentRevisionsTable,
  sitePublicationRevisionsTable, landingBackgroundSettingsTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getVerifiedStoredLogo } from "../lib/object-storage";
import { projectWorkspaceCryptoNetwork } from "../lib/workspace-config-sync-helpers";

const output = process.argv.find((value, index) => index > 1 && value !== "--");
if (!output) throw new Error("Usage: export:workspace-config <output.json>");
if (process.env.NODE_ENV === "production") throw new Error("Workspace export is disabled in production.");
if (process.env.USE_DATABASE_OWNER === "true") throw new Error("Workspace export is disabled for the production database owner.");
if (process.env.WORKSPACE_CONFIG_EXPORT !== "1") throw new Error("Set WORKSPACE_CONFIG_EXPORT=1 to acknowledge a development configuration export.");
const databaseUrl = process.env.DATABASE_URL ?? "";
let databaseName = "";
try { databaseName = new URL(databaseUrl).pathname.replace(/^\//, ""); } catch {}
if (databaseName !== "heliumdb") throw new Error(`Refusing to export from unexpected database "${databaseName || "unknown"}".`);
const strandedTestFixture = /^(?:bulk|wallet)-(?:asset|network)-/;

async function main() {
const [assets, networks, fiats, methods, links, rules, revisions, publications, backgrounds] = await Promise.all([
  db.select().from(cryptoAssetsTable), db.select().from(cryptoAssetNetworksTable),
  db.select().from(fiatCurrenciesTable), db.select().from(paymentMethodsTable),
  db.select().from(fiatCurrencyPaymentMethodsTable), db.select().from(manualDeskPricingRulesTable),
  db.select().from(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.status, "published")).orderBy(desc(siteContentRevisionsTable.revision)),
  db.select().from(sitePublicationRevisionsTable).orderBy(desc(sitePublicationRevisionsTable.version)),
  db.select().from(landingBackgroundSettingsTable).orderBy(desc(landingBackgroundSettingsTable.version)),
]);
const strandedFixtures = [
  ...assets.filter(({ id }) => strandedTestFixture.test(id)).map(({ id }) => id),
  ...networks.filter(({ id }) => strandedTestFixture.test(id)).map(({ id }) => id),
];
if (strandedFixtures.length) {
  throw new Error(`Refusing to export stranded API-test catalog fixtures: ${strandedFixtures.join(", ")}`);
}
if (backgrounds[0]?.mode === "custom") throw new Error("Custom landing backgrounds require an explicit object-storage transfer and cannot be exported automatically.");
const fiatById = new Map(fiats.map((f) => [f.id, f.code]));
const latestPages = [...new Map(revisions.map((r) => [r.pageKey, r])).values()];
const snapshot: any = {
  schemaVersion: 1,
  source: { environment: "development" as const, exportedAt: new Date().toISOString() },
  cryptoAssets: assets.map(({ id, code, name, logoObjectPath, decimals, lifecycle, enabled }) => ({ id, code, name, logoObjectPath, decimals, lifecycle, enabled })),
  cryptoNetworks: networks.map((network) => ({
    id: network.id,
    ...projectWorkspaceCryptoNetwork({
      ...network,
      manualWalletTrackingEnabled: network.manualWalletTrackingEnabled ?? true,
    }),
  })),
  fiatCurrencies: fiats.map(({ id, code, name, flagObjectPath, network, precision, lifecycle, regions, countries, enabled, rateMode, manualRate }) => ({ id, code, name, flagObjectPath, network, precision, lifecycle, regions, countries, enabled, rateMode, manualRate })),
  paymentMethods: methods.map(({ id, name, logoObjectPath, description, instructions, family, executionMode, providerId, lifecycle, regions, countries, requiresProviderConfiguration, enabled, canSend, canReceive, fieldDefinitions }) => ({ id, name, logoObjectPath, description, instructions, family, executionMode, providerId, lifecycle, regions, countries, requiresProviderConfiguration, enabled, canSend, canReceive, fieldDefinitions })),
  fiatCurrencyPaymentMethods: links.map(({ fiatCurrencyId, paymentMethodId, enabled, canSend, canReceive, sendInstructions, receiveInstructions, minAmount, maxAmount, countries }) => ({ fiatCode: fiatById.get(fiatCurrencyId) ?? "", paymentMethodId, enabled, canSend, canReceive, sendInstructions, receiveInstructions, minAmount, maxAmount, countries })),
  manualDeskPricingRules: rules.map(({ id, name, sourceAsset, targetAsset, sourceCryptoAssetId, targetCryptoAssetId, sourceNetwork, targetNetwork, paymentMethod, payoutMethod, sourceSettlementOptionId, targetSettlementOptionId, minAmount, maxAmount, operatorInstructions, customerInstructions, expectedSettlementMinutes, markupBasisPoints, adjustmentDirection, fixedFee, exactRate, priority, enabled }) => ({ id, name, sourceAsset, targetAsset, sourceCryptoAssetId, targetCryptoAssetId, sourceNetwork, targetNetwork, paymentMethod, payoutMethod, sourceSettlementOptionId, targetSettlementOptionId, minAmount, maxAmount, operatorInstructions, customerInstructions, expectedSettlementMinutes, markupBasisPoints, adjustmentDirection, fixedFee, exactRate, priority, enabled })),
  site: {
    publishedPages: latestPages.map(({ pageKey, content }) => ({ pageKey, content })),
    publication: publications[0] ? {
      navigation: publications[0].navigation,
      partnerLogos: (publications[0].partnerLogos as any[]).filter((logo) => logo.enabled !== false && !logo.removedAt),
      socialTrust: publications[0].socialTrust,
    } : null,
  },
  landingBackground: backgrounds[0] ? {
    mode: "preset" as const,
    presetId: backgrounds[0].presetId!,
    focalX: backgrounds[0].focalX,
    focalY: backgrounds[0].focalY,
    placements: backgrounds[0].placements,
  } : null,
};
const objectPaths = new Set<string>();
const findObjectPaths = (value: unknown) => {
  if (typeof value === "string" && value.startsWith("/objects/")) objectPaths.add(value);
  else if (Array.isArray(value)) value.forEach(findObjectPaths);
  else if (value && typeof value === "object") Object.values(value).forEach(findObjectPaths);
};
findObjectPaths(snapshot);
snapshot.objects = [];
for (const path of [...objectPaths].sort()) {
  const namespace = path.split("/")[2] as any;
  try {
    const { buffer, contentType } = await getVerifiedStoredLogo(path, namespace);
    snapshot.objects.push({
      path,
      contentType,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      base64: buffer.toString("base64"),
    });
  } catch {
    const clear = (value: unknown): unknown => {
      if (value === path) return null;
      if (Array.isArray(value)) return value.map(clear);
      if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) (value as any)[key] = clear(item);
      }
      return value;
    };
    clear(snapshot);
  }
}
const temporaryOutput = `${output}.${process.pid}.tmp`;
await writeFile(temporaryOutput, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
await rename(temporaryOutput, output!);
console.log(`Exported workspace configuration to ${output}`);
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});