import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { resolve } from "node:path";
import { eq, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { ensureOrderDirectoryIndexes } from "@workspace/db/online-order-directory-indexes";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";

type MockMode =
  | "ok" | "auth" | "address" | "memo" | "rateRead" | "rateCreate"
  | "fiveHundred" | "badJson" | "badBody" | "slow" | "acceptedSlow" | "missingSlow"
  | "mismatchedRateMode" | "catalogUnavailable" | "slowOrders" | "slowOrdersFailure"
  | "authHtml" | "validationForbidden" | "pairUnavailable" | "expandedCatalog"
  | "ambiguousEmpty" | "ambiguousPlausible" | "formatOnlyReject" | "noContent"
  | "proofInvalidatedBeforeCreate";

const instrument = (
  currencyTitle: string,
  networkTitle: string,
  slug: string,
  requiresMemo = false,
  precisionDecimals = 8,
) => ({
  currencyTitle, networkTitle, slug, instrumentType: "crypto", fullName: `${currencyTitle} ${networkTitle}`,
  currencyFriendlyTitle: currencyTitle,
  currencyLogoLink: `https://quickex.io/assets/coins/${currencyTitle.toLowerCase()}.svg`,
  precisionDecimals, requiresMemo,
});
const catalog = [
  instrument("BTC", "Bitcoin", "btc-btc", false, 18),
  instrument("USDT", "TRC20", "usdt-trc20"),
  instrument("XRP", "Ripple", "xrp-ripple", true),
];
const providerOnlyInstrument = instrument("QXT", "Quickex Testnet", "qxt-quickex-testnet");
const quote = {
  instrumentFrom: {
    currencyTitle: catalog[0].currencyTitle,
    networkTitle: catalog[0].networkTitle,
    slug: catalog[0].slug,
    precisionDecimals: catalog[0].precisionDecimals,
  },
  instrumentTo: {
    currencyTitle: catalog[1].currencyTitle,
    networkTitle: catalog[1].networkTitle,
    slug: catalog[1].slug,
    precisionDecimals: catalog[1].precisionDecimals,
  },
  amountToGet: "99.5000", price: "9950.00",
  updatedAt: 1_700_000_000_000, finalNetworkFeeAmount: "0.5", generalMinAmount: "0.001",
  generalMaxAmount: "10", rateMode: "FLOATING" as const,
};

let mode: MockMode = "ok";
let quoteCalls = 0;
let createCalls = 0;
let signedCalls = 0;
let instrumentCalls = 0;
let addressValidationCalls = 0;
let signedPublicKeys: string[] = [];
let providerOrders: Record<string, unknown>[] = [];
let requestedRateModes: string[] = [];
let createPayloads: Record<string, unknown>[] = [];
let fiatRateCalls = 0;
let cryptoRateCalls = 0;
let receivedOneForgeKeys: string[] = [];
let marketRateMode: "ok" | "badFiat" | "badCrypto" = "ok";
let expectedOneForgePairs = "AED/USD,USD/AED,DZD/USD,USD/DZD,EUR/USD,USD/EUR,GBP/USD,USD/GBP,KZT/USD,USD/KZT,TRY/USD,USD/TRY";
let server: ReturnType<typeof createServer>;
let baseUrl = "";
let quickex: typeof import("../src/lib/quickex");
let tickets: typeof import("../src/lib/quote-ticket");
let providerCredentials: typeof import("../src/lib/provider-credentials");
let manualDeskRates: typeof import("../src/lib/manual-desk-rates");
let storedCredentials:
  import("../src/lib/provider-credentials").StoredQuickexCredentials | null = null;
let lastCredentialAudit:
  import("../src/lib/provider-credentials").QuickexCredentialAudit | null = null;
let credentialActivations = 0;
let originalFallbackRule: import("@workspace/db").ManualDeskPricingRule | undefined;
const fallbackRuleId = "00000000-0000-4000-8000-000000000035";
const privilegedTestPool = createPrivilegedTestPool();

async function deleteOrderAuditLogsForMaintenance(orderId: string) {
  const client = await privilegedTestPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE quickex_order_audit_maintenance");
    await client.query(
      "DELETE FROM exchange_order_audit_logs WHERE order_id = $1",
      [orderId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function installTestPricingFallback() {
  const { db, manualDeskPricingRulesTable } = await import("@workspace/db");
  [originalFallbackRule] = await db.select().from(manualDeskPricingRulesTable)
    .where(eq(manualDeskPricingRulesTable.id, fallbackRuleId)).limit(1);
  const baseline = {
    name: "Global 0.6% fallback",
    sourceAsset: null,
    targetAsset: null,
    sourceNetwork: null,
    targetNetwork: null,
    paymentMethod: null,
    payoutMethod: null,
    markupBasisPoints: 60,
    fixedFee: null,
    priority: -1000,
    enabled: true,
    version: 1,
    updatedAt: new Date(),
  };
  if (originalFallbackRule) {
    await db.update(manualDeskPricingRulesTable).set(baseline)
      .where(eq(manualDeskPricingRulesTable.id, fallbackRuleId));
  } else {
    await db.insert(manualDeskPricingRulesTable).values({ id: fallbackRuleId, ...baseline });
  }
}

async function restorePricingFallback() {
  const { db, manualDeskPricingRulesTable } = await import("@workspace/db");
  if (!originalFallbackRule) {
    await db.delete(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, fallbackRuleId));
    return;
  }
  const { id: _id, ...originalValues } = originalFallbackRule;
  await db.update(manualDeskPricingRulesTable).set(originalValues)
    .where(eq(manualDeskPricingRulesTable.id, fallbackRuleId));
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 7001, id: "provider-reference-7001",
    destinationAddress: "destination-exact", refundAddress: "refund-exact",
    claimedDepositAmount: "1.2300", amountToGet: "99.5", amountToWithdrawFact: null,
    instrumentFromCurrencyTitle: "BTC", instrumentFromNetworkTitle: "Bitcoin",
    instrumentToCurrencyTitle: "USDT", instrumentToNetworkTitle: "TRC20",
    createdAt: new Date(1_700_000_000_000).toISOString(), updatedAt: new Date().toISOString(),
    completed: false, state: "created", ...overrides,
  };
}

function settlementDetailsFixture(fields: Array<Record<string, any>> = []) {
  const details: Record<string, string | number> = {};
  for (const field of fields) {
    if (!field.required) continue;
    const isIban = field.type === "account-iban" ||
      /\biban\b/i.test(`${field.key ?? ""} ${field.label ?? ""}`);
    details[field.key] =
      ["integer", "number", "numeric", "decimal"].includes(field.type)
        ? Math.max(field.min ?? 1, 1)
        : field.type === "select"
          ? field.options[0].value
          : field.type === "email"
            ? "person@example.test"
            : field.type === "phone"
              ? "+12025550123"
              : isIban
                ? "GB82WEST12345698765432"
                : field.type === "date"
                  ? "2026-01-01"
                  : "x".repeat(Math.max(field.min ?? 1, 1));
  }
  return details;
}
function send(res: ServerResponse, status: number, body: unknown, raw = false) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(raw ? String(body) : JSON.stringify(body));
}
async function readRequestJson(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw) as Record<string, unknown>;
}
async function mock(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://mock");
  if (url.pathname === "/quotes") {
    fiatRateCalls++;
    receivedOneForgeKeys.push(url.searchParams.get("api_key") ?? "");
    if (url.searchParams.get("pairs") !== expectedOneForgePairs) {
      return send(res, 400, { error: "Unexpected OneForge pairs fixture." });
    }
    if (marketRateMode === "badFiat") {
      return send(res, 200, [{ symbol: "EUR/USD", price: "1.25" }]);
    }
    return send(res, 200, [
      { s: "EUR/USD", p: "1.25", b: 1.24, a: 1.26, t: 1_700_000_000 },
      { s: "GBP/USD", p: "2", b: 1.99, a: 2.01, t: 1_700_000_000 },
      { s: "USD/AED", p: "4", b: 3.99, a: 4.01, t: 1_700_000_000 },
      { s: "DZD/USD", p: "0.0074", t: 1_700_000_000 },
      { s: "KZT/USD", p: "0.002", t: 1_700_000_000 },
      { s: "TRY/USD", p: "0.03", t: 1_700_000_000 },
      { s: "USD/JPY", p: "160", b: 159.9, a: 160.1, t: 1_700_000_000 },
    ]);
  }
  if (url.pathname === "/v2/exchange-rates") {
    cryptoRateCalls++;
    if (marketRateMode === "badCrypto") {
      return send(res, 200, { data: { currency: "EUR", rates: { BTC: "0.00002" } } });
    }
    return send(res, 200, {
      data: {
        currency: "USD",
        rates: { BTC: "0.00002", USDT: "1", XRP: "2", EUR: "0.8" },
      },
    });
  }
  if (url.pathname === "/instruments/public") {
    instrumentCalls++;
    if (mode === "catalogUnavailable") {
      return send(res, 503, { message: "Quickex internal catalog failure" });
    }
    return send(res, 200, mode === "expandedCatalog" ? [...catalog, providerOnlyInstrument] : catalog);
  }
  if (url.pathname === "/pairs/public") {
    if (mode === "pairUnavailable") {
      return send(res, 503, { message: "Quickex pair catalog unavailable" });
    }
    const pairs = [{
      instrumentFromCurrencyTitle: "BTC",
      instrumentFromNetworkTitle: "Bitcoin",
      instrumentToCurrencyTitle: "USDT",
      instrumentToNetworkTitle: "TRC20",
    }];
    if (mode === "expandedCatalog") pairs.push({
      instrumentFromCurrencyTitle: providerOnlyInstrument.currencyTitle,
      instrumentFromNetworkTitle: providerOnlyInstrument.networkTitle,
      instrumentToCurrencyTitle: "BTC",
      instrumentToNetworkTitle: "Bitcoin",
    });
    if (mode === "memo") pairs.push({
      instrumentFromCurrencyTitle: "BTC",
      instrumentFromNetworkTitle: "Bitcoin",
      instrumentToCurrencyTitle: "XRP",
      instrumentToNetworkTitle: "Ripple",
    });
    return send(res, 200, pairs);
  }
  if (url.pathname === "/instruments/validate-address") {
    addressValidationCalls++;
    assert.equal(req.headers["x-api-public-key"], "test-public");
    assert.ok(req.headers["x-api-timestamp"]);
    assert.ok(req.headers["x-api-signature"]);
    if (mode === "validationForbidden") {
      res.writeHead(403, { "content-type": "text/html" });
      res.end("<html><body>Forbidden</body></html>");
      return;
    }
    if (mode === "address") {
      return send(res, 400, {
        status: "ERR_HTTP", message: "Http Exception",
        data: { address: "destination address is incorrect" },
      });
    }
    return send(res, 200, { valid: true });
  }
  if (url.pathname === "/rates/public/one") {
    quoteCalls++;
    const requestedRateMode = url.searchParams.get("rateMode") ?? "";
    requestedRateModes.push(requestedRateMode);
    if (mode === "rateRead" && quoteCalls === 1) return send(res, 429, { message: "later" });
    if (mode === "fiveHundred") return send(res, 502, { message: "upstream unavailable" });
    if (mode === "badJson") return send(res, 200, "{", true);
    if (mode === "badBody") return send(res, 200, { hello: "world" });
    const responseQuote = {
      ...quote,
      ...(mode === "expandedCatalog" ? {
        instrumentFrom: {
          ...providerOnlyInstrument,
          currencyTitle: url.searchParams.get("instrumentFromCurrencyTitle"),
          networkTitle: url.searchParams.get("instrumentFromNetworkTitle"),
          slug: url.searchParams.get("instrumentFromSlug"),
        },
        instrumentTo: {
          ...catalog[0],
          currencyTitle: url.searchParams.get("instrumentToCurrencyTitle"),
          networkTitle: url.searchParams.get("instrumentToNetworkTitle"),
          slug: url.searchParams.get("instrumentToSlug"),
        },
      } : {}),
      rateMode: mode === "mismatchedRateMode"
        ? (requestedRateMode === "FIXED" ? "FLOATING" : "FIXED")
        : requestedRateMode,
    };
    if (mode === "slow") return setTimeout(() => send(res, 200, responseQuote), 150);
    return send(res, 200, responseQuote);
  }
  if (url.pathname === "/orders/public") {
    signedCalls++;
    assert.ok(req.headers["x-api-public-key"]);
    assert.ok(req.headers["x-api-timestamp"]);
    assert.ok(req.headers["x-api-signature"]);
    const publicKey = String(req.headers["x-api-public-key"]);
    const timestamp = String(req.headers["x-api-timestamp"]);
    const signature = String(req.headers["x-api-signature"]);
    signedPublicKeys.push(publicKey);
    if (mode === "noContent") {
      res.writeHead(204);
      res.end();
      return;
    }
    const knownSecrets: Record<string, string> = {
      "test-public": "test-secret",
      "stored-public-key": "stored-secret-key",
      "candidate-public-key": "candidate-secret-key",
      "concurrent-public-key-one": "concurrent-secret-key-one",
      "concurrent-public-key-two": "concurrent-secret-key-two",
      "submitted-public-key": "submitted-secret-key",
      "environment-public-key": "environment-secret-key",
    };
    const expectedSignature = knownSecrets[publicKey]
      ? createHmac("sha256", knownSecrets[publicKey]!).update(`${timestamp}${publicKey}`).digest("base64")
      : undefined;
    if (!expectedSignature || signature !== expectedSignature) {
      if (mode === "ambiguousEmpty") return send(res, 200, []);
      if (mode === "ambiguousPlausible") return send(res, 200, [order()]);
      if (mode === "formatOnlyReject" && /^[A-Za-z0-9+/]{43}=$/.test(signature)) {
        return send(res, 200, []);
      }
      return send(res, 403, { message: "signature rejected" });
    }
    if (mode === "authHtml") {
      res.writeHead(403, { "content-type": "text/html" });
      res.end("<html><body>Forbidden</body></html>");
      return;
    }
    if (mode === "auth") return send(res, 403, { message: "signature rejected" });
    if (mode === "fiveHundred") return send(res, 503, { message: "provider system name and internal details" });
    if (mode === "slowOrders") {
      return setTimeout(() => send(res, 200, providerOrders), 20);
    }
    if (mode === "slowOrdersFailure") {
      return setTimeout(() => send(res, 503, { message: "temporary" }), 20);
    }
    if (mode === "proofInvalidatedBeforeCreate") {
      quickex.invalidateQuickexRuntimeVerificationForTests();
    }
    return send(res, 200, providerOrders);
  }
  if (url.pathname === "/orders/public/create") {
    createCalls++;
    assert.ok(req.headers["x-api-public-key"]);
    assert.ok(req.headers["x-api-timestamp"]);
    assert.ok(req.headers["x-api-signature"]);
    createPayloads.push(await readRequestJson(req));
    if (mode === "auth") return send(res, 403, { message: "IP address signature rejected" });
    if (mode === "address") return send(res, 400, { status: "ERR_HTTP", message: "Http Exception", data: { address: "destination address is incorrect" } });
    if (mode === "memo") return send(res, 400, { message: "memo tag invalid" });
    if (mode === "rateCreate") return send(res, 429, { message: "later" });
    if (mode === "fiveHundred") return send(res, 503, { message: "temporary" });
    if (mode === "badJson") return send(res, 200, "{", true);
    if (mode === "badBody") return send(res, 200, { orderId: 8 });
    if (mode === "acceptedSlow") {
      providerOrders = [order({ orderId: 811, claimedDepositAmount: "1.0000", createdAt: new Date().toISOString() })];
      return setTimeout(() => send(res, 201, { orderId: 811, depositAddress: "deposit" }), 150);
    }
    if (mode === "missingSlow") return setTimeout(() => send(res, 201, { orderId: 812, depositAddress: "deposit" }), 150);
    providerOrders = [order({
      orderId: 800,
      createdAt: new Date().toISOString(),
    })];
    return send(res, 201, {
      orderId: "provider-reference-800",
      depositAddress: {
        depositAddress: "deposit",
        depositAddressMemo: "memo",
      },
      state: "created",
    });
  }
  send(res, 404, { message: "not found" });
}
function reset(next: MockMode = "ok") {
  mode = next; quoteCalls = 0; createCalls = 0; signedCalls = 0; providerOrders = [];
  instrumentCalls = 0; addressValidationCalls = 0; requestedRateModes = []; createPayloads = []; signedPublicKeys = [];
  fiatRateCalls = 0; cryptoRateCalls = 0; receivedOneForgeKeys = []; marketRateMode = "ok";
  expectedOneForgePairs = "AED/USD,USD/AED,DZD/USD,USD/DZD,EUR/USD,USD/EUR,GBP/USD,USD/GBP,KZT/USD,USD/KZT,TRY/USD,USD/TRY";
  process.env.QUICKEX_BASE_URL = baseUrl;
  const verifiedAt = new Date();
  const credentials = {
    publicKey: process.env.QUICKEX_PUBLIC_KEY ?? "test-public",
    secretKey: process.env.QUICKEX_SECRET_KEY ?? "test-secret",
  };
  storedCredentials = {
    credentials,
    updatedAt: verifiedAt,
    verificationVersion: providerCredentials.QUICKEX_VERIFICATION_VERSION,
    verifiedCredentialFingerprint:
      providerCredentials.quickexCredentialFingerprint(credentials),
    verifiedAt,
    lastTestedAt: verifiedAt,
  };
  quickex?.resetQuickexRuntimeVerificationForTests();
}
const input = () => ({
  fromCurrency: "BTC", fromNetwork: "Bitcoin", toCurrency: "USDT", toNetwork: "TRC20", amount: 1,
  destinationAddress: "destination-exact", refundAddress: "refund-exact", email: "quickex-test@example.test", quote,
});
function requestIdForTest(sequence: number) {
  return `0f1b7a25-1f8e-4a67-8b4a-${(Date.now() + sequence).toString(16).slice(-12).padStart(12, "0")}`;
}
function canonicalDecimal(value: unknown) {
  assert.equal(typeof value, "string");
  assert.match(value, /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ""] = unsigned.split(".");
  const canonicalFraction = fraction.replace(/0+$/, "");
  const canonicalUnsigned = canonicalFraction ? `${integer}.${canonicalFraction}` : integer;
  return canonicalUnsigned === "0" ? "0" : `${negative ? "-" : ""}${canonicalUnsigned}`;
}
function assertDecimalEqual(actual: unknown, expected: string) {
  assert.equal(canonicalDecimal(actual), canonicalDecimal(expected));
}
async function createExactPathRule(input: {
  sourceAsset: string;
  targetAsset: string;
  sourceNetwork: string;
  targetNetwork: string;
  sourceSettlementOptionId: string;
  targetSettlementOptionId: string;
  exactRate: string;
  markupBasisPoints?: number;
}) {
  const { db, manualDeskPricingRulesTable } = await import("@workspace/db");
  const [rule] = await db.insert(manualDeskPricingRulesTable).values({
    id: randomUUID(),
    name: `Test exact path ${randomUUID()}`,
    sourceAsset: input.sourceAsset,
    targetAsset: input.targetAsset,
    sourceNetwork: input.sourceNetwork,
    targetNetwork: input.targetNetwork,
    sourceSettlementOptionId: input.sourceSettlementOptionId,
    targetSettlementOptionId: input.targetSettlementOptionId,
    exactRate: input.exactRate,
    markupBasisPoints: input.markupBasisPoints ?? 0,
    priority: 10_000,
    enabled: true,
  }).returning({ id: manualDeskPricingRulesTable.id });
  return rule!.id;
}
async function expectCode(action: () => Promise<unknown>, code: string, extra?: Partial<{ status: number; retryable: boolean; outcomeUnknown: boolean }>) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof quickex.QuickexApiError);
    assert.equal(error.code, code);
    for (const [key, value] of Object.entries(extra ?? {})) assert.equal((error as any)[key], value);
    return true;
  });
}

before(async () => {
  delete process.env.QUICKEX_CREDENTIAL_SOURCE;
  server = createServer((req, res) => void mock(req, res));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  Object.assign(process.env, {
    QUICKEX_BASE_URL: baseUrl, QUICKEX_READ_TIMEOUT_MS: "30", QUICKEX_CREATE_TIMEOUT_MS: "30",
    QUICKEX_PUBLIC_KEY: "test-public", QUICKEX_SECRET_KEY: "test-secret", SESSION_SECRET: "test-session-secret",
    ONEFORGE_API_KEY: "test-oneforge", ONEFORGE_BASE_URL: baseUrl,
    COINBASE_USD_RATES_URL: `${baseUrl}/v2/exchange-rates?currency=USD`,
    NODE_ENV: "test", LOG_LEVEL: "silent",
  });
  providerCredentials = await import("../src/lib/provider-credentials");
  providerCredentials.configureProviderCredentialStoreForTests({
    getQuickexCredentials: () => storedCredentials,
    activateQuickexCredentials: (credentials, audit, verification) => {
      credentialActivations += 1;
      lastCredentialAudit = audit;
      storedCredentials = {
        credentials,
        updatedAt: new Date(),
        verificationVersion: verification.version,
        verifiedCredentialFingerprint: verification.fingerprint,
        verifiedAt: verification.verifiedAt,
        lastTestedAt: verification.verifiedAt,
      };
      return storedCredentials;
    },
  });
  quickex = await import("../src/lib/quickex");
  tickets = await import("../src/lib/quote-ticket");
  manualDeskRates = await import("../src/lib/manual-desk-rates");
  manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
    USD: 1,
    EUR: 0.9,
    GBP: 0.8,
    AED: 3.67,
    BTC: 0.00002,
    USDT: 1,
    XRP: 2,
  }));
  await installTestPricingFallback();
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await restorePricingFallback();
  const { pool } = await import("@workspace/db");
  await pool.end();
  await privilegedTestPool.end();
});

test("Quickex logo metadata accepts only approved HTTPS image locations", () => {
  assert.equal(
    quickex.sanitizeQuickexLogoUrl("https://quickex.io/assets/coins/btc.svg"),
    "https://quickex.io/assets/coins/btc.svg",
  );
  assert.equal(
    quickex.sanitizeQuickexLogoUrl("https://s2.coinmarketcap.com/static/img/coins/64x64/1.png"),
    "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
  );
  assert.equal(quickex.sanitizeQuickexLogoUrl("http://quickex.io/assets/coins/btc.svg"), undefined);
  assert.equal(quickex.sanitizeQuickexLogoUrl("https://quickex.io.example/assets/coins/btc.svg"), undefined);
  assert.equal(quickex.sanitizeQuickexLogoUrl("https://quickex.io/untrusted/btc.svg"), undefined);
  assert.equal(quickex.sanitizeQuickexLogoUrl("not a URL"), undefined);
});

test("public catalog and quote work, and signed connection sends signed headers", async () => {
  reset();
  assert.deepEqual(await quickex.getQuickexInstruments(), catalog);
  assert.equal((await quickex.getQuickexQuote({ fromCurrency: "BTC", fromNetwork: "Bitcoin", toCurrency: "USDT", toNetwork: "TRC20", amount: 1 })).amountToGet, "99.5000");
  assert.equal((await quickex.testQuickexConnection()).ok, true);
  assert.equal(signedCalls, 1);
});

test("concurrent catalog cache misses collapse into one provider request", async () => {
  reset();
  quickex.resetQuickexInstrumentCacheForTests();
  try {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => quickex.getQuickexInstruments()),
    );
    assert.equal(instrumentCalls, 1);
    for (const result of results) assert.deepEqual(result, catalog);
    const health = quickex.getQuickexInstrumentCacheHealth();
    assert.ok(health.ageMs !== null && health.ageMs >= 0);
    assert.equal(health.stale, false);
    assert.equal(health.lastFailureAt, null);
  } finally {
    quickex.resetQuickexInstrumentCacheForTests();
  }
});

test("catalog uses last-known-good data only within the bounded stale window", async () => {
  reset();
  quickex.resetQuickexInstrumentCacheForTests();
  const originalNow = Date.now;
  const fetchedAt = originalNow();
  Date.now = () => fetchedAt;
  try {
    assert.deepEqual(await quickex.getQuickexInstruments(), catalog);
    mode = "catalogUnavailable";
    Date.now = () => fetchedAt + 6 * 60 * 1000;
    assert.deepEqual(await quickex.getQuickexInstruments(), catalog);
    const staleHealth = quickex.getQuickexInstrumentCacheHealth();
    assert.equal(staleHealth.ageMs, 6 * 60 * 1000);
    assert.equal(staleHealth.stale, true);
    assert.equal(staleHealth.lastFailureAt, new Date(Date.now()).toISOString());

    Date.now = () => fetchedAt + 21 * 60 * 1000;
    await expectCode(
      () => quickex.getQuickexInstruments(),
      "QUICKEX_PROVIDER_UNAVAILABLE",
      { retryable: true },
    );
    assert.deepEqual(quickex.getQuickexInstrumentCacheHealth(), {
      ageMs: null,
      stale: true,
      lastFailureAt: new Date(Date.now()).toISOString(),
    });
  } finally {
    Date.now = originalNow;
    reset();
    quickex.resetQuickexInstrumentCacheForTests();
  }
});

test("catalog refresh recovers from stale fallback and restores fresh health", async () => {
  reset();
  quickex.resetQuickexInstrumentCacheForTests();
  const originalNow = Date.now;
  const fetchedAt = originalNow();
  Date.now = () => fetchedAt;
  try {
    await quickex.getQuickexInstruments();
    mode = "catalogUnavailable";
    Date.now = () => fetchedAt + 6 * 60 * 1000;
    await quickex.getQuickexInstruments();
    const failureTime = quickex.getQuickexInstrumentCacheHealth().lastFailureAt;

    mode = "ok";
    Date.now = () => fetchedAt + 7 * 60 * 1000;
    assert.deepEqual(await quickex.getQuickexInstruments(), catalog);
    assert.deepEqual(quickex.getQuickexInstrumentCacheHealth(), {
      ageMs: 0,
      stale: false,
      lastFailureAt: failureTime,
    });
  } finally {
    Date.now = originalNow;
    reset();
    quickex.resetQuickexInstrumentCacheForTests();
  }
});

test("admin Convert summary reports Quickex health through cooldown and recovery", async () => {
  reset();
  quickex.resetQuickexInstrumentCacheForTests();
  const { db, operatorsTable, providerSyncStatesTable } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const { matchManualDeskPricingRule } = await import("../src/lib/manual-desk-pricing");
  const suffix = randomUUID();
  const operatorUserId = `user_summary_health_${suffix}`;
  const [operator] = await db.insert(operatorsTable).values({
    email: `summary-health-${suffix}@example.test`,
    clerkUserId: operatorUserId,
    role: "operator",
    status: "active",
    permissionAllows: ["statistics.view"],
  }).returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const originalNow = Date.now;
  const fetchedAt = originalNow();
  const summary = async () => {
    const response = await fetch(`${api.url}/admin/summary?${new URLSearchParams({
      product: "convert",
      from: "2097-01-01T00:00:00.000Z",
      to: "2097-01-02T00:00:00.000Z",
    })}`, { headers: { "x-test-clerk-user-id": operatorUserId } });
    const body = await response.json() as Record<string, any>;
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.operationalHealth;
  };

  try {
    await db.delete(providerSyncStatesTable)
      .where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    await db.insert(providerSyncStatesTable).values({
      provider: "quickex-order-reconciliation",
      lastStartedAt: new Date(fetchedAt),
      lastSucceededAt: new Date(fetchedAt),
      consecutiveFailures: 0,
      nextAttemptAt: new Date(fetchedAt + 10_000),
    });
    Date.now = () => fetchedAt;
    const healthy = await summary();
    assert.deepEqual(healthy.catalog, {
      ageMs: 0,
      stale: false,
      lastFailureAt: null,
    });
    assert.equal(healthy.providerFreshness.state, "healthy");
    assert.equal(healthy.providerFreshness.lastSucceededAt, new Date(fetchedAt).toISOString());
    assert.deepEqual(healthy.quickexReconciliation, {
      state: "healthy",
      consecutiveFailures: 0,
      freshnessMs: 0,
      lastStartedAt: new Date(fetchedAt).toISOString(),
      lastSucceededAt: new Date(fetchedAt).toISOString(),
      lastFailedAt: null,
      nextRetryAt: null,
    });

    const failedAt = new Date(fetchedAt + 60_000);
    const retryAt = new Date(fetchedAt + 6 * 60_000);
    await db.update(providerSyncStatesTable).set({
      lastStartedAt: failedAt,
      lastSucceededAt: new Date(fetchedAt - 60_000),
      lastFailedAt: failedAt,
      consecutiveFailures: 3,
      nextAttemptAt: retryAt,
    }).where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    Date.now = () => fetchedAt + 2 * 60_000;
    const coolingDown = await summary();
    assert.deepEqual(coolingDown.quickexReconciliation, {
      state: "cooling_down",
      consecutiveFailures: 3,
      freshnessMs: 3 * 60_000,
      lastStartedAt: failedAt.toISOString(),
      lastSucceededAt: new Date(fetchedAt - 60_000).toISOString(),
      lastFailedAt: failedAt.toISOString(),
      nextRetryAt: retryAt.toISOString(),
    });

    const recoveredAt = new Date(fetchedAt + 3 * 60_000);
    await db.update(providerSyncStatesTable).set({
      lastStartedAt: recoveredAt,
      lastSucceededAt: recoveredAt,
      consecutiveFailures: 0,
      nextAttemptAt: new Date(recoveredAt.getTime() + 10_000),
    }).where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    Date.now = () => recoveredAt.getTime();
    const reconciliationRecovered = await summary();
    assert.deepEqual(reconciliationRecovered.quickexReconciliation, {
      state: "healthy",
      consecutiveFailures: 0,
      freshnessMs: 0,
      lastStartedAt: recoveredAt.toISOString(),
      lastSucceededAt: recoveredAt.toISOString(),
      lastFailedAt: failedAt.toISOString(),
      nextRetryAt: null,
    });

    mode = "catalogUnavailable";
    Date.now = () => fetchedAt + 6 * 60 * 1000;
    const stale = await summary();
    assert.equal(stale.catalog.ageMs, 6 * 60 * 1000);
    assert.equal(stale.catalog.stale, true);
    assert.equal(stale.catalog.lastFailureAt, new Date(Date.now()).toISOString());
    assert.equal(stale.providerFreshness.state, "stale");
    assert.equal(stale.providerFreshness.lastFailedAt, stale.catalog.lastFailureAt);

    mode = "ok";
    Date.now = () => fetchedAt + 7 * 60 * 1000;
    const recovered = await summary();
    assert.equal(recovered.catalog.ageMs, 0);
    assert.equal(recovered.catalog.stale, false);
    assert.equal(recovered.catalog.lastFailureAt, stale.catalog.lastFailureAt);
    assert.equal(recovered.providerFreshness.state, "healthy");
    assert.equal(recovered.providerFreshness.lastFailedAt, stale.catalog.lastFailureAt);

    quickex.resetQuickexInstrumentCacheForTests();
    mode = "catalogUnavailable";
    Date.now = () => fetchedAt + 8 * 60 * 1000;
    const unavailable = await summary();
    assert.deepEqual(unavailable.catalog, {
      ageMs: null,
      stale: true,
      lastFailureAt: new Date(Date.now()).toISOString(),
    });
    assert.equal(unavailable.providerFreshness.state, "unavailable");
    assert.equal(unavailable.providerFreshness.lastSucceededAt, undefined);
    assert.equal(
      unavailable.providerFreshness.lastFailedAt,
      unavailable.catalog.lastFailureAt,
    );
  } finally {
    Date.now = originalNow;
    reset();
    quickex.resetQuickexInstrumentCacheForTests();
    await api.close();
    await db.delete(providerSyncStatesTable)
      .where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
  }
});

test("idle Quickex reconciliation records failure cooldown and successful recovery", async () => {
  reset("slowOrdersFailure");
  const { db, providerSyncStatesTable } = await import("@workspace/db");
  const { getQuickexReconciliationHealth, reconcilePendingQuickexOrders } = await import("../src/lib/quickex-order-service");
  await db.delete(providerSyncStatesTable)
    .where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));

  try {
    await assert.rejects(() => reconcilePendingQuickexOrders(0));
    const coolingDown = await getQuickexReconciliationHealth();
    assert.equal(coolingDown.state, "cooling_down");
    assert.equal(coolingDown.consecutiveFailures, 1);
    assert.equal(Boolean(coolingDown.nextRetryAt), true);

    await db.update(providerSyncStatesTable).set({
      nextAttemptAt: new Date(Date.now() - 1),
    }).where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    reset();
    assert.equal(await reconcilePendingQuickexOrders(0), 0);
    const recovered = await getQuickexReconciliationHealth();
    assert.equal(recovered.state, "healthy");
    assert.equal(recovered.consecutiveFailures, 0);
    assert.equal(recovered.freshnessMs !== null && recovered.freshnessMs < 1_000, true);
    assert.equal(recovered.nextRetryAt, null);
  } finally {
    reset();
    await db.delete(providerSyncStatesTable)
      .where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
  }
});

test("encrypted admin credentials remain authoritative after environment bootstrap", async () => {
  reset();
  storedCredentials = null;
  const environmentStatus = await quickex.getQuickexCredentialStatus();
  assert.equal(environmentStatus.credentialSource, "environment");
  assert.equal(environmentStatus.configured, true);
  assert.equal(environmentStatus.remotelyAuthenticated, false);
  assert.equal(environmentStatus.signedOrders, false);
  assert.equal(environmentStatus.canManage, false);

  const submitted = {
    publicKey: "stored-public-key",
    secretKey: "stored-secret-key",
  };
  const encrypted = providerCredentials.encryptQuickexCredentials(submitted);
  assert.equal(JSON.stringify(encrypted).includes(submitted.publicKey), false);
  assert.equal(JSON.stringify(encrypted).includes(submitted.secretKey), false);
  assert.deepEqual(
    providerCredentials.decryptQuickexCredentials(encrypted),
    submitted,
  );

  storedCredentials = {
    credentials: submitted,
    updatedAt: new Date("2026-08-25T09:00:00.000Z"),
    verificationVersion: providerCredentials.QUICKEX_VERIFICATION_VERSION,
    verifiedCredentialFingerprint:
      providerCredentials.quickexCredentialFingerprint(submitted),
    verifiedAt: new Date("2026-08-25T09:00:00.000Z"),
    lastTestedAt: new Date("2026-08-25T09:00:00.000Z"),
  };
  process.env.QUICKEX_PUBLIC_KEY = "environment-public-key";
  process.env.QUICKEX_SECRET_KEY = "environment-secret-key";
  await quickex.listQuickexOrders();
  assert.deepEqual(signedPublicKeys, [submitted.publicKey]);
  const storedStatus = await quickex.getQuickexCredentialStatus(true);
  assert.equal(storedStatus.credentialSource, "stored");
  assert.equal(storedStatus.updatedAt, "2026-08-25T09:00:00.000Z");
  assert.equal(storedStatus.canManage, true);
  assert.equal(JSON.stringify(storedStatus).includes(submitted.publicKey), false);
  assert.equal(JSON.stringify(storedStatus).includes(submitted.secretKey), false);

  process.env.QUICKEX_CREDENTIAL_SOURCE = "environment";
  signedPublicKeys = [];
  await quickex.listQuickexOrders();
  assert.deepEqual(signedPublicKeys, [submitted.publicKey]);
  const overrideStatus = await quickex.getQuickexCredentialStatus(true);
  assert.equal(overrideStatus.credentialSource, "stored");
  assert.equal(overrideStatus.updatedAt, "2026-08-25T09:00:00.000Z");
  assert.equal(overrideStatus.signedOrders, true);

  process.env.QUICKEX_PUBLIC_KEY = submitted.publicKey;
  process.env.QUICKEX_SECRET_KEY = submitted.secretKey;
  const verifiedOverrideStatus = await quickex.getQuickexCredentialStatus(true);
  assert.equal(verifiedOverrideStatus.credentialSource, "stored");
  assert.equal(verifiedOverrideStatus.remotelyAuthenticated, true);
  assert.equal(verifiedOverrideStatus.signedOrders, true);

  delete process.env.QUICKEX_CREDENTIAL_SOURCE;
  storedCredentials = null;
  process.env.QUICKEX_PUBLIC_KEY = "test-public";
  process.env.QUICKEX_SECRET_KEY = "test-secret";
});

test("credential verification rejects ambiguous signed successes and requires a rejected control signature", async () => {
  const submitted = {
    publicKey: "candidate-public-key",
    secretKey: "candidate-secret-key",
  };
  for (const ambiguousMode of ["ambiguousEmpty", "ambiguousPlausible"] as const) {
    reset(ambiguousMode);
    await expectCode(
      () => quickex.testQuickexCredentials(submitted),
      "QUICKEX_AUTH_AMBIGUOUS",
      { status: 503 },
    );
  }
  reset("formatOnlyReject");
  await expectCode(
    () => quickex.testQuickexCredentials(submitted),
    "QUICKEX_AUTH_AMBIGUOUS",
    { status: 503 },
  );
  reset("noContent");
  await expectCode(
    () => quickex.testQuickexCredentials(submitted),
    "QUICKEX_MALFORMED_RESPONSE",
    { status: 502 },
  );
  reset("auth");
  await expectCode(
    () => quickex.testQuickexCredentials(submitted),
    "QUICKEX_AUTH",
    { status: 503 },
  );
  reset();
  const verified = await quickex.testQuickexCredentials(submitted);
  assert.equal(verified.result.remotelyAuthenticated, true);
  assert.equal(verified.result.authenticationState, "verified");
  assert.equal(verified.verification.version, 1);
  assert.equal(
    verified.verification.fingerprint,
    providerCredentials.quickexCredentialFingerprint(submitted),
  );
});

test("credential bootstrap requires a fresh differential proof and fails closed", async () => {
  reset();
  credentialActivations = 0;
  const verified = await quickex.bootstrapQuickexCredentialVerification();
  assert.equal(verified, "verified");
  assert.equal(credentialActivations, 1);
  assert.equal(signedCalls, 2);
  assert.equal((await quickex.getQuickexCredentialStatus()).signedOrders, true);

  reset("auth");
  await expectCode(
    () => quickex.bootstrapQuickexCredentialVerification(),
    "QUICKEX_AUTH",
  );
  assert.equal((await quickex.getQuickexCredentialStatus()).signedOrders, false);

  reset();
  assert.equal(await quickex.bootstrapQuickexCredentialVerification(), "verified");
  assert.equal((await quickex.getQuickexCredentialStatus()).signedOrders, true);
});

test("concurrent first-time credential activations serialize into one connect audit and one rotation audit", async () => {
  const provider = `quickex-test-${randomUUID()}`;
  const operatorId = randomUUID();
  const { db, operatorAuditLogsTable, providerIntegrationsTable } =
    await import("@workspace/db");
  const audit = {
    actorClerkUserId: `user_${randomUUID()}`,
    operatorId,
    operatorEmail: `credential-audit-${randomUUID()}@example.test`,
    requestId: randomUUID(),
  };
  const first = {
    publicKey: "concurrent-public-key-one",
    secretKey: "concurrent-secret-key-one",
  };
  const second = {
    publicKey: "concurrent-public-key-two",
    secretKey: "concurrent-secret-key-two",
  };
  try {
    await Promise.all([
      providerCredentials.activateProviderCredentialsForTests(
        provider,
        first,
        audit,
      ),
      providerCredentials.activateProviderCredentialsForTests(
        provider,
        second,
        audit,
      ),
    ]);
    const integrations = await db
      .select()
      .from(providerIntegrationsTable)
      .where(eq(providerIntegrationsTable.provider, provider));
    assert.equal(integrations.length, 1);
    const serializedRow = JSON.stringify(integrations[0]);
    for (const value of [
      first.publicKey,
      first.secretKey,
      second.publicKey,
      second.secretKey,
    ]) {
      assert.equal(serializedRow.includes(value), false);
    }

    const audits = await db
      .select()
      .from(operatorAuditLogsTable)
      .where(eq(operatorAuditLogsTable.targetOperatorId, operatorId));
    assert.deepEqual(
      audits.map((entry) => entry.action).sort(),
      [
        `provider.${provider}_connected`,
        `provider.${provider}_credentials_rotated`,
      ].sort(),
    );
    assert.equal(
      JSON.stringify(audits).includes(first.secretKey) ||
        JSON.stringify(audits).includes(second.secretKey),
      false,
    );
  } finally {
    await db
      .delete(operatorAuditLogsTable)
      .where(eq(operatorAuditLogsTable.targetOperatorId, operatorId));
    await db
      .delete(providerIntegrationsTable)
      .where(eq(providerIntegrationsTable.provider, provider));
  }
});

test("owners can validate and activate Quickex credentials while operators receive safe read-only status", async () => {
  reset();
  storedCredentials = null;
  credentialActivations = 0;
  lastCredentialAudit = null;
  const { db, operatorsTable, ordersTable, quickexOrdersTable } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const suffix = randomUUID();
  const ownerUserId = `user_quickex_owner_${suffix}`;
  const operatorUserId = `user_quickex_operator_${suffix}`;
  const [owner, operator] = await db
    .insert(operatorsTable)
    .values([
      {
        email: `quickex-owner-${suffix}@example.test`,
        clerkUserId: ownerUserId,
        role: "owner",
        status: "active",
      },
      {
        email: `quickex-operator-${suffix}@example.test`,
        clerkUserId: operatorUserId,
        role: "operator",
        status: "active",
        permissionAllows: [
          "integrations.view",
          "statistics.view",
          "statistics.export",
          "orders.view",
        ],
      },
    ])
    .returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const ownerHeaders = { "x-test-clerk-user-id": ownerUserId };
  const operatorHeaders = { "x-test-clerk-user-id": operatorUserId };
  const summaryOrderIds = [
    `summary-manual-completed-${suffix}`,
    `summary-manual-pending-${suffix}`,
    `summary-manual-failed-${suffix}`,
    `summary-manual-tied-pair-${suffix}`,
  ];
  const summaryQuickexId = `summary-provider-${suffix}`;
  const directoryStatuses = [
    "awaiting deposit",
    "deposit received",
    "exchanging",
    "sending payout",
    "on hold",
    "verification required",
    "pending",
    "completed",
    "refunded",
    "expired",
    "failed",
    "cancelled",
  ];
  const directoryQuickexIds = directoryStatuses.map(
    (_, index) => `directory-provider-${index}-${suffix}`,
  );
  const submitted = {
    publicKey: "submitted-public-key",
    secretKey: "submitted-secret-key",
  };
  try {
    await db.insert(ordersTable).values([
      {
        id: summaryOrderIds[0], type: "manual", status: "completed",
        fromAsset: " usd ", fromNetwork: "Wire", toAsset: " usdt ", toNetwork: "TRC20",
        amount: "90", receiveAmount: "0.001", customerEmail: `summary-a-${suffix}@example.test`,
        customerName: "Summary A", customerClerkUserId: `summary-user-${suffix}`,
        paymentMethod: "Bank", payoutMethod: "Wallet", provider: "Manual desk",
        manualSettlementStartedAt: new Date("2098-08-02T10:00:00.000Z"),
        manualSettlementPaidAt: new Date("2098-08-02T10:30:00.000Z"),
        createdAt: new Date("2098-08-02T09:00:00.000Z"),
      },
      {
        id: summaryOrderIds[1], type: "manual", status: "pending",
        fromAsset: "USD", fromNetwork: "Wire", toAsset: "USDT", toNetwork: "TRC20",
        amount: "50", receiveAmount: "50", customerEmail: `summary-a-${suffix}@example.test`,
        customerName: "Summary A", customerClerkUserId: `summary-user-${suffix}`,
        paymentMethod: "Bank", payoutMethod: "", provider: "Manual desk",
        createdAt: new Date("2098-08-03T09:00:00.000Z"),
      },
      {
        id: summaryOrderIds[2], type: "manual", status: "failed",
        fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USD", toNetwork: "Wire",
        amount: "1", receiveAmount: "0", customerEmail: `summary-b-${suffix}@example.test`,
        customerName: "Summary B", paymentMethod: "", payoutMethod: "Wire",
        provider: "Manual desk", createdAt: new Date("2098-09-01T00:00:00.000Z"),
      },
      {
        id: summaryOrderIds[3], type: "manual", status: "pending",
        fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "BTC", toNetwork: "Bitcoin",
        amount: "90", receiveAmount: "0.001", customerEmail: `summary-b-${suffix}@example.test`,
        customerName: "Summary B", paymentMethod: "", payoutMethod: "",
        provider: "Manual desk", createdAt: new Date("2098-08-05T09:00:00.000Z"),
      },
    ]);
    await db.insert(quickexOrdersTable).values({
      legacyOrderId: summaryQuickexId,
      providerOrderId: "2098001",
      providerReference: "2098-provider-reference",
      quoteId: "historical-provider-quote",
      customerEmail: `summary-convert-${suffix}@example.test`,
      customerName: "Summary Convert",
      status: "completed",
      providerState: "completed",
      route: {
        fromAsset: "BTC", fromNetwork: "Bitcoin",
        toAsset: "USDT", toNetwork: "TRC20", rateMode: "FLOATING",
      },
      amounts: { amount: "1", receiveAmount: "50000" },
      addresses: {
        destinationAddress: "summary-destination",
        refundAddress: "summary-refund",
      },
      createdAt: new Date("2098-08-04T09:00:00.000Z"),
      updatedAt: new Date("2098-08-04T09:30:00.000Z"),
    });
    await db.insert(quickexOrdersTable).values(
      directoryStatuses.map((status, index) => ({
        legacyOrderId: directoryQuickexIds[index]!,
        quoteId: `directory-quote-${index}-${suffix}`,
        customerEmail: `directory-convert-${suffix}@example.test`,
        status,
        providerState: status,
        route: {
          fromAsset: "BTC",
          fromNetwork: "Bitcoin",
          toAsset: "USDT",
          toNetwork: "TRC20",
          rateMode: index % 2 === 0 ? "FLOATING" : "FIXED",
        },
        amounts: index % 2 === 0
          ? { amount: index + 1, receiveAmount: (index + 1) * 100 }
          : { amount: String(index + 1), receiveAmount: String((index + 1) * 100) },
        addresses: {
          destinationAddress: `directory-destination-${index}`,
          refundAddress: `directory-refund-${index}`,
        },
        createdAt: new Date(`2099-01-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`),
        updatedAt: new Date(`2099-01-${String(index + 1).padStart(2, "0")}T09:30:00.000Z`),
      })),
    );
    const summary = await fetch(`${api.url}/admin/summary?${new URLSearchParams({
      product: "swap",
      from: "2098-08-01T00:00:00.000Z",
      to: "2098-09-01T00:00:00.000Z",
    })}`, { headers: operatorHeaders });
    const summaryBody = await summary.json() as Record<string, any>;
    assert.equal(summary.status, 200, `summary: ${JSON.stringify(summaryBody)}`);
    assert.equal(summaryBody.totalOrders, 4);
    assert.equal(summaryBody.pendingOrders, 2);
    assert.equal(summaryBody.completedOrders, 1);
    assert.equal(summaryBody.failedCancelledOrders, 1);
    assert.equal(summaryBody.totalCustomers, 2);
    assert.equal(summaryBody.totalUsers, 1);
    assert.equal(summaryBody.averageCompletionTimeMinutes, 30);
    assert.equal(summaryBody.dailySeries.length, 32);
    assert.deepEqual(summaryBody.dailySeries.find((day: any) => day.date === "2098-08-03"), {
      date: "2098-08-03", orders: 1, approximateUsdVolume: 50,
    });
    assert.equal(summaryBody.valuation.status, "complete");
    assert.equal(summaryBody.valuation.valuedOrders, 4);
    assert.equal(summaryBody.topPaymentMethods[0].method, "Bank");
    assert.equal(summaryBody.topPaymentMethods[0].count, 2);
    assert.equal(summaryBody.topCurrencies.find((entry: any) => entry.currency === "BTC").count, 2);
    assert.deepEqual(summaryBody.topTradingPairs, [
      { pair: "USD/USDT", fromAsset: "USD", toAsset: "USDT", count: 2 },
      { pair: "BTC/USD", fromAsset: "BTC", toAsset: "USD", count: 1 },
      { pair: "EUR/BTC", fromAsset: "EUR", toAsset: "BTC", count: 1 },
    ]);

    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9,
    }));
    const partialValuation = await fetch(`${api.url}/admin/summary?${new URLSearchParams({
      product: "swap",
      from: "2098-08-01T00:00:00.000Z",
      to: "2098-09-01T00:00:00.000Z",
    })}`, { headers: operatorHeaders });
    const partialBody = await partialValuation.json() as Record<string, any>;
    assert.equal(partialValuation.status, 200, JSON.stringify(partialBody));
    assert.equal(partialBody.totalOrders, 4);
    assert.equal(partialBody.valuation.status, "partial");
    assert.equal(partialBody.valuation.valuedOrders, 3);
    assert.deepEqual(partialBody.valuation.unavailableCurrencies, ["BTC"]);
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));

    const convertSummary = await fetch(`${api.url}/admin/summary?${new URLSearchParams({
      product: "convert",
      from: "2098-08-01T00:00:00.000Z",
      to: "2098-08-31T23:59:59.999Z",
    })}`, { headers: operatorHeaders });
    const convertBody = await convertSummary.json() as Record<string, any>;
    assert.equal(convertSummary.status, 200, `convert summary: ${JSON.stringify(convertBody)}`);
    assert.equal(convertBody.totalOrders, 1);
    assert.equal(convertBody.averageCompletionTimeMinutes, null);
    assert.deepEqual(convertBody.topTradingPairs, [
      { pair: "BTC/USDT", fromAsset: "BTC", toAsset: "USDT", count: 1 },
    ]);

    const listedStatuses = new Set<string>();
    for (const page of [1, 2, 3]) {
      const directoryResponse = await fetch(`${api.url}/orders?${new URLSearchParams({
        type: "instant",
        archived: "active",
        customerEmail: `directory-convert-${suffix}@example.test`,
        page: String(page),
        pageSize: "5",
      })}`, { headers: operatorHeaders });
      const directoryBody = await directoryResponse.json() as Record<string, any>;
      assert.equal(directoryResponse.status, 200, JSON.stringify(directoryBody));
      assert.equal(directoryBody.total, directoryStatuses.length);
      assert.equal(directoryBody.page, page);
      for (const item of directoryBody.items) listedStatuses.add(item.status);
    }
    assert.deepEqual([...listedStatuses].sort(), [...directoryStatuses].sort());

    manualDeskRates.configureManualDeskRateAdapterForTests(async () => {
      throw new Error("rates unavailable");
    });
    const unavailableValuation = await fetch(`${api.url}/admin/summary?${new URLSearchParams({
      product: "swap",
      from: "2098-08-01T00:00:00.000Z",
      to: "2098-09-01T00:00:00.000Z",
    })}`, { headers: operatorHeaders });
    const unavailableBody = await unavailableValuation.json() as Record<string, any>;
    assert.equal(unavailableValuation.status, 200, `unavailable summary: ${JSON.stringify(unavailableBody)}`);
    assert.equal(unavailableBody.totalOrders, 4);
    assert.equal(unavailableBody.valuation.status, "unavailable");
    assert.equal(unavailableBody.valuation.valuedOrders, 0);
    assert.deepEqual(unavailableBody.valuation.unavailableCurrencies, ["BTC", "EUR", "USD"]);
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));

    const tooBroadSummary = await fetch(`${api.url}/admin/summary?${new URLSearchParams({
      product: "swap",
      from: "2097-01-01T00:00:00.000Z",
      to: "2099-01-01T00:00:00.000Z",
    })}`, { headers: operatorHeaders });
    assert.equal(tooBroadSummary.status, 400);
    assert.equal((await tooBroadSummary.json() as Record<string, any>).code, "INVALID_SUMMARY_PERIOD");

    quickex.resetQuickexInstrumentCacheForTests();
    const coldHealth = await fetch(`${api.url}/admin/summary?${new URLSearchParams({
      product: "swap",
      from: "2098-08-01T00:00:00.000Z",
      to: "2098-09-01T00:00:00.000Z",
    })}`, {
      headers: ownerHeaders,
    });
    assert.equal(coldHealth.status, 200);
    const coldHealthBody = await coldHealth.json() as {
      operationalHealth?: {
        catalog?: Record<string, unknown>;
      };
    };
    assert.deepEqual(coldHealthBody.operationalHealth?.catalog, {
      ageMs: null,
      stale: true,
      lastFailureAt: null,
    });

    const revenueParams = new URLSearchParams({
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      groupBy: "route",
      reportingCurrency: "USD",
    });
    const revenue = await fetch(
      `${api.url}/admin/manual-desk-revenue?${revenueParams}`,
      { headers: operatorHeaders },
    );
    assert.equal(revenue.status, 200);
    const revenueBody = await revenue.json() as Record<string, unknown>;
    assert.equal(revenueBody.from, "2026-08-01T00:00:00.000Z");
    assert.equal(revenueBody.to, "2026-09-01T00:00:00.000Z");
    assert.equal(revenueBody.groupBy, "route");
    assert.equal(revenueBody.reportingCurrency, "USD");

    const revenueCsv = await fetch(
      `${api.url}/admin/manual-desk-revenue.csv?${revenueParams}`,
      { headers: operatorHeaders },
    );
    assert.equal(revenueCsv.status, 200);
    assert.match(revenueCsv.headers.get("content-type") ?? "", /^text\/csv/);
    assert.match(
      revenueCsv.headers.get("content-disposition") ?? "",
      /manual-desk-revenue-2026-08-01-2026-09-01\.csv/,
    );
    const revenueCsvText = await revenueCsv.text();
    assert.match(revenueCsvText, /"filter_from","2026-08-01T00:00:00.000Z"/);
    assert.match(revenueCsvText, /"reporting_currency","USD"/);
    assert.match(revenueCsvText, /"historical_normalized_expected_fee_revenue"/);

    const invalidRevenue = await fetch(
      `${api.url}/admin/manual-desk-revenue?${new URLSearchParams({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z",
        groupBy: "route",
      })}`,
      { headers: operatorHeaders },
    );
    assert.equal(invalidRevenue.status, 400);

    for (const path of [
      "/admin/manual-desk-revenue",
      "/admin/manual-desk-revenue.csv",
    ]) {
      const impossibleDate = await fetch(
        `${api.url}${path}?${new URLSearchParams({
          from: "2026-02-31T00:00:00.000Z",
          to: "2026-03-31T00:00:00.000Z",
          groupBy: "route",
        })}`,
        { headers: operatorHeaders },
      );
      assert.equal(impossibleDate.status, 400);
    }

    const readOnlyStatus = await fetch(
      `${api.url}/quickex/admin/credentials`,
      { headers: operatorHeaders },
    );
    assert.equal(readOnlyStatus.status, 200);
    const readOnlyBody = await readOnlyStatus.json() as Record<string, unknown>;
    assert.equal(readOnlyBody.canManage, false);
    assert.equal(Object.hasOwn(readOnlyBody, "publicKey"), false);
    assert.equal(Object.hasOwn(readOnlyBody, "secretKey"), false);
    const diagnostics = await fetch(
      `${api.url}/quickex/admin/diagnostics`,
      { headers: operatorHeaders },
    );
    assert.equal(diagnostics.status, 200);
    assert.equal(JSON.stringify(await diagnostics.json()).includes("test-secret"), false);

    const forbidden = await apiJson(
      api.url,
      "/quickex/admin/credentials",
      submitted,
      "PUT",
      operatorHeaders,
    );
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, "OWNER_ACCESS_REQUIRED");
    assert.equal(credentialActivations, 0);

    reset("auth");
    storedCredentials = null;
    const rejected = await apiJson(
      api.url,
      "/quickex/admin/credentials",
      submitted,
      "PUT",
      ownerHeaders,
    );
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.code, "QUICKEX_CREDENTIALS_REJECTED");
    assert.equal(JSON.stringify(rejected.body).includes(submitted.publicKey), false);
    assert.equal(JSON.stringify(rejected.body).includes(submitted.secretKey), false);
    assert.equal(credentialActivations, 0);
    assert.equal(storedCredentials, null);

    reset();
    storedCredentials = null;
    const activated = await apiJson(
      api.url,
      "/quickex/admin/credentials",
      submitted,
      "PUT",
      ownerHeaders,
    );
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    assert.equal(activated.body.credentialSource, "stored");
    assert.equal(activated.body.canManage, true);
    assert.equal(credentialActivations, 1);
    assert.deepEqual(storedCredentials?.credentials, submitted);
    assert.equal(signedPublicKeys.at(-1), submitted.publicKey);
    assert.equal(JSON.stringify(activated.body).includes(submitted.publicKey), false);
    assert.equal(JSON.stringify(activated.body).includes(submitted.secretKey), false);
    assert.equal(lastCredentialAudit?.operatorId, owner.id);
    assert.equal(JSON.stringify(lastCredentialAudit).includes(submitted.publicKey), false);
    assert.equal(JSON.stringify(lastCredentialAudit).includes(submitted.secretKey), false);
  } finally {
    storedCredentials = null;
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
    await api.close();
    await db.delete(quickexOrdersTable)
      .where(inArray(
        quickexOrdersTable.legacyOrderId,
        [summaryQuickexId, ...directoryQuickexIds],
      ));
    await db.delete(ordersTable).where(inArray(ordersTable.id, summaryOrderIds));
    await db
      .delete(operatorsTable)
      .where(inArray(operatorsTable.id, [owner.id, operator.id]));
  }
});

test("fixed and floating modes propagate exactly and provider mismatches fail closed", async () => {
  reset();
  const fixedQuote = await quickex.getQuickexQuote({
    fromCurrency: "BTC", fromNetwork: "Bitcoin",
    toCurrency: "USDT", toNetwork: "TRC20",
    amount: 1, rateMode: "FIXED",
  });
  assert.equal(fixedQuote.rateMode, "FIXED");
  assert.deepEqual(requestedRateModes, ["FIXED"]);

  await quickex.createQuickexOrder({ ...input(), quote: fixedQuote, rateMode: "FIXED" });
  assert.equal(createPayloads[0]?.rateMode, "FIXED");
  assert.equal("userEmail" in (createPayloads[0] ?? {}), false);

  reset("mismatchedRateMode");
  await expectCode(() => quickex.getQuickexQuote({
    fromCurrency: "BTC", fromNetwork: "Bitcoin",
    toCurrency: "USDT", toNetwork: "TRC20",
    amount: 1, rateMode: "FIXED",
  }), "QUICKEX_RATE_MODE_UNAVAILABLE", { status: 422, outcomeUnknown: false });
  assert.equal(createCalls, 0);
});

test("order creation omits optional refund details when no refund wallet is supplied", async () => {
  reset();
  const withoutRefund = { ...input(), refundAddress: undefined, refundMemo: undefined };
  await quickex.createQuickexOrder(withoutRefund);
  assert.equal("refundAddress" in (createPayloads[0] ?? {}), false);
  assert.equal("refundAddressMemo" in (createPayloads[0] ?? {}), false);
});

test("authorization and customer validation errors are safe and stable", async () => {
  reset("auth");
  await expectCode(() => quickex.createQuickexOrder(input()), "QUICKEX_AUTH", { status: 503 });
  reset();
  await quickex.validateQuickexAddress({
    currencyTitle: "USDT",
    networkTitle: "TRC20",
    address: "destination-exact",
  });
  assert.equal(addressValidationCalls, 1);
  reset("authHtml");
  await expectCode(() => quickex.listQuickexOrders(), "QUICKEX_ACCESS_BLOCKED", { status: 503 });
  reset("validationForbidden");
  await quickex.validateQuickexAddress({
    currencyTitle: "USDT",
    networkTitle: "TRC20",
    address: "destination-exact",
  });
  assert.equal(addressValidationCalls, 1);
  await quickex.createQuickexOrder(input());
  assert.equal(createCalls, 1);
  reset("address");
  await expectCode(() => quickex.createQuickexOrder(input()), "QUICKEX_INVALID_ADDRESS", { status: 400, retryable: false });
  reset("memo");
  await expectCode(() => quickex.createQuickexOrder(input()), "QUICKEX_INVALID_MEMO", { status: 400, retryable: false });
});

test("Convert aborts before provider creation when runtime proof changes in flight", async () => {
  reset("proofInvalidatedBeforeCreate");
  quickex.acceptQuickexRuntimeVerification({
    version: providerCredentials.QUICKEX_VERIFICATION_VERSION,
    fingerprint: providerCredentials.quickexCredentialFingerprint({
      publicKey: "test-public",
      secretKey: "test-secret",
    }),
  });
  await expectCode(
    () => quickex.createQuickexOrder(input()),
    "QUICKEX_NOT_CONFIGURED",
    { status: 503 },
  );
  assert.equal(createCalls, 0);
});

test("rate-limited reads and creates never amplify the provider cooldown", async () => {
  reset("rateRead");
  await expectCode(
    () => quickex.getQuickexQuote({ fromCurrency: "BTC", fromNetwork: "Bitcoin", toCurrency: "USDT", toNetwork: "TRC20", amount: 1 }),
    "QUICKEX_RATE_LIMITED",
    { retryable: true },
  );
  assert.equal(quoteCalls, 1);
  reset("rateCreate");
  await expectCode(() => quickex.createQuickexOrder(input()), "QUICKEX_RATE_LIMITED", { retryable: true });
  assert.equal(createCalls, 1);
});

test("provider, malformed, network, and timeout failures are classified safely", async () => {
  reset("fiveHundred");
  await expectCode(() => quickex.getQuickexQuote({ fromCurrency: "BTC", fromNetwork: "Bitcoin", toCurrency: "USDT", toNetwork: "TRC20", amount: 1 }), "QUICKEX_PROVIDER_UNAVAILABLE", { retryable: true });
  reset("badJson");
  await expectCode(() => quickex.getQuickexQuote({ fromCurrency: "BTC", fromNetwork: "Bitcoin", toCurrency: "USDT", toNetwork: "TRC20", amount: 1 }), "QUICKEX_MALFORMED_RESPONSE");
  reset("badBody");
  await expectCode(() => quickex.getQuickexQuote({ fromCurrency: "BTC", fromNetwork: "Bitcoin", toCurrency: "USDT", toNetwork: "TRC20", amount: 1 }), "QUICKEX_MALFORMED_RESPONSE");
  process.env.QUICKEX_BASE_URL = "http://127.0.0.1:1";
  await expectCode(() => quickex.getQuickexQuote({ fromCurrency: "BTC", fromNetwork: "Bitcoin", toCurrency: "USDT", toNetwork: "TRC20", amount: 1 }), "QUICKEX_NETWORK", { retryable: true });
  reset("slow");
  await expectCode(() => quickex.getQuickexQuote({ fromCurrency: "BTC", fromNetwork: "Bitcoin", toCurrency: "USDT", toNetwork: "TRC20", amount: 1 }), "QUICKEX_TIMEOUT", { retryable: true });
  for (const failure of ["fiveHundred", "badJson", "badBody", "missingSlow"] as MockMode[]) {
    reset(failure);
    await expectCode(() => quickex.createQuickexOrder(input()), failure === "fiveHundred" ? "QUICKEX_PROVIDER_UNAVAILABLE" : failure === "missingSlow" ? "QUICKEX_TIMEOUT" : "QUICKEX_MALFORMED_RESPONSE", { retryable: false, outcomeUnknown: true });
    assert.equal(createCalls, 1);
  }
});

test("order lists preserve exact references, accept numeric-string IDs, and map states", async () => {
  reset();
  providerOrders = [order({ orderId: "7001", amountToGet: "-1" })];
  const [numericStringOrder] = await quickex.listQuickexOrders();
  assert.equal(numericStringOrder?.orderId, 7001);
  assert.equal(typeof numericStringOrder?.orderId, "number");
  assert.equal(numericStringOrder?.providerReference, "provider-reference-7001");
  assert.equal(numericStringOrder?.amountToGet, "-1");

  assert.equal(quickex.mapQuickexState("unrecognized future state"), "pending");
  assert.equal(quickex.mapQuickexState("failed", true), "completed");
});

test("quote tickets reject tampering, mismatch, and expiry", () => {
  const base = { v: 1 as const, type: "instant" as const, fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20", amount: 1, receiveAmount: 2, rate: 2, fee: 0, provider: "Quickex", expiresAt: Date.now() + 10_000, rateMode: "FIXED" as const };
  const ticket = tickets.signQuoteTicket(base);
  assert.throws(() => tickets.verifyQuoteTicket(`${ticket}x`, base), { code: "QUOTE_INVALID" });
  assert.throws(() => tickets.verifyQuoteTicket(ticket, { ...base, amount: 2 }), { code: "QUOTE_MISMATCH" });
  assert.throws(() => tickets.verifyQuoteTicket(ticket, { ...base, rateMode: "FLOATING" }), { code: "QUOTE_MISMATCH" });
  assert.throws(() => tickets.verifyQuoteTicket(tickets.signQuoteTicket({ ...base, expiresAt: Date.now() - 1 }), base), { code: "QUOTE_EXPIRED" });
});

test("Convert creation enforces required provider memos before submission", async () => {
  reset("memo");
  const service = await import("../src/lib/quickex-order-service");
  const { cryptoAssetNetworksTable, db } = await import("@workspace/db");
  const originals = await db.select().from(cryptoAssetNetworksTable)
    .where(inArray(cryptoAssetNetworksTable.id, ["btc-bitcoin", "xrp-xrpl"]));
  await db.update(cryptoAssetNetworksTable).set({ executionMode: "api", enabled: true })
    .where(inArray(cryptoAssetNetworksTable.id, ["btc-bitcoin", "xrp-xrpl"]));
  const quickexQuote = {
    ...quote,
    instrumentTo: {
      currencyTitle: "XRP",
      networkTitle: "Ripple",
      slug: "xrp-ripple",
      precisionDecimals: 8,
    },
  };
  const quoteId = tickets.signQuoteTicket({
    v: 2,
    type: "instant",
    fromAsset: "BTC",
    fromNetwork: "Bitcoin",
    toAsset: "XRP",
    toNetwork: "Ripple",
    amount: 1,
    receiveAmount: 99.5,
    rate: 99.5,
    fee: 0,
    provider: "Quickex",
    sourceSettlementOptionId: "api:quickex:btc-bitcoin",
    targetSettlementOptionId: "api:quickex:xrp-xrpl",
    expiresAt: Date.now() + 60_000,
    rateMode: "FLOATING",
    quickexQuote,
  });
  try {
    await assert.rejects(
      service.createQuickexConvertOrder({
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "XRP",
      toNetwork: "Ripple",
      amount: 1,
      rateMode: "FLOATING",
      destinationAddress: "xrp-destination",
      refundAddress: "btc-refund",
      customerEmail: "memo-required@example.test",
      clientRequestId: randomUUID(),
      quoteId,
      }),
      { code: "QUICKEX_MEMO_REQUIRED" },
    );
    assert.equal(createCalls, 0);
  } finally {
    for (const original of originals) {
      await db.update(cryptoAssetNetworksTable).set({
        executionMode: original.executionMode,
        enabled: original.enabled,
      }).where(eq(cryptoAssetNetworksTable.id, original.id));
    }
    reset();
  }
});

test("expanded settlement fields filter by direction and validate modern types fail-closed", async () => {
  const methods = await import("../src/lib/payment-methods");
  assert.deepEqual(methods.assignAutomaticFieldDefinitionKeys([
    { key: "legacy_account", type: "account-number", label: "Bank Account", direction: "send" },
    { key: "__auto__receive_1", type: "account-number", label: "Bank Account", direction: "receive" },
    { type: "email", label: "Émail", direction: "receive" },
    { type: "short-text", label: "123 reference", direction: "send" },
  ]), [
    { key: "legacy_account", type: "account-number", label: "Bank Account", direction: "send" },
    { key: "bank_account", type: "account-number", label: "Bank Account", direction: "receive" },
    { key: "email", type: "email", label: "Émail", direction: "receive" },
    { key: "field_123_reference", type: "short-text", label: "123 reference", direction: "send" },
  ]);
  assert.deepEqual(methods.assignAutomaticFieldDefinitionKeys([
    { key: "", type: "short-text", label: "Payment Reference" },
    { key: "", type: "short-text", label: "Payment Reference" },
  ]).map(field => field.key), ["payment_reference", "payment_reference_2"]);
  const malformedFieldBody = { fieldDefinitions: [null] };
  assert.equal(
    methods.assignAutomaticPaymentMethodFieldKeys(malformedFieldBody),
    malformedFieldBody,
  );

  const schema = methods.validateSafeFieldDefinitions([
    { key: "iban", type: "account-iban", label: "IBAN", direction: "receive", required: true },
    { key: "count", type: "integer", label: "Count", direction: "send", min: 1, max: 4 },
    { key: "email", type: "email", label: "Email", direction: "both" },
  ]);
  assert.equal(schema[0]?.direction, "receive");
  assert.deepEqual(methods.validateSettlementDetails(schema, {
    iban: "GB82WEST12345698765432", count: 2, email: "person@example.test",
  }), { iban: "GB82WEST12345698765432", count: 2, email: "person@example.test" });
  assert.throws(() => methods.validateSettlementDetails(schema, {
    iban: "bad", count: 1.5, email: "bad",
  }), { code: "SETTLEMENT_DETAILS_INVALID" });
  assert.throws(() => methods.validateSettlementDetails([
    { key: "proof", type: "private-image", label: "Proof", required: true },
  ], { proof: "/objects/customer-upload" }), { code: "PRIVATE_IMAGE_UNAVAILABLE" });

  const conditional = methods.validateSafeFieldDefinitions([
    {
      key: "account_kind",
      type: "select",
      label: "Account kind",
      required: true,
      options: [
        { value: "iban", label: "IBAN" },
        { value: "local", label: "Local account" },
      ],
    },
    {
      key: "routing_number",
      type: "routing-number",
      label: "Routing number",
      requiredWhen: { fieldKey: "account_kind", equals: "local" },
    },
  ]);
  assert.deepEqual(methods.validateSettlementDetails(conditional, {
    account_kind: "iban",
  }), { account_kind: "iban", routing_number: null });
  assert.throws(() => methods.validateSettlementDetails(conditional, {
    account_kind: "local",
  }), { code: "SETTLEMENT_DETAILS_REQUIRED" });
  assert.throws(() => methods.validateSettlementDetails(conditional, {
    account_kind: "iban",
    routing_number: "123456",
  }), { code: "SETTLEMENT_DETAILS_INVALID" });
  assert.throws(() => methods.validateSafeFieldDefinitions([
    { key: "card_number", type: "account-number", label: "Card number" },
  ]), { code: "UNSAFE_SETTLEMENT_FIELD" });
  assert.throws(() => methods.validateSafeFieldDefinitions([
    { key: "recipient_reference", type: "short-text", label: "Authentication code" },
  ]), { code: "UNSAFE_SETTLEMENT_FIELD" });
  const innocuousAccount = [
    { key: "recipient_reference", type: "account-number" as const, label: "Recipient reference" },
  ];
  assert.throws(() => methods.validateSettlementDetails(innocuousAccount, {
    recipient_reference: "4242 4242 4242 4242",
  }), { code: "UNSAFE_SETTLEMENT_DETAIL" });
  assert.throws(() => methods.validateSettlementDetails(innocuousAccount, {
    recipient_reference: "0".repeat(64),
  }), { code: "UNSAFE_SETTLEMENT_DETAIL" });
  assert.throws(() => methods.validateSettlementDetails(innocuousAccount, {
    recipient_reference: `tprv${"1".repeat(60)}`,
  }), { code: "UNSAFE_SETTLEMENT_DETAIL" });
  assert.throws(() => methods.validateSettlementDetails(innocuousAccount, {
    recipient_reference: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima",
  }), { code: "UNSAFE_SETTLEMENT_DETAIL" });
  assert.throws(() => methods.validateSettlementDetails([
    { key: "recipient_reference", type: "integer", label: "Recipient reference" },
  ], {
    recipient_reference: 4242424242424242,
  }), { code: "UNSAFE_SETTLEMENT_DETAIL" });
  assert.throws(() => methods.validateSafeFieldDefinitions([
    {
      key: "routing_number",
      type: "routing-number",
      label: "Routing number",
      requiredWhen: { fieldKey: "missing_kind", equals: "local" },
    },
  ]), { code: "INVALID_SETTLEMENT_FIELD" });
});

test("global catalog covers representative worldwide fiat, rail, and network records", async () => {
  const catalog = await import("../src/lib/global-payment-catalog");
  const fiatCodes = new Set(catalog.FIAT_CURRENCY_CATALOG.map((item) => item.code));
  for (const code of ["USD", "EUR", "KZT", "UAH", "KES", "INR", "BRL", "MXN"]) {
    assert.ok(fiatCodes.has(code), `${code} should exist in the fiat catalog`);
  }
  const methods = new Map(catalog.PAYMENT_METHOD_CATALOG.map((item) => [item.id, item]));
  for (const id of [
    "swift-bank-transfer", "sepa-transfer", "revolut-eur", "revolut-usd",
    "volet", "neteller", "zelle", "visa-kzt", "visa-uah", "mpesa-kenya",
    "pix", "spei", "upi", "payid-npp",
  ]) {
    assert.ok(methods.has(id), `${id} should exist in the payment method catalog`);
  }
  assert.deepEqual(methods.get("visa-kzt")?.compatibleCurrencyCodes, ["KZT"]);
  assert.equal(methods.get("visa-kzt")?.direction, "receive");
  assert.deepEqual(methods.get("visa-uah")?.countries, ["UA"]);
  for (const id of [
    "paysera", "bunq", "bbva", "icard",
    "bnp-paribas", "ing", "commerzbank", "caixabank",
  ]) {
    const method = methods.get(id);
    assert.ok(method, `${id} should exist in the payment method catalog`);
    assert.deepEqual(method.compatibleCurrencyCodes, ["EUR"]);
    assert.deepEqual(
      method.fields.map((field) => ({
        key: field.key,
        required: field.required,
      })),
      [
        { key: "name", required: true },
        { key: "iban", required: true },
        { key: "tag", required: false },
        { key: "payment_description", required: true },
        { key: "telegram_or_whatsapp", required: true },
      ],
    );
  }
  assert.ok(catalog.CRYPTO_NETWORK_CATALOG.some(
    (network) => network.assetId === "usdt" && network.networkCode === "TRC20",
  ));
  assert.ok(catalog.CRYPTO_NETWORK_CATALOG.some(
    (network) => network.assetId === "usdc" && network.networkCode === "SPL",
  ));
  assert.ok(catalog.CRYPTO_ASSET_CATALOG.some(
    (asset) =>
      asset.id === "xmr" &&
      asset.code === "XMR" &&
      asset.name === "Monero" &&
      asset.decimals === 12,
  ));
  assert.ok(catalog.CRYPTO_NETWORK_CATALOG.some(
    (network) =>
      network.id === "xmr-monero" &&
      network.assetId === "xmr" &&
      network.networkCode === "XMR" &&
      network.networkName === "Monero" &&
      network.decimals === 12,
  ));
});

test("deleted fiat currencies stay deleted when catalog lists are reloaded", async () => {
  const { db, fiatCurrenciesTable } = await import("@workspace/db");
  const { listFiatCurrencies, listEnabledFiatCurrencies } = await import("../src/lib/fiat-currencies");
  const code = `T${randomUUID().replaceAll("-", "").slice(0, 2).toUpperCase()}`;
  const [fixture] = await db.insert(fiatCurrenciesTable).values({
    code,
    name: "Deletion persistence test",
    network: "test",
    precision: 2,
    enabled: true,
  }).returning({ id: fiatCurrenciesTable.id });
  assert.ok(fixture);
  try {
    await db.delete(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.id, fixture.id));
    assert.equal((await listFiatCurrencies()).some((item) => item.code === code), false);
    assert.equal((await listEnabledFiatCurrencies()).some((item) => item.code === code), false);
  } finally {
    await db.delete(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.id, fixture.id));
  }
});

test("catalog and API execution modes never enter the manual settlement route", async () => {
  const api = await startApi();
  const {
    cryptoAssetNetworksTable,
    db,
    fiatCurrenciesTable,
    fiatCurrencyPaymentMethodsTable,
    paymentMethodsTable,
  } = await import("@workspace/db");
  const fiatMethods = await import("../src/lib/payment-methods");
  const cryptoMethods = await import("../src/lib/manual-crypto");
  const methodId = `api-only-${randomUUID()}`;
  const [usd] = await db.select().from(fiatCurrenciesTable)
    .where(eq(fiatCurrenciesTable.code, "USD")).limit(1);
  assert.ok(usd);
  const [network] = await db.select().from(cryptoAssetNetworksTable)
    .where(eq(cryptoAssetNetworksTable.id, "btc-bitcoin")).limit(1);
  assert.ok(network);
  try {
    await db.insert(paymentMethodsTable).values({
      id: methodId,
      name: "Unmapped API only",
      family: "bank-transfer",
      executionMode: "api",
      requiresProviderConfiguration: false,
      enabled: true,
      canSend: true,
      canReceive: true,
      fieldDefinitions: [],
    });
    await db.insert(fiatCurrencyPaymentMethodsTable).values({
      fiatCurrencyId: usd.id,
      paymentMethodId: methodId,
      enabled: true,
      canSend: true,
      canReceive: true,
    });
    assert.equal(
      (await fiatMethods.listPublicFiatSettlementOptions())
        .some((option) => option.paymentMethodId === methodId),
      false,
    );

    await db.update(cryptoAssetNetworksTable)
      .set({ enabled: true, executionMode: "api" })
      .where(eq(cryptoAssetNetworksTable.id, network.id));
    assert.equal(
      (await cryptoMethods.listPublicManualCryptoSettlementOptions())
        .some((option) => option.networkSlug === network.id),
      false,
    );
    const legacyInput = {
      type: "manual",
      fromAsset: "USD",
      fromNetwork: "Bank transfer",
      toAsset: "BTC",
      toNetwork: "Bitcoin",
      amount: 100,
    };
    const apiModeQuote = await apiJson(api.url, "/exchange/quote", legacyInput);
    assert.equal(apiModeQuote.status, 422);
    assert.equal(apiModeQuote.body.code, "DESK_ROUTE_INVALID");

    await db.update(cryptoAssetNetworksTable)
      .set({ executionMode: "catalog" })
      .where(eq(cryptoAssetNetworksTable.id, network.id));
    const catalogModeQuote = await apiJson(api.url, "/exchange/quote", legacyInput);
    assert.equal(catalogModeQuote.status, 422);
    assert.equal(catalogModeQuote.body.code, "DESK_ROUTE_INVALID");
  } finally {
    await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.id, methodId));
    await db.update(cryptoAssetNetworksTable)
      .set({ enabled: network.enabled, executionMode: network.executionMode })
      .where(eq(cryptoAssetNetworksTable.id, network.id));
    await api.close();
  }
});

test("the capability registry exposes executable mapped networks without removing them from manual Swap", async () => {
  reset();
  const api = await startApi();
  const {
    cryptoAssetNetworksTable,
    cryptoAssetsTable,
    db,
    quickexOrdersTable,
  } = await import("@workspace/db");
  const [btc] = await db.select().from(cryptoAssetNetworksTable)
    .where(eq(cryptoAssetNetworksTable.id, "btc-bitcoin")).limit(1);
  const [usdt] = await db.select().from(cryptoAssetNetworksTable)
    .where(eq(cryptoAssetNetworksTable.id, "usdt-trc20")).limit(1);
  assert.ok(btc && usdt);
  const unmappedAssetId = `unmapped-${randomUUID()}`;
  const unmappedNetworkId = `unmapped-${randomUUID()}`;
  const requestId = requestIdForTest(49);
  try {
    await db.update(cryptoAssetNetworksTable).set({ executionMode: "api", enabled: true })
      .where(eq(cryptoAssetNetworksTable.id, btc.id));
    await db.update(cryptoAssetNetworksTable).set({ executionMode: "api", enabled: true })
      .where(eq(cryptoAssetNetworksTable.id, usdt.id));
    await db.insert(cryptoAssetsTable).values({
      id: unmappedAssetId,
      code: "ZZZ",
      name: "Unmapped test asset",
      decimals: 8,
      enabled: true,
    });
    await db.insert(cryptoAssetNetworksTable).values({
      id: unmappedNetworkId,
      assetId: unmappedAssetId,
      networkCode: "UNMAPPED",
      networkName: "Unmapped",
      decimals: 8,
      executionMode: "api",
      enabled: true,
    });

    const config = await (await fetch(`${api.url}/exchange/config`)).json() as {
      instantSettlementOptions: Array<Record<string, unknown>>;
      providers: string[];
    };
    assert.deepEqual(
      config.instantSettlementOptions.map(option => option.id).sort(),
      ["api:quickex:btc-bitcoin", "api:quickex:usdt-trc20"],
    );
    assert.deepEqual(config.providers, ["Manual desk", "Quickex"]);
    assert.equal(
      config.instantSettlementOptions.some(option => option.id === `api:quickex:${unmappedNetworkId}`),
      false,
    );
    const convertConfig = await (await fetch(`${api.url}/quickex/config`)).json() as {
      instruments: Array<{ currencyTitle: string; networkTitle: string }>;
      pairs: Array<{ fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string }>;
    };
    assert.deepEqual(convertConfig.instruments.map(instrument =>
      `${instrument.currencyTitle}:${instrument.networkTitle}`
    ).sort(), ["BTC:Bitcoin", "USDT:TRC20"]);
    assert.deepEqual(convertConfig.pairs, [{
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
    }]);

    const quoteInput = {
      type: "instant",
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: 1,
      rateMode: "FLOATING",
      sourceSettlementOptionId: "api:quickex:btc-bitcoin",
      targetSettlementOptionId: "api:quickex:usdt-trc20",
    };
    const quote = await apiJson(api.url, "/exchange/quote", quoteInput);
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    assert.equal(quote.body.provider, "Quickex");
    assert.equal(quote.body.sourceSettlementOptionId, quoteInput.sourceSettlementOptionId);

    const order = await apiJson(api.url, "/exchange/orders", {
      ...quoteInput,
      quoteId: quote.body.quoteId,
      destinationAddress: "registry-destination",
      refundAddress: "registry-refund",
      customerEmail: `registry-${randomUUID()}@example.test`,
      clientRequestId: requestId,
    });
    assert.equal(
      order.status,
      201,
      JSON.stringify({ body: order.body, createCalls }),
    );
    assert.equal(order.body.provider, "Quickex");
    assert.equal(order.body.providerOrderId, "800");
    assert.equal(createCalls, 1);
    const repeat = await apiJson(api.url, "/exchange/orders", {
      ...quoteInput,
      quoteId: quote.body.quoteId,
      destinationAddress: "registry-destination",
      refundAddress: "registry-refund",
      customerEmail: order.body.customerEmail,
      clientRequestId: requestId,
    });
    assert.equal(repeat.status, 200);
    assert.equal(repeat.body.id, order.body.id);
    assert.equal(createCalls, 1);

    storedCredentials = null;
    const publicKey = process.env.QUICKEX_PUBLIC_KEY;
    const secretKey = process.env.QUICKEX_SECRET_KEY;
    delete process.env.QUICKEX_PUBLIC_KEY;
    delete process.env.QUICKEX_SECRET_KEY;
    try {
      const unavailable = await (await fetch(`${api.url}/exchange/config`)).json() as {
        instantSettlementOptions: unknown[];
      };
      assert.deepEqual(unavailable.instantSettlementOptions, []);
      const rejected = await apiJson(api.url, "/exchange/quote", quoteInput);
      assert.equal(rejected.status, 422);
      assert.equal(rejected.body.code, "PROVIDER_ROUTE_UNAVAILABLE");
      const replay = await apiJson(api.url, "/exchange/orders", {
        ...quoteInput,
        quoteId: quote.body.quoteId,
        destinationAddress: "registry-destination",
        refundAddress: "registry-refund",
        customerEmail: order.body.customerEmail,
        clientRequestId: requestId,
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.id, order.body.id);
      assert.equal(createCalls, 1);
    } finally {
      if (publicKey) process.env.QUICKEX_PUBLIC_KEY = publicKey;
      if (secretKey) process.env.QUICKEX_SECRET_KEY = secretKey;
    }

    reset("pairUnavailable");
    quickex.resetQuickexInstrumentCacheForTests();
    const noPairsResponse = await fetch(`${api.url}/exchange/config`);
    const noPairs = await noPairsResponse.json() as {
      instantSettlementOptions: unknown[];
      providers: string[];
    };
    assert.equal(noPairsResponse.status, 200, JSON.stringify(noPairs));
    assert.deepEqual(noPairs.instantSettlementOptions, []);
    assert.equal(noPairs.providers.includes("Quickex"), false);
    const unavailableConfigResponse = await fetch(`${api.url}/quickex/config`);
    const unavailableConfig = await unavailableConfigResponse.json() as {
      instruments: unknown[];
      pairs: unknown[];
    };
    assert.equal(unavailableConfigResponse.status, 503);
    const unavailablePairsResponse = await fetch(
      `${api.url}/quickex/pairs?fromAsset=BTC&fromNetwork=Bitcoin`,
    );
    const unavailablePairs = await unavailablePairsResponse.json() as { code: string };
    assert.equal(unavailablePairsResponse.status, 503);
    assert.equal(unavailablePairs.code, "QUICKEX_PROVIDER_UNAVAILABLE");
    const pairRejected = await apiJson(api.url, "/exchange/quote", quoteInput);
    assert.equal(pairRejected.status, 503);
    assert.equal(pairRejected.body.code, "QUICKEX_PROVIDER_UNAVAILABLE");
  } finally {
    await db.delete(quickexOrdersTable).where(eq(quickexOrdersTable.clientRequestId, requestId));
    await db.delete(cryptoAssetsTable).where(eq(cryptoAssetsTable.id, unmappedAssetId));
    await db.update(cryptoAssetNetworksTable).set({
      executionMode: btc.executionMode,
      enabled: btc.enabled,
    }).where(eq(cryptoAssetNetworksTable.id, btc.id));
    await db.update(cryptoAssetNetworksTable).set({
      executionMode: usdt.executionMode,
      enabled: usdt.enabled,
    }).where(eq(cryptoAssetNetworksTable.id, usdt.id));
    reset();
    quickex.resetQuickexInstrumentCacheForTests();
    await api.close();
  }
});

test("provider-only Quickex instruments remain available without entering the manual catalog", async () => {
  reset("expandedCatalog");
  quickex.resetQuickexInstrumentCacheForTests();
  const api = await startApi();
  const sourceSettlementOptionId = "api:quickex:instrument:qxt-quickex-testnet";
  try {
    const quickexConfig = await (await fetch(`${api.url}/quickex/config`)).json() as {
      instruments: Array<{ currencyTitle: string; networkTitle: string; slug: string }>;
      pairs: Array<{ fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string }>;
    };
    assert.ok(quickexConfig.instruments.some(item =>
      item.slug === providerOnlyInstrument.slug &&
      item.currencyTitle === providerOnlyInstrument.currencyTitle &&
      item.networkTitle === providerOnlyInstrument.networkTitle
    ));
    assert.ok(quickexConfig.pairs.some(pair =>
      pair.fromAsset === providerOnlyInstrument.currencyTitle &&
      pair.fromNetwork === providerOnlyInstrument.networkTitle &&
      pair.toAsset === "BTC" &&
      pair.toNetwork === "Bitcoin"
    ));
    const quickexPairs = await (await fetch(
      `${api.url}/quickex/pairs?fromAsset=${encodeURIComponent(providerOnlyInstrument.currencyTitle)}&fromNetwork=${encodeURIComponent(providerOnlyInstrument.networkTitle)}`,
    )).json() as Array<{ fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string }>;
    assert.ok(quickexPairs.some(pair =>
      pair.fromAsset === providerOnlyInstrument.currencyTitle &&
      pair.fromNetwork === providerOnlyInstrument.networkTitle &&
      pair.toAsset === "BTC" &&
      pair.toNetwork === "Bitcoin"
    ));

    const exchangeConfig = await (await fetch(`${api.url}/exchange/config`)).json() as {
      instantSettlementOptions: Array<{ id: string; assetCode: string; routeNetwork: string }>;
      manualSettlementOptions: Array<{ id: string }>;
    };
    assert.ok(exchangeConfig.instantSettlementOptions.some(option =>
      option.id === sourceSettlementOptionId &&
      option.assetCode === providerOnlyInstrument.currencyTitle &&
      option.routeNetwork === providerOnlyInstrument.networkTitle
    ));
    assert.equal(
      exchangeConfig.manualSettlementOptions.some(option => option.id === sourceSettlementOptionId),
      false,
    );

    const quoteInput = {
      type: "instant",
      fromAsset: providerOnlyInstrument.currencyTitle,
      fromNetwork: providerOnlyInstrument.networkTitle,
      toAsset: "BTC",
      toNetwork: "Bitcoin",
      amount: 1,
      rateMode: "FLOATING",
      sourceSettlementOptionId,
      targetSettlementOptionId: "api:quickex:btc-bitcoin",
    };
    const quoteResponse = await apiJson(api.url, "/exchange/quote", quoteInput);
    assert.equal(quoteResponse.status, 200);
    assert.equal(quoteResponse.body.provider, "Quickex");
    assert.equal(quoteResponse.body.sourceSettlementOptionId, sourceSettlementOptionId);

    const tampered = await apiJson(api.url, "/exchange/quote", {
      ...quoteInput,
      sourceSettlementOptionId: "api:quickex:instrument:tampered",
    });
    assert.equal(tampered.status, 422);
    assert.equal(tampered.body.code, "PROVIDER_ROUTE_UNAVAILABLE");
  } finally {
    reset();
    quickex.resetQuickexInstrumentCacheForTests();
    await api.close();
  }
});

async function startApi() {
  const { default: app } = await import("../src/app");
  const api = app.listen(0, "127.0.0.1");
  await once(api, "listening");
  const address = api.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api`;
  return {
    url,
    close: () => new Promise<void>((resolve, reject) => api.close(error => error ? reject(error) : resolve())),
  };
}
async function apiJson(
  url: string,
  path: string,
  body: Record<string, unknown>,
  method = "POST",
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${url}${path}`, {
    method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
async function instantQuote(url: string, rateMode: "FLOATING" | "FIXED" = "FLOATING") {
  return apiJson(url, "/quickex/quote", {
    type: "instant", fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20", amount: 1,
    rateMode,
  });
}

test("Quickex namespace owns signed quotes, orders, tracking, and idempotency", async () => {
  reset();
  const api = await startApi();
  const { resetQuickexOrderSnapshotForTests } = await import("../src/lib/quickex-order-service");
  const { cryptoAssetNetworksTable, db, providerSyncStatesTable, quickexOrdersTable, ordersTable } = await import("@workspace/db");
  const originals = await db.select().from(cryptoAssetNetworksTable)
    .where(inArray(cryptoAssetNetworksTable.id, ["btc-bitcoin", "usdt-trc20"]));
  const requestId = requestIdForTest(50);
  const uncertainRequestId = requestIdForTest(51);
  const input = {
    type: "instant",
    fromAsset: "BTC", fromNetwork: "Bitcoin",
    toAsset: "USDT", toNetwork: "TRC20", amount: 1, rateMode: "FLOATING",
    destinationAddress: "quickex-destination", refundAddress: "quickex-refund",
    customerEmail: `quickex-${randomUUID()}@example.test`,
    clientRequestId: requestId,
  };
  try {
    await db.update(cryptoAssetNetworksTable).set({ executionMode: "api", enabled: true })
      .where(inArray(cryptoAssetNetworksTable.id, ["btc-bitcoin", "usdt-trc20"]));
    const exchangeConfig = await (await fetch(`${api.url}/exchange/config`)).json() as {
      instantSettlementOptions: unknown[];
    };
    assert.ok(exchangeConfig.instantSettlementOptions.length >= 2);
    assert.equal((await apiJson(api.url, "/exchange/quote", input)).status, 200);

    const config = await (await fetch(`${api.url}/quickex/config`)).json() as {
      pairs: Array<Record<string, string>>;
    };
    assert.ok(config.pairs.some(pair =>
      pair.fromAsset === "BTC" &&
      pair.fromNetwork === "Bitcoin" &&
      pair.toAsset === "USDT" &&
      pair.toNetwork === "TRC20"
    ));
    const sourcePairs = await (await fetch(
      `${api.url}/quickex/pairs?fromAsset=BTC&fromNetwork=Bitcoin`,
    )).json() as Array<Record<string, string>>;
    assert.deepEqual(sourcePairs, [{
      fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20",
    }]);
    const quoted = await instantQuote(api.url);
    assert.equal(quoted.status, 200);
    assert.equal(typeof quoted.body.quoteId, "string");
    assert.equal((await apiJson(api.url, "/quickex/create-order", {
      ...input, quoteId: quoted.body.quoteId, customerEmail: "",
    })).status, 400);
    assert.equal((await apiJson(api.url, "/quickex/create-order", {
      ...input, quoteId: quoted.body.quoteId, destinationAddress: "",
    })).status, 400);
    for (const [index, absentRefundValue] of [null, "", " \t"] .entries()) {
      const absentRefundRequestId = requestIdForTest(52 + index);
      const absentRefund = await apiJson(api.url, "/quickex/create-order", {
        ...input, clientRequestId: absentRefundRequestId, quoteId: quoted.body.quoteId,
        refundAddress: absentRefundValue, refundMemo: absentRefundValue,
      });
      assert.ok([200, 201].includes(absentRefund.status));
      assert.equal("refundAddress" in (createPayloads.at(-1) ?? {}), false);
      assert.equal("refundAddressMemo" in (createPayloads.at(-1) ?? {}), false);
      await db.delete(quickexOrdersTable).where(eq(quickexOrdersTable.clientRequestId, absentRefundRequestId));
    }
    createCalls = 0;
    assert.equal((await apiJson(api.url, "/quickex/create-order", {
      ...input, quoteId: quoted.body.quoteId, clientRequestId: "",
    })).status, 400);
    const tampered = await apiJson(api.url, "/quickex/create-order", {
      ...input, quoteId: `${quoted.body.quoteId}x`,
    });
    assert.equal(tampered.status, 400);
    assert.equal(tampered.body.code, "QUOTE_INVALID");

    const { refundAddress: _omittedRefundAddress, ...withoutRefundAddress } = input;
    const concurrentCreates = await Promise.all([
      apiJson(api.url, "/quickex/create-order", { ...withoutRefundAddress, quoteId: quoted.body.quoteId }),
      apiJson(api.url, "/quickex/create-order", { ...withoutRefundAddress, quoteId: quoted.body.quoteId }),
    ]);
    assert.deepEqual(
      concurrentCreates.map(result => result.status).sort(),
      [200, 201],
      JSON.stringify({
        bodies: concurrentCreates.map(result => result.body),
        createCalls,
      }),
    );
    const created = concurrentCreates.find(result => result.status === 201)!;
    assert.equal(concurrentCreates[0].body.id, concurrentCreates[1].body.id);
    assert.equal(created.body.providerReference, "provider-reference-800");
    assert.equal(created.body.providerOrderId, "800");
    assert.equal(createCalls, 1);
    assert.equal("refundAddress" in (createPayloads[0] ?? {}), false);
    const repeated = await apiJson(api.url, "/quickex/create-order", {
      ...withoutRefundAddress, quoteId: quoted.body.quoteId,
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.id, created.body.id);
    assert.equal(createCalls, 1);
    assert.equal((await apiJson(api.url, "/quickex/create-order", {
      ...withoutRefundAddress, refundAddress: "different-refund", quoteId: quoted.body.quoteId,
    })).status, 409);

    const [stored] = await db.select().from(quickexOrdersTable)
      .where(eq(quickexOrdersTable.legacyOrderId, String(created.body.id)));
    assert.ok(stored);
    assert.equal(stored.providerReference, "provider-reference-800");
    assert.equal(stored.providerOrderId, "800");
    const exchangeRows = await db.select().from(ordersTable)
      .where(eq(ordersTable.id, String(created.body.id)));
    assert.equal(exchangeRows.length, 0);

    const tokenlessCapabilityLookup = await fetch(
      `${api.url}/quickex/orders/${created.body.id}/status`,
    );
    assert.equal(tokenlessCapabilityLookup.status, 200);
    assert.equal(
      ((await tokenlessCapabilityLookup.json()) as Record<string, unknown>).id,
      created.body.id,
    );
    providerOrders = [order({
      orderId: 800,
      state: "created",
      completed: false,
      amountToGet: "99.5",
      amountToWithdrawFact: "0",
      destinationAddress: input.destinationAddress,
      refundAddress: input.refundAddress,
      claimedDepositAmount: "1",
      createdAt: String(created.body.createdAt),
    })];
    const pendingStatus = await fetch(
      `${api.url}/quickex/orders/${created.body.id}/status?trackingToken=${created.body.trackingToken}`,
    );
    assert.equal(pendingStatus.status, 200);
    const pendingStatusBody = await pendingStatus.json() as Record<string, unknown>;
    assertDecimalEqual(pendingStatusBody.receiveAmount, "99.5");
    assert.equal(pendingStatusBody.providerPaidAmount ?? null, null);
    await db.update(providerSyncStatesTable).set({
      nextAttemptAt: new Date(Date.now() - 1),
    }).where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    resetQuickexOrderSnapshotForTests();

    providerOrders = [order({
      orderId: 800,
      state: "completed",
      completed: true,
      amountToWithdrawFact: "98.75",
      destinationAddress: input.destinationAddress,
      refundAddress: input.refundAddress,
      claimedDepositAmount: "1",
      createdAt: String(created.body.createdAt),
    })];
    const status = await fetch(
      `${api.url}/quickex/orders/${created.body.id}/status?trackingToken=${created.body.trackingToken}`,
    );
    assert.equal(status.status, 200);
    const statusBody = await status.json() as Record<string, unknown>;
    assert.equal(statusBody.status, "completed");
    assert.equal(statusBody.receiveAmount, "98.75");
    assert.equal(statusBody.refreshUnavailable, false);
    const [refreshed] = await db.select().from(quickexOrdersTable)
      .where(eq(quickexOrdersTable.legacyOrderId, String(created.body.id)));
    assert.equal(refreshed?.providerOrderId, "800");

    reset("slowOrdersFailure");
    const staleStatus = await fetch(
      `${api.url}/quickex/orders/${created.body.id}/status?trackingToken=${created.body.trackingToken}`,
    );
    assert.equal(staleStatus.status, 200);
    const staleStatusBody = await staleStatus.json() as Record<string, any>;
    assert.equal(staleStatusBody.status, "completed");
    assert.equal(staleStatusBody.refreshUnavailable, true);
    assert.equal(staleStatusBody.providerFreshness.state, "unavailable");
    const [coolingDown] = await db.select().from(providerSyncStatesTable)
      .where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    assert.equal(coolingDown.consecutiveFailures > 0, true);
    assert.equal(coolingDown.nextAttemptAt!.getTime() > Date.now(), true);

    await db.update(providerSyncStatesTable).set({
      nextAttemptAt: new Date(Date.now() - 1),
    }).where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    reset();
    const recoveredStatus = await fetch(
      `${api.url}/quickex/orders/${created.body.id}/status?trackingToken=${created.body.trackingToken}`,
    );
    assert.equal(recoveredStatus.status, 200);
    assert.equal((await recoveredStatus.json() as Record<string, unknown>).refreshUnavailable, false);
    const [recoveredSync] = await db.select().from(providerSyncStatesTable)
      .where(eq(providerSyncStatesTable.provider, "quickex-order-reconciliation"));
    assert.equal(recoveredSync.consecutiveFailures, 0);
    assert.equal(recoveredSync.lastSucceededAt instanceof Date, true);

    reset("address");
    const invalidAddress = await apiJson(api.url, "/quickex/validate-address", {
      asset: "USDT", network: "TRC20", address: "not-an-address",
    });
    assert.equal(invalidAddress.status, 400);
    assert.equal(invalidAddress.body.code, "QUICKEX_INVALID_ADDRESS");

    reset("missingSlow");
    const uncertainQuote = await instantQuote(api.url);
    const uncertainInput = {
      ...input, quoteId: uncertainQuote.body.quoteId,
      clientRequestId: uncertainRequestId,
    };
    const uncertain = await apiJson(api.url, "/quickex/create-order", uncertainInput);
    assert.equal(uncertain.status, 202);
    assert.equal(uncertain.body.outcomeUnknown, true);
    const uncertainRepeat = await apiJson(api.url, "/quickex/create-order", uncertainInput);
    assert.equal(uncertainRepeat.status, 200);
    assert.equal(createCalls, 1);
  } finally {
    await db.delete(quickexOrdersTable)
      .where(inArray(quickexOrdersTable.clientRequestId, [requestId, uncertainRequestId]));
    for (const original of originals) {
      await db.update(cryptoAssetNetworksTable).set({
        executionMode: original.executionMode,
        enabled: original.enabled,
      }).where(eq(cryptoAssetNetworksTable.id, original.id));
    }
    await api.close();
    reset();
  }
});

test("manual pricing bulk actions update safe rules and report skipped conflicts", async () => {
  const { classifyAdminRoute } = await import("../src/lib/admin-policy");
  assert.deepEqual(
    classifyAdminRoute("POST", "/admin/manual-desk-pricing-rules/bulk"),
    { permission: "pricing.manage", ownerOnly: false },
  );
  const { db, manualDeskPricingRulesTable, operatorsTable } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const suffix = randomUUID();
  const userId = `user_bulk_pricing_${suffix}`;
  const [operator] = await db.insert(operatorsTable).values({
    email: `bulk-pricing-${suffix}@example.test`,
    clerkUserId: userId,
    role: "operator",
    status: "active",
    permissionAllows: ["pricing.view", "pricing.manage"],
  }).returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: req => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": userId };
  const ids = [randomUUID(), randomUUID()];
  const apiCreatedIds: string[] = [];
    let scaleIds: string[] = [];
  try {
    const config = await (await fetch(`${api.url}/exchange/config`)).json() as {
      settlementOptions: Array<{
        id: string; assetCode: string; routeNetwork: string;
        direction: "send" | "receive" | "both";
      }>;
    };
    const sources = config.settlementOptions.filter(option =>
      option.direction === "send" || option.direction === "both");
    const source = sources[0];
    const target = config.settlementOptions.find(option =>
      (option.direction === "receive" || option.direction === "both") &&
      option.id !== source?.id);
    const alternateSource = sources.find(option =>
      option.id !== source?.id && option.id !== target?.id);
    assert.ok(source && alternateSource && target);
    const apiRulePayload = {
      name: `API direction ${suffix}`,
      sourceAsset: source.assetCode,
      targetAsset: target.assetCode,
      sourceNetwork: source.routeNetwork,
      targetNetwork: target.routeNetwork,
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
      markupBasisPoints: 275,
      adjustmentDirection: "GIVE_MORE",
      exactRate: "1.1",
      fixedFee: null,
      priority: -900000,
      enabled: false,
    };
    const createdViaApi = await apiJson(
      api.url, "/admin/manual-desk-pricing-rules", apiRulePayload, "POST", headers,
    );
    assert.equal(createdViaApi.status, 201, JSON.stringify(createdViaApi.body));
    apiCreatedIds.push(String(createdViaApi.body.id));
    assert.equal(createdViaApi.body.adjustmentDirection, "GIVE_MORE");
    assert.equal(createdViaApi.body.markupBasisPoints, 275);
    assert.equal(createdViaApi.body.version, 1);
    const createdRow = (await db.select().from(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, createdViaApi.body.id)))[0];
    assert.equal(createdRow?.adjustmentDirection, "GIVE_MORE");
    assert.equal(createdRow?.markupBasisPoints, 275);
    const editedViaApi = await apiJson(
      api.url, `/admin/manual-desk-pricing-rules/${createdViaApi.body.id}`, {
        ...apiRulePayload,
        adjustmentDirection: "GIVE_MORE",
        markupBasisPoints: 325,
        version: 1,
      }, "PATCH", headers,
    );
    assert.equal(editedViaApi.status, 200, JSON.stringify(editedViaApi.body));
    assert.equal(editedViaApi.body.adjustmentDirection, "GIVE_MORE");
    assert.equal(editedViaApi.body.markupBasisPoints, 325);
    assert.equal(editedViaApi.body.version, 2);
    const staleEdit = await apiJson(
      api.url, `/admin/manual-desk-pricing-rules/${createdViaApi.body.id}`, {
        ...apiRulePayload,
        adjustmentDirection: "MARKUP",
        markupBasisPoints: 400,
        version: 1,
      }, "PATCH", headers,
    );
    assert.equal(staleEdit.status, 409);
    await db.update(manualDeskPricingRulesTable).set({
      paymentMethod: "STALE-SOURCE-METHOD",
      payoutMethod: "STALE-TARGET-METHOD",
    }).where(eq(manualDeskPricingRulesTable.id, createdViaApi.body.id));
    const anySourceViaBulk = await apiJson(
      api.url, "/admin/manual-desk-pricing-rules/bulk", {
        action: "edit",
        items: [{ id: createdViaApi.body.id, version: 2 }],
        patch: { sourceSettlementOptionId: null, exactRate: null },
      }, "POST", headers,
    );
    assert.equal(anySourceViaBulk.status, 200, JSON.stringify(anySourceViaBulk.body));
    let canonicalBulkRow = (await db.select().from(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, createdViaApi.body.id)))[0];
    assert.equal(canonicalBulkRow?.sourceSettlementOptionId, null);
    assert.equal(canonicalBulkRow?.sourceAsset, null);
    assert.equal(canonicalBulkRow?.sourceNetwork, null);
    assert.equal(canonicalBulkRow?.paymentMethod, null);
    assert.equal(canonicalBulkRow?.payoutMethod, "STALE-TARGET-METHOD");

    const anyTargetViaBulk = await apiJson(
      api.url, "/admin/manual-desk-pricing-rules/bulk", {
        action: "edit",
        items: [{ id: createdViaApi.body.id, version: 3 }],
        patch: { targetSettlementOptionId: null },
      }, "POST", headers,
    );
    assert.equal(anyTargetViaBulk.status, 200, JSON.stringify(anyTargetViaBulk.body));
    canonicalBulkRow = (await db.select().from(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, createdViaApi.body.id)))[0];
    assert.equal(canonicalBulkRow?.targetSettlementOptionId, null);
    assert.equal(canonicalBulkRow?.targetAsset, null);
    assert.equal(canonicalBulkRow?.targetNetwork, null);
    assert.equal(canonicalBulkRow?.payoutMethod, null);
    const persistedEdit = (await db.select().from(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, createdViaApi.body.id)))[0];
    assert.equal(persistedEdit?.adjustmentDirection, "GIVE_MORE");
    assert.equal(persistedEdit?.markupBasisPoints, 325);
    assert.equal(persistedEdit?.version, 4);
    const existingPriorities = new Set(
      (await db.select({ priority: manualDeskPricingRulesTable.priority })
        .from(manualDeskPricingRulesTable)).map(row => row.priority),
    );
    let priority = 900000;
    while (existingPriorities.has(priority) || existingPriorities.has(priority + 1)) {
      priority -= 2;
    }
    const editPriority = priority - 2;
    const baseRule = {
      sourceAsset: source.assetCode,
      targetAsset: target.assetCode,
      sourceNetwork: source.routeNetwork,
      targetNetwork: target.routeNetwork,
      paymentMethod: null,
      payoutMethod: null,
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
      markupBasisPoints: 100,
      fixedFee: null,
      exactRate: "1.1",
      minAmount: null,
      maxAmount: null,
      operatorInstructions: null,
      customerInstructions: null,
      expectedSettlementMinutes: null,
      priority,
      enabled: false,
      version: 1,
    };
    await db.insert(manualDeskPricingRulesTable).values([
      { id: ids[0], ...baseRule, name: `Bulk one ${suffix}` },
      {
        id: ids[1],
        ...baseRule,
        name: `Bulk two ${suffix}`,
        sourceAsset: `ALT-${suffix.slice(0, 8)}`,
        sourceNetwork: `ALT-${suffix.slice(0, 8)}`,
        sourceSettlementOptionId: alternateSource.id,
        priority: priority + 1,
      },
    ]);
    scaleIds = Array.from({ length: 20 }, () => randomUUID());
    await db.insert(manualDeskPricingRulesTable).values(scaleIds.map((id, index) => ({
      id,
      ...baseRule,
      name: `Bulk scale ${index} ${suffix}`,
      sourceAsset: `SCALE-${index}-${suffix.slice(0, 8)}`,
      sourceNetwork: `SCALE-${index}-${suffix.slice(0, 8)}`,
      markupBasisPoints: 200 + index,
      priority: priority - 100 - index,
    })));
    const beforeScale = await db.select().from(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, scaleIds));
    await db.update(manualDeskPricingRulesTable)
      .set({ version: 2 })
      .where(eq(manualDeskPricingRulesTable.id, scaleIds[0]));
    const scaleResponse = await apiJson(api.url, "/admin/manual-desk-pricing-rules/bulk", {
      action: "edit",
      items: scaleIds.map(id => ({ id, version: 1 })),
      patch: { markupBasisPoints: 777 },
    }, "POST", headers);
    assert.equal(scaleResponse.status, 200, JSON.stringify(scaleResponse.body));
    assert.equal(scaleResponse.body.updatedIds.length, 19);
    assert.equal(scaleResponse.body.skipped.length, 1);
    assert.equal(scaleResponse.body.skipped[0].id, scaleIds[0]);
    const afterScale = await db.select().from(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, scaleIds));
    for (const after of afterScale) {
      const before = beforeScale.find(row => row.id === after.id)!;
      if (after.id === scaleIds[0]) {
        assert.equal(after.version, 2);
        assert.equal(after.markupBasisPoints, before.markupBasisPoints);
      } else {
        assert.equal(after.version, 2);
        assert.equal(after.markupBasisPoints, 777);
      }
      assert.equal(after.exactRate, before.exactRate);
      assert.equal(after.priority, before.priority);
      assert.equal(after.sourceAsset, before.sourceAsset);
      assert.equal(after.targetAsset, before.targetAsset);
      assert.equal(after.minAmount, before.minAmount);
      assert.equal(after.maxAmount, before.maxAmount);
    }

    const bulk = (body: Record<string, unknown>) =>
      apiJson(api.url, "/admin/manual-desk-pricing-rules/bulk", body, "POST", headers);
    let response = await bulk({
      action: "enable",
      items: ids.map(id => ({ id, version: 1 })),
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.action, "enable");
    assert.deepEqual(response.body.affectedIds, ids);
    assert.equal((response.body.items as Array<Record<string, unknown>>)
      .filter(item => ids.includes(String(item.id))).every(item => item.enabled === true), true);

    response = await bulk({
      action: "disable",
      items: ids.map(id => ({ id, version: 2 })),
    });
    assert.equal(response.status, 200);

    // A stale version is skipped while the current-version item still updates.
    response = await bulk({
      action: "enable",
      items: [{ id: ids[0], version: 2 }, { id: ids[1], version: 3 }],
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.updatedIds, [ids[1]]);
    assert.equal(response.body.skipped[0].id, ids[0]);
    assert.equal(response.body.skipped[0].code, "MANUAL_PRICING_RULE_VERSION_CONFLICT");
    const afterStale = await db.select().from(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ids));
    assert.deepEqual(
      afterStale.map(row => [row.id, row.enabled, row.version])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
      [
        [ids[0], false, 3], [ids[1], true, 4],
      ].sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    );

    response = await bulk({
      action: "edit",
      items: [{ id: ids[0], version: 3 }, { id: ids[1], version: 4 }],
      patch: {
        priority: editPriority, fixedFee: null,
        adjustmentDirection: "GIVE_MORE", markupBasisPoints: 650,
      },
    });
    assert.equal(response.status, 200);
    const edited = await db.select().from(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, ids[0]));
    assert.equal(edited[0]?.priority, editPriority);
    assert.equal(edited[0]?.version, 4);
    assert.equal(edited[0]?.adjustmentDirection, "GIVE_MORE");
    assert.equal(edited[0]?.markupBasisPoints, 650);

    // Invalid common bounds roll back without changing the successful edit.
    response = await bulk({
      action: "edit",
      items: [{ id: ids[0], version: 4 }, { id: ids[1], version: 5 }],
      patch: { minAmount: "10", maxAmount: "1" },
    });
    assert.equal(response.status, 400);
    const afterInvalid = await db.select().from(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.id, ids[0]));
    assert.equal(afterInvalid[0]?.priority, editPriority);
    assert.equal(afterInvalid[0]?.version, 4);

    // Changing the second source onto the first creates an overlap; only the
    // affected candidate is skipped.
    response = await bulk({
      action: "edit",
      items: [{ id: ids[0], version: 4 }, { id: ids[1], version: 5 }],
      patch: { sourceSettlementOptionId: source.id },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.updatedIds, [ids[0]]);
    assert.equal(response.body.skipped[0].id, ids[1]);
    assert.equal(response.body.skipped[0].code, "MANUAL_PRICING_RULE_CONFLICT");
    const afterConflict = await db.select().from(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ids));
    assert.deepEqual(afterConflict.sort((left, right) => left.id.localeCompare(right.id))
      .map(row => [row.id, row.sourceSettlementOptionId, row.version]).sort((left, right) =>
        String(left[0]).localeCompare(String(right[0]))), [
      [ids[0], source.id, 5], [ids[1], alternateSource.id, 5],
    ].sort((left, right) => String(left[0]).localeCompare(String(right[0]))));

    response = await bulk({
      action: "delete",
      items: ids.map(id => ({ id, version: 5 })),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.affectedIds, ids);
    assert.equal((response.body.items as Array<unknown>).some(item =>
      ids.includes(String((item as { id: string }).id))), false);
  } finally {
    await db.delete(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, [...ids, ...scaleIds, ...apiCreatedIds]));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
    await api.close();
  }
});

test("manual crypto catalog and signed funding snapshots are independent of Quickex", async () => {
  const { cryptoAssetNetworksTable, db, manualDeskPricingRulesTable } = await import("@workspace/db");
  const [original] = await db.select().from(cryptoAssetNetworksTable)
    .where(eq(cryptoAssetNetworksTable.id, "btc-bitcoin")).limit(1);
  assert.ok(original);
  const api = await startApi();
  let ruleId: string | undefined;
  try {
    reset("catalogUnavailable");
    quickex.resetQuickexInstrumentCacheForTests();
    await db.update(cryptoAssetNetworksTable).set({
      enabled: true, customerDepositsEnabled: false, sharedDepositAddress: "",
    }).where(eq(cryptoAssetNetworksTable.id, "btc-bitcoin"));
    const configResponse = await fetch(`${api.url}/exchange/config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json() as {
      manualSettlementOptions: Array<Record<string, unknown>>;
    };
    const source = config.manualSettlementOptions.find(option => option.id === "crypto:btc-bitcoin");
    const target = config.manualSettlementOptions.find(option =>
      option.kind === "fiat-payment-method" &&
      option.assetCode === "USD" &&
      (option.direction === "receive" || option.direction === "both"));
    assert.ok(source && target);
    assert.equal(Object.hasOwn(source, "sharedDepositAddress"), false);
    assert.equal(source.direction, "receive");

    const quoteInput = {
      type: "manual", fromAsset: source.assetCode, fromNetwork: source.routeNetwork,
      toAsset: target.assetCode, toNetwork: target.routeNetwork, amount: 1,
      sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
    };
    const gated = await apiJson(api.url, "/exchange/quote", quoteInput);
    assert.equal(gated.status, 422);
    assert.equal(gated.body.code, "SETTLEMENT_OPTION_INVALID");

    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
    await db.update(cryptoAssetNetworksTable).set({
      customerDepositsEnabled: true,
      depositProvider: "manual",
      sharedDepositAddress: "immutable-btc-deposit",
      sharedDepositMemo: "immutable-memo",
      requiredConfirmations: 3,
      confirmationGuidance: "Wait for three confirmations.",
    }).where(eq(cryptoAssetNetworksTable.id, "btc-bitcoin"));
    const fundedConfig = await (await fetch(`${api.url}/exchange/config`)).json() as {
      manualSettlementOptions: Array<Record<string, unknown>>;
    };
    ruleId = await createExactPathRule({
      sourceAsset: "BTC", targetAsset: "USD", sourceNetwork: "Bitcoin",
      targetNetwork: target.routeNetwork, sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id, exactRate: "50000",
    });
    assert.equal(
      fundedConfig.manualSettlementOptions.find(option => option.id === "crypto:btc-bitcoin")?.direction,
      "both",
    );
    const quoted = await apiJson(api.url, "/exchange/quote", quoteInput);
    assert.equal(quoted.status, 200);
    const ticket = JSON.parse(Buffer.from(String(quoted.body.quoteId).split(".")[0], "base64url").toString()) as any;
    assert.equal(ticket.settlementSnapshot.funding.address, "immutable-btc-deposit");
    assert.equal(ticket.settlementSnapshot.funding.depositProvider, "manual");
    assert.equal(ticket.settlementSnapshot.funding.requiredConfirmations, 3);
    const unchangedFundingOrder = await apiJson(api.url, "/orders", {
      ...quoteInput,
      quoteId: quoted.body.quoteId,
      settlementDetails: settlementDetailsFixture(quoted.body.requiredSettlementFields),
      refundAddress: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
      customerEmail: "unchanged-funding@example.test",
      clientRequestId: randomUUID(),
    });
    assert.equal(unchangedFundingOrder.status, 201);
    await db.update(cryptoAssetNetworksTable).set({ sharedDepositAddress: "changed-later" })
      .where(eq(cryptoAssetNetworksTable.id, "btc-bitcoin"));
    const immutable = JSON.parse(Buffer.from(String(quoted.body.quoteId).split(".")[0], "base64url").toString()) as any;
    assert.equal(immutable.settlementSnapshot.funding.address, "immutable-btc-deposit");
    const changedFundingOrder = await apiJson(api.url, "/orders", {
      ...quoteInput,
      quoteId: quoted.body.quoteId,
      settlementDetails: settlementDetailsFixture(quoted.body.requiredSettlementFields),
      refundAddress: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
      customerEmail: "changed-funding@example.test",
      clientRequestId: randomUUID(),
    });
    assert.equal(changedFundingOrder.status, 409);
    assert.equal(changedFundingOrder.body.code, "SETTLEMENT_OPTION_CHANGED");
  } finally {
    if (ruleId) await db.delete(manualDeskPricingRulesTable).where(eq(manualDeskPricingRulesTable.id, ruleId));
    await db.update(cryptoAssetNetworksTable).set(original)
      .where(eq(cryptoAssetNetworksTable.id, original.id));
    reset();
    quickex.resetQuickexInstrumentCacheForTests();
    await api.close();
  }
});

test("fiat-to-crypto requires a destination wallet but not settlement fields or a memo", async () => {
  reset();
  const api = await startApi();
  let ruleId: string | undefined;
  let orderId = "";
  let cancelledOrderId = "";
  const customerEmail = `manual-target-${randomUUID()}@example.test`;
  try {
    const config = await (await fetch(`${api.url}/exchange/config`)).json() as any;
    const source = config.manualSettlementOptions.find((option: any) =>
      option.kind === "fiat-payment-method" &&
      option.assetCode === "USD" &&
      (option.direction === "send" || option.direction === "both"));
    const target = config.manualSettlementOptions.find((option: any) => option.id === "crypto:xrp-xrpl");
    assert.ok(source && target);
    ruleId = await createExactPathRule({
      sourceAsset: source.assetCode, targetAsset: target.assetCode,
      sourceNetwork: source.routeNetwork, targetNetwork: target.routeNetwork,
      sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
      exactRate: "2",
    });
    const quote = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: source.assetCode, fromNetwork: source.routeNetwork,
      toAsset: target.assetCode, toNetwork: target.routeNetwork, amount: 100,
      sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
    });
    assert.equal(quote.status, 200);
    assert.deepEqual(quote.body.requiredSettlementFields, []);
    const order = {
      type: "manual", fromAsset: source.assetCode, fromNetwork: source.routeNetwork,
      toAsset: target.assetCode, toNetwork: target.routeNetwork, amount: 100,
      sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
      quoteId: quote.body.quoteId,
      customerEmail, clientRequestId: randomUUID(),
    };
    const missingWallet = await apiJson(api.url, "/orders", order);
    assert.equal(missingWallet.body.code, "MANUAL_DESTINATION_ADDRESS_REQUIRED");
    const missingMemo = await apiJson(api.url, "/orders", {
      ...order, destinationAddress: "rDestination", clientRequestId: randomUUID(),
    });
    assert.equal(missingMemo.body.code, "MANUAL_DESTINATION_ADDRESS_INVALID");
    const validAddressMissingMemo = await apiJson(api.url, "/orders", {
      ...order,
      destinationAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      clientRequestId: randomUUID(),
    });
    assert.equal(validAddressMissingMemo.status, 201, JSON.stringify(validAddressMissingMemo.body));
    assert.equal(validAddressMissingMemo.body.paymentDetailsApplicable, true);
    assert.deepEqual(validAddressMissingMemo.body.sourcePaymentMethod, {
      id: source.id,
      name: source.title,
      paymentMethodId: source.paymentMethodId,
      ...(source.logoUrl ? { logoUrl: source.logoUrl } : {}),
    });
    orderId = String(validAddressMissingMemo.body.id);
    const { db, ordersTable } = await import("@workspace/db");
    await db.update(ordersTable).set({ paymentDetails: {} })
      .where(eq(ordersTable.id, orderId));
    const emptyDetailsMarkPaid = await apiJson(api.url, `/orders/${encodeURIComponent(orderId)}/mark-paid`, {
      trackingToken: validAddressMissingMemo.body.trackingToken,
    });
    assert.equal(emptyDetailsMarkPaid.status, 409);
    assert.equal(emptyDetailsMarkPaid.body.code, "PAYMENT_DETAILS_NOT_APPLICABLE");
    await db.update(ordersTable).set({
      paymentDetails: {
        name: "QuickXchange Settlement",
        iban: "DE89370400440532013000",
        paymentReference: orderId,
      },
    }).where(eq(ordersTable.id, orderId));
    const tracked = await (await fetch(
      `${api.url}/orders/${encodeURIComponent(orderId)}/status?trackingToken=${encodeURIComponent(String(validAddressMissingMemo.body.trackingToken))}`,
    )).json() as any;
    assert.equal(tracked.paymentDetails.iban, "DE89370400440532013000");
    assert.equal(tracked.sourcePaymentMethod.id, source.id);
    const markedPaid = await apiJson(api.url, `/orders/${encodeURIComponent(orderId)}/mark-paid`, {
      trackingToken: validAddressMissingMemo.body.trackingToken,
    });
    assert.equal(markedPaid.status, 200, JSON.stringify(markedPaid.body));
    assert.ok(markedPaid.body.customerMarkedPaidAt);
    const [persistedPaid] = await db.select({
      customerMarkedPaidAt: ordersTable.customerMarkedPaidAt,
      manualSettlementState: ordersTable.manualSettlementState,
    }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    assert.ok(persistedPaid.customerMarkedPaidAt);
    assert.equal(persistedPaid.manualSettlementState, "awaiting_funds");
    const cancelPaidOrder = await apiJson(api.url, `/orders/${encodeURIComponent(orderId)}/cancel`, {
      trackingToken: validAddressMissingMemo.body.trackingToken,
    });
    assert.equal(cancelPaidOrder.status, 409);
    assert.equal(cancelPaidOrder.body.code, "ORDER_ALREADY_MARKED_PAID");
    const cancellable = await apiJson(api.url, "/orders", {
      ...order,
      destinationAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      clientRequestId: randomUUID(),
    });
    assert.equal(cancellable.status, 201, JSON.stringify(cancellable.body));
    cancelledOrderId = String(cancellable.body.id);
    const wrongOrderToken = await apiJson(api.url, `/orders/${encodeURIComponent(cancelledOrderId)}/cancel`, {
      trackingToken: validAddressMissingMemo.body.trackingToken,
    });
    assert.equal(wrongOrderToken.status, 403);
    const cancelled = await apiJson(api.url, `/orders/${encodeURIComponent(cancelledOrderId)}/cancel`, {
      trackingToken: cancellable.body.trackingToken,
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.status, "cancelled");
    assert.equal(cancelled.body.manualSettlementState, "cancelled");
    assert.equal(cancelled.body.customerMarkedPaidAt, null);
    const cancelledTracked = await (await fetch(
      `${api.url}/orders/${encodeURIComponent(cancelledOrderId)}/status?trackingToken=${encodeURIComponent(String(cancellable.body.trackingToken))}`,
    )).json() as any;
    assert.equal(cancelledTracked.status, "cancelled");
    assert.equal(cancelledTracked.manualSettlementState, "cancelled");
    const markCancelledPaid = await apiJson(api.url, `/orders/${encodeURIComponent(cancelledOrderId)}/mark-paid`, {
      trackingToken: cancellable.body.trackingToken,
    });
    assert.equal(markCancelledPaid.status, 409);
    assert.equal(markCancelledPaid.body.code, "ORDER_CANCELLED");
    const [persistedCancelled] = await db.select({
      status: ordersTable.status,
      manualSettlementState: ordersTable.manualSettlementState,
      manualSettlementCancelledAt: ordersTable.manualSettlementCancelledAt,
    }).from(ordersTable).where(eq(ordersTable.id, cancelledOrderId)).limit(1);
    assert.equal(persistedCancelled.status, "cancelled");
    assert.equal(persistedCancelled.manualSettlementState, "cancelled");
    assert.ok(persistedCancelled.manualSettlementCancelledAt);
    const invalidMemo = await apiJson(api.url, "/orders", {
      ...order,
      destinationAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      destinationMemo: "not-a-tag",
      clientRequestId: randomUUID(),
    });
    assert.equal(invalidMemo.status, 400);
    assert.equal(invalidMemo.body.code, "MANUAL_DESTINATION_MEMO_INVALID");
  } finally {
    const { customersTable, db, ordersTable } = await import("@workspace/db");
    if (cancelledOrderId) await db.delete(ordersTable).where(eq(ordersTable.id, cancelledOrderId));
    if (orderId) await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
    await db.delete(customersTable).where(eq(customersTable.email, customerEmail));
    if (ruleId) {
      const { manualDeskPricingRulesTable } = await import("@workspace/db");
      await db.delete(manualDeskPricingRulesTable).where(eq(manualDeskPricingRulesTable.id, ruleId));
    }
    await api.close();
  }
});

test("manual crypto-to-fiat source accepts no refund and validates a supplied wallet and network memo", async () => {
  reset();
  const {
    cryptoAssetNetworksTable,
    customersTable,
    db,
    ordersTable,
    whitebitProviderSettingsTable,
  } = await import("@workspace/db");
  const [original] = await db.select().from(cryptoAssetNetworksTable)
    .where(eq(cryptoAssetNetworksTable.id, "xrp-xrpl")).limit(1);
  assert.ok(original);
  const api = await startApi();
  const customerEmail = `manual-revolut-${randomUUID()}@example.test`;
  const createdOrderIds: string[] = [];
  let ruleId: string | undefined;
  try {
    await db.update(cryptoAssetNetworksTable).set({
      enabled: true,
      customerDepositsEnabled: true,
      sharedDepositAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      sharedDepositMemo: "987",
    }).where(eq(cryptoAssetNetworksTable.id, "xrp-xrpl"));
    const config = await (await fetch(`${api.url}/exchange/config`)).json() as any;
    const source = config.manualSettlementOptions.find((option: any) =>
      option.id === "crypto:xrp-xrpl" &&
      (option.direction === "send" || option.direction === "both"));
    const target = config.manualSettlementOptions.find((option: any) =>
      option.kind === "fiat-payment-method" &&
      option.paymentMethodId === "revolut-eur" &&
      (option.direction === "receive" || option.direction === "both"));
    assert.ok(source && target);
    ruleId = await createExactPathRule({
      sourceAsset: source.assetCode, targetAsset: target.assetCode,
      sourceNetwork: source.routeNetwork, targetNetwork: target.routeNetwork,
      sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
      exactRate: "2",
    });
    const quoteInput = {
      type: "manual", fromAsset: source.assetCode, fromNetwork: source.routeNetwork,
      toAsset: target.assetCode, toNetwork: target.routeNetwork, amount: 100,
      sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
    };
    const quote = await apiJson(api.url, "/exchange/quote", quoteInput);
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    const order = {
      ...quoteInput,
      quoteId: quote.body.quoteId,
      settlementDetails: settlementDetailsFixture(quote.body.requiredSettlementFields),
      customerEmail: "manual-source@example.test",
      clientRequestId: randomUUID(),
    };
    const withoutRefund = await apiJson(api.url, "/orders", {
      ...order,
      customerEmail,
      clientRequestId: randomUUID(),
    });
    assert.equal(withoutRefund.status, 201, JSON.stringify(withoutRefund.body));
    createdOrderIds.push(String(withoutRefund.body.id));
    assert.equal(withoutRefund.body.refundAddress, "");
    const missingMemo = await apiJson(api.url, "/orders", {
      ...order,
      refundAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      clientRequestId: randomUUID(),
    });
    assert.equal(missingMemo.status, 400);
    assert.equal(missingMemo.body.code, "MANUAL_REFUND_MEMO_REQUIRED");
    const invalidMemo = await apiJson(api.url, "/orders", {
      ...order,
      refundAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      refundMemo: "not-a-tag",
      clientRequestId: randomUUID(),
    });
    assert.equal(invalidMemo.status, 400);
    assert.equal(invalidMemo.body.code, "MANUAL_REFUND_MEMO_INVALID");

    const validRevolutOrder = await apiJson(api.url, "/orders", {
      ...order,
      customerEmail,
      refundAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      refundMemo: "123",
      clientRequestId: randomUUID(),
    });
    assert.equal(validRevolutOrder.status, 201, JSON.stringify(validRevolutOrder.body));
    createdOrderIds.push(String(validRevolutOrder.body.id));
    assert.equal(validRevolutOrder.body.targetSettlementOptionId, target.id);
  } finally {
    if (createdOrderIds.length) {
      await db.delete(ordersTable).where(inArray(ordersTable.id, createdOrderIds));
    }
    await db.delete(customersTable).where(eq(customersTable.email, customerEmail));
    if (ruleId) await db.delete((await import("@workspace/db")).manualDeskPricingRulesTable)
      .where(eq((await import("@workspace/db")).manualDeskPricingRulesTable.id, ruleId));
    await db.update(cryptoAssetNetworksTable).set(original)
      .where(eq(cryptoAssetNetworksTable.id, original.id));
    await api.close();
  }
});

test("manual lifecycle enforces transitions and concurrency and writes an operator audit", async () => {
  const {
    cryptoAssetNetworksTable,
    cryptoAssetsTable,
    db,
    operatorAuditLogsTable,
    operatorsTable,
    orderAuditLogsTable,
    ordersTable,
    whitebitProviderSettingsTable,
  } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const suffix = randomUUID();
  const userId = `user_manual_state_${suffix}`;
  const orderId = `O${(Number.parseInt(suffix.replaceAll("-", "").slice(0, 12), 16) % 1_000_000_000).toString().padStart(9, "0")}`;
  const legacyOrderId = `legacy-manual-state-${suffix}`;
  const assetId = `asset-${suffix}`;
  const networkId = `network-${suffix}`;
  const [whitebitSettingBefore] = await db.select()
    .from(whitebitProviderSettingsTable)
    .where(eq(whitebitProviderSettingsTable.provider, "whitebit"))
    .limit(1);
  const [operator] = await db.insert(operatorsTable).values({
    email: `manual-state-${suffix}@example.test`, clerkUserId: userId,
    role: "operator", status: "active",
    permissionAllows: [
      "orders.status",
      "orders.notes",
      "orders.complete",
      "orders.confirm_payment",
      "crypto_assets.manage",
      "crypto_networks.view",
      "crypto_networks.manage",
    ],
  }).returning();
  await db.insert(ordersTable).values({
    id: orderId, type: "manual", status: "awaiting funds", fromAsset: "BTC",
    fromNetwork: "BTC", toAsset: "USD", toNetwork: "fiat", amount: "1",
    receiveAmount: "1", customerEmail: "manual-state@example.test",
    provider: "Manual desk", manualSettlementState: "awaiting_funds",
    assignedOperatorId: operator.id,
  });
  await db.insert(ordersTable).values({
    id: legacyOrderId, type: "manual", status: "awaiting customer payment",
    fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "USD", toNetwork: "fiat",
    amount: "10", receiveAmount: "10", customerEmail: "legacy-manual@example.test",
    provider: "Manual desk", manualSettlementState: "not_required",
  });
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: req => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": userId };
  try {
    assert.equal((await fetch(`${api.url}/admin/crypto-assets`)).status, 401);
    assert.equal((await fetch(`${api.url}/admin/crypto-networks`, { headers })).status, 200);
    const unauthenticated = await apiJson(api.url, `/orders/${orderId}`, {
      recordVersion: 0, manualSettlementState: "funds_confirmed",
    }, "PATCH");
    assert.equal(unauthenticated.status, 401);
    const directStatus = await apiJson(api.url, `/orders/${orderId}`, {
      recordVersion: 0, status: "completed",
    }, "PATCH", headers);
    assert.equal(directStatus.status, 409);
    assert.equal(directStatus.body.code, "MANUAL_STATUS_MANAGED");
    const valid = await apiJson(api.url, `/orders/${orderId}`, {
      recordVersion: 0, manualSettlementState: "completed",
      incomingTransactionReference: "tx-in", customerSafeNote: "Settlement completed.",
    }, "PATCH", headers);
    assert.equal(valid.status, 200);
    assert.equal(valid.body.manualSettlementState, "completed");
    assert.ok(valid.body.manualSettlementFundedAt);
    assert.ok(valid.body.manualSettlementPaidAt);
    const publicStatus = await fetch(`${api.url}/orders/${encodeURIComponent(orderId)}/status`);
    assert.equal(publicStatus.status, 200);
    const publicOrder = await publicStatus.json() as { id?: string; status?: string; manualSettlementState?: string };
    assert.equal(publicOrder.id, orderId);
    assert.equal(publicOrder.status, "completed");
    assert.equal(publicOrder.manualSettlementState, "completed");
    const stale = await apiJson(api.url, `/orders/${orderId}`, {
      recordVersion: 0, manualSettlementState: "payout_processing",
    }, "PATCH", headers);
    assert.equal(stale.status, 409);
    const noteOnly = await apiJson(api.url, `/orders/${orderId}`, {
      recordVersion: 1, note: "Reference-preserving note",
    }, "PATCH", headers);
    assert.equal(noteOnly.status, 200);
    assert.equal(noteOnly.body.incomingTransactionReference, "tx-in");
    assert.equal(noteOnly.body.outgoingTransactionReference, "");
    const backward = await apiJson(api.url, `/orders/${orderId}`, {
      recordVersion: 2, manualSettlementState: "payout_processing",
    }, "PATCH", headers);
    assert.equal(backward.status, 422);
    const legacyNote = await apiJson(api.url, `/orders/${legacyOrderId}`, {
      recordVersion: 0, note: "Legacy note only",
    }, "PATCH", headers);
    assert.equal(legacyNote.status, 200);
    assert.equal(legacyNote.body.status, "awaiting customer payment");
    assert.equal(legacyNote.body.manualSettlementState, "not_required");
    const audits = await db.select().from(orderAuditLogsTable)
      .where(eq(orderAuditLogsTable.orderId, orderId));
    assert.ok(audits.some(row => row.action === "order.operator_updated" && row.actorId === operator.id));

    const asset = await apiJson(api.url, "/admin/crypto-assets", {
      id: assetId, code: `T${suffix.slice(0, 5)}`, name: "Test asset", decimals: 6,
    }, "POST", headers);
    assert.equal(asset.status, 201);
    const nullableNetwork = await apiJson(api.url, "/admin/crypto-networks", {
      id: networkId, assetId, networkCode: "TEST", networkName: "Test network",
      decimals: 6, confirmationGuidance: null, explorerUrlTemplate: null,
      depositInstructions: null, depositWarning: null, sharedDepositMemo: null,
    }, "POST", headers);
    assert.equal(nullableNetwork.status, 201);
    const duplicateNetwork = await apiJson(api.url, "/admin/crypto-networks", {
      id: `${networkId}-duplicate`, assetId, networkCode: "TEST", networkName: "Duplicate test network",
      decimals: 6,
    }, "POST", headers);
    assert.equal(duplicateNetwork.status, 409);
    assert.equal(duplicateNetwork.body.code, "CRYPTO_NETWORK_EXISTS");
    assert.equal(duplicateNetwork.body.error, "Crypto network already exists.");
    const missingAddress = await apiJson(api.url, `/admin/crypto-networks/${networkId}`, {
      customerDepositsEnabled: true,
    }, "PATCH", headers);
    assert.equal(missingAddress.status, 422);
    assert.equal(missingAddress.body.code, "CRYPTO_DEPOSIT_VERIFICATION_REQUIRED");
    const createBypass = await apiJson(api.url, "/admin/crypto-networks", {
      id: `${networkId}-unverified`, assetId, networkCode: "UNVERIFIED",
      networkName: "Unverified network", decimals: 6,
      customerDepositsEnabled: true,
    }, "POST", headers);
    assert.equal(createBypass.status, 422);
    assert.equal(createBypass.body.code, "CRYPTO_DEPOSIT_VERIFICATION_REQUIRED");
    await db.update(cryptoAssetNetworksTable).set({
      depositProvider: "whitebit",
      customerDepositsEnabled: true,
      requiresMemo: false,
    }).where(eq(cryptoAssetNetworksTable.id, networkId));
    const determinantChange = await apiJson(api.url, `/admin/crypto-networks/${networkId}`, {
      requiresMemo: true,
    }, "PATCH", headers);
    assert.equal(determinantChange.status, 200);
    assert.equal(determinantChange.body.customerDepositsEnabled, false);
    const siblingNetworkId = `${networkId}-sibling`;
    await db.insert(cryptoAssetNetworksTable).values({
      id: siblingNetworkId,
      assetId,
      networkCode: "SIBLING",
      networkName: "Sibling network",
      networkFamily: "ethereum",
      decimals: 6,
      enabled: true,
      depositProvider: "manual",
      sharedDepositAddress: "0x52908400098527886E0F7030069857D2E4169EE7",
      customerDepositsEnabled: true,
    });
    await db.update(cryptoAssetNetworksTable).set({
      networkFamily: "ethereum",
      depositProvider: "manual",
      sharedDepositAddress: "0xde709f2102306220921060314715629080e2fb77",
      sharedDepositMemo: null,
      requiresMemo: false,
      enabled: false,
      customerDepositsEnabled: false,
    }).where(eq(cryptoAssetNetworksTable.id, networkId));
    const enabledManualNetwork = await apiJson(api.url, `/admin/crypto-networks/${networkId}`, {
      enabled: true,
    }, "PATCH", headers);
    assert.equal(enabledManualNetwork.status, 200);
    assert.equal(enabledManualNetwork.body.enabled, true);
    assert.equal(enabledManualNetwork.body.customerDepositsEnabled, true);
    const [siblingAfterEnable] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, siblingNetworkId));
    assert.equal(siblingAfterEnable.enabled, true);
    assert.equal(siblingAfterEnable.customerDepositsEnabled, true);
    const providerBypass = await apiJson(api.url, `/admin/crypto-networks/${networkId}`, {
      depositProvider: "none",
    }, "PATCH", headers);
    assert.equal(providerBypass.status, 400);
    assert.equal(providerBypass.body.code, "VALIDATION_ERROR");
  } finally {
    await api.close();
    await deleteOrderAuditLogsForMaintenance(orderId);
    await db.delete(ordersTable).where(inArray(ordersTable.id, [orderId, legacyOrderId]));
    await db.delete(cryptoAssetNetworksTable).where(inArray(
      cryptoAssetNetworksTable.id,
      [networkId, `${networkId}-sibling`],
    ));
    await db.delete(cryptoAssetsTable).where(eq(cryptoAssetsTable.id, assetId));
    if (whitebitSettingBefore) {
      await db.update(whitebitProviderSettingsTable)
        .set(whitebitSettingBefore)
        .where(eq(whitebitProviderSettingsTable.provider, "whitebit"));
    }
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
  }
});

test("owner receiving-wallet updates validate, audit, and immediately gate exact asset-network rows", async () => {
  const {
    cryptoAssetNetworksTable,
    cryptoAssetsTable,
    db,
    operatorAuditLogsTable,
    operatorsTable,
  } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const depositEligibility = await import("../src/lib/customer-deposit-eligibility");
  const suffix = randomUUID();
  const userId = `user_wallet_owner_${suffix}`;
  const assetAId = `wallet-asset-a-${suffix}`;
  const assetBId = `wallet-asset-b-${suffix}`;
  const networkAId = `wallet-network-a-${suffix}`;
  const networkBId = `wallet-network-b-${suffix}`;
  const differentNetworkId = `wallet-network-different-${suffix}`;
  const sharedCode = `WALLET-${suffix.slice(0, 12)}`;
  const differentCode = "BTC";
  const existingDepositStates = await db.select({
    id: cryptoAssetNetworksTable.id,
    customerDepositsEnabled: cryptoAssetNetworksTable.customerDepositsEnabled,
    updatedAt: cryptoAssetNetworksTable.updatedAt,
  }).from(cryptoAssetNetworksTable);
  const [operator] = await db.insert(operatorsTable).values({
    email: `wallet-owner-${suffix}@example.test`,
    clerkUserId: userId,
    role: "owner",
    status: "active",
  }).returning();
  await db.insert(cryptoAssetsTable).values([
    { id: assetAId, code: `WA${suffix.slice(0, 6)}`, name: "Wallet Asset A", decimals: 6 },
    { id: assetBId, code: `WB${suffix.slice(0, 6)}`, name: "Wallet Asset B", decimals: 6 },
  ]);
  await db.insert(cryptoAssetNetworksTable).values([
    {
      id: networkAId, assetId: assetAId, networkCode: sharedCode,
      networkName: "Bitcoin Shared A", decimals: 6,
    },
    {
      id: networkBId, assetId: assetBId, networkCode: sharedCode,
      networkName: "Bitcoin Shared B", decimals: 6, requiresMemo: true,
    },
    {
      id: differentNetworkId, assetId: assetAId, networkCode: differentCode,
      networkName: "Bitcoin", decimals: 6,
      sharedDepositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      sharedDepositMemo: "untouched-memo",
    },
  ]);
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: req => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": userId };
  try {
    const mismatched = await apiJson(api.url, `/admin/crypto-assets/${assetBId}/receiving-wallet`, {
      networkId: networkAId, walletAddress: "wrong-asset", enabled: false,
      useForAllAssetsOnNetwork: false,
    }, "PUT", headers);
    assert.equal(mismatched.status, 404);
    assert.equal(mismatched.body.code, "CRYPTO_ASSET_NETWORK_NOT_FOUND");

    const connectedWhitebit = await apiJson(api.url, `/admin/crypto-assets/${assetAId}/receiving-wallet`, {
      networkId: networkAId, walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", memo: "fallback-memo",
      enabled: true, useForAllAssetsOnNetwork: false, depositProvider: "whitebit",
    }, "PUT", headers);
    assert.equal(connectedWhitebit.status, 200);
    assert.equal(
      (connectedWhitebit.body as Array<{ id: string; depositProvider: string }>).find(row => row.id === networkAId)?.depositProvider,
      "whitebit",
    );

    const exact = await apiJson(api.url, `/admin/crypto-assets/${assetAId}/receiving-wallet`, {
      networkId: networkAId, walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", memo: "exact-memo",
      enabled: false, useForAllAssetsOnNetwork: false, depositProvider: "manual",
    }, "PUT", headers);
    assert.equal(exact.status, 200);
    assert.deepEqual(exact.body.map((row: { id: string }) => row.id), [networkAId]);
    assert.equal(exact.body[0]?.customerDepositsEnabled, false);
    const selectedNetworks = await apiJson(api.url, "/admin/crypto-networks/receiving-wallet", {
      networkIds: [networkAId, networkBId],
      walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      memo: "selected-network-memo",
      networkEnabled: true,
      enabled: true,
      depositProvider: "manual",
    }, "PUT", headers);
    assert.equal(selectedNetworks.status, 200, JSON.stringify(selectedNetworks.body));
    assert.deepEqual(
      selectedNetworks.body.map((row: { id: string }) => row.id).sort(),
      [networkAId, networkBId].sort(),
    );
    assert.ok(selectedNetworks.body.every((row: {
      sharedDepositAddress: string;
      sharedDepositMemo: string;
      customerDepositsEnabled: boolean;
    }) =>
      row.sharedDepositAddress === "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" &&
      row.sharedDepositMemo === "selected-network-memo" &&
      row.customerDepositsEnabled
    ));
    const enabledSelectedConfig = await (await fetch(`${api.url}/exchange/config`)).json() as {
      manualSettlementOptions: Array<{ id: string; direction: string }>;
    };
    assert.equal(
      enabledSelectedConfig.manualSettlementOptions.find(option => option.id === `crypto:${networkAId}`)?.direction,
      "both",
    );
    assert.equal(
      enabledSelectedConfig.manualSettlementOptions.find(option => option.id === `crypto:${networkBId}`)?.direction,
      "both",
    );
    assert.equal(
      enabledSelectedConfig.manualSettlementOptions.find(option => option.id === `crypto:${differentNetworkId}`)?.direction,
      "receive",
    );
    const tableSelectedBulk = await apiJson(api.url, "/admin/crypto-networks/receiving-wallet", {
      networkIds: [differentNetworkId],
      walletAddress: "",
      memo: "table-selected-memo",
      depositProvider: "manual",
    }, "PUT", headers);
    assert.equal(tableSelectedBulk.status, 200, JSON.stringify(tableSelectedBulk.body));
    assert.equal(tableSelectedBulk.body[0]?.enabled, true);
    assert.equal(tableSelectedBulk.body[0]?.customerDepositsEnabled, false);
    assert.equal(tableSelectedBulk.body[0]?.sharedDepositAddress, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");
    assert.equal(tableSelectedBulk.body[0]?.sharedDepositMemo, "table-selected-memo");
    const rejectedSelection = await apiJson(api.url, "/admin/crypto-networks/receiving-wallet", {
      networkIds: [networkAId, networkBId],
      walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
      memo: null,
      networkEnabled: true,
      enabled: true,
      depositProvider: "manual",
    }, "PUT", headers);
    assert.equal(rejectedSelection.status, 422);
    assert.equal(rejectedSelection.body.code, "CRYPTO_DEPOSIT_MEMO_REQUIRED");
    const rowsAfterRejectedSelection = await db.select().from(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, [networkAId, networkBId]));
    assert.ok(rowsAfterRejectedSelection.every(row =>
      row.sharedDepositAddress === "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" &&
      row.sharedDepositMemo === "selected-network-memo" &&
      row.customerDepositsEnabled
    ));
    const exactNetworkOnly = await apiJson(api.url, "/admin/crypto-networks/receiving-wallet", {
      networkIds: [networkAId],
      walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      memo: "network-a-only",
      networkEnabled: false,
      enabled: false,
      depositProvider: "none",
    }, "PUT", headers);
    assert.equal(exactNetworkOnly.status, 200);
    const independentRows = await db.select().from(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, [networkAId, networkBId]));
    assert.equal(independentRows.find(row => row.id === networkAId)?.sharedDepositMemo, "network-a-only");
    assert.equal(independentRows.find(row => row.id === networkAId)?.enabled, false);
    assert.equal(independentRows.find(row => row.id === networkAId)?.customerDepositsEnabled, false);
    assert.equal(independentRows.find(row => row.id === networkBId)?.sharedDepositMemo, "selected-network-memo");
    assert.equal(independentRows.find(row => row.id === networkBId)?.enabled, true);
    assert.equal(independentRows.find(row => row.id === networkBId)?.customerDepositsEnabled, true);
    await db.update(cryptoAssetNetworksTable).set({ enabled: true })
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    await db.transaction(tx =>
      depositEligibility.reconcileCryptoCustomerDepositEligibilityWithExecutor(tx, {
        whitebitReady: false,
        whitebitCapabilities: null,
        whitebitProofs: new Map(),
        credentialUpdatedAtMs: null,
        providerSettingVersion: null,
      })
    );
    const [disabledAfterReconcile] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(disabledAfterReconcile.customerDepositsEnabled, false);
    const disabledConfig = await (await fetch(`${api.url}/exchange/config`)).json() as {
      manualSettlementOptions: Array<{ id: string; direction: string }>;
    };
    assert.equal(
      disabledConfig.manualSettlementOptions.find(option => option.id === `crypto:${networkAId}`)?.direction,
      "receive",
    );

    const invalidAddress = await apiJson(api.url, `/admin/crypto-assets/${assetAId}/receiving-wallet`, {
      networkId: networkAId, walletAddress: "not-a-bitcoin-address", memo: null,
      enabled: true, useForAllAssetsOnNetwork: false, depositProvider: "manual",
    }, "PUT", headers);
    assert.equal(invalidAddress.status, 422);
    assert.equal(invalidAddress.body.code, "CRYPTO_DEPOSIT_ADDRESS_INVALID");
    const invalidOptionalMemo = await apiJson(api.url, `/admin/crypto-assets/${assetAId}/receiving-wallet`, {
      networkId: networkAId,
      walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      memo: "invalid\u0000memo",
      enabled: true,
      useForAllAssetsOnNetwork: false,
      depositProvider: "manual",
    }, "PUT", headers);
    assert.equal(invalidOptionalMemo.status, 422);
    assert.equal(invalidOptionalMemo.body.code, "CRYPTO_DEPOSIT_MEMO_INVALID");
    const invalidDisabledMemo = await apiJson(api.url, `/admin/crypto-assets/${assetAId}/receiving-wallet`, {
      networkId: networkAId,
      walletAddress: "",
      memo: "invalid\u0000memo",
      enabled: false,
      useForAllAssetsOnNetwork: false,
      depositProvider: "none",
    }, "PUT", headers);
    assert.equal(invalidDisabledMemo.status, 422);
    assert.equal(invalidDisabledMemo.body.code, "CRYPTO_DEPOSIT_MEMO_INVALID");

    const shared = await apiJson(api.url, `/admin/crypto-assets/${assetAId}/receiving-wallet`, {
      networkId: networkAId, walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", memo: "shared-memo",
      enabled: true, useForAllAssetsOnNetwork: true, depositProvider: "none",
    }, "PUT", headers);
    assert.equal(shared.status, 200);
    assert.deepEqual(
      shared.body.map((row: { id: string }) => row.id).sort(),
      [networkAId, networkBId].sort(),
    );
    const [differentAfterShared] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, differentNetworkId));
    assert.equal(differentAfterShared.sharedDepositAddress, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");
    assert.equal(differentAfterShared.customerDepositsEnabled, false);
    const sharedRows = await db.select().from(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, [networkAId, networkBId]));
    assert.equal(sharedRows.find(row => row.id === networkAId)?.depositProvider, "none");
    assert.equal(sharedRows.find(row => row.id === networkAId)?.customerDepositsEnabled, false);
    assert.equal(sharedRows.find(row => row.id === networkBId)?.depositProvider, "manual");
    assert.equal(sharedRows.find(row => row.id === networkBId)?.sharedDepositAddress, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");
    assert.equal(sharedRows.find(row => row.id === networkBId)?.customerDepositsEnabled, true);
    const sharedConfig = await (await fetch(`${api.url}/exchange/config`)).json() as {
      manualSettlementOptions: Array<{ id: string; direction: string }>;
    };
    assert.equal(
      sharedConfig.manualSettlementOptions.find(option => option.id === `crypto:${networkAId}`)?.direction,
      "receive",
    );
    assert.equal(
      sharedConfig.manualSettlementOptions.find(option => option.id === `crypto:${networkBId}`)?.direction,
      "both",
    );

    await db.update(cryptoAssetNetworksTable).set({ sharedDepositMemo: null })
      .where(inArray(cryptoAssetNetworksTable.id, [networkAId, networkBId]));
    const optionalMemo = await apiJson(api.url, `/admin/crypto-assets/${assetAId}/receiving-wallet`, {
      networkId: networkAId, walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", memo: null,
      enabled: true, useForAllAssetsOnNetwork: true, depositProvider: "manual",
    }, "PUT", headers);
    assert.equal(optionalMemo.status, 422);
    assert.equal(optionalMemo.body.code, "CRYPTO_DEPOSIT_MEMO_REQUIRED");
    const afterOptionalMemoSave = await db.select().from(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, [networkAId, networkBId]));
    assert.ok(afterOptionalMemoSave.every(row => row.sharedDepositAddress === "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"));
    assert.ok(afterOptionalMemoSave.every(row => row.sharedDepositMemo === null));
    const auditRows = await db.select().from(operatorAuditLogsTable)
      .where(eq(operatorAuditLogsTable.actorClerkUserId, userId));
    assert.ok(auditRows.some(row =>
      row.action === "crypto_receiving_wallet.updated" &&
      (row.details as {
        selectedNetworkId?: string;
        changes?: Array<{ networkId: string }>;
      }).selectedNetworkId === networkAId &&
      (row.details as { changes?: Array<{ networkId: string }> }).changes?.some(
        change => change.networkId === networkBId,
      )
    ));
  } finally {
    await db.transaction(async tx => {
      for (const state of existingDepositStates) {
        await tx.update(cryptoAssetNetworksTable).set({
          customerDepositsEnabled: state.customerDepositsEnabled,
          updatedAt: state.updatedAt,
        }).where(eq(cryptoAssetNetworksTable.id, state.id));
      }
    });
    await db.delete(operatorAuditLogsTable).where(eq(operatorAuditLogsTable.actorClerkUserId, userId));
    await db.delete(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, [networkAId, networkBId, differentNetworkId]));
    await db.delete(cryptoAssetsTable).where(inArray(cryptoAssetsTable.id, [assetAId, assetBId]));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
    await api.close();
  }
});

test("owner crypto asset bulk edits are atomic and preserve omitted network settings", async () => {
  const {
    cryptoAssetNetworksTable,
    cryptoAssetsTable,
    db,
    operatorsTable,
  } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const suffix = randomUUID();
  const userId = `bulk-owner-${suffix}`;
  const assetAId = `bulk-asset-a-${suffix}`;
  const assetBId = `bulk-asset-b-${suffix}`;
  const networkAId = `bulk-network-a-${suffix}`;
  const networkBId = `bulk-network-b-${suffix}`;
  const [operator] = await db.insert(operatorsTable).values({
    email: `bulk-owner-${suffix}@example.test`,
    clerkUserId: userId,
    role: "owner",
    status: "active",
  }).returning();
  await db.insert(cryptoAssetsTable).values([
    { id: assetAId, code: `BA${suffix.slice(0, 6)}`, name: "Bulk Asset A", decimals: 6 },
    { id: assetBId, code: `BB${suffix.slice(0, 6)}`, name: "Bulk Asset B", decimals: 8 },
  ]);
  await db.insert(cryptoAssetNetworksTable).values([
    {
      id: networkAId, assetId: assetAId, networkCode: `BULK-A-${suffix.slice(0, 8)}`,
      networkName: "Bulk A", networkFamily: "ethereum", decimals: 6, enabled: true,
      sharedDepositAddress: "0x52908400098527886E0F7030069857D2E4169EE7", sharedDepositMemo: "preserve-memo",
      depositProvider: "manual",
    },
    {
      id: networkBId, assetId: assetBId, networkCode: `BULK-B-${suffix.slice(0, 8)}`,
      networkName: "Bulk B", decimals: 8, enabled: true,
      sharedDepositAddress: "", sharedDepositMemo: "asset-b-memo",
      depositProvider: "manual",
    },
  ]);
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: req => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": userId };
  try {
    await db.update(cryptoAssetNetworksTable)
      .set({ customerDepositsEnabled: true })
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    const singleAssetEdit = await apiJson(api.url, `/admin/crypto-assets/${assetAId}`, {
      lifecycle: "restricted",
    }, "PATCH", headers);
    assert.equal(singleAssetEdit.status, 200);
    const [networkAfterSingleAssetEdit] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(networkAfterSingleAssetEdit.customerDepositsEnabled, true);

    const bulkAssetOnlyEdit = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{ assetId: assetAId, lifecycle: "active" }],
    }, "POST", headers);
    assert.equal(bulkAssetOnlyEdit.status, 200);
    const [networkAfterBulkAssetEdit] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(networkAfterBulkAssetEdit.customerDepositsEnabled, true);

    const preserved = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{
        assetId: assetAId,
        lifecycle: "restricted",
        networks: [{
          networkId: networkAId,
          enabled: false,
        }],
      }],
    }, "POST", headers);
    assert.equal(preserved.status, 200);
    const [afterPreserved] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(afterPreserved.enabled, false);
    assert.equal(afterPreserved.sharedDepositAddress, "0x52908400098527886E0F7030069857D2E4169EE7");
    assert.equal(afterPreserved.sharedDepositMemo, "preserve-memo");
    assert.equal(afterPreserved.depositProvider, "manual");
    const [assetAfterPreserved] = await db.select().from(cryptoAssetsTable)
      .where(eq(cryptoAssetsTable.id, assetAId));
    assert.equal(assetAfterPreserved.lifecycle, "restricted");

    const clearedMemo = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{
        assetId: assetAId,
        networks: [{ networkId: networkAId, sharedDepositMemo: null }],
      }],
    }, "POST", headers);
    assert.equal(clearedMemo.status, 200);
    const [afterClearedMemo] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(afterClearedMemo.sharedDepositMemo, null);

    const crossAsset = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{
        assetId: assetAId,
        enabled: false,
        networks: [{ networkId: networkBId, enabled: false }],
      }],
    }, "POST", headers);
    assert.equal(crossAsset.status, 404);
    const [assetAfterCrossAsset] = await db.select().from(cryptoAssetsTable)
      .where(eq(cryptoAssetsTable.id, assetAId));
    assert.equal(assetAfterCrossAsset.enabled, true);
    const [networkAfterCrossAsset] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkBId));
    assert.equal(networkAfterCrossAsset.enabled, true);

    const invalidDeposit = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{
        assetId: assetBId,
        networks: [{ networkId: networkBId, customerDepositsEnabled: true }],
      }],
    }, "POST", headers);
    assert.equal(invalidDeposit.status, 422);
    assert.equal(invalidDeposit.body.code, "CRYPTO_DEPOSIT_VERIFICATION_REQUIRED");
    const [networkAfterInvalidDeposit] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkBId));
    assert.equal(networkAfterInvalidDeposit.customerDepositsEnabled, false);

    const providerAssignmentRejected = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{
        assetId: assetAId,
        networks: [{
          networkId: networkAId,
          depositProvider: "whitebit",
        }],
      }],
    }, "POST", headers);
    assert.equal(providerAssignmentRejected.status, 400);
    const [networkAfterRejectedProvider] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(networkAfterRejectedProvider.depositProvider, "manual");

    await db.update(cryptoAssetNetworksTable)
      .set({ depositProvider: "whitebit", customerDepositsEnabled: true })
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    const whitebitManagedEdit = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{
        assetId: assetAId,
        networks: [{ networkId: networkAId, lifecycle: "restricted" }],
      }],
    }, "POST", headers);
    assert.equal(whitebitManagedEdit.status, 200, JSON.stringify(whitebitManagedEdit.body));
    const [networkAfterWhitebitManagedEdit] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(networkAfterWhitebitManagedEdit.depositProvider, "whitebit");
    assert.equal(networkAfterWhitebitManagedEdit.lifecycle, "restricted");

    const degradedWhitebitFallback = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{
        assetId: assetAId,
        networks: [{
          networkId: networkAId,
          sharedDepositAddress: "bulk-manual-fallback",
          sharedDepositMemo: "bulk-manual-memo",
        }],
      }],
    }, "POST", headers);
    assert.equal(degradedWhitebitFallback.status, 200, JSON.stringify(degradedWhitebitFallback.body));
    const [networkAfterFallback] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(networkAfterFallback.depositProvider, "whitebit");
    assert.equal(networkAfterFallback.customerDepositsEnabled, false);
    assert.equal(networkAfterFallback.sharedDepositAddress, "bulk-manual-fallback");
    assert.equal(networkAfterFallback.sharedDepositMemo, "bulk-manual-memo");

    await db.update(cryptoAssetNetworksTable)
      .set({ sharedDepositMemo: "x".repeat(600) })
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    const invalidOutputRollback = await apiJson(api.url, "/admin/crypto-assets/bulk/apply", {
      edits: [{
        assetId: assetAId,
        enabled: false,
        networks: [{ networkId: networkAId, requiresMemo: true }],
      }],
    }, "POST", headers);
    assert.equal(invalidOutputRollback.status, 400);
    const [assetAfterInvalidOutput] = await db.select().from(cryptoAssetsTable)
      .where(eq(cryptoAssetsTable.id, assetAId));
    const [networkAfterInvalidOutput] = await db.select().from(cryptoAssetNetworksTable)
      .where(eq(cryptoAssetNetworksTable.id, networkAId));
    assert.equal(assetAfterInvalidOutput.enabled, true);
    assert.equal(networkAfterInvalidOutput.requiresMemo, false);
  } finally {
    await db.delete(cryptoAssetNetworksTable)
      .where(inArray(cryptoAssetNetworksTable.id, [networkAId, networkBId]));
    await db.delete(cryptoAssetsTable)
      .where(inArray(cryptoAssetsTable.id, [assetAId, assetBId]));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex reconciliation boundary", async () => {
  reset();
  const {
    db,
    operatorsTable,
    orderAuditLogsTable,
    ordersTable,
    providerSyncStatesTable,
  } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const exchangeRoutes = await import("../src/routes/exchange");
  const suffix = randomUUID();
  const operatorUserId = `user_reconcile_${suffix}`;
  const orderId = `reconcile-${suffix}`;
  const [operator] = await db
    .insert(operatorsTable)
    .values({
      email: `reconcile-${suffix}@example.test`,
      clerkUserId: operatorUserId,
      role: "operator",
      status: "active",
    })
    .returning();
  const [unresolved] = await db
    .insert(ordersTable)
    .values({
      id: orderId,
      type: "instant",
      status: "verification required",
      recordVersion: 1,
      statusVersion: 1,
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "1.23",
      receiveAmount: "99.5",
      customerEmail: "reconcile-customer@example.test",
      destinationAddress: "destination-exact",
      refundAddress: "refund-exact",
      provider: "Quickex",
      providerOrderId: "7001",
      outcomeUnknown: true,
    })
    .returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  providerOrders = [order({ state: "completed", completed: true })];
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": operatorUserId };

  try {
    const unauthorizedHistory = await fetch(
      `${api.url}/admin/orders/${orderId}/reconciliation-attempts`,
    );
    assert.equal(unauthorizedHistory.status, 401);

    await db
      .update(providerSyncStatesTable)
      .set({ leaseToken: null, leaseExpiresAt: null })
      .where(eq(providerSyncStatesTable.provider, "Quickex"));
    const accepted = await apiJson(
      api.url,
      `/admin/orders/${orderId}/reconcile`,
      { recordVersion: unresolved.recordVersion },
      "POST",
      headers,
    );
    assert.equal(accepted.status, 202);
    assert.equal(accepted.body.outcome, "accepted");
    assert.equal((accepted.body.order as Record<string, unknown>).status, "completed");
    assert.equal(createCalls, 0);

    const staleConflict = await apiJson(
      api.url,
      `/admin/orders/${orderId}/reconcile`,
      { recordVersion: unresolved.recordVersion },
      "POST",
      headers,
    );
    assert.equal(staleConflict.status, 409);
    assert.equal(staleConflict.body.code, "ORDER_RECONCILIATION_CONFLICT");

    const [current] = await db
      .update(ordersTable)
      .set({
        status: "verification required",
        outcomeUnknown: true,
        recordVersion: 3,
      })
      .where(eq(ordersTable.id, orderId))
      .returning();
    await db
      .insert(providerSyncStatesTable)
      .values({
        provider: "Quickex",
        leaseToken: "other-sync",
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .onConflictDoUpdate({
        target: providerSyncStatesTable.provider,
        set: {
          leaseToken: "other-sync",
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      });
    const leaseConflict = await apiJson(
      api.url,
      `/admin/orders/${orderId}/reconcile`,
      { recordVersion: current.recordVersion },
      "POST",
      headers,
    );
    assert.equal(leaseConflict.status, 409);
    assert.equal(leaseConflict.body.code, "PROVIDER_SYNC_CONFLICT");

    await db
      .update(providerSyncStatesTable)
      .set({ leaseToken: null, leaseExpiresAt: null })
      .where(eq(providerSyncStatesTable.provider, "Quickex"));
    reset("slowOrders");
    providerOrders = [order({ state: "completed", completed: true })];
    const leaseLossRequest = apiJson(
      api.url,
      `/admin/orders/${orderId}/reconcile`,
      { recordVersion: current.recordVersion },
      "POST",
      headers,
    );
    while (signedCalls === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await db
      .update(providerSyncStatesTable)
      .set({
        leaseToken: "stolen-sync",
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(providerSyncStatesTable.provider, "Quickex"));
    const leaseLost = await leaseLossRequest;
    assert.equal(leaseLost.status, 409);
    assert.equal(leaseLost.body.code, "PROVIDER_SYNC_CONFLICT");

    await db
      .update(providerSyncStatesTable)
      .set({ leaseToken: null, leaseExpiresAt: null })
      .where(eq(providerSyncStatesTable.provider, "Quickex"));
    reset("slowOrdersFailure");
    const failedAfterLeaseLossRequest = apiJson(
      api.url,
      `/admin/orders/${orderId}/reconcile`,
      { recordVersion: current.recordVersion },
      "POST",
      headers,
    );
    while (signedCalls === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await db
      .update(providerSyncStatesTable)
      .set({
        leaseToken: "stolen-before-provider-failure",
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(providerSyncStatesTable.provider, "Quickex"));
    const failedAfterLeaseLoss = await failedAfterLeaseLossRequest;
    assert.equal(failedAfterLeaseLoss.status, 409);
    assert.equal(failedAfterLeaseLoss.body.code, "PROVIDER_SYNC_CONFLICT");

    await db
      .update(providerSyncStatesTable)
      .set({ leaseToken: null, leaseExpiresAt: null })
      .where(eq(providerSyncStatesTable.provider, "Quickex"));
    reset();
    providerOrders = [order({ state: "completed", completed: true })];
    exchangeRoutes.configureTargetedReconciliationBeforeWriteForTests(
      async (targetOrderId) => {
        if (targetOrderId !== orderId) return;
        await db
          .update(providerSyncStatesTable)
          .set({
            leaseToken: "stolen-after-renewal",
            leaseExpiresAt: new Date(Date.now() + 60_000),
          })
          .where(eq(providerSyncStatesTable.provider, "Quickex"));
      },
    );
    const postRenewalLeaseLoss = await apiJson(
      api.url,
      `/admin/orders/${orderId}/reconcile`,
      { recordVersion: current.recordVersion },
      "POST",
      headers,
    );
    assert.equal(postRenewalLeaseLoss.status, 409);
    assert.equal(postRenewalLeaseLoss.body.code, "ORDER_RECONCILIATION_CONFLICT");
    exchangeRoutes.configureTargetedReconciliationBeforeWriteForTests();

    await db
      .update(providerSyncStatesTable)
      .set({ leaseToken: null, leaseExpiresAt: null })
      .where(eq(providerSyncStatesTable.provider, "Quickex"));
    reset("fiveHundred");
    const unavailable = await apiJson(
      api.url,
      `/admin/orders/${orderId}/reconcile`,
      { recordVersion: current.recordVersion },
      "POST",
      headers,
    );
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, "PROVIDER_RECONCILIATION_UNAVAILABLE");
    assert.equal(createCalls, 0);

    const audits = await db
      .select()
      .from(orderAuditLogsTable)
      .where(eq(orderAuditLogsTable.orderId, orderId));
    assert.deepEqual(
      audits.map((audit) => audit.action).sort(),
      [
        "order.reconciliation_accepted",
        "order.reconciliation_conflict",
        "order.reconciliation_conflict",
        "order.reconciliation_conflict",
        "order.reconciliation_conflict",
        "order.reconciliation_conflict",
        "order.reconciliation_provider_unavailable",
      ].sort(),
    );
    assert.ok(audits.every((audit) =>
      audit.actorType === "operator" &&
      audit.actorId === operator.id &&
      Boolean(audit.requestId)
    ));

    const historyResponse = await fetch(
      `${api.url}/admin/orders/${orderId}/reconciliation-attempts`,
      { headers },
    );
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json() as {
      items: Array<{
        outcome: string;
        operatorId: string;
        operator: string;
        requestId: string | null;
        createdAt: string;
      }>;
      limit: number;
    };
    assert.equal(history.limit, 50);
    assert.equal(history.items.length, audits.length);
    assert.deepEqual(
      history.items.map((attempt) => attempt.outcome).sort(),
      ["accepted", "conflict", "conflict", "conflict", "conflict", "conflict", "provider_unavailable"].sort(),
    );
    assert.ok(history.items.every((attempt) =>
      attempt.operatorId === operator.id &&
      attempt.operator === operator.email &&
      Boolean(attempt.requestId) &&
      !Number.isNaN(Date.parse(attempt.createdAt))
    ));

    const capBase = Date.now() + 60_000;
    await db.insert(orderAuditLogsTable).values(
      Array.from({ length: 51 }, (_, index) => ({
        orderId,
        action: "order.reconciliation_conflict",
        actorType: "operator",
        actorId: operator.id,
        requestId: `request-cap-${index}`,
        previousVersion: current.recordVersion,
        nextVersion: current.recordVersion,
        details: { outcome: "conflict" },
        createdAt: new Date(capBase + index),
      })),
    );
    const cappedHistoryResponse = await fetch(
      `${api.url}/admin/orders/${orderId}/reconciliation-attempts`,
      { headers },
    );
    assert.equal(cappedHistoryResponse.status, 200);
    const cappedHistory = await cappedHistoryResponse.json() as {
      items: Array<{ requestId: string | null }>;
      limit: number;
    };
    assert.equal(cappedHistory.limit, 50);
    assert.equal(cappedHistory.items.length, 50);
    assert.equal(cappedHistory.items[0]?.requestId, "request-cap-50");
    assert.equal(cappedHistory.items.at(-1)?.requestId, "request-cap-1");
  } finally {
    exchangeRoutes.configureTargetedReconciliationBeforeWriteForTests();
    reset();
    await api.close();
    await deleteOrderAuditLogsForMaintenance(orderId);
    await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
    await db
      .delete(providerSyncStatesTable)
      .where(eq(providerSyncStatesTable.provider, "Quickex"));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
  }
});

test("production denies every operator route without a Clerk session", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const api = await startApi();
  try {
    const protectedRequests = [
      fetch(`${api.url}/orders`),
      fetch(`${api.url}/orders/QX-${randomUUID()}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "must not be applied" }),
      }),
      fetch(`${api.url}/admin/summary`),
      fetch(`${api.url}/admin/customers`),
      fetch(`${api.url}/admin/orders.xml`),
      fetch(`${api.url}/quickex/admin/credentials`),
      fetch(`${api.url}/quickex/admin/credentials/test`, { method: "POST" }),
      fetch(`${api.url}/quickex/admin/credentials`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicKey: "must-not-authorize",
          secretKey: "must-not-authorize",
        }),
      }),
    ];
    for (const response of await Promise.all(protectedRequests)) {
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        error: "Operator authentication is required.",
        code: "OPERATOR_AUTH_REQUIRED",
        retryable: false,
        outcomeUnknown: false,
      });
    }

    const publicCreate = await apiJson(api.url, "/orders", {});
    assert.equal(publicCreate.status, 400);
    assert.equal(publicCreate.body.code, "VALIDATION_ERROR");
    const publicStatus = await fetch(`${api.url}/orders/QX-partial/status`);
    assert.equal(publicStatus.status, 400);
    assert.equal((await publicStatus.json() as Record<string, unknown>).code, "VALIDATION_ERROR");

    const malformedJson = await fetch(`${api.url}/exchange/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"amount":',
    });
    assert.equal(malformedJson.status, 400);
    assert.deepEqual(await malformedJson.json(), {
      error: "The request body contains invalid JSON.",
      code: "VALIDATION_ERROR",
      retryable: false,
      outcomeUnknown: false,
    });
  } finally {
    await api.close();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("static bearer and query tokens cannot authorize operator access", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const token = `operator-test-${randomUUID()}`;
  process.env.NODE_ENV = "production";
  const api = await startApi();
  try {
    for (const response of [
      await fetch(`${api.url}/orders`),
      await fetch(`${api.url}/orders`, { headers: { authorization: "Bearer wrong-test-token" } }),
      await fetch(`${api.url}/orders?token=${encodeURIComponent(token)}`),
      await fetch(`${api.url}/orders?access_token=${encodeURIComponent(token)}`),
    ]) {
      assert.equal(response.status, 401);
      assert.equal((await response.json() as Record<string, unknown>).code, "OPERATOR_AUTH_REQUIRED");
    }

    const bearerAttempt = await fetch(`${api.url}/orders`, {
      headers: {
        authorization: `Bearer ${token}`,
        origin: "https://hostile-origin.example",
      },
    });
    assert.equal(bearerAttempt.status, 401);
    assert.equal(bearerAttempt.headers.get("access-control-allow-origin"), null);
  } finally {
    await api.close();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("operator allowlist parsing is trimmed, case-insensitive, and deduplicated", async () => {
  const { parseOperatorEmails } = await import("../src/lib/operator-auth");
  assert.deepEqual(
    [...parseOperatorEmails(" First@Example.COM,second@example.com, first@example.com ,,")],
    ["first@example.com", "second@example.com"],
  );
  assert.deepEqual([...parseOperatorEmails(undefined)], []);
});

test.skip("obsolete exchange-owned Quickex public status boundary", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const api = await startApi();
  const {
    db,
    ordersTable,
    customersTable,
    providerSyncStatesTable,
  } = await import("@workspace/db");
  const uuid = randomUUID();
  const id = `QX-${uuid}`;
  const customerEmail = `public-status-${uuid}@example.test`;
  const createdAt = new Date("2025-01-02T03:04:05.000Z");
  try {
    await db.delete(providerSyncStatesTable);
    await db.insert(ordersTable).values({
      id,
      type: "manual",
      status: "awaiting customer payment",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "9007199254740993.123456789012345678",
      receiveAmount: "12345678901234567890.000000000000000001",
      customerEmail,
      customerName: "Sensitive Customer Name",
      destinationAddress: "private-destination-address",
      destinationMemo: "private-destination-memo",
      refundAddress: "private-refund-address",
      refundMemo: "private-refund-memo",
      depositAddress: "customer-deposit-address",
      depositMemo: "customer-deposit-memo",
      paymentMethod: "private-payment-method",
      payoutMethod: "private-payout-method",
      provider: "Manual desk",
      note: "private operator note",
      providerReference: "private-provider-reference",
      providerOrderId: "private-provider-order-id",
      providerState: "awaiting payment",
      errorCode: "QUICKEX_PRIVATE_CODE",
      errorMessage: "Quickex raw upstream error text",
      quoteId: "private-quote-id",
      clientRequestId: randomUUID(),
      createdAt,
    });
    await db.insert(customersTable).values({
      id: `cus-${uuid}`,
      name: "Sensitive Customer Name",
      email: customerEmail,
      ordersCount: 1,
      volume: "1234.56",
      lastActivity: createdAt,
    });

    const response = await fetch(`${api.url}/orders/${id}/status`);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, {
      id,
      type: "manual",
      status: "awaiting customer payment",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "9007199254740993.123456789012345678",
      receiveAmount: "12345678901234567890.000000000000000001",
      outcomeUnknown: false,
      refreshUnavailable: false,
      providerFreshness: {
        state: "unavailable",
        syncing: false,
      },
      createdAt: createdAt.toISOString(),
      manualSettlementState: "not_required",
    });
    const { signOrderTrackingToken } = await import("../src/lib/order-access");
    const authorizedResponse = await fetch(
      `${api.url}/orders/${id}/status?trackingToken=${encodeURIComponent(signOrderTrackingToken(id))}`,
    );
    const authorizedBody = await authorizedResponse.json() as Record<string, unknown>;
    assert.equal(authorizedBody.depositAddress, "customer-deposit-address");
    assert.equal(authorizedBody.depositMemo, "customer-deposit-memo");
    for (const sensitiveKey of [
      "customerEmail", "customerName",
      "destinationAddress", "destinationMemo", "refundAddress", "refundMemo",
      "paymentMethod", "payoutMethod", "note", "providerReference",
      "providerOrderId", "quoteId", "clientRequestId",
      "provider", "providerState", "errorCode", "errorMessage",
    ]) {
      assert.equal(Object.hasOwn(body, sensitiveKey), false, `public status leaked ${sensitiveKey}`);
    }

    for (const invalidId of [`QX-${uuid.slice(0, -1)}`, "QX-not-a-valid-uuid"]) {
      const invalid = await fetch(`${api.url}/orders/${invalidId}/status`);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json() as Record<string, unknown>).code, "VALIDATION_ERROR");
    }
    const unknown = await fetch(`${api.url}/orders/QX-${randomUUID()}/status`);
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json() as Record<string, unknown>).code, "ORDER_NOT_FOUND");
  } finally {
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await db.delete(customersTable).where(eq(customersTable.email, customerEmail));
    await api.close();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test.skip("obsolete exchange-owned Quickex tracking boundary", async () => {
  reset("fiveHundred");
  const api = await startApi();
  const { db, ordersTable, providerSyncStatesTable } =
    await import("@workspace/db");
  const id = `QX-${randomUUID()}`;
  try {
    await db.delete(providerSyncStatesTable);
    await db.insert(ordersTable).values({
      id,
      type: "instant",
      status: "awaiting deposit",
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "1",
      receiveAmount: "99.5",
      customerEmail: `refresh-warning-${randomUUID()}@example.test`,
      customerName: "Tracking Customer",
      destinationAddress: "destination-exact",
      refundAddress: "refund-exact",
      depositAddress: "saved-deposit-address",
      provider: "Quickex",
      providerState: "sending payout",
      errorCode: "QUICKEX_UPSTREAM_INTERNAL",
      errorMessage: "Quickex raw provider failure",
      outcomeUnknown: false,
      createdAt: new Date(),
    });

    const response = await fetch(`${api.url}/orders/${id}/status`);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.id, id);
    assert.equal(body.status, "awaiting deposit");
    assert.equal(body.depositAddress, undefined);
    assert.equal(body.rateMode, "FLOATING");
    assert.equal(body.refreshUnavailable, true);
    const { signOrderTrackingToken } = await import("../src/lib/order-access");
    const authorized = await fetch(
      `${api.url}/orders/${id}/status?trackingToken=${encodeURIComponent(signOrderTrackingToken(id))}`,
    );
    const authorizedBody = await authorized.json() as Record<string, unknown>;
    assert.equal(authorizedBody.depositAddress, "saved-deposit-address");
    for (const key of ["provider", "providerState", "errorCode", "errorMessage"]) {
      assert.equal(Object.hasOwn(body, key), false, `tracking response leaked ${key}`);
    }
    assert.equal(JSON.stringify(body).includes("Quickex"), false);
  } finally {
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex legacy order boundary", async () => {
  reset();
  const api = await startApi();
  const { db, ordersTable } = await import("@workspace/db");
  const id = `QX-${randomUUID()}`;
  try {
    await db.insert(ordersTable).values({
      id,
      type: "instant",
      status: "awaiting deposit",
      fromAsset: "BTC",
      toAsset: "USDT",
      amount: "1.23",
      receiveAmount: "99",
      customerEmail: `legacy-network-${randomUUID()}@example.test`,
      destinationAddress: "destination-exact",
      refundAddress: "refund-exact",
      depositAddress: "legacy-deposit-address",
      provider: "Quickex",
      createdAt: new Date(1_700_000_000_000),
    });

    const response = await fetch(`${api.url}/orders/${id}/status`);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.status, "verification required");
    assert.equal(body.outcomeUnknown, true);
    assert.equal(Object.hasOwn(body, "errorCode"), false);
    assert.equal(body.fromNetwork, undefined);
    assert.equal(body.toNetwork, undefined);

    const [stored] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id))
      .limit(1);
    assert.equal(stored?.providerOrderId, "");
    assert.equal(stored?.providerState, "");
    assert.equal(stored?.fromNetwork, "");
    assert.equal(stored?.toNetwork, "");
    assert.equal(stored?.status, "verification required");
    assert.equal(stored?.errorCode, "LEGACY_NETWORK_MISSING");
  } finally {
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex idempotency boundary", async () => {
  reset();
  const api = await startApi();
  const { db, ordersTable, customersTable } = await import("@workspace/db");
  const email = `quickex-idempotent-${Date.now()}@example.test`;
  const authEmail = `quickex-auth-${Date.now()}@example.test`;
  const addressEmail = `quickex-address-${Date.now()}@example.test`;
  const requestId = requestIdForTest(1);
  let id = "";
  try {
    const quoted = await instantQuote(api.url);
    assert.equal(quoted.status, 200);
    const payload = {
      type: "instant", fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20", amount: 1,
      customerEmail: email, destinationAddress: "destination-exact", refundAddress: "refund-exact",
      quoteId: quoted.body.quoteId, clientRequestId: requestId,
    };
    const first = await apiJson(api.url, "/orders", payload);
    const second = await apiJson(api.url, "/orders", payload);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(first.body.id, second.body.id);
    assert.equal(createCalls, 1);
    id = String(first.body.id);

    reset("auth");
    const authQuote = await instantQuote(api.url);
    const rejected = await apiJson(api.url, "/orders", {
      ...payload, customerEmail: authEmail,
      clientRequestId: requestIdForTest(2), quoteId: authQuote.body.quoteId,
    });
    assert.equal(rejected.status, 503);
    assert.equal(rejected.body.code, "QUICKEX_AUTH");
    assert.equal(rejected.body.retryable, false);
    assert.equal(rejected.body.outcomeUnknown, false);
    assert.ok(typeof rejected.body.orderId === "string");
    assert.equal(JSON.stringify(rejected.body).includes("IP address"), false);
    await db.delete(ordersTable).where(eq(ordersTable.id, String(rejected.body.orderId)));
    await db.delete(customersTable).where(eq(customersTable.email, authEmail));

    reset("address");
    const addressQuote = await instantQuote(api.url);
    const invalidAddress = await apiJson(api.url, "/orders", {
      ...payload, customerEmail: addressEmail,
      clientRequestId: requestIdForTest(5), quoteId: addressQuote.body.quoteId,
    });
    assert.equal(invalidAddress.status, 400);
    assert.equal(invalidAddress.body.code, "QUICKEX_INVALID_ADDRESS");
    assert.equal(invalidAddress.body.retryable, false);
    assert.equal(invalidAddress.body.outcomeUnknown, false);
    assert.equal(JSON.stringify(invalidAddress.body).includes("Quickex"), false);
    await db.delete(ordersTable).where(eq(ordersTable.id, String(invalidAddress.body.orderId)));
    await db.delete(customersTable).where(eq(customersTable.email, addressEmail));
  } finally {
    if (id) await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await db.delete(customersTable).where(eq(customersTable.email, email));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex one-step boundary", async () => {
  reset();
  const api = await startApi();
  const { db, ordersTable, customersTable } = await import("@workspace/db");
  const email = `quickex-one-step-${Date.now()}@example.test`;
  const clientRequestId = requestIdForTest(101);
  let id = "";
  const payload = {
    type: "instant",
    fromAsset: "BTC", fromNetwork: "Bitcoin",
    toAsset: "USDT", toNetwork: "TRC20",
    amount: 1,
    customerEmail: email,
    destinationAddress: "destination-exact",
    refundAddress: "refund-exact",
    sourceSettlementOptionId: "crypto:btc-btc",
    targetSettlementOptionId: "crypto:usdt-trc20",
    clientRequestId,
    rateMode: "FIXED",
  };
  try {
    const first = await apiJson(api.url, "/exchange/orders", payload);
    const repeat = await apiJson(api.url, "/exchange/orders", payload);
    assert.equal(first.status, 201);
    assert.equal(repeat.status, 200);
    assert.equal(first.body.id, repeat.body.id);
    assert.equal(first.body.rateMode, "FIXED");
    assert.equal(quoteCalls, 1);
    assert.equal(createCalls, 1);
    assert.deepEqual(requestedRateModes, ["FIXED"]);
    assert.equal(createPayloads[0]?.rateMode, "FIXED");
    id = String(first.body.id);

    const conflict = await apiJson(api.url, "/exchange/orders", { ...payload, rateMode: "FLOATING" });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(quoteCalls, 1);
    assert.equal(createCalls, 1);

    const [stored] = await db.select().from(ordersTable)
      .where(eq(ordersTable.id, id)).limit(1);
    assert.ok(stored?.quoteId);
    assert.equal(stored?.receiveAmount, "99.5000");
    assert.equal(stored?.rateMode, "FIXED");
    assert.equal(stored?.sourceSettlementOptionId, "crypto:btc-btc");
    assert.equal(stored?.targetSettlementOptionId, "crypto:usdt-trc20");

    const publicStatus = await fetch(`${api.url}/orders/${id}/status`);
    assert.equal(publicStatus.status, 200);
    assert.equal((await publicStatus.json() as Record<string, unknown>).rateMode, "FIXED");
  } finally {
    if (id) await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await db.delete(customersTable).where(eq(customersTable.email, email));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex accepted-order boundary", async () => {
  reset();
  const api = await startApi();
  const { db, ordersTable, customersTable } = await import("@workspace/db");
  const { failNextAcceptedOrderPersistenceForTest } = await import("../src/routes/exchange");
  const email = `accepted-persistence-${Date.now()}@example.test`;
  const clientRequestId = requestIdForTest(109);
  let id = "";
  try {
    failNextAcceptedOrderPersistenceForTest();
    const payload = {
      type: "instant",
      fromAsset: "BTC", fromNetwork: "Bitcoin",
      toAsset: "USDT", toNetwork: "TRC20",
      amount: 1,
      customerEmail: email,
      destinationAddress: "destination-exact",
      refundAddress: "refund-exact",
      clientRequestId,
      rateMode: "FLOATING",
    };
    const first = await apiJson(api.url, "/exchange/orders", payload);
    const repeat = await apiJson(api.url, "/exchange/orders", payload);
    assert.equal(first.status, 202);
    assert.equal(first.body.status, "verification required");
    assert.equal(first.body.outcomeUnknown, false);
    assert.equal(first.body.depositAddress, "deposit");
    assert.equal(repeat.status, 200);
    assert.equal(repeat.body.id, first.body.id);
    assert.equal(createCalls, 1);
    id = String(first.body.id);
  } finally {
    if (id) await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await db.delete(customersTable).where(eq(customersTable.email, email));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex one-step validation boundary", async () => {
  reset();
  const api = await startApi();
  const { db, ordersTable, customersTable } = await import("@workspace/db");
  const manualEmail = `manual-one-step-${Date.now()}@example.test`;
  const manualRequestId = requestIdForTest(104);
  let manualId = "";
  try {
    const missingAddress = await apiJson(api.url, "/exchange/orders", {
      type: "instant",
      fromAsset: "BTC", fromNetwork: "Bitcoin",
      toAsset: "USDT", toNetwork: "TRC20",
      amount: 1,
      customerEmail: "missing-address@example.test",
      clientRequestId: requestIdForTest(102),
    });
    assert.equal(missingAddress.status, 400);
    assert.equal(missingAddress.body.code, "QUICKEX_INVALID_ADDRESS");
    assert.equal(quoteCalls, 0);
    assert.equal(createCalls, 0);

    const missingMemo = await apiJson(api.url, "/exchange/orders", {
      type: "instant",
      fromAsset: "BTC", fromNetwork: "Bitcoin",
      toAsset: "XRP", toNetwork: "Ripple",
      amount: 1,
      customerEmail: "missing-memo@example.test",
      destinationAddress: "destination-exact",
      refundAddress: "refund-exact",
      clientRequestId: requestIdForTest(103),
    });
    assert.equal(missingMemo.status, 400);
    assert.equal(missingMemo.body.code, "QUICKEX_INVALID_MEMO");
    assert.equal(quoteCalls, 0);
    assert.equal(createCalls, 0);

    const manual = await apiJson(api.url, "/exchange/orders", {
      type: "manual",
      fromAsset: "eur", fromNetwork: "sepa",
      toAsset: "btc", toNetwork: "bitcoin",
      amount: 250,
      customerEmail: manualEmail,
      paymentMethod: "Bank transfer",
      payoutMethod: "Wallet",
      clientRequestId: manualRequestId,
    });
    assert.equal(manual.status, 201);
    assert.match(String(manual.body.id), /^O[0-9]{9}$/);
    assert.equal(manual.body.provider, "Manual desk");
    assert.ok(Number(manual.body.receiveAmount) > 0);
    assert.equal(Object.hasOwn(manual.body, "rateMode"), false);
    assert.equal(quoteCalls, 0);
    assert.equal(createCalls, 0);
    const manualStatus = await fetch(`${api.url}/orders/${manual.body.id}/status`);
    assert.equal(manualStatus.status, 200);
    assert.equal((await manualStatus.json() as any).id, manual.body.id);
    manualId = String(manual.body.id);
    const manualRepeat = await apiJson(api.url, "/exchange/orders", {
      type: "manual",
      fromAsset: "eur", fromNetwork: "sepa",
      toAsset: "btc", toNetwork: "bitcoin",
      amount: 250,
      customerEmail: manualEmail,
      paymentMethod: "Bank transfer",
      payoutMethod: "Wallet",
      clientRequestId: manualRequestId,
    });
    assert.equal(manualRepeat.status, 200);
    assert.equal(manualRepeat.body.id, manual.body.id);
    assert.equal(quoteCalls, 0);
    assert.equal(createCalls, 0);
  } finally {
    if (manualId) await db.delete(ordersTable).where(eq(ordersTable.id, manualId));
    await db.delete(customersTable).where(eq(customersTable.email, manualEmail));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex fixed-rate boundary", async () => {
  reset("mismatchedRateMode");
  const api = await startApi();
  const { db, ordersTable } = await import("@workspace/db");
  const clientRequestId = requestIdForTest(108);
  try {
    const response = await apiJson(api.url, "/exchange/orders", {
      type: "instant",
      fromAsset: "BTC", fromNetwork: "Bitcoin",
      toAsset: "USDT", toNetwork: "TRC20",
      amount: 1,
      customerEmail: "fixed-mismatch@example.test",
      destinationAddress: "destination-exact",
      refundAddress: "refund-exact",
      clientRequestId,
      rateMode: "FIXED",
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.code, "QUICKEX_RATE_MODE_UNAVAILABLE");
    assert.equal(createCalls, 0);
    const rows = await db.select().from(ordersTable)
      .where(eq(ordersTable.clientRequestId, clientRequestId));
    assert.equal(rows.length, 0);
  } finally {
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex unknown-outcome boundary", async () => {
  reset("missingSlow");
  const api = await startApi();
  const { db, ordersTable, customersTable } = await import("@workspace/db");
  const email = `quickex-one-step-unknown-${Date.now()}@example.test`;
  const payload = {
    type: "instant",
    fromAsset: "BTC", fromNetwork: "Bitcoin",
    toAsset: "USDT", toNetwork: "TRC20",
    amount: 1,
    customerEmail: email,
    destinationAddress: "destination-exact",
    refundAddress: "refund-exact",
    clientRequestId: requestIdForTest(105),
  };
  let id = "";
  try {
    const uncertain = await apiJson(api.url, "/exchange/orders", payload);
    assert.equal(uncertain.status, 202);
    assert.equal(uncertain.body.outcomeUnknown, true);
    assert.equal(uncertain.body.errorCode, "QUICKEX_TIMEOUT");
    id = String(uncertain.body.id);

    const repeat = await apiJson(api.url, "/exchange/orders", payload);
    assert.equal(repeat.status, 202);
    assert.equal(repeat.body.id, id);
    assert.equal(repeat.body.outcomeUnknown, true);
    assert.equal(quoteCalls, 1);
    assert.equal(createCalls, 1);
  } finally {
    if (id) await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await db.delete(customersTable).where(eq(customersTable.email, email));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex stale-intent boundary", async () => {
  reset();
  const api = await startApi();
  const { db, ordersTable } = await import("@workspace/db");
  const preparingId = `QX-${randomUUID()}`;
  const submittedId = `QX-${randomUUID()}`;
  const preparingRequestId = requestIdForTest(106);
  const submittedRequestId = requestIdForTest(107);
  const createdAt = new Date(Date.now() - 3 * 60 * 1000);
  const base = {
    type: "instant",
    status: "creating",
    fromAsset: "BTC",
    fromNetwork: "Bitcoin",
    toAsset: "USDT",
    toNetwork: "TRC20",
    amount: "1",
    receiveAmount: "99.5",
    customerEmail: "stale-intent@example.test",
    customerName: "Guest",
    destinationAddress: "destination-exact",
    refundAddress: "refund-exact",
    provider: "Quickex",
    quoteId: "signed-internal-ticket",
    outcomeUnknown: false,
    createdAt,
  };
  try {
    await db.insert(ordersTable).values([
      {
        ...base,
        id: preparingId,
        clientRequestId: preparingRequestId,
        providerState: "preparing",
      },
      {
        ...base,
        id: submittedId,
        customerEmail: "stale-submitted@example.test",
        clientRequestId: submittedRequestId,
        providerState: "submission pending",
      },
    ]);

    const preparing = await apiJson(api.url, "/exchange/orders", {
      type: "instant",
      fromAsset: "BTC", fromNetwork: "Bitcoin",
      toAsset: "USDT", toNetwork: "TRC20",
      amount: 1,
      customerEmail: "stale-intent@example.test",
      destinationAddress: "destination-exact",
      refundAddress: "refund-exact",
      clientRequestId: preparingRequestId,
    });
    assert.equal(preparing.status, 200);
    assert.equal(preparing.body.status, "failed");
    assert.equal(preparing.body.outcomeUnknown, false);
    assert.equal(preparing.body.errorCode, "ORDER_CREATE_NOT_STARTED");

    const submitted = await apiJson(api.url, "/exchange/orders", {
      type: "instant",
      fromAsset: "BTC", fromNetwork: "Bitcoin",
      toAsset: "USDT", toNetwork: "TRC20",
      amount: 1,
      customerEmail: "stale-submitted@example.test",
      destinationAddress: "destination-exact",
      refundAddress: "refund-exact",
      clientRequestId: submittedRequestId,
    });
    assert.equal(submitted.status, 202);
    assert.equal(submitted.body.status, "verification required");
    assert.equal(submitted.body.outcomeUnknown, true);
    assert.equal(submitted.body.errorCode, "ORDER_OUTCOME_UNKNOWN");
    assert.equal(quoteCalls, 0);
    assert.equal(createCalls, 0);
  } finally {
    await db.delete(ordersTable).where(eq(ordersTable.id, preparingId));
    await db.delete(ordersTable).where(eq(ordersTable.id, submittedId));
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex accepted reconciliation boundary", async () => {
  const api = await startApi();
  const { db, ordersTable, customersTable } = await import("@workspace/db");
  const email = `quickex-uncertain-${Date.now()}@example.test`;
  const missingEmail = `quickex-missing-${Date.now()}@example.test`;
  const ids: string[] = [];
  try {
    reset("acceptedSlow");
    const quoted = await instantQuote(api.url);
    const payload = {
      type: "instant", fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20", amount: 1,
      customerEmail: email, destinationAddress: "destination-exact", refundAddress: "refund-exact",
      quoteId: quoted.body.quoteId, clientRequestId: requestIdForTest(3),
    };
    const uncertain = await apiJson(api.url, "/orders", payload);
    assert.equal(uncertain.status, 202);
    assert.equal(uncertain.body.status, "verification required");
    assert.equal(uncertain.body.outcomeUnknown, false);
    ids.push(String(uncertain.body.id));
    const duplicate = await apiJson(api.url, "/orders", payload);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.id, uncertain.body.id);
    assert.equal(createCalls, 1);

    reset("missingSlow");
    const missingQuote = await instantQuote(api.url);
    const missing = await apiJson(api.url, "/orders", {
      ...payload, customerEmail: missingEmail, quoteId: missingQuote.body.quoteId,
      clientRequestId: requestIdForTest(4),
    });
    assert.equal(missing.status, 202);
    assert.equal(missing.body.outcomeUnknown, true);
    assert.equal(missing.body.errorCode, "QUICKEX_TIMEOUT");
    ids.push(String(missing.body.id));
    assert.equal(createCalls, 1);
  } finally {
    for (const id of ids) await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await db.delete(customersTable).where(eq(customersTable.email, email));
    await db.delete(customersTable).where(eq(customersTable.email, missingEmail));
    await api.close();
  }
});

test("manual order submission rejects a fiat route disabled after quoting", async () => {
  reset();
  const api = await startApi();
  const { db, fiatCurrenciesTable, manualDeskPricingRulesTable } = await import("@workspace/db");
  let ruleId: string | undefined;
  try {
    const config = await (await fetch(`${api.url}/exchange/config`)).json() as any;
    const source = config.manualSettlementOptions.find((option: any) =>
      option.assetCode === "EUR" && option.routeNetwork === "SEPA" &&
      (option.direction === "send" || option.direction === "both"));
    const target = config.manualSettlementOptions.find((option: any) =>
      option.assetCode === "USD" && option.routeNetwork === "Bank transfer" &&
      (option.direction === "receive" || option.direction === "both"));
    assert.ok(source && target);
    ruleId = await createExactPathRule({
      sourceAsset: "EUR", targetAsset: "USD", sourceNetwork: "SEPA",
      targetNetwork: "Bank transfer", sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id, exactRate: "1.1",
    });
    const quoteInput = {
      type: "manual",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "USD",
      toNetwork: "Bank transfer",
      amount: 100,
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
    };
    const quote = await apiJson(api.url, "/exchange/quote", quoteInput);
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    await db.update(fiatCurrenciesTable)
      .set({ enabled: false })
      .where(eq(fiatCurrenciesTable.code, "EUR"));

    const legacy = await apiJson(api.url, "/orders", {
      ...quoteInput,
      customerEmail: "disabled-legacy@example.test",
      quoteId: quote.body.quoteId,
      clientRequestId: requestIdForTest(420),
    });
    assert.equal(legacy.status, 422);
    assert.equal(legacy.body.code, "SETTLEMENT_OPTION_INVALID");

    const modern = await apiJson(api.url, "/exchange/orders", {
      ...quoteInput,
      quoteId: quote.body.quoteId,
      customerEmail: "disabled-modern@example.test",
      clientRequestId: requestIdForTest(421),
    });
    assert.equal(modern.status, 422);
    assert.equal(modern.body.code, "DESK_ROUTE_INVALID");
  } finally {
    if (ruleId) await db.delete(manualDeskPricingRulesTable).where(eq(manualDeskPricingRulesTable.id, ruleId));
    await db.update(fiatCurrenciesTable)
      .set({ enabled: true })
      .where(eq(fiatCurrenciesTable.code, "EUR"));
    manualDeskRates.invalidateManualDeskFiatRateCache();
    await api.close();
  }
});

test("manual estimates without exact settlement options remain quote-only", async () => {
  reset();
  const api = await startApi();
  try {
    const estimateInput = {
      type: "manual",
      fromAsset: "USD",
      fromNetwork: "Bank transfer",
      toAsset: "EUR",
      toNetwork: "SEPA",
      amount: 100,
    };
    const estimate = await apiJson(api.url, "/exchange/quote", estimateInput);
    assert.equal(estimate.status, 200, JSON.stringify(estimate.body));
    const signed = JSON.parse(
      Buffer.from(String(estimate.body.quoteId).split(".")[0], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    assert.equal(signed.manualOrderCreationDisabled, true);
    const order = await apiJson(api.url, "/orders", {
      ...estimateInput,
      quoteId: estimate.body.quoteId,
      customerEmail: "non-executable-estimate@example.test",
      clientRequestId: randomUUID(),
    });
    assert.equal(order.status, 400);
    assert.equal(order.body.code, "SETTLEMENT_OPTION_REQUIRED");
  } finally {
    await api.close();
  }
});

test("v2 manual orders reject payment-method limits or availability changed after quoting", async () => {
  reset();
  const api = await startApi();
  const {
    db,
    fiatCurrenciesTable,
    fiatCurrencyPaymentMethodsTable,
    paymentMethodsTable,
  } = await import("@workspace/db");
  const methodId = `attachment-fence-${randomUUID()}`;
  let sourceAttachmentId: string | undefined;
  let ruleId: string | undefined;
  try {
    const [eur] = await db.select().from(fiatCurrenciesTable)
      .where(eq(fiatCurrenciesTable.code, "EUR"));
    const [usd] = await db.select().from(fiatCurrenciesTable)
      .where(eq(fiatCurrenciesTable.code, "USD"));
    await db.insert(paymentMethodsTable).values({
      id: methodId,
      name: "Attachment fence test",
      family: "bank-transfer",
      executionMode: "manual",
      enabled: true,
      canSend: true,
      canReceive: true,
      fieldDefinitions: [],
    });
    const [sourceAttachment] = await db.insert(fiatCurrencyPaymentMethodsTable).values({
      fiatCurrencyId: eur!.id,
      paymentMethodId: methodId,
      enabled: true,
      canSend: true,
      canReceive: true,
      sendInstructions: "Use the original transfer reference.",
    }).returning();
    const [targetAttachment] = await db.insert(fiatCurrencyPaymentMethodsTable).values({
      fiatCurrencyId: usd!.id,
      paymentMethodId: methodId,
      enabled: true,
      canSend: true,
      canReceive: true,
    }).returning();
    sourceAttachmentId = sourceAttachment.id;
    const quoteInput = {
      type: "manual", fromAsset: "EUR", fromNetwork: "SEPA",
      toAsset: "USD", toNetwork: "Bank transfer", amount: 100,
      sourceSettlementOptionId: `fiat:${eur!.id}:${sourceAttachment.paymentMethodId}`,
      targetSettlementOptionId: `fiat:${usd!.id}:${targetAttachment.paymentMethodId}`,
    };
    ruleId = await createExactPathRule({
      sourceAsset: "EUR", targetAsset: "USD", sourceNetwork: "SEPA",
      targetNetwork: "Bank transfer", sourceSettlementOptionId: quoteInput.sourceSettlementOptionId,
      targetSettlementOptionId: quoteInput.targetSettlementOptionId, exactRate: "1.1",
    });
    const quote = await apiJson(api.url, "/exchange/quote", quoteInput);
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    await db.update(fiatCurrencyPaymentMethodsTable).set({
      sendInstructions: "Use a changed transfer reference.",
    }).where(eq(fiatCurrencyPaymentMethodsTable.id, sourceAttachment.id));
    const changedInstructions = await apiJson(api.url, "/orders", {
      ...quoteInput, quoteId: quote.body.quoteId,
      customerEmail: "changed-instructions-v2-attachment@example.test",
      clientRequestId: requestIdForTest(422), settlementDetails: {},
    });
    assert.equal(changedInstructions.status, 409);
    assert.equal(changedInstructions.body.code, "SETTLEMENT_OPTION_CHANGED");
    await db.update(fiatCurrencyPaymentMethodsTable).set({ minAmount: "101" })
      .where(eq(fiatCurrencyPaymentMethodsTable.id, sourceAttachment.id));
    await db.update(fiatCurrencyPaymentMethodsTable).set({
      sendInstructions: "Use the original transfer reference.",
    }).where(eq(fiatCurrencyPaymentMethodsTable.id, sourceAttachment.id));
    const changedLimit = await apiJson(api.url, "/orders", {
      ...quoteInput, quoteId: quote.body.quoteId,
      customerEmail: "changed-limit-v2-attachment@example.test",
      clientRequestId: requestIdForTest(423), settlementDetails: {},
    });
    assert.equal(changedLimit.status, 409, JSON.stringify(changedLimit.body));
    assert.equal(changedLimit.body.code, "SETTLEMENT_OPTION_CHANGED");
    await db.update(fiatCurrencyPaymentMethodsTable).set({
      minAmount: null,
      enabled: false,
    }).where(eq(fiatCurrencyPaymentMethodsTable.id, sourceAttachment.id));
    const order = await apiJson(api.url, "/orders", {
      ...quoteInput, quoteId: quote.body.quoteId,
      customerEmail: "disabled-v2-attachment@example.test",
      clientRequestId: requestIdForTest(424), settlementDetails: {},
    });
    assert.equal(order.status, 422);
    assert.equal(order.body.code, "SETTLEMENT_OPTION_INVALID");
  } finally {
    if (sourceAttachmentId) {
      await db.update(fiatCurrencyPaymentMethodsTable).set({
        enabled: true,
        minAmount: null,
        sendInstructions: "Use the original transfer reference.",
      })
        .where(eq(fiatCurrencyPaymentMethodsTable.id, sourceAttachmentId));
    }
    await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.id, methodId));
    if (ruleId) await db.delete((await import("@workspace/db")).manualDeskPricingRulesTable)
      .where(eq((await import("@workspace/db")).manualDeskPricingRulesTable.id, ruleId));
    await api.close();
  }
});

test.skip("obsolete mixed Manual and Quickex configuration boundary", async () => {
  reset();
  const api = await startApi();
  const { db, ordersTable, customersTable } = await import("@workspace/db");
  const emails = [`manual-config-${randomUUID()}@example.test`, `instant-config-${randomUUID()}@example.test`];
  const ids: string[] = [];
  try {
    const config = await (await fetch(`${api.url}/exchange/config`)).json() as {
      settlementOptions: Array<{
        id: string; assetCode: string; routeNetwork: string; kind: string; networkSlug?: string;
      }>;
      instantSettlementOptions: Array<{
        id: string; assetCode: string; routeNetwork: string; kind: string; networkSlug?: string;
      }>;
    };
    const fiat = config.settlementOptions.find(option =>
      option.assetCode === "EUR" && option.kind === "fiat-payment-method");
    const bitcoin = config.settlementOptions.find(option => option.id === "crypto:btc-bitcoin");
    const usdt = config.settlementOptions.find(option => option.id === "crypto:usdt-trc20");
    assert.ok(fiat && bitcoin && usdt);
    assert.equal(fiat.networkSlug, undefined);
    assert.equal(bitcoin.routeNetwork, "Bitcoin");
    assert.equal(usdt.routeNetwork, "TRC20");
    const instantBitcoin = config.instantSettlementOptions.find(option => option.id === "crypto:btc-btc");
    const instantUsdt = config.instantSettlementOptions.find(option => option.id === "crypto:usdt-trc20");
    assert.ok(instantBitcoin && instantUsdt);

    const manualInput = {
      type: "manual", fromAsset: fiat.assetCode, fromNetwork: fiat.routeNetwork,
      toAsset: bitcoin.assetCode, toNetwork: bitcoin.routeNetwork, amount: 100,
      sourceSettlementOptionId: fiat.id, targetSettlementOptionId: bitcoin.id,
    };
    const manualQuote = await apiJson(api.url, "/exchange/quote", manualInput);
    assert.equal(manualQuote.status, 200);
    const manualOrder = await apiJson(api.url, "/orders", {
      ...manualInput, quoteId: manualQuote.body.quoteId,
      settlementDetails: settlementDetailsFixture(manualQuote.body.requiredSettlementFields),
      destinationAddress: "manual-config-destination",
      customerEmail: emails[0], clientRequestId: requestIdForTest(423),
    });
    assert.equal(manualOrder.status, 201);
    ids.push(String(manualOrder.body.id));

    const instantInput = {
      type: "instant", fromAsset: instantBitcoin.assetCode, fromNetwork: instantBitcoin.routeNetwork,
      toAsset: instantUsdt.assetCode, toNetwork: instantUsdt.routeNetwork, amount: 1,
      sourceSettlementOptionId: instantBitcoin.id, targetSettlementOptionId: instantUsdt.id,
      destinationAddress: "config-destination", refundAddress: "config-refund",
      rateMode: "FLOATING",
    };
    const instantQuote = await apiJson(api.url, "/exchange/quote", instantInput);
    assert.equal(instantQuote.status, 200);
    const instantOrder = await apiJson(api.url, "/orders", {
      ...instantInput, quoteId: instantQuote.body.quoteId,
      customerEmail: emails[1], clientRequestId: requestIdForTest(424),
    });
    assert.equal(instantOrder.status, 201);
    ids.push(String(instantOrder.body.id));
  } finally {
    if (ids.length) await db.delete(ordersTable).where(inArray(ordersTable.id, ids));
    await db.delete(customersTable).where(inArray(customersTable.email, emails));
    await api.close();
  }
});

test("manual desk quotes only allow configured routes containing fiat", async () => {
  reset();
  const api = await startApi();
  let ruleId: string | undefined;
  try {
    const initialConfig = await (await fetch(`${api.url}/exchange/config`)).json() as any;
    const routeSource = initialConfig.settlementOptions.find((option: any) =>
      option.assetCode === "EUR" && (option.direction === "send" || option.direction === "both"));
    const routeTarget = initialConfig.settlementOptions.find((option: any) =>
      option.assetCode === "BTC" && (option.direction === "receive" || option.direction === "both"));
    assert.ok(routeSource && routeTarget);
    ruleId = await createExactPathRule({
      sourceAsset: routeSource.assetCode, targetAsset: routeTarget.assetCode,
      sourceNetwork: routeSource.routeNetwork, targetNetwork: routeTarget.routeNetwork,
      sourceSettlementOptionId: routeSource.id, targetSettlementOptionId: routeTarget.id,
      exactRate: "0.00002",
    });
    const desk = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: routeSource.assetCode, fromNetwork: routeSource.routeNetwork,
      toAsset: routeTarget.assetCode, toNetwork: routeTarget.routeNetwork, amount: 250,
      sourceSettlementOptionId: routeSource.id, targetSettlementOptionId: routeTarget.id,
    });
    assert.equal(desk.status, 200);
    assert.equal(desk.body.provider, "Manual desk");
    assert.ok(Number(desk.body.receiveAmount) > 0);
    assert.ok(Number(desk.body.rate) > 0);
    assert.equal(Number(desk.body.fee), 0);
    const configResponse = await fetch(`${api.url}/exchange/config`);
    const configBody = await configResponse.json() as {
      assets?: Array<{ code?: string; network?: string; precision?: number }>;
      settlementOptions?: Array<{
        id?: string;
        kind?: string;
        assetCode?: string;
        requiresMemo?: boolean;
      }>;
      manualRouteAvailability?: {
        routes?: Array<{
          sourceSettlementOptionId: string;
          targetSettlementOptionId: string;
        }>;
      };
      providers?: string[];
    };
    const configuredBitcoin = configBody.assets?.find(
      asset => asset.code === "BTC" && asset.network === "Bitcoin",
    );
    assert.equal(configuredBitcoin?.precision, 8);
    const rippleOption = configBody.settlementOptions?.find(
      option => option.id === "crypto:xrp-xrpl",
    );
    assert.equal(rippleOption?.kind, "crypto-network");
    assert.equal(rippleOption?.requiresMemo, true);
    assert.deepEqual(configBody.providers, ["Manual desk", "Quickex"]);
    const configuredRoute = configBody.manualRouteAvailability?.routes?.find((route) => {
      const source = configBody.settlementOptions?.find(
        option => option.id === route.sourceSettlementOptionId,
      );
      const target = configBody.settlementOptions?.find(
        option => option.id === route.targetSettlementOptionId,
      );
      return source?.assetCode === "EUR" && target?.assetCode === "BTC";
    });
    assert.ok(configuredRoute);
    const routePricingResponse = await fetch(
      `${api.url}/exchange/route-pricing?${new URLSearchParams(configuredRoute).toString()}`,
    );
    assert.equal(routePricingResponse.status, 200);
    const routePricing = await routePricingResponse.json() as {
      sourceSettlementOptionId?: string;
      targetSettlementOptionId?: string;
      fromAsset?: string;
      toAsset?: string;
      rate?: number;
      minAmount?: number;
      maxAmount?: number;
    };
    assert.equal(routePricing.sourceSettlementOptionId, configuredRoute.sourceSettlementOptionId);
    assert.equal(routePricing.targetSettlementOptionId, configuredRoute.targetSettlementOptionId);
    assert.ok(Number(routePricing.rate) > 0);
    if (routePricing.minAmount !== undefined) assert.ok(routePricing.minAmount >= 0);
    if (routePricing.maxAmount !== undefined) assert.ok(routePricing.maxAmount > 0);

    const cryptoOnly = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20", amount: 1,
    });
    assert.equal(cryptoOnly.status, 422);
    assert.equal(cryptoOnly.body.code, "DESK_ROUTE_INVALID");
    const fakeFiatNetwork = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "EUR", fromNetwork: "Invented wire", toAsset: "BTC", toNetwork: "Bitcoin", amount: 250,
    });
    assert.equal(fakeFiatNetwork.status, 422);
    assert.equal(fakeFiatNetwork.body.code, "DESK_ROUTE_INVALID");
  } finally {
    if (ruleId) {
      const { db, manualDeskPricingRulesTable } = await import("@workspace/db");
      await db.delete(manualDeskPricingRulesTable).where(eq(manualDeskPricingRulesTable.id, ruleId));
    }
    await api.close();
  }
});

test.skip("obsolete market-provider manual desk conversion fallback", async () => {
  reset();
  manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
    USD: 1, EUR: 0.8, GBP: 0.5, AED: 4, BTC: 0.00002, USDT: 1, XRP: 2,
  }));
  const api = await startApi();
  try {
    const fiatToCrypto = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "BTC", toNetwork: "Bitcoin", amount: 80,
    });
    assert.equal(fiatToCrypto.status, 200);
    // 80 EUR / 0.8 EUR-per-USD * 0.00002 BTC-per-USD, less 0.6%.
    assert.equal(fiatToCrypto.body.receiveAmount, 0.001988);
    assert.equal(fiatToCrypto.body.fee, 0.000012);
    assert.equal(fiatToCrypto.body.rate, 0.00002485);

    const cryptoToFiat = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "GBP", toNetwork: "Bank transfer", amount: 0.01,
    });
    assert.equal(cryptoToFiat.status, 200);
    assert.equal(cryptoToFiat.body.receiveAmount, 248.5);

    const fiatToFiat = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "AED", fromNetwork: "Bank transfer", toAsset: "EUR", toNetwork: "SEPA", amount: 400,
    });
    assert.equal(fiatToFiat.status, 200);
    assert.equal(fiatToFiat.body.receiveAmount, 79.52);

    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.8, GBP: 0.5, AED: 4, BTC: 0.000020129, USDT: 1, XRP: 2,
    }));
    const precisionBound = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer", toAsset: "BTC", toNetwork: "Bitcoin", amount: 1,
    });
    assert.equal(precisionBound.status, 200);
    assert.equal(precisionBound.body.receiveAmount, 0.00001999);
    assert.equal(precisionBound.body.fee, 0.00000013);
    assert.equal(
      Number(precisionBound.body.receiveAmount) + Number(precisionBound.body.fee),
      0.00002012,
    );

    await assert.rejects(
      manualDeskRates.getManualDeskEstimate({
        sourceCurrency: "USD",
        targetCurrency: "BTC",
        targetPrecision: 18,
        amount: 1,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "MANUAL_DESK_RATE_UNAVAILABLE",
    );
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1,
      BTC: "123456789.12345678",
    }));
    await assert.rejects(
      manualDeskRates.getManualDeskEstimate({
        sourceCurrency: "USD",
        targetCurrency: "BTC",
        targetPrecision: 8,
        amount: 1,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "MANUAL_DESK_RATE_UNAVAILABLE",
    );

    const identical = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "EUR", toNetwork: "SEPA", amount: 10,
    });
    assert.equal(identical.status, 422);

    manualDeskRates.configureManualDeskRateAdapterForTests(async () => {
      throw new Error("upstream detail must not reach the customer");
    });
    const unavailable = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "EUR", fromNetwork: "SEPA", toAsset: "BTC", toNetwork: "Bitcoin", amount: 10,
    });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, "MANUAL_DESK_RATE_UNAVAILABLE");
    assert.equal(String(unavailable.body.error).includes("upstream detail"), false);
  } finally {
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
    await api.close();
  }
});

test("manual desk reference rates are not distorted by target atomic-unit rounding", async () => {
  reset();
  manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
    USD: 1,
    USDT: 1,
    EUR: 0.825,
  }));

  const rate = await manualDeskRates.getManualDeskReferenceRate({
    sourceCurrency: "USDT",
    targetCurrency: "EUR",
    markupBasisPoints: 100,
  });

  assert.equal(rate, 0.81675);
});

test("manual desk pricing uses canonical atomic rounding for every fee component", async () => {
  manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
    USD: "1", USDT: "1", BTC: "1",
  }));
  const estimate = (input: Partial<{
    amount: number; targetPrecision: number; markupBasisPoints: number; fixedFee: string | null;
    targetCurrency: string;
  }> = {}) => manualDeskRates.getManualDeskEstimate({
    sourceCurrency: "USD",
    targetCurrency: input.targetCurrency ?? "USDT",
    targetPrecision: input.targetPrecision ?? 2,
    amount: input.amount ?? 1,
    markupBasisPoints: input.markupBasisPoints ?? 0,
    fixedFee: input.fixedFee,
  });
  try {
    const cases = [
      {
        name: "gross is truncated at target precision",
        input: { amount: 1.239, targetPrecision: 2 },
        exact: { grossMarketAmount: "1.23", percentageCommission: "0", fixedCommission: "0", totalFee: "0", receiveAmount: "1.23" },
      },
      {
        name: "percentage commission is rounded up atomically",
        input: { amount: 1, targetPrecision: 2, markupBasisPoints: 1 },
        exact: { grossMarketAmount: "1", percentageCommission: "0.01", fixedCommission: "0", totalFee: "0.01", receiveAmount: "0.99" },
      },
      {
        name: "fixed fee is rounded up atomically",
        input: { amount: 1, targetPrecision: 2, fixedFee: "0.001" },
        exact: { grossMarketAmount: "1", percentageCommission: "0", fixedCommission: "0.01", totalFee: "0.01", receiveAmount: "0.99" },
      },
      {
        name: "zero fees remain canonical zero decimals",
        input: { amount: 1, targetPrecision: 2, fixedFee: "0" },
        exact: { grossMarketAmount: "1", percentageCommission: "0", fixedCommission: "0", totalFee: "0", receiveAmount: "1" },
      },
      {
        name: "small high precision values do not lose atomic units",
        input: { amount: 0.00000001, targetPrecision: 8, targetCurrency: "BTC" },
        exact: { grossMarketAmount: "0.00000001", percentageCommission: "0", fixedCommission: "0", totalFee: "0", receiveAmount: "0.00000001" },
      },
    ];
    for (const row of cases) {
      const result = await estimate(row.input);
      assert.deepEqual(
        {
          grossMarketAmount: result.exact.grossMarketAmount,
          percentageCommission: result.exact.percentageCommission,
          fixedCommission: result.exact.fixedCommission,
          totalFee: result.exact.totalFee,
          receiveAmount: result.exact.receiveAmount,
        },
        row.exact,
        row.name,
      );
      for (const value of [
        result.exact.grossMarketAmount, result.exact.percentageCommission,
        result.exact.fixedCommission, result.exact.totalFee, result.exact.receiveAmount,
        result.exact.finalRate, result.exact.sourceReference.unitsPerUsd,
        result.exact.targetReference.unitsPerUsd,
      ]) {
        assert.match(value, /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
      }
    }
    for (const fixedFee of ["1", "2"]) {
      await assert.rejects(
        estimate({ amount: 1, targetPrecision: 2, fixedFee }),
        (error: unknown) => error instanceof Error && "code" in error &&
          error.code === "MANUAL_DESK_FEE_EXCEEDS_AMOUNT",
      );
    }
  } finally {
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
  }
});

test("low-rate manual tickets persist a non-exponent canonical final rate", async () => {
  manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
    USD: "1", BTC: "0.00000001",
  }));
  const api = await startApi();
  const { db, customersTable, ordersTable, manualDeskPricingRulesTable } = await import("@workspace/db");
  const email = `low-rate-${randomUUID()}@example.test`;
  let id = "";
  let ruleId: string | undefined;
  try {
    const config = await (await fetch(`${api.url}/exchange/config`)).json() as any;
    const source = config.manualSettlementOptions.find((option: any) =>
      option.assetCode === "USD" && option.routeNetwork === "Bank transfer" &&
      (option.direction === "send" || option.direction === "both"));
    const target = config.manualSettlementOptions.find((option: any) =>
      option.id === "crypto:btc-bitcoin" &&
      (option.direction === "receive" || option.direction === "both"));
    assert.ok(source && target);
    const route = {
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
    };
    ruleId = await createExactPathRule({
      sourceAsset: "USD", targetAsset: "BTC", sourceNetwork: "Bank transfer",
      targetNetwork: "Bitcoin", sourceSettlementOptionId: route.sourceSettlementOptionId,
      targetSettlementOptionId: route.targetSettlementOptionId, exactRate: "0.00000001",
    });
    const quote = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer",
      toAsset: "BTC", toNetwork: "Bitcoin", amount: 100,
      paymentMethod: "bank transfer", payoutMethod: "wallet",
      ...route,
    });
    assert.equal(quote.status, 200);
    assert.deepEqual(quote.body.requiredSettlementFields, []);
    const signed = JSON.parse(
      Buffer.from(String(quote.body.quoteId).split(".")[0], "base64url").toString("utf8"),
    ) as { pricingSnapshot: { amounts: { finalRate: string } } };
    assert.equal(signed.pricingSnapshot.amounts.finalRate, "0.00000001");
    assert.equal(/[eE]/.test(signed.pricingSnapshot.amounts.finalRate), false);
    const order = await apiJson(api.url, "/orders", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer",
      toAsset: "BTC", toNetwork: "Bitcoin", amount: 100,
      quoteId: quote.body.quoteId, customerEmail: email,
      clientRequestId: randomUUID(),
      paymentMethod: "bank transfer", payoutMethod: "wallet",
      destinationAddress: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
      ...route,
    });
    assert.equal(order.status, 201);
    id = String(order.body.id);
    assert.equal(order.body.pricingSnapshot.amounts.finalRate, "0.00000001");
  } finally {
    if (id) await db.delete(ordersTable).where(eq(ordersTable.id, id));
    if (ruleId) await db.delete(manualDeskPricingRulesTable).where(eq(manualDeskPricingRulesTable.id, ruleId));
    await db.delete(customersTable).where(eq(customersTable.email, email));
    await api.close();
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
  }
});

test.skip("obsolete market-provider manual desk feed selection", async () => {
  reset();
  manualDeskRates.configureManualDeskRateAdapterForTests(undefined);
  const api = await startApi();
  try {
    const fiatOnly = await apiJson(api.url, "/exchange/quote", {
      type: "manual",
      fromAsset: "AED",
      fromNetwork: "Bank transfer",
      toAsset: "EUR",
      toNetwork: "SEPA",
      amount: 400,
    });
    assert.equal(fiatOnly.status, 200);
    assert.equal(fiatOnly.body.receiveAmount, 79.52);
    assert.equal(fiatRateCalls, 0);
    assert.equal(cryptoRateCalls, 0);
    assert.deepEqual(receivedOneForgeKeys, ["test-oneforge"]);

    const usdToCrypto = await apiJson(api.url, "/exchange/quote", {
      type: "manual",
      fromAsset: "USD",
      fromNetwork: "Bank transfer",
      toAsset: "BTC",
      toNetwork: "Bitcoin",
      amount: 100,
    });
    assert.equal(usdToCrypto.status, 200);
    assert.equal(usdToCrypto.body.receiveAmount, 0.001988);
    assert.equal(fiatRateCalls, 1);
    assert.equal(cryptoRateCalls, 1);

    const mixed = await apiJson(api.url, "/exchange/quote", {
      type: "manual",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "BTC",
      toNetwork: "Bitcoin",
      amount: 80,
    });
    assert.equal(mixed.status, 200);
    assert.equal(mixed.body.receiveAmount, 0.001988);
    assert.equal(fiatRateCalls, 1);
    assert.equal(cryptoRateCalls, 1);

    marketRateMode = "badFiat";
    manualDeskRates.configureManualDeskRateAdapterForTests(undefined);
    const badFiat = await apiJson(api.url, "/exchange/quote", {
      type: "manual",
      fromAsset: "USD",
      fromNetwork: "Bank transfer",
      toAsset: "EUR",
      toNetwork: "SEPA",
      amount: 100,
    });
    assert.equal(badFiat.status, 503);
    assert.equal(badFiat.body.code, "MANUAL_DESK_RATE_UNAVAILABLE");
    assert.equal(JSON.stringify(badFiat.body).toLowerCase().includes("1forge"), false);
    assert.equal(JSON.stringify(badFiat.body).includes("test-oneforge"), false);

    marketRateMode = "badCrypto";
    manualDeskRates.configureManualDeskRateAdapterForTests(undefined);
    const badCrypto = await apiJson(api.url, "/exchange/quote", {
      type: "manual",
      fromAsset: "USD",
      fromNetwork: "Bank transfer",
      toAsset: "BTC",
      toNetwork: "Bitcoin",
      amount: 100,
    });
    assert.equal(badCrypto.status, 503);
    assert.equal(badCrypto.body.code, "MANUAL_DESK_RATE_UNAVAILABLE");
    assert.equal(JSON.stringify(badCrypto.body).toLowerCase().includes("coinbase"), false);
  } finally {
    marketRateMode = "ok";
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
    await api.close();
  }
});

test("manual desk invalidation fences stale fiat completion from the crypto cache", async () => {
  let releaseOldFiat: (() => void) | undefined;
  let oldFiatStarted: (() => void) | undefined;
  let fiatCalls = 0;
  let cryptoCalls = 0;
  const oldFiatStartedPromise = new Promise<void>((resolve) => {
    oldFiatStarted = resolve;
  });
  const oldFiatReleasePromise = new Promise<void>((resolve) => {
    releaseOldFiat = resolve;
  });
  manualDeskRates.configureManualDeskMarketAdaptersForTests({
    fiat: async () => {
      fiatCalls++;
      if (fiatCalls === 1) {
        oldFiatStarted?.();
        await oldFiatReleasePromise;
      }
      return { USD: 1, EUR: "0.8" };
    },
    crypto: async () => {
      cryptoCalls++;
      return { USD: 1, BTC: "0.00002" };
    },
  });
  try {
    const staleFiat = manualDeskRates.getManualDeskEstimate({
      sourceCurrency: "EUR", targetCurrency: "USD", targetPrecision: 2, amount: 10,
    });
    await oldFiatStartedPromise;
    manualDeskRates.invalidateManualDeskFiatRateCache();

    const crypto = await manualDeskRates.getManualDeskEstimate({
      sourceCurrency: "USD", targetCurrency: "BTC", targetPrecision: 8, amount: 100,
    });
    assert.equal(crypto.receiveAmount, 0.001988);
    releaseOldFiat?.();
    await staleFiat;

    const freshFiat = await manualDeskRates.getManualDeskEstimate({
      sourceCurrency: "EUR", targetCurrency: "USD", targetPrecision: 2, amount: 10,
    });
    assert.equal(freshFiat.receiveAmount, 12.42);
    assert.equal(fiatCalls, 2);
    const cryptoAgain = await manualDeskRates.getManualDeskEstimate({
      sourceCurrency: "USD", targetCurrency: "BTC", targetPrecision: 8, amount: 100,
    });
    assert.equal(cryptoAgain.receiveAmount, 0.001988);
    assert.equal(cryptoCalls, 1);
  } finally {
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
  }
});

test("cached market references retain their original completion timestamps", async () => {
  let fiatLoads = 0;
  let cryptoLoads = 0;
  manualDeskRates.configureManualDeskMarketAdaptersForTests({
    fiat: async () => {
      fiatLoads++;
      return { USD: "1", EUR: "0.9" };
    },
    crypto: async () => {
      cryptoLoads++;
      return { USD: "1", BTC: "0.00002" };
    },
  });
  try {
    const first = await manualDeskRates.getManualDeskEstimate({
      sourceCurrency: "EUR", targetCurrency: "BTC", targetPrecision: 8,
      amount: 100, markupBasisPoints: 0,
    });
    const second = await manualDeskRates.getManualDeskEstimate({
      sourceCurrency: "EUR", targetCurrency: "BTC", targetPrecision: 8,
      amount: 100, markupBasisPoints: 0,
    });
    assert.equal(fiatLoads, 1);
    assert.equal(cryptoLoads, 1);
    assert.equal(
      first.exact.sourceReference.observedAt,
      second.exact.sourceReference.observedAt,
    );
    assert.equal(
      first.exact.targetReference.observedAt,
      second.exact.targetReference.observedAt,
    );
    assert.equal(first.exact.sourceReference.timestampKind, "fetchedAt");
    assert.equal(first.exact.targetReference.timestampKind, "fetchedAt");
  } finally {
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
  }
});

test.skip("obsolete provider-backed manual pricing health", async () => {
  reset();
  const { db, fiatCurrenciesTable, operatorsTable } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const suffix = randomUUID();
  const userId = `user_fiat_operator_${suffix}`;
  const [operator] = await db.insert(operatorsTable).values({
    email: `fiat-operator-${suffix}@example.test`,
    clerkUserId: userId,
    role: "operator",
    status: "active",
  }).returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": userId };
  let createdId: string | undefined;
  const [existingJpy] = await db.select({
    id: fiatCurrenciesTable.id,
    enabled: fiatCurrenciesTable.enabled,
  }).from(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.code, "JPY")).limit(1);
  const [fixtureJpy] = existingJpy
    ? [existingJpy]
    : await db.insert(fiatCurrenciesTable).values({
      code: "JPY",
      name: "Japanese Yen",
      enabled: false,
    }).returning({
      id: fiatCurrenciesTable.id,
      enabled: fiatCurrenciesTable.enabled,
    });
  try {
    const unauthorized = await fetch(`${api.url}/admin/fiat-currencies`);
    assert.equal(unauthorized.status, 401);

    const seeded = await fetch(`${api.url}/admin/fiat-currencies`, { headers });
    assert.equal(seeded.status, 200);
    const seededBody = await seeded.json() as Array<{ id: string; code: string; enabled: boolean }>;
    assert.deepEqual(
      seededBody.filter(({ code }) => ["USD", "EUR", "GBP", "AED"].includes(code))
        .map(({ code }) => code)
        .sort(),
      ["AED", "EUR", "GBP", "USD"],
    );

    const seededJpy = seededBody.find(({ code }) => code === "JPY");
    assert.ok(seededJpy);
    assert.equal(seededJpy.id, fixtureJpy.id);
    const created = await apiJson(api.url, `/admin/fiat-currencies/${seededJpy.id}`, {
      enabled: true,
    }, "PATCH", headers);
    assert.equal(created.status, 200);
    assert.equal(created.body.code, "JPY");
    createdId = seededJpy.id;

    manualDeskRates.configureManualDeskRateAdapterForTests(undefined);
    expectedOneForgePairs = "AED/USD,USD/AED,DZD/USD,USD/DZD,EUR/USD,USD/EUR,GBP/USD,USD/GBP,JPY/USD,USD/JPY,KZT/USD,USD/KZT,TRY/USD,USD/TRY";
    const coldHealth = await fetch(`${api.url}/admin/providers/oneforge`, { headers });
    const coldHealthBody = await coldHealth.json() as Record<string, unknown>;
    assert.equal(coldHealth.status, 200);
    assert.equal(coldHealthBody.state, "healthy");
    assert.equal(fiatRateCalls, 1);
    assert.equal(JSON.stringify(coldHealthBody).includes("test-oneforge"), false);

    const quoteResponse = await apiJson(api.url, "/exchange/quote", {
      type: "manual",
      fromAsset: "JPY",
      fromNetwork: "fiat",
      toAsset: "USD",
      toNetwork: "Bank transfer",
      amount: 160,
    });
    assert.equal(quoteResponse.status, 200);
    assert.equal(quoteResponse.body.receiveAmount, 0.99);
    assert.equal(fiatRateCalls, 1);

    const disabled = await apiJson(api.url, `/admin/fiat-currencies/${createdId}`, {
      enabled: false,
    }, "PATCH", headers);
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.enabled, false);
    const config = await fetch(`${api.url}/exchange/config`);
    const configBody = await config.json() as { fiatCurrencies: string[] };
    assert.equal(configBody.fiatCurrencies.includes("JPY"), false);
    expectedOneForgePairs = "AED/USD,USD/AED,DZD/USD,USD/DZD,EUR/USD,USD/EUR,GBP/USD,USD/GBP,KZT/USD,USD/KZT,TRY/USD,USD/TRY";
    const refreshedHealth = await fetch(`${api.url}/admin/providers/oneforge`, { headers });
    assert.equal(refreshedHealth.status, 200);
    assert.equal(fiatRateCalls, 2);
  } finally {
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
    if (existingJpy) {
      await db.update(fiatCurrenciesTable)
        .set({ enabled: existingJpy.enabled })
        .where(eq(fiatCurrenciesTable.id, existingJpy.id));
    } else {
      await db.delete(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.id, fixtureJpy.id));
    }
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
    await api.close();
  }
});

test("exact settlement pricing outranks a more-specific legacy pricing rule", async () => {
  const { db, manualDeskPricingRulesTable } = await import("@workspace/db");
  const { matchManualDeskPricingRule } = await import("../src/lib/manual-desk-pricing");
  const ids = [randomUUID(), randomUUID()];
  try {
    await db.insert(manualDeskPricingRulesTable).values([
      {
        id: ids[0], name: "Exact route", sourceAsset: "RANK-S", targetAsset: "RANK-T",
        sourceSettlementOptionId: "option-source", targetSettlementOptionId: "option-target",
        markupBasisPoints: 1, exactRate: "2", priority: -100, enabled: true,
      },
      {
        id: ids[1], name: "Legacy route", sourceAsset: "RANK-S", targetAsset: "RANK-T",
        sourceNetwork: "A", targetNetwork: "B", paymentMethod: "PAY", payoutMethod: "OUT",
        markupBasisPoints: 999, priority: 999, enabled: true,
      },
    ]);
    const matched = await matchManualDeskPricingRule({
      sourceAsset: "RANK-S", targetAsset: "RANK-T", sourceNetwork: "A", targetNetwork: "B",
      paymentMethod: "PAY", payoutMethod: "OUT",
      sourceSettlementOptionId: "option-source", targetSettlementOptionId: "option-target",
    });
    assert.equal(matched.id, ids[0]);
  } finally {
    await db.delete(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ids));
  }
});

test("partial settlement-option pricing outranks legacy rules while exact pairs remain strongest", async () => {
  const { db, manualDeskPricingRulesTable } = await import("@workspace/db");
  const { matchManualDeskPricingRule } = await import("../src/lib/manual-desk-pricing");
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  try {
    await db.insert(manualDeskPricingRulesTable).values([
      {
        id: ids[0], name: "Exact pair", sourceAsset: "WILD-S", targetAsset: "WILD-T",
        sourceSettlementOptionId: "wild-source", targetSettlementOptionId: "wild-target",
        markupBasisPoints: 10, exactRate: "2", priority: -100, enabled: true,
      },
      {
        id: ids[1], name: "Any source to target", targetAsset: "WILD-T",
        targetSettlementOptionId: "wild-target",
        markupBasisPoints: 20, exactRate: "2.1", priority: -50, enabled: true,
      },
      {
        id: ids[2], name: "Source to any target", sourceAsset: "WILD-S",
        sourceSettlementOptionId: "wild-source",
        markupBasisPoints: 30, exactRate: "2.2", priority: -50, enabled: true,
      },
      {
        id: ids[3], name: "Legacy specific", sourceAsset: "WILD-S", targetAsset: "WILD-T",
        sourceNetwork: "A", targetNetwork: "B", paymentMethod: "PAY", payoutMethod: "OUT",
        markupBasisPoints: 999, priority: 999, enabled: true,
      },
    ]);

    const exact = await matchManualDeskPricingRule({
      sourceAsset: "WILD-S", targetAsset: "WILD-T", sourceNetwork: "A", targetNetwork: "B",
      paymentMethod: "PAY", payoutMethod: "OUT",
      sourceSettlementOptionId: "wild-source", targetSettlementOptionId: "wild-target",
    });
    assert.equal(exact.id, ids[0]);

    const anySource = await matchManualDeskPricingRule({
      sourceAsset: "OTHER-S", targetAsset: "WILD-T", sourceNetwork: "A", targetNetwork: "B",
      paymentMethod: "PAY", payoutMethod: "OUT",
      sourceSettlementOptionId: "other-source", targetSettlementOptionId: "wild-target",
    });
    assert.equal(anySource.id, ids[1]);

    const anyTarget = await matchManualDeskPricingRule({
      sourceAsset: "WILD-S", targetAsset: "OTHER-T", sourceNetwork: "A", targetNetwork: "B",
      paymentMethod: "PAY", payoutMethod: "OUT",
      sourceSettlementOptionId: "wild-source", targetSettlementOptionId: "other-target",
    });
    assert.equal(anyTarget.id, ids[2]);
  } finally {
    await db.delete(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ids));
  }
});

test("manual pricing conflict checks use the same settlement-option tier as matching", async () => {
  const { db, manualDeskPricingRulesTable } = await import("@workspace/db");
  const { createManualPricingRule, updateManualPricingRule } = await import("../src/lib/manual-desk-pricing");
  const ids = [randomUUID()];
  try {
    await db.insert(manualDeskPricingRulesTable).values({
      id: ids[0],
      name: "Legacy cross-tier overlap",
      targetAsset: "CONFLICT-T",
      sourceNetwork: "CONFLICT-N",
      markupBasisPoints: 10,
      priority: 543210,
      enabled: true,
    });
    const created = await createManualPricingRule({
      name: "Partial wildcard wins deterministically",
      targetAsset: "CONFLICT-T",
      targetSettlementOptionId: "conflict-target",
      markupBasisPoints: 20,
      priority: 543210,
      enabled: true,
    });
    ids.push(created.id);
    const updated = await updateManualPricingRule(created.id, created.version, {
      name: "Updated partial wildcard wins deterministically",
      targetAsset: "CONFLICT-T",
      targetSettlementOptionId: "conflict-target",
      markupBasisPoints: 25,
      priority: 543210,
      enabled: true,
    });
    assert.equal(updated.name, "Updated partial wildcard wins deterministically");
  } finally {
    await db.delete(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ids));
  }
});

test("operators can price enabled fiat settlement routes with exact and fallback references", async () => {
  reset();
  manualDeskRates.configureManualDeskRateAdapterForTests(undefined);
  const { db, manualDeskPricingRulesTable, operatorsTable } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const suffix = randomUUID();
  const userId = `user_exact_fiat_pricing_${suffix}`;
  const [operator] = await db.insert(operatorsTable).values({
    email: `exact-fiat-pricing-${suffix}@example.test`,
    clerkUserId: userId,
    role: "operator",
    status: "active",
    permissionAllows: ["pricing.view", "pricing.manage"],
  }).returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: req => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": userId };
  const ruleIds: string[] = [];
  try {
    const configResponse = await fetch(`${api.url}/exchange/config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json() as {
      settlementOptions: Array<{
        id: string;
        assetCode: string;
        routeNetwork: string;
        kind: string;
        direction: "send" | "receive" | "both";
      }>;
    };
    const source = config.settlementOptions.find(option =>
      option.kind === "fiat-payment-method" &&
      option.assetCode === "EUR" &&
      (option.direction === "send" || option.direction === "both"));
    const target = config.settlementOptions.find(option =>
      option.kind === "fiat-payment-method" &&
      option.assetCode === "USD" &&
      (option.direction === "receive" || option.direction === "both"));
    assert.ok(source && target);
    assert.notEqual(source.id, target.id);

    const exactRule = {
      name: "Exact enabled EUR to USD fiat route",
      sourceAsset: source.assetCode,
      targetAsset: target.assetCode,
      sourceNetwork: source.routeNetwork,
      targetNetwork: target.routeNetwork,
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
      markupBasisPoints: 125,
      fixedFee: null,
      exactRate: "1.1",
      priority: 701,
      enabled: true,
    };
    const created = await apiJson(
      api.url,
      "/admin/manual-desk-pricing-rules",
      exactRule,
      "POST",
      headers,
    );
    assert.equal(created.status, 201);
    const ruleId = String(created.body.id);
    ruleIds.push(ruleId);
    const anyToAny = await apiJson(
      api.url,
      "/admin/manual-desk-pricing-rules",
      {
        name: "Global any to any fallback",
        sourceAsset: null,
        targetAsset: null,
        sourceNetwork: null,
        targetNetwork: null,
        paymentMethod: null,
        payoutMethod: null,
        sourceSettlementOptionId: null,
        targetSettlementOptionId: null,
        markupBasisPoints: 100,
        priority: 9999,
        enabled: true,
      },
      "POST",
      headers,
    );
    assert.equal(anyToAny.status, 201);
    ruleIds.push(String(anyToAny.body.id));
    assert.equal(anyToAny.body.sourceSettlementOptionId, null);
    assert.equal(anyToAny.body.targetSettlementOptionId, null);
    assert.equal(anyToAny.body.legacyAmbiguous, false);
    assert.equal(anyToAny.body.readOnly, false);
    const selectorBasedAnyToAny = await apiJson(
      api.url,
      "/admin/manual-desk-pricing-rules",
      {
        ...exactRule,
        name: "Invalid selector-based any to any",
        sourceSettlementOptionId: null,
        targetSettlementOptionId: null,
      },
      "POST",
      headers,
    );
    assert.equal(selectorBasedAnyToAny.status, 400);
    assert.equal(selectorBasedAnyToAny.body.code, "SETTLEMENT_OPTION_INVALID");
    assert.equal(created.body.markupBasisPoints, 125);

    const preview = await apiJson(api.url, "/admin/manual-desk-pricing-rules/preview", {
      sourceAsset: source.assetCode,
      targetAsset: target.assetCode,
      sourceNetwork: source.routeNetwork,
      targetNetwork: target.routeNetwork,
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
    }, "POST", headers);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.id, ruleId);

    const mismatchedCreate = await apiJson(
      api.url,
      "/admin/manual-desk-pricing-rules",
      { ...exactRule, name: "Mismatched exact fiat route", sourceAsset: target.assetCode },
      "POST",
      headers,
    );
    assert.equal(mismatchedCreate.status, 422);
    assert.equal(mismatchedCreate.body.code, "SETTLEMENT_OPTION_INVALID");
    assert.match(
      String(mismatchedCreate.body.error),
      /pricing settlement options must match each selected asset, network, and direction/i,
    );

    const mismatchedPreview = await apiJson(api.url, "/admin/manual-desk-pricing-rules/preview", {
      sourceAsset: target.assetCode,
      targetAsset: source.assetCode,
      sourceNetwork: source.routeNetwork,
      targetNetwork: target.routeNetwork,
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
    }, "POST", headers);
    assert.equal(mismatchedPreview.status, 422);
    assert.equal(mismatchedPreview.body.code, "SETTLEMENT_OPTION_INVALID");
    assert.match(
      String(mismatchedPreview.body.error),
      /pricing settlement options must match each selected asset, network, and direction/i,
    );

    const quote = await apiJson(api.url, "/exchange/quote", {
      type: "manual",
      fromAsset: source.assetCode,
      fromNetwork: source.routeNetwork,
      toAsset: target.assetCode,
      toNetwork: target.routeNetwork,
      amount: 100,
      sourceSettlementOptionId: source.id,
      targetSettlementOptionId: target.id,
    });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    assert.equal(quote.body.pricingRuleId, ruleId);
    assert.equal(fiatRateCalls, 0);
    assert.equal(cryptoRateCalls, 0);
    const signedQuote = JSON.parse(
      Buffer.from(String(quote.body.quoteId).split(".")[0], "base64url").toString("utf8"),
    ) as {
      pricingSnapshot: {
        reference: {
          source: { provider: string; source: string };
          target: { provider: string; source: string };
          executionProvider: string;
        };
      };
    };
    assert.equal(signedQuote.pricingSnapshot.reference.source.provider, "manual");
    assert.equal(signedQuote.pricingSnapshot.reference.source.source, "exact path override");
    assert.equal(signedQuote.pricingSnapshot.reference.target.provider, "manual");
    assert.equal(signedQuote.pricingSnapshot.reference.target.source, "exact path override");
    assert.equal(signedQuote.pricingSnapshot.reference.executionProvider, "Manual desk");

    const alternateSource = config.settlementOptions.find(option =>
      option.id !== source.id &&
      option.assetCode !== target.assetCode &&
      (option.direction === "send" || option.direction === "both"));
    assert.ok(alternateSource);
    const wildcard = await apiJson(
      api.url,
      "/admin/manual-desk-pricing-rules",
      {
        name: "Any source to exact USD payout",
        // Simulate an older Admin payload retaining the source which happened
        // to be selected before the operator changed that side to Any.
        sourceAsset: alternateSource.assetCode,
        targetAsset: target.assetCode,
        sourceNetwork: alternateSource.routeNetwork,
        targetNetwork: null,
        sourceSettlementOptionId: null,
        targetSettlementOptionId: target.id,
        markupBasisPoints: 175,
        fixedFee: "0.25",
        priority: 702,
        enabled: true,
      },
      "POST",
      headers,
    );
    assert.equal(wildcard.status, 201);
    ruleIds.push(String(wildcard.body.id));
    assert.equal(wildcard.body.sourceAsset, null);
    assert.equal(wildcard.body.sourceNetwork, null);
    assert.equal(wildcard.body.sourceSettlementOptionId, null);
    assert.equal(wildcard.body.targetSettlementOptionId, target.id);

    const wildcardAnyToAnyUpdate = await apiJson(
      api.url,
      `/admin/manual-desk-pricing-rules/${wildcard.body.id}`,
      {
        ...wildcard.body,
        sourceAsset: null,
        targetAsset: null,
        sourceNetwork: null,
        targetNetwork: null,
        paymentMethod: null,
        payoutMethod: null,
        sourceSettlementOptionId: null,
        targetSettlementOptionId: null,
        exactRate: null,
        priority: 10000,
      },
      "PATCH",
      headers,
    );
    assert.equal(wildcardAnyToAnyUpdate.status, 200, JSON.stringify(wildcardAnyToAnyUpdate.body));
    assert.equal(wildcardAnyToAnyUpdate.body.sourceSettlementOptionId, null);
    assert.equal(wildcardAnyToAnyUpdate.body.targetSettlementOptionId, null);
    assert.equal(wildcardAnyToAnyUpdate.body.readOnly, false);

    const wildcardPreview = await apiJson(api.url, "/admin/manual-desk-pricing-rules/preview", {
      sourceAsset: alternateSource.assetCode,
      targetAsset: target.assetCode,
      sourceNetwork: alternateSource.routeNetwork,
      targetNetwork: target.routeNetwork,
      sourceSettlementOptionId: alternateSource.id,
      targetSettlementOptionId: target.id,
    }, "POST", headers);
    assert.equal(wildcardPreview.status, 200, JSON.stringify(wildcardPreview.body));
    assert.equal(wildcardPreview.body.id, wildcardAnyToAnyUpdate.body.id);
  } finally {
    if (ruleIds.length) {
      await db.delete(manualDeskPricingRulesTable)
        .where(inArray(manualDeskPricingRulesTable.id, ruleIds));
    }
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
    await api.close();
    manualDeskRates.configureManualDeskRateAdapterForTests(async () => ({
      USD: 1, EUR: 0.9, GBP: 0.8, AED: 3.67, BTC: 0.00002, USDT: 1, XRP: 2,
    }));
  }
});

test("manual pricing rules match deterministically, protect writes, and snapshot quotes", async () => {
  reset();
  const {
    customersTable,
    db,
    manualDeskPricingRulesTable,
    operatorsTable,
    ordersTable,
  } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const { matchManualDeskPricingRule } = await import("../src/lib/manual-desk-pricing");
  const suffix = randomUUID();
  const userId = `user_pricing_${suffix}`;
  const [operator] = await db.insert(operatorsTable).values({
    email: `pricing-${suffix}@example.test`,
    clerkUserId: userId,
    role: "operator",
    status: "active",
    permissionAllows: ["pricing.view", "pricing.manage"],
  }).returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: req => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": userId };
  const ruleIds: string[] = [];
  let orderId: string | undefined;
  const email = `pricing-customer-${suffix}@example.test`;
  const routeRule = {
    name: "USD EUR wallet pricing",
    sourceAsset: "USD",
    targetAsset: "EUR",
    sourceNetwork: "BANK TRANSFER",
    targetNetwork: "SEPA",
    paymentMethod: "BANK TRANSFER",
    payoutMethod: "WALLET",
    markupBasisPoints: 200,
    fixedFee: "0.10",
    priority: -5,
    enabled: true,
  };
  try {
    const unauthorized = await fetch(`${api.url}/admin/manual-desk-pricing-rules`);
    assert.equal(unauthorized.status, 401);
    const unauthorizedCreate = await apiJson(
      api.url,
      "/admin/manual-desk-pricing-rules",
      routeRule,
    );
    assert.equal(unauthorizedCreate.status, 401);

    const seeded = await fetch(`${api.url}/admin/manual-desk-pricing-rules`, { headers });
    assert.equal(seeded.status, 200);
    const seededCatalog = await seeded.json() as {
      items: Array<Record<string, unknown>>;
      diagnostics: {
        hasEnabledAnyToAnyFallback: boolean;
        orphanRules: Array<{ ruleId: string; missingSettlementOptionIds: string[] }>;
        uncoveredRoutes: Array<{
          sourceSettlementOptionId: string;
          targetSettlementOptionId: string;
        }>;
      };
    };
    assert.ok(seededCatalog.items.some(rule =>
      rule.name === "Global 0.6% fallback" && rule.markupBasisPoints === 60));
    assert.equal(seededCatalog.diagnostics.hasEnabledAnyToAnyFallback, true);
    for (const orphan of seededCatalog.diagnostics.orphanRules) {
      const flaggedRule = seededCatalog.items.find((rule) => rule.id === orphan.ruleId);
      assert.ok(flaggedRule);
      assert.deepEqual(flaggedRule.missingSettlementOptionIds, orphan.missingSettlementOptionIds);
    }
    assert.ok(Array.isArray(seededCatalog.diagnostics.uncoveredRoutes));
    const publicConfig = await (await fetch(`${api.url}/exchange/config`)).json() as {
      settlementOptions: Array<Record<string, any>>;
      manualRouteAvailability: {
        available: boolean;
        routes: Array<{
          sourceSettlementOptionId: string;
          targetSettlementOptionId: string;
        }>;
        unavailableMessage: string | null;
      };
    };
    assert.equal(
      publicConfig.manualRouteAvailability.available,
      publicConfig.manualRouteAvailability.routes.length > 0,
    );
    assert.equal(
      publicConfig.manualRouteAvailability.unavailableMessage === null,
      publicConfig.manualRouteAvailability.available,
    );
    const previewSource = publicConfig.settlementOptions.find(option =>
      option.id === "crypto:usdt-trc20" &&
      (option.direction === "send" || option.direction === "both"));
    const previewTarget = publicConfig.settlementOptions.find(option =>
      option.kind === "fiat-payment-method" &&
      option.assetCode === "USD" &&
      (option.direction === "receive" || option.direction === "both"));
    assert.ok(previewSource && previewTarget);
    const pricingSource = publicConfig.settlementOptions.find(option =>
      option.kind === "fiat-payment-method" &&
      option.assetCode === "USD" &&
      option.routeNetwork === "Bank transfer" &&
      (option.direction === "send" || option.direction === "both"));
    const pricingTarget = publicConfig.settlementOptions.find(option =>
      option.kind === "fiat-payment-method" &&
      option.assetCode === "EUR" &&
      option.routeNetwork === "SEPA" &&
      (option.direction === "receive" || option.direction === "both"));
    assert.ok(pricingSource && pricingTarget);
    const pricingRoute = {
      sourceSettlementOptionId: pricingSource.id,
      targetSettlementOptionId: pricingTarget.id,
    };
    const rejectedLegacyCreate = await apiJson(
      api.url, "/admin/manual-desk-pricing-rules", routeRule, "POST", headers,
    );
    assert.equal(rejectedLegacyCreate.status, 400);
    assert.equal(rejectedLegacyCreate.body.code, "SETTLEMENT_OPTION_INVALID");
    const [createdRow] = await db.insert(manualDeskPricingRulesTable).values({
      id: randomUUID(),
      ...routeRule,
      ...pricingRoute,
      exactRate: "0.9",
    }).returning();
    const created = { status: 201, body: createdRow };
    ruleIds.push(createdRow.id);
    const directMatch = await matchManualDeskPricingRule({
      sourceAsset: pricingSource.assetCode,
      targetAsset: pricingTarget.assetCode,
      sourceNetwork: pricingSource.routeNetwork,
      targetNetwork: pricingTarget.routeNetwork,
      paymentMethod: routeRule.paymentMethod,
      payoutMethod: routeRule.payoutMethod,
      sourceSettlementOptionId: pricingSource.id,
      targetSettlementOptionId: pricingTarget.id,
    });
    assert.equal(directMatch.exactRateSource, "direct");
    const administrativeMatch = await matchManualDeskPricingRule({
      sourceAsset: pricingSource.assetCode,
      targetAsset: pricingTarget.assetCode,
      sourceNetwork: pricingSource.routeNetwork,
      targetNetwork: pricingTarget.routeNetwork,
      sourceSettlementOptionId: pricingSource.id,
      targetSettlementOptionId: pricingTarget.id,
    });
    const administrativeQuote = await apiJson(
      api.url,
      "/admin/manual-desk-pricing-rules/quote-preview",
      {
        amount: "100",
        sourceCryptoAssetId: null,
        targetCryptoAssetId: null,
        ...pricingRoute,
      },
      "POST",
      headers,
    );
    assert.equal(administrativeQuote.status, 200);
    assert.equal(administrativeQuote.body.pricingRuleId, administrativeMatch.id);
    assert.equal(administrativeQuote.body.pricingRuleName, administrativeMatch.name);
    assert.equal(
      administrativeQuote.body.baseRate,
      administrativeMatch.exactRate == null
        ? administrativeQuote.body.grossMarketAmount / 100
        : Number(administrativeMatch.exactRate),
    );
    assert.equal(administrativeQuote.body.markupBasisPoints, administrativeMatch.markupBasisPoints);
    assert.equal(administrativeQuote.body.adjustmentDirection, administrativeMatch.adjustmentDirection);
    assert.equal(administrativeQuote.body.finalRate, administrativeQuote.body.rate);

    // More selectors win even with a lower priority.
    const [broadRow] = await db.insert(manualDeskPricingRulesTable).values({
      id: randomUUID(),
      ...routeRule,
      ...pricingRoute,
      name: "Broad high priority",
      sourceNetwork: null,
      targetNetwork: null,
      paymentMethod: null,
      payoutMethod: null,
      markupBasisPoints: 500,
      fixedFee: null,
      exactRate: "0.8",
      priority: 999,
    }).returning();
    const broad = { status: 201, body: broadRow };
    ruleIds.push(broadRow.id);

    // Equal specificity resolves by higher priority.
    const [lowPriorityRow] = await db.insert(manualDeskPricingRulesTable).values({
      id: randomUUID(),
      ...routeRule,
      name: "Preview low",
      sourceAsset: "PREVIEW-S",
      targetAsset: "PREVIEW-T",
      sourceNetwork: null, targetNetwork: null, paymentMethod: null, payoutMethod: null,
      exactRate: "0.9",
      priority: 1,
    }).returning();
    const [highPriorityRow] = await db.insert(manualDeskPricingRulesTable).values({
      ...routeRule,
      id: randomUUID(),
      name: "Preview high",
      sourceAsset: "PREVIEW-S",
      targetAsset: "PREVIEW-T",
      sourceNetwork: null, targetNetwork: null, paymentMethod: null, payoutMethod: null,
      exactRate: "0.9",
      priority: 9,
    }).returning();
    const lowPriority = { status: 201, body: lowPriorityRow };
    const highPriority = { status: 201, body: highPriorityRow };
    ruleIds.push(lowPriorityRow.id, highPriorityRow.id);
    const preview = await apiJson(api.url, "/admin/manual-desk-pricing-rules/preview", {
      sourceAsset: "preview-s", targetAsset: "preview-t",
      sourceNetwork: "network", targetNetwork: "network", paymentMethod: "", payoutMethod: "",
    }, "POST", headers);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.id, highPriority.body.id);
    const deleted = await fetch(
      `${api.url}/admin/manual-desk-pricing-rules/${lowPriority.body.id}`,
      { method: "DELETE", headers },
    );
    assert.equal(deleted.status, 204);

    const ambiguousOne = await apiJson(api.url, "/admin/manual-desk-pricing-rules", {
      ...routeRule, name: "Ambiguous source", sourceAsset: "AMB",
      targetAsset: null, sourceNetwork: null, targetNetwork: null,
      paymentMethod: null, payoutMethod: null, priority: 77,
    }, "POST", headers);
    assert.equal(ambiguousOne.status, 400);
    assert.equal(ambiguousOne.body.code, "SETTLEMENT_OPTION_INVALID");
    const ambiguousTwo = await apiJson(api.url, "/admin/manual-desk-pricing-rules", {
      ...routeRule, name: "Ambiguous target", sourceAsset: null,
      targetAsset: "AMB-T", sourceNetwork: null, targetNetwork: null,
      paymentMethod: null, payoutMethod: null, priority: 77,
    }, "POST", headers);
    assert.equal(ambiguousTwo.status, 400);
    assert.equal(ambiguousTwo.body.code, "SETTLEMENT_OPTION_INVALID");

    const quote = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "usd", fromNetwork: "bank transfer",
      toAsset: "eur", toNetwork: "sepa", amount: 100,
      paymentMethod: "bank transfer", payoutMethod: "wallet",
      ...pricingRoute,
    });
    assert.equal(quote.status, 200);
    assert.equal(quote.body.pricingRuleId, created.body.id);
    assert.equal(quote.body.grossMarketAmount, 90);
    assert.equal(quote.body.percentageCommission, 1.8);
    assert.equal(quote.body.fixedCommission, 0.1);
    assert.equal(quote.body.totalFee, 1.9);
    assert.equal(quote.body.receiveAmount, 88.1);
    const signedPayload = JSON.parse(
      Buffer.from(String(quote.body.quoteId).split(".")[0], "base64url").toString("utf8"),
    ) as Record<string, any>;
    const ticketExpected = {
      type: "manual" as const,
      fromAsset: "USD",
      fromNetwork: "Bank transfer",
      toAsset: "EUR",
      toNetwork: "SEPA",
      amount: 100,
      paymentMethod: "bank transfer",
      payoutMethod: "wallet",
      sourceSettlementOptionId: pricingRoute.sourceSettlementOptionId,
      targetSettlementOptionId: pricingRoute.targetSettlementOptionId,
    };
    const contradictoryRounding = {
      ...signedPayload,
      pricingSnapshot: {
        ...signedPayload.pricingSnapshot,
        rule: { ...signedPayload.pricingSnapshot.rule, adjustmentDirection: "GIVE_MORE" },
        rounding: { ...signedPayload.pricingSnapshot.rounding, percentageCommission: "ceil" },
      },
    };
    assert.throws(
      () => tickets.verifyQuoteTicket(
        tickets.signQuoteTicket(contradictoryRounding), ticketExpected,
      ),
      { code: "QUOTE_INVALID" },
    );
    const legacySnapshot = {
      ...signedPayload,
      pricingSnapshot: {
        ...signedPayload.pricingSnapshot,
        rule: Object.fromEntries(
          Object.entries(signedPayload.pricingSnapshot.rule)
            .filter(([key]) => key !== "adjustmentDirection"),
        ),
      },
    };
    const verifiedLegacy = tickets.verifyQuoteTicket(
      tickets.signQuoteTicket(legacySnapshot), ticketExpected,
    );
    assert.equal(verifiedLegacy.pricingSnapshot?.rule.adjustmentDirection, undefined);
    const contradictory = {
      ...signedPayload,
      pricingSnapshot: {
        ...signedPayload.pricingSnapshot,
        amounts: { ...signedPayload.pricingSnapshot.amounts, totalFee: "0" },
      },
    };
    const contradictoryOrder = await apiJson(api.url, "/orders", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer",
      toAsset: "EUR", toNetwork: "SEPA", amount: 100,
      quoteId: tickets.signQuoteTicket(contradictory),
      customerEmail: email, clientRequestId: requestIdForTest(934),
      paymentMethod: "bank transfer", payoutMethod: "wallet",
      ...pricingRoute,
    });
    assert.equal(contradictoryOrder.status, 400);
    assert.equal(contradictoryOrder.body.code, "QUOTE_INVALID");
    const selfConsistentWrongRate = {
      ...signedPayload,
      rate: 1,
      pricingSnapshot: {
        ...signedPayload.pricingSnapshot,
        amounts: { ...signedPayload.pricingSnapshot.amounts, finalRate: "1" },
      },
    };
    const wrongRateOrder = await apiJson(api.url, "/orders", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer",
      toAsset: "EUR", toNetwork: "SEPA", amount: 100,
      quoteId: tickets.signQuoteTicket(selfConsistentWrongRate),
      customerEmail: email, clientRequestId: requestIdForTest(932),
      paymentMethod: "bank transfer", payoutMethod: "wallet",
      ...pricingRoute,
    });
    assert.equal(wrongRateOrder.status, 400);
    assert.equal(wrongRateOrder.body.code, "QUOTE_INVALID");
    const wrongProvenance = {
      ...signedPayload,
      pricingSnapshot: {
        ...signedPayload.pricingSnapshot,
        reference: {
          ...signedPayload.pricingSnapshot.reference,
          target: { ...signedPayload.pricingSnapshot.reference.target, provider: "USD identity" },
        },
      },
    };
    const wrongProvenanceOrder = await apiJson(api.url, "/orders", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer",
      toAsset: "EUR", toNetwork: "SEPA", amount: 100,
      quoteId: tickets.signQuoteTicket(wrongProvenance),
      customerEmail: email, clientRequestId: requestIdForTest(933),
      paymentMethod: "bank transfer", payoutMethod: "wallet",
      ...pricingRoute,
    });
    assert.equal(wrongProvenanceOrder.status, 400);
    assert.equal(wrongProvenanceOrder.body.code, "QUOTE_INVALID");

    const mismatch = await apiJson(api.url, "/orders", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer",
      toAsset: "EUR", toNetwork: "SEPA", amount: 100, quoteId: quote.body.quoteId,
      customerEmail: email, clientRequestId: requestIdForTest(935),
      paymentMethod: "card", payoutMethod: "wallet",
      ...pricingRoute,
    });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.code, "QUOTE_MISMATCH");

    const updated = await apiJson(api.url, `/admin/manual-desk-pricing-rules/${created.body.id}`, {
      ...routeRule, markupBasisPoints: 900, version: created.body.version,
    }, "PATCH", headers);
    assert.equal(updated.status, 400);
    assert.equal(updated.body.code, "SETTLEMENT_OPTION_INVALID");

    const ordered = await apiJson(api.url, "/orders", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer",
      toAsset: "EUR", toNetwork: "SEPA", amount: 100, quoteId: quote.body.quoteId,
      customerEmail: email, clientRequestId: requestIdForTest(936),
      paymentMethod: "bank transfer", payoutMethod: "wallet",
      settlementDetails: settlementDetailsFixture(quote.body.requiredSettlementFields),
      ...pricingRoute,
    });
    assert.equal(ordered.status, 201);
    orderId = String(ordered.body.id);
    assert.equal(ordered.body.pricingRuleId, created.body.id);
    assert.equal(ordered.body.pricingRuleVersion, created.body.version);
    assert.equal(ordered.body.percentageCommission, "1.8");
    assert.equal(ordered.body.totalCommission, "1.9");
    assert.equal(ordered.body.pricingSnapshot.rule.markupBasisPoints, 200);
    assert.equal(ordered.body.pricingSnapshot.rule.fixedFee, "0.100000000000000000");
    assert.equal(ordered.body.pricingSnapshot.reference.source.unitsPerUsd, "1");
    assert.equal(ordered.body.pricingSnapshot.reference.target.unitsPerUsd, "0.9");
    assert.equal(ordered.body.pricingSnapshot.amounts.totalFee, "1.9");
  } finally {
    if (orderId) await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
    await db.delete(customersTable).where(eq(customersTable.email, email));
    if (ruleIds.length) await db.delete(manualDeskPricingRulesTable)
      .where(inArray(manualDeskPricingRulesTable.id, ruleIds));
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operator.id));
    await api.close();
  }
});

test("manual desk keeps catalog failures customer-neutral with legacy fallback paths", async () => {
  reset("catalogUnavailable");
  quickex.resetQuickexInstrumentCacheForTests();
  const api = await startApi();
  try {
    const fiatToFiat = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer", toAsset: "EUR", toNetwork: "SEPA", amount: 100,
    });
    assert.equal(fiatToFiat.status, 200, JSON.stringify(fiatToFiat.body));
    assert.equal(instrumentCalls, 0);

    const configResponse = await fetch(`${api.url}/exchange/config`);
    const configBody = await configResponse.json() as { assets?: Array<{ kind?: string }>; providers?: string[] };
    assert.equal(configResponse.status, 200);
    assert.ok(configBody.assets?.some(asset => asset.kind === "crypto"));
    assert.deepEqual(configBody.providers, ["Manual desk"]);

    quickex.resetQuickexInstrumentCacheForTests();
    const cryptoRoute = await apiJson(api.url, "/exchange/quote", {
      type: "manual", fromAsset: "USD", fromNetwork: "Bank transfer", toAsset: "BTC", toNetwork: "Bitcoin", amount: 100,
    });
    assert.equal(cryptoRoute.status, 200, JSON.stringify(cryptoRoute.body));
  } finally {
    reset();
    quickex.resetQuickexInstrumentCacheForTests();
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex capability boundary", async () => {
  reset();
  const api = await startApi();
  const originalEnvironment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const response = await apiJson(api.url, "/exchange/quote", {
      type: "instant", fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20", amount: 1,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.type, "instant");
    assert.equal(response.body.provider, "Quickex");
    assert.equal(quoteCalls, 1);
  } finally {
    process.env.NODE_ENV = originalEnvironment;
    await api.close();
  }
});

test.skip("obsolete exchange-owned Quickex credential capability boundary", async () => {
  reset();
  const originalStoredCredentials = storedCredentials;
  const originalPublicKey = process.env.QUICKEX_PUBLIC_KEY;
  const originalSecretKey = process.env.QUICKEX_SECRET_KEY;
  storedCredentials = null;
  delete process.env.QUICKEX_PUBLIC_KEY;
  delete process.env.QUICKEX_SECRET_KEY;
  const api = await startApi();
  try {
    const configResponse = await fetch(`${api.url}/exchange/config`);
    const configBody = await configResponse.json() as {
      assets?: Array<{ kind?: string }>;
      providers?: string[];
    };
    assert.equal(configResponse.status, 200);
    assert.ok(configBody.assets?.some(asset => asset.kind === "crypto"));
    assert.deepEqual(configBody.providers, ["Manual desk"]);

    const quoteResponse = await apiJson(api.url, "/exchange/quote", {
      type: "instant",
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: 1,
    });
    assert.equal(quoteResponse.status, 503);
    assert.equal(quoteResponse.body.code, "INSTANT_EXCHANGE_UNAVAILABLE");
    assert.equal(JSON.stringify(quoteResponse.body).toLowerCase().includes("quickex"), false);
    assert.equal(quoteCalls, 0);
  } finally {
    storedCredentials = originalStoredCredentials;
    if (originalPublicKey === undefined) delete process.env.QUICKEX_PUBLIC_KEY;
    else process.env.QUICKEX_PUBLIC_KEY = originalPublicKey;
    if (originalSecretKey === undefined) delete process.env.QUICKEX_SECRET_KEY;
    else process.env.QUICKEX_SECRET_KEY = originalSecretKey;
    await api.close();
  }
});

test.skip("obsolete Quickex row in Manual order mutation boundary", async () => {
  const api = await startApi();
  const { db, ordersTable } = await import("@workspace/db");
  const id = `QX-managed-${Date.now()}`;
  try {
    await db.insert(ordersTable).values({
      id, type: "instant", status: "awaiting deposit", fromAsset: "BTC", fromNetwork: "Bitcoin",
      toAsset: "USDT", toNetwork: "TRC20", amount: "1", receiveAmount: "99.5",
      customerEmail: `quickex-managed-${Date.now()}@example.test`, customerName: "Quickex test",
      provider: "Quickex", createdAt: new Date(),
    });
    const patch = await apiJson(api.url, `/orders/${id}`, { note: "operator note" }, "PATCH");
    assert.equal(patch.status, 401);
    assert.equal(patch.body.code, "OPERATOR_AUTH_REQUIRED");
    const [stored] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    assert.equal(stored?.note, "");
  } finally {
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    await api.close();
  }
});

test.skip("obsolete Quickex row in Manual operator directory boundary", async () => {
  reset();
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  const {
    customerStatusNotificationEventsTable,
    db,
    operatorAuditLogsTable,
    operatorsTable,
    ordersTable,
  } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const customerAuth = await import("../src/lib/customer-auth");
  const customerNotifications = await import("../src/lib/customer-status-notifications");
  const { resetQuickexOrderSyncForTest } = await import("../src/routes/exchange");
  const operatorUserId = `user_order_directory_${randomUUID()}`;
  const suffix = randomUUID();
  const quickexId = `QX-${randomUUID()}`;
  const manualOldId = `QX-${randomUUID()}`;
  const manualNewId = `QX-${randomUUID()}`;
  const providerCreatedAt = new Date("2025-06-10T09:15:00.000Z");
  const providerUpdatedAt = new Date("2025-06-10T09:30:00.000Z");
  const quickexCustomerUserId = `user_quickex_notifications_${suffix}`;
  const deliveredNotifications: Array<
    import("../src/lib/customer-status-notifications").CustomerStatusNotification
  > = [];
  const [operatorRecord] = await db.insert(operatorsTable).values({
    email: `order-directory-${suffix}@example.test`,
    clerkUserId: operatorUserId,
    role: "operator",
    status: "active",
  }).returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  customerAuth.configureCustomerAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: (userId) =>
      userId === quickexCustomerUserId
        ? `quickex-notifications-${suffix}@example.test`
        : null,
  });
  customerNotifications.configureCustomerNotificationDeliveryForTests({
    send: (notification) => {
      deliveredNotifications.push(notification);
    },
  });
  providerOrders = [order({
    orderId: 9101,
    destinationAddress: `destination-${suffix}`,
    refundAddress: `refund-${suffix}`,
    claimedDepositAmount: "2.5000",
    amountToGet: "250.5",
    amountToWithdrawFact: "248.75",
    createdAt: providerCreatedAt.toISOString(),
    updatedAt: providerUpdatedAt.toISOString(),
    completed: false,
    state: "sending payout",
  })];
  await db.insert(ordersTable).values([
    {
      id: quickexId,
      type: "instant",
      status: "sending payout",
      fromAsset: "BTC",
      fromNetwork: "Bitcoin",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "9007199254740993.123456789012345678",
      receiveAmount: "12345678901234567890.000000000000000001",
      customerEmail: `guest-quickex-${suffix}@example.test`,
      customerName: "Guest",
      destinationAddress: `destination-${suffix}`,
      destinationMemo: `memo-needle-${suffix}`,
      refundAddress: `refund-${suffix}`,
      depositAddress: `deposit-${suffix}`,
      provider: "Quickex",
      providerOrderId: "9101",
      providerState: "sending payout",
      rateMode: "FIXED",
      sourceSettlementOptionId: "crypto:btc-bitcoin",
      targetSettlementOptionId: "crypto:usdt-trc20",
      customerClerkUserId: quickexCustomerUserId,
      customerOwnershipSource: "authenticated_create",
      statusNotificationsEnabled: true,
      providerClaimedDepositAmount: "9007199254740993.123456789012345678",
      providerExpectedReceiveAmount: "12345678901234567890.000000000000000001",
      providerPaidAmount: "9999999999999999999.999999999999999999",
      providerCreatedAt,
      providerUpdatedAt,
      providerCompleted: false,
      createdAt: new Date("2025-06-10T09:16:00.000Z"),
    },
    {
      id: manualOldId,
      type: "manual",
      status: "completed",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "BTC",
      toNetwork: "Bitcoin",
      amount: "150",
      receiveAmount: "0",
      customerEmail: `directory-${suffix}@example.test`,
      customerName: "Guest",
      provider: "Manual desk",
      createdAt: new Date("2025-06-09T08:00:00.000Z"),
    },
    {
      id: manualNewId,
      type: "manual",
      status: "pending",
      fromAsset: "USD",
      fromNetwork: "Bank transfer",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "350",
      receiveAmount: "0",
      customerEmail: `directory-${suffix}@example.test`,
      customerName: "Guest",
      provider: "Manual desk",
      outcomeUnknown: true,
      createdAt: new Date("2025-06-09T08:00:00.000Z"),
    },
  ]);
  await resetQuickexOrderSyncForTest();
  const api = await startApi();
  const headers = { "x-test-clerk-user-id": operatorUserId };
  try {
    const filters = new URLSearchParams({
      status: "sending payout",
      providerState: "sending payout",
      type: "instant",
      fromAsset: "btc",
      fromNetwork: "bitcoin",
      toAsset: "usdt",
      toNetwork: "trc20",
      sourceSettlementOptionId: "crypto:btc-bitcoin",
      targetSettlementOptionId: "crypto:usdt-trc20",
      customerEmail: `guest-quickex-${suffix}@example.test`,
      rateMode: "FIXED",
      outcomeUnknown: "false",
      createdFrom: "2025-06-10T00:00:00.000Z",
      createdTo: "2025-06-10T23:59:59.999Z",
      search: `memo-needle-${suffix}`,
      sortDirection: "asc",
      page: "1",
      pageSize: "1",
    });
    const filtered = await fetch(`${api.url}/orders?${filters}`, { headers });
    assert.equal(filtered.status, 200);
    const body = await filtered.json() as {
      items: Array<Record<string, unknown>>;
      total: number;
      page: number;
      pageSize: number;
      refreshUnavailable: boolean;
    };
    assert.equal(body.total, 1);
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 1);
    assert.equal(body.refreshUnavailable, true);
    assert.equal(body.items[0]?.id, quickexId);
    assert.equal(body.items[0]?.customerName, "Guest");
    assert.equal(body.items[0]?.amount, "9007199254740993.123456789012345678");
    assert.equal(body.items[0]?.receiveAmount, "12345678901234567890.000000000000000001");
    assert.equal(body.items[0]?.providerClaimedDepositAmount, "9007199254740993.123456789012345678");
    assert.equal(body.items[0]?.providerExpectedReceiveAmount, "12345678901234567890.000000000000000001");
    assert.equal(body.items[0]?.providerPaidAmount, "9999999999999999999.999999999999999999");
    assert.equal(body.items[0]?.providerCreatedAt, providerCreatedAt.toISOString());
    assert.equal(body.items[0]?.providerUpdatedAt, providerUpdatedAt.toISOString());
    assert.equal(body.items[0]?.providerCompleted, false);
    await resetQuickexOrderSyncForTest();
    const repeatedPoll = await fetch(
      `${api.url}/orders?${new URLSearchParams({ search: quickexId })}`,
      { headers },
    );
    assert.equal(repeatedPoll.status, 200);

    const pageTwo = await fetch(`${api.url}/orders?${new URLSearchParams({
      type: "manual",
      search: `directory-${suffix}`,
      sortDirection: "asc",
      page: "2",
      pageSize: "1",
    })}`, { headers });
    assert.equal(pageTwo.status, 200);
    const pageBody = await pageTwo.json() as {
      items: Array<Record<string, unknown>>;
      total: number;
    };
    assert.equal(pageBody.total, 2);
    assert.equal(
      pageBody.items[0]?.id,
      [manualOldId, manualNewId].sort()[1],
    );

    for (const invalidQuery of [
      new URLSearchParams({
        createdFrom: "2025-06-11T00:00:00.000Z",
        createdTo: "2025-06-10T00:00:00.000Z",
      }),
      new URLSearchParams({ minAmount: "5", maxAmount: "2" }),
    ]) {
      const invalid = await fetch(`${api.url}/orders?${invalidQuery}`, { headers });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json() as Record<string, unknown>).code, "VALIDATION_ERROR");
    }

    reset("fiveHundred");
    await resetQuickexOrderSyncForTest();
    const stale = await fetch(
      `${api.url}/orders?${new URLSearchParams({ search: quickexId })}`,
      { headers },
    );
    assert.equal(stale.status, 200);
    const staleBody = await stale.json() as {
      items: Array<Record<string, unknown>>;
      refreshUnavailable: boolean;
    };
    assert.equal(staleBody.refreshUnavailable, true);
    assert.equal(staleBody.items[0]?.id, quickexId);
    assert.equal(
      staleBody.items[0]?.providerPaidAmount,
      "9999999999999999999.999999999999999999",
    );

    Object.assign(process.env, {
      QUICKEX_API_KEY: "",
      QUICKEX_PUBLIC_KEY: "",
      QUICKEX_SECRET_KEY: "",
    });
    reset();
    await resetQuickexOrderSyncForTest();
    const unsigned = await fetch(
      `${api.url}/orders?${new URLSearchParams({ search: quickexId })}`,
      { headers },
    );
    assert.equal(unsigned.status, 200);
    const unsignedBody = await unsigned.json() as {
      items: Array<Record<string, unknown>>;
      refreshUnavailable: boolean;
    };
    assert.equal(unsignedBody.refreshUnavailable, true);
    assert.equal(unsignedBody.items[0]?.id, quickexId);
    Object.assign(process.env, {
      QUICKEX_API_KEY: "test-api",
      QUICKEX_PUBLIC_KEY: "test-public",
      QUICKEX_SECRET_KEY: "test-secret",
    });
  } finally {
    await db.delete(ordersTable).where(inArray(
      ordersTable.id,
      [quickexId, manualOldId, manualNewId],
    ));
    await db.delete(operatorAuditLogsTable).where(
      eq(operatorAuditLogsTable.targetOperatorId, operatorRecord.id),
    );
    await db.delete(operatorsTable).where(eq(operatorsTable.id, operatorRecord.id));
    await api.close();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    reset();
  }
});

test("versioned migration upgrades a populated legacy order table safely", async () => {
  const schema = `quickex_migration_${process.pid}_${Date.now()}`;
  const client = await privilegedTestPool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE exchange_customers (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        orders_count integer DEFAULT 0 NOT NULL,
        volume numeric DEFAULT '0' NOT NULL,
        last_activity timestamp with time zone DEFAULT now() NOT NULL,
        status text DEFAULT 'active' NOT NULL
      );
      CREATE TABLE exchange_orders (
        id text PRIMARY KEY NOT NULL,
        type text NOT NULL,
        status text NOT NULL,
        from_asset text NOT NULL,
        to_asset text NOT NULL,
        amount numeric NOT NULL,
        receive_amount numeric NOT NULL,
        customer_email text NOT NULL,
        customer_name text DEFAULT 'Guest' NOT NULL,
        destination_address text DEFAULT '' NOT NULL,
        payment_method text DEFAULT '' NOT NULL,
        payout_method text DEFAULT '' NOT NULL,
        provider text NOT NULL,
        note text DEFAULT '' NOT NULL,
        provider_reference text DEFAULT '' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        refund_address text DEFAULT '' NOT NULL,
        deposit_address text DEFAULT '' NOT NULL,
        provider_order_id text DEFAULT '' NOT NULL,
        customer_clerk_user_id text
      );
      CREATE TABLE customer_status_notification_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        order_id text NOT NULL,
        customer_clerk_user_id text NOT NULL,
        from_status text NOT NULL,
        to_status text NOT NULL,
        delivery_status text DEFAULT 'pending' NOT NULL,
        attempt_count integer DEFAULT 0 NOT NULL,
        next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
        last_attempt_at timestamp with time zone,
        delivered_at timestamp with time zone,
        last_error_code text DEFAULT '' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
      INSERT INTO exchange_orders (
        id, type, status, from_asset, to_asset, amount, receive_amount,
        customer_email, customer_name, provider, customer_clerk_user_id
      ) VALUES
        (
          'legacy-order', 'crypto', 'processing', 'BTC', 'USDT', '1', '99',
          'legacy@example.test', 'Legacy Customer', 'Quickex', NULL
        ),
        (
          'legacy-attempted-order', 'crypto', 'processing', 'ETH', 'USDT', '2', '198',
          'legacy-attempted@example.test', 'Legacy Attempted Customer', 'Quickex', NULL
        ),
        (
          'legacy-quickex-order', 'instant', 'creating', 'BTC', 'USDT', '3', '297',
          'legacy-quickex@example.test', 'Legacy Quickex Customer', 'Quickex',
          'legacy-quickex-clerk-user'
        ),
        (
          'legacy-manual-order', 'manual', 'pending', 'EUR', 'BTC', '4', '0.00008',
          'legacy-manual@example.test', 'Legacy Manual Customer', 'Manual desk', NULL
        );
      INSERT INTO customer_status_notification_events (
        order_id, customer_clerk_user_id, from_status, to_status, delivery_status
      ) VALUES (
        'legacy-order', 'legacy-clerk-user', 'pending', 'processing', 'sending'
      );
      INSERT INTO customer_status_notification_events (
        order_id, customer_clerk_user_id, from_status, to_status,
        delivery_status, attempt_count
      ) VALUES (
        'legacy-attempted-order', 'legacy-attempted-clerk-user',
        'pending', 'processing', 'pending', 1
      );
      CREATE TABLE desk_operator_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        action text NOT NULL,
        actor_clerk_user_id text,
        target_operator_id uuid,
        target_email text,
        details jsonb DEFAULT '{}'::jsonb NOT NULL,
        request_id text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE TABLE desk_operators (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        email text NOT NULL,
        clerk_user_id text,
        role text DEFAULT 'operator' NOT NULL,
        status text DEFAULT 'invited' NOT NULL,
        auth_version integer DEFAULT 1 NOT NULL,
        invited_by text,
        approved_by text,
        suspended_at timestamp with time zone,
        removed_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT desk_operators_email_unique UNIQUE(email),
        CONSTRAINT desk_operators_clerk_user_id_unique UNIQUE(clerk_user_id)
      );
      CREATE TABLE provider_integrations (
        provider text PRIMARY KEY NOT NULL,
        ciphertext text NOT NULL,
        initialization_vector text NOT NULL,
        authentication_tag text NOT NULL,
        encryption_version integer DEFAULT 1 NOT NULL,
        created_by_operator_id text,
        updated_by_operator_id text,
        last_tested_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE TABLE landing_background_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        version integer NOT NULL,
        mode text DEFAULT 'preset' NOT NULL,
        preset_id text DEFAULT 'neon-orbit',
        custom_object_path text,
        focal_x integer DEFAULT 50 NOT NULL,
        focal_y integer DEFAULT 50 NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        created_by text NOT NULL
      );
      INSERT INTO landing_background_settings
        (version, mode, preset_id, focal_x, focal_y, created_by)
      VALUES (1, 'preset', 'aurora-chain', 17, 83, 'legacy-user');
    `);

    await migrate(drizzle(client), {
      migrationsFolder: resolve(process.cwd(), "../../lib/db/migrations"),
      migrationsSchema: schema,
      migrationsTable: "__drizzle_migrations",
    });

    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'exchange_orders'`,
      [schema],
    );
    const names = new Set(columns.rows.map((row) => row.column_name));
    for (const name of [
      "from_network",
      "to_network",
      "destination_memo",
      "refund_memo",
      "deposit_memo",
      "provider_state",
      "quote_id",
      "client_request_id",
      "error_code",
      "error_message",
      "outcome_unknown",
      "rate_mode",
      "provider_claimed_deposit_amount",
      "provider_expected_receive_amount",
      "provider_paid_amount",
      "provider_created_at",
      "provider_updated_at",
      "provider_completed",
      "customer_clerk_user_id",
      "customer_ownership_source",
      "customer_claimed_at",
      "status_notifications_enabled",
      "status_version",
      "record_version",
      "updated_at",
       "pricing_snapshot",
    ]) {
      assert.equal(names.has(name), true, `missing migrated column ${name}`);
    }

    const preserved = await client.query(
      `SELECT id, customer_email, status, from_network, to_network,
              outcome_unknown, error_code, rate_mode, status_version
       FROM exchange_orders WHERE id = 'legacy-order'`,
    );
    assert.deepEqual(preserved.rows, [{
      id: "legacy-order",
      customer_email: "legacy@example.test",
      status: "verification required",
      from_network: "",
      to_network: "",
      outcome_unknown: true,
      error_code: "LEGACY_NETWORK_MISSING",
      rate_mode: "FLOATING",
      status_version: 1,
    }]);

    const migrationRows = await client.query(
      `SELECT count(*)::integer AS count FROM "${schema}"."__drizzle_migrations"`,
    );
    const migrationJournal = JSON.parse(await readFile(
      resolve(process.cwd(), "../../lib/db/migrations/meta/_journal.json"),
      "utf8",
    )) as { entries: unknown[] };
    assert.equal(migrationRows.rows[0]?.count, migrationJournal.entries.length);
    const landingBackgroundTables = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_name IN ('landing_background_settings', 'landing_background_audit_logs')
       ORDER BY table_name`,
      [schema],
    );
    assert.deepEqual(
      landingBackgroundTables.rows.map(({ table_name }) => table_name),
      ["landing_background_audit_logs", "landing_background_settings"],
    );
    const landingBackgroundPlacementColumn = await client.query<{
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'landing_background_settings'
         AND column_name = 'placements'`,
      [schema],
    );
    assert.equal(landingBackgroundPlacementColumn.rows[0]?.is_nullable, "NO");
    assert.match(landingBackgroundPlacementColumn.rows[0]?.column_default ?? "", /'\{\}'::jsonb/);
    const legacyLandingBackground = await client.query(
      `SELECT preset_id, focal_x, focal_y, placements
       FROM landing_background_settings WHERE version = 1`,
    );
    assert.deepEqual(legacyLandingBackground.rows, [{
      preset_id: "aurora-chain",
      focal_x: 17,
      focal_y: 83,
      placements: {},
    }]);
    const initialAffiliateSettings = await client.query(
      `SELECT version, enabled, quickex_enabled, manual_enabled,
              cookie_duration_days
       FROM affiliate_program_settings ORDER BY version`,
    );
    assert.deepEqual(initialAffiliateSettings.rows, [
      {
        version: 1,
        enabled: false,
        quickex_enabled: false,
        manual_enabled: false,
        cookie_duration_days: 30,
      },
      {
        version: 2,
        enabled: true,
        quickex_enabled: true,
        manual_enabled: true,
        cookie_duration_days: 30,
      },
      {
        version: 3,
        enabled: true,
        quickex_enabled: true,
        manual_enabled: true,
        cookie_duration_days: 30,
      },
    ]);
    const quickexBackfill = await client.query(
      `SELECT legacy_order_id, customer_email, customer_clerk_user_id,
              route->>'fromAsset' AS from_asset
       FROM quickex_orders ORDER BY legacy_order_id`,
    );
    assert.deepEqual(quickexBackfill.rows, [{
      legacy_order_id: "legacy-quickex-order",
      customer_email: "legacy-quickex@example.test",
      customer_clerk_user_id: "legacy-quickex-clerk-user",
      from_asset: "BTC",
    }]);
    const seededFiat = await client.query<{ code: string }>(
      `SELECT code FROM fiat_currencies ORDER BY code`,
    );
    assert.deepEqual(
      seededFiat.rows.map(({ code }) => code),
      ["AED", "DZD", "EUR", "GBP", "KZT", "TRY", "USD"],
    );
    const notificationConstraints = await client.query(
      `SELECT
         source_namespace.nspname AS source_schema,
         source_table.relname AS source_table,
         target_namespace.nspname AS target_schema,
         target_table.relname AS target_table
       FROM pg_constraint constraint_record
       JOIN pg_class source_table
         ON source_table.oid = constraint_record.conrelid
       JOIN pg_namespace source_namespace
         ON source_namespace.oid = source_table.relnamespace
       JOIN pg_class target_table
         ON target_table.oid = constraint_record.confrelid
       JOIN pg_namespace target_namespace
         ON target_namespace.oid = target_table.relnamespace
       WHERE constraint_record.conname = 'customer_status_notification_events_order_id_exchange_orders_id_fk'
         AND source_namespace.nspname = $1`,
      [schema],
    );
    assert.deepEqual(notificationConstraints.rows, [{
      source_schema: schema,
      source_table: "customer_status_notification_events",
      target_schema: schema,
      target_table: "exchange_orders",
    }]);
    const migratedNotification = await client.query(
      `SELECT status_version, delivery_status, claim_token, claim_expires_at,
              provider_idempotency_started_at, last_error_code
       FROM customer_status_notification_events
       WHERE order_id = 'legacy-order'`,
    );
    assert.deepEqual(migratedNotification.rows, [{
      status_version: 1,
      delivery_status: "failed",
      claim_token: null,
      claim_expires_at: null,
      provider_idempotency_started_at: null,
      last_error_code: "EMAIL_LEGACY_SEND_AMBIGUOUS",
    }]);
    const migratedAttemptedNotification = await client.query(
      `SELECT delivery_status, provider_idempotency_started_at, last_error_code
       FROM customer_status_notification_events
       WHERE order_id = 'legacy-attempted-order'`,
    );
    assert.deepEqual(migratedAttemptedNotification.rows, [{
      delivery_status: "failed",
      provider_idempotency_started_at: null,
      last_error_code: "EMAIL_LEGACY_SEND_AMBIGUOUS",
    }]);
    const operationalIndexes = await client.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = $1
         AND indexname = ANY($2::text[])
       ORDER BY indexname`,
      [
        schema,
        [
          "exchange_orders_created_at_id_idx",
          "exchange_orders_customer_created_at_id_idx",
          "exchange_orders_status_created_at_id_idx",
        ],
      ],
    );
    assert.deepEqual(operationalIndexes.rows, []);

    await client.query(
      `UPDATE exchange_orders
       SET client_request_id = 'migration-idempotency-key'
       WHERE id = 'legacy-order'`,
    );
    await assert.rejects(
      client.query(`
        INSERT INTO exchange_orders (
          id, type, status, from_asset, to_asset, amount, receive_amount,
          customer_email, provider, client_request_id
        ) VALUES (
          'duplicate-key-order', 'instant', 'creating', 'BTC', 'USDT', '1', '99',
          'duplicate@example.test', 'Quickex', 'migration-idempotency-key'
        )
      `),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "23505",
    );
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
  }
});

test("online order-directory indexes build and verify on a populated table", async () => {
  const schema = `quickex_online_index_${process.pid}_${Date.now()}`;
  try {
    await privilegedTestPool.query(`CREATE SCHEMA "${schema}"`);
    await privilegedTestPool.query(`
      CREATE TABLE "${schema}".exchange_orders (
        id text PRIMARY KEY,
        status text NOT NULL,
        customer_clerk_user_id text,
        created_at timestamp with time zone NOT NULL
      )
    `);
    await privilegedTestPool.query(`
      INSERT INTO "${schema}".exchange_orders (id, status, created_at)
      SELECT
        'order-' || sequence,
        CASE WHEN sequence % 2 = 0 THEN 'pending' ELSE 'completed' END,
        now() - (sequence || ' seconds')::interval
      FROM generate_series(1, 500) AS sequence
    `);

    await privilegedTestPool.query(`
      CREATE INDEX exchange_orders_created_at_id_idx
      ON "${schema}".exchange_orders (created_at DESC, id ASC)
    `);
    await assert.rejects(
      ensureOrderDirectoryIndexes(privilegedTestPool, { schema }),
      /exists with an unexpected definition/,
    );
    await privilegedTestPool.query(`DROP INDEX "${schema}".exchange_orders_created_at_id_idx`);

    const firstRun = await ensureOrderDirectoryIndexes(privilegedTestPool, { schema });
    assert.deepEqual(firstRun, [
      {
        indexName: "exchange_orders_created_at_id_idx",
        columns: ["created_at", "id"],
        ready: true,
        valid: true,
      },
      {
        indexName: "exchange_orders_status_created_at_id_idx",
        columns: ["status", "created_at", "id"],
        ready: true,
        valid: true,
      },
      {
        indexName: "exchange_orders_customer_created_at_id_idx",
        columns: ["customer_clerk_user_id", "created_at", "id"],
        ready: true,
        valid: true,
      },
    ]);
    assert.deepEqual(await ensureOrderDirectoryIndexes(privilegedTestPool, { schema }), firstRun);
  } finally {
    await privilegedTestPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

test("owner order operations enforce assignment, archive, versions, and immutable history", async () => {
  const { db, operatorsTable, ordersTable, orderAuditLogsTable, pool } = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  const suffix = randomUUID();
  const orderId = `order-operations-${suffix}`;
  const ownerUserId = `user-owner-${suffix}`;
  const assignedUserId = `user-assigned-${suffix}`;
  const otherUserId = `user-other-${suffix}`;
  const restrictedAuditId = randomUUID();
  const [owner, assigned, other] = await db.insert(operatorsTable).values([
    { email: `owner-${suffix}@example.test`, clerkUserId: ownerUserId, role: "owner", status: "active" },
    {
      email: `assigned-${suffix}@example.test`,
      clerkUserId: assignedUserId,
      role: "operator",
      status: "active",
      permissionAllows: ["orders.status"],
    },
    {
      email: `other-${suffix}@example.test`,
      clerkUserId: otherUserId,
      role: "operator",
      status: "active",
      permissionAllows: ["orders.status"],
    },
  ]).returning();
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  const api = await startApi();
  const headers = (userId: string) => ({ "x-test-clerk-user-id": userId });
  const request = (path: string, body: Record<string, unknown>, method: string, userId: string) =>
    apiJson(api.url, path, body, method, headers(userId));
  try {
    await db.insert(ordersTable).values({
      id: orderId, type: "manual", status: "pending",
      fromAsset: "USD", fromNetwork: "Wire", toAsset: "BTC", toNetwork: "Bitcoin",
      amount: "100", receiveAmount: "0.001", customerEmail: `order-${suffix}@example.test`,
      customerName: "Operations", provider: "Manual desk",
    });

    let version = 0;
    let result = await request(`/orders/${orderId}/assignment`, {
      recordVersion: version, assigneeOperatorId: assigned.id,
    }, "POST", ownerUserId);
    assert.equal(result.status, 200);
    assert.equal(result.body.assignedOperatorId, assigned.id);
    version += 1;

    result = await request(`/orders/${orderId}/assignment`, {
      recordVersion: version, assigneeOperatorId: other.id,
    }, "POST", ownerUserId);
    assert.equal(result.status, 200); // reassignment
    version += 1;
    result = await request(`/orders/${orderId}/assignment`, {
      recordVersion: version, assigneeOperatorId: null,
    }, "POST", ownerUserId);
    assert.equal(result.status, 200); // unassignment
    version += 1;

    result = await request(`/orders/${orderId}`, { recordVersion: version, status: "operator attempt" }, "PATCH", otherUserId);
    assert.equal(result.status, 200); // the first operator status transition claims the unassigned order
    assert.equal(result.body.assignedOperatorId, other.id);
    version += 1;
    result = await request(`/orders/${orderId}`, { recordVersion: version, status: "owner updated" }, "PATCH", ownerUserId);
    assert.equal(result.status, 200);
    version += 1;

    result = await request(`/orders/${orderId}/assignment`, {
      recordVersion: version, assigneeOperatorId: assigned.id,
    }, "POST", ownerUserId);
    assert.equal(result.status, 200);
    version += 1;
    result = await request(`/orders/${orderId}`, {
      recordVersion: version, status: "other operator attempt",
    }, "PATCH", otherUserId);
    assert.equal(result.status, 403);
    result = await request(`/orders/${orderId}`, {
      recordVersion: version, status: "assigned updated",
    }, "PATCH", assignedUserId);
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "assigned updated");
    version += 1;

    result = await request(`/orders/${orderId}/archive`, { recordVersion: version }, "POST", ownerUserId);
    assert.equal(result.status, 200);
    assert.ok(result.body.archivedAt);
    version += 1;
    const defaultList = await fetch(`${api.url}/orders?search=${orderId}`, { headers: headers(ownerUserId) });
    const defaultListBody = await defaultList.json() as { total?: number; code?: string; message?: string };
    assert.equal(defaultList.status, 200, JSON.stringify(defaultListBody));
    assert.equal(defaultListBody.total, 0);
    const archivedList = await fetch(`${api.url}/orders?${new URLSearchParams({ search: orderId, archived: "archived" })}`, { headers: headers(ownerUserId) });
    assert.equal((await archivedList.json() as { total: number }).total, 1);

    result = await request(`/orders/${orderId}/assignment`, {
      recordVersion: version, assigneeOperatorId: other.id,
    }, "POST", ownerUserId);
    assert.equal(result.status, 409);
    result = await request(`/orders/${orderId}`, { recordVersion: version, status: "blocked" }, "PATCH", assignedUserId);
    assert.equal(result.status, 409);
    result = await request(`/orders/${orderId}/restore`, { recordVersion: version - 1 }, "POST", ownerUserId);
    assert.equal(result.status, 409); // stale version
    result = await request(`/orders/${orderId}/restore`, { recordVersion: version }, "POST", ownerUserId);
    assert.equal(result.status, 200);

    const historyResponse = await fetch(`${api.url}/orders/${orderId}/audit-log`, { headers: headers(ownerUserId) });
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json() as Array<{ action: string; createdAt: string; actorEmail: string | null }>;
    assert.deepEqual(history.map(event => event.action), [
      "order.assigned", "order.assigned", "order.unassigned", "order.operator_updated",
      "order.operator_updated", "order.assigned", "order.operator_updated", "order.archived",
      "order.restored",
    ]);
    assert.equal(history[0]?.actorEmail, owner.email);
    assert.ok(history.every(event => Number.isFinite(new Date(event.createdAt).getTime())));
    const mutationAttempt = await fetch(`${api.url}/orders/${orderId}/audit-log`, {
      method: "DELETE", headers: headers(ownerUserId),
    });
    assert.notEqual(mutationAttempt.status, 200);
    const afterMutationAttempt = await fetch(`${api.url}/orders/${orderId}/audit-log`, { headers: headers(ownerUserId) });
    assert.equal((await afterMutationAttempt.json() as unknown[]).length, history.length);

    await db.insert(orderAuditLogsTable).values({
      id: restrictedAuditId,
      orderId,
      action: "order.test_append",
      actorType: "system",
      previousVersion: 0,
      nextVersion: 0,
    });
    await assert.rejects(
      pool.query(
        `UPDATE exchange_order_audit_logs SET action = action WHERE id = $1`,
        [restrictedAuditId],
      ),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "42501",
    );
    await assert.rejects(
      pool.query(
        "GRANT quickex_order_audit_maintenance TO quickex_app_runtime",
      ),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "42501",
    );
    await assert.rejects(
      pool.query("SET ROLE quickex_order_audit_maintenance"),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "42501",
    );

    const maintenanceClient = await privilegedTestPool.connect();
    try {
      const administratorIdentity = await maintenanceClient.query<{
        currentUser: string;
      }>(`SELECT current_user AS "currentUser"`);
      await maintenanceClient.query("BEGIN");
      await maintenanceClient.query(
        "SET LOCAL ROLE quickex_order_audit_maintenance",
      );
      await maintenanceClient.query(
        `UPDATE exchange_order_audit_logs
         SET action = action
         WHERE id = $1`,
        [restrictedAuditId],
      );
      await maintenanceClient.query("COMMIT");

      const identityAfterMaintenance = await maintenanceClient.query<{
        currentUser: string;
      }>(`SELECT current_user AS "currentUser"`);
      assert.equal(
        identityAfterMaintenance.rows[0]?.currentUser,
        administratorIdentity.rows[0]?.currentUser,
      );

      await assert.rejects(
        pool.query(
          `DELETE FROM exchange_order_audit_logs WHERE id = $1`,
          [restrictedAuditId],
        ),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "42501",
      );
    } finally {
      await maintenanceClient.query("ROLLBACK");
      maintenanceClient.release();
    }
  } finally {
    await deleteOrderAuditLogsForMaintenance(orderId);
    await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
    await db.delete(operatorsTable).where(inArray(operatorsTable.id, [owner.id, assigned.id, other.id]));
    await api.close();
  }
});