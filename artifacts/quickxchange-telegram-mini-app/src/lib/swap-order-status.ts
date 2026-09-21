export type SwapOrderStatus =
  | 'awaiting funds'
  | 'funds_confirmed'
  | 'confirming'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'refunded';

export function normalizeSwapOrderStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toLowerCase() : '';
}

export function swapOrderStatusLabel(status: unknown): string {
  switch (normalizeSwapOrderStatus(status)) {
    case 'awaiting funds': return 'AWAITING FUNDS';
    case 'funds_confirmed':
    case 'confirming': return 'CONFIRMING';
    case 'processing': return 'PROCESSING';
    case 'completed': return 'DONE';
    case 'cancelled': return 'CANCELLED';
    case 'failed': return 'FAILED';
    case 'refunded': return 'REFUNDED';
    default: return String(status ?? '');
  }
}

export function swapOrderStatusStep(status: unknown): number {
  switch (normalizeSwapOrderStatus(status)) {
    case 'completed': return 4;
    case 'processing': return 3;
    case 'funds_confirmed':
    case 'confirming': return 2;
    default: return 1;
  }
}

export function swapOrderStatusTerminal(status: unknown): boolean {
  return ['completed', 'cancelled', 'failed', 'refunded'].includes(
    normalizeSwapOrderStatus(status),
  );
}