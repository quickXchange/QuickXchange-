import { BlockchainMonitorError } from "./errors";

/** Exact contract/recipient filters only. Never replace a rejected read with []. */
export async function queryEvmLogs<T>(
  rpc: (filter: Record<string, unknown>) => Promise<T[]>,
  contract: string,
  recipients: string[],
  from: number,
  to: number,
  transferTopic: string,
  budget = { remaining: 64 },
): Promise<T[]> {
  if (--budget.remaining < 0) {
    throw new BlockchainMonitorError("RANGE", "Blockchain token scan exhausted its bounded query budget.");
  }
  try {
    const logs = await rpc({
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
      address: contract,
      topics: [transferTopic, null, recipients.length === 1 ? recipients[0] : recipients],
    });
    if (!Array.isArray(logs)) {
      throw new BlockchainMonitorError("INVALID_RESPONSE", "Blockchain token scan returned invalid logs.");
    }
    return logs;
  } catch (error) {
    if (!(error instanceof BlockchainMonitorError) || error.code !== "PROVIDER") throw error;
    // Only filter/range rejection permits narrower retries. No timeout, quota,
    // authorization or network failure is treated as a successful empty scan.
    const details = error.providerFailure;
    if (details?.reason === "quota_exhausted" || details?.reason === "rate_limited" ||
      details?.reason === "unauthorized" || details?.reason === "forbidden") throw error;
    const filterRejected = details?.rpcCode === -32602;
    const rangeRejected = details?.reason === "range_limited";
    if (!filterRejected && !rangeRejected) throw error;
    if (recipients.length > 1) {
      const middle = Math.floor(recipients.length / 2);
      const left = await queryEvmLogs<T>(rpc, contract, recipients.slice(0, middle), from, to, transferTopic, budget);
      const right = await queryEvmLogs<T>(rpc, contract, recipients.slice(middle), from, to, transferTopic, budget);
      return [...left, ...right];
    }
    if (rangeRejected && from < to) {
      const middle = Math.floor((from + to) / 2);
      const left = await queryEvmLogs<T>(rpc, contract, recipients, from, middle, transferTopic, budget);
      const right = await queryEvmLogs<T>(rpc, contract, recipients, middle + 1, to, transferTopic, budget);
      return [...left, ...right];
    }
    throw error;
  }
}
