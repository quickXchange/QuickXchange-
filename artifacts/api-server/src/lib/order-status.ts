export const TERMINAL_ORDER_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "refunded",
  "expired",
]);

export function isTerminalOrderStatus(status: string): boolean {
  return TERMINAL_ORDER_STATUSES.has(status.toLowerCase());
}