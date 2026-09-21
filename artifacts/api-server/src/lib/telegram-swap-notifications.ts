import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  telegramChatsTable,
  telegramNotificationOutboxTable,
  telegramOrderLinksTable,
  whitebitDepositsTable,
  blockchainMonitorMatchesTable,
  notificationSettingsTable,
  customerStatusNotificationEventsTable,
} from "@workspace/db";
import { formatTelegramOrderId } from "./telegram-api";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderRow = typeof ordersTable.$inferSelect;

export type SwapTelegramEventKind =
  | "payment_received"
  | "processing"
  | "completed"
  | "failed_cancelled";

type SettlementIdentity = {
  kind?: unknown;
  title?: unknown;
  assetCode?: unknown;
  routeNetwork?: unknown;
  networkTitle?: unknown;
};

export type SwapTelegramNotificationPayload = {
  eventKind: SwapTelegramEventKind;
  orderId: string;
  status: string;
  sendAmount: string;
  sendAsset: string;
  sendMethod: string;
  sendNetwork: string;
  receiveAmount: string;
  receiveAsset: string;
  receiveMethod: string;
  receiveNetwork: string;
  receivedAmount?: string;
  receivedAsset?: string;
  receivedNetwork?: string;
};

export function swapTelegramStatusLabel(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "awaiting funds": return "AWAITING FUNDS";
    case "payment detected": return "PAYMENT DETECTED";
    case "confirming": return "CONFIRMING";
    case "processing": return "PROCESSING";
    case "completed": return "DONE ✅";
    case "cancelled": return "CANCELLED";
    case "failed": return "FAILED";
    case "refunded": return "REFUNDED";
    default: return status;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function settlementIdentities(order: OrderRow): {
  source?: SettlementIdentity;
  target?: SettlementIdentity;
} {
  const snapshot = order.settlementSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const candidate = snapshot as { source?: unknown; target?: unknown };
  return {
    source: candidate.source && typeof candidate.source === "object"
      ? candidate.source as SettlementIdentity
      : undefined,
    target: candidate.target && typeof candidate.target === "object"
      ? candidate.target as SettlementIdentity
      : undefined,
  };
}

export function buildSwapTelegramNotificationPayload(
  order: OrderRow,
  eventKind: SwapTelegramEventKind,
  received?: { amount: string; asset: string; network: string },
): SwapTelegramNotificationPayload {
  const { source, target } = settlementIdentities(order);
  const sourceIsPaymentMethod = source?.kind === "fiat-payment-method";
  const targetIsPaymentMethod = target?.kind === "fiat-payment-method";
  return {
    eventKind,
    orderId: order.id,
    status: order.status,
    sendAmount: order.amount,
    sendAsset: order.fromAsset,
    sendMethod: sourceIsPaymentMethod
      ? text(source?.title) || order.paymentMethod || order.fromAsset
      : order.fromAsset,
    sendNetwork: sourceIsPaymentMethod
      ? ""
      : text(source?.routeNetwork) || text(source?.networkTitle) || order.fromNetwork,
    receiveAmount: order.receiveAmount,
    receiveAsset: order.toAsset,
    receiveMethod: targetIsPaymentMethod
      ? text(target?.title) || order.payoutMethod || order.toAsset
      : order.toAsset,
    receiveNetwork: targetIsPaymentMethod
      ? ""
      : text(target?.routeNetwork) || text(target?.networkTitle) || order.toNetwork,
    ...(received
      ? {
          receivedAmount: received.amount,
          receivedAsset: received.asset,
          receivedNetwork: received.network,
        }
      : {}),
  };
}

export async function enqueueSwapTelegramNotification(
  tx: DbTransaction,
  order: OrderRow,
  eventKind: SwapTelegramEventKind,
  received?: { amount: string; asset: string; network: string },
): Promise<number> {
  if (order.type !== "manual") return 0;
  const [settings] = await tx.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global")).limit(1);
  if (settings && eventKind === "completed" && !settings.completedEnabled) return 0;
  let queued = 0;
  if (
    eventKind === "payment_received" &&
    settings?.emailEnabled !== false &&
    settings?.paymentReceivedEnabled !== false
  ) {
    const evidenceKey = `payment_received:${order.id}`;
    if (order.statusNotificationsEnabled && order.customerEmail.trim()) {
      await tx.insert(customerStatusNotificationEventsTable).values({
        orderId: order.id,
        customerClerkUserId: order.customerClerkUserId ?? `guest:${order.customerEmail.trim().toLowerCase()}`,
        fromStatus: order.status,
        toStatus: "payment_received",
        statusVersion: 0,
        eventKind: "payment_received",
        recipientEmail: order.customerEmail.trim(),
        evidenceKey,
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
    if (settings?.adminNotificationEmail) {
      await tx.insert(customerStatusNotificationEventsTable).values({
        orderId: order.id,
        customerClerkUserId: `admin:${settings.adminNotificationEmail.toLowerCase()}`,
        fromStatus: order.status,
        toStatus: "payment_received",
        statusVersion: 0,
        eventKind: "payment_received",
        recipientEmail: settings.adminNotificationEmail,
        adminRecipient: true,
        evidenceKey,
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
  }
  if (
    eventKind === "payment_received" &&
    order.status.trim().toLowerCase() === "processing" &&
    settings?.processingEnabled !== false
  ) {
    if (settings?.emailEnabled !== false && settings?.adminNotificationEmail) {
      await tx.insert(customerStatusNotificationEventsTable).values({
        orderId: order.id,
        customerClerkUserId: `admin:${settings.adminNotificationEmail.toLowerCase()}`,
        fromStatus: "payment_received",
        toStatus: order.status,
        statusVersion: order.statusVersion,
        eventKind: "processing",
        recipientEmail: settings.adminNotificationEmail,
        adminRecipient: true,
        evidenceKey: `lifecycle:${order.id}:${order.statusVersion}`,
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
    queued += await enqueueAdminSwapTelegramLifecycleNotification(tx, order, "processing");
  }
  if (
    settings &&
    (!settings.telegramEnabled ||
      (eventKind === "payment_received" && !settings.paymentReceivedEnabled))
  ) {
    return queued;
  }
  const links = await tx
    .select({
      chatId: telegramOrderLinksTable.chatId,
      clerkCustomerUserId: telegramChatsTable.clerkCustomerUserId,
    })
    .from(telegramOrderLinksTable)
    .innerJoin(
      telegramChatsTable,
      eq(telegramChatsTable.chatId, telegramOrderLinksTable.chatId),
    )
    .where(and(
      eq(telegramOrderLinksTable.orderId, order.id),
      inArray(telegramOrderLinksTable.orderKind, ["manual", "swap"]),
    ));
  const payload = buildSwapTelegramNotificationPayload(order, eventKind, received);
  for (const link of links) {
    if (
      order.customerClerkUserId &&
      link.clerkCustomerUserId &&
      order.customerClerkUserId !== link.clerkCustomerUserId
    ) {
      continue;
    }
    await tx
      .insert(telegramNotificationOutboxTable)
      .values({
        chatId: link.chatId,
        orderId: order.id,
        statusVersion: order.statusVersion,
        eventKind: "status",
        payload: {
          status: order.status,
          amount: order.amount,
          receiveAmount: order.receiveAmount,
          orderKind: "manual",
        },
        deliveryStatus: "delivered",
        deliveredAt: new Date(),
      })
      .onConflictDoNothing();
    const inserted = await tx
      .insert(telegramNotificationOutboxTable)
      .values({
        chatId: link.chatId,
        orderId: order.id,
        statusVersion: eventKind === "payment_received" ? 0 : order.statusVersion,
        eventKind,
        payload,
      })
      .onConflictDoNothing()
      .returning({ id: telegramNotificationOutboxTable.id });
    queued += inserted.length;
  }
  // The configured admin destination is deliberately independent of customer
  // order links. This is only reached by authoritative payment evidence or a
  // later terminal lifecycle enqueue, never by order creation.
  if (
    settings?.adminTelegramChatId &&
    ((eventKind === "payment_received" && settings.paymentReceivedEnabled) ||
      (eventKind === "completed" && settings.completedEnabled))
  ) {
    if (eventKind === "completed") {
      const [whitebitPayment] = await tx.select({ id: whitebitDepositsTable.id })
        .from(whitebitDepositsTable)
        .where(and(
          eq(whitebitDepositsTable.orderId, order.id),
          eq(whitebitDepositsTable.status, "processed"),
        ))
        .limit(1);
      const [blockchainPayment] = whitebitPayment ? [] : await tx
        .select({ id: blockchainMonitorMatchesTable.id })
        .from(blockchainMonitorMatchesTable)
        .where(and(
          eq(blockchainMonitorMatchesTable.orderId, order.id),
          eq(blockchainMonitorMatchesTable.state, "applied"),
        ))
        .limit(1);
      if (!whitebitPayment && !blockchainPayment) return queued;
    }
    await tx.insert(telegramNotificationOutboxTable).values({
      chatId: settings.adminTelegramChatId,
      orderId: order.id,
      statusVersion: eventKind === "payment_received" ? 0 : order.statusVersion,
      eventKind,
      payload: { ...payload, adminRecipient: true },
    }).onConflictDoNothing();
    queued += 1;
  }
  return queued;
}

export async function enqueueAdminSwapTelegramLifecycleNotification(
  tx: DbTransaction,
  order: OrderRow,
  eventKind: "processing" | "failed_cancelled",
): Promise<number> {
  if (order.type !== "manual") return 0;
  const [settings] = await tx.select().from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, "global"))
    .limit(1);
  if (
    !settings?.telegramEnabled ||
    !settings.adminTelegramChatId ||
    (eventKind === "processing" && !settings.processingEnabled) ||
    (eventKind === "failed_cancelled" && !settings.failedCancelledEnabled)
  ) {
    return 0;
  }
  const [whitebitPayment] = await tx.select({ id: whitebitDepositsTable.id })
    .from(whitebitDepositsTable)
    .where(and(
      eq(whitebitDepositsTable.orderId, order.id),
      eq(whitebitDepositsTable.status, "processed"),
    ))
    .limit(1);
  const [blockchainPayment] = whitebitPayment ? [] : await tx
    .select({ id: blockchainMonitorMatchesTable.id })
    .from(blockchainMonitorMatchesTable)
    .where(and(
      eq(blockchainMonitorMatchesTable.orderId, order.id),
      eq(blockchainMonitorMatchesTable.state, "applied"),
    ))
    .limit(1);
  if (!whitebitPayment && !blockchainPayment) return 0;
  const inserted = await tx.insert(telegramNotificationOutboxTable).values({
    chatId: settings.adminTelegramChatId,
    orderId: order.id,
    statusVersion: order.statusVersion,
    eventKind,
    payload: {
      ...buildSwapTelegramNotificationPayload(order, eventKind),
      adminRecipient: true,
    },
  }).onConflictDoNothing().returning({ id: telegramNotificationOutboxTable.id });
  return inserted.length;
}

export async function swapTelegramRecipientIsCurrent(
  chatId: string,
  orderId: string,
  eventKind: SwapTelegramEventKind,
): Promise<boolean> {
  const [linked] = await db
    .select({
      status: ordersTable.status,
      type: ordersTable.type,
      customerClerkUserId: ordersTable.customerClerkUserId,
      chatCustomerClerkUserId: telegramChatsTable.clerkCustomerUserId,
    })
    .from(telegramOrderLinksTable)
    .innerJoin(
      telegramChatsTable,
      eq(telegramChatsTable.chatId, telegramOrderLinksTable.chatId),
    )
    .innerJoin(ordersTable, eq(ordersTable.id, telegramOrderLinksTable.orderId))
    .where(and(
      eq(telegramOrderLinksTable.chatId, chatId),
      eq(telegramOrderLinksTable.orderId, orderId),
      inArray(telegramOrderLinksTable.orderKind, ["manual", "swap"]),
    ))
    .limit(1);
  if (!linked || linked.type !== "manual") return false;
  if (
    linked.customerClerkUserId &&
    linked.chatCustomerClerkUserId &&
    linked.customerClerkUserId !== linked.chatCustomerClerkUserId
  ) {
    return false;
  }
  if (eventKind === "completed") return linked.status === "completed";
  if (eventKind === "processing") return linked.status === "processing";
  if (eventKind === "failed_cancelled") {
    return ["failed", "cancelled", "canceled", "refunded"].includes(linked.status.toLowerCase());
  }
  const [deposit] = await db.select({ id: whitebitDepositsTable.id }).from(whitebitDepositsTable)
    .where(and(eq(whitebitDepositsTable.orderId, orderId), eq(whitebitDepositsTable.status, "processed"))).limit(1);
  if (deposit) return true;
  const [blockchainMatch] = await db.select({ id: blockchainMonitorMatchesTable.id })
    .from(blockchainMonitorMatchesTable)
    .where(and(eq(blockchainMonitorMatchesTable.orderId, orderId), eq(blockchainMonitorMatchesTable.state, "applied"))).limit(1);
  return Boolean(blockchainMatch);
}

export async function adminSwapTelegramRecipientIsCurrent(
  chatId: string,
  orderId: string,
  eventKind: SwapTelegramEventKind,
): Promise<boolean> {
  const [settings] = await db.select().from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, "global"))
    .limit(1);
  const eventEnabled = eventKind === "payment_received"
    ? settings?.paymentReceivedEnabled
    : eventKind === "completed"
      ? settings?.completedEnabled
      : eventKind === "failed_cancelled"
        ? settings?.failedCancelledEnabled
        : settings?.processingEnabled;
  if (
    !settings?.telegramEnabled ||
    !eventEnabled ||
    !settings.adminTelegramChatId ||
    settings.adminTelegramChatId !== chatId
  ) {
    return false;
  }
  const [order] = await db.select({ type: ordersTable.type })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!order || order.type !== "manual") return false;
  const [deposit] = await db.select({ id: whitebitDepositsTable.id })
    .from(whitebitDepositsTable)
    .where(and(
      eq(whitebitDepositsTable.orderId, orderId),
      eq(whitebitDepositsTable.status, "processed"),
    ))
    .limit(1);
  if (deposit) return true;
  const [blockchainMatch] = await db.select({ id: blockchainMonitorMatchesTable.id })
    .from(blockchainMonitorMatchesTable)
    .where(and(
      eq(blockchainMonitorMatchesTable.orderId, orderId),
      eq(blockchainMonitorMatchesTable.state, "applied"),
    ))
    .limit(1);
  return Boolean(blockchainMatch);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routeLabel(method: string, asset: string, network: string): string {
  const identity = method || asset;
  return network ? `${identity} (${network})` : identity;
}

export function formatSwapTelegramNotification(
  payload: SwapTelegramNotificationPayload,
): string {
  if (payload.eventKind === "payment_received") {
    return [
      "✅ <b>Payment Received</b>",
      "",
      formatTelegramOrderId(payload.orderId),
      "",
      `Received: <b>${escapeHtml(payload.receivedAmount)} ${escapeHtml(payload.receivedAsset)}</b>`,
      `Network: <b>${escapeHtml(payload.receivedNetwork)}</b>`,
      "",
      "Your payment has been received successfully.",
      "",
      "⏳ Your order is now being processed.",
    ].join("\n");
  }
  if (payload.eventKind === "processing") {
    return [
      "⏳ <b>Order Processing</b>",
      "",
      formatTelegramOrderId(payload.orderId),
      "",
      `<b>${escapeHtml(payload.sendAmount)} ${escapeHtml(routeLabel(payload.sendMethod, payload.sendAsset, payload.sendNetwork))}</b>`,
      "→",
      `<b>${escapeHtml(payload.receiveAmount)} ${escapeHtml(routeLabel(payload.receiveMethod, payload.receiveAsset, payload.receiveNetwork))}</b>`,
      "",
      "Status: <b>Processing</b>",
    ].join("\n");
  }
  if (payload.eventKind === "failed_cancelled") {
    return [
      "⚠️ <b>Order Failed / Cancelled</b>",
      "",
      formatTelegramOrderId(payload.orderId),
      "",
      `<b>${escapeHtml(payload.sendAmount)} ${escapeHtml(routeLabel(payload.sendMethod, payload.sendAsset, payload.sendNetwork))}</b>`,
      "→",
      `<b>${escapeHtml(payload.receiveAmount)} ${escapeHtml(routeLabel(payload.receiveMethod, payload.receiveAsset, payload.receiveNetwork))}</b>`,
      "",
      `Status: <b>${escapeHtml(swapTelegramStatusLabel(payload.status))}</b>`,
    ].join("\n");
  }
  return [
    "<b>Done ✅</b>",
    "",
    formatTelegramOrderId(payload.orderId),
    "",
    `<b>${escapeHtml(payload.sendAmount)} ${escapeHtml(routeLabel(payload.sendMethod, payload.sendAsset, payload.sendNetwork))}</b>`,
    "→",
    `<b>${escapeHtml(payload.receiveAmount)} ${escapeHtml(routeLabel(payload.receiveMethod, payload.receiveAsset, payload.receiveNetwork))}</b>`,
    "",
    "Status: <b>Done ✅</b>",
    "",
    "Your QuickXchange order has been completed successfully.",
  ].join("\n");
}