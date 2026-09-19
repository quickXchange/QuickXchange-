import * as DialogPrimitive from '@radix-ui/react-dialog';
import { PaymentMethodLogo } from '@/components/payment-method-logo';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CircleAlert, RefreshCw, ShieldCheck, X, Copy } from 'lucide-react';
import type { ApiError, OrderPaymentDetails, SourcePaymentMethod } from '@workspace/api-client-react';
import { useI18n } from '@/i18n';

export const SUPPORT_TELEGRAM = 'https://t.me/Quick_change_support';
export const TELEGRAM_BOT_URL = 'https://t.me/QuickXchangeNetBot';
export const SUPPORT_EMAIL = 'support@quickxchange.net';
export const SUPPORT_HOURS = '24/7 Support';
export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export const getPublicObjectUrl = (path: string | null | undefined) => {
  if (!path) return '';
  const cleanPath = path.replace(/^\/?objects\//, '').replace(/^\/+/, '');
  return `${basePath}/api/storage/objects/${cleanPath}`;
};

export const cn = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

export function CancelOrderAction({
  onConfirm,
  pending = false,
  errorMessage,
  triggerClassName,
}: {
  onConfirm: () => void;
  pending?: boolean;
  errorMessage?: string | null;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-destructive/35 bg-destructive/5 px-5 text-sm font-bold text-destructive transition hover:border-destructive/55 hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50',
            triggerClassName,
          )}
          data-testid="button-cancel-order"
        >
          <X size={17} />
          Cancel Order
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-slate-950/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[91] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-destructive/20 bg-card p-6 text-card-foreground shadow-[0_24px_80px_rgba(15,23,42,0.32)] focus:outline-none sm:p-8 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
          data-testid="modal-cancel-order"
        >
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive shadow-[0_0_32px_rgba(239,68,68,0.12)]">
            <AlertTriangle size={25} />
          </div>
          <DialogPrimitive.Title className="mt-5 text-center text-xl font-bold">
            Are you sure you want to cancel this order?
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
            This order will remain available in your history and tracking.
          </DialogPrimitive.Description>
          {errorMessage && (
            <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <DialogPrimitive.Close asChild>
              <button type="button" className="button button-secondary min-h-12 rounded-xl" disabled={pending} data-testid="button-keep-order">
                Keep Order
              </button>
            </DialogPrimitive.Close>
            <button
              type="button"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-destructive px-5 text-sm font-bold text-destructive-foreground shadow-[0_12px_30px_rgba(239,68,68,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onConfirm}
              disabled={pending}
              data-testid="button-confirm-cancel-order"
            >
              {pending ? <RefreshCw size={17} className="mr-2 animate-spin motion-reduce:animate-none" /> : null}
              {pending ? 'Cancelling…' : 'Cancel Order'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Customer-safe payment instructions. Keep this allowlist in one place so
 * internal order fields never accidentally become public payment details. */
export function PaymentDetailsCard({
  paymentDetails,
  paymentDetailsApplicable,
  sourcePaymentMethod,
  customerMarkedPaidAt,
  onMarkPaid,
  markPaidPending = false,
  actionsDisabled = false,
  showPayNow = true,
  supportHref = SUPPORT_TELEGRAM,
}: {
  paymentDetails?: OrderPaymentDetails | null;
  paymentDetailsApplicable?: boolean;
  sourcePaymentMethod?: SourcePaymentMethod | null;
  customerMarkedPaidAt?: string | null;
  onMarkPaid?: () => void;
  markPaidPending?: boolean;
  actionsDisabled?: boolean;
  showPayNow?: boolean;
  supportHref?: string;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
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

        {showPayNow && (
          <DialogPrimitive.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogPrimitive.Trigger asChild>
              {customerMarkedPaidAt || actionsDisabled ? (
                <button type="button" className="button button-secondary" data-testid="button-view-payment-details">View Details</button>
              ) : (
                <button type="button" className="button button-primary" disabled={actionsDisabled} data-testid="button-pay-now">Pay Now</button>
              )}
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
              <DialogPrimitive.Content
                className="pay-modal-premium fixed left-[50%] top-[50%] z-50 w-[94vw] max-w-md translate-x-[-50%] translate-y-[-50%] p-0 rounded-[24px] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] motion-reduce:animate-none"
                data-testid="modal-payment-instructions"
              >
                <div className="relative w-full h-full rounded-[24px] overflow-hidden flex flex-col">
                  <div className="relative p-6 sm:p-8">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-gradient-to-b from-cyan-500/15 via-blue-500/5 to-transparent blur-2xl pointer-events-none rounded-full" />

                    <div className="flex flex-col items-center mb-6 relative z-10">
                      <div className="relative flex items-center justify-center w-20 h-20 mb-4">
                        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-cyan-400/80 border-r-blue-500/50 animate-[spin_3s_linear_infinite] motion-reduce:animate-none" />
                        <div className="absolute inset-1 rounded-full border-[3px] border-transparent border-b-blue-400/60 border-l-purple-400/40 animate-[spin_4s_linear_infinite_reverse] motion-reduce:animate-none" />
                        <div className="w-14 h-14 bg-background rounded-full shadow-sm flex items-center justify-center overflow-hidden border border-border p-1 relative z-10">
                          {sourcePaymentMethod ? (
                            <PaymentMethodLogo
                              name={sourcePaymentMethod.name}
                              logoUrl={sourcePaymentMethod.logoUrl}
                              priority
                              className="w-full h-full"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted rounded-full flex items-center justify-center text-muted-foreground text-xl font-bold">?</div>
                          )}
                        </div>
                      </div>
                      <DialogPrimitive.Title className="text-xl font-bold tracking-tight text-center text-foreground">
                        {sourcePaymentMethod?.name || 'Payment Details'}
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="text-muted-foreground text-sm mt-1 text-center font-medium">
                        Send money to this account
                      </DialogPrimitive.Description>
                    </div>

                    <div className="relative z-10 max-h-[50vh] overflow-y-auto px-1 -mx-1">
                      {paymentDetails && available.length > 0 ? (
                        <div className="grid gap-3" data-testid="payment-instructions-fields">
                          {available.map(([key, label]) => {
                            const value = String(paymentDetails[key]);
                            return (
                              <div key={key} className="group rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 p-3 sm:px-4 sm:py-3.5 transition-all duration-300 hover:border-cyan-400/50 dark:hover:border-cyan-500/40 hover:bg-cyan-50/30 dark:hover:bg-cyan-900/10 hover:shadow-[0_4px_16px_-6px_rgba(6,182,212,0.15)]">
                                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{label}</span>
                                <div className="mt-1.5 flex items-start justify-between gap-3">
                                  <span className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900 dark:text-slate-100', key !== 'customInstructions' && 'font-mono font-medium tracking-tight')}>{value}</span>
                                  <button type="button" className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:text-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 dark:text-slate-500 dark:hover:text-cyan-400" onClick={() => copyValue(String(key), value)} aria-label={`Copy ${label}`} data-testid={`button-copy-payment-${key}`}>
                                    {copied === key ? <Check size={16} className="text-cyan-500" /> : <Copy size={16} />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5 text-center transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10" data-testid="payment-details-support-prompt">
                          <p className="text-sm font-medium text-cyan-800 dark:text-cyan-200 mb-4">Contact support to get details</p>
                          <a className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-cyan-200 bg-white px-4 text-sm font-semibold text-cyan-700 shadow-sm transition-colors hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:border-cyan-800/60 dark:bg-slate-900 dark:text-cyan-300 dark:hover:bg-cyan-950" href={supportHref} target="_blank" rel="noreferrer" data-testid="button-contact-support">Contact Support</a>
                        </div>
                      )}
                    </div>

                    <div className="mt-8 flex flex-col sm:flex-row-reverse gap-3 relative z-10">
                      {onMarkPaid && !customerMarkedPaidAt && !actionsDisabled ? (
                        <button
                          type="button"
                          className="group relative flex h-12 flex-1 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(59,130,246,0.4)] transition-all hover:from-cyan-400 hover:via-blue-400 hover:to-purple-400 hover:shadow-[0_6px_24px_-6px_rgba(59,130,246,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={onMarkPaid}
                          disabled={actionsDisabled || markPaidPending || available.length === 0}
                          title={available.length === 0 ? 'Payment details are not available yet.' : undefined}
                          data-testid="button-mark-paid"
                        >
                          <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                          <span className="relative z-10 flex items-center justify-center">
                            {markPaidPending ? (
                            <RefreshCw size={18} className="mr-2 animate-spin motion-reduce:animate-none" />
                            ) : (
                              <Check size={18} className="mr-2" strokeWidth={3} />
                            )}
                            {markPaidPending ? 'Marking as Paid…' : 'Mark as Paid'}
                          </span>
                        </button>
                      ) : customerMarkedPaidAt ? (
                        <div className="flex-1 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 dark:text-cyan-400 flex items-center justify-center font-bold text-sm transition-all">
                          <Check size={18} className="mr-2" strokeWidth={3} />
                          Marked as Paid
                        </div>
                      ) : null}

                      <DialogPrimitive.Close asChild>
                        <button
                          type="button"
                          className="h-12 flex-1 rounded-xl border border-transparent bg-slate-100 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:border-slate-700/50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          disabled={markPaidPending}
                          data-testid="button-cancel-payment-modal"
                        >
                          Cancel
                        </button>
                      </DialogPrimitive.Close>
                    </div>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        )}
      </div>
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
  const customerLabel = normalized.includes('cancel') ? 'Cancelled'
    : normalized.includes('refund') ? 'Refunded'
      : normalized.includes('expire') ? 'Expired'
        : normalized.includes('fail') ? 'Failed'
          : normalized.includes('complete') || normalized.includes('finish') || normalized.includes('paid') ? 'Completed'
            : normalized.includes('funds confirmed') || normalized.includes('deposit received') ? 'Deposit Received'
              : normalized.includes('process') || normalized.includes('exchang') || normalized.includes('send') || normalized.includes('payout') ? 'Processing'
                : normalized.includes('review') || normalized.includes('confirm') || normalized.includes('hold') || normalized.includes('verif') || normalized.includes('manual-review') ? 'Operator Reviewing'
                  : normalized.includes('awaiting funds') ? 'Awaiting Funds'
                    : normalized.includes('pending') || normalized.includes('created') || normalized.includes('new') || normalized.includes('await') || normalized.includes('deposit') ? 'Pending' : (status || 'Pending');
  const customerTone = customerLabel === 'Completed' ? 'success'
    : ['Cancelled', 'Refunded', 'Expired', 'Failed'].includes(customerLabel) ? 'error'
      : customerLabel === 'Processing' || customerLabel === 'Operator Reviewing' || customerLabel === 'Deposit Received' ? 'warning'
        : 'info';
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
