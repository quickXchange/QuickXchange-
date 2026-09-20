export class BlockchainMonitorError extends Error {
  readonly code: "CONFIGURATION" | "NETWORK" | "PROVIDER" | "INVALID_RESPONSE" | "RANGE";

  constructor(
    code: BlockchainMonitorError["code"],
    message: string,
  ) {
    super(message);
    this.name = "BlockchainMonitorError";
    this.code = code;
  }
}

export function sanitizedProviderError(code: BlockchainMonitorError["code"]): BlockchainMonitorError {
  return new BlockchainMonitorError(
    code,
    code === "CONFIGURATION"
      ? "Blockchain monitoring provider is not configured."
      : "Blockchain monitoring provider request failed.",
  );
}