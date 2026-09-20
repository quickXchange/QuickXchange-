import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  blockchainMonitorAssetsTable,
  blockchainMonitorMatchesTable,
  blockchainMonitorNetworksTable,
  blockchainMonitorObservationsTable,
  blockchainMonitorWatchesTable,
  blockchainMonitorRegistrationGapsTable,
  cryptoAssetsTable,
  cryptoAssetNetworksTable,
  db,
  ordersTable,
} from "@workspace/db";
import { randomUUID, createHash } from "node:crypto";
import { createBlockchainMonitorAdapter, type IncomingEvidence, type MonitorAsset, type WatchedAddress } from "./index";
import { normalizeTronAddress } from "./tron";
import { enqueueSwapTelegramNotification } from "../telegram-swap-notifications";
import { updateOrderAndQueueStatusNotificationTx } from "../customer-status-notifications";
import { logger } from "../logger";
import verifiedBep20RecoverySql from "../../../../../lib/db/migrations/0089_recover_verified_bep20_usdt_payment.sql";

const ELIGIBLE = and(
  eq(ordersTable.type, "manual"),
  eq(ordersTable.fundingProviderSource, "manual"),
  eq(ordersTable.fundingStatus, "ready_manual"),
  eq(ordersTable.manualSettlementState, "awaiting_funds"),
);
let cycleRunning = false;
let recoveryMigration: Promise<void> | undefined;

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

function rawAmount(amount: string, decimals: number): bigint | undefined {
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(amount)) return undefined;
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals || BigInt(whole) < 0n) return undefined;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function exactAmountMatches(expectedAmount: string, decimals: number, observedRawAmount: string): boolean {
  const expected = rawAmount(expectedAmount, decimals);
  return expected !== undefined && /^[0-9]+$/.test(observedRawAmount) && expected.toString() === observedRawAmount;
}

export function evidenceMeetsWatchTimeAndMemo(
  orderCreatedAt: Date,
  blockTimestamp: string | undefined,
  expectedMemo: string | null,
  actualMemo: string | undefined,
): boolean {
  if (!blockTimestamp || new Date(blockTimestamp).getTime() < orderCreatedAt.getTime()) return false;
  return !expectedMemo || (Boolean(actualMemo) && expectedMemo === actualMemo);
}

export function isFinalitySatisfied(policy: string, confirmations: number, required: number, finalized: boolean): boolean {
  return policy === "finalized" ? finalized : confirmations >= required;
}

export function immutableIdentityMatches(
  watch: { identityKind: string; contractOrMint: string | null; decimals: number },
  evidence: { identityKind?: string; contractOrMint?: string; decimals: number },
): boolean {
  const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
  return watch.identityKind === evidence.identityKind &&
    normalize(watch.contractOrMint) === normalize(evidence.contractOrMint) &&
    watch.decimals === evidence.decimals;
}

export type BlockchainMonitoringSetupStatus =
  | "ready"
  | "missing_rpc"
  | "missing_contract_or_mint"
  | "disabled";

export function deriveBlockchainMonitoringSetupStatus(input: {
  catalogEnabled: boolean;
  catalogActive: boolean;
  networkConfigured: boolean;
  identityKind?: string | null;
  contractOrMint?: string | null;
}): BlockchainMonitoringSetupStatus {
  if (!input.catalogEnabled || !input.catalogActive) return "disabled";
  if (!input.networkConfigured) return "missing_rpc";
  if (
    input.identityKind !== "native" &&
    (input.identityKind !== "token" || !input.contractOrMint?.trim())
  ) return "missing_contract_or_mint";
  return "ready";
}

export function selectWatchScanCursor(currentCursor: string | null, startCursor: string | null): string | undefined {
  return currentCursor ?? startCursor ?? undefined;
}

/** Creates the immutable watch from the order-time funding snapshot. */
export async function registerManualBlockchainWatch(orderId: string): Promise<void> {
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), ELIGIBLE)).limit(1);
  if (!order) return;
  const funding = object(order.fundingDetailsSnapshot);
  const networkCode = text(funding.networkCode) || text(funding.network) || order.fromNetwork;
  const rawAddress = text(funding.address) || order.depositAddress;
  const assetCode = text(funding.assetCode) || text(funding.asset) || order.fromAsset;
  const persistGap = async (reason: string) => {
    await db.insert(blockchainMonitorRegistrationGapsTable).values({ orderId, networkCode, assetCode, receivingAddress: rawAddress, reason })
      .onConflictDoUpdate({ target: blockchainMonitorRegistrationGapsTable.orderId, set: { reason, resolvedAt: null } });
  };
  const [network] = await db.select().from(blockchainMonitorNetworksTable)
    .where(eq(blockchainMonitorNetworksTable.networkCode, networkCode)).limit(1);
  if (!network) { await persistGap("Monitoring network is not configured."); return; }
  const address = network.adapterKind === "tron" ? normalizeTronAddress(rawAddress) : rawAddress;
  if (!address) return;
  const [route] = await db.select({ route: cryptoAssetNetworksTable }).from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(and(eq(cryptoAssetNetworksTable.networkCode, networkCode), sql`${cryptoAssetNetworksTable.assetId} = ${assetCode} or upper(${cryptoAssetsTable.code}) = upper(${assetCode})`)).limit(1);
  if (!route) { await persistGap("Asset network route is not configured."); return; }
  if (network.adapterKind === "evm" && (text(funding.memo) || order.depositMemo)) return;
  let startCursor = network.lastHead;
  let registrationState: "active" | "pending_review" = "active";
  let registrationReason: string | null = null;
  if (!startCursor) {
    const config = adapterConfig(network);
    if (config) {
      try {
        const adapter = createBlockchainMonitorAdapter(config);
        startCursor = (await adapter.getHead()).cursor;
        await db.update(blockchainMonitorNetworksTable).set({ lastHead: startCursor }).where(and(eq(blockchainMonitorNetworksTable.id, network.id), isNull(blockchainMonitorNetworksTable.lastHead)));
      } catch {
        registrationState = "pending_review";
        registrationReason = "Provider head could not be captured before order response.";
      }
    } else {
      registrationState = "pending_review";
      registrationReason = "Monitoring provider is not configured.";
    }
  }
  const [asset] = await db.select().from(blockchainMonitorAssetsTable)
    .where(and(eq(blockchainMonitorAssetsTable.monitorNetworkId, network.id), eq(blockchainMonitorAssetsTable.assetNetworkId, route.route.id), eq(blockchainMonitorAssetsTable.enabled, true))).limit(1);
  if (!asset) { await persistGap("Exact monitor asset identity is not configured."); return; }
  const expectedWatch = {
    orderId, monitorNetworkId: network.id, monitorAssetId: asset.id, assetNetworkId: route.route.id,
    expectedAmount: order.amount, receivingAddress: address, memoOrTag: text(funding.memo) || order.depositMemo || null,
    identityKind: asset.identityKind,
    contractOrMint: network.adapterKind === "tron" && asset.contractOrMint ? normalizeTronAddress(asset.contractOrMint) : asset.contractOrMint,
    decimals: asset.decimals, orderCreatedAt: order.createdAt,
  };
  await db.insert(blockchainMonitorWatchesTable).values({
    ...expectedWatch,
    orderCreatedAt: order.createdAt, startCursor, currentCursor: startCursor, registrationState, registrationReason,
  }).onConflictDoNothing({ target: blockchainMonitorWatchesTable.orderId });
  const [storedWatch] = await db.select().from(blockchainMonitorWatchesTable).where(eq(blockchainMonitorWatchesTable.orderId, orderId)).limit(1);
  if (storedWatch?.registrationState === "pending_review") {
    await persistGap(registrationReason ?? "Watch requires explicit operator activation.");
  } else if (storedWatch?.registrationState === "active" && exactWatchMatchesOrderSnapshot(storedWatch, expectedWatch)) {
    await db.update(blockchainMonitorRegistrationGapsTable).set({ resolvedAt: new Date() })
      .where(and(eq(blockchainMonitorRegistrationGapsTable.orderId, orderId), isNull(blockchainMonitorRegistrationGapsTable.resolvedAt)));
  } else if (storedWatch?.registrationState === "active") {
    await persistGap("WATCH_IDENTITY_MISMATCH");
  }
}

export function canResolveRegistrationGap(watchState: string | null | undefined, transitionedToActive: boolean): boolean {
  return watchState === "active" && transitionedToActive;
}

export function exactWatchMatchesOrderSnapshot(watch: {
  orderId: string; monitorNetworkId: string; monitorAssetId: string; assetNetworkId: string; expectedAmount: string;
  receivingAddress: string; memoOrTag: string | null; identityKind: string; contractOrMint: string | null; decimals: number; orderCreatedAt: Date;
}, expected: Omit<typeof watch, "orderId"> & { orderId: string }): boolean {
  return watch.orderId === expected.orderId && watch.monitorNetworkId === expected.monitorNetworkId &&
    watch.monitorAssetId === expected.monitorAssetId && watch.assetNetworkId === expected.assetNetworkId &&
    watch.expectedAmount === expected.expectedAmount && watch.receivingAddress === expected.receivingAddress &&
    watch.memoOrTag === expected.memoOrTag && watch.identityKind === expected.identityKind &&
    watch.contractOrMint === expected.contractOrMint && watch.decimals === expected.decimals &&
    watch.orderCreatedAt.getTime() === expected.orderCreatedAt.getTime();
}

export function adapterConfig(network: typeof blockchainMonitorNetworksTable.$inferSelect) {
  if (network.finalityPolicy === "finalized" && network.adapterKind === "evm") return undefined;
  const endpoint = network.endpointSecretRef ? process.env[network.endpointSecretRef] : undefined;
  const apiKey = network.apiKeySecretRef ? process.env[network.apiKeySecretRef] : undefined;
  if (!endpoint || (network.providerKind !== "none" && !endpoint)) return undefined;
  return {
    networkCode: network.networkCode,
    provider: network.providerKind as "rpc" | "indexer",
    adapterKind: network.adapterKind as "evm" | "tron" | "solana",
    chainId: network.chainId ?? undefined,
    endpoint,
    apiKey,
    confirmationsRequired: network.confirmationsRequired,
  };
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function withLease<T>(networkId: string, leaseToken: string, work: (tx: DbTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const [lease] = await tx.select({ token: blockchainMonitorNetworksTable.leaseToken, expires: blockchainMonitorNetworksTable.leaseExpiresAt })
      .from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, networkId)).for("update");
    if (!lease || lease.token !== leaseToken || !lease.expires || lease.expires <= new Date()) throw new Error("Blockchain monitoring lease was lost.");
    return work(tx);
  });
}
async function releaseLease(networkId: string, leaseToken: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [lease] = await tx.select({ token: blockchainMonitorNetworksTable.leaseToken, expires: blockchainMonitorNetworksTable.leaseExpiresAt })
      .from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, networkId)).for("update");
    if (!lease || lease.token !== leaseToken || !lease.expires || lease.expires <= new Date()) return;
    await tx.update(blockchainMonitorNetworksTable).set({ leaseToken: null, leaseExpiresAt: null }).where(eq(blockchainMonitorNetworksTable.id, networkId));
  });
}

async function persistEvidence(network: typeof blockchainMonitorNetworksTable.$inferSelect, leaseToken: string, evidence: IncomingEvidence): Promise<void> {
  const [asset] = await db.select().from(blockchainMonitorAssetsTable)
    .where(and(eq(blockchainMonitorAssetsTable.monitorNetworkId, network.id), eq(blockchainMonitorAssetsTable.id, evidence.assetId))).limit(1);
  if (!asset) return;
  let [observation] = await withLease(network.id, leaseToken, (tx) => tx.insert(blockchainMonitorObservationsTable).values({
    monitorNetworkId: network.id, monitorAssetId: asset.id, transactionHash: evidence.transactionHash,
    eventIndex: evidence.eventId, fromAddress: evidence.fromAddress, toAddress: evidence.toAddress,
    amount: evidence.rawAmount, blockReference: evidence.blockOrSlot, blockHash: evidence.blockHash,
    blockTimestamp: evidence.blockTimestamp ? new Date(evidence.blockTimestamp) : null,
    confirmations: Number(evidence.confirmations ?? 0), finalized: false,
    rawPayload: evidence as unknown as Record<string, unknown>,
    payloadDigest: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
  }).onConflictDoNothing().returning());
  if (!observation) {
    const existing = await withLease(network.id, leaseToken, async (tx) => {
      const [found] = await tx.select().from(blockchainMonitorObservationsTable).where(and(
        eq(blockchainMonitorObservationsTable.monitorNetworkId, network.id),
        eq(blockchainMonitorObservationsTable.monitorAssetId, evidence.assetId),
        eq(blockchainMonitorObservationsTable.transactionHash, evidence.transactionHash),
        eq(blockchainMonitorObservationsTable.eventIndex, evidence.eventId),
      )).limit(1);
      if (found) {
        await tx.update(blockchainMonitorObservationsTable).set({ confirmations: Number(evidence.confirmations ?? found.confirmations), finalized: false }).where(eq(blockchainMonitorObservationsTable.id, found.id));
        await tx.update(blockchainMonitorMatchesTable).set({ confirmations: Number(evidence.confirmations ?? found.confirmations) }).where(eq(blockchainMonitorMatchesTable.observationId, found.id));
      }
      return found;
    });
    if (existing) {
      observation = existing;
    } else return;
  }
  const candidates = await db.select().from(blockchainMonitorWatchesTable).where(and(
    eq(blockchainMonitorWatchesTable.monitorNetworkId, network.id),
    eq(blockchainMonitorWatchesTable.monitorAssetId, asset.id),
    eq(blockchainMonitorWatchesTable.active, true),
  ));
  const matches = candidates.filter((watch) => {
    return immutableIdentityMatches(watch, evidence) &&
      evidenceMeetsWatchTimeAndMemo(watch.orderCreatedAt, evidence.blockTimestamp, watch.memoOrTag, evidence.memoOrTag) &&
      watch.receivingAddress.trim().toLowerCase() === evidence.toAddress.trim().toLowerCase() &&
      exactAmountMatches(watch.expectedAmount, watch.decimals, evidence.rawAmount);
  });
  if (!matches.length) return;
  const state = matches.length === 1 ? "confirming" : "needs_review";
  const watch = matches[0]!;
  await withLease(network.id, leaseToken, (tx) => tx.insert(blockchainMonitorMatchesTable).values(matches.map((candidate) => ({
    watchId: candidate.id, observationId: observation.id, orderId: candidate.orderId, state,
    confirmations: Number(evidence.confirmations ?? 0), confirmationsRequired: network.confirmationsRequired,
    ambiguityReason: matches.length > 1 ? "Multiple active Manual Swap watches matched the same exact payment." : null,
    matchBasis: { asset: candidate.assetNetworkId, address: candidate.receivingAddress, amount: evidence.rawAmount, transactionHash: evidence.transactionHash },
  }))).onConflictDoNothing());
  if (state === "confirming") {
    await withLease(network.id, leaseToken, async (tx) => {
      const [current] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, watch.orderId), ELIGIBLE)).limit(1);
      if (!current) return;
      await updateOrderAndQueueStatusNotificationTx(tx, current, { status: "payment detected" },
        eq(ordersTable.status, "awaiting funds"), { action: "blockchain_monitoring.payment_detected" });
    });
  }
}

async function refreshConfirming(network: typeof blockchainMonitorNetworksTable.$inferSelect, leaseToken: string): Promise<void> {
  const rows = await db.select({ match: blockchainMonitorMatchesTable, observation: blockchainMonitorObservationsTable })
    .from(blockchainMonitorMatchesTable)
    .innerJoin(blockchainMonitorObservationsTable, eq(blockchainMonitorObservationsTable.id, blockchainMonitorMatchesTable.observationId))
    .where(and(inArray(blockchainMonitorMatchesTable.state, ["confirming", "applied"]), or(eq(blockchainMonitorMatchesTable.state, "confirming"), gte(blockchainMonitorMatchesTable.appliedAt, new Date(Date.now() - 60 * 60_000))), eq(blockchainMonitorObservationsTable.monitorNetworkId, network.id)));
  const config = adapterConfig(network);
  if (!config) return;
  const adapter = createBlockchainMonitorAdapter(config);
  for (const row of rows) {
    const [lease] = await db.select({ token: blockchainMonitorNetworksTable.leaseToken, expires: blockchainMonitorNetworksTable.leaseExpiresAt })
      .from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, network.id)).limit(1);
    if (!lease || lease.token !== leaseToken || !lease.expires || lease.expires <= new Date()) return;
    const evidence: IncomingEvidence = {
      eventId: row.observation.eventIndex, transactionHash: row.observation.transactionHash,
      networkCode: network.networkCode, assetId: row.observation.monitorAssetId, assetSymbol: "",
      toAddress: row.observation.toAddress, rawAmount: row.observation.amount, blockOrSlot: row.observation.blockReference ?? "0",
      decimals: 0,
      blockHash: row.observation.blockHash ?? undefined, blockTimestamp: row.observation.blockTimestamp?.toISOString(),
      detectedAt: row.observation.observedAt.toISOString(), source: "evm-json-rpc",
    };
    const status = await adapter.getEvidenceStatus(evidence);
    await withLease(network.id, leaseToken, (tx) => tx.update(blockchainMonitorObservationsTable).set({
      confirmations: status.confirmations, finalized: status.finalized,
      blockHash: status.blockHash ?? row.observation.blockHash,
      blockTimestamp: status.blockTimestamp ? new Date(status.blockTimestamp) : row.observation.blockTimestamp,
    }).where(eq(blockchainMonitorObservationsTable.id, row.observation.id)));
    await withLease(network.id, leaseToken, (tx) => tx.update(blockchainMonitorMatchesTable).set({
      confirmations: status.confirmations,
      state: !status.exists || !status.successful || !status.canonical ? "needs_review" : row.match.state,
    }).where(and(eq(blockchainMonitorMatchesTable.id, row.match.id), inArray(blockchainMonitorMatchesTable.state, ["confirming", "applied"]))));
    if ((!status.exists || !status.successful || !status.canonical) && row.match.state === "applied") {
      await withLease(network.id, leaseToken, async (tx) => {
        const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, row.match.orderId)).limit(1);
        if (!order) return;
        await updateOrderAndQueueStatusNotificationTx(tx, order, { status: "needs review" },
          and(eq(ordersTable.status, "processing"), eq(ordersTable.manualSettlementState, "funds_confirmed")),
          { action: "blockchain_monitoring.reorg_needs_review", details: { matchId: row.match.id } });
      });
    }
  }
}

export async function runBlockchainMonitoringCycle(): Promise<void> {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
  const networks = await db.select().from(blockchainMonitorNetworksTable)
    .where(and(eq(blockchainMonitorNetworksTable.enabled, true), inArray(blockchainMonitorNetworksTable.providerKind, ["rpc", "indexer"]), or(isNull(blockchainMonitorNetworksTable.nextAttemptAt), lte(blockchainMonitorNetworksTable.nextAttemptAt, new Date()))));
  for (const network of networks) {
    const leaseToken = randomUUID();
    const [leased] = await db.update(blockchainMonitorNetworksTable).set({
      leaseToken, leaseExpiresAt: new Date(Date.now() + 30_000),
    }).where(and(
      eq(blockchainMonitorNetworksTable.id, network.id),
      or(isNull(blockchainMonitorNetworksTable.leaseExpiresAt), lt(blockchainMonitorNetworksTable.leaseExpiresAt, new Date())),
    )).returning();
    if (!leased) continue;
    const config = adapterConfig(network);
    if (!config) {
      await releaseLease(network.id, leaseToken);
      continue;
    }
    let leaseLost = false;
    const heartbeat = setInterval(async () => {
      const renewed = await db.update(blockchainMonitorNetworksTable).set({ leaseExpiresAt: new Date(Date.now() + 30_000) })
        .where(and(eq(blockchainMonitorNetworksTable.id, network.id), eq(blockchainMonitorNetworksTable.leaseToken, leaseToken), sql`${blockchainMonitorNetworksTable.leaseExpiresAt} > now()`)).returning({ id: blockchainMonitorNetworksTable.id });
      if (!renewed.length) leaseLost = true;
    }, 10_000);
    heartbeat.unref();
    try {
      const adapter = createBlockchainMonitorAdapter(config);
      if (leaseLost) throw new Error("Blockchain monitoring lease was lost.");
      const watches = await db.select().from(blockchainMonitorWatchesTable)
        .where(and(eq(blockchainMonitorWatchesTable.monitorNetworkId, network.id), eq(blockchainMonitorWatchesTable.active, true), eq(blockchainMonitorWatchesTable.registrationState, "active")));
      const connection = await adapter.testConnection();
      if (network.chainId && connection.chainId?.toLowerCase() !== network.chainId.toLowerCase()) {
        throw new Error("Configured blockchain network identity did not match provider.");
      }
      const head = await adapter.getHead();
      for (const watch of watches) {
        const watched: WatchedAddress[] = [{
          address: watch.receivingAddress, memoOrTag: undefined,
          assets: [{ assetId: watch.monitorAssetId, symbol: watch.assetNetworkId, kind: watch.identityKind as "native" | "token", contractOrMint: watch.contractOrMint ?? undefined, decimals: watch.decimals }],
        }];
        const from = selectWatchScanCursor(watch.currentCursor, watch.startCursor);
        if (!from) continue;
        const boundedTo = Number.isSafeInteger(Number(from)) && Number.isSafeInteger(Number(head.cursor))
          ? String(Math.min(Number(head.cursor), Number(from) + 1_000)) : head.cursor;
        const result = await adapter.scanIncoming({ from, to: boundedTo }, watched);
        for (const evidence of result.evidence) {
        if (leaseLost) throw new Error("Blockchain monitoring lease was lost.");
        const block = Number(evidence.blockOrSlot);
        const headNumber = Number(head.cursor);
        const confirmations = Number.isSafeInteger(block) && Number.isSafeInteger(headNumber) && headNumber >= block
          ? String(headNumber - block + 1)
          : evidence.confirmations;
        await persistEvidence(network, leaseToken, { ...evidence, confirmations });
        }
        if (leaseLost) throw new Error("Blockchain monitoring lease was lost.");
      await withLease(network.id, leaseToken, async (tx) => {
          const [guard] = await tx.select({ token: blockchainMonitorNetworksTable.leaseToken, expires: blockchainMonitorNetworksTable.leaseExpiresAt }).from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, network.id)).for("update");
          if (!guard || guard.token !== leaseToken || !guard.expires || guard.expires <= new Date()) throw new Error("Blockchain monitoring lease was lost.");
          await tx.update(blockchainMonitorWatchesTable).set({ currentCursor: result.cursor.to }).where(and(eq(blockchainMonitorWatchesTable.id, watch.id), eq(blockchainMonitorWatchesTable.currentCursor, from)));
        });
      }
      await refreshConfirming(network, leaseToken);
      await applyConfirmedMatches(leaseToken, network.id);
      await withLease(network.id, leaseToken, (tx) => tx.update(blockchainMonitorNetworksTable).set({ lastHead: head.cursor, healthStatus: "connected", healthCheckedAt: new Date(), consecutiveFailures: 0, nextAttemptAt: null, healthError: null }).where(eq(blockchainMonitorNetworksTable.id, network.id)));
    } catch (error) {
      await withLease(network.id, leaseToken, (tx) => tx.update(blockchainMonitorNetworksTable).set({
        healthStatus: "disconnected", healthCheckedAt: new Date(),
        consecutiveFailures: sql`${blockchainMonitorNetworksTable.consecutiveFailures} + 1`,
        nextAttemptAt: new Date(Date.now() + Math.min(15 * 60_000, 5_000 * 2 ** Math.min(network.consecutiveFailures, 8))),
        healthError: error instanceof Error ? error.message.slice(0, 500) : "Provider error",
      }).where(eq(blockchainMonitorNetworksTable.id, network.id)));
    }
    clearInterval(heartbeat);
    await releaseLease(network.id, leaseToken);
  }
  } finally {
    cycleRunning = false;
  }
}

export async function applyConfirmedMatches(leaseToken?: string, networkId?: string): Promise<void> {
  const matches = await db.select().from(blockchainMonitorMatchesTable).where(eq(blockchainMonitorMatchesTable.state, "confirming"));
  for (const match of matches) {
    if (leaseToken && networkId) {
      const [lease] = await db.select({ token: blockchainMonitorNetworksTable.leaseToken, expires: blockchainMonitorNetworksTable.leaseExpiresAt })
        .from(blockchainMonitorNetworksTable).where(and(eq(blockchainMonitorNetworksTable.id, networkId), eq(blockchainMonitorNetworksTable.leaseToken, leaseToken))).limit(1);
      if (!lease || !lease.expires || lease.expires <= new Date()) return;
      const [observation] = await db.select({ networkId: blockchainMonitorObservationsTable.monitorNetworkId })
        .from(blockchainMonitorObservationsTable).where(eq(blockchainMonitorObservationsTable.id, match.observationId)).limit(1);
      if (!observation || observation.networkId !== networkId) continue;
    }
    const [observation] = await db.select().from(blockchainMonitorObservationsTable).where(eq(blockchainMonitorObservationsTable.id, match.observationId)).limit(1);
    const [network] = observation ? await db.select().from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, observation.monitorNetworkId)).limit(1) : [];
    if (!observation || !network || !isFinalitySatisfied(network.finalityPolicy, match.confirmations, match.confirmationsRequired, observation.finalized)) continue;
    if (!leaseToken || !networkId) continue;
    await withLease(networkId, leaseToken, async (tx) => {
      let [current] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, match.orderId), ELIGIBLE)).limit(1);
      if (!current) return;
      if (current.status === "awaiting funds") {
        const detected = await updateOrderAndQueueStatusNotificationTx(tx, current, {
          status: "payment detected",
        }, eq(ordersTable.status, "awaiting funds"), {
          action: "blockchain_monitoring.payment_detected",
          details: { observationId: observation.id, recovery: true },
        });
        if (!detected) return;
        current = detected;
      }
      const order = await updateOrderAndQueueStatusNotificationTx(tx, current, {
        status: "processing", manualSettlementState: "funds_confirmed",
        manualSettlementStateUpdatedAt: new Date(), manualSettlementFundedAt: new Date(),
        incomingTransactionReference: match.observationId,
      }, and(eq(ordersTable.status, "payment detected"), eq(ordersTable.manualSettlementState, "awaiting_funds")), {
        action: "blockchain_monitoring.funds_confirmed",
      });
      if (!order) return;
      await tx.update(blockchainMonitorMatchesTable).set({ state: "applied", appliedAt: new Date() }).where(eq(blockchainMonitorMatchesTable.id, match.id));
      await enqueueSwapTelegramNotification(tx, order, "payment_received", {
        amount: order.amount, asset: order.fromAsset, network: order.fromNetwork,
      });
    });
  }
}

export function startBlockchainMonitoringWorker(): () => void {
  const applyRecoveryMigration = (): Promise<void> => {
    if (!recoveryMigration) {
      recoveryMigration = db.transaction(async (tx) => {
        await tx.execute(sql.raw(verifiedBep20RecoverySql));
      }).then(() => undefined).catch((error) => {
        recoveryMigration = undefined;
        throw error;
      });
    }
    return recoveryMigration;
  };
  const runSafely = () => void applyRecoveryMigration().then(runBlockchainMonitoringCycle).catch((error) => {
    logger.warn({ err: error }, "Blockchain monitoring worker failed");
  });
  const interval = setInterval(runSafely, 15_000);
  interval.unref();
  runSafely();
  return () => clearInterval(interval);
}