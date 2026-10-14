export type XmlCachedQuote<T> = { until: number; item?: T; reason?: string; quotedAt?: number };
export type XmlQuoteTask<T> = { key: string; run: () => Promise<T> };

/** XML discovery may warm the provider catalogue, but must not block cached publication. */
// Live executable-catalog reads exceeded one second in Production even while
// successful quotes were available. This bounds discovery, not rate freshness.
export const CONVERT_XML_CATALOG_DISCOVERY_WAIT_MS = 3_000;

export async function xmlDiscoveryDeadline<T>(work: Promise<T>, waitMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(
        new Error("XML provider discovery is slow; retaining last successful rates."),
        { status: 503, code: "XML_DISCOVERY_TIMEOUT" },
      )), waitMs);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One bounded-concurrency refresh per configuration; continue warming after HTTP returns. */
export class XmlQuoteRefresh<T> {
  private readonly flights = new Map<string, Promise<void>>();
  private stopped = false;

  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.all([...this.flights.values()]);
  }

  async refresh(
    scope: string, tasks: XmlQuoteTask<T>[], cache: Map<string, XmlCachedQuote<T>>,
    isCurrent: () => boolean, waitMs = 8_000,
    onSuccess?: (key: string, item: T, quotedAt: number) => Promise<void>,
  ): Promise<void> {
    if (this.stopped) return;
    let flight = this.flights.get(scope);
    if (!flight) {
      // Known publications take priority over cold routes when refreshing.
      const ordered = [...tasks].sort((a, b) =>
        (cache.get(a.key)?.quotedAt ?? Infinity) - (cache.get(b.key)?.quotedAt ?? Infinity));
      let next = 0;
      const worker = async () => {
        while (next < ordered.length && !this.stopped && isCurrent()) {
          const task = ordered[next++], existing = cache.get(task.key);
          const ahead = existing?.item !== undefined && !existing.reason ? 10_000 : 0;
          if ((existing?.until ?? 0) > Date.now() + ahead) continue;
          let entry: XmlCachedQuote<T>;
          try {
            const item = await task.run();
            const quotedAt = Date.now();
            entry = { until: quotedAt + 30_000, item, quotedAt };
            if (isCurrent() && onSuccess) {
              try { await onSuccess(task.key, item, quotedAt); }
              catch { console.warn("XML quote publication persistence failed; retaining the verified in-memory rate."); }
            }
          } catch (error) {
            // A transport failure must never erase an already verified publication rate.
            entry = { ...cache.get(task.key), until: Date.now() + 5_000,
              reason: error instanceof Error ? error.message : "Current pricing is unavailable." };
          }
          if (isCurrent()) cache.set(task.key, entry);
        }
      };
      flight = Promise.all([worker(), worker(), worker()]).then(() => {});
      this.flights.set(scope, flight);
      void flight.finally(() => {
        if (this.flights.get(scope) === flight) this.flights.delete(scope);
      });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([flight, new Promise<void>(resolve => {
        timer = setTimeout(resolve, waitMs);
      })]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
