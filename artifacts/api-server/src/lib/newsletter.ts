import { createHmac, randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  db,
  databasePoolTelemetry,
  newsletterCampaignsTable,
  newsletterDeliveriesTable,
  newsletterSubscribersTable,
  newsletterRateLimitsTable,
} from "@workspace/db";
import { logger } from "./logger";

const CLAIM_MS = 2 * 60_000;
const PROVIDER_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 5;
const RETRY_WINDOW_MS = 12 * 60 * 60_000;

export { hashNewsletterToken, normalizeNewsletterEmail, validNewsletterEmail } from "./newsletter-utils";
import {
  hashNewsletterToken,
  normalizeNewsletterEmail,
  newsletterProviderRetryable,
  newsletterRetryAfterMs,
  adminNewsletterStatusTransitionAllowed,
  validateNewsletterReadMorePath,
} from "./newsletter-utils";
export { validateNewsletterReadMorePath } from "./newsletter-utils";

function tokenForSubscriber(id: string): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is required for newsletter links.");
  const signature = createHmac("sha256", secret).update(id).digest("base64url");
  return `${id}.${signature}`;
}

export function publicBaseUrl(): string {
  const value = process.env.PUBLIC_APP_URL?.trim();
  if (!value) throw new Error("PUBLIC_APP_URL is required for newsletter links.");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("PUBLIC_APP_URL must be an HTTPS URL without credentials.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export async function rateLimitedNewsletterIp(ip: string): Promise<boolean> {
  const key = `newsletter:subscribe:${ip}`;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 60_000);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    await tx.delete(newsletterRateLimitsTable).where(lt(newsletterRateLimitsTable.updatedAt, new Date(now.getTime() - 24 * 60 * 60_000)));
    const [row] = await tx.select().from(newsletterRateLimitsTable).where(eq(newsletterRateLimitsTable.key, key)).limit(1);
    if (!row || row.windowStartedAt <= cutoff) {
      await tx.insert(newsletterRateLimitsTable).values({ key, windowStartedAt: now, attempts: 1, updatedAt: now })
        .onConflictDoUpdate({ target: newsletterRateLimitsTable.key, set: { windowStartedAt: now, attempts: 1, updatedAt: now } });
      return false;
    }
    if (row.attempts >= 5) {
      await tx.update(newsletterRateLimitsTable).set({ updatedAt: now }).where(eq(newsletterRateLimitsTable.key, key));
      return true;
    }
    await tx.update(newsletterRateLimitsTable).set({ attempts: row.attempts + 1, updatedAt: now }).where(eq(newsletterRateLimitsTable.key, key));
    return false;
  });
}

export async function subscribeNewsletter(email: string) {
  const normalized = normalizeNewsletterEmail(email);
  const id = randomUUID();
  const [created] = await db.insert(newsletterSubscribersTable).values({
    id, email: normalized, unsubscribeTokenHash: hashNewsletterToken(tokenForSubscriber(id)),
  }).onConflictDoNothing({ target: newsletterSubscribersTable.email }).returning();
  return { subscriber: created ?? null };
}

export async function unsubscribeNewsletter(token: string): Promise<boolean> {
  const hash = hashNewsletterToken(token);
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(newsletterSubscribersTable).set({
      status: "unsubscribed", unsubscribedAt: new Date(), updatedAt: new Date(),
    }).where(eq(newsletterSubscribersTable.unsubscribeTokenHash, hash)).returning({ id: newsletterSubscribersTable.id });
    if (!updated) return false;
    await tx.update(newsletterDeliveriesTable).set({
      deliveryStatus: "suppressed", claimToken: null, claimExpiresAt: null, claimHeartbeatAt: null,
    }).where(and(
      eq(newsletterDeliveriesTable.subscriberId, updated.id),
      or(eq(newsletterDeliveriesTable.deliveryStatus, "pending"), eq(newsletterDeliveriesTable.deliveryStatus, "sending")),
    ));
    return true;
  });
}

export async function updateNewsletterSubscriberStatus(id: string, status: "active" | "disabled" | "unsubscribed") {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ status: newsletterSubscribersTable.status })
      .from(newsletterSubscribersTable).where(eq(newsletterSubscribersTable.id, id)).limit(1);
    if (current && !adminNewsletterStatusTransitionAllowed(
      current.status as "active" | "disabled" | "unsubscribed", status,
    )) {
      throw new NewsletterReactivationError();
    }
    const [row] = await tx.update(newsletterSubscribersTable).set({
      status, updatedAt: new Date(), unsubscribedAt: status === "unsubscribed" ? new Date() : null,
    }).where(and(
      eq(newsletterSubscribersTable.id, id),
      ...(current ? [eq(newsletterSubscribersTable.status, current.status)] : []),
    )).returning();
    if (!row) return null;
    if (status !== "active") {
      await tx.update(newsletterDeliveriesTable).set({
        deliveryStatus: "suppressed", claimToken: null, claimExpiresAt: null, claimHeartbeatAt: null,
      }).where(and(
        eq(newsletterDeliveriesTable.subscriberId, id),
        or(eq(newsletterDeliveriesTable.deliveryStatus, "pending"), eq(newsletterDeliveriesTable.deliveryStatus, "sending")),
      ));
    }
    return row;
  });
}

export async function enqueueNewsletterCampaign(input: {
  dedupeKey: string; title: string; description: string; readMorePath: string;
}): Promise<void> {
  validateNewsletterReadMorePath(input.readMorePath);
  await db.transaction((tx) => enqueueNewsletterCampaignTx(tx, input));
}

export async function enqueueNewsletterCampaignTx(tx: any, input: {
  dedupeKey: string; title: string; description: string; readMorePath: string;
}): Promise<void> {
  validateNewsletterReadMorePath(input.readMorePath);
  const [campaign] = await tx.insert(newsletterCampaignsTable).values(input)
    .onConflictDoNothing({ target: newsletterCampaignsTable.dedupeKey }).returning();
  if (!campaign) return;
  const subscribers = await tx.select({ id: newsletterSubscribersTable.id })
    .from(newsletterSubscribersTable).where(eq(newsletterSubscribersTable.status, "active"));
  if (subscribers.length) {
    await tx.insert(newsletterDeliveriesTable).values(subscribers.map((subscriber: { id: string }) => ({
      campaignId: campaign.id, subscriberId: subscriber.id,
    }))).onConflictDoNothing();
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

class NewsletterDeliveryError extends Error {
  constructor(readonly retryable: boolean, readonly retryAfterMs = 0, readonly code = "DELIVERY_FAILED") {
    super(code);
  }
}

export class NewsletterReactivationError extends Error {
  constructor() {
    super("NEWSLETTER_REACTIVATION_REQUIRES_VERIFIED_FLOW");
  }
}

async function sendNewsletterEmail(delivery: typeof newsletterDeliveriesTable.$inferSelect, campaign: typeof newsletterCampaignsTable.$inferSelect, subscriber: typeof newsletterSubscribersTable.$inferSelect): Promise<void> {
  const base = publicBaseUrl();
  validateNewsletterReadMorePath(campaign.readMorePath);
  const readMoreUrl = new URL(campaign.readMorePath, `${base}/`).toString();
  const unsubscribeToken = tokenForSubscriber(subscriber.id);
  const unsubscribeUrl = new URL(`/api/newsletter/unsubscribe?token=${encodeURIComponent(
    unsubscribeToken,
  )}`, `${base}/`).toString();
  const html = `<div style="font-family:Arial,sans-serif;color:#111827;max-width:620px;margin:auto"><h1 style="color:#4f46e5">QuickXchange</h1><h2>${escapeHtml(campaign.title)}</h2><p>${escapeHtml(campaign.description)}</p><p><a href="${escapeHtml(readMoreUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Read More</a></p><p style="font-size:12px;color:#6b7280"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p></div>`;
  const text = `QuickXchange\n\n${campaign.title}\n\n${campaign.description}\n\nRead More: ${readMoreUrl}\n\nUnsubscribe: ${unsubscribeUrl}`;
  const request = new ReplitConnectors().proxy("resend", "/emails", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `newsletter-delivery-${delivery.id}` },
    body: {
      from: process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL?.trim() || "QuickXchange <support@quickchange.exchange>",
      to: [subscriber.email], subject: campaign.title, html, text,
    },
  });
  let response: Response;
  try {
    response = await Promise.race([
      request,
      new Promise<never>((_, reject) => setTimeout(() => reject(new NewsletterDeliveryError(true, 0, "PROVIDER_TIMEOUT")), PROVIDER_TIMEOUT_MS)),
    ]);
  } catch (error) {
    if (error instanceof NewsletterDeliveryError) throw error;
    throw new NewsletterDeliveryError(true, 0, "PROVIDER_REQUEST_FAILED");
  }
  if (!response.ok) {
    throw new NewsletterDeliveryError(
      newsletterProviderRetryable(response.status),
      newsletterRetryAfterMs(response.headers.get("retry-after")),
      `RESEND_HTTP_${response.status}`,
    );
  }
}

function eligible(now: Date) {
  return or(
    and(eq(newsletterDeliveriesTable.deliveryStatus, "pending"), lte(newsletterDeliveriesTable.nextAttemptAt, now)),
    and(eq(newsletterDeliveriesTable.deliveryStatus, "sending"), or(isNull(newsletterDeliveriesTable.claimExpiresAt), lte(newsletterDeliveriesTable.claimExpiresAt, now))),
  );
}

export async function processNewsletterOutbox(limit = 25): Promise<number> {
  const now = new Date();
  const candidates = await db.select().from(newsletterDeliveriesTable).where(eligible(now))
    .orderBy(asc(newsletterDeliveriesTable.createdAt), asc(newsletterDeliveriesTable.id)).limit(limit);
  let delivered = 0;
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const [claimed] = await db.update(newsletterDeliveriesTable).set({
      deliveryStatus: "sending", claimToken, claimExpiresAt: new Date(now.getTime() + CLAIM_MS),
      claimHeartbeatAt: now,
      attemptCount: candidate.attemptCount + 1, providerIdempotencyStartedAt: sql`coalesce(${newsletterDeliveriesTable.providerIdempotencyStartedAt}, ${now})`,
    }).where(and(eq(newsletterDeliveriesTable.id, candidate.id), eligible(now))).returning();
    if (!claimed) continue;
    const activeClaim = and(eq(newsletterDeliveriesTable.id, claimed.id), eq(newsletterDeliveriesTable.claimToken, claimToken));
    const heartbeat = setInterval(() => {
      void db.update(newsletterDeliveriesTable).set({
        claimExpiresAt: new Date(Date.now() + CLAIM_MS),
        claimHeartbeatAt: new Date(),
      }).where(activeClaim).catch((error: unknown) => logger.warn({ err: error, newsletterDeliveryId: claimed.id }, "Newsletter claim renewal failed"));
    }, Math.floor(CLAIM_MS / 3));
    heartbeat.unref();
    try {
      if (claimed.providerIdempotencyStartedAt && now.getTime() - claimed.providerIdempotencyStartedAt.getTime() >= RETRY_WINDOW_MS) throw new Error("EMAIL_IDEMPOTENCY_WINDOW_EXPIRED");
      const [campaign] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, claimed.campaignId)).limit(1);
      const [subscriber] = await db.select().from(newsletterSubscribersTable).where(eq(newsletterSubscribersTable.id, claimed.subscriberId)).limit(1);
      if (!campaign || !subscriber || subscriber.status !== "active") {
        await db.update(newsletterDeliveriesTable).set({ deliveryStatus: "suppressed", claimToken: null, claimExpiresAt: null, claimHeartbeatAt: null }).where(activeClaim);
        continue;
      }
      await sendNewsletterEmail(claimed, campaign, subscriber);
      const [completed] = await db.update(newsletterDeliveriesTable).set({ deliveryStatus: "delivered", deliveredAt: new Date(), claimToken: null, claimExpiresAt: null, claimHeartbeatAt: null }).where(and(activeClaim, eq(newsletterDeliveriesTable.deliveryStatus, "sending"))).returning({ id: newsletterDeliveriesTable.id });
      if (completed) delivered++;
    } catch (error) {
      const exhausted = claimed.attemptCount >= MAX_ATTEMPTS;
      const retryable = error instanceof NewsletterDeliveryError ? error.retryable : true;
      const retryAfterMs = error instanceof NewsletterDeliveryError ? error.retryAfterMs : 0;
      await db.update(newsletterDeliveriesTable).set({
        deliveryStatus: !retryable || exhausted ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + (retryAfterMs || Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, claimed.attemptCount - 1)))),
        retryAfterAt: retryAfterMs ? new Date(Date.now() + retryAfterMs) : null,
        claimToken: null, claimExpiresAt: null, claimHeartbeatAt: null,
        lastErrorCode: error instanceof Error ? error.message.slice(0, 160) : "DeliveryError",
      }).where(activeClaim);
      logger.warn({ err: error, newsletterDeliveryId: claimed.id }, "Newsletter delivery failed");
    } finally {
      clearInterval(heartbeat);
    }
  }
  return delivered;
}

export function startNewsletterWorker() {
  const timer = setInterval(() => {
    void processNewsletterOutbox().catch((error) => logger.warn({
      err: error,
      dbPool: databasePoolTelemetry("newsletter-worker", error),
    }, "Newsletter worker failed"));
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}