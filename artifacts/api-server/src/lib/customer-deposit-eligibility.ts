import { createHash } from "node:crypto";
import {
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
  providerIntegrationsTable,
  whitebitProviderSettingsTable,
  type CryptoAssetNetwork,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import {
  getWhitebitCapabilities,
  matchWhitebitRouteCapability,
  whitebitSwapStatus,
  type WhitebitCapabilitySnapshot,
} from "./whitebit-capabilities";
import {
  isSyntacticallyValidManualWalletAddress,
  isSyntacticallyValidManualWalletMemo,
} from "./manual-wallet-validation";
import {
  getSelectedWhitebitCredentialState,
  getWhitebitCredentialStorageState,
  whitebitCredentialFingerprint,
} from "./provider-credentials";

type EligibilityNetwork = Pick<
  CryptoAssetNetwork,
  | "id"
  | "networkCode"
  | "networkName"
  | "networkFamily"
  | "whitebitAssetCode"
  | "whitebitNetworkCode"
  | "depositProvider"
  | "requiresMemo"
  | "sharedDepositAddress"
  | "sharedDepositMemo"
  | "customerDepositsEnabled"
  | "enabled"
  | "lifecycle"
>;
type EligibilityAsset = Pick<
  typeof cryptoAssetsTable.$inferSelect,
  "code" | "enabled" | "lifecycle"
>;

export type CustomerDepositEligibilityContext = {
  whitebitReady: boolean;
  whitebitCapabilities: WhitebitCapabilitySnapshot | null;
  whitebitProofs: ReadonlyMap<string, string>;
  credentialUpdatedAtMs: number | null;
  providerSettingVersion: number | null;
};

export class CustomerDepositEligibilityStateChangedError extends Error {
  constructor() {
    super("Deposit provider state changed during eligibility reconciliation.");
    this.name = "CustomerDepositEligibilityStateChangedError";
  }
}

type EligibilityExecutor = Pick<typeof db, "select" | "update">;

export async function createCustomerDepositEligibilityContext(): Promise<CustomerDepositEligibilityContext> {
  const selected = await getSelectedWhitebitCredentialState();
  const stored = await getWhitebitCredentialStorageState();
  const [setting] = await db.select({
    depositRouteProofs: whitebitProviderSettingsTable.depositRouteProofs,
    version: whitebitProviderSettingsTable.version,
  }).from(whitebitProviderSettingsTable)
    .where(eq(whitebitProviderSettingsTable.provider, "whitebit"))
    .limit(1);
  const credentialUpdatedAtMs = stored.status === "available" ||
      stored.status === "unavailable"
    ? stored.updatedAt.getTime()
    : null;
  const providerSettingVersion = setting?.version ?? null;
  const unavailable = (): CustomerDepositEligibilityContext => ({
    whitebitReady: false,
    whitebitCapabilities: null,
    whitebitProofs: new Map(),
    credentialUpdatedAtMs,
    providerSettingVersion,
  });
  const activeCredentials = selected.status === "available" ? selected.credentials : null;
  if (!activeCredentials) return unavailable();
  try {
    const status = await whitebitSwapStatus();
    if (!status.enabled || status.state !== "ready" || !status.credentialsReady) {
      return unavailable();
    }
    const fingerprint = whitebitCredentialFingerprint(activeCredentials);
    return {
      whitebitReady: true,
      whitebitCapabilities: await getWhitebitCapabilities(),
      whitebitProofs: new Map(
        (setting?.depositRouteProofs ?? [])
          .filter((proof) => proof.credentialFingerprint === fingerprint)
          .map((proof) => [proof.networkId, proof.configurationDigest]),
      ),
      credentialUpdatedAtMs,
      providerSettingVersion,
    };
  } catch {
    return unavailable();
  }
}

export async function assertCustomerDepositEligibilityContextCurrent(
  executor: EligibilityExecutor,
  context: CustomerDepositEligibilityContext,
) {
  const [credentialRow] = await executor.select({
    updatedAt: providerIntegrationsTable.updatedAt,
  }).from(providerIntegrationsTable)
    .where(eq(providerIntegrationsTable.provider, "whitebit"))
    .limit(1);
  const [setting] = await executor.select({
    version: whitebitProviderSettingsTable.version,
  }).from(whitebitProviderSettingsTable)
    .where(eq(whitebitProviderSettingsTable.provider, "whitebit"))
    .limit(1);
  if (!customerDepositEligibilityContextMatchesState(
    context,
    credentialRow?.updatedAt.getTime() ?? null,
    setting?.version ?? null,
  )) {
    throw new CustomerDepositEligibilityStateChangedError();
  }
}

export function customerDepositEligibilityContextMatchesState(
  context: CustomerDepositEligibilityContext,
  credentialUpdatedAtMs: number | null,
  providerSettingVersion: number | null,
): boolean {
  return context.credentialUpdatedAtMs === credentialUpdatedAtMs &&
    context.providerSettingVersion === providerSettingVersion;
}

export function customerDepositRouteConfigurationDigest(
  asset: EligibilityAsset,
  network: Pick<
    EligibilityNetwork,
    | "id"
    | "networkCode"
    | "networkName"
    | "networkFamily"
    | "whitebitAssetCode"
    | "whitebitNetworkCode"
    | "depositProvider"
    | "requiresMemo"
    | "enabled"
    | "lifecycle"
  >,
): string {
  return createHash("sha256").update(JSON.stringify({
    networkId: network.id,
    assetCode: asset.code.trim().toUpperCase(),
    assetEnabled: asset.enabled,
    assetLifecycle: asset.lifecycle,
    networkCode: network.networkCode.trim().toUpperCase(),
    networkName: network.networkName,
    networkFamily: network.networkFamily,
    depositProvider: network.depositProvider,
    requiresMemo: network.requiresMemo,
    networkEnabled: network.enabled,
    networkLifecycle: network.lifecycle,
    // Preserve legacy exact-route proofs; only explicit mapping overrides
    // change the digest and invalidate old permission evidence.
    ...(network.whitebitAssetCode && network.whitebitNetworkCode
      ? { whitebitAssetCode: network.whitebitAssetCode.trim().toUpperCase(),
          whitebitNetworkCode: network.whitebitNetworkCode.trim().toUpperCase() }
      : {}),
  })).digest("hex");
}

const normalizeWhitebitCode = (value: string | null | undefined) =>
  value?.trim().toUpperCase() || "";

function effectiveWhitebitMapping(
  assetCode: string,
  networkCode: string,
  mappedAssetCode: string | null | undefined,
  mappedNetworkCode: string | null | undefined,
): string {
  const asset = normalizeWhitebitCode(mappedAssetCode);
  const network = normalizeWhitebitCode(mappedNetworkCode);
  // A partial override is never equivalent to a complete canonical route.
  if (Boolean(asset) !== Boolean(network)) {
    return JSON.stringify(["partial", asset, network]);
  }
  return JSON.stringify([
    "complete",
    asset || normalizeWhitebitCode(assetCode),
    network || normalizeWhitebitCode(networkCode),
  ]);
}

export function whitebitRouteMappingChanged(
  assetCode: string,
  networkCode: string,
  beforeAssetCode: string | null | undefined,
  beforeNetworkCode: string | null | undefined,
  afterAssetCode: string | null | undefined,
  afterNetworkCode: string | null | undefined,
): boolean {
  return effectiveWhitebitMapping(assetCode, networkCode, beforeAssetCode, beforeNetworkCode) !==
    effectiveWhitebitMapping(assetCode, networkCode, afterAssetCode, afterNetworkCode);
}

/**
 * Existing proofs were issued with either the implicit or the explicit
 * canonical digest. Both represent the same provider identity; keep both
 * readable without rewriting stored evidence or accepting a changed mapping.
 */
export function customerDepositRouteProofMatchesConfiguration(
  proofDigest: string | null | undefined,
  asset: EligibilityAsset,
  network: Parameters<typeof customerDepositRouteConfigurationDigest>[1],
): boolean {
  if (!proofDigest) return false;
  if (proofDigest === customerDepositRouteConfigurationDigest(asset, network)) return true;
  const assetCode = normalizeWhitebitCode(asset.code);
  const networkCode = normalizeWhitebitCode(network.networkCode);
  const mappedAsset = normalizeWhitebitCode(network.whitebitAssetCode);
  const mappedNetwork = normalizeWhitebitCode(network.whitebitNetworkCode);
  if (mappedAsset && mappedNetwork &&
      mappedAsset === assetCode && mappedNetwork === networkCode) {
    return proofDigest === customerDepositRouteConfigurationDigest(asset, {
      ...network,
      whitebitAssetCode: null,
      whitebitNetworkCode: null,
    });
  }
  if (!mappedAsset && !mappedNetwork) {
    return proofDigest === customerDepositRouteConfigurationDigest(asset, {
      ...network,
      whitebitAssetCode: assetCode,
      whitebitNetworkCode: networkCode,
    });
  }
  return false;
}

export function hasUsableSavedReceivingWallet(network: EligibilityNetwork): boolean {
  if (!isSyntacticallyValidManualWalletAddress(network, network.sharedDepositAddress)) return false;
  return !network.requiresMemo ||
    isSyntacticallyValidManualWalletMemo(network, network.sharedDepositMemo ?? "");
}

export function isCustomerDepositEligible(
  asset: EligibilityAsset,
  network: EligibilityNetwork,
  context: CustomerDepositEligibilityContext,
): boolean {
  if (network.depositProvider === "none") return false;
  if (network.depositProvider === "manual") return hasUsableSavedReceivingWallet(network);
  if (
    network.depositProvider === "whitebit" &&
    context.whitebitReady &&
    context.whitebitCapabilities &&
    customerDepositRouteProofMatchesConfiguration(
      context.whitebitProofs.get(network.id), asset, network,
    )
  ) {
    return Boolean(matchWhitebitRouteCapability(
      context.whitebitCapabilities,
      asset.code,
      network.networkCode,
      network.whitebitAssetCode,
      network.whitebitNetworkCode,
    ));
  }
  return false;
}

export async function reconcileCryptoCustomerDepositEligibilityWithExecutor(
  executor: EligibilityExecutor,
  context: CustomerDepositEligibilityContext,
  routeIds?: readonly string[],
) {
    const rowsQuery = executor.select({
      network: cryptoAssetNetworksTable,
      asset: cryptoAssetsTable,
    }).from(cryptoAssetNetworksTable)
      .innerJoin(cryptoAssetsTable, eq(cryptoAssetNetworksTable.assetId, cryptoAssetsTable.id));
    const rows = await (routeIds
      ? rowsQuery.where(inArray(cryptoAssetNetworksTable.id, [...routeIds])).for("update")
      : rowsQuery.for("update"));
    // Reconciliation may revoke an enabled route when its funding proof becomes
    // invalid, but it must never override an Owner's explicit disabled state.
    const eligibleIds = new Set(rows
      .filter(({ asset, network }) =>
        network.customerDepositsEnabled &&
        isCustomerDepositEligible(asset, network, context)
      )
      .map(({ network }) => network.id));
    const enabledIds = [...eligibleIds];
    const disabledIds = rows
      .filter(({ network }) => !eligibleIds.has(network.id))
      .map(({ network }) => network.id);
    if (enabledIds.length) {
      await executor.update(cryptoAssetNetworksTable)
        .set({ customerDepositsEnabled: true })
        .where(inArray(cryptoAssetNetworksTable.id, enabledIds));
    }
    if (disabledIds.length) {
      await executor.update(cryptoAssetNetworksTable)
        .set({ customerDepositsEnabled: false })
        .where(inArray(cryptoAssetNetworksTable.id, disabledIds));
    }
    return {
      enabled: enabledIds.length,
      remainedDisabled: disabledIds.length,
      changed: rows.filter(({ network }) =>
        network.customerDepositsEnabled !== eligibleIds.has(network.id)
      ).length,
    };
}

export async function invalidateWhitebitDepositRouteProofs(
  executor: EligibilityExecutor,
) {
  await executor.update(whitebitProviderSettingsTable).set({
    depositRouteProofs: [],
    version: sql`${whitebitProviderSettingsTable.version} + 1`,
    updatedAt: new Date(),
  }).where(eq(whitebitProviderSettingsTable.provider, "whitebit"));
  return reconcileCryptoCustomerDepositEligibilityWithExecutor(executor, {
    whitebitReady: false,
    whitebitCapabilities: null,
    whitebitProofs: new Map(),
    credentialUpdatedAtMs: null,
    providerSettingVersion: null,
  });
}

export async function invalidateWhitebitDepositRouteProofsForRoutes(
  executor: EligibilityExecutor,
  routeIds: readonly string[],
  context?: CustomerDepositEligibilityContext,
) {
  const affectedIds = [...new Set(routeIds.filter(Boolean))];
  if (!affectedIds.length) return;
  const [setting] = await executor.select({
    depositRouteProofs: whitebitProviderSettingsTable.depositRouteProofs,
  }).from(whitebitProviderSettingsTable)
    .where(eq(whitebitProviderSettingsTable.provider, "whitebit"))
    .limit(1);
  if (!setting) return;
  const proofs = setting.depositRouteProofs ?? [];
  const retained = proofs.filter((proof) => !affectedIds.includes(proof.networkId));
  if (retained.length === proofs.length) return;
  await executor.update(whitebitProviderSettingsTable).set({
    depositRouteProofs: retained,
    version: sql`${whitebitProviderSettingsTable.version} + 1`,
    updatedAt: new Date(),
  }).where(eq(whitebitProviderSettingsTable.provider, "whitebit"));
  if (context) {
    const whitebitProofs = new Map(context.whitebitProofs);
    affectedIds.forEach((id) => whitebitProofs.delete(id));
    await reconcileCryptoCustomerDepositEligibilityWithExecutor(executor, {
      ...context,
      whitebitProofs,
    }, affectedIds);
  }
}

export async function reconcileCryptoCustomerDepositEligibility() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const context = await createCustomerDepositEligibilityContext();
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))`,
        );
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
        await assertCustomerDepositEligibilityContextCurrent(tx, context);
        return reconcileCryptoCustomerDepositEligibilityWithExecutor(tx, context);
      });
    } catch (error) {
      if (
        !(error instanceof CustomerDepositEligibilityStateChangedError) ||
        attempt === 1
      ) throw error;
    }
  }
  throw new CustomerDepositEligibilityStateChangedError();
}