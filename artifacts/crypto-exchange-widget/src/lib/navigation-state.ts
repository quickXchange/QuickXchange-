// Only same-origin application routes are valid authentication return targets.
// Nothing is copied to storage: in particular, order tracking capabilities stay
// in their existing URL, not in a second persistent location.
export function safeReturnPath(raw: string | null, basePath = '', origin = window.location.origin): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, origin);
    const base = basePath.replace(/\/$/, '');
    if (url.origin !== origin || !url.pathname.startsWith(`${base}/`)) return undefined;
    const route = url.pathname.slice(base.length);
    if (/^\/(?:sign-in|sign-up)(?:\/|$)/.test(route) || route.startsWith('/api/')) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

export function loginReturnPath() {
  return `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`;
}
