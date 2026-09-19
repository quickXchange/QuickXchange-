import assert from "node:assert/strict";
import test, { before } from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createPrivilegedTestPool } from "@workspace/db/test-admin";

let apiUrl = "";
let server: import("node:http").Server;
let database: typeof import("@workspace/db");
let storage: typeof import("../src/lib/object-storage");
let privilegedPool: ReturnType<typeof createPrivilegedTestPool>;
const publicationRevisionIds = new Set<string>();
const publicationAuditIds = new Set<string>();
const partnerIds = new Set<string>();
const socialTrustIds = new Set<string>();
const pageKeys = new Set<string>();
const objects = new Map<string, { bytes: Buffer; contentType: string; deleted: boolean }>();
const persistedFixtureImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const TEST_MARKER = "__site-content-routes-fixture__";
const operatorUser = `${TEST_MARKER}-operator`;
const ownerUser = `${TEST_MARKER}-owner`;

async function cleanupMarkedRows(): Promise<void> {
  const client = await privilegedPool.connect();
  try {
    await client.query("BEGIN");
    const operators = await client.query<{ id: string }>(
      "select id from desk_operators where email like $1 or clerk_user_id like $1",
      [`${TEST_MARKER}%`],
    );
    const markedOperatorIds = operators.rows.map((row) => row.id);
    const publicationRows = await client.query<{ id: string }>(
      "select id from site_publication_revisions where created_by = any($1::text[])",
      [markedOperatorIds],
    );
    const markedPublicationIds = [
      ...new Set([...publicationRevisionIds, ...publicationRows.rows.map((row) => row.id)]),
    ];
    const partners = await client.query<{ id: string }>(
      "select id from site_partner_logos where name like $1",
      [`${TEST_MARKER}%`],
    );
    const markedPartnerIds = [
      ...new Set([...partnerIds, ...partners.rows.map((row) => row.id)]),
    ];
    const socialTrustRows = await client.query<{ id: string }>(
      "select id from site_social_trust_links where name like $1",
      [`${TEST_MARKER}%`],
    );
    const markedSocialTrustIds = [
      ...new Set([...socialTrustIds, ...socialTrustRows.rows.map((row) => row.id)]),
    ];
    const auditRows = await client.query<{ id: string }>(
      `select id from site_content_audit_logs
       where publication_revision_id = any($1::uuid[])
          or target_id = any($2::uuid[])
          or target_id = any($3::uuid[])`,
      [markedPublicationIds, markedPartnerIds, markedSocialTrustIds],
    );
    const markedAuditIds = [
      ...new Set([
        ...publicationAuditIds,
        ...auditRows.rows.map((row) => row.id),
      ]),
    ];
    await client.query("alter table site_content_revisions disable trigger user");
    await client.query("alter table site_content_audit_logs disable trigger user");
    await client.query("alter table site_publication_revisions disable trigger user");
    if (markedAuditIds.length) {
      await client.query("delete from site_content_audit_logs where id = any($1::uuid[])", [markedAuditIds]);
    }
    if (pageKeys.size) {
      await client.query(
        "delete from site_content_audit_logs where page_key = any($1::text[])",
        [[...pageKeys]],
      );
      await client.query(
        "delete from site_content_revisions where page_key = any($1::text[])",
        [[...pageKeys]],
      );
    }
    if (markedPublicationIds.length) {
      await client.query("delete from site_publication_revisions where id = any($1::uuid[])", [markedPublicationIds]);
    }
    await client.query("alter table site_publication_revisions enable trigger user");
    await client.query("alter table site_content_audit_logs enable trigger user");
    await client.query("alter table site_content_revisions enable trigger user");
    if (markedPartnerIds.length) {
      await client.query("delete from site_partner_logos where id = any($1::uuid[])", [markedPartnerIds]);
    }
    if (markedSocialTrustIds.length) {
      await client.query("delete from site_social_trust_links where id = any($1::uuid[])", [markedSocialTrustIds]);
    }
    if (markedOperatorIds.length) {
      await client.query("delete from desk_operator_audit_logs where target_operator_id = any($1::uuid[])", [markedOperatorIds]);
      await client.query("delete from desk_operators where id = any($1::uuid[])", [markedOperatorIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function request(path: string, options: RequestInit = {}, userId?: string) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(userId ? { "x-test-clerk-user-id": userId } : {}),
    },
  });
  return { response, body: await response.text() };
}

before(async (t) => {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.SESSION_SECRET = "site-content-route-test-secret";
  process.env.OBJECT_STORAGE_BACKEND = "gcs";
  process.env.PRIVATE_OBJECT_DIR = "/portable-private/assets";
  database = await import("@workspace/db");
  privilegedPool = createPrivilegedTestPool();
  await cleanupMarkedRows();
  const operatorAuth = await import("../src/lib/operator-auth");
  storage = await import("../src/lib/object-storage");
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  storage.configureObjectStorageBackendForTests({
    createUpload: async () => "https://storage.test/upload",
    getObject: (_bucket, name) => {
      const object = objects.get(name);
      return {
         // Persisted fixture rows may reference real development objects that
         // are outside this test's in-memory object map. Treat those as present
         // while retaining exact lifecycle control for objects created here.
         exists: async () => object ? !object.deleted : true,
         metadata: async () => ({ contentType: object?.contentType ?? "image/png", size: object?.bytes.length ?? persistedFixtureImage.length }),
         download: async () => object?.bytes ?? persistedFixtureImage,
        delete: async () => { if (object) object.deleted = true; },
      };
    },
  });
  const [operator] = await database.db.insert(database.operatorsTable).values({
    clerkUserId: operatorUser, email: `${operatorUser}@example.test`, role: "operator", status: "active",
    permissionAllows: [
      "site_settings.view",
      "site_settings.manage",
      "social_media.view",
      "social_media.manage",
    ],
  }).returning();
  const [owner] = await database.db.insert(database.operatorsTable).values({
    clerkUserId: ownerUser, email: `${ownerUser}@example.test`, role: "owner", status: "active",
  }).returning();
  if (!operator.id || !owner.id) throw new Error("Test operators were not created");
  const { default: app } = await import("../src/app");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api`;
  t.after(async () => {
    try {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } finally {
      storage.configureObjectStorageBackendForTests(undefined);
      try {
        await cleanupMarkedRows();
      } finally {
        await privilegedPool.end();
        await database.pool.end();
      }
    }
  });
});

test("admin partner preview resolves the active draft record before its object path", { concurrency: false }, async () => {
  const objectId = randomUUID();
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#123456" } }).png().toBuffer();
  objects.set(`assets/partner-logos/${objectId}`, { bytes, contentType: "image/png", deleted: false });
  const created = await request("/admin/partner-logos", {
    method: "POST",
    body: JSON.stringify({
      name: `${TEST_MARKER}-draft`, objectPath: `/objects/partner-logos/${objectId}`, enabled: true,
    }),
  }, operatorUser);
  assert.equal(created.response.status, 201, created.body);
  const record = JSON.parse(created.body) as { id: string };
  partnerIds.add(record.id);
  assert.notEqual(record.id, objectId);
  const previewResponse = await fetch(`${apiUrl}/admin/partner-logos/${record.id}/preview`, {
    headers: { "x-test-clerk-user-id": operatorUser },
  });
  assert.equal(previewResponse.status, 200);
  assert.equal(previewResponse.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await previewResponse.arrayBuffer()), bytes);
  const unauthorized = await request(`/admin/partner-logos/${record.id}/preview`);
  assert.equal(unauthorized.response.status, 401);
  const missing = await request(`/admin/partner-logos/${randomUUID()}/preview`, {}, operatorUser);
  assert.equal(missing.response.status, 404);
});

test("disable, publish, re-enable, and publish preserves the draft logo object", { concurrency: false }, async () => {
  const objectId = randomUUID();
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#abcdef" } }).png().toBuffer();
  objects.set(`assets/partner-logos/${objectId}`, { bytes, contentType: "image/png", deleted: false });
  const created = await request("/admin/partner-logos", {
    method: "POST",
    body: JSON.stringify({
      name: `${TEST_MARKER}-toggle`, objectPath: `/objects/partner-logos/${objectId}`, enabled: true,
    }),
  }, operatorUser);
  assert.equal(created.response.status, 201, created.body);
  const record = JSON.parse(created.body) as { id: string };
  partnerIds.add(record.id);
  for (const [index, expectedStatus] of [201, 201, 201].entries()) {
    const published = await request("/admin/site-publication", { method: "POST" }, ownerUser);
    if (published.body) {
      try {
        const publication = JSON.parse(published.body) as { id?: string };
        if (publication.id) {
          publicationRevisionIds.add(publication.id);
          const auditRows = await privilegedPool.query<{ id: string }>(
            "select id from site_content_audit_logs where publication_revision_id = $1",
            [publication.id],
          );
          for (const audit of auditRows.rows) publicationAuditIds.add(audit.id);
        }
      } catch { /* assertion below reports malformed responses */ }
    }
    assert.equal(published.response.status, expectedStatus, published.body);
    if (index === 0) {
      const disabled = await request(`/admin/partner-logos/${record.id}`, {
        method: "PATCH", body: JSON.stringify({ enabled: false }),
      }, operatorUser);
      assert.equal(disabled.response.status, 200);
    } else if (index === 1) {
      const enabled = await request(`/admin/partner-logos/${record.id}`, {
        method: "PATCH", body: JSON.stringify({ enabled: true }),
      }, operatorUser);
      assert.equal(enabled.response.status, 200);
    }
  }
  assert.equal(objects.get(`assets/partner-logos/${objectId}`)?.deleted, false);
});

test("public site content serves the newest publication and redacts hidden page copy", { concurrency: false }, async () => {
  const pageKey = `route-test-${randomUUID().slice(0, 8)}`;
  pageKeys.add(pageKey);

  for (const [title, enabled] of [["First publication", true], ["Newest publication", true], ["Hidden publication", false]] as const) {
    const saved = await request(`/admin/site-content/${pageKey}`, {
      method: "PUT",
      body: JSON.stringify({ content: { title, visibility: { enabled } } }),
    }, operatorUser);
    assert.equal(saved.response.status, 201, saved.body);
    const published = await request(`/admin/site-content/${pageKey}`, { method: "POST" }, ownerUser);
    assert.equal(published.response.status, 200, published.body);
  }

  const publicContent = await request("/site-content");
  assert.equal(publicContent.response.status, 200, publicContent.body);
  const page = (JSON.parse(publicContent.body) as {
    pages: Array<{ pageKey: string; content: Record<string, unknown> }>;
  }).pages.find((candidate) => candidate.pageKey === pageKey);
  assert.deepEqual(page?.content, { visibility: { enabled: false } });

  const individual = await request(`/site-content/${pageKey}`);
  assert.equal(individual.response.status, 404, individual.body);
});

test("order terms acceptance is shared, validated, and published immediately by authorized Admins", { concurrency: false }, async () => {
  const pageKey = "order-terms-acceptance";
  pageKeys.add(pageKey);
  const content = {
    mainText: "I accept the",
    termsLabel: "Terms & Conditions",
    termsUrl: "/terms",
    privacyLabel: "Privacy Policy",
    privacyUrl: "/privacy",
    amlLabel: "AML/KYC Policy",
    amlUrl: "/aml-kyc",
  };
  const saved = await request(`/admin/site-content/${pageKey}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  }, operatorUser);
  assert.equal(saved.response.status, 201, saved.body);
  assert.equal((JSON.parse(saved.body) as { status: string }).status, "published");

  const publicContent = await request("/site-content");
  assert.equal(publicContent.response.status, 200, publicContent.body);
  const page = (JSON.parse(publicContent.body) as {
    pages: Array<{ pageKey: string; content: Record<string, unknown> }>;
  }).pages.find((candidate) => candidate.pageKey === pageKey);
  assert.deepEqual(page?.content, content);

  const unsafe = await request(`/admin/site-content/${pageKey}`, {
    method: "PUT",
    body: JSON.stringify({ content: { ...content, termsUrl: "javascript:alert(1)" } }),
  }, operatorUser);
  assert.equal(unsafe.response.status, 400, unsafe.body);

  for (const [field, invalidRoute] of [
    ["termsUrl", "/terms-conditions"],
    ["privacyUrl", "/privacy-policy"],
    ["amlUrl", "/aml-kyc-policy"],
  ] as const) {
    const brokenInternalRoute = await request(`/admin/site-content/${pageKey}`, {
      method: "PUT",
      body: JSON.stringify({ content: { ...content, [field]: invalidRoute } }),
    }, operatorUser);
    assert.equal(brokenInternalRoute.response.status, 400, brokenInternalRoute.body);
  }

  const nonOwnerPublish = await request(`/admin/site-content/${pageKey}`, { method: "POST" }, operatorUser);
  assert.equal(nonOwnerPublish.response.status, 403, nonOwnerPublish.body);
});

test("social and trust drafts become public only through owner publication", { concurrency: false }, async () => {
  const originalDraftResponse = await request("/admin/social-trust", {}, operatorUser);
  assert.equal(originalDraftResponse.response.status, 200, originalDraftResponse.body);
  const originalDraft = JSON.parse(originalDraftResponse.body) as {
    instagramUrl: string | null;
    xUrl: string | null;
    facebookUrl: string | null;
    telegramUrl: string | null;
    appearance: {
      iconSize: number;
      logoSize: number;
      circleSize: number;
      borderThickness: number;
      radiusMode: "circle" | "rounded" | "square";
      backgroundColor: string;
      borderColor: string;
      glowColor: string;
      glowIntensity: number;
      iconOpacity: number;
    };
  };
  const appearance = {
    iconSize: 20,
    logoSize: 64,
    circleSize: 42,
    borderThickness: 2,
    radiusMode: "rounded",
    backgroundColor: "#172033",
    borderColor: "#4f5f7a",
    glowColor: "#6366f1",
    glowIntensity: 35,
    iconOpacity: 88,
  };
  const invalidSocialMedia = await request("/admin/social-trust/social-media", {
    method: "PUT",
    body: JSON.stringify({
      instagramUrl: "javascript:alert(1)",
      xUrl: null,
      facebookUrl: null,
      telegramUrl: null,
    }),
  }, operatorUser);
  assert.equal(invalidSocialMedia.response.status, 400);

  const invalidAppearance = await request("/admin/social-trust/social-media", {
    method: "PUT",
    body: JSON.stringify({
      instagramUrl: null,
      xUrl: null,
      facebookUrl: null,
      telegramUrl: null,
      appearance: { ...appearance, circleSize: 200 },
    }),
  }, operatorUser);
  assert.equal(invalidAppearance.response.status, 400);

  const socialMedia = await request("/admin/social-trust/social-media", {
    method: "PUT",
    body: JSON.stringify({
      instagramUrl: "https://instagram.com/quickxchange",
      xUrl: "https://x.com/quickxchange",
      facebookUrl: "https://facebook.com/quickxchange",
      telegramUrl: "https://t.me/quickxchange",
      appearance,
    }),
  }, operatorUser);
  assert.equal(socialMedia.response.status, 200, socialMedia.body);

  const objectId = randomUUID();
  const bytes = await sharp({ create: { width: 3, height: 3, channels: 4, background: "#abcdef" } }).png().toBuffer();
  objects.set(`assets/social-trust-icons/${objectId}`, { bytes, contentType: "image/png", deleted: false });

  const created = await request("/admin/social-trust/items", {
    method: "POST",
    body: JSON.stringify({
      group: "social",
      name: `${TEST_MARKER}-community`,
      href: "https://community.example.test/exact/path?from=footer",
      objectPath: `/objects/social-trust-icons/${objectId}`,
      enabled: true,
    }),
  }, operatorUser);
  assert.equal(created.response.status, 201, created.body);
  const item = JSON.parse(created.body) as { id: string };
  socialTrustIds.add(item.id);

  const beforePublish = await request(`/storage/objects/social-trust-icons/${objectId}`);
  assert.equal(beforePublish.response.status, 404);
  const operatorPublish = await request("/admin/site-publication", { method: "POST" }, operatorUser);
  assert.equal(operatorPublish.response.status, 403);

  const published = await request("/admin/site-publication", { method: "POST" }, ownerUser);
  assert.equal(published.response.status, 201, published.body);
  const publication = JSON.parse(published.body) as { id: string };
  publicationRevisionIds.add(publication.id);

  const publicContent = await request("/site-content");
  assert.equal(publicContent.response.status, 200, publicContent.body);
  const configured = (JSON.parse(publicContent.body) as {
    socialTrust: {
      instagramUrl: string | null;
      xUrl: string | null;
      facebookUrl: string | null;
      telegramUrl: string | null;
      appearance: typeof appearance;
      items: Array<{ id: string; href: string }>;
    };
  }).socialTrust;
  assert.equal(configured.instagramUrl, "https://instagram.com/quickxchange");
  assert.equal(configured.xUrl, "https://x.com/quickxchange");
  assert.equal(configured.facebookUrl, "https://facebook.com/quickxchange");
  assert.equal(configured.telegramUrl, "https://t.me/quickxchange");
  assert.deepEqual(configured.appearance, appearance);
  const configuredItem = configured.items.find((candidate) => candidate.id === item.id);
  assert.equal(configuredItem?.href, "https://community.example.test/exact/path?from=footer");

  const icon = await fetch(`${apiUrl}/storage/objects/social-trust-icons/${objectId}`);
  assert.equal(icon.status, 200);
  assert.deepEqual(Buffer.from(await icon.arrayBuffer()), bytes);

  const removedIcon = await request(`/admin/social-trust/items/${item.id}`, {
    method: "PATCH",
    body: JSON.stringify({ objectPath: null }),
  }, operatorUser);
  assert.equal(removedIcon.response.status, 200, removedIcon.body);
  assert.equal((JSON.parse(removedIcon.body) as { objectPath: string | null }).objectPath, null);
  assert.equal((await fetch(`${apiUrl}/storage/objects/social-trust-icons/${objectId}`)).status, 200);

  const removed = await request(`/admin/social-trust/items/${item.id}`, { method: "DELETE" }, operatorUser);
  assert.equal(removed.response.status, 204, removed.body);
  assert.equal((await fetch(`${apiUrl}/storage/objects/social-trust-icons/${objectId}`)).status, 200);

  const clearedSocialMedia = await request("/admin/social-trust/social-media", {
    method: "PUT",
    body: JSON.stringify({
      instagramUrl: originalDraft.instagramUrl,
      xUrl: originalDraft.xUrl,
      facebookUrl: originalDraft.facebookUrl,
      telegramUrl: originalDraft.telegramUrl,
      appearance: originalDraft.appearance,
    }),
  }, operatorUser);
  assert.equal(clearedSocialMedia.response.status, 200, clearedSocialMedia.body);

  const removalPublication = await request("/admin/site-publication", { method: "POST" }, ownerUser);
  assert.equal(removalPublication.response.status, 201, removalPublication.body);
  const removalRevision = JSON.parse(removalPublication.body) as { id: string };
  publicationRevisionIds.add(removalRevision.id);
  assert.equal((await fetch(`${apiUrl}/storage/objects/social-trust-icons/${objectId}`)).status, 404);
  assert.equal(objects.get(`assets/social-trust-icons/${objectId}`)?.deleted, true);
});