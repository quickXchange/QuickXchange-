import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  blockchainMonitorMatchesTable,
  blockchainMonitorObservationsTable,
  blockchainMonitorWatchesTable,
} from "@workspace/db";
import { getTableConfig } from "drizzle-orm/pg-core";
import { BitcoinUtxoAdapter } from "../src/lib/blockchain-monitoring/bitcoin";
import {
  exactWatchMatchesOrderSnapshot,
  incomingEvidenceMatchesWatch,
  isFinalitySatisfied,
} from "../src/lib/blockchain-monitoring/service";
import { signedCryptoRouteId } from "../src/lib/manual-crypto";

const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const script = "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac";
const txid = "b".repeat(64);
const assetId = "monitor-asset-btc";
const routeId = "btc-bitcoin";
const network = { id: "monitor-bitcoin", networkCode: "BTC", adapterKind: "bitcoin" };
const asset = { id: assetId };
const orderCreatedAt = new Date("2026-09-22T20:00:00.000Z");
const watch = {
  orderId: "isolated-btc-order",
  monitorNetworkId: network.id,
  monitorAssetId: asset.id,
  assetNetworkId: routeId,
  expectedAmount: "0.001",
  receivingAddress: address,
  memoOrTag: null,
  identityKind: "native",
  contractOrMint: null,
  decimals: 8,
  orderCreatedAt,
  startCursor: "10",
};
const exactEvidence = {
  eventId: `${txid}:0:${assetId}`,
  transactionHash: txid,
  networkCode: "BTC",
  assetId,
  assetSymbol: "BTC",
  identityKind: "native" as const,
  toAddress: address,
  rawAmount: "100000",
  decimals: 8,
  blockOrSlot: "10",
  blockHash: "a".repeat(64),
  blockTimestamp: "2026-09-22T20:01:00.000Z",
  confirmations: "1",
  detectedAt: "2026-09-22T20:01:01.000Z",
  source: "bitcoin-json-rpc" as const,
};

test("signed Bitcoin display labels resolve by btc-bitcoin route to canonical BTC", () => {
  const signedSource = {
    id: "crypto:btc-bitcoin",
    networkId: "btc-bitcoin",
    networkCode: "Bitcoin",
  };
  const catalog = new Map([[routeId, { networkCode: "BTC" }]]);
  const resolvedRouteId = signedCryptoRouteId(signedSource);
  assert.equal(resolvedRouteId, routeId);
  assert.equal(catalog.get(resolvedRouteId)?.networkCode, "BTC");
  assert.notEqual(signedSource.networkCode, catalog.get(resolvedRouteId)?.networkCode);

  const expected = { ...watch };
  assert.equal(exactWatchMatchesOrderSnapshot(watch, expected), true);
  assert.equal(exactWatchMatchesOrderSnapshot({ ...watch }, expected), true);
  assert.deepEqual(
    {
      assetNetworkId: watch.assetNetworkId,
      identityKind: watch.identityKind,
      contractOrMint: watch.contractOrMint,
      decimals: watch.decimals,
      amount: watch.expectedAmount,
      address: watch.receivingAddress,
    },
    {
      assetNetworkId: "btc-bitcoin",
      identityKind: "native",
      contractOrMint: null,
      decimals: 8,
      amount: "0.001",
      address,
    },
  );
});

test("native BTC evidence matches only the exact network, asset, address, and amount", () => {
  assert.equal(incomingEvidenceMatchesWatch(network, asset, watch, exactEvidence), true);
  assert.equal(
    incomingEvidenceMatchesWatch(network, asset, watch, { ...exactEvidence, toAddress: `${address}x` }),
    false,
  );
  assert.equal(
    incomingEvidenceMatchesWatch(network, asset, watch, { ...exactEvidence, assetId: "wrong-btc-asset" }),
    false,
  );
  assert.equal(
    incomingEvidenceMatchesWatch(network, asset, watch, { ...exactEvidence, networkCode: "BEP20" }),
    false,
  );
  assert.equal(
    incomingEvidenceMatchesWatch(network, asset, watch, { ...exactEvidence, rawAmount: "100001" }),
    false,
  );
});

test("watch, txid:vout deposit, and applied credit identities are database-unique", () => {
  const watchIndexes = getTableConfig(blockchainMonitorWatchesTable).indexes;
  const observationIndexes = getTableConfig(blockchainMonitorObservationsTable).indexes;
  const matchIndexes = getTableConfig(blockchainMonitorMatchesTable).indexes;
  assert.ok(watchIndexes.some((item) =>
    item.config.name === "blockchain_monitor_watches_order_uidx" && item.config.unique
  ));
  assert.ok(observationIndexes.some((item) =>
    item.config.name === "blockchain_monitor_observations_identity_uidx" && item.config.unique
  ));
  assert.ok(matchIndexes.some((item) =>
    item.config.name === "blockchain_monitor_matches_observation_watch_uidx" && item.config.unique
  ));
  assert.ok(matchIndexes.some((item) =>
    item.config.name === "blockchain_monitor_matches_applied_order_uidx" &&
    item.config.unique &&
    Boolean(item.config.where)
  ));
});

test("BTC rescans preserve one txid:vout identity and confirmation threshold", async () => {
  let confirmations = 1;
  let canonicalHash = "a".repeat(64);
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const rpc = JSON.parse(body) as { method: string };
      const result = rpc.method === "getblockchaininfo"
        ? { chain: "main", blocks: 10, bestblockhash: canonicalHash }
        : rpc.method === "getblockcount"
          ? 10
          : rpc.method === "getblockhash"
            ? canonicalHash
            : rpc.method === "getblock"
              ? {
                  hash: canonicalHash,
                  height: 10,
                  confirmations,
                  time: 1_790_110_860,
                  tx: [{ txid, vout: [{ n: 0, value: 0.001, scriptPubKey: { hex: script } }] }],
                }
              : rpc.method === "getrawtransaction"
                ? { txid, blockhash: canonicalHash, confirmations, in_active_chain: true }
                : null;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const listening = server.address();
    assert(listening && typeof listening === "object");
    const adapter = new BitcoinUtxoAdapter({
      networkCode: "BTC",
      provider: "rpc",
      adapterKind: "bitcoin",
      endpoint: `http://127.0.0.1:${listening.port}`,
      maxRange: 1,
      confirmationsRequired: 2,
    });
    const watched = [{
      address,
      assets: [{ assetId, symbol: "BTC", kind: "native" as const, decimals: 8 }],
    }];
    const first = await adapter.scanIncoming({ from: "10", to: "10" }, watched);
    const replay = await adapter.scanIncoming({ from: "10", to: "10" }, watched);
    assert.equal(first.evidence.length, 1);
    assert.deepEqual(
      replay.evidence.map(({ detectedAt: _detectedAt, ...item }) => item),
      first.evidence.map(({ detectedAt: _detectedAt, ...item }) => item),
    );
    assert.equal(new Set([...first.evidence, ...replay.evidence].map((item) =>
      `${item.transactionHash}:${item.eventId}`
    )).size, 1);
    assert.equal(first.evidence[0]?.eventId, `${txid}:0:${assetId}`);

    const observed = first.evidence[0]!;
    const confirming = await adapter.getEvidenceStatus(observed);
    assert.equal(confirming.canonical, true);
    assert.equal(confirming.finalized, false);
    assert.equal(isFinalitySatisfied("confirmations", confirming.confirmations, 2, confirming.finalized), false);

    confirmations = 2;
    const confirmed = await adapter.getEvidenceStatus(observed);
    assert.equal(confirmed.canonical, true);
    assert.equal(confirmed.finalized, true);
    assert.equal(isFinalitySatisfied("confirmations", confirmed.confirmations, 2, confirmed.finalized), true);

    canonicalHash = "c".repeat(64);
    const reorged = await adapter.getEvidenceStatus(observed);
    assert.deepEqual(
      {
        exists: reorged.exists,
        canonical: reorged.canonical,
        finalized: reorged.finalized,
      },
      { exists: false, canonical: false, finalized: false },
    );
    assert.equal(isFinalitySatisfied("confirmations", reorged.confirmations, 2, reorged.finalized), false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});