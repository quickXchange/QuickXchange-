import { BlockchainMonitorError } from "./errors";
import { providerHeaders, providerJson, requireEndpoint, positiveInteger } from "./http";
import type {
  BlockchainMonitorAdapter, ChainHead, ConnectionResult, IncomingEvidence,
  MonitorAsset, MonitorConfig, ScanCursor, ScanResult, WatchedAddress,
} from "./types";

type SolanaRpc<T> = { result?: T; error?: unknown };
type SolanaTokenBalance = { accountIndex?: number; mint?: string; owner?: string; uiTokenAmount?: { amount?: string } };
type SolanaTransaction = {
  slot?: number; blockTime?: number | null;
  transaction?: { signatures?: string[]; message?: { accountKeys?: Array<{ pubkey?: string } | string> } };
  meta?: { err?: unknown; preBalances?: number[]; postBalances?: number[]; preTokenBalances?: SolanaTokenBalance[]; postTokenBalances?: SolanaTokenBalance[] };
};

function rpcResult<T>(response: SolanaRpc<T>): T {
  if (response.error !== undefined || response.result === undefined) throw new BlockchainMonitorError("PROVIDER", "Blockchain monitoring provider request failed.");
  return response.result;
}

export function normalizeSolanaAddress(value: string): string {
  const trimmed = value.trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed) ? trimmed : "";
}

export function parseSolanaTransaction(
  transaction: SolanaTransaction,
  networkCode: string,
  watched: WatchedAddress,
): IncomingEvidence[] {
  const signature = transaction.transaction?.signatures?.[0];
  const slot = transaction.slot;
  const watchedAddress = normalizeSolanaAddress(watched.address);
  if (!signature || !Number.isSafeInteger(slot) || !watchedAddress || transaction.meta?.err) return [];
  const keys = (transaction.transaction?.message?.accountKeys ?? []).map(key => typeof key === "string" ? key : key.pubkey ?? "");
  const evidence: IncomingEvidence[] = [];
  for (const asset of watched.assets) {
    if (asset.kind === "native") {
      const index = keys.indexOf(watchedAddress);
      const before = index >= 0 ? transaction.meta?.preBalances?.[index] ?? 0 : 0;
      const after = index >= 0 ? transaction.meta?.postBalances?.[index] ?? 0 : 0;
      const delta = after - before;
      if (delta > 0) evidence.push({
        eventId: `${signature}:native:${asset.assetId}`, transactionHash: signature, networkCode,
        assetId: asset.assetId, assetSymbol: asset.symbol, toAddress: watchedAddress,
         identityKind: asset.kind,
        rawAmount: String(delta), decimals: asset.decimals, blockOrSlot: String(slot),
         blockTimestamp: transaction.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : undefined,
        detectedAt: new Date().toISOString(), source: "solana-json-rpc",
      });
    } else {
      const mint = normalizeSolanaAddress(asset.contractOrMint ?? "");
      if (!mint) continue;
      const before = new Map((transaction.meta?.preTokenBalances ?? []).filter(balance => balance.owner === watchedAddress && balance.mint === mint).map(balance => [balance.accountIndex, BigInt(balance.uiTokenAmount?.amount ?? "0")]));
      const after = (transaction.meta?.postTokenBalances ?? []).filter(balance => balance.owner === watchedAddress && balance.mint === mint);
      for (const balance of after) {
        const delta = BigInt(balance.uiTokenAmount?.amount ?? "0") - (before.get(balance.accountIndex) ?? 0n);
        if (delta > 0n) evidence.push({
          eventId: `${signature}:spl:${mint}:${balance.accountIndex ?? "unknown"}:${asset.assetId}`,
          transactionHash: signature, networkCode, assetId: asset.assetId, assetSymbol: asset.symbol,
          identityKind: asset.kind,
          contractOrMint: mint, toAddress: watchedAddress, rawAmount: delta.toString(10), decimals: asset.decimals,
           blockOrSlot: String(slot), blockTimestamp: transaction.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : undefined, detectedAt: new Date().toISOString(),
          source: "solana-json-rpc",
        });
      }
    }
  }
  return evidence;
}

export class SolanaJsonRpcAdapter implements BlockchainMonitorAdapter {
  readonly networkCode: string;
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRange: number;

  constructor(private readonly config: MonitorConfig) {
    this.networkCode = config.networkCode;
    this.endpoint = requireEndpoint(config.endpoint);
    this.headers = providerHeaders(config.apiKey, config.apiKeyHeader);
    this.timeoutMs = positiveInteger(config.requestTimeoutMs, 15_000);
    this.maxRange = positiveInteger(config.maxRange, 10_000);
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const response = await providerJson<SolanaRpc<T>>(this.endpoint, {
      method: "POST", headers: { "content-type": "application/json", ...this.headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }, this.timeoutMs);
    return rpcResult(response);
  }

  async testConnection(): Promise<ConnectionResult> {
    const started = Date.now();
    const [genesis, head] = await Promise.all([
      this.rpc<string>("getGenesisHash", []), this.rpc<number>("getSlot", [{ commitment: "finalized" }]),
    ]);
    if (!genesis || !Number.isSafeInteger(head)) throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain monitoring provider returned an invalid head.");
    return { connected: true, head: String(head), chainId: genesis, latencyMs: Date.now() - started };
  }

  async getHead(): Promise<ChainHead> {
    const head = await this.rpc<number>("getSlot", [{ commitment: "finalized" }]);
    if (!Number.isSafeInteger(head)) throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain monitoring provider returned an invalid head.");
    return { cursor: String(head), observedAt: new Date().toISOString() };
  }

  async scanIncoming(cursor: ScanCursor, watchedAddresses: WatchedAddress[]): Promise<ScanResult> {
    const from = Number(cursor.from); const to = Number(cursor.to);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to - from > this.maxRange) throw new BlockchainMonitorError("RANGE", "Blockchain monitoring scan range is invalid.");
    const evidence: IncomingEvidence[] = [];
    for (const watched of watchedAddresses) {
      const address = normalizeSolanaAddress(watched.address);
      if (!address) continue;
      const signatures = await this.rpc<Array<{ signature?: string; slot?: number }>>("getSignaturesForAddress", [address, { limit: 1_000, commitment: "confirmed" }]);
      for (const item of signatures) {
        const slot = item.slot;
        if (!item.signature || typeof slot !== "number" || !Number.isSafeInteger(slot) || slot < from || slot > to) continue;
        const transaction = await this.rpc<SolanaTransaction | null>("getTransaction", [item.signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
        if (transaction) evidence.push(...parseSolanaTransaction(transaction, this.networkCode, watched));
      }
    }
    return { cursor: { from: String(from), to: String(to) }, evidence };
  }

  async getEvidenceStatus(evidence: IncomingEvidence) {
    const transaction = await this.rpc<SolanaTransaction | null>("getTransaction", [evidence.transactionHash, { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0 }]);
    const successful = Boolean(transaction && !transaction.meta?.err);
    return {
      exists: Boolean(transaction), successful, canonical: successful,
      confirmations: successful ? 1 : 0, finalized: successful,
      blockTimestamp: transaction?.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : evidence.blockTimestamp,
    };
  }
}