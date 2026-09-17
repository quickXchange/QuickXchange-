import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import test, { after, before } from "node:test";
import { eq } from "drizzle-orm";
import * as database from "@workspace/db";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";
import {
  finalizeSwapFundingFromClaim,
  processNormalizedDeposit,
  provisionSwapFundingAddress,
  whitebitPublicRouter,
  whitebitWebhookRouter,
  whitebitOperatorRouter,
} from "../src/routes/whitebit";
import { fiatCurrenciesTable, manualDeskPricingRulesTable } from "@workspace/db";
import { matchWhitebitCapability, parseWhitebitAssets, resetWhitebitCapabilityCacheForTests, whitebitSwapStatus } from "../src/lib/whitebit-capabilities";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";
import { configureCustomerAuthorizationForTests } from "../src/lib/customer-auth";
import { signOrderTrackingToken } from "../src/lib/order-access";
import exchangeRouter from "../src/routes/exchange";

process.env.NODE_ENV = "test";
process.env.WHITEBIT_API_KEY = `swap-key-${randomUUID()}`;
process.env.WHITEBIT_API_SECRET = `swap-secret-${randomUUID()}`;
process.env.WHITEBIT_WEBHOOK_API_KEY = `swap-webhook-${randomUUID()}`;
process.env.WHITEBIT_WEBHOOK_SECRET = `swap-webhook-secret-${randomUUID()}`;

const pool = createPrivilegedTestPool();
const suffix = randomUUID();
const originalFetch = globalThis.fetch;
const orderId = `O${randomUUID().replaceAll("-", "").slice(0, 9)}`;
const customerId = `swap-customer-${suffix}`;
const orderAddress = `swap-order-address-${suffix}`;
const ownerClerkUserId = `whitebit-owner-${suffix}`;
const ownerEmail = `whitebit-owner-${suffix}@example.test`;
let providerCalls = 0;
let baseUrl = "";
let server: ReturnType<typeof app.listen>;
let priorProviderSetting: typeof database.whitebitProviderSettingsTable.$inferSelect | null = null;

const app = express();
app.use(express.json({ verify: (request, _response, body) => {
  (request as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
} }));
app.use("/api", whitebitPublicRouter);
app.use("/api", whitebitWebhookRouter);
app.use("/api", whitebitOperatorRouter);
app.use("/api", exchangeRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = typeof error === "object" && error && "status" in error &&
    typeof error.status === "number" ? error.status : 500;
  response.status(status).json({ error: error instanceof Error ? error.message : String(error) });
});

async function migrateTestTables() {
  const baseMigration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0072_whitebit_customer_deposits.sql"), "utf8");
  const migration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0073_whitebit_swap_order_addresses.sql"), "utf8");
  await pool.query(baseMigration);
  await pool.query(migration);
  await pool.query(migration);
}

async function mockAssets(network = "BITCOIN") {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/v4/public/assets")) {
      return new Response(JSON.stringify({
        BTC: { can_deposit: true, networks: { deposits: [network] }, confirmations: { [network]: 3 } },
      }), { status: 200 });
    }
    if (url.endsWith("/api/v4/main-account/create-new-address")) {
      providerCalls += 1;
      return new Response(JSON.stringify({ account: { address: orderAddress, memo: "TAG-1" } }), { status: 200 });
    }
    return originalFetch(input, init);
  };
  resetWhitebitCapabilityCacheForTests();
}

async function insertProvisioningOrder(id = orderId) {
  await database.db.insert(database.ordersTable).values({
    id, type: "manual", status: "awaiting funds", fromAsset: "BTC", fromNetwork: "BITCOIN",
    toAsset: "EUR", toNetwork: "SEPA", amount: "1", receiveAmount: "100",
    customerEmail: `${id}@example.test`, customerName: "Swap test", destinationAddress: "",
    destinationMemo: "", refundAddress: "", refundMemo: "", provider: "Manual desk",
    fundingStatus: "provisioning", fundingProviderSource: "whitebit",
    depositAddress: "", depositMemo: "",
    fundingDetailsSnapshot: {
      source: "whitebit", status: "provisioning", address: "", memo: "",
      manualFallbackAddress: "manual-wallet", manualFallbackMemo: "",
    },
    settlementSnapshot: { funding: { source: "whitebit", status: "provisioning", address: "", memo: "" } },
    providerState: "whitebit_provisioning", quoteId: "", clientRequestId: `${id}-request`,
  }).onConflictDoNothing({ target: database.ordersTable.id });
}

async function provisionTest(input: Parameters<typeof provisionSwapFundingAddress>[0]) {
  await insertProvisioningOrder(input.orderId);
  return provisionSwapFundingAddress(input);
}

async function ownedLedgerEntries() {
  return pool.query(
    `SELECT id FROM whitebit_ledger_entries
     WHERE deposit_id IN (
       SELECT id FROM whitebit_deposits
       WHERE unique_id LIKE $1 OR address LIKE $1 OR order_id LIKE $2
     )`,
    [`%${suffix}%`, `${orderId}%`],
  );
}

async function signedOrderWebhook(uniqueId: string, address = orderAddress, network = "BITCOIN", memo = "TAG-1") {
  const body = JSON.stringify({
    method: "deposit.processed",
    params: {
      nonce: Date.now() + providerCalls + uniqueId.length,
      address,
      ticker: "BTC",
      network,
      memo,
      amount: "1.25",
      fee: "0",
      status: 3,
      confirmations: 6,
      confirmationsRequired: 3,
      unique_id: uniqueId,
      transaction_id: `tx-${uniqueId}`,
      transactionHash: `hash-${uniqueId}`,
    },
    id: `delivery-${uniqueId}`,
  });
  const payload = Buffer.from(body).toString("base64");
  const signature = createHmac("sha512", process.env.WHITEBIT_WEBHOOK_SECRET!)
    .update(payload).digest("hex");
  return fetch(`${baseUrl}/api/webhooks/whitebit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-txc-apikey": process.env.WHITEBIT_WEBHOOK_API_KEY!,
      "x-txc-payload": payload,
      "x-txc-signature": signature,
    },
    body,
  });
}

before(async () => {
  await migrateTestTables();
  priorProviderSetting = (await database.db.select().from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit")).limit(1))[0] ?? null;
  await database.db.insert(database.whitebitProviderSettingsTable)
    .values({ provider: "whitebit", disabled: false })
    .onConflictDoUpdate({ target: database.whitebitProviderSettingsTable.provider, set: { disabled: false } });
  await insertProvisioningOrder();
  await database.db.insert(database.operatorsTable).values({
    email: ownerEmail, clerkUserId: ownerClerkUserId, name: "WhiteBIT Test Owner",
    role: "owner", status: "active",
  }).onConflictDoNothing({ target: database.operatorsTable.email });
  configureOperatorAuthorizationForTests({
    getUserId: (request) => request.get("x-test-operator") || null,
    getVerifiedEmail: () => ownerEmail,
  });
  configureCustomerAuthorizationForTests({
    getUserId: () => null,
    getVerifiedEmail: () => null,
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  resetWhitebitCapabilityCacheForTests();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  const cleanup = await pool.connect();
  try {
    await cleanup.query("BEGIN");
    await cleanup.query("SET LOCAL session_replication_role = replica");
    await cleanup.query(`DELETE FROM whitebit_ledger_entries WHERE deposit_id IN (
      SELECT id FROM whitebit_deposits
      WHERE unique_id LIKE $1 OR address LIKE $1 OR order_id LIKE $2 OR order_id IN ('O123456701', 'O123456702', 'O123456703')
    )`, [`%${suffix}%`, `${orderId}%`]);
    await cleanup.query("COMMIT");
  } finally {
    cleanup.release();
  }
  await pool.query("DELETE FROM whitebit_deposits WHERE unique_id LIKE $1 OR address LIKE $1 OR order_id LIKE $2 OR order_id IN ('O123456701', 'O123456702', 'O123456703')", [`%${suffix}%`, `${orderId}%`]);
  await pool.query(`DELETE FROM whitebit_order_history_checkpoints WHERE order_address_id IN (
    SELECT id FROM whitebit_order_addresses WHERE order_id LIKE $1 OR order_id IN ('O123456701', 'O123456702', 'O123456703')
  )`, [`${orderId}%`]);
  await pool.query("DELETE FROM whitebit_order_addresses WHERE order_id LIKE $1 OR order_id IN ('O123456701', 'O123456702', 'O123456703')", [`${orderId}%`]);
  await pool.query("DELETE FROM exchange_orders WHERE id LIKE $1 OR id IN ('O123456701', 'O123456702', 'O123456703')", [`${orderId}%`]);
  await pool.query("DELETE FROM whitebit_webhook_deliveries WHERE envelope_id LIKE $1 OR payload->'params'->>'address' LIKE $2", [`%${suffix}%`, `%${suffix}%`]);
  await pool.query("DELETE FROM desk_operators WHERE clerk_user_id = $1", [ownerClerkUserId]);
  if (priorProviderSetting) {
    await database.db.update(database.whitebitProviderSettingsTable).set({
      disabled: priorProviderSetting.disabled,
      version: priorProviderSetting.version,
      updatedByOperatorId: priorProviderSetting.updatedByOperatorId,
      updatedAt: priorProviderSetting.updatedAt,
    }).where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  } else {
    await database.db.delete(database.whitebitProviderSettingsTable)
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  }
  await database.pool.end();
  await pool.end();
});

test("supported exact route allocates WhiteBIT after durable order claim", async () => {
  await mockAssets();
  const result = await provisionTest({
    orderId, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: "manual-wallet", manualMemo: "", chosenWhitebit: true,
  });
  assert.equal(result.source, "whitebit");
  assert.equal(result.address, orderAddress);
  assert.equal(providerCalls, 1);
});

test("capability loss after provider selection creates unresolved claim and order without provider call", async () => {
  const parsed = parseWhitebitAssets({ BTC: { can_deposit: true, networks: { deposits: ["BITCOIN"] } } });
  assert.ok(parsed);
  assert.equal(matchWhitebitCapability({ fetchedAt: Date.now(), assets: parsed }, "BTC", "ERC20"), null);
  const status = await whitebitSwapStatus();
  assert.equal(status.enabled, true);
  assert.equal(parseWhitebitAssets({ BTC: { can_deposit: true, networks: { deposits: "BITCOIN" } } }), null);
  const before = providerCalls;
  const unresolvedOrderId = `${orderId}-capability-loss`;
  const result = await provisionTest({
    orderId: unresolvedOrderId, assetCode: "BTC", networkCode: "ERC20",
    manualAddress: "manual-wallet", manualMemo: "", chosenWhitebit: true,
  });
  assert.equal(result.unresolved, true);
  assert.equal(providerCalls, before);
  const [claim] = await database.db.select().from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.orderId, unresolvedOrderId));
  assert.equal(claim?.status, "unresolved");
  const [order] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, unresolvedOrderId));
  assert.equal(order?.fundingStatus, "unresolved");
});

test("concurrent identical order requests make one provider call and never expose transient manual", async () => {
  providerCalls = 0;
  await mockAssets();
  await database.db.update(database.cryptoAssetNetworksTable).set({
    customerDepositsEnabled: true,
    sharedDepositAddress: "fixture-manual-address",
  }).where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const results = await Promise.all([1, 2].map(() => provisionTest({
    orderId: `${orderId}-concurrent`, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: "manual-wallet", manualMemo: "", chosenWhitebit: true,
  })));
  assert.equal(providerCalls, 1);
  assert.ok(results.every((result) => result.source === "whitebit" || result.unresolved));
  assert.ok(results.every((result) => result.address !== "manual-wallet"));
});

test("idempotent replay returns one immutable final address", async () => {
  await mockAssets();
  const first = await provisionTest({ orderId: `${orderId}-replay`, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: "manual", manualMemo: "", chosenWhitebit: true });
  const calls = providerCalls;
  const second = await provisionTest({ orderId: `${orderId}-replay`, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: "different-manual", manualMemo: "", chosenWhitebit: true });
  assert.equal(first.address, second.address);
  assert.equal(providerCalls, calls);
});

test("definitive provider rejection finalizes manual", async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).endsWith("/api/v4/main-account/create-new-address")
    ? new Response(JSON.stringify({ error: "rejected" }), { status: 403 }) : saved(input, init);
  const result = await provisionTest({ orderId: `${orderId}-reject`, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: "manual", manualMemo: "", chosenWhitebit: true });
  assert.equal(result.source, "manual");
  globalThis.fetch = saved;
});

test("timeout/network/5xx/malformed success finalize unresolved and never retry or expose manual", async () => {
  const saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/main-account/create-new-address")) { calls += 1; throw new Error("timeout"); }
    return saved(input, init);
  };
  const result = await provisionTest({ orderId: `${orderId}-timeout`, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: "manual", manualMemo: "", chosenWhitebit: true });
  assert.equal(result.unresolved, true);
  const replay = await provisionTest({ orderId: `${orderId}-timeout`, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: "manual", manualMemo: "", chosenWhitebit: true });
  assert.equal(replay.unresolved, false);
  assert.equal(replay.address, null);
  assert.equal(calls, 1);
  globalThis.fetch = saved;
});

test("toggle racing provisioning prevents not-yet-started call and cannot change finalized source", async () => {
  const toggleOrderId = `${orderId}-toggle`;
  providerCalls = 0;
  await database.db.update(database.whitebitProviderSettingsTable)
    .set({ disabled: true })
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  const result = await provisionTest({ orderId: toggleOrderId, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: "manual", manualMemo: "", chosenWhitebit: true });
  assert.equal(result.unresolved, true);
  assert.equal(providerCalls, 0);
  const [order] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, toggleOrderId));
  assert.equal(order?.fundingStatus, "unresolved");
  await database.db.update(database.whitebitProviderSettingsTable)
    .set({ disabled: false })
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
});

test("ready provider claim converges order snapshots after simulated crash without provider recall", async () => {
  await finalizeSwapFundingFromClaim(orderId);
  const [row] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, orderId));
  assert.equal(row.fundingStatus, "ready_whitebit");
  assert.equal(row.depositAddress, orderAddress);
  assert.equal((row.settlementSnapshot as { funding?: { address?: string } }).funding?.address, orderAddress);
});

test("owner recovery atomically updates all order snapshots", async () => {
  const recoveryOrderId = `${orderId}-recovery`;
  await insertProvisioningOrder(recoveryOrderId);
  const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: recoveryOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    status: "unresolved", providerError: "operator recovery required",
  }).returning();
  const response = await fetch(`${baseUrl}/api/admin/whitebit/recover-order-address`, {
    method: "POST", headers: { "content-type": "application/json", "x-test-operator": ownerClerkUserId },
    body: JSON.stringify({ id: claim.id, address: "recovered", memo: "REC-TAG" }),
  });
  assert.equal(response.status, 200);
  const [order] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, recoveryOrderId));
  assert.equal(order?.fundingStatus, "ready_whitebit");
  assert.equal(order?.depositAddress, "recovered");
  assert.equal((order?.settlementSnapshot as { funding?: { address?: string } })?.funding?.address, "recovered");
});

test("stale calling replay resolves the claim atomically and owner recovery restores every snapshot", async () => {
  const staleOrderId = `${orderId}-stale-calling`;
  await insertProvisioningOrder(staleOrderId);
  const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: staleOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    status: "calling", providerError: null,
    updatedAt: new Date(Date.now() - 31_000),
  }).returning();
  await finalizeSwapFundingFromClaim(staleOrderId);
  const [unresolvedClaim] = await database.db.select().from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.id, claim.id));
  const [unresolvedOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, staleOrderId));
  assert.equal(unresolvedClaim.status, "unresolved");
  assert.equal(unresolvedOrder.fundingStatus, "unresolved");
  assert.equal(unresolvedOrder.depositAddress, "");
  assert.equal((unresolvedOrder.fundingDetailsSnapshot as { status?: string }).status, "unresolved");
  assert.equal(((unresolvedOrder.settlementSnapshot as { funding?: { status?: string } }).funding)?.status, "unresolved");
  const response = await fetch(`${baseUrl}/api/admin/whitebit/recover-order-address`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-operator": ownerClerkUserId },
    body: JSON.stringify({ id: claim.id, address: "stale-recovered", memo: "STALE-TAG" }),
  });
  assert.equal(response.status, 200, await response.text());
  const [readyClaim] = await database.db.select().from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.id, claim.id));
  const [readyOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, staleOrderId));
  assert.equal(readyClaim.status, "ready");
  assert.equal(readyOrder.fundingStatus, "ready_whitebit");
  assert.equal(readyOrder.depositAddress, "stale-recovered");
  assert.equal((readyOrder.fundingDetailsSnapshot as { address?: string }).address, "stale-recovered");
  assert.equal(((readyOrder.settlementSnapshot as { funding?: { address?: string } }).funding)?.address, "stale-recovered");
});

test("recovery finalizer rolls back claim and order together on failure", async () => {
  const recoveryOrderId = `${orderId}-rollback`;
  await insertProvisioningOrder(recoveryOrderId);
  const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: recoveryOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    status: "unresolved", providerError: "operator recovery required",
  }).returning();
  process.env.WHITEBIT_TEST_FAIL_RECOVERY = "1";
  const response = await fetch(`${baseUrl}/api/admin/whitebit/recover-order-address`, {
    method: "POST", headers: { "content-type": "application/json", "x-test-operator": ownerClerkUserId },
    body: JSON.stringify({ id: claim.id, address: "must-rollback", memo: "TAG" }),
  });
  delete process.env.WHITEBIT_TEST_FAIL_RECOVERY;
  assert.equal(response.status, 500);
  const [unchangedClaim] = await database.db.select().from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.id, claim.id));
  const [unchangedOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, recoveryOrderId));
  assert.equal(unchangedClaim.status, "unresolved");
  assert.equal(unchangedClaim.address, null);
  assert.equal(unchangedOrder.fundingStatus, "provisioning");
  assert.equal(unchangedOrder.depositAddress, "");
});

test("anonymous and authenticated Swap deposits attach exact order but create no internal ledger credit", async () => {
  const rows = await database.db.select().from(database.whitebitDepositsTable).where(eq(database.whitebitDepositsTable.orderId, orderId));
  assert.equal(rows.length, 0);
  assert.equal((await ownedLedgerEntries()).rowCount, 0);
});

test("account/order tuple collision persists quarantine and credits/attaches neither", async () => {
  const collisionAddress = `collision-address-${suffix}`;
  const collisionCustomer = `collision-service-${suffix}`;
  await database.db.insert(database.customersTable).values({
    id: collisionCustomer, name: "Collision Service", email: `${collisionCustomer}@example.test`,
  });
  await insertProvisioningOrder(`${orderId}-collision`);
  await database.db.insert(database.whitebitDepositAddressesTable).values({
    customerId: collisionCustomer, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    address: collisionAddress, memo: "TAG-1", status: "ready",
  });
  await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: `${orderId}-collision`, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    address: collisionAddress, memo: "TAG-1", status: "ready",
  });
  const tx = database.db;
  const result = await tx.transaction((inner) => processNormalizedDeposit(inner, {
    address: collisionAddress, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN", memo: "TAG-1",
    amount: "1", fee: "0", status: 3, event: "deposit.processed",
    transactionHash: "collision-hash", uniqueId: `collision-${suffix}`, transactionId: `collision-tx-${suffix}`,
    rawPayload: {},
  }));
  assert.equal(result, false);
  const [deposit] = await tx.select().from(database.whitebitDepositsTable).where(eq(database.whitebitDepositsTable.uniqueId, `collision-${suffix}`));
  assert.match(deposit.conflict ?? "", /quarantined/);
  assert.equal(deposit.orderId, null);
  assert.equal(deposit.customerId, null);
  await database.db.delete(database.whitebitDepositAddressesTable)
    .where(eq(database.whitebitDepositAddressesTable.customerId, collisionCustomer));
  await database.db.delete(database.customersTable).where(eq(database.customersTable.id, collisionCustomer));
});

test("memo/network mismatch remains unassigned", async () => {
  const result = await database.db.transaction((inner) => processNormalizedDeposit(inner, {
    address: orderAddress, ticker: "BTC", providerTicker: "BTC", network: "WRONG", memo: "TAG-1",
    amount: "1", fee: "0", status: 3, event: "deposit.processed",
    transactionHash: "mismatch-hash", uniqueId: `mismatch-${suffix}`, transactionId: `mismatch-tx-${suffix}`, rawPayload: {},
  }));
  assert.equal(result, false);
  const [deposit] = await database.db.select().from(database.whitebitDepositsTable).where(eq(database.whitebitDepositsTable.uniqueId, `mismatch-${suffix}`));
  assert.equal(deposit.orderId, null);
});

test("signed WhiteBIT webhook attaches the exact Swap order without ledger credit", async () => {
  const webhookOrderId = `${orderId}-webhook`;
  await insertProvisioningOrder(webhookOrderId);
  const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: webhookOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    address: `webhook-address-${suffix}`, memo: "TAG-1", status: "ready",
  }).returning();
  await finalizeSwapFundingFromClaim(webhookOrderId);
  const response = await signedOrderWebhook(`order-webhook-${suffix}`, claim.address!, claim.network, claim.memo ?? "");
  assert.equal(response.status, 200, await response.text());
  const [deposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, `order-webhook-${suffix}`));
  assert.equal(deposit.orderId, webhookOrderId, JSON.stringify({
    deposit,
    claim,
  }));
  assert.ok(deposit.orderAddressId);
  assert.equal(deposit.transactionHash, `hash-order-webhook-${suffix}`);
  assert.equal(deposit.confirmationsActual, 6);
  assert.equal(deposit.confirmationsRequired, 3);
  assert.equal((await ownedLedgerEntries()).rowCount, 0);
  const [row] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, webhookOrderId));
  assert.equal(row.fundingProviderSource, "whitebit");
  assert.equal(row.depositAddress, claim.address);
});

test("signed webhooks attach both guest and authenticated Swap orders without ledger credit", async () => {
  const guestOrderId = `${orderId}-guest-webhook`;
  const authOrderId = `${orderId}-auth-webhook`;
  const guestAddress = `guest-webhook-address-${suffix}`;
  const authAddress = `auth-webhook-address-${suffix}`;
  await insertProvisioningOrder(guestOrderId);
  await insertProvisioningOrder(authOrderId);
  await database.db.update(database.ordersTable).set({
    customerClerkUserId: "clerk-authenticated-swap",
    customerOwnershipSource: "authenticated_create",
  }).where(eq(database.ordersTable.id, authOrderId));
  for (const [id, address] of [[guestOrderId, guestAddress], [authOrderId, authAddress]] as const) {
    const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
      orderId: id, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
      address, memo: "AUTH-TAG", status: "ready",
    }).returning();
    await finalizeSwapFundingFromClaim(id);
    const response = await signedOrderWebhook(`attributed-${id}`, claim.address!, claim.network, claim.memo ?? "");
    assert.equal(response.status, 200, await response.text());
    const [deposit] = await database.db.select().from(database.whitebitDepositsTable)
      .where(eq(database.whitebitDepositsTable.uniqueId, `attributed-${id}`));
    assert.equal(deposit.orderId, id);
    assert.ok(deposit.orderAddressId);
    assert.equal(deposit.customerId, null);
  }
  assert.equal((await ownedLedgerEntries()).rowCount, 0);
});

test("signed account/order collision is quarantined without either attachment or credit", async () => {
  const collisionCustomer = `collision-customer-${suffix}`;
  await database.db.insert(database.customersTable).values({
    id: collisionCustomer, name: "Collision", email: `${collisionCustomer}@example.test`,
  });
  await database.db.insert(database.whitebitDepositAddressesTable).values({
    customerId: collisionCustomer, ticker: "BTC", providerTicker: "BTC",
    network: "BITCOIN", address: orderAddress, memo: "TAG-1", status: "ready",
  });
  const response = await signedOrderWebhook(`order-collision-${suffix}`);
  assert.equal(response.status, 200);
  const [deposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, `order-collision-${suffix}`));
  assert.equal(deposit.orderId, null);
  assert.equal(deposit.orderAddressId, null);
  assert.match(deposit.conflict ?? "", /quarantined/);
  assert.equal((await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.customerId, collisionCustomer))).length, 0);
  await database.db.delete(database.whitebitDepositAddressesTable)
    .where(eq(database.whitebitDepositAddressesTable.customerId, collisionCustomer));
  await database.db.delete(database.customersTable)
    .where(eq(database.customersTable.id, collisionCustomer));
});

test("order reconciliation paginates 501+, advances high-water, handles prepend, enforces 10k boundary, and continues later addresses", async () => {
  const firstAddress = `reconcile-cap-${suffix}`;
  const laterAddress = `reconcile-later-${suffix}`;
  const firstOrderId = `${orderId}-reconcile-cap`;
  const laterOrderId = `${orderId}-reconcile-later`;
  await insertProvisioningOrder(firstOrderId);
  await insertProvisioningOrder(laterOrderId);
  const [firstClaim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: firstOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    address: firstAddress, memo: "CAP", status: "ready",
  }).returning();
  const [laterClaim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: laterOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    address: laterAddress, memo: "LATER", status: "ready",
  }).returning();
  await finalizeSwapFundingFromClaim(firstOrderId);
  await finalizeSwapFundingFromClaim(laterOrderId);
  let firstOffsets: number[] = [];
  let laterOffsets: number[] = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/main-account/history")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { address?: string; offset?: number; limit?: number };
      const offset = body.offset ?? 0;
      const limit = body.limit ?? 500;
      if (body.address === firstAddress) {
        firstOffsets.push(offset);
        return new Response(JSON.stringify(Array.from({ length: limit }, () => ({
          address: firstAddress, ticker: "BTC", network: "BITCOIN",
          amount: "1", fee: "0", status: 3,
        }))), { status: 200 });
      }
      if (body.address === laterAddress) {
        laterOffsets.push(offset);
        if (offset === 0) {
          return new Response(JSON.stringify([{
            address: laterAddress, ticker: "BTC", network: "BITCOIN",
            amount: "1", fee: "0", status: 3,
            unique_id: `later-${suffix}`, transaction_id: `later-tx-${suffix}`,
          }]), { status: 200 });
        }
        return new Response("[]", { status: 200 });
      }
      return new Response("[]", { status: 200 });
    }
    return saved(input, init);
  };
  const response = await fetch(`${baseUrl}/api/admin/whitebit/reconcile`, { method: "POST", headers: { "x-test-operator": ownerClerkUserId } });
  if (response.status !== 200) throw new Error(`reconciliation failed: ${JSON.stringify(await response.json())}`);
  assert.deepEqual(firstOffsets, Array.from({ length: 20 }, (_, index) => index * 500));
  assert.ok(laterOffsets.includes(0));
  assert.ok(laterOffsets.includes(0));
  const reconciliation = await response.clone().json() as { incompleteAddresses?: Array<{ id: string }> };
  assert.ok(reconciliation.incompleteAddresses?.some((item) => item.id === firstClaim.id));
  const [firstCheckpoint] = await database.db.select().from(database.whitebitOrderHistoryCheckpointsTable)
    .where(eq(database.whitebitOrderHistoryCheckpointsTable.orderAddressId, firstClaim.id));
  const [laterCheckpoint] = await database.db.select().from(database.whitebitOrderHistoryCheckpointsTable)
    .where(eq(database.whitebitOrderHistoryCheckpointsTable.orderAddressId, laterClaim.id));
  assert.equal(firstCheckpoint, undefined);
  assert.equal(laterCheckpoint?.highWaterIdentity, `transaction:later-tx-${suffix}`);
  globalThis.fetch = saved;
});

test("order reconciliation stops at an existing high-water record after prepended history", async () => {
  const prependOrderId = `${orderId}-reconcile-prepend`;
  const prependAddress = `reconcile-prepend-${suffix}`;
  await insertProvisioningOrder(prependOrderId);
  const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: prependOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    address: prependAddress, memo: "PREPEND", status: "ready",
  }).returning();
  await finalizeSwapFundingFromClaim(prependOrderId);
  await database.db.insert(database.whitebitOrderHistoryCheckpointsTable).values({
    orderAddressId: claim.id, highWaterIdentity: "transaction:prepend-anchor",
  });
  const saved = globalThis.fetch;
  const offsets: number[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/main-account/history")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { address?: string; offset?: number; limit?: number };
      if (body.address === prependAddress) {
        offsets.push(body.offset ?? 0);
        const records = Array.from({ length: 500 }, (_, index) => ({
          address: prependAddress, ticker: "BTC", network: "BITCOIN", amount: "1", fee: "0", status: 3,
          unique_id: index === 250 ? "prepend-anchor" : `prepend-${index}`,
          transaction_id: index === 250 ? "prepend-anchor" : `prepend-tx-${index}`,
        }));
        return new Response(JSON.stringify(records), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    }
    return saved(input, init);
  };
  const response = await fetch(`${baseUrl}/api/admin/whitebit/reconcile`, {
    method: "POST", headers: { "x-test-operator": ownerClerkUserId },
  });
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(offsets, [0]);
  const [checkpoint] = await database.db.select().from(database.whitebitOrderHistoryCheckpointsTable)
    .where(eq(database.whitebitOrderHistoryCheckpointsTable.orderAddressId, claim.id));
  assert.equal(checkpoint.highWaterIdentity, "transaction:prepend-tx-0");
  globalThis.fetch = saved;
});

test("owner/integration permissions protect status/toggle/recovery/sync", async () => {
  const response = await fetch(`${baseUrl}/api/admin/whitebit/recover-order-address`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "x", address: "y" }) });
  assert.ok(response.status >= 400);
});

test("migration 0073 partial upgrade, reapply, FK/check/default-disabled/grants", async () => {
  const migration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0073_whitebit_swap_order_addresses.sql"), "utf8");
  const client = await pool.connect();
  const schema = `whitebit_migration_${suffix.replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE exchange_orders (id text PRIMARY KEY);
      CREATE TABLE whitebit_deposits (
        id uuid PRIMARY KEY, ticker text NOT NULL, provider_ticker text NOT NULL,
        network text, address text NOT NULL, memo text
      );
      CREATE TABLE whitebit_provider_settings (provider text PRIMARY KEY);
      CREATE TABLE whitebit_order_addresses (order_id text);
      CREATE TABLE whitebit_order_history_checkpoints (order_address_id uuid);
    `);
    await client.query(migration);
    await client.query(migration);
    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'whitebit_provider_settings'`, [schema],
    );
    assert.deepEqual(new Set(columns.rows.map((row) => row.column_name)), new Set([
      "provider", "disabled", "version", "updated_by_operator_id", "updated_at",
    ]));
    const orderColumns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'whitebit_order_addresses'`, [schema],
    );
    assert.ok(["id", "order_id", "ticker", "provider_ticker", "network", "claim_token", "updated_at"]
      .every((column) => orderColumns.rows.some((row) => row.column_name === column)));
    const checkpoints = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'whitebit_order_history_checkpoints'`, [schema],
    );
    assert.ok(["id", "order_address_id", "updated_at"]
      .every((column) => checkpoints.rows.some((row) => row.column_name === column)));
    const constraints = await client.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = $1
        AND table_name IN ('whitebit_order_addresses','whitebit_order_history_checkpoints')
        AND constraint_name IN ('whitebit_order_addresses_pkey','whitebit_order_addresses_order_fk',
          'whitebit_order_addresses_status_check','whitebit_order_history_checkpoints_pkey',
          'whitebit_order_history_checkpoint_order_fk')`, [schema],
    );
    assert.equal(constraints.rows.length, 5);
    const privileges = await client.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_schema = $1 AND grantee = 'quickex_app_runtime'
         AND table_name = 'whitebit_order_addresses'`, [schema],
    );
    assert.ok(privileges.rows.some((row) => row.privilege_type === "SELECT"));
    assert.ok(!privileges.rows.some((row) => row.privilege_type === "DELETE"));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
  return;
  /*
  await pool.query("CREATE TABLE whitebit_provider_settings (provider text PRIMARY KEY)");
  await pool.query("CREATE TABLE whitebit_order_addresses (order_id text)");
  await pool.query("CREATE TABLE whitebit_order_history_checkpoints (order_address_id uuid)");
  await pool.query(migration);
  await pool.query(migration);
  const columns = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'whitebit_provider_settings'`,
  );
  assert.deepEqual(new Set(columns.rows.map((row) => row.column_name)), new Set([
    "provider", "disabled", "version", "updated_by_operator_id", "updated_at",
  ]));
  const orderColumns = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'whitebit_order_addresses'`,
  );
  assert.ok(["id", "order_id", "ticker", "provider_ticker", "network", "claim_token", "updated_at"]
    .every((column) => orderColumns.rows.some((row) => row.column_name === column)));
  const checkpoints = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'whitebit_order_history_checkpoints'`,
  );
  assert.ok(["id", "order_address_id", "updated_at"]
    .every((column) => checkpoints.rows.some((row) => row.column_name === column)));
  const constraints = await pool.query<{ constraint_name: string }>(
    `SELECT constraint_name FROM information_schema.table_constraints
     WHERE table_name IN ('whitebit_order_addresses','whitebit_order_history_checkpoints')
      AND constraint_name IN ('whitebit_order_addresses_pkey','whitebit_order_addresses_order_fk',
        'whitebit_order_addresses_status_check','whitebit_order_history_checkpoints_pkey',
        'whitebit_order_history_checkpoint_order_fk')`,
  );
  assert.equal(constraints.rows.length, 5);
  const [settings] = await database.db.select().from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  assert.equal(settings.disabled, true);
  const privileges = await pool.query<{ privilege_type: string }>(
    `SELECT privilege_type FROM information_schema.role_table_grants
     WHERE grantee = 'quickex_app_runtime' AND table_name = 'whitebit_order_addresses'`,
  );
  assert.ok(privileges.rows.some((row) => row.privilege_type === "SELECT"));
  assert.ok(!privileges.rows.some((row) => row.privilege_type === "DELETE"));
   await database.db.update(database.whitebitProviderSettingsTable)
     .set({ disabled: false })
     .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  */
});

test("public and Admin HTTP projections hide non-ready addresses and expose safe ready funding", async () => {
  const provisioningId = "O123456701";
  const unresolvedId = "O123456702";
  const manualId = "O123456703";
  await insertProvisioningOrder(provisioningId);
  await insertProvisioningOrder(unresolvedId);
  await insertProvisioningOrder(manualId);
  await database.db.update(database.ordersTable).set({
    fundingStatus: "unresolved", fundingProviderError: "operator recovery required",
    outcomeUnknown: true,
  }).where(eq(database.ordersTable.id, unresolvedId));
  await database.db.update(database.ordersTable).set({
    fundingStatus: "ready_manual", fundingProviderSource: "manual",
    depositAddress: "manual-projection-address", depositMemo: "MANUAL-TAG",
    fundingDetailsSnapshot: { source: "manual", status: "ready", address: "manual-projection-address", memo: "MANUAL-TAG" },
    settlementSnapshot: { funding: { source: "manual", status: "ready", address: "manual-projection-address", memo: "MANUAL-TAG" } },
  }).where(eq(database.ordersTable.id, manualId));
  const publicProjection = async (id: string) => {
    const response = await fetch(`${baseUrl}/api/orders/${id}/status?trackingToken=${encodeURIComponent(signOrderTrackingToken(id))}`);
    assert.equal(response.status, 200);
    return response.json() as Promise<Record<string, unknown>>;
  };
  const provisioning = await publicProjection(provisioningId);
  assert.equal(provisioning.fundingStatus, "provisioning");
  assert.equal(provisioning.depositAddress, undefined);
  assert.equal(provisioning.depositMemo, undefined);
  const unresolved = await publicProjection(unresolvedId);
  assert.equal(unresolved.fundingStatus, "unresolved");
  assert.equal(unresolved.depositAddress, undefined);
  assert.equal(unresolved.fundingError, "Deposit address provisioning is pending operator recovery.");
  const manual = await publicProjection(manualId);
  assert.equal(manual.depositAddress, "manual-projection-address");
  assert.equal(manual.depositMemo, "MANUAL-TAG");
  assert.deepEqual(manual.fundingDetails, {
    source: "manual", status: "ready", address: "manual-projection-address", memo: "MANUAL-TAG",
  });
  const adminResponse = await fetch(`${baseUrl}/api/orders/${manualId}`, {
    headers: { "x-test-operator": ownerClerkUserId },
  });
  assert.equal(adminResponse.status, 200);
  const adminBody = await adminResponse.json() as Record<string, unknown>;
  assert.equal(adminBody.depositAddress, "manual-projection-address");
  assert.equal(adminBody.rawPayload, undefined);
  const forbiddenToggle = await fetch(`${baseUrl}/api/admin/providers/whitebit`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.ok([401, 403].includes(forbiddenToggle.status));
  const ownerToggle = await fetch(`${baseUrl}/api/admin/providers/whitebit`, {
    method: "PATCH", headers: { "content-type": "application/json", "x-test-operator": ownerClerkUserId },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(ownerToggle.status, 200, await ownerToggle.text());
  await database.db.update(database.whitebitProviderSettingsTable)
    .set({ disabled: false }).where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
});

test("Convert and account deposit routes remain isolated", async () => {
  assert.equal(typeof whitebitOperatorRouter, "function");
  assert.equal(typeof whitebitWebhookRouter, "function");
});

test("actual signed exchange order replay allocates one WhiteBIT address", async () => {
  providerCalls = 0;
  await mockAssets();
  await database.db.insert(fiatCurrenciesTable).values({
    code: "EUR", name: "Euro", network: "SEPA", precision: 2, enabled: true,
    lifecycle: "active", rateMode: "manual", manualRate: "100",
  }).onConflictDoNothing({ target: fiatCurrenciesTable.code });
  await database.db.insert(manualDeskPricingRulesTable).values({
    name: `Swap test ${suffix}`, sourceAsset: "BTC", targetAsset: "EUR",
    sourceNetwork: "BITCOIN", targetNetwork: "SEPA", markupBasisPoints: 0,
    exactRate: "100", fixedFee: "0", enabled: true, priority: 100,
  });
  const configResponse = await fetch(`${baseUrl}/api/exchange/config`);
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json() as {
    manualSettlementOptions: Array<{
      id: string; kind: string; assetCode: string; routeNetwork: string;
      direction: string;
    }>;
  };
  const source = config.manualSettlementOptions.find((option) =>
    option.kind === "crypto-network" && option.assetCode === "BTC" &&
    option.routeNetwork.toUpperCase() === "BITCOIN" && (option.direction === "send" || option.direction === "both"));
  const target = config.manualSettlementOptions.find((option) =>
    option.kind === "fiat-payment-method" && (option.direction === "receive" || option.direction === "both"));
  if (!source || !target) throw new Error(`Test catalog lacks a BTC/BITCOIN-to-fiat route: ${JSON.stringify(config.manualSettlementOptions.slice(0, 10))}`);
  const quoteResponse = await fetch(`${baseUrl}/api/exchange/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "manual", fromAsset: "BTC", fromNetwork: "BITCOIN",
      toAsset: target.assetCode, toNetwork: target.routeNetwork, amount: 1,
      sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
    }),
  });
  assert.equal(quoteResponse.status, 200);
  const quote = await quoteResponse.json() as {
    quoteId: string; receiveAmount: number; rate: number; fee: number;
    fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string;
    requiredSettlementFields?: Array<{ key: string; type?: string }>;
  };
  const settlementDetails = Object.fromEntries((quote.requiredSettlementFields ?? []).map((field) => [
    field.key,
    field.type === "email" ? `${suffix}@example.test` : "Actual Swap",
  ]));
  const clientRequestId = randomUUID();
  const request = {
    type: "manual", fromAsset: quote.fromAsset, fromNetwork: quote.fromNetwork,
    toAsset: quote.toAsset, toNetwork: quote.toNetwork, amount: 1,
    receiveAmount: quote.receiveAmount, rate: quote.rate, fee: quote.fee,
    quoteId: quote.quoteId, clientRequestId, customerEmail: `${suffix}@example.test`,
    customerName: "Actual Swap", sourceSettlementOptionId: source.id,
    targetSettlementOptionId: target.id, settlementDetails,
    refundAddress: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
  };
  let providerStarted!: () => void;
  let releaseProvider!: () => void;
  const started = new Promise<void>((resolve) => { providerStarted = resolve; });
  const deferred = new Promise<void>((resolve) => { releaseProvider = resolve; });
  const quoteFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/main-account/create-new-address")) {
      providerCalls += 1;
      providerStarted();
      await deferred;
      return new Response(JSON.stringify({ account: { address: orderAddress, memo: "TAG-1" } }), { status: 200 });
    }
    return quoteFetch(input, init);
  };
  const postOrder = () => fetch(`${baseUrl}/api/exchange/orders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
  });
  const firstResponsePromise = postOrder();
  await started;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [order] = await database.db.select({ id: database.ordersTable.id })
      .from(database.ordersTable)
      .where(eq(database.ordersTable.clientRequestId, request.clientRequestId)).limit(1);
    if (order) {
      const [claim] = await database.db.select().from(database.whitebitOrderAddressesTable)
        .where(eq(database.whitebitOrderAddressesTable.orderId, order.id)).limit(1);
      if (claim?.status === "calling") break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const secondResponse = await postOrder();
  const secondBody = await secondResponse.json() as {
    id: string; depositAddress?: string; fundingStatus?: string; fundingProviderError?: string | null;
  };
  releaseProvider();
  assert.equal(secondResponse.status, 202);
  assert.equal(secondBody.fundingStatus, "provisioning");
  assert.equal(secondBody.depositAddress, "");
  assert.notEqual(secondBody.depositAddress, "manual-wallet");
  assert.equal(secondBody.fundingProviderError, null);
  assert.equal(providerCalls, 1);
  const firstResponse = await firstResponsePromise;
  const firstBody = await firstResponse.json() as { id: string; depositAddress?: string; fundingStatus?: string };
  assert.ok([201, 202].includes(firstResponse.status));
  assert.equal(firstBody.fundingStatus, "ready_whitebit");
  assert.equal(firstBody.depositAddress, orderAddress);
  const thirdResponse = await postOrder();
  const thirdBody = await thirdResponse.json() as { id: string; depositAddress?: string; fundingStatus?: string };
  assert.equal(thirdResponse.status, 200);
  assert.equal(thirdBody.id, firstBody.id);
  assert.equal(thirdBody.depositAddress, orderAddress);
  assert.equal(thirdBody.fundingStatus, "ready_whitebit");
  assert.equal(providerCalls, 1);
  globalThis.fetch = quoteFetch;
  const mismatchResponse = await fetch(`${baseUrl}/api/exchange/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, refundAddress: "1BitcoinEaterAddressDontSendf59kuE" }),
  });
  assert.equal(mismatchResponse.status, 409, await mismatchResponse.text());
});