import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateContactSubmissionBody,
  CreateAdminPartnerLogoBody,
  GetPublishedSiteContentResponse,
  GetWebsiteBrandingResponse,
  PreviewAdminPartnerLogoParams,
  PreviewAdminSitePageMediaParams,
  RequestSitePageMediaUploadBody,
  RequestSocialTrustIconUploadBody,
  CreateAdminSocialTrustItemBody,
  SaveAdminSitePageBody,
  SaveAdminNavigationBody,
  SaveAdminWebsiteBrandingBody,
  UpdateAdminPartnerLogoSettingsBody,
  RequestWebsiteBrandingUploadBody,
} from "@workspace/api-zod";
import { buildContactSupportEmail } from "../src/lib/contact-support-email";
import { isSafeSiteLink } from "../src/lib/site-content-policy";
import { getTrustedClientIp, trustedProxyHops } from "../src/lib/client-ip";

test("site content contract accepts the registered pages and future slug-safe pages", () => {
  const pages = ["home", "convert", "swap", "market-rates", "about-us", "affiliate-program", "operations", "contact-us", "privacy-policy", "terms-conditions", "aml-kyc"];
  const payload = {
    pages: pages.map((pageKey) => ({
      id: "00000000-0000-4000-8000-000000000000",
      pageKey,
      revision: 1,
      status: "published",
      content: {},
      createdBy: "operator",
      publishedBy: null,
      publishedAt: null,
      createdAt: new Date(),
    })),
    navigation: [],
    partnerLogos: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "Legacy partner",
      objectPath: "/objects/partner-logos/22222222-2222-4222-8222-222222222222",
      link: null,
      enabled: true,
      createdAt: new Date(),
    }],
    partnerLogoSettings: {
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
    },
    socialTrust: {
      socialTitle: "Stay connected with us",
      trustTitle: "Share your feedback with us",
      instagramUrl: null,
      xUrl: null,
      facebookUrl: null,
      telegramUrl: null,
      items: [],
    },
    branding: {
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
      alignment: "left",
    },
  };
  const publicContent = GetPublishedSiteContentResponse.parse(payload);
  assert.equal(publicContent.pages.length, 11);
  assert.equal(publicContent.partnerLogos[0]?.appearance, undefined);
  assert.equal(publicContent.partnerLogoSettings.layout, "carousel");
  assert.equal(Object.hasOwn(publicContent.pages[0]!, "createdBy"), false);
  assert.equal(Object.hasOwn(publicContent.pages[0]!, "publishedBy"), false);
  assert.deepEqual(SaveAdminSitePageBody.parse({ content: {} }), { content: {} });
});

test("partner logo appearance variants and layout settings are constrained", () => {
  const logo = CreateAdminPartnerLogoBody.parse({
    name: "Partner",
    objectPath: "/objects/partner-logos/11111111-1111-4111-8111-111111111111",
    lightObjectPath: "/objects/partner-logos/22222222-2222-4222-8222-222222222222",
    darkObjectPath: null,
    enabled: true,
  });
  assert.equal(logo.appearance, "auto");
  assert.equal(logo.lightObjectPath, "/objects/partner-logos/22222222-2222-4222-8222-222222222222");
  assert.throws(() => CreateAdminPartnerLogoBody.parse({
    name: "Partner",
    objectPath: "/objects/partner-logos/11111111-1111-4111-8111-111111111111",
    lightObjectPath: "/objects/website-branding/22222222-2222-4222-8222-222222222222",
    enabled: true,
  }));
  const settings = UpdateAdminPartnerLogoSettingsBody.parse({
    layout: "marquee",
    animation: "auto-scroll",
    direction: "rtl",
    speed: "fast",
    pauseOnHover: true,
    manualInteraction: false,
    resumeAfterInteraction: false,
    columnsDesktop: 6,
    columnsTablet: 4,
    columnsMobile: 2,
    size: "custom",
    customSize: 240,
    container: "glow-card",
    spacing: "wide",
    alignment: "right",
  });
  assert.equal(settings.layout, "marquee");
  assert.throws(() => UpdateAdminPartnerLogoSettingsBody.parse({ ...settings, columnsMobile: 3 }));
  assert.throws(() => UpdateAdminPartnerLogoSettingsBody.parse({ ...settings, customSize: 241 }));
  for (const speed of ["very-slow", "slow", "normal", "fast", "very-fast"]) {
    assert.equal(UpdateAdminPartnerLogoSettingsBody.parse({ ...settings, speed }).speed, speed);
  }
  for (const customSpeed of [1, 150]) {
    assert.equal(UpdateAdminPartnerLogoSettingsBody.parse({ ...settings, speed: "custom", customSpeed }).customSpeed, customSpeed);
  }
  for (const customSpeed of [0, 151, 1.5]) {
    assert.throws(() => UpdateAdminPartnerLogoSettingsBody.parse({ ...settings, speed: "custom", customSpeed }));
  }
});

test("website branding contract constrains namespaced uploads and dimensions", () => {
  const objectPath = "/objects/website-branding/11111111-1111-4111-8111-111111111111";
  const settings = {
    lightLogoPath: objectPath,
    darkLogoPath: objectPath,
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
  assert.deepEqual(GetWebsiteBrandingResponse.parse(settings), settings);
  assert.deepEqual(SaveAdminWebsiteBrandingBody.parse(settings), settings);
  for (const contentType of ["image/svg+xml", "image/png", "image/webp", "image/jpeg"]) {
    assert.equal(RequestWebsiteBrandingUploadBody.parse({ contentType }).contentType, contentType);
  }
  assert.throws(() => SaveAdminWebsiteBrandingBody.parse({ ...settings, lightLogoPath: "/objects/partner-logos/11111111-1111-4111-8111-111111111111" }));
  assert.throws(() => SaveAdminWebsiteBrandingBody.parse({ ...settings, logoWidth: 0 }));
  assert.throws(() => SaveAdminWebsiteBrandingBody.parse({ ...settings, mobileLogoWidth: 221 }));
  assert.throws(() => RequestWebsiteBrandingUploadBody.parse({ contentType: "text/html" }));
});

test("social and trust items are custom, image-backed, and URL constrained", () => {
  const input = CreateAdminSocialTrustItemBody.parse({
    group: "trust",
    name: "Any custom platform",
    href: "https://reviews.example.test/profile",
    objectPath: "/objects/social-trust-icons/11111111-1111-4111-8111-111111111111",
    enabled: true,
  });
  assert.equal(input.name, "Any custom platform");
  for (const contentType of ["image/svg+xml", "image/png", "image/webp", "image/jpeg"]) {
    assert.equal(RequestSocialTrustIconUploadBody.parse({ contentType }).contentType, contentType);
  }
  assert.throws(() => RequestSocialTrustIconUploadBody.parse({ contentType: "text/html" }));
  assert.throws(() => CreateAdminSocialTrustItemBody.parse({ ...input, objectPath: "/objects/partner-logos/11111111-1111-4111-8111-111111111111" }));
});

test("contact submission contract rejects missing and oversized fields", () => {
  assert.throws(() => CreateContactSubmissionBody.parse({ name: "", email: "not-an-email", message: "" }));
  assert.throws(() => CreateContactSubmissionBody.parse({
    name: "A",
    email: "a@example.test",
    message: "x".repeat(5001),
  }));
});

test("contact support email contains reply context and safely escapes customer content", () => {
  const email = buildContactSupportEmail({
    submissionId: "11111111-1111-4111-8111-111111111111",
    customerName: "Jane <Customer>",
    customerEmail: "jane@example.com",
    message: "Please reply & help.",
    receivedAt: new Date("2026-09-16T16:00:00.000Z"),
  });
  assert.match(email.text, /Customer Name: Jane <Customer>/);
  assert.match(email.text, /Customer Email: jane@example\.com/);
  assert.match(email.text, /Date\/Time: 2026-09-16T16:00:00\.000Z/);
  assert.match(email.html, /Jane &lt;Customer&gt;/);
  assert.match(email.html, /Please reply &amp; help\./);
});

test("navigation and partner links use a strict safe URL policy", () => {
  for (const unsafe of ["javascript:alert(1)", "data:text/html,x", "ftp://example.test/a", "//evil.test/path", "https://user:pass@example.test"]) {
    assert.equal(isSafeSiteLink(unsafe), false, unsafe);
  }
  for (const safe of ["/about-us", "#contact", "https://partner.example.test/path"]) {
    assert.equal(isSafeSiteLink(safe), true, safe);
  }
});

test("navigation links support independent header, footer, and widget placement", () => {
  const link = SaveAdminNavigationBody.parse({
    label: "Track order",
    href: "/status",
    enabled: true,
    header: false,
    footer: true,
    widget: true,
  });
  assert.equal(link.header, false);
  assert.equal(link.footer, true);
  assert.equal(link.widget, true);
});

test("admin partner-logo preview contract is UUID/path constrained", () => {
  assert.equal(
    PreviewAdminPartnerLogoParams.parse({ id: "11111111-1111-4111-8111-111111111111" }).id,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.throws(() => PreviewAdminPartnerLogoParams.parse({ id: "../private-file" }));
});

test("page media upload and preview contracts allow only supported image types and safe identifiers", () => {
  for (const contentType of ["image/svg+xml", "image/png", "image/webp", "image/jpeg"]) {
    assert.equal(RequestSitePageMediaUploadBody.parse({ contentType }).contentType, contentType);
  }
  assert.throws(() => RequestSitePageMediaUploadBody.parse({ contentType: "text/html" }));
  assert.deepEqual(
    PreviewAdminSitePageMediaParams.parse({
      pageKey: "future-page",
      id: "11111111-1111-4111-8111-111111111111",
    }),
    { pageKey: "future-page", id: "11111111-1111-4111-8111-111111111111" },
  );
  assert.throws(() => PreviewAdminSitePageMediaParams.parse({ pageKey: "../admin", id: "../private-file" }));
});

test("contact throttling identity uses normalized Express client IP only", () => {
  assert.equal(getTrustedClientIp({ ip: "::ffff:203.0.113.8", socket: { remoteAddress: "127.0.0.1" } } as never), "203.0.113.8");
  assert.equal(getTrustedClientIp({ ip: "2001:0DB8:0:0:0:0:0:1", socket: { remoteAddress: "127.0.0.1" } } as never), "2001:db8::1");
  assert.equal(getTrustedClientIp({ ip: "not-an-ip", socket: { remoteAddress: "2001:db8::1" } } as never), "2001:db8::1");
  assert.equal(trustedProxyHops(), 0);
});