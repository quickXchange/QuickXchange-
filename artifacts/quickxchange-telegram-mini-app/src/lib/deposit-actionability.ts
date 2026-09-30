export function isOrderDepositActionable(
  status: unknown,
  detailsReady: boolean,
  customerMarkedPaidAt?: unknown,
  outcomeUnknown?: boolean,
): boolean {
  if (!detailsReady || customerMarkedPaidAt || outcomeUnknown) return false;
  const normalizedStatus = typeof status === 'string'
    ? status.trim().toLowerCase().replaceAll('_', ' ')
    : '';
  return normalizedStatus === 'awaiting funds' || normalizedStatus === 'pending';
}