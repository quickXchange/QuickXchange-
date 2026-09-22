import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  blockchainMonitorAssetsTable,
  blockchainMonitorNetworksTable,
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
} from "@workspace/db";
import { isRegisteredDepositProvider } from "./deposit-provider-registry";
import {
  isSyntacticallyValidManualWalletAddress,
  isSyntacticallyValidManualWalletMemo,
} from "./manual-wallet-validation";
import {
  isLegacyBep20Network,
  isValidManualMonitoringTokenIdentity,
  manualMonitoringNetworkConfigDigest,
  manualMonitoringProofFingerprint,
} from "./manual-monitoring-readiness";

export type ManualCryptoOption = {
  id: string;
  assetId: string;
  assetCode: string;
  routeNetwork: string;
  kind: "crypto-network";
  title: string;
  direction: "receive" | "both";
  networkSlug: string;
  networkTitle: string;
  requiresMemo: boolean;
  fields: [];
  sendInstructions?: string;
  receiveInstructions?: string;
  depositWarning?: string;
  customerDepositsEnabled: boolean;
  executionMode: "manual";
  lifecycle: "active" | "restricted" | "deprecated";
  regions: string[];
  countries: string[];
  logoUrl?: string;
  networkLogoUrl?: string;
};

/**
 * Keep the public route spelling used by the existing exchange API.  The
 * database network code is an operator-facing identifier and is deliberately
 * not necessarily the route name customers (or legacy v1 tickets) use.
 */
export function manualCryptoRouteNetwork(network: {
  id: string;
  networkCode: string;
  networkName: string;
}) {
  const legacyRouteNames: Record<string, string> = {
    "btc-bitcoin": "Bitcoin",
    "eth-ethereum": "Ethereum",
    "xrp-xrpl": "Ripple",
    "xmr-monero": "Monero",
    "usdt0-polygon": "Polygon",
  };
  return legacyRouteNames[network.id] ?? network.networkCode;
}

export async function listManualCryptoNetworks() {
  return db.select({ asset: cryptoAssetsTable, network: cryptoAssetNetworksTable })
    .from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetNetworksTable.assetId, cryptoAssetsTable.id))
    .where(eq(cryptoAssetNetworksTable.enabled, true))
    .orderBy(
      desc(cryptoAssetsTable.enabled),
      sql`case ${cryptoAssetsTable.lifecycle} when 'active' then 0 when 'restricted' then 1 when 'deprecated' then 2 else 3 end`,
      asc(cryptoAssetsTable.code),
      asc(cryptoAssetsTable.name),
      asc(cryptoAssetsTable.id),
      desc(cryptoAssetNetworksTable.enabled),
      sql`case ${cryptoAssetNetworksTable.lifecycle} when 'active' then 0 when 'restricted' then 1 when 'deprecated' then 2 else 3 end`,
      asc(cryptoAssetNetworksTable.networkName),
      asc(cryptoAssetNetworksTable.networkCode),
      asc(cryptoAssetNetworksTable.assetId),
      asc(cryptoAssetNetworksTable.id),
    );
}

export function isManualMonitoringRuntimeReady(input: {
  routeId: string;
  routeNetworkCode: string;
  monitorAssetRouteId: string;
  monitorNetworkCode: string;
  assetEnabled: boolean;
  networkEnabled: boolean;
  providerKind: string;
  endpointConfigured: boolean;
  healthStatus: string;
  healthCheckedAtMs: number | null;
  healthProofCapturedAtMs: number | null;
  pollIntervalSeconds: number;
  adapterKind: string;
  identityKind: string;
  contractOrMint?: string | null;
  providerCompatible: boolean;
  receivingAddressValid: boolean;
  memoValid: boolean;
  readinessProofFingerprint?: string | null;
  networkHealthProofFingerprint?: string | null;
  networkDigest?: string;
  routeDigest?: string;
}) {
  const healthMaxAgeMs = Math.max(120_000, input.pollIntervalSeconds * 3_000);
  const legacyBep20 = isLegacyBep20Network(input.monitorNetworkCode);
  const healthFresh = input.healthCheckedAtMs !== null &&
    Date.now() - input.healthCheckedAtMs >= 0 &&
    Date.now() - input.healthCheckedAtMs <= healthMaxAgeMs;
  const tokenIdentityValid = input.identityKind === "token" &&
    isValidManualMonitoringTokenIdentity(input.adapterKind, input.contractOrMint);
  return input.routeId === input.monitorAssetRouteId &&
    input.routeNetworkCode.trim().toUpperCase() ===
      input.monitorNetworkCode.trim().toUpperCase() &&
    input.assetEnabled &&
    input.networkEnabled &&
    input.providerKind !== "none" &&
    input.endpointConfigured &&
    input.healthStatus === "connected" &&
    healthFresh &&
    (legacyBep20 || (
      input.healthProofCapturedAtMs !== null &&
      Date.now() - input.healthProofCapturedAtMs >= 0 &&
      Date.now() - input.healthProofCapturedAtMs <= healthMaxAgeMs
    )) &&
    ["evm", "tron", "solana"].includes(input.adapterKind) &&
    input.providerCompatible &&
    input.receivingAddressValid &&
    input.memoValid &&
    (legacyBep20 || Boolean(input.readinessProofFingerprint)) &&
    (legacyBep20 ||
      input.networkDigest === input.networkHealthProofFingerprint) &&
    (legacyBep20 ||
      input.routeDigest === input.readinessProofFingerprint) &&
    (
      input.identityKind === "native" && !input.contractOrMint?.trim() ||
      tokenIdentityValid
    );
}

export async function listReadyManualMonitoringRoutes(): Promise<Map<string, string>> {
  const rows = await db.select({
    route: cryptoAssetNetworksTable,
    monitorAssetRouteId: blockchainMonitorAssetsTable.assetNetworkId,
    asset: blockchainMonitorAssetsTable,
    network: blockchainMonitorNetworksTable,
    identityKind: blockchainMonitorAssetsTable.identityKind,
    contractOrMint: blockchainMonitorAssetsTable.contractOrMint,
    monitorNetworkCode: blockchainMonitorNetworksTable.networkCode,
    adapterKind: blockchainMonitorNetworksTable.adapterKind,
    assetEnabled: blockchainMonitorAssetsTable.enabled,
    readinessProofFingerprint: blockchainMonitorAssetsTable.readinessProofFingerprint,
    healthProofCapturedAt: blockchainMonitorNetworksTable.healthProofCapturedAt,
    networkHealthProofFingerprint: blockchainMonitorNetworksTable.healthProofFingerprint,
    networkEnabled: blockchainMonitorNetworksTable.enabled,
    providerKind: blockchainMonitorNetworksTable.providerKind,
    endpointSecretRef: blockchainMonitorNetworksTable.endpointSecretRef,
    healthStatus: blockchainMonitorNetworksTable.healthStatus,
    healthCheckedAt: blockchainMonitorNetworksTable.healthCheckedAt,
    pollIntervalSeconds: blockchainMonitorNetworksTable.pollIntervalSeconds,
  }).from(blockchainMonitorAssetsTable)
    .innerJoin(
      blockchainMonitorNetworksTable,
      eq(blockchainMonitorNetworksTable.id, blockchainMonitorAssetsTable.monitorNetworkId),
    )
    .innerJoin(
      cryptoAssetNetworksTable,
      eq(cryptoAssetNetworksTable.id, blockchainMonitorAssetsTable.assetNetworkId),
    )
    .where(and(
      eq(blockchainMonitorAssetsTable.enabled, true),
      eq(blockchainMonitorNetworksTable.enabled, true),
    ));
  return new Map(rows
    .filter((row) => {
      const config = row.endpointSecretRef ? process.env[row.endpointSecretRef] : undefined;
      const apiKey = row.network.apiKeySecretRef ? process.env[row.network.apiKeySecretRef] : undefined;
      const networkDigest = manualMonitoringNetworkConfigDigest({
        network: row.network,
        endpoint: config,
        apiKey,
      });
      const routeDigest = manualMonitoringProofFingerprint({
        network: row.network,
        asset: row.asset,
        route: row.route,
        endpoint: config,
        apiKey,
        capturedAt: row.healthCheckedAt ?? new Date(0),
        head: "",
      });
      return isManualMonitoringRuntimeReady({
      routeId: row.monitorAssetRouteId,
      routeNetworkCode: row.monitorNetworkCode,
      monitorAssetRouteId: row.monitorAssetRouteId,
      monitorNetworkCode: row.monitorNetworkCode,
      assetEnabled: row.assetEnabled,
      networkEnabled: row.networkEnabled,
      providerKind: row.providerKind,
      endpointConfigured: Boolean(
        row.endpointSecretRef &&
        process.env[row.endpointSecretRef],
      ),
      healthStatus: row.healthStatus,
      healthCheckedAtMs: row.healthCheckedAt?.getTime() ?? null,
      healthProofCapturedAtMs: row.healthProofCapturedAt?.getTime() ?? null,
      pollIntervalSeconds: row.pollIntervalSeconds,
      adapterKind: row.adapterKind,
      identityKind: row.identityKind,
      contractOrMint: row.contractOrMint,
      providerCompatible:
        row.adapterKind === "evm" && row.providerKind === "rpc" ||
        row.adapterKind === "solana" && row.providerKind === "rpc" ||
        row.adapterKind === "tron" && row.providerKind === "indexer",
      receivingAddressValid: isSyntacticallyValidManualWalletAddress(
        row.route,
        row.route.sharedDepositAddress,
      ),
      memoValid: !row.route.requiresMemo || Boolean(
        row.route.sharedDepositMemo &&
        isSyntacticallyValidManualWalletMemo(row.route, row.route.sharedDepositMemo),
      ),
      readinessProofFingerprint: row.readinessProofFingerprint,
      networkHealthProofFingerprint: row.networkHealthProofFingerprint,
      networkDigest,
      routeDigest,
      });
    })
    .map((row) => [row.monitorAssetRouteId, row.monitorNetworkCode]));
}

function isManualCryptoRouteEligible(
  asset: typeof cryptoAssetsTable.$inferSelect,
  network: typeof cryptoAssetNetworksTable.$inferSelect,
) {
  return asset.enabled &&
    network.enabled &&
    asset.lifecycle !== "deprecated" &&
    network.lifecycle !== "deprecated" &&
    network.executionMode === "manual";
}

/** Public catalog deliberately never includes the shared receiving address. */
export async function listPublicManualCryptoSettlementOptions(): Promise<ManualCryptoOption[]> {
  const [rows, readyManualMonitoringRoutes] = await Promise.all([
    listManualCryptoNetworks(),
    listReadyManualMonitoringRoutes(),
  ]);
  return rows.filter(({ asset, network }) =>
    isManualCryptoRouteEligible(asset, network)
  ).map(({ asset, network }) => {
    const configuredForCustomerSend =
      isConfiguredYouSendCryptoNetwork(network) &&
      (
        network.depositProvider !== "manual" ||
        readyManualMonitoringRoutes.get(network.id)?.trim().toUpperCase() ===
          network.networkCode.trim().toUpperCase()
      );
    return {
    id: `crypto:${network.id}`,
    assetId: asset.id,
    assetCode: asset.code,
    routeNetwork: manualCryptoRouteNetwork(network),
    kind: "crypto-network",
    title: `${asset.code} ${network.networkName}`,
    direction: configuredForCustomerSend ? "both" : "receive",
    networkSlug: network.id,
    networkTitle: network.networkName,
    requiresMemo: network.requiresMemo,
    fields: [],
    sendInstructions: network.depositInstructions ?? undefined,
    receiveInstructions: network.depositInstructions ?? undefined,
    depositWarning: network.depositWarning ?? undefined,
    customerDepositsEnabled: configuredForCustomerSend,
    executionMode: "manual",
    lifecycle: network.lifecycle as "active" | "restricted" | "deprecated",
    regions: network.regions,
    countries: [],
    logoUrl: asset.logoObjectPath ? `/api/storage${asset.logoObjectPath}` : undefined,
    networkLogoUrl: network.logoObjectPath ? `/api/storage${network.logoObjectPath}` : undefined,
  };
  });
}

export async function findManualCryptoNetwork(assetCode: string, networkCode: string) {
  const rows = await listManualCryptoNetworks();
  return rows.find(({ asset, network }) =>
    isManualCryptoRouteEligible(asset, network) &&
    asset.code.toUpperCase() === assetCode.toUpperCase() &&
    (
      network.networkCode.toUpperCase() === networkCode.toUpperCase() ||
      network.networkName.toUpperCase() === networkCode.toUpperCase() ||
      manualCryptoRouteNetwork(network).toUpperCase() === networkCode.toUpperCase()
    ));
}

/**
 * Resolve a selected settlement option by its immutable crypto asset-network
 * row ID. The asset code check is deliberately retained as a second boundary:
 * a caller cannot use a valid row ID to fund a different submitted asset.
 */
export async function findManualCryptoNetworkByIdForAsset(
  networkId: string,
  assetCode: string,
) {
  const rows = await listManualCryptoNetworks();
  return rows.find(({ asset, network }) =>
    isManualCryptoRouteEligible(asset, network) &&
    network.id === networkId &&
    asset.code.toUpperCase() === assetCode.toUpperCase()
  );
}

export function isConfiguredYouSendCryptoNetwork(
  network: Pick<
    typeof cryptoAssetNetworksTable.$inferSelect,
    "enabled" | "depositProvider" | "customerDepositsEnabled"
  >,
) {
  return network.enabled &&
    network.customerDepositsEnabled &&
    network.depositProvider !== "none";
}

export function canAcceptManualCryptoDeposit(network: typeof cryptoAssetNetworksTable.$inferSelect) {
  if (!isConfiguredYouSendCryptoNetwork(network)) return false;
  if (network.depositProvider === "manual") {
    return Boolean(network.sharedDepositAddress.trim()) &&
      (!network.requiresMemo || Boolean(network.sharedDepositMemo?.trim()));
  }
  return isRegisteredDepositProvider(network.depositProvider);
}

export async function canAcceptReadyManualCryptoDeposit(
  network: typeof cryptoAssetNetworksTable.$inferSelect,
) {
  if (!canAcceptManualCryptoDeposit(network)) return false;
  if (network.depositProvider !== "manual") return true;
  const ready = await listReadyManualMonitoringRoutes();
  return ready.get(network.id)?.trim().toUpperCase() === network.networkCode.trim().toUpperCase();
}