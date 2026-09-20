export const CONVERT_TERMINAL_STATUSES = [
  'completed',
  'failed',
  'cancelled',
  'refunded',
  'expired',
] as const;

export function normalizeConvertOrderStatus(status: unknown): string {
  return typeof status === 'string'
    ? status.trim().toLowerCase().replaceAll('_', ' ')
    : '';
}

export function isConvertTerminalStatus(status: unknown): boolean {
  return CONVERT_TERMINAL_STATUSES.includes(
    normalizeConvertOrderStatus(status) as typeof CONVERT_TERMINAL_STATUSES[number],
  );
}

export function convertOrderStatusLabel(status: unknown): string {
  switch (normalizeConvertOrderStatus(status)) {
    case 'awaiting funds':
    case 'awaiting deposit':
    case 'pending':
    case 'verification required':
      return 'AWAITING FUNDS';
    case 'confirming':
    case 'payment detected':
      return 'CONFIRMING';
    case 'processing':
    case 'deposit received':
    case 'exchanging':
    case 'sending payout':
    case 'sending':
      return 'PROCESSING';
    case 'completed':
    case 'complete':
    case 'finished':
    case 'paid':
      return 'DONE ✅';
    case 'failed': return 'FAILED';
    case 'cancelled':
    case 'canceled': return 'CANCELLED';
    case 'refunded':
    case 'reversed': return 'REFUNDED';
    case 'expired':
    case 'overdue': return 'EXPIRED';
    default: return String(status ?? '').trim().toUpperCase() || 'AWAITING FUNDS';
  }
}

export function convertOrderStatusStep(status: unknown): number {
  const normalized = normalizeConvertOrderStatus(status);
  return normalized === 'completed' || normalized === 'complete' || normalized === 'finished' || normalized === 'paid'
    ? 3
    : normalized === 'processing' || normalized === 'deposit received' || normalized === 'exchanging' ||
      normalized === 'sending payout' || normalized === 'sending'
      ? 2
      : normalized === 'confirming' || normalized === 'payment detected'
        ? 1
        : 0;
}