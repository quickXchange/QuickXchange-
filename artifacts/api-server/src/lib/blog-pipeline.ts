import { createHash } from "node:crypto";

export type SourceItem = {
  title: string;
  url: string;
  guid?: string;
  summary?: string;
  publishedAt?: Date;
};

function readableSource(text: string): string {
  return text.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot);/gi, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80_000);
}

export function sourceItems(parsed: Record<string, any>): SourceItem[] {
  const channel = parsed.rss?.channel ?? parsed.feed ?? {};
  const values = channel.item ?? channel.entry ?? [];
  const items = Array.isArray(values) ? values : [values];
  return items.flatMap((item) => {
    const title = typeof item.title === "string" ? item.title : item.title?.["#text"];
    const linkValue = typeof item.link === "string" ? item.link : item.link?.["@_href"] ?? item.link?.["#text"];
    if (!title || !linkValue) return [];
    const published = item.pubDate ?? item.published ?? item.updated;
    const date = published ? new Date(published) : undefined;
    const guid = typeof item.guid === "string" ? item.guid : item.guid?.["#text"];
    const summary = item.description ?? item.summary ?? item.content?.["#text"];
    return [{
      title: title.trim(), url: String(linkValue), guid: guid ? String(guid).trim() : undefined,
      summary: summary ? readableSource(String(summary)).slice(0, 4000) : undefined,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date : undefined,
    }];
  });
}

export function sourceIdentity(source: { allowedHost: string }, item: { url: string; guid?: string }): string {
  const identity = item.guid?.trim() || item.url.trim();
  return `${source.allowedHost}:${identity}`;
}

/** Hash the exact immutable identity; do not normalize URLs or titles here. */
export function sourceIdentityFingerprint(identity: string): string {
  return createHash("sha256").update(identity, "utf8").digest("hex");
}

export function officialPublisherForHost(host: string): string | null {
  if (host === "www.coindesk.com") return "CoinDesk";
  if (host === "cointelegraph.com") return "Cointelegraph";
  return null;
}

export function validateOfficialItemUrl(raw: string, allowedHost: string): string | null {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && parsed.hostname === allowedHost ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function hasLikelyFeedCopy(articleText: string, feedSummary: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(Boolean);
  const article = normalize(articleText);
  const summary = normalize(feedSummary);
  const verbatimWords = 12;
  if (summary.length < verbatimWords) return false;
  for (let i = 0; i <= summary.length - verbatimWords; i += 1) {
    const phrase = summary.slice(i, i + verbatimWords).join(" ");
    if (article.join(" ").includes(phrase)) return true;
  }
  return false;
}

type DiscoveredCandidate = {
  source: { allowedHost: string };
  item: SourceItem;
};

/** Ingestion is oldest-first; equal timestamps are stable by immutable source identity. */
export function sortDiscoveredCandidates<T extends DiscoveredCandidate>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.item.publishedAt?.getTime() ?? 0) - (b.item.publishedAt?.getTime() ?? 0)
    || sourceIdentity(a.source, a.item).localeCompare(sourceIdentity(b.source, b.item)),
  );
}

export function generatedArticleReviewPolicy() {
  return { status: "draft" as const, autoPublish: false, enqueueNewsletter: false, enqueueTelegram: false };
}

export { readableSource };