import { BlockchainMonitorError } from "./errors";
import { createHash } from "node:crypto";
import { positiveInteger, providerHeaders, providerJson, requireEndpoint } from "./http";
import type {
  BlockchainMonitorAdapter, ChainHead, ConnectionResult, IncomingEvidence,
  MonitorAsset, MonitorConfig, ScanCursor, ScanResult, WatchedAddress,
} from "./types";

type TronNativeRecord = {
  txID?: string; block?: number; block_timestamp?: number;
  raw_data?: { contract?: Array<{ type?: string; parameter?: { value?: { owner_address?: string; to_address?: string; amount?: number | string } } }> };
  ret?: Array<{ contractRet?: string }>;
};
type TronTokenRecord = {
  transaction_id?: string; block_timestamp?: number; block?: number;
  from?: string; to?: string; value?: string;
  token_info?: { address?: string; symbol?: string; decimals?: number };
  ret?: Array<{ contractRet?: string }>;
};

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function exactPositiveInteger(value: unknown): string | undefined {
  if (typeof value === "string") return /^[1-9][0-9]*$/.test(value) ? value : undefined;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
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

export function parseTronNativeTransfer(
  record: TronNativeRecord,
  networkCode: string,
  watched: WatchedAddress,
  asset: MonitorAsset,
): IncomingEvidence | undefined {
  const value = record.raw_data?.contract?.[0]?.parameter?.value;
  const to = normalizeTronAddress(value?.to_address ?? "");
  const rawAmount = exactPositiveInteger(value?.amount);
  if (asset.kind !== "native" || !record.txID || !to || to !== normalizeTronAddress(watched.address) || !rawAmount || record.ret?.[0]?.contractRet !== "SUCCESS") return undefined;
  return {
    eventId: `${record.txID}:native:${asset.assetId}`,
    transactionHash: record.txID,
    networkCode, assetId: asset.assetId, assetSymbol: asset.symbol,
    identityKind: asset.kind,
    fromAddress: normalizeTronAddress(value?.owner_address ?? "") || undefined,
    toAddress: to, rawAmount, decimals: asset.decimals,
    blockOrSlot: String(record.block ?? ""),
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
  if (asset.kind !== "token" || !contract || contract !== tokenContract || !record.transaction_id || to !== normalizeTronAddress(watched.address) || !/^[0-9]+$/.test(record.value ?? "") || record.value === "0" || record.ret?.[0]?.contractRet !== "SUCCESS") return undefined;
  return {
    eventId: `${record.transaction_id}:trc20:${contract}:${asset.assetId}`,
    transactionHash: record.transaction_id,
    networkCode, assetId: asset.assetId, assetSymbol: asset.symbol,
    identityKind: asset.kind,
    contractOrMint: contract, fromAddress: normalizeTronAddress(record.from ?? "") || undefined,
    toAddress: to, rawAmount: record.value!, decimals: asset.decimals,
    blockOrSlot: String(record.block ?? ""), blockTimestamp: record.block_timestamp ? new Date(record.block_timestamp).toISOString() : undefined,
    detectedAt: new Date().toISOString(), source: "tron-indexer",
  };
}

export class TronIndexerAdapter implements BlockchainMonitorAdapter {
  readonly networkCode: string;
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRange: number;

  constructor(private readonly config: MonitorConfig) {
    this.networkCode = config.networkCode;
    this.endpoint = requireEndpoint(config.endpoint);
    this.headers = providerHeaders(config.apiKey, config.apiKeyHeader ?? "TRON-PRO-API-KEY");
    this.timeoutMs = positiveInteger(config.requestTimeoutMs, 15_000);
    this.maxRange = positiveInteger(config.maxRange, 10_000_000);
  }

  private async get<T>(path: string): Promise<T> {
    return providerJson<T>(`${this.endpoint}${path}`, { headers: this.headers }, this.timeoutMs);
  }

  async testConnection(): Promise<ConnectionResult> {
    const started = Date.now();
    const head = await this.get<{ block_header?: { raw_data?: { number?: number } } }>("/wallet/getnowblock");
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
      const nativeAssets = watched.assets.filter(asset => asset.kind === "native");
      const tokenAssets = watched.assets.filter(asset => asset.kind === "token");
      if (nativeAssets.length) {
        const records = await this.get<{ data?: TronNativeRecord[] }>(`/v1/accounts/${encodeURIComponent(address)}/transactions?only_to=true&limit=200`);
        for (const record of records.data ?? []) {
          if (Number(record.block ?? -1) < from || Number(record.block ?? -1) > to) continue;
          for (const asset of nativeAssets) {
            const parsed = parseTronNativeTransfer(record, this.networkCode, watched, asset);
            if (parsed) evidence.push(parsed);
          }
        }
      }
      for (const asset of tokenAssets) {
        const records = await this.get<{ data?: TronTokenRecord[] }>(`/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?only_to=true&limit=200${asset.contractOrMint ? `&contract_address=${encodeURIComponent(asset.contractOrMint)}` : ""}`);
        for (const record of records.data ?? []) {
          if (Number(record.block ?? -1) < from || Number(record.block ?? -1) > to) continue;
          const execution = await this.get<{ ret?: Array<{ contractRet?: string }>; blockNumber?: number; id?: string }>(`/wallet/gettransactionbyid?value=${encodeURIComponent(record.transaction_id ?? "")}`);
          const verified = { ...record, ret: execution.ret, block: execution.blockNumber ?? record.block };
          const parsed = parseTronTokenTransfer(verified, this.networkCode, watched, asset);
          if (parsed) evidence.push(parsed);
        }
      }
    }
    return { cursor: { from: String(from), to: String(to) }, evidence };
  }

  async getEvidenceStatus(evidence: IncomingEvidence) {
    const record = await this.get<TronNativeRecord>(`/wallet/gettransactionbyid?value=${encodeURIComponent(evidence.transactionHash)}`);
    const success = record.ret?.[0]?.contractRet === "SUCCESS";
    const block = await this.get<{ blockID?: string }>(`/wallet/getblockbynum?num=${encodeURIComponent(evidence.blockOrSlot)}`);
    const head = await this.get<{ block_header?: { raw_data?: { number?: number } } }>("/wallet/getnowblock");
    const confirmations = success && Number.isSafeInteger(head.block_header?.raw_data?.number) && Number.isSafeInteger(Number(evidence.blockOrSlot))
      ? Math.max(0, Number(head.block_header!.raw_data!.number) - Number(evidence.blockOrSlot) + 1) : 0;
    return { exists: Boolean(record.txID), successful: success, canonical: success && Boolean(block.blockID) && (!evidence.blockHash || block.blockID === evidence.blockHash), confirmations, finalized: false, blockHash: block.blockID, blockTimestamp: evidence.blockTimestamp };
  }
}