import { Router } from "express";
import { and, eq } from "drizzle-orm";
import {
  TestAdminNotificationEmailTemplateBody,
  UpdateAdminNotificationEmailTemplatesBody,
  UpdateAdminNotificationSettingsBody,
} from "@workspace/api-zod";
import { adminTelegramLinkChallengesTable, db, notificationSettingsTable } from "@workspace/db";
import { requireOwner } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";
import { createAdminTelegramLinkChallenge } from "../lib/admin-telegram-link";
import { sendTelegramMessage, telegramEnabled } from "../lib/telegram-api";
import {
  buildCustomerStatusNotificationContent,
  DEFAULT_NOTIFICATION_EMAIL_TEMPLATES,
  NOTIFICATION_TEMPLATE_VARIABLES,
} from "../lib/customer-status-notifications";
import { sendResendRequest } from "../lib/resend";

const router = Router();

async function getSettings() {
  let [settings] = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.id, "global")).limit(1);
  if (!settings) {
    [settings] = await db.insert(notificationSettingsTable).values({ id: "global" }).returning();
  }
  return settings;
}

async function emailProviderRejectionMessage(response: Response) {
  let providerMessage = "";
  try {
    const body = await response.json() as { message?: unknown };
    providerMessage = typeof body.message === "string" ? body.message : "";
  } catch {
    // Keep the safe fallback when the provider does not return JSON.
  }
  if (/domain.+not verified|not verified.+domain/i.test(providerMessage)) {
    return "Resend rejected the message because quickchange.exchange is not verified. Verify quickchange.exchange in Resend, then retry.";
  }
  return providerMessage
    ? `Resend rejected the message: ${providerMessage.slice(0, 300)}`
    : "The email provider rejected the test message.";
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
  if (parsed.data.adminNotificationPhone && !/^\+?[0-9 ()-]{7,32}$/.test(parsed.data.adminNotificationPhone)) {
    throw new ApiError("INVALID_NOTIFICATION_SETTINGS", "Enter a valid contact phone number.", 400);
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

router.post("/admin/notification-settings/test-email", requireOwner, async (req, res) => {
  const settings = await getSettings();
  if (!settings.adminNotificationEmail) {
    throw new ApiError("ADMIN_EMAIL_NOT_CONFIGURED", "Save an Admin notification email before sending a test.", 400);
  }
  const response = await sendResendRequest("/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      to: [settings.adminNotificationEmail],
      from: process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL?.trim() || "QuickXchange <support@quickchange.exchange>",
      subject: "QuickXchange Admin notification test",
      text: "Your QuickXchange Admin email notifications are connected and ready.",
      html: '<div style="font-family:Arial,sans-serif;padding:24px"><h2>QuickXchange Admin notification test</h2><p>Your Admin email notifications are connected and ready.</p></div>',
    },
  });
  if (!response.ok) {
    throw new ApiError("ADMIN_EMAIL_TEST_FAILED", await emailProviderRejectionMessage(response), 502);
  }
  res.json({ success: true, message: `Test email sent to ${settings.adminNotificationEmail}.` });
});

router.post("/admin/notification-settings/test-telegram", requireOwner, async (_req, res) => {
  const settings = await getSettings();
  if (!settings.adminTelegramChatId) {
    throw new ApiError("ADMIN_TELEGRAM_NOT_CONNECTED", "Connect Telegram before sending a test.", 400);
  }
  if (!telegramEnabled()) {
    throw new ApiError("ADMIN_TELEGRAM_UNAVAILABLE", "The Telegram bot is not configured.", 502);
  }
  try {
    await sendTelegramMessage(
      settings.adminTelegramChatId,
      "<b>QuickXchange Admin notification test</b>\n\nYour Admin Telegram notifications are connected and ready.",
    );
  } catch {
    throw new ApiError("ADMIN_TELEGRAM_TEST_FAILED", "Telegram rejected the test message.", 502);
  }
  res.json({ success: true, message: "Test Telegram message sent." });
});

router.post("/admin/notification-settings/telegram-link", requireOwner, async (_req, res) => {
  if (!telegramEnabled()) {
    throw new ApiError("ADMIN_TELEGRAM_UNAVAILABLE", "The Telegram bot is not configured.", 502);
  }
  const challenge = await createAdminTelegramLinkChallenge(res.locals.operator.id);
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || "QuickXchangeNetBot";
  res.json({
    id: challenge.id,
    botUrl: `https://t.me/${botUsername}?start=admin_${challenge.token}`,
    expiresAt: challenge.expiresAt,
  });
});

router.get("/admin/notification-settings/telegram-link/:id", requireOwner, async (req, res) => {
  const [challenge] = await db.select().from(adminTelegramLinkChallengesTable).where(and(
    eq(adminTelegramLinkChallengesTable.id, String(req.params.id)),
    eq(adminTelegramLinkChallengesTable.createdBy, res.locals.operator.id),
  )).limit(1);
  if (!challenge) throw new ApiError("ADMIN_TELEGRAM_LINK_NOT_FOUND", "Telegram connection link not found.", 404);
  if (challenge.consumedAt) {
    res.json({ status: "connected", settings: await getSettings() });
    return;
  }
  res.json({ status: challenge.expiresAt <= new Date() ? "expired" : "pending" });
});

router.post("/admin/notification-settings/telegram-disconnect", requireOwner, async (_req, res) => {
  const [settings] = await db.update(notificationSettingsTable).set({
    adminTelegramChatId: "",
    adminTelegramUsername: "",
    telegramEnabled: false,
    updatedBy: res.locals.operator.id,
    updatedAt: new Date(),
  }).where(eq(notificationSettingsTable.id, "global")).returning();
  if (!settings) throw new ApiError("NOTIFICATION_SETTINGS_NOT_FOUND", "Notification settings are not initialized.", 404);
  res.json(settings);
});

const templateEventKinds = ["order_created", "payment_received", "processing", "completed", "failed_cancelled"] as const;
const templateVariableSet = new Set<string>(NOTIFICATION_TEMPLATE_VARIABLES);

export function validateNotificationTemplateVariables(value: string) {
  for (const token of value.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)) {
    if (!templateVariableSet.has(token[1])) {
      throw new ApiError("INVALID_NOTIFICATION_TEMPLATE", `Unsupported template variable: {{${token[1]}}}.`, 400);
    }
  }
}

function templateItems(settings: Awaited<ReturnType<typeof getSettings>>) {
  return templateEventKinds.map((eventKind) => ({
    eventKind,
    ...(settings.emailTemplates?.[eventKind] || DEFAULT_NOTIFICATION_EMAIL_TEMPLATES[eventKind]),
  }));
}

router.get("/admin/notification-settings/email-templates", requireOwner, async (_req, res) => {
  res.json({ items: templateItems(await getSettings()) });
});

router.put("/admin/notification-settings/email-templates", requireOwner, async (req, res) => {
  const parsed = UpdateAdminNotificationEmailTemplatesBody.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError("INVALID_NOTIFICATION_TEMPLATE", parsed.error.issues[0]?.message ?? "Invalid email templates.", 400);
  }
  const kinds = new Set<string>();
  for (const item of parsed.data.items) {
    if (kinds.has(item.eventKind)) throw new ApiError("INVALID_NOTIFICATION_TEMPLATE", "Each email event must appear exactly once.", 400);
    kinds.add(item.eventKind);
    validateNotificationTemplateVariables(`${item.subject}\n${item.heading}\n${item.message}\n${item.buttonText}\n${item.footerText}`);
  }
  if (kinds.size !== templateEventKinds.length || templateEventKinds.some((kind) => !kinds.has(kind))) {
    throw new ApiError("INVALID_NOTIFICATION_TEMPLATE", "Templates must include all five notification events.", 400);
  }
  const templates = Object.fromEntries(parsed.data.items.map((item) => [item.eventKind, {
    subject: item.subject.trim(),
    heading: item.heading.trim(),
    message: item.message.trim(),
    buttonText: item.buttonText.trim(),
    footerText: item.footerText.trim(),
  }]));
  const [settings] = await db.update(notificationSettingsTable)
    .set({ emailTemplates: templates, updatedBy: res.locals.operator.id, updatedAt: new Date() })
    .where(eq(notificationSettingsTable.id, "global"))
    .returning();
  if (!settings) throw new ApiError("NOTIFICATION_SETTINGS_NOT_FOUND", "Notification settings are not initialized.", 404);
  res.json({ items: templateItems(settings) });
});

router.post("/admin/notification-settings/email-templates/test", requireOwner, async (req, res) => {
  const parsed = TestAdminNotificationEmailTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError("INVALID_NOTIFICATION_TEMPLATE", parsed.error.issues[0]?.message ?? "Invalid email template.", 400);
  }
  validateNotificationTemplateVariables(`${parsed.data.subject}\n${parsed.data.heading}\n${parsed.data.message}\n${parsed.data.buttonText}\n${parsed.data.footerText}`);
  const settings = await getSettings();
  if (!settings.adminNotificationEmail) {
    throw new ApiError("ADMIN_EMAIL_NOT_CONFIGURED", "Save an Admin notification email before sending a test.", 400);
  }
  const now = new Date();
  const content = buildCustomerStatusNotificationContent({
    eventId: "template-preview",
    customerClerkUserId: "guest:template-preview",
    recipientEmail: settings.adminNotificationEmail,
    orderId: "QX-PREVIEW",
    fromStatus: "awaiting funds",
    status: parsed.data.eventKind === "completed" ? "completed" : "processing",
    fromAsset: "USDT",
    fromNetwork: "TRC20",
    toAsset: "EUR",
    toNetwork: "SEPA",
    amount: "500",
    receiveAmount: "465",
    receiveMethod: "SEPA",
    createdAt: now,
    completedAt: parsed.data.eventKind === "completed" ? now : null,
    eventKind: parsed.data.eventKind,
    adminRecipient: false,
    trustpilotUrl: settings.trustpilotReviewUrl,
    template: parsed.data,
  });
  const response = await sendResendRequest("/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      to: [settings.adminNotificationEmail],
      from: process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL?.trim() || "QuickXchange <support@quickchange.exchange>",
      subject: `[Preview] ${content.subject}`,
      text: content.text,
      html: content.html,
    },
  });
  if (!response.ok) throw new ApiError("ADMIN_EMAIL_TEST_FAILED", await emailProviderRejectionMessage(response), 502);
  res.json({ success: true, message: `Template test email sent to ${settings.adminNotificationEmail}.` });
});

export default router;