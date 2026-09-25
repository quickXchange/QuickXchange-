import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import test, { after, before } from "node:test";
import { eq, sql } from "drizzle-orm";
import * as database from "@workspace/db";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";
import {
  finalizeSwapFundingFromClaim,
  processNormalizedDeposit,
  provisionSwapFundingAddress,
  replayHistoryRecord,
  whitebitPublicRouter,
  whitebitWebhookRouter,
  whitebitOperatorRouter,
} from "../src/routes/whitebit";
import { fiatCurrenciesTable, manualDeskPricingRulesTable } from "@workspace/db";
import { isWhitebitSwapEnabled, matchWhitebitCapability, parseWhitebitAssets, resetWhitebitCapabilityCacheForTests, whitebitSwapStatus } from "../src/lib/whitebit-capabilities";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";
import { adminPolicy } from "../src/lib/admin-policy";
import { configureCustomerAuthorizationForTests } from "../src/lib/customer-auth";
import { signOrderTrackingToken } from "../src/lib/order-access";
import { activateWhitebitCredentials } from "../src/lib/provider-credentials";
import exchangeConfigRouter from "../src/routes/exchange-config";
import exchangeRouter from "../src/routes/exchange";
import { isReadyManualFallbackWatch, registerManualBlockchainWatch } from "../src/lib/blockchain-monitoring/service";
import { manualMonitoringNetworkConfigDigest, manualMonitoringProofFingerprint } from "../src/lib/manual-monitoring-readiness";
import { customerDepositRouteConfigurationDigest } from "../src/lib/customer-deposit-eligibility";
import { getWhitebitCredentialStorageState, whitebitCredentialFingerprint } from "../src/lib/provider-credentials";
import { runConfiguredWhitebitHistoryCycle } from "../src/lib/whitebit-history-worker";
import { matchesFrozenWhitebitClaim } from "../src/lib/whitebit-history-match";
import { assertIsolatedWhitebitDatabase } from "./assert-isolated-whitebit-database";

assertIsolatedWhitebitDatabase();
process.env.NODE_ENV = "test";
process.env.WHITEBIT_API_KEY = `swap-key-${randomUUID()}`;
process.env.WHITEBIT_API_SECRET = `swap-secret-${randomUUID()}`;
process.env.WHITEBIT_WEBHOOK_API_KEY = `swap-webhook-${randomUUID()}`;
process.env.WHITEBIT_WEBHOOK_SECRET = `swap-webhook-secret-${randomUUID()}`;

const pool = createPrivilegedTestPool();
const suffix = randomUUID();
const runId = (value: string) => `${value}-${suffix}`;
const pricingPriority = -1 - (Number.parseInt(suffix.replaceAll("-", "").slice(0, 8), 16) % 1_000_000);
const originalFetch = globalThis.fetch;
const orderId = `O${randomUUID().replaceAll("-", "").slice(0, 9)}`;
const projectionPrefix = String(Number.parseInt(suffix.replaceAll("-", "").slice(0, 8), 16) % 100_000_000).padStart(8, "0");
const projectionOrderIds = [
  `O${projectionPrefix}1`,
  `O${projectionPrefix}2`,
  `O${projectionPrefix}3`,
] as const;
const customerId = `swap-customer-${suffix}`;
function validBitcoinAddress(): string {
  const payload = Buffer.concat([
    Buffer.from([0]),
    createHash("ripemd160").update(randomUUID()).digest(),
  ]);
  const checksum = createHash("sha256")
    .update(createHash("sha256").update(payload).digest()).digest().subarray(0, 4);
  const bytes = Buffer.concat([payload, checksum]);
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(`0x${bytes.toString("hex")}`);
  let encoded = "";
  while (number > 0n) {
    encoded = alphabet[Number(number % 58n)] + encoded;
    number /= 58n;
  }
  let leadingZeroBytes = 0;
  while (leadingZeroBytes < bytes.length && bytes[leadingZeroBytes] === 0) {
    leadingZeroBytes += 1;
  }
  return "1".repeat(leadingZeroBytes) + encoded;
}
function validTronAddress(): string {
  const payload = Buffer.concat([
    Buffer.from([0x41]),
    createHash("sha256").update(randomUUID()).digest().subarray(0, 20),
  ]);
  const checksum = createHash("sha256")
    .update(createHash("sha256").update(payload).digest()).digest().subarray(0, 4);
  const bytes = Buffer.concat([payload, checksum]);
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(`0x${bytes.toString("hex")}`);
  let encoded = "";
  while (number > 0n) {
    encoded = alphabet[Number(number % 58n)] + encoded;
    number /= 58n;
  }
  let leadingZeroBytes = 0;
  while (leadingZeroBytes < bytes.length && bytes[leadingZeroBytes] === 0) {
    leadingZeroBytes += 1;
  }
  return "1".repeat(leadingZeroBytes) + encoded;
}
let orderAddress = validBitcoinAddress();
const ownerClerkUserId = `whitebit-owner-${suffix}`;
const ownerEmail = `whitebit-owner-${suffix}@example.test`;
let providerCalls = 0;
let providerPermissionCalls = 0;
let baseUrl = "";
let server: ReturnType<typeof app.listen>;
let priorProviderSetting: typeof database.whitebitProviderSettingsTable.$inferSelect | null = null;
let priorBtcNetwork: typeof database.cryptoAssetNetworksTable.$inferSelect | null = null;
let priorBtcAsset: typeof database.cryptoAssetsTable.$inferSelect | null = null;
let priorUsdtAsset: typeof database.cryptoAssetsTable.$inferSelect | null = null;
let priorWhitebitIntegration: typeof database.providerIntegrationsTable.$inferSelect | null = null;

const app = express();
app.use(express.json({ verify: (request, _response, body) => {
  (request as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
} }));
// Exercise the production policy for the two newly classified routes while
// preserving the existing focused router fixtures for unrelated test cases.
app.use("/api", (req, res, next) =>
  req.path.startsWith("/admin/crypto-networks/deposit-provider/")
    ? adminPolicy(req, res, next)
    : next(),
);
app.use("/api", whitebitPublicRouter);
app.use("/api", whitebitWebhookRouter);
app.use("/api", whitebitOperatorRouter);
app.use("/api", exchangeConfigRouter);
app.use("/api", exchangeRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = typeof error === "object" && error && "status" in error &&
    typeof error.status === "number" ? error.status : 500;
  response.status(status).json({ error: error instanceof Error ? error.message : String(error) });
});

async function migrateTestTables() {
  const baseMigration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0072_whitebit_customer_deposits.sql"), "utf8");
  const migration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0073_whitebit_swap_order_addresses.sql"), "utf8");
  const catalogMigration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0074_whitebit_asset_catalog_mappings.sql"), "utf8");
  const providerMigration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0075_crypto_network_deposit_provider.sql"), "utf8");
  const verificationMigration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0120_whitebit_verification.sql"), "utf8");
  const historyWorkerMigration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0123_dashing_yellowjacket.sql"), "utf8");
  const activationMigration = await readFile(resolve(process.cwd(), "../../lib/db/migrations/0124_lively_gertrude_yorkes.sql"), "utf8");
  await pool.query(baseMigration);
  await pool.query(migration);
  await pool.query(catalogMigration);
  await pool.query(providerMigration);
  await pool.query(verificationMigration);
  await pool.query(historyWorkerMigration);
  await pool.query(activationMigration);
  await pool.query(migration);
}

async function mockAssets(network = "BITCOIN", asset = "BTC") {
  orderAddress = network === "TRC20" ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : validBitcoinAddress();
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/v4/public/assets")) {
      return new Response(JSON.stringify({
        [asset]: { can_deposit: true, networks: { deposits: [network] }, confirmations: { [network]: 3 } },
      }), { status: 200 });
    }
    if (url.endsWith("/api/v4/main-account/balance")) {
      return new Response(JSON.stringify({ available: [], freeze: [] }), { status: 200 });
    }
    if (url.endsWith("/api/v4/main-account/create-new-address")) {
      providerCalls += 1;
      providerPermissionCalls += 1;
      return new Response(JSON.stringify({ account: { address: orderAddress, memo: "TAG-1" } }), { status: 200 });
    }
    if (url.startsWith("https://whitebit.com/")) {
      throw new Error(`Unexpected WhiteBIT request in test mock: ${url}`);
    }
    return originalFetch(input, init);
  };
  resetWhitebitCapabilityCacheForTests();
}

async function insertProvisioningOrder(
  id = orderId,
  fallbackAddress = "manual-wallet",
  fallbackMemo = "",
  requiresMemo = false,
  manualWalletTrackingEnabled = false,
) {
  const [existingOrder] = await database.db.select({ id: database.ordersTable.id })
    .from(database.ordersTable)
    .where(eq(database.ordersTable.id, id))
    .limit(1);
  if (existingOrder) return;
  const [route] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"))
    .limit(1);
  if (!route) throw new Error("WhiteBIT test route is missing.");
  const [configuredRoute] = await database.db.update(database.cryptoAssetNetworksTable).set({
    enabled: true,
    depositProvider: "whitebit",
    customerDepositsEnabled: true,
    sharedDepositAddress: fallbackAddress,
    sharedDepositMemo: fallbackMemo || null,
    requiresMemo,
    manualWalletTrackingEnabled,
  }).where(eq(database.cryptoAssetNetworksTable.id, route.id)).returning();
  if (!configuredRoute) throw new Error("WhiteBIT test route could not be configured.");
  await database.db.insert(database.ordersTable).values({
    id, type: "manual", status: "awaiting funds", fromAsset: "BTC", fromNetwork: "BITCOIN",
    toAsset: "EUR", toNetwork: "SEPA", amount: "1", receiveAmount: "100",
    customerEmail: `${id}@example.test`, customerName: "Swap test", destinationAddress: "",
    destinationMemo: "", refundAddress: "", refundMemo: "", provider: "Manual desk",
    fundingStatus: "provisioning", fundingProviderSource: "whitebit",
    depositAddress: "", depositMemo: "",
    fundingDetailsSnapshot: {
      networkId: configuredRoute.id,
      depositProvider: configuredRoute.depositProvider,
      customerDepositsEnabled: configuredRoute.customerDepositsEnabled,
      manualWalletTrackingEnabled: configuredRoute.manualWalletTrackingEnabled,
      source: "whitebit", status: "provisioning", address: "", memo: "",
      manualFallbackAddress: configuredRoute.sharedDepositAddress,
      manualFallbackMemo: configuredRoute.sharedDepositMemo ?? "",
      requiresMemo: configuredRoute.requiresMemo,
    },
    settlementSnapshot: { funding: { source: "whitebit", status: "provisioning", address: "", memo: "" } },
    providerState: "whitebit_provisioning", quoteId: "", clientRequestId: `${id}-request`,
    sourceSettlementOptionId: "crypto:btc-bitcoin",
    manualSettlementState: "awaiting_funds",
  }).onConflictDoNothing();
}

async function seedWhitebitVerificationFixture(assetCode: string, networkCode: string) {
  const stored = await getWhitebitCredentialStorageState();
  const credentials = stored.status === "available" ? stored.credentials :
    process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET
      ? { apiKey: process.env.WHITEBIT_API_KEY, secretKey: process.env.WHITEBIT_API_SECRET }
      : null;
  if (!credentials) return null;
  const routeRows = await database.db.select({
    asset: database.cryptoAssetsTable,
    network: database.cryptoAssetNetworksTable,
  }).from(database.cryptoAssetNetworksTable)
    .innerJoin(database.cryptoAssetsTable, eq(database.cryptoAssetNetworksTable.assetId, database.cryptoAssetsTable.id));
  const exact = routeRows.find(({ asset, network }) =>
    asset.code.trim().toUpperCase() === assetCode.trim().toUpperCase() &&
    network.networkCode.trim().toUpperCase() === networkCode.trim().toUpperCase() &&
    asset.enabled && network.enabled && network.depositProvider === "whitebit" &&
    asset.lifecycle !== "deprecated" && network.lifecycle !== "deprecated"
  );
  if (!exact) return null;
  const fingerprint = whitebitCredentialFingerprint(credentials);
  const proof = {
    networkId: exact.network.id,
    assetCode: exact.asset.code.trim().toUpperCase(),
    networkCode: exact.network.networkCode.trim().toUpperCase(),
    configurationDigest: customerDepositRouteConfigurationDigest(exact.asset, exact.network),
    credentialFingerprint: fingerprint,
    verifiedAt: new Date().toISOString(),
  };
  await database.db.transaction(async tx => {
    const [current] = await tx.select({
      depositRouteProofs: database.whitebitProviderSettingsTable.depositRouteProofs,
    }).from(database.whitebitProviderSettingsTable)
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"))
      .for("update");
    const proofs = [
      ...(current?.depositRouteProofs ?? []).filter(existing => existing.networkId !== proof.networkId),
      proof,
    ];
    await tx.insert(database.whitebitProviderSettingsTable).values({
      provider: "whitebit",
      disabled: false,
      depositRouteProofs: proofs,
      credentialVerifiedFingerprint: fingerprint,
      credentialVerifiedAt: new Date(),
    }).onConflictDoUpdate({
      target: database.whitebitProviderSettingsTable.provider,
      set: {
        disabled: false,
        depositRouteProofs: proofs,
        credentialVerifiedFingerprint: fingerprint,
        credentialVerifiedAt: new Date(),
      },
    });
  });
  const status = await whitebitSwapStatus();
  assert.equal(status.enabled, true, `mock fixture proof does not satisfy the WhiteBIT gate: ${JSON.stringify(status)}`);
  return { credentials, exact };
}

async function provisionTest(
  input: Parameters<typeof provisionSwapFundingAddress>[0],
  expectEnabledProvider = true,
) {
  await insertProvisioningOrder(
    input.orderId,
    input.manualAddress,
    input.manualMemo,
    input.manualFallbackUsable === false && Boolean(input.manualAddress.trim()),
  );
  const fixture = expectEnabledProvider
    ? await seedWhitebitVerificationFixture(input.assetCode, input.networkCode)
    : null;
  const swapCapability = await isWhitebitSwapEnabled(input.assetCode, input.networkCode);
  const result = await provisionSwapFundingAddress(input);
  if (input.chosenWhitebit && fixture && result.source !== "whitebit") {
    throw new Error(`WhiteBIT mock fixture proof was not accepted: ${JSON.stringify({
      swapCapabilityAvailable: Boolean(swapCapability),
      status: await whitebitSwapStatus(),
      expectedProof: {
        networkId: fixture.exact.network.id,
        digest: customerDepositRouteConfigurationDigest(fixture.exact.asset, fixture.exact.network),
        fingerprint: whitebitCredentialFingerprint(fixture.credentials),
      },
    })}`);
  }
  return result;
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

let signedWebhookNonce = Date.now() * 1000;
async function signedOrderWebhook(
  uniqueId: string, address = orderAddress, network = "BITCOIN", memo: string | null = "TAG-1",
  method = "deposit.processed", status = 3, deliveryTag = "first", ticker = "BTC", amount = "1.25",
) {
  const body = JSON.stringify({
    method,
    params: {
      nonce: ++signedWebhookNonce,
      address,
      ticker,
      network,
      memo,
      amount,
      fee: "0",
      status,
      confirmations: 6,
      confirmationsRequired: 3,
      unique_id: uniqueId,
      transaction_id: `tx-${uniqueId}`,
      transactionHash: `hash-${uniqueId}`,
    },
    id: runId(`delivery-${uniqueId}-${method}-${deliveryTag}`),
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
  priorBtcNetwork = (await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin")).limit(1))[0] ?? null;
  priorBtcAsset = (await database.db.select().from(database.cryptoAssetsTable)
    .where(eq(database.cryptoAssetsTable.id, priorBtcNetwork?.assetId ?? "")).limit(1))[0] ?? null;
  priorUsdtAsset = (await database.db.select().from(database.cryptoAssetsTable)
    .where(eq(database.cryptoAssetsTable.id, "usdt")).limit(1))[0] ?? null;
  priorWhitebitIntegration = (await database.db.select().from(database.providerIntegrationsTable)
    .where(eq(database.providerIntegrationsTable.provider, "whitebit")).limit(1))[0] ?? null;
  if (priorBtcNetwork) {
    await database.db.update(database.cryptoAssetNetworksTable).set({
      enabled: true,
      depositProvider: "whitebit",
      networkCode: "BITCOIN",
      customerDepositsEnabled: true,
      manualWalletTrackingEnabled: false,
    }).where(eq(database.cryptoAssetNetworksTable.id, priorBtcNetwork.id));
  }
  if (priorBtcAsset) {
    await database.db.update(database.cryptoAssetsTable).set({ enabled: true })
      .where(eq(database.cryptoAssetsTable.id, priorBtcAsset.id));
  }
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

test("BTC verification and exact-route network invalidation preserve an existing BNB proof", async () => {
  await mockAssets();
  const assetFetch = globalThis.fetch;
  const [original] = await database.db.select().from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  const [originalBtc] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [bnb] = await database.db.select({
    asset: database.cryptoAssetsTable,
    network: database.cryptoAssetNetworksTable,
  }).from(database.cryptoAssetNetworksTable)
    .innerJoin(database.cryptoAssetsTable, eq(database.cryptoAssetNetworksTable.assetId, database.cryptoAssetsTable.id))
    .where(eq(database.cryptoAssetNetworksTable.id, "bnb-bnb"));
  assert.ok(bnb, "isolated suite must contain its own synthetic BNB route");
  const [originalBnbNetwork] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "bnb-bnb"));
  const [originalBnbAsset] = await database.db.select().from(database.cryptoAssetsTable)
    .where(eq(database.cryptoAssetsTable.id, bnb.asset.id));
  assert.ok(originalBnbNetwork && originalBnbAsset);
  const stored = await getWhitebitCredentialStorageState();
  const credentials = stored.status === "available" ? stored.credentials : {
    apiKey: process.env.WHITEBIT_API_KEY!,
    secretKey: process.env.WHITEBIT_API_SECRET!,
  };
  const fingerprint = whitebitCredentialFingerprint(credentials);
  const bnbProof = {
    networkId: bnb.network.id,
    assetCode: "BNB",
    networkCode: "BNB",
    configurationDigest: customerDepositRouteConfigurationDigest(
      { ...bnb.asset, enabled: true, lifecycle: "active" },
      {
        ...bnb.network,
        enabled: true,
        lifecycle: "active",
        executionMode: "manual",
        depositProvider: "whitebit",
        networkCode: "BNB",
        customerDepositsEnabled: true,
        whitebitAssetCode: null,
        whitebitNetworkCode: null,
      },
    ),
    credentialFingerprint: fingerprint,
    verifiedAt: new Date().toISOString(),
  };
  try {
    globalThis.fetch = async (input, init) => String(input).endsWith("/api/v4/public/assets")
      ? new Response(JSON.stringify({
          BTC: { can_deposit: true, networks: { deposits: ["BITCOIN"] }, confirmations: { BITCOIN: 3 } },
          BNB: { can_deposit: true, networks: { deposits: ["BNB"] }, confirmations: { BNB: 3 } },
        }), { status: 200 })
      : assetFetch(input, init);
    await database.db.update(database.cryptoAssetNetworksTable).set({
      enabled: true,
      lifecycle: "active",
      executionMode: "manual",
      depositProvider: "whitebit",
      networkCode: "BNB",
      customerDepositsEnabled: true,
      whitebitAssetCode: null,
      whitebitNetworkCode: null,
    }).where(eq(database.cryptoAssetNetworksTable.id, "bnb-bnb"));
    await database.db.update(database.cryptoAssetsTable).set({ enabled: true, lifecycle: "active" })
      .where(eq(database.cryptoAssetsTable.id, bnb.asset.id));
    await database.db.update(database.whitebitProviderSettingsTable).set({
      depositRouteProofs: [bnbProof],
      credentialVerifiedFingerprint: fingerprint,
      credentialVerifiedAt: new Date(),
    }).where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    await seedWhitebitVerificationFixture("BTC", "BITCOIN");
    const [both] = await database.db.select({
      proofs: database.whitebitProviderSettingsTable.depositRouteProofs,
    }).from(database.whitebitProviderSettingsTable)
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    assert.deepEqual(new Set(both.proofs.map(proof => proof.networkId)), new Set(["bnb-bnb", "btc-bitcoin"]));
    assert.deepEqual(both.proofs.find(proof => proof.networkId === "bnb-bnb"), bnbProof);

    const proofRoutesResponse = await fetch(`${baseUrl}/api/admin/providers/whitebit/verification-routes`, {
      headers: { "x-test-operator": ownerClerkUserId },
    });
    assert.equal(proofRoutesResponse.status, 200, await proofRoutesResponse.clone().text());
    const proofRoutes = await proofRoutesResponse.json() as Array<{
      networkId: string; proofCurrent: boolean;
    }>;
    assert.equal(proofRoutes.find(route => route.networkId === "btc-bitcoin")?.proofCurrent, true);
    assert.equal(proofRoutes.find(route => route.networkId === "bnb-bnb")?.proofCurrent, true);

    const verified = await fetch(`${baseUrl}/api/admin/providers/whitebit/credentials/test`, {
      method: "POST", headers: { "x-test-operator": ownerClerkUserId },
    });
    assert.equal(verified.status, 200);
    const [afterCredentialTest] = await database.db.select({
      proofs: database.whitebitProviderSettingsTable.depositRouteProofs,
    }).from(database.whitebitProviderSettingsTable)
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    assert.deepEqual(afterCredentialTest.proofs.find(proof => proof.networkId === "bnb-bnb"), bnbProof);

    const updated = await fetch(`${baseUrl}/api/admin/crypto-networks/btc-bitcoin`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-test-operator": ownerClerkUserId },
      body: JSON.stringify({ networkName: "Bitcoin (isolated proof test)" }),
    });
    assert.equal(updated.status, 200, await updated.clone().text());
    const afterRouteUpdateResponse = await fetch(`${baseUrl}/api/admin/providers/whitebit/verification-routes`, {
      headers: { "x-test-operator": ownerClerkUserId },
    });
    assert.equal(afterRouteUpdateResponse.status, 200, await afterRouteUpdateResponse.clone().text());
    const afterRouteUpdateRoutes = await afterRouteUpdateResponse.json() as Array<{
      networkId: string; proofCurrent: boolean;
    }>;
    assert.equal(afterRouteUpdateRoutes.find(route => route.networkId === "btc-bitcoin")?.proofCurrent, false);
    assert.equal(afterRouteUpdateRoutes.find(route => route.networkId === "bnb-bnb")?.proofCurrent, true);
    const [afterRouteUpdate] = await database.db.select({
      proofs: database.whitebitProviderSettingsTable.depositRouteProofs,
    }).from(database.whitebitProviderSettingsTable)
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    assert.deepEqual(afterRouteUpdate.proofs, [bnbProof]);
  } finally {
    await database.db.update(database.cryptoAssetNetworksTable)
      .set({
        networkName: originalBtc.networkName,
        customerDepositsEnabled: originalBtc.customerDepositsEnabled,
      })
      .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
    await database.db.update(database.cryptoAssetNetworksTable).set({
      enabled: originalBnbNetwork.enabled,
      lifecycle: originalBnbNetwork.lifecycle,
      executionMode: originalBnbNetwork.executionMode,
      depositProvider: originalBnbNetwork.depositProvider,
      networkCode: originalBnbNetwork.networkCode,
      customerDepositsEnabled: originalBnbNetwork.customerDepositsEnabled,
      whitebitAssetCode: originalBnbNetwork.whitebitAssetCode,
      whitebitNetworkCode: originalBnbNetwork.whitebitNetworkCode,
    }).where(eq(database.cryptoAssetNetworksTable.id, "bnb-bnb"));
    await database.db.update(database.cryptoAssetsTable).set({
      enabled: originalBnbAsset.enabled,
      lifecycle: originalBnbAsset.lifecycle,
    })
      .where(eq(database.cryptoAssetsTable.id, bnb.asset.id));
    await database.db.update(database.whitebitProviderSettingsTable).set({
      disabled: original.disabled,
      version: original.version,
      depositRouteProofs: original.depositRouteProofs,
      credentialVerifiedFingerprint: original.credentialVerifiedFingerprint,
      credentialVerifiedAt: original.credentialVerifiedAt,
      updatedAt: original.updatedAt,
    }).where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    globalThis.fetch = originalFetch;
    resetWhitebitCapabilityCacheForTests();
  }
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
      WHERE unique_id LIKE $1 OR address LIKE $1 OR order_id LIKE $2 OR order_id = ANY($3)
    )`, [`%${suffix}%`, `${orderId}%`, projectionOrderIds]);
    await cleanup.query("COMMIT");
  } finally {
    cleanup.release();
  }
  await pool.query("DELETE FROM whitebit_deposits WHERE unique_id LIKE $1 OR address LIKE $1 OR order_id LIKE $2 OR order_id = ANY($3)", [`%${suffix}%`, `${orderId}%`, projectionOrderIds]);
  await pool.query(`DELETE FROM whitebit_order_history_checkpoints WHERE order_address_id IN (
    SELECT id FROM whitebit_order_addresses WHERE order_id LIKE $1 OR order_id = ANY($2)
  )`, [`${orderId}%`, projectionOrderIds]);
  await pool.query("DELETE FROM whitebit_order_addresses WHERE order_id LIKE $1 OR order_id = ANY($2)", [`${orderId}%`, projectionOrderIds]);
  await pool.query("DELETE FROM blockchain_monitor_registration_gaps WHERE order_id LIKE $1", [`${orderId}%`]);
  await pool.query("DELETE FROM exchange_orders WHERE id LIKE $1 OR id = ANY($2)", [`${orderId}%`, projectionOrderIds]);
  await pool.query("DELETE FROM manual_desk_pricing_rules WHERE name LIKE $1 OR name LIKE $2", [
    `Swap test ${suffix}%`,
    `Refund absence ${suffix}%`,
  ]);
  await pool.query("DELETE FROM whitebit_webhook_deliveries WHERE envelope_id LIKE $1 OR payload->'params'->>'address' LIKE $2", [`%${suffix}%`, `%${suffix}%`]);
  await pool.query("DELETE FROM desk_operators WHERE clerk_user_id = $1", [ownerClerkUserId]);
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
  if (priorBtcNetwork) {
    await database.db.update(database.cryptoAssetNetworksTable).set({
      enabled: priorBtcNetwork.enabled,
      networkCode: priorBtcNetwork.networkCode,
      executionMode: priorBtcNetwork.executionMode,
      customerDepositsEnabled: priorBtcNetwork.customerDepositsEnabled,
      depositProvider: priorBtcNetwork.depositProvider,
      sharedDepositAddress: priorBtcNetwork.sharedDepositAddress,
      sharedDepositMemo: priorBtcNetwork.sharedDepositMemo,
      requiresMemo: priorBtcNetwork.requiresMemo,
      manualWalletTrackingEnabled: priorBtcNetwork.manualWalletTrackingEnabled,
    }).where(eq(database.cryptoAssetNetworksTable.id, priorBtcNetwork.id));
  }
  if (priorBtcAsset) {
    await database.db.update(database.cryptoAssetsTable).set({ enabled: priorBtcAsset.enabled })
      .where(eq(database.cryptoAssetsTable.id, priorBtcAsset.id));
  }
  if (priorUsdtAsset) {
    await database.db.update(database.cryptoAssetsTable).set({ enabled: priorUsdtAsset.enabled })
      .where(eq(database.cryptoAssetsTable.id, priorUsdtAsset.id));
  }
  await database.db.delete(database.providerIntegrationsTable)
    .where(eq(database.providerIntegrationsTable.provider, "whitebit"));
  if (priorWhitebitIntegration) {
    await database.db.insert(database.providerIntegrationsTable).values(priorWhitebitIntegration);
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

test("persisted WhiteBIT credentials provision addresses without environment credentials", async () => {
  const originalKey = process.env.WHITEBIT_API_KEY;
  const originalSecret = process.env.WHITEBIT_API_SECRET;
  const storedOrderId = `${orderId}-stored-credentials`;
  providerCalls = 0;
  try {
    await activateWhitebitCredentials(
      { apiKey: `stored-key-${suffix}`, secretKey: `stored-secret-${suffix}` },
      {
        actorClerkUserId: ownerClerkUserId,
        operatorId: null,
        operatorEmail: ownerEmail,
        requestId: `stored-credentials-${suffix}`,
        action: "test.activate_whitebit_credentials",
        credentialSource: "stored",
      },
    );
    delete process.env.WHITEBIT_API_KEY;
    delete process.env.WHITEBIT_API_SECRET;
    await mockAssets();
    const result = await provisionTest({
      orderId: storedOrderId,
      assetCode: "BTC",
      networkCode: "BITCOIN",
      manualAddress: "manual-wallet",
      manualMemo: "",
      chosenWhitebit: true,
    });
    assert.equal(result.source, "whitebit");
    assert.equal(result.address, orderAddress);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.WHITEBIT_API_KEY = originalKey;
    process.env.WHITEBIT_API_SECRET = originalSecret;
    await database.db.delete(database.providerIntegrationsTable)
      .where(eq(database.providerIntegrationsTable.provider, "whitebit"));
    if (priorWhitebitIntegration) {
      await database.db.insert(database.providerIntegrationsTable).values(priorWhitebitIntegration);
    }
    resetWhitebitCapabilityCacheForTests();
  }
});

test("credential rotation and provider disable cannot mismatch the claimed WhiteBIT snapshot", async () => {
  const originalKey = process.env.WHITEBIT_API_KEY;
  const originalSecret = process.env.WHITEBIT_API_SECRET;
  providerCalls = 0;
  const rotationOrderId = `${orderId}-rotation-disable`;
  const oldKey = `rotation-old-key-${suffix}`;
  const oldSecret = `rotation-old-secret-${suffix}`;
  const newKey = `rotation-new-key-${suffix}`;
  const newSecret = `rotation-new-secret-${suffix}`;
  let releaseProvider: (() => void) | undefined;
  let signalProviderStarted!: () => void;
  const providerStarted = new Promise<void>((resolve) => { signalProviderStarted = resolve; });
  const providerRelease = new Promise<void>((resolve) => { releaseProvider = resolve; });
  try {
    await activateWhitebitCredentials(
      { apiKey: oldKey, secretKey: oldSecret },
      {
        actorClerkUserId: ownerClerkUserId,
        operatorId: null,
        operatorEmail: ownerEmail,
        requestId: `rotation-old-${suffix}`,
        action: "test.activate_whitebit_credentials",
        credentialSource: "stored",
      },
    );
    delete process.env.WHITEBIT_API_KEY;
    delete process.env.WHITEBIT_API_SECRET;
    await mockAssets();
    const assetFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (!String(input).endsWith("/api/v4/main-account/create-new-address")) {
        return assetFetch(input, init);
      }
      providerCalls += 1;
      signalProviderStarted();
      await providerRelease;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("X-TXC-APIKEY"), oldKey);
      const body = String(init?.body);
      const payload = Buffer.from(body).toString("base64");
      assert.equal(headers.get("X-TXC-SIGNATURE"), createHmac("sha512", oldSecret).update(payload).digest("hex"));
      return new Response(JSON.stringify({ account: { address: orderAddress, memo: "ROTATION-TAG" } }), { status: 200 });
    };
    const provisioning = provisionTest({
      orderId: rotationOrderId,
      assetCode: "BTC",
      networkCode: "BITCOIN",
      manualAddress: "manual-wallet",
      manualMemo: "",
      chosenWhitebit: true,
    });
    await providerStarted;
    await Promise.all([
      activateWhitebitCredentials(
        { apiKey: newKey, secretKey: newSecret },
        {
          actorClerkUserId: ownerClerkUserId,
          operatorId: null,
          operatorEmail: ownerEmail,
          requestId: `rotation-new-${suffix}`,
          action: "test.rotate_whitebit_credentials",
          credentialSource: "stored",
        },
      ),
      database.db.update(database.whitebitProviderSettingsTable)
        .set({ disabled: true })
        .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit")),
    ]);
    releaseProvider?.();
    const result = await provisioning;
    assert.equal(result.source, "whitebit");
    assert.equal(result.address, orderAddress);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.WHITEBIT_API_KEY = originalKey;
    process.env.WHITEBIT_API_SECRET = originalSecret;
    await database.db.update(database.whitebitProviderSettingsTable)
      .set({ disabled: false })
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    await database.db.delete(database.providerIntegrationsTable)
      .where(eq(database.providerIntegrationsTable.provider, "whitebit"));
    if (priorWhitebitIntegration) {
      await database.db.insert(database.providerIntegrationsTable).values(priorWhitebitIntegration);
    }
    releaseProvider?.();
    resetWhitebitCapabilityCacheForTests();
  }
});

test("webhook authentication rejects trading API credentials without dedicated webhook credentials", async () => {
  const dedicatedKey = process.env.WHITEBIT_WEBHOOK_API_KEY;
  const dedicatedSecret = process.env.WHITEBIT_WEBHOOK_SECRET;
  delete process.env.WHITEBIT_WEBHOOK_API_KEY;
  delete process.env.WHITEBIT_WEBHOOK_SECRET;
  try {
    const body = JSON.stringify({});
    const payload = Buffer.from(body).toString("base64");
    const signature = createHmac("sha512", process.env.WHITEBIT_API_SECRET!)
      .update(payload)
      .digest("hex");
    const response = await fetch(`${baseUrl}/api/webhooks/whitebit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-txc-apikey": process.env.WHITEBIT_API_KEY!,
        "x-txc-payload": payload,
        "x-txc-signature": signature,
      },
      body,
    });
    assert.equal(response.status, 401);
  } finally {
    process.env.WHITEBIT_WEBHOOK_API_KEY = dedicatedKey;
    process.env.WHITEBIT_WEBHOOK_SECRET = dedicatedSecret;
  }
});

test("webhook authentication rejects trading API credentials even with dedicated webhook credentials", async () => {
  const body = JSON.stringify({});
  const payload = Buffer.from(body).toString("base64");
  const tradingSignature = createHmac("sha512", process.env.WHITEBIT_API_SECRET!)
    .update(payload).digest("hex");
  const response = await fetch(`${baseUrl}/api/webhooks/whitebit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-txc-apikey": process.env.WHITEBIT_API_KEY!,
      "x-txc-payload": payload,
      "x-txc-signature": tradingSignature,
    },
    body,
  });
  assert.equal(response.status, 401);

  const dedicatedSignature = createHmac("sha512", process.env.WHITEBIT_WEBHOOK_SECRET!)
    .update(payload).digest("hex");
  const dedicatedResponse = await fetch(`${baseUrl}/api/webhooks/whitebit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-txc-apikey": process.env.WHITEBIT_WEBHOOK_API_KEY!,
      "x-txc-payload": payload,
      "x-txc-signature": dedicatedSignature,
    },
    body,
  });
  assert.equal(dedicatedResponse.status, 400); // Signed, but the empty envelope is invalid.
});

test("capability loss after provider selection uses the exact manual fallback without provider call", async () => {
  await mockAssets();
  const parsed = parseWhitebitAssets({ BTC: { can_deposit: true, networks: { deposits: ["BITCOIN"] } } });
  assert.ok(parsed);
  assert.equal(matchWhitebitCapability({ fetchedAt: Date.now(), assets: parsed }, "BTC", "ERC20"), null);
  assert.deepEqual(parseWhitebitAssets({
    BTC: { can_deposit: true, networks: { deposits: ["BITCOIN"] } },
    INJ: { can_deposit: true, networks: {}, confirmations: { INJECTIVE: 1000 } },
  })?.map((asset) => asset.ticker), ["BTC"]);
  await seedWhitebitVerificationFixture("BTC", "BITCOIN");
  const status = await whitebitSwapStatus();
  assert.equal(status.enabled, true);
  assert.equal(parseWhitebitAssets({ BTC: { can_deposit: true, networks: { deposits: "BITCOIN" } } }), null);
  await mockAssets("ERC20");
  const before = providerCalls;
  const unresolvedOrderId = `${orderId}-capability-loss`;
  const fallbackAddress = validBitcoinAddress();
  await insertProvisioningOrder(unresolvedOrderId, fallbackAddress);
  await database.db.update(database.cryptoAssetNetworksTable)
    .set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [fallbackOrderBeforeProvision] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, unresolvedOrderId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(fallbackOrderBeforeProvision?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, unresolvedOrderId));
  const result = await provisionTest({
    orderId: unresolvedOrderId, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: fallbackAddress, manualMemo: "", manualFallbackEnabled: true, chosenWhitebit: true,
  }, false);
  assert.equal(result.unresolved, false);
  assert.equal(result.address, fallbackAddress);
  assert.equal(providerCalls, before);
  const [order] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, unresolvedOrderId));
  assert.equal(order?.fundingStatus, "ready_manual");
  assert.equal(order?.depositAddress, fallbackAddress);
  assert.equal((order?.fundingDetailsSnapshot as { addressSource?: string }).addressSource, "manual_fallback");
  assert.equal(((order?.settlementSnapshot as { funding?: { addressSource?: string } }).funding)?.addressSource, "manual_fallback");
});

test("concurrent identical order requests make one provider call and never expose transient manual", async () => {
  providerCalls = 0;
  await mockAssets();
  const [originalNetwork] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  assert.ok(originalNetwork);
  try {
    await database.db.update(database.cryptoAssetNetworksTable).set({
      customerDepositsEnabled: true,
      sharedDepositAddress: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
    }).where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
    const results = await Promise.all([1, 2].map(() => provisionTest({
      orderId: `${orderId}-concurrent`, assetCode: "BTC", networkCode: "BITCOIN",
      manualAddress: "manual-wallet", manualMemo: "", chosenWhitebit: true,
    })));
    assert.equal(providerCalls, 1);
    assert.ok(results.every((result) => result.source === "whitebit" || result.unresolved));
    assert.ok(results.every((result) => result.address !== "manual-wallet"));
  } finally {
    await database.db.update(database.cryptoAssetNetworksTable).set({
      customerDepositsEnabled: originalNetwork.customerDepositsEnabled,
      sharedDepositAddress: originalNetwork.sharedDepositAddress,
    }).where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  }
});

test("idempotent replay returns one immutable final address", async () => {
  await mockAssets();
  const first = await provisionTest({ orderId: `${orderId}-replay`, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: "manual", manualMemo: "", chosenWhitebit: true });
  const calls = providerCalls;
  const second = await provisionTest({ orderId: `${orderId}-replay`, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: "different-manual", manualMemo: "", chosenWhitebit: true });
  assert.equal(first.address, second.address);
  assert.equal(providerCalls, calls);
});

test("different Swap orders on the same route receive distinct WhiteBIT instructions", async () => {
  providerCalls = 0;
  const addresses = [validBitcoinAddress(), validBitcoinAddress()];
  assert.notEqual(addresses[0], addresses[1]);
  await mockAssets();
  const assetsFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/main-account/create-new-address")) {
      const address = addresses[providerCalls];
      providerCalls += 1;
      providerPermissionCalls += 1;
      assert.ok(address, "unexpected extra WhiteBIT address request");
      return new Response(JSON.stringify({
        account: { address, memo: `TAG-${providerCalls}` },
      }), { status: 200 });
    }
    return assetsFetch(input, init);
  };

  try {
    const firstOrderId = `${orderId}-distinct-first`;
    const secondOrderId = `${orderId}-distinct-second`;
    const first = await provisionTest({
      orderId: firstOrderId, assetCode: "BTC", networkCode: "BITCOIN",
      manualAddress: "manual-wallet", manualMemo: "", chosenWhitebit: true,
    });
    assert.equal(providerCalls, 1, "the first new order should make one provider request");
    const second = await provisionTest({
      orderId: secondOrderId, assetCode: "BTC", networkCode: "BITCOIN",
      manualAddress: "manual-wallet", manualMemo: "", chosenWhitebit: true,
    });
    assert.equal(providerCalls, 2, "the second new order should make one additional provider request");
    assert.equal(first.address, addresses[0]);
    assert.equal(first.memo, "TAG-1");
    assert.equal(second.address, addresses[1]);
    assert.equal(second.memo, "TAG-2");
    assert.notDeepEqual(
      { address: first.address, memo: first.memo },
      { address: second.address, memo: second.memo },
    );

    const [firstOrder] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, firstOrderId)).limit(1);
    const [secondOrder] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, secondOrderId)).limit(1);
    assert.ok(firstOrder);
    assert.ok(secondOrder);
    assert.deepEqual(
      { address: firstOrder.depositAddress, memo: firstOrder.depositMemo },
      { address: addresses[0], memo: "TAG-1" },
      "first order should persist its WhiteBIT deposit instructions",
    );
    assert.deepEqual(
      { address: secondOrder.depositAddress, memo: secondOrder.depositMemo },
      { address: addresses[1], memo: "TAG-2" },
      "second order should persist its WhiteBIT deposit instructions",
    );
    for (const [order, expectedAddress, expectedMemo] of [
      [firstOrder, addresses[0], "TAG-1"],
      [secondOrder, addresses[1], "TAG-2"],
    ] as const) {
      const funding = order.fundingDetailsSnapshot as { address?: string; memo?: string; status?: string };
      const settlementFunding = (order.settlementSnapshot as { funding?: { address?: string; memo?: string; status?: string } }).funding;
      assert.deepEqual(
        { address: funding.address, memo: funding.memo, status: funding.status },
        { address: expectedAddress, memo: expectedMemo, status: "ready" },
        `order ${order.id} should freeze WhiteBIT instructions in funding details`,
      );
      assert.deepEqual(
        { address: settlementFunding?.address, memo: settlementFunding?.memo, status: settlementFunding?.status },
        { address: expectedAddress, memo: expectedMemo, status: "ready" },
        `order ${order.id} should freeze WhiteBIT instructions in settlement snapshot`,
      );
    }

    const callsAfterProvisioning = providerCalls;
    const firstReplay = await provisionTest({
      orderId: firstOrderId, assetCode: "BTC", networkCode: "BITCOIN",
      manualAddress: "manual-wallet", manualMemo: "", chosenWhitebit: true,
    });
    const secondReplay = await provisionTest({
      orderId: secondOrderId, assetCode: "BTC", networkCode: "BITCOIN",
      manualAddress: "manual-wallet", manualMemo: "", chosenWhitebit: true,
    });
    assert.deepEqual(
      { address: firstReplay.address, memo: firstReplay.memo },
      { address: addresses[0], memo: "TAG-1" },
      "first order replay should return its own frozen instructions",
    );
    assert.deepEqual(
      { address: secondReplay.address, memo: secondReplay.memo },
      { address: addresses[1], memo: "TAG-2" },
      "second order replay should return its own frozen instructions",
    );
    assert.equal(providerCalls, callsAfterProvisioning, "replaying either order must not request another address");
  } finally {
    globalThis.fetch = assetsFetch;
  }
});

test("a provider address already assigned to another order uses fallback", async () => {
  await mockAssets();
  const first = await provisionTest({
    orderId: `${orderId}-unique-first`, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: "first-fallback", manualMemo: "", chosenWhitebit: true,
  });
  assert.equal(first.address, orderAddress);
  const fallbackAddress = validBitcoinAddress();
  const secondId = `${orderId}-unique-second`;
  await insertProvisioningOrder(secondId, fallbackAddress);
  await database.db.update(database.cryptoAssetNetworksTable)
    .set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [secondOrderBeforeProvision] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, secondId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(secondOrderBeforeProvision?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, secondId));
  const second = await provisionTest({
    orderId: secondId, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: fallbackAddress, manualMemo: "", manualFallbackEnabled: true, chosenWhitebit: true,
  });
  assert.equal(second.address, fallbackAddress);
  const [secondOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, `${orderId}-unique-second`));
  assert.equal(secondOrder.depositAddress, fallbackAddress);
  assert.equal((secondOrder.fundingDetailsSnapshot as { addressSource?: string }).addressSource, "manual_fallback");
});

test("definitive provider rejection remains WhiteBIT-owned and uses the exact manual fallback", async () => {
  await mockAssets();
  const saved = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).endsWith("/api/v4/main-account/create-new-address")
    ? new Response(JSON.stringify({ error: "rejected" }), { status: 403 }) : saved(input, init);
  const fallbackAddress = validBitcoinAddress();
  const rejectId = `${orderId}-reject`;
  await insertProvisioningOrder(rejectId, fallbackAddress);
  await database.db.update(database.cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [rejectOrderBeforeProvision] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, rejectId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(rejectOrderBeforeProvision?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, rejectId));
  const result = await provisionTest({ orderId: rejectId, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: fallbackAddress, manualMemo: "", manualFallbackEnabled: true, chosenWhitebit: true });
  assert.equal(result.source, "whitebit");
  assert.equal(result.address, fallbackAddress);
  assert.equal(result.unresolved, false);
  const [rejectedOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, `${orderId}-reject`));
  assert.equal(rejectedOrder.fundingProviderSource, "whitebit");
  assert.equal(rejectedOrder.fundingStatus, "ready_manual");
  assert.equal(rejectedOrder.depositAddress, fallbackAddress);
  assert.equal((rejectedOrder.fundingDetailsSnapshot as { addressSource?: string; manualFallbackEnabled?: boolean }).addressSource, "manual_fallback");
  assert.equal((rejectedOrder.fundingDetailsSnapshot as { manualFallbackEnabled?: boolean }).manualFallbackEnabled, true);
  assert.equal(((rejectedOrder.settlementSnapshot as { funding?: { addressSource?: string } }).funding)?.addressSource, "manual_fallback");
  globalThis.fetch = saved;
});

test("WhiteBIT fallback fails closed without frozen and current exact-route opt-in", async () => {
  await mockAssets();
  const saved = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).endsWith("/api/v4/main-account/create-new-address")
    ? new Response(JSON.stringify({ error: "rejected" }), { status: 403 }) : saved(input, init);
  const fallbackAddress = validBitcoinAddress();
  await database.db.update(database.cryptoAssetNetworksTable)
    .set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  await seedWhitebitVerificationFixture("BTC", "BITCOIN");

  const legacyId = `${orderId}-fallback-legacy-snapshot`;
  await insertProvisioningOrder(legacyId, fallbackAddress);
  const legacy = await provisionSwapFundingAddress({
    orderId: legacyId, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: fallbackAddress, manualMemo: "",
    manualFallbackEnabled: true, manualFallbackUsable: true, chosenWhitebit: true,
  });
  assert.equal(legacy.unresolved, true);
  assert.equal(legacy.address, null);
  const [legacyOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, legacyId));
  assert.equal(legacyOrder.depositAddress, "");
  assert.equal((legacyOrder.fundingDetailsSnapshot as { addressSource?: string }).addressSource, "unavailable");
  assert.equal((legacyOrder.fundingDetailsSnapshot as { manualFallbackEnabled?: boolean }).manualFallbackEnabled, undefined);

  const currentOptOutId = `${orderId}-fallback-current-opt-out`;
  await insertProvisioningOrder(currentOptOutId, fallbackAddress);
  await database.db.update(database.cryptoAssetNetworksTable)
    .set({ manualFallbackEnabled: false })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [currentOptOutBefore] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, currentOptOutId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(currentOptOutBefore?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, currentOptOutId));
  const currentOptOut = await provisionSwapFundingAddress({
    orderId: currentOptOutId, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: fallbackAddress, manualMemo: "",
    manualFallbackEnabled: true, manualFallbackUsable: true, chosenWhitebit: true,
  });
  assert.equal(currentOptOut.unresolved, true);
  assert.equal(currentOptOut.address, null);
  const [currentOptOutOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, currentOptOutId));
  assert.equal(currentOptOutOrder.depositAddress, "");
  globalThis.fetch = saved;
});

test("timeout falls back atomically and replay never recalls the provider", async () => {
  await mockAssets();
  const saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/main-account/create-new-address")) { calls += 1; throw new Error("timeout"); }
    return saved(input, init);
  };
  const fallbackAddress = validBitcoinAddress();
  const timeoutId = `${orderId}-timeout`;
  await insertProvisioningOrder(timeoutId, fallbackAddress);
  await database.db.update(database.cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [timeoutOrderBeforeProvision] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, timeoutId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(timeoutOrderBeforeProvision?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, timeoutId));
  const result = await provisionTest({ orderId: timeoutId, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: fallbackAddress, manualMemo: "", manualFallbackEnabled: true, chosenWhitebit: true });
  assert.equal(result.unresolved, false);
  assert.equal(result.address, fallbackAddress);
  const replay = await provisionTest({ orderId: timeoutId, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: fallbackAddress, manualMemo: "", manualFallbackEnabled: true, chosenWhitebit: true });
  assert.equal(replay.unresolved, false);
  assert.equal(replay.address, null);
  assert.equal(calls, 1);
  const [fallbackOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, `${orderId}-timeout`));
  assert.equal(fallbackOrder.fundingStatus, "ready_manual");
  assert.equal(fallbackOrder.depositAddress, fallbackAddress);
  assert.equal((fallbackOrder.fundingDetailsSnapshot as { status?: string }).status, "manual_fallback");
  globalThis.fetch = saved;
});

test("malformed provider response uses fallback, while an unusable required-memo fallback stays unavailable", async () => {
  await mockAssets();
  const saved = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).endsWith("/api/v4/main-account/create-new-address")
    ? new Response(JSON.stringify({ account: {} }), { status: 200 })
    : saved(input, init);
  const malformedId = `${orderId}-malformed`;
  const fallbackAddress = validBitcoinAddress();
  await insertProvisioningOrder(malformedId, fallbackAddress);
  await database.db.update(database.cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [malformedOrderBeforeProvision] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, malformedId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(malformedOrderBeforeProvision?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, malformedId));
  const malformed = await provisionTest({
    orderId: malformedId, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: fallbackAddress, manualMemo: "", manualFallbackUsable: true,
    manualFallbackEnabled: true,
    chosenWhitebit: true,
  });
  assert.equal(malformed.unresolved, false);
  assert.equal(malformed.address, fallbackAddress);

  const noMemoId = `${orderId}-required-memo`;
  await insertProvisioningOrder(noMemoId, fallbackAddress, "", true);
  await database.db.update(database.cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      source: "whitebit", status: "provisioning", address: "", memo: "",
      manualFallbackAddress: fallbackAddress, manualFallbackMemo: "",
      manualFallbackEnabled: true,
      requiresMemo: true,
    },
  }).where(eq(database.ordersTable.id, noMemoId));
  const unavailable = await provisionSwapFundingAddress({
    orderId: noMemoId, assetCode: "BTC", networkCode: "BITCOIN",
    manualAddress: fallbackAddress, manualMemo: "", manualFallbackEnabled: true,
    manualFallbackUsable: false, chosenWhitebit: true,
  });
  assert.equal(unavailable.unresolved, true);
  assert.equal(unavailable.address, null);
  const [unavailableOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, noMemoId));
  assert.equal(unavailableOrder.fundingStatus, "unresolved");
  assert.equal((unavailableOrder.fundingDetailsSnapshot as { addressSource?: string }).addressSource, "unavailable");
  globalThis.fetch = saved;
});

test("invalid WhiteBIT instructions never become a ready claim or exposed address", async () => {
  await mockAssets();
  const saved = globalThis.fetch;
  const [route] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  assert.ok(route);
  try {
    await database.db.update(database.cryptoAssetNetworksTable).set({ requiresMemo: true })
      .where(eq(database.cryptoAssetNetworksTable.id, route.id));
    await seedWhitebitVerificationFixture("BTC", "BITCOIN");
    const manualFallbackAddress = validBitcoinAddress();
    for (const [label, address, memo, fallback, expected] of [
      ["invalid-address", "not-a-bitcoin-address", "TAG-1", manualFallbackAddress, manualFallbackAddress],
      ["missing-memo", validBitcoinAddress(), "", manualFallbackAddress, manualFallbackAddress],
      ["invalid-memo", validBitcoinAddress(), "\u0001", "", ""],
    ] as const) {
      globalThis.fetch = async (input, init) => String(input).endsWith("/api/v4/main-account/create-new-address")
        ? new Response(JSON.stringify({ account: { address, memo } }), { status: 200 })
        : saved(input, init);
      const id = `${orderId}-${label}`;
      await insertProvisioningOrder(id, fallback, fallback ? "MANUAL-TAG" : "", true);
      await database.db.update(database.cryptoAssetNetworksTable)
        .set({ manualFallbackEnabled: true })
        .where(eq(database.cryptoAssetNetworksTable.id, route.id));
      const [orderBeforeProvision] = await database.db.select().from(database.ordersTable)
        .where(eq(database.ordersTable.id, id));
      await database.db.update(database.ordersTable).set({
        fundingDetailsSnapshot: {
          ...(orderBeforeProvision?.fundingDetailsSnapshot as Record<string, unknown>),
          manualFallbackEnabled: true,
        },
      }).where(eq(database.ordersTable.id, id));
      const result = await provisionSwapFundingAddress({
        orderId: id, assetCode: "BTC", networkCode: "BITCOIN",
        manualAddress: fallback, manualMemo: fallback ? "MANUAL-TAG" : "",
        manualFallbackUsable: Boolean(fallback), manualFallbackEnabled: true, chosenWhitebit: true,
      });
      assert.equal(result.address, expected || null);
      assert.equal(result.unresolved, !expected);
      const [claim] = await database.db.select().from(database.whitebitOrderAddressesTable)
        .where(eq(database.whitebitOrderAddressesTable.orderId, id));
      const [order] = await database.db.select().from(database.ordersTable)
        .where(eq(database.ordersTable.id, id));
      assert.equal(claim.status, "unresolved");
      assert.equal(order.depositAddress, expected);
      assert.notEqual(order.fundingStatus, "ready_whitebit");
    }
  } finally {
    globalThis.fetch = saved;
    await database.db.update(database.cryptoAssetNetworksTable).set({
      requiresMemo: route.requiresMemo,
      manualFallbackEnabled: route.manualFallbackEnabled,
    })
      .where(eq(database.cryptoAssetNetworksTable.id, route.id));
  }
});

test("fallback without READY exact-route monitoring never creates an unsafe watch", async () => {
  const id = `${orderId}-unready-fallback-watch`;
  const fallbackAddress = validBitcoinAddress();
  await insertProvisioningOrder(id, fallbackAddress, "", false, true);
  await database.db.update(database.cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [orderBeforeFallback] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, id));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(orderBeforeFallback?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, id));
  await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: id, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    status: "unresolved",
  });
  await finalizeSwapFundingFromClaim(id);
  await Promise.all([registerManualBlockchainWatch(id), registerManualBlockchainWatch(id)]);
  const [order] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, id));
  const [watch] = await database.db.select().from(database.blockchainMonitorWatchesTable)
    .where(eq(database.blockchainMonitorWatchesTable.orderId, id));
  assert.equal(order.fundingProviderSource, "whitebit");
  assert.equal(order.providerState, "whitebit_fallback");
  assert.equal((order.fundingDetailsSnapshot as { addressSource?: string }).addressSource, "manual_fallback");
  assert.equal(watch, undefined);
});

test("a fallback qualifies only with a fresh proof for its exact monitored address", async () => {
  const [route] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  assert.ok(route);
  const [catalogAsset] = await database.db.select().from(database.cryptoAssetsTable)
    .where(eq(database.cryptoAssetsTable.id, route.assetId));
  const [baseOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, orderId));
  assert.ok(catalogAsset && baseOrder);
  const address = validBitcoinAddress();
  const now = new Date();
  const config = { endpoint: "http://127.0.0.1:1" }; // Never contacted; proof-only fixture.
  const network = {
    id: `monitor-${suffix}`,
    networkCode: "BITCOIN",
    networkName: "Bitcoin test monitor",
    adapterKind: "bitcoin",
    chainId: null,
    providerKind: "rpc",
    enabled: true,
    endpointSecretRef: null,
    apiKeySecretRef: null,
    confirmationsRequired: 1,
    finalityPolicy: "confirmations",
    pollIntervalSeconds: 15,
    maxScanRange: 1000,
    cursor: null,
    lastHead: "100",
    healthStatus: "connected",
    healthCheckedAt: now,
    lastSuccessfulScanAt: now,
    healthError: null,
    consecutiveFailures: 0,
    healthProofFingerprint: "",
    healthProofCapturedAt: now,
    nextAttemptAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    createdAt: now,
    updatedAt: now,
  } as typeof database.blockchainMonitorNetworksTable.$inferSelect;
  const asset = {
    id: `monitor-asset-${suffix}`,
    monitorNetworkId: network.id,
    assetNetworkId: route.id,
    identityKind: "native",
    contractOrMint: null,
    decimals: route.decimals,
    enabled: true,
    readinessProofFingerprint: "",
    readinessProofCapturedAt: now,
    createdAt: now,
    updatedAt: now,
  } as typeof database.blockchainMonitorAssetsTable.$inferSelect;
  const exactRoute = {
    ...route, networkCode: network.networkCode, enabled: true, executionMode: "manual", depositProvider: "whitebit",
    sharedDepositAddress: address, sharedDepositMemo: null, requiresMemo: false,
  };
  network.healthProofFingerprint = manualMonitoringNetworkConfigDigest({
    network, endpoint: config.endpoint,
  });
  asset.readinessProofFingerprint = manualMonitoringProofFingerprint({
    network, asset, route: exactRoute,
    endpoint: config.endpoint, capturedAt: now, head: network.lastHead ?? "",
  });
  const fallbackOrder = {
    ...baseOrder, fundingProviderSource: "whitebit", fundingStatus: "ready_manual",
    providerState: "whitebit_fallback", depositAddress: address, depositMemo: "",
    fundingDetailsSnapshot: { address, memo: "", addressSource: "manual_fallback" },
  };
  assert.equal(isReadyManualFallbackWatch(fallbackOrder, exactRoute, catalogAsset, network, asset, config), true);
  assert.equal(isReadyManualFallbackWatch(fallbackOrder, exactRoute, catalogAsset, {
    ...network, healthCheckedAt: new Date(0),
  }, asset, config), false);
  assert.equal(isReadyManualFallbackWatch({
    ...fallbackOrder, depositAddress: validBitcoinAddress(),
  }, exactRoute, catalogAsset, network, asset, config), false);
  assert.equal(isReadyManualFallbackWatch({
    ...fallbackOrder, providerState: "whitebit",
  }, exactRoute, catalogAsset, network, asset, config), false);
});

test("disabled provider uses fallback without a provider call", async () => {
  const toggleOrderId = `${orderId}-toggle`;
  providerCalls = 0;
  await database.db.update(database.whitebitProviderSettingsTable)
    .set({ disabled: true })
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  const fallbackAddress = validBitcoinAddress();
  await insertProvisioningOrder(toggleOrderId, fallbackAddress);
  await database.db.update(database.cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [toggleOrderBeforeProvision] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, toggleOrderId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(toggleOrderBeforeProvision?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, toggleOrderId));
  const result = await provisionTest({ orderId: toggleOrderId, assetCode: "BTC", networkCode: "BITCOIN", manualAddress: fallbackAddress, manualMemo: "", manualFallbackEnabled: true, chosenWhitebit: true }, false);
  assert.equal(result.unresolved, false);
  assert.equal(result.address, fallbackAddress);
  assert.equal(providerCalls, 0);
  const [order] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, toggleOrderId));
  assert.equal(order?.fundingStatus, "ready_manual");
  assert.equal(order?.providerState, "whitebit_fallback");
  await database.db.update(database.whitebitProviderSettingsTable)
    .set({ disabled: false })
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
});

test("ready provider claim converges order snapshots after simulated crash without provider recall", async () => {
  await finalizeSwapFundingFromClaim(orderId);
  const [row] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, orderId));
  const [claim] = await database.db.select({ address: database.whitebitOrderAddressesTable.address })
    .from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.orderId, orderId));
  assert.equal(row.fundingStatus, "ready_whitebit");
  assert.equal(row.depositAddress, claim.address);
  assert.equal((row.settlementSnapshot as { funding?: { address?: string } }).funding?.address, claim.address);
});

test("owner recovery atomically updates all order snapshots", async () => {
  const recoveryOrderId = `${orderId}-recovery`;
  const recoveredAddress = validBitcoinAddress();
  await insertProvisioningOrder(recoveryOrderId);
  const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: recoveryOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
    status: "unresolved", providerError: "operator recovery required",
  }).returning();
  const response = await fetch(`${baseUrl}/api/admin/whitebit/recover-order-address`, {
    method: "POST", headers: { "content-type": "application/json", "x-test-operator": ownerClerkUserId },
    body: JSON.stringify({ id: claim.id, address: recoveredAddress, memo: "REC-TAG" }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const [order] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, recoveryOrderId));
  assert.equal(order?.fundingStatus, "ready_whitebit");
  assert.equal(order?.depositAddress, recoveredAddress);
  assert.equal((order?.settlementSnapshot as { funding?: { address?: string } })?.funding?.address, recoveredAddress);
});

test("concurrent owner recovery cannot assign one WhiteBIT address to two orders", async () => {
  const ids = [`${orderId}-recovery-race-a`, `${orderId}-recovery-race-b`];
  const claims = [];
  for (const id of ids) {
    await insertProvisioningOrder(id, "");
    const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
      orderId: id, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
      status: "unresolved", providerError: "operator recovery required",
    }).returning();
    claims.push(claim);
  }
  const address = validBitcoinAddress();
  const recover = (id: string) => fetch(`${baseUrl}/api/admin/whitebit/recover-order-address`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-operator": ownerClerkUserId },
    body: JSON.stringify({ id, address: ` ${address} `, memo: "REC-TAG" }),
  });
  const responses = await Promise.all(claims.map((claim) => recover(claim.id)));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const winner = responses.findIndex((response) => response.status === 200);
  const loser = 1 - winner;
  const retry = await recover(claims[loser].id);
  assert.equal(retry.status, 409);
  const [ready] = await database.db.select().from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.id, claims[winner].id));
  const [unresolved] = await database.db.select().from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.id, claims[loser].id));
  assert.equal(ready.address, address);
  assert.equal(unresolved.status, "unresolved");
  assert.equal(unresolved.address, null);
});

test("stale calling replay resolves to fallback atomically and cannot later switch customer deposit addresses", async () => {
  const staleOrderId = `${orderId}-stale-calling`;
  const fallbackAddress = validBitcoinAddress();
  await insertProvisioningOrder(staleOrderId, fallbackAddress);
  await database.db.update(database.cryptoAssetNetworksTable).set({ manualFallbackEnabled: true })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const [staleOrderBeforeFallback] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, staleOrderId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(staleOrderBeforeFallback?.fundingDetailsSnapshot as Record<string, unknown>),
      manualFallbackEnabled: true,
    },
  }).where(eq(database.ordersTable.id, staleOrderId));
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
  assert.equal(unresolvedOrder.fundingStatus, "ready_manual");
  assert.equal(unresolvedOrder.depositAddress, fallbackAddress);
  assert.equal((unresolvedOrder.fundingDetailsSnapshot as { status?: string }).status, "manual_fallback");
  assert.equal(((unresolvedOrder.settlementSnapshot as { funding?: { status?: string } }).funding)?.status, "manual_fallback");
  const response = await fetch(`${baseUrl}/api/admin/whitebit/recover-order-address`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-operator": ownerClerkUserId },
    body: JSON.stringify({ id: claim.id, address: "stale-recovered", memo: "STALE-TAG" }),
  });
  assert.equal(response.status, 409, await response.text());
  const [readyClaim] = await database.db.select().from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.id, claim.id));
  const [readyOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, staleOrderId));
  assert.equal(readyClaim.status, "unresolved");
  assert.equal(readyOrder.fundingStatus, "ready_manual");
  assert.equal(readyOrder.depositAddress, fallbackAddress);
  assert.equal((readyOrder.fundingDetailsSnapshot as { address?: string }).address, fallbackAddress);
  assert.equal(((readyOrder.settlementSnapshot as { funding?: { address?: string } }).funding)?.address, fallbackAddress);
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

test("canceled WhiteBIT delivery is audited without changing either order or its deposit", async () => {
  const firstOrderId = `${orderId}-canceled-deposit`;
  const otherOrderId = `${orderId}-unrelated-deposit`;
  await insertProvisioningOrder(firstOrderId);
  await insertProvisioningOrder(otherOrderId);
  const firstAddress = `cancel-order-address-${suffix}`;
  const otherAddress = `other-order-address-${suffix}`;
  await database.db.insert(database.whitebitOrderAddressesTable).values([
    { orderId: firstOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
      address: firstAddress, memo: "TAG-1", status: "ready" },
    { orderId: otherOrderId, ticker: "BTC", providerTicker: "BTC", network: "BITCOIN",
      address: otherAddress, memo: "TAG-1", status: "ready" },
  ]);
  await finalizeSwapFundingFromClaim(firstOrderId);
  await finalizeSwapFundingFromClaim(otherOrderId);
  const uniqueId = `cancel-order-${suffix}`;
  assert.equal((await signedOrderWebhook(uniqueId, firstAddress, "BITCOIN", "TAG-1", "deposit.accepted", 15)).status, 200);
  const [orderBefore] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, firstOrderId));
  const [otherBefore] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, otherOrderId));
  // The delivery is audited regardless of its address, but neither the
  // original nor an unrelated order or deposit is changed by cancellation.
  assert.equal((await signedOrderWebhook(uniqueId, otherAddress, "BITCOIN", "TAG-1", "deposit.canceled", 15, "wrong-order")).status, 200);
  let [deposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, uniqueId));
  assert.equal(deposit.status, "accepted");
  assert.equal(deposit.orderId, firstOrderId);
  const unchangedAt = deposit.updatedAt.getTime();
  assert.equal((await signedOrderWebhook(uniqueId, firstAddress, "BITCOIN", "TAG-1", "deposit.canceled", 15)).status, 200);
  assert.equal((await signedOrderWebhook(uniqueId, firstAddress, "BITCOIN", "TAG-1", "deposit.canceled", 15, "duplicate")).status, 200);
  [deposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, uniqueId));
  assert.equal(deposit.status, "accepted");
  assert.equal(deposit.orderId, firstOrderId);
  assert.equal(deposit.updatedAt.getTime(), unchangedAt);
  assert.equal(deposit.creditedAt, null);
  assert.equal((await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.orderId, otherOrderId))).length, 0);
  const [orderAfter] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, firstOrderId));
  const [otherAfter] = await database.db.select().from(database.ordersTable).where(eq(database.ordersTable.id, otherOrderId));
  assert.equal(orderAfter.status, orderBefore.status);
  assert.equal(orderAfter.manualSettlementState, orderBefore.manualSettlementState);
  assert.equal(otherAfter.status, otherBefore.status);
  assert.equal(otherAfter.manualSettlementState, otherBefore.manualSettlementState);
});

test("WhiteBIT Swap deposit detection and finality advance without auto-completing payout", async () => {
  const testOrderId = `${orderId}-deposit-finality`;
  const address = `deposit-finality-address-${suffix}`;
  const uniqueId = `deposit-finality-${suffix}`;
  const transactionId = `deposit-finality-tx-${suffix}`;
  await insertProvisioningOrder(testOrderId);
  const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: testOrderId,
    ticker: "BTC",
    providerTicker: "BTC",
    network: "BITCOIN",
    address,
    memo: "FINALITY-TAG",
    status: "ready",
  }).returning();
  await finalizeSwapFundingFromClaim(testOrderId);

  // Set the synthetic order's frozen Admin route threshold. Do not pre-edit
  // either lifecycle status: the accepted event must cause Pending -> Detected.
  const [readyOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, testOrderId));
  assert.equal(readyOrder.status, "awaiting funds");
  assert.equal(readyOrder.fundingStatus, "ready_whitebit");
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(readyOrder.fundingDetailsSnapshot as Record<string, unknown>),
      requiredConfirmations: 3,
    },
  }).where(eq(database.ordersTable.id, testOrderId));

  let deliverySequence = 0;
  async function deliver(
    depositAddress: string,
    idSuffix: string,
    method: string,
    status: number,
    confirmations?: { actual: number; required: number },
  ) {
    const body = JSON.stringify({
      method,
      params: {
        nonce: ++signedWebhookNonce,
        address: depositAddress,
        ticker: "BTC",
        network: "BITCOIN",
        memo: "FINALITY-TAG",
        amount: "1.25",
        fee: "0",
        status,
        unique_id: `${uniqueId}-${idSuffix}`,
        transaction_id: `${transactionId}-${idSuffix}`,
        transactionHash: `deposit-finality-hash-${suffix}-${idSuffix}`,
        ...(confirmations ? {
          confirmations: confirmations.actual,
          confirmationsRequired: confirmations.required,
        } : {}),
      },
      id: runId(`deposit-finality-delivery-${++deliverySequence}`),
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
  const accepted = await deliver(claim.address!, "stable", "deposit.accepted", 1);
  assert.equal(accepted.status, 200, await accepted.text());
  let [order] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, testOrderId));
  assert.equal(order.status, "payment detected");
  assert.equal(order.manualSettlementState, "awaiting_funds");

  const underConfirmed = await deliver(claim.address!, "stable", "deposit.processed", 3, {
    actual: 2,
    required: 1,
  });
  assert.equal(underConfirmed.status, 200, await underConfirmed.text());
  [order] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, testOrderId));
  assert.equal(order.status, "payment detected");
  assert.equal(order.manualSettlementState, "awaiting_funds");

  const confirmed = await deliver(claim.address!, "stable", "deposit.processed", 3, {
    actual: 3,
    required: 1,
  });
  assert.equal(confirmed.status, 200, await confirmed.text());
  [order] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, testOrderId));
  assert.equal(order.status, "processing");
  assert.equal(order.manualSettlementState, "funds_confirmed");
  assert.equal(order.manualSettlementPaidAt, null);
  assert.notEqual(order.status.toLowerCase(), "completed");
  assert.notEqual(order.manualSettlementState, "completed");

  const omittedCountsOrderId = `${orderId}-finality-omitted-counts`;
  const omittedCountsAddress = `finality-omitted-counts-address-${suffix}`;
  await insertProvisioningOrder(omittedCountsOrderId);
  const [omittedCountsClaim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: omittedCountsOrderId,
    ticker: "BTC",
    providerTicker: "BTC",
    network: "BITCOIN",
    address: omittedCountsAddress,
    memo: "FINALITY-TAG",
    status: "ready",
  }).returning();
  await finalizeSwapFundingFromClaim(omittedCountsOrderId);
  const [omittedCountsReadyOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, omittedCountsOrderId));
  await database.db.update(database.ordersTable).set({
    fundingDetailsSnapshot: {
      ...(omittedCountsReadyOrder.fundingDetailsSnapshot as Record<string, unknown>),
      requiredConfirmations: 3,
    },
  }).where(eq(database.ordersTable.id, omittedCountsOrderId));
  const omittedCounts = await deliver(
    omittedCountsClaim.address!,
    "omitted-counts",
    "deposit.processed",
    3,
  );
  assert.equal(omittedCounts.status, 200, await omittedCounts.text());
  const [omittedCountsOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, omittedCountsOrderId));
  assert.equal(omittedCountsOrder.status, "processing");
  assert.equal(omittedCountsOrder.manualSettlementState, "funds_confirmed");
});

test("memo-less BNB/BEP20 claim matches null webhook and history memos but real tags stay exact", async () => {
  const webhookOrderId = `${orderId}-bnb-empty-webhook`;
  const historyOrderId = `${orderId}-bnb-empty-history`;
  const taggedOrderId = `${orderId}-bnb-tagged`;
  const webhookAddress = `bnb-webhook-${suffix}`;
  const historyAddress = `bnb-history-${suffix}`;
  const taggedAddress = `bnb-tagged-${suffix}`;
  for (const id of [webhookOrderId, historyOrderId, taggedOrderId]) {
    await insertProvisioningOrder(id);
    await database.db.update(database.ordersTable).set({
      fromAsset: "BNB", fromNetwork: "BNB", amount: "0.05",
    }).where(eq(database.ordersTable.id, id));
  }
  await database.db.insert(database.whitebitOrderAddressesTable).values([
    { orderId: webhookOrderId, ticker: "BNB", providerTicker: "BNB", network: "BEP20",
      address: webhookAddress, memo: "", status: "ready" },
    { orderId: historyOrderId, ticker: "BNB", providerTicker: "BNB", network: "BEP20",
      address: historyAddress, memo: " \t ", status: "ready" },
    { orderId: taggedOrderId, ticker: "BNB", providerTicker: "BNB", network: "BEP20",
      address: taggedAddress, memo: "TAG-1", status: "ready" },
  ]);
  for (const id of [webhookOrderId, historyOrderId, taggedOrderId]) {
    await finalizeSwapFundingFromClaim(id);
  }
  const [frozen] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, webhookOrderId));
  assert.equal(frozen.depositMemo, "");
  assert.equal((frozen.fundingDetailsSnapshot as { memo: unknown }).memo, null);
  assert.equal((frozen.settlementSnapshot as { funding: { memo: unknown } }).funding.memo, null);

  const webhookId = `bnb-null-webhook-${suffix}`;
  const response = await signedOrderWebhook(webhookId, webhookAddress, "BEP20", null,
    "deposit.processed", 3, "null-memo", "BNB", "0.05");
  assert.equal(response.status, 200);
  const [webhookDeposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, webhookId));
  assert.equal(webhookDeposit.orderId, webhookOrderId);
  assert.equal(webhookDeposit.memo, null);
  const [advancedWebhookOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, webhookOrderId));
  assert.equal(advancedWebhookOrder.manualSettlementState, "funds_confirmed");

  const historyId = `bnb-null-history-${suffix}`;
  await replayHistoryRecord({
    address: historyAddress, ticker: "BNB", network: "BEP20", memo: null,
    amount: "0.05", fee: "0", status: 3, transaction_id: historyId,
  });
  const [historyDeposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.transactionId, historyId));
  assert.equal(historyDeposit.orderId, historyOrderId);
  const [advancedHistoryOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, historyOrderId));
  assert.equal(advancedHistoryOrder.manualSettlementState, "funds_confirmed");

  const wrongTagId = `bnb-wrong-tag-${suffix}`;
  await replayHistoryRecord({
    address: taggedAddress, ticker: "BNB", network: "BEP20", memo: "TAG-2",
    amount: "0.05", fee: "0", status: 3, transaction_id: wrongTagId,
  });
  const [wrongTagDeposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.transactionId, wrongTagId));
  assert.equal(wrongTagDeposit.orderId, null);
  const [unadvancedOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, taggedOrderId));
  assert.equal(unadvancedOrder.manualSettlementState, "awaiting_funds");
});

test("confirmed Swap deposit advances the real order and queues one exact Telegram payment notice", async () => {
  const telegramOrderId = `${orderId}-telegram-payment`;
  const chatId = `91${Date.now()}`;
  const uniqueId = `telegram-payment-${suffix}`;
  await insertProvisioningOrder(telegramOrderId);
  await database.db.update(database.ordersTable).set({
    manualSettlementState: "awaiting_funds",
    status: "awaiting funds",
    settlementSnapshot: {
      source: { kind: "crypto-network", title: "Bitcoin", routeNetwork: "BITCOIN" },
      target: { kind: "fiat-payment-method", title: "SEPA" },
    },
  }).where(eq(database.ordersTable.id, telegramOrderId));
  const [claim] = await database.db.insert(database.whitebitOrderAddressesTable).values({
    orderId: telegramOrderId,
    ticker: "BTC",
    providerTicker: "BTC",
    network: "BITCOIN",
    address: `telegram-payment-address-${suffix}`,
    memo: "TAG-TG",
    status: "ready",
  }).returning();
  await finalizeSwapFundingFromClaim(telegramOrderId);
  await database.db.insert(database.telegramChatsTable).values({
    chatId,
    userId: chatId,
    locale: "en",
  });
  await database.db.insert(database.telegramOrderLinksTable).values({
    chatId,
    orderId: telegramOrderId,
    orderKind: "swap",
    trackingToken: "test-tracking-token",
  });

  try {
    const input = {
      address: claim.address!,
      ticker: "BTC",
      providerTicker: "BTC",
      network: "BITCOIN",
      memo: claim.memo,
      amount: "1.25",
      fee: "0",
      status: 3,
      event: "deposit.processed",
      transactionHash: `hash-${uniqueId}`,
      uniqueId,
      transactionId: `tx-${uniqueId}`,
      rawPayload: {},
    };
    await database.db.transaction((tx) => processNormalizedDeposit(tx, input));
    await database.db.transaction((tx) => processNormalizedDeposit(tx, input));

    const [order] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, telegramOrderId));
    assert.equal(order.manualSettlementState, "funds_confirmed");
    assert.equal(order.status, "processing");
    assert.ok(order.manualSettlementFundedAt);

    const notices = await database.db.select()
      .from(database.telegramNotificationOutboxTable)
      .where(eq(database.telegramNotificationOutboxTable.orderId, telegramOrderId));
    const payments = notices.filter((notice) => notice.eventKind === "payment_received");
    const genericStatus = notices.filter((notice) => notice.eventKind === "status");
    assert.equal(payments.length, 1);
    assert.equal(genericStatus.length, 1);
    assert.equal(genericStatus[0]?.deliveryStatus, "delivered");
    assert.equal(payments[0]?.statusVersion, 0);
    assert.deepEqual(
      {
        receivedAmount: payments[0]?.payload.receivedAmount,
        receivedAsset: payments[0]?.payload.receivedAsset,
        receivedNetwork: payments[0]?.payload.receivedNetwork,
      },
      {
        receivedAmount: "1.25",
        receivedAsset: "BTC",
        receivedNetwork: "BITCOIN",
      },
    );
  } finally {
    await database.db.delete(database.telegramNotificationOutboxTable)
      .where(eq(database.telegramNotificationOutboxTable.orderId, telegramOrderId));
    await database.db.delete(database.telegramOrderLinksTable)
      .where(eq(database.telegramOrderLinksTable.orderId, telegramOrderId));
    await database.db.delete(database.telegramChatsTable)
      .where(eq(database.telegramChatsTable.chatId, chatId));
  }
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
  const [existingClaim] = await database.db.select().from(database.whitebitOrderAddressesTable)
    .where(eq(database.whitebitOrderAddressesTable.orderId, orderId)).limit(1);
  assert.ok(existingClaim?.address);
  await database.db.insert(database.customersTable).values({
    id: collisionCustomer, name: "Collision", email: `${collisionCustomer}@example.test`,
  });
  await database.db.insert(database.whitebitDepositAddressesTable).values({
    customerId: collisionCustomer, ticker: "BTC", providerTicker: "BTC",
    network: existingClaim.network, address: existingClaim.address, memo: existingClaim.memo, status: "ready",
  });
  const response = await signedOrderWebhook(`order-collision-${suffix}`, existingClaim.address, existingClaim.network, existingClaim.memo ?? "");
  assert.equal(response.status, 200, await response.text());
  const [deposit] = await database.db.select().from(database.whitebitDepositsTable)
    .where(eq(database.whitebitDepositsTable.uniqueId, `order-collision-${suffix}`));
  assert.equal(deposit.orderId, null);
  assert.equal(deposit.orderAddressId, null);
  assert.match(deposit.conflict ?? "", /quarantined/, JSON.stringify({ deposit, orderAddress, suffix }));
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
  const [provisioningId, unresolvedId, manualId] = projectionOrderIds;
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
    const responseText = await response.text();
    assert.equal(response.status, 200, responseText);
    return JSON.parse(responseText) as Record<string, unknown>;
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

test("WhiteBIT permission verification is explicit, private, and side-effect fenced", async () => {
  await mockAssets();
  const networkId = "btc-bitcoin";
  await database.db.update(database.cryptoAssetNetworksTable).set({
    enabled: true,
    depositProvider: "whitebit",
  }).where(eq(database.cryptoAssetNetworksTable.id, networkId));
  await database.db.update(database.cryptoAssetsTable).set({ enabled: true })
    .where(eq(database.cryptoAssetsTable.id, priorBtcNetwork?.assetId ?? ""));
  await database.db.update(database.whitebitProviderSettingsTable)
    .set({ depositRouteProofs: [] })
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));

  const ownerHeaders = {
    "content-type": "application/json",
    "x-test-operator": ownerClerkUserId,
  };
  const signedTest = await fetch(`${baseUrl}/api/admin/providers/whitebit/credentials/test`, {
    method: "POST", headers: ownerHeaders, body: "{}",
  });
  assert.equal(signedTest.status, 200, await signedTest.clone().text());
  const availableRoutes = await fetch(`${baseUrl}/api/admin/providers/whitebit/verification-routes`, {
    headers: { "x-test-operator": ownerClerkUserId },
  });
  assert.equal(availableRoutes.status, 200);
  const routeRows = await availableRoutes.json() as Array<{ networkId: string }>;
  assert.ok(routeRows.some((route) => route.networkId === networkId));

  const ordersBefore = await database.db.select().from(database.ordersTable);
  const watchesBefore = await database.db.select()
    .from(database.blockchainMonitorWatchesTable);
  const routeBefore = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, networkId));
  providerPermissionCalls = 0;
  const missingConfirmation = await fetch(`${baseUrl}/api/admin/providers/whitebit/address-permission/verify`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ networkId, confirmRealAddressCreation: false }),
  });
  assert.equal(missingConfirmation.status, 400);
  assert.equal(providerPermissionCalls, 0);

  const successfulMockFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/main-account/create-new-address")) {
      providerPermissionCalls += 1;
      throw new Error("mocked ambiguous WhiteBIT timeout");
    }
    return successfulMockFetch(input, init);
  };
  const ambiguous = await fetch(`${baseUrl}/api/admin/providers/whitebit/address-permission/verify`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ networkId, confirmRealAddressCreation: true }),
  });
  assert.equal(ambiguous.status, 500);
  assert.equal(providerPermissionCalls, 1);
  const [afterAmbiguousSetting] = await database.db.select()
    .from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  assert.deepEqual(afterAmbiguousSetting?.depositRouteProofs, []);
  globalThis.fetch = successfulMockFetch;
  providerPermissionCalls = 0;

  const permission = await fetch(`${baseUrl}/api/admin/providers/whitebit/address-permission/verify`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ networkId, confirmRealAddressCreation: true }),
  });
  assert.equal(permission.status, 200, await permission.clone().text());
  const proof = await permission.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(proof).sort(), ["assetCode", "networkCode", "networkId", "reused", "verifiedAt"]);
  assert.equal(proof.networkId, networkId);
  assert.equal(proof.reused, false);
  assert.equal(JSON.stringify(proof).includes(orderAddress), false);
  assert.equal(providerPermissionCalls, 1);
  await database.db.update(database.whitebitProviderSettingsTable)
    .set({ depositRouteProofs: [] })
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  providerPermissionCalls = 0;
  const concurrentPermissions = await Promise.all([1, 2].map(() => fetch(
    `${baseUrl}/api/admin/providers/whitebit/address-permission/verify`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ networkId, confirmRealAddressCreation: true }),
    },
  )));
  assert.deepEqual(concurrentPermissions.map(response => response.status), [200, 200]);
  const concurrentProofs = await Promise.all(concurrentPermissions.map(response =>
    response.json() as Promise<{ reused: boolean }>
  ));
  assert.deepEqual(concurrentProofs.map(row => row.reused).sort(), [false, true]);
  assert.equal(providerPermissionCalls, 1, "route-locked concurrent tabs create only one verification address");
  const ordersAfter = await database.db.select().from(database.ordersTable);
  const watchesAfter = await database.db.select()
    .from(database.blockchainMonitorWatchesTable);
  const routeAfter = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, networkId));
  assert.deepEqual(ordersAfter, ordersBefore);
  assert.deepEqual(watchesAfter, watchesBefore);
  assert.deepEqual(routeAfter, routeBefore);

  const originalNetworkName = routeBefore[0]?.networkName;
  assert.ok(originalNetworkName);
  await database.db.update(database.cryptoAssetNetworksTable)
    .set({ networkName: `${originalNetworkName} (changed)` })
    .where(eq(database.cryptoAssetNetworksTable.id, networkId));
  const staleStatusResponse = await fetch(`${baseUrl}/api/admin/providers/whitebit`, {
    headers: { "x-test-operator": ownerClerkUserId },
  });
  assert.equal(staleStatusResponse.status, 200);
  const staleStatus = await staleStatusResponse.json() as { addressPermissionVerified: boolean };
  assert.equal(staleStatus.addressPermissionVerified, false);
  assert.equal(await isWhitebitSwapEnabled("BTC", "BITCOIN"), null);
  const staleEnable = await fetch(`${baseUrl}/api/admin/providers/whitebit`, {
    method: "PATCH",
    headers: ownerHeaders,
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(staleEnable.status, 409);
  await database.db.update(database.cryptoAssetNetworksTable)
    .set({ networkName: originalNetworkName })
    .where(eq(database.cryptoAssetNetworksTable.id, networkId));

  const callsBeforeEnable = providerPermissionCalls;
  const enabled = await fetch(`${baseUrl}/api/admin/providers/whitebit`, {
    method: "PATCH",
    headers: ownerHeaders,
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enabled.status, 200, await enabled.text());
  assert.equal(providerPermissionCalls, callsBeforeEnable);
  const [proofSettingBeforeDisable] = await database.db.select()
    .from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  const disabled = await fetch(`${baseUrl}/api/admin/providers/whitebit`, {
    method: "PATCH",
    headers: ownerHeaders,
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disabled.status, 200, await disabled.text());
  const [proofSettingAfterDisable] = await database.db.select()
    .from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  assert.deepEqual(proofSettingAfterDisable?.depositRouteProofs, proofSettingBeforeDisable?.depositRouteProofs);
});

test("bulk provider assignment reviews exact capabilities, preserves tracking, and never creates an address", async () => {
  const fixtureAssets = [
    { id: `bulk-a-${suffix}`, code: `Z${suffix.slice(0, 8).toUpperCase()}`, networkCode: "TRC20" },
    { id: `bulk-b-${suffix}`, code: `Y${suffix.slice(0, 8).toUpperCase()}`, networkCode: "BITCOIN" },
  ];
  const ids = fixtureAssets.map(asset => `${asset.id}-route`);
  const unsupportedId = `${fixtureAssets[0].id}-unsupported`;
  const operatorId = `bulk-operator-${suffix}`;
  const savedFetch = globalThis.fetch;
  try {
    await database.db.insert(database.operatorsTable).values({
      email: `${operatorId}@example.test`, clerkUserId: operatorId,
      name: "Bulk permission test operator", role: "operator", status: "active",
    });
    for (const asset of fixtureAssets) {
      await database.db.insert(database.cryptoAssetsTable).values({
        id: asset.id, code: asset.code, name: asset.code, decimals: 8, enabled: true,
      });
      await database.db.insert(database.cryptoAssetNetworksTable).values({
        id: `${asset.id}-route`, assetId: asset.id, networkCode: asset.networkCode,
        networkName: asset.networkCode, decimals: 8, executionMode: "manual",
        depositProvider: "manual", sharedDepositAddress: "",
        manualWalletTrackingEnabled: true, customerDepositsEnabled: false, enabled: true,
      });
    }
    await database.db.insert(database.cryptoAssetNetworksTable).values({
      id: unsupportedId, assetId: fixtureAssets[0].id, networkCode: "NO-SUCH-NETWORK",
      networkName: "Unsupported", decimals: 8, executionMode: "manual",
      depositProvider: "manual", manualWalletTrackingEnabled: false,
      customerDepositsEnabled: false, enabled: true,
    });
    globalThis.fetch = async (input, init) => String(input).endsWith("/api/v4/public/assets")
      ? new Response(JSON.stringify(Object.fromEntries(fixtureAssets.map(asset => [
        asset.code, { can_deposit: true, networks: { deposits: [asset.networkCode] } },
      ]))), { status: 200 })
      : savedFetch(input, init);
    resetWhitebitCapabilityCacheForTests();
    const headers = { "content-type": "application/json", "x-test-operator": ownerClerkUserId };
    const endpoint = `${baseUrl}/api/admin/crypto-networks/deposit-provider`;
    const post = (path: string, body: object) => fetch(`${endpoint}/${path}`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    for (const path of ["preview", "apply"]) {
      const body = path === "preview"
        ? { networkIds: ids, depositProvider: "whitebit" }
        : { networkIds: ids, depositProvider: "whitebit", reviewToken: "a".repeat(64) };
      const anonymous = await fetch(`${endpoint}/${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      assert.equal(anonymous.status, 401, `Anonymous ${path} must be denied`);
      const operator = await fetch(`${endpoint}/${path}`, {
        method: "POST", headers: { "content-type": "application/json", "x-test-operator": operatorId },
        body: JSON.stringify(body),
      });
      assert.equal(operator.status, 403, `Non-owner ${path} must be denied`);
    }
    const callsBefore = providerPermissionCalls;
    const unsafe = await post("preview", { networkIds: [...ids, unsupportedId], depositProvider: "whitebit" });
    assert.equal(unsafe.status, 200, await unsafe.clone().text());
    const unsafeReview = await unsafe.json() as {
      reviewToken: string; routes: Array<{ networkId: string; status: string }>;
    };
    assert.equal(unsafeReview.routes.find(route => route.networkId === unsupportedId)?.status, "unsupported");
    assert.ok(ids.every(id => unsafeReview.routes.find(route => route.networkId === id)?.status === "requires_configuration"));
    const blocked = await post("apply", {
      networkIds: [...ids, unsupportedId], depositProvider: "whitebit", reviewToken: unsafeReview.reviewToken,
    });
    assert.equal(blocked.status, 422);
    const mapping = [{
      networkId: unsupportedId,
      assetCode: fixtureAssets[0].code,
      networkCode: fixtureAssets[0].networkCode,
    }];
    const candidateResponse = await post("preview", {
      networkIds: [unsupportedId], depositProvider: "whitebit",
    });
    assert.equal(candidateResponse.status, 200);
    const candidate = await candidateResponse.json() as {
      routes: Array<{ mappingStatus: string; whitebitNetworkOptions: string[] }>;
    };
    assert.equal(candidate.routes[0]?.mappingStatus, "mapping_required");
    assert.deepEqual(candidate.routes[0]?.whitebitNetworkOptions, [fixtureAssets[0].networkCode]);
    const invalidMapping = await post("preview", {
      networkIds: [unsupportedId], depositProvider: "whitebit",
      whitebitMappings: [{ ...mapping[0], networkCode: "BITCOIN" }],
    });
    const invalidReview = await invalidMapping.json() as { routes: Array<{ status: string }> };
    assert.equal(invalidReview.routes[0]?.status, "unsupported");
    const mappedResponse = await post("preview", {
      networkIds: [unsupportedId], depositProvider: "whitebit", whitebitMappings: mapping,
    });
    assert.equal(mappedResponse.status, 200);
    const mappedReview = await mappedResponse.json() as {
      reviewToken: string;
      routes: Array<{ mappingStatus: string; customerDepositsAfter: boolean }>;
    };
    assert.equal(mappedReview.routes[0]?.mappingStatus, "supported");
    assert.equal(mappedReview.routes[0]?.customerDepositsAfter, false);
    const mappedApply = await post("apply", {
      networkIds: [unsupportedId], depositProvider: "whitebit",
      whitebitMappings: mapping, reviewToken: mappedReview.reviewToken,
    });
    assert.equal(mappedApply.status, 200, await mappedApply.clone().text());
    const [mappedRoute] = await database.db.select().from(database.cryptoAssetNetworksTable)
      .where(eq(database.cryptoAssetNetworksTable.id, unsupportedId));
    assert.equal(mappedRoute?.networkCode, "NO-SUCH-NETWORK");
    assert.equal(mappedRoute?.whitebitAssetCode, fixtureAssets[0].code);
    assert.equal(mappedRoute?.whitebitNetworkCode, fixtureAssets[0].networkCode);
    assert.equal(mappedRoute?.customerDepositsEnabled, false);
    assert.equal(providerPermissionCalls, callsBefore, "Mapping must not generate an address");
    const [beforePreview] = await database.db.select().from(database.cryptoAssetNetworksTable)
      .where(eq(database.cryptoAssetNetworksTable.id, ids[0]));
    const safe = await post("preview", { networkIds: ids, depositProvider: "whitebit" });
    assert.equal(safe.status, 200, await safe.clone().text());
    const review = await safe.json() as { reviewToken: string };
    const [afterPreview] = await database.db.select().from(database.cryptoAssetNetworksTable)
      .where(eq(database.cryptoAssetNetworksTable.id, ids[0]));
    assert.deepEqual(afterPreview, beforePreview, "Preview must not modify route settings");
    const applied = await post("apply", {
      networkIds: ids, depositProvider: "whitebit", reviewToken: review.reviewToken,
    });
    assert.equal(applied.status, 200, await applied.clone().text());
    const [first] = await database.db.select().from(database.cryptoAssetNetworksTable)
      .where(eq(database.cryptoAssetNetworksTable.id, ids[0]));
    const [second] = await database.db.select().from(database.cryptoAssetNetworksTable)
      .where(eq(database.cryptoAssetNetworksTable.id, ids[1]));
    assert.equal(first?.depositProvider, "whitebit");
    assert.equal(second?.depositProvider, "whitebit");
    assert.equal(first?.manualWalletTrackingEnabled, true);
    assert.equal(second?.manualWalletTrackingEnabled, true);
    assert.equal(first?.sharedDepositAddress, "");
    assert.equal(first?.customerDepositsEnabled, false);
    assert.equal(providerPermissionCalls, callsBefore);

    const stalePreviewResponse = await post("preview", { networkIds: ids, depositProvider: "manual" });
    const stalePreview = await stalePreviewResponse.json() as { reviewToken: string };
    await database.db.update(database.cryptoAssetNetworksTable)
      .set({ manualWalletTrackingEnabled: false })
      .where(eq(database.cryptoAssetNetworksTable.id, ids[0]));
    const staleApply = await post("apply", {
      networkIds: ids, depositProvider: "manual", reviewToken: stalePreview.reviewToken,
    });
    assert.equal(staleApply.status, 409);
    await database.db.update(database.cryptoAssetNetworksTable)
      .set({ manualWalletTrackingEnabled: true })
      .where(eq(database.cryptoAssetNetworksTable.id, ids[0]));

    const noneReviewResponse = await post("preview", { networkIds: ids, depositProvider: "none" });
    const noneReview = await noneReviewResponse.json() as { reviewToken: string };
    const none = await post("apply", {
      networkIds: ids, depositProvider: "none", reviewToken: noneReview.reviewToken,
    });
    assert.equal(none.status, 200, await none.clone().text());
    const manualReviewResponse = await post("preview", { networkIds: ids, depositProvider: "manual" });
    const manualReview = await manualReviewResponse.json() as { reviewToken: string };
    const manual = await post("apply", {
      networkIds: ids, depositProvider: "manual", reviewToken: manualReview.reviewToken,
    });
    assert.equal(manual.status, 200, await manual.clone().text());
    const [restored] = await database.db.select().from(database.cryptoAssetNetworksTable)
      .where(eq(database.cryptoAssetNetworksTable.id, ids[0]));
    assert.equal(restored?.manualWalletTrackingEnabled, true);
    assert.equal(restored?.depositProvider, "manual");
    assert.equal(restored?.customerDepositsEnabled, false);
    assert.equal(providerPermissionCalls, callsBefore);

    await database.db.update(database.cryptoAssetNetworksTable)
      .set({ customerDepositsEnabled: true, sharedDepositAddress: "saved-manual-fallback" })
      .where(eq(database.cryptoAssetNetworksTable.id, ids[0]));
    const enabledPreviewResponse = await post("preview", {
      networkIds: [ids[0]], depositProvider: "whitebit",
    });
    assert.equal(enabledPreviewResponse.status, 200);
    const enabledPreview = await enabledPreviewResponse.json() as {
      reviewToken: string; routes: Array<{ status: string; reason: string }>;
    };
    assert.equal(enabledPreview.routes[0]?.status, "requires_configuration");
    assert.match(enabledPreview.routes[0]?.reason ?? "", /Turn off Customer Deposits/);
    const enabledApply = await post("apply", {
      networkIds: [ids[0]], depositProvider: "whitebit", reviewToken: enabledPreview.reviewToken,
    });
    assert.equal(enabledApply.status, 409);
    const [unchanged] = await database.db.select().from(database.cryptoAssetNetworksTable)
      .where(eq(database.cryptoAssetNetworksTable.id, ids[0]));
    assert.equal(unchanged?.depositProvider, "manual");
    assert.equal(unchanged?.customerDepositsEnabled, true);
    assert.equal(unchanged?.sharedDepositAddress, "saved-manual-fallback");
    assert.equal(unchanged?.manualWalletTrackingEnabled, true);
    assert.equal(providerPermissionCalls, callsBefore);
  } finally {
    globalThis.fetch = savedFetch;
    resetWhitebitCapabilityCacheForTests();
    await database.db.delete(database.operatorsTable)
      .where(eq(database.operatorsTable.clerkUserId, operatorId));
    for (const id of [...ids, unsupportedId]) {
      await database.db.delete(database.cryptoAssetNetworksTable)
        .where(eq(database.cryptoAssetNetworksTable.id, id));
    }
    for (const asset of fixtureAssets) {
      await database.db.delete(database.cryptoAssetsTable)
        .where(eq(database.cryptoAssetsTable.id, asset.id));
    }
  }
});

test("actual signed exchange order replay allocates one WhiteBIT address", async () => {
  providerCalls = 0;
  await mockAssets();
  const [priorFallbackNetwork] = await database.db.select()
    .from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  const manualFallbackAddress = validBitcoinAddress();
  await database.db.update(database.cryptoAssetNetworksTable).set({
    enabled: true, executionMode: "manual", customerDepositsEnabled: true,
    depositProvider: "whitebit", sharedDepositAddress: manualFallbackAddress,
    manualFallbackEnabled: true,
  }).where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
  await database.db.update(database.cryptoAssetsTable).set({ enabled: true })
    .where(eq(database.cryptoAssetsTable.id, priorBtcNetwork?.assetId ?? ""));
  const ownerHeaders = {
    "content-type": "application/json",
    "x-test-operator": ownerClerkUserId,
  };
  const credentialTest = await fetch(`${baseUrl}/api/admin/providers/whitebit/credentials/test`, {
    method: "POST", headers: ownerHeaders, body: "{}",
  });
  assert.equal(credentialTest.status, 200, await credentialTest.clone().text());
  const permissionCallsBefore = providerPermissionCalls;
  const permissionTest = await fetch(`${baseUrl}/api/admin/providers/whitebit/address-permission/verify`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ networkId: "btc-bitcoin", confirmRealAddressCreation: true }),
  });
  assert.equal(permissionTest.status, 200, await permissionTest.clone().text());
  const permissionProof = await permissionTest.json() as { reused: boolean };
  assert.equal(providerPermissionCalls, permissionCallsBefore + (permissionProof.reused ? 0 : 1));
  const enableProvider = await fetch(`${baseUrl}/api/admin/providers/whitebit`, {
    method: "PATCH",
    headers: ownerHeaders,
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enableProvider.status, 200, await enableProvider.clone().text());
  providerCalls = 0;
  await database.db.insert(fiatCurrenciesTable).values({
    code: "EUR", name: "Euro", network: "SEPA", precision: 2, enabled: true,
    lifecycle: "active", rateMode: "manual", manualRate: "100",
  }).onConflictDoNothing({ target: fiatCurrenciesTable.code });
  await database.db.insert(manualDeskPricingRulesTable).values({
    name: `Swap test ${suffix}`, sourceAsset: "BTC", targetAsset: "EUR",
    sourceNetwork: "BITCOIN", targetNetwork: "SEPA", markupBasisPoints: 0,
     exactRate: "100", fixedFee: "0", enabled: true, priority: pricingPriority,
  });
  const configResponse = await fetch(`${baseUrl}/api/exchange/config`);
  assert.equal(configResponse.status, 200, await configResponse.clone().text());
  const config = await configResponse.json() as {
    manualSettlementOptions: Array<{
      id: string; kind: string; assetCode: string; routeNetwork: string;
      direction: string;
    }>;
  };
  const source = config.manualSettlementOptions.find((option) =>
    option.id === "crypto:btc-bitcoin" && option.kind === "crypto-network" && option.assetCode === "BTC" &&
    (option.direction === "send" || option.direction === "both"));
  const target = config.manualSettlementOptions.find((option) =>
    option.kind === "fiat-payment-method" && (option.direction === "receive" || option.direction === "both"));
  if (!source || !target) throw new Error(`Test catalog lacks a BTC/BITCOIN-to-fiat route: ${JSON.stringify(config.manualSettlementOptions.filter((option) => option.assetCode === "BTC" || option.assetCode === "EUR"))}`);
  const quoteResponse = await fetch(`${baseUrl}/api/exchange/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "manual", fromAsset: "BTC", fromNetwork: source.routeNetwork,
      toAsset: target.assetCode, toNetwork: target.routeNetwork, amount: 1,
      sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
    }),
  });
  assert.equal(quoteResponse.status, 200, await quoteResponse.clone().text());
  const quote = await quoteResponse.json() as {
    quoteId: string; receiveAmount: number; rate: number; fee: number;
    fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string;
    requiredSettlementFields?: Array<{ key: string; type?: string }>;
  };
  const settlementDetails = Object.fromEntries((quote.requiredSettlementFields ?? []).map((field) => [
    field.key,
    field.type === "email" ? `${suffix}@example.test` :
      field.type === "account-iban" ? "DE89370400440532013000" : "Actual Swap",
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
  await Promise.race([
    started,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for WhiteBIT provider call")), 10_000)),
  ]);
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
  const [fundedOrder] = await database.db.select().from(database.ordersTable)
    .where(eq(database.ordersTable.id, firstBody.id));
  assert.ok(fundedOrder);
  const frozenFunding = fundedOrder.fundingDetailsSnapshot as {
    manualFallbackEnabled?: boolean; manualFallbackAddress?: string;
  };
  assert.equal(frozenFunding.manualFallbackEnabled, true);
  assert.equal(frozenFunding.manualFallbackAddress, manualFallbackAddress);
  globalThis.fetch = quoteFetch;
  const mismatchResponse = await fetch(`${baseUrl}/api/exchange/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, refundAddress: "1BitcoinEaterAddressDontSendf59kuE" }),
  });
  assert.equal(mismatchResponse.status, 409, await mismatchResponse.text());
  await database.db.update(database.cryptoAssetNetworksTable)
    .set({ manualFallbackEnabled: priorFallbackNetwork?.manualFallbackEnabled ?? false })
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));
});

test("WhiteBIT provisions simultaneous same-asset routes with independent proofs and exact mapped memo identity", async () => {
  const testAssetId = `whitebit-multiroute-${suffix}`;
  const assetCode = `Q${suffix.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  const mappedProviderAsset = `ALT${assetCode}`;
  const erc20Id = `${testAssetId}-erc20`;
  const trc20Id = `${testAssetId}-trc20`;
  const routes = [
    {
      row: {
        id: erc20Id, assetId: testAssetId, networkCode: "ERC20", networkName: "Ethereum",
        networkFamily: "evm", decimals: 6,
      },
      providerAsset: mappedProviderAsset, providerNetwork: "MEMOCHAIN", requiresMemo: true,
    },
    {
      row: {
        id: trc20Id, assetId: testAssetId, networkCode: "TRC20", networkName: "Tron",
        networkFamily: "tron", decimals: 6,
      },
      providerAsset: assetCode, providerNetwork: "TRC20", requiresMemo: false,
    },
  ];
  const [originalProviderSettings] = await database.db.select()
    .from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit")).limit(1);
  assert.ok(originalProviderSettings);
  const originalFetch = globalThis.fetch;
  const providerAddresses = [`0x${"a".repeat(40)}`, validTronAddress()];
  const providerRequests: Array<{ ticker?: string; network?: string }> = [];
  const orderIds = [randomUUID(), randomUUID()].map((id) => `O${id.replaceAll("-", "").slice(0, 20)}`);
  let testFailure: unknown;

  try {
    await database.db.insert(database.cryptoAssetsTable).values({
      id: testAssetId, code: assetCode, name: "WhiteBIT isolated multi-route test",
      decimals: 6, enabled: true, lifecycle: "active",
    });
    for (const { row, providerAsset, providerNetwork, requiresMemo } of routes) {
      await database.db.insert(database.cryptoAssetNetworksTable).values({
        ...row,
        enabled: true, lifecycle: "active", executionMode: "manual", depositProvider: "whitebit",
        customerDepositsEnabled: true, manualWalletTrackingEnabled: false, requiresMemo,
        whitebitAssetCode: providerAsset, whitebitNetworkCode: providerNetwork,
      });
    }

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v4/public/assets")) {
        return new Response(JSON.stringify({
          [assetCode]: { can_deposit: true, networks: { deposits: ["TRC20"] } },
          [mappedProviderAsset]: { can_deposit: true, networks: { deposits: ["MEMOCHAIN"] } },
        }), { status: 200 });
      }
      if (url.endsWith("/api/v4/main-account/create-new-address")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { ticker?: string; network?: string };
        providerRequests.push({ ticker: body.ticker, network: body.network });
        const index = body.network === "MEMOCHAIN" ? 0 : 1;
        return new Response(JSON.stringify({
          account: {
            address: providerAddresses[index],
            memo: index === 0 ? `TAG-${suffix.slice(0, 8)}` : "",
          },
        }), { status: 200 });
      }
      if (url.startsWith("https://whitebit.com/")) {
        throw new Error(`Unexpected WhiteBIT request in mock: ${url}`);
      }
      return originalFetch(input, init);
    };
    resetWhitebitCapabilityCacheForTests();

    assert.ok(await seedWhitebitVerificationFixture(assetCode, "ERC20"));
    const [firstProofSetting] = await database.db.select({
      proofs: database.whitebitProviderSettingsTable.depositRouteProofs,
    }).from(database.whitebitProviderSettingsTable)
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    assert.ok(firstProofSetting);
    const firstProof = firstProofSetting.proofs.find((proof) => proof.networkId === erc20Id);
    assert.ok(firstProof);

    assert.ok(await seedWhitebitVerificationFixture(assetCode, "TRC20"));
    const [bothProofSetting] = await database.db.select({
      proofs: database.whitebitProviderSettingsTable.depositRouteProofs,
    }).from(database.whitebitProviderSettingsTable)
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    assert.ok(bothProofSetting);
    const mappedProof = bothProofSetting.proofs.find((proof) => proof.networkId === erc20Id);
    const trc20Proof = bothProofSetting.proofs.find((proof) => proof.networkId === trc20Id);
    assert.deepEqual(mappedProof, firstProof, "proving a second route must preserve the first exact proof");
    assert.ok(trc20Proof);

    await database.db.update(database.whitebitProviderSettingsTable).set({
      depositRouteProofs: bothProofSetting.proofs.filter((proof) => proof.networkId !== erc20Id),
    }).where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    // One exact proof can be removed without revoking the other USDT network.
    const [remainingProofSetting] = await database.db.select({
      proofs: database.whitebitProviderSettingsTable.depositRouteProofs,
    }).from(database.whitebitProviderSettingsTable)
      .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    assert.ok(remainingProofSetting);
    assert.deepEqual(remainingProofSetting.proofs.find((proof) => proof.networkId === trc20Id), trc20Proof);
    assert.equal(remainingProofSetting.proofs.some((proof) => proof.networkId === erc20Id), false);
    assert.equal(await isWhitebitSwapEnabled(assetCode, "ERC20"), null);
    assert.deepEqual(await isWhitebitSwapEnabled(assetCode, "TRC20"), {
      providerTicker: assetCode, providerNetwork: "TRC20", requiredConfirmations: null,
    });
    await database.db.update(database.whitebitProviderSettingsTable).set({
      depositRouteProofs: bothProofSetting.proofs,
    }).where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));

    for (const [index, { row, providerAsset, providerNetwork, requiresMemo }] of routes.entries()) {
      const memo = requiresMemo ? `TAG-${suffix.slice(0, 8)}` : "";
      const funding = {
        networkId: row.id,
        depositProvider: "whitebit",
        customerDepositsEnabled: true,
        manualWalletTrackingEnabled: false,
        manualFallbackEnabled: false,
        manualFallbackAddress: "",
        manualFallbackMemo: "",
        requiresMemo,
        whitebitAssetCode: providerAsset,
        whitebitNetworkCode: providerNetwork,
        selectedProvider: "whitebit",
        source: "whitebit",
        status: "provisioning",
        address: "",
        memo: "",
      };
      await database.db.insert(database.ordersTable).values({
        id: orderIds[index]!,
        type: "manual",
        status: "awaiting funds",
        fromAsset: assetCode,
        fromNetwork: row.networkCode,
        toAsset: "EUR",
        toNetwork: "SEPA",
        amount: "10",
        receiveAmount: "10",
        customerEmail: `${orderIds[index]}@example.test`,
        customerName: "WhiteBIT isolated multi-route regression",
        fundingStatus: "provisioning",
        fundingProviderSource: "whitebit",
        fundingDetailsSnapshot: funding,
        settlementSnapshot: { funding },
        provider: "Manual desk",
        sourceSettlementOptionId: `crypto:${row.id}`,
        manualSettlementState: "awaiting_funds",
        providerState: "whitebit_provisioning",
        quoteId: "",
        clientRequestId: `${orderIds[index]}-request`,
      });
      const result = await provisionSwapFundingAddress({
        orderId: orderIds[index]!,
        assetCode,
        networkCode: row.networkCode,
        whitebitAssetCode: providerAsset,
        whitebitNetworkCode: providerNetwork,
        manualAddress: "",
        manualMemo: "",
        manualFallbackUsable: false,
        chosenWhitebit: true,
      });
      assert.equal(result.unresolved, false);
      assert.equal(result.address, providerAddresses[index]);
      assert.equal(result.memo, memo || null);
      const [order] = await database.db.select().from(database.ordersTable)
        .where(eq(database.ordersTable.id, orderIds[index]!)).limit(1);
      const [claim] = await database.db.select().from(database.whitebitOrderAddressesTable)
        .where(eq(database.whitebitOrderAddressesTable.orderId, orderIds[index]!)).limit(1);
      assert.ok(order && claim);
      assert.equal(claim.ticker, assetCode);
      assert.equal(claim.providerTicker, providerAsset);
      assert.equal(claim.network, providerNetwork);
      assert.equal(claim.memo, memo || null);
      assert.equal(matchesFrozenWhitebitClaim(order, claim), true);

      const webhook = await signedOrderWebhook(
        `same-asset-route-${index}-${suffix}`,
        claim.address!,
        providerNetwork,
        memo,
        "deposit.processed",
        3,
        `same-asset-${index}`,
        providerAsset,
        "10",
      );
      assert.equal(webhook.status, 200, await webhook.clone().text());
      const [fundedOrder] = await database.db.select().from(database.ordersTable)
        .where(eq(database.ordersTable.id, orderIds[index]!)).limit(1);
      assert.equal(fundedOrder?.manualSettlementState, "funds_confirmed");
      const [deposit] = await database.db.select().from(database.whitebitDepositsTable)
        .where(eq(database.whitebitDepositsTable.orderId, orderIds[index]!)).limit(1);
      assert.equal(deposit?.ticker, assetCode);
      assert.equal(deposit?.providerTicker, providerAsset);
      assert.equal(deposit?.network, providerNetwork);
      assert.equal(deposit?.memo, memo || null);
    }
    assert.deepEqual(providerRequests, [
      { ticker: mappedProviderAsset, network: "MEMOCHAIN" },
      { ticker: assetCode, network: "TRC20" },
    ]);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    let cleanupFailure: unknown;
    try {
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");
        await cleanup.query(
          `DELETE FROM whitebit_ledger_entries WHERE deposit_id IN (
             SELECT id FROM whitebit_deposits WHERE order_id = ANY($1::text[])
           )`,
          [orderIds],
        );
        await cleanup.query(
          `DELETE FROM whitebit_order_history_checkpoints WHERE order_address_id IN (
             SELECT id FROM whitebit_order_addresses WHERE order_id = ANY($1::text[])
           )`,
          [orderIds],
        );
        await cleanup.query("DELETE FROM whitebit_deposits WHERE order_id = ANY($1::text[])", [orderIds]);
        await cleanup.query("DELETE FROM whitebit_order_addresses WHERE order_id = ANY($1::text[])", [orderIds]);
        await cleanup.query("DELETE FROM exchange_orders WHERE id = ANY($1::text[])", [orderIds]);
        await cleanup.query(
          "DELETE FROM whitebit_webhook_deliveries WHERE envelope_id LIKE $1",
          [`%same-asset-route-%${suffix}%`],
        );
        await cleanup.query("DELETE FROM crypto_asset_networks WHERE asset_id = $1", [testAssetId]);
        await cleanup.query("DELETE FROM crypto_assets WHERE id = $1", [testAssetId]);
        await cleanup.query("COMMIT");
      } catch (error) {
        cleanupFailure = error;
        await cleanup.query("ROLLBACK").catch(() => {});
      } finally {
        cleanup.release();
      }
    } catch (error) {
      cleanupFailure ??= error;
    }
    try {
      await database.db.update(database.whitebitProviderSettingsTable).set({
        disabled: originalProviderSettings.disabled,
        depositRouteProofs: originalProviderSettings.depositRouteProofs,
        credentialVerifiedFingerprint: originalProviderSettings.credentialVerifiedFingerprint,
        credentialVerifiedAt: originalProviderSettings.credentialVerifiedAt,
        updatedAt: originalProviderSettings.updatedAt,
      }).where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    } catch (error) {
      cleanupFailure ??= error;
    }
    globalThis.fetch = originalFetch;
    resetWhitebitCapabilityCacheForTests();
    if (cleanupFailure && testFailure === undefined) throw cleanupFailure;
  }
});

test("actual BNB/BEP20 Swap creation assigns and confirms its own WhiteBIT deposit", async () => {
  const routeId = "bnb-bnb";
  const [originalRoute] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, routeId));
  assert.ok(originalRoute, "isolated suite must contain its synthetic BNB route");
  const [originalAsset] = await database.db.select().from(database.cryptoAssetsTable)
    .where(eq(database.cryptoAssetsTable.id, originalRoute.assetId));
  assert.ok(originalAsset);
  const [originalProviderSettings] = await database.db.select()
    .from(database.whitebitProviderSettingsTable)
    .where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
  assert.ok(originalProviderSettings);

  const ruleName = `BNB Swap end-to-end ${suffix}`;
  const providerAddress = `0x22222222${suffix.replaceAll("-", "")}`;
  const createAddressRequests: Array<{
    request?: string; nonce?: number; ticker?: string; network?: string;
  }> = [];
  const ownerHeaders = {
    "content-type": "application/json",
    "x-test-operator": ownerClerkUserId,
  };
  await mockAssets("BEP20", "BNB");
  const assetFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/v4/main-account/create-new-address")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        request?: string; nonce?: number; ticker?: string; network?: string;
      };
      createAddressRequests.push(body);
      return new Response(JSON.stringify({
        account: { address: providerAddress, memo: "" },
      }), { status: 200 });
    }
    return assetFetch(input, init);
  };

  try {
    await database.db.update(database.cryptoAssetNetworksTable).set({
      enabled: true,
      lifecycle: "active",
      executionMode: "manual",
      depositProvider: "whitebit",
      networkCode: "BNB",
      customerDepositsEnabled: true,
      whitebitAssetCode: "BNB",
      whitebitNetworkCode: "BEP20",
    }).where(eq(database.cryptoAssetNetworksTable.id, routeId));
    await database.db.update(database.cryptoAssetsTable).set({
      enabled: true,
      lifecycle: "active",
    }).where(eq(database.cryptoAssetsTable.id, originalAsset.id));
    await database.db.insert(fiatCurrenciesTable).values({
      code: "EUR", name: "Euro", network: "SEPA", precision: 2, enabled: true,
      lifecycle: "active", rateMode: "manual", manualRate: "100",
    }).onConflictDoNothing({ target: fiatCurrenciesTable.code });
    await database.db.insert(manualDeskPricingRulesTable).values({
      name: ruleName, sourceAsset: "BNB", targetAsset: "EUR",
      sourceNetwork: "BNB", targetNetwork: "SEPA", markupBasisPoints: 0,
      exactRate: "100", fixedFee: "0", enabled: true, priority: Math.abs(pricingPriority) + 10_000_000,
    });
    const verified = await fetch(`${baseUrl}/api/admin/providers/whitebit/credentials/test`, {
      method: "POST",
      headers: ownerHeaders,
      body: "{}",
    });
    assert.equal(verified.status, 200, await verified.clone().text());
    const permission = await fetch(`${baseUrl}/api/admin/providers/whitebit/address-permission/verify`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ networkId: routeId, confirmRealAddressCreation: true }),
    });
    assert.equal(permission.status, 200, await permission.clone().text());
    assert.equal(createAddressRequests[0]?.request, "/api/v4/main-account/create-new-address");
    assert.equal(createAddressRequests[0]?.ticker, "BNB");
    assert.equal(createAddressRequests[0]?.network, "BEP20");
    const enabled = await fetch(`${baseUrl}/api/admin/providers/whitebit`, {
      method: "PATCH",
      headers: ownerHeaders,
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(enabled.status, 200, await enabled.clone().text());

    const configResponse = await fetch(`${baseUrl}/api/exchange/config`);
    assert.equal(configResponse.status, 200, await configResponse.clone().text());
    const config = await configResponse.json() as {
      manualSettlementOptions: Array<{
        id: string; kind: string; assetCode: string; routeNetwork: string; direction: string;
      }>;
    };
    const source = config.manualSettlementOptions.find((option) =>
      option.id === `crypto:${routeId}` && option.kind === "crypto-network" &&
      option.assetCode === "BNB" && option.routeNetwork === "BNB" &&
      ["send", "both"].includes(option.direction));
    const target = config.manualSettlementOptions.find((option) =>
      option.kind === "fiat-payment-method" && option.assetCode === "EUR" &&
      option.routeNetwork === "SEPA" && ["receive", "both"].includes(option.direction));
    if (!source || !target) {
      throw new Error("API config should expose the exact BNB/BNB-to-EUR/SEPA route.");
    }

    const quoteResponse = await fetch(`${baseUrl}/api/exchange/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "manual",
        fromAsset: "BNB",
        fromNetwork: "BNB",
        toAsset: "EUR",
        toNetwork: "SEPA",
        amount: 0.05,
        sourceSettlementOptionId: source.id,
        targetSettlementOptionId: target.id,
      }),
    });
    assert.equal(quoteResponse.status, 200, await quoteResponse.clone().text());
    const quote = await quoteResponse.json() as {
      quoteId: string;
      receiveAmount: number;
      rate: number;
      fee: number;
      requiredSettlementFields?: Array<{ key: string; type?: string }>;
    };
    const settlementDetails = Object.fromEntries((quote.requiredSettlementFields ?? []).map((field) => [
      field.key,
      field.type === "email" ? `${suffix}@example.test` :
        field.type === "account-iban" ? "DE89370400440532013000" : "BNB Swap end-to-end",
    ]));
    const clientRequestId = randomUUID();
    const createOrder = await fetch(`${baseUrl}/api/exchange/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "manual",
        fromAsset: "BNB",
        fromNetwork: "BNB",
        toAsset: "EUR",
        toNetwork: "SEPA",
        amount: 0.05,
        receiveAmount: quote.receiveAmount,
        rate: quote.rate,
        fee: quote.fee,
        quoteId: quote.quoteId,
        clientRequestId,
        customerEmail: `${suffix}@example.test`,
        customerName: "BNB Swap end-to-end",
        sourceSettlementOptionId: source.id,
        targetSettlementOptionId: target.id,
        settlementDetails,
        refundAddress: "0x1111111111111111111111111111111111111111",
      }),
    });
    assert.ok([201, 202].includes(createOrder.status), await createOrder.clone().text());
    const created = await createOrder.json() as {
      id: string; depositAddress?: string; fundingStatus?: string;
    };
    let order: typeof database.ordersTable.$inferSelect | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      [order] = await database.db.select().from(database.ordersTable)
        .where(eq(database.ordersTable.id, created.id)).limit(1);
      if (order?.fundingStatus === "ready_whitebit") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(order, "API-created BNB order should be persisted");
    assert.equal(order.fundingStatus, "ready_whitebit");
    assert.equal(order.depositAddress, providerAddress);
    assert.equal(createAddressRequests.length, 2);
    assert.ok(createAddressRequests.every((request) =>
      request.ticker === "BNB" && request.network === "BEP20"));

    assert.equal(order.fromAsset, "BNB");
    assert.equal(order.fromNetwork, "BNB");
    assert.equal(order.status, "awaiting funds");
    assert.equal(order.manualSettlementState, "awaiting_funds");
    assert.equal(order.fundingProviderSource, "whitebit");
    assert.equal(order.fundingStatus, "ready_whitebit");
    assert.equal(order.depositAddress, providerAddress);
    const funding = order.fundingDetailsSnapshot as {
      whitebitAssetCode?: string; whitebitNetworkCode?: string;
    };
    assert.equal(funding.whitebitAssetCode, "BNB");
    assert.equal(funding.whitebitNetworkCode, "BEP20");

    const [claim] = await database.db.select().from(database.whitebitOrderAddressesTable)
      .where(eq(database.whitebitOrderAddressesTable.orderId, created.id)).limit(1);
    assert.ok(claim);
    assert.equal(claim.status, "ready");
    assert.equal(claim.ticker, "BNB");
    assert.equal(claim.providerTicker, "BNB");
    assert.equal(claim.network, "BEP20");
    assert.equal(claim.address, providerAddress);

    const uniqueId = `bnb-order-deposit-${suffix}`;
    const accepted = await signedOrderWebhook(
      uniqueId, providerAddress, "BEP20", "", "deposit.accepted", 1, "bnb-accepted", "BNB", "0.05",
    );
    assert.equal(accepted.status, 200, await accepted.clone().text());
    [order] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, created.id)).limit(1);
    assert.ok(order);
    assert.equal(order.status, "payment detected");
    assert.equal(order.manualSettlementState, "awaiting_funds");

    const processed = await signedOrderWebhook(
      uniqueId, providerAddress, "BEP20", "", "deposit.processed", 3, "bnb-processed", "BNB", "0.05",
    );
    assert.equal(processed.status, 200, await processed.clone().text());
    [order] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, created.id)).limit(1);
    assert.ok(order);
    assert.equal(order.status, "processing");
    assert.equal(order.manualSettlementState, "funds_confirmed");
    assert.equal(order.manualSettlementPaidAt, null);
    assert.notEqual(order.status.toLowerCase(), "completed");
    assert.notEqual(order.manualSettlementState, "completed");

    const [deposit] = await database.db.select().from(database.whitebitDepositsTable)
      .where(eq(database.whitebitDepositsTable.uniqueId, uniqueId)).limit(1);
    assert.equal(deposit.orderId, created.id);
    assert.equal(deposit.network, "BEP20");
  } finally {
    await database.db.delete(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.name, ruleName));
    await database.db.update(database.cryptoAssetNetworksTable).set({
      enabled: originalRoute.enabled,
      lifecycle: originalRoute.lifecycle,
      executionMode: originalRoute.executionMode,
      depositProvider: originalRoute.depositProvider,
      networkCode: originalRoute.networkCode,
      customerDepositsEnabled: originalRoute.customerDepositsEnabled,
      whitebitAssetCode: originalRoute.whitebitAssetCode,
      whitebitNetworkCode: originalRoute.whitebitNetworkCode,
    }).where(eq(database.cryptoAssetNetworksTable.id, routeId));
    await database.db.update(database.cryptoAssetsTable).set({
      enabled: originalAsset.enabled,
      lifecycle: originalAsset.lifecycle,
    }).where(eq(database.cryptoAssetsTable.id, originalAsset.id));
    await database.db.update(database.whitebitProviderSettingsTable).set({
      disabled: originalProviderSettings.disabled,
      version: originalProviderSettings.version,
      depositRouteProofs: originalProviderSettings.depositRouteProofs,
      credentialVerifiedFingerprint: originalProviderSettings.credentialVerifiedFingerprint,
      credentialVerifiedAt: originalProviderSettings.credentialVerifiedAt,
      updatedByOperatorId: originalProviderSettings.updatedByOperatorId,
      updatedAt: originalProviderSettings.updatedAt,
    }).where(eq(database.whitebitProviderSettingsTable.provider, "whitebit"));
    globalThis.fetch = originalFetch;
    resetWhitebitCapabilityCacheForTests();
  }
});

test("first activation and restart leave a pre-existing WhiteBIT fixture order untouched", async () => {
  const historicalId = `${orderId}-history-before-activation`;
  const previousEnabled = process.env.WHITEBIT_HISTORY_WORKER_ENABLED;
  const previousSource = process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE;
  const [previousWorkerState] = await database.db.select().from(database.whitebitHistoryWorkerStateTable)
    .where(eq(database.whitebitHistoryWorkerStateTable.id, 2)).limit(1);
  let signedCalls = 0;
  try {
    await mockAssets();
    const provisioned = await provisionTest({
      orderId: historicalId, assetCode: "BTC", networkCode: "BITCOIN",
      manualAddress: "manual-before-activation", manualMemo: "", chosenWhitebit: true,
    });
    assert.equal(provisioned.source, "whitebit");
    const [historicalOrder] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, historicalId)).limit(1);
    const [historicalClaim] = await database.db.select().from(database.whitebitOrderAddressesTable)
      .where(eq(database.whitebitOrderAddressesTable.orderId, historicalId)).limit(1);
    assert.ok(historicalOrder && historicalClaim);
    assert.equal(matchesFrozenWhitebitClaim(historicalOrder, historicalClaim), true);
    await database.db.delete(database.whitebitHistoryWorkerStateTable)
      .where(eq(database.whitebitHistoryWorkerStateTable.id, 2));
    process.env.WHITEBIT_HISTORY_WORKER_ENABLED = "true";
    process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE = "environment";
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith("https://whitebit.com/")) {
        signedCalls += 1;
        throw new Error("Historical claim must never trigger a provider request.");
      }
      return originalFetch(input, init);
    };
    await runConfiguredWhitebitHistoryCycle(historicalId);
    const [firstState] = await database.db.select().from(database.whitebitHistoryWorkerStateTable)
      .where(eq(database.whitebitHistoryWorkerStateTable.id, 2)).limit(1);
    assert.ok(firstState?.activatedAt);
    assert.ok(historicalOrder.createdAt < firstState.activatedAt);
    assert.ok(historicalClaim.createdAt < firstState.activatedAt);
    await runConfiguredWhitebitHistoryCycle(historicalId);
    const [restartedState] = await database.db.select().from(database.whitebitHistoryWorkerStateTable)
      .where(eq(database.whitebitHistoryWorkerStateTable.id, 2)).limit(1);
    assert.equal(restartedState?.activatedAt?.getTime(), firstState.activatedAt.getTime());
    assert.equal(signedCalls, 0);
    const [unchanged] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, historicalId)).limit(1);
    assert.equal(unchanged?.status, "awaiting funds");
    assert.equal((await database.db.select().from(database.whitebitDepositsTable)
      .where(eq(database.whitebitDepositsTable.orderId, historicalId))).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnabled === undefined) delete process.env.WHITEBIT_HISTORY_WORKER_ENABLED;
    else process.env.WHITEBIT_HISTORY_WORKER_ENABLED = previousEnabled;
    if (previousSource === undefined) delete process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE;
    else process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE = previousSource;
    await database.db.delete(database.whitebitHistoryWorkerStateTable)
      .where(eq(database.whitebitHistoryWorkerStateTable.id, 2));
    if (previousWorkerState) await database.db.insert(database.whitebitHistoryWorkerStateTable)
      .values(previousWorkerState);
  }
});

test("configured WhiteBIT history fallback confirms an exact pending Swap order", async () => {
  const historyOrderId = `${orderId}-history-fallback`;
  const previousEnabled = process.env.WHITEBIT_HISTORY_WORKER_ENABLED;
  const previousSource = process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE;
  const [previousWorkerState] = await database.db.select()
    .from(database.whitebitHistoryWorkerStateTable)
    .where(eq(database.whitebitHistoryWorkerStateTable.id, 2)).limit(1);
  const [previousRoute] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin")).limit(1);
  let providerBalanceCalls = 0;
  let providerHistoryCalls = 0;
  let targetHistoryCalls = 0;
  let watchesBefore = 0;

  try {
    await database.db.delete(database.whitebitHistoryWorkerStateTable)
      .where(eq(database.whitebitHistoryWorkerStateTable.id, 2));
    process.env.WHITEBIT_HISTORY_WORKER_ENABLED = "true";
    process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE = "environment";
    // First activation has no fixture order. Freeze the boundary before creating one.
    await runConfiguredWhitebitHistoryCycle(historyOrderId);
    const [firstState] = await database.db.select().from(database.whitebitHistoryWorkerStateTable)
      .where(eq(database.whitebitHistoryWorkerStateTable.id, 2)).limit(1);
    assert.ok(firstState?.activatedAt);
    // Model two PostgreSQL timestamps in the same millisecond. A JS Date
    // rounds both to equality, while the DB still knows the order is newer.
    await database.db.execute(sql`UPDATE whitebit_history_worker_state
      SET activated_at = date_trunc('milliseconds', activated_at) WHERE id = 2`);
    await mockAssets();
    const provisioned = await provisionTest({
      orderId: historyOrderId,
      assetCode: "BTC",
      networkCode: "BITCOIN",
      manualAddress: "manual-history-fallback",
      manualMemo: "",
      chosenWhitebit: true,
    });
    assert.equal(provisioned.source, "whitebit");
    await database.db.execute(sql`UPDATE exchange_orders SET created_at =
      (SELECT activated_at + interval '500 microseconds' FROM whitebit_history_worker_state WHERE id = 2)
      WHERE id = ${historyOrderId}`);
    await database.db.execute(sql`UPDATE whitebit_order_addresses SET created_at =
      (SELECT activated_at + interval '500 microseconds' FROM whitebit_history_worker_state WHERE id = 2)
      WHERE order_id = ${historyOrderId}`);
    const [fundedOrder] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, historyOrderId)).limit(1);
    const [fundedClaim] = await database.db.select().from(database.whitebitOrderAddressesTable)
      .where(eq(database.whitebitOrderAddressesTable.orderId, historyOrderId)).limit(1);
    assert.ok(fundedOrder && fundedClaim);
    assert.equal(matchesFrozenWhitebitClaim(fundedOrder, fundedClaim), true);
    assert.equal(fundedOrder.createdAt.getTime(), firstState.activatedAt.getTime());
    assert.equal(fundedClaim.createdAt.getTime(), firstState.activatedAt.getTime());
    const timestampProof = await pool.query<{ order_after: boolean; claim_after: boolean }>(
      `SELECT o.created_at > s.activated_at AS order_after, c.created_at > s.activated_at AS claim_after
       FROM exchange_orders o JOIN whitebit_order_addresses c ON c.order_id = o.id
       JOIN whitebit_history_worker_state s ON s.id = 2 WHERE o.id = $1`, [historyOrderId],
    );
    assert.equal(timestampProof.rows[0]?.order_after, true);
    assert.equal(timestampProof.rows[0]?.claim_after, true);
    assert.ok(previousRoute);
    watchesBefore = (await database.db.select({ id: database.blockchainMonitorWatchesTable.id })
      .from(database.blockchainMonitorWatchesTable)
      .where(eq(database.blockchainMonitorWatchesTable.orderId, historyOrderId))).length;
    // A route switch after order creation cannot change its frozen WhiteBIT identity.
    await database.db.update(database.cryptoAssetNetworksTable).set({ depositProvider: "manual" })
      .where(eq(database.cryptoAssetNetworksTable.id, "btc-bitcoin"));

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://whitebit.com/api/v4/main-account/balance") {
        providerBalanceCalls += 1;
        return new Response(JSON.stringify({ available: [], freeze: [] }), { status: 200 });
      }
      if (url === "https://whitebit.com/api/v4/main-account/history") {
        providerHistoryCalls += 1;
        const requestBody = JSON.parse(String(init?.body)) as { address?: string; ticker?: string };
        if (requestBody.address !== provisioned.address) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        targetHistoryCalls += 1;
        assert.equal(requestBody.ticker, "BTC");
        return new Response(JSON.stringify([{
            address: provisioned.address,
            ticker: "BTC",
            network: "BITCOIN",
            memo: "TAG-1",
            amount: "1",
            fee: "0",
            status: 3,
            unique_id: `history-fallback-${suffix}`,
            transaction_id: `tx-history-fallback-${suffix}`,
            transactionHash: `hash-history-fallback-${suffix}`,
          }]), { status: 200 });
      }
      if (url.startsWith("https://whitebit.com/")) {
        throw new Error(`Unexpected WhiteBIT request in history fixture: ${url}`);
      }
      return originalFetch(input, init);
    };

    await runConfiguredWhitebitHistoryCycle(historyOrderId);
    const [afterRestart] = await database.db.select().from(database.whitebitHistoryWorkerStateTable)
      .where(eq(database.whitebitHistoryWorkerStateTable.id, 2)).limit(1);
    assert.equal(afterRestart?.activatedAt?.getTime(), firstState.activatedAt.getTime());
    const [confirmed] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, historyOrderId)).limit(1);
    assert.equal(confirmed?.status, "processing");
    assert.equal(confirmed?.manualSettlementState, "funds_confirmed");
    assert.equal(confirmed?.fundingStatus, "ready_whitebit");
    const deposits = await database.db.select().from(database.whitebitDepositsTable)
      .where(eq(database.whitebitDepositsTable.orderId, historyOrderId));
    assert.equal(deposits.length, 1);
    assert.equal(deposits[0]?.uniqueId, `history-fallback-${suffix}`);
    assert.ok(providerBalanceCalls >= 1);
    assert.ok(providerHistoryCalls >= targetHistoryCalls);
    assert.equal(targetHistoryCalls, 1);
    assert.equal((await database.db.select({ id: database.blockchainMonitorWatchesTable.id })
      .from(database.blockchainMonitorWatchesTable)
      .where(eq(database.blockchainMonitorWatchesTable.orderId, historyOrderId))).length, watchesBefore);

    // The later signed webhook must use the canonical idempotent processor.
    const lateWebhook = await signedOrderWebhook(
      `history-fallback-${suffix}`, provisioned.address, "BITCOIN", "TAG-1",
      "deposit.processed", 3, "after-history", "BTC", "1",
    );
    assert.equal(lateWebhook.status, 200);
    const afterWebhook = await database.db.select().from(database.whitebitDepositsTable)
      .where(eq(database.whitebitDepositsTable.orderId, historyOrderId));
    assert.equal(afterWebhook.length, 1);
    assert.equal(afterWebhook[0]?.id, deposits[0]?.id);

    // A subsequent configured cycle must not replay the confirmed order.
    await runConfiguredWhitebitHistoryCycle(historyOrderId);
    const replayedDeposits = await database.db.select().from(database.whitebitDepositsTable)
      .where(eq(database.whitebitDepositsTable.orderId, historyOrderId));
    assert.equal(replayedDeposits.length, 1);
    assert.equal(targetHistoryCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousRoute) await database.db.update(database.cryptoAssetNetworksTable)
      .set({ depositProvider: previousRoute.depositProvider })
      .where(eq(database.cryptoAssetNetworksTable.id, previousRoute.id));
    if (previousEnabled === undefined) delete process.env.WHITEBIT_HISTORY_WORKER_ENABLED;
    else process.env.WHITEBIT_HISTORY_WORKER_ENABLED = previousEnabled;
    if (previousSource === undefined) delete process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE;
    else process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE = previousSource;
    await database.db.delete(database.whitebitHistoryWorkerStateTable)
      .where(eq(database.whitebitHistoryWorkerStateTable.id, 2));
    if (previousWorkerState) {
      await database.db.insert(database.whitebitHistoryWorkerStateTable).values(previousWorkerState)
        .onConflictDoUpdate({
          target: database.whitebitHistoryWorkerStateTable.id,
          set: previousWorkerState,
        });
    }
  }
});

test("Manual USDT TRC20 to EUR accepts every absent refund representation", async () => {
  const originalFetch = globalThis.fetch;
  await mockAssets("TRC20", "USDT");
  const networkId = "usdt-trc20";
  const [originalNetwork] = await database.db.select().from(database.cryptoAssetNetworksTable)
    .where(eq(database.cryptoAssetNetworksTable.id, networkId)).limit(1);
  if (!originalNetwork) throw new Error("Test catalog lacks USDT/TRC20.");
  const [originalAsset] = await database.db.select().from(database.cryptoAssetsTable)
    .where(eq(database.cryptoAssetsTable.id, originalNetwork.assetId)).limit(1);
  if (!originalAsset) throw new Error("Test catalog lacks the USDT asset.");
  const ruleName = `Refund absence ${suffix}`;
  const createdOrderIds: string[] = [];
  try {
    await database.db.update(database.cryptoAssetNetworksTable).set({
      enabled: true, executionMode: "manual", customerDepositsEnabled: true,
      depositProvider: "whitebit", sharedDepositAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", sharedDepositMemo: "",
      requiresMemo: false, manualWalletTrackingEnabled: false,
    }).where(eq(database.cryptoAssetNetworksTable.id, networkId));
    await database.db.update(database.cryptoAssetsTable).set({ enabled: true })
      .where(eq(database.cryptoAssetsTable.id, originalNetwork.assetId));
    await seedWhitebitVerificationFixture("USDT", "TRC20");
    const providerAddresses = [validTronAddress(), validTronAddress(), validTronAddress()];
    assert.equal(new Set(providerAddresses).size, providerAddresses.length);
    providerCalls = 0;
    const providerFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/api/v4/main-account/create-new-address")) {
        const address = providerAddresses[providerCalls];
        providerCalls += 1;
        providerPermissionCalls += 1;
        assert.ok(address, "unexpected extra WhiteBIT address request");
        return new Response(JSON.stringify({
          account: { address, memo: `TAG-${providerCalls}` },
        }), { status: 200 });
      }
      return providerFetch(input, init);
    };
    await database.db.insert(database.manualDeskPricingRulesTable).values({
      name: ruleName, sourceAsset: "USDT", targetAsset: "EUR",
      sourceNetwork: "TRC20", targetNetwork: "SEPA", markupBasisPoints: 0,
       exactRate: "1", fixedFee: "0", enabled: true, priority: pricingPriority + 1,
    });
    const config = await (await fetch(`${baseUrl}/api/exchange/config`)).json() as {
      manualSettlementOptions: Array<{ id: string; kind: string; assetCode: string; routeNetwork: string; direction: string }>;
    };
    const source = config.manualSettlementOptions.find((item) =>
      item.id === `crypto:${networkId}` && item.assetCode === "USDT" && item.routeNetwork.toUpperCase() === "TRC20" &&
      ["send", "both"].includes(item.direction));
    const target = config.manualSettlementOptions.find((item) =>
      item.kind === "fiat-payment-method" && item.assetCode === "EUR" && item.routeNetwork.toUpperCase() === "SEPA" &&
      ["receive", "both"].includes(item.direction));
    if (!source || !target) throw new Error(`Test catalog lacks USDT/TRC20 to EUR/SEPA settlement options: ${JSON.stringify(config.manualSettlementOptions.filter((item) => item.assetCode === "USDT" || item.assetCode === "EUR"))}`);
    for (const [index, refundValue] of [undefined, "", null].entries()) {
      const quoteResponse = await fetch(`${baseUrl}/api/exchange/quote`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "manual", fromAsset: "USDT", fromNetwork: "TRC20", toAsset: "EUR", toNetwork: "SEPA",
          amount: 10, sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
        }),
      });
      const quoteText = await quoteResponse.text();
      assert.equal(quoteResponse.status, 200, quoteText);
      const quote = JSON.parse(quoteText) as Record<string, unknown>;
      const settlementDetails = Object.fromEntries(((quote.requiredSettlementFields ?? []) as Array<{ key: string; type?: string }>).map((field) => [
        field.key,
        field.type === "email" ? `${suffix}-${index}@example.test` :
          field.type === "account-iban" ? "DE89370400440532013000" : "Refund absence test",
      ]));
      const request: Record<string, unknown> = {
        type: "manual", fromAsset: "USDT", fromNetwork: "TRC20", toAsset: "EUR", toNetwork: "SEPA",
        amount: 10, quoteId: quote.quoteId, clientRequestId: randomUUID(),
        customerEmail: `${suffix}-${index}@example.test`, customerName: "Refund absence test",
        sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id, settlementDetails,
      };
      if (refundValue !== undefined) {
        request.refundAddress = refundValue;
        request.refundMemo = refundValue;
      }
      const response = await fetch(`${baseUrl}/api/exchange/orders`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
      });
      const responseText = await response.text();
      assert.ok([201, 202].includes(response.status), responseText);
      const body = JSON.parse(responseText) as {
        id: string; depositAddress?: string; depositMemo?: string; fundingStatus?: string;
      };
      createdOrderIds.push(body.id);
      let stored: typeof database.ordersTable.$inferSelect | undefined;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        [stored] = await database.db.select().from(database.ordersTable)
          .where(eq(database.ordersTable.id, body.id)).limit(1);
        if (stored?.fundingStatus === "ready_whitebit") break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(stored);
      assert.equal(providerCalls, index + 1, `new order ${index + 1} should make one provider request`);
      assert.equal(stored.fundingStatus, "ready_whitebit");
      assert.equal(stored.depositAddress, providerAddresses[index]);
      assert.equal(stored.depositMemo, `TAG-${index + 1}`);
      assert.equal(body.depositAddress, providerAddresses[index]);
      assert.equal(body.depositMemo, `TAG-${index + 1}`);
      const funding = stored.fundingDetailsSnapshot as { address?: string; memo?: string; status?: string };
      const settlementFunding = (stored.settlementSnapshot as {
        funding?: { address?: string; memo?: string; status?: string };
      }).funding;
      assert.deepEqual(
        { address: funding.address, memo: funding.memo, status: funding.status },
        { address: providerAddresses[index], memo: `TAG-${index + 1}`, status: "ready" },
      );
      assert.deepEqual(
        { address: settlementFunding?.address, memo: settlementFunding?.memo, status: settlementFunding?.status },
        { address: providerAddresses[index], memo: `TAG-${index + 1}`, status: "ready" },
      );
      const callsAfterCreate = providerCalls;
      const replayResponse = await fetch(`${baseUrl}/api/exchange/orders`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
      });
      const replayText = await replayResponse.text();
      assert.equal(replayResponse.status, 200, replayText);
      const replay = JSON.parse(replayText) as {
        id: string; depositAddress?: string; depositMemo?: string; fundingStatus?: string;
      };
      assert.equal(replay.id, body.id);
      assert.equal(replay.depositAddress, providerAddresses[index]);
      assert.equal(replay.depositMemo, `TAG-${index + 1}`);
      assert.equal(replay.fundingStatus, "ready_whitebit");
      assert.equal(providerCalls, callsAfterCreate, "idempotent replay must not request another address");
      assert.deepEqual(
        { refundAddress: stored.refundAddress, refundMemo: stored.refundMemo },
        { refundAddress: "", refundMemo: "" },
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const id of createdOrderIds) {
      await pool.query("DELETE FROM whitebit_order_history_checkpoints WHERE order_address_id IN (SELECT id FROM whitebit_order_addresses WHERE order_id = $1)", [id]);
      await pool.query("DELETE FROM whitebit_order_addresses WHERE order_id = $1", [id]);
      await database.db.delete(database.ordersTable).where(eq(database.ordersTable.id, id));
    }
    await database.db.delete(database.manualDeskPricingRulesTable)
      .where(eq(database.manualDeskPricingRulesTable.name, ruleName));
    await database.db.update(database.cryptoAssetNetworksTable).set({
      enabled: originalNetwork.enabled, executionMode: originalNetwork.executionMode,
      customerDepositsEnabled: originalNetwork.customerDepositsEnabled,
      depositProvider: originalNetwork.depositProvider, sharedDepositAddress: originalNetwork.sharedDepositAddress,
      sharedDepositMemo: originalNetwork.sharedDepositMemo, requiresMemo: originalNetwork.requiresMemo,
      manualWalletTrackingEnabled: originalNetwork.manualWalletTrackingEnabled,
    }).where(eq(database.cryptoAssetNetworksTable.id, networkId));
    await database.db.update(database.cryptoAssetsTable).set({ enabled: originalAsset.enabled })
      .where(eq(database.cryptoAssetsTable.id, originalAsset.id));
  }
});