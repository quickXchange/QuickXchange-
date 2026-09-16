import { createHash } from "node:crypto";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeNewsletterEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validNewsletterEmail(value: string): boolean {
  return value.length <= 320 && EMAIL.test(value);
}

export function hashNewsletterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function validateNewsletterReadMorePath(path: string): void {
  const fixedOrigin = "https://quickxchange.invalid";
  if (/^\/(?!\/)[^\s]*$/.test(path) && !/[\\\u0000-\u001f\u007f]/.test(path)) {
    try {
      const resolved = new URL(path, fixedOrigin);
      if (resolved.origin === fixedOrigin) return;
    } catch {
      // Fall through to the stable validation error below.
    }
  }
  try {
    const parsed = new URL(path);
    if (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === "443")
    ) return;
  } catch {
    // Fall through to the stable validation error below.
  }
  throw new Error("NEWSLETTER_LINK_INVALID");
}

export function newsletterProviderRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function newsletterRetryAfterMs(value: string | null): number {
  const seconds = Number(value ?? "");
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1000, 60 * 60_000)
    : 0;
}

export function newsletterPublicationDedupeKey(articleId: string, publishedAt: Date): string {
  return `blog-article:${articleId}:${publishedAt.toISOString()}`;
}

export function adminNewsletterStatusTransitionAllowed(
  current: "active" | "disabled" | "unsubscribed",
  next: "active" | "disabled" | "unsubscribed",
): boolean {
  return current !== "unsubscribed" || next === "unsubscribed";
}