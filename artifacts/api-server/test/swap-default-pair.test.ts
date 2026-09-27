import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { eq } from "drizzle-orm";
import type { PublicManualSwapData } from "../src/lib/manual-swap-default-pair";
import type { ManualDeskPricingRule } from "@workspace/db";

const TEST_USER = `swap-default-pair-api-test-${randomUUID()}`;
const TEST_EMAIL = `${TEST_USER}@example.test`;
const disposableDatabaseName = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  } catch {
    return "";
  }
})();
if (
  process.env.API_TEST_DISPOSABLE_DATABASE !== "1" ||
  process.env.NODE_ENV !== "test" ||
  !/^api_test_[a-f0-9]{16}$/.test(disposableDatabaseName) ||
  process.env.REPLIT_DEPLOYMENT
) {
  throw new Error(
    "Swap default-pair API tests require the disposable database created by test/run-api-isolated.mjs; do not run this test directly against a shared database.",
  );
}
let apiUrl = "";
let server: import("node:http").Server;
let database: typeof import("@workspace/db");
let operatorAuth: typeof import("../src/lib/operator-auth");
let pairSource: typeof import("../src/lib/manual-swap-default-pair");
let previousPair: typeof database.swapDefaultPairSettingsTable.$inferSelect | undefined;
let fixtureOptions: PublicManualSwapData;
let disposableSettingsReady = false;
let testSourceConfigured = false;

const cryptoOption = (id: string) => ({
  id,
  assetId: `asset-${id}`,
  assetCode: "BTC",
  routeNetwork: "Bitcoin",
  kind: "crypto-network" as const,
  title: `BTC ${id}`,
  direction: "both" as const,
  networkSlug: id,
  networkTitle: "Bitcoin",
  requiresMemo: false,
  fields: [] as [],
  customerDepositsEnabled: true,
  executionMode: "manual" as const,
  lifecycle: "active" as const,
  regions: [] as string[],
  countries: [] as string[],
});

const fiatOption = (id: string) => ({
  id,
  assetId: `fiat-${id}`,
  assetCode: "USD",
  routeNetwork: "USD",
  kind: "fiat-payment-method" as const,
  title: `USD ${id}`,
  direction: "both" as const,
  family: "bank",
  executionMode: "manual" as const,
  lifecycle: "active" as const,
  regions: [] as string[],
  countries: [] as string[],
  requiresProviderConfiguration: false,
  paymentMethodId: id,
  fields: [],
});

function pricingRule(): ManualDeskPricingRule {
  return {
    id: "fixture-rule",
    sourceAsset: null,
    sourceCryptoAssetId: null,
    targetAsset: null,
    targetCryptoAssetId: null,
    sourceNetwork: null,
    targetNetwork: null,
    paymentMethod: null,
    payoutMethod: null,
    sourceSettlementOptionId: null,
    targetSettlementOptionId: null,
    priority: 0,
    enabled: true,
    exactRate: null,
  } as unknown as ManualDeskPricingRule;
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      "x-test-clerk-user-id": TEST_USER,
    },
  });
  return { response, body: await response.text() };
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.SESSION_SECRET = "swap-default-pair-test-secret";
  database = await import("@workspace/db");
  operatorAuth = await import("../src/lib/operator-auth");
  pairSource = await import("../src/lib/manual-swap-default-pair");
  let saved: typeof previousPair;
  try {
    [saved] = await database.db.select().from(database.swapDefaultPairSettingsTable)
      .where(eq(database.swapDefaultPairSettingsTable.id, "global"))
      .limit(1);
  } catch (error) {
    throw new Error(
      "The disposable API-test database is missing swap_default_pair_settings; apply migration 0128 before running this API test.",
      { cause: error },
    );
  }
  previousPair = saved;
  await database.db.delete(database.swapDefaultPairSettingsTable)
    .where(eq(database.swapDefaultPairSettingsTable.id, "global"));
  disposableSettingsReady = true;

  fixtureOptions = {
    cryptoOptions: [cryptoOption("crypto:fixture-btc")],
    fiatOptions: [fiatOption("fiat:fixture-usd:bank")],
    pricingRules: [pricingRule()],
  };
  pairSource.configureManualSwapDefaultPairSourceForTests(async () => fixtureOptions);
  testSourceConfigured = true;
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
    getSecondFactorVerified: () => true,
    getTotpEnabled: () => true,
  });
  await database.db.insert(database.operatorsTable).values({
    clerkUserId: TEST_USER,
    email: TEST_EMAIL,
    role: "operator",
    status: "active",
    permissionAllows: ["currencies.view", "currencies.manage"],
  }).onConflictDoNothing();
  const { default: app } = await import("../src/app");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
  if (testSourceConfigured) {
    pairSource.configureManualSwapDefaultPairSourceForTests(undefined);
  }
  if (disposableSettingsReady) {
    await database.db.delete(database.swapDefaultPairSettingsTable)
      .where(eq(database.swapDefaultPairSettingsTable.id, "global"));
    if (previousPair) {
      await database.db.insert(database.swapDefaultPairSettingsTable).values(previousPair);
    }
  }
  if (database) {
    await database.db.delete(database.operatorsTable)
      .where(eq(database.operatorsTable.clerkUserId, TEST_USER));
    await database.pool.end();
  }
});

test("Admin can persist and read a currently covered public Manual Swap pair", async () => {
  const savedPair = {
    sourceSettlementOptionId: "fiat:fixture-usd:bank",
    targetSettlementOptionId: "crypto:fixture-btc",
  };
  const put = await request("/admin/swap-default-pair", {
    method: "PUT",
    body: JSON.stringify(savedPair),
  });
  assert.equal(put.response.status, 200, put.body);
  assert.deepEqual(JSON.parse(put.body), { pair: savedPair });

  const get = await request("/admin/swap-default-pair");
  assert.equal(get.response.status, 200, get.body);
  assert.deepEqual(JSON.parse(get.body), { pair: savedPair });
});

test("Admin rejects malformed, unknown, and newly stale pair selections", async () => {
  const malformed = await request("/admin/swap-default-pair", {
    method: "PUT",
    body: JSON.stringify({ sourceSettlementOptionId: "only-one-id" }),
  });
  assert.equal(malformed.response.status, 400, malformed.body);

  const unknown = await request("/admin/swap-default-pair", {
    method: "PUT",
    body: JSON.stringify({
      sourceSettlementOptionId: "fiat:missing",
      targetSettlementOptionId: "crypto:missing",
    }),
  });
  assert.equal(unknown.response.status, 409, unknown.body);

  fixtureOptions = {
    cryptoOptions: [cryptoOption("crypto:replacement-btc")],
    fiatOptions: [fiatOption("fiat:replacement-usd:bank")],
    pricingRules: [pricingRule()],
  };
  const stale = await request("/admin/swap-default-pair", {
    method: "PUT",
    body: JSON.stringify({
      sourceSettlementOptionId: "fiat:fixture-usd:bank",
      targetSettlementOptionId: "crypto:fixture-btc",
    }),
  });
  assert.equal(stale.response.status, 409, stale.body);
});

test("public config falls back to the first currently covered route when the saved pair is stale", async () => {
  const response = await request("/exchange/config");
  assert.equal(response.response.status, 200, response.body);
  const config = JSON.parse(response.body) as {
    defaultSwapPair?: {
      sourceSettlementOptionId: string;
      targetSettlementOptionId: string;
    };
  };
  assert.deepEqual(config.defaultSwapPair, {
    sourceSettlementOptionId: "crypto:replacement-btc",
    targetSettlementOptionId: "fiat:replacement-usd:bank",
  });
});