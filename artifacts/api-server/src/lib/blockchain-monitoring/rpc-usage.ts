export type RpcUsagePurpose = "monitoring" | "confirmation" | "registration" | "readiness" | "admin_test" | "admin_review" | "unspecified";

/** Dispatch counts, NOT provider invoices. No endpoints, addresses or hashes. */
export class RpcUsageMeter {
  private readonly counts = new Map<string, { network: string; provider: "alchemy" | "other"; purpose: RpcUsagePurpose; method: string; requests: number }>();
  private unattributedRequests = 0;
  private since: number;
  constructor(now = Date.now()) { this.since = now; }
  record(network: string, provider: "alchemy" | "other", purpose: RpcUsagePurpose, method: string): void {
    const key = JSON.stringify([network, provider, purpose, method]);
    const existing = this.counts.get(key);
    if (existing) { existing.requests++; return; }
    if (this.counts.size >= 256) { this.unattributedRequests++; return; }
    this.counts.set(key, { network, provider, purpose, method, requests: 1 });
  }
  flush(now = Date.now(), force = false) {
    if (!force && now - this.since < 300_000) return undefined;
    const snapshot = {
      windowStartedAt: new Date(this.since).toISOString(),
      windowEndedAt: new Date(now).toISOString(),
      elapsedMs: Math.max(0, now - this.since),
      requests: [...this.counts.values()].map(row => ({ ...row })),
      unattributedRequests: this.unattributedRequests,
      measurement: "actual_fetch_dispatches_not_billed_cus",
    };
    this.counts.clear();
    this.unattributedRequests = 0;
    this.since = now;
    return snapshot;
  }
}

export const rpcUsageMeter = new RpcUsageMeter();

export function rpcUsageProvider(endpoint: string): "alchemy" | "other" {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return host === "alchemy.com" || host.endsWith(".alchemy.com") ? "alchemy" : "other";
  } catch { return "other"; }
}
