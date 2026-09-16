import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { pool } from "@workspace/db";
import {
  configureManualDeskRateAdapterForTests,
  getManualDeskReferenceRate,
} from "../src/lib/manual-desk-rates";

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  COINBASE_USD_RATES_URL: process.env.COINBASE_USD_RATES_URL,
  KRAKEN_XMR_USD_TICKER_URL: process.env.KRAKEN_XMR_USD_TICKER_URL,
};

let server: ReturnType<typeof createServer>;
let baseUrl = "";
let krakenCalls = 0;
let krakenMode: "ok" | "malformed" | "error" = "ok";
let coinbaseHasXmr = false;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function mock(_req: IncomingMessage, res: ServerResponse) {
  const path = new URL(_req.url ?? "/", "http://test").pathname;
  if (path === "/coinbase") {
    return send(res, 200, {
      data: {
        currency: "USD",
        rates: {
          BTC: "0.00002",
          ETH: "0.0003",
          ...(coinbaseHasXmr ? { XMR: "0.002" } : {}),
        },
      },
    });
  }
  if (path === "/kraken") {
    krakenCalls++;
    if (krakenMode === "malformed") return send(res, 200, { result: {} });
    if (krakenMode === "error") return send(res, 200, {
      error: ["EGeneral:Temporary error"],
      result: { XXMRZUSD: { c: ["500"] } },
    });
    return send(res, 200, {
      error: [],
      result: { XXMRZUSD: { c: ["500", "1"] } },
    });
  }
  send(res, 404, { error: "not found" });
}

function reset() {
  krakenCalls = 0;
  krakenMode = "ok";
  coinbaseHasXmr = false;
  configureManualDeskRateAdapterForTests(undefined);
}

before(async () => {
  process.env.NODE_ENV = "test";
  server = createServer(mock);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  process.env.COINBASE_USD_RATES_URL = `${baseUrl}/coinbase`;
  process.env.KRAKEN_XMR_USD_TICKER_URL = `${baseUrl}/kraken`;
});

after(async () => {
  configureManualDeskRateAdapterForTests(undefined);
  await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
  await pool.end();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Kraken XMR/USD is inverted into units per USD", async () => {
  reset();
  assert.equal(await getManualDeskReferenceRate({
    sourceCurrency: "XMR",
    targetCurrency: "USD",
    markupBasisPoints: 0,
  }), 500);
  assert.equal(await getManualDeskReferenceRate({
    sourceCurrency: "USD",
    targetCurrency: "XMR",
    markupBasisPoints: 0,
  }), 0.002);
  assert.equal(krakenCalls, 1);
});

test("malformed and error Kraken responses fail closed", async () => {
  reset();
  krakenMode = "malformed";
  await assert.rejects(
    () => getManualDeskReferenceRate({
      sourceCurrency: "XMR",
      targetCurrency: "USD",
      markupBasisPoints: 0,
    }),
    (error: unknown) => (error as { code?: string }).code === "MANUAL_DESK_RATE_UNAVAILABLE",
  );

  reset();
  krakenMode = "error";
  await assert.rejects(
    () => getManualDeskReferenceRate({
      sourceCurrency: "XMR",
      targetCurrency: "USD",
      markupBasisPoints: 0,
    }),
    (error: unknown) => (error as { code?: string }).code === "MANUAL_DESK_RATE_UNAVAILABLE",
  );
});

test("BTC-only requests do not call Kraken", async () => {
  reset();
  assert.equal(await getManualDeskReferenceRate({
    sourceCurrency: "BTC",
    targetCurrency: "USD",
    markupBasisPoints: 0,
  }), 50_000);
  assert.equal(krakenCalls, 0);
});

test("Coinbase XMR takes precedence over Kraken", async () => {
  reset();
  coinbaseHasXmr = true;
  assert.equal(await getManualDeskReferenceRate({
    sourceCurrency: "XMR",
    targetCurrency: "USD",
    markupBasisPoints: 0,
  }), 500);
  assert.equal(krakenCalls, 0);
});