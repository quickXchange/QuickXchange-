export function buildVerifiedExplorerUrl(template: string | null | undefined, transactionHash: string): string | undefined {
  const normalized = template?.trim();
  return normalized && /^https:\/\//i.test(normalized) && /\{(?:tx|transactionHash)\}/i.test(normalized)
    ? normalized.replace(/\{(?:tx|transactionHash)\}/gi, encodeURIComponent(transactionHash))
    : undefined;
}

export function exposeLegacyTransactionHash(orderType: string | undefined, transactionHash: string | null): string | undefined {
  return orderType === "manual" ? undefined : transactionHash || undefined;
}