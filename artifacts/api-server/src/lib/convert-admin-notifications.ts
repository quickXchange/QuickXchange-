import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  convertAdminNotificationOutboxTable,
  db,
  notificationSettingsTable,
  quickexOrdersTable,
} from "@workspace/db";
import type { NotificationSettings } from "@workspace/db";
import { adminEmailEventEnabled, adminTelegramEventEnabled, type NotificationEventKind } from "./notification-policy";
import { ResendRequestError, resendResponseError, sendResendRequest } from "./resend";
import { escapeTelegramHtml, formatTelegramOrderId, sendTelegramMessage, telegramEnabled } from "./telegram-api";

const CLAIM_LEASE_MS = 5 * 60_000;
const EMAIL_IDEMPOTENCY_WINDOW_MS = 12 * 60 * 60_000;
const MAX_ATTEMPTS = 8;
const MAX_RETRY_MS = 15 * 60_000;
const EVENT_KINDS: readonly NotificationEventKind[] = [
  "payment_received", "processing", "completed", "failed_cancelled",
];

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QuickexOrderRow = typeof quickexOrdersTable.$inferSelect;
type Channel = "email" | "telegram";

type AdminConvertPayload = {
  orderId: string;
  eventKind: NotificationEventKind;
  status: string;
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  amount: string;
  receiveAmount: string;
  paidAmount?: string;
};

function routeOf(order: QuickexOrderRow) {
  return order.route as {
    fromAsset?: string; fromNetwork?: string; toAsset?: string; toNetwork?: string;
  };
}

function amountsOf(order: QuickexOrderRow) {
  return order.amounts as {
    amount?: string; receiveAmount?: string; expectedReceiveAmount?: string; providerPaidAmount?: string | null;
  };
}

function positiveAmount(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? value : undefined;
}

function adminPayload(order: QuickexOrderRow, eventKind: NotificationEventKind): AdminConvertPayload {
  const route = routeOf(order);
  const amounts = amountsOf(order);
  return {
    orderId: order.legacyOrderId,
    eventKind,
    status: order.status,
    fromAsset: route.fromAsset ?? "",
    fromNetwork: route.fromNetwork ?? "",
    toAsset: route.toAsset ?? "",
    toNetwork: route.toNetwork ?? "",
    amount: amounts.amount ?? "",
    receiveAmount: amounts.expectedReceiveAmount ?? amounts.receiveAmount ?? "",
    ...(positiveAmount(amounts.providerPaidAmount) ? { paidAmount: positiveAmount(amounts.providerPaidAmount) } : {}),
  };
}

/**
 * Queue each Admin delivery independently in the same transaction as the
 * provider projection. Reconciliation retries use the stable event identity,
 * not an incrementing record version.
 */
export async function enqueueConvertAdminNotification(
  tx: DbTransaction,
  order: QuickexOrderRow,
  fromStatus: string,
  eventKind: NotificationEventKind,
  evidenceKey: string,
) {
  if (!EVENT_KINDS.includes(eventKind)) return 0;
  const [settings] = await tx.select().from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, "global")).limit(1);
  if (!settings) return 0;

  const paidAmount = positiveAmount(amountsOf(order).providerPaidAmount);
  // A claimed deposit amount or a status label alone is not payment evidence.
  if (["payment_received", "processing", "completed"].includes(eventKind) && !paidAmount) return 0;

  const payload = adminPayload(order, eventKind);
  let queued = 0;
  const recipients: Array<{ channel: Channel; recipient: string; enabled: boolean }> = [
    {
      channel: "email",
      recipient: settings.adminNotificationEmail,
      enabled: adminEmailEventEnabled(settings, eventKind),
    },
    {
      channel: "telegram",
      recipient: settings.adminTelegramChatId,
      enabled: adminTelegramEventEnabled(settings, eventKind),
    },
  ];
  for (const target of recipients) {
    if (!target.enabled || !target.recipient.trim()) continue;
    const [inserted] = await tx.insert(convertAdminNotificationOutboxTable).values({
      quickexOrderId: order.legacyOrderId,
      eventKind,
      channel: target.channel,
      recipient: target.recipient,
      fromStatus,
      toStatus: order.status,
      statusVersion: 0,
      evidenceKey,
      payload,
    }).onConflictDoNothing({
      target: [
        convertAdminNotificationOutboxTable.quickexOrderId,
        convertAdminNotificationOutboxTable.eventKind,
        convertAdminNotificationOutboxTable.statusVersion,
        convertAdminNotificationOutboxTable.channel,
        convertAdminNotificationOutboxTable.recipient,
        convertAdminNotificationOutboxTable.evidenceKey,
      ],
    }).returning({ id: convertAdminNotificationOutboxTable.id });
    queued += inserted ? 1 : 0;
  }
  return queued;
}

function eventTitle(eventKind: NotificationEventKind): string {
  return eventKind === "payment_received" ? "Payment received"
    : eventKind === "processing" ? "Processing"
      : eventKind === "completed" ? "Completed"
        : "Failed or cancelled";
}

function safeHtml(value: unknown): string {
  return escapeTelegramHtml(value);
}

function formatAdminTelegram(payload: AdminConvertPayload): string {
  const title = eventTitle(payload.eventKind);
  const lines = [`<b>Convert order: ${safeHtml(title)}</b>`, "", formatTelegramOrderId(payload.orderId)];
  if (payload.eventKind === "payment_received") {
    lines.push("", `Provider-reported payment: <b>${safeHtml(payload.paidAmount)} ${safeHtml(payload.fromAsset)}</b>`);
  } else if (payload.eventKind === "failed_cancelled") {
    lines.push("", `Status: <b>${safeHtml(payload.status)}</b>`,
      "", "This status alert makes no claim about whether payment was sent or received.");
  } else {
    lines.push("", `Status: <b>${safeHtml(payload.status)}</b>`,
      `Route: <b>${safeHtml(payload.fromAsset)} → ${safeHtml(payload.toAsset)}</b>`);
    if (payload.eventKind === "completed") {
      lines.push(`Provider-reported paid amount: <b>${safeHtml(payload.paidAmount)} ${safeHtml(payload.fromAsset)}</b>`);
    }
  }
  return lines.join("\n");
}

function emailContent(payload: AdminConvertPayload) {
  const title = eventTitle(payload.eventKind);
  const details = payload.eventKind === "payment_received"
    ? `Quickex reports a payment of ${payload.paidAmount} ${payload.fromAsset}.`
    : payload.eventKind === "failed_cancelled"
      ? `Quickex reported the order status as ${payload.status}. This alert makes no claim about whether payment was sent or received.`
      : `Quickex reports the order status as ${payload.status}.`;
  const subject = `Convert order ${payload.orderId}: ${title}`;
  const text = `${subject}\n${details}\nRoute: ${payload.fromAsset} (${payload.fromNetwork}) → ${payload.toAsset} (${payload.toNetwork})`;
  const html = `<h2>${safeHtml(title)}</h2><p>Order ID: <strong>${safeHtml(payload.orderId)}</strong></p><p>${safeHtml(details)}</p><p>Route: ${safeHtml(payload.fromAsset)} (${safeHtml(payload.fromNetwork)}) → ${safeHtml(payload.toAsset)} (${safeHtml(payload.toNetwork)})</p>`;
  return { subject, text, html };
}

function deliveryErrorCode(error: unknown, channel: Channel): string {
  if (error instanceof ResendRequestError) return "EMAIL_RESEND_REJECTED";
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name)) {
    return `${channel === "email" ? "EMAIL" : "TELEGRAM"}_${error.name}`;
  }
  return channel === "email" ? "EMAIL_DELIVERY_FAILED" : "TELEGRAM_DELIVERY_FAILED";
}

function eventEnabled(settings: NotificationSettings | undefined, eventKind: string, channel: Channel): boolean {
  if (!EVENT_KINDS.includes(eventKind as NotificationEventKind)) return false;
  return channel === "email"
    ? adminEmailEventEnabled(settings, eventKind as NotificationEventKind)
    : adminTelegramEventEnabled(settings, eventKind as NotificationEventKind);
}

function eligibleAt(at: Date) {
  return or(
    and(eq(convertAdminNotificationOutboxTable.deliveryStatus, "pending"),
      lte(convertAdminNotificationOutboxTable.nextAttemptAt, at)),
    and(eq(convertAdminNotificationOutboxTable.deliveryStatus, "sending"), or(
      isNull(convertAdminNotificationOutboxTable.claimExpiresAt),
      lte(convertAdminNotificationOutboxTable.claimExpiresAt, at),
    )),
  );
}

/** Durable worker; email and Telegram rows have independent claims and retries. */
export async function processConvertAdminNotificationOutbox(limit = 25): Promise<number> {
  const now = new Date();
  const candidates = await db.select().from(convertAdminNotificationOutboxTable)
    .where(eligibleAt(now))
    .orderBy(asc(convertAdminNotificationOutboxTable.createdAt), asc(convertAdminNotificationOutboxTable.id))
    .limit(limit);
  let delivered = 0;
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const [claimed] = await db.update(convertAdminNotificationOutboxTable).set({
      deliveryStatus: "sending",
      attemptCount: candidate.attemptCount + 1,
      claimToken,
      claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      ...(candidate.channel === "email"
        ? { providerIdempotencyStartedAt: sql`coalesce(${convertAdminNotificationOutboxTable.providerIdempotencyStartedAt}, ${now})` }
        : {}),
    }).where(and(
      eq(convertAdminNotificationOutboxTable.id, candidate.id),
      eligibleAt(now),
    )).returning();
    if (!claimed) continue;
    const activeClaim = and(
      eq(convertAdminNotificationOutboxTable.id, claimed.id),
      eq(convertAdminNotificationOutboxTable.claimToken, claimToken),
    );
    const suppress = async (errorCode = "") => {
      await db.update(convertAdminNotificationOutboxTable).set({
        deliveryStatus: "suppressed",
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCode: errorCode,
      }).where(activeClaim);
    };

    const [settings] = await db.select().from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.id, "global")).limit(1);
    const currentRecipient = claimed.channel === "email"
      ? settings?.adminNotificationEmail
      : settings?.adminTelegramChatId;
    if (
      (claimed.channel !== "email" && claimed.channel !== "telegram") ||
      !eventEnabled(settings, claimed.eventKind, claimed.channel) ||
      currentRecipient !== claimed.recipient
    ) {
      await suppress();
      continue;
    }
    const payload = claimed.payload as AdminConvertPayload;
    if (
      !payload || payload.orderId !== claimed.quickexOrderId ||
      !EVENT_KINDS.includes(claimed.eventKind as NotificationEventKind) ||
      (["payment_received", "processing", "completed"].includes(claimed.eventKind) &&
        !positiveAmount(payload.paidAmount))
    ) {
      await suppress("CONVERT_ADMIN_EVENT_EVIDENCE_INVALID");
      continue;
    }
    if (claimed.channel === "email" && claimed.providerIdempotencyStartedAt &&
      now.getTime() - claimed.providerIdempotencyStartedAt.getTime() >= EMAIL_IDEMPOTENCY_WINDOW_MS) {
      await db.update(convertAdminNotificationOutboxTable).set({
        deliveryStatus: "failed", claimToken: null, claimExpiresAt: null,
        lastErrorCode: "EMAIL_IDEMPOTENCY_WINDOW_EXPIRED",
      }).where(activeClaim);
      continue;
    }

    try {
      if (claimed.channel === "email") {
        const content = emailContent(payload);
        const response = await sendResendRequest("/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `convert-admin-${claimed.id}`,
          },
          body: {
            to: [claimed.recipient],
            from: process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL?.trim() ||
              "QuickXchange <support@quickchange.exchange>",
            ...content,
          },
        });
        if (!response.ok) throw await resendResponseError(response);
      } else {
        if (!telegramEnabled()) throw new Error("TELEGRAM_NOT_CONFIGURED");
        const accepted = await sendTelegramMessage(claimed.recipient, formatAdminTelegram(payload));
        if (accepted === undefined) throw new Error("TELEGRAM_NOT_ACCEPTED");
      }
      const [done] = await db.update(convertAdminNotificationOutboxTable).set({
        deliveryStatus: "delivered",
        deliveredAt: new Date(),
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCode: "",
      }).where(activeClaim).returning({ id: convertAdminNotificationOutboxTable.id });
      delivered += done ? 1 : 0;
    } catch (error) {
      const exhausted = claimed.attemptCount >= MAX_ATTEMPTS;
      const retryDelay = Math.min(15_000 * (2 ** Math.min(claimed.attemptCount - 1, 10)), MAX_RETRY_MS);
      await db.update(convertAdminNotificationOutboxTable).set({
        deliveryStatus: exhausted ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + retryDelay),
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCode: deliveryErrorCode(error, claimed.channel),
      }).where(activeClaim);
    }
  }
  return delivered;
}

export function isConvertAdminNotificationEvent(eventKind: string): eventKind is NotificationEventKind {
  return EVENT_KINDS.includes(eventKind as NotificationEventKind);
}