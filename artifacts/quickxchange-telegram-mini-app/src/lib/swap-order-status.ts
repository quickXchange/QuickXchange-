export type SwapOrderStatus =
  | 'awaiting funds'
  | 'payment detected'
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
    case 'payment detected': return 'PAYMENT DETECTED';
    case 'confirming': return 'CONFIRMING';
    case 'funds_confirmed':
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
    case 'processing':
    case 'funds_confirmed': return 3;
    case 'payment detected':
    case 'confirming': return 2;
    default: return 1;
  }
}

export function swapOrderStatusTerminal(status: unknown): boolean {
  return ['completed', 'cancelled', 'failed', 'refunded'].includes(
    normalizeSwapOrderStatus(status),
  );
}

/** Display state comes from the order's customer-facing status, never its funding provider. */
export function projectSwapOrderTimeline(order: { status: unknown }) {
  return {
    label: swapOrderStatusLabel(order.status),
    step: swapOrderStatusStep(order.status),
  };
}

export function orderTimelineLineWidthPercent(step: number): number {
  return (Math.max(0, step - 1) / 3) * 80;
}