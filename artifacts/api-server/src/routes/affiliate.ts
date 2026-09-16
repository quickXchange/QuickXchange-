import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { BindAffiliateReferrerBody, CaptureAffiliateReferralParams, CreateAffiliateSettingsVersionBody, GetAffiliateAccountParams, GetAffiliateAccountQueryParams, GetAffiliateAccountsQueryParams, GetAffiliateCommissionsQueryParams, GetAffiliatePayoutHistoryQueryParams, GetAffiliatePayoutQueueQueryParams, GetAffiliateReferralsQueryParams, GetAffiliateValuationReviewParams, GetAffiliateValuationReviewsQueryParams, RequestAffiliatePayoutBody, ReviewAffiliateValuationBody, ReviewAffiliateValuationParams, SearchAffiliateCommissionsQueryParams, TransitionAffiliatePayoutBody, TransitionAffiliatePayoutParams } from "@workspace/api-zod";
import { affiliateAccountsTable, affiliateAuditLogsTable, affiliateCommissionsTable, affiliateCompletionEventsTable, affiliatePayoutRequestsTable, affiliateSettingsTable, affiliateValuationReviewsTable, db } from "@workspace/db";
import { AFFILIATE_PROGRAM_LOCK_ID, affiliateDashboard, bindAffiliateReferrer, consumeAffiliateAttribution, enabledAffiliateCaptureSettings, enabledAffiliatePayoutNetworks, ensureAffiliateAccount, findAffiliateByReferralCode, requestAffiliatePayout } from "../lib/affiliate-accounting";
import { ApiError } from "../lib/api-error";
import { requireCustomer } from "../lib/customer-auth";
import { requireOperator, requireOwner } from "../lib/operator-auth";
const router: IRouter = Router();
router.get("/affiliate/referral/:code", async (req, res) => {
  const { code } = CaptureAffiliateReferralParams.parse({ code: req.params.code });
  // Check program availability before code validity so a paused public route
  // cannot be used to enumerate affiliate identities.
  const settings = await enabledAffiliateCaptureSettings();
  if (!(await findAffiliateByReferralCode(code))) {
    throw new ApiError("REFERRAL_INVALID", "The referral code is invalid.", 404);
  }
  res.cookie("affiliate_referral", code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: settings.cookieDurationDays * 86400000 });
  res.status(204).end();
});
router.get("/account/affiliate", requireCustomer, async (req, res) => {
  const cookieCode = typeof req.cookies?.affiliate_referral === "string" ? req.cookies.affiliate_referral : undefined;
  if (cookieCode) {
    const attribution = await consumeAffiliateAttribution(res.locals.customerClerkUserId, cookieCode);
    req.log.info({ attributionStatus: attribution.status }, "Affiliate attribution cookie consumed by dashboard");
    if (["bound", "already_bound", "invalid"].includes(attribution.status)) {
      res.clearCookie("affiliate_referral", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    }
  }
  res.json(await affiliateDashboard(res.locals.customerClerkUserId));
});
router.post("/account/affiliate/bind", requireCustomer, async (req, res) => { const body = BindAffiliateReferrerBody.parse(req.body ?? {}); res.json(await bindAffiliateReferrer(res.locals.customerClerkUserId, body.code ?? String(req.cookies?.affiliate_referral ?? ""))); });
router.post("/account/affiliate/attribution", requireCustomer, async (req, res) => {
  const cookieCode = typeof req.cookies?.affiliate_referral === "string" ? req.cookies.affiliate_referral : undefined;
  const attribution = await consumeAffiliateAttribution(res.locals.customerClerkUserId, cookieCode);
  if (cookieCode && ["bound", "already_bound", "invalid"].includes(attribution.status)) {
    res.clearCookie("affiliate_referral", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
  req.log.info({ attributionStatus: attribution.status }, "Affiliate attribution checked after authentication");
  res.json(attribution);
});
router.get("/account/affiliate/commissions", requireCustomer, async (req, res) => {
  const q = GetAffiliateCommissionsQueryParams.parse(req.query);
  const account = await ensureAffiliateAccount(res.locals.customerClerkUserId);
  const rows = await db.select({
    id: affiliateCommissionsTable.id, aggregateType: affiliateCommissionsTable.aggregateType,
    aggregateId: affiliateCommissionsTable.aggregateId, kind: affiliateCommissionsTable.kind,
    amountUsd: affiliateCommissionsTable.amountUsd, volumeUsd: affiliateCommissionsTable.volumeUsd,
    rate: affiliateCommissionsTable.rate, settingsVersion: affiliateCommissionsTable.settingsVersion,
    createdAt: affiliateCommissionsTable.createdAt,
  }).from(affiliateCommissionsTable).where(eq(affiliateCommissionsTable.affiliateAccountId, account.id))
    .orderBy(desc(affiliateCommissionsTable.createdAt), desc(affiliateCommissionsTable.id))
    .limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  res.json(rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })));
});
router.get("/account/affiliate/payout-networks", requireCustomer, async (_req, res) => res.json(await enabledAffiliatePayoutNetworks()));
router.post("/account/affiliate/payouts", requireCustomer, async (req, res) => { const body = RequestAffiliatePayoutBody.parse(req.body); res.status(201).json(await requestAffiliatePayout(res.locals.customerClerkUserId, body.amountUsd, body.networkId, body.walletAddress)); });
router.get("/account/affiliate/referrals", requireCustomer, async (req, res) => {
  const q = GetAffiliateReferralsQueryParams.parse(req.query);
  const account = await ensureAffiliateAccount(res.locals.customerClerkUserId);
  const rows = await db.select({ id: affiliateAccountsTable.id, createdAt: affiliateAccountsTable.createdAt })
    .from(affiliateAccountsTable)
    .where(eq(affiliateAccountsTable.referrerAccountId, account.id))
    .orderBy(desc(affiliateAccountsTable.createdAt), desc(affiliateAccountsTable.id))
    .limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const active = rows.length
    ? await db.selectDistinct({ id: affiliateCommissionsTable.referredCustomerAccountId })
      .from(affiliateCommissionsTable)
      .where(and(
        eq(affiliateCommissionsTable.affiliateAccountId, account.id),
        eq(affiliateCommissionsTable.kind, "commission"),
        inArray(affiliateCommissionsTable.referredCustomerAccountId, rows.map(row => row.id)),
      ))
    : [];
  const ids = new Set(active.map(row => row.id));
  res.json(rows.map(row => ({
    joinedAt: row.createdAt.toISOString(),
    status: ids.has(row.id) ? "active" : "inactive",
  })));
});
router.get("/account/affiliate/payouts", requireCustomer, async (req, res) => { const q = GetAffiliatePayoutHistoryQueryParams.parse(req.query); const a = await ensureAffiliateAccount(res.locals.customerClerkUserId); res.json(await db.select().from(affiliatePayoutRequestsTable).where(eq(affiliatePayoutRequestsTable.affiliateAccountId, a.id)).orderBy(desc(affiliatePayoutRequestsTable.requestedAt), desc(affiliatePayoutRequestsTable.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize)); });
router.get("/admin/affiliate/settings", requireOperator, async (_req, res) => res.json((await db.select().from(affiliateSettingsTable).orderBy(desc(affiliateSettingsTable.version)).limit(1))[0] ?? null));
router.post("/admin/affiliate/settings", requireOwner, async (req, res) => { const body = CreateAffiliateSettingsVersionBody.parse(req.body); const created = await db.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(${AFFILIATE_PROGRAM_LOCK_ID})`); const [latest] = await tx.select().from(affiliateSettingsTable).orderBy(desc(affiliateSettingsTable.version)).limit(1); const [next] = await tx.insert(affiliateSettingsTable).values({ ...body, version: (latest?.version ?? 0) + 1, createdBy: res.locals.operator.id }).returning(); await tx.insert(affiliateAuditLogsTable).values({ action: "settings.version_created", actorType: "operator", actorId: res.locals.operator.id, targetId: next.id, details: { version: next.version } }); return next; }); res.status(201).json(created); });
router.get("/admin/affiliate/payouts", requireOperator, async (req, res) => { const q = GetAffiliatePayoutQueueQueryParams.parse(req.query); res.json(await db.select().from(affiliatePayoutRequestsTable).orderBy(desc(affiliatePayoutRequestsTable.requestedAt), desc(affiliatePayoutRequestsTable.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize)); });
router.patch("/admin/affiliate/payouts/:id", requireOperator, async (req, res) => { const { id } = TransitionAffiliatePayoutParams.parse({ id: req.params.id }); const { status, txid } = TransitionAffiliatePayoutBody.parse(req.body); if (status === "paid" && !txid?.trim()) throw new ApiError("PAYOUT_TXID_REQUIRED", "A transaction hash / TXID is required to mark a payout as paid.", 400); const row = await db.transaction(async tx => { const from = status === "approved" || status === "rejected" ? "requested" : status === "processing" ? "approved" : "processing"; const [next] = await tx.update(affiliatePayoutRequestsTable).set({ status, ...(status === "approved" || status === "rejected" ? { decidedBy: res.locals.operator.id, decidedAt: new Date() } : {}), ...(status === "paid" ? { paidAt: new Date(), txid: txid!.trim() } : {}) }).where(and(eq(affiliatePayoutRequestsTable.id, id), eq(affiliatePayoutRequestsTable.status, from))).returning(); if (!next) return undefined; await tx.insert(affiliateAuditLogsTable).values({ action: `payout.${status}`, actorType: "operator", actorId: res.locals.operator.id, targetId: next.id }); return next; }); if (!row) throw new ApiError("PAYOUT_STATE_CONFLICT", "Payout transition is not permitted.", 409); res.json(row); });
router.get("/admin/affiliate/overview", requireOperator, async (_req, res) => {
  const commissionUsd = sql<string>`(select coalesce(sum(c.amount_usd), 0)::text from affiliate_commissions c where c.affiliate_account_id = ${affiliateAccountsTable.id})`;
  const referredUsers = sql<number>`(select count(*)::int from affiliate_accounts r where r.referrer_account_id = ${affiliateAccountsTable.id})`;
  const [
    [ledger],
    [accounts],
    [active],
    [reserved],
    [paid],
    [reviews],
    growth,
    topAffiliates,
  ] = await Promise.all([
    db.select({ amount: sql<string>`coalesce(sum(${affiliateCommissionsTable.amountUsd}),0)`, volume: sql<string>`coalesce(sum(case when ${affiliateCommissionsTable.kind} = 'commission' then ${affiliateCommissionsTable.volumeUsd} else 0 end),0)`, count: sql<number>`count(*)` }).from(affiliateCommissionsTable),
    db.select({ count: sql<number>`count(*)` }).from(affiliateAccountsTable),
    db.select({ count: sql<number>`count(distinct ${affiliateCommissionsTable.affiliateAccountId})` }).from(affiliateCommissionsTable).where(eq(affiliateCommissionsTable.kind, "commission")),
    db.select({ amount: sql<string>`coalesce(sum(${affiliatePayoutRequestsTable.amountUsd}),0)` }).from(affiliatePayoutRequestsTable).where(sql`${affiliatePayoutRequestsTable.status} in ('requested','approved','processing')`),
    db.select({ amount: sql<string>`coalesce(sum(${affiliatePayoutRequestsTable.amountUsd}),0)` }).from(affiliatePayoutRequestsTable).where(eq(affiliatePayoutRequestsTable.status, "paid")),
    db.select({ count: sql<number>`count(*)` }).from(affiliateValuationReviewsTable).where(eq(affiliateValuationReviewsTable.state, "pending")),
    db.select({
      date: sql<string>`to_char(date_trunc('day', ${affiliateAccountsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    }).from(affiliateAccountsTable)
      .where(sql`${affiliateAccountsTable.createdAt} >= now() - interval '89 days'`)
      .groupBy(sql`date_trunc('day', ${affiliateAccountsTable.createdAt} at time zone 'UTC')`)
      .orderBy(sql`date_trunc('day', ${affiliateAccountsTable.createdAt} at time zone 'UTC')`),
    db.select({
      id: affiliateAccountsTable.id,
      code: affiliateAccountsTable.code,
      commissionUsd,
      referredUsers,
    }).from(affiliateAccountsTable).orderBy(desc(commissionUsd), desc(referredUsers)).limit(5),
  ]);
  res.json({
    affiliateCount: Number(accounts.count),
    activeAffiliates: Number(active.count),
    ledgerEntries: Number(ledger.count),
    totalEarnedUsd: ledger.amount,
    netCommissionUsd: ledger.amount,
    referredVolumeUsd: ledger.volume,
    paidUsd: paid.amount,
    pendingReservationsUsd: reserved.amount,
    reservedPayoutUsd: reserved.amount,
    pendingReviews: Number(reviews.count),
    growth: growth.map(point => ({ ...point, count: Number(point.count) })),
    topAffiliates: topAffiliates.map(account => ({ ...account, referredUsers: Number(account.referredUsers) })),
  });
});
router.get("/admin/affiliate/accounts", requireOperator, async (req, res) => {
  const q = GetAffiliateAccountsQueryParams.parse(req.query);
  const where = and(
    q.search ? ilike(affiliateAccountsTable.code, `%${q.search}%`) : undefined,
    q.status === "bound" ? isNotNull(affiliateAccountsTable.referrerBoundAt) : q.status === "unbound" ? isNull(affiliateAccountsTable.referrerBoundAt) : undefined,
  );
  const commissionUsd = sql<string>`(select coalesce(sum(c.amount_usd), 0)::text from affiliate_commissions c where c.affiliate_account_id = ${affiliateAccountsTable.id})`;
  const referredUsers = sql<number>`(select count(*)::int from affiliate_accounts r where r.referrer_account_id = ${affiliateAccountsTable.id})`;
  const [rows, [total]] = await Promise.all([
    db.select({
      id: affiliateAccountsTable.id,
      code: affiliateAccountsTable.code,
      createdAt: affiliateAccountsTable.createdAt,
      referrerBoundAt: affiliateAccountsTable.referrerBoundAt,
      referredUsers,
      commissionUsd,
    }).from(affiliateAccountsTable).where(where).orderBy(desc(affiliateAccountsTable.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(affiliateAccountsTable).where(where),
  ]);
  res.json({
    items: rows.map(account => ({
      ...account,
      status: account.referrerBoundAt ? "bound" : "unbound",
      referredUsers: Number(account.referredUsers),
    })),
    page: q.page,
    pageSize: q.pageSize,
    total: Number(total.count),
  });
});
router.get("/admin/affiliate/accounts/:id", requireOperator, async (req, res) => { const { id } = GetAffiliateAccountParams.parse({ id: req.params.id }); const q = GetAffiliateAccountQueryParams.parse(req.query); const [account] = await db.select().from(affiliateAccountsTable).where(eq(affiliateAccountsTable.id, id)).limit(1); if (!account) throw new ApiError("AFFILIATE_NOT_FOUND", "Affiliate account not found.", 404); const commissions = await db.select().from(affiliateCommissionsTable).where(eq(affiliateCommissionsTable.affiliateAccountId, id)).orderBy(desc(affiliateCommissionsTable.createdAt), desc(affiliateCommissionsTable.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize); const { customerClerkUserId, ...safe } = account; res.json({ ...safe, commissions }); });
router.get("/admin/affiliate/commissions", requireOperator, async (req, res) => { const q = SearchAffiliateCommissionsQueryParams.parse(req.query); const conditions = [q.affiliateAccountId ? eq(affiliateCommissionsTable.affiliateAccountId, q.affiliateAccountId) : undefined, q.aggregateType ? eq(affiliateCommissionsTable.aggregateType, q.aggregateType) : undefined, q.kind ? eq(affiliateCommissionsTable.kind, q.kind) : undefined]; res.json(await db.select().from(affiliateCommissionsTable).where(and(...conditions)).orderBy(desc(affiliateCommissionsTable.createdAt), desc(affiliateCommissionsTable.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize)); });
router.get("/admin/affiliate/valuation-reviews", requireOperator, async (req, res) => { const q = GetAffiliateValuationReviewsQueryParams.parse(req.query); res.json(await db.select().from(affiliateValuationReviewsTable).where(q.state ? eq(affiliateValuationReviewsTable.state, q.state) : undefined).orderBy(desc(affiliateValuationReviewsTable.createdAt), desc(affiliateValuationReviewsTable.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize)); });
router.get("/admin/affiliate/valuation-reviews/:id", requireOperator, async (req, res) => { const { id } = GetAffiliateValuationReviewParams.parse({ id: req.params.id }); const [review] = await db.select().from(affiliateValuationReviewsTable).where(eq(affiliateValuationReviewsTable.id, id)).limit(1); if (!review) throw new ApiError("VALUATION_REVIEW_NOT_FOUND", "Valuation review not found.", 404); res.json(review); });
router.patch("/admin/affiliate/valuation-reviews/:id", requireOwner, async (req, res) => {
  const { id } = ReviewAffiliateValuationParams.parse({ id: req.params.id });
  const body = ReviewAffiliateValuationBody.parse(req.body);
  if (body.state === "approved" && !body.usd) {
    throw new ApiError("VALIDATION_ERROR", "An approved valuation requires an exact USD amount.", 400);
  }
  const review = await db.transaction(async tx => {
    const [pending] = await tx.select().from(affiliateValuationReviewsTable)
      .where(and(eq(affiliateValuationReviewsTable.id, id), eq(affiliateValuationReviewsTable.state, "pending")))
      .limit(1);
    if (!pending) return undefined;
    if (body.state === "approved") {
      const [event] = await tx.select().from(affiliateCompletionEventsTable)
        .where(eq(affiliateCompletionEventsTable.id, pending.completionEventId)).limit(1);
      if (!event) throw new ApiError("COMPLETION_EVENT_NOT_FOUND", "The completion event is unavailable.", 409);
      await tx.update(affiliateCompletionEventsTable).set({
        status: "pending",
        payload: {
          ...(event.payload as object),
          valuation: {
            usd: body.usd!,
            provenance: { source: "operator-reviewed", reviewId: pending.id, note: body.note ?? "" },
          },
        },
      }).where(eq(affiliateCompletionEventsTable.id, event.id));
    }
    const [updated] = await tx.update(affiliateValuationReviewsTable).set({
      state: body.state, reviewedBy: res.locals.operator.id, reviewedAt: new Date(),
    }).where(and(eq(affiliateValuationReviewsTable.id, id), eq(affiliateValuationReviewsTable.state, "pending"))).returning();
    if (!updated) throw new ApiError("VALUATION_REVIEW_CONFLICT", "The valuation review is unavailable.", 409);
    await tx.insert(affiliateAuditLogsTable).values({
      action: `valuation.${body.state}`, actorType: "operator", actorId: res.locals.operator.id,
      targetId: updated.id, details: { note: body.note ?? "" },
    });
    return updated;
  });
  res.json(review);
});
export default router;