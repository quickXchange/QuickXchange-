export type XmlCachedQuote<T> = { until: number; item?: T; reason?: string };
export type XmlQuoteTask<T> = { key: string; run: () => Promise<T> };

/** One bounded-concurrency refresh per configuration; continue warming after HTTP returns. */
export class XmlQuoteRefresh<T> {
  private readonly flights = new Map<string, Promise<void>>();

  async refresh(
    scope: string, tasks: XmlQuoteTask<T>[], cache: Map<string, XmlCachedQuote<T>>,
    isCurrent: () => boolean, waitMs = 8_000,
  ): Promise<void> {
    let flight = this.flights.get(scope);
    if (!flight) {
      let next = 0;
      const worker = async () => {
        while (next < tasks.length && isCurrent()) {
          const task = tasks[next++];
          if ((cache.get(task.key)?.until ?? 0) > Date.now()) continue;
          let entry: XmlCachedQuote<T>;
          try {
            const item = await task.run();
            entry = { until: Date.now() + 30_000, item };
          } catch (error) {
            entry = { until: Date.now() + 5_000,
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
