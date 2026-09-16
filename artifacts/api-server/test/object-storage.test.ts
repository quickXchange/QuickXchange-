import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import sharp from "sharp";
import {
  configureObjectStorageBackendForTests,
  assertGcsUploadCors,
  createGcsObjectStorageBackend,
  createLogoUpload,
  getVerifiedStoredLogo,
  verifyStoredPartnerLogo,
  validateSvgLogo,
  createCryptoAssetLogoUpload,
  createCryptoNetworkLogoUpload,
  createFiatCurrencyFlagUpload,
  StoredImageInvalidError,
  type ObjectStorageBackend,
} from "../src/lib/object-storage";

process.env.NODE_ENV = "test";
process.env.OBJECT_STORAGE_BACKEND = "gcs";
process.env.PRIVATE_OBJECT_DIR = "/portable-private/assets";

let objects = new Map<string, { bytes: Buffer; contentType: string; deleted: boolean }>();
let uploads: Array<{ bucket: string; name: string; contentType: string }> = [];

function fakeBackend(): ObjectStorageBackend {
  return {
    createUpload: async (bucket, name, contentType) => {
      uploads.push({ bucket, name, contentType });
      return `https://storage.example.test/${bucket}/${name}?signed=true`;
    },
    getObject: (bucket, name) => ({
      exists: async () => objects.has(`${bucket}/${name}`),
      metadata: async () => {
        const object = objects.get(`${bucket}/${name}`)!;
        return { contentType: object.contentType, size: object.bytes.length };
      },
      download: async () => objects.get(`${bucket}/${name}`)!.bytes,
      delete: async () => {
        objects.get(`${bucket}/${name}`)!.deleted = true;
      },
    }),
  };
}

beforeEach(() => {
  objects = new Map();
  uploads = [];
  configureObjectStorageBackendForTests(fakeBackend());
});

afterEach(() => configureObjectStorageBackendForTests(undefined));

test("portable backend receives private bucket paths and content-bound uploads", async () => {
  const upload = await createLogoUpload("image/png");
  assert.match(upload.objectPath, /^\/objects\/payment-method-logos\/[0-9a-f-]+$/);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bucket, "portable-private");
  assert.match(uploads[0].name, /^assets\/payment-method-logos\/[0-9a-f-]+$/);
  assert.equal(uploads[0].contentType, "image/png");
  assert.match(upload.uploadURL, /^https:\/\/storage\.example\.test\//);
});

test("GCS backend creates a short-lived content-bound V4 upload URL", async () => {
  let signedUrlOptions: Record<string, unknown> | undefined;
  const file = {
    getSignedUrl: async (options: Record<string, unknown>) => {
      signedUrlOptions = options;
      return ["https://storage.googleapis.test/signed"];
    },
  };
  const storage = {
    bucket: (bucket: string) => {
      assert.equal(bucket, "private-bucket");
      return {
        file: (name: string) => {
          assert.equal(name, "private/payment-method-logos/id");
          return file;
        },
      };
    },
  };
  const backend = createGcsObjectStorageBackend(storage as never);
  assert.equal(
    await backend.createUpload("private-bucket", "private/payment-method-logos/id", "image/webp"),
    "https://storage.googleapis.test/signed",
  );
  assert.equal(signedUrlOptions?.version, "v4");
  assert.equal(signedUrlOptions?.action, "write");
  assert.equal(signedUrlOptions?.contentType, "image/webp");
  assert.equal(typeof signedUrlOptions?.expires, "number");
});

test("GCS uploads require restrictive browser CORS for every configured origin", () => {
  const policy = [{
    origin: ["https://exchange.example.com", "https://admin.example.com"],
    method: ["PUT"],
    responseHeader: ["Content-Type"],
  }];
  assert.doesNotThrow(() => assertGcsUploadCors(policy, [
    "https://exchange.example.com",
    "https://admin.example.com",
  ]));
  assert.throws(
    () => assertGcsUploadCors(policy, ["https://other.example.com"]),
    /must allow origin/,
  );
  assert.throws(
    () => assertGcsUploadCors([{ ...policy[0], method: ["GET"] }], ["https://exchange.example.com"]),
    /method PUT/,
  );
  assert.throws(
    () => assertGcsUploadCors([{ ...policy[0], responseHeader: [] }], ["https://exchange.example.com"]),
    /Content-Type/,
  );
});

test("portable backend objects still pass full image verification", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const key = `portable-private/assets/payment-method-logos/${id}`;
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#123456" } }).png().toBuffer();
  objects.set(key, { bytes, contentType: "image/png", deleted: false });
  const verified = await getVerifiedStoredLogo(`/objects/payment-method-logos/${id}`);
  assert.deepEqual(verified.buffer, bytes);
  assert.equal(objects.get(key)?.deleted, false);
});

test("portable backend deletes invalid private objects", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const key = `portable-private/assets/payment-method-logos/${id}`;
  objects.set(key, { bytes: Buffer.from("not an image"), contentType: "image/png", deleted: false });
  await assert.rejects(
    getVerifiedStoredLogo(`/objects/payment-method-logos/${id}`),
    StoredImageInvalidError,
  );
  assert.equal(objects.get(key)?.deleted, true);
});

test("safe SVG preserves vectors, gradients, and strips comments", async () => {
  const source = Buffer.from(`<?xml version="1.0"?><!--drop--><svg xmlns="http://www.w3.org/2000/svg" version="1.1" xml:space="preserve" preserveAspectRatio="xMidYMid meet" width="20" height="20" viewBox="0 0 20 20"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><path fill="url(#g)" d="M0 0h20v20z"/></svg>`);
  const sanitized = await validateSvgLogo(source);
  const text = sanitized.toString("utf8");
  assert.match(text, /<svg/);
  assert.match(text, /<path/);
  assert.match(text, /linearGradient/);
  assert.doesNotMatch(text, /drop/);
  assert.equal((await sharp(sanitized).metadata()).format, "svg");
});

test("unsafe, malformed, and mismatched SVGs are rejected and deleted", async () => {
  const cases = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" onload="x"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><use href="https://evil"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><use href="data:text/html,x"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><style>x{fill:url(https://evil)}</style></svg>`,
    `<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg width="x">`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><?xml version="1.0"?></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path d="M0 0></svg>`,
  ];
  for (const [index, source] of cases.entries()) {
    const id = `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`;
    const key = `portable-private/assets/payment-method-logos/${id}`;
    objects.set(key, { bytes: Buffer.from(source), contentType: "image/svg+xml", deleted: false });
    await assert.rejects(getVerifiedStoredLogo(`/objects/payment-method-logos/${id}`), StoredImageInvalidError, `unsafe SVG case ${index}`);
    assert.equal(objects.get(key)?.deleted, true);
  }
});

test("catalog upload namespaces produce exact UUID object paths", async () => {
  for (const [create, namespace] of [
    [createCryptoAssetLogoUpload, "crypto-asset-logos"],
    [createCryptoNetworkLogoUpload, "crypto-network-logos"],
    [createFiatCurrencyFlagUpload, "fiat-currency-flags"],
  ] as const) {
    const upload = await create("image/png");
    assert.match(upload.objectPath, new RegExp(`^/objects/${namespace}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`));
  }
});

test("declared raster MIME must match actual PNG bytes", async () => {
  const id = "44444444-4444-4444-8444-444444444444";
  const key = `portable-private/assets/payment-method-logos/${id}`;
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } }).png().toBuffer();
  objects.set(key, { bytes, contentType: "image/jpeg", deleted: false });
  await assert.rejects(getVerifiedStoredLogo(`/objects/payment-method-logos/${id}`), StoredImageInvalidError);
  assert.equal(objects.get(key)?.deleted, true);
});

test("partner-logo verification uses the isolated partner namespace", async () => {
  const id = "55555555-5555-4555-8555-555555555555";
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } }).png().toBuffer();
  objects.set(`portable-private/assets/partner-logos/${id}`, { bytes, contentType: "image/png", deleted: false });
  await verifyStoredPartnerLogo(`/objects/partner-logos/${id}`);
  await assert.rejects(
    verifyStoredPartnerLogo("/objects/partner-logos/66666666-6666-4666-8666-666666666666"),
    /Object not found/,
  );
});