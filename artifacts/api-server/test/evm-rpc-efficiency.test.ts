import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { BlockchainMonitorError, providerFailureDetails } from "../src/lib/blockchain-monitoring/errors";
import { queryEvmLogs } from "../src/lib/blockchain-monitoring/evm-log-query";
import { EvmJsonRpcAdapter } from "../src/lib/blockchain-monitoring/evm";

const topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const contract = `0x${"22".repeat(20)}`;
const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const recipient = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const rejected = (code: number, message: string) =>
  new BlockchainMonitorError("PROVIDER", "Provider rejected request", providerFailureDetails({ error: { code, message } }));

test("combined token filters use one read for multiple exact recipients", async () => {
  let calls = 0;
  const result = await queryEvmLogs(async filter => {
    calls++;
    assert.equal(filter.address, contract);
    assert.deepEqual(filter.topics, [topic, null, [recipient(1), recipient(2)]]);
    return ["event"];
  }, contract, [recipient(1), recipient(2)], 10, 19, topic);
  assert.deepEqual(result, ["event"]);
  assert.equal(calls, 1);
});

test("providers rejecting OR filters recover through exact individual filters", async () => {
  let calls = 0;
  const result = await queryEvmLogs(async filter => {
    calls++;
    const recipients = (filter.topics as unknown[])[2];
    if (Array.isArray(recipients)) throw rejected(-32602, "unsupported filter");
    return [recipients];
  }, contract, [recipient(1), recipient(2)], 10, 19, topic);
  assert.deepEqual(result, [recipient(1), recipient(2)]);
  assert.equal(calls, 3);
});

test("range fallback covers every block once without gaps or overlap", async () => {
  const blocks: number[] = [];
  const result = await queryEvmLogs(async filter => {
    const from = Number(BigInt(filter.fromBlock as string));
    const to = Number(BigInt(filter.toBlock as string));
    if (to - from > 1) throw rejected(-32005, "block range limit exceeded");
    const values = Array.from({ length: to - from + 1 }, (_, n) => from + n);
    blocks.push(...values);
    return values;
  }, contract, [recipient(1)], 10, 19, topic);
  assert.deepEqual(result, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.deepEqual(blocks, result);
});

test("single-block rejection and partial scans fail closed, never return partial evidence", async () => {
  let calls = 0;
  await assert.rejects(queryEvmLogs(async filter => {
    calls++;
    const from = Number(BigInt(filter.fromBlock as string));
    const to = Number(BigInt(filter.toBlock as string));
    if (from === 10 && to === 10) return ["first"];
    throw rejected(-32005, "limit exceeded");
  }, contract, [recipient(1)], 10, 11, topic), BlockchainMonitorError);
  assert.equal(calls, 3);
});

for (const error of [
  rejected(429, "Monthly capacity exceeded"),
  rejected(429, "rate limited"),
  new BlockchainMonitorError("NETWORK", "Network failed"),
  new BlockchainMonitorError("TIMEOUT", "Timed out"),
  new BlockchainMonitorError("PROVIDER", "Forbidden", { httpStatus: 403, reason: "forbidden" }),
  new BlockchainMonitorError("PROVIDER", "Forbidden", { httpStatus: 403, rpcCode: -32602, reason: "forbidden" }),
  rejected(-32005, "compute units per second rate limit exceeded"),
]) test(`fallback does not amplify ${error.providerFailure?.reason ?? error.code} failures`, async () => {
  let calls = 0;
  await assert.rejects(queryEvmLogs(async () => { calls++; throw error; },
    contract, [recipient(1), recipient(2)], 10, 19, topic), e => e === error);
  assert.equal(calls, 1);
});

test("query budget prevents unbounded fallback work", async () => {
  let calls = 0;
  await assert.rejects(queryEvmLogs(async () => {
    calls++;
    throw rejected(-32005, "block range limit exceeded");
  }, contract, [recipient(1)], 0, 10000, topic, { remaining: 3 }),
  (error: unknown) => error instanceof BlockchainMonitorError && error.code === "RANGE");
  assert.equal(calls, 3);
});

test("invalid log responses fail closed instead of becoming an empty scan", async () => {
  await assert.rejects(queryEvmLogs(async () => null as unknown as string[],
    contract, [recipient(1)], 10, 10, topic),
  (error: unknown) => error instanceof BlockchainMonitorError && error.code === "INVALID_RESPONSE");
});

for (const singleRecipient of [true, false]) test(`scan deduplicates receipt/block reads (${singleRecipient ? "one watch" : "combined watches"}), retains exact amounts, and never caches confirmation evidence`, async t => {
  const calls: Record<string, number> = {};
  let canonicalHash = "0xblock";
  const logs = [1, 2].map(n => ({
    address: contract, transactionHash: "0xtx", blockHash: "0xblock", blockNumber: "0x10",
    logIndex: `0x${n}`, topics: [topic, recipient(3), recipient(singleRecipient ? 1 : n)], data: "0x123456789abcdef",
  }));
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const { method, params } = JSON.parse(body);
      calls[method] = (calls[method] ?? 0) + 1;
      let result: unknown = null;
      if (method === "eth_getLogs") {
        assert.deepEqual(params[0].topics[2], singleRecipient ? recipient(1) : [recipient(1), recipient(2)]);
        result = [...logs, { ...logs[0], removed: true }, { ...logs[0], blockNumber: "0x20" }];
      }
      if (method === "eth_getTransactionReceipt") result = {
        status: "0x1", blockNumber: "0x10", blockHash: canonicalHash, logs,
      };
      if (method === "eth_getBlockByNumber") result = {
        hash: canonicalHash, number: "0x10", timestamp: "0x1", transactions: ["0xtx"],
      };
      if (method === "eth_getBlockByNumber") assert.equal(params[1], false, "hash-only blocks retain canonical membership without full transaction payloads");
      if (method === "eth_blockNumber") result = "0x15";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const adapter = new EvmJsonRpcAdapter({
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    networkCode: "ERC20", provider: "rpc", chainId: "0x1",
  });
  const watches = (singleRecipient ? [1] : [1, 2]).map(n => ({
    address: address(n), assets: [{
      assetId: "usdt", symbol: "USDT", kind: "token" as const, decimals: 6, contractOrMint: contract,
    }],
  }));
  const scan = await adapter.scanIncoming({ from: "16", to: "16" }, watches);
  assert.equal(scan.evidence.length, 2);
  assert.equal(scan.evidence[0]!.rawAmount, BigInt("0x123456789abcdef").toString());
  assert.deepEqual(calls, { eth_getLogs: 1, eth_getTransactionReceipt: 1, eth_getBlockByNumber: 1 });
  assert.equal((await adapter.getEvidenceStatus(scan.evidence[0]!)).canonical, true);
  canonicalHash = "0xreorg";
  assert.equal((await adapter.getEvidenceStatus(scan.evidence[0]!)).canonical, false);
  assert.equal(calls.eth_getTransactionReceipt, 3);
  assert.equal(calls.eth_getBlockByNumber, 3);
});

test("readiness stops after chain identity rejection before any head or scan request", async t => {
  const methods: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      methods.push(JSON.parse(body).method);
      res.end(JSON.stringify({ result: "0x38" }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const adapter = new EvmJsonRpcAdapter({
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    networkCode: "ERC20", provider: "rpc", chainId: "0x1",
  });
  await assert.rejects(adapter.testConnection(), BlockchainMonitorError);
  assert.deepEqual(methods, ["eth_chainId"]);
});
