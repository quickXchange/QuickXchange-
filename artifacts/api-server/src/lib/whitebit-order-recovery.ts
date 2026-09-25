import crypto from "node:crypto";
import { eq, or, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  whitebitApiNonceTable,
  whitebitDepositAddressesTable,
  whitebitDepositsTable,
  whitebitOrderAddressesTable,
} from "@workspace/db";
import {
  getWhitebitCredentialStateForSource,
  whitebitCredentialSourceConfiguration,
} from "./provider-credentials";
import {
  assetIdentity,
  historyRecords,
  normalizeWhitebitMemo,
  processNormalizedDeposit,
} from "../routes/whitebit";

// This recovery is deliberately scoped to one reviewed Development order.
const ORDER_ID = "O696531129";
const HISTORY_PATH = "/api/v4/main-account/history";
type HistoryRow = Record<string, unknown>;

function stop(reason: string): never {
  throw new Error(`WhiteBIT single-order recovery preview stopped: ${reason}`);
}

function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function redact(value: string): string {
  return value.length <= 12 ? `${value.slice(0, 3)}…` : `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function decimalUnits(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

function assertFrozenOrder(
  order: typeof ordersTable.$inferSelect | undefined,
  claim: typeof whitebitOrderAddressesTable.$inferSelect | undefined,
) {
  if (!order || !claim || !claim.address || !order.depositAddress ||
    order.id !== ORDER_ID || claim.orderId !== ORDER_ID ||
    order.type !== "manual" || order.fromAsset !== "BNB" || order.fromNetwork !== "BNB" ||
    claim.status !== "ready" || claim.ticker !== "BNB" ||
    claim.providerTicker !== "BNB" || claim.network !== "BEP20" ||
    order.fundingStatus !== "ready_whitebit" || order.fundingProviderSource !== "whitebit" ||
    order.sourceSettlementOptionId !== "crypto:bnb-bnb" ||
    claim.address !== order.depositAddress) stop("frozen order/claim identity changed");
  const funding = (order.fundingDetailsSnapshot ?? {}) as Record<string, unknown>;
  const settlementFunding = ((order.settlementSnapshot ?? {}) as { funding?: Record<string, unknown> }).funding;
  if (funding.networkId !== "bnb-bnb" || funding.whitebitAssetCode !== "BNB" ||
    funding.whitebitNetworkCode !== "BEP20" || funding.address !== claim.address ||
    funding.addressSource !== "live_api" || funding.selectedProvider !== "whitebit" ||
    settlementFunding?.address !== claim.address ||
    normalizeWhitebitMemo(funding.memo) !== normalizeWhitebitMemo(claim.memo) ||
    normalizeWhitebitMemo(settlementFunding?.memo) !== normalizeWhitebitMemo(claim.memo) ||
    normalizeWhitebitMemo(order.depositMemo) !== normalizeWhitebitMemo(claim.memo)) {
    stop("frozen funding instructions differ from the address claim");
  }
  return { order, claim };
}

async function readOnlyHistory(
  address: string, ticker: string, memo: string | null,
  credentialSource: "stored" | "environment",
): Promise<HistoryRow[]> {
  const selected = await getWhitebitCredentialStateForSource(credentialSource);
  const credentials = selected.status === "available" && selected.source === credentialSource
    ? selected.credentials
    : null;
  if (!credentials) stop("Development WhiteBIT credentials are unavailable");
  const [last] = await db.select({ nonce: whitebitApiNonceTable.lastNonce })
    .from(whitebitApiNonceTable).where(eq(whitebitApiNonceTable.id, 1)).limit(1);
  const nonce = Date.now();
  // Do not update the application's nonce table in a dry run. If another API
  // call has reserved a newer nonce, fail rather than risk replay/collision.
  if (!Number.isSafeInteger(nonce) || nonce <= Number(last?.nonce ?? 0)) stop("read-only nonce is not safe");
  const body = JSON.stringify({
    request: HISTORY_PATH, nonce, transactionMethod: 1, ticker, address,
    ...(memo ? { memo } : {}), limit: 500, offset: 0,
  });
  const payload = Buffer.from(body).toString("base64");
  const signature = crypto.createHmac("sha512", credentials.secretKey).update(payload).digest("hex");
  const response = await fetch(`https://whitebit.com${HISTORY_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TXC-APIKEY": credentials.apiKey,
      "X-TXC-PAYLOAD": payload,
      "X-TXC-SIGNATURE": signature,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code).slice(0, 60) : "unavailable";
    stop(`history read returned HTTP ${response.status}, provider code ${code}`);
  }
  const result: unknown = await response.json();
  const rows = historyRecords(result);
  const total = result && typeof result === "object" && !Array.isArray(result)
    ? (result as { total?: unknown }).total : undefined;
  if (rows.length >= 500 || (typeof total === "number" && total > rows.length)) {
    stop("history has more than one safe page; no partial recovery");
  }
  return rows;
}

export type WhitebitSingleOrderPreview = {
  mode: "dry-run";
  matchedOrderId: string;
  matchedProvider: "WhiteBIT";
  asset: "BNB";
  providerNetwork: "BEP20";
  frozenAddressEnd: string;
  amount: string;
  transactionId: string;
  transactionHash: string;
  currentLocalState: { status: string; settlement: string | null; funding: string | null };
  proposedResultingState: { status: string; settlement: string };
  alreadyApplied: boolean;
  rowsToInsert: string[];
  rowsToUpdate: string[];
  conditionalNotifications: string;
};

function recoveryCredentialSource(requested?: "stored" | "environment") {
  const configured = whitebitCredentialSourceConfiguration();
  if (!configured.valid) stop("WHITEBIT_CREDENTIAL_SOURCE is invalid");
  const source = configured.explicit ? configured.source : requested ?? "stored";
  if (requested && configured.explicit && requested !== configured.source) {
    stop("recovery credential source does not match WHITEBIT_CREDENTIAL_SOURCE");
  }
  return source ?? "stored";
}

async function inspectSingleOrder(requestedSource?: "stored" | "environment"): Promise<{
  preview: WhitebitSingleOrderPreview;
  record: HistoryRow;
  transactionId: string;
  transactionHash: string;
  uniqueId: string | null;
  address: string;
  memo: string | null;
  amount: string;
  fee: string;
  status: number;
}> {
  const credentialSource = recoveryCredentialSource(requestedSource);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, ORDER_ID)).limit(1);
  const [claim] = await db.select().from(whitebitOrderAddressesTable)
    .where(eq(whitebitOrderAddressesTable.orderId, ORDER_ID)).limit(1);
  const frozen = assertFrozenOrder(order, claim);
  const [claimsAtAddress, accountAddresses] = await Promise.all([
    db.select({ id: whitebitOrderAddressesTable.id }).from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.address, frozen.claim.address!)),
    db.select({ id: whitebitDepositAddressesTable.id }).from(whitebitDepositAddressesTable)
      .where(eq(whitebitDepositAddressesTable.address, frozen.claim.address!)),
  ]);
  if (claimsAtAddress.length !== 1 || claimsAtAddress[0]?.id !== frozen.claim.id ||
    accountAddresses.length) stop("frozen address is shared with another order or customer");
  const rows = await readOnlyHistory(frozen.claim.address!, "BNB", normalizeWhitebitMemo(frozen.claim.memo), credentialSource);
  // A unique order address should have precisely one deposit. Do not guess
  // which transaction is intended when WhiteBIT reports several.
  if (rows.length !== 1) stop("history did not contain exactly one deposit for the frozen address");
  const record = rows[0]!;
  const rawTicker = nonempty(record.ticker) ?? nonempty(record.currency);
  const identity = assetIdentity(rawTicker ?? "", nonempty(record.network) ?? "");
  const memo = normalizeWhitebitMemo(record.memo);
  const amount = nonempty(record.amount);
  const fee = record.fee === null || record.fee === undefined ? "0" : (nonempty(record.fee) ?? "");
  const transactionId = nonempty(record.transaction_id) ?? nonempty(record.transactionId);
  const transactionHash = nonempty(record.transactionHash) ?? nonempty(record.transaction_hash);
  const uniqueId = nonempty(record.unique_id) ?? nonempty(record.uniqueId);
  const status = record.status;
  if (record.address !== frozen.claim.address ||
    identity.ticker !== "BNB" || identity.providerTicker !== "BNB" ||
    identity.network !== "BEP20" || memo !== normalizeWhitebitMemo(frozen.claim.memo) ||
    !amount || decimalUnits(amount) === null ||
    decimalUnits(amount) !== decimalUnits(frozen.order.amount) || decimalUnits(fee) === null ||
    !transactionId || !transactionHash ||
    !transactionId.startsWith("bfdbfb") || !transactionId.endsWith("80ce49") ||
    !transactionHash.startsWith("0xa5ad") || !transactionHash.endsWith("8f5d2a") ||
    !Number.isInteger(status) || ![3, 7].includes(status as number)) {
    stop("provider record does not prove the exact terminal funding tuple");
  }
  const providerCreatedAt = record.createdAt ?? record.created_at;
  if (typeof providerCreatedAt !== "number" ||
    providerCreatedAt * 1000 < frozen.order.createdAt.getTime()) {
    stop("provider deposit predates the frozen order or has no reliable timestamp");
  }
  const aliases = [
    eq(whitebitDepositsTable.address, frozen.claim.address!),
    eq(whitebitDepositsTable.transactionId, transactionId),
    eq(whitebitDepositsTable.transactionHash, transactionHash),
    eq(whitebitDepositsTable.providerIdentity, `transaction:${transactionId}`),
    ...(uniqueId ? [
      eq(whitebitDepositsTable.uniqueId, uniqueId),
      eq(whitebitDepositsTable.providerIdentity, `unique:${uniqueId}`),
    ] : []),
  ];
  const existing = await db.select().from(whitebitDepositsTable).where(or(...aliases));
  const alreadyApplied = existing.length === 1 &&
    existing[0]?.orderId === ORDER_ID &&
    existing[0]?.orderAddressId === frozen.claim.id &&
    existing[0]?.status === "processed" &&
    existing[0]?.transactionId === transactionId &&
    existing[0]?.transactionHash === transactionHash &&
    existing[0]?.uniqueId === uniqueId &&
    existing[0]?.ticker === "BNB" &&
    existing[0]?.providerTicker === "BNB" &&
    existing[0]?.network === "BEP20" &&
    existing[0]?.address === frozen.claim.address &&
    normalizeWhitebitMemo(existing[0]?.memo) === memo &&
    decimalUnits(existing[0]!.amount) === decimalUnits(amount) &&
    frozen.order.manualSettlementState === "funds_confirmed" &&
    frozen.order.status === "processing";
  if (existing.length && !alreadyApplied) stop("a deposit or provider identity already exists; manual review required");
  if (!alreadyApplied &&
    (frozen.order.manualSettlementState !== "awaiting_funds" || frozen.order.status !== "awaiting funds")) {
    stop("order is no longer awaiting funds");
  }
  const preview: WhitebitSingleOrderPreview = {
    mode: "dry-run", matchedOrderId: ORDER_ID, matchedProvider: "WhiteBIT",
    asset: "BNB", providerNetwork: "BEP20",
    frozenAddressEnd: frozen.claim.address!.slice(-6),
    amount, transactionId: redact(transactionId), transactionHash: redact(transactionHash),
    currentLocalState: {
      status: frozen.order.status, settlement: frozen.order.manualSettlementState,
      funding: frozen.order.fundingStatus,
    },
    proposedResultingState: { status: "processing", settlement: "funds_confirmed" },
    alreadyApplied,
    rowsToInsert: alreadyApplied ? [] : [
      "whitebit_deposits: one deposit linked to this exact order/claim",
      "exchange_order_audit_logs: one order.deposit_confirmed event",
    ],
    rowsToUpdate: alreadyApplied ? [] : [
      "exchange_orders: only O696531129, awaiting funds → processing / funds_confirmed",
    ],
    conditionalNotifications: alreadyApplied
      ? "none"
      : "This order's customer/administrative status notification rows and linked Telegram outbox rows may be enqueued by the standard status transition, subject to current notification settings.",
  };
  return { preview, record, transactionId, transactionHash, uniqueId, address: frozen.claim.address!, memo, amount, fee, status: status as number };
}

/** No database mutation, address creation, or broad reconciliation. */
export async function previewWhitebitSingleOrderRecovery(
  credentialSource?: "stored" | "environment",
): Promise<WhitebitSingleOrderPreview> {
  return (await inspectSingleOrder(credentialSource)).preview;
}

/**
 * Intentionally not exposed as an HTTP endpoint or CLI action. An operator
 * approval is required before wiring or invoking this scoped write path.
 */
export async function applyWhitebitSingleOrderRecoveryAfterApproval(
  credentialSource?: "stored" | "environment",
) {
  const inspected = await inspectSingleOrder(credentialSource);
  if (inspected.preview.alreadyApplied) return inspected.preview;
  await db.transaction(async (tx) => {
    // Serialize with authenticated webhook deliveries. Nothing outside this
    // one order and its immutable claim may be changed by the funding processor.
    await tx.execute(sql`select pg_advisory_xact_lock(78122341)`);
    const [order] = await tx.select().from(ordersTable)
      .where(eq(ordersTable.id, ORDER_ID)).for("update").limit(1);
    const [claim] = await tx.select().from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.orderId, ORDER_ID)).for("update").limit(1);
    assertFrozenOrder(order, claim);
    if (order!.manualSettlementState !== "awaiting_funds" || order!.status !== "awaiting funds" ||
      claim!.address !== inspected.address || normalizeWhitebitMemo(claim!.memo) !== inspected.memo) {
      stop("order or claim changed after provider history was read");
    }
    const [claimsAtAddress, otherAccounts, prior] = await Promise.all([
      tx.select({ id: whitebitOrderAddressesTable.id }).from(whitebitOrderAddressesTable)
        .where(eq(whitebitOrderAddressesTable.address, inspected.address)),
      tx.select({ id: whitebitDepositAddressesTable.id }).from(whitebitDepositAddressesTable)
        .where(eq(whitebitDepositAddressesTable.address, inspected.address)),
      tx.select({ id: whitebitDepositsTable.id }).from(whitebitDepositsTable).where(or(
        eq(whitebitDepositsTable.address, inspected.address),
        eq(whitebitDepositsTable.transactionId, inspected.transactionId),
        eq(whitebitDepositsTable.transactionHash, inspected.transactionHash),
        eq(whitebitDepositsTable.providerIdentity, `transaction:${inspected.transactionId}`),
        ...(inspected.uniqueId ? [
          eq(whitebitDepositsTable.uniqueId, inspected.uniqueId),
          eq(whitebitDepositsTable.providerIdentity, `unique:${inspected.uniqueId}`),
        ] : []),
      )),
    ]);
    if (claimsAtAddress.length !== 1 || claimsAtAddress[0]?.id !== claim!.id ||
      otherAccounts.length || prior.length) stop("deposit/address ownership changed");
    await processNormalizedDeposit(tx, {
      address: inspected.address, ticker: "BNB", providerTicker: "BNB",
      network: "BEP20", memo: inspected.memo, amount: inspected.amount,
      fee: inspected.fee, status: inspected.status, event: "deposit.processed",
      transactionHash: inspected.transactionHash, transactionId: inspected.transactionId,
      uniqueId: inspected.uniqueId, rawPayload: inspected.record,
    });
    const [updated] = await tx.select().from(ordersTable).where(eq(ordersTable.id, ORDER_ID)).limit(1);
    const [deposit] = await tx.select().from(whitebitDepositsTable)
      .where(eq(whitebitDepositsTable.transactionId, inspected.transactionId)).limit(1);
    if (updated?.manualSettlementState !== "funds_confirmed" || updated.status !== "processing" ||
      deposit?.orderId !== ORDER_ID || deposit.status !== "processed" ||
      deposit.orderAddressId !== claim!.id || deposit.transactionHash !== inspected.transactionHash ||
      deposit.providerTicker !== "BNB" || deposit.network !== "BEP20" ||
      deposit.address !== inspected.address || normalizeWhitebitMemo(deposit.memo) !== inspected.memo ||
      decimalUnits(deposit.amount) !== decimalUnits(inspected.amount)) {
      stop("scoped funding transition did not complete");
    }
  });
  return { ...inspected.preview, alreadyApplied: true, rowsToInsert: [], rowsToUpdate: [] };
}