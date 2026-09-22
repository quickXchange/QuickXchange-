import { and, eq, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  blockchainMonitorAssetsTable,
  blockchainMonitorNetworksTable,
  cryptoAssetNetworksTable,
  db,
} from "@workspace/db";
import { createBlockchainMonitorAdapter } from "./blockchain-monitoring";
import { adapterConfig } from "./blockchain-monitoring/service";
import { normalizeTronAddress } from "./blockchain-monitoring/tron";
import {
  isSyntacticallyValidManualWalletAddress,
  isSyntacticallyValidManualWalletMemo,
} from "./manual-wallet-validation";

export type ManualMonitoringReadinessCode =
  | "READY"
  | "ADDRESS_INVALID"
  | "MEMO_INVALID"
  | "MONITOR_MISSING"
  | "ENDPOINT_MISSING"
  | "IDENTITY_MISSING"
  | "ASSET_MONITOR_DISABLED"
  | "NETWORK_MONITOR_DISABLED"
  | "PROVIDER_INCOMPATIBLE"
  | "HEALTH_CHECK_FAILED"
  | "CHAIN_ID_MISMATCH"
  | "LEGACY_BEP20"
  | "CONFIG_CHANGED_RETRY";
export const isLegacyBep20Network = (value: string) =>
  /^(?:BSC|BEP20|BSC_BEP20)$/i.test(value.trim());

export const usesLegacyBep20Readiness = (
  networkCode: string,
  chainId: string | null | undefined,
) => isLegacyBep20Network(networkCode) && chainId?.trim().toLowerCase() !== "0x38";

export function isValidManualMonitoringTokenIdentity(
  adapterKind: string,
  contractOrMint: string | null | undefined,
): boolean {
  const contract = contractOrMint?.trim() ?? "";
  const shapeValid = adapterKind === "evm"
    ? /^0x[0-9a-fA-F]{40}$/.test(contract)
    : adapterKind === "tron"
      ? /^(?:T[1-9A-HJ-NP-Za-km-z]{33}|41[0-9a-fA-F]{40})$/.test(contract)
      : adapterKind === "solana"
        ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(contract)
        : false;
  if (!shapeValid) return false;
  if (adapterKind !== "tron") return true;
  try {
    return Boolean(normalizeTronAddress(contract));
  } catch {
    return false;
  }
}

export type ManualMonitoringReadiness = {
  routeId: string;
  code: ManualMonitoringReadinessCode;
  message: string;
  ready: boolean;
  networkCode: string;
  monitorNetworkId?: string;
  monitorAssetId?: string;
  proofFingerprint?: string;
};

export function manualMonitoringProofFingerprint(input: {
  network: typeof blockchainMonitorNetworksTable.$inferSelect;
  asset: typeof blockchainMonitorAssetsTable.$inferSelect;
  route: typeof cryptoAssetNetworksTable.$inferSelect;
  endpoint?: string;
  apiKey?: string;
  capturedAt: Date;
  head: string;
}): string {
  const hash = (value?: string) =>
    value ? createHash("sha256").update(value).digest("hex") : null;
  return createHash("sha256").update(JSON.stringify({
    network: {
      id: input.network.id,
      code: input.network.networkCode,
      adapter: input.network.adapterKind,
      provider: input.network.providerKind,
      chainId: input.network.chainId,
      endpointRef: input.network.endpointSecretRef,
      apiKeyRef: input.network.apiKeySecretRef,
      enabled: input.network.enabled,
      maxScanRange: input.network.maxScanRange,
    },
    asset: {
      id: input.asset.id,
      identityKind: input.asset.identityKind,
      contractOrMint: input.asset.contractOrMint,
      decimals: input.asset.decimals,
    },
    route: {
      id: input.route.id,
      networkCode: input.route.networkCode,
      assetId: input.route.assetId,
      decimals: input.route.decimals,
      address: input.route.sharedDepositAddress,
      memo: input.route.sharedDepositMemo,
    },
    endpointHash: hash(input.endpoint),
    apiKeyHash: hash(input.apiKey),
  })).digest("hex");
}

export function manualMonitoringNetworkConfigDigest(input: {
  network: typeof blockchainMonitorNetworksTable.$inferSelect;
  endpoint?: string;
  apiKey?: string;
}): string {
  const hash = (value?: string) =>
    value ? createHash("sha256").update(value).digest("hex") : null;
  return createHash("sha256").update(JSON.stringify({
    id: input.network.id,
    networkCode: input.network.networkCode,
    adapterKind: input.network.adapterKind,
    providerKind: input.network.providerKind,
    chainId: input.network.chainId,
    enabled: input.network.enabled,
    maxScanRange: input.network.maxScanRange,
    endpointSecretRef: input.network.endpointSecretRef,
    apiKeySecretRef: input.network.apiKeySecretRef,
    endpointHash: hash(input.endpoint),
    apiKeyHash: hash(input.apiKey),
  })).digest("hex");
}

type RouteInput = {
  routeId: string;
  address: string;
  memo?: string | null;
};

const messages: Record<ManualMonitoringReadinessCode, string> = {
  READY: "Monitoring is ready and healthy.",
  ADDRESS_INVALID: "The receiving address is invalid for this network.",
  MEMO_INVALID: "The receiving memo or tag is invalid for this network.",
  MONITOR_MISSING: "No canonical monitor is configured for this network.",
  ENDPOINT_MISSING: "The monitor endpoint is not configured.",
  IDENTITY_MISSING: "The exact verified asset contract or mint is not configured.",
  ASSET_MONITOR_DISABLED: "The exact asset monitor is disabled.",
  NETWORK_MONITOR_DISABLED: "The network monitor is disabled.",
  PROVIDER_INCOMPATIBLE: "The configured provider is incompatible with this monitor.",
  HEALTH_CHECK_FAILED: "The monitor health check failed.",
  CHAIN_ID_MISMATCH: "The provider chain identity does not match the configured network.",
  LEGACY_BEP20: "BEP20 monitoring uses the established legacy readiness path.",
  CONFIG_CHANGED_RETRY: "Monitoring configuration changed while saving; retry the save.",
};

function result(
  input: RouteInput,
  code: ManualMonitoringReadinessCode,
  networkCode: string,
  monitorNetworkId?: string,
  monitorAssetId?: string,
): ManualMonitoringReadiness {
  return {
    routeId: input.routeId,
    code,
    message: messages[code],
    ready: code === "READY" || code === "LEGACY_BEP20",
    networkCode,
    monitorNetworkId,
    monitorAssetId,
  };
}

/**
 * Probes each canonical network at most once, outside the save transaction.
 * The transaction that calls this function must only persist the returned
 * outcome; it must never hold a DB lock while contacting a provider.
 */
export async function prepareManualMonitoringReadiness(
  inputs: readonly RouteInput[],
): Promise<Map<string, ManualMonitoringReadiness>> {
  const routes = await db.select({
    route: cryptoAssetNetworksTable,
    network: blockchainMonitorNetworksTable,
    monitorAsset: blockchainMonitorAssetsTable,
  }).from(cryptoAssetNetworksTable)
    .leftJoin(
      blockchainMonitorNetworksTable,
      eq(blockchainMonitorNetworksTable.networkCode, cryptoAssetNetworksTable.networkCode),
    )
    .leftJoin(
      blockchainMonitorAssetsTable,
      and(
        eq(blockchainMonitorAssetsTable.assetNetworkId, cryptoAssetNetworksTable.id),
        eq(blockchainMonitorAssetsTable.monitorNetworkId, blockchainMonitorNetworksTable.id),
      ),
    )
    .where(inArray(cryptoAssetNetworksTable.id, inputs.map(input => input.routeId)));
  const byId = new Map(routes.map(row => [row.route.id, row]));
  const outcomes = new Map<string, ManualMonitoringReadiness>();
  const probes = new Map<string, Promise<ManualMonitoringReadinessCode>>();

  for (const input of inputs) {
    const row = byId.get(input.routeId);
    if (!row) {
      outcomes.set(input.routeId, result(input, "MONITOR_MISSING", ""));
      continue;
    }
    const network = row.network;
    const networkCode = network?.networkCode ?? row.route.networkCode;
    if (
      usesLegacyBep20Readiness(networkCode, network?.chainId) &&
      row.monitorAsset?.identityKind === "native" &&
      !row.monitorAsset.contractOrMint &&
      row.monitorAsset.enabled
    ) {
      outcomes.set(input.routeId, result(input, "LEGACY_BEP20", networkCode));
      continue;
    }
    if (!isSyntacticallyValidManualWalletAddress(row.route, input.address)) {
      outcomes.set(input.routeId, result(input, "ADDRESS_INVALID", networkCode, network?.id, row.monitorAsset?.id));
      continue;
    }
    const memo = input.memo?.trim() ?? "";
    if (memo && !isSyntacticallyValidManualWalletMemo(row.route, memo)) {
      outcomes.set(input.routeId, result(input, "MEMO_INVALID", networkCode, network?.id, row.monitorAsset?.id));
      continue;
    }
    if (row.route.requiresMemo && !memo) {
      outcomes.set(input.routeId, result(input, "MEMO_INVALID", networkCode, network?.id, row.monitorAsset?.id));
      continue;
    }
    if (!network) {
      outcomes.set(input.routeId, result(input, "MONITOR_MISSING", networkCode));
      continue;
    }
    const identity = row.monitorAsset;
    const contract = identity?.contractOrMint?.trim() || "";
    const validContract = isValidManualMonitoringTokenIdentity(network.adapterKind, contract);
    if (
      !identity ||
      (identity.identityKind === "native" && identity.contractOrMint !== null) ||
      (identity.identityKind === "token" && !validContract) ||
      identity.decimals !== row.route.decimals
    ) {
      outcomes.set(input.routeId, result(input, "IDENTITY_MISSING", networkCode, network.id));
      continue;
    }
    const verifiedAsset = identity;
    if (!verifiedAsset.enabled) {
      outcomes.set(input.routeId, result(input, "ASSET_MONITOR_DISABLED", networkCode, network.id, verifiedAsset.id));
      continue;
    }
    if (!network.enabled) {
      outcomes.set(input.routeId, result(input, "NETWORK_MONITOR_DISABLED", networkCode, network.id, verifiedAsset.id));
      continue;
    }
    const compatible =
      network.adapterKind === "evm" && network.providerKind === "rpc" ||
      network.adapterKind === "solana" && network.providerKind === "rpc" ||
      network.adapterKind === "tron" && network.providerKind === "indexer" ||
      network.adapterKind === "bitcoin" && network.providerKind === "rpc";
    if (!compatible) {
      outcomes.set(input.routeId, result(input, "PROVIDER_INCOMPATIBLE", networkCode, network.id, verifiedAsset.id));
      continue;
    }
    const config = adapterConfig(network);
    if (!config) {
      outcomes.set(input.routeId, result(input, "ENDPOINT_MISSING", networkCode, network.id, verifiedAsset.id));
      continue;
    }
    let probe = probes.get(network.id);
    if (!probe) {
      probe = (async () => {
        const fence = {
          id: network.id,
          networkCode: network.networkCode,
          adapterKind: network.adapterKind,
          providerKind: network.providerKind,
          chainId: network.chainId,
          endpointSecretRef: network.endpointSecretRef,
          apiKeySecretRef: network.apiKeySecretRef,
          enabled: network.enabled,
        };
        const fenceValue = <T extends string | null>(
          column: Parameters<typeof eq>[0],
          value: T,
        ) => value === null ? isNull(column as never) : eq(column as never, value);
        try {
          const adapter = createBlockchainMonitorAdapter(config);
          const connection = await adapter.testConnection();
          if (!connection.connected) throw new Error("Provider reported disconnected.");
          if (network.chainId && connection.chainId?.toLowerCase() !== network.chainId.toLowerCase()) {
            await db.update(blockchainMonitorNetworksTable).set({
              healthStatus: "disconnected",
              healthCheckedAt: new Date(),
              healthError: messages.CHAIN_ID_MISMATCH,
            }).where(and(
              eq(blockchainMonitorNetworksTable.id, fence.id),
              eq(blockchainMonitorNetworksTable.networkCode, fence.networkCode),
              eq(blockchainMonitorNetworksTable.adapterKind, fence.adapterKind),
              eq(blockchainMonitorNetworksTable.providerKind, fence.providerKind),
              fenceValue(blockchainMonitorNetworksTable.chainId, fence.chainId),
              fenceValue(blockchainMonitorNetworksTable.endpointSecretRef, fence.endpointSecretRef),
              fenceValue(blockchainMonitorNetworksTable.apiKeySecretRef, fence.apiKeySecretRef),
              eq(blockchainMonitorNetworksTable.enabled, fence.enabled),
            ));
            return "CHAIN_ID_MISMATCH";
          }
          const head = await adapter.getHead();
          const capturedAt = new Date();
          const persisted = await db.update(blockchainMonitorNetworksTable).set({
            healthStatus: "connected",
            healthCheckedAt: capturedAt,
            healthError: null,
            consecutiveFailures: 0,
            lastHead: head.cursor,
            healthProofCapturedAt: capturedAt,
            healthProofFingerprint: manualMonitoringNetworkConfigDigest({
              network,
              endpoint: config.endpoint,
              apiKey: config.apiKey,
            }),
          }).where(and(
            eq(blockchainMonitorNetworksTable.id, fence.id),
            eq(blockchainMonitorNetworksTable.networkCode, fence.networkCode),
            eq(blockchainMonitorNetworksTable.adapterKind, fence.adapterKind),
            eq(blockchainMonitorNetworksTable.providerKind, fence.providerKind),
            fenceValue(blockchainMonitorNetworksTable.chainId, fence.chainId),
            fenceValue(blockchainMonitorNetworksTable.endpointSecretRef, fence.endpointSecretRef),
            fenceValue(blockchainMonitorNetworksTable.apiKeySecretRef, fence.apiKeySecretRef),
            eq(blockchainMonitorNetworksTable.enabled, fence.enabled),
          )).returning({ id: blockchainMonitorNetworksTable.id });
          if (persisted.length !== 1) return "HEALTH_CHECK_FAILED";
          return "READY";
        } catch {
          await db.update(blockchainMonitorNetworksTable).set({
            healthStatus: "disconnected",
            healthCheckedAt: new Date(),
            healthError: messages.HEALTH_CHECK_FAILED,
          }).where(and(
            eq(blockchainMonitorNetworksTable.id, network.id),
            eq(blockchainMonitorNetworksTable.networkCode, network.networkCode),
            eq(blockchainMonitorNetworksTable.adapterKind, network.adapterKind),
            eq(blockchainMonitorNetworksTable.providerKind, network.providerKind),
            fenceValue(blockchainMonitorNetworksTable.chainId, network.chainId),
            fenceValue(blockchainMonitorNetworksTable.endpointSecretRef, network.endpointSecretRef),
            fenceValue(blockchainMonitorNetworksTable.apiKeySecretRef, network.apiKeySecretRef),
            eq(blockchainMonitorNetworksTable.enabled, network.enabled),
          ));
          return "HEALTH_CHECK_FAILED";
        }
      })();
      probes.set(network.id, probe);
    }
    let code = await probe;
    let proofFingerprint: string | undefined;
    if (code === "READY") {
      const [proofNetwork] = await db.select().from(blockchainMonitorNetworksTable)
        .where(eq(blockchainMonitorNetworksTable.id, network.id));
      if (!proofNetwork?.healthCheckedAt || !proofNetwork.lastHead) {
        code = "HEALTH_CHECK_FAILED";
      }
      const config = proofNetwork ? adapterConfig(proofNetwork) : undefined;
      const capturedAt = proofNetwork?.healthCheckedAt ?? new Date();
      const head = proofNetwork?.lastHead ?? "";
      proofFingerprint = manualMonitoringProofFingerprint({
        network: proofNetwork ?? network,
        asset: verifiedAsset,
        route: {
          ...row.route,
          sharedDepositAddress: input.address.trim(),
          sharedDepositMemo: input.memo?.trim() || null,
        },
        endpoint: config?.endpoint,
        apiKey: config?.apiKey,
        capturedAt,
        head,
      });
    }
    const outcome = result(input, code, networkCode, network.id, verifiedAsset.id);
    if (code === "READY") outcome.proofFingerprint = proofFingerprint;
    outcomes.set(input.routeId, outcome);
  }
  return outcomes;
}