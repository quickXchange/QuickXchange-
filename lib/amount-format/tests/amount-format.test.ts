import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAmountInputValue, formatDisplayAmount } from "../src/index";

test("global examples round to at most three places without padded zeros", () => {
  for (const [input, output] of [
    ["123.456789", "123.457"], ["10.12345", "10.123"],
    ["1000", "1000"], ["10.5", "10.5"], ["9.9995", "10"],
    ["-123.456789", "-123.457"], ["-0.00049", "0"],
    ["0.0005", "0.001"], ["0.00000001", "0"], ["1.2345e3", "1234.5"],
    [".1235", "0.124"], ["1.23000", "1.23"],
  ]) assert.equal(formatDisplayAmount(input), output);
});
test("decimal strings stay exact beyond JavaScript safe integer precision", () => {
  assert.equal(formatDisplayAmount("999999999999999999.123499999"), "999999999999999999.123");
  assert.equal(formatDisplayAmount("999999999999999999.9995"), "1000000000000000000");
  assert.equal(formatDisplayAmount("999999999999999999.1235", { useGrouping: true }, "en-US"), "999,999,999,999,999,999.124");
});
test("locale and currency adornments obey the same rule", () => {
  assert.equal(formatDisplayAmount("10.12345", {}, "de-DE"), "10,123");
  assert.equal(formatDisplayAmount("10.5", { style: "currency", currency: "USD" }, "en-US"), "$10.5");
  assert.equal(formatDisplayAmount("10.12345", { maximumFractionDigits: 8, minimumFractionDigits: 8 }, "en-US"), "10.123");
  assert.equal(formatDisplayAmount("0.12345678", { style: "percent" }, "en-US"), "12.346%");
});
test("invalid values are explicit; presentation never mutates input data", () => {
  for (const input of [undefined, null, "", "NaN", Infinity, "not an amount"]) assert.equal(formatDisplayAmount(input), "—");
  const quote = { amount: "123.456789", receiveAmount: "0.00012345678", fees: "1.12345678" };
  const before = JSON.stringify(quote);
  for (const value of Object.values(quote)) formatDisplayAmount(value);
  assert.equal(JSON.stringify(quote), before);
});

test("editable values retain exact text and only unfocused presentation rounds", () => {
  const exact = "50.123456";
  assert.equal(formatAmountInputValue(exact, true), exact);
  assert.equal(formatAmountInputValue(exact, false), "50.123");
  assert.equal(exact, "50.123456");
  assert.equal(formatAmountInputValue("", false), "");
  assert.equal(formatAmountInputValue(".", true), ".");
});