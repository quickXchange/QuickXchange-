import { asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  SubscribeNewsletterBody,
  PublishNewsletterAnnouncementBody,
  UpdateNewsletterSubscriberBody,
} from "@workspace/api-zod";
import {
  db,
  newsletterSubscribersTable,
} from "@workspace/db";
import { ApiError } from "../lib/api-error";
import { getTrustedClientIp } from "../lib/client-ip";
import { requireOperator } from "../lib/operator-auth";
import {
  enqueueNewsletterCampaign,
  normalizeNewsletterEmail,
  rateLimitedNewsletterIp,
  subscribeNewsletter,
  updateNewsletterSubscriberStatus,
  validateNewsletterReadMorePath,
  unsubscribeNewsletter,
  validNewsletterEmail,
  NewsletterReactivationError,
} from "../lib/newsletter";

const router: IRouter = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.post("/newsletter/subscribe", async (req, res) => {
  if (await rateLimitedNewsletterIp(getTrustedClientIp(req))) {
    throw new ApiError("NEWSLETTER_RATE_LIMITED", "Too many subscription attempts. Please try again later.", 429);
  }
  const { email } = SubscribeNewsletterBody.parse(req.body);
  const normalized = normalizeNewsletterEmail(email);
  if (!validNewsletterEmail(normalized)) throw new ApiError("NEWSLETTER_EMAIL_INVALID", "Please enter a valid email address.", 400);
  await subscribeNewsletter(normalized);
  res.status(202).json({
    message: "Thanks. Your newsletter preference has been recorded.",
  });
});

router.get("/newsletter/unsubscribe", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{20,}$/.test(token)) {
    res.status(400).type("html").send("<h1>Invalid unsubscribe link</h1>");
    return;
  }
  const updated = await unsubscribeNewsletter(token);
  res.status(updated ? 200 : 404).type("html").send(updated
    ? "<h1>You have been unsubscribed</h1><p>You will no longer receive QuickXchange newsletter emails.</p>"
    : "<h1>Unsubscribe link expired</h1>");
});

router.get("/admin/newsletter/subscribers", requireOperator, async (_req, res) => {
  const rows = await db.select({
    id: newsletterSubscribersTable.id,
    email: newsletterSubscribersTable.email,
    status: newsletterSubscribersTable.status,
    createdAt: newsletterSubscribersTable.createdAt,
    updatedAt: newsletterSubscribersTable.updatedAt,
    unsubscribedAt: newsletterSubscribersTable.unsubscribedAt,
  }).from(newsletterSubscribersTable).orderBy(desc(newsletterSubscribersTable.createdAt), asc(newsletterSubscribersTable.email));
  res.json({ items: rows });
});

router.patch("/admin/newsletter/subscribers/:id", requireOperator, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!UUID.test(id)) { res.status(400).json({ error: "Invalid subscriber ID" }); return; }
  const status = UpdateNewsletterSubscriberBody.parse(req.body).status;
  let row;
  try {
    row = await updateNewsletterSubscriberStatus(id, status);
  } catch (error) {
    if (error instanceof NewsletterReactivationError) {
      throw new ApiError("NEWSLETTER_REACTIVATION_REQUIRES_VERIFIED_FLOW", "Unsubscribed subscribers require a separate verified re-opt-in flow.", 409);
    }
    throw error;
  }
  if (!row) { res.status(404).json({ error: "Subscriber not found" }); return; }
  res.json({ id: row.id, email: row.email, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, unsubscribedAt: row.unsubscribedAt });
});

router.delete("/admin/newsletter/subscribers/:id", requireOperator, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!UUID.test(id)) { res.status(400).json({ error: "Invalid subscriber ID" }); return; }
  const [row] = await db.delete(newsletterSubscribersTable).where(eq(newsletterSubscribersTable.id, id)).returning({ id: newsletterSubscribersTable.id });
  if (!row) { res.status(404).json({ error: "Subscriber not found" }); return; }
  res.status(204).end();
});

router.post("/admin/newsletter/announcements", requireOperator, async (req, res) => {
  const input = PublishNewsletterAnnouncementBody.parse(req.body);
  try { validateNewsletterReadMorePath(input.readMorePath); } catch { throw new ApiError("NEWSLETTER_LINK_INVALID", "Read More must be a safe relative or HTTPS URL.", 400); }
  const dedupeKey = `announcement:${randomUUID()}`;
  await enqueueNewsletterCampaign({ ...input, dedupeKey });
  res.status(201).json({ title: input.title, description: input.description, readMorePath: input.readMorePath });
});

export default router;