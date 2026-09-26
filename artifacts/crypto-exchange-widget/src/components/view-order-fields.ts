export const viewOrderInformationLabels = [
  'User', 'Order ID', 'Sending Address', 'Created At', 'Rate',
] as const;

export function viewOrderInformationRows<T extends readonly [string, string, ...unknown[]]>(rows: T[]): T[] {
  return viewOrderInformationLabels.flatMap(label => rows.filter(row => row[0] === label));
}

function normalizeLabel(label: string): string {
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function viewOrderPaymentDetailLabel(key: string): string {
  return normalizeLabel(key)
    .replace(/\b[a-z]/g, letter => letter.toUpperCase())
    .replace(/\bTxid\b/g, 'TXID');
}

const hiddenPaymentDetailLabels = [
  'network code', 'source', 'status', 'address source', 'deposit provider',
  'selected provider', 'whitebit network code', 'logo url',
  'warning', 'manual fallback enabled', 'customer deposits enabled',
  'manual wallet tracking enabled',
  'transaction id', 'transaction hash', 'txid', 'confirmations', 'detected time',
  'detected at', 'explorer', 'explorer url', 'deposit address', 'deposit memo',
  'network id', 'quote id', 'order id', 'tracking token',
];

export function isVisibleViewOrderPaymentDetail(label: string): boolean {
  const normalized = normalizeLabel(label);
  return !hiddenPaymentDetailLabels.some(hidden => normalized === hidden || normalized.endsWith(` ${hidden}`))
    && !/\b(?:internal|monitoring|provider)\b/.test(normalized);
}

export function viewOrderStep2Rows(rows: readonly { key: string; label: string; value: string }[] | undefined) {
  return (rows ?? []).filter(row =>
    typeof row.key === 'string' && typeof row.label === 'string' && typeof row.value === 'string'
    && Boolean(row.label.trim()) && Boolean(row.value.trim())
    && isVisibleViewOrderPaymentDetail(row.key) && isVisibleViewOrderPaymentDetail(row.label));
}