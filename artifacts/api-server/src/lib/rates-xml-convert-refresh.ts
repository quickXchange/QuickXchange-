import type { RatesXmlItem } from "./rates-xml-format";
import { selectConvertXmlBatch } from "./rates-xml-convert-scheduling";
import { automaticXmlCryptoCode } from "./rates-xml-crypto-codes";
import { fetchPartnerPairs, partnerPairKey, partnerRateParams, partnerRateToXml, partnerXmlCode, partnerQuoteTimestamp,
  type PartnerPair, type PartnerXmlClient } from "./quickex-xml-public";

export type ConvertXmlSaved = { key: string; pair: PartnerPair; item: RatesXmlItem; quotedAt: number };
export type ConvertXmlSnapshot = {
  rows: ConvertXmlSaved[]; freshRows: ConvertXmlSaved[]; refreshing: boolean; stale: boolean; error?: string;
  skipped: number; updatedAt?: number; pending?: number;
};
type ExecutableXmlRoute = { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string };
function directedKey(fromAsset: string, fromNetwork: string, toAsset: string, toNetwork: string) {
  const identity = (asset: string, network: string) =>
    automaticXmlCryptoCode(asset, network) ?? `${asset.trim().toUpperCase()}\0${network.trim().toUpperCase()}`;
  return `${identity(fromAsset, fromNetwork)}\0${identity(toAsset, toNetwork)}`;
}
/** Public publication uses exact directed identities, not network-title aliases. */
export function freshExecutableXmlRows(
  snapshot: Pick<ConvertXmlSnapshot, "freshRows">,
  routes: ExecutableXmlRoute[],
) {
  const allowed = new Set(routes.map(route =>
    directedKey(route.fromAsset, route.fromNetwork, route.toAsset, route.toNetwork)));
  return snapshot.freshRows.filter(row => allowed.has(directedKey(
    row.pair.instrumentFrom.currencyTitle, row.pair.instrumentFrom.networkTitle,
    row.pair.instrumentTo.currencyTitle, row.pair.instrumentTo.networkTitle,
  )));
}
type Dependencies = {
  client(): Promise<PartnerXmlClient>;
  load(scope: string): Promise<ConvertXmlSaved[]>;
  save(scope: string, row: ConvertXmlSaved): Promise<void>;
  remove(scope: string, keys?: string[]): Promise<void>;
  codeAllowed(code: string): boolean;
  executableRoutes?: (pairs: PartnerPair[]) => Promise<ExecutableXmlRoute[]>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};
export function upstreamStatus(error: unknown) {
  const e = error as { providerStatus?: number; status?: number } | undefined;
  return e?.providerStatus ?? e?.status ?? 503;
}
const retryable = (e: unknown) => upstreamStatus(e) === 429 || upstreamStatus(e) >= 500;
const REFRESH_INTERVAL_MS = 5 * 60_000;
const REFRESH_AHEAD_MS = 60_000;
const MAX_RATE_BATCH = 256;
const RATE_BATCH_BUDGET_MS = 60_000;
/** One bounded background flight; requests never wait for the full route matrix. */
export class ConvertXmlRefresh {
  private identity = "";
  private rows = new Map<string, ConvertXmlSaved>();
  private flight?: Promise<void>;
  private nextRefresh = 0;
  private stale = true;
  private error?: string;
  private skipped = 0;
  private updatedAt?: number;
  private generation = 0;
  private catalog?: { pairs: PartnerPair[]; expiresAt: number };
  private readonly retryAt = new Map<string, number>();
  private readonly verified = new Set<string>();
  private readonly attempted = new Map<string, number>();
  private attemptSequence = 0;
  private eligibleCount = 0;
  private loading?: { identity: string; promise: Promise<void> };
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  constructor(private readonly deps: Dependencies) {
    this.sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.now = deps.now ?? Date.now;
  }
  stop() {
    this.generation++;
    this.flight = undefined;
  }
  private async read(client: PartnerXmlClient, path: "/pairs/all" | "/rates/public/one", params: Record<string, string>,
    canRetry = () => true) {
    for (let attempt = 0; ; attempt++) {
      try { return await client.read(path, params); }
      catch (e) {
        // A 429 is a batch-level cooldown, not three minute-long sleeps per
        // direction while later directions queue behind the same quota.
        if (!retryable(e) || upstreamStatus(e) === 429 || attempt >= 2 || !canRetry()) throw e;
        await this.sleep(1000 * 2 ** attempt);
        if (!canRetry()) throw e;
      }
    }
  }
  private async refresh(client: PartnerXmlClient, scope: string, generation: number) {
    const current = () => this.identity === client.identity && this.generation === generation;
    try {
      const all = this.catalog && this.catalog.expiresAt > this.now() ? this.catalog.pairs :
        await fetchPartnerPairs({ ...client, read: (path, params) => this.read(client, path, params) });
      if (!current()) return;
      if (!this.catalog || this.catalog.expiresAt <= this.now())
        this.catalog = { pairs: all, expiresAt: this.now() + REFRESH_INTERVAL_MS };
      // The affiliate catalogue is the direction authority for this feed.
      // Do not first download /pairs/public (a separate popular-pair catalogue).
      const routes = await this.deps.executableRoutes?.(all);
      if (!current()) return;
      if (routes && !routes.length) {
        this.error = "No currently executable Convert directions; retained publications remain gated.";
        this.nextRefresh = this.now() + 30_000;
        return;
      }
      const allowed = routes && new Set(routes.map(route =>
        directedKey(route.fromAsset, route.fromNetwork, route.toAsset, route.toNetwork)));
      const groups = new Map<string, PartnerPair[]>();
      this.skipped = 0;
      for (const pair of all) {
        const from = partnerXmlCode(pair.instrumentFrom), to = partnerXmlCode(pair.instrumentTo);
        if (!pair.isActive || from === to || !this.deps.codeAllowed(from) || !this.deps.codeAllowed(to) ||
            (allowed && !allowed.has(directedKey(pair.instrumentFrom.currencyTitle, pair.instrumentFrom.networkTitle,
              pair.instrumentTo.currencyTitle, pair.instrumentTo.networkTitle))) ||
            pair.instrumentTo.reservesAmount === undefined) { this.skipped++; continue; }
        const key = `${from}\0${to}`;
        groups.set(key, [...groups.get(key) ?? [], pair]);
      }
      const pairs: PartnerPair[] = [];
      for (const group of groups.values()) {
        if (group.length === 1) pairs.push(group[0]);
        else this.skipped += group.length;
      }
      this.eligibleCount = pairs.length;
      const active = new Map(pairs.map(p => [partnerPairKey(p), p]));
      for (const key of this.retryAt.keys()) if (!active.has(key)) this.retryAt.delete(key);
      for (const key of this.verified) if (!active.has(key)) this.verified.delete(key);
      for (const key of this.attempted.keys()) if (!active.has(key)) this.attempted.delete(key);
      const removed: string[] = [];
      for (const [key, row] of this.rows) {
        // Never retain old limits/reserves when the provider's pair metadata changed.
        if (!active.has(key) || JSON.stringify(row.pair) !== JSON.stringify(active.get(key))) {
          this.rows.delete(key); removed.push(key);
        }
      }
      if (removed.length) await this.deps.remove(scope, removed);
      if (!current()) return;
      this.error = undefined;
      // Renew current publications without starving the rest of the catalogue.
      const due = pairs.filter(pair => {
        const key = partnerPairKey(pair), row = this.rows.get(key);
        return (this.retryAt.get(key) ?? 0) <= this.now() &&
          (!this.verified.has(key) || !row || row.quotedAt + REFRESH_INTERVAL_MS - REFRESH_AHEAD_MS <= this.now());
      });
      const batch = selectConvertXmlBatch(due, this.rows, this.attempted,
        this.now(), REFRESH_INTERVAL_MS, MAX_RATE_BATCH);
      const deadline = this.now() + RATE_BATCH_BUDGET_MS;
      let next = 0, failed = false, rateLimited = false;
      const worker = async () => {
        while (next < batch.length && current() && !rateLimited && this.now() < deadline) {
          const pair = batch[next++], key = partnerPairKey(pair);
          // Record actual dispatch, not selection: a deadline/429 may stop a
          // batch before its later candidates are attempted.
          this.attempted.set(key, this.attemptSequence++);
          try {
            const json = await this.read(client, "/rates/public/one", partnerRateParams(pair),
              () => current() && !rateLimited && this.now() < deadline);
            const item = partnerRateToXml(pair, json);
            const quotedAt = partnerQuoteTimestamp(json, this.now(), REFRESH_INTERVAL_MS);
            if (!current()) return;
            const row = { key, pair, item, quotedAt };
            await this.deps.save(scope, row);
            if (current()) { this.rows.set(key, row); this.retryAt.delete(key); this.verified.add(key); }
          } catch (e) {
            if (!current()) return;
            failed = true; this.skipped++;
            if (upstreamStatus(e) === 429) rateLimited = true;
            this.retryAt.set(key, this.now() + (retryable(e) ? 60_000 : REFRESH_INTERVAL_MS));
            if (!retryable(e)) {
              this.rows.delete(key);
              await this.deps.remove(scope, [key]);
            }
          }
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      if (current()) {
        this.stale = failed && this.rows.size > 0;
        this.updatedAt = this.now();
        // A long batch must not reset every quote's freshness clock.
        const nextDue = Math.min(...[...this.rows.values()].map(row =>
          row.quotedAt + REFRESH_INTERVAL_MS - REFRESH_AHEAD_MS));
        this.nextRefresh = rateLimited ? this.now() + 60_000 : due.length > next ? this.now() + 1_000 :
          Math.max(this.now() + 1_000, Math.min(nextDue, this.catalog!.expiresAt, this.now() + 60_000));
      }
    } catch (e) {
      if (!current()) return;
      this.error = e instanceof Error ? e.message : "Quickex partner XML refresh unavailable.";
      this.stale = true; this.nextRefresh = this.now() + 60_000;
      if (!retryable(e)) {
        this.rows.clear();
        await this.deps.remove(scope);
      }
    }
  }
  async snapshot(waitMs = 250): Promise<ConvertXmlSnapshot> {
    const client = await this.deps.client();
    // Earlier snapshots used catalogue limits and receipt-time freshness.
    // Retain them in storage, but require new provider proof before publication.
    const scope = `quickex-partner-xml-v2:${client.identity}`;
    if (this.identity !== client.identity) {
      this.identity = client.identity; this.generation++;
      this.rows.clear(); this.flight = undefined; this.nextRefresh = 0;
      this.catalog = undefined; this.retryAt.clear(); this.verified.clear();
      this.attempted.clear(); this.attemptSequence = 0;
      this.eligibleCount = 0;
      this.stale = true; this.updatedAt = undefined; this.error = undefined; this.skipped = 0;
      const generation = this.generation;
      const promise = this.deps.load(scope).then(saved => {
        if (generation === this.generation) for (const row of saved)
          if (row.item.providerJson && row.pair.isActive && row.item.from !== row.item.to &&
              this.deps.codeAllowed(row.item.from) && this.deps.codeAllowed(row.item.to))
            this.rows.set(row.key, row);
      });
      this.loading = { identity: client.identity, promise };
    }
    try { await this.loading?.promise; }
    catch (error) {
      if (this.identity === client.identity) {
        this.identity = ""; this.loading = undefined; this.generation++;
      }
      throw error;
    }
    if (this.identity !== client.identity) return this.snapshot(waitMs);
    if (!this.flight && this.now() >= this.nextRefresh) {
      const flight = this.refresh(client, scope, this.generation);
      this.flight = flight;
      void flight.catch(() => { this.error = "XML publication persistence unavailable."; this.stale = true;
        this.nextRefresh = this.now() + 60_000; }).finally(() => {
        if (this.flight === flight) this.flight = undefined;
      });
    }
    if (waitMs > 0 && this.flight) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([this.flight.catch(() => {}),
        new Promise<void>(resolve => { timer = setTimeout(resolve, waitMs); })]); }
      finally { if (timer) clearTimeout(timer); }
    }
    const rows = [...this.rows.values()];
    // A successful long-running batch does not make its earliest quotes fresh again.
    const expired = rows.some(row => !Number.isFinite(row.quotedAt) ||
      row.quotedAt > this.now() || this.now() - row.quotedAt >= REFRESH_INTERVAL_MS);
    const freshRows = rows.filter(row => Number.isFinite(row.quotedAt) &&
      row.quotedAt <= this.now() && this.now() - row.quotedAt < REFRESH_INTERVAL_MS);
    return { rows, freshRows, refreshing: !!this.flight, stale: this.stale || expired,
      error: this.error, skipped: this.skipped, updatedAt: this.updatedAt,
      pending: Math.max(0, this.eligibleCount - freshRows.length) };
  }
}
