/**
 * Product-neutral placeholders required by the shared Admin summary response.
 * Manual Swap never reads Convert provider health.
 */
export function manualExternalProviderHealthPlaceholders() {
  return {
    quickexReconciliation: {
      state: "healthy" as const,
      consecutiveFailures: 0,
      freshnessMs: null,
      lastStartedAt: null,
      lastSucceededAt: null,
      lastFailedAt: null,
      nextRetryAt: null,
    },
    catalog: {
      ageMs: null,
      stale: true,
      lastFailureAt: null,
    },
  };
}