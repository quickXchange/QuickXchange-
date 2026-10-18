import { Router } from "express";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { adminInboxReceiptsTable as receipts, adminInboxTable as events, db } from "@workspace/db";
import { requireOperator, type OperatorAuthorization } from "../lib/operator-auth";
import { inboxVisibility } from "../lib/admin-inbox";
import { ApiError } from "../lib/api-error";

const router = Router();
const params = z.object({ filter: z.enum(["all", "read", "unread"]).default("all"), page: z.coerce.number().int().min(1).max(100000).default(1) });
const uuid = z.string().uuid();
const pageSize = 20;
router.use("/admin/notifications", requireOperator, (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

router.get("/admin/notifications", async (req, res) => {
  const input = params.safeParse(req.query);
  if (!input.success) throw new ApiError("INVALID_NOTIFICATION_FILTER", "Use all, read or unread and a positive page number.", 400);
  const operator = res.locals.operator as OperatorAuthorization;
  const join = and(eq(receipts.notificationId, events.id), eq(receipts.operatorId, operator.id));
  const visible = and(inboxVisibility(operator), isNull(receipts.deletedAt));
  // One snapshot: counts and page cannot disagree during concurrent event delivery.
  const result = await db.transaction(async tx => {
    const [counts] = await tx.select({
      allCount: sql<number>`count(*)::int`,
      unreadCount: sql<number>`count(*) filter (where ${receipts.readAt} is null)::int`,
      readCount: sql<number>`count(*) filter (where ${receipts.readAt} is not null)::int`,
    }).from(events).leftJoin(receipts, join).where(visible);
    const filter = input.data.filter;
    const total = filter === "all" ? counts.allCount : filter === "read" ? counts.readCount : counts.unreadCount;
    const page = Math.min(input.data.page, Math.max(1, Math.ceil(total / pageSize)));
    const items = await tx.select({
      id: events.id, kind: events.kind, title: events.title, message: events.message,
      orderType: sql<"Swap" | "Convert">`case when ${events.eventKey} like 'swap:%' then 'Swap' else 'Convert' end`,
      orderId: events.orderId, createdAt: events.createdAt,
      read: sql<boolean>`${receipts.readAt} is not null`,
    }).from(events).leftJoin(receipts, join).where(and(visible,
      filter === "all" ? undefined : filter === "read" ? isNotNull(receipts.readAt) : isNull(receipts.readAt),
    )).orderBy(desc(events.createdAt), desc(events.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { ...counts, items, total, page, pageSize };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(result);
});

router.post("/admin/notifications/read-all", async (_req, res) => {
  const operator = res.locals.operator as OperatorAuthorization;
  const allowed = inboxVisibility(operator);
  await db.execute(sql`
    INSERT INTO admin_inbox_receipts (notification_id, operator_id, read_at)
    SELECT e.id, ${operator.id}, now() FROM ${events} e
    WHERE e.id IN (SELECT ${events.id} FROM ${events} WHERE ${allowed})
    ON CONFLICT (notification_id, operator_id)
    DO UPDATE SET read_at = coalesce(admin_inbox_receipts.read_at, excluded.read_at)
  `);
  res.json({ success: true });
});

for (const action of ["read", "delete"] as const) {
  const handler = async (req: import("express").Request, res: import("express").Response) => {
    const id = uuid.safeParse(req.params.id);
    if (!id.success) throw new ApiError("INVALID_NOTIFICATION_ID", "Invalid notification ID.", 400);
    const operator = res.locals.operator as OperatorAuthorization;
    const [event] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.id, id.data), inboxVisibility(operator))).limit(1);
    if (!event) throw new ApiError("NOTIFICATION_NOT_FOUND", "Notification not found.", 404);
    const now = new Date();
    await db.insert(receipts).values({
      notificationId: event.id, operatorId: operator.id,
      ...(action === "read" ? { readAt: now } : { deletedAt: now }),
    }).onConflictDoUpdate({
      target: [receipts.notificationId, receipts.operatorId],
      set: action === "read" ? { readAt: sql`coalesce(${receipts.readAt}, ${now})` } : { deletedAt: now },
    });
    res.json({ success: true });
  };
  if (action === "read") router.post("/admin/notifications/:id/read", handler);
  else router.delete("/admin/notifications/:id", handler);
}

export default router;
