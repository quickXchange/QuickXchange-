import assert from "node:assert/strict";
import test from "node:test";
import {
  isDevelopmentQuoteTimingEnabled,
  sanitizeDevelopmentQuoteId,
} from "../src/lib/development-quote-timing";

test("quote timing is development-only, with an explicit test opt-in", () => {
  assert.equal(isDevelopmentQuoteTimingEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isDevelopmentQuoteTimingEnabled({ NODE_ENV: "test" }), false);
  assert.equal(isDevelopmentQuoteTimingEnabled({
    NODE_ENV: "test", DEVELOPMENT_QUOTE_TIMING: "true",
  }), true);
  assert.equal(isDevelopmentQuoteTimingEnabled({
    NODE_ENV: "production", DEVELOPMENT_QUOTE_TIMING: "true",
  }), false);
  assert.equal(isDevelopmentQuoteTimingEnabled({}), false);
  assert.equal(isDevelopmentQuoteTimingEnabled({ DEVELOPMENT_QUOTE_TIMING: "true" }), false);
});

test("quote correlation IDs cannot inject headers or unbounded log values", () => {
  assert.equal(sanitizeDevelopmentQuoteId("mini-quote_123"), "mini-quote_123");
  assert.equal(sanitizeDevelopmentQuoteId("id\r\n<\"header\">"), "idheader");
  assert.equal(sanitizeDevelopmentQuoteId("x".repeat(500)), "x".repeat(96));
  assert.equal(sanitizeDevelopmentQuoteId("! <>"), undefined);
  assert.equal(sanitizeDevelopmentQuoteId(undefined), undefined);
});