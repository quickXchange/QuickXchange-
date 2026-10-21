import { and, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { adminInboxTable, db } from "@workspace/db";
import type { OperatorAuthorization } from "./operator-auth";
import { logger } from "./logger";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderEvent = { orderId: string; type: "Swap" | "Convert"; status: string; version: number; created?: boolean; depositVerified?: boolean; createdAt?: Date };
const operationalAlerts = new Map<string, number>();

/** Called inside the canonical order transaction. No customer, bank, or wallet data. */
export async function enqueueAdminOrderEvent(tx: Transaction, event: OrderEvent) {
  // Lifecycle callers remain intact, but only a committed creation is inbox-worthy.
  if (!event.created) return;
  const prefix = `${event.type.toLowerCase()}:${event.orderId}`;
  await tx.insert(adminInboxTable).values({
    eventKey: `${prefix}:created`,
    kind: "new_order",
    title: `New ${event.type} Order`,
    message: `Order ${event.orderId}`,
    orderId: event.orderId,
    createdAt: event.createdAt,
  }).onConflictDoNothing({ target: adminInboxTable.eventKey });
}

/** Keep payment/evidence callers independent from the creation-only Admin inbox. */
export async function enqueueAdminDepositEvent(_tx: Transaction, _type: "Swap" | "Convert", _orderId: string) {
  // Payment records, customer delivery and technical monitoring are unaffected.
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
  // Retain historical lifecycle/technical rows without showing or counting them.
  return and(
    sql`${operator.role === "owner" || operator.effectivePermissions.includes("orders.view")}`,
    isNotNull(adminInboxTable.orderId),
    eq(adminInboxTable.kind, "new_order"),
    sql`(${adminInboxTable.eventKey} = 'swap:' || ${adminInboxTable.orderId} || ':created'
      or ${adminInboxTable.eventKey} = 'convert:' || ${adminInboxTable.orderId} || ':created')`,
  )!;
}
