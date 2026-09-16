import type { ReactNode } from 'react';
import { Check, CircleAlert, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { ApiError } from '@workspace/api-client-react';
import { useI18n } from '@/i18n';

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export const getPublicObjectUrl = (path: string | null | undefined) => {
  if (!path) return '';
  const cleanPath = path.replace(/^\/?objects\//, '').replace(/^\/+/, '');
  return `${basePath}/api/storage/objects/${cleanPath}`;
};

export const cn = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

export const number = (value?: number | string, digits?: number) => {
  if (value === undefined) return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits ?? 6 }).format(value);
  }
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, sign, integer, fraction = ''] = match;
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const visibleFraction = digits === undefined ? fraction : fraction.slice(0, digits);
  return `${sign}${groupedInteger}${visibleFraction ? `.${visibleFraction}` : ``}`;
};

export const shortId = (id?: string) => id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—';
export const neutralText = (value: string) => value
  .replace(/^Quickex requires at least (.+) for this route\.$/i, 'Enter at least $1 for this route.')
  .replace(/^Quickex allows at most (.+) for this route\.$/i, 'Enter no more than $1 for this route.')
  .replace(/\bQUICKEX_/g, '')
  .replace(/\bQuickex\b/gi, 'exchange service');

export const apiErrorData = (error: unknown): ApiError | null => {
  if (!error || typeof error !== 'object' || !('data' in error)) return null;
  const data = (error as { data?: unknown }).data;
  return data && typeof data === 'object' && 'code' in data ? data as ApiError : null;
};

export const publicApiErrorText = (
  error: unknown,
  fallback: string,
  translate?: (key: any, params?: Record<string, string | number>) => string,
) => {
  const data = apiErrorData(error);
  if (!data) return fallback;
  if (
    (data.code === 'QUICKEX_AMOUNT_TOO_SMALL' || data.code === 'QUICKEX_AMOUNT_TOO_LARGE') &&
    /^Enter (?:at least|no more than) .+ for this route\.$/.test(neutralText(data.error))
  ) return neutralText(data.error);
  switch (data.code) {
    case 'VALIDATION_ERROR': return translate?.('errors.validation') || 'Review the request details and try again.';
    case 'QUICKEX_INVALID_ADDRESS': return translate?.('errors.invalidAddress') || 'Check the destination and refund addresses, then try again.';
    case 'QUICKEX_INVALID_MEMO': return translate?.('errors.invalidMemo') || 'Check the destination and refund memo or tag, then try again.';
    case 'MANUAL_DESTINATION_ADDRESS_REQUIRED': return translate?.('errors.destinationRequired') || 'Add a destination wallet address for the selected network.';
    case 'MANUAL_DESTINATION_ADDRESS_INVALID': return translate?.('errors.destinationInvalid') || 'Check that the destination wallet address matches the selected network.';
    case 'MANUAL_DESTINATION_MEMO_REQUIRED': return translate?.('errors.destinationMemoRequired') || 'Add the required destination memo or tag for the selected network.';
    case 'MANUAL_DESTINATION_MEMO_INVALID': return translate?.('errors.destinationMemoInvalid') || 'Check that the destination memo or tag matches the selected network.';
    case 'MANUAL_REFUND_ADDRESS_REQUIRED': return translate?.('errors.refundRequired') || 'Add a refund wallet address for the selected source network.';
    case 'MANUAL_REFUND_ADDRESS_INVALID': return translate?.('errors.refundInvalid') || 'Check that the refund wallet address matches the selected source network.';
    case 'MANUAL_REFUND_MEMO_REQUIRED': return translate?.('errors.refundMemoRequired') || 'Add the required refund memo or tag for the selected source network.';
    case 'MANUAL_REFUND_MEMO_INVALID': return translate?.('errors.refundMemoInvalid') || 'Check that the refund memo or tag matches the selected source network.';
    case 'QUICKEX_RATE_MODE_UNAVAILABLE': return translate?.('errors.rateUnavailable') || 'That rate type is not available for this route right now. Choose another rate type or route.';
    case 'QUICKEX_ROUTE_INVALID': return translate?.('errors.routeUnavailable') || 'That exchange route is not available right now. Choose another route.';
    case 'QUICKEX_QUOTE_EXPIRED': return translate?.('errors.quoteExpired') || 'The rate expired before the order was placed. Request a fresh rate and try again.';
    case 'ORDER_CONFIRMATION_PENDING':
    case 'ORDER_OUTCOME_UNKNOWN': return translate?.('errors.confirmationPending') || 'This exchange may have been accepted, but confirmation is delayed. Track the order and do not submit it again.';
    case 'ORDER_NOT_FOUND': return translate?.('errors.orderNotFound') || 'Check the complete QuickXchange order ID and try again.';
    case 'CUSTOMER_VERIFIED_EMAIL_REQUIRED': return translate?.('errors.verifiedEmail') || 'Verify the email address on your account before creating an exchange.';
    default: return fallback;
  }
};

export function StatusPill({ status, customerFacing = false }: { status?: string; customerFacing?: boolean }) {
  const normalized = (status || 'pending').toLowerCase();
  const rawTone = normalized.includes('complete') || normalized.includes('paid') || normalized.includes('configured') || normalized.includes('active') || normalized.includes('healthy') ? 'success'
    : normalized.includes('fail') || normalized.includes('cancel') || normalized.includes('missing') || normalized.includes('expire') || normalized.includes('disabled') || normalized.includes('unavailable') ? 'error'
      : normalized.includes('process') || normalized.includes('review') || normalized.includes('exchang') || normalized.includes('payout') || normalized.includes('refund') || normalized.includes('hold') || normalized.includes('deposit received') || normalized.includes('stale') ? 'warning' : 'info';
  const customerLabel = normalized.includes('fail') || normalized.includes('expire') || normalized.includes('cancel') || normalized.includes('refund') ? 'Failed'
    : normalized.includes('complete') || normalized.includes('finish') || normalized.includes('paid') ? 'Completed'
      : normalized.includes('deposit received') || normalized.includes('process') || normalized.includes('exchang') || normalized.includes('send') || normalized.includes('payout') ? 'Processing'
        : normalized.includes('review') || normalized.includes('confirm') || normalized.includes('hold') || normalized.includes('verif') || normalized.includes('manual-review') ? 'Operator Reviewing'
          : normalized.includes('pending') || normalized.includes('created') || normalized.includes('new') || normalized.includes('await') || normalized.includes('deposit') ? 'Pending' : (status || 'Pending');
  const customerTone = customerLabel === 'Completed' ? 'success' : customerLabel === 'Failed' ? 'error' : customerLabel === 'Processing' || customerLabel === 'Operator Reviewing' ? 'warning' : 'info';
  const tone = customerFacing ? customerTone : rawTone;
  return <span data-testid={`status-${normalized}`} className={`badge badge-${tone}`}>{customerFacing ? customerLabel : (status || 'Pending')}</span>;
}

export function InlineNotice({ kind, children, onDismiss }: { kind: 'error' | 'success' | 'info' | 'warning'; children: ReactNode; onDismiss?: () => void }) {
  return <div className={`notice notice-${kind}`} data-testid={`notice-${kind}`}>
    <div className="mt-1">{kind === 'error' ? <CircleAlert size={16} /> : kind === 'success' ? <Check size={16} /> : kind === 'warning' ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}</div>
    <div className="flex-1">{children}</div>
    {onDismiss && <button type="button" onClick={onDismiss} data-testid="button-dismiss-notice" className="icon-button ml-auto"><X size={15} /></button>}
  </div>;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3" data-testid="loading-state">{Array.from({ length: rows }).map((_, index) => <div className="skeleton h-14 rounded-xl" key={index} />)}</div>;
}

export function ErrorState({ message, retry }: { message?: string; retry?: () => void }) {
  const { t } = useI18n();
  return <div className="empty-state" data-testid="error-state"><CircleAlert size={22} /><strong>{t('swap.errorTitle')}</strong><p>{message || t('common.error')}</p>{retry && <button className="button button-secondary mt-3" onClick={retry} data-testid="button-retry"><RefreshCw size={14} />{t('common.retry')}</button>}</div>;
}
