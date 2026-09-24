import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  blockchainMonitorAssetsTable,
  blockchainMonitorMatchesTable,
  blockchainMonitorNetworksTable,
  blockchainMonitorObservationsTable,
  blockchainMonitorWatchesTable,
  blockchainMonitorRegistrationGapsTable,
  cryptoAssetsTable,
  cryptoAssetNetworksTable,
  databasePoolTelemetry,
  db,
  ordersTable,
} from "@workspace/db";
import { randomUUID, createHash } from "node:crypto";
import { createBlockchainMonitorAdapter, type IncomingEvidence, type MonitorAsset, type ScanCursor, type WatchedAddress } from "./index";
import { normalizeTronAddress, TRON_MAINNET_CHAIN_ID } from "./tron";
import { enqueueSwapTelegramNotification } from "../telegram-swap-notifications";
import { updateOrderAndQueueStatusNotificationTx } from "../customer-status-notifications";
import { logger } from "../logger";
import {
  isValidManualMonitoringTokenIdentity,
  isLegacyBep20Network,
  manualMonitoringNetworkConfigDigest,
  manualMonitoringProofFingerprint,
  usesLegacyBep20Readiness,
} from "../manual-monitoring-readiness";
import { isManualMonitoringRuntimeReady, signedCryptoRouteId } from "../manual-crypto";
import { isSyntacticallyValidManualWalletAddress, isSyntacticallyValidManualWalletMemo } from "../manual-wallet-validation";
import verifiedRecurringBep20RecoverySql from "../../../../../lib/db/migrations/0098_recover_verified_bep20_usdt_payment.sql";

const ELIGIBLE = and(
  eq(ordersTable.type, "manual"),
  or(
    eq(ordersTable.fundingProviderSource, "manual"),
    and(
      eq(ordersTable.fundingProviderSource, "whitebit"),
      eq(ordersTable.providerState, "whitebit_fallback"),
      sql`${ordersTable.fundingDetailsSnapshot} ->> 'addressSource' = 'manual_fallback'`,
    ),
  ),
  eq(ordersTable.fundingStatus, "ready_manual"),
  eq(ordersTable.manualSettlementState, "awaiting_funds"),
);
let cycleRunning = false;
let recoveryMigration: Promise<void> | undefined;
const MONITOR_CYCLE_DEADLINE_MS = 90_000;
const NATIVE_SCAN_BLOCKS_PER_WATCH_CYCLE = 8;
export const MAX_CATCH_UP_RANGES_PER_WATCH_CYCLE = 16;
const MAX_CONFIRMING_REFRESHES_PER_CYCLE = 75;
const MAX_APPLIED_REFRESHES_PER_CYCLE = 25;
const MAX_MATCH_APPLICATIONS_PER_CYCLE = 100;
const CATCH_UP_DEADLINE_GUARD_MS = 5_000;
const VERIFIED_RECEIPT_RECOVERY_REASON =
  "Verified receipt recovery; inactive to prevent unbounded rescanning.";
const VERIFIED_ERC20_WATCH_RECOVERY = {
  orderId: "O241097549",
  routeId: "usdc-erc20",
  networkId: "monitor-ethereum-mainnet",
  amount: "10",
  receivingAddress: "0x961fFd69412BdD402B8a63FC67D5d7f1A105abDb",
  orderCreatedAt: new Date("2026-09-22T21:39:42.698Z"),
  startCursor: "26035766",
  transactionHash: "0x1dd0bb8b9c28a80ad0df295a1de737c12c386f3d51b74abf13403d4e987c9b4b",
  transactionBlock: "26035851",
} as const;
const VERIFIED_BEP20_GAP_RECOVERY = {
  orderId: "O243008796",
  routeId: "usdt-bep20",
  networkId: "monitor-bep20",
  amount: "12",
  receivingAddress: "0x961fFd69412BdD402B8a63FC67D5d7f1A105abDb",
  orderCreatedAt: new Date("2026-09-22T22:46:24.066Z"),
  startCursor: "123455507",
} as const;
const legacyNetworkConfigDigest = (
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
export function isManualWalletTrackingEnabledForOrder(
  order: Pick<typeof ordersTable.$inferSelect, "fundingDetailsSnapshot">,
): boolean {
  return object(order.fundingDetailsSnapshot).manualWalletTrackingEnabled !== false;
}
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WatchRegistrationDiagnostic =
  | "NETWORK_MONITOR_MISSING"
  | "NETWORK_MONITOR_DISABLED"
  | "ASSET_MONITOR_MISSING"
  | "ASSET_MONITOR_DISABLED"
  | "READINESS_PROOF_MISSING"
  | "INVALID_RECEIVING_ADDRESS"
  | "FALLBACK_MONITOR_NOT_READY"
  | "ROUTE_IDENTITY_MISMATCH";

export function classifyWatchRegistrationIdentity(input: {
  routeFound: boolean;
  routeAssetMatches: boolean;
  exactAssetIdentity: boolean;
  networkFound: boolean;
  networkEnabled: boolean;
  assetFound: boolean;
  assetEnabled: boolean;
  networkProofPresent: boolean;
  assetProofPresent: boolean;
}): WatchRegistrationDiagnostic | null {
  if (!input.routeFound || !input.routeAssetMatches) {
    return "ROUTE_IDENTITY_MISMATCH";
  }
  if (!input.networkFound) return "NETWORK_MONITOR_MISSING";
  if (!input.networkEnabled) return "NETWORK_MONITOR_DISABLED";
  if (!input.assetFound) return "ASSET_MONITOR_MISSING";
  if (!input.exactAssetIdentity) return "ROUTE_IDENTITY_MISMATCH";
  if (!input.assetEnabled) return "ASSET_MONITOR_DISABLED";
  if (!input.networkProofPresent || !input.assetProofPresent) return "READINESS_PROOF_MISSING";
  return null;
}

async function selectWatchRegistrationIdentity(tx: DbTx, orderId: string) {
  const signedRouteId = sql<string>`coalesce(
    nullif(${ordersTable.fundingDetailsSnapshot} ->> 'networkId', ''),
    regexp_replace(coalesce(${ordersTable.sourceSettlementOptionId}, ''), '^crypto:', '')
  )`;
  const [resolved] = await tx.select({
    order: ordersTable,
    route: cryptoAssetNetworksTable,
    catalogAsset: cryptoAssetsTable,
    network: blockchainMonitorNetworksTable,
    asset: blockchainMonitorAssetsTable,
  }).from(ordersTable)
    .leftJoin(cryptoAssetNetworksTable, eq(cryptoAssetNetworksTable.id, signedRouteId))
    .leftJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .leftJoin(
      blockchainMonitorNetworksTable,
      eq(blockchainMonitorNetworksTable.networkCode, cryptoAssetNetworksTable.networkCode),
    )
    .leftJoin(
      blockchainMonitorAssetsTable,
      and(
        eq(blockchainMonitorAssetsTable.monitorNetworkId, blockchainMonitorNetworksTable.id),
        eq(blockchainMonitorAssetsTable.assetNetworkId, cryptoAssetNetworksTable.id),
      ),
    )
    .where(and(eq(ordersTable.id, orderId), ELIGIBLE))
    .limit(1);
  return resolved;
}

function diagnoseWatchRegistrationIdentity(
  resolved: NonNullable<Awaited<ReturnType<typeof selectWatchRegistrationIdentity>>>,
): WatchRegistrationDiagnostic | null {
  const { order, route, catalogAsset, network, asset } = resolved;
  const funding = object(order.fundingDetailsSnapshot);
  const assetCode = text(funding.assetCode) || text(funding.asset) || order.fromAsset;
  const sourceRouteId = signedCryptoRouteId({
    id: order.sourceSettlementOptionId ?? "",
    networkId: text(funding.networkId) || null,
  });
  const exactAssetIdentity = Boolean(
    route &&
    asset &&
    asset.assetNetworkId === route.id &&
    asset.decimals === route.decimals &&
    (
      asset.identityKind === "native"
        ? !asset.contractOrMint
        : asset.identityKind === "token" &&
          Boolean(network) &&
          isValidManualMonitoringTokenIdentity(network!.adapterKind, asset.contractOrMint)
    )
  );
  const legacyBep20 = network
    ? usesLegacyBep20Readiness(network.networkCode, network.chainId)
    : false;
  const diagnostic = classifyWatchRegistrationIdentity({
    routeFound: Boolean(route) && Boolean(sourceRouteId) && route?.id === sourceRouteId,
    routeAssetMatches: Boolean(
      route &&
      catalogAsset &&
      (
        route.assetId.toUpperCase() === assetCode.toUpperCase() ||
        catalogAsset.code.toUpperCase() === assetCode.toUpperCase()
      )
    ),
    exactAssetIdentity,
    networkFound: Boolean(network),
    networkEnabled: network?.enabled ?? false,
    assetFound: Boolean(asset),
    assetEnabled: asset?.enabled ?? false,
    networkProofPresent: legacyBep20 || Boolean(
      network?.healthProofFingerprint &&
      network.healthProofCapturedAt
    ),
    assetProofPresent: legacyBep20 || Boolean(
      asset?.readinessProofFingerprint &&
      asset.readinessProofCapturedAt
    ),
  });
  if (diagnostic || order.providerState !== "whitebit_fallback") return diagnostic;
  if (!route || !catalogAsset || !network || !asset) return "FALLBACK_MONITOR_NOT_READY";
  return isReadyManualFallbackWatch(
    order, route, catalogAsset, network, asset, adapterConfig(network),
  ) ? null : "FALLBACK_MONITOR_NOT_READY";
}

/** The fallback can join the manual watch path only with an exact, live route proof. */
export function isReadyManualFallbackWatch(
  order: typeof ordersTable.$inferSelect,
  route: typeof cryptoAssetNetworksTable.$inferSelect,
  catalogAsset: typeof cryptoAssetsTable.$inferSelect,
  network: typeof blockchainMonitorNetworksTable.$inferSelect,
  asset: typeof blockchainMonitorAssetsTable.$inferSelect,
  config: { endpoint: string; apiKey?: string } | undefined,
): boolean {
  const funding = object(order.fundingDetailsSnapshot);
  if (
    order.fundingProviderSource !== "whitebit" ||
    order.providerState !== "whitebit_fallback" ||
    text(funding.addressSource) !== "manual_fallback" ||
    route.depositProvider !== "whitebit" ||
    route.executionMode !== "manual" ||
    !route.enabled ||
    !catalogAsset.enabled ||
    route.lifecycle === "deprecated" ||
    catalogAsset.lifecycle === "deprecated" ||
    route.sharedDepositAddress.trim() !== order.depositAddress.trim() ||
    (route.sharedDepositMemo ?? "").trim() !== order.depositMemo.trim() ||
    text(funding.address) !== order.depositAddress.trim() ||
    text(funding.memo) !== order.depositMemo.trim() ||
    !isSyntacticallyValidManualWalletAddress(route, order.depositAddress) ||
    (route.requiresMemo && !order.depositMemo.trim()) ||
    (order.depositMemo.trim() && !isSyntacticallyValidManualWalletMemo(route, order.depositMemo))
  ) return false;
  const endpoint = config?.endpoint;
  const apiKey = config?.apiKey;
  const providerCompatible =
    network.adapterKind === "evm" && network.providerKind === "rpc" ||
    network.adapterKind === "solana" && network.providerKind === "rpc" ||
    network.adapterKind === "tron" && network.providerKind === "indexer" ||
    network.adapterKind === "bitcoin" && network.providerKind === "rpc";
  return isManualMonitoringRuntimeReady({
    routeId: route.id,
    routeNetworkCode: route.networkCode,
    monitorAssetRouteId: asset.assetNetworkId,
    monitorNetworkCode: network.networkCode,
    monitorChainId: network.chainId,
    assetEnabled: asset.enabled,
    networkEnabled: network.enabled,
    providerKind: network.providerKind,
    endpointConfigured: Boolean(endpoint),
    healthStatus: network.healthStatus,
    healthCheckedAtMs: network.healthCheckedAt?.getTime() ?? null,
    healthProofCapturedAtMs: network.healthProofCapturedAt?.getTime() ?? null,
    pollIntervalSeconds: network.pollIntervalSeconds,
    adapterKind: network.adapterKind,
    identityKind: asset.identityKind,
    contractOrMint: asset.contractOrMint,
    providerCompatible,
    receivingAddressValid: true,
    memoValid: true,
    readinessProofFingerprint: asset.readinessProofFingerprint,
    networkHealthProofFingerprint: network.healthProofFingerprint,
    networkDigest: manualMonitoringNetworkConfigDigest({ network, endpoint, apiKey }),
    routeDigest: manualMonitoringProofFingerprint({
      network, asset, route, endpoint, apiKey,
      capturedAt: network.healthProofCapturedAt ?? new Date(0),
      head: network.lastHead ?? "",
    }),
  });
}

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

export function incomingEvidenceMatchesWatch(
  network: { id: string; networkCode: string; adapterKind: string },
  asset: { id: string },
  watch: {
    monitorNetworkId: string;
    monitorAssetId: string;
    startCursor: string | null;
    identityKind: string;
    contractOrMint: string | null;
    decimals: number;
    orderCreatedAt: Date;
    memoOrTag: string | null;
    receivingAddress: string;
    expectedAmount: string;
  },
  evidence: IncomingEvidence,
): boolean {
  return watch.monitorNetworkId === network.id &&
    watch.monitorAssetId === asset.id &&
    evidence.networkCode.trim().toUpperCase() === network.networkCode.trim().toUpperCase() &&
    evidence.assetId === asset.id &&
    evidenceWithinWatchCursor(watch.startCursor, evidence.blockOrSlot) &&
    immutableIdentityMatches(watch, evidence) &&
    evidenceMeetsWatchTimeAndMemo(
      watch.orderCreatedAt,
      evidence.blockTimestamp,
      watch.memoOrTag,
      evidence.memoOrTag,
    ) &&
    (
      network.adapterKind === "bitcoin"
        ? watch.receivingAddress.trim() === evidence.toAddress.trim()
        : watch.receivingAddress.trim().toLowerCase() === evidence.toAddress.trim().toLowerCase()
    ) &&
    exactAmountMatches(watch.expectedAmount, watch.decimals, evidence.rawAmount);
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

export function shouldRefreshStrictManualReadinessProof(input: {
  adapterKind: string;
  networkCode: string;
  chainId: string | null;
}): boolean {
  return input.adapterKind === "bitcoin" || (
    isLegacyBep20Network(input.networkCode) &&
    input.chainId?.trim().toLowerCase() === "0x38"
  ) || (
    input.adapterKind === "tron" &&
    input.chainId?.trim().toLowerCase() === TRON_MAINNET_CHAIN_ID
  ) || (
    input.adapterKind === "evm" &&
    input.networkCode.trim().toUpperCase() === "ERC20" &&
    input.chainId?.trim().toLowerCase() === "0x1"
  ) || (
    input.adapterKind === "evm" &&
    input.networkCode.trim().toUpperCase() === "POLYGON" &&
    input.chainId?.trim().toLowerCase() === "0x89"
  );
}

export function selectReadyBlockchainMonitoringSetupRoutes<T extends {
  assetNetworkId: string;
  status: BlockchainMonitoringSetupStatus;
  monitorNetworkId?: string;
  monitorAssetId?: string;
  autoEnableEligible?: boolean;
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
    route.autoEnableEligible !== false &&
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

export function planBoundedWatchCatchUpRanges(
  from: string,
  head: string,
  identityKind: string,
  maxTokenRange: number,
  maxRanges = MAX_CATCH_UP_RANGES_PER_WATCH_CYCLE,
): ScanCursor[] {
  const ranges: ScanCursor[] = [];
  let cursor = from;
  const safeLimit = Math.max(1, Math.floor(maxRanges));
  for (let index = 0; index < safeLimit; index += 1) {
    if (
      /^[0-9]+$/.test(cursor) &&
      /^[0-9]+$/.test(head) &&
      BigInt(cursor) > BigInt(head)
    ) break;
    const to = boundedWatchScanEnd(cursor, head, identityKind, maxTokenRange);
    ranges.push({ from: cursor, to });
    if (to === head || to === cursor) break;
    cursor = to;
  }
  return ranges;
}

export function maxWatchCatchUpRanges(
  networkCode: string,
  identityKind: string,
): number {
  return networkCode.trim().toUpperCase() === "BEP20" && identityKind === "token"
    ? MAX_CATCH_UP_RANGES_PER_WATCH_CYCLE
    : 1;
}

export function isTerminalBlockchainWatchOrder(
  status: string,
  manualSettlementState: string | null,
): boolean {
  const terminal = new Set([
    "completed",
    "cancelled",
    "canceled",
    "expired",
    "failed",
    "refunded",
  ]);
  return terminal.has(status.trim().toLowerCase()) ||
    terminal.has(manualSettlementState?.trim().toLowerCase() ?? "");
}

export async function processBoundedWatchCatchUpRanges(input: {
  ranges: readonly ScanCursor[];
  initialCursor: string | null;
  shouldContinue?: () => boolean;
  processRange: (range: ScanCursor) => Promise<string>;
  advanceCursor: (expectedCursor: string | null, nextCursor: string) => Promise<boolean>;
}): Promise<string | null> {
  let expectedCursor = input.initialCursor;
  for (const range of input.ranges) {
    if (input.shouldContinue && !input.shouldContinue()) break;
    const nextCursor = await input.processRange(range);
    if (!await input.advanceCursor(expectedCursor, nextCursor)) break;
    expectedCursor = nextCursor;
    if (nextCursor === range.from) break;
  }
  return expectedCursor;
}

export function boundedBitcoinWatchScanRange(
  progressFrom: string,
  startCursor: string | null,
  head: string,
  maxRange: number,
  requestedLookback = 6,
): ScanCursor {
  if (
    !/^[0-9]+$/.test(progressFrom) ||
    !/^[0-9]+$/.test(head) ||
    (startCursor !== null && !/^[0-9]+$/.test(startCursor))
  ) return { from: progressFrom, to: head };
  const range = Math.max(1, Math.floor(maxRange));
  const lookback = BigInt(Math.min(Math.max(0, requestedLookback), range - 1));
  const progress = BigInt(progressFrom);
  const floor = startCursor === null ? 0n : BigInt(startCursor);
  const from = progress > lookback ? progress - lookback : 0n;
  const boundedFrom = from < floor ? floor : from;
  const boundedTo = [BigInt(head), boundedFrom + BigInt(range)]
    .reduce((minimum, value) => value < minimum ? value : minimum);
  return { from: boundedFrom.toString(), to: boundedTo.toString() };
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
  const resolved = await db.transaction((tx) => selectWatchRegistrationIdentity(tx, orderId));
  if (!resolved) return;
  const { order, route, catalogAsset, network, asset } = resolved;
  const funding = object(order.fundingDetailsSnapshot);
  if (
    !isManualWalletTrackingEnabledForOrder(order) ||
    order.fundingProviderSource === "whitebit" &&
      (order.providerState !== "whitebit_fallback" ||
        text(funding.addressSource) !== "manual_fallback")
  ) return;
  const rawAddress = text(funding.address) || order.depositAddress;
  const assetCode = text(funding.assetCode) || text(funding.asset) || order.fromAsset;
  const sourceRouteId = signedCryptoRouteId({
    id: order.sourceSettlementOptionId ?? "",
    networkId: text(funding.networkId) || null,
  });
  const diagnostic = diagnoseWatchRegistrationIdentity(resolved);
  const networkCode = route?.networkCode || order.fromNetwork;
  const persistGap = async (reason: string) => {
    await db.insert(blockchainMonitorRegistrationGapsTable).values({ orderId, networkCode, assetCode, receivingAddress: rawAddress, reason })
      .onConflictDoUpdate({ target: blockchainMonitorRegistrationGapsTable.orderId, set: { reason, resolvedAt: null } });
  };
  if (diagnostic) {
    await persistGap(diagnostic);
    logger.warn(
      { orderId, sourceRouteId, networkCode, assetCode, code: diagnostic },
      "Blockchain watch registration blocked",
    );
    return;
  }
  if (!route || !network || !asset) {
    throw new Error("Blockchain watch registration identity unexpectedly incomplete.");
  }
  const invalidReceivingAddressReason = [
    "INVALID_RECEIVING_ADDRESS",
    `routeId=${route.id}`,
    `monitorNetworkId=${network.id}`,
    `monitorAssetId=${asset.id}`,
  ].join(" ");
  const address = network.adapterKind === "tron" ? normalizeTronAddress(rawAddress) : rawAddress;
  if (!address) {
    await persistGap(invalidReceivingAddressReason);
    logger.warn(
      {
        orderId,
        sourceRouteId,
        routeId: route.id,
        monitorNetworkId: network.id,
        monitorAssetId: asset.id,
        networkCode,
        assetCode,
        code: "INVALID_RECEIVING_ADDRESS",
      },
      "Blockchain watch registration blocked",
    );
    return;
  }
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
        if (order.providerState !== "whitebit_fallback") {
          await db.update(blockchainMonitorNetworksTable).set({ lastHead: capturedHead })
            .where(and(eq(blockchainMonitorNetworksTable.id, network.id), isNull(blockchainMonitorNetworksTable.lastHead)));
        }
      } catch {
        registrationState = "pending_review";
        registrationReason = "Provider head could not be captured before order response.";
      }
    } else {
      registrationState = "pending_review";
      registrationReason = "Monitoring provider is not configured.";
    }
  }
  const mutationDiagnostic = await db.transaction(async (tx): Promise<string | null> => {
    const current = await selectWatchRegistrationIdentity(tx, orderId);
    if (!current) return "ROUTE_IDENTITY_MISMATCH";
    const currentDiagnostic = diagnoseWatchRegistrationIdentity(current);
    if (currentDiagnostic) return currentDiagnostic;
    if (!current.route || !current.network || !current.asset) return "ROUTE_IDENTITY_MISMATCH";
    const currentConfig = adapterConfig(current.network);
    const resolvedConfig = adapterConfig(network);
    if (
      current.route.id !== route.id ||
      current.network.id !== network.id ||
      current.asset.id !== asset.id ||
      !currentConfig ||
      !resolvedConfig ||
      manualMonitoringNetworkConfigDigest({
        network: current.network,
        endpoint: currentConfig.endpoint,
        apiKey: currentConfig.apiKey,
      }) !== manualMonitoringNetworkConfigDigest({
        network,
        endpoint: resolvedConfig.endpoint,
        apiKey: resolvedConfig.apiKey,
      })
    ) return "ROUTE_IDENTITY_MISMATCH";
    const currentFunding = object(current.order.fundingDetailsSnapshot);
    const currentRawAddress = text(currentFunding.address) || current.order.depositAddress;
    const currentAddress = current.network.adapterKind === "tron"
      ? normalizeTronAddress(currentRawAddress)
      : currentRawAddress;
    if (!currentAddress) {
      return [
        "INVALID_RECEIVING_ADDRESS",
        `routeId=${current.route.id}`,
        `monitorNetworkId=${current.network.id}`,
        `monitorAssetId=${current.asset.id}`,
      ].join(" ");
    }
    const expectedWatch = {
      orderId,
      monitorNetworkId: current.network.id,
      monitorAssetId: current.asset.id,
      assetNetworkId: current.route.id,
      expectedAmount: current.order.amount,
      receivingAddress: currentAddress,
      memoOrTag: text(currentFunding.memo) || current.order.depositMemo || null,
      identityKind: current.asset.identityKind,
      contractOrMint: current.network.adapterKind === "tron" && current.asset.contractOrMint
        ? normalizeTronAddress(current.asset.contractOrMint)
        : current.asset.contractOrMint,
      decimals: current.asset.decimals,
      orderCreatedAt: current.order.createdAt,
    };
    const [existingWatch] = await tx.select().from(blockchainMonitorWatchesTable)
      .where(eq(blockchainMonitorWatchesTable.orderId, orderId)).for("update").limit(1);
    if (
      existingWatch &&
      options.freshCursor &&
      (existingWatch.registrationState === "pending_review" || !existingWatch.active)
    ) {
      if (!exactWatchMatchesOrderSnapshot(existingWatch, expectedWatch)) {
        return "WATCH_IDENTITY_MISMATCH";
      }
      if (registrationState === "active" && startCursor) {
        await tx.update(blockchainMonitorWatchesTable).set({
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
    await tx.insert(blockchainMonitorWatchesTable).values({
      ...expectedWatch,
      startCursor,
      currentCursor: startCursor,
      registrationState,
      registrationReason,
      active: registrationState === "active",
    }).onConflictDoNothing({ target: blockchainMonitorWatchesTable.orderId });
    const [storedWatch] = await tx.select().from(blockchainMonitorWatchesTable)
      .where(eq(blockchainMonitorWatchesTable.orderId, orderId)).limit(1);
    if (storedWatch?.registrationState === "pending_review") {
      await tx.insert(blockchainMonitorRegistrationGapsTable).values({
        orderId,
        networkCode,
        assetCode,
        receivingAddress: rawAddress,
        reason: registrationReason ?? "Watch requires explicit operator activation.",
      }).onConflictDoUpdate({
        target: blockchainMonitorRegistrationGapsTable.orderId,
        set: {
          reason: registrationReason ?? "Watch requires explicit operator activation.",
          resolvedAt: null,
        },
      });
    } else if (
      storedWatch?.registrationState === "active" &&
      storedWatch.active &&
      exactWatchMatchesOrderSnapshot(storedWatch, expectedWatch)
    ) {
      await tx.update(blockchainMonitorRegistrationGapsTable).set({ resolvedAt: new Date() })
        .where(and(
          eq(blockchainMonitorRegistrationGapsTable.orderId, orderId),
          isNull(blockchainMonitorRegistrationGapsTable.resolvedAt),
        ));
    } else if (storedWatch?.registrationState === "active") {
      return "WATCH_IDENTITY_MISMATCH";
    }
    return null;
  });
  if (mutationDiagnostic) {
    await persistGap(mutationDiagnostic);
    logger.warn(
      { orderId, sourceRouteId, networkCode, assetCode, code: mutationDiagnostic },
      "Blockchain watch registration blocked after identity revalidation",
    );
  }
}

async function ensureVerifiedErc20RecoveryAssetEligibility(
  network: typeof blockchainMonitorNetworksTable.$inferSelect,
  leaseToken: string,
  head: string,
): Promise<boolean> {
  const recovery = VERIFIED_ERC20_WATCH_RECOVERY;
  if (
    network.id !== recovery.networkId ||
    network.networkCode !== "ERC20" ||
    network.adapterKind !== "evm" ||
    network.chainId?.toLowerCase() !== "0x1" ||
    network.providerKind !== "rpc" ||
    !network.enabled
  ) return false;
  const config = adapterConfig(network);
  if (!config) return false;

  return withLease(network.id, leaseToken, async (tx) => {
    const [currentNetwork] = await tx.select().from(blockchainMonitorNetworksTable)
      .where(eq(blockchainMonitorNetworksTable.id, recovery.networkId))
      .limit(1);
    const currentConfig = currentNetwork ? adapterConfig(currentNetwork) : undefined;
    if (
      !currentNetwork ||
      currentNetwork.networkCode !== "ERC20" ||
      currentNetwork.adapterKind !== "evm" ||
      currentNetwork.chainId?.toLowerCase() !== "0x1" ||
      currentNetwork.providerKind !== "rpc" ||
      !currentNetwork.enabled ||
      !currentConfig ||
      manualMonitoringNetworkConfigDigest({
        network: currentNetwork,
        endpoint: currentConfig.endpoint,
        apiKey: currentConfig.apiKey,
      }) !== manualMonitoringNetworkConfigDigest({
        network,
        endpoint: config.endpoint,
        apiKey: config.apiKey,
      })
    ) {
      logger.warn(
        { orderId: recovery.orderId, code: "MONITOR_CONFIG_CHANGED" },
        "Verified ERC20 recovery eligibility blocked",
      );
      return false;
    }
    const [order] = await tx.select({ id: ordersTable.id }).from(ordersTable)
      .innerJoin(
        blockchainMonitorRegistrationGapsTable,
        eq(blockchainMonitorRegistrationGapsTable.orderId, ordersTable.id),
      )
      .where(and(
        eq(ordersTable.id, recovery.orderId),
        ELIGIBLE,
        eq(ordersTable.status, "awaiting funds"),
        eq(ordersTable.sourceSettlementOptionId, `crypto:${recovery.routeId}`),
        eq(ordersTable.fromAsset, "USDC"),
        eq(ordersTable.fromNetwork, "ERC20"),
        eq(ordersTable.amount, recovery.amount),
        sql`lower(${ordersTable.depositAddress}) = lower(${recovery.receivingAddress})`,
        eq(ordersTable.createdAt, recovery.orderCreatedAt),
        eq(blockchainMonitorRegistrationGapsTable.networkCode, "ERC20"),
        eq(blockchainMonitorRegistrationGapsTable.assetCode, "USDC"),
        sql`lower(${blockchainMonitorRegistrationGapsTable.receivingAddress}) = lower(${recovery.receivingAddress})`,
        isNull(blockchainMonitorRegistrationGapsTable.resolvedAt),
      ))
      .limit(1);
    if (!order) return false;

    const [identity] = await tx.select({
      asset: blockchainMonitorAssetsTable,
      route: cryptoAssetNetworksTable,
    }).from(blockchainMonitorAssetsTable)
      .innerJoin(
        cryptoAssetNetworksTable,
        eq(cryptoAssetNetworksTable.id, blockchainMonitorAssetsTable.assetNetworkId),
      )
      .innerJoin(
        cryptoAssetsTable,
        eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId),
      )
      .where(and(
        eq(blockchainMonitorAssetsTable.monitorNetworkId, recovery.networkId),
        eq(blockchainMonitorAssetsTable.assetNetworkId, recovery.routeId),
        eq(blockchainMonitorAssetsTable.identityKind, "token"),
        sql`lower(${blockchainMonitorAssetsTable.contractOrMint}) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'`,
        eq(blockchainMonitorAssetsTable.decimals, 6),
        eq(cryptoAssetNetworksTable.id, recovery.routeId),
        eq(cryptoAssetNetworksTable.networkCode, "ERC20"),
        eq(cryptoAssetNetworksTable.decimals, 6),
        sql`upper(${cryptoAssetsTable.code}) = 'USDC'`,
      ))
      .limit(1);
    if (!identity) {
      logger.warn(
        { orderId: recovery.orderId, code: "ASSET_MONITOR_IDENTITY_MISMATCH" },
        "Verified ERC20 recovery eligibility blocked",
      );
      return false;
    }

    const capturedAt = new Date();
    const enabledAsset = { ...identity.asset, enabled: true };
    const readinessProofFingerprint = manualMonitoringProofFingerprint({
      network: currentNetwork,
      asset: enabledAsset,
      route: identity.route,
      endpoint: currentConfig.endpoint,
      apiKey: currentConfig.apiKey,
      capturedAt,
      head,
    });
    const [enabled] = await tx.update(blockchainMonitorAssetsTable).set({
      enabled: true,
      readinessProofFingerprint,
      readinessProofCapturedAt: capturedAt,
    }).where(and(
      eq(blockchainMonitorAssetsTable.id, identity.asset.id),
      eq(blockchainMonitorAssetsTable.monitorNetworkId, recovery.networkId),
      eq(blockchainMonitorAssetsTable.assetNetworkId, recovery.routeId),
      eq(blockchainMonitorAssetsTable.identityKind, "token"),
      sql`lower(${blockchainMonitorAssetsTable.contractOrMint}) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'`,
      eq(blockchainMonitorAssetsTable.decimals, 6),
    )).returning();
    if (
      !enabled ||
      !enabled.enabled ||
      enabled.readinessProofFingerprint !== readinessProofFingerprint
    ) {
      throw new Error("Verified ERC20 recovery asset eligibility could not be persisted.");
    }
    logger.info(
      {
        orderId: recovery.orderId,
        monitorNetworkId: recovery.networkId,
        monitorAssetId: enabled.id,
        assetNetworkId: recovery.routeId,
      },
      "Verified ERC20 recovery asset monitor enabled with exact-route readiness proof",
    );
    return true;
  });
}

async function recoverVerifiedErc20Watch(
  network: typeof blockchainMonitorNetworksTable.$inferSelect,
  leaseToken: string,
  adapter: ReturnType<typeof createBlockchainMonitorAdapter>,
): Promise<void> {
  const recovery = VERIFIED_ERC20_WATCH_RECOVERY;
  if (network.id !== recovery.networkId) return;
  const [gap] = await db.select().from(blockchainMonitorRegistrationGapsTable).where(and(
    eq(blockchainMonitorRegistrationGapsTable.orderId, recovery.orderId),
    eq(blockchainMonitorRegistrationGapsTable.networkCode, "ERC20"),
    eq(blockchainMonitorRegistrationGapsTable.assetCode, "USDC"),
    sql`lower(${blockchainMonitorRegistrationGapsTable.receivingAddress}) = lower(${recovery.receivingAddress})`,
    isNull(blockchainMonitorRegistrationGapsTable.resolvedAt),
  )).limit(1);
  if (!gap) return;
  const [order] = await db.select().from(ordersTable).where(and(
    eq(ordersTable.id, recovery.orderId),
    ELIGIBLE,
    eq(ordersTable.status, "awaiting funds"),
    eq(ordersTable.sourceSettlementOptionId, `crypto:${recovery.routeId}`),
    eq(ordersTable.fromAsset, "USDC"),
    eq(ordersTable.fromNetwork, "ERC20"),
    eq(ordersTable.amount, recovery.amount),
    sql`lower(${ordersTable.depositAddress}) = lower(${recovery.receivingAddress})`,
    eq(ordersTable.createdAt, recovery.orderCreatedAt),
  )).limit(1);
  if (!order) return;
  const [existingWatch] = await db.select({ id: blockchainMonitorWatchesTable.id })
    .from(blockchainMonitorWatchesTable)
    .where(eq(blockchainMonitorWatchesTable.orderId, recovery.orderId))
    .limit(1);
  if (existingWatch) return;

  const [asset] = await db.select().from(blockchainMonitorAssetsTable)
    .where(and(
      eq(blockchainMonitorAssetsTable.monitorNetworkId, recovery.networkId),
      eq(blockchainMonitorAssetsTable.assetNetworkId, recovery.routeId),
      eq(blockchainMonitorAssetsTable.identityKind, "token"),
      sql`lower(${blockchainMonitorAssetsTable.contractOrMint}) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'`,
      eq(blockchainMonitorAssetsTable.decimals, 6),
    ))
    .limit(1);
  if (asset && !asset.enabled) {
    logger.warn(
      {
        orderId: recovery.orderId,
        monitorNetworkId: recovery.networkId,
        assetNetworkId: recovery.routeId,
        code: "ASSET_MONITOR_DISABLED",
      },
      "Verified ERC20 watch recovery blocked",
    );
    return;
  }
  if (
    !asset ||
    network.networkCode !== "ERC20" ||
    network.adapterKind !== "evm" ||
    network.chainId?.toLowerCase() !== "0x1" ||
    network.providerKind !== "rpc" ||
    !network.enabled
  ) return;

  try {
    const scanned = await adapter.scanIncoming({
      from: recovery.transactionBlock,
      to: recovery.transactionBlock,
    }, [{
      address: recovery.receivingAddress,
      assets: [{
        assetId: asset.id,
        symbol: recovery.routeId,
        kind: "token",
        contractOrMint: asset.contractOrMint ?? undefined,
        decimals: asset.decimals,
      }],
    }]);
    const evidence = scanned.evidence.find((candidate) =>
      candidate.transactionHash.toLowerCase() === recovery.transactionHash &&
      candidate.blockOrSlot === recovery.transactionBlock &&
      candidate.assetId === asset.id &&
      candidate.identityKind === "token" &&
      candidate.contractOrMint?.toLowerCase() ===
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" &&
      candidate.decimals === 6 &&
      candidate.rawAmount === "10000000" &&
      candidate.toAddress.toLowerCase() === recovery.receivingAddress.toLowerCase() &&
      Boolean(candidate.blockTimestamp) &&
      new Date(candidate.blockTimestamp!).getTime() >= recovery.orderCreatedAt.getTime()
    );
    if (!evidence) {
      logger.warn(
        { orderId: recovery.orderId, transactionHash: recovery.transactionHash },
        "Verified ERC20 watch recovery evidence could not be independently reproduced",
      );
      return;
    }
    await withLease(network.id, leaseToken, async (tx) => {
      const [lockedGap] = await tx.select().from(blockchainMonitorRegistrationGapsTable).where(and(
        eq(blockchainMonitorRegistrationGapsTable.id, gap.id),
        eq(blockchainMonitorRegistrationGapsTable.orderId, recovery.orderId),
        eq(blockchainMonitorRegistrationGapsTable.networkCode, "ERC20"),
        eq(blockchainMonitorRegistrationGapsTable.assetCode, "USDC"),
        sql`lower(${blockchainMonitorRegistrationGapsTable.receivingAddress}) = lower(${recovery.receivingAddress})`,
        isNull(blockchainMonitorRegistrationGapsTable.resolvedAt),
      )).for("update").limit(1);
      if (!lockedGap) return;
      const [lockedOrder] = await tx.select().from(ordersTable).where(and(
        eq(ordersTable.id, recovery.orderId),
        ELIGIBLE,
        eq(ordersTable.status, "awaiting funds"),
        eq(ordersTable.sourceSettlementOptionId, `crypto:${recovery.routeId}`),
        eq(ordersTable.fromAsset, "USDC"),
        eq(ordersTable.fromNetwork, "ERC20"),
        eq(ordersTable.amount, recovery.amount),
        sql`lower(${ordersTable.depositAddress}) = lower(${recovery.receivingAddress})`,
        eq(ordersTable.createdAt, recovery.orderCreatedAt),
      )).for("update").limit(1);
      if (!lockedOrder) return;
      const [lockedExistingWatch] = await tx.select().from(blockchainMonitorWatchesTable)
        .where(eq(blockchainMonitorWatchesTable.orderId, recovery.orderId))
        .limit(1);
      if (lockedExistingWatch) return;
      const [lockedAsset] = await tx.select().from(blockchainMonitorAssetsTable)
        .where(and(
          eq(blockchainMonitorAssetsTable.id, asset.id),
          eq(blockchainMonitorAssetsTable.monitorNetworkId, network.id),
          eq(blockchainMonitorAssetsTable.assetNetworkId, recovery.routeId),
          eq(blockchainMonitorAssetsTable.identityKind, "token"),
          sql`lower(${blockchainMonitorAssetsTable.contractOrMint}) = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'`,
          eq(blockchainMonitorAssetsTable.decimals, 6),
          eq(blockchainMonitorAssetsTable.enabled, true),
        ))
        .for("update")
        .limit(1);
      if (!lockedAsset) {
        throw new Error("Verified ERC20 watch recovery asset identity changed before insertion.");
      }
      await tx.insert(blockchainMonitorWatchesTable).values({
        orderId: recovery.orderId,
        monitorNetworkId: network.id,
        monitorAssetId: lockedAsset.id,
        assetNetworkId: recovery.routeId,
        expectedAmount: recovery.amount,
        receivingAddress: recovery.receivingAddress,
        memoOrTag: null,
        identityKind: "token",
        contractOrMint: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
        orderCreatedAt: recovery.orderCreatedAt,
        startCursor: recovery.startCursor,
        currentCursor: recovery.startCursor,
        registrationState: "active",
        registrationReason: "Reviewed order-time cursor recovery after exact RPC receipt verification.",
        active: true,
      }).onConflictDoNothing({ target: blockchainMonitorWatchesTable.orderId });
      const [storedWatch] = await tx.select().from(blockchainMonitorWatchesTable)
        .where(eq(blockchainMonitorWatchesTable.orderId, recovery.orderId))
        .limit(1);
      if (
        !storedWatch ||
        storedWatch.monitorNetworkId !== network.id ||
        storedWatch.monitorAssetId !== lockedAsset.id ||
        storedWatch.assetNetworkId !== recovery.routeId ||
        storedWatch.expectedAmount !== recovery.amount ||
        storedWatch.receivingAddress.toLowerCase() !== recovery.receivingAddress.toLowerCase() ||
        storedWatch.identityKind !== "token" ||
        storedWatch.contractOrMint?.toLowerCase() !==
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" ||
        storedWatch.decimals !== 6 ||
        storedWatch.orderCreatedAt.getTime() !== recovery.orderCreatedAt.getTime() ||
        storedWatch.startCursor !== recovery.startCursor ||
        storedWatch.currentCursor !== recovery.startCursor ||
        storedWatch.registrationState !== "active" ||
        !storedWatch.active
      ) {
        throw new Error("Verified ERC20 watch recovery produced an unexpected watch.");
      }
      await tx.update(blockchainMonitorRegistrationGapsTable).set({
        resolvedAt: new Date(),
        resolvedBy: "reviewed-order-time-cursor-recovery",
      }).where(and(
        eq(blockchainMonitorRegistrationGapsTable.id, lockedGap.id),
        eq(blockchainMonitorRegistrationGapsTable.orderId, recovery.orderId),
        isNull(blockchainMonitorRegistrationGapsTable.resolvedAt),
      ));
    });
  } catch (error) {
    logger.warn(
      { err: error, orderId: recovery.orderId },
      "Verified ERC20 watch recovery failed",
    );
  }
}

async function recoverReviewedBep20RegistrationGap(
  network: typeof blockchainMonitorNetworksTable.$inferSelect,
  leaseToken: string,
): Promise<void> {
  const recovery = VERIFIED_BEP20_GAP_RECOVERY;
  if (
    network.id !== recovery.networkId ||
    network.networkCode !== "BEP20" ||
    network.adapterKind !== "evm" ||
    network.chainId?.toLowerCase() !== "0x38" ||
    network.providerKind !== "rpc" ||
    !network.enabled
  ) return;

  await withLease(network.id, leaseToken, async (tx) => {
    const [lockedNetwork] = await tx.select().from(blockchainMonitorNetworksTable).where(and(
      eq(blockchainMonitorNetworksTable.id, recovery.networkId),
      eq(blockchainMonitorNetworksTable.networkCode, "BEP20"),
      eq(blockchainMonitorNetworksTable.adapterKind, "evm"),
      eq(blockchainMonitorNetworksTable.chainId, "0x38"),
      eq(blockchainMonitorNetworksTable.providerKind, "rpc"),
      eq(blockchainMonitorNetworksTable.enabled, true),
      eq(blockchainMonitorNetworksTable.healthStatus, "connected"),
      isNotNull(blockchainMonitorNetworksTable.healthProofFingerprint),
      isNotNull(blockchainMonitorNetworksTable.healthProofCapturedAt),
    )).for("update").limit(1);
    const lockedConfig = lockedNetwork ? adapterConfig(lockedNetwork) : null;
    const cycleConfig = adapterConfig(network);
    if (
      !lockedNetwork ||
      !lockedConfig ||
      !cycleConfig ||
      manualMonitoringNetworkConfigDigest({
        network: lockedNetwork,
        endpoint: lockedConfig.endpoint,
        apiKey: lockedConfig.apiKey,
      }) !== manualMonitoringNetworkConfigDigest({
        network,
        endpoint: cycleConfig.endpoint,
        apiKey: cycleConfig.apiKey,
      })
    ) return;
    const [gap] = await tx.select().from(blockchainMonitorRegistrationGapsTable).where(and(
      eq(blockchainMonitorRegistrationGapsTable.orderId, recovery.orderId),
      eq(blockchainMonitorRegistrationGapsTable.networkCode, "BEP20"),
      eq(blockchainMonitorRegistrationGapsTable.assetCode, "USDT"),
      sql`lower(${blockchainMonitorRegistrationGapsTable.receivingAddress}) = lower(${recovery.receivingAddress})`,
      isNull(blockchainMonitorRegistrationGapsTable.resolvedAt),
    )).for("update").limit(1);
    if (!gap) return;
    const [order] = await tx.select().from(ordersTable).where(and(
      eq(ordersTable.id, recovery.orderId),
      ELIGIBLE,
      eq(ordersTable.status, "awaiting funds"),
      eq(ordersTable.sourceSettlementOptionId, `crypto:${recovery.routeId}`),
      eq(ordersTable.fromAsset, "USDT"),
      eq(ordersTable.fromNetwork, "BEP20"),
      eq(ordersTable.amount, recovery.amount),
      sql`lower(${ordersTable.depositAddress}) = lower(${recovery.receivingAddress})`,
      eq(ordersTable.createdAt, recovery.orderCreatedAt),
    )).for("update").limit(1);
    if (!order) return;
    const [identity] = await tx.select({
      asset: blockchainMonitorAssetsTable,
      route: cryptoAssetNetworksTable,
      catalogAsset: cryptoAssetsTable,
    }).from(blockchainMonitorAssetsTable)
      .innerJoin(
        cryptoAssetNetworksTable,
        eq(cryptoAssetNetworksTable.id, blockchainMonitorAssetsTable.assetNetworkId),
      )
      .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
      .where(and(
        eq(blockchainMonitorAssetsTable.monitorNetworkId, recovery.networkId),
        eq(blockchainMonitorAssetsTable.assetNetworkId, recovery.routeId),
        eq(blockchainMonitorAssetsTable.identityKind, "token"),
        sql`lower(${blockchainMonitorAssetsTable.contractOrMint}) = '0x55d398326f99059ff775485246999027b3197955'`,
        eq(blockchainMonitorAssetsTable.decimals, 18),
        eq(blockchainMonitorAssetsTable.enabled, true),
        isNotNull(blockchainMonitorAssetsTable.readinessProofFingerprint),
        isNotNull(blockchainMonitorAssetsTable.readinessProofCapturedAt),
        eq(cryptoAssetNetworksTable.networkCode, "BEP20"),
        eq(cryptoAssetNetworksTable.decimals, 18),
        sql`upper(${cryptoAssetsTable.code}) = 'USDT'`,
      ))
      .for("update")
      .limit(1);
    if (!identity) return;
    const [existing] = await tx.select({ id: blockchainMonitorWatchesTable.id })
      .from(blockchainMonitorWatchesTable)
      .where(eq(blockchainMonitorWatchesTable.orderId, recovery.orderId))
      .limit(1);
    if (existing) return;

    await tx.insert(blockchainMonitorWatchesTable).values({
      orderId: recovery.orderId,
      monitorNetworkId: recovery.networkId,
      monitorAssetId: identity.asset.id,
      assetNetworkId: recovery.routeId,
      expectedAmount: recovery.amount,
      receivingAddress: recovery.receivingAddress,
      memoOrTag: null,
      identityKind: "token",
      contractOrMint: identity.asset.contractOrMint,
      decimals: 18,
      orderCreatedAt: recovery.orderCreatedAt,
      startCursor: recovery.startCursor,
      currentCursor: recovery.startCursor,
      registrationState: "active",
      registrationReason: "Reviewed order-time cursor recovery for unresolved automatic-registration gap.",
      active: true,
    }).onConflictDoNothing({ target: blockchainMonitorWatchesTable.orderId });
    const [stored] = await tx.select().from(blockchainMonitorWatchesTable)
      .where(eq(blockchainMonitorWatchesTable.orderId, recovery.orderId))
      .limit(1);
    if (
      !stored ||
      stored.monitorNetworkId !== recovery.networkId ||
      stored.monitorAssetId !== identity.asset.id ||
      stored.assetNetworkId !== recovery.routeId ||
      stored.expectedAmount !== recovery.amount ||
      stored.receivingAddress.toLowerCase() !== recovery.receivingAddress.toLowerCase() ||
      stored.startCursor !== recovery.startCursor ||
      stored.currentCursor !== recovery.startCursor ||
      stored.registrationState !== "active" ||
      !stored.active
    ) {
      throw new Error("Reviewed BEP20 registration-gap recovery produced an unexpected watch.");
    }
    await tx.update(blockchainMonitorRegistrationGapsTable).set({
      resolvedAt: new Date(),
      resolvedBy: "reviewed-order-time-cursor-recovery",
    }).where(and(
      eq(blockchainMonitorRegistrationGapsTable.id, gap.id),
      isNull(blockchainMonitorRegistrationGapsTable.resolvedAt),
    ));
    logger.info(
      {
        orderId: recovery.orderId,
        watchId: stored.id,
        startCursor: recovery.startCursor,
      },
      "Reviewed BEP20 registration gap recovered",
    );
  });
}

async function reconcileResolvableRegistrationGaps(): Promise<void> {
  const gaps = await db.select({ orderId: blockchainMonitorRegistrationGapsTable.orderId })
    .from(blockchainMonitorRegistrationGapsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, blockchainMonitorRegistrationGapsTable.orderId))
    .where(and(
      isNull(blockchainMonitorRegistrationGapsTable.resolvedAt),
      sql`${blockchainMonitorRegistrationGapsTable.orderId} not in (${VERIFIED_ERC20_WATCH_RECOVERY.orderId}, ${VERIFIED_BEP20_GAP_RECOVERY.orderId})`,
      ELIGIBLE,
    ))
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
    adapterKind: network.adapterKind as "evm" | "tron" | "solana" | "bitcoin",
    chainId: network.chainId ?? undefined,
    endpoint,
    apiKey,
    confirmationsRequired: network.confirmationsRequired,
    maxRange: network.maxScanRange,
  };
}

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
  const matches = candidates.filter(({ watch }) =>
    incomingEvidenceMatchesWatch(network, asset, watch, evidence)
  ).map(({ watch }) => watch);
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

async function refreshConfirming(
  network: typeof blockchainMonitorNetworksTable.$inferSelect,
  leaseToken: string,
  deadlineAtMs: number,
): Promise<void> {
  const selectRows = (
    state: "confirming" | "applied",
    limit: number,
  ) => db.select({
    match: blockchainMonitorMatchesTable,
    observation: blockchainMonitorObservationsTable,
    asset: blockchainMonitorAssetsTable,
  })
    .from(blockchainMonitorMatchesTable)
    .innerJoin(blockchainMonitorObservationsTable, eq(blockchainMonitorObservationsTable.id, blockchainMonitorMatchesTable.observationId))
    .innerJoin(blockchainMonitorAssetsTable, eq(blockchainMonitorAssetsTable.id, blockchainMonitorObservationsTable.monitorAssetId))
    .where(and(
      eq(blockchainMonitorMatchesTable.state, state),
      state === "applied"
        ? gte(blockchainMonitorMatchesTable.appliedAt, new Date(Date.now() - 60 * 60_000))
        : undefined,
      eq(blockchainMonitorObservationsTable.monitorNetworkId, network.id),
    ))
    .orderBy(blockchainMonitorMatchesTable.updatedAt, blockchainMonitorMatchesTable.id)
    .limit(limit);
  const [confirmingRows, appliedRows] = await Promise.all([
    selectRows("confirming", MAX_CONFIRMING_REFRESHES_PER_CYCLE),
    selectRows("applied", MAX_APPLIED_REFRESHES_PER_CYCLE),
  ]);
  const rows = [...confirmingRows, ...appliedRows];
  const config = adapterConfig(network);
  if (!config) return;
  const adapter = createBlockchainMonitorAdapter({ ...config, deadlineAtMs });
  for (const row of rows) {
    if (Date.now() >= deadlineAtMs - CATCH_UP_DEADLINE_GUARD_MS) return;
    const [lease] = await db.select({ token: blockchainMonitorNetworksTable.leaseToken, expires: blockchainMonitorNetworksTable.leaseExpiresAt })
      .from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, network.id)).limit(1);
    if (!lease || lease.token !== leaseToken || !lease.expires || lease.expires <= new Date()) return;
    const evidence: IncomingEvidence = {
      eventId: row.observation.eventIndex, transactionHash: row.observation.transactionHash,
      networkCode: network.networkCode, assetId: row.observation.monitorAssetId, assetSymbol: "",
      identityKind: row.asset.identityKind as "native" | "token",
      contractOrMint: row.asset.contractOrMint ?? undefined,
      toAddress: row.observation.toAddress, rawAmount: row.observation.amount, blockOrSlot: row.observation.blockReference ?? "0",
      decimals: row.asset.decimals,
      blockHash: row.observation.blockHash ?? undefined, blockTimestamp: row.observation.blockTimestamp?.toISOString(),
       detectedAt: row.observation.observedAt.toISOString(),
       source: network.adapterKind === "bitcoin" ? "bitcoin-json-rpc" :
         network.adapterKind === "tron" ? "tron-indexer" :
           network.adapterKind === "solana" ? "solana-json-rpc" : "evm-json-rpc",
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
        updatedAt: new Date(),
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
            {
              err: error,
              networkId: network.id,
              dbPool: databasePoolTelemetry("blockchain-monitoring-lease-heartbeat", error),
            },
            "Blockchain monitoring lease heartbeat failed",
          );
        });
    }, 10_000);
    heartbeat.unref();
    try {
      const adapter = createBlockchainMonitorAdapter(config);
      if (leaseLost) throw new Error("Blockchain monitoring lease was lost.");
      const connection = await adapter.testConnection();
      if (network.chainId && connection.chainId?.toLowerCase() !== network.chainId.toLowerCase()) {
        throw new Error("Configured blockchain network identity did not match provider.");
      }
       const head = await adapter.getHead();
       const recoveryEligible = await ensureVerifiedErc20RecoveryAssetEligibility(
         network,
         leaseToken,
         head.cursor,
       );
       if (recoveryEligible) {
         await recoverVerifiedErc20Watch(network, leaseToken, adapter);
       }
       await recoverReviewedBep20RegistrationGap(network, leaseToken);
      if (leaseLost) throw new Error("Blockchain monitoring lease was lost.");
      const watches = await db.select().from(blockchainMonitorWatchesTable)
        .where(and(eq(blockchainMonitorWatchesTable.monitorNetworkId, network.id), eq(blockchainMonitorWatchesTable.active, true), eq(blockchainMonitorWatchesTable.registrationState, "active")));
      const watchOrders = watches.length
        ? await db.select({
            id: ordersTable.id,
            status: ordersTable.status,
            manualSettlementState: ordersTable.manualSettlementState,
          }).from(ordersTable).where(inArray(ordersTable.id, watches.map((watch) => watch.orderId)))
        : [];
      const orderById = new Map(watchOrders.map((order) => [order.id, order]));
      const terminalWatchIds = watches
        .filter((watch) => {
          const order = orderById.get(watch.orderId);
          return order
            ? isTerminalBlockchainWatchOrder(order.status, order.manualSettlementState)
            : false;
        })
        .map((watch) => watch.id);
      const deactivatedWatchIds = new Set<string>();
      if (terminalWatchIds.length) {
        const deactivated = await withLease(network.id, leaseToken, async (tx) => {
          const terminalOrderIds = tx.select({ id: ordersTable.id })
            .from(ordersTable)
            .where(or(
              inArray(ordersTable.status, ["completed", "cancelled", "canceled", "expired", "failed", "refunded"]),
              inArray(ordersTable.manualSettlementState, ["completed", "cancelled", "failed", "refunded"]),
            ));
          return tx.update(blockchainMonitorWatchesTable).set({ active: false })
            .where(and(
              inArray(blockchainMonitorWatchesTable.id, terminalWatchIds),
              inArray(blockchainMonitorWatchesTable.orderId, terminalOrderIds),
              eq(blockchainMonitorWatchesTable.active, true),
            ))
            .returning({ id: blockchainMonitorWatchesTable.id });
        });
        for (const watch of deactivated) deactivatedWatchIds.add(watch.id);
      }
      for (const watch of watches) {
        if (deactivatedWatchIds.has(watch.id)) continue;
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
        const ranges = network.adapterKind === "bitcoin"
          ? [boundedBitcoinWatchScanRange(
              from,
              watch.startCursor,
              head.cursor,
              network.maxScanRange,
              Math.max(6, network.confirmationsRequired),
            )]
          : planBoundedWatchCatchUpRanges(
              from,
              head.cursor,
              watch.identityKind,
              network.maxScanRange,
              maxWatchCatchUpRanges(network.networkCode, watch.identityKind),
            );
        try {
          await processBoundedWatchCatchUpRanges({
            ranges,
            initialCursor: watch.currentCursor,
            shouldContinue: () => {
              if (leaseLost) throw new Error("Blockchain monitoring lease was lost.");
              return Date.now() < cycleDeadlineAt - CATCH_UP_DEADLINE_GUARD_MS;
            },
            processRange: async (range) => {
              const result = await adapter.scanIncoming(range, watched);
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
              return result.cursor.to;
            },
            advanceCursor: async (expectedCursor, nextCursor) => withLease(network.id, leaseToken, async (tx) => {
              const [guard] = await tx.select({ token: blockchainMonitorNetworksTable.leaseToken, expires: blockchainMonitorNetworksTable.leaseExpiresAt }).from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, network.id)).for("update");
              if (!guard || guard.token !== leaseToken || !guard.expires || guard.expires <= new Date()) throw new Error("Blockchain monitoring lease was lost.");
              const cursorCondition = expectedCursor === null
                ? isNull(blockchainMonitorWatchesTable.currentCursor)
                : eq(blockchainMonitorWatchesTable.currentCursor, expectedCursor);
              const [updated] = await tx.update(blockchainMonitorWatchesTable)
                .set({ currentCursor: nextCursor })
                .where(and(
                  eq(blockchainMonitorWatchesTable.id, watch.id),
                  eq(blockchainMonitorWatchesTable.active, true),
                  cursorCondition,
                ))
                .returning({ id: blockchainMonitorWatchesTable.id });
              return Boolean(updated);
            }),
          });
        } catch (error) {
          logger.warn(
            { err: error, networkId: network.id, watchId: watch.id, orderId: watch.orderId },
            "Blockchain monitoring watch scan failed",
          );
        }
      }
      await refreshConfirming(network, leaseToken, cycleDeadlineAt);
      await applyConfirmedMatches(leaseToken, network.id, cycleDeadlineAt);
      const checkedAt = new Date();
      const legacyBep20 = usesLegacyBep20Readiness(network.networkCode, network.chainId);
      const strictManualProof = shouldRefreshStrictManualReadinessProof(network);
      const healthProofConfig = legacyBep20 ? undefined : adapterConfig(network);
       await withLease(network.id, leaseToken, async (tx) => {
         const [currentNetwork] = await tx.select().from(blockchainMonitorNetworksTable)
           .where(eq(blockchainMonitorNetworksTable.id, network.id))
           .limit(1);
         const currentHealthProofConfig = currentNetwork && !legacyBep20
           ? adapterConfig(currentNetwork)
           : undefined;
         const cycleConfigDigest = healthProofConfig
            ? strictManualProof
             ? manualMonitoringNetworkConfigDigest({
                 network,
                 endpoint: healthProofConfig.endpoint,
                 apiKey: healthProofConfig.apiKey,
               })
             : legacyNetworkConfigDigest(network, healthProofConfig.endpoint, healthProofConfig.apiKey)
           : undefined;
         const currentConfigDigest = currentNetwork && currentHealthProofConfig
            ? strictManualProof
             ? manualMonitoringNetworkConfigDigest({
                 network: currentNetwork,
                 endpoint: currentHealthProofConfig.endpoint,
                 apiKey: currentHealthProofConfig.apiKey,
               })
             : legacyNetworkConfigDigest(
                 currentNetwork,
                 currentHealthProofConfig.endpoint,
                 currentHealthProofConfig.apiKey,
               )
           : undefined;
         if (!legacyBep20 && (
           !currentNetwork ||
           !currentHealthProofConfig ||
           !cycleConfigDigest ||
           currentConfigDigest !== cycleConfigDigest
         )) {
           throw new Error("Blockchain monitoring configuration changed during the scheduler cycle.");
         }
         await tx.update(blockchainMonitorNetworksTable).set({
           lastHead: head.cursor,
           healthStatus: "connected",
           healthCheckedAt: checkedAt,
           lastSuccessfulScanAt: checkedAt,
           consecutiveFailures: 0,
           nextAttemptAt: null,
           healthError: null,
           ...(legacyBep20 || !currentConfigDigest ? {} : {
             healthProofFingerprint: currentConfigDigest,
             healthProofCapturedAt: checkedAt,
           }),
         }).where(eq(blockchainMonitorNetworksTable.id, network.id));
         if (
           !legacyBep20 &&
            strictManualProof &&
           currentHealthProofConfig
         ) {
            const includeInitialTronProofs =
              (currentNetwork?.id === "monitor-trc20" || currentNetwork?.id === "mon-trc20") &&
              currentNetwork.networkCode.trim().toUpperCase() === "TRC20" &&
              currentNetwork?.adapterKind === "tron" &&
              currentNetwork.chainId?.trim().toLowerCase() === TRON_MAINNET_CHAIN_ID;
           const proofRows = await tx.select({
             asset: blockchainMonitorAssetsTable,
             route: cryptoAssetNetworksTable,
           }).from(blockchainMonitorAssetsTable)
             .innerJoin(
               cryptoAssetNetworksTable,
               eq(cryptoAssetNetworksTable.id, blockchainMonitorAssetsTable.assetNetworkId),
             )
             .where(and(
               eq(blockchainMonitorAssetsTable.monitorNetworkId, network.id),
                includeInitialTronProofs
                  ? or(
                      isNotNull(blockchainMonitorAssetsTable.readinessProofFingerprint),
                      and(
                        eq(blockchainMonitorAssetsTable.enabled, true),
                        eq(cryptoAssetNetworksTable.sharedDepositAddress, "TBLc145ZDNs4LjPqQtuvqkEDjhesemTosd"),
                        or(
                          and(
                            eq(cryptoAssetNetworksTable.id, "trx-tron"),
                            eq(blockchainMonitorAssetsTable.identityKind, "native"),
                            isNull(blockchainMonitorAssetsTable.contractOrMint),
                            eq(blockchainMonitorAssetsTable.decimals, 6),
                          ),
                          and(
                            eq(cryptoAssetNetworksTable.id, "usdt-trc20"),
                            eq(blockchainMonitorAssetsTable.identityKind, "token"),
                            eq(
                              blockchainMonitorAssetsTable.contractOrMint,
                              "41a614f803b6fd780986a42c78ec9c7f77e6ded13c",
                            ),
                            eq(blockchainMonitorAssetsTable.decimals, 6),
                          ),
                        ),
                      ),
                    )
                  : isNotNull(blockchainMonitorAssetsTable.readinessProofFingerprint),
             ));
           for (const { asset, route } of proofRows) {
             const readinessProofFingerprint = manualMonitoringProofFingerprint({
               network: currentNetwork,
               asset,
               route,
               endpoint: currentHealthProofConfig.endpoint,
               apiKey: currentHealthProofConfig.apiKey,
               capturedAt: checkedAt,
               head: head.cursor,
             });
             await tx.update(blockchainMonitorAssetsTable).set({
               readinessProofFingerprint,
                readinessProofCapturedAt: checkedAt,
             }).where(and(
               eq(blockchainMonitorAssetsTable.id, asset.id),
               eq(blockchainMonitorAssetsTable.monitorNetworkId, network.id),
                asset.readinessProofFingerprint
                  ? eq(blockchainMonitorAssetsTable.readinessProofFingerprint, asset.readinessProofFingerprint)
                  : and(
                      includeInitialTronProofs
                        ? eq(blockchainMonitorAssetsTable.enabled, true)
                        : sql`false`,
                      isNull(blockchainMonitorAssetsTable.readinessProofFingerprint),
                    ),
             ));
           }
         }
       });
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
          {
            err: leaseError,
            networkId: network.id,
            dbPool: databasePoolTelemetry("blockchain-monitoring-health-update", leaseError),
          },
          "Blockchain monitoring failure could not update health after lease loss",
        );
      }
    } finally {
      clearInterval(heartbeat);
      await releaseLease(network.id, leaseToken).catch((error) => {
        logger.warn(
          {
            err: error,
            networkId: network.id,
            dbPool: databasePoolTelemetry("blockchain-monitoring-lease-release", error),
          },
          "Blockchain monitoring lease release failed",
        );
      });
    }
  }
  } finally {
    cycleRunning = false;
  }
}

export async function applyConfirmedMatches(
  leaseToken: string,
  networkId: string,
  deadlineAtMs: number,
): Promise<void> {
  const [network] = await db.select().from(blockchainMonitorNetworksTable)
    .where(eq(blockchainMonitorNetworksTable.id, networkId)).limit(1);
  if (!network) return;
  const rows = await db.select({
    match: blockchainMonitorMatchesTable,
    observation: blockchainMonitorObservationsTable,
  }).from(blockchainMonitorMatchesTable)
    .innerJoin(
      blockchainMonitorObservationsTable,
      eq(blockchainMonitorObservationsTable.id, blockchainMonitorMatchesTable.observationId),
    )
    .where(and(
      eq(blockchainMonitorMatchesTable.state, "confirming"),
      eq(blockchainMonitorObservationsTable.monitorNetworkId, networkId),
      network.finalityPolicy === "finalized"
        ? eq(blockchainMonitorObservationsTable.finalized, true)
        : sql`${blockchainMonitorMatchesTable.confirmations} >= ${blockchainMonitorMatchesTable.confirmationsRequired}`,
    ))
    .orderBy(blockchainMonitorMatchesTable.updatedAt, blockchainMonitorMatchesTable.id)
    .limit(MAX_MATCH_APPLICATIONS_PER_CYCLE);
  for (const { match, observation } of rows) {
    if (Date.now() >= deadlineAtMs - CATCH_UP_DEADLINE_GUARD_MS) return;
    const [lease] = await db.select({ token: blockchainMonitorNetworksTable.leaseToken, expires: blockchainMonitorNetworksTable.leaseExpiresAt })
      .from(blockchainMonitorNetworksTable).where(and(eq(blockchainMonitorNetworksTable.id, networkId), eq(blockchainMonitorNetworksTable.leaseToken, leaseToken))).limit(1);
    if (!lease || !lease.expires || lease.expires <= new Date()) return;
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
          updatedAt: new Date(),
        }).where(and(
          eq(blockchainMonitorMatchesTable.id, match.id),
          eq(blockchainMonitorMatchesTable.state, "confirming"),
        ));
        return;
      }
      let [current] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, match.orderId), ELIGIBLE)).limit(1);
      if (!current) {
        await tx.update(blockchainMonitorMatchesTable).set({ updatedAt: new Date() })
          .where(and(
            eq(blockchainMonitorMatchesTable.id, match.id),
            eq(blockchainMonitorMatchesTable.state, "confirming"),
          ));
        return;
      }
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
      await tx.update(blockchainMonitorMatchesTable).set({
        state: "applied",
        appliedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(blockchainMonitorMatchesTable.id, match.id));
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
    logger.warn({
      err: error,
      dbPool: databasePoolTelemetry("blockchain-monitoring-worker", error),
    }, "Blockchain monitoring worker failed");
  });
  const interval = setInterval(runSafely, 15_000);
  interval.unref();
  runSafely();
  return () => clearInterval(interval);
}