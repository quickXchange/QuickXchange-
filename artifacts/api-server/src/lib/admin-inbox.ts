import { isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { adminInboxTable, db } from "@workspace/db";
import type { OperatorAuthorization } from "./operator-auth";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderEvent = { orderId: string; type: "Swap" | "Convert"; status: string; version: number; created?: boolean; depositVerified?: boolean };
const operationalAlerts = new Map<string, { until: number; pending?: Promise<void> }>();

/** Called inside the canonical order transaction. No customer, bank, or wallet data. */
export async function enqueueAdminOrderEvent(tx: Transaction, event: OrderEvent) {
  const prefix = `${event.type.toLowerCase()}:${event.orderId}`;
  const failed = ["failed", "payment failed", "expired", "cancelled", "canceled", "refunded", "reversed"].includes(event.status.toLowerCase());
  await tx.insert(adminInboxTable).values({
    eventKey: event.created ? `${prefix}:created` : `${prefix}:status:${event.version}`,
    kind: event.created ? "new_order" : failed ? "payment_failed" : "status_change",
    title: event.created ? `New ${event.type} order` : failed ? `${event.type} order requires attention` : `${event.type} order updated`,
    message: `Order ${event.orderId} · ${event.status.toUpperCase()}`,
    orderId: event.orderId,
  }).onConflictDoNothing({ target: adminInboxTable.eventKey });
  if (event.depositVerified) await enqueueAdminDepositEvent(tx, event.type, event.orderId);
}

export async function enqueueAdminDepositEvent(tx: Transaction, type: "Swap" | "Convert", orderId: string) {
  await tx.insert(adminInboxTable).values({
    eventKey: `${type.toLowerCase()}:${orderId}:deposit`,
    kind: "deposit",
    title: `${type} deposit confirmed`,
    message: `Verified payment received for order ${orderId}.`,
    orderId,
  }).onConflictDoNothing({ target: adminInboxTable.eventKey });
}

/** Safe operational summaries only; do not persist raw provider errors/URLs/credentials. */
export async function recordAdminOperationalAlert(provider: string, code: string, system = false) {
  const safeProvider = provider.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 40);
  const safeCode = code.replace(/[^A-Z0-9_]/g, "").slice(0, 64);
  if (!safeProvider || !safeCode) return;
  const now = Date.now();
  const windowMs = 15 * 60_000;
  const bucket = Math.floor(now / windowMs);
  const key = `operational:${safeProvider}:${safeCode}:${bucket}`;
  const cached = operationalAlerts.get(key);
  if (cached && cached.until > now) return cached.pending;
  for (const [oldKey, old] of operationalAlerts) if (old.until <= now) operationalAlerts.delete(oldKey);
  if (operationalAlerts.size >= 500) operationalAlerts.delete(operationalAlerts.keys().next().value!);
  const state: { until: number; pending?: Promise<void> } = { until: (bucket + 1) * windowMs };
  // Share concurrent attempts and briefly back off failed persistence so an
  // outage cannot flood the same database pool that is already recovering.
  operationalAlerts.set(key, state);
  state.pending = (async () => {
    try {
      await db.insert(adminInboxTable).values({
        eventKey: key,
        kind: system ? "system_alert" : "provider_error",
        title: system ? "System attention required" : `${safeProvider} connection needs attention`,
        message: `${safeProvider}: ${safeCode}. Review the integration or monitoring status.`,
      }).onConflictDoNothing({ target: adminInboxTable.eventKey });
    } catch {
      state.until = Date.now() + 5_000;
      // Inbox outages must never alter provider calls, quotes or financial processing.
      console.warn("Admin operational alert could not be persisted.");
    }
  })();
  return state.pending;
}

export function inboxVisibility(operator: OperatorAuthorization): SQL {
  if (operator.role === "owner") return sql`true`;
  const conditions: SQL[] = [];
  if (operator.effectivePermissions.includes("orders.view")) conditions.push(isNotNull(adminInboxTable.orderId));
  if (operator.effectivePermissions.includes("integrations.view") || operator.effectivePermissions.includes("blockchain_monitoring.view")) {
    conditions.push(isNull(adminInboxTable.orderId));
  }
  return or(...conditions) ?? sql`false`;
}
