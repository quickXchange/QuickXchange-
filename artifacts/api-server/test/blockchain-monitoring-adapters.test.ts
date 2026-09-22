import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { EvmJsonRpcAdapter, normalizeEvmAddress, parseEvmNativeTransfer, parseEvmTransferLog } from "../src/lib/blockchain-monitoring/evm";
import {
  normalizeTronAddress,
  parseTronNativeTransfer,
  parseTronTokenTransfer,
  serializeTronIndexerAddress,
  TronIndexerAdapter,
} from "../src/lib/blockchain-monitoring/tron";
import { normalizeSolanaAddress, parseSolanaTransaction } from "../src/lib/blockchain-monitoring/solana";
import { BlockchainMonitorError } from "../src/lib/blockchain-monitoring/errors";
import { createBlockchainMonitorAdapter } from "../src/lib/blockchain-monitoring";

// Shapes below follow the public Ethereum JSON-RPC eth_getBlockByNumber /
// eth_getLogs documentation and the public TronGrid v1 transaction response
// schemas. They exercise parsing only; no transaction detection is simulated.
test("EVM parsing keeps exact raw amounts and filters the configured token contract", () => {
  const watched = { address: "0x1111111111111111111111111111111111111111", assets: [] };
  const asset = { assetId: "usdt-bep20", symbol: "USDT", kind: "token" as const, contractOrMint: "0x2222222222222222222222222222222222222222", decimals: 6 };
  const log = {
    address: asset.contractOrMint, transactionHash: "0xabc", blockNumber: "0x10", logIndex: "0x0",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      `0x${"33".repeat(32)}`, `0x${"11".repeat(20).padStart(64, "0")}`,
    ],
    data: "0x0de0b6b3a7640000",
  };
  const parsed = parseEvmTransferLog(log, "BEP20", watched, asset);
  assert.equal(parsed?.rawAmount, "1000000000000000000");
  assert.equal(parsed?.contractOrMint, asset.contractOrMint);
  assert.equal(parseEvmTransferLog({ ...log, address: "0x3333333333333333333333333333333333333333" }, "BEP20", watched, asset), undefined);
  assert.equal(parseEvmNativeTransfer({ hash: "0xnative", from: "0x3333333333333333333333333333333333333333", to: watched.address, value: "0x2a", blockNumber: "0x10" }, "BEP20", watched, { assetId: "bnb", symbol: "BNB", kind: "native", decimals: 18 })?.rawAmount, "42");
  assert.equal(normalizeEvmAddress("0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD"), "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
});

test("adapter selection rejects missing chain kinds and selects Bitcoin explicitly", () => {
  const config = {
    networkCode: "UNKNOWN",
    provider: "rpc" as const,
    endpoint: "https://example.invalid",
  };
  assert.throws(
    () => createBlockchainMonitorAdapter(config),
    (error: unknown) => error instanceof BlockchainMonitorError && error.code === "CONFIGURATION",
  );
  assert.equal(
    createBlockchainMonitorAdapter({ ...config, adapterKind: "bitcoin" }).constructor.name,
    "BitcoinUtxoAdapter",
  );
});

test("EVM native scans request receipts only for watched-address candidates", async () => {
  const methods: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body) as { id: number; method: string };
      methods.push(request.method);
      const result = request.method === "eth_getBlockByNumber"
        ? {
            number: "0x10",
            hash: "0xblock",
            timestamp: "0x1",
            transactions: [{
              hash: "0xunrelated",
              from: "0x3333333333333333333333333333333333333333",
              to: "0x4444444444444444444444444444444444444444",
              value: "0x2a",
              blockNumber: "0x10",
              blockHash: "0xblock",
            }],
          }
        : null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new EvmJsonRpcAdapter({
      networkCode: "BEP20",
      provider: "rpc",
      adapterKind: "evm",
      endpoint: `http://127.0.0.1:${address.port}`,
    });
    const result = await adapter.scanIncoming({ from: "16", to: "16" }, [{
      address: "0x1111111111111111111111111111111111111111",
      assets: [{ assetId: "bnb-bep20", symbol: "BNB", kind: "native", decimals: 18 }],
    }]);
    assert.deepEqual(result.evidence, []);
    assert.deepEqual(methods, ["eth_getBlockByNumber"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("EVM native scans read bounded block batches concurrently and preserve exact evidence checks", async () => {
  let inFlightBlocks = 0;
  let maxInFlightBlocks = 0;
  const blockAttempts = new Map<number, number>();
  const watchedAddress = "0x1111111111111111111111111111111111111111";
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body) as { id: number; method: string; params: unknown[] };
      if (request.method === "eth_getBlockByNumber") {
        inFlightBlocks += 1;
        maxInFlightBlocks = Math.max(maxInFlightBlocks, inFlightBlocks);
        const blockHex = String(request.params[0]);
        const blockNumber = Number(BigInt(blockHex));
        const attempt = (blockAttempts.get(blockNumber) ?? 0) + 1;
        blockAttempts.set(blockNumber, attempt);
        setTimeout(() => {
          inFlightBlocks -= 1;
          if (res.destroyed) return;
          const matching = blockNumber === 20 || blockNumber === 21;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              number: blockHex,
              hash: `0xblock${blockNumber}`,
              timestamp: "0x1",
              transactions: matching ? [{
                hash: blockNumber === 20 ? "0xmatching" : "0xmismatched-receipt",
                from: "0x3333333333333333333333333333333333333333",
                to: watchedAddress,
                value: "0x1bc16d674ec80000",
                blockNumber: blockNumber === 20 ? blockHex : "0x16",
                blockHash: `0xblock${blockNumber}`,
              }] : [],
            },
          }));
        }, blockNumber === 20 && attempt === 1 ? 125 : 10);
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      const transactionHash = String(request.params[0] ?? "");
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: request.method === "eth_getTransactionReceipt"
          ? {
              status: "0x1",
              blockNumber: transactionHash === "0xmatching" ? "0x14" : "0x16",
              blockHash: transactionHash === "0xmatching" ? "0xblock20" : "0xblock21",
            }
          : null,
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new EvmJsonRpcAdapter({
      networkCode: "BEP20",
      provider: "rpc",
      adapterKind: "evm",
      endpoint: `http://127.0.0.1:${address.port}`,
      requestTimeoutMs: 100,
    });
    const result = await adapter.scanIncoming({ from: "16", to: "23" }, [{
      address: watchedAddress,
      assets: [{ assetId: "bnb-bep20", symbol: "BNB", kind: "native", decimals: 18 }],
    }]);
    assert(maxInFlightBlocks > 1);
    assert(maxInFlightBlocks <= 4);
    assert.equal(blockAttempts.get(20), 2);
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0]?.transactionHash, "0xmatching");
    assert.equal(result.evidence[0]?.rawAmount, "2000000000000000000");
    assert.equal(result.evidence[0]?.toAddress, watchedAddress);
    await assert.rejects(
      adapter.scanIncoming({ from: "16", to: "24" }, [{
        address: watchedAddress,
        assets: [{ assetId: "bnb-bep20", symbol: "BNB", kind: "native", decimals: 18 }],
      }]),
      (error: unknown) =>
        error instanceof BlockchainMonitorError &&
        error.code === "RANGE",
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("EVM native retry cooldown does not overrun the shared cycle deadline", async () => {
  let requests = 0;
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      requests += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "transient provider failure" },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const startedAt = Date.now();
    const adapter = new EvmJsonRpcAdapter({
      networkCode: "BEP20",
      provider: "rpc",
      adapterKind: "evm",
      endpoint: `http://127.0.0.1:${address.port}`,
      requestTimeoutMs: 1_000,
      deadlineAtMs: startedAt + 100,
    });
    await assert.rejects(
      adapter.scanIncoming({ from: "16", to: "16" }, [{
        address: "0x1111111111111111111111111111111111111111",
        assets: [{ assetId: "bnb-bep20", symbol: "BNB", kind: "native", decimals: 18 }],
      }]),
      (error: unknown) =>
        error instanceof BlockchainMonitorError &&
        error.code === "PROVIDER",
    );
    assert.equal(requests, 1);
    assert(Date.now() - startedAt < 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("EVM token scans query one exact bounded range instead of one request per block", async () => {
  const logRequests: unknown[][] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body) as { id: number; method: string; params: unknown[] };
      if (request.method === "eth_getLogs") logRequests.push(request.params);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: [] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new EvmJsonRpcAdapter({
      networkCode: "BEP20",
      provider: "rpc",
      adapterKind: "evm",
      endpoint: `http://127.0.0.1:${address.port}`,
    });
    await adapter.scanIncoming({ from: "16", to: "1016" }, [{
      address: "0x1111111111111111111111111111111111111111",
      assets: [{
        assetId: "usdt-bep20",
        symbol: "USDT",
        kind: "token",
        contractOrMint: "0x2222222222222222222222222222222222222222",
        decimals: 18,
      }],
    }]);
    assert.deepEqual(logRequests, [[{
      fromBlock: "0x10",
      toBlock: "0x3f8",
      address: "0x2222222222222222222222222222222222222222",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        null,
        `0x${"11".repeat(20).padStart(64, "0")}`,
      ],
    }]]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("EVM health checks prove required RPC methods with bounded payloads", async () => {
  const requests: Array<{ method: string; params: unknown[] }> = [];
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body) as { id: number; method: string; params: unknown[] };
      requests.push({ method: request.method, params: request.params });
      const result = request.method === "eth_chainId"
        ? "0x38"
        : request.method === "eth_blockNumber"
          ? "0x10"
          : request.method === "eth_getBlockByNumber"
            ? { number: "0x10", hash: "0xblock", timestamp: "0x1", transactions: ["0xtx"] }
            : request.method === "eth_getLogs"
              ? []
              : request.method === "eth_getTransactionReceipt"
                ? { status: "0x1" }
                : null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new EvmJsonRpcAdapter({
      networkCode: "BEP20",
      provider: "rpc",
      adapterKind: "evm",
      endpoint: `http://127.0.0.1:${address.port}`,
      chainId: "0x38",
    });
    const result = await adapter.testConnection();
    assert.equal(result.connected, true);
    assert.deepEqual(
      requests.find((request) => request.method === "eth_getBlockByNumber")?.params,
      ["0x10", false],
    );
    assert.deepEqual(
      requests.find((request) => request.method === "eth_getLogs")?.params,
      [{
        fromBlock: "0x10",
        toBlock: "0x10",
        address: "0x0000000000000000000000000000000000000001",
        topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
      }],
    );
    assert(requests.some((request) => request.method === "eth_getTransactionReceipt"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("EVM RPC requests abort a hanging provider within the strict request timeout", async () => {
  let closedRequests = 0;
  const server = createServer((req) => {
    req.on("close", () => { closedRequests += 1; });
    req.resume();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new EvmJsonRpcAdapter({
      networkCode: "BEP20",
      provider: "rpc",
      adapterKind: "evm",
      endpoint: `http://127.0.0.1:${address.port}`,
      chainId: "0x38",
      requestTimeoutMs: 50,
    });
    const startedAt = Date.now();
    await assert.rejects(
      adapter.testConnection(),
      (error: unknown) => {
        assert(error instanceof BlockchainMonitorError);
        assert.equal(error.code, "TIMEOUT");
        assert.match(error.message, /^Blockchain RPC eth_(chainId|blockNumber) timed out\.$/);
        return true;
      },
    );
    assert(Date.now() - startedAt < 500);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert(closedRequests >= 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("EVM validation shares one total deadline across sequential RPC operations", async () => {
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body) as { id: number; method: string };
      if (request.method === "eth_getBlockByNumber") return;
      const result = request.method === "eth_chainId" ? "0x38" : "0x10";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const startedAt = Date.now();
    const adapter = new EvmJsonRpcAdapter({
      networkCode: "BEP20",
      provider: "rpc",
      adapterKind: "evm",
      endpoint: `http://127.0.0.1:${address.port}`,
      chainId: "0x38",
      requestTimeoutMs: 1_000,
      deadlineAtMs: startedAt + 80,
    });
    await assert.rejects(
      adapter.testConnection(),
      (error: unknown) => {
        assert(error instanceof BlockchainMonitorError);
        assert.equal(error.code, "TIMEOUT");
        assert.equal(error.message, "Blockchain RPC eth_getBlockByNumber timed out.");
        return true;
      },
    );
    assert(Date.now() - startedAt < 500);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("TRON parsing normalizes Base58 and hex addresses without exposing provider details", () => {
  // T-address is the documented TronGrid representation; 41-prefixed hex is
  // the documented full-node representation of the same address.
  const tronSystemAddress = `41${"00".repeat(20)}`;
  assert.equal(normalizeTronAddress("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"), tronSystemAddress);
  assert.equal(normalizeTronAddress(tronSystemAddress.toUpperCase()), tronSystemAddress);
  assert.equal(serializeTronIndexerAddress(tronSystemAddress), "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
  const watched = { address: tronSystemAddress, assets: [] };
  const native = parseTronNativeTransfer({
    txID: "tx-native", block: 12,
    raw_data: { contract: [{ type: "TransferContract", parameter: { value: { owner_address: "4100000000000000000000000000000000000001", to_address: watched.address, amount: 123 } } }] },
    ret: [{ contractRet: "SUCCESS" }],
  }, "TRC20", watched, { assetId: "trx", symbol: "TRX", kind: "native", decimals: 6 });
  assert.equal(native?.rawAmount, "123");
  assert.equal(native?.eventId, "tx-native:native:0:trx");
  const token = parseTronTokenTransfer({
    transaction_id: "tx-token", block: 13, from: watched.address, to: watched.address, value: "999",
    eventIndex: 0,
    token_info: { address: watched.address, symbol: "USDT", decimals: 6 },
    ret: [{ contractRet: "SUCCESS" }],
  }, "TRC20", watched, { assetId: "usdt", symbol: "USDT", kind: "token", contractOrMint: watched.address, decimals: 6 });
  assert.equal(token?.rawAmount, "999");
});

test("TRON native scans use provider block numbers and revalidate raw transaction success", async () => {
  const watchedHex = `41${"00".repeat(20)}`;
  const watchedBase58 = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
  let includeCanonicalTransaction = true;
  let transactionInfoId = "tx-native";
  let rawTransactionId = "tx-native";
  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    res.writeHead(200, { "content-type": "application/json" });
    if (requestUrl.pathname === "/wallet/getblockbynum") {
      const number = Number(requestUrl.searchParams.get("num"));
      res.end(JSON.stringify({
        blockID: `block-${number}`,
        block_header: { raw_data: { number, timestamp: number * 3_000 } },
        transactions: includeCanonicalTransaction && number === 101 ? [{ txID: "tx-native" }] : [],
      }));
      return;
    }
    if (requestUrl.pathname === "/wallet/gettransactioninfobyid") {
      res.end(JSON.stringify({
        id: transactionInfoId,
        blockNumber: 101,
        blockTimeStamp: 303_000,
        receipt: {},
      }));
      return;
    }
    if (requestUrl.pathname === "/wallet/gettransactionbyid") {
      res.end(JSON.stringify({
        txID: rawTransactionId,
        ret: [{ contractRet: "SUCCESS" }],
        raw_data: {
          contract: [{
            type: "TransferContract",
            parameter: {
              value: {
                owner_address: watchedBase58,
                to_address: watchedBase58,
                amount: 1_000_000,
              },
            },
          }],
        },
      }));
      return;
    }
    if (requestUrl.pathname === "/wallet/getnowblock") {
      res.end(JSON.stringify({ block_header: { raw_data: { number: 120 } } }));
      return;
    }
    res.end(JSON.stringify({
      data: [{
        txID: "tx-native",
        blockNumber: 101,
        block_timestamp: 303_000,
        ret: [{ contractRet: "SUCCESS" }],
        raw_data: {
          contract: [{
            type: "TransferContract",
            parameter: {
              value: {
                owner_address: watchedBase58,
                to_address: watchedBase58,
                amount: 1_000_000,
              },
            },
          }],
        },
      }],
      success: true,
      meta: {},
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new TronIndexerAdapter({
      networkCode: "TRC20",
      adapterKind: "tron",
      provider: "indexer",
      endpoint: `http://127.0.0.1:${address.port}`,
      maxRange: 10,
    });
    const result = await adapter.scanIncoming({ from: "100", to: "105" }, [{
      address: watchedHex,
      assets: [{
        assetId: "trx-tron",
        symbol: "TRX",
        kind: "native",
        decimals: 6,
      }],
    }]);
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0]?.rawAmount, "1000000");
    assert.equal(result.evidence[0]?.toAddress, watchedHex);
    assert.equal(result.evidence[0]?.eventId, "tx-native:native:0:trx-tron");
    assert.deepEqual(await adapter.getEvidenceStatus(result.evidence[0]!), {
      exists: true,
      successful: true,
      canonical: true,
      confirmations: 20,
      finalized: false,
      blockHash: "block-101",
      blockTimestamp: new Date(303_000).toISOString(),
    });
    rawTransactionId = "different-transaction";
    assert.deepEqual(await adapter.getEvidenceStatus(result.evidence[0]!), {
      exists: false,
      successful: false,
      canonical: false,
      confirmations: 0,
      finalized: false,
      blockHash: "block-101",
      blockTimestamp: new Date(303_000).toISOString(),
    });
    rawTransactionId = "tx-native";
    transactionInfoId = "different-transaction";
    assert.deepEqual(await adapter.getEvidenceStatus(result.evidence[0]!), {
      exists: false,
      successful: false,
      canonical: false,
      confirmations: 0,
      finalized: false,
      blockHash: "block-101",
      blockTimestamp: new Date(303_000).toISOString(),
    });
    transactionInfoId = "tx-native";
    includeCanonicalTransaction = false;
    const nonCanonical = await adapter.scanIncoming({ from: "100", to: "105" }, [{
      address: watchedHex,
      assets: [{
        assetId: "trx-tron",
        symbol: "TRX",
        kind: "native",
        decimals: 6,
      }],
    }]);
    assert.equal(nonCanonical.evidence.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("TRON token scans serialize contracts for the indexer and paginate exact confirmed receipts", async () => {
  const watchedAddress = `41${"00".repeat(20)}`;
  const watchedIndexerAddress = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
  const contractHex = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
  const contractBase58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const requests: URL[] = [];
  const tokenLog = {
    address: contractHex.slice(2),
    topics: [
      "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0".repeat(64),
      "0".repeat(64),
    ],
    data: "f4240".padStart(64, "0"),
  };
  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push(requestUrl);
    res.writeHead(200, { "content-type": "application/json" });
    if (requestUrl.pathname === "/wallet/getblockbynum") {
      const number = Number(requestUrl.searchParams.get("num"));
      res.end(JSON.stringify({
        blockID: `block-${number}`,
        block_header: { raw_data: { number, timestamp: number * 3_000 } },
        transactions: number === 101
          ? [{ txID: "tx-success" }]
          : number === 102
            ? [{ txID: "tx-wrong-decimals" }, { txID: "tx-failed" }]
            : [],
      }));
      return;
    }
    if (requestUrl.pathname === "/wallet/gettransactioninfobyid") {
      const transactionId = requestUrl.searchParams.get("value");
      res.end(JSON.stringify({
        id: transactionId,
        blockNumber: transactionId === "tx-success" ? 101 : 102,
        blockTimeStamp: transactionId === "tx-success" ? 303_000 : 306_000,
        receipt: { result: transactionId === "tx-success" ? "SUCCESS" : "FAILED" },
        log: transactionId === "tx-success" ? [tokenLog, tokenLog] : [tokenLog],
      }));
      return;
    }
    if (requestUrl.pathname === "/wallet/getnowblock") {
      res.end(JSON.stringify({ block_header: { raw_data: { number: 120 } } }));
      return;
    }
    const fingerprint = requestUrl.searchParams.get("fingerprint");
    const records = fingerprint
      ? [{
          transaction_id: "tx-failed",
          token_info: { address: contractBase58, symbol: "USDT", decimals: 6 },
          block_timestamp: 306_000,
          from: watchedIndexerAddress,
          to: watchedIndexerAddress,
          value: "2000000",
        }]
      : [{
          transaction_id: "tx-success",
          token_info: { address: contractBase58, symbol: "USDT", decimals: 7 },
          block_timestamp: 303_000,
          from: watchedIndexerAddress,
          to: watchedIndexerAddress,
          value: "1000000",
        }, {
          transaction_id: "tx-success",
          token_info: { address: contractBase58, symbol: "USDT", decimals: 6 },
          block_timestamp: 303_000,
          from: watchedIndexerAddress,
          to: watchedIndexerAddress,
          value: "1000000",
        }, {
          transaction_id: "tx-success",
          token_info: { address: contractBase58, symbol: "USDT", decimals: 6 },
          block_timestamp: 303_000,
          from: watchedIndexerAddress,
          to: watchedIndexerAddress,
          value: "1000000",
        }, {
          transaction_id: "tx-wrong-decimals",
          token_info: { address: contractBase58, symbol: "USDT", decimals: 7 },
          block_timestamp: 306_000,
          from: watchedIndexerAddress,
          to: watchedIndexerAddress,
          value: "1000000",
        }];
    res.end(JSON.stringify({
      data: records,
      success: true,
      meta: fingerprint ? {} : { fingerprint: "next-page" },
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new TronIndexerAdapter({
      networkCode: "TRC20",
      adapterKind: "tron",
      provider: "indexer",
      endpoint: `http://127.0.0.1:${address.port}`,
      maxRange: 10,
    });
    const result = await adapter.scanIncoming({ from: "100", to: "105" }, [{
      address: watchedAddress,
      assets: [{
        assetId: "usdt-trc20",
        symbol: "USDT",
        kind: "token",
        contractOrMint: contractHex,
        decimals: 6,
      }],
    }]);
    const pageRequests = requests.filter(request =>
      request.pathname.endsWith("/transactions/trc20"),
    );
    assert.equal(pageRequests.length, 2);
    assert.equal(pageRequests[0]?.pathname, `/v1/accounts/${watchedIndexerAddress}/transactions/trc20`);
    assert.equal(pageRequests[0]?.searchParams.get("contract_address"), contractBase58);
    assert.equal(pageRequests[0]?.searchParams.get("min_timestamp"), "300000");
    assert.equal(pageRequests[0]?.searchParams.get("max_timestamp"), "315000");
    assert.equal(pageRequests[0]?.searchParams.get("fingerprint"), null);
    assert.equal(pageRequests[1]?.searchParams.get("fingerprint"), "next-page");
    assert.equal(result.evidence.length, 2);
    assert.equal(result.evidence[0]?.transactionHash, "tx-success");
    assert.equal(result.evidence[1]?.transactionHash, "tx-success");
    assert.notEqual(result.evidence[0]?.eventId, result.evidence[1]?.eventId);
    assert.equal(result.evidence[0]?.toAddress, normalizeTronAddress(watchedAddress));
    assert.equal(result.evidence[0]?.rawAmount, "1000000");
    assert.equal(result.evidence[0]?.decimals, 6);
    assert.equal(result.evidence[0]?.blockOrSlot, "101");
    assert.equal(result.evidence[0]?.blockHash, "block-101");
    assert.equal(result.evidence[0]?.contractOrMint, contractHex);
    const status = await adapter.getEvidenceStatus(result.evidence[0]!);
    assert.deepEqual(status, {
      exists: true,
      successful: true,
      canonical: true,
      confirmations: 20,
      finalized: false,
      blockHash: "block-101",
      blockTimestamp: new Date(303_000).toISOString(),
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Solana parsing uses balance deltas and exact mint identity", () => {
  const watched = { address: "11111111111111111111111111111111", assets: [
    { assetId: "sol", symbol: "SOL", kind: "native" as const, decimals: 9 },
    { assetId: "usdc-solana", symbol: "USDC", kind: "token" as const, contractOrMint: "So11111111111111111111111111111111111111112", decimals: 6 },
  ] };
  assert.equal(normalizeSolanaAddress(watched.address), watched.address);
  const evidence = parseSolanaTransaction({
    slot: 22,
    transaction: { signatures: ["sig"], message: { accountKeys: [watched.address] } },
    meta: {
      preBalances: [100], postBalances: [142],
      preTokenBalances: [{ accountIndex: 0, owner: watched.address, mint: watched.assets[1].contractOrMint, uiTokenAmount: { amount: "4" } }],
      postTokenBalances: [{ accountIndex: 0, owner: watched.address, mint: watched.assets[1].contractOrMint, uiTokenAmount: { amount: "1004" } }],
    },
  }, "SPL", watched);
  assert.deepEqual(evidence.map(item => item.rawAmount), ["42", "1000"]);
});