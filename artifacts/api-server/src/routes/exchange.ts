import { createHash, randomInt, randomUUID } from "node:crypto";
import { registerManualBlockchainWatch } from "../lib/blockchain-monitoring/service";
import { Router, type IRouter, type Request } from "express";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import {
  CreateExchangeOrderBody,
  CreateExchangeOrderResponse,
  CreateExchangeQuoteBody,
  CreateFiatCurrencyBody,
  CreateFiatCurrencyResponse,
  CreateManualDeskPricingRuleBody,
  CreateManualDeskPricingRuleResponse,
  DeleteManualDeskPricingRuleParams,
  CreateOrderBody,
  ClaimCustomerOrderBody,
  GetCustomerOrderParams,
  GetCustomerOrderResponse,
  GetCustomerOrdersQueryParams,
  GetCustomerOrdersResponse,
  UpdateCustomerOrderNotificationsBody,
  UpdateCustomerOrderNotificationsParams,
  UpdateCustomerOrderNotificationsResponse,
  GetAdminSummaryResponse,
  GetAdminSummaryQueryParams,
  GetManualDeskRevenueQueryParams,
  GetManualDeskRevenueResponse,
  ExportManualDeskRevenueCsvQueryParams,
  GetCustomersQueryParams,
  GetCustomersResponse,
  GetPopularExchangePairsResponse,
  GetExchangeRoutePricingQueryParams,
  GetExchangeRoutePricingResponse,
  GetFiatCurrenciesResponse,
  GetOneForgeProviderStatusResponse,
  GetWhitebitCredentialsResponse,
  UpdateWhitebitCredentialsBody,
  UpdateWhitebitCredentialsResponse,
  TestWhitebitCredentialsResponse,
  GetOrdersQueryParams,
  GetOrdersResponse,
  GetOrderParams,
  GetOrderResponse,
  AssignOrderParams,
  AssignOrderBody,
  AssignOrderResponse,
  ArchiveOrderParams,
  ArchiveOrderBody,
  ArchiveOrderResponse,
  BulkUpdateOrderStatusBody,
  BulkUpdateOrderStatusResponse,
  BulkArchiveOrdersBody,
  BulkArchiveOrdersResponse,
  RestoreOrderParams,
  RestoreOrderBody,
  RestoreOrderResponse,
  GetOrderAuditLogParams,
  GetOrderAuditLogResponse,
  ListManualDeskPricingRulesResponse,
  GetOrderReconciliationAttemptsParams,
  GetOrderReconciliationAttemptsResponse,
  GetPublicOrderStatusParams,
  GetPublicOrderStatusQueryParams,
  GetPublicOrderStatusResponse,
  PreviewManualDeskPricingRuleBody,
  PreviewManualDeskPricingRuleResponse,
  PreviewManualDeskQuoteBody,
  PreviewManualDeskQuoteResponse,
  UpdateOrderBody,
  UpdateOrderParams,
  UpdateFiatCurrencyBody,
  UpdateFiatCurrencyParams,
  UpdateFiatCurrencyResponse,
  DeleteFiatCurrencyParams,
  UpdateManualDeskPricingRuleBody,
  UpdateManualDeskPricingRuleParams,
  UpdateManualDeskPricingRuleResponse,
  BulkManualDeskPricingRulesBody,
  BulkManualDeskPricingRulesResponse,
  BulkCreateManualDeskPricingRulesBody,
  BulkCreateManualDeskPricingRulesResponse,
  GetPaymentMethodsResponse,
  CreatePaymentMethodBody,
  CreatePaymentMethodResponse,
  UpdatePaymentMethodParams,
  UpdatePaymentMethodBody,
  UpdatePaymentMethodResponse,
  DeletePaymentMethodParams,
  RequestPaymentMethodLogoUploadBody,
  RequestPaymentMethodLogoUploadResponse,
  DeletePaymentMethodLogoUploadParams,
  GetFiatCurrencyPaymentMethodsResponse,
  CreateFiatCurrencyPaymentMethodBody,
  CreateFiatCurrencyPaymentMethodResponse,
  UpdateFiatCurrencyPaymentMethodParams,
  UpdateFiatCurrencyPaymentMethodBody,
  UpdateFiatCurrencyPaymentMethodResponse,
  DeleteFiatCurrencyPaymentMethodParams,
  PreviewBulkFiatCurrencyPaymentMethodsBody,
  PreviewBulkFiatCurrencyPaymentMethodsResponse,
  ApplyBulkFiatCurrencyPaymentMethodsBody,
  ApplyBulkFiatCurrencyPaymentMethodsResponse,
  ApplyCryptoAssetsBulkEditBody,
  ApplyCryptoAssetsBulkEditResponse,
  SaveCryptoAssetReceivingWalletBody,
  SaveCryptoAssetReceivingWalletParams,
  SaveCryptoNetworkReceivingWalletBody,
  PreviewCryptoNetworkReceivingWalletBody,
  UpdateCryptoNetworkCustomerDepositsBody,
  UpdateCryptoNetworkCustomerDepositsParams,
  UpdateCryptoNetworkCustomerDepositsResponse,
  ReconcileCryptoCustomerDepositsResponse,
  UpdateOrderSupportToolsParams,
  UpdateOrderSupportToolsBody,
  UpdateOrderSupportToolsResponse,
  PermanentlyDeleteOrdersBody,
  PermanentlyDeleteOrdersResponse,
  MarkOrderPaidBody,
  MarkOrderPaidResponse,
  CancelCustomerOrderBody,
  CancelCustomerOrderResponse,
} from "@workspace/api-zod";
import { databasePoolTelemetry } from "@workspace/db";
import {
  customerStatusNotificationEventsTable,
  notificationSettingsTable,
  customersTable,
  db,
  fiatCurrenciesTable,
  manualDeskPricingRulesTable,
  orderAuditLogsTable,
  ordersTable,
  operatorsTable,
  operatorAuditLogsTable,
  paymentMethodsTable,
  fiatCurrencyPaymentMethodsTable,
  cryptoAssetsTable,
  cryptoAssetNetworksTable,
  whitebitAssetMappingsTable,
  whitebitNetworkMappingsTable,
  orderSupportMetadataTable,
  whitebitOrderAddressesTable,
  providerIntegrationsTable,
  blockchainMonitorMatchesTable,
  blockchainMonitorObservationsTable,
  blockchainMonitorNetworksTable,
  blockchainMonitorAssetsTable,
  blockchainMonitorRegistrationGapsTable,
} from "@workspace/db";
import { ApiError } from "../lib/api-error";
import {
  assertCustomerDepositEligibilityContextCurrent,
  createCustomerDepositEligibilityContext,
  customerDepositRouteConfigurationDigest,
  hasUsableSavedReceivingWallet,
  invalidateWhitebitDepositRouteProofs,
  isCustomerDepositEligible,
  reconcileCryptoCustomerDepositEligibility,
  reconcileCryptoCustomerDepositEligibilityWithExecutor,
} from "../lib/customer-deposit-eligibility";
import { createCryptoAssetLogoUpload, createCryptoNetworkLogoUpload, createFiatCurrencyFlagUpload, deleteStoredCatalogImage } from "../lib/object-storage";
import { logger } from "../lib/logger";
import {
  getOperatorActorUserId,
  requireOperator,
  requireOwner,
  requirePermission,
  type OperatorAuthorization,
} from "../lib/operator-auth";
import type { PermissionKey } from "../lib/permissions";
import { recordAdminMutationActivity } from "../lib/admin-policy";
import { listConnectedDepositProviderOptions } from "../lib/deposit-provider-registry";
import { TERMINAL_ORDER_STATUSES } from "../lib/order-status";
import {
  getCustomerActorUserId,
  getCustomerVerifiedEmail,
  requireActiveCustomerIdentity,
  requireCustomer,
} from "../lib/customer-auth";
import {
  processCustomerStatusNotificationOutbox,
  updateOrderAndQueueStatusNotification,
} from "../lib/customer-status-notifications";
import { enqueueAdminSwapTelegramOrderCreatedNotification } from "../lib/telegram-swap-notifications";
import { adminEmailEventEnabled, customerEmailEventEnabled } from "../lib/notification-policy";
import {
  signQuoteTicket,
  verifyQuoteTicket,
  type QuoteTicket,
} from "../lib/quote-ticket";
import {
  getPopularExchangePairs,
  invalidatePopularExchangePairsCache,
} from "../lib/popular-exchange-pairs";
import {
  signOrderTrackingToken,
  verifyOrderTrackingToken,
} from "../lib/order-access";
import {
  getManualDeskEstimate,
  getManualDeskReferenceRate,
  invalidateManualDeskFiatRateCache,
  MAX_MANUAL_DESK_TARGET_PRECISION,
  refreshManualDeskRateProviderStatus,
} from "../lib/manual-desk-rates";
import { buildAdminSummaryAnalytics } from "../lib/admin-summary";
import { manualExternalProviderHealthPlaceholders } from "../lib/manual-operational-health";
import { normalizeRefundFields } from "../lib/wallet-fields";
import { buildVerifiedExplorerUrl, exposeLegacyTransactionHash } from "../lib/verified-funding";
import {
  findProviderManagedCustomerOrder,
  findProviderManagedOperatorOrder,
  isProviderManagedOrder,
  mergeCustomerOrderHistory,
  mergeOperatorOrderDirectory,
} from "../lib/order-history";
import {
  createManualPricingRule,
  upsertManualPricingRules,
  evaluateManualPricingCoverage,
  matchManualDeskPricingRule,
  normalizeManualPricingSelectors,
  outputManualPricingRule,
  updateManualPricingRule,
  bulkUpdateManualPricingRules,
} from "../lib/manual-desk-pricing";
import {
  listEnabledFiatCurrencies,
  listFiatCurrencies,
} from "../lib/fiat-currencies";
import {
  aggregateManualDeskRevenue,
  manualDeskRevenueCsv,
  type RevenueOrder,
} from "../lib/manual-desk-revenue";
import {
  assignAutomaticPaymentMethodFieldKeys,
  listPublicFiatSettlementOptions,
  validateSafeFieldDefinitions,
  validateSettlementDetails,
} from "../lib/payment-methods";
import { paymentMethodBrandfetchLogoUrl } from "../lib/payment-method-brandfetch";
import {
  canAcceptReadyManualCryptoDeposit,
  findManualCryptoNetwork,
  findManualCryptoNetworkByIdForAsset,
  isManualMonitoringRuntimeReady,
  listPublicManualCryptoSettlementOptions,
  manualCryptoRouteNetwork,
  signedCryptoRouteId,
} from "../lib/manual-crypto";
import {
  isSyntacticallyValidManualWalletAddress,
  isSyntacticallyValidManualWalletMemo,
} from "../lib/manual-wallet-validation";
import {
  prepareManualMonitoringReadiness,
  manualMonitoringProofFingerprint,
  manualMonitoringNetworkConfigDigest,
  isValidManualMonitoringTokenIdentity,
  type ManualMonitoringReadiness,
} from "../lib/manual-monitoring-readiness";
import { adapterConfig } from "../lib/blockchain-monitoring/service";
import { initializeAffiliateForOrder, processPendingAffiliateCompletions } from "../lib/affiliate-accounting";
import { finalizeSwapFundingFromClaim, provisionSwapFundingAddress } from "./whitebit";
import {
  testWhitebitSignedConnection,
  verifyWhitebitDepositAddressPermission,
} from "./whitebit";
import {
  getWhitebitCapabilities,
  matchWhitebitCapability,
  whitebitSwapStatus,
} from "../lib/whitebit-capabilities";
import {
  activateWhitebitCredentials,
  getWhitebitCredentialStorageState,
  whitebitCredentialFingerprint,
} from "../lib/provider-credentials";

import { whitebitProviderSettingsTable } from "@workspace/db";
import { ALLOWED_LOGO_CONTENT_TYPES, createLogoUpload, deleteStoredLogo, getVerifiedStoredLogo, StoredImageInvalidError, StoredObjectNotFoundError, verifyStoredCatalogImage, verifyStoredLogo } from "../lib/object-storage";

const router: IRouter = Router();
let seeded = false;

async function ensureSeed() {
  if (seeded) return;
  const existing = await db.select({ id: ordersTable.id }).from(ordersTable).limit(1);
  if (existing.length === 0) {
    const now = new Date();
    await db.insert(ordersTable).values([
      {
        id: "QX-10482", type: "crypto", status: "processing", fromAsset: "BTC",
        toAsset: "USDT", amount: "0.18", receiveAmount: "11942.10",
        customerEmail: "sarah.chen@example.com", customerName: "Sarah Chen",
        destinationAddress: "TX9f...82kL", provider: "ChangeNOW",
        note: "Network confirmation pending", createdAt: new Date(now.getTime() - 12 * 60 * 1000),
      },
      {
        id: "QX-10481", type: "manual", status: "pending", fromAsset: "EUR",
        toAsset: "USDT", amount: "2500", receiveAmount: "2678.44",
        customerEmail: "marco.rossi@example.com", customerName: "Marco Rossi",
        paymentMethod: "SEPA transfer", payoutMethod: "TRC-20",
        provider: "Manual desk", note: "Awaiting payment proof", createdAt: new Date(now.getTime() - 48 * 60 * 1000),
      },
      {
        id: "QX-10480", type: "onramp", status: "completed", fromAsset: "USD",
        toAsset: "BTC", amount: "800", receiveAmount: "0.0121",
        customerEmail: "alex.johnson@example.com", customerName: "Alex Johnson",
        paymentMethod: "Card", provider: "Transak", providerReference: "TR-88219",
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
    ]);
    await db.insert(customersTable).values([
      { id: "cus-sarah", name: "Sarah Chen", email: "sarah.chen@example.com", ordersCount: 8, volume: "24800", lastActivity: new Date(now.getTime() - 12 * 60 * 1000) },
      { id: "cus-marco", name: "Marco Rossi", email: "marco.rossi@example.com", ordersCount: 3, volume: "7100", lastActivity: new Date(now.getTime() - 48 * 60 * 1000) },
      { id: "cus-alex", name: "Alex Johnson", email: "alex.johnson@example.com", ordersCount: 14, volume: "42300", lastActivity: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
    ]);
  }
  seeded = true;
}

let customerNotificationCycleInFlight: Promise<void> | undefined;
let customerNotificationInterval: ReturnType<typeof setInterval> | undefined;

export function startExchangeStatusNotificationWorker(): () => void {
  if (customerNotificationInterval) {
    return () => {};
  }

  const configuredInterval = Number(
    process.env.CUSTOMER_NOTIFICATION_POLL_INTERVAL_MS ?? 30_000,
  );
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 15_000
    ? configuredInterval
    : 30_000;
  const run = () => {
    if (customerNotificationCycleInFlight) return;
    customerNotificationCycleInFlight = (async () => {
      await processCustomerStatusNotificationOutbox();
      await processPendingAffiliateCompletions();
    })()
      .catch((error) => {
        logger.warn({
          err: error,
          dbPool: databasePoolTelemetry("customer-notification-worker", error),
        }, "Customer notification cycle failed");
      })
      .finally(() => {
        customerNotificationCycleInFlight = undefined;
      });
  };
  run();
  const interval = setInterval(run, intervalMs);
  customerNotificationInterval = interval;
  interval.unref();
  return () => {
    if (customerNotificationInterval !== interval) return;
    clearInterval(interval);
    customerNotificationInterval = undefined;
  };
}

function orderRateMode(_row: typeof ordersTable.$inferSelect): undefined {
  return undefined;
}

function outputSourcePaymentMethod(row: typeof ordersTable.$inferSelect) {
  if (!isApplicablePaymentDetailsOrder(row)) return undefined;
  const source = (row.settlementSnapshot as {
    source?: {
      id?: unknown;
      kind?: unknown;
      title?: unknown;
      paymentMethodId?: unknown;
      logoUrl?: unknown;
    };
  } | null)?.source;
  if (!source || source.kind !== "fiat-payment-method") return undefined;
  const id = typeof source.id === "string" && source.id
    ? source.id
    : row.sourceSettlementOptionId;
  const name = typeof source.title === "string" && source.title
    ? source.title
    : row.fromNetwork;
  if (!id || !name) return undefined;
  return {
    id,
    name,
    paymentMethodId: typeof source.paymentMethodId === "string" && source.paymentMethodId
      ? source.paymentMethodId
      : undefined,
    logoUrl: typeof source.logoUrl === "string" && source.logoUrl
      ? source.logoUrl
      : undefined,
  };
}

function outputOrder(row: typeof ordersTable.$inferSelect) {
  const {
    customerClerkUserId: _customerClerkUserId,
    customerOwnershipSource: _customerOwnershipSource,
    customerClaimedAt: _customerClaimedAt,
    statusNotificationsEnabled: _statusNotificationsEnabled,
    statusVersion: _statusVersion,
    pricingSnapshot: _pricingSnapshot,
    ...operatorVisibleRow
  } = row;
  const result = {
     ...operatorVisibleRow,
     transactionHash: row.type === "manual" ? null : row.transactionHash,
    customerRegistered: Boolean(row.customerClerkUserId),
    clientRequestId: row.clientRequestId ?? undefined,
    rateMode: orderRateMode(row),
    amount: row.amount,
    receiveAmount: row.receiveAmount,
    providerClaimedDepositAmount: row.providerClaimedDepositAmount,
    providerExpectedReceiveAmount: row.providerExpectedReceiveAmount,
    providerPaidAmount: row.providerPaidAmount,
    providerCreatedAt: row.providerCreatedAt?.toISOString() ?? null,
    providerUpdatedAt: row.providerUpdatedAt?.toISOString() ?? null,
    assignedOperatorId: row.assignedOperatorId ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archivedBy: row.archivedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    trackingToken: signOrderTrackingToken(row.id),
    fundingAddressSource: row.fundingStatus === "ready_whitebit"
      ? "live_api"
      : row.fundingStatus === "ready_manual"
        ? (row.providerState === "whitebit_fallback" ? "manual_fallback" : "manual_only")
        : "unavailable",
    paymentDetails: isApplicablePaymentDetailsOrder(row)
      ? row.paymentDetails ?? undefined
      : undefined,
    paymentDetailsApplicable: isApplicablePaymentDetailsOrder(row),
    sourcePaymentMethod: outputSourcePaymentMethod(row),
    customerMarkedPaidAt: row.customerMarkedPaidAt?.toISOString() ?? null,
  };
  // JSONB is untrusted persisted data: validate it before exposing it on the
  // operator order representation rather than treating a historical blob as
  // an authoritative snapshot.
  if (row.pricingSnapshot) {
    return {
      ...result,
      pricingSnapshot: CreateExchangeOrderResponse.parse({
        ...result,
        pricingSnapshot: row.pricingSnapshot,
      }).pricingSnapshot,
    };
  }
  return result;
}

function isApplicablePaymentDetailsOrder(row: typeof ordersTable.$inferSelect): boolean {
  const snapshot = row.settlementSnapshot as {
    source?: { kind?: string };
    target?: { kind?: string };
  } | null;
  return row.type === "manual" &&
    snapshot?.source?.kind === "fiat-payment-method" &&
    snapshot?.target?.kind === "crypto-network";
}

function hasCustomerPaymentDetails(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const value = details as Record<string, unknown>;
  return [
    "name",
    "iban",
    "bankName",
    "bicSwift",
    "paymentReference",
    "amount",
    "customInstructions",
  ].some((key) => typeof value[key] === "string" && value[key].trim().length > 0);
}

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
  supportStatus: "open", sendingStatus: "pending", receivingStatus: "pending",
  sentAmountOverride: null, receiveAmountOverride: null, exchangeRateOverride: null,
  networkFeeAmount: null, transactionHash: null, paymentReference: null,
  assignedOperatorId: null, note: "",
} as const;

function outputCustomerOrder(
  row: typeof ordersTable.$inferSelect,
  refreshUnavailable: boolean,
  verifiedFunding?: Awaited<ReturnType<typeof getVerifiedFundingTransaction>>,
) {
  const completed = /^(?:completed|complete|done|finished)$/i.test(row.status.trim());
  const exchangeRate = row.finalRate ?? row.exchangeRateOverride ?? undefined;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    fromAsset: row.fromAsset,
    fromNetwork: row.fromNetwork || undefined,
    sourceSettlementOptionId: row.sourceSettlementOptionId || undefined,
    toAsset: row.toAsset,
    toNetwork: row.toNetwork || undefined,
    targetSettlementOptionId: row.targetSettlementOptionId || undefined,
    amount: row.amount,
    receiveAmount: row.receiveAmount,
    rateMode: orderRateMode(row),
    outcomeUnknown: row.outcomeUnknown,
    refundAddress: row.refundAddress || undefined,
    refundMemo: row.refundMemo || undefined,
    refreshUnavailable: row.type === "manual" ? false : refreshUnavailable,
    statusNotificationsEnabled: row.statusNotificationsEnabled,
    manualSettlementState: row.type === "manual" ? row.manualSettlementState : undefined,
    customerSafeNote: row.type === "manual" ? row.customerSafeNote || undefined : undefined,
     fundingStatus: row.type === "manual" ? row.fundingStatus : undefined,
     fundingSource: row.type === "manual" ? row.fundingProviderSource : undefined,
     fundingAddressSource: row.type === "manual"
       ? row.fundingStatus === "ready_whitebit" ? "live_api"
         : row.fundingStatus === "ready_manual"
           ? (row.providerState === "whitebit_fallback" ? "manual_fallback" : "manual_only")
           : "unavailable"
       : undefined,
     fundingError: row.type === "manual" && row.fundingStatus === "unresolved"
       ? "Deposit address provisioning is pending operator recovery."
       : undefined,
     depositAddress: row.type === "manual" && ["ready_whitebit", "ready_manual"].includes(row.fundingStatus)
       ? row.depositAddress || undefined : undefined,
     depositMemo: row.type === "manual" && ["ready_whitebit", "ready_manual"].includes(row.fundingStatus)
       ? row.depositMemo || undefined : undefined,
      fundingDetails: row.type === "manual" && ["ready_whitebit", "ready_manual"].includes(row.fundingStatus)
        ? customerSafeFundingDetails(row.fundingDetailsSnapshot, row.fundingStatus) ?? undefined : undefined,
     settlementDetails: row.type === "manual" ? row.settlementDetails ?? undefined : undefined,
     paymentDetails: isApplicablePaymentDetailsOrder(row) ? row.paymentDetails ?? undefined : undefined,
     paymentDetailsApplicable: isApplicablePaymentDetailsOrder(row),
      sourcePaymentMethod: outputSourcePaymentMethod(row),
     customerMarkedPaidAt: row.customerMarkedPaidAt?.toISOString() ?? null,
     verifiedFundingTransaction: verifiedFunding ?? undefined,
    completedAt: completed ? row.updatedAt.toISOString() : null,
    exchangeRate,
     transactionHash: exposeLegacyTransactionHash(row.type, row.transactionHash),
    paymentReference: row.paymentReference || undefined,
    trackingToken: signOrderTrackingToken(row.id),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Projects only the immutable observation selected by the applied match for
 * this exact order. The editable support-tools transactionHash is deliberately
 * not consulted here.
 */
async function getVerifiedFundingTransaction(orderId: string) {
  const [row] = await db
    .select({
      transactionHash: blockchainMonitorObservationsTable.transactionHash,
      networkCode: blockchainMonitorNetworksTable.networkCode,
      networkName: blockchainMonitorNetworksTable.networkName,
      confirmations: blockchainMonitorMatchesTable.confirmations,
      detectedAt: blockchainMonitorMatchesTable.appliedAt,
      observedAt: blockchainMonitorObservationsTable.observedAt,
      explorerUrlTemplate: cryptoAssetNetworksTable.explorerUrlTemplate,
    })
    .from(blockchainMonitorMatchesTable)
    .innerJoin(ordersTable, eq(ordersTable.id, blockchainMonitorMatchesTable.orderId))
    .innerJoin(
      blockchainMonitorObservationsTable,
      eq(blockchainMonitorObservationsTable.id, blockchainMonitorMatchesTable.observationId),
    )
    .innerJoin(
      blockchainMonitorAssetsTable,
      eq(blockchainMonitorAssetsTable.id, blockchainMonitorObservationsTable.monitorAssetId),
    )
    .innerJoin(
      blockchainMonitorNetworksTable,
      eq(blockchainMonitorNetworksTable.id, blockchainMonitorObservationsTable.monitorNetworkId),
    )
    .innerJoin(
      cryptoAssetNetworksTable,
      eq(cryptoAssetNetworksTable.id, blockchainMonitorAssetsTable.assetNetworkId),
    )
    .where(and(
      eq(blockchainMonitorMatchesTable.orderId, orderId),
      eq(blockchainMonitorMatchesTable.state, "applied"),
      eq(ordersTable.id, orderId),
      eq(ordersTable.type, "manual"),
    ))
    .orderBy(desc(blockchainMonitorMatchesTable.appliedAt), desc(blockchainMonitorMatchesTable.updatedAt))
    .limit(1);
  if (!row) return undefined;
  const template = row.explorerUrlTemplate?.trim();
  const explorerUrl = buildVerifiedExplorerUrl(template, row.transactionHash);
  return {
    transactionHash: row.transactionHash,
    networkCode: row.networkCode,
    networkName: row.networkName,
    confirmations: row.confirmations,
    detectedAt: (row.detectedAt ?? row.observedAt)?.toISOString() ?? null,
    explorerUrl,
  };
}

function assertIdempotentOrderMatches(
  row: typeof ordersTable.$inferSelect,
  input: {
    type: string;
    fromAsset: string;
    fromNetwork: string;
    toAsset: string;
    toNetwork: string;
    amount: number;
    customerEmail: string;
    customerName?: string;
    destinationAddress?: string;
    destinationMemo?: string;
    refundAddress?: string | null;
    refundMemo?: string | null;
    paymentMethod?: string;
    payoutMethod?: string;
    note?: string;
    quoteId?: string;
    rateMode?: "FLOATING" | "FIXED";
    sourceSettlementOptionId?: string;
    targetSettlementOptionId?: string;
    settlementDetails?: Record<string, unknown>;
  },
  matchQuoteId = true,
) {
  const canonicalJson = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  if (
    (matchQuoteId && row.quoteId !== input.quoteId) ||
    row.type !== input.type ||
    row.fromAsset !== input.fromAsset ||
    row.fromNetwork !== input.fromNetwork ||
    row.toAsset !== input.toAsset ||
    row.toNetwork !== input.toNetwork ||
    Number(row.amount) !== input.amount ||
    row.customerEmail !== input.customerEmail ||
    row.customerName !== (input.customerName ?? "Guest") ||
    row.destinationAddress !== (input.destinationAddress ?? "") ||
    row.destinationMemo !== (input.destinationMemo ?? "") ||
    row.refundAddress !== (input.refundAddress ?? "") ||
    row.refundMemo !== (input.refundMemo ?? "") ||
    row.paymentMethod !== (input.paymentMethod ?? "") ||
    row.payoutMethod !== (input.payoutMethod ?? "") ||
    row.note !== (input.note ?? "") ||
     row.rateMode !== (input.rateMode ?? "") ||
    (row.sourceSettlementOptionId ?? undefined) !== input.sourceSettlementOptionId ||
    (row.targetSettlementOptionId ?? undefined) !== input.targetSettlementOptionId ||
     canonicalJson(row.settlementDetails ?? {}) !==
       canonicalJson(input.settlementDetails ?? {})
  ) {
    throw new ApiError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key belongs to a different order.",
      409,
    );
  }
}

type ParsedQuoteInput = ReturnType<typeof CreateExchangeQuoteBody.parse>;

function effectiveManualSourceLimits(
  rule: { minAmount: string | null; maxAmount: string | null },
  sourceOption?: PublicSettlementOption,
) {
  const sourceAttachmentMin = sourceOption?.kind === "fiat-payment-method" &&
    sourceOption.minAmount != null ? Number(sourceOption.minAmount) : undefined;
  const sourceAttachmentMax = sourceOption?.kind === "fiat-payment-method" &&
    sourceOption.maxAmount != null ? Number(sourceOption.maxAmount) : undefined;
  const sourceMinimums = [
    rule.minAmount == null ? undefined : Number(rule.minAmount),
    sourceAttachmentMin,
  ].filter((value): value is number => value !== undefined);
  const sourceMaximums = [
    rule.maxAmount == null ? undefined : Number(rule.maxAmount),
    sourceAttachmentMax,
  ].filter((value): value is number => value !== undefined);
  return {
    effectiveMinAmount: sourceMinimums.length ? Math.max(...sourceMinimums) : undefined,
    effectiveMaxAmount: sourceMaximums.length ? Math.min(...sourceMaximums) : undefined,
  };
}

async function getManualRoutePricing(
  sourceSettlementOptionId: string,
  targetSettlementOptionId: string,
) {
  const options = [
    ...await listPublicFiatSettlementOptions(),
    ...await listPublicManualCryptoSettlementOptions(),
  ];
  const sourceOption = options.find((option) => option.id === sourceSettlementOptionId);
  const targetOption = options.find((option) => option.id === targetSettlementOptionId);
  if (
    !sourceOption || !targetOption ||
    sourceOption.id === targetOption.id ||
    (sourceOption.direction !== "send" && sourceOption.direction !== "both") ||
    (targetOption.direction !== "receive" && targetOption.direction !== "both") ||
    (sourceOption.kind !== "fiat-payment-method" &&
      targetOption.kind !== "fiat-payment-method")
  ) {
    throw new ApiError("SETTLEMENT_OPTION_INVALID", "The selected settlement route is unavailable.", 422);
  }
  const normalizedInput = CreateExchangeQuoteBody.parse({
    type: "manual",
    fromAsset: sourceOption.assetCode,
    fromNetwork: sourceOption.routeNetwork,
    toAsset: targetOption.assetCode,
    toNetwork: targetOption.routeNetwork,
    amount: 1,
    sourceSettlementOptionId,
    targetSettlementOptionId,
  });
  const route = await normalizeExchangeRoute(normalizedInput);
  const rule = await matchManualDeskPricingRule({
    sourceAsset: route.fromAsset,
    targetAsset: route.toAsset,
    sourceNetwork: route.fromNetwork,
    targetNetwork: route.toNetwork,
    sourceSettlementOptionId,
    targetSettlementOptionId,
  });
  const { effectiveMinAmount, effectiveMaxAmount } =
    effectiveManualSourceLimits(rule, sourceOption);
  const rate = await getManualDeskReferenceRate({
    sourceCurrency: route.fromAsset,
    targetCurrency: route.toAsset,
    markupBasisPoints: rule.markupBasisPoints,
    adjustmentDirection: rule.adjustmentDirection as "MARKUP" | "GIVE_MORE",
    exactRate: rule.exactRate,
  });
  return {
    sourceSettlementOptionId,
    targetSettlementOptionId,
    fromAsset: route.fromAsset,
    toAsset: route.toAsset,
    rate,
    minAmount: effectiveMinAmount,
    maxAmount: effectiveMaxAmount,
    pricingRuleName: rule.name,
  };
}
type NormalizedRoute = Pick<
  ParsedQuoteInput,
  "fromAsset" | "fromNetwork" | "toAsset" | "toNetwork"
> & { targetPrecision: number };

type PublicSettlementOption =
  Awaited<ReturnType<typeof listPublicFiatSettlementOptions>>[number] |
  Awaited<ReturnType<typeof listPublicManualCryptoSettlementOptions>>[number];

function settlementFieldsForSide(
  fields: Array<{
    key: string;
    direction?: "send" | "receive" | "both";
    requiredWhen?: { fieldKey: string; equals: string | string[] };
    [key: string]: unknown;
  }>,
  side: "send" | "receive",
  prefix: string,
) {
  return fields
    .filter((field) => !field.direction || field.direction === "both" || field.direction === side)
    .map((field) => ({
      ...field,
      key: `${prefix}${field.key}`,
      ...(field.requiredWhen
        ? {
            requiredWhen: {
              ...field.requiredWhen,
              fieldKey: `${prefix}${field.requiredWhen.fieldKey}`,
            },
          }
        : {}),
    }));
}

function settlementFieldsForRoute(
  sourceFields: Parameters<typeof settlementFieldsForSide>[0] | undefined,
  targetFields: Parameters<typeof settlementFieldsForSide>[0] | undefined,
) {
  const source = sourceFields
    ? settlementFieldsForSide(sourceFields, "send", "source_")
    : [];
  const sourceKeys = new Set(sourceFields
    ?.filter((field) => !field.direction || field.direction === "both" || field.direction === "send")
    .map((field) => field.key) ?? []);
  const target = targetFields
    ? settlementFieldsForSide(targetFields, "receive", "target_")
        .filter((field) => !sourceKeys.has(String(field.key).replace(/^target_/, "")))
    : [];
  return [...source, ...target];
}

function cryptoFundingSnapshot(network: typeof cryptoAssetNetworksTable.$inferSelect) {
  return {
    address: network.sharedDepositAddress,
    memo: network.sharedDepositMemo ?? "",
    depositProvider: network.depositProvider,
    requiresMemo: network.requiresMemo,
    requiredConfirmations: network.requiredConfirmations,
    confirmationGuidance: network.confirmationGuidance ?? "",
    instructions: network.depositInstructions ?? "",
    warning: network.depositWarning ?? "",
  };
}

const ROUTE_UNAVAILABLE_WARNING =
  "Deposits are unavailable until an operator configures this route.";

function customerSafeFundingDetails(
  value: unknown,
  fundingStatus: string,
): unknown {
  if (
    !["ready_whitebit", "ready_manual"].includes(fundingStatus) ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) return value;
  const details = value as Record<string, unknown>;
  return details.warning === ROUTE_UNAVAILABLE_WARNING
    ? { ...details, warning: "" }
    : details;
}

async function normalizeExchangeRoute(input: ParsedQuoteInput): Promise<NormalizedRoute> {
  if (input.type !== "manual") {
    throw new ApiError("MANUAL_SWAP_REQUIRED", "Only Manual desk swaps are available.", 422);
  }

  const fiatAssets = await listEnabledFiatCurrencies();
  const findFiat = (asset: string, network: string) =>
    fiatAssets.find(
      (instrument) =>
        instrument.code.toUpperCase() === asset.toUpperCase() &&
        instrument.network.toUpperCase() === network.toUpperCase(),
    );
  const fromFiat = findFiat(input.fromAsset, input.fromNetwork);
  const toFiat = findFiat(input.toAsset, input.toNetwork);
  if (!fromFiat && !toFiat) {
    throw new ApiError(
      "DESK_ROUTE_INVALID",
      "Manual desk requests require two different supported currencies and at least one fiat currency.",
      422,
    );
  }
  if (fromFiat && toFiat) {
    if (fromFiat.id === toFiat.id) {
      throw new ApiError(
        "DESK_ROUTE_INVALID",
        "Manual desk requests require two different supported currencies and at least one fiat currency.",
        422,
      );
    }
    return {
      fromAsset: fromFiat.code,
      fromNetwork: fromFiat.network,
      toAsset: toFiat.code,
      toNetwork: toFiat.network,
      targetPrecision: toFiat.precision,
    };
  }

  const fromCrypto = fromFiat ? undefined : await findManualCryptoNetwork(input.fromAsset, input.fromNetwork);
  const toCrypto = toFiat ? undefined : await findManualCryptoNetwork(input.toAsset, input.toNetwork);
  const from = fromCrypto ?? fromFiat;
  const to = toCrypto ?? toFiat;
  if (!from || !to ||
    ((fromCrypto ? fromCrypto.asset.code : fromFiat!.code).toUpperCase() ===
      (toCrypto ? toCrypto.asset.code : toFiat!.code).toUpperCase() &&
      (fromCrypto ? fromCrypto.network.networkCode : fromFiat!.network).toUpperCase() ===
      (toCrypto ? toCrypto.network.networkCode : toFiat!.network).toUpperCase())) {
    throw new ApiError(
      "DESK_ROUTE_INVALID",
      "Manual desk requests require two different supported currencies and at least one fiat currency.",
      422,
    );
  }
  return {
    fromAsset: fromCrypto ? fromCrypto.asset.code : fromFiat!.code,
    fromNetwork: fromCrypto ? manualCryptoRouteNetwork(fromCrypto.network) : fromFiat!.network,
    toAsset: toCrypto ? toCrypto.asset.code : toFiat!.code,
    toNetwork: toCrypto ? manualCryptoRouteNetwork(toCrypto.network) : toFiat!.network,
    targetPrecision: toCrypto ? Math.min(toCrypto.network.decimals, MAX_MANUAL_DESK_TARGET_PRECISION) : toFiat!.precision,
  };
}

async function buildQuoteTicket(
  input: ParsedQuoteInput,
  normalizedRoute?: NormalizedRoute,
  skipFundingAvailability = false,
): Promise<QuoteTicket> {
  const route = normalizedRoute ?? await normalizeExchangeRoute(input);
  let sourceOption: PublicSettlementOption | undefined;
  let targetOption: PublicSettlementOption | undefined;
  const usesStableOptions = Boolean(
    input.sourceSettlementOptionId || input.targetSettlementOptionId,
  );
  if (usesStableOptions) {
    if (!input.sourceSettlementOptionId || !input.targetSettlementOptionId) {
      throw new ApiError("SETTLEMENT_OPTION_REQUIRED", "Both settlement option IDs are required.", 400);
    }
    const options = [
      ...await listPublicFiatSettlementOptions(),
      ...await listPublicManualCryptoSettlementOptions(),
    ];
    sourceOption = options.find((option) => option.id === input.sourceSettlementOptionId);
    targetOption = options.find((option) => option.id === input.targetSettlementOptionId);
    if (
      !sourceOption || !targetOption ||
      sourceOption.assetCode !== route.fromAsset ||
      sourceOption.routeNetwork !== route.fromNetwork ||
      targetOption.assetCode !== route.toAsset ||
      targetOption.routeNetwork !== route.toNetwork ||
      sourceOption.id === targetOption.id ||
      (sourceOption.direction !== "send" && sourceOption.direction !== "both") ||
      (targetOption.direction !== "receive" && targetOption.direction !== "both") ||
      (sourceOption.kind !== "fiat-payment-method" &&
        targetOption.kind !== "fiat-payment-method")
    ) {
      throw new ApiError("SETTLEMENT_OPTION_INVALID", "The selected settlement route is unavailable.", 422);
    }
  }
  const rule = await matchManualDeskPricingRule({
    sourceAsset: route.fromAsset,
    targetAsset: route.toAsset,
    sourceNetwork: route.fromNetwork,
    targetNetwork: route.toNetwork,
    paymentMethod: input.paymentMethod,
    payoutMethod: input.payoutMethod,
    sourceSettlementOptionId: sourceOption?.id,
    targetSettlementOptionId: targetOption?.id,
  });
  const { effectiveMinAmount, effectiveMaxAmount } =
    effectiveManualSourceLimits(rule, sourceOption);
  if (
    effectiveMinAmount !== undefined && input.amount < effectiveMinAmount ||
    effectiveMaxAmount !== undefined && input.amount > effectiveMaxAmount
  ) {
    throw new ApiError("MANUAL_AMOUNT_OUT_OF_RANGE", "The amount is outside this route's limits.", 422);
  }
  const pricedEstimate = await getManualDeskEstimate({
    sourceCurrency: route.fromAsset,
    targetCurrency: route.toAsset,
    targetPrecision: route.targetPrecision,
    amount: input.amount,
    markupBasisPoints: rule.markupBasisPoints,
    adjustmentDirection: rule.adjustmentDirection as "MARKUP" | "GIVE_MORE",
    fixedFee: rule.fixedFee,
    exactRate: rule.exactRate,
  });
  if (targetOption?.kind === "fiat-payment-method") {
    const targetMin = targetOption.minAmount == null ? undefined : Number(targetOption.minAmount);
    const targetMax = targetOption.maxAmount == null ? undefined : Number(targetOption.maxAmount);
    if (
      targetMin !== undefined && pricedEstimate.receiveAmount < targetMin ||
      targetMax !== undefined && pricedEstimate.receiveAmount > targetMax
    ) {
      throw new ApiError("MANUAL_AMOUNT_OUT_OF_RANGE", "The amount is outside this route's limits.", 422);
    }
  }
  return {
    v: usesStableOptions ? 2 : 1, type: "manual",
    manualOrderCreationDisabled: usesStableOptions ? undefined : true,
    fromAsset: route.fromAsset,
    fromNetwork: route.fromNetwork,
    toAsset: route.toAsset,
    toNetwork: route.toNetwork,
    amount: input.amount,
    ...pricedEstimate,
    paymentMethod: normalizeManualPricingSelectors(input).paymentMethod ?? "",
    payoutMethod: normalizeManualPricingSelectors(input).payoutMethod ?? "",
    sourceSettlementOptionId: sourceOption?.id,
    targetSettlementOptionId: targetOption?.id,
    settlementSnapshot: sourceOption && targetOption ? {
      source: {
        id: sourceOption.id, assetId: sourceOption.assetId,
        assetCode: sourceOption.assetCode, kind: sourceOption.kind, title: sourceOption.title,
        ...(sourceOption.kind === "fiat-payment-method" ? {
          paymentMethodId: sourceOption.paymentMethodId,
          logoUrl: sourceOption.logoUrl,
          minAmount: sourceOption.minAmount ?? null,
          maxAmount: sourceOption.maxAmount ?? null,
          instructions: sourceOption.sendInstructions ?? "",
        } : {}),
        ...(sourceOption.kind === "crypto-network" ? {
          networkId: sourceOption.networkSlug, networkCode: sourceOption.routeNetwork,
          networkName: sourceOption.networkTitle, requiresMemo: sourceOption.requiresMemo,
          instructions: sourceOption.sendInstructions, warning: sourceOption.depositWarning,
        } : {}),
      },
      target: {
        id: targetOption.id, assetId: targetOption.assetId,
        assetCode: targetOption.assetCode, kind: targetOption.kind, title: targetOption.title,
        ...(targetOption.kind === "fiat-payment-method" ? {
          paymentMethodId: targetOption.paymentMethodId,
          logoUrl: targetOption.logoUrl,
          minAmount: targetOption.minAmount ?? null,
          maxAmount: targetOption.maxAmount ?? null,
          instructions: targetOption.receiveInstructions ?? "",
        } : {}),
        ...(targetOption.kind === "crypto-network" ? {
          networkId: targetOption.networkSlug, networkCode: targetOption.routeNetwork,
          networkName: targetOption.networkTitle, requiresMemo: targetOption.requiresMemo,
          instructions: targetOption.receiveInstructions, warning: targetOption.depositWarning,
        } : {}),
      },
      route: {
        minAmount: effectiveMinAmount == null ? null : String(effectiveMinAmount),
        maxAmount: effectiveMaxAmount == null ? null : String(effectiveMaxAmount),
        operatorInstructions: rule.operatorInstructions ?? null,
        customerInstructions: rule.customerInstructions ?? null,
        expectedSettlementMinutes: rule.expectedSettlementMinutes ?? null,
      },
      requiredFields: settlementFieldsForRoute(
        sourceOption.kind === "fiat-payment-method" ? sourceOption.fields as never : undefined,
        targetOption.kind === "fiat-payment-method" ? targetOption.fields as never : undefined,
      ) as never,
      funding: sourceOption.kind === "crypto-network" ? await (async () => {
        const source = await findManualCryptoNetworkByIdForAsset(
          sourceOption!.networkSlug,
          sourceOption!.assetCode,
        );
        if (!source || !await canAcceptReadyManualCryptoDeposit(source.network)) {
          if (skipFundingAvailability) return undefined;
          throw new ApiError("DESK_CRYPTO_DEPOSIT_UNAVAILABLE", "Customer deposits are not enabled for this crypto network.", 422);
        }
        return cryptoFundingSnapshot(source.network);
      })() : undefined,
    } : undefined,
    minAmount: effectiveMinAmount,
    maxAmount: effectiveMaxAmount,
    pricingRuleId: rule.id,
    pricingRuleVersion: rule.version,
    pricingRuleName: rule.name,
    pricingSnapshot: {
      policyVersion: "manual-desk-pricing-v1",
      rule: {
        id: rule.id,
        version: rule.version,
        name: rule.name,
        selectors: normalizeManualPricingSelectors({
          ...rule,
          sourceAsset: route.fromAsset,
          sourceCryptoAssetId: sourceOption?.kind === "crypto-network"
            ? sourceOption.assetId
            : rule.sourceCryptoAssetId,
          targetAsset: route.toAsset,
          targetCryptoAssetId: targetOption?.kind === "crypto-network"
            ? targetOption.assetId
            : rule.targetCryptoAssetId,
          sourceNetwork: route.fromNetwork,
          targetNetwork: route.toNetwork,
          sourceSettlementOptionId: sourceOption?.id,
          targetSettlementOptionId: targetOption?.id,
          paymentMethod: input.paymentMethod,
          payoutMethod: input.payoutMethod,
        }),
        configuredSelectors: normalizeManualPricingSelectors(rule),
        markupBasisPoints: rule.markupBasisPoints,
        adjustmentDirection: rule.adjustmentDirection as "MARKUP" | "GIVE_MORE",
        fixedFee: rule.fixedFee ?? null,
        exactRate: rule.exactRate ?? null,
        effectiveRateSource: rule.exactRateSource,
      },
      context: {
        sourceAsset: route.fromAsset,
        sourceCryptoAssetId: sourceOption?.kind === "crypto-network"
          ? sourceOption.assetId
          : rule.sourceCryptoAssetId,
        targetAsset: route.toAsset,
        targetCryptoAssetId: targetOption?.kind === "crypto-network"
          ? targetOption.assetId
          : rule.targetCryptoAssetId,
        sourceNetwork: route.fromNetwork,
        targetNetwork: route.toNetwork,
        paymentMethod: normalizeManualPricingSelectors(input).paymentMethod ?? "",
        payoutMethod: normalizeManualPricingSelectors(input).payoutMethod ?? "",
      },
      reference: {
        source: pricedEstimate.exact.sourceReference,
        target: pricedEstimate.exact.targetReference,
        executionProvider: "Manual desk",
        mode: rule.exactRate != null ? "exact-path" : "market",
      },
      targetPrecision: route.targetPrecision,
      rounding: {
        grossMarketAmount: "truncate",
        percentageCommission: rule.adjustmentDirection === "GIVE_MORE" ? "floor" : "ceil",
        fixedCommission: "ceil",
        finalRate: "truncate",
        finalRateScale: 30,
      },
      amounts: {
        grossMarketAmount: pricedEstimate.exact.grossMarketAmount,
        percentageCommission: pricedEstimate.exact.percentageCommission,
        fixedCommission: pricedEstimate.exact.fixedCommission,
        totalFee: pricedEstimate.exact.totalFee,
        receiveAmount: pricedEstimate.exact.receiveAmount,
        finalRate: pricedEstimate.exact.finalRate,
      },
    },
    expiresAt: Date.now() + 2 * 60 * 1000,
    provider: "Manual desk",
  };
}

async function revalidateManualDeskQuoteRoute(quote: QuoteTicket): Promise<void> {
  if (quote.type !== "manual") return;
  if (quote.v === 2) {
    const snapshot = quote.settlementSnapshot;
    if (!snapshot || !quote.sourceSettlementOptionId || !quote.targetSettlementOptionId) {
      throw new ApiError("SETTLEMENT_OPTION_INVALID", "The selected settlement route is unavailable.", 422);
    }
    const options = [
      ...await listPublicFiatSettlementOptions(),
      ...await listPublicManualCryptoSettlementOptions(),
    ];
    const source = options.find((option) => option.id === quote.sourceSettlementOptionId);
    const target = options.find((option) => option.id === quote.targetSettlementOptionId);
    const sameSnapshot = (
      option: PublicSettlementOption | undefined,
      signed: typeof snapshot.source,
      id: string,
      side: "send" | "receive",
    ) => {
      if (!option) return false;
      const current = {
        id: option.id,
        assetId: option.assetId,
        assetCode: option.assetCode,
        kind: option.kind,
        title: option.title,
        ...(option.kind === "fiat-payment-method" ? {
          minAmount: option.minAmount ?? null,
          maxAmount: option.maxAmount ?? null,
          instructions: side === "send"
            ? option.sendInstructions ?? ""
            : option.receiveInstructions ?? "",
        } : {}),
        ...(option.kind === "crypto-network" ? {
          networkId: option.networkSlug,
          networkCode: option.routeNetwork,
          networkName: option.networkTitle,
          requiresMemo: option.requiresMemo,
          instructions: side === "send"
            ? option.sendInstructions
            : option.receiveInstructions,
          warning: option.depositWarning,
        } : {}),
      };
      const {
        paymentMethodId: _paymentMethodId,
        logoUrl: _logoUrl,
        ...signedSettlementTerms
      } = signed;
      return option.id === id &&
        JSON.stringify(current) === JSON.stringify(signedSettlementTerms);
    };
    if (
      !source || !target ||
      source.direction !== "send" && source.direction !== "both" ||
      target.direction !== "receive" && target.direction !== "both"
    ) {
      throw new ApiError("SETTLEMENT_OPTION_INVALID", "The selected settlement route is no longer available.", 422);
    }
    if (
      !sameSnapshot(source, snapshot.source, quote.sourceSettlementOptionId, "send") ||
      !sameSnapshot(target, snapshot.target, quote.targetSettlementOptionId, "receive")
    ) {
      throw new ApiError("SETTLEMENT_OPTION_CHANGED", "The selected settlement terms changed after this quote was issued.", 409);
    }
    if (source!.kind === "crypto-network") {
      const network = await findManualCryptoNetworkByIdForAsset(
        source!.networkSlug,
        source!.assetCode,
      );
      if (!network || !await canAcceptReadyManualCryptoDeposit(network.network)) {
        throw new ApiError("DESK_CRYPTO_DEPOSIT_UNAVAILABLE", "Customer deposits are not enabled for this crypto network.", 422);
      }
      const currentFunding = cryptoFundingSnapshot(network.network);
      if (JSON.stringify(currentFunding) !== JSON.stringify(snapshot.funding)) {
        throw new ApiError("SETTLEMENT_OPTION_CHANGED", "The signed funding instructions changed after this quote was issued.", 409);
      }
    } else if (snapshot.funding !== undefined) {
      throw new ApiError("SETTLEMENT_OPTION_CHANGED", "The signed funding instructions no longer match this route.", 409);
    }
    const currentFields = settlementFieldsForRoute(
      source!.kind === "fiat-payment-method" ? source!.fields as never : undefined,
      target!.kind === "fiat-payment-method" ? target!.fields as never : undefined,
    );
    if (JSON.stringify(currentFields) !== JSON.stringify(snapshot.requiredFields)) {
      throw new ApiError("SETTLEMENT_OPTION_CHANGED", "The required settlement details changed after this quote was issued.", 409);
    }
    const rule = await matchManualDeskPricingRule({
      sourceAsset: quote.fromAsset,
      targetAsset: quote.toAsset,
      sourceNetwork: quote.fromNetwork,
      targetNetwork: quote.toNetwork,
      paymentMethod: quote.paymentMethod,
      payoutMethod: quote.payoutMethod,
      sourceSettlementOptionId: quote.sourceSettlementOptionId,
      targetSettlementOptionId: quote.targetSettlementOptionId,
    });
    const signedRule = quote.pricingSnapshot?.rule;
    const sourceOptionMin = source!.kind === "fiat-payment-method" &&
      source!.minAmount != null ? Number(source!.minAmount) : undefined;
    const sourceOptionMax = source!.kind === "fiat-payment-method" &&
      source!.maxAmount != null ? Number(source!.maxAmount) : undefined;
    const currentMinimums = [
      rule.minAmount == null ? undefined : Number(rule.minAmount),
      sourceOptionMin,
    ].filter((value): value is number => value !== undefined);
    const currentMaximums = [
      rule.maxAmount == null ? undefined : Number(rule.maxAmount),
      sourceOptionMax,
    ].filter((value): value is number => value !== undefined);
    const currentMin = currentMinimums.length ? String(Math.max(...currentMinimums)) : null;
    const currentMax = currentMaximums.length ? String(Math.min(...currentMaximums)) : null;
    if (
      !signedRule ||
      rule.id !== signedRule.id ||
      rule.version !== signedRule.version ||
      rule.name !== signedRule.name ||
      rule.markupBasisPoints !== signedRule.markupBasisPoints ||
      rule.adjustmentDirection !== (signedRule.adjustmentDirection ?? "MARKUP") ||
      (rule.fixedFee ?? null) !== signedRule.fixedFee ||
      (rule.exactRate ?? null) !== (signedRule.exactRate ?? null) ||
      (rule.exactRateSource ?? "direct") !== (signedRule.effectiveRateSource ?? "direct") ||
      currentMin !== snapshot.route.minAmount ||
      currentMax !== snapshot.route.maxAmount ||
      (rule.operatorInstructions ?? null) !== snapshot.route.operatorInstructions ||
      (rule.customerInstructions ?? null) !== snapshot.route.customerInstructions ||
      (rule.expectedSettlementMinutes ?? null) !== snapshot.route.expectedSettlementMinutes
    ) {
      throw new ApiError("MANUAL_QUOTE_CONFIGURATION_CHANGED", "The manual desk terms changed after this quote was issued.", 409);
    }
    return;
  }
  const current = await normalizeExchangeRoute({
    type: "manual",
    fromAsset: quote.fromAsset,
    fromNetwork: quote.fromNetwork,
    toAsset: quote.toAsset,
    toNetwork: quote.toNetwork,
    amount: quote.amount,
  });
  const legacySourceCrypto = await findManualCryptoNetwork(
    quote.fromAsset,
    quote.fromNetwork,
  );
  if (
    legacySourceCrypto &&
    !await canAcceptReadyManualCryptoDeposit(legacySourceCrypto.network)
  ) {
    throw new ApiError(
      "DESK_CRYPTO_DEPOSIT_UNAVAILABLE",
      "Customer deposits are not enabled for this crypto network.",
      422,
    );
  }
  if (
    current.fromAsset !== quote.fromAsset ||
    current.fromNetwork !== quote.fromNetwork ||
    current.toAsset !== quote.toAsset ||
    current.toNetwork !== quote.toNetwork
  ) {
    throw new ApiError(
      "DESK_ROUTE_INVALID",
      "The selected manual desk route is no longer available.",
      422,
    );
  }
}

async function validateExactPricingRuleOptions(input: {
  sourceSettlementOptionId?: string | null;
  targetSettlementOptionId?: string | null;
  sourceAsset?: string | null;
  targetAsset?: string | null;
  sourceCryptoAssetId?: string | null;
  targetCryptoAssetId?: string | null;
  sourceNetwork?: string | null;
  targetNetwork?: string | null;
  exactRate?: string | null;
}) {
  const assetIds = [input.sourceCryptoAssetId, input.targetCryptoAssetId]
    .map((id) => id?.trim()).filter((id): id is string => Boolean(id));
  if (assetIds.length) {
    const assets = await db.select({ id: cryptoAssetsTable.id })
      .from(cryptoAssetsTable)
      .where(and(
        inArray(cryptoAssetsTable.id, assetIds),
        eq(cryptoAssetsTable.enabled, true),
        ne(cryptoAssetsTable.lifecycle, "deprecated"),
      ));
    if (assets.length !== new Set(assetIds.map((id) => id.toLowerCase())).size) {
      throw new ApiError("SETTLEMENT_OPTION_INVALID", "Pricing rules must reference enabled, non-deprecated crypto assets.", 400);
    }
    if (input.sourceCryptoAssetId && (
      input.sourceSettlementOptionId || input.sourceAsset || input.sourceNetwork
    )) throw new ApiError("SETTLEMENT_OPTION_INVALID", "Asset-level source selectors cannot include network or settlement selectors.", 400);
    if (input.targetCryptoAssetId && (
      input.targetSettlementOptionId || input.targetAsset || input.targetNetwork
    )) throw new ApiError("SETTLEMENT_OPTION_INVALID", "Asset-level target selectors cannot include network or settlement selectors.", 400);
  }
  const sourceId = input.sourceSettlementOptionId?.trim();
  const targetId = input.targetSettlementOptionId?.trim();
  if (!sourceId && !targetId) return;
  if (sourceId && targetId && sourceId.toUpperCase() === targetId.toUpperCase()) {
    throw new ApiError(
      "SETTLEMENT_OPTION_INVALID",
      "Source and target settlement options must be different.",
      400,
    );
  }
  const options = [
    ...await listPublicFiatSettlementOptions(),
    ...await listPublicManualCryptoSettlementOptions(),
  ];
  const source = sourceId
    ? options.find((option) => option.id.toUpperCase() === sourceId.toUpperCase())
    : undefined;
  const target = targetId
    ? options.find((option) => option.id.toUpperCase() === targetId.toUpperCase())
    : undefined;
  const invalidSource = sourceId && (
    !source ||
    (source.direction !== "send" && source.direction !== "both") ||
    !input.sourceAsset?.trim() ||
    source.assetCode.toUpperCase() !== input.sourceAsset.trim().toUpperCase() ||
    (input.exactRate != null && (
      !input.sourceNetwork?.trim() ||
      source.routeNetwork.toUpperCase() !== input.sourceNetwork.trim().toUpperCase()
    ))
  );
  const invalidTarget = targetId && (
    !target ||
    (target.direction !== "receive" && target.direction !== "both") ||
    !input.targetAsset?.trim() ||
    target.assetCode.toUpperCase() !== input.targetAsset.trim().toUpperCase() ||
    (input.exactRate != null && (
      !input.targetNetwork?.trim() ||
      target.routeNetwork.toUpperCase() !== input.targetNetwork.trim().toUpperCase()
    ))
  );
  if (invalidSource || invalidTarget) {
    throw new ApiError(
      "SETTLEMENT_OPTION_INVALID",
      "Pricing settlement options must match each selected asset, network, and direction.",
      422,
    );
  }
}

router.get("/exchange/popular-pairs", async (_req, res, next) => {
  try {
    res.setHeader("cache-control", "no-store");
    res.json(GetPopularExchangePairsResponse.parse(await getPopularExchangePairs()));
  } catch (error) {
    next(error);
  }
});

router.get("/exchange/route-pricing", async (req, res, next) => {
  try {
    const query = GetExchangeRoutePricingQueryParams.parse(req.query);
    const pricing = await getManualRoutePricing(
      query.sourceSettlementOptionId,
      query.targetSettlementOptionId,
    );
    res.json(GetExchangeRoutePricingResponse.parse(pricing));
  } catch (error) {
    next(error);
  }
});

router.post("/exchange/quote", async (req, res, next) => {
  try {
    const input = CreateExchangeQuoteBody.parse(req.body);
    const ticket = await buildQuoteTicket(input);
    res.json({
      ...ticket,
      requiredSettlementFields: ticket.settlementSnapshot?.requiredFields,
      customerInstructions: ticket.settlementSnapshot?.route.customerInstructions ?? undefined,
      expectedSettlementMinutes:
        ticket.settlementSnapshot?.route.expectedSettlementMinutes ?? undefined,
      quoteId: signQuoteTicket(ticket),
      expiresAt: new Date(ticket.expiresAt).toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/manual-desk-pricing-rules/quote-preview", requireOperator, async (req, res, next) => {
  try {
    const input = PreviewManualDeskQuoteBody.parse(req.body);
    const options = [
      ...await listPublicFiatSettlementOptions(),
      ...await listPublicManualCryptoSettlementOptions(),
    ];
    const sourceOption = input.sourceSettlementOptionId
      ? options.find((option) => option.id === input.sourceSettlementOptionId)
      : undefined;
    const targetOption = input.targetSettlementOptionId
      ? options.find((option) => option.id === input.targetSettlementOptionId)
      : undefined;
    const sourceAsset = input.sourceCryptoAssetId
      ? (await db.select().from(cryptoAssetsTable).where(and(
        eq(cryptoAssetsTable.id, input.sourceCryptoAssetId),
        eq(cryptoAssetsTable.enabled, true),
        ne(cryptoAssetsTable.lifecycle, "deprecated"),
      )).limit(1))[0]
      : undefined;
    const targetAsset = input.targetCryptoAssetId
      ? (await db.select().from(cryptoAssetsTable).where(and(
        eq(cryptoAssetsTable.id, input.targetCryptoAssetId),
        eq(cryptoAssetsTable.enabled, true),
        ne(cryptoAssetsTable.lifecycle, "deprecated"),
      )).limit(1))[0]
      : undefined;
    if (Boolean(input.sourceCryptoAssetId) === Boolean(input.sourceSettlementOptionId) ||
        Boolean(input.targetCryptoAssetId) === Boolean(input.targetSettlementOptionId) ||
        (input.sourceCryptoAssetId && !sourceAsset) || (input.targetCryptoAssetId && !targetAsset) ||
        (input.sourceSettlementOptionId && (!sourceOption || sourceOption.kind !== "fiat-payment-method")) ||
        (input.targetSettlementOptionId && (!targetOption || targetOption.kind !== "fiat-payment-method"))) {
      throw new ApiError("SETTLEMENT_OPTION_INVALID", "Choose exactly one valid crypto asset or fiat settlement option on each side.", 400);
    }
    if (sourceOption && sourceOption.direction !== "send" && sourceOption.direction !== "both") {
      throw new ApiError("SETTLEMENT_OPTION_INVALID", "The source settlement option cannot send.", 400);
    }
    if (targetOption && targetOption.direction !== "receive" && targetOption.direction !== "both") {
      throw new ApiError("SETTLEMENT_OPTION_INVALID", "The target settlement option cannot receive.", 400);
    }
    if (sourceAsset && targetAsset) {
      throw new ApiError("SETTLEMENT_OPTION_INVALID", "At least one quote side must use a fiat settlement option.", 400);
    }
    const sourceCode = sourceAsset?.code ?? sourceOption!.assetCode;
    const targetCode = targetAsset?.code ?? targetOption!.assetCode;
    const context = {
      sourceAsset: sourceCode,
      targetAsset: targetCode,
      sourceNetwork: sourceOption?.routeNetwork ?? null,
      targetNetwork: targetOption?.routeNetwork ?? null,
      sourceCryptoAssetId: sourceAsset?.id ?? null,
      targetCryptoAssetId: targetAsset?.id ?? null,
      sourceSettlementOptionId: sourceOption?.id ?? null,
      targetSettlementOptionId: targetOption?.id ?? null,
    };
    const rule = await matchManualDeskPricingRule(context);
    const targetPrecision = targetAsset
      ? Math.min(targetAsset.decimals, MAX_MANUAL_DESK_TARGET_PRECISION)
      : await (async () => {
        const currency = await db.select({ precision: fiatCurrenciesTable.precision })
          .from(fiatCurrenciesTable)
          .where(eq(fiatCurrenciesTable.code, targetCode)).limit(1);
        return Math.min(currency[0]?.precision ?? 2, MAX_MANUAL_DESK_TARGET_PRECISION);
      })();
    const amount = Number(input.amount);
    if (rule.minAmount != null && amount < Number(rule.minAmount) ||
        rule.maxAmount != null && amount > Number(rule.maxAmount)) {
      throw new ApiError("AMOUNT_OUT_OF_RANGE", "The amount is outside this pricing rule's limits.", 422);
    }
    const estimate = await getManualDeskEstimate({
      sourceCurrency: sourceCode,
      targetCurrency: targetCode,
      targetPrecision,
      amount,
      markupBasisPoints: rule.markupBasisPoints,
      adjustmentDirection: rule.adjustmentDirection as "MARKUP" | "GIVE_MORE",
      fixedFee: rule.fixedFee,
      exactRate: rule.exactRate,
    });
    const baseRate = rule.exactRate != null
      ? Number(rule.exactRate)
      : estimate.grossMarketAmount / amount;
    if (!Number.isFinite(baseRate) || baseRate <= 0) {
      throw new ApiError("MANUAL_DESK_RATE_UNAVAILABLE", "Pricing is unavailable for this route.", 422);
    }
    res.json(PreviewManualDeskQuoteResponse.parse({
      fromAsset: sourceCode,
      toAsset: targetCode,
      ...estimate,
      baseRate,
      markupBasisPoints: rule.markupBasisPoints,
      adjustmentDirection: rule.adjustmentDirection,
      finalRate: estimate.rate,
      pricingRuleName: rule.name,
      pricingRuleId: rule.id,
    }));
  } catch (error) {
    next(error);
  }
});

router.get("/orders", requireOperator, async (req, res, next) => {
  try {
    // Operator order queues are live financial views. Do not let a browser,
    // proxy, or conditional ETag response hide orders created by another
    // surface such as Telegram between polling requests.
    res.setHeader("cache-control", "private, no-store, max-age=0");
    res.setHeader("pragma", "no-cache");
    const query = GetOrdersQueryParams.parse(req.query);
    if (
      query.createdFrom &&
      query.createdTo &&
      new Date(query.createdFrom).getTime() > new Date(query.createdTo).getTime()
    ) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "The start date must be before the end date.",
        400,
      );
    }
    if (
      query.minAmount !== undefined &&
      query.maxAmount !== undefined &&
      query.minAmount > query.maxAmount
    ) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "The minimum amount must not exceed the maximum amount.",
        400,
      );
    }
    await ensureSeed();
    const providerFreshness = { state: "unavailable" as const, syncing: false };
    const filters = [eq(ordersTable.type, "manual")];
    if (query.status === "active") {
      // Pseudo-filter: every order still moving (not completed/refunded/expired/failed/cancelled).
      filters.push(notInArray(ordersTable.status, [...TERMINAL_ORDER_STATUSES]));
    } else if (query.status) {
      filters.push(eq(ordersTable.status, query.status));
    }
    if (query.archived === "archived") {
      filters.push(sql`${ordersTable.archivedAt} is not null`);
    } else if (query.archived !== "all") {
      filters.push(isNull(ordersTable.archivedAt));
    }
    if (query.type) filters.push(eq(ordersTable.type, query.type));
    if (query.providerState) {
      filters.push(sql`lower(${ordersTable.providerState}) = lower(${query.providerState})`);
    }
    if (query.fromAsset) {
      filters.push(sql`lower(${ordersTable.fromAsset}) = lower(${query.fromAsset})`);
    }
    if (query.fromNetwork) {
      filters.push(sql`lower(${ordersTable.fromNetwork}) = lower(${query.fromNetwork})`);
    }
    if (query.toAsset) {
      filters.push(sql`lower(${ordersTable.toAsset}) = lower(${query.toAsset})`);
    }
    if (query.toNetwork) {
      filters.push(sql`lower(${ordersTable.toNetwork}) = lower(${query.toNetwork})`);
    }
    if (query.sourceSettlementOptionId) {
      filters.push(sql`lower(${ordersTable.sourceSettlementOptionId}) = lower(${query.sourceSettlementOptionId})`);
    }
    if (query.targetSettlementOptionId) {
      filters.push(sql`lower(${ordersTable.targetSettlementOptionId}) = lower(${query.targetSettlementOptionId})`);
    }
    if (query.customerEmail) {
      filters.push(ilike(ordersTable.customerEmail, `%${query.customerEmail.trim()}%`));
    }
    if (query.rateMode) filters.push(eq(ordersTable.rateMode, query.rateMode));
    if (query.outcomeUnknown) {
      filters.push(eq(ordersTable.outcomeUnknown, query.outcomeUnknown === "true"));
    }
    if (query.createdFrom) {
      filters.push(gte(ordersTable.createdAt, new Date(query.createdFrom)));
    }
    if (query.createdTo) {
      filters.push(lte(ordersTable.createdAt, new Date(query.createdTo)));
    }
    if (query.minAmount !== undefined) {
      filters.push(gte(ordersTable.amount, String(query.minAmount)));
    }
    if (query.maxAmount !== undefined) {
      filters.push(lte(ordersTable.amount, String(query.maxAmount)));
    }
    const search = query.search?.trim();
    if (search) {
      filters.push(or(
        ilike(ordersTable.id, `%${search}%`),
        ilike(ordersTable.customerEmail, `%${search}%`),
        ilike(ordersTable.customerName, `%${search}%`),
        ilike(ordersTable.fromAsset, `%${search}%`),
        ilike(ordersTable.fromNetwork, `%${search}%`),
        ilike(ordersTable.toAsset, `%${search}%`),
        ilike(ordersTable.toNetwork, `%${search}%`),
        ilike(ordersTable.paymentMethod, `%${search}%`),
        ilike(ordersTable.payoutMethod, `%${search}%`),
        ilike(ordersTable.status, `%${search}%`),
        ilike(ordersTable.manualSettlementState, `%${search}%`),
        ilike(ordersTable.providerReference, `%${search}%`),
        ilike(ordersTable.providerOrderId, `%${search}%`),
        ilike(ordersTable.clientRequestId, `%${search}%`),
        ilike(ordersTable.providerState, `%${search}%`),
        ilike(ordersTable.destinationAddress, `%${search}%`),
        ilike(ordersTable.destinationMemo, `%${search}%`),
        ilike(ordersTable.refundAddress, `%${search}%`),
        ilike(ordersTable.refundMemo, `%${search}%`),
        ilike(ordersTable.depositAddress, `%${search}%`),
        ilike(ordersTable.depositMemo, `%${search}%`),
      )!);
    }
    const where = filters.length ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.pageSize;
    const measureQuery = async <T>(run: () => Promise<T>) => {
      const startedAt = performance.now();
      const result = await run();
      return {
        result,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      };
    };
    const [
      { result: rows, durationMs: rowsQueryMs },
      { result: [{ total }], durationMs: countQueryMs },
    ] = await Promise.all([
      measureQuery(async () => db.select().from(ordersTable)
          .where(where)
          .orderBy(
            query.sortDirection === "asc" ? asc(ordersTable.createdAt) : desc(ordersTable.createdAt),
            query.sortDirection === "asc" ? asc(ordersTable.id) : desc(ordersTable.id),
          )
          ),
      measureQuery(async () => db.select({ total: count() }).from(ordersTable).where(where)),
    ]);
    const activeFilters = [
      query.status ? "status" : undefined,
      query.archived !== "active" ? "archived" : undefined,
      query.type ? "type" : undefined,
      query.providerState ? "providerState" : undefined,
      query.fromAsset ? "fromAsset" : undefined,
      query.fromNetwork ? "fromNetwork" : undefined,
      query.toAsset ? "toAsset" : undefined,
      query.toNetwork ? "toNetwork" : undefined,
      query.rateMode ? "rateMode" : undefined,
      query.outcomeUnknown ? "outcomeUnknown" : undefined,
      query.createdFrom ? "createdFrom" : undefined,
      query.createdTo ? "createdTo" : undefined,
      query.minAmount !== undefined ? "minAmount" : undefined,
      query.maxAmount !== undefined ? "maxAmount" : undefined,
      search ? "search" : undefined,
    ].filter((filter): filter is string => filter !== undefined);
    req.log.info({
      event: "order_directory_db_timing",
      activeFilters,
      sortDirection: query.sortDirection,
      page: query.page,
      pageSize: query.pageSize,
      rowsReturned: rows.length,
      totalRows: total,
      rowsQueryMs,
      countQueryMs,
    }, "Order directory database queries completed");
    const merged = await mergeOperatorOrderDirectory(rows.map(outputOrder), query);
    res.json(GetOrdersResponse.parse({
      items: merged.items,
      total: merged.total,
      page: query.page,
      pageSize: query.pageSize,
      refreshUnavailable: false,
      providerFreshness: { state: "unavailable", syncing: false },
    }));
  } catch (error) { next(error); }
});

router.get("/orders/:id", requireOperator, async (req, res, next) => {
  try {
    const { id } = GetOrderParams.parse(req.params);
    const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const result = await findProviderManagedOperatorOrder(id) ??
      (row ? outputOrder(row) : undefined);
    if (!result) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    const verifiedFunding = await getVerifiedFundingTransaction(id);
    const [support] = await db.select().from(orderSupportMetadataTable)
      .where(eq(orderSupportMetadataTable.orderId, id)).limit(1);
    res.json(GetOrderResponse.parse({
      ...(support ? { ...result, ...outputSupportMetadata(support) } : result),
      verifiedFundingTransaction: verifiedFunding,
      transactionHash: row?.type === "manual" ? null : (support?.transactionHash ?? (result as { transactionHash?: string | null }).transactionHash ?? null),
    }));
  } catch (error) { next(error); }
});

router.patch("/orders/:id/support-tools", requirePermission("orders.details"), requirePermission("orders.support_tools"), async (req, res, next) => {
  try {
    const { id } = UpdateOrderSupportToolsParams.parse(req.params);
    const input = UpdateOrderSupportToolsBody.parse(req.body);
    const actor = res.locals.operator as OperatorAuthorization;
    const updated = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
      if (!existing) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
      if (existing.recordVersion !== input.recordVersion) {
        throw new ApiError("ORDER_UPDATE_CONFLICT", "The order changed concurrently. Reload it before saving.", 409);
      }
      let assignee: { id: string } | undefined;
      if (input.assignedOperatorId) {
        [assignee] = await tx.select({ id: operatorsTable.id }).from(operatorsTable)
          .where(and(eq(operatorsTable.id, input.assignedOperatorId), eq(operatorsTable.status, "active"))).limit(1);
        if (!assignee) throw new ApiError("ASSIGNEE_NOT_ELIGIBLE", "The assignee must be an active operator.", 422);
      }
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
        assignedOperatorId: assignee?.id ?? null,
        note: input.note,
      };
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
      for (const [key, newValue] of Object.entries(fields)) {
        const oldValue = (existing as Record<string, unknown>)[key];
        if (oldValue !== newValue) changes[key] = { oldValue: oldValue ?? null, newValue };
      }
      const can = (permission: PermissionKey) =>
        actor.role === "owner" || actor.effectivePermissions.includes(permission);
      if (changes.assignedOperatorId && !can("orders.assign")) {
        throw new ApiError("PERMISSION_ACCESS_DENIED", "The signed-in operator does not have permission for this action.", 403);
      }
      if (changes.note && !can("orders.notes")) {
        throw new ApiError("PERMISSION_ACCESS_DENIED", "The signed-in operator does not have permission for this action.", 403);
      }
      if (Object.keys(changes).length === 0) return existing;
      const [next] = await tx.update(ordersTable).set({
        ...fields,
        recordVersion: existing.recordVersion + 1,
        updatedAt: new Date(),
      }).where(and(eq(ordersTable.id, id), eq(ordersTable.recordVersion, input.recordVersion))).returning();
      if (!next) throw new ApiError("ORDER_UPDATE_CONFLICT", "The order changed concurrently. Reload it before saving.", 409);
      await tx.insert(orderAuditLogsTable).values({
        orderId: id, action: "order.support_tools_updated", actorType: "operator",
        actorId: actor.id, requestId: String(req.id ?? ""),
        previousVersion: existing.recordVersion, nextVersion: next.recordVersion,
        details: { changes },
      });
      return next;
    });
    const rawOrder = outputOrder(updated);
    return res.json(UpdateOrderSupportToolsResponse.parse(rawOrder));
  } catch (error) {
    return next(error);
  }
});

async function requireOrderForOwnerMutation(
  id: string,
  recordVersion: number,
) {
  if (await isProviderManagedOrder(id)) {
    throw new ApiError(
      "PROVIDER_ORDER_READ_ONLY",
      "Provider-managed orders are read-only in the Manual operations workspace.",
      409,
    );
  }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) {
    throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
  }
  if (order.recordVersion !== recordVersion) {
    throw new ApiError("ORDER_UPDATE_CONFLICT", "The order changed concurrently. Reload it before saving.", 409);
  }
  return order;
}

router.post("/orders/:id/assignment", requireOwner, async (req, res, next) => {
  try {
    const { id } = AssignOrderParams.parse(req.params);
    const input = AssignOrderBody.parse(req.body);
    const existing = await requireOrderForOwnerMutation(id, input.recordVersion);
    if (existing.archivedAt) {
      throw new ApiError("ORDER_ARCHIVED", "Restore the order before assigning it.", 409);
    }
    let assignee: { id: string; email: string } | undefined;
    if (input.assigneeOperatorId) {
      [assignee] = await db.select({ id: operatorsTable.id, email: operatorsTable.email })
        .from(operatorsTable)
        .where(and(eq(operatorsTable.id, input.assigneeOperatorId), eq(operatorsTable.status, "active")))
        .limit(1);
      if (!assignee) throw new ApiError("ASSIGNEE_NOT_ELIGIBLE", "The assignee must be an active operator.", 422);
    }
    const actor = res.locals.operator as OperatorAuthorization;
    const updated = await updateOrderAndQueueStatusNotification(existing, {
      assignedOperatorId: assignee?.id ?? null,
    }, undefined, {
      action: assignee ? "order.assigned" : "order.unassigned",
      actorType: "operator", actorId: actor.id, requestId: String(req.id ?? ""),
      details: {
        previousAssigneeOperatorId: existing.assignedOperatorId,
        assigneeOperatorId: assignee?.id ?? null,
        assigneeEmail: assignee?.email ?? null,
      },
    });
    if (!updated) throw new ApiError("ORDER_UPDATE_CONFLICT", "The order changed concurrently. Reload it before saving.", 409);
    res.json(AssignOrderResponse.parse(outputOrder(updated)));
  } catch (error) { next(error); }
});

router.post("/orders/bulk/archive", requireOwner, async (req, res, next) => {
  try {
    const input = BulkArchiveOrdersBody.parse(req.body);
    assertUniqueBulkOrderIds(input.items);
    const operator = res.locals.operator as OperatorAuthorization;
    const results = [];
    for (const item of input.items) {
      try {
        const existing = await loadBulkOrder(item);
        if (input.archived ? Boolean(existing.archivedAt) : !existing.archivedAt) {
          throw new ApiError(
            input.archived ? "ORDER_ALREADY_ARCHIVED" : "ORDER_NOT_ARCHIVED",
            input.archived
              ? "The order is already archived."
              : "The order is not archived.",
            409,
          );
        }
        const updated = await updateOrderAndQueueStatusNotification(existing, {
          archivedAt: input.archived ? new Date() : null,
          archivedBy: input.archived ? operator.id : null,
        }, undefined, {
          action: input.archived ? "order.archived" : "order.restored",
          actorType: "operator",
          actorId: operator.id,
          requestId: req.id == null ? null : String(req.id),
          details: input.archived
            ? { archivedBy: operator.id, bulk: true }
            : { previousArchivedBy: existing.archivedBy, bulk: true },
        });
        if (!updated) {
          throw new ApiError(
            "ORDER_UPDATE_CONFLICT",
            "The order changed concurrently. Reload it before saving.",
            409,
          );
        }
        results.push({ id: item.id, success: true, order: outputOrder(updated) });
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        results.push(bulkMutationFailure(item.id, error));
      }
    }
    res.json(BulkArchiveOrdersResponse.parse({ results }));
  } catch (error) {
    next(error);
  }
});

router.post("/orders/bulk/delete", requireOwner, async (req, res, next) => {
  try {
    const input = PermanentlyDeleteOrdersBody.parse(req.body);
    assertUniqueBulkOrderIds(input.items);
    const actor = res.locals.operator as OperatorAuthorization;
    const results = [];

    for (const item of input.items) {
      try {
        if (await isProviderManagedOrder(item.id)) {
          throw new ApiError(
            "PROVIDER_ORDER_READ_ONLY",
            "Provider-managed orders are read-only in the Manual operations workspace.",
            409,
          );
        }

        await db.transaction(async (tx) => {
          const [existing] = await tx.select().from(ordersTable)
            .where(eq(ordersTable.id, item.id))
            .limit(1)
            .for("update");
          if (!existing) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
          if (existing.recordVersion !== item.recordVersion) {
            throw new ApiError(
              "ORDER_UPDATE_CONFLICT",
              "The order changed concurrently. Reload it before deleting.",
              409,
            );
          }
          if (!existing.archivedAt) {
            throw new ApiError(
              "ORDER_NOT_ARCHIVED",
              "Only archived orders can be permanently deleted.",
              409,
            );
          }

          const [protectedDepositAddress] = await tx.select({ id: whitebitOrderAddressesTable.id })
            .from(whitebitOrderAddressesTable)
            .where(eq(whitebitOrderAddressesTable.orderId, item.id))
            .limit(1);
          if (protectedDepositAddress) {
            throw new ApiError(
              "ORDER_HAS_PROTECTED_DEPOSIT_RECORDS",
              "This archived order has protected deposit records and cannot be permanently deleted.",
              409,
            );
          }
          await tx.delete(orderSupportMetadataTable)
            .where(eq(orderSupportMetadataTable.orderId, item.id));
          await tx.insert(orderAuditLogsTable).values({
            orderId: item.id,
            action: "order.permanently_deleted",
            actorType: "operator",
            actorId: actor.id,
            requestId: req.id == null ? null : String(req.id),
            previousVersion: existing.recordVersion,
            nextVersion: existing.recordVersion,
            details: { archivedAt: existing.archivedAt.toISOString(), archivedBy: existing.archivedBy },
          });
          const deleted = await tx.delete(ordersTable).where(and(
            eq(ordersTable.id, item.id),
            eq(ordersTable.recordVersion, item.recordVersion),
            isNotNull(ordersTable.archivedAt),
          )).returning({ id: ordersTable.id });
          if (!deleted.length) {
            throw new ApiError(
              "ORDER_UPDATE_CONFLICT",
              "The order changed concurrently. Reload it before deleting.",
              409,
            );
          }
        });
        results.push({ id: item.id, success: true });
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        results.push(bulkMutationFailure(item.id, error));
      }
    }

    res.json(PermanentlyDeleteOrdersResponse.parse({ results }));
  } catch (error) {
    next(error);
  }
});

router.post("/orders/:id/archive", requireOwner, async (req, res, next) => {
  try {
    const { id } = ArchiveOrderParams.parse(req.params);
    const input = ArchiveOrderBody.parse(req.body);
    const existing = await requireOrderForOwnerMutation(id, input.recordVersion);
    if (existing.archivedAt) throw new ApiError("ORDER_ALREADY_ARCHIVED", "The order is already archived.", 409);
    const actor = res.locals.operator as OperatorAuthorization;
    const updated = await updateOrderAndQueueStatusNotification(existing, {
      archivedAt: new Date(), archivedBy: actor.id,
    }, undefined, {
      action: "order.archived", actorType: "operator", actorId: actor.id, requestId: String(req.id ?? ""),
      details: { archivedBy: actor.id },
    });
    if (!updated) throw new ApiError("ORDER_UPDATE_CONFLICT", "The order changed concurrently. Reload it before saving.", 409);
    res.json(ArchiveOrderResponse.parse(outputOrder(updated)));
  } catch (error) { next(error); }
});

router.post("/orders/:id/restore", requireOwner, async (req, res, next) => {
  try {
    const { id } = RestoreOrderParams.parse(req.params);
    const input = RestoreOrderBody.parse(req.body);
    const existing = await requireOrderForOwnerMutation(id, input.recordVersion);
    if (!existing.archivedAt) throw new ApiError("ORDER_NOT_ARCHIVED", "The order is not archived.", 409);
    const actor = res.locals.operator as OperatorAuthorization;
    const updated = await updateOrderAndQueueStatusNotification(existing, {
      archivedAt: null, archivedBy: null,
    }, undefined, {
      action: "order.restored", actorType: "operator", actorId: actor.id, requestId: String(req.id ?? ""),
      details: { previousArchivedBy: existing.archivedBy },
    });
    if (!updated) throw new ApiError("ORDER_UPDATE_CONFLICT", "The order changed concurrently. Reload it before saving.", 409);
    res.json(RestoreOrderResponse.parse(outputOrder(updated)));
  } catch (error) { next(error); }
});

router.get("/orders/:id/audit-log", requireOperator, async (req, res, next) => {
  try {
    const { id } = GetOrderAuditLogParams.parse(req.params);
    const rows = await db.select({
      id: orderAuditLogsTable.id, action: orderAuditLogsTable.action,
      actorType: orderAuditLogsTable.actorType, actorId: orderAuditLogsTable.actorId,
      actorEmail: operatorsTable.email, previousVersion: orderAuditLogsTable.previousVersion,
      nextVersion: orderAuditLogsTable.nextVersion, details: orderAuditLogsTable.details,
      createdAt: orderAuditLogsTable.createdAt,
    }).from(orderAuditLogsTable).leftJoin(
      operatorsTable, sql`${orderAuditLogsTable.actorId} = ${operatorsTable.id}::text`,
    ).where(eq(orderAuditLogsTable.orderId, id))
      .orderBy(asc(orderAuditLogsTable.createdAt), asc(orderAuditLogsTable.id));
    res.json(GetOrderAuditLogResponse.parse(rows.map((row) => ({
      ...row, actorId: row.actorId ?? null, actorEmail: row.actorEmail ?? null,
      createdAt: row.createdAt.toISOString(),
    }))));
  } catch (error) { next(error); }
});

router.get("/orders/:id/status", async (req, res, next) => {
  try {
    const params = GetPublicOrderStatusParams.parse(req.params);
    const query = GetPublicOrderStatusQueryParams.parse(req.query);
    let [row] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, params.id))
      .limit(1);
    if (!row) {
      throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    }

    const providerFreshness = { state: "unavailable" as const, syncing: false };
    const canViewDeposit = verifyOrderTrackingToken(
      query.trackingToken,
      row.id,
    );

    const verifiedFunding = await getVerifiedFundingTransaction(row.id);
    res.json(
      GetPublicOrderStatusResponse.parse({
        id: row.id,
        type: row.type,
        status: row.status,
        fromAsset: row.fromAsset,
        fromNetwork: row.fromNetwork || undefined,
        sourceSettlementOptionId: row.sourceSettlementOptionId || undefined,
        toAsset: row.toAsset,
        toNetwork: row.toNetwork || undefined,
        targetSettlementOptionId: row.targetSettlementOptionId || undefined,
        amount: row.amount,
        receiveAmount: row.receiveAmount,
         depositAddress: canViewDeposit && ["ready_whitebit", "ready_manual"].includes(row.fundingStatus)
           ? (row.depositAddress || undefined) : undefined,
         depositMemo: canViewDeposit && ["ready_whitebit", "ready_manual"].includes(row.fundingStatus)
           ? row.depositMemo || undefined : undefined,
         refundAddress: canViewDeposit ? row.refundAddress || undefined : undefined,
         refundMemo: canViewDeposit ? row.refundMemo || undefined : undefined,
        manualSettlementState: row.type === "manual" ? row.manualSettlementState : undefined,
        customerSafeNote: row.type === "manual" ? row.customerSafeNote || undefined : undefined,
        fundingStatus: row.type === "manual" ? row.fundingStatus : undefined,
        fundingSource: row.type === "manual" ? row.fundingProviderSource : undefined,
        fundingError: row.type === "manual" && row.fundingStatus === "unresolved"
          ? "Deposit address provisioning is pending operator recovery." : undefined,
         fundingDetails: canViewDeposit && row.type === "manual" && ["ready_whitebit", "ready_manual"].includes(row.fundingStatus)
          ? customerSafeFundingDetails(row.fundingDetailsSnapshot, row.fundingStatus) ?? undefined : undefined,
          settlementDetails: canViewDeposit && row.type === "manual"
          ? row.settlementDetails ?? undefined : undefined,
         paymentDetails: canViewDeposit && isApplicablePaymentDetailsOrder(row)
           ? row.paymentDetails ?? undefined : undefined,
         paymentDetailsApplicable: isApplicablePaymentDetailsOrder(row),
         sourcePaymentMethod: outputSourcePaymentMethod(row),
         customerMarkedPaidAt: row.customerMarkedPaidAt?.toISOString() ?? null,
        completedAt: /^(?:completed|complete|done|finished)$/i.test(row.status.trim()) ? row.updatedAt.toISOString() : null,
        exchangeRate: row.finalRate ?? row.exchangeRateOverride ?? undefined,
         transactionHash: canViewDeposit ? exposeLegacyTransactionHash(row.type, row.transactionHash) : undefined,
        paymentReference: canViewDeposit ? row.paymentReference || undefined : undefined,
         verifiedFundingTransaction: canViewDeposit && row.type === "manual" ? verifiedFunding : undefined,
        rateMode: orderRateMode(row),
        outcomeUnknown: row.outcomeUnknown,
        refreshUnavailable: false,
        providerFreshness: { state: "unavailable", syncing: false },
        createdAt: row.createdAt.toISOString(),
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.get("/account/orders", requireCustomer, async (req, res, next) => {
  try {
    const query = GetCustomerOrdersQueryParams.parse(req.query);
    const customerClerkUserId = String(res.locals.customerClerkUserId);
    const ownership = eq(
      ordersTable.customerClerkUserId,
      customerClerkUserId,
    );
    const providerFreshness = { state: "unavailable" as const, syncing: false };
    const rows = await db
      .select()
      .from(ordersTable)
      .where(and(ownership, eq(ordersTable.type, "manual")))
      .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id));
    const isRefreshUnavailable = false;

    const merged = await mergeCustomerOrderHistory(
      await Promise.all(rows.map(async (row) =>
        outputCustomerOrder(row, isRefreshUnavailable, await getVerifiedFundingTransaction(row.id)))),
      customerClerkUserId,
      query.page,
      query.pageSize,
    );
    res.json(
      GetCustomerOrdersResponse.parse({
        items: merged.items,
        total: merged.total,
        page: query.page,
        pageSize: query.pageSize,
        refreshUnavailable: isRefreshUnavailable,
        providerFreshness,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/account/orders/claim", requireCustomer, async (req, res, next) => {
  try {
    const input = ClaimCustomerOrderBody.parse(req.body);
    const customerClerkUserId = String(res.locals.customerClerkUserId);
    const verifiedEmail = (
      await getCustomerVerifiedEmail(customerClerkUserId)
    )?.trim().toLowerCase() ?? null;
    if (!verifiedEmail) {
      throw new ApiError(
        "ORDER_CLAIM_UNAVAILABLE",
        "This order reference is invalid or unavailable.",
        404,
      );
    }
    await requireActiveCustomerIdentity(customerClerkUserId, verifiedEmail);
    const now = new Date();
    let row = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(ordersTable)
        .set({
          customerClerkUserId,
          customerOwnershipSource: "verified_email_claim",
          customerClaimedAt: now,
          recordVersion: sql`${ordersTable.recordVersion} + 1`,
        })
        .where(
          and(
            eq(ordersTable.id, input.orderId.trim()),
            isNull(ordersTable.customerClerkUserId),
            sql`lower(${ordersTable.customerEmail}) = ${verifiedEmail}`,
          ),
        )
        .returning();
      if (claimed) {
        await tx.insert(orderAuditLogsTable).values({
          orderId: claimed.id,
          action: "order.customer_claimed",
          actorType: "customer",
          actorId: customerClerkUserId,
          requestId: req.id == null ? null : String(req.id),
          previousVersion: claimed.recordVersion - 1,
          nextVersion: claimed.recordVersion,
          details: { ownershipSource: "verified_email" },
        });
      }
      return claimed;
    });

    if (!row) {
      [row] = await db
        .select()
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.id, input.orderId.trim()),
            eq(ordersTable.customerClerkUserId, customerClerkUserId),
          ),
        )
        .limit(1);
    }
    if (!row) {
      throw new ApiError(
        "ORDER_CLAIM_UNAVAILABLE",
        "This order reference is invalid or unavailable.",
        404,
      );
    }

    const providerFreshness = { state: "unavailable" as const, syncing: false };
    res.json(
      GetCustomerOrderResponse.parse(
        outputCustomerOrder(row, false, await getVerifiedFundingTransaction(row.id)),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.get("/account/orders/:id", requireCustomer, async (req, res, next) => {
  try {
    const params = GetCustomerOrderParams.parse(req.params);
    const customerClerkUserId = String(res.locals.customerClerkUserId);
    let [row] = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, params.id),
          eq(ordersTable.customerClerkUserId, customerClerkUserId),
        ),
      )
      .limit(1);
    const result = await findProviderManagedCustomerOrder(
      params.id,
      customerClerkUserId,
    ) ?? (row ? outputCustomerOrder(row, false, await getVerifiedFundingTransaction(row.id)) : undefined);
    if (!result) {
      throw new ApiError("CUSTOMER_ORDER_NOT_FOUND", "Order not found.", 404);
    }

    const providerFreshness = { state: "unavailable" as const, syncing: false };

    res.json(
      GetCustomerOrderResponse.parse(
        result,
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/account/orders/:id/notifications",
  requireCustomer,
  async (req, res, next) => {
    try {
      const params = UpdateCustomerOrderNotificationsParams.parse(req.params);
      const input = UpdateCustomerOrderNotificationsBody.parse(req.body);
      const customerClerkUserId = String(res.locals.customerClerkUserId);
      const [ownedOrder] = await db
        .select()
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.id, params.id),
            eq(ordersTable.customerClerkUserId, customerClerkUserId),
          ),
        )
        .limit(1);
      if (!ownedOrder) {
        throw new ApiError(
          "CUSTOMER_ORDER_NOT_FOUND",
          "Order not found.",
          404,
        );
      }
      if (
        input.enabled &&
        !(await getCustomerVerifiedEmail(customerClerkUserId))
      ) {
        throw new ApiError(
          "CUSTOMER_VERIFIED_EMAIL_REQUIRED",
          "Verify an email address on your account before enabling notifications.",
          422,
        );
      }
      const updated = await updateOrderAndQueueStatusNotification(
        ownedOrder,
        { statusNotificationsEnabled: input.enabled },
        eq(ordersTable.customerClerkUserId, customerClerkUserId),
        {
          action: "order.notifications_changed",
          actorType: "customer",
          actorId: customerClerkUserId,
          requestId: req.id == null ? null : String(req.id),
        },
      );
      if (!updated) {
        throw new ApiError(
          "ORDER_UPDATE_CONFLICT",
          "The order changed concurrently. Retry the update.",
          409,
        );
      }
      res.json(UpdateCustomerOrderNotificationsResponse.parse({
        orderId: updated.id,
        statusNotificationsEnabled: updated.statusNotificationsEnabled,
      }));
    } catch (error) {
      return next(error);
    }
  },
);

type CustomerEmailInput = { customerEmail?: string };
type ResolvedCustomerEmailInput<T extends CustomerEmailInput> =
  Omit<T, "customerEmail"> & { customerEmail: string };

async function resolveCustomerOrderIdentity<T extends CustomerEmailInput>(
  req: Request,
  input: T,
): Promise<{
  input: ResolvedCustomerEmailInput<T>;
  customerClerkUserId: string | null;
}> {
  const customerClerkUserId = getCustomerActorUserId(req);
  if (customerClerkUserId) {
    const verifiedEmail = await getCustomerVerifiedEmail(customerClerkUserId);
    if (!verifiedEmail) {
      throw new ApiError(
        "CUSTOMER_VERIFIED_EMAIL_REQUIRED",
        "Verify an email address on your account before creating an order.",
        422,
      );
    }
    await requireActiveCustomerIdentity(customerClerkUserId, verifiedEmail);
    return {
      input: { ...input, customerEmail: verifiedEmail },
      customerClerkUserId,
    };
  }

  const customerEmail = input.customerEmail?.trim();
  if (!customerEmail) {
    throw new ApiError(
      "CUSTOMER_EMAIL_REQUIRED",
      "A contact email is required for anonymous orders.",
      400,
    );
  }
  return {
    input: { ...input, customerEmail },
    customerClerkUserId: null,
  };
}

type ParsedOrderInput = ResolvedCustomerEmailInput<
  ReturnType<typeof CreateOrderBody.parse>
>;
type OrderResult = {
  status: number;
  body: ReturnType<typeof outputOrder>;
};

async function existingOrderResult(
  row: typeof ordersTable.$inferSelect,
  input: Parameters<typeof assertIdempotentOrderMatches>[1],
  matchQuoteId: boolean,
): Promise<OrderResult> {
  assertIdempotentOrderMatches(row, input, matchQuoteId);
  if (row.type === "manual" && row.fundingStatus === "provisioning") {
    row = (await finalizeSwapFundingFromClaim(row.id)) ?? row;
  }
  return {
    status: row.status === "creating" || row.outcomeUnknown || row.fundingStatus === "provisioning" ? 202 : 200,
    body: outputOrder(row),
  };
}

async function validateManualOrderDetails(input: {
  type: string;
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  destinationAddress?: string;
  destinationMemo?: string;
  refundAddress?: string | null;
  refundMemo?: string | null;
}, requiresStableSettlement: boolean, fiatToCrypto: boolean) {
  // Legacy v1 manual tickets predate crypto settlement options and did not
  // collect payout wallet details. Keep those already-issued/direct flows
  // readable while requiring them for the explicit v2 crypto route.
  if (input.type !== "manual" || !requiresStableSettlement) return;
  const target = await findManualCryptoNetwork(input.toAsset, input.toNetwork);
  if (target) {
    if (!input.destinationAddress?.trim()) {
      throw new ApiError("MANUAL_DESTINATION_ADDRESS_REQUIRED", "A destination wallet address is required for this crypto network.", 400);
    }
    if (!isSyntacticallyValidManualWalletAddress(target.network, input.destinationAddress)) {
      throw new ApiError("MANUAL_DESTINATION_ADDRESS_INVALID", "The destination wallet address is not valid for the selected network.", 400);
    }
    if (target.network.requiresMemo && !fiatToCrypto && !input.destinationMemo?.trim()) {
      throw new ApiError("MANUAL_DESTINATION_MEMO_REQUIRED", "A destination memo is required for this crypto network.", 400);
    }
    if (
      target.network.requiresMemo &&
      input.destinationMemo?.trim() &&
      !isSyntacticallyValidManualWalletMemo(target.network, input.destinationMemo)
    ) {
      throw new ApiError("MANUAL_DESTINATION_MEMO_INVALID", "The destination memo is not valid for the selected network.", 400);
    }
  }
  const source = await findManualCryptoNetwork(input.fromAsset, input.fromNetwork);
  if (source) {
    const refundAddress = input.refundAddress?.trim() ?? "";
    const refundMemo = input.refundMemo?.trim() ?? "";
    if (refundMemo && !refundAddress) {
      throw new ApiError("MANUAL_REFUND_MEMO_WITHOUT_ADDRESS", "A refund memo requires a refund address.", 400);
    }
    if (refundAddress) {
      if (!isSyntacticallyValidManualWalletAddress(source.network, refundAddress)) {
        throw new ApiError("MANUAL_REFUND_ADDRESS_INVALID", "The refund wallet address is not valid for the selected network.", 400);
      }
      if (source.network.requiresMemo && !refundMemo) {
        throw new ApiError("MANUAL_REFUND_MEMO_REQUIRED", "A refund memo is required for this crypto network.", 400);
      }
      if (source.network.requiresMemo && !isSyntacticallyValidManualWalletMemo(source.network, refundMemo)) {
        throw new ApiError("MANUAL_REFUND_MEMO_INVALID", "The refund memo is not valid for the selected network.", 400);
      }
    }
  }
}

async function createOrderFromInput(
  input: ParsedOrderInput,
  matchQuoteId = true,
  customerClerkUserId: string | null = null,
): Promise<OrderResult> {
  if (input.type !== "manual") throw new ApiError("MANUAL_SWAP_REQUIRED", "Only Manual desk swaps are available.", 422);
  await ensureSeed();
  const [prior] = await db.select().from(ordersTable)
    .where(eq(ordersTable.clientRequestId, input.clientRequestId)).limit(1);
  if (prior) {
    return existingOrderResult(prior, input, matchQuoteId);
  }

  const quote = verifyQuoteTicket(input.quoteId, input);
  if (quote.type === "manual" && quote.manualOrderCreationDisabled) {
    throw new ApiError(
      "SETTLEMENT_OPTION_REQUIRED",
      "Choose the exact sending and receiving settlement options before creating this order.",
      400,
    );
  }
  await revalidateManualDeskQuoteRoute(quote);
  const fiatToCrypto = quote.settlementSnapshot?.source?.kind === "fiat-payment-method" &&
    quote.settlementSnapshot?.target?.kind === "crypto-network";
  const settlementDetails = quote.v === 2
    ? validateSettlementDetails(
        quote.settlementSnapshot?.requiredFields ?? [],
        input.settlementDetails,
      )
    : undefined;
  await validateManualOrderDetails(input, quote.v === 2, fiatToCrypto);

  const createdAt = new Date();
  const sourceSnapshot = quote.settlementSnapshot?.source;
  const manualFunding = quote.settlementSnapshot?.funding;
  const selectedDepositProvider = (manualFunding as (typeof manualFunding & { depositProvider?: string }) | undefined)?.depositProvider ?? "manual";
  // Selection is authoritative: availability checks belong inside the
  // idempotent adapter, where they can be recorded and safely fallback.
  const providerFundingCandidate = selectedDepositProvider === "whitebit";
  const providerUnavailable = selectedDepositProvider === "none";
  const initialFunding = providerFundingCandidate
    ? {
        ...manualFunding,
        address: "",
        memo: "",
        manualFallbackAddress: manualFunding?.address ?? "",
        manualFallbackMemo: manualFunding?.memo ?? "",
        source: "whitebit",
        selectedProvider: "whitebit",
        addressSource: "unavailable",
        status: "provisioning",
      }
    : providerUnavailable
      ? {
          ...manualFunding,
          address: "",
          memo: "",
          source: "none",
          selectedProvider: "none",
          addressSource: "unavailable",
          status: "unavailable",
        }
      : manualFunding
        ? {
            ...manualFunding,
            warning: manualFunding.warning === ROUTE_UNAVAILABLE_WARNING
              ? ""
              : manualFunding.warning,
            source: "manual",
            selectedProvider: "manual",
            addressSource: "manual_only",
            status: "ready",
          }
        : undefined;
  const id = `O${randomInt(0, 1_000_000_000).toString().padStart(9, "0")}`;
  const intent = {
    id, type: "manual", status: "awaiting funds",
    statusNotificationsEnabled: true,
    manualSettlementState: "awaiting_funds",
    manualSettlementStateUpdatedAt: createdAt,
    manualSettlementStartedAt: createdAt,
    fromAsset: quote.fromAsset, fromNetwork: quote.fromNetwork,
    toAsset: quote.toAsset, toNetwork: quote.toNetwork,
    amount: String(quote.amount), receiveAmount: String(quote.receiveAmount),
    customerEmail: input.customerEmail, customerName: input.customerName ?? "Guest",
    destinationAddress: input.destinationAddress ?? "",
    destinationMemo: input.destinationMemo ?? "",
    refundAddress: input.refundAddress ?? "", refundMemo: input.refundMemo ?? "",
    depositAddress: providerFundingCandidate || providerUnavailable ? "" : (manualFunding?.address ?? ""),
    depositMemo: providerFundingCandidate || providerUnavailable ? "" : (manualFunding?.memo ?? ""),
    paymentMethod: input.paymentMethod ?? "", payoutMethod: input.payoutMethod ?? "",
    pricingRuleId: quote.pricingRuleId,
    pricingRuleVersion: quote.pricingRuleVersion,
    pricingRuleName: quote.pricingRuleName ?? "",
    grossMarketAmount: String(quote.grossMarketAmount),
    percentageCommission: String(quote.percentageCommission),
    fixedCommission: String(quote.fixedCommission),
    totalCommission: String(quote.totalFee),
    finalRate: String(quote.rate),
    pricingSnapshot: quote.pricingSnapshot,
    sourceSettlementOptionId: quote.sourceSettlementOptionId,
    targetSettlementOptionId: quote.targetSettlementOptionId,
    settlementSnapshot: initialFunding && quote.settlementSnapshot
      ? { ...quote.settlementSnapshot, funding: initialFunding }
      : quote.settlementSnapshot,
    settlementDetails,
    fundingDetailsSnapshot: initialFunding,
    customerDetailsSnapshot: {
      destinationAddress: input.destinationAddress ?? "",
      destinationMemo: input.destinationMemo ?? "",
      settlementDetails: settlementDetails ?? {},
    },
    fundingStatus: providerFundingCandidate ? "provisioning" : providerUnavailable ? "unresolved" : "ready_manual",
    fundingProviderSource: selectedDepositProvider === "none" ? "none" : providerFundingCandidate ? "whitebit" : "manual",
    fundingProviderError: null,
    provider: quote.provider, note: input.note ?? "",
    rateMode: "",
    providerState: "",
    quoteId: input.quoteId, clientRequestId: input.clientRequestId,
    customerClerkUserId,
    customerOwnershipSource: customerClerkUserId
      ? "authenticated_create"
      : "",
    outcomeUnknown: false, createdAt,
  };
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.clientRequestId}))`);
    const [existing] = await tx.select().from(ordersTable)
      .where(eq(ordersTable.clientRequestId, input.clientRequestId)).limit(1);
    if (existing) return undefined;
    if (
      sourceSnapshot?.kind === "crypto-network" &&
      selectedDepositProvider === "manual"
    ) {
      const sourceRouteId = signedCryptoRouteId(sourceSnapshot);
      const [catalog] = await tx.select({
        route: cryptoAssetNetworksTable,
        asset: cryptoAssetsTable,
      }).from(cryptoAssetNetworksTable)
        .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
        .where(and(
          eq(cryptoAssetNetworksTable.id, sourceRouteId),
          eq(cryptoAssetsTable.code, sourceSnapshot.assetCode.toUpperCase()),
        )).for("update").limit(1);
      const networkCode = catalog?.route.networkCode ??
        (sourceSnapshot.networkCode ?? quote.fromNetwork).trim();
      const [monitorNetwork] = catalog
        ? await tx.select().from(blockchainMonitorNetworksTable)
          .where(eq(blockchainMonitorNetworksTable.networkCode, networkCode))
          .for("update").limit(1)
        : [];
      const [monitorAsset] = catalog && monitorNetwork
        ? await tx.select().from(blockchainMonitorAssetsTable).where(and(
          eq(blockchainMonitorAssetsTable.monitorNetworkId, monitorNetwork.id),
          eq(blockchainMonitorAssetsTable.assetNetworkId, catalog.route.id),
        )).for("update").limit(1)
        : [];
      const endpoint = monitorNetwork?.endpointSecretRef
        ? process.env[monitorNetwork.endpointSecretRef]
        : undefined;
      const apiKey = monitorNetwork?.apiKeySecretRef
        ? process.env[monitorNetwork.apiKeySecretRef]
        : undefined;
      const configDigest = monitorNetwork
        ? manualMonitoringNetworkConfigDigest({ network: monitorNetwork, endpoint, apiKey })
        : undefined;
      const routeDigest = monitorNetwork && monitorAsset
        ? manualMonitoringProofFingerprint({
          network: monitorNetwork,
          asset: monitorAsset,
          route: catalog!.route,
          endpoint,
          apiKey,
          capturedAt: monitorNetwork.healthProofCapturedAt ?? new Date(0),
          head: monitorNetwork.lastHead ?? "",
        })
        : undefined;
      const route = catalog?.route;
      const asset = catalog?.asset;
      const identityValid = Boolean(
        monitorAsset &&
        (
          monitorAsset.identityKind === "native"
            ? !monitorAsset.contractOrMint?.trim()
            : monitorAsset.identityKind === "token" &&
              isValidManualMonitoringTokenIdentity(
                monitorNetwork?.adapterKind ?? "",
                monitorAsset.contractOrMint,
              )
        ) &&
        monitorAsset.decimals === route?.decimals
      );
      const catalogEligible = Boolean(
        route &&
        asset &&
        asset.enabled &&
        asset.lifecycle !== "deprecated" &&
        route.enabled &&
        route.lifecycle !== "deprecated" &&
        route.executionMode === "manual" &&
        route.depositProvider === "manual" &&
        route.customerDepositsEnabled &&
        isSyntacticallyValidManualWalletAddress(route, route.sharedDepositAddress) &&
        (!route.requiresMemo ||
          Boolean(
            route.sharedDepositMemo &&
            isSyntacticallyValidManualWalletMemo(route, route.sharedDepositMemo),
          )),
      );
      const providerCompatible = Boolean(
        monitorNetwork &&
        (
          monitorNetwork.adapterKind === "evm" && monitorNetwork.providerKind === "rpc" ||
          monitorNetwork.adapterKind === "solana" && monitorNetwork.providerKind === "rpc" ||
          monitorNetwork.adapterKind === "tron" && monitorNetwork.providerKind === "indexer" ||
          monitorNetwork.adapterKind === "bitcoin" && monitorNetwork.providerKind === "rpc"
        ),
      );
      const ready = Boolean(
        catalogEligible &&
        route &&
        monitorNetwork &&
        monitorAsset &&
        identityValid &&
        isManualMonitoringRuntimeReady({
          routeId: route.id,
          routeNetworkCode: route.networkCode,
          monitorAssetRouteId: monitorAsset.assetNetworkId,
          monitorNetworkCode: monitorNetwork.networkCode,
          monitorChainId: monitorNetwork.chainId,
          assetEnabled: monitorAsset.enabled,
          networkEnabled: monitorNetwork.enabled,
          providerKind: monitorNetwork.providerKind,
          endpointConfigured: Boolean(endpoint),
          healthStatus: monitorNetwork.healthStatus,
          healthCheckedAtMs: monitorNetwork.healthCheckedAt?.getTime() ?? null,
          healthProofCapturedAtMs: monitorNetwork.healthProofCapturedAt?.getTime() ?? null,
          pollIntervalSeconds: monitorNetwork.pollIntervalSeconds,
          adapterKind: monitorNetwork.adapterKind,
          identityKind: monitorAsset.identityKind,
          contractOrMint: monitorAsset.contractOrMint,
          providerCompatible,
          receivingAddressValid: true,
          memoValid: true,
          readinessProofFingerprint: monitorAsset.readinessProofFingerprint,
          networkHealthProofFingerprint: monitorNetwork.healthProofFingerprint,
          networkDigest: configDigest,
          routeDigest,
        }),
      );
      if (!ready) {
        throw new ApiError(
          "DESK_CRYPTO_DEPOSIT_UNAVAILABLE",
          "The selected crypto deposit route is no longer ready. Refresh and try again.",
          409,
        );
      }
    }
    const [created] = await tx
      .insert(ordersTable)
      .values(intent)
      .onConflictDoNothing({ target: ordersTable.clientRequestId })
      .returning();
    if (!created) return undefined;
    await tx.insert(customersTable).values({
      id: `cus-${randomUUID()}`,
      name: intent.customerName,
      email: intent.customerEmail,
      ordersCount: 1,
      volume: intent.amount,
      lastActivity: createdAt,
    }).onConflictDoUpdate({
      target: customersTable.email,
      set: {
        ordersCount: sql`${customersTable.ordersCount} + 1`,
        volume: sql`${customersTable.volume} + ${intent.amount}`,
        lastActivity: createdAt,
      },
    });
    await tx.insert(orderAuditLogsTable).values({
      orderId: created.id,
      action: "order.created",
      actorType: customerClerkUserId ? "customer" : "system",
      actorId: customerClerkUserId,
      previousVersion: 0,
      nextVersion: created.recordVersion,
      details: { type: created.type },
    });
    const [notificationSettings] = await tx.select().from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.id, "global")).limit(1);
    // Queue created notifications through the existing outboxes. Admin
    // destinations remain disabled by default and require an explicit opt-in.
    if (
      created.type === "manual" &&
      created.customerEmail.trim() &&
      created.statusNotificationsEnabled &&
      customerEmailEventEnabled(notificationSettings, "order_created")
    ) {
      await tx.insert(customerStatusNotificationEventsTable).values({
        orderId: created.id,
        customerClerkUserId: created.customerClerkUserId ??
          `guest:${created.customerEmail.trim().toLowerCase()}`,
        fromStatus: "created",
        toStatus: created.status,
        statusVersion: created.statusVersion,
        eventKind: "order_created",
        recipientEmail: created.customerEmail.trim(),
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
    if (
      created.type === "manual" &&
      notificationSettings?.adminNotificationEmail &&
      adminEmailEventEnabled(notificationSettings, "order_created")
    ) {
      await tx.insert(customerStatusNotificationEventsTable).values({
        orderId: created.id,
        customerClerkUserId: `admin:${notificationSettings.adminNotificationEmail.toLowerCase()}`,
        fromStatus: "created",
        toStatus: created.status,
        statusVersion: created.statusVersion,
        eventKind: "order_created",
        recipientEmail: notificationSettings.adminNotificationEmail,
        adminRecipient: true,
        evidenceKey: `created:${created.id}:${created.statusVersion}`,
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
    if (created.type === "manual" && notificationSettings?.adminTelegramOrderCreatedEnabled) {
      await enqueueAdminSwapTelegramOrderCreatedNotification(tx, created);
    }
    if (providerFundingCandidate && sourceSnapshot?.kind === "crypto-network" && manualFunding) {
      await tx.insert(whitebitOrderAddressesTable).values({
        orderId: created.id,
        ticker: sourceSnapshot.assetCode.trim().toUpperCase(),
        providerTicker: sourceSnapshot.assetCode.trim().toUpperCase(),
        network: (sourceSnapshot.networkCode ?? quote.fromNetwork).trim().toUpperCase(),
        status: "claiming",
      }).onConflictDoNothing({ target: whitebitOrderAddressesTable.orderId });
    }
    if (
      created.type === "manual" &&
      created.fundingProviderSource === "manual" &&
      created.fundingStatus === "ready_manual"
    ) {
      await tx.insert(blockchainMonitorRegistrationGapsTable).values({
        orderId: created.id,
        networkCode: created.fromNetwork,
        assetCode: created.fromAsset,
        receivingAddress: created.depositAddress,
        reason: "Watch registration is pending.",
      }).onConflictDoNothing({
        target: blockchainMonitorRegistrationGapsTable.orderId,
      });
    }
    return created;
  });
  if (!inserted) {
    const [existing] = await db.select().from(ordersTable)
      .where(eq(ordersTable.clientRequestId, input.clientRequestId)).limit(1);
    if (!existing) throw new ApiError("IDEMPOTENCY_CONFLICT", "The existing order could not be loaded.", 409);
    try {
      await registerManualBlockchainWatch(existing.id, { freshCursor: true });
    } catch (error) {
      console.warn("Manual blockchain watch replay reconciliation failed", error);
    }
    return existingOrderResult(existing, input, matchQuoteId);
  }

  let finalOrder = inserted;
  // Registration is deliberately best-effort: an unconfigured network must
  // not make Manual Swap order creation fail. The immutable snapshot remains
  // in the order and can be registered by a later reconciliation pass.
  try {
    await registerManualBlockchainWatch(inserted.id, { freshCursor: true });
  } catch (error) {
    console.warn("Manual blockchain watch registration failed", error);
  }
  if (providerFundingCandidate && sourceSnapshot?.kind === "crypto-network" && manualFunding) {
    const [orderClaim] = await db.select({ claimToken: whitebitOrderAddressesTable.claimToken })
      .from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.orderId, inserted.id)).limit(1);
    const provisioned = await provisionSwapFundingAddress({
      orderId: inserted.id,
      assetCode: sourceSnapshot.assetCode,
      networkCode: sourceSnapshot.networkCode ?? quote.fromNetwork,
      manualAddress: manualFunding.address,
      manualMemo: manualFunding.memo,
      manualFallbackUsable: Boolean(manualFunding.address?.trim()) &&
        (!manualFunding.requiresMemo || Boolean(manualFunding.memo?.trim())),
      chosenWhitebit: true,
      expectedClaimToken: orderClaim?.claimToken ?? undefined,
    });
    // The provider helper owns the claim transition. Finalization below is
    // the single DB-only projection update used by replays/recovery too.
    void provisioned;
    const updated = await finalizeSwapFundingFromClaim(inserted.id);
    if (updated) finalOrder = updated;
    return { status: provisioned.unresolved ? 202 : 201, body: outputOrder(finalOrder) };
  }
  return { status: 201, body: outputOrder(finalOrder) };

}

router.post("/exchange/orders", async (req, res, next) => {
  try {
    const rawInput = {
      ...CreateExchangeOrderBody.parse(req.body),
      ...normalizeRefundFields(req.body),
    };
    if (rawInput.type !== "manual") return next();
    await ensureSeed();
    const resolvedIdentity = await resolveCustomerOrderIdentity(req, rawInput);
    if (resolvedIdentity.customerClerkUserId) {
      const referral = typeof req.cookies?.affiliate_referral === "string"
        ? req.cookies.affiliate_referral
        : undefined;
      const affiliate = await initializeAffiliateForOrder(
        resolvedIdentity.customerClerkUserId,
        referral,
      );
      if (referral && affiliate.referralStatus !== "unavailable") {
        res.clearCookie("affiliate_referral");
      }
    }
    if (!resolvedIdentity.input.quoteId) {
      throw new ApiError(
        "QUOTE_INVALID",
        "A customer-approved quoteId is required for manual order creation.",
        400,
      );
    }
    const quoteInput = CreateExchangeQuoteBody.parse(resolvedIdentity.input);
    const normalizedRoute = await normalizeExchangeRoute(quoteInput);
    const input = {
      ...resolvedIdentity.input,
      ...normalizedRoute,
    };
    const [prior] = await db.select().from(ordersTable)
      .where(eq(ordersTable.clientRequestId, input.clientRequestId)).limit(1);
    if (prior) {
      const result = await existingOrderResult(prior, input, false);
      res.status(result.status).json(result.body);
      return;
    }
    const orderInput: ParsedOrderInput = {
      ...CreateOrderBody.parse({
        ...input,
        quoteId: resolvedIdentity.input.quoteId,
      }),
      customerEmail: input.customerEmail,
    };
    const result = await createOrderFromInput(
      orderInput,
      true,
      resolvedIdentity.customerClerkUserId,
    );
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const parsed = {
      ...CreateOrderBody.parse(req.body),
      ...normalizeRefundFields(req.body),
    };
    if (parsed.type !== "manual") return next();
    const resolvedIdentity = await resolveCustomerOrderIdentity(req, parsed);
    if (resolvedIdentity.customerClerkUserId) {
      const referral = typeof req.cookies?.affiliate_referral === "string"
        ? req.cookies.affiliate_referral
        : undefined;
      const affiliate = await initializeAffiliateForOrder(
        resolvedIdentity.customerClerkUserId,
        referral,
      );
      if (referral && affiliate.referralStatus !== "unavailable") {
        res.clearCookie("affiliate_referral");
      }
    }
    const result = await createOrderFromInput(
      resolvedIdentity.input,
      true,
      resolvedIdentity.customerClerkUserId,
    );
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

function parseManualOrderPatch(value: unknown) {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const allowed = ["awaiting_funds", "funds_confirmed", "payout_processing", "payout_sent", "completed", "cancelled", "failed", "refunded"];
  if (body.manualSettlementState !== undefined &&
      (typeof body.manualSettlementState !== "string" || !allowed.includes(body.manualSettlementState))) {
    throw new ApiError("VALIDATION_ERROR", "Invalid manual settlement state.", 400);
  }
  for (const [key, max] of [["incomingTransactionReference", 500], ["outgoingTransactionReference", 500], ["customerSafeNote", 2000]] as const) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || body[key].length > max)) throw new ApiError("VALIDATION_ERROR", `Invalid ${key}.`, 400);
  }
  return body as {
    manualSettlementState?: string; incomingTransactionReference?: string; outgoingTransactionReference?: string;
    customerSafeNote?: string; paymentDetails?: Record<string, string> | null;
  };
}

function orderStatusPermission(status: string): PermissionKey {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "funds_confirmed" || normalized === "payment_confirmed") {
    return "orders.confirm_payment";
  }
  if (normalized === "completed" || normalized === "complete") {
    return "orders.complete";
  }
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "cancel") {
    return "orders.cancel";
  }
  return "orders.status";
}

function requireOrderPatchPermissions(
  operator: OperatorAuthorization,
  existing: {
    status: string;
    manualSettlementState: string;
  },
  input: {
    status?: string;
    note?: string;
    providerReference?: string;
  },
  manualInput: {
    manualSettlementState?: string;
    incomingTransactionReference?: string;
    outgoingTransactionReference?: string;
    customerSafeNote?: string;
    paymentDetails?: Record<string, string> | null;
  },
): PermissionKey[] {
  const required = new Set<PermissionKey>();
  const statusChanged = input.status !== undefined && input.status !== existing.status;
  const settlementChanged = manualInput.manualSettlementState !== undefined &&
    manualInput.manualSettlementState !== existing.manualSettlementState;
  if (statusChanged) required.add(orderStatusPermission(input.status!));
  if (settlementChanged) {
    required.add(orderStatusPermission(manualInput.manualSettlementState!));
  }
  const noteChanged = input.note !== undefined || manualInput.customerSafeNote !== undefined;
  if (noteChanged) required.add("orders.notes");
  const operationalChanged =
    input.providerReference !== undefined ||
    manualInput.incomingTransactionReference !== undefined ||
    manualInput.outgoingTransactionReference !== undefined;
  if (operationalChanged) required.add("orders.status");
  if (manualInput.paymentDetails !== undefined) required.add("orders.details");
  if (!required.size && operator.role !== "owner") {
    throw new ApiError(
      "PERMISSION_ACCESS_DENIED",
      "The signed-in operator lacks a permission for this order update.",
      403,
    );
  }
  if (operator.role !== "owner") {
    const missing = [...required].filter((permission) =>
      !operator.effectivePermissions.includes(permission),
    );
    if (missing.length) {
      throw new ApiError(
        "PERMISSION_ACCESS_DENIED",
        `The signed-in operator lacks the required order permission: ${missing.join(", ")}.`,
        403,
      );
    }
  }
  return [...required];
}

const MANUAL_PROGRESS_STATES = [
  "awaiting_funds",
  "funds_confirmed",
  "payout_processing",
  "payout_sent",
  "completed",
] as const;
const MANUAL_TERMINAL_TRANSITIONS: Record<string, string[]> = {
  awaiting_funds: ["cancelled", "failed"],
  funds_confirmed: ["cancelled", "failed", "refunded"],
  payout_processing: ["cancelled", "failed", "refunded"],
  payout_sent: ["failed", "refunded"],
  completed: ["refunded"],
};
function manualTransitionStates(current: string): string[] {
  const currentIndex = MANUAL_PROGRESS_STATES.indexOf(
    current as (typeof MANUAL_PROGRESS_STATES)[number],
  );
  if (currentIndex < 0) return [];
  return [
    ...MANUAL_PROGRESS_STATES.slice(currentIndex + 1),
    ...(MANUAL_TERMINAL_TRANSITIONS[current] ?? []),
  ];
}
function manualTransitionDetails(current: string, next: string) {
  const currentIndex = MANUAL_PROGRESS_STATES.indexOf(
    current as (typeof MANUAL_PROGRESS_STATES)[number],
  );
  const nextIndex = MANUAL_PROGRESS_STATES.indexOf(
    next as (typeof MANUAL_PROGRESS_STATES)[number],
  );
  const skippedStates = currentIndex >= 0 && nextIndex > currentIndex
    ? MANUAL_PROGRESS_STATES.slice(currentIndex + 1, nextIndex)
    : [];
  return {
    previousManualSettlementState: current,
    nextManualSettlementState: next,
    skippedStates,
  };
}
function manualMilestoneUpdates(
  existing: {
    manualSettlementFundedAt: Date | null;
    manualSettlementPaidAt: Date | null;
    manualSettlementCancelledAt: Date | null;
  },
  nextState: string,
  now: Date,
) {
  const nextIndex = MANUAL_PROGRESS_STATES.indexOf(
    nextState as (typeof MANUAL_PROGRESS_STATES)[number],
  );
  return {
    ...(nextIndex >= MANUAL_PROGRESS_STATES.indexOf("funds_confirmed") &&
      !existing.manualSettlementFundedAt
      ? { manualSettlementFundedAt: now }
      : {}),
    ...(nextIndex >= MANUAL_PROGRESS_STATES.indexOf("payout_sent") &&
      !existing.manualSettlementPaidAt
      ? { manualSettlementPaidAt: now }
      : {}),
    ...(nextState === "cancelled" && !existing.manualSettlementCancelledAt
      ? { manualSettlementCancelledAt: now }
      : {}),
  };
}
const manualStatus = (state: string) => ({
  awaiting_funds: "awaiting funds", funds_confirmed: "processing",
  payout_processing: "processing", payout_sent: "processing",
  completed: "completed", cancelled: "cancelled", failed: "failed",
  refunded: "refunded",
}[state] ?? state);

type BulkMutationItem = { id: string; recordVersion: number };
type BulkMutationFailure = {
  id: string;
  success: false;
  code: string;
  error: string;
  retryable: boolean;
  outcomeUnknown: boolean;
};

function assertUniqueBulkOrderIds(items: BulkMutationItem[]): void {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new ApiError(
      "DUPLICATE_ORDER_IDS",
      "Each order may appear only once in a bulk request.",
      400,
    );
  }
}

function bulkMutationFailure(id: string, error: ApiError): BulkMutationFailure {
  return {
    id,
    success: false,
    code: error.code,
    error: error.message,
    retryable: error.retryable,
    outcomeUnknown: error.outcomeUnknown,
  };
}

async function loadBulkOrder(item: BulkMutationItem) {
  if (await isProviderManagedOrder(item.id)) {
    throw new ApiError(
      "PROVIDER_ORDER_READ_ONLY",
      "Provider-managed orders are read-only in the Manual operations workspace.",
      409,
    );
  }
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, item.id))
    .limit(1);
  if (!order) {
    throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
  }
  if (order.recordVersion !== item.recordVersion) {
    throw new ApiError(
      "ORDER_STATUS_CONFLICT",
      "The order changed concurrently. Reload it before saving.",
      409,
    );
  }
  return order;
}

router.post("/orders/bulk/status", requireOperator, async (req, res, next) => {
  try {
    const input = BulkUpdateOrderStatusBody.parse(req.body);
    assertUniqueBulkOrderIds(input.items);
    const operator = res.locals.operator as OperatorAuthorization;
    const results = [];
    for (const item of input.items) {
      try {
        const existing = await loadBulkOrder(item);
        if (existing.type === "instant") {
          throw new ApiError(
            "PROVIDER_STATUS_MANAGED",
            "Instant order statuses are managed by exchange synchronization.",
            409,
          );
        }
        if (existing.archivedAt) {
          throw new ApiError(
            "ORDER_ARCHIVED",
            "Restore the order before updating its status.",
            409,
          );
        }
        const operatorClaimsUnassignedOrder =
          operator.role === "operator" && existing.assignedOperatorId === null;
        const mayUpdateStatus = operator.role === "owner" ||
          existing.assignedOperatorId === null ||
          existing.assignedOperatorId === operator.id;
        if (!mayUpdateStatus) {
          throw new ApiError(
            "ORDER_STATUS_ACCESS_DENIED",
            "Only the assigned operator or an owner may update this status.",
            403,
          );
        }
        if (
          existing.type !== "manual" ||
          existing.manualSettlementState === "not_required"
        ) {
          throw new ApiError(
            "MANUAL_SETTLEMENT_NOT_APPLICABLE",
            "Bulk status updates are only valid for manual orders.",
            409,
          );
        }
        const nextState = input.manualSettlementState;
        const currentState = existing.manualSettlementState;
        if (nextState === currentState) {
          results.push({ id: item.id, success: true, order: outputOrder(existing) });
          continue;
        }
        if (!manualTransitionStates(currentState).includes(nextState)) {
          throw new ApiError(
            "MANUAL_SETTLEMENT_TRANSITION_INVALID",
            "That manual settlement transition is not allowed.",
            422,
          );
        }
        const now = new Date();
        const updated = await updateOrderAndQueueStatusNotification(existing, {
          ...(operatorClaimsUnassignedOrder
            ? { assignedOperatorId: operator.id }
            : {}),
          manualSettlementState: nextState,
          manualSettlementStateUpdatedAt: now,
          status: manualStatus(nextState),
          ...manualMilestoneUpdates(existing, nextState, now),
        }, undefined, {
          action: "order.bulk_status_updated",
          actorType: "operator",
          actorId: operator.id,
          requestId: req.id == null ? null : String(req.id),
          details: {
            bulk: true,
            operatorClaimedUnassignedOrder: operatorClaimsUnassignedOrder,
            ...manualTransitionDetails(currentState, nextState),
          },
        });
        if (!updated) {
          throw new ApiError(
            "ORDER_STATUS_CONFLICT",
            "The order changed concurrently. Reload it before saving.",
            409,
          );
        }
        results.push({ id: item.id, success: true, order: outputOrder(updated) });
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        results.push(bulkMutationFailure(item.id, error));
      }
    }
    res.json(BulkUpdateOrderStatusResponse.parse({ results }));
  } catch (error) {
    next(error);
  }
});

router.post("/orders/:id/mark-paid", async (req, res, next) => {
  try {
    const params = UpdateOrderParams.parse(req.params);
    const input = MarkOrderPaidBody.parse(req.body ?? {});
    const customerId = getCustomerActorUserId(req);
    const updated = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(ordersTable)
        .where(eq(ordersTable.id, params.id))
        .limit(1)
        .for("update");
      if (!existing) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
      const tokenValid = verifyOrderTrackingToken(input.trackingToken, existing.id);
      if (!tokenValid && (!customerId || existing.customerClerkUserId !== customerId)) {
        throw new ApiError("ORDER_ACCESS_DENIED", "Order access is required.", 403);
      }
      if (!isApplicablePaymentDetailsOrder(existing)) {
        throw new ApiError("PAYMENT_DETAILS_NOT_APPLICABLE", "Payment details are not available for this order.", 409);
      }
      if (
        existing.manualSettlementState === "cancelled" ||
        existing.status.trim().toLowerCase() === "cancelled"
      ) {
        throw new ApiError("ORDER_CANCELLED", "A cancelled order cannot be marked as paid.", 409);
      }
      if (existing.customerMarkedPaidAt) return existing;
      if (!hasCustomerPaymentDetails(existing.paymentDetails)) {
        throw new ApiError("PAYMENT_DETAILS_NOT_APPLICABLE", "Payment details are not available for this order.", 409);
      }
      const [marked] = await tx.update(ordersTable).set({
        customerMarkedPaidAt: new Date(),
        recordVersion: sql`${ordersTable.recordVersion} + 1`,
      }).where(and(
        eq(ordersTable.id, existing.id),
        eq(ordersTable.recordVersion, existing.recordVersion),
        isNull(ordersTable.customerMarkedPaidAt),
      )).returning();
      if (!marked) {
        throw new ApiError("ORDER_UPDATE_CONFLICT", "The order changed concurrently. Try again.", 409);
      }
      await tx.insert(orderAuditLogsTable).values({
        orderId: existing.id,
        action: "order.customer_marked_paid",
        actorType: "customer",
        actorId: customerId ?? null,
        requestId: req.id == null ? null : String(req.id),
        previousVersion: existing.recordVersion,
        nextVersion: marked.recordVersion,
        details: { changedFields: ["customerMarkedPaidAt"] },
      });
      return marked;
    });
    res.json(MarkOrderPaidResponse.parse(outputCustomerOrder(updated, false)));
  } catch (error) {
    next(error);
  }
});

router.post("/orders/:id/cancel", async (req, res, next) => {
  try {
    const params = UpdateOrderParams.parse(req.params);
    const input = CancelCustomerOrderBody.parse(req.body ?? {});
    const customerId = getCustomerActorUserId(req);
    const [existing] = await db.select().from(ordersTable)
      .where(eq(ordersTable.id, params.id)).limit(1);
    if (!existing) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    const tokenValid = verifyOrderTrackingToken(input.trackingToken, existing.id);
    if (!tokenValid && (!customerId || existing.customerClerkUserId !== customerId)) {
      throw new ApiError("ORDER_ACCESS_DENIED", "Order access is required.", 403);
    }
    if (existing.manualSettlementState === "cancelled" && existing.status === "cancelled") {
      res.json(CancelCustomerOrderResponse.parse(outputCustomerOrder(existing, false)));
      return;
    }
    if (existing.type !== "manual" || existing.manualSettlementState === "not_required") {
      throw new ApiError(
        "CUSTOMER_CANCELLATION_NOT_APPLICABLE",
        "This order cannot be cancelled by the customer.",
        409,
      );
    }
    if (existing.archivedAt) {
      throw new ApiError("ORDER_ARCHIVED", "This archived order cannot be cancelled.", 409);
    }
    if (existing.customerMarkedPaidAt) {
      throw new ApiError(
        "ORDER_ALREADY_MARKED_PAID",
        "This order was already marked as paid and cannot be cancelled.",
        409,
      );
    }
    const normalizedStatus = existing.status.trim().toLowerCase();
    if (
      existing.manualSettlementState !== "awaiting_funds" ||
      /process|complete|paid|funds confirmed|payout|cancel|fail|refund|expire/.test(normalizedStatus)
    ) {
      throw new ApiError(
        "ORDER_CANCELLATION_NOT_ALLOWED",
        "Only unpaid orders awaiting funds can be cancelled.",
        409,
      );
    }
    const now = new Date();
    const updated = await updateOrderAndQueueStatusNotification(existing, {
      manualSettlementState: "cancelled",
      manualSettlementStateUpdatedAt: now,
      status: manualStatus("cancelled"),
      ...manualMilestoneUpdates(existing, "cancelled", now),
    }, and(
      eq(ordersTable.type, "manual"),
      eq(ordersTable.manualSettlementState, "awaiting_funds"),
      isNull(ordersTable.customerMarkedPaidAt),
      isNull(ordersTable.archivedAt),
    ), {
      action: "order.customer_cancelled",
      actorType: "customer",
      actorId: customerId ?? null,
      requestId: req.id == null ? null : String(req.id),
      details: {
        previousManualSettlementState: existing.manualSettlementState,
        nextManualSettlementState: "cancelled",
        source: tokenValid ? "tracking_token" : "customer_account",
      },
    });
    if (!updated) {
      throw new ApiError(
        "ORDER_UPDATE_CONFLICT",
        "The order changed and can no longer be cancelled. Reload and try again.",
        409,
      );
    }
    res.json(CancelCustomerOrderResponse.parse(outputCustomerOrder(updated, false)));
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:id", requireOperator, async (req, res, next) => {
  try {
    const params = UpdateOrderParams.parse(req.params);
    const input = UpdateOrderBody.parse(req.body);
    const manualInput = parseManualOrderPatch(req.body);
    if (await isProviderManagedOrder(params.id)) {
      throw new ApiError(
        "PROVIDER_ORDER_READ_ONLY",
        "Provider-managed orders are read-only in the Manual operations workspace.",
        409,
      );
    }
    const [existing] = await db.select().from(ordersTable)
      .where(eq(ordersTable.id, params.id)).limit(1);
    if (!existing) {
      throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    }
    if (existing.type === "manual" && (input.status !== undefined || manualInput.manualSettlementState !== undefined)) {
      const [hold] = await db.select({ id: blockchainMonitorMatchesTable.id }).from(blockchainMonitorMatchesTable)
        .where(and(eq(blockchainMonitorMatchesTable.orderId, existing.id), eq(blockchainMonitorMatchesTable.state, "needs_review"))).limit(1);
      if (hold) throw new ApiError("BLOCKCHAIN_MONITORING_REVIEW_REQUIRED", "Resolve the active blockchain monitoring review before changing this order.", 409);
    }
    if (
      input.recordVersion !== undefined &&
      existing.recordVersion !== input.recordVersion
    ) {
      throw new ApiError(
        input.status !== undefined
          ? "ORDER_STATUS_CONFLICT"
          : "ORDER_UPDATE_CONFLICT",
        "The order changed concurrently. Reload it before saving.",
        409,
      );
    }
    const operator = res.locals.operator as OperatorAuthorization;
    const requiredPermissions = requireOrderPatchPermissions(
      operator,
      existing,
      input,
      manualInput,
    );
    const requestsStatusChange = (input.status !== undefined && input.status !== existing.status) ||
      (manualInput.manualSettlementState !== undefined &&
        manualInput.manualSettlementState !== existing.manualSettlementState);
    if (existing.archivedAt && (input.status !== undefined || manualInput.manualSettlementState !== undefined)) {
      throw new ApiError("ORDER_ARCHIVED", "Restore the order before updating its status.", 409);
    }
    if (requestsStatusChange) {
      if (input.recordVersion === undefined) {
        throw new ApiError("ORDER_UPDATE_CONFLICT", "recordVersion is required for status updates.", 409);
      }
      const mayUpdateStatus = operator.role === "owner" ||
        existing.assignedOperatorId === null ||
        existing.assignedOperatorId === operator.id;
      if (!mayUpdateStatus) {
        throw new ApiError(
          "ORDER_STATUS_ACCESS_DENIED",
          "Only the assigned operator or an owner may update this status.",
          403,
        );
      }
    }
    if (
      existing.type !== "manual" &&
      input.status !== undefined &&
      input.status !== existing.status
    ) {
      throw new ApiError(
        "PROVIDER_STATUS_MANAGED",
        "Instant order statuses are managed by exchange synchronization.",
        409,
      );
    }
    if (
      existing.type === "manual" &&
      existing.manualSettlementState !== "not_required" &&
      input.status !== undefined &&
      input.status !== existing.status
    ) {
      throw new ApiError(
        "MANUAL_STATUS_MANAGED",
        "Manual order status is derived from the manual settlement state.",
        409,
      );
    }
    const hasManualUpdate = [
      manualInput.manualSettlementState,
      manualInput.incomingTransactionReference,
      manualInput.outgoingTransactionReference,
      manualInput.customerSafeNote,
    ].some((value) => value !== undefined);
    if (hasManualUpdate && input.recordVersion === undefined) {
      throw new ApiError(
        "ORDER_UPDATE_CONFLICT",
        "recordVersion is required for manual settlement updates.",
        409,
      );
    }
    if (input.paymentDetails !== undefined) {
      if (!isApplicablePaymentDetailsOrder(existing)) {
        throw new ApiError("PAYMENT_DETAILS_NOT_APPLICABLE", "Payment details are only valid for manual fiat-to-crypto orders.", 409);
      }
      if (input.recordVersion === undefined) {
        throw new ApiError("ORDER_UPDATE_CONFLICT", "recordVersion is required for payment detail updates.", 409);
      }
    }
    if (manualInput.manualSettlementState !== undefined) {
      if (existing.type !== "manual") {
        throw new ApiError("MANUAL_SETTLEMENT_NOT_APPLICABLE", "Manual settlement updates are only valid for manual orders.", 409);
      }
      const current = existing.manualSettlementState;
      if (manualInput.manualSettlementState !== current &&
          !manualTransitionStates(current).includes(manualInput.manualSettlementState)) {
        throw new ApiError("MANUAL_SETTLEMENT_TRANSITION_INVALID", "That manual settlement transition is not allowed.", 422);
      }
    }
    const now = new Date();
    const state = manualInput.manualSettlementState;
    const stateChanged = state !== undefined &&
      state !== existing.manualSettlementState;
    const operatorClaimsUnassignedOrder =
      requestsStatusChange &&
      operator.role === "operator" &&
      existing.assignedOperatorId === null;
    const updates = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.providerReference !== undefined ? { providerReference: input.providerReference } : {}),
      ...(operatorClaimsUnassignedOrder ? { assignedOperatorId: operator.id } : {}),
      ...(stateChanged ? {
        manualSettlementState: state, manualSettlementStateUpdatedAt: now, status: manualStatus(state),
        ...manualMilestoneUpdates(existing, state, now),
      } : {}),
      ...(manualInput.incomingTransactionReference !== undefined ? { incomingTransactionReference: manualInput.incomingTransactionReference } : {}),
      ...(manualInput.outgoingTransactionReference !== undefined ? { outgoingTransactionReference: manualInput.outgoingTransactionReference } : {}),
      ...(manualInput.customerSafeNote !== undefined ? { customerSafeNote: manualInput.customerSafeNote } : {}),
      ...(input.paymentDetails !== undefined
        ? { paymentDetails: Object.keys(input.paymentDetails ?? {}).length ? input.paymentDetails : null }
        : {}),
    };
    const row = await updateOrderAndQueueStatusNotification(
      existing,
      updates,
      undefined,
      {
        action: "order.operator_updated",
        actorType: "operator",
        actorId: operator.id,
        requestId: req.id == null ? null : String(req.id),
        details: {
          operatorClaimedUnassignedOrder: operatorClaimsUnassignedOrder,
          ...(stateChanged
            ? manualTransitionDetails(existing.manualSettlementState, state)
            : {}),
          ...(input.paymentDetails !== undefined
            ? {
                paymentDetailsChanged: true,
                paymentDetailsCleared: Object.keys(input.paymentDetails ?? {}).length === 0,
              }
            : {}),
        },
      },
    );
    if (!row) {
      throw new ApiError(
        input.status !== undefined
          ? "ORDER_STATUS_CONFLICT"
          : "ORDER_UPDATE_CONFLICT",
        "The order changed concurrently. Reload it before saving.",
        409,
      );
    }
    for (const permission of requiredPermissions) {
      recordAdminMutationActivity(req, res, {
        permission,
        action: `order.patch.${permission.replace(/\./g, "_")}`,
        entityId: existing.id,
      });
    }
    res.json(outputOrder(row));
  } catch (error) { next(error); }
});

router.get("/storage/objects/payment-method-logos/:id", async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!/^[0-9a-f-]+$/.test(id)) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const { buffer, contentType } = await getVerifiedStoredLogo(`/objects/payment-method-logos/${id}`);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof StoredImageInvalidError) {
      res.status(415).json({ error: "Stored object is not an allowed image" });
      return;
    }
    next(error);
  }
});
for (const [namespace, param] of [
  ["crypto-asset-logos", "cryptoAsset"],
  ["crypto-network-logos", "cryptoNetwork"],
  ["fiat-currency-flags", "fiatFlag"],
] as const) {
  router.get(`/storage/objects/${namespace}/:id`, async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { buffer, contentType } = await getVerifiedStoredLogo(`/objects/${namespace}/${id}`, namespace);
      res.setHeader("content-type", contentType).setHeader("cache-control", "public, max-age=31536000, immutable").setHeader("x-content-type-options", "nosniff").setHeader("content-security-policy", "default-src 'none'; sandbox").send(buffer);
    } catch (error) {
      if (error instanceof StoredObjectNotFoundError) return res.status(404).json({ error: "Object not found" });
      if (error instanceof StoredImageInvalidError) return res.status(415).json({ error: "Stored object is not an allowed image" });
      return next(error);
    }
  });
}

router.use("/admin", requireOperator);

async function buildManualDeskRevenueReport(query: {
  from: string;
  to: string;
  groupBy: "pricingRule" | "route";
  reportingCurrency: string;
}) {
  const parseDate = (value: string) => {
    const parsed = new Date(value);
    const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) {
      throw new ApiError(
        "INVALID_REPORT_PERIOD",
        "The report period contains an invalid calendar date.",
        400,
      );
    }
    return parsed;
  };
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (from >= to) {
    throw new ApiError("INVALID_REPORT_PERIOD", "The report start must be before its end.", 400);
  }
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new ApiError("REPORT_PERIOD_TOO_LARGE", "The report period cannot exceed 366 days.", 400);
  }
  const rows = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      fromAsset: ordersTable.fromAsset,
      fromNetwork: ordersTable.fromNetwork,
      toAsset: ordersTable.toAsset,
      toNetwork: ordersTable.toNetwork,
      pricingSnapshot: ordersTable.pricingSnapshot,
    })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.type, "manual"),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
      sql`${ordersTable.pricingSnapshot} is not null`,
    ));
  try {
    return aggregateManualDeskRevenue(
      rows as RevenueOrder[],
      query.groupBy,
      from,
      to,
      query.reportingCurrency,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("immutable")) {
      throw new ApiError("REPORTING_CURRENCY_UNAVAILABLE", error.message, 400);
    }
    throw error;
  }
}

router.get("/admin/manual-desk-revenue", async (req, res, next): Promise<void> => {
  try {
    const query = GetManualDeskRevenueQueryParams.parse(req.query);
    const report = await buildManualDeskRevenueReport(query);
    res.json(GetManualDeskRevenueResponse.parse(report));
  } catch (error) {
      return next(error);
  }
});

router.get("/admin/manual-desk-revenue.csv", async (req, res, next): Promise<void> => {
  try {
    const query = ExportManualDeskRevenueCsvQueryParams.parse(req.query);
    const report = GetManualDeskRevenueResponse.parse(
      await buildManualDeskRevenueReport(query),
    );
    res
      .type("text/csv")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="manual-desk-revenue-${report.from.toISOString().slice(0, 10)}-${report.to.toISOString().slice(0, 10)}.csv"`,
      )
      .send(manualDeskRevenueCsv({
        ...report,
        from: report.from.toISOString(),
        to: report.to.toISOString(),
        generatedAt: report.generatedAt.toISOString(),
      }));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/summary", async (req, res, next): Promise<void> => {
  try {
    await ensureSeed();
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
      !rawFrom.endsWith("Z") || !rawTo.endsWith("Z") ||
      !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) ||
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
    const status = await refreshManualDeskRateProviderStatus();
    const providerFreshness = {
      state: status.state === "loading" ? "syncing" as const : status.state,
      syncing: status.state === "loading",
      ...(status.fetchedAt ? { lastSucceededAt: status.fetchedAt } : {}),
      ...(status.lastFailureAt ? { lastFailedAt: status.lastFailureAt } : {}),
    };
    const [
      analytics,
      [notificationHealth],
      [unresolvedHealth],
    ] = await Promise.all([
      buildAdminSummaryAnalytics({ product: "swap", from, to }),
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
    ]);
    const oldestPendingAt = notificationHealth?.oldestPendingAt;
    const summary = {
      ...analytics,
      operationalHealth: {
        providerFreshness,
        ...manualExternalProviderHealthPlaceholders(),
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
    };
    res.json(GetAdminSummaryResponse.parse(summary));
  } catch (error) { next(error); }
});

router.get("/admin/customers", async (req, res, next) => {
  try {
    await ensureSeed();
    const query = GetCustomersQueryParams.parse(req.query);
    const search = query.search?.trim();
    const where = search
      ? or(
        ilike(customersTable.name, `%${search}%`),
        ilike(customersTable.email, `%${search}%`),
      )
      : undefined;
    const offset = (query.page - 1) * query.pageSize;
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(customersTable)
        .where(where)
        .orderBy(desc(customersTable.lastActivity), asc(customersTable.id))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(customersTable).where(where),
    ]);
    res.json(GetCustomersResponse.parse({
      items: rows.map((row) => ({
        ...row,
        volume: Number(row.volume),
        lastActivity: row.lastActivity.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }));
  } catch (error) { next(error); }
});

function outputFiatCurrency(row: typeof fiatCurrenciesTable.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    precision: row.precision,
    lifecycle: row.lifecycle,
    regions: row.regions,
    countries: row.countries,
    enabled: row.enabled,
    flagObjectPath: row.flagObjectPath,
    flagUrl: row.flagObjectPath ? `/api/storage${row.flagObjectPath}` : undefined,
    rateMode: row.code.toUpperCase() === "USD" ? "manual" : row.rateMode,
    manualRate: row.code.toUpperCase() === "USD" ? "1" : row.manualRate,
    deprecatedNetwork: row.network,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/admin/manual-desk-pricing-rules", async (_req, res, next) => {
  try {
    const rows = await db.select().from(manualDeskPricingRulesTable)
      .orderBy(
        desc(manualDeskPricingRulesTable.priority),
        asc(manualDeskPricingRulesTable.createdAt),
        asc(manualDeskPricingRulesTable.id),
      )
    const manualOptions = [
      ...await listPublicManualCryptoSettlementOptions(),
      ...await listPublicFiatSettlementOptions(),
    ];
    const coverage = evaluateManualPricingCoverage(rows, manualOptions);
    const missingByRuleId = new Map(
      coverage.orphanRules.map((rule) => [rule.ruleId, rule.missingSettlementOptionIds]),
    );
    res.json(ListManualDeskPricingRulesResponse.parse({
      items: rows.map((row) => ({
        ...outputManualPricingRule(row),
        missingSettlementOptionIds: missingByRuleId.get(row.id) ?? [],
      })),
      diagnostics: {
        hasEnabledAnyToAnyFallback: coverage.hasEnabledAnyToAnyFallback,
        orphanRules: coverage.orphanRules,
        uncoveredRoutes: coverage.uncoveredRoutes,
      },
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/manual-desk-pricing-rules", async (req, res, next) => {
  try {
    const input = CreateManualDeskPricingRuleBody.parse(req.body);
    await validateExactPricingRuleOptions(input);
    const created = await createManualPricingRule(input);
    res.status(201).json(
      CreateManualDeskPricingRuleResponse.parse(outputManualPricingRule(created)),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/admin/manual-desk-pricing-rules/bulk", async (req, res, next) => {
  try {
    const input = BulkManualDeskPricingRulesBody.parse(req.body);
    const options = [
      ...await listPublicManualCryptoSettlementOptions(),
      ...await listPublicFiatSettlementOptions(),
    ];
    let patch = input.patch;
    if (input.action === "edit" && patch) {
      const sourceId = patch.sourceSettlementOptionId === undefined
        ? undefined : patch.sourceSettlementOptionId;
      const targetId = patch.targetSettlementOptionId === undefined
        ? undefined : patch.targetSettlementOptionId;
      const source = sourceId ? options.find((option) => option.id.toUpperCase() === sourceId.toUpperCase()) : undefined;
      const target = targetId ? options.find((option) => option.id.toUpperCase() === targetId.toUpperCase()) : undefined;
      if (sourceId !== undefined || targetId !== undefined) {
        if ((sourceId && !source) || (targetId && !target) ||
            (source && source.direction !== "send" && source.direction !== "both") ||
            (target && target.direction !== "receive" && target.direction !== "both") ||
            (source && target && source.id === target.id)) {
          throw new ApiError("SETTLEMENT_OPTION_INVALID", "The selected settlement route is unavailable.", 422);
        }
        patch = {
          ...patch,
          ...(sourceId !== undefined ? {
            sourceAsset: source?.assetCode ?? null,
            sourceNetwork: source?.routeNetwork ?? null,
            sourceSettlementOptionId: source?.id ?? null,
          } : {}),
          ...(targetId !== undefined ? {
            targetAsset: target?.assetCode ?? null,
            targetNetwork: target?.routeNetwork ?? null,
            targetSettlementOptionId: target?.id ?? null,
          } : {}),
        };
      }
      await validateExactPricingRuleOptions(patch);
    }
    const result = await bulkUpdateManualPricingRules(
      input.items,
      input.action,
      patch,
      new Set(options.map((option) => option.id.toUpperCase())),
    );
    const coverage = evaluateManualPricingCoverage(result.rows, options);
    const missingByRuleId = new Map(
      coverage.orphanRules.map((rule) => [rule.ruleId, rule.missingSettlementOptionIds]),
    );
    res.json(BulkManualDeskPricingRulesResponse.parse({
      items: result.rows.map((row) => ({
        ...outputManualPricingRule(row),
        missingSettlementOptionIds: missingByRuleId.get(row.id) ?? [],
      })),
      diagnostics: {
        hasEnabledAnyToAnyFallback: coverage.hasEnabledAnyToAnyFallback,
        orphanRules: coverage.orphanRules,
        uncoveredRoutes: coverage.uncoveredRoutes,
      },
      action: input.action,
      affectedIds: result.updatedIds,
      updatedIds: result.updatedIds,
      skipped: result.skipped,
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/manual-desk-pricing-rules/bulk-create", async (req, res, next) => {
  try {
    const input = BulkCreateManualDeskPricingRulesBody.parse(req.body);
    await Promise.all(input.rules.map(rule => validateExactPricingRuleOptions(rule)));
    const result = await upsertManualPricingRules(input.rules);
    res.json(BulkCreateManualDeskPricingRulesResponse.parse({
      items: result.rows.map(outputManualPricingRule),
      createdIds: result.createdIds,
      updatedIds: result.updatedIds,
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/manual-desk-pricing-rules/preview", async (req, res, next) => {
  try {
    const input = PreviewManualDeskPricingRuleBody.parse(req.body);
    await validateExactPricingRuleOptions(input);
    const matched = await matchManualDeskPricingRule(input);
    res.json(
      PreviewManualDeskPricingRuleResponse.parse(outputManualPricingRule(matched)),
    );
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/manual-desk-pricing-rules/:id", async (req, res, next) => {
  try {
    const { id } = UpdateManualDeskPricingRuleParams.parse(req.params);
    const { version, ...input } = UpdateManualDeskPricingRuleBody.parse(req.body);
    await validateExactPricingRuleOptions(input);
    const updated = await updateManualPricingRule(id, version, input);
    res.json(
      UpdateManualDeskPricingRuleResponse.parse(outputManualPricingRule(updated)),
    );
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/manual-desk-pricing-rules/:id", requireOperator, async (req, res, next) => {
  try {
    const { id } = DeleteManualDeskPricingRuleParams.parse(req.params);
    const [deleted] = await db.delete(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, id))
      .returning({ id: manualDeskPricingRulesTable.id });
    if (!deleted) {
      throw new ApiError("MANUAL_PRICING_RULE_NOT_FOUND", "Pricing rule not found.", 404);
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    if ("code" in current && current.code === "23505") return true;
    visited.add(current);
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

function outputPaymentMethod(row: typeof paymentMethodsTable.$inferSelect) {
  return {
    ...row,
    logoUrl: row.logoObjectPath
      ? `/api/storage${row.logoObjectPath}`
      : paymentMethodBrandfetchLogoUrl(row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type JsonRecord = Record<string, unknown>;
function cryptoInput(body: unknown, network: boolean, update = false): JsonRecord {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("VALIDATION_ERROR", "Invalid crypto catalog input.", 400);
  const value = body as JsonRecord;
  const logoNamespace = network ? "crypto-network-logos" : "crypto-asset-logos";
  if (value.logoObjectPath !== undefined && value.logoObjectPath !== null &&
      (typeof value.logoObjectPath !== "string" ||
       !new RegExp(`^/objects/${logoNamespace}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).test(value.logoObjectPath))) {
    throw new ApiError("VALIDATION_ERROR", "Invalid logo object path.", 400);
  }
  const allowed = network
    ? ["id","assetId","networkCode","networkName","logoObjectPath","networkFamily","decimals","executionMode","lifecycle","regions","enabled","customerDepositsEnabled","requiresMemo","requiredConfirmations","confirmationGuidance","explorerUrlTemplate","depositInstructions","depositWarning","sharedDepositAddress","sharedDepositMemo"]
    : ["id","code","name","logoObjectPath","decimals","lifecycle","enabled"];
  if (
    !Object.keys(value).every(k => allowed.includes(k)) ||
    (update && !Object.keys(value).length) ||
    (update && Object.hasOwn(value, "id")) ||
    (update && network && Object.hasOwn(value, "assetId"))
  ) throw new ApiError("VALIDATION_ERROR", "Invalid crypto catalog input.", 400);
  const text = (key: string, max: number, required = false, nullable = false) => {
    const item = value[key]; if (item === undefined && !required) return;
    if (item === null && nullable && !required) return;
    if (typeof item !== "string" || (required && !item.trim()) || item.length > max) throw new ApiError("VALIDATION_ERROR", `Invalid ${key}.`, 400);
  };
  text("id", 80, !update); text(network ? "assetId" : "code", 64, !update); text(network ? "networkCode" : "name", 100, !update);
  if (network) text("networkName", 100, !update);
  if (network) text("networkFamily", 64);
  text("lifecycle", 16);
  if (network) text("executionMode", 16);
  if (value.id !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(String(value.id))) throw new ApiError("VALIDATION_ERROR", "Invalid ID.", 400);
  for (const key of ["decimals","requiredConfirmations"]) if (value[key] !== undefined && (!Number.isInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 100000)) throw new ApiError("VALIDATION_ERROR", `Invalid ${key}.`, 400);
  for (const key of ["enabled","customerDepositsEnabled","requiresMemo"]) if (value[key] !== undefined && typeof value[key] !== "boolean") throw new ApiError("VALIDATION_ERROR", `Invalid ${key}.`, 400);
  if (value.lifecycle !== undefined && !["active","restricted","deprecated"].includes(String(value.lifecycle))) throw new ApiError("VALIDATION_ERROR", "Invalid lifecycle.", 400);
  if (value.executionMode !== undefined && !["catalog","manual","api"].includes(String(value.executionMode))) throw new ApiError("VALIDATION_ERROR", "Invalid execution mode.", 400);
  if (value.regions !== undefined && (!Array.isArray(value.regions) || value.regions.some(item => typeof item !== "string" || item.length > 32))) throw new ApiError("VALIDATION_ERROR", "Invalid regions.", 400);
  for (const key of ["confirmationGuidance","explorerUrlTemplate","depositInstructions","depositWarning","sharedDepositMemo"]) text(key, 2000, false, true);
  text("sharedDepositAddress", 500);
  if (value.explorerUrlTemplate !== undefined && value.explorerUrlTemplate !== null && !/^https:\/\//.test(String(value.explorerUrlTemplate))) throw new ApiError("VALIDATION_ERROR", "Explorer URL must be HTTPS.", 400);
  return value;
}
async function verifyCatalogPath(tx: any, path: unknown, namespace: "crypto-asset-logos" | "crypto-network-logos" | "fiat-currency-flags"): Promise<void> {
  if (path === undefined || path === null) return;
  if (typeof path !== "string" || !new RegExp(`^/objects/${namespace}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).test(path)) {
    throw new ApiError("CATALOG_IMAGE_INVALID", "Image must be a normalized App Storage object path.", 400);
  }
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${path}, 20260826))`);
  try { await verifyStoredCatalogImage(path, namespace); } catch {
    throw new ApiError("CATALOG_IMAGE_INVALID", "Image must be a PNG, JPEG, WebP, or safe SVG image no larger than 5 MB.", 400);
  }
}
function validateCryptoDepositConfiguration(
  value: JsonRecord,
  current?: typeof cryptoAssetNetworksTable.$inferSelect,
) {
  const patched = (key: string, fallback: unknown) =>
    Object.hasOwn(value, key) ? value[key] : fallback;
  const enabled = patched(
    "customerDepositsEnabled",
    current?.customerDepositsEnabled ?? false,
  );
  if (!enabled) return;
  const address = patched("sharedDepositAddress", current?.sharedDepositAddress ?? "");
  if (typeof address !== "string" || !address.trim()) {
    throw new ApiError(
      "CRYPTO_DEPOSIT_ADDRESS_REQUIRED",
      "A shared deposit address is required before customer deposits can be enabled.",
      422,
    );
  }
}
function outputCryptoAsset(row: typeof cryptoAssetsTable.$inferSelect) {
  return { ...row, logoUrl: row.logoObjectPath ? `/api/storage${row.logoObjectPath}` : undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function outputCryptoNetwork(
  row: typeof cryptoAssetNetworksTable.$inferSelect,
  monitoringReadiness?: ManualMonitoringReadiness,
) {
  return {
    ...row,
    logoUrl: row.logoObjectPath ? `/api/storage${row.logoObjectPath}` : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    monitoringReadiness: monitoringReadiness
      ? {
          code: monitoringReadiness.code,
          message: monitoringReadiness.message,
          ready: monitoringReadiness.ready,
          networkCode: monitoringReadiness.networkCode,
        }
      : undefined,
  };
}
router.get("/admin/crypto-assets", requireOperator, async (_req, res, next) => {
  try {
    const rows = await db.select().from(cryptoAssetsTable).orderBy(
      desc(cryptoAssetsTable.enabled),
      sql`case ${cryptoAssetsTable.lifecycle} when 'active' then 0 when 'restricted' then 1 when 'deprecated' then 2 else 3 end`,
      asc(cryptoAssetsTable.code),
      asc(cryptoAssetsTable.name),
      asc(cryptoAssetsTable.id),
    );
    res.json(rows.map(outputCryptoAsset));
  } catch (e) { next(e); }
});
router.use(["/admin/crypto-assets", "/admin/crypto-networks"], (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    res.once("finish", () => {
      if (res.statusCode < 400) invalidatePopularExchangePairsCache();
    });
  }
  next();
});

router.post("/admin/crypto-assets/reconcile-customer-deposits", requireOwner, async (req, res, next) => {
  try {
    const result = ReconcileCryptoCustomerDepositsResponse.parse(
      await reconcileCryptoCustomerDepositEligibility(),
    );
    req.log.info(result, "Reconciled crypto customer deposit availability");
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.post("/admin/crypto-assets", requireOperator, async (req, res, next) => {
  try { const input = cryptoInput(req.body, false); const row = await db.transaction(async (tx) => { await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`); await verifyCatalogPath(tx, input.logoObjectPath, "crypto-asset-logos"); const [created] = await tx.insert(cryptoAssetsTable).values({ ...input, code: String(input.code).toUpperCase(), enabled: input.enabled ?? true } as never).returning(); return created; }); res.status(201).json(outputCryptoAsset(row)); } catch (e) { next(isUniqueViolation(e) ? new ApiError("CRYPTO_ASSET_EXISTS", "Crypto asset already exists.", 409) : e); }
});
router.post("/admin/crypto-assets/bulk/apply", requireOwner, async (req, res, next) => {
  try {
    const rawEdits = (
      req.body && typeof req.body === "object" && Array.isArray((req.body as { edits?: unknown }).edits)
        ? (req.body as { edits: unknown[] }).edits
        : []
    );
    const attemptsProviderAssignment = rawEdits.some(edit =>
      edit && typeof edit === "object" &&
      Array.isArray((edit as { networks?: unknown }).networks) &&
      (edit as { networks: unknown[] }).networks.some(network =>
        network && typeof network === "object" && Object.hasOwn(network, "depositProvider")
      )
    );
    if (attemptsProviderAssignment) {
      throw new ApiError(
        "CRYPTO_BULK_PROVIDER_FORBIDDEN",
        "Bulk Edit cannot assign or change API providers. Manage WhiteBIT through API Integrations and use Bulk Edit only for manual fallback settings.",
        400,
      );
    }
    const input = ApplyCryptoAssetsBulkEditBody.parse(req.body);
    const assetIds = input.edits.map(edit => edit.assetId);
    if (new Set(assetIds).size !== assetIds.length) {
      throw new ApiError("VALIDATION_ERROR", "Duplicate crypto asset IDs are not allowed.", 400);
    }
    const networkEdits = input.edits.flatMap(edit => (edit.networks ?? []).map(network => ({ ...network, assetId: edit.assetId })));
    const networkIds = networkEdits.map(network => network.networkId);
    if (new Set(networkIds).size !== networkIds.length) {
      throw new ApiError("VALIDATION_ERROR", "Duplicate crypto network IDs are not allowed.", 400);
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
      const assets = await tx.select().from(cryptoAssetsTable)
        .where(inArray(cryptoAssetsTable.id, assetIds))
        .for("update");
      if (assets.length !== assetIds.length) {
        throw new ApiError("CRYPTO_ASSET_NOT_FOUND", "One or more crypto assets were not found.", 404);
      }
      const networks = networkIds.length === 0
        ? []
        : await tx.select().from(cryptoAssetNetworksTable)
          .where(inArray(cryptoAssetNetworksTable.id, networkIds))
          .for("update");
      if (networks.length !== networkIds.length) {
        throw new ApiError("CRYPTO_ASSET_NETWORK_NOT_FOUND", "One or more crypto network rows were not found.", 404);
      }
      const assetById = new Map(assets.map(asset => [asset.id, asset]));
      const networkById = new Map(networks.map(network => [network.id, network]));
      for (const edit of input.edits) {
        if (!assetById.has(edit.assetId)) {
          throw new ApiError("CRYPTO_ASSET_NOT_FOUND", "One or more crypto assets were not found.", 404);
        }
        for (const networkEdit of edit.networks ?? []) {
          const network = networkById.get(networkEdit.networkId);
          if (!network || network.assetId !== edit.assetId) {
            throw new ApiError(
              "CRYPTO_ASSET_NETWORK_NOT_FOUND",
              "Each crypto network row must belong to its submitted asset.",
              404,
            );
          }
          if (networkEdit.customerDepositsEnabled === true) {
            throw new ApiError(
              "CRYPTO_DEPOSIT_VERIFICATION_REQUIRED",
              "Customer deposit availability is derived from a verified provider route or a valid saved wallet.",
              422,
            );
          }
          const editsDepositConfiguration = [
            "customerDepositsEnabled",
            "sharedDepositAddress",
          ].some(key => Object.hasOwn(networkEdit, key));
          if (editsDepositConfiguration) {
            const effectiveProvider = network.depositProvider;
            const effectiveDepositsEnabled =
              networkEdit.customerDepositsEnabled ?? network.customerDepositsEnabled;
            const effectiveAddress =
              networkEdit.sharedDepositAddress ?? network.sharedDepositAddress;
            if (effectiveProvider === "none" && effectiveDepositsEnabled) {
              throw new ApiError(
                "CRYPTO_DEPOSIT_PROVIDER_DISABLED",
                "Customer deposits must be disabled when Provider Policy is None.",
                422,
              );
            }
            if (
              effectiveProvider === "manual" &&
              effectiveDepositsEnabled &&
              !effectiveAddress.trim()
            ) {
              throw new ApiError(
                "CRYPTO_DEPOSIT_ADDRESS_REQUIRED",
                "A shared deposit address is required before manual customer deposits can be enabled.",
                422,
              );
            }
          }
        }
      }
      const invalidatesProviderProofs = input.edits.some((edit) =>
        edit.enabled !== undefined ||
        edit.lifecycle !== undefined ||
        (edit.networks ?? []).some((network) =>
          network.enabled !== undefined ||
          network.lifecycle !== undefined ||
          network.requiresMemo !== undefined
        )
      );
      if (invalidatesProviderProofs) await invalidateWhitebitDepositRouteProofs(tx);
      for (const edit of input.edits) {
        const assetChanges: JsonRecord = {};
        for (const key of ["enabled", "lifecycle", "decimals"] as const) {
          if (edit[key] !== undefined) assetChanges[key] = edit[key];
        }
        if (Object.keys(assetChanges).length > 0) {
          await tx.update(cryptoAssetsTable)
            .set(assetChanges as never)
            .where(eq(cryptoAssetsTable.id, edit.assetId));
        }
        for (const networkEdit of edit.networks ?? []) {
          const currentNetwork = networkById.get(networkEdit.networkId);
          if (!currentNetwork) {
            throw new ApiError("CRYPTO_ASSET_NETWORK_NOT_FOUND", "One or more crypto network rows were not found.", 404);
          }
          const networkChanges: JsonRecord = {};
          for (const key of [
            "enabled",
            "customerDepositsEnabled",
            "lifecycle",
            "regions",
            "decimals",
            "requiresMemo",
            "sharedDepositAddress",
            "sharedDepositMemo",
          ] as const) {
            if (networkEdit[key] !== undefined) networkChanges[key] = networkEdit[key];
          }
          const changesDepositEligibility =
            networkEdit.enabled !== undefined ||
            networkEdit.lifecycle !== undefined ||
            networkEdit.requiresMemo !== undefined;
          if (changesDepositEligibility) {
            const currentAsset = assetById.get(edit.assetId);
            const nextAsset = { ...currentAsset, ...assetChanges };
            const nextNetwork = { ...currentNetwork, ...networkEdit };
            networkChanges.customerDepositsEnabled = Boolean(
              nextAsset.enabled &&
              nextAsset.lifecycle !== "deprecated" &&
              nextNetwork.enabled &&
              nextNetwork.lifecycle !== "deprecated" &&
              nextNetwork.depositProvider === "manual" &&
              hasUsableSavedReceivingWallet(nextNetwork),
            );
          }
          if (Object.keys(networkChanges).length > 0) {
            await tx.update(cryptoAssetNetworksTable)
              .set(networkChanges as never)
              .where(eq(cryptoAssetNetworksTable.id, networkEdit.networkId));
          }
        }
      }
      const updatedAssets = await tx.select().from(cryptoAssetsTable)
        .where(inArray(cryptoAssetsTable.id, assetIds));
      const updatedNetworks = networkIds.length === 0
        ? []
        : await tx.select().from(cryptoAssetNetworksTable)
          .where(inArray(cryptoAssetNetworksTable.id, networkIds));
      req.log.info(
        { assetCount: updatedAssets.length, networkCount: updatedNetworks.length },
        "Applied crypto asset bulk edit",
      );
      return ApplyCryptoAssetsBulkEditResponse.parse({
        assets: updatedAssets.map(outputCryptoAsset),
        networks: updatedNetworks.map(row => outputCryptoNetwork(row)),
      });
    });
    res.json(result);
  } catch (e) { next(e); }
});
router.patch("/admin/crypto-assets/:id", requireOperator, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const input = cryptoInput(req.body, false, true);
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
      await verifyCatalogPath(tx, input.logoObjectPath, "crypto-asset-logos");
      const invalidatesProviderProofs = ["code", "enabled", "lifecycle"]
        .some((key) => Object.hasOwn(input, key));
      if (invalidatesProviderProofs) {
        await invalidateWhitebitDepositRouteProofs(tx);
      }
      const [updated] = await tx.update(cryptoAssetsTable)
        .set(input as never)
        .where(eq(cryptoAssetsTable.id, id))
        .returning();
      return updated;
    });
    if (!row) throw new ApiError("CRYPTO_ASSET_NOT_FOUND", "Crypto asset not found.", 404);
    res.json(outputCryptoAsset(row));
  } catch (e) { next(e); }
});
router.delete("/admin/crypto-assets/:id", requireOperator, async (req, res, next) => {
  try { const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id; const row = await db.transaction(async (tx) => { await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`); await invalidateWhitebitDepositRouteProofs(tx); await tx.update(cryptoAssetNetworksTable).set({ customerDepositsEnabled: false }).where(eq(cryptoAssetNetworksTable.assetId, id)); return tx.delete(cryptoAssetsTable).where(eq(cryptoAssetsTable.id, id)).returning().then(([deleted]) => deleted); }); if (!row) throw new ApiError("CRYPTO_ASSET_NOT_FOUND", "Crypto asset not found.", 404); res.sendStatus(204); } catch (e) { next(e); }
});
router.put("/admin/crypto-assets/:id/receiving-wallet", requireOwner, async (req, res, next) => {
  try {
    const { id: assetId } = SaveCryptoAssetReceivingWalletParams.parse(req.params);
    const input = SaveCryptoAssetReceivingWalletBody.parse(req.body);
    const actor = res.locals.operator as OperatorAuthorization;
    const actorClerkUserId = getOperatorActorUserId(req);
    const eligibilityContext = await createCustomerDepositEligibilityContext();
    const [asset] = await db.select()
      .from(cryptoAssetsTable)
      .where(eq(cryptoAssetsTable.id, assetId))
      .limit(1);
    if (!asset) throw new ApiError("CRYPTO_ASSET_NOT_FOUND", "Crypto asset not found.", 404);
    const selectedRoute = await db.select({
      id: cryptoAssetNetworksTable.id,
      networkCode: cryptoAssetNetworksTable.networkCode,
      sharedDepositAddress: cryptoAssetNetworksTable.sharedDepositAddress,
      sharedDepositMemo: cryptoAssetNetworksTable.sharedDepositMemo,
    }).from(cryptoAssetNetworksTable).where(and(
      eq(cryptoAssetNetworksTable.id, input.networkId),
      eq(cryptoAssetNetworksTable.assetId, assetId),
    )).limit(1);
    if (!selectedRoute[0]) {
      throw new ApiError(
        "CRYPTO_ASSET_NETWORK_NOT_FOUND",
        "The selected asset network was not found for this asset.",
        404,
      );
    }
    const affectedRouteIds = input.useForAllAssetsOnNetwork
      ? (await db.select({ id: cryptoAssetNetworksTable.id })
        .from(cryptoAssetNetworksTable)
        .where(eq(cryptoAssetNetworksTable.networkCode, selectedRoute[0].networkCode))).map(row => row.id)
      : [selectedRoute[0].id];
    const fallbackByRoute = await db.select({
      id: cryptoAssetNetworksTable.id,
      sharedDepositAddress: cryptoAssetNetworksTable.sharedDepositAddress,
    }).from(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, affectedRouteIds));
    const manualReadiness = input.depositProvider === "manual"
      ? await prepareManualMonitoringReadiness(
        affectedRouteIds.map(routeId => ({
          routeId,
          address: input.walletAddress.trim() ||
            fallbackByRoute.find(row => row.id === routeId)?.sharedDepositAddress || "",
          memo: input.memo,
        })),
      )
      : new Map<string, ManualMonitoringReadiness>();
    const rows = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))`,
      );
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
      await assertCustomerDepositEligibilityContextCurrent(tx, eligibilityContext);
      const [selected] = await tx
        .select()
        .from(cryptoAssetNetworksTable)
        .where(and(
          eq(cryptoAssetNetworksTable.id, input.networkId),
          eq(cryptoAssetNetworksTable.assetId, assetId),
        ))
        .for("update")
        .limit(1);
      if (!selected) {
        throw new ApiError(
          "CRYPTO_ASSET_NETWORK_NOT_FOUND",
          "The selected asset network was not found for this asset.",
          404,
        );
      }
      const availableProviders = await listConnectedDepositProviderOptions();
      if (!availableProviders.some((provider) => provider.id === input.depositProvider)) {
        throw new ApiError(
          "CRYPTO_DEPOSIT_PROVIDER_UNAVAILABLE",
          "The selected deposit provider is not connected and enabled in API Integrations.",
          422,
        );
      }
      const affected = input.useForAllAssetsOnNetwork
        ? await tx
          .select()
          .from(cryptoAssetNetworksTable)
          .where(eq(cryptoAssetNetworksTable.networkCode, selected.networkCode))
          .for("update")
        : [selected];
      const affectedAssets = await tx.select({
        id: cryptoAssetsTable.id,
        code: cryptoAssetsTable.code,
        enabled: cryptoAssetsTable.enabled,
        lifecycle: cryptoAssetsTable.lifecycle,
      }).from(cryptoAssetsTable)
        .where(inArray(cryptoAssetsTable.id, [...new Set(affected.map(network => network.assetId))]));
      const assetById = new Map(affectedAssets.map(candidate => [candidate.id, candidate]));
      const fallbackMemo = input.memo?.trim() || "";
      const providerChanged = input.depositProvider !== selected.depositProvider;
      if (providerChanged) await invalidateWhitebitDepositRouteProofs(tx);
      const effectiveEligibilityContext = providerChanged
        ? {
            whitebitReady: false,
            whitebitCapabilities: null,
            whitebitProofs: new Map<string, string>(),
            credentialUpdatedAtMs: null,
            providerSettingVersion: null,
          }
        : eligibilityContext;
      for (const network of affected) {
        const fallbackAddress = input.walletAddress.trim() || network.sharedDepositAddress;
        const nextProvider = network.id === selected.id ? input.depositProvider : network.depositProvider;
        const nextNetwork = {
          ...network,
          depositProvider: nextProvider,
          sharedDepositAddress: fallbackAddress,
          sharedDepositMemo: fallbackMemo || null,
        };
        const readiness = manualReadiness.get(network.id);
        if (input.depositProvider === "manual" && readiness?.ready &&
            readiness.code !== "LEGACY_BEP20") {
          const [currentMonitor] = await tx.select().from(blockchainMonitorNetworksTable)
            .where(eq(blockchainMonitorNetworksTable.id, readiness.monitorNetworkId!))
            .for("update")
            .limit(1);
          const [currentAsset] = currentMonitor
            ? await tx.select().from(blockchainMonitorAssetsTable).where(and(
              eq(blockchainMonitorAssetsTable.monitorNetworkId, currentMonitor.id),
              eq(blockchainMonitorAssetsTable.assetNetworkId, network.id),
            )).for("update").limit(1)
            : [];
          const currentConfig = currentMonitor ? adapterConfig(currentMonitor) : undefined;
          const currentFingerprint = currentMonitor && currentAsset && currentConfig &&
            currentMonitor.healthCheckedAt && currentMonitor.lastHead
            ? manualMonitoringProofFingerprint({
              network: currentMonitor,
              asset: currentAsset,
               route: {
                 ...network,
                 sharedDepositAddress: fallbackAddress,
                 sharedDepositMemo: fallbackMemo || null,
               },
              endpoint: currentConfig.endpoint,
              apiKey: currentConfig.apiKey,
              capturedAt: currentMonitor.healthCheckedAt,
              head: currentMonitor.lastHead,
            })
            : undefined;
          if (!currentFingerprint || currentFingerprint !== readiness.proofFingerprint) {
            readiness.code = "CONFIG_CHANGED_RETRY";
            readiness.message = "Monitoring configuration changed while saving; retry the save.";
            readiness.ready = false;
          } else {
            await tx.update(blockchainMonitorAssetsTable).set({
              enabled: true,
              readinessProofFingerprint: currentFingerprint,
              readinessProofCapturedAt: currentMonitor.healthCheckedAt,
            }).where(and(
              eq(blockchainMonitorAssetsTable.id, currentAsset.id),
              eq(blockchainMonitorAssetsTable.assetNetworkId, network.id),
            ));
          }
        }
        if (
          nextProvider !== "none" &&
          fallbackAddress &&
          !isSyntacticallyValidManualWalletAddress(nextNetwork, fallbackAddress)
        ) {
          if (nextProvider !== "manual" || manualReadiness.get(network.id)?.code === "LEGACY_BEP20") throw new ApiError(
            "CRYPTO_DEPOSIT_ADDRESS_INVALID",
            `The receiving address is invalid for ${network.networkCode}.`,
            422,
          );
        }
        if (
          fallbackMemo &&
          !isSyntacticallyValidManualWalletMemo(nextNetwork, fallbackMemo)
        ) {
          if (nextProvider !== "manual" || manualReadiness.get(network.id)?.code === "LEGACY_BEP20") throw new ApiError(
            "CRYPTO_DEPOSIT_MEMO_INVALID",
            `The receiving memo or tag is invalid for ${network.networkCode}.`,
            422,
          );
        }
        if (input.enabled && nextProvider === "manual" && !fallbackAddress && !manualReadiness.get(network.id)?.ready) {
          // The address is still persisted, but customer deposits remain disabled.
        } else if (input.enabled && nextProvider === "manual" && !fallbackAddress) {
          throw new ApiError(
            "CRYPTO_DEPOSIT_ADDRESS_REQUIRED",
            "A valid receiving address is required before manual customer deposits can be enabled.",
            422,
          );
        }
        if (
          input.enabled &&
          nextProvider === "manual" &&
          network.requiresMemo &&
          !fallbackMemo
        ) {
          if (manualReadiness.get(network.id)?.ready !== false) throw new ApiError(
            "CRYPTO_DEPOSIT_MEMO_REQUIRED",
            `A memo or tag is required before ${network.networkCode} customer deposits can be enabled.`,
            422,
          );
        }
        const eligible = isCustomerDepositEligible(
          assetById.get(network.assetId) ?? asset,
          nextNetwork,
          effectiveEligibilityContext,
        );
        if (
          input.enabled &&
          nextProvider !== "none" &&
          !eligible &&
          !(nextProvider === "manual" && manualReadiness.get(network.id)?.ready === false)
        ) {
          throw new ApiError(
            "CRYPTO_DEPOSIT_VERIFICATION_REQUIRED",
            "Customer deposits can only be enabled with a valid manual wallet or a verified provider route.",
            422,
          );
        }
        const nextEnabled = input.enabled &&
          eligible &&
          (nextProvider !== "manual" || manualReadiness.get(network.id)?.ready === true);
        await tx.update(cryptoAssetNetworksTable).set({
          sharedDepositAddress: fallbackAddress,
          sharedDepositMemo: fallbackMemo || null,
          customerDepositsEnabled: nextEnabled,
          ...(network.id === selected.id ? { depositProvider: input.depositProvider } : {}),
        }).where(eq(cryptoAssetNetworksTable.id, network.id));
      }
      const updated = await tx.select().from(cryptoAssetNetworksTable)
        .where(input.useForAllAssetsOnNetwork
          ? eq(cryptoAssetNetworksTable.networkCode, selected.networkCode)
          : eq(cryptoAssetNetworksTable.id, selected.id));
      const fingerprint = (value: string | null | undefined) =>
        value
          ? createHash("sha256").update(value).digest("hex")
          : null;
      const updatedById = new Map(updated.map(network => [network.id, network]));
      await tx.insert(operatorAuditLogsTable).values({
        action: "crypto_receiving_wallet.updated",
        actorClerkUserId,
        targetOperatorId: actor.id,
        targetEmail: actor.email,
        requestId: String(req.id),
        details: {
          assetId,
          selectedNetworkId: selected.id,
          affectedNetworkIds: updated.map(network => network.id),
          networkCode: selected.networkCode,
          providerBefore: selected.depositProvider,
          providerAfter: input.depositProvider,
          enabledBefore: selected.customerDepositsEnabled,
          enabledAfter: updated.find(network => network.id === selected.id)?.customerDepositsEnabled ?? false,
          addressBeforeFingerprint: fingerprint(selected.sharedDepositAddress),
          addressAfterFingerprint: fingerprint(input.walletAddress.trim() || selected.sharedDepositAddress),
          memoBeforeFingerprint: fingerprint(selected.sharedDepositMemo),
          memoAfterFingerprint: fingerprint(fallbackMemo),
          useForAllAssetsOnNetwork: input.useForAllAssetsOnNetwork,
          changes: affected.map(before => {
            const after = updatedById.get(before.id);
            return {
              networkId: before.id,
              providerBefore: before.depositProvider,
              providerAfter: after?.depositProvider ?? before.depositProvider,
              enabledBefore: before.customerDepositsEnabled,
              enabledAfter: after?.customerDepositsEnabled ?? false,
              addressBeforeFingerprint: fingerprint(before.sharedDepositAddress),
              addressAfterFingerprint: fingerprint(after?.sharedDepositAddress),
              memoBeforeFingerprint: fingerprint(before.sharedDepositMemo),
              memoAfterFingerprint: fingerprint(after?.sharedDepositMemo),
            };
          }),
        },
      });
      req.log.info(
        {
          assetId,
          selectedNetworkId: selected.id,
          networkCode: selected.networkCode,
          affectedRows: updated.length,
          useForAllAssetsOnNetwork: input.useForAllAssetsOnNetwork,
          enabled: input.enabled,
        },
        "Saved crypto receiving wallet configuration",
      );
      return updated;
    });
    res.json(rows.map(row => outputCryptoNetwork(row, manualReadiness.get(row.id))));
  } catch (e) { next(e); }
});
router.post("/admin/crypto-networks/receiving-wallet/preview", requireOwner, async (req, res, next) => {
  try {
    const input = PreviewCryptoNetworkReceivingWalletBody.parse(req.body);
    const selected = await db.select().from(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, input.networkIds));
    if (selected.length !== input.networkIds.length) {
      throw new ApiError(
        "CRYPTO_ASSET_NETWORK_NOT_FOUND",
        "One or more selected crypto network rows were not found.",
        404,
      );
    }
    const selectedById = new Map(selected.map(network => [network.id, network]));
    const manualInputs = input.networkIds.flatMap(routeId => {
      const network = selectedById.get(routeId)!;
      const provider = input.preserveDepositProviders
        ? network.depositProvider
        : input.depositProvider ?? network.depositProvider;
      return provider === "manual"
        ? [{
            routeId,
            address: input.walletAddress.trim() || network.sharedDepositAddress,
            memo: input.memo,
          }]
        : [];
    });
    const readinessById = manualInputs.length
      ? await prepareManualMonitoringReadiness(manualInputs)
      : new Map<string, ManualMonitoringReadiness>();
    const rows = input.networkIds.map(routeId => {
      const network = selectedById.get(routeId)!;
      const provider = input.preserveDepositProviders
        ? network.depositProvider
        : input.depositProvider ?? network.depositProvider;
      const address = input.walletAddress.trim() || network.sharedDepositAddress;
      const memo = input.memo?.trim() || null;
      let readiness = readinessById.get(routeId);
      const networkEnabled = input.networkEnabled ?? network.enabled;
      if (input.enabled) {
        if (
          !networkEnabled ||
          network.lifecycle === "deprecated" ||
          network.executionMode !== "manual"
        ) {
          readiness = {
            routeId,
            code: "CONFIG_CHANGED_RETRY",
            message: "This exact route must be enabled, active, and use Manual execution.",
            ready: false,
            networkCode: network.networkCode,
          };
        } else if (provider !== "manual") {
          readiness = {
            routeId,
            code: "PROVIDER_INCOMPATIBLE",
            message: "Customer Deposits require the existing manual deposit provider for this route.",
            ready: false,
            networkCode: network.networkCode,
          };
        } else if (readiness?.code === "LEGACY_BEP20") {
          readiness = { ...readiness, ready: false };
        }
      }
      return outputCryptoNetwork({
        ...network,
        enabled: networkEnabled,
        sharedDepositAddress: address,
        sharedDepositMemo: memo,
        depositProvider: provider,
        customerDepositsEnabled: input.enabled
          ? readiness?.ready === true
          : false,
      }, readiness);
    });
    res.json(rows);
  } catch (error) {
    next(error);
  }
});
router.put("/admin/crypto-networks/receiving-wallet", requireOwner, async (req, res, next) => {
  try {
    const input = SaveCryptoNetworkReceivingWalletBody.parse(req.body);
    const actor = res.locals.operator as OperatorAuthorization;
    const actorClerkUserId = getOperatorActorUserId(req);
    const eligibilityContext = await createCustomerDepositEligibilityContext();
    const selectedForReadiness = await db.select().from(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, input.networkIds));
    const selectedForReadinessById = new Map(selectedForReadiness.map(row => [row.id, row]));
    const manualInputs = input.networkIds.flatMap(routeId => {
      const row = selectedForReadinessById.get(routeId);
      if (!row) return [];
      const provider = input.preserveDepositProviders
        ? row.depositProvider
        : input.depositProvider ?? row.depositProvider;
      return provider === "manual"
        ? [{
            routeId,
            address: input.walletAddress.trim() || row.sharedDepositAddress,
            memo: input.memo,
          }]
        : [];
    });
    const manualReadiness = manualInputs.length
      ? await prepareManualMonitoringReadiness(manualInputs)
      : new Map<string, ManualMonitoringReadiness>();
    const rows = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))`,
      );
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
      await assertCustomerDepositEligibilityContextCurrent(tx, eligibilityContext);
      const selected = await tx.select().from(cryptoAssetNetworksTable)
        .where(inArray(cryptoAssetNetworksTable.id, input.networkIds))
        .for("update");
      if (selected.length !== input.networkIds.length) {
        throw new ApiError(
          "CRYPTO_ASSET_NETWORK_NOT_FOUND",
          "One or more selected crypto network rows were not found.",
          404,
        );
      }
      const availableProviders = await listConnectedDepositProviderOptions();
       if (
         !input.preserveDepositProviders &&
         input.depositProvider &&
         !availableProviders.some((provider) => provider.id === input.depositProvider)
       ) {
        throw new ApiError(
          "CRYPTO_DEPOSIT_PROVIDER_UNAVAILABLE",
          "The selected deposit provider is not connected and enabled in API Integrations.",
          422,
        );
      }
      const affectedAssets = await tx.select({
        id: cryptoAssetsTable.id,
        code: cryptoAssetsTable.code,
        enabled: cryptoAssetsTable.enabled,
        lifecycle: cryptoAssetsTable.lifecycle,
      }).from(cryptoAssetsTable)
        .where(inArray(cryptoAssetsTable.id, [...new Set(selected.map(network => network.assetId))]));
      const assetById = new Map(affectedAssets.map(asset => [asset.id, asset]));
      if (assetById.size !== new Set(selected.map(network => network.assetId)).size) {
        throw new ApiError("CRYPTO_ASSET_NOT_FOUND", "One or more parent assets were not found.", 404);
      }
       const providerChanged = !input.preserveDepositProviders &&
         Boolean(input.depositProvider) &&
         selected.some(network => network.depositProvider !== input.depositProvider);
      if (providerChanged) await invalidateWhitebitDepositRouteProofs(tx);
      const effectiveEligibilityContext = providerChanged
        ? {
            whitebitReady: false,
            whitebitCapabilities: null,
            whitebitProofs: new Map<string, string>(),
            credentialUpdatedAtMs: null,
            providerSettingVersion: null,
          }
        : eligibilityContext;
      const memo = input.memo?.trim() || "";
      for (const network of selected) {
        const address = input.walletAddress.trim() || network.sharedDepositAddress;
        const networkEnabled = input.networkEnabled ?? network.enabled;
         const nextProvider = input.preserveDepositProviders
           ? network.depositProvider
           : input.depositProvider ?? network.depositProvider;
         const customerDepositsEnabled = input.enabled ?? network.customerDepositsEnabled;
        const nextNetwork = {
          ...network,
          enabled: networkEnabled,
           depositProvider: nextProvider,
          sharedDepositAddress: address,
          sharedDepositMemo: memo || null,
        };
         let readiness = manualReadiness.get(network.id);
         if (input.enabled) {
           if (
             !networkEnabled ||
             network.lifecycle === "deprecated" ||
             network.executionMode !== "manual"
           ) {
             readiness = {
               routeId: network.id,
               code: "CONFIG_CHANGED_RETRY",
               message: "This exact route must be enabled, active, and use Manual execution.",
               ready: false,
               networkCode: network.networkCode,
             };
             manualReadiness.set(network.id, readiness);
           } else if (nextProvider !== "manual") {
             readiness = {
               routeId: network.id,
               code: "PROVIDER_INCOMPATIBLE",
               message: "Customer Deposits require the existing manual deposit provider for this route.",
               ready: false,
               networkCode: network.networkCode,
             };
             manualReadiness.set(network.id, readiness);
           } else if (readiness?.code === "LEGACY_BEP20") {
             readiness.ready = false;
           }
         }
         if (nextProvider === "manual" && readiness?.ready &&
            readiness.code !== "LEGACY_BEP20") {
          const [currentMonitor] = await tx.select().from(blockchainMonitorNetworksTable)
            .where(eq(blockchainMonitorNetworksTable.id, readiness.monitorNetworkId!))
            .for("update")
            .limit(1);
          const [currentAsset] = currentMonitor
            ? await tx.select().from(blockchainMonitorAssetsTable).where(and(
              eq(blockchainMonitorAssetsTable.monitorNetworkId, currentMonitor.id),
              eq(blockchainMonitorAssetsTable.assetNetworkId, network.id),
            )).for("update").limit(1)
            : [];
          const currentConfig = currentMonitor ? adapterConfig(currentMonitor) : undefined;
          const currentFingerprint = currentMonitor && currentAsset && currentConfig &&
            currentMonitor.healthCheckedAt && currentMonitor.lastHead
            ? manualMonitoringProofFingerprint({
              network: currentMonitor,
              asset: currentAsset,
               route: {
                 ...network,
                 sharedDepositAddress: address,
                 sharedDepositMemo: memo || null,
               },
              endpoint: currentConfig.endpoint,
              apiKey: currentConfig.apiKey,
              capturedAt: currentMonitor.healthCheckedAt,
              head: currentMonitor.lastHead,
            })
            : undefined;
           if (
             !currentMonitor.enabled ||
             !currentAsset.enabled ||
             !currentFingerprint ||
             currentFingerprint !== readiness.proofFingerprint
           ) {
            readiness.code = "CONFIG_CHANGED_RETRY";
            readiness.message = "Monitoring configuration changed while saving; retry the save.";
            readiness.ready = false;
          } else {
            await tx.update(blockchainMonitorAssetsTable).set({
              readinessProofFingerprint: currentFingerprint,
              readinessProofCapturedAt: currentMonitor.healthCheckedAt,
            }).where(and(
              eq(blockchainMonitorAssetsTable.id, currentAsset.id),
              eq(blockchainMonitorAssetsTable.assetNetworkId, network.id),
            ));
          }
        }
        if (
           nextProvider !== "none" &&
          address &&
          !isSyntacticallyValidManualWalletAddress(nextNetwork, address)
        ) {
           if (nextProvider !== "manual" || manualReadiness.get(network.id)?.code === "LEGACY_BEP20") throw new ApiError(
            "CRYPTO_DEPOSIT_ADDRESS_INVALID",
            `The receiving address is invalid for ${network.networkCode}.`,
            422,
          );
        }
        if (memo && !isSyntacticallyValidManualWalletMemo(nextNetwork, memo)) {
           if (nextProvider !== "manual" || manualReadiness.get(network.id)?.code === "LEGACY_BEP20") throw new ApiError(
            "CRYPTO_DEPOSIT_MEMO_INVALID",
            `The receiving memo or tag is invalid for ${network.networkCode}.`,
            422,
          );
        }
         if (customerDepositsEnabled && nextProvider === "manual" && !address &&
            manualReadiness.get(network.id)?.ready !== false) {
          throw new ApiError(
            "CRYPTO_DEPOSIT_ADDRESS_REQUIRED",
            "A valid receiving address is required before manual customer deposits can be enabled.",
            422,
          );
        }
         if (customerDepositsEnabled && nextProvider === "manual" && network.requiresMemo && !memo) {
          if (manualReadiness.get(network.id)?.ready !== false) throw new ApiError(
            "CRYPTO_DEPOSIT_MEMO_REQUIRED",
            `A memo or tag is required before ${network.networkCode} customer deposits can be enabled.`,
            422,
          );
        }
        const eligible = isCustomerDepositEligible(
          assetById.get(network.assetId)!,
          nextNetwork,
          effectiveEligibilityContext,
        );
        if (
          customerDepositsEnabled &&
           nextProvider !== "none" &&
          !eligible &&
           !(nextProvider === "manual" && manualReadiness.get(network.id)?.ready === false)
        ) {
          throw new ApiError(
            "CRYPTO_DEPOSIT_VERIFICATION_REQUIRED",
            `Customer deposits cannot be enabled for ${network.networkCode} without a valid wallet or verified provider route.`,
            422,
          );
        }
        await tx.update(cryptoAssetNetworksTable).set({
          enabled: networkEnabled,
           depositProvider: nextProvider,
          sharedDepositAddress: address,
          sharedDepositMemo: memo || null,
           customerDepositsEnabled: networkEnabled &&
             customerDepositsEnabled &&
             eligible &&
              nextProvider === "manual" &&
              manualReadiness.get(network.id)?.ready === true &&
              manualReadiness.get(network.id)?.code !== "LEGACY_BEP20" &&
              network.lifecycle !== "deprecated" &&
              network.executionMode === "manual",
        }).where(eq(cryptoAssetNetworksTable.id, network.id));
      }
      const updated = await tx.select().from(cryptoAssetNetworksTable)
        .where(inArray(cryptoAssetNetworksTable.id, input.networkIds));
      const updatedById = new Map(updated.map(network => [network.id, network]));
      const fingerprint = (value: string | null | undefined) =>
        value ? createHash("sha256").update(value).digest("hex") : null;
      await tx.insert(operatorAuditLogsTable).values({
        action: "crypto_network_receiving_wallet.bulk_updated",
        actorClerkUserId,
        targetOperatorId: actor.id,
        targetEmail: actor.email,
        requestId: String(req.id),
        details: {
          affectedNetworkIds: input.networkIds,
           providerAfter: input.preserveDepositProviders
             ? "preserved"
             : input.depositProvider ?? "preserved",
          networkEnabledAfter: input.networkEnabled ?? "preserved",
          enabledAfter: input.enabled ?? "preserved",
          changes: selected.map(before => {
            const after = updatedById.get(before.id);
            return {
              networkId: before.id,
              providerBefore: before.depositProvider,
              providerAfter: after?.depositProvider,
              enabledBefore: before.customerDepositsEnabled,
              enabledAfter: after?.customerDepositsEnabled,
              addressBeforeFingerprint: fingerprint(before.sharedDepositAddress),
              addressAfterFingerprint: fingerprint(after?.sharedDepositAddress),
              memoBeforeFingerprint: fingerprint(before.sharedDepositMemo),
              memoAfterFingerprint: fingerprint(after?.sharedDepositMemo),
            };
          }),
        },
      });
      return updated;
    });
    res.json(rows.map(row => outputCryptoNetwork(row, manualReadiness.get(row.id))));
  } catch (error) {
    next(error);
  }
});
router.get("/admin/crypto-networks", requireOperator, async (_req, res, next) => {
  try {
    const rows = await db.select().from(cryptoAssetNetworksTable).orderBy(
      desc(cryptoAssetNetworksTable.enabled),
      sql`case ${cryptoAssetNetworksTable.lifecycle} when 'active' then 0 when 'restricted' then 1 when 'deprecated' then 2 else 3 end`,
      asc(cryptoAssetNetworksTable.networkName),
      asc(cryptoAssetNetworksTable.networkCode),
      asc(cryptoAssetNetworksTable.assetId),
      asc(cryptoAssetNetworksTable.id),
    );
    res.json(rows.map(row => outputCryptoNetwork(row)));
  } catch (e) { next(e); }
});
router.get("/admin/deposit-providers", requireOperator, async (_req, res, next) => {
  try {
    res.json(await listConnectedDepositProviderOptions());
  } catch (error) {
    next(error);
  }
});
router.patch("/admin/crypto-networks/:id/customer-deposits", requireOwner, async (req, res, next) => {
  try {
    const { id } = UpdateCryptoNetworkCustomerDepositsParams.parse(req.params);
    const input = UpdateCryptoNetworkCustomerDepositsBody.parse(req.body);
    const actor = res.locals.operator as OperatorAuthorization;
    const actorClerkUserId = getOperatorActorUserId(req);
    const [current] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, id))
      .limit(1);
    if (!current) {
      throw new ApiError("CRYPTO_NETWORK_NOT_FOUND", "Crypto network not found.", 404);
    }

    const readiness = input.enabled
      ? (await prepareManualMonitoringReadiness([{
          routeId: current.id,
          address: current.sharedDepositAddress,
          memo: current.sharedDepositMemo,
        }])).get(current.id)
      : undefined;
    if (input.enabled && (!readiness?.ready || readiness.code === "LEGACY_BEP20")) {
      throw new ApiError(
        "CRYPTO_DEPOSIT_READINESS_BLOCKED",
        readiness
          ? `${readiness.code}: ${readiness.message}`
          : "Monitoring readiness could not be verified for this exact route.",
        409,
      );
    }

    const updated = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(cryptoAssetNetworksTable)
        .where(eq(cryptoAssetNetworksTable.id, id))
        .for("update")
        .limit(1);
      if (!locked) {
        throw new ApiError("CRYPTO_NETWORK_NOT_FOUND", "Crypto network not found.", 404);
      }
      if (
        input.enabled &&
        (!locked.enabled ||
          locked.lifecycle === "deprecated" ||
          locked.executionMode !== "manual" ||
          locked.depositProvider !== "manual")
      ) {
        throw new ApiError(
          "CRYPTO_DEPOSIT_ROUTE_BLOCKED",
          "This exact Asset + Network route must be enabled, active, Manual, and use the manual deposit provider.",
          409,
        );
      }
      if (input.enabled && readiness) {
        const [monitor] = await tx.select().from(blockchainMonitorNetworksTable)
          .where(eq(blockchainMonitorNetworksTable.id, readiness.monitorNetworkId!))
          .for("update")
          .limit(1);
        const [monitorAsset] = monitor
          ? await tx.select().from(blockchainMonitorAssetsTable).where(and(
              eq(blockchainMonitorAssetsTable.id, readiness.monitorAssetId!),
              eq(blockchainMonitorAssetsTable.assetNetworkId, locked.id),
            )).for("update").limit(1)
          : [];
        const config = monitor ? adapterConfig(monitor) : undefined;
        const currentProof = monitor && monitorAsset && config &&
          monitor.healthCheckedAt && monitor.lastHead
          ? manualMonitoringProofFingerprint({
              network: monitor,
              asset: monitorAsset,
              route: locked,
              endpoint: config.endpoint,
              apiKey: config.apiKey,
              capturedAt: monitor.healthCheckedAt,
              head: monitor.lastHead,
            })
          : undefined;
        if (
          !monitor?.enabled ||
          !monitorAsset?.enabled ||
          !currentProof ||
          currentProof !== readiness.proofFingerprint ||
          monitorAsset.readinessProofFingerprint !== currentProof
        ) {
          throw new ApiError(
            "CRYPTO_DEPOSIT_READINESS_CHANGED",
            "CONFIG_CHANGED_RETRY: Monitoring configuration changed while enabling this route. Refresh and try again.",
            409,
          );
        }
      }
      const [row] = await tx.update(cryptoAssetNetworksTable)
        .set({ customerDepositsEnabled: input.enabled })
        .where(eq(cryptoAssetNetworksTable.id, locked.id))
        .returning();
      await tx.insert(operatorAuditLogsTable).values({
        action: "crypto_customer_deposits.updated",
        actorClerkUserId,
        targetOperatorId: actor.id,
        targetEmail: actor.email,
        requestId: String(req.id),
        details: {
          assetNetworkId: locked.id,
          assetId: locked.assetId,
          networkCode: locked.networkCode,
          enabledBefore: locked.customerDepositsEnabled,
          enabledAfter: input.enabled,
        },
      });
      return row!;
    });
    res.json(UpdateCryptoNetworkCustomerDepositsResponse.parse(
      outputCryptoNetwork(updated, readiness),
    ));
  } catch (error) {
    next(error);
  }
});
router.post("/admin/crypto-networks", requireOperator, async (req, res, next) => {
  try {
    const input = cryptoInput(req.body, true);
    if (input.customerDepositsEnabled === true) {
      throw new ApiError(
        "CRYPTO_DEPOSIT_VERIFICATION_REQUIRED",
        "New crypto networks start unavailable until their provider route or saved wallet is verified.",
        422,
      );
    }
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
      await verifyCatalogPath(tx, input.logoObjectPath, "crypto-network-logos");
      const [created] = await tx.insert(cryptoAssetNetworksTable).values({
        ...input,
        enabled: input.enabled ?? true,
        customerDepositsEnabled: false,
        requiresMemo: input.requiresMemo ?? false,
        requiredConfirmations: input.requiredConfirmations ?? 0,
        sharedDepositAddress: input.sharedDepositAddress ?? "",
      } as never).returning();
      return created;
    });
    res.status(201).json(outputCryptoNetwork(row));
  } catch (e) {
    next(isUniqueViolation(e)
      ? new ApiError("CRYPTO_NETWORK_EXISTS", "Crypto network already exists.", 409)
      : e);
  }
});
router.patch("/admin/crypto-networks/:id", requireOperator, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [current] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, id)).limit(1);
    if (!current) throw new ApiError("CRYPTO_NETWORK_NOT_FOUND", "Crypto network not found.", 404);
    const input = cryptoInput(req.body, true, true);
    if (input.customerDepositsEnabled === true) {
      throw new ApiError(
        "CRYPTO_DEPOSIT_VERIFICATION_REQUIRED",
        "Customer deposit availability is derived from a verified provider route or a valid saved wallet.",
        422,
      );
    }
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
      await verifyCatalogPath(tx, input.logoObjectPath, "crypto-network-logos");
      const [locked] = await tx.select().from(cryptoAssetNetworksTable)
        .where(eq(cryptoAssetNetworksTable.id, id))
        .for("update")
        .limit(1);
      if (!locked) throw new ApiError("CRYPTO_NETWORK_NOT_FOUND", "Crypto network not found.", 404);
      const depositEligibilityKeys = [
        "networkCode",
        "networkName",
        "networkFamily",
        "depositProvider",
        "requiresMemo",
        "enabled",
        "lifecycle",
      ] as const;
      const changesDepositEligibility = depositEligibilityKeys.some((key) =>
        Object.hasOwn(input, key) && input[key] !== locked[key]
      );
      const invalidatesProviderProofs =
        changesDepositEligibility &&
        (locked.depositProvider === "whitebit" || input.depositProvider === "whitebit");
      if (invalidatesProviderProofs) await invalidateWhitebitDepositRouteProofs(tx);
      const nextNetwork = { ...locked, ...input };
      const [asset] = await tx.select().from(cryptoAssetsTable)
        .where(eq(cryptoAssetsTable.id, locked.assetId))
        .limit(1);
      if (!asset) throw new ApiError("CRYPTO_ASSET_NOT_FOUND", "Crypto asset not found.", 404);
      const derivedCustomerDepositsEnabled = changesDepositEligibility
        ? Boolean(
            asset.enabled &&
            asset.lifecycle !== "deprecated" &&
            nextNetwork.enabled &&
            nextNetwork.lifecycle !== "deprecated" &&
            nextNetwork.depositProvider === "manual" &&
            hasUsableSavedReceivingWallet(nextNetwork),
          )
        : locked.customerDepositsEnabled;
      const [updated] = await tx.update(cryptoAssetNetworksTable).set({
        ...input,
        customerDepositsEnabled:
          input.customerDepositsEnabled === false
            ? false
            : derivedCustomerDepositsEnabled,
      } as never)
        .where(eq(cryptoAssetNetworksTable.id, id)).returning();
      return updated;
    });
    res.json(outputCryptoNetwork(row));
  } catch (e) { next(e); }
});
router.delete("/admin/crypto-networks/:id", requireOperator, async (req, res, next) => {
  try { const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id; const row = await db.transaction(async (tx) => { await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`); await invalidateWhitebitDepositRouteProofs(tx); return tx.delete(cryptoAssetNetworksTable).where(eq(cryptoAssetNetworksTable.id, id)).returning().then(([deleted]) => deleted); }); if (!row) throw new ApiError("CRYPTO_NETWORK_NOT_FOUND", "Crypto network not found.", 404); res.sendStatus(204); } catch (e) { next(e); }
});

function outputAttachment(row: typeof fiatCurrencyPaymentMethodsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type BulkPaymentInput = ReturnType<typeof PreviewBulkFiatCurrencyPaymentMethodsBody.parse>;
type AttachmentRow = typeof fiatCurrencyPaymentMethodsTable.$inferSelect;

function validateBulkPaymentInput(input: BulkPaymentInput): void {
  if ((input.currencyIds ? 1 : 0) + (input.region ? 1 : 0) !== 1) {
    throw new ApiError(
      "BULK_PAYMENT_SELECTOR_INVALID",
      "Choose either currency IDs or one region.",
      400,
    );
  }
  if (
    input.action === "update" &&
    (!input.overrides || Object.keys(input.overrides).length === 0)
  ) {
    throw new ApiError(
      "BULK_PAYMENT_OVERRIDES_REQUIRED",
      "Update requires at least one explicit override.",
      400,
    );
  }
  if (
    input.currencyIds &&
    input.currencyIds.length !== new Set(input.currencyIds).size
  ) {
    throw new ApiError("DUPLICATE_CURRENCY_IDS", "Each currency may appear only once.", 400);
  }
  if (
    input.overrides?.minAmount != null &&
    input.overrides?.maxAmount != null &&
    Number(input.overrides.minAmount) > Number(input.overrides.maxAmount)
  ) {
    throw new ApiError("BULK_PAYMENT_LIMITS_INVALID", "Minimum amount cannot exceed maximum amount.", 400);
  }
}

async function bulkPaymentTargets(input: BulkPaymentInput) {
  const currencies = await listFiatCurrencies();
  const selected = input.currencyIds
    ? input.currencyIds.map((id) => currencies.find((currency) => currency.id === id))
    : currencies.filter((currency) =>
      currency.regions.some((region) =>
        region.toLocaleLowerCase() === input.region!.trim().toLocaleLowerCase()));
  if (selected.length > 100) {
    throw new ApiError("BULK_PAYMENT_LIMIT_EXCEEDED", "A bulk batch is limited to 100 currencies.", 400);
  }
  if (input.currencyIds && selected.some((currency) => !currency)) {
    throw new ApiError("FIAT_CURRENCY_NOT_FOUND", "One or more selected currencies were not found.", 400);
  }
  if (!selected.length) {
    throw new ApiError("BULK_PAYMENT_SELECTION_EMPTY", "No currencies match this selection.", 400);
  }
  return selected as NonNullable<(typeof selected)[number]>[];
}

function projectedAttachment(
  current: AttachmentRow | undefined,
  input: BulkPaymentInput,
): Pick<AttachmentRow, "enabled" | "canSend" | "canReceive" | "sendInstructions" |
  "receiveInstructions" | "minAmount" | "maxAmount" | "countries"> {
  const base = current ?? {
    enabled: true,
    canSend: null,
    canReceive: null,
    sendInstructions: null,
    receiveInstructions: null,
    minAmount: null,
    maxAmount: null,
    countries: [],
  };
  return {
    ...base,
    ...(input.action === "enable" ? { enabled: true } : {}),
    ...(input.action === "disable" ? { enabled: false } : {}),
    ...input.overrides,
  };
}

function validateProjectedAttachment(
  projected: ReturnType<typeof projectedAttachment>,
): string | undefined {
  if (
    projected.minAmount != null &&
    projected.maxAmount != null &&
    Number(projected.minAmount) > Number(projected.maxAmount)
  ) return "Minimum amount cannot exceed maximum amount.";
  return undefined;
}

function attachmentDirection(
  projected: ReturnType<typeof projectedAttachment>,
  method: typeof paymentMethodsTable.$inferSelect,
) {
  if (!projected.enabled) return "none" as const;
  const send = projected.canSend ?? method.canSend;
  const receive = projected.canReceive ?? method.canReceive;
  return send && receive ? "both" as const : send ? "send" as const :
    receive ? "receive" as const : "none" as const;
}

async function buildBulkPaymentPreview(input: BulkPaymentInput) {
  validateBulkPaymentInput(input);
  const targets = await bulkPaymentTargets(input);
  const [method] = await db.select().from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.id, input.paymentMethodId)).limit(1);
  if (!method) throw new ApiError("PAYMENT_METHOD_NOT_FOUND", "Payment method not found.", 404);
  const attachments = await db.select().from(fiatCurrencyPaymentMethodsTable)
    .where(eq(fiatCurrencyPaymentMethodsTable.paymentMethodId, input.paymentMethodId));
  const byCurrency = new Map(attachments.map((attachment) => [attachment.fiatCurrencyId, attachment]));
  const items = targets.map((currency) => {
    const current = byCurrency.get(currency.id);
    const projected = projectedAttachment(current, input);
    const limitsConflict = validateProjectedAttachment(projected);
    const conflict = input.action === "attach" && current
      ? ["PAYMENT_METHOD_ATTACHMENT_EXISTS", "This payment method is already attached."]
      : input.action !== "attach" && !current
        ? ["PAYMENT_METHOD_ATTACHMENT_NOT_FOUND", "This payment method is not attached."]
        : limitsConflict
          ? ["BULK_PAYMENT_LIMITS_INVALID", limitsConflict]
          : undefined;
    return {
      fiatCurrencyId: currency.id,
      currencyCode: currency.code,
      currencyName: currency.name,
      attachmentId: current?.id ?? null,
      expectedUpdatedAt: current?.updatedAt.toISOString() ?? null,
      effect: conflict ? "conflict" as const : input.action === "attach" ? "attach" as const : "update" as const,
      direction: attachmentDirection(projected, method),
      minAmount: projected.minAmount,
      maxAmount: projected.maxAmount,
      ...(conflict ? { conflictCode: conflict[0], conflictMessage: conflict[1] } : {}),
    };
  });
  return {
    paymentMethodId: input.paymentMethodId,
    action: input.action,
    affectedCount: items.filter((item) => item.effect !== "conflict").length,
    conflictCount: items.filter((item) => item.effect === "conflict").length,
    items,
  };
}

router.get("/admin/payment-methods", async (_req, res, next) => {
  try {
    const rows = await db.select().from(paymentMethodsTable)
      .orderBy(
        desc(paymentMethodsTable.enabled),
        sql`case ${paymentMethodsTable.lifecycle} when 'active' then 0 when 'restricted' then 1 else 2 end`,
        asc(paymentMethodsTable.name),
        asc(paymentMethodsTable.id),
      );
    res.json(GetPaymentMethodsResponse.parse(rows.map(outputPaymentMethod)));
  } catch (error) { next(error); }
});

router.post("/admin/payment-methods", async (req, res, next) => {
  try {
    const input = CreatePaymentMethodBody.parse(assignAutomaticPaymentMethodFieldKeys(req.body));
    validateSafeFieldDefinitions(input.fieldDefinitions);
    if (input.logoObjectPath !== null && input.logoObjectPath !== undefined) {
      if (!/^\/objects\/payment-method-logos\/[0-9a-f-]+$/.test(input.logoObjectPath)) {
        throw new ApiError("PAYMENT_METHOD_LOGO_INVALID", "Logo must be a normalized App Storage object path.", 400);
      }
      const created = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.logoObjectPath}, 20260826))`);
        try { await verifyStoredLogo(input.logoObjectPath!); } catch {
          throw new ApiError("PAYMENT_METHOD_LOGO_INVALID", "Logo must be a PNG, JPEG, WebP, or safe SVG image no larger than 5 MB.", 400);
        }
        const [row] = await tx.insert(paymentMethodsTable).values(input).returning();
        return row;
      });
      res.status(201).json(CreatePaymentMethodResponse.parse(outputPaymentMethod(created)));
      return;
    }
    const [created] = await db.insert(paymentMethodsTable).values(input).returning();
    res.status(201).json(CreatePaymentMethodResponse.parse(outputPaymentMethod(created)));
  } catch (error) {
    next(isUniqueViolation(error)
      ? new ApiError("PAYMENT_METHOD_EXISTS", "Payment method ID already exists.", 409)
      : error);
  }
});

router.patch("/admin/payment-methods/:id", async (req, res, next) => {
  try {
    const { id } = UpdatePaymentMethodParams.parse(req.params);
    const input = UpdatePaymentMethodBody.parse(assignAutomaticPaymentMethodFieldKeys(req.body));
    if (input.fieldDefinitions) validateSafeFieldDefinitions(input.fieldDefinitions);
    if (input.logoObjectPath !== null && input.logoObjectPath !== undefined) {
      if (!/^\/objects\/payment-method-logos\/[0-9a-f-]+$/.test(input.logoObjectPath)) {
        throw new ApiError("PAYMENT_METHOD_LOGO_INVALID", "Logo must be a normalized App Storage object path.", 400);
      }
      const updated = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.logoObjectPath}, 20260826))`);
        try { await verifyStoredLogo(input.logoObjectPath!); } catch {
          throw new ApiError("PAYMENT_METHOD_LOGO_INVALID", "Logo must be a PNG, JPEG, WebP, or safe SVG image no larger than 5 MB.", 400);
        }
        const [row] = await tx.update(paymentMethodsTable)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(paymentMethodsTable.id, id)).returning();
        return row;
      });
      if (!updated) throw new ApiError("PAYMENT_METHOD_NOT_FOUND", "Payment method not found.", 404);
      res.json(UpdatePaymentMethodResponse.parse(outputPaymentMethod(updated)));
      return;
    }
    const [updated] = await db.update(paymentMethodsTable)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(paymentMethodsTable.id, id)).returning();
    if (!updated) throw new ApiError("PAYMENT_METHOD_NOT_FOUND", "Payment method not found.", 404);
    res.json(UpdatePaymentMethodResponse.parse(outputPaymentMethod(updated)));
  } catch (error) { next(error); }
});

router.delete("/admin/payment-methods/:id", async (req, res, next) => {
  try {
    const { id } = DeletePaymentMethodParams.parse(req.params);
    const [deleted] = await db.delete(paymentMethodsTable)
      .where(eq(paymentMethodsTable.id, id)).returning({ id: paymentMethodsTable.id });
    if (!deleted) throw new ApiError("PAYMENT_METHOD_NOT_FOUND", "Payment method not found.", 404);
    res.sendStatus(204);
  } catch (error) { next(error); }
});

router.post("/admin/payment-methods/logo-upload", async (req, res, next) => {
  try {
    const input = RequestPaymentMethodLogoUploadBody.parse(req.body);
    const upload = await createLogoUpload(input.contentType);
    res.json(RequestPaymentMethodLogoUploadResponse.parse(upload));
  } catch (error) { next(error); }
});

router.delete("/admin/payment-methods/logo-upload/:id", async (req, res, next) => {
  try {
    const { id } = DeletePaymentMethodLogoUploadParams.parse(req.params);
    const objectPath = `/objects/payment-method-logos/${id}`;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${objectPath}, 20260826))`);
      const [attached] = await tx.select({ id: paymentMethodsTable.id })
        .from(paymentMethodsTable)
        .where(eq(paymentMethodsTable.logoObjectPath, objectPath))
        .limit(1);
      if (attached) {
        throw new ApiError(
          "PAYMENT_METHOD_LOGO_IN_USE",
          "Logo upload is still attached to a payment method.",
          409,
        );
      }
      try {
        await deleteStoredLogo(objectPath);
      } catch (error) {
        if (!(error instanceof StoredObjectNotFoundError)) throw error;
        throw new ApiError("PAYMENT_METHOD_LOGO_NOT_FOUND", "Logo upload not found.", 404);
      }
    });
    res.sendStatus(204);
  } catch (error) { next(error); }
});
const catalogImageRoutes = [
  ["crypto-asset-logos", "crypto-assets", createCryptoAssetLogoUpload, cryptoAssetsTable, "logoObjectPath"],
  ["crypto-network-logos", "crypto-networks", createCryptoNetworkLogoUpload, cryptoAssetNetworksTable, "logoObjectPath"],
  ["fiat-currency-flags", "fiat-currencies", createFiatCurrencyFlagUpload, fiatCurrenciesTable, "flagObjectPath"],
] as const;
for (const [namespace, resource, createUpload, table, column] of catalogImageRoutes) {
  const uploadName = namespace === "fiat-currency-flags" ? "flag-upload" : "logo-upload";
  router.post(`/admin/${resource}/${uploadName}`, async (req, res, next) => {
    try {
      const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : "";
      if (!ALLOWED_LOGO_CONTENT_TYPES.includes(contentType as never)) throw new ApiError("IMAGE_CONTENT_TYPE_INVALID", "Image content type is not allowed.", 400);
      res.json(await createUpload(contentType));
    } catch (error) { next(error); }
  });
  router.delete(`/admin/${resource}/${uploadName}/:id`, async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new ApiError("IMAGE_NOT_FOUND", "Image upload not found.", 404);
      const objectPath = `/objects/${namespace}/${id}`;
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${objectPath}, 20260826))`);
        const [attached] = await tx.select({ id: table.id }).from(table).where(eq((table as never)[column] as never, objectPath)).limit(1);
        if (attached) throw new ApiError("IMAGE_IN_USE", "Image upload is still attached.", 409);
        try { await deleteStoredCatalogImage(objectPath, namespace as never); } catch (error) {
          if (error instanceof StoredObjectNotFoundError) throw new ApiError("IMAGE_NOT_FOUND", "Image upload not found.", 404);
          throw error;
        }
      });
      res.sendStatus(204);
    } catch (error) { next(error); }
  });
}

router.get("/admin/fiat-currency-payment-methods", async (_req, res, next) => {
  try {
    const rows = await db.select({
      attachment: fiatCurrencyPaymentMethodsTable,
      paymentMethodName: paymentMethodsTable.name,
    }).from(fiatCurrencyPaymentMethodsTable)
      .leftJoin(paymentMethodsTable, eq(fiatCurrencyPaymentMethodsTable.paymentMethodId, paymentMethodsTable.id))
      .orderBy(desc(fiatCurrencyPaymentMethodsTable.enabled), asc(paymentMethodsTable.name), asc(fiatCurrencyPaymentMethodsTable.paymentMethodId), asc(fiatCurrencyPaymentMethodsTable.id));
    res.json(GetFiatCurrencyPaymentMethodsResponse.parse(rows.map(({ attachment }) => outputAttachment(attachment))));
  } catch (error) { next(error); }
});

router.post("/admin/fiat-currency-payment-methods", async (req, res, next) => {
  try {
    const input = CreateFiatCurrencyPaymentMethodBody.parse(req.body);
    const [created] = await db.insert(fiatCurrencyPaymentMethodsTable).values(input).returning();
    res.status(201).json(CreateFiatCurrencyPaymentMethodResponse.parse(outputAttachment(created)));
  } catch (error) {
    next(isUniqueViolation(error)
      ? new ApiError("PAYMENT_METHOD_ATTACHMENT_EXISTS", "This payment method is already attached.", 409)
      : error);
  }
});

router.post("/admin/fiat-currency-payment-methods/bulk/preview", requireOperator, async (req, res, next) => {
  try {
    const input = PreviewBulkFiatCurrencyPaymentMethodsBody.parse(req.body);
    const preview = await buildBulkPaymentPreview(input);
    res.json(PreviewBulkFiatCurrencyPaymentMethodsResponse.parse(preview));
  } catch (error) { next(error); }
});

router.post("/admin/fiat-currency-payment-methods/bulk/apply", requireOperator, async (req, res, next) => {
  try {
    const input = ApplyBulkFiatCurrencyPaymentMethodsBody.parse(req.body);
    validateBulkPaymentInput(input);
    const duplicateIds = input.items.length !== new Set(input.items.map((item) => item.fiatCurrencyId)).size;
    if (duplicateIds) {
      throw new ApiError("DUPLICATE_CURRENCY_IDS", "Each currency may appear only once.", 400);
    }
    const preview = await buildBulkPaymentPreview(input);
    const selectedIds = new Set(preview.items.map((item) => item.fiatCurrencyId));
    if (
      input.items.length !== selectedIds.size ||
      input.items.some((item) => !selectedIds.has(item.fiatCurrencyId))
    ) {
      throw new ApiError("BULK_PAYMENT_REVIEW_MISMATCH", "The reviewed currencies no longer match the request.", 400);
    }
    const operator = res.locals.operator as OperatorAuthorization;
    const actorClerkUserId = getOperatorActorUserId(req);
    const results = [];
    for (const item of input.items) {
      const reviewed = preview.items.find((candidate) => candidate.fiatCurrencyId === item.fiatCurrencyId)!;
      if (reviewed.effect === "conflict") {
        results.push({
          fiatCurrencyId: item.fiatCurrencyId,
          success: false,
          code: reviewed.conflictCode,
          message: reviewed.conflictMessage,
        });
        continue;
      }
      const result = await db.transaction(async (tx) => {
        const [method] = await tx.select().from(paymentMethodsTable)
          .where(eq(paymentMethodsTable.id, input.paymentMethodId)).limit(1);
        const [currency] = await tx.select().from(fiatCurrenciesTable)
          .where(eq(fiatCurrenciesTable.id, item.fiatCurrencyId))
          .limit(1)
          .for("update");
        if (!method || !currency) return { code: "BULK_PAYMENT_TARGET_CHANGED", message: "Currency or payment method no longer exists." };
        if (
          input.region &&
          !currency.regions.some((region) =>
            region.toLocaleLowerCase() === input.region!.trim().toLocaleLowerCase())
        ) {
          return {
            code: "BULK_PAYMENT_REGION_CHANGED",
            message: "Currency no longer belongs to the reviewed region.",
          };
        }
        let attachment: AttachmentRow | undefined;
        if (input.action === "attach") {
          if (item.expectedUpdatedAt !== null) {
            return { code: "PAYMENT_METHOD_ATTACHMENT_CONFLICT", message: "Attachment review is stale." };
          }
          const projected = projectedAttachment(undefined, input);
          if (validateProjectedAttachment(projected)) {
            return { code: "BULK_PAYMENT_LIMITS_INVALID", message: "Minimum amount cannot exceed maximum amount." };
          }
          [attachment] = await tx.insert(fiatCurrencyPaymentMethodsTable).values({
            fiatCurrencyId: item.fiatCurrencyId,
            paymentMethodId: input.paymentMethodId,
            ...projected,
          }).onConflictDoNothing().returning();
        } else {
          if (item.expectedUpdatedAt === null) {
            return { code: "PAYMENT_METHOD_ATTACHMENT_CONFLICT", message: "Attachment review is stale." };
          }
          const [current] = await tx.select().from(fiatCurrencyPaymentMethodsTable)
            .where(and(
              eq(fiatCurrencyPaymentMethodsTable.fiatCurrencyId, item.fiatCurrencyId),
              eq(fiatCurrencyPaymentMethodsTable.paymentMethodId, input.paymentMethodId),
            )).limit(1);
          if (!current) return { code: "PAYMENT_METHOD_ATTACHMENT_CONFLICT", message: "Attachment no longer exists." };
          const projected = projectedAttachment(current, input);
          if (validateProjectedAttachment(projected)) {
            return { code: "BULK_PAYMENT_LIMITS_INVALID", message: "Minimum amount cannot exceed maximum amount." };
          }
          [attachment] = await tx.update(fiatCurrencyPaymentMethodsTable)
            .set({ ...projected, updatedAt: new Date() })
            .where(and(
              eq(fiatCurrencyPaymentMethodsTable.id, current.id),
              eq(fiatCurrencyPaymentMethodsTable.updatedAt, new Date(item.expectedUpdatedAt)),
            )).returning();
        }
        if (!attachment) {
          return { code: "PAYMENT_METHOD_ATTACHMENT_CONFLICT", message: "Attachment changed after review." };
        }
        await tx.insert(operatorAuditLogsTable).values({
          action: "payment_method_attachment.bulk_updated",
          actorClerkUserId,
          targetOperatorId: operator.id,
          targetEmail: operator.email,
          requestId: String(req.id),
          details: {
            attachmentId: attachment.id,
            fiatCurrencyId: item.fiatCurrencyId,
            paymentMethodId: input.paymentMethodId,
            action: input.action,
            overrides: input.overrides ?? {},
          },
        });
        return { attachment };
      });
      if ("attachment" in result) {
        results.push({
          fiatCurrencyId: item.fiatCurrencyId,
          success: true,
          attachment: outputAttachment(result.attachment!),
        });
      } else {
        results.push({ fiatCurrencyId: item.fiatCurrencyId, success: false, ...result });
      }
    }
    res.json(ApplyBulkFiatCurrencyPaymentMethodsResponse.parse({ results }));
  } catch (error) { next(error); }
});

router.patch("/admin/fiat-currency-payment-methods/:id", async (req, res, next) => {
  try {
    const { id } = UpdateFiatCurrencyPaymentMethodParams.parse(req.params);
    const input = UpdateFiatCurrencyPaymentMethodBody.parse(req.body);
    const [updated] = await db.update(fiatCurrencyPaymentMethodsTable)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(fiatCurrencyPaymentMethodsTable.id, id)).returning();
    if (!updated) throw new ApiError("PAYMENT_METHOD_ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
    res.json(UpdateFiatCurrencyPaymentMethodResponse.parse(outputAttachment(updated)));
  } catch (error) { next(error); }
});

router.delete("/admin/fiat-currency-payment-methods/:id", async (req, res, next) => {
  try {
    const { id } = DeleteFiatCurrencyPaymentMethodParams.parse(req.params);
    const [deleted] = await db.delete(fiatCurrencyPaymentMethodsTable)
      .where(eq(fiatCurrencyPaymentMethodsTable.id, id))
      .returning({ id: fiatCurrencyPaymentMethodsTable.id });
    if (!deleted) throw new ApiError("PAYMENT_METHOD_ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
    res.sendStatus(204);
  } catch (error) { next(error); }
});

router.get("/admin/fiat-currencies", async (_req, res, next) => {
  try {
    const rows = await listFiatCurrencies();
    res.json(GetFiatCurrenciesResponse.parse(rows.map(outputFiatCurrency)));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/fiat-currencies", async (req, res, next) => {
  try {
    const input = CreateFiatCurrencyBody.parse(req.body);
    const name = input.name.trim();
    if (!name) {
      throw new ApiError(
        "FIAT_CURRENCY_INVALID",
        "Currency name is required.",
        400,
      );
    }
    const rateMode = input.rateMode ?? "automatic";
    const manualRate = input.manualRate;
    if (rateMode === "manual" && (input.code.toUpperCase() !== "USD") &&
      (!manualRate || !/^(?:[1-9][0-9]*|0\.[0-9]+|[1-9][0-9]*\.[0-9]+)$/.test(manualRate) || Number(manualRate) <= 0)) {
      throw new ApiError("FIAT_CURRENCY_INVALID_RATE", "A positive manual USD rate is required.", 400);
    }
    const created = await db.transaction(async (tx) => {
      await verifyCatalogPath(tx, input.flagObjectPath, "fiat-currency-flags");
      const [row] = await tx
      .insert(fiatCurrenciesTable)
      .values({
        ...input,
        code: input.code.toUpperCase(),
        name,
        network: "fiat",
        precision: input.precision ?? 2,
        rateMode: input.code.toUpperCase() === "USD" ? "manual" : rateMode,
        manualRate: input.code.toUpperCase() === "USD" ? "1" : (rateMode === "manual" ? manualRate : null),
      })
      .returning();
      return row;
    });
    invalidateManualDeskFiatRateCache();
    res.status(201).json(CreateFiatCurrencyResponse.parse(outputFiatCurrency(created)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      next(new ApiError(
        "FIAT_CURRENCY_EXISTS",
        "A fiat currency with this code already exists.",
        409,
      ));
      return;
    }
    next(error);
  }
});

router.patch("/admin/fiat-currencies/:id", async (req, res, next) => {
  try {
    const { id } = UpdateFiatCurrencyParams.parse(req.params);
    const input = UpdateFiatCurrencyBody.parse(req.body);
    if (Object.keys(input).length === 0) {
      throw new ApiError(
        "FIAT_CURRENCY_UPDATE_REQUIRED",
        "At least one currency field must be updated.",
        400,
      );
    }
    if (
      (input.name !== undefined && !input.name.trim())
    ) {
      throw new ApiError(
        "FIAT_CURRENCY_INVALID",
        "Currency name cannot be blank.",
        400,
      );
    }
    const code = input.code?.toUpperCase();
    const rateMode = input.rateMode;
    const manualRate = input.manualRate;
    if ((rateMode === "manual" || (manualRate !== undefined && manualRate !== null)) && code !== "USD" &&
      (!manualRate || !/^(?:[1-9][0-9]*|0\.[0-9]+|[1-9][0-9]*\.[0-9]+)$/.test(manualRate) || Number(manualRate) <= 0)) {
      throw new ApiError("FIAT_CURRENCY_INVALID_RATE", "A positive manual USD rate is required.", 400);
    }
    const updated = await db.transaction(async (tx) => {
      await verifyCatalogPath(tx, input.flagObjectPath, "fiat-currency-flags");
      const [row] = await tx
      .update(fiatCurrenciesTable)
      .set({
        ...input,
        ...(input.code === undefined ? {} : { code: input.code.toUpperCase() }),
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(rateMode === undefined ? {} : { rateMode: code === "USD" ? "manual" : rateMode }),
        ...(rateMode === undefined ? {} : { manualRate: code === "USD" ? "1" : (rateMode === "manual" ? manualRate : null) }),
        ...(code === "USD" ? { rateMode: "manual", manualRate: "1" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(fiatCurrenciesTable.id, id))
      .returning();
      return row;
    });
    if (!updated) {
      throw new ApiError(
        "FIAT_CURRENCY_NOT_FOUND",
        "Fiat currency not found.",
        404,
      );
    }
    invalidateManualDeskFiatRateCache();
    res.json(UpdateFiatCurrencyResponse.parse(outputFiatCurrency(updated)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      next(new ApiError(
        "FIAT_CURRENCY_EXISTS",
        "A fiat currency with this code already exists.",
        409,
      ));
      return;
    }
    next(error);
  }
});

router.delete("/admin/fiat-currencies/:id", async (req, res, next) => {
  try {
    const { id } = DeleteFiatCurrencyParams.parse(req.params);
    const [deleted] = await db.delete(fiatCurrenciesTable)
      .where(eq(fiatCurrenciesTable.id, id))
      .returning({ id: fiatCurrenciesTable.id });
    if (!deleted) {
      throw new ApiError("FIAT_CURRENCY_NOT_FOUND", "Fiat currency not found.", 404);
    }
    invalidateManualDeskFiatRateCache();
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.get("/admin/providers/oneforge", async (_req, res, next) => {
  try {
    res.json(
      GetOneForgeProviderStatusResponse.parse(
        await refreshManualDeskRateProviderStatus(),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.get("/admin/providers/whitebit", async (_req, res, next) => {
  try {
    res.json(await whitebitSwapStatus());
  } catch (error) {
    next(error);
  }
});

router.get("/admin/providers/whitebit/credentials", async (_req, res, next) => {
  try {
    const stored = await getWhitebitCredentialStorageState();
    const environment = Boolean(process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET);
    res.json(GetWhitebitCredentialsResponse.parse({
      provider: "whitebit",
      configured: stored.status === "available" || environment,
      credentialSource: stored.status === "available"
        ? "stored"
        : stored.status === "unavailable"
          ? "unavailable"
          : environment ? "environment" : "none",
      canManage: res.locals.operator?.role === "owner",
      updatedAt: stored.status === "available" || stored.status === "unavailable"
        ? stored.updatedAt.toISOString()
        : null,
    }));
  } catch (error) {
    next(error);
  }
});

router.put("/admin/providers/whitebit/credentials", requireOwner, async (req, res, next) => {
  try {
    const parsed = UpdateWhitebitCredentialsBody.safeParse(req.body);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", parsed.error.message, 400);
    await testWhitebitSignedConnection(parsed.data);
    const actor = res.locals.operator;
    const saved = await activateWhitebitCredentials(
      parsed.data,
      {
        actorClerkUserId: getOperatorActorUserId(req),
        operatorId: actor.id,
        operatorEmail: actor.email,
        requestId: req.get("x-request-id") ?? null,
      },
      {
        afterActivate: async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
          const [current] = await tx.select({
            version: whitebitProviderSettingsTable.version,
          }).from(whitebitProviderSettingsTable)
            .where(eq(whitebitProviderSettingsTable.provider, "whitebit"))
            .limit(1);
          await tx.insert(whitebitProviderSettingsTable).values({
            provider: "whitebit",
            disabled: true,
            version: (current?.version ?? 0) + 1,
            depositRouteProofs: [],
            updatedByOperatorId: actor.id,
            updatedAt: new Date(),
          }).onConflictDoUpdate({
            target: whitebitProviderSettingsTable.provider,
            set: {
              disabled: true,
              version: sql`${whitebitProviderSettingsTable.version} + 1`,
              depositRouteProofs: [],
              updatedByOperatorId: actor.id,
              updatedAt: new Date(),
            },
          });
          await reconcileCryptoCustomerDepositEligibilityWithExecutor(tx, {
            whitebitReady: false,
            whitebitCapabilities: null,
            whitebitProofs: new Map(),
            credentialUpdatedAtMs: null,
            providerSettingVersion: null,
          });
        },
      },
    );
    invalidatePopularExchangePairsCache();
    res.json(UpdateWhitebitCredentialsResponse.parse({
      provider: "whitebit",
      configured: true,
      credentialSource: "stored",
      canManage: true,
      updatedAt: saved.updatedAt.toISOString(),
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/providers/whitebit/credentials/test", requireOwner, async (_req, res, next) => {
  try {
    res.json(TestWhitebitCredentialsResponse.parse(await testWhitebitSignedConnection()));
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/providers/whitebit", requireOwner, async (req, res, next) => {
  try {
    if (typeof req.body?.enabled !== "boolean") {
      throw new ApiError("VALIDATION_ERROR", "enabled must be a boolean.", 400);
    }
    const disabled = !req.body.enabled;
    const operatorId = getOperatorActorUserId(req);
    const storedBefore = await getWhitebitCredentialStorageState();
    const verifiedCredentials = req.body.enabled && storedBefore.status === "available"
      ? storedBefore.credentials
      : undefined;
    const activeCredentials = verifiedCredentials ??
      (process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET
        ? {
            apiKey: process.env.WHITEBIT_API_KEY,
            secretKey: process.env.WHITEBIT_API_SECRET,
          }
        : undefined);
    const credentialFingerprint = activeCredentials
      ? whitebitCredentialFingerprint(activeCredentials)
      : null;
    const expectedCredentialUpdatedAt = storedBefore.status === "available" ||
        storedBefore.status === "unavailable"
      ? storedBefore.updatedAt
      : null;
    const publicCapabilities = req.body.enabled
      ? await getWhitebitCapabilities()
      : null;
    const verification = {
      verified: [] as string[],
      failed: [] as Array<{ route: string; reason: string }>,
    };
    type VerificationCandidate = {
      asset: typeof cryptoAssetsTable.$inferSelect;
      network: typeof cryptoAssetNetworksTable.$inferSelect;
      configurationDigest: string;
    };
    let capturedConfigured: VerificationCandidate[] = [];
    let verifiedProofs: Array<{
      networkId: string;
      assetCode: string;
      networkCode: string;
      configurationDigest: string;
      credentialFingerprint: string;
      verifiedAt: string;
    }> = [];
    let verifiedCapabilities = publicCapabilities;
    if (req.body.enabled && publicCapabilities) {
      const configuredRows = await db.select({
        asset: cryptoAssetsTable,
        network: cryptoAssetNetworksTable,
      }).from(cryptoAssetNetworksTable)
        .innerJoin(
          cryptoAssetsTable,
          eq(cryptoAssetNetworksTable.assetId, cryptoAssetsTable.id),
        )
        .where(and(
          eq(cryptoAssetsTable.enabled, true),
          eq(cryptoAssetNetworksTable.enabled, true),
          eq(cryptoAssetNetworksTable.depositProvider, "whitebit"),
          sql`${cryptoAssetsTable.lifecycle} <> 'deprecated'`,
          sql`${cryptoAssetNetworksTable.lifecycle} <> 'deprecated'`,
        ));
      capturedConfigured = configuredRows.map((row) => ({
        ...row,
        configurationDigest: customerDepositRouteConfigurationDigest(
          row.asset,
          row.network,
        ),
      }));
      const exactCandidates = capturedConfigured.filter((row) =>
        matchWhitebitCapability(
          publicCapabilities,
          row.asset.code,
          row.network.networkCode,
        )
      );
      const verifiedKeys = new Set<string>();
      const verifiedAt = new Date().toISOString();
      for (const candidate of exactCandidates) {
        const route = `${candidate.asset.code.trim().toUpperCase()}/${candidate.network.networkCode.trim().toUpperCase()}`;
        if (process.env.NODE_ENV === "test") {
          verifiedKeys.add(route);
          verification.verified.push(route);
          continue;
        }
        try {
          const address = await verifyWhitebitDepositAddressPermission(
            candidate.asset.code,
            candidate.network.networkCode,
            verifiedCredentials,
          );
          if (candidate.network.requiresMemo && !address.memo?.trim()) {
            throw new ApiError(
              "WHITEBIT_ADDRESS_PERMISSION_UNVERIFIED",
              `WhiteBIT did not return the required ${route} memo.`,
              502,
            );
          }
          verifiedKeys.add(route);
          verification.verified.push(route);
        } catch (error) {
          verification.failed.push({
            route,
            reason: error instanceof ApiError ? error.code : "WHITEBIT_ADDRESS_VERIFICATION_FAILED",
          });
        }
      }
      if (!credentialFingerprint) {
        throw new ApiError(
          "WHITEBIT_NOT_CONFIGURED",
          "WhiteBIT credentials are unavailable.",
          503,
        );
      }
      verifiedProofs = exactCandidates
        .filter((candidate) => verifiedKeys.has(
          `${candidate.asset.code.trim().toUpperCase()}/${candidate.network.networkCode.trim().toUpperCase()}`,
        ))
        .map((candidate) => ({
          networkId: candidate.network.id,
          assetCode: candidate.asset.code.trim().toUpperCase(),
          networkCode: candidate.network.networkCode.trim().toUpperCase(),
          configurationDigest: candidate.configurationDigest,
          credentialFingerprint,
          verifiedAt,
        }));
      verifiedCapabilities = {
        fetchedAt: publicCapabilities.fetchedAt,
        assets: publicCapabilities.assets.flatMap((asset) => {
          const depositNetworks = asset.depositNetworks.filter((network) =>
            verifiedKeys.has(`${asset.ticker}/${network}`)
          );
          if (!depositNetworks.length) return [];
          return [{
            ...asset,
            depositNetworks,
            confirmations: Object.fromEntries(
              Object.entries(asset.confirmations)
                .filter(([network]) => depositNetworks.includes(network)),
            ),
          }];
        }),
      };
      if (!verification.verified.length) {
        throw new ApiError(
          "WHITEBIT_NO_VERIFIED_DEPOSIT_ROUTES",
          "WhiteBIT did not return a valid address for any configured route.",
          502,
        );
      }
    }
    const eligibilityContext = req.body.enabled
      ? {
          whitebitReady: true,
          whitebitCapabilities: verifiedCapabilities,
          whitebitProofs: new Map(
            verifiedProofs.map((proof) => [
              proof.networkId,
              proof.configurationDigest,
            ]),
          ),
          credentialUpdatedAtMs: null,
          providerSettingVersion: null,
        }
      : {
          whitebitReady: false,
          whitebitCapabilities: null,
          whitebitProofs: new Map<string, string>(),
          credentialUpdatedAtMs: null,
          providerSettingVersion: null,
        };
    const depositEligibility = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))`,
      );
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
      const [credentialRow] = await tx.select({ updatedAt: providerIntegrationsTable.updatedAt })
        .from(providerIntegrationsTable)
        .where(eq(providerIntegrationsTable.provider, "whitebit"))
        .limit(1);
      const credentialStateUnchanged = expectedCredentialUpdatedAt === null
        ? !credentialRow
        : Boolean(
            credentialRow &&
            credentialRow.updatedAt.getTime() === expectedCredentialUpdatedAt.getTime()
          );
      if (!credentialStateUnchanged) {
        throw new ApiError(
          "WHITEBIT_CREDENTIAL_STATE_CHANGED",
          "WhiteBIT credentials changed during verification. Retry the operation.",
          409,
        );
      }
      if (req.body.enabled) {
        const currentConfiguredRows = await tx.select({
          asset: cryptoAssetsTable,
          network: cryptoAssetNetworksTable,
        }).from(cryptoAssetNetworksTable)
          .innerJoin(
            cryptoAssetsTable,
            eq(cryptoAssetNetworksTable.assetId, cryptoAssetsTable.id),
          )
          .where(and(
            eq(cryptoAssetsTable.enabled, true),
            eq(cryptoAssetNetworksTable.enabled, true),
            eq(cryptoAssetNetworksTable.depositProvider, "whitebit"),
            sql`${cryptoAssetsTable.lifecycle} <> 'deprecated'`,
            sql`${cryptoAssetNetworksTable.lifecycle} <> 'deprecated'`,
          ))
          .for("update");
        const configurationState = (rows: Array<{
          asset: typeof cryptoAssetsTable.$inferSelect;
          network: typeof cryptoAssetNetworksTable.$inferSelect;
        }>) => rows.map((row) => ({
          networkId: row.network.id,
          digest: customerDepositRouteConfigurationDigest(
            row.asset,
            row.network,
          ),
        })).sort((left, right) => left.networkId.localeCompare(right.networkId));
        if (
          JSON.stringify(configurationState(currentConfiguredRows)) !==
          JSON.stringify(configurationState(capturedConfigured))
        ) {
          throw new ApiError(
            "WHITEBIT_ROUTE_CONFIGURATION_CHANGED",
            "Crypto route configuration changed during verification. Retry the operation.",
            409,
          );
        }
      }
      const [current] = await tx.select({ version: whitebitProviderSettingsTable.version })
        .from(whitebitProviderSettingsTable)
        .where(eq(whitebitProviderSettingsTable.provider, "whitebit")).limit(1);
      await tx.insert(whitebitProviderSettingsTable).values({
        provider: "whitebit",
        disabled,
        version: (current?.version ?? 0) + 1,
        depositRouteProofs: req.body.enabled ? verifiedProofs : [],
        updatedByOperatorId: operatorId,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: whitebitProviderSettingsTable.provider,
        set: {
          disabled,
          version: sql`${whitebitProviderSettingsTable.version} + 1`,
          depositRouteProofs: req.body.enabled ? verifiedProofs : [],
          updatedByOperatorId: operatorId,
          updatedAt: new Date(),
        },
      });
      return reconcileCryptoCustomerDepositEligibilityWithExecutor(
        tx,
        eligibilityContext,
      );
    });
    invalidatePopularExchangePairsCache();
    logger.info(
      {
        enabled: req.body.enabled,
        depositEligibility,
      },
      "WhiteBIT setting updated and customer deposit eligibility reconciled",
    );
    res.json({
      ...await whitebitSwapStatus(),
      verification,
      depositEligibility,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/orders.xml", async (_req, res, next) => {
  try {
    await ensureSeed();
    const exportLimit = 5_000;
    const rows = await db
      .select()
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id))
      .limit(exportLimit);
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const xml = `<?xml version="1.0" encoding="UTF-8"?><orders>${rows.map((o) => `<order><id>${escape(o.id)}</id><status>${escape(o.status)}</status><type>${escape(o.type)}</type><rateMode>${escape(orderRateMode(o) ?? "")}</rateMode><from>${escape(o.fromAsset)}</from><to>${escape(o.toAsset)}</to><amount>${escape(o.amount)}</amount><customer>${escape(o.customerEmail)}</customer><createdAt>${o.createdAt.toISOString()}</createdAt></order>`).join("")}</orders>`;
    res
      .set("X-Export-Limit", String(exportLimit))
      .type("application/xml")
      .send(xml);
  } catch (error) { next(error); }
});

export default router;