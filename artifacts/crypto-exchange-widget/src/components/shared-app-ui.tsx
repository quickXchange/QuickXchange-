import { useState, type ReactNode } from 'react';
import { Check, CircleAlert, RefreshCw, ShieldCheck, X, Copy } from 'lucide-react';
import type { ApiError, OrderPaymentDetails } from '@workspace/api-client-react';
import { useI18n } from '@/i18n';

export const SUPPORT_TELEGRAM = 'https://t.me/Quick_change_support';
export const SUPPORT_EMAIL = 'support@quickxchange.net';
export const SUPPORT_HOURS = '24/7 Support';
export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export const getPublicObjectUrl = (path: string | null | undefined) => {
  if (!path) return '';
  const cleanPath = path.replace(/^\/?objects\//, '').replace(/^\/+/, '');
  return `${basePath}/api/storage/objects/${cleanPath}`;
};

export const cn = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

/** Customer-safe payment instructions. Keep this allowlist in one place so
 * internal order fields never accidentally become public payment details. */
export function PaymentDetailsCard({
  paymentDetails,
  paymentDetailsApplicable,
  customerMarkedPaidAt,
  onMarkPaid,
  markPaidPending = false,
  showPayNow = true,
  supportHref = SUPPORT_TELEGRAM,
}: {
  paymentDetails?: OrderPaymentDetails | null;
  paymentDetailsApplicable?: boolean;
  customerMarkedPaidAt?: string | null;
  onMarkPaid?: () => void;
  markPaidPending?: boolean;
  showPayNow?: boolean;
  supportHref?: string;
}) {
  const [revealed, setRevealed] = useState(Boolean(paymentDetails));
  const [copied, setCopied] = useState<string | null>(null);
  if (!paymentDetailsApplicable) return null;
  const values: Array<[keyof OrderPaymentDetails, string]> = [
    ['name', 'Name'], ['iban', 'IBAN'], ['bankName', 'Bank Name'],
    ['bicSwift', 'BIC / SWIFT'], ['paymentReference', 'Payment Description / Reference'],
    ['amount', 'Amount'], ['customInstructions', 'Custom Instructions / Note'],
  ];
  const available = values.filter(([key]) => {
    const value = paymentDetails?.[key];
    return typeof value === 'string' && value.trim();
  });
  const copyValue = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(key);
    window.setTimeout(() => setCopied(current => current === key ? null : current), 1800);
  };
  return (
    <section className="customer-card mb-6 p-5" data-testid="payment-details-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Payment Details / Payment Instructions</h2>
          {customerMarkedPaidAt && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400" data-testid="text-customer-marked-paid">Marked as paid</p>}
        </div>
        {showPayNow && !revealed && (
          <button type="button" className="button button-primary" onClick={() => setRevealed(true)} data-testid="button-pay-now">Pay Now</button>
        )}
      </div>
      {!revealed ? null : paymentDetails && available.length > 0 ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="payment-instructions-fields">
            {available.map(([key, label]) => {
              const value = String(paymentDetails[key]);
              return (
                <div key={key} className="rounded-xl border border-border bg-muted/20 p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <span className={cn('whitespace-pre-wrap break-words text-sm', key !== 'customInstructions' && 'font-mono')}>{value}</span>
                    <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => copyValue(String(key), value)} aria-label={`Copy ${label}`} data-testid={`button-copy-payment-${key}`}>
                      {copied === key ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {onMarkPaid && !customerMarkedPaidAt && (
            <button type="button" className="button button-primary mt-4" onClick={onMarkPaid} disabled={markPaidPending} data-testid="button-mark-paid">
              {markPaidPending ? 'Marking as Paid…' : 'Mark as Paid'}
            </button>
          )}
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-warning/25 bg-warning/10 p-4" data-testid="payment-details-support-prompt">
          <p className="text-sm">Contact support to get payment details</p>
          <a className="button button-secondary mt-3 inline-flex" href={supportHref} target="_blank" rel="noreferrer" data-testid="button-contact-support">Contact Support</a>
        </div>
      )}
    </section>
  );
}

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
