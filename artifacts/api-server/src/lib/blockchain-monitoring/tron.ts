import { BlockchainMonitorError } from "./errors";
import { createHash } from "node:crypto";
import { positiveInteger, providerHeaders, providerJson, requireEndpoint } from "./http";
import type {
  BlockchainMonitorAdapter, ChainHead, ConnectionResult, IncomingEvidence,
  MonitorAsset, MonitorConfig, ScanCursor, ScanResult, WatchedAddress,
} from "./types";

type TronNativeRecord = {
  txID?: string; block?: number; blockNumber?: number; block_timestamp?: number;
  blockHash?: string; contractIndex?: number;
  raw_data?: { contract?: Array<{ type?: string; parameter?: { value?: { owner_address?: string; to_address?: string; amount?: number | string } } }> };
  ret?: Array<{ contractRet?: string }>;
};
type TronTokenRecord = {
  transaction_id?: string; block_timestamp?: number; block?: number;
  blockHash?: string; eventIndex?: number;
  from?: string; to?: string; value?: string;
  token_info?: { address?: string; symbol?: string; decimals?: number };
  ret?: Array<{ contractRet?: string }>;
};
type TronTransactionInfo = {
  id?: string;
  blockNumber?: number;
  blockTimeStamp?: number;
  receipt?: { result?: string };
  log?: Array<{ address?: string; topics?: string[]; data?: string }>;
};
type TronBlock = {
  blockID?: string;
  block_header?: { raw_data?: { number?: number; timestamp?: number } };
  transactions?: Array<{ txID?: string }>;
};
type TronIndexerPage<T> = {
  data?: T[];
  meta?: { fingerprint?: string };
};
type TronRpcResponse<T> = {
  jsonrpc?: unknown;
  id?: unknown;
  result?: T;
  error?: unknown;
};

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TRON_INDEXER_MIN_REQUEST_INTERVAL_MS = 350;
const TRANSFER_EVENT_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function exactPositiveInteger(value: unknown): string | undefined {
  if (typeof value === "string") return /^[1-9][0-9]*$/.test(value) ? value : undefined;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
}

function normalizeTronLogAddress(value: string): string {
  const hex = value.replace(/^0x/i, "");
  return normalizeTronAddress(hex.length === 40 ? `41${hex}` : hex);
}

function normalizeTronTopicAddress(value: string): string {
  const hex = value.replace(/^0x/i, "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) return "";
  return normalizeTronAddress(`41${hex.slice(-40)}`);
}

function tronLogAmount(value: string): string | undefined {
  const hex = value.replace(/^0x/i, "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) return undefined;
  const amount = BigInt(`0x${hex}`).toString();
  return amount === "0" ? undefined : amount;
}

function findTronTokenLogIndex(
  transaction: TronTransactionInfo,
  record: TronTokenRecord,
  contract: string,
  usedIndexes: Set<number>,
): number | undefined {
  const from = normalizeTronAddress(record.from ?? "");
  const to = normalizeTronAddress(record.to ?? "");
  for (const [index, log] of (transaction.log ?? []).entries()) {
    if (usedIndexes.has(index) || log.topics?.[0]?.replace(/^0x/i, "").toLowerCase() !== TRANSFER_EVENT_TOPIC) continue;
    if (normalizeTronLogAddress(log.address ?? "") !== contract) continue;
    if (normalizeTronTopicAddress(log.topics?.[1] ?? "") !== from) continue;
    if (normalizeTronTopicAddress(log.topics?.[2] ?? "") !== to) continue;
    if (tronLogAmount(log.data ?? "") !== record.value) continue;
    return index;
  }
  return undefined;
}

function nativeContractIndex(eventId: string): number | undefined {
  const match = eventId.match(/:native:([0-9]+):/);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : undefined;
}

function base58Decode(value: string): Uint8Array | undefined {
  let number = 0n;
  for (const character of value) {
    const index = BASE58.indexOf(character);
    if (index < 0) return undefined;
    number = number * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  for (const character of value) if (character === "1") bytes.unshift(0); else break;
  return Uint8Array.from(bytes);
}

function base58Encode(value: Uint8Array): string {
  let number = BigInt(`0x${Buffer.from(value).toString("hex")}`);
  let encoded = "";
  while (number > 0n) {
    encoded = BASE58[Number(number % 58n)] + encoded;
    number /= 58n;
  }
  for (const byte of value) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded || "1";
}

export function normalizeTronAddress(value: string): string {
  const trimmed = value.trim();
  if (/^41[0-9a-f]{40}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (!trimmed.startsWith("T")) return "";
  const bytes = base58Decode(trimmed);
  if (!bytes || bytes.length !== 25) return "";
  // Tron Base58Check values contain version + payload + four checksum bytes.
  const payload = bytes.slice(0, 21);
  const checksum = bytes.slice(21);
  const digest = (value: Uint8Array) =>
    createHash("sha256").update(value).digest();
  const expected = digest(digest(payload)).subarray(0, 4);
  if (!expected.every((byte, index) => byte === checksum[index])) return "";
  return [...payload].map(byte => byte.toString(16).padStart(2, "0")).join("").toLowerCase();
}

export function serializeTronIndexerAddress(value: string): string {
  const normalized = normalizeTronAddress(value);
  if (!normalized) return "";
  const payload = Buffer.from(normalized, "hex");
  const checksum = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest()
    .subarray(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}

export function parseTronNativeTransfer(
  record: TronNativeRecord,
  networkCode: string,
  watched: WatchedAddress,
  asset: MonitorAsset,
): IncomingEvidence | undefined {
  const contractIndex = record.contractIndex ?? 0;
  const contract = record.raw_data?.contract?.[contractIndex];
  const value = contract?.parameter?.value;
  const to = normalizeTronAddress(value?.to_address ?? "");
  const rawAmount = exactPositiveInteger(value?.amount);
  if (asset.kind !== "native" || contract?.type !== "TransferContract" || !record.txID || !to || to !== normalizeTronAddress(watched.address) || !rawAmount || record.ret?.[contractIndex]?.contractRet !== "SUCCESS") return undefined;
  return {
    eventId: `${record.txID}:native:${contractIndex}:${asset.assetId}`,
    transactionHash: record.txID,
    networkCode, assetId: asset.assetId, assetSymbol: asset.symbol,
    identityKind: asset.kind,
    fromAddress: normalizeTronAddress(value?.owner_address ?? "") || undefined,
    toAddress: to, rawAmount, decimals: asset.decimals,
    blockOrSlot: String(record.block ?? record.blockNumber ?? ""),
    blockHash: record.blockHash,
    blockTimestamp: record.block_timestamp ? new Date(record.block_timestamp).toISOString() : undefined,
    detectedAt: new Date().toISOString(), source: "tron-indexer",
  };
}

export function parseTronTokenTransfer(
  record: TronTokenRecord,
  networkCode: string,
  watched: WatchedAddress,
  asset: MonitorAsset,
): IncomingEvidence | undefined {
  const contract = normalizeTronAddress(asset.contractOrMint ?? "");
  const tokenContract = normalizeTronAddress(record.token_info?.address ?? "");
  const to = normalizeTronAddress(record.to ?? "");
  if (asset.kind !== "token" || !contract || contract !== tokenContract || !record.transaction_id || !Number.isSafeInteger(record.eventIndex) || record.eventIndex! < 0 || to !== normalizeTronAddress(watched.address) || !/^[0-9]+$/.test(record.value ?? "") || record.value === "0" || record.ret?.[0]?.contractRet !== "SUCCESS") return undefined;
  if (!Number.isSafeInteger(record.token_info?.decimals) || record.token_info?.decimals !== asset.decimals) return undefined;
  return {
    eventId: `${record.transaction_id}:trc20:${record.eventIndex}:${contract}:${asset.assetId}`,
    transactionHash: record.transaction_id,
    networkCode, assetId: asset.assetId, assetSymbol: asset.symbol,
    identityKind: asset.kind,
    contractOrMint: contract, fromAddress: normalizeTronAddress(record.from ?? "") || undefined,
    toAddress: to, rawAmount: record.value!, decimals: asset.decimals,
    blockOrSlot: String(record.block ?? ""), blockHash: record.blockHash,
    blockTimestamp: record.block_timestamp ? new Date(record.block_timestamp).toISOString() : undefined,
    detectedAt: new Date().toISOString(), source: "tron-indexer",
  };
}

export class TronIndexerAdapter implements BlockchainMonitorAdapter {
  readonly networkCode: string;
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRange: number;
  private requestGate: Promise<void> = Promise.resolve();
  private lastRequestStartedAt = 0;

  constructor(private readonly config: MonitorConfig) {
    this.networkCode = config.networkCode;
    this.endpoint = requireEndpoint(config.endpoint);
    this.headers = providerHeaders(config.apiKey, config.apiKeyHeader ?? "TRON-PRO-API-KEY");
    this.timeoutMs = positiveInteger(config.requestTimeoutMs, 15_000);
    this.maxRange = positiveInteger(config.maxRange, 10_000_000);
  }

  private async get<T>(path: string): Promise<T> {
    let release!: () => void;
    const previous = this.requestGate;
    this.requestGate = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const waitMs = Math.max(
        0,
        TRON_INDEXER_MIN_REQUEST_INTERVAL_MS - (Date.now() - this.lastRequestStartedAt),
      );
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.lastRequestStartedAt = Date.now();
      return await providerJson<T>(
        `${this.endpoint}${path}`,
        { headers: this.headers },
        this.timeoutMs,
      );
    } finally {
      release();
    }
  }

  async testConnection(): Promise<ConnectionResult> {
    const started = Date.now();
    const [identity, head] = await Promise.all([
      providerJson<TronRpcResponse<unknown>>(
        `${this.endpoint}/jsonrpc`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...this.headers },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        },
        this.timeoutMs,
      ),
      this.get<{ block_header?: { raw_data?: { number?: number } } }>("/wallet/getnowblock"),
    ]);
    if (
      !identity ||
      typeof identity !== "object" ||
      identity.jsonrpc !== "2.0" ||
      identity.id !== 1 ||
      identity.error !== undefined ||
      identity.result !== "0x2b6653dc"
    ) {
      throw new BlockchainMonitorError("PROVIDER", "Blockchain monitoring provider returned an unexpected network.");
    }
    const number = head.block_header?.raw_data?.number;
    if (!Number.isSafeInteger(number)) throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain monitoring provider returned an invalid head.");
    return { connected: true, head: String(number), latencyMs: Date.now() - started };
  }

  async getHead(): Promise<ChainHead> {
    const result = await this.get<{ block_header?: { raw_data?: { number?: number } } }>("/wallet/getnowblock");
    const number = result.block_header?.raw_data?.number;
    if (!Number.isSafeInteger(number)) throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain monitoring provider returned an invalid head.");
    return { cursor: String(number), observedAt: new Date().toISOString() };
  }

  async scanIncoming(cursor: ScanCursor, watchedAddresses: WatchedAddress[]): Promise<ScanResult> {
    const from = Number(cursor.from); const to = Number(cursor.to);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to - from > this.maxRange) {
      throw new BlockchainMonitorError("RANGE", "Blockchain monitoring scan range is invalid.");
    }
    const evidence: IncomingEvidence[] = [];
    for (const watched of watchedAddresses) {
      const address = watched.address;
      const indexerAddress = serializeTronIndexerAddress(address);
      if (!indexerAddress) {
        throw new BlockchainMonitorError("CONFIGURATION", "Blockchain monitoring receiving address is invalid.");
      }
      const nativeAssets = watched.assets.filter(asset => asset.kind === "native");
      const tokenAssets = watched.assets.filter(asset => asset.kind === "token");
      if (nativeAssets.length) {
        const [fromBlock, toBlock] = await Promise.all([
          this.get<TronBlock>(`/wallet/getblockbynum?num=${encodeURIComponent(String(from))}`),
          this.get<TronBlock>(`/wallet/getblockbynum?num=${encodeURIComponent(String(to))}`),
        ]);
        const minTimestamp = fromBlock.block_header?.raw_data?.timestamp;
        const maxTimestamp = toBlock.block_header?.raw_data?.timestamp;
        if (!Number.isSafeInteger(minTimestamp) || !Number.isSafeInteger(maxTimestamp)) {
          throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain monitoring provider returned invalid scan boundary blocks.");
        }
        let fingerprint: string | undefined;
        const seenFingerprints = new Set<string>();
        const rawTransactionCache = new Map<string, TronNativeRecord>();
        const transactionInfoCache = new Map<string, TronTransactionInfo>();
        const canonicalBlockCache = new Map<number, TronBlock>();
        let pageCount = 0;
        do {
          if (pageCount >= 100) {
            throw new BlockchainMonitorError("RANGE", "Blockchain monitoring provider pagination exceeded the bounded scan limit.");
          }
          const query = new URLSearchParams({
            only_to: "true",
            limit: "200",
            min_timestamp: String(minTimestamp),
            max_timestamp: String(maxTimestamp),
          });
          if (fingerprint) query.set("fingerprint", fingerprint);
          const page = await this.get<TronIndexerPage<TronNativeRecord>>(
            `/v1/accounts/${encodeURIComponent(indexerAddress)}/transactions?${query.toString()}`,
          );
          pageCount += 1;
          for (const record of page.data ?? []) {
            if (!record.txID) continue;
            let rawTransaction = rawTransactionCache.get(record.txID);
            if (!rawTransaction) {
              rawTransaction = await this.get<TronNativeRecord>(
                `/wallet/gettransactionbyid?value=${encodeURIComponent(record.txID)}`,
              );
              rawTransactionCache.set(record.txID, rawTransaction);
            }
            let transactionInfo = transactionInfoCache.get(record.txID);
            if (!transactionInfo) {
              transactionInfo = await this.get<TronTransactionInfo>(
                `/wallet/gettransactioninfobyid?value=${encodeURIComponent(record.txID)}`,
              );
              transactionInfoCache.set(record.txID, transactionInfo);
            }
            if (rawTransaction.txID !== record.txID || transactionInfo.id !== record.txID) continue;
            const block = transactionInfo.blockNumber;
            if (!Number.isSafeInteger(block) || block! < from || block! > to) continue;
            let canonicalBlock = canonicalBlockCache.get(block!);
            if (!canonicalBlock) {
              canonicalBlock = await this.get<TronBlock>(
                `/wallet/getblockbynum?num=${encodeURIComponent(String(block))}`,
              );
              canonicalBlockCache.set(block!, canonicalBlock);
            }
            if (
              !canonicalBlock.blockID ||
              !canonicalBlock.transactions?.some(item => item.txID === record.txID)
            ) continue;
            for (const [contractIndex] of (rawTransaction.raw_data?.contract ?? []).entries()) {
              for (const asset of nativeAssets) {
                const parsed = parseTronNativeTransfer(
                  {
                    ...rawTransaction,
                    block: block!,
                    block_timestamp: transactionInfo.blockTimeStamp ?? record.block_timestamp,
                    blockHash: canonicalBlock.blockID,
                    contractIndex,
                  },
                  this.networkCode,
                  watched,
                  asset,
                );
                if (parsed) evidence.push(parsed);
              }
            }
          }
          const nextFingerprint = page.meta?.fingerprint;
          if (!nextFingerprint) break;
          if (seenFingerprints.has(nextFingerprint)) {
            throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain monitoring provider repeated a pagination cursor.");
          }
          seenFingerprints.add(nextFingerprint);
          fingerprint = nextFingerprint;
        }
        while (fingerprint);
      }
      for (const asset of tokenAssets) {
        const contractAddress = serializeTronIndexerAddress(asset.contractOrMint ?? "");
        if (!contractAddress) {
          throw new BlockchainMonitorError("CONFIGURATION", "Blockchain monitoring token identity is invalid.");
        }
        const [fromBlock, toBlock] = await Promise.all([
          this.get<TronBlock>(`/wallet/getblockbynum?num=${encodeURIComponent(String(from))}`),
          this.get<TronBlock>(`/wallet/getblockbynum?num=${encodeURIComponent(String(to))}`),
        ]);
        const minTimestamp = fromBlock.block_header?.raw_data?.timestamp;
        const maxTimestamp = toBlock.block_header?.raw_data?.timestamp;
        if (!Number.isSafeInteger(minTimestamp) || !Number.isSafeInteger(maxTimestamp)) {
          throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain monitoring provider returned invalid scan boundary blocks.");
        }

        let fingerprint: string | undefined;
        const seenFingerprints = new Set<string>();
        const transactionCache = new Map<string, TronTransactionInfo>();
        const canonicalBlockCache = new Map<number, TronBlock>();
        const usedLogIndexes = new Map<string, Set<number>>();
        let pageCount = 0;
        do {
          if (pageCount >= 100) {
            throw new BlockchainMonitorError("RANGE", "Blockchain monitoring provider pagination exceeded the bounded scan limit.");
          }
          const query = new URLSearchParams({
            only_to: "true",
            limit: "200",
            min_timestamp: String(minTimestamp),
            max_timestamp: String(maxTimestamp),
            contract_address: contractAddress,
          });
          if (fingerprint) query.set("fingerprint", fingerprint);
          const page = await this.get<TronIndexerPage<TronTokenRecord>>(
            `/v1/accounts/${encodeURIComponent(indexerAddress)}/transactions/trc20?${query.toString()}`,
          );
          pageCount += 1;

          for (const record of page.data ?? []) {
            if (!record.transaction_id) continue;
            let transaction = transactionCache.get(record.transaction_id);
            if (!transaction) {
              transaction = await this.get<TronTransactionInfo>(
                `/wallet/gettransactioninfobyid?value=${encodeURIComponent(record.transaction_id)}`,
              );
              transactionCache.set(record.transaction_id, transaction);
            }
            const block = transaction.blockNumber;
            if (!Number.isSafeInteger(block) || block! < from || block! > to) continue;
            let canonicalBlock = canonicalBlockCache.get(block!);
            if (!canonicalBlock) {
              canonicalBlock = await this.get<TronBlock>(
                `/wallet/getblockbynum?num=${encodeURIComponent(String(block))}`,
              );
              canonicalBlockCache.set(block!, canonicalBlock);
            }
            const canonical = Boolean(canonicalBlock.blockID) &&
              canonicalBlock.transactions?.some(item => item.txID === record.transaction_id);
            if (!canonical) continue;
            const usedIndexes = usedLogIndexes.get(record.transaction_id) ?? new Set<number>();
            const eventIndex = findTronTokenLogIndex(
              transaction,
              record,
              normalizeTronAddress(asset.contractOrMint ?? ""),
              usedIndexes,
            );
            if (!Number.isSafeInteger(eventIndex)) continue;
            const verified = {
              ...record,
              block,
              blockHash: canonicalBlock.blockID,
              eventIndex,
              block_timestamp: transaction.blockTimeStamp ?? record.block_timestamp,
              ret: [{ contractRet: transaction.receipt?.result }],
            };
            const parsed = parseTronTokenTransfer(verified, this.networkCode, watched, asset);
            if (parsed) {
              usedIndexes.add(eventIndex!);
              usedLogIndexes.set(record.transaction_id, usedIndexes);
              evidence.push(parsed);
            }
          }

          const nextFingerprint = page.meta?.fingerprint;
          if (!nextFingerprint) break;
          if (seenFingerprints.has(nextFingerprint)) {
            throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain monitoring provider repeated a pagination cursor.");
          }
          seenFingerprints.add(nextFingerprint);
          fingerprint = nextFingerprint;
        }
        while (fingerprint);
      }
    }
    return { cursor: { from: String(from), to: String(to) }, evidence };
  }

  async getEvidenceStatus(evidence: IncomingEvidence) {
    const transaction = await this.get<TronTransactionInfo>(
      `/wallet/gettransactioninfobyid?value=${encodeURIComponent(evidence.transactionHash)}`,
    );
    const nativeTransaction = evidence.identityKind === "native"
      ? await this.get<TronNativeRecord>(
          `/wallet/gettransactionbyid?value=${encodeURIComponent(evidence.transactionHash)}`,
        )
      : undefined;
    const contractIndex = evidence.identityKind === "native"
      ? nativeContractIndex(evidence.eventId)
      : undefined;
    const transactionMatches = transaction.id === evidence.transactionHash;
    const nativeTransactionMatches = evidence.identityKind !== "native" ||
      nativeTransaction?.txID === evidence.transactionHash;
    const success = evidence.identityKind === "native"
      ? transactionMatches &&
        nativeTransactionMatches &&
        Number.isSafeInteger(contractIndex) &&
        nativeTransaction?.ret?.[contractIndex!]?.contractRet === "SUCCESS"
      : transactionMatches && transaction.receipt?.result === "SUCCESS";
    const blockNumber = transaction.blockNumber;
    const block = Number.isSafeInteger(blockNumber)
      ? await this.get<TronBlock>(`/wallet/getblockbynum?num=${encodeURIComponent(String(blockNumber))}`)
      : undefined;
    const head = await this.get<{ block_header?: { raw_data?: { number?: number } } }>("/wallet/getnowblock");
    const canonical = success &&
      blockNumber === Number(evidence.blockOrSlot) &&
      Boolean(block?.blockID) &&
      block?.transactions?.some(item => item.txID === evidence.transactionHash) === true &&
      (!evidence.blockHash || block.blockID === evidence.blockHash);
    const confirmations = canonical && Number.isSafeInteger(head.block_header?.raw_data?.number)
      ? Math.max(0, Number(head.block_header!.raw_data!.number) - blockNumber! + 1) : 0;
    return {
      exists: evidence.identityKind === "native"
        ? transactionMatches && nativeTransactionMatches
        : transactionMatches,
      successful: success,
      canonical,
      confirmations,
      finalized: false,
      blockHash: block?.blockID,
      blockTimestamp: transaction.blockTimeStamp
        ? new Date(transaction.blockTimeStamp).toISOString()
        : evidence.blockTimestamp,
    };
  }
}