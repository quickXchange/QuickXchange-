export const SWAP_QUOTE_DEBOUNCE_MS = 120;
const CACHE_TTL_MS = 2_000;
const EXPIRY_MARGIN_MS = 1_000;

type ExpiringQuote = { expiresAt?: string };
type CachedQuote<Q> = { quote: Q; storedAt: number };

/**
 * Latest-input-only transport, not a pricing calculator. Cached quotes are
 * exact-input display hints only; every edit still needs a fresh signed quote.
 */
export class SwapQuoteRequest<Q extends ExpiringQuote> {
  private version = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private cacheTimer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private cache = new Map<string, CachedQuote<Q>>();

  cancel() {
    this.version++;
    clearTimeout(this.timer);
    clearTimeout(this.cacheTimer);
    this.controller?.abort();
    this.controller = undefined;
  }

  clearCache() {
    this.cache.clear();
  }

  schedule(input: {
    key: string;
    run: (signal: AbortSignal) => Promise<Q>;
    onPhase: (phase: 'debouncing' | 'loading') => void;
    onCached: (quote: Q | null) => void;
    onSuccess: (quote: Q) => void;
    onError: (error: unknown) => void;
    immediate?: boolean;
  }) {
    this.cancel();
    const version = this.version;
    const current = () => version === this.version;
    const now = Date.now();
    const cached = this.cache.get(input.key);
    const remaining = cached
      ? Math.min(
          CACHE_TTL_MS - (now - cached.storedAt),
          new Date(cached.quote.expiresAt || '').getTime() - now - EXPIRY_MARGIN_MS,
        )
      : 0;
    input.onCached(cached && remaining > 0 ? cached.quote : null);
    if (cached && remaining > 0) {
      this.cacheTimer = setTimeout(() => {
        if (current()) input.onCached(null);
      }, remaining);
    }
    input.onPhase('debouncing');
    this.timer = setTimeout(async () => {
      if (!current()) return;
      const controller = new AbortController();
      this.controller = controller;
      input.onPhase('loading');
      try {
        const quote = await input.run(controller.signal);
        if (!current() || controller.signal.aborted) return;
        if (new Date(quote.expiresAt || '').getTime() > Date.now() + EXPIRY_MARGIN_MS) {
          this.cache.delete(input.key);
          this.cache.set(input.key, { quote, storedAt: Date.now() });
          if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
        }
        clearTimeout(this.cacheTimer);
        input.onCached(null);
        input.onSuccess(quote);
      } catch (error) {
        if (!current() || controller.signal.aborted) return;
        clearTimeout(this.cacheTimer);
        input.onCached(null);
        input.onError(error);
      } finally {
        if (current()) this.controller = undefined;
      }
    }, input.immediate ? 0 : SWAP_QUOTE_DEBOUNCE_MS);
  }
}