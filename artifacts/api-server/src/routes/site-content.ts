import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  CreateAdminPartnerLogoBody,
  CreateAdminPartnerLogoResponse,
  CreateAdminSocialTrustItemBody,
  CreateAdminSocialTrustItemResponse,
  CreateContactSubmissionBody,
  CreateContactSubmissionResponse,
  GetAdminSiteContentParams,
  GetAdminSiteContentResponse,
  GetAdminWebsiteBrandingResponse,
  GetAdminSocialTrustResponse,
  GetAdminPartnerLogoSettingsResponse,
  GetWebsiteBrandingResponse,
  GetPublishedNavigationResponse,
  GetPublishedPartnerLogosResponse,
  GetPublishedSiteContentResponse,
  GetPublishedSitePageParams,
  GetPublishedSitePageResponse,
  ListAdminNavigationResponse,
  ListAdminPartnerLogosResponse,
  ListAdminSiteContentResponse,
  ListContactSubmissionsQueryParams,
  ListContactSubmissionsResponse,
  PublishAdminSitePageParams,
  PublishAdminSitePageResponse,
  PublishSitePublicationResponse,
  PreviewAdminSitePageParams,
  PreviewAdminSitePageResponse,
  PreviewAdminSitePageMediaParams,
  PreviewAdminSocialTrustIconParams,
  RemoveAdminSocialTrustItemParams,
  RemoveAdminNavigationParams,
  RemoveAdminPartnerLogoParams,
  RequestPartnerLogoUploadBody,
  RequestPartnerLogoUploadResponse,
  RequestSitePageMediaUploadBody,
  RequestSitePageMediaUploadResponse,
  RequestSocialTrustIconUploadBody,
  RequestSocialTrustIconUploadResponse,
  RequestWebsiteBrandingUploadBody,
  RequestWebsiteBrandingUploadResponse,
  SaveAdminNavigationBody,
  SaveAdminNavigationResponse,
  SaveAdminSiteContentBody,
  SaveAdminSiteContentResponse,
  SaveAdminSitePageBody,
  SaveAdminSitePageParams,
  SaveAdminSitePageResponse,
  SaveAdminWebsiteBrandingBody,
  SaveAdminWebsiteBrandingResponse,
  ResetAdminWebsiteBrandingResponse,
  UpdateAdminPartnerLogoBody,
  UpdateAdminPartnerLogoParams,
  UpdateAdminPartnerLogoResponse,
  UpdateAdminSocialTrustItemBody,
  UpdateAdminSocialTrustItemParams,
  UpdateAdminSocialTrustItemResponse,
  UpdateAdminSocialMediaBody,
  UpdateAdminSocialMediaResponse,
  UpdateAdminSocialTrustTitlesBody,
  UpdateAdminSocialTrustTitlesResponse,
  UpdateAdminPartnerLogoSettingsBody,
  UpdateAdminPartnerLogoSettingsResponse,
} from "@workspace/api-zod";
import {
  contactSubmissionsTable,
  blogArticlesTable,
  db,
  navLinksTable,
  partnerLogosTable,
  partnerLogoSettingsTable,
  siteContentAuditLogsTable,
  siteContentRevisionsTable,
  sitePublicationRevisionsTable,
  socialTrustLinksTable,
  socialTrustSettingsTable,
  websiteBrandingSettingsTable,
  type SiteNavigationSnapshot,
  type SitePartnerLogoSnapshot,
  type PartnerLogoSettings,
  type SiteSocialTrustSnapshot,
} from "@workspace/db";
import { ApiError } from "../lib/api-error";
import {
  ContactSupportDeliveryError,
  sendContactSupportEmail,
} from "../lib/contact-support-email";
import { logger } from "../lib/logger";
import {
  createPartnerLogoUpload,
  createSitePageMediaUpload,
  createSocialTrustIconUpload,
  getStoredSocialTrustIcon,
  getVerifiedSocialTrustIcon,
  getVerifiedSitePageMedia,
  getStoredPartnerLogo,
  getVerifiedStoredLogo,
  StoredImageInvalidError,
  StoredObjectNotFoundError,
  verifyStoredPartnerLogo,
  verifyStoredSitePageMedia,
  verifyStoredSocialTrustIcon,
  createWebsiteBrandingUpload,
  getVerifiedWebsiteBrandingImage,
  getStoredWebsiteBrandingImage,
} from "../lib/object-storage";
import { requireOperator, requireOwner } from "../lib/operator-auth";
import { isSafeSiteLink } from "../lib/site-content-policy";
import { getTrustedClientIp } from "../lib/client-ip";

const router: IRouter = Router();
const CONTACT_WINDOW_MS = 60 * 60 * 1000;
const CONTACT_MAX_ATTEMPTS = 5;

async function latestRevision(pageKey: string, status: "draft" | "published") {
  const [row] = await db.select().from(siteContentRevisionsTable)
    .where(and(eq(siteContentRevisionsTable.pageKey, pageKey), eq(siteContentRevisionsTable.status, status)))
    .orderBy(desc(siteContentRevisionsTable.revision)).limit(1);
  return row ?? null;
}

async function latestPublication() {
  const [row] = await db.select().from(sitePublicationRevisionsTable)
    .orderBy(desc(sitePublicationRevisionsTable.version)).limit(1);
  return row;
}

const DEFAULT_WEBSITE_BRANDING = {
  lightLogoPath: "/brand/quickxchange-header-light.png",
  darkLogoPath: "/brand/quickxchange-header-dark.png",
  mobileLogoPath: null,
  faviconPath: null,
  logoWidth: 180,
  logoHeight: 44,
  logoMaxWidth: 240,
  desktopLogoWidth: 138,
  desktopLogoMaxHeight: 30,
  tabletLogoWidth: 130,
  tabletLogoMaxHeight: 28,
  mobileLogoWidth: 116,
  mobileLogoMaxHeight: 28,
  alignment: "left" as const,
};

async function currentWebsiteBranding() {
  const [row] = await db.select().from(websiteBrandingSettingsTable)
    .where(eq(websiteBrandingSettingsTable.id, "global")).limit(1);
  return row;
}

function publicWebsiteBranding(row: Awaited<ReturnType<typeof currentWebsiteBranding>> | undefined) {
  return row
    ? {
      lightLogoPath: row.lightLogoPath ?? DEFAULT_WEBSITE_BRANDING.lightLogoPath,
      darkLogoPath: row.darkLogoPath ?? DEFAULT_WEBSITE_BRANDING.darkLogoPath,
      mobileLogoPath: row.mobileLogoPath,
      faviconPath: row.faviconPath,
      logoWidth: row.logoWidth,
      logoHeight: row.logoHeight,
      logoMaxWidth: row.logoMaxWidth,
      desktopLogoWidth: row.desktopLogoWidth,
      desktopLogoMaxHeight: row.desktopLogoMaxHeight,
      tabletLogoWidth: row.tabletLogoWidth,
      tabletLogoMaxHeight: row.tabletLogoMaxHeight,
      mobileLogoWidth: row.mobileLogoWidth,
      mobileLogoMaxHeight: row.mobileLogoMaxHeight,
      alignment: row.alignment as "left" | "center" | "right",
    }
    : DEFAULT_WEBSITE_BRANDING;
}

function adminWebsiteBranding(row: Awaited<ReturnType<typeof currentWebsiteBranding>> | undefined) {
  return {
    ...publicWebsiteBranding(row),
    custom: Boolean(row),
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

async function verifyWebsiteBrandingPaths(paths: Array<string | null>): Promise<void> {
  for (const path of new Set(paths.filter((value): value is string => Boolean(value)))) {
    try {
      await getVerifiedWebsiteBrandingImage(path);
    } catch (error) {
      if (error instanceof StoredObjectNotFoundError) {
        throw new ApiError("WEBSITE_BRANDING_OBJECT_MISSING", "A referenced branding image is missing.", 409);
      }
      if (error instanceof StoredImageInvalidError) {
        throw new ApiError("WEBSITE_BRANDING_OBJECT_INVALID", "A referenced branding image is invalid.", 409);
      }
      throw error;
    }
  }
}

const DEFAULT_SOCIAL_TRUST = {
  socialTitle: "Stay connected with us",
  trustTitle: "Share your feedback with us",
  instagramUrl: null,
  xUrl: null,
  facebookUrl: null,
  telegramUrl: null,
};

const DEFAULT_SOCIAL_ICON_APPEARANCE = {
  iconSize: 16,
  logoSize: 72,
  circleSize: 36,
  borderThickness: 1,
  radiusMode: "circle" as const,
  backgroundColor: "#111827",
  borderColor: "#374151",
  glowColor: "#6366f1",
  glowIntensity: 0,
  iconOpacity: 100,
};

const DEFAULT_PARTNER_LOGO_SETTINGS: PartnerLogoSettings = {
  layout: "carousel",
  animation: "auto-scroll",
  direction: "ltr",
  speed: "normal",
  pauseOnHover: true,
  manualInteraction: true,
  resumeAfterInteraction: true,
  columnsDesktop: 4,
  columnsTablet: 3,
  columnsMobile: 2,
  size: "medium",
  customSize: 96,
  container: "none",
  spacing: "normal",
  alignment: "center",
};

async function draftPartnerLogoSettings(): Promise<PartnerLogoSettings> {
  const [row] = await db.select().from(partnerLogoSettingsTable)
    .where(eq(partnerLogoSettingsTable.id, "global")).limit(1);
  return row?.settings ?? DEFAULT_PARTNER_LOGO_SETTINGS;
}

function partnerLogoPaths(logo: Pick<SitePartnerLogoSnapshot, "objectPath" | "lightObjectPath" | "darkObjectPath">): string[] {
  return [...new Set([logo.objectPath, logo.lightObjectPath, logo.darkObjectPath]
    .filter((path): path is string => Boolean(path)))];
}

function publicPartnerLogo(logo: SitePartnerLogoSnapshot): SitePartnerLogoSnapshot {
  return {
    ...logo,
    appearance: logo.appearance ?? "auto",
    lightObjectPath: logo.lightObjectPath ?? null,
    darkObjectPath: logo.darkObjectPath ?? null,
  };
}

function sortPartnerLogos<T extends { name: string; id: string; sortOrder?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id),
  );
}

function omitNullSortOrder<T extends { sortOrder?: number | null }>(row: T) {
  const { sortOrder, ...rest } = row;
  return sortOrder == null ? rest : { ...rest, sortOrder };
}

async function verifyPartnerLogoPaths(paths: Array<string | null | undefined>): Promise<void> {
  for (const path of new Set(paths.filter((value): value is string => Boolean(value)))) {
    try {
      await verifyStoredPartnerLogo(path);
    } catch (error) {
      if (error instanceof StoredObjectNotFoundError) {
        throw new ApiError("PARTNER_LOGO_OBJECT_MISSING", "A referenced partner logo image is missing.", 409);
      }
      if (error instanceof StoredImageInvalidError) {
        throw new ApiError("PARTNER_LOGO_OBJECT_INVALID", "A referenced partner logo image is invalid.", 409);
      }
      throw error;
    }
  }
}

function normalizedSocialIconAppearance(value: unknown) {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const result = { ...DEFAULT_SOCIAL_ICON_APPEARANCE };
  const ranges = {
    iconSize: [8, 48],
    logoSize: [20, 100],
    circleSize: [24, 80],
    borderThickness: [0, 8],
    glowIntensity: [0, 100],
    iconOpacity: [0, 100],
  } as const;
  for (const [key, [minimum, maximum]] of Object.entries(ranges) as Array<[keyof typeof ranges, readonly [number, number]]>) {
    const candidate = Number(input[key]);
    if (Number.isFinite(candidate)) result[key] = Math.round(Math.min(maximum, Math.max(minimum, candidate)));
  }
  if (input.radiusMode === "circle" || input.radiusMode === "rounded" || input.radiusMode === "square") result.radiusMode = input.radiusMode as typeof DEFAULT_SOCIAL_ICON_APPEARANCE.radiusMode;
  for (const key of ["backgroundColor", "borderColor", "glowColor"] as const) {
    if (typeof input[key] === "string" && /^#[0-9a-f]{6}$/i.test(input[key])) result[key] = input[key];
  }
  return result;
}

function normalizedSocialUrl(value: string | null): string | null {
  if (value == null || !value.trim()) return null;
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ApiError("SOCIAL_MEDIA_URL_INVALID", "Social media links must be complete HTTP(S) URLs.", 400);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ApiError("SOCIAL_MEDIA_URL_INVALID", "Social media links must be complete HTTP(S) URLs without credentials.", 400);
  }
  return url.toString();
}

async function draftSocialTrust() {
  const [settings] = await db.select().from(socialTrustSettingsTable).where(eq(socialTrustSettingsTable.id, "footer")).limit(1);
  const items = await db.select().from(socialTrustLinksTable)
    .where(isNull(socialTrustLinksTable.removedAt))
    .orderBy(
      socialTrustLinksTable.group,
      desc(socialTrustLinksTable.enabled),
      socialTrustLinksTable.name,
      socialTrustLinksTable.id,
    );
  return {
    socialTitle: settings?.socialTitle ?? DEFAULT_SOCIAL_TRUST.socialTitle,
    trustTitle: settings?.trustTitle ?? DEFAULT_SOCIAL_TRUST.trustTitle,
    instagramUrl: settings?.instagramUrl ?? DEFAULT_SOCIAL_TRUST.instagramUrl,
    xUrl: settings?.xUrl ?? DEFAULT_SOCIAL_TRUST.xUrl,
    facebookUrl: settings?.facebookUrl ?? DEFAULT_SOCIAL_TRUST.facebookUrl,
    telegramUrl: settings?.telegramUrl ?? DEFAULT_SOCIAL_TRUST.telegramUrl,
    appearance: normalizedSocialIconAppearance(settings?.appearance),
    items,
  };
}

function newestRevisionPerPage<T extends { pageKey: string }>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    if (!latest.has(row.pageKey)) latest.set(row.pageKey, row);
  }
  return [...latest.values()];
}

function isPageVisible(content: Record<string, unknown>): boolean {
  const visibility = content.visibility && typeof content.visibility === "object"
    ? content.visibility as Record<string, unknown>
    : {};
  return visibility.enabled !== false;
}

function publicPageRevision<T extends { content: Record<string, unknown> }>(row: T): T {
  return isPageVisible(row.content)
    ? row
    : { ...row, content: { visibility: { enabled: false } } };
}

const PAGE_MEDIA_PATH = /^\/objects\/site-page-media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function pageMediaPaths(content: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string" && PAGE_MEDIA_PATH.test(value)) paths.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(content);
  return [...paths];
}

function validatePageContent(content: Record<string, unknown>): void {
  const primaryButton = content.primaryButton && typeof content.primaryButton === "object"
    ? content.primaryButton as Record<string, unknown>
    : {};
  const secondaryButton = content.secondaryButton && typeof content.secondaryButton === "object"
    ? content.secondaryButton as Record<string, unknown>
    : {};
  const links = [content.ctaHref, content.secondaryCtaHref, primaryButton.href, secondaryButton.href]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (links.some((link) => !isSafeSiteLink(link))) {
    throw new ApiError("SITE_CONTENT_LINK_INVALID", "Page buttons must use relative paths, anchors, or HTTP(S) URLs.", 400);
  }
  if (JSON.stringify(content).length > 250_000) {
    throw new ApiError("SITE_CONTENT_TOO_LARGE", "Page content is too large.", 400);
  }
}

function validateWidgetExchangeInformation(pageKey: string, content: Record<string, unknown>): void {
  if (pageKey !== "widget-exchange-information") return;
  const allowedKeys = new Set(["visible", "showIcon", "glow", "title", "text", "textSize", "textAlign"]);
  if (Object.keys(content).some((key) => !allowedKeys.has(key))) {
    throw new ApiError("SITE_CONTENT_INVALID", "Widget Exchange Information contains unsupported settings.", 400);
  }
  if (
    (content.visible !== undefined && typeof content.visible !== "boolean") ||
    (content.showIcon !== undefined && typeof content.showIcon !== "boolean") ||
    (content.glow !== undefined && typeof content.glow !== "boolean") ||
    (content.title !== undefined && typeof content.title !== "string") ||
    (content.text !== undefined && typeof content.text !== "string") ||
    (content.textSize !== undefined && !["small", "medium", "large"].includes(String(content.textSize))) ||
    (content.textAlign !== undefined && !["left", "center", "right"].includes(String(content.textAlign)))
  ) {
    throw new ApiError("SITE_CONTENT_INVALID", "Widget Exchange Information settings are invalid.", 400);
  }
  if (typeof content.title === "string" && content.title.length > 120) {
    throw new ApiError("SITE_CONTENT_INVALID", "The Widget Exchange Information title must be 120 characters or fewer.", 400);
  }
  if (typeof content.text === "string" && content.text.length > 4_000) {
    throw new ApiError("SITE_CONTENT_INVALID", "The Widget Exchange Information text must be 4,000 characters or fewer.", 400);
  }
  if (content.visible !== false && (typeof content.text !== "string" || !content.text.trim())) {
    throw new ApiError("SITE_CONTENT_INVALID", "Visible Widget Exchange Information requires text.", 400);
  }
}

async function verifyPageMedia(content: Record<string, unknown>): Promise<void> {
  for (const path of pageMediaPaths(content)) {
    try {
      await verifyStoredSitePageMedia(path);
    } catch (error) {
      if (error instanceof StoredObjectNotFoundError) throw new ApiError("SITE_PAGE_MEDIA_MISSING", "A referenced page image is missing.", 409);
      if (error instanceof StoredImageInvalidError) throw new ApiError("SITE_PAGE_MEDIA_INVALID", "A referenced page image is invalid.", 409);
      throw error;
    }
  }
}

router.get("/site-content", async (_req, res): Promise<void> => {
  const [pages, publication, brandingRow] = await Promise.all([
    db.select().from(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.status, "published"))
      .orderBy(siteContentRevisionsTable.pageKey, desc(siteContentRevisionsTable.revision)),
    latestPublication(),
    currentWebsiteBranding(),
  ]);
  const latestPages = newestRevisionPerPage(pages).map(publicPageRevision);
  const navigation = (publication?.navigation ?? [])
    .map((row) => ({ ...row, widget: row.widget ?? false }))
    .filter((row) => row.enabled && isSafeSiteLink(row.href))
    .sort((a, b) => a.label.localeCompare(b.label) || a.href.localeCompare(b.href) || a.id.localeCompare(b.id));
  const partnerLogos = (publication?.partnerLogos ?? []).filter((row) =>
    row.enabled && !row.removedAt && (!row.link || isSafeSiteLink(row.link)),
  );
  const orderedPartnerLogos = sortPartnerLogos(partnerLogos).map(publicPartnerLogo);
  const partnerLogoSettings = publication?.partnerLogoSettings ?? DEFAULT_PARTNER_LOGO_SETTINGS;
  const socialTrust = publication?.socialTrust
    ? { ...publication.socialTrust, items: [...publication.socialTrust.items] }
    : { ...DEFAULT_SOCIAL_TRUST, items: [] };
  socialTrust.items = socialTrust.items
    .filter((item) => item.enabled && !item.removedAt && isSafeSiteLink(item.href))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const branding = GetWebsiteBrandingResponse.parse(publicWebsiteBranding(brandingRow));
  res.setHeader("cache-control", "public, max-age=0, must-revalidate");
  res.json(GetPublishedSiteContentResponse.parse({
    pages: latestPages, navigation, partnerLogos: orderedPartnerLogos, partnerLogoSettings, socialTrust, branding,
  }));
});

router.get("/website-branding", async (_req, res): Promise<void> => {
  const branding = GetWebsiteBrandingResponse.parse(publicWebsiteBranding(await currentWebsiteBranding()));
  res.setHeader("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  res.json(branding);
});

router.get("/storage/objects/website-branding/:id", async (req, res, next): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const objectPath = `/objects/website-branding/${id}`;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    res.status(404).json({ error: "Object not found" });
    return;
  }
  try {
    const row = await currentWebsiteBranding();
    const referenced = [row?.lightLogoPath, row?.darkLogoPath, row?.mobileLogoPath, row?.faviconPath]
      .includes(objectPath);
    if (!referenced) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const image = await getVerifiedWebsiteBrandingImage(objectPath);
    res.setHeader("content-type", image.contentType);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(image.buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) { res.status(404).json({ error: "Object not found" }); return; }
    if (error instanceof StoredImageInvalidError) { res.status(415).json({ error: "Stored object is not an allowed image" }); return; }
    next(error);
  }
});

router.get("/storage/objects/social-trust-icons/:id", async (req, res, next): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const objectPath = `/objects/social-trust-icons/${id}`;
  try {
    const publication = await latestPublication();
    const referenced = publication?.socialTrust.items.some((item) =>
      item.objectPath === objectPath && item.enabled && !item.removedAt,
    );
    if (!referenced) { res.status(404).json({ error: "Object not found" }); return; }
    const image = await getVerifiedSocialTrustIcon(objectPath);
    res.setHeader("content-type", image.contentType);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(image.buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) { res.status(404).json({ error: "Object not found" }); return; }
    if (error instanceof StoredImageInvalidError) { res.status(415).json({ error: "Stored object is not an allowed image" }); return; }
    next(error);
  }
});

router.get("/site-content/:pageKey", async (req, res): Promise<void> => {
  const params = GetPublishedSitePageParams.parse(req.params);
  const row = await latestRevision(params.pageKey, "published");
  if (!row || !isPageVisible(row.content)) {
    res.status(404).json({ error: "Published page not found" });
    return;
  }
  res.setHeader("cache-control", "public, max-age=0, must-revalidate");
  res.json(GetPublishedSitePageResponse.parse(row));
});

router.get("/site-navigation", async (_req, res): Promise<void> => {
  const publication = await latestPublication();
  const rows = (publication?.navigation ?? [])
    .map((row) => ({ ...row, widget: row.widget ?? false }))
    .filter((row) => row.enabled && isSafeSiteLink(row.href))
    .sort((a, b) => a.label.localeCompare(b.label) || a.href.localeCompare(b.href) || a.id.localeCompare(b.id));
  res.setHeader("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  res.json(GetPublishedNavigationResponse.parse(rows));
});

router.get("/partner-logos", async (_req, res): Promise<void> => {
  const publication = await latestPublication();
  const rows = (publication?.partnerLogos ?? []).filter((row) =>
    row.enabled && !row.removedAt && (!row.link || isSafeSiteLink(row.link)),
  );
  res.setHeader("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  res.json(GetPublishedPartnerLogosResponse.parse(sortPartnerLogos(rows).map(publicPartnerLogo)));
});

router.get("/storage/objects/partner-logos/:id", async (req, res, next): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    res.status(404).json({ error: "Object not found" });
    return;
  }
  try {
    const publication = await latestPublication();
    const referenced = publication?.partnerLogos.find((logo) =>
      partnerLogoPaths(logo).includes(`/objects/partner-logos/${id}`) && logo.enabled && !logo.removedAt,
    );
    if (!referenced) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const image = await getVerifiedStoredLogo(`/objects/partner-logos/${id}`, "partner-logos");
    res.setHeader("content-type", image.contentType);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(image.buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof StoredImageInvalidError) {
      res.status(415).json({ error: "Stored object is not an allowed image" });
      return;
    }
    next(error);
  }
});

router.get("/storage/objects/site-page-media/:id", async (req, res, next): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const objectPath = `/objects/site-page-media/${id}`;
  if (!PAGE_MEDIA_PATH.test(objectPath)) {
    res.status(404).json({ error: "Object not found" });
    return;
  }
  try {
    const pages = await db.select({ pageKey: siteContentRevisionsTable.pageKey, content: siteContentRevisionsTable.content })
      .from(siteContentRevisionsTable)
      .where(eq(siteContentRevisionsTable.status, "published"))
      .orderBy(siteContentRevisionsTable.pageKey, desc(siteContentRevisionsTable.revision));
    const latestPages = newestRevisionPerPage(pages);
    const referencedByPage = latestPages.some((page) => isPageVisible(page.content) && pageMediaPaths(page.content).includes(objectPath));
    const blogImages = await db.select({
      featuredImagePath: blogArticlesTable.featuredImagePath,
      socialImagePath: blogArticlesTable.socialImagePath,
    }).from(blogArticlesTable).where(eq(blogArticlesTable.status, "published"));
    const referencedByBlog = blogImages.some((article) =>
      article.featuredImagePath === objectPath || article.socialImagePath === objectPath,
    );
    const referenced = referencedByPage || referencedByBlog;
    if (!referenced) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const image = await getVerifiedSitePageMedia(objectPath);
    res.setHeader("content-type", image.contentType);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(image.buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof StoredImageInvalidError) {
      res.status(415).json({ error: "Stored object is not an allowed image" });
      return;
    }
    next(error);
  }
});

router.get("/admin/partner-logos/:id/preview", requireOperator, async (req, res, next): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    res.status(404).json({ error: "Object not found" });
    return;
  }
  try {
    const requestedPath = typeof req.query.objectPath === "string" ? req.query.objectPath : undefined;
    const [logo] = await db.select({
      objectPath: partnerLogosTable.objectPath,
      lightObjectPath: partnerLogosTable.lightObjectPath,
      darkObjectPath: partnerLogosTable.darkObjectPath,
    })
      .from(partnerLogosTable)
      .where(and(eq(partnerLogosTable.id, id), isNull(partnerLogosTable.removedAt)))
      .limit(1);
    // Do not disclose whether an object exists when there is no active draft
    // record authorizing this operator preview.
    if (!logo) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const objectPath = requestedPath ?? logo.objectPath;
    if (![logo.objectPath, logo.lightObjectPath, logo.darkObjectPath].includes(objectPath)) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const image = await getVerifiedStoredLogo(objectPath, "partner-logos");
    res.setHeader("content-type", image.contentType);
    res.setHeader("cache-control", "private, no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(image.buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof StoredImageInvalidError) {
      res.status(415).json({ error: "Stored object is not an allowed image" });
      return;
    }
    next(error);
  }
});

router.post("/contact-submissions", async (req, res): Promise<void> => {
  const input = CreateContactSubmissionBody.parse(req.body);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new ApiError("CONTACT_EMAIL_INVALID", "A valid email address is required.", 400);
  }
  if (!input.name.trim() || !input.message.trim()) {
    throw new ApiError("CONTACT_FIELDS_INVALID", "Name and message cannot be blank.", 400);
  }
  const ip = getTrustedClientIp(req);
  const [created] = await db.transaction(async (tx) => {
    // Serialize attempts for this IP so multiple API instances cannot bypass
    // the limit between the count and insert.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ip}))`);
    const cutoff = new Date(Date.now() - CONTACT_WINDOW_MS);
    const [recent] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(contactSubmissionsTable)
      .where(and(eq(contactSubmissionsTable.ipAddress, ip), gte(contactSubmissionsTable.createdAt, cutoff)));
    if (Number(recent?.count ?? 0) >= CONTACT_MAX_ATTEMPTS) {
      throw new ApiError("CONTACT_RATE_LIMITED", "Too many contact requests. Please try again later.", 429);
    }
    return tx.insert(contactSubmissionsTable).values({
      name: input.name.trim(), email: input.email.trim().toLowerCase(), message: input.message.trim(), ipAddress: ip,
    }).returning();
  });
  try {
    await sendContactSupportEmail({
      submissionId: created.id,
      customerName: created.name,
      customerEmail: created.email,
      message: created.message,
      receivedAt: created.createdAt,
    });
  } catch (error) {
    logger.warn({
      status: error instanceof ContactSupportDeliveryError ? error.status : undefined,
      providerMessage:
        error instanceof ContactSupportDeliveryError
          ? error.providerMessage
          : undefined,
    }, "Contact request email delivery failed");
    throw new ApiError(
      "CONTACT_DELIVERY_FAILED",
      "Your message could not be sent right now. Please try again later.",
      502,
    );
  }
  res.status(201).json(CreateContactSubmissionResponse.parse({ id: created.id, receivedAt: created.createdAt }));
});

router.get("/admin/site-content", requireOperator, async (_req, res): Promise<void> => {
  const rows = await db.select().from(siteContentRevisionsTable)
    .orderBy(siteContentRevisionsTable.pageKey, desc(siteContentRevisionsTable.revision));
  res.json(ListAdminSiteContentResponse.parse(rows));
});

router.get("/admin/website-branding", requireOwner, async (_req, res): Promise<void> => {
  const row = await currentWebsiteBranding();
  res.json(GetAdminWebsiteBrandingResponse.parse(adminWebsiteBranding(row)));
});

router.post("/admin/website-branding/upload", requireOwner, async (req, res): Promise<void> => {
  const { contentType } = RequestWebsiteBrandingUploadBody.parse(req.body);
  res.json(RequestWebsiteBrandingUploadResponse.parse(await createWebsiteBrandingUpload(contentType)));
});

router.put("/admin/website-branding", requireOwner, async (req, res): Promise<void> => {
  const input = SaveAdminWebsiteBrandingBody.parse(req.body);
  await verifyWebsiteBrandingPaths([
    input.lightLogoPath,
    input.darkLogoPath,
    input.mobileLogoPath,
    input.faviconPath,
  ]);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083154)`);
    // Re-check after taking the writer lock so an object deleted between the
    // request validation and this transaction can never be published.
    await verifyWebsiteBrandingPaths([
      input.lightLogoPath,
      input.darkLogoPath,
      input.mobileLogoPath,
      input.faviconPath,
    ]);
    const [previous] = await tx.select().from(websiteBrandingSettingsTable)
      .where(eq(websiteBrandingSettingsTable.id, "global")).limit(1);
    const [row] = await tx.insert(websiteBrandingSettingsTable).values({
      id: "global",
      ...input,
      updatedBy: res.locals.operator.id,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: websiteBrandingSettingsTable.id,
      set: {
        lightLogoPath: input.lightLogoPath,
        darkLogoPath: input.darkLogoPath,
        mobileLogoPath: input.mobileLogoPath,
        faviconPath: input.faviconPath,
        logoWidth: input.logoWidth,
        logoHeight: input.logoHeight,
        logoMaxWidth: input.logoMaxWidth,
        desktopLogoWidth: input.desktopLogoWidth,
        desktopLogoMaxHeight: input.desktopLogoMaxHeight,
        tabletLogoWidth: input.tabletLogoWidth,
        tabletLogoMaxHeight: input.tabletLogoMaxHeight,
        mobileLogoWidth: input.mobileLogoWidth,
        mobileLogoMaxHeight: input.mobileLogoMaxHeight,
        alignment: input.alignment,
        updatedBy: res.locals.operator.id,
        updatedAt: new Date(),
      },
    }).returning();
    await tx.insert(siteContentAuditLogsTable).values({
      action: "website_branding.saved",
      actorId: res.locals.operator.id,
      details: { custom: true },
    });
    return { row, previous };
  });
  const retained = new Set([
    result.row.lightLogoPath,
    result.row.darkLogoPath,
    result.row.mobileLogoPath,
    result.row.faviconPath,
  ].filter((path): path is string => Boolean(path)));
  for (const path of new Set([
    result.previous?.lightLogoPath,
    result.previous?.darkLogoPath,
    result.previous?.mobileLogoPath,
    result.previous?.faviconPath,
  ].filter((path): path is string => Boolean(path)))) {
    if (retained.has(path)) continue;
    try { const object = await getStoredWebsiteBrandingImage(path); await object.delete(); } catch { /* best effort cleanup */ }
  }
  res.setHeader("cache-control", "no-store");
  res.json(SaveAdminWebsiteBrandingResponse.parse(adminWebsiteBranding(result.row)));
});

router.post("/admin/website-branding/reset", requireOwner, async (_req, res): Promise<void> => {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083154)`);
    const [previous] = await tx.select().from(websiteBrandingSettingsTable)
      .where(eq(websiteBrandingSettingsTable.id, "global")).limit(1);
    await tx.delete(websiteBrandingSettingsTable)
      .where(eq(websiteBrandingSettingsTable.id, "global"));
    await tx.insert(siteContentAuditLogsTable).values({
      action: "website_branding.reset",
      actorId: res.locals.operator.id,
      details: { hadCustomBranding: Boolean(previous) },
    });
    return previous;
  });
  for (const path of new Set([
    result?.lightLogoPath,
    result?.darkLogoPath,
    result?.mobileLogoPath,
    result?.faviconPath,
  ].filter((path): path is string => Boolean(path)))) {
    try { const object = await getStoredWebsiteBrandingImage(path); await object.delete(); } catch { /* best effort cleanup */ }
  }
  res.setHeader("cache-control", "no-store");
  res.json(ResetAdminWebsiteBrandingResponse.parse(publicWebsiteBranding(undefined)));
});

async function saveDraft(pageKey: string, content: Record<string, unknown>, actorId: string) {
  validatePageContent(content);
  validateWidgetExchangeInformation(pageKey, content);
  await verifyPageMedia(content);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083152)`);
    const [latest] = await tx.select({ revision: siteContentRevisionsTable.revision })
      .from(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.pageKey, pageKey))
      .orderBy(desc(siteContentRevisionsTable.revision)).limit(1);
    const [row] = await tx.insert(siteContentRevisionsTable).values({
      pageKey, revision: (latest?.revision ?? 0) + 1, status: "draft", content, createdBy: actorId,
    }).returning();
    await tx.insert(siteContentAuditLogsTable).values({
      action: "site_content.draft_saved", actorId, pageKey, revisionId: row.id,
      details: { revision: row.revision },
    });
    return row;
  });
}

router.post("/admin/site-content", requireOperator, async (req, res): Promise<void> => {
  const input = SaveAdminSiteContentBody.parse(req.body);
  const row = await saveDraft(input.pageKey, input.content, res.locals.operator.id);
  res.status(201).json(SaveAdminSiteContentResponse.parse(row));
});

router.get("/admin/site-content/:pageKey", requireOperator, async (req, res): Promise<void> => {
  const { pageKey } = GetAdminSiteContentParams.parse(req.params);
  const [draft, published] = await Promise.all([latestRevision(pageKey, "draft"), latestRevision(pageKey, "published")]);
  res.json(GetAdminSiteContentResponse.parse({ pageKey, draft, published }));
});

router.put("/admin/site-content/:pageKey", requireOperator, async (req, res): Promise<void> => {
  const { pageKey } = SaveAdminSitePageParams.parse(req.params);
  const { content } = SaveAdminSitePageBody.parse(req.body);
  const row = await saveDraft(pageKey, content, res.locals.operator.id);
  res.status(201).json(SaveAdminSitePageResponse.parse(row));
});

router.post("/admin/site-content/:pageKey", requireOwner, async (req, res): Promise<void> => {
  const { pageKey } = PublishAdminSitePageParams.parse(req.params);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083152)`);
    const [draft] = await tx.select().from(siteContentRevisionsTable)
      .where(and(eq(siteContentRevisionsTable.pageKey, pageKey), eq(siteContentRevisionsTable.status, "draft")))
      .orderBy(desc(siteContentRevisionsTable.revision)).limit(1);
    const [existingPublished] = await tx.select().from(siteContentRevisionsTable)
      .where(and(eq(siteContentRevisionsTable.pageKey, pageKey), eq(siteContentRevisionsTable.status, "published")))
      .orderBy(desc(siteContentRevisionsTable.revision)).limit(1);
    if (!draft) {
      return existingPublished ? { row: existingPublished, created: false } : undefined;
    }
    validatePageContent(draft.content);
    validateWidgetExchangeInformation(pageKey, draft.content);
    await verifyPageMedia(draft.content);
    if (
      existingPublished &&
      JSON.stringify(existingPublished.content) === JSON.stringify(draft.content)
    ) {
      return { row: existingPublished, created: false };
    }
    const [latest] = await tx.select({ revision: siteContentRevisionsTable.revision })
      .from(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.pageKey, pageKey))
      .orderBy(desc(siteContentRevisionsTable.revision)).limit(1);
    const [row] = await tx.insert(siteContentRevisionsTable).values({
      pageKey, revision: (latest?.revision ?? draft.revision) + 1, status: "published", content: draft.content,
      createdBy: draft.createdBy, publishedBy: res.locals.operator.id, publishedAt: new Date(),
    }).returning();
    await tx.insert(siteContentAuditLogsTable).values({
      action: "site_content.published", actorId: res.locals.operator.id, pageKey, revisionId: row.id,
      details: { sourceRevision: draft.revision, revision: row.revision },
    });
    return { row, created: true };
  });
  if (!result) throw new ApiError("SITE_CONTENT_DRAFT_NOT_FOUND", "No draft exists for this page.", 404);
  res.json(PublishAdminSitePageResponse.parse(result.row));
});

router.get("/admin/site-content/:pageKey/preview", requireOperator, async (req, res): Promise<void> => {
  const { pageKey } = PreviewAdminSitePageParams.parse(req.params);
  const draft = await latestRevision(pageKey, "draft");
  if (!draft) throw new ApiError("SITE_CONTENT_DRAFT_NOT_FOUND", "No draft exists for this page.", 404);
  res.json(PreviewAdminSitePageResponse.parse(draft));
});

router.post("/admin/site-page-media/upload", requireOperator, async (req, res): Promise<void> => {
  const { contentType } = RequestSitePageMediaUploadBody.parse(req.body);
  res.json(RequestSitePageMediaUploadResponse.parse(await createSitePageMediaUpload(contentType)));
});

router.get("/admin/site-page-media/:pageKey/:id/preview", requireOperator, async (req, res, next): Promise<void> => {
  const { pageKey, id } = PreviewAdminSitePageMediaParams.parse(req.params);
  const objectPath = `/objects/site-page-media/${id}`;
  try {
    const [draft, published] = await Promise.all([latestRevision(pageKey, "draft"), latestRevision(pageKey, "published")]);
    if (![draft, published].some((revision) => revision && pageMediaPaths(revision.content).includes(objectPath))) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const image = await getVerifiedSitePageMedia(objectPath);
    res.setHeader("content-type", image.contentType);
    res.setHeader("cache-control", "private, no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(image.buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof StoredImageInvalidError) {
      res.status(415).json({ error: "Stored object is not an allowed image" });
      return;
    }
    next(error);
  }
});

router.post("/admin/site-publication", requireOwner, async (_req, res): Promise<void> => {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083153)`);
    const [latest] = await tx.select().from(sitePublicationRevisionsTable)
      .orderBy(desc(sitePublicationRevisionsTable.version)).limit(1);
    const navigationRows = await tx.select().from(navLinksTable).orderBy(
      desc(navLinksTable.enabled), navLinksTable.label, navLinksTable.href, navLinksTable.id,
    );
    const partnerRows = await tx.select().from(partnerLogosTable).orderBy(
      partnerLogosTable.sortOrder, partnerLogosTable.name, partnerLogosTable.id,
    );
    const [partnerLogoSettingsRow] = await tx.select().from(partnerLogoSettingsTable)
      .where(eq(partnerLogoSettingsTable.id, "global")).limit(1);
    const partnerLogoSettings = partnerLogoSettingsRow?.settings ?? DEFAULT_PARTNER_LOGO_SETTINGS;
    const [socialTrustSettings] = await tx.select().from(socialTrustSettingsTable)
      .where(eq(socialTrustSettingsTable.id, "footer")).limit(1);
    const socialTrustItems = await tx.select().from(socialTrustLinksTable)
      .where(isNull(socialTrustLinksTable.removedAt))
      .orderBy(
        socialTrustLinksTable.group,
        desc(socialTrustLinksTable.enabled),
        socialTrustLinksTable.name,
        socialTrustLinksTable.id,
      );
    const socialTrustDraft = {
      socialTitle: socialTrustSettings?.socialTitle ?? DEFAULT_SOCIAL_TRUST.socialTitle,
      trustTitle: socialTrustSettings?.trustTitle ?? DEFAULT_SOCIAL_TRUST.trustTitle,
      instagramUrl: socialTrustSettings?.instagramUrl ?? DEFAULT_SOCIAL_TRUST.instagramUrl,
      xUrl: socialTrustSettings?.xUrl ?? DEFAULT_SOCIAL_TRUST.xUrl,
      facebookUrl: socialTrustSettings?.facebookUrl ?? DEFAULT_SOCIAL_TRUST.facebookUrl,
      telegramUrl: socialTrustSettings?.telegramUrl ?? DEFAULT_SOCIAL_TRUST.telegramUrl,
      appearance: normalizedSocialIconAppearance(socialTrustSettings?.appearance),
      items: socialTrustItems,
    };
    for (const logo of partnerRows.filter((row) => row.enabled)) {
      try {
        await verifyPartnerLogoPaths([logo.objectPath, logo.lightObjectPath, logo.darkObjectPath]);
      } catch (error) {
        if (error instanceof StoredObjectNotFoundError) {
          throw new ApiError("PARTNER_LOGO_OBJECT_MISSING", `Enabled partner logo object is missing: ${logo.id}`, 409);
        }
        if (error instanceof StoredImageInvalidError) {
          throw new ApiError("PARTNER_LOGO_OBJECT_INVALID", `Enabled partner logo object is invalid: ${logo.id}`, 409);
        }
        throw error;
      }
    }
    for (const item of socialTrustDraft.items.filter((row) => row.enabled)) {
      if (!isSafeSiteLink(item.href)) throw new ApiError("SOCIAL_TRUST_LINK_INVALID", `Enabled footer link is invalid: ${item.id}`, 409);
       try {
         if (item.objectPath) await verifyStoredSocialTrustIcon(item.objectPath);
      } catch (error) {
        if (error instanceof StoredObjectNotFoundError) throw new ApiError("SOCIAL_TRUST_ICON_MISSING", `Enabled footer icon is missing: ${item.id}`, 409);
        if (error instanceof StoredImageInvalidError) throw new ApiError("SOCIAL_TRUST_ICON_INVALID", `Enabled footer icon is invalid: ${item.id}`, 409);
        throw error;
      }
    }
    const navigation: SiteNavigationSnapshot[] = navigationRows.map((row) => ({
      id: row.id, label: row.label, href: row.href, enabled: row.enabled,
      header: row.header, footer: row.footer, widget: row.widget,
    }));
    const partnerLogos: SitePartnerLogoSnapshot[] = partnerRows.map((row) => ({
      id: row.id, name: row.name, objectPath: row.objectPath, link: row.link,
      lightObjectPath: row.lightObjectPath, darkObjectPath: row.darkObjectPath,
      appearance: row.appearance as "auto" | "same" | "separate",
      ...(row.sortOrder == null ? {} : { sortOrder: row.sortOrder }),
      enabled: row.enabled,
      removedAt: row.removedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
    }));
    const socialTrust: SiteSocialTrustSnapshot = {
      socialTitle: socialTrustDraft.socialTitle,
      trustTitle: socialTrustDraft.trustTitle,
      instagramUrl: socialTrustDraft.instagramUrl,
      xUrl: socialTrustDraft.xUrl,
      facebookUrl: socialTrustDraft.facebookUrl,
      telegramUrl: socialTrustDraft.telegramUrl,
      appearance: socialTrustDraft.appearance,
      items: socialTrustDraft.items.map((row) => ({
        id: row.id, group: row.group as "social" | "trust", name: row.name, href: row.href,
        objectPath: row.objectPath, enabled: row.enabled,
        removedAt: row.removedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
      })),
    };
    if (
      latest &&
      JSON.stringify(latest.navigation) === JSON.stringify(navigation) &&
      JSON.stringify(latest.partnerLogos) === JSON.stringify(partnerLogos) &&
      JSON.stringify(latest.partnerLogoSettings ?? DEFAULT_PARTNER_LOGO_SETTINGS) === JSON.stringify(partnerLogoSettings) &&
      JSON.stringify(latest.socialTrust) === JSON.stringify(socialTrust)
    ) {
      return { row: latest, created: false, partnerCleanupPaths: [] as string[], socialCleanupPaths: [] as string[] };
    }
    const [row] = await tx.insert(sitePublicationRevisionsTable).values({
      version: (latest?.version ?? 0) + 1,
      navigation,
      partnerLogos,
      partnerLogoSettings,
      socialTrust,
      createdBy: res.locals.operator.id,
      publishedBy: res.locals.operator.id,
    }).returning();
    await tx.insert(siteContentAuditLogsTable).values({
      action: "site_publication.published",
      actorId: res.locals.operator.id,
      publicationRevisionId: row.id,
      details: { version: row.version, navigationCount: navigation.length, partnerLogoCount: partnerLogos.length, socialTrustCount: socialTrust.items.length },
    });
    const currentPaths = new Set(
      partnerLogos.filter((logo) => logo.enabled && !logo.removedAt).flatMap(partnerLogoPaths),
    );
    const draftActivePaths = new Set(
      partnerRows.filter((logo) => !logo.removedAt).flatMap((logo) =>
        [logo.objectPath, logo.lightObjectPath, logo.darkObjectPath]
          .filter((path): path is string => Boolean(path))),
    );
    const partnerCleanupPaths = [...new Set((latest?.partnerLogos ?? [])
      .filter((logo) => logo.enabled && !logo.removedAt)
      .flatMap(partnerLogoPaths)
      .filter((path) => !currentPaths.has(path) && !draftActivePaths.has(path)))];
     const currentSocialPaths = new Set(
       socialTrust.items.filter((item) => item.enabled && !item.removedAt && item.objectPath).map((item) => item.objectPath as string),
    );
     const draftActiveSocialPaths = new Set(socialTrust.items.map((item) => item.objectPath).filter((path): path is string => Boolean(path)));
    const socialCleanupPaths = (latest?.socialTrust.items ?? [])
       .filter((item) => item.enabled && !item.removedAt && item.objectPath
        && !currentSocialPaths.has(item.objectPath)
        && !draftActiveSocialPaths.has(item.objectPath))
       .map((item) => item.objectPath)
       .filter((path): path is string => Boolean(path));
    return { row, created: true, partnerCleanupPaths, socialCleanupPaths };
  });
  for (const objectPath of result.partnerCleanupPaths) {
    try { const object = await getStoredPartnerLogo(objectPath); await object.delete(); } catch { /* object cleanup is best effort */ }
  }
  for (const objectPath of result.socialCleanupPaths) {
    try { const object = await getStoredSocialTrustIcon(objectPath); await object.delete(); } catch { /* object cleanup is best effort */ }
  }
  res.status(result.created ? 201 : 200).json(PublishSitePublicationResponse.parse(result.row));
});

router.get("/admin/site-navigation", requireOperator, async (_req, res): Promise<void> => {
  res.json(ListAdminNavigationResponse.parse(await db.select().from(navLinksTable).orderBy(
    desc(navLinksTable.enabled), navLinksTable.label, navLinksTable.href, navLinksTable.id,
  )));
});

router.post("/admin/site-navigation", requireOperator, async (req, res): Promise<void> => {
  const input = SaveAdminNavigationBody.parse(req.body);
  if (!isSafeSiteLink(input.href.trim())) {
    throw new ApiError("NAV_LINK_INVALID", "Navigation links must be relative paths, anchors, or HTTP(S) URLs.", 400);
  }
  const values = { label: input.label.trim(), href: input.href.trim(), enabled: input.enabled, header: input.header, footer: input.footer, widget: input.widget, updatedBy: res.locals.operator.id, updatedAt: new Date() };
  const [row] = await db.transaction(async (tx) => {
    const [saved] = input.id
      ? await tx.update(navLinksTable).set(values).where(eq(navLinksTable.id, input.id)).returning()
      : await tx.insert(navLinksTable).values(values).returning();
    if (saved) {
      await tx.insert(siteContentAuditLogsTable).values({
        action: "site_navigation.saved", actorId: res.locals.operator.id, targetId: saved.id, details: values,
      });
    }
    return [saved];
  });
  if (!row) throw new ApiError("NAV_LINK_NOT_FOUND", "Navigation link not found.", 404);
  res.json(SaveAdminNavigationResponse.parse(row));
});

router.delete("/admin/site-navigation/:id", requireOperator, async (req, res): Promise<void> => {
  const { id } = RemoveAdminNavigationParams.parse(req.params);
  const [row] = await db.transaction(async (tx) => {
    const [removed] = await tx.delete(navLinksTable).where(eq(navLinksTable.id, id)).returning();
    if (removed) {
      await tx.insert(siteContentAuditLogsTable).values({
        action: "site_navigation.removed", actorId: res.locals.operator.id, targetId: removed.id, details: {},
      });
    }
    return [removed];
  });
  if (!row) throw new ApiError("NAV_LINK_NOT_FOUND", "Navigation link not found.", 404);
  res.status(204).end();
});

router.get("/admin/partner-logos", requireOperator, async (_req, res): Promise<void> => {
  const rows = await db.select().from(partnerLogosTable)
    .where(isNull(partnerLogosTable.removedAt))
    .orderBy(partnerLogosTable.sortOrder, partnerLogosTable.name, partnerLogosTable.id);
  res.json(ListAdminPartnerLogosResponse.parse(sortPartnerLogos(rows).map(omitNullSortOrder)));
});

router.get("/admin/partner-logo-settings", requireOperator, async (_req, res): Promise<void> => {
  res.json(GetAdminPartnerLogoSettingsResponse.parse(await draftPartnerLogoSettings()));
});

router.put("/admin/partner-logo-settings", requireOperator, async (req, res): Promise<void> => {
  const input = UpdateAdminPartnerLogoSettingsBody.parse(req.body);
  const actorId = res.locals.operator.id;
  await db.transaction(async (tx) => {
    await tx.insert(partnerLogoSettingsTable).values({
      id: "global", settings: input, updatedBy: actorId, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: partnerLogoSettingsTable.id,
      set: { settings: input, updatedBy: actorId, updatedAt: new Date() },
    });
    await tx.insert(siteContentAuditLogsTable).values({
      action: "partner_logo_settings.updated", actorId, details: input,
    });
  });
  res.json(UpdateAdminPartnerLogoSettingsResponse.parse(input));
});

router.post("/admin/partner-logos/upload", requireOperator, async (req, res): Promise<void> => {
  const { contentType } = RequestPartnerLogoUploadBody.parse(req.body);
  res.json(RequestPartnerLogoUploadResponse.parse(await createPartnerLogoUpload(contentType)));
});

router.post("/admin/partner-logos", requireOperator, async (req, res): Promise<void> => {
  const input = CreateAdminPartnerLogoBody.parse(req.body);
  if (input.link && !isSafeSiteLink(input.link.trim())) {
    throw new ApiError("PARTNER_LINK_INVALID", "Partner links must be relative paths, anchors, or HTTP(S) URLs.", 400);
  }
  await verifyPartnerLogoPaths([input.objectPath, input.lightObjectPath, input.darkObjectPath]);
  const [row] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(partnerLogosTable).values({
      ...input,
      appearance: input.appearance ?? "auto",
      link: input.link == null ? input.link : input.link.trim(),
      createdBy: res.locals.operator.id,
    }).returning();
    await tx.insert(siteContentAuditLogsTable).values({
      action: "partner_logo.created", actorId: res.locals.operator.id, targetId: created.id,
      details: { objectPath: created.objectPath },
    });
    return [created];
  });
  res.status(201).json(CreateAdminPartnerLogoResponse.parse(omitNullSortOrder(row)));
});

router.patch("/admin/partner-logos/:id", requireOperator, async (req, res): Promise<void> => {
  const { id } = UpdateAdminPartnerLogoParams.parse(req.params);
  const input = UpdateAdminPartnerLogoBody.parse(req.body);
  if (input.link && !isSafeSiteLink(input.link.trim())) {
    throw new ApiError("PARTNER_LINK_INVALID", "Partner links must be relative paths, anchors, or HTTP(S) URLs.", 400);
  }
  await verifyPartnerLogoPaths([input.lightObjectPath, input.darkObjectPath]);
  const [row] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(partnerLogosTable).set({
      ...input,
      link: input.link == null ? input.link : input.link.trim(),
      updatedAt: new Date(),
    }).where(and(eq(partnerLogosTable.id, id), isNull(partnerLogosTable.removedAt))).returning();
    if (updated) {
      await tx.insert(siteContentAuditLogsTable).values({
        action: "partner_logo.updated", actorId: res.locals.operator.id, targetId: updated.id, details: input,
      });
    }
    return [updated];
  });
  if (!row) throw new ApiError("PARTNER_LOGO_NOT_FOUND", "Partner logo not found.", 404);
  res.json(UpdateAdminPartnerLogoResponse.parse(omitNullSortOrder(row)));
});

router.delete("/admin/partner-logos/:id", requireOperator, async (req, res): Promise<void> => {
  const { id } = RemoveAdminPartnerLogoParams.parse(req.params);
  const [row] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083153)`);
    const [removed] = await tx.update(partnerLogosTable).set({ removedAt: new Date(), enabled: false, updatedAt: new Date() }).where(and(eq(partnerLogosTable.id, id), isNull(partnerLogosTable.removedAt))).returning();
    if (removed) {
      await tx.insert(siteContentAuditLogsTable).values({
        action: "partner_logo.removed", actorId: res.locals.operator.id, targetId: removed.id, details: {},
      });
    }
    return [removed];
  });
  if (!row) throw new ApiError("PARTNER_LOGO_NOT_FOUND", "Partner logo not found.", 404);
  // Keep all uploads intact until publication cleanup proves they are no
  // longer referenced by either the active draft or the current publication.
  res.status(204).end();
});

router.get("/admin/social-trust", requireOperator, async (_req, res): Promise<void> => {
  res.json(GetAdminSocialTrustResponse.parse(await draftSocialTrust()));
});

router.put("/admin/social-trust", requireOperator, async (req, res): Promise<void> => {
  const input = UpdateAdminSocialTrustTitlesBody.parse(req.body);
  if (!input.socialTitle.trim() || !input.trustTitle.trim()) {
    throw new ApiError("SOCIAL_TRUST_TITLE_INVALID", "Footer section titles cannot be blank.", 400);
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083153)`);
    await tx.insert(socialTrustSettingsTable).values({
      id: "footer",
      socialTitle: input.socialTitle.trim(),
      trustTitle: input.trustTitle.trim(),
      updatedBy: res.locals.operator.id,
    }).onConflictDoUpdate({
      target: socialTrustSettingsTable.id,
      set: {
        socialTitle: input.socialTitle.trim(),
        trustTitle: input.trustTitle.trim(),
        updatedBy: res.locals.operator.id,
        updatedAt: new Date(),
      },
    });
  });
  res.json(UpdateAdminSocialTrustTitlesResponse.parse(await draftSocialTrust()));
});

router.put("/admin/social-trust/social-media", requireOperator, async (req, res): Promise<void> => {
  const input = UpdateAdminSocialMediaBody.parse(req.body);
  const values = {
    instagramUrl: normalizedSocialUrl(input.instagramUrl),
    xUrl: normalizedSocialUrl(input.xUrl),
    facebookUrl: normalizedSocialUrl(input.facebookUrl),
    telegramUrl: normalizedSocialUrl(input.telegramUrl),
    ...(input.appearance ? { appearance: normalizedSocialIconAppearance(input.appearance) } : {}),
  };
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083153)`);
    await tx.insert(socialTrustSettingsTable).values({
      id: "footer",
      ...DEFAULT_SOCIAL_TRUST,
      appearance: DEFAULT_SOCIAL_ICON_APPEARANCE,
      ...values,
      updatedBy: res.locals.operator.id,
    }).onConflictDoUpdate({
      target: socialTrustSettingsTable.id,
     set: { ...values, updatedBy: res.locals.operator.id, updatedAt: new Date() },
    });
    await tx.insert(siteContentAuditLogsTable).values({
      action: "social_media.updated",
      actorId: res.locals.operator.id,
      details: { configuredPlatforms: Object.entries(values).filter(([, value]) => value !== null).map(([key]) => key) },
    });
  });
  res.json(UpdateAdminSocialMediaResponse.parse(await draftSocialTrust()));
});

router.post("/admin/social-trust/upload", requireOperator, async (req, res): Promise<void> => {
  const { contentType } = RequestSocialTrustIconUploadBody.parse(req.body);
  res.json(RequestSocialTrustIconUploadResponse.parse(await createSocialTrustIconUpload(contentType)));
});

router.post("/admin/social-trust/items", requireOperator, async (req, res): Promise<void> => {
  const input = CreateAdminSocialTrustItemBody.parse(req.body);
  if (!input.name.trim()) throw new ApiError("SOCIAL_TRUST_NAME_INVALID", "Footer item names cannot be blank.", 400);
  if (!isSafeSiteLink(input.href.trim())) throw new ApiError("SOCIAL_TRUST_LINK_INVALID", "Footer links must be relative paths, anchors, or HTTP(S) URLs.", 400);
   try {
     if (input.objectPath) await verifyStoredSocialTrustIcon(input.objectPath);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) throw new ApiError("SOCIAL_TRUST_ICON_MISSING", "The uploaded icon could not be found. Please upload it again.", 400);
    if (error instanceof StoredImageInvalidError) throw new ApiError("SOCIAL_TRUST_ICON_INVALID", "This SVG contains unsupported content. Use a standard SVG, PNG, WebP, JPG, or JPEG icon.", 415);
    throw error;
  }
  const [row] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083153)`);
    const [created] = await tx.insert(socialTrustLinksTable).values({
      ...input,
      name: input.name.trim(),
      href: input.href.trim(),
      createdBy: res.locals.operator.id,
    }).returning();
    await tx.insert(siteContentAuditLogsTable).values({
      action: "social_trust.created", actorId: res.locals.operator.id, targetId: created.id,
      details: { group: created.group, objectPath: created.objectPath },
    });
    return [created];
  });
  res.status(201).json(CreateAdminSocialTrustItemResponse.parse(row));
});

router.patch("/admin/social-trust/items/:id", requireOperator, async (req, res): Promise<void> => {
  const { id } = UpdateAdminSocialTrustItemParams.parse(req.params);
  const input = UpdateAdminSocialTrustItemBody.parse(req.body);
  if (input.name !== undefined && !input.name.trim()) throw new ApiError("SOCIAL_TRUST_NAME_INVALID", "Footer item names cannot be blank.", 400);
  if (input.href && !isSafeSiteLink(input.href.trim())) throw new ApiError("SOCIAL_TRUST_LINK_INVALID", "Footer links must be relative paths, anchors, or HTTP(S) URLs.", 400);
  if (input.objectPath) {
    try {
      await verifyStoredSocialTrustIcon(input.objectPath);
    } catch (error) {
      if (error instanceof StoredObjectNotFoundError) throw new ApiError("SOCIAL_TRUST_ICON_MISSING", "The uploaded icon could not be found. Please upload it again.", 400);
      if (error instanceof StoredImageInvalidError) throw new ApiError("SOCIAL_TRUST_ICON_INVALID", "This SVG contains unsupported content. Use a standard SVG, PNG, WebP, JPG, or JPEG icon.", 415);
      throw error;
    }
  }
  const [row] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083153)`);
    const [updated] = await tx.update(socialTrustLinksTable).set({
      ...input,
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.href ? { href: input.href.trim() } : {}),
      updatedAt: new Date(),
    }).where(and(eq(socialTrustLinksTable.id, id), isNull(socialTrustLinksTable.removedAt))).returning();
    if (updated) await tx.insert(siteContentAuditLogsTable).values({
      action: "social_trust.updated", actorId: res.locals.operator.id, targetId: updated.id, details: input,
    });
    return [updated];
  });
  if (!row) throw new ApiError("SOCIAL_TRUST_ITEM_NOT_FOUND", "Footer item not found.", 404);
  res.json(UpdateAdminSocialTrustItemResponse.parse(row));
});

router.delete("/admin/social-trust/items/:id", requireOperator, async (req, res): Promise<void> => {
  const { id } = RemoveAdminSocialTrustItemParams.parse(req.params);
  const [row] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(2026083153)`);
    return tx.update(socialTrustLinksTable).set({
      enabled: false, removedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(socialTrustLinksTable.id, id), isNull(socialTrustLinksTable.removedAt))).returning();
  });
  if (!row) throw new ApiError("SOCIAL_TRUST_ITEM_NOT_FOUND", "Footer item not found.", 404);
  res.status(204).end();
});

router.get("/admin/social-trust/items/:id/preview", requireOperator, async (req, res, next): Promise<void> => {
  const { id } = PreviewAdminSocialTrustIconParams.parse(req.params);
  try {
    const [item] = await db.select({ objectPath: socialTrustLinksTable.objectPath }).from(socialTrustLinksTable)
      .where(and(eq(socialTrustLinksTable.id, id), isNull(socialTrustLinksTable.removedAt))).limit(1);
    if (!item) { res.status(404).json({ error: "Object not found" }); return; }
    if (!item.objectPath) { res.status(404).json({ error: "Item has no icon" }); return; }
    const image = await getVerifiedSocialTrustIcon(item.objectPath);
    res.setHeader("content-type", image.contentType);
    res.setHeader("cache-control", "private, no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(image.buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) { res.status(404).json({ error: "Object not found" }); return; }
    if (error instanceof StoredImageInvalidError) { res.status(415).json({ error: "Stored object is not an allowed image" }); return; }
    next(error);
  }
});

router.get("/admin/contact-submissions", requireOperator, async (req, res): Promise<void> => {
  const { limit } = ListContactSubmissionsQueryParams.parse(req.query);
  const rows = await db.select({ id: contactSubmissionsTable.id, name: contactSubmissionsTable.name, email: contactSubmissionsTable.email, message: contactSubmissionsTable.message, createdAt: contactSubmissionsTable.createdAt })
    .from(contactSubmissionsTable).orderBy(desc(contactSubmissionsTable.createdAt)).limit(limit);
  res.json(ListContactSubmissionsResponse.parse(rows));
});

export default router;