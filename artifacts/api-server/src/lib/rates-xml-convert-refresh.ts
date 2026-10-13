import type { RatesXmlItem } from "./rates-xml-format";
import { fetchPartnerPairs, partnerPairKey, partnerRateParams, partnerRateToXml,
  type PartnerPair, type PartnerXmlClient } from "./quickex-xml-public";

export type ConvertXmlSaved = { key: string; pair: PartnerPair; item: RatesXmlItem; quotedAt: number };
export type ConvertXmlSnapshot = {
  rows: ConvertXmlSaved[]; refreshing: boolean; stale: boolean; error?: string;
  skipped: number; updatedAt?: number;
};
type Dependencies = {
  client(): Promise<PartnerXmlClient>;
  load(scope: string): Promise<ConvertXmlSaved[]>;
  save(scope: string, row: ConvertXmlSaved): Promise<void>;
  remove(scope: string, keys?: string[]): Promise<void>;
  codeAllowed(code: string): boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};
export function upstreamStatus(error: unknown) {
  const e = error as { providerStatus?: number; status?: number } | undefined;
  return e?.providerStatus ?? e?.status ?? 503;
}
const retryable = (e: unknown) => upstreamStatus(e) === 429 || upstreamStatus(e) >= 500;
const REFRESH_INTERVAL_MS = 5 * 60_000;
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
  private async read(client: PartnerXmlClient, path: "/pairs/all" | "/rates/public/one", params: Record<string, string>) {
    for (let attempt = 0; ; attempt++) {
      try { return await client.read(path, params); }
      catch (e) {
        if (!retryable(e) || attempt >= 2) throw e;
        await this.sleep(upstreamStatus(e) === 429 ? 60_000 : 1000 * 2 ** attempt);
      }
    }
  }
  private async refresh(client: PartnerXmlClient, scope: string, generation: number) {
    const current = () => this.identity === client.identity && this.generation === generation;
    try {
      const all = await fetchPartnerPairs({ ...client, read: (path, params) => this.read(client, path, params) });
      if (!current()) return;
      const groups = new Map<string, PartnerPair[]>();
      this.skipped = 0;
      for (const pair of all) {
        const from = pair.instrumentFrom.bestChangeCurrencyName, to = pair.instrumentTo.bestChangeCurrencyName;
        if (!pair.isActive || from === to || !this.deps.codeAllowed(from) || !this.deps.codeAllowed(to) ||
            pair.instrumentTo.reservesAmount === undefined) { this.skipped++; continue; }
        const key = `${from}\0${to}`;
        groups.set(key, [...groups.get(key) ?? [], pair]);
      }
      const pairs: PartnerPair[] = [];
      for (const group of groups.values()) {
        if (group.length === 1) pairs.push(group[0]);
        else this.skipped += group.length;
      }
      const active = new Map(pairs.map(p => [partnerPairKey(p), p]));
      const removed: string[] = [];
      for (const [key, row] of this.rows) {
        // Never retain old limits/reserves when the provider's pair metadata changed.
        if (!active.has(key) || JSON.stringify(row.pair) !== JSON.stringify(active.get(key))) {
          this.rows.delete(key); removed.push(key);
        }
      }
      if (removed.length) await this.deps.remove(scope, removed);
      this.error = undefined;
      let next = 0, failed = false;
      const worker = async () => {
        while (next < pairs.length && current()) {
          const pair = pairs[next++], key = partnerPairKey(pair);
          try {
            const json = await this.read(client, "/rates/public/one", partnerRateParams(pair));
            const item = partnerRateToXml(pair, json);
            if (!current()) return;
            const row = { key, pair, item, quotedAt: this.now() };
            await this.deps.save(scope, row);
            if (current()) this.rows.set(key, row);
          } catch (e) {
            if (!current()) return;
            failed = true; this.skipped++;
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
        this.nextRefresh = this.now() + REFRESH_INTERVAL_MS;
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
    const scope = `quickex-partner-xml-v1:${client.identity}`;
    if (this.identity !== client.identity) {
      this.identity = client.identity; this.generation++;
      this.rows.clear(); this.flight = undefined; this.nextRefresh = 0;
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
    return { rows, refreshing: !!this.flight, stale: this.stale || expired,
      error: this.error, skipped: this.skipped, updatedAt: this.updatedAt };
  }
}
