import type { SocialTrustConfig } from '@workspace/api-client-react';
import {
  InvalidTelegramSupportValueError,
  normalizeTelegramSupportUrl,
} from '@workspace/api-zod';

const LEGACY_TELEGRAM_SUPPORT_URL = 'https://t.me/Quick_change_support';

export type TelegramSupportPreviewSnapshot =
  | { status: 'unresolved' | 'error' | 'invalid' }
  | { status: 'confirmed-empty' }
  | { status: 'configured'; value: string };

export type TelegramSupportInputResult =
  | { value: string | null; error: null }
  | { value: null; error: string };

/** Adapt the shared server/client validator to the editor's inline-error shape. */
export function normalizeTelegramSupportInput(value: string): TelegramSupportInputResult {
  try {
    return { value: normalizeTelegramSupportUrl(value), error: null };
  } catch (error) {
    if (error instanceof InvalidTelegramSupportValueError) {
      return { value: null, error: error.message };
    }
    throw error;
  }
}

/** Resolve a known published social setting; null/blank retains the historical public default. */
export function resolvePublishedTelegramSupportUrl(
  socialTrust: Pick<SocialTrustConfig, 'telegramUrl'> | null,
): string | undefined {
  const publishedValue = socialTrust?.telegramUrl;
  if (typeof publishedValue !== 'string' || !publishedValue.trim()) return LEGACY_TELEGRAM_SUPPORT_URL;
  const normalized = normalizeTelegramSupportInput(publishedValue);
  return normalized.error ? undefined : normalized.value ?? LEGACY_TELEGRAM_SUPPORT_URL;
}

export function isHistoricalTelegramSupportDestination(value: string): boolean {
  const normalized = normalizeTelegramSupportInput(value);
  return !normalized.error
    && normalized.value?.toLowerCase() === LEGACY_TELEGRAM_SUPPORT_URL.toLowerCase();
}

export function resolveFooterTelegramSupportItems<T extends { name: string; href: string }>(
  items: readonly T[],
  supportUrl?: string,
): T[] {
  let supportItemAdded = false;
  return items.flatMap((item) => {
    const explicitSupportItem = item.name.trim().toLowerCase() === 'telegram support';
    if (!explicitSupportItem && !isHistoricalTelegramSupportDestination(item.href)) return [item];
    if (supportItemAdded) return [];
    supportItemAdded = true;
    return [{
      ...item,
      href: supportUrl ?? '',
      name: telegramSupportHandle(supportUrl),
    } as T];
  });
}

/** Unknown snapshots never expose the historical contact as an early-load fallback. */
export function resolveTelegramSupportFromPublishedSnapshot(
  snapshot: { socialTrust?: Pick<SocialTrustConfig, 'telegramUrl'> | null } | null | undefined,
): string | undefined {
  if (!snapshot) return undefined;
  return resolvePublishedTelegramSupportUrl(snapshot.socialTrust ?? null);
}

export function resolveTelegramSupportPreview(
  snapshot: TelegramSupportPreviewSnapshot | undefined,
): string | undefined {
  if (!snapshot) return undefined;
  if (snapshot.status === 'confirmed-empty') return LEGACY_TELEGRAM_SUPPORT_URL;
  if (snapshot.status !== 'configured') return undefined;
  const normalized = normalizeTelegramSupportInput(snapshot.value);
  return normalized.error ? undefined : normalized.value ?? undefined;
}

export function resolveTelegramSupportForPublicShell(
  publishedUrl: string | undefined,
  previewActive: boolean,
  hasPreviewSocialTrust: boolean,
  previewSnapshot: TelegramSupportPreviewSnapshot | undefined,
): string | undefined {
  if (previewActive && hasPreviewSocialTrust) return resolveTelegramSupportPreview(previewSnapshot);
  return publishedUrl;
}

export function telegramSupportHandle(url?: string): string {
  if (!url) return 'Telegram';
  const username = url.split('/').at(-1);
  return username ? `@${username}` : url;
}