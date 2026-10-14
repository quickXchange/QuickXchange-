import pg from "pg";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { classifyDatabasePoolError } from "./pool-telemetry";

type ConnectCallback = (error: Error | undefined, client: pg.PoolClient | undefined, release: (error?: Error | boolean) => void) => void;

/**
 * Observe the driver's documented connect callback/Promise APIs without
 * retrying a query, transaction, acquisition, or financial write.
 */
export class ObservedPool extends pg.Pool {
  private acquisitions = 0;
  private failures = 0;
  private slowAcquisitions = 0;
  private lastAcquisitionMs = 0;
  private maxAcquisitionMs = 0;
  private loop = monitorEventLoopDelay({ resolution: 20 });

  constructor(options: pg.PoolConfig) {
    super(options);
    this.loop.enable();
  }

  metrics() {
    return {
      acquisitions: this.acquisitions,
      acquisitionFailures: this.failures,
      slowAcquisitions: this.slowAcquisitions,
      lastAcquisitionMs: this.lastAcquisitionMs,
      maxAcquisitionMs: this.maxAcquisitionMs,
      eventLoopDelayP99Ms: Number.isFinite(this.loop.percentile(99))
        ? Math.round(this.loop.percentile(99) / 1e6) : 0,
      eventLoopDelayMaxMs: Number.isFinite(this.loop.max) ? Math.round(this.loop.max / 1e6) : 0,
    };
  }

  connect(): Promise<pg.PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    const start = performance.now();
    const startCounts = {
      totalCount: this.totalCount, idleCount: this.idleCount, waitingCount: this.waitingCount,
    };
    const record = (error?: Error) => {
      this.acquisitions++;
      if (error) this.failures++;
      const durationMs = Math.round(performance.now() - start);
      this.lastAcquisitionMs = durationMs;
      this.maxAcquisitionMs = Math.max(this.maxAcquisitionMs, durationMs);
      if (durationMs >= 2_000) {
        this.slowAcquisitions++;
        console.warn("Slow PostgreSQL connection acquisition", {
          durationMs, startCounts,
          endCounts: { totalCount: this.totalCount, idleCount: this.idleCount, waitingCount: this.waitingCount },
          outcome: error ? classifyDatabasePoolError(error) : "success",
          ...this.metrics(),
        });
      }
    };
    if (callback) {
      super.connect((error, client, release) => {
        record(error);
        callback(error, client, release);
      });
      return;
    }
    return super.connect().then(client => {
      record();
      return client;
    }, error => {
      record(error);
      throw error;
    });
  }

  end(): Promise<void>;
  end(callback: () => void): void;
  end(callback?: () => void): Promise<void> | void {
    this.loop.disable();
    if (callback) return super.end(callback);
    return super.end();
  }
}
