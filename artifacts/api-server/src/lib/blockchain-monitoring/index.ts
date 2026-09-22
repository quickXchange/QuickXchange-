export * from "./errors";
export * from "./types";
export * from "./evm";
export * from "./tron";
export * from "./solana";

import { EvmJsonRpcAdapter } from "./evm";
import { TronIndexerAdapter } from "./tron";
import { SolanaJsonRpcAdapter } from "./solana";
import { BlockchainMonitorError } from "./errors";
import type { BlockchainMonitorAdapter, MonitorConfig } from "./types";

export function createBlockchainMonitorAdapter(config: MonitorConfig): BlockchainMonitorAdapter {
  if (config.adapterKind === "tron") return new TronIndexerAdapter(config);
  if (config.adapterKind === "solana") return new SolanaJsonRpcAdapter(config);
  if (config.adapterKind === "evm") return new EvmJsonRpcAdapter(config);
  throw new BlockchainMonitorError("CONFIGURATION", "No blockchain monitoring adapter is available for this network.");
}