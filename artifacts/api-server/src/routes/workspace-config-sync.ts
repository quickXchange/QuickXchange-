import { Router } from "express";
import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import {
  db, cryptoAssetsTable, cryptoAssetNetworksTable, fiatCurrenciesTable,
  paymentMethodsTable, fiatCurrencyPaymentMethodsTable, manualDeskPricingRulesTable,
  siteContentRevisionsTable, sitePublicationRevisionsTable, landingBackgroundSettingsTable,
} from "@workspace/db";
import { requireOwner } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";
import {
  ALLOWED_LOGO_CONTENT_TYPES,
  getVerifiedStoredLogo,
  storeVerifiedConfigurationImage,
  validatePaymentMethodLogoImage,
} from "../lib/object-storage";
import {
  customerDepositEligibilityDeterminants,
  parseWorkspaceConfigSnapshot,
  projectWorkspaceCryptoNetwork,
  reactivatePaymentMethodsForEnabledLinks,
  validateSnapshotReferences,
  type WorkspaceConfigSnapshot,
} from "../lib/workspace-config-sync-helpers";
import { invalidatePopularExchangePairsCache } from "../lib/popular-exchange-pairs";
import { invalidateWhitebitDepositRouteProofs } from "../lib/customer-deposit-eligibility";
import { invalidateManualDeskFiatRateCache } from "../lib/manual-desk-rates";

type Executor = any;
type Action = "add" | "update" | "softDisable" | "unchanged";
type Detail = { counts: Record<Action, number>; keys: Record<Action, string[]> };
const stable = (v: unknown) => JSON.stringify(v);
const detail = (source: string[], target: string[], changed: Set<string>, disableEligible = new Set(target), canDisable = true): Detail => {
  const s = new Set(source), t = new Set(target);
  const keys: Record<Action, string[]> = { add: [], update: [], softDisable: [], unchanged: [] };
  for (const k of source) keys[s.has(k) && t.has(k) ? (changed.has(k) ? "update" : "unchanged") : "add"].push(k);
  if (canDisable) for (const k of target) if (!s.has(k)) (disableEligible.has(k) ? keys.softDisable : keys.unchanged).push(k);
  return { counts: { add: keys.add.length, update: keys.update.length, softDisable: keys.softDisable.length, unchanged: keys.unchanged.length }, keys };
};
const code = (v: string) => v.trim().toUpperCase();
const fiatProjection = (f: any) => ({ code: code(f.code), name: f.name, flagObjectPath: f.flagObjectPath, network: f.network, precision: f.precision, lifecycle: f.lifecycle, regions: f.regions, countries: f.countries, enabled: f.enabled, rateMode: f.rateMode, manualRate: f.manualRate });
const methodProjection = (m: any) => ({ id: m.id, name: m.name, logoObjectPath: m.logoObjectPath, description: m.description, instructions: m.instructions, family: m.family, executionMode: m.executionMode, providerId: m.providerId, lifecycle: m.lifecycle, regions: m.regions, countries: m.countries, requiresProviderConfiguration: m.requiresProviderConfiguration, enabled: m.enabled, canSend: m.canSend, canReceive: m.canReceive, fieldDefinitions: m.fieldDefinitions });
const linkProjection = (l: any) => ({ enabled: l.enabled, canSend: l.canSend, canReceive: l.canReceive, sendInstructions: l.sendInstructions, receiveInstructions: l.receiveInstructions, minAmount: l.minAmount, maxAmount: l.maxAmount, countries: l.countries });
const ruleProjection = (r: any) => ({ name: r.name, sourceAsset: r.sourceAsset, targetAsset: r.targetAsset, sourceCryptoAssetId: r.sourceCryptoAssetId, targetCryptoAssetId: r.targetCryptoAssetId, sourceNetwork: r.sourceNetwork, targetNetwork: r.targetNetwork, paymentMethod: r.paymentMethod, payoutMethod: r.payoutMethod, sourceSettlementOptionId: r.sourceSettlementOptionId, targetSettlementOptionId: r.targetSettlementOptionId, minAmount: r.minAmount, maxAmount: r.maxAmount, operatorInstructions: r.operatorInstructions, customerInstructions: r.customerInstructions, expectedSettlementMinutes: r.expectedSettlementMinutes, markupBasisPoints: r.markupBasisPoints, adjustmentDirection: r.adjustmentDirection, fixedFee: r.fixedFee, exactRate: r.exactRate, priority: r.priority, enabled: r.enabled });

function remapSettlementOptionId(
  value: string | null,
  networkIds: Map<string, string>,
  fiatIds: Map<string, string>,
): string | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts[0] === "crypto" && parts[1] && networkIds.has(parts[1])) parts[1] = networkIds.get(parts[1])!;
  if (parts[0] === "fiat" && parts[1] && fiatIds.has(parts[1])) parts[1] = fiatIds.get(parts[1])!;
  return parts.join(":");
}
function parse(body: unknown): WorkspaceConfigSnapshot {
  let parsed: WorkspaceConfigSnapshot;
  try {
    parsed = parseWorkspaceConfigSnapshot(body);
  } catch (error) {
    throw new ApiError("INVALID_WORKSPACE_CONFIG", error instanceof Error ? error.message : "Invalid workspace configuration.", 400);
  }
  const errors = validateSnapshotReferences(parsed);
  if (errors.length) throw new ApiError("INVALID_WORKSPACE_CONFIG", errors.join("; "), 400);
  return reactivatePaymentMethodsForEnabledLinks(parsed);
}

type ImageNamespace = "payment-method-logos" | "crypto-asset-logos" | "crypto-network-logos" | "fiat-currency-flags" | "partner-logos" | "site-page-media" | "social-trust-icons" | "website-branding";
type ObjectSyncReport = {
  referenced: number;
  available: string[];
  copyOnApply: string[];
  copied: string[];
  optionalReferencesCleared: string[];
  removedInactiveReferences: string[];
};

function snapshotObjectPaths(value: unknown, paths = new Set<string>()): Set<string> {
  if (typeof value === "string" && value.startsWith("/objects/")) paths.add(value);
  else if (Array.isArray(value)) for (const item of value) snapshotObjectPaths(item, paths);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) if (key !== "objects") snapshotObjectPaths(item, paths);
  return paths;
}

function objectNamespace(path: string): ImageNamespace | null {
  const allowedNamespaces = new Set<ImageNamespace>([
    "payment-method-logos", "crypto-asset-logos", "crypto-network-logos",
    "fiat-currency-flags", "partner-logos", "site-page-media",
    "social-trust-icons", "website-branding",
  ]);
  const match = /^\/objects\/([a-z-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(path);
  return match && allowedNamespaces.has(match[1] as ImageNamespace) ? match[1] as ImageNamespace : null;
}

function replaceOptionalObjectPaths(value: unknown, unavailable: Set<string>): unknown {
  if (typeof value === "string") return unavailable.has(value) ? null : value;
  if (Array.isArray(value)) return value.map((item) => replaceOptionalObjectPaths(item, unavailable));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === "objects" ? item : replaceOptionalObjectPaths(item, unavailable),
    ]));
  }
  return value;
}

async function prepareSnapshotObjects(
  input: WorkspaceConfigSnapshot,
  mode: "preview" | "apply",
): Promise<{ snapshot: WorkspaceConfigSnapshot; objects: ObjectSyncReport }> {
  const snapshot = structuredClone(input);
  const removedInactiveReferences = (snapshot.site.publication?.partnerLogos ?? [])
    .filter((logo) => logo.enabled === false || logo.removedAt)
    .map((logo) => String(logo.objectPath ?? ""))
    .filter((path) => path.startsWith("/objects/"));
  if (snapshot.site.publication) {
    snapshot.site.publication.partnerLogos = snapshot.site.publication.partnerLogos
      .filter((logo) => logo.enabled !== false && !logo.removedAt);
  }
  const bundled = new Map((snapshot.objects ?? []).map((object) => [object.path, object]));
  const available: string[] = [];
  const copyOnApply: string[] = [];
  const copied: string[] = [];
  const unavailable = new Set<string>();
  const paths = [...snapshotObjectPaths(snapshot)].sort();
  for (const path of paths) {
    const namespace = objectNamespace(path);
    if (!namespace) {
      unavailable.add(path);
      continue;
    }
    try {
      await getVerifiedStoredLogo(path, namespace);
      available.push(path);
      continue;
    } catch {
      const object = bundled.get(path);
      if (!object || !(ALLOWED_LOGO_CONTENT_TYPES as readonly string[]).includes(object.contentType)) {
        unavailable.add(path);
        continue;
      }
      const buffer = Buffer.from(object.base64, "base64");
      if (createHash("sha256").update(buffer).digest("hex") !== object.sha256) {
        unavailable.add(path);
        continue;
      }
      try {
        await validatePaymentMethodLogoImage(object.contentType, buffer);
        if (mode === "preview") copyOnApply.push(path);
        else {
          await storeVerifiedConfigurationImage(path, namespace, object.contentType, buffer);
          copied.push(path);
        }
      } catch {
        unavailable.add(path);
      }
    }
  }
  const prepared = replaceOptionalObjectPaths(snapshot, unavailable) as WorkspaceConfigSnapshot;
  delete prepared.objects;
  return {
    snapshot: prepared,
    objects: {
      referenced: paths.length,
      available,
      copyOnApply,
      copied,
      optionalReferencesCleared: [...unavailable],
      removedInactiveReferences,
    },
  };
}

export async function calculate(snapshot: WorkspaceConfigSnapshot, executor: Executor = db) {
  const [assets, networks, fiats, methods, links, rules, pages, publications, backgrounds] = await Promise.all([
    executor.select().from(cryptoAssetsTable), executor.select().from(cryptoAssetNetworksTable),
    executor.select().from(fiatCurrenciesTable), executor.select().from(paymentMethodsTable),
    executor.select().from(fiatCurrencyPaymentMethodsTable), executor.select().from(manualDeskPricingRulesTable),
    executor.select().from(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.status, "published")).orderBy(desc(siteContentRevisionsTable.revision)),
    executor.select().from(sitePublicationRevisionsTable).orderBy(desc(sitePublicationRevisionsTable.version)),
    executor.select().from(landingBackgroundSettingsTable).orderBy(desc(landingBackgroundSettingsTable.version)),
  ]);
  const assetByCode = new Map(assets.map((a: any) => [code(a.code), a]));
  const assetMap = new Map<string, string>(snapshot.cryptoAssets.map((a) => [a.id, (assetByCode.get(code(a.code)) as any)?.id ?? a.id]));
  const assetProjection = (a: any) => ({ code: code(a.code), name: a.name, logoObjectPath: a.logoObjectPath, decimals: a.decimals, lifecycle: a.lifecycle, enabled: a.enabled });
  const networkProjection = (n: any, mappedId: string) => ({
    ...projectWorkspaceCryptoNetwork({
      ...n,
      manualWalletTrackingEnabled: n.manualWalletTrackingEnabled ?? true,
    }, mappedId),
    networkCode: code(n.networkCode),
  });
  const sourceAssets = snapshot.cryptoAssets.map(assetProjection);
  const targetAssets = assets.map(assetProjection);
  const assetChanged = new Set(snapshot.cryptoAssets.filter((a) => { const t = assetByCode.get(code(a.code)); return t && stable(assetProjection(a)) !== stable(assetProjection(t)); }).map((a) => code(a.code)));
  const sourceNetworkKeys = snapshot.cryptoNetworks.map((n) => `${assetMap.get(n.assetId)}:${code(n.networkCode)}`);
  const targetNetworkKeys = networks.map((n: any) => `${n.assetId}:${code(n.networkCode)}`);
  const networkIdMap = new Map<string, string>(snapshot.cryptoNetworks.map((n) => {
    const targetAssetId = assetMap.get(n.assetId);
    const target = networks.find((candidate: any) => candidate.assetId === targetAssetId && code(candidate.networkCode) === code(n.networkCode));
    return [n.id, target?.id ?? n.id];
  }));
  const networkChanged = new Set(snapshot.cryptoNetworks.filter((n) => { const t = networks.find((x: any) => `${x.assetId}:${code(x.networkCode)}` === `${assetMap.get(n.assetId)}:${code(n.networkCode)}`); return t && stable(networkProjection(n, assetMap.get(n.assetId)!)) !== stable(networkProjection(t, t.assetId)); }).map((n) => `${assetMap.get(n.assetId)}:${code(n.networkCode)}`));
  const eligibilityDisabledKeys = snapshot.cryptoNetworks.flatMap((network) => {
    const targetAssetId = assetMap.get(network.assetId);
    const target = networks.find((candidate: any) =>
      candidate.assetId === targetAssetId &&
      code(candidate.networkCode) === code(network.networkCode)
    );
    if (!target?.customerDepositsEnabled) return [];
    const sourceAsset = snapshot.cryptoAssets.find((asset) => asset.id === network.assetId);
    const targetAsset = assets.find((asset: any) => asset.id === target.assetId);
    if (!sourceAsset || !targetAsset) return [];
    return stable(customerDepositEligibilityDeterminants(network, sourceAsset)) !==
        stable(customerDepositEligibilityDeterminants(target, targetAsset))
      ? [`${target.assetId}:${code(target.networkCode)}`]
      : [];
  });
  const fiatKey = (f: any) => code(f.code);
  const methodKey = (m: any) => m.id;
  const fiatCodeById = new Map<string, string>(fiats.map((f: any) => [f.id, code(f.code)]));
  const sourceLinkKeys = snapshot.fiatCurrencyPaymentMethods.map((l) => `${code(l.fiatCode)}:${l.paymentMethodId}`);
  const targetLinkKeys = links.map((l: any) => `${fiatCodeById.get(l.fiatCurrencyId) ?? l.fiatCurrencyId}:${l.paymentMethodId}`);
  const linkChanged = new Set(snapshot.fiatCurrencyPaymentMethods.filter((l) => {
    const targetFiatId = fiats.find((f: any) => code(f.code) === code(l.fiatCode))?.id;
    const target = links.find((candidate: any) => candidate.fiatCurrencyId === targetFiatId && candidate.paymentMethodId === l.paymentMethodId);
    return target && stable(linkProjection(l)) !== stable(linkProjection(target));
  }).map((l) => `${code(l.fiatCode)}:${l.paymentMethodId}`));
  const sourceFiatToTarget = new Map<string, string>(snapshot.fiatCurrencies.map((f) => [f.id, fiats.find((target: any) => code(target.code) === code(f.code))?.id ?? f.id]));
  const ruleChanged = new Set(snapshot.manualDeskPricingRules.filter((r) => {
    const target = rules.find((candidate: any) => candidate.id === r.id);
    if (!target) return false;
    const projected = ruleProjection({
      ...r,
      sourceCryptoAssetId: r.sourceCryptoAssetId ? assetMap.get(r.sourceCryptoAssetId) : null,
      targetCryptoAssetId: r.targetCryptoAssetId ? assetMap.get(r.targetCryptoAssetId) : null,
      sourceSettlementOptionId: remapSettlementOptionId(r.sourceSettlementOptionId, networkIdMap, sourceFiatToTarget),
      targetSettlementOptionId: remapSettlementOptionId(r.targetSettlementOptionId, networkIdMap, sourceFiatToTarget),
    });
    return stable(projected) !== stable(ruleProjection(target));
  }).map((r) => r.id));
  const result: Record<string, Detail> = {
    cryptoAssets: detail(sourceAssets.map((a) => a.code), targetAssets.map((a: any) => a.code), assetChanged, new Set(assets.filter((row: any) => row.enabled).map((row: any) => code(row.code)))),
    cryptoNetworks: detail(sourceNetworkKeys, targetNetworkKeys, networkChanged, new Set(networks.filter((row: any) => row.enabled).map((row: any) => `${row.assetId}:${code(row.networkCode)}`))),
    fiatCurrencies: detail(snapshot.fiatCurrencies.map(fiatKey), fiats.map(fiatKey), new Set<string>(snapshot.fiatCurrencies.filter((f) => { const t = fiats.find((x: any) => fiatKey(x) === fiatKey(f)); return t && stable(fiatProjection(f)) !== stable(fiatProjection(t)); }).map(fiatKey)), new Set(fiats.filter((row: any) => row.enabled).map(fiatKey))),
    paymentMethods: detail(snapshot.paymentMethods.map(methodKey), methods.map(methodKey), new Set<string>(snapshot.paymentMethods.filter((m) => { const t = methods.find((x: any) => x.id === m.id); return t && stable(methodProjection(m)) !== stable(methodProjection(t)); }).map(methodKey)), new Set(methods.filter((row: any) => row.enabled).map(methodKey))),
    fiatCurrencyPaymentMethods: detail(sourceLinkKeys, targetLinkKeys, linkChanged, new Set(links.filter((row: any) => row.enabled).map((row: any) => `${fiatCodeById.get(row.fiatCurrencyId) ?? row.fiatCurrencyId}:${row.paymentMethodId}`))),
    manualDeskPricingRules: detail(snapshot.manualDeskPricingRules.map((r) => r.id), rules.map((r: any) => r.id), ruleChanged, new Set(rules.filter((row: any) => row.enabled).map((row: any) => row.id))),
    customerDepositEligibility: {
      counts: {
        add: 0,
        update: eligibilityDisabledKeys.length,
        softDisable: 0,
        unchanged: networks.length - eligibilityDisabledKeys.length,
      },
      keys: {
        add: [],
        update: eligibilityDisabledKeys,
        softDisable: [],
        unchanged: networks
          .map((network: any) => `${network.assetId}:${code(network.networkCode)}`)
          .filter((key: string) => !eligibilityDisabledKeys.includes(key)),
      },
    },
  };
  const latestPages = new Map<string, any>();
  for (const p of pages) if (!latestPages.has(p.pageKey)) latestPages.set(p.pageKey, p);
  const pageChanges = snapshot.site.publishedPages.filter((p) => stable(p.content) !== stable(latestPages.get(p.pageKey)?.content)).map((p) => p.pageKey);
  result.sitePages = detail(snapshot.site.publishedPages.map((p) => p.pageKey), [...latestPages.keys()], new Set(pageChanges), new Set(), false);
  const publicationChanged = snapshot.site.publication && (!publications[0] || stable(snapshot.site.publication) !== stable({ navigation: publications[0].navigation, partnerLogos: publications[0].partnerLogos, socialTrust: publications[0].socialTrust }));
  result.sitePublication = { counts: { add: publicationChanged ? 1 : 0, update: 0, softDisable: 0, unchanged: publicationChanged ? 0 : 1 }, keys: { add: publicationChanged ? ["latest"] : [], update: [], softDisable: [], unchanged: publicationChanged ? [] : ["latest"] } };
  const latestBackground = backgrounds[0];
  const backgroundChanged = Boolean(snapshot.landingBackground) && (!latestBackground || stable(snapshot.landingBackground) !== stable({
    mode: latestBackground.mode,
    presetId: latestBackground.presetId,
    focalX: latestBackground.focalX,
    focalY: latestBackground.focalY,
    placements: latestBackground.placements,
  }));
  result.landingBackground = {
    counts: { add: backgroundChanged ? 1 : 0, update: 0, softDisable: 0, unchanged: backgroundChanged ? 0 : 1 },
    keys: { add: backgroundChanged ? ["latest"] : [], update: [], softDisable: [], unchanged: backgroundChanged ? [] : ["latest"] },
  };
  const stateHash = createHash("sha256").update(stable({
    assets: targetAssets.sort((a: any, b: any) => a.code.localeCompare(b.code)),
    networks: networks.map((n: any) => ({
      ...networkProjection(n, n.assetId),
      customerDepositsEnabled: n.customerDepositsEnabled,
    })).sort((a: any, b: any) => `${a.assetId}:${a.networkCode}`.localeCompare(`${b.assetId}:${b.networkCode}`)),
    fiats: fiats.map(fiatProjection).sort((a: any, b: any) => a.code.localeCompare(b.code)),
    methods: methods.map(methodProjection).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    links: links.map((l: any) => ({ key: `${fiatCodeById.get(l.fiatCurrencyId) ?? l.fiatCurrencyId}:${l.paymentMethodId}`, ...linkProjection(l) })).sort((a: any, b: any) => a.key.localeCompare(b.key)),
    rules: rules.map((r: any) => ({ id: r.id, version: r.version, ...ruleProjection(r) })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    pages: [...latestPages.entries()].map(([pageKey, page]) => ({ pageKey, content: page.content })).sort((a, b) => a.pageKey.localeCompare(b.pageKey)),
    publication: publications[0] ? { navigation: publications[0].navigation, partnerLogos: publications[0].partnerLogos, socialTrust: publications[0].socialTrust } : null,
    landingBackground: latestBackground ? { mode: latestBackground.mode, presetId: latestBackground.presetId, customObjectPath: latestBackground.customObjectPath, focalX: latestBackground.focalX, focalY: latestBackground.focalY, placements: latestBackground.placements } : null,
  })).digest("hex");
  return { counts: result, stateHash };
}

const router = Router();
router.post("/admin/workspace-config/preview", requireOwner, async (req, res, next) => {
  try {
    const prepared = await prepareSnapshotObjects(parse(req.body), "preview");
    res.setHeader("cache-control", "no-store");
    res.json({ ok: true, dryRun: true, objects: prepared.objects, ...await calculate(prepared.snapshot) });
  } catch (e) { next(e); }
});
router.post("/admin/workspace-config/apply", requireOwner, async (req, res, next) => {
  try {
    if (req.body?.confirmation !== "WORKSPACE_CONFIG_APPLY") throw new ApiError("WORKSPACE_CONFIG_CONFIRMATION_REQUIRED", "Set confirmation to WORKSPACE_CONFIG_APPLY.", 400);
    const prepared = await prepareSnapshotObjects(parse(req.body?.snapshot ?? req.body), "apply");
    const snapshot = prepared.snapshot;
    const expectedStateHash = req.body?.expectedStateHash;
    if (typeof expectedStateHash !== "string" || !expectedStateHash) throw new ApiError("WORKSPACE_CONFIG_PREVIEW_REQUIRED", "Preview the current configuration immediately before applying.", 409);
    const actorId = String(res.locals.operator.id);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(2026091901)`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
      const before = await calculate(snapshot, tx);
      if (before.stateHash !== expectedStateHash) throw new ApiError("WORKSPACE_CONFIG_CHANGED", "Configuration changed after preview. Review a fresh preview before applying.", 409);
      const assets = await tx.select().from(cryptoAssetsTable);
      const byCode = new Map(assets.map((a: any) => [code(a.code), a]));
      const assetMap = new Map<string, string>(snapshot.cryptoAssets.map((a) => [a.id, byCode.get(code(a.code))?.id ?? a.id]));
      for (const a of snapshot.cryptoAssets) {
        const values = { code: a.code, name: a.name, logoObjectPath: a.logoObjectPath, decimals: a.decimals, lifecycle: a.lifecycle, enabled: a.enabled };
        const existing = byCode.get(code(a.code));
        if (existing) await tx.update(cryptoAssetsTable).set(values).where(eq(cryptoAssetsTable.id, existing.id));
        else await tx.insert(cryptoAssetsTable).values({ id: a.id, ...values });
      }
      for (const row of assets) if (row.enabled && !snapshot.cryptoAssets.some((a) => code(a.code) === code(row.code))) await tx.update(cryptoAssetsTable).set({ enabled: false }).where(eq(cryptoAssetsTable.id, row.id));
      const networks = await tx.select().from(cryptoAssetNetworksTable);
      const sourceNetworkMap = new Map<string, string>();
      for (const n of snapshot.cryptoNetworks) {
        const targetAssetId = assetMap.get(n.assetId)!;
        const existing = networks.find((x: any) => x.assetId === targetAssetId && code(x.networkCode) === code(n.networkCode));
        const values = projectWorkspaceCryptoNetwork({
          ...n,
          manualWalletTrackingEnabled: n.manualWalletTrackingEnabled ?? true,
        }, targetAssetId);
        if (existing) {
          sourceNetworkMap.set(n.id, existing.id);
          const sourceAsset = snapshot.cryptoAssets.find((asset) => asset.id === n.assetId);
          const targetAsset = assets.find((asset: any) => asset.id === existing.assetId);
          const eligibilityDeterminantsChanged =
            !sourceAsset ||
            !targetAsset ||
            stable(customerDepositEligibilityDeterminants(n, sourceAsset)) !==
              stable(customerDepositEligibilityDeterminants(existing, targetAsset));
          await tx.update(cryptoAssetNetworksTable)
            .set({
              ...values,
              ...(eligibilityDeterminantsChanged
                ? { customerDepositsEnabled: false }
                : {}),
            })
            .where(eq(cryptoAssetNetworksTable.id, existing.id));
        } else {
          sourceNetworkMap.set(n.id, n.id);
          await (tx.insert(cryptoAssetNetworksTable) as any).values({
            id: n.id,
            ...values,
            customerDepositsEnabled: false,
          });
        }
      }
      for (const row of networks) if (row.enabled && !snapshot.cryptoNetworks.some((n) => `${assetMap.get(n.assetId)}:${code(n.networkCode)}` === `${row.assetId}:${code(row.networkCode)}`)) await tx.update(cryptoAssetNetworksTable).set({ enabled: false }).where(eq(cryptoAssetNetworksTable.id, row.id));
      if (
        before.counts.cryptoAssets.counts.update > 0 ||
        before.counts.cryptoAssets.counts.softDisable > 0 ||
        before.counts.cryptoNetworks.counts.update > 0 ||
        before.counts.cryptoNetworks.counts.softDisable > 0
      ) {
        await invalidateWhitebitDepositRouteProofs(tx);
      }
      const fiats = await tx.select().from(fiatCurrenciesTable);
      const fiatMap = new Map(fiats.map((f: any) => [code(f.code), f.id]));
      const sourceFiatMap = new Map<string, string>();
      for (const f of snapshot.fiatCurrencies) {
        const existing = fiats.find((x: any) => code(x.code) === code(f.code));
        const values = { code: f.code, name: f.name, flagObjectPath: f.flagObjectPath, network: f.network, precision: f.precision, lifecycle: f.lifecycle, regions: f.regions, countries: f.countries, enabled: f.enabled, rateMode: f.rateMode, manualRate: f.manualRate };
        if (existing) {
          sourceFiatMap.set(f.id, existing.id);
          await tx.update(fiatCurrenciesTable).set(values).where(eq(fiatCurrenciesTable.id, existing.id));
        } else {
          const [row] = await tx.insert(fiatCurrenciesTable).values({ id: f.id, ...values }).returning({ id: fiatCurrenciesTable.id });
          fiatMap.set(code(f.code), row.id);
          sourceFiatMap.set(f.id, row.id);
        }
      }
      for (const row of fiats) if (row.enabled && !snapshot.fiatCurrencies.some((f) => code(f.code) === code(row.code))) await tx.update(fiatCurrenciesTable).set({ enabled: false }).where(eq(fiatCurrenciesTable.id, row.id));
      const methods = await tx.select().from(paymentMethodsTable);
      for (const m of snapshot.paymentMethods) {
        const values = { name: m.name, logoObjectPath: m.logoObjectPath, description: m.description, instructions: m.instructions, family: m.family, executionMode: m.executionMode, providerId: m.providerId, lifecycle: m.lifecycle, regions: m.regions, countries: m.countries, requiresProviderConfiguration: m.requiresProviderConfiguration, enabled: m.enabled, canSend: m.canSend, canReceive: m.canReceive, fieldDefinitions: m.fieldDefinitions as any };
        if (methods.some((x: any) => x.id === m.id)) await tx.update(paymentMethodsTable).set(values).where(eq(paymentMethodsTable.id, m.id)); else await tx.insert(paymentMethodsTable).values({ id: m.id, ...values });
      }
      for (const row of methods) if (row.enabled && !snapshot.paymentMethods.some((m) => m.id === row.id)) await tx.update(paymentMethodsTable).set({ enabled: false }).where(eq(paymentMethodsTable.id, row.id));
      const links = await tx.select().from(fiatCurrencyPaymentMethodsTable);
      for (const l of snapshot.fiatCurrencyPaymentMethods) {
        const fiatCurrencyId = fiatMap.get(code(l.fiatCode)); if (!fiatCurrencyId) continue;
        const values = { fiatCurrencyId, paymentMethodId: l.paymentMethodId, enabled: l.enabled, canSend: l.canSend, canReceive: l.canReceive, sendInstructions: l.sendInstructions, receiveInstructions: l.receiveInstructions, minAmount: l.minAmount, maxAmount: l.maxAmount, countries: l.countries };
        const existing = links.find((x: any) => x.fiatCurrencyId === fiatCurrencyId && x.paymentMethodId === l.paymentMethodId);
        if (existing) await tx.update(fiatCurrencyPaymentMethodsTable).set(values).where(eq(fiatCurrencyPaymentMethodsTable.id, existing.id)); else await tx.insert(fiatCurrencyPaymentMethodsTable).values(values);
      }
      for (const row of links) if (row.enabled && !snapshot.fiatCurrencyPaymentMethods.some((l) => `${fiatMap.get(code(l.fiatCode))}:${l.paymentMethodId}` === `${row.fiatCurrencyId}:${row.paymentMethodId}`)) await tx.update(fiatCurrencyPaymentMethodsTable).set({ enabled: false }).where(eq(fiatCurrencyPaymentMethodsTable.id, row.id));
      const rules = await tx.select().from(manualDeskPricingRulesTable);
      for (const r of snapshot.manualDeskPricingRules) {
        const values = { name: r.name, sourceAsset: r.sourceAsset, targetAsset: r.targetAsset, sourceCryptoAssetId: r.sourceCryptoAssetId ? assetMap.get(r.sourceCryptoAssetId) : null, targetCryptoAssetId: r.targetCryptoAssetId ? assetMap.get(r.targetCryptoAssetId) : null, sourceNetwork: r.sourceNetwork, targetNetwork: r.targetNetwork, paymentMethod: r.paymentMethod, payoutMethod: r.payoutMethod, sourceSettlementOptionId: remapSettlementOptionId(r.sourceSettlementOptionId, sourceNetworkMap, sourceFiatMap), targetSettlementOptionId: remapSettlementOptionId(r.targetSettlementOptionId, sourceNetworkMap, sourceFiatMap), minAmount: r.minAmount, maxAmount: r.maxAmount, operatorInstructions: r.operatorInstructions, customerInstructions: r.customerInstructions, expectedSettlementMinutes: r.expectedSettlementMinutes, markupBasisPoints: r.markupBasisPoints, adjustmentDirection: r.adjustmentDirection, fixedFee: r.fixedFee, exactRate: r.exactRate, priority: r.priority, enabled: r.enabled };
        const existing = rules.find((x: any) => x.id === r.id);
        if (existing) {
          if (stable(ruleProjection(existing)) !== stable(ruleProjection(values))) {
            await tx.update(manualDeskPricingRulesTable).set({ ...values, version: existing.version + 1 }).where(eq(manualDeskPricingRulesTable.id, r.id));
          }
        } else await (tx.insert(manualDeskPricingRulesTable) as any).values({ id: r.id, ...values });
      }
      for (const row of rules) if (row.enabled && !snapshot.manualDeskPricingRules.some((r) => r.id === row.id)) await tx.update(manualDeskPricingRulesTable).set({ enabled: false, version: row.version + 1 }).where(eq(manualDeskPricingRulesTable.id, row.id));
      const allCurrentPages = await tx.select().from(siteContentRevisionsTable).orderBy(desc(siteContentRevisionsTable.revision));
      for (const page of snapshot.site.publishedPages) {
        const current = allCurrentPages.find((p: any) => p.pageKey === page.pageKey && p.status === "published");
        if (!current || stable(current.content) !== stable(page.content)) {
          const max = allCurrentPages.filter((p: any) => p.pageKey === page.pageKey).reduce((n, p: any) => Math.max(n, p.revision), 0);
          await tx.insert(siteContentRevisionsTable).values({ pageKey: page.pageKey, revision: max + 1, status: "published", content: page.content, createdBy: actorId, publishedBy: actorId, publishedAt: new Date() });
        }
      }
      if (snapshot.site.publication) {
        const [latest] = await tx.select().from(sitePublicationRevisionsTable).orderBy(desc(sitePublicationRevisionsTable.version)).limit(1);
        const publication = snapshot.site.publication;
        if (!latest || stable({ navigation: latest.navigation, partnerLogos: latest.partnerLogos, socialTrust: latest.socialTrust }) !== stable(publication)) await tx.insert(sitePublicationRevisionsTable).values({ version: (latest?.version ?? 0) + 1, ...publication, createdBy: actorId, publishedBy: actorId } as any);
      }
      if (snapshot.landingBackground) {
        const [latest] = await tx.select().from(landingBackgroundSettingsTable).orderBy(desc(landingBackgroundSettingsTable.version)).limit(1);
        const background = snapshot.landingBackground;
        const current = latest ? { mode: latest.mode, presetId: latest.presetId, focalX: latest.focalX, focalY: latest.focalY, placements: latest.placements } : null;
        if (!latest || stable(current) !== stable(background)) {
          await tx.insert(landingBackgroundSettingsTable).values({
            version: (latest?.version ?? 0) + 1,
            mode: "preset",
            presetId: background.presetId,
            customObjectPath: null,
            focalX: background.focalX,
            focalY: background.focalY,
            placements: background.placements as any,
            createdBy: actorId,
          });
        }
      }
      return { counts: before.counts };
    });
    invalidatePopularExchangePairsCache();
    invalidateManualDeskFiatRateCache();
    res.setHeader("cache-control", "no-store");
    res.json({ ok: true, applied: true, objects: prepared.objects, ...result });
  } catch (e) { next(e); }
});
export default router;