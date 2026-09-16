import assert from "node:assert/strict";
import test from "node:test";
import { before } from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  GetLandingBackgroundResponse,
  PublishLandingBackgroundBody,
  RequestLandingBackgroundUploadBody,
} from "@workspace/api-zod";
import {
  validateLandingBackgroundImage,
  validatePaymentMethodLogoImage,
} from "../src/lib/object-storage";
import sharp from "sharp";

let apiUrl = "";
let closeApi: (() => Promise<void>) | undefined;
let database: typeof import("@workspace/db");
const settingIds = new Set<string>();
const auditIds = new Set<string>();
const operatorIds = new Set<string>();
let validPng: Buffer;
let validJpeg: Buffer;
let validWebp: Buffer;

async function request(path: string, options: RequestInit = {}, userId?: string) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(userId ? { "x-test-clerk-user-id": userId } : {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : undefined };
}

async function cleanup(): Promise<void> {
  if (closeApi) await closeApi();
  // These tables are intentionally append-only. The native suite runs with the
  // migration owner URL, so remove only this test's rows after disabling its
  // user triggers for the cleanup statement.
  if (auditIds.size || settingIds.size) {
    await database.db.execute(sql`alter table landing_background_audit_logs disable trigger user`);
    await database.db.execute(sql`alter table landing_background_settings disable trigger user`);
    if (auditIds.size) await database.db.delete(database.landingBackgroundAuditLogsTable)
      .where(inArray(database.landingBackgroundAuditLogsTable.id, [...auditIds]));
    if (settingIds.size) await database.db.delete(database.landingBackgroundSettingsTable)
      .where(inArray(database.landingBackgroundSettingsTable.id, [...settingIds]));
    await database.db.execute(sql`alter table landing_background_settings enable trigger user`);
    await database.db.execute(sql`alter table landing_background_audit_logs enable trigger user`);
  }
  if (operatorIds.size) await database.db.delete(database.operatorsTable)
    .where(inArray(database.operatorsTable.id, [...operatorIds]));
}

before(async (t) => {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.SESSION_SECRET = "landing-background-test-secret";
  database = await import("@workspace/db");
  // Register as soon as database access exists so partially failed API setup
  // still removes only this invocation's tracked rows.
  t.after(cleanup);
  [validPng, validJpeg, validWebp] = await Promise.all([
    sharp({ create: { width: 2, height: 2, channels: 3, background: "#123456" } }).png().toBuffer(),
    sharp({ create: { width: 2, height: 2, channels: 3, background: "#123456" } }).jpeg().toBuffer(),
    sharp({ create: { width: 2, height: 2, channels: 3, background: "#123456" } }).webp().toBuffer(),
  ]);
  const operatorAuth = await import("../src/lib/operator-auth");
  const storage = await import("../src/lib/object-storage");
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: () => null,
  });
  storage.configureLandingBackgroundStorageForTests({
    createUpload: async (contentType) => ({
      uploadURL: "https://storage.test/signed-upload",
      objectPath: `/objects/landing-backgrounds/${randomUUID()}`,
      ...(contentType ? {} : {}),
    }),
    get: async (path) => ({
      buffer: path.endsWith("00000000-0000-4000-8000-000000000000") ? Buffer.from("not an image") : validPng,
      contentType: path.endsWith("22222222-2222-4222-8222-222222222222") ? "image/svg+xml" : "image/png",
      ...(path.endsWith("33333333-3333-4333-8333-333333333333") ? { size: 10 * 1024 * 1024 + 1 } : {}),
    }),
  });
  const { default: app } = await import("../src/app");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api`;
  closeApi = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve));
});

async function seedOperator(role: "owner" | "operator", userId: string) {
  const [operator] = await database.db.insert(database.operatorsTable).values({
    email: `${userId}-${randomUUID()}@example.test`,
    clerkUserId: userId,
    role,
    status: "active",
  }).returning();
  operatorIds.add(operator.id);
  return operator;
}

const presets = [
  "neon-orbit",
  "crystal-ledger",
  "quantum-grid",
  "liquid-token",
  "aurora-chain",
  "prism-vault",
  "network-bloom",
  "electric-canyon",
  "cosmic-exchange",
  "blueprint-future",
] as const;

const placementsFor = (key: string, placement = { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 }) => ({
  [key]: { desktop: placement, mobile: placement },
});

test("public landing background contract accepts the deterministic default", () => {
  assert.deepEqual(GetLandingBackgroundResponse.parse({
    mode: "preset",
    presetId: "neon-orbit",
    customObjectPath: null,
    focalX: 50,
    focalY: 50,
    desktopPlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    mobilePlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
  }), {
    mode: "preset",
    presetId: "neon-orbit",
    customObjectPath: null,
    focalX: 50,
    focalY: 50,
    desktopPlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    mobilePlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
  });
});

test("byte validation fully decodes bounded PNG, JPEG, and WebP payloads", async () => {
  await validateLandingBackgroundImage("image/png", validPng);
  await validateLandingBackgroundImage("image/jpeg", validJpeg);
  await validateLandingBackgroundImage("image/webp", validWebp);
  const oversized = await sharp({ create: { width: 8_193, height: 1, channels: 3, background: "#000" } }).png().toBuffer();
  for (const [contentType, bytes] of [
    ["image/png", Buffer.from("not an image")],
    ["image/jpeg", validPng],
    ["image/png", oversized],
    ["image/jpeg", validJpeg.subarray(0, -2)],
    ["image/webp", Buffer.from("RIFFxxxxWEBP")],
  ] as const) {
    await assert.rejects(() => validateLandingBackgroundImage(contentType, bytes));
  }
});

test("payment-method logo validation accepts safe SVG and rejects active or mismatched content", async () => {
  const safeSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.mark{fill:#2563eb}</style><circle class="mark" cx="16" cy="16" r="15"/></svg>',
  );
  await validatePaymentMethodLogoImage("image/svg+xml", safeSvg);
  await validatePaymentMethodLogoImage("image/png", validPng);
  for (const [contentType, bytes] of [
    ["image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/logo.png"/></svg>')],
    ["image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')],
    ["image/png", safeSvg],
    ["image/svg+xml", validPng],
  ] as const) {
    await assert.rejects(() => validatePaymentMethodLogoImage(contentType, bytes));
  }
});

test("publish contract accepts exactly the ten preset identifiers", () => {
  for (const presetId of presets) {
    assert.equal(PublishLandingBackgroundBody.parse({
      mode: "preset",
      presetId,
      focalX: 0,
      focalY: 100,
      placements: placementsFor(presetId),
    }).presetId, presetId);
  }
  assert.throws(() => PublishLandingBackgroundBody.parse({
    mode: "preset",
    presetId: "arbitrary-css",
    focalX: 50,
    focalY: 50,
  }));
});

test("custom publication only accepts its private generated object namespace", () => {
  const objectPath = "/objects/landing-backgrounds/550e8400-e29b-41d4-a716-446655440000";
  assert.equal(PublishLandingBackgroundBody.parse({
    mode: "custom",
    customObjectPath: objectPath,
    focalX: 25,
    focalY: 75,
    placements: placementsFor(objectPath),
  }).customObjectPath, objectPath);
  for (const customObjectPath of [
    "https://example.test/background.png",
    "/objects/payment-method-logos/550e8400-e29b-41d4-a716-446655440000",
    "linear-gradient(red, blue)",
    "/objects/landing-backgrounds/../../secret",
  ]) {
    assert.throws(() => PublishLandingBackgroundBody.parse({
      mode: "custom",
      customObjectPath,
      focalX: 50,
      focalY: 50,
    }));
  }
});

test("focal points and upload metadata are bounded", () => {
  assert.throws(() => PublishLandingBackgroundBody.parse({
    mode: "preset",
    presetId: "neon-orbit",
    placements: placementsFor("neon-orbit", { x: 101, y: 50, zoom: 100, opacity: 100, blur: 0 }),
  }));
  assert.throws(() => RequestLandingBackgroundUploadBody.parse({
    name: "background.png",
    contentType: "image/svg+xml",
    size: 100,
  }));
  assert.throws(() => RequestLandingBackgroundUploadBody.parse({
    name: "background.png",
    contentType: "image/png",
    size: 10 * 1024 * 1024 + 1,
  }));
});

test("publish parser enforces placement map keys, size, active source, and strict nested shapes", () => {
  const placement = {
    desktop: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
  };
  const parse = (placements: Record<string, unknown>) => PublishLandingBackgroundBody.parse({
    mode: "preset",
    presetId: "neon-orbit",
    placements,
  });

  assert.throws(() => parse({ "not-a-background": placement }));
  assert.throws(() => parse({ "quantum-grid": placement }));
  assert.throws(() => parse({
    "neon-orbit": {
      ...placement,
      desktop: { ...placement.desktop, unexpected: true },
    },
  }));
  assert.throws(() => parse({
    "neon-orbit": {
      desktop: { x: 50, y: 50, zoom: 100, opacity: 100 },
      mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    },
  }));
  for (const opacity of [-1, 101, 1.5]) {
    assert.throws(() => parse({
      "neon-orbit": {
        desktop: { x: 50, y: 50, zoom: 100, opacity, blur: 0 },
        mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
      },
    }));
  }
  for (const blur of [-1, 31, 1.5]) {
    assert.throws(() => parse({
      "neon-orbit": {
        desktop: { x: 50, y: 50, zoom: 100, opacity: 100, blur },
        mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
      },
    }));
  }

  const oversized = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
    `/objects/landing-backgrounds/${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
    placement,
  ]));
  oversized["neon-orbit"] = placement;
  assert.throws(() => parse(oversized));
});

test("publication rejects unknown, missing, and oversized placement maps", async () => {
  const owner = await seedOperator("owner", `landing-placements-owner-${randomUUID()}`);
  const post = (placements: Record<string, unknown>) => request("/admin/landing-background", {
    method: "POST",
    body: JSON.stringify({ mode: "preset", presetId: "neon-orbit", placements }),
  }, owner.clerkUserId!);
  const placement = { desktop: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 }, mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 } };
  assert.equal((await post({ "not-a-background": placement })).status, 400);
  assert.equal((await post({ "quantum-grid": placement })).status, 400);
  assert.equal((await post({
    "neon-orbit": {
      desktop: { x: 50, y: 50, zoom: 100, opacity: 101, blur: 0 },
      mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    },
  })).status, 400);
  assert.equal((await post({
    "neon-orbit": {
      desktop: { x: 50, y: 50, zoom: 100, opacity: 100 },
      mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    },
  })).status, 400);
  assert.equal((await post({
    "neon-orbit": {
      desktop: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 31 },
      mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    },
  })).status, 400);
  // The submitted map has 91 entries, but the server also retains ten preset
  // defaults from the prior version, so the merged map must be rejected.
  const oversized = Object.fromEntries(Array.from({ length: 91 }, (_, index) => [
    `/objects/landing-backgrounds/${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
    placement,
  ]));
  oversized["neon-orbit"] = placement;
  assert.equal((await post(oversized)).status, 400);
});

test("routes enforce roles, publish an immutable version, and expose safe settings", async () => {
  const publicBefore = await request("/landing-background");
  const rowsBefore = await database.db.select().from(database.landingBackgroundSettingsTable);
  if (rowsBefore.length === 0) {
    assert.deepEqual(publicBefore.body, {
      mode: "preset", presetId: "neon-orbit", customObjectPath: null, focalX: 50, focalY: 50,
      desktopPlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 }, mobilePlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    });
  }

  const operator = await seedOperator("operator", `landing-operator-${randomUUID()}`);
  const owner = await seedOperator("owner", `landing-owner-${randomUUID()}`);
  assert.equal((await request("/admin/landing-background", {}, operator.clerkUserId!)).status, 200);
  assert.equal((await request("/admin/landing-background", {
    method: "POST",
    body: JSON.stringify({ mode: "preset", presetId: "neon-orbit", placements: placementsFor("neon-orbit", { x: 30, y: 70, zoom: 100, opacity: 100, blur: 0 }) }),
  }, operator.clerkUserId!)).status, 403);
  assert.equal((await request("/admin/landing-background/upload", {
    method: "POST", body: JSON.stringify({ name: "bg.png", contentType: "image/png", size: 100 }),
  }, operator.clerkUserId!)).status, 403);

  const published = await request("/admin/landing-background", {
    method: "POST",
    body: JSON.stringify({
      mode: "preset",
      presetId: "quantum-grid",
      placements: {
        "quantum-grid": {
          desktop: { x: 30, y: 70, zoom: 125, opacity: 42, blur: 12 },
          mobile: { x: 64, y: 36, zoom: 135, opacity: 73, blur: 30 },
        },
        "aurora-chain": {
          desktop: { x: 11, y: 22, zoom: 110, opacity: 0, blur: 7 },
          mobile: { x: 33, y: 44, zoom: 120, opacity: 100, blur: 19 },
        },
      },
    }),
  }, owner.clerkUserId!);
  assert.equal(published.status, 201);
  assert.equal(published.body?.presetId, "quantum-grid");
  assert.equal(published.body?.focalX, 30);
  assert.deepEqual(published.body?.desktopPlacement, { x: 30, y: 70, zoom: 125, opacity: 42, blur: 12 });
  assert.deepEqual(published.body?.mobilePlacement, { x: 64, y: 36, zoom: 135, opacity: 73, blur: 30 });
  const version = published.body?.version as number;
  const [setting] = await database.db.select().from(database.landingBackgroundSettingsTable)
    .orderBy(desc(database.landingBackgroundSettingsTable.version)).limit(1);
  settingIds.add(setting.id);
  const [audit] = await database.db.select().from(database.landingBackgroundAuditLogsTable)
    .where(eq(database.landingBackgroundAuditLogsTable.settingId, setting.id));
  auditIds.add(audit.id);
  assert.equal(audit.actorId, owner.id);
  assert.equal(audit.version, version);
  assert.deepEqual((setting.placements as Record<string, unknown>)["aurora-chain"], {
    desktop: { x: 11, y: 22, zoom: 110, opacity: 0, blur: 7 },
    mobile: { x: 33, y: 44, zoom: 120, opacity: 100, blur: 19 },
  });
  assert.deepEqual((audit.details as Record<string, Record<string, unknown>>).placements["aurora-chain"], {
    desktop: { x: 11, y: 22, zoom: 110, opacity: 0, blur: 7 },
    mobile: { x: 33, y: 44, zoom: 120, opacity: 100, blur: 19 },
  });
  assert.deepEqual((await request("/landing-background")).body, {
    mode: "preset", presetId: "quantum-grid", customObjectPath: null, focalX: 30, focalY: 70,
    desktopPlacement: { x: 30, y: 70, zoom: 125, opacity: 42, blur: 12 }, mobilePlacement: { x: 64, y: 36, zoom: 135, opacity: 73, blur: 30 },
  });
  assert.equal((await request("/admin/landing-background", {}, owner.clerkUserId!)).body?.version, version);
  const republished = await request("/admin/landing-background", {
    method: "POST",
    body: JSON.stringify({ mode: "preset", presetId: "neon-orbit", placements: placementsFor("neon-orbit") }),
  }, owner.clerkUserId!);
  assert.equal(republished.status, 201);
  assert.deepEqual(republished.body?.placements && (republished.body.placements as Record<string, unknown>)["aurora-chain"], {
    desktop: { x: 11, y: 22, zoom: 110, opacity: 0, blur: 7 },
    mobile: { x: 33, y: 44, zoom: 120, opacity: 100, blur: 19 },
  });
  const [republishedSetting] = await database.db.select().from(database.landingBackgroundSettingsTable)
    .orderBy(desc(database.landingBackgroundSettingsTable.version)).limit(1);
  settingIds.add(republishedSetting.id);
  const [republishedAudit] = await database.db.select().from(database.landingBackgroundAuditLogsTable)
    .where(eq(database.landingBackgroundAuditLogsTable.settingId, republishedSetting.id));
  auditIds.add(republishedAudit.id);
  assert.deepEqual((republishedSetting.placements as Record<string, unknown>)["aurora-chain"], {
    desktop: { x: 11, y: 22, zoom: 110, opacity: 0, blur: 7 },
    mobile: { x: 33, y: 44, zoom: 120, opacity: 100, blur: 19 },
  });
  assert.deepEqual((republishedAudit.details as Record<string, Record<string, unknown>>).placements["aurora-chain"], {
    desktop: { x: 11, y: 22, zoom: 110, opacity: 0, blur: 7 },
    mobile: { x: 33, y: 44, zoom: 120, opacity: 100, blur: 19 },
  });

  for (const body of [
    { mode: "preset", presetId: "bad", focalX: 50, focalY: 50 },
    { mode: "custom", customObjectPath: "https://bad.test/a.png", focalX: 50, focalY: 50 },
    { mode: "preset", presetId: "neon-orbit", focalX: -1, focalY: 50 },
    {
      mode: "custom",
      customObjectPath: "/objects/landing-backgrounds/00000000-0000-4000-8000-000000000000",
      focalX: 50,
      focalY: 50,
    },
  ]) assert.equal((await request("/admin/landing-background", {
    method: "POST", body: JSON.stringify(body),
  }, owner.clerkUserId!)).status, 400);

  const upload = await request("/admin/landing-background/upload", {
    method: "POST", body: JSON.stringify({ name: "bg.png", contentType: "image/webp", size: 10 * 1024 * 1024 }),
  }, owner.clerkUserId!);
  assert.equal(upload.status, 200);
  assert.match(upload.body?.objectPath as string, /^\/objects\/landing-backgrounds\//);
  const validImage = await fetch(`${apiUrl}/storage/objects/landing-backgrounds/11111111-1111-4111-8111-111111111111`);
  assert.equal(validImage.status, 200);
  assert.equal(validImage.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await validImage.arrayBuffer()), validPng);
  const invalidImage = await fetch(`${apiUrl}/storage/objects/landing-backgrounds/00000000-0000-4000-8000-000000000000`);
  assert.equal(invalidImage.status, 415);
  assert.equal((await fetch(`${apiUrl}/storage/objects/landing-backgrounds/22222222-2222-4222-8222-222222222222`)).status, 415);
  assert.equal((await fetch(`${apiUrl}/storage/objects/landing-backgrounds/33333333-3333-4333-8333-333333333333`)).status, 415);
});

test("legacy empty placement rows normalize their active source from focal coordinates", async () => {
  const [latest] = await database.db.select({ version: database.landingBackgroundSettingsTable.version })
    .from(database.landingBackgroundSettingsTable)
    .orderBy(desc(database.landingBackgroundSettingsTable.version))
    .limit(1);
  const [legacy] = await database.db.insert(database.landingBackgroundSettingsTable).values({
    version: (latest?.version ?? 0) + 1,
    mode: "preset",
    presetId: "aurora-chain",
    focalX: 17,
    focalY: 83,
    placements: {},
    createdBy: "legacy-test",
  }).returning();
  settingIds.add(legacy.id);
  assert.deepEqual((await request("/landing-background")).body, {
    mode: "preset",
    presetId: "aurora-chain",
    customObjectPath: null,
    focalX: 17,
    focalY: 83,
    desktopPlacement: { x: 17, y: 83, zoom: 100, opacity: 100, blur: 0 },
    mobilePlacement: { x: 17, y: 83, zoom: 100, opacity: 100, blur: 0 },
  });
});

test("legacy placement points preserve valid values and normalize missing opacity and blur", async () => {
  const [latest] = await database.db.select({ version: database.landingBackgroundSettingsTable.version })
    .from(database.landingBackgroundSettingsTable)
    .orderBy(desc(database.landingBackgroundSettingsTable.version))
    .limit(1);
  const legacyPlacements = {
    "crystal-ledger": {
      desktop: { x: 9, y: 81, zoom: 119 },
      mobile: { x: 67, y: 23, zoom: 141, opacity: 58 },
    },
  };
  const [legacy] = await database.db.insert(database.landingBackgroundSettingsTable).values({
    version: (latest?.version ?? 0) + 1,
    mode: "preset",
    presetId: "crystal-ledger",
    focalX: 50,
    focalY: 50,
    placements: legacyPlacements as unknown as Record<string, import("@workspace/db").LandingBackgroundPlacement>,
    createdBy: "legacy-opacity-test",
  }).returning();
  settingIds.add(legacy.id);

  const publicResult = await request("/landing-background");
  assert.deepEqual(publicResult.body?.desktopPlacement, { x: 9, y: 81, zoom: 119, opacity: 100, blur: 0 });
  assert.deepEqual(publicResult.body?.mobilePlacement, { x: 67, y: 23, zoom: 141, opacity: 58, blur: 0 });

  const operator = await seedOperator("operator", `legacy-opacity-operator-${randomUUID()}`);
  const admin = await request("/admin/landing-background", {}, operator.clerkUserId!);
  assert.deepEqual(
    admin.body?.placements && (admin.body.placements as Record<string, unknown>)["crystal-ledger"],
    {
      desktop: { x: 9, y: 81, zoom: 119, opacity: 100, blur: 0 },
      mobile: { x: 67, y: 23, zoom: 141, opacity: 58, blur: 0 },
    },
  );
});