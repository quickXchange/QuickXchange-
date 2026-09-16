import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sanitizeHtml from "sanitize-html";

const TARGET_HOST = "quickchange.exchange";
const ACCESS_PATH = "/__site-access";
const COOKIE_NAME = "qx_site_access";
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const MAX_FORM_BYTES = 8 * 1024;
const DEFAULT_PUBLIC_DIR = fileURLToPath(
  new URL("./dist/public/", import.meta.url),
);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function firstHeaderValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim();
}

export function effectiveHost(headers) {
  const raw =
    firstHeaderValue(headers["x-forwarded-host"]) ||
    firstHeaderValue(headers.host) ||
    "";
  return raw.toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

function clientIp(req) {
  return (
    firstHeaderValue(req.headers["x-forwarded-for"]) ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function cookieValue(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function accessToken(password) {
  return createHmac("sha256", password)
    .update(`${TARGET_HOST}:browser-session:v1`)
    .digest("base64url");
}

function equalSecret(left, right) {
  const leftHash = createHmac("sha256", "quickxchange-access-compare")
    .update(left)
    .digest();
  const rightHash = createHmac("sha256", "quickxchange-access-compare")
    .update(right)
    .digest();
  return timingSafeEqual(leftHash, rightHash);
}

function hasAccess(req, password) {
  const token = cookieValue(req, COOKIE_NAME);
  return Boolean(token && equalSecret(token, accessToken(password)));
}

function isAdminPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function accessPage({ error = "", status = 200 } = {}) {
  const errorMarkup = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : '<p class="error error-placeholder" aria-hidden="true">&nbsp;</p>';
  return {
    status,
    body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Private Access | QuickXchange</title>
  <style>
    :root { color-scheme: light dark; --bg: #f5f7ff; --card: rgba(255,255,255,.9); --text: #15182a; --muted: #676b82; --border: rgba(37,140,255,.24); --input: rgba(255,255,255,.88); --cyan: #13ddf4; --blue: #258cff; --purple: #7a2cff; --shadow: inset 0 0 36px rgba(19,221,244,.08), inset 0 -18px 42px rgba(122,44,255,.07), 0 28px 80px rgba(37,140,255,.16), 0 12px 42px rgba(122,44,255,.12); }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; overflow: hidden; color: var(--text); background: var(--bg); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body::before { content: ""; position: fixed; inset: -25%; background: radial-gradient(circle at 20% 25%, rgba(43,121,255,.32), transparent 34%), radial-gradient(circle at 78% 72%, rgba(129,61,246,.3), transparent 36%), linear-gradient(135deg, rgba(39,118,255,.12), rgba(132,58,239,.14)); filter: blur(12px); z-index: -1; }
    .card { width: min(100%, 430px); padding: 38px 34px 32px; text-align: center; border: 1px solid var(--border); border-radius: 28px; background: var(--card); box-shadow: var(--shadow); backdrop-filter: blur(20px); }
    .logo { display: block; width: min(220px, 72%); height: auto; margin: 0 auto 28px; }
    .logo-dark { display: none; }
    h1 { margin: 0; font-size: clamp(27px, 7vw, 34px); line-height: 1.12; letter-spacing: -.035em; }
    .subtitle { margin: 13px auto 24px; max-width: 330px; color: var(--muted); font-size: 15px; line-height: 1.55; }
    form { text-align: left; }
    label { display: block; margin: 0 0 8px; font-size: 13px; font-weight: 750; }
    input { width: 100%; height: 52px; padding: 0 16px; color: var(--text); border: 1px solid var(--border); border-radius: 14px; outline: none; background: var(--input); box-shadow: inset 0 0 18px rgba(19,221,244,.05), inset 0 -8px 20px rgba(122,44,255,.04); font: inherit; transition: border-color .18s, box-shadow .18s; }
    input:focus { border-color: var(--blue); box-shadow: inset 0 0 22px rgba(19,221,244,.08), inset 0 -10px 24px rgba(122,44,255,.07), 0 0 0 4px rgba(37,140,255,.13), 0 8px 24px rgba(122,44,255,.1); }
    button { width: 100%; height: 52px; margin-top: 4px; border: 1px solid rgba(255,255,255,.22); border-radius: 14px; color: #fff; background: linear-gradient(115deg, var(--cyan) 0%, var(--blue) 48%, var(--purple) 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,.28), inset 0 -10px 24px rgba(76,29,149,.14), 0 12px 28px rgba(37,140,255,.24), 0 7px 22px rgba(122,44,255,.2); font: 750 15px/1 inherit; cursor: pointer; transition: transform .18s, box-shadow .18s; }
    button:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.32), inset 0 -10px 24px rgba(76,29,149,.16), 0 15px 34px rgba(37,140,255,.3), 0 9px 26px rgba(122,44,255,.24); }
    button:focus-visible { outline: 3px solid rgba(37,140,255,.32); outline-offset: 3px; }
    .error { min-height: 20px; margin: 9px 0 5px; color: #6f35d5; font-size: 13px; font-weight: 700; }
    .footnote { margin: 18px 0 0; color: var(--muted); font-size: 12px; }
    @media (max-width: 480px) { .card { padding: 32px 22px 27px; border-radius: 23px; } }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #080914; --card: rgba(12,17,35,.9); --text: #f7f7ff; --muted: #a7abc0; --border: rgba(37,140,255,.25); --input: rgba(7,12,28,.8); --shadow: inset 0 0 38px rgba(19,221,244,.07), inset 0 -20px 46px rgba(122,44,255,.1), 0 30px 90px rgba(0,0,0,.46), 0 16px 46px rgba(37,140,255,.13), 0 8px 32px rgba(122,44,255,.12); }
      body::before { background: radial-gradient(circle at 18% 20%, rgba(25,105,255,.28), transparent 34%), radial-gradient(circle at 82% 76%, rgba(139,48,238,.28), transparent 36%); }
      .logo-light { display: none; }
      .logo-dark { display: block; }
      .error { color: #bca7ff; }
    }
  </style>
</head>
<body>
  <main class="card">
    <img class="logo logo-light" src="/brand/quickxchange-header-light.png" alt="QuickXchange" />
    <img class="logo logo-dark" src="/brand/quickxchange-header-dark.png" alt="QuickXchange" />
    <h1>Verification Required</h1>
    <p class="subtitle">Enter the password to continue to QuickXchange.</p>
    <form method="post" action="${ACCESS_PATH}">
      <label for="access-code">Password</label>
      <input id="access-code" name="accessCode" type="password" autocomplete="current-password" required autofocus />
      ${errorMarkup}
      <button type="submit">Continue</button>
    </form>
    <p class="footnote">Secure session access</p>
  </main>
</body>
</html>`,
  };
}

function sendHtml(res, page) {
  const body = Buffer.from(page.body);
  res.writeHead(page.status, {
    "cache-control": "no-store",
    "content-length": String(body.length),
    "content-security-policy":
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  res.end(body);
}

function readForm(req) {
  return new Promise((resolveForm, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_FORM_BYTES) {
        reject(new Error("FORM_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      resolveForm(params);
    });
    req.on("error", reject);
  });
}

function safeStaticFile(publicDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const relative = normalize(decoded).replace(/^[/\\]+/, "");
  const candidate = resolve(publicDir, relative);
  const root = resolve(publicDir);
  if (candidate !== root && !candidate.startsWith(`${root}/`)) return undefined;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return undefined;
  return candidate;
}

function serveFile(req, res, filePath) {
  const stat = statSync(filePath);
  res.writeHead(200, {
    "cache-control": extname(filePath) === ".html"
      ? "no-cache"
      : "public, max-age=31536000, immutable",
    "content-length": String(stat.size),
    "content-type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function requestOrigin(req) {
  const proto = firstHeaderValue(req.headers["x-forwarded-proto"]) || "http";
  const host = effectiveHost(req.headers);
  // Never let an arbitrary Host header become an external fetch target or a
  // canonical URL. Reverse proxies provide the original host in this value.
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? host : "localhost";
  return `${proto === "https" ? "https" : "http"}://${safeHost}`;
}

function blogApiOrigin(req) {
  const configured = process.env.BLOG_API_ORIGIN?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return parsed.origin;
      }
    } catch {
      // Fall through to the same-deployment origin.
    }
  }
  return requestOrigin(req);
}

function escapeJsonLd(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

function bodyText(body) {
  if (typeof body === "string") return body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!body || typeof body !== "object") return "";
  return Object.values(body).flatMap((value) => bodyText(value)).join(" ").replace(/\s+/g, " ").trim();
}

function safeArticleHtml(article) {
  if (article.bodyFormat === "html" && article.body && (typeof article.body === "string" || typeof article.body === "object")) {
    const html = typeof article.body === "string"
      ? article.body
      : typeof article.body.html === "string" ? article.body.html : bodyText(article.body);
    // Keep the renderer defensive for rows written before the shared
    // write-boundary sanitizer existed.
    return sanitizeHtml(html, {
      allowedTags: ["p", "br", "h2", "h3", "h4", "strong", "em", "u", "s", "blockquote", "ul", "ol", "li", "a", "img", "figure", "figcaption", "code", "pre"],
      allowedAttributes: {
        a: ["href", "title", "rel", "target"],
        img: ["src", "alt", "title", "width", "height", "loading"],
      },
      allowedSchemes: ["http", "https", "mailto"],
      allowedSchemesByTag: { img: ["http", "https"] },
      allowProtocolRelative: false,
      disallowedTagsMode: "discard",
      enforceHtmlBoundary: true,
      parser: { lowerCaseTags: true },
    }).trim();
  }
  const text = escapeHtml(bodyText(article.body));
  return text ? `<p>${text}</p>` : "";
}

function blogMeta({ title, description, canonical, image, robots = "index, follow" }) {
  return `<title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="${escapeHtml(robots)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="675" /><meta name="twitter:image" content="${escapeHtml(image)}" />` : ""}`;
}

async function fetchBlog(req, path) {
  const response = await fetch(`${blogApiOrigin(req)}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return undefined;
  return response.json();
}

function renderBlogIndex(req, data) {
  const origin = requestOrigin(req);
  const canonical = `${origin}/blog`;
  const items = Array.isArray(data?.items) ? data.items : [];
  const cards = items.map((article) => {
    const url = `/blog/${encodeURIComponent(article.slug)}`;
    const image = article.featuredImagePath ? `/api/storage${article.featuredImagePath}` : "";
    return `<article class="blog-card"><a href="${url}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(article.featuredImageAlt || "")}" loading="lazy" width="1200" height="675" />` : ""}<h2>${escapeHtml(article.title)}</h2><p>${escapeHtml(article.excerpt || "")}</p></a></article>`;
  }).join("");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "QuickXchange Blog",
    url: canonical,
    mainEntity: { "@type": "ItemList", itemListElement: items.map((article, index) => ({ "@type": "ListItem", position: index + 1, url: `${origin}/blog/${article.slug}`, name: article.title })) },
  };
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${blogMeta({ title: "QuickXchange Blog", description: "Insights and updates from QuickXchange.", canonical })}</head><body><header><nav aria-label="Breadcrumb"><a href="/">QuickXchange</a> <span aria-hidden="true">/</span> <span>Blog</span></nav><h1>QuickXchange Blog</h1></header><main>${cards || "<p>No published articles are available.</p>"}</main><script type="application/ld+json">${escapeJsonLd(jsonLd)}</script></body></html>`;
}

function renderBlogArticle(req, article) {
  const origin = requestOrigin(req);
  const canonical = article.canonicalUrl || `${origin}/blog/${article.slug}`;
  const image = article.socialImagePath || article.featuredImagePath;
  const imageUrl = image ? `${origin}/api/storage${image}` : "";
  const description = article.seoDescription || article.excerpt || "";
  const robots = `${article.indexPage === false ? "noindex" : "index"}, ${article.followLinks === false ? "nofollow" : "follow"}`;
  const related = (article.related || []).map((item) => `<li><a href="/blog/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></li>`).join("");
  const citations = (article.citations || []).map((citation) => `<li><a rel="nofollow noopener" href="${escapeHtml(citation.sourceUrl)}">${escapeHtml(citation.sourceTitle || citation.publisher || citation.sourceUrl)}</a></li>`).join("");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    mainEntityOfPage: canonical,
    ...(imageUrl ? { image: imageUrl } : {}),
    author: { "@type": "Person", name: article.authorName || "QuickXchange Editorial" },
  };
  const imageMarkup = article.featuredImagePath ? `<img src="${escapeHtml(`${origin}/api/storage${article.featuredImagePath}`)}" alt="${escapeHtml(article.featuredImageAlt || "")}" width="1200" height="675" fetchpriority="high" />` : "";
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${blogMeta({ title: article.seoTitle || article.title, description, canonical, image: imageUrl, robots })}</head><body><nav aria-label="Breadcrumb"><a href="/">QuickXchange</a> <span aria-hidden="true">/</span> <a href="/blog">Blog</a> <span aria-hidden="true">/</span> <span>${escapeHtml(article.title)}</span></nav><main><article><header><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.excerpt || "")}</p>${article.authorName ? `<p>By ${escapeHtml(article.authorName)}</p>` : ""}${imageMarkup}</header><section>${safeArticleHtml(article)}</section>${citations ? `<footer><h2>Sources</h2><ul>${citations}</ul></footer>` : ""}</article>${related ? `<aside><h2>Related articles</h2><ul>${related}</ul></aside>` : ""}</main><script type="application/ld+json">${escapeJsonLd(jsonLd)}</script></body></html>`;
}

async function renderSitemap(req) {
  const origin = requestOrigin(req);
  const entries = [`<url><loc>${escapeHtml(`${origin}/blog`)}</loc></url>`];
  let page = 1;
  while (page <= 20) {
    let data;
    try {
      data = await fetchBlog(req, `/api/blog/articles?page=${page}&pageSize=50`);
    } catch {
      break;
    }
    if (!data?.items?.length) break;
    for (const article of data.items) {
      if (article.status !== "published") continue;
      const canonical = article.canonicalUrl || `${origin}/blog/${encodeURIComponent(article.slug)}`;
      entries.push(`<url><loc>${escapeHtml(canonical)}</loc>${article.updatedAt ? `<lastmod>${escapeHtml(article.updatedAt)}</lastmod>` : ""}</url>`);
    }
    if (data.items.length < 50) break;
    page += 1;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`;
}

export function createProductionServer({
  publicDir = DEFAULT_PUBLIC_DIR,
  password = process.env.SITE_ACCESS_PASSWORD,
  now = () => Date.now(),
} = {}) {
  const attempts = new Map();

  return createHttpServer(async (req, res) => {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", "http://localhost");
    const protectedHost = effectiveHost(req.headers) === TARGET_HOST;
    const staticFile = safeStaticFile(publicDir, url.pathname);
    const publicAsset =
      staticFile && extname(staticFile).toLowerCase() !== ".html";
    const publicSeoPath =
      url.pathname === "/blog" ||
      url.pathname === "/blog/" ||
      url.pathname.startsWith("/blog/") ||
      url.pathname === "/sitemap.xml" ||
      url.pathname === "/robots.txt";

    if (publicSeoPath && (method === "GET" || method === "HEAD")) {
      try {
        if (url.pathname === "/sitemap.xml") {
          const body = Buffer.from(await renderSitemap(req));
          res.writeHead(200, {
            "cache-control": "public, max-age=300",
            "content-type": "application/xml; charset=utf-8",
            "content-length": String(body.length),
            "x-content-type-options": "nosniff",
          });
          if (method === "HEAD") res.end();
          else res.end(body);
          return;
        }
        if (url.pathname === "/robots.txt") {
          const body = Buffer.from(`User-agent: *\nAllow: /blog\nDisallow: /admin\nSitemap: ${requestOrigin(req)}/sitemap.xml\n`);
          res.writeHead(200, {
            "cache-control": "public, max-age=300",
            "content-type": "text/plain; charset=utf-8",
            "content-length": String(body.length),
            "x-content-type-options": "nosniff",
          });
          if (method === "HEAD") res.end();
          else res.end(body);
          return;
        }
        const slug = url.pathname.replace(/^\/blog\/?/, "");
        const data = slug
          ? await fetchBlog(req, `/api/blog/articles/${encodeURIComponent(slug)}`)
          : await fetchBlog(req, "/api/blog/articles?page=1&pageSize=50");
        const page = slug
          ? data
            ? { status: 200, body: renderBlogArticle(req, data) }
            : { status: 404, body: renderBlogIndex(req, undefined) }
          : { status: 200, body: renderBlogIndex(req, data) };
        sendHtml(res, page);
        return;
      } catch {
        // A transient API failure must not leak a draft or turn the static app
        // into an error page. Render an empty, crawlable public index instead.
        sendHtml(res, { status: 200, body: renderBlogIndex(req, undefined) });
        return;
      }
    }

    if (
      protectedHost &&
      url.pathname === ACCESS_PATH &&
      method === "POST"
    ) {
      if (!password) {
        sendHtml(res, accessPage({ error: "Access is temporarily unavailable.", status: 503 }));
        return;
      }

      const ip = clientIp(req);
      const current = attempts.get(ip);
      const active =
        current && now() - current.startedAt < RATE_LIMIT_WINDOW_MS
          ? current
          : { count: 0, startedAt: now() };
      if (active.count >= RATE_LIMIT_MAX_ATTEMPTS) {
        sendHtml(res, accessPage({
          error: "Too many attempts. Please try again later.",
          status: 429,
        }));
        return;
      }

      try {
        const form = await readForm(req);
        const submitted = form.get("accessCode") || "";
        if (!equalSecret(submitted, password)) {
          attempts.set(ip, { ...active, count: active.count + 1 });
          sendHtml(res, accessPage({ error: "Incorrect access code", status: 401 }));
          return;
        }
      } catch {
        res.writeHead(400, { "content-length": "0" });
        res.end();
        return;
      }

      attempts.delete(ip);
      res.writeHead(303, {
        "cache-control": "no-store",
        location: "/",
        "set-cookie": `${COOKIE_NAME}=${accessToken(password)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      });
      res.end();
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD", "content-length": "0" });
      res.end();
      return;
    }

    if (
      protectedHost &&
      !isAdminPath(url.pathname) &&
      !publicAsset &&
      !publicSeoPath &&
      (!password || !hasAccess(req, password))
    ) {
      sendHtml(
        res,
        password
          ? accessPage()
          : accessPage({ error: "Access is temporarily unavailable.", status: 503 }),
      );
      return;
    }

    const filePath = staticFile || join(publicDir, "index.html");
    if (!existsSync(filePath)) {
      res.writeHead(503, { "content-length": "0" });
      res.end();
      return;
    }
    serveFile(req, res, filePath);
  });
}

const isEntrypoint =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const port = Number.parseInt(process.env.PORT || "19375", 10);
  createProductionServer().listen(port, "0.0.0.0");
}