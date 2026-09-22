import assert from "node:assert/strict";
import test from "node:test";
import { BitcoinUtxoAdapter, bitcoinBtcToSatoshis, decodeBitcoinMainnetAddress } from "../src/lib/blockchain-monitoring/bitcoin";

test("live Alchemy Bitcoin Mainnet current and historical scans pass the final adapter", { skip: !process.env.RUN_BITCOIN_LIVE_TESTS }, async (context) => {
  const endpoint = process.env.BITCOIN_MONITOR_RPC_URL;
  assert(endpoint, "BITCOIN_MONITOR_RPC_URL is required for the opt-in live test");
  const adapter = new BitcoinUtxoAdapter({ networkCode: "BTC", provider: "rpc", adapterKind: "bitcoin", endpoint, maxRange: 1, confirmationsRequired: 1 });
  const connection = await adapter.testConnection();
  assert.equal(connection.chainId, "main");
  const current = await adapter.scanIncoming(
    { from: connection.head, to: connection.head },
    [{ address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", assets: [{ assetId: "btc-bitcoin", symbol: "BTC", kind: "native", decimals: 8 }] }],
  );
  assert.deepEqual(current.cursor, { from: connection.head, to: connection.head });
  const height = Number(connection.head) - 6;
  let id = 0;
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "getblockhash", params: [height] }) });
  const hashResult = await response.json() as { result?: string };
  assert(hashResult.result);
  const blockResponse = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "getblock", params: [hashResult.result, 2] }) });
  const block = await blockResponse.json() as { result?: { tx?: Array<{ txid?: string; vout?: Array<{ n?: number; value?: number; scriptPubKey?: { address?: string } }> }> } };
  const candidate = block.result?.tx?.flatMap((tx) => (tx.vout ?? []).map((vout) => ({ tx, vout }))).find(({ vout }) => vout.scriptPubKey?.address && decodeBitcoinMainnetAddress(vout.scriptPubKey.address));
  assert(candidate?.tx.txid && candidate.vout.n !== undefined && candidate.vout.scriptPubKey?.address);
  const result = await adapter.scanIncoming({ from: String(height), to: String(height) }, [{ address: candidate.vout.scriptPubKey.address, assets: [{ assetId: "btc-bitcoin", symbol: "BTC", kind: "native", decimals: 8 }] }]);
  const evidence = result.evidence.find((item) => item.transactionHash === candidate.tx.txid && item.eventId === `${candidate.tx.txid}:${candidate.vout.n}:btc-bitcoin`);
  assert(evidence, "historical output was not detected by the final adapter");
  assert.equal(evidence.blockHash, hashResult.result);
  assert.equal(evidence.rawAmount, bitcoinBtcToSatoshis(candidate.vout.value));
  const status = await adapter.getEvidenceStatus(evidence);
  assert.equal(status.exists, true);
  assert.equal(status.canonical, true);
  assert(status.confirmations >= 1);
  context.diagnostic(JSON.stringify({
    currentBoundedScan: current.cursor,
    historical: {
      height,
      blockHash: evidence.blockHash,
      txid: evidence.transactionHash,
      vout: candidate.vout.n,
      eventId: evidence.eventId,
      satoshis: evidence.rawAmount,
      confirmations: status.confirmations,
    },
  }));
});