export const CONVERT_TERMINAL_STATUSES = [
  'completed', 'failed', 'cancelled', 'canceled', 'refunded', 'expired', 'reversed', 'overdue',
] as const;

export function normalizeConvertOrderStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toLowerCase().replaceAll('_', ' ') : '';
}

export function isConvertTerminalStatus(status: unknown): boolean {
  return CONVERT_TERMINAL_STATUSES.includes(normalizeConvertOrderStatus(status) as typeof CONVERT_TERMINAL_STATUSES[number]);
}

export function convertOrderStatusLabel(status: unknown): string {
  switch (normalizeConvertOrderStatus(status)) {
    case 'completed': return 'DONE';
    case 'processing': case 'deposit received': case 'exchanging': case 'sending payout': case 'sending': return 'PROCESSING';
    case 'failed': return 'FAILED';
    case 'cancelled': case 'canceled': return 'CANCELLED';
    case 'refunded': case 'reversed': return 'REFUNDED';
    case 'expired': case 'overdue': return 'EXPIRED';
    case 'awaiting funds': case 'awaiting deposit': case 'pending': case 'verification required': return 'AWAITING FUNDS';
    case 'confirming': case 'payment detected': return 'CONFIRMING';
    default: return String(status ?? '').trim().toUpperCase() || 'AWAITING FUNDS';
  }
}

export function convertOrderStatusStep(status: unknown): number {
  const normalized = normalizeConvertOrderStatus(status);
  if (normalized === 'completed') return 3;
  if (['processing', 'deposit received', 'exchanging', 'sending payout', 'sending'].includes(normalized)) return 2;
  if (['confirming', 'payment detected'].includes(normalized)) return 1;
  return 0;
}