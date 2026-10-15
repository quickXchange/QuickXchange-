import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, cryptoAssetNetworksTable as routes, blockchainMonitorAssetsTable as assets,
  blockchainMonitorNetworksTable as networks, manualWalletTargetsTable as targets,
  manualWalletRegistrationsTable as registrations, operatorsTable,
  depositProviderSwitchRoutesTable as switches, operatorAuditLogsTable,
} from "@workspace/db";
import { ApiError } from "./api-error";
import { listReadyManualMonitoringRoutes } from "./manual-crypto";
import { isSyntacticallyValidManualWalletAddress, isSyntacticallyValidManualWalletMemo } from "./manual-wallet-validation";
import { normalizeTronAddress } from "./blockchain-monitoring/tron";
import { withManualWalletOperationLock } from "./manual-wallet-operation-lock";
import { isValidManualMonitoringTokenIdentity, prepareManualMonitoringReadiness, type ManualMonitoringReadiness } from "./manual-monitoring-readiness";
import { applyProviderMonitoring, savePreparedMonitoringProof } from "./deposit-provider-monitoring";
import type { SwitchActor, SwitchFence } from "../routes/deposit-provider-switches";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Route = typeof routes.$inferSelect;
type Input = { networkIds: string[]; walletAddress: string; memo?: string | null; enabled?: boolean; customerDepositsEnabled?: boolean };

export function validateManualWallet(route: Route, address: string, memo: string) {
  if (!address || !isSyntacticallyValidManualWalletAddress(route, address))
    throw new ApiError("CRYPTO_DEPOSIT_ADDRESS_INVALID", `Invalid Manual address for ${route.networkCode}.`, 422);
  if ((route.requiresMemo && !memo) || (memo && !isSyntacticallyValidManualWalletMemo(route, memo)))
    throw new ApiError("CRYPTO_DEPOSIT_MEMO_INVALID", `A valid memo/tag is required for ${route.networkCode}.`, 422);
}

export function canonicalManualAddress(adapter: string, address: string) {
  if (adapter === "tron") return normalizeTronAddress(address) || address;
  return adapter === "evm" || (adapter === "bitcoin" && /^(bc1|tb1|bcrt1)/i.test(address))
    ? address.toLowerCase() : address;
}

/** Only exact operator-configured identities are eligible. No guessed contracts,
 * inferred chain IDs or fabricated order watches. Disabled configs are reusable. */
async function identity(executor: Pick<typeof db, "select">, route: Route) {
  const links = await executor.select({ asset: assets, network: networks }).from(assets)
    .innerJoin(networks, eq(networks.id, assets.monitorNetworkId))
    .where(eq(assets.assetNetworkId, route.id));
  if (links.length !== 1) return { message: links.length ? "Multiple RPC asset mappings; resolve the exact mapping before activation." : "Exact RPC asset/network identity is not configured." };
  const { asset, network } = links[0];
  if (network.networkCode.toUpperCase() !== route.networkCode.toUpperCase() ||
    asset.decimals !== route.decimals ||
    !(asset.identityKind === "native" ? !asset.contractOrMint :
      asset.identityKind === "token" && isValidManualMonitoringTokenIdentity(network.adapterKind, asset.contractOrMint)))
    return { message: "RPC network, token identity or decimals do not match this exact asset/network route." };
  return { asset, network, message: "" };
}

export async function syncManualWalletRegistration(tx: Tx, route: Route) {
  const address = route.sharedDepositAddress.trim();
  const memo = route.sharedDepositMemo?.trim() || "";
  if (!address) {
    // Configuration detachment does not delete a target or any order-owned watch.
    await tx.delete(registrations).where(eq(registrations.assetNetworkId, route.id));
    return;
  }
  const resolved = await identity(tx, route);
  try { validateManualWallet(route, address, memo); }
  catch (error) { resolved.message = error instanceof ApiError ? error.message : "Invalid Manual wallet configuration."; }
  let targetId: string | null = null;
  if (resolved.network && resolved.asset && !resolved.message) {
    const canonicalAddress = canonicalManualAddress(resolved.network.adapterKind, address);
    await tx.insert(targets).values({ monitorNetworkId: resolved.network.id, address, canonicalAddress, memo })
      .onConflictDoNothing();
    const [target] = await tx.select().from(targets).where(and(
      eq(targets.monitorNetworkId, resolved.network.id), eq(targets.canonicalAddress, canonicalAddress), eq(targets.memo, memo)));
    targetId = target.id;
  }
  const values = { assetNetworkId: route.id, targetId, monitorAssetId: resolved.asset?.id ?? null,
    address, memo, message: resolved.message || null, updatedAt: new Date() };
  await tx.insert(registrations).values(values).onConflictDoUpdate({ target: registrations.assetNetworkId, set: values });
}

export async function withManualWalletRegistration<T extends { id: string; sharedDepositAddress?: string | null; sharedDepositMemo?: string | null; depositProvider?: string }>(rows: T[]) {
  if (!rows.length) return rows;
  const [links, ready] = await Promise.all([
    db.select({ registration: registrations, target: targets, route: routes, asset: assets, network: networks }).from(registrations)
      .innerJoin(routes, eq(routes.id, registrations.assetNetworkId))
      .leftJoin(targets, eq(targets.id, registrations.targetId))
      .leftJoin(assets, eq(assets.id, registrations.monitorAssetId))
      .leftJoin(networks, eq(networks.id, assets.monitorNetworkId))
      .where(inArray(registrations.assetNetworkId, rows.map(row => row.id))),
    listReadyManualMonitoringRoutes(),
  ]);
  const counts = links.length ? await db.select({ targetId: registrations.targetId, count: sql<number>`count(*)::int` })
    .from(registrations).where(inArray(registrations.targetId, links.flatMap(row => row.target ? [row.target.id] : [])))
    .groupBy(registrations.targetId) : [];
  return rows.map(row => {
    const link = links.find(link => link.registration.assetNetworkId === row.id);
    const address = row.sharedDepositAddress || "";
    const synchronized = link && link.registration.address === address.trim() &&
      link.registration.memo === (row.sharedDepositMemo?.trim() || "") &&
      (!link.target || Boolean(link.asset && link.network && link.asset.assetNetworkId === row.id &&
        link.asset.monitorNetworkId === link.target.monitorNetworkId && link.asset.decimals === link.route.decimals &&
        (link.asset.identityKind === "native" ? !link.asset.contractOrMint :
          isValidManualMonitoringTokenIdentity(link.network.adapterKind, link.asset.contractOrMint)) &&
        link.network.networkCode.toUpperCase() === link.route.networkCode.toUpperCase() &&
        link.target.canonicalAddress === canonicalManualAddress(link.network.adapterKind, address.trim())));
    const standby = link && (link.route.depositProvider !== "manual" &&
      !(link.route.depositProvider === "whitebit" && link.route.manualFallbackEnabled && link.route.manualWalletTrackingEnabled));
    const healthy = Boolean(link && ready.has(row.id));
    const status = !link ? "NOT_REGISTERED" : !synchronized ? "OUT_OF_SYNC" :
      !link.target || !link.registration.monitorAssetId || link.registration.message ? "BLOCKED" : standby ? "STANDBY" : healthy ? "READY" : "BLOCKED";
    return { ...row, manualWalletRegistration: {
      status, ready: status === "READY", address, targetId: link?.target?.id ?? null,
      monitorNetworkId: link?.target?.monitorNetworkId ?? null, monitorAssetId: link?.registration.monitorAssetId ?? null,
      sharedRouteCount: counts.find(count => count.targetId === link?.target?.id)?.count ?? 0,
      message: !link ? "Save this Manual wallet to register its exact RPC configuration." : !synchronized ?
        "Manual address or RPC identity changed; save it again to synchronize registration." : link.registration.message ||
        (standby ? "Registered on standby. No extra RPC polling; existing order obligations remain monitored." :
          healthy ? "Exact RPC route is ready. Order watches use frozen order addresses." : "Registered; live RPC readiness is required before enabling Manual deposits."),
    } };
  });
}

/** Save configurations first, then probe outside transactions. RPC failures
 * keep Manual deposits OFF while preserving the valid saved address. */
export async function saveRegisteredManualWallets(
  input: Input, actor: SwitchActor,
  setEnabled: (id: string, enabled: boolean, fence: SwitchFence, proof?: ManualMonitoringReadiness) => Promise<unknown>,
) {
  if (!input.networkIds.length || new Set(input.networkIds).size !== input.networkIds.length)
    throw new ApiError("VALIDATION_ERROR", "Select unique asset/network routes.", 400);
  return withManualWalletOperationLock(input.networkIds, async assertLockActive => {
  const expected = new Map<string, Route>();
  const desired = new Map<string, boolean>();
  const fence: SwitchFence = async tx => {
    assertLockActive();
    const [owner] = await tx.select().from(operatorsTable).where(eq(operatorsTable.id, actor.operator.id)).for("share");
    if (!owner || owner.role !== "owner" || owner.status !== "active" ||
      owner.authVersion !== actor.operator.authVersion || owner.clerkUserId !== actor.clerkUserId)
      throw new ApiError("OWNER_AUTHORIZATION_CHANGED", "Owner authorization changed; deposits were not activated.", 403);
    const current = await tx.select().from(routes).where(inArray(routes.id, input.networkIds)).for("update");
    if (current.length !== input.networkIds.length) throw new ApiError("CRYPTO_ASSET_NETWORK_NOT_FOUND", "A selected route no longer exists.", 404);
    const busy = await tx.select({ id: switches.networkId }).from(switches).where(and(
      inArray(switches.networkId, input.networkIds), inArray(switches.status, ["queued", "running"])));
    if (busy.length) throw new ApiError("PROVIDER_SWITCH_ACTIVE", "A selected route is currently switching providers. Retry after it finishes.", 409);
    for (const row of current) {
      const saved = expected.get(row.id);
      if (saved && (row.sharedDepositAddress !== saved.sharedDepositAddress || row.sharedDepositMemo !== saved.sharedDepositMemo ||
        row.depositProvider !== saved.depositProvider || row.decimals !== saved.decimals || row.requiresMemo !== saved.requiresMemo ||
         row.manualFallbackEnabled !== saved.manualFallbackEnabled || row.whitebitAssetCode !== saved.whitebitAssetCode ||
         row.whitebitNetworkCode !== saved.whitebitNetworkCode || row.networkFamily !== saved.networkFamily ||
         row.enabled !== saved.enabled || row.executionMode !== saved.executionMode || row.lifecycle !== saved.lifecycle ||
        row.networkCode !== saved.networkCode || row.assetId !== saved.assetId))
        throw new ApiError("MANUAL_WALLET_CONFIG_CHANGED", "Wallet or route configuration changed concurrently; refresh before retrying.", 409);
    }
  };
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
    await fence(tx);
    const selected = await tx.select().from(routes).where(inArray(routes.id, input.networkIds));
    for (const route of selected) {
      const address = input.walletAddress.trim() || route.sharedDepositAddress;
      const memo = input.memo === undefined ? route.sharedDepositMemo?.trim() || "" : input.memo?.trim() || "";
      validateManualWallet(route, address, memo);
      const next = { ...route, sharedDepositAddress: address, sharedDepositMemo: memo || null };
      desired.set(route.id, input.customerDepositsEnabled ?? input.enabled ?? route.customerDepositsEnabled);
      expected.set(route.id, next);
      await tx.update(routes).set({ sharedDepositAddress: address, sharedDepositMemo: memo || null,
        ...(route.depositProvider === "manual" || desired.get(route.id) === false ? { customerDepositsEnabled: false } : {}),
      }).where(eq(routes.id, route.id));
      await syncManualWalletRegistration(tx, next);
    }
    await tx.insert(operatorAuditLogsTable).values({ action: "crypto_network_receiving_wallet.registered",
      actorClerkUserId: actor.clerkUserId, targetOperatorId: actor.operator.id, targetEmail: actor.operator.email,
      requestId: actor.requestId, details: { affectedNetworkIds: input.networkIds, preservesOrderWatches: true } });
  });
  const blocked = new Set<string>();
  const fail = async (id: string, error: unknown) => {
    if (error instanceof ApiError && error.code === "OWNER_AUTHORIZATION_CHANGED") throw error;
    blocked.add(id);
    const saved = expected.get(id)!;
    await db.update(registrations).set({ message: error instanceof ApiError ? error.message : "RPC verification failed; retry after checking the exact network configuration." })
      .where(and(eq(registrations.assetNetworkId, id), eq(registrations.address, saved.sharedDepositAddress),
        eq(registrations.memo, saved.sharedDepositMemo || "")));
  };
  for (const route of expected.values()) {
    try {
      if (!(route.depositProvider === "whitebit" && route.manualFallbackEnabled && route.manualWalletTrackingEnabled))
        await applyProviderMonitoring(route.id, route.depositProvider, { rpcMonitoring: "auto" }, actor, fence);
    } catch (error) { await fail(route.id, error); }
  }
  const inputs = [...expected.values()].filter(route => !blocked.has(route.id) &&
    (route.depositProvider === "manual" || route.depositProvider === "whitebit" && route.manualFallbackEnabled && route.manualWalletTrackingEnabled))
    .map(route => ({ routeId: route.id, address: route.sharedDepositAddress, memo: route.sharedDepositMemo }));
  const readiness = inputs.length ? await prepareManualMonitoringReadiness(inputs) : new Map();
  for (const route of expected.values()) {
    if (readiness.has(route.id)) {
      const proof = readiness.get(route.id)!;
      try {
        if (!proof.ready) throw new ApiError("RPC_MONITORING_NOT_READY", `${proof.code}: ${proof.message}`, 409);
        await savePreparedMonitoringProof(route.id, proof, fence);
      } catch (error) { await fail(route.id, error); }
    }
    try {
      if (route.depositProvider !== "manual" || !blocked.has(route.id))
        await setEnabled(route.id, desired.get(route.id) === true, fence, readiness.get(route.id));
    } catch (error) {
      await fail(route.id, error);
      await setEnabled(route.id, false, fence);
    }
  }
  return db.select().from(routes).where(inArray(routes.id, input.networkIds));
  });
}

export async function previewRegisteredManualWallets(input: Input) {
  if (!input.networkIds.length || new Set(input.networkIds).size !== input.networkIds.length)
    throw new ApiError("VALIDATION_ERROR", "Select unique asset/network routes.", 400);
  const selected = await db.select().from(routes).where(inArray(routes.id, input.networkIds));
  if (selected.length !== input.networkIds.length) throw new ApiError("CRYPTO_ASSET_NETWORK_NOT_FOUND", "A selected route no longer exists.", 404);
  return Promise.all(selected.map(async route => {
    const address = input.walletAddress.trim() || route.sharedDepositAddress;
    const memo = input.memo === undefined ? route.sharedDepositMemo?.trim() || "" : input.memo?.trim() || "";
    validateManualWallet(route, address, memo);
    const config = await identity(db, route);
    return { ...route, sharedDepositAddress: address, sharedDepositMemo: memo || null,
      manualWalletRegistration: { status: config.message ? "BLOCKED" : "PLANNED", ready: false,
        address, monitorNetworkId: config.network?.id ?? null, monitorAssetId: config.asset?.id ?? null,
        targetId: null, sharedRouteCount: 0, message: config.message ||
          (route.depositProvider === "manual" ? "Save will register this wallet, activate RPC monitoring and verify live readiness before enabling deposits." :
            "Save will register this Manual wallet on standby without changing the active deposit provider.") } };
  }));
}
