import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  quickexOrdersTable,
  telegramChatsTable,
  telegramNotificationOutboxTable,
  telegramOrderLinksTable,
} from "@workspace/db";
import { formatTelegramOrderId } from "./telegram-api";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QuickexOrderRow = typeof quickexOrdersTable.$inferSelect;
type ConvertEventKind = "payment_received" | "completed";

export type ConvertNotificationPayload = {
  eventKind: ConvertEventKind;
  orderKind: "convert";
  orderId: string;
  status: string;
  sendAmount: string;
  sendAsset: string;
  sendNetwork: string;
  receiveAmount: string;
  receiveAsset: string;
  receiveNetwork: string;
  receivedAmount?: string;
  receivedAsset?: string;
  receivedNetwork?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amount(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function convertPayload(
  order: QuickexOrderRow,
  eventKind: ConvertEventKind,
): ConvertNotificationPayload {
  const route = order.route as {
    fromAsset?: string; fromNetwork?: string; toAsset?: string; toNetwork?: string;
  };
  const amounts = order.amounts as {
    amount?: string; receiveAmount?: string; claimedDepositAmount?: string | null; paidAmount?: string | null;
  };
  const receivedAmount = amount(amounts.claimedDepositAmount ?? amounts.paidAmount ?? amounts.amount);
  return {
    eventKind,
    orderKind: "convert",
    orderId: order.legacyOrderId,
    status: order.status,
    sendAmount: amount(amounts.amount) ?? "0",
    sendAsset: text(route.fromAsset),
    sendNetwork: text(route.fromNetwork),
    receiveAmount: amount(amounts.receiveAmount) ?? "0",
    receiveAsset: text(route.toAsset),
    receiveNetwork: text(route.toNetwork),
    ...(eventKind === "payment_received" && receivedAmount
      ? {
          receivedAmount,
          receivedAsset: text(route.fromAsset),
          receivedNetwork: text(route.fromNetwork),
        }
      : {}),
  };
}

export function convertTelegramStatusLabel(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "awaiting funds": return "AWAITING FUNDS";
    case "processing": return "PROCESSING";
    case "completed": return "DONE ✅";
    case "failed": return "FAILED";
    case "cancelled": return "CANCELLED";
    case "refunded": return "REFUNDED";
    case "expired": return "EXPIRED";
    default: return status;
  }
}

export async function enqueueConvertTelegramMilestones(
  tx: DbTransaction,
  order: QuickexOrderRow,
): Promise<number> {
  // An Admin-only status edit is intentionally generic and must not be
  // mistaken for provider-confirmed payment or completion. Reconciliation
  // removes this marker when the provider reports a new state.
  if (order.providerState.startsWith("admin_status_override:")) return 0;
  if (!["processing", "completed"].includes(order.status.toLowerCase())) return 0;
  const links = await tx
    .select({
      chatId: telegramOrderLinksTable.chatId,
      clerkCustomerUserId: telegramChatsTable.clerkCustomerUserId,
    })
    .from(telegramOrderLinksTable)
    .innerJoin(telegramChatsTable, eq(telegramChatsTable.chatId, telegramOrderLinksTable.chatId))
    .where(and(
      eq(telegramOrderLinksTable.orderId, order.legacyOrderId),
      eq(telegramOrderLinksTable.orderKind, "convert"),
    ));
  let queued = 0;
  for (const link of links) {
    if (
      order.customerClerkUserId &&
      link.clerkCustomerUserId &&
      order.customerClerkUserId !== link.clerkCustomerUserId
    ) continue;
    for (const eventKind of (order.status === "completed"
      ? ["payment_received", "completed"] as const
      : ["payment_received"] as const)) {
      const [existing] = await tx.select({ id: telegramNotificationOutboxTable.id })
        .from(telegramNotificationOutboxTable)
        .where(and(
          eq(telegramNotificationOutboxTable.chatId, link.chatId),
          eq(telegramNotificationOutboxTable.orderId, order.legacyOrderId),
          eq(telegramNotificationOutboxTable.eventKind, eventKind),
        ))
        .limit(1);
      if (existing) continue;
      const [inserted] = await tx.insert(telegramNotificationOutboxTable).values({
        chatId: link.chatId,
        orderId: order.legacyOrderId,
        // Convert milestones are lifetime events. A stable version makes the
        // existing unique index enforce once-per-order delivery even if a
        // recovery scan races a later status transition.
        statusVersion: 0,
        eventKind,
        payload: convertPayload(order, eventKind),
      }).onConflictDoNothing().returning({ id: telegramNotificationOutboxTable.id });
      queued += inserted ? 1 : 0;
    }
  }
  return queued;
}

export async function convertTelegramRecipientIsCurrent(
  chatId: string,
  orderId: string,
  eventKind: ConvertEventKind,
): Promise<boolean> {
  const [linked] = await db
    .select({
      status: quickexOrdersTable.status,
      customerClerkUserId: quickexOrdersTable.customerClerkUserId,
      chatCustomerClerkUserId: telegramChatsTable.clerkCustomerUserId,
    })
    .from(telegramOrderLinksTable)
    .innerJoin(telegramChatsTable, eq(telegramChatsTable.chatId, telegramOrderLinksTable.chatId))
    .innerJoin(quickexOrdersTable, eq(quickexOrdersTable.legacyOrderId, telegramOrderLinksTable.orderId))
    .where(and(
      eq(telegramOrderLinksTable.chatId, chatId),
      eq(telegramOrderLinksTable.orderId, orderId),
      eq(telegramOrderLinksTable.orderKind, "convert"),
    ))
    .limit(1);
  if (!linked) return false;
  if (
    linked.customerClerkUserId &&
    linked.chatCustomerClerkUserId &&
    linked.customerClerkUserId !== linked.chatCustomerClerkUserId
  ) return false;
  return eventKind === "completed"
    ? linked.status === "completed"
    : ["processing", "completed"].includes(linked.status);
}

function routeLabel(asset: string, network: string): string {
  return network ? `${asset} (${network})` : asset;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function formatConvertTelegramNotification(payload: ConvertNotificationPayload): string {
  if (payload.eventKind === "payment_received") {
    return [
      "✅ <b>Payment Received</b>", "",
      formatTelegramOrderId(payload.orderId), "",
      `Received: <b>${escapeHtml(payload.receivedAmount)} ${escapeHtml(payload.receivedAsset)}</b>`,
      `Network: <b>${escapeHtml(payload.receivedNetwork)}</b>`, "",
      "Your payment has been received successfully.", "",
      "⏳ Your conversion is now being processed.",
    ].join("\n");
  }
  return [
    "<b>Done ✅</b>", "",
    formatTelegramOrderId(payload.orderId), "",
    `<b>${escapeHtml(payload.sendAmount)} ${escapeHtml(routeLabel(payload.sendAsset, payload.sendNetwork))}</b>`,
    "→",
    `<b>${escapeHtml(payload.receiveAmount)} ${escapeHtml(routeLabel(payload.receiveAsset, payload.receiveNetwork))}</b>`, "",
    "Status: <b>Done ✅</b>", "",
    "Your QuickXchange Convert order has been completed successfully.",
  ].join("\n");
}

export { convertPayload };