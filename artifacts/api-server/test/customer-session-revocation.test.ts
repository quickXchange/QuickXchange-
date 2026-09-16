import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { eq, inArray } from "drizzle-orm";

const createdCustomerIds = new Set<string>();
const createdOperatorIds = new Set<string>();
const verifiedEmails = new Map<string, string>();
let apiUrl = "";
let closeApi: () => Promise<void>;
let database: typeof import("@workspace/db");
let operatorAuth: typeof import("../src/lib/operator-auth");
let customerManagement: typeof import("../src/routes/customer-management");
let revokeMode: "success" | "failure" = "success";
let revokedUserIds: string[] = [];

function testHeaders(userId: string): Record<string, string> {
  return { "x-test-clerk-user-id": userId };
}

async function request(
  path: string,
  userId: string,
): Promise<{ status: number; body: Record<string, unknown> | undefined }> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: testHeaders(userId),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as Record<string, unknown> : undefined,
  };
}

async function seedOperator(role: "owner" | "operator"): Promise<{ id: string; clerkUserId: string }> {
  const clerkUserId = `${role}_${randomUUID()}`;
  const [operator] = await database.db.insert(database.operatorsTable).values({
    email: `${clerkUserId}@example.test`,
    clerkUserId,
    role,
    status: "active",
  }).returning();
  createdOperatorIds.add(operator.id);
  return { id: operator.id, clerkUserId };
}

async function seedCustomer(clerkUserId: string | null): Promise<{ id: string; email: string; clerkUserId: string | null }> {
  const id = `customer_${randomUUID()}`;
  const email = `${id}@example.test`;
  await database.db.insert(database.customersTable).values({ id, name: "Session Test Customer", email });
  createdCustomerIds.add(id);
  if (clerkUserId) {
    await database.db.insert(database.customerProfilesTable).values({
      customerId: id,
      clerkUserId,
      firstName: "Session",
      lastName: "Test",
    });
  }
  return { id, email, clerkUserId };
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

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.SESSION_SECRET = "customer-session-revocation-test-secret";
  database = await import("@workspace/db");
  operatorAuth = await import("../src/lib/operator-auth");
  customerManagement = await import("../src/routes/customer-management");
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: (userId) => verifiedEmails.get(userId) ?? null,
  });
  customerManagement.configureCustomerManagementClerkForTests({
    revokeAllSessions: async (userId) => {
      revokedUserIds.push(userId);
      if (revokeMode === "failure") throw new Error("provider-session-token-must-not-leak");
    },
  });
  const api = await startApi();
  apiUrl = api.url;
  closeApi = api.close;
});

after(async () => {
  if (closeApi) await closeApi();
  if (createdCustomerIds.size) {
    await database.db.delete(database.customerManagementAuditLogsTable)
      .where(inArray(database.customerManagementAuditLogsTable.targetCustomerId, [...createdCustomerIds]));
    await database.db.delete(database.customersTable)
      .where(inArray(database.customersTable.id, [...createdCustomerIds]));
  }
  if (createdOperatorIds.size) {
    await database.db.delete(database.operatorAuditLogsTable)
      .where(inArray(database.operatorAuditLogsTable.targetOperatorId, [...createdOperatorIds]));
    await database.db.delete(database.operatorsTable)
      .where(inArray(database.operatorsTable.id, [...createdOperatorIds]));
  }
  await database.pool.end();
});

test("owner revocation calls Clerk with the resolved identity and records one bounded audit event", async () => {
  revokeMode = "success";
  revokedUserIds = [];
  const owner = await seedOperator("owner");
  const customer = await seedCustomer(`user_${randomUUID()}`);

  const response = await request(`/admin/customers/${customer.id}/sessions-revoke`, owner.clerkUserId);
  assert.equal(response.status, 200);
  assert.deepEqual(revokedUserIds, [customer.clerkUserId]);
  assert.equal(response.body?.action, "sessions_revoked");

  const audits = await database.db.select().from(database.customerManagementAuditLogsTable)
    .where(eq(database.customerManagementAuditLogsTable.targetCustomerId, customer.id));
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0]?.details, {});
});

test("ordinary operators cannot revoke customer sessions", async () => {
  const operator = await seedOperator("operator");
  const customer = await seedCustomer(`user_${randomUUID()}`);
  revokedUserIds = [];

  const response = await request(`/admin/customers/${customer.id}/sessions-revoke`, operator.clerkUserId);
  assert.equal(response.status, 403);
  assert.equal(response.body?.code, "OWNER_ACCESS_REQUIRED");
  assert.deepEqual(revokedUserIds, []);
});

test("linked identity is required and failure creates no audit event", async () => {
  const owner = await seedOperator("owner");
  const customer = await seedCustomer(null);
  revokedUserIds = [];

  const response = await request(`/admin/customers/${customer.id}/sessions-revoke`, owner.clerkUserId);
  assert.equal(response.status, 409);
  assert.equal(response.body?.code, "CUSTOMER_CLERK_IDENTITY_REQUIRED");
  assert.deepEqual(revokedUserIds, []);
  const audits = await database.db.select().from(database.customerManagementAuditLogsTable)
    .where(eq(database.customerManagementAuditLogsTable.targetCustomerId, customer.id));
  assert.equal(audits.length, 0);
});

test("unsupported Clerk session revocation fails explicitly without an audit event", async () => {
  const owner = await seedOperator("owner");
  const customer = await seedCustomer(`user_${randomUUID()}`);
  customerManagement.configureCustomerManagementClerkForTests({});

  const response = await request(`/admin/customers/${customer.id}/sessions-revoke`, owner.clerkUserId);
  assert.equal(response.status, 409);
  assert.equal(response.body?.code, "CLERK_SESSION_REVOCATION_UNSUPPORTED");
  const audits = await database.db.select().from(database.customerManagementAuditLogsTable)
    .where(eq(database.customerManagementAuditLogsTable.targetCustomerId, customer.id));
  assert.equal(audits.length, 0);
  customerManagement.configureCustomerManagementClerkForTests({
    revokeAllSessions: async (userId) => {
      revokedUserIds.push(userId);
      if (revokeMode === "failure") throw new Error("provider-session-token-must-not-leak");
    },
  });
});

test("provider failure is safe, non-successful, and unaudited", async () => {
  revokeMode = "failure";
  const owner = await seedOperator("owner");
  const customer = await seedCustomer(`user_${randomUUID()}`);
  revokedUserIds = [];

  const response = await request(`/admin/customers/${customer.id}/sessions-revoke`, owner.clerkUserId);
  assert.equal(response.status, 502);
  assert.equal(response.body?.code, "CLERK_SESSION_REVOCATION_FAILED");
  assert.doesNotMatch(JSON.stringify(response.body), /provider-session-token-must-not-leak/);
  const audits = await database.db.select().from(database.customerManagementAuditLogsTable)
    .where(eq(database.customerManagementAuditLogsTable.targetCustomerId, customer.id));
  assert.equal(audits.length, 0);
  revokeMode = "success";
});