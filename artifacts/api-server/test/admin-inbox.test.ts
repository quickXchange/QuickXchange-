import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import pinoHttp from "pino-http";
import test, { before, after } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, adminInboxTable, adminInboxReceiptsTable, operatorsTable, quickexOrdersTable } from "@workspace/db";
import router from "../src/routes/admin-inbox";
import { ApiError } from "../src/lib/api-error";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";
import { enqueueAdminOrderEvent, recordAdminOperationalAlert } from "../src/lib/admin-inbox";
import { assertIsolatedWhitebitDatabase } from "./assert-isolated-whitebit-database";
import { updateConvertOrderStatus } from "../src/lib/convert-provider-boundary";
import { adminPolicy } from "../src/lib/admin-policy";

assertIsolatedWhitebitDatabase();
configureOperatorAuthorizationForTests({
  getUserId: req => req.get("x-test-operator") ?? null,
  getVerifiedEmail: id => `${id}@example.test`,
  getTotpEnabled: () => true,
  getSecondFactorVerified: () => true,
});
const app = express();
app.use(pinoHttp({ level: "silent" }), express.json());
// Exercise the same central deny-by-default gate used before routers in production.
app.use("/api", adminPolicy, router);
app.use((error: ApiError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(error.status ?? 500).json({ error: error.message, code: error.code });
});
let server: ReturnType<typeof app.listen>;
let base = "";
const hiddenProviderId = "00000000-0000-4000-8000-000000009901";
before(async () => {
  for (const id of ["inbox-owner", "inbox-other", "inbox-viewer", "inbox-integration", "inbox-denied", "inbox-suspended"]) {
    await db.insert(operatorsTable).values({
      clerkUserId: id, email: `${id}@example.test`, name: "Synthetic Inbox Operator",
      role: id.includes("owner") || id.includes("other") ? "owner" : "operator",
      status: id.includes("suspended") ? "suspended" : "active",
      legacyPermissionEligible: false,
      permissionAllows: id === "inbox-viewer" ? ["orders.view"] : id === "inbox-integration" ? ["integrations.view"] : [],
    });
  }
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/notifications`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});
async function request(path = "", method = "GET", actor: string | null = "inbox-owner") {
  const response = await fetch(base + path, { method, headers: actor ? { "x-test-operator": actor } : {} });
  return { status: response.status, body: await response.json() as any, cache: response.headers.get("cache-control") };
}

test("only real Swap/Convert order events are listed and counted; historical technical alerts are retained but hidden", async () => {
  await Promise.all(Array.from({ length: 8 }, () => db.transaction(tx => enqueueAdminOrderEvent(tx, {
    orderId: "O-INBOX-SWAP", type: "Swap", status: "awaiting funds", version: 0, created: true,
  }))));
  await db.transaction(async tx => {
    await enqueueAdminOrderEvent(tx, { orderId: "O-INBOX-CONVERT", type: "Convert", status: "awaiting funds", version: 1, created: true });
    await enqueueAdminOrderEvent(tx, { orderId: "O-INBOX-CONVERT", type: "Convert", status: "processing", version: 2, depositVerified: true });
    await enqueueAdminOrderEvent(tx, { orderId: "O-INBOX-CONVERT", type: "Convert", status: "processing", version: 2, depositVerified: true });
  });
  await recordAdminOperationalAlert("Quickex", "QUICKEX_NETWORK");
  await recordAdminOperationalAlert("Quickex", "QUICKEX_NETWORK");
  assert.equal((await db.select().from(adminInboxTable)).length, 4, "Technical diagnostics no longer create inbox rows");
  await db.insert(adminInboxTable).values([
    { id: hiddenProviderId, eventKey: "operational:historical", kind: "provider_error", title: "Old Quickex alert", message: "Retained", orderId: null },
    { eventKey: "swap:old:technical", kind: "system_alert", title: "Old RPC alert", message: "Retained", orderId: "O-INBOX-SWAP" },
    { eventKey: "operational:old:kind", kind: "status_change", title: "Old monitoring status", message: "Retained", orderId: "O-INBOX-SWAP" },
  ]);
  const result = await request();
  assert.equal(result.status, 200);
  assert.equal(result.cache, "private, no-store");
  assert.equal(result.body.allCount, 4);
  assert.equal(result.body.unreadCount, 4);
  assert.equal(result.body.items.filter((item: any) => item.kind === "new_order").length, 2);
  assert.equal(result.body.items.filter((item: any) => item.kind === "deposit").length, 1);
  assert.ok(result.body.items.every((item: any) => !item.read && Number.isFinite(Date.parse(item.createdAt))));
  assert.ok(result.body.items.every((item: any) => item.orderId && ["Swap", "Convert"].includes(item.orderType)));
  assert.equal(result.body.items.find((item: any) => item.orderId === "O-INBOX-SWAP").orderType, "Swap");
  assert.equal(result.body.items.find((item: any) => item.orderId === "O-INBOX-CONVERT").orderType, "Convert");
  assert.equal((await db.select().from(adminInboxTable)).length, 7, "Historical alerts were not deleted");
  const restricted = await request("", "GET", "inbox-viewer");
  assert.equal(restricted.body.allCount, 4);
  assert.ok(restricted.body.items.every((item: any) => item.orderId));
  const empty = await request("", "GET", "inbox-denied");
  assert.equal(empty.body.allCount, 0);
  const integration = await request("", "GET", "inbox-integration");
  assert.equal(integration.status, 200);
  assert.equal(integration.body.allCount, 0, "Integration permission alone cannot reveal order notifications");
});

test("individual read, filters, mark-all and deletion persist independently for each operator", async () => {
  const initial = (await request()).body;
  const id = initial.items.find((item: any) => item.kind === "new_order").id;
  assert.equal((await request(`/${id}/read`, "POST")).status, 200);
  assert.equal((await request(`/${id}/read`, "POST")).status, 200);
  assert.equal((await request("?filter=read")).body.items.length, 1);
  assert.equal((await request("?filter=unread")).body.unreadCount, 3);
  assert.equal((await request("", "GET", "inbox-other")).body.unreadCount, 4);
  assert.equal((await request("/read-all", "POST")).status, 200);
  assert.equal((await request()).body.unreadCount, 0);
  assert.equal((await request(`/${id}`, "DELETE")).status, 200);
  assert.equal((await request(`/${id}`, "DELETE")).status, 200);
  assert.equal((await request()).body.allCount, 3);
  assert.equal((await request("", "GET", "inbox-other")).body.allCount, 4);
  // Re-delivery after dismissal must not resurrect the event.
  await db.transaction(tx => enqueueAdminOrderEvent(tx, {
    orderId: initial.items.find((item: any) => item.id === id).orderId,
    type: initial.items.find((item: any) => item.id === id).title.includes("Convert") ? "Convert" : "Swap",
    status: "awaiting funds", version: 0, created: true,
  }));
  assert.equal((await request()).body.allCount, 3);
});

test("permission checks protect list, read, delete and mark-all; malformed input gives explicit errors", async () => {
  const provider = { id: hiddenProviderId };
  assert.equal((await request(`/${provider.id}/read`, "POST")).status, 404);
  assert.equal((await request(`/${provider.id}`, "DELETE")).status, 404);
  assert.equal((await request(`/${provider.id}/read`, "POST", "inbox-viewer")).status, 404);
  assert.equal((await request(`/${provider.id}`, "DELETE", "inbox-viewer")).status, 404);
  assert.equal((await request(`/${provider.id}/read`, "POST", "inbox-integration")).status, 404);
  const orderEvent = (await request("", "GET", "inbox-other")).body.items.find((item: any) => item.orderId);
  assert.equal((await request(`/${orderEvent.id}/read`, "POST", "inbox-integration")).status, 404);
  assert.equal((await request(`/${provider.id}`, "DELETE", "inbox-integration")).status, 404);
  await request("/read-all", "POST", "inbox-viewer");
  assert.equal((await request("", "GET", "inbox-other")).body.unreadCount, 4);
  const [hidden] = await db.select().from(adminInboxTable).where(eq(adminInboxTable.id, hiddenProviderId));
  assert.ok(hidden, "Hidden technical notification must be retained");
  assert.equal((await db.select().from(adminInboxReceiptsTable).where(eq(adminInboxReceiptsTable.notificationId, hiddenProviderId))).length, 0,
    "Mark-all and hidden-ID writes must not mutate retained technical alerts");
  assert.equal((await request("", "GET", null)).status, 401);
  assert.equal((await request("", "GET", "inbox-suspended")).status, 403);
  for (const actor of [null, "inbox-suspended"] as const) {
    const expected = actor === null ? 401 : 403;
    assert.equal((await request("/read-all", "POST", actor)).status, expected);
    assert.equal((await request(`/${provider.id}/read`, "POST", actor)).status, expected);
    assert.equal((await request(`/${provider.id}`, "DELETE", actor)).status, expected);
  }
  assert.equal((await request(`/${provider.id}/read`, "POST", "inbox-denied")).status, 404);
  assert.equal((await request(`/${provider.id}`, "DELETE", "inbox-denied")).status, 404);
  assert.equal((await request("/read-all", "POST", "inbox-denied")).status, 200);
  assert.equal((await request("", "GET", "inbox-other")).body.unreadCount, 4);
  assert.equal((await request("?filter=invalid")).status, 400);
  assert.equal((await request("?page=-1")).status, 400);
  assert.equal((await request("/invalid/read", "POST")).status, 400);
  assert.equal((await request("/00000000-0000-4000-8000-000000000000", "DELETE")).status, 404);
});

test("rolled-back order events never appear; pagination and new-unread updates remain accurate", async () => {
  await assert.rejects(db.transaction(async tx => {
    await enqueueAdminOrderEvent(tx, { orderId: "O-ROLLBACK", type: "Swap", status: "awaiting funds", version: 0, created: true });
    throw new Error("synthetic transaction rollback");
  }));
  assert.equal((await db.select().from(adminInboxTable).where(eq(adminInboxTable.orderId, "O-ROLLBACK"))).length, 0);
  for (let i = 0; i < 22; i++) await db.transaction(tx => enqueueAdminOrderEvent(tx, {
    orderId: `O-PAGE-${i}`, type: "Swap", status: "awaiting funds", version: 0, created: true,
  }));
  const first = (await request()).body;
  const second = (await request("?page=2")).body;
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 5);
  assert.equal(first.unreadCount, 22);
  assert.equal(new Set([...first.items, ...second.items].map((item: any) => item.id)).size, 25);
  assert.equal((await request("?page=999")).body.page, 2);
});

test("canonical Convert Admin status changes emit once; optimistic-conflict retries emit nothing", async () => {
  const now = new Date();
  await db.insert(quickexOrdersTable).values({
    legacyOrderId: "O-CONVERT-STATUS", providerOrderId: "synthetic-provider-order",
    status: "awaiting funds", route: {}, amounts: {}, addresses: {}, createdAt: now, updatedAt: now,
  });
  const updated = await updateConvertOrderStatus("O-CONVERT-STATUS", 0, "failed");
  assert.equal(updated?.status, "failed");
  assert.equal(await updateConvertOrderStatus("O-CONVERT-STATUS", 0, "failed"), undefined);
  const events = await db.select().from(adminInboxTable).where(eq(adminInboxTable.orderId, "O-CONVERT-STATUS"));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "payment_failed");
  assert.ok(!events[0].title.includes("deposit"), "Unpaid failure is not a confirmed deposit");
});

test("Swap and Convert lifecycle notifications remain concise and deduplicated for every final status", async () => {
  for (const type of ["Swap", "Convert"] as const) {
    const orderId = `O-LIFECYCLE-${type}`;
    for (const [version, status] of ["processing", "completed", "cancelled", "failed", "expired", "refunded"].entries()) {
      const event = { type, orderId, status, version };
      await db.transaction(tx => enqueueAdminOrderEvent(tx, event));
      await db.transaction(tx => enqueueAdminOrderEvent(tx, event));
    }
    const rows = await db.select().from(adminInboxTable).where(eq(adminInboxTable.orderId, orderId));
    assert.equal(rows.length, 6);
    assert.ok(rows.some(row => row.title === `${type} Order Completed`));
    assert.ok(rows.some(row => row.title === `${type} Order Cancelled`));
    assert.ok(rows.some(row => row.title === `${type} Order Failed`));
    assert.ok(rows.every(row => row.kind !== "deposit"), "Status transitions alone must never claim verified payment");
  }
});
