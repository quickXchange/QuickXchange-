import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";
import sharp from "sharp";
import { XMLValidator } from "fast-xml-parser";

const SIDECAR = "http://127.0.0.1:1106";
const UPLOAD_TTL_MS = 15 * 60_000;
export const ALLOWED_LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_BACKGROUND_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
const MAX_BACKGROUND_DIMENSION = 8_192;
const MAX_BACKGROUND_PIXELS = 40_000_000;
const MAX_LOGO_DIMENSION = 4_096;
const MAX_LOGO_PIXELS = 16_000_000;
type LandingBackgroundStorageTestAdapter = {
  createUpload: (contentType: string) => Promise<{ uploadURL: string; objectPath: string }>;
  get: (path: string) => Promise<{ buffer: Buffer; contentType: string; size?: number }>;
};
let landingBackgroundStorageTestAdapter: LandingBackgroundStorageTestAdapter | undefined;

type StoredObject = {
  exists: () => Promise<boolean>;
  metadata: () => Promise<{ contentType: string; size: number }>;
  download: () => Promise<Buffer>;
  delete: () => Promise<void>;
};

export type ObjectStorageBackend = {
  createUpload: (bucket: string, name: string, contentType: string) => Promise<string>;
  getObject: (bucket: string, name: string) => StoredObject;
  validateConfiguration?: (bucket: string, allowedOrigins: string[]) => Promise<void>;
};

let objectStorageBackendTestAdapter: ObjectStorageBackend | undefined;

/** Native API tests must not contact the object-storage sidecar. */
export function configureLandingBackgroundStorageForTests(
  adapter: LandingBackgroundStorageTestAdapter | undefined,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Object storage test adapters require NODE_ENV=test.");
  }
  landingBackgroundStorageTestAdapter = adapter;
}

/** Tests can exercise backend-independent upload and verification behavior without cloud credentials. */
export function configureObjectStorageBackendForTests(adapter: ObjectStorageBackend | undefined): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Object storage test adapters require NODE_ENV=test.");
  }
  objectStorageBackendTestAdapter = adapter;
}

const replitStorage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

function wrapGcsFile(file: File): StoredObject {
  return {
    exists: async () => (await file.exists())[0],
    metadata: async () => {
      const [metadata] = await file.getMetadata();
      return {
        contentType: String(metadata.contentType ?? "").toLowerCase(),
        size: Number(metadata.size ?? 0),
      };
    },
    download: async () => (await file.download())[0],
    delete: async () => {
      await file.delete({ ignoreNotFound: true });
    },
  };
}

/** Exported for contract tests; production passes an authenticated Google Storage client. */
export function createGcsObjectStorageBackend(storage: Storage): ObjectStorageBackend {
  return {
    createUpload: async (bucket, name, contentType) => {
      const [uploadURL] = await storage.bucket(bucket).file(name).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + UPLOAD_TTL_MS,
        contentType,
      });
      return uploadURL;
    },
    getObject: (bucket, name) => wrapGcsFile(storage.bucket(bucket).file(name)),
    validateConfiguration: async (bucket, allowedOrigins) => {
      const [metadata] = await storage.bucket(bucket).getMetadata();
      assertGcsUploadCors(metadata.cors, allowedOrigins);
    },
  };
}

const replitBackend: ObjectStorageBackend = {
  createUpload: async (bucket, name, contentType) => {
    const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucket,
        object_name: name,
        method: "PUT",
        expires_at: new Date(Date.now() + UPLOAD_TTL_MS).toISOString(),
        content_type: contentType,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("Could not create object upload URL");
    const body = await response.json() as { signed_url: string };
    return body.signed_url;
  },
  getObject: (bucket, name) => wrapGcsFile(replitStorage.bucket(bucket).file(name)),
};

function selectedBackend(): ObjectStorageBackend {
  if (process.env.NODE_ENV === "test" && objectStorageBackendTestAdapter) {
    return objectStorageBackendTestAdapter;
  }
  const backend = process.env.OBJECT_STORAGE_BACKEND?.trim().toLowerCase();
  if (backend === "replit") return replitBackend;
  if (backend === "gcs") {
    const projectId = process.env.GCS_PROJECT_ID?.trim();
    if (!projectId) throw new Error("GCS_PROJECT_ID is required when OBJECT_STORAGE_BACKEND=gcs");
    return createGcsObjectStorageBackend(new Storage({ projectId }));
  }
  throw new Error("OBJECT_STORAGE_BACKEND must be explicitly set to replit or gcs");
}

type GcsCorsRule = {
  origin?: string[];
  method?: string[];
  responseHeader?: string[];
};

export function assertGcsUploadCors(cors: GcsCorsRule[] | undefined, allowedOrigins: string[]): void {
  for (const origin of allowedOrigins) {
    const supported = cors?.some((rule) =>
      rule.origin?.includes(origin) &&
      rule.method?.some((method) => method.toUpperCase() === "PUT") &&
      rule.responseHeader?.some((header) => header.toLowerCase() === "content-type")
    );
    if (!supported) {
      throw new Error(
        `GCS bucket CORS must allow origin ${origin}, method PUT, and response header Content-Type`,
      );
    }
  }
}

function configuredUploadOrigins(): string[] {
  const raw = process.env.OBJECT_STORAGE_UPLOAD_ORIGINS?.trim();
  if (!raw) {
    throw new Error("OBJECT_STORAGE_UPLOAD_ORIGINS is required when OBJECT_STORAGE_BACKEND=gcs");
  }
  return raw.split(",").map((value) => {
    const input = value.trim();
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error(`Invalid object storage upload origin: ${input}`);
    }
    if (url.origin !== input || (url.protocol !== "https:" && url.hostname !== "localhost")) {
      throw new Error(`Object storage upload origins must be exact HTTPS origins: ${input}`);
    }
    return url.origin;
  });
}

/** Fail startup when a standard GCS deployment cannot accept browser uploads safely. */
export async function validateObjectStorageConfiguration(): Promise<void> {
  if (process.env.OBJECT_STORAGE_BACKEND?.trim().toLowerCase() !== "gcs") return;
  const { bucket } = parse(privateDir());
  await selectedBackend().validateConfiguration?.(bucket, configuredUploadOrigins());
}

export class StoredObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "StoredObjectNotFoundError";
  }
}

export class StoredImageInvalidError extends Error {
  constructor() {
    super("Stored background image bytes are invalid or unsafe");
    this.name = "StoredImageInvalidError";
  }
}

/** Decodes the complete payload so metadata-labeled, truncated, or polyglot input is never published. */
export async function validateLandingBackgroundImage(contentType: string, bytes: Buffer): Promise<void> {
  const normalized = contentType.toLowerCase();
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: MAX_BACKGROUND_PIXELS, animated: false });
    const metadata = await image.metadata();
    if ((metadata.format !== "png" && metadata.format !== "jpeg" && metadata.format !== "webp") ||
        `image/${metadata.format}` !== normalized || metadata.pages !== undefined && metadata.pages > 1 ||
        !metadata.width || !metadata.height || metadata.width > MAX_BACKGROUND_DIMENSION ||
        metadata.height > MAX_BACKGROUND_DIMENSION || metadata.width * metadata.height > MAX_BACKGROUND_PIXELS) {
      throw new StoredImageInvalidError();
    }
    await image.raw().toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof StoredImageInvalidError) throw error;
    throw new StoredImageInvalidError();
  }
}

/** SVG logos are displayed as uploaded, so reject active or externally loaded content before publication. */
export async function validateSvgLogo(bytes: Buffer): Promise<Buffer> {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new StoredImageInvalidError();
  }
  if (bytes.includes(0)) {
    throw new StoredImageInvalidError();
  }
  if (/<!(?:doctype|entity)\b/i.test(source)) {
    throw new StoredImageInvalidError();
  }
  if (XMLValidator.validate(source, { allowBooleanAttributes: false }) !== true) {
    throw new StoredImageInvalidError();
  }
  // Tokenize and rebuild SVG from a strict XML allowlist. This deliberately
  // avoids regex-only sanitization and drops comments/processing instructions.
  const allowedTags = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop", "title", "desc", "use"]);
  const allowedAttrs = new Set(["xmlns", "xmlns:xlink", "version", "xml:space", "viewBox", "preserveAspectRatio", "width", "height", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "opacity", "d", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "offset", "stop-color", "stop-opacity", "id", "class", "transform", "gradientUnits", "gradientTransform", "spreadMethod", "href", "xlink:href"]);
  const output: string[] = [];
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/?([A-Za-z][\w:.-]*)([^>]*)>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  const stack: string[] = [];
  let rootClosed = false;
  let rootSeen = false;
  while ((match = token.exec(source))) {
    const text = source.slice(cursor, match.index);
    if (text.trim()) {
      if (!stack.length || !["title", "desc"].includes(stack.at(-1)!) || /[<&]/.test(text)) {
        throw new StoredImageInvalidError();
      }
      output.push(text.replace(/>/g, "&gt;"));
    }
    cursor = token.lastIndex;
    const full = match[0];
    if (full.startsWith("<!--")) continue;
    if (full.startsWith("<?")) {
      if (stack.length || rootSeen || !/^<\?xml\s+version=["']1\.[0-9]["'](?:\s+encoding=["']UTF-8["'])?\s*\?>$/i.test(full)) {
        throw new StoredImageInvalidError();
      }
      continue;
    }
    if (full.startsWith("<!") || !match[1]) throw new StoredImageInvalidError();
    const closing = /^<\//.test(full);
    const tag = match[1];
    if (!allowedTags.has(tag)) throw new StoredImageInvalidError();
    if (closing) {
      if (stack.pop() !== tag) throw new StoredImageInvalidError();
      output.push(`</${tag}>`);
      if (tag === "svg") rootClosed = true;
      continue;
    }
    if (rootClosed || (tag === "svg" && rootSeen) || (tag !== "svg" && !rootSeen)) {
      throw new StoredImageInvalidError();
    }
    const rawAttrs = match[2].replace(/\/\s*$/, "");
    const attrs: string[] = [];
    const attrPattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
    let attrMatch: RegExpExecArray | null;
    let consumed = 0;
    while ((attrMatch = attrPattern.exec(rawAttrs))) {
      if (rawAttrs.slice(consumed, attrMatch.index).trim()) throw new StoredImageInvalidError();
      consumed = attrPattern.lastIndex;
      const name = attrMatch[1];
      const value = attrMatch[3];
      if (!allowedAttrs.has(name) || /^on/i.test(name) || value.includes("&") ||
          (name === "xmlns" && value !== "http://www.w3.org/2000/svg") ||
          (name === "xmlns:xlink" && value !== "http://www.w3.org/1999/xlink") ||
          (name !== "xmlns" && name !== "xmlns:xlink" && /(?:url\s*\(\s*(?!#[A-Za-z_][A-Za-z0-9_.:-]*\s*\))|expression\s*\(|@import)/i.test(value))) {
        throw new StoredImageInvalidError();
      }
      if (name === "href" || name === "xlink:href") {
        if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) throw new StoredImageInvalidError();
      }
      attrs.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
    }
    if (rawAttrs.slice(consumed).trim()) throw new StoredImageInvalidError();
    if (tag === "svg") rootSeen = true;
    output.push(`<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}${/\/\s*>$/.test(full) ? " />" : ">"}`);
    if (!/\/\s*>$/.test(full)) stack.push(tag);
    else if (tag === "svg") rootClosed = true;
  }
  const tail = source.slice(cursor);
  if (tail.trim()) {
    if (/[<&]/.test(tail) || !rootClosed) throw new StoredImageInvalidError();
    // Whitespace after the root is the only permitted trailing content.
    if (tail.trim()) throw new StoredImageInvalidError();
  }
  if (stack.length || !rootSeen || !rootClosed) throw new StoredImageInvalidError();
  const sanitized = Buffer.from(output.join(""), "utf8");
  try {
    const image = sharp(sanitized, {
      failOn: "error",
      limitInputPixels: MAX_LOGO_PIXELS,
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== "svg" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_LOGO_DIMENSION ||
      metadata.height > MAX_LOGO_DIMENSION ||
      metadata.width * metadata.height > MAX_LOGO_PIXELS
    ) {
      throw new StoredImageInvalidError();
    }
    await image.resize({ width: 1, height: 1, fit: "inside" }).png().toBuffer();
    return sanitized;
  } catch (error) {
    if (error instanceof StoredImageInvalidError) throw error;
    throw new StoredImageInvalidError();
  }
}

export async function validatePaymentMethodLogoImage(contentType: string, bytes: Buffer): Promise<void> {
  const normalized = contentType.toLowerCase();
  if (normalized === "image/svg+xml") {
    await validateSvgLogo(bytes);
    return;
  }
  try {
    const image = sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_LOGO_PIXELS,
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      (metadata.format !== "png" && metadata.format !== "jpeg" && metadata.format !== "webp") ||
      `image/${metadata.format}` !== normalized ||
      metadata.pages !== undefined && metadata.pages > 1 ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_LOGO_DIMENSION ||
      metadata.height > MAX_LOGO_DIMENSION ||
      metadata.width * metadata.height > MAX_LOGO_PIXELS
    ) {
      throw new StoredImageInvalidError();
    }
    await image.raw().toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof StoredImageInvalidError) throw error;
    throw new StoredImageInvalidError();
  }
}

function privateDir(): string {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  return value.replace(/\/$/, "");
}

function parse(path: string) {
  const [bucket, ...name] = path.replace(/^\//, "").split("/");
  if (!bucket || !name.length) throw new Error("Invalid object storage path");
  return { bucket, name: name.join("/") };
}

type ImageNamespace = "payment-method-logos" | "crypto-asset-logos" | "crypto-network-logos" | "fiat-currency-flags" | "landing-backgrounds" | "partner-logos" | "site-page-media" | "social-trust-icons" | "website-branding";
async function createImageUpload(namespace: ImageNamespace, contentType: string) {
  const contentTypes = namespace !== "landing-backgrounds"
    ? ALLOWED_LOGO_CONTENT_TYPES
    : ALLOWED_BACKGROUND_CONTENT_TYPES;
  if (!(contentTypes as readonly string[]).includes(contentType)) {
    throw new Error("Image content type is not allowed");
  }
  const objectPath = `/objects/${namespace}/${randomUUID()}`;
  const full = parse(`${privateDir()}/${namespace}/${objectPath.split("/").at(-1)}`);
  const uploadURL = await selectedBackend().createUpload(full.bucket, full.name, contentType);
  return { uploadURL, objectPath };
}

export async function createLogoUpload(contentType: string) {
  return createImageUpload("payment-method-logos", contentType);
}
export const createCryptoAssetLogoUpload = (contentType: string) => createImageUpload("crypto-asset-logos", contentType);
export const createCryptoNetworkLogoUpload = (contentType: string) => createImageUpload("crypto-network-logos", contentType);
export const createFiatCurrencyFlagUpload = (contentType: string) => createImageUpload("fiat-currency-flags", contentType);

export async function createLandingBackgroundUpload(contentType: string) {
  if (process.env.NODE_ENV === "test" && landingBackgroundStorageTestAdapter) {
    return landingBackgroundStorageTestAdapter.createUpload(contentType);
  }
  return createImageUpload("landing-backgrounds", contentType);
}

export async function createPartnerLogoUpload(contentType: string) {
  return createImageUpload("partner-logos", contentType);
}
export const createSitePageMediaUpload = (contentType: string) => createImageUpload("site-page-media", contentType);
export const createSocialTrustIconUpload = (contentType: string) => createImageUpload("social-trust-icons", contentType);
export const createWebsiteBrandingUpload = (contentType: string) => createImageUpload("website-branding", contentType);

async function getNamespacedStoredObject(path: string, namespace: ImageNamespace): Promise<StoredObject> {
  const full = await getNamespacedStoredObjectPath(path, namespace);
  const object = selectedBackend().getObject(full.bucket, full.name);
  if (!await object.exists()) throw new StoredObjectNotFoundError();
  return object;
}

async function getNamespacedStoredObjectPath(path: string, namespace: ImageNamespace) {
  const idPattern = namespace === "landing-backgrounds" || namespace === "crypto-asset-logos" || namespace === "crypto-network-logos" || namespace === "fiat-currency-flags" || namespace === "partner-logos" || namespace === "site-page-media" || namespace === "social-trust-icons" || namespace === "website-branding"
    ? "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    : "[0-9a-f-]+";
  const pattern = new RegExp(`^/objects/${namespace}/${idPattern}$`);
  if (!pattern.test(path)) throw new StoredObjectNotFoundError();
  return parse(`${privateDir()}/${path.slice("/objects/".length)}`);
}

export async function getStoredObject(path: string): Promise<StoredObject> {
  return getNamespacedStoredObject(path, "payment-method-logos");
}

export async function getStoredLandingBackground(path: string): Promise<StoredObject> {
  return getNamespacedStoredObject(path, "landing-backgrounds");
}
export const getStoredPartnerLogo = (path: string) => getNamespacedStoredObject(path, "partner-logos");
export const getStoredCryptoAssetLogo = (path: string) => getNamespacedStoredObject(path, "crypto-asset-logos");
export const getStoredCryptoNetworkLogo = (path: string) => getNamespacedStoredObject(path, "crypto-network-logos");
export const getStoredFiatCurrencyFlag = (path: string) => getNamespacedStoredObject(path, "fiat-currency-flags");
export const getStoredSitePageMedia = (path: string) => getNamespacedStoredObject(path, "site-page-media");
export const getStoredSocialTrustIcon = (path: string) => getNamespacedStoredObject(path, "social-trust-icons");
export const getStoredWebsiteBrandingImage = (path: string) => getNamespacedStoredObject(path, "website-branding");

export async function deleteStoredLogo(path: string): Promise<void> {
  const file = await getStoredObject(path);
  await file.delete();
}
export async function deleteStoredCatalogImage(path: string, namespace: Exclude<ImageNamespace, "landing-backgrounds">): Promise<void> {
  const file = await getNamespacedStoredObject(path, namespace);
  await file.delete();
}

/** Never trust the presign request: validate stored metadata and fully decode the uploaded bytes. */
export async function getVerifiedStoredLogo(path: string, namespace: ImageNamespace = "payment-method-logos"): Promise<{ buffer: Buffer; contentType: string }> {
  const file = await getNamespacedStoredObject(path, namespace);
  const { contentType, size } = await file.metadata();
  if (ALLOWED_LOGO_CONTENT_TYPES.includes(contentType as typeof ALLOWED_LOGO_CONTENT_TYPES[number]) &&
      Number.isSafeInteger(size) && size >= 1 && size <= MAX_LOGO_BYTES) {
    let buffer: Buffer;
    try {
      buffer = await file.download();
    } catch (error) {
      throw error;
    }
    try {
      if (buffer.length !== size) throw new StoredImageInvalidError();
       const verified = contentType === "image/svg+xml" ? await validateSvgLogo(buffer) : buffer;
       await validatePaymentMethodLogoImage(contentType, verified);
       return { buffer: verified, contentType };
    } catch (error) {
      await file.delete().catch(() => undefined);
      throw error;
    }
  }
  // Invalid objects must not remain available for later path reuse.
  await file.delete().catch(() => undefined);
  throw new StoredImageInvalidError();
}

export async function storeVerifiedConfigurationImage(
  path: string,
  namespace: ImageNamespace,
  contentType: string,
  buffer: Buffer,
): Promise<void> {
  if (!(ALLOWED_LOGO_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new StoredImageInvalidError();
  }
  await validatePaymentMethodLogoImage(contentType, buffer);
  const objectPath = await getNamespacedStoredObjectPath(path, namespace);
  const backend = selectedBackend();
  const uploadURL = await backend.createUpload(objectPath.bucket, objectPath.name, contentType);
  const response = await fetch(uploadURL, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Configuration object upload failed (${response.status}).`);
  await getVerifiedStoredLogo(path, namespace);
}

export async function verifyStoredLogo(path: string): Promise<void> {
  await getVerifiedStoredLogo(path);
}
export async function verifyStoredCatalogImage(
  path: string,
  namespace: Exclude<ImageNamespace, "payment-method-logos" | "landing-backgrounds">,
): Promise<void> {
  await getVerifiedStoredLogo(path, namespace);
}

export async function verifyStoredLandingBackground(path: string): Promise<void> {
  await getVerifiedLandingBackground(path);
}

export async function verifyStoredPartnerLogo(path: string): Promise<void> {
  await getVerifiedStoredLogo(path, "partner-logos");
}
export const getVerifiedSitePageMedia = (path: string) => getVerifiedStoredLogo(path, "site-page-media");
export const verifyStoredSitePageMedia = async (path: string): Promise<void> => {
  await getVerifiedSitePageMedia(path);
};
export const getVerifiedSocialTrustIcon = (path: string) => getVerifiedStoredLogo(path, "social-trust-icons");
export const verifyStoredSocialTrustIcon = async (path: string): Promise<void> => {
  await getVerifiedSocialTrustIcon(path);
};

/**
 * Validate a branding image through the same complete object-storage validation
 * path as other logos. SVGs are returned byte-for-byte after validation so
 * uploaded vector quality and authoring metadata are not replaced by a
 * rasterized or re-encoded representation.
 */
export async function getVerifiedWebsiteBrandingImage(
  path: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const file = await getStoredWebsiteBrandingImage(path);
  const { contentType, size } = await file.metadata();
  if (
    ALLOWED_LOGO_CONTENT_TYPES.includes(contentType as typeof ALLOWED_LOGO_CONTENT_TYPES[number]) &&
    Number.isSafeInteger(size) &&
    size >= 1 &&
    size <= MAX_LOGO_BYTES
  ) {
    let buffer: Buffer;
    try {
      buffer = await file.download();
      if (buffer.length !== size) throw new StoredImageInvalidError();
      if (contentType === "image/svg+xml") {
        await validateSvgLogo(buffer);
      } else {
        await validatePaymentMethodLogoImage(contentType, buffer);
      }
      return { buffer, contentType };
    } catch (error) {
      if (error instanceof StoredImageInvalidError) {
        await file.delete().catch(() => undefined);
      }
      throw error;
    }
  }
  await file.delete().catch(() => undefined);
  throw new StoredImageInvalidError();
}

export async function getVerifiedLandingBackground(path: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (process.env.NODE_ENV === "test" && landingBackgroundStorageTestAdapter) {
    const image = await landingBackgroundStorageTestAdapter.get(path);
    const size = image.size ?? image.buffer.length;
    if (!ALLOWED_BACKGROUND_CONTENT_TYPES.includes(image.contentType as typeof ALLOWED_BACKGROUND_CONTENT_TYPES[number]) ||
        !Number.isSafeInteger(size) || size < 1 || size > MAX_BACKGROUND_BYTES) {
      throw new StoredImageInvalidError();
    }
    await validateLandingBackgroundImage(image.contentType, image.buffer);
    return image;
  }
  const file = await getStoredLandingBackground(path);
  const { contentType, size } = await file.metadata();
  if (ALLOWED_BACKGROUND_CONTENT_TYPES.includes(contentType as typeof ALLOWED_BACKGROUND_CONTENT_TYPES[number]) &&
      Number.isSafeInteger(size) && size >= 1 && size <= MAX_BACKGROUND_BYTES) {
    let buffer: Buffer;
    try {
      buffer = await file.download();
    } catch (error) {
      // A transport failure does not establish that the object is invalid.
      throw error;
    }
    try {
      if (buffer.length !== size) throw new StoredImageInvalidError();
      await validateLandingBackgroundImage(contentType, buffer);
      return { buffer, contentType };
    } catch (error) {
      await file.delete().catch(() => undefined);
      throw error;
    }
  }
  await file.delete().catch(() => undefined);
  throw new StoredImageInvalidError();
}