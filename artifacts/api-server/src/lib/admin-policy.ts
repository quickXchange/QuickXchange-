import type { Request, RequestHandler, Response } from "express";
import { db, adminActivityEventsTable } from "@workspace/db";
import { ApiError } from "./api-error";
import {
  OWNER_ONLY_PERMISSION_KEYS,
  type PermissionKey,
} from "./permissions";
import {
  requireOperator,
  type OperatorAuthorization,
} from "./operator-auth";

export type AdminRoutePolicy = {
  permission?: PermissionKey;
  authenticatedOnly?: boolean;
  ownerOnly?: boolean;
};

type PolicyMatcher = {
  method: string;
  pattern: RegExp;
  policy: AdminRoutePolicy;
};

const P = (permission: PermissionKey, ownerOnly = false): AdminRoutePolicy => ({
  permission,
  ownerOnly,
});
const AUTHENTICATED: AdminRoutePolicy = { authenticatedOnly: true };

/**
 * Keep this table exhaustive: adding an Admin route without adding a matcher
 * intentionally produces a 403 for staff instead of silently granting access.
 * Owner is still checked here so a forged/stale staff override cannot cross a
 * sensitive boundary; route-level requireOwner remains defense in depth.
 */
const POLICY_MATCHERS: readonly PolicyMatcher[] = [
  { method: "GET", pattern: /^\/admin\/operators$/, policy: P("team.members.view") },
  { method: "POST", pattern: /^\/admin\/operators\/invitations$/, policy: P("team.members.invite", true) },
  { method: "POST", pattern: /^\/admin\/operators\/[^/]+\/approve$/, policy: P("team.members.update", true) },
  { method: "POST", pattern: /^\/admin\/operators\/[^/]+\/suspend$/, policy: P("team.members.suspend", true) },
  { method: "DELETE", pattern: /^\/admin\/operators\/[^/]+$/, policy: P("team.members.remove", true) },
  { method: "GET", pattern: /^\/admin\/operator-audit$/, policy: P("team.activity.view") },
  { method: "GET", pattern: /^\/admin\/authorization$/, policy: AUTHENTICATED },
  { method: "GET", pattern: /^\/admin\/team-members$/, policy: P("team.members.view") },
  { method: "POST", pattern: /^\/admin\/team-members$/, policy: P("team.members.invite", true) },
  { method: "PATCH", pattern: /^\/admin\/team-members\/[^/]+$/, policy: P("team.members.update", true) },
  { method: "DELETE", pattern: /^\/admin\/team-members\/[^/]+$/, policy: P("team.members.remove", true) },
  { method: "POST", pattern: /^\/admin\/team-members\/[^/]+\/(suspend|reactivate)$/, policy: P("team.members.suspend", true) },
  { method: "GET", pattern: /^\/admin\/team-roles$/, policy: P("team.roles.view") },
  { method: "POST", pattern: /^\/admin\/team-roles$/, policy: P("team.roles.create", true) },
  { method: "PATCH", pattern: /^\/admin\/team-roles\/[^/]+$/, policy: P("team.roles.update", true) },
  { method: "DELETE", pattern: /^\/admin\/team-roles\/[^/]+$/, policy: P("team.roles.delete", true) },
  { method: "GET", pattern: /^\/admin\/activity$/, policy: P("team.activity.view") },
  { method: "GET", pattern: /^\/admin\/summary$/, policy: P("statistics.view") },
  { method: "GET", pattern: /^\/admin\/manual-desk-revenue$/, policy: P("statistics.view") },
  { method: "GET", pattern: /^\/admin\/manual-desk-revenue\.csv$/, policy: P("statistics.export") },
  { method: "GET", pattern: /^\/admin\/providers\/[^/]+$/, policy: P("integrations.view") },
  { method: "GET", pattern: /^\/admin\/providers\/whitebit\/credentials$/, policy: P("integrations.view") },
  { method: "PUT", pattern: /^\/admin\/providers\/whitebit\/credentials$/, policy: P("integrations.credentials.update", true) },
  { method: "POST", pattern: /^\/admin\/providers\/whitebit\/credentials\/test$/, policy: P("integrations.credentials.test", true) },
  { method: "PATCH", pattern: /^\/admin\/providers\/whitebit$/, policy: P("integrations.credentials.update", true) },
  { method: "GET", pattern: /^\/admin\/orders\.xml$/, policy: P("orders.export") },
  { method: "POST", pattern: /^\/admin\/orders\/[^/]+\/reconcile$/, policy: P("orders.status") },
  { method: "GET", pattern: /^\/admin\/orders\/[^/]+\/reconciliation-attempts$/, policy: P("orders.details") },

  { method: "GET", pattern: /^\/admin\/customers$/, policy: P("customers.view") },
  { method: "GET", pattern: /^\/admin\/customers\/[^/]+$/, policy: P("customers.view") },
  { method: "GET", pattern: /^\/admin\/customers\/[^/]+\/referrals$/, policy: P("affiliates.view") },
  { method: "PATCH", pattern: /^\/admin\/customers\/[^/]+$/, policy: P("customers.edit", true) },
  { method: "POST", pattern: /^\/admin\/customers\/[^/]+\/(password-reset|sessions-revoke|email-confirm|suspend|activate)$/, policy: P("customers.edit", true) },

  { method: "GET", pattern: /^\/admin\/fiat-currencies$/, policy: P("currencies.view") },
  { method: "POST", pattern: /^\/admin\/fiat-currencies$/, policy: P("currencies.manage") },
  { method: "PATCH", pattern: /^\/admin\/fiat-currencies\/[^/]+$/, policy: P("currencies.manage") },
  { method: "DELETE", pattern: /^\/admin\/fiat-currencies\/[^/]+$/, policy: P("currencies.manage") },
  { method: "POST", pattern: /^\/admin\/fiat-currencies\/flag-upload$/, policy: P("currencies.manage") },
  { method: "DELETE", pattern: /^\/admin\/fiat-currencies\/flag-upload\/[^/]+$/, policy: P("currencies.manage") },
  { method: "GET", pattern: /^\/admin\/payment-methods$/, policy: P("payment_methods.view") },
  { method: "POST", pattern: /^\/admin\/payment-methods$/, policy: P("payment_methods.manage") },
  { method: "PATCH", pattern: /^\/admin\/payment-methods\/[^/]+$/, policy: P("payment_methods.manage") },
  { method: "DELETE", pattern: /^\/admin\/payment-methods\/[^/]+$/, policy: P("payment_methods.manage") },
  { method: "POST", pattern: /^\/admin\/payment-methods\/logo-upload$/, policy: P("payment_methods.manage") },
  { method: "DELETE", pattern: /^\/admin\/payment-methods\/logo-upload\/[^/]+$/, policy: P("payment_methods.manage") },
  { method: "GET", pattern: /^\/admin\/fiat-currency-payment-methods$/, policy: P("currencies.view") },
  { method: "POST", pattern: /^\/admin\/fiat-currency-payment-methods$/, policy: P("currencies.manage") },
  { method: "POST", pattern: /^\/admin\/fiat-currency-payment-methods\/bulk\/(preview|apply)$/, policy: P("currencies.manage") },
  { method: "PATCH", pattern: /^\/admin\/fiat-currency-payment-methods\/[^/]+$/, policy: P("currencies.manage") },
  { method: "DELETE", pattern: /^\/admin\/fiat-currency-payment-methods\/[^/]+$/, policy: P("currencies.manage") },

  { method: "GET", pattern: /^\/admin\/manual-desk-pricing-rules$/, policy: P("pricing.view") },
  { method: "POST", pattern: /^\/admin\/manual-desk-pricing-rules$/, policy: P("pricing.manage") },
  { method: "POST", pattern: /^\/admin\/manual-desk-pricing-rules\/bulk$/, policy: P("pricing.manage") },
  { method: "POST", pattern: /^\/admin\/manual-desk-pricing-rules\/bulk-create$/, policy: P("pricing.manage") },
  { method: "PATCH", pattern: /^\/admin\/manual-desk-pricing-rules\/[^/]+$/, policy: P("pricing.manage") },
  { method: "DELETE", pattern: /^\/admin\/manual-desk-pricing-rules\/[^/]+$/, policy: P("pricing.manage") },
  { method: "POST", pattern: /^\/admin\/manual-desk-pricing-rules\/(preview|quote-preview)$/, policy: P("pricing.view") },
  { method: "GET", pattern: /^\/admin\/crypto-assets$/, policy: P("crypto_assets.view") },
  { method: "POST", pattern: /^\/admin\/crypto-assets$/, policy: P("crypto_assets.manage") },
  { method: "POST", pattern: /^\/admin\/crypto-assets\/bulk\/apply$/, policy: P("receiving_wallets.manage", true) },
  { method: "PATCH", pattern: /^\/admin\/crypto-assets\/[^/]+$/, policy: P("crypto_assets.manage") },
  { method: "DELETE", pattern: /^\/admin\/crypto-assets\/[^/]+$/, policy: P("crypto_assets.manage") },
  { method: "POST", pattern: /^\/admin\/crypto-assets\/logo-upload$/, policy: P("crypto_assets.manage") },
  { method: "DELETE", pattern: /^\/admin\/crypto-assets\/logo-upload\/[^/]+$/, policy: P("crypto_assets.manage") },
  { method: "GET", pattern: /^\/admin\/crypto-networks$/, policy: P("crypto_networks.view") },
  { method: "POST", pattern: /^\/admin\/crypto-networks$/, policy: P("crypto_networks.manage") },
  { method: "PATCH", pattern: /^\/admin\/crypto-networks\/[^/]+$/, policy: P("crypto_networks.manage") },
  { method: "DELETE", pattern: /^\/admin\/crypto-networks\/[^/]+$/, policy: P("crypto_networks.manage") },
  { method: "PUT", pattern: /^\/admin\/crypto-networks\/receiving-wallet$/, policy: P("receiving_wallets.manage", true) },
  { method: "POST", pattern: /^\/admin\/crypto-networks\/logo-upload$/, policy: P("crypto_networks.manage") },
  { method: "DELETE", pattern: /^\/admin\/crypto-networks\/logo-upload\/[^/]+$/, policy: P("crypto_networks.manage") },
  { method: "GET", pattern: /^\/admin\/deposit-providers$/, policy: P("receiving_wallets.manage", true) },
  { method: "PUT", pattern: /^\/admin\/crypto-assets\/[^/]+\/receiving-wallet$/, policy: P("receiving_wallets.manage", true) },
  { method: "POST", pattern: /^\/admin\/crypto-assets\/reconcile-customer-deposits$/, policy: P("receiving_wallets.manage", true) },
  { method: "GET", pattern: /^\/admin\/blockchain-monitoring\/networks$/, policy: P("blockchain_monitoring.view") },
  { method: "POST", pattern: /^\/admin\/blockchain-monitoring\/networks$/, policy: P("blockchain_monitoring.manage", true) },
  { method: "PATCH", pattern: /^\/admin\/blockchain-monitoring\/networks\/[^/]+$/, policy: P("blockchain_monitoring.manage", true) },
  { method: "POST", pattern: /^\/admin\/blockchain-monitoring\/networks\/[^/]+\/test$/, policy: P("blockchain_monitoring.view") },
  { method: "GET", pattern: /^\/admin\/blockchain-monitoring\/assets\/list$/, policy: P("blockchain_monitoring.view") },
  { method: "GET", pattern: /^\/admin\/blockchain-monitoring\/setup\/routes$/, policy: P("blockchain_monitoring.view") },
  { method: "POST", pattern: /^\/admin\/blockchain-monitoring\/setup\/enable-ready$/, policy: P("blockchain_monitoring.manage", true) },
  { method: "POST", pattern: /^\/admin\/blockchain-monitoring\/setup\/enable-selected$/, policy: P("blockchain_monitoring.manage", true) },
  { method: "GET", pattern: /^\/admin\/blockchain-monitoring\/registration-gaps$/, policy: P("blockchain_monitoring.view") },
  { method: "POST", pattern: /^\/admin\/blockchain-monitoring\/registration-gaps\/[^/]+\/activate$/, policy: P("blockchain_monitoring.manage", true) },
  { method: "POST", pattern: /^\/admin\/blockchain-monitoring\/assets\/upsert$/, policy: P("blockchain_monitoring.manage", true) },
  { method: "GET", pattern: /^\/admin\/blockchain-monitoring\/watches$/, policy: P("blockchain_monitoring.view") },
  { method: "GET", pattern: /^\/admin\/blockchain-monitoring\/matches$/, policy: P("blockchain_monitoring.view") },
  { method: "POST", pattern: /^\/admin\/blockchain-monitoring\/matches\/[^/]+\/review$/, policy: P("blockchain_monitoring.manage", true) },

  { method: "GET", pattern: /^(?:\/quickex)?\/admin\/credentials$/, policy: P("integrations.view") },
  { method: "PUT", pattern: /^(?:\/quickex)?\/admin\/credentials$/, policy: P("integrations.credentials.update", true) },
  { method: "GET", pattern: /^(?:\/quickex)?\/admin\/diagnostics$/, policy: P("integrations.view") },
  { method: "POST", pattern: /^(?:\/quickex)?\/admin\/credentials\/test$/, policy: P("integrations.credentials.test", true) },

  { method: "GET", pattern: /^\/admin\/affiliate\/(settings|overview|accounts|commissions|payouts|valuation-reviews)(\/[^/]+)?$/, policy: P("affiliates.view") },
  { method: "PATCH", pattern: /^\/admin\/affiliate\/payouts\/[^/]+$/, policy: P("affiliates.manage") },
  { method: "POST", pattern: /^\/admin\/affiliate\/settings$/, policy: P("affiliates.manage", true) },
  { method: "PATCH", pattern: /^\/admin\/affiliate\/valuation-reviews\/[^/]+$/, policy: P("affiliates.manage", true) },
  { method: "POST", pattern: /^\/admin\/affiliate\/.*$/, policy: P("affiliates.manage") },
  { method: "PATCH", pattern: /^\/admin\/affiliate\/.*$/, policy: P("affiliates.manage") },
  { method: "PUT", pattern: /^\/admin\/affiliate\/.*$/, policy: P("affiliates.manage") },

  { method: "GET", pattern: /^\/admin\/blog\/.*$/, policy: P("blog.view") },
  { method: "POST", pattern: /^\/admin\/blog\/.*$/, policy: P("blog.manage") },
  { method: "PATCH", pattern: /^\/admin\/blog\/.*$/, policy: P("blog.manage") },
  { method: "PUT", pattern: /^\/admin\/blog\/.*$/, policy: P("blog.manage") },
  { method: "DELETE", pattern: /^\/admin\/blog\/.*$/, policy: P("blog.manage") },

  { method: "GET", pattern: /^\/admin\/landing-background$/, policy: P("site_settings.view") },
  { method: "POST", pattern: /^\/admin\/landing-background(\/upload)?$/, policy: P("site_settings.manage", true) },
  { method: "GET", pattern: /^\/admin\/site-content$/, policy: P("site_settings.view") },
  { method: "POST", pattern: /^\/admin\/site-content$/, policy: P("site_settings.manage") },
  { method: "GET", pattern: /^\/admin\/site-content\/[^/]+(\/preview)?$/, policy: P("site_settings.view") },
  { method: "PUT", pattern: /^\/admin\/site-content\/[^/]+$/, policy: P("site_settings.manage") },
  { method: "POST", pattern: /^\/admin\/site-content\/[^/]+$/, policy: P("site_settings.manage", true) },
  { method: "POST", pattern: /^\/admin\/site-page-media\/upload$/, policy: P("site_settings.manage") },
  { method: "GET", pattern: /^\/admin\/site-page-media\/[^/]+\/[^/]+\/preview$/, policy: P("site_settings.view") },
  { method: "GET", pattern: /^\/admin\/website-branding$/, policy: P("site_settings.view") },
  { method: "GET", pattern: /^\/admin\/notification-settings$/, policy: P("site_settings.view") },
  { method: "PUT", pattern: /^\/admin\/notification-settings$/, policy: P("site_settings.manage", true) },
  { method: "POST", pattern: /^\/admin\/notification-settings\/(test-email|test-telegram|telegram-link|telegram-disconnect)$/, policy: P("site_settings.manage", true) },
  { method: "GET", pattern: /^\/admin\/notification-settings\/email-templates$/, policy: P("site_settings.view") },
  { method: "PUT", pattern: /^\/admin\/notification-settings\/email-templates$/, policy: P("site_settings.manage", true) },
  { method: "POST", pattern: /^\/admin\/notification-settings\/email-templates\/test$/, policy: P("site_settings.manage", true) },
  { method: "GET", pattern: /^\/admin\/notification-settings\/telegram-link\/[^/]+$/, policy: P("site_settings.manage", true) },
  { method: "PUT", pattern: /^\/admin\/website-branding$/, policy: P("site_settings.manage", true) },
  { method: "POST", pattern: /^\/admin\/website-branding\/(reset|upload)$/, policy: P("site_settings.manage", true) },
  { method: "POST", pattern: /^\/admin\/site-publication$/, policy: P("site_settings.manage", true) },
  { method: "GET", pattern: /^\/admin\/site-navigation$/, policy: P("site_settings.view") },
  { method: "POST", pattern: /^\/admin\/site-navigation$/, policy: P("site_settings.manage") },
  { method: "DELETE", pattern: /^\/admin\/site-navigation\/[^/]+$/, policy: P("site_settings.manage") },
  { method: "GET", pattern: /^\/admin\/partner-logos$/, policy: P("site_settings.view") },
  { method: "POST", pattern: /^\/admin\/partner-logos(\/upload)?$/, policy: P("site_settings.manage") },
  { method: "PATCH", pattern: /^\/admin\/partner-logos\/[^/]+$/, policy: P("site_settings.manage") },
  { method: "DELETE", pattern: /^\/admin\/partner-logos\/[^/]+$/, policy: P("site_settings.manage") },
  { method: "GET", pattern: /^\/admin\/partner-logos\/[^/]+\/preview$/, policy: P("site_settings.view") },
  { method: "GET", pattern: /^\/admin\/social-trust$/, policy: P("social_media.view") },
  { method: "PUT", pattern: /^\/admin\/social-trust$/, policy: P("social_media.manage") },
  { method: "PUT", pattern: /^\/admin\/social-trust\/social-media$/, policy: P("social_media.manage") },
  { method: "POST", pattern: /^\/admin\/social-trust(\/upload|\/items)?$/, policy: P("social_media.manage") },
  { method: "PATCH", pattern: /^\/admin\/social-trust\/items\/[^/]+$/, policy: P("social_media.manage") },
  { method: "DELETE", pattern: /^\/admin\/social-trust\/items\/[^/]+$/, policy: P("social_media.manage") },
  { method: "GET", pattern: /^\/admin\/social-trust\/items\/[^/]+\/preview$/, policy: P("social_media.view") },
  { method: "GET", pattern: /^\/admin\/contact-submissions$/, policy: P("site_settings.view") },
  { method: "GET", pattern: /^\/admin\/newsletter\/subscribers$/, policy: P("site_settings.view") },
  { method: "PATCH", pattern: /^\/admin\/newsletter\/subscribers\/[^/]+$/, policy: P("site_settings.manage") },
  { method: "DELETE", pattern: /^\/admin\/newsletter\/subscribers\/[^/]+$/, policy: P("site_settings.manage") },
  { method: "POST", pattern: /^\/admin\/newsletter\/announcements$/, policy: P("site_settings.manage") },

  // Operator-visible order routes are classified too, even though they are
  // not under /admin and have their own route-level middleware.
  { method: "GET", pattern: /^\/orders$/, policy: P("orders.view") },
  { method: "GET", pattern: /^\/orders\/[^/]+$/, policy: P("orders.details") },
  { method: "GET", pattern: /^\/orders\/[^/]+\/audit-log$/, policy: P("orders.details") },
  { method: "POST", pattern: /^\/orders\/bulk\/status$/, policy: P("orders.status") },
  { method: "PATCH", pattern: /^\/orders\/[^/]+$/, policy: AUTHENTICATED },
  { method: "PATCH", pattern: /^\/orders\/[^/]+\/support-tools$/, policy: P("orders.support_tools") },
  { method: "POST", pattern: /^\/orders\/[^/]+\/assignment$/, policy: P("orders.assign", true) },
  { method: "POST", pattern: /^\/orders\/bulk\/archive$/, policy: P("orders.archive", true) },
  { method: "POST", pattern: /^\/orders\/bulk\/delete$/, policy: P("orders.archive", true) },
  { method: "POST", pattern: /^\/orders\/[^/]+\/(archive|restore)$/, policy: P("orders.archive", true) },
];

export function classifyAdminRoute(
  method: string,
  path: string,
): AdminRoutePolicy | undefined {
  const normalizedPath = path.split("?")[0] ?? path;
  return POLICY_MATCHERS.find(
    (matcher) =>
      matcher.method === method.toUpperCase() &&
      matcher.pattern.test(normalizedPath),
  )?.policy;
}

const activityRegistered = Symbol("adminActivityRegistered");
type ActivityResponse = Response & {
  [activityRegistered]?: Set<string>;
};

export function recordAdminMutationActivity(
  req: Request,
  res: Response,
  metadata: {
    permission: PermissionKey;
    action: string;
    entityId?: string | null;
  },
): void {
  const response = res as ActivityResponse;
  const registrationKey = `${metadata.permission}:${metadata.action}`;
  const registrations = response[activityRegistered] ?? new Set<string>();
  if (registrations.has(registrationKey)) return;
  const operator = res.locals.operator as OperatorAuthorization | undefined;
  if (!operator) return;
  registrations.add(registrationKey);
  response[activityRegistered] = registrations;
  const section = metadata.permission.split(".")[0] ?? "admin";
  const entityId = metadata.entityId ?? req.path.match(
    /\/((?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})|(?:O[0-9]{9})|(?:QX-[0-9a-f-]{16,}))/i,
  )?.[1] ?? null;
  const entityKind = section === "orders" ? "Order" : "Item";
  const actorSnapshot = operator;
  res.once("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    void db.insert(adminActivityEventsTable).values({
      actorOperatorId: actorSnapshot.id,
      actorMemberName: actorSnapshot.name,
      actorMemberEmail: actorSnapshot.email,
      actorRole: actorSnapshot.role,
      permissionKey: metadata.permission,
      action: metadata.action,
      section,
      entityKind,
      entityId,
      safeLabel: null,
      requestId: req.id == null ? null : String(req.id),
      outcome: "success",
    }).catch((error: unknown) => {
      req.log.error({ err: error }, "Could not append Admin activity event");
    });
  });
}

export const adminPolicy: RequestHandler = (req, res, next) => {
  const isAdminNamespace =
    req.path.startsWith("/admin/") ||
    req.path === "/admin" ||
    req.path.startsWith("/quickex/admin/");
  const isOperatorOrderRoute =
    (req.method === "GET" &&
      (/^\/orders$/.test(req.path) ||
        /^\/orders\/[^/]+$/.test(req.path) ||
        /^\/orders\/[^/]+\/audit-log$/.test(req.path))) ||
    (req.method === "PATCH" && /^\/orders\/[^/]+$/.test(req.path)) ||
    (req.method === "POST" &&
      (/^\/orders\/bulk\/status$/.test(req.path) ||
        /^\/orders\/bulk\/archive$/.test(req.path) ||
        /^\/orders\/[^/]+\/(assignment|archive|restore)$/.test(req.path)));
  if (!isAdminNamespace && !isOperatorOrderRoute) {
    next();
    return;
  }
  const policy = classifyAdminRoute(req.method, req.path);
  if (!policy) {
    next(
      new ApiError(
        "ADMIN_ROUTE_UNCLASSIFIED",
        "This Admin endpoint has not been classified for operator permissions.",
        403,
      ),
    );
    return;
  }
  const operator = res.locals.operator as OperatorAuthorization | undefined;
  if (!operator) {
    // Some legacy routers mount requireOperator themselves after this
    // centralized middleware. Authenticate here as well so policy evaluation
    // always sees the same authorization snapshot.
    requireOperator(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }
      adminPolicy(req, res, next);
    });
    return;
  }
  if (
    operator.role === "owner" ||
    policy.authenticatedOnly ||
    (!policy.ownerOnly &&
      policy.permission !== undefined &&
      !OWNER_ONLY_PERMISSION_KEYS.has(policy.permission) &&
      operator.effectivePermissions.includes(policy.permission))
  ) {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const permission = policy.permission;
      if (!permission) {
        next();
        return;
      }
      const action = `${req.method.toLowerCase()}.${permission.replace(/\./g, "_")}`;
      recordAdminMutationActivity(req, res, { permission, action });
    }
    next();
    return;
  }
  next(
    new ApiError(
      policy.ownerOnly ||
      (policy.permission !== undefined &&
        OWNER_ONLY_PERMISSION_KEYS.has(policy.permission))
        ? "OWNER_ACCESS_REQUIRED"
        : "PERMISSION_ACCESS_DENIED",
      policy.ownerOnly ||
      (policy.permission !== undefined &&
        OWNER_ONLY_PERMISSION_KEYS.has(policy.permission))
        ? "Owner access is required."
        : "The signed-in operator does not have permission for this action.",
      403,
    ),
  );
};

export const ADMIN_POLICY_MATCHERS = POLICY_MATCHERS;
