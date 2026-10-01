import { AsyncLocalStorage } from "node:async_hooks";

type QuoteTimingContext = {
  startedAt: bigint;
  developmentQuoteId?: string;
  durations: Map<string, number>;
  counts: Map<string, number>;
  completed: boolean;
};

const timingContext = new AsyncLocalStorage<QuoteTimingContext>();

export function isDevelopmentQuoteTimingEnabled(
  environment: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "DEVELOPMENT_QUOTE_TIMING">> = process.env,
) {
  return environment.NODE_ENV === "development" ||
    (environment.NODE_ENV === "test" && environment.DEVELOPMENT_QUOTE_TIMING === "true");
}

export function sanitizeDevelopmentQuoteId(value: string | undefined) {
  return value?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96) || undefined;
}

export function runDevelopmentQuoteTiming<T>(
  developmentQuoteId: string | undefined,
  callback: () => T,
): T {
  if (!isDevelopmentQuoteTimingEnabled()) return callback();
  return timingContext.run({
    startedAt: process.hrtime.bigint(),
    developmentQuoteId,
    durations: new Map(),
    counts: new Map(),
    completed: false,
  }, callback);
}

export async function timeStage<T>(name: string, callback: () => T | Promise<T>): Promise<T> {
  const context = timingContext.getStore();
  if (!context) return callback();
  const startedAt = process.hrtime.bigint();
  try {
    return await callback();
  } finally {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    context.durations.set(name, (context.durations.get(name) ?? 0) + elapsedMs);
  }
}

export function countStage(name: string, amount = 1) {
  const context = timingContext.getStore();
  if (context) context.counts.set(name, (context.counts.get(name) ?? 0) + amount);
}

export function completeDevelopmentQuoteTiming(
  setHeader: (name: string, value: string) => void,
  logInfo: (record: Record<string, unknown>, message: string) => void,
) {
  const context = timingContext.getStore();
  if (!context || context.completed) return;
  context.completed = true;

  const durations = Object.fromEntries(
    [...context.durations.entries()].map(([name, duration]) => [
      name,
      Number(duration.toFixed(3)),
    ]),
  );
  durations.handler_total = Number(
    (Number(process.hrtime.bigint() - context.startedAt) / 1_000_000).toFixed(3),
  );
  const counts = {
    probes: context.counts.get("probes") ?? 0,
    fiat_catalog_reads: context.counts.get("fiat_catalog_reads") ?? 0,
    provider_cache_resolutions: context.counts.get("provider_cache_resolutions") ?? 0,
  };
  const serverTiming = Object.entries(durations)
    .map(([name, duration]) => `${name.replace(/_/g, "-")};dur=${duration}`)
    .join(", ");

  setHeader("Server-Timing", serverTiming);
  if (context.developmentQuoteId) {
    setHeader("X-Development-Quote-Id", context.developmentQuoteId);
  }
  const countHeaders: Record<string, string> = {
    probes: "X-Development-Quote-Probes",
    fiat_catalog_reads: "X-Development-Quote-Fiat-Catalog-Reads",
    provider_cache_resolutions: "X-Development-Quote-Provider-Cache-Resolutions",
  };
  for (const [name, header] of Object.entries(countHeaders)) {
    setHeader(header, String(counts[name as keyof typeof counts]));
  }

  logInfo({
    event: "development_reverse_quote_timing",
    developmentQuoteId: context.developmentQuoteId,
    stageDurationsMs: durations,
    stageCounts: counts,
  }, "Development reverse quote timing");
}