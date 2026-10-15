import { BlockchainMonitorError, providerFailureDetails, sanitizedProviderError } from "./errors";
import { positiveInteger, providerHeaders, providerJson, requireEndpoint } from "./http";
import { setTimeout as delay } from "node:timers/promises";
import { queryEvmLogs } from "./evm-log-query";
import { rpcUsageMeter, rpcUsageProvider } from "./rpc-usage";
import type {
  BlockchainMonitorAdapter, ChainHead, ConnectionResult, IncomingEvidence,
  MonitorAsset, MonitorConfig, ScanCursor, ScanResult, WatchedAddress,
} from "./types";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HEX_ADDRESS_LENGTH = 64;
const NATIVE_BLOCK_READ_CONCURRENCY = 4;
const NATIVE_MAX_BLOCKS_PER_SCAN = 8;

type RpcResponse<T> = { result?: T; error?: unknown };
type EvmTransaction = {
  hash?: string; from?: string; to?: string; value?: string; blockNumber?: string; blockHash?: string;
};
type EvmLog = {
  removed?: boolean;
  address?: string; topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string; blockHash?: string; logIndex?: string;
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

function sameHash(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function transactionIsInBlock(block: EvmBlock | null, transactionHash: string): boolean {
  return Boolean(block?.transactions?.some(transaction =>
    (typeof transaction === "string" ? transaction : transaction.hash)?.toLowerCase() === transactionHash.toLowerCase(),
  ));
}

function logIndexInvalid(logIndex: string | undefined): boolean {
  return typeof logIndex !== "string" || !/^0x[0-9a-f]+$/i.test(logIndex);
}

function tokenEventMatchesLog(
  log: EvmLog,
  transactionHash: string,
  contract: string,
  recipient: string,
  amount: string,
  logIndex: string,
): boolean {
  return (
    sameHash(log.transactionHash, transactionHash) &&
    normalizeEvmAddress(log.address ?? "") === contract &&
    log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
    log.topics?.[2]?.toLowerCase() === topicAddress(recipient) &&
    quantityToRawAmount(log.data) === amount &&
    log.logIndex === logIndex
  );
}

function rpcError<T>(response: RpcResponse<T>): T {
  if (response.error !== undefined || response.result === undefined) {
    throw sanitizedProviderError("PROVIDER", providerFailureDetails(response));
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
    log.removed === true || asset.kind !== "token" || !contract ||
    normalizeEvmAddress(log.address ?? "") !== contract ||
    topics[0]?.toLowerCase() !== TRANSFER_TOPIC ||
    !watchedAddress || recipientTopic !== topicAddress(watchedAddress) ||
    !transactionHash || !/^0x[0-9a-f]+$/i.test(blockNumber) || !rawAmount
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
      }, requestTimeoutMs, () => rpcUsageMeter.record(
        this.networkCode, rpcUsageProvider(this.endpoint), this.config.rpcPurpose ?? "unspecified", method,
      ));
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
      const details = error instanceof BlockchainMonitorError ? error.providerFailure : undefined;
      const diagnostic = details ? [
        details.httpStatus !== undefined ? `HTTP ${details.httpStatus}` : "",
        details.rpcCode !== undefined ? `RPC ${details.rpcCode}` : "",
        details.reason?.replace(/_/g, " ") ?? "",
      ].filter(Boolean).join("; ") : "";
      this.config.rpcTrace?.({
        networkCode: this.networkCode,
        method,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        timeoutMs: requestTimeoutMs,
        outcome: errorCategory === "TIMEOUT" ? "timeout" : "failure",
        errorCategory,
        providerFailure: error instanceof BlockchainMonitorError ? error.providerFailure : undefined,
      });
      throw new BlockchainMonitorError(
        errorCategory,
        errorCategory === "TIMEOUT"
          ? `Blockchain RPC ${method} timed out.`
          : `Blockchain RPC ${method} failed (${errorCategory}).${diagnostic ? ` ${diagnostic}.` : ""}`,
        error instanceof BlockchainMonitorError ? error.providerFailure : undefined,
      );
    }
  }

  async testConnection(): Promise<ConnectionResult> {
    const started = Date.now();
    // Fail identity/quota checks before spending any more provider capacity.
    const chainId = await this.rpc<string>("eth_chainId", []);
    if (this.config.chainId && chainId.toLowerCase() !== this.config.chainId.toLowerCase()) {
      throw new BlockchainMonitorError("PROVIDER", "Blockchain monitoring provider returned an unexpected network.");
    }
    const head = await this.rpc<string>("eth_blockNumber", []);
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
    // Only share immutable reads inside this scan. Confirmation checks always
    // fetch fresh canonical blocks/receipts, including after a reorg.
    const reads = new Map<string, Promise<unknown>>();
    const read = <T>(method: string, params: unknown[]): Promise<T> => {
      const key = JSON.stringify([method, params]);
      const existing = reads.get(key);
      if (existing) return existing as Promise<T>;
      const pending = this.rpc<T>(method, params);
      if (reads.size < 512) reads.set(key, pending);
      return pending;
    };
    const watched = watchedAddresses.flatMap(address => address.assets.map(asset => ({ address, asset })));
    const native = watched.filter(item => item.asset.kind === "native");
    const tokens = watched.filter(item => item.asset.kind === "token" && normalizeEvmAddress(item.asset.contractOrMint ?? ""));
    if (native.length && to - from >= NATIVE_MAX_BLOCKS_PER_SCAN) {
      throw new BlockchainMonitorError("RANGE", "Native EVM monitoring scan range is too large.");
    }
    const tokenAddresses = [...new Set(tokens.map(item => normalizeEvmAddress(item.address.address)).filter(Boolean))];
    const tokenContracts = [...new Set(tokens.map(item => normalizeEvmAddress(item.asset.contractOrMint ?? "")).filter(Boolean))];

    if (native.length) {
      for (let batchStart = from; batchStart <= to; batchStart += NATIVE_BLOCK_READ_CONCURRENCY) {
        const batchEnd = Math.min(to, batchStart + NATIVE_BLOCK_READ_CONCURRENCY - 1);
        const fullBlocks = await Promise.all(
          Array.from({ length: batchEnd - batchStart + 1 }, async (_, offset) => {
            const blockHex = `0x${(batchStart + offset).toString(16)}`;
            try {
              return await this.rpc<EvmBlock | null>("eth_getBlockByNumber", [blockHex, true]);
            } catch (error) {
              if (
                !(error instanceof BlockchainMonitorError) ||
                !["TIMEOUT", "NETWORK", "PROVIDER"].includes(error.code) ||
                error.providerFailure?.reason === "quota_exhausted" ||
                error.providerFailure?.reason === "rate_limited" ||
                error.providerFailure?.reason === "unauthorized" ||
                error.providerFailure?.reason === "forbidden"
              ) throw error;
              const cooldownMs = Math.min(5_000, Math.max(50, Math.floor(this.timeoutMs / 3)));
              if (
                this.config.deadlineAtMs !== undefined &&
                this.config.deadlineAtMs - Date.now() <= cooldownMs + 1
              ) throw error;
              await delay(cooldownMs);
              return this.rpc<EvmBlock | null>("eth_getBlockByNumber", [blockHex, true]);
            }
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
    const queryBudget = { remaining: 64 };
    for (const contract of tokenContracts) {
      const contractItems = tokens.filter(candidate =>
        normalizeEvmAddress(candidate.asset.contractOrMint ?? "") === contract);
      const addresses = tokenAddresses.filter(address => contractItems.some(candidate =>
        normalizeEvmAddress(candidate.address.address) === address));
      for (let offset = 0; offset < addresses.length; offset += 50) {
        const logs = await queryEvmLogs<EvmLog>(
          filter => this.rpc<EvmLog[]>("eth_getLogs", [filter]),
          contract, addresses.slice(offset, offset + 50).map(topicAddress), from, to,
          TRANSFER_TOPIC, queryBudget,
        );
        for (const log of logs) {
          if (log.removed === true || !log.blockNumber || !/^0x[0-9a-f]+$/i.test(log.blockNumber)) continue;
          const height = BigInt(log.blockNumber);
          if (height < BigInt(from) || height > BigInt(to)) continue;
          const candidates = contractItems.flatMap(item => {
            const parsed = parseEvmTransferLog(log, this.networkCode, item.address, item.asset);
            return parsed ? [parsed] : [];
          });
          if (!candidates.length) continue;
          const transactionHash = log.transactionHash;
          const receipt = transactionHash
            ? await read<{ status?: string; blockNumber?: string; blockHash?: string; logs?: EvmLog[] } | null>("eth_getTransactionReceipt", [transactionHash])
            : null;
          if (
            receipt?.status !== "0x1" ||
            !transactionHash ||
            !log.blockHash ||
            !log.blockNumber ||
            !receipt.blockNumber ||
            !receipt.blockHash ||
            logIndexInvalid(log.logIndex)
          ) continue;
          for (const parsed of candidates) {
            if (receipt.logs?.some(receiptLog => tokenEventMatchesLog(
              receiptLog,
              transactionHash,
              parsed.contractOrMint ?? "",
              parsed.toAddress,
              parsed.rawAmount,
              log.logIndex!,
            ))) {
              const fullBlock = await read<EvmBlock | null>("eth_getBlockByNumber", [log.blockNumber, false]);
              if (
                !fullBlock?.hash ||
                !fullBlock.number ||
                BigInt(fullBlock.number) !== BigInt(log.blockNumber) ||
                BigInt(receipt.blockNumber) !== BigInt(log.blockNumber) ||
                !sameHash(log.blockHash, receipt.blockHash) ||
                !sameHash(receipt.blockHash, fullBlock.hash) ||
                !transactionIsInBlock(fullBlock, transactionHash)
              ) continue;
              evidence.push({ ...parsed, blockHash: fullBlock.hash, blockTimestamp: fullBlock.timestamp ? new Date(Number(BigInt(fullBlock.timestamp)) * 1000).toISOString() : undefined });
            }
          }
        }
      }
    }
    return { cursor: { from: String(from), to: String(to) }, evidence };
  }

  async getEvidenceStatus(evidence: IncomingEvidence) {
    const receipt = await this.rpc<{
      status?: string; blockHash?: string; blockNumber?: string; logs?: EvmLog[];
    } | null>("eth_getTransactionReceipt", [evidence.transactionHash]);
    if (!receipt || receipt.status !== "0x1" || !receipt.blockNumber) {
      return { exists: Boolean(receipt), successful: false, canonical: false, confirmations: 0, finalized: false };
    }
    const head = BigInt(await this.rpc<string>("eth_blockNumber", []));
    const block = await this.rpc<EvmBlock | null>("eth_getBlockByNumber", [receipt.blockNumber, false]);
    const confirmations = head >= BigInt(receipt.blockNumber) ? Number(head - BigInt(receipt.blockNumber) + 1n) : 0;
    const transactionCanonical = transactionIsInBlock(block, evidence.transactionHash);
    const hashCanonical = Boolean(
      block?.hash &&
      sameHash(receipt.blockHash, block.hash) &&
      (!evidence.blockHash || sameHash(block.hash, evidence.blockHash)),
    );
    let eventCanonical = true;
    if (evidence.identityKind === "token") {
      const eventParts = evidence.eventId.startsWith(`${evidence.transactionHash}:`)
        ? evidence.eventId.slice(evidence.transactionHash.length + 1).split(":")
        : [];
      const logIndex = eventParts[0];
      eventCanonical = Boolean(
        logIndex &&
        normalizeEvmAddress(evidence.contractOrMint ?? "") &&
        block &&
        receipt.logs?.some(log => tokenEventMatchesLog(
          log,
          evidence.transactionHash,
          normalizeEvmAddress(evidence.contractOrMint ?? ""),
          evidence.toAddress,
          evidence.rawAmount,
          logIndex,
        )),
      );
    }
    return {
      exists: true, successful: true, canonical: transactionCanonical && hashCanonical && eventCanonical,
      confirmations, finalized: false, blockHash: block?.hash, blockTimestamp: block?.timestamp ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() : undefined,
    };
  }
}