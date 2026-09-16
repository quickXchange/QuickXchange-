import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  and,
  asc,
  desc,
  eq,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  customerStatusNotificationEventsTable,
  affiliateCompletionEventsTable,
  affiliateAccountsTable,
  affiliateSettingsTable,
  db,
  orderAuditLogsTable,
  ordersTable,
} from "@workspace/db";
import { getCustomerVerifiedEmail } from "./customer-auth";
import { logger } from "./logger";

const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_CLAIM_LEASE_MS = 5 * 60 * 1000;
const PROVIDER_IDEMPOTENCY_RETRY_WINDOW_MS = 12 * 60 * 60 * 1000;

type OrderRow = typeof ordersTable.$inferSelect;
type OrderUpdate = Partial<typeof ordersTable.$inferInsert>;

export type OrderMutationAudit = {
  action?: string;
  actorType?: "customer" | "operator" | "system";
  actorId?: string | null;
  requestId?: string | null;
  details?: Record<string, unknown>;
};

export type CustomerStatusNotification = {
  eventId: string;
  customerClerkUserId: string;
  recipientEmail: string;
  orderId: string;
  fromStatus: string;
  status: string;
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  amount: string;
  receiveAmount: string;
  createdAt: Date;
};

type CustomerNotificationDeliveryTestAdapter = {
  send: (
    notification: CustomerStatusNotification,
    options: CustomerNotificationDeliveryOptions,
  ) => void | Promise<void>;
};

let testDeliveryAdapter: CustomerNotificationDeliveryTestAdapter | undefined;

function customerEmailDeliveryEnabled(): boolean {
  // Customer email delivery is intentionally disabled. Tests keep the delivery
  // machinery exercisable without allowing runtime messages to users.
  return process.env.NODE_ENV === "test";
}

export type CustomerNotificationDeliveryOptions = {
  idempotencyKey: string;
};

export function configureCustomerNotificationDeliveryForTests(
  adapter: CustomerNotificationDeliveryTestAdapter,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Customer notification test adapters require NODE_ENV=test.");
  }
  testDeliveryAdapter = adapter;
}

function humanizeStatus(status: string): string {
  return status
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildCustomerStatusNotificationContent(
  notification: CustomerStatusNotification,
): { subject: string; text: string; html: string } {
  const status = humanizeStatus(notification.status);
  const route = [
    `${notification.amount} ${notification.fromAsset}`,
    notification.fromNetwork ? `on ${notification.fromNetwork}` : "",
    "to",
    `${notification.receiveAmount} ${notification.toAsset}`,
    notification.toNetwork ? `on ${notification.toNetwork}` : "",
  ].filter(Boolean).join(" ");
  const subject = `Order ${notification.orderId} is now ${status}`;
  const text = [
    `Your exchange order status changed from ${humanizeStatus(notification.fromStatus)} to ${status}.`,
    "",
    `Order: ${notification.orderId}`,
    `Exchange: ${route}`,
    `New status: ${status}`,
    "",
    "Sign in to your Rook account and open Order History for the latest details.",
    "This message never asks for wallet details or payment credentials.",
  ].join("\n");
  const html = [
    "<h1>Your exchange status changed</h1>",
    `<p>Your order moved from <strong>${escapeHtml(humanizeStatus(notification.fromStatus))}</strong> to <strong>${escapeHtml(status)}</strong>.</p>`,
    "<dl>",
    `<dt>Order</dt><dd>${escapeHtml(notification.orderId)}</dd>`,
    `<dt>Exchange</dt><dd>${escapeHtml(route)}</dd>`,
    `<dt>New status</dt><dd>${escapeHtml(status)}</dd>`,
    "</dl>",
    "<p>Sign in to your Rook account and open Order History for the latest details.</p>",
    "<p>This message never asks for wallet details or payment credentials.</p>",
  ].join("");
  return { subject, text, html };
}

async function sendCustomerStatusNotification(
  notification: CustomerStatusNotification,
): Promise<void> {
  const options: CustomerNotificationDeliveryOptions = {
    idempotencyKey: `customer-status-notification-${notification.eventId}`,
  };
  if (process.env.NODE_ENV === "test" && testDeliveryAdapter) {
    await testDeliveryAdapter.send(notification, options);
    return;
  }
  const content = buildCustomerStatusNotificationContent(notification);
  const fromAddress =
    process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL?.trim() ||
    "notifications@rook.exchange";
  const response = await new ReplitConnectors().proxy("resend", "/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": options.idempotencyKey,
    },
    body: {
      to: [notification.recipientEmail],
      from: fromAddress,
      subject: content.subject,
      text: content.text,
      html: content.html,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Resend rejected customer status notification delivery with HTTP ${response.status}.`,
    );
  }
}

export async function updateOrderAndQueueStatusNotification(
  current: OrderRow,
  updates: OrderUpdate,
  additionalCondition?: SQL,
  audit: OrderMutationAudit = {},
): Promise<OrderRow | undefined> {
  const statusChanged =
    updates.status !== undefined && updates.status !== current.status;
  const statusVersion = statusChanged
    ? current.statusVersion + 1
    : current.statusVersion;
  const nextRecordVersion = current.recordVersion + 1;
  const changedFields = Object.keys(updates).filter((field) => {
    const key = field as keyof OrderRow;
    return updates[key] !== undefined && updates[key] !== current[key];
  });
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(ordersTable)
      .set({
        ...updates,
        recordVersion: nextRecordVersion,
        ...(statusChanged ? { statusVersion } : {}),
      })
      .where(
        and(
          eq(ordersTable.id, current.id),
          eq(ordersTable.recordVersion, current.recordVersion),
          eq(ordersTable.statusVersion, current.statusVersion),
          additionalCondition,
        ),
      )
      .returning();
    if (!updated) return undefined;

    await tx.insert(orderAuditLogsTable).values({
      orderId: updated.id,
      action: audit.action ??
        (statusChanged ? "order.status_changed" : "order.updated"),
      actorType: audit.actorType ?? "system",
      actorId: audit.actorId ?? null,
      requestId: audit.requestId ?? null,
      previousVersion: current.recordVersion,
      nextVersion: updated.recordVersion,
      details: {
        changedFields,
        ...(statusChanged
          ? { fromStatus: current.status, toStatus: updated.status }
          : {}),
        ...audit.details,
      },
    });
    // This is deliberately in the same CAS transaction as the Manual Swap
    // completion. The separate aggregate identifier prevents conflating it
    // with a provider Convert order.
    if (statusChanged && updated.status === "completed" && updated.type === "manual") {
      const pricingSnapshot = updated.pricingSnapshot as {
        reference?: { source?: { unitsPerUsd?: string } };
      } | null;
      const sourceUnitsPerUsd = pricingSnapshot?.reference?.source?.unitsPerUsd;
      const valuation = sourceUnitsPerUsd
        ? { usd: exactDivide(updated.amount, sourceUnitsPerUsd), provenance: { source: "manual-pricing-snapshot", sourceUnitsPerUsd, sourceAmount: updated.amount } }
        : null;
      const [customerAffiliate] = updated.customerClerkUserId
        ? await tx.select().from(affiliateAccountsTable).where(eq(affiliateAccountsTable.customerClerkUserId, updated.customerClerkUserId)).limit(1)
        : [];
      const [settings] = await tx.select().from(affiliateSettingsTable).orderBy(desc(affiliateSettingsTable.version)).limit(1);
      const affiliateSnapshot = customerAffiliate?.referrerAccountId && settings ? {
        customerAffiliateAccountId: customerAffiliate.id, referrerAccountId: customerAffiliate.referrerAccountId,
        settings: { version: settings.version, enabled: settings.enabled, aggregateEnabled: settings.manualEnabled, rate: settings.commissionRate, minimumEligibleUsd: settings.minimumEligibleUsd, transactionCapUsd: settings.transactionCapUsd },
      } : null;
      await tx.insert(affiliateCompletionEventsTable).values({
        aggregateType: "manual", aggregateId: updated.id, completionVersion: updated.statusVersion,
        payload: { customerClerkUserId: updated.customerClerkUserId, valuation, snapshot: affiliateSnapshot },
      }).onConflictDoNothing();
    }
    if (statusChanged && ["refunded", "reversed"].includes(updated.status.toLowerCase()) && current.status === "completed" && updated.type === "manual") {
      await tx.insert(affiliateCompletionEventsTable).values({
        aggregateType: "manual", aggregateId: updated.id, completionVersion: updated.statusVersion,
        eventType: "reversal", payload: { customerClerkUserId: updated.customerClerkUserId },
      }).onConflictDoNothing();
    }

    if (
      customerEmailDeliveryEnabled() &&
      updated.status !== current.status &&
      updated.statusNotificationsEnabled &&
      updated.customerClerkUserId
    ) {
      await tx
        .insert(customerStatusNotificationEventsTable)
        .values({
          orderId: updated.id,
          customerClerkUserId: updated.customerClerkUserId,
          fromStatus: current.status,
          toStatus: updated.status,
          statusVersion: updated.statusVersion,
        })
        .onConflictDoNothing({
          target: [
            customerStatusNotificationEventsTable.orderId,
            customerStatusNotificationEventsTable.statusVersion,
          ],
        });
    }
    return updated;
  });
}

function exactDivide(value: string, divisor: string): string {
  const parse = (input: string) => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(input);
    if (!match || !Number(match[1]) && !match[2]) throw new Error("Invalid valuation decimal.");
    return { integer: BigInt(match[1] + (match[2] ?? "")), scale: (match[2] ?? "").length };
  };
  const a = parse(value), b = parse(divisor);
  if (b.integer <= 0n) throw new Error("Invalid valuation divisor.");
  const scale = 18;
  const result = a.integer * 10n ** BigInt(scale + b.scale - a.scale) / b.integer;
  const digits = result.toString().padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "");
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(60 * 60 * 1000, 30 * 1000 * 2 ** Math.max(0, attemptCount - 1));
}

function deliveryEligible(at: Date): SQL | undefined {
  return or(
    and(
      eq(customerStatusNotificationEventsTable.deliveryStatus, "pending"),
      lte(customerStatusNotificationEventsTable.nextAttemptAt, at),
    ),
    and(
      eq(customerStatusNotificationEventsTable.deliveryStatus, "sending"),
      or(
        isNull(customerStatusNotificationEventsTable.claimExpiresAt),
        lte(customerStatusNotificationEventsTable.claimExpiresAt, at),
      ),
    ),
  );
}

export async function processCustomerStatusNotificationOutbox(
  limit = 25,
): Promise<number> {
  if (!customerEmailDeliveryEnabled()) return 0;
  const now = new Date();
  const candidates = await db
    .select()
    .from(customerStatusNotificationEventsTable)
    .where(deliveryEligible(now))
    .orderBy(
      asc(customerStatusNotificationEventsTable.createdAt),
      asc(customerStatusNotificationEventsTable.id),
    )
    .limit(limit);

  let delivered = 0;
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const [claimed] = await db
      .update(customerStatusNotificationEventsTable)
      .set({
        deliveryStatus: "sending",
        lastAttemptAt: now,
        attemptCount: candidate.attemptCount + 1,
        claimToken,
        claimExpiresAt: new Date(now.getTime() + DELIVERY_CLAIM_LEASE_MS),
        providerIdempotencyStartedAt: sql`coalesce(
          ${customerStatusNotificationEventsTable.providerIdempotencyStartedAt},
          ${now}
        )`,
      })
      .where(
        and(
          eq(customerStatusNotificationEventsTable.id, candidate.id),
          deliveryEligible(now),
        ),
      )
      .returning();
    if (!claimed) continue;
    const activeClaim = and(
      eq(customerStatusNotificationEventsTable.id, claimed.id),
      eq(customerStatusNotificationEventsTable.claimToken, claimToken),
    );
    if (
      claimed.providerIdempotencyStartedAt &&
      now.getTime() - claimed.providerIdempotencyStartedAt.getTime() >=
        PROVIDER_IDEMPOTENCY_RETRY_WINDOW_MS
    ) {
      const [quarantined] = await db
        .update(customerStatusNotificationEventsTable)
        .set({
          deliveryStatus: "failed",
          claimToken: null,
          claimExpiresAt: null,
          lastErrorCode: "EMAIL_IDEMPOTENCY_WINDOW_EXPIRED",
        })
        .where(activeClaim)
        .returning({ id: customerStatusNotificationEventsTable.id });
      if (quarantined) {
        logger.error(
          {
            notificationEventId: claimed.id,
            orderId: claimed.orderId,
            attemptCount: claimed.attemptCount,
          },
          "Customer status notification was not retried outside the provider idempotency safety window",
        );
      }
      continue;
    }

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, claimed.orderId))
      .limit(1);
    if (
      !order ||
      !order.statusNotificationsEnabled ||
      order.customerClerkUserId !== claimed.customerClerkUserId
    ) {
      await db
        .update(customerStatusNotificationEventsTable)
        .set({
          deliveryStatus: "suppressed",
          claimToken: null,
          claimExpiresAt: null,
          lastErrorCode: "",
        })
        .where(activeClaim);
      continue;
    }
    const recipientEmail = await getCustomerVerifiedEmail(
      claimed.customerClerkUserId,
    );
    if (!recipientEmail) {
      await db
        .update(customerStatusNotificationEventsTable)
        .set({
          deliveryStatus: "suppressed",
          claimToken: null,
          claimExpiresAt: null,
          lastErrorCode: "CUSTOMER_VERIFIED_EMAIL_MISSING",
        })
        .where(activeClaim);
      continue;
    }

    const notification: CustomerStatusNotification = {
      eventId: claimed.id,
      customerClerkUserId: claimed.customerClerkUserId,
      recipientEmail,
      orderId: order.id,
      fromStatus: claimed.fromStatus,
      status: claimed.toStatus,
      fromAsset: order.fromAsset,
      fromNetwork: order.fromNetwork,
      toAsset: order.toAsset,
      toNetwork: order.toNetwork,
      amount: order.amount,
      receiveAmount: order.receiveAmount,
      createdAt: order.createdAt,
    };

    const heartbeat = setInterval(() => {
      void db
        .update(customerStatusNotificationEventsTable)
        .set({
          claimExpiresAt: new Date(Date.now() + DELIVERY_CLAIM_LEASE_MS),
        })
        .where(activeClaim)
        .catch((error: unknown) => {
          logger.warn(
            {
              err: error,
              notificationEventId: claimed.id,
              orderId: claimed.orderId,
            },
            "Customer status notification claim renewal failed",
          );
        });
    }, Math.floor(DELIVERY_CLAIM_LEASE_MS / 3));
    heartbeat.unref();

    try {
      await sendCustomerStatusNotification(notification);
      const [completed] = await db
        .update(customerStatusNotificationEventsTable)
        .set({
          deliveryStatus: "delivered",
          deliveredAt: new Date(),
          claimToken: null,
          claimExpiresAt: null,
          lastErrorCode: "",
        })
        .where(activeClaim)
        .returning({ id: customerStatusNotificationEventsTable.id });
      if (completed) delivered += 1;
    } catch (error) {
      const exhausted = claimed.attemptCount >= MAX_DELIVERY_ATTEMPTS;
      const [released] = await db
        .update(customerStatusNotificationEventsTable)
        .set({
          deliveryStatus: exhausted ? "failed" : "pending",
          nextAttemptAt: new Date(Date.now() + retryDelayMs(claimed.attemptCount)),
          claimToken: null,
          claimExpiresAt: null,
          lastErrorCode: error instanceof Error ? error.name : "DeliveryError",
        })
        .where(activeClaim)
        .returning({ id: customerStatusNotificationEventsTable.id });
      if (released) {
        logger.warn(
          {
            err: error,
            notificationEventId: claimed.id,
            orderId: claimed.orderId,
            attemptCount: claimed.attemptCount,
          },
          "Customer status notification delivery failed",
        );
      }
    } finally {
      clearInterval(heartbeat);
    }
  }
  return delivered;
}