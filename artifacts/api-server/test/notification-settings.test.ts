import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, notificationSettingsTable } from "@workspace/db";
import { getNotificationSettings, saveNotificationSettings } from "../src/lib/notification-settings-store";
import { ApiError } from "../src/lib/api-error";

if (process.env.API_TEST_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Notification persistence tests require the isolated API test database.");
}

const eventFields = [
  "adminEmailOrderCreatedEnabled", "adminEmailPaymentReceivedEnabled",
  "adminEmailProcessingEnabled", "adminEmailCompletedEnabled", "adminEmailFailedCancelledEnabled",
  "adminTelegramOrderCreatedEnabled", "adminTelegramPaymentReceivedEnabled",
  "adminTelegramProcessingEnabled", "adminTelegramCompletedEnabled", "adminTelegramFailedCancelledEnabled",
  "customerEmailOrderCreatedEnabled", "customerEmailPaymentReceivedEnabled",
  "customerEmailProcessingEnabled", "customerEmailCompletedEnabled", "customerEmailFailedCancelledEnabled",
  "paymentReceivedEnabled", "processingEnabled", "completedEnabled", "failedCancelledEnabled",
] as const;
const allOff = Object.fromEntries(eventFields.map(field => [field, false]));
let original: typeof notificationSettingsTable.$inferSelect | undefined;

before(async () => {
  [original] = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global")).limit(1);
});
beforeEach(async () => {
  await db.delete(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global"));
  await db.insert(notificationSettingsTable).values({
    id: "global",
    adminNotificationEmail: "admin@example.test",
    adminNotificationPhone: "+1234567890",
    adminTelegramChatId: "",
    adminTelegramUsername: "saved-test-username",
    trustpilotReviewUrl: "https://www.trustpilot.com/review/example.test",
  });
});
after(async () => {
  try {
    await db.delete(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global"));
    if (original) await db.insert(notificationSettingsTable).values(original);
  } finally {
    await pool.end();
  }
});

test("all events OFF saves with remembered channel flags ON, no chat, and persists after a fresh read", async () => {
  const current = await getNotificationSettings();
  const saved = await saveNotificationSettings({ ...current, ...allOff }, "test-owner");
  const reloaded = await getNotificationSettings();
  for (const field of eventFields) {
    assert.equal(saved[field], false, field);
    assert.equal(reloaded[field], false, `${field} after reload`);
  }
  assert.equal(reloaded.adminNotificationsEnabled, true);
  assert.equal(reloaded.telegramEnabled, true);
  assert.equal(reloaded.updatedBy, "test-owner");
  assert.equal(reloaded.adminNotificationEmail, current.adminNotificationEmail);
  assert.equal(reloaded.adminNotificationPhone, current.adminNotificationPhone);
  assert.equal(reloaded.adminTelegramUsername, current.adminTelegramUsername);
});

test("all events OFF permits legacy invalid contacts without discarding configuration", async () => {
  const current = await getNotificationSettings();
  await saveNotificationSettings({
    ...current, ...allOff,
    adminNotificationEmail: "legacy-unconfigured-email",
    adminNotificationPhone: "legacy-unverified-phone",
  }, "test-owner");
  const reloaded = await getNotificationSettings();
  assert.equal(reloaded.adminNotificationEmail, "legacy-unconfigured-email");
  assert.equal(reloaded.adminNotificationPhone, "legacy-unverified-phone");
  assert.equal(reloaded.adminTelegramUsername, "saved-test-username");
  for (const field of eventFields) assert.equal(reloaded[field], false);
});

test("disabled channel masters do not validate delivery and retain remembered event preferences", async () => {
  const current = await getNotificationSettings();
  const saved = await saveNotificationSettings({
    ...current, adminNotificationsEnabled: false, adminEmailEnabled: false,
    emailEnabled: false, telegramEnabled: false,
    adminNotificationEmail: "unverified-email", adminNotificationPhone: "unverified-phone",
  }, "test-owner");
  const reloaded = await getNotificationSettings();
  assert.equal(reloaded.adminNotificationsEnabled, false);
  assert.equal(reloaded.adminEmailEnabled, false);
  assert.equal(reloaded.emailEnabled, false);
  assert.equal(reloaded.telegramEnabled, false);
  assert.equal(saved.adminEmailPaymentReceivedEnabled, true);
  assert.equal(reloaded.adminTelegramPaymentReceivedEnabled, true);
  assert.equal(reloaded.customerEmailCompletedEnabled, true);
});

test("inactive Admin email does not block unrelated Telegram or customer email settings", async () => {
  await db.update(notificationSettingsTable).set({ adminTelegramChatId: "saved-verified-chat" });
  const current = await getNotificationSettings();
  const saved = await saveNotificationSettings({
    ...current, adminEmailEnabled: false, emailEnabled: true,
    adminNotificationEmail: "not-a-configured-admin-email",
  }, "test-owner");
  assert.equal(saved.adminNotificationEmail, "not-a-configured-admin-email");
  assert.equal(saved.telegramEnabled, true);
  assert.equal(saved.emailEnabled, true);
});

test("global Admin OFF bypasses both Admin delivery checks while retaining channel preferences", async () => {
  const current = await getNotificationSettings();
  const saved = await saveNotificationSettings({
    ...current, adminNotificationsEnabled: false,
    adminNotificationEmail: "legacy-invalid-email", adminNotificationPhone: "legacy-invalid-phone",
  }, "test-owner");
  assert.equal(saved.adminEmailEnabled, true);
  assert.equal(saved.telegramEnabled, true);
  assert.equal(saved.adminTelegramPaymentReceivedEnabled, true);
  assert.equal(saved.emailEnabled, true);
});

test("inactive Telegram does not validate phone or require a chat when Admin email remains active", async () => {
  const current = await getNotificationSettings();
  const saved = await saveNotificationSettings({
    ...current, telegramEnabled: false, adminNotificationPhone: "unverified-phone",
  }, "test-owner");
  assert.equal(saved.adminEmailEnabled, true);
  assert.equal(saved.adminNotificationPhone, "unverified-phone");
  assert.equal(saved.adminTelegramChatId, "");
});

test("enabling an actual Telegram event rejects a missing trusted chat with the exact API error", async () => {
  const current = await getNotificationSettings();
  await saveNotificationSettings({ ...current, ...allOff }, "test-owner");
  await assert.rejects(saveNotificationSettings({
    ...current, ...allOff, adminTelegramCompletedEnabled: true,
    adminTelegramChatId: "untrusted-form-chat",
  }, "test-owner"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "ADMIN_TELEGRAM_NOT_CONNECTED");
    assert.equal(error.status, 400);
    assert.equal(error.message, "Connect a Telegram chat before enabling Admin Telegram notifications.");
    return true;
  });
  const reloaded = await getNotificationSettings();
  assert.equal(reloaded.adminTelegramChatId, "");
  assert.equal(reloaded.adminTelegramCompletedEnabled, false);
});

test("active Admin email still rejects a malformed address without partially saving", async () => {
  const current = await getNotificationSettings();
  await assert.rejects(saveNotificationSettings({
    ...current, telegramEnabled: false, adminNotificationEmail: "invalid-email",
  }, "test-owner"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "INVALID_NOTIFICATION_SETTINGS");
    assert.equal(error.message, "Enter a valid email address.");
    return true;
  });
  assert.equal((await getNotificationSettings()).adminNotificationEmail, current.adminNotificationEmail);
});

test("active Telegram still validates a supplied phone number", async () => {
  await db.update(notificationSettingsTable).set({ adminTelegramChatId: "saved-verified-chat" });
  const current = await getNotificationSettings();
  await assert.rejects(saveNotificationSettings({
    ...current, adminNotificationPhone: "invalid-phone",
  }, "test-owner"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, "Enter a valid contact phone number.");
    return true;
  });
});

test("disabling notifications preserves the existing verified Telegram connection despite a stale form", async () => {
  await db.update(notificationSettingsTable).set({ adminTelegramChatId: "saved-verified-chat" });
  const current = await getNotificationSettings();
  await saveNotificationSettings({
    ...current, ...allOff, telegramEnabled: false, adminTelegramChatId: "",
  }, "test-owner");
  const reloaded = await getNotificationSettings();
  assert.equal(reloaded.adminTelegramChatId, "saved-verified-chat");
  assert.equal(reloaded.adminTelegramUsername, current.adminTelegramUsername);
});

test("unrelated invalid settings still return their exact error even when every event is OFF", async () => {
  const current = await getNotificationSettings();
  await assert.rejects(saveNotificationSettings({
    ...current, ...allOff, trustpilotReviewUrl: "https://example.test/not-trustpilot",
  }, "test-owner"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, "Trustpilot URL must be on trustpilot.com.");
    return true;
  });
});