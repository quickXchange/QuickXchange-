import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  db, ordersTable, whitebitOrderAddressesTable, whitebitWebhookDeliveriesTable,
} from "@workspace/db";
import { ApiError } from "./api-error";
import { matchesFrozenWhitebitClaim } from "./whitebit-history-match";
import {
  normalizeWhitebitHistoryDeposit, normalizeWhitebitMemo, processNormalizedDeposit, whitebitProviderTickerAliases,
} from "../routes/whitebit";

/**
 * Owner-reviewed, one-order replay of already authenticated webhook evidence.
 * No trading credentials, history scan, ledger credit or payout request.
 * Default is preview; application uses the same locked deposit processor.
 */
export async function reconcileSavedWhitebitWebhookForOrder(orderId: string, apply = false) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(78122341)`);
    const [order] = await tx.select().from(ordersTable)
      .where(eq(ordersTable.id, orderId)).for("update").limit(1);
    if (!order) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    if (order.type !== "manual" || order.fundingProviderSource !== "whitebit" ||
        order.fundingStatus !== "ready_whitebit") {
      throw new ApiError("WHITEBIT_RECOVERY_UNAVAILABLE", "Order does not have frozen WhiteBIT funding.", 409);
    }
    if (!["awaiting funds", "payment detected"].includes(order.status)) {
      if (order.manualSettlementFundedAt && order.manualSettlementState !== "awaiting_funds") {
        return { orderId, status: order.status, canApply: false, applied: false, alreadyReconciled: true };
      }
      throw new ApiError("WHITEBIT_RECOVERY_UNAVAILABLE", "Order no longer accepts deposit confirmation.", 409);
    }
    const [claim] = await tx.select().from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.orderId, orderId)).for("update").limit(1);
    if (!claim || !matchesFrozenWhitebitClaim(order, claim)) {
      throw new ApiError("WHITEBIT_RECOVERY_CONFLICT", "Frozen order/address identity differs.", 409);
    }
    const receipts = await tx.select().from(whitebitWebhookDeliveriesTable).where(and(
      eq(whitebitWebhookDeliveriesTable.method, "deposit.processed"),
      isNotNull(whitebitWebhookDeliveriesTable.payloadDigest),
      sql`${whitebitWebhookDeliveriesTable.payload}->'params'->>'address' = ${claim.address}`,
      sql`${whitebitWebhookDeliveriesTable.receivedAt} >= ${order.createdAt}`,
    )).limit(101);
    if (receipts.length > 100) throw new ApiError("WHITEBIT_RECOVERY_CONFLICT", "Too many receipts; operator review required.", 409);
    const candidates = receipts.map((receipt) => {
      const envelope = receipt.payload as { method?: unknown; params?: Record<string, unknown> };
      if (envelope.method !== "deposit.processed" || !envelope.params) return null;
      const deposit = normalizeWhitebitHistoryDeposit(envelope.params);
      if (!deposit || ![3, 7].includes(Number(deposit.status)) ||
          !whitebitProviderTickerAliases(deposit.providerTicker, deposit.network).includes(claim.providerTicker) ||
          deposit.network !== claim.network ||
          normalizeWhitebitMemo(deposit.memo) !== normalizeWhitebitMemo(claim.memo)) return null;
      return { receipt, deposit };
    }).filter((candidate) => candidate !== null);
    const identities = new Set(candidates.map(({ deposit }) => deposit.transactionId ?? deposit.uniqueId));
    if (identities.size !== 1 || !candidates.length) {
      throw new ApiError("WHITEBIT_RECOVERY_CONFLICT", "A single confirmed provider transaction is required.", 409);
    }
    const { receipt, deposit } = candidates.sort((a, b) => b.receipt.receivedAt.getTime() - a.receipt.receivedAt.getTime())[0]!;
    const funding = order.fundingDetailsSnapshot as Record<string, unknown> | null;
    const configuredThreshold = Number(funding?.requiredConfirmations ?? 0);
    const actual = deposit.confirmationsActual ?? null;
    const required = deposit.confirmationsRequired ?? null;
    const confirmed = actual === null && required === null || (
      actual !== null && required !== null && Number.isSafeInteger(configuredThreshold) &&
      actual >= Math.max(required, configuredThreshold)
    );
    // Comparison only, never recompute or replace either frozen monetary value.
    const units = (amount: string) => {
      if (!/^\d+(?:\.\d{1,18})?$/.test(amount)) return null;
      const [whole, fraction = ""] = amount.split(".");
      return BigInt(`${whole}${fraction.padEnd(18, "0")}`);
    };
    const received = units(deposit.amount);
    const expected = units(order.amount);
    const canApply = confirmed && received !== null && expected !== null && expected > 0n && received >= expected;
    const preview = {
      orderId, status: order.status, amount: deposit.amount, asset: claim.ticker, network: claim.network,
      transactionHash: deposit.transactionHash,
      confirmationsActual: deposit.confirmationsActual ?? null,
      confirmationsRequired: deposit.confirmationsRequired ?? null,
      receiptId: receipt.id, canApply, applied: false,
    };
    if (!apply) return preview;
    if (!canApply) throw new ApiError("WHITEBIT_RECOVERY_CONFLICT", "Confirmed funding does not cover the frozen order amount or confirmation threshold.", 409);
    await processNormalizedDeposit(tx, {
      ...deposit, envelopeId: receipt.envelopeId, payloadDigest: receipt.payloadDigest,
    });
    const [updated] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (updated?.status !== "processing" || updated.manualSettlementState !== "funds_confirmed") {
      throw new ApiError("WHITEBIT_RECOVERY_CONFLICT", "Deposit did not pass funding safeguards; no changes applied.", 409);
    }
    return { ...preview, status: updated.status, applied: true };
  });
}
