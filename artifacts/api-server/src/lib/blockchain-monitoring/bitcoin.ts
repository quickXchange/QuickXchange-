import { createHash } from "node:crypto";
import { BlockchainMonitorError, sanitizedProviderError } from "./errors";
import { positiveInteger, providerHeaders, providerJson, requireEndpoint } from "./http";
import type {
  BlockchainMonitorAdapter, ChainHead, ConnectionResult, EvidenceStatus,
  IncomingEvidence, MonitorAsset, MonitorConfig, ScanCursor, ScanResult, WatchedAddress,
} from "./types";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const MAX_BLOCKS = 100;

function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}
function checksum(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes)).slice(0, 4);
}
function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}
function fromHex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return new Uint8Array();
  return new Uint8Array(Buffer.from(value, "hex"));
}
function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | undefined {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from) return undefined;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
  }
  if (pad) {
    if (bits) out.push((acc << (to - bits)) & max);
  } else if (bits >= from || ((acc << (to - bits)) & max) !== 0) return undefined;
  return out;
}
function polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= generators[i]!;
  }
  return chk >>> 0;
}
function hrpExpand(hrp: string): number[] {
  return [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
}

export type BitcoinAddress = { address: string; scriptPubKey: string; witnessVersion?: number };

/** Decode only Bitcoin Mainnet Base58Check and Bech32/Bech32m addresses. */
export function decodeBitcoinMainnetAddress(input: string): BitcoinAddress | undefined {
  const address = input.trim();
  if (!address || address.length > 90) return undefined;
  if (/^(?:bc1|BC1)/.test(address)) {
    if (address !== address.toLowerCase() && address !== address.toUpperCase()) return undefined;
    const lower = address.toLowerCase();
    const separator = lower.lastIndexOf("1");
    if (separator < 1 || separator + 7 > lower.length) return undefined;
    const hrp = lower.slice(0, separator);
    if (hrp !== "bc") return undefined;
    const values = [...lower.slice(separator + 1)].map((c) => BECH32.indexOf(c));
    if (values.some((v) => v < 0)) return undefined;
    const constant = polymod(hrpExpand(hrp).concat(values));
    const data = values.slice(0, -6);
    const version = data.shift();
    if (version === undefined || version > 16) return undefined;
    const program = convertBits(data, 5, 8, false);
    if (!program || program.length < 2 || program.length > 40) return undefined;
    if (version === 0 && (program.length !== 20 && program.length !== 32 || constant !== 1)) return undefined;
    if (version > 0 && constant !== 0x2bc830a3) return undefined;
    const opcode = version === 0 ? 0 : 0x50 + version;
    return { address, scriptPubKey: `${opcode.toString(16).padStart(2, "0")}${program.length.toString(16).padStart(2, "0")}${hex(new Uint8Array(program))}`, witnessVersion: version };
  }
  let value = 0n;
  for (const char of address) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return undefined;
    value = value * 58n + BigInt(digit);
  }
  const payload: number[] = [];
  while (value) { payload.unshift(Number(value & 255n)); value >>= 8n; }
  for (let i = 0; i < address.length && address[i] === "1"; i++) payload.unshift(0);
  if (payload.length !== 25) return undefined;
  const bytes = new Uint8Array(payload);
  if (hex(checksum(bytes.slice(0, 21))) !== hex(bytes.slice(21))) return undefined;
  const version = bytes[0];
  if (version === 0) return { address, scriptPubKey: `76a914${hex(bytes.slice(1, 21))}88ac` };
  if (version === 5) return { address, scriptPubKey: `a914${hex(bytes.slice(1, 21))}87` };
  return undefined;
}

export function bitcoinBtcToSatoshis(value: unknown): string | undefined {
  if (typeof value === "number") {
    const scaled = value * 100_000_000;
    const rounded = Math.round(scaled);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 21_000_000 ||
      !Number.isSafeInteger(rounded)
    ) return undefined;
    return String(rounded);
  }
  const text = typeof value === "string" ? value : "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(text)) return undefined;
  const [whole, fraction = ""] = text.split(".");
  try {
    const sats = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
    if (sats < 0n || sats > 2_100_000_000_000_000n) return undefined;
    return sats.toString();
  } catch { return undefined; }
}

type RpcResponse<T> = { result?: T; error?: unknown };
type Block = { hash?: string; height?: number; time?: number; confirmations?: number; tx?: Transaction[] };
type Transaction = { txid?: string; vin?: Array<{ txid?: string; vout?: number }>; vout?: Output[]; blockhash?: string; confirmations?: number; in_active_chain?: boolean; blocktime?: number; time?: number };
type Output = { n?: number; value?: number | string; scriptPubKey?: { hex?: string; address?: string; type?: string } };

function requireRpcResult<T>(response: RpcResponse<T>): T {
  if (response.error !== undefined || response.result === undefined) throw sanitizedProviderError("PROVIDER");
  return response.result;
}

export class BitcoinUtxoAdapter implements BlockchainMonitorAdapter {
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
    this.maxRange = Math.min(positiveInteger(config.maxRange, 8), MAX_BLOCKS);
  }
  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const remaining = this.config.deadlineAtMs === undefined ? this.timeoutMs : this.config.deadlineAtMs - Date.now();
    if (remaining <= 0) throw new BlockchainMonitorError("TIMEOUT", `Blockchain RPC ${method} timed out.`);
    try {
      return requireRpcResult(await providerJson<RpcResponse<T>>(this.endpoint, {
        method: "POST", headers: { "content-type": "application/json", ...this.headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }, Math.min(this.timeoutMs, remaining)));
    } catch (error) {
      if (error instanceof BlockchainMonitorError) throw error;
      throw new BlockchainMonitorError("PROVIDER", `Blockchain RPC ${method} failed.`);
    }
  }
  async testConnection(): Promise<ConnectionResult> {
    const started = Date.now();
    for (let attempt = 0; attempt < 2; attempt++) {
      const info = await this.rpc<{ chain?: string; blocks?: number; bestblockhash?: string }>("getblockchaininfo", []);
      if (info.chain !== "main" || !Number.isSafeInteger(info.blocks) || !info.bestblockhash) {
        throw new BlockchainMonitorError("PROVIDER", "Alchemy did not return Bitcoin Mainnet.");
      }
      const height = await this.rpc<number>("getblockcount", []);
      if (
        Number.isSafeInteger(height) &&
        height >= 0 &&
        height === info.blocks &&
        await this.rpc<string>("getblockhash", [height]) === info.bestblockhash
      ) {
        return { connected: true, head: String(height), chainId: "main", latencyMs: Date.now() - started };
      }
    }
    throw new BlockchainMonitorError("PROVIDER", "Bitcoin chain head changed during verification.");
  }
  async getHead(): Promise<ChainHead> {
    const height = await this.rpc<number>("getblockcount", []);
    if (!Number.isSafeInteger(height) || height < 0) throw new BlockchainMonitorError("PROVIDER", "Bitcoin provider returned an invalid height.");
    return { cursor: String(height), observedAt: new Date().toISOString() };
  }
  async scanIncoming(cursor: ScanCursor, watchedAddresses: WatchedAddress[]): Promise<ScanResult> {
    const from = Number(cursor.from); const to = Number(cursor.to);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to - from > this.maxRange) throw new BlockchainMonitorError("RANGE", "Bitcoin monitoring scan range is invalid.");
    const watched = watchedAddresses.flatMap((watch) => watch.assets.map((asset) => ({ watch, asset, decoded: decodeBitcoinMainnetAddress(watch.address) })));
    if (watched.some(({ asset, decoded }) => asset.kind !== "native" || asset.decimals !== 8 || Boolean(asset.contractOrMint) || !decoded)) throw new BlockchainMonitorError("CONFIGURATION", "Bitcoin monitoring requires valid Mainnet native assets and addresses.");
    const evidence: IncomingEvidence[] = [];
    for (let height = from; height <= to; height++) {
      const blockHash = await this.rpc<string>("getblockhash", [height]);
      const block = await this.rpc<Block>("getblock", [blockHash, 2]);
      if (block.hash !== blockHash || block.height !== height) {
        throw new BlockchainMonitorError("PROVIDER", "Bitcoin block changed during the scan.");
      }
      for (const tx of block.tx ?? []) {
        if (!tx.txid) continue;
        for (const output of tx.vout ?? []) {
          const script = output.scriptPubKey?.hex?.toLowerCase();
          const amount = bitcoinBtcToSatoshis(output.value);
          if (!script || !amount || amount === "0" || output.n === undefined) continue;
          for (const item of watched) {
            if (item.decoded!.scriptPubKey !== script) continue;
            const confirmations = Math.max(0, block.confirmations ?? 0);
            evidence.push({
              eventId: `${tx.txid}:${output.n}:${item.asset.assetId}`, transactionHash: tx.txid, networkCode: this.networkCode,
              assetId: item.asset.assetId, assetSymbol: item.asset.symbol, identityKind: "native", toAddress: item.watch.address,
              rawAmount: amount, decimals: 8, blockOrSlot: String(height), blockHash, blockTimestamp: block.time ? new Date(block.time * 1000).toISOString() : undefined,
              confirmations: String(confirmations), detectedAt: new Date().toISOString(), source: "bitcoin-json-rpc",
            });
          }
        }
      }
    }
    const unique = new Map(evidence.map((item) => [item.eventId, item]));
    return { cursor: { from: String(from), to: String(to) }, evidence: [...unique.values()] };
  }
  async getEvidenceStatus(evidence: IncomingEvidence): Promise<EvidenceStatus> {
    const height = Number(evidence.blockOrSlot);
    if (!Number.isSafeInteger(height) || height < 0 || !evidence.blockHash) {
      return { exists: false, successful: false, canonical: false, confirmations: 0, finalized: false };
    }
    const canonicalHash = await this.rpc<string>("getblockhash", [height]);
    if (canonicalHash !== evidence.blockHash) {
      return { exists: false, successful: false, canonical: false, confirmations: 0, finalized: false, blockHash: canonicalHash };
    }
    const block = await this.rpc<Block>("getblock", [canonicalHash, 2]);
    const [txid, voutText, eventAssetId, extra] = evidence.eventId.split(":");
    const vout = Number(voutText);
    const identityValid =
      !extra &&
      txid === evidence.transactionHash &&
      eventAssetId === evidence.assetId &&
      /^[0-9a-f]{64}$/i.test(txid ?? "") &&
      Number.isSafeInteger(vout) &&
      vout >= 0;
    const tx = identityValid
      ? (block.tx ?? []).find((candidate) => candidate.txid === txid)
      : undefined;
    const output = tx?.vout?.find((candidate) => candidate.n === vout);
    const expected = decodeBitcoinMainnetAddress(evidence.toAddress);
    const exists = Boolean(block.hash === canonicalHash && tx && output && expected && output.scriptPubKey?.hex?.toLowerCase() === expected.scriptPubKey && bitcoinBtcToSatoshis(output.value) === evidence.rawAmount);
    const lookup = exists && txid
      ? await this.rpc<Transaction | null>("getrawtransaction", [txid, true, canonicalHash])
      : null;
    const blockConfirmations = Math.max(0, block.confirmations ?? 0);
    const transactionConfirmations = Math.max(0, lookup?.confirmations ?? 0);
    const confirmations = exists
      ? Math.min(blockConfirmations, transactionConfirmations)
      : 0;
    const canonical =
      exists &&
      lookup?.blockhash === canonicalHash &&
      lookup.in_active_chain === true &&
      confirmations > 0;
    return {
      exists,
      successful: exists,
      canonical,
      confirmations,
      finalized: canonical && confirmations >= (this.config.confirmationsRequired ?? 0),
      blockHash: canonicalHash,
      blockTimestamp: block.time ? new Date(block.time * 1000).toISOString() : undefined,
    };
  }
}