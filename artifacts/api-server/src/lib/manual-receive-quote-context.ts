/**
 * Memoizes preparation only for the lifetime of one reverse-quote request.
 * Callers should create a new resolver per request; no configuration is
 * retained globally between requests.
 */
export function createRequestScopedManualReceiveContext<T>(
  resolve: () => Promise<T>,
): () => Promise<T> {
  let context: Promise<T> | undefined;
  return () => {
    context ??= Promise.resolve().then(resolve);
    return context;
  };
}