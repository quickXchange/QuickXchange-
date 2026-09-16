export function getBrandfetchLogoUrl(
  identifier: string,
  options?: {
    type?: 'icon' | 'logo' | 'symbol';
    namespace?: 'domain' | 'ticker' | 'crypto' | 'isin';
  }
): string | null {
  const clientId = import.meta.env.VITE_BRANDFETCH_CLIENT_ID?.trim();
  if (!clientId) return null;

  const namespace = options?.namespace || 'domain';
  const typePath = options?.type ? `/type/${options.type}` : '';

  return `https://cdn.brandfetch.io/${namespace}/${encodeURIComponent(identifier)}/w/256/h/256/fallback/404${typePath}?c=${encodeURIComponent(clientId)}`;
}
