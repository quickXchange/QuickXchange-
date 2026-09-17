import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import test, { after, before } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";
import * as database from "@workspace/db";
import { replayHistoryRecord, whitebitWebhookRouter, default as whitebitRouter, whitebitOperatorRouter } from "../src/routes/whitebit";
import { configureCustomerAuthorizationForTests } from "../src/lib/customer-auth";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";

process.env.NODE_ENV = "test";
process.env.WHITEBIT_WEBHOOK_API_KEY = `webhook-key-${randomUUID()}`;
process.env.WHITEBIT_WEBHOOK_SECRET = `webhook-secret-${randomUUID()}`;

const pool = createPrivilegedTestPool();
const suffix = randomUUID();
const customerId = `whitebit-test-${suffix}`;
const clerkUserId = `whitebit-clerk-${suffix}`;
const address = `whitebit-address-${suffix}`;
const ticker = "BTC";
const network = "BITCOIN";
let server: ReturnType<typeof app.listen>;
const app = express();
app.use(express.json({ verify: (req, _res, buffer) => {
  (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
} }));
app.use("/api", whitebitWebhookRouter);
app.use("/api", whitebitRouter);
app.use("/api", whitebitOperatorRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status((error as { status?: number }).status ?? 500).json({ error: String(error) });
});
let baseUrl = "";
let nonce = 1000000000000;
let providerCreateCalls = 0;
let reconciliationRun = 0;
let priorProviderSetting: typeof database.whitebitProviderSettingsTable.$inferSelect | null = null;
const reconciliationRecords = Array.from({ length: 501 }, (_, index) => ({
  address, ticker, network, amount: "0.00000001", fee: "0", status: 3,
  unique_id: `history-${suffix}-${index}`, transaction_id: `history-tx-${suffix}-${index}`,
}));
const originalFetch = globalThis.fetch;

async function ensureWhitebitSchema(): Promise<void> {
  const migration0072 = await readFile(resolve(
    process.cwd(), "../../lib/db/migrations/0072_whitebit_customer_deposits.sql",
  ), "utf8");
  const migration0073 = await readFile(resolve(
    process.cwd(), "../../lib/db/migrations/0073_whitebit_swap_order_addresses.sql",
  ), "utf8");
  await pool.query(migration0072);
  await pool.query(migration0073);
  return;
  /*
  const result = await pool.query<{ present: string | null }>(
    "SELECT to_regclass('public.whitebit_deposit_addresses') AS present",
  );
  if (result.rows[0]?.present) {
    // This suite owns these ephemeral tables; normalize leftovers from interrupted
    // test bootstraps before applying the current migration.
    await pool.query(`
      CREATE TABLE whitebit_deposit_addresses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id text NOT NULL, ticker text NOT NULL, network text NOT NULL DEFAULT '', address text, memo text, status text NOT NULL DEFAULT 'pending', claim_token uuid DEFAULT gen_random_uuid(), provider_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (customer_id, ticker, network));
      CREATE TABLE whitebit_deposits (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id text, address_id uuid, ticker text NOT NULL, network text, address text NOT NULL, memo text, amount numeric NOT NULL, fee numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'unknown', provider_status integer, transaction_hash text, unique_id text, transaction_id text, envelope_id text, provider_identity text NOT NULL, raw_payload jsonb, credited_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE whitebit_webhook_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), envelope_id text NOT NULL UNIQUE, nonce numeric NOT NULL UNIQUE, method text NOT NULL, payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now());
    `);
    const migration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0072_whitebit_customer_deposits.sql"), "utf8");
    await pool.query(migration);
    await pool.query(await readFile(resolve(process.cwd(), "../../lib/db/migrations/0073_whitebit_swap_order_addresses.sql"), "utf8"));
    await pool.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON whitebit_deposit_addresses,
        whitebit_history_checkpoints, whitebit_webhook_deliveries, whitebit_deposits, whitebit_ledger_entries
        TO quickex_app_runtime
    `);
    return;
  }
  // Exercise the in-place upgrade path from the immediately prior partial
  // schema before applying the current migration.
  await pool.query(`
    CREATE TABLE whitebit_deposit_addresses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id text NOT NULL,
      ticker text NOT NULL, network text NOT NULL DEFAULT '', address text, memo text,
      status text NOT NULL DEFAULT 'pending', claim_token uuid DEFAULT gen_random_uuid(),
      provider_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (customer_id, ticker, network)
    );
    CREATE TABLE whitebit_deposits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id text,
      address_id uuid, ticker text NOT NULL, network text, address text NOT NULL, memo text,
      amount numeric NOT NULL, fee numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'unknown',
      provider_status integer, transaction_hash text, unique_id text, transaction_id text,
      envelope_id text, provider_identity text NOT NULL, raw_payload jsonb,
      credited_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE whitebit_webhook_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), envelope_id text NOT NULL UNIQUE,
      nonce numeric NOT NULL UNIQUE, method text NOT NULL, payload jsonb NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const migration = await readFile(
    resolve(process.cwd(), "../../lib/db/migrations/0072_whitebit_customer_deposits.sql"),
    "utf8",
  );
  await pool.query(migration);
  await pool.query(migration);
  await pool.query(await readFile(resolve(process.cwd(), "../../lib/db/migrations/0073_whitebit_swap_order_addresses.sql"), "utf8"));
  await pool.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON whitebit_deposit_addresses,
      whitebit_history_checkpoints, whitebit_webhook_deliveries, whitebit_deposits, whitebit_ledger_entries
      TO quickex_app_runtime
  `);
  */
}

async function webhook(method: string, id: string, params: Record<string, unknown>, fixedNonce?: number) {
  const body = JSON.stringify({ method, params: { ...params, nonce: fixedNonce ?? ++nonce }, id });
  const payload = Buffer.from(body).toString("base64");
  const signature = createHmac("sha512", process.env.WHITEBIT_WEBHOOK_SECRET!).update(payload).digest("hex");
  const response = await fetch(`${baseUrl}/api/webhooks/whitebit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-txc-apikey": process.env.WHITEBIT_WEBHOOK_API_KEY!,
      "x-txc-payload": payload,
      "x-txc-signature": signature,
    },
    body,
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function depositParams(uniqueId: string, status: number) {
  return {
    address, ticker, currency: ticker, network, amount: "1.25000000", fee: "0",
    transactionHash: `tx-${uniqueId}`, uniqueId, status,
  };
}

before(async () => {
  process.env.WHITEBIT_API_KEY = "test-provider-key";
  process.env.WHITEBIT_API_SECRET = "test-provider-secret";
  configureCustomerAuthorizationForTests({ getUserId: () => clerkUserId, getVerifiedEmail: () => `${suffix}@example.test` });
  configureOperatorAuthorizationForTests({ getUserId: (req) => req.get("x-test-operator") ?? null, getVerifiedEmail: () => `${suffix}@example.test` });
  priorProviderSetting = (await database.db.select().from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit")).limit(1))[0] ?? null;
  await ensureWhitebitSchema();
  await database.db.insert(database.whitebitProviderSettingsTable)
    .values({ provider: "whitebit", disabled: false })
    .onConflictDoUpdate({ target: database.whitebitProviderSettingsTable.provider, set: { disabled: false } });
  await database.db.insert(database.customersTable).values({
    id: customerId, name: "WhiteBIT Test", email: `${suffix}@example.test`,
  });
  await database.db.insert(database.customerProfilesTable).values({
    customerId, clerkUserId, firstName: "WhiteBIT", lastName: "Test",
  });
  await database.db.insert(database.operatorsTable).values({
    email: `${suffix}@operator.test`, clerkUserId: `operator-${suffix}`, name: "Test operator", role: "operator", status: "active",
  });
  await database.db.insert(database.operatorsTable).values({
    email: `${suffix}@owner.test`, clerkUserId: `owner-${suffix}`, name: "Test owner", role: "owner", status: "active",
  });
  await database.db.insert(database.whitebitDepositAddressesTable).values({
    customerId, ticker, providerTicker: ticker, network, address, status: "ready",
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("whitebit.com/api/v4/main-account/create-new-address")) {
      providerCreateCalls += 1;
      if (providerCreateCalls === 1) return new Response(JSON.stringify({ account: { address: `generated-${suffix}`, memo: null } }), { status: 200 });
      throw new Error("unexpected duplicate provider call");
    }
    if (url.includes("whitebit.com/api/v4/main-account/history")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { offset?: number; limit?: number; address?: string };
      if (request.address !== address) return new Response(JSON.stringify([]), { status: 200 });
      const offset = request.offset ?? 0;
      const records = reconciliationRun === 0
        ? reconciliationRecords.slice(offset, offset + (request.limit ?? 500))
        : [{ ...reconciliationRecords[0], unique_id: `history-new-${suffix}`, transaction_id: `history-new-tx-${suffix}` }, ...reconciliationRecords].slice(offset, offset + (request.limit ?? 500));
      return new Response(JSON.stringify(records), { status: 200 });
    }
    return originalFetch(input, init);
  };
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  const ownedUniqueIds = [
    "provider-1", "provider-2", "provider-unknown", "provider-replay",
    "provider-concurrent", "ignored",
  ];
  const ownedEnvelopeIds = [
    "delivery-accepted", "delivery-updated", "delivery-processed", "delivery-processed-duplicate",
    "delivery-seven", "delivery-unknown", "delivery-concurrent-a", "delivery-concurrent-b",
    "delivery-provisional", "delivery-alias", "delivery-concurrent-alias-a", "delivery-concurrent-alias-b",
    "delivery-immutable-a",
  ];
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  const cleanup = await pool.connect();
  try {
    await cleanup.query("BEGIN");
    await cleanup.query("SET LOCAL session_replication_role = replica");
    await cleanup.query("DELETE FROM whitebit_ledger_entries WHERE customer_id = $1 OR deposit_id IN (SELECT id FROM whitebit_deposits WHERE customer_id = $1 OR address = $2 OR unique_id LIKE $3 OR unique_id = ANY($4))", [customerId, address, `%-${suffix}-%`, ownedUniqueIds]);
    await cleanup.query("COMMIT");
  } finally {
    cleanup.release();
  }
  await pool.query("DELETE FROM whitebit_deposits WHERE customer_id = $1 OR address = $2 OR unique_id LIKE $3 OR unique_id = ANY($4)", [customerId, address, `%-${suffix}-%`, ownedUniqueIds]);
  await pool.query("DELETE FROM whitebit_history_checkpoints WHERE address_id IN (SELECT id FROM whitebit_deposit_addresses WHERE customer_id = $1)", [customerId]);
  await pool.query("DELETE FROM whitebit_webhook_deliveries WHERE payload->'params'->>'address' = $1 OR envelope_id LIKE $2 OR envelope_id = ANY($3) OR (nonce >= $4 AND nonce < $5)", [address, `%-${suffix}-%`, ownedEnvelopeIds, nonce - 1000, nonce + 1000]);
  await pool.query("DELETE FROM whitebit_deposit_addresses WHERE customer_id = $1", [customerId]);
  await pool.query("DELETE FROM customer_profiles WHERE customer_id = $1", [customerId]);
  await pool.query("DELETE FROM exchange_customers WHERE id = $1", [customerId]);
  await pool.query("DELETE FROM desk_operators WHERE clerk_user_id = ANY($1)", [[`operator-${suffix}`, `owner-${suffix}`]]);
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

test("webhook transitions are idempotent and only terminal statuses credit once", async () => {
  assert.equal((await webhook("deposit.accepted", "delivery-accepted", depositParams("provider-1", 15))).status, 200);
  assert.equal((await webhook("deposit.updated", "delivery-updated", depositParams("provider-1", 15))).status, 200);
  assert.equal((await webhook("deposit.processed", "delivery-processed", depositParams("provider-1", 3))).status, 200);
  assert.equal((await webhook("deposit.processed", "delivery-processed-duplicate", depositParams("provider-1", 3))).status, 200);
  const [deposit] = await database.db.select().from(database.whitebitDepositsTable).where(eq(database.whitebitDepositsTable.uniqueId, "provider-1"));
  assert.equal(deposit.status, "processed");
  assert.equal(deposit.creditedAt !== null, true);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable).where(eq(database.whitebitLedgerEntriesTable.depositId, deposit.id));
  assert.equal(ledger.length, 1);
});

test("duplicate envelope, status 7, and unknown address cannot double-credit", async () => {
  const params = depositParams("provider-2", 7);
  assert.equal((await webhook("deposit.processed", "delivery-seven", params)).status, 200);
  assert.equal((await webhook("deposit.processed", "delivery-seven", params, nonce)).status, 200);
  const unknown = { ...depositParams("provider-unknown", 7), address: `unknown-${suffix}` };
  assert.equal((await webhook("deposit.processed", "delivery-unknown", unknown)).status, 200);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable).where(eq(database.whitebitLedgerEntriesTable.customerId, customerId));
  assert.equal(ledger.length, 2);
});

test("reconciliation replay uses the same unique ledger source and is duplicate-safe", async () => {
  const record = depositParams("provider-replay", 7);
  assert.equal(await replayHistoryRecord(record), true);
  assert.equal(await replayHistoryRecord(record), false);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable).where(eq(database.whitebitLedgerEntriesTable.customerId, customerId));
  assert.equal(ledger.length, 3);
});

test("concurrent deliveries for one provider uniqueId credit at most once", async () => {
  const params = depositParams("provider-concurrent", 3);
  const responses = await Promise.all([
    webhook("deposit.processed", "delivery-concurrent-a", params),
    webhook("deposit.processed", "delivery-concurrent-b", params),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200]);
  const deposits = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, "provider-concurrent"));
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.depositId, deposits[0]!.id));
  assert.equal(deposits.length, 1);
  assert.equal(ledger.length, 1);
});

test("null-ID webhook remains hidden audit-only while stable history credits corrected terminal amount", async () => {
  const provisional = { ...depositParams(`ignored-${suffix}`, 15) };
  delete (provisional as Record<string, unknown>).uniqueId;
  assert.equal((await webhook("deposit.accepted", "delivery-provisional", provisional)).status, 200);
  assert.equal(await replayHistoryRecord({
    address, ticker, network, amount: "2.50000000", fee: "0.01000000", status: 3,
    transaction_id: `stable-history-id-${suffix}`, transactionHash: provisional.transactionHash,
  }), true);
  const visible = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.transactionHash, provisional.transactionHash));
  assert.equal(visible.filter((row) => !row.providerIdentity.startsWith("provisional:")).length, 1);
  assert.equal(visible.filter((row) => row.providerIdentity.startsWith("provisional:")).length, 1);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.customerId, customerId));
  const corrected = ledger.find((row) => row.depositId === visible.find((item) => item.transactionId === `stable-history-id-${suffix}`)?.id);
  assert.equal(Number(corrected?.amount), 2.5);
});

test("unique-only webhook is promoted by dual-ID history without a second ledger credit", async () => {
  const unique = `alias-${suffix}`;
  assert.equal((await webhook("deposit.processed", "delivery-alias", depositParams(unique, 3))).status, 200);
  assert.equal(await replayHistoryRecord({
    address, ticker, network, amount: "1.25000000", fee: "0", status: 3,
    unique_id: unique, transaction_id: `tx-${unique}`, transactionHash: `tx-${unique}`,
  }), false);
  const deposits = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, unique));
  assert.equal(deposits.length, 1);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.depositId, deposits[0]!.id));
  assert.equal(ledger.length, 1);
  assert.equal(deposits[0]!.transactionId, `tx-${unique}`);
});

test("ledger is append-only and rejects invalid amounts and destructive deletes", async () => {
  await assert.rejects(() => pool.query(
    "INSERT INTO whitebit_ledger_entries (customer_id, ticker, amount, source_key) VALUES ($1, 'BTC', -1, $2)",
    [customerId, `invalid-negative-${suffix}`],
  ));
  await assert.rejects(() => pool.query(
    "INSERT INTO whitebit_ledger_entries (customer_id, ticker, amount, source_key) VALUES ($1, 'BTC', 0, $2)",
    [customerId, `invalid-zero-${suffix}`],
  ));
  const [entry] = await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.customerId, customerId)).limit(1);
  assert.ok(entry);
  await assert.rejects(() => pool.query("UPDATE whitebit_ledger_entries SET amount = 9 WHERE id = $1", [entry.id]));
  await assert.rejects(() => pool.query("DELETE FROM whitebit_ledger_entries WHERE id = $1", [entry.id]));
  await assert.rejects(() => pool.query("DELETE FROM exchange_customers WHERE id = $1", [customerId]));
});

test("authenticated address provisioning converges concurrent requests to one provider call", async () => {
  providerCreateCalls = 0;
  const responses = await Promise.all(["ETH", "ETH"].map((network) => fetch(`${baseUrl}/api/account/deposits/address`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticker: "TEST", network }),
  })));
  assert.equal(providerCreateCalls, 1);
  assert.ok(responses.some((response) => response.status === 201));
});

test("ambiguous provider timeout stays unresolved and blocks automatic retry", async () => {
  const timeoutAddress = `timeout-${suffix}`;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("whitebit.com/api/v4/main-account/create-new-address")) throw new Error("provider timeout");
    return originalFetch(input, init);
  };
  const first = await fetch(`${baseUrl}/api/account/deposits/address`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticker: "TIME", network: timeoutAddress }),
  });
  assert.equal(first.status, 500);
  globalThis.fetch = originalFetch;
  const second = await fetch(`${baseUrl}/api/account/deposits/address`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticker: "TIME", network: timeoutAddress }),
  });
  assert.equal(second.status, 200);
  const [row] = await database.db.select().from(database.whitebitDepositAddressesTable)
    .where(eq(database.whitebitDepositAddressesTable.ticker, "TIME"));
  assert.equal(row?.status, "unresolved");
});

test("owner recovery endpoint rejects operator and permits explicit owner action", async () => {
  const [row] = await database.db.insert(database.whitebitDepositAddressesTable).values({
    customerId, ticker: "REC", providerTicker: "REC", network: "TEST", status: "unresolved",
  }).returning();
  const body = JSON.stringify({ id: row.id, address: "recovered-address" });
  const operator = await fetch(`${baseUrl}/api/admin/whitebit/recover-address`, {
    method: "POST", headers: { "content-type": "application/json", "x-test-operator": `operator-${suffix}` }, body,
  });
  assert.equal(operator.status, 403);
  const owner = await fetch(`${baseUrl}/api/admin/whitebit/recover-address`, {
    method: "POST", headers: { "content-type": "application/json", "x-test-operator": `owner-${suffix}` }, body,
  });
  assert.equal(owner.status, 200);
});

test("owner reconciliation scans 501 array records, persists high-water, and catches prepends", async () => {
  let sawNetwork = false;
  await database.db.insert(database.whitebitDepositAddressesTable).values(
    Array.from({ length: 105 }, (_, index) => ({
      customerId, ticker: `FAIR${index}`, providerTicker: `FAIR${index}`, network: "TEST",
      address: `fair-address-${suffix}-${index}`, status: "ready" as const,
    })),
  );
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("whitebit.com/api/v4/main-account/history")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { offset?: number; limit?: number; address?: string };
      sawNetwork ||= Object.prototype.hasOwnProperty.call(request, "network");
      if (request.address !== address) return new Response(JSON.stringify([]), { status: 200 });
      const offset = request.offset ?? 0;
      const pageSize = request.limit ?? 500;
      const source = reconciliationRun === 0
        ? reconciliationRecords
        : [{ ...reconciliationRecords[0], unique_id: `history-new-${suffix}`, transaction_id: `history-new-tx-${suffix}` }, ...reconciliationRecords];
      return new Response(JSON.stringify(source.slice(offset, offset + pageSize)), { status: 200 });
    }
    return originalFetch(input, init);
  };
  reconciliationRun = 0;
  const first = await fetch(`${baseUrl}/api/admin/whitebit/reconcile`, {
    method: "POST", headers: { "x-test-operator": `owner-${suffix}` },
  });
  assert.equal(first.status, 200);
  const firstResult = await first.json() as { pages: number; records: number };
  assert.ok(firstResult.pages >= 2);
  assert.ok(firstResult.records >= 501);
  reconciliationRun = 1;
  const second = await fetch(`${baseUrl}/api/admin/whitebit/reconcile`, {
    method: "POST", headers: { "x-test-operator": `owner-${suffix}` },
  });
  assert.equal(second.status, 200);
  const secondResult = await second.json() as { pages: number; records: number };
  assert.ok(secondResult.pages >= 1);
  assert.equal(secondResult.records, 1);
  assert.equal(sawNetwork, false);
  const rows = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.address, address));
  assert.ok(rows.some((row) => row.uniqueId === `history-new-${suffix}`));
  assert.ok(rows.filter((row) => row.uniqueId?.startsWith(`history-${suffix}-`)).length >= 501);
});

test("concurrent unique-only webhook and dual-ID history converge to one credited deposit", async () => {
  const unique = `concurrent-alias-${suffix}`;
  const first = depositParams(unique, 3);
  const second = { ...first, transaction_id: `concurrent-tx-${suffix}`, transactionHash: `concurrent-tx-${suffix}` };
  const responses = await Promise.all([
    webhook("deposit.processed", "delivery-concurrent-alias-a", first),
    webhook("deposit.processed", "delivery-concurrent-alias-b", second),
  ]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [200, 200]);
  const deposits = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, unique));
  assert.equal(deposits.length, 1);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.depositId, deposits[0]!.id));
  assert.equal(ledger.length, 1);
});

test("credited terminal replay mismatch is quarantined without changing amount or balance", async () => {
  const unique = `immutable-${suffix}`;
  const original = depositParams(unique, 3);
  assert.equal((await webhook("deposit.processed", "delivery-immutable-a", original)).status, 200);
  assert.equal(await replayHistoryRecord({
    address, ticker, network, amount: "9.00000000", fee: "0.50000000", status: 3,
    unique_id: unique, transaction_id: `immutable-tx-${suffix}`, transactionHash: original.transactionHash,
  }), false);
  const [deposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, unique));
  assert.equal(Number(deposit.amount), 1.25);
  assert.equal(Number(deposit.fee), 0);
  assert.match(deposit.conflict ?? "", /immutable credited economic fields/);
  const [balance] = await database.db.select({ amount: sql<string>`coalesce(sum(${database.whitebitLedgerEntriesTable.amount}), 0)::text` })
    .from(database.whitebitLedgerEntriesTable).where(eq(database.whitebitLedgerEntriesTable.depositId, deposit.id));
  assert.equal(Number(balance.amount), 1.25);
});

test("reconciliation stops the array scan at the 10000-record provider boundary", async () => {
  const boundaryAddress = `boundary-${suffix}`;
  const laterAddress = `later-boundary-${suffix}`;
  await database.db.insert(database.whitebitDepositAddressesTable).values([
    { customerId, ticker: "BOUND", providerTicker: "BOUND", network: "TEST", address: boundaryAddress, status: "ready" },
    { customerId, ticker: "LATER", providerTicker: "LATER", network: "TEST", address: laterAddress, status: "ready" },
  ]);
  const legalOffsets: number[] = [];
  const page = Array.from({ length: 500 }, (_, index) => ({
    address: boundaryAddress, ticker: "BOUND", network: "TEST", amount: "0.00000001", fee: "0",
    status: 3, unique_id: `boundary-${index}`, transaction_id: `boundary-tx-${index}`,
  }));
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("whitebit.com/api/v4/main-account/history")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { offset?: number; limit?: number; address?: string };
      if (request.address === boundaryAddress) {
        legalOffsets.push(request.offset ?? -1);
        return new Response(JSON.stringify(page), { status: 200 });
      }
      if (request.address === laterAddress) {
        return new Response(JSON.stringify([{
          address: laterAddress, ticker: "LATER", network: "TEST", amount: "1", fee: "0",
          status: 3, unique_id: "later-boundary-id", transaction_id: "later-boundary-tx",
        }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return originalFetch(input, init);
  };
  const response = await fetch(`${baseUrl}/api/admin/whitebit/reconcile`, {
    method: "POST", headers: { "x-test-operator": `owner-${suffix}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(legalOffsets, Array.from({ length: 20 }, (_, index) => index * 500));
  assert.equal(legalOffsets.includes(10000), false);
  const [checkpoint] = await database.db.select().from(database.whitebitHistoryCheckpointsTable)
    .where(eq(database.whitebitHistoryCheckpointsTable.addressId, (await database.db.select().from(database.whitebitDepositAddressesTable).where(eq(database.whitebitDepositAddressesTable.address, boundaryAddress)).limit(1))[0]!.id));
  assert.equal(checkpoint, undefined);
  const [later] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, "later-boundary-id"));
  assert.ok(later);
});

test("object history envelopes also enforce the 10000-record ceiling", async () => {
  const boundaryAddress = `object-boundary-${suffix}`;
  const laterAddress = `object-later-${suffix}`;
  await database.db.insert(database.whitebitDepositAddressesTable).values([
    { customerId, ticker: "OBJBOUND", providerTicker: "OBJBOUND", network: "TEST", address: boundaryAddress, status: "ready" },
    { customerId, ticker: "OBJLATER", providerTicker: "OBJLATER", network: "TEST", address: laterAddress, status: "ready" },
  ]);
  const offsets: number[] = [];
  const page = Array.from({ length: 500 }, (_, index) => ({
    address: boundaryAddress, ticker: "OBJBOUND", network: "TEST", amount: "0.00000001", fee: "0",
    status: 3, unique_id: `obj-boundary-${index}`, transaction_id: `obj-boundary-tx-${index}`,
  }));
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("whitebit.com/api/v4/main-account/history")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { offset?: number; address?: string };
      if (request.address === boundaryAddress) {
        offsets.push(request.offset ?? -1);
        return new Response(JSON.stringify({ limit: 500, offset: request.offset ?? 0, total: 12_000, records: page }), { status: 200 });
      }
      if (request.address === laterAddress) {
        return new Response(JSON.stringify({ limit: 500, offset: 0, total: 1, records: [{
          address: laterAddress, ticker: "OBJLATER", network: "TEST", amount: "1", fee: "0",
          status: 3, unique_id: "object-later-id", transaction_id: "object-later-tx",
        }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ limit: 500, offset: 0, total: 0, records: [] }), { status: 200 });
    }
    return originalFetch(input, init);
  };
  const response = await fetch(`${baseUrl}/api/admin/whitebit/reconcile`, {
    method: "POST", headers: { "x-test-operator": `owner-${suffix}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(offsets, Array.from({ length: 20 }, (_, index) => index * 500));
  assert.equal(offsets.includes(10_000), false);
  const [boundary] = await database.db.select().from(database.whitebitDepositAddressesTable)
    .where(eq(database.whitebitDepositAddressesTable.address, boundaryAddress)).limit(1);
  const [checkpoint] = await database.db.select().from(database.whitebitHistoryCheckpointsTable)
    .where(eq(database.whitebitHistoryCheckpointsTable.addressId, boundary!.id));
  assert.equal(checkpoint, undefined);
  assert.ok((await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, "object-later-id")))[0]);
});