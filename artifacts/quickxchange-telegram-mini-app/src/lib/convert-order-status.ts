export const CONVERT_TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'refunded', 'expired'] as const;

export function normalizeConvertOrderStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toLowerCase().replaceAll('_', ' ') : '';
}

export function isConvertTerminalStatus(status: unknown): boolean {
  return CONVERT_TERMINAL_STATUSES.includes(normalizeConvertOrderStatus(status) as typeof CONVERT_TERMINAL_STATUSES[number]);
}

export function convertOrderStatusLabel(status: unknown): string {
  switch (normalizeConvertOrderStatus(status)) {
    case 'completed': case 'complete': case 'finished': case 'paid': return 'DONE';
    case 'processing': case 'deposit received': case 'exchanging': case 'sending payout': case 'sending': return 'PROCESSING';
    case 'failed': return 'FAILED';
    case 'cancelled': case 'canceled': return 'CANCELLED';
    case 'refunded': return 'REFUNDED';
    case 'expired': return 'EXPIRED';
    default: return 'AWAITING FUNDS';
  }
}

export function convertOrderStatusStep(status: unknown): number {
  const normalized = normalizeConvertOrderStatus(status);
  return ['completed', 'complete', 'finished', 'paid'].includes(normalized)
    ? 2
    : ['processing', 'deposit received', 'exchanging', 'sending payout', 'sending'].includes(normalized) ? 1 : 0;
}