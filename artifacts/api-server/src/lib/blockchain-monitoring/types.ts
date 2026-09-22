export type MonitoringProvider = "rpc" | "indexer";
export type AssetKind = "native" | "token";

export type MonitorAsset = {
  assetId: string;
  symbol: string;
  kind: AssetKind;
  /** EVM token contract or Solana mint. Never infer this from a symbol. */
  contractOrMint?: string;
  decimals: number;
};

export type WatchedAddress = {
  address: string;
  memoOrTag?: string;
  assets: MonitorAsset[];
};

export type ScanCursor = {
  from: string;
  to: string;
};

export type MonitorConfig = {
  networkCode: string;
  adapterKind?: "evm" | "tron" | "solana" | "bitcoin";
  provider: MonitoringProvider;
  endpoint: string;
  /** Passed at runtime only. Never persist, serialize, or return it. */
  apiKey?: string;
  /** Provider-specific header name, e.g. TRON-PRO-API-KEY. */
  apiKeyHeader?: string;
  chainId?: string;
  confirmationsRequired?: number;
  requestTimeoutMs?: number;
  /** Internal absolute deadline shared by all requests in one leased cycle. */
  deadlineAtMs?: number;
  /** Internal structured RPC trace sink. It must never receive endpoint or credential values. */
  rpcTrace?: (event: {
    networkCode: string;
    method: string;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    timeoutMs: number;
    outcome: "started" | "success" | "failure" | "timeout";
    errorCategory?: string;
  }) => void;
  maxRange?: number;
};

export type ConnectionResult = {
  connected: boolean;
  head: string;
  chainId?: string;
  latencyMs: number;
};

export type ChainHead = {
  cursor: string;
  observedAt: string;
};

export type IncomingEvidence = {
  eventId: string;
  transactionHash: string;
  networkCode: string;
  assetId: string;
  assetSymbol: string;
  identityKind?: AssetKind;
  contractOrMint?: string;
  fromAddress?: string;
  toAddress: string;
  rawAmount: string;
  decimals: number;
  blockOrSlot: string;
  blockHash?: string;
  blockTimestamp?: string;
  confirmations?: string;
  memoOrTag?: string;
  detectedAt: string;
  /** Adapter-specific immutable facts useful for audit/debugging. */
  source: "evm-json-rpc" | "tron-indexer" | "solana-json-rpc" | "bitcoin-json-rpc";
};

export type EvidenceStatus = {
  exists: boolean;
  successful: boolean;
  canonical: boolean;
  confirmations: number;
  finalized: boolean;
  blockHash?: string;
  blockTimestamp?: string;
};

export type ScanResult = {
  cursor: ScanCursor;
  evidence: IncomingEvidence[];
};

export interface BlockchainMonitorAdapter {
  readonly networkCode: string;
  testConnection(): Promise<ConnectionResult>;
  getHead(): Promise<ChainHead>;
  scanIncoming(
    cursor: ScanCursor,
    watchedAddresses: WatchedAddress[],
  ): Promise<ScanResult>;
  getEvidenceStatus(evidence: IncomingEvidence): Promise<EvidenceStatus>;
}