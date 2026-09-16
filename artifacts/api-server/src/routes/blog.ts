import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { Router, type IRouter, type Response } from "express";
import { XMLParser } from "fast-xml-parser";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";
import OpenAI from "openai";
import sharp from "sharp";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  CreateAdminBlogArticleBody,
  CreateAdminBlogArticleResponse,
  CreateAdminBlogCategoryBody,
  CreateAdminBlogCategoryResponse,
  CreateAdminBlogSourceBody,
  CreateAdminBlogSourceResponse,
  DeleteAdminBlogArticleParams,
  DeleteAdminBlogCategoryParams,
  DeleteAdminBlogSourceParams,
  GetAdminBlogSettingsResponse,
  GetBlogArticleParams,
  GetBlogArticleResponse,
  GetAdminBlogArticleParams,
  GetAdminBlogArticleResponse,
  ListAdminBlogArticlesQueryParams,
  ListAdminBlogArticlesResponse,
  ListAdminBlogCategoriesResponse,
  ListAdminBlogSourcesResponse,
  ListBlogArticlesQueryParams,
  ListBlogArticlesResponse,
  ListBlogCategoriesResponse,
  PreviewBlogAutomationResponse,
  RequestSitePageMediaUploadBody,
  RequestSitePageMediaUploadResponse,
  PublishAdminBlogArticleParams,
  PublishAdminBlogArticleResponse,
  RunBlogAutomationBody,
  RunBlogAutomationResponse,
  ScheduleAdminBlogArticleBody,
  ScheduleAdminBlogArticleParams,
  ScheduleAdminBlogArticleResponse,
  UnpublishAdminBlogArticleParams,
  UnpublishAdminBlogArticleResponse,
  UpdateAdminBlogArticleBody,
  UpdateAdminBlogArticleParams,
  UpdateAdminBlogArticleResponse,
  UpdateAdminBlogCategoryBody,
  UpdateAdminBlogCategoryParams,
  UpdateAdminBlogCategoryResponse,
  UpdateAdminBlogSettingsBody,
  UpdateAdminBlogSettingsResponse,
  UpdateAdminBlogSourceBody,
  UpdateAdminBlogSourceParams,
  UpdateAdminBlogSourceResponse,
} from "@workspace/api-zod";
import {
  blogArticleCitationsTable,
  blogArticleTagsTable,
  blogArticlesTable,
  blogAuditLogsTable,
  blogAutomationCandidatesTable,
  blogAutomationRunsTable,
  blogAutomationSlotsTable,
  blogAutomationSettingsTable,
  blogAutomationSourcesTable,
  blogCategoriesTable,
  blogDuplicateTopicFingerprintsTable,
  blogTagsTable,
  db,
} from "@workspace/db";
import { ApiError } from "../lib/api-error";
import { requireOperator } from "../lib/operator-auth";
import { createSitePageMediaUpload } from "../lib/object-storage";
import { sanitizeBlogHtml } from "../lib/blog-html";
import { generateCover } from "../lib/blog-cover-system";
import { enqueueNewsletterCampaignTx } from "../lib/newsletter";
import { newsletterPublicationDedupeKey } from "../lib/newsletter-utils";

const router: IRouter = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
type PublicAddress = { address: string; family: number };

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizedTopic(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const ARTICLE_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(["draft", "scheduled", "published", "unpublished"]),
  scheduled: new Set(["draft", "scheduled", "published", "unpublished"]),
  published: new Set(["published", "unpublished"]),
  unpublished: new Set(["draft", "scheduled", "published", "unpublished"]),
};

function assertArticleTransition(from: string, to: string): void {
  if (!ARTICLE_TRANSITIONS[from]?.has(to)) {
    throw new ApiError("BLOG_STATE_TRANSITION_INVALID", `Cannot transition an article from ${from} to ${to}.`, 409);
  }
}

function fingerprint(value: string): string {
  return createHash("sha256").update(normalizedTopic(value)).digest("hex");
}

function safeImagePath(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (!/^\/objects\/site-page-media\/[0-9a-f-]{36}$/i.test(value)) {
    throw new ApiError("BLOG_IMAGE_PATH_INVALID", "Blog images must reference the site-page-media object namespace.", 400);
  }
  return value;
}

function safeCanonical(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new ApiError("BLOG_CANONICAL_INVALID", "Canonical URL must be absolute HTTPS.", 400); }
  if (parsed.protocol !== "https:") throw new ApiError("BLOG_CANONICAL_INVALID", "Canonical URL must be absolute HTTPS.", 400);
  return parsed.toString();
}

export function bodyIsSafe(body: unknown, format: "blocks" | "html"): string | Record<string, unknown> | Array<Record<string, unknown>> {
  if (format === "html" && (typeof body !== "string" || !body.trim())) {
    throw new ApiError("BLOG_BODY_INVALID", "HTML articles must provide an HTML string body.", 400);
  }
  const invalidBlocks = !body || typeof body !== "object" ||
    (Array.isArray(body) && body.some((item) => !item || typeof item !== "object"));
  if (format === "blocks" && invalidBlocks) {
    throw new ApiError("BLOG_BODY_INVALID", "Block articles must provide an object or block array body.", 400);
  }
  const serialized = JSON.stringify(body);
  if (serialized.length > 500_000) throw new ApiError("BLOG_BODY_TOO_LARGE", "Article body is too large.", 400);
  if (format === "html") {
    const sanitized = sanitizeBlogHtml(body as string);
    if (!sanitized) throw new ApiError("BLOG_HTML_INVALID", "Article HTML has no allowed content.", 400);
    return sanitized;
  }
  return body as string | Record<string, unknown> | Array<Record<string, unknown>>;
}

export function assertArticleVersion(actual: Date, expected: Date | null | undefined): void {
  if (!expected || actual.getTime() !== expected.getTime()) {
    throw new ApiError("BLOG_STALE_WRITE", "Article changed since it was loaded. Reload before saving.", 409);
  }
}

function publicArticle(row: typeof blogArticlesTable.$inferSelect) {
  return { ...row, generationMetadata: row.generationMetadata ?? {} };
}

async function detail(row: typeof blogArticlesTable.$inferSelect, includeDraft = false) {
  const [category] = await db.select().from(blogCategoriesTable).where(eq(blogCategoriesTable.id, row.categoryId)).limit(1);
  const tagRows = await db.select({ tag: blogTagsTable })
    .from(blogArticleTagsTable)
    .innerJoin(blogTagsTable, eq(blogTagsTable.id, blogArticleTagsTable.tagId))
    .where(eq(blogArticleTagsTable.articleId, row.id));
  const citations = await db.select().from(blogArticleCitationsTable)
    .where(eq(blogArticleCitationsTable.articleId, row.id));
  const relatedRows = category ? await db.select().from(blogArticlesTable).where(and(
    eq(blogArticlesTable.status, "published"),
    sql`${blogArticlesTable.id} <> ${row.id}`,
  )).orderBy(
    sql`CASE WHEN ${blogArticlesTable.categoryId} = ${row.categoryId} THEN 0 ELSE 1 END`,
    desc(blogArticlesTable.publishedAt),
  ).limit(4) : [];
  const [previousArticle] = row.publishedAt
    ? await db.select().from(blogArticlesTable).where(and(
      eq(blogArticlesTable.status, "published"),
      or(
        lt(blogArticlesTable.publishedAt, row.publishedAt),
        and(eq(blogArticlesTable.publishedAt, row.publishedAt), lt(blogArticlesTable.id, row.id)),
      ),
    )).orderBy(desc(blogArticlesTable.publishedAt), desc(blogArticlesTable.id)).limit(1)
    : [];
  const [nextArticle] = row.publishedAt
    ? await db.select().from(blogArticlesTable).where(and(
      eq(blogArticlesTable.status, "published"),
      or(
        gt(blogArticlesTable.publishedAt, row.publishedAt),
        and(eq(blogArticlesTable.publishedAt, row.publishedAt), gt(blogArticlesTable.id, row.id)),
      ),
    )).orderBy(asc(blogArticlesTable.publishedAt), asc(blogArticlesTable.id)).limit(1)
    : [];
  const result = {
    ...publicArticle(row),
    category,
    tags: tagRows.map((item) => item.tag),
    citations,
    related: relatedRows.map(publicArticle),
    previousArticle: previousArticle ? publicArticle(previousArticle) : null,
    nextArticle: nextArticle ? publicArticle(nextArticle) : null,
  };
  return includeDraft ? result : (result.status === "published" ? result : null);
}

type ArticleRelationInput = {
  tagIds?: string[];
  tagNames?: string[];
  citations?: Array<{
    sourceUrl: string;
    sourceTitle?: string;
    publisher?: string;
    claim?: string;
    sourcePublishedAt?: Date | string | null;
  }>;
};

function citationUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new ApiError("BLOG_CITATION_URL_INVALID", "Citation URLs must be absolute HTTP(S) URLs.", 400); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new ApiError("BLOG_CITATION_URL_INVALID", "Citation URLs must be absolute HTTP(S) URLs.", 400);
  return parsed.toString();
}

async function replaceArticleRelations(
  tx: any,
  articleId: string,
  input: ArticleRelationInput,
  actor: string,
  replace = true,
): Promise<void> {
  const hasTags = input.tagIds !== undefined || input.tagNames !== undefined;
  const hasCitations = input.citations !== undefined;
  const tagIds = new Set(input.tagIds ?? []);
  for (const rawName of input.tagNames ?? []) {
    const name = rawName.trim();
    const slug = normalizeSlug(name);
    if (!name || !SLUG.test(slug)) throw new ApiError("BLOG_TAG_INVALID", "Tag names must produce a valid slug.", 400);
    const [tag] = await tx.insert(blogTagsTable).values({
      name, slug, normalizedSlug: slug, createdBy: actor,
    }).onConflictDoUpdate({
      target: blogTagsTable.normalizedSlug,
      set: { name, slug, updatedAt: new Date() },
    }).returning();
    if (tag) tagIds.add(tag.id);
  }
  if (replace && hasTags) await tx.delete(blogArticleTagsTable).where(eq(blogArticleTagsTable.articleId, articleId));
  if (hasTags && tagIds.size) {
    await tx.insert(blogArticleTagsTable).values([...tagIds].map((tagId) => ({ articleId, tagId }))).onConflictDoNothing();
  }
  if (replace && hasCitations) await tx.delete(blogArticleCitationsTable).where(eq(blogArticleCitationsTable.articleId, articleId));
  if (hasCitations && input.citations?.length) {
    const retrievedAt = new Date();
    const values = input.citations.map((citation) => {
      const sourcePublishedAt = citation.sourcePublishedAt ? new Date(citation.sourcePublishedAt) : null;
      if (sourcePublishedAt && Number.isNaN(sourcePublishedAt.getTime())) {
        throw new ApiError("BLOG_CITATION_DATE_INVALID", "Citation publication dates must be valid.", 400);
      }
      return {
        articleId,
        sourceUrl: citationUrl(citation.sourceUrl),
        sourceTitle: citation.sourceTitle?.trim() ?? "",
        publisher: citation.publisher?.trim() ?? "",
        claim: citation.claim?.trim() ?? "",
        sourcePublishedAt,
        retrievedAt,
      };
    });
    await tx.insert(blogArticleCitationsTable).values(values);
  }
}

function parsePage(value: unknown, fallback: number, max: number): number {
  const n = Number(value ?? fallback);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

async function listArticles(input: { page?: unknown; pageSize?: unknown; search?: string; category?: string; tag?: string; admin?: boolean; status?: string }) {
  const page = parsePage(input.page, 1, 10_000);
  const pageSize = parsePage(input.pageSize, input.admin ? 25 : 12, input.admin ? 100 : 50);
  const conditions = [];
  if (!input.admin) conditions.push(eq(blogArticlesTable.status, "published"));
  else if (input.status) conditions.push(eq(blogArticlesTable.status, input.status));
  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    conditions.push(or(ilike(blogArticlesTable.title, term), ilike(blogArticlesTable.excerpt, term)));
  }
  if (input.category) {
    const normalizedCategory = normalizeSlug(input.category);
    const categoryLookup = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.category)
      ? or(
          eq(blogCategoriesTable.normalizedSlug, normalizedCategory),
          eq(blogCategoriesTable.id, input.category),
        )
      : eq(blogCategoriesTable.normalizedSlug, normalizedCategory);
    const [category] = await db.select({ id: blogCategoriesTable.id }).from(blogCategoriesTable)
      .where(categoryLookup);
    if (!category) return { items: [], page, pageSize, total: 0 };
    conditions.push(eq(blogArticlesTable.categoryId, category.id));
  }
  let idsByTag: string[] | undefined;
  if (input.tag) {
    const [tag] = await db.select({ id: blogTagsTable.id }).from(blogTagsTable)
      .where(eq(blogTagsTable.normalizedSlug, normalizeSlug(input.tag)));
    if (!tag) return { items: [], page, pageSize, total: 0 };
    idsByTag = (await db.select({ articleId: blogArticleTagsTable.articleId }).from(blogArticleTagsTable)
      .where(eq(blogArticleTagsTable.tagId, tag.id))).map((item) => item.articleId);
    if (!idsByTag.length) return { items: [], page, pageSize, total: 0 };
    conditions.push(inArray(blogArticlesTable.id, idsByTag));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [totalRow] = await db.select({ total: count() }).from(blogArticlesTable).where(where);
  const rows = await db.select().from(blogArticlesTable).where(where)
    .orderBy(
      ...(!input.admin && !input.category && !input.tag && page === 1 ? [desc(blogArticlesTable.isFeatured)] : []),
      desc(blogArticlesTable.publishedAt),
      desc(blogArticlesTable.createdAt),
    )
    .limit(pageSize).offset((page - 1) * pageSize);
  return { items: rows.map(publicArticle), page, pageSize, total: Number(totalRow?.total ?? 0) };
}

async function getSettings() {
  const [row] = await db.select().from(blogAutomationSettingsTable)
    .where(eq(blogAutomationSettingsTable.id, "global")).limit(1);
  return row ?? {
    id: "global", enabled: false, reviewFirst: true, publishAutomatically: false,
    scheduleAutomatically: false, requireTwoSources: true, freshnessWindowMinutes: 240,
    maxCandidatesPerRun: 20, cadenceUnit: "day", articlesPerPeriod: 1, scheduleTimes: [],
    timezone: "UTC", topics: [], categories: [], keywords: [], language: "en",
    minimumArticleLength: 600, publicationMode: "review", featuredImageGeneration: false,
    seoGeneration: true, seoIndex: true, seoFollow: true, settings: {}, updatedBy: "system",
    updatedAt: new Date(), checkInProgressUntil: null, leaseId: null,
  };
}

const NON_GLOBAL_V4_CIDRS = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
  "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
].map((cidr) => ipaddr.parseCIDR(cidr));
const NON_GLOBAL_V6_CIDRS = [
  "::/128", "::1/128", "::ffff:0:0/96", "64:ff9b::/96", "64:ff9b:1::/48",
  "100::/64", "2001::/32", "2001:2::/48", "2001:10::/28", "2001:db8::/32",
  "2002::/16", "fc00::/7", "fe80::/10", "ff00::/8",
].map((cidr) => ipaddr.parseCIDR(cidr));

export function privateAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try { parsed = ipaddr.parse(address); } catch { return true; }
  if (parsed.kind() === "ipv4") {
    if (NON_GLOBAL_V4_CIDRS.some(([network, prefix]) => (parsed as ipaddr.IPv4).match(network as ipaddr.IPv4, prefix))) return true;
    return parsed.range() !== "unicast";
  }
  const ipv6 = parsed as ipaddr.IPv6;
  if (NON_GLOBAL_V6_CIDRS.some(([network, prefix]) => ipv6.match(network as ipaddr.IPv6, prefix))) return true;
  if (ipv6.isIPv4MappedAddress()) return privateAddress(ipv6.toIPv4Address().toString());
  return ipv6.range() !== "unicast";
}

export async function assertSafeSourceUrl(raw: string, resolveAddresses: (host: string) => Promise<PublicAddress[]> = (host) => lookup(host, { all: true })) : Promise<{ url: string; host: string; addresses: PublicAddress[] }> {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new ApiError("BLOG_SOURCE_URL_INVALID", "Source URL is invalid.", 400); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port && parsed.port !== "443") {
    throw new ApiError("BLOG_SOURCE_URL_UNSAFE", "Sources must use HTTPS without credentials or non-standard ports.", 400);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isIP(host)) {
    throw new ApiError("BLOG_SOURCE_URL_UNSAFE", "Private and literal-IP source hosts are not allowed.", 400);
  }
  try {
    const addresses = await resolveAddresses(host);
    if (addresses.some((address) => privateAddress(address.address))) {
      throw new ApiError("BLOG_SOURCE_URL_UNSAFE", "Source host resolves to a private network.", 400);
    }
    if (!addresses.length) throw new ApiError("BLOG_SOURCE_URL_UNSAFE", "Source host has no public address.", 400);
    return { url: parsed.toString(), host, addresses };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("BLOG_SOURCE_URL_UNSAFE", "Source host could not be safely resolved.", 400);
  }
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export async function fetchSafeSourceResource(
  raw: string,
  options: RequestInit,
  allowedHost?: string,
  resolveAddresses: (host: string) => Promise<PublicAddress[]> = (host) => lookup(host, { all: true }),
): Promise<globalThis.Response> {
  let current = raw;
  const visited = new Set<string>();
  for (let hop = 0; hop <= 3; hop += 1) {
    const checked = await assertSafeSourceUrl(current, resolveAddresses);
    if (allowedHost && checked.host !== allowedHost) {
      throw new ApiError("BLOG_SOURCE_HOST_CHANGED", "Source redirect left its allowlist.", 400);
    }
    if (visited.has(checked.url)) throw new Error("source_redirect_loop");
    visited.add(checked.url);
    const pinned = checked.addresses[0];
    const dispatcher = new Agent({
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1,
      connect: {
        lookup: ((hostname: string, _lookupOptions: unknown, callback: (error: Error | null, address?: string, family?: number) => void) => {
          if (hostname.toLowerCase() !== checked.host) {
            callback(new Error("source_lookup_host_mismatch"));
            return;
          }
          callback(null, pinned.address, pinned.family);
        }) as never,
      },
    });
    const response = await fetch(checked.url, {
      ...options, redirect: "manual", dispatcher: dispatcher as unknown as never,
    } as RequestInit & { dispatcher: unknown });
    if (!REDIRECT_CODES.has(response.status)) return response;
    if (hop === 3) throw new Error("source_redirect_limit");
    const location = response.headers.get("location");
    if (!location) throw new Error("source_redirect_missing_location");
    current = new URL(location, checked.url).toString();
  }
  throw new Error("source_redirect_limit");
}

function sourceItems(parsed: Record<string, any>): Array<{ title: string; url: string; publishedAt?: Date }> {
  const channel = parsed.rss?.channel ?? parsed.feed ?? {};
  const values = channel.item ?? channel.entry ?? [];
  const items = Array.isArray(values) ? values : [values];
  return items.flatMap((item) => {
    const title = typeof item.title === "string" ? item.title : item.title?.["#text"];
    const linkValue = typeof item.link === "string" ? item.link : item.link?.["@_href"] ?? item.link?.["#text"];
    if (!title || !linkValue) return [];
    const published = item.pubDate ?? item.published ?? item.updated;
    const date = published ? new Date(published) : undefined;
    return [{ title: title.trim(), url: String(linkValue), publishedAt: date && !Number.isNaN(date.getTime()) ? date : undefined }];
  });
}

async function fetchSource(source: typeof blogAutomationSourcesTable.$inferSelect) {
  if (source.sourceType === "coinmarketcap" && !process.env.COINMARKETCAP_API_KEY) return [];
  const checked = await assertSafeSourceUrl(source.url);
  if (checked.host !== source.allowedHost) throw new ApiError("BLOG_SOURCE_HOST_CHANGED", "Source host no longer matches its allowlist.", 400);
  const response = await fetchSafeSourceResource(checked.url, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/rss+xml, application/atom+xml, text/xml" } }, source.allowedHost);
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (source.sourceType !== "coinmarketcap" && !/(rss|atom|xml)/.test(contentType)) {
    throw new Error("Source is not an RSS or Atom feed");
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 2_000_000) throw new Error("Source feed is too large");
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error("Source feed is too large");
  return sourceItems(parser.parse(body));
}

function readableSource(text: string): string {
  return text.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot);/gi, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80_000);
}

async function fetchVerifiedSource(url: string, allowedHost: string): Promise<{ url: string; title: string; text: string }> {
  const checked = await assertSafeSourceUrl(url);
  if (checked.host !== allowedHost) throw new Error("source_host_not_allowlisted");
  const response = await fetchSafeSourceResource(checked.url, { signal: AbortSignal.timeout(10_000), headers: { accept: "text/html,application/xhtml+xml,text/plain" } }, allowedHost);
  if (!response.ok) throw new Error(`source_article_http_${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 1_000_000) throw new Error("source_article_too_large");
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error("source_article_too_large");
  const readable = readableSource(text);
  if (readable.length < 120) throw new Error("source_article_has_insufficient_text");
  return { url: checked.url, title: "", text: readable };
}

type GeneratedBlogArticle = {
  title: string;
  excerpt: string;
  bodyHtml: string;
  category: string;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
  citations: Array<{ sourceUrl: string; sourceTitle?: string; publisher?: string; claim: string; sourcePublishedAt?: string | null }>;
  internalLinks?: Array<{ slug: string; anchor: string }>;
  featuredImagePath?: string | null;
  featuredImageAlt?: string | null;
  imageGeneration?: {
    model: string;
    prompt: string;
    outcome: "uploaded" | "fallback" | "failed" | "disabled";
    reason?: string;
    source?: "template-system" | "deterministic-fallback";
    width?: number;
    height?: number;
    format?: "webp";
    compositorVersion?: string;
    template?: string;
    assets?: string[];
  };
};

function openAiClient(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("ai_generation_not_configured");
  return new OpenAI({ apiKey, baseURL, timeout: 45_000, maxRetries: 2 });
}

export async function generateOriginalArticle(topic: string, sources: Array<{ url: string; title: string; text: string }>, settings: Awaited<ReturnType<typeof getSettings>>, internalLinkCandidates: Array<{ slug: string; title: string }> = []): Promise<GeneratedBlogArticle> {
  const client = openAiClient();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "excerpt", "bodyHtml", "category", "tags", "citations", "internalLinks"],
    properties: {
      title: { type: "string", minLength: 10, maxLength: 180 },
      excerpt: { type: "string", minLength: 30, maxLength: 500 },
      bodyHtml: { type: "string", minLength: 100 },
      category: { type: "string", minLength: 1, maxLength: 120 },
      tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 80 }, maxItems: 12 },
      seoTitle: { type: "string", maxLength: 180 },
      seoDescription: { type: "string", maxLength: 320 },
      citations: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["sourceUrl", "claim"], properties: {
        sourceUrl: { type: "string" }, sourceTitle: { type: "string" }, publisher: { type: "string" },
        claim: { type: "string", minLength: 10 }, sourcePublishedAt: { type: ["string", "null"] },
      } } },
      internalLinks: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["slug", "anchor"], properties: {
        slug: { type: "string" }, anchor: { type: "string", minLength: 2, maxLength: 100 },
      } } },
    },
  };
  const promptSources = sources.map((source) => `SOURCE URL: ${source.url}\nSOURCE CONTENT:\n${source.text}`).join("\n\n---\n\n");
  const response = await client.chat.completions.create({
    model: process.env.AI_INTEGRATIONS_OPENAI_MODEL ?? "gpt-5.4-mini",
    max_completion_tokens: 8192,
    response_format: { type: "json_schema", json_schema: { name: "quickxchange_blog_article", strict: true, schema } },
    messages: [
        { role: "system", content: `You are a fact-bound financial editor. Write an original article in ${settings.language}. Use only facts explicitly supported by the supplied sources. Never infer prices, percentages, dates, or market claims. If a fact is not supported, omit it. Do not copy source wording. Return only the requested JSON. Body HTML may use p, h2, h3, ul, ol, li, strong, em, and a tags; no scripts, styles, iframes, or inline event handlers. Every material factual claim must have a citation to an exact supplied source URL. Internal links must use only the supplied published article slugs.` },
        { role: "user", content: `Topic: ${topic}\nMinimum body text length: ${settings.minimumArticleLength} characters.\nAllowed categories: ${(settings.categories as string[]).join(", ") || "Crypto News, Guides, Exchange, Bitcoin, Ethereum, Stablecoins, Security, Market Insights, QuickXchange Updates"}\nKeywords to use only when supported: ${(settings.keywords as string[]).join(", ")}\nPublished articles available for internal links: ${JSON.stringify(internalLinkCandidates)}\n${promptSources}` },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("ai_generation_empty");
  let generated: GeneratedBlogArticle;
  try { generated = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "").trim()) as GeneratedBlogArticle; } catch { throw new Error("ai_generation_invalid_json"); }
  if (!generated.title || !generated.excerpt || !generated.bodyHtml || !Array.isArray(generated.citations)) throw new Error("ai_generation_invalid_shape");
  generated.bodyHtml = bodyIsSafe(generated.bodyHtml, "html") as string;
  const bodyTextLength = readableSource(generated.bodyHtml).length;
  if (bodyTextLength < settings.minimumArticleLength) throw new Error("quality_article_too_short");
  const allowed = new Set(sources.map((source) => source.url));
  if (!generated.citations.length || generated.citations.some((citation) => !allowed.has(citation.sourceUrl) || !citation.claim?.trim())) {
    throw new Error("ai_generation_unverified_citation");
  }
  const internalSlugs = new Set(internalLinkCandidates.map((article) => article.slug));
  if ((generated.internalLinks ?? []).some((link) => !internalSlugs.has(link.slug) || !link.anchor?.trim())) {
    throw new Error("ai_generation_unverified_internal_link");
  }
  return generated;
}

function imagePromptPart(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const COVER_WIDTH = 1200;
const COVER_HEIGHT = 675;
const COVER_FORMAT = "webp" as const;
const COVER_COMPOSITOR_VERSION = "quickxchange-cover-v3";

/**
 * Produce the canonical social cover. AI supplies only the background art;
 * all brand, title, dimensions, and readability guarantees are server-owned.
 */
export async function composeQuickXchangeCover(
  _source: Buffer | null,
  article: Pick<GeneratedBlogArticle, "title" | "category">,
  topic: string,
): Promise<Buffer> {
  const art = generateCover({ title: article.title, topic, category: article.category });
  const output = await sharp(art.buffer, { failOn: "error", limitInputPixels: COVER_WIDTH * COVER_HEIGHT })
    .webp({ quality: 86, effort: 4 })
    .toBuffer();
  const metadata = await sharp(output, { failOn: "error" }).metadata();
  if (metadata.format !== COVER_FORMAT || metadata.width !== COVER_WIDTH || metadata.height !== COVER_HEIGHT) {
    throw new Error("featured_image_composition_invalid");
  }
  if (output.length > 5 * 1024 * 1024) throw new Error("featured_image_normalized_too_large");
  return output;
}

export async function uploadCover(bytes: Buffer): Promise<string> {
  const upload = await createSitePageMediaUpload("image/webp");
  let uploaded: globalThis.Response;
  try {
    uploaded = await fetch(upload.uploadURL, {
      method: "PUT",
      headers: { "content-type": "image/webp" },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error
      ? (error.cause as { code?: string; message?: string } | undefined)
      : undefined;
    throw new Error(`featured_image_upload_transport${cause?.code ? `_${cause.code}` : ""}${cause?.message ? `: ${cause.message}` : ""}`);
  }
  if (!uploaded.ok) throw new Error(`featured_image_upload_http_${uploaded.status}`);
  const path = safeImagePath(upload.objectPath);
  if (!path) throw new Error("featured_image_path_invalid");
  return path;
}

export async function generateFeaturedImage(
  topic: string,
  article: Pick<GeneratedBlogArticle, "title" | "category">,
): Promise<NonNullable<GeneratedBlogArticle["imageGeneration"]> & { path: string; alt: string }> {
  const safeTopic = imagePromptPart(topic, 180);
  const safeTitle = imagePromptPart(article.title, 180);
  const safeCategory = imagePromptPart(article.category, 100);
  const design = generateCover({ title: article.title, topic, category: article.category });
  const prompt = `QuickXchange ${design.template} editorial template for "${safeTitle}" with assets: ${design.detectedAssets.join(", ") || "category-specific geometry"}.`;
  const model = "quickxchange-template-system";
  const normalized = await composeQuickXchangeCover(null, article, topic);
  const path = await uploadCover(normalized);
  const alt = `Editorial illustration for the ${safeCategory} article about ${safeTopic}.`;
  return {
    model, prompt, outcome: "uploaded", source: "template-system", path, alt,
    width: COVER_WIDTH, height: COVER_HEIGHT, format: COVER_FORMAT,
    compositorVersion: COVER_COMPOSITOR_VERSION, template: design.template, assets: design.detectedAssets,
  };
}

export async function attachFeaturedImage(
  topic: string,
  article: GeneratedBlogArticle,
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<GeneratedBlogArticle> {
  if (!settings.featuredImageGeneration) {
    article.imageGeneration = { model: "quickxchange-template-system", prompt: "", outcome: "disabled" };
    return article;
  }
  try {
    const image = await generateFeaturedImage(topic, article);
    article.featuredImagePath = image.path;
    article.featuredImageAlt = image.alt;
    article.imageGeneration = {
      model: image.model, prompt: image.prompt, outcome: image.outcome, source: image.source,
      width: image.width, height: image.height, format: image.format,
        compositorVersion: image.compositorVersion, template: image.template, assets: image.assets,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "featured_image_failed";
    const fallbackPrompt = `Deterministic branded QuickXchange cover for ${imagePromptPart(topic, 180)}`;
    try {
      const fallback = await composeQuickXchangeCover(null, article, topic);
      const path = await uploadCover(fallback);
      article.featuredImagePath = path;
      article.featuredImageAlt = `QuickXchange editorial cover for the ${imagePromptPart(article.category, 100)} article about ${imagePromptPart(topic, 180)}.`;
      article.imageGeneration = {
        model: "quickxchange-template-system", prompt: fallbackPrompt, outcome: "fallback",
        source: "deterministic-fallback", reason, width: COVER_WIDTH, height: COVER_HEIGHT,
        format: COVER_FORMAT, compositorVersion: COVER_COMPOSITOR_VERSION,
      };
    } catch (fallbackError) {
      article.imageGeneration = {
        model: "quickxchange-template-system", prompt: fallbackPrompt, outcome: "failed",
        source: "deterministic-fallback",
        reason: `${reason}; fallback: ${fallbackError instanceof Error ? fallbackError.message : "featured_image_fallback_failed"}`,
        width: COVER_WIDTH, height: COVER_HEIGHT, format: COVER_FORMAT,
        compositorVersion: COVER_COMPOSITOR_VERSION,
      };
    }
  }
  return article;
}

async function saveGeneratedArticle(article: GeneratedBlogArticle, actor: string, settings: Awaited<ReturnType<typeof getSettings>>, sourceCitations: GeneratedBlogArticle["citations"], reservation?: { candidateId: string; topicFingerprint: string }) {
  const [category] = await db.select().from(blogCategoriesTable).where(eq(blogCategoriesTable.normalizedSlug, normalizeSlug(article.category))).limit(1);
  if (!category) throw new Error("ai_generation_category_not_found");
  const slug = normalizeSlug(article.title);
  if (!SLUG.test(slug)) throw new Error("ai_generation_slug_invalid");
  const now = new Date();
  const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const internalHtml = (article.internalLinks ?? []).length
    ? `<aside><h2>Related reading</h2><ul>${(article.internalLinks ?? []).map((link) =>
      `<li><a href="/blog/${encodeURIComponent(link.slug)}">${escapeHtml(link.anchor)}</a></li>`).join("")}</ul></aside>`
    : "";
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(blogArticlesTable).values({
      categoryId: category.id, authorId: actor, authorName: "QuickXchange Editorial",
      // We do not have a deterministic sentence-to-source entailment checker;
      // generated copy is therefore never auto-published.
      status: "draft",
      title: article.title.trim(), slug, normalizedSlug: slug, excerpt: article.excerpt.trim(), body: `${article.bodyHtml}${internalHtml}`,
      bodyFormat: "html", publishedAt: null,
      seoTitle: settings.seoGeneration ? article.seoTitle?.trim() || article.title.trim() : null,
      seoDescription: settings.seoGeneration ? article.seoDescription?.trim() || article.excerpt.trim() : null,
      featuredImagePath: article.featuredImagePath ?? null,
      featuredImageAlt: article.featuredImageAlt ?? null,
      indexPage: settings.seoIndex, followLinks: settings.seoFollow,
      generationMetadata: {
         model: process.env.AI_INTEGRATIONS_OPENAI_MODEL ?? "gpt-5.4-mini", original: true,
        autoPublicationBlocked: "claim_support_verification_not_robust",
         featuredImage: article.imageGeneration ?? {
            model: "quickxchange-template-system", outcome: settings.featuredImageGeneration ? "failed" : "disabled",
           ...(settings.featuredImageGeneration ? { reason: "image_generation_not_attempted" } : {}),
         },
      },
      createdBy: actor, updatedBy: actor, createdAt: now, updatedAt: now,
    }).returning();
    await replaceArticleRelations(tx, row.id, { tagNames: article.tags, citations: sourceCitations }, actor, true);
    if (reservation) {
      await tx.update(blogDuplicateTopicFingerprintsTable).set({ articleId: row.id })
        .where(and(eq(blogDuplicateTopicFingerprintsTable.candidateId, reservation.candidateId), eq(blogDuplicateTopicFingerprintsTable.fingerprint, reservation.topicFingerprint)));
      await tx.update(blogAutomationCandidatesTable).set({ status: "generated", generatedArticleId: row.id, quality: { passed: true, bodyLength: readableSource(article.bodyHtml).length } })
        .where(eq(blogAutomationCandidatesTable.id, reservation.candidateId));
    }
    return row;
  });
}

export async function reconcileScheduledArticles(now = new Date()): Promise<number> {
  const rows = await db.select().from(blogArticlesTable).where(and(eq(blogArticlesTable.status, "scheduled"), sql`${blogArticlesTable.scheduledAt} <= ${now}`));
  for (const row of rows) {
    await db.transaction(async (tx) => {
      const [published] = await tx.update(blogArticlesTable).set({ status: "published", publishedAt: row.publishedAt ?? now, updatedAt: now }).where(and(eq(blogArticlesTable.id, row.id), eq(blogArticlesTable.status, "scheduled"))).returning();
      if (published) await enqueueNewsletterCampaignTx(tx, {
        dedupeKey: newsletterPublicationDedupeKey(published.id, published.publishedAt ?? now),
        title: published.title, description: published.excerpt, readMorePath: `/blog/${published.slug}`,
      });
    });
  }
  return rows.length;
}

/**
 * Preview deliberately has no writes, including no run/candidate/audit rows
 * and no duplicate fingerprint reservation. It is safe to call repeatedly.
 */
async function previewBlogAutomation(settings: Awaited<ReturnType<typeof getSettings>>, actorId?: string) {
  const startedAt = new Date();
  if (!settings.enabled) {
    return {
      id: randomUUID(), trigger: "preview" as const, status: "skipped" as const, dryRun: true,
      startedAt, finishedAt: new Date(), summary: { reason: "automation_disabled", discovered: 0, accepted: 0, skipped: 0 },
      error: null, createdBy: actorId ?? null,
    };
  }
  const sources = await db.select().from(blogAutomationSourcesTable).where(eq(blogAutomationSourcesTable.enabled, true));
  const discovered: Array<{ source: typeof sources[number]; item: { title: string; url: string; publishedAt?: Date } }> = [];
  const sourceErrors: string[] = [];
  for (const source of sources.slice(0, settings.maxCandidatesPerRun)) {
    try {
      for (const item of await fetchSource(source)) discovered.push({ source, item });
    } catch (error) {
      sourceErrors.push(error instanceof Error ? error.message : "fetch_failed");
    }
  }
  const grouped = new Map<string, typeof discovered>();
  for (const candidate of discovered) {
    const topic = normalizedTopic(candidate.item.title);
    grouped.set(topic, [...(grouped.get(topic) ?? []), candidate]);
  }
  const internalLinkCandidates = await db.select({ slug: blogArticlesTable.normalizedSlug, title: blogArticlesTable.title })
    .from(blogArticlesTable).where(eq(blogArticlesTable.status, "published")).orderBy(desc(blogArticlesTable.publishedAt)).limit(20);
  const candidates: Array<Record<string, unknown>> = [];
  let accepted = 0;
  for (const candidate of discovered.slice(0, settings.maxCandidatesPerRun)) {
    const topic = normalizedTopic(candidate.item.title);
    if (!topic) continue;
    const [existing] = await db.select({ id: blogDuplicateTopicFingerprintsTable.id })
      .from(blogDuplicateTopicFingerprintsTable).where(eq(blogDuplicateTopicFingerprintsTable.fingerprint, fingerprint(topic))).limit(1);
    let reason: string | null = existing ? "duplicate_topic" : null;
    const sourceCount = new Set((grouped.get(topic) ?? []).map((item) => item.source.id)).size;
    if (!reason && settings.requireTwoSources && sourceCount < 2) reason = "cross_source_verification_insufficient";
    if (!reason) {
      const verifiedSources: Array<{ url: string; title: string; text: string }> = [];
      const seenSources = new Set<string>();
      for (const item of grouped.get(topic) ?? []) {
        if (seenSources.has(item.source.id)) continue;
        seenSources.add(item.source.id);
        try {
          const verified = await fetchVerifiedSource(item.item.url, item.source.allowedHost);
          verifiedSources.push({ ...verified, title: item.item.title });
        } catch { /* report only the conservative aggregate below */ }
        if (verifiedSources.length >= 4) break;
      }
      if (settings.requireTwoSources && verifiedSources.length < 2) reason = "source_verification_insufficient";
      else if (!settings.requireTwoSources && verifiedSources.length < 1) reason = "source_verification_unavailable";
      if (!reason) {
        try {
          const generated = await generateOriginalArticle(topic, verifiedSources, settings, internalLinkCandidates);
          candidates.push({ topic, status: "generated", title: generated.title, slug: normalizeSlug(generated.title), tags: generated.tags, citations: generated.citations.length });
          accepted += 1;
          continue;
        } catch (error) {
          reason = error instanceof Error ? error.message : "ai_generation_failed";
        }
      }
    }
    candidates.push({ topic, status: "skipped", reason });
  }
  return {
    id: randomUUID(), trigger: "preview" as const, status: "completed" as const, dryRun: true,
    startedAt, finishedAt: new Date(),
    summary: { discovered: discovered.length, accepted, skipped: candidates.filter((item) => item.status === "skipped").length, sourceErrors, candidates },
    error: null, createdBy: actorId ?? null,
  };
}

export async function runBlogAutomation({ dryRun, trigger, actorId, occurrenceKey }: { dryRun: boolean; trigger: "manual" | "preview" | "scheduled"; actorId?: string; occurrenceKey?: string }) {
  const settings = await getSettings();
  if (dryRun) return previewBlogAutomation(settings, actorId);
  const runId = randomUUID();
  const [run] = await db.insert(blogAutomationRunsTable).values({
    id: runId, trigger, dryRun, status: settings.enabled ? "running" : "skipped", createdBy: actorId,
    summary: settings.enabled ? {} : { skipped: 0, reason: "automation_disabled" },
    finishedAt: settings.enabled ? null : new Date(),
  }).returning();
  if (!settings.enabled) return run;
  if (trigger === "scheduled" && occurrenceKey) {
    const [slot] = await db.insert(blogAutomationSlotsTable).values({ occurrenceKey, runId })
      .onConflictDoNothing().returning({ occurrenceKey: blogAutomationSlotsTable.occurrenceKey });
    if (!slot) {
      const [skippedRun] = await db.update(blogAutomationRunsTable).set({
        status: "skipped", finishedAt: new Date(), summary: { skipped: 0, reason: "scheduled_occurrence_already_claimed", occurrenceKey },
      }).where(eq(blogAutomationRunsTable.id, runId)).returning();
      return skippedRun;
    }
  }
  const leaseId = randomUUID();
  const leaseUntil = new Date(Date.now() + 2 * 60_000);
  const [lease] = await db.update(blogAutomationSettingsTable).set({
    checkInProgressUntil: leaseUntil,
    leaseId,
    updatedAt: new Date(),
  }).where(and(
    eq(blogAutomationSettingsTable.id, "global"),
    or(isNull(blogAutomationSettingsTable.checkInProgressUntil), lt(blogAutomationSettingsTable.checkInProgressUntil, new Date())),
  )).returning({ id: blogAutomationSettingsTable.id });
  if (!lease) {
    const [skippedRun] = await db.update(blogAutomationRunsTable).set({
      status: "skipped", finishedAt: new Date(), summary: { skipped: 0, reason: "automation_lease_busy" },
    }).where(eq(blogAutomationRunsTable.id, run.id)).returning();
    return skippedRun;
  }
  let leaseLost = false;
  const heartbeat = setInterval(async () => {
    const [renewed] = await db.update(blogAutomationSettingsTable).set({
      checkInProgressUntil: new Date(Date.now() + 2 * 60_000), updatedAt: new Date(),
    }).where(and(eq(blogAutomationSettingsTable.id, "global"), eq(blogAutomationSettingsTable.leaseId, leaseId))).returning({ id: blogAutomationSettingsTable.id });
    if (!renewed) leaseLost = true;
  }, 30_000);
  heartbeat.unref();
  const assertLease = async () => {
    if (leaseLost) throw new Error("automation_lease_fenced");
    const [currentLease] = await db.select({ id: blogAutomationSettingsTable.id }).from(blogAutomationSettingsTable)
      .where(and(eq(blogAutomationSettingsTable.id, "global"), eq(blogAutomationSettingsTable.leaseId, leaseId), sql`${blogAutomationSettingsTable.checkInProgressUntil} > ${new Date()}`)).limit(1);
    if (!currentLease) throw new Error("automation_lease_fenced");
  };
  try {
    const sources = await db.select().from(blogAutomationSourcesTable).where(eq(blogAutomationSourcesTable.enabled, true));
    const discovered: Array<{ source: typeof sources[number]; item: { title: string; url: string; publishedAt?: Date } }> = [];
    for (const source of sources.slice(0, settings.maxCandidatesPerRun)) {
      try {
        for (const item of await fetchSource(source)) discovered.push({ source, item });
      } catch (error) {
        await db.insert(blogAuditLogsTable).values({ action: "automation.source_skipped", actorId, runId: run.id, details: { sourceId: source.id, reason: error instanceof Error ? error.message : "fetch_failed" } });
      }
    }
    let accepted = 0;
    let skipped = 0;
    const grouped = new Map<string, typeof discovered>();
    for (const candidate of discovered) {
      const topic = normalizedTopic(candidate.item.title);
      const entries = grouped.get(topic) ?? [];
      entries.push(candidate);
      grouped.set(topic, entries);
    }
    const internalLinkCandidates = await db.select({ slug: blogArticlesTable.normalizedSlug, title: blogArticlesTable.title })
      .from(blogArticlesTable).where(eq(blogArticlesTable.status, "published")).orderBy(desc(blogArticlesTable.publishedAt)).limit(20);
    const periodStart = automationPeriodStart(settings);
    const [periodCount] = await db.select({ total: count() }).from(blogArticlesTable).where(and(
      gte(blogArticlesTable.createdAt, periodStart),
      sql`${blogArticlesTable.generationMetadata}->>'original' = 'true'`,
    ));
    let generatedThisPeriod = Number(periodCount?.total ?? 0);
    for (const candidate of discovered.slice(0, settings.maxCandidatesPerRun)) {
      await assertLease();
      const topic = normalizedTopic(candidate.item.title);
      if (!topic) continue;
      const existingRows = await db.select({ id: blogDuplicateTopicFingerprintsTable.id, articleId: blogDuplicateTopicFingerprintsTable.articleId, createdAt: blogDuplicateTopicFingerprintsTable.createdAt })
        .from(blogDuplicateTopicFingerprintsTable).where(eq(blogDuplicateTopicFingerprintsTable.fingerprint, fingerprint(topic))).limit(1);
      let existing: { id: string; articleId: string | null; createdAt: Date } | undefined = existingRows[0];
      if (existing && !existing.articleId && existing.createdAt < new Date(Date.now() - 5 * 60_000)) {
        await db.delete(blogDuplicateTopicFingerprintsTable).where(eq(blogDuplicateTopicFingerprintsTable.id, existing.id));
        existing = undefined;
      }
      const sourceCount = new Set((grouped.get(topic) ?? []).map((item) => item.source.id)).size;
      const configuredTopics = (settings.topics as string[]).map(normalizedTopic).filter(Boolean);
      let reason: string | null = existing ? "duplicate_topic" :
        (configuredTopics.length && !configuredTopics.some((configured) => topic.includes(configured)) ? "topic_not_allowed" : null);
      if (!reason && generatedThisPeriod >= settings.articlesPerPeriod) reason = "article_period_limit";
      let generatedArticleId: string | undefined;
      let verification: Record<string, unknown> = { sourceCount };
      let quality: Record<string, unknown> = { passed: false };
      let candidateStatus: "generated" | "skipped" = "skipped";
      if (!reason && settings.requireTwoSources && sourceCount < 2) reason = "cross_source_verification_insufficient";
      if (!reason && candidate.item.publishedAt && /price|market|rate|percent|surge|crash|rally/i.test(topic) &&
          Date.now() - candidate.item.publishedAt.getTime() > settings.freshnessWindowMinutes * 60_000) {
        reason = "stale_price_sensitive_source";
      }
      const [candidateRow] = await db.insert(blogAutomationCandidatesTable).values({
        runId: run.id, sourceId: candidate.source.id, sourceUrl: candidate.item.url,
        sourceTitle: candidate.item.title, topic, normalizedTopic: topic,
        status: reason ? "skipped" : "discovered", skipReason: reason, sourcePublishedAt: candidate.item.publishedAt,
        verification: { sourceCount }, quality: { passed: false },
      }).returning();
      if (reason) {
        skipped += 1;
        continue;
      }
      const [reservation] = await db.insert(blogDuplicateTopicFingerprintsTable).values({
        fingerprint: fingerprint(topic), normalizedTopic: topic, candidateId: candidateRow.id,
      }).onConflictDoNothing().returning({ id: blogDuplicateTopicFingerprintsTable.id });
      if (!reservation) {
        await db.update(blogAutomationCandidatesTable).set({ status: "skipped", skipReason: "duplicate_topic" })
          .where(eq(blogAutomationCandidatesTable.id, candidateRow.id));
        skipped += 1;
        continue;
      }
      const verifiedSources: Array<{ url: string; title: string; text: string }> = [];
      if (!reason) {
        const seenSources = new Set<string>();
        for (const item of grouped.get(topic) ?? []) {
          if (seenSources.has(item.source.id)) continue;
          seenSources.add(item.source.id);
          try {
            const verified = await fetchVerifiedSource(item.item.url, item.source.allowedHost);
            verifiedSources.push({ ...verified, title: item.item.title });
          } catch { /* an unverified source cannot support generated copy */ }
          if (verifiedSources.length >= 4) break;
        }
        verification = { sourceCount, verifiedSourceCount: verifiedSources.length, sourceUrls: verifiedSources.map((source) => source.url) };
        if (settings.requireTwoSources && verifiedSources.length < 2) reason = "source_verification_insufficient";
        else if (!settings.requireTwoSources && verifiedSources.length < 1) reason = "source_verification_unavailable";
      }
      let generated: GeneratedBlogArticle | undefined;
      if (!reason) {
        try {
          generated = await generateOriginalArticle(topic, verifiedSources, settings, internalLinkCandidates);
          quality = { passed: true, bodyLength: readableSource(generated.bodyHtml).length };
          generated = await attachFeaturedImage(topic, generated, settings);
          candidateStatus = "generated";
          const saved = await saveGeneratedArticle(generated, actorId ?? "system", settings, generated.citations, {
            candidateId: candidateRow.id, topicFingerprint: fingerprint(topic),
          });
          generatedArticleId = saved.id;
          accepted += 1;
          generatedThisPeriod += 1;
        } catch (error) {
          reason = error instanceof Error ? error.message : "ai_generation_failed";
        }
      }
      if (!generated) skipped += 1;
      if (!generated) {
        await db.delete(blogDuplicateTopicFingerprintsTable).where(eq(blogDuplicateTopicFingerprintsTable.id, reservation.id));
        await db.update(blogAutomationCandidatesTable).set({ status: candidateStatus, skipReason: reason, verification, quality })
          .where(eq(blogAutomationCandidatesTable.id, candidateRow.id));
      } else if (!generatedArticleId) {
        // Defensive fallback for a future ephemeral branch: do not leave a
        // reservation that would poison duplicate eligibility.
        await db.delete(blogDuplicateTopicFingerprintsTable).where(eq(blogDuplicateTopicFingerprintsTable.id, reservation.id));
      }
    }
    const summary = { discovered: discovered.length, accepted, skipped, note: "No article is generated without verified sources and configured generation." };
    const [finished] = await db.update(blogAutomationRunsTable).set({ status: "completed", finishedAt: new Date(), summary }).where(eq(blogAutomationRunsTable.id, run.id)).returning();
    clearInterval(heartbeat);
    await db.update(blogAutomationSettingsTable).set({ checkInProgressUntil: null, leaseId: null, updatedAt: new Date() })
      .where(and(eq(blogAutomationSettingsTable.id, "global"), eq(blogAutomationSettingsTable.leaseId, leaseId)));
    return finished;
  } catch (error) {
    clearInterval(heartbeat);
    const [failed] = await db.update(blogAutomationRunsTable).set({ status: "failed", finishedAt: new Date(), error: error instanceof Error ? error.message : "automation_failed" }).where(eq(blogAutomationRunsTable.id, run.id)).returning();
    await db.update(blogAutomationSettingsTable).set({ checkInProgressUntil: null, leaseId: null, updatedAt: new Date() })
      .where(and(eq(blogAutomationSettingsTable.id, "global"), eq(blogAutomationSettingsTable.leaseId, leaseId)));
    return failed;
  }
}

export function scheduledOccurrenceKey(settings: Awaited<ReturnType<typeof getSettings>>, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function scheduledAutomationDue(settings: Awaited<ReturnType<typeof getSettings>>, now = new Date()): boolean {
  if (!settings.enabled || !settings.scheduleAutomatically || !settings.scheduleTimes.length) return false;
  return settings.scheduleTimes.includes(scheduledOccurrenceKey(settings, now).slice(-5));
}

export function automationPeriodStart(settings: Awaited<ReturnType<typeof getSettings>>, now = new Date()): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  let localAsUtc = Date.UTC(year, month - 1, day);
  if (settings.cadenceUnit === "week") {
    const localDate = new Date(localAsUtc);
    localDate.setUTCDate(localDate.getUTCDate() - ((localDate.getUTCDay() + 6) % 7));
    localAsUtc = localDate.getTime();
  }
  // Resolve local midnight by comparing the formatter's local wall clock at
  // an estimate. This handles DST transitions where today's offset differs
  // from the offset at midnight.
  let midnight = localAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const atEstimate = formatter.formatToParts(new Date(midnight));
    const estimateLocalAsUtc = Date.UTC(
      Number(atEstimate.find((part) => part.type === "year")?.value),
      Number(atEstimate.find((part) => part.type === "month")?.value) - 1,
      Number(atEstimate.find((part) => part.type === "day")?.value),
      Number(atEstimate.find((part) => part.type === "hour")?.value),
      Number(atEstimate.find((part) => part.type === "minute")?.value),
      Number(atEstimate.find((part) => part.type === "second")?.value),
    );
    midnight += localAsUtc - estimateLocalAsUtc;
  }
  return new Date(midnight);
}

export function startBlogScheduler() {
  const timer = setInterval(async () => {
    try {
      await reconcileScheduledArticles();
      const settings = await getSettings();
      if (scheduledAutomationDue(settings)) {
        await runBlogAutomation({
          dryRun: false, trigger: "scheduled", occurrenceKey: scheduledOccurrenceKey(settings),
        });
      }
    } catch { /* bounded scheduler retries on the next tick */ }
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

router.get("/blog/articles", async (req, res) => {
  const input = ListBlogArticlesQueryParams.parse(req.query);
  res.json(ListBlogArticlesResponse.parse(await listArticles(input)));
});

router.get("/blog/articles/:slug", async (req, res) => {
  const { slug } = GetBlogArticleParams.parse(req.params);
  const [row] = await db.select().from(blogArticlesTable).where(and(eq(blogArticlesTable.normalizedSlug, normalizeSlug(slug)), eq(blogArticlesTable.status, "published"))).limit(1);
  if (!row) { res.status(404).json({ error: "Article not found" }); return; }
  const result = await detail(row);
  if (!result) { res.status(404).json({ error: "Article not found" }); return; }
  res.json(GetBlogArticleResponse.parse(result));
});

router.get("/blog/categories", async (_req, res) => {
  const rows = await db.select().from(blogCategoriesTable)
    .where(eq(blogCategoriesTable.enabled, true))
    .orderBy(asc(blogCategoriesTable.name), asc(blogCategoriesTable.slug), asc(blogCategoriesTable.id));
  res.json(ListBlogCategoriesResponse.parse(rows));
});

router.get("/admin/blog/articles", requireOperator, async (req, res) => {
  const input = ListAdminBlogArticlesQueryParams.parse(req.query);
  res.json(ListAdminBlogArticlesResponse.parse(await listArticles({ ...input, admin: true })));
});

router.get("/admin/blog/articles/:id", requireOperator, async (req, res) => {
  const { id } = GetAdminBlogArticleParams.parse(req.params);
  const [row] = await db.select().from(blogArticlesTable).where(eq(blogArticlesTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Article not found" }); return; }
  res.json(GetAdminBlogArticleResponse.parse(await detail(row, true)));
});

router.post("/admin/blog/articles", requireOperator, async (req, res) => {
  const input = CreateAdminBlogArticleBody.parse(req.body);
  const slug = normalizeSlug(input.slug);
  if (!SLUG.test(slug)) throw new ApiError("BLOG_SLUG_INVALID", "Slug is invalid.", 400);
  const body = bodyIsSafe(input.body, input.bodyFormat);
  const now = new Date();
  const actor = res.locals.operator.id;
  if (input.status === "scheduled" && !input.scheduledAt) {
    throw new ApiError("BLOG_SCHEDULE_REQUIRED", "Scheduled articles require a scheduled date.", 400);
  }
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(blogArticlesTable).values({
      categoryId: input.categoryId, authorId: actor, authorName: input.authorName?.trim() || "QuickXchange Editorial",
      status: input.status ?? "draft", title: input.title.trim(), slug, normalizedSlug: slug, excerpt: input.excerpt ?? "", body,
      bodyFormat: input.bodyFormat, featuredImagePath: safeImagePath(input.featuredImagePath),
      featuredImageAlt: input.featuredImageAlt ?? null, socialImagePath: safeImagePath(input.socialImagePath),
      isFeatured: input.isFeatured ?? false, readingTimeMinutes: input.readingTimeMinutes ?? 1,
      publishedAt: input.publishedAt ?? (input.status === "published" ? now : null), scheduledAt: input.scheduledAt ?? null,
      seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null, canonicalUrl: safeCanonical(input.canonicalUrl),
      indexPage: input.indexPage ?? true, followLinks: input.followLinks ?? true, generationMetadata: input.generationMetadata ?? {},
      createdBy: actor, updatedBy: actor, createdAt: now, updatedAt: now,
    }).returning();
    await replaceArticleRelations(tx, created.id, input, actor, true);
    if (created.status === "published") {
      await enqueueNewsletterCampaignTx(tx, {
        dedupeKey: newsletterPublicationDedupeKey(created.id, created.publishedAt ?? now),
        title: created.title, description: created.excerpt, readMorePath: `/blog/${created.slug}`,
      });
    }
    return created;
  });
  const output = await detail(row, true);
  res.status(201).json(CreateAdminBlogArticleResponse.parse(output));
});

router.patch("/admin/blog/articles/:id", requireOperator, async (req, res) => {
  const { id } = UpdateAdminBlogArticleParams.parse(req.params);
  const input = UpdateAdminBlogArticleBody.parse(req.body);
  const [existing] = await db.select().from(blogArticlesTable).where(eq(blogArticlesTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Article not found" }); return; }
  const expectedUpdatedAt = input.expectedUpdatedAt;
  assertArticleVersion(existing.updatedAt, expectedUpdatedAt);
  if (!expectedUpdatedAt) throw new ApiError("BLOG_STALE_WRITE", "expectedUpdatedAt is required for article updates.", 409);
  const slug = normalizeSlug(input.slug);
  const body = bodyIsSafe(input.body, input.bodyFormat);
  const nextStatus = input.status ?? existing.status;
  assertArticleTransition(existing.status, nextStatus);
  if (nextStatus === "scheduled" && !(input.scheduledAt ?? existing.scheduledAt)) {
    throw new ApiError("BLOG_SCHEDULE_REQUIRED", "Scheduled articles require a scheduled date.", 400);
  }
  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(blogArticlesTable).set({
      categoryId: input.categoryId, authorId: existing.authorId, authorName: input.authorName?.trim() || existing.authorName || "QuickXchange Editorial",
      status: nextStatus, title: input.title.trim(), slug, normalizedSlug: slug, excerpt: input.excerpt ?? "", body, bodyFormat: input.bodyFormat,
      featuredImagePath: safeImagePath(input.featuredImagePath), featuredImageAlt: input.featuredImageAlt ?? null,
      socialImagePath: safeImagePath(input.socialImagePath),
      isFeatured: input.isFeatured ?? existing.isFeatured,
      readingTimeMinutes: input.readingTimeMinutes ?? existing.readingTimeMinutes,
      publishedAt: input.publishedAt ?? (nextStatus === "published" ? existing.publishedAt ?? now : existing.publishedAt),
      scheduledAt: input.scheduledAt ?? existing.scheduledAt, seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null,
      canonicalUrl: safeCanonical(input.canonicalUrl), indexPage: input.indexPage ?? existing.indexPage, followLinks: input.followLinks ?? existing.followLinks,
      generationMetadata: input.generationMetadata ?? existing.generationMetadata, updatedBy: res.locals.operator.id, updatedAt: now,
    }).where(and(eq(blogArticlesTable.id, id), eq(blogArticlesTable.updatedAt, expectedUpdatedAt))).returning();
    if (!updated) throw new ApiError("BLOG_STALE_WRITE", "Article changed since it was loaded. Reload before saving.", 409);
    await replaceArticleRelations(tx, id, input, res.locals.operator.id, true);
    if (nextStatus === "published" && existing.status !== "published") {
      await enqueueNewsletterCampaignTx(tx, {
         dedupeKey: newsletterPublicationDedupeKey(updated.id, updated.publishedAt ?? now),
        title: updated.title, description: updated.excerpt, readMorePath: `/blog/${updated.slug}`,
      });
    }
    return updated;
  });
  const output = await detail(row, true);
  res.json(UpdateAdminBlogArticleResponse.parse(output));
});

router.delete("/admin/blog/articles/:id", requireOperator, async (req, res) => {
  const { id } = DeleteAdminBlogArticleParams.parse(req.params);
  const now = new Date();
  const [archived] = await db.update(blogArticlesTable).set({
    status: "unpublished",
    scheduledAt: null,
    updatedBy: res.locals.operator.id,
    updatedAt: now,
    generationMetadata: sql`jsonb_set(${blogArticlesTable.generationMetadata}, '{archivedAt}', to_jsonb(${now.toISOString()}::text))`,
  }).where(eq(blogArticlesTable.id, id)).returning({ id: blogArticlesTable.id });
  if (!archived) { res.status(404).json({ error: "Article not found" }); return; }
  res.status(204).end();
});

async function mutateArticle(id: string, res: Response, status: string, scheduledAt?: Date) {
  if (!UUID.test(id)) { res.status(400).json({ error: "Invalid article ID" }); return; }
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select({ status: blogArticlesTable.status }).from(blogArticlesTable).where(eq(blogArticlesTable.id, id)).limit(1);
    if (current) assertArticleTransition(current.status, status);
    const [updated] = await tx.update(blogArticlesTable).set({
      status, scheduledAt: status === "scheduled" ? scheduledAt : null,
      publishedAt: status === "published" ? new Date() : null, updatedBy: res.locals.operator.id, updatedAt: new Date(),
    }).where(and(
      eq(blogArticlesTable.id, id),
      ...(current ? [eq(blogArticlesTable.status, current.status)] : []),
    )).returning();
    if (current && !updated) {
      throw new ApiError("BLOG_PUBLISH_CONFLICT", "Article changed while it was being published. Reload and try again.", 409);
    }
    if (updated && status === "published" && current?.status !== "published") {
      await enqueueNewsletterCampaignTx(tx, {
        dedupeKey: newsletterPublicationDedupeKey(updated.id, updated.publishedAt ?? new Date()),
        title: updated.title, description: updated.excerpt, readMorePath: `/blog/${updated.slug}`,
      });
    }
    return updated;
  });
  if (!row) { res.status(404).json({ error: "Article not found" }); return; }
  return detail(row, true);
}

router.post("/admin/blog/articles/:id/publish", requireOperator, async (req, res) => {
  const params = PublishAdminBlogArticleParams.parse(req.params);
  const output = await mutateArticle(params.id, res, "published");
  res.json(PublishAdminBlogArticleResponse.parse(output));
});
router.post("/admin/blog/articles/:id/unpublish", requireOperator, async (req, res) => {
  const params = UnpublishAdminBlogArticleParams.parse(req.params);
  const output = await mutateArticle(params.id, res, "unpublished");
  res.json(UnpublishAdminBlogArticleResponse.parse(output));
});
router.post("/admin/blog/articles/:id/schedule", requireOperator, async (req, res) => {
  const params = ScheduleAdminBlogArticleParams.parse(req.params);
  const input = ScheduleAdminBlogArticleBody.parse(req.body);
  const output = await mutateArticle(params.id, res, "scheduled", input.scheduledAt);
  res.json(ScheduleAdminBlogArticleResponse.parse(output));
});

router.get("/admin/blog/categories", requireOperator, async (_req, res) => {
  res.json(ListAdminBlogCategoriesResponse.parse(await db.select().from(blogCategoriesTable).orderBy(
    desc(blogCategoriesTable.enabled), asc(blogCategoriesTable.name), asc(blogCategoriesTable.slug), asc(blogCategoriesTable.id),
  )));
});
router.post("/admin/blog/categories", requireOperator, async (req, res) => {
  const input = CreateAdminBlogCategoryBody.parse(req.body);
  const slug = normalizeSlug(input.slug);
  const [row] = await db.insert(blogCategoriesTable).values({ ...input, slug, normalizedSlug: slug, description: input.description ?? "", enabled: input.enabled ?? true, createdBy: res.locals.operator.id, updatedBy: res.locals.operator.id }).returning();
  res.status(201).json(CreateAdminBlogCategoryResponse.parse(row));
});
router.patch("/admin/blog/categories/:id", requireOperator, async (req, res) => {
  const { id } = UpdateAdminBlogCategoryParams.parse(req.params);
  const input = UpdateAdminBlogCategoryBody.parse(req.body);
  const slug = normalizeSlug(input.slug);
  const [row] = await db.update(blogCategoriesTable).set({ ...input, slug, normalizedSlug: slug, description: input.description ?? "", updatedBy: res.locals.operator.id, updatedAt: new Date() }).where(eq(blogCategoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(UpdateAdminBlogCategoryResponse.parse(row));
});
router.delete("/admin/blog/categories/:id", requireOperator, async (req, res) => {
  const { id } = DeleteAdminBlogCategoryParams.parse(req.params);
  const [article] = await db.select({ id: blogArticlesTable.id }).from(blogArticlesTable).where(eq(blogArticlesTable.categoryId, id)).limit(1);
  if (article) throw new ApiError("BLOG_CATEGORY_IN_USE", "A category with articles cannot be deleted.", 409);
  await db.delete(blogCategoriesTable).where(eq(blogCategoriesTable.id, id));
  res.status(204).end();
});

router.get("/admin/blog/settings", requireOperator, async (_req, res) => res.json(GetAdminBlogSettingsResponse.parse(await getSettings())));
router.put("/admin/blog/settings", requireOperator, async (req, res) => {
  const input = UpdateAdminBlogSettingsBody.parse(req.body);
  const current = await getSettings();
  const next = {
    enabled: input.enabled ?? current.enabled,
    reviewFirst: input.reviewFirst ?? current.reviewFirst,
    publishAutomatically: input.publishAutomatically ?? current.publishAutomatically,
    scheduleAutomatically: input.scheduleAutomatically ?? current.scheduleAutomatically,
    requireTwoSources: input.requireTwoSources ?? current.requireTwoSources,
    freshnessWindowMinutes: input.freshnessWindowMinutes ?? current.freshnessWindowMinutes,
    maxCandidatesPerRun: input.maxCandidatesPerRun ?? current.maxCandidatesPerRun,
    cadenceUnit: input.cadenceUnit ?? current.cadenceUnit,
    articlesPerPeriod: input.articlesPerPeriod ?? current.articlesPerPeriod,
    scheduleTimes: input.scheduleTimes ?? current.scheduleTimes,
    timezone: input.timezone ?? current.timezone,
    topics: input.topics ?? current.topics,
    categories: input.categories ?? current.categories,
    keywords: input.keywords ?? current.keywords,
    language: input.language ?? current.language,
    minimumArticleLength: input.minimumArticleLength ?? current.minimumArticleLength,
    publicationMode: input.publicationMode ?? current.publicationMode,
    featuredImageGeneration: input.featuredImageGeneration ?? current.featuredImageGeneration,
    seoGeneration: input.seoGeneration ?? current.seoGeneration,
    seoIndex: input.seoIndex ?? current.seoIndex,
    seoFollow: input.seoFollow ?? current.seoFollow,
    settings: { ...(current.settings ?? {}), ...(input.settings ?? {}) },
  };
  if (next.publicationMode === "auto") next.reviewFirst = false;
  if (next.publicationMode === "auto") next.publishAutomatically = true;
  if (next.publishAutomatically && next.publicationMode !== "auto") {
    throw new ApiError("BLOG_SETTINGS_INVALID", "Automatic publishing requires publicationMode=auto.", 400);
  }
  try { new Intl.DateTimeFormat("en-US", { timeZone: next.timezone }).format(); }
  catch { throw new ApiError("BLOG_SETTINGS_INVALID", "timezone must be a valid IANA timezone.", 400); }
  const [row] = await db.insert(blogAutomationSettingsTable).values({ id: "global", ...next, updatedBy: res.locals.operator.id })
    .onConflictDoUpdate({ target: blogAutomationSettingsTable.id, set: { ...next, updatedBy: res.locals.operator.id, updatedAt: new Date() } }).returning();
  res.json(UpdateAdminBlogSettingsResponse.parse(row));
});

router.post("/admin/blog/images/upload", requireOperator, async (req, res) => {
  const { contentType } = RequestSitePageMediaUploadBody.parse(req.body);
  res.json(RequestSitePageMediaUploadResponse.parse(await createSitePageMediaUpload(contentType)));
});

router.get("/admin/blog/sources", requireOperator, async (_req, res) => res.json(ListAdminBlogSourcesResponse.parse(await db.select().from(blogAutomationSourcesTable))));
router.post("/admin/blog/sources", requireOperator, async (req, res) => {
  const input = CreateAdminBlogSourceBody.parse(req.body);
  const checked = await assertSafeSourceUrl(input.url);
  if (input.sourceType === "coinmarketcap" && !process.env.COINMARKETCAP_API_KEY) throw new ApiError("BLOG_CMC_DISABLED", "CoinMarketCap is disabled until a credential is configured.", 400);
  const [row] = await db.insert(blogAutomationSourcesTable).values({ ...input, url: checked.url, allowedHost: checked.host, enabled: input.enabled ?? false, reliability: input.reliability ?? "standard", config: input.config ?? {}, createdBy: res.locals.operator.id, updatedBy: res.locals.operator.id }).returning();
  res.status(201).json(CreateAdminBlogSourceResponse.parse(row));
});
router.patch("/admin/blog/sources/:id", requireOperator, async (req, res) => {
  const { id } = UpdateAdminBlogSourceParams.parse(req.params);
  const input = UpdateAdminBlogSourceBody.parse(req.body);
  const checked = await assertSafeSourceUrl(input.url);
  if (input.sourceType === "coinmarketcap" && !process.env.COINMARKETCAP_API_KEY) throw new ApiError("BLOG_CMC_DISABLED", "CoinMarketCap is disabled until a credential is configured.", 400);
  const [row] = await db.update(blogAutomationSourcesTable).set({ ...input, url: checked.url, allowedHost: checked.host, updatedBy: res.locals.operator.id, updatedAt: new Date() }).where(eq(blogAutomationSourcesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Source not found" }); return; }
  res.json(UpdateAdminBlogSourceResponse.parse(row));
});
router.delete("/admin/blog/sources/:id", requireOperator, async (req, res) => {
  const { id } = DeleteAdminBlogSourceParams.parse(req.params);
  await db.delete(blogAutomationSourcesTable).where(eq(blogAutomationSourcesTable.id, id));
  res.status(204).end();
});

router.post("/admin/blog/automation/run", requireOperator, async (req, res) => {
  const input = RunBlogAutomationBody.parse(req.body ?? {});
  const run = await runBlogAutomation({ dryRun: input.dryRun, trigger: "manual", actorId: res.locals.operator.id });
  res.status(202).json(RunBlogAutomationResponse.parse(run));
});
router.post("/admin/blog/automation/preview", requireOperator, async (_req, res) => {
  const run = await runBlogAutomation({ dryRun: true, trigger: "preview", actorId: res.locals.operator.id });
  res.json(PreviewBlogAutomationResponse.parse(run));
});

export default router;