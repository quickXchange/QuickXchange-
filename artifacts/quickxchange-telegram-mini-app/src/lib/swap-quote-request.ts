/** Bound both Swap and Convert loading, allowing time for provider/solver work. */
export const SWAP_QUOTE_TIMEOUT_MS = 20_000;

export class SwapQuoteTimeoutError extends Error {
  constructor() {
    super('The quote request timed out. Please try again.');
    this.name = 'SwapQuoteTimeoutError';
  }
}

/**
 * Bound the whole browser promise, not just fetch. Cancellation must settle
 * even if a transport (or mutation) does not promptly reject after abort.
 * Shared by both exchange modes; no quote arithmetic happens here.
 */
export async function runSwapQuoteRequest<T>(
  controller: AbortController,
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs = SWAP_QUOTE_TIMEOUT_MS,
): Promise<T> {
  const signal = controller.signal;
  if (signal.aborted) throw signal.reason;

  let onAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  const timeout = setTimeout(() => {
    controller.abort(new SwapQuoteTimeoutError());
  }, timeoutMs);

  try {
    return await Promise.race([run(signal), cancellation]);
  } finally {
    clearTimeout(timeout);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}