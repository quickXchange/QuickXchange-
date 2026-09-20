import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { EvmJsonRpcAdapter, normalizeEvmAddress, parseEvmNativeTransfer, parseEvmTransferLog } from "../src/lib/blockchain-monitoring/evm";
import { normalizeTronAddress, parseTronNativeTransfer, parseTronTokenTransfer } from "../src/lib/blockchain-monitoring/tron";
import { normalizeSolanaAddress, parseSolanaTransaction } from "../src/lib/blockchain-monitoring/solana";

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

test("TRON parsing normalizes Base58 and hex addresses without exposing provider details", () => {
  // T-address is the documented TronGrid representation; 41-prefixed hex is
  // the documented full-node representation of the same address.
  const tronSystemAddress = `41${"00".repeat(20)}`;
  assert.equal(normalizeTronAddress("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"), tronSystemAddress);
  assert.equal(normalizeTronAddress(tronSystemAddress.toUpperCase()), tronSystemAddress);
  const watched = { address: tronSystemAddress, assets: [] };
  const native = parseTronNativeTransfer({
    txID: "tx-native", block: 12,
    raw_data: { contract: [{ type: "TransferContract", parameter: { value: { owner_address: "4100000000000000000000000000000000000001", to_address: watched.address, amount: 123 } } }] },
    ret: [{ contractRet: "SUCCESS" }],
  }, "TRC20", watched, { assetId: "trx", symbol: "TRX", kind: "native", decimals: 6 });
  assert.equal(native?.rawAmount, "123");
  const token = parseTronTokenTransfer({
    transaction_id: "tx-token", block: 13, from: watched.address, to: watched.address, value: "999",
    token_info: { address: watched.address, symbol: "USDT", decimals: 6 },
    ret: [{ contractRet: "SUCCESS" }],
  }, "TRC20", watched, { assetId: "usdt", symbol: "USDT", kind: "token", contractOrMint: watched.address, decimals: 6 });
  assert.equal(token?.rawAmount, "999");
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