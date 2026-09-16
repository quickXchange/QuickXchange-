import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://localhost:5432/quickxchange";
process.env.APP_DATABASE_PASSWORD ??= "test-only";

const blogPromise = import("../src/routes/blog");
const apiZodPromise = import("@workspace/api-zod");
const sanitizerPromise = import("../src/lib/blog-html");

test("blog body validation accepts HTML strings and structured blocks", async () => {
  const blog = await blogPromise;
  assert.equal(blog.bodyIsSafe("<p>Verified copy</p>", "html"), "<p>Verified copy</p>");
  assert.deepEqual(blog.bodyIsSafe([{ type: "paragraph", text: "copy" }], "blocks"), [{ type: "paragraph", text: "copy" }]);
  assert.throws(() => blog.bodyIsSafe({ html: "<p>wrong pairing</p>" }, "html"), /HTML articles/);
  assert.throws(() => blog.bodyIsSafe("<script>alert(1)</script>", "html"), /HTML/);
});

test("blog HTML sanitizer drops XSS vectors and malformed dangerous markup", async () => {
  const { sanitizeBlogHtml } = await sanitizerPromise;
  const clean = sanitizeBlogHtml(`<p onclick="alert(1)" style="background:url(javascript:alert(1))">ok</p><svg><script>alert(1)</script></svg><a href="javascript:alert(1)" srcdoc="x">link</a><img src="data:text/html,<script>x</script>" onerror="alert(1)">`);
  assert.match(clean, /<p>ok<\/p>/);
  assert.doesNotMatch(clean, /onclick|style|javascript|srcdoc|<svg|<script|onerror|data:/i);
});

test("blog HTML sanitizer preserves only approved QuickXchange service classes", async () => {
  const { sanitizeBlogHtml } = await sanitizerPromise;
  const clean = sanitizeBlogHtml(`<figure class="qx-service-visual qx-service-widget arbitrary-class"><p class="qx-service-kicker unsafe">Preview</p><a class="qx-service-action other" href="/swap">Start Swap</a></figure>`);
  assert.match(clean, /class="qx-service-visual qx-service-widget"/);
  assert.match(clean, /class="qx-service-kicker"/);
  assert.match(clean, /class="qx-service-action"/);
  assert.doesNotMatch(clean, /arbitrary-class|unsafe|other/);
});

test("AI generation is structured, source-bound, and supports internal links", async () => {
  const blog = await blogPromise;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      title: "A verified crypto update",
      excerpt: "A source-bound summary of the verified update.",
      bodyHtml: `<p>${"Verified facts ".repeat(40)}</p>`,
      category: "Crypto News",
      tags: ["crypto", "news"],
      citations: [{ sourceUrl: "https://news.example/article", claim: "The source reports this update." }],
      internalLinks: [{ slug: "security-guide", anchor: "Security guide" }],
    }) } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://ai.example/v1";
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
  try {
    const generated = await blog.generateOriginalArticle("crypto update", [{
      url: "https://news.example/article", title: "Source", text: "Verified source content ".repeat(20),
    }], {
      language: "en", minimumArticleLength: 100, categories: ["Crypto News"], keywords: [],
    } as never, [{ slug: "security-guide", title: "Security guide" }]);
    assert.equal(generated.citations[0]?.sourceUrl, "https://news.example/article");
    assert.equal(generated.internalLinks?.[0]?.slug, "security-guide");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  }
});

test("admin article detail contract includes draft relations and validates ids", async () => {
  const { GetAdminBlogArticleParams, GetAdminBlogArticleResponse } = await apiZodPromise;
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(GetAdminBlogArticleParams.parse({ id }).id, id);
  assert.throws(() => GetAdminBlogArticleParams.parse({ id: "not-an-id" }));
  const detail = GetAdminBlogArticleResponse.parse({
    id,
    categoryId: id,
    authorId: "operator-1",
    authorName: "Editorial",
    status: "draft",
    title: "Draft",
    slug: "draft",
    excerpt: "",
    body: "<p>Draft body</p>",
    bodyFormat: "html",
    featuredImagePath: null,
    featuredImageAlt: null,
    socialImagePath: null,
    isFeatured: false,
    readingTimeMinutes: 7,
    publishedAt: null,
    scheduledAt: null,
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    indexPage: true,
    followLinks: true,
    generationMetadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id, name: "Guides", slug: "guides", description: "", enabled: true, createdAt: new Date(), updatedAt: new Date() },
    tags: [{ id, name: "draft", slug: "draft", normalizedSlug: "draft", createdBy: "operator-1", createdAt: new Date(), updatedAt: new Date() }],
    citations: [{ id, articleId: id, sourceUrl: "https://example.com/source", sourceTitle: "Source", publisher: "Publisher", retrievedAt: new Date(), claim: "Claim", sourcePublishedAt: null, createdAt: new Date() }],
    related: [],
    previousArticle: null,
    nextArticle: null,
  });
  assert.equal(detail.status, "draft");
  assert.equal(detail.tags.length, 1);
  assert.equal(detail.citations.length, 1);
});

test("scheduler timing and stale-write guards are explicit", async () => {
  const blog = await blogPromise;
  const settings = {
    enabled: true, scheduleAutomatically: true, scheduleTimes: ["12:00"], timezone: "UTC",
  } as never;
  assert.equal(blog.scheduledAutomationDue(settings, new Date("2024-01-01T12:00:00.000Z")), true);
  assert.equal(blog.scheduledOccurrenceKey(settings, new Date("2024-01-01T12:00:00.000Z")), "2024-01-01T12:00");
  assert.equal(blog.scheduledAutomationDue({ ...settings, enabled: false }, new Date("2024-01-01T12:00:00.000Z")), false);
  const current = new Date("2024-01-01T12:00:00.000Z");
  assert.doesNotThrow(() => blog.assertArticleVersion(current, new Date(current)));
  assert.throws(() => blog.assertArticleVersion(current, new Date("2024-01-01T12:00:01.000Z")), /changed/);
  assert.throws(() => blog.assertArticleVersion(current, undefined), /changed/);
});

test("automation period starts use local timezone boundaries across DST and positive offsets", async () => {
  const blog = await blogPromise;
  const ny = { timezone: "America/New_York", cadenceUnit: "day" } as never;
  assert.equal(blog.automationPeriodStart(ny, new Date("2024-03-10T05:30:00.000Z")).toISOString(), "2024-03-10T05:00:00.000Z");
  assert.equal(blog.automationPeriodStart(ny, new Date("2024-03-10T07:30:00.000Z")).toISOString(), "2024-03-10T05:00:00.000Z");
  const tokyo = { timezone: "Asia/Tokyo", cadenceUnit: "day" } as never;
  assert.equal(blog.automationPeriodStart(tokyo, new Date("2024-03-10T15:30:00.000Z")).toISOString(), "2024-03-10T15:00:00.000Z");
});

test("source redirects are revalidated and pinned DNS dispatch is supplied", async () => {
  const blog = await blogPromise;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    assert.ok((init as RequestInit & { dispatcher?: unknown }).dispatcher);
    return new Response("", {
      status: 302,
      headers: { location: "https://private.example/escape" },
    });
  };
  try {
    await assert.rejects(
      blog.fetchSafeSourceResource("https://public.example/feed", {}, "public.example", async () => [{ address: "93.184.216.34", family: 4 }]),
      /private network|private|unsafe|source/i,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("outbound DNS destinations reject mapped, link-local, and reserved ranges", async () => {
  const blog = await blogPromise;
  for (const address of ["::ffff:127.0.0.1", "::ffff:7f00:1", "fe80::1", "fe90::1", "fea0::1", "feb0::1", "198.18.0.1", "2001:db8::1"]) {
    assert.equal(blog.privateAddress(address), true, address);
  }
  assert.equal(blog.privateAddress("2001:4860:4860::8888"), false);
});

test("featured image toggle, branded composition, fallback, normalization, and namespace upload", async () => {
  const blog = await blogPromise;
  const storage = await import("../src/lib/object-storage");
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const originalApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://ai.example/v1";
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
  process.env.PRIVATE_OBJECT_DIR = "/private";
  let imageCalls = 0;
  let uploadCalls = 0;
  storage.configureObjectStorageBackendForTests({
    createUpload: async () => ({ uploadURL: "https://upload.test/presigned", objectPath: "/objects/site-page-media/00000000-0000-4000-8000-000000000123" }),
    getObject: () => { throw new Error("not used"); },
  });
  const article = () => ({
    title: "Verified editorial update", excerpt: "Verified summary", bodyHtml: `<p>${"Verified ".repeat(30)}</p>`,
    category: "Crypto News", tags: [], citations: [],
  });
  try {
    globalThis.fetch = async (_url, init) => {
      uploadCalls += 1;
      assert.equal(init?.method, "PUT");
      assert.equal((init?.headers as Record<string, string>)["content-type"], "image/webp");
      assert.equal((init?.headers as Record<string, string>)["content-length"], undefined);
      return new Response(null, { status: 200 });
    };
    const disabled = await blog.attachFeaturedImage("verified topic", article(), { featuredImageGeneration: false } as never);
    assert.equal(imageCalls, 0);
    assert.equal(disabled.featuredImagePath, undefined);
    assert.equal(disabled.imageGeneration?.outcome, "disabled");
    const enabled = await blog.attachFeaturedImage("verified topic", article(), { featuredImageGeneration: true } as never);
    assert.equal(imageCalls, 0);
    assert.equal(uploadCalls, 1);
    assert.match(enabled.featuredImagePath ?? "", /^\/objects\/site-page-media\//);
    assert.equal(enabled.imageGeneration?.outcome, "uploaded");
    const cover = await blog.composeQuickXchangeCover(null, article(), "verified topic");
    assert.equal(cover.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(cover.subarray(8, 12).toString("ascii"), "WEBP");
    const swap = await blog.attachFeaturedImage("Swap ETH for USDC", { ...article(), title: "Swap ETH for USDC", category: "Exchange" }, { featuredImageGeneration: true } as never);
    assert.equal(swap.imageGeneration?.template, "swap");
    assert.deepEqual(swap.imageGeneration?.assets, ["ETH", "USDC"]);
    assert.equal(swap.imageGeneration?.width, 1200);
    assert.equal(swap.imageGeneration?.height, 675);
  } finally {
    storage.configureObjectStorageBackendForTests(undefined);
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    else process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = originalBaseUrl;
    if (originalApiKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = originalApiKey;
  }
});