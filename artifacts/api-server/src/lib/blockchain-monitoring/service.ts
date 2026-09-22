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
import verifiedRecurringBep20RecoverySql from "../../../../../lib/db/migrations/0098_recover_verified_bep20_usdt_payment.sql";

const ELIGIBLE = and(
  eq(ordersTable.type, "manual"),
  eq(ordersTable.fundingProviderSource, "manual"),
  eq(ordersTable.fundingStatus, "ready_manual"),
  eq(ordersTable.manualSettlementState, "awaiting_funds"),
);
let cycleRunning = false;
let recoveryMigration: Promise<void> | undefined;
const MONITOR_CYCLE_DEADLINE_MS = 90_000;
const NATIVE_SCAN_BLOCKS_PER_WATCH_CYCLE = 8;
const VERIFIED_RECEIPT_RECOVERY_REASON =
  "Verified receipt recovery; inactive to prevent unbounded rescanning.";
const networkConfigDigest = (
  network: typeof blockchainMonitorNetworksTable.$inferSelect,
  endpoint?: string,
  apiKey?: string,
) => {
  const hash = (value?: string) =>
    value ? createHash("sha256").update(value).digest("hex") : null;
  return createHash("sha256").update(JSON.stringify({
    id: network.id,
    networkCode: network.networkCode,
    adapterKind: network.adapterKind,
    providerKind: network.providerKind,
    chainId: network.chainId,
    enabled: network.enabled,
    endpointSecretRef: network.endpointSecretRef,
    apiKeySecretRef: network.apiKeySecretRef,
    endpointHash: hash(endpoint),
    apiKeyHash: hash(apiKey),
  })).digest("hex");
};

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

export function canApplyConfirmedMatchWatch(watch: {
  active: boolean;
  registrationState: string;
  registrationReason: string | null;
  startCursor: string | null;
  currentCursor: string | null;
}): boolean {
  if (watch.registrationState !== "active") return false;
  if (watch.active) return true;
  return watch.registrationReason === VERIFIED_RECEIPT_RECOVERY_REASON &&
    watch.startCursor === null &&
    watch.currentCursor === null;
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

export function selectReadyBlockchainMonitoringSetupRoutes<T extends {
  assetNetworkId: string;
  status: BlockchainMonitoringSetupStatus;
  monitorNetworkId?: string;
  monitorAssetId?: string;
}>(
  routes: readonly T[],
  selectedAssetNetworkIds?: readonly string[],
): { ready: T[]; skippedRoutes: number } {
  const selectedIds = selectedAssetNetworkIds ? new Set(selectedAssetNetworkIds) : null;
  const candidates = selectedIds
    ? routes.filter(route => selectedIds.has(route.assetNetworkId))
    : routes;
  const ready = candidates.filter(route =>
    route.status === "ready" &&
    Boolean(route.monitorNetworkId) &&
    Boolean(route.monitorAssetId),
  );
  return {
    ready,
    skippedRoutes: selectedIds
      ? selectedIds.size - ready.length
      : routes.length - ready.length,
  };
}

export function selectWatchScanCursor(currentCursor: string | null, startCursor: string | null): string | undefined {
  return currentCursor ?? startCursor ?? undefined;
}

export function boundedWatchScanEnd(
  from: string,
  head: string,
  identityKind: string,
  maxTokenRange = 1_000,
): string {
  const fromNumber = Number(from);
  const headNumber = Number(head);
  if (!Number.isSafeInteger(fromNumber) || !Number.isSafeInteger(headNumber)) return head;
  const maxOffset = identityKind === "native"
    ? NATIVE_SCAN_BLOCKS_PER_WATCH_CYCLE - 1
    : maxTokenRange;
  return String(Math.min(headNumber, fromNumber + maxOffset));
}

export function cursorAfterCapturedHead(head: string): string | undefined {
  return /^[0-9]+$/.test(head) ? (BigInt(head) + 1n).toString() : undefined;
}

export function evidenceWithinWatchCursor(
  startCursor: string | null,
  blockOrSlot: string,
): boolean {
  if (!startCursor) return false;
  if (!/^[0-9]+$/.test(startCursor) || !/^[0-9]+$/.test(blockOrSlot)) return false;
  return BigInt(blockOrSlot) >= BigInt(startCursor);
}

/** Creates the immutable watch from the order-time funding snapshot. */
export async function registerManualBlockchainWatch(
  orderId: string,
  options: { freshCursor?: boolean } = {},
): Promise<void> {
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
  const sourceRouteId = order.sourceSettlementOptionId?.startsWith("crypto:")
    ? order.sourceSettlementOptionId.slice("crypto:".length)
    : "";
  const [route] = await db.select({ route: cryptoAssetNetworksTable }).from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(sourceRouteId
      ? and(
          eq(cryptoAssetNetworksTable.id, sourceRouteId),
          eq(cryptoAssetNetworksTable.networkCode, networkCode),
        )
      : and(
          eq(cryptoAssetNetworksTable.networkCode, networkCode),
          sql`${cryptoAssetNetworksTable.assetId} = ${assetCode} or upper(${cryptoAssetsTable.code}) = upper(${assetCode})`,
        ))
    .limit(1);
  if (!route) { await persistGap("Asset network route is not configured."); return; }
  if (network.adapterKind === "evm" && (text(funding.memo) || order.depositMemo)) return;
  let startCursor = options.freshCursor ? null : network.lastHead;
  let registrationState: "active" | "pending_review" = "active";
  let registrationReason: string | null = null;
  if (!startCursor || options.freshCursor) {
    const config = adapterConfig(network);
    if (config) {
      try {
        const adapter = createBlockchainMonitorAdapter(config);
        const capturedHead = (await adapter.getHead()).cursor;
        startCursor = options.freshCursor
          ? cursorAfterCapturedHead(capturedHead) ?? null
          : capturedHead;
        if (!startCursor) {
          registrationState = "pending_review";
          registrationReason = "Provider cursor cannot be activated without explicit review.";
        }
        await db.update(blockchainMonitorNetworksTable).set({ lastHead: capturedHead })
          .where(and(eq(blockchainMonitorNetworksTable.id, network.id), isNull(blockchainMonitorNetworksTable.lastHead)));
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
  const [existingWatch] = await db.select().from(blockchainMonitorWatchesTable)
    .where(eq(blockchainMonitorWatchesTable.orderId, orderId)).limit(1);
  if (
    existingWatch &&
    options.freshCursor &&
    (existingWatch.registrationState === "pending_review" || !existingWatch.active)
  ) {
    if (!exactWatchMatchesOrderSnapshot(existingWatch, expectedWatch)) {
      await persistGap("WATCH_IDENTITY_MISMATCH");
      return;
    }
    if (registrationState === "active" && startCursor) {
      await db.update(blockchainMonitorWatchesTable).set({
        startCursor,
        currentCursor: startCursor,
        registrationState: "active",
        registrationReason: null,
        active: true,
      }).where(and(
        eq(blockchainMonitorWatchesTable.id, existingWatch.id),
        or(
          eq(blockchainMonitorWatchesTable.registrationState, "pending_review"),
          eq(blockchainMonitorWatchesTable.active, false),
        ),
      ));
    }
  }
  await db.insert(blockchainMonitorWatchesTable).values({
    ...expectedWatch,
    orderCreatedAt: order.createdAt, startCursor, currentCursor: startCursor,
    registrationState, registrationReason, active: registrationState === "active",
  }).onConflictDoNothing({ target: blockchainMonitorWatchesTable.orderId });
  const [storedWatch] = await db.select().from(blockchainMonitorWatchesTable).where(eq(blockchainMonitorWatchesTable.orderId, orderId)).limit(1);
  if (storedWatch?.registrationState === "pending_review") {
    await persistGap(registrationReason ?? "Watch requires explicit operator activation.");
  } else if (
    storedWatch?.registrationState === "active" &&
    storedWatch.active &&
    exactWatchMatchesOrderSnapshot(storedWatch, expectedWatch)
  ) {
    await db.update(blockchainMonitorRegistrationGapsTable).set({ resolvedAt: new Date() })
      .where(and(eq(blockchainMonitorRegistrationGapsTable.orderId, orderId), isNull(blockchainMonitorRegistrationGapsTable.resolvedAt)));
  } else if (storedWatch?.registrationState === "active") {
    await persistGap("WATCH_IDENTITY_MISMATCH");
  }
}

async function reconcileResolvableRegistrationGaps(): Promise<void> {
  const gaps = await db.select({ orderId: blockchainMonitorRegistrationGapsTable.orderId })
    .from(blockchainMonitorRegistrationGapsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, blockchainMonitorRegistrationGapsTable.orderId))
    .where(and(isNull(blockchainMonitorRegistrationGapsTable.resolvedAt), ELIGIBLE))
    .limit(100);
  for (const gap of gaps) {
    try {
      // Delayed registration starts from a fresh chain head. It must never
      // backdate a watch and attribute an older shared-address transfer.
      await registerManualBlockchainWatch(gap.orderId, { freshCursor: true });
    } catch (error) {
      logger.warn(
        { err: error, orderId: gap.orderId },
        "Manual blockchain registration gap reconciliation failed",
      );
    }
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
    maxRange: network.maxScanRange,
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
  const candidates = await db.select({ watch: blockchainMonitorWatchesTable })
    .from(blockchainMonitorWatchesTable)
    .innerJoin(ordersTable, eq(ordersTable.id, blockchainMonitorWatchesTable.orderId))
    .where(and(
      eq(blockchainMonitorWatchesTable.monitorNetworkId, network.id),
      eq(blockchainMonitorWatchesTable.monitorAssetId, asset.id),
      eq(blockchainMonitorWatchesTable.active, true),
      eq(blockchainMonitorWatchesTable.registrationState, "active"),
      ELIGIBLE,
    ));
  const matches = candidates.filter(({ watch }) => {
    return evidenceWithinWatchCursor(watch.startCursor, evidence.blockOrSlot) &&
      immutableIdentityMatches(watch, evidence) &&
      evidenceMeetsWatchTimeAndMemo(watch.orderCreatedAt, evidence.blockTimestamp, watch.memoOrTag, evidence.memoOrTag) &&
      watch.receivingAddress.trim().toLowerCase() === evidence.toAddress.trim().toLowerCase() &&
      exactAmountMatches(watch.expectedAmount, watch.decimals, evidence.rawAmount);
  }).map(({ watch }) => watch);
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
    await withLease(network.id, leaseToken, async (tx) => {
      await tx.update(blockchainMonitorObservationsTable).set({
        confirmations: status.confirmations, finalized: status.finalized,
        blockHash: status.blockHash ?? row.observation.blockHash,
        blockTimestamp: status.blockTimestamp ? new Date(status.blockTimestamp) : row.observation.blockTimestamp,
      }).where(eq(blockchainMonitorObservationsTable.id, row.observation.id));
      const invalid = !status.exists || !status.successful || !status.canonical;
      const [updatedMatch] = await tx.update(blockchainMonitorMatchesTable).set({
        confirmations: status.confirmations,
        state: invalid ? "needs_review" : row.match.state,
      }).where(and(
        eq(blockchainMonitorMatchesTable.id, row.match.id),
        eq(blockchainMonitorMatchesTable.state, row.match.state),
      )).returning({ id: blockchainMonitorMatchesTable.id });
      if (!invalid || !updatedMatch) return;
      const [order] = await tx.select().from(ordersTable)
        .where(eq(ordersTable.id, row.match.orderId)).limit(1);
      if (!order) return;
      if (row.match.state === "applied") {
        await updateOrderAndQueueStatusNotificationTx(tx, order, { status: "needs review" },
          and(eq(ordersTable.status, "processing"), eq(ordersTable.manualSettlementState, "funds_confirmed")),
          { action: "blockchain_monitoring.reorg_needs_review", details: { matchId: row.match.id } });
      } else {
        await updateOrderAndQueueStatusNotificationTx(tx, order, { status: "needs review" },
          and(eq(ordersTable.status, "payment detected"), eq(ordersTable.manualSettlementState, "awaiting_funds")),
          { action: "blockchain_monitoring.confirming_evidence_needs_review", details: { matchId: row.match.id } });
      }
    });
  }
}

export async function runBlockchainMonitoringCycle(): Promise<void> {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
  await reconcileResolvableRegistrationGaps();
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
    const baseConfig = adapterConfig(network);
    if (!baseConfig) {
      await releaseLease(network.id, leaseToken);
      continue;
    }
    const cycleDeadlineAt = Date.now() + MONITOR_CYCLE_DEADLINE_MS;
    const config = {
      ...baseConfig,
      deadlineAtMs: cycleDeadlineAt,
      rpcTrace: (event: {
        networkCode: string;
        method: string;
        startedAt: string;
        completedAt?: string;
        durationMs?: number;
        timeoutMs: number;
        outcome: "started" | "success" | "failure" | "timeout";
        errorCategory?: string;
      }) => {
        const details = {
          networkCode: event.networkCode,
          rpcMethod: event.method,
          startedAt: event.startedAt,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          requestTimeoutMs: event.timeoutMs,
          outcome: event.outcome,
          errorCategory: event.errorCategory,
        };
        if (event.outcome === "success" || event.outcome === "started") {
          logger.info(details, `Blockchain RPC request ${event.outcome}`);
        } else {
          logger.warn(details, "Blockchain RPC request completed");
        }
      },
    };
    let leaseLost = false;
    const heartbeat = setInterval(() => {
      if (Date.now() >= cycleDeadlineAt) {
        leaseLost = true;
        return;
      }
      void db.update(blockchainMonitorNetworksTable).set({ leaseExpiresAt: new Date(Date.now() + 30_000) })
        .where(and(eq(blockchainMonitorNetworksTable.id, network.id), eq(blockchainMonitorNetworksTable.leaseToken, leaseToken), sql`${blockchainMonitorNetworksTable.leaseExpiresAt} > now()`))
        .returning({ id: blockchainMonitorNetworksTable.id })
        .then((renewed) => {
          if (!renewed.length) leaseLost = true;
        })
        .catch((error) => {
          leaseLost = true;
          logger.warn(
            { err: error, networkId: network.id },
            "Blockchain monitoring lease heartbeat failed",
          );
        });
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
        if (
          /^[0-9]+$/.test(from) &&
          /^[0-9]+$/.test(head.cursor) &&
          BigInt(from) > BigInt(head.cursor)
        ) continue;
        const boundedTo = boundedWatchScanEnd(
          from,
          head.cursor,
          watch.identityKind,
          network.maxScanRange,
        );
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
      const checkedAt = new Date();
      const legacyBep20 = /^(?:BSC|BEP20|BSC_BEP20)$/i.test(network.networkCode);
      const healthProofConfig = legacyBep20 ? undefined : adapterConfig(network);
      await withLease(network.id, leaseToken, (tx) => tx.update(blockchainMonitorNetworksTable).set({
        lastHead: head.cursor,
        healthStatus: "connected",
        healthCheckedAt: checkedAt,
        consecutiveFailures: 0,
        nextAttemptAt: null,
        healthError: null,
        ...(legacyBep20 || !healthProofConfig ? {} : {
          healthProofFingerprint: networkConfigDigest(network, healthProofConfig.endpoint, healthProofConfig.apiKey),
          healthProofCapturedAt: checkedAt,
        }),
      }).where(eq(blockchainMonitorNetworksTable.id, network.id)));
    } catch (error) {
      try {
        await withLease(network.id, leaseToken, (tx) => tx.update(blockchainMonitorNetworksTable).set({
          healthStatus: "disconnected", healthCheckedAt: new Date(),
          consecutiveFailures: sql`${blockchainMonitorNetworksTable.consecutiveFailures} + 1`,
          nextAttemptAt: new Date(Date.now() + Math.min(15 * 60_000, 5_000 * 2 ** Math.min(network.consecutiveFailures, 8))),
          healthError: error instanceof Error ? error.message.slice(0, 500) : "Provider error",
        }).where(eq(blockchainMonitorNetworksTable.id, network.id)));
      } catch (leaseError) {
        logger.warn(
          { err: leaseError, networkId: network.id },
          "Blockchain monitoring failure could not update health after lease loss",
        );
      }
    } finally {
      clearInterval(heartbeat);
      await releaseLease(network.id, leaseToken).catch((error) => {
        logger.warn(
          { err: error, networkId: network.id },
          "Blockchain monitoring lease release failed",
        );
      });
    }
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
      const [watch] = await tx.select().from(blockchainMonitorWatchesTable)
        .where(eq(blockchainMonitorWatchesTable.id, match.watchId)).limit(1);
      if (
        !watch ||
        !canApplyConfirmedMatchWatch(watch) ||
        watch.orderId !== match.orderId
      ) {
        await tx.update(blockchainMonitorMatchesTable).set({
          state: "needs_review",
          ambiguityReason: "The payment match watch is not actively registered.",
        }).where(and(
          eq(blockchainMonitorMatchesTable.id, match.id),
          eq(blockchainMonitorMatchesTable.state, "confirming"),
        ));
        return;
      }
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
      await tx.update(blockchainMonitorWatchesTable).set({ active: false })
        .where(and(
          eq(blockchainMonitorWatchesTable.id, watch.id),
          eq(blockchainMonitorWatchesTable.active, true),
        ));
      const [verifiedTransaction] = await tx.select({
        transactionHash: blockchainMonitorObservationsTable.transactionHash,
        explorerUrlTemplate: cryptoAssetNetworksTable.explorerUrlTemplate,
      }).from(blockchainMonitorObservationsTable)
        .innerJoin(
          blockchainMonitorWatchesTable,
          eq(blockchainMonitorWatchesTable.id, watch.id),
        )
        .innerJoin(
          cryptoAssetNetworksTable,
          eq(cryptoAssetNetworksTable.id, blockchainMonitorWatchesTable.assetNetworkId),
        )
        .where(eq(blockchainMonitorObservationsTable.id, observation.id))
        .limit(1);
      await enqueueSwapTelegramNotification(tx, order, "payment_received", {
        amount: order.amount, asset: order.fromAsset, network: order.fromNetwork,
      }, verifiedTransaction?.transactionHash ? verifiedTransaction : undefined);
    });
  }
}

export function startBlockchainMonitoringWorker(): () => void {
  const applyRecoveryMigration = (): Promise<void> => {
    if (!recoveryMigration) {
      recoveryMigration = db.transaction(async (tx) => {
        await tx.execute(sql.raw(verifiedRecurringBep20RecoverySql));
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