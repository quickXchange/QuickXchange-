import { randomUUID } from "node:crypto";
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
  notificationSettingsTable,
  whitebitDepositsTable,
  blockchainMonitorMatchesTable,
} from "@workspace/db";
import type { NotificationEmailTemplate } from "@workspace/db";
import {
  enqueueAdminSwapTelegramLifecycleNotification,
  enqueueSwapTelegramNotification,
} from "./telegram-swap-notifications";
import { getCustomerVerifiedEmail } from "./customer-auth";
import { logger } from "./logger";
import { signOrderTrackingToken } from "./order-access";
import { adminEmailEventEnabled, adminTelegramEventEnabled, customerEmailEventEnabled } from "./notification-policy";
import { sendResendRequest } from "./resend";

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
  eventKind?: string;
  adminRecipient?: boolean;
  trustpilotUrl?: string;
  customerName?: string;
  receiveMethod?: string;
  completedAt?: Date | null;
  template?: NotificationEmailTemplate;
};

type CustomerNotificationDeliveryTestAdapter = {
  send: (
    notification: CustomerStatusNotification,
    options: CustomerNotificationDeliveryOptions,
  ) => void | Promise<void>;
};

let testDeliveryAdapter: CustomerNotificationDeliveryTestAdapter | undefined;

function customerEmailDeliveryEnabled(): boolean {
  return process.env.NOTIFICATIONS_DISABLED !== "true";
}

export type CustomerNotificationDeliveryOptions = {
  idempotencyKey: string;
};

export const DEFAULT_NOTIFICATION_EMAIL_TEMPLATES: Record<string, NotificationEmailTemplate> = {
  order_created: {
    subject: "Your QuickXchange order {{orderId}} has been created",
    heading: "Your order has been created",
    message: "We have received your order and it is now waiting for payment. Please complete the payment to continue.",
    buttonText: "View Order",
    footerText: "Thank you for choosing QuickXchange.",
  },
  payment_received: {
    subject: "Payment received for QuickXchange order {{orderId}}",
    heading: "Payment received",
    message: "We have received your payment and your exchange is moving forward.",
    buttonText: "View Order",
    footerText: "We will keep you updated as your exchange progresses.",
  },
  processing: {
    subject: "QuickXchange order {{orderId}} is processing",
    heading: "Your exchange is processing",
    message: "We are now processing your exchange. We will notify you when there is another update.",
    buttonText: "View Order",
    footerText: "For your security, we will never ask for wallet credentials by email.",
  },
  completed: {
    subject: "QuickXchange order {{orderId}} is complete",
    heading: "Exchange Completed",
    message: "Your exchange has been completed successfully. Thank you for using QuickXchange.",
    buttonText: "View Order",
    footerText: "Thank you for choosing QuickXchange.",
  },
  failed_cancelled: {
    subject: "QuickXchange order {{orderId}} requires your attention",
    heading: "Order update",
    message: "Your order could not be completed as requested. Please open your order for the latest details.",
    buttonText: "View Order",
    footerText: "If you need help, please contact QuickXchange support.",
  },
};

export const NOTIFICATION_TEMPLATE_VARIABLES = [
  "customerName", "orderId", "sendAmount", "sendAsset", "sendNetwork",
  "receiveAmount", "receiveAsset", "receiveMethod", "status", "createdDate",
  "completedDate", "orderUrl", "invoiceUrl", "trustpilotUrl",
] as const;

export function notificationTemplateForEvent(
  templates: Record<string, NotificationEmailTemplate> | null | undefined,
  eventKind: string | undefined,
) {
  const candidate = templates?.[eventKind || ""];
  if (candidate && [candidate.subject, candidate.heading, candidate.message, candidate.buttonText, candidate.footerText]
    .every((value) => typeof value === "string" && value.trim())) {
    return candidate;
  }
  return DEFAULT_NOTIFICATION_EMAIL_TEMPLATES[eventKind || ""] ||
    DEFAULT_NOTIFICATION_EMAIL_TEMPLATES.processing;
}

function interpolateTemplate(value: string, values: Record<string, string>, html = false) {
  const source = html ? escapeHtml(value) : value;
  return source.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_match, key: string) => {
    const result = values[key] ?? "";
    return html ? escapeHtml(result) : result;
  });
}

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
  const configuredBase = process.env.PUBLIC_APP_URL?.trim()?.replace(/\/+$/, "") || "";
  const base = /^https:\/\//i.test(configuredBase) ? configuredBase : "";
  const customerIsGuest = notification.customerClerkUserId.startsWith("guest:");
  const orderUrl = !base ? "" : notification.adminRecipient
    ? `${base}/admin/orders/${encodeURIComponent(notification.orderId)}`
    : customerIsGuest
      ? `${base}/status?order=${encodeURIComponent(notification.orderId)}&trackingToken=${encodeURIComponent(signOrderTrackingToken(notification.orderId))}`
      : `${base}/account/orders/${encodeURIComponent(notification.orderId)}`;
  const invoiceUrl = orderUrl ? `${orderUrl}${orderUrl.includes("?") ? "&" : "?"}invoice=1` : "";
  const reviewUrl = notification.trustpilotUrl?.trim() || process.env.TRUSTPILOT_REVIEW_URL?.trim() || "";
  const template = notificationTemplateForEvent(undefined, notification.eventKind);
  const configuredTemplate = notification.template || template;
  const values = {
    customerName: notification.customerName || "Customer",
    orderId: notification.orderId,
    sendAmount: notification.amount,
    sendAsset: notification.fromAsset,
    sendNetwork: notification.fromNetwork,
    receiveAmount: notification.receiveAmount,
    receiveAsset: notification.toAsset,
    receiveMethod: notification.receiveMethod || notification.toAsset,
    status,
    createdDate: notification.createdAt.toISOString(),
    completedDate: notification.completedAt?.toISOString() || "",
    orderUrl,
    invoiceUrl,
    trustpilotUrl: notification.eventKind === "completed" ? reviewUrl : "",
  };
  const subject = interpolateTemplate(configuredTemplate.subject, values);
  const heading = interpolateTemplate(configuredTemplate.heading, values, true);
  const message = interpolateTemplate(configuredTemplate.message, values, true);
  const buttonText = interpolateTemplate(configuredTemplate.buttonText, values, true);
  const footerText = interpolateTemplate(configuredTemplate.footerText, values, true);
  const text = [
    interpolateTemplate(configuredTemplate.message, values),
    "",
    `Order: ${notification.orderId}`,
    notification.adminRecipient ? `Customer: ${notification.customerName || "Guest"}` : "",
    `Exchange: ${route}`,
    `New status: ${status}`,
    notification.eventKind === "completed" ? `Completion date: ${notification.completedAt?.toISOString() || notification.createdAt.toISOString()}` : "",
    notification.eventKind === "completed" && !notification.adminRecipient && invoiceUrl ? `Invoice: ${invoiceUrl}` : "",
    notification.eventKind === "completed" && !notification.adminRecipient && reviewUrl ? `Review us on Trustpilot: ${reviewUrl}` : "",
    "",
    interpolateTemplate(configuredTemplate.footerText, values),
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f7fb;color:#111827;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:28px 12px">
<tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">
<tr><td style="background:#071a2f;padding:24px 30px;color:#ffffff"><div style="font-size:22px;font-weight:800;letter-spacing:.2px">Quick<span style="color:#35d29a">X</span>change</div><div style="margin-top:5px;color:#9fb2c8;font-size:12px">Secure digital asset exchange</div></td></tr>
<tr><td style="padding:32px 30px">
<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e8fbf3;color:#087653;font-size:12px;font-weight:700">${escapeHtml(status)}</div>
 <h1 style="margin:16px 0 8px;font-size:26px;line-height:1.2;color:#071a2f">${heading}</h1>
 <p style="margin:0 0 24px;color:#4b5563;line-height:1.65">${message}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f8fafc;border-radius:12px">
<tr><td style="padding:14px 16px;color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb">ORDER</td><td style="padding:14px 16px;text-align:right;font-weight:700;border-bottom:1px solid #e5e7eb">${escapeHtml(notification.orderId)}</td></tr>
${notification.adminRecipient ? `<tr><td style="padding:14px 16px;color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb">CUSTOMER</td><td style="padding:14px 16px;text-align:right;font-weight:700;border-bottom:1px solid #e5e7eb">${escapeHtml(notification.customerName || "Guest")}</td></tr>` : ""}
<tr><td style="padding:14px 16px;color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb">EXCHANGE</td><td style="padding:14px 16px;text-align:right;font-weight:700;border-bottom:1px solid #e5e7eb">${escapeHtml(route)}</td></tr>
<tr><td style="padding:14px 16px;color:#6b7280;font-size:12px">STATUS</td><td style="padding:14px 16px;text-align:right;font-weight:700;color:#087653">${escapeHtml(status)}</td></tr>
</table>
 ${orderUrl ? `<p style="margin:24px 0 0"><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#0ea572;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">${buttonText}</a></p>` : ""}
${notification.eventKind === "completed" && !notification.adminRecipient && invoiceUrl ? `<p style="margin:18px 0 0"><a href="${escapeHtml(invoiceUrl)}" style="color:#087653;font-weight:700">Invoice / Download Invoice</a>${reviewUrl ? ` &nbsp;·&nbsp; <a href="${escapeHtml(reviewUrl)}" style="color:#087653;font-weight:700">Review us on Trustpilot</a>` : ""}</p>` : ""}
 <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6">${footerText}</p>
</td></tr></table></td></tr></table></body></html>`;
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
    "QuickXchange <support@quickchange.exchange>";
  const response = await sendResendRequest("/emails", {
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

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function updateOrderAndQueueStatusNotificationTx(
  tx: DbTransaction,
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

    const [notificationSettings] = await tx.select().from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.id, "global")).limit(1);
    const eventKind = updated.status.toLowerCase() === "completed"
      ? "completed" as const
      : ["failed", "cancelled", "canceled", "refunded"].includes(updated.status.toLowerCase())
        ? "failed_cancelled" as const
        : "processing" as const;
    const eventEnabled = customerEmailEventEnabled(notificationSettings, eventKind);
    if (
      customerEmailDeliveryEnabled() &&
      notificationSettings?.emailEnabled !== false &&
      updated.status !== current.status &&
      updated.type === "manual" &&
      updated.customerEmail.trim() &&
      updated.statusNotificationsEnabled &&
      eventEnabled
    ) {
      await tx
        .insert(customerStatusNotificationEventsTable)
        .values({
          orderId: updated.id,
          customerClerkUserId: updated.customerClerkUserId ?? `guest:${updated.customerEmail.trim().toLowerCase()}`,
          fromStatus: current.status,
          toStatus: updated.status,
          statusVersion: updated.statusVersion,
          eventKind: ["failed", "cancelled", "canceled", "refunded"].includes(updated.status.toLowerCase())
            ? "failed_cancelled"
            : updated.status.toLowerCase() === "completed" ? "completed" : "processing",
          recipientEmail: updated.customerEmail.trim(),
        })
        .onConflictDoNothing({
          target: [
            customerStatusNotificationEventsTable.orderId,
            customerStatusNotificationEventsTable.eventKind,
            customerStatusNotificationEventsTable.statusVersion,
            customerStatusNotificationEventsTable.channel,
            customerStatusNotificationEventsTable.recipientEmail,
            customerStatusNotificationEventsTable.evidenceKey,
          ],
        });
    }
    if (
      updated.type === "manual" &&
      statusChanged &&
      (adminEmailEventEnabled(notificationSettings, eventKind) ||
        adminTelegramEventEnabled(notificationSettings, eventKind)) &&
      updated.status.toLowerCase() !== "awaiting funds"
    ) {
      const [whitebitPayment] = await tx.select({ id: whitebitDepositsTable.id })
        .from(whitebitDepositsTable)
        .where(and(
          eq(whitebitDepositsTable.orderId, updated.id),
          eq(whitebitDepositsTable.status, "processed"),
        ))
        .limit(1);
      const [blockchainPayment] = whitebitPayment ? [] : await tx
        .select({ id: blockchainMonitorMatchesTable.id })
        .from(blockchainMonitorMatchesTable)
        .where(and(
          eq(blockchainMonitorMatchesTable.orderId, updated.id),
          eq(blockchainMonitorMatchesTable.state, "applied"),
        ))
        .limit(1);
      if (whitebitPayment || blockchainPayment) {
      const lifecycleEvent = updated.status.toLowerCase() === "completed"
          ? "completed"
          : ["failed", "cancelled", "canceled", "refunded"].includes(updated.status.toLowerCase())
            ? "failed_cancelled"
            : "processing";
        if (
          adminEmailEventEnabled(notificationSettings, lifecycleEvent) &&
          notificationSettings?.adminNotificationEmail
        ) {
          await tx.insert(customerStatusNotificationEventsTable).values({
            orderId: updated.id,
            customerClerkUserId: `admin:${notificationSettings.adminNotificationEmail.toLowerCase()}`,
            fromStatus: current.status,
            toStatus: updated.status,
            statusVersion: updated.statusVersion,
            eventKind: lifecycleEvent,
            recipientEmail: notificationSettings.adminNotificationEmail,
            adminRecipient: true,
            evidenceKey: `lifecycle:${updated.id}:${updated.statusVersion}`,
          }).onConflictDoNothing({
            target: [
              customerStatusNotificationEventsTable.orderId,
              customerStatusNotificationEventsTable.eventKind,
              customerStatusNotificationEventsTable.statusVersion,
              customerStatusNotificationEventsTable.channel,
              customerStatusNotificationEventsTable.recipientEmail,
              customerStatusNotificationEventsTable.evidenceKey,
            ],
          });
        }
        if (lifecycleEvent !== "completed") {
          await enqueueAdminSwapTelegramLifecycleNotification(tx, updated, lifecycleEvent);
        }
      }
    }
    if (
      statusChanged &&
      updated.status === "completed" &&
      updated.type === "manual"
    ) {
      await enqueueSwapTelegramNotification(tx, updated, "completed");
    }
    return updated;
}

export async function updateOrderAndQueueStatusNotification(
  current: OrderRow,
  updates: OrderUpdate,
  additionalCondition?: SQL,
  audit: OrderMutationAudit = {},
): Promise<OrderRow | undefined> {
  return db.transaction((tx) =>
    updateOrderAndQueueStatusNotificationTx(
      tx,
      current,
      updates,
      additionalCondition,
      audit,
    )
  );
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
    const [notificationSettings] = await db.select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.id, "global"))
      .limit(1);
    const eventEnabled = claimed.adminRecipient
      ? adminEmailEventEnabled(notificationSettings, claimed.eventKind as "order_created" | "payment_received" | "processing" | "completed" | "failed_cancelled")
      : customerEmailEventEnabled(notificationSettings, claimed.eventKind as "order_created" | "payment_received" | "processing" | "completed" | "failed_cancelled");
    const adminRecipientIsCurrent = !claimed.adminRecipient ||
      Boolean(
        notificationSettings?.adminNotificationEmail &&
        notificationSettings.adminNotificationEmail.trim().toLowerCase() ===
          claimed.recipientEmail.trim().toLowerCase(),
      );
    let authoritativePaymentExists = true;
    if (claimed.adminRecipient && claimed.eventKind !== "order_created") {
      const [whitebitPayment] = await db.select({ id: whitebitDepositsTable.id })
        .from(whitebitDepositsTable)
        .where(and(
          eq(whitebitDepositsTable.orderId, claimed.orderId),
          eq(whitebitDepositsTable.status, "processed"),
        ))
        .limit(1);
      const [blockchainPayment] = whitebitPayment ? [] : await db
        .select({ id: blockchainMonitorMatchesTable.id })
        .from(blockchainMonitorMatchesTable)
        .where(and(
          eq(blockchainMonitorMatchesTable.orderId, claimed.orderId),
          eq(blockchainMonitorMatchesTable.state, "applied"),
        ))
        .limit(1);
      authoritativePaymentExists = Boolean(whitebitPayment || blockchainPayment);
    }
    if (
      !order ||
      order.type !== "manual" ||
      !eventEnabled ||
      !adminRecipientIsCurrent ||
      !authoritativePaymentExists ||
      (!claimed.adminRecipient && !order.statusNotificationsEnabled) ||
      (!claimed.adminRecipient && order.customerClerkUserId &&
        order.customerClerkUserId !== claimed.customerClerkUserId)
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
    const recipientEmail = claimed.recipientEmail.trim() ||
      order.customerEmail.trim() ||
      (order.customerClerkUserId
        ? await getCustomerVerifiedEmail(order.customerClerkUserId)
        : "");
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
      trustpilotUrl: notificationSettings?.trustpilotReviewUrl ?? "",
      customerName: order.customerName,
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
      completedAt: order.status.toLowerCase() === "completed" ? order.updatedAt : null,
      receiveMethod: order.payoutMethod,
      eventKind: claimed.eventKind,
      adminRecipient: claimed.adminRecipient,
      template: notificationTemplateForEvent(
        notificationSettings?.emailTemplates,
        claimed.eventKind,
      ),
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