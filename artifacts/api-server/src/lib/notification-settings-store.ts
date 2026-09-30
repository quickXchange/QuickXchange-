import { eq } from "drizzle-orm";
import { UpdateAdminNotificationSettingsBody } from "@workspace/api-zod";
import { db, notificationSettingsTable, type NotificationSettings } from "@workspace/db";
import { ApiError } from "./api-error";
import { adminEmailEventEnabled, adminTelegramEventEnabled, type NotificationEventKind } from "./notification-policy";

const events: NotificationEventKind[] = [
  "order_created", "payment_received", "processing", "completed", "failed_cancelled",
];

export async function getNotificationSettings() {
  let [settings] = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global")).limit(1);
  if (!settings) {
    await db.insert(notificationSettingsTable).values({ id: "global" }).onConflictDoNothing();
    [settings] = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global")).limit(1);
  }
  if (!settings) throw new ApiError("NOTIFICATION_SETTINGS_NOT_FOUND", "Notification settings are unavailable.", 503);
  return settings;
}

export function validateNotificationSettingsUpdate(input: unknown, current: NotificationSettings) {
  const parsed = UpdateAdminNotificationSettingsBody.safeParse(input);
  if (!parsed.success) {
    throw new ApiError("INVALID_NOTIFICATION_SETTINGS", parsed.error.issues[0]?.message ?? "Invalid notification settings.", 400);
  }
  const projected = { ...current, ...parsed.data };
  // Use the existing delivery policy, including master switches and event bits.
  // A remembered channel preference is not an enabled delivery if all events are OFF.
  const adminEmailActive = events.some(event => adminEmailEventEnabled(projected, event));
  const adminTelegramActive = events.some(event => adminTelegramEventEnabled(projected, event));
  if (adminEmailActive && parsed.data.adminNotificationEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parsed.data.adminNotificationEmail)) {
    throw new ApiError("INVALID_NOTIFICATION_SETTINGS", "Enter a valid email address.", 400);
  }
  if (adminTelegramActive && parsed.data.adminNotificationPhone && !/^\+?[0-9 ()-]{7,32}$/.test(parsed.data.adminNotificationPhone)) {
    throw new ApiError("INVALID_NOTIFICATION_SETTINGS", "Enter a valid contact phone number.", 400);
  }
  if (parsed.data.trustpilotReviewUrl && !/^https:\/\/(?:www\.)?trustpilot\.com\//i.test(parsed.data.trustpilotReviewUrl)) {
    throw new ApiError("INVALID_NOTIFICATION_SETTINGS", "Trustpilot URL must be on trustpilot.com.", 400);
  }
  if (adminTelegramActive && !current.adminTelegramChatId) {
    throw new ApiError("ADMIN_TELEGRAM_NOT_CONNECTED", "Connect a Telegram chat before enabling Admin Telegram notifications.", 400);
  }
  // Only the verified Telegram /start challenge can assign a chat ID.
  // Disabled channels retain their contacts; only an explicit disconnect clears the chat.
  const { adminTelegramChatId: _ignoredChatId, ...safeSettings } = parsed.data;
  return safeSettings;
}

export async function saveNotificationSettings(input: unknown, operatorId: string) {
  const current = await getNotificationSettings();
  const safeSettings = validateNotificationSettingsUpdate(input, current);
  const [settings] = await db.update(notificationSettingsTable)
    .set({ ...safeSettings, updatedBy: operatorId, updatedAt: new Date() })
    .where(eq(notificationSettingsTable.id, "global"))
    .returning();
  if (!settings) throw new ApiError("NOTIFICATION_SETTINGS_NOT_FOUND", "Notification settings are not initialized.", 404);
  return settings;
}