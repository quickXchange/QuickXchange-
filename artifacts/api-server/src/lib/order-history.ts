import { and, desc, eq } from "drizzle-orm";
import { db, quickexOrdersTable } from "@workspace/db";
import { signOrderTrackingToken } from "./order-access";

type Route = {
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  rateMode: "FLOATING" | "FIXED";
};
type Amounts = {
  amount: string | number;
  receiveAmount: string | number;
  claimedDepositAmount?: string | number | null;
  expectedReceiveAmount?: string | number | null;
  paidAmount?: string | number | null;
};
type Addresses = {
  destinationAddress: string;
  destinationMemo?: string;
  refundAddress: string;
  refundMemo?: string;
  depositAddress?: string;
  depositMemo?: string;
};

function exactDecimalString(value: string | number): string {
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (!match) return text;
  const [, sign, whole, fraction = "", exponentText] = match;
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + Number(exponentText);
  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function optionalExactDecimalString(value: string | number | null | undefined) {
  return value === null || value === undefined ? null : exactDecimalString(value);
}

function operatorRecord(row: typeof quickexOrdersTable.$inferSelect) {
  const route = row.route as Route;
  const amounts = row.amounts as Amounts;
  const addresses = row.addresses as Addresses;
  return {
    id: row.legacyOrderId,
    type: "instant",
    status: row.status,
    recordVersion: row.recordVersion,
    assignedOperatorId: null,
    supportStatus: "open",
    sendingStatus: "pending",
    receivingStatus: "pending",
    sentAmountOverride: null,
    receiveAmountOverride: null,
    exchangeRateOverride: null,
    networkFeeAmount: null,
    transactionHash: null,
    paymentReference: null,
    archivedAt: null,
    archivedBy: null,
    fromAsset: route.fromAsset,
    fromNetwork: route.fromNetwork,
    toAsset: route.toAsset,
    toNetwork: route.toNetwork,
    amount: exactDecimalString(amounts.amount),
    receiveAmount: exactDecimalString(amounts.receiveAmount),
    customerEmail: row.customerEmail,
    customerName: row.customerName ?? undefined,
    customerRegistered: Boolean(row.customerClerkUserId),
    destinationAddress: addresses.destinationAddress || undefined,
    destinationMemo: addresses.destinationMemo || undefined,
    refundAddress: addresses.refundAddress || undefined,
    refundMemo: addresses.refundMemo || undefined,
    depositAddress: addresses.depositAddress || undefined,
    depositMemo: addresses.depositMemo || undefined,
    provider: "Quickex",
    providerReference: row.providerReference ?? undefined,
    providerOrderId: row.providerOrderId ?? undefined,
    providerState: row.providerState || undefined,
    rateMode: route.rateMode || undefined,
    quoteId: row.quoteId,
    clientRequestId: row.clientRequestId ?? undefined,
    outcomeUnknown: row.outcomeUnknown,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    trackingToken: signOrderTrackingToken(row.legacyOrderId),
    providerClaimedDepositAmount: optionalExactDecimalString(amounts.claimedDepositAmount),
    providerExpectedReceiveAmount: optionalExactDecimalString(amounts.expectedReceiveAmount),
    providerPaidAmount: optionalExactDecimalString(amounts.paidAmount),
    providerCreatedAt: null,
    providerUpdatedAt: null,
    providerCompleted: null,
  };
}

function customerRecord(row: typeof quickexOrdersTable.$inferSelect) {
  const route = row.route as Route;
  const amounts = row.amounts as Amounts;
  const addresses = row.addresses as Addresses;
  return {
    id: row.legacyOrderId,
    type: "instant",
    status: row.status,
    fromAsset: route.fromAsset,
    fromNetwork: route.fromNetwork,
    toAsset: route.toAsset,
    toNetwork: route.toNetwork,
    amount: exactDecimalString(amounts.amount),
    receiveAmount: exactDecimalString(amounts.receiveAmount),
    rateMode: route.rateMode,
    outcomeUnknown: row.outcomeUnknown,
    refreshUnavailable: false,
    refundAddress: addresses.refundAddress || undefined,
    refundMemo: addresses.refundMemo || undefined,
    statusNotificationsEnabled: false,
    trackingToken: signOrderTrackingToken(row.legacyOrderId),
    createdAt: row.createdAt.toISOString(),
  };
}

type DirectoryQuery = {
  status?: string;
  archived: string;
  type?: string;
  providerState?: string;
  fromAsset?: string;
  fromNetwork?: string;
  toAsset?: string;
  toNetwork?: string;
  sourceSettlementOptionId?: string;
  targetSettlementOptionId?: string;
  customerEmail?: string;
  rateMode?: string;
  outcomeUnknown?: string;
  createdFrom?: string;
  createdTo?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  sortDirection: "asc" | "desc";
  page: number;
  pageSize: number;
};

function includes(value: unknown, search: string) {
  return String(value ?? "").toLowerCase().includes(search);
}

function matches(row: ReturnType<typeof operatorRecord>, query: DirectoryQuery) {
  const same = (value: unknown, expected?: string) =>
    !expected || String(value ?? "").toLowerCase() === expected.toLowerCase();
  if (query.archived === "archived" || query.sourceSettlementOptionId || query.targetSettlementOptionId) return false;
  if (query.status === "active") {
    if (["completed", "refunded", "expired", "failed", "cancelled"].includes(row.status.toLowerCase())) return false;
  } else if (!same(row.status, query.status)) return false;
  if (!same(row.type, query.type) || !same(row.providerState, query.providerState) ||
      !same(row.fromAsset, query.fromAsset) || !same(row.fromNetwork, query.fromNetwork) ||
      !same(row.toAsset, query.toAsset) || !same(row.toNetwork, query.toNetwork) ||
      !same(row.rateMode, query.rateMode)) return false;
  if (query.customerEmail && !includes(row.customerEmail, query.customerEmail.trim().toLowerCase())) return false;
  if (query.outcomeUnknown && row.outcomeUnknown !== (query.outcomeUnknown === "true")) return false;
  const created = Date.parse(row.createdAt);
  if (query.createdFrom && created < Date.parse(query.createdFrom)) return false;
  if (query.createdTo && created > Date.parse(query.createdTo)) return false;
  if (query.minAmount !== undefined && Number(row.amount) < query.minAmount) return false;
  if (query.maxAmount !== undefined && Number(row.amount) > query.maxAmount) return false;
  const search = query.search?.trim().toLowerCase();
  return !search || [
    row.id, row.customerEmail, row.customerName, row.providerReference, row.providerOrderId,
    row.clientRequestId, row.providerState, row.destinationAddress, row.destinationMemo,
    row.refundAddress, row.refundMemo, row.depositAddress, row.depositMemo,
  ].some(value => includes(value, search));
}

export async function mergeOperatorOrderDirectory(
  manualItems: Array<Record<string, any>>,
  query: DirectoryQuery,
) {
  const providerItems = (await db.select().from(quickexOrdersTable))
    .map(operatorRecord)
    .filter(row => matches(row, query));
  const direction = query.sortDirection === "asc" ? 1 : -1;
  const items = [...manualItems, ...providerItems].sort((a, b) =>
    direction * (String(a.createdAt).localeCompare(String(b.createdAt)) ||
      String(a.id).localeCompare(String(b.id))));
  const total = items.length;
  const offset = (query.page - 1) * query.pageSize;
  return { items: items.slice(offset, offset + query.pageSize), total };
}

export async function findProviderManagedOperatorOrder(id: string) {
  const [row] = await db.select().from(quickexOrdersTable)
    .where(eq(quickexOrdersTable.legacyOrderId, id)).limit(1);
  return row ? operatorRecord(row) : undefined;
}

export async function mergeCustomerOrderHistory(
  manualItems: Array<Record<string, any>>,
  customerClerkUserId: string,
  page: number,
  pageSize: number,
) {
  const rows = await db.select().from(quickexOrdersTable)
    .where(eq(quickexOrdersTable.customerClerkUserId, customerClerkUserId))
    .orderBy(desc(quickexOrdersTable.createdAt), desc(quickexOrdersTable.legacyOrderId));
  const items = [...manualItems, ...rows.map(customerRecord)].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)) ||
      String(b.id).localeCompare(String(a.id)));
  const offset = (page - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize), total: items.length };
}

export async function findProviderManagedCustomerOrder(id: string, customerClerkUserId: string) {
  const [row] = await db.select().from(quickexOrdersTable).where(and(
    eq(quickexOrdersTable.legacyOrderId, id),
    eq(quickexOrdersTable.customerClerkUserId, customerClerkUserId),
  )).limit(1);
  return row ? customerRecord(row) : undefined;
}

export async function isProviderManagedOrder(id: string) {
  const [row] = await db.select({ id: quickexOrdersTable.legacyOrderId })
    .from(quickexOrdersTable).where(eq(quickexOrdersTable.legacyOrderId, id)).limit(1);
  return Boolean(row);
}