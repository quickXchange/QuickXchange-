import { BlockchainMonitorError, sanitizedProviderError } from "./errors";
import { positiveInteger, providerHeaders, providerJson, requireEndpoint } from "./http";
import type {
  BlockchainMonitorAdapter, ChainHead, ConnectionResult, IncomingEvidence,
  MonitorAsset, MonitorConfig, ScanCursor, ScanResult, WatchedAddress,
} from "./types";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HEX_ADDRESS_LENGTH = 64;
const NATIVE_BLOCK_READ_CONCURRENCY = 8;

type RpcResponse<T> = { result?: T; error?: unknown };
type EvmTransaction = {
  hash?: string; from?: string; to?: string; value?: string; blockNumber?: string; blockHash?: string;
};
type EvmLog = {
  address?: string; topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string; logIndex?: string;
};
type EvmBlock = {
  number?: string;
  hash?: string;
  timestamp?: string;
  transactions?: Array<EvmTransaction | string>;
};

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
    const startedAt = new Date();
    const remainingMs = this.config.deadlineAtMs === undefined
      ? this.timeoutMs
      : this.config.deadlineAtMs - startedAt.getTime();
    const requestTimeoutMs = Math.min(this.timeoutMs, remainingMs);
    this.config.rpcTrace?.({
      networkCode: this.networkCode,
      method,
      startedAt: startedAt.toISOString(),
      timeoutMs: Math.max(0, requestTimeoutMs),
      outcome: "started",
    });
    if (requestTimeoutMs <= 0) {
      const completedAt = new Date();
      this.config.rpcTrace?.({
        networkCode: this.networkCode,
        method,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        timeoutMs: 0,
        outcome: "timeout",
        errorCategory: "TIMEOUT",
      });
      throw new BlockchainMonitorError("TIMEOUT", `Blockchain RPC ${method} timed out.`);
    }
    try {
      const response = await providerJson<RpcResponse<T>>(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }, requestTimeoutMs);
      const result = rpcError(response);
      const completedAt = new Date();
      this.config.rpcTrace?.({
        networkCode: this.networkCode,
        method,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        timeoutMs: requestTimeoutMs,
        outcome: "success",
      });
      return result;
    } catch (error) {
      const completedAt = new Date();
      const errorCategory = error instanceof BlockchainMonitorError ? error.code : "NETWORK";
      this.config.rpcTrace?.({
        networkCode: this.networkCode,
        method,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        timeoutMs: requestTimeoutMs,
        outcome: errorCategory === "TIMEOUT" ? "timeout" : "failure",
        errorCategory,
      });
      throw new BlockchainMonitorError(
        errorCategory,
        errorCategory === "TIMEOUT"
          ? `Blockchain RPC ${method} timed out.`
          : `Blockchain RPC ${method} failed (${errorCategory}).`,
      );
    }
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
    const block = await this.rpc<EvmBlock | null>("eth_getBlockByNumber", [head, false]);
    if (!block?.hash || !block.timestamp) {
      throw new BlockchainMonitorError("PROVIDER", "Blockchain monitoring provider did not return the current block.");
    }
    await this.rpc<EvmLog[]>("eth_getLogs", [{
      fromBlock: head,
      toBlock: head,
      address: "0x0000000000000000000000000000000000000001",
      topics: [TRANSFER_TOPIC],
    }]);
    let transactionHash = block.transactions
      ?.map((transaction) => typeof transaction === "string" ? transaction : transaction.hash)
      .find((hash): hash is string => Boolean(hash));
    for (let offset = 1n; !transactionHash && offset <= 5n; offset += 1n) {
      const candidateNumber = BigInt(head) - offset;
      if (candidateNumber < 0n) break;
      const candidate = await this.rpc<EvmBlock | null>(
        "eth_getBlockByNumber",
        [`0x${candidateNumber.toString(16)}`, false],
      );
      transactionHash = candidate?.transactions
        ?.map((transaction) => typeof transaction === "string" ? transaction : transaction.hash)
        .find((hash): hash is string => Boolean(hash));
    }
    if (!transactionHash) {
      throw new BlockchainMonitorError("PROVIDER", "Blockchain monitoring provider did not return a transaction for receipt verification.");
    }
    const receipt = await this.rpc<{ status?: string } | null>(
      "eth_getTransactionReceipt",
      [transactionHash],
    );
    if (!receipt?.status) {
      throw new BlockchainMonitorError("PROVIDER", "Blockchain monitoring provider did not return a transaction receipt.");
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
    if (native.length && to - from >= NATIVE_BLOCK_READ_CONCURRENCY * NATIVE_BLOCK_READ_CONCURRENCY) {
      throw new BlockchainMonitorError("RANGE", "Native EVM monitoring scan range is too large.");
    }
    const tokenAddresses = [...new Set(tokens.map(item => normalizeEvmAddress(item.address.address)).filter(Boolean))];
    const tokenContracts = [...new Set(tokens.map(item => normalizeEvmAddress(item.asset.contractOrMint ?? "")).filter(Boolean))];

    if (native.length) {
      for (let batchStart = from; batchStart <= to; batchStart += NATIVE_BLOCK_READ_CONCURRENCY) {
        const batchEnd = Math.min(to, batchStart + NATIVE_BLOCK_READ_CONCURRENCY - 1);
        const fullBlocks = await Promise.all(
          Array.from({ length: batchEnd - batchStart + 1 }, (_, offset) => {
            const blockHex = `0x${(batchStart + offset).toString(16)}`;
            return this.rpc<EvmBlock | null>("eth_getBlockByNumber", [blockHex, true]);
          }),
        );
        for (const [offset, fullBlock] of fullBlocks.entries()) {
          const requestedBlockNumber = batchStart + offset;
          for (const transaction of fullBlock?.transactions ?? []) {
            if (typeof transaction === "string") continue;
            const candidates = native.flatMap((item) => {
              const parsed = parseEvmNativeTransfer(transaction, this.networkCode, item.address, item.asset);
              return parsed ? [parsed] : [];
            });
            if (!candidates.length) continue;
            const receipt = transaction.hash
              ? await this.rpc<{ status?: string; blockNumber?: string; blockHash?: string } | null>("eth_getTransactionReceipt", [transaction.hash])
              : null;
            if (
              receipt?.status !== "0x1" ||
              !receipt.blockNumber ||
              !receipt.blockHash ||
              !transaction.blockNumber ||
              !fullBlock?.number ||
              BigInt(fullBlock.number) !== BigInt(requestedBlockNumber) ||
              BigInt(transaction.blockNumber) !== BigInt(requestedBlockNumber) ||
              BigInt(receipt.blockNumber) !== BigInt(transaction.blockNumber) ||
              !fullBlock?.hash ||
              !transaction.blockHash ||
              transaction.blockHash.toLowerCase() !== fullBlock.hash.toLowerCase() ||
              receipt.blockHash.toLowerCase() !== fullBlock.hash.toLowerCase()
            ) continue;
            for (const parsed of candidates) {
              evidence.push({ ...parsed, blockHash: fullBlock.hash, blockTimestamp: fullBlock.timestamp ? new Date(Number(BigInt(fullBlock.timestamp)) * 1000).toISOString() : undefined });
            }
          }
        }
      }
    }
    const fromHex = `0x${from.toString(16)}`;
    const toHex = `0x${to.toString(16)}`;
    for (const contract of tokenContracts) {
      for (const address of tokenAddresses) {
        const item = tokens.find(candidate =>
          normalizeEvmAddress(candidate.address.address) === address &&
          normalizeEvmAddress(candidate.asset.contractOrMint ?? "") === contract);
        if (!item) continue;
        const logs = await this.rpc<EvmLog[]>("eth_getLogs", [{
          fromBlock: fromHex, toBlock: toHex, address: contract,
          topics: [TRANSFER_TOPIC, null, topicAddress(address)],
        }]);
        for (const log of logs) {
          const receipt = log.transactionHash
            ? await this.rpc<{ status?: string } | null>("eth_getTransactionReceipt", [log.transactionHash])
            : null;
          if (receipt?.status !== "0x1") continue;
          const parsed = parseEvmTransferLog(log, this.networkCode, item.address, item.asset);
          if (parsed) {
            const fullBlock = await this.rpc<EvmBlock | null>("eth_getBlockByNumber", [log.blockNumber ?? fromHex, false]);
            evidence.push({ ...parsed, blockHash: fullBlock?.hash, blockTimestamp: fullBlock?.timestamp ? new Date(Number(BigInt(fullBlock.timestamp)) * 1000).toISOString() : undefined });
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