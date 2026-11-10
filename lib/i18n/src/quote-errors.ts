/**
 * Technical quote failures use one shared, Admin-translatable message.
 * Do not expose transport prefixes, provider diagnostics or solver budgets.
 */
export function quoteErrorTranslationKey(error: unknown): "quoteErrors.temporary" | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { data?: unknown; status?: number; name?: string; code?: string };
  const data = candidate.data && typeof candidate.data === "object"
    ? candidate.data as { code?: string }
    : undefined;
  const code = data?.code ?? candidate.code;
  if (
    code === "MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED" ||
    code === "MANUAL_RECEIVE_QUOTE_STALE" ||
    code === "MANUAL_RECEIVE_QUOTE_INVALID" ||
    code === "MANUAL_DESK_REFERENCE_UNAVAILABLE" ||
    candidate.name === "SwapQuoteTimeoutError" ||
    candidate.name === "TimeoutError" ||
    candidate.status === 408 ||
    (typeof candidate.status === "number" && candidate.status >= 500)
  ) return "quoteErrors.temporary";
  return undefined;
}
