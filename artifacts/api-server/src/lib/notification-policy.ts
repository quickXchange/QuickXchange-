import type { NotificationSettings } from "@workspace/db";

export type NotificationEventKind =
  | "order_created"
  | "payment_received"
  | "processing"
  | "completed"
  | "failed_cancelled";

export function adminNotificationsEnabled(settings: NotificationSettings | undefined) {
  return settings?.adminNotificationsEnabled !== false;
}

export function adminEmailEventEnabled(
  settings: NotificationSettings | undefined,
  eventKind: NotificationEventKind,
) {
  if (!settings || !adminNotificationsEnabled(settings) || settings.adminEmailEnabled === false) return false;
  return eventKind === "order_created"
    ? settings.adminEmailOrderCreatedEnabled
    : eventKind === "payment_received"
      ? settings.adminEmailPaymentReceivedEnabled
      : eventKind === "processing"
        ? settings.adminEmailProcessingEnabled
        : eventKind === "completed"
          ? settings.adminEmailCompletedEnabled
          : settings.adminEmailFailedCancelledEnabled;
}

export function adminTelegramEventEnabled(
  settings: NotificationSettings | undefined,
  eventKind: NotificationEventKind,
) {
  if (!settings || !adminNotificationsEnabled(settings) || settings.telegramEnabled === false) return false;
  return eventKind === "order_created"
    ? settings.adminTelegramOrderCreatedEnabled
    : eventKind === "payment_received"
      ? settings.adminTelegramPaymentReceivedEnabled
      : eventKind === "processing"
        ? settings.adminTelegramProcessingEnabled
        : eventKind === "completed"
          ? settings.adminTelegramCompletedEnabled
          : settings.adminTelegramFailedCancelledEnabled;
}

export function customerEmailEventEnabled(
  settings: NotificationSettings | undefined,
  eventKind: NotificationEventKind,
) {
  if (!settings || settings.emailEnabled === false) return false;
  return eventKind === "order_created"
    ? settings.customerEmailOrderCreatedEnabled
    : eventKind === "payment_received"
      ? settings.customerEmailPaymentReceivedEnabled
      : eventKind === "processing"
        ? settings.customerEmailProcessingEnabled
        : eventKind === "completed"
          ? settings.customerEmailCompletedEnabled
          : settings.customerEmailFailedCancelledEnabled;
}