import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createProductionServer, effectiveHost } from "./server.mjs";

let baseUrl;
let server;

before(async () => {
  const publicDir = await mkdtemp(join(tmpdir(), "quickxchange-access-"));
  await writeFile(join(publicDir, "index.html"), "<h1>PRIVATE APP CONTENT</h1>");
  await writeFile(join(publicDir, "logo-light.svg"), "<svg></svg>");
  server = createProductionServer({
    publicDir,
    password: "test-only-password",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      "x-forwarded-host": "quickchange.exchange",
      ...(options.headers || {}),
    },
  });
}

test("uses the original forwarded host and exact production domain", () => {
  assert.equal(
    effectiveHost({
      host: "internal.example",
      "x-forwarded-host": "quickchange.exchange, proxy.internal",
    }),
    "quickchange.exchange",
  );
  assert.equal(
    effectiveHost({ host: "www.quickchange.exchange" }),
    "www.quickchange.exchange",
  );
});

test("gates the homepage, direct index, and every public SPA route before app HTML", async () => {
  for (const path of ["/", "/index.html", "/convert", "/account/orders/123"]) {
    const response = await request(path);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Verification Required/);
    assert.match(body, /\/brand\/quickxchange-header-light\.png/);
    assert.match(body, /\/brand\/quickxchange-header-dark\.png/);
    assert.match(body, /Enter the password to continue to QuickXchange/);
    assert.doesNotMatch(body, /PRIVATE APP CONTENT/);
  }
});

test("leaves Admin and non-target domains unchanged", async () => {
  const admin = await request("/admin/providers");
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /PRIVATE APP CONTENT/);

  const preview = await request("/", {
    headers: { "x-forwarded-host": "example.replit.app" },
  });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /PRIVATE APP CONTENT/);
});

test("shows the requested error for a wrong password", async () => {
  const response = await request("/__site-access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "accessCode=wrong",
  });
  assert.equal(response.status, 401);
  assert.match(await response.text(), /Incorrect access code/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("sets an HttpOnly session cookie and unlocks public routes", async () => {
  const login = await request("/__site-access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "accessCode=test-only-password",
  });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), "/");
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /qx_site_access=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /Max-Age|Expires/);

  const unlocked = await request("/convert", {
    headers: { cookie: cookie.split(";")[0] },
  });
  assert.equal(unlocked.status, 200);
  assert.match(await unlocked.text(), /PRIVATE APP CONTENT/);
});

test("rate limits repeated incorrect attempts", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request("/__site-access", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "203.0.113.42",
      },
      body: "accessCode=wrong",
    });
    assert.equal(response.status, 401);
  }

  const limited = await request("/__site-access", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "203.0.113.42",
    },
    body: "accessCode=test-only-password",
  });
  assert.equal(limited.status, 429);
});

test("serves crawlable blog metadata, robots, and sitemap without the private gate", async () => {
  process.env.BLOG_API_ORIGIN = baseUrl;
  const blog = await request("/blog");
  assert.equal(blog.status, 200);
  const blogBody = await blog.text();
  assert.match(blogBody, /<h1>QuickXchange Blog<\/h1>/);
  assert.match(blogBody, /rel="canonical"/);
  assert.match(blogBody, /application\/ld\+json/);

  const robots = await request("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: .*\/sitemap\.xml/);

  const sitemap = await request("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /<urlset/);
});