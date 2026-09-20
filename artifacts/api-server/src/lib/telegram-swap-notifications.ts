import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  telegramChatsTable,
  telegramNotificationOutboxTable,
  telegramOrderLinksTable,
  whitebitDepositsTable,
} from "@workspace/db";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderRow = typeof ordersTable.$inferSelect;

export type SwapTelegramEventKind = "payment_received" | "completed";

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
  let queued = 0;
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
  return queued;
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
  const [deposit] = await db
    .select({ id: whitebitDepositsTable.id })
    .from(whitebitDepositsTable)
    .where(and(
      eq(whitebitDepositsTable.orderId, orderId),
      eq(whitebitDepositsTable.status, "processed"),
    ))
    .limit(1);
  return Boolean(deposit);
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
      `<b>Order #${escapeHtml(payload.orderId)}</b>`,
      "",
      `Received: <b>${escapeHtml(payload.receivedAmount)} ${escapeHtml(payload.receivedAsset)}</b>`,
      `Network: <b>${escapeHtml(payload.receivedNetwork)}</b>`,
      "",
      "Your payment has been received successfully.",
      "",
      "⏳ Your order is now being processed.",
    ].join("\n");
  }
  return [
    "<b>Done ✅</b>",
    "",
    `<b>Order #${escapeHtml(payload.orderId)}</b>`,
    "",
    `<b>${escapeHtml(payload.sendAmount)} ${escapeHtml(routeLabel(payload.sendMethod, payload.sendAsset, payload.sendNetwork))}</b>`,
    "→",
    `<b>${escapeHtml(payload.receiveAmount)} ${escapeHtml(routeLabel(payload.receiveMethod, payload.receiveAsset, payload.receiveNetwork))}</b>`,
    "",
    "Status: <b>Completed ✅</b>",
    "",
    "Your QuickXchange order has been completed successfully.",
  ].join("\n");
}