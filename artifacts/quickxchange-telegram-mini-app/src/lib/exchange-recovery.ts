export type ExchangeOrderMode = 'swap' | 'convert';

export type ExchangeRecovery = {
  version: 1;
  phase: 'create-pending' | 'link-pending';
  mode: ExchangeOrderMode;
  requestId: string;
  data: Record<string, unknown>;
  sourceId: string;
  targetId: string;
  amount: string;
  desiredReceiveAmount: string;
  activeAmountSide: 'send' | 'receive';
  rateMode: 'FLOATING' | 'FIXED';
  quoteData: Record<string, any> | null;
  selectedAddonKeys: string[];
  destinationAddress: string;
  destinationMemo: string;
  customerEmail: string;
  settlementFields: Record<string, string>;
  order?: { id: string; trackingToken: string };
};

export const EXCHANGE_RECOVERY_LEGACY_KEY = 'telegram-mini-app.exchange-order-recovery.v1';
const EXCHANGE_RECOVERY_SESSION_KEY_PREFIX = `${EXCHANGE_RECOVERY_LEGACY_KEY}.user.`;

export function getExchangeRecoverySessionKey(verifiedUserId: string): string {
  const userId = verifiedUserId.trim();
  if (!userId) throw new Error('A verified Telegram user ID is required to access exchange recovery.');
  return `${EXCHANGE_RECOVERY_SESSION_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

export function readExchangeRecovery(
  storage: Pick<Storage, 'getItem'>,
  verifiedUserId: string,
): ExchangeRecovery | null {
  const key = getExchangeRecoverySessionKey(verifiedUserId);
  if (storage.getItem(EXCHANGE_RECOVERY_LEGACY_KEY) !== null) {
    throw new Error('An unscoped pending exchange order was preserved but cannot be safely attributed to this account. Do not submit another order; contact support.');
  }
  const value = storage.getItem(key);
  if (!value) return null;
  const parsed = JSON.parse(value) as ExchangeRecovery;
  if (
    parsed?.version !== 1 ||
    !['swap', 'convert'].includes(parsed.mode) ||
    !['create-pending', 'link-pending'].includes(parsed.phase) ||
    typeof parsed.requestId !== 'string' ||
    !parsed.requestId ||
    !parsed.data ||
    typeof parsed.data !== 'object'
  ) {
    throw new Error('Saved exchange recovery data is invalid. Do not submit another order from this session.');
  }
  if (parsed.phase === 'link-pending' && (!parsed.order?.id || !parsed.order.trackingToken)) {
    throw new Error('Saved order-link recovery data is incomplete. Do not submit another order from this session.');
  }
  return parsed;
}

export function persistExchangeRecovery(
  storage: Pick<Storage, 'setItem'>,
  recovery: ExchangeRecovery,
  verifiedUserId: string,
): void {
  storage.setItem(getExchangeRecoverySessionKey(verifiedUserId), JSON.stringify(recovery));
}

export function clearExchangeRecovery(
  storage: Pick<Storage, 'removeItem'>,
  verifiedUserId: string,
): void {
  storage.removeItem(getExchangeRecoverySessionKey(verifiedUserId));
}

export function isDefinitiveCreateRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; data?: any; code?: unknown; outcomeUnknown?: unknown };
  const code = candidate.code ?? candidate.data?.code ?? candidate.data?.error?.code;
  const unknownOutcome = candidate.outcomeUnknown === true ||
    candidate.data?.outcomeUnknown === true ||
    candidate.data?.error?.outcomeUnknown === true;
  const definitiveValidation = candidate.status === 400 || candidate.status === 422;
  const expiredSignedQuote = candidate.status === 410 && code === 'QUOTE_EXPIRED';
  return !unknownOutcome && (definitiveValidation || expiredSignedQuote);
}