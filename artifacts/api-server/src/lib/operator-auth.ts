import { clerkClient, getAuth } from "@clerk/express";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Request, RequestHandler } from "express";
import {
  db,
  operatorAuditLogsTable,
  operatorsTable,
  teamRolesTable,
  type Operator,
} from "@workspace/db";
import { ApiError } from "./api-error";
import {
  OWNER_ONLY_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  isPermissionKey,
  type PermissionKey,
} from "./permissions";

export type OperatorRole = "owner" | "operator";

export type OperatorAuthorization = {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
  authVersion: number;
  effectivePermissions: PermissionKey[];
};

type OperatorAuthorizationTestAdapter = {
  getUserId: (req: Request) => string | null;
  getVerifiedEmail: (userId: string) => string | null | Promise<string | null>;
  /**
   * Narrow test-only seam for the trusted Clerk second-factor claim. Production
   * requests always read this from Clerk's verified session auth object.
   */
  getSecondFactorVerified?: (
    req: Request,
    userId: string,
  ) => boolean | Promise<boolean>;
};

let testAdapter: OperatorAuthorizationTestAdapter | undefined;

/**
 * Provides deterministic Clerk identities to the native API regression suite.
 * This can only be enabled by a process explicitly running in test mode.
 */
export function configureOperatorAuthorizationForTests(
  adapter: OperatorAuthorizationTestAdapter,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Operator authorization test adapters require NODE_ENV=test.");
  }
  testAdapter = adapter;
}

export function getOperatorActorUserId(req: Request): string | null {
  return process.env.NODE_ENV === "test" && testAdapter
    ? testAdapter.getUserId(req)
    : getAuth(req).userId;
}

export function parseOperatorEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isOperatorRole(role: string): role is OperatorRole {
  return role === "owner" || role === "operator";
}

function toAuthorization(
  operator: Operator,
  rolePermissions: readonly string[] = [],
): OperatorAuthorization | null {
  if (
    operator.status !== "active" ||
    !isOperatorRole(operator.role)
  ) {
    return null;
  }
  const effectivePermissions = operator.role === "owner"
    ? PERMISSION_CATALOG.map(({ key }) => key)
    : [
        ...new Set([
          ...rolePermissions.filter(isPermissionKey),
          ...operator.permissionAllows.filter(isPermissionKey),
        ]),
      ].filter(
        (key) =>
          !operator.permissionDenies.includes(key) &&
          !OWNER_ONLY_PERMISSION_KEYS.has(key),
      );

  return {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    role: operator.role,
    authVersion: operator.authVersion,
    effectivePermissions,
  };
}

async function toAuthorizationWithRole(
  operator: Operator,
): Promise<OperatorAuthorization | null> {
  if (operator.role === "owner" || !operator.customRoleId) {
    if (
      operator.role === "operator" &&
      !operator.customRoleId &&
      operator.legacyPermissionEligible
    ) {
      // Rows created by the pre-permission operator API (and direct legacy
      // imports) have no role reference. Invitation flows always set invitedBy
      // and therefore remain deny-by-default until an owner assigns access.
      const [legacyRole] = await db
        .select({ permissionKeys: teamRolesTable.permissionKeys })
        .from(teamRolesTable)
        .where(eq(teamRolesTable.normalizedName, "legacy-operator"))
        .limit(1);
      return toAuthorization(operator, legacyRole?.permissionKeys ?? []);
    }
    return toAuthorization(operator);
  }
  const [role] = await db
    .select({ permissionKeys: teamRolesTable.permissionKeys })
    .from(teamRolesTable)
    .where(eq(teamRolesTable.id, operator.customRoleId))
    .limit(1);
  return toAuthorization(operator, role?.permissionKeys ?? []);
}

export async function getOperatorAuthorizationForRecord(
  operator: Operator,
): Promise<OperatorAuthorization | null> {
  return toAuthorizationWithRole(operator);
}

async function getVerifiedEmail(userId: string): Promise<string | null> {
  if (process.env.NODE_ENV === "test" && testAdapter) {
    const email = await testAdapter.getVerifiedEmail(userId);
    return email ? email.trim().toLowerCase() : null;
  }
  const user = await clerkClient.users.getUser(userId);
  const email =
    user.emailAddresses.find(
      (candidate) =>
        candidate.id === user.primaryEmailAddressId &&
        candidate.verification?.status === "verified",
    ) ??
    user.emailAddresses.find(
    (candidate) =>
      candidate.verification?.status === "verified",
  );
  return email ? email.emailAddress.trim().toLowerCase() : null;
}

async function hasVerifiedSecondFactor(
  req: Request,
  userId: string,
): Promise<boolean> {
  if (process.env.NODE_ENV === "test" && testAdapter) {
    return testAdapter.getSecondFactorVerified
      ? testAdapter.getSecondFactorVerified(req, userId)
      : true;
  }

  // Clerk's factorVerificationAge is derived from the signed session claims.
  // The second tuple member is present only after Clerk has verified the
  // session's second factor. Pair it with Clerk's server-side TOTP enrollment
  // flag so a different factor can never satisfy this TOTP-only boundary.
  // No client-provided value is consulted here.
  const auth = getAuth(req);
  const factorVerificationAge = auth.factorVerificationAge;
  const secondFactorAge = factorVerificationAge?.[1];
  if (
    typeof secondFactorAge !== "number" ||
    !Number.isFinite(secondFactorAge) ||
    secondFactorAge < 0
  ) {
    return false;
  }
  const user = await clerkClient.users.getUser(userId);
  return user.totpEnabled === true;
}

async function recordMfaEnforcementDenied(
  req: Request,
  operator: OperatorAuthorization,
): Promise<void> {
  // Requests can fan out when an Admin screen loads. Keep this security event
  // useful without creating one row per rejected asset/query.
  const recentCutoff = new Date(Date.now() - 5 * 60 * 1000);
  await db.transaction(async (tx) => {
    // Serialize the check-and-insert for this operator so a burst of parallel
    // Admin requests still produces one bounded audit event.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${operator.id}, 20261001))`);
    const [recent] = await tx
      .select({ id: operatorAuditLogsTable.id })
      .from(operatorAuditLogsTable)
      .where(
        and(
          eq(operatorAuditLogsTable.action, "security.mfa_required"),
          eq(operatorAuditLogsTable.targetOperatorId, operator.id),
          gt(operatorAuditLogsTable.createdAt, recentCutoff),
        ),
      )
      .limit(1);
    if (recent) return;

    await tx.insert(operatorAuditLogsTable).values({
      action: "security.mfa_required",
      actorClerkUserId: getOperatorActorUserId(req),
      targetOperatorId: operator.id,
      targetEmail: operator.email,
      requestId: String(req.id),
      details: { reason: "totp_not_verified" },
    });
  });
}

async function bootstrapLegacyOwner(
  userId: string,
  email: string,
): Promise<Operator | undefined> {
  if (!parseOperatorEmails(process.env.OPERATOR_EMAILS).has(email)) {
    return undefined;
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026082409)`);
    const [existingOwner] = await tx
      .select({ id: operatorsTable.id })
      .from(operatorsTable)
      .where(eq(operatorsTable.role, "owner"))
      .limit(1);
    if (existingOwner) return undefined;

    const [created] = await tx
      .insert(operatorsTable)
      .values({
        email,
        clerkUserId: userId,
        role: "owner",
        status: "active",
        approvedBy: userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) return undefined;

    await tx.insert(operatorAuditLogsTable).values({
      action: "owner.bootstrapped",
      actorClerkUserId: userId,
      targetOperatorId: created.id,
      targetEmail: created.email,
    });
    return created;
  });
}

export async function getOperatorAuthorization(
  userId: string,
): Promise<OperatorAuthorization | null> {
  const [byUserId] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.clerkUserId, userId))
    .limit(1);
  if (byUserId) return toAuthorizationWithRole(byUserId);

  const email = await getVerifiedEmail(userId);
  if (!email) return null;
  const [byEmail] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.email, email))
    .limit(1);

  if (byEmail) {
    if (byEmail.status !== "active") return null;
    const previousClerkUserId = byEmail.clerkUserId;
    const nextAuthVersion = previousClerkUserId
      ? byEmail.authVersion + 1
      : byEmail.authVersion;
    const linked = await db.transaction(async (tx) => {
      const [operator] = await tx
        .update(operatorsTable)
        .set({
          clerkUserId: userId,
          authVersion: nextAuthVersion,
        })
        .where(
          and(
            eq(operatorsTable.id, byEmail.id),
            eq(operatorsTable.status, "active"),
            eq(operatorsTable.authVersion, byEmail.authVersion),
            previousClerkUserId
              ? eq(operatorsTable.clerkUserId, previousClerkUserId)
              : isNull(operatorsTable.clerkUserId),
          ),
        )
        .returning();
      if (operator) {
        await tx.insert(operatorAuditLogsTable).values({
          action: previousClerkUserId
            ? "operator.identity_relinked"
            : "operator.identity_linked",
          actorClerkUserId: userId,
          targetOperatorId: operator.id,
          targetEmail: operator.email,
        });
      }
      return operator;
    });
    return linked ? toAuthorizationWithRole(linked) : null;
  }

  const bootstrapped = await bootstrapLegacyOwner(userId, email);
  return bootstrapped ? toAuthorizationWithRole(bootstrapped) : null;
}

function requireRole(role: OperatorRole): RequestHandler {
  return async (req, res, next) => {
    const userId = getOperatorActorUserId(req);
    if (!userId) {
      next(
        new ApiError(
          "OPERATOR_AUTH_REQUIRED",
          "Operator authentication is required.",
          401,
        ),
      );
      return;
    }

    try {
      const operator = await getOperatorAuthorization(userId);
      if (operator && (role === "operator" || operator.role === "owner")) {
        if (!(await hasVerifiedSecondFactor(req, userId))) {
          await recordMfaEnforcementDenied(req, operator);
          next(
            new ApiError(
              "ADMIN_MFA_REQUIRED",
              "Authenticator verification is required before accessing the operations desk.",
              403,
            ),
          );
          return;
        }
        res.locals.operator = operator;
        next();
        return;
      }
    } catch (error) {
      req.log.error(
        { err: error, requiredRole: role },
        "Operator authorization service unavailable",
      );
      next(
        new ApiError(
          "OPERATOR_AUTH_UNAVAILABLE",
          "Operator authorization is temporarily unavailable.",
          503,
          true,
        ),
      );
      return;
    }

    next(
      new ApiError(
        role === "owner" ? "OWNER_ACCESS_REQUIRED" : "OPERATOR_ACCESS_DENIED",
        role === "owner" ? "Owner access is required." : "Operator access is denied.",
        403,
      ),
    );
  };
}

export const requireOperator = requireRole("operator");
export const requireOwner = requireRole("owner");

/**
 * Permission middleware is intentionally deny-by-default. Owner remains a
 * bypass for every catalog permission, while an operator must have the exact
 * granular key in their server-derived effective permission set.
 */
export function requirePermission(...permissions: PermissionKey[]): RequestHandler {
  if (permissions.length === 0) {
    throw new Error("requirePermission requires at least one permission key.");
  }
  return (req, res, next) => {
    requireOperator(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }
      const operator = res.locals.operator as OperatorAuthorization | undefined;
      if (
        operator?.role === "owner" ||
        (operator &&
          permissions.some((permission) =>
            operator.effectivePermissions.includes(permission),
          ))
      ) {
        next();
        return;
      }
      next(
        new ApiError(
          "PERMISSION_ACCESS_DENIED",
          "The signed-in operator does not have permission for this action.",
          403,
        ),
      );
    });
  };
}