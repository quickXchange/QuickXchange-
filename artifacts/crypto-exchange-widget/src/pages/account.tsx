import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SignIn, SignUp, UserProfile, useUser } from '@clerk/react';
import {
  ArrowRight, Filter, Mail, Loader2, FileText, Search, UserRound, ArrowLeft, ArrowUpRight, ArrowDownLeft, CheckCircle2, LayoutList, Bell, Copy, Check, Link2, ShieldCheck
} from 'lucide-react';
import {
  useGetCustomerOrders, getGetCustomerOrdersQueryKey,
  useGetCustomerOrder, getGetCustomerOrderQueryKey,
  useClaimCustomerOrder,
  useUpdateCustomerOrderNotifications,
  useMarkOrderPaid,
  useCancelCustomerOrder,
  useGetAffiliateDashboard, getGetAffiliateDashboardQueryKey,
  useBindAffiliateReferrer,
  captureAffiliateReferral,
  useGetPublicNotificationSettings, getGetPublicNotificationSettingsQueryKey,
} from '@workspace/api-client-react';
import type { CustomerOrder } from '@workspace/api-client-react';
import { Link, useLocation, useParams } from 'wouter';
import { OrderSettlementIdentity } from '@/components/order-settlement-identity';
import { useI18n } from '../i18n/provider';
import { CustomerShell, CustomerPageHeader, ThemeToggle } from '@/components/customer/CustomerShell';
import { CustomerStatCard } from '@/components/customer/CustomerStatCard';
import { LanguageSelector } from '@/components/language-selector';
import { basePath, CancelOrderAction, cn, ErrorState, InlineNotice, LoadingBlock, number, publicApiErrorText, StatusPill, PaymentDetailsCard, SUPPORT_TELEGRAM } from '@/components/shared-app-ui';
import { PublicShell } from '@/components/public-shell';
import { ExchangeModeSwitcher } from '@/components/exchange-surface';
import { convertOrderStatusStep } from '@/lib/convert-order-status';
import { OrderCompletionSection } from '@/components/order-completion';
import { VerifiedTransaction } from '@/components/verified-transaction';

type CustomerStatusGroup = 'pending' | 'processing' | 'completed' | 'failed';

function customerStatusGroup(status: string): CustomerStatusGroup {
  const normalized = status.trim().toLowerCase();
  if (/fail|expire|cancel|refund/.test(normalized)) return 'failed';
  if (/complete|paid/.test(normalized)) return 'completed';
  if (/await|wait|pending|created|new/.test(normalized)) return 'pending';
  return 'processing';
}

function addExactDecimals(left: string, right: string): string {
  const parse = (value: string) => {
    const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
    if (!match) throw new Error(`Invalid exact decimal: ${value}`);
    return {
      negative: match[1] === '-',
      integer: match[2],
      fraction: match[3] ?? '',
    };
  };
  const a = parse(left);
  const b = parse(right);
  const scale = Math.max(a.fraction.length, b.fraction.length);
  const toScaledInteger = (value: ReturnType<typeof parse>) => {
    const digits = `${value.integer}${value.fraction.padEnd(scale, '0')}`;
    const integer = BigInt(digits);
    return value.negative ? -integer : integer;
  };
  const total = toScaledInteger(a) + toScaledInteger(b);
  const negative = total < 0n;
  const absolute = (negative ? -total : total).toString().padStart(scale + 1, '0');
  if (scale === 0) return `${negative ? '-' : ''}${absolute}`;
  const integer = absolute.slice(0, -scale);
  const fraction = absolute.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function exactTotalsByAsset(
  orders: CustomerOrder[],
  asset: (order: CustomerOrder) => string,
  amount: (order: CustomerOrder) => string,
): Record<string, string> {
  return orders.reduce<Record<string, string>>((totals, order) => {
    if (customerStatusGroup(order.status) !== 'completed') return totals;
    const symbol = asset(order);
    totals[symbol] = addExactDecimals(totals[symbol] ?? '0', amount(order));
    return totals;
  }, {});
}

function validatedCustomerRedirect(): string | undefined {
  const raw = new URLSearchParams(window.location.search).get('redirect_url');
  if (!raw) return undefined;
  try {
    const target = new URL(raw, window.location.origin);
    const expectedPath = `${basePath}/telegram/connect`.replace(/\/+/g, '/');
    const accountPath = `${basePath}/account`.replace(/\/+/g, '/');
    const isTelegramConnect = target.pathname === expectedPath && Boolean(target.searchParams.get('token'));
    const isCustomerAccount = target.pathname === accountPath || target.pathname.startsWith(`${accountPath}/`);
    if (
      target.origin !== window.location.origin ||
      target.hash ||
      (!isTelegramConnect && !isCustomerAccount)
    ) return undefined;
    return `${target.pathname}${target.search}`;
  } catch {
    return undefined;
  }
}

export function CustomerSignInPage() {
  const customerRedirect = useMemo(validatedCustomerRedirect, []);
  const signUpUrl = customerRedirect
    ? `${basePath}/sign-up?redirect_url=${encodeURIComponent(customerRedirect)}`
    : `${basePath}/sign-up`;
  return (
    <PublicShell>
      <main className="public-main sign-in-page flex min-w-0 justify-center overflow-x-hidden px-4 py-10 sm:px-6 sm:py-20 rise-in">
        <div className="flex w-full min-w-0 flex-col items-center gap-4 [&_.cl-cardBox]:max-w-full [&_.cl-card]:max-w-full [&_.cl-rootBox]:max-w-full">
          <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={signUpUrl} forceRedirectUrl={customerRedirect} fallbackRedirectUrl={customerRedirect} />
          <AuthAffiliateCodeForm />
        </div>
      </main>
    </PublicShell>
  );
}

export function CustomerSignUpPage() {
  const customerRedirect = useMemo(validatedCustomerRedirect, []);
  const signInUrl = customerRedirect
    ? `${basePath}/sign-in?redirect_url=${encodeURIComponent(customerRedirect)}`
    : `${basePath}/sign-in`;
  return (
    <PublicShell>
      <main className="public-main sign-in-page sign-up-page flex min-w-0 justify-center overflow-x-hidden px-4 py-10 sm:px-6 sm:py-20 rise-in">
        <div className="flex w-full min-w-0 flex-col items-center gap-4 [&_.cl-cardBox]:max-w-full [&_.cl-card]:max-w-full [&_.cl-rootBox]:max-w-full">
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={signInUrl} forceRedirectUrl={customerRedirect} fallbackRedirectUrl={customerRedirect} />
          <AuthAffiliateCodeForm />
        </div>
      </main>
    </PublicShell>
  );
}

function AuthAffiliateCodeForm() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized || status === 'saving') return;

    setStatus('saving');
    setMessage('');
    try {
      await captureAffiliateReferral(normalized);
      setCode(normalized);
      setStatus('saved');
      setMessage('Affiliate code saved. It will be connected to your account after you sign in.');
    } catch (error) {
      setStatus('error');
      setMessage(publicApiErrorText(error, 'This affiliate code is invalid or unavailable.'));
    }
  };

  return (
    <form
      onSubmit={submit}
      className="sign-in-affiliate-card w-full max-w-[440px] rounded-2xl border border-border bg-card px-5 py-4 shadow-sm sm:px-6"
      data-testid="form-auth-affiliate-code"
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Link2 size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <label htmlFor="auth-affiliate-code" className="block text-sm font-semibold">
            Have an affiliate code?
          </label>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Enter it here—no referral link is required.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="auth-affiliate-code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            if (status !== 'idle') {
              setStatus('idle');
              setMessage('');
            }
          }}
          placeholder="Enter affiliate code"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-input px-4 font-mono text-sm uppercase tracking-wider outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          data-testid="input-auth-affiliate-code"
        />
        <button
          type="submit"
          disabled={!code.trim() || status === 'saving' || status === 'saved'}
          className="button button-primary h-11 shrink-0 rounded-xl px-5 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="button-save-auth-affiliate-code"
        >
          {status === 'saving' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : status === 'saved' ? <Check size={16} aria-hidden="true" /> : null}
          <span>{status === 'saving' ? 'Checking…' : status === 'saved' ? 'Saved' : 'Apply code'}</span>
        </button>
      </div>
      {message ? (
        <p
          className={cn('mt-3 text-xs leading-relaxed', status === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}
          role={status === 'error' ? 'alert' : 'status'}
          data-testid="auth-affiliate-code-status"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

function ClaimOrderForm() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState('');
  const [notice, setNotice] = useState<{ kind: 'error' | 'success', text: string } | null>(null);
  const claimMutation = useClaimCustomerOrder();

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) return;
    setNotice(null);
    claimMutation.mutate({ data: { orderId: orderId.trim() } }, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: t('account.claimSuccess') });
        setOrderId('');
        queryClient.invalidateQueries({ queryKey: getGetCustomerOrdersQueryKey() });
      },
      onError: (error) => {
        setNotice({ kind: 'error', text: publicApiErrorText(error, t('account.claimError')) });
      }
    });
  };

  return (
    <form onSubmit={handleClaim} className="customer-card p-5" data-testid="form-claim-order">
      <h3 className="mb-1 text-base font-semibold tracking-tight">{t('account.claimTitle')}</h3>
      <p className="text-muted-foreground text-xs mb-4 leading-relaxed">{t('account.claimDescription')}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={orderId}
          onChange={e => setOrderId(e.target.value)}
          placeholder={t('account.claimPlaceholder')}
          aria-label={t('account.claimInputLabel')}
          className="flex-1 bg-input/50 border border-border rounded-xl h-10 px-4 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all min-w-0"
          data-testid="input-claim-order"
        />
        <button
          type="submit"
          disabled={claimMutation.isPending || !orderId.trim()}
          className="button button-primary h-10 px-6 rounded-xl sm:w-auto w-full whitespace-nowrap"
          data-testid="button-claim-order"
        >
          {claimMutation.isPending ? t('account.adding') : t('account.addToAccount')}
        </button>
      </div>
      {notice && <div className="mt-4"><InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice></div>}
    </form>
  );
}

function ReferralCodePrompt() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const dashboard = useGetAffiliateDashboard({
    query: { queryKey: getGetAffiliateDashboardQueryKey() },
  });
  const bindReferral = useBindAffiliateReferrer();

  if (dashboard.isLoading || dashboard.isError || !dashboard.data?.programEnabled) return null;

  if (dashboard.data.referrerBound) {
    return (
      <div className="customer-card flex items-center gap-3 px-4 py-3 text-sm" data-testid="referral-connected">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <Check size={16} />
        </span>
        <div className="min-w-0">
          <strong className="block font-semibold">Referral connected</strong>
          <span className="text-xs text-muted-foreground">Your affiliate attribution is secured to this account.</span>
        </div>
      </div>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setNotice(null);
    bindReferral.mutate({ data: { code: normalized } }, {
      onSuccess: () => {
        setCode('');
        queryClient.invalidateQueries({ queryKey: getGetAffiliateDashboardQueryKey() });
      },
      onError: error => setNotice(publicApiErrorText(error, 'This referral code could not be applied.')),
    });
  };

  return (
    <form className="customer-card p-4" onSubmit={submit} data-testid="form-referral-code">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Link2 size={17} />
        </span>
        <div>
          <strong className="block text-sm font-semibold">Have an affiliate code?</strong>
          <span className="text-xs leading-relaxed text-muted-foreground">Enter it once to credit the person who referred you.</span>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 12))}
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-input/50 px-3 font-mono text-sm uppercase tracking-wider focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="8-character code"
          aria-label="Affiliate code"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          data-testid="input-referral-code"
        />
        <button
          type="submit"
          className="button button-primary h-10 shrink-0 rounded-xl px-4 text-sm"
          disabled={bindReferral.isPending || !code.trim()}
          data-testid="button-apply-referral-code"
        >
          {bindReferral.isPending ? <Loader2 size={16} className="animate-spin" aria-label="Applying" /> : 'Apply'}
        </button>
      </div>
      {notice && (
        <div className="mt-3">
          <InlineNotice kind="error" onDismiss={() => setNotice(null)}>{notice}</InlineNotice>
        </div>
      )}
    </form>
  );
}

export function AccountPage() {
  const { t, formatDate } = useI18n();
  const { isLoaded, isSignedIn, user } = useUser();

  const orders = useGetCustomerOrders({ page: 1, pageSize: 50 }, { query: { queryKey: getGetCustomerOrdersQueryKey({ page: 1, pageSize: 50 }), enabled: isLoaded && isSignedIn } });

  if (!isLoaded) return <PublicShell><main className="public-main"><LoadingBlock rows={6} /></main></PublicShell>;

  if (!isSignedIn) {
    return (
      <PublicShell>
        <main className="public-main min-w-0 px-4 py-16 text-center sm:px-6 sm:py-24 lg:py-[120px] rise-in">
          <UserRound size={48} className="mx-auto mb-5 text-primary opacity-80 sm:mb-6" />
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">{t('account.yourAccount')}</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8 leading-relaxed">
            {t('account.signInDescription')}
          </p>
          <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-3 min-[380px]:flex-row sm:gap-4">
            <Link href="/sign-in" className="button button-primary w-full px-5 py-3 min-[380px]:w-auto sm:px-6">{t('auth.signIn')}</Link>
            <Link href="/sign-up" className="button button-secondary w-full px-5 py-3 min-[380px]:w-auto sm:px-6">{t('auth.signUp')}</Link>
          </div>
        </main>
      </PublicShell>
    );
  }

  const totalOrders = orders.data?.total ?? 0;
  const loadedOrders = orders.data?.items ?? [];
  const completedOrders = loadedOrders.filter(order => customerStatusGroup(order.status) === 'completed').length;

  const firstName = user?.firstName || t('customerPortal.welcomeFallback');
  const sentByAsset = exactTotalsByAsset(loadedOrders, order => order.fromAsset, order => String(order.amount));
  const receivedByAsset = exactTotalsByAsset(loadedOrders, order => order.toAsset, order => String(order.receiveAmount));

  const getCompactAssetSummary = (totals: Record<string, string>) => {
    const entries = Object.entries(totals);
    if (entries.length === 0) return <span className="text-muted-foreground opacity-60">—</span>;
    return (
      <span className="flex flex-col gap-0.5 text-base leading-tight sm:text-lg">
        {entries.slice(0, 2).map(([symbol, amount]) => (
          <span key={symbol} className="block truncate">{number(amount)} {symbol}</span>
        ))}
        {entries.length > 2 && (
          <span className="text-xs font-semibold text-muted-foreground opacity-80">
            +{entries.length - 2} {t('customerPortal.multipleAssets').toLowerCase()}
          </span>
        )}
      </span>
    );
  };

  const scopeLabel = totalOrders > 50 ? t('customerPortal.fromLastOrders', { count: 50 }) : undefined;
  const completedTotalsLabel = [t('customerPortal.completedOrderTotals'), scopeLabel].filter(Boolean).join(' · ');

  return (
    <CustomerShell contentClassName="max-w-7xl">
      <CustomerPageHeader
        title={t('customerPortal.welcome', { name: firstName })}
        description={t('customerPortal.subtitle')}
        actions={
          <Link href="/account/orders" className="button button-secondary h-10 px-4 rounded-xl text-sm font-semibold">
            {t('account.orderHistory')}
          </Link>
        }
      />

      <div className="customer-dashboard-frame">
        <div
          className="customer-dashboard-primary"
          data-testid="customer-dashboard-layout"
        >
          <div className="customer-dashboard-exchange" id="customer-exchange">
            <div className="customer-exchange-region public-shell overflow-hidden w-full">
              <ExchangeModeSwitcher />
            </div>
            <div className="mt-4">
              <ReferralCodePrompt />
            </div>
          </div>

          <div className="customer-dashboard-stats grid grid-cols-1 min-[375px]:grid-cols-2 gap-4" data-testid="customer-dashboard-stats">
              <CustomerStatCard
                title={t('customerPortal.totalOrders')}
                value={orders.isLoading ? "-" : totalOrders}
                icon={<LayoutList size={16} />}
                className="dashboard-stat-orders"
              />
              <CustomerStatCard
                title={t('customerPortal.completedOrders')}
                value={orders.isLoading ? "-" : completedOrders}
                description={scopeLabel}
                icon={<CheckCircle2 size={16} />}
                className="dashboard-stat-completed"
              />
              <CustomerStatCard
                title={t('customerPortal.totalSent')}
                value={orders.isLoading ? "-" : getCompactAssetSummary(sentByAsset)}
                description={completedTotalsLabel}
                icon={<ArrowUpRight size={16} />}
                className="dashboard-stat-sent"
              />
              <CustomerStatCard
                title={t('customerPortal.totalReceived')}
                value={orders.isLoading ? "-" : getCompactAssetSummary(receivedByAsset)}
                description={completedTotalsLabel}
                icon={<ArrowDownLeft size={16} />}
                className="dashboard-stat-received"
              />
          </div>
        </div>

        <div className="customer-dashboard-lower">
          <div className="w-full min-w-0" data-testid="customer-dashboard-recent">
            <div className="flex items-center justify-between mb-6 px-1">
              <h2 className="text-2xl font-marketing font-extrabold tracking-tight">{t('customerPortal.recentOrders')}</h2>
              <Link href="/account/orders" className="text-sm font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5">
                {t('customerPortal.viewAll')} <ArrowRight size={14} />
              </Link>
            </div>

            {orders.isLoading ? (
              <LoadingBlock rows={4} />
            ) : orders.isError ? (
              <ErrorState message={t('account.loadHistoryError')} retry={() => orders.refetch()} />
            ) : loadedOrders.length === 0 ? (
              <div className="customer-card p-10 flex flex-col items-center justify-center text-center bg-card/40 backdrop-blur-sm border-border/50">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-5 text-muted-foreground shadow-inner">
                  <Filter size={24} />
                </div>
                <strong className="text-lg font-bold mb-2">{t('account.noOrdersTitle')}</strong>
                <p className="text-sm text-muted-foreground max-w-sm">{t('account.noOrdersDescription')}</p>
                <a href="#customer-exchange" className="button button-primary mt-8 px-6 rounded-xl shadow-lg shadow-primary/20">{t('customerPortal.newSwap')}</a>
              </div>
            ) : (
              <div className="customer-card overflow-hidden bg-card/40 backdrop-blur-sm border-border/50 shadow-xl" data-testid="customer-order-history">
                <div className="dashboard-swipeable-table w-full relative group">
                  <div className="swipeable-scroll-hint" aria-hidden="true" />
                  <div className="mobile-table-scroll w-full pb-2" onScroll={(e) => {
                    const target = e.target as HTMLElement;
                    const hint = target.previousElementSibling as HTMLElement;
                    if (hint) {
                      hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
                      hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
                    }
                  }}>
                    <table className="customer-orders-table w-full text-left min-w-[920px] border-collapse">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-5 py-4 font-bold whitespace-nowrap">{t('account.exchange')}</th>
                          <th className="px-5 py-4 font-bold whitespace-nowrap">{t('customerPortal.send')}</th>
                          <th className="px-5 py-4 font-bold whitespace-nowrap">{t('customerPortal.receive')}</th>
                          <th className="px-5 py-4 font-bold whitespace-nowrap">{t('customerPortal.status')}</th>
                          <th className="px-5 py-4 font-bold whitespace-nowrap">{t('account.date')}</th>
                          <th className="px-5 py-4 font-bold text-right whitespace-nowrap">{t('customerPortal.action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                    {loadedOrders.slice(0, 10).map(order => (
                          <tr key={order.id} className="hover:bg-muted/40 transition-colors" data-testid={`customer-order-${order.id}`}>
                            <td className="customer-order-route-cell px-5 py-4 whitespace-nowrap">
                              <div className="customer-order-route flex items-center gap-2">
                                <OrderSettlementIdentity assetCode={order.fromAsset} routeLabel={order.fromNetwork} settlementOptionId={order.sourceSettlementOptionId} size="sm" compact className="customer-order-asset-identity" />
                                <ArrowRight size={14} className="text-muted-foreground/60 shrink-0" />
                                <OrderSettlementIdentity assetCode={order.toAsset} routeLabel={order.toNetwork} settlementOptionId={order.targetSettlementOptionId} size="sm" compact className="customer-order-asset-identity" />
                              </div>
                            </td>
                            <td className="px-5 py-4 font-mono text-sm font-semibold whitespace-nowrap">
                              <span>{number(order.amount)}</span> <span className="text-muted-foreground text-xs ml-0.5">{order.fromAsset}</span>
                            </td>
                            <td className="px-5 py-4 font-mono text-sm font-bold text-foreground whitespace-nowrap">
                              <span>{number(order.receiveAmount)}</span> <span className="text-muted-foreground text-xs ml-0.5">{order.toAsset}</span>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="scale-95 origin-left inline-block"><StatusPill status={order.status} customerFacing /></div>
                            </td>
                            <td className="px-5 py-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                              {formatDate(order.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td className="px-5 py-4 text-right whitespace-nowrap">
                              <Link href={`/account/orders/${order.id}`} className="inline-flex items-center justify-center h-8 px-4 text-[11px] uppercase tracking-wider rounded-xl font-bold bg-background border border-border hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all shadow-sm" aria-label={`${t('customerPortal.view')} ${order.id}`}>{t('customerPortal.view')}</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2">
            <ClaimOrderForm />
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
export function AccountOrdersPage() {
  const { t, formatDate } = useI18n();
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'swap' | 'convert'>('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/sign-in');
    }
  }, [isLoaded, isSignedIn, setLocation]);

  const orders = useGetCustomerOrders({ page, pageSize }, { query: {
    queryKey: getGetCustomerOrdersQueryKey({ page, pageSize }),
    enabled: isLoaded && isSignedIn,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  } });

  if (!isLoaded || !isSignedIn) return <PublicShell><main className="public-main"><LoadingBlock rows={6} /></main></PublicShell>;

  // Filter client-side
  const filteredItems = orders.data?.items.filter(o => {
    const matchesSearch = !search ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.fromAsset.toLowerCase().includes(search.toLowerCase()) ||
      o.toAsset.toLowerCase().includes(search.toLowerCase());

    const matchesTab = tab === 'all' ||
      (tab === 'swap' && o.type !== 'instant') ||
      (tab === 'convert' && o.type === 'instant');

    const matchesStatus = statusFilter === 'all' || customerStatusGroup(o.status) === statusFilter;

    return matchesSearch && matchesTab && matchesStatus;
  });

  return (
    <CustomerShell>
      <CustomerPageHeader
        title={t('account.orderHistory')}
        description={t('customerPortal.subtitle')}
      />

      <div className="customer-card flex min-w-0 flex-col">
        <div className="border-b border-border flex gap-4 px-4 pt-4 overflow-x-auto" data-testid="orders-tabs">
          <button
            className={cn("px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap", tab === 'all' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setTab('all')}
            data-testid="tab-all"
          >{t('customerPortal.tabsAll')}</button>
          <button
            className={cn("px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap", tab === 'swap' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setTab('swap')}
            data-testid="tab-swap"
          >{t('customerPortal.tabsSwap')}</button>
          <button
            className={cn("px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap", tab === 'convert' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setTab('convert')}
            data-testid="tab-convert"
          >{t('customerPortal.tabsConvert')}</button>
        </div>

        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('customerPortal.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-input/50 border border-border rounded-xl h-10 pl-9 pr-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                data-testid="search-orders"
              />
            </div>

            <select
              className="bg-input/50 border border-border rounded-xl h-10 px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              data-testid="filter-status"
            >
              <option value="all">{t('customerPortal.filterStatusAll')}</option>
              <option value="pending">{t('customerPortal.timelineAwaitingPayment')}</option>
              <option value="processing">{t('customerPortal.timelineProcessing')}</option>
              <option value="completed">{t('customerPortal.timelineCompleted')}</option>
              <option value="failed">{t('customerPortal.failed')}</option>
            </select>
          </div>
          {orders.data?.refreshUnavailable && <span className="text-xs font-semibold text-warning bg-warning/10 px-3 py-1.5 rounded-full">{t('account.providerSyncDelayed')}</span>}
        </div>

        {orders.isLoading ? (
          <div className="p-8"><LoadingBlock rows={5} /></div>
        ) : orders.isError ? (
          <div className="p-8"><ErrorState message={t('account.loadHistoryError')} retry={() => orders.refetch()} /></div>
        ) : filteredItems?.length === 0 ? (
          <div className="empty-state p-12 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Filter size={24} />
            </div>
            <strong className="text-base font-bold mb-1">{search ? t('customerPortal.noResults') : t('account.noOrdersTitle')}</strong>
            <p className="text-sm text-muted-foreground">{search ? t('customerPortal.noResultsDesc') : t('account.noOrdersDescription')}</p>
          </div>
        ) : (
          <div className="w-full">
            <div className="w-full relative group">
              <div className="swipeable-scroll-hint" aria-hidden="true" />
              <div className="mobile-table-scroll w-full" onScroll={(e) => {
                const target = e.target as HTMLElement;
                const hint = target.previousElementSibling as HTMLElement;
                if (hint) {
                  hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
                  hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
                }
              }}>
                <table className="customer-orders-table w-full text-left min-w-[1080px] border-collapse" data-testid="customer-order-history">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3 font-semibold">{t('account.exchange')}</th>
                      <th className="px-5 py-3 font-semibold">{t('customerPortal.send')}</th>
                      <th className="px-5 py-3 font-semibold">{t('customerPortal.receive')}</th>
                      <th className="px-5 py-3 font-semibold">{t('customerPortal.status')}</th>
                      <th className="px-5 py-3 font-semibold">{t('account.date')}</th>
                      <th className="px-5 py-3 font-semibold text-right">{t('customerPortal.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems?.map(order => (
                      <tr key={order.id} className="hover:bg-muted/30 transition-colors" data-testid={`customer-order-${order.id}`}>
                        <td className="customer-order-route-cell px-5 py-4 whitespace-nowrap">
                          <div className="customer-order-route flex items-center gap-2">
                            <OrderSettlementIdentity assetCode={order.fromAsset} routeLabel={order.fromNetwork} settlementOptionId={order.sourceSettlementOptionId} size="sm" compact className="customer-order-asset-identity" />
                            <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                            <OrderSettlementIdentity assetCode={order.toAsset} routeLabel={order.toNetwork} settlementOptionId={order.targetSettlementOptionId} size="sm" compact className="customer-order-asset-identity" />
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono text-sm font-semibold">
                          <span>{number(order.amount)}</span> <span>{order.fromAsset}</span>
                        </td>
                        <td className="px-5 py-4 font-mono text-sm font-semibold text-primary">
                          <span>{number(order.receiveAmount)}</span> <span>{order.toAsset}</span>
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill status={order.status} customerFacing />
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(order.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link href={`/account/orders/${order.id}`} className="button button-secondary h-8 px-3 text-xs rounded-lg font-semibold border border-border" aria-label={`${t('customerPortal.view')} ${order.id}`} data-testid={`view-order-${order.id}`}>{t('customerPortal.view')}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {((orders.data?.total ?? 0) > pageSize) && (
          <div className="flex flex-col gap-3 p-4 border-t border-border bg-muted/10 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
            <span className="text-center text-xs text-muted-foreground font-semibold min-[420px]:text-left">
              {t('account.showing', { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, orders.data?.total || 0), total: orders.data?.total ?? 0 })}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="button button-secondary h-11 sm:h-9 px-4 text-xs rounded-lg font-semibold"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                data-testid="pagination-prev"
              >
                {t('account.previous')}
              </button>
              <button
                type="button"
                className="button button-secondary h-11 sm:h-9 px-4 text-xs rounded-lg font-semibold"
                disabled={!orders.data || page * pageSize >= orders.data.total}
                onClick={() => setPage(p => p + 1)}
                data-testid="pagination-next"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </CustomerShell>
  );
}

export function AccountSettingsPage() {
  const { t, formatDate } = useI18n();
  const { isLoaded, isSignedIn, user } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/sign-in');
    }
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded || !isSignedIn) return <PublicShell><main className="public-main"><LoadingBlock rows={6} /></main></PublicShell>;

  const firstName = user?.firstName || '';
  const lastName = user?.lastName || '';
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const createdAt = user?.createdAt ? formatDate(user.createdAt, { dateStyle: 'long' }) : '';

  return (
    <CustomerShell>
      <CustomerPageHeader
        title={t('customerPortal.account')}
        description={t('customerPortal.subtitle')}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        <div className="customer-card p-6 md:p-8">
          <h2 className="mb-6 text-lg font-semibold tracking-tight">{t('customerPortal.personalInfo')}</h2>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('customerPortal.firstName')}</label>
                <div className="customer-subtle-surface truncate px-4 py-3 text-sm font-semibold">{firstName || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('customerPortal.lastName')}</label>
                <div className="customer-subtle-surface truncate px-4 py-3 text-sm font-semibold">{lastName || '-'}</div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('customerPortal.email')}</label>
              <div className="customer-subtle-surface flex items-center gap-3 px-4 py-3 text-sm font-semibold">
                <Mail size={16} className="text-muted-foreground shrink-0" />
                <span className="truncate">{email}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('customerPortal.accountCreated')}</label>
              <div className="text-sm font-medium">{createdAt}</div>
            </div>
          </div>
        </div>

        <div className="customer-card p-6 md:p-8">
          <h2 className="mb-6 text-lg font-semibold tracking-tight">{t('customerPortal.preferences')}</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('language.title')}</label>
              <LanguageSelector />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('header.appearance')}</label>
              <ThemeToggle testIdPrefix="settings" />
            </div>
          </div>
        </div>
      </div>

      <section className="customer-card mt-6 overflow-hidden p-6 md:p-8" data-testid="account-security">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t('account.securityTitle')}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t('account.securityDescription')}</p>
          </div>
        </div>
        <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card [&_.cl-cardBox]:!w-full [&_.cl-cardBox]:!max-w-none [&_.cl-cardBox]:!border-0 [&_.cl-cardBox]:!shadow-none [&_.cl-cardBox]:!bg-transparent">
          <UserProfile routing="hash" />
        </div>
      </section>
    </CustomerShell>
  );
}

function InlineCopy({
  text,
  label,
  showLabel = false,
}: {
  text: string;
  label?: string;
  showLabel?: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const accessibleLabel = label ? `${t('actions.copy')} ${label}` : t('actions.copy');

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary",
        showLabel ? "order-detail-action min-h-10 gap-2 px-3 text-xs font-bold uppercase tracking-wider" : "size-6",
      )}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {copied ? <Check size={13} className="shrink-0 text-success" /> : <Copy size={13} className="shrink-0" />}
      {showLabel && (copied ? t('actions.copied') : accessibleLabel)}
    </button>
  );
}

function detailValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized === '{}' || serialized === '[]' ? null : serialized;
  } catch {
    return null;
  }
}

function shortenDetailValue(value: string): string {
  if (value.length <= 30) return value;
  return `${value.slice(0, 11)}…${value.slice(-8)}`;
}

function TransactionDetails({
  fundingDetails,
  settlementDetails,
}: {
  fundingDetails?: Record<string, unknown>;
  settlementDetails?: Record<string, unknown>;
}) {
  const entries = [
    ...Object.entries(fundingDetails ?? {}).map(([key, value]) => ({ id: `funding-${key}`, key, value: detailValue(value) })),
    ...Object.entries(settlementDetails ?? {}).map(([key, value]) => ({ id: `settlement-${key}`, key, value: detailValue(value) })),
  ].filter((entry): entry is { id: string; key: string; value: string } => entry.value !== null);

  if (entries.length === 0) return null;

  return (
    <section className="customer-card order-transaction-card mb-8" data-testid="transaction-details">
      <div className="mb-5">
        <span className="order-detail-eyebrow">Secure references</span>
        <h2 className="text-base font-semibold tracking-tight">Transaction details</h2>
      </div>
      <div className="grid grid-cols-1 gap-y-5 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <div key={entry.id} className="flex min-w-0 flex-col gap-1.5">
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {entry.key.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <div className="order-transaction-value">
              <strong className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.value}>
                {shortenDetailValue(entry.value)}
              </strong>
              <InlineCopy text={entry.value} label={entry.key.replace(/([A-Z])/g, ' $1').trim()} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrderProgress({ stages }: { stages: { id: string; label: string; completed: boolean; active: boolean; failed: boolean }[] }) {
  return (
    <section className="customer-card order-progress-card" data-testid="order-status-timeline">
      <div className="flex w-full flex-col gap-0 md:flex-row">
        {stages.map((stage, idx) => (
          <div
            key={stage.id}
            className={cn("order-progress-stage group relative flex flex-1 flex-row items-start gap-3 md:flex-col md:items-center", idx < stages.length - 1 ? "pb-7 md:pb-0" : "")}
            data-state={stage.failed ? 'failed' : stage.active ? 'active' : stage.completed ? 'completed' : 'pending'}
          >
            {idx < stages.length - 1 && (
              <div className={cn(
                "order-progress-line absolute left-2 top-4 -ml-px h-full w-px md:left-[50%] md:top-2 md:ml-0 md:-mt-px md:h-px md:w-full",
                stage.completed && !stage.failed ? "is-completed" : "",
              )} />
            )}

            <div className={cn(
              "order-progress-node relative z-10 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            )}>
              {(stage.completed || stage.failed) && <div className="size-1.5 rounded-full bg-current" />}
            </div>

            <div className="flex min-w-0 flex-col pb-1 md:px-2 md:pb-0 md:text-center">
              <span className="order-progress-label text-xs font-semibold tracking-wide">{stage.label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomerOrderNotificationControl({ order }: { order: CustomerOrder }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const mutation = useUpdateCustomerOrderNotifications();
  const [notice, setNotice] = useState<{ kind: 'error' | 'success', text: string } | null>(null);

  const updatePreference = (enabled: boolean) => {
    setNotice(null);
    mutation.mutate({ id: order.id, data: { enabled } }, {
      onSuccess: (preference) => {
        queryClient.setQueryData<CustomerOrder>(
          getGetCustomerOrderQueryKey(order.id),
          (current) => current
            ? { ...current, statusNotificationsEnabled: preference.statusNotificationsEnabled }
            : current,
        );
        queryClient.invalidateQueries({ queryKey: getGetCustomerOrdersQueryKey() });
        setNotice({
          kind: 'success',
          text: preference.statusNotificationsEnabled
            ? t('account.notificationsOn')
            : t('account.notificationsOff'),
        });
      },
      onError: (error) => {
        setNotice({
          kind: 'error',
          text: publicApiErrorText(error, t('account.notificationsError')),
        });
      },
    });
  };

  return (
    <section className="customer-card order-notification-card mb-6" data-testid="customer-order-notifications">
      <div className="flex min-w-0 flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex items-start sm:items-center gap-4">
          <div className="order-notification-icon flex size-10 shrink-0 items-center justify-center rounded-full text-primary">
            <Bell size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">{t('account.statusNotifications')}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {t('account.notificationsDescription')}
            </p>
          </div>
        </div>

        <div className="ml-14 flex items-center gap-4 self-start sm:ml-0 sm:self-auto sm:justify-end">
          {mutation.isPending && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Loader2 size={13} className="animate-spin" /> {t('account.savingPreference')}
            </span>
          )}
          <label
            className="inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-3"
            data-testid="control-order-notifications"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {order.statusNotificationsEnabled ? t('account.on') : t('account.off')}
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label={t('account.notificationAriaLabel')}
              checked={order.statusNotificationsEnabled}
              disabled={mutation.isPending}
              onChange={(event) => updatePreference(event.target.checked)}
              className="sr-only peer"
              data-testid="switch-order-notifications"
            />
            <span className="order-notification-toggle relative h-6 w-11 rounded-full border border-border bg-muted transition-colors peer-checked:bg-primary peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
          </label>
        </div>
      </div>
      {notice && (
        <div className="ml-14 mt-5 sm:ml-0">
          <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>
            {notice.text}
          </InlineNotice>
        </div>
      )}
    </section>
  );
}

function CustomerOrderView({ order }: { order: CustomerOrder }) {
  const { t, formatDate } = useI18n();
  const queryClient = useQueryClient();
  const statusGroup = customerStatusGroup(order.status);
  const publicNotificationSettings = useGetPublicNotificationSettings({
    query: { queryKey: getGetPublicNotificationSettingsQueryKey(), staleTime: 60_000 },
  });
  const isFailed = statusGroup === 'failed';
  const markPaidMutation = useMarkOrderPaid();
  const cancelOrderMutation = useCancelCustomerOrder();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const normalizedStatus = order.status.trim().toLowerCase();
  const isConvert = order.type === 'instant';
  const canCustomerCancel = order.type === 'manual' &&
    order.manualSettlementState === 'awaiting_funds' &&
    !order.customerMarkedPaidAt &&
    statusGroup === 'pending';
  const currentStage = isConvert
    ? convertOrderStatusStep(normalizedStatus)
    : statusGroup === 'completed'
      ? 3
      : statusGroup === 'processing'
        ? 2
        : isFailed && /fail|refund/.test(normalizedStatus)
          ? 2
          : 1;
  const stages = (isConvert
    ? ['Created', 'Processing', 'Done']
    : [
      t('customerPortal.timelineCreated'),
      t('customerPortal.timelineAwaitingPayment'),
      t('customerPortal.timelineProcessing'),
      t('customerPortal.timelineCompleted'),
    ]).map((label, index) => ({
    id: (isConvert ? ['created', 'processing', 'completed'] : ['created', 'awaiting-payment', 'processing', 'completed'])[index],
    label,
    completed: isConvert ? currentStage === 2 || index < currentStage : statusGroup === 'completed' || index < currentStage,
    active: isConvert ? currentStage !== 2 && !isFailed && index === currentStage : statusGroup !== 'completed' && !isFailed && index === currentStage,
    failed: isFailed && index === currentStage,
  }));

  return (
    <div className="customer-order-detail-page w-full" data-testid="customer-order-detail">
      <div className="mb-4">
        <StatusPill status={order.status} customerFacing />
      </div>
      <div className="mb-8">
        <OrderProgress stages={stages} />
      </div>

      <section className="customer-card order-exchange-frame mb-8" data-testid="order-exchange-details">
        <div className="order-exchange-card">
          <div className="order-exchange-side" data-testid="order-exchange-sent">
            <div className="order-exchange-side-heading">
              <span className="order-exchange-label rounded-md bg-muted/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('account.youSent', { network: '' }).replace(':', '').trim()}
              </span>
              <OrderSettlementIdentity
                assetCode={order.fromAsset}
                routeLabel={order.fromNetwork}
                settlementOptionId={order.sourceSettlementOptionId}
                size="md"
                compact
                className="order-exchange-identity"
              />
            </div>
            <strong className="order-exchange-amount font-mono tracking-tight" title={`${number(order.amount)} ${order.fromAsset}`}>
              {number(order.amount)} <span className="text-base text-muted-foreground">{order.fromAsset}</span>
            </strong>
          </div>

          <div className="order-exchange-arrow-wrap" data-testid="order-exchange-arrow">
            <div className="order-exchange-arrow">
              <ArrowRight size={16} aria-hidden="true" />
            </div>
          </div>

          <div className="order-exchange-side is-receive" data-testid="order-exchange-receive">
            <div className="order-exchange-side-heading">
              <span className="order-exchange-label rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                {t(order.type === 'manual' ? 'account.estimatedReceive' : 'account.youReceive', { network: '' }).replace(':', '').trim()}
              </span>
              <OrderSettlementIdentity
                assetCode={order.toAsset}
                routeLabel={order.toNetwork}
                settlementOptionId={order.targetSettlementOptionId}
                size="md"
                compact
                className="order-exchange-identity"
              />
            </div>
            <strong className="order-exchange-amount font-mono tracking-tight text-primary" title={`${number(order.receiveAmount)} ${order.toAsset}`}>
              {number(order.receiveAmount)} <span className="text-base text-muted-foreground">{order.toAsset}</span>
            </strong>
          </div>
        </div>
      </section>

      <section className="customer-card order-detail-grid mb-8 grid min-w-0 grid-cols-1 gap-0 min-[480px]:grid-cols-2">
        <div className="order-detail-meta">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('account.exchangeType')}</span>
          <strong className="truncate text-sm font-semibold">{order.type === 'instant' ? t('convert.convert') : t('convert.swap')}</strong>
        </div>
        {order.rateMode && (
          <div className="order-detail-meta">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('account.rateMode')}</span>
            <strong className="truncate text-sm font-semibold">{order.rateMode === 'FIXED' ? t('convert.fixedRate') : t('convert.floatingRate')}</strong>
          </div>
        )}
        <div className="order-detail-meta">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('form.youSend')} · {t('affiliate.network')}</span>
          <strong className="truncate text-sm font-semibold">{order.fromNetwork}</strong>
        </div>
        <div className="order-detail-meta">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('form.youReceive')} · {t('affiliate.network')}</span>
          <strong className="truncate text-sm font-semibold">{order.toNetwork}</strong>
        </div>
        <div className="order-detail-meta">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('account.orderId')}</span>
          <div className="-mr-1 flex items-center gap-2">
            <strong className="flex-1 truncate font-mono text-sm" title={order.id}>{order.id}</strong>
            <InlineCopy text={order.id} label={t('account.orderId')} />
          </div>
        </div>
        <div className="order-detail-meta">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('account.date')}</span>
          <strong className="truncate text-sm font-semibold">
            {formatDate(order.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
          </strong>
        </div>
        {order.type === 'manual' && order.manualSettlementState && (
          <div className="order-detail-meta">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('account.manualStatus')}</span>
            <strong className="truncate text-sm font-semibold capitalize">{order.manualSettlementState.replace(/_/g, ' ')}</strong>
          </div>
        )}
      </section>

      {order.type === 'manual' && order.verifiedFundingTransaction && (
        <div className="mb-6">
          <VerifiedTransaction transaction={order.verifiedFundingTransaction} />
        </div>
      )}

      <TransactionDetails
        fundingDetails={order.fundingDetails}
        settlementDetails={order.settlementDetails}
      />

      {order.customerSafeNote && (
        <div className="mb-6 flex items-start gap-4 rounded-xl border border-info/20 bg-info/10 p-5 text-sm text-info" data-testid="notice-customer-safe">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info/20">
            <FileText size={16} />
          </div>
          <div className="pt-1.5">
            <strong className="mb-1 block font-mono tracking-tight">{t('account.operatorNote')}</strong>
            <span className="leading-relaxed">{order.customerSafeNote}</span>
          </div>
        </div>
      )}

      {order.outcomeUnknown && (
        <div className="mb-6 rounded-xl border border-warning/20 bg-warning/10 p-5 text-sm text-warning">
          <strong className="mb-1 block font-mono">{t('account.actionRequired')}</strong> {t('account.outcomeUnknown')}
        </div>
      )}
      {order.refreshUnavailable && (
        <div className="mb-6 rounded-xl border border-warning/20 bg-warning/10 p-5 text-sm text-warning">
          <strong className="mb-1 block font-mono">{t('account.providerSyncDelayed')}</strong> {t('account.detailSyncDescription')}
        </div>
      )}
      {isFailed && (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive">
          <strong className="mb-1 block font-mono">{t('account.exchangeStopped')}</strong> {t('account.exchangeStoppedDescription')}
        </div>
      )}

      {order.paymentDetailsApplicable && (
        <PaymentDetailsCard
          paymentDetails={order.paymentDetails}
          paymentDetailsApplicable={order.paymentDetailsApplicable}
          sourcePaymentMethod={order.sourcePaymentMethod}
          customerMarkedPaidAt={order.customerMarkedPaidAt}
          actionsDisabled={/complete|paid|fail|cancel|refund|expire/.test(normalizedStatus)}
          onMarkPaid={() => markPaidMutation.mutate({ id: order.id }, {
            onSuccess: () => {
              void queryClient.invalidateQueries({ queryKey: getGetCustomerOrderQueryKey(order.id) });
              void queryClient.invalidateQueries({ queryKey: getGetCustomerOrdersQueryKey() });
            },
          })}
          markPaidPending={markPaidMutation.isPending}
          supportHref={SUPPORT_TELEGRAM}
        />
      )}

      {canCustomerCancel && (
        <section className="mb-6 border-t border-destructive/15 pt-5">
          <CancelOrderAction
            onConfirm={() => {
              setCancelError(null);
              cancelOrderMutation.mutate({ id: order.id }, {
                onSuccess: (updated) => {
                  queryClient.setQueryData(getGetCustomerOrderQueryKey(order.id), updated);
                  void queryClient.invalidateQueries({ queryKey: getGetCustomerOrdersQueryKey() });
                },
                onError: (error) => {
                  setCancelError(publicApiErrorText(error, 'This order can no longer be cancelled.'));
                },
              });
            }}
            pending={cancelOrderMutation.isPending}
            errorMessage={cancelError}
            triggerClassName="w-full sm:w-auto"
          />
        </section>
      )}

      <OrderCompletionSection
        order={order}
        trustpilotUrl={publicNotificationSettings.data?.trustpilotReviewUrl}
      />

      <CustomerOrderNotificationControl order={order} />
    </div>
  );
}

export function AccountOrderDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const id = params.id || '';
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      setLocation(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
    }
  }, [isLoaded, isSignedIn, setLocation]);

  const order = useGetCustomerOrder(id, {
    query: {
      queryKey: getGetCustomerOrderQueryKey(id),
      enabled: isLoaded && isSignedIn && !!id,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: 'always',
      refetchInterval: (query: any) => {
        const current = query.state.data;
        if (!current) return 3000;
        if (/complete|paid|fail|cancel|refund|expire/i.test(current.status || '')) return false;
        return 3000;
      },
    },
  });

  if (!isLoaded || !isSignedIn) return null;

  return (
    <CustomerShell>
      <div className="mx-auto w-full max-w-5xl pb-12 pt-1">
        {order.isLoading ? (
          <LoadingBlock rows={6} />
        ) : order.isError ? (
          <ErrorState message={t('account.loadOrderError')} retry={() => order.refetch()} />
        ) : !order.data ? (
          <ErrorState message={t('account.orderNotFound')} />
        ) : (
          <CustomerOrderView order={order.data} />
        )}
      </div>
    </CustomerShell>
  );
}
