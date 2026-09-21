import { Router } from "express";
import { eq } from "drizzle-orm";
import { UpdateAdminNotificationSettingsBody } from "@workspace/api-zod";
import { db, notificationSettingsTable } from "@workspace/db";
import { requireOwner } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";

const router = Router();

async function getSettings() {
  let [settings] = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global")).limit(1);
  if (!settings) {
    [settings] = await db.insert(notificationSettingsTable).values({ id: "global" }).returning();
  }
  return settings;
}

router.get("/admin/notification-settings", requireOwner, async (_req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

router.get("/notification-settings/public", async (_req, res) => {
  const settings = await getSettings();
  res.json({ trustpilotReviewUrl: settings.trustpilotReviewUrl || null });
});

router.put("/admin/notification-settings", requireOwner, async (req, res) => {
  const parsed = UpdateAdminNotificationSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError("INVALID_NOTIFICATION_SETTINGS", parsed.error.issues[0]?.message ?? "Invalid notification settings.", 400);
  }
  if (parsed.data.adminNotificationEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parsed.data.adminNotificationEmail)) {
    throw new ApiError("INVALID_NOTIFICATION_SETTINGS", "Enter a valid email address.", 400);
  }
  if (parsed.data.trustpilotReviewUrl && !/^https:\/\/(?:www\.)?trustpilot\.com\//i.test(parsed.data.trustpilotReviewUrl)) {
    throw new ApiError("INVALID_NOTIFICATION_SETTINGS", "Trustpilot URL must be on trustpilot.com.", 400);
  }
  const [settings] = await db.update(notificationSettingsTable)
    .set({ ...parsed.data, updatedBy: res.locals.operator.id, updatedAt: new Date() })
    .where(eq(notificationSettingsTable.id, "global"))
    .returning();
  if (!settings) throw new ApiError("NOTIFICATION_SETTINGS_NOT_FOUND", "Notification settings are not initialized.", 404);
  res.json(settings);
});

export default router;