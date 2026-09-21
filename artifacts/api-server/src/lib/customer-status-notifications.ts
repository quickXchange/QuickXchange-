import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
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
  socialTrustLinksTable,
  whitebitDepositsTable,
  blockchainMonitorMatchesTable,
  blockchainMonitorObservationsTable,
  convertNotificationOutboxTable,
  quickexOrdersTable,
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
let configuredRecoveryAttempted = false;

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
  paymentMethod?: string;
  completedAt?: Date | null;
  fundedAt?: Date | null;
  template?: NotificationEmailTemplate;
  transactionHash?: string;
  paymentReference?: string;
  confirmations?: number;
  confirmationsRequired?: number;
  orderType?: string;
  socialLinks?: Array<{ name: string; href: string }>;
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

export async function applyConfiguredCustomerNotificationRecovery(): Promise<void> {
  if (configuredRecoveryAttempted) return;
  configuredRecoveryAttempted = true;

  const orderId = process.env.CUSTOMER_NOTIFICATION_RECOVERY_ORDER_ID?.trim();
  const adminEmail = process.env.CUSTOMER_NOTIFICATION_RECOVERY_ADMIN_EMAIL?.trim().toLowerCase();
  const eventIds = (process.env.CUSTOMER_NOTIFICATION_RECOVERY_EVENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!orderId && !adminEmail && eventIds.length === 0) return;
  if (!orderId || !adminEmail || eventIds.length === 0) {
    throw new Error("Customer notification recovery configuration is incomplete.");
  }

  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable)
      .where(eq(ordersTable.id, orderId)).limit(1);
    if (!order || order.type !== "manual" || order.status.toLowerCase() !== "processing") {
      throw new Error("Customer notification recovery order is not the expected processing Manual order.");
    }

    const events = await tx.select().from(customerStatusNotificationEventsTable)
      .where(and(
        eq(customerStatusNotificationEventsTable.orderId, orderId),
        inArray(customerStatusNotificationEventsTable.id, eventIds),
        eq(customerStatusNotificationEventsTable.adminRecipient, false),
      ));
    if (
      events.length !== eventIds.length ||
      events.some((event) =>
        event.deliveryStatus !== "failed" ||
        event.deliveredAt ||
        !["payment_received", "processing"].includes(event.eventKind)
      )
    ) {
      throw new Error("Customer notification recovery events do not match the expected failed paid-order events.");
    }

    const [paymentEvidence] = await tx.select({ id: blockchainMonitorMatchesTable.id })
      .from(blockchainMonitorMatchesTable)
      .where(and(
        eq(blockchainMonitorMatchesTable.orderId, orderId),
        eq(blockchainMonitorMatchesTable.state, "applied"),
      ))
      .limit(1);
    if (!paymentEvidence) {
      throw new Error("Customer notification recovery requires applied blockchain payment evidence.");
    }

    await tx.insert(notificationSettingsTable).values({
      id: "global",
      adminNotificationEmail: adminEmail,
      adminNotificationsEnabled: true,
      adminEmailEnabled: true,
      adminEmailPaymentReceivedEnabled: true,
      adminEmailProcessingEnabled: true,
    }).onConflictDoUpdate({
      target: notificationSettingsTable.id,
      set: {
        adminNotificationEmail: adminEmail,
        adminNotificationsEnabled: true,
        adminEmailEnabled: true,
        adminEmailPaymentReceivedEnabled: true,
        adminEmailProcessingEnabled: true,
        updatedAt: new Date(),
      },
    });

    const paymentEvent = events.find((event) => event.eventKind === "payment_received");
    if (!paymentEvent) {
      throw new Error("Customer notification recovery is missing the Payment Received event.");
    }
    await tx.insert(customerStatusNotificationEventsTable).values({
      orderId,
      customerClerkUserId: `admin:${adminEmail}`,
      eventKind: "payment_received",
      channel: "email",
      recipientEmail: adminEmail,
      adminRecipient: true,
      evidenceKey: paymentEvent.evidenceKey,
      fromStatus: paymentEvent.fromStatus,
      toStatus: paymentEvent.toStatus,
      statusVersion: paymentEvent.statusVersion,
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

    await tx.update(customerStatusNotificationEventsTable).set({
      deliveryStatus: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date(),
      claimToken: null,
      claimExpiresAt: null,
      lastErrorCode: "",
    }).where(and(
      eq(customerStatusNotificationEventsTable.orderId, orderId),
      inArray(customerStatusNotificationEventsTable.id, eventIds),
      eq(customerStatusNotificationEventsTable.deliveryStatus, "failed"),
      eq(customerStatusNotificationEventsTable.adminRecipient, false),
    ));
  });
}

export const DEFAULT_NOTIFICATION_EMAIL_TEMPLATES: Record<string, NotificationEmailTemplate> = {
  order_created: {
    subject: "Your QuickXchange order {{orderId}} has been created",
    heading: "Your order has been created!",
    message: "We have received your order and it is now waiting for payment. Please complete the payment within the given time to continue.",
    buttonText: "View Order",
    footerText: "Thank you for choosing QuickXchange.",
  },
  payment_received: {
    subject: "Payment received for QuickXchange order {{orderId}}",
    heading: "We've received your payment!",
    message: "Great! We've detected your payment and it is now being processed. You will receive another email once your exchange is completed.",
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
    heading: "Your exchange is completed!",
    message: "Great! Your exchange has been successfully completed. Thank you for using QuickXchange. We hope to see you again soon!",
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

function formatDate(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[date.getUTCMonth()];
  const d = date.getUTCDate();
  const y = date.getUTCFullYear();
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mm = date.getUTCMinutes().toString().padStart(2, "0");
  return `${m} ${d}, ${y} ${hh}:${mm} (UTC)`;
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-8)}`;
}

function safeHttpsUrl(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function socialLinkFor(
  links: CustomerStatusNotification["socialLinks"],
  platform: string,
): string {
  const aliases: Record<string, string[]> = {
    Telegram: ["telegram"],
    X: ["x", "twitter", "x / twitter"],
    Instagram: ["instagram"],
    YouTube: ["youtube"],
    Facebook: ["facebook"],
  };
  const accepted = aliases[platform] ?? [platform.toLowerCase()];
  const match = links?.find(({ name }) => accepted.includes(name.trim().toLowerCase()));
  return safeHttpsUrl(match?.href);
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
  const base = safeHttpsUrl(configuredBase).replace(/\/+$/, "");
  const customerIsGuest = notification.customerClerkUserId.startsWith("guest:");
  const orderUrl = !base ? "" : notification.adminRecipient
    ? `${base}/admin/orders/${encodeURIComponent(notification.orderId)}`
    : customerIsGuest
      ? `${base}/status?order=${encodeURIComponent(notification.orderId)}&trackingToken=${encodeURIComponent(signOrderTrackingToken(notification.orderId))}`
      : `${base}/account/orders/${encodeURIComponent(notification.orderId)}`;
  const invoiceUrl = orderUrl ? `${orderUrl}${orderUrl.includes("?") ? "&" : "?"}invoice=1` : "";
  const reviewUrl = safeHttpsUrl(
    notification.trustpilotUrl?.trim() || process.env.TRUSTPILOT_REVIEW_URL?.trim(),
  );
  const configuredTemplate = notification.template ||
    notificationTemplateForEvent(undefined, notification.eventKind);
  const values = {
    customerName: notification.customerName || "Customer",
    orderId: notification.orderId,
    sendAmount: notification.amount,
    sendAsset: notification.fromAsset,
    sendNetwork: notification.fromNetwork,
    receiveAmount: notification.receiveAmount,
    receiveAsset: notification.toAsset,
    receiveMethod: notification.receiveMethod || notification.toNetwork || notification.toAsset,
    status,
    createdDate: notification.createdAt.toISOString(),
    completedDate: notification.completedAt?.toISOString() || "",
    orderUrl,
    invoiceUrl,
    trustpilotUrl: notification.eventKind === "completed" ? reviewUrl : "",
  };
  const configuredHeading = interpolateTemplate(configuredTemplate.heading, values, true);
  const configuredMessage = interpolateTemplate(configuredTemplate.message, values, true);
  const buttonText = interpolateTemplate(configuredTemplate.buttonText, values, true);
  const footerText = interpolateTemplate(configuredTemplate.footerText, values, true);

  let badgeHtml = '';
  let heroTitle = '';
  let heroSubtitle = '';
  let heroText = '';
  const subject = interpolateTemplate(configuredTemplate.subject, values);

  if (notification.eventKind === "order_created") {
      badgeHtml = `<div style="display:inline-block;padding:6px 14px;border-radius:9999px;font-size:12px;font-weight:600;background-color:rgba(14,165,233,0.1);color:#38bdf8;border:1px solid rgba(14,165,233,0.2);margin-bottom:24px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          Order Created
      </div>`;
      heroTitle = `Hello ${escapeHtml(notification.customerName || "Customer")} 👋`;
      heroSubtitle = configuredHeading;
      heroText = configuredMessage;
  } else if (notification.eventKind === "payment_received") {
      badgeHtml = `<div style="display:inline-block;padding:6px 14px;border-radius:9999px;font-size:12px;font-weight:600;background-color:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.2);margin-bottom:24px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          Payment Received
      </div>`;
      heroTitle = configuredHeading;
      heroSubtitle = ``;
      heroText = configuredMessage;
  } else if (notification.eventKind === "completed") {
      badgeHtml = `<div style="display:inline-block;padding:6px 14px;border-radius:9999px;font-size:12px;font-weight:600;background-color:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.2);margin-bottom:24px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          Exchange Completed
      </div>`;
      heroTitle = configuredHeading;
      heroSubtitle = ``;
      heroText = configuredMessage;
  } else {
      badgeHtml = `<div style="display:inline-block;padding:6px 14px;border-radius:9999px;font-size:12px;font-weight:600;background-color:rgba(148,163,184,0.1);color:#cbd5e1;border:1px solid rgba(148,163,184,0.2);margin-bottom:24px;">
          ${escapeHtml(humanizeStatus(notification.status).replace(/\b\w/g, l => l.toUpperCase()))}
      </div>`;
      heroTitle = configuredHeading;
      heroSubtitle = ``;
      heroText = configuredMessage;
  }

  const orderTypeLabel = notification.orderType === "manual"
    ? "Manual Swap"
    : notification.orderType
      ? humanizeStatus(notification.orderType).replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "";
  const paymentMethod = notification.paymentMethod?.trim() ||
    notification.receiveMethod?.trim() || "";
  const sendDescriptor = [notification.fromAsset, notification.fromNetwork || notification.paymentMethod]
    .filter(Boolean).join(" · ");
  const receiveDescriptor = [
    notification.toAsset,
    notification.toNetwork || notification.receiveMethod,
  ].filter(Boolean).join(" · ");
  const sendLabel = notification.eventKind === "order_created" ? "You Send" : "You Sent";
  const receiveLabel = notification.eventKind === "completed" ? "You Received" : "You Receive";
  const detailsItems: { label: string; value: string; valueColor?: string; icon?: string }[] = [];

  if (notification.eventKind === "order_created") {
      detailsItems.push({ label: "Status", value: "Awaiting payment", valueColor: "#38bdf8", icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' });
      detailsItems.push({ label: "Created at", value: formatDate(notification.createdAt), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' });
      if (orderTypeLabel) detailsItems.push({ label: "Exchange type", value: orderTypeLabel, icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>' });
      if (paymentMethod) detailsItems.push({ label: "Payment method", value: paymentMethod });
  } else if (notification.eventKind === "payment_received") {
      detailsItems.push({ label: "Status", value: "Payment Received", valueColor: "#4ade80", icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' });
      if (notification.fundedAt) {
          detailsItems.push({ label: "Received at", value: formatDate(notification.fundedAt), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' });
      }
      if (paymentMethod) detailsItems.push({ label: "Payment method", value: paymentMethod });
      if (notification.transactionHash) {
          detailsItems.push({ label: "Transaction Hash", value: truncateHash(notification.transactionHash), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' });
      }
      if (notification.paymentReference) {
          detailsItems.push({ label: "Payment reference", value: notification.paymentReference });
      }
      if (notification.confirmations !== undefined && notification.confirmationsRequired !== undefined) {
          detailsItems.push({ label: "Confirmations", value: `${notification.confirmations} / ${notification.confirmationsRequired}`, valueColor: notification.confirmations >= notification.confirmationsRequired ? "#4ade80" : "#ffffff", icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>' });
      }
  } else if (notification.eventKind === "completed") {
      detailsItems.push({ label: "Status", value: "Completed", valueColor: "#4ade80", icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' });
      if (notification.completedAt) {
          detailsItems.push({ label: "Completed at", value: formatDate(notification.completedAt), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' });
      }
      if (notification.transactionHash) {
          detailsItems.push({ label: "Transaction Hash", value: truncateHash(notification.transactionHash), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' });
      }
      if (notification.paymentReference) {
          detailsItems.push({ label: "Payment reference", value: notification.paymentReference });
      }
      if (paymentMethod) detailsItems.push({ label: "Payment method", value: paymentMethod });
      if (orderTypeLabel) detailsItems.push({ label: "Exchange type", value: orderTypeLabel, icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>' });
  } else {
      detailsItems.push({ label: "Status", value: humanizeStatus(notification.status).replace(/\b\w/g, l => l.toUpperCase()), valueColor: "#ffffff" });
  }

  let detailsHtml = '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #1e293b;padding-top:16px;">';
  for (let i = 0; i < detailsItems.length; i += 2) {
      const item1 = detailsItems[i];
      const item2 = detailsItems[i+1];
      detailsHtml += `<tr>
        <td width="50%" class="stack-col" style="vertical-align:top;padding:12px 8px;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;white-space:nowrap;">${item1.icon || ''}<span style="vertical-align:middle;">${escapeHtml(item1.label)}</span></div>
          <div style="font-size:13px;font-weight:500;color:${item1.valueColor || '#ffffff'};word-break:break-all;">${escapeHtml(item1.value)}</div>
        </td>
        ${item2 ? `
        <td width="50%" class="stack-col" style="vertical-align:top;padding:12px 8px;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;white-space:nowrap;">${item2.icon || ''}<span style="vertical-align:middle;">${escapeHtml(item2.label)}</span></div>
          <div style="font-size:13px;font-weight:500;color:${item2.valueColor || '#ffffff'};word-break:break-all;">${escapeHtml(item2.value)}</div>
        </td>
        ` : `<td width="50%"></td>`}
      </tr>`;
  }
  detailsHtml += '</table>';

  const socialPlatforms = ["Telegram", "X", "Instagram", "YouTube", "Facebook"];
  const socialLinksHtml = socialPlatforms.map((platform) => {
    const href = socialLinkFor(notification.socialLinks, platform);
    const content = escapeHtml(platform);
    const style = "display:inline-block;margin:0 3px 6px;padding:6px 8px;border-radius:999px;background-color:#111827;border:1px solid #243247;color:#cbd5e1;text-decoration:none;font-size:9px;line-height:1";
    return href
      ? `<a href="${escapeHtml(href)}" style="${style}">${content}</a>`
      : `<span style="${style}">${content}</span>`;
  }).join("");

  const text = [
    interpolateTemplate(configuredTemplate.message, values),
    "",
    `Order: ${notification.orderId}`,
    notification.adminRecipient ? `Customer: ${notification.customerName || "Guest"}` : "",
    `Exchange: ${route}`,
    `New status: ${status}`,
    paymentMethod ? `Payment method: ${paymentMethod}` : "",
    notification.transactionHash ? `Transaction hash: ${notification.transactionHash}` : "",
    notification.paymentReference ? `Payment reference: ${notification.paymentReference}` : "",
    notification.confirmations !== undefined && notification.confirmationsRequired !== undefined
      ? `Confirmations: ${notification.confirmations} / ${notification.confirmationsRequired}`
      : "",
    notification.eventKind === "completed" ? `Completion date: ${notification.completedAt?.toISOString() || notification.createdAt.toISOString()}` : "",
    notification.eventKind === "completed" && !notification.adminRecipient && invoiceUrl ? `Invoice: ${invoiceUrl}` : "",
    notification.eventKind === "completed" && !notification.adminRecipient && reviewUrl ? `Review us on Trustpilot: ${reviewUrl}` : "",
    "",
    interpolateTemplate(configuredTemplate.footerText, values),
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QuickXchange</title>
  <style type="text/css">
    @media screen and (max-width: 600px) {
      .stack-col { display: block !important; width: 100% !important; padding: 0 0 16px 0 !important; }
      .text-center { text-align: center !important; }
      .feature-col { display: inline-block !important; width: 50% !important; padding: 0 4px 8px 4px !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#060b14;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#060b14;padding:20px 10px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#060b14;">

      <!-- Header -->
      <tr><td style="padding-bottom:32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="vertical-align:middle;">
              <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:0.2px;">
                ${base ? `<img src="${escapeHtml(base)}/brand/quickxchange-mark.png" width="32" height="32" alt="Q" style="vertical-align:middle;margin-right:8px;border:none;" />` : ""}
                <span style="vertical-align:middle;">Quick<span style="color:#38bdf8;">X</span>change</span>
              </div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Secure digital asset exchange</div>
            </td>
            <td style="vertical-align:middle;text-align:right;">
              <div style="font-size:9px;font-weight:600;color:#cbd5e1;letter-spacing:1px;line-height:1.4;text-transform:uppercase;">
                EXCHANGE<br/>CONVERT<br/>BEYOND BORDERS
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Hero Section -->
      <tr><td style="padding-bottom:24px;">
        ${badgeHtml}
        <h1 style="font-size:32px;font-weight:700;margin:0 0 8px 0;color:#ffffff;">${heroTitle}</h1>
        ${heroSubtitle ? `<h2 style="font-size:20px;font-weight:600;margin:0 0 16px 0;color:#ffffff;">${heroSubtitle}</h2>` : ''}
        <p style="font-size:15px;line-height:1.6;color:#cbd5e1;margin:0 0 32px 0;max-width:480px;">${heroText}</p>
      </td></tr>

      <!-- Order Details Card -->
      <tr><td>
        <div style="background-color:#0b1324;border:1px solid #1e293b;border-radius:16px;padding:24px;margin-bottom:24px;">
          <!-- Card Header -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;border-bottom:1px solid #1e293b;padding-bottom:16px;">
            <tr>
              <td style="font-size:16px;font-weight:600;color:#ffffff;vertical-align:middle;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span style="vertical-align:middle;">Order Details</span>
              </td>
              <td style="text-align:right;font-size:14px;font-weight:600;color:#38bdf8;vertical-align:middle;">
                # ${escapeHtml(notification.orderId)}
              </td>
            </tr>
          </table>

          <!-- Exchange Flow -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td width="42%" style="text-align:center;vertical-align:middle;">
                <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">${sendLabel}</div>
                <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:4px;white-space:nowrap;">
                  ${escapeHtml(notification.amount)} ${escapeHtml(notification.fromAsset)}
                </div>
                <div style="font-size:12px;color:#94a3b8;">${escapeHtml(sendDescriptor)}</div>
              </td>
              <td width="16%" style="text-align:center;vertical-align:middle;">
                <div style="display:inline-block;width:32px;height:32px;line-height:32px;border-radius:50%;background-color:rgba(14,165,233,0.1);color:#38bdf8;font-size:18px;">&rarr;</div>
              </td>
              <td width="42%" style="text-align:center;vertical-align:middle;">
                <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">${receiveLabel}</div>
                <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:4px;white-space:nowrap;">
                  ${escapeHtml(notification.receiveAmount)} ${escapeHtml(notification.toAsset)}
                </div>
                <div style="font-size:12px;color:#94a3b8;">${escapeHtml(receiveDescriptor)}</div>
              </td>
            </tr>
          </table>

          ${detailsHtml}
        </div>
      </td></tr>

      ${notification.eventKind === "payment_received" ? `
      <!-- Timeline -->
      <tr><td style="padding:16px 0 32px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" width="25%" style="vertical-align:top;padding-top:10px;">
              <div style="width:24px;height:24px;border-radius:50%;background-color:#4ade80;color:#060b14;line-height:24px;font-size:12px;margin:0 auto 8px auto;border:2px solid #060b14;position:relative;z-index:2;font-weight:bold;">✓</div>
              <div style="font-size:11px;font-weight:600;color:#ffffff;line-height:1.4;">Order created</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Completed</div>
            </td>
            <td align="center" width="25%" style="vertical-align:top;padding-top:10px;">
              <div style="width:24px;height:24px;border-radius:50%;background-color:#4ade80;color:#060b14;line-height:24px;font-size:12px;margin:0 auto 8px auto;border:2px solid #060b14;position:relative;z-index:2;font-weight:bold;">✓</div>
              <div style="font-size:11px;font-weight:600;color:#4ade80;line-height:1.4;">Payment received</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Completed</div>
            </td>
            <td align="center" width="25%" style="vertical-align:top;padding-top:10px;">
              <div style="width:24px;height:24px;border-radius:50%;background-color:#1e293b;color:#cbd5e1;line-height:24px;font-size:12px;margin:0 auto 8px auto;border:2px solid #060b14;position:relative;z-index:2;">3</div>
              <div style="font-size:11px;font-weight:600;color:#ffffff;line-height:1.4;">Processing</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">In progress</div>
            </td>
            <td align="center" width="25%" style="vertical-align:top;padding-top:10px;">
              <div style="width:24px;height:24px;border-radius:50%;background-color:#1e293b;color:#cbd5e1;line-height:24px;font-size:12px;margin:0 auto 8px auto;border:2px solid #060b14;position:relative;z-index:2;">4</div>
              <div style="font-size:11px;font-weight:600;color:#ffffff;line-height:1.4;">Exchange completed</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Pending</div>
            </td>
          </tr>
        </table>
      </td></tr>
      ` : ""}

      <!-- Buttons -->
      <tr><td style="padding:16px 0 24px 0;text-align:center;">
        ${orderUrl ? `<a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:linear-gradient(90deg, #0ea5e9, #6366f1);background-color:#0ea5e9;color:#ffffff;font-weight:600;font-size:15px;padding:14px 28px;border-radius:9999px;text-decoration:none;">${buttonText} &rarr;</a>` : ""}
        ${notification.eventKind === "completed" && !notification.adminRecipient && invoiceUrl ? `<a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background-color:transparent;color:#ffffff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:9999px;text-decoration:none;border:1px solid #38bdf8;margin-left:12px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;margin-top:-2px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>Download Invoice</a>` : ""}
      </td></tr>

      <tr><td style="text-align:center;font-size:12px;color:#94a3b8;padding-bottom:32px;">
        ${footerText}
      </td></tr>

      ${notification.eventKind === "completed" && !notification.adminRecipient && reviewUrl ? `
      <!-- Trustpilot -->
      <tr><td style="padding-bottom:32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);border-radius:12px;">
          <tr>
            <td width="48" style="padding:16px 0 16px 16px;vertical-align:middle;">
              <span style="font-size:24px;color:#4ade80;">★</span>
            </td>
            <td style="padding:16px 0;vertical-align:middle;">
              <div style="font-size:14px;font-weight:600;color:#ffffff;margin-bottom:2px;">Enjoyed our service?</div>
              <div style="font-size:12px;color:#94a3b8;">Your feedback helps us grow!</div>
            </td>
            <td style="padding:16px;text-align:right;vertical-align:middle;">
              <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:8px 16px;background-color:transparent;border:1px solid #4ade80;color:#4ade80;text-decoration:none;border-radius:8px;font-size:12px;font-weight:600;">★ Review us on Trustpilot</a>
            </td>
          </tr>
        </table>
      </td></tr>
      ` : ""}

      <!-- Features -->
      <tr><td style="padding:16px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td width="25%" class="feature-col" align="center" style="padding:0 4px;vertical-align:top;">
              <div style="border:1px solid #1e293b;background-color:#0b1324;border-radius:12px;padding:16px 8px;min-height:80px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="margin-bottom:8px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <div style="font-size:11px;font-weight:600;color:#ffffff;margin-bottom:4px;">Secure</div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.3;">Your funds are safe with us</div>
              </div>
            </td>
            <td width="25%" class="feature-col" align="center" style="padding:0 4px;vertical-align:top;">
              <div style="border:1px solid #1e293b;background-color:#0b1324;border-radius:12px;padding:16px 8px;min-height:80px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="margin-bottom:8px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                <div style="font-size:11px;font-weight:600;color:#ffffff;margin-bottom:4px;">Fast</div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.3;">Quick processing time</div>
              </div>
            </td>
            <td width="25%" class="feature-col" align="center" style="padding:0 4px;vertical-align:top;">
              <div style="border:1px solid #1e293b;background-color:#0b1324;border-radius:12px;padding:16px 8px;min-height:80px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="margin-bottom:8px;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                <div style="font-size:11px;font-weight:600;color:#ffffff;margin-bottom:4px;">Global</div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.3;">Exchange without borders</div>
              </div>
            </td>
            <td width="25%" class="feature-col" align="center" style="padding:0 4px;vertical-align:top;">
              <div style="border:1px solid #1e293b;background-color:#0b1324;border-radius:12px;padding:16px 8px;min-height:80px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="margin-bottom:8px;"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>
                <div style="font-size:11px;font-weight:600;color:#ffffff;margin-bottom:4px;">24/7 Support</div>
                <div style="font-size:10px;color:#94a3b8;line-height:1.3;">We're here anytime</div>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding-top:40px;border-top:1px solid #1e293b;margin-top:16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td width="33%" class="stack-col text-center" style="vertical-align:top;padding-right:16px;">
              <div style="font-size:16px;font-weight:800;color:#ffffff;letter-spacing:0.2px;margin-bottom:4px;">
                ${base ? `<img src="${escapeHtml(base)}/brand/quickxchange-mark.png" width="20" height="20" alt="Q" style="vertical-align:middle;margin-right:4px;border:none;" />` : ""}
                <span style="vertical-align:middle;">Quick<span style="color:#38bdf8;">X</span>change</span>
              </div>
              <div style="font-size:8px;color:#38bdf8;font-weight:700;letter-spacing:1px;margin-bottom:12px;text-transform:uppercase;">YOUR CRYPTO EXCHANGE PARTNER</div>
              <div style="font-size:11px;color:#94a3b8;line-height:1.5;">Fast. Secure. Global. Exchange, convert and move your crypto with confidence.</div>
            </td>
            <td width="34%" class="stack-col text-center" style="vertical-align:top;text-align:center;">
              <div style="margin-bottom:16px;">
                ${socialLinksHtml}
              </div>
              <div style="font-size:11px;color:#94a3b8;line-height:1.5;">quickchange.exchange<br/>support@quickchange.exchange</div>
            </td>
            <td width="33%" class="stack-col text-center" style="vertical-align:top;text-align:right;padding-left:16px;">
              <div style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#cbd5e1;line-height:1.2;">Thank you<br/>for choosing<br/>QuickXchange!</div>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding-top:16px;border-top:1px solid #1e293b;margin-top:32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="font-size:10px;color:#64748b;">&copy; ${new Date().getUTCFullYear()} QuickXchange. All rights reserved.</td>
            <td style="font-size:10px;color:#64748b;text-align:right;">Trade Smarter. Move Freely.</td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

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
  const fromAddress = "QuickXchange <support@quickchange.exchange>";
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

type ConvertOrderRow = typeof quickexOrdersTable.$inferSelect;
type ConvertRoute = { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string };
type ConvertAmounts = {
  amount: string;
  receiveAmount: string;
  expectedReceiveAmount?: string | null;
  paidAmount?: string | null;
};
type ConvertNotificationPayload = {
  route?: ConvertRoute;
  amounts?: ConvertAmounts;
  providerOrderId?: string;
  providerReference?: string;
  providerState?: string;
  createdAt?: string;
  providerCreatedAt?: string | null;
  providerUpdatedAt?: string | null;
};

function positiveConvertAmount(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? value : undefined;
}

/** Queue Convert mail without ever consulting the Swap aggregate. */
export async function enqueueConvertEmailNotification(
  tx: DbTransaction,
  order: ConvertOrderRow,
  fromStatus: string,
  eventKind: "order_created" | "payment_received" | "processing" | "completed" | "failed_cancelled",
  evidenceKey = "",
) {
  const enabled = await tx.select().from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, "global")).limit(1);
  if (!customerEmailDeliveryEnabled() ||
      !customerEmailEventEnabled(enabled[0], eventKind) ||
      !order.customerEmail.trim()) return;
  await tx.insert(convertNotificationOutboxTable).values({
    quickexOrderId: order.legacyOrderId,
    customerClerkUserId: order.customerClerkUserId ?? `guest:${order.customerEmail.trim().toLowerCase()}`,
    recipientEmail: order.customerEmail.trim(),
    eventKind,
    fromStatus,
    toStatus: order.status,
    // Payment Received is an order-level fact, not a provider poll/version.
    // Keep one stable identity even if the provider later revises its amount.
    statusVersion: ["order_created", "payment_received"].includes(eventKind)
      ? 0
      : order.recordVersion,
    evidenceKey: eventKind === "order_created"
      ? "provider-created"
      : eventKind === "payment_received"
        ? "authoritative-paid"
        : evidenceKey,
    payload: {
      route: order.route as ConvertRoute,
      amounts: order.amounts as ConvertAmounts,
      providerOrderId: order.providerOrderId,
      providerReference: order.providerReference,
      providerState: order.providerState,
      createdAt: order.createdAt.toISOString(),
      providerCreatedAt: order.providerCreatedAt?.toISOString() ?? null,
      providerUpdatedAt: order.providerUpdatedAt?.toISOString() ?? null,
    } satisfies ConvertNotificationPayload,
  }).onConflictDoNothing({
    target: [
      convertNotificationOutboxTable.quickexOrderId,
      convertNotificationOutboxTable.eventKind,
      convertNotificationOutboxTable.statusVersion,
      convertNotificationOutboxTable.evidenceKey,
    ],
  });
}

function convertDeliveryEligible(at: Date) {
  return or(
    and(eq(convertNotificationOutboxTable.deliveryStatus, "pending"), lte(convertNotificationOutboxTable.nextAttemptAt, at)),
    and(eq(convertNotificationOutboxTable.deliveryStatus, "sending"), or(
      isNull(convertNotificationOutboxTable.claimExpiresAt),
      lte(convertNotificationOutboxTable.claimExpiresAt, at),
    )),
  );
}

/** Convert worker projection: only quickex_orders and notification settings are read. */
export async function processConvertNotificationOutbox(limit = 25): Promise<number> {
  if (!customerEmailDeliveryEnabled()) return 0;
  const now = new Date();
  const rows = await db.select().from(convertNotificationOutboxTable)
    .where(convertDeliveryEligible(now))
    .orderBy(asc(convertNotificationOutboxTable.createdAt), asc(convertNotificationOutboxTable.id))
    .limit(limit);
  let delivered = 0;
  for (const candidate of rows) {
    const claimToken = randomUUID();
    const [claimed] = await db.update(convertNotificationOutboxTable).set({
      deliveryStatus: "sending", lastAttemptAt: now, attemptCount: candidate.attemptCount + 1,
      claimToken, claimExpiresAt: new Date(now.getTime() + DELIVERY_CLAIM_LEASE_MS),
      providerIdempotencyStartedAt: sql`coalesce(${convertNotificationOutboxTable.providerIdempotencyStartedAt}, ${now})`,
    }).where(and(eq(convertNotificationOutboxTable.id, candidate.id), convertDeliveryEligible(now))).returning();
    if (!claimed) continue;
    const activeClaim = and(eq(convertNotificationOutboxTable.id, claimed.id), eq(convertNotificationOutboxTable.claimToken, claimToken));
    if (claimed.providerIdempotencyStartedAt &&
      now.getTime() - claimed.providerIdempotencyStartedAt.getTime() >= PROVIDER_IDEMPOTENCY_RETRY_WINDOW_MS) {
      await db.update(convertNotificationOutboxTable).set({
        deliveryStatus: "failed", claimToken: null, claimExpiresAt: null, lastErrorCode: "EMAIL_IDEMPOTENCY_WINDOW_EXPIRED",
      }).where(activeClaim);
      continue;
    }
    const [order] = await db.select().from(quickexOrdersTable)
      .where(eq(quickexOrdersTable.legacyOrderId, claimed.quickexOrderId)).limit(1);
    const [settings] = await db.select().from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.id, "global")).limit(1);
    const eventEnabled = customerEmailEventEnabled(settings, claimed.eventKind as Parameters<typeof customerEmailEventEnabled>[1]);
    const recipientEmail = claimed.customerClerkUserId.startsWith("guest:")
      ? (order?.customerEmail.trim() || claimed.recipientEmail.trim())
      : await getCustomerVerifiedEmail(claimed.customerClerkUserId);
    if (!order || !recipientEmail || !eventEnabled) {
      await db.update(convertNotificationOutboxTable).set({
        deliveryStatus: "suppressed", claimToken: null, claimExpiresAt: null,
        lastErrorCode: !recipientEmail ? "CUSTOMER_VERIFIED_EMAIL_MISSING" : "",
      }).where(activeClaim);
      continue;
    }
    const payload = claimed.payload as ConvertNotificationPayload;
    const route = payload.route ?? order.route as ConvertRoute;
    const amounts = payload.amounts ?? order.amounts as ConvertAmounts;
    const paidAmount = positiveConvertAmount(amounts.paidAmount);
    if (claimed.eventKind === "payment_received" && !paidAmount) {
      await db.update(convertNotificationOutboxTable).set({
        deliveryStatus: "suppressed",
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCode: "QUICKEX_PAYMENT_EVIDENCE_MISSING",
      }).where(activeClaim);
      continue;
    }
    const receiveAmount = claimed.eventKind === "completed"
      ? positiveConvertAmount(amounts.receiveAmount) ??
        positiveConvertAmount(amounts.expectedReceiveAmount) ??
        amounts.receiveAmount
      : positiveConvertAmount(amounts.expectedReceiveAmount) ??
        amounts.receiveAmount;
    const socialLinks = await db.select({ name: socialTrustLinksTable.name, href: socialTrustLinksTable.href })
      .from(socialTrustLinksTable).where(and(
        eq(socialTrustLinksTable.group, "social"), eq(socialTrustLinksTable.enabled, true), isNull(socialTrustLinksTable.removedAt),
      )).orderBy(asc(socialTrustLinksTable.createdAt));
    const notification: CustomerStatusNotification = {
      eventId: claimed.id, customerClerkUserId: claimed.customerClerkUserId, recipientEmail,
      trustpilotUrl: settings?.trustpilotReviewUrl ?? "", customerName: order.customerName,
      orderId: order.legacyOrderId, fromStatus: claimed.fromStatus, status: claimed.toStatus,
      fromAsset: route.fromAsset, fromNetwork: route.fromNetwork, toAsset: route.toAsset, toNetwork: route.toNetwork,
      amount: paidAmount ?? amounts.amount, receiveAmount, createdAt: order.createdAt,
      completedAt: claimed.eventKind === "completed"
        ? payload.providerUpdatedAt ? new Date(payload.providerUpdatedAt) : claimed.createdAt
        : null,
      fundedAt: claimed.eventKind === "payment_received"
        ? payload.providerUpdatedAt ? new Date(payload.providerUpdatedAt) : claimed.createdAt
        : null,
      eventKind: claimed.eventKind, template: notificationTemplateForEvent(settings?.emailTemplates, claimed.eventKind),
      paymentReference: payload.providerReference || payload.providerOrderId || undefined,
      orderType: "convert", socialLinks,
    };
    try {
      await sendCustomerStatusNotification(notification);
      const [done] = await db.update(convertNotificationOutboxTable).set({
        deliveryStatus: "delivered", deliveredAt: new Date(), claimToken: null, claimExpiresAt: null, lastErrorCode: "",
      }).where(activeClaim).returning({ id: convertNotificationOutboxTable.id });
      if (done) delivered++;
    } catch (error) {
      const exhausted = claimed.attemptCount >= MAX_DELIVERY_ATTEMPTS;
      await db.update(convertNotificationOutboxTable).set({
        deliveryStatus: exhausted ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + retryDelayMs(claimed.attemptCount)),
        claimToken: null, claimExpiresAt: null, lastErrorCode: error instanceof Error ? error.name : "DeliveryError",
      }).where(activeClaim);
    }
  }
  return delivered;
}

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
    let transactionHash = order?.transactionHash || undefined;
    let confirmations: number | undefined;
    let confirmationsRequired: number | undefined;
    let fundedAt = order?.manualSettlementFundedAt ?? null;

    if (claimed.eventKind !== "order_created") {
      const [whitebitPayment] = await db.select({
        id: whitebitDepositsTable.id,
        transactionHash: whitebitDepositsTable.transactionHash,
        confirmations: whitebitDepositsTable.confirmationsActual,
        confirmationsRequired: whitebitDepositsTable.confirmationsRequired,
        creditedAt: whitebitDepositsTable.creditedAt,
      })
        .from(whitebitDepositsTable)
        .where(and(
          eq(whitebitDepositsTable.orderId, claimed.orderId),
          eq(whitebitDepositsTable.status, "processed"),
        ))
        .limit(1);
      const [blockchainPayment] = whitebitPayment ? [] : await db
        .select({
          id: blockchainMonitorMatchesTable.id,
          observationId: blockchainMonitorMatchesTable.observationId,
          confirmations: blockchainMonitorMatchesTable.confirmations,
          confirmationsRequired: blockchainMonitorMatchesTable.confirmationsRequired,
          appliedAt: blockchainMonitorMatchesTable.appliedAt,
        })
        .from(blockchainMonitorMatchesTable)
        .where(and(
          eq(blockchainMonitorMatchesTable.orderId, claimed.orderId),
          eq(blockchainMonitorMatchesTable.state, "applied"),
        ))
        .limit(1);

      if (blockchainPayment) {
        const [observation] = await db
          .select({ transactionHash: blockchainMonitorObservationsTable.transactionHash })
          .from(blockchainMonitorObservationsTable)
          .where(eq(blockchainMonitorObservationsTable.id, blockchainPayment.observationId))
          .limit(1);
        if (observation?.transactionHash) transactionHash = observation.transactionHash;
        confirmations = blockchainPayment.confirmations;
        confirmationsRequired = blockchainPayment.confirmationsRequired;
        fundedAt = blockchainPayment.appliedAt ?? fundedAt;
      } else if (whitebitPayment && whitebitPayment.transactionHash) {
        transactionHash = whitebitPayment.transactionHash;
        confirmations = whitebitPayment.confirmations ?? undefined;
        confirmationsRequired = whitebitPayment.confirmationsRequired ?? undefined;
        fundedAt = whitebitPayment.creditedAt ?? fundedAt;
      }

      if (claimed.adminRecipient || claimed.eventKind === "payment_received") {
        authoritativePaymentExists = Boolean(whitebitPayment || blockchainPayment);
      }
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
    const socialLinks = await db
      .select({
        name: socialTrustLinksTable.name,
        href: socialTrustLinksTable.href,
      })
      .from(socialTrustLinksTable)
      .where(and(
        eq(socialTrustLinksTable.group, "social"),
        eq(socialTrustLinksTable.enabled, true),
        isNull(socialTrustLinksTable.removedAt),
      ))
      .orderBy(asc(socialTrustLinksTable.createdAt));

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
      fundedAt,
      receiveMethod: order.payoutMethod,
      paymentMethod: order.paymentMethod,
      eventKind: claimed.eventKind,
      adminRecipient: claimed.adminRecipient,
      template: notificationTemplateForEvent(
        notificationSettings?.emailTemplates,
        claimed.eventKind,
      ),
      transactionHash,
      paymentReference: order.paymentReference || undefined,
      confirmations,
      confirmationsRequired,
      orderType: order.type,
      socialLinks,
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