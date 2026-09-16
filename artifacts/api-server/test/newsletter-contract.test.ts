import assert from "node:assert/strict";
import test from "node:test";
import {
  hashNewsletterToken,
  normalizeNewsletterEmail,
  newsletterProviderRetryable,
  newsletterRetryAfterMs,
  newsletterPublicationDedupeKey,
  adminNewsletterStatusTransitionAllowed,
  validateNewsletterReadMorePath,
  validNewsletterEmail,
} from "../src/lib/newsletter-utils";

test("newsletter emails normalize and validate at the server boundary", () => {
  assert.equal(normalizeNewsletterEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(validNewsletterEmail("person@example.com"), true);
  assert.equal(validNewsletterEmail("not-an-email"), false);
  assert.equal(validNewsletterEmail("person@example"), false);
});

test("newsletter unsubscribe token hashes are deterministic and one-way", () => {
  const token = "11111111-1111-4111-8111-111111111111.signature";
  const hash = hashNewsletterToken(token);
  assert.equal(hash, hashNewsletterToken(token));
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
});

test("newsletter Read More URLs reject protocol-relative and unsafe paths", () => {
  for (const value of [
    "//evil.example/path", "javascript:alert(1)", "http://evil.example", "relative/path",
    "https://user:password@quickxchange.net/path", "https://quickxchange.net:8443/path",
    "/\\evil.example/path", "/foo\\@evil.example", "/foo\u0000bar", "/foo\u007fbar",
  ]) {
    assert.throws(() => validateNewsletterReadMorePath(value));
  }
  for (const value of ["/blog/article", "https://quickxchange.net/blog/article"]) {
    assert.doesNotThrow(() => validateNewsletterReadMorePath(value));
  }
});

test("newsletter provider failures classify retryable statuses and Retry-After", () => {
  assert.equal(newsletterProviderRetryable(403), false);
  assert.equal(newsletterProviderRetryable(429), true);
  assert.equal(newsletterProviderRetryable(503), true);
  assert.equal(newsletterRetryAfterMs("12"), 12_000);
  assert.equal(newsletterRetryAfterMs("not-a-duration"), 0);
});

test("newsletter publication identity is stable and unsubscribed consent cannot be reactivated by Admin", () => {
  const when = new Date("2026-09-16T16:00:00.000Z");
  assert.equal(
    newsletterPublicationDedupeKey("11111111-1111-4111-8111-111111111111", when),
    newsletterPublicationDedupeKey("11111111-1111-4111-8111-111111111111", when),
  );
  assert.equal(adminNewsletterStatusTransitionAllowed("unsubscribed", "active"), false);
  assert.equal(adminNewsletterStatusTransitionAllowed("unsubscribed", "disabled"), false);
  assert.equal(adminNewsletterStatusTransitionAllowed("unsubscribed", "unsubscribed"), true);
  assert.equal(adminNewsletterStatusTransitionAllowed("disabled", "active"), true);
  let state: "active" | "disabled" | "unsubscribed" = "unsubscribed";
  if (adminNewsletterStatusTransitionAllowed(state, "disabled")) state = "disabled";
  if (adminNewsletterStatusTransitionAllowed(state, "active")) state = "active";
  assert.equal(state, "unsubscribed");
});