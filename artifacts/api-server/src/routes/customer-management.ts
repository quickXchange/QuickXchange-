import { Router, type IRouter } from "express";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  ConfirmAdminCustomerEmailParams, ConfirmAdminCustomerEmailResponse,
  GetAdminCustomerParams, GetAdminCustomerResponse,
  GetAdminCustomerReferralsParams, GetAdminCustomerReferralsQueryParams, GetAdminCustomerReferralsResponse,
  RevokeAdminCustomerSessionsParams, RevokeAdminCustomerSessionsResponse,
  ResetAdminCustomerPasswordBody, ResetAdminCustomerPasswordParams, ResetAdminCustomerPasswordResponse,
  SuspendAdminCustomerParams, SuspendAdminCustomerResponse, ActivateAdminCustomerParams, ActivateAdminCustomerResponse,
  UpdateAdminCustomerBody, UpdateAdminCustomerParams, UpdateAdminCustomerResponse,
} from "@workspace/api-zod";
import {
  affiliateAccountsTable, affiliateCommissionsTable, affiliatePayoutRequestsTable,
  customerManagementAuditLogsTable, customerProfilesTable, customersTable, db, ordersTable,
} from "@workspace/db";
import { ApiError } from "../lib/api-error";
import { requireOperator, requireOwner } from "../lib/operator-auth";

const router: IRouter = Router();
type CustomerContext = { customer: typeof customersTable.$inferSelect; profile: typeof customerProfilesTable.$inferSelect | undefined; clerkUserId: string | null };
type CustomerManagementClerkTestAdapter = {
  getUser?: (id: string) => Promise<any>;
  updateUser?: (id: string, data: { password: string }) => Promise<void>;
  updateProfile?: (id: string, data: { firstName?: string; lastName?: string }) => Promise<void>;
  revokeAllSessions?: (id: string) => Promise<void>;
  banUser?: (id: string) => Promise<void>;
  unbanUser?: (id: string) => Promise<void>;
  verifyPrimaryEmail?: (id: string) => Promise<void>;
};
let clerkTestAdapter: CustomerManagementClerkTestAdapter | undefined;
/** Native API tests can exercise management actions without a networked Clerk client. */
export function configureCustomerManagementClerkForTests(adapter: CustomerManagementClerkTestAdapter) {
  if (process.env.NODE_ENV !== "test") throw new Error("Customer management Clerk adapters require NODE_ENV=test.");
  clerkTestAdapter = adapter;
}
export function customerProfileUpdatePayload(input: { firstName?: string; lastName?: string }) {
  return {
    ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
  };
}
export async function updateCustomerIdentityProfile(
  clerkUserId: string,
  input: { firstName?: string; lastName?: string },
): Promise<void> {
  const profile = customerProfileUpdatePayload(input);
  if (!Object.keys(profile).length) return;
  if (process.env.NODE_ENV === "test" && clerkTestAdapter) {
    if (!clerkTestAdapter.updateProfile) throw new ApiError("CLERK_PROFILE_UPDATE_UNSUPPORTED", "This Clerk client cannot update customer profiles.", 409);
    await clerkTestAdapter.updateProfile(clerkUserId, profile);
    return;
  }
  await (clerkClient as any).users.updateUser(clerkUserId, profile);
}

async function findCustomer(id: string): Promise<CustomerContext> {
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id)).limit(1);
  if (!customer) throw new ApiError("CUSTOMER_NOT_FOUND", "Customer not found.", 404);
  const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.customerId, id)).limit(1);
  if (profile?.clerkUserId) return { customer, profile, clerkUserId: profile.clerkUserId };
  const [order] = await db.select({ clerkUserId: ordersTable.customerClerkUserId }).from(ordersTable)
    .where(and(eq(ordersTable.customerEmail, customer.email), sql`${ordersTable.customerClerkUserId} is not null`))
    .orderBy(desc(ordersTable.createdAt)).limit(1);
  return { customer, profile, clerkUserId: order?.clerkUserId ?? null };
}
function clerkRequired(ctx: CustomerContext): string {
  if (!ctx.clerkUserId) throw new ApiError("CUSTOMER_CLERK_IDENTITY_REQUIRED", "This customer has no linked Clerk identity.", 409);
  return ctx.clerkUserId;
}
async function audit(operatorId: string, customerId: string, action: string, details: object = {}) {
  await db.insert(customerManagementAuditLogsTable).values({ actorOperatorId: operatorId, targetCustomerId: customerId, action, details });
}
async function clerkIdentity(userId: string | null) {
  if (!userId) return null;
  const user: any = process.env.NODE_ENV === "test" && clerkTestAdapter?.getUser
    ? await clerkTestAdapter.getUser(userId)
    : await (clerkClient as any).users.getUser(userId);
  const primary = user.emailAddresses?.find((email: any) => email.id === user.primaryEmailAddressId);
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    emailVerified: primary?.verification?.status === "verified",
  };
}
function volumeRows(rows: Array<{ asset: string; amount: string | null }>) {
  return rows.map((row) => ({ asset: row.asset, amount: row.amount ?? "0" }));
}
async function outputDetail(ctx: CustomerContext) {
  const clerkId = ctx.clerkUserId;
  const identity = clerkId ? await clerkIdentity(clerkId) : null;
  const orderWhere = clerkId ? eq(ordersTable.customerClerkUserId, clerkId) : eq(ordersTable.customerEmail, ctx.customer.email);
  const [totals] = await db.select({
    total: count(), done: sql<number>`count(*) filter (where lower(${ordersTable.status}) = 'completed')`,
  }).from(ordersTable).where(orderWhere);
  const [send, receive] = await Promise.all([
    db.select({ asset: ordersTable.fromAsset, amount: sql<string>`coalesce(sum(${ordersTable.amount}), 0)` }).from(ordersTable).where(orderWhere).groupBy(ordersTable.fromAsset),
    db.select({ asset: ordersTable.toAsset, amount: sql<string>`coalesce(sum(${ordersTable.receiveAmount}), 0)` }).from(ordersTable).where(orderWhere).groupBy(ordersTable.toAsset),
  ]);
  let affiliate: typeof affiliateAccountsTable.$inferSelect | undefined;
  if (clerkId) [affiliate] = await db.select().from(affiliateAccountsTable).where(eq(affiliateAccountsTable.customerClerkUserId, clerkId)).limit(1);
  const aggregateRows = affiliate ? await Promise.all([
    db.select({ value: sql<string>`coalesce(sum(${affiliateCommissionsTable.amountUsd}), 0)` }).from(affiliateCommissionsTable).where(eq(affiliateCommissionsTable.affiliateAccountId, affiliate.id)),
    db.select({ value: sql<string>`coalesce(sum(${affiliatePayoutRequestsTable.amountUsd}) filter (where ${affiliatePayoutRequestsTable.status} in ('requested','approved','processing','paid')), 0)` }).from(affiliatePayoutRequestsTable).where(eq(affiliatePayoutRequestsTable.affiliateAccountId, affiliate.id)),
    db.select({ value: count() }).from(affiliateAccountsTable).where(eq(affiliateAccountsTable.referrerAccountId, affiliate.id)),
    db.select({ value: sql<string | null>`sum(${affiliateCommissionsTable.volumeUsd}) filter (where ${affiliateCommissionsTable.kind} = 'commission')` }).from(affiliateCommissionsTable).where(eq(affiliateCommissionsTable.affiliateAccountId, affiliate.id)),
  ]) : [[{ value: "0" }], [{ value: "0" }], [{ value: 0 }], [{ value: null }]];
  const ledger = aggregateRows[0][0] as { value: string } | undefined;
  const payouts = aggregateRows[1][0] as { value: string } | undefined;
  const referralCount = aggregateRows[2][0] as { value: number } | undefined;
  const sales = aggregateRows[3][0] as { value: string | null } | undefined;
  const balance = decimalSubtract(ledger?.value ?? "0", payouts?.value ?? "0");
  return {
    id: ctx.customer.id, firstName: ctx.profile?.firstName || identity?.firstName || ctx.customer.name.split(" ")[0] || "", lastName: ctx.profile?.lastName || identity?.lastName || ctx.customer.name.split(" ").slice(1).join(" "),
    email: ctx.customer.email, country: ctx.profile?.country ?? "", role: ctx.profile?.role ?? "customer", accountStatus: ctx.customer.status === "suspended" ? "suspended" : "active",
    emailVerified: Boolean(identity?.emailVerified), createdAt: (ctx.profile?.createdAt ?? ctx.customer.lastActivity).toISOString(), lastActivity: ctx.customer.lastActivity.toISOString(),
    affiliateCode: affiliate?.code ?? null, referralRate: affiliate?.customReferralRate ?? null, totalOrders: Number(totals?.total ?? 0), doneOrders: Number(totals?.done ?? 0),
    balanceOwedUsd: balance, referredUsers: Number(referralCount?.value ?? 0), totalReferralProfitUsd: ledger?.value ?? "0", sendVolume: volumeRows(send), receiveVolume: volumeRows(receive),
    totalSalesUsd: sales?.value ?? null, refreshedAt: new Date().toISOString(),
  };
}

function decimalSubtract(left: string, right: string): string {
  const toUnits = (value: string) => {
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const units = BigInt(`${whole || "0"}${fraction.padEnd(18, "0").slice(0, 18)}`);
    return value.startsWith("-") ? -units : units;
  };
  const value = toUnits(left) - toUnits(right), negative = value < 0n, digits = (negative ? -value : value).toString().padStart(19, "0");
  const rendered = `${digits.slice(0, -18)}.${digits.slice(-18)}`.replace(/\.?0+$/, "") || "0";
  return negative && rendered !== "0" ? `-${rendered}` : rendered;
}

router.get("/admin/customers/:id", requireOperator, async (req, res, next) => { try {
  const params = GetAdminCustomerParams.parse(req.params); res.json(GetAdminCustomerResponse.parse(await outputDetail(await findCustomer(params.id))));
} catch (e) { next(e); } });

router.get("/admin/customers/:id/referrals", requireOperator, async (req, res, next) => { try {
  const params = GetAdminCustomerReferralsParams.parse(req.params), query = GetAdminCustomerReferralsQueryParams.parse(req.query), ctx = await findCustomer(params.id);
  const clerkId = ctx.clerkUserId;
  if (!clerkId) { res.json(GetAdminCustomerReferralsResponse.parse({ items: [], total: 0, page: query.page, pageSize: query.pageSize })); return; }
  const [account] = await db.select().from(affiliateAccountsTable).where(eq(affiliateAccountsTable.customerClerkUserId, clerkId)).limit(1);
  if (!account) { res.json(GetAdminCustomerReferralsResponse.parse({ items: [], total: 0, page: query.page, pageSize: query.pageSize })); return; }
  const offset = (query.page - 1) * query.pageSize;
  const [refs, [{ total }]] = await Promise.all([
    db.select().from(affiliateAccountsTable).where(eq(affiliateAccountsTable.referrerAccountId, account.id)).orderBy(desc(affiliateAccountsTable.createdAt)).limit(query.pageSize).offset(offset),
    db.select({ total: count() }).from(affiliateAccountsTable).where(eq(affiliateAccountsTable.referrerAccountId, account.id)),
  ]);
  const ids = refs.map(r => r.customerClerkUserId), profiles = ids.length ? await db.select().from(customerProfilesTable).where(inArray(customerProfilesTable.clerkUserId, ids)) : [];
  const byId = new Map(profiles.map(p => [p.clerkUserId, p]));
  const items = await Promise.all(refs.map(async ref => {
    const profile = byId.get(ref.customerClerkUserId), identity = profile ? null : await clerkIdentity(ref.customerClerkUserId); const [orders] = await db.select({ value: count() }).from(ordersTable).where(eq(ordersTable.customerClerkUserId, ref.customerClerkUserId));
    return { id: ref.customerClerkUserId, name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : `${identity?.firstName ?? ""} ${identity?.lastName ?? ""}`.trim(), country: profile?.country ?? "", ordersCount: Number(orders?.value ?? 0), registeredAt: ref.createdAt.toISOString() };
  }));
  res.json(GetAdminCustomerReferralsResponse.parse({ items, total: Number(total), page: query.page, pageSize: query.pageSize }));
} catch (e) { next(e); } });

router.patch("/admin/customers/:id", requireOwner, async (req, res, next) => { try {
  const params = UpdateAdminCustomerParams.parse(req.params), body = UpdateAdminCustomerBody.parse(req.body), ctx = await findCustomer(params.id), operator = res.locals.operator;
  const profileValues = { firstName: body.firstName, lastName: body.lastName, country: body.country, role: body.role };
  if (ctx.clerkUserId && (body.firstName !== undefined || body.lastName !== undefined)) {
    await updateCustomerIdentityProfile(ctx.clerkUserId, body);
  }
  let account: typeof affiliateAccountsTable.$inferSelect | undefined;
  if (body.referralCode !== undefined || body.referralRate !== undefined) {
    const clerkId = clerkRequired(ctx); [account] = await db.select().from(affiliateAccountsTable).where(eq(affiliateAccountsTable.customerClerkUserId, clerkId)).limit(1);
    if (!account) throw new ApiError("AFFILIATE_ACCOUNT_REQUIRED", "Customer has no affiliate account.", 409);
  }
  try {
    await db.transaction(async (tx) => {
      await tx.insert(customerProfilesTable).values({ customerId: ctx.customer.id, clerkUserId: ctx.clerkUserId, ...profileValues }).onConflictDoUpdate({ target: customerProfilesTable.customerId, set: profileValues });
      if (account) {
        await tx.update(affiliateAccountsTable).set({ ...(body.referralCode !== undefined ? { code: body.referralCode } : {}), ...(body.referralRate !== undefined ? { customReferralRate: body.referralRate } : {}) }).where(eq(affiliateAccountsTable.id, account.id));
      }
      await tx.insert(customerManagementAuditLogsTable).values({ actorOperatorId: operator.id, targetCustomerId: ctx.customer.id, action: "customer.updated", details: Object.fromEntries(Object.keys(body).map(k => [k, "updated"])) });
    });
  } catch (error) {
    if (body.referralCode !== undefined && (error as { code?: string }).code === "23505") {
      throw new ApiError("REFERRAL_CODE_CONFLICT", "That referral code is already in use.", 409);
    }
    throw error;
  }
  res.json(UpdateAdminCustomerResponse.parse(await outputDetail(await findCustomer(params.id))));
} catch (e) { next(e); } });

function ownerAction(path: string, paramSchema: any, bodySchema: any, responseSchema: any, action: string, handler: (id: string, body: any, ctx: CustomerContext) => Promise<string>) {
  router.post(path, requireOwner, async (req, res, next) => { try {
    const params = paramSchema.parse(req.params), body = bodySchema ? bodySchema.parse(req.body) : undefined, ctx = await findCustomer(params.id), status = await handler(clerkRequired(ctx), body, ctx);
    await db.transaction(async (tx) => {
      if (action === "suspend" || action === "activate") await tx.update(customersTable).set({ status }).where(eq(customersTable.id, ctx.customer.id));
      await tx.insert(customerManagementAuditLogsTable).values({ actorOperatorId: res.locals.operator.id, targetCustomerId: ctx.customer.id, action: `customer.${action}`, details: {} });
    });
    res.json(responseSchema.parse({ id: ctx.customer.id, action, accountStatus: status, refreshedAt: new Date().toISOString() }));
  } catch (e) { next(e); } });
}
async function revokeAllCustomerSessions(clerkUserId: string): Promise<void> {
  const usingTestAdapter = process.env.NODE_ENV === "test" && Boolean(clerkTestAdapter);
  const testRevokeAllSessions = usingTestAdapter ? clerkTestAdapter?.revokeAllSessions : undefined;
  const providerRevokeAllSessions = usingTestAdapter ? undefined : (clerkClient.users as any).revokeAllSessions;
  const revokeAllSessions = testRevokeAllSessions ?? providerRevokeAllSessions;
  if (typeof revokeAllSessions !== "function") {
    throw new ApiError(
      "CLERK_SESSION_REVOCATION_UNSUPPORTED",
      "This Clerk backend client cannot revoke customer sessions; no session state was changed.",
      409,
    );
  }
  try {
    if (usingTestAdapter) {
      await testRevokeAllSessions!(clerkUserId);
    } else {
      await providerRevokeAllSessions.call(clerkClient.users, clerkUserId);
    }
  } catch {
    throw new ApiError(
      "CLERK_SESSION_REVOCATION_FAILED",
      "Clerk did not complete customer session revocation; no audit event was recorded.",
      502,
      true,
      true,
    );
  }
}
ownerAction("/admin/customers/:id/password-reset", ResetAdminCustomerPasswordParams, ResetAdminCustomerPasswordBody, ResetAdminCustomerPasswordResponse, "password_reset", async (id, body) => {
  if (process.env.NODE_ENV === "test" && clerkTestAdapter) { await clerkTestAdapter.updateUser?.(id, { password: body.temporaryPassword }); await clerkTestAdapter.revokeAllSessions?.(id); return "active"; }
  const users: any = clerkClient.users; await users.updateUser(id, { password: body.temporaryPassword }); if (users.revokeAllSessions) await users.revokeAllSessions(id); return "active";
});
ownerAction("/admin/customers/:id/email-confirm", ConfirmAdminCustomerEmailParams, null, ConfirmAdminCustomerEmailResponse, "email_confirm", async (id) => {
  if (process.env.NODE_ENV === "test" && clerkTestAdapter) { await clerkTestAdapter.verifyPrimaryEmail?.(id); return "active"; }
  throw new ApiError("CLERK_EMAIL_VERIFICATION_INITIATION_UNSUPPORTED", "This Clerk backend client cannot initiate proof-of-control email verification; no verification state was changed.", 409);
});
ownerAction("/admin/customers/:id/sessions-revoke", RevokeAdminCustomerSessionsParams, null, RevokeAdminCustomerSessionsResponse, "sessions_revoked", async (id, _body, ctx) => {
  await revokeAllCustomerSessions(id);
  return ctx.customer.status === "suspended" ? "suspended" : "active";
});
ownerAction("/admin/customers/:id/suspend", SuspendAdminCustomerParams, null, SuspendAdminCustomerResponse, "suspend", async (id) => { if (process.env.NODE_ENV === "test" && clerkTestAdapter) { if (!clerkTestAdapter.banUser) throw new ApiError("CLERK_BAN_UNSUPPORTED", "This Clerk client cannot suspend users.", 409); await clerkTestAdapter.banUser(id); return "suspended"; } const users: any = clerkClient.users; if (!users.banUser) throw new ApiError("CLERK_BAN_UNSUPPORTED", "This Clerk client cannot suspend users.", 409); await users.banUser(id); return "suspended"; });
ownerAction("/admin/customers/:id/activate", ActivateAdminCustomerParams, null, ActivateAdminCustomerResponse, "activate", async (id) => { if (process.env.NODE_ENV === "test" && clerkTestAdapter) { if (!clerkTestAdapter.unbanUser) throw new ApiError("CLERK_UNBAN_UNSUPPORTED", "This Clerk client cannot activate users.", 409); await clerkTestAdapter.unbanUser(id); return "active"; } const users: any = clerkClient.users; if (!users.unbanUser) throw new ApiError("CLERK_UNBAN_UNSUPPORTED", "This Clerk client cannot activate users.", 409); await users.unbanUser(id); return "active"; });
export default router;