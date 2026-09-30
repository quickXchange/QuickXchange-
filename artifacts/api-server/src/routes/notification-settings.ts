import { Router } from "express";
import { and, eq } from "drizzle-orm";
import {
  TestAdminNotificationEmailTemplateBody,
  UpdateAdminNotificationEmailTemplatesBody,
} from "@workspace/api-zod";
import { adminTelegramLinkChallengesTable, db, notificationSettingsTable } from "@workspace/db";
import { requireOwner } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";
import { createAdminTelegramLinkChallenge } from "../lib/admin-telegram-link";
import { getTelegramBotIdentity, getTelegramWebhookInfo, sendTelegramMessage, sanitizeTelegramFailureReason, TelegramApiError, telegramEnabled } from "../lib/telegram-api";
import {
  buildCustomerStatusNotificationContent,
  DEFAULT_NOTIFICATION_EMAIL_TEMPLATES,
  NOTIFICATION_TEMPLATE_VARIABLES,
} from "../lib/customer-status-notifications";
import { ResendRequestError, resendResponseError, sendResendRequest } from "../lib/resend";
import { getNotificationSettings as getSettings, saveNotificationSettings } from "../lib/notification-settings-store";

const router = Router();
const expectedTelegramWebhookUrl = "https://quickchange.exchange/api/telegram/webhook";

export function adminTelegramTestFailureReason(error: unknown) {
  return error instanceof TelegramApiError ? error.safeReason : sanitizeTelegramFailureReason(error);
}

export function telegramHealthReport(
  configured: boolean,
  botUsername: string | null,
  webhookUrl: string | undefined,
  lastWebhookError: string | null,
  botIdentityError: string | null = null,
) {
  return {
    configured,
    botUsername,
    expectedWebhookUrl: expectedTelegramWebhookUrl,
    webhookUrlMatchesExpected: configured && webhookUrl === expectedTelegramWebhookUrl,
    lastWebhookError,
    botIdentityError,
  };
}

async function emailProviderRejectionMessage(response: Response) {
  const reason = (await resendResponseError(response)).message;
  if (/domain.+not verified|not verified.+domain/i.test(reason)) {
    return "Resend rejected the message because quickchange.exchange is not verified. Verify quickchange.exchange in Resend, then retry.";
  }
  return `Resend rejected the test message: ${reason}`;
}

async function sendAdminTestEmail(
  req: import("express").Request,
  recipient: string,
  content: { subject: string; text: string; html: string },
): Promise<void> {
  let response: Response;
  try {
    response = await sendResendRequest("/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        to: [recipient],
        from: process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL?.trim() || "QuickXchange <support@quickchange.exchange>",
        ...content,
      },
    });
  } catch (error) {
    const reason = error instanceof ResendRequestError ? error.message : "Resend request failed before receiving a response.";
    req.log?.warn({ reason }, "Admin test email request failed");
    throw new ApiError("ADMIN_EMAIL_TEST_FAILED", reason, 502);
  }
  if (!response.ok) {
    const reason = await emailProviderRejectionMessage(response);
    req.log?.warn({ reason }, "Admin test email was rejected by provider");
    throw new ApiError("ADMIN_EMAIL_TEST_FAILED", reason, 502);
  }
  const accepted = await response.json().catch(() => null) as { id?: unknown } | null;
  if (typeof accepted?.id !== "string" || !accepted.id) {
    req.log?.warn("Admin test email provider response did not contain a message ID");
    throw new ApiError("ADMIN_EMAIL_TEST_FAILED", "Resend did not confirm acceptance with a message ID.", 502);
  }
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
  const settings = await saveNotificationSettings(req.body, res.locals.operator.id);
  res.json(settings);
});

router.post("/admin/notification-settings/test-email", requireOwner, async (req, res) => {
  const settings = await getSettings();
  if (!settings.adminNotificationEmail) {
    throw new ApiError("ADMIN_EMAIL_NOT_CONFIGURED", "Save an Admin notification email before sending a test.", 400);
  }
  await sendAdminTestEmail(req, settings.adminNotificationEmail, {
    subject: "QuickXchange Admin notification test",
    text: "This is a real QuickXchange email delivery test. Resend accepting this request does not confirm inbox placement.",
    html: '<div style="font-family:Arial,sans-serif;padding:24px"><h2>QuickXchange Admin notification test</h2><p>This is a real email delivery test. Please confirm it appears in your mailbox.</p></div>',
  });
  res.json({ success: true, message: `Resend accepted the test email for ${settings.adminNotificationEmail}. Check that mailbox and spam folder to confirm delivery.` });
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
    const accepted = await sendTelegramMessage(
      settings.adminTelegramChatId,
      "<b>QuickXchange Admin notification test</b>\n\nYour Admin Telegram notifications are connected and ready.",
    );
    if (!accepted) throw new Error("Telegram did not confirm delivery.");
  } catch (error) {
    const reason = adminTelegramTestFailureReason(error);
    _req.log?.warn({ reason }, "Admin Telegram test delivery failed");
    throw new ApiError("ADMIN_TELEGRAM_TEST_FAILED", reason, 502);
  }
  res.json({ success: true, message: "Test Telegram message sent." });
});

router.post("/admin/notification-settings/telegram-link", requireOwner, async (_req, res) => {
  if (!telegramEnabled()) {
    throw new ApiError("ADMIN_TELEGRAM_UNAVAILABLE", "The Telegram bot is not configured.", 502);
  }
  let identity;
  try {
    identity = await getTelegramBotIdentity();
  } catch (error) {
    throw new ApiError("ADMIN_TELEGRAM_BOT_INVALID", sanitizeTelegramFailureReason(error), 502);
  }
  const challenge = await createAdminTelegramLinkChallenge(res.locals.operator.id);
  res.json({
    id: challenge.id,
    botUrl: `https://t.me/${identity.username}?start=admin_${challenge.token}`,
    expiresAt: challenge.expiresAt,
  });
});

router.get("/admin/notification-settings/telegram-health", requireOwner, async (_req, res) => {
  if (!telegramEnabled()) {
    res.json(telegramHealthReport(false, null, undefined, null, "Telegram bot is not configured."));
    return;
  }
  let botUsername: string | null = null;
  let webhookUrl: string | undefined;
  let lastWebhookError: string | null = null;
  let botIdentityError: string | null = null;
  try {
    const identity = await getTelegramBotIdentity();
    botUsername = identity.username;
  } catch (error) {
    botIdentityError = sanitizeTelegramFailureReason(error);
  }
  try {
    const info = await getTelegramWebhookInfo();
    webhookUrl = info?.url;
    if (info?.last_error_message) lastWebhookError = sanitizeTelegramFailureReason(info.last_error_message);
  } catch (error) {
    lastWebhookError = sanitizeTelegramFailureReason(error);
  }
  res.json(telegramHealthReport(true, botUsername, webhookUrl, lastWebhookError, botIdentityError));
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
  await sendAdminTestEmail(req, settings.adminNotificationEmail, {
    subject: `[Preview] ${content.subject}`,
    text: content.text,
    html: content.html,
  });
  res.json({ success: true, message: `Resend accepted the template test email for ${settings.adminNotificationEmail}. Check that mailbox to confirm delivery.` });
});

export default router;