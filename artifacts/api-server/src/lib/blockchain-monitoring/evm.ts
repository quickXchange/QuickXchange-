import { BlockchainMonitorError, sanitizedProviderError } from "./errors";
import { positiveInteger, providerHeaders, providerJson, requireEndpoint } from "./http";
import type {
  BlockchainMonitorAdapter, ChainHead, ConnectionResult, IncomingEvidence,
  MonitorAsset, MonitorConfig, ScanCursor, ScanResult, WatchedAddress,
} from "./types";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a3d9b4f1e5";
const HEX_ADDRESS_LENGTH = 64;

type RpcResponse<T> = { result?: T; error?: unknown };
type EvmTransaction = {
  hash?: string; from?: string; to?: string; value?: string; blockNumber?: string; blockHash?: string;
};
type EvmLog = {
  address?: string; topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string; logIndex?: string;
};
type EvmBlock = { number?: string; hash?: string; timestamp?: string; transactions?: EvmTransaction[] };

export function normalizeEvmAddress(address: string): string {
  const value = address.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(value) ? value : "";
}

export function quantityToRawAmount(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return undefined;
  try {
    const amount = BigInt(value);
    return amount > 0n ? amount.toString(10) : undefined;
  } catch {
    return undefined;
  }
}

function topicAddress(address: string): string {
  return `0x${address.slice(2).padStart(HEX_ADDRESS_LENGTH, "0")}`;
}

function rpcError<T>(response: RpcResponse<T>): T {
  if (response.error !== undefined || response.result === undefined) {
    throw sanitizedProviderError("PROVIDER");
  }
  return response.result;
}

export function parseEvmTransferLog(
  log: EvmLog,
  networkCode: string,
  watched: WatchedAddress,
  asset: MonitorAsset,
): IncomingEvidence | undefined {
  const contract = normalizeEvmAddress(asset.contractOrMint ?? "");
  const watchedAddress = normalizeEvmAddress(watched.address);
  const topics = log.topics ?? [];
  const recipientTopic = topics[2]?.toLowerCase();
  const transactionHash = typeof log.transactionHash === "string" ? log.transactionHash : "";
  const blockNumber = typeof log.blockNumber === "string" ? log.blockNumber : "";
  const rawAmount = quantityToRawAmount(log.data);
  if (
    asset.kind !== "token" || !contract ||
    normalizeEvmAddress(log.address ?? "") !== contract ||
    topics[0]?.toLowerCase() !== TRANSFER_TOPIC ||
    !watchedAddress || recipientTopic !== topicAddress(watchedAddress) ||
    !transactionHash || !blockNumber || !rawAmount
  ) return undefined;
  const fromAddress = topics[1] ? normalizeEvmAddress(`0x${topics[1].slice(-40)}`) : "";
  return {
    eventId: `${transactionHash}:${log.logIndex ?? "unknown"}:${asset.assetId}`,
    transactionHash,
    networkCode,
    assetId: asset.assetId,
    assetSymbol: asset.symbol,
    identityKind: asset.kind,
    contractOrMint: contract,
    fromAddress: fromAddress || undefined,
    toAddress: watchedAddress,
    rawAmount,
    decimals: asset.decimals,
    blockOrSlot: BigInt(blockNumber).toString(10),
    detectedAt: new Date().toISOString(),
    source: "evm-json-rpc",
  };
}

export function parseEvmNativeTransfer(
  transaction: EvmTransaction,
  networkCode: string,
  watched: WatchedAddress,
  asset: MonitorAsset,
): IncomingEvidence | undefined {
  const toAddress = normalizeEvmAddress(transaction.to ?? "");
  const watchedAddress = normalizeEvmAddress(watched.address);
  const rawAmount = quantityToRawAmount(transaction.value);
  if (asset.kind !== "native" || !toAddress || toAddress !== watchedAddress || !rawAmount || !transaction.hash || !transaction.blockNumber) return undefined;
  return {
    eventId: `${transaction.hash}:native:${asset.assetId}`,
    transactionHash: transaction.hash,
    networkCode,
    assetId: asset.assetId,
    assetSymbol: asset.symbol,
    identityKind: asset.kind,
    toAddress,
    fromAddress: normalizeEvmAddress(transaction.from ?? "") || undefined,
    rawAmount,
    decimals: asset.decimals,
    blockOrSlot: BigInt(transaction.blockNumber).toString(10),
    detectedAt: new Date().toISOString(),
    source: "evm-json-rpc",
  };
}

export class EvmJsonRpcAdapter implements BlockchainMonitorAdapter {
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
    this.maxRange = positiveInteger(config.maxRange, 1_000);
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const response = await providerJson<RpcResponse<T>>(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }, this.timeoutMs);
    return rpcError(response);
  }

  async testConnection(): Promise<ConnectionResult> {
    const started = Date.now();
    const [chainId, head] = await Promise.all([
      this.rpc<string>("eth_chainId", []),
      this.rpc<string>("eth_blockNumber", []),
    ]);
    if (this.config.chainId && chainId.toLowerCase() !== this.config.chainId.toLowerCase()) {
      throw new BlockchainMonitorError("PROVIDER", "Blockchain monitoring provider returned an unexpected network.");
    }
    return { connected: true, chainId, head: BigInt(head).toString(10), latencyMs: Date.now() - started };
  }

  async getHead(): Promise<ChainHead> {
    const head = await this.rpc<string>("eth_blockNumber", []);
    return { cursor: BigInt(head).toString(10), observedAt: new Date().toISOString() };
  }

  async scanIncoming(cursor: ScanCursor, watchedAddresses: WatchedAddress[]): Promise<ScanResult> {
    const from = Number(cursor.from);
    const to = Number(cursor.to);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to - from > this.maxRange) {
      throw new BlockchainMonitorError("RANGE", "Blockchain monitoring scan range is invalid.");
    }
    const evidence: IncomingEvidence[] = [];
    const watched = watchedAddresses.flatMap(address => address.assets.map(asset => ({ address, asset })));
    const native = watched.filter(item => item.asset.kind === "native");
    const tokens = watched.filter(item => item.asset.kind === "token" && normalizeEvmAddress(item.asset.contractOrMint ?? ""));
    const tokenAddresses = [...new Set(tokens.map(item => normalizeEvmAddress(item.address.address)).filter(Boolean))];
    const tokenContracts = [...new Set(tokens.map(item => normalizeEvmAddress(item.asset.contractOrMint ?? "")).filter(Boolean))];

    for (let block = from; block <= to; block++) {
      const blockHex = `0x${block.toString(16)}`;
      if (native.length) {
        const fullBlock = await this.rpc<EvmBlock | null>("eth_getBlockByNumber", [blockHex, true]);
        for (const transaction of fullBlock?.transactions ?? []) {
          const candidates = native.flatMap((item) => {
            const parsed = parseEvmNativeTransfer(transaction, this.networkCode, item.address, item.asset);
            return parsed ? [parsed] : [];
          });
          if (!candidates.length) continue;
          const receipt = transaction.hash
            ? await this.rpc<{ status?: string } | null>("eth_getTransactionReceipt", [transaction.hash])
            : null;
          if (receipt?.status !== "0x1") continue;
          for (const parsed of candidates) {
            evidence.push({ ...parsed, blockHash: transaction.blockHash ?? fullBlock?.hash, blockTimestamp: fullBlock?.timestamp ? new Date(Number(BigInt(fullBlock.timestamp)) * 1000).toISOString() : undefined });
          }
        }
      }
      for (const contract of tokenContracts) {
        for (const address of tokenAddresses) {
          const logs = await this.rpc<EvmLog[]>("eth_getLogs", [{
            fromBlock: blockHex, toBlock: blockHex, address: contract,
            topics: [TRANSFER_TOPIC, null, topicAddress(address)],
          }]);
          const item = tokens.find(candidate =>
            normalizeEvmAddress(candidate.address.address) === address &&
            normalizeEvmAddress(candidate.asset.contractOrMint ?? "") === contract);
          if (!item) continue;
          for (const log of logs) {
            const receipt = log.transactionHash
              ? await this.rpc<{ status?: string } | null>("eth_getTransactionReceipt", [log.transactionHash])
              : null;
            if (receipt?.status !== "0x1") continue;
            const parsed = parseEvmTransferLog(log, this.networkCode, item.address, item.asset);
            if (parsed) {
              const fullBlock = await this.rpc<EvmBlock | null>("eth_getBlockByNumber", [blockHex, false]);
              evidence.push({ ...parsed, blockHash: fullBlock?.hash, blockTimestamp: fullBlock?.timestamp ? new Date(Number(BigInt(fullBlock.timestamp)) * 1000).toISOString() : undefined });
            }
          }
        }
      }
    }
    return { cursor: { from: String(from), to: String(to) }, evidence };
  }

  async getEvidenceStatus(evidence: IncomingEvidence) {
    const receipt = await this.rpc<{ status?: string; blockHash?: string; blockNumber?: string } | null>("eth_getTransactionReceipt", [evidence.transactionHash]);
    if (!receipt || receipt.status !== "0x1" || !receipt.blockNumber) {
      return { exists: Boolean(receipt), successful: false, canonical: false, confirmations: 0, finalized: false };
    }
    const head = BigInt(await this.rpc<string>("eth_blockNumber", []));
    const block = await this.rpc<EvmBlock | null>("eth_getBlockByNumber", [receipt.blockNumber, false]);
    const confirmations = head >= BigInt(receipt.blockNumber) ? Number(head - BigInt(receipt.blockNumber) + 1n) : 0;
    return {
      exists: true, successful: true, canonical: Boolean(block && (!evidence.blockHash || block.hash === evidence.blockHash)),
      confirmations, finalized: false, blockHash: block?.hash, blockTimestamp: block?.timestamp ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() : undefined,
    };
  }
}