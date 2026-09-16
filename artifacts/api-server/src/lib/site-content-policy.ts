/** Allow only same-site paths/anchors or credential-free HTTP(S) URLs. */
export function isSafeSiteLink(value: string): boolean {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#")) return /^#[A-Za-z0-9_.:/-]+$/.test(value);
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}