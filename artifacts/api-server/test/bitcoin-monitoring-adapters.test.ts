import assert from "node:assert/strict";
import test from "node:test";
import { BitcoinUtxoAdapter, bitcoinBtcToSatoshis, decodeBitcoinMainnetAddress } from "../src/lib/blockchain-monitoring/bitcoin";

const asset = { assetId: "btc-bitcoin", symbol: "BTC", kind: "native" as const, decimals: 8 };

test("Bitcoin Mainnet address decoding derives exact scripts and rejects other networks/checksums", () => {
  assert.equal(decodeBitcoinMainnetAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")?.scriptPubKey, "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac");
  assert.equal(decodeBitcoinMainnetAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")?.scriptPubKey, "a914b472a266d0bd89c13706a4132ccfb16f7c3b9fcb87");
  assert.equal(decodeBitcoinMainnetAddress("bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9e75rs")?.scriptPubKey, "00140000000000000000000000000000000000000000");
  assert.equal(decodeBitcoinMainnetAddress("bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqthqst8")?.scriptPubKey, `0020${"00".repeat(32)}`);
  assert.equal(decodeBitcoinMainnetAddress("bc1pzyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs64v5e4")?.scriptPubKey, `5120${"11".repeat(32)}`);
  assert.equal(decodeBitcoinMainnetAddress("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn"), undefined);
  assert.equal(decodeBitcoinMainnetAddress("tb1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9e75rs"), undefined);
  assert.equal(decodeBitcoinMainnetAddress("1A1zP1e5QGefi2DMPTfTL5SLmv7DivfNa"), undefined);
  assert.equal(decodeBitcoinMainnetAddress("bC1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9e75rs"), undefined);
});

test("Bitcoin amounts remain exact integer satoshis and reject excess precision", () => {
  assert.equal(bitcoinBtcToSatoshis(0.00000546), "546");
  assert.equal(bitcoinBtcToSatoshis(9_007_199.25474093), "900719925474093");
  assert.equal(bitcoinBtcToSatoshis("21000000.00000000"), "2100000000000000");
  assert.equal(bitcoinBtcToSatoshis("0.000000001"), undefined);
  assert.equal(bitcoinBtcToSatoshis("21000000.00000001"), undefined);
});

test("Bitcoin scans match every output and remain duplicate-safe", async () => {
  const requests: string[] = [];
  const server = await import("node:http").then(({ createServer }) => createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body) as { method: string; params: unknown[] };
      requests.push(request.method);
      const result = request.method === "getblockhash" ? "block-10"
        : request.method === "getblock" ? {
          hash: "block-10", height: 10, confirmations: 5, time: 1_700_000_000,
          tx: [{ txid: "tx-1", vout: [
            { n: 0, value: 0.00000546, scriptPubKey: { hex: "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac" } },
            { n: 1, value: 1.23456789, scriptPubKey: { hex: "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac" } },
            { n: 2, value: 0, scriptPubKey: { hex: "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac" } },
          ] }],
        } : request.method === "getblockchaininfo" ? { chain: "main", blocks: 10, bestblockhash: "block-10" }
          : request.method === "getblockcount" ? 10 : request.method === "getrawtransaction" ? null : null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new BitcoinUtxoAdapter({ networkCode: "BTC", provider: "rpc", adapterKind: "bitcoin", endpoint: `http://127.0.0.1:${address.port}`, maxRange: 1, confirmationsRequired: 3 });
    const watched = [{ address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", assets: [asset] }];
    const result = await adapter.scanIncoming({ from: "10", to: "10" }, watched);
    assert.deepEqual(result.evidence.map((item) => [item.eventId, item.rawAmount]), [["tx-1:0:btc-bitcoin", "546"], ["tx-1:1:btc-bitcoin", "123456789"]]);
    assert.deepEqual((await adapter.scanIncoming({ from: "10", to: "10" }, watched)).evidence.map((item) => item.eventId), ["tx-1:0:btc-bitcoin", "tx-1:1:btc-bitcoin"]);
    assert(requests.every((method) => method === "getblockhash" || method === "getblock"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Bitcoin scans fail instead of advancing past a block that changed in flight", async () => {
  const server = await import("node:http").then(({ createServer }) => createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body) as { method: string };
      const result = request.method === "getblockhash"
        ? "a".repeat(64)
        : { hash: "b".repeat(64), height: 10, confirmations: 1, tx: [] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new BitcoinUtxoAdapter({
      networkCode: "BTC",
      provider: "rpc",
      adapterKind: "bitcoin",
      endpoint: `http://127.0.0.1:${address.port}`,
    });
    await assert.rejects(
      adapter.scanIncoming({ from: "10", to: "10" }, [{
        address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        assets: [asset],
      }]),
      /Bitcoin block changed during the scan/,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Bitcoin confirmation refresh verifies membership and fails closed on a replacement block", async () => {
  let canonicalHash = "a".repeat(64);
  let confirmations = 5;
  const txid = "b".repeat(64);
  const script = "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac";
  const server = await import("node:http").then(({ createServer }) => createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body) as { method: string };
      const result = request.method === "getblockhash"
        ? canonicalHash
        : request.method === "getblock"
          ? {
              hash: canonicalHash,
              height: 10,
              confirmations,
              time: 1_700_000_000,
              tx: [{ txid, vout: [{ n: 2, value: 0.5, scriptPubKey: { hex: script } }] }],
            }
          : request.method === "getrawtransaction"
            ? { txid, blockhash: canonicalHash, confirmations, in_active_chain: true }
            : null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new BitcoinUtxoAdapter({
      networkCode: "BTC",
      provider: "rpc",
      adapterKind: "bitcoin",
      endpoint: `http://127.0.0.1:${address.port}`,
      confirmationsRequired: 6,
    });
    const evidence = {
      eventId: `${txid}:2:btc-bitcoin`,
      transactionHash: txid,
      networkCode: "BTC",
      assetId: "btc-bitcoin",
      assetSymbol: "BTC",
      identityKind: "native" as const,
      toAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      rawAmount: "50000000",
      decimals: 8,
      blockOrSlot: "10",
      blockHash: canonicalHash,
      confirmations: "5",
      detectedAt: new Date().toISOString(),
      source: "bitcoin-json-rpc" as const,
    };
    const confirming = await adapter.getEvidenceStatus(evidence);
    assert.deepEqual(
      { exists: confirming.exists, canonical: confirming.canonical, confirmations: confirming.confirmations, finalized: confirming.finalized },
      { exists: true, canonical: true, confirmations: 5, finalized: false },
    );
    confirmations = 6;
    const finalized = await adapter.getEvidenceStatus(evidence);
    assert.equal(finalized.confirmations, 6);
    assert.equal(finalized.finalized, true);
    canonicalHash = "c".repeat(64);
    const reorganized = await adapter.getEvidenceStatus(evidence);
    assert.deepEqual(
      { exists: reorganized.exists, canonical: reorganized.canonical, confirmations: reorganized.confirmations, finalized: reorganized.finalized },
      { exists: false, canonical: false, confirmations: 0, finalized: false },
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});