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
  matchWhitebitCapability,
  whitebitSwapStatus,
  type WhitebitCapabilitySnapshot,
} from "./whitebit-capabilities";
import {
  isSyntacticallyValidManualWalletAddress,
  isSyntacticallyValidManualWalletMemo,
} from "./manual-wallet-validation";
import {
  getWhitebitCredentialStorageState,
  whitebitCredentialFingerprint,
} from "./provider-credentials";

type EligibilityNetwork = Pick<
  CryptoAssetNetwork,
  | "id"
  | "networkCode"
  | "networkName"
  | "networkFamily"
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
  const activeCredentials = stored.status === "available"
    ? stored.credentials
    : process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET
      ? {
          apiKey: process.env.WHITEBIT_API_KEY,
          secretKey: process.env.WHITEBIT_API_SECRET,
        }
      : null;
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
  })).digest("hex");
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
  if (hasUsableSavedReceivingWallet(network)) return true;
  if (
    network.depositProvider === "whitebit" &&
    context.whitebitReady &&
    context.whitebitCapabilities &&
    context.whitebitProofs.get(network.id) ===
      customerDepositRouteConfigurationDigest(asset, network)
  ) {
    return Boolean(matchWhitebitCapability(
      context.whitebitCapabilities,
      asset.code,
      network.networkCode,
    ));
  }
  return false;
}

export async function reconcileCryptoCustomerDepositEligibilityWithExecutor(
  executor: EligibilityExecutor,
  context: CustomerDepositEligibilityContext,
) {
    const rows = await executor.select({
      network: cryptoAssetNetworksTable,
      asset: cryptoAssetsTable,
    }).from(cryptoAssetNetworksTable)
      .innerJoin(cryptoAssetsTable, eq(cryptoAssetNetworksTable.assetId, cryptoAssetsTable.id))
      .for("update");
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