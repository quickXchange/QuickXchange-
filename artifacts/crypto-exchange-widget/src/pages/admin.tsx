import { useI18n } from '../i18n/provider';
import { lazy, Suspense, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { ChangeEvent, ComponentProps, CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowDownUp, ArrowRight, BadgeCheck, Banknote, Check, ChevronDown, ChevronLeft,
  Calculator, CircleAlert, Clock3, Copy, Download, FileText, Filter, Globe2, Pencil, Play, Power,
  LayoutDashboard, Loader2, Mail, Menu, MoreHorizontal, Archive, ArchiveRestore,
  RefreshCw, RotateCcw, Save, ShieldCheck, TrendingUp, UserRound, Users,
  X, Zap, Settings, Key, Activity, Network, LogOut, Moon, Sun, Eye, Pause, Trash2, UserCheck, Crown, Coins, Ban, CheckCircle,
  CreditCard, ExternalLink, Database, HandCoins, Info, Landmark, ShoppingBag, Smartphone, WalletCards, CalendarDays
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  SiAlipay, SiCashapp, SiMastercard, SiPaypal, SiPix, SiRevolut,
  SiVenmo, SiVisa, SiWise, SiZelle
} from 'react-icons/si';
import {
  getGetAdminSummaryQueryKey, getGetCustomersQueryKey, getGetExchangeConfigQueryKey,
  getGetOrdersQueryKey, getGetOrdersXmlQueryKey, getGetOrderReconciliationAttemptsQueryKey, getGetPublicOrderStatusQueryKey, getGetQuickexOrderStatusQueryKey, getGetQuickexCredentialsQueryKey, getGetQuickexConfigQueryKey,
  useCreateOrder, useCreateExchangeQuote, useGetAdminSummary, useGetCustomers,
  useGetExchangeConfig, useGetOrders, useGetPublicOrderStatus, useGetQuickexOrderStatus, getOrdersXml, useUpdateOrder,
  useGetQuickexCredentials, useTestQuickexCredentials, useUpdateQuickexCredentials,
  useGetOperators, getGetOperatorsQueryKey,
  useCreateOperatorInvitation,
  useApproveOperator,
  useSuspendOperator,
  useRemoveOperator,
  useGetOperatorAuditLogs, getGetOperatorAuditLogsQueryKey,
  useGetCustomerOrders, getGetCustomerOrdersQueryKey,
  useGetCustomerOrder, getGetCustomerOrderQueryKey,
  useClaimCustomerOrder,
  useUpdateCustomerOrderNotifications,
  useReconcileOrder, useGetOrderReconciliationAttempts,
  useGetFiatCurrencies, getGetFiatCurrenciesQueryKey,
  useCreateFiatCurrency,
  useUpdateFiatCurrency, useDeleteFiatCurrency,
  useGetPaymentMethods, getGetPaymentMethodsQueryKey,
  useCreatePaymentMethod, useUpdatePaymentMethod, useDeletePaymentMethod, useRequestPaymentMethodLogoUpload, useDeletePaymentMethodLogoUpload,
  useGetFiatCurrencyPaymentMethods, getGetFiatCurrencyPaymentMethodsQueryKey,
  useCreateFiatCurrencyPaymentMethod, useUpdateFiatCurrencyPaymentMethod, useDeleteFiatCurrencyPaymentMethod,
  useGetOneForgeProviderStatus, getGetOneForgeProviderStatusQueryKey,
  useGetWhitebitProviderStatus, getGetWhitebitProviderStatusQueryKey,
  useUpdateWhitebitProviderStatus, useGetWhitebitCredentials, getGetWhitebitCredentialsQueryKey,
  useUpdateWhitebitCredentials, useTestWhitebitCredentials,
  useListManualDeskPricingRules, getListManualDeskPricingRulesQueryKey,
  useCreateManualDeskPricingRule, useUpdateManualDeskPricingRule, useBulkCreateManualDeskPricingRules,
  usePreviewManualDeskPricingRule, usePreviewManualDeskQuote, useDeleteManualDeskPricingRule, useBulkManualDeskPricingRules,
  useGetManualDeskRevenue, getGetManualDeskRevenueQueryKey,
  exportManualDeskRevenueCsv,
  useGetCryptoAssets, getGetCryptoAssetsQueryKey, useCreateCryptoAsset, useUpdateCryptoAsset, useDeleteCryptoAsset, useRequestCryptoAssetLogoUpload, useDeleteCryptoAssetLogoUpload,
  useGetCryptoNetworks, getGetCryptoNetworksQueryKey, useCreateCryptoNetwork, useUpdateCryptoNetwork, useApplyCryptoAssetsBulkEdit, useDeleteCryptoNetwork, useRequestCryptoNetworkLogoUpload, useDeleteCryptoNetworkLogoUpload, useSaveCryptoAssetReceivingWallet, useReconcileCryptoCustomerDeposits,
  useGetDepositProviderOptions, getGetDepositProviderOptionsQueryKey,
  useRequestFiatCurrencyFlagUpload, useDeleteFiatCurrencyFlagUpload,
  useGetOrder, getGetOrderQueryKey, useAssignOrder, useArchiveOrder, useRestoreOrder,
  useGetOrderAuditLog, getGetOrderAuditLogQueryKey,
  useBulkUpdateOrderStatus, useBulkArchiveOrders, usePermanentlyDeleteOrders,
  useCaptureAffiliateReferral, getCaptureAffiliateReferralQueryKey,
  useGetAffiliateDashboard, getGetAffiliateDashboardQueryKey,
  useGetAffiliateCommissions, getGetAffiliateCommissionsQueryKey,
  useGetAffiliateReferrals, getGetAffiliateReferralsQueryKey,
  useGetAffiliatePayoutHistory, getGetAffiliatePayoutHistoryQueryKey,
  useRequestAffiliatePayout,
  useGetAffiliateSettings, getGetAffiliateSettingsQueryKey,
  useCreateAffiliateSettingsVersion,
  useGetAffiliatePayoutQueue, getGetAffiliatePayoutQueueQueryKey,
  useTransitionAffiliatePayout,
  useGetAffiliateOverview, getGetAffiliateOverviewQueryKey,
  useGetAffiliateAccounts, getGetAffiliateAccountsQueryKey,
  useGetAffiliateAccount, getGetAffiliateAccountQueryKey,
  useSearchAffiliateCommissions, getSearchAffiliateCommissionsQueryKey,
  useGetAffiliateValuationReviews, getGetAffiliateValuationReviewsQueryKey,
  useGetAffiliateValuationReview, getGetAffiliateValuationReviewQueryKey,
  useReviewAffiliateValuation
} from '@workspace/api-client-react';
import type { Asset, Customer, Order, PublicOrderStatus, ApiError, QuickexRateMode, CustomerOrder, FiatCurrency, OneForgeProviderStatus, WhitebitProviderStatus, ManualDeskPricingRule, ManualDeskPricingRuleInput, ManualDeskPricingQuotePreviewInput, SettlementOption, PaymentMethod, PaymentMethodFieldDefinition, CryptoAsset, CryptoNetwork, OrderBulkMutationResponse, OrderBulkStatusInputManualSettlementState, AffiliateAccount, AffiliateSettings, AffiliatePayout, AffiliateOverview, AffiliateAccountPage, AffiliateCommission, AffiliateAccountDetail, AffiliateValuationReview, AffiliateReferral, AffiliateDashboard, ManualDeskPricingRulesBulkResponse, ManualDeskPricingRulesBulkPatch } from '@workspace/api-client-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { CryptoIdentity, CryptoLogo, CryptoNetworkBadge, cryptoLogoFallbackUrls } from '@/components/crypto-identity';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { AdminShell, ago, apiErrorData, apiErrorText, basePath, cn, ErrorState, exactDateTime, FiatCurrencyFlag, formatExactUsd, guestCustomerLabel, InlineNotice, isFiatCurrencyCode, isGreaterThanExact, LoadingBlock, money, number, PaymentMethodCopy, PaymentMethodLogo, providerLabel, queryClient, sameSettlementOptionId, SettlementOptionCombobox, shortId, StatusPill } from '../App';
import { AdminSearch } from '../components/admin-search';
import { AdminWhitebitAssetSyncDialog } from '../components/admin-whitebit-asset-sync-dialog';
import { AdminCryptoAssetsBulkEditDialog } from '../components/admin-crypto-assets-bulk-edit-dialog';
import { OrderSupportToolsSection } from '../components/admin-order-support-tools';

type AppBuildInfo = {
  buildId: string;
  commit: string;
  deployedAt: string;
  environment: string;
};

type WorkspaceConfigSyncDetail = {
  counts: { add: number; update: number; softDisable: number; unchanged: number };
  keys: { add: string[]; update: string[]; softDisable: string[]; unchanged: string[] };
};

type WorkspaceConfigSyncResponse = {
  ok: boolean;
  dryRun?: boolean;
  applied?: boolean;
  stateHash?: string;
  counts: Record<string, WorkspaceConfigSyncDetail>;
};

const frontendBuildInfo: AppBuildInfo = {
  buildId: import.meta.env.APP_BUILD_ID || 'development',
  commit: import.meta.env.APP_COMMIT || 'unknown',
  deployedAt: import.meta.env.DEPLOYED_AT || 'development',
  environment: import.meta.env.MODE,
};
import { CatalogImageUploadField } from '../components/catalog-image-upload-field';
import { useAdminPermissions } from '../lib/admin-permissions';
import { PermissionKey } from '@workspace/api-client-react';

const DashboardCharts = lazy(() => import('./admin-overview-charts').then(({ DashboardCharts }) => ({ default: DashboardCharts })));
const OrderStatusChart = lazy(() => import('./admin-overview-charts').then(({ OrderStatusChart }) => ({ default: OrderStatusChart })));

function AdminCryptoLogo(props: ComponentProps<typeof CryptoLogo>) {
  return (
    <CryptoLogo
      {...props}
      logoFallbackUrls={[
        ...(props.logoFallbackUrls || []),
        ...cryptoLogoFallbackUrls(props.symbol),
      ]}
      className={cn('admin-crypto-logo', props.className)}
    />
  );
}

function AdminCryptoIdentity(props: ComponentProps<typeof CryptoIdentity>) {
  return (
    <CryptoIdentity
      {...props}
      logoFallbackUrls={[
        ...(props.logoFallbackUrls || []),
        ...cryptoLogoFallbackUrls(props.symbol),
      ]}
      className={cn('admin-crypto-identity', props.className)}
    />
  );
}

function AdminPaymentLogo({
  name,
  currencyCode,
  logoUrl,
}: {
  name: string;
  currencyCode?: string | null;
  logoUrl?: string | null;
}) {
  return (
    <PaymentMethodLogo
      name={name}
      logoUrl={logoUrl}
      badgeCode={currencyCode}
      badgeVariant="admin"
      className="admin-payment-logo-stack"
    />
  );
}

function AdminAssetIdentity(props: ComponentProps<typeof CryptoIdentity>) {
  if (!isFiatCurrencyCode(props.symbol)) return <AdminCryptoIdentity {...props} />;

  const normalizedCode = props.symbol.trim().toUpperCase();
  const identitySize = props.size || 'md';
  const paymentName = props.network?.trim() || props.name?.trim() || normalizedCode;
  const accessibleName = paymentName === normalizedCode
    ? normalizedCode
    : `${paymentName}, ${normalizedCode}, payment method`;

  return (
    <span
      className={cn('crypto-identity admin-asset-identity admin-fiat-identity', `admin-fiat-identity-${identitySize}`, props.compact && 'crypto-identity-compact', props.className)}
      aria-label={accessibleName}
      data-testid={props.testId}
    >
      <AdminPaymentLogo name={paymentName} currencyCode={normalizedCode} logoUrl={props.logoUrl} />
      <PaymentMethodCopy
        methodName={paymentName}
        currencyCode={normalizedCode}
        className="crypto-identity-copy"
      />
    </span>
  );
}

function AdminCurrencyLogo({ code }: { code: string }) {
  return isFiatCurrencyCode(code)
    ? <FiatCurrencyFlag code={code} variant="admin" className="admin-ranking-fiat-logo" />
    : <AdminCryptoLogo symbol={code} size="sm" />;
}

/*
 * This page owns a large set of dense operator surfaces. Keep the responsive
 * rules alongside those surfaces so they also cover portal-mounted drawers and
 * dialogs without widening the global application stylesheet.
 */
function AdminResponsiveStyles() {
  return <style>{`
    .admin-shell,
    .admin-shell .admin-content,
    .admin-shell .admin-main,
    .admin-shell .admin-main > *,
    .admin-shell .panel,
    .admin-shell form,
    .admin-shell label {
      min-width: 0;
      max-width: 100%;
    }

    .admin-shell .admin-main {
      overflow-x: clip;
    }

    .admin-shell .table-wrap,
    .admin-shell .overflow-x-auto {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      -webkit-overflow-scrolling: touch;
    }

    .admin-shell .data-table,
    .admin-shell .admin-table,
    .admin-shell .overview-queue-table {
      min-width: 720px;
    }

    .admin-shell .table-wrap small,
    .admin-shell .table-wrap code,
    .admin-shell .table-wrap .font-mono,
    .admin-shell .admin-table .font-mono {
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .admin-shell .panel-heading > div,
    .admin-shell .admin-welcome > *,
    .admin-shell .config-item > div,
    .admin-shell .capability-item > div,
    .admin-shell .customer-cell > div:last-child,
    .admin-shell .activity-item > div,
    .admin-shell .catalog-bulk-actions > *,
    .admin-shell .bulk-actions-bar > *,
    .admin-shell .pricing-coverage-card,
    .admin-shell .overview-health-status > div {
      min-width: 0;
    }

    .admin-shell .panel-heading h2,
    .admin-shell .admin-subtitle,
    .admin-shell .metric-card strong,
    .admin-shell .metric-card small,
    .admin-shell .pricing-coverage-card strong,
    .admin-shell .pricing-coverage-card small,
    .admin-shell .config-item p,
    .admin-shell .capability-item p,
    .admin-shell .customer-cell strong,
    .admin-shell .customer-cell small,
    .admin-shell .activity-item strong,
    .admin-shell .activity-item small,
    .admin-shell .system-state,
    .admin-shell .secure-badge {
      overflow-wrap: anywhere;
    }

    .admin-shell .recharts-responsive-container,
    .admin-shell .recharts-wrapper,
    .admin-shell .recharts-surface {
      max-width: 100%;
      min-width: 0;
    }

    .drawer-backdrop,
    .order-detail-backdrop {
      max-width: 100vw;
      overflow: hidden;
    }

    .order-drawer,
    .admin-order-drawer,
    .pricing-drawer,
    .network-drawer {
      max-width: 100vw;
      min-width: 0;
    }

    .order-drawer *,
    .admin-order-drawer *,
    .bulk-dialog * {
      min-width: 0;
    }

    .order-drawer input,
    .order-drawer select,
    .order-drawer textarea,
    .admin-order-drawer input,
    .admin-order-drawer select,
    .admin-order-drawer textarea {
      max-width: 100%;
    }

    .order-drawer dd,
    .order-drawer small,
    .order-drawer code,
    .admin-order-drawer dd,
    .admin-order-drawer small,
    .admin-order-drawer code,
    .admin-order-drawer .sidebar-customer-info,
    .admin-order-drawer .history-timeline p {
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .quickx-view-order {
      position: relative;
      isolation: isolate;
      color-scheme: dark;
      background:
        radial-gradient(circle at 78% 8%, rgba(122, 44, 255, 0.13), transparent 30%),
        radial-gradient(circle at 12% 48%, rgba(19, 221, 244, 0.055), transparent 34%),
        linear-gradient(180deg, #0a0e1b 0%, #070b16 55%, #090d19 100%);
      border-left: 1px solid rgba(36, 72, 255, 0.55);
      box-shadow: -16px 0 52px rgba(8, 123, 255, 0.1), inset 1px 0 rgba(19, 221, 244, 0.12);
    }

    .quickx-view-order::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(19, 221, 244, 0.025), transparent 18%, transparent 78%, rgba(122, 44, 255, 0.055));
    }

    .quickx-view-order .text-foreground {
      color: #f5f8ff;
    }

    .quickx-view-order .text-muted-foreground {
      color: rgba(218, 228, 255, 0.52);
    }

    .quickx-view-order select {
      color: #f5f8ff;
      background: rgba(7, 11, 22, 0.92);
      border-color: rgba(36, 72, 255, 0.34);
    }

    .quickx-view-order .quickx-order-header,
    .quickx-view-order .quickx-order-footer {
      background: rgba(8, 12, 25, 0.9);
      border-color: rgba(36, 72, 255, 0.28);
      box-shadow: inset 0 -1px rgba(19, 221, 244, 0.04), 0 0 24px rgba(36, 72, 255, 0.08);
      backdrop-filter: blur(14px);
    }

    .quickx-view-order .quickx-order-card {
      border-color: transparent;
      background:
        linear-gradient(145deg, rgba(18, 24, 43, 0.97), rgba(9, 13, 27, 0.98)) padding-box,
        linear-gradient(115deg, rgba(19, 221, 244, 0.42), rgba(8, 123, 255, 0.48) 36%, rgba(36, 72, 255, 0.52) 68%, rgba(122, 44, 255, 0.48)) border-box;
      box-shadow:
        inset 0 0 20px rgba(8, 123, 255, 0.045),
        inset 0 1px rgba(255, 255, 255, 0.035),
        0 0 8px rgba(8, 123, 255, 0.1),
        0 0 18px rgba(122, 44, 255, 0.055);
      transition: box-shadow 160ms ease, filter 160ms ease;
    }

    .quickx-view-order .quickx-order-card:hover,
    .quickx-view-order .quickx-order-card:active {
      box-shadow:
        inset 0 0 24px rgba(8, 123, 255, 0.075),
        inset 0 1px rgba(255, 255, 255, 0.045),
        0 0 11px rgba(19, 221, 244, 0.13),
        0 0 23px rgba(122, 44, 255, 0.09);
      filter: brightness(1.025);
    }

    .quickx-view-order .quickx-exchange-card {
      border-color: transparent;
      background:
        linear-gradient(#090d1a, #090d1a) padding-box,
        linear-gradient(115deg, rgba(19, 221, 244, 0.58), rgba(8, 123, 255, 0.58) 34%, rgba(36, 72, 255, 0.64) 67%, rgba(122, 44, 255, 0.62)) border-box;
      box-shadow:
        inset 0 0 25px rgba(36, 72, 255, 0.06),
        0 0 10px rgba(8, 123, 255, 0.12),
        0 0 24px rgba(122, 44, 255, 0.08);
      transition: box-shadow 160ms ease, filter 160ms ease;
    }

    .quickx-view-order .quickx-exchange-card:hover,
    .quickx-view-order .quickx-exchange-card:active {
      box-shadow:
        inset 0 0 29px rgba(36, 72, 255, 0.09),
        0 0 13px rgba(19, 221, 244, 0.15),
        0 0 28px rgba(122, 44, 255, 0.11);
      filter: brightness(1.025);
    }

    .quickx-view-order .quickx-send-card,
    .quickx-view-order .quickx-receive-card,
    .quickx-view-order .quickx-rate-card {
      border-color: transparent;
      transition: box-shadow 160ms ease, filter 160ms ease;
    }

    .quickx-view-order .quickx-send-card {
      background:
        linear-gradient(145deg, rgba(7, 27, 32, 0.94), rgba(8, 17, 28, 0.98)) padding-box,
        linear-gradient(120deg, rgba(19, 221, 244, 0.66), rgba(26, 209, 146, 0.42), rgba(8, 123, 255, 0.42)) border-box;
      box-shadow: inset 0 0 18px rgba(19, 221, 244, 0.055), 0 0 9px rgba(19, 221, 244, 0.12), 0 0 18px rgba(26, 209, 146, 0.06);
    }

    .quickx-view-order .quickx-receive-card {
      background:
        linear-gradient(145deg, rgba(17, 15, 38, 0.95), rgba(10, 13, 29, 0.98)) padding-box,
        linear-gradient(120deg, rgba(8, 123, 255, 0.52), rgba(36, 72, 255, 0.62), rgba(122, 44, 255, 0.68)) border-box;
      box-shadow: inset 0 0 18px rgba(122, 44, 255, 0.06), 0 0 9px rgba(36, 72, 255, 0.13), 0 0 19px rgba(122, 44, 255, 0.08);
    }

    .quickx-view-order .quickx-rate-card {
      background:
        linear-gradient(145deg, rgba(15, 16, 34, 0.96), rgba(9, 12, 26, 0.98)) padding-box,
        linear-gradient(115deg, rgba(8, 123, 255, 0.42), rgba(36, 72, 255, 0.5), rgba(122, 44, 255, 0.54)) border-box;
      box-shadow: inset 0 0 15px rgba(122, 44, 255, 0.045), 0 0 8px rgba(36, 72, 255, 0.1), 0 0 16px rgba(122, 44, 255, 0.055);
    }

    .quickx-view-order .quickx-send-card:hover,
    .quickx-view-order .quickx-send-card:active {
      box-shadow: inset 0 0 22px rgba(19, 221, 244, 0.085), 0 0 12px rgba(19, 221, 244, 0.17), 0 0 22px rgba(26, 209, 146, 0.09);
      filter: brightness(1.035);
    }

    .quickx-view-order .quickx-receive-card:hover,
    .quickx-view-order .quickx-receive-card:active,
    .quickx-view-order .quickx-rate-card:hover,
    .quickx-view-order .quickx-rate-card:active {
      box-shadow: inset 0 0 22px rgba(122, 44, 255, 0.085), 0 0 12px rgba(36, 72, 255, 0.17), 0 0 23px rgba(122, 44, 255, 0.11);
      filter: brightness(1.035);
    }

    .quickx-view-order .quickx-important-value {
      color: #f7fbff;
      text-shadow: 0 0 12px rgba(19, 221, 244, 0.1);
    }

    .quickx-view-order .quickx-manual-status {
      box-shadow: inset 0 0 22px rgba(122, 44, 255, 0.06), 0 0 10px rgba(36, 72, 255, 0.11), 0 0 22px rgba(122, 44, 255, 0.08);
    }

    .quickx-view-order .quickx-status-active {
      box-shadow: 0 0 14px currentColor;
    }

    .quickx-view-order [data-testid="button-copy-order-info"] {
      color: #dcecff;
      border: 1px solid transparent;
      background:
        linear-gradient(rgba(11, 17, 33, 0.97), rgba(11, 17, 33, 0.97)) padding-box,
        linear-gradient(110deg, rgba(19, 221, 244, 0.62), rgba(8, 123, 255, 0.58), rgba(36, 72, 255, 0.62), rgba(122, 44, 255, 0.58)) border-box;
      box-shadow: inset 0 0 15px rgba(8, 123, 255, 0.065), 0 0 9px rgba(19, 221, 244, 0.1), 0 0 18px rgba(122, 44, 255, 0.07);
      transition: box-shadow 160ms ease, filter 160ms ease;
    }

    .quickx-view-order [data-testid="button-copy-order-info"]:hover,
    .quickx-view-order [data-testid="button-copy-order-info"]:active {
      box-shadow: inset 0 0 19px rgba(8, 123, 255, 0.09), 0 0 12px rgba(19, 221, 244, 0.15), 0 0 23px rgba(122, 44, 255, 0.1);
      filter: brightness(1.06);
    }

    .quickx-view-order [data-testid="button-close-footer"] {
      color: white;
      border: 0;
      background: linear-gradient(110deg, #13DDF4 0%, #087BFF 36%, #2448FF 66%, #7A2CFF 100%);
      box-shadow: 0 0 20px rgba(36, 72, 255, 0.22);
    }

    .quickx-view-order [data-testid="button-close-footer"]:hover {
      filter: brightness(1.08);
      box-shadow: 0 0 25px rgba(122, 44, 255, 0.28);
    }

    html:not(.dark) .quickx-view-order {
      color-scheme: light;
      background:
        radial-gradient(circle at 78% 8%, rgba(122, 44, 255, 0.055), transparent 30%),
        radial-gradient(circle at 12% 48%, rgba(19, 221, 244, 0.045), transparent 34%),
        linear-gradient(180deg, #ffffff 0%, #f8faff 55%, #f4f7ff 100%);
      border-left-color: rgba(36, 72, 255, 0.22);
      box-shadow: -16px 0 52px rgba(15, 23, 42, 0.12), inset 1px 0 rgba(19, 221, 244, 0.12);
    }

    html:not(.dark) .quickx-view-order::before {
      background: linear-gradient(180deg, rgba(19, 221, 244, 0.025), transparent 18%, transparent 78%, rgba(122, 44, 255, 0.035));
    }

    html:not(.dark) .quickx-view-order .text-foreground,
    html:not(.dark) .quickx-view-order .quickx-important-value {
      color: #172033;
      text-shadow: none;
    }

    html:not(.dark) .quickx-view-order .text-muted-foreground,
    html:not(.dark) .quickx-view-order .text-slate-400,
    html:not(.dark) .quickx-view-order .text-slate-500,
    html:not(.dark) .quickx-view-order .text-white\/45,
    html:not(.dark) .quickx-view-order .text-white\/50,
    html:not(.dark) .quickx-view-order .text-white\/55,
    html:not(.dark) .quickx-view-order .text-white\/70 {
      color: #526176 !important;
      opacity: 1;
    }

    html:not(.dark) .quickx-view-order .text-white\/30,
    html:not(.dark) .quickx-view-order .text-white\/35 {
      color: #68768a !important;
      opacity: 1;
    }

    html:not(.dark) .quickx-view-order .quickx-exchange-card h3,
    html:not(.dark) .quickx-view-order .quickx-exchange-card time {
      color: #172033;
    }

    html:not(.dark) .quickx-view-order .quickx-send-card .text-cyan-300 {
      color: #08778b;
    }

    html:not(.dark) .quickx-view-order .quickx-receive-card .text-violet-300 {
      color: #6734b7;
    }

    html:not(.dark) .quickx-view-order .text-indigo-200 {
      color: #384d88;
    }

    html:not(.dark) .quickx-view-order .text-blue-300 {
      color: #145fbd;
    }

    html:not(.dark) .quickx-view-order .text-violet-300 {
      color: #6734b7;
    }

    html:not(.dark) .quickx-view-order .text-emerald-300,
    html:not(.dark) .quickx-view-order .text-emerald-400 {
      color: #087a56;
    }

    html:not(.dark) .quickx-view-order .text-amber-300 {
      color: #9a5a08;
    }

    html:not(.dark) .quickx-view-order .text-red-400 {
      color: #c73535;
    }

    html:not(.dark) .quickx-view-order .quickx-secondary-label,
    html:not(.dark) .quickx-view-order .quickx-field-label {
      color: #334155 !important;
      opacity: 1 !important;
      text-shadow: none !important;
    }

    html:not(.dark) .quickx-view-order .quickx-section-label {
      color: #263449 !important;
      opacity: 1 !important;
      text-shadow: none !important;
    }

    html:not(.dark) .quickx-view-order .quickx-progress-label {
      color: #475569 !important;
      opacity: 1 !important;
      text-shadow: none !important;
    }

    html:not(.dark) .quickx-view-order .quickx-order-card > div > .quickx-field-label {
      color: #2f3d52 !important;
    }

    html:not(.dark) .quickx-view-order .quickx-order-card :is(
      .quickx-important-value,
      .text-foreground,
      .text-slate-900
    ) {
      color: #111827 !important;
      opacity: 1 !important;
    }

    html:not(.dark) .quickx-view-order .quickx-exchange-card :is(
      .text-white,
      .quickx-important-value
    ) {
      color: #111827 !important;
      opacity: 1 !important;
    }

    html:not(.dark) .quickx-view-order .quickx-exchange-card time,
    html:not(.dark) .quickx-view-order .quickx-send-card .text-white\/45,
    html:not(.dark) .quickx-view-order .quickx-receive-card .text-white\/45,
    html:not(.dark) .quickx-view-order .quickx-rate-card .text-white\/35 {
      color: #475569 !important;
      opacity: 1 !important;
    }

    html:not(.dark) .quickx-view-order .quickx-send-card .text-cyan-300 {
      color: #075f6f !important;
    }

    html:not(.dark) .quickx-view-order .quickx-receive-card .text-violet-300 {
      color: #5927a3 !important;
    }

    html:not(.dark) .quickx-view-order :is(
      .quickx-order-card,
      .quickx-exchange-card,
      .quickx-send-card,
      .quickx-receive-card,
      .quickx-rate-card
    ) {
      color: #172033;
    }

    html:not(.dark) .quickx-view-order select {
      color: #172033;
      background: #ffffff;
      border-color: rgba(36, 72, 255, 0.2);
    }

    html:not(.dark) .quickx-view-order .quickx-order-header,
    html:not(.dark) .quickx-view-order .quickx-order-footer {
      background: rgba(255, 255, 255, 0.94);
      border-color: rgba(36, 72, 255, 0.14);
      box-shadow: inset 0 -1px rgba(19, 221, 244, 0.04), 0 0 24px rgba(36, 72, 255, 0.045);
    }

    html:not(.dark) .quickx-view-order .quickx-order-card {
      background:
        linear-gradient(145deg, rgba(255, 255, 255, 0.99), rgba(247, 249, 255, 0.99)) padding-box,
        linear-gradient(115deg, rgba(19, 180, 210, 0.34), rgba(8, 123, 255, 0.35) 36%, rgba(36, 72, 255, 0.38) 68%, rgba(122, 44, 255, 0.34)) border-box;
      box-shadow:
        inset 0 0 20px rgba(8, 123, 255, 0.025),
        inset 0 1px rgba(255, 255, 255, 0.8),
        0 6px 18px rgba(15, 23, 42, 0.055);
    }

    html:not(.dark) .quickx-view-order .quickx-exchange-card {
      background:
        linear-gradient(#ffffff, #f8faff) padding-box,
        linear-gradient(115deg, rgba(19, 180, 210, 0.46), rgba(8, 123, 255, 0.46) 34%, rgba(36, 72, 255, 0.5) 67%, rgba(122, 44, 255, 0.48)) border-box;
      box-shadow: inset 0 0 25px rgba(36, 72, 255, 0.035), 0 8px 24px rgba(15, 23, 42, 0.07);
    }

    html:not(.dark) .quickx-view-order .quickx-send-card {
      background:
        linear-gradient(145deg, #f4fffe, #f8fcff) padding-box,
        linear-gradient(120deg, rgba(19, 190, 205, 0.52), rgba(26, 170, 125, 0.35), rgba(8, 123, 255, 0.34)) border-box;
      box-shadow: inset 0 0 18px rgba(19, 221, 244, 0.035), 0 6px 16px rgba(15, 23, 42, 0.045);
    }

    html:not(.dark) .quickx-view-order .quickx-receive-card {
      background:
        linear-gradient(145deg, #fbf9ff, #f8f9ff) padding-box,
        linear-gradient(120deg, rgba(8, 123, 255, 0.4), rgba(36, 72, 255, 0.44), rgba(122, 44, 255, 0.5)) border-box;
      box-shadow: inset 0 0 18px rgba(122, 44, 255, 0.035), 0 6px 16px rgba(15, 23, 42, 0.045);
    }

    html:not(.dark) .quickx-view-order .quickx-rate-card {
      background:
        linear-gradient(145deg, #f8faff, #f5f7ff) padding-box,
        linear-gradient(115deg, rgba(8, 123, 255, 0.34), rgba(36, 72, 255, 0.38), rgba(122, 44, 255, 0.4)) border-box;
      box-shadow: inset 0 0 15px rgba(122, 44, 255, 0.025), 0 5px 14px rgba(15, 23, 42, 0.04);
    }

    html:not(.dark) .quickx-view-order [data-testid="button-copy-order-info"] {
      color: #22304a;
      background:
        linear-gradient(#ffffff, #ffffff) padding-box,
        linear-gradient(110deg, rgba(19, 180, 210, 0.48), rgba(8, 123, 255, 0.46), rgba(36, 72, 255, 0.48), rgba(122, 44, 255, 0.44)) border-box;
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
    }

    @media (max-width: 900px) {
      .admin-shell .panel-heading,
      .admin-shell .admin-welcome,
      .admin-shell .catalog-bulk-actions,
      .admin-shell .bulk-actions-bar,
      .admin-shell .overview-controls {
        flex-wrap: wrap;
      }

      .admin-shell .provider-grid,
      .admin-shell .pricing-layout,
      .admin-shell .pricing-coverage-summary {
        grid-template-columns: minmax(0, 1fr);
      }

      .admin-shell .customer-search {
        width: 100%;
        max-width: none;
      }

      .admin-shell .mode-switch {
        width: 100%;
        max-width: none !important;
        overflow: hidden;
      }

      .admin-order-drawer .order-drawer-content {
        grid-template-columns: minmax(0, 1fr);
      }

      .admin-order-drawer .drawer-settlement-stack {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @media (max-width: 640px) {
      .admin-shell .admin-main {
        padding-inline: 14px;
      }

      .admin-shell .panel,
      .admin-shell .metric-card,
      .admin-shell .pricing-rules-panel,
      .admin-shell .pricing-preview {
        padding: 16px;
      }

      .admin-shell .panel.p-0,
      .admin-shell .orders-panel {
        padding: 0;
      }

      .admin-shell .panel-heading,
      .admin-shell .admin-welcome,
      .admin-shell .overview-controls,
      .admin-shell .overview-queue-toolbar,
      .admin-shell .catalog-bulk-actions,
      .admin-shell .bulk-actions-bar,
      .admin-shell .panel-footer {
        align-items: stretch;
        flex-direction: column;
      }

      .admin-shell .panel-heading > a,
      .admin-shell .panel-heading > button,
      .admin-shell .admin-welcome > .system-state,
      .admin-shell .catalog-bulk-buttons,
      .admin-shell .bulk-actions-controls {
        width: 100%;
      }

      .admin-shell .panel-heading > .icon-button {
        width: 40px;
      }

      .admin-shell .catalog-bulk-buttons,
      .admin-shell .bulk-actions-controls {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }

      .admin-shell .catalog-bulk-buttons .button,
      .admin-shell .bulk-actions-controls .button,
      .admin-shell .panel-heading > .button,
      .admin-shell .panel-heading > .text-link {
        justify-content: center;
      }

      .admin-shell .overview-metrics,
      .admin-shell [class~="grid-cols-3"],
      .admin-shell [class~="grid-cols-4"],
      .admin-shell .detail-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .admin-shell .overview-metrics {
        gap: 10px;
      }

      .admin-shell .overview-metrics .metric-card {
        min-height: 0;
      }

      .admin-shell .overview-product-tabs,
      .admin-shell .archive-switch,
      .admin-shell .product-switch {
        width: 100%;
      }

      .admin-shell .overview-controls > div:last-child,
      .admin-shell .overview-controls > div:last-child > div,
      .admin-shell .overview-controls [aria-label="Overview date range"] {
        width: 100%;
      }

      .admin-shell .overview-controls [aria-label="Overview date range"] {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }

      .admin-shell .overview-controls [aria-label="Overview date range"] button {
        min-width: 0;
        padding-inline: 4px;
      }

      .admin-shell .overview-controls input[type="date"] {
        flex: 1 1 130px;
      }

      .admin-shell .mode-switch {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }

      .admin-shell .mode-switch button {
        min-width: 0;
        padding: 10px 8px;
      }

      .admin-shell .mode-switch button > div {
        min-width: 0;
      }

      .admin-shell .mode-switch button span,
      .admin-shell .mode-switch button small {
        overflow-wrap: anywhere;
      }

      .admin-shell .volume-chart {
        gap: 6px;
        overflow-x: auto;
      }

      .admin-shell .volume-chart .bar-group {
        min-width: 38px;
      }

      .admin-shell .table-empty,
      .admin-shell .empty-state {
        padding: 32px 16px;
      }

      .drawer-backdrop,
      .order-detail-backdrop {
        padding: 0;
        align-items: flex-end;
      }

      .order-drawer,
      .admin-order-drawer,
      .pricing-drawer,
      .network-drawer {
        width: 100vw;
        max-width: none;
        height: 100dvh;
        max-height: 100dvh;
        border-radius: 0;
      }

      .order-drawer .drawer-head,
      .order-drawer .order-drawer-head,
      .admin-order-drawer .drawer-head,
      .admin-order-drawer .order-drawer-head {
        padding: 16px;
      }

      .order-drawer .drawer-edit,
      .order-drawer > .flex-1,
      .admin-order-drawer .order-drawer-main,
      .admin-order-drawer .order-drawer-sidebar {
        padding: 16px;
      }

      .order-drawer [class~="grid-cols-2"],
      .order-drawer .form-grid,
      .order-drawer .pricing-form-grid,
      .admin-order-drawer .overview-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .order-drawer .col-span-2 {
        grid-column: auto;
      }

      .admin-order-drawer .order-route-amounts {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 14px;
      }

      .admin-order-drawer .order-route-amounts > svg {
        transform: rotate(90deg);
      }

      .admin-order-drawer .operations-step strong {
        overflow-wrap: anywhere;
      }

      .bulk-dialog {
        width: calc(100vw - 24px);
        max-width: none;
        max-height: calc(100dvh - 24px);
        overflow-y: auto;
      }
    }

    @media (max-width: 380px) {
      .admin-shell .admin-main {
        padding-inline: 10px;
      }

      .admin-shell .admin-header {
        padding-inline: 10px;
      }

      .admin-shell .panel,
      .admin-shell .metric-card,
      .admin-shell .pricing-rules-panel,
      .admin-shell .pricing-preview {
        padding: 14px;
      }

      .admin-shell .panel.p-0,
      .admin-shell .orders-panel {
        padding: 0;
      }

      .admin-shell [class~="grid-cols-2"]:not(.overview-metrics),
      .admin-shell .mode-switch,
      .admin-shell .bulk-dialog-actions {
        grid-template-columns: minmax(0, 1fr);
      }

      .admin-shell .overview-controls [aria-label="Overview date range"] {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .admin-shell .overview-controls [aria-label="Overview date range"] button:last-child {
        grid-column: span 2;
      }

      .admin-shell .button {
        max-width: 100%;
        white-space: normal;
        text-align: center;
      }

      .admin-shell .panel-footer > div {
        width: 100%;
        min-width: 0;
        flex-wrap: wrap;
      }

      .admin-shell .panel-footer select {
        width: 100% !important;
      }

      .order-drawer .drawer-edit,
      .order-drawer > .flex-1,
      .admin-order-drawer .order-drawer-main,
      .admin-order-drawer .order-drawer-sidebar {
        padding-inline: 12px;
      }

      .order-drawer .flex.gap-4,
      .order-drawer .flex.gap-2 {
        flex-wrap: wrap;
      }

      .network-drawer-actions,
      .order-drawer .network-drawer-actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }

      .bulk-dialog-actions {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `}</style>;
}


function AdminIntegrations() {
  const { t } = useI18n();
  const { can, isOwner } = useAdminPermissions();
  const canConfigureCredentials = isOwner && can('integrations.credentials.update');
  const canCreateCredentials = isOwner && can('integrations.credentials.create');
  const canTestCredentials = isOwner && can('integrations.credentials.test');
  const queryClient = useQueryClient();
  const queryKey = getGetQuickexCredentialsQueryKey();
  const statusQuery = useGetQuickexCredentials({ query: { queryKey } });
  const updateProvider = useUpdateQuickexCredentials();
  const connectionTest = useTestQuickexCredentials();
  const whitebitStatusQuery = useGetWhitebitProviderStatus({
    query: { queryKey: getGetWhitebitProviderStatusQueryKey() },
  });
  const whitebitCredentialsQuery = useGetWhitebitCredentials({
    query: { queryKey: getGetWhitebitCredentialsQueryKey() },
  });
  const updateWhitebit = useUpdateWhitebitCredentials();
  const testWhitebit = useTestWhitebitCredentials();
  const toggleWhitebit = useUpdateWhitebitProviderStatus();

  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirmed, setPinConfirmed] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [testNotice, setTestNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [whitebitApiKey, setWhitebitApiKey] = useState('');
  const [whitebitSecretKey, setWhitebitSecretKey] = useState('');
  const [whitebitConfigurationOpen, setWhitebitConfigurationOpen] = useState(false);
  const [whitebitNotice, setWhitebitNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const status = statusQuery.data;
  const pinIsValid = /^\d{4,8}$/.test(pin);

  const confirmPin = () => {
    if (!pinIsValid) {
      setUpdateNotice({ kind: 'error', text: t('adminProviders.enter_a_4_8_digit_pin_to') });
      return;
    }
    setUpdateNotice(null);
    setPinConfirmed(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinConfirmed || !publicKey.trim() || !secretKey.trim()) return;

    setUpdateNotice(null);
    updateProvider.mutate(
      { data: { publicKey: publicKey.trim(), secretKey: secretKey.trim() } },
      {
        onSuccess: () => {
          setPublicKey('');
          setSecretKey('');
          setPin('');
          setPinConfirmed(false);
          queryClient.invalidateQueries({ queryKey });
          queryClient.invalidateQueries({ queryKey: getGetQuickexConfigQueryKey() });
          setUpdateNotice({ kind: 'success', text: t('adminProviders.quickex_signed_order_api_connected_real_exchange') });
        },
        onError: (err) => {
          setUpdateNotice({ kind: 'error', text: apiErrorText(err, t('adminProviders.failed_to_update_credentials_please_try_again')) });
        }
      }
    );
  };

  const handleTest = () => {
    setTestNotice(null);
    connectionTest.mutate(undefined, {
      onSuccess: (data) => setTestNotice({
        kind: data.ok ? 'success' : 'error',
        text: data.message,
      }),
      onError: (error) => setTestNotice({
        kind: 'error',
        text: apiErrorText(error, t('adminProviders.failed_to_run_diagnostic_test')),
      }),
    });
  };

  const isConfigured = status?.configured || false;
  const reachability = status?.providerReachability || 'unknown';
  const remotelyAuth = status?.remotelyAuthenticated || false;
  const blocked = status?.blockedByProviderPolicy || false;

  const whitebitStatus = whitebitStatusQuery.data;
  const whitebitCredentials = whitebitCredentialsQuery.data;
  const connectedCount = (isConfigured ? 1 : 0) + (whitebitCredentials?.configured ? 1 : 0);
  const isHealthy = isConfigured && remotelyAuth && reachability === 'reachable' && !blocked;
  const whitebitHealthy = Boolean(whitebitStatus?.enabled && whitebitStatus.state === 'ready');
  const healthyCount = (isHealthy ? 1 : 0) + (whitebitHealthy ? 1 : 0);
  const isFailed = Boolean(status && isConfigured && (reachability === 'unreachable' || blocked));
  const whitebitFailed = Boolean(whitebitStatus && !whitebitStatus.explicitDisabled && whitebitStatus.state === 'unavailable');
  const failedCount = (isFailed ? 1 : 0) + (whitebitFailed ? 1 : 0);
  const isWarning = isConfigured && !isHealthy && !isFailed;
  const whitebitWarning = Boolean(whitebitCredentials?.configured && !whitebitHealthy && !whitebitFailed);
  const warningCount = (isWarning ? 1 : 0) + (whitebitWarning ? 1 : 0);
  const overviewValue = (value: number) => statusQuery.isLoading || whitebitCredentialsQuery.isLoading ? '—' : value;
  const refreshIntegration = () => {
    void statusQuery.refetch();
    void whitebitStatusQuery.refetch();
    void whitebitCredentialsQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: getGetQuickexConfigQueryKey() });
  };
  const scrollToLogs = () => {
    document.getElementById('api-activity-section')?.scrollIntoView({ behavior: 'smooth' });
  };
  const openConfiguration = () => setConfigurationOpen(true);
  const refreshWhitebit = () => {
    void queryClient.invalidateQueries({ queryKey: getGetWhitebitCredentialsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetWhitebitProviderStatusQueryKey() });
  };
  const handleWhitebitUpdate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!whitebitApiKey.trim() || !whitebitSecretKey.trim()) return;
    setWhitebitNotice(null);
    updateWhitebit.mutate({ data: { apiKey: whitebitApiKey.trim(), secretKey: whitebitSecretKey.trim() } }, {
      onSuccess: () => {
        setWhitebitApiKey('');
        setWhitebitSecretKey('');
        setWhitebitConfigurationOpen(false);
        refreshWhitebit();
        setWhitebitNotice({ kind: 'success', text: 'WhiteBIT credentials were validated and stored securely. The API remains off until address creation permission is verified.' });
      },
      onError: (error) => setWhitebitNotice({ kind: 'error', text: apiErrorText(error, 'WhiteBIT rejected the credentials.') }),
    });
  };
  const handleWhitebitTest = () => {
    setWhitebitNotice(null);
    testWhitebit.mutate(undefined, {
      onSuccess: (data) => setWhitebitNotice({ kind: data.ok ? 'success' : 'error', text: data.message }),
      onError: (error) => setWhitebitNotice({ kind: 'error', text: apiErrorText(error, 'WhiteBIT signed API test failed.') }),
    });
  };
  const handleWhitebitToggle = () => {
    if (!whitebitStatus) return;
    setWhitebitNotice(null);
    toggleWhitebit.mutate({ data: { enabled: !whitebitStatus.enabled } }, {
      onSuccess: () => refreshWhitebit(),
      onError: (error) => setWhitebitNotice({ kind: 'error', text: apiErrorText(error, 'WhiteBIT could not be enabled. Signed address creation permission is required.') }),
    });
  };

  return (
    <AdminShell
      title={t('adminProviders.api_integrations')}
      eyebrow={t('adminProviders.operations_settings')}
      subtitle={t('adminProviders.connect_configure_and_monitor_external_exchange_and')}
      requiredPermission="integrations.view"
    >
      <div className="api-integrations-page space-y-6">
        <div className="admin-page-actions api-integrations-actions">
          <button type="button" onClick={refreshIntegration} disabled={statusQuery.isFetching} className="button button-secondary whitespace-nowrap h-9 px-4 text-xs font-bold uppercase tracking-wider" data-testid="button-refresh-integrations">
            <RefreshCw size={14} className={cn("mr-2", statusQuery.isFetching && "animate-spin")} />
            {t('adminProviders.refresh')}</button>
          <button type="button" onClick={scrollToLogs} className="button button-secondary whitespace-nowrap h-9 px-4 text-xs font-bold uppercase tracking-wider" data-testid="button-view-api-logs">
            <Activity size={14} className="mr-2" />
            {t('adminProviders.view_api_logs')}</button>
          {(canConfigureCredentials || canCreateCredentials) && <button type="button" onClick={openConfiguration} className="button button-primary whitespace-nowrap h-9 px-4 text-xs font-bold uppercase tracking-wider" data-testid="button-add-integration">
            <Zap size={14} className="mr-2" />
            {t('adminProviders.add_integration')}</button>}
        </div>
        <div className="integration-summary-grid grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="metric-card integration-summary-card tone-connected">
            <div className="metric-head">
              <div className="metric-icon-wrap"><Network size={16} /></div>
              <small>{t('adminProviders.connected_providers')}</small>
            </div>
            <strong data-testid="integration-summary-connected">{overviewValue(connectedCount)}</strong>
          </div>
          <div className="metric-card integration-summary-card tone-healthy">
            <div className="metric-head">
              <div className="metric-icon-wrap !text-green-500 !bg-green-500/10"><CheckCircle size={16} /></div>
              <small>{t('adminProviders.healthy_connections')}</small>
            </div>
            <strong data-testid="integration-summary-healthy">{overviewValue(healthyCount)}</strong>
          </div>
          <div className="metric-card integration-summary-card tone-warning">
            <div className="metric-head">
              <div className="metric-icon-wrap !text-amber-500 !bg-amber-500/10"><CircleAlert size={16} /></div>
              <small>{t('adminProviders.warnings')}</small>
            </div>
            <strong data-testid="integration-summary-warning">{overviewValue(warningCount)}</strong>
          </div>
          <div className="metric-card integration-summary-card tone-failed">
            <div className="metric-head">
              <div className="metric-icon-wrap !text-destructive !bg-destructive/10"><Ban size={16} /></div>
              <small>{t('adminProviders.failed_connections')}</small>
            </div>
            <strong data-testid="integration-summary-failed">{overviewValue(failedCount)}</strong>
          </div>
        </div>

        {statusQuery.isLoading ? (
          <LoadingBlock rows={6} />
        ) : statusQuery.isError ? (
          <ErrorState message={t('adminProviders.load_provider_status_error')} retry={() => statusQuery.refetch()} />
        ) : status ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <div className="lg:col-span-2 space-y-6 min-w-0">
              <div className="panel integration-provider-card p-0 overflow-hidden border-border bg-card shadow-md">
                <div className="integration-provider-header p-5 border-b border-border/50 bg-muted/20 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="integration-provider-mark w-12 h-12 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm shrink-0">
                      <Zap className="text-primary" size={24} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base flex items-center gap-2">
                        {status.provider || 'Quickex'}
                        {status.remotelyAuthenticated && <BadgeCheck size={14} className="text-primary shrink-0" />}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono mt-1 uppercase tracking-wider truncate">{t('adminProviders.exchange_provider_market_data')}</p>
                    </div>
                  </div>
                  <StatusPill status={status.remotelyAuthenticated ? 'verified' : status.configured ? 'verification required' : 'not configured'} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border/50">
                    <div className="integration-provider-fact bg-card p-5">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">{t('adminProviders.auth_source')}</div>
                    <div className="text-xs font-mono">{status.credentialSource === 'environment' ? t('adminProviders.env_secrets') : status.credentialSource === 'stored' ? t('adminProviders.encrypted_db') : t('adminProviders.unconfigured')}</div>
                  </div>
                    <div className="integration-provider-fact bg-card p-5">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">{t('adminProviders.api_key')}</div>
                      <div className={cn("integration-status-value text-xs font-mono flex items-center gap-1", status.apiKeyConfigured ? "tone-success" : "tone-warning")}>
                      {status.apiKeyConfigured ? <><Check size={12}/> {t('adminProviders.present')}</> : <><X size={12}/> {t('adminProviders.missing')}</>}
                    </div>
                  </div>
                    <div className="integration-provider-fact bg-card p-5">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">{t('adminProviders.public_key')}</div>
                      <div className={cn("integration-status-value text-xs font-mono flex items-center gap-1", status.publicKeyConfigured ? "tone-success" : "tone-warning")}>
                      {status.publicKeyConfigured ? <><Check size={12}/> {t('adminProviders.present')}</> : <><X size={12}/> {t('adminProviders.missing')}</>}
                    </div>
                  </div>
                    <div className="integration-provider-fact bg-card p-5">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">{t('adminProviders.secret_key')}</div>
                      <div className={cn("integration-status-value text-xs font-mono flex items-center gap-1", status.secretKeyConfigured ? "tone-success" : "tone-error")}>
                      {status.secretKeyConfigured ? <><Check size={12}/> {t('adminProviders.present')}</> : <><X size={12}/> {t('adminProviders.missing')}</>}
                    </div>
                  </div>
                    <div className="integration-provider-fact bg-card p-5">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">{t('adminProviders.last_update')}</div>
                    <div className="text-xs font-mono">{exactDateTime(status.updatedAt)}</div>
                  </div>
                </div>

                <div className="integration-provider-health p-5 border-t border-border/50 bg-muted/10">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider">{t('adminProviders.provider_health')}</h4>
                    {status.documentationUrl && (
                      <a href={status.documentationUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline flex items-center gap-1">
                        {t('adminProviders.api_docs')}<ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                    <div className="integration-health-item flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.api_availability')}</span>
                      <span className={cn("integration-health-value font-mono text-xs", status.providerReachability === 'reachable' ? "tone-success" : status.providerReachability === 'unknown' ? "tone-warning" : "tone-error")}>{status.providerReachability}</span>
                    </div>
                    <div className="integration-health-item flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.authentication')}</span>
                      <span className={cn("integration-health-value font-mono text-xs", status.remotelyAuthenticated ? "tone-success" : "tone-warning")}>{status.remotelyAuthenticated ? t('adminProviders.authenticated') : status.verificationState}</span>
                    </div>
                    <div className="integration-health-item flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.market_data')}</span>
                      <span className={cn("integration-health-value font-mono text-xs", status.liveQuotes ? "tone-success" : "tone-warning")}>
                        {status.liveQuotes ? t('adminProviders.live') : t('adminProviders.unavailable')}
                      </span>
                    </div>
                    <div className="integration-health-item flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.order_placement')}</span>
                      <span className={cn("integration-health-value font-mono text-xs", status.signedOrders ? "tone-info" : "tone-warning")}>
                        {status.signedOrders ? t('adminProviders.enabled') : t('adminProviders.disabled')}
                      </span>
                    </div>
                    <div className="integration-health-item flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.provider_policy')}</span>
                      <span className={cn("integration-health-value font-mono text-xs", status.blockedByProviderPolicy ? "tone-error" : "tone-info")}>
                        {status.blockedByProviderPolicy ? t('adminProviders.blocked') : t('adminProviders.clear')}
                      </span>
                    </div>
                    {status.reconciliation && (
                      <div className="integration-health-item flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.reconciliation')}</span>
                        <span className={cn("integration-health-value font-mono text-xs", status.reconciliation.state === 'healthy' ? "tone-success" : status.reconciliation.state === 'degraded' ? "tone-error" : "tone-warning")}>{status.reconciliation.state}</span>
                      </div>
                    )}
                    <div className="integration-health-item flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.rate_limits_latency')}</span>
                      <span className="integration-health-value tone-neutral font-mono text-xs">{t('adminProviders.not_exposed')}</span>
                    </div>
                    {status.lastTestedAt && (
                      <div className="integration-health-item flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.last_tested')}</span>
                        <span className="integration-health-value tone-info font-mono text-xs">{exactDateTime(status.lastTestedAt)}</span>
                      </div>
                    )}
                    {status.lastVerifiedAt && (
                      <div className="integration-health-item flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.last_verified')}</span>
                        <span className="integration-health-value tone-success font-mono text-xs">{exactDateTime(status.lastVerifiedAt)}</span>
                      </div>
                    )}
                  </div>
                  {status.message && (
                    <div className="mt-4 p-3 bg-card border border-border/50 rounded-xl">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block mb-1">{t('adminProviders.status_message')}</span>
                      <span className="font-mono text-xs break-words">{status.message}</span>
                    </div>
                  )}
                </div>

                <div className="bg-card p-5 flex flex-wrap items-center justify-between gap-4 border-t border-border/50">
                  <div className="flex flex-wrap gap-8">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.api_version')}</span>
                      <span className="font-mono text-xs">{t('adminProviders.v2_signed')}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('adminProviders.integration_mode')}</span>
                      <span className="font-mono text-xs uppercase">{status.mode || 'Unknown'}</span>
                    </div>
                  </div>
                  {canTestCredentials && <button
                    type="button"
                    aria-label={t('adminProviders.test_signed_order_api')}
                    onClick={handleTest}
                    disabled={connectionTest.isPending}
                    className="button button-secondary whitespace-nowrap h-9 px-4 text-xs font-bold uppercase tracking-wider shrink-0"
                  >
                    {connectionTest.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : <Activity size={14} className="mr-2" />}
                    {t('adminProviders.run_diagnostics')}</button>}
                </div>
              </div>

              <div className="panel integration-provider-card p-0 overflow-hidden border-border bg-card shadow-md" data-testid="whitebit-api-integration-card">
                <div className="integration-provider-header p-5 border-b border-border/50 bg-muted/20 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="integration-provider-mark w-12 h-12 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm shrink-0">
                      <Network className="text-primary" size={24} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base flex items-center gap-2">
                        WhiteBIT
                        {whitebitStatus?.enabled && <BadgeCheck size={14} className="text-primary shrink-0" />}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono mt-1 uppercase tracking-wider">Swap automated crypto deposit addresses only</p>
                    </div>
                  </div>
                  <StatusPill status={whitebitStatus?.enabled ? 'verified' : whitebitCredentials?.configured ? 'verification required' : 'not configured'} />
                </div>

                {whitebitStatusQuery.isLoading || whitebitCredentialsQuery.isLoading ? (
                  <div className="p-5"><LoadingBlock rows={3} /></div>
                ) : whitebitStatusQuery.isError || whitebitCredentialsQuery.isError ? (
                  <div className="p-5"><ErrorState message="Could not load WhiteBIT integration status." retry={refreshWhitebit} /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/50">
                      <div className="integration-provider-fact bg-card p-5">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">Auth source</div>
                        <div className="text-xs font-mono">{whitebitCredentials?.credentialSource === 'stored' ? 'Encrypted DB' : whitebitCredentials?.credentialSource === 'environment' ? 'Environment secrets' : 'Unconfigured'}</div>
                      </div>
                      <div className="integration-provider-fact bg-card p-5">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">API key</div>
                        <div className={cn("integration-status-value text-xs font-mono flex items-center gap-1", whitebitCredentials?.configured ? "tone-success" : "tone-error")}>
                          {whitebitCredentials?.configured ? <><Check size={12}/> Present</> : <><X size={12}/> Missing</>}
                        </div>
                      </div>
                      <div className="integration-provider-fact bg-card p-5">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">Secret key</div>
                        <div className={cn("integration-status-value text-xs font-mono flex items-center gap-1", whitebitCredentials?.configured ? "tone-success" : "tone-error")}>
                          {whitebitCredentials?.configured ? <><Check size={12}/> Present</> : <><X size={12}/> Missing</>}
                        </div>
                      </div>
                      <div className="integration-provider-fact bg-card p-5">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">API status</div>
                        <div className={cn("integration-status-value text-xs font-mono flex items-center gap-1", whitebitStatus?.enabled ? "tone-success" : "tone-warning")}>
                          {whitebitStatus?.enabled ? <><Check size={12}/> On</> : <><Pause size={12}/> Off</>}
                        </div>
                      </div>
                    </div>
                    <div className="integration-provider-health p-5 border-t border-border/50 bg-muted/10">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                        <div className="integration-health-item flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Capability catalog</span>
                          <span className="integration-health-value tone-info font-mono text-xs">{whitebitStatus?.matchedRouteCount ?? 0} matching Admin routes</span>
                        </div>
                        <div className="integration-health-item flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Address creation permission</span>
                          <span className={cn("integration-health-value font-mono text-xs", whitebitStatus?.enabled ? "tone-success" : "tone-warning")}>
                            {whitebitStatus?.enabled ? 'Verified' : 'Required before enabling'}
                          </span>
                        </div>
                      </div>
                      {whitebitStatus?.error && <div className="mt-4 p-3 bg-card border border-border/50 rounded-xl font-mono text-xs break-words">{whitebitStatus.error}</div>}
                    </div>
                    <div className="bg-card p-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/50">
                      <div className="text-xs text-muted-foreground">Convert remains Quickex-only. WhiteBIT is used only for eligible Swap deposit addresses.</div>
                      <div className="flex flex-wrap gap-2">
                        {canTestCredentials && <button type="button" onClick={handleWhitebitTest} disabled={testWhitebit.isPending || !whitebitCredentials?.configured} className="button button-secondary h-9 px-4 text-xs font-bold uppercase tracking-wider">
                          {testWhitebit.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : <Activity size={14} className="mr-2" />} Test
                        </button>}
                        {(canConfigureCredentials || canCreateCredentials) && <button type="button" onClick={() => setWhitebitConfigurationOpen(true)} className="button button-secondary h-9 px-4 text-xs font-bold uppercase tracking-wider">
                          <Key size={14} className="mr-2" /> Configure
                        </button>}
                        {canConfigureCredentials && <button type="button" onClick={handleWhitebitToggle} disabled={toggleWhitebit.isPending || !whitebitCredentials?.configured} className="button button-primary h-9 px-4 text-xs font-bold uppercase tracking-wider" data-testid="button-toggle-whitebit-integration">
                          {toggleWhitebit.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : <Power size={14} className="mr-2" />} {whitebitStatus?.enabled ? 'Turn off' : 'Turn on'}
                        </button>}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {whitebitNotice && (
                <InlineNotice kind={whitebitNotice.kind} onDismiss={() => setWhitebitNotice(null)}>
                  {whitebitNotice.text}
                </InlineNotice>
              )}

              {testNotice && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <InlineNotice kind={testNotice.kind} onDismiss={() => setTestNotice(null)}>
                    {testNotice.text}
                  </InlineNotice>
                </div>
              )}
            </div>

            <div className="lg:col-span-1 min-w-0">
              <div className="panel integration-security-card p-0 overflow-hidden border-border bg-card shadow-md h-full flex flex-col">
                <div className="p-5 border-b border-border bg-muted/20">
                  <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck size={14} className="integration-section-icon text-primary" />
                    {t('adminProviders.access_amp_security')}</h3>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {t('adminProviders.quickex_uses_least_privilege_signing_credentials_for')}</p>
                </div>

                <div className="p-5 flex flex-1 flex-col gap-5">
                  <div className="integration-security-notice flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <strong className="block text-xs font-bold uppercase tracking-wider">{t('adminProviders.api_security')}</strong>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t('adminProviders.credentials_are_sensitive_keep_permissions_limited_to')}</p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div className={cn("integration-security-row flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/15 px-4 py-3", status.credentialSource === 'none' ? "tone-warning" : "tone-secure")}>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('adminProviders.credential_storage')}</span>
                      <span className="integration-security-value text-right font-mono text-xs">
                        {status.credentialSource === 'environment'
                          ? t('adminProviders.environment_secrets')
                          : status.credentialSource === 'stored'
                            ? t('adminProviders.encrypted_storage')
                            : t('adminProviders.not_configured')}
                      </span>
                    </div>
                    <div className="integration-security-row tone-permissions flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/15 px-4 py-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('adminProviders.permissions')}</span>
                      <span className="integration-security-value text-right font-mono text-xs">{status.signedOrders ? t('adminProviders.signed_orders') : t('adminProviders.public_market_data')}</span>
                    </div>
                    <div className={cn("integration-security-row flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/15 px-4 py-3", status.canManage ? "tone-management" : "tone-warning")}>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('adminProviders.management')}</span>
                      <span className="integration-security-value text-right font-mono text-xs">{status.canManage ? t('adminProviders.owner_enabled') : t('adminProviders.restricted')}</span>
                    </div>
                  </div>

                  <div className="mt-auto grid gap-2">
                     {(canConfigureCredentials || canCreateCredentials) && <button
                      type="button"
                      onClick={openConfiguration}
                      className="button button-primary integration-configure-button w-full h-10 text-xs font-bold uppercase tracking-wider"
                    >
                      <Key size={14} className="mr-2" />
                      {status.credentialSource === 'none' ? t('adminProviders.add_quickex') : t('adminProviders.configure_quickex')}
                   </button>}
                    <button
                      type="button"
                      onClick={scrollToLogs}
                      className="button button-secondary integration-view-logs-button w-full h-10 text-xs font-bold uppercase tracking-wider"
                    >
                      <Activity size={14} className="mr-2" />
                      {t('adminProviders.view_logs')}</button>
                  </div>
                </div>
              </div>
            </div>

             <Dialog open={configurationOpen && (canConfigureCredentials || canCreateCredentials)} onOpenChange={setConfigurationOpen}>
              <DialogContent className="max-w-2xl overflow-y-auto p-0">
                <DialogHeader className="border-b border-border bg-muted/20 px-6 py-5 pr-14">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                    <Key size={20} />
                  </div>
                  <DialogTitle>
                    {status.credentialSource === 'none' ? t('adminProviders.integrate_quickex') : t('adminProviders.update_quickex')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('adminProviders.configure_the_two_credentials_required_by_quickex')}</DialogDescription>
                </DialogHeader>

                <div className="grid gap-5 p-6">
                  <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t('adminProviders.credentials_remain_masked_are_never_returned_after')}</p>
                  </div>

                   {!isOwner || !(canConfigureCredentials || canCreateCredentials) ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 p-8 text-center">
                      <ShieldCheck size={28} className="mb-3 text-primary" />
                      <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">{t('adminProviders.restricted_access')}</h4>
                      <p className="text-xs text-muted-foreground">{t('adminProviders.owner_access_is_required_to_modify_encrypted')}</p>
                    </div>
                  ) : (
                    <form onSubmit={handleUpdate} className="admin-form grid gap-5">
                      <div className="admin-form-section rounded-2xl border border-border bg-muted/30 p-4 shadow-inner">
                        <label htmlFor="quickex-integration-pin" className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {t('adminProviders.operator_authorization')}</label>
                        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                          <input
                            id="quickex-integration-pin"
                            aria-label={t('adminProviders.pin_code')}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={8}
                            placeholder={t('adminProviders.4_8_digit_pin')}
                            value={pin}
                            onChange={(e) => {
                              setPin(e.target.value.replace(/\D/g, ''));
                              setPinConfirmed(false);
                            }}
                            className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-mono text-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            aria-describedby="quickex-pin-help"
                          />
                          <button
                            type="button"
                            aria-label={pinConfirmed ? t('adminProviders.confirmed') : t('adminProviders.continue')}
                            onClick={confirmPin}
                            disabled={pinConfirmed || !pinIsValid}
                            className="button button-secondary h-9 shrink-0 whitespace-nowrap px-4 text-xs font-bold uppercase tracking-wider"
                          >
                            {pinConfirmed ? t('adminProviders.confirmed') : t('adminProviders.unlock')}
                          </button>
                        </div>
                        <p id="quickex-pin-help" className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                          {t('adminProviders.ui_confirmation_only_pin_is_not_sent')}</p>
                      </div>

                      <div className={cn("admin-form-grid grid gap-4 transition-all duration-300 sm:grid-cols-2", !pinConfirmed ? "pointer-events-none opacity-40 blur-[1px]" : "opacity-100")}>
                        <div className="admin-form-field">
                          <label htmlFor="quickex-public-key" className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {t('adminProviders.public_api_key')}</label>
                          <input
                            id="quickex-public-key"
                            type="password"
                            autoComplete="new-password"
                            placeholder={t('adminProviders.enter_public_key')}
                            value={publicKey}
                            onChange={(e) => setPublicKey(e.target.value)}
                            disabled={!pinConfirmed}
                            required
                            className="h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="admin-form-field">
                          <label htmlFor="quickex-secret-key" className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {t('adminProviders.secret_api_key')}</label>
                          <input
                            id="quickex-secret-key"
                            type="password"
                            autoComplete="new-password"
                            placeholder={t('adminProviders.enter_secret_key')}
                            value={secretKey}
                            onChange={(e) => setSecretKey(e.target.value)}
                            disabled={!pinConfirmed}
                            required
                            className="h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        aria-label={status.credentialSource === 'none' ? t('adminProviders.integrate_quickex') : t('adminProviders.update_quickex')}
                        disabled={updateProvider.isPending || !pinConfirmed || !publicKey.trim() || !secretKey.trim()}
                        className="button button-primary h-10 w-full text-xs font-bold uppercase tracking-wider"
                      >
                        {updateProvider.isPending ? (
                          <><Loader2 size={14} className="animate-spin mr-2" /> {t('adminProviders.validating')}</>
                        ) : status.credentialSource === 'none' ? (
                          t('adminProviders.integrate_quickex')
                        ) : (
                          t('adminProviders.save_activate_credentials')
                        )}
                      </button>
                    </form>
                  )}

                  {updateNotice && (
                    <InlineNotice kind={updateNotice.kind} onDismiss={() => setUpdateNotice(null)}>
                      {updateNotice.text}
                    </InlineNotice>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={whitebitConfigurationOpen && (canConfigureCredentials || canCreateCredentials)} onOpenChange={setWhitebitConfigurationOpen}>
              <DialogContent className="max-w-xl overflow-y-auto p-0">
                <DialogHeader className="border-b border-border bg-muted/20 px-6 py-5 pr-14">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Key size={20} /></div>
                  <DialogTitle>{whitebitCredentials?.configured ? 'Update WhiteBIT credentials' : 'Connect WhiteBIT'}</DialogTitle>
                  <DialogDescription>Credentials are validated with a signed request, encrypted at rest, and never returned to the browser.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleWhitebitUpdate} className="admin-form grid gap-5 p-6">
                  <div>
                    <label htmlFor="whitebit-api-key" className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">API key</label>
                    <input id="whitebit-api-key" type="password" autoComplete="off" value={whitebitApiKey} onChange={(event) => setWhitebitApiKey(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label htmlFor="whitebit-secret-key" className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Secret key</label>
                    <input id="whitebit-secret-key" type="password" autoComplete="new-password" value={whitebitSecretKey} onChange={(event) => setWhitebitSecretKey(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-muted-foreground">
                    Saving credentials does not turn WhiteBIT on. Enabling requires a successful signed address-creation permission check.
                  </div>
                  <button type="submit" disabled={updateWhitebit.isPending || whitebitApiKey.trim().length < 8 || whitebitSecretKey.trim().length < 8} className="button button-primary h-10 w-full text-xs font-bold uppercase tracking-wider">
                    {updateWhitebit.isPending ? <><Loader2 size={14} className="animate-spin mr-2" /> Validating</> : 'Validate and save securely'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>

            <div id="api-activity-section" className="lg:col-span-3 mt-2 min-w-0">
              <div className="panel integration-activity-card p-0 overflow-hidden border-border bg-card shadow-md">
                <div className="p-4 border-b border-border bg-muted/20">
                  <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                    <Database size={14} className="integration-section-icon text-primary" />
                    {t('adminProviders.recent_api_activity')}</h3>
                </div>
                <div className="integration-activity-empty p-16 flex flex-col items-center justify-center text-center">
                  <div className="integration-activity-empty-icon w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-5 border border-border/50">
                    <Activity size={24} className="text-muted-foreground opacity-60" />
                  </div>
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">{t('adminProviders.no_recent_api_activity')}</h4>
                  <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                    {t('adminProviders.detailed_api_telemetry_and_payload_logs_are')}</p>
                </div>
              </div>
            </div>

          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
function StaffPage() {
  const { t, formatDate } = useI18n();
  const queryClient = useQueryClient();
  const operators = useGetOperators({ query: { queryKey: getGetOperatorsQueryKey() } });
  const auditLogs = useGetOperatorAuditLogs({ query: { queryKey: getGetOperatorAuditLogsQueryKey() } });

  const inviteMutation = useCreateOperatorInvitation();
  const approveMutation = useApproveOperator();
  const suspendMutation = useSuspendOperator();
  const removeMutation = useRemoveOperator();

  const [inviteEmail, setInviteEmail] = useState('');
  const [notice, setNotice] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<Set<string>>(() => new Set());
  const [viewingOperatorId, setViewingOperatorId] = useState<string | null>(null);
  const [showAllAudit, setShowAllAudit] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const invalidateStaff = () => {
    queryClient.invalidateQueries({ queryKey: getGetOperatorsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOperatorAuditLogsQueryKey() });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setNotice(null);
    inviteMutation.mutate({ data: { email } }, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: `Invitation created for ${email}. Approve access when they are ready to join.` });
        setInviteEmail('');
        invalidateStaff();
      },
      onError: (err) => setNotice({ kind: 'error', text: apiErrorText(err, t('adminStaff.failed_to_send_invitation')) })
    });
  };

  const handleApprove = (id: string) => {
    setNotice(null);
    approveMutation.mutate({ id }, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: t('adminStaff.operator_access_reactivated') });
        invalidateStaff();
      },
      onError: (err) => setNotice({ kind: 'error', text: apiErrorText(err, t('adminStaff.failed_to_reactivate_operator')) })
    });
  };

  const handleSuspend = (id: string) => {
    setNotice(null);
    suspendMutation.mutate({ id }, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: t('adminStaff.operator_access_suspended') });
        invalidateStaff();
      },
      onError: (err) => setNotice({ kind: 'error', text: apiErrorText(err, t('adminStaff.failed_to_suspend_operator')) })
    });
  };

  const handleRemove = (id: string) => {
    setNotice(null);
    removeMutation.mutate({ id }, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: t('adminStaff.operator_removed_permanently') });
        invalidateStaff();
      },
      onError: (err) => setNotice({ kind: 'error', text: apiErrorText(err, t('adminStaff.failed_to_remove_operator')) })
    });
  };

  if (operators.isLoading) {
    return <AdminShell eyebrow={t('adminStaff.operations_security')} title={t('adminStaff.staff_management')} requiredPermission="team.members.view"><LoadingBlock rows={5} /></AdminShell>;
  }

  if (operators.isError) {
    const errText = apiErrorText(operators.error, '');
    const is403 = errText.toLowerCase().includes('forbidden') || errText.toLowerCase().includes('owner') || (operators.error instanceof Error && operators.error.message.includes('403'));

    if (is403) {
      return (
        <AdminShell eyebrow={t('adminStaff.operations_security')} title={t('adminStaff.restricted_access')} requiredPermission="team.members.view">
          <div className="empty-state rise-in">
            <ShieldCheck size={26} className="text-primary mb-3 mx-auto" />
            <strong className="text-lg">{t('adminStaff.owner_access_required')}</strong>
            <p className="mt-2 max-w-md mx-auto">{t('adminStaff.staff_management_is_restricted_to_the_desk')}</p>
          </div>
        </AdminShell>
      );
    }
    return (
      <AdminShell eyebrow={t('adminStaff.operations_security')} title={t('adminStaff.staff_management')} requiredPermission="team.members.view">
        <ErrorState message={t('adminStaff.load_staff_data_error')} retry={() => operators.refetch()} />
      </AdminShell>
    );
  }

  const isPending = inviteMutation.isPending || approveMutation.isPending || suspendMutation.isPending || removeMutation.isPending;

  const allOperators = Array.from(
    new Map((operators.data ?? []).map(operator => [operator.id, operator])).values(),
  );
  const totalCount = allOperators.length;
  const activeCount = allOperators.filter(o => o.status === 'active').length;
  const suspendedCount = allOperators.filter(o => o.status === 'suspended').length;
  const ownersCount = allOperators.filter(o => o.role === 'owner').length;
  const activePct = totalCount ? (activeCount / totalCount * 100).toFixed(1) : '0.0';
  const suspendedPct = totalCount ? (suspendedCount / totalCount * 100).toFixed(1) : '0.0';
  const ownersPct = totalCount ? (ownersCount / totalCount * 100).toFixed(1) : '0.0';

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = allOperators.filter(op => {
    if (normalizedSearch && !op.email.toLowerCase().includes(normalizedSearch) && !op.id.toLowerCase().includes(normalizedSearch)) return false;
    if (roleFilter !== 'all' && op.role !== roleFilter) return false;
    if (statusFilter !== 'all' && op.status !== statusFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageOperatorIds = paginated.map(operator => operator.id);
  const allPageOperatorsSelected = pageOperatorIds.length > 0 && pageOperatorIds.every(id => selectedOperatorIds.has(id));
  const visiblePages = (() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const pages = new Set([1, totalPages, safePage - 1, safePage, safePage + 1]);
    const sorted = Array.from(pages).filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
    const result: Array<number | string> = [];
    sorted.forEach((value, index) => {
      if (index > 0 && value - sorted[index - 1] > 1) result.push(`ellipsis-${value}`);
      result.push(value);
    });
    return result;
  })();
  const viewingOperator = allOperators.find(operator => operator.id === viewingOperatorId);
  const visibleAuditLogs = showAllAudit ? (auditLogs.data ?? []) : (auditLogs.data ?? []).slice(0, 5);

  const toggleOperatorSelection = (id: string) => {
    setSelectedOperatorIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCurrentPageSelection = () => {
    setSelectedOperatorIds(current => {
      const next = new Set(current);
      pageOperatorIds.forEach(id => {
        if (allPageOperatorsSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const getAuditStyle = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes('fail') || a.includes('error')) return { kind: 'error', icon: CircleAlert, badge: 'ERROR' };
    if (a.includes('suspend') || a.includes('remove') || a.includes('delete')) return { kind: 'warning', icon: Ban, badge: 'WARNING' };
    if (a.includes('approve') || a.includes('success') || a.includes('reactivate') || a.includes('verify') || a.includes('verified')) return { kind: 'success', icon: ShieldCheck, badge: 'SUCCESS' };
    return { kind: 'info', icon: Info, badge: 'INFO' };
  };

  return (
    <AdminShell eyebrow={t('adminStaff.operations_security')} title={t('adminStaff.staff_management')} requiredPermission="team.members.view">
      <div className="staff-redesign">
        <div className="rise-in flex flex-col gap-4 md:gap-6">
          <p className="text-sm text-muted-foreground -mt-4 hidden md:block">{t('adminStaff.manage_your_operators_owners_and_access_permissions')}</p>

          {notice && (
            <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>
              {notice.text}
            </InlineNotice>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 staff-top-metrics">
            <div className="staff-metric-card col-span-1 !p-3 md:!p-4">
              <div className="staff-metric-content">
                <div className="staff-metric-info min-w-0">
                  <span className="staff-metric-label truncate text-[10px] md:text-[11px]">{t('adminStaff.total_staff')}</span>
                  <span className="staff-metric-value text-lg md:text-2xl">{totalCount}</span>
                </div>
                <div className="staff-metric-icon bg-primary/10 text-primary w-6 h-6 md:w-8 md:h-8">
                  <UserRound size={14} className="md:w-5 md:h-5" />
                </div>
              </div>
              <div className="staff-metric-stat neutral text-[9px] md:text-[11px]">
                <CheckCircle size={10} className="md:w-3 md:h-3" />
                <span className="truncate">{t('adminStaff.up_to_date')}</span>
              </div>
            </div>

            <div className="staff-metric-card col-span-1 !p-3 md:!p-4">
              <div className="staff-metric-content">
                <div className="staff-metric-info min-w-0">
                  <span className="staff-metric-label truncate text-[10px] md:text-[11px]">{t('adminStaff.active')}</span>
                  <span className="staff-metric-value text-lg md:text-2xl">{activeCount}</span>
                </div>
                <div className="staff-metric-icon bg-emerald-500/10 text-emerald-500 w-6 h-6 md:w-8 md:h-8">
                  <UserCheck size={14} className="md:w-5 md:h-5" />
                </div>
              </div>
              <div className="staff-metric-stat positive text-[9px] md:text-[11px]">
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-500 mr-1"></span>
                <span className="truncate">{activePct}%</span>
              </div>
            </div>

            <div className="staff-metric-card col-span-1 !p-3 md:!p-4">
              <div className="staff-metric-content">
                <div className="staff-metric-info min-w-0">
                  <span className="staff-metric-label truncate text-[10px] md:text-[11px]">{t('adminStaff.suspended')}</span>
                  <span className="staff-metric-value text-lg md:text-2xl">{suspendedCount}</span>
                </div>
                <div className="staff-metric-icon bg-red-500/10 text-red-500 w-6 h-6 md:w-8 md:h-8">
                  <Ban size={14} className="md:w-5 md:h-5" />
                </div>
              </div>
              <div className="staff-metric-stat danger text-[9px] md:text-[11px]">
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-red-500 mr-1"></span>
                <span className="truncate">{suspendedPct}%</span>
              </div>
            </div>

            <div className="staff-metric-card col-span-1 !p-3 md:!p-4">
              <div className="staff-metric-content">
                <div className="staff-metric-info min-w-0">
                  <span className="staff-metric-label truncate text-[10px] md:text-[11px]">{t('adminStaff.owners')}</span>
                  <span className="staff-metric-value text-lg md:text-2xl">{ownersCount}</span>
                </div>
                <div className="staff-metric-icon bg-amber-500/10 text-amber-500 w-6 h-6 md:w-8 md:h-8">
                  <Crown size={14} className="md:w-5 md:h-5" />
                </div>
              </div>
              <div className="staff-metric-stat warning text-[9px] md:text-[11px]">
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-amber-500 mr-1"></span>
                <span className="truncate">{ownersPct}%</span>
              </div>
            </div>

            <button
              type="button"
              className="col-span-2 lg:col-span-1 flex h-[50px] lg:h-auto lg:min-h-[100px] items-center justify-center gap-2 rounded-xl text-white font-bold text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
              style={{ background: 'var(--qx-gradient)' }}
              onClick={() => emailInputRef.current?.focus()}
            >
              <Zap size={18} /> {t('adminStaff.invite_operator')}</button>
          </div>

          <div className="staff-table-card">
            <div className="staff-table-header flex-col lg:flex-row items-stretch lg:items-center gap-3 p-4 md:p-5">
              <div className="min-w-0">
                <h3 className="text-sm md:text-base font-bold flex items-center gap-2"><Users size={16} className="text-primary shrink-0 md:w-[18px] md:h-[18px]" /> <span className="truncate">{t('adminStaff.staff_members')}</span></h3>
                <p className="text-[11px] md:text-xs leading-snug text-muted-foreground mt-0.5 md:mt-1">{t('adminStaff.view_and_manage_all_operators_owners_and')}</p>
              </div>
              <div className="staff-table-controls flex flex-col md:flex-row items-stretch md:items-center gap-2 w-full lg:w-auto">
                <div className="w-full md:w-auto shrink-0 min-w-[200px]">
                  <AdminSearch
                    value={search}
                    onChange={v => { setSearch(v); setPage(1); }}
                    placeholder={t('adminStaff.search_operator_email_or_id')}
                    testId="input-operator-search"
                  />
                </div>

                <div className="staff-filter-row flex items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:flex-none">
                    <select className="staff-select w-full md:w-auto" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}>
                      <option value="all">{t('adminStaff.all_roles')}</option>
                      <option value="owner">{t('adminStaff.owner')}</option>
                      <option value="operator">{t('adminStaff.operator')}</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>

                  <div className="relative flex-1 md:flex-none">
                    <select className="staff-select w-full md:w-auto" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                      <option value="all">{t('adminStaff.all_statuses')}</option>
                      <option value="active">{t('adminStaff.active')}</option>
                      <option value="suspended">{t('adminStaff.suspended')}</option>
                      <option value="invited">{t('adminStaff.invited')}</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>

                  <button
                    type="button"
                    className="w-[34px] h-[34px] shrink-0 border border-[hsl(var(--staff-card-border))] rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    onClick={() => invalidateStaff()}
                    title={t('adminStaff.refresh')}
                    aria-label={t('adminStaff.refresh_staff_data')}
                  >
                    <RefreshCw size={14} className={operators.isFetching ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>
            </div>

          <div className="w-full relative group">
            <div className="swipeable-scroll-hint" aria-hidden="true" />
            <div className="overflow-x-auto w-full" onScroll={(e) => {
              const target = e.target as HTMLElement;
              const hint = target.previousElementSibling as HTMLElement;
              if (hint) {
                hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
                hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
              }
            }}>
              <table className="w-full text-left staff-table">
              <thead>
                <tr>
                  <th className="w-10 text-center">
                    <input
                      type="checkbox"
                      className="staff-row-checkbox"
                      checked={allPageOperatorsSelected}
                      onChange={toggleCurrentPageSelection}
                      aria-label={t('adminStaff.select_all_operators_on_this_page')}
                    />
                  </th>
                  <th>{t('adminStaff.operator')}</th>
                  <th>{t('adminStaff.role')}</th>
                  <th>{t('adminStaff.status')}</th>
                  <th>{t('adminStaff.added_date')}</th>
                  <th>{t('adminStaff.last_activity')}</th>
                  <th className="text-right">{t('adminStaff.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(op => (
                  <tr key={op.id}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="staff-row-checkbox"
                        checked={selectedOperatorIds.has(op.id)}
                        onChange={() => toggleOperatorSelection(op.id)}
                        aria-label={t('adminStaff.select_operator_named', { email: op.email })}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="staff-avatar">{op.email.slice(0, 2).toUpperCase()}</div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{op.email}</div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{t('adminStaff.id')}{op.id.split('_').pop() || op.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`staff-role-badge ${op.role}`}>
                        {op.role === 'owner' ? <Crown size={12} /> : <UserRound size={12} />}
                        {op.role.charAt(0).toUpperCase() + op.role.slice(1)}
                      </span>
                    </td>
                    <td>
                      <span className={`staff-status-badge ${op.status}`}>
                        <span className="staff-status-dot bg-current"></span>
                        {op.status.charAt(0).toUpperCase() + op.status.slice(1)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(op.createdAt)}</td>
                    <td className="whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn('w-1.5 h-1.5 rounded-full', op.status === 'active' ? 'bg-emerald-500' : op.status === 'suspended' ? 'bg-red-500' : 'bg-slate-400')}></span>
                        {ago(op.updatedAt)}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="staff-action-btn"
                        title={t('adminStaff.view_operator')}
                        aria-label={t('adminStaff.view_operator_named', { email: op.email })}
                        onClick={() => setViewingOperatorId(op.id)}
                      >
                        <Eye size={13} />
                      </button>
                      {op.role !== 'owner' && op.status !== 'removed' && (
                        <>
                          {(op.status === 'suspended' || op.status === 'invited') ? (
                            <button type="button" className="staff-action-btn success" title={op.status === 'invited' ? t('adminStaff.approve_invitation') : t('adminStaff.reactivate_operator')} aria-label={op.status === 'invited' ? t('adminStaff.approve_operator_named', { email: op.email }) : t('adminStaff.reactivate_operator_named', { email: op.email })} onClick={() => handleApprove(op.id)} disabled={isPending}>
                              <Check size={13} />
                            </button>
                          ) : (
                            <button type="button" className="staff-action-btn warning" title={t('adminStaff.suspend_operator')} aria-label={t('adminStaff.suspend_operator_named', { email: op.email })} onClick={() => handleSuspend(op.id)} disabled={isPending}>
                              <Pause size={13} />
                            </button>
                          )}
                          <button type="button" className="staff-action-btn danger" title={t('adminStaff.remove_operator')} aria-label={t('adminStaff.remove_operator_named', { email: op.email })} onClick={() => { if (confirm(t('adminStaff.confirm_remove_operator_named', { email: op.email }))) handleRemove(op.id); }} disabled={isPending}>
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">{t('adminStaff.no_operators_match_your_filters')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>

          <div className="staff-pagination">
              <span className="text-xs text-muted-foreground">
                {filtered.length === 0
                  ? t('adminStaff.no_operators_to_show')
                  : `Showing ${(safePage - 1) * pageSize + 1} to ${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length} operators`}
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="staff-page-btn"
                    disabled={safePage === 1}
                    onClick={() => setPage(safePage - 1)}
                    aria-label={t('adminStaff.previous_page')}
                  >
                    <ChevronDown size={14} className="rotate-90" />
                  </button>
                  {visiblePages.map(item => typeof item === 'number' ? (
                    <button
                      type="button"
                      key={item}
                      className={`staff-page-btn ${safePage === item ? 'active' : ''}`}
                      onClick={() => setPage(item)}
                      aria-label={t('adminStaff.page_number', { page: item })}
                      aria-current={safePage === item ? 'page' : undefined}
                    >
                       {item}
                    </button>
                  ) : (
                    <span key={item} className="staff-page-ellipsis" aria-hidden="true">…</span>
                  ))}
                  <button
                    type="button"
                    className="staff-page-btn"
                    disabled={safePage === totalPages}
                    onClick={() => setPage(safePage + 1)}
                    aria-label={t('adminStaff.next_page')}
                  >
                    <ChevronDown size={14} className="-rotate-90" />
                  </button>
                </div>
                <div className="relative border-l border-[hsl(var(--staff-card-border))] pl-4">
                  <select
                    className="staff-select !pl-3 !pr-8 h-8 text-xs"
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    aria-label={t('adminStaff.operators_per_page')}
                  >
                    <option value={10}>{t('adminStaff.10_per_page')}</option>
                    <option value={25}>{t('adminStaff.25_per_page')}</option>
                    <option value={50}>{t('adminStaff.50_per_page')}</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start mt-2 pb-12">

            <div className="staff-audit-log h-[460px]">
              <div className="staff-audit-header">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center"><Zap size={16} /></div>
                    {t('adminStaff.invite_operator')}</h3>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">{t('adminStaff.send_an_invitation_to_a_new_operator')}</p>
                </div>
              </div>

              <form onSubmit={handleInvite} className="admin-form p-6 flex flex-col gap-6 flex-1">
                <div className="admin-form-field">
                  <label className="text-xs font-bold mb-2 block" htmlFor="invite-email">{t('adminStaff.email_address')}</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="invite-email"
                      type="email"
                      ref={emailInputRef}
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder={t('adminStaff.operator_example_com')}
                      required
                      className="w-full bg-background border border-[hsl(var(--staff-card-border))] rounded-lg h-10 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>

                <div className="admin-form-grid grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="admin-form-field">
                    <label className="text-xs font-bold mb-2 block">{t('adminStaff.role')}</label>
                    <div className="relative">
                      <select
                        className="w-full bg-background border border-[hsl(var(--staff-card-border))] rounded-lg h-10 pl-10 pr-8 text-sm appearance-none focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        value="operator"
                        disabled
                        aria-describedby="invite-role-help"
                      >
                        <option value="operator">{t('adminStaff.operator')}</option>
                      </select>
                      <UserRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                    <small id="invite-role-help" className="staff-field-help">{t('adminStaff.invitations_create_operator_access')}</small>
                  </div>
                  <div className="admin-form-field">
                    <label className="text-xs font-bold mb-2 block" htmlFor="invite-message">{t('adminStaff.optional_message')}</label>
                    <div className="relative">
                      <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="invite-message"
                        type="text"
                        value=""
                        placeholder={t('adminStaff.not_supported_by_invitation_service')}
                        disabled
                        aria-describedby="invite-message-help"
                        className="w-full bg-background border border-[hsl(var(--staff-card-border))] rounded-lg h-10 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <small id="invite-message-help" className="staff-field-help">{t('adminStaff.no_message_will_be_sent')}</small>
                  </div>
                </div>
                <div className="mt-auto pt-4">
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending || !inviteEmail}
                    className="w-full h-12 rounded-xl text-foreground font-bold text-sm transition-transform hover:scale-[1.01] active:scale-[0.99] shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                    style={{ background: 'var(--qx-gradient)' }}
                  >
                    {inviteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                    {t('adminStaff.create_invitation')}</button>
                </div>
              </form>
            </div>

            <div className="staff-audit-log h-[460px]">
              <div className="staff-audit-header">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Activity size={18} className="text-primary" /> {t('adminStaff.audit_log')}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{t('adminStaff.track_all_staff_related_activities')}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary font-bold hover:underline disabled:opacity-50 disabled:no-underline"
                  onClick={() => setShowAllAudit(current => !current)}
                  disabled={(auditLogs.data?.length ?? 0) <= 5}
                >
                  {showAllAudit ? t('adminStaff.show_recent') : t('adminStaff.view_all')}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {auditLogs.isLoading && <div className="p-6"><LoadingBlock rows={4} /></div>}
                {auditLogs.isError && <div className="p-6"><ErrorState message={t('adminStaff.load_audit_trail_error')} retry={() => auditLogs.refetch()} /></div>}
                {visibleAuditLogs.map(log => {
                  const style = getAuditStyle(log.action);
                  const Icon = style.icon;
                  return (
                    <div key={log.id} className={`staff-audit-item ${style.kind}`}>
                      <div className="staff-audit-icon"><Icon size={16} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{humanKey(log.action.replace(/^staff\./, ''))}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {log.targetEmail ? `Access event for ${log.targetEmail}` : t('adminStaff.staff_authorization_event_recorded')}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{ago(log.createdAt)}</span>
                        <span className="staff-audit-badge">{style.badge}</span>
                      </div>
                    </div>
                  );
                })}
                {auditLogs.data?.length === 0 && (
                  <div className="p-12 text-center text-muted-foreground text-sm">{t('adminStaff.no_audit_logs_found')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
        {viewingOperator && (
          <div className="staff-detail-backdrop" role="presentation" onMouseDown={() => setViewingOperatorId(null)}>
            <section className="staff-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-detail-title" onMouseDown={event => event.stopPropagation()}>
              <header>
                <div className="staff-avatar staff-avatar-lg">{viewingOperator.email.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0">
                  <span className="section-kicker">{t('adminStaff.operator_record')}</span>
                  <h2 id="staff-detail-title" className="truncate">{viewingOperator.email}</h2>
                </div>
                <button type="button" className="staff-action-btn ml-auto" onClick={() => setViewingOperatorId(null)} aria-label={t('adminStaff.close_operator_details')}>
                  <X size={15} />
                </button>
              </header>
              <dl className="staff-detail-list">
                <div><dt>{t('adminStaff.operator_id')}</dt><dd title={viewingOperator.id}>{viewingOperator.id}</dd></div>
                <div><dt>{t('adminStaff.role')}</dt><dd><span className={`staff-role-badge ${viewingOperator.role}`}>{viewingOperator.role}</span></dd></div>
                <div><dt>{t('adminStaff.status')}</dt><dd><span className={`staff-status-badge ${viewingOperator.status}`}>{viewingOperator.status}</span></dd></div>
                <div><dt>{t('adminStaff.account_link')}</dt><dd>{viewingOperator.linkedToClerk ? t('adminStaff.linked') : t('adminStaff.pending')}</dd></div>
                <div><dt>{t('adminStaff.added')}</dt><dd>{exactDateTime(viewingOperator.createdAt)}</dd></div>
                <div><dt>{t('adminStaff.last_recorded_activity')}</dt><dd>{exactDateTime(viewingOperator.updatedAt)}</dd></div>
              </dl>
            </section>
          </div>
        )}
      </div>
    </AdminShell>
  );
}


type DatePreset = '1d' | '7d' | '30d' | '90d' | 'custom';

function getUtcBounds(preset: DatePreset, customFrom?: string, customTo?: string) {
  const now = new Date();
  let from = new Date();
  let to = new Date();

  if (preset === '1d') {
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
  } else if (preset === '7d') {
    from.setUTCDate(now.getUTCDate() - 6);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
  } else if (preset === '30d') {
    from.setUTCDate(now.getUTCDate() - 29);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
  } else if (preset === '90d') {
    from.setUTCDate(now.getUTCDate() - 89);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
  } else if (preset === 'custom' && customFrom && customTo) {
    from = new Date(`${customFrom}T00:00:00.000Z`);
    to = new Date(`${customTo}T23:59:59.999Z`);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

function MetricCard({
  label, value, detail, icon: Icon, accent = false, notice, highlight = false, tone = 'blue'
}: {
  label: string; value: React.ReactNode; detail: React.ReactNode; icon: React.ElementType; accent?: boolean; notice?: React.ReactNode; highlight?: boolean; tone?: 'blue' | 'cyan' | 'green' | 'purple' | 'amber' | 'danger'
}) {
  return (
    <div className={cn('metric-card overview-kpi-card flex flex-col h-full', `tone-${tone}`, accent && 'metric-accent', highlight && 'is-highlighted')} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="metric-head flex items-center gap-3">
        <div className="metric-icon-wrap"><Icon size={18} /></div>
        <span className="font-bold text-[11px] tracking-wider uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3">
        <strong className={cn("text-2xl block font-extrabold", highlight && 'text-primary')}>{value}</strong>
      </div>
      <div className="mt-1">
        <small className="text-muted-foreground font-medium">{detail}</small>
      </div>
      {notice && <div className="mt-auto pt-3 border-t border-border mt-3">{notice}</div>}
    </div>
  );
}

function RankingPanel({ title, items, itemKey, labelKey, valueKey, formatValue }: { title: string; items: any[]; itemKey: string; labelKey: string; valueKey: string; formatValue?: (v: any) => string }) {
  const { t } = useI18n();
  const maxVal = Math.max(...items.map(i => i[valueKey] || 0));

  return (
    <div className="panel p-5 h-full">
      <div className="panel-heading mb-4">
        <div><span className="section-kicker">{t('adminCore.ranking')}</span><h2>{title}</h2></div>
        {items.length > 0 && <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{t('adminCore.view_all')}<ChevronDown size={12} className="inline" /></span>}
      </div>
      <div className="flex flex-col gap-1">
        {items.length === 0 && <div className="text-muted-foreground text-sm py-4">{t('adminCore.no_data_available')}</div>}
        {items.map((item, index) => {
          const val = item[valueKey];
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          const pairSplit = item[labelKey] ? item[labelKey].toString().split(/[-/]/) : [];
          const isPair = pairSplit.length === 2;

          return (
            <div key={item[itemKey]} className="flex items-center justify-between p-3 hover:bg-muted/30 rounded-lg transition-colors">
              <div className="flex items-center gap-4 w-[160px]">
                <span className="text-muted-foreground text-xs font-mono w-4">{index + 1}.</span>
                {isPair ? (
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      <AdminCurrencyLogo code={pairSplit[0]} />
                      <AdminCurrencyLogo code={pairSplit[1]} />
                    </div>
                    <span className="font-semibold text-sm">{pairSplit[0]}/{pairSplit[1]}</span>
                  </div>
                ) : (
                  <span className="admin-ranking-currency">
                    <AdminCurrencyLogo code={String(item[labelKey] || '')} />
                    <span className="font-semibold text-sm">{item[labelKey]}</span>
                  </span>
                )}
              </div>
              <div className="flex-1 px-4 flex items-center gap-4">
                <span className="text-sm text-muted-foreground min-w-[80px] text-right">{formatValue ? formatValue(val) : val}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%`, background: 'var(--qx-gradient)' }} />
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-mono w-12 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function overviewHealthTime(
  value: string | null | undefined,
  formatDate: ReturnType<typeof useI18n>['formatDate'],
) {
  if (!value) return null;
  return formatDate(value, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function quickexReconciliationWarning(reconciliation: {
  state: 'healthy' | 'stale' | 'cooling_down' | 'degraded';
  consecutiveFailures: number;
  lastSucceededAt: string | null;
  nextRetryAt: string | null;
} | undefined, formatDate: ReturnType<typeof useI18n>['formatDate']) {
  if (!reconciliation || reconciliation.state === 'healthy') return null;
  if (reconciliation.state === 'stale') {
    const success = reconciliation.lastSucceededAt
      ? ` Last successful reconciliation was ${overviewHealthTime(reconciliation.lastSucceededAt, formatDate)}.`
      : ' No successful reconciliation has been recorded.';
    return `Quickex status reconciliation is not fresh. Convert status updates and affiliate completion or reversal credits may be delayed.${success}`;
  }
  const attempts = `${reconciliation.consecutiveFailures} consecutive ${reconciliation.consecutiveFailures === 1 ? 'failure' : 'failures'}`;
  const retry = reconciliation.nextRetryAt
    ? ` Automatic retry is scheduled for ${overviewHealthTime(reconciliation.nextRetryAt, formatDate)}.`
    : ' Automatic retry is due.';
  const success = reconciliation.lastSucceededAt
    ? ` Last successful reconciliation was ${overviewHealthTime(reconciliation.lastSucceededAt, formatDate)}.`
    : ' No successful reconciliation has been recorded.';
  return `Quickex status reconciliation is delayed after ${attempts}. Convert status updates and affiliate completion or reversal credits may be delayed.${retry}${success}`;
}

function AdminOverview() {
  const { t, formatDate } = useI18n();
  const { isOwner } = useAdminPermissions();
  const [apiBuildInfo, setApiBuildInfo] = useState<AppBuildInfo | null>(null);
  const [buildInfoError, setBuildInfoError] = useState(false);
  const [configSnapshot, setConfigSnapshot] = useState<unknown>(null);
  const [configSnapshotName, setConfigSnapshotName] = useState('');
  const [configSyncPreview, setConfigSyncPreview] = useState<WorkspaceConfigSyncResponse | null>(null);
  const [configSyncError, setConfigSyncError] = useState('');
  const [configSyncPending, setConfigSyncPending] = useState(false);
  const [configSyncApplied, setConfigSyncApplied] = useState(false);
  const [product, setProduct] = useState<'swap' | 'convert'>('swap');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');

  const todayStr = useMemo(() => dateInputValue(new Date()), []);
  const [customFrom, setCustomFrom] = useState(dateInputValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)));
  const [customTo, setCustomTo] = useState(todayStr);

  useEffect(() => {
    if (!isOwner) return;
    const controller = new AbortController();
    setBuildInfoError(false);
    fetch(`${basePath}/api/admin/build-info`, {
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then(async response => {
        if (!response.ok) throw new Error(`Build information request failed (${response.status})`);
        return response.json() as Promise<AppBuildInfo>;
      })
      .then(setApiBuildInfo)
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setBuildInfoError(true);
      });
    return () => controller.abort();
  }, [isOwner]);

  const requestConfigSync = async (path: 'preview' | 'apply', snapshot: unknown) => {
    const response = await fetch(`${basePath}/api/admin/workspace-config/${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(path === 'apply'
        ? { snapshot, confirmation: 'WORKSPACE_CONFIG_APPLY', expectedStateHash: configSyncPreview?.stateHash }
        : snapshot),
    });
    const body = await response.json().catch(() => ({})) as WorkspaceConfigSyncResponse & { error?: string };
    if (!response.ok) throw new Error(body.error || `Configuration ${path} failed (${response.status})`);
    return body;
  };

  const onConfigSnapshotSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setConfigSyncPending(true);
    setConfigSyncError('');
    setConfigSyncApplied(false);
    setConfigSyncPreview(null);
    try {
      const snapshot = JSON.parse(await file.text()) as unknown;
      const preview = await requestConfigSync('preview', snapshot);
      setConfigSnapshot(snapshot);
      setConfigSnapshotName(file.name);
      setConfigSyncPreview(preview);
    } catch (error) {
      setConfigSnapshot(null);
      setConfigSnapshotName('');
      setConfigSyncError(error instanceof Error ? error.message : 'Configuration snapshot could not be read.');
    } finally {
      setConfigSyncPending(false);
      event.target.value = '';
    }
  };

  const applyConfigSnapshot = async () => {
    if (!configSnapshot || !configSyncPreview) return;
    const impact = Object.values(configSyncPreview.counts).reduce(
      (sum, detail) => sum + detail.counts.add + detail.counts.update + detail.counts.softDisable,
      0,
    );
    if (!window.confirm(`Apply ${impact} reviewed configuration changes to this environment? Production-only rows will be soft-disabled, not deleted.`)) return;
    setConfigSyncPending(true);
    setConfigSyncError('');
    try {
      const result = await requestConfigSync('apply', configSnapshot);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetFiatCurrenciesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetPaymentMethodsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetFiatCurrencyPaymentMethodsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListManualDeskPricingRulesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetCryptoAssetsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() }),
      ]);
      setConfigSyncPreview(result);
      setConfigSyncApplied(true);
    } catch (error) {
      setConfigSyncError(error instanceof Error ? error.message : 'Configuration synchronization failed.');
    } finally {
      setConfigSyncPending(false);
    }
  };

  const { from, to } = useMemo(() => getUtcBounds(datePreset, customFrom, customTo), [datePreset, customFrom, customTo]);

  const summary = useGetAdminSummary(
    { product, from, to },
    { query: { queryKey: getGetAdminSummaryQueryKey({ product, from, to }), refetchInterval: 30000 } }
  );

  const revenueParams = useMemo(() => ({ from, to, reportingCurrency: 'USD' }), [from, to]);
  const revenue = useGetManualDeskRevenue(revenueParams, {
    query: { queryKey: getGetManualDeskRevenueQueryKey(revenueParams), enabled: product === 'swap', refetchInterval: 30000 }
  });

  const pendingParams = useMemo(() => ({
    status: 'active',
    type: product === 'swap' ? ('manual' as const) : ('instant' as const),
    createdFrom: from,
    createdTo: to,
    pageSize: 6,
  }), [from, product, to]);

  const recentParams = useMemo(() => ({
    type: product === 'swap' ? ('manual' as const) : ('instant' as const),
    createdFrom: from,
    createdTo: to,
    pageSize: 6,
  }), [from, product, to]);

  const pending = useGetOrders(pendingParams, {
    query: {
      queryKey: getGetOrdersQueryKey(pendingParams),
      refetchInterval: 15_000,
      refetchIntervalInBackground: true,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchOnReconnect: 'always',
    },
  });
  const recentOrders = useGetOrders(recentParams, {
    query: {
      queryKey: getGetOrdersQueryKey(recentParams),
      refetchInterval: 15_000,
      refetchIntervalInBackground: true,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchOnReconnect: 'always',
    },
  });

  const data = summary.data;

  const totalApproxUsdVolume = useMemo(() => {
    if (!data?.dailySeries) return 0;
    return data.dailySeries.reduce((sum, day) => sum + day.approximateUsdVolume, 0);
  }, [data?.dailySeries]);

  const completedProfitUsd = useMemo(() => {
    if (product !== 'swap' || !revenue.data?.normalizedTotals) return null;
    return revenue.data.normalizedTotals.find(total => total.status === 'completed')?.historicalExpectedFeeRevenue ?? null;
  }, [revenue.data, product]);

  const isValuationPartial = data?.valuation?.status === 'partial';
  const isValuationUnavailable = data?.valuation?.status === 'unavailable';

  const valuationNotice = isValuationUnavailable ? (
    <div className="text-[10px] text-destructive leading-tight">
      <strong>{t('adminCore.usd_valuation_unavailable')}</strong><br/>
      {t('adminCore.cannot_compute_approx_usd_due_to_missing')}</div>
  ) : isValuationPartial ? (
    <div className="text-[10px] text-warning leading-tight">
      <strong>{t('adminCore.partial_usd_valuation')}</strong><br/>
      {t('adminCore.partial_valuation_detail', {
        currencies: data?.valuation?.unavailableCurrencies.join(', ') || '',
        valued: data?.valuation?.valuedOrders ?? 0,
        total: data?.valuation?.totalOrders ?? 0,
      })}</div>
  ) : undefined;

  const valuationDetail = data?.valuation?.observedAt
    ? t('adminCore.approx_usd_at_date', {
        date: formatDate(data.valuation.observedAt, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        }),
      })
    : t('adminCore.approx_usd_at_current_rate');
  const rangeLabel = t('adminCore.utc_date_range', {
    from: formatDate(from, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }),
    to: formatDate(to, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }),
  });
  const filteredOrdersHref = `/admin/orders?${new URLSearchParams({
    type: pendingParams.type,
    createdFrom: from.slice(0, 10),
    createdTo: to.slice(0, 10),
  })}`;
  const pendingOrdersHref = `${filteredOrdersHref}&status=active`;
  const reconciliationWarning = product === 'convert'
    ? quickexReconciliationWarning(data?.operationalHealth.quickexReconciliation, formatDate)
    : null;
  const providerFreshness = data?.operationalHealth.providerFreshness;
  const catalogHealth = data?.operationalHealth.catalog;
  const providerState = providerFreshness?.syncing || providerFreshness?.state === 'syncing'
    ? 'refreshing'
    : providerFreshness?.state === 'healthy'
      ? 'healthy'
      : providerFreshness?.state === 'stale'
        ? 'stale'
        : 'unavailable';
  const catalogState = providerFreshness?.syncing
    ? 'refreshing'
    : catalogHealth?.ageMs === null
      ? 'unavailable'
      : catalogHealth?.stale
        ? 'stale'
        : 'healthy';
  const healthStateLabel = (state: 'healthy' | 'stale' | 'refreshing' | 'unavailable') => (
    state === 'healthy'
      ? t('adminCore.healthy')
      : state === 'stale'
        ? t('adminCore.stale')
        : state === 'refreshing'
          ? t('adminCore.refreshing')
          : t('adminCore.unavailable')
  );
  const healthStateClasses = (state: 'healthy' | 'stale' | 'refreshing' | 'unavailable') => (
    state === 'healthy'
      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
      : state === 'refreshing'
        ? 'border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400'
        : state === 'stale'
          ? 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400'
          : 'border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400'
  );
  const providerName = product === 'swap' ? t('adminCore.oneforge_rates') : t('adminCore.quickex_provider');
  const providerUpdated = providerFreshness?.lastSucceededAt
    ? `${t('adminCore.updated')} ${overviewHealthTime(providerFreshness.lastSucceededAt, formatDate)}`
    : null;
  const providerFailure = providerFreshness?.lastFailedAt
    ? `${t('adminCore.last_failure')} ${overviewHealthTime(providerFreshness.lastFailedAt, formatDate)}`
    : null;
  const providerAccessibleName = [
    `${providerName}: ${healthStateLabel(providerState)}`,
    providerUpdated,
    providerFailure,
  ].filter(Boolean).join('. ');
  const catalogFailure = catalogHealth?.lastFailureAt
    ? `${t('adminCore.last_failure')} ${overviewHealthTime(catalogHealth.lastFailureAt, formatDate)}`
    : null;
  const catalogAccessibleName = [
    `${t('adminCore.quickex_catalog')}: ${healthStateLabel(catalogState)}`,
    catalogFailure,
  ].filter(Boolean).join('. ');

  return (
    <AdminShell eyebrow={t('adminCore.operations_command_center')} title={t('adminCore.overview')} subtitle={t('adminCore.real_time_exchange_operations_and_performance')} requiredPermission="statistics.view">

      {/* Controls Bar */}
      <div className="overview-controls flex flex-wrap items-center justify-between gap-4 mb-4 rise-in">
        <div className="overview-product-tabs flex bg-muted/60 p-1 rounded-lg" aria-label={t('adminCore.overview_product')}>
          <button type="button" onClick={() => setProduct('swap')} aria-pressed={product === 'swap'} data-testid="button-overview-swap" className={cn('rounded-md font-bold transition-all px-5 py-2 md:px-4 md:py-1.5 text-sm', product === 'swap' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('adminCore.swap')}</button>
          <button type="button" onClick={() => setProduct('convert')} aria-pressed={product === 'convert'} data-testid="button-overview-convert" className={cn('rounded-md font-bold transition-all px-5 py-2 md:px-4 md:py-1.5 text-sm', product === 'convert' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('adminCore.convert')}</button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-muted/60 p-1 rounded-lg" aria-label={t('adminCore.overview_date_range')}>
            {(['1d', '7d', '30d', '90d', 'custom'] as const).map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setDatePreset(preset)}
                aria-pressed={datePreset === preset}
                data-testid={`button-overview-date-${preset}`}
                className={cn('rounded-md font-bold transition-all px-4 py-2 md:px-3 md:py-1.5 text-[13px] md:text-xs', datePreset === preset ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {preset === 'custom' ? t('adminCore.custom') : preset === '1d' ? t('adminCore.24h') : preset.toUpperCase()}
              </button>
            ))}
          </div>

          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" aria-label={t('adminCore.overview_start_date')} data-testid="input-overview-start-date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="bg-background border border-border rounded-md text-[13px] px-3 py-2 md:py-1.5 text-foreground font-medium outline-none" />
              <span className="text-muted-foreground text-xs">{t('adminCore.to')}</span>
              <input type="date" aria-label={t('adminCore.overview_end_date')} data-testid="input-overview-end-date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="bg-background border border-border rounded-md text-[13px] px-3 py-2 md:py-1.5 text-foreground font-medium outline-none" />
            </div>
          )}
        </div>
      </div>
      <p className="admin-subtitle overview-range-label" data-testid="overview-range-label">{rangeLabel}</p>

      {summary.isError ? (
        <ErrorState message={t('adminCore.operations_summary_unavailable')} retry={() => summary.refetch()} />
      ) : summary.isLoading && !data ? (
        <LoadingBlock rows={5} />
      ) : (
        <>
          {reconciliationWarning && (
            <div className="mb-4 rise-in" data-testid="warning-quickex-reconciliation">
              <InlineNotice kind="warning">{reconciliationWarning}</InlineNotice>
            </div>
          )}

          <section className="overview-quick-actions panel rise-in" aria-labelledby="overview-quick-actions-title">
            <div className="overview-section-heading">
              <div><span className="section-kicker">{t('adminCore.workspace')}</span><h2 id="overview-quick-actions-title">{t('adminCore.quick_actions')}</h2></div>
              <small>{t('adminCore.open_existing_configuration_tools')}</small>
            </div>
            <div className="overview-quick-action-grid">
              <Link href="/admin/pricing" className="overview-quick-action"><span><TrendingUp size={17} /></span><strong>{t('adminCore.add_pricing_rule')}</strong><ArrowRight size={14} /></Link>
              <Link href="/admin/currencies?tab=currencies&create=currency" className="overview-quick-action"><span><Banknote size={17} /></span><strong>{t('adminCore.add_currency')}</strong><ArrowRight size={14} /></Link>
              <Link href="/admin/currencies?tab=methods&create=method" className="overview-quick-action"><span><CreditCard size={17} /></span><strong>{t('adminCore.add_payment_method')}</strong><ArrowRight size={14} /></Link>
              <Link href="/admin/currencies?tab=assets&create=asset" className="overview-quick-action"><span><Coins size={17} /></span><strong>{t('adminCore.add_crypto_asset')}</strong><ArrowRight size={14} /></Link>
              <Link href="/admin/currencies?tab=networks&create=network" className="overview-quick-action"><span><Network size={17} /></span><strong>{t('adminCore.add_crypto_network')}</strong><ArrowRight size={14} /></Link>
            </div>
          </section>

          <section className="panel rise-in" data-testid="overview-operational-health" aria-labelledby="overview-operational-health-title">
            <div className="overview-section-heading">
              <div>
                <span className="section-kicker">{t('adminCore.live_operations')}</span>
                <h2 id="overview-operational-health-title">{t('adminCore.api_status')}</h2>
              </div>
              <small>{t('adminCore.performance_queues_and_system_health')}</small>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <div className={cn('rounded-xl border p-3', healthStateClasses('healthy'))}>
                <span className="block text-[10px] font-bold uppercase tracking-wider opacity-75">{t('adminCore.api_status')}</span>
                <strong className="mt-1 block text-sm text-foreground">{t('adminCore.healthy')}</strong>
              </div>
              <div
                className={cn('rounded-xl border p-3', healthStateClasses(providerState))}
                data-testid="status-provider-health"
                aria-label={providerAccessibleName}
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider opacity-75">{providerName}</span>
                <strong className="mt-1 block text-sm text-foreground">{healthStateLabel(providerState)}</strong>
                {(providerUpdated || providerFailure) && (
                  <small className="mt-1 block text-[10px] leading-snug text-muted-foreground">
                    {[providerUpdated, providerFailure].filter(Boolean).join(' · ')}
                  </small>
                )}
              </div>
              {product === 'convert' && (
                <div
                  className={cn('rounded-xl border p-3', healthStateClasses(catalogState))}
                  data-testid="status-catalog-health"
                  aria-label={catalogAccessibleName}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wider opacity-75">{t('adminCore.quickex_catalog')}</span>
                  <strong className="mt-1 block text-sm text-foreground">{healthStateLabel(catalogState)}</strong>
                  {catalogFailure && <small className="mt-1 block text-[10px] leading-snug text-muted-foreground">{catalogFailure}</small>}
                </div>
              )}
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('adminCore.unresolved_orders')}</span>
                <strong className="mt-1 block text-sm text-foreground">{number(data?.operationalHealth.unresolvedOrders, 0)}</strong>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('adminCore.notifications_pending')}</span>
                <strong className="mt-1 block text-sm text-foreground">{number(data?.operationalHealth.notificationsPending, 0)}</strong>
                <small className="mt-1 block text-[10px] text-muted-foreground">
                  {t('adminCore.notifications_failed')}: {number(data?.operationalHealth.notificationsFailed, 0)}
                </small>
              </div>
            </div>
            {isOwner && (
              <div className="mt-3 rounded-xl border border-border bg-muted/20 p-4" data-testid="overview-build-identity">
                <div className="mb-3 flex items-center gap-2">
                  <Database size={16} className="text-primary" aria-hidden="true" />
                  <strong className="text-sm text-foreground">System / Deployment diagnostics</strong>
                </div>
                <div className="grid gap-3 text-xs sm:grid-cols-2">
                  {[
                    ['Frontend', frontendBuildInfo],
                    ['API', apiBuildInfo],
                  ].map(([label, info]) => {
                    const build = info as AppBuildInfo | null;
                    return (
                      <div key={label as string} className="min-w-0 rounded-lg border border-border bg-background/70 p-3">
                        <span className="font-bold uppercase tracking-wider text-muted-foreground">{label as string}</span>
                        {build ? (
                          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
                            <dt>Build</dt><dd className="truncate font-mono" data-testid={`build-identity-${String(label).toLowerCase()}-id`}>{build.buildId}</dd>
                            <dt>Commit</dt><dd className="truncate font-mono" data-testid={`build-identity-${String(label).toLowerCase()}-commit`}>{build.commit}</dd>
                            <dt>Built</dt><dd className="truncate font-mono">{build.deployedAt}</dd>
                            <dt>Environment</dt><dd className="truncate font-mono">{build.environment}</dd>
                          </dl>
                        ) : (
                          <small className="mt-2 block text-muted-foreground">
                            {buildInfoError ? 'Build information unavailable' : 'Loading build information…'}
                          </small>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-border pt-4" data-testid="workspace-config-sync">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <strong className="block text-sm text-foreground">Workspace configuration sync</strong>
                      <small className="mt-1 block max-w-2xl text-muted-foreground">
                        Owner-only, dry-run-first import. Orders, customers, transaction history, credentials, receiving wallets, and deposit state are excluded.
                      </small>
                    </div>
                    <label className={cn('inline-flex cursor-pointer items-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground', configSyncPending && 'pointer-events-none opacity-60')}>
                      {configSyncPending ? 'Checking…' : 'Choose snapshot'}
                      <input type="file" accept="application/json,.json" className="sr-only" onChange={onConfigSnapshotSelected} disabled={configSyncPending} data-testid="input-workspace-config-snapshot" />
                    </label>
                  </div>
                  {configSyncError && <p className="mt-3 text-xs font-medium text-destructive" role="alert">{configSyncError}</p>}
                  {configSyncPreview && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">
                        Reviewed snapshot: <span className="font-mono text-foreground">{configSnapshotName}</span>
                      </p>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-xs">
                          <thead><tr className="text-muted-foreground"><th className="py-2 pr-3">Category</th><th className="px-3 py-2">Add</th><th className="px-3 py-2">Update</th><th className="px-3 py-2">Soft-disable</th><th className="px-3 py-2">Unchanged</th></tr></thead>
                          <tbody>
                            {Object.entries(configSyncPreview.counts).map(([category, detail]) => (
                              <tr key={category} className="border-t border-border">
                                <th className="py-2 pr-3 font-medium text-foreground">{category}</th>
                                <td className="px-3 py-2">{detail.counts.add}</td>
                                <td className="px-3 py-2">{detail.counts.update}</td>
                                <td className="px-3 py-2">{detail.counts.softDisable}</td>
                                <td className="px-3 py-2">{detail.counts.unchanged}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button type="button" onClick={applyConfigSnapshot} disabled={configSyncPending || configSyncApplied} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-apply-workspace-config">
                          {configSyncApplied ? 'Configuration synchronized' : configSyncPending ? 'Applying…' : 'Apply reviewed changes'}
                        </button>
                        {configSyncApplied && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Atomic synchronization completed.</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Metrics Grid */}
          <div className="overview-metrics overview-kpi-grid grid grid-cols-2 md:grid-cols-4 gap-4 rise-in">
            <MetricCard label={t('adminCore.total_orders')} value={number(data?.totalOrders, 0)} detail="Selected period" icon={ArrowDownUp} tone="blue" />
            <MetricCard label={t('adminCore.pending_orders')} value={number(data?.pendingOrders, 0)} detail="Open and in progress" icon={Clock3} tone="amber" />
            <MetricCard label={t('adminCore.completed_orders')} value={number(data?.completedOrders, 0)} detail="Successfully settled" icon={BadgeCheck} tone="green" />
            <MetricCard label={t('adminCore.failed_cancelled')} value={number(data?.failedCancelledOrders, 0)} detail="Unsuccessful orders" icon={CircleAlert} tone="danger" />
            <MetricCard label={t('adminCore.total_volume')} value={money(totalApproxUsdVolume)} detail={valuationDetail} icon={Banknote} accent tone="cyan" notice={valuationNotice} />
            <MetricCard
              label={t('adminCore.total_profit')}
              value={product === 'swap' ? (revenue.isLoading ? 'Loading…' : revenue.isError || completedProfitUsd === null ? 'Unavailable' : `$${number(completedProfitUsd, 2)}`) : 'Not tracked'}
              detail={product === 'swap'
                ? revenue.isError
                  ? 'Audited revenue report could not load'
                  : completedProfitUsd === null
                    ? 'No audited completed revenue'
                    : 'Completed · historical audited USD'
                : 'Unavailable for Convert'}
              icon={Landmark}
              highlight
              tone="purple"
            />
            <MetricCard label={t('adminCore.registered_users')} value={number(data?.totalUsers, 0)} detail="Authenticated accounts" icon={UserRound} tone="blue" />
            <MetricCard label={t('adminCore.average_order_value')} value={money(data?.averageOrderValueUsd || 0)} detail={valuationDetail} icon={Banknote} tone="cyan" highlight notice={valuationNotice} />
          </div>

          {/* Charts */}
          <div className="overview-section-heading overview-performance-heading rise-in">
            <div><span className="section-kicker">{t('adminCore.historical_performance')}</span><h2>{t('adminCore.volume_amp_revenue')}</h2></div>
            <small>{t('adminCore.real_order_volume_and_audited_completed_revenue')}</small>
          </div>
          <Suspense fallback={null}>
            <DashboardCharts data={data?.dailySeries || []} />
          </Suspense>

          {/* Bottom section: Rankings & Activity/Queue */}
          <div className="overview-insights-grid grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 rise-in rise-delay-2">
            <RankingPanel title={t('adminCore.top_trading_pairs')} items={data?.topTradingPairs || []} itemKey="pair" labelKey="pair" valueKey="count" formatValue={(v) => `${v} orders`} />
            <Suspense fallback={null}>
              <OrderStatusChart summary={data} />
            </Suspense>
          </div>

          <div className="overview-insights-grid grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 rise-in rise-delay-2">
            <RankingPanel title={t('adminCore.top_currencies')} items={data?.topCurrencies || []} itemKey="currency" labelKey="currency" valueKey="count" formatValue={(v) => `${v} orders`} />
            <div className="panel activity-panel h-full flex flex-col">
              <div className="panel-heading shrink-0">
                <div><span className="section-kicker">{t('adminCore.recent_refreshes_every_30s')}</span><h2>{t('adminCore.live_exchange_activity')}</h2></div>
                <Link href={filteredOrdersHref} className="icon-button" aria-label={t('adminCore.view_filtered_product_orders', { product })} data-testid="link-all-activity"><MoreHorizontal size={18} /></Link>
              </div>
              <div className="activity-list overflow-y-auto flex-1 pr-2" data-testid="list-live-exchange-activity">
                {(data?.recentActivity || []).length ? data?.recentActivity.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <span className="activity-mark"><Check size={13} /></span>
                    <div><strong>{item.label}</strong><small>{ago(item.time)}</small></div>
                  </div>
                )) : <div className="mini-empty">{t('adminCore.no_new_activity_yet')}</div>}
              </div>
            </div>
          </div>

          <div className="panel pending-panel rise-in rise-delay-2 mt-4">
            <div className="panel-heading">
              <div><span className="section-kicker">{t('adminCore.queue')}</span><h2>{t('adminCore.needs_attention')}{product === 'swap' ? t('adminCore.swap') : t('adminCore.convert')})</h2></div>
              <Link href={pendingOrdersHref} className="text-link" data-testid="link-pending-orders">{t('adminCore.view_full_queue')}<ArrowRight size={14} /></Link>
            </div>
            {pending.isError && !pending.data
              ? <ErrorState message={t('adminCore.load_order_queue_error')} retry={() => pending.refetch()} />
              : <>
                  {pending.isError && <InlineNotice kind="error"><strong>{t('adminCore.queue_refresh_failed')}</strong><p>{t('adminCore.the_saved_queue_is_shown_below_try')}</p><button className="button button-secondary mt-3" onClick={() => pending.refetch()}><RefreshCw size={14} />{t('adminCore.try_again')}</button></InlineNotice>}
                  <OverviewQueueTable orders={(pending.data?.items || []).slice(0, 6)} loading={pending.isLoading} emptyLabel={t('adminCore.the_queue_is_clear_nice_work')} />
                </>
            }
          </div>

          <div className="panel pending-panel rise-in rise-delay-2 mt-4">
            <div className="panel-heading">
              <div><span className="section-kicker">{t('adminCore.recent')}</span><h2>{t('adminCore.recent_orders')}{product === 'swap' ? t('adminCore.swap') : t('adminCore.convert')})</h2></div>
              <Link href={filteredOrdersHref} className="text-link overview-view-all" data-testid="link-recent-orders">{t('adminCore.view_all_orders')}<ArrowRight size={14} /></Link>
            </div>
            {recentOrders.isError && !recentOrders.data
              ? <ErrorState message={t('adminCore.load_recent_orders_error')} retry={() => recentOrders.refetch()} />
              : <>
                  {recentOrders.isError && <InlineNotice kind="error"><strong>{t('adminCore.refresh_failed')}</strong><p>{t('adminCore.saved_orders_are_shown_below_try_again')}</p><button className="button button-secondary mt-3" onClick={() => recentOrders.refetch()}><RefreshCw size={14} />{t('adminCore.try_again')}</button></InlineNotice>}
                  <OverviewRecentTable orders={(recentOrders.data?.items || []).slice(0, 6)} loading={recentOrders.isLoading} emptyLabel={t('adminCore.no_recent_orders_found')} />
                </>
            }
          </div>
        </>
      )}
    </AdminShell>
  );
}


function formatRevenueDecimal(value: string, asset: string, exact: boolean) {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;

  const [, sign, integerPart, fractionPart = ''] = match;
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (exact) return `${sign}${groupedInteger}${fractionPart ? `.${fractionPart}` : ''}`;

  const scale = isFiatCurrencyCode(asset) ? 2 : 8;
  const paddedFraction = fractionPart.padEnd(scale + 1, '0');
  const retainedFraction = paddedFraction.slice(0, scale);
  const roundingDigit = Number(paddedFraction[scale] || '0');
  const scaledInteger = BigInt(`${integerPart}${retainedFraction}` || '0') + (roundingDigit >= 5 ? 1n : 0n);
  const paddedResult = scaledInteger.toString().padStart(scale + 1, '0');
  const roundedInteger = paddedResult.slice(0, -scale) || '0';
  const roundedFraction = paddedResult.slice(-scale);
  const groupedRoundedInteger = roundedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const visibleFraction = isFiatCurrencyCode(asset) ? roundedFraction : roundedFraction.replace(/0+$/, '');

  return `${sign}${groupedRoundedInteger}${visibleFraction ? `.${visibleFraction}` : ''}`;
}

function AdminRevenue() {
  const { t } = useI18n();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(dateInputValue(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(dateInputValue(today));
  const [groupBy, setGroupBy] = useState<'route' | 'pricingRule'>('route');
  const [reportingCurrency, setReportingCurrency] = useState('USD');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [showExactDecimals, setShowExactDecimals] = useState(false);
  const params = useMemo(() => ({
    from: new Date(`${from}T00:00:00.000Z`).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    groupBy,
    reportingCurrency: reportingCurrency.trim().toUpperCase(),
  }), [from, to, groupBy, reportingCurrency]);
  const report = useGetManualDeskRevenue(params, {
    query: { queryKey: getGetManualDeskRevenueQueryKey(params) },
  });
  const totalsByAsset = useMemo(() => {
    const buckets = new Map<string, NonNullable<typeof report.data>['totals']>();
    for (const total of report.data?.totals ?? []) {
      const current = buckets.get(total.targetAsset) ?? [];
      current.push(total);
      buckets.set(total.targetAsset, current);
    }
    return [...buckets.entries()];
  }, [report.data]);

  const handleExport = async () => {
    setExportError('');
    setExporting(true);
    try {
      const csv = await exportManualDeskRevenueCsv(params);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `manual-desk-revenue-${from}-${to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('The revenue CSV could not be prepared. Try again in a moment.');
    } finally {
      setExporting(false);
    }
  };

  const formatDisplay = (value: string | undefined, asset: string) => formatRevenueDecimal(value ?? '0', asset, showExactDecimals);
  const exactTitle = (value: string | undefined, asset: string) => `Exact value: ${value ?? '0'} ${asset}`;
  const exactToggle = (
    <button
      type="button"
      className={cn("revenue-exact-toggle", showExactDecimals && "is-active")}
      aria-pressed={showExactDecimals}
      onClick={() => setShowExactDecimals(current => !current)}
    >
      <Eye size={12} />
      {showExactDecimals ? t('adminRevenue.exact_decimals_on') : t('adminRevenue.view_exact_values')}
    </button>
  );

  return <AdminShell
    eyebrow={t('adminRevenue.operations_revenue')}
    title={t('adminRevenue.expected_desk_revenue')}
    requiredPermission="statistics.view"
    titleIcon={<span className="revenue-title-icon"><TrendingUp size={19} /></span>}
  >
    <div className="revenue-page">
    <div className="admin-welcome"><p className="admin-subtitle">{t('adminRevenue.auditable_gross_customer_volume_and_expected_fees')}</p></div>
    {exportError && <div className="mb-4"><InlineNotice kind="error" onDismiss={() => setExportError('')}><strong>{t('adminRevenue.export_failed')}</strong><p>{exportError}</p></InlineNotice></div>}
    <div className="panel revenue-filter-panel p-4 mb-5 rise-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="revenue-filter-field"><span className="field-label">{t('adminRevenue.from')}</span><span className="revenue-date-control"><CalendarDays size={14} /><input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} data-testid="input-revenue-from" /></span></label>
        <label className="revenue-filter-field"><span className="field-label">{t('adminRevenue.to')}</span><span className="revenue-date-control"><CalendarDays size={14} /><input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} data-testid="input-revenue-to" /></span></label>
        <label><span className="field-label">{t('adminRevenue.group_results_by')}</span><select value={groupBy} onChange={event => setGroupBy(event.target.value as 'route' | 'pricingRule')} data-testid="select-revenue-group"><option value="route">{t('adminRevenue.source_target_route')}</option><option value="pricingRule">{t('adminRevenue.pricing_rule_version')}</option></select></label>
        <label><span className="field-label">{t('adminRevenue.reporting_currency')}</span><input value={reportingCurrency} onChange={event => setReportingCurrency(event.target.value.toUpperCase())} maxLength={12} pattern="[A-Za-z0-9]{2,12}" data-testid="input-revenue-currency" /><small>{t('adminRevenue.usd_works_across_every_route_other_currencies')}</small></label>
      </div>
      <div className="revenue-filter-actions">
        <button type="button" onClick={handleExport} disabled={exporting || report.isLoading} className="button button-secondary revenue-export-button" data-testid="button-export-revenue">
          {exporting ? <Loader2 className="spin" size={15} /> : <Download size={15} />}
          {exporting ? t('adminRevenue.preparing') : t('adminRevenue.export_csv')}
        </button>
      </div>
    </div>
    {report.isError ? <ErrorState message={t('adminRevenue.load_revenue_report_error')} retry={() => report.refetch()} /> : report.isLoading ? <LoadingBlock rows={5} /> : <>
      {!totalsByAsset.length ? <div className="table-empty panel" data-testid="empty-revenue"><Banknote size={20} /><strong>{t('adminRevenue.no_snapshotted_manual_orders_in_this_period')}</strong><span>{t('adminRevenue.choose_a_different_date_range_to_review')}</span></div> : <>
        <div className="panel revenue-historical-panel p-5 mb-5 rise-in" data-testid="revenue-normalized-total">
          <div className="panel-heading"><div><span className="section-kicker">{t('adminRevenue.historical_expected_revenue')}</span><h2>{t('adminRevenue.all_routes_in')} {report.data?.reportingCurrency}</h2></div><div className="revenue-heading-badges"><span className="secure-badge revenue-snapshot-badge">{t('adminRevenue.snapshot_rates_only')}</span>{exactToggle}</div></div>
          <div className="revenue-status-grid">
            {(['active', 'completed', 'failed', 'cancelled'] as const).map(status => {
              const total = report.data?.normalizedTotals.find(item => item.status === status);
              const currency = report.data?.reportingCurrency ?? reportingCurrency;
              const StatusIcon = status === 'active' ? Activity : status === 'completed' ? CheckCircle : status === 'failed' ? Ban : X;
              return <div className={`revenue-status-card revenue-status-${status}`} key={status}>
                <div className="revenue-status-heading"><span className="revenue-status-icon"><StatusIcon size={14} /></span><strong>{status}</strong></div>
                <div className="revenue-value-pair"><span>{t('adminRevenue.expected_fees')}</span><strong title={exactTitle(total?.historicalExpectedFeeRevenue, currency)}>{formatDisplay(total?.historicalExpectedFeeRevenue, currency)} <small>{currency}</small></strong></div>
                <div className="revenue-value-pair"><span>{t('adminRevenue.gross_volume')}</span><strong title={exactTitle(total?.historicalGrossCustomerVolume, currency)}>{formatDisplay(total?.historicalGrossCustomerVolume, currency)} <small>{currency}</small></strong></div>
              </div>;
            })}
          </div>
          <small>{t('adminRevenue.historical_expected_values_use_each_order_s')}{report.data?.normalizationPolicy.decimalScale} {t('adminRevenue.decimal_places')}</small>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5 rise-in">
          {totalsByAsset.map(([asset, totals], assetIndex) => <div className={`panel revenue-asset-panel revenue-asset-accent-${assetIndex % 4} p-5`} key={asset} data-testid={`revenue-total-${asset}`}>
            <div className="panel-heading"><div><span className="section-kicker">{t('adminRevenue.target_asset')}</span><h2 className="revenue-asset-title"><span className="revenue-asset-logo">{isFiatCurrencyCode(asset) ? <FiatCurrencyFlag code={asset} variant="admin" /> : <AdminCryptoLogo symbol={asset} logoFallbackUrls={cryptoLogoFallbackUrls(asset)} size="md" />}</span>{asset}</h2></div>{exactToggle}</div>
            <div className="revenue-status-grid">
              {(['active', 'completed', 'failed', 'cancelled'] as const).map(status => {
                const total = totals.find(item => item.status === status);
                const StatusIcon = status === 'active' ? Activity : status === 'completed' ? CheckCircle : status === 'failed' ? Ban : X;
                return <div className={`revenue-status-card revenue-status-${status}`} key={status}>
                  <div className="revenue-status-heading"><span className="revenue-status-icon"><StatusIcon size={14} /></span><strong>{status}</strong></div>
                  <div className="revenue-value-pair"><span>{t('adminRevenue.expected_fees')}</span><strong title={exactTitle(total?.expectedFeeRevenue, asset)}>{formatDisplay(total?.expectedFeeRevenue, asset)} <small>{asset}</small></strong></div>
                  <div className="revenue-value-pair"><span>{t('adminRevenue.gross_volume')}</span><strong title={exactTitle(total?.grossCustomerVolume, asset)}>{formatDisplay(total?.grossCustomerVolume, asset)} <small>{asset}</small></strong></div>
                </div>;
              })}
            </div>
          </div>)}
        </div>
        <div className="panel p-0 overflow-hidden rise-in">
          <div className="panel-heading p-5 border-b border-border"><div><span className="section-kicker">{groupBy === 'route' ? t('adminRevenue.routes') : t('adminRevenue.pricing_rules')}</span><h2>{t('adminRevenue.revenue_breakdown')}</h2></div><small>{report.data?.groups.length ?? 0} {t('adminRevenue.result_groups')}</small></div>
          <div className="w-full relative group">
            <div className="swipeable-scroll-hint" aria-hidden="true" />
            <div className="table-wrap" onScroll={(e) => {
              const target = e.target as HTMLElement;
              const hint = target.previousElementSibling as HTMLElement;
              if (hint) {
                hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
                hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
              }
            }}>
              <table className="data-table revenue-table" data-testid="table-revenue"><thead><tr><th>{groupBy === 'route' ? t('adminRevenue.route') : t('adminRevenue.pricing_rule')}</th><th>{t('adminRevenue.status')}</th><th>{t('adminRevenue.orders')}</th><th>{t('adminRevenue.gross_customer_volume')}</th><th>{t('adminRevenue.expected_fee_revenue')}</th><th>{t('adminRevenue.historical_normalized_fee')}</th></tr></thead><tbody>{report.data?.groups.map(group => <tr key={`${group.key}-${group.status}-${group.targetAsset}`}><td><strong>{group.label}</strong><small>{group.key}</small></td><td><StatusPill status={group.status} /></td><td>{group.orderCount}</td><td><strong title={exactTitle(group.grossCustomerVolume, group.targetAsset)}>{formatDisplay(group.grossCustomerVolume, group.targetAsset)} {group.targetAsset}</strong></td><td><strong title={exactTitle(group.expectedFeeRevenue, group.targetAsset)}>{formatDisplay(group.expectedFeeRevenue, group.targetAsset)} {group.targetAsset}</strong></td><td><strong title={exactTitle(group.normalizedExpectedFeeRevenue, report.data?.reportingCurrency ?? reportingCurrency)}>{formatDisplay(group.normalizedExpectedFeeRevenue, report.data?.reportingCurrency ?? reportingCurrency)} {report.data?.reportingCurrency}</strong><small>{t('adminRevenue.historical_snapshot')}</small></td></tr>)}</tbody></table>
            </div>
          </div>
        </div>
      </>}
    </>}
    </div>
  </AdminShell>;
}

function VolumeChart({ data }: { data: Array<{ date: string; volume: number }> }) {
  const { t, formatDate } = useI18n();
  const max = Math.max(...data.map((item) => item.volume), 1);
  return <div className="volume-chart" data-testid="chart-daily-volume">{data.length ? data.map((item) => <div className="bar-group" key={item.date}><span className="bar-value">{money(item.volume)}</span><div className="bar-track"><div className="bar" style={{ height: `${Math.max(8, (item.volume / max) * 100)}%` }} /></div><small>{formatDate(item.date, { weekday: 'short' })}</small></div>) : <div className="mini-empty">{t('adminRevenue.daily_volume_will_appear_once_orders_settle')}</div>}</div>;
}

function SelectionCheckbox({ checked, indeterminate = false, onChange, label, testId }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  testId?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input
    ref={ref}
    type="checkbox"
    className="order-selection-checkbox"
    checked={checked}
    onChange={(event) => onChange(event.target.checked)}
    aria-label={label}
    data-testid={testId}
  />;
}

type OrderSelectionProps = {
  selectedIds?: Set<string>;
  onToggleOrder?: (id: string, selected: boolean) => void;
  onToggleAll?: (selected: boolean) => void;
};

function modernOrderStatusTone(status: string) {
  const normalizedStatus = status.toLowerCase();
  if (/(failed|rejected|cancelled|canceled|error|expired)/.test(normalizedStatus)) return 'danger';
  if (/(completed|success|done|paid|payout sent)/.test(normalizedStatus)) return 'success';
  if (/(await|pending|processing|in progress|waiting|review|deposit|confirm)/.test(normalizedStatus)) return 'attention';
  return 'info';
}

function OverviewQueueTable({ orders, loading = false, emptyLabel }: {
  orders: Order[];
  loading?: boolean;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  if (loading && !orders.length) return <LoadingBlock rows={4} />;

  const visibleOrders = orders.filter((order) => {
    const status = order.type === 'manual' ? swapStatusLabel(order) : order.status;
    const haystack = [
      order.id,
      order.fromAsset,
      order.toAsset,
      order.customerName,
      order.customerEmail,
      status,
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = haystack.includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || status.toLowerCase().includes(statusFilter);
    return matchesSearch && matchesStatus;
  });

  return <div className="overview-queue">
    <div className="overview-queue-toolbar mb-4 flex gap-3">
      <div className="flex-1 min-w-0">
        <AdminSearch
          value={search}
          onChange={setSearch}
          placeholder={t('adminOrders.search_queue')}
          testId="input-overview-queue-search"
        />
      </div>
      <button
        type="button"
        className={cn('flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors', showFilter && 'bg-muted border-muted-foreground/30')}
        onClick={() => setShowFilter((current) => !current)}
        aria-expanded={showFilter}
        data-testid="button-overview-queue-filter"
      >
        <Filter size={13} /> {t('adminOrders.filter')}</button>
      {showFilter && <select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        aria-label={t('adminOrders.filter_queue_by_status')}
        data-testid="select-overview-queue-status"
        className="bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors min-w-[140px]"
      >
        <option value="all">{t('adminOrders.all_statuses')}</option>
        <option value="await">{t('adminOrders.awaiting')}</option>
        <option value="process">{t('adminOrders.in_progress')}</option>
        <option value="confirm">{t('adminOrders.confirmed')}</option>
      </select>}
    </div>

    {!visibleOrders.length
      ? <div className="table-empty overview-queue-empty p-8 rounded-xl border border-border bg-card/50 text-center" data-testid="empty-orders"><ArrowDownUp size={24} className="mx-auto mb-3 text-muted-foreground opacity-50" /><strong className="block text-sm mb-1">{orders.length ? t('adminOrders.no_queue_items_match_your_search') : emptyLabel}</strong><span className="text-xs text-muted-foreground">{orders.length ? t('adminOrders.try_another_search_or_filter') : t('adminOrders.new_orders_will_show_up_here_in')}</span></div>
      : <>
        <div className="w-full relative group">
          <div className="swipeable-scroll-hint" aria-hidden="true" />
          <div className="modern-orders-table-wrapper overview-queue-orders-table-wrap w-full overflow-x-auto pb-2" onScroll={(e) => {
            const target = e.target as HTMLElement;
            const hint = target.previousElementSibling as HTMLElement;
            if (hint) {
              hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
              hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
            }
          }}>
            <table className="modern-orders-table overview-queue-orders-table" data-testid="table-orders">
              <thead>
                <tr>
                  <th>{t('adminOrders.exchange')}</th>
                  <th>{t('adminOrders.send')}</th>
                  <th>{t('adminOrders.receive')}</th>
                  <th>{t('adminOrders.status')}</th>
                  <th>{t('adminOrders.paid')}</th>
                  <th>{t('adminOrders.user')}</th>
                  <th>{t('adminOrders.created_at')}</th>
                  <th aria-label={t('adminOrders.actions')} className="text-right">{t('adminOrders.action')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const settlementState = (order.manualSettlementState || '').toLowerCase();
                  const paid = Boolean(
                    order.providerCompleted ||
                    Number(order.providerPaidAmount || 0) > 0 ||
                    ['funds_confirmed', 'payout_processing', 'payout_sent', 'completed'].includes(settlementState)
                  );
                  const customer = guestCustomerLabel(order);
                  const status = order.type === 'manual' ? swapStatusLabel(order) : order.status;
                  const statusTone = modernOrderStatusTone(status);
                  return (
                    <tr key={order.id} data-testid={`row-order-${order.id}`}>
                      <td>
                        <div className="overview-exchange-pair">
                          <AdminAssetIdentity symbol={order.fromAsset} network={order.fromNetwork} size="md" compact />
                          <ArrowRight size={14} className="text-muted-foreground/50 shrink-0" />
                          <AdminAssetIdentity symbol={order.toAsset} network={order.toNetwork} size="md" compact />
                        </div>
                      </td>
                      <td>
                        <strong className="text-sm font-extrabold">{number(order.amount)} {order.fromAsset}</strong>
                      </td>
                      <td>
                        <strong className="text-sm font-extrabold">{number(order.receiveAmount)} {order.toAsset}</strong>
                      </td>
                      <td>
                        <span className={`modern-status-pill status-${statusTone}`} data-testid={`status-overview-order-${order.id}`}>{status.replace(/_/g, ' ')}</span>
                      </td>
                      <td>
                        <span className={cn('text-xs font-bold uppercase tracking-wider', paid ? 'text-emerald-500' : 'text-muted-foreground')}>{paid ? t('adminOrders.paid') : t('adminOrders.not_paid')}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">{customer.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                          <strong className="text-xs font-medium max-w-[120px] truncate">{customer}</strong>
                        </div>
                      </td>
                      <td>
                        <span className="text-xs text-muted-foreground">{exactDateTime(order.createdAt)}</span>
                      </td>
                      <td className="text-right">
                        <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} className="view-order-btn inline-block" aria-label={t('adminCore.open_order_named', { id: shortId(order.id) })} data-testid={`link-open-overview-order-${order.id}`}>{t('adminOrders.view_order')}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>}
  </div>;
}

function OverviewRecentTable({ orders, loading = false, emptyLabel }: {
  orders: Order[];
  loading?: boolean;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  if (loading && !orders.length) return <LoadingBlock rows={4} />;

  return <div className="overview-queue">
    {!orders.length
      ? <div className="table-empty overview-queue-empty p-8 rounded-xl border border-border bg-card/50 text-center" data-testid="empty-recent-orders"><ArrowDownUp size={24} className="mx-auto mb-3 text-muted-foreground opacity-50" /><strong className="block text-sm mb-1">{emptyLabel}</strong><span className="text-xs text-muted-foreground">{t('adminOrders.new_orders_will_appear_here')}</span></div>
      : <>
        <div className="w-full relative group">
          <div className="swipeable-scroll-hint" aria-hidden="true" />
          <div className="modern-orders-table-wrapper overview-recent-orders-table-wrap w-full overflow-x-auto pb-2" onScroll={(e) => {
            const target = e.target as HTMLElement;
            const hint = target.previousElementSibling as HTMLElement;
            if (hint) {
              hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
              hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
            }
          }}>
            <table className="modern-orders-table overview-recent-orders-table" data-testid="table-recent-orders">
              <thead>
                <tr>
                  <th>{t('adminOrders.order_id')}</th>
                  <th>{t('adminOrders.exchange')}</th>
                  <th>{t('adminOrders.send')}</th>
                  <th>{t('adminOrders.receive')}</th>
                  <th>{t('adminOrders.status')}</th>
                  <th>{t('adminOrders.customer')}</th>
                  <th>{t('adminOrders.time')}</th>
                  <th aria-label={t('adminOrders.actions')} className="text-right">{t('adminOrders.action')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const customer = guestCustomerLabel(order);
                  const status = order.type === 'manual' ? swapStatusLabel(order) : order.status;
                  const statusTone = modernOrderStatusTone(status);
                  return (
                    <tr key={order.id} data-testid={`row-recent-order-${order.id}`}>
                      <td>
                        <span className="font-mono text-[11px] bg-muted/30 px-2 py-1 rounded text-muted-foreground border border-border/50">{shortId(order.id)}</span>
                      </td>
                      <td>
                        <div className="overview-exchange-pair">
                          <AdminAssetIdentity symbol={order.fromAsset} network={order.fromNetwork} size="md" compact />
                          <ArrowRight size={14} className="text-muted-foreground/50 shrink-0" />
                          <AdminAssetIdentity symbol={order.toAsset} network={order.toNetwork} size="md" compact />
                        </div>
                      </td>
                      <td>
                        <strong className="text-sm font-extrabold">{number(order.amount)} {order.fromAsset}</strong>
                      </td>
                      <td>
                        <strong className="text-sm font-extrabold">{number(order.receiveAmount)} {order.toAsset}</strong>
                      </td>
                      <td>
                        <span className={`modern-status-pill status-${statusTone}`} data-testid={`status-recent-order-${order.id}`}>{status.replace(/_/g, ' ')}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">{customer.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                          <strong className="text-xs font-medium max-w-[100px] truncate" title={customer}>{customer}</strong>
                        </div>
                      </td>
                      <td>
                        <span className="text-[11px] text-muted-foreground">{exactDateTime(order.createdAt)}</span>
                      </td>
                      <td className="text-right">
                        <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} className="view-order-btn inline-block" aria-label={t('adminCore.view_order_named', { id: shortId(order.id) })} data-testid={`link-view-recent-order-${order.id}`}>{t('adminOrders.view_order')}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>}
  </div>;
}


function RedesignedStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().trim().replaceAll('_', ' ');
  const statusColors: Record<string, string> = {
    completed: 'status-badge-green',
    awaiting: 'status-badge-blue',
    'awaiting funds': 'status-badge-blue',
    'awaiting deposit': 'status-badge-blue',
    pending: 'status-badge-blue',
    active: 'status-badge-blue',
    'on hold': 'status-badge-blue',
    'verification required': 'status-badge-blue',
    'not required': 'status-badge-blue',
    confirmed: 'status-badge-purple',
    'funds confirmed': 'status-badge-purple',
    'deposit received': 'status-badge-purple',
    processing: 'status-badge-purple',
    'payout processing': 'status-badge-purple',
    'payout sent': 'status-badge-purple',
    exchanging: 'status-badge-purple',
    'sending payout': 'status-badge-purple',
    cancelled: 'status-badge-red',
    canceled: 'status-badge-red',
    failed: 'status-badge-red',
    expired: 'status-badge-red',
    refunded: 'status-badge-orange',
  };
  const colorClass = statusColors[normalized] || 'status-badge-gray';
  const label = normalized.replace(/\b\w/g, character => character.toUpperCase());

  return <span className={cn('redesigned-status-badge', colorClass)}>{label}</span>;
}

function RowMenu({
  order,
  archived,
  canArchive,
  canEditStatus,
  onSelectOrder,
  onChangeArchive,
  onDeletePermanently,
  variant = 'desktop',
}: {
  order: Order;
  archived: boolean;
  canArchive: boolean;
  canEditStatus: boolean;
  onSelectOrder: (id: string) => void;
  onChangeArchive: (id: string, version: number, archived: boolean) => void;
  onDeletePermanently: (id: string, version: number) => void;
  variant?: 'desktop' | 'mobile';
}) {
  const { t } = useI18n();
  const archiveAction = archived ? 'Restore' : 'Archive';
  const testIdPrefix = variant === 'mobile' ? 'row-menu-mobile' : 'row-menu';
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button type="button" className="row-menu-trigger p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()} aria-label={t('adminOrders.order_actions')} data-testid={`${testIdPrefix}-trigger-${order.id}`}>
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content align="end" sideOffset={4} className="admin-order-actions-menu z-50 w-44 bg-card border border-border rounded-lg shadow-lg flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuPrimitive.Item className="px-3 py-1.5 text-[13px] hover:bg-muted focus:bg-muted transition-colors font-medium w-full text-left cursor-pointer outline-none" onClick={() => onSelectOrder(order.id)} data-testid={`${testIdPrefix}-view-${order.id}`}>{t('adminOrders.view_order')}</DropdownMenuPrimitive.Item>
          {canEditStatus && <DropdownMenuPrimitive.Item className="px-3 py-1.5 text-[13px] hover:bg-muted focus:bg-muted transition-colors font-medium w-full text-left cursor-pointer outline-none" onClick={() => onSelectOrder(order.id)} data-testid={`${testIdPrefix}-status-${order.id}`}>{t('adminOrders.edit_status')}</DropdownMenuPrimitive.Item>}
          {canEditStatus && <DropdownMenuPrimitive.Item className="px-3 py-1.5 text-[13px] hover:bg-muted focus:bg-muted transition-colors font-medium w-full text-left cursor-pointer outline-none" onClick={() => onSelectOrder(order.id)} data-testid={`${testIdPrefix}-edit-${order.id}`}>{t('adminOrders.edit_order')}</DropdownMenuPrimitive.Item>}
          {canArchive && <DropdownMenuPrimitive.Item
            className={cn(
              'px-3 py-1.5 text-[13px] transition-colors font-bold w-full text-left outline-none cursor-pointer',
              archived ? 'text-primary hover:bg-primary/10 focus:bg-primary/10' : 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
            )}
            onClick={() => onChangeArchive(order.id, order.recordVersion, !archived)}
            data-testid={`${testIdPrefix}-${archived ? 'restore' : 'archive'}-${order.id}`}
          >
            {archiveAction}
          </DropdownMenuPrimitive.Item>}
          {canArchive && archived && <DropdownMenuPrimitive.Item
            className="px-3 py-1.5 text-[13px] transition-colors font-bold w-full text-left outline-none cursor-pointer text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
            onClick={() => onDeletePermanently(order.id, order.recordVersion)}
            data-testid={`${testIdPrefix}-delete-permanently-${order.id}`}
          >
            Delete Permanently
          </DropdownMenuPrimitive.Item>}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function RedesignedOrderTable({
  orders, options, type, loading, emptyLabel = 'No orders match these filters.',
  onSelectOrder, selectedIds, onToggleOrder, onToggleAll,
  archived, canArchive, canEditStatus, onChangeArchive, onDeletePermanently,
}: {
  orders: Order[];
  options: SettlementOption[];
  type?: 'instant' | 'manual';
  loading?: boolean;
  emptyLabel?: string;
  onSelectOrder: (id: string) => void;
  selectedIds?: Set<string>;
  onToggleOrder?: (id: string, selected: boolean) => void;
  onToggleAll?: (selected: boolean) => void;
  archived: boolean;
  canArchive: boolean;
  canEditStatus: boolean;
  onChangeArchive: (id: string, version: number, archived: boolean) => void;
  onDeletePermanently: (id: string, version: number) => void;
}) {
  const { t } = useI18n();
  if (loading && !orders.length) return <LoadingBlock rows={6} />;
  if (!orders.length) return <div className="table-empty" data-testid="empty-orders"><ArrowDownUp size={20} /><strong>{emptyLabel}</strong><span>{t('adminOrders.new_orders_will_show_up_here_in')}</span></div>;
  const selectedOnPage = orders.filter((order) => selectedIds?.has(order.id)).length;

  return <div className="w-full relative group">
    <div className="swipeable-scroll-hint" aria-hidden="true" />
    <div className="table-wrap redesigned-table-wrap" onScroll={(e) => {
      const target = e.target as HTMLElement;
      const hint = target.previousElementSibling as HTMLElement;
      if (hint) {
        hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
        hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
      }
    }}>
      <table className="modern-orders-table redesigned-orders-table" data-testid="table-orders">
        <thead>
          <tr>
            {onToggleAll && <th className="selection-column"><SelectionCheckbox checked={selectedOnPage === orders.length} indeterminate={selectedOnPage > 0 && selectedOnPage < orders.length} onChange={onToggleAll} label={t('adminOrders.select_all_displayed_orders')} testId="checkbox-select-all-orders" /></th>}
            <th>{t('adminOrders.exchange')}</th>
            <th>{t('adminOrders.amount')}</th>
            <th>{t('adminOrders.status')}</th>
            <th>{t('adminOrders.customer')}</th>
            <th>{t('adminOrders.date_time')}</th>
            <th className="text-right order-id-actions-heading">{t('adminOrders.order_id')} / {t('adminOrders.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const status = type === 'manual' || order.type === 'manual' ? swapStatusLabel(order) : order.status;
            return <tr key={order.id} data-testid={`row-order-${order.id}`} className={cn("group cursor-pointer transition-colors hover:bg-muted/30 border-b border-border/50", selectedIds?.has(order.id) && "bg-primary/5 hover:bg-primary/10")} onClick={() => onSelectOrder(order.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!(e.target as HTMLElement).closest('button, input, select, a, label')) onSelectOrder(order.id); } }} tabIndex={0}>
              {onToggleOrder && <td className="selection-column" onClick={(e) => e.stopPropagation()}><SelectionCheckbox checked={Boolean(selectedIds?.has(order.id))} onChange={(selected) => onToggleOrder(order.id, selected)} label={t('adminOrders.select_order_named', { id: order.id })} testId={`checkbox-order-${order.id}`} /></td>}
              <td className="order-exchange-cell" data-label="Exchange">
                <div className="order-exchange-logos" aria-label={`${order.fromAsset} to ${order.toAsset}`}>
                  <OrderRouteLogo order={order} side="source" options={options} />
                  <ArrowRight size={14} aria-hidden="true" />
                  <OrderRouteLogo order={order} side="target" options={options} />
                </div>
              </td>
              <td className="order-amount-cell" data-label="Amount">
                <div className="order-amount-pair">
                  <strong>{number(order.receiveAmount)} {order.toAsset}</strong>
                  <span>{number(order.amount)} {order.fromAsset}</span>
                </div>
              </td>
              <td data-label="Status">
                <RedesignedStatusBadge status={status} />
              </td>
              <td data-label="Customer">
                <div className="order-customer">
                  <span className="order-customer-avatar" aria-hidden="true">{guestCustomerLabel(order).split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                  <span className="order-customer-name">{guestCustomerLabel(order)}</span>
                  {!order.customerRegistered && <span className="order-guest-badge" data-testid={`badge-order-guest-${order.id}`}>{t('adminOrders.guest')}</span>}
                </div>
              </td>
              <td data-label="Date & Time">
                <time className="order-created-at" dateTime={order.createdAt}>{exactDateTime(order.createdAt)}</time>
              </td>
              <td className="order-id-action-cell" data-label="Order / Actions" onClick={(e) => e.stopPropagation()}>
                <div className="order-id-actions">
                  <span className="order-id-inline" title={order.id} data-testid={`text-table-order-id-${order.id}`}>{shortId(order.id)}</span>
                  <RowMenu order={order} archived={archived} canArchive={canArchive} canEditStatus={canEditStatus} onSelectOrder={onSelectOrder} onChangeArchive={onChangeArchive} onDeletePermanently={onDeletePermanently} />
                </div>
              </td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>;
}

const swapStatusLabel = (order: Order) => {
  const status = order.manualSettlementState || order.status;
  const labels: Record<string, string> = {
    not_required: 'Awaiting',
    awaiting_funds: 'Awaiting',
    'awaiting funds': 'Awaiting',
    funds_confirmed: 'Confirmed',
    'funds confirmed': 'Confirmed',
    payout_processing: 'Payout processing',
    'payout processing': 'Payout processing',
    payout_sent: 'Payout sent',
    'payout sent': 'Payout sent',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return labels[status.toLowerCase()] || status;
};

function OrderRouteLogo({ order, side, options }: {
  order: Order;
  side: 'source' | 'target';
  options: SettlementOption[];
}) {
  const isSource = side === 'source';
  const asset = isSource ? order.fromAsset : order.toAsset;
  const network = isSource ? order.fromNetwork : order.toNetwork;
  const option = resolveOrderSettlementOption(order, side, options);
  const isPaymentMethod = option?.kind === 'fiat-payment-method' || (!option && isFiatCurrencyCode(asset));
  const displayName = isPaymentMethod
    ? option?.title || network || asset
    : asset;

  return (
    <span className="order-route-logo-frame" title={displayName}>
      {isPaymentMethod
        ? <PaymentMethodLogo name={displayName} logoUrl={option?.logoUrl} className="admin-payment-logo-stack" />
        : <AdminCryptoLogo symbol={asset} logoUrl={option?.logoUrl} size="sm" />}
    </span>
  );
}

function SettlementRouteSide({ order, side, options }: {
  order: Order;
  side: 'source' | 'target';
  options: SettlementOption[];
}) {
  const isSource = side === 'source';
  const asset = isSource ? order.fromAsset : order.toAsset;
  const network = isSource ? order.fromNetwork : order.toNetwork;
  const option = resolveOrderSettlementOption(order, side, options);
  const routeName = option?.kind === 'fiat-payment-method'
    ? option.title
    : option?.networkTitle || option?.title || network || asset;
  const configuredNetworkParts = option?.kind !== 'fiat-payment-method'
    ? [option?.networkTitle?.trim(), option?.routeNetwork?.trim()]
        .filter((value): value is string => Boolean(value))
        .filter((value, index, values) => values.findIndex(candidate => candidate.toLowerCase() === value.toLowerCase()) === index)
    : [];
  const cryptoNetwork = compactOrderNetworkCode(
    option?.routeNetwork,
    network,
    option?.networkSlug,
    option?.networkTitle,
    configuredNetworkParts.join(' · '),
  );
  const isPaymentMethod = option?.kind === 'fiat-payment-method' || (!option && isFiatCurrencyCode(asset));
  const displayName = isPaymentMethod ? option?.title || routeName || asset : asset;
  return <div className="settlement-route-side">
    <span className="order-route-logo-frame">
      {isPaymentMethod
        ? <AdminPaymentLogo name={displayName} currencyCode={asset} logoUrl={option?.logoUrl} />
        : <AdminCryptoLogo symbol={asset} logoUrl={option?.logoUrl} size="sm" />}
    </span>
    <span className="order-route-copy">
      <strong>{displayName}</strong>
      {isPaymentMethod
        ? <span className="order-route-badge">{asset}</span>
        : <CryptoNetworkBadge network={cryptoNetwork} assetSymbol={asset} />}
    </span>
  </div>;
}

function compactOrderNetworkCode(...values: Array<string | null | undefined>) {
  const labels = values.map(value => value?.trim()).filter((value): value is string => Boolean(value));
  for (const label of labels) {
    const code = label.match(/(?:^|[^a-z0-9])((?:bep|erc|trc|brc|src|jetton|spl)[ -]?\d+)(?=$|[^a-z0-9])/iu)?.[1];
    if (code) return code.replace(/[\s-]+/gu, '').toUpperCase();
  }
  return labels[0] || '';
}

function resolveOrderSettlementOption(order: Order, side: 'source' | 'target', options: SettlementOption[]) {

  const source = side === 'source';
  const optionId = source ? order.sourceSettlementOptionId : order.targetSettlementOptionId;
  const asset = source ? order.fromAsset : order.toAsset;
  const network = source ? order.fromNetwork : order.toNetwork;
  const method = source ? order.paymentMethod : order.payoutMethod;
  const direction = source ? 'send' : 'receive';
  const normalizedRouteNames = new Set([network, method]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(value => value.trim().toLowerCase()));

  return options.find(item => sameSettlementOptionId(item.id, optionId))
    || options.find(item =>
      item.assetCode === asset
      && (item.direction === direction || item.direction === 'both')
      && [item.routeNetwork, item.networkTitle, item.title]
        .some(value => Boolean(value && normalizedRouteNames.has(value.trim().toLowerCase()))));
}

function SwapOrderTable({ orders, options, loading, onSelectOrder, selectedIds, onToggleOrder, onToggleAll }: {
  orders: Order[];
  options: SettlementOption[];
  loading: boolean;
  onSelectOrder: (id: string) => void;
} & OrderSelectionProps) {
  const { t } = useI18n();
  if (loading && !orders.length) return <LoadingBlock rows={6} />;
  if (!orders.length) return <div className="table-empty" data-testid="empty-orders"><ArrowDownUp size={20} /><strong>{t('adminOrders.no_swap_orders_match_these_filters')}</strong><span>{t('adminOrders.new_swap_orders_will_show_up_here')}</span></div>;
  const selectedOnPage = orders.filter((order) => selectedIds?.has(order.id)).length;
  return <div className="w-full relative group">
    <div className="swipeable-scroll-hint" aria-hidden="true" />
    <div className="table-wrap" onScroll={(e) => {
      const target = e.target as HTMLElement;
      const hint = target.previousElementSibling as HTMLElement;
      if (hint) {
        hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
        hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
      }
    }}>
      <table className="modern-orders-table" data-testid="table-swap-orders">
        <thead><tr>{onToggleAll && <th className="selection-column"><SelectionCheckbox checked={selectedOnPage === orders.length} indeterminate={selectedOnPage > 0 && selectedOnPage < orders.length} onChange={onToggleAll} label={t('adminOrders.select_all_displayed_swap_orders')} testId="checkbox-select-all-orders" /></th>}<th>{t('adminOrders.order_id')}</th><th>{t('adminOrders.exchange')}</th><th>{t('adminOrders.send')}</th><th>{t('adminOrders.receive')}</th><th>{t('adminOrders.status')}</th><th>{t('adminOrders.user')}</th><th>{t('adminOrders.created_at_2')}</th></tr></thead>
        <tbody>{orders.map(order => <tr key={order.id} data-testid={`row-order-${order.id}`}>
          {onToggleOrder && <td className="selection-column"><SelectionCheckbox checked={Boolean(selectedIds?.has(order.id))} onChange={(selected) => onToggleOrder(order.id, selected)} label={t('adminOrders.select_order_named', { id: order.id })} testId={`checkbox-order-${order.id}`} /></td>}
          <td data-label="Order"><Link href={`/admin/orders/${encodeURIComponent(order.id)}`} className="order-id" onClick={(event) => { event.preventDefault(); onSelectOrder(order.id); }}>{shortId(order.id)}</Link></td>
          <td data-label="Exchange">
            <div className="settlement-route-pair"><SettlementRouteSide order={order} side="source" options={options} /><ArrowRight size={14} /><SettlementRouteSide order={order} side="target" options={options} /></div>
          </td>
          <td data-label="Send"><strong>{number(order.amount)}</strong></td>
          <td data-label="Receive"><strong>{number(order.receiveAmount)}</strong></td>
          <td data-label="Status"><StatusPill status={swapStatusLabel(order)} /></td>
          <td data-label="User">
            {order.customerRegistered
              ? <div><strong>{guestCustomerLabel(order)}</strong><small>{t('adminOrders.registered_user')}</small></div>
              : <div><strong>{t('adminOrders.anonymous')}</strong><small>{order.customerEmail}</small></div>}
          </td>
          <td data-label="Created" className="muted-cell"><span>{exactDateTime(order.createdAt)}</span><small>{ago(order.createdAt)}</small></td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

const manualStatusLabels: Record<OrderBulkStatusInputManualSettlementState, string> = {
  awaiting_funds: 'Awaiting funds',
  funds_confirmed: 'Funds confirmed',
  payout_processing: 'Payout processing',
  payout_sent: 'Payout sent',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const manualProgressStatuses: OrderBulkStatusInputManualSettlementState[] = [
  'awaiting_funds', 'funds_confirmed', 'payout_processing', 'payout_sent', 'completed',
];
const manualTerminalStatuses: Partial<Record<OrderBulkStatusInputManualSettlementState, OrderBulkStatusInputManualSettlementState[]>> = {
  awaiting_funds: ['cancelled', 'failed'],
  funds_confirmed: ['cancelled', 'failed'],
  payout_processing: ['cancelled', 'failed'],
  payout_sent: ['failed'],
};

function availableManualStatuses(current: string): OrderBulkStatusInputManualSettlementState[] {
  const index = manualProgressStatuses.indexOf(current as OrderBulkStatusInputManualSettlementState);
  if (index < 0) return [];
  return [...manualProgressStatuses.slice(index + 1), ...(manualTerminalStatuses[current as OrderBulkStatusInputManualSettlementState] || [])];
}

function normalizedManualStatus(order: Order) {
  return (order.manualSettlementState || order.status).toLowerCase().replaceAll(' ', '_');
}

function commonBulkStatuses(orders: Order[]): OrderBulkStatusInputManualSettlementState[] {
  if (!orders.length) return [];
  return orders.reduce<OrderBulkStatusInputManualSettlementState[]>((common, order, index) => {
    const next = availableManualStatuses(normalizedManualStatus(order));
    return index === 0 ? next : common.filter((status) => next.includes(status));
  }, []);
}

function BulkOrderDialog({ kind, count, statuses, selectedStatus, pending, onStatusChange, onCancel, onConfirm }: {
  kind: 'status' | 'archive' | 'restore' | 'delete';
  count: number;
  statuses: OrderBulkStatusInputManualSettlementState[];
  selectedStatus: OrderBulkStatusInputManualSettlementState | '';
  pending: boolean;
  onStatusChange: (status: OrderBulkStatusInputManualSettlementState) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstControl = dialogRef.current?.querySelector<HTMLElement>('select, button:not([disabled])');
    firstControl?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('select:not([disabled]), button:not([disabled])') || []);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(<div className="bulk-dialog-backdrop" onClick={(event) => event.target === event.currentTarget && !pending && onCancel()}>
    <section ref={dialogRef} className="bulk-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bulk-dialog-title" aria-describedby="bulk-dialog-description" onKeyDown={handleDialogKeyDown}>
      <div className={cn("bulk-dialog-icon", kind === 'delete' && "text-destructive")}>{kind === 'delete' ? <Trash2 size={21} /> : kind === 'archive' ? <Archive size={21} /> : kind === 'restore' ? <ArchiveRestore size={21} /> : <RefreshCw size={21} />}</div>
      <h2 id="bulk-dialog-title">{kind === 'delete' ? `Permanently delete ${count} archived orders?` : kind === 'archive' ? t('adminOrders.archive_selected_orders') : kind === 'restore' ? t('adminOrders.restore_selected_orders') : t('adminOrders.change_selected_order_status')}</h2>
      <p id="bulk-dialog-description">{kind === 'delete'
        ? 'This action cannot be undone.'
        : kind === 'archive'
        ? `${count} selected ${count === 1 ? t('adminOrders.order') : t('adminOrders.orders')} will move to Archived Orders. Nothing is permanently deleted, and an owner can restore them later.`
        : kind === 'restore'
          ? `${count} selected ${count === 1 ? t('adminOrders.order') : t('adminOrders.orders')} will return to Active Orders and become available for operational updates.`
        : `The new status will be applied to ${count} selected ${count === 1 ? t('adminOrders.swap_order') : t('adminOrders.swap_orders')}. Each order keeps its own audit and notification history.`}</p>
      {kind === 'status' && <label><span className="field-label">{t('adminOrders.new_status')}</span><select value={selectedStatus} onChange={(event) => onStatusChange(event.target.value as OrderBulkStatusInputManualSettlementState)} data-testid="select-bulk-status"><option value="">{t('adminOrders.choose_a_status')}</option>{statuses.map((status) => <option value={status} key={status}>{manualStatusLabels[status]}</option>)}</select></label>}
      <div className="bulk-dialog-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={pending}>{t('adminOrders.cancel')}</button>
        <button type="button" className={cn('button', kind === 'delete' ? 'button-danger' : 'button-primary')} onClick={onConfirm} disabled={pending || (kind === 'status' && !selectedStatus)} data-testid={kind === 'delete' ? 'button-confirm-permanent-delete' : kind === 'archive' ? 'button-confirm-bulk-archive' : kind === 'restore' ? 'button-confirm-bulk-restore' : 'button-confirm-bulk-status'}>{pending ? <Loader2 className="spin" size={15} /> : kind === 'delete' ? <Trash2 size={15} /> : kind === 'archive' ? <Archive size={15} /> : kind === 'restore' ? <ArchiveRestore size={15} /> : <Check size={15} />}{pending ? t('adminOrders.applying') : kind === 'delete' ? 'Delete Permanently' : kind === 'archive' ? t('adminOrders.archive_selected') : kind === 'restore' ? t('adminOrders.restore_selected') : t('adminOrders.change_status')}</button>
      </div>
    </section>
  </div>, document.body);
}

function AdminOrders() {
  const { t } = useI18n();
  const { can, isOwner } = useAdminPermissions();
  const { id } = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const currentQueryClient = useQueryClient();
  const query = new URLSearchParams(window.location.search);
  const initialType = query.get('type');
  const initialCreatedFrom = query.get('createdFrom')?.slice(0, 10) ?? '';
  const initialCreatedTo = query.get('createdTo')?.slice(0, 10) ?? '';

  const [status, setStatus] = useState(query.get('status') || '');
  const [type, setType] = useState<'instant' | 'manual'>(initialType === 'instant' ? 'instant' : 'manual');
  const [providerState, setProviderState] = useState('');
  const [fromAsset, setFromAsset] = useState('');
  const [fromNetwork, setFromNetwork] = useState('');
  const [toAsset, setToAsset] = useState('');
  const [toNetwork, setToNetwork] = useState('');
  const [sendMethodId, setSendMethodId] = useState('');
  const [receiveMethodId, setReceiveMethodId] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [rateMode, setRateMode] = useState<'' | QuickexRateMode>('');
  const [outcomeUnknown, setOutcomeUnknown] = useState<'' | 'true' | 'false'>('');
  const [createdFrom, setCreatedFrom] = useState(initialCreatedFrom);
  const [createdTo, setCreatedTo] = useState(initialCreatedTo);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [search, setSearch] = useState('');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [archiveView, setArchiveView] = useState<'active' | 'archived'>(
    query.get('archived') === 'archived' ? 'archived' : 'active',
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDialog, setBulkDialog] = useState<'status' | 'archive' | 'restore' | 'delete' | null>(null);
  const [rowArchiveDialog, setRowArchiveDialog] = useState<{ id: string; recordVersion: number; archived: boolean } | null>(null);
  const [rowDeleteDialog, setRowDeleteDialog] = useState<{ id: string; recordVersion: number } | null>(null);
  const [bulkStatus, setBulkStatus] = useState<OrderBulkStatusInputManualSettlementState | ''>('');
  const [bulkNotice, setBulkNotice] = useState<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const [showFilters, setShowFilters] = useState(false);

  const [exportError, setExportError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  const [debouncedCustomerEmail, setDebouncedCustomerEmail] = useState(customerEmail);
  useEffect(() => { const t = setTimeout(() => setDebouncedCustomerEmail(customerEmail), 350); return () => clearTimeout(t); }, [customerEmail]);
  const [debouncedMin, setDebouncedMin] = useState(minAmount);
  const [debouncedMax, setDebouncedMax] = useState(maxAmount);
  useEffect(() => { const t = setTimeout(() => { setDebouncedMin(minAmount); setDebouncedMax(maxAmount); }, 450); return () => clearTimeout(t); }, [minAmount, maxAmount]);

  const filtersKey = JSON.stringify({ status, type, archiveView, providerState, fromAsset, fromNetwork, toAsset, toNetwork, sendMethodId, receiveMethodId, debouncedCustomerEmail, rateMode, outcomeUnknown, createdFrom, createdTo, debouncedMin, debouncedMax, debouncedSearch, sortDirection, pageSize });
  useEffect(() => { setPage(1); }, [filtersKey]);

  const params = useMemo(() => ({
    status: status || undefined,
    type: type || undefined,
    archived: archiveView,
    providerState: providerState || undefined,
    fromAsset: fromAsset || undefined,
    fromNetwork: fromNetwork || undefined,
    toAsset: toAsset || undefined,
    toNetwork: toNetwork || undefined,
    sourceSettlementOptionId: sendMethodId || undefined,
    targetSettlementOptionId: receiveMethodId || undefined,
    customerEmail: debouncedCustomerEmail || undefined,
    rateMode: rateMode || undefined,
    outcomeUnknown: outcomeUnknown || undefined,
    createdFrom: createdFrom ? new Date(`${createdFrom}T00:00:00.000Z`).toISOString() : undefined,
    createdTo: createdTo ? new Date(`${createdTo}T23:59:59.999Z`).toISOString() : undefined,
    minAmount: debouncedMin ? Number(debouncedMin) : undefined,
    maxAmount: debouncedMax ? Number(debouncedMax) : undefined,
    search: debouncedSearch || undefined,
    sortDirection: sortDirection || undefined,
    page,
    pageSize
  }), [status, type, archiveView, providerState, fromAsset, fromNetwork, toAsset, toNetwork, sendMethodId, receiveMethodId, debouncedCustomerEmail, rateMode, outcomeUnknown, createdFrom, createdTo, debouncedMin, debouncedMax, debouncedSearch, sortDirection, page, pageSize]);

  const orders = useGetOrders(params, {
    query: {
      queryKey: getGetOrdersQueryKey(params),
      refetchInterval: 3_000,
      refetchIntervalInBackground: true,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchOnReconnect: 'always',
    },
  });
  const operators = useGetOperators({ query: { queryKey: getGetOperatorsQueryKey(), retry: false } });
  const bulkStatusMutation = useBulkUpdateOrderStatus();
  const bulkArchiveMutation = useBulkArchiveOrders();
  const permanentDeleteMutation = usePermanentlyDeleteOrders();
  const visibleOrders = orders.data?.items || [];
  const selectedOrders = visibleOrders.filter((order) => selectedIds.has(order.id));
  const commonStatuses = commonBulkStatuses(selectedOrders).filter(opt => {
    if (opt === 'funds_confirmed') return can('orders.confirm_payment');
    if (opt === 'completed') return can('orders.complete');
    if (opt === 'cancelled') return can('orders.cancel');
    return can('orders.status');
  });
  const exchangeConfig = useGetExchangeConfig({ query: { queryKey: getGetExchangeConfigQueryKey() } });
  const settlementOptions = type === 'manual'
    ? exchangeConfig.data?.manualSettlementOptions || []
    : exchangeConfig.data?.instantSettlementOptions || [];
  const sendMethods = settlementOptions.filter(option => option.direction === 'send' || option.direction === 'both');
  const receiveMethods = settlementOptions.filter(option => option.direction === 'receive' || option.direction === 'both');
  const selectOrderType = (nextType: 'instant' | 'manual') => {
    setType(nextType);
    setSendMethodId('');
    setReceiveMethodId('');
    setStatus('');
  };
  const openOrder = (rowId: string) => {
    const orderContext = new URLSearchParams(window.location.search);
    orderContext.set('type', type);
    setLocation(`/admin/orders/${encodeURIComponent(rowId)}?${orderContext.toString()}`);
  };
  const closeOrder = () => {
    setLocation(`/admin/orders${window.location.search}`, { replace: true });
  };

  const clearFilters = () => {
    setStatus(''); setProviderState(''); setFromAsset(''); setFromNetwork(''); setToAsset(''); setToNetwork('');
    setSendMethodId(''); setReceiveMethodId(''); setCustomerEmail('');
    setRateMode(''); setOutcomeUnknown(''); setCreatedFrom(''); setCreatedTo('');
    setMinAmount(''); setMaxAmount(''); setSearch(''); setSortDirection('desc');
  };
  const activeFilterCount = [
    status, providerState, fromAsset, fromNetwork, toAsset, toNetwork, sendMethodId, receiveMethodId, customerEmail,
    rateMode, outcomeUnknown, createdFrom, createdTo, minAmount, maxAmount, search,
  ].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0 || sortDirection !== 'desc';

  const visibleVersionKey = visibleOrders.map((order) => `${order.id}:${order.recordVersion}`).join('|');
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkDialog(null);
    setBulkStatus('');
  }, [filtersKey, page, visibleVersionKey]);

  const toggleOrder = (id: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id); else next.delete(id);
      return next;
    });
    setBulkNotice(null);
  };
  const toggleAll = (selected: boolean) => {
    setSelectedIds(selected ? new Set(visibleOrders.map((order) => order.id)) : new Set());
    setBulkNotice(null);
  };
  const refreshAfterBulk = async () => {
    await Promise.all([
      currentQueryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() }),
      currentQueryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }),
    ]);
  };
  const summarizeBulkResult = (response: OrderBulkMutationResponse, action: string) => {
    const succeeded = response.results.filter((result) => result.success);
    const failed = response.results.filter((result) => !result.success);
    const failureSummary = failed.slice(0, 3).map((result) => `${shortId(result.id)}: ${result.error || result.code || 'Could not update'}`).join(' · ');
    setBulkNotice({
      kind: failed.length ? (succeeded.length ? 'warning' : 'error') : 'success',
      text: failed.length
        ? `${succeeded.length} ${action}; ${failed.length} failed. ${failureSummary}`
        : `${succeeded.length} ${action} successfully.`,
    });
  };
  const applyBulkStatus = () => {
    if (!bulkStatus || !selectedOrders.length) return;
    bulkStatusMutation.mutate({ data: {
      items: selectedOrders.map((order) => ({ id: order.id, recordVersion: order.recordVersion })),
      manualSettlementState: bulkStatus,
    } }, {
      onSuccess: async (response) => {
        summarizeBulkResult(response, 'updated');
        setSelectedIds(new Set());
        setBulkDialog(null);
        setBulkStatus('');
        await refreshAfterBulk();
      },
      onError: (error) => setBulkNotice({ kind: 'error', text: apiErrorText(error, t('adminOrders.the_selected_statuses_could_not_be_updated')) }),
    });
  };
  const applySingleArchive = () => {
    if (!rowArchiveDialog) return;
    bulkArchiveMutation.mutate({
      data: {
        items: [{ id: rowArchiveDialog.id, recordVersion: rowArchiveDialog.recordVersion }],
        archived: rowArchiveDialog.archived,
      },
    }, {
      onSuccess: async (response) => {
        summarizeBulkResult(response, rowArchiveDialog.archived ? 'archived' : 'restored');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(rowArchiveDialog.id);
          return next;
        });
        setRowArchiveDialog(null);
        await refreshAfterBulk();
      },
      onError: (error) => {
        const action = rowArchiveDialog.archived ? 'archived' : 'restored';
        setRowArchiveDialog(null);
        setBulkNotice({ kind: 'error', text: apiErrorText(error, `The order could not be ${action}.`) });
      },
    });
  };

  const applyBulkArchive = (archived: boolean) => {
    if (!selectedOrders.length) return;
    bulkArchiveMutation.mutate({ data: {
      items: selectedOrders.map((order) => ({ id: order.id, recordVersion: order.recordVersion })),
      archived,
    } }, {
      onSuccess: async (response) => {
        summarizeBulkResult(response, archived ? 'archived' : 'restored');
        setSelectedIds(new Set());
        setBulkDialog(null);
        await refreshAfterBulk();
      },
      onError: (error) => setBulkNotice({ kind: 'error', text: apiErrorText(error, archived ? 'The selected orders could not be archived.' : 'The selected orders could not be restored.') }),
    });
  };

  const applyPermanentDelete = (items: Array<{ id: string; recordVersion: number }> = selectedOrders) => {
    if (!items.length || archiveView !== 'archived') return;
    permanentDeleteMutation.mutate({ data: {
      items: items.map((order) => ({ id: order.id, recordVersion: order.recordVersion })),
    } }, {
      onSuccess: async (response) => {
        summarizeBulkResult(response, 'permanently deleted');
        const deletedIds = new Set(response.results.filter((result) => result.success).map((result) => result.id));
        currentQueryClient.setQueryData(getGetOrdersQueryKey(params), (current: typeof orders.data) => current ? {
          ...current,
          items: current.items.filter((order) => !deletedIds.has(order.id)),
          total: Math.max(0, current.total - deletedIds.size),
        } : current);
        setSelectedIds(new Set());
        setBulkDialog(null);
        setRowDeleteDialog(null);
        await refreshAfterBulk();
      },
      onError: (error) => {
        setRowDeleteDialog(null);
        setBulkNotice({ kind: 'error', text: apiErrorText(error, 'The archived orders could not be permanently deleted.') });
      },
    });
  };

  const changeOrderArchive = (id: string, recordVersion: number, archived: boolean) => {
    if (!can(PermissionKey.ordersarchive)) return;
    setRowArchiveDialog({ id, recordVersion, archived });
  };
  const requestPermanentDelete = (id: string, recordVersion: number) => {
    if (archiveView !== 'archived' || !can(PermissionKey.ordersarchive)) return;
    setRowDeleteDialog({ id, recordVersion });
  };

  const handleExport = async () => {
    setExportError('');
    setIsExporting(true);
    try {
      const xml = await queryClient.fetchQuery({ queryKey: getGetOrdersXmlQueryKey(), queryFn: () => getOrdersXml() });
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders-${new Date().toISOString().split('T')[0]}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError('The XML export could not be prepared. Try again in a moment.');
    } finally {
      setIsExporting(false);
    }
  };

  return <AdminShell eyebrow={t('adminOrders.operations_orders')} title={t('adminOrders.all_orders')} requiredPermission="orders.view">
    <div className="admin-orders-page">
    {exportError && <InlineNotice kind="error" onDismiss={() => setExportError('')}><strong>{t('adminOrders.export_failed')}</strong><p>{exportError}</p><button className="button button-secondary mt-3" onClick={handleExport}><RefreshCw size={14} />{t('adminOrders.try_again')}</button></InlineNotice>}
    {bulkNotice && <div className="mb-4" data-testid="notice-bulk-result"><InlineNotice kind={bulkNotice.kind} onDismiss={() => setBulkNotice(null)}>{bulkNotice.text}</InlineNotice></div>}
    {orders.data?.refreshUnavailable && <div className="mb-4"><InlineNotice kind="warning"><strong>{t('adminOrders.provider_refresh_unavailable')}</strong><p>{t('adminOrders.latest_status_could_not_be_fetched_from')}</p></InlineNotice></div>}

    <div className="orders-view-controls mb-4">
      <div className="product-switch" role="tablist" aria-label={t('adminOrders.order_type')}>
        <button type="button" role="tab" aria-selected={type === 'manual'} className={cn(type === 'manual' && 'active')} onClick={() => selectOrderType('manual')} data-testid="tab-orders-swap">{t('adminOrders.swap')}</button>
        <button type="button" role="tab" aria-selected={type === 'instant'} className={cn(type === 'instant' && 'active')} onClick={() => selectOrderType('instant')} data-testid="tab-orders-convert">{t('adminOrders.convert')}</button>
      </div>
      <div className="orders-archive-actions">
        <div className="archive-switch" role="tablist" aria-label={t('adminOrders.archive_view')}>
          <button type="button" role="tab" aria-selected={archiveView === 'active'} className={cn(archiveView === 'active' && 'active')} onClick={() => setArchiveView('active')} data-testid="tab-orders-active">{t('adminOrders.active_orders')}</button>
          <button type="button" role="tab" aria-selected={archiveView === 'archived'} className={cn(archiveView === 'archived' && 'active')} onClick={() => setArchiveView('archived')} data-testid="tab-orders-archived"><Archive size={14} /> {t('adminOrders.archived_orders')}</button>
        </div>
        {can('orders.export') && (
          <button type="button" onClick={handleExport} disabled={isExporting} className="orders-export-button" data-testid="button-export">
            {isExporting ? <Loader2 className="spin" size={14} /> : <Download size={14} />}
            {isExporting ? t('adminOrders.preparing') : t('adminOrders.export_xml')}
          </button>
        )}
      </div>
    </div>

    <div className="panel orders-panel rise-in">
      <div className="flex flex-col gap-3 p-4 border-b border-border bg-muted/20">
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0">
            <AdminSearch
              value={search}
              onChange={setSearch}
              placeholder={t('adminOrders.search_orders')}
              testId="input-filter-search"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={cn("button button-secondary flex items-center gap-2", showFilters && "bg-muted")} data-testid="button-toggle-filters"><Filter size={15} /> {t('adminOrders.filters')}{activeFilterCount > 0 && <span className="nav-count">{activeFilterCount}</span>}</button>
          {hasFilters && <button onClick={clearFilters} className="button button-secondary" aria-label={t('adminOrders.clear_filters')}><X size={15} /></button>}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <label><span className="field-label">{t('adminOrders.status')}</span><select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-filter-status" className="!bg-background"><option value="">{t('adminOrders.all_statuses')}</option>{type === 'manual' ? <><option value="awaiting funds">{t('adminOrders.awaiting')}</option><option value="funds confirmed">{t('adminOrders.confirmed')}</option><option value="payout processing">{t('adminOrders.payout_processing')}</option><option value="payout sent">{t('adminOrders.payout_sent')}</option><option value="completed">{t('adminOrders.completed')}</option><option value="failed">{t('adminOrders.failed')}</option><option value="cancelled">{t('adminOrders.cancelled')}</option></> : <><option value="active">{t('adminOrders.active_all_non_terminal')}</option><option value="awaiting deposit">{t('adminOrders.awaiting_deposit')}</option><option value="deposit received">{t('adminOrders.deposit_received')}</option><option value="exchanging">{t('adminOrders.exchanging')}</option><option value="sending payout">{t('adminOrders.sending_payout')}</option><option value="on hold">{t('adminOrders.on_hold')}</option><option value="verification required">{t('adminOrders.verification_required')}</option><option value="pending">{t('adminOrders.pending')}</option><option value="completed">{t('adminOrders.completed')}</option><option value="refunded">{t('adminOrders.refunded')}</option><option value="expired">{t('adminOrders.expired')}</option><option value="failed">{t('adminOrders.failed')}</option><option value="cancelled">{t('adminOrders.cancelled')}</option></>}</select></label>
            <label><span className="field-label">{t('adminOrders.send_method')}</span><SettlementOptionCombobox value={sendMethodId} options={sendMethods} onChange={setSendMethodId} label={t('adminOrders.send_method')} testId="select-filter-send-method" allowAny paymentMethodFirst searchAppearance="admin" /></label>
            <label><span className="field-label">{t('adminOrders.receive_method')}</span><SettlementOptionCombobox value={receiveMethodId} options={receiveMethods} onChange={setReceiveMethodId} label={t('adminOrders.receive_method')} testId="select-filter-receive-method" allowAny paymentMethodFirst searchAppearance="admin" /></label>
            <label><span className="field-label">{t('adminOrders.user_email')}</span><input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder={t('adminOrders.user_example_com')} data-testid="input-filter-customer-email" className="!bg-background" /></label>
            <select value={rateMode} onChange={(e) => setRateMode(e.target.value as '' | QuickexRateMode)} data-testid="select-filter-ratemode" className="!bg-background"><option value="">{t('adminOrders.any_rate')}</option><option value="FLOATING">{t('adminOrders.floating')}</option><option value="FIXED">{t('adminOrders.fixed')}</option></select>
            <select value={outcomeUnknown} onChange={(e) => setOutcomeUnknown(e.target.value as '' | 'true' | 'false')} data-testid="select-filter-outcome" className="!bg-background"><option value="">{t('adminOrders.any_outcome')}</option><option value="true">{t('adminOrders.unknown_held')}</option><option value="false">{t('adminOrders.known')}</option></select>
            <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder={t('adminOrders.min_amount')} type="number" step="any" data-testid="input-filter-minamount" className="!bg-background" />
            <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder={t('adminOrders.max_amount')} type="number" step="any" data-testid="input-filter-maxamount" className="!bg-background" />
            <input value={providerState} onChange={(e) => setProviderState(e.target.value)} placeholder={t('adminOrders.provider_state')} data-testid="input-filter-providerstate" className="!bg-background" />
            <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as 'desc' | 'asc')} data-testid="select-filter-sort" className="!bg-background"><option value="desc">{t('adminOrders.newest_first')}</option><option value="asc">{t('adminOrders.oldest_first')}</option></select>
            <label><span className="field-label">{t('adminOrders.created_from')}</span><input value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} type="date" className="!bg-background text-xs" data-testid="input-filter-createdfrom" /></label>
            <label><span className="field-label">{t('adminOrders.created_to')}</span><input value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} type="date" className="!bg-background text-xs" data-testid="input-filter-createdto" /></label>
          </div>
        )}
      </div>

      {selectedOrders.length > 0 && <>
        <div className="bulk-actions-toolbar visible admin-list-bulk-toolbar" data-testid="bulk-actions-bar">
          <div className="bulk-actions-inner">
            <span className="bulk-actions-count" data-testid="bulk-selected-count"><Check size={14} /> {selectedOrders.length} {selectedOrders.length === 1 ? t('adminOrders.order_selected') : t('adminOrders.orders_selected')}</span>
            {can('orders.status') && <>
              <div className="bulk-actions-divider" />
              <button type="button" onClick={() => { setBulkStatus(''); setBulkDialog('status'); }} disabled={type === 'instant' || archiveView === 'archived' || commonStatuses.length === 0} title={type === 'instant' ? t('adminOrders.convert_statuses_provider_synchronized') : commonStatuses.length === 0 ? t('adminOrders.selected_orders_no_shared_later_status') : undefined} data-testid="button-bulk-status"><RefreshCw size={14} /> {t('adminOrders.change_status_2')}</button>
            </>}
            {can(PermissionKey.ordersarchive) && <>
              <div className="bulk-actions-divider" />
              {archiveView === 'active'
                ? <button type="button" onClick={() => setBulkDialog('archive')} data-testid="button-bulk-archive"><Archive size={14} /> Archive Selected</button>
                : <>
                    <button type="button" onClick={() => setBulkDialog('restore')} data-testid="button-bulk-restore"><ArchiveRestore size={14} /> Restore Selected</button>
                    <button type="button" className="bulk-actions-delete" onClick={() => setBulkDialog('delete')} data-testid="button-bulk-delete"><Trash2 size={14} /> Delete Selected</button>
                  </>}
            </>}
            <div className="bulk-actions-divider" />
            <button type="button" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection"><X size={14} /> {t('adminOrders.clear_selection')}</button>
          </div>
        </div>
        {type === 'instant' && <small className="bulk-actions-context">{t('adminOrders.convert_statuses_are_synchronized_from_the_provider')}</small>}
        {type === 'manual' && commonStatuses.length === 0 && <small className="bulk-actions-context">{t('adminOrders.the_selected_swap_orders_do_not_share')}</small>}
      </>}

      {orders.isError ? <ErrorState message={t('adminOrders.load_order_queue_error')} retry={() => orders.refetch()} /> :
        <RedesignedOrderTable orders={visibleOrders} options={settlementOptions} type={type} loading={orders.isLoading} onSelectOrder={openOrder} selectedIds={selectedIds} onToggleOrder={toggleOrder} onToggleAll={toggleAll} archived={archiveView === 'archived'} canArchive={can(PermissionKey.ordersarchive)} canEditStatus={can('orders.status')} onChangeArchive={changeOrderArchive} onDeletePermanently={requestPermanentDelete} />}

      <div className="panel-footer flex justify-between items-center bg-muted/10 p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground">{t('adminOrders.showing')}{orders.data?.items.length || 0} {t('adminOrders.of')}{orders.data?.total || 0} {t('adminOrders.orders')}</span>
          {orders.isFetching && !orders.isLoading && <span className="refresh-label text-xs"><RefreshCw className="spin inline mr-1" size={12} /> {t('adminOrders.syncing')}</span>}
        </div>
        <div className="flex items-center gap-2">
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="text-xs !py-1 !pl-2 !pr-6 !h-8 !bg-background w-auto" data-testid="select-pagesize">
            <option value={10}>{t('adminOrders.10_per_page')}</option>
            <option value={20}>{t('adminOrders.20_per_page')}</option>
            <option value={50}>{t('adminOrders.50_per_page')}</option>
            <option value={100}>{t('adminOrders.100_per_page')}</option>
          </select>
          <div className="flex bg-background border border-border rounded-md overflow-hidden">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed border-r border-border transition-colors text-xs font-bold" data-testid="button-page-prev">{t('adminOrders.prev')}</button>
            <span className="px-3 py-1.5 text-xs font-bold font-mono bg-muted/30">{page}</span>
            <button disabled={!orders.data || page * pageSize >= orders.data.total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed border-l border-border transition-colors text-xs font-bold" data-testid="button-page-next">{t('adminOrders.next')}</button>
          </div>
        </div>
      </div>
    </div>
    {bulkDialog && <BulkOrderDialog kind={bulkDialog} count={selectedOrders.length} statuses={commonStatuses} selectedStatus={bulkStatus} pending={bulkStatusMutation.isPending || bulkArchiveMutation.isPending || permanentDeleteMutation.isPending} onStatusChange={setBulkStatus} onCancel={() => setBulkDialog(null)} onConfirm={bulkDialog === 'status' ? applyBulkStatus : bulkDialog === 'delete' ? () => applyPermanentDelete() : () => applyBulkArchive(bulkDialog === 'archive')} />}
    {rowArchiveDialog && <BulkOrderDialog kind={rowArchiveDialog.archived ? 'archive' : 'restore'} count={1} statuses={[]} selectedStatus="" pending={bulkArchiveMutation.isPending} onStatusChange={() => {}} onCancel={() => setRowArchiveDialog(null)} onConfirm={applySingleArchive} />}
    {rowDeleteDialog && <BulkOrderDialog kind="delete" count={1} statuses={[]} selectedStatus="" pending={permanentDeleteMutation.isPending} onStatusChange={() => {}} onCancel={() => setRowDeleteDialog(null)} onConfirm={() => applyPermanentDelete([rowDeleteDialog])} />}
    </div>
    {id && <OrderDrawer id={id} onClose={closeOrder} />}
  </AdminShell>;
}
const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const humanKey = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function flattenDetails(value: unknown, prefix = ''): Array<[string, string]> {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenDetails(item, `${prefix} ${index + 1}`.trim()));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      flattenDetails(nested, `${prefix} ${humanKey(key)}`.trim()));
  }
  return [[prefix || 'Value', typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)]];
}

const hiddenPaymentMetadataLabels = [
  'id',
  'kind',
  'title',
  'asset id',
  'asset code',
  'network id',
  'network name',
  'required memo',
  'requires memo',
  'address',
  'confirmation guidance',
  'confirmation guidelines',
  'required confirmations',
];

function isHiddenPaymentMetadataLabel(label: string) {
  const normalized = label.trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ').replace(/\s+/g, ' ');
  return hiddenPaymentMetadataLabels.some((hidden) => normalized === hidden || normalized.endsWith(` ${hidden}`));
}

function OperationalSettlementCard({ order, side }: { order: Order; side: 'send' | 'receive' }) {
  const { t } = useI18n();
  const send = side === 'send';
  const snapshot = recordOf(order.settlementSnapshot);
  const route = recordOf(snapshot.route);
  const details = recordOf(order.settlementDetails);
  const aliases = send ? ['send', 'source', 'from', 'funding'] : ['receive', 'target', 'to', 'payout', 'destination'];
  const dynamic = aliases.flatMap((key) => [
    ...flattenDetails(snapshot[key]),
    ...flattenDetails(route[key]),
    ...flattenDetails(details[key]),
  ]);
  const claimed = new Set(aliases);
  const shared = Object.entries(details)
    .filter(([key]) => !claimed.has(key))
    .flatMap(([key, value]) => flattenDetails(value, humanKey(key)));

  const asset = send ? order.fromAsset : order.toAsset;
  const amount = send ? order.amount : order.receiveAmount;
  const method = send ? (order.paymentMethod || order.fromNetwork || order.sourceSettlementOptionId) : (order.payoutMethod || order.toNetwork || order.targetSettlementOptionId);
  const fiatRoute = isFiatCurrencyCode(asset);

  const rows: Array<[string, string | undefined | null]> = send ? [
    ['Deposit address', order.depositAddress],
    ['Deposit memo / tag', order.depositMemo],
    ['Refund address', order.refundAddress],
    ['Refund memo / tag', order.refundMemo],
  ] : [
    ['Destination address', order.destinationAddress],
    ['Destination memo / tag', order.destinationMemo],
  ];

  return <div className="settlement-route-card" data-testid={`card-${side}-details`}>
    <div className="settlement-route-header">
      <div className={cn('route-icon', 'admin-route-logo', fiatRoute && 'admin-route-payment-logo')}>
        <AdminAssetIdentity
          symbol={asset}
          network={method}
          size="lg"
          compact
          className="order-detail-settlement-identity"
        />
      </div>
      <div className="route-info">
        <strong>{number(amount)} {asset}</strong>
        <span>{method || 'Unknown routing'}</span>
      </div>
      <div className="route-badge">{send ? t('adminOrders.funding') : t('adminOrders.payout')}</div>
    </div>
    <dl className="settlement-route-details">
      {rows.filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="break-anywhere">{value}</dd></div>)}
      {[...dynamic, ...(send ? [] : shared)].filter(([label]) => !isHiddenPaymentMetadataLabel(label)).map(([label, value], index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd className="break-anywhere">{String(value)}</dd></div>)}
    </dl>
  </div>;
}

function OperationalProgress({ order }: { order: Order }) {
  const { t } = useI18n();
  const manual = order.type === 'manual';
  const steps = manual
    ? [['awaiting_funds', 'Awaiting funds'], ['funds_confirmed', 'Funds confirmed'], ['payout_processing', 'Payout processing'], ['payout_sent', 'Payout sent'], ['completed', 'Completed']]
    : [['created', 'Order created'], ['received', 'Deposit received'], ['exchanging', 'Exchanging'], ['payout', 'Sending payout'], ['completed', 'Completed']];
  const status = (order.manualSettlementState || order.status).toLowerCase().replaceAll(' ', '_');
  const terminal = /failed|cancelled|expired|refunded/.test(status);
  let current = manual ? steps.findIndex(([key]) => key === status)
    : /complete/.test(status) ? 4 : /send|withdraw|payout/.test(status) ? 3 : /exchang|process/.test(status) ? 2 : /received|confirm/.test(status) ? 1 : 0;
  if (current < 0) current = 0;
  return <section className="order-progress" data-testid="order-status-progression">
    <div className="order-route-heading"><span className="section-kicker">{manual ? t('adminOrders.manual_swap_settlement_desk') : t('adminOrders.convert_order_provider_route')}</span></div>
    <div className="order-route-amounts">
      <div><small>{t('adminOrders.customer_sends')}</small><AdminAssetIdentity symbol={order.fromAsset} network={order.fromNetwork} size="lg" compact className="order-detail-asset-identity" /><strong>{number(order.amount)} {order.fromAsset}</strong></div>
      <ArrowRight size={22} />
      <div><small>{t('adminOrders.customer_receives')}</small><AdminAssetIdentity symbol={order.toAsset} network={order.toNetwork} size="lg" compact className="order-detail-asset-identity" /><strong>{number(order.receiveAmount)} {order.toAsset}</strong></div>
    </div>
    {terminal && <strong className="order-stopped">{t('adminOrders.order_stopped')}</strong>}
    <div className={cn('operations-timeline', terminal && 'terminal')}>{steps.map(([, label], index) =>
      <div key={label} className={cn('operations-step', index < current && 'complete', index === current && 'current')}><span>{index < current ? <Check size={13} /> : index + 1}</span><strong>{label}</strong></div>)}</div>
  </section>;
}

// --- REDESIGNED ORDER DRAWER INJECTED BELOW ---
function safeConvertWalletUri(order: Order) {
  const records = [
    recordOf(order.fundingDetails),
    recordOf(order.settlementDetails),
    recordOf(order.settlementSnapshot),
  ];
  const directKeys = ['walletUri', 'walletURI', 'paymentUri', 'paymentURI', 'deepLink', 'openInWalletUrl'];
  const candidates = [order.depositAddress, ...records.flatMap((record) => directKeys.map((key) => record[key]))]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));

  return candidates.find((value) => {
    const trimmed = value.trim();
    if (/^https:\/\//i.test(trimmed)) return true;
    return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^(javascript|data|file):/i.test(trimmed);
  })?.trim() || null;
}

function compactOrderAmount(value: string, asset: string) {
  const formatted = number(value);
  if (formatted.length <= 10) return `${formatted} ${asset}`;
  return `${formatted.slice(0, 6)}… ${asset}`;
}

function DetailRow({
  label,
  value,
  copyable,
  mono,
  testId,
  valueTestId,
  clipboardValue,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
  testId?: string;
  valueTestId?: string;
  clipboardValue?: string;
}) {
  const { t } = useI18n();
  if (!value) return null;
  const copy = () => {
    navigator.clipboard.writeText(clipboardValue ?? value);
  };
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-white/5 last:border-0">
      <span className="text-[11px] text-slate-500 dark:text-white/50">{label}</span>
      <div className="flex items-center gap-2 max-w-[65%]">
        <span className={cn("text-[12px] font-medium text-slate-900 dark:text-white truncate", mono && "font-mono")} title={value} data-testid={valueTestId}>{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={copy}
            className="text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/70 transition-colors"
            data-testid={testId}
            aria-label={t('adminOrders.copy_named_value', { label })}
          >
            <Copy size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function Accordion({ id, label, icon: Icon, activeTab, openSection, setOpenSection, children }: any) {
  const isOpen = activeTab === 'details' ? openSection === id : activeTab === id;
  const isVisible = activeTab === 'details' || activeTab === id;

  if (!isVisible) return null;

  return (
    <div className={cn("border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] rounded-[16px] overflow-hidden mb-3", !isOpen && "hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors")}>
      {activeTab === 'details' && (
        <button type="button" onClick={() => setOpenSection(isOpen ? '' : id)} className="w-full flex items-center justify-between p-4 bg-transparent text-slate-900 dark:text-white" aria-expanded={isOpen} aria-controls={`accordion-content-${id}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-200 dark:bg-white/5 text-slate-600 dark:text-white/70">
              <Icon size={14} />
            </div>
            <span className="text-[13px] font-bold">{label}</span>
          </div>
          <ChevronDown size={14} className={cn("text-slate-400 dark:text-white/50 transition-transform", isOpen && "rotate-180")} />
        </button>
      )}
      {isOpen && (
        <div id={`accordion-content-${id}`} className={cn("p-4", activeTab === 'details' && "pt-0 border-t border-slate-200 dark:border-white/5 mt-2")}>
          {children}
        </div>
      )}
    </div>
  );
}

function ExchangeDetailsCard({
  order,
  sourceOption,
  targetOption,
}: {
  order: Order;
  sourceOption?: SettlementOption;
  targetOption?: SettlementOption;
}) {
  const pricingSnapshot = recordOf(order.pricingSnapshot);
  const reference = recordOf(pricingSnapshot.reference);
  const sourceReference = recordOf(reference.source);
  const targetReference = recordOf(reference.target);
  const sendMethod = sourceOption?.kind === 'fiat-payment-method'
    ? sourceOption.title
    : compactOrderNetworkCode(sourceOption?.routeNetwork, order.fromNetwork, sourceOption?.networkTitle) || order.paymentMethod || 'Route unavailable';
  const receiveMethod = targetOption?.kind === 'fiat-payment-method'
    ? targetOption.title
    : compactOrderNetworkCode(targetOption?.routeNetwork, order.toNetwork, targetOption?.networkTitle) || order.payoutMethod || 'Route unavailable';
  const usdValue = (amount: string, unitsPerUsd: unknown) => {
    if (typeof unitsPerUsd !== 'string' || !/^\d+(?:\.\d+)?$/.test(amount) || !/^\d+(?:\.\d+)?$/.test(unitsPerUsd)) return null;
    const decimal = (value: string) => {
      const [whole, fraction = ''] = value.split('.');
      return { units: BigInt(`${whole}${fraction}`), scale: fraction.length };
    };
    const amountDecimal = decimal(amount);
    const rateDecimal = decimal(unitsPerUsd);
    if (rateDecimal.units <= 0n) return null;
    const numerator = amountDecimal.units * (10n ** BigInt(rateDecimal.scale)) * 100n;
    const denominator = rateDecimal.units * (10n ** BigInt(amountDecimal.scale));
    const cents = (numerator + denominator / 2n) / denominator;
    return formatExactUsd(`${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`);
  };
  const sendUsd = usdValue(order.amount, sourceReference.unitsPerUsd);
  const receiveUsd = usdValue(order.receiveAmount, targetReference.unitsPerUsd);

  const side = (
    direction: 'send' | 'receive',
    option: SettlementOption | undefined,
    method: string,
    usd: string | null,
  ) => {
    const sending = direction === 'send';
    const asset = sending ? order.fromAsset : order.toAsset;
    const amount = sending ? order.amount : order.receiveAmount;
    const paymentMethod = option?.kind === 'fiat-payment-method';
    return (
      <div className={cn(
        'min-w-0 rounded-xl border p-3',
        sending ? 'quickx-send-card' : 'quickx-receive-card',
      )}>
        <span className={cn('text-[9px] font-black uppercase tracking-[0.16em]', sending ? 'text-cyan-300' : 'text-violet-300')}>
          {sending ? 'You Send' : 'You Receive'}
        </span>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <span className="shrink-0">
            {paymentMethod
              ? <AdminPaymentLogo name={option?.title || method} currencyCode={asset} logoUrl={option?.logoUrl} />
              : isFiatCurrencyCode(asset)
                ? <FiatCurrencyFlag code={asset} flagUrl={option?.flagUrl} variant="admin" />
                : <AdminCryptoLogo symbol={asset} logoUrl={option?.logoUrl} size="md" />}
          </span>
          <div className="min-w-0">
            <strong className="quickx-important-value block truncate text-[13px] font-black" title={`${number(amount)} ${asset}`}>{number(amount)} {asset}</strong>
            <span className="block truncate text-[10px] text-white/45">{usd || 'USD value unavailable'}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      className="quickx-exchange-card relative overflow-hidden rounded-2xl border p-4"
      data-testid="exchange-details-card"
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-black text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-400/25 bg-indigo-400/10 text-cyan-300"><ArrowDownUp size={14} /></span>
          Exchange Details
        </h3>
        <time dateTime={order.createdAt} className="flex items-center gap-1.5 text-right text-[9px] font-semibold text-white/45">
          <CalendarDays size={11} /> {exactDateTime(order.createdAt)}
        </time>
      </div>

      <div className="relative grid grid-cols-2 gap-3">
        {side('send', sourceOption, sendMethod, sendUsd)}
        <span className="absolute left-1/2 top-1/2 z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-indigo-300/35 bg-[#12182a] text-indigo-200 shadow-lg" aria-hidden="true">
          <ArrowRight size={13} />
        </span>
        {side('receive', targetOption, receiveMethod, receiveUsd)}
      </div>

      <div className="mt-3">
        <div className="quickx-rate-card min-w-0 rounded-lg border p-2">
          <span className="block text-[8px] font-bold uppercase tracking-wider text-white/35">Exchange Rate</span>
          <strong className="quickx-important-value mt-1 block truncate text-[9px]" title={order.finalRate ? `1 ${order.fromAsset} = ${number(order.finalRate)} ${order.toAsset}` : 'Not available'}>
            {order.finalRate ? `1 ${order.fromAsset} = ${number(order.finalRate)} ${order.toAsset}` : 'Not available'}
          </strong>
        </div>
      </div>
    </section>
  );
}

function OrderDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const { can } = useAdminPermissions();
  const currentQueryClient = useQueryClient();
  const orderQuery = useGetOrder(id, { query: {
    queryKey: getGetOrderQueryKey(id),
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  } });
  const exchangeConfig = useGetExchangeConfig({ query: { queryKey: getGetExchangeConfigQueryKey() } });
  const history = useGetOrderAuditLog(id, { query: {
    queryKey: getGetOrderAuditLogQueryKey(id),
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  } });
  const operators = useGetOperators({ query: { queryKey: getGetOperatorsQueryKey(), retry: false } });
  const updateOrder = useUpdateOrder();
  const assignment = useAssignOrder();
  const archive = useArchiveOrder();
  const restore = useRestoreOrder();
  const reconcileOrder = useReconcileOrder();

  const [manualState, setManualState] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [selfClaimedOperatorId, setSelfClaimedOperatorId] = useState('');
  const [notice, setNotice] = useState<{ kind: 'error' | 'success' | 'warning'; text: string } | null>(null);
  const [reconciliationNotice, setReconciliationNotice] = useState<{ kind: 'error' | 'success' | 'warning'; text: string } | null>(null);
  const [copyInfoCopied, setCopyInfoCopied] = useState(false);
  const [paymentDetailsDraft, setPaymentDetailsDraft] = useState({
    name: '', iban: '', bankName: '', bicSwift: '', paymentReference: '', amount: '', customInstructions: '',
  });
  const [paymentDetailsEditing, setPaymentDetailsEditing] = useState(false);
  const [paymentDetailsDirty, setPaymentDetailsDirty] = useState(false);

  const order = orderQuery.data;
  const settlementOptions = order?.type === 'manual'
    ? exchangeConfig.data?.manualSettlementOptions || exchangeConfig.data?.settlementOptions || []
    : exchangeConfig.data?.instantSettlementOptions || exchangeConfig.data?.settlementOptions || [];
  const activeOperators = (operators.data || []).filter((item) => item.status === 'active');
  const manualLifecycle = order?.type === 'manual' && order.manualSettlementState !== 'not_required';
  const baseManualStateOptions = manualLifecycle && order
    ? [normalizedManualStatus(order) as OrderBulkStatusInputManualSettlementState, ...availableManualStatuses(normalizedManualStatus(order))]
    : [];
  const manualStateOptions = baseManualStateOptions.filter(opt => {
    if (opt === (order ? normalizedManualStatus(order) : '')) return true;
    if (opt === 'funds_confirmed') return can('orders.confirm_payment');
    if (opt === 'completed') return can('orders.complete');
    if (opt === 'cancelled') return can('orders.cancel');
    return can('orders.status');
  });

  const canReconcile = order?.provider === 'Quickex' && Boolean(order.outcomeUnknown || order.status === 'verification required');
  const reconciliationAttempts = useGetOrderReconciliationAttempts(id, {
    query: { queryKey: getGetOrderReconciliationAttemptsQueryKey(id), enabled: canReconcile },
  });

  const statusRef = useRef<HTMLDivElement>(null);
  const copyInfoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!order) return;
    setManualState(order.manualSettlementState || 'awaiting_funds');
    setAssigneeId(order.assignedOperatorId || '');
    const details = order.paymentDetails || {};
    setPaymentDetailsDraft({
      name: details.name || '', iban: details.iban || '', bankName: details.bankName || '',
      bicSwift: details.bicSwift || '', paymentReference: details.paymentReference || '',
      amount: details.amount || '', customInstructions: details.customInstructions || '',
    });
    setPaymentDetailsEditing(false);
    setPaymentDetailsDirty(false);
  }, [order?.id, order?.recordVersion]);

  useEffect(() => {
    setNotice(null);
    setReconciliationNotice(null);
    setSelfClaimedOperatorId('');
    setCopyInfoCopied(false);
    if (copyInfoTimerRef.current !== null) window.clearTimeout(copyInfoTimerRef.current);
  }, [id]);

  useEffect(() => () => {
    if (copyInfoTimerRef.current !== null) window.clearTimeout(copyInfoTimerRef.current);
  }, []);

  const [supportToolsDirty, setSupportToolsDirty] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleBack = useCallback(() => {
    if (supportToolsDirty || paymentDetailsDirty) {
      if (!window.confirm("You have unsaved order changes. Discard them?")) return;
    }
    setSupportToolsDirty(false);
    setShowSettings(false);
  }, [supportToolsDirty, paymentDetailsDirty]);

  const hasSettingsAccess = can(PermissionKey.orderssupport_tools) || can(PermissionKey.ordersarchive);

  const handleClose = useCallback(() => {
    if (supportToolsDirty || paymentDetailsDirty) {
      if (!window.confirm("You have unsaved order changes. Discard them?")) {
        return;
      }
    }
    onClose();
  }, [onClose, supportToolsDirty, paymentDetailsDirty]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKeyDown); };
  }, [handleClose]);

  useEffect(() => {
    if (!supportToolsDirty && !paymentDetailsDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [supportToolsDirty, paymentDetailsDirty]);

  const refresh = async () => {
    await Promise.all([
      currentQueryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) }),
      currentQueryClient.invalidateQueries({ queryKey: getGetOrderAuditLogQueryKey(id) }),
      currentQueryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() }),
      currentQueryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }),
    ]);
  };

  const failed = (error: unknown) => {
    setNotice({ kind: 'error', text: apiErrorText(error, t('adminOrders.this_action_is_not_allowed_or_the')) });
    orderQuery.refetch();
    history.refetch();
  };

  const save = () => {
    if (!order) return;
    setNotice(null);
    updateOrder.mutate({ id, data: { recordVersion: order.recordVersion, manualSettlementState: manualLifecycle ? manualState as any : undefined } }, {
      onSuccess: async (updated) => {
        if (!order.assignedOperatorId && updated.assignedOperatorId) setSelfClaimedOperatorId(updated.assignedOperatorId);
        setNotice({ kind: 'success', text: t('adminOrders.order_changes_saved') });
        await refresh();
      },
      onError: failed,
    });
  };

  const savePaymentDetails = () => {
    if (!order) return;
    const hasValue = Object.values(paymentDetailsDraft).some(value => value.trim());
    updateOrder.mutate({
      id,
      data: { recordVersion: order.recordVersion, paymentDetails: hasValue ? paymentDetailsDraft : null },
    }, {
      onSuccess: async () => {
        setPaymentDetailsEditing(false);
        setPaymentDetailsDirty(false);
        setNotice({ kind: 'success', text: 'Payment details saved.' });
        await refresh();
      },
      onError: failed,
    });
  };

  const clearPaymentDetails = () => {
    if (!order || !window.confirm('Clear all saved payment details for this order?')) return;
    updateOrder.mutate({
      id,
      data: { recordVersion: order.recordVersion, paymentDetails: null },
    }, {
      onSuccess: async () => {
        setPaymentDetailsDraft({ name: '', iban: '', bankName: '', bicSwift: '', paymentReference: '', amount: '', customInstructions: '' });
        setPaymentDetailsEditing(false);
        setPaymentDetailsDirty(false);
        setNotice({ kind: 'success', text: 'Payment details cleared.' });
        await refresh();
      },
      onError: failed,
    });
  };

  const saveAssignment = (newAssigneeId: string) => {
    if (!order) return;
    setAssigneeId(newAssigneeId);
    setNotice(null);
    assignment.mutate({ id, data: { recordVersion: order.recordVersion, assigneeOperatorId: newAssigneeId || null } }, {
      onSuccess: async () => { setNotice({ kind: 'success', text: newAssigneeId ? 'Order assignment updated.' : 'Order is now unassigned.' }); await refresh(); },
      onError: failed
    });
  };

  const toggleArchive = () => {
    if (!order) return;
    setNotice(null);
    const action = order.archivedAt ? restore : archive;
    action.mutate({ id, data: { recordVersion: order.recordVersion } }, { onSuccess: async () => { setNotice({ kind: 'success', text: order.archivedAt ? 'Order restored.' : 'Order archived.' }); await refresh(); }, onError: failed });
  };

  const reconcile = () => {
    if (!order) return;
    setReconciliationNotice(null);
    reconcileOrder.mutate({ id: order.id, data: { recordVersion: order.recordVersion } }, {
      onSuccess: (result) => { setReconciliationNotice({ kind: 'success', text: result.message }); refresh(); reconciliationAttempts.refetch(); },
      onError: (error) => {
        const code = apiErrorData(error)?.code;
        setReconciliationNotice({ kind: code === 'PROVIDER_RECONCILIATION_UNAVAILABLE' ? 'warning' : 'error', text: code === 'PROVIDER_RECONCILIATION_UNAVAILABLE' ? apiErrorText(error, t('adminOrders.the_provider_is_unavailable_no_provider_order')) : apiErrorText(error, t('adminOrders.the_order_changed_or_synchronization_is_already')) });
        refresh(); reconciliationAttempts.refetch();
      },
    });
  };

  const copyValue = (val?: string | null) => { if (val) navigator.clipboard.writeText(val); };

  const getUniqueDetailRows = () => {
    if (!order) return [];
    const snapshot = recordOf(order.settlementSnapshot);
    const route = recordOf(snapshot.route);
    const details = recordOf(order.settlementDetails);
    const sendAliases = ['send', 'source', 'from', 'funding'];
    const receiveAliases = ['receive', 'target', 'to', 'payout', 'destination'];
    const sendDynamic = sendAliases.flatMap((key) => [...flattenDetails(snapshot[key]), ...flattenDetails(route[key]), ...flattenDetails(details[key])]);
    const receiveDynamic = receiveAliases.flatMap((key) => [...flattenDetails(snapshot[key]), ...flattenDetails(route[key]), ...flattenDetails(details[key])]);
    const claimed = new Set([...sendAliases, ...receiveAliases]);
    const sharedDynamic = Object.entries(details).filter(([key]) => !claimed.has(key)).flatMap(([key, value]) => flattenDetails(value, humanKey(key)));
    const fundingDynamic = order.fundingDetails ? flattenDetails(order.fundingDetails) : [];
    const rawRows: Array<[string, string | undefined | null]> = [
      ['Contact email', order.customerEmail], ['Destination address', order.destinationAddress], ['Destination memo / tag', order.destinationMemo],
      ['Deposit address', order.depositAddress], ['Deposit memo / tag', order.depositMemo], ['Refund address', order.refundAddress],
      ['Refund memo / tag', order.refundMemo], ...sendDynamic, ...receiveDynamic, ...sharedDynamic, ...fundingDynamic,
    ];
    const hiddenLabels = new Set(['incoming tx ref', 'incoming transaction reference', 'outgoing tx ref', 'outgoing transaction reference', 'customer safe note', 'internal note', 'note', 'order id', 'provider order id']);
    const validRows = rawRows.filter((row): row is [string, string] =>
      (row[0] === 'Refund address' || Boolean(row[1]))
      && !hiddenLabels.has(row[0].trim().toLowerCase())
      && !isHiddenPaymentMetadataLabel(row[0]));
    const seen = new Set<string>();
    return validRows.filter(([k, v]) => { const key = `${k.toLowerCase()}:${v}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .map(([label, value]) => [label, label === 'Refund address' && !value?.trim() ? 'Not provided' : value] as [string, string]);
  };
  const detailRows = getUniqueDetailRows();
  const paymentDetailRows = detailRows
    .map(([label, value]) => [humanKey(label).replace(/\bTarget\b/gi, '').replace(/\s+/g, ' ').trim(), value] as [string, string])
    .filter(([label]) => Boolean(label));

  if (orderQuery.isLoading) return <div className="fixed inset-0 z-50 flex sm:justify-end bg-black/40 backdrop-blur-sm"><aside className="w-full sm:w-[480px] sm:max-w-full h-full bg-background border-l border-border flex flex-col shadow-2xl"><div className="p-12"><LoadingBlock rows={10} /></div></aside></div>;
  if (orderQuery.isError || !order) return <div className="fixed inset-0 z-50 flex sm:justify-end bg-black/40 backdrop-blur-sm"><aside className="w-full sm:w-[480px] sm:max-w-full h-full bg-background border-l border-border flex flex-col shadow-2xl"><div className="p-12"><ErrorState message="Error loading order" retry={() => orderQuery.refetch()} /></div></aside></div>;

  const normalizedStatus = (order.manualSettlementState || order.status).toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  const terminal = /failed|cancelled|expired|refunded/.test(normalizedStatus);
  let steps = ['Created', 'Processing', 'Done'];
  let currentStep = 0;
  if (order.type === 'manual') {
    if (/awaiting_funds|not_required|pending/.test(normalizedStatus)) currentStep = 0;
    else if (/complete|finished/.test(normalizedStatus)) currentStep = 2;
    else currentStep = 1;
  } else {
    steps = ['Awaiting deposit', 'Awaiting confirmations', 'Exchanging', 'Sending', 'Done'];
    currentStep = /complete|finished/.test(normalizedStatus) ? 4 : /send|withdraw|payout/.test(normalizedStatus) ? 3 : /exchang|process/.test(normalizedStatus) ? 2 : /received|confirm/.test(normalizedStatus) ? 1 : 0;
  }
  const currentStatusTone = /complete|paid|finished/.test(normalizedStatus)
    ? 'border-emerald-400 text-emerald-300'
    : /awaiting_funds|awaiting_deposit/.test(normalizedStatus)
      ? 'border-amber-400 text-amber-300'
      : currentStep === 0
        ? 'border-blue-400 text-blue-300'
        : 'border-violet-400 text-violet-300';
  const currentStatusTextTone = /complete|paid|finished/.test(normalizedStatus)
    ? 'text-emerald-300'
    : /awaiting_funds|awaiting_deposit/.test(normalizedStatus)
      ? 'text-amber-300'
      : currentStep === 0
        ? 'text-blue-300'
        : 'text-violet-300';

  const sourceOption = resolveOrderSettlementOption(order, 'source', settlementOptions);
  const targetOption = resolveOrderSettlementOption(order, 'target', settlementOptions);
  const sendMethod = sourceOption?.kind === 'fiat-payment-method' ? sourceOption.title : sourceOption?.networkTitle || sourceOption?.routeNetwork || order.paymentMethod || order.fromNetwork || 'Route unavailable';
  const receiveMethod = targetOption?.kind === 'fiat-payment-method' ? targetOption.title : targetOption?.networkTitle || targetOption?.routeNetwork || order.payoutMethod || order.toNetwork || 'Route unavailable';
  const orderAddress = order.destinationAddress || order.depositAddress || order.refundAddress || (typeof recordOf(order.fundingDetails).address === 'string' ? String(recordOf(order.fundingDetails).address) : '');

  const providerDisplay = order.fundingProviderSource === 'whitebit'
    ? 'WhiteBIT'
    : order.fundingProviderSource === 'manual'
      ? 'Manual Only'
      : order.fundingProviderSource === 'none'
        ? 'None'
        : order.fundingProviderSource || '—';
  const addressSourceMap: Record<string, string> = {
    live_api: 'LIVE API',
    manual_fallback: 'MANUAL FALLBACK',
    manual_only: 'MANUAL ONLY',
    unavailable: 'UNAVAILABLE'
  };
  const addressSourceDisplay = order.fundingAddressSource ? (addressSourceMap[order.fundingAddressSource] || order.fundingAddressSource) : '—';

  const orderInfoRows: Array<[string, string, string?]> = [
    ['User', order.customerName || order.customerEmail || 'Guest'],
    ['Order ID', order.id],
    ['Sending Address', order.depositAddress || '—'],
    ['Selected Provider', providerDisplay, 'order-funding-provider'],
    ['Address Source', addressSourceDisplay, 'order-funding-source'],
    ['Created At', exactDateTime(order.createdAt)],
    ['Rate', order.finalRate ? `1 ${order.fromAsset} = ${number(order.finalRate)} ${order.toAsset}` : 'Not available'],
  ];

  const copyPaymentDetails = () => {
    const rows: Array<[string, string]> = [
      ['Send status', currentStep === 0 ? 'Awaiting customer deposit' : 'Deposit confirmed'],
      ['Send amount', `${number(order.amount)} ${order.fromAsset}`],
      ['Send method / network', sendMethod],
      ['Send estimated arrival', 'Not available'],
      ...(order.totalCommission ? [['Provider fee', `${number(order.totalCommission)} ${order.fromAsset}`] as [string, string]] : []),
      ...(order.depositAddress ? [['Deposit address', order.depositAddress] as [string, string]] : []),
      ['Receive status', currentStep >= 3 ? 'Payout complete' : 'Awaiting payout'],
      ['Receive amount', `${number(order.receiveAmount)} ${order.toAsset}`],
      ['Receive method / network', receiveMethod],
      ['Receive estimated arrival', 'Not available'],
      ...(order.destinationAddress ? [['Destination address', order.destinationAddress] as [string, string]] : []),
      ...paymentDetailRows.filter(([label, value]) => !(label === 'Refund address' && value === 'Not provided')),
    ];
    const text = rows
      .filter((row, index) => rows.findIndex(([label, value]) => label === row[0] && value === row[1]) === index)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');
    if (!text) return;
    navigator.clipboard.writeText(text);
    setNotice({ kind: 'success', text: 'Payment details copied.' });
  };
  const copyOrderInfoAll = () => {
    const text = orderInfoRows.map(([lbl, val]) => `${lbl}: ${val}`).join('\n');
    navigator.clipboard.writeText(text);
    setNotice({ kind: 'success', text: 'Order information copied.' });
  };
  const copyOrderInfo = async () => {
    const normalizedPaymentRows = paymentDetailRows.map(([label, value]) => ({
      label: label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
      value,
    }));
    const paymentValue = (patterns: RegExp[], excluded: RegExp = /$^/) =>
      normalizedPaymentRows.find(row => patterns.some(pattern => pattern.test(row.label)) && !excluded.test(row.label))?.value;
    const bankName = paymentValue([/\bbank name\b/, /\bpayment method\b/, /\bpayout method\b/])
      || (targetOption?.kind === 'fiat-payment-method' ? targetOption.title : null)
      || order.payoutMethod
      || 'Not available';
    const bankDetail = paymentValue(
      [/\biban\b/, /\bbank detail\b/, /\baccount number\b/, /\bbank account\b/, /^account$/],
      /\b(?:crypto|wallet|network|address|memo|transaction|tx)\b/,
    ) || 'Not available';
    const paymentDescription = paymentValue(
      [/\bpayment description\b/, /\bpayment reference\b/, /\btransfer reference\b/, /^reference$/, /^description$/],
      /\b(?:provider|order|transaction|tx|crypto|wallet|network)\b/,
    ) || 'Not available';
    const text = [
      `Name: ${order.customerName || 'Not available'}`,
      `Bank Name: ${bankName}`,
      `Bank Detail: ${bankDetail}`,
      `Payment Description: ${paymentDescription}`,
      `Amount: ${number(order.receiveAmount)} ${order.toAsset}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyInfoCopied(true);
      if (copyInfoTimerRef.current !== null) window.clearTimeout(copyInfoTimerRef.current);
      copyInfoTimerRef.current = window.setTimeout(() => {
        setCopyInfoCopied(false);
        copyInfoTimerRef.current = null;
      }, 1500);
    } catch {
      setNotice({ kind: 'error', text: 'Could not copy payout information.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex sm:justify-end bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <aside
        className="quickx-view-order w-full sm:w-[480px] sm:max-w-full h-[100dvh] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
        role="dialog" aria-modal="true" aria-label="View order"
        data-testid="order-details-drawer"
      >
        {/* 1. Header */}
        <header className="quickx-order-header flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b">
          <div className="flex min-w-0 items-center gap-2">
            {showSettings && (
              <button type="button" onClick={handleBack} className="p-1 -ml-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Back" data-testid="button-back-settings">
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 className="truncate text-lg font-bold tracking-tight text-foreground">{showSettings ? 'Order Settings' : 'View order'}</h2>
          </div>
          <button type="button" onClick={handleClose} className="p-2 -mr-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" data-testid="button-close-order-drawer" aria-label={t('adminOrders.close_order_details')} autoFocus>
            <X size={18} />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-5 sm:py-6 space-y-8 scrollbar-thin">
          {notice && <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice>}
          {order.archivedAt && <InlineNotice kind="warning"><strong>This order is archived.</strong> Restore it before changing assignment or settlement.</InlineNotice>}
          {!showSettings ? (
            <>

          {/* 2. Assignment & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
            <div className="flex items-center gap-2 text-sm">
               <span className="quickx-secondary-label text-muted-foreground font-medium">Assigned to:</span>
               {can('orders.assign') && !can(PermissionKey.orderssupport_tools) ? (
                  <DropdownMenuPrimitive.Root>
                    <DropdownMenuPrimitive.Trigger className="font-bold text-primary hover:underline outline-none flex items-center gap-1" data-testid="select-order-assignee">
                      {activeOperators.find(op => op.id === assigneeId)?.email || 'Unassigned'} <ChevronDown size={14} />
                    </DropdownMenuPrimitive.Trigger>
                    <DropdownMenuPrimitive.Portal>
                      <DropdownMenuPrimitive.Content className="z-[100] min-w-[160px] p-1 bg-card border border-border rounded-lg shadow-md" align="start">
                        <DropdownMenuPrimitive.Item className="flex items-center w-full p-2 text-sm font-medium rounded-md hover:bg-muted cursor-pointer outline-none" onClick={() => saveAssignment('')}>
                          Unassigned {!assigneeId && <Check size={14} className="ml-auto" />}
                        </DropdownMenuPrimitive.Item>
                        {activeOperators.map(op => (
                          <DropdownMenuPrimitive.Item key={op.id} className="flex items-center w-full p-2 text-sm font-medium rounded-md hover:bg-muted cursor-pointer outline-none" onClick={() => saveAssignment(op.id)}>
                            {op.email} {assigneeId === op.id && <Check size={14} className="ml-auto" />}
                          </DropdownMenuPrimitive.Item>
                        ))}
                      </DropdownMenuPrimitive.Content>
                    </DropdownMenuPrimitive.Portal>
                  </DropdownMenuPrimitive.Root>
               ) : (
                  <strong className="text-foreground">{activeOperators.find(o => o.id === order.assignedOperatorId)?.email || 'Unassigned'}</strong>
               )}
            </div>
            <div className="flex items-center gap-2">
               {hasSettingsAccess && (
                 <button type="button" onClick={() => setShowSettings(true)} className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-all" title="Order Settings" data-testid="button-order-settings">
                   <Settings size={16} />
                 </button>
               )}
            </div>
          </div>

          {/* 3. Horizontal order-status progression */}
          <div className="w-full overflow-x-auto pb-1" data-testid="order-status-progression">
            <div className="flex min-w-[420px] items-center justify-between" data-testid={order.type !== 'manual' ? 'convert-processing-steps' : undefined}>
            {steps.map((label, i) => {
              const complete = !terminal && i < currentStep;
              const current = !terminal && i === currentStep;
              const failed = terminal && i === currentStep;
              return (
                <div key={label} className="flex flex-col items-center gap-2 flex-1 relative">
                  {i !== 0 && <div className={cn("absolute top-3 left-0 w-1/2 h-[2px] -translate-x-1/2 -translate-y-1/2", complete || current ? "bg-emerald-500" : "bg-muted")} />}
                  {i !== steps.length - 1 && <div className={cn("absolute top-3 right-0 w-1/2 h-[2px] translate-x-1/2 -translate-y-1/2", complete ? "bg-emerald-500" : "bg-muted")} />}
                  <div className={cn(
                    "relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 bg-card",
                    complete ? "border-emerald-400 text-emerald-400" : current
                      ? cn("quickx-status-active", currentStatusTone)
                      : failed ? "quickx-status-active border-red-500 text-red-400" : "border-white/10 text-white/30"
                  )}>
                    {complete ? <Check size={12} strokeWidth={3} /> : failed ? <X size={12} strokeWidth={3} /> : (i + 1)}
                  </div>
                  <span className={cn(
                     "quickx-progress-label text-[10px] text-center font-bold tracking-wide uppercase leading-tight max-w-[80px]",
                     complete ? "text-emerald-300" : current ? currentStatusTextTone : failed ? "text-red-400" : "text-white/30"
                  )}>
                    {failed ? humanKey(normalizedStatus) : label}
                  </span>
                </div>
              );
            })}
            </div>
          </div>

          {/* 4. Order Information */}
          <div className="space-y-3">
             <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-foreground">Order Information</h3>
                <button type="button" onClick={copyOrderInfoAll} className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"><Copy size={12} /> Copy All</button>
             </div>
             <div className="quickx-order-card border rounded-xl p-1 shadow-sm">
                {orderInfoRows.map(([lbl, val, testId], idx) => (
                  <div key={lbl} className={cn("flex items-center justify-between p-3", idx !== orderInfoRows.length - 1 && "border-b border-border/50")}>
                     <span className="quickx-field-label text-xs text-muted-foreground">{lbl}</span>
                     <div className="flex items-center gap-2">
                       <span className="quickx-important-value text-xs font-bold truncate max-w-[200px]" title={val} data-testid={testId}>{val}</span>
                        <button type="button" onClick={() => copyValue(val)} className="text-muted-foreground hover:text-foreground" title={`Copy ${lbl}`}><Copy size={12} /></button>
                     </div>
                  </div>
                ))}
             </div>
          </div>

          <ExchangeDetailsCard
            order={order}
            sourceOption={sourceOption}
            targetOption={targetOption}
          />

          {/* Remaining existing fields */}
          <div className="space-y-6 pt-4 border-t border-border">
              {order.paymentDetailsApplicable && (
                <div className="quickx-order-card border rounded-xl p-4 shadow-sm space-y-4" data-testid="admin-payment-details">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="quickx-section-label text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Details / Payment Instructions</h4>
                    {can(PermissionKey.ordersdetails) && !paymentDetailsEditing && (
                      <button type="button" className="button button-secondary px-3 py-1.5 text-xs" onClick={() => setPaymentDetailsEditing(true)} data-testid="button-edit-payment-details">Edit</button>
                    )}
                  </div>
                  {order.customerMarkedPaidAt && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400" data-testid="admin-customer-marked-paid">Customer marked paid: {exactDateTime(order.customerMarkedPaidAt)}</p>
                  )}
                  {can(PermissionKey.ordersdetails) && paymentDetailsEditing ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([
                        ['name', 'Name'], ['iban', 'IBAN'], ['bankName', 'Bank Name'], ['bicSwift', 'BIC / SWIFT'],
                        ['paymentReference', 'Payment Description / Reference'], ['amount', 'Amount'],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="space-y-1 text-xs font-semibold text-muted-foreground">
                          <span>{label}</span>
                          <input value={paymentDetailsDraft[key]} onChange={event => {
                            setPaymentDetailsDraft(previous => ({ ...previous, [key]: event.target.value }));
                            setPaymentDetailsDirty(true);
                          }} className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" data-testid={`input-payment-details-${key}`} />
                        </label>
                      ))}
                      <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
                        <span>Custom Instructions / Note</span>
                        <textarea value={paymentDetailsDraft.customInstructions} onChange={event => {
                          setPaymentDetailsDraft(previous => ({ ...previous, customInstructions: event.target.value }));
                          setPaymentDetailsDirty(true);
                        }} rows={3} className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" data-testid="input-payment-details-custom-instructions" />
                      </label>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button type="button" className="button button-primary px-4 py-2 text-xs" onClick={savePaymentDetails} disabled={updateOrder.isPending} data-testid="button-save-payment-details">Save</button>
                        <button type="button" className="button button-secondary px-4 py-2 text-xs" onClick={clearPaymentDetails} disabled={updateOrder.isPending} data-testid="button-clear-payment-details">Clear</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {Object.entries(paymentDetailsDraft).some(([, value]) => value.trim()) ? (
                        Object.entries(paymentDetailsDraft).filter(([, value]) => value.trim()).map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-3 border-b border-border/50 py-2 last:border-0">
                            <span className="text-muted-foreground">{humanKey(key)}</span><span className="whitespace-pre-wrap text-right font-medium">{value}</span>
                          </div>
                        ))
                      ) : <span className="text-muted-foreground">No payment details configured.</span>}
                    </div>
                  )}
                </div>
              )}
             {/* Payment details not yet shown */}
             {paymentDetailRows.length > 0 && (
               <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="quickx-section-label text-xs font-bold uppercase tracking-wider text-muted-foreground">Additional Payment Details</h4>
                    <button type="button" onClick={copyPaymentDetails} className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1" data-testid="button-copy-all-payment-details"><Copy size={12} /> Copy All</button>
                  </div>
                  <div className="quickx-order-card border rounded-xl p-1 shadow-sm">
                    {paymentDetailRows.map(([lbl, val], idx) => (
                      <div key={lbl} className={cn("flex items-center justify-between p-3", idx !== paymentDetailRows.length - 1 && "border-b border-border/50")}>
                         <span className="quickx-field-label text-xs text-muted-foreground">{lbl}</span>
                         <div className="flex items-center gap-2">
                            <span className={cn("text-xs font-bold truncate max-w-[200px]", /bank name|payment description/i.test(lbl) ? "quickx-important-value" : "text-foreground")} title={val}>{val}</span>
                             {!(lbl === 'Refund address' && val === 'Not provided') && <button type="button" onClick={() => copyValue(val)} className="text-muted-foreground hover:text-foreground"><Copy size={12} /></button>}
                         </div>
                      </div>
                    ))}
                  </div>
               </div>
             )}

             {/* Manual Status Edit */}
             {order.type === 'manual' && manualLifecycle && manualStateOptions.length > 1 && !can(PermissionKey.orderssupport_tools) && (
               <div ref={statusRef} className="quickx-order-card quickx-manual-status border p-4 rounded-xl shadow-sm space-y-3">
                 <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Update Manual Status</h4>
                 <div className="flex gap-2">
                   <select value={manualState} onChange={e => setManualState(e.target.value)} disabled={Boolean(order.archivedAt) || manualStateOptions.length <= 1} className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm text-foreground focus:outline-none focus:border-primary" data-testid="select-edit-manual-state">
                     {manualStateOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                   </select>
                   <button type="button" onClick={save} disabled={updateOrder.isPending || Boolean(order.archivedAt)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold shadow-sm hover:opacity-90 disabled:opacity-50" data-testid="button-save-order">
                     {updateOrder.isPending ? "Saving..." : "Save"}
                   </button>
                 </div>
               </div>
             )}

             {/* Reconcile */}
             {canReconcile && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-3">
                   <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Unresolved Provider Outcome</h4>
                   {reconciliationNotice && <p className="text-xs font-medium text-amber-900 dark:text-amber-200">{reconciliationNotice.text}</p>}
                   <button type="button" onClick={reconcile} disabled={reconcileOrder.isPending} className="w-full px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-sm disabled:opacity-50" data-testid="button-reconcile">
                     {reconcileOrder.isPending ? "Reconciling..." : "Reconcile with Provider"}
                   </button>
                </div>
             )}

             {/* Notes */}
             {can('orders.notes') && (
               <div className="space-y-3">
                   <h4 className="quickx-section-label text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</h4>
                  <div className="quickx-order-card border p-4 rounded-xl shadow-sm text-sm text-white/55">
                      {order.customerSafeNote || "No customer-visible notes available."}
                  </div>
               </div>
             )}

             {/* Reconciliation Attempts History */}
             {canReconcile && reconciliationAttempts.data?.items && reconciliationAttempts.data.items.length > 0 && (
                <div className="space-y-3 pb-8">
                    <h4 className="quickx-section-label text-xs font-bold uppercase tracking-wider text-muted-foreground">Reconciliation Attempts</h4>
                    <div className="quickx-order-card border rounded-xl p-4 shadow-sm space-y-3" data-testid="reconciliation-history">
                      {reconciliationAttempts.data.items.map((attempt) => {
                         const isAccepted = attempt.outcome === 'accepted';
                         const isUnavailable = attempt.outcome === 'provider_unavailable';
                         return (
                           <article key={attempt.id} className={cn('rounded-lg border p-3 text-xs', isAccepted ? 'border-emerald-500/30 bg-emerald-500/5' : isUnavailable ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5')}>
                             <div className="flex items-center justify-between mb-2">
                               <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', isAccepted ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : isUnavailable ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-red-500/20 text-red-600 dark:text-red-400')}>
                                 {isAccepted ? 'Accepted' : isUnavailable ? 'Unavailable' : 'Conflict'}
                               </span>
                               <time className="text-muted-foreground text-[10px]">{exactDateTime(attempt.createdAt)}</time>
                             </div>
                             <div className="flex justify-between mt-1"><span className="text-muted-foreground">Operator</span><span className="font-semibold">{attempt.operator}</span></div>
                             <div className="flex justify-between mt-1"><span className="text-muted-foreground">Request ID</span><span className="font-mono text-[10px]">{attempt.requestId ?? 'N/A'}</span></div>
                           </article>
                         );
                      })}
                   </div>
                </div>
             )}
          </div>
            </>
          ) : (
            <div className="space-y-6">
              {can(PermissionKey.orderssupport_tools) && (
                <OrderSupportToolsSection
                  order={order}
                  activeOperators={activeOperators}
                  refresh={refresh}
                  onNotice={setNotice}
                  onDirtyChange={setSupportToolsDirty}
                />
              )}
              {can(PermissionKey.ordersarchive) && (
                <div className="quickx-order-card border p-5 rounded-xl shadow-sm space-y-4">
                  <div>
                    <h4 className="text-sm font-bold tracking-tight text-foreground">Archive Order</h4>
                    <p className="text-xs text-muted-foreground mt-1">Archiving an order hides it from default views. It can be restored later.</p>
                  </div>
                  <button onClick={toggleArchive} disabled={archive.isPending || restore.isPending} className="flex items-center justify-center w-full sm:w-auto px-4 py-2 gap-2 rounded-md bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors" data-testid={order.archivedAt ? 'button-restore-order' : 'button-archive-order'}>
                    {order.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    {order.archivedAt ? 'Restore Order' : 'Archive Order'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <footer className="quickx-order-footer flex shrink-0 items-center gap-3 border-t px-4 sm:px-6 py-4">
          {!showSettings ? (
            <>
              <button type="button" onClick={copyOrderInfo} className="button button-secondary flex-1" data-testid="button-copy-order-info"><Copy size={14} /> {copyInfoCopied ? 'Copied ✓' : 'Copy Info'}</button>
              <button type="button" onClick={handleClose} className="button button-primary flex-1" data-testid="button-close-footer">Close</button>
            </>
          ) : (
            <button type="button" onClick={handleBack} className="button button-primary flex-1" data-testid="button-done-settings">Done</button>
          )}
        </footer>
      </aside>
    </div>
  );
}

// --- REDESIGNED ORDER DRAWER END ---
function AdminCustomers() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const params = useMemo(() => ({ search: search || undefined }), [search]);
  const customers = useGetCustomers(params, { query: { queryKey: getGetCustomersQueryKey(params) } });

  return <AdminShell
    eyebrow={t('adminCore.operations_crm')}
    title={t('adminCore.customers')}
    requiredPermission="customers.view"
  >
    <div className="admin-page-actions customers-page-actions">
      <div className="customer-search">
        <AdminSearch
          value={search}
          onChange={setSearch}
          placeholder={t('adminCore.search_by_name_or_email')}
          debounceMs={300}
          testId="input-customer-search"
        />
      </div>
    </div>
    <div className="panel customers-panel rise-in">
      {customers.isError ? <ErrorState message={t('adminCore.load_customers_error')} retry={() => customers.refetch()} /> : customers.isLoading ? <LoadingBlock rows={6} /> : !customers.data?.items.length ? <div className="table-empty" data-testid="empty-customers"><Users size={20} /><strong>{t('adminCore.no_customers_found')}</strong></div> : <div className="w-full relative group">
        <div className="swipeable-scroll-hint" aria-hidden="true" />
        <div className="table-wrap" onScroll={(e) => {
          const target = e.target as HTMLElement;
          const hint = target.previousElementSibling as HTMLElement;
          if (hint) {
            hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
            hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
          }
        }}>
          <table className="data-table" data-testid="table-customers">
            <thead><tr><th>{t('adminCore.customer')}</th><th>{t('adminCore.orders')}</th><th>{t('adminCore.volume')}</th><th>{t('adminCore.last_activity')}</th><th>{t('adminCore.status')}</th></tr></thead>
            <tbody>{customers.data.items.map((customer) => <tr
          key={customer.id}
          data-testid={`row-customer-${customer.id}`}
          onClick={() => setLocation(`/admin/customers/${customer.id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setLocation(`/admin/customers/${customer.id}`);
            }
          }}
          tabIndex={0}
          className="cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <td><div className="customer-cell"><div className="avatar">{customer.name?.slice(0, 1) || customer.email.slice(0, 1).toUpperCase()}</div><div><strong>{customer.name || customer.email}</strong><small>{customer.name ? customer.email : t('adminCore.no_name_provided')}</small></div></div></td>
          <td><strong>{number(customer.ordersCount, 0)}</strong><small>{t('adminCore.lifetime')}</small></td>
          <td><strong>{money(customer.volume)}</strong><small>{t('adminCore.settled')}</small></td>
          <td className="muted-cell">{ago(customer.lastActivity)}</td>
          <td><StatusPill status={customer.status || 'Active'} /></td>
        </tr>)}</tbody>
      </table>
        </div>
      </div>}
      <div className="panel-footer"><span>{t('adminCore.showing')}{customers.data?.total || 0} {t('adminCore.records')}</span></div>
    </div>
  </AdminShell>;
}

function AdminProviders() {
  const { t, formatDate } = useI18n();
  const { can, isOwner } = useAdminPermissions();
  const canTestCredentials = isOwner && can('integrations.credentials.test');
  const health = useGetQuickexCredentials({
    query: { queryKey: getGetQuickexCredentialsQueryKey(), refetchInterval: 30000 },
  });
  const connectionTest = useTestQuickexCredentials();
  const whitebit = useGetWhitebitProviderStatus({
    query: { queryKey: getGetWhitebitProviderStatusQueryKey(), refetchInterval: 30000 },
  });
  const whitebitToggle = useUpdateWhitebitProviderStatus();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ kind: 'error' | 'success' | 'warning'; text: string } | null>(null);

  const test = () => {
    setNotice(null);
    connectionTest.mutate(undefined, {
      onSuccess: (data) => setNotice({ kind: data.ok ? 'success' : 'error', text: data.message }),
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, t('adminCore.test_failed_to_run')) }),
    });
  };

  const status = health.data;
  const whitebitStatus = whitebit.data;
  const reconciliationWarning = quickexReconciliationWarning(status?.reconciliation, formatDate);
  return <AdminShell eyebrow={t('adminCore.operations_settings')} title={t('adminCore.provider_health')} requiredPermission="integrations.view">
    <div className="panel providers-panel provider-health-card rise-in">
      <div className="panel-heading provider-health-heading"><div><span className="section-kicker">{t('adminCore.exchange_integration')}</span><h2>{t('adminCore.connection_status')}</h2><p>{t('adminCore.credential_readiness_and_live_provider_capabilities')}</p></div><div className="provider-health-actions">{status && <span className="secure-badge provider-verified-badge"><BadgeCheck size={14} /> {status.mode.toUpperCase()}</span>}{canTestCredentials && <button className="button provider-diagnostics-button" disabled={connectionTest.isPending || health.isLoading} onClick={test} data-testid="button-test-provider">{connectionTest.isPending ? <Loader2 className="spin" size={15} /> : <Activity size={15} />} {connectionTest.isPending ? t('adminCore.running_diagnostics') : t('adminCore.run_diagnostics')}</button>}</div></div>
      {notice && <div className="mt-4"><InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice></div>}
      {reconciliationWarning && <div className="mt-4" data-testid="warning-provider-reconciliation"><InlineNotice kind="warning">{reconciliationWarning}</InlineNotice></div>}
      {health.isLoading ? <div className="mt-6"><LoadingBlock rows={3} /></div> : health.isError ? <ErrorState message={t('adminProviders.load_provider_configuration_error')} retry={() => health.refetch()} /> : status && <div className="provider-grid">
        <div className="provider-config"><h3>{t('adminCore.credentials')}</h3><div className="config-list">
          <div className="config-item provider-health-row provider-health-row--purple"><span className="provider-health-row-icon"><Key size={17} /></span><div><strong>{t('adminCore.legacy_api_key')}</strong><p>{t('adminCore.optional_compatibility_credential')}</p></div><span className={cn('config-status', status.apiKeyConfigured ? 'configured' : 'not-required')}>{status.apiKeyConfigured ? <><Check size={13} /> {t('adminCore.set')}</> : <>{t('adminCore.not_required')}</>}</span></div>
          <div className="config-item provider-health-row provider-health-row--blue"><span className="provider-health-row-icon"><Key size={17} /></span><div><strong>{t('adminCore.public_key')}</strong><p>{t('adminCore.required_for_order_signing')}</p></div><span className={cn('config-status', status.publicKeyConfigured ? 'configured' : 'missing')}>{status.publicKeyConfigured ? <><Check size={13} /> {t('adminCore.set')}</> : <><X size={13} /> {t('adminCore.missing')}</>}</span></div>
          <div className="config-item provider-health-row provider-health-row--cyan"><span className="provider-health-row-icon"><Key size={17} /></span><div><strong>{t('adminCore.secret_key')}</strong><p>{t('adminCore.required_for_secure_requests')}</p></div><span className={cn('config-status', status.secretKeyConfigured ? 'configured' : 'missing')}>{status.secretKeyConfigured ? <><Check size={13} /> {t('adminCore.set')}</> : <><X size={13} /> {t('adminCore.missing')}</>}</span></div>
          <div className="config-item provider-health-row provider-health-row--teal"><span className="provider-health-row-icon"><ShieldCheck size={17} /></span><div><strong>{t('adminCore.remote_authentication')}</strong><p>{t('adminCore.bad_signature_control_verified')}</p></div><span className={cn('config-status', status.remotelyAuthenticated ? 'verified' : 'failed')}>{status.remotelyAuthenticated ? <><Check size={13} /> {t('adminCore.verified')}</> : <><X size={13} /> {t('adminCore.unverified')}</>}</span></div>
        </div></div>
        <div className="provider-capabilities"><h3>{t('adminCore.capabilities')}</h3><div className="capability-list">
          <div className="capability-item provider-health-row provider-health-row--blue-cyan"><span className="provider-health-row-icon"><Globe2 size={17} /></span><div><strong>{t('adminCore.live_quotes')}</strong><p>{t('adminCore.access_to_liquidity_pool')}</p></div><span className={cn('config-status', status.liveQuotes ? 'configured' : 'failed')}>{status.liveQuotes ? <><Check size={13} /> {t('adminCore.active')}</> : <><X size={13} /> {t('adminCore.inactive')}</>}</span></div>
          <div className="capability-item provider-health-row provider-health-row--magenta"><span className="provider-health-row-icon"><FileText size={17} /></span><div><strong>{t('adminCore.order_placement')}</strong><p>{t('adminCore.signed_create_operations')}</p></div><span className={cn('config-status', status.signedOrders ? 'configured' : 'failed')}>{status.signedOrders ? <><Check size={13} /> {t('adminCore.active')}</> : <><X size={13} /> {t('adminCore.inactive')}</>}</span></div>
        </div></div>
      </div>}
     </div>
     <div className="panel providers-panel provider-health-card rise-in mt-6" data-testid="whitebit-provider-card">
       <div className="panel-heading provider-health-heading">
         <div><span className="section-kicker">SWAP DEPOSIT ADDRESS</span><h2>WhiteBIT</h2><p>Optional order-scoped crypto funding addresses. Convert and customer deposits remain unchanged.</p></div>
         {whitebitStatus && <div className="provider-health-actions">
           <span className={cn('secure-badge provider-verified-badge', whitebitStatus.enabled ? 'text-emerald-400' : 'text-amber-300')}>
            {whitebitStatus.enabled ? <Check size={14} /> : <Pause size={14} />} {(whitebitStatus.state || 'unknown').replace('_', ' ').toUpperCase()}
           </span>
           {isOwner && can('integrations.credentials.update') && <button
             className="button provider-diagnostics-button"
             disabled={whitebitToggle.isPending || whitebit.isLoading}
             onClick={() => whitebitToggle.mutate({ data: { enabled: !whitebitStatus.enabled } }, {
               onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWhitebitProviderStatusQueryKey() }),
             })}
             data-testid="button-toggle-whitebit"
           >{whitebitToggle.isPending ? <Loader2 className="spin" size={15} /> : <Power size={15} />} {whitebitStatus.enabled ? 'Turn off' : 'Turn on'}</button>}
         </div>}
       </div>
       {whitebit.isLoading ? <div className="mt-6"><LoadingBlock rows={2} /></div> : whitebit.isError ? <ErrorState message="Could not load WhiteBIT status." retry={() => whitebit.refetch()} /> : whitebitStatus && <div className="provider-grid">
         <div className="provider-config"><h3>Readiness</h3><div className="config-list">
           <div className="config-item provider-health-row provider-health-row--blue"><span className="provider-health-row-icon"><Key size={17} /></span><div><strong>API credentials</strong><p>WHITEBIT_API_KEY and WHITEBIT_API_SECRET remain server-side secrets.</p></div><span className={cn('config-status', whitebitStatus.credentialsReady ? 'configured' : 'missing')}>{whitebitStatus.credentialsReady ? <><Check size={13} /> Set</> : <><X size={13} /> Missing</>}</span></div>
           <div className="config-item provider-health-row provider-health-row--teal"><span className="provider-health-row-icon"><ShieldCheck size={17} /></span><div><strong>Webhook</strong><p>Reported separately; address allocation does not require webhook credentials.</p></div><span className={cn('config-status', whitebitStatus.webhookReady ? 'configured' : 'not-required')}>{whitebitStatus.webhookReady ? <><Check size={13} /> Ready</> : 'Not configured'}</span></div>
         </div></div>
         <div className="provider-capabilities"><h3>Capability match</h3><div className="capability-list">
           <div className="capability-item provider-health-row provider-health-row--blue-cyan"><span className="provider-health-row-icon"><Network size={17} /></span><div><strong>Supported Admin routes</strong><p>Exact asset/network intersections with WhiteBIT deposit capability.</p></div><span className="config-status configured">{whitebitStatus.matchedRouteCount}</span></div>
           <div className="capability-item provider-health-row provider-health-row--magenta"><span className="provider-health-row-icon"><RefreshCw size={17} /></span><div><strong>Last capability check</strong><p>{whitebitStatus.lastCapabilitySyncAt ? formatDate(whitebitStatus.lastCapabilitySyncAt) : 'Unavailable'}</p></div><span className={cn('config-status', whitebitStatus.state === 'unavailable' ? 'failed' : 'verified')}>{whitebitStatus.state}</span></div>
         </div></div>
       </div>}
     </div>
  </AdminShell>;
}

type AdminPaymentField = PaymentMethodFieldDefinition & { enabled?: boolean; placeholder?: string };
const paymentFieldPresets: Array<{ key: string; label: string; type: PaymentMethodFieldDefinition["type"] }> = [
  { key: "name", label: "Name", type: "account-name" },
  { key: "iban", label: "IBAN / Account Number", type: "account-iban" },
  { key: "bank_name", label: "Bank Name", type: "short-text" },
  { key: "payment_description", label: "Payment Description / Reference", type: "long-text" },
  { key: "email", label: "Email", type: "email" },
  { key: "telegram_or_whatsapp", label: "Telegram / WhatsApp", type: "short-text" },
  { key: "wallet_address", label: "Wallet Address", type: "wallet-address" },
  { key: "memo_tag", label: "Memo / Tag", type: "memo-tag" },
  { key: "custom_field", label: "Custom Field", type: "short-text" },
];
const paymentFieldAliasGroups = [
  ["name", "account_name", "account_holder_name", "recipient_name"],
  ["iban", "bank_detail", "bank_account_number", "account_number"],
  ["bank_name", "bank"],
  ["payment_description", "payment_reference", "reference", "description"],
  ["email", "wallet_email"],
  ["telegram", "whatsapp", "telegram_or_whatsapp", "phone", "recipient_phone"],
  ["wallet_address", "address", "destination_address"],
  ["memo", "tag", "memo_tag"],
];
const paymentFieldAlias = (key: string, label: string) => {
  const normalized = `${key} ${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return paymentFieldAliasGroups.findIndex(group => group.some(alias => normalized.includes(alias)));
};

function PaymentMethodDynamicFields({ fields, setFields }: { fields: PaymentMethodFieldDefinition[], setFields: React.Dispatch<React.SetStateAction<PaymentMethodFieldDefinition[]>> }) {
  const adminFields = fields as AdminPaymentField[];
  const update = (index: number, patch: Partial<AdminPaymentField>) => setFields(current => current.map((field, fieldIndex) => fieldIndex === index ? ({ ...field, ...patch } as PaymentMethodFieldDefinition) : field));
  const appliesToDirection = (field: PaymentMethodFieldDefinition, direction: "send" | "receive") => !field.direction || field.direction === "both" || field.direction === direction;
  const move = (index: number, direction: "send" | "receive", delta: -1 | 1) => setFields(current => {
    const sectionIndexes = current.map((field, fieldIndex) => appliesToDirection(field, direction) ? fieldIndex : -1).filter(fieldIndex => fieldIndex >= 0);
    const sectionIndex = sectionIndexes.indexOf(index);
    const target = sectionIndexes[sectionIndex + delta];
    if (sectionIndex < 0 || target === undefined) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const add = (preset: typeof paymentFieldPresets[number], direction: "send" | "receive") => setFields(current => {
    const presetGroup = paymentFieldAlias(preset.key, preset.label);
    if (presetGroup >= 0 && current.some(field => appliesToDirection(field, direction) && paymentFieldAlias(field.key, field.label) === presetGroup)) return current;
    if (presetGroup < 0 && preset.key !== "custom_field" && current.some(field => appliesToDirection(field, direction) && field.key === preset.key)) return current;
    let key = preset.key;
    let suffix = 1;
    while (current.some(field => field.key === key)) {
      suffix += 1;
      key = `${preset.key}_${suffix}`;
    }
    return [...current, { ...preset, key, direction, required: true, enabled: true, placeholder: `Enter ${preset.label.toLowerCase()}` } as AdminPaymentField] as PaymentMethodFieldDefinition[];
  });
  const remove = (index: number, direction: "send" | "receive") => setFields(current => {
    const field = current[index];
    if (!field) return current;
    if (!field.direction || field.direction === "both") {
      const otherDirection = direction === "send" ? "receive" : "send";
      return current.map((item, fieldIndex) => fieldIndex === index ? { ...item, direction: otherDirection } : item);
    }
    return current.filter((_, fieldIndex) => fieldIndex !== index);
  });
  const renderSection = (direction: "send" | "receive", title: string, description: string) => {
    const sectionFields = adminFields.map((field, index) => ({ field, index })).filter(({ field }) => appliesToDirection(field, direction));
    return <section className={cn("payment-method-field-section", `payment-method-field-section--${direction}`)} data-testid={`section-${direction}-fields`}>
      <div className="payment-method-field-section-head"><div><h3>{title}</h3><p>{description}</p></div>
        <DropdownMenuPrimitive.Root><DropdownMenuPrimitive.Trigger asChild><button type="button" className="payment-method-add-field" data-testid={`button-add-field-${direction}`}>+ Add Field</button></DropdownMenuPrimitive.Trigger><DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content className="admin-blog-actions-menu z-[9999]" sideOffset={4} align="end">
          {paymentFieldPresets.map(preset => <DropdownMenuPrimitive.Item key={preset.key} className="admin-blog-actions-item" onSelect={() => add(preset, direction)}>{preset.label}</DropdownMenuPrimitive.Item>)}
        </DropdownMenuPrimitive.Content></DropdownMenuPrimitive.Portal></DropdownMenuPrimitive.Root>
      </div>
      <div className="payment-method-field-list">{sectionFields.map(({ field, index }, sectionIndex) => <div key={`${direction}-${index}`} className="payment-method-field-row payment-method-field-card" data-testid={`row-${direction}-${field.key}`}>
        <div className="payment-method-field-card-details">
          <label className="payment-method-field-label payment-method-field-card-label"><span>Label</span><input className="payment-method-field-name-input" value={field.label} onChange={event => update(index, { label: event.target.value })} data-testid={`input-label-${direction}-${index}`} /></label>
          <label className="payment-method-field-label"><span>Field Name</span><input value={field.key} onChange={event => update(index, { key: event.target.value })} pattern="^[a-z][a-z0-9_]{0,63}$" data-testid={`input-field-name-${direction}-${index}`} /></label>
          <label className="payment-method-field-label"><span>Placeholder</span><input value={field.placeholder || ""} onChange={event => update(index, { placeholder: event.target.value })} data-testid={`input-placeholder-${direction}-${index}`} /></label>
          <label className="payment-method-field-label payment-method-field-help"><span>Help Text</span><input value={field.help || ""} onChange={event => update(index, { help: event.target.value })} /></label>
          <div className="payment-method-field-toggles">
            <label className="payment-method-required-toggle"><input type="checkbox" checked={field.required !== false} onChange={event => update(index, { required: event.target.checked })} data-testid={`input-required-${direction}-${index}`} /><span>Required <strong>{field.required !== false ? "ON" : "OFF"}</strong></span></label>
            <label className="payment-method-required-toggle payment-method-enabled-toggle"><input type="checkbox" checked={field.enabled !== false} onChange={event => update(index, { enabled: event.target.checked })} data-testid={`input-enabled-${direction}-${index}`} /><span>Enabled <strong>{field.enabled !== false ? "ON" : "OFF"}</strong></span></label>
          </div>
          <fieldset className="payment-method-field-validation">
            <legend>Validation</legend>
            <div className="payment-method-field-validation-inputs">
              <label><span>Pattern</span><input value={field.pattern || ""} placeholder="Pattern" onChange={event => update(index, { pattern: event.target.value || undefined })} /></label>
            </div>
          </fieldset>
        </div>
        <div className="payment-method-field-actions">
          <button type="button" className="payment-method-remove-field" onClick={() => remove(index, direction)} data-testid={`button-remove-${direction}-${index}`} aria-label={`Remove field from ${direction}`}><X size={14} /> Remove Field</button>
          <button type="button" aria-label="Move field up" disabled={sectionIndex === 0} onClick={() => move(index, direction, -1)}>↑ Move Up</button>
          <button type="button" aria-label="Move field down" disabled={sectionIndex === sectionFields.length - 1} onClick={() => move(index, direction, 1)}>↓ Move Down</button>
        </div>
      </div>)}
      {sectionFields.length === 0 && <div className="payment-method-field-empty">No required information configured.</div>}</div>
    </section>;
  };
  return <div className="payment-method-fields">
    {renderSection("send", "YOU SEND — Required Information", "This controls what information must be requested from the customer when this Payment Method is selected in You Send.")}
    {renderSection("receive", "YOU RECEIVE — Required Information", "This controls what information must be requested from the customer when this Payment Method is selected in You Receive.")}
  </div>;
}


function PaymentMethodDrawer({ method, onClose }: { method?: any; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const initialForm = useCallback(() => ({
    id: method?.id || '',
    name: method?.name || '',
    description: method?.description || '',
    instructions: method?.instructions || '',
    enabled: method?.enabled ?? true,
    canSend: method?.canSend ?? true,
    canReceive: method?.canReceive ?? true,
    logoObjectPath: method?.logoObjectPath || '',
    family: method?.family || 'bank-transfer',
    executionMode: method?.executionMode || 'manual',
    providerId: method?.providerId || '',
    lifecycle: method?.lifecycle || 'active',
    regions: method?.regions?.join(', ') || '',
    countries: method?.countries?.join(', ') || '',
    requiresProviderConfiguration: method?.requiresProviderConfiguration ?? false,
  }), [method]);
  const [form, setForm] = useState(initialForm);
  const [fields, setFields] = useState<PaymentMethodFieldDefinition[]>(method?.fieldDefinitions || []);
  const commitLogoRef = useRef<() => void>(() => {});
  const [notice, setNotice] = useState<{ kind: 'error' | 'success', text: string } | null>(null);

  const createMutation = useCreatePaymentMethod();
  const updateMutation = useUpdatePaymentMethod();
  const uploadLogoMutation = useRequestPaymentMethodLogoUpload();
  const deleteLogoMutation = useDeletePaymentMethodLogoUpload();

  const isPending = createMutation.isPending || updateMutation.isPending || uploadLogoMutation.isPending || deleteLogoMutation.isPending;

  useEffect(() => {
    setForm(initialForm());
    setFields(method?.fieldDefinitions || []);
    setNotice(null);
  }, [initialForm, method]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const payload = {
      id: form.id.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      instructions: form.instructions.trim() || null,
      enabled: form.enabled,
      canSend: form.canSend,
      canReceive: form.canReceive,
      logoObjectPath: form.logoObjectPath || null,
      family: form.family as any,
      executionMode: form.executionMode as any,
      providerId: form.providerId.trim() || null,
      lifecycle: form.lifecycle as any,
      regions: form.regions.split(',').map((r: string) => r.trim()).filter(Boolean),
      countries: form.countries.split(',').map((c: string) => c.trim().toUpperCase()).filter(Boolean),
      requiresProviderConfiguration: form.requiresProviderConfiguration,
      fieldDefinitions: fields,
    };
    const opts = {
      onSuccess: (saved: any) => {
        commitLogoRef.current();
        const previousPath = method?.logoObjectPath as string | undefined;
        if (previousPath && previousPath !== form.logoObjectPath) {
          void deleteLogoMutation.mutateAsync({ id: previousPath.split('/').pop()! }).catch(() => undefined);
        }
        queryClient.setQueryData<any[]>(getGetPaymentMethodsQueryKey(), current => {
          if (!current) return [saved];
          const exists = current.some(item => item.id === saved.id);
          return exists
            ? current.map(item => item.id === saved.id ? saved : item)
            : [...current, saved];
        });
        queryClient.invalidateQueries({ queryKey: getGetPaymentMethodsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() });
        onClose();
      },
      onError: (err: unknown) => setNotice({ kind: 'error', text: apiErrorText(err, t('adminCatalog.failed_to_save_payment_method')) })
    };
    if (method) {
      updateMutation.mutate({ id: method.id, data: payload }, opts);
    } else {
      createMutation.mutate({ data: payload }, opts);
    }
  };

  return createPortal(<div className="drawer-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
    <aside className="order-drawer catalog-editor-drawer" role="dialog" aria-label={method ? t('adminCatalog.edit_payment_method') : t('adminCatalog.add_payment_method')}>
      <div className="drawer-head catalog-editor-head">
        <div className="catalog-editor-heading"><span className="catalog-editor-icon"><WalletCards size={19} /></span><div><span className="section-kicker">{t('adminCatalog.configuration')}</span><h2>{method ? t('adminCatalog.edit_payment_method') : t('adminCatalog.add_payment_method')}</h2></div></div>
        <button className="icon-button catalog-editor-close" onClick={onClose} aria-label={t('adminCatalog.close_payment_method_drawer')}><X size={18} /></button>
      </div>
      <div className="catalog-editor-scroll scrollbar-thin">
        <form onSubmit={save} className="admin-form admin-form-card catalog-editor-form">
          {notice && <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice>}
          <label><span className="field-label">{t('adminCatalog.internal_id')}<small>{t('adminCatalog.a_z_0_9_hyphens')}</small></span><input value={form.id} onChange={e => setForm(f => ({...f, id: e.target.value}))} required disabled={!!method} pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" data-testid="input-pm-id" /></label>
          <label><span className="field-label">{t('adminCatalog.name')}</span><input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required data-testid="input-pm-name" /></label>
           <CatalogImageUploadField
             label={t('adminCatalog.logo_upload')}
             namespace="payment-method"
             persistedPath={method?.logoObjectPath}
             persistedUrl={method?.logoUrl}
             onPathChange={path => setForm(f => ({ ...f, logoObjectPath: path || '' }))}
             onRegisterCommit={commit => { commitLogoRef.current = commit; }}
             requestUpload={data => uploadLogoMutation.mutateAsync({ data: data as any })}
             deleteUpload={path => deleteLogoMutation.mutateAsync({ id: path.split('/').pop()! })}
             disabled={isPending}
             testId="input-pm-logo"
           />
          <label><span className="field-label">{t('adminCatalog.description')}<small>{t('adminCatalog.optional')}</small></span><textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} data-testid="input-pm-desc" /></label>
          <label><span className="field-label">{t('adminCatalog.global_instructions')}<small>{t('adminCatalog.optional')}</small></span><textarea value={form.instructions} onChange={e => setForm(f => ({...f, instructions: e.target.value}))} data-testid="input-pm-inst" /></label>

          <div className="admin-form-grid grid grid-cols-2 gap-4">
            <label><span className="field-label">{t('adminCatalog.family')}</span>
              <select value={form.family} onChange={e => setForm(f => ({...f, family: e.target.value}))}>
                <option value="bank-transfer">{t('adminCatalog.bank_transfer')}</option>
                <option value="card">{t('adminCatalog.card')}</option>
                <option value="digital-wallet">{t('adminCatalog.digital_wallet')}</option>
                <option value="mobile-money">{t('adminCatalog.mobile_money')}</option>
                <option value="cash">{t('adminCatalog.cash')}</option>
                <option value="ecommerce">{t('adminCatalog.e_commerce')}</option>
                <option value="voucher">{t('adminCatalog.voucher')}</option>
                <option value="other">{t('adminCatalog.other')}</option>
              </select>
            </label>
          </div>

          <div className="admin-form-grid grid grid-cols-2 gap-4">
            <label><span className="field-label">{t('adminCatalog.execution_mode')}</span>
              <select value={form.executionMode} onChange={e => setForm(f => ({...f, executionMode: e.target.value}))}>
                <option value="manual">{t('adminCatalog.manual')}</option>
                <option value="catalog">{t('adminCatalog.catalog')}</option>
                <option value="api">{t('adminCatalog.api')}</option>
              </select>
            </label>
            <label><span className="field-label">{t('adminCatalog.lifecycle')}</span>
              <select value={form.lifecycle} onChange={e => setForm(f => ({...f, lifecycle: e.target.value}))}>
                <option value="active">{t('adminCatalog.active')}</option>
                <option value="restricted">{t('adminCatalog.restricted')}</option>
                <option value="deprecated">{t('adminCatalog.deprecated')}</option>
              </select>
            </label>
          </div>

          <label><span className="field-label">{t('adminCatalog.provider_id')}<small>{t('adminCatalog.api_execution_mapping')}</small></span><input value={form.providerId} onChange={e => setForm(f => ({...f, providerId: e.target.value}))} disabled={form.executionMode !== 'api'} /></label>

          <label><span className="field-label">{t('adminCatalog.regions')}<small>{t('adminCatalog.comma_separated')}</small></span><input value={form.regions} onChange={e => setForm(f => ({...f, regions: e.target.value}))} placeholder={t('adminCatalog.global_sepa_na')} /></label>
          <label><span className="field-label">{t('adminCatalog.countries')}<small>{t('adminCatalog.iso_codes')}</small></span><input value={form.countries} onChange={e => setForm(f => ({...f, countries: e.target.value}))} placeholder={t('adminCatalog.us_gb_de')} className="uppercase" /></label>

          <div className="catalog-editor-toggles">
            <label><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({...f, enabled: e.target.checked}))} data-testid="input-pm-enabled" /> {t('adminCatalog.enabled')}</label>
            <label><input type="checkbox" checked={form.canSend} onChange={e => setForm(f => ({...f, canSend: e.target.checked}))} data-testid="input-pm-send" /> {t('adminCatalog.can_send')}</label>
            <label><input type="checkbox" checked={form.canReceive} onChange={e => setForm(f => ({...f, canReceive: e.target.checked}))} data-testid="input-pm-recv" /> {t('adminCatalog.can_receive')}</label>
            <label><input type="checkbox" checked={form.requiresProviderConfiguration} onChange={e => setForm(f => ({...f, requiresProviderConfiguration: e.target.checked}))} /> {t('adminCatalog.requires_api_mapping')}</label>
          </div>

          <PaymentMethodDynamicFields fields={fields} setFields={setFields} />

          <button type="submit" disabled={isPending || !form.id || !form.name} className="catalog-editor-primary" data-testid="button-save-pm">
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{isPending ? t('adminCatalog.saving') : t('adminCatalog.save_payment_method')}
          </button>
        </form>
      </div>
    </aside>
  </div>, document.body);
}

function AttachmentItem({ att, pm, currencyCode, queryClient }: { att: any; pm: any; currencyCode: string; queryClient: any }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    enabled: att.enabled,
    canSend: att.canSend ?? pm?.canSend ?? true,
    canReceive: att.canReceive ?? pm?.canReceive ?? true,
    sendInstructions: att.sendInstructions || '',
    receiveInstructions: att.receiveInstructions || '',
    minAmount: att.minAmount?.toString() || '',
    maxAmount: att.maxAmount?.toString() || '',
    countries: att.countries?.join(', ') || ''
  });
  const updateAttachMutation = useUpdateFiatCurrencyPaymentMethod();
  const detachMutation = useDeleteFiatCurrencyPaymentMethod();

  const handleSave = () => {
    updateAttachMutation.mutate({
      id: att.id,
      data: {
        enabled: form.enabled,
        canSend: form.canSend,
        canReceive: form.canReceive,
        sendInstructions: form.sendInstructions || null,
        receiveInstructions: form.receiveInstructions || null,
        minAmount: form.minAmount ? form.minAmount : undefined,
        maxAmount: form.maxAmount ? form.maxAmount : undefined,
        countries: form.countries.split(',').map((c: string) => c.trim().toUpperCase()).filter(Boolean)
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFiatCurrencyPaymentMethodsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() });
      }
    });
  };

  const hasChanges =
    form.enabled !== att.enabled ||
    form.canSend !== (att.canSend ?? pm?.canSend ?? true) ||
    form.canReceive !== (att.canReceive ?? pm?.canReceive ?? true) ||
    form.sendInstructions !== (att.sendInstructions || '') ||
    form.receiveInstructions !== (att.receiveInstructions || '') ||
    form.minAmount !== (att.minAmount?.toString() || '') ||
    form.maxAmount !== (att.maxAmount?.toString() || '') ||
    form.countries !== (att.countries?.join(', ') || '');

  return (
    <div className="admin-form admin-form-section admin-form-card p-4 border border-border rounded-lg bg-muted/30">
      <div className="flex justify-between items-start mb-3">
        <div className="admin-attachment-method">
          <AdminPaymentLogo name={pm?.name || att.paymentMethodId} currencyCode={currencyCode} logoUrl={pm?.logoUrl} />
          <PaymentMethodCopy
            methodName={pm?.name || att.paymentMethodId}
            currencyCode={currencyCode}
          />
        </div>
        <div className="flex gap-2">
          {hasChanges && <button className="text-xs text-primary font-bold hover:underline" onClick={handleSave}>{t('adminCatalog.save')}</button>}
          <button className="text-xs text-destructive hover:underline" onClick={() => {
            detachMutation.mutate({ id: att.id }, { onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetFiatCurrencyPaymentMethodsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() });
            }});
          }}>{t('adminCatalog.detach')}</button>
        </div>
      </div>
      <div className="admin-form-grid grid grid-cols-2 gap-3 mb-3">
         <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({...f, enabled: e.target.checked}))} /> {t('adminCatalog.enabled')}</label>
         <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.canSend} onChange={e => setForm(f => ({...f, canSend: e.target.checked}))} /> {t('adminCatalog.can_send')}</label>
         <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.canReceive} onChange={e => setForm(f => ({...f, canReceive: e.target.checked}))} /> {t('adminCatalog.can_receive')}</label>
      </div>
      <div className="admin-form-grid grid grid-cols-2 gap-2 mt-2">
        <label><span className="text-[10px] text-muted-foreground uppercase font-bold">{t('adminCatalog.min_amount')}</span><input type="number" value={form.minAmount} onChange={e => setForm(f => ({...f, minAmount: e.target.value}))} className="text-xs p-1 block w-full" placeholder={t('adminCatalog.e_g_10_00')} /></label>
        <label><span className="text-[10px] text-muted-foreground uppercase font-bold">{t('adminCatalog.max_amount')}</span><input type="number" value={form.maxAmount} onChange={e => setForm(f => ({...f, maxAmount: e.target.value}))} className="text-xs p-1 block w-full" placeholder={t('adminCatalog.e_g_10000_00')} /></label>
      </div>
      <label className="mt-2 block"><span className="text-[10px] text-muted-foreground uppercase font-bold">{t('adminCatalog.countries')}<small>{t('adminCatalog.iso_codes_comma_separated')}</small></span><input value={form.countries} onChange={e => setForm(f => ({...f, countries: e.target.value}))} className="text-xs p-1 block w-full uppercase" placeholder={t('adminCatalog.us_gb')} /></label>
      <div className="admin-form-section grid grid-cols-1 gap-2 mt-2">
        <label><span className="text-[10px] text-muted-foreground uppercase font-bold">{t('adminCatalog.override_send_instructions')}</span><input value={form.sendInstructions} onChange={e => setForm(f => ({...f, sendInstructions: e.target.value}))} className="text-xs p-1" /></label>
        <label><span className="text-[10px] text-muted-foreground uppercase font-bold">{t('adminCatalog.override_receive_instructions')}</span><input value={form.receiveInstructions} onChange={e => setForm(f => ({...f, receiveInstructions: e.target.value}))} className="text-xs p-1" /></label>
      </div>
    </div>
  );
}

function CurrencyDrawer({ currency, onClose }: { currency?: FiatCurrency; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [code, setCode] = useState(currency?.code || '');
  const [name, setName] = useState(currency?.name || '');
  const [enabled, setEnabled] = useState(currency?.enabled ?? true);
  const [precision, setPrecision] = useState(currency?.precision ?? 2);
  const [lifecycle, setLifecycle] = useState<any>(currency?.lifecycle || 'active');
  const [regions, setRegions] = useState(currency?.regions?.join(', ') || '');
  const [countries, setCountries] = useState(currency?.countries?.join(', ') || '');
  const [rateMode, setRateMode] = useState<'automatic' | 'manual'>(currency?.rateMode || 'automatic');
  const [manualRate, setManualRate] = useState(currency?.manualRate || '');
  const [flagObjectPath, setFlagObjectPath] = useState((currency as any)?.flagObjectPath || '');
  const commitFlagRef = useRef<() => void>(() => {});
  const [methodSearch, setMethodSearch] = useState('');
  const [notice, setNotice] = useState<{ kind: 'error' | 'success', text: string } | null>(null);

  const createMutation = useCreateFiatCurrency();
  const updateMutation = useUpdateFiatCurrency();
  const uploadFlagMutation = useRequestFiatCurrencyFlagUpload();
  const deleteFlagMutation = useDeleteFiatCurrencyFlagUpload();
  const paymentMethodsQuery = useGetPaymentMethods({ query: { queryKey: getGetPaymentMethodsQueryKey() } });
  const attachmentsQuery = useGetFiatCurrencyPaymentMethods({ query: { queryKey: getGetFiatCurrencyPaymentMethodsQueryKey() } });
  const attachMutation = useCreateFiatCurrencyPaymentMethod();

  const isPending = createMutation.isPending || updateMutation.isPending || uploadFlagMutation.isPending || deleteFlagMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const payload = {
      code: code.toUpperCase().trim(),
      name: name.trim(),
      enabled,
      precision,
      lifecycle,
      regions: regions.split(',').map((r: string) => r.trim()).filter(Boolean),
      countries: countries.split(',').map((c: string) => c.trim().toUpperCase()).filter(Boolean),
      rateMode,
       manualRate: rateMode === 'manual' ? (code.toUpperCase() === 'USD' ? '1' : manualRate.trim()) : null,
       flagObjectPath: flagObjectPath || null,
    };
    if (currency) {
      updateMutation.mutate({ id: currency.id, data: payload }, {
         onSuccess: () => {
           commitFlagRef.current();
           const previousPath = (currency as any)?.flagObjectPath as string | undefined;
           if (previousPath && previousPath !== flagObjectPath) void deleteFlagMutation.mutateAsync({ id: previousPath.split('/').pop()! }).catch(() => undefined);
           queryClient.invalidateQueries({ queryKey: getGetFiatCurrenciesQueryKey() }); onClose();
         },
        onError: (err) => setNotice({ kind: 'error', text: apiErrorText(err, t('adminCatalog.failed_to_update_currency')) })
      });
    } else {
      createMutation.mutate({ data: payload }, {
         onSuccess: () => {
           commitFlagRef.current();
           queryClient.invalidateQueries({ queryKey: getGetFiatCurrenciesQueryKey() }); onClose();
         },
        onError: (err) => setNotice({ kind: 'error', text: apiErrorText(err, t('adminCatalog.failed_to_create_currency')) })
      });
    }
  };

  const attached = attachmentsQuery.data?.filter((a: any) => a.fiatCurrencyId === currency?.id) || [];
  const attachedIds = attached.map((a: any) => a.paymentMethodId);
  const availableMethods = paymentMethodsQuery.data?.filter((pm: any) =>
    !attachedIds.includes(pm.id) &&
    (!methodSearch || pm.name.toLowerCase().includes(methodSearch.toLowerCase()) || pm.id.toLowerCase().includes(methodSearch.toLowerCase()))
  ) || [];

  return createPortal(
    <div className="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="order-drawer catalog-editor-drawer" role="dialog" aria-label={currency ? t('adminCatalog.edit_currency') : t('adminCatalog.add_currency')}>
        <div className="drawer-head catalog-editor-head">
          <div className="catalog-editor-heading"><span className="catalog-editor-icon"><Landmark size={19} /></span><div><span className="section-kicker">{t('adminCatalog.configuration')}</span><h2>{currency ? t('adminCatalog.edit_currency') : t('adminCatalog.add_currency')}</h2></div></div>
          <button className="icon-button catalog-editor-close" onClick={onClose} data-testid="button-close-drawer" aria-label={t('adminCatalog.close_currency_drawer')}><X size={18} /></button>
        </div>

        <div className="catalog-editor-scroll scrollbar-thin">
          <form onSubmit={handleSubmit} className="admin-form admin-form-card catalog-editor-form">
            {notice && <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice>}
            <div className="catalog-editor-identity-preview">
               <span className="catalog-editor-logo-preview">{code.length === 3 ? <FiatCurrencyFlag code={code.toUpperCase()} flagUrl={(currency as any)?.flagUrl} variant="admin" /> : <Landmark size={23} />}</span>
              <span><small>{t('adminCatalog.fiat_currency')}</small><strong>{name || 'Currency name'}</strong><em>{code.toUpperCase() || 'ISO'}</em></span>
            </div>
            <div className="admin-form-grid">
              <label className="flex-1"><span className="field-label">{t('adminCatalog.code')}</span><input value={code} onChange={e => setCode(e.target.value)} maxLength={3} pattern="[A-Za-z]{3}" required disabled={isPending} className="uppercase font-mono" data-testid="input-currency-code" /></label>
              <label className="flex-1"><span className="field-label">{t('adminCatalog.precision')}</span><input type="number" min="0" max="4" value={precision} onChange={e => setPrecision(parseInt(e.target.value))} required disabled={isPending} /></label>
            </div>
            <label><span className="field-label">{t('adminCatalog.name')}</span><input value={name} onChange={e => setName(e.target.value)} required disabled={isPending} data-testid="input-currency-name" /></label>
            <CatalogImageUploadField label={t('adminCatalog.flag_upload')} namespace="fiat-currency" persistedPath={(currency as any)?.flagObjectPath} persistedUrl={(currency as any)?.flagUrl} onPathChange={setFlagObjectPath} onRegisterCommit={commit => { commitFlagRef.current = commit; }} requestUpload={data => uploadFlagMutation.mutateAsync({ data: data as any })} deleteUpload={path => deleteFlagMutation.mutateAsync({ id: path.split('/').pop()! })} disabled={isPending} testId="input-currency-flag" />
            <div className="admin-form-grid">
              <label className="flex-1"><span className="field-label">{t('adminCatalog.lifecycle')}</span>
                <select value={lifecycle} onChange={e => setLifecycle(e.target.value)} disabled={isPending}>
                  <option value="active">{t('adminCatalog.active')}</option>
                  <option value="restricted">{t('adminCatalog.restricted')}</option>
                  <option value="deprecated">{t('adminCatalog.deprecated')}</option>
                </select>
              </label>
              <label className="catalog-editor-toggle">
                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={isPending} data-testid="input-currency-enabled" /> {t('adminCatalog.enabled')}</label>
            </div>
            <label><span className="field-label">{t('adminCatalog.regions')}<small>{t('adminCatalog.comma_separated')}</small></span><input value={regions} onChange={e => setRegions(e.target.value)} disabled={isPending} placeholder={t('adminCatalog.global_sepa_na')} /></label>
            <label><span className="field-label">{t('adminCatalog.countries')}<small>{t('adminCatalog.iso_codes')}</small></span><input value={countries} onChange={e => setCountries(e.target.value)} disabled={isPending} placeholder={t('adminCatalog.us_gb_de')} className="uppercase" /></label>
            <div className="admin-form-grid">
              <label className="flex-1"><span className="field-label">Swap rate source</span>
                <select value={code.toUpperCase() === 'USD' ? 'manual' : rateMode} onChange={e => setRateMode(e.target.value as 'automatic' | 'manual')} disabled={isPending || code.toUpperCase() === 'USD'}>
                  <option value="automatic">Automatic (1Forge)</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              {rateMode === 'manual' && code.toUpperCase() !== 'USD' && <label className="flex-1"><span className="field-label">Units per 1 USD</span><input type="text" inputMode="decimal" value={manualRate} onChange={e => setManualRate(e.target.value)} disabled={isPending} placeholder="0.86" /></label>}
            </div>

            <button type="submit" disabled={isPending || code.length !== 3 || !name} className="catalog-editor-primary" data-testid="button-save-currency">
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{isPending ? t('adminCatalog.saving') : currency ? t('adminCatalog.save_currency_details') : t('adminCatalog.add_currency')}
            </button>
          </form>

          {currency && (
            <div className="mt-8 pt-6 border-t border-border">
              <h3 className="font-mono font-bold text-lg mb-4">{t('adminCatalog.payment_methods')}</h3>
              <div className="space-y-4">
                {attached.map((att: any) => {
                  const pm = paymentMethodsQuery.data?.find((p: any) => p.id === att.paymentMethodId);
                  return <AttachmentItem key={att.id} att={att} pm={pm} currencyCode={currency.code} queryClient={queryClient} />;
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-border flex flex-col gap-2">
                <label className="field-label">{t('adminCatalog.attach_new_method')}</label>
                <AdminSearch
                  value={methodSearch}
                  onChange={setMethodSearch}
                  placeholder={t('adminCatalog.search_available_methods')}
                  testId="input-attach-method-search"
                />
                <div className="flex gap-2">
                  <select id="attach-method-select" className="flex-1 text-xs" defaultValue="">
                    <option value="" disabled>{t('adminCatalog.select_payment_method')}</option>
                    {availableMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button className="button button-secondary text-xs px-3" onClick={() => {
                    const sel = document.getElementById('attach-method-select') as HTMLSelectElement;
                    if (sel.value) {
                      attachMutation.mutate({ data: { fiatCurrencyId: currency.id, paymentMethodId: sel.value, enabled: true } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetFiatCurrencyPaymentMethodsQueryKey() }); sel.value = ''; } });
                    }
                  }}>{t('adminCatalog.attach')}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function AdminCurrencies() {
  const { t } = useI18n();
  const { can, isOwner } = useAdminPermissions();
  const initialCreate = new URLSearchParams(window.location.search).get('create');
  const initialTab = (new URLSearchParams(window.location.search).get('tab') || 'currencies') as 'currencies' | 'methods' | 'assets' | 'networks';
  const [tab, setTab] = useState<'currencies' | 'methods' | 'assets' | 'networks'>(['currencies', 'methods', 'assets', 'networks'].includes(initialTab) ? initialTab : 'currencies');
  const [drawerCurrency, setDrawerCurrency] = useState<FiatCurrency | 'new' | null>(initialCreate === 'currency' ? 'new' : null);
  const [drawerMethod, setDrawerMethod] = useState<any | 'new' | null>(initialCreate === 'method' ? 'new' : null);
  const [drawerAsset, setDrawerAsset] = useState<CryptoAsset | 'new' | null>(initialCreate === 'asset' ? 'new' : null);
  const [drawerNetwork, setDrawerNetwork] = useState<CryptoNetwork | 'new' | null>(initialCreate === 'network' ? 'new' : null);
  const [syncWhitebitOpen, setSyncWhitebitOpen] = useState(false);
  const [bulkEditAssetsOpen, setBulkEditAssetsOpen] = useState(false);

  const currenciesQuery = useGetFiatCurrencies({ query: { queryKey: getGetFiatCurrenciesQueryKey() } });
  const methodsQuery = useGetPaymentMethods({ query: { queryKey: getGetPaymentMethodsQueryKey() } });
  const assetsQuery = useGetCryptoAssets({ query: { queryKey: getGetCryptoAssetsQueryKey() } });
  const networksQuery = useGetCryptoNetworks({ query: { queryKey: getGetCryptoNetworksQueryKey() } });
  const healthQuery = useGetOneForgeProviderStatus({ query: { queryKey: getGetOneForgeProviderStatusQueryKey(), refetchInterval: 30000 } });
  const health = healthQuery.data;
  const permissionForTab = (section: typeof tab) =>
    section === 'currencies' ? 'currencies.manage'
      : section === 'methods' ? 'payment_methods.manage'
        : section === 'assets' ? 'crypto_assets.manage'
          : 'crypto_networks.manage';
  const canManageCurrent = can(permissionForTab(tab));

  const [search, setSearch] = useState('');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLifecycle, setFilterLifecycle] = useState('all');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const queryClient = useQueryClient();
  const updateCatalogCurrency = useUpdateFiatCurrency();
  const deleteCatalogCurrency = useDeleteFiatCurrency();
  const updateCatalogMethod = useUpdatePaymentMethod();
  const deleteCatalogMethod = useDeletePaymentMethod();
  const updateCatalogAsset = useUpdateCryptoAsset();
  const deleteCatalogAsset = useDeleteCryptoAsset();
  const deleteCatalogAssetLogo = useDeleteCryptoAssetLogoUpload();
  const updateCatalogNetwork = useUpdateCryptoNetwork();
  const deleteCatalogNetwork = useDeleteCryptoNetwork();
  const deleteCatalogNetworkLogo = useDeleteCryptoNetworkLogoUpload();
  const deleteCatalogMethodLogo = useDeletePaymentMethodLogoUpload();
  const deleteCatalogCurrencyFlag = useDeleteFiatCurrencyFlagUpload();
  const reconcileCustomerDeposits = useReconcileCryptoCustomerDeposits();
  const depositReconciliationStarted = useRef(false);

  const [catalogSelected, setCatalogSelected] = useState<Record<'currencies' | 'methods' | 'assets' | 'networks', Set<string>>>({
    currencies: new Set(),
    methods: new Set(),
    assets: new Set(),
    networks: new Set(),
  });
  const [catalogActionPending, setCatalogActionPending] = useState(false);
  const [catalogActionNotice, setCatalogActionNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (
      tab !== 'assets' ||
      !isOwner ||
      depositReconciliationStarted.current ||
      assetsQuery.isLoading ||
      networksQuery.isLoading
    ) return;
    depositReconciliationStarted.current = true;
    void reconcileCustomerDeposits.mutateAsync()
      .then(async result => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetCryptoAssetsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
        ]);
        setCatalogActionNotice({
          kind: 'success',
          text: `${result.enabled} enabled / ${result.remainedDisabled} remained disabled.`,
        });
      })
      .catch(error => {
        setCatalogActionNotice({
          kind: 'error',
          text: apiErrorText(error, 'Failed to refresh customer deposit availability.'),
        });
      });
  }, [
    tab,
    isOwner,
    assetsQuery.isLoading,
    networksQuery.isLoading,
    queryClient,
    reconcileCustomerDeposits,
  ]);

  const handleTabChange = (newTab: 'currencies' | 'methods' | 'assets' | 'networks') => {
    setTab(newTab);
    setPage(1);
    setSearch('');
    setFilterRegion('all');
    setFilterStatus('all');
    setFilterLifecycle('all');
    setCatalogSelected(current => ({ ...current, [newTab]: new Set() }));
    setCatalogActionNotice(null);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const isRecent = (dateStr?: string, days = 7) => dateStr ? (Date.now() - new Date(dateStr).getTime()) < days * 24 * 60 * 60 * 1000 : false;

  const filteredCurrencies = useMemo(() => {
    let list = currenciesQuery.data || [];
    if (normalizedSearch) list = list.filter(c => c.code.toLowerCase().includes(normalizedSearch) || c.name.toLowerCase().includes(normalizedSearch) || c.regions?.some((r: string) => r.toLowerCase().includes(normalizedSearch)) || c.countries?.some((r: string) => r.toLowerCase().includes(normalizedSearch)));
    if (filterStatus !== 'all') list = list.filter(c => c.enabled === (filterStatus === 'active'));
    if (filterLifecycle !== 'all') list = list.filter(c => c.lifecycle === filterLifecycle);
    if (filterRegion !== 'all') list = list.filter(c => c.regions?.includes(filterRegion));
    return list;
  }, [currenciesQuery.data, normalizedSearch, filterStatus, filterLifecycle, filterRegion]);

  const filteredMethods = useMemo(() => {
    let list = methodsQuery.data || [];
    if (normalizedSearch) list = list.filter(m => m.id.toLowerCase().includes(normalizedSearch) || m.name.toLowerCase().includes(normalizedSearch) || m.regions?.some((r: string) => r.toLowerCase().includes(normalizedSearch)) || m.countries?.some((r: string) => r.toLowerCase().includes(normalizedSearch)));
    if (filterStatus !== 'all') list = list.filter(m => m.enabled === (filterStatus === 'active'));
    if (filterLifecycle !== 'all') list = list.filter(m => m.lifecycle === filterLifecycle);
    if (filterRegion !== 'all') list = list.filter(m => m.regions?.includes(filterRegion));
    return list;
  }, [methodsQuery.data, normalizedSearch, filterStatus, filterLifecycle, filterRegion]);

  const filteredAssets = useMemo(() => {
    let list = assetsQuery.data || [];
    if (normalizedSearch) list = list.filter(a => a.code.toLowerCase().includes(normalizedSearch) || a.name.toLowerCase().includes(normalizedSearch));
    if (filterStatus !== 'all') list = list.filter(a => a.enabled === (filterStatus === 'active'));
    if (filterLifecycle !== 'all') list = list.filter(a => a.lifecycle === filterLifecycle);
    return list;
  }, [assetsQuery.data, normalizedSearch, filterStatus, filterLifecycle]);

  const filteredNetworks = useMemo(() => {
    let list = networksQuery.data || [];
    if (normalizedSearch) list = list.filter(n => n.id.toLowerCase().includes(normalizedSearch) || n.networkCode.toLowerCase().includes(normalizedSearch) || n.networkName.toLowerCase().includes(normalizedSearch) || n.regions?.some((r: string) => r.toLowerCase().includes(normalizedSearch)));
    if (filterStatus !== 'all') list = list.filter(n => n.enabled === (filterStatus === 'active'));
    if (filterLifecycle !== 'all') list = list.filter(n => n.lifecycle === filterLifecycle);
    if (filterRegion !== 'all') list = list.filter(n => n.regions?.includes(filterRegion));
    return list;
  }, [networksQuery.data, normalizedSearch, filterStatus, filterLifecycle, filterRegion]);

  const activeData = tab === 'currencies' ? currenciesQuery.data
    : tab === 'methods' ? methodsQuery.data
    : tab === 'assets' ? assetsQuery.data
    : networksQuery.data;
  const regionOptions = useMemo(() => Array.from(new Set([
    'Global',
    ...(activeData || []).flatMap((item: any) => item.regions || []),
  ])).sort((left, right) => left.localeCompare(right)), [activeData]);

  const total = activeData?.length || 0;
  const activeCount = activeData?.filter(x => x.enabled).length || 0;
  const disabledCount = total - activeCount;
  const activePercent = total > 0 ? ((activeCount / total) * 100).toFixed(1) : '0.0';
  const disabledPercent = total > 0 ? ((disabledCount / total) * 100).toFixed(1) : '0.0';
  const recentlyAdded = activeData?.filter(x => isRecent(x.createdAt)).length || 0;
  const addedThisMonth = activeData?.filter(x => isRecent(x.createdAt, 30)).length || 0;

  const visibleData = tab === 'currencies' ? filteredCurrencies
    : tab === 'methods' ? filteredMethods
    : tab === 'assets' ? filteredAssets
    : filteredNetworks;

  const totalPages = Math.ceil(visibleData.length / pageSize) || 1;
  const clampedPage = Math.min(page, totalPages);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const paginatedData = visibleData.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const activeQuery = tab === 'currencies' ? currenciesQuery : tab === 'methods' ? methodsQuery : tab === 'assets' ? assetsQuery : networksQuery;

  const selectedCatalogIds = catalogSelected[tab];
  const selectedCatalogIdsOnPage = paginatedData
    .filter((item: any) => selectedCatalogIds.has(item.id))
    .map((item: any) => item.id);
  const allVisibleCatalogSelected = paginatedData.length > 0
    && selectedCatalogIdsOnPage.length === paginatedData.length;

  useEffect(() => {
    setCatalogSelected(current => current[tab].size === 0
      ? current
      : { ...current, [tab]: new Set() });
  }, [tab, search, filterRegion, filterStatus, filterLifecycle, page, pageSize]);

  const toggleCatalogItem = (section: typeof tab, id: string, checked: boolean) => {
    setCatalogSelected(current => {
      const next = new Set(current[section]);
      checked ? next.add(id) : next.delete(id);
      return { ...current, [section]: next };
    });
    setCatalogActionNotice(null);
  };

  const toggleAllVisibleCatalogItems = (checked: boolean) => {
    setCatalogSelected(current => {
      const next = new Set(current[tab]);
      paginatedData.forEach((item: any) => checked ? next.add(item.id) : next.delete(item.id));
      return { ...current, [tab]: next };
    });
    setCatalogActionNotice(null);
  };

  const runCatalogAction = async (action: 'enable' | 'disable' | 'delete') => {
    const ids = selectedCatalogIdsOnPage;
    if (!ids.length || catalogActionPending) return;
    if (action === 'delete' && !window.confirm(`Delete ${ids.length} selected ${tab === 'methods' ? 'payment methods' : tab}? This cannot be undone.`)) return;

    setCatalogActionPending(true);
    setCatalogActionNotice(null);
    const enabled = action === 'enable';
    const childNetworkPathsByAsset = new Map(
      tab === 'assets'
        ? ids.map(id => [id, (networksQuery.data || [])
          .filter((network: CryptoNetwork) => network.assetId === id)
          .map((network: CryptoNetwork) => (network as any).logoObjectPath as string | undefined)
          .filter(Boolean) as string[]])
        : [],
    );
    const results = await Promise.allSettled(ids.map(id => {
      if (tab === 'currencies') {
        return action === 'delete'
          ? deleteCatalogCurrency.mutateAsync({ id })
          : updateCatalogCurrency.mutateAsync({ id, data: { enabled } });
      }
      if (tab === 'methods') {
        return action === 'delete'
          ? deleteCatalogMethod.mutateAsync({ id })
          : updateCatalogMethod.mutateAsync({ id, data: { enabled } });
      }
      if (tab === 'assets') {
        return action === 'delete'
          ? deleteCatalogAsset.mutateAsync({ id })
          : updateCatalogAsset.mutateAsync({ id, data: { enabled } });
      }
      return action === 'delete'
        ? deleteCatalogNetwork.mutateAsync({ id })
        : updateCatalogNetwork.mutateAsync({ id, data: { enabled } });
    }));
    const succeededIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    if (action === 'delete') {
      await Promise.allSettled(succeededIds.map(id => {
        const item = (activeData || []).find((candidate: any) => candidate.id === id) as any;
        const path = item?.logoObjectPath || item?.flagObjectPath;
        if (!path) return Promise.resolve();
        const objectId = path.split('/').pop()!;
        if (tab === 'currencies') return deleteCatalogCurrencyFlag.mutateAsync({ id: objectId });
        if (tab === 'methods') return deleteCatalogMethodLogo.mutateAsync({ id: objectId });
        if (tab === 'assets') return deleteCatalogAssetLogo.mutateAsync({ id: objectId });
        return deleteCatalogNetworkLogo.mutateAsync({ id: objectId });
      }));
      if (tab === 'assets') {
        await Promise.allSettled(succeededIds.flatMap(id =>
          (childNetworkPathsByAsset.get(id) || []).map(path =>
            deleteCatalogNetworkLogo.mutateAsync({ id: path.split('/').pop()! }),
          ),
        ));
      }
    }
    const failedCount = ids.length - succeededIds.length;
    const queryKey = tab === 'currencies'
      ? getGetFiatCurrenciesQueryKey()
      : tab === 'methods'
        ? getGetPaymentMethodsQueryKey()
        : tab === 'assets'
          ? getGetCryptoAssetsQueryKey()
          : getGetCryptoNetworksQueryKey();
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() });
    setCatalogSelected(current => {
      const next = new Set(current[tab]);
      succeededIds.forEach(id => next.delete(id));
      return { ...current, [tab]: next };
    });
    setCatalogActionNotice({
      kind: failedCount ? 'error' : 'success',
      text: failedCount
        ? `${succeededIds.length} updated; ${failedCount} failed. Items still in use may need to be disabled instead of deleted.`
        : `${succeededIds.length} ${action === 'enable' ? 'activated' : action === 'disable' ? 'disabled' : 'deleted'}.`,
    });
    setCatalogActionPending(false);
  };

  const deleteSingle = async (id: string) => {
    if (!window.confirm(`Delete this ${tab === 'methods' ? 'payment method' : tab}? This cannot be undone.`)) return;
    setCatalogActionPending(true);
    setCatalogActionNotice(null);
    try {
      const item = (activeData || []).find((candidate: any) => candidate.id === id) as any;
      const childNetworkPaths = tab === 'assets'
        ? (networksQuery.data || [])
          .filter((network: CryptoNetwork) => network.assetId === id)
          .map((network: CryptoNetwork) => (network as any).logoObjectPath as string | undefined)
          .filter(Boolean) as string[]
        : [];
      if (tab === 'currencies') await deleteCatalogCurrency.mutateAsync({ id });
      else if (tab === 'methods') await deleteCatalogMethod.mutateAsync({ id });
      else if (tab === 'assets') await deleteCatalogAsset.mutateAsync({ id });
      else await deleteCatalogNetwork.mutateAsync({ id });
      const path = item?.logoObjectPath || item?.flagObjectPath;
      if (path) {
        const objectId = path.split('/').pop()!;
        if (tab === 'currencies') await deleteCatalogCurrencyFlag.mutateAsync({ id: objectId }).catch(() => undefined);
        else if (tab === 'methods') await deleteCatalogMethodLogo.mutateAsync({ id: objectId }).catch(() => undefined);
        else if (tab === 'assets') await deleteCatalogAssetLogo.mutateAsync({ id: objectId }).catch(() => undefined);
        else await deleteCatalogNetworkLogo.mutateAsync({ id: objectId }).catch(() => undefined);
      }
      if (tab === 'assets') {
        await Promise.allSettled(childNetworkPaths.map(path =>
          deleteCatalogNetworkLogo.mutateAsync({ id: path.split('/').pop()! }),
        ));
      }

      const queryKey = tab === 'currencies' ? getGetFiatCurrenciesQueryKey() : tab === 'methods' ? getGetPaymentMethodsQueryKey() : tab === 'assets' ? getGetCryptoAssetsQueryKey() : getGetCryptoNetworksQueryKey();
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() });
      setCatalogActionNotice({ kind: 'success', text: t('adminCatalog.item_deleted') });
      setCatalogSelected(current => {
        const next = new Set(current[tab]);
        next.delete(id);
        return { ...current, [tab]: next };
      });
    } catch (e) {
      setCatalogActionNotice({ kind: 'error', text: t('adminCatalog.failed_to_delete_item') });
    } finally {
      setCatalogActionPending(false);
    }
  };

  const renderTableRows = () => {
    if (activeQuery.isLoading) {
      return (
        <tr>
          <td colSpan={8} className="text-center py-12 text-slate-400">
            <Loader2 className="animate-spin mx-auto mb-2" size={24} />
            {t('adminCatalog.loading_catalog')}</td>
        </tr>
      );
    }

    if (activeQuery.isError) {
      return (
        <tr>
          <td colSpan={8} className="text-center py-12 text-red-400">
            <CircleAlert className="mx-auto mb-2" size={24} />
            {t('adminCatalog.failed_to_load_catalog_data_please_try')}</td>
        </tr>
      );
    }

    if (paginatedData.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="text-center py-12 text-slate-500">
            <Archive className="mx-auto mb-2 opacity-50" size={24} />
            {t('adminCatalog.no')}{tab} {t('adminCatalog.match_your_filters')}</td>
        </tr>
      );
    }

    return paginatedData.map((item: any) => {
      const isCur = tab === 'currencies';
      const isMeth = tab === 'methods';
      const isNet = tab === 'networks';
      const isAst = tab === 'assets';
      const networkAsset = isNet
        ? (assetsQuery.data || []).find((asset: CryptoAsset) => asset.id === item.assetId)
        : undefined;
      const assetNetworks = isAst
        ? (networksQuery.data || []).filter((network: CryptoNetwork) => network.assetId === item.id)
        : [];
      const symbol = isNet ? networkAsset?.code || item.networkCode : item.code;
      const codeOrId = isCur || isAst ? item.code : isNet ? item.networkCode : item.id;
      const name = isNet ? item.networkName : item.name;
      const precision = isCur ? item.precision : isAst || isNet ? item.decimals : '-';
      const lifecycle = item.lifecycle || 'Global';

      return (
        <tr key={item.id}>
           <td data-label={t('adminCatalog.select')}>{canManageCurrent && <input aria-label={isCur ? t('adminCatalog.select_currency_for_actions', { name: item.code }) : t('adminCatalog.select_item_for_actions', { name: isAst ? item.code : isMeth ? item.name : item.networkName })} type="checkbox" className="rounded border-slate-600 bg-transparent" checked={selectedCatalogIds.has(item.id)} onChange={e => toggleCatalogItem(tab, item.id, e.target.checked)} />}</td>
          <td data-label={isMeth ? 'Method' : isAst ? 'Asset' : isNet ? 'Asset / Network' : 'Currency'}>
            {isCur ? (
              <span className="catalog-fiat-identity">
                <FiatCurrencyFlag code={item.code} flagUrl={(item as any).flagUrl} variant="admin" />
                <strong className="font-mono">{item.code}</strong>
              </span>
            ) : isMeth ? (
              <span className="catalog-method-identity">
                <AdminPaymentLogo name={item.name} logoUrl={item.logoUrl} />
                <span className="catalog-method-copy">
                  <strong>{item.name}</strong>
                  <small className="catalog-row-id">{item.id}</small>
                </span>
              </span>
            ) : isAst ? (
              <AdminCryptoIdentity symbol={item.code} name={item.name} logoUrl={item.logoUrl} size="md" compact />
            ) : (
              <span>
                <AdminCryptoIdentity
                  symbol={symbol}
                  name={networkAsset?.name || item.networkName}
                  network={item.networkCode || item.networkName}
                  logoUrl={(networkAsset as any)?.logoUrl}
                  networkLogoUrl={(item as any)?.logoUrl}
                  size="md"
                  compact
                />
                <small className="catalog-row-id">{item.id}</small>
              </span>
            )}
          </td>
          <td data-label="Name">
            <span className="catalog-name-cell">
              <strong>{name}</strong>
              {isMeth && <small>{item.family || 'Generic'} · {item.executionMode || 'Standard'}</small>}
              {isAst && (
                <span className="catalog-network-chips">
                  {assetNetworks.map((network: CryptoNetwork) => {
                    const networkLabel = network.networkCode || network.networkName;
        return <span key={network.id} aria-label={t('adminCatalog.method_currency_on_network', { name: item.name, code: item.code, network: networkLabel })}>{networkLabel}</span>;
                  })}
                  {!assetNetworks.length && <small>{t('adminCatalog.no_networks_configured')}</small>}
                </span>
              )}
              {isNet && (
                <>
                  <small className={item.sharedDepositAddress ? 'font-mono' : undefined}>{item.sharedDepositAddress || 'Not configured'}</small>
                  {item.sharedDepositAddress && <small>{item.customerDepositsEnabled ? t('adminCatalog.deposit_ready') : t('adminCatalog.deposits_disabled')}</small>}
                </>
              )}
            </span>
          </td>
          <td data-label="Region">{item.regions ? item.regions.join(', ') || 'Global' : t('adminCatalog.global')}</td>
          <td data-label="Precision">{precision}</td>
          <td data-label="Lifecycle"><span className={`lifecycle-badge lifecycle-${String(lifecycle).toLowerCase()}`}>{lifecycle}</span></td>
          <td data-label="Status">
            <div className={`status-badge ${item.enabled ? 'active' : 'disabled'}`}>
              <div className="status-dot"></div>
              {item.enabled ? t('adminCatalog.active') : t('adminCatalog.disabled')}
            </div>
          </td>
          <td data-label="Actions">
             {canManageCurrent && <div className="flex items-center gap-2">
          <button type="button" aria-label={t('adminCatalog.edit_item_named', { name })} data-testid={`button-edit-${isCur ? `currency-${item.code}` : isMeth ? `method-${item.id}` : isAst ? `crypto-asset-${item.id}` : `crypto-network-${item.id}`}`} className="action-button hidden sm:flex" onClick={() => {
                if (isCur) setDrawerCurrency(item);
                else if (isMeth) setDrawerMethod(item);
                else if (isAst) setDrawerAsset(item);
                else if (isNet) setDrawerNetwork(item);
              }}>
                <Pencil size={14} />
              </button>
              <DropdownMenuPrimitive.Root>
                <DropdownMenuPrimitive.Trigger type="button" className="action-button" aria-label={t('adminCatalog.more_actions_for_item', { name })} disabled={catalogActionPending}>
                  <MoreHorizontal size={14} />
                </DropdownMenuPrimitive.Trigger>
                <DropdownMenuPrimitive.Portal>
                  <DropdownMenuPrimitive.Content className="admin-dropdown-content" sideOffset={4} align="end">
                    <DropdownMenuPrimitive.Item className="admin-dropdown-item sm:hidden" onSelect={() => {
                      if (isCur) setDrawerCurrency(item);
                      else if (isMeth) setDrawerMethod(item);
                      else if (isAst) setDrawerAsset(item);
                      else if (isNet) setDrawerNetwork(item);
                    }}>
                      <Pencil size={14} className="mr-2" /> {t('adminCatalog.edit')}</DropdownMenuPrimitive.Item>
                    <DropdownMenuPrimitive.Item className="admin-dropdown-item text-red-500" onSelect={() => deleteSingle(item.id)}>
                      <Trash2 size={14} className="mr-2" /> {t('adminCatalog.delete')}</DropdownMenuPrimitive.Item>
                  </DropdownMenuPrimitive.Content>
                </DropdownMenuPrimitive.Portal>
              </DropdownMenuPrimitive.Root>
             </div>}
          </td>
        </tr>
      );
    });
  };

  const getAddActionLabel = () => {
    switch (tab) {
      case 'currencies': return '+ Add Currency';
      case 'methods': return '+ Add Method';
      case 'assets': return '+ Add Asset';
      case 'networks': return '+ Add Network';
    }
  };

  const handleAdd = () => {
    switch (tab) {
      case 'currencies': setDrawerCurrency('new'); break;
      case 'methods': setDrawerMethod('new'); break;
      case 'assets': setDrawerAsset('new'); break;
      case 'networks': setDrawerNetwork('new'); break;
    }
  };

  const pageTitle = tab === 'currencies' ? t('adminCatalog.managed_currencies') : tab === 'methods' ? t('adminCatalog.payment_methods') : tab === 'assets' ? t('adminCatalog.crypto_assets') : t('adminCatalog.crypto_networks');

  return (
    <AdminShell
      title={t('adminCatalog.currency_and_methods')}
      eyebrow={t('adminCatalog.operations_settings')}
      subtitle={t('adminCatalog.manage_currencies_payment_methods_crypto_assets_and')}
      requiredPermission={['currencies.view', 'payment_methods.view', 'crypto_assets.view', 'crypto_networks.view']}
    >
      <div className="currencies-redesign">
        <div className="admin-page-actions catalog-page-actions">
           {isOwner && tab === 'assets' && (
             <button className="button button-outline mr-2" onClick={() => setSyncWhitebitOpen(true)}>
               <RefreshCw size={15} className="mr-2" />
               {t('adminCatalog.syncWithWhitebit')}
             </button>
           )}
           {canManageCurrent && <button className="button button-primary" onClick={handleAdd} data-testid={tab === 'currencies' ? 'button-add-currency' : tab === 'methods' ? 'button-add-method' : tab === 'assets' ? 'button-add-crypto-asset' : 'button-add-crypto-network'}>
            {tab === 'currencies' ? <Banknote size={15} /> : tab === 'methods' ? <CreditCard size={15} /> : tab === 'assets' ? <Zap size={15} /> : <Network size={15} />}
             {getAddActionLabel()}
                    </button>}
        </div>
        <div className="category-cards" role="group" aria-label={t('adminCatalog.catalog_category')}>
           {can('currencies.view') && <button type="button" aria-pressed={tab === 'currencies'} className={`category-card ${tab === 'currencies' ? 'active' : ''}`} onClick={() => handleTabChange('currencies')}>
            <div className="category-icon"><Globe2 size={20} /></div>
            <div className="text-left">
              <div className="font-bold text-sm category-card-title">{t('adminCatalog.currencies')}</div>
              <div className="text-xs text-muted-foreground">{t('adminCatalog.fiat_currencies')}{currenciesQuery.data?.length || 0})</div>
            </div>
           </button>}
           {can('payment_methods.view') && <button type="button" aria-pressed={tab === 'methods'} className={`category-card ${tab === 'methods' ? 'active' : ''}`} onClick={() => handleTabChange('methods')}>
            <div className="category-icon"><CreditCard size={20} /></div>
            <div className="text-left">
              <div className="font-bold text-sm category-card-title">{t('adminCatalog.payment_methods')}</div>
              <div className="text-xs text-muted-foreground">{t('adminCatalog.banks_e_wallets')}{methodsQuery.data?.length || 0})</div>
            </div>
           </button>}
           {can('crypto_assets.view') && <button type="button" aria-pressed={tab === 'assets'} className={`category-card ${tab === 'assets' ? 'active' : ''}`} onClick={() => handleTabChange('assets')}>
            <div className="category-icon"><Coins size={20} /></div>
            <div className="text-left">
              <div className="font-bold text-sm category-card-title">{t('adminCatalog.crypto_assets')}</div>
              <div className="text-xs text-muted-foreground">{t('adminCatalog.coins_tokens')}{assetsQuery.data?.length || 0})</div>
            </div>
           </button>}
           {can('crypto_networks.view') && <button type="button" aria-pressed={tab === 'networks'} className={`category-card ${tab === 'networks' ? 'active' : ''}`} onClick={() => handleTabChange('networks')}>
            <div className="category-icon"><Network size={20} /></div>
            <div className="text-left">
              <div className="font-bold text-sm category-card-title">{t('adminCatalog.crypto_networks')}</div>
              <div className="text-xs text-muted-foreground">{t('adminCatalog.networks_chains')}{networksQuery.data?.length || 0})</div>
            </div>
           </button>}
        </div>

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon blue"><Database size={18} /></div>
            <div>
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t('adminCatalog.total')}{tab}</div>
              <div className="font-bold text-2xl metric-value flex items-baseline gap-2">
                {total}
                {addedThisMonth > 0 && <span className="text-xs text-emerald-500 font-semibold mb-1">↑ +{addedThisMonth} {t('adminCatalog.this_month')}</span>}
              </div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon green"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981]"></div></div>
            <div>
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t('adminCatalog.active')}</div>
              <div className="font-bold text-2xl metric-value flex items-baseline gap-2">
                {activeCount}
                <span className="text-xs text-emerald-500 font-semibold mb-1">{activePercent}%</span>
              </div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon red"><div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_#EF4444]"></div></div>
            <div>
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t('adminCatalog.disabled')}</div>
              <div className="font-bold text-2xl metric-value flex items-baseline gap-2">
                {disabledCount}
                <span className="text-xs text-red-500 font-semibold mb-1">{disabledPercent}%</span>
              </div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon purple"><Clock3 size={18} /></div>
            <div>
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t('adminCatalog.recently_added')}</div>
              <div className="font-bold text-2xl metric-value flex items-baseline gap-2">
                {recentlyAdded}
                <span className="text-xs text-muted-foreground font-semibold mb-1">{t('adminCatalog.last_7_days')}</span>
              </div>
            </div>
          </div>
        </div>

        <section className="catalog-health-strip" aria-label={t('adminCatalog.rates_health')}>
          <div className="catalog-health-title">
            <span className="metric-icon blue"><Activity size={17} /></span>
            <span><small>{t('adminCatalog.provider')}</small><strong>{t('adminCatalog.rates_health_2')}</strong></span>
          </div>
          {healthQuery.isError ? (
            <button type="button" className="button button-secondary" onClick={() => healthQuery.refetch()}>{t('adminCatalog.retry_rates')}</button>
          ) : healthQuery.isLoading ? (
            <span className="catalog-health-loading"><Loader2 size={15} className="animate-spin" /> {t('adminCatalog.checking_live_rates')}</span>
          ) : health ? (
            <>
              <StatusPill status={`${health.state.charAt(0).toUpperCase()}${health.state.slice(1)}`} />
              <span className="catalog-health-stat"><small>{t('adminCatalog.configured')}</small><strong>{health.configured ? t('adminCatalog.yes') : t('adminCatalog.no')}</strong></span>
              <span className="catalog-health-stat"><small>{t('adminCatalog.last_fetched')}</small><strong>{health.fetchedAt ? ago(health.fetchedAt) : t('adminCatalog.never')}</strong></span>
              <span className="catalog-health-stat"><small>{t('adminCatalog.active_rates')}</small><strong>{health.rates?.length || 0}</strong></span>
              {!!health.rates?.length && (
                <div className="catalog-rate-chips" aria-label={t('adminCatalog.live_rate_quotes')}>
                  {health.rates.map((rate: any) => (
                    <span key={rate.currency}>{t('adminCatalog.usd')}{rate.currency} <strong>{number(rate.unitsPerUsd)}</strong></span>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>

        <div className="catalog-table-container">
          <div className="catalog-directory-heading">
            <div>
              <span className="section-kicker">{tab === 'currencies' ? t('adminCatalog.fiat_directory') : tab === 'methods' ? t('adminCatalog.payment_directory') : tab === 'assets' ? t('adminCatalog.asset_directory') : t('adminCatalog.network_directory')}</span>
              <h2>{pageTitle}</h2>
            </div>
            <span>{visibleData.length} {visibleData.length === 1 ? t('adminCatalog.entry') : t('adminCatalog.entries')}</span>
          </div>
          <div className="table-toolbar">
            <div className="flex-1 min-w-[200px]">
              <AdminSearch
                value={search}
                onChange={v => { setSearch(v); setPage(1); }}
                placeholder={t('adminCatalog.search_by_code_name_or_country')}
                testId="input-catalog-search"
              />
            </div>
            {tab !== 'assets' && (
              <select value={filterRegion} onChange={e => { setFilterRegion(e.target.value); setPage(1); }}>
                <option value="all">{t('adminCatalog.all_regions')}</option>
                {regionOptions.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            )}
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
              <option value="all">{t('adminCatalog.all_statuses')}</option>
              <option value="active">{t('adminCatalog.active')}</option>
              <option value="disabled">{t('adminCatalog.disabled')}</option>
            </select>
            <select value={filterLifecycle} onChange={e => { setFilterLifecycle(e.target.value); setPage(1); }}>
              <option value="all">{t('adminCatalog.all_lifecycles')}</option>
              <option value="active">{t('adminCatalog.active')}</option>
              <option value="restricted">{t('adminCatalog.restricted')}</option>
              <option value="deprecated">{t('adminCatalog.deprecated')}</option>
            </select>
            <button className="p-2 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors" onClick={() => {
              setSearch('');
              setFilterRegion('all');
              setFilterStatus('all');
              setFilterLifecycle('all');
            }}>
              <RefreshCw size={16} />
            </button>
          </div>

          {canManageCurrent && (selectedCatalogIdsOnPage.length > 0 || catalogActionNotice) && (
            <>
              {selectedCatalogIdsOnPage.length > 0 && <div className="bulk-actions-toolbar visible admin-list-bulk-toolbar" data-testid={`catalog-bulk-actions-${tab}`}>
                <div className="bulk-actions-inner">
                  <span className="bulk-actions-count"><Check size={14} /> {selectedCatalogIdsOnPage.length} {t('adminCatalog.selected')}</span>
                  <div className="bulk-actions-divider" />
                  <button type="button" disabled={catalogActionPending} onClick={() => runCatalogAction('enable')}><Power size={14} /> {t('adminCatalog.active')}</button>
                  <div className="bulk-actions-divider" />
                  <button type="button" disabled={catalogActionPending} onClick={() => runCatalogAction('disable')}><Power size={14} /> {t('adminCatalog.disabled')}</button>
                  <div className="bulk-actions-divider" />
                  {isOwner && tab === 'assets' && (
                    <>
                      <button type="button" disabled={catalogActionPending} onClick={() => setBulkEditAssetsOpen(true)}><Pencil size={14} /> {t('adminCatalog.edit') || 'Edit'}</button>
                      <div className="bulk-actions-divider" />
                    </>
                  )}
                  <button type="button" className="bulk-actions-delete" disabled={catalogActionPending} onClick={() => runCatalogAction('delete')}><Trash2 size={14} /> {t('adminCatalog.delete')}</button>
                </div>
              </div>}
              {catalogActionNotice && <div className={`bulk-actions-notice text-sm ${catalogActionNotice.kind === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>{catalogActionNotice.text}</div>}
            </>
          )}
          <div className="w-full relative group">
            <div className="swipeable-scroll-hint" aria-hidden="true" />
            <div className="overflow-x-auto" onScroll={(e) => {
              const target = e.target as HTMLElement;
              const hint = target.previousElementSibling as HTMLElement;
              if (hint) {
                hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
                hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
              }
            }}>
            <table className="catalog-table">
              <thead>
                <tr>
                  <th className="w-10">{canManageCurrent && <input type="checkbox" aria-label={t('adminCatalog.select_all_visible_tab', { tab: pageTitle })} className="rounded border-border bg-transparent" checked={allVisibleCatalogSelected} onChange={e => toggleAllVisibleCatalogItems(e.target.checked)} />}</th>
                  <th>{tab === 'methods' ? t('adminCatalog.method') : tab === 'assets' ? t('adminCatalog.asset') : tab === 'networks' ? t('adminCatalog.asset_network') : t('adminCatalog.currency')}</th>
                  <th>{t('adminCatalog.name')}</th>
                  <th>{t('adminCatalog.region')}</th>
                  <th>{t('adminCatalog.precision')}</th>
                  <th>{t('adminCatalog.lifecycle')}</th>
                  <th>{t('adminCatalog.status')}</th>
                  <th className="w-24">{t('adminCatalog.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {renderTableRows()}
              </tbody>
            </table>
          </div>
          </div>

          <div className="pagination-bar border-t border-border">
            <div className="text-sm text-muted-foreground">
              {t('adminCatalog.showing')}{paginatedData.length > 0 ? (clampedPage - 1) * pageSize + 1 : 0} {t('adminCatalog.to')}{Math.min(clampedPage * pageSize, visibleData.length)} {t('adminCatalog.of')}{visibleData.length} {t('adminCatalog.entries')}</div>
            <div className="flex items-center gap-6">
              <div className="pagination-controls">
                <button type="button" aria-label={t('adminCatalog.previous_page')} className="page-btn" disabled={clampedPage === 1} onClick={() => setPage(p => p - 1)}>{t('adminCatalog.lt')}</button>
                {Array.from({ length: totalPages }).map((_, i) => {
                  const p = i + 1;
                  // Compact numbered pagination around current page
                  if (p === 1 || p === totalPages || (p >= clampedPage - 1 && p <= clampedPage + 1)) {
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={t('adminCatalog.page_number', { page: p })}
                        aria-current={clampedPage === p ? 'page' : undefined}
                        className={`page-btn ${clampedPage === p ? 'active' : ''}`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    );
                  }
                  if (p === clampedPage - 2 || p === clampedPage + 2) {
                    return <span key={i} className="text-muted-foreground px-1 self-end">...</span>;
                  }
                  return null;
                })}
                <button type="button" aria-label={t('adminCatalog.next_page')} className="page-btn" disabled={clampedPage === totalPages} onClick={() => setPage(p => p + 1)}>{t('adminCatalog.gt')}</button>
              </div>
              <select
                className="bg-input border border-border text-foreground rounded-md p-1.5 text-sm outline-none"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                <option value={15}>{t('adminCatalog.15_per_page')}</option>
                <option value={25}>{t('adminCatalog.25_per_page')}</option>
                <option value={50}>{t('adminCatalog.50_per_page')}</option>
                <option value={100}>{t('adminCatalog.100_per_page')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {can('currencies.manage') && drawerCurrency && (
        <CurrencyDrawer
          currency={drawerCurrency === 'new' ? undefined : drawerCurrency}
          onClose={() => setDrawerCurrency(null)}
        />
      )}
      {can('payment_methods.manage') && drawerMethod && (
        <PaymentMethodDrawer
          method={drawerMethod === 'new' ? undefined : drawerMethod}
          onClose={() => setDrawerMethod(null)}
        />
      )}
      {can('crypto_assets.manage') && drawerAsset && (
        <AssetDrawer
          asset={drawerAsset}
          onClose={() => setDrawerAsset(null)}
          onWalletReconciled={(enabled, remainedDisabled) => setCatalogActionNotice({
            kind: 'success',
            text: `${enabled} enabled / ${remainedDisabled} remained disabled.`,
          })}
        />
      )}
      {can('crypto_networks.manage') && drawerNetwork && (
        <NetworkDrawer
          network={drawerNetwork}
          onClose={() => setDrawerNetwork(null)}
        />
      )}
      <AdminWhitebitAssetSyncDialog
        open={syncWhitebitOpen}
        onOpenChange={setSyncWhitebitOpen}
      />
      {bulkEditAssetsOpen && assetsQuery.data && networksQuery.data && (
        <AdminCryptoAssetsBulkEditDialog
          open={bulkEditAssetsOpen}
          onOpenChange={setBulkEditAssetsOpen}
          selectedAssetIds={Array.from(catalogSelected.assets)}
          assets={assetsQuery.data}
          networks={networksQuery.data}
          onSuccess={() => {
            setCatalogSelected(prev => ({ ...prev, assets: new Set() }));
            setBulkEditAssetsOpen(false);
          }}
        />
      )}
    </AdminShell>
  );
}


const pricingOptionLabel = (option: SettlementOption | undefined, fallback: string) => {
  if (!option) return fallback;
  if (option.id.startsWith(ASSET_PRICING_OPTION_PREFIX)) return option.assetCode;
  const detail = option.kind === 'crypto-network'
    ? option.networkTitle || option.title || option.routeNetwork
    : option.title || option.routeNetwork;
  return `${option.assetCode} — ${detail}`;
};
const ALL_NETWORKS_PRICING_SELECTOR = '__ALL_NETWORKS__';
const ASSET_PRICING_OPTION_PREFIX = '__asset_pricing__:';
const assetPricingOptionId = (assetId: string) => `${ASSET_PRICING_OPTION_PREFIX}${assetId}`;
const isAssetPricingOption = (option: SettlementOption | undefined) =>
  Boolean(option?.id.startsWith(ASSET_PRICING_OPTION_PREFIX));
const withAssetPricingOptions = (options: SettlementOption[]) => {
  const cryptoByAsset = new Map<string, SettlementOption[]>();
  for (const option of options) {
    if (option.kind !== 'crypto-network' || !option.assetId) continue;
    cryptoByAsset.set(option.assetId, [...(cryptoByAsset.get(option.assetId) ?? []), option]);
  }
  const assets = [...cryptoByAsset.entries()].map(([assetId, assetOptions]) => {
    const representative = assetOptions[0]!;
    const canSend = assetOptions.some(option => option.direction === 'send' || option.direction === 'both');
    const canReceive = assetOptions.some(option => option.direction === 'receive' || option.direction === 'both');
    return {
      ...representative,
      id: assetPricingOptionId(assetId),
      assetId,
      title: representative.assetCode,
      networkTitle: '',
      networkSlug: '',
      routeNetwork: '',
      direction: canSend && canReceive ? 'both' : canSend ? 'send' : 'receive',
    } satisfies SettlementOption;
  });
  return [...options.filter(option => option.kind !== 'crypto-network'), ...assets];
};
const pricingRuleSelectionId = (rule: ManualDeskPricingRule | undefined, side: 'source' | 'target') => {
  if (!rule) return '';
  const optionId = side === 'source' ? rule.sourceSettlementOptionId : rule.targetSettlementOptionId;
  if (optionId) return optionId;
  const assetId = side === 'source' ? rule.sourceCryptoAssetId : rule.targetCryptoAssetId;
  return assetId ? assetPricingOptionId(assetId) : '';
};
const normalizedPricingRoutePart = (value: string | null | undefined) =>
  value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || '';
const resolvePricingRuleOption = (
  rule: ManualDeskPricingRule,
  options: SettlementOption[],
  side: 'source' | 'target',
) => {
  const optionId = side === 'source' ? rule.sourceSettlementOptionId : rule.targetSettlementOptionId;
  const optionById = optionId
    ? options.find(option => sameSettlementOptionId(option.id, optionId))
    : undefined;
  if (optionById) return optionById;

  const cryptoAssetId = side === 'source' ? rule.sourceCryptoAssetId : rule.targetCryptoAssetId;
  if (cryptoAssetId) {
    const byAssetId = options.find(option => isAssetPricingOption(option) && option.assetId === cryptoAssetId);
    if (byAssetId) return byAssetId;
  }
  const asset = normalizedPricingRoutePart(side === 'source' ? rule.sourceAsset : rule.targetAsset);
  const network = normalizedPricingRoutePart(side === 'source' ? rule.sourceNetwork : rule.targetNetwork);
  const method = normalizedPricingRoutePart(side === 'source' ? rule.paymentMethod : rule.payoutMethod);
  if (!asset && !network && !method) return undefined;

  return options
    .map(option => {
      const optionAsset = normalizedPricingRoutePart(option.assetCode);
      const optionRouteParts = [
        option.paymentMethodId,
        option.title,
        option.networkTitle,
        option.networkSlug,
        option.routeNetwork,
      ].map(normalizedPricingRoutePart).filter(Boolean);
      if (asset && optionAsset !== asset) return { option, score: -1 };
       const networkMatches = !network || network === normalizedPricingRoutePart(ALL_NETWORKS_PRICING_SELECTOR)
         || isAssetPricingOption(option) || optionRouteParts.some(part => part === network || part.includes(network) || network.includes(part));
      const methodMatches = !method || optionRouteParts.some(part => part === method || part.includes(method) || method.includes(part));
      if (!networkMatches || !methodMatches) return { option, score: -1 };
      return {
        option,
        score: (asset ? 8 : 0) + (network ? 4 : 0) + (method ? 4 : 0),
      };
    })
    .filter(candidate => candidate.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.option;
};
const pricingSelectorLabel = (rule: ManualDeskPricingRule, settlementOptions: SettlementOption[] = []) => {
  if (rule.sourceCryptoAssetId || rule.targetCryptoAssetId) {
    const source = rule.sourceCryptoAssetId
      ? settlementOptions.find(option => option.assetId === rule.sourceCryptoAssetId)?.assetCode || rule.sourceAsset || 'Unavailable asset'
      : rule.sourceSettlementOptionId ? pricingOptionLabel(settlementOptions.find(option => sameSettlementOptionId(option.id, rule.sourceSettlementOptionId)), rule.sourceAsset || 'Unavailable option') : 'Any source';
    const target = rule.targetCryptoAssetId
      ? settlementOptions.find(option => option.assetId === rule.targetCryptoAssetId)?.assetCode || rule.targetAsset || 'Unavailable asset'
      : rule.targetSettlementOptionId ? pricingOptionLabel(settlementOptions.find(option => sameSettlementOptionId(option.id, rule.targetSettlementOptionId)), rule.targetAsset || 'Unavailable option') : 'Any target';
    return `${source} → ${target}`;
  }
  const sourceAssetWildcard = rule.sourceAsset && rule.sourceNetwork === ALL_NETWORKS_PRICING_SELECTOR;
  const targetAssetWildcard = rule.targetAsset && rule.targetNetwork === ALL_NETWORKS_PRICING_SELECTOR;
  if (sourceAssetWildcard || targetAssetWildcard) {
    const source = sourceAssetWildcard ? `${rule.sourceAsset}`
      : rule.sourceSettlementOptionId
        ? pricingOptionLabel(settlementOptions.find(option => sameSettlementOptionId(option.id, rule.sourceSettlementOptionId!)), rule.sourceAsset || 'Unavailable option')
        : 'Any source';
    const target = targetAssetWildcard ? `${rule.targetAsset}`
      : rule.targetSettlementOptionId
        ? pricingOptionLabel(settlementOptions.find(option => sameSettlementOptionId(option.id, rule.targetSettlementOptionId!)), rule.targetAsset || 'Unavailable option')
        : 'Any target';
    return `${source} → ${target}`;
  }
  if (rule.sourceSettlementOptionId || rule.targetSettlementOptionId) {
    const source = rule.sourceSettlementOptionId
      ? settlementOptions.find(option => sameSettlementOptionId(option.id, rule.sourceSettlementOptionId))
      : undefined;
    const target = rule.targetSettlementOptionId
      ? settlementOptions.find(option => sameSettlementOptionId(option.id, rule.targetSettlementOptionId))
      : undefined;
    return `${rule.sourceSettlementOptionId ? pricingOptionLabel(source, rule.sourceAsset || 'Unavailable option') : 'Any source'} → ${rule.targetSettlementOptionId ? pricingOptionLabel(target, rule.targetAsset || 'Unavailable option') : 'Any target'}`;
  }
  if (!rule.legacyAmbiguous) return 'Any source → Any target';
  const route = `${rule.sourceAsset || 'Any'} / ${rule.sourceNetwork || 'any'} → ${rule.targetAsset || 'Any'} / ${rule.targetNetwork || 'any'}`;
  const methods = [rule.paymentMethod && `Pay: ${rule.paymentMethod}`, rule.payoutMethod && `Payout: ${rule.payoutMethod}`].filter(Boolean);
  return `${route}${methods.length ? ` · ${methods.join(' · ')}` : ''}`;
};
const pricingRuleInput = (rule: ManualDeskPricingRule, enabled = rule.enabled): ManualDeskPricingRuleInput => ({
  name: rule.name,
  sourceAsset: rule.sourceAsset,
  targetAsset: rule.targetAsset,
  sourceCryptoAssetId: rule.sourceCryptoAssetId,
  targetCryptoAssetId: rule.targetCryptoAssetId,
  sourceNetwork: rule.sourceNetwork,
  targetNetwork: rule.targetNetwork,
  paymentMethod: rule.paymentMethod,
  payoutMethod: rule.payoutMethod,
  sourceSettlementOptionId: rule.sourceSettlementOptionId,
  targetSettlementOptionId: rule.targetSettlementOptionId,
  markupBasisPoints: rule.markupBasisPoints,
  adjustmentDirection: rule.adjustmentDirection || 'MARKUP',
  exactRate: rule.exactRate ?? null,
  fixedFee: rule.fixedFee,
  priority: rule.priority,
  enabled,
  minAmount: rule.minAmount,
  maxAmount: rule.maxAmount,
  operatorInstructions: rule.operatorInstructions,
  customerInstructions: rule.customerInstructions,
  expectedSettlementMinutes: rule.expectedSettlementMinutes,
});

const pricingCoverageSelectorKeys = [
  'sourceAsset', 'targetAsset', 'sourceNetwork', 'targetNetwork',
  'paymentMethod', 'payoutMethod', 'sourceSettlementOptionId', 'targetSettlementOptionId',
  'sourceCryptoAssetId', 'targetCryptoAssetId',
] as const;
const canonicalPricingRuleInput = (
  rule: ManualDeskPricingRule,
  settlementOptions: SettlementOption[],
  enabled = rule.enabled,
): ManualDeskPricingRuleInput => {
  const input = pricingRuleInput(rule, enabled);
  const sourceOption = rule.sourceSettlementOptionId
    ? settlementOptions.find(option => sameSettlementOptionId(option.id, rule.sourceSettlementOptionId))
    : undefined;
  const targetOption = rule.targetSettlementOptionId
    ? settlementOptions.find(option => sameSettlementOptionId(option.id, rule.targetSettlementOptionId))
    : undefined;
  if (rule.sourceSettlementOptionId && !sourceOption) {
    throw new Error('The rule source option is no longer available. Refresh the page before changing its status.');
  }
  if (rule.targetSettlementOptionId && !targetOption) {
    throw new Error('The rule target option is no longer available. Refresh the page before changing its status.');
  }
  return {
    ...input,
    sourceCryptoAssetId: input.sourceCryptoAssetId,
    targetCryptoAssetId: input.targetCryptoAssetId,
    sourceAsset: sourceOption?.assetCode ?? input.sourceAsset,
    targetAsset: targetOption?.assetCode ?? input.targetAsset,
    sourceSettlementOptionId: sourceOption?.id ?? input.sourceSettlementOptionId,
    targetSettlementOptionId: targetOption?.id ?? input.targetSettlementOptionId,
  };
};

function PricingOptionMultiSelect({
  values,
  options,
  onChange,
  label,
  testId,
}: {
  values: string[];
  options: SettlementOption[];
  onChange: (values: string[]) => void;
  label: string;
  testId: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const normalizedQuery = query.trim().toLowerCase();
  const sorted = useMemo(() => [...options].sort((left, right) =>
    pricingOptionLabel(left, left.title).localeCompare(pricingOptionLabel(right, right.title))
  ), [options]);
  const filtered = useMemo(() => sorted.filter(option => [
    option.assetCode,
    option.title,
    option.networkTitle,
    option.routeNetwork,
  ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)), [normalizedQuery, sorted]);
  const filteredIds = useMemo(() => filtered.map(option => option.id), [filtered]);
  const filteredIdSet = useMemo(() => new Set(filteredIds), [filteredIds]);
  const selected = new Set(values);
  const toggle = (id: string) => onChange(
    selected.has(id) ? values.filter(value => value !== id) : [...values, id],
  );
  const selectAllVisible = () => onChange(filteredIds);
  const clearAllVisible = () => onChange(
    normalizedQuery
      ? values.filter(value => !filteredIdSet.has(value))
      : [],
  );
  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const margin = 12;
    const gap = 8;
    const availableBelow = viewportHeight - rect.bottom - gap - margin;
    const availableAbove = rect.top - gap - margin;
    const openAbove = availableBelow < 240 && availableAbove > availableBelow;
    const width = Math.min(Math.max(rect.width, 280), viewportWidth - margin * 2);
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, viewportWidth - width - margin),
    );
    const maxHeight = Math.max(180, Math.min(360, openAbove ? availableAbove : availableBelow));
    setPanelStyle(openAbove
      ? { left, bottom: viewportHeight - rect.top + gap, width, maxHeight }
      : { left, top: rect.bottom + gap, width, maxHeight });
  }, []);
  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    window.visualViewport?.addEventListener('resize', updatePanelPosition);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.visualViewport?.removeEventListener('resize', updatePanelPosition);
    };
  }, [open, updatePanelPosition]);
  return (
    <div ref={rootRef} className="pricing-multi-select" data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        className="pricing-multi-trigger"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span>{values.length ? `${values.length} selected` : `Select ${label.toLowerCase()}`}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && createPortal(
        <div ref={panelRef} className="pricing-multi-panel" style={panelStyle}>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label}`}
            autoFocus
          />
          <div className="pricing-multi-tools">
            <button type="button" onClick={selectAllVisible} disabled={!filteredIds.length}>Select All</button>
            <button type="button" onClick={clearAllVisible}>Clear All</button>
            <strong>{values.length} selected</strong>
          </div>
          <div className="pricing-multi-options">
            {filtered.map(option => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  checked={selected.has(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <span>{pricingOptionLabel(option, option.title)}</span>
              </label>
            ))}
            {!filtered.length && <small>No options match your search.</small>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function PricingRuleDrawer({ rule, rules, onClose }: { rule?: ManualDeskPricingRule; rules: ManualDeskPricingRule[]; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const config = useGetExchangeConfig({ query: { queryKey: getGetExchangeConfigQueryKey() } });
  const drawerRef = useRef<HTMLElement>(null);
  const drawerHeadRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    name: rule?.name || '',
    sourceSettlementOptionId: pricingRuleSelectionId(rule, 'source'),
    targetSettlementOptionId: pricingRuleSelectionId(rule, 'target'),
    markupPercent: String((rule?.markupBasisPoints ?? 60) / 100),
    adjustmentDirection: rule?.adjustmentDirection || 'MARKUP',
    exactRate: rule?.exactRate || '',
    fixedFee: rule?.fixedFee || '',
    minAmount: rule?.minAmount || '',
    maxAmount: rule?.maxAmount || '',
    expectedSettlementMinutes: rule?.expectedSettlementMinutes?.toString() || '',
    operatorInstructions: rule?.operatorInstructions || '',
    customerInstructions: rule?.customerInstructions || '',
    priority: String(rule?.priority ?? 0),
    enabled: rule?.enabled ?? true,
  });
  const [error, setError] = useState('');
  const [sourceMode, setSourceMode] = useState<'single' | 'multiple'>('single');
  const [targetMode, setTargetMode] = useState<'single' | 'multiple'>('single');
  const [sourceSelections, setSourceSelections] = useState<string[]>([]);
  const [targetSelections, setTargetSelections] = useState<string[]>([]);
  const reciprocalRate = (value: string) => {
    const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value.trim());
    if (!match || /^0(?:\.0*)?$/.test(value.trim())) return '';
    const fraction = match[2] || '';
    let coefficient = (10n ** BigInt(36 + fraction.length)) / BigInt(`${match[1]}${fraction}`);
    let scale = 36;
    while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale--; }
    const digits = coefficient.toString().padStart(scale + 1, '0');
    return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  };

  useEffect(() => {
    const drawer = drawerRef.current;
    const head = drawerHeadRef.current;
    if (!drawer || !head) return;

    const syncHeaderHeight = () => {
      drawer.style.setProperty('--pricing-drawer-head-height', `${head.getBoundingClientRect().height}px`);
    };
    syncHeaderHeight();
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  const createRule = useCreateManualDeskPricingRule();
  const bulkCreateRules = useBulkCreateManualDeskPricingRules();
  const updateRule = useUpdateManualDeskPricingRule();
  const pending = createRule.isPending || bulkCreateRules.isPending || updateRule.isPending;
  const set = (key: keyof typeof form, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));

  const allOptions = config.data?.manualSettlementOptions || [];
  const pricingOptions = useMemo(() => withAssetPricingOptions(allOptions), [allOptions]);
  const fromOptions = pricingOptions.filter(o => o.direction === 'send' || o.direction === 'both');
  const toOptions = pricingOptions.filter(o => o.direction === 'receive' || o.direction === 'both');
  const projectedSourceOption = fromOptions.find(o => sameSettlementOptionId(o.id, form.sourceSettlementOptionId));
  const projectedTargetOption = toOptions.find(o => sameSettlementOptionId(o.id, form.targetSettlementOptionId));
  useEffect(() => {
    if (!rule) return;
    const source = resolvePricingRuleOption(rule, fromOptions, 'source');
    const target = resolvePricingRuleOption(rule, toOptions, 'target');
    setForm(current => ({
      ...current,
      sourceSettlementOptionId: source?.id || '',
      targetSettlementOptionId: target?.id || '',
    }));
  }, [rule, fromOptions, toOptions]);
  const projectedRule: PricingCoverageRule = {
    id: rule?.id || '__new__',
    name: form.name,
    sourceAsset: isAssetPricingOption(projectedSourceOption) ? null : projectedSourceOption?.assetCode ?? null,
    targetAsset: isAssetPricingOption(projectedTargetOption) ? null : projectedTargetOption?.assetCode ?? null,
    sourceNetwork: isAssetPricingOption(projectedSourceOption) ? null : projectedSourceOption?.routeNetwork ?? null,
    targetNetwork: isAssetPricingOption(projectedTargetOption) ? null : projectedTargetOption?.routeNetwork ?? null,
    paymentMethod: null,
    payoutMethod: null,
    sourceSettlementOptionId: isAssetPricingOption(projectedSourceOption) ? null : projectedSourceOption?.id ?? null,
    targetSettlementOptionId: isAssetPricingOption(projectedTargetOption) ? null : projectedTargetOption?.id ?? null,
    sourceCryptoAssetId: isAssetPricingOption(projectedSourceOption) ? projectedSourceOption?.assetId ?? null : null,
    targetCryptoAssetId: isAssetPricingOption(projectedTargetOption) ? projectedTargetOption?.assetId ?? null : null,
    markupBasisPoints: 0,
    exactRate: form.exactRate.trim() || null,
    fixedFee: null,
    priority: Number(form.priority) || 0,
    enabled: form.enabled,
    minAmount: null,
    maxAmount: null,
    operatorInstructions: null,
    customerInstructions: null,
    expectedSettlementMinutes: null,
  };
  const projectedRules = [
    ...rules.filter(candidate => candidate.id !== rule?.id).map(candidate => ({
      ...pricingRuleInput(candidate),
      id: candidate.id,
    })),
    projectedRule,
  ];
  const projectedUncoveredRoutes = evaluateProjectedPricingCoverage(projectedRules, allOptions);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const sourceOpt = fromOptions.find(o => sameSettlementOptionId(o.id, form.sourceSettlementOptionId));
    const targetOpt = toOptions.find(o => sameSettlementOptionId(o.id, form.targetSettlementOptionId));
    const selectedSourceOptions = sourceMode === 'multiple'
      ? sourceSelections.map(id => fromOptions.find(option => sameSettlementOptionId(option.id, id))).filter(Boolean) as SettlementOption[]
      : [sourceOpt];
    const selectedTargetOptions = targetMode === 'multiple'
      ? targetSelections.map(id => toOptions.find(option => sameSettlementOptionId(option.id, id))).filter(Boolean) as SettlementOption[]
      : [targetOpt];
    if (!rule && sourceMode === 'multiple' && !selectedSourceOptions.length) {
      setError('Select at least one source option.');
      return;
    }
    if (!rule && targetMode === 'multiple' && !selectedTargetOptions.length) {
      setError('Select at least one target option.');
      return;
    }
    if (
      selectedSourceOptions.length !== (sourceMode === 'multiple' ? sourceSelections.length : 1) ||
      selectedTargetOptions.length !== (targetMode === 'multiple' ? targetSelections.length : 1)
    ) {
      setError('One or more selected options are no longer available. Refresh the page and choose current options.');
      return;
    }
    if (form.sourceSettlementOptionId && !sourceOpt) {
      setError('The selected source option is no longer available. Refresh the page and choose a current option.');
      return;
    }
    if (form.targetSettlementOptionId && !targetOpt) {
      setError('The selected target option is no longer available. Refresh the page and choose a current option.');
      return;
    }
    if (sourceOpt && targetOpt && sourceOpt.id === targetOpt.id) {
      setError('Source and target options must be different.');
      return;
    }
    if (
      (targetOpt && selectedSourceOptions.some(option => option?.id === targetOpt.id)) ||
      (sourceOpt && selectedTargetOptions.some(option => option?.id === sourceOpt.id))
    ) {
      setError('Source and target options must be different.');
      return;
    }
    const markupText = form.markupPercent.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(markupText)) {
       setError('Percentage must be nonnegative with at most two decimal places.');
      return;
    }
    const markupBasisPoints = Number(markupText) * 100;
    if (!Number.isInteger(markupBasisPoints) || markupBasisPoints > 10000) {
       setError('Percentage must be between 0% and 100%, in increments of 0.01%.');
      return;
    }
    const payloadFor = (
      selectedSource: SettlementOption | undefined,
      selectedTarget: SettlementOption | undefined,
    ): ManualDeskPricingRuleInput => ({
      name: form.name.trim(),
       sourceAsset: isAssetPricingOption(selectedSource) ? null : selectedSource?.assetCode ?? null,
       targetAsset: isAssetPricingOption(selectedTarget) ? null : selectedTarget?.assetCode ?? null,
       sourceNetwork: isAssetPricingOption(selectedSource) ? null : selectedSource?.routeNetwork ?? null,
       targetNetwork: isAssetPricingOption(selectedTarget) ? null : selectedTarget?.routeNetwork ?? null,
       paymentMethod: isAssetPricingOption(selectedSource) || isAssetPricingOption(selectedTarget) ? null : null,
       payoutMethod: null,
       sourceCryptoAssetId: isAssetPricingOption(selectedSource) ? selectedSource?.assetId ?? null : null,
       targetCryptoAssetId: isAssetPricingOption(selectedTarget) ? selectedTarget?.assetId ?? null : null,
       sourceSettlementOptionId: isAssetPricingOption(selectedSource) ? null : selectedSource?.id ?? null,
       targetSettlementOptionId: isAssetPricingOption(selectedTarget) ? null : selectedTarget?.id ?? null,
      markupBasisPoints,
      adjustmentDirection: form.adjustmentDirection as 'MARKUP' | 'GIVE_MORE',
      exactRate: form.exactRate.trim() || null,
      fixedFee: form.fixedFee.trim() || null,
      minAmount: form.minAmount.trim() || null,
      maxAmount: form.maxAmount.trim() || null,
      expectedSettlementMinutes: parseInt(form.expectedSettlementMinutes) || null,
      operatorInstructions: form.operatorInstructions.trim() || null,
      customerInstructions: form.customerInstructions.trim() || null,
      priority: Number(form.priority),
      enabled: form.enabled,
    });
    const payload = payloadFor(sourceOpt, targetOpt);
    const success = () => { queryClient.invalidateQueries({ queryKey: getListManualDeskPricingRulesQueryKey() }); onClose(); };
    const failure = (err: unknown) => {
      const code = apiErrorData(err)?.code;
      setError(
        code === 'MANUAL_PRICING_RULE_VERSION_CONFLICT'
          ? 'This rule changed since you opened it. Close, refresh, and try again with the latest version.'
          : code === 'MANUAL_PRICING_RULE_CONFLICT'
            ? 'Another rule with the same priority overlaps this route. Change the priority or make the source and target more specific.'
            : apiErrorText(err, t('adminPricing.could_not_save_this_pricing_rule')),
      );
    };
    if (rule && !rule.readOnly) {
      updateRule.mutate({ id: rule.id, data: { ...payload, version: rule.version } }, { onSuccess: success, onError: failure });
      return;
    }
    const expandedPairs = sourceMode === 'multiple' || targetMode === 'multiple'
      ? selectedSourceOptions.flatMap(selectedSource =>
          selectedTargetOptions
            .filter(selectedTarget =>
              selectedSource?.id !== selectedTarget?.id
              && !(isAssetPricingOption(selectedSource) && isAssetPricingOption(selectedTarget)),
            )
            .map(selectedTarget => [selectedSource, selectedTarget] as const),
        )
      : [];
    const bulkRules = Array.from(new Map(
      expandedPairs.map(([selectedSource, selectedTarget]) => {
        const candidate = payloadFor(selectedSource, selectedTarget);
        const routeKey = JSON.stringify([
          candidate.sourceCryptoAssetId,
          candidate.targetCryptoAssetId,
          candidate.sourceSettlementOptionId,
          candidate.targetSettlementOptionId,
          candidate.priority,
        ]);
        return [routeKey, candidate] as const;
      }),
    ).values());
    if ((sourceMode === 'multiple' || targetMode === 'multiple') && !bulkRules.length) {
      setError('The selected source and target options do not contain any valid pricing routes.');
      return;
    }
    if (bulkRules.length) {
      if (!window.confirm(`Create ${bulkRules.length} pricing rules?`)) return;
      bulkCreateRules.mutate({ data: { rules: bulkRules } }, { onSuccess: success, onError: failure });
    } else {
      createRule.mutate({ data: payload }, { onSuccess: success, onError: failure });
    }
  };

  return createPortal(<div className="drawer-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
    <aside ref={drawerRef} className="order-drawer pricing-drawer" role="dialog" aria-label={rule ? t('adminPricing.edit_pricing_rule') : t('adminPricing.add_pricing_rule')} data-testid="pricing-rule-drawer">
      <div ref={drawerHeadRef} className="drawer-head pricing-rule-drawer-head">
        <div className="pricing-rule-drawer-title">
          <span className="pricing-rule-drawer-icon"><TrendingUp size={18} /></span>
          <div><span className="section-kicker">{rule?.readOnly ? t('adminPricing.view_only') : t('adminPricing.full_replacement')}</span><h2>{rule ? (rule.readOnly ? t('adminPricing.view_legacy_rule') : t('adminPricing.edit_pricing_rule')) : t('adminPricing.add_pricing_rule')}</h2></div>
        </div>
        <button className="pricing-rule-drawer-close" onClick={onClose} aria-label={t('adminPricing.close')} data-testid="button-close-pricing-drawer"><X size={17} /></button>
      </div>
      <form className="admin-form admin-form-card drawer-edit pricing-rule-form-card" onSubmit={save}>
        {error && <InlineNotice kind="error">{error}</InlineNotice>}
        {rule?.readOnly && <InlineNotice kind="warning">{t('adminPricing.this_rule_uses_legacy_free_text_matching')}</InlineNotice>}
        {!rule?.readOnly && projectedUncoveredRoutes.length > 0 && (
          <InlineNotice kind="warning">
            {t('adminPricing.saving_this_rule_would_leave')}{' '}
            {projectedUncoveredRoutes.length}{' '}
            {t('adminPricing.active_swap')}{' '}
            {projectedUncoveredRoutes.length === 1 ? t('adminPricing.route') : t('adminPricing.routes')}{' '}
            {t('adminPricing.without_pricing')}{' '}
            {t('adminPricing.examples')}{' '}
            {projectedUncoveredRoutes.slice(0, 3).map(route => pricingCoverageRouteLabel(route, allOptions)).join('; ')}
            {projectedUncoveredRoutes.length > 3 ? `; and ${projectedUncoveredRoutes.length - 3} more.` : '.'}
          </InlineNotice>
        )}

        <label className="admin-form-field admin-form-field-full pricing-rule-field pricing-rule-field-full"><span className="field-label">{t('adminPricing.rule_name')}</span><input required maxLength={200} value={form.name} onChange={event => set('name', event.target.value)} disabled={rule?.readOnly} data-testid="input-pricing-name" /></label>

        <div className="admin-form-grid pricing-form-grid pricing-option-grid">
            <div className="pricing-rule-field"><span className="field-label">{t('adminPricing.source_option')}{!rule && <span className="pricing-select-mode"><button type="button" className={sourceMode === 'single' ? 'active' : ''} onClick={() => setSourceMode('single')}>Single</button><button type="button" className={sourceMode === 'multiple' ? 'active' : ''} onClick={() => setSourceMode('multiple')}>Multiple</button></span>}</span>
               {sourceMode === 'multiple' && !rule
                 ? <PricingOptionMultiSelect values={sourceSelections} options={fromOptions} onChange={setSourceSelections} label="Source Options" testId="select-pricing-sources" />
                 : <SettlementOptionCombobox value={form.sourceSettlementOptionId} options={fromOptions} onChange={id => set('sourceSettlementOptionId', id)} label={t('adminPricing.source_option')} testId="select-pricing-source" allowAny matchMenuWidth terminalPresentation searchPlaceholder="Search currencies or payment methods" searchAppearance="admin" mobileContainedMenu />}
            </div>
            <div className="pricing-rule-field"><span className="field-label">{t('adminPricing.target_option')}{!rule && <span className="pricing-select-mode"><button type="button" className={targetMode === 'single' ? 'active' : ''} onClick={() => setTargetMode('single')}>Single</button><button type="button" className={targetMode === 'multiple' ? 'active' : ''} onClick={() => setTargetMode('multiple')}>Multiple</button></span>}</span>
               {targetMode === 'multiple' && !rule
                 ? <PricingOptionMultiSelect values={targetSelections} options={toOptions} onChange={setTargetSelections} label="Target Options" testId="select-pricing-targets" />
                 : <SettlementOptionCombobox value={form.targetSettlementOptionId} options={toOptions} onChange={id => set('targetSettlementOptionId', id)} label={t('adminPricing.target_option')} testId="select-pricing-target" allowAny matchMenuWidth terminalPresentation searchPlaceholder="Search currencies or payment methods" searchAppearance="admin" mobileContainedMenu />}
            </div>
        </div>

        <div className="admin-form-grid pricing-form-grid">
        <label className="pricing-rule-field"><span className="field-label">Exact path rate <small>base conversion rate</small></span><input inputMode="decimal" value={form.exactRate} onChange={event => set('exactRate', event.target.value)} placeholder="Example: 1 EUR = 4 XMR → 4" disabled={rule?.readOnly} data-testid="input-pricing-exact-rate" />{form.exactRate && <small className="text-muted-foreground">Selected path: 1 {projectedSourceOption?.assetCode || 'source'} = {form.exactRate} {projectedTargetOption?.assetCode || 'target'} · Reverse: 1 {projectedTargetOption?.assetCode || 'target'} = {reciprocalRate(form.exactRate)} {projectedSourceOption?.assetCode || 'source'}</small>}<small className="text-muted-foreground">The rate applies to all enabled networks for selected crypto assets.</small></label>
          <label className="pricing-rule-field"><span className="field-label">Direction</span><select value={form.adjustmentDirection} onChange={event => set('adjustmentDirection', event.target.value)} disabled={rule?.readOnly} data-testid="select-pricing-direction"><option value="MARKUP">Markup (less for customer)</option><option value="GIVE_MORE">Give more (customer bonus)</option></select></label>
          <label className="pricing-rule-field"><span className="field-label">Percentage</span><input inputMode="decimal" required value={form.markupPercent} onChange={event => set('markupPercent', event.target.value)} disabled={rule?.readOnly} data-testid="input-pricing-markup" /></label>
          <label className="pricing-rule-field"><span className="field-label">{t('adminPricing.fixed_fee')}<small>{t('adminPricing.target_asset')}</small></span><input inputMode="decimal" value={form.fixedFee} onChange={event => set('fixedFee', event.target.value)} placeholder="0.00" disabled={rule?.readOnly} data-testid="input-pricing-fixed-fee" /></label>
        </div>

        <div className="admin-form-grid pricing-form-grid">
          <label className="pricing-rule-field"><span className="field-label">{t('adminPricing.min_amount')}</span><input inputMode="decimal" value={form.minAmount} onChange={event => set('minAmount', event.target.value)} placeholder="0.00" disabled={rule?.readOnly} data-testid="input-pricing-min" /></label>
          <label className="pricing-rule-field"><span className="field-label">{t('adminPricing.max_amount')}</span><input inputMode="decimal" value={form.maxAmount} onChange={event => set('maxAmount', event.target.value)} placeholder="0.00" disabled={rule?.readOnly} data-testid="input-pricing-max" /></label>
        </div>

        {rule && (
          <div className="admin-form-grid pricing-form-grid">
            <label className="pricing-rule-field"><span className="field-label">{t('adminPricing.expected_settlement_min')}</span><input type="number" value={form.expectedSettlementMinutes} onChange={event => set('expectedSettlementMinutes', event.target.value)} placeholder={t('adminPricing.e_g_60')} disabled={rule.readOnly} data-testid="input-pricing-time" /></label>
            <label className="pricing-rule-field"><span className="field-label">{t('adminPricing.priority')}</span><input type="number" required value={form.priority} onChange={event => set('priority', event.target.value)} disabled={rule.readOnly} data-testid="input-pricing-priority" /></label>
          </div>
        )}

        <label className="admin-form-field admin-form-field-full pricing-rule-field pricing-rule-field-full"><span className="field-label">{t('adminPricing.operator_instructions')}</span><textarea value={form.operatorInstructions} onChange={event => set('operatorInstructions', event.target.value)} disabled={rule?.readOnly} data-testid="input-pricing-op-inst" /></label>
        <label className="admin-form-field admin-form-field-full pricing-rule-field pricing-rule-field-full"><span className="field-label">{t('adminPricing.customer_instructions')}</span><textarea value={form.customerInstructions} onChange={event => set('customerInstructions', event.target.value)} disabled={rule?.readOnly} data-testid="input-pricing-cust-inst" /></label>

        <label className="check-row pricing-rule-enabled"><input type="checkbox" checked={form.enabled} onChange={event => set('enabled', event.target.checked)} disabled={rule?.readOnly} data-testid="input-pricing-enabled" /><span>{t('adminPricing.enabled_for_new_manual_quotes')}</span></label>

        <div className="pricing-rule-actions">
          <button type="button" className="pricing-rule-cancel" onClick={onClose}>{t('adminPricing.cancel')}</button>
          {!rule?.readOnly && <button className="pricing-rule-save" disabled={pending || !form.name.trim()} data-testid="button-save-pricing-rule">{pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{pending ? t('adminPricing.saving') : sourceMode === 'multiple' || targetMode === 'multiple' ? 'Create Rules' : t('adminPricing.save_pricing_rule')}</button>}
        </div>
      </form>
    </aside>
  </div>, document.body);
}

function PricingPreview({ testRule }: { testRule?: ManualDeskPricingRule | null }) {
  const { t } = useI18n();
  const config = useGetExchangeConfig({ query: { queryKey: getGetExchangeConfigQueryKey() } });
  const allOptions = useMemo(() => withAssetPricingOptions(config.data?.manualSettlementOptions || []), [config.data?.manualSettlementOptions]);
  const fromOptions = useMemo(() => allOptions.filter(o => o.direction === 'send' || o.direction === 'both'), [allOptions]);
  const toOptions = useMemo(() => allOptions.filter(o => o.direction === 'receive' || o.direction === 'both'), [allOptions]);
  const preferredSourceId = fromOptions.find(option => option.assetCode.toUpperCase() === 'TRX')?.id || fromOptions[0]?.id || '';
  const preferredTargetId = toOptions.find(option => option.assetCode.toUpperCase() === 'BTC')?.id || toOptions[0]?.id || '';

  const [form, setForm] = useState({ sourceSettlementOptionId: '', targetSettlementOptionId: '' });
  const initializedDefaults = useRef(false);
  const match = usePreviewManualDeskPricingRule();
  const quote = usePreviewManualDeskQuote();
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const selectedSource = fromOptions.find(option => sameSettlementOptionId(option.id, form.sourceSettlementOptionId));
  const selectedTarget = toOptions.find(option => sameSettlementOptionId(option.id, form.targetSettlementOptionId));
  const resetPreview = () => {
    setForm({
      sourceSettlementOptionId: preferredSourceId,
      targetSettlementOptionId: preferredTargetId,
    });
    match.reset();
    quote.reset();
  };

  useEffect(() => {
    if (initializedDefaults.current || (!preferredSourceId && !preferredTargetId)) return;
    initializedDefaults.current = true;
    setForm(current => ({
      ...current,
      sourceSettlementOptionId: current.sourceSettlementOptionId || preferredSourceId,
      targetSettlementOptionId: current.targetSettlementOptionId || preferredTargetId,
    }));
  }, [preferredSourceId, preferredTargetId]);

  useEffect(() => {
    if (!testRule) return;
    const sourceOption = resolvePricingRuleOption(testRule, fromOptions, 'source');
    const targetOption = resolvePricingRuleOption(testRule, toOptions, 'target');
    setForm(current => ({
      ...current,
      sourceSettlementOptionId: sourceOption?.id || '',
      targetSettlementOptionId: targetOption?.id || '',
    }));
    match.reset();
    quote.reset();
  }, [testRule, fromOptions, toOptions]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const sourceOpt = fromOptions.find(o => o.id === form.sourceSettlementOptionId);
    const targetOpt = toOptions.find(o => o.id === form.targetSettlementOptionId);
    if (!sourceOpt || !targetOpt) return;

    const context = {
      sourceAsset: isAssetPricingOption(sourceOpt) ? null : sourceOpt.assetCode,
      targetAsset: isAssetPricingOption(targetOpt) ? null : targetOpt.assetCode,
      sourceNetwork: isAssetPricingOption(sourceOpt) ? null : sourceOpt.routeNetwork,
      targetNetwork: isAssetPricingOption(targetOpt) ? null : targetOpt.routeNetwork,
      sourceCryptoAssetId: isAssetPricingOption(sourceOpt) ? sourceOpt.assetId : null,
      targetCryptoAssetId: isAssetPricingOption(targetOpt) ? targetOpt.assetId : null,
      sourceSettlementOptionId: isAssetPricingOption(sourceOpt) ? undefined : sourceOpt.id,
      targetSettlementOptionId: isAssetPricingOption(targetOpt) ? undefined : targetOpt.id,
    };
    match.mutate({ data: context });
    const quoteInput: ManualDeskPricingQuotePreviewInput = {
      amount: '1000',
      sourceCryptoAssetId: isAssetPricingOption(sourceOpt) ? sourceOpt.assetId : null,
      targetCryptoAssetId: isAssetPricingOption(targetOpt) ? targetOpt.assetId : null,
      sourceSettlementOptionId: isAssetPricingOption(sourceOpt) ? null : sourceOpt.id,
      targetSettlementOptionId: isAssetPricingOption(targetOpt) ? null : targetOpt.id,
    };
    quote.mutate({ data: quoteInput });
  };
  const result = quote.data;

  const canPreview = form.sourceSettlementOptionId && form.targetSettlementOptionId &&
                     form.sourceSettlementOptionId !== form.targetSettlementOptionId;
  const loadedRuleNeedsConcreteRoute = Boolean(testRule && !canPreview);

  return <div className="panel pricing-preview" id="pricing-rule-test-panel">
    <div className="pricing-preview-heading">
      <div className="pricing-preview-heading-copy"><span className="pricing-preview-heading-icon"><TrendingUp size={17} /></span><div><span className="section-kicker">{t('adminPricing.live_preview')}</span><h2>{t('adminPricing.price_a_route')}</h2><p>{t('adminPricing.test_the_pricing_engine_against_the_same')}</p></div></div>
      <button type="button" className="pricing-preview-reset" onClick={resetPreview} data-testid="button-reset-pricing-preview"><RotateCcw size={13} />{t('adminPricing.reset')}</button>
    </div>
    <form onSubmit={submit} className="admin-form pricing-preview-form">
      <div className="pricing-preview-controls">
        <label className="pricing-preview-option"><span className="pricing-preview-label"><strong>{t('adminPricing.source_option')}</strong></span><SettlementOptionCombobox value={form.sourceSettlementOptionId} options={fromOptions} onChange={id => set('sourceSettlementOptionId', id)} label={t('adminPricing.source_option')} testId="preview-source" allowAny matchMenuWidth terminalPresentation searchPlaceholder="Search options..." searchAppearance="admin" mobileContainedMenu /></label>
        <span className="pricing-preview-arrow" aria-hidden="true"><ArrowRight size={16} /></span>
        <label className="pricing-preview-option"><span className="pricing-preview-label"><strong>{t('adminPricing.target_option')}</strong></span><SettlementOptionCombobox value={form.targetSettlementOptionId} options={toOptions} onChange={id => set('targetSettlementOptionId', id)} label={t('adminPricing.target_option')} testId="preview-target" allowAny matchMenuWidth terminalPresentation searchPlaceholder="Search options..." searchAppearance="admin" mobileContainedMenu /></label>
        <button className="pricing-preview-submit" disabled={!canPreview || match.isPending || quote.isPending} data-testid="button-preview-pricing"><Calculator size={16} /><span><strong>{quote.isPending ? t('adminPricing.calculating') : t('adminPricing.preview_pricing')}</strong><small>{t('adminPricing.get_exchange_rate_amp_fees')}</small></span><ArrowRight size={15} /></button>
      </div>
    </form>
    {(match.isError || quote.isError) && <InlineNotice kind="error">{apiErrorText(match.error || quote.error, t('adminPricing.could_not_preview_this_route'))}</InlineNotice>}
    <div className={cn('pricing-preview-info', result && 'has-result')} data-testid={result ? 'pricing-preview-result' : 'pricing-preview-info'}>
      <span className="pricing-preview-info-icon"><Info size={16} /></span>
      {result ? <div className="pricing-preview-result-grid">
        <span>Matched Rule<strong>{result.pricingRuleName}</strong></span>
        <span>Base Rate<strong>{number(result.baseRate, 8)}</strong></span>
        <span>Percentage<strong>{result.adjustmentDirection === 'GIVE_MORE' ? '+' : '−'}{number(result.markupBasisPoints / 100, 2)}%</strong></span>
        <span>Final Rate<strong>{number(result.finalRate, 8)}</strong></span>
        <span>{t('adminPricing.gross')}<strong>{number(result.grossMarketAmount)} {result.toAsset}</strong></span>
         <span>{testRule?.adjustmentDirection === 'GIVE_MORE' ? 'Customer bonus' : t('adminPricing.commission')}<strong>{number(result.percentageCommission || 0)} {result.toAsset}</strong></span>
        <span>{t('adminPricing.fixed_fee')}<strong>{number(result.fixedCommission || 0)} {result.toAsset}</strong></span>
        <span>{t('adminPricing.total_fee')}<strong>{number(result.totalFee)} {result.toAsset}</strong></span>
        <span>{t('adminPricing.receive')}<strong>{number(result.receiveAmount)} {result.toAsset}</strong></span>
      </div> : <div><strong>{loadedRuleNeedsConcreteRoute ? t('adminPricing.rule_loaded') : t('adminPricing.live_preview_2')}</strong><p>{loadedRuleNeedsConcreteRoute ? t('adminPricing.choose_a_concrete_option_for_each_any') : t('adminPricing.this_will_calculate_the_price_using_the')}</p></div>}
      {match.data && <StatusPill status={`Matched · ${match.data.name}`} />}
      {!match.data && testRule && <StatusPill status={`Loaded · ${testRule.name}`} />}
    </div>
  </div>;
}

function BulkPricingRuleDrawer({
  rules,
  allOptions,
  onClose,
  onSuccess,
}: {
  rules: ManualDeskPricingRule[];
  allOptions: SettlementOption[];
  onClose: () => void;
  onSuccess: (data: ManualDeskPricingRulesBulkResponse, action: string) => void;
}) {
  const bulkAction = useBulkManualDeskPricingRules();

  const [form, setForm] = useState({
    markupPercent: '', adjustmentDirection: 'MARKUP', applyMarkup: false,
    exactRate: '', applyExactRate: false,
    fixedFee: '', applyFixedFee: false,
    minAmount: '', applyMinAmount: false,
    maxAmount: '', applyMaxAmount: false,
    expectedSettlementMinutes: '', applyTime: false,
    operatorInstructions: '', applyOpInst: false,
    customerInstructions: '', applyCustInst: false,
    priority: '', applyPriority: false,
    sourceSettlementOptionId: '', applySource: false,
    targetSettlementOptionId: '', applyTarget: false,
  });

  const [error, setError] = useState('');
  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm(c => ({ ...c, [key]: value }));
  const toggleApply = (key: keyof typeof form) => setForm(c => ({ ...c, [key]: !(c[key] as boolean) }));

  const pricingOptions = useMemo(() => withAssetPricingOptions(allOptions), [allOptions]);
  const fromOptions = pricingOptions.filter(o => o.direction === 'send' || o.direction === 'both');
  const toOptions = pricingOptions.filter(o => o.direction === 'receive' || o.direction === 'both');

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const patch: ManualDeskPricingRulesBulkPatch = {};
    if (form.applyMarkup) {
      const markupText = form.markupPercent.trim();
      if (!/^\d+(?:\.\d{1,2})?$/.test(markupText)) {
        setError('Percentage must be nonnegative with at most two decimal places.'); return;
      }
      const markupBasisPoints = Number(markupText) * 100;
      if (!Number.isInteger(markupBasisPoints) || markupBasisPoints > 10000) {
        setError('Percentage must be between 0% and 100%, in increments of 0.01%.'); return;
      }
      patch.markupBasisPoints = markupBasisPoints;
      patch.adjustmentDirection = form.adjustmentDirection as 'MARKUP' | 'GIVE_MORE';
    }

    const validateDecimal = (val: string, name: string, positive = false) => {
      const t = val.trim();
      if (t && (!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(t) || (positive && /^0(?:\.0*)?$/.test(t)))) {
         throw new Error(`${name} must be a valid ${positive ? 'positive' : 'nonnegative'} number or left blank to clear.`);
      }
      return t || null;
    };

    try {
      if (form.applyExactRate) patch.exactRate = validateDecimal(form.exactRate, 'Exact Rate', true);
      if (form.applyFixedFee) patch.fixedFee = validateDecimal(form.fixedFee, 'Fixed Fee');
      if (form.applyMinAmount) patch.minAmount = validateDecimal(form.minAmount, 'Min Amount');
      if (form.applyMaxAmount) patch.maxAmount = validateDecimal(form.maxAmount, 'Max Amount');

      if (patch.minAmount && patch.maxAmount && isGreaterThanExact(patch.minAmount, patch.maxAmount)) {
         throw new Error('Min Amount cannot be greater than Max Amount.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    if (form.applyPriority) {
       const p = Number(form.priority);
       if (!Number.isInteger(p) || p < -1000000 || p > 1000000) {
          setError('Priority must be an integer between -1000000 and 1000000.'); return;
       }
       patch.priority = p;
    }

    if (form.applyTime) {
       const tStr = form.expectedSettlementMinutes.trim();
       if (tStr) {
          const m = parseInt(tStr, 10);
          if (!Number.isInteger(m) || m < 1 || m > 10080) {
             setError('Settlement Minutes must be an integer between 1 and 10080, or left blank to clear.'); return;
          }
          patch.expectedSettlementMinutes = m;
       } else {
          patch.expectedSettlementMinutes = null;
       }
    }

    if (form.applyOpInst) patch.operatorInstructions = form.operatorInstructions.trim() || null;
    if (form.applyCustInst) patch.customerInstructions = form.customerInstructions.trim() || null;
    if (form.applySource) {
      const option = fromOptions.find(o => o.id === form.sourceSettlementOptionId);
      if (isAssetPricingOption(option)) {
        patch.sourceCryptoAssetId = option!.assetId;
        patch.sourceSettlementOptionId = null;
      } else {
        patch.sourceCryptoAssetId = null;
        patch.sourceSettlementOptionId = form.sourceSettlementOptionId || null;
      }
    }
    if (form.applyTarget) {
      const option = toOptions.find(o => o.id === form.targetSettlementOptionId);
      if (isAssetPricingOption(option)) {
        patch.targetCryptoAssetId = option!.assetId;
        patch.targetSettlementOptionId = null;
      } else {
        patch.targetCryptoAssetId = null;
        patch.targetSettlementOptionId = form.targetSettlementOptionId || null;
      }
    }

    bulkAction.mutate({
      data: {
        action: 'edit',
        items: rules.map(r => ({ id: r.id, version: r.version })),
        patch
      }
    }, {
      onSuccess: (data) => onSuccess(data, 'edit'),
      onError: (err) => {
        const code = apiErrorData(err)?.code;
        if (code?.includes('CONFLICT')) {
           setError('Some rules changed in another session or conflict with existing routes. Refresh and try again.');
        } else {
           setError(apiErrorText(err, 'Could not bulk edit rules.'));
        }
      }
    });
  };

  const hasAnyApply = Object.entries(form).some(([k, v]) => k.startsWith('apply') && v);

  return createPortal(<div className="drawer-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
    <aside className="order-drawer pricing-drawer bulk-drawer" role="dialog" aria-modal="true" aria-label="Bulk edit rules" data-testid="bulk-pricing-rule-drawer">
       <div className="drawer-head pricing-rule-drawer-head">
          <div className="pricing-rule-drawer-title">
             <span className="pricing-rule-drawer-icon"><TrendingUp size={18}/></span>
             <div><span className="section-kicker">Bulk Action</span><h2>Edit {rules.length} Rules</h2></div>
          </div>
          <button type="button" className="pricing-rule-drawer-close" onClick={onClose} aria-label="Close bulk edit drawer" data-testid="button-close-bulk-drawer"><X size={17}/></button>
       </div>
       <form className="admin-form admin-form-card drawer-edit pricing-rule-form-card" onSubmit={save}>
          {error && <InlineNotice kind="error">{error}</InlineNotice>}
          <InlineNotice kind="info">
            <p>Only fields with their checkbox selected will be applied to the {rules.length} rules.</p>
            <p className="text-xs opacity-80 mt-1">Leaving a field empty and checking its box will clear it (for optional fields like Fixed Fee).</p>
          </InlineNotice>

          <div className="admin-form-grid pricing-form-grid pricing-option-grid bulk-form-grid">
             <label className="pricing-rule-field">
                <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applySource} onChange={() => toggleApply('applySource')} data-testid="apply-source"/> Source Option</span>
                <div className={cn(!form.applySource && "pointer-events-none opacity-50")}>
                  <SettlementOptionCombobox value={form.sourceSettlementOptionId} options={fromOptions} onChange={id => { set('sourceSettlementOptionId', id); set('applySource', true); }} label="Source Option" testId="bulk-select-source" allowAny matchMenuWidth terminalPresentation searchAppearance="admin" />
                </div>
                <small className="text-muted-foreground mt-1 text-xs">Route specificity is derived from selected route fields.</small>
             </label>
             <label className="pricing-rule-field">
                <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyTarget} onChange={() => toggleApply('applyTarget')} data-testid="apply-target"/> Target Option</span>
                <div className={cn(!form.applyTarget && "pointer-events-none opacity-50")}>
                  <SettlementOptionCombobox value={form.targetSettlementOptionId} options={toOptions} onChange={id => { set('targetSettlementOptionId', id); set('applyTarget', true); }} label="Target Option" testId="bulk-select-target" allowAny matchMenuWidth terminalPresentation searchAppearance="admin" />
                </div>
                <small className="text-muted-foreground mt-1 text-xs">Any means applies to all options.</small>
             </label>
          </div>

          <div className="admin-form-grid pricing-form-grid bulk-form-grid">
             <label className="pricing-rule-field">
                 <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyMarkup} onChange={() => toggleApply('applyMarkup')} data-testid="apply-markup"/> Percentage + Direction</span>
                <input inputMode="decimal" required={form.applyMarkup} value={form.markupPercent} onChange={e => { set('markupPercent', e.target.value); set('applyMarkup', true); }} disabled={!form.applyMarkup} data-testid="input-bulk-markup" />
                 <select value={form.adjustmentDirection} onChange={e => { set('adjustmentDirection', e.target.value); set('applyMarkup', true); }} disabled={!form.applyMarkup}><option value="MARKUP">Markup</option><option value="GIVE_MORE">Give more</option></select>
             </label>
             <label className="pricing-rule-field">
                <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyExactRate} onChange={() => toggleApply('applyExactRate')} data-testid="apply-exact-rate"/> Exact Rate</span>
                <input inputMode="decimal" value={form.exactRate} onChange={e => { set('exactRate', e.target.value); set('applyExactRate', true); }} disabled={!form.applyExactRate} data-testid="input-bulk-exact-rate" placeholder="Leave blank to clear" />
             </label>
             <label className="pricing-rule-field">
                <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyFixedFee} onChange={() => toggleApply('applyFixedFee')} data-testid="apply-fixed-fee"/> Fixed Fee</span>
                <input inputMode="decimal" value={form.fixedFee} onChange={e => { set('fixedFee', e.target.value); set('applyFixedFee', true); }} disabled={!form.applyFixedFee} data-testid="input-bulk-fixed-fee" placeholder="Leave blank to clear" />
             </label>
          </div>

          <div className="admin-form-grid pricing-form-grid bulk-form-grid">
             <label className="pricing-rule-field">
                <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyMinAmount} onChange={() => toggleApply('applyMinAmount')} data-testid="apply-min"/> Min Amount</span>
                <input inputMode="decimal" value={form.minAmount} onChange={e => { set('minAmount', e.target.value); set('applyMinAmount', true); }} disabled={!form.applyMinAmount} data-testid="input-bulk-min" placeholder="Leave blank to clear" />
             </label>
             <label className="pricing-rule-field">
                <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyMaxAmount} onChange={() => toggleApply('applyMaxAmount')} data-testid="apply-max"/> Max Amount</span>
                <input inputMode="decimal" value={form.maxAmount} onChange={e => { set('maxAmount', e.target.value); set('applyMaxAmount', true); }} disabled={!form.applyMaxAmount} data-testid="input-bulk-max" placeholder="Leave blank to clear" />
             </label>
          </div>

          <div className="admin-form-grid pricing-form-grid bulk-form-grid">
             <label className="pricing-rule-field">
                <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyTime} onChange={() => toggleApply('applyTime')} data-testid="apply-time"/> Settlement Mins</span>
                <input type="number" value={form.expectedSettlementMinutes} onChange={e => { set('expectedSettlementMinutes', e.target.value); set('applyTime', true); }} disabled={!form.applyTime} data-testid="input-bulk-time" placeholder="Leave blank to clear" />
             </label>
             <label className="pricing-rule-field">
                <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyPriority} onChange={() => toggleApply('applyPriority')} data-testid="apply-priority"/> Priority</span>
                <input type="number" required={form.applyPriority} value={form.priority} onChange={e => { set('priority', e.target.value); set('applyPriority', true); }} disabled={!form.applyPriority} data-testid="input-bulk-priority" />
             </label>
          </div>

          <label className="admin-form-field admin-form-field-full pricing-rule-field pricing-rule-field-full">
             <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyOpInst} onChange={() => toggleApply('applyOpInst')} data-testid="apply-op-inst"/> Operator Instructions</span>
             <textarea value={form.operatorInstructions} onChange={e => { set('operatorInstructions', e.target.value); set('applyOpInst', true); }} disabled={!form.applyOpInst} data-testid="input-bulk-op-inst" placeholder="Leave blank to clear" />
          </label>

          <label className="admin-form-field admin-form-field-full pricing-rule-field pricing-rule-field-full">
             <span className="field-label flex items-center gap-2"><input type="checkbox" checked={form.applyCustInst} onChange={() => toggleApply('applyCustInst')} data-testid="apply-cust-inst"/> Customer Instructions</span>
             <textarea value={form.customerInstructions} onChange={e => { set('customerInstructions', e.target.value); set('applyCustInst', true); }} disabled={!form.applyCustInst} data-testid="input-bulk-cust-inst" placeholder="Leave blank to clear" />
          </label>

          <div className="pricing-rule-actions mt-4">
              <button type="button" className="pricing-rule-cancel" onClick={onClose} aria-label="Cancel bulk edit" data-testid="button-cancel-bulk-pricing">Cancel</button>
             <button type="submit" className="pricing-rule-save" disabled={bulkAction.isPending || !hasAnyApply} data-testid="button-save-bulk-pricing">
                {bulkAction.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {bulkAction.isPending ? 'Saving...' : 'Apply Changes'}
             </button>
          </div>
       </form>
    </aside>
  </div>, document.body);
}

function BulkDeleteModal({ rules, onClose, onConfirm, pending, error }: { rules: ManualDeskPricingRule[], onClose: () => void, onConfirm: () => void, pending: boolean, error: string }) {
  return createPortal(<div className="drawer-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="admin-modal bulk-delete-modal" role="dialog" aria-modal="true" aria-label="Confirm bulk delete" data-testid="modal-bulk-delete">
      <div className="admin-modal-head">
        <h2>Delete {rules.length} selected pricing rules?</h2>
        <button type="button" onClick={onClose} aria-label="Close bulk delete modal" data-testid="button-close-bulk-delete" className="hover:text-destructive transition-colors"><X size={17}/></button>
      </div>
      <div className="admin-modal-body p-6">
        {error && <InlineNotice kind="error">{error}</InlineNotice>}
        <p className="mb-6 text-muted-foreground">This action cannot be undone.</p>
        <div className="admin-modal-actions flex justify-end gap-3">
            <button type="button" className="button button-secondary" onClick={onClose} disabled={pending} aria-label="Cancel bulk delete" data-testid="button-cancel-bulk-delete">Cancel</button>
           <button type="button" className="button button-danger flex items-center gap-2" onClick={onConfirm} disabled={pending} data-testid="button-confirm-bulk-delete">
             {pending ? <Loader2 className="animate-spin" size={15}/> : <Trash2 size={15}/>}
             Delete
           </button>
        </div>
      </div>
    </div>
  </div>, document.body);
}

function AdminManualPricing() {
  const { t, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const config = useGetExchangeConfig({ query: { queryKey: getGetExchangeConfigQueryKey() } });
  const rules = useListManualDeskPricingRules({ query: { queryKey: getListManualDeskPricingRulesQueryKey() } });
  const oneForge = useGetOneForgeProviderStatus({ query: { queryKey: getGetOneForgeProviderStatusQueryKey(), refetchInterval: 30000 } });
  const update = useUpdateManualDeskPricingRule();
  const remove = useDeleteManualDeskPricingRule();
  const bulkAction = useBulkManualDeskPricingRules();
  const [drawer, setDrawer] = useState<ManualDeskPricingRule | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [testRule, setTestRule] = useState<ManualDeskPricingRule | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [bulkEditDrawerOpen, setBulkEditDrawerOpen] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);

  const settlementOptions = config.data?.manualSettlementOptions || [];
  const pricingRules = rules.data?.items || [];
  const diagnostics = rules.data?.diagnostics;
  const filtered = pricingRules.filter(rule => (status === 'all' || String(rule.enabled) === status) && (!search.trim() || `${rule.name} ${pricingSelectorLabel(rule, settlementOptions)}`.toLowerCase().includes(search.trim().toLowerCase())));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRules = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filteredRuleIds = filtered.map(rule => rule.id);
  const allFilteredRulesSelected = filteredRuleIds.length > 0 && filteredRuleIds.every(id => selectedRuleIds.includes(id));
  const someFilteredRulesSelected = filteredRuleIds.some(id => selectedRuleIds.includes(id));

  useEffect(() => setPage(1), [search, status]);
  useEffect(() => setSelectedRuleIds([]), [search, status, pageSize]);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  useEffect(() => {
    // Prune selected IDs if they no longer exist in the catalog (e.g. after deletion)
    if (!pricingRules.length) return;
    const existingIds = new Set(pricingRules.map(r => r.id));
    setSelectedRuleIds(current => {
      const valid = current.filter(id => existingIds.has(id));
      return valid.length === current.length ? current : valid;
    });
  }, [pricingRules]);

  const selectedRules = filtered.filter(r => selectedRuleIds.includes(r.id));
  const anyReadOnlySelected = selectedRules.some(r => r.readOnly);

  const handleBulkActionSuccess = (data: ManualDeskPricingRulesBulkResponse, actionName: string) => {
    const selectedRuleNames = new Map(selectedRules.map(rule => [rule.id, rule.name]));
    queryClient.setQueryData(getListManualDeskPricingRulesQueryKey(), {
      items: data.items,
      diagnostics: data.diagnostics
    });
    queryClient.invalidateQueries({ queryKey: getListManualDeskPricingRulesQueryKey() });
    setSelectedRuleIds([]);
    setBulkEditDrawerOpen(false);
    setBulkDeleteModalOpen(false);
    const updatedCount = data.updatedIds.length;
    const skippedCount = data.skipped.length;
    const skippedDetails = data.skipped
      .map(item => `${selectedRuleNames.get(item.id) || item.id}: ${item.reason}`)
      .join('; ');
    setSuccessMsg(
      `${updatedCount} rule${updatedCount === 1 ? '' : 's'} updated successfully. ` +
      `${skippedCount} rule${skippedCount === 1 ? '' : 's'} skipped.` +
      (skippedDetails ? ` ${skippedDetails}` : ''),
    );
  };

  const handleBulkToggle = (action: 'enable' | 'disable') => {
    if (anyReadOnlySelected) {
      setError(`Cannot bulk ${action} because selection includes read-only legacy rules. Please deselect them.`);
      return;
    }
    setError('');
    setSuccessMsg('');
    bulkAction.mutate({
      data: {
        action,
        items: selectedRules.map(r => ({ id: r.id, version: r.version }))
      }
    }, {
      onSuccess: (data) => handleBulkActionSuccess(data, action),
      onError: (err) => {
        const code = apiErrorData(err)?.code;
        if (code?.includes('CONFLICT')) {
           setError('Some rules changed in another session or conflict with existing routes. Refresh and try again.');
        } else {
           setError(apiErrorText(err, `Could not ${action} rules.`));
        }
      }
    });
  };

  const handleBulkDelete = () => {
    setError('');
    setSuccessMsg('');
    bulkAction.mutate({
      data: {
        action: 'delete',
        items: selectedRules.map(r => ({ id: r.id, version: r.version }))
      }
    }, {
      onSuccess: (data) => handleBulkActionSuccess(data, 'delete'),
      onError: (err) => {
        setError(apiErrorText(err, `Could not delete rules.`));
      }
    });
  };

  const optionForRule = (rule: ManualDeskPricingRule) => settlementOptions.find(option =>
    sameSettlementOptionId(option.id, rule.targetSettlementOptionId || '')
  ) || settlementOptions.find(option =>
    sameSettlementOptionId(option.id, rule.sourceSettlementOptionId || '')
  );
  const compactRuleLabel = (rule: ManualDeskPricingRule) => {
    const source = settlementOptions.find(option => sameSettlementOptionId(option.id, rule.sourceSettlementOptionId || ''));
    const target = settlementOptions.find(option => sameSettlementOptionId(option.id, rule.targetSettlementOptionId || ''));
    const sourceName = source?.title || source?.networkTitle || source?.assetCode || rule.sourceAsset || 'ANY';
    const targetName = target?.title || target?.networkTitle || target?.assetCode || rule.targetAsset || 'ANY';
    return `${sourceName} → ${targetName}`;
  };
  const formatFixedFee = (value: string | null | undefined, assetCode?: string | null) => {
    const amount = Number(value || 0);
    const formatted = Number.isFinite(amount)
      ? formatNumber(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : formatNumber(0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const symbol = assetCode === 'EUR' ? '€' : assetCode === 'GBP' ? '£' : assetCode === 'USD' ? '$' : '';
    return `${symbol}${formatted}${symbol || !assetCode ? '' : ` ${assetCode}`} fixed`;
  };
  const testPricingRule = (rule: ManualDeskPricingRule) => {
    setTestRule({ ...rule });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() =>
      document.getElementById('pricing-rule-test-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    ));
  };
  const confirmProjectedGaps = (projectedRules: PricingCoverageRule[], action: string) => {
    const projected = evaluateProjectedPricingCoverage(projectedRules, settlementOptions);
    const currentCount = diagnostics?.uncoveredRoutes.length || 0;
    if (projected.length <= currentCount) return true;
    return window.confirm(
      `${action} would leave ${projected.length} active Swap ${projected.length === 1 ? 'route' : 'routes'} without pricing (${projected.length - currentCount} new). Continue?`,
    );
  };
  const toggle = (rule: ManualDeskPricingRule) => {
    setError('');
    let input: ManualDeskPricingRuleInput;
    try {
      input = canonicalPricingRuleInput(rule, config.data?.settlementOptions || [], !rule.enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve this rule’s settlement options.');
      return;
    }
    if (!confirmProjectedGaps(
      pricingRules.map(candidate => ({
        ...pricingRuleInput(candidate, candidate.id === rule.id ? !rule.enabled : candidate.enabled),
        id: candidate.id,
      })),
      rule.enabled ? `Disabling “${rule.name}”` : `Enabling “${rule.name}”`,
    )) return;
    update.mutate({ id: rule.id, data: { ...input, version: rule.version } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListManualDeskPricingRulesQueryKey() }),
      onError: err => setError(apiErrorData(err)?.code?.toLowerCase().includes('conflict') ? 'The rule changed in another session. Refresh before trying again.' : apiErrorText(err, t('adminPricing.could_not_update_rule_status'))),
    });
  };
  const removeRule = (rule: ManualDeskPricingRule) => {
    setError('');
    if (!confirmProjectedGaps(
      pricingRules.filter(candidate => candidate.id !== rule.id).map(candidate => ({
        ...pricingRuleInput(candidate),
        id: candidate.id,
      })),
      `Deleting “${rule.name}”`,
    )) return;
    if (!window.confirm(`Delete pricing rule “${rule.name}”? This cannot be undone.`)) return;
    remove.mutate({ id: rule.id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListManualDeskPricingRulesQueryKey() }),
      onError: err => setError(apiErrorText(err, t('adminPricing.could_not_delete_this_pricing_rule'))),
    });
  };
  return <AdminShell eyebrow={t('adminPricing.operations_pricing')} title={t('adminPricing.swap_pricing')} requiredPermission="pricing.view">
    <div className="admin-welcome"><p className="admin-subtitle">{t('adminPricing.deterministic_route_pricing_with_the_most_specific')}</p><div className="system-state"><span className={cn('live-dot', oneForge.data?.state !== 'healthy' && 'offline-dot')} /> {t('adminPricing.1forge')}{oneForge.isLoading ? t('adminPricing.checking') : oneForge.data?.state || 'unavailable'}{oneForge.data?.fetchedAt ? ` · ${ago(oneForge.data.fetchedAt)}` : ''}</div></div>

    {error && <InlineNotice kind="error" onDismiss={() => setError('')}>{error}</InlineNotice>}
    {successMsg && <InlineNotice kind="success" onDismiss={() => setSuccessMsg('')}>{successMsg}</InlineNotice>}
    <PricingPreview testRule={testRule} />
    <div className="pricing-layout">
      <div className="panel pricing-rules-panel">
        <div className="pricing-directory-head"><div><span className="section-kicker">{t('adminPricing.rule_directory')}</span><h2>{t('adminPricing.pricing_rules')}<span>({filtered.length})</span></h2><p>{t('adminPricing.set_commissions_priority_and_availability_for_each')}</p></div></div>
        <div className="pricing-filters flex items-center gap-2">
          <div className="flex-1 min-w-[200px]">
            <AdminSearch
              value={search}
              onChange={setSearch}
              placeholder={t('adminPricing.search_by_rule_route_or_payment_method')}
              testId="input-filter-pricing"
            />
          </div>
          <select value={status} onChange={event => setStatus(event.target.value)} aria-label={t('adminPricing.filter_by_status')} data-testid="select-filter-pricing-status"><option value="all">{t('adminPricing.all_statuses')}</option><option value="true">{t('adminPricing.enabled')}</option><option value="false">{t('adminPricing.disabled')}</option></select>
          <button className="button button-primary pricing-add-rule" onClick={() => setDrawer('new')} data-testid="button-add-pricing-rule"><TrendingUp size={15} /> {t('adminPricing.add_pricing_rule')}</button>
        </div>
         <div className={cn("bulk-actions-toolbar", selectedRules.length > 0 && "visible")} data-testid="bulk-actions-toolbar">
           <div className="bulk-actions-inner">
             <span className="bulk-actions-count" data-testid="bulk-actions-count"><Check size={14} /> {selectedRules.length} selected</span>
             <div className="bulk-actions-divider" />
             <button type="button" onClick={() => handleBulkToggle('enable')} disabled={anyReadOnlySelected || bulkAction.isPending} data-testid="button-bulk-enable" aria-label="Bulk enable"><Power size={14} /> Enable</button>
             <div className="bulk-actions-divider" />
             <button type="button" onClick={() => handleBulkToggle('disable')} disabled={anyReadOnlySelected || bulkAction.isPending} data-testid="button-bulk-disable" aria-label="Bulk disable"><Power size={14} /> Disable</button>
             <div className="bulk-actions-divider" />
             <button type="button" onClick={() => setBulkEditDrawerOpen(true)} disabled={bulkAction.isPending} data-testid="button-bulk-edit" aria-label="Bulk edit"><Pencil size={14} /> Edit</button>
             <div className="bulk-actions-divider" />
             <button type="button" onClick={() => setBulkDeleteModalOpen(true)} disabled={bulkAction.isPending} data-testid="button-bulk-delete" className="bulk-actions-delete" aria-label="Bulk delete"><Trash2 size={14} /> Delete</button>
           </div>
         </div>
        {rules.isLoading ? <LoadingBlock rows={5} /> : rules.isError ? <ErrorState message={t('adminPricing.load_pricing_rules_error')} retry={() => rules.refetch()} /> : !filtered.length ? <div className="table-empty"><TrendingUp size={20} /><strong>{t('adminPricing.no_matching_pricing_rules')}</strong><span>{t('adminPricing.adjust_filters_or_add_a_full_replacement')}</span></div> : <>
          <div className="w-full relative group">
            <div className="swipeable-scroll-hint" aria-hidden="true" />
            <div className="table-wrap pricing-table-wrap" onScroll={(e) => {
              const target = e.target as HTMLElement;
              const hint = target.previousElementSibling as HTMLElement;
              if (hint) {
                hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
                hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
              }
            }}>
              <table className="data-table pricing-table" data-testid="table-pricing-rules"><thead><tr>
                <th className="pricing-select-column"><input type="checkbox" ref={el => { if (el) el.indeterminate = someFilteredRulesSelected && !allFilteredRulesSelected; }} checked={allFilteredRulesSelected} onChange={() => { if (allFilteredRulesSelected) setSelectedRuleIds(c => c.filter(id => !filteredRuleIds.includes(id))); else setSelectedRuleIds(c => [...new Set([...c, ...filteredRuleIds])]); }} aria-label="Select all filtered pricing rules" data-testid="checkbox-select-visible-pricing" /></th>
                <th>{t('adminPricing.rule')}</th><th>{t('adminPricing.route_2')}</th><th>{t('adminPricing.commission')}</th><th>{t('adminPricing.priority')}</th><th>{t('adminPricing.specificity')}</th><th>{t('adminPricing.status')}</th><th>{t('adminPricing.actions')}</th><th>{t('adminPricing.test')}</th>
              </tr></thead><tbody>{visibleRules.map(rule => {
                const option = optionForRule(rule);
                return <tr key={rule.id} data-testid={`pricing-rule-${rule.id}`} className={cn(rule.missingSettlementOptionIds.length > 0 && 'pricing-rule-orphan')}>
                  <td className="pricing-select-column"><input type="checkbox" checked={selectedRuleIds.includes(rule.id)} onChange={() => setSelectedRuleIds(current => current.includes(rule.id) ? current.filter(id => id !== rule.id) : [...current, rule.id])} aria-label={t('adminPricing.select_rule_named', { name: rule.name })} data-testid={`checkbox-pricing-${rule.id}`} /></td>
                  <td><div className="pricing-rule-identity"><AdminPaymentLogo name={option?.title || option?.networkTitle || rule.name} currencyCode={option?.assetCode} logoUrl={option?.logoUrl} />{option?.kind === 'fiat-payment-method' ? <PaymentMethodCopy methodName={option.title || option.networkTitle || rule.name} currencyCode={option.assetCode} /> : <span><strong>{compactRuleLabel(rule)}</strong><small>{rule.name}</small></span>}</div>{rule.missingSettlementOptionIds.length > 0 && <small className="pricing-orphan-warning" data-testid={`pricing-orphan-${rule.id}`}>{t('adminPricing.missing_option')}{rule.missingSettlementOptionIds.join(', ')}</small>}</td>
                  <td className="pricing-selector"><div className="pricing-route"><span className="pricing-route-icon"><ArrowRight size={14} /></span><span>{pricingSelectorLabel(rule, settlementOptions)}</span></div></td>
                  <td><strong className="pricing-commission">{rule.adjustmentDirection === 'GIVE_MORE' ? 'Give more ' : 'Markup '}{(rule.markupBasisPoints / 100).toFixed(2)}%</strong><small>Fixed fee: {formatFixedFee(rule.fixedFee, option?.assetCode)}</small></td>
                  <td className="pricing-number font-mono">{rule.priority}</td>
                  <td><span className="secure-badge pricing-specificity">{rule.specificity} / 8</span></td>
                  <td><StatusPill status={rule.enabled ? 'Enabled' : 'Disabled'} /></td>
                  <td><div className="pricing-actions"><button className="pricing-action-button pricing-edit-action" onClick={() => setDrawer(rule)} data-testid={`button-edit-pricing-${rule.id}`}><Pencil size={12} />{t('adminPricing.edit')}</button><button className={cn('pricing-action-button', rule.enabled && 'danger')} onClick={() => toggle(rule)} disabled={update.isPending || remove.isPending} data-testid={`button-toggle-pricing-${rule.id}`}><Power size={12} />{rule.enabled ? t('adminPricing.disable') : t('adminPricing.enable')}</button><button className="pricing-delete-action" onClick={() => removeRule(rule)} disabled={remove.isPending || update.isPending} data-testid={`button-delete-pricing-${rule.id}`} aria-label={t('adminPricing.delete_rule_named', { name: rule.name })}><X size={12} /></button></div></td>
                  <td><button className="pricing-action-button pricing-test-button" onClick={() => testPricingRule(rule)} data-testid={`button-test-pricing-${rule.id}`}><Play size={11} />{t('adminPricing.test')}</button></td>
                </tr>;
              })}</tbody></table>
            </div>
          </div>
          <div className="pricing-pagination">
            <span className="pricing-pagination-range" data-testid="pricing-pagination-range">
              {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
            </span>
            <div className="pricing-pagination-controls">
              <label className="pricing-page-size">
                <span>Per page</span>
                <select
                  value={pageSize}
                  onChange={event => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  aria-label="Pricing rules per page"
                  data-testid="select-pricing-page-size"
                >
                  {[15, 25, 50, 100].map(value => <option key={value} value={value}>{value} per page</option>)}
                </select>
              </label>
              <div className="pricing-page-navigation">
                <button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label={t('adminPricing.previous_pricing_rules_page')} data-testid="button-pricing-page-prev">‹</button>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map(value => <button key={value} className={cn(value === currentPage && 'active')} onClick={() => setPage(value)} data-testid={`button-pricing-page-${value}`}>{value}</button>)}
                <button onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label={t('adminPricing.next_pricing_rules_page')} data-testid="button-pricing-page-next">›</button>
              </div>
            </div>
          </div>
        </>}
      </div>
    </div>
    {drawer && <PricingRuleDrawer rule={drawer === 'new' ? undefined : drawer} rules={pricingRules} onClose={() => setDrawer(null)} />}
    {bulkEditDrawerOpen && <BulkPricingRuleDrawer rules={selectedRules} allOptions={settlementOptions} onClose={() => setBulkEditDrawerOpen(false)} onSuccess={handleBulkActionSuccess} />}
    {bulkDeleteModalOpen && <BulkDeleteModal rules={selectedRules} onClose={() => setBulkDeleteModalOpen(false)} onConfirm={handleBulkDelete} pending={bulkAction.isPending} error={error} />}
  </AdminShell>;
}

type ReceivingWalletDraft = {
  walletAddress: string;
  memo: string;
  enabled: boolean;
  depositProvider: string;
};

function persistedReceivingWalletDraft(
  network: CryptoNetwork,
  catalog: CryptoNetwork[],
): ReceivingWalletDraft {
  // A draft belongs to this exact assigned network. Never infer an address
  // from another asset's row with the same network code.
  const savedWallet = catalog.find(candidate => candidate.id === network.id);

  return {
    walletAddress: savedWallet?.sharedDepositAddress || '',
    memo: savedWallet?.sharedDepositMemo || '',
    enabled: network.customerDepositsEnabled ?? false,
    depositProvider: network.depositProvider || 'manual',
  };
}

function AssetDrawer({
  asset,
  onClose,
  onWalletReconciled,
}: {
  asset?: CryptoAsset | 'new';
  onClose: () => void;
  onWalletReconciled?: (enabled: number, remainedDisabled: number) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const createAsset = useCreateCryptoAsset();
  const updateAsset = useUpdateCryptoAsset();
  const updateNetwork = useUpdateCryptoNetwork();
  const applyNetworksBulk = useApplyCryptoAssetsBulkEdit();
  const saveReceivingWallet = useSaveCryptoAssetReceivingWallet();
  const deleteAsset = useDeleteCryptoAsset();
  const uploadAssetLogo = useRequestCryptoAssetLogoUpload();
  const deleteAssetLogo = useDeleteCryptoAssetLogoUpload();
  const deleteAssetNetworkLogo = useDeleteCryptoNetworkLogoUpload();
  const assetNetworksQuery = useGetCryptoNetworks({ query: { queryKey: getGetCryptoNetworksQueryKey() } });
  const isNew = asset === 'new';

  const providerOptionsQuery = useGetDepositProviderOptions({ query: { queryKey: getGetDepositProviderOptionsQueryKey() } });
  const providerOptions = providerOptionsQuery.data || [];

  const [form, setForm] = useState({
    id: isNew ? '' : (asset?.id || ''),
    code: isNew ? '' : (asset?.code || ''),
    name: isNew ? '' : (asset?.name || ''),
    decimals: isNew ? 8 : (asset?.decimals ?? 8),
    enabled: isNew ? true : (asset?.enabled ?? true),
    lifecycle: isNew ? 'active' : (asset as any)?.lifecycle || 'active'
  });
  const [logoObjectPath, setLogoObjectPath] = useState(isNew ? '' : ((asset as any)?.logoObjectPath || ''));
  const commitAssetLogoRef = useRef<() => void>(() => {});
  const [error, setError] = useState('');
  const [networkActionNotice, setNetworkActionNotice] = useState<string | null>(null);
  const assetNetworks = useMemo(
    () => (isNew ? [] : (assetNetworksQuery.data || []).filter((network: CryptoNetwork) => network.assetId === asset?.id)),
    [assetNetworksQuery.data, isNew, asset === 'new' ? undefined : asset?.id],
  );
  const allAssetNetworks = assetNetworksQuery.data || [];
  const [receivingNetworkId, setReceivingNetworkId] = useState('');
  const [receivingDrafts, setReceivingDrafts] = useState<Record<string, ReceivingWalletDraft>>({});

  useEffect(() => {
    if (isNew) {
      setReceivingNetworkId('');
      setReceivingDrafts({});
      return;
    }
    setReceivingDrafts(current => {
      const next = { ...current };
      assetNetworks.forEach(network => {
        if (!next[network.id]) {
          next[network.id] = persistedReceivingWalletDraft(network, allAssetNetworks);
        }
      });
      return next;
    });
    if (assetNetworks.length > 0 && !assetNetworks.some(network => network.id === receivingNetworkId)) {
      setReceivingNetworkId(assetNetworks[0].id);
    }
  }, [allAssetNetworks, assetNetworks, isNew, receivingNetworkId]);

  const selectedReceivingNetwork = assetNetworks.find(network => network.id === receivingNetworkId);
  const selectedReceivingDraft = selectedReceivingNetwork
    ? receivingDrafts[selectedReceivingNetwork.id] || persistedReceivingWalletDraft(selectedReceivingNetwork, allAssetNetworks)
    : null;
  const isApiProvider = Boolean(
    selectedReceivingDraft &&
    selectedReceivingDraft.depositProvider !== 'manual' &&
    selectedReceivingDraft.depositProvider !== 'none',
  );
  const isManual = selectedReceivingDraft?.depositProvider === 'manual';
  const selectedProviderOption = providerOptions.find(option => option.id === selectedReceivingDraft?.depositProvider);
  const selectedProviderUnavailable = Boolean(
    selectedReceivingDraft &&
    isApiProvider &&
    !selectedProviderOption,
  );

  const hasValidWallet = Boolean(selectedReceivingDraft?.walletAddress.trim());
  const hasRequiredMemo = !selectedReceivingNetwork?.requiresMemo || Boolean(selectedReceivingDraft?.memo.trim());
  const manualIsValid = hasValidWallet && hasRequiredMemo;

  const receivingCanEnable = Boolean(
    (isApiProvider && !selectedProviderUnavailable) || (isManual && manualIsValid)
  );

  const updateReceivingDraft = (updates: Partial<ReceivingWalletDraft>) => {
    if (!selectedReceivingNetwork || !selectedReceivingDraft) return;
    setReceivingDrafts(current => {
      const next = { ...selectedReceivingDraft, ...updates };
      const isNextApiProvider = next.depositProvider !== 'manual' && next.depositProvider !== 'none';
      const isNextManual = next.depositProvider === 'manual';
      const nextHasValidWallet = Boolean(next.walletAddress.trim());
      const nextHasRequiredMemo = !selectedReceivingNetwork.requiresMemo || Boolean(next.memo.trim());
      const nextManualIsValid = nextHasValidWallet && nextHasRequiredMemo;

      const nextProviderAvailable = providerOptions.some(option => option.id === next.depositProvider);
      const canEnable = (isNextApiProvider && nextProviderAvailable) || (isNextManual && nextManualIsValid);
      return {
        ...current,
        [selectedReceivingNetwork.id]: { ...next, enabled: canEnable ? next.enabled : false },
      };
    });
  };

  const selectReceivingNetwork = (networkId: string) => {
    const network = assetNetworks.find(candidate => candidate.id === networkId);
    if (!network) {
      setReceivingNetworkId(networkId);
      return;
    }
    setReceivingDrafts(current => current[network.id]
      ? current
      : { ...current, [network.id]: persistedReceivingWalletDraft(network, allAssetNetworks) });
    setReceivingNetworkId(network.id);
  };

  const toggleNetworkEnabled = async (network: CryptoNetwork, enabled: boolean) => {
    setError('');
    setNetworkActionNotice(null);
    try {
      await updateNetwork.mutateAsync({ id: network.id, data: { enabled } });
      await queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() });
    } catch (err) {
      setError(apiErrorText(err, `Failed to ${enabled ? 'enable' : 'disable'} ${network.networkName}.`));
    }
  };

  const setAllNetworksEnabled = async (enabled: boolean) => {
    setError('');
    setNetworkActionNotice(null);
    try {
      if (!asset || asset === 'new') return;
      await applyNetworksBulk.mutateAsync({
        data: {
          edits: [{
            assetId: asset.id,
            networks: assetNetworks.map(network => ({ networkId: network.id, enabled })),
          }],
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetCryptoAssetsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
      ]);
      setNetworkActionNotice(`${enabled ? 'Enabled' : 'Disabled'} all ${assetNetworks.length} assigned networks.`);
    } catch (err) {
      setError(apiErrorText(err, `Failed to ${enabled ? 'enable' : 'disable'} all networks.`));
      setNetworkActionNotice('Some networks may not have been updated. Review the network rows and try again.');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isNew) {
      if (!form.id.trim()) {
        setError('Asset ID is required.');
        return;
      }
      try {
        await createAsset.mutateAsync({ data: { ...form, logoObjectPath: logoObjectPath || null, decimals: Number(form.decimals) } as any });
        queryClient.invalidateQueries({ queryKey: getGetCryptoAssetsQueryKey() });
        onClose();
      } catch (err) {
        setError(apiErrorText(err, t('adminCatalog.failed_to_create_asset')));
      }
    } else if (asset) {
      const { id: _id, ...updates } = form;
      try {
        await updateAsset.mutateAsync({ id: asset.id, data: { ...updates, logoObjectPath: logoObjectPath || null, decimals: Number(form.decimals) } as any });
        commitAssetLogoRef.current();
        const previousPath = (asset as any)?.logoObjectPath as string | undefined;
        if (previousPath && previousPath !== logoObjectPath) void deleteAssetLogo.mutateAsync({ id: previousPath.split('/').pop()! }).catch(() => undefined);
        if (selectedReceivingNetwork && selectedReceivingDraft) {
          const updatedNetworks = await saveReceivingWallet.mutateAsync({
            id: asset.id,
            data: {
              networkId: selectedReceivingNetwork.id,
              walletAddress: selectedReceivingDraft.walletAddress.trim(),
              memo: selectedReceivingDraft.memo.trim() || null,
              enabled: Boolean(selectedReceivingDraft.enabled && receivingCanEnable),
              depositProvider: selectedReceivingDraft.depositProvider,
             } as any,
          });
          onWalletReconciled?.(
            updatedNetworks.filter(network => network.customerDepositsEnabled).length,
            updatedNetworks.filter(network => !network.customerDepositsEnabled).length,
          );
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetCryptoAssetsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
        ]);
        onClose();
      } catch (err) {
        setError(apiErrorText(err, selectedReceivingNetwork ? 'Failed to save the receiving wallet.' : t('adminCatalog.failed_to_update_asset')));
      }
    }
  };

  const remove = () => {
    if (isNew || !asset || !window.confirm(`Are you sure you want to delete ${asset.code}?`)) return;
    deleteAsset.mutate({ id: asset.id }, {
      onSuccess: () => {
        const previousPath = (asset as any)?.logoObjectPath as string | undefined;
        if (previousPath) void deleteAssetLogo.mutateAsync({ id: previousPath.split('/').pop()! }).catch(() => undefined);
        const childPaths = (assetNetworksQuery.data || [])
          .filter((candidate: CryptoNetwork) => candidate.assetId === asset.id)
          .map((candidate: CryptoNetwork) => (candidate as any).logoObjectPath as string | undefined)
          .filter(Boolean) as string[];
        void Promise.allSettled(childPaths.map(path => deleteAssetNetworkLogo.mutateAsync({ id: path.split('/').pop()! })));
        queryClient.invalidateQueries({ queryKey: getGetCryptoAssetsQueryKey() });
        onClose();
      },
      onError: (err) => setError(apiErrorText(err, t('adminCatalog.failed_to_delete_asset')))
    });
  };

  return (
    <div className="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
       <aside className="order-drawer catalog-editor-drawer asset-editor-drawer" role="dialog" aria-label={isNew ? t('adminCatalog.add_crypto_asset') : t('adminCatalog.edit_crypto_asset')}>
        <div className="drawer-head catalog-editor-head"><div className="catalog-editor-heading"><span className="catalog-editor-icon"><Coins size={19} /></span><div><span className="section-kicker">{t('adminCatalog.configuration')}</span><h2>{isNew ? t('adminCatalog.add_crypto_asset') : t('adminCatalog.edit_crypto_asset')}</h2></div></div><button className="icon-button catalog-editor-close" onClick={onClose} aria-label={t('adminCatalog.close_crypto_asset_drawer')}><X size={18} /></button></div>
        <form className="admin-form admin-form-card drawer-edit catalog-editor-form" onSubmit={save}>
          {error && <InlineNotice kind="error">{error}</InlineNotice>}
          {networkActionNotice && <InlineNotice kind="info">{networkActionNotice}</InlineNotice>}
          <div className="catalog-editor-identity-preview">
             <span className="catalog-editor-logo-preview"><AdminCryptoLogo symbol={form.code || '—'} logoUrl={(asset as any)?.logoUrl} size="md" /></span>
            <span><small>{t('adminCatalog.crypto_asset')}</small><strong>{form.name || 'Asset name'}</strong><em>{form.code.toUpperCase() || 'SYMBOL'} · {form.decimals} {t('adminCatalog.decimals')}</em></span>
            <StatusPill status={form.enabled ? 'Enabled' : 'Disabled'} />
          </div>

          <label><span className="field-label">{t('adminCatalog.id_slug')}</span><input required disabled={!isNew} value={form.id} onChange={e => setForm({...form, id: e.target.value})} placeholder={t('adminCatalog.e_g_bitcoin')} pattern="^[a-z0-9][a-z0-9-]{0,63}$" /></label>
          <label><span className="field-label">{t('adminCatalog.code')}</span><input required value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder={t('adminCatalog.e_g_btc')} pattern="^[A-Za-z0-9]{2,16}$" /></label>
          <label><span className="field-label">{t('adminCatalog.name')}</span><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder={t('adminCatalog.e_g_bitcoin_2')} /></label>
           <CatalogImageUploadField label={t('adminCatalog.logo_upload')} namespace="crypto-asset" persistedPath={(asset as any)?.logoObjectPath} persistedUrl={(asset as any)?.logoUrl} onPathChange={path => setLogoObjectPath(path || '')} onRegisterCommit={commit => { commitAssetLogoRef.current = commit; }} requestUpload={data => uploadAssetLogo.mutateAsync({ data: data as any })} deleteUpload={path => deleteAssetLogo.mutateAsync({ id: path.split('/').pop()! })} disabled={createAsset.isPending || updateAsset.isPending} testId="input-asset-logo" />

          <div className="admin-form-grid form-grid">
            <label><span className="field-label">{t('adminCatalog.decimals_2')}</span><input type="number" required min={0} max={30} value={form.decimals} onChange={e => setForm({...form, decimals: Number(e.target.value)})} /></label>
          </div>

          <label><span className="field-label">{t('adminCatalog.lifecycle')}</span>
            <select value={form.lifecycle} onChange={e => setForm(f => ({...f, lifecycle: e.target.value}))}>
              <option value="active">{t('adminCatalog.active')}</option>
              <option value="restricted">{t('adminCatalog.restricted')}</option>
              <option value="deprecated">{t('adminCatalog.deprecated')}</option>
            </select>
          </label>

          <label className="catalog-editor-toggle">
            <input type="checkbox" className="w-auto h-auto" checked={form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})} />
            <span className="field-label !mb-0 text-sm font-bold">{t('adminCatalog.enabled')}</span>
          </label>

          <section className="receiving-wallet-section" data-testid="receiving-wallet-section" aria-label="Receiving Wallet Address">
            <div className="panel-heading mb-3">
              <div><span className="section-kicker">Receiving funds</span><h2>Receiving Wallet Address</h2></div>
            </div>
            {isNew ? (
              <p className="field-hint">Save this asset and assign at least one network before configuring a receiving address.</p>
            ) : assetNetworks.length === 0 ? (
              <p className="field-hint">Assign at least one network to this asset before configuring a receiving address.</p>
            ) : (
               <>
                 <div className="receiving-network-actions flex flex-wrap gap-2 mb-3">
                    <button type="button" className="button button-secondary" data-testid="button-enable-all-networks" onClick={() => void setAllNetworksEnabled(true)} disabled={updateNetwork.isPending || applyNetworksBulk.isPending}>
                     Enable All Networks
                   </button>
                    <button type="button" className="button button-secondary" data-testid="button-disable-all-networks" onClick={() => void setAllNetworksEnabled(false)} disabled={updateNetwork.isPending || applyNetworksBulk.isPending}>
                     Disable All Networks
                   </button>
                 </div>
                 <div className="receiving-network-list" aria-label="Assigned networks">
                   {assetNetworks.map(network => (
                     <article key={network.id} className={`receiving-network-card ${network.id === receivingNetworkId ? 'is-selected' : ''}`} data-testid={`assigned-network-${network.id}`}>
                       <button type="button" className="receiving-network-card-select" onClick={() => selectReceivingNetwork(network.id)} aria-expanded={network.id === receivingNetworkId}>
                         <span><strong>{network.networkName}</strong><small>{network.networkCode} · {network.id}</small></span>
                         <span className="text-xs">{network.customerDepositsEnabled ? 'Deposits ready' : 'Deposits disabled'}</span>
                       </button>
                       <label className="catalog-editor-toggle">
                         <input type="checkbox" data-testid={`network-enabled-${network.id}`} checked={Boolean(network.enabled)} onChange={e => void toggleNetworkEnabled(network, e.target.checked)} disabled={updateNetwork.isPending} />
                         <span className="field-label !mb-0 text-sm font-bold">Enabled</span>
                       </label>
                     </article>
                   ))}
                 </div>
                 <div className="receiving-network-config">
                   <div className="panel-heading">
                     <div><span className="section-kicker">Selected network</span><h3>{selectedReceivingNetwork?.networkName} ({selectedReceivingNetwork?.networkCode})</h3></div>
                   </div>
                   <label>
                     <span className="field-label">Provider Policy</span>
                     <select
                       data-testid="receiving-wallet-provider"
                       value={selectedReceivingDraft?.depositProvider || 'manual'}
                       disabled={providerOptionsQuery.isLoading}
                       onChange={e => updateReceivingDraft({ depositProvider: e.target.value })}
                     >
                       {selectedProviderUnavailable && selectedReceivingDraft && (
                         <option value={selectedReceivingDraft.depositProvider} disabled>
                           {selectedReceivingDraft.depositProvider} (not connected)
                         </option>
                       )}
                       {providerOptions.map(opt => (
                         <option key={opt.id} value={opt.id} disabled={!opt.implemented}>{opt.label}</option>
                       ))}
                     </select>
                   </label>
                   <label>
                     <span className="field-label">{isApiProvider ? 'Fallback Wallet Address' : 'Wallet Address'}</span>
                     <input data-testid="receiving-wallet-address" value={selectedReceivingDraft?.walletAddress || ''} onChange={e => updateReceivingDraft({ walletAddress: e.target.value })} placeholder="Master receiving address" />
                   </label>
                   <label>
                     <span className="field-label">{isApiProvider ? 'Fallback Memo / Tag' : 'Memo / Tag'}</span>
                     <input data-testid="receiving-wallet-memo" value={selectedReceivingDraft?.memo || ''} onChange={e => updateReceivingDraft({ memo: e.target.value })} placeholder="Optional memo or tag" />
                   </label>
                   <div className="network-toggle-group catalog-editor-toggles">
                     <label>
                       <input data-testid="receiving-wallet-enabled" type="checkbox" className="w-auto h-auto" checked={Boolean(selectedReceivingDraft?.enabled && receivingCanEnable && selectedReceivingDraft?.depositProvider !== 'none')} disabled={!receivingCanEnable || selectedReceivingDraft?.depositProvider === 'none'} onChange={e => updateReceivingDraft({ enabled: e.target.checked })} />
                       <span className="field-label !mb-0 font-bold">Enable customer deposits</span>
                     </label>
                   </div>
                   {isApiProvider ? (
                     <p className="field-hint text-muted-foreground mt-1.5 text-[13px]">
                       {selectedProviderUnavailable
                         ? 'This assigned provider is not currently connected and enabled in API Integrations.'
                         : `${selectedProviderOption?.label || 'The selected provider'} generates the deposit address through its API. If generation fails, the exact wallet above is used as fallback.`}
                       {!selectedProviderUnavailable && !receivingCanEnable && " The fallback is currently invalid."}
                     </p>
                   ) : selectedReceivingDraft?.depositProvider === 'none' ? (
                     <p className="field-hint text-muted-foreground mt-1.5 text-[13px]">
                       Deposits are disabled. The address above remains editable for future use.
                     </p>
                   ) : (
                     !receivingCanEnable && <p className="field-hint text-muted-foreground mt-1.5 text-[13px]">
                       Customer deposits require a wallet address.
                     </p>
                   )}
                   {selectedReceivingDraft?.walletAddress.trim() && (
                     <div className="receiving-wallet-qr" data-testid="receiving-wallet-qr" aria-label="Receiving wallet QR preview">
                       <QRCodeSVG value={selectedReceivingDraft.walletAddress.trim()} size={168} />
                     </div>
                   )}
                 </div>
              </>
            )}
          </section>

          <div className="catalog-editor-actions">
             <button type="submit" className="catalog-editor-primary" disabled={createAsset.isPending || updateAsset.isPending || saveReceivingWallet.isPending}><Save size={16} />{t('adminCatalog.save_asset')}</button>
            {!isNew && <button type="button" className="catalog-editor-danger" onClick={remove} disabled={deleteAsset.isPending}><Trash2 size={15} />{t('adminCatalog.delete')}</button>}
          </div>
        </form>
      </aside>
    </div>
  );
}

function NetworkDrawer({ network, onClose }: { network?: CryptoNetwork | 'new'; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const createNetwork = useCreateCryptoNetwork();
  const updateNetwork = useUpdateCryptoNetwork();
  const deleteNetwork = useDeleteCryptoNetwork();
  const uploadNetworkLogo = useRequestCryptoNetworkLogoUpload();
  const deleteNetworkLogo = useDeleteCryptoNetworkLogoUpload();
  const assetsQuery = useGetCryptoAssets({ query: { queryKey: getGetCryptoAssetsQueryKey() } });

  const isNew = network === 'new';

  const [form, setForm] = useState({
    id: isNew ? '' : (network?.id || ''),
    assetId: isNew ? '' : (network?.assetId || ''),
    networkCode: isNew ? '' : (network?.networkCode || ''),
    networkName: isNew ? '' : (network?.networkName || ''),
    decimals: isNew ? 8 : (network?.decimals ?? 8),
    enabled: isNew ? true : (network?.enabled ?? true),
    customerDepositsEnabled: isNew ? false : (network?.customerDepositsEnabled ?? false),
    requiresMemo: isNew ? false : (network?.requiresMemo ?? false),
    requiredConfirmations: isNew ? 1 : (network?.requiredConfirmations ?? 1),
    confirmationGuidance: isNew ? '' : (network?.confirmationGuidance || ''),
    explorerUrlTemplate: isNew ? '' : (network?.explorerUrlTemplate || ''),
    depositInstructions: isNew ? '' : (network?.depositInstructions || ''),
    depositWarning: isNew ? '' : (network?.depositWarning || ''),
    sharedDepositAddress: isNew ? '' : (network?.sharedDepositAddress || ''),
    sharedDepositMemo: isNew ? '' : (network?.sharedDepositMemo || ''),
    networkFamily: isNew ? '' : ((network as any)?.networkFamily || ''),
    executionMode: isNew ? 'manual' : ((network as any)?.executionMode || 'manual'),
    lifecycle: isNew ? 'active' : ((network as any)?.lifecycle || 'active'),
    regions: isNew ? '' : ((network as any)?.regions?.join(', ') || ''),
  });
  const [logoObjectPath, setLogoObjectPath] = useState(isNew ? '' : ((network as any)?.logoObjectPath || ''));
  const commitNetworkLogoRef = useRef<() => void>(() => {});
  const [error, setError] = useState('');
  const selectedAsset = assetsQuery.data?.find((asset: CryptoAsset) => asset.id === form.assetId);
  const networkCode = form.networkCode.trim();
  const networkName = form.networkName.trim();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const generatedId = `${form.assetId}-${form.networkCode || form.networkName}`
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 81);
    const payload = {
      ...form,
      logoObjectPath: logoObjectPath || null,
      id: isNew ? generatedId : form.id,
      decimals: Number(form.decimals),
      requiredConfirmations: Number(form.requiredConfirmations),
      confirmationGuidance: form.confirmationGuidance || null,
      explorerUrlTemplate: form.explorerUrlTemplate || null,
      depositInstructions: form.depositInstructions || null,
      depositWarning: form.depositWarning || null,
      sharedDepositMemo: form.sharedDepositMemo || null,
      networkFamily: form.networkFamily.trim() || 'native',
      regions: form.regions.split(',').map((r: string) => r.trim()).filter(Boolean),
    };

    if (isNew) {
      if (!payload.id.trim() || !payload.assetId) {
        setError('Asset and Network Code are required.');
        return;
      }
      createNetwork.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() });
          onClose();
        },
        onError: (err) => setError(apiErrorText(err, t('adminCatalog.failed_to_create_network')))
      });
    } else if (network) {
      const { id: _id, assetId: _assetId, ...updates } = payload;
      updateNetwork.mutate({ id: network.id, data: updates }, {
        onSuccess: () => {
          commitNetworkLogoRef.current();
          const previousPath = (network as any)?.logoObjectPath as string | undefined;
          if (previousPath && previousPath !== logoObjectPath) void deleteNetworkLogo.mutateAsync({ id: previousPath.split('/').pop()! }).catch(() => undefined);
          queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() });
          onClose();
        },
        onError: (err) => setError(apiErrorText(err, t('adminCatalog.failed_to_update_network')))
      });
    }
  };

  const remove = () => {
    if (isNew || !network || !window.confirm(`Are you sure you want to delete ${network.networkName}?`)) return;
    deleteNetwork.mutate({ id: network.id }, {
      onSuccess: () => {
        const previousPath = (network as any)?.logoObjectPath as string | undefined;
        if (previousPath) void deleteNetworkLogo.mutateAsync({ id: previousPath.split('/').pop()! }).catch(() => undefined);
        queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() });
        onClose();
      },
      onError: (err) => setError(apiErrorText(err, t('adminCatalog.failed_to_delete_network')))
    });
  };

  return (
    <div className="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="order-drawer network-drawer catalog-editor-drawer" role="dialog" aria-label={isNew ? t('adminCatalog.add_crypto_network') : t('adminCatalog.edit_crypto_network')} data-testid="crypto-network-drawer">
        <div className="drawer-head catalog-editor-head"><div className="catalog-editor-heading"><span className="catalog-editor-icon"><Network size={19} /></span><div><span className="section-kicker">{t('adminCatalog.configuration')}</span><h2>{isNew ? t('adminCatalog.add_crypto_network') : t('adminCatalog.edit_crypto_network')}</h2></div></div><button className="icon-button catalog-editor-close" onClick={onClose} aria-label={t('adminCatalog.close_crypto_network_drawer')}><X size={18} /></button></div>
        <form className="admin-form admin-form-card drawer-edit network-drawer-form catalog-editor-form" onSubmit={save}>
          {error && <InlineNotice kind="error">{error}</InlineNotice>}

          <section className="catalog-editor-network-preview" aria-label={t('adminCatalog.network_asset_and_metadata_preview')}>
            <div>
              <span className="section-kicker">{t('adminCatalog.parent_asset')}</span>
              {selectedAsset ? (
                <AdminCryptoIdentity
                  symbol={selectedAsset.code}
                  name={selectedAsset.name}
                  logoUrl={(selectedAsset as any).logoUrl}
                  size="sm"
                  compact
                  className="mt-1"
                />
              ) : (
                <p className="text-xs text-muted-foreground mt-1">{t('adminCatalog.select_an_asset_to_preview_its_identity')}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <small className="block text-muted-foreground font-bold uppercase tracking-wider">{t('adminCatalog.network_code')}</small>
                <div className="flex items-center gap-2 mt-1">
                  <strong className="font-mono">{networkCode || 'Not set'}</strong>
                   <CryptoNetworkBadge network={networkCode} assetSymbol={selectedAsset?.code} logoUrl={(network as any)?.logoUrl} />
                </div>
              </div>
              <div>
                <small className="block text-muted-foreground font-bold uppercase tracking-wider">{t('adminCatalog.network_name')}</small>
                <strong className="block mt-1">{networkName || 'Not set'}</strong>
              </div>
            </div>
          </section>

          <div className="admin-form-grid form-grid">
            <label><span className="field-label">{t('adminCatalog.asset')}</span>
              <select required disabled={!isNew} value={form.assetId} onChange={e => setForm({...form, assetId: e.target.value})}>
                <option value="" disabled>{t('adminCatalog.select_asset')}</option>
                {assetsQuery.data?.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
              </select>
            </label>
            <label><span className="field-label">{t('adminCatalog.network_code_2')}</span><input required value={form.networkCode} onChange={e => setForm({...form, networkCode: e.target.value})} placeholder={t('adminCatalog.e_g_btc')} /></label>
          </div>
           <CatalogImageUploadField label={t('adminCatalog.logo_upload')} namespace="crypto-network" persistedPath={(network as any)?.logoObjectPath} persistedUrl={(network as any)?.logoUrl} onPathChange={path => setLogoObjectPath(path || '')} onRegisterCommit={commit => { commitNetworkLogoRef.current = commit; }} requestUpload={data => uploadNetworkLogo.mutateAsync({ data: data as any })} deleteUpload={path => deleteNetworkLogo.mutateAsync({ id: path.split('/').pop()! })} disabled={createNetwork.isPending || updateNetwork.isPending} testId="input-network-logo" />

          <div className="admin-form-grid form-grid">
            <label><span className="field-label">{t('adminCatalog.network_name_2')}</span><input required value={form.networkName} onChange={e => setForm({...form, networkName: e.target.value})} placeholder={t('adminCatalog.e_g_bitcoin_2')} /></label>
            <label><span className="field-label">{t('adminCatalog.family')}<small>{t('adminCatalog.optional')}</small></span><input value={form.networkFamily} onChange={e => setForm({...form, networkFamily: e.target.value})} placeholder={t('adminCatalog.e_g_evm')} /></label>
          </div>

          <div className="admin-form-grid form-grid">
            <label><span className="field-label">{t('adminCatalog.decimals_2')}</span><input type="number" required min={0} max={30} value={form.decimals} onChange={e => setForm({...form, decimals: Number(e.target.value)})} /></label>
          </div>

          <div className="admin-form-grid form-grid">
            <label><span className="field-label">{t('adminCatalog.execution_mode')}</span>
              <select value={form.executionMode} onChange={e => setForm(f => ({...f, executionMode: e.target.value}))}>
                <option value="manual">{t('adminCatalog.manual')}</option>
                <option value="catalog">{t('adminCatalog.catalog')}</option>
                <option value="api">{t('adminCatalog.api')}</option>
              </select>
            </label>
            <label><span className="field-label">{t('adminCatalog.lifecycle')}</span>
              <select value={form.lifecycle} onChange={e => setForm(f => ({...f, lifecycle: e.target.value}))}>
                <option value="active">{t('adminCatalog.active')}</option>
                <option value="restricted">{t('adminCatalog.restricted')}</option>
                <option value="deprecated">{t('adminCatalog.deprecated')}</option>
              </select>
            </label>
          </div>

          <label><span className="field-label">{t('adminCatalog.regions')}<small>{t('adminCatalog.comma_separated')}</small></span><input value={form.regions} onChange={e => setForm(f => ({...f, regions: e.target.value}))} placeholder={t('adminCatalog.global_na')} /></label>

          <label className="catalog-editor-toggle">
            <input type="checkbox" className="w-auto h-auto" checked={form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})} />
            <span className="field-label !mb-0 text-sm font-bold">{t('adminCatalog.enabled')}</span>
          </label>

           <label className="catalog-editor-toggle">
             <input type="checkbox" className="w-auto h-auto" checked={form.requiresMemo} onChange={e => setForm({...form, requiresMemo: e.target.checked})} />
             <span className="field-label !mb-0 font-bold">{t('adminCatalog.requires_memo')}</span>
           </label>

          <div className="admin-form-grid form-grid mt-4">
            <label><span className="field-label">{t('adminCatalog.req_confirmations')}</span><input type="number" required min={0} value={form.requiredConfirmations} onChange={e => setForm({...form, requiredConfirmations: Number(e.target.value)})} /></label>
            <label><span className="field-label">{t('adminCatalog.confirmation_guidance')}</span><input value={form.confirmationGuidance} onChange={e => setForm({...form, confirmationGuidance: e.target.value})} placeholder={t('adminCatalog.e_g_10_minutes')} /></label>
          </div>

          <label><span className="field-label">{t('adminCatalog.explorer_url_template')}</span><input value={form.explorerUrlTemplate} onChange={e => setForm({...form, explorerUrlTemplate: e.target.value})} placeholder="https://explorer.com/tx/{tx}" /></label>
          <label><span className="field-label">{t('adminCatalog.deposit_instructions')}</span><textarea rows={2} value={form.depositInstructions} onChange={e => setForm({...form, depositInstructions: e.target.value})} placeholder={t('adminCatalog.shown_to_users_when_depositing')} /></label>
          <label><span className="field-label">{t('adminCatalog.deposit_warning')}</span><textarea rows={2} value={form.depositWarning} onChange={e => setForm({...form, depositWarning: e.target.value})} placeholder={t('adminCatalog.red_warning_text_if_necessary')} /></label>

          <div className="network-drawer-actions catalog-editor-actions">
            <button type="submit" className="catalog-editor-primary" disabled={createNetwork.isPending || updateNetwork.isPending}><Save size={16} />{t('adminCatalog.save_network')}</button>
            {!isNew && <button type="button" className="catalog-editor-danger" onClick={remove} disabled={deleteNetwork.isPending}><Trash2 size={15} />{t('adminCatalog.delete')}</button>}
          </div>
        </form>
      </aside>
    </div>
  );
}

type PricingCoverageRule = ManualDeskPricingRuleInput & { id: string };

const evaluateProjectedPricingCoverage = (
  rules: PricingCoverageRule[],
  options: SettlementOption[],
) => {
  const optionIds = new Set(options.map(option => normalizedPricingSelector(option.id)));
  const eligibleRules = rules.filter(rule => rule.enabled && [
    rule.sourceSettlementOptionId,
    rule.targetSettlementOptionId,
  ].every(id => !id || optionIds.has(normalizedPricingSelector(id))));
  const uncoveredRoutes: Array<{ sourceSettlementOptionId: string; targetSettlementOptionId: string }> = [];
  for (const source of options) {
    if (source.direction !== 'send' && source.direction !== 'both') continue;
    for (const target of options) {
      if (target.direction !== 'receive' && target.direction !== 'both') continue;
      if (
        source.id === target.id ||
        (
          normalizedPricingSelector(source.assetCode) === normalizedPricingSelector(target.assetCode) &&
          normalizedPricingSelector(source.routeNetwork) === normalizedPricingSelector(target.routeNetwork)
        ) ||
        (source.kind !== 'fiat-payment-method' && target.kind !== 'fiat-payment-method')
      ) continue;
      const context = {
        sourceAsset: source.assetCode,
        sourceCryptoAssetId: source.assetId,
        sourceNetwork: source.routeNetwork,
        targetAsset: target.assetCode,
        targetCryptoAssetId: target.assetId,
        targetNetwork: target.routeNetwork,
        sourceSettlementOptionId: source.id,
        targetSettlementOptionId: target.id,
      };
      if (!eligibleRules.some(candidate => pricingRuleMatches(candidate, context))) {
        uncoveredRoutes.push({
          sourceSettlementOptionId: source.id,
          targetSettlementOptionId: target.id,
        });
      }
    }
  }
  return uncoveredRoutes;
};

const pricingCoverageRouteLabel = (
  route: { sourceSettlementOptionId: string; targetSettlementOptionId: string },
  options: SettlementOption[],
) => {
  const source = options.find(option => sameSettlementOptionId(option.id, route.sourceSettlementOptionId));
  const target = options.find(option => sameSettlementOptionId(option.id, route.targetSettlementOptionId));
  return `${pricingOptionLabel(source, route.sourceSettlementOptionId)} → ${pricingOptionLabel(target, route.targetSettlementOptionId)}`;
};

const normalizedPricingSelector = (value: string | null | undefined) => value?.trim().toUpperCase() || null;

const pricingRuleMatches = (
  rule: PricingCoverageRule,
  context: Partial<Record<(typeof pricingCoverageSelectorKeys)[number], string>>,
) => pricingCoverageSelectorKeys.every(key => {
  const selector = normalizedPricingSelector(rule[key]);
  return selector === null ||
    ((key === 'sourceNetwork' || key === 'targetNetwork') &&
      selector === normalizedPricingSelector(ALL_NETWORKS_PRICING_SELECTOR)) ||
    selector === normalizedPricingSelector(context[key]);
});
function withAdminResponsiveLayout(Page: () => React.ReactElement) {
  return function ResponsiveAdminRoute() {
    return (
      <>
        <AdminResponsiveStyles />
        <Page />
      </>
    );
  };
}

const ResponsiveAdminIntegrations = withAdminResponsiveLayout(AdminIntegrations);
const ResponsiveStaffPage = withAdminResponsiveLayout(StaffPage);
const ResponsiveAdminOverview = withAdminResponsiveLayout(AdminOverview);
const ResponsiveAdminRevenue = withAdminResponsiveLayout(AdminRevenue);
const ResponsiveAdminOrders = withAdminResponsiveLayout(AdminOrders);
const ResponsiveAdminCustomers = withAdminResponsiveLayout(AdminCustomers);
const ResponsiveAdminProviders = withAdminResponsiveLayout(AdminProviders);
const ResponsiveAdminCurrencies = withAdminResponsiveLayout(AdminCurrencies);
const ResponsiveAdminManualPricing = withAdminResponsiveLayout(AdminManualPricing);

export {
  ResponsiveAdminIntegrations as AdminIntegrations,
  ResponsiveStaffPage as StaffPage,
  ResponsiveAdminOverview as AdminOverview,
  ResponsiveAdminRevenue as AdminRevenue,
  ResponsiveAdminOrders as AdminOrders,
  ResponsiveAdminCustomers as AdminCustomers,
  ResponsiveAdminProviders as AdminProviders,
  ResponsiveAdminCurrencies as AdminCurrencies,
  ResponsiveAdminManualPricing as AdminManualPricing,
};
