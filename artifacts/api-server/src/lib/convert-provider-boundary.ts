import { and, eq } from "drizzle-orm";
import { db, quickexOrdersTable } from "@workspace/db";
import {
  buildProviderQuoteTicket,
  listPublicProviderSettlementOptions,
} from "./provider-capabilities";
import {
  createQuickexConvertOrder,
  getQuickexReconciliationHealth,
  outputQuickexOrder,
  reconcilePendingQuickexOrders,
} from "./quickex-order-service";
import { getQuickexInstrumentCacheHealth, getQuickexInstruments } from "./quickex";
import { logger } from "./logger";
import { processConvertNotificationOutbox } from "./customer-status-notifications";

/** The only route-layer boundary for the independent Convert provider. */
export const isConvertOrderType = (type: string): type is "instant" => type === "instant";
export const convertProviderLabel = () => "Quickex" as const;
export const convertSupportProviderKind = () => "quickex" as const;
export const listConvertSettlementOptions = listPublicProviderSettlementOptions;
export const buildConvertQuoteTicket = buildProviderQuoteTicket;
export const createConvertOrder = createQuickexConvertOrder;
export const outputConvertOrder = outputQuickexOrder;
export const reconcilePendingConvertOrders = reconcilePendingQuickexOrders;

let convertWorkerInterval: ReturnType<typeof setInterval> | undefined;
let convertWorkerInFlight: Promise<void> | undefined;

export function startConvertReconciliationWorker(): () => void {
  if (convertWorkerInterval) return () => {};
  const configured = Number(process.env.CUSTOMER_NOTIFICATION_POLL_INTERVAL_MS ?? 30_000);
  const intervalMs = Number.isFinite(configured) && configured >= 15_000 ? configured : 30_000;
  const run = () => {
    if (convertWorkerInFlight) return;
    convertWorkerInFlight = (async () => {
      await processConvertNotificationOutbox();
      await reconcilePendingConvertOrders();
    })().catch(error => {
      logger.warn({ err: error }, "Convert reconciliation cycle failed");
    }).finally(() => {
      convertWorkerInFlight = undefined;
    });
  };
  run();
  const interval = setInterval(run, intervalMs);
  convertWorkerInterval = interval;
  interval.unref();
  return () => {
    if (convertWorkerInterval !== interval) return;
    clearInterval(interval);
    convertWorkerInterval = undefined;
  };
}
export const getConvertReconciliationHealth = getQuickexReconciliationHealth;

export async function getConvertOperationalHealth(includeCatalog = true) {
  const [catalog, quickexReconciliation] = await Promise.all([
    includeCatalog
      ? getConvertCatalogHealth()
      : Promise.resolve({ ageMs: null, stale: true, lastFailureAt: null }),
    getConvertReconciliationHealth(),
  ]);
  return { catalog, quickexReconciliation };
}

export async function getConvertCatalogHealth() {
  try {
    await getQuickexInstruments();
  } catch {
    // The cache health retains the last failure and availability state.
  }
  return getQuickexInstrumentCacheHealth();
}

export async function getConvertOrderForSupport(id: string) {
  const [row] = await db.select({
    id: quickexOrdersTable.legacyOrderId,
    recordVersion: quickexOrdersTable.recordVersion,
  }).from(quickexOrdersTable)
    .where(eq(quickexOrdersTable.legacyOrderId, id))
    .limit(1);
  return row;
}

export async function getConvertOrderForStatus(id: string) {
  const [row] = await db.select().from(quickexOrdersTable)
    .where(eq(quickexOrdersTable.legacyOrderId, id))
    .limit(1);
  return row;
}

export async function updateConvertOrderStatus(
  id: string,
  recordVersion: number,
  status: string,
) {
  const [row] = await db.update(quickexOrdersTable).set({
    status,
    providerState: `admin_status_override:${status}`,
    outcomeUnknown: false,
    updatedAt: new Date(),
    recordVersion: recordVersion + 1,
  }).where(and(
    eq(quickexOrdersTable.legacyOrderId, id),
    eq(quickexOrdersTable.recordVersion, recordVersion),
  )).returning();
  return row;
}