export type ProviderFailure = {
  httpStatus?: number;
  rpcCode?: number;
  reason?: "quota_exhausted" | "rate_limited" | "unauthorized" | "forbidden" | "rpc_rejected";
  retryAfterMs?: number;
};

/** Deliberately returns enums/numbers only, never a provider message or URL. */
export function providerFailureDetails(value: unknown, httpStatus?: number, retryAfter?: string | null): ProviderFailure {
  const error = value && typeof value === "object" && "error" in value ? value.error : value;
  const message = typeof error === "string" ? error :
    error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  const rpcCode = error && typeof error === "object" && "code" in error &&
    typeof error.code === "number" && Number.isSafeInteger(error.code) ? error.code : undefined;
  const quota = /month.*(?:capacity|limit|quota|credit)|(?:capacity|limit|quota|credit).*month/i.test(message);
  const reason = quota ? "quota_exhausted" : httpStatus === 429 || rpcCode === 429
    ? "rate_limited" : httpStatus === 401 ? "unauthorized" :
      httpStatus === 403 ? "forbidden" : rpcCode !== undefined ? "rpc_rejected" : undefined;
  let retryAfterMs: number | undefined;
  if (reason === "quota_exhausted" || reason === "rate_limited") {
    const seconds = retryAfter?.trim() && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) * 1000 : NaN;
    const date = retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
    const requested = Number.isFinite(seconds) ? seconds : date;
    retryAfterMs = Math.min(60 * 60_000, Math.max(quota ? 15 * 60_000 : 30_000,
      Number.isFinite(requested) ? requested : 0));
  }
  return {
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(rpcCode !== undefined ? { rpcCode } : {}),
    ...(reason ? { reason } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

export class BlockchainMonitorError extends Error {
  readonly code: "CONFIGURATION" | "NETWORK" | "PROVIDER" | "INVALID_RESPONSE" | "RANGE" | "TIMEOUT";

  constructor(
    code: BlockchainMonitorError["code"],
    message: string,
    readonly providerFailure?: ProviderFailure,
  ) {
    super(message);
    this.name = "BlockchainMonitorError";
    this.code = code;
  }
}

export function sanitizedProviderError(code: BlockchainMonitorError["code"], details?: ProviderFailure): BlockchainMonitorError {
  return new BlockchainMonitorError(
    code,
    code === "CONFIGURATION"
      ? "Blockchain monitoring provider is not configured."
      : code === "TIMEOUT"
        ? "Blockchain monitoring provider request timed out."
      : "Blockchain monitoring provider request failed.",
    details,
  );
}