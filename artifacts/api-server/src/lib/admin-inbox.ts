import { and, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { adminInboxTable, db } from "@workspace/db";
import type { OperatorAuthorization } from "./operator-auth";
import { logger } from "./logger";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderEvent = { orderId: string; type: "Swap" | "Convert"; status: string; version: number; created?: boolean; depositVerified?: boolean };
const operationalAlerts = new Map<string, number>();

/** Called inside the canonical order transaction. No customer, bank, or wallet data. */
export async function enqueueAdminOrderEvent(tx: Transaction, event: OrderEvent) {
  const prefix = `${event.type.toLowerCase()}:${event.orderId}`;
  const status = event.status.toLowerCase();
  const failed = ["failed", "payment failed", "expired", "cancelled", "canceled", "refunded", "reversed"].includes(status);
  const label = status === "completed" ? "Completed"
    : ["cancelled", "canceled"].includes(status) ? "Cancelled"
    : ["failed", "payment failed"].includes(status) ? "Failed"
    : status === "expired" ? "Expired"
    : ["refunded", "reversed"].includes(status) ? "Refunded"
    : "Updated";
  await tx.insert(adminInboxTable).values({
    eventKey: event.created ? `${prefix}:created` : `${prefix}:status:${event.version}`,
    kind: event.created ? "new_order" : failed ? "payment_failed" : "status_change",
    title: event.created ? `New ${event.type} Order` : `${event.type} Order ${label}`,
    message: `Order ${event.orderId} · ${event.status.toUpperCase()}`,
    orderId: event.orderId,
  }).onConflictDoNothing({ target: adminInboxTable.eventKey });
  if (event.depositVerified) await enqueueAdminDepositEvent(tx, event.type, event.orderId);
}

export async function enqueueAdminDepositEvent(tx: Transaction, type: "Swap" | "Convert", orderId: string) {
  await tx.insert(adminInboxTable).values({
    eventKey: `${type.toLowerCase()}:${orderId}:deposit`,
    kind: "deposit",
    title: `${type} Payment Confirmed`,
    message: `Verified payment received for order ${orderId}.`,
    orderId,
  }).onConflictDoNothing({ target: adminInboxTable.eventKey });
}

/** Technical diagnostics stay in structured logs, never in the order inbox. */
export async function recordAdminOperationalAlert(provider: string, code: string, system = false) {
  const safeProvider = provider.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 40);
  const safeCode = code.replace(/[^A-Z0-9_]/g, "").slice(0, 64);
  if (!safeProvider || !safeCode) return;
  const now = Date.now();
  const windowMs = 15 * 60_000;
  const bucket = Math.floor(now / windowMs);
  const key = `operational:${safeProvider}:${safeCode}:${system}:${bucket}`;
  const cached = operationalAlerts.get(key);
  if (cached && cached > now) return;
  for (const [oldKey, until] of operationalAlerts) if (until <= now) operationalAlerts.delete(oldKey);
  if (operationalAlerts.size >= 500) operationalAlerts.delete(operationalAlerts.keys().next().value!);
  operationalAlerts.set(key, (bucket + 1) * windowMs);
  logger.warn({ provider: safeProvider, code: safeCode, system }, "Operational service diagnostic");
}

export function inboxVisibility(operator: OperatorAuthorization): SQL {
  // Apply the same scope to items, counts, mark-all and individual receipt writes.
  // Retain historical technical rows, but never show/count them even for Owner.
  return and(
    sql`${operator.role === "owner" || operator.effectivePermissions.includes("orders.view")}`,
    isNotNull(adminInboxTable.orderId),
    inArray(adminInboxTable.kind, ["new_order", "status_change", "payment_failed", "deposit"]),
    sql`(${adminInboxTable.eventKey} like 'swap:%' or ${adminInboxTable.eventKey} like 'convert:%')`,
  )!;
}
