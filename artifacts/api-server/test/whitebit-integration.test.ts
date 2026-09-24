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
const catalogManualTicker = `WM${suffix.replaceAll("-", "").slice(0, 8)}`.toUpperCase();
const catalogImportedTicker = `WN${suffix.replaceAll("-", "").slice(0, 8)}`.toUpperCase();
const catalogManualAssetId = `catalog-manual-${suffix}`;
const catalogImportedAssetId = `whitebit-${catalogImportedTicker.toLowerCase()}`;
const runId = (value: string) => `${value}-${suffix}`;
const ownedRunPattern = `%-${suffix}%`;
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
let nonce = 1_000_000_000_000 + Number.parseInt(suffix.replaceAll("-", "").slice(0, 10), 16);
let providerCreateCalls = 0;
let reconciliationRun = 0;
let priorProviderSetting: typeof database.whitebitProviderSettingsTable.$inferSelect | null = null;
const reconciliationRecords = Array.from({ length: 501 }, (_, index) => ({
  address, ticker, network, amount: "0.00000001", fee: "0", status: 3,
  unique_id: runId(`history-${index}`), transaction_id: runId(`history-tx-${index}`),
}));
const originalFetch = globalThis.fetch;

async function ensureWhitebitSchema(): Promise<void> {
  const migration0072 = await readFile(resolve(
    process.cwd(), "../../lib/db/migrations/0072_whitebit_customer_deposits.sql",
  ), "utf8");
  const migration0073 = await readFile(resolve(
    process.cwd(), "../../lib/db/migrations/0073_whitebit_swap_order_addresses.sql",
  ), "utf8");
  const migration0074 = await readFile(resolve(
    process.cwd(), "../../lib/db/migrations/0074_whitebit_asset_catalog_mappings.sql",
  ), "utf8");
  const migration0120 = await readFile(resolve(
    process.cwd(), "../../lib/db/migrations/0120_whitebit_verification.sql",
  ), "utf8");
  await pool.query(migration0072);
  await pool.query(migration0073);
  await pool.query(migration0074);
  await pool.query(migration0120);
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
  await ensureWhitebitSchema();
  priorProviderSetting = (await database.db.select().from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit")).limit(1))[0] ?? null;
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
        : [{ ...reconciliationRecords[0], unique_id: runId("history-new"), transaction_id: runId("history-new-tx") }, ...reconciliationRecords].slice(offset, offset + (request.limit ?? 500));
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
    runId("provider-1"), runId("provider-2"), runId("provider-unknown"), runId("provider-replay"),
    runId("provider-concurrent"), runId("ignored"),
  ];
  const ownedEnvelopeIds = [
    runId("delivery-accepted"), runId("delivery-updated"), runId("delivery-processed"), runId("delivery-processed-duplicate"),
    runId("delivery-seven"), runId("delivery-unknown"), runId("delivery-concurrent-a"), runId("delivery-concurrent-b"),
    runId("delivery-provisional"), runId("delivery-alias"), runId("delivery-concurrent-alias-a"), runId("delivery-concurrent-alias-b"),
    runId("delivery-immutable-a"),
    runId("cancel-accepted"), runId("cancel-first"), runId("cancel-second"), runId("cancel-mismatch"),
    runId("cancel-processed"), runId("cancel-after-processed"), runId("cancel-provisional"),
    runId("cancel-hash-only"), runId("cancel-late-processed"), runId("cancel-unknown"), runId("cancel-invalid"),
    runId("cancel-first-hash"), runId("cancel-first-hash-duplicate"), runId("cancel-no-identity"),
  ];
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  const cleanup = await pool.connect();
  try {
    await cleanup.query("BEGIN");
    await cleanup.query("SET LOCAL session_replication_role = replica");
    await cleanup.query("DELETE FROM whitebit_ledger_entries WHERE customer_id = $1 OR deposit_id IN (SELECT id FROM whitebit_deposits WHERE customer_id = $1 OR address = $2 OR unique_id LIKE $3 OR unique_id = ANY($4))", [customerId, address, ownedRunPattern, ownedUniqueIds]);
    await cleanup.query("COMMIT");
  } finally {
    cleanup.release();
  }
  await pool.query("DELETE FROM whitebit_deposits WHERE customer_id = $1 OR address = $2 OR unique_id LIKE $3 OR unique_id = ANY($4)", [customerId, address, ownedRunPattern, ownedUniqueIds]);
  await pool.query("DELETE FROM whitebit_history_checkpoints WHERE address_id IN (SELECT id FROM whitebit_deposit_addresses WHERE customer_id = $1)", [customerId]);
  await pool.query("DELETE FROM whitebit_webhook_deliveries WHERE payload->'params'->>'address' = $1 OR envelope_id LIKE $2 OR envelope_id = ANY($3) OR (nonce >= $4 AND nonce < $5)", [address, ownedRunPattern, ownedEnvelopeIds, nonce - 1000, nonce + 1000]);
  await pool.query("DELETE FROM whitebit_deposit_addresses WHERE customer_id = $1", [customerId]);
  await pool.query("DELETE FROM customer_profiles WHERE customer_id = $1", [customerId]);
  await pool.query("DELETE FROM exchange_customers WHERE id = $1", [customerId]);
  await pool.query("DELETE FROM crypto_assets WHERE id = ANY($1)", [[catalogManualAssetId, catalogImportedAssetId]]);
  await pool.query("DELETE FROM desk_operators WHERE clerk_user_id = ANY($1)", [[`operator-${suffix}`, `owner-${suffix}`]]);
  if (priorProviderSetting) {
    await database.db.update(database.whitebitProviderSettingsTable).set({
      disabled: priorProviderSetting.disabled,
      version: priorProviderSetting.version,
      depositRouteProofs: priorProviderSetting.depositRouteProofs,
      credentialVerifiedFingerprint: priorProviderSetting.credentialVerifiedFingerprint,
      credentialVerifiedAt: priorProviderSetting.credentialVerifiedAt,
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

test("WhiteBIT catalog preview and selected import preserve manual assets and create disabled provider mappings", async () => {
  await database.db.insert(database.cryptoAssetsTable).values({
    id: catalogManualAssetId,
    code: catalogManualTicker,
    name: "Operator configured asset",
    decimals: 4,
    lifecycle: "restricted",
    enabled: true,
  });
  const [pricingBefore] = await database.db.select({
    count: sql<number>`count(*)::int`,
  }).from(database.manualDeskPricingRulesTable);
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/public/assets")) {
      return new Response(JSON.stringify({
        USD: {
          name: "United States Dollar",
          can_deposit: true,
          can_withdraw: true,
          providers: { deposits: ["SWIFT"] },
          networks: { deposits: ["USD"], withdraws: ["USD"], default: "USD" },
        },
        [catalogManualTicker]: {
          name: "Provider must not overwrite this",
          currency_precision: 8,
          can_deposit: true,
          can_withdraw: true,
          networks: { deposits: ["NATIVE"], withdraws: ["NATIVE"], default: "NATIVE" },
        },
        [catalogImportedTicker]: {
          name: "Imported WhiteBIT asset",
          currency_precision: 6,
          can_deposit: true,
          can_withdraw: true,
          is_memo: true,
          memo: { deposit: true, withdraw: false },
          confirmations: { TRC20: 20, ERC20: 64 },
          limits: {
            deposit: { TRC20: { min: "5" } },
            withdraw: { TRC20: { min: "10" }, ERC20: { min: "15" } },
          },
          networks: {
            deposits: ["TRC20"],
            withdraws: ["TRC20", "ERC20"],
            default: "TRC20",
          },
        },
      }), { status: 200 });
    }
    return savedFetch(input, init);
  };
  try {
    const unauthorizedPreview = await fetch(`${baseUrl}/api/admin/whitebit/assets/preview`);
    assert.equal(unauthorizedPreview.status, 401);

    const previewResponse = await fetch(`${baseUrl}/api/admin/whitebit/assets/preview`, {
      headers: { "x-test-operator": `operator-${suffix}` },
    });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json() as {
      total: number;
      alreadyExisting: number;
      missing: number;
      assets: Array<{ normalizedTicker: string }>;
    };
    assert.equal(preview.total, 2);
    assert.equal(preview.alreadyExisting, 1);
    assert.equal(preview.missing, 1);
    assert.deepEqual(preview.assets.map((asset) => asset.normalizedTicker), [catalogImportedTicker]);

    const forbiddenImport = await fetch(`${baseUrl}/api/admin/whitebit/assets/import`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-operator": `operator-${suffix}` },
      body: JSON.stringify({ providerTickers: [catalogImportedTicker] }),
    });
    assert.equal(forbiddenImport.status, 403);

    const importResponse = await fetch(`${baseUrl}/api/admin/whitebit/assets/import`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-operator": `owner-${suffix}` },
      body: JSON.stringify({ providerTickers: [catalogImportedTicker] }),
    });
    assert.equal(importResponse.status, 201);
    assert.deepEqual(await importResponse.json(), { imported: [catalogImportedTicker], skipped: [] });

    const [manualAsset] = await database.db.select().from(database.cryptoAssetsTable)
      .where(eq(database.cryptoAssetsTable.id, catalogManualAssetId));
    assert.equal(manualAsset.name, "Operator configured asset");
    assert.equal(manualAsset.decimals, 4);
    assert.equal(manualAsset.lifecycle, "restricted");
    assert.equal(manualAsset.enabled, true);

    const [importedAsset] = await database.db.select().from(database.cryptoAssetsTable)
      .where(eq(database.cryptoAssetsTable.id, catalogImportedAssetId));
    assert.equal(importedAsset.name, "Imported WhiteBIT asset");
    assert.equal(importedAsset.enabled, false);
    const importedNetworks = await database.db.select().from(database.cryptoAssetNetworksTable)
      .where(eq(database.cryptoAssetNetworksTable.assetId, catalogImportedAssetId));
    assert.deepEqual(importedNetworks.map((row) => row.networkCode).sort(), ["ERC20", "TRC20"]);
    assert.ok(importedNetworks.every((row) =>
      row.enabled === false &&
      row.customerDepositsEnabled === false &&
      row.executionMode === "api" &&
      row.sharedDepositAddress === ""
    ));

    const [assetMapping] = await database.db.select().from(database.whitebitAssetMappingsTable)
      .where(eq(database.whitebitAssetMappingsTable.assetId, catalogImportedAssetId));
    assert.equal(assetMapping.providerTicker, catalogImportedTicker);
    const networkMappings = await database.db.select().from(database.whitebitNetworkMappingsTable)
      .where(sql`${database.whitebitNetworkMappingsTable.assetNetworkId} IN (
        SELECT id FROM crypto_asset_networks WHERE asset_id = ${catalogImportedAssetId}
      )`);
    assert.deepEqual(
      networkMappings.map((row) => [row.providerNetwork, row.canDeposit, row.canWithdraw]).sort(),
      [["ERC20", false, true], ["TRC20", true, true]],
    );

    const replayResponse = await fetch(`${baseUrl}/api/admin/whitebit/assets/import`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-operator": `owner-${suffix}` },
      body: JSON.stringify({ providerTickers: [catalogImportedTicker] }),
    });
    assert.equal(replayResponse.status, 201);
    assert.deepEqual(await replayResponse.json(), { imported: [], skipped: [catalogImportedTicker] });
    const [pricingAfter] = await database.db.select({
      count: sql<number>`count(*)::int`,
    }).from(database.manualDeskPricingRulesTable);
    assert.equal(pricingAfter.count, pricingBefore.count);
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("webhook transitions are idempotent and only terminal statuses credit once", async () => {
  const provider = runId("provider-1");
  const accepted = await webhook("deposit.accepted", runId("delivery-accepted"), depositParams(provider, 15));
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal((await webhook("deposit.updated", runId("delivery-updated"), depositParams(provider, 15))).status, 200);
  assert.equal((await webhook("deposit.processed", runId("delivery-processed"), depositParams(provider, 3))).status, 200);
  assert.equal((await webhook("deposit.processed", runId("delivery-processed-duplicate"), depositParams(provider, 3))).status, 200);
  const [deposit] = await database.db.select().from(database.whitebitDepositsTable).where(eq(database.whitebitDepositsTable.uniqueId, provider));
  assert.equal(deposit.status, "processed");
  assert.equal(deposit.creditedAt !== null, true);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable).where(eq(database.whitebitLedgerEntriesTable.depositId, deposit.id));
  assert.equal(ledger.length, 1);
});

test("signed cancellation is audited and idempotent without changing a pending deposit", async () => {
  const uniqueId = runId("provider-cancel");
  const params = depositParams(uniqueId, 15);
  assert.equal((await webhook("deposit.accepted", runId("cancel-accepted"), params)).status, 200);
  const [before] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, uniqueId));
  assert.equal(before.status, "accepted");
  const first = await webhook("deposit.canceled", runId("cancel-first"), params);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal((await webhook("deposit.canceled", runId("cancel-first"), params, nonce)).status, 200);
  assert.equal((await webhook("deposit.canceled", runId("cancel-second"), params)).status, 200);
  const [after] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, uniqueId));
  assert.equal(after.status, "accepted");
  assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
  assert.equal(after.creditedAt, null);
  const firstDelivery = await database.db.select().from(database.whitebitWebhookDeliveriesTable)
    .where(eq(database.whitebitWebhookDeliveriesTable.envelopeId, runId("cancel-first")));
  const secondDelivery = await database.db.select().from(database.whitebitWebhookDeliveriesTable)
    .where(eq(database.whitebitWebhookDeliveriesTable.envelopeId, runId("cancel-second")));
  assert.equal(firstDelivery.length, 1);
  assert.equal(firstDelivery[0].method, "deposit.canceled");
  assert.ok(firstDelivery[0].payloadDigest);
  assert.equal(secondDelivery.length, 1);
  assert.equal((await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.depositId, after.id))).length, 0);
});

test("a signed cancellation leaves an already credited deposit and ledger unchanged", async () => {
  const processedId = runId("cancel-processed-id");
  const processed = depositParams(processedId, 3);
  assert.equal((await webhook("deposit.processed", runId("cancel-processed"), processed)).status, 200);
  const [before] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, processedId));
  assert.equal((await webhook("deposit.canceled", runId("cancel-after-processed"), processed)).status, 200);
  const [credited] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, processedId));
  assert.equal(credited.status, "processed");
  assert.ok(credited.creditedAt);
  assert.equal(credited.updatedAt.getTime(), before.updatedAt.getTime());
  assert.equal((await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.depositId, credited.id))).length, 1);
});

test("cancellation without a deposit or valid deposit fields is still audited without a deposit write", async () => {
  const hashOnly = { ...depositParams(runId("cancel-first-hash-id"), 15) };
  delete (hashOnly as Record<string, unknown>).uniqueId;
  assert.equal((await webhook("deposit.canceled", runId("cancel-first-hash"), hashOnly)).status, 200);
  assert.equal((await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.transactionHash, hashOnly.transactionHash))).length, 0);
  assert.equal((await webhook("deposit.canceled", runId("cancel-no-identity"), {})).status, 200);
  const [audited] = await database.db.select().from(database.whitebitWebhookDeliveriesTable)
    .where(eq(database.whitebitWebhookDeliveriesTable.envelopeId, runId("cancel-no-identity")));
  assert.equal(audited.method, "deposit.canceled");
  assert.ok(audited.payloadDigest);
  assert.equal((await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.envelopeId, runId("cancel-no-identity")))).length, 0);
});

test("invalid signature and unknown webhook method cannot create a deposit", async () => {
  const uniqueId = runId("cancel-unknown-id");
  const params = depositParams(uniqueId, 15);
  assert.equal((await webhook("unrecognized.event", runId("cancel-unknown"), params)).status, 200);
  const body = JSON.stringify({ method: "deposit.canceled", params: { ...params, nonce: ++nonce }, id: runId("cancel-invalid") });
  const payload = Buffer.from(body).toString("base64");
  const response = await fetch(`${baseUrl}/api/webhooks/whitebit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-txc-apikey": process.env.WHITEBIT_WEBHOOK_API_KEY!,
      "x-txc-payload": payload,
      "x-txc-signature": createHmac("sha512", "invalid-test-secret").update(payload).digest("hex"),
    },
    body,
  });
  assert.equal(response.status, 401);
  assert.equal((await database.db.select().from(database.whitebitWebhookDeliveriesTable)
    .where(eq(database.whitebitWebhookDeliveriesTable.envelopeId, runId("cancel-invalid")))).length, 0);
  assert.equal((await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, uniqueId))).length, 0);
});

test("duplicate envelope, status 7, and unknown address cannot double-credit", async () => {
  const params = depositParams(runId("provider-2"), 7);
  assert.equal((await webhook("deposit.processed", runId("delivery-seven"), params)).status, 200);
  assert.equal((await webhook("deposit.processed", runId("delivery-seven"), params, nonce)).status, 200);
  const unknown = { ...depositParams(runId("provider-unknown"), 7), address: `unknown-${suffix}` };
  assert.equal((await webhook("deposit.processed", runId("delivery-unknown"), unknown)).status, 200);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable).where(eq(database.whitebitLedgerEntriesTable.customerId, customerId));
  assert.equal(ledger.length, 3);
});

test("reconciliation replay uses the same unique ledger source and is duplicate-safe", async () => {
  const record = depositParams(runId("provider-replay"), 7);
  assert.equal(await replayHistoryRecord(record), true);
  assert.equal(await replayHistoryRecord(record), false);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable).where(eq(database.whitebitLedgerEntriesTable.customerId, customerId));
  assert.equal(ledger.length, 4);
});

test("concurrent deliveries for one provider uniqueId credit at most once", async () => {
  const uniqueId = runId("provider-concurrent");
  const params = depositParams(uniqueId, 3);
  const responses = await Promise.all([
    webhook("deposit.processed", runId("delivery-concurrent-a"), params),
    webhook("deposit.processed", runId("delivery-concurrent-b"), params),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200]);
  const deposits = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, uniqueId));
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.depositId, deposits[0]!.id));
  assert.equal(deposits.length, 1);
  assert.equal(ledger.length, 1);
});

test("null-ID webhook remains hidden audit-only while stable history credits corrected terminal amount", async () => {
  const provisional = { ...depositParams(runId("ignored"), 15) };
  delete (provisional as Record<string, unknown>).uniqueId;
  assert.equal((await webhook("deposit.accepted", runId("delivery-provisional"), provisional)).status, 200);
  assert.equal(await replayHistoryRecord({
    address, ticker, network, amount: "2.50000000", fee: "0.01000000", status: 3,
    transaction_id: runId("stable-history-id"), transactionHash: provisional.transactionHash,
  }), true);
  const visible = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.transactionHash, provisional.transactionHash));
  assert.equal(visible.filter((row) => !row.providerIdentity.startsWith("provisional:")).length, 1);
  assert.equal(visible.filter((row) => row.providerIdentity.startsWith("provisional:")).length, 1);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.customerId, customerId));
  const corrected = ledger.find((row) => row.depositId === visible.find((item) => item.transactionId === runId("stable-history-id"))?.id);
  assert.equal(Number(corrected?.amount), 2.5);
});

test("unique-only webhook is promoted by dual-ID history without a second ledger credit", async () => {
  const unique = `alias-${suffix}`;
  assert.equal((await webhook("deposit.processed", runId("delivery-alias"), depositParams(unique, 3))).status, 200);
  assert.equal(await replayHistoryRecord({
    address, ticker, network, amount: "1.25000000", fee: "0", status: 3,
    unique_id: unique, transaction_id: runId("alias-tx"), transactionHash: runId("alias-tx"),
  }), false);
  const deposits = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, unique));
  assert.equal(deposits.length, 1);
  const ledger = await database.db.select().from(database.whitebitLedgerEntriesTable)
    .where(eq(database.whitebitLedgerEntriesTable.depositId, deposits[0]!.id));
  assert.equal(ledger.length, 1);
  assert.equal(deposits[0]!.transactionId, runId("alias-tx"));
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
        : [{ ...reconciliationRecords[0], unique_id: runId("history-new"), transaction_id: runId("history-new-tx") }, ...reconciliationRecords];
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
  assert.ok(rows.some((row) => row.uniqueId === runId("history-new")));
  assert.ok(rows.filter((row) => row.uniqueId?.startsWith("history-") && row.uniqueId?.endsWith(`-${suffix}`)).length >= 501);
});

test("concurrent unique-only webhook and dual-ID history converge to one credited deposit", async () => {
  const unique = `concurrent-alias-${suffix}`;
  const first = depositParams(unique, 3);
  const second = { ...first, transaction_id: runId("concurrent-tx"), transactionHash: runId("concurrent-tx") };
  const responses = await Promise.all([
    webhook("deposit.processed", runId("delivery-concurrent-alias-a"), first),
    webhook("deposit.processed", runId("delivery-concurrent-alias-b"), second),
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
  assert.equal((await webhook("deposit.processed", runId("delivery-immutable-a"), original)).status, 200);
  assert.equal(await replayHistoryRecord({
    address, ticker, network, amount: "9.00000000", fee: "0.50000000", status: 3,
    unique_id: unique, transaction_id: runId("immutable-tx"), transactionHash: original.transactionHash,
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
    status: 3, unique_id: runId(`boundary-${index}`), transaction_id: runId(`boundary-tx-${index}`),
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
          status: 3, unique_id: runId("later-boundary-id"), transaction_id: runId("later-boundary-tx"),
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
    .where(eq(database.whitebitDepositsTable.uniqueId, runId("later-boundary-id")));
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
    status: 3, unique_id: runId(`obj-boundary-${index}`), transaction_id: runId(`obj-boundary-tx-${index}`),
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
          status: 3, unique_id: runId("object-later-id"), transaction_id: runId("object-later-tx"),
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
    .where(eq(database.whitebitDepositsTable.uniqueId, runId("object-later-id"))))[0]);
});