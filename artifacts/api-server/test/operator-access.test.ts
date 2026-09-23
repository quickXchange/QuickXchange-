import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { and, eq, inArray, sql } from "drizzle-orm";
import test, { after, before } from "node:test";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";

const createdOperatorIds = new Set<string>();
const createdOrderIds = new Set<string>();
const createdQuickexOrderIds = new Set<string>();
const createdCustomerEmails = new Set<string>();
const createdPaymentMethodIds = new Set<string>();
const createdTeamRoleIds = new Set<string>();
const verifiedEmails = new Map<string, string>();
const verifiedSecondFactors = new Map<string, boolean>();
const totpEnrollments = new Map<string, boolean>();
const privilegedTestPool = createPrivilegedTestPool();

let apiUrl = "";
let closeApi: () => Promise<void>;
let database: typeof import("@workspace/db");
let operatorAuth: typeof import("../src/lib/operator-auth");
let customerAuth: typeof import("../src/lib/customer-auth");
let customerNotifications: typeof import("../src/lib/customer-status-notifications");
let operatorRoutes: typeof import("../src/routes/operators");
let quoteTickets: typeof import("../src/lib/quote-ticket");
const deliveredCustomerNotifications: import(
  "../src/lib/customer-status-notifications"
).CustomerStatusNotification[] = [];

function captureCustomerNotification(
  notification: import(
    "../src/lib/customer-status-notifications"
  ).CustomerStatusNotification,
): void {
  deliveredCustomerNotifications.push(notification);
}

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.test`;
}

function testHeaders(userId?: string): Record<string, string> {
  return userId ? { "x-test-clerk-user-id": userId } : {};
}

async function request(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<{ status: number; body: Record<string, unknown> | undefined }> {
  // Status writes are optimistic-concurrency mutations. Keep older notification
  // scenarios focused on delivery behavior while always sending the version
  // currently persisted immediately before their request.
  let body = options.body;
  if (
    options.method === "PATCH" &&
    /^\/orders\/[^/]+$/.test(path) &&
    typeof body === "string"
  ) {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed.status !== undefined && parsed.recordVersion === undefined) {
      const id = path.slice("/orders/".length);
      const [order] = await database.db
        .select({ recordVersion: database.ordersTable.recordVersion })
        .from(database.ordersTable)
        .where(eq(database.ordersTable.id, id));
      assert.ok(order, `seeded order ${id} must exist`);
      body = JSON.stringify({ ...parsed, recordVersion: order.recordVersion });
    }
  }
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    body,
    headers: {
      ...testHeaders(userId),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as Record<string, unknown> : undefined,
  };
}

async function seedOperator(input: {
  email?: string;
  clerkUserId?: string | null;
  role?: "owner" | "operator";
  status?: "invited" | "active" | "suspended" | "removed";
}) {
  const [operator] = await database.db
    .insert(database.operatorsTable)
    .values({
      email: input.email ?? uniqueEmail("seeded-operator"),
      clerkUserId: input.clerkUserId,
      role: input.role ?? "operator",
      status: input.status ?? "active",
      legacyPermissionEligible: input.role !== "owner" && (input.status ?? "active") === "active",
    })
    .returning();
  createdOperatorIds.add(operator.id);
  return operator;
}

async function seedOrder(input: {
  id?: string;
  customerClerkUserId?: string | null;
  customerEmail?: string;
  provider?: string;
  status?: string;
  createdAt?: Date;
}) {
  const id = input.id ?? `QX-${randomUUID()}`;
  const customerEmail = input.customerEmail ?? uniqueEmail("customer-order");
  const [order] = await database.db
    .insert(database.ordersTable)
    .values({
      id,
      type: "manual",
      status: input.status ?? "pending",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "450",
      receiveAmount: "475",
      customerEmail,
      customerName: "Private Customer",
      destinationAddress: "private-destination-wallet",
      destinationMemo: "private-destination-memo",
      refundAddress: "private-refund-wallet",
      refundMemo: "private-refund-memo",
      depositAddress: "private-deposit-wallet",
      depositMemo: "private-deposit-memo",
      paymentMethod: "private-payment-method",
      payoutMethod: "private-payout-method",
      provider: input.provider ?? "Manual desk",
      note: "private operator note",
      providerReference: "private-provider-reference",
      providerOrderId: "private-provider-order-id",
      providerState: "private-provider-state",
      errorCode: "PRIVATE_ERROR",
      errorMessage: "private raw error",
      customerClerkUserId: input.customerClerkUserId,
      customerOwnershipSource: input.customerClerkUserId
        ? "authenticated_create"
        : "",
      ...(input.createdAt ? { createdAt: input.createdAt, updatedAt: input.createdAt } : {}),
    })
    .returning();
  createdOrderIds.add(order.id);
  return order;
}

async function seedQuickexOrder(customerClerkUserId: string | null, input: { createdAt?: Date } = {}) {
  const legacyOrderId = `QX-${randomUUID()}`;
  const [order] = await database.db
    .insert(database.quickexOrdersTable)
    .values({
      legacyOrderId,
      providerOrderId: "900001",
      providerReference: randomUUID(),
      quoteId: "customer-history-quote",
      customerEmail: uniqueEmail("quickex-customer"),
      customerName: customerClerkUserId ? "Convert Customer" : "Guest",
      customerClerkUserId,
      status: "awaiting deposit",
      providerState: "created",
      route: {
        fromAsset: "BTC",
        fromNetwork: "Bitcoin",
        toAsset: "USDT",
        toNetwork: "TRC20",
        rateMode: "FLOATING",
      },
      amounts: { amount: "1", receiveAmount: "99.5" },
      addresses: {
        destinationAddress: "quickex-destination",
        refundAddress: "quickex-refund",
      },
      createdAt: input.createdAt ?? new Date(),
      updatedAt: input.createdAt ?? new Date(),
    })
    .returning();
  createdQuickexOrderIds.add(legacyOrderId);
  return order;
}

function manualOrderRequest(label: string) {
  const clientRequestId = randomUUID();
  const customerEmail = uniqueEmail(label);
  const quote = {
    v: 1 as const,
    type: "manual" as const,
    fromAsset: "EUR",
    fromNetwork: "SEPA",
    toAsset: "USDT",
    toNetwork: "TRC20",
    amount: 325,
    receiveAmount: 325,
    rate: 1,
    fee: 0,
    paymentMethod: "BANK TRANSFER",
    payoutMethod: "WALLET",
    pricingRuleId: "00000000-0000-4000-8000-000000000035",
    pricingRuleVersion: 1,
    pricingRuleName: "Global 0.6% fallback",
    grossMarketAmount: 325,
    percentageCommission: 0,
    fixedCommission: 0,
    totalFee: 0,
    pricingSnapshot: {
      policyVersion: "manual-desk-pricing-v1" as const,
      rule: {
        id: "00000000-0000-4000-8000-000000000035",
        version: 1,
        name: "Global 0.6% fallback",
        selectors: {
          sourceAsset: null, targetAsset: null, sourceNetwork: null,
          targetNetwork: null, paymentMethod: null, payoutMethod: null,
        },
        markupBasisPoints: 0,
        fixedFee: null,
      },
      context: {
        sourceAsset: "EUR", targetAsset: "USDT", sourceNetwork: "SEPA",
        targetNetwork: "TRC20", paymentMethod: "BANK TRANSFER", payoutMethod: "WALLET",
      },
      reference: {
        source: {
          currency: "EUR", unitsPerUsd: "1", provider: "test adapter" as const,
          source: "test", observedAt: new Date().toISOString(), timestampKind: "fetchedAt" as const,
        },
        target: {
          currency: "USDT", unitsPerUsd: "1", provider: "test adapter" as const,
          source: "test", observedAt: new Date().toISOString(), timestampKind: "fetchedAt" as const,
        },
        executionProvider: "Manual desk" as const,
      },
      targetPrecision: 8,
      rounding: {
        grossMarketAmount: "truncate" as const,
        percentageCommission: "ceil" as const,
        fixedCommission: "ceil" as const,
        finalRate: "truncate" as const,
        finalRateScale: 30 as const,
      },
      amounts: {
        grossMarketAmount: "325", percentageCommission: "0", fixedCommission: "0",
        totalFee: "0", receiveAmount: "325", finalRate: "1",
      },
    },
    expiresAt: Date.now() + 60_000,
    provider: "Manual desk",
  };
  createdCustomerEmails.add(customerEmail);
  return {
    type: quote.type,
    fromAsset: quote.fromAsset,
    fromNetwork: quote.fromNetwork,
    toAsset: quote.toAsset,
    toNetwork: quote.toNetwork,
    amount: quote.amount,
    customerEmail,
    customerName: "History Customer",
    clientRequestId,
    paymentMethod: "Bank transfer",
    payoutMethod: "Wallet",
    quoteId: quoteTickets.signQuoteTicket(quote),
  };
}

async function auditActions(operatorId: string): Promise<string[]> {
  const rows = await database.db
    .select({ action: database.operatorAuditLogsTable.action })
    .from(database.operatorAuditLogsTable)
    .where(eq(database.operatorAuditLogsTable.targetOperatorId, operatorId));
  return rows.map((row) => row.action);
}

async function assertOneAudit(operatorId: string, action: string): Promise<void> {
  assert.equal(
    (await auditActions(operatorId)).filter((value) => value === action).length,
    1,
    `${action} must have exactly one audit record`,
  );
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
  process.env.SESSION_SECRET = "customer-order-history-test-secret";
  database = await import("@workspace/db");
  operatorAuth = await import("../src/lib/operator-auth");
  customerAuth = await import("../src/lib/customer-auth");
  customerNotifications = await import("../src/lib/customer-status-notifications");
  operatorRoutes = await import("../src/routes/operators");
  quoteTickets = await import("../src/lib/quote-ticket");
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: (userId) => verifiedEmails.get(userId) ?? null,
    getSecondFactorVerified: (_req, userId) => verifiedSecondFactors.get(userId) ?? true,
    getTotpEnabled: (userId) => totpEnrollments.get(userId) ?? true,
  });
  customerAuth.configureCustomerAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: (userId) => verifiedEmails.get(userId) ?? null,
  });
  customerNotifications.configureCustomerNotificationDeliveryForTests({
    send: captureCustomerNotification,
  });
  const api = await startApi();
  apiUrl = api.url;
  closeApi = api.close;
});

after(async () => {
  if (closeApi) await closeApi();
  if (createdOrderIds.size) {
    await database.db
      .delete(database.ordersTable)
      .where(inArray(database.ordersTable.id, [...createdOrderIds]));
  }
  if (createdQuickexOrderIds.size) {
    const client = await privilegedTestPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("ALTER TABLE exchange_order_audit_logs DISABLE TRIGGER USER");
      await client.query(
        `delete from exchange_order_audit_logs where order_id = any($1::text[])`,
        [[...createdQuickexOrderIds]],
      );
      await client.query("ALTER TABLE exchange_order_audit_logs ENABLE TRIGGER USER");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await database.db
      .delete(database.orderSupportMetadataTable)
      .where(inArray(database.orderSupportMetadataTable.orderId, [...createdQuickexOrderIds]));
    await database.db
      .delete(database.quickexOrdersTable)
      .where(inArray(database.quickexOrdersTable.legacyOrderId, [...createdQuickexOrderIds]));
  }
  if (createdCustomerEmails.size) {
    await database.db
      .delete(database.customersTable)
      .where(inArray(database.customersTable.email, [...createdCustomerEmails]));
  }
  if (createdPaymentMethodIds.size) {
    await database.db
      .delete(database.paymentMethodsTable)
      .where(inArray(database.paymentMethodsTable.id, [...createdPaymentMethodIds]));
  }
  if (createdTeamRoleIds.size) {
    await database.db
      .delete(database.teamRolesTable)
      .where(inArray(database.teamRolesTable.id, [...createdTeamRoleIds]));
  }
  const ids = [...createdOperatorIds];
  if (ids.length) {
    await database.db
      .delete(database.operatorAuditLogsTable)
      .where(inArray(database.operatorAuditLogsTable.targetOperatorId, ids));
    await database.db
      .delete(database.operatorsTable)
      .where(inArray(database.operatorsTable.id, ids));
  }
  await privilegedTestPool.end();
  await database.pool.end();
});

test("order patch authorization uses target status permissions and requires all mixed-field permissions", async () => {
  const notesOnlyUserId = `user_order_notes_${randomUUID()}`;
  const completeOnlyUserId = `user_order_complete_${randomUUID()}`;
  const mixedUserId = `user_order_mixed_${randomUUID()}`;
  const roleRows = await Promise.all([
    database.db.insert(database.teamRolesTable).values({
      name: `Order notes ${randomUUID()}`,
      normalizedName: `order-notes-${randomUUID()}`,
      description: "test",
      permissionKeys: ["orders.notes"],
    }).returning(),
    database.db.insert(database.teamRolesTable).values({
      name: `Order complete ${randomUUID()}`,
      normalizedName: `order-complete-${randomUUID()}`,
      description: "test",
      permissionKeys: ["orders.complete"],
    }).returning(),
    database.db.insert(database.teamRolesTable).values({
      name: `Order mixed ${randomUUID()}`,
      normalizedName: `order-mixed-${randomUUID()}`,
      description: "test",
      permissionKeys: ["orders.notes", "orders.complete"],
    }).returning(),
  ]);
  const [notesRole] = roleRows[0];
  const [completeRole] = roleRows[1];
  const [mixedRole] = roleRows[2];
  for (const role of [notesRole, completeRole, mixedRole]) {
    createdTeamRoleIds.add(role.id);
  }
  const [notesOperator] = await database.db.insert(database.operatorsTable).values({
    email: uniqueEmail("order-notes"),
    clerkUserId: notesOnlyUserId,
    role: "operator",
    status: "active",
    invitedBy: "security-review",
    customRoleId: notesRole.id,
  }).returning();
  const [completeOperator] = await database.db.insert(database.operatorsTable).values({
    email: uniqueEmail("order-complete"),
    clerkUserId: completeOnlyUserId,
    role: "operator",
    status: "active",
    invitedBy: "security-review",
    customRoleId: completeRole.id,
  }).returning();
  const [mixedOperator] = await database.db.insert(database.operatorsTable).values({
    email: uniqueEmail("order-mixed"),
    clerkUserId: mixedUserId,
    role: "operator",
    status: "active",
    invitedBy: "security-review",
    customRoleId: mixedRole.id,
  }).returning();
  createdOperatorIds.add(notesOperator.id);
  createdOperatorIds.add(completeOperator.id);
  createdOperatorIds.add(mixedOperator.id);

  const notesOrder = await seedOrder({ status: "pending" });
  const notesVersion = notesOrder.recordVersion;
  const notesAllowed = await request(
    `/orders/${notesOrder.id}`,
    { method: "PATCH", body: JSON.stringify({ note: "updated", recordVersion: notesVersion }) },
    notesOnlyUserId,
  );
  assert.equal(notesAllowed.status, 200);

  const completeOrder = await seedOrder({ status: "pending" });
  const completeDenied = await request(
    `/orders/${completeOrder.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "completed", recordVersion: completeOrder.recordVersion }) },
    notesOnlyUserId,
  );
  assert.equal(completeDenied.status, 403);
  const completeAllowed = await request(
    `/orders/${completeOrder.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "completed", recordVersion: completeOrder.recordVersion }) },
    completeOnlyUserId,
  );
  assert.equal(completeAllowed.status, 200);

  const mixedOrder = await seedOrder({ status: "pending" });
  const mixedDenied = await request(
    `/orders/${mixedOrder.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "completed", note: "mixed", recordVersion: mixedOrder.recordVersion }) },
    completeOnlyUserId,
  );
  assert.equal(mixedDenied.status, 403);
  const mixedAllowed = await request(
    `/orders/${mixedOrder.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "completed", note: "mixed", recordVersion: mixedOrder.recordVersion }) },
    mixedUserId,
  );
  assert.equal(mixedAllowed.status, 200);
});

test("support tools atomically save fields with scoped permissions and an auditable no-op", async () => {
  const ownerUserId = `user_support_owner_${randomUUID()}`;
  const supportUserId = `user_support_operator_${randomUUID()}`;
  const detailsOnlyUserId = `user_support_details_${randomUUID()}`;
  const notesOnlyUserId = `user_support_notes_${randomUUID()}`;
  const assignOnlyUserId = `user_support_assign_${randomUUID()}`;
  const assignee = await seedOperator({ clerkUserId: `user_support_assignee_${randomUUID()}` });
  const inactiveAssignee = await seedOperator({
    clerkUserId: `user_support_inactive_${randomUUID()}`,
    status: "suspended",
  });
  const roleRows = await Promise.all([
    ["support-all", ["orders.details", "orders.support_tools", "orders.assign", "orders.notes"]],
    ["support-details", ["orders.details", "orders.support_tools"]],
    ["support-notes", ["orders.details", "orders.support_tools", "orders.notes"]],
    ["support-assign", ["orders.details", "orders.support_tools", "orders.assign"]],
  ].map(async ([label, permissionKeys]) => {
    const [role] = await database.db.insert(database.teamRolesTable).values({
      name: `${label} ${randomUUID()}`,
      normalizedName: `${label}-${randomUUID()}`,
      description: "support tools test role",
      permissionKeys,
    }).returning();
    createdTeamRoleIds.add(role.id);
    return role;
  }));
  const [allRole, detailsRole, notesRole, assignRole] = roleRows;
  const roleOperators = await Promise.all([
    seedOperator({ clerkUserId: supportUserId }),
    seedOperator({ clerkUserId: detailsOnlyUserId }),
    seedOperator({ clerkUserId: notesOnlyUserId }),
    seedOperator({ clerkUserId: assignOnlyUserId }),
    seedOperator({ clerkUserId: ownerUserId, role: "owner" }),
  ]);
  await Promise.all([
    database.db.update(database.operatorsTable).set({
      customRoleId: allRole.id,
      permissionAllows: ["orders.assign", "orders.notes"],
    })
      .where(eq(database.operatorsTable.id, roleOperators[0].id)),
    database.db.update(database.operatorsTable).set({ customRoleId: detailsRole.id })
      .where(eq(database.operatorsTable.id, roleOperators[1].id)),
    database.db.update(database.operatorsTable).set({ customRoleId: notesRole.id })
      .where(eq(database.operatorsTable.id, roleOperators[2].id)),
    database.db.update(database.operatorsTable).set({ customRoleId: assignRole.id })
      .where(eq(database.operatorsTable.id, roleOperators[3].id)),
  ]);

  const order = await seedOrder({ provider: "Provider-owned execution" });
  const originalProviderValues = {
    amount: order.amount,
    receiveAmount: order.receiveAmount,
    finalRate: order.finalRate,
    provider: order.provider,
    providerReference: order.providerReference,
    providerOrderId: order.providerOrderId,
    providerState: order.providerState,
  };
  const body = (recordVersion: number, overrides: Record<string, unknown> = {}) => ({
    recordVersion,
    supportStatus: "in_progress",
    sendingStatus: "sent",
    receivingStatus: "confirmed",
    sentAmountOverride: "12.500",
    receiveAmountOverride: "11.25",
    exchangeRateOverride: "0.9",
    networkFeeAmount: "0.01",
    transactionHash: "tx-support-tools",
    paymentReference: "payment-support-tools",
    assignedOperatorId: assignee.id,
    note: "support tools note",
    ...overrides,
  });

  const deniedBaseline = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(order.recordVersion)) },
    detailsOnlyUserId,
  );
  assert.equal(deniedBaseline.status, 403);
  assert.equal(deniedBaseline.body?.code, "PERMISSION_ACCESS_DENIED");

  const ownerAuthorization = await operatorAuth.getOperatorAuthorization(ownerUserId);
  assert.equal(ownerAuthorization?.role, "owner");
  assert.ok(ownerAuthorization?.effectivePermissions.includes("orders.support_tools"));
  const ownerHttpAuthorization = await request("/admin/authorization", {}, ownerUserId);
  assert.equal(ownerHttpAuthorization.status, 200, `authorization: ${JSON.stringify(ownerHttpAuthorization.body)}`);
  const saved = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(order.recordVersion)) },
    ownerUserId,
  );
  assert.equal(saved.status, 200, `support save: ${JSON.stringify(saved.body)}`);
  const invalidEnum = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(saved.body?.recordVersion as number, { supportStatus: "bogus" })) },
    supportUserId,
  );
  assert.equal(invalidEnum.status, 400, `invalid enum: ${JSON.stringify(invalidEnum.body)}`);
  const invalidDecimal = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(saved.body?.recordVersion as number, { sentAmountOverride: "1e3" })) },
    supportUserId,
  );
  assert.equal(invalidDecimal.status, 400, `invalid decimal: ${JSON.stringify(invalidDecimal.body)}`);
  const [stored] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, order.id));
  assert.equal(stored.supportStatus, "in_progress");
  assert.equal(stored.sendingStatus, "sent");
  assert.equal(stored.receivingStatus, "confirmed");
  assert.equal(stored.sentAmountOverride, "12.500");
  assert.equal(stored.receiveAmountOverride, "11.25");
  assert.equal(stored.exchangeRateOverride, "0.9");
  assert.equal(stored.networkFeeAmount, "0.01");
  assert.equal(stored.transactionHash, "tx-support-tools");
  assert.equal(stored.paymentReference, "payment-support-tools");
  assert.equal(stored.assignedOperatorId, assignee.id);
  assert.equal(stored.note, "support tools note");
  for (const [field, value] of Object.entries(originalProviderValues)) {
    assert.equal(stored[field as keyof typeof stored], value, `${field} must remain provider-owned`);
  }

  const [audit] = await database.db.select().from(database.orderAuditLogsTable)
    .where(eq(database.orderAuditLogsTable.orderId, order.id));
  assert.ok(audit);
  assert.equal(audit.action, "order.support_tools_updated");
  assert.equal(audit.actorType, "operator");
  assert.equal(audit.actorId, roleOperators[4].id);
  assert.ok(audit.createdAt instanceof Date);
  assert.deepEqual(audit.details, {
    changes: {
      supportStatus: { oldValue: "open", newValue: "in_progress" },
      sendingStatus: { oldValue: "pending", newValue: "sent" },
      receivingStatus: { oldValue: "pending", newValue: "confirmed" },
      sentAmountOverride: { oldValue: null, newValue: "12.500" },
      receiveAmountOverride: { oldValue: null, newValue: "11.25" },
      exchangeRateOverride: { oldValue: null, newValue: "0.9" },
      networkFeeAmount: { oldValue: null, newValue: "0.01" },
      transactionHash: { oldValue: null, newValue: "tx-support-tools" },
      paymentReference: { oldValue: null, newValue: "payment-support-tools" },
      assignedOperatorId: { oldValue: null, newValue: assignee.id },
      note: { oldValue: "private operator note", newValue: "support tools note" },
    },
  });

  const version = stored.recordVersion;
  const noOp = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(version)) },
    supportUserId,
  );
  assert.equal(noOp.status, 200);
  const [afterNoOp] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, order.id));
  assert.equal(afterNoOp.recordVersion, version);
  assert.equal((await database.db.select().from(database.orderAuditLogsTable)
    .where(eq(database.orderAuditLogsTable.orderId, order.id))).length, 1);

  const stale = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(order.recordVersion, { note: "stale" })) },
    supportUserId,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.body?.code, "ORDER_UPDATE_CONFLICT");

  const clear = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(version, {
      sentAmountOverride: null, receiveAmountOverride: null, exchangeRateOverride: null,
      networkFeeAmount: null, transactionHash: null, paymentReference: null,
      assignedOperatorId: null, note: "",
    })) },
    ownerUserId,
  );
  assert.equal(clear.status, 200);
  const [cleared] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, order.id));
  assert.equal(cleared.sentAmountOverride, null);
  assert.equal(cleared.receiveAmountOverride, null);
  assert.equal(cleared.exchangeRateOverride, null);
  assert.equal(cleared.networkFeeAmount, null);
  assert.equal(cleared.transactionHash, null);
  assert.equal(cleared.paymentReference, null);
  assert.equal(cleared.assignedOperatorId, null);
  assert.equal(cleared.note, "");
  assert.equal((await database.db.select().from(database.orderAuditLogsTable)
    .where(and(
      eq(database.orderAuditLogsTable.orderId, order.id),
      eq(database.orderAuditLogsTable.action, "order.support_tools_updated"),
    ))).length, 2);

  const inactive = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(cleared.recordVersion, { assignedOperatorId: inactiveAssignee.id })) },
    supportUserId,
  );
  assert.equal(inactive.status, 422);
  assert.equal(inactive.body?.code, "ASSIGNEE_NOT_ELIGIBLE");

  const assignmentDenied = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(cleared.recordVersion, { assignedOperatorId: assignee.id })) },
    notesOnlyUserId,
  );
  assert.equal(assignmentDenied.status, 403);
  assert.equal(assignmentDenied.body?.code, "PERMISSION_ACCESS_DENIED");
  const noteDenied = await request(
    `/orders/${order.id}/support-tools`,
    { method: "PATCH", body: JSON.stringify(body(cleared.recordVersion, { note: "not allowed" })) },
    assignOnlyUserId,
  );
  assert.equal(noteDenied.status, 403);
  assert.equal(noteDenied.body?.code, "PERMISSION_ACCESS_DENIED");
});

test("Quickex provider orders use support metadata without changing provider state", async () => {
  const ownerUserId = `user_quickex_support_owner_${randomUUID()}`;
  const assignmentUserId = `user_quickex_support_assignment_${randomUUID()}`;
  const noteUserId = `user_quickex_support_note_${randomUUID()}`;
  const assignee = await seedOperator({ clerkUserId: `user_quickex_assignee_${randomUUID()}` });
  const [assignmentRole, noteRole] = await Promise.all([
    database.db.insert(database.teamRolesTable).values({
      name: `Quickex assignment ${randomUUID()}`,
      normalizedName: `quickex-assignment-${randomUUID()}`,
      description: "Quickex support assignment test role",
      permissionKeys: ["orders.details", "orders.support_tools", "orders.assign"],
    }).returning(),
    database.db.insert(database.teamRolesTable).values({
      name: `Quickex notes ${randomUUID()}`,
      normalizedName: `quickex-notes-${randomUUID()}`,
      description: "Quickex support notes test role",
      permissionKeys: ["orders.details", "orders.support_tools", "orders.notes"],
    }).returning(),
  ]);
  createdTeamRoleIds.add(assignmentRole[0].id);
  createdTeamRoleIds.add(noteRole[0].id);
  const [assignmentOperator, noteOperator] = await Promise.all([
    seedOperator({ clerkUserId: assignmentUserId }),
    seedOperator({ clerkUserId: noteUserId }),
  ]);
  await Promise.all([
    database.db.update(database.operatorsTable)
      .set({ customRoleId: assignmentRole[0].id })
      .where(eq(database.operatorsTable.id, assignmentOperator.id)),
    database.db.update(database.operatorsTable)
      .set({ customRoleId: noteRole[0].id })
      .where(eq(database.operatorsTable.id, noteOperator.id)),
  ]);
  const owner = await seedOperator({ clerkUserId: ownerUserId, role: "owner" });
  const providerOrder = await seedQuickexOrder(null);
  const [exchangeRow] = await database.db.select({ id: database.ordersTable.id })
    .from(database.ordersTable).where(eq(database.ordersTable.id, providerOrder.legacyOrderId));
  assert.equal(exchangeRow, undefined, "Quickex fixture must not have an exchange_orders row");
  const providerValues = {
    status: providerOrder.status,
    amount: providerOrder.amounts,
    rate: providerOrder.route,
    providerState: providerOrder.providerState,
    providerReference: providerOrder.providerReference,
    providerOrderId: providerOrder.providerOrderId,
  };

  const initial = await request(`/orders/${providerOrder.legacyOrderId}`, {}, ownerUserId);
  assert.equal(initial.status, 200, `Quickex GET: ${JSON.stringify(initial.body)}`);
  assert.equal(initial.body?.recordVersion, 0);
  assert.equal(initial.body?.supportStatus, "open");
  assert.equal(initial.body?.sendingStatus, "pending");
  assert.equal(initial.body?.receivingStatus, "pending");
  assert.equal(initial.body?.note, undefined);

  const supportBody = (recordVersion: number, overrides: Record<string, unknown> = {}) => ({
    recordVersion,
    supportStatus: "in_progress",
    sendingStatus: "sent",
    receivingStatus: "confirmed",
    sentAmountOverride: "12.500",
    receiveAmountOverride: "11.25",
    exchangeRateOverride: "0.9",
    networkFeeAmount: "0.01",
    transactionHash: "quickex-support-tx",
    paymentReference: "quickex-support-payment",
    assignedOperatorId: assignee.id,
    note: "quickex support note",
    ...overrides,
  });
  const saved = await request(
    `/orders/${providerOrder.legacyOrderId}/support-tools`,
    { method: "PATCH", body: JSON.stringify(supportBody(0)) },
    ownerUserId,
  );
  assert.equal(saved.status, 200, `Quickex support save: ${JSON.stringify(saved.body)}`);
  assert.equal(saved.body?.recordVersion, 1);
  assert.equal(saved.body?.assignedOperatorId, assignee.id);
  assert.equal(saved.body?.note, "quickex support note");
  assert.equal(saved.body?.providerOrderId, providerOrder.providerOrderId);
  assert.equal(saved.body?.providerReference, providerOrder.providerReference);
  const overlay = await request(`/orders/${providerOrder.legacyOrderId}`, {}, ownerUserId);
  assert.equal(overlay.status, 200);
  for (const [key, value] of Object.entries(supportBody(1))) {
    if (key !== "recordVersion") assert.deepEqual(overlay.body?.[key], value, key);
  }
  assert.equal(overlay.body?.providerOrderId, providerOrder.providerOrderId);
  assert.equal(overlay.body?.providerReference, providerOrder.providerReference);
  const [storedProvider] = await database.db.select().from(database.quickexOrdersTable)
    .where(eq(database.quickexOrdersTable.legacyOrderId, providerOrder.legacyOrderId));
  assert.deepEqual({
    status: storedProvider.status,
    amount: storedProvider.amounts,
    rate: storedProvider.route,
    providerState: storedProvider.providerState,
    providerReference: storedProvider.providerReference,
    providerOrderId: storedProvider.providerOrderId,
  }, providerValues);

  const [audit] = await database.db.select().from(database.orderAuditLogsTable)
    .where(eq(database.orderAuditLogsTable.orderId, providerOrder.legacyOrderId));
  assert.ok(audit);
  assert.equal(audit.action, "order.support_tools_updated");
  assert.equal(audit.actorType, "operator");
  assert.equal(audit.actorId, owner.id);
  assert.ok(audit.createdAt instanceof Date);
  assert.deepEqual(audit.details, {
    changes: {
      supportStatus: { oldValue: "open", newValue: "in_progress" },
      sendingStatus: { oldValue: "pending", newValue: "sent" },
      receivingStatus: { oldValue: "pending", newValue: "confirmed" },
      sentAmountOverride: { oldValue: null, newValue: "12.500" },
      receiveAmountOverride: { oldValue: null, newValue: "11.25" },
      exchangeRateOverride: { oldValue: null, newValue: "0.9" },
      networkFeeAmount: { oldValue: null, newValue: "0.01" },
      transactionHash: { oldValue: null, newValue: "quickex-support-tx" },
      paymentReference: { oldValue: null, newValue: "quickex-support-payment" },
      assignedOperatorId: { oldValue: null, newValue: assignee.id },
      note: { oldValue: "", newValue: "quickex support note" },
    },
  });
  const noOp = await request(
    `/orders/${providerOrder.legacyOrderId}/support-tools`,
    { method: "PATCH", body: JSON.stringify(supportBody(1)) },
    ownerUserId,
  );
  assert.equal(noOp.status, 200);
  assert.equal((await database.db.select().from(database.orderAuditLogsTable)
    .where(eq(database.orderAuditLogsTable.orderId, providerOrder.legacyOrderId))).length, 1);
  const stale = await request(
    `/orders/${providerOrder.legacyOrderId}/support-tools`,
    { method: "PATCH", body: JSON.stringify(supportBody(0, { note: "stale" })) },
    ownerUserId,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.body?.code, "ORDER_UPDATE_CONFLICT");

  const assignmentDenied = await request(
    `/orders/${providerOrder.legacyOrderId}/support-tools`,
    { method: "PATCH", body: JSON.stringify(supportBody(1, { assignedOperatorId: null })) },
    noteUserId,
  );
  assert.equal(assignmentDenied.status, 403);
  assert.equal(assignmentDenied.body?.code, "PERMISSION_ACCESS_DENIED");
  const noteDenied = await request(
    `/orders/${providerOrder.legacyOrderId}/support-tools`,
    { method: "PATCH", body: JSON.stringify(supportBody(1, { note: "not allowed" })) },
    assignmentUserId,
  );
  assert.equal(noteDenied.status, 403);
  assert.equal(noteDenied.body?.code, "PERMISSION_ACCESS_DENIED");
});

test("new no-role members do not receive legacy access through runtime fallback", async () => {
  const invitedUserId = `user_new_invited_${randomUUID()}`;
  const activeUserId = `user_new_active_${randomUUID()}`;
  const [invited] = await database.db.insert(database.operatorsTable).values({
    email: uniqueEmail("new-invited"),
    clerkUserId: invitedUserId,
    role: "operator",
    status: "invited",
    invitedBy: null,
  }).returning();
  const [active] = await database.db.insert(database.operatorsTable).values({
    email: uniqueEmail("new-active"),
    clerkUserId: activeUserId,
    role: "operator",
    status: "active",
    invitedBy: null,
  }).returning();
  createdOperatorIds.add(invited.id);
  createdOperatorIds.add(active.id);
  assert.equal(await operatorAuth.getOperatorAuthorization(invitedUserId), null);
  const activeAuthorization = await operatorAuth.getOperatorAuthorization(activeUserId);
  assert.equal(activeAuthorization?.id, active.id);
  assert.deepEqual(activeAuthorization?.effectivePermissions, []);
});

test("ordinary signed-in users are denied while operators and owners receive only their allowed access", async () => {
  const ownerUserId = `user_owner_${randomUUID()}`;
  const operatorUserId = `user_operator_${randomUUID()}`;
  const ordinaryUserId = `user_ordinary_${randomUUID()}`;
  await seedOperator({ clerkUserId: ownerUserId, role: "owner" });
  await seedOperator({ clerkUserId: operatorUserId, role: "operator" });

  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () => operatorAuth.configureOperatorAuthorizationForTests({
        getUserId: () => ownerUserId,
        getVerifiedEmail: () => null,
      }),
      /require NODE_ENV=test/,
    );
    const productionHeaderAttempt = await request("/admin/operators", {}, ownerUserId);
    assert.equal(productionHeaderAttempt.status, 401);
    assert.equal(productionHeaderAttempt.body?.code, "OPERATOR_AUTH_REQUIRED");
  } finally {
    process.env.NODE_ENV = "test";
  }

  const signedOut = await request("/admin/operators");
  assert.equal(signedOut.status, 401);
  assert.equal(signedOut.body?.code, "OPERATOR_AUTH_REQUIRED");

  const ordinaryOperatorRoute = await request("/quickex/admin/credentials", {}, ordinaryUserId);
  assert.equal(ordinaryOperatorRoute.status, 403);
  assert.equal(ordinaryOperatorRoute.body?.code, "OPERATOR_ACCESS_DENIED");

  const ordinaryOwnerRoute = await request("/admin/operators", {}, ordinaryUserId);
  assert.equal(ordinaryOwnerRoute.status, 403);
  assert.equal(ordinaryOwnerRoute.body?.code, "OPERATOR_ACCESS_DENIED");

  const operatorRoute = await request("/quickex/admin/credentials", {}, operatorUserId);
  assert.equal(operatorRoute.status, 200);
  assert.equal(operatorRoute.body?.canManage, false);
  assert.equal(Object.hasOwn(operatorRoute.body ?? {}, "publicKey"), false);
  assert.equal(Object.hasOwn(operatorRoute.body ?? {}, "secretKey"), false);

  const operatorIntegrationWrite = await request(
    "/quickex/admin/credentials",
    {
      method: "PUT",
      body: JSON.stringify({
        publicKey: "operator-public-key",
        secretKey: "operator-secret-key",
      }),
    },
    operatorUserId,
  );
  assert.equal(operatorIntegrationWrite.status, 403);
  assert.equal(operatorIntegrationWrite.body?.code, "OWNER_ACCESS_REQUIRED");

  const operatorCredentialTest = await request(
    "/quickex/admin/credentials/test",
    { method: "POST", body: JSON.stringify({}) },
    operatorUserId,
  );
  assert.equal(operatorCredentialTest.status, 403);
  assert.equal(operatorCredentialTest.body?.code, "OWNER_ACCESS_REQUIRED");

  const operatorOwnerRoute = await request("/admin/operators", {}, operatorUserId);
  assert.equal(operatorOwnerRoute.status, 403);
  assert.equal(operatorOwnerRoute.body?.code, "PERMISSION_ACCESS_DENIED");

  const ownerRoute = await request("/admin/operators", {}, ownerUserId);
  assert.equal(ownerRoute.status, 200);
  assert.ok(Array.isArray(ownerRoute.body));

  const ownerIntegrationStatus = await request(
    "/quickex/admin/credentials",
    {},
    ownerUserId,
  );
  assert.equal(ownerIntegrationStatus.status, 200);
  assert.equal(ownerIntegrationStatus.body?.canManage, true);
});

test("active operators without a verified authenticator receive a distinct denial and one bounded audit event", async () => {
  const userId = `user_mfa_required_${randomUUID()}`;
  const operator = await seedOperator({ clerkUserId: userId, role: "operator" });
  verifiedSecondFactors.set(userId, false);
  try {
    const first = await request("/quickex/admin/credentials", {}, userId);
    assert.equal(first.status, 403);
    assert.equal(first.body?.code, "ADMIN_MFA_REQUIRED");

    const second = await request("/quickex/admin/credentials", {}, userId);
    assert.equal(second.status, 403);
    assert.equal(second.body?.code, "ADMIN_MFA_REQUIRED");
    await assertOneAudit(operator.id, "security.mfa_required");
    const [mfaAudit] = await database.db
      .select({ details: database.operatorAuditLogsTable.details })
      .from(database.operatorAuditLogsTable)
      .where(and(
        eq(database.operatorAuditLogsTable.targetOperatorId, operator.id),
        eq(database.operatorAuditLogsTable.action, "security.mfa_required"),
      ));
    assert.deepEqual(mfaAudit?.details, { reason: "totp_not_verified" });

    const customerRoute = await request("/account/orders", {}, `ordinary_customer_${randomUUID()}`);
    assert.equal(customerRoute.status, 200);
  } finally {
    verifiedSecondFactors.delete(userId);
  }
});

test("active operators without an enrolled authenticator receive the enrollment-specific denial", async () => {
  const userId = `user_mfa_enrollment_required_${randomUUID()}`;
  await seedOperator({ clerkUserId: userId, role: "operator" });
  totpEnrollments.set(userId, false);
  try {
    const response = await request("/quickex/admin/credentials", {}, userId);
    assert.equal(response.status, 403);
    assert.equal(response.body?.code, "ADMIN_MFA_ENROLLMENT_REQUIRED");
  } finally {
    totpEnrollments.delete(userId);
  }
});

test("operator authorization reports registry outages as retryable unavailability", async () => {
  const userId = `user_unavailable_${randomUUID()}`;
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: async () => {
      throw new Error("simulated Clerk outage");
    },
  });

  try {
    const response = await request("/quickex/admin/credentials", {}, userId);
    assert.equal(response.status, 503);
    assert.equal(response.body?.code, "OPERATOR_AUTH_UNAVAILABLE");
    assert.equal(response.body?.retryable, true);
  } finally {
    operatorAuth.configureOperatorAuthorizationForTests({
      getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
      getVerifiedEmail: (candidateUserId) => verifiedEmails.get(candidateUserId) ?? null,
    });
  }
});

test("payment method field schemas reject credential collection and remain operator-only", async () => {
  const operatorUserId = `user_payment_method_operator_${randomUUID()}`;
  await seedOperator({ clerkUserId: operatorUserId, role: "owner" });
  const base = {
    id: `safe-method-${randomUUID()}`,
    name: "Safe method",
    enabled: true,
    canSend: true,
    canReceive: true,
  };
  const signedOut = await request("/admin/payment-methods", {
    method: "POST",
    body: JSON.stringify({ ...base, fieldDefinitions: [] }),
  });
  assert.equal(signedOut.status, 401);

  for (const unsafe of [
    { key: "account_password", label: "Account value" },
    { key: "account_value", label: "Security code" },
    { key: "account_value", label: "Account value", help: "Enter recovery phrase" },
  ]) {
    const rejected = await request("/admin/payment-methods", {
      method: "POST",
      body: JSON.stringify({
        ...base,
        id: `${base.id}-${randomUUID()}`,
        fieldDefinitions: [{ ...unsafe, type: "text", required: true }],
      }),
    }, operatorUserId);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body?.code, "UNSAFE_SETTLEMENT_FIELD");
  }

  const created = await request("/admin/payment-methods", {
    method: "POST",
    body: JSON.stringify({
      ...base,
      fieldDefinitions: [{
        key: "account_id",
        type: "text",
        label: "Account ID",
        required: true,
        min: 3,
        max: 40,
        pattern: "^[A-Za-z0-9-]+$",
      }],
    }),
  }, operatorUserId);
  assert.equal(created.status, 201);
  createdPaymentMethodIds.add(base.id);
  const unsupportedUpload = await request("/admin/payment-methods/logo-upload", {
    method: "POST",
    body: JSON.stringify({ name: "unsafe.gif", contentType: "image/gif", size: 100 }),
  }, operatorUserId);
  assert.equal(unsupportedUpload.status, 400);
});

test("concurrent admin catalog reads await the complete global baseline", async () => {
  const operatorUserId = `user_catalog_operator_${randomUUID()}`;
  await seedOperator({ clerkUserId: operatorUserId, role: "owner" });
  const [assets, networks, methods, attachments] = await Promise.all([
    request("/admin/crypto-assets", {}, operatorUserId),
    request("/admin/crypto-networks", {}, operatorUserId),
    request("/admin/payment-methods", {}, operatorUserId),
    request("/admin/fiat-currency-payment-methods", {}, operatorUserId),
  ]);
  for (const response of [assets, networks, methods, attachments]) {
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body));
    assert.ok(response.body.length > 0);
  }
  assert.ok(assets.body.some((asset: { code?: string }) => asset.code === "BTC"));
  assert.ok(networks.body.some((network: { id?: string }) => network.id === "usdt-trc20"));
  assert.ok(methods.body.some((method: { id?: string }) => method.id === "swift-bank-transfer"));
  assert.ok(attachments.body.some((attachment: { paymentMethodId?: string }) =>
    attachment.paymentMethodId === "visa-kzt"));
});

test("operator bulk payment-method preview and apply are bounded, fenced, partial, and audited", async () => {
  const operatorUserId = `user_bulk_payment_operator_${randomUUID()}`;
  const operator = await seedOperator({ clerkUserId: operatorUserId, role: "operator" });
  const methodId = `bulk-method-${randomUUID()}`;
  const region = `Bulk-${randomUUID().slice(0, 12)}`;
  createdPaymentMethodIds.add(methodId);
  await database.db.insert(database.paymentMethodsTable).values({
    id: methodId,
    name: "Bulk test method",
    enabled: true,
    canSend: true,
    canReceive: true,
  });
  const usedCurrencyCodes = new Set(
    (await database.db.select({ code: database.fiatCurrenciesTable.code })
      .from(database.fiatCurrenciesTable))
      .map((currency) => currency.code),
  );
  const availableCurrencyCodes: string[] = [];
  for (let index = 0; index < 26 ** 3 && availableCurrencyCodes.length < 3; index += 1) {
    const code = [
      Math.floor(index / (26 ** 2)),
      Math.floor(index / 26) % 26,
      index % 26,
    ].map((value) => String.fromCharCode(65 + value)).join("");
    if (!usedCurrencyCodes.has(code)) availableCurrencyCodes.push(code);
  }
  assert.equal(availableCurrencyCodes.length, 3);
  const currencies = await database.db.insert(database.fiatCurrenciesTable).values([
    { code: availableCurrencyCodes[0], name: "Bulk one", regions: [region] },
    { code: availableCurrencyCodes[1], name: "Bulk two", regions: [region] },
    { code: availableCurrencyCodes[2], name: "Bulk three", regions: [region] },
  ]).returning();
  const currencyIds = currencies.map((currency) => currency.id);

  const operatorPreview = await request("/admin/fiat-currency-payment-methods/bulk/preview", {
    method: "POST",
    body: JSON.stringify({ region, paymentMethodId: methodId, action: "attach" }),
  }, operatorUserId);
  assert.equal(operatorPreview.status, 200);

  const duplicate = await request("/admin/fiat-currency-payment-methods/bulk/preview", {
    method: "POST",
    body: JSON.stringify({
      currencyIds: [currencyIds[0], currencyIds[0]],
      paymentMethodId: methodId,
      action: "attach",
    }),
  }, operatorUserId);
  assert.equal(duplicate.status, 400);

  const emptyUpdate = await request("/admin/fiat-currency-payment-methods/bulk/preview", {
    method: "POST",
    body: JSON.stringify({
      currencyIds: [currencyIds[0]],
      paymentMethodId: methodId,
      action: "update",
      overrides: {},
    }),
  }, operatorUserId);
  assert.equal(emptyUpdate.status, 400);

  const oversized = await request("/admin/fiat-currency-payment-methods/bulk/preview", {
    method: "POST",
    body: JSON.stringify({
      currencyIds: Array.from({ length: 101 }, () => randomUUID()),
      paymentMethodId: methodId,
      action: "attach",
    }),
  }, operatorUserId);
  assert.equal(oversized.status, 400);

  const preview = await request("/admin/fiat-currency-payment-methods/bulk/preview", {
    method: "POST",
    body: JSON.stringify({
      region,
      paymentMethodId: methodId,
      action: "attach",
      overrides: { canSend: false, minAmount: "10", maxAmount: "500" },
    }),
  }, operatorUserId);
  assert.equal(preview.status, 200);
  assert.equal(preview.body?.affectedCount, 3);
  const reviewed = preview.body?.items as Array<Record<string, unknown>>;
  assert.ok(reviewed.every((item) => item.direction === "receive"));
  assert.ok(reviewed.every((item) => item.minAmount === "10" && item.maxAmount === "500"));

  await database.db.insert(database.fiatCurrencyPaymentMethodsTable).values({
    fiatCurrencyId: currencyIds[1],
    paymentMethodId: methodId,
    enabled: true,
  });
  let releaseRegionChange = () => {};
  let regionChangeStarted = () => {};
  const waitForRegionChange = new Promise<void>((resolve) => {
    regionChangeStarted = resolve;
  });
  const holdRegionChange = new Promise<void>((resolve) => {
    releaseRegionChange = resolve;
  });
  const regionChange = database.db.transaction(async (tx) => {
    await tx.update(database.fiatCurrenciesTable)
      .set({ regions: [] })
      .where(eq(database.fiatCurrenciesTable.id, currencyIds[2]));
    regionChangeStarted();
    await holdRegionChange;
  });
  await waitForRegionChange;
  const removedRegionItem = reviewed.find((item) => item.fiatCurrencyId === currencyIds[2]);
  assert.ok(removedRegionItem);
  const applyRequest = request("/admin/fiat-currency-payment-methods/bulk/apply", {
    method: "POST",
    body: JSON.stringify({
      region,
      paymentMethodId: methodId,
      action: "attach",
      overrides: { canSend: false, minAmount: "10", maxAmount: "500" },
      items: [removedRegionItem, ...reviewed.filter((item) => item !== removedRegionItem)].map((item) => ({
        fiatCurrencyId: item.fiatCurrencyId,
        expectedUpdatedAt: item.expectedUpdatedAt,
      })),
    }),
  }, operatorUserId);
  let waitedOnCurrencyLock = false;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const activity = await database.db.execute(sql`
        select count(*)::int as count
        from pg_stat_activity
        where datname = current_database()
          and wait_event_type = 'Lock'
          and pid <> pg_backend_pid()
      `);
      if (Number(activity.rows[0]?.count ?? 0) > 0) {
        waitedOnCurrencyLock = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    releaseRegionChange();
  }
  await regionChange;
  assert.equal(waitedOnCurrencyLock, true);
  const applied = await applyRequest;
  assert.equal(applied.status, 200);
  const results = applied.body?.results as Array<Record<string, unknown>>;
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => !result.success).length, 2);
  assert.equal(
    results.find((result) => result.fiatCurrencyId === currencyIds[2])?.code,
    "BULK_PAYMENT_REGION_CHANGED",
  );

  const stored = await database.db.select().from(database.fiatCurrencyPaymentMethodsTable)
    .where(and(
      eq(database.fiatCurrencyPaymentMethodsTable.fiatCurrencyId, currencyIds[0]),
      eq(database.fiatCurrencyPaymentMethodsTable.paymentMethodId, methodId),
    ));
  assert.equal(stored[0]?.canSend, false);
  const audits = await database.db.select().from(database.operatorAuditLogsTable)
    .where(and(
      eq(database.operatorAuditLogsTable.targetOperatorId, operator.id),
      eq(database.operatorAuditLogsTable.action, "payment_method_attachment.bulk_updated"),
    ));
  assert.equal(audits.length, 1);
  await database.db.delete(database.fiatCurrenciesTable)
    .where(inArray(database.fiatCurrenciesTable.id, currencyIds));
});

test("customer history is session-owned, paged, and strictly customer-safe", async () => {
  const customerA = `user_customer_a_${randomUUID()}`;
  const customerB = `user_customer_b_${randomUUID()}`;
  const verifiedCustomerEmail = uniqueEmail("verified-customer");
  const signedInOrderRequest = manualOrderRequest("untrusted-body-email");
  const signedOut = await request("/account/orders");
  assert.equal(signedOut.status, 401);
  assert.equal(signedOut.body?.code, "CUSTOMER_AUTH_REQUIRED");

  const unverifiedCreate = await request(
    "/orders",
    { method: "POST", body: JSON.stringify(signedInOrderRequest) },
    customerA,
  );
  assert.equal(unverifiedCreate.status, 422);
  assert.equal(
    unverifiedCreate.body?.code,
    "CUSTOMER_VERIFIED_EMAIL_REQUIRED",
  );

  verifiedEmails.set(customerA, verifiedCustomerEmail);
  createdCustomerEmails.add(verifiedCustomerEmail);
  const { customerEmail: submittedEmail, ...orderWithoutContactEmail } =
    signedInOrderRequest;
  assert.notEqual(submittedEmail, verifiedCustomerEmail);
  const created = await request(
    "/orders",
    { method: "POST", body: JSON.stringify(orderWithoutContactEmail) },
    customerA,
  );
  assert.equal(created.status, 201);
  const createdId = String(created.body?.id);
  createdOrderIds.add(createdId);
  assert.equal(Object.hasOwn(created.body ?? {}, "customerClerkUserId"), false);
  assert.equal(Object.hasOwn(created.body ?? {}, "customerOwnershipSource"), false);
  assert.equal(Object.hasOwn(created.body ?? {}, "customerClaimedAt"), false);
  const [storedCreated] = await database.db
    .select({ customerEmail: database.ordersTable.customerEmail })
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, createdId));
  assert.equal(storedCreated.customerEmail, verifiedCustomerEmail);

  const other = await seedOrder({ customerClerkUserId: customerB });
  const quickexOrder = await seedQuickexOrder(customerA);
  const history = await request("/account/orders?page=1&pageSize=10", {}, customerA);
  assert.equal(history.status, 200);
  assert.equal(history.body?.page, 1);
  assert.equal(history.body?.pageSize, 10);
  const items = history.body?.items as Array<Record<string, unknown>>;
  assert.equal(items.some((item) => item.id === createdId), true);
  assert.equal(items.some((item) => item.id === quickexOrder.legacyOrderId), true);
  assert.equal(items.some((item) => item.id === other.id), false);

  const quickexDetail = await request(
    `/account/orders/${quickexOrder.legacyOrderId}`,
    {},
    customerA,
  );
  assert.equal(quickexDetail.status, 200);
  assert.equal(quickexDetail.body?.id, quickexOrder.legacyOrderId);
  assert.equal(quickexDetail.body?.type, "instant");
  assert.equal(Object.hasOwn(quickexDetail.body ?? {}, "providerReference"), false);

  const detail = await request(`/account/orders/${createdId}`, {}, customerA);
  assert.equal(detail.status, 200);
  assert.deepEqual(
    Object.keys(detail.body ?? {}).sort(),
    [
      "amount",
      "createdAt",
      "fromAsset",
      "fromNetwork",
      "id",
        "manualSettlementState",
      "outcomeUnknown",
      "receiveAmount",
      "refreshUnavailable",
      "status",
      "statusNotificationsEnabled",
      "toAsset",
      "toNetwork",
      "trackingToken",
      "type",
    ].sort(),
  );
  for (const privateField of [
    "customerEmail",
    "customerName",
    "customerClerkUserId",
    "destinationAddress",
    "destinationMemo",
    "refundAddress",
    "refundMemo",
    "depositAddress",
    "depositMemo",
    "paymentMethod",
    "payoutMethod",
    "provider",
    "providerReference",
    "providerOrderId",
    "providerState",
    "note",
    "errorCode",
    "errorMessage",
  ]) {
    assert.equal(
      Object.hasOwn(detail.body ?? {}, privateField),
      false,
      `customer detail leaked ${privateField}`,
    );
  }

  const isolated = await request(`/account/orders/${other.id}`, {}, customerA);
  assert.equal(isolated.status, 404);
  assert.equal(isolated.body?.code, "CUSTOMER_ORDER_NOT_FOUND");

  const publiclyTracked = await request(`/orders/${other.id}/status`);
  assert.equal(publiclyTracked.status, 200);
  assert.equal(Object.hasOwn(publiclyTracked.body ?? {}, "customerClerkUserId"), false);
  assert.equal(Object.hasOwn(publiclyTracked.body ?? {}, "customerEmail"), false);
});

test("customer history unions owned manual and Convert orders with shared pagination and isolation", async () => {
  const customer = `user_customer_union_${randomUUID()}`;
  const foreignCustomer = `user_customer_union_foreign_${randomUUID()}`;
  const times = {
    manualOld: new Date("2024-01-01T00:00:00.000Z"),
    convertOld: new Date("2024-01-02T00:00:00.000Z"),
    manualNew: new Date("2024-01-03T00:00:00.000Z"),
    convertNew: new Date("2024-01-04T00:00:00.000Z"),
  };
  const manualOld = await seedOrder({
    customerClerkUserId: customer,
    createdAt: times.manualOld,
  });
  const convertOld = await seedQuickexOrder(customer, { createdAt: times.convertOld });
  const manualNew = await seedOrder({
    customerClerkUserId: customer,
    createdAt: times.manualNew,
  });
  const convertNew = await seedQuickexOrder(customer, { createdAt: times.convertNew });
  const foreignManual = await seedOrder({
    customerClerkUserId: foreignCustomer,
    createdAt: new Date("2024-01-05T00:00:00.000Z"),
  });
  const foreignConvert = await seedQuickexOrder(foreignCustomer, {
    createdAt: new Date("2024-01-06T00:00:00.000Z"),
  });

  const firstPage = await request(
    "/account/orders?page=1&pageSize=2",
    {},
    customer,
  );
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body?.total, 4);
  assert.deepEqual(
    (firstPage.body?.items as Array<Record<string, unknown>>).map((item) => item.id),
    [convertNew.legacyOrderId, manualNew.id],
  );

  const secondPage = await request(
    "/account/orders?page=2&pageSize=2",
    {},
    customer,
  );
  assert.equal(secondPage.status, 200);
  assert.deepEqual(
    (secondPage.body?.items as Array<Record<string, unknown>>).map((item) => item.id),
    [convertOld.legacyOrderId, manualOld.id],
  );
  for (const page of [firstPage, secondPage]) {
    const items = page.body?.items as Array<Record<string, unknown>>;
    assert.equal(items.some((item) => item.id === foreignManual.id), false);
    assert.equal(items.some((item) => item.id === foreignConvert.legacyOrderId), false);
    for (const item of items) {
      assert.equal(typeof item.trackingToken, "string");
      assert.equal(Object.hasOwn(item, "customerEmail"), false);
      assert.equal(Object.hasOwn(item, "providerReference"), false);
    }
  }

  for (const id of [
    manualOld.id,
    manualNew.id,
    convertOld.legacyOrderId,
    convertNew.legacyOrderId,
  ]) {
    const detail = await request(`/account/orders/${id}`, {}, customer);
    assert.equal(detail.status, 200);
    assert.equal(detail.body?.id, id);
  }
  for (const id of [foreignManual.id, foreignConvert.legacyOrderId]) {
    const detail = await request(`/account/orders/${id}`, {}, customer);
    assert.equal(detail.status, 404);
    assert.equal(detail.body?.code, "CUSTOMER_ORDER_NOT_FOUND");
  }
});

test("anonymous orders stay public and can be claimed exactly once without ownership disclosure", async () => {
  const operatorUserId = `user_anonymous_order_operator_${randomUUID()}`;
  const operator = await seedOperator({
    clerkUserId: operatorUserId,
    role: "operator",
  });
  const anonymousWithoutEmail = manualOrderRequest("missing-anonymous-email");
  delete (anonymousWithoutEmail as { customerEmail?: string }).customerEmail;
  const missingContact = await request(
    "/orders",
    { method: "POST", body: JSON.stringify(anonymousWithoutEmail) },
  );
  assert.equal(missingContact.status, 400);
  assert.equal(missingContact.body?.code, "CUSTOMER_EMAIL_REQUIRED");

  const anonymousCreate = await request(
    "/orders",
    { method: "POST", body: JSON.stringify(manualOrderRequest("anonymous-create")) },
  );
  assert.equal(anonymousCreate.status, 201);
  const anonymousId = String(anonymousCreate.body?.id);
  createdOrderIds.add(anonymousId);
  const [anonymousStored] = await database.db
    .select()
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, anonymousId));
  assert.equal(anonymousStored.customerClerkUserId, null);

  const operatorDirectory = await request(
    `/orders?${new URLSearchParams({
      type: "manual",
      search: anonymousId,
    })}`,
    {},
    operatorUserId,
  );
  assert.equal(operatorDirectory.status, 200);
  assert.equal(operatorDirectory.body?.total, 1);
  assert.equal(operatorDirectory.body?.items?.[0]?.id, anonymousId);
  assert.equal(operatorDirectory.body?.items?.[0]?.customerRegistered, false);

  const paymentConfirmed = await request(
    `/orders/${anonymousId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        recordVersion: anonymousStored.recordVersion,
        manualSettlementState: "funds_confirmed",
      }),
    },
    operatorUserId,
  );
  assert.equal(paymentConfirmed.status, 200);
  assert.equal(paymentConfirmed.body?.manualSettlementState, "funds_confirmed");
  assert.equal(paymentConfirmed.body?.status, "processing");
  assert.equal(paymentConfirmed.body?.assignedOperatorId, operator.id);

  const publicStatus = await request(`/orders/${anonymousId}/status`);
  assert.equal(publicStatus.status, 200);
  assert.equal(publicStatus.body?.id, anonymousId);
  assert.equal(publicStatus.body?.status, "processing");

  const customerA = `user_claim_a_${randomUUID()}`;
  const customerB = `user_claim_b_${randomUUID()}`;
  verifiedEmails.set(customerA, anonymousStored.customerEmail.toUpperCase());
  verifiedEmails.set(customerB, uniqueEmail("wrong-claim-email"));
  const claimResults = await Promise.all([
    request(
      "/account/orders/claim",
      { method: "POST", body: JSON.stringify({ orderId: anonymousId }) },
      customerA,
    ),
    request(
      "/account/orders/claim",
      { method: "POST", body: JSON.stringify({ orderId: anonymousId }) },
      customerB,
    ),
  ]);
  assert.deepEqual(
    claimResults.map((result) => result.status).sort(),
    [200, 404],
  );
  const loser = claimResults.find((result) => result.status === 404);
  assert.deepEqual(loser?.body, {
    error: "This order reference is invalid or unavailable.",
    code: "ORDER_CLAIM_UNAVAILABLE",
    retryable: false,
    outcomeUnknown: false,
  });

  const unavailable = await request(
    "/account/orders/claim",
    {
      method: "POST",
      body: JSON.stringify({ orderId: `QX-${randomUUID()}` }),
    },
    loser === claimResults[0] ? customerA : customerB,
  );
  assert.equal(unavailable.status, 404);
  assert.deepEqual(unavailable.body, loser?.body);

  const [claimed] = await database.db
    .select()
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, anonymousId));
  assert.ok(
    claimed.customerClerkUserId === customerA ||
      claimed.customerClerkUserId === customerB,
  );
  assert.equal(claimed.customerOwnershipSource, "verified_email_claim");
  assert.ok(claimed.customerClaimedAt);
});

test("simultaneous operators atomically claim one unassigned Swap order", async () => {
  const firstUserId = `user_claim_race_first_${randomUUID()}`;
  const secondUserId = `user_claim_race_second_${randomUUID()}`;
  const [firstOperator, secondOperator] = await Promise.all([
    seedOperator({ clerkUserId: firstUserId, role: "operator" }),
    seedOperator({ clerkUserId: secondUserId, role: "operator" }),
  ]);
  const order = await seedOrder({ status: "awaiting funds" });
  await database.db
    .update(database.ordersTable)
    .set({ manualSettlementState: "awaiting_funds" })
    .where(eq(database.ordersTable.id, order.id));

  const input = JSON.stringify({
    recordVersion: order.recordVersion,
    manualSettlementState: "funds_confirmed",
  });
  const results = await Promise.all([
    request(`/orders/${order.id}`, { method: "PATCH", body: input }, firstUserId),
    request(`/orders/${order.id}`, { method: "PATCH", body: input }, secondUserId),
  ]);
  assert.deepEqual(
    results.map((result) => result.status).sort((a, b) => a - b),
    [200, 409],
  );

  const successful = results.find((result) => result.status === 200);
  assert.ok(successful);
  const winningOperatorId = successful.body?.assignedOperatorId;
  assert.ok(
    winningOperatorId === firstOperator.id ||
      winningOperatorId === secondOperator.id,
  );
  const losingOperatorUserId =
    winningOperatorId === firstOperator.id ? secondUserId : firstUserId;

  const [stored] = await database.db
    .select()
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, order.id));
  assert.equal(stored.assignedOperatorId, winningOperatorId);
  assert.equal(stored.manualSettlementState, "funds_confirmed");

  const auditRows = await database.db
    .select()
    .from(database.orderAuditLogsTable)
    .where(eq(database.orderAuditLogsTable.orderId, order.id));
  assert.equal(auditRows.length, 1);
  assert.equal(
    (auditRows[0]?.details as Record<string, unknown>)
      .operatorClaimedUnassignedOrder,
    true,
  );

  const losingOperatorRetry = await request(
    `/orders/${order.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        recordVersion: stored.recordVersion,
        manualSettlementState: "payout_processing",
      }),
    },
    losingOperatorUserId,
  );
  assert.equal(losingOperatorRetry.status, 403);
  assert.equal(losingOperatorRetry.body?.code, "ORDER_STATUS_ACCESS_DENIED");
});

test("guest Convert orders are Admin-visible with status-only operator overrides", async () => {
  const operatorUserId = `user_guest_convert_operator_${randomUUID()}`;
  const ownerUserId = `user_guest_convert_owner_${randomUUID()}`;
  const [operator] = await Promise.all([
    seedOperator({ clerkUserId: operatorUserId, role: "operator" }),
    seedOperator({ clerkUserId: ownerUserId, role: "owner" }),
  ]);
  const convertOrder = await seedQuickexOrder(null);

  const directory = await request(
    `/orders?${new URLSearchParams({
      type: "instant",
      search: convertOrder.legacyOrderId,
    })}`,
    {},
    operatorUserId,
  );
  assert.equal(directory.status, 200);
  assert.equal(directory.body?.total, 1);
  assert.equal(directory.body?.items?.[0]?.id, convertOrder.legacyOrderId);
  assert.equal(directory.body?.items?.[0]?.customerRegistered, false);
  assert.equal(directory.body?.items?.[0]?.provider, "Quickex");

  const directStatusMutation = await request(
    `/orders/${convertOrder.legacyOrderId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        recordVersion: convertOrder.recordVersion,
        status: "processing",
      }),
    },
    operatorUserId,
  );
  assert.equal(directStatusMutation.status, 200);
  assert.equal(directStatusMutation.body?.id, convertOrder.legacyOrderId);
  assert.equal(directStatusMutation.body?.status, "processing");
  const [overriddenConvertOrder] = await database.db.select()
    .from(database.quickexOrdersTable)
    .where(eq(database.quickexOrdersTable.legacyOrderId, convertOrder.legacyOrderId))
    .limit(1);
  assert.equal(overriddenConvertOrder?.recordVersion, convertOrder.recordVersion + 1);
  assert.match(overriddenConvertOrder?.providerState ?? "", /^admin_status_override:/);

  const bulkStatusMutation = await request(
    "/orders/bulk/status",
    {
      method: "POST",
      body: JSON.stringify({
        items: [{
          id: convertOrder.legacyOrderId,
          recordVersion: convertOrder.recordVersion,
        }],
        manualSettlementState: "funds_confirmed",
      }),
    },
    operatorUserId,
  );
  assert.equal(bulkStatusMutation.status, 200);
  assert.equal(bulkStatusMutation.body?.results?.[0]?.success, false);
  assert.equal(
    bulkStatusMutation.body?.results?.[0]?.code,
    "PROVIDER_ORDER_READ_ONLY",
  );

  const assignmentMutation = await request(
    `/orders/${convertOrder.legacyOrderId}/assignment`,
    {
      method: "POST",
      body: JSON.stringify({
        recordVersion: convertOrder.recordVersion,
        assigneeOperatorId: operator.id,
      }),
    },
    ownerUserId,
  );
  assert.equal(assignmentMutation.status, 409);
  assert.equal(assignmentMutation.body?.code, "PROVIDER_ORDER_READ_ONLY");

  const archiveMutation = await request(
    `/orders/${convertOrder.legacyOrderId}/archive`,
    {
      method: "POST",
      body: JSON.stringify({ recordVersion: convertOrder.recordVersion }),
    },
    ownerUserId,
  );
  assert.equal(archiveMutation.status, 409);
  assert.equal(archiveMutation.body?.code, "PROVIDER_ORDER_READ_ONLY");
});

test("customers control deduplicated, customer-safe status notifications for only their own orders", async () => {
  const customerUserId = `user_notifications_${randomUUID()}`;
  const otherCustomerUserId = `user_notifications_other_${randomUUID()}`;
  const operatorUserId = `user_notifications_operator_${randomUUID()}`;
  const verifiedSecondaryEmail = uniqueEmail("notification-recipient");
  const selectedVerifiedEmail = customerAuth.selectCustomerVerifiedEmail({
    primaryEmailAddressId: "primary-unverified",
    emailAddresses: [
      {
        id: "primary-unverified",
        emailAddress: uniqueEmail("unverified-primary"),
        verification: { status: "unverified" },
      },
      {
        id: "secondary-verified",
        emailAddress: verifiedSecondaryEmail.toUpperCase(),
        verification: { status: "verified" },
      },
    ],
  });
  assert.equal(selectedVerifiedEmail, verifiedSecondaryEmail);
  verifiedEmails.set(customerUserId, selectedVerifiedEmail);
  await seedOperator({ clerkUserId: operatorUserId, role: "owner" });
  const order = await seedOrder({
    customerClerkUserId: customerUserId,
    status: "pending",
  });

  const signedOut = await request(
    `/account/orders/${order.id}/notifications`,
    { method: "PATCH", body: JSON.stringify({ enabled: true }) },
  );
  assert.equal(signedOut.status, 401);

  const isolated = await request(
    `/account/orders/${order.id}/notifications`,
    { method: "PATCH", body: JSON.stringify({ enabled: true }) },
    otherCustomerUserId,
  );
  assert.equal(isolated.status, 404);
  assert.equal(isolated.body?.code, "CUSTOMER_ORDER_NOT_FOUND");

  const enabled = await request(
    `/account/orders/${order.id}/notifications`,
    { method: "PATCH", body: JSON.stringify({ enabled: true }) },
    customerUserId,
  );
  assert.equal(enabled.status, 200);
  assert.deepEqual(enabled.body, {
    orderId: order.id,
    statusNotificationsEnabled: true,
  });

  const detail = await request(
    `/account/orders/${order.id}`,
    {},
    customerUserId,
  );
  assert.equal(detail.status, 200);
  assert.equal(detail.body?.statusNotificationsEnabled, true);

  const deliveryStart = deliveredCustomerNotifications.length;
  const processing = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "processing" }) },
    operatorUserId,
  );
  assert.equal(processing.status, 200);

  const duplicatePollEquivalent = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "processing" }) },
    operatorUserId,
  );
  assert.equal(duplicatePollEquivalent.status, 200);
  assert.equal(await customerNotifications.processCustomerStatusNotificationOutbox(), 1);
  assert.equal(await customerNotifications.processCustomerStatusNotificationOutbox(), 0);

  const delivered = deliveredCustomerNotifications.slice(deliveryStart);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0]?.orderId, order.id);
  assert.equal(delivered[0]?.recipientEmail, verifiedSecondaryEmail);
  assert.equal(delivered[0]?.fromStatus, "pending");
  assert.equal(delivered[0]?.status, "processing");
  const content = customerNotifications.buildCustomerStatusNotificationContent(
    delivered[0]!,
  );
  const customerMessage = JSON.stringify(content);
  for (const privateValue of [
    "private-destination-wallet",
    "private-destination-memo",
    "private-refund-wallet",
    "private-refund-memo",
    "private-deposit-wallet",
    "private-deposit-memo",
    "private-provider-reference",
    "private-provider-order-id",
    "private-provider-state",
    "private operator note",
    "private raw error",
  ]) {
    assert.equal(
      customerMessage.includes(privateValue),
      false,
      `notification leaked ${privateValue}`,
    );
  }

  const events = await database.db
    .select()
    .from(database.customerStatusNotificationEventsTable)
    .where(eq(database.customerStatusNotificationEventsTable.orderId, order.id));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.deliveryStatus, "delivered");
  assert.equal(events[0]?.statusVersion, 1);

  const returnedToPending = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "pending" }) },
    operatorUserId,
  );
  assert.equal(returnedToPending.status, 200);
  const [pendingEvent] = await database.db
    .select()
    .from(database.customerStatusNotificationEventsTable)
    .where(
      and(
        eq(database.customerStatusNotificationEventsTable.orderId, order.id),
        eq(database.customerStatusNotificationEventsTable.statusVersion, 2),
      ),
    );
  assert.ok(pendingEvent);
  await database.db
    .update(database.customerStatusNotificationEventsTable)
    .set({
      deliveryStatus: "sending",
      claimExpiresAt: new Date(Date.now() - 1_000),
    })
    .where(eq(database.customerStatusNotificationEventsTable.id, pendingEvent.id));
  assert.equal(await customerNotifications.processCustomerStatusNotificationOutbox(), 1);

  const processingAgain = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "processing" }) },
    operatorUserId,
  );
  assert.equal(processingAgain.status, 200);
  const competingWorkers = await Promise.all([
    customerNotifications.processCustomerStatusNotificationOutbox(),
    customerNotifications.processCustomerStatusNotificationOutbox(),
  ]);
  assert.equal(competingWorkers.reduce((sum, count) => sum + count, 0), 1);
  const cycledEvents = await database.db
    .select()
    .from(database.customerStatusNotificationEventsTable)
    .where(eq(database.customerStatusNotificationEventsTable.orderId, order.id));
  assert.equal(cycledEvents.length, 3);
  assert.deepEqual(
    cycledEvents.map((event) => event.statusVersion).sort((a, b) => a - b),
    [1, 2, 3],
  );
  assert.equal(
    cycledEvents.filter((event) => event.toStatus === "processing").length,
    2,
  );
  assert.equal(deliveredCustomerNotifications.length, deliveryStart + 3);

  verifiedEmails.delete(customerUserId);
  const noLongerVerified = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "on hold" }) },
    operatorUserId,
  );
  assert.equal(noLongerVerified.status, 200);
  assert.equal(await customerNotifications.processCustomerStatusNotificationOutbox(), 0);
  const [suppressedAfterVerificationChange] = await database.db
    .select()
    .from(database.customerStatusNotificationEventsTable)
    .where(
      and(
        eq(database.customerStatusNotificationEventsTable.orderId, order.id),
        eq(database.customerStatusNotificationEventsTable.statusVersion, 4),
      ),
    );
  assert.equal(suppressedAfterVerificationChange.deliveryStatus, "suppressed");
  assert.equal(
    suppressedAfterVerificationChange.lastErrorCode,
    "CUSTOMER_VERIFIED_EMAIL_MISSING",
  );
  assert.equal(deliveredCustomerNotifications.length, deliveryStart + 3);
  verifiedEmails.set(customerUserId, verifiedSecondaryEmail);

  const disabled = await request(
    `/account/orders/${order.id}/notifications`,
    { method: "PATCH", body: JSON.stringify({ enabled: false }) },
    customerUserId,
  );
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body?.statusNotificationsEnabled, false);
  const completed = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "completed" }) },
    operatorUserId,
  );
  assert.equal(completed.status, 200);
  assert.equal(await customerNotifications.processCustomerStatusNotificationOutbox(), 0);
  assert.equal(deliveredCustomerNotifications.length, deliveryStart + 3);

  const anonymous = await seedOrder({ status: "pending" });
  const anonymousUpdated = await request(
    `/orders/${anonymous.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "processing" }) },
    operatorUserId,
  );
  assert.equal(anonymousUpdated.status, 200);
  const anonymousEvents = await database.db
    .select()
    .from(database.customerStatusNotificationEventsTable)
    .where(eq(database.customerStatusNotificationEventsTable.orderId, anonymous.id));
  assert.equal(anonymousEvents.length, 0);
  const [anonymousStored] = await database.db
    .select()
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, anonymous.id));
  assert.equal(anonymousStored.customerClerkUserId, null);
  assert.equal(anonymousStored.statusNotificationsEnabled, false);
});

test("bulk order status and archive mutations are bounded, fenced, authorized, and independently audited", async () => {
  const ownerUserId = `user_bulk_owner_${randomUUID()}`;
  const assigneeUserId = `user_bulk_assignee_${randomUUID()}`;
  const otherOperatorUserId = `user_bulk_other_${randomUUID()}`;
  const customerUserId = `user_bulk_customer_${randomUUID()}`;
  const owner = await seedOperator({ clerkUserId: ownerUserId, role: "owner" });
  const assignee = await seedOperator({
    clerkUserId: assigneeUserId,
    role: "operator",
  });
  await seedOperator({ clerkUserId: otherOperatorUserId, role: "operator" });
  verifiedEmails.set(customerUserId, uniqueEmail("bulk-customer"));

  const success = await seedOrder({
    customerClerkUserId: customerUserId,
    status: "awaiting funds",
  });
  const providerManaged = await seedOrder({
    provider: "Quickex",
    status: "awaiting funds",
  });
  const stale = await seedOrder({ status: "awaiting funds" });
  const assigned = await seedOrder({ status: "awaiting funds" });
  const archived = await seedOrder({ status: "awaiting funds" });
  const convert = await seedOrder({ status: "awaiting funds" });
  const archiveTarget = await seedOrder({ status: "pending" });

  await database.db.update(database.ordersTable).set({
    manualSettlementState: "awaiting_funds",
    statusNotificationsEnabled: true,
  }).where(eq(database.ordersTable.id, success.id));
  await database.db.update(database.ordersTable).set({
    type: "instant",
    manualSettlementState: "not_required",
  }).where(eq(database.ordersTable.id, providerManaged.id));
  await database.db.update(database.ordersTable).set({
    manualSettlementState: "awaiting_funds",
  }).where(inArray(database.ordersTable.id, [stale.id, assigned.id, archived.id]));
  await database.db.update(database.ordersTable).set({
    assignedOperatorId: assignee.id,
  }).where(eq(database.ordersTable.id, assigned.id));
  await database.db.update(database.ordersTable).set({
    archivedAt: new Date(),
    archivedBy: owner.id,
  }).where(eq(database.ordersTable.id, archived.id));
  await database.db.update(database.ordersTable).set({
    type: "onramp",
    manualSettlementState: "awaiting_funds",
  }).where(eq(database.ordersTable.id, convert.id));

  const mixed = await request("/orders/bulk/status", {
    method: "POST",
    body: JSON.stringify({
      manualSettlementState: "completed",
      items: [
        { id: success.id, recordVersion: success.recordVersion },
        { id: providerManaged.id, recordVersion: providerManaged.recordVersion },
        { id: stale.id, recordVersion: stale.recordVersion + 1 },
        { id: assigned.id, recordVersion: assigned.recordVersion },
        { id: archived.id, recordVersion: archived.recordVersion },
        { id: convert.id, recordVersion: convert.recordVersion },
      ],
    }),
  }, ownerUserId);
  assert.equal(mixed.status, 200);
  const outcomes = mixed.body?.results as Array<Record<string, unknown>>;
  assert.equal(outcomes.length, 6);
  assert.equal(outcomes[0]?.success, true);
  assert.equal(outcomes[1]?.code, "PROVIDER_STATUS_MANAGED");
  assert.equal(outcomes[2]?.code, "ORDER_STATUS_CONFLICT");
  assert.equal(outcomes[4]?.code, "ORDER_ARCHIVED");
  assert.equal(outcomes[5]?.code, "MANUAL_SETTLEMENT_NOT_APPLICABLE");

  const [assignedAfterOwnerUpdate] = await database.db.select({
    recordVersion: database.ordersTable.recordVersion,
  }).from(database.ordersTable).where(eq(database.ordersTable.id, assigned.id));
  const unauthorized = await request("/orders/bulk/status", {
    method: "POST",
    body: JSON.stringify({
      manualSettlementState: "funds_confirmed",
      items: [{
        id: assigned.id,
        recordVersion: assignedAfterOwnerUpdate.recordVersion,
      }],
    }),
  }, otherOperatorUserId);
  assert.equal(unauthorized.status, 200);
  assert.equal(
    (unauthorized.body?.results as Array<Record<string, unknown>>)[0]?.code,
    "ORDER_STATUS_ACCESS_DENIED",
  );

  const duplicate = await request("/orders/bulk/status", {
    method: "POST",
    body: JSON.stringify({
      manualSettlementState: "funds_confirmed",
      items: [
        { id: assigned.id, recordVersion: assigned.recordVersion },
        { id: assigned.id, recordVersion: assigned.recordVersion },
      ],
    }),
  }, ownerUserId);
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body?.code, "DUPLICATE_ORDER_IDS");

  const oversized = await request("/orders/bulk/status", {
    method: "POST",
    body: JSON.stringify({
      manualSettlementState: "funds_confirmed",
      items: Array.from({ length: 101 }, (_, index) => ({
        id: `bulk-${index}`,
        recordVersion: 0,
      })),
    }),
  }, ownerUserId);
  assert.equal(oversized.status, 400);

  const [storedSuccess] = await database.db.select()
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, success.id));
  assert.equal(storedSuccess.manualSettlementState, "completed");
  assert.equal(storedSuccess.status, "completed");
  assert.ok(storedSuccess.manualSettlementFundedAt);
  assert.ok(storedSuccess.manualSettlementPaidAt);
  const statusAudits = await database.db.select()
    .from(database.orderAuditLogsTable)
    .where(eq(database.orderAuditLogsTable.orderId, success.id));
  assert.equal(
    statusAudits.filter((entry) => entry.action === "order.bulk_status_updated").length,
    1,
  );
  const bulkStatusAudit = statusAudits.find(
    (entry) => entry.action === "order.bulk_status_updated",
  );
  assert.deepEqual(
    (bulkStatusAudit?.details as Record<string, unknown>)?.skippedStates,
    ["funds_confirmed", "payout_processing", "payout_sent"],
  );
  const notificationEvents = await database.db.select()
    .from(database.customerStatusNotificationEventsTable)
    .where(eq(database.customerStatusNotificationEventsTable.orderId, success.id));
  assert.equal(notificationEvents.length, 1);
  assert.equal(notificationEvents[0]?.fromStatus, "awaiting funds");
  assert.equal(notificationEvents[0]?.toStatus, "completed");
  await database.db.delete(database.customerStatusNotificationEventsTable)
    .where(eq(database.customerStatusNotificationEventsTable.orderId, success.id));

  const refunded = await request(`/orders/${success.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      recordVersion: storedSuccess.recordVersion,
      manualSettlementState: "refunded",
    }),
  }, ownerUserId);
  assert.equal(refunded.status, 200);
  assert.equal(refunded.body?.id, success.id);
  assert.equal(refunded.body?.manualSettlementState, "refunded");
  assert.equal(refunded.body?.status, "refunded");
  const refundedPublicStatus = await request(`/orders/${success.id}/status`);
  assert.equal(refundedPublicStatus.status, 200);
  assert.equal(refundedPublicStatus.body?.id, success.id);
  assert.equal(refundedPublicStatus.body?.status, "refunded");

  const operatorArchive = await request("/orders/bulk/archive", {
    method: "POST",
    body: JSON.stringify({
      archived: true,
      items: [{ id: archiveTarget.id, recordVersion: archiveTarget.recordVersion }],
    }),
  }, assigneeUserId);
  assert.equal(operatorArchive.status, 403);
  assert.equal(operatorArchive.body?.code, "OWNER_ACCESS_REQUIRED");

  const archivedResult = await request("/orders/bulk/archive", {
    method: "POST",
    body: JSON.stringify({
      archived: true,
      items: [{ id: archiveTarget.id, recordVersion: archiveTarget.recordVersion }],
    }),
  }, ownerUserId);
  assert.equal(archivedResult.status, 200);
  const archivedOutcome = (archivedResult.body?.results as Array<Record<string, any>>)[0];
  assert.equal(archivedOutcome.success, true);
  assert.ok(archivedOutcome.order.archivedAt);

  const restoredResult = await request("/orders/bulk/archive", {
    method: "POST",
    body: JSON.stringify({
      archived: false,
      items: [{
        id: archiveTarget.id,
        recordVersion: archivedOutcome.order.recordVersion,
      }],
    }),
  }, ownerUserId);
  assert.equal(restoredResult.status, 200);
  const restoredOutcome = (restoredResult.body?.results as Array<Record<string, any>>)[0];
  assert.equal(restoredOutcome.success, true);
  assert.equal(restoredOutcome.order.archivedAt, null);
  const archiveAudits = await database.db.select()
    .from(database.orderAuditLogsTable)
    .where(eq(database.orderAuditLogsTable.orderId, archiveTarget.id));
  assert.deepEqual(
    archiveAudits.map((entry) => entry.action),
    ["order.archived", "order.restored"],
  );

  const permanentDeleteTarget = await seedOrder({ status: "cancelled" });
  const activeDeleteTarget = await seedOrder({ status: "cancelled" });
  await database.db.update(database.ordersTable).set({
    archivedAt: new Date(),
    archivedBy: owner.id,
  }).where(eq(database.ordersTable.id, permanentDeleteTarget.id));

  const operatorDelete = await request("/orders/bulk/delete", {
    method: "POST",
    body: JSON.stringify({
      items: [{ id: permanentDeleteTarget.id, recordVersion: permanentDeleteTarget.recordVersion }],
    }),
  }, assigneeUserId);
  assert.equal(operatorDelete.status, 403);
  assert.equal(operatorDelete.body?.code, "OWNER_ACCESS_REQUIRED");

  const deleteResult = await request("/orders/bulk/delete", {
    method: "POST",
    body: JSON.stringify({
      items: [
        { id: permanentDeleteTarget.id, recordVersion: permanentDeleteTarget.recordVersion },
        { id: activeDeleteTarget.id, recordVersion: activeDeleteTarget.recordVersion },
      ],
    }),
  }, ownerUserId);
  assert.equal(deleteResult.status, 200, JSON.stringify(deleteResult.body));
  const deleteOutcomes = deleteResult.body?.results as Array<Record<string, unknown>>;
  assert.equal(deleteOutcomes[0]?.success, true);
  assert.equal(deleteOutcomes[1]?.success, false);
  assert.equal(deleteOutcomes[1]?.code, "ORDER_NOT_ARCHIVED");

  const [deletedOrder] = await database.db.select({ id: database.ordersTable.id })
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, permanentDeleteTarget.id));
  assert.equal(deletedOrder, undefined);
  const [preservedActiveOrder] = await database.db.select({ id: database.ordersTable.id })
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, activeDeleteTarget.id));
  assert.equal(preservedActiveOrder?.id, activeDeleteTarget.id);
  const deletionAudits = await database.db.select()
    .from(database.orderAuditLogsTable)
    .where(eq(database.orderAuditLogsTable.orderId, permanentDeleteTarget.id));
  assert.equal(
    deletionAudits.filter((entry) => entry.action === "order.permanently_deleted").length,
    1,
  );
});

test("expired notification claims are fenced from overwriting the current worker", async () => {
  const customerUserId = `user_notification_fence_${randomUUID()}`;
  const operatorUserId = `user_notification_fence_operator_${randomUUID()}`;
  verifiedEmails.set(customerUserId, uniqueEmail("notification-fence"));
  await seedOperator({ clerkUserId: operatorUserId, role: "owner" });
  const order = await seedOrder({
    customerClerkUserId: customerUserId,
    status: "pending",
  });
  const enabled = await request(
    `/account/orders/${order.id}/notifications`,
    { method: "PATCH", body: JSON.stringify({ enabled: true }) },
    customerUserId,
  );
  assert.equal(enabled.status, 200);
  const updated = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "processing" }) },
    operatorUserId,
  );
  assert.equal(updated.status, 200);
  await database.db
    .update(database.customerStatusNotificationEventsTable)
    .set({ nextAttemptAt: new Date(0) })
    .where(eq(database.customerStatusNotificationEventsTable.orderId, order.id));

  let sendCount = 0;
  let signalFirstStarted!: () => void;
  let releaseFirst!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    signalFirstStarted = resolve;
  });
  const firstRelease = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  customerNotifications.configureCustomerNotificationDeliveryForTests({
    send: async (notification) => {
      sendCount += 1;
      if (sendCount === 1) {
        signalFirstStarted();
        await firstRelease;
        throw new Error("stale claimant failure");
      }
      captureCustomerNotification(notification);
    },
  });

  try {
    const staleWorker = customerNotifications.processCustomerStatusNotificationOutbox();
    await firstStarted;
    const [firstClaim] = await database.db
      .select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.orderId, order.id));
    assert.ok(firstClaim.claimToken);
    await database.db
      .update(database.customerStatusNotificationEventsTable)
      .set({ claimExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(database.customerStatusNotificationEventsTable.id, firstClaim.id));

    assert.equal(
      await customerNotifications.processCustomerStatusNotificationOutbox(),
      1,
    );
    const [currentResult] = await database.db
      .select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.id, firstClaim.id));
    assert.equal(currentResult.deliveryStatus, "delivered");
    assert.equal(currentResult.attemptCount, 2);
    assert.equal(currentResult.claimToken, null);
    assert.equal(currentResult.lastErrorCode, "");

    releaseFirst();
    assert.equal(await staleWorker, 0);
    const [afterStaleCompletion] = await database.db
      .select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.id, firstClaim.id));
    assert.equal(afterStaleCompletion.deliveryStatus, "delivered");
    assert.equal(afterStaleCompletion.attemptCount, 2);
    assert.equal(afterStaleCompletion.claimToken, null);
    assert.equal(afterStaleCompletion.lastErrorCode, "");
    assert.equal(sendCount, 2);
  } finally {
    releaseFirst();
    customerNotifications.configureCustomerNotificationDeliveryForTests({
      send: captureCustomerNotification,
    });
  }
});

test("ambiguous customer email sends recover with one provider-side delivery", async () => {
  const customerUserId = `user_notification_idempotency_${randomUUID()}`;
  const operatorUserId = `user_notification_idempotency_operator_${randomUUID()}`;
  verifiedEmails.set(customerUserId, uniqueEmail("notification-idempotency"));
  await seedOperator({ clerkUserId: operatorUserId, role: "owner" });
  const order = await seedOrder({
    customerClerkUserId: customerUserId,
    status: "pending",
  });
  const enabled = await request(
    `/account/orders/${order.id}/notifications`,
    { method: "PATCH", body: JSON.stringify({ enabled: true }) },
    customerUserId,
  );
  assert.equal(enabled.status, 200);
  const updated = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "processing" }) },
    operatorUserId,
  );
  assert.equal(updated.status, 200);

  const providerDeliveries = new Map<string, string>();
  let sendCalls = 0;
  let providerAcceptanceCount = 0;
  customerNotifications.configureCustomerNotificationDeliveryForTests({
    send: (notification, options) => {
      sendCalls += 1;
      if (!providerDeliveries.has(options.idempotencyKey)) {
        providerAcceptanceCount += 1;
        providerDeliveries.set(options.idempotencyKey, notification.eventId);
      }
      if (sendCalls === 1) {
        throw new Error("Provider accepted the email but its response was lost.");
      }
    },
  });

  try {
    assert.equal(
      await customerNotifications.processCustomerStatusNotificationOutbox(),
      0,
    );
    const [firstClaim] = await database.db
      .select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.orderId, order.id));
    assert.equal(firstClaim.deliveryStatus, "pending");
    assert.equal(firstClaim.attemptCount, 1);
    assert.ok(firstClaim.providerIdempotencyStartedAt);
    await database.db
      .update(database.customerStatusNotificationEventsTable)
      .set({
        deliveryStatus: "sending",
        claimToken: randomUUID(),
        claimExpiresAt: new Date(Date.now() - 1_000),
      })
      .where(eq(database.customerStatusNotificationEventsTable.id, firstClaim.id));

    assert.equal(
      await customerNotifications.processCustomerStatusNotificationOutbox(),
      1,
    );
    assert.equal(sendCalls, 2);
    assert.equal(providerAcceptanceCount, 1);
    assert.equal(providerDeliveries.size, 1);
    assert.deepEqual(
      [...providerDeliveries.keys()],
      [`customer-status-notification-${firstClaim.id}`],
    );

    const [recovered] = await database.db
      .select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.id, firstClaim.id));
    assert.equal(recovered.deliveryStatus, "delivered");
    assert.equal(recovered.attemptCount, 2);
  } finally {
    customerNotifications.configureCustomerNotificationDeliveryForTests({
      send: captureCustomerNotification,
    });
  }
});

test("customer emails are not retried after the provider idempotency safety window", async () => {
  const customerUserId = `user_notification_window_${randomUUID()}`;
  const operatorUserId = `user_notification_window_operator_${randomUUID()}`;
  verifiedEmails.set(customerUserId, uniqueEmail("notification-window"));
  await seedOperator({ clerkUserId: operatorUserId, role: "owner" });
  const order = await seedOrder({
    customerClerkUserId: customerUserId,
    status: "pending",
  });
  const enabled = await request(
    `/account/orders/${order.id}/notifications`,
    { method: "PATCH", body: JSON.stringify({ enabled: true }) },
    customerUserId,
  );
  assert.equal(enabled.status, 200);
  const updated = await request(
    `/orders/${order.id}`,
    { method: "PATCH", body: JSON.stringify({ status: "processing" }) },
    operatorUserId,
  );
  assert.equal(updated.status, 200);

  const [event] = await database.db
    .select()
    .from(database.customerStatusNotificationEventsTable)
    .where(eq(database.customerStatusNotificationEventsTable.orderId, order.id));
  await database.db
    .update(database.customerStatusNotificationEventsTable)
    .set({
      deliveryStatus: "sending",
      claimExpiresAt: new Date(Date.now() - 1_000),
      providerIdempotencyStartedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
    })
    .where(eq(database.customerStatusNotificationEventsTable.id, event.id));

  let sendCalls = 0;
  customerNotifications.configureCustomerNotificationDeliveryForTests({
    send: () => {
      sendCalls += 1;
    },
  });
  try {
    assert.equal(
      await customerNotifications.processCustomerStatusNotificationOutbox(),
      0,
    );
    assert.equal(sendCalls, 0);
    const [quarantined] = await database.db
      .select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.id, event.id));
    assert.equal(quarantined.deliveryStatus, "failed");
    assert.equal(
      quarantined.lastErrorCode,
      "EMAIL_IDEMPOTENCY_WINDOW_EXPIRED",
    );
    assert.equal(quarantined.claimToken, null);
    assert.equal(quarantined.claimExpiresAt, null);
  } finally {
    customerNotifications.configureCustomerNotificationDeliveryForTests({
      send: captureCustomerNotification,
    });
  }
});

test("concurrent order status updates serialize into contiguous notification versions", async () => {
  const customerUserId = `user_order_status_race_${randomUUID()}`;
  const operatorUserId = `user_order_status_race_operator_${randomUUID()}`;
  verifiedEmails.set(customerUserId, uniqueEmail("order-status-race"));
  await seedOperator({ clerkUserId: operatorUserId, role: "owner" });
  const order = await seedOrder({
    customerClerkUserId: customerUserId,
    status: "pending",
  });
  const enabled = await request(
    `/account/orders/${order.id}/notifications`,
    { method: "PATCH", body: JSON.stringify({ enabled: true }) },
    customerUserId,
  );
  assert.equal(enabled.status, 200);

  const desiredStatuses = Array.from({ length: 12 }, (_, index) => `race-${index}`);
  const results = await Promise.all(
    desiredStatuses.map((status) =>
      request(
        `/orders/${order.id}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
        operatorUserId,
      )
    ),
  );
  assert.ok(results.every((result) => result.status === 200 || result.status === 409));
  const successfulUpdates = results.filter((result) => result.status === 200);
  assert.ok(successfulUpdates.length > 0);
  for (const conflict of results.filter((result) => result.status === 409)) {
    assert.equal(conflict.body?.code, "ORDER_STATUS_CONFLICT");
  }

  const events = await database.db
    .select()
    .from(database.customerStatusNotificationEventsTable)
    .where(eq(database.customerStatusNotificationEventsTable.orderId, order.id));
  assert.equal(events.length, successfulUpdates.length);
  const versions = events.map((event) => event.statusVersion).sort((a, b) => a - b);
  assert.deepEqual(
    versions,
    Array.from({ length: events.length }, (_, index) => index + 1),
  );
  const [stored] = await database.db
    .select()
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, order.id));
  assert.equal(stored.statusVersion, events.length);
  assert.equal(
    stored.status,
    events.find((event) => event.statusVersion === stored.statusVersion)?.toStatus,
  );
});

test("only a Clerk identity with a verified email links an active operator record", async () => {
  const verifiedUserId = `user_verified_${randomUUID()}`;
  const unverifiedUserId = `user_unverified_${randomUUID()}`;
  const verifiedEmail = uniqueEmail("verified-link").toUpperCase();
  const unverifiedEmail = uniqueEmail("unverified-link");
  const verifiedOperator = await seedOperator({
    email: verifiedEmail.toLowerCase(),
    clerkUserId: null,
  });
  const unverifiedOperator = await seedOperator({
    email: unverifiedEmail,
    clerkUserId: null,
  });
  verifiedEmails.set(verifiedUserId, verifiedEmail);

  const authorization = await operatorAuth.getOperatorAuthorization(verifiedUserId);
  assert.equal(authorization?.id, verifiedOperator.id);
  assert.equal(authorization?.email, verifiedEmail.toLowerCase());
  assert.equal(authorization?.name, "");
  assert.equal(authorization?.role, "operator");
  assert.equal(authorization?.authVersion, 1);
  assert.ok(authorization?.effectivePermissions.includes("orders.view"));
  assert.ok(authorization?.effectivePermissions.includes("payment_methods.manage"));
  assert.equal(
    authorization?.effectivePermissions.includes("receiving_wallets.manage"),
    false,
  );
  assert.equal(
    authorization?.effectivePermissions.includes("team.permissions.individual"),
    false,
  );
  const [linked] = await database.db
    .select()
    .from(database.operatorsTable)
    .where(eq(database.operatorsTable.id, verifiedOperator.id));
  assert.equal(linked.clerkUserId, verifiedUserId);
  await assertOneAudit(verifiedOperator.id, "operator.identity_linked");

  assert.equal(await operatorAuth.getOperatorAuthorization(unverifiedUserId), null);
  const [unlinked] = await database.db
    .select()
    .from(database.operatorsTable)
    .where(eq(database.operatorsTable.id, unverifiedOperator.id));
  assert.equal(unlinked.clerkUserId, null);
  assert.deepEqual(await auditActions(unverifiedOperator.id), []);
});

test("a verified production identity can replace an active operator's development Clerk link", async () => {
  const developmentUserId = `user_development_${randomUUID()}`;
  const productionUserId = `user_production_${randomUUID()}`;
  const email = uniqueEmail("environment-relink");
  const operator = await seedOperator({
    email,
    clerkUserId: developmentUserId,
    role: "owner",
  });
  verifiedEmails.set(productionUserId, email);

  const authorization = await operatorAuth.getOperatorAuthorization(productionUserId);
  assert.equal(authorization?.id, operator.id);
  assert.equal(authorization?.email, email);
  assert.equal(authorization?.name, "");
  assert.equal(authorization?.role, "owner");
  assert.equal(authorization?.authVersion, 2);
  assert.ok(
    authorization?.effectivePermissions.includes("team.permissions.individual"),
  );

  const [relinked] = await database.db
    .select()
    .from(database.operatorsTable)
    .where(eq(database.operatorsTable.id, operator.id));
  assert.equal(relinked.clerkUserId, productionUserId);
  assert.equal(relinked.authVersion, 2);
  await assertOneAudit(operator.id, "operator.identity_relinked");

  assert.equal(
    await operatorAuth.getOperatorAuthorization(developmentUserId),
    null,
  );
});

test("owners can invite, approve, suspend, reactivate, and remove operators with one audit per transition", async () => {
  const ownerUserId = `user_lifecycle_owner_${randomUUID()}`;
  await seedOperator({ clerkUserId: ownerUserId, role: "owner" });
  const email = uniqueEmail("lifecycle");

  const invitation = await request(
    "/admin/operators/invitations",
    { method: "POST", body: JSON.stringify({ email: email.toUpperCase() }) },
    ownerUserId,
  );
  assert.equal(invitation.status, 201);
  assert.equal(invitation.body?.email, email);
  assert.equal(invitation.body?.status, "invited");
  const operatorId = String(invitation.body?.id);
  createdOperatorIds.add(operatorId);
  await assertOneAudit(operatorId, "operator.invited");

  const duplicate = await request(
    "/admin/operators/invitations",
    { method: "POST", body: JSON.stringify({ email }) },
    ownerUserId,
  );
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body?.code, "OPERATOR_ALREADY_EXISTS");

  const approved = await request(`/admin/operators/${operatorId}/approve`, { method: "POST" }, ownerUserId);
  assert.equal(approved.status, 200);
  assert.equal(approved.body?.status, "active");
  await assertOneAudit(operatorId, "operator.approved");

  const suspended = await request(`/admin/operators/${operatorId}/suspend`, { method: "POST" }, ownerUserId);
  assert.equal(suspended.status, 200);
  assert.equal(suspended.body?.status, "suspended");
  await assertOneAudit(operatorId, "operator.suspended");

  const reactivated = await request(`/admin/operators/${operatorId}/approve`, { method: "POST" }, ownerUserId);
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body?.status, "active");
  await assertOneAudit(operatorId, "operator.reactivated");

  const removed = await request(`/admin/operators/${operatorId}`, { method: "DELETE" }, ownerUserId);
  assert.equal(removed.status, 204);
  await assertOneAudit(operatorId, "operator.removed");

  const [stored] = await database.db
    .select()
    .from(database.operatorsTable)
    .where(eq(database.operatorsTable.id, operatorId));
  assert.equal(stored.status, "removed");
  assert.equal(stored.authVersion, 5);
  assert.ok(stored.removedAt);
  assert.deepEqual(
    (await auditActions(operatorId)).sort(),
    [
      "operator.approved",
      "operator.invited",
      "operator.reactivated",
      "operator.removed",
      "operator.suspended",
    ],
  );
});

test("concurrent lifecycle requests allow one transition and reject the competing request", async () => {
  const ownerUserId = `user_concurrent_owner_${randomUUID()}`;
  await seedOperator({ clerkUserId: ownerUserId, role: "owner" });
  const target = await seedOperator({ status: "invited" });

  let readCount = 0;
  let releaseUpdates: () => void = () => {};
  let signalBothRead: () => void = () => {};
  const updatesReleased = new Promise<void>((resolve) => {
    releaseUpdates = resolve;
  });
  const bothRead = new Promise<void>((resolve) => {
    signalBothRead = resolve;
  });
  operatorRoutes.configureOperatorTransitionHookForTests(async (transition, operator) => {
    if (transition !== "approve" || operator.id !== target.id) return;
    readCount += 1;
    if (readCount === 2) signalBothRead();
    await updatesReleased;
  });

  const requests = Promise.all([
    request(`/admin/operators/${target.id}/approve`, { method: "POST" }, ownerUserId),
    request(`/admin/operators/${target.id}/approve`, { method: "POST" }, ownerUserId),
  ]);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let results: Awaited<typeof requests>;
  try {
    await Promise.race([
      bothRead,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Both concurrent requests did not reach the transition barrier.")),
          2_000,
        );
      }),
    ]);
    releaseUpdates();
    results = await requests;
  } finally {
    if (timeout) clearTimeout(timeout);
    releaseUpdates();
    operatorRoutes.configureOperatorTransitionHookForTests(undefined);
  }

  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(
    results.find((result) => result.status === 409)?.body?.code,
    "OPERATOR_TRANSITION_CONFLICT",
  );
  await assertOneAudit(target.id, "operator.approved");

  const [stored] = await database.db
    .select()
    .from(database.operatorsTable)
    .where(and(
      eq(database.operatorsTable.id, target.id),
      eq(database.operatorsTable.status, "active"),
    ));
  assert.ok(stored);
  assert.equal(stored.authVersion, 2);
});