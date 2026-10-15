import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, blockchainMonitorAssetsTable as assets, blockchainMonitorNetworksTable as networks,
  cryptoAssetNetworksTable as routes, operatorAuditLogsTable,
} from "@workspace/db";
import { ApiError } from "./api-error";
import { getMonitoringNetworkWorkloads } from "./blockchain-monitoring/service";
import { adapterConfig } from "./blockchain-monitoring/service";
import { manualMonitoringProofFingerprint, manualMonitoringNetworkConfigDigest, type ManualMonitoringReadiness } from "./manual-monitoring-readiness";
import { listReadyManualMonitoringRoutes } from "./manual-crypto";
import type { SwitchActor, SwitchFence } from "../routes/deposit-provider-switches";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type MonitoringOptions = {
  rpcMonitoring?: "auto" | "enable" | "disable" | "keep";
  networkMonitor?: "auto" | "enable" | "disable" | "keep";
  assetMonitoring?: "auto" | "enable" | "disable" | "keep";
};
export const manualMonitoringIntentionallyDisabled = (provider: string, options?: MonitoringOptions | null) =>
  provider === "manual" && Boolean(options && (options.rpcMonitoring === "disable" ||
    options.networkMonitor === "disable" || options.assetMonitoring === "disable"));
const independent = (row: { activeWatches: boolean; pendingEvidence: boolean; registrationGaps: boolean }) =>
  row.activeWatches || row.pendingEvidence || row.registrationGaps;
const override = (choice: string | undefined, proposed: boolean, current: boolean) =>
  choice === "enable" ? true : choice === "disable" ? false : choice === "keep" ? current : proposed;

/** The worker and shutdown controls share the same immutable-order workload
 * query. Today's custody provider never removes an old address's obligation. */
export async function assertMonitorShutdownSafe(tx: Tx, monitorNetworkId: string, routeId?: string) {
  const workloads = await getMonitoringNetworkWorkloads(tx, routeId ?? null);
  const workload = workloads.find(row => row.network.id === monitorNetworkId);
  if (workload && independent(workload)) {
    throw new ApiError("RPC_MONITORING_OBLIGATIONS_ACTIVE",
      "RPC monitoring is required by active Manual watches, pending/reorg evidence or unresolved historical deposits. Monitoring was not disabled.", 409);
  }
  {
    const [needed] = await tx.select({ id: routes.id }).from(routes).innerJoin(assets, eq(assets.assetNetworkId, routes.id))
      .where(and(eq(assets.monitorNetworkId, monitorNetworkId), eq(assets.enabled, true),
        ...(routeId ? [eq(routes.id, routeId)] : []),
        eq(routes.customerDepositsEnabled, true), sql`(${routes.depositProvider} = 'manual' or
          ${routes.depositProvider} = 'whitebit' and ${routes.manualFallbackEnabled} = true
            and ${routes.manualWalletTrackingEnabled} = true)`)).limit(1);
    if (needed) throw new ApiError("RPC_SHARED_NETWORK_REQUIRED",
      "Another enabled Manual/fallback deposit route requires this shared Network Monitor. It was not disabled.", 409);
  }
}

export async function applyProviderMonitoring(
  id: string, provider: string, options: MonitoringOptions | null | undefined,
  actor: SwitchActor, fence: SwitchFence,
): Promise<string | null> {
  // Old persisted jobs/clients retain their original behaviour.
  if (!options) return null;
  return db.transaction(async tx => {
    await fence(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('deposit-provider-monitoring'))`);
    const [route] = await tx.select().from(routes).where(eq(routes.id, id)).for("update");
    if (!route) throw new ApiError("CRYPTO_NETWORK_NOT_FOUND", "Asset/network route no longer exists.", 404);
    if (route.depositProvider !== provider) throw new ApiError("PROVIDER_SWITCH_CONFIG_CHANGED", "Provider changed before RPC configuration.", 409);
    const links = await tx.select().from(assets).where(eq(assets.assetNetworkId, id));
    if (links.length > 1) throw new ApiError("RPC_MONITORING_MAPPING_AMBIGUOUS",
      "Multiple monitoring configurations map to this asset/network. Resolve its exact monitor mapping before retrying.", 409);
    let asset = links[0];
    const [network] = asset ? await tx.select().from(networks).where(eq(networks.id, asset.monitorNetworkId)).for("update") : [];
    if (asset) [asset] = await tx.select().from(assets).where(eq(assets.id, asset.id)).for("update");
    if (asset && asset.monitorNetworkId !== network?.id)
      throw new ApiError("RPC_MONITORING_CONFIG_CHANGED", "Exact monitor mapping changed. Retry with the current configuration.", 409);
    const mode = options.rpcMonitoring ?? "auto";
    const automatic = mode === "auto";
    const on = automatic ? provider === "manual" : mode === "enable" ? true : mode === "disable" ? false : route.manualWalletTrackingEnabled;
    let assetOn = override(options.assetMonitoring, mode === "keep" ? asset?.enabled ?? false : on, asset?.enabled ?? false);
    let networkOn = override(options.networkMonitor, mode === "keep" ? network?.enabled ?? false : on, network?.enabled ?? false);
    const notes: string[] = [];
    if (mode === "disable" && asset && network) {
      // Turning off today's tracking switch cannot extinguish a frozen watch.
      await assertMonitorShutdownSafe(tx, network.id, id);
      if (assetOn && networkOn) throw new ApiError("RPC_MONITORING_SETTINGS_CONFLICT",
        "Disable RPC Monitoring conflicts with keeping both Network and Asset Monitoring enabled. Choose Follow RPC Monitoring or disable the asset monitor.", 409);
    }
    if ((!asset || !network) && (mode === "enable" || automatic && provider === "manual" ||
      options.networkMonitor === "enable" || options.assetMonitoring === "enable")) {
      throw new ApiError("RPC_MONITORING_NOT_CONFIGURED",
        "The exact asset monitor and Network Monitor are missing. Configure the existing RPC route first; no provider configuration was invented.", 409);
    }
    if (asset && network) {
      if (!assetOn) {
        try { await assertMonitorShutdownSafe(tx, network.id, id); }
        catch (error) {
          if (!automatic || options.assetMonitoring === "disable") throw error;
          assetOn = true;
          notes.push("Asset monitoring retained for outstanding Manual obligations");
        }
      }
      await tx.update(assets).set({ enabled: assetOn }).where(eq(assets.id, asset.id));
      // The current route's fallback readiness is switched off before deciding
      // whether other routes still require this shared network.
      await tx.update(routes).set({ manualWalletTrackingEnabled: on }).where(eq(routes.id, id));
      if (!networkOn) {
        try {
          await assertMonitorShutdownSafe(tx, network.id);
          const shared = (await getMonitoringNetworkWorkloads(tx)).find(row => row.network.id === network.id);
          if (automatic && options.networkMonitor !== "disable" && shared?.manualReadiness)
            throw new ApiError("RPC_SHARED_NETWORK_REQUIRED", "Other Manual routes require shared readiness.", 409);
        } catch (error) {
          if (options.networkMonitor === "disable" || (!automatic && mode !== "disable")) throw error;
          networkOn = true;
          notes.push("Shared Network Monitor retained for Manual readiness or obligations");
        }
      }
      await tx.update(networks).set({ enabled: networkOn }).where(eq(networks.id, network.id));
    } else {
      await tx.update(routes).set({ manualWalletTrackingEnabled: on }).where(eq(routes.id, id));
      notes.push("No RPC monitor configured; no RPC polling to disable");
    }
    // Keep configured endpoint references, adapters, chain IDs, contracts,
    // wallets, fallback opt-in, cursors and proofs intact.
    await tx.insert(operatorAuditLogsTable).values({
      action: "crypto_deposit_provider.monitoring_configured", actorClerkUserId: actor.clerkUserId,
      targetOperatorId: actor.operator.id, requestId: actor.requestId,
      details: { networkId: id, provider, mode, rpcTrackingEnabled: on,
        networkMonitorEnabled: network ? networkOn : null, assetMonitoringEnabled: asset ? assetOn : null,
        retained: notes },
    });
    await fence(tx);
    return notes.join("; ") || (mode === "keep" ? "Current RPC settings preserved" :
      on ? "Required RPC monitoring enabled; readiness verification follows" : "Unnecessary RPC polling disabled");
  });
}

export async function monitoringSnapshots(routeIds: string[]) {
  const [links, workloads, ready] = await Promise.all([
    db.select({ asset: assets, network: networks }).from(assets).innerJoin(networks, eq(assets.monitorNetworkId, networks.id))
      .where(inArray(assets.assetNetworkId, routeIds)),
    getMonitoringNetworkWorkloads(db, null, routeIds), listReadyManualMonitoringRoutes(),
  ]);
  const result = new Map<string, { rpcStatus: string; networkMonitorEnabled: boolean | null; assetMonitoringEnabled: boolean | null }>();
  for (const { asset, network } of links) {
    if (result.has(asset.assetNetworkId)) {
      result.set(asset.assetNetworkId, { rpcStatus: "AMBIGUOUS", networkMonitorEnabled: null, assetMonitoringEnabled: null });
      continue;
    }
    const workload = workloads.find(row => row.network.id === network.id && row.assetNetworkId === asset.assetNetworkId);
    const required = workload && independent(workload);
    const enabled = network.enabled && asset.enabled;
    const rpcStatus = !enabled ? required ? "BLOCKED" : "OFF" : required ? "PRESERVED_FOR_OBLIGATIONS"
      : !ready.has(asset.assetNetworkId) ? "BLOCKED" : workload?.manualReadiness ? "ACTIVE" : "IDLE";
    result.set(asset.assetNetworkId, { rpcStatus, networkMonitorEnabled: network.enabled, assetMonitoringEnabled: asset.enabled });
  }
  return result;
}

/** Preparation performs the real probe but deliberately does not publish an
 * asset proof. Save that proof only after the current job and exact config
 * still match, as individual wallet configuration controls already require. */
export async function savePreparedMonitoringProof(
  id: string, readiness: ManualMonitoringReadiness, fence: SwitchFence,
) {
  await db.transaction(async tx => {
    await fence(tx);
    await persistPreparedMonitoringProof(tx, id, readiness);
  });
}

export async function persistPreparedMonitoringProof(tx: Tx, id: string, readiness: ManualMonitoringReadiness) {
  if (!readiness.ready || !readiness.proofFingerprint || !readiness.monitorAssetId || !readiness.monitorNetworkId)
    throw new ApiError("RPC_MONITORING_PROOF_MISSING", "Live RPC verification did not return an exact-route proof.", 409);
    const [route] = await tx.select().from(routes).where(eq(routes.id, id)).for("update");
    const [network] = await tx.select().from(networks).where(eq(networks.id, readiness.monitorNetworkId!)).for("update");
    const [asset] = await tx.select().from(assets).where(eq(assets.id, readiness.monitorAssetId!)).for("update");
    if (!route || !network || !asset || !network.enabled || !asset.enabled ||
      asset.assetNetworkId !== id || asset.monitorNetworkId !== network.id)
      throw new ApiError("RPC_MONITORING_CONFIG_CHANGED", "Monitoring settings changed during live verification. Retry with the current configuration.", 409);
    const config = adapterConfig(network);
    const age = Date.now() - (network.healthCheckedAt?.getTime() ?? 0);
    const proofAge = Date.now() - (network.healthProofCapturedAt?.getTime() ?? 0);
    if (network.healthStatus !== "connected" || age < 0 || age > Math.max(120_000, network.pollIntervalSeconds * 3_000) ||
      proofAge < 0 || proofAge > Math.max(120_000, network.pollIntervalSeconds * 3_000) ||
      network.healthProofFingerprint !== manualMonitoringNetworkConfigDigest({ network, endpoint: config?.endpoint, apiKey: config?.apiKey }))
      throw new ApiError("RPC_MONITORING_PROOF_EXPIRED", "RPC health proof expired or configuration changed. Retry live verification.", 409);
    if (manualMonitoringProofFingerprint({
      network, asset, route, endpoint: config?.endpoint, apiKey: config?.apiKey,
      capturedAt: network.healthCheckedAt ?? new Date(0), head: network.lastHead ?? "",
    }) !== readiness.proofFingerprint)
      throw new ApiError("RPC_MONITORING_CONFIG_CHANGED", "Exact RPC route identity changed during verification.", 409);
    await tx.update(assets).set({
      readinessProofFingerprint: readiness.proofFingerprint,
      readinessProofCapturedAt: network.healthProofCapturedAt ?? network.healthCheckedAt,
    }).where(eq(assets.id, asset.id));
}
