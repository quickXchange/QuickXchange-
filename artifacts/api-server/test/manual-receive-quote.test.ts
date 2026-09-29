import assert from "node:assert/strict";
import test from "node:test";
import { CreateExchangeQuoteByReceiveBody } from "@workspace/api-zod";
import {
  beforeManualReceiveDeadline,
  effectiveManualReceiveTarget,
  solveManualReceiveQuote,
} from "../src/lib/manual-receive-quote";
import {
  signQuoteTicket,
  verifyQuoteTicketForHistory,
} from "../src/lib/quote-ticket";

test("generated Manual receive request contract requires route IDs and a positive desired receive amount", () => {
  const input = CreateExchangeQuoteByReceiveBody.parse({
    fromAsset: "EUR",
    fromNetwork: "EUR",
    toAsset: "USD",
    toNetwork: "USD",
    sourceSettlementOptionId: "source",
    targetSettlementOptionId: "target",
    desiredReceiveAmount: 25,
    selectedAddOnKeys: ["priority"],
  });
  assert.equal(input.desiredReceiveAmount, 25);
  assert.deepEqual(input.selectedAddOnKeys, ["priority"]);
  assert.throws(() => CreateExchangeQuoteByReceiveBody.parse({
    fromAsset: "EUR",
    fromNetwork: "EUR",
    toAsset: "USD",
    toNetwork: "USD",
    sourceSettlementOptionId: "source",
    targetSettlementOptionId: "target",
    desiredReceiveAmount: 0,
  }));
  assert.throws(() => CreateExchangeQuoteByReceiveBody.parse({
    fromAsset: "EUR",
    fromNetwork: "EUR",
    toAsset: "USD",
    toNetwork: "USD",
    sourceSettlementOptionId: "source",
    desiredReceiveAmount: 25,
  }));
});

test("Manual receive inversion finds the minimum source amount using forward pricing", async () => {
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 20,
    minAmount: 1,
    maxAmount: 100,
    initialUpperAmount: 10,
    quote: async (amount) => amount * 2,
  });
  assert.ok(solution);
  assert.ok(solution.amount >= 10);
  assert.ok(solution.amount - 10 < 1e-7);
  assert.ok(solution.receiveAmount >= 20);
});

test("Manual receive inversion handles tier boundaries and fixed pricing fees", async () => {
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 30,
    minAmount: 1,
    maxAmount: 100,
    initialUpperAmount: 10,
    tierBoundaries: [10, 25],
    quote: async (amount) => {
      const tierRate = amount <= 10 ? 1 : amount <= 25 ? 1.5 : 2;
      const fixedFee = amount <= 10 ? 0 : amount <= 25 ? 3 : 5;
      return Math.max(0, amount * tierRate - fixedFee);
    },
  });
  assert.ok(solution);
  assert.ok(solution.amount > 10);
  assert.ok(solution.amount < 25);
  assert.ok(solution.receiveAmount >= 30);
  assert.ok(solution.amount - 22 < 1e-6);
});

test("tier minimum discontinuities search the interior separately from exact boundary prices", async () => {
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 10,
    minAmount: 1,
    maxAmount: 30,
    initialUpperAmount: 12,
    tierBoundaries: [10, 20],
    quote: async (amount) => {
      if (amount <= 10) return amount * 0.5;
      if (amount <= 20) return amount * 1.2 - 1;
      return 0;
    },
  });
  assert.ok(solution);
  assert.ok(solution.amount > 10);
  assert.ok(solution.amount < 20);
  assert.ok(solution.receiveAmount >= 10);
});

test("fallback-pricing gaps between tier ranges are searched independently of their endpoints", async () => {
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 12,
    minAmount: 1,
    maxAmount: 30,
    initialUpperAmount: 12,
    tierBoundaries: [10, 20],
    quote: async (amount) => amount > 10 && amount < 20 ? amount : 0,
  });
  assert.ok(solution);
  assert.ok(solution.amount >= 12);
  assert.ok(solution.amount < 20);
  assert.equal(solution.receiveAmount, 12);
});

test("wide configured source maximum brackets near the estimated minimal amount", async () => {
  const target = effectiveManualReceiveTarget(1, undefined, 1.1);
  assert.equal(target, 1);
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: target!,
    minAmount: 1e-12,
    maxAmount: 1_000_000_000,
    initialUpperAmount: 1,
    receiveQuantum: 0.01,
    quote: async (amount) => amount,
  });
  assert.ok(solution);
  assert.ok(solution.amount >= 1);
  assert.ok(solution.amount < 1.000001);
  assert.ok(solution.receiveAmount <= 1.1);
});

test("a capped source interval probes its upper interior when the base-rate estimate exceeds the cap", async () => {
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 150,
    minAmount: 1e-12,
    maxAmount: 100,
    initialUpperAmount: 150,
    tierBoundaries: [10],
    quote: async (amount) => amount <= 10 ? amount : amount * 2,
  });
  assert.ok(solution);
  assert.ok(solution.amount >= 75);
  assert.ok(solution.amount < 75.01);
  assert.ok(solution.receiveAmount >= 150);

  const impossible = await solveManualReceiveQuote({
    desiredReceiveAmount: 250,
    minAmount: 1e-12,
    maxAmount: 100,
    initialUpperAmount: 250,
    tierBoundaries: [10],
    quote: async (amount) => amount <= 10 ? amount : amount * 2,
  });
  assert.equal(impossible, undefined);
});

test("bounded expansion still brackets a large fixed-fee route within its budget", async () => {
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 1,
    minAmount: 1e-12,
    initialUpperAmount: 1,
    maxAttempts: 44,
    quote: async (amount) => Math.max(0, amount - 1_000_000),
  });
  assert.ok(solution);
  assert.ok(solution.amount >= 1_000_001);
  assert.ok(solution.amount - 1_000_001 < 1e-6);
  assert.equal(solution.receiveAmount, 1);
});

test("reverse quote deadline and attempt budgets fail explicitly", async () => {
  await assert.rejects(
    beforeManualReceiveDeadline(
      new Promise<number>(() => undefined),
      Date.now() + 5,
    ),
    { code: "MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED", status: 503 },
  );
  await assert.rejects(
    solveManualReceiveQuote({
      desiredReceiveAmount: 100,
      minAmount: 1,
      maxAmount: 1_000,
      initialUpperAmount: 1,
      maxAttempts: 1,
      quote: async (amount) => amount,
    }),
    { code: "MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED", status: 503 },
  );
});

test("Manual receive inversion applies source minimums and source maximum feasibility", async () => {
  const atMinimum = await solveManualReceiveQuote({
    desiredReceiveAmount: 5,
    minAmount: 3,
    maxAmount: 10,
    initialUpperAmount: 3,
    quote: async (amount) => amount * 2,
  });
  assert.deepEqual(atMinimum, { amount: 3, receiveAmount: 6 });

  const impossible = await solveManualReceiveQuote({
    desiredReceiveAmount: 25,
    minAmount: 3,
    maxAmount: 10,
    initialUpperAmount: 8,
    quote: async (amount) => amount * 2,
  });
  assert.equal(impossible, undefined);
});

test("fiat target minimums raise the receive target and target maximums reject impossible requests", () => {
  assert.equal(effectiveManualReceiveTarget(5, 10, 20), 10);
  assert.equal(effectiveManualReceiveTarget(15, 10, 20), 15);
  assert.equal(effectiveManualReceiveTarget(21, 10, 20), undefined);
  assert.equal(effectiveManualReceiveTarget(5, 21, 20), undefined);
});

test("Manual receive inversion includes selected fixed and percentage add-on fees", async () => {
  const addonFixedFee = 2;
  const addonPercentage = 0.1;
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 18,
    minAmount: 1,
    maxAmount: 100,
    initialUpperAmount: 12,
    quote: async (amount) => {
      const grossReceive = amount * 2;
      return grossReceive - addonFixedFee - grossReceive * addonPercentage;
    },
  });
  assert.ok(solution);
  assert.ok(solution.amount >= 11.111111);
  assert.ok(solution.receiveAmount >= 18);
});

test("the signed Manual Swap ticket preserves the solver's final source and receive amounts", async () => {
  process.env.SESSION_SECRET = "manual-receive-quote-test-secret";
  const forwardQuotes = new Map<number, number>();
  const solution = await solveManualReceiveQuote({
    desiredReceiveAmount: 11,
    minAmount: 1,
    maxAmount: 100,
    initialUpperAmount: 10,
    quote: async (amount) => {
      const receiveAmount = amount * 1.25 - 1;
      forwardQuotes.set(amount, receiveAmount);
      return receiveAmount;
    },
  });
  assert.ok(solution);
  const amount = solution.amount;
  const receiveAmount = forwardQuotes.get(amount);
  assert.equal(receiveAmount, solution.receiveAmount);
  const quoteId = signQuoteTicket({
    v: 1,
    type: "manual",
    fromAsset: "EUR",
    fromNetwork: "EUR",
    toAsset: "USD",
    toNetwork: "USD",
    amount,
    receiveAmount: receiveAmount!,
    rate: receiveAmount! / amount,
    fee: 1,
    provider: "Manual desk",
    expiresAt: Date.now() + 60_000,
  });
  const verified = verifyQuoteTicketForHistory(quoteId);
  assert.equal(verified.amount, solution.amount);
  assert.equal(verified.receiveAmount, solution.receiveAmount);
});