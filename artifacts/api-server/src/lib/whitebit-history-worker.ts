import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  db, ordersTable, whitebitDepositAddressesTable, whitebitHistoryWorkerStateTable,
  whitebitOrderAddressesTable,
} from "@workspace/db";
import { logger } from "./logger";
import { getWhitebitCredentialStorageState, whitebitCredentialFingerprint } from "./provider-credentials";
import { whitebitHistoryWorkerConfiguration, type WhitebitHistoryCredentialSource } from "./whitebit-history-health";
import { matchWhitebitHistoryForOrder, matchesFrozenWhitebitClaim, type PendingWhitebitOrder, type ReadyWhitebitClaim } from "./whitebit-history-match";
import {
  historyRecords, normalizeWhitebitMemo, processNormalizedDeposit,
  testWhitebitSignedConnection, WhitebitProviderHttpError, whitebitOrderHistory,
  type NormalizedDeposit,
} from "../routes/whitebit";

const STATE_ID = 1;
const TEST_STATE_ID = 2;
const BATCH_SIZE = 2;
const HISTORY_LIMIT = 20;
const POLL_INTERVAL_MS = 60_000;
const LEASE_MS = 90_000;
let running = false;

export class WhitebitHistoryWorkerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

type Candidate = {
  order: typeof ordersTable.$inferSelect;
  claim: typeof whitebitOrderAddressesTable.$inferSelect;
};
type Lease = { token: string; cursor: string | null };

export type WhitebitHistoryCyclePorts = {
  acquire(): Promise<Lease | null>;
  renew(token: string): Promise<boolean>;
  candidates(cursor: string | null): Promise<Candidate[]>;
  history(candidate: Candidate): Promise<Record<string, unknown>[]>;
  apply(token: string, candidate: Candidate, deposit: NormalizedDeposit): Promise<void>;
  advance(token: string, orderId: string): Promise<void>;
  success(token: string): Promise<void>;
  failure(token: string, code: string, message: string): Promise<void>;
  release(token: string): Promise<void>;
};

function mustOwn(owned: boolean): void {
  if (!owned) throw new WhitebitHistoryWorkerError("LEASE_LOST", "History worker lease was lost.");
}

/** Also usable with fully mocked ports; no provider or database traffic is inherent here. */
export async function runWhitebitHistoryCycle(ports: WhitebitHistoryCyclePorts): Promise<"busy" | "success" | "failed"> {
  const lease = await ports.acquire();
  if (!lease) return "busy";
  try {
    const candidates = await ports.candidates(lease.cursor);
    for (const candidate of candidates) {
      mustOwn(await ports.renew(lease.token));
      if (!matchesFrozenWhitebitClaim(candidate.order, candidate.claim)) {
        throw new WhitebitHistoryWorkerError("FROZEN_CLAIM_MISMATCH", "Frozen WhiteBIT order claim no longer matches its funding instructions.");
      }
      const records = await ports.history(candidate);
      const result = matchWhitebitHistoryForOrder(candidate.order, candidate.claim, records);
      if (result.kind === "unsafe") throw new WhitebitHistoryWorkerError("HISTORY_MISMATCH", result.reason);
      mustOwn(await ports.renew(lease.token));
      if (result.kind === "matched") await ports.apply(lease.token, candidate, result.deposit);
      await ports.advance(lease.token, candidate.order.id);
    }
    await ports.success(lease.token);
    return "success";
  } catch (error) {
    if (error instanceof WhitebitHistoryWorkerError && error.code === "LEASE_LOST") return "busy";
    const code = error instanceof WhitebitProviderHttpError && [401, 403].includes(error.providerStatus)
      ? "WHITEBIT_HISTORY_AUTH_REJECTED"
      : error instanceof WhitebitHistoryWorkerError ? error.code : "WHITEBIT_HISTORY_UNAVAILABLE";
    const message = code === "WHITEBIT_HISTORY_AUTH_REJECTED"
      ? "WhiteBIT rejected the selected history credential (HTTP 401/403). Polling is paused; verify the explicitly configured source."
      : error instanceof WhitebitHistoryWorkerError ? error.message : "WhiteBIT history polling failed; no order was changed by this cycle.";
    await ports.failure(lease.token, code, message);
    logger.warn({ code }, "WhiteBIT order-history worker paused");
    return "failed";
  } finally {
    await ports.release(lease.token);
  }
}

async function acquireLease(source: WhitebitHistoryCredentialSource, stateId: number): Promise<Lease | null> {
  const token = randomUUID();
  const now = new Date();
  const [row] = await db.insert(whitebitHistoryWorkerStateTable).values({
    id: stateId, leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS),
    credentialSource: source, lastPollAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: whitebitHistoryWorkerStateTable.id,
    set: { leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), credentialSource: source, lastPollAt: now, updatedAt: now },
    setWhere: and(
      or(isNull(whitebitHistoryWorkerStateTable.leaseUntil), lt(whitebitHistoryWorkerStateTable.leaseUntil, sql`clock_timestamp()`)),
      or(
        isNull(whitebitHistoryWorkerStateTable.nextAttemptAt),
        lte(whitebitHistoryWorkerStateTable.nextAttemptAt, sql`clock_timestamp()`),
        sql`${whitebitHistoryWorkerStateTable.credentialSource} IS DISTINCT FROM ${source}`,
      ),
    ),
  }).returning({ cursor: whitebitHistoryWorkerStateTable.cursorOrderId });
  return row ? { token, cursor: row.cursor } : null;
}

async function renewLease(token: string, stateId: number): Promise<boolean> {
  const [row] = await db.update(whitebitHistoryWorkerStateTable)
    .set({ leaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() })
    .where(and(
      eq(whitebitHistoryWorkerStateTable.id, stateId),
      eq(whitebitHistoryWorkerStateTable.leaseToken, token),
      gt(whitebitHistoryWorkerStateTable.leaseUntil, sql`clock_timestamp()`),
    )).returning({ id: whitebitHistoryWorkerStateTable.id });
  return Boolean(row);
}

async function candidatesAfter(cursor: string | null, testOrderId?: string) {
  return db.select({ order: ordersTable, claim: whitebitOrderAddressesTable })
    .from(whitebitOrderAddressesTable)
    .innerJoin(ordersTable, eq(ordersTable.id, whitebitOrderAddressesTable.orderId))
    .where(and(
      eq(ordersTable.type, "manual"),
      eq(ordersTable.status, "awaiting funds"),
      eq(ordersTable.manualSettlementState, "awaiting_funds"),
      eq(ordersTable.fundingStatus, "ready_whitebit"),
      eq(ordersTable.fundingProviderSource, "whitebit"),
      eq(whitebitOrderAddressesTable.status, "ready"),
      ...(testOrderId ? [eq(ordersTable.id, testOrderId)] : []),
      ...(cursor ? [gt(ordersTable.id, cursor)] : []),
    )).orderBy(asc(ordersTable.id)).limit(BATCH_SIZE);
}

async function applyMatchedDeposit(
  token: string, selected: Candidate, deposit: NormalizedDeposit,
  source: WhitebitHistoryCredentialSource, expectedFingerprint: string, stateId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (!whitebitHistoryWorkerConfiguration().enabled) {
      throw new WhitebitHistoryWorkerError("WORKER_DISABLED", "WhiteBIT history worker was disabled while history was in flight.");
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))`);
    const stored = source === "stored" ? await getWhitebitCredentialStorageState(tx) : null;
    const current = source === "stored"
      ? stored?.status === "available" ? stored.credentials : null
      : process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET
        ? { apiKey: process.env.WHITEBIT_API_KEY, secretKey: process.env.WHITEBIT_API_SECRET } : null;
    if (!current || whitebitCredentialFingerprint(current) !== expectedFingerprint ||
        whitebitHistoryWorkerConfiguration().source !== source) {
      throw new WhitebitHistoryWorkerError("CREDENTIAL_CHANGED", "Selected WhiteBIT credential changed while history was in flight.");
    }
    // The webhook and order-history processor share the same financial lock.
    await tx.execute(sql`select pg_advisory_xact_lock(78122341)`);
    const [lease] = await tx.select({ id: whitebitHistoryWorkerStateTable.id })
      .from(whitebitHistoryWorkerStateTable)
      .where(and(
        eq(whitebitHistoryWorkerStateTable.id, stateId),
        eq(whitebitHistoryWorkerStateTable.leaseToken, token),
        gt(whitebitHistoryWorkerStateTable.leaseUntil, sql`clock_timestamp()`),
      )).for("update").limit(1);
    mustOwn(Boolean(lease));
    const [order] = await tx.select().from(ordersTable)
      .where(eq(ordersTable.id, selected.order.id)).for("update").limit(1);
    const [claim] = await tx.select().from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.orderId, selected.order.id)).for("update").limit(1);
    // A webhook may have completed this order while history was in flight.
    if (order?.status === "processing" && order.manualSettlementState === "funds_confirmed") return;
    if (!order || !claim || claim.id !== selected.claim.id ||
        !matchesFrozenWhitebitClaim(order, claim)) {
      throw new WhitebitHistoryWorkerError("FROZEN_CLAIM_MISMATCH", "Frozen WhiteBIT order claim changed before deposit application.");
    }
    const currentMatch = matchWhitebitHistoryForOrder(order, claim, [deposit.rawPayload]);
    if (currentMatch.kind !== "matched") {
      throw new WhitebitHistoryWorkerError("FROZEN_AMOUNT_CHANGED", "WhiteBIT order terms changed while history was in flight.");
    }
    const claimsAtAddress = await tx.select({ id: whitebitOrderAddressesTable.id })
      .from(whitebitOrderAddressesTable).where(eq(whitebitOrderAddressesTable.address, claim.address!)).limit(2);
    const accountAtAddress = await tx.select({ id: whitebitDepositAddressesTable.id })
      .from(whitebitDepositAddressesTable).where(eq(whitebitDepositAddressesTable.address, claim.address!)).limit(1);
    if (claimsAtAddress.length !== 1 || claimsAtAddress[0]?.id !== claim.id || accountAtAddress.length) {
      throw new WhitebitHistoryWorkerError("ADDRESS_COLLISION", "Frozen address belongs to another funding claim.");
    }
    if (deposit.address !== claim.address || deposit.ticker !== claim.ticker ||
        deposit.providerTicker !== claim.providerTicker || deposit.network !== claim.network ||
        normalizeWhitebitMemo(deposit.memo) !== normalizeWhitebitMemo(claim.memo)) {
      throw new WhitebitHistoryWorkerError("HISTORY_MISMATCH", "History record changed before application.");
    }
    await processNormalizedDeposit(tx, deposit);
    const [updated] = await tx.select({ status: ordersTable.status, settlement: ordersTable.manualSettlementState })
      .from(ordersTable).where(eq(ordersTable.id, order.id)).limit(1);
    if (updated?.status !== "processing" || updated.settlement !== "funds_confirmed") {
      throw new WhitebitHistoryWorkerError("DEPOSIT_NOT_APPLIED", "WhiteBIT deposit did not confirm the exact pending order.");
    }
  });
}

function productionPorts(source: WhitebitHistoryCredentialSource, testOrderId?: string): WhitebitHistoryCyclePorts {
  const stateId = testOrderId ? TEST_STATE_ID : STATE_ID;
  let credentialSnapshot: { apiKey: string; secretKey: string } | null = null;
  return {
    acquire: () => acquireLease(source, stateId),
    renew: (token) => renewLease(token, stateId),
    candidates: async (cursor) => {
      const rows = await candidatesAfter(cursor, testOrderId);
      return rows.length || !cursor ? rows : candidatesAfter(null, testOrderId);
    },
    history: async (candidate) => {
      if (!credentialSnapshot) {
        const stored = source === "stored" ? await getWhitebitCredentialStorageState() : null;
        credentialSnapshot = source === "stored"
          ? stored?.status === "available" ? stored.credentials : null
          : process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET
            ? { apiKey: process.env.WHITEBIT_API_KEY, secretKey: process.env.WHITEBIT_API_SECRET } : null;
        if (!credentialSnapshot) throw new WhitebitHistoryWorkerError("CREDENTIAL_UNAVAILABLE", "Selected WhiteBIT history credential is unavailable.");
        // A saved verification fingerprint alone is insufficient: a stale key
        // can still be rejected by WhiteBIT. Validate the selected snapshot.
        await testWhitebitSignedConnection(credentialSnapshot);
      }
      const response = await whitebitOrderHistory({
        providerTicker: candidate.claim.providerTicker,
        address: candidate.claim.address!,
        memo: candidate.claim.memo,
      }, credentialSnapshot, HISTORY_LIMIT);
      const records = historyRecords(response);
      const envelope = response && typeof response === "object" && !Array.isArray(response)
        ? response as { total?: unknown; records?: unknown; data?: unknown } : null;
      const rawRecords = Array.isArray(response) ? response : envelope?.records ?? envelope?.data;
      if (!Array.isArray(rawRecords) || rawRecords.length !== records.length) {
        throw new WhitebitHistoryWorkerError("HISTORY_MALFORMED", "WhiteBIT history contains malformed records; no deposit was applied.");
      }
      const total = envelope?.total === undefined ? null : Number(envelope.total);
      if (total !== null && (!Number.isSafeInteger(total) || total < 0)) {
        throw new WhitebitHistoryWorkerError("HISTORY_MALFORMED", "WhiteBIT history total is invalid; no deposit was applied.");
      }
      if (records.length >= HISTORY_LIMIT || (total !== null && total > records.length)) {
        throw new WhitebitHistoryWorkerError("HISTORY_WINDOW_EXCEEDED", "Exact-address history exceeds the bounded first page; operator review required.");
      }
      return records;
    },
    apply: async (token, candidate, deposit) => {
      if (!credentialSnapshot) throw new WhitebitHistoryWorkerError("CREDENTIAL_UNAVAILABLE", "Selected WhiteBIT credential was not verified.");
      await applyMatchedDeposit(token, candidate, deposit, source, whitebitCredentialFingerprint(credentialSnapshot), stateId);
    },
    advance: async (token, orderId) => {
      const [row] = await db.update(whitebitHistoryWorkerStateTable)
        .set({ cursorOrderId: orderId, updatedAt: new Date() })
        .where(and(eq(whitebitHistoryWorkerStateTable.id, stateId), eq(whitebitHistoryWorkerStateTable.leaseToken, token),
          gt(whitebitHistoryWorkerStateTable.leaseUntil, sql`clock_timestamp()`)))
        .returning({ id: whitebitHistoryWorkerStateTable.id });
      mustOwn(Boolean(row));
    },
    success: async (token) => {
      const [row] = await db.update(whitebitHistoryWorkerStateTable)
        .set({ lastSuccessAt: new Date(), lastError: null, lastErrorCode: null, lastErrorAt: null,
          nextAttemptAt: null, failureCount: 0, updatedAt: new Date() })
        .where(and(eq(whitebitHistoryWorkerStateTable.id, stateId), eq(whitebitHistoryWorkerStateTable.leaseToken, token),
          gt(whitebitHistoryWorkerStateTable.leaseUntil, sql`clock_timestamp()`)))
        .returning({ id: whitebitHistoryWorkerStateTable.id });
      mustOwn(Boolean(row));
    },
    failure: async (token, code, message) => {
      const [state] = await db.select({ failureCount: whitebitHistoryWorkerStateTable.failureCount })
        .from(whitebitHistoryWorkerStateTable)
        .where(and(eq(whitebitHistoryWorkerStateTable.id, stateId), eq(whitebitHistoryWorkerStateTable.leaseToken, token))).limit(1);
      if (!state) return;
      const failures = Math.min(state.failureCount + 1, 8);
      const delay = code === "WHITEBIT_HISTORY_AUTH_REJECTED"
        ? 30 * 60_000 : Math.min(5 * 60_000, 15_000 * 2 ** (failures - 1));
      await db.update(whitebitHistoryWorkerStateTable)
        .set({ lastErrorAt: new Date(), lastError: message, lastErrorCode: code,
          nextAttemptAt: new Date(Date.now() + delay), failureCount: failures, updatedAt: new Date() })
        .where(and(eq(whitebitHistoryWorkerStateTable.id, stateId), eq(whitebitHistoryWorkerStateTable.leaseToken, token)));
    },
    release: async (token) => {
      await db.update(whitebitHistoryWorkerStateTable)
        .set({ leaseToken: null, leaseUntil: null, updatedAt: new Date() })
        .where(and(eq(whitebitHistoryWorkerStateTable.id, stateId), eq(whitebitHistoryWorkerStateTable.leaseToken, token)));
    },
  };
}

export async function runConfiguredWhitebitHistoryCycle(testOrderId?: string): Promise<void> {
  if (testOrderId && process.env.NODE_ENV !== "test") {
    throw new Error("WhiteBIT fixture order scoping is test-only.");
  }
  const config = whitebitHistoryWorkerConfiguration();
  if (!config.enabled || !config.source || running) return;
  running = true;
  try {
    await runWhitebitHistoryCycle(productionPorts(config.source, testOrderId));
  } catch (error) {
    logger.error({ code: error instanceof WhitebitHistoryWorkerError ? error.code : "WORKER_UNAVAILABLE" }, "WhiteBIT history worker could not acquire its lease");
  } finally {
    running = false;
  }
}

export function startWhitebitHistoryWorker(): () => void {
  const { enabled, source } = whitebitHistoryWorkerConfiguration();
  if (!enabled || !source) return () => {};
  const timer = setInterval(() => { void runConfiguredWhitebitHistoryCycle(); }, POLL_INTERVAL_MS);
  timer.unref();
  void runConfiguredWhitebitHistoryCycle();
  return () => clearInterval(timer);
}