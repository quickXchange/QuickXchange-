const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const TELEGRAM_SUPPORT_URL_PATTERN = /^https:\/\/(?:t\.me|telegram\.me)\/([A-Za-z][A-Za-z0-9_]{4,31})\/?$/i;

export class InvalidTelegramSupportValueError extends Error {
  constructor() {
    super("Telegram support must be a username or a Telegram username URL.");
    this.name = "InvalidTelegramSupportValueError";
  }
}

/**
 * Normalize the footer's Telegram support contact to its one public URL shape.
 * This intentionally excludes channels, bots, Mini Apps, invite links, and
 * Telegram deep links: this value represents one support username only.
 */
export function normalizeTelegramSupportUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new InvalidTelegramSupportValueError();

  const input = value.trim();
  if (!input) return null;

  const username = input.startsWith("@")
    ? input.slice(1)
    : TELEGRAM_SUPPORT_URL_PATTERN.exec(input)?.[1];
  if (!username || !TELEGRAM_USERNAME_PATTERN.test(username)) {
    throw new InvalidTelegramSupportValueError();
  }

  return `https://t.me/${username}`;
}
