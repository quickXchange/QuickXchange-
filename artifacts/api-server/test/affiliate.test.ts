import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { inArray } from "drizzle-orm";
import test, { after, before } from "node:test";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";
import {
  BindAffiliateReferrerBody,
  CaptureAffiliateReferralParams,
  CreateAffiliateSettingsVersionBody,
  GetAffiliateCommissionsQueryParams,
  GetAffiliatePayoutHistoryQueryParams,
  GetAffiliatePayoutQueueQueryParams,
  GetAffiliateReferralsQueryParams,
  GetAffiliateValuationReviewsQueryParams,
  RequestAffiliatePayoutBody,
  SearchAffiliateCommissionsQueryParams,
  ReviewAffiliateValuationBody,
  TransitionAffiliatePayoutBody,
  UpdateAdminCustomerBody,
} from "@workspace/api-zod";
import { calculateAffiliateBalance, calculateAffiliateCommission, completionEligible, completionSnapshotEligible, immutableReferrerDecision, payoutTransitionAllowed, publicReferralCode } from "../src/lib/affiliate-accounting";
import { isQuickexReconciliationCandidate } from "../src/lib/quickex-order-service";

let apiUrl = "";
let closeApi: () => Promise<void>;
let database: typeof import("@workspace/db");
const affiliateAccountIds = new Set<string>();
const affiliateCompletionEventIds = new Set<string>();
const verifiedEmails = new Map<string, string>();
const privilegedTestPool = createPrivilegedTestPool();

function testHeaders(userId?: string): Record<string, string> {
  return userId ? { "x-test-clerk-user-id": userId } : {};
}

async function request(path: string, userId?: string): Promise<{
  status: number;
  body: unknown;
}> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: testHeaders(userId),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as unknown : undefined,
  };
}

async function seedAffiliateAccount(
  customerClerkUserId: string,
  input: Partial<{
    referrerAccountId: string;
    createdAt: Date;
  }> = {},
) {
  const [account] = await database.db.insert(database.affiliateAccountsTable)
    .values({
      customerClerkUserId,
      code: randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(),
      ...input,
    })
    .returning();
  affiliateAccountIds.add(account.id);
  return account;
}

async function seedCommission(
  affiliateAccountId: string,
  createdAt: Date,
  sequence: number,
  referredCustomerAccountId?: string,
) {
  const [event] = await database.db.insert(database.affiliateCompletionEventsTable)
    .values({
      aggregateType: "manual_order",
      aggregateId: `pagination-${randomUUID()}`,
      completionVersion: 1,
      payload: {},
      createdAt,
    })
    .returning();
  affiliateCompletionEventIds.add(event.id);
  const [commission] = await database.db.insert(database.affiliateCommissionsTable)
    .values({
      affiliateAccountId,
      referredCustomerAccountId,
      completionEventId: event.id,
      aggregateType: "manual_order",
      aggregateId: event.aggregateId,
      amountUsd: String(sequence),
      volumeUsd: "100",
      rate: "0.01",
      settingsVersion: 1,
      valuation: {},
      createdAt,
    })
    .returning();
  return commission;
}

async function startApi(): Promise<{ url: string; close: () => Promise<void> }> {
  const { default: app } = await import("../src/app");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function cleanupAffiliatePaginationFixtures(): Promise<void> {
  const client = await privilegedTestPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE affiliate_commissions DISABLE TRIGGER USER");
    await client.query(`
      delete from affiliate_payout_requests
      where affiliate_account_id in (
        select id from affiliate_accounts
        where customer_clerk_user_id like 'affiliate-customer-%'
          or customer_clerk_user_id like 'admin-history-account-%'
      )
    `);
    await client.query(`
      delete from affiliate_commissions
      where completion_event_id in (
        select id from affiliate_completion_events
        where aggregate_id like 'pagination-%'
      )
    `);
    await client.query(`
      delete from affiliate_accounts
      where customer_clerk_user_id like 'affiliate-customer-%'
        or customer_clerk_user_id like 'referred-customer-%'
        or customer_clerk_user_id like 'admin-history-account-%'
    `);
    await client.query(`
      delete from affiliate_completion_events
      where aggregate_id like 'pagination-%'
    `);
    await client.query("ALTER TABLE affiliate_commissions ENABLE TRIGGER USER");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.SESSION_SECRET = "affiliate-pagination-test-secret";
  database = await import("@workspace/db");
  await cleanupAffiliatePaginationFixtures();
  const operatorAuth = await import("../src/lib/operator-auth");
  const customerAuth = await import("../src/lib/customer-auth");
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: (userId) => verifiedEmails.get(userId) ?? null,
  });
  customerAuth.configureCustomerAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  apiUrl = api.url;
  closeApi = api.close;
});

after(async () => {
  if (closeApi) await closeApi();
  await cleanupAffiliatePaginationFixtures();
  await privilegedTestPool.end();
});

test("affiliate codes and binding inputs reject malformed or absent attribution", () => {
  assert.equal(CaptureAffiliateReferralParams.safeParse({ code: "ABCDEFGH" }).success, true);
  assert.equal(CaptureAffiliateReferralParams.safeParse({ code: "ABCDEFGHJKLM" }).success, true);
  assert.equal(CaptureAffiliateReferralParams.safeParse({ code: "ABCDEFG" }).success, false);
  assert.equal(CaptureAffiliateReferralParams.safeParse({ code: "guessable" }).success, false);
  assert.equal(BindAffiliateReferrerBody.safeParse({ code: "ABCD2345" }).success, true);
  assert.equal(BindAffiliateReferrerBody.safeParse({ code: "BAD" }).success, false);
  assert.equal(BindAffiliateReferrerBody.safeParse({ code: "ABCD01OI" }).success, false);
  assert.equal(UpdateAdminCustomerBody.safeParse({ referralCode: "ABCD2345" }).success, true);
  assert.equal(UpdateAdminCustomerBody.safeParse({ referralCode: "ABCD2345JKLM" }).success, true);
  assert.equal(UpdateAdminCustomerBody.safeParse({ referralCode: "SHORT" }).success, false);
  assert.equal(UpdateAdminCustomerBody.safeParse({ referralCode: "ABCD01OI" }).success, false);
  assert.equal(publicReferralCode("ABCDEFGHJKLM"), "EFGHJKLM");
  assert.equal(publicReferralCode("ABCD2345"), "ABCD2345");
});
test("settings and payout contracts preserve canonical decimal values", () => {
  assert.equal(CreateAffiliateSettingsVersionBody.safeParse({ enabled: true, quickexEnabled: true, manualEnabled: true, commissionRate: "0.125", minimumEligibleUsd: "10", payoutMinimumUsd: "25", cookieDurationDays: 30 }).success, true);
  assert.equal(RequestAffiliatePayoutBody.safeParse({ amountUsd: "10.000000000000000001", networkId: "usdt-trc20", walletAddress: "TMockAffiliateWalletAddress" }).success, true);
  assert.equal(RequestAffiliatePayoutBody.safeParse({ amountUsd: "10", destination: { asset: "USDC" } }).success, false);
  assert.equal(RequestAffiliatePayoutBody.safeParse({ amountUsd: "1e3", networkId: "usdt-trc20", walletAddress: "TMockAffiliateWalletAddress" }).success, false);
  assert.equal(TransitionAffiliatePayoutBody.safeParse({ status: "paid", txid: "0xmock-transaction-hash" }).success, true);
  assert.equal(ReviewAffiliateValuationBody.safeParse({ state: "approved", usd: "1.25" }).success, true);
});
test("affiliate history contracts default to bounded pages and reject oversized pages", () => {
  for (const schema of [
    GetAffiliateCommissionsQueryParams,
    GetAffiliatePayoutHistoryQueryParams,
    GetAffiliatePayoutQueueQueryParams,
    GetAffiliateReferralsQueryParams,
    GetAffiliateValuationReviewsQueryParams,
    SearchAffiliateCommissionsQueryParams,
  ]) {
    assert.deepEqual(schema.parse({}), { page: 1, pageSize: 25 });
    assert.equal(schema.safeParse({ page: 0 }).success, false);
    assert.equal(schema.safeParse({ pageSize: 101 }).success, false);
  }
});
test("customer affiliate histories apply stable ordering, limit, offset, validation, and authorization", async () => {
  const customerId = `affiliate-customer-${randomUUID()}`;
  const account = await seedAffiliateAccount(customerId);
  const joinedAt = [
    new Date("2026-09-01T12:00:00.000Z"),
    new Date("2026-09-02T12:00:00.000Z"),
    new Date("2026-09-03T12:00:00.000Z"),
  ];
  const referrals = [];
  for (let index = 0; index < joinedAt.length; index += 1) {
    referrals.push(await seedAffiliateAccount(
      `referred-customer-${randomUUID()}`,
      { referrerAccountId: account.id, createdAt: joinedAt[index] },
    ));
  }
  const commissions = [];
  const payouts = [];
  for (let index = 0; index < joinedAt.length; index += 1) {
    commissions.push(await seedCommission(account.id, joinedAt[index], index + 1, referrals[index].id));
    const [payout] = await database.db.insert(database.affiliatePayoutRequestsTable)
      .values({
        affiliateAccountId: account.id,
        amountUsd: String(index + 10),
        destination: { networkId: "usdt-trc20", walletAddress: `wallet-${index}` },
        requestedAt: joinedAt[index],
      })
      .returning();
    payouts.push(payout);
  }

  for (const path of [
    "/account/affiliate/commissions?page=2&pageSize=2",
    "/account/affiliate/referrals?page=2&pageSize=2",
    "/account/affiliate/payouts?page=2&pageSize=2",
  ]) {
    assert.equal((await request(path)).status, 401);
  }

  const commissionPage = await request(
    "/account/affiliate/commissions?page=2&pageSize=2",
    customerId,
  );
  assert.equal(commissionPage.status, 200);
  assert.deepEqual(
    (commissionPage.body as Array<{ id: string }>).map((row) => row.id),
    [commissions[0].id],
  );

  const referralPage = await request(
    "/account/affiliate/referrals?page=2&pageSize=2",
    customerId,
  );
  assert.equal(referralPage.status, 200);
  assert.deepEqual(referralPage.body, [{
    joinedAt: joinedAt[0].toISOString(),
    status: "active",
  }]);

  const payoutPage = await request(
    "/account/affiliate/payouts?page=2&pageSize=2",
    customerId,
  );
  assert.equal(payoutPage.status, 200);
  assert.deepEqual(
    (payoutPage.body as Array<{ id: string }>).map((row) => row.id),
    [payouts[0].id],
  );

  for (const path of [
    "/account/affiliate/commissions?page=0",
    "/account/affiliate/referrals?pageSize=101",
    "/account/affiliate/payouts?page=not-a-number",
  ]) {
    assert.equal((await request(path, customerId)).status, 400);
  }
});

test("Admin affiliate histories apply stable ordering, limit, offset, validation, and authorization", async () => {
  const operatorUserId = `affiliate-operator-${randomUUID()}`;
  const operatorEmail = `${randomUUID()}@example.test`;
  const [operator] = await database.db.insert(database.operatorsTable).values({
    email: operatorEmail,
    clerkUserId: operatorUserId,
    role: "owner",
    status: "active",
  }).returning();
  verifiedEmails.set(operatorUserId, operatorEmail);
  const account = await seedAffiliateAccount(`admin-history-account-${randomUUID()}`);
  const timestamps = [
    new Date("9999-12-28T12:00:00.000Z"),
    new Date("9999-12-29T12:00:00.000Z"),
    new Date("9999-12-30T12:00:00.000Z"),
    new Date("9999-12-31T12:00:00.000Z"),
  ];
  const commissions = [];
  const payouts = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    commissions.push(await seedCommission(account.id, timestamps[index], index + 20));
    const [payout] = await database.db.insert(database.affiliatePayoutRequestsTable)
      .values({
        affiliateAccountId: account.id,
        amountUsd: String(index + 20),
        destination: { networkId: "usdt-trc20", walletAddress: `admin-wallet-${index}` },
        requestedAt: timestamps[index],
      })
      .returning();
    payouts.push(payout);
  }

  try {
    for (const path of [
      `/admin/affiliate/commissions?affiliateAccountId=${account.id}&page=2&pageSize=2`,
      `/admin/affiliate/accounts/${account.id}?page=2&pageSize=2`,
      "/admin/affiliate/payouts?page=2&pageSize=2",
    ]) {
      assert.equal((await request(path)).status, 401);
      assert.notEqual((await request(path, account.customerClerkUserId)).status, 200);
    }

    const commissionsPage = await request(
      `/admin/affiliate/commissions?affiliateAccountId=${account.id}&page=2&pageSize=2`,
      operatorUserId,
    );
    assert.equal(commissionsPage.status, 200);
    assert.deepEqual(
      (commissionsPage.body as Array<{ id: string }>).map((row) => row.id),
      [commissions[1].id, commissions[0].id],
    );

    const accountPage = await request(
      `/admin/affiliate/accounts/${account.id}?page=2&pageSize=2`,
      operatorUserId,
    );
    assert.equal(accountPage.status, 200);
    assert.deepEqual(
      ((accountPage.body as { commissions: Array<{ id: string }> }).commissions).map((row) => row.id),
      [commissions[1].id, commissions[0].id],
    );

    const payoutsPage = await request(
      "/admin/affiliate/payouts?page=2&pageSize=2",
      operatorUserId,
    );
    assert.equal(payoutsPage.status, 200);
    assert.deepEqual(
      (payoutsPage.body as Array<{ id: string }>).map((row) => row.id),
      [payouts[1].id, payouts[0].id],
    );

    for (const path of [
      "/admin/affiliate/commissions?page=0",
      `/admin/affiliate/accounts/${account.id}?pageSize=101`,
      "/admin/affiliate/payouts?page=bad",
    ]) {
      assert.equal((await request(path, operatorUserId)).status, 400);
    }
  } finally {
    await database.db.delete(database.operatorsTable)
      .where(inArray(database.operatorsTable.id, [operator.id]));
  }
});
test("commission math is exact, cap-safe, and never uses JS floating point", () => {
  assert.equal(calculateAffiliateCommission("100000000000000000000.00000001", "0.000000000000000001"), "100");
  assert.equal(calculateAffiliateCommission("10", "0.333333333333333333"), "3.33333333333333333");
  assert.equal(calculateAffiliateCommission("100", "0.5", "12.5"), "12.5");
});
test("state contracts allow only reviewed and payout terminal transitions", () => {
  assert.equal(ReviewAffiliateValuationBody.safeParse({ state: "rejected" }).success, true);
  assert.equal(ReviewAffiliateValuationBody.safeParse({ state: "pending" }).success, false);
  assert.equal(TransitionAffiliatePayoutBody.safeParse({ status: "auto-send" }).success, false);
});
test("pure binding, completion, payout transitions and balances preserve accounting invariants", () => {
  assert.equal(immutableReferrerDecision(null, "a"), "bind");
  assert.equal(immutableReferrerDecision("a", "a"), "bind");
  assert.equal(immutableReferrerDecision("a", "b"), "conflict");
  assert.equal(completionEligible("completed"), true);
  assert.equal(completionEligible("completed", true), false);
  assert.equal(completionEligible("refunded"), false);
  assert.equal(completionSnapshotEligible({ referrerAccountId: "affiliate", settings: { enabled: true, aggregateEnabled: true } }), true);
  assert.equal(completionSnapshotEligible({ referrerAccountId: "affiliate", settings: { enabled: false, aggregateEnabled: true } }), false);
  assert.equal(payoutTransitionAllowed("requested", "approved"), true);
  assert.equal(payoutTransitionAllowed("approved", "paid"), false);
  assert.deepEqual(calculateAffiliateBalance({ netLedgerUsd: "10", reservedUsd: "3", paidUsd: "2" }), { availableUsd: "5", overdrawn: false });
  assert.deepEqual(calculateAffiliateBalance({ netLedgerUsd: "1", reservedUsd: "2", paidUsd: "0" }), { availableUsd: "0", overdrawn: true });
  assert.deepEqual(calculateAffiliateBalance({ netLedgerUsd: "10", reservedUsd: "0", paidUsd: "10" }), { availableUsd: "0", overdrawn: false });
});

test("QuickEx reconciliation retains recent completions for reversals and stops final states", () => {
  const now = Date.UTC(2026, 7, 30);
  assert.equal(isQuickexReconciliationCandidate("awaiting_deposit", new Date(now), now), true);
  assert.equal(isQuickexReconciliationCandidate("expired", new Date(now), now), false);
  assert.equal(isQuickexReconciliationCandidate("refunded", new Date(now), now), false);
  assert.equal(isQuickexReconciliationCandidate("completed", new Date(now - 29 * 86_400_000), now), true);
  assert.equal(isQuickexReconciliationCandidate("completed", new Date(now - 31 * 86_400_000), now), false);
});