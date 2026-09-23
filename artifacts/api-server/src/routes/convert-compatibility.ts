import { Router, type IRouter, type Request } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  CreateExchangeOrderBody,
  CreateExchangeOrderResponse,
  CreateExchangeQuoteBody,
  CreateOrderBody,
  GetAdminSummaryQueryParams,
  GetAdminSummaryResponse,
  UpdateOrderBody,
  UpdateOrderParams,
  UpdateOrderSupportToolsBody,
  UpdateOrderSupportToolsParams,
  UpdateOrderSupportToolsResponse,
} from "@workspace/api-zod";
import {
  customerStatusNotificationEventsTable,
  db,
  operatorsTable,
  orderAuditLogsTable,
  orderSupportMetadataTable,
  ordersTable,
} from "@workspace/db";
import { ApiError } from "../lib/api-error";
import { getCustomerActorUserId, getCustomerVerifiedEmail, requireActiveCustomerIdentity } from "../lib/customer-auth";
import {
  buildConvertQuoteTicket,
  convertSupportProviderKind,
  createConvertOrder,
  getConvertCatalogHealth,
  getConvertOperationalHealth,
  getConvertOrderForStatus,
  getConvertOrderForSupport,
  outputConvertOrder,
  updateConvertOrderStatus,
} from "../lib/convert-provider-boundary";
import { normalizeRefundFields } from "../lib/wallet-fields";
import { initializeAffiliateForOrder } from "../lib/affiliate-accounting";
import { signQuoteTicket } from "../lib/quote-ticket";
import { buildAdminSummaryAnalytics } from "../lib/admin-summary";
import {
  requireOperator,
  requirePermission,
  type OperatorAuthorization,
} from "../lib/operator-auth";
import type { PermissionKey } from "../lib/permissions";
import { findProviderManagedOperatorOrder } from "../lib/order-history";

type CustomerEmailInput = { customerEmail?: string };

async function resolveIdentity<T extends CustomerEmailInput>(req: Request, input: T) {
  const customerClerkUserId = getCustomerActorUserId(req);
  if (customerClerkUserId) {
    const verifiedEmail = await getCustomerVerifiedEmail(customerClerkUserId);
    if (!verifiedEmail) {
      throw new ApiError("CUSTOMER_VERIFIED_EMAIL_REQUIRED", "Verify an email address on your account before creating an order.", 422);
    }
    await requireActiveCustomerIdentity(customerClerkUserId, verifiedEmail);
    return { input: { ...input, customerEmail: verifiedEmail }, customerClerkUserId };
  }
  const customerEmail = input.customerEmail?.trim();
  if (!customerEmail) throw new ApiError("CUSTOMER_EMAIL_REQUIRED", "A contact email is required for anonymous orders.", 400);
  return { input: { ...input, customerEmail }, customerClerkUserId: null };
}

const router: IRouter = Router();

function outputSupportMetadata(row: typeof orderSupportMetadataTable.$inferSelect) {
  return {
    recordVersion: row.recordVersion,
    supportStatus: row.supportStatus,
    sendingStatus: row.sendingStatus,
    receivingStatus: row.receivingStatus,
    sentAmountOverride: row.sentAmountOverride,
    receiveAmountOverride: row.receiveAmountOverride,
    exchangeRateOverride: row.exchangeRateOverride,
    networkFeeAmount: row.networkFeeAmount,
    transactionHash: row.transactionHash,
    paymentReference: row.paymentReference,
    assignedOperatorId: row.assignedOperatorId,
    note: row.note,
  };
}

const DEFAULT_SUPPORT = {
  supportStatus: "open",
  sendingStatus: "pending",
  receivingStatus: "pending",
  sentAmountOverride: null,
  receiveAmountOverride: null,
  exchangeRateOverride: null,
  networkFeeAmount: null,
  transactionHash: null,
  paymentReference: null,
  assignedOperatorId: null,
  note: "",
} as const;

function statusPermission(status: string): PermissionKey {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "funds_confirmed" || normalized === "payment_confirmed") {
    return "orders.confirm_payment";
  }
  if (normalized === "completed" || normalized === "complete") return "orders.complete";
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "cancel") {
    return "orders.cancel";
  }
  return "orders.status";
}

function requireConvertStatusPermission(
  operator: OperatorAuthorization,
  currentStatus: string,
  nextStatus: string,
) {
  if (operator.role === "owner") return;
  if (currentStatus === nextStatus) {
    throw new ApiError(
      "PERMISSION_ACCESS_DENIED",
      "The signed-in operator lacks a permission for this order update.",
      403,
    );
  }
  const permission = statusPermission(nextStatus);
  if (!operator.effectivePermissions.includes(permission)) {
    throw new ApiError(
      "PERMISSION_ACCESS_DENIED",
      `The signed-in operator lacks the required order permission: ${permission}.`,
      403,
    );
  }
}

router.post("/exchange/quote", async (req, res, next) => {
  try {
    const input = CreateExchangeQuoteBody.parse(req.body);
    if (input.type !== "instant") return next();
    const ticket = await buildConvertQuoteTicket(input);
    res.json({
      ...ticket,
      quoteId: signQuoteTicket(ticket),
      expiresAt: new Date(ticket.expiresAt).toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

async function create(req: Request, res: any, next: any) {
  try {
    const parsed = req.path === "/exchange/orders"
      ? { ...CreateExchangeOrderBody.parse(req.body), ...normalizeRefundFields(req.body) }
      : { ...CreateOrderBody.parse(req.body), ...normalizeRefundFields(req.body) };
    if (parsed.type !== "instant") return next();
    const resolved = await resolveIdentity(req, parsed);
    if (resolved.customerClerkUserId) {
      const referral = typeof req.cookies?.affiliate_referral === "string" ? req.cookies.affiliate_referral : undefined;
      const affiliate = await initializeAffiliateForOrder(resolved.customerClerkUserId, referral);
      if (referral && affiliate.referralStatus !== "unavailable") res.clearCookie("affiliate_referral");
    }
    const result = await createConvertOrder({
      ...resolved.input,
      customerClerkUserId: resolved.customerClerkUserId ?? undefined,
      quoteId: resolved.input.quoteId ?? "",
    });
    const body = outputConvertOrder(result.row);
    res.status(result.created ? (result.uncertain ? 202 : 201) : 200)
      .json(req.path === "/exchange/orders" ? CreateExchangeOrderResponse.parse(body) : body);
  } catch (error) {
    next(error);
  }
}
router.post("/exchange/orders", create);
router.post("/orders", create);

router.patch(
  "/orders/:id/support-tools",
  requirePermission("orders.details"),
  requirePermission("orders.support_tools"),
  async (req, res, next) => {
    try {
      const { id } = UpdateOrderSupportToolsParams.parse(req.params);
      const providerOrder = await getConvertOrderForSupport(id);
      if (!providerOrder) return next();
      const input = UpdateOrderSupportToolsBody.parse(req.body);
      const actor = res.locals.operator as OperatorAuthorization;
      const metadata = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(orderSupportMetadataTable)
          .where(eq(orderSupportMetadataTable.orderId, id)).limit(1);
        const version = existing?.recordVersion ?? 0;
        if (version !== input.recordVersion) {
          throw new ApiError(
            "ORDER_UPDATE_CONFLICT",
            "The order changed concurrently. Reload it before saving.",
            409,
          );
        }
        const old = existing ? outputSupportMetadata(existing) : DEFAULT_SUPPORT;
        const fields = {
          supportStatus: input.supportStatus,
          sendingStatus: input.sendingStatus,
          receivingStatus: input.receivingStatus,
          sentAmountOverride: input.sentAmountOverride,
          receiveAmountOverride: input.receiveAmountOverride,
          exchangeRateOverride: input.exchangeRateOverride,
          networkFeeAmount: input.networkFeeAmount,
          transactionHash: input.transactionHash,
          paymentReference: input.paymentReference,
          assignedOperatorId: input.assignedOperatorId,
          note: input.note,
        };
        const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
        for (const [key, newValue] of Object.entries(fields)) {
          const oldValue = old[key as keyof typeof old];
          if ((oldValue ?? null) !== (newValue ?? null)) {
            changes[key] = { oldValue: oldValue ?? null, newValue: newValue ?? null };
          }
        }
        const can = (permission: PermissionKey) =>
          actor.role === "owner" || actor.effectivePermissions.includes(permission);
        if (changes.assignedOperatorId && !can("orders.assign")) {
          throw new ApiError(
            "PERMISSION_ACCESS_DENIED",
            "The signed-in operator does not have permission for this action.",
            403,
          );
        }
        if (changes.note && !can("orders.notes")) {
          throw new ApiError(
            "PERMISSION_ACCESS_DENIED",
            "The signed-in operator does not have permission for this action.",
            403,
          );
        }
        if (Object.keys(changes).length === 0) return existing;
        let assignee: { id: string } | undefined;
        if (changes.assignedOperatorId && input.assignedOperatorId) {
          [assignee] = await tx.select({ id: operatorsTable.id }).from(operatorsTable)
            .where(and(
              eq(operatorsTable.id, input.assignedOperatorId),
              eq(operatorsTable.status, "active"),
            )).limit(1);
          if (!assignee) {
            throw new ApiError(
              "ASSIGNEE_NOT_ELIGIBLE",
              "The assignee must be an active operator.",
              422,
            );
          }
        }
        const values = {
          orderId: id,
          providerKind: convertSupportProviderKind(),
          ...fields,
          assignedOperatorId: assignee?.id ?? input.assignedOperatorId,
          recordVersion: version + 1,
        };
        const [updated] = await tx.insert(orderSupportMetadataTable).values(values)
          .onConflictDoUpdate({
            target: orderSupportMetadataTable.orderId,
            set: {
              ...fields,
              assignedOperatorId: assignee?.id ?? input.assignedOperatorId,
              recordVersion: version + 1,
              updatedAt: new Date(),
            },
            where: eq(orderSupportMetadataTable.recordVersion, version),
          }).returning();
        if (!updated) {
          throw new ApiError(
            "ORDER_UPDATE_CONFLICT",
            "The order changed concurrently. Reload it before saving.",
            409,
          );
        }
        await tx.insert(orderAuditLogsTable).values({
          orderId: id,
          action: "order.support_tools_updated",
          actorType: "operator",
          actorId: actor.id,
          requestId: String(req.id ?? ""),
          previousVersion: version,
          nextVersion: updated.recordVersion,
          details: { changes },
        });
        return updated;
      });
      const provider = await findProviderManagedOperatorOrder(id);
      return res.json(UpdateOrderSupportToolsResponse.parse({
        ...provider,
        ...(metadata
          ? outputSupportMetadata(metadata)
          : { ...DEFAULT_SUPPORT, recordVersion: input.recordVersion }),
      }));
    } catch (error) {
      return next(error);
    }
  },
);

router.patch("/orders/:id", requireOperator, async (req, res, next) => {
  try {
    const params = UpdateOrderParams.parse(req.params);
    const providerOrder = await getConvertOrderForStatus(params.id);
    if (!providerOrder) return next();
    const input = UpdateOrderBody.parse(req.body);
    const rawKeys = Object.keys(req.body ?? {});
    if (
      input.status === undefined ||
      rawKeys.some((key) => !["recordVersion", "status"].includes(key))
    ) {
      throw new ApiError(
        "PROVIDER_STATUS_UPDATE_INVALID",
        "Provider-managed Convert orders accept only a canonical status and recordVersion.",
        400,
      );
    }
    const canonicalStatuses = new Set([
      "awaiting funds",
      "processing",
      "completed",
      "failed",
      "cancelled",
      "refunded",
      "expired",
    ]);
    const nextStatus = input.status.trim().toLowerCase();
    if (!canonicalStatuses.has(nextStatus)) {
      throw new ApiError(
        "PROVIDER_STATUS_UPDATE_INVALID",
        "Invalid Convert order status.",
        400,
      );
    }
    if (
      input.recordVersion === undefined ||
      input.recordVersion !== providerOrder.recordVersion
    ) {
      throw new ApiError(
        "ORDER_STATUS_CONFLICT",
        "The order changed concurrently. Reload it before saving.",
        409,
      );
    }
    requireConvertStatusPermission(
      res.locals.operator as OperatorAuthorization,
      providerOrder.status,
      nextStatus,
    );
    if (nextStatus === providerOrder.status) {
      return res.json(outputConvertOrder(providerOrder));
    }
    const updated = await updateConvertOrderStatus(
      params.id,
      providerOrder.recordVersion,
      nextStatus,
    );
    if (!updated) {
      throw new ApiError(
        "ORDER_STATUS_CONFLICT",
        "The order changed concurrently. Reload it before saving.",
        409,
      );
    }
    return res.json(outputConvertOrder(updated));
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/summary", async (req, res, next) => {
  try {
    if (req.query.product !== "convert") return next();
    const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
    const rawTo = typeof req.query.to === "string" ? req.query.to : "";
    const from = new Date(rawFrom);
    const to = new Date(rawTo);
    const query = GetAdminSummaryQueryParams.parse({
      product: req.query.product,
      from: rawFrom,
      to: rawTo,
    });
    if (
      !rawFrom.endsWith("Z") ||
      !rawTo.endsWith("Z") ||
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from.toISOString() !== (rawFrom.includes(".") ? rawFrom : rawFrom.replace("Z", ".000Z")) ||
      to.toISOString() !== (rawTo.includes(".") ? rawTo : rawTo.replace("Z", ".000Z")) ||
      from > to ||
      to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000
    ) {
      throw new ApiError(
        "INVALID_SUMMARY_PERIOD",
        "The summary period must use valid inclusive UTC ISO date-times and span no more than 366 days.",
        400,
      );
    }
    const catalog = await getConvertCatalogHealth();
    const providerFreshness = {
      state: catalog.ageMs === null
        ? "unavailable" as const
        : catalog.stale
          ? "stale" as const
          : "healthy" as const,
      syncing: false,
      ...(catalog.ageMs === null
        ? {}
        : { lastSucceededAt: new Date(Date.now() - catalog.ageMs).toISOString() }),
      ...(catalog.lastFailureAt ? { lastFailedAt: catalog.lastFailureAt } : {}),
    };
    const [
      analytics,
      [notificationHealth],
      [unresolvedHealth],
      convertHealth,
    ] = await Promise.all([
      buildAdminSummaryAnalytics({ product: query.product, from, to }),
      db.select({
        pending: sql<number>`count(*) filter (
          where ${customerStatusNotificationEventsTable.deliveryStatus}
            in ('pending', 'sending')
        )`,
        failed: sql<number>`count(*) filter (
          where ${customerStatusNotificationEventsTable.deliveryStatus} = 'failed'
        )`,
        oldestPendingAt: sql<Date | null>`min(
          ${customerStatusNotificationEventsTable.createdAt}
        ) filter (
          where ${customerStatusNotificationEventsTable.deliveryStatus}
            in ('pending', 'sending')
        )`,
      }).from(customerStatusNotificationEventsTable),
      db.select({
        count: sql<number>`count(*) filter (
          where ${ordersTable.outcomeUnknown} = true
             or ${ordersTable.status} = 'verification required'
        )`,
      }).from(ordersTable),
      getConvertOperationalHealth(false),
    ]);
    const oldestPendingAt = notificationHealth?.oldestPendingAt;
    res.json(GetAdminSummaryResponse.parse({
      ...analytics,
      operationalHealth: {
        providerFreshness,
        ...convertHealth,
        catalog,
        unresolvedOrders: Number(unresolvedHealth?.count ?? 0),
        notificationsPending: Number(notificationHealth?.pending ?? 0),
        notificationsFailed: Number(notificationHealth?.failed ?? 0),
        oldestPendingNotificationAt:
          oldestPendingAt == null
            ? null
            : new Date(
                oldestPendingAt instanceof Date
                  ? oldestPendingAt.getTime()
                  : String(oldestPendingAt),
              ).toISOString(),
      },
    }));
  } catch (error) {
    next(error);
  }
});

export default router;