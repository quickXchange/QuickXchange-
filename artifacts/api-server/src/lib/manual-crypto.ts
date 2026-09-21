import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  blockchainMonitorAssetsTable,
  blockchainMonitorNetworksTable,
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
} from "@workspace/db";
import { isRegisteredDepositProvider } from "./deposit-provider-registry";

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
}) {
  return input.routeId === input.monitorAssetRouteId &&
    input.routeNetworkCode.trim().toUpperCase() ===
      input.monitorNetworkCode.trim().toUpperCase() &&
    input.assetEnabled &&
    input.networkEnabled &&
    input.providerKind !== "none" &&
    input.endpointConfigured &&
    input.healthStatus === "connected";
}

async function listReadyManualMonitoringRoutes(): Promise<Map<string, string>> {
  const rows = await db.select({
    monitorAssetRouteId: blockchainMonitorAssetsTable.assetNetworkId,
    monitorNetworkCode: blockchainMonitorNetworksTable.networkCode,
    assetEnabled: blockchainMonitorAssetsTable.enabled,
    networkEnabled: blockchainMonitorNetworksTable.enabled,
    providerKind: blockchainMonitorNetworksTable.providerKind,
    endpointSecretRef: blockchainMonitorNetworksTable.endpointSecretRef,
    healthStatus: blockchainMonitorNetworksTable.healthStatus,
  }).from(blockchainMonitorAssetsTable)
    .innerJoin(
      blockchainMonitorNetworksTable,
      eq(blockchainMonitorNetworksTable.id, blockchainMonitorAssetsTable.monitorNetworkId),
    )
    .where(and(
      eq(blockchainMonitorAssetsTable.enabled, true),
      eq(blockchainMonitorNetworksTable.enabled, true),
    ));
  return new Map(rows
    .filter((row) => isManualMonitoringRuntimeReady({
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
    }))
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
    (network.executionMode === "manual" || network.executionMode === "api");
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