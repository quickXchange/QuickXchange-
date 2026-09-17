import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNull, lte, notInArray, or } from "drizzle-orm";
import { affiliateAccountsTable, affiliateCompletionEventsTable, affiliateSettingsTable, db, providerSyncStatesTable, quickexOrdersTable } from "@workspace/db";
import { ApiError } from "./api-error";
import {
  createQuickexOrder, getQuickexInstruments, getQuickexPairs, mapQuickexState, type QuickexRateMode,
  validateQuickexAddress, listQuickexOrders,
} from "./quickex";
import { verifyQuoteTicket } from "./quote-ticket";
import { signOrderTrackingToken, verifyOrderTrackingToken } from "./order-access";
import { assertExecutableQuickexRoute } from "./provider-capabilities";

type CreateInput = {
  fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string;
  amount: number; rateMode?: QuickexRateMode; destinationAddress?: string;
  destinationMemo?: string; refundAddress?: string; refundMemo?: string;
  customerEmail?: string; customerName?: string; clientRequestId: string; quoteId: string;
  sourceSettlementOptionId?: string; targetSettlementOptionId?: string;
  customerClerkUserId?: string;
};
type Route = { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string; rateMode: QuickexRateMode };
type Amounts = { amount: string; receiveAmount: string; claimedDepositAmount?: string | null; expectedReceiveAmount?: string | null; paidAmount?: string | null };
type Addresses = { destinationAddress: string; destinationMemo?: string; refundAddress: string; refundMemo?: string; depositAddress?: string; depositMemo?: string };
const QUICKEX_FINAL_STATUSES = ["failed", "cancelled", "refunded", "reversed", "expired"];
const QUICKEX_REVERSAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const QUICKEX_PROVIDER_SNAPSHOT_KEY = "quickex-order-reconciliation";
const QUICKEX_PROVIDER_SNAPSHOT_TTL_MS = process.env.NODE_ENV === "test" ? 0 : 10_000;
const QUICKEX_PROVIDER_LEASE_MS = 30_000;
const QUICKEX_MAX_BACKOFF_MS = 15 * 60 * 1_000;
const QUICKEX_RECONCILIATION_FRESHNESS_MS = 2 * 60 * 1_000;
type QuickexOrderSnapshot = Awaited<ReturnType<typeof listQuickexOrders>>;
let providerSnapshotCache: { expiresAt: number; rows: QuickexOrderSnapshot } | undefined;
let providerSnapshotInFlight: Promise<QuickexOrderSnapshot | null> | undefined;

export async function getQuickexReconciliationHealth(now = new Date(Date.now())) {
  const [row] = await db.select({
    lastStartedAt: providerSyncStatesTable.lastStartedAt,
    lastSucceededAt: providerSyncStatesTable.lastSucceededAt,
    lastFailedAt: providerSyncStatesTable.lastFailedAt,
    consecutiveFailures: providerSyncStatesTable.consecutiveFailures,
    nextAttemptAt: providerSyncStatesTable.nextAttemptAt,
  }).from(providerSyncStatesTable)
    .where(eq(providerSyncStatesTable.provider, QUICKEX_PROVIDER_SNAPSHOT_KEY))
    .limit(1);
  const consecutiveFailures = row?.consecutiveFailures ?? 0;
  const freshnessMs = row?.lastSucceededAt
    ? Math.max(0, now.getTime() - row.lastSucceededAt.getTime())
    : null;
  const coolingDown = consecutiveFailures > 0 &&
    Boolean(row?.nextAttemptAt && row.nextAttemptAt.getTime() > now.getTime());
  return {
    state: consecutiveFailures > 0
      ? coolingDown
        ? "cooling_down" as const
        : "degraded" as const
      : freshnessMs === null || freshnessMs > QUICKEX_RECONCILIATION_FRESHNESS_MS
        ? "stale" as const
        : "healthy" as const,
    consecutiveFailures,
    freshnessMs,
    lastStartedAt: row?.lastStartedAt?.toISOString() ?? null,
    lastSucceededAt: row?.lastSucceededAt?.toISOString() ?? null,
    lastFailedAt: row?.lastFailedAt?.toISOString() ?? null,
    nextRetryAt: coolingDown ? row!.nextAttemptAt!.toISOString() : null,
  };
}

export function isQuickexReconciliationCandidate(
  status: string,
  updatedAt = new Date(),
  now = Date.now(),
) {
  const normalized = status.toLowerCase();
  if (normalized === "completed") {
    return updatedAt.getTime() >= now - QUICKEX_REVERSAL_WINDOW_MS;
  }
  return !QUICKEX_FINAL_STATUSES.includes(normalized);
}

function positiveProviderAmount(value: string | null | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? value : null;
}

/**
 * All worker and public refreshes pass through one provider-wide coordinator.
 * The database lease/cooldown protects across API processes; the short local
 * cache and in-flight promise coalesce bursts inside one process.
 */
async function getQuickexOrderSnapshot(): Promise<QuickexOrderSnapshot | null> {
  const nowMs = Date.now();
  if (providerSnapshotCache && providerSnapshotCache.expiresAt > nowMs) {
    return providerSnapshotCache.rows;
  }
  if (providerSnapshotInFlight) return providerSnapshotInFlight;

  const inFlight = (async () => {
    const now = new Date();
    const leaseToken = randomUUID();
    await db.insert(providerSyncStatesTable).values({
      provider: QUICKEX_PROVIDER_SNAPSHOT_KEY,
    }).onConflictDoNothing();
    const [claimed] = await db.update(providerSyncStatesTable).set({
      leaseToken,
      leaseExpiresAt: new Date(nowMs + QUICKEX_PROVIDER_LEASE_MS),
      lastStartedAt: now,
      updatedAt: now,
    }).where(and(
      eq(providerSyncStatesTable.provider, QUICKEX_PROVIDER_SNAPSHOT_KEY),
      or(isNull(providerSyncStatesTable.leaseExpiresAt), lte(providerSyncStatesTable.leaseExpiresAt, now)),
      or(isNull(providerSyncStatesTable.nextAttemptAt), lte(providerSyncStatesTable.nextAttemptAt, now)),
    )).returning();
    if (!claimed) return null;

    try {
      const rows = await listQuickexOrders();
      const completedAt = new Date();
      providerSnapshotCache = {
        rows,
        expiresAt: completedAt.getTime() + QUICKEX_PROVIDER_SNAPSHOT_TTL_MS,
      };
      await db.update(providerSyncStatesTable).set({
        leaseToken: null,
        leaseExpiresAt: null,
        lastSucceededAt: completedAt,
        lastErrorCode: "",
        consecutiveFailures: 0,
        nextAttemptAt: new Date(completedAt.getTime() + QUICKEX_PROVIDER_SNAPSHOT_TTL_MS),
        updatedAt: completedAt,
      }).where(and(
        eq(providerSyncStatesTable.provider, QUICKEX_PROVIDER_SNAPSHOT_KEY),
        eq(providerSyncStatesTable.leaseToken, leaseToken),
      ));
      return rows;
    } catch (error) {
      const failures = claimed.consecutiveFailures + 1;
      const exponential = Math.min(30_000 * (2 ** (failures - 1)), QUICKEX_MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * Math.min(5_000, exponential / 4));
      const failedAt = new Date();
      await db.update(providerSyncStatesTable).set({
        leaseToken: null,
        leaseExpiresAt: null,
        lastFailedAt: failedAt,
        lastErrorCode: "PROVIDER_UNAVAILABLE",
        consecutiveFailures: failures,
        nextAttemptAt: new Date(failedAt.getTime() + exponential + jitter),
        updatedAt: failedAt,
      }).where(and(
        eq(providerSyncStatesTable.provider, QUICKEX_PROVIDER_SNAPSHOT_KEY),
        eq(providerSyncStatesTable.leaseToken, leaseToken),
      ));
      throw error;
    }
  })();
  providerSnapshotInFlight = inFlight;
  try {
    return await inFlight;
  } finally {
    providerSnapshotInFlight = undefined;
  }
}

function output(row: typeof quickexOrdersTable.$inferSelect, includeInstructions = true) {
  const route = row.route as Route, amounts = row.amounts as Amounts, addresses = row.addresses as Addresses;
  return {
    id: row.legacyOrderId, type: "instant", status: row.status, recordVersion: row.recordVersion,
    assignedOperatorId: null, archivedAt: null, archivedBy: null,
    supportStatus: "open", sendingStatus: "pending", receivingStatus: "pending",
    sentAmountOverride: null, receiveAmountOverride: null, exchangeRateOverride: null,
    networkFeeAmount: null, transactionHash: null, paymentReference: null,
    fromAsset: route.fromAsset, fromNetwork: route.fromNetwork, toAsset: route.toAsset, toNetwork: route.toNetwork,
    amount: amounts.amount, receiveAmount: amounts.receiveAmount, customerEmail: row.customerEmail,
    customerName: row.customerName, customerRegistered: Boolean(row.customerClerkUserId),
    ...(includeInstructions ? {
      destinationAddress: addresses.destinationAddress, destinationMemo: addresses.destinationMemo,
      refundAddress: addresses.refundAddress, refundMemo: addresses.refundMemo,
      depositAddress: addresses.depositAddress, depositMemo: addresses.depositMemo,
    } : {}),
    provider: "Quickex", providerReference: row.providerReference, providerOrderId: row.providerOrderId,
    providerState: row.providerState, rateMode: route.rateMode, quoteId: row.quoteId,
    clientRequestId: row.clientRequestId ?? undefined, outcomeUnknown: row.outcomeUnknown,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    trackingToken: signOrderTrackingToken(row.legacyOrderId),
    providerClaimedDepositAmount: amounts.claimedDepositAmount ?? null,
    providerExpectedReceiveAmount: amounts.expectedReceiveAmount ?? null,
    providerPaidAmount: amounts.paidAmount ?? null, providerCreatedAt: null, providerUpdatedAt: null,
    providerCompleted: null,
  };
}

export async function createQuickexConvertOrder(input: CreateInput) {
  const [existing] = await db.select().from(quickexOrdersTable)
    .where(eq(quickexOrdersTable.clientRequestId, input.clientRequestId)).limit(1);
  if (existing) {
    const route = existing.route as Route;
    const amounts = existing.amounts as Amounts;
    const addresses = existing.addresses as Addresses;
    const sameRequest =
      existing.quoteId === input.quoteId &&
      route.fromAsset === input.fromAsset &&
      route.fromNetwork === input.fromNetwork &&
      route.toAsset === input.toAsset &&
      route.toNetwork === input.toNetwork &&
      route.rateMode === (input.rateMode ?? "FLOATING") &&
      Number(amounts.amount) === input.amount &&
      existing.customerEmail === (input.customerEmail ?? "") &&
      existing.customerClerkUserId === (input.customerClerkUserId ?? null) &&
      existing.customerName === (input.customerName ?? "Guest") &&
      addresses.destinationAddress === (input.destinationAddress ?? "") &&
      (addresses.destinationMemo ?? "") === (input.destinationMemo ?? "") &&
      addresses.refundAddress === (input.refundAddress ?? "") &&
      (addresses.refundMemo ?? "") === (input.refundMemo ?? "");
    if (!sameRequest) {
      throw new ApiError(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key belongs to a different Quickex Convert order.",
        409,
      );
    }
    return { row: existing, created: false, uncertain: existing.outcomeUnknown };
  }
  const capability = await assertExecutableQuickexRoute(input);
  if (!input.destinationAddress || !input.customerEmail) {
    throw new ApiError("VALIDATION_ERROR", "Destination address and email are required.", 400);
  }
  const rateMode = input.rateMode ?? "FLOATING";
  const ticket = verifyQuoteTicket(input.quoteId, {
    type: "instant", fromAsset: input.fromAsset, fromNetwork: input.fromNetwork,
    toAsset: input.toAsset, toNetwork: input.toNetwork, amount: input.amount, rateMode,
    sourceSettlementOptionId: input.sourceSettlementOptionId ??
      `api:${capability.source.providerId}:${capability.source.networkId}`,
    targetSettlementOptionId: input.targetSettlementOptionId ??
      `api:${capability.target.providerId}:${capability.target.networkId}`,
  });
  if (!ticket.quickexQuote) throw new ApiError("QUOTE_INVALID", "The quote ticket lacks a provider quote.", 400);
  const instruments = await getQuickexInstruments();
  const sourceInstrument = instruments.find(item =>
    item.currencyTitle.toUpperCase() === input.fromAsset.toUpperCase() &&
    item.networkTitle.toUpperCase() === input.fromNetwork.toUpperCase());
  const targetInstrument = instruments.find(item =>
    item.currencyTitle.toUpperCase() === input.toAsset.toUpperCase() &&
    item.networkTitle.toUpperCase() === input.toNetwork.toUpperCase());
  if (
    (input.refundAddress && sourceInstrument?.requiresMemo && !input.refundMemo?.trim()) ||
    (targetInstrument?.requiresMemo && !input.destinationMemo?.trim())
  ) {
    throw new ApiError(
      "QUICKEX_MEMO_REQUIRED",
      "A memo or destination tag is required for this network.",
      400,
    );
  }
  const addressValidations = [
    validateQuickexAddress({ currencyTitle: input.toAsset, networkTitle: input.toNetwork, address: input.destinationAddress, memo: input.destinationMemo }),
  ];
  if (input.refundAddress) {
    addressValidations.push(
      validateQuickexAddress({ currencyTitle: input.fromAsset, networkTitle: input.fromNetwork, address: input.refundAddress, memo: input.refundMemo }),
    );
  }
  await Promise.all(addressValidations);
  const now = new Date(), id = `QX-${randomUUID()}`;
  const base = {
    legacyOrderId: id, clientRequestId: input.clientRequestId, quoteId: input.quoteId,
    customerEmail: input.customerEmail, customerName: input.customerName ?? "Guest",
    customerClerkUserId: input.customerClerkUserId,
    route: { fromAsset: input.fromAsset, fromNetwork: input.fromNetwork, toAsset: input.toAsset, toNetwork: input.toNetwork, rateMode },
    addresses: { destinationAddress: input.destinationAddress, destinationMemo: input.destinationMemo ?? "", refundAddress: input.refundAddress ?? "", refundMemo: input.refundAddress ? input.refundMemo ?? "" : "" },
    createdAt: now, updatedAt: now,
  };
  const [intent] = await db.insert(quickexOrdersTable).values({
    ...base,
    providerOrderId: "",
    providerReference: "",
    status: "verification required",
    providerState: "submission pending",
    outcomeUnknown: true,
    amounts: {
      amount: String(input.amount),
      receiveAmount: ticket.quickexQuote.amountToGet,
    },
  }).onConflictDoNothing({ target: quickexOrdersTable.clientRequestId }).returning();
  if (!intent) {
    // The winner has durably claimed this complete request before any provider
    // side effect. Re-entering performs the full payload comparison above.
    return createQuickexConvertOrder(input);
  }
  try {
    const result = await createQuickexOrder({
      fromCurrency: input.fromAsset, fromNetwork: input.fromNetwork, toCurrency: input.toAsset, toNetwork: input.toNetwork,
      amount: input.amount, destinationAddress: input.destinationAddress, destinationMemo: input.destinationMemo,
      refundAddress: input.refundAddress, refundMemo: input.refundAddress ? input.refundMemo : undefined, email: input.customerEmail, rateMode, quote: ticket.quickexQuote,
    });
    const [row] = await db.update(quickexOrdersTable).set({
      providerOrderId: result.order.providerOrderId ?? "",
      providerReference: result.order.providerReference ?? String(result.order.orderId),
      status: mapQuickexState(result.order.state), providerState: result.order.state ?? "",
      amounts: { amount: String(input.amount), receiveAmount: result.order.amountToGet ?? result.quote.amountToGet },
      addresses: { ...base.addresses, depositAddress: result.order.depositAddress, depositMemo: result.order.depositMemo ?? "" },
      outcomeUnknown: false,
      updatedAt: new Date(),
      recordVersion: intent.recordVersion + 1,
    }).where(eq(quickexOrdersTable.legacyOrderId, intent.legacyOrderId)).returning();
    providerSnapshotCache = undefined;
    return { row, created: true, uncertain: false };
  } catch (error) {
    // A transport failure after submission is durable and must never cause a retry.
    if ((error as { outcomeUnknown?: boolean }).outcomeUnknown) {
      return { row: intent, created: true, uncertain: true };
    }
    await db.delete(quickexOrdersTable)
      .where(eq(quickexOrdersTable.legacyOrderId, intent.legacyOrderId));
    throw error;
  }
}

export async function getQuickexOrderStatus(id: string, token?: string) {
  const [row] = await db.select().from(quickexOrdersTable).where(eq(quickexOrdersTable.legacyOrderId, id)).limit(1);
  if (!row) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
  // Convert IDs embed a random UUID and are themselves unguessable capability
  // identifiers. This lets the advertised paste-an-ID tracking flow work
  // without weakening the token requirement for short Manual Swap IDs.
  const hasCapabilityId = /^QX-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!hasCapabilityId && !verifyOrderTrackingToken(token, id)) {
    throw new ApiError("ORDER_TRACKING_TOKEN_REQUIRED", "A valid order tracking token is required.", 403);
  }
  // Reconciliation belongs here rather than the Manual exchange route. Failure
  // to refresh never prevents a capability holder seeing the last durable state.
  let current = row;
  let refreshUnavailable = false;
  try {
    const provider = await getQuickexOrderSnapshot();
    if (!provider) throw new Error("QuickEx order refresh is currently throttled.");
    // Never guess which provider order belongs to a local aggregate. The UUID
    // returned by create is retained as providerReference; list reconciliation
    // begins only after an exact canonical list id has been recorded.
    const match = row.providerOrderId
      ? provider.find(item => String(item.orderId) === row.providerOrderId)
      : row.providerReference
        ? provider.find(item => item.providerReference === row.providerReference)
        : undefined;
    if (match) current = await reconcileQuickexOrder(row, match) ?? row;
  } catch {
    refreshUnavailable = true;
  }
  return {
    ...output(current),
    refreshUnavailable,
    providerFreshness: {
      state: refreshUnavailable ? "unavailable" as const : "healthy" as const,
      syncing: false,
    },
  };
}

export async function reconcileQuickexOrder(row: typeof quickexOrdersTable.$inferSelect, match: {
  orderId: string | number; providerReference?: string | null; state?: string | null; completed?: boolean;
  amountToWithdrawFact?: string | null; amountToGet?: string | null; claimedDepositAmount?: string | null;
}) {
      const amounts = row.amounts as Amounts;
      const paidAmount = positiveProviderAmount(match.amountToWithdrawFact)
        ?? positiveProviderAmount(amounts.paidAmount);
      const expectedReceiveAmount = positiveProviderAmount(match.amountToGet)
        ?? positiveProviderAmount(amounts.expectedReceiveAmount);
       const nextStatus = mapQuickexState(match.state ?? undefined, match.completed);
       const nextAmounts = {
         ...amounts,
         receiveAmount: paidAmount || expectedReceiveAmount || amounts.receiveAmount,
         claimedDepositAmount: match.claimedDepositAmount,
         expectedReceiveAmount,
         paidAmount,
       };
       const nextProviderOrderId = String(match.orderId);
       const nextProviderState = match.state ?? "";
       if (
         row.providerOrderId === nextProviderOrderId &&
         row.status === nextStatus &&
         row.providerState === nextProviderState &&
         JSON.stringify(amounts) === JSON.stringify(nextAmounts)
       ) {
         return row;
       }
       const next = {
         providerOrderId: nextProviderOrderId,
         status: nextStatus, providerState: nextProviderState,
        outcomeUnknown: false, updatedAt: new Date(),
         amounts: nextAmounts,
        recordVersion: row.recordVersion + 1,
      };
       const updated = await db.transaction(async tx => {
         const [persisted] = await tx.update(quickexOrdersTable).set(next)
           .where(and(eq(quickexOrdersTable.legacyOrderId, row.legacyOrderId), eq(quickexOrdersTable.recordVersion, row.recordVersion))).returning();
         if (!persisted) return undefined;
         const completing = persisted.status === "completed" && row.status !== "completed";
         const reversing = ["refunded", "reversed"].includes(persisted.status.toLowerCase()) && row.status === "completed";
         if (completing || reversing) {
           const [customerAffiliate] = persisted.customerClerkUserId
             ? await tx.select().from(affiliateAccountsTable).where(eq(affiliateAccountsTable.customerClerkUserId, persisted.customerClerkUserId)).limit(1)
             : [];
           const [settings] = await tx.select().from(affiliateSettingsTable).orderBy(desc(affiliateSettingsTable.version)).limit(1);
           const snapshot = customerAffiliate?.referrerAccountId && settings ? {
             customerAffiliateAccountId: customerAffiliate.id, referrerAccountId: customerAffiliate.referrerAccountId,
             settings: { version: settings.version, enabled: settings.enabled, aggregateEnabled: settings.quickexEnabled, rate: settings.commissionRate, minimumEligibleUsd: settings.minimumEligibleUsd, transactionCapUsd: settings.transactionCapUsd },
           } : null;
           await tx.insert(affiliateCompletionEventsTable).values({
             aggregateType: "quickex", aggregateId: persisted.legacyOrderId, completionVersion: persisted.recordVersion,
             eventType: reversing ? "reversal" : "completed",
             payload: { customerClerkUserId: persisted.customerClerkUserId, snapshot },
           }).onConflictDoNothing();
         }
         return persisted;
       });
       return updated;
}
export async function reconcilePendingQuickexOrders(limit = 50) {
  const reversalCutoff = new Date(Date.now() - QUICKEX_REVERSAL_WINDOW_MS);
  const candidates = await db.select().from(quickexOrdersTable)
    .where(or(
      notInArray(quickexOrdersTable.status, [...QUICKEX_FINAL_STATUSES, "completed"]),
      and(eq(quickexOrdersTable.status, "completed"), gte(quickexOrdersTable.updatedAt, reversalCutoff)),
    ))
    .orderBy(quickexOrdersTable.updatedAt)
    .limit(limit);
  // The provider-wide health check runs even when no orders need updates so an
  // idle installation still proves freshness and can recover from cooldown.
  const provider = await getQuickexOrderSnapshot();
  if (!provider) return 0;
  if (candidates.length === 0) return 0;
  for (const row of candidates) {
    try {
      const match = row.providerOrderId ? provider.find(item => String(item.orderId) === row.providerOrderId)
        : row.providerReference ? provider.find(item => item.providerReference === row.providerReference) : undefined;
      if (match) await reconcileQuickexOrder(row, match);
    } catch { /* isolate malformed or concurrently changed aggregates */ }
  }
  return candidates.length;
}
export { output as outputQuickexOrder };

export async function assertQuickexPair(input: Pick<CreateInput, "fromAsset" | "fromNetwork" | "toAsset" | "toNetwork">) {
  const pairs = await getQuickexPairs();
  if (!pairs.some(p => p.instrumentFromCurrencyTitle.toUpperCase() === input.fromAsset.toUpperCase() &&
    p.instrumentFromNetworkTitle.toUpperCase() === input.fromNetwork.toUpperCase() &&
    p.instrumentToCurrencyTitle.toUpperCase() === input.toAsset.toUpperCase() &&
    p.instrumentToNetworkTitle.toUpperCase() === input.toNetwork.toUpperCase())) {
    throw new ApiError("QUICKEX_ROUTE_INVALID", "This exchange route is unavailable.", 422);
  }
}