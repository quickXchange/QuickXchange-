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
];

export function isVisibleViewOrderPaymentDetail(label: string): boolean {
  const normalized = normalizeLabel(label);
  return !hiddenPaymentDetailLabels.some(hidden => normalized === hidden || normalized.endsWith(` ${hidden}`));
}

const customerPaymentDetailKeys = new Set([
  'contactemail', 'transactionhash', 'txid', 'depositaddress', 'depositmemo',
  'deposittag', 'destinationaddress', 'destinationmemo', 'destinationtag',
  'paymentreference', 'refundaddress', 'refundmemo', 'refundtag',
  'sendingaddress', 'receivingaddress', 'memo', 'tag', 'explorerlink',
]);

export function isCustomerViewOrderPaymentDetail(key: string): boolean {
  return isVisibleViewOrderPaymentDetail(key)
    && customerPaymentDetailKeys.has(normalizeLabel(key).replace(/\s/g, ''));
}