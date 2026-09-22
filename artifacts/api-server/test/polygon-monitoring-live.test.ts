import assert from "node:assert/strict";
import test from "node:test";
import { EvmJsonRpcAdapter } from "../src/lib/blockchain-monitoring/evm";

const endpoint = process.env.POLYGON_MONITOR_RPC_URL;
const polygonTest = endpoint ? test : test.skip;

const USDC_CONTRACT = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
const USDT0_CONTRACT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const UNUSED_ADDRESS = "0x0000000000000000000000000000000000000001";

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  transactionHash?: string;
  blockNumber?: string;
  logIndex?: string;
};

type RpcTransaction = {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  blockNumber?: string;
};

type RpcBlock = {
  number?: string;
  transactions?: RpcTransaction[];
};

let rpcId = 0;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  assert(endpoint);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = await response.json() as {
    result?: T;
    error?: { code?: number; message?: string };
  };
  if (!response.ok || body.error || body.result === undefined) {
    throw new Error(
      `${method} failed: HTTP ${response.status}, RPC ${body.error?.code ?? "unknown"} ${body.error?.message ?? ""}`,
    );
  }
  return body.result;
}

function decodeContractString(encoded: string): string {
  const raw = encoded.startsWith("0x") ? encoded.slice(2) : encoded;
  if (raw.length === 64) {
    return Buffer.from(raw, "hex").toString("utf8").replace(/\0+$/, "");
  }
  const offset = Number(BigInt(`0x${raw.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${raw.slice(offset, offset + 64)}`));
  return Buffer.from(
    raw.slice(offset + 64, offset + 64 + length * 2),
    "hex",
  ).toString("utf8");
}

function adapter() {
  assert(endpoint);
  return new EvmJsonRpcAdapter({
    networkCode: "POLYGON",
    provider: "rpc",
    adapterKind: "evm",
    endpoint,
    chainId: "0x89",
    maxRange: 100,
    requestTimeoutMs: 15_000,
  });
}

async function recentTransferLog(contract: string, head: bigint): Promise<RpcLog> {
  const from = head > 100n ? head - 100n : 0n;
  const logs = await rpc<RpcLog[]>("eth_getLogs", [{
    fromBlock: `0x${from.toString(16)}`,
    toBlock: `0x${head.toString(16)}`,
    address: contract,
    topics: [TRANSFER_TOPIC],
  }]);
  const log = logs.find((candidate) =>
    candidate.address?.toLowerCase() === contract &&
    candidate.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
    candidate.topics.length >= 3 &&
    candidate.transactionHash &&
    candidate.blockNumber &&
    candidate.logIndex &&
    candidate.data &&
    BigInt(candidate.data) > 0n
  );
  assert(log, `No real Transfer log was available for ${contract} in the latest 100 blocks.`);
  return log;
}

function recipientFromLog(log: RpcLog): string {
  const recipientTopic = log.topics?.[2];
  assert(recipientTopic);
  return `0x${recipientTopic.slice(-40)}`.toLowerCase();
}

async function recentNativeTransfer(head: bigint) {
  for (let offset = 0n; offset < 8n && head >= offset; offset += 1n) {
    const blockNumber = head - offset;
    const block = await rpc<RpcBlock | null>(
      "eth_getBlockByNumber",
      [`0x${blockNumber.toString(16)}`, true],
    );
    for (const transaction of block?.transactions ?? []) {
      if (
        transaction.hash &&
        transaction.to &&
        transaction.blockNumber &&
        transaction.value &&
        BigInt(transaction.value) > 0n
      ) {
        const receipt = await rpc<{ status?: string } | null>(
          "eth_getTransactionReceipt",
          [transaction.hash],
        );
        if (receipt?.status === "0x1") return { blockNumber, transaction };
      }
    }
  }
  assert.fail("No successful native POL transfer was available in the latest eight blocks.");
}

polygonTest("Polygon USDT0 contract has the exact verified on-chain identity", async (context) => {
  assert.equal(await rpc<string>("eth_chainId", []), "0x89");
  const code = await rpc<string>("eth_getCode", [USDT0_CONTRACT, "latest"]);
  assert(code.length > 2, "USDT0 contract has no deployed bytecode.");
  const symbol = decodeContractString(await rpc<string>(
    "eth_call",
    [{ to: USDT0_CONTRACT, data: "0x95d89b41" }, "latest"],
  ));
  const decimals = Number(BigInt(await rpc<string>(
    "eth_call",
    [{ to: USDT0_CONTRACT, data: "0x313ce567" }, "latest"],
  )));
  assert.equal(symbol, "USDT0");
  assert.equal(decimals, 6);
  const head = BigInt(await rpc<string>("eth_blockNumber", []));
  const log = await recentTransferLog(USDT0_CONTRACT, head);
  context.diagnostic(JSON.stringify({
    chainId: "0x89",
    contract: USDT0_CONTRACT,
    codeBytes: (code.length - 2) / 2,
    symbol,
    decimals,
    sampledTransfer: {
      block: BigInt(log.blockNumber ?? "0x0").toString(),
      transactionHash: log.transactionHash,
      logIndex: BigInt(log.logIndex ?? "0x0").toString(),
      rawAmount: BigInt(log.data ?? "0x0").toString(),
    },
  }));
});

polygonTest("final Polygon adapter passes current bounded scans for POL, USDC, and USDT0", async (context) => {
  const polygon = adapter();
  const connection = await polygon.testConnection();
  assert.equal(connection.connected, true);
  assert.equal(connection.chainId, "0x89");
  const head = BigInt((await polygon.getHead()).cursor);
  const cursor = { from: head.toString(), to: head.toString() };

  const pol = await polygon.scanIncoming(cursor, [{
    address: UNUSED_ADDRESS,
    assets: [{ assetId: "pol-polygon", symbol: "POL", kind: "native", decimals: 18 }],
  }]);
  const usdc = await polygon.scanIncoming(cursor, [{
    address: UNUSED_ADDRESS,
    assets: [{
      assetId: "usdc-polygon",
      symbol: "USDC",
      kind: "token",
      contractOrMint: USDC_CONTRACT,
      decimals: 6,
    }],
  }]);
  const usdt0 = await polygon.scanIncoming(cursor, [{
    address: UNUSED_ADDRESS,
    assets: [{
      assetId: "usdt0-polygon",
      symbol: "USDT0",
      kind: "token",
      contractOrMint: USDT0_CONTRACT,
      decimals: 6,
    }],
  }]);

  assert.deepEqual(pol.cursor, cursor);
  assert.deepEqual(usdc.cursor, cursor);
  assert.deepEqual(usdt0.cursor, cursor);
  context.diagnostic(JSON.stringify({
    currentHead: head.toString(),
    paths: ["pol-polygon", "usdc-polygon", "usdt0-polygon"],
    boundedRange: cursor,
  }));
});

polygonTest("final Polygon adapter detects separate real historical POL, USDC, and USDT0 transfers", async (context) => {
  const polygon = adapter();
  const head = BigInt((await polygon.getHead()).cursor);
  const verifiedTransfers: Array<Record<string, string>> = [];

  const native = await recentNativeTransfer(head);
  assert(native.transaction.to);
  const pol = await polygon.scanIncoming(
    { from: native.blockNumber.toString(), to: native.blockNumber.toString() },
    [{
      address: native.transaction.to,
      assets: [{ assetId: "pol-polygon", symbol: "POL", kind: "native", decimals: 18 }],
    }],
  );
  const polEvidence = pol.evidence.find((item) =>
    item.transactionHash === native.transaction.hash &&
    item.assetId === "pol-polygon" &&
    item.identityKind === "native" &&
    item.rawAmount === BigInt(native.transaction.value ?? "0x0").toString()
  );
  assert(polEvidence, "The final adapter did not detect the selected real POL transfer.");
  verifiedTransfers.push({
    route: "pol-polygon",
    identity: "POL",
    block: polEvidence.blockOrSlot,
    transactionHash: polEvidence.transactionHash,
    eventId: polEvidence.eventId,
    rawAmount: polEvidence.rawAmount,
  });

  for (const token of [
    { assetId: "usdc-polygon", symbol: "USDC", contract: USDC_CONTRACT },
    { assetId: "usdt0-polygon", symbol: "USDT0", contract: USDT0_CONTRACT },
  ]) {
    const log = await recentTransferLog(token.contract, head);
    assert(log.blockNumber);
    const block = BigInt(log.blockNumber).toString();
    const result = await polygon.scanIncoming(
      { from: block, to: block },
      [{
        address: recipientFromLog(log),
        assets: [{
          assetId: token.assetId,
          symbol: token.symbol,
          kind: "token",
          contractOrMint: token.contract,
          decimals: 6,
        }],
      }],
    );
    const evidence = result.evidence.find((item) =>
      item.transactionHash === log.transactionHash &&
      item.eventId === `${log.transactionHash}:${log.logIndex}:${token.assetId}` &&
      item.assetId === token.assetId &&
      item.identityKind === "token" &&
      item.contractOrMint === token.contract &&
      item.rawAmount === BigInt(log.data ?? "0x0").toString()
    );
    assert(evidence, `The final adapter did not detect the selected real ${token.symbol} transfer.`);
    verifiedTransfers.push({
      route: token.assetId,
      identity: token.symbol,
      block: evidence.blockOrSlot,
      transactionHash: evidence.transactionHash,
      eventId: evidence.eventId,
      rawAmount: evidence.rawAmount,
    });
  }
  context.diagnostic(JSON.stringify({ verifiedTransfers }));
});