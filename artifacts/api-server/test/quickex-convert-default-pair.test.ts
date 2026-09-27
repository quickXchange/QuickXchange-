import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { eq } from "drizzle-orm";

const TEST_USER = `quickex-convert-default-test-${randomUUID()}`;
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
    "Quickex Convert default-pair API tests require the disposable database created by test/run-api-isolated.mjs; do not run this test directly against a shared database.",
  );
}

let apiUrl = "";
let server: import("node:http").Server;
let database: typeof import("@workspace/db");
let operatorAuth: typeof import("../src/lib/operator-auth");
let capabilitySource: typeof import("../src/lib/provider-capabilities");
let previousConvertPair: typeof database.convertDefaultPairSettingsTable.$inferSelect | undefined;
let previousSwapPair: typeof database.swapDefaultPairSettingsTable.$inferSelect | undefined;
let disposableSettingsReady = false;
let testSourceConfigured = false;

const pairA = {
  fromAsset: "BTC",
  fromNetwork: "Bitcoin",
  toAsset: "USDT",
  toNetwork: "TRC20",
};
const pairB = {
  fromAsset: "USDT",
  fromNetwork: "TRC20",
  toAsset: "XRP",
  toNetwork: "Ripple",
};
let availablePairs = [pairA, pairB];

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
  process.env.SESSION_SECRET = "quickex-convert-default-pair-test-secret";
  database = await import("@workspace/db");
  operatorAuth = await import("../src/lib/operator-auth");
  capabilitySource = await import("../src/lib/provider-capabilities");
  let savedConvert: typeof previousConvertPair;
  let savedSwap: typeof previousSwapPair;
  try {
    [savedConvert] = await database.db.select().from(database.convertDefaultPairSettingsTable)
      .where(eq(database.convertDefaultPairSettingsTable.id, "global")).limit(1);
    [savedSwap] = await database.db.select().from(database.swapDefaultPairSettingsTable)
      .where(eq(database.swapDefaultPairSettingsTable.id, "global")).limit(1);
  } catch (error) {
    throw new Error(
      "The disposable API-test database is missing the Convert default-pair schema; apply migration 0129 before running this API test.",
      { cause: error },
    );
  }
  previousConvertPair = savedConvert;
  previousSwapPair = savedSwap;
  await database.db.delete(database.convertDefaultPairSettingsTable)
    .where(eq(database.convertDefaultPairSettingsTable.id, "global"));
  disposableSettingsReady = true;

  capabilitySource.configureQuickexPublicConfigSourceForTests(async () => ({
    provider: "Quickex",
    instruments: [],
    pairs: availablePairs,
    signedOrders: availablePairs.length > 0,
  }));
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
    capabilitySource.configureQuickexPublicConfigSourceForTests(undefined);
  }
  if (disposableSettingsReady) {
    await database.db.delete(database.convertDefaultPairSettingsTable)
      .where(eq(database.convertDefaultPairSettingsTable.id, "global"));
    if (previousConvertPair) {
      await database.db.insert(database.convertDefaultPairSettingsTable).values(previousConvertPair);
    }
  }
  if (database) {
    await database.db.delete(database.operatorsTable)
      .where(eq(database.operatorsTable.clerkUserId, TEST_USER));
    await database.pool.end();
  }
});

test("Admin can save a supported directed Convert pair independently from Swap", async () => {
  const put = await request("/admin/convert-default-pair", {
    method: "PUT",
    body: JSON.stringify(pairB),
  });
  assert.equal(put.response.status, 200, put.body);
  assert.deepEqual(JSON.parse(put.body), { pair: pairB });

  const get = await request("/admin/convert-default-pair");
  assert.equal(get.response.status, 200, get.body);
  assert.deepEqual(JSON.parse(get.body), { pair: pairB });

  const [swapAfter] = await database.db.select().from(database.swapDefaultPairSettingsTable)
    .where(eq(database.swapDefaultPairSettingsTable.id, "global")).limit(1);
  assert.deepEqual(swapAfter, previousSwapPair);
});

test("Admin rejects malformed and unsupported directed pairs without Cartesian eligibility", async () => {
  const malformed = await request("/admin/convert-default-pair", {
    method: "PUT",
    body: JSON.stringify({ fromAsset: "BTC" }),
  });
  assert.equal(malformed.response.status, 400, malformed.body);

  const unsupportedCartesianPair = await request("/admin/convert-default-pair", {
    method: "PUT",
    body: JSON.stringify({
      fromAsset: pairA.fromAsset,
      fromNetwork: pairA.fromNetwork,
      toAsset: pairB.toAsset,
      toNetwork: pairB.toNetwork,
    }),
  });
  assert.equal(unsupportedCartesianPair.response.status, 409, unsupportedCartesianPair.body);
});

test("Public config falls back to the first current pair and is never HTTP cached", async () => {
  availablePairs = [pairA];
  const response = await request("/quickex/config");
  assert.equal(response.response.status, 200, response.body);
  assert.equal(response.response.headers.get("cache-control"), "no-store");
  const config = JSON.parse(response.body) as {
    pairs: typeof availablePairs;
    defaultConvertPair?: typeof pairA;
  };
  assert.deepEqual(config.defaultConvertPair, pairA);

  availablePairs = [];
  const emptyResponse = await request("/quickex/config");
  assert.equal(emptyResponse.response.status, 200, emptyResponse.body);
  const emptyConfig = JSON.parse(emptyResponse.body) as { defaultConvertPair?: unknown };
  assert.equal("defaultConvertPair" in emptyConfig, false);
});