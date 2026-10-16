import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import pinoHttp from "pino-http";
import test, { after, before } from "node:test";
import { eq } from "drizzle-orm";
import {
  db, pool, fiatCurrenciesTable, fiatCurrencyPaymentMethodsTable,
  paymentMethodsTable, manualDeskPricingRulesTable, ordersTable,
  cryptoAssetsTable, cryptoAssetNetworksTable, operatorsTable,
} from "@workspace/db";
import exchangeRouter from "../src/routes/exchange";
import exchangeConfigRouter from "../src/routes/exchange-config";
import { configureCustomerAuthorizationForTests } from "../src/lib/customer-auth";
import { configureManualDeskRateAdapterForTests } from "../src/lib/manual-desk-rates";
import { assertIsolatedWhitebitDatabase } from "./assert-isolated-whitebit-database";
import { configureOperatorAuthorizationForTests } from "../src/lib/operator-auth";

assertIsolatedWhitebitDatabase();
configureCustomerAuthorizationForTests({ getUserId: () => null });
configureOperatorAuthorizationForTests({
  getUserId: request => request.get("x-test-operator") ?? null,
  getVerifiedEmail: () => "buy-test-owner@example.test",
  getSecondFactorVerified: () => true,
  getTotpEnabled: () => true,
});
configureManualDeskRateAdapterForTests(async () => ({ USD: 1, EUR: 0.9, BTC: 0.00002, USDT: 1, USDC: 1 }));
const app = express();
app.use(pinoHttp({ level: "silent" }));
app.use(express.json());
app.use("/api", exchangeConfigRouter, exchangeRouter);
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(error.status ?? 500).json({ code: error.code, error: error.message, cause: error.cause?.message });
});
let server: ReturnType<typeof app.listen>;
let url = "";
before(async () => {
  await db.insert(operatorsTable).values({
    clerkUserId: "buy-test-owner", email: "buy-test-owner@example.test",
    name: "Synthetic Owner", role: "owner", status: "active",
  });
  await db.insert(cryptoAssetsTable).values({
    id: "buy-test-usdc", code: "USDC", name: "Synthetic USDC", decimals: 6, enabled: true,
  });
  await db.insert(cryptoAssetNetworksTable).values({
    id: "buy-test-usdc-bep20", assetId: "buy-test-usdc", networkCode: "BEP20",
    networkName: "Synthetic BSC", decimals: 6, enabled: true, executionMode: "manual",
    depositProvider: "none", customerDepositsEnabled: false,
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  url = `http://127.0.0.1:${address.port}/api`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});
async function json(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url + path, {
    ...(body ? {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
    } : { headers }),
  });
  return { status: response.status, body: await response.json() as any };
}

const destinations = [
  { id: "crypto:usdt-trc20", wallet: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE" },
  { id: "crypto:btc-bitcoin", wallet: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  { id: "crypto:buy-test-usdc-bep20", wallet: "0x000000000000000000000000000000000000dEaD" },
];
for (const methodName of ["SEPA Instant", "Wise", "Synthetic Bank"]) {
for (const destination of destinations) {
test(`EUR ${methodName} BUY → ${destination.id} preserves the quote and is visible in Admin and tracking`, async () => {
  const [eur] = await db.select().from(fiatCurrenciesTable).where(eq(fiatCurrenciesTable.code, "EUR"));
  assert.ok(eur);
  const methodId = `buy-sepa-${randomUUID()}`;
  await db.insert(paymentMethodsTable).values({
    id: methodId, name: methodName, family: "bank-transfer", enabled: true,
    executionMode: "manual", canSend: true, canReceive: true,
    fieldDefinitions: [
      { key: "name", type: "account-name", label: "Account holder", enabled: true, required: true, direction: "both" },
      { key: "iban", type: "account-iban", label: "IBAN", enabled: true, required: true, direction: "both" },
    ],
  });
  await db.insert(fiatCurrencyPaymentMethodsTable).values({
    fiatCurrencyId: eur.id, paymentMethodId: methodId, enabled: true, canSend: true, canReceive: true,
  });
  const config = await json("/exchange/config");
  assert.equal(config.status, 200, JSON.stringify(config.body));
  const source = config.body.manualSettlementOptions.find((o: any) => o.paymentMethodId === methodId);
  const target = config.body.manualSettlementOptions.find((o: any) => o.id === destination.id);
  assert.ok(source && target, JSON.stringify(config.body.manualSettlementOptions));
  await db.insert(manualDeskPricingRulesTable).values({
    name: "Synthetic BUY exact pricing", enabled: true, sourceAsset: "EUR", targetAsset: target.assetCode,
    sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
    exactRate: "1.1", markupBasisPoints: 75, fixedFee: "0.01",
  });
  const route = {
    type: "manual", fromAsset: source.assetCode, fromNetwork: source.routeNetwork,
    toAsset: target.assetCode, toNetwork: target.routeNetwork, amount: 100,
    sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
  };
  const quote = await json("/exchange/quote", route);
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  const input = {
    ...route, quoteId: quote.body.quoteId, clientRequestId: randomUUID(),
    customerEmail: "synthetic-buy@example.test",
    settlementDetails: { source_name: "Test Buyer", source_iban: "DE89370400440532013000" },
    destinationAddress: destination.wallet,
  };
  const missingWallet = await json("/orders", { ...input, destinationAddress: "", clientRequestId: randomUUID() });
  assert.equal(missingWallet.status, 400);
  assert.equal(missingWallet.body.code, "MANUAL_DESTINATION_ADDRESS_REQUIRED");
  const invalidWallet = await json("/orders", { ...input, destinationAddress: "invalid-wallet", clientRequestId: randomUUID() });
  assert.equal(invalidWallet.status, 400);
  assert.equal(invalidWallet.body.code, "MANUAL_DESTINATION_ADDRESS_INVALID");
  const missingIban = await json("/orders", {
    ...input, settlementDetails: { source_name: "Test Buyer" }, clientRequestId: randomUUID(),
  });
  assert.equal(missingIban.status, 400);
  assert.equal(missingIban.body.code, "SETTLEMENT_DETAILS_REQUIRED");
  const order = await json("/orders", input);
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const [saved] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.body.id));
  assert.equal(saved.amount, "100");
  assert.equal(saved.receiveAmount, String(quote.body.receiveAmount));
  assert.equal(saved.destinationAddress, destination.wallet);
  assert.equal(saved.orderSource, "website");
  assert.deepEqual(saved.settlementDetails, input.settlementDetails);
  const replay = await json("/orders", input);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.id, order.body.id);
  const headers = { "x-test-operator": "buy-test-owner" };
  const detail = await json(`/orders/${order.body.id}`, undefined, headers);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.id, saved.id);
  assert.equal(detail.body.destinationAddress, destination.wallet);
  const directory = await json(`/orders?search=${order.body.id}`, undefined, headers);
  assert.equal(directory.status, 200, JSON.stringify(directory.body));
  assert.ok(directory.body.items.some((o: any) => o.id === saved.id), JSON.stringify(Object.keys(directory.body)));
  const tracking = await json(`/orders/${order.body.id}/status?trackingToken=${encodeURIComponent(order.body.trackingToken)}`);
  assert.equal(tracking.status, 200, JSON.stringify(tracking.body));
  assert.equal(tracking.body.id, saved.id);
  assert.equal(tracking.body.status, "awaiting funds");
  assert.equal(String(tracking.body.receiveAmount), saved.receiveAmount);
  assert.equal(saved.manualSettlementState, "awaiting_funds");
});
}
}
