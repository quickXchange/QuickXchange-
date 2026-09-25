import assert from "node:assert/strict";
import test from "node:test";
import {
  runWhitebitHistoryCycle,
  type WhitebitHistoryCyclePorts,
} from "../src/lib/whitebit-history-worker";
import {
  matchWhitebitHistoryForOrder,
  matchesFrozenWhitebitClaim,
  type PendingWhitebitOrder,
  type ReadyWhitebitClaim,
} from "../src/lib/whitebit-history-match";
import { WhitebitProviderHttpError } from "../src/routes/whitebit";

const leaseToken = "00000000-0000-4000-8000-000000000001";

function order(id = "O-WHITEBIT-TEST", status = "awaiting funds"): PendingWhitebitOrder {
  return {
    id,
    type: "manual",
    status,
    manualSettlementState: status === "awaiting funds" ? "awaiting_funds" : "funds_confirmed",
    fundingStatus: "ready_whitebit",
    fundingProviderSource: "whitebit",
    fromAsset: "BTC",
    sourceSettlementOptionId: "crypto:btc-bitcoin",
    depositAddress: "bc1q-history-test",
    depositMemo: "TAG-1",
    amount: "1.25",
    fundingDetailsSnapshot: {
      networkId: "btc-bitcoin",
      whitebitAssetCode: "BTC",
      whitebitNetworkCode: "BITCOIN",
      selectedProvider: "whitebit",
      addressSource: "live_api",
      address: "bc1q-history-test",
      memo: "TAG-1",
    },
    settlementSnapshot: { funding: { address: "bc1q-history-test", memo: "TAG-1" } },
  };
}

function claim(
  orderId = "O-WHITEBIT-TEST",
  memo: string | null = "TAG-1",
): ReadyWhitebitClaim {
  return {
    orderId,
    status: "ready",
    ticker: "BTC",
    providerTicker: "BTC",
    network: "BITCOIN",
    address: "bc1q-history-test",
    memo,
  };
}

function historyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    address: "bc1q-history-test",
    ticker: "BTC",
    network: "BITCOIN",
    memo: "TAG-1",
    amount: "1.25",
    fee: "0",
    status: 3,
    unique_id: "history-deposit-1",
    transaction_id: "history-transaction-1",
    transactionHash: "history-hash-1",
    ...overrides,
  };
}

type Candidate = { order: PendingWhitebitOrder; claim: ReadyWhitebitClaim };
type MockState = {
  orderStatus: "awaiting funds" | "processing" | "completed";
  settlement: "awaiting_funds" | "funds_confirmed" | "completed";
  deposits: Set<string>;
  audits: Set<string>;
  addressCreations: number;
  monitorWatchCreations: number;
};

function fixture(options: {
  records?: Record<string, unknown>[];
  candidate?: Candidate;
  history?: () => Promise<Record<string, unknown>[]>;
  onApply?: (state: MockState, candidate: Candidate, deposit: unknown) => Promise<void> | void;
} = {}) {
  const state: MockState = {
    orderStatus: "awaiting funds",
    settlement: "awaiting_funds",
    deposits: new Set(),
    audits: new Set(),
    addressCreations: 0,
    monitorWatchCreations: 0,
  };
  const selected: Candidate = options.candidate ?? { order: order(), claim: claim() };
  const calls = {
    histories: 0,
    advances: [] as string[],
    failures: [] as Array<{ code: string; message: string }>,
    releases: [] as string[],
    successes: 0,
    applyCalls: 0,
    leaseCursor: null as string | null,
    leaseAvailable: true,
  };
  const ports: WhitebitHistoryCyclePorts = {
    acquire: async () => calls.leaseAvailable ? { token: leaseToken, cursor: calls.leaseCursor } : null,
    renew: async () => true,
    candidates: async () => state.orderStatus === "awaiting funds" ? [selected] as never : [],
    history: async () => {
      calls.histories += 1;
      return options.history ? options.history() : options.records ?? [historyRecord()];
    },
    apply: async (_token, candidate, deposit) => {
      calls.applyCalls += 1;
      if (options.onApply) {
        await options.onApply(state, candidate as unknown as Candidate, deposit);
        return;
      }
      const identity = "history-deposit-1";
      if (state.deposits.has(identity)) return;
      state.deposits.add(identity);
      state.audits.add(`deposit:${identity}`);
      state.orderStatus = "processing";
      state.settlement = "funds_confirmed";
    },
    advance: async (_token, id) => {
      calls.advances.push(id);
      calls.leaseCursor = id;
    },
    success: async () => { calls.successes += 1; },
    failure: async (_token, code, message) => { calls.failures.push({ code, message }); },
    release: async (token) => { calls.releases.push(token); },
  };
  return { ports, state, calls };
}

function assertNoAddressOrWatchCreation(state: MockState) {
  assert.equal(state.addressCreations, 0);
  assert.equal(state.monitorWatchCreations, 0);
}

test("WhiteBIT webhook first means history skips the already-confirmed order", async () => {
  const mock = fixture();
  mock.state.deposits.add("history-deposit-1");
  mock.state.audits.add("deposit:history-deposit-1");
  mock.state.orderStatus = "processing";
  mock.state.settlement = "funds_confirmed";

  assert.equal(await runWhitebitHistoryCycle(mock.ports), "success");
  assert.equal(mock.calls.histories, 0);
  assert.equal(mock.state.deposits.size, 1);
  assert.equal(mock.state.audits.size, 1);
  assertNoAddressOrWatchCreation(mock.state);
});

test("WhiteBIT history detects a terminal deposit when its webhook is missing", async () => {
  const mock = fixture();

  assert.equal(await runWhitebitHistoryCycle(mock.ports), "success");
  assert.equal(mock.state.orderStatus, "processing");
  assert.equal(mock.state.settlement, "funds_confirmed");
  assert.equal(mock.state.deposits.size, 1);
  assert.equal(mock.state.audits.size, 1);
  assert.deepEqual(mock.calls.advances, ["O-WHITEBIT-TEST"]);
  assertNoAddressOrWatchCreation(mock.state);
});

test("WhiteBIT webhook arriving during history reconciliation cannot double-apply", async () => {
  const mock = fixture({
    history: async () => {
      mock.state.deposits.add("history-deposit-1");
      mock.state.audits.add("deposit:history-deposit-1");
      mock.state.orderStatus = "processing";
      mock.state.settlement = "funds_confirmed";
      return [historyRecord()];
    },
  });

  assert.equal(await runWhitebitHistoryCycle(mock.ports), "success");
  assert.equal(mock.calls.applyCalls, 1);
  assert.equal(mock.state.deposits.size, 1);
  assert.equal(mock.state.audits.size, 1);
  assert.equal(mock.state.orderStatus, "processing");
  assertNoAddressOrWatchCreation(mock.state);
});

test("WhiteBIT webhook arriving after an empty history poll is not applied twice", async () => {
  const mock = fixture({ records: [] });
  assert.equal(await runWhitebitHistoryCycle(mock.ports), "success");
  assert.equal(mock.state.deposits.size, 0);
  assert.equal(mock.state.orderStatus, "awaiting funds");

  // The later webhook uses the same idempotent processor as the history path.
  mock.state.deposits.add("history-deposit-1");
  mock.state.audits.add("deposit:history-deposit-1");
  mock.state.orderStatus = "processing";
  mock.state.settlement = "funds_confirmed";
  assert.equal(await runWhitebitHistoryCycle(mock.ports), "success");
  assert.equal(mock.calls.histories, 1);
  assert.equal(mock.state.deposits.size, 1);
  assert.equal(mock.state.audits.size, 1);
  assertNoAddressOrWatchCreation(mock.state);
});

test("duplicate terminal WhiteBIT history records are quarantined without duplicate effects", async () => {
  const mock = fixture({ records: [historyRecord(), historyRecord({ unique_id: "history-deposit-2" })] });

  assert.equal(await runWhitebitHistoryCycle(mock.ports), "failed");
  assert.equal(mock.calls.failures[0]?.code, "HISTORY_MISMATCH");
  assert.equal(mock.calls.applyCalls, 0);
  assert.equal(mock.state.deposits.size, 0);
  assert.equal(mock.state.audits.size, 0);
  assertNoAddressOrWatchCreation(mock.state);
});

test("WhiteBIT history matches null and empty memo representations as absent", async () => {
  const memoLessOrder = order();
  memoLessOrder.depositMemo = null;
  memoLessOrder.fundingDetailsSnapshot = {
    ...(memoLessOrder.fundingDetailsSnapshot as Record<string, unknown>),
    memo: null,
  };
  memoLessOrder.settlementSnapshot = { funding: { address: memoLessOrder.depositAddress, memo: null } };
  const memoLessClaim = claim(memoLessOrder.id, null);
  for (const memo of [null, "", " \t"]) {
    const result = matchWhitebitHistoryForOrder(memoLessOrder, memoLessClaim, [historyRecord({ memo })]);
    assert.equal(result.kind, "matched", `memo representation ${JSON.stringify(memo)} should match absent memo`);
  }

  const mock = fixture({
    candidate: { order: memoLessOrder, claim: memoLessClaim },
    records: [historyRecord({ memo: "" })],
  });
  assert.equal(await runWhitebitHistoryCycle(mock.ports), "success");
  assert.equal(mock.state.deposits.size, 1);
  assertNoAddressOrWatchCreation(mock.state);
});

test("WhiteBIT history accepts numeric terminal statuses and rejects malformed ones", () => {
  const numeric = matchWhitebitHistoryForOrder(order(), claim(), [historyRecord({ status: "3" })]);
  assert.equal(numeric.kind, "matched");
  const malformed = matchWhitebitHistoryForOrder(order(), claim(), [historyRecord({ status: "completed" })]);
  assert.equal(malformed.kind, "unsafe");
});

test("WhiteBIT history rejects wrong address, network, or asset without side effects", async () => {
  assert.equal(matchesFrozenWhitebitClaim(order(), claim()), true);
  assert.equal(matchesFrozenWhitebitClaim(order(), claim("O-WHITEBIT-TEST", null)), false);
  for (const badRecord of [
    historyRecord({ address: "different-address" }),
    historyRecord({ network: "TRC20" }),
    historyRecord({ ticker: "ETH" }),
  ]) {
    const mock = fixture({ records: [badRecord] });
    assert.equal(await runWhitebitHistoryCycle(mock.ports), "failed");
    assert.equal(mock.calls.failures[0]?.code, "HISTORY_MISMATCH");
    assert.equal(mock.calls.applyCalls, 0);
    assert.equal(mock.state.deposits.size, 0);
    assert.equal(mock.state.audits.size, 0);
    assertNoAddressOrWatchCreation(mock.state);
  }
});

test("WhiteBIT history 401 and 403 failures are explicit and never apply deposits", async () => {
  for (const status of [401, 403]) {
    const mock = fixture({
      history: async () => { throw new WhitebitProviderHttpError(status, true); },
    });
    assert.equal(await runWhitebitHistoryCycle(mock.ports), "failed");
    assert.equal(mock.calls.failures[0]?.code, "WHITEBIT_HISTORY_AUTH_REJECTED");
    assert.match(mock.calls.failures[0]?.message ?? "", /credential/i);
    assert.equal(mock.calls.applyCalls, 0);
    assert.equal(mock.state.deposits.size, 0);
    assert.equal(mock.state.audits.size, 0);
    assertNoAddressOrWatchCreation(mock.state);
  }
});

test("WhiteBIT lease loss during a race stops before applying a history match", async () => {
  const mock = fixture();
  let renewals = 0;
  mock.ports.renew = async () => ++renewals < 2;

  assert.equal(await runWhitebitHistoryCycle(mock.ports), "busy");
  assert.equal(mock.calls.histories, 1);
  assert.equal(mock.calls.applyCalls, 0);
  assert.equal(mock.calls.failures.length, 0);
  assert.equal(mock.state.deposits.size, 0);
  assert.equal(mock.state.audits.size, 0);
  assert.deepEqual(mock.calls.releases, [leaseToken]);
  assertNoAddressOrWatchCreation(mock.state);
});

test("WhiteBIT processing and completed orders are excluded from history candidates", async () => {
  for (const terminalState of [
    { status: "processing" as const, settlement: "funds_confirmed" as const },
    { status: "completed" as const, settlement: "completed" as const },
  ]) {
    const mock = fixture();
    mock.state.orderStatus = terminalState.status;
    mock.state.settlement = terminalState.settlement;
    mock.state.deposits.add("history-deposit-1");
    mock.state.audits.add("deposit:history-deposit-1");

    assert.equal(await runWhitebitHistoryCycle(mock.ports), "success");
    assert.equal(mock.calls.histories, 0);
    assert.equal(mock.calls.applyCalls, 0);
    assert.equal(mock.state.deposits.size, 1);
    assert.equal(mock.state.audits.size, 1);
    assertNoAddressOrWatchCreation(mock.state);
  }
});

test("WhiteBIT worker restart resumes from cursor and releases each lease for handoff", async () => {
  const mock = fixture({ records: [] });
  let leaseNumber = 0;
  mock.ports.acquire = async () => ({
    token: ++leaseNumber === 1 ? leaseToken : "00000000-0000-4000-8000-000000000002",
    cursor: mock.calls.leaseCursor,
  });
  const firstCycle = await runWhitebitHistoryCycle(mock.ports);
  assert.equal(firstCycle, "success");
  assert.deepEqual(mock.calls.advances, ["O-WHITEBIT-TEST"]);
  assert.deepEqual(mock.calls.releases, [leaseToken]);

  mock.state.orderStatus = "completed";
  const originalCandidates = mock.ports.candidates;
  mock.ports.candidates = async (cursor) => {
    assert.equal(cursor, "O-WHITEBIT-TEST");
    return originalCandidates(cursor);
  };
  const secondCycle = await runWhitebitHistoryCycle(mock.ports);
  assert.equal(secondCycle, "success");
  assert.equal(mock.calls.histories, 1);
  assert.deepEqual(mock.calls.releases, [
    leaseToken,
    "00000000-0000-4000-8000-000000000002",
  ]);
  assert.equal(mock.state.deposits.size, 0);
  assert.equal(mock.state.audits.size, 0);
  assertNoAddressOrWatchCreation(mock.state);
});