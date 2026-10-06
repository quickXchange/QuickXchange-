import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import {
  db, fiatCurrenciesTable, fiatCurrencyPaymentMethodsTable,
  paymentMethodsTable, operatorAuditLogsTable,
} from "@workspace/db";
import {
  GetAdminBestchangeReservesExportResponse, PreviewAdminBestchangeReservesBody,
  PreviewAdminBestchangeReservesResponse,
} from "@workspace/api-zod";
import type { OperatorAuthorization } from "./operator-auth";
import { ApiError } from "./api-error";
import { invalidateBestchangeFeed } from "./bestchange-cache-invalidation";
import { normalizePaymentMethodReserve } from "./payment-method-reserve-validation";

type Transfer = ReturnType<typeof PreviewAdminBestchangeReservesBody.parse>;
type Executor = Pick<typeof db, "select">;
const key = (currency: string, method: string) => JSON.stringify([currency, method]);

export async function exportBestchangeReserves(): Promise<Transfer> {
  const rows = await db.select({
    currencyCode: fiatCurrenciesTable.code, paymentMethodId: fiatCurrencyPaymentMethodsTable.paymentMethodId,
    reserve: fiatCurrencyPaymentMethodsTable.reserve, precision: fiatCurrenciesTable.precision,
  }).from(fiatCurrencyPaymentMethodsTable)
    .innerJoin(fiatCurrenciesTable, eq(fiatCurrenciesTable.id, fiatCurrencyPaymentMethodsTable.fiatCurrencyId))
    .innerJoin(paymentMethodsTable, eq(paymentMethodsTable.id, fiatCurrencyPaymentMethodsTable.paymentMethodId))
    .where(and(eq(fiatCurrenciesTable.enabled, true), eq(paymentMethodsTable.enabled, true),
      eq(fiatCurrencyPaymentMethodsTable.enabled, true), gt(fiatCurrencyPaymentMethodsTable.reserve, "0")))
    .orderBy(asc(fiatCurrenciesTable.code), asc(fiatCurrencyPaymentMethodsTable.paymentMethodId));
  if (!rows.length) throw new ApiError("BESTCHANGE_NO_RESERVES", "There are no enabled positive workspace reserves to export.", 400);
  return GetAdminBestchangeReservesExportResponse.parse({
    format: "qx-bestchange-reserves-v1",
    reserves: rows.map(row => ({
      currencyCode: row.currencyCode, paymentMethodId: row.paymentMethodId,
      reserve: normalizePaymentMethodReserve(row.reserve, row.precision),
    })),
  });
}

async function inspectReserves(transfer: Transfer, executor: Executor, locked: boolean) {
  const items = [...transfer.reserves].sort((a, b) =>
    key(a.currencyCode, a.paymentMethodId).localeCompare(key(b.currencyCode, b.paymentMethodId)));
  const unique = new Set(items.map(item => key(item.currencyCode, item.paymentMethodId)));
  if (unique.size !== items.length) throw new ApiError("BESTCHANGE_RESERVE_DUPLICATE", "A currency and payment method must appear only once.", 400);
  const methodIds = [...new Set(items.map(item => item.paymentMethodId))].sort();
  const currencyCodes = [...new Set(items.map(item => item.currencyCode))].sort();
  const initialCurrencies = await executor.select({
    id: fiatCurrenciesTable.id, code: fiatCurrenciesTable.code,
  }).from(fiatCurrenciesTable).where(inArray(fiatCurrenciesTable.code, currencyCodes));
  const methodQuery = executor.select({ id: paymentMethodsTable.id, enabled: paymentMethodsTable.enabled })
    .from(paymentMethodsTable).where(inArray(paymentMethodsTable.id, methodIds))
    .orderBy(asc(paymentMethodsTable.id));
  const methods = locked ? await methodQuery.for("share") : await methodQuery;
  if (methods.length !== methodIds.length || methods.some(method => !method.enabled)) {
    throw new ApiError("BESTCHANGE_RESERVE_UNAVAILABLE", "One of the selected payment methods is unavailable.", 409);
  }
  const attachmentQuery = executor.select({
    id: fiatCurrencyPaymentMethodsTable.id, fiatCurrencyId: fiatCurrencyPaymentMethodsTable.fiatCurrencyId,
    paymentMethodId: fiatCurrencyPaymentMethodsTable.paymentMethodId,
    reserve: fiatCurrencyPaymentMethodsTable.reserve, enabled: fiatCurrencyPaymentMethodsTable.enabled,
  }).from(fiatCurrencyPaymentMethodsTable)
    .where(inArray(fiatCurrencyPaymentMethodsTable.paymentMethodId, methodIds))
    .orderBy(asc(fiatCurrencyPaymentMethodsTable.id));
  const attachments = locked ? await attachmentQuery.for("update") : await attachmentQuery;
  const currencyQuery = executor.select({
    id: fiatCurrenciesTable.id, code: fiatCurrenciesTable.code, precision: fiatCurrenciesTable.precision,
    enabled: fiatCurrenciesTable.enabled,
  }).from(fiatCurrenciesTable).where(inArray(fiatCurrenciesTable.id, initialCurrencies.map(currency => currency.id)))
    .orderBy(asc(fiatCurrenciesTable.id));
  const currencies = locked ? await currencyQuery.for("share") : await currencyQuery;
  const currencyByCode = new Map(currencies.map(currency => [currency.code, currency]));
  const byKey = new Map(attachments.map(row =>
    [key(currencies.find(currency => currency.id === row.fiatCurrencyId)?.code ?? "", row.paymentMethodId), row]));
  const changes = items.map(item => {
    const currency = currencyByCode.get(item.currencyCode);
    const row = byKey.get(key(item.currencyCode, item.paymentMethodId));
    if (!currency || !currency.enabled || !row || !row.enabled) {
      throw new ApiError("BESTCHANGE_RESERVE_UNAVAILABLE",
        `The ${item.currencyCode} / ${item.paymentMethodId} attachment is unavailable. No reserves were changed.`, 409);
    }
    const proposedReserve = normalizePaymentMethodReserve(item.reserve, currency.precision);
    return {
      attachmentId: row.id, currencyCode: item.currencyCode, paymentMethodId: item.paymentMethodId,
      currentReserve: normalizePaymentMethodReserve(row.reserve, currency.precision), proposedReserve,
    };
  });
  const reviewHash = createHash("sha256").update(JSON.stringify(changes)).digest("hex");
  return { reviewHash, changes };
}

export async function previewBestchangeReserves(transfer: Transfer) {
  const review = await inspectReserves(transfer, db, false);
  return PreviewAdminBestchangeReservesResponse.parse({
    reviewHash: review.reviewHash,
    changes: review.changes.map(({ attachmentId: _id, ...change }) => change),
  });
}

export async function applyBestchangeReserves(
  transfer: Transfer, reviewHash: string,
  audit: { actorClerkUserId: string | null; operator: OperatorAuthorization; requestId: string },
) {
  const updatedCount = await db.transaction(async tx => {
    // Share the Payment Methods lock order: parent -> attachment -> currency.
    // The preview hash fences both the selected rows and their current balances.
    const review = await inspectReserves(transfer, tx, true);
    if (review.reviewHash !== reviewHash) throw new ApiError("BESTCHANGE_RESERVE_CHANGED",
      "Payment methods or reserves changed since review. Preview the file again; nothing was applied.", 409);
    const changed = review.changes.filter(change => change.currentReserve !== change.proposedReserve);
    for (const change of changed) {
      await tx.update(fiatCurrencyPaymentMethodsTable).set({ reserve: change.proposedReserve })
        .where(eq(fiatCurrencyPaymentMethodsTable.id, change.attachmentId));
    }
    if (changed.length) await tx.insert(operatorAuditLogsTable).values({
      action: "bestchange_reserves.imported",
      actorClerkUserId: audit.actorClerkUserId, targetOperatorId: audit.operator.id,
      targetEmail: audit.operator.email, requestId: audit.requestId,
      details: { changes: changed.map(({ attachmentId, currencyCode, paymentMethodId, currentReserve, proposedReserve }) => ({
        attachmentId, currencyCode, paymentMethodId, reserveBefore: currentReserve, reserveAfter: proposedReserve,
      })) },
    });
    return changed.length;
  });
  if (updatedCount) invalidateBestchangeFeed();
  return { updatedCount };
}
