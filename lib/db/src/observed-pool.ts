import pg from "pg";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { classifyDatabasePoolError, isTransientConnectionAcquisitionError } from "./pool-telemetry";

type ConnectCallback = (error: Error | undefined, client: pg.PoolClient | undefined, release: (error?: Error | boolean) => void) => void;

/**
 * Observe the driver's documented connect callback/Promise APIs without
 * retrying a query, transaction, or financial write. A transient failure before
 * acquisition may reconnect once: no SQL has been submitted at that boundary.
 */
export class ObservedPool extends pg.Pool {
  private acquisitions = 0;
  private failures = 0;
  private slowAcquisitions = 0;
  private connectionRetries = 0;
  private recoveredAcquisitions = 0;
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
      connectionRetries: this.connectionRetries,
      recoveredAcquisitions: this.recoveredAcquisitions,
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
    const acquire = (done: ConnectCallback) => {
      let retried = false;
      const attempt = () => {
        super.connect((error, client, release) => {
          if (error && !client && !retried && !this.ending &&
              isTransientConnectionAcquisitionError(error)) {
            retried = true;
            this.connectionRetries++;
            // Let the driver's failed-client removal and pending queue settle.
            // Do not retry exhaustion, authentication errors, or any SQL.
            setImmediate(() => {
              if (this.ending) {
                record(error);
                done(error, undefined, release);
              } else {
                attempt();
              }
            });
            return;
          }
          if (!error && retried) this.recoveredAcquisitions++;
          record(error);
          done(error, client, release);
        });
      };
      attempt();
    };
    if (callback) return acquire(callback);
    return new Promise<pg.PoolClient>((resolve, reject) => {
      acquire((error, client) => {
        if (error) reject(error);
        else resolve(client!);
      });
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
