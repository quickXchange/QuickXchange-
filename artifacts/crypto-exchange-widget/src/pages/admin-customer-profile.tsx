import { useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Check, Edit2, Mail, ShieldAlert,
  ShieldCheck, Users, Loader2, AlertTriangle, ArrowRightLeft, DollarSign, RotateCcw, X,
  CircleCheckBig, UserRound, UserRoundPlus, TrendingUp, WalletCards
} from 'lucide-react';
import {
  useGetAdminCustomer, getGetAdminCustomerQueryKey,
  useGetAdminCustomerReferrals, getGetAdminCustomerReferralsQueryKey,
  useUpdateAdminCustomer, useResetAdminCustomerPassword,
  useConfirmAdminCustomerEmail, useSuspendAdminCustomer, useActivateAdminCustomer,
  useRevokeAdminCustomerSessions,
} from '@workspace/api-client-react';
import { AdminShell, ErrorState, LoadingBlock, InlineNotice, apiErrorText, FiatCurrencyFlag } from '../App';
import { CryptoIdentity } from '../components/crypto-identity';
import { useI18n } from '../i18n/provider';

const fiatAssets = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY']);

function CustomerVolumeIdentity({ asset, fiatName }: { asset: string; fiatName?: string }) {
  const symbol = asset.trim().toUpperCase();

  if (fiatName) {
    return (
      <span className="customer-volume-identity">
        <span className="customer-volume-logo"><FiatCurrencyFlag code={symbol} /></span>
        <span className="customer-volume-identity-copy"><strong>{symbol}</strong><small>{fiatName}</small></span>
      </span>
    );
  }

  return <CryptoIdentity symbol={symbol} size="md" className="customer-volume-identity" />;
}

function formatCustomerAssetAmount(value: number | string, asset: string, formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string) {
  const symbol = asset.trim().toUpperCase();
  return `${formatNumber(Number(value), { minimumFractionDigits: fiatAssets.has(symbol) ? 2 : 0, maximumFractionDigits: fiatAssets.has(symbol) ? 2 : 8 })} ${symbol}`;
}

export function AdminCustomerProfile() {
  const { t, locale, formatNumber, formatDate } = useI18n();
  const formatDateTime = (value: string | number | Date) => formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });
  const formatUsd = (value: number | string) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value));
  const roleLabel = (role: string) => {
    if (role === 'customer') return t('adminCustomer.roleCustomer');
    if (role === 'affiliate') return t('adminCustomer.roleAffiliate');
    if (role === 'vip') return t('adminCustomer.roleVip');
    return role;
  };
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [referralsPage, setReferralsPage] = useState(1);
  const referralsParams = { page: referralsPage, pageSize: 25 };

  const customerQuery = useGetAdminCustomer(id, { query: { queryKey: getGetAdminCustomerQueryKey(id), refetchInterval: 15000, refetchOnWindowFocus: true } });
  const referralsQuery = useGetAdminCustomerReferrals(id, referralsParams, { query: { queryKey: getGetAdminCustomerReferralsQueryKey(id, referralsParams), refetchInterval: 30000, refetchOnWindowFocus: true } });

  const updateMutation = useUpdateAdminCustomer();
  const resetPasswordMutation = useResetAdminCustomerPassword();
  const confirmEmailMutation = useConfirmAdminCustomerEmail();
  const suspendMutation = useSuspendAdminCustomer();
  const activateMutation = useActivateAdminCustomer();
  const revokeSessionsMutation = useRevokeAdminCustomerSessions();

  const [activeTab, setActiveTab] = useState('details');

  const customer = customerQuery.data;

  // Dialog States
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [revokeSessionsOpen, setRevokeSessionsOpen] = useState(false);

  // Forms
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', country: '', role: '', customReferralCode: '', referralRate: '' });
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
  const [passwordConfirmStep, setPasswordConfirmStep] = useState(false);
  const [editError, setEditError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const editInFlight = useRef(false);
  const passwordInFlight = useRef(false);
  const confirmInFlight = useRef(false);

  const [actionNotice, setActionNotice] = useState<{ kind: 'success' | 'error', text: string } | null>(null);

  const invalidateQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/admin/customers'] });
  };

  const handleEditOpen = () => {
    if (customer) {
      setEditError('');
      setEditForm({
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        country: customer.country || '',
        role: customer.role || 'customer',
        customReferralCode: customer.affiliateCode || '',
        referralRate: customer.referralRate ? String(Number(customer.referralRate) * 100) : '',
      });
      setEditOpen(true);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editInFlight.current) return;
    editInFlight.current = true;
    setEditError('');
    setActionNotice(null);
    updateMutation.mutate({
      id,
      data: {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        country: editForm.country.trim(),
        role: editForm.role || undefined,
        referralCode: editForm.customReferralCode && editForm.customReferralCode !== customer?.affiliateCode
          ? editForm.customReferralCode.toUpperCase()
          : undefined,
        referralRate: customer?.referralRate !== null || editForm.referralRate
          ? (editForm.referralRate ? String(Number(editForm.referralRate) / 100) : null)
          : undefined,
      }
    }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetAdminCustomerQueryKey(id), updated);
        setEditOpen(false);
        invalidateQueries();
        setActionNotice({ kind: 'success', text: t('adminCustomer.updateSuccess') });
      },
      onError: (err) => setEditError(apiErrorText(err, t('adminCustomer.updateError'))),
      onSettled: () => { editInFlight.current = false; },
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInFlight.current) return;
    setPasswordError('');
    if (passwordForm.password !== passwordForm.confirm) {
      setPasswordError(t('adminCustomer.passwordMismatch'));
      return;
    }
    if (passwordForm.password.length < 12) {
      setPasswordError(t('adminCustomer.passwordLength'));
      return;
    }
    if (!passwordConfirmStep) {
      setPasswordConfirmStep(true);
      return;
    }
    passwordInFlight.current = true;
    setActionNotice(null);
    resetPasswordMutation.mutate({ id, data: { temporaryPassword: passwordForm.password } }, {
      onSuccess: () => {
        setPasswordOpen(false);
        setPasswordConfirmStep(false);
        setPasswordForm({ password: '', confirm: '' });
        invalidateQueries();
        setActionNotice({ kind: 'success', text: t('adminCustomer.passwordSuccess') });
      },
      onError: (err) => setPasswordError(apiErrorText(err, t('adminCustomer.passwordError'))),
      onSettled: () => { passwordInFlight.current = false; },
    });
  };

  const handleConfirmEmail = () => {
    if (confirmInFlight.current || customer?.emailVerified) return;
    confirmInFlight.current = true;
    setActionNotice(null);
    confirmEmailMutation.mutate({ id }, {
      onSuccess: async () => {
        try {
          const refreshed = await customerQuery.refetch();
          invalidateQueries();
          setActionNotice(refreshed.data?.emailVerified
            ? { kind: 'success', text: t('adminCustomer.emailSuccess') }
            : { kind: 'error', text: t('adminCustomer.emailError') });
        } finally {
          confirmInFlight.current = false;
        }
      },
      onError: (err) => {
        confirmInFlight.current = false;
        setActionNotice({ kind: 'error', text: apiErrorText(err, t('adminCustomer.emailError')) });
      },
    });
  };

  const handleSuspend = () => {
    setActionNotice(null);
    suspendMutation.mutate({ id }, {
      onSuccess: () => {
        setSuspendOpen(false);
        invalidateQueries();
        setActionNotice({ kind: 'success', text: t('adminCustomer.suspendSuccess') });
      },
      onError: (err) => setActionNotice({ kind: 'error', text: apiErrorText(err, t('adminCustomer.suspendError')) })
    });
  };

  const handleActivate = () => {
    setActionNotice(null);
    activateMutation.mutate({ id }, {
      onSuccess: () => {
        invalidateQueries();
        setActionNotice({ kind: 'success', text: t('adminCustomer.activateSuccess') });
      },
      onError: (err) => setActionNotice({ kind: 'error', text: apiErrorText(err, t('adminCustomer.activateError')) })
    });
  };

  const handleRevokeSessions = () => {
    setActionNotice(null);
    revokeSessionsMutation.mutate({ id }, {
      onSuccess: () => {
        setRevokeSessionsOpen(false);
        setActionNotice({ kind: 'success', text: t('adminCustomer.revokeAllSessionsSuccess') });
      },
      onError: (err) => {
        const code = (err as { data?: { code?: string } })?.data?.code;
        setActionNotice({
          kind: 'error',
          text: apiErrorText(
            err,
            code === 'CLERK_SESSION_REVOCATION_UNSUPPORTED'
              ? t('adminCustomer.revokeAllSessionsUnsupported')
              : t('adminCustomer.revokeAllSessionsError'),
          ),
        });
      },
    });
  };

  return (
    <AdminShell
      eyebrow={t('adminCustomer.eyebrow')}
      title={customer ? (`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email || '') : t('adminCustomer.loading')}
      requiredPermission="customers.view"
      action={
        <div className="flex gap-2">
          <button className="button button-secondary" onClick={() => setLocation('/admin/customers')} data-testid="button-back-to-customers">
            <ArrowLeft size={15} />{t('adminCustomer.backDirectory')}</button>
        </div>
      }
    >
      <div className="admin-customer-area rise-in space-y-6">
        {actionNotice && (
          <InlineNotice kind={actionNotice.kind} onDismiss={() => setActionNotice(null)}>
            {actionNotice.text}
          </InlineNotice>
        )}

        {customerQuery.isError ? (
          <div className="panel p-6">
            <ErrorState message={t('adminCustomer.loadError')} retry={() => customerQuery.refetch()} />
          </div>
        ) : customerQuery.isLoading || !customer ? (
          <div className="panel p-6">
            <LoadingBlock rows={8} />
          </div>
        ) : (
          <>
            <div className="panel customer-profile-header">
              <div className="flex items-center gap-4 min-w-0">
                <div className="customer-profile-avatar">
                  {customer.firstName?.slice(0, 1).toUpperCase() || customer.email?.slice(0, 1).toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold truncate">{`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email}</h2>
                  <div className="customer-profile-meta">
                    <span className="truncate">{customer.email}</span>
                    {customer.emailVerified ? (
                      <span className="customer-profile-badge customer-profile-badge--confirmed"><Check size={11} /> {t('adminCustomer.confirmed')} </span>
                    ) : (
                      <span className="customer-profile-badge customer-profile-badge--unconfirmed"><AlertTriangle size={11} /> {t('adminCustomer.unconfirmed')} </span>
                    )}
                    <span className="customer-profile-account-status"><span className={`badge badge-${customer.accountStatus === 'suspended' ? 'error' : 'success'}`}>{customer.accountStatus === 'suspended' ? t('adminCustomer.statusSuspended') : t('adminCustomer.statusActive')}</span></span>
                  </div>
                </div>
              </div>

              <div className="customer-profile-actions">
                {!customer.emailVerified && (
                  <button className="button customer-profile-action customer-profile-action--confirm" onClick={handleConfirmEmail} disabled={confirmEmailMutation.isPending} data-testid="action-confirm-email">
                    {confirmEmailMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Mail size={12} className="mr-1.5" />}
                     {t('adminCustomer.markEmailConfirmed')}
                  </button>
                )}
                <button className="button customer-profile-action customer-profile-action--reset" onClick={() => { setPasswordError(''); setPasswordConfirmStep(false); setPasswordForm({ password: '', confirm: '' }); setPasswordOpen(true); }} data-testid="action-reset-password">
                  <RotateCcw size={12} className="mr-1.5" /> {t('adminCustomer.resetPassword')}
                </button>
                <button className="button customer-profile-action customer-profile-action--edit" onClick={handleEditOpen} data-testid="action-edit-profile">
                  <Edit2 size={12} className="mr-1.5" /> {t('adminCustomer.editProfile')}
                </button>
              </div>
            </div>

            <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab} className="panel customer-profile-tabs">
              <TabsPrimitive.List className="customer-profile-tab-list">
                <TabsPrimitive.Trigger value="details" className="customer-profile-tab" data-testid="tab-user-details">
                  {t('adminCustomer.userDetails')}
                </TabsPrimitive.Trigger>
                <TabsPrimitive.Trigger value="stats" className="customer-profile-tab" data-testid="tab-stats">
                  {t('adminCustomer.stats')}
                </TabsPrimitive.Trigger>
                <TabsPrimitive.Trigger value="referrals" className="customer-profile-tab" data-testid="tab-referred-users">
                  {t('adminCustomer.referredUsers')}
                </TabsPrimitive.Trigger>
              </TabsPrimitive.List>

              <div className="flex-1 p-6 relative">
                <TabsPrimitive.Content value="details" className="outline-none" data-testid="content-user-details">
                  <div className="customer-profile-details-grid">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">{t('adminCustomer.personalInformation')} </h3>
                        <dl className="space-y-3">
                          <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.firstName')} </dt>
                            <dd className="text-sm font-bold col-span-2">{customer.firstName || '—'}</dd>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.lastName')} </dt>
                            <dd className="text-sm font-bold col-span-2">{customer.lastName || '—'}</dd>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.email')} </dt>
                            <dd className="text-sm font-bold col-span-2 truncate">{customer.email}</dd>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.country')} </dt>
                            <dd className="text-sm font-bold col-span-2">{customer.country || '—'}</dd>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.registeredAt')} </dt>
                            <dd className="text-sm font-bold col-span-2">{formatDateTime(customer.createdAt)}</dd>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-2">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.role')} </dt>
                            <dd className="text-sm font-bold col-span-2 capitalize">{roleLabel(customer.role)}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">{t('adminCustomer.affiliateAccount')} </h3>
                        <dl className="space-y-3">
                          <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.customReferralCode')} </dt>
                            <dd className="text-sm font-bold col-span-2">{customer.affiliateCode || '—'}</dd>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.referralRate')} </dt>
                            <dd className="text-sm font-bold col-span-2">{customer.referralRate ? `${formatNumber(Number(customer.referralRate) * 100, { maximumFractionDigits: 2 })}%` : t('adminCustomer.standard')}</dd>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                            <dt className="text-sm font-medium text-muted-foreground">{t('adminCustomer.accountStatus')} </dt>
                             <dd className="text-sm font-bold col-span-2"><span className={`badge badge-${customer.accountStatus === 'suspended' ? 'error' : 'success'}`}>{customer.accountStatus === 'suspended' ? t('adminCustomer.statusSuspended') : t('adminCustomer.statusActive')}</span></dd>
                          </div>
                        </dl>
                      </div>

                      <div className="customer-danger-zone">
                        <h3 className="customer-danger-heading"><ShieldAlert size={16} /> {t('adminCustomer.dangerZone')}</h3>
                        <p className="customer-danger-description">
                          {t('adminCustomer.dangerDescription')}
                        </p>
                        <div className="customer-danger-actions">
                        {customer.accountStatus === 'suspended' ? (
                          <button type="button" className="button customer-danger-action customer-danger-action--activate" onClick={handleActivate} disabled={activateMutation.isPending} data-testid="action-activate-user">
                             {activateMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} <span>{t('adminCustomer.activateUser')}</span>
                          </button>
                        ) : (
                          <button type="button" className="button customer-danger-action customer-danger-action--suspend" onClick={() => setSuspendOpen(true)} data-testid="action-suspend-user">
                            <ShieldAlert size={15} /> <span>{t('adminCustomer.suspendUser')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="button customer-danger-action customer-danger-action--revoke"
                          onClick={() => setRevokeSessionsOpen(true)}
                          disabled={revokeSessionsMutation.isPending}
                          data-testid="action-revoke-all-sessions"
                        >
                          {revokeSessionsMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                          <span>{t('adminCustomer.revokeAllSessions')}</span>
                        </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsPrimitive.Content>

                <TabsPrimitive.Content value="stats" className="outline-none" data-testid="content-stats">
                  <div className="customer-profile-stats">
                    <button type="button" className="customer-stat-card customer-stat-card--cyan customer-stat-card--link" onClick={() => setLocation(`/admin/orders?customerId=${encodeURIComponent(customer.id)}`)} data-testid="stat-total-orders" aria-label={`${t('adminCustomer.totalOrders')}: ${formatNumber(customer.totalOrders || 0)}. ${t('adminOrders.all_orders')}`}>
                      <span className="customer-stat-icon"><ArrowRightLeft size={17} /></span>
                      <strong>{formatNumber(customer.totalOrders || 0)}</strong>
                      <small>{t('adminCustomer.totalOrders')} <ArrowRightLeft size={11} aria-hidden="true" /></small>
                    </button>
                    <div className="customer-stat-card customer-stat-card--green" data-testid="stat-done-orders">
                      <span className="customer-stat-icon"><CircleCheckBig size={17} /></span>
                      <strong>{formatNumber(customer.doneOrders || 0)}</strong>
                      <small>{t('adminCustomer.doneOrders')} </small>
                    </div>
                    <div className="customer-stat-card customer-stat-card--amber" data-testid="stat-balance-owed">
                      <span className="customer-stat-icon"><WalletCards size={17} /></span>
                      <strong>{formatUsd(customer.balanceOwedUsd || '0')}</strong>
                      <small>{t('adminCustomer.balanceOwed')} </small>
                    </div>
                    <div className="customer-stat-card customer-stat-card--blue" data-testid="stat-total-sales">
                      <span className="customer-stat-icon"><TrendingUp size={17} /></span>
                      <strong>{customer.totalSalesUsd === null ? t('adminCustomer.unavailable') : formatUsd(customer.totalSalesUsd)}</strong>
                      <small>{t('adminCustomer.totalSales')} </small>
                    </div>
                    <div className="customer-stat-card customer-stat-card--pink" data-testid="stat-referred-users">
                      <span className="customer-stat-icon"><UserRoundPlus size={17} /></span>
                      <strong>{formatNumber(customer.referredUsers || 0)}</strong>
                      <small>{t('adminCustomer.referredUsers')} </small>
                    </div>
                    <div className="customer-stat-card customer-stat-card--emerald" data-testid="stat-referral-profit">
                      <span className="customer-stat-icon"><DollarSign size={17} /></span>
                      <strong>{formatUsd(customer.totalReferralProfitUsd || '0')}</strong>
                      <small>{t('adminCustomer.totalReferralProfit')} </small>
                    </div>
                  </div>

                  <div className="customer-volume-grid">
                    <div className="customer-volume-card customer-volume-card--send">
                      <div className="customer-volume-heading"><span className="customer-volume-heading-icon"><ArrowRightLeft size={16} /></span><div><h3>{t('adminCustomer.sendVolume')} </h3><p>{t('adminCustomer.sendVolumeSubtitle')} </p></div></div>
                      {customer.sendVolume && customer.sendVolume.length > 0 ? (
                        <div className="customer-volume-list">
                          {customer.sendVolume.slice(0, 5).map((vol: any, i: number) => (
                            <div key={i} className="customer-volume-row" data-testid={`stat-send-vol-${vol.asset}`}>
                               <CustomerVolumeIdentity asset={vol.asset} fiatName={fiatAssets.has(vol.asset.trim().toUpperCase()) ? t(`adminCustomer.asset${vol.asset.trim().toUpperCase()}`) : undefined} />
                              <span className="customer-volume-amount">{formatCustomerAssetAmount(vol.amount, vol.asset, formatNumber)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="customer-volume-empty">{t('adminCustomer.noSendVolume')} </div>
                      )}
                    </div>
                    <div className="customer-volume-card customer-volume-card--receive">
                      <div className="customer-volume-heading"><span className="customer-volume-heading-icon"><ArrowRightLeft size={16} /></span><div><h3>{t('adminCustomer.receiveVolume')} </h3><p>{t('adminCustomer.receiveVolumeSubtitle')} </p></div></div>
                      {customer.receiveVolume && customer.receiveVolume.length > 0 ? (
                        <div className="customer-volume-list">
                          {customer.receiveVolume.slice(0, 5).map((vol: any, i: number) => (
                            <div key={i} className="customer-volume-row" data-testid={`stat-receive-vol-${vol.asset}`}>
                               <CustomerVolumeIdentity asset={vol.asset} fiatName={fiatAssets.has(vol.asset.trim().toUpperCase()) ? t(`adminCustomer.asset${vol.asset.trim().toUpperCase()}`) : undefined} />
                              <span className="customer-volume-amount">{formatCustomerAssetAmount(vol.amount, vol.asset, formatNumber)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="customer-volume-empty">{t('adminCustomer.noReceiveVolume')} </div>
                      )}
                    </div>
                  </div>
                </TabsPrimitive.Content>

                <TabsPrimitive.Content value="referrals" className="outline-none" data-testid="content-referred-users">
                  {referralsQuery.isLoading ? (
                    <LoadingBlock rows={4} />
                  ) : referralsQuery.isError ? (
                    <ErrorState message={t('adminCustomer.referralsLoadError')} retry={() => referralsQuery.refetch()} />
                  ) : !referralsQuery.data?.items || referralsQuery.data.items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-referred-users">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
                        <Users size={24} />
                      </div>
                      <h3 className="text-lg font-bold mb-1">{t('adminCustomer.noReferredUsers')} </h3>
                      <p className="text-sm text-muted-foreground">{t('adminCustomer.noReferredUsersDescription')} </p>
                    </div>
                  ) : (
                    <div>
                      <div className="w-full relative group">
                        <div className="swipeable-scroll-hint" aria-hidden="true" />
                        <div className="table-wrap" onScroll={(e) => {
                          const target = e.target as HTMLElement;
                          const hint = target.previousElementSibling as HTMLElement;
                          if (hint) {
                            hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
                            hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
                          }
                        }}>
                        <table className="data-table" data-testid="table-referred-users">
                          <thead>
                            <tr>
                              <th>{t('adminCustomer.name')} </th>
                              <th>{t('adminCustomer.country')} </th>
                              <th>{t('adminCustomer.numberOfOrders')} </th>
                              <th>{t('adminCustomer.registeredAt')} </th>
                            </tr>
                          </thead>
                          <tbody>
                            {referralsQuery.data.items.map((referral) => (
                              <tr key={referral.id} data-testid={`row-referred-user-${referral.id}`}>
                                <td>
                                  <div className="font-bold text-sm truncate">{referral.name}</div>
                                </td>
                                <td className="text-sm">{referral.country || '—'}</td>
                                <td className="text-sm font-bold">{formatNumber(referral.ordersCount || 0)}</td>
                                <td className="text-sm text-muted-foreground">{formatDateTime(referral.registeredAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                        <span className="text-xs text-muted-foreground">
                          {t('adminCustomer.pagination', { page: formatNumber(referralsQuery.data.page), total: formatNumber(referralsQuery.data.total) })}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={referralsPage <= 1 || referralsQuery.isFetching}
                            onClick={() => setReferralsPage((page) => Math.max(1, page - 1))}
                            data-testid="button-referrals-previous"
                          >
                            {t('adminCustomer.previous')}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={referralsPage * referralsQuery.data.pageSize >= referralsQuery.data.total || referralsQuery.isFetching}
                            onClick={() => setReferralsPage((page) => page + 1)}
                            data-testid="button-referrals-next"
                          >
                            {t('adminCustomer.next')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsPrimitive.Content>
              </div>
            </TabsPrimitive.Root>
          </>
        )}
      </div>

      {/* Edit Customer Dialog */}
       <DialogPrimitive.Root open={editOpen} onOpenChange={(open) => { if (!updateMutation.isPending) setEditOpen(open); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="customer-admin-dialog-overlay" />
          <DialogPrimitive.Content className="customer-admin-dialog customer-edit-dialog">
            <div className="customer-admin-dialog-header">
              <div className="customer-admin-dialog-title-group">
                <span className="customer-admin-dialog-icon"><UserRound size={18} /></span>
                <div>
                  <DialogPrimitive.Title>{t('adminCustomer.editCustomerTitle')} </DialogPrimitive.Title>
                  <DialogPrimitive.Description>{t('adminCustomer.editCustomerDescription')} </DialogPrimitive.Description>
                </div>
              </div>
               <DialogPrimitive.Close className="customer-admin-dialog-close" disabled={updateMutation.isPending} aria-label={t('adminCustomer.closeEdit')}>
                <X size={17} />
              </DialogPrimitive.Close>
            </div>

             <form onSubmit={handleEditSubmit} className="customer-admin-dialog-form">
               <div className="customer-admin-dialog-body">
               {editError && <InlineNotice kind="error" onDismiss={() => setEditError('')}>{editError}</InlineNotice>}
              <div className="customer-edit-grid">
                <div className="customer-dialog-field">
                  <label htmlFor="edit-firstname">{t('adminCustomer.firstName')} </label>
                  <input
                    id="edit-firstname"
                    className="customer-dialog-control"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                    data-testid="input-edit-firstname"
                  />
                </div>
                <div className="customer-dialog-field">
                  <label htmlFor="edit-lastname">{t('adminCustomer.lastName')} </label>
                  <input
                    id="edit-lastname"
                    className="customer-dialog-control"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                    data-testid="input-edit-lastname"
                  />
                </div>
                <div className="customer-dialog-field">
                  <label htmlFor="edit-country">{t('adminCustomer.country')} </label>
                  <div className="customer-country-control">
                    <span className="customer-country-flag"><FiatCurrencyFlag code={editForm.country || 'US'} /></span>
                    <input
                      id="edit-country"
                      className="customer-dialog-control"
                      value={editForm.country}
                      onChange={(e) => setEditForm(f => ({ ...f, country: e.target.value.toUpperCase() }))}
                      maxLength={2}
                      placeholder="US"
                      data-testid="input-edit-country"
                    />
                  </div>
                </div>
                <div className="customer-dialog-field">
                  <label htmlFor="edit-role">{t('adminCustomer.role')} </label>
                  <select
                    id="edit-role"
                    className="customer-dialog-control customer-dialog-select"
                    value={editForm.role}
                    onChange={(e) => setEditForm(f => ({ ...f, role: e.target.value }))}
                    data-testid="select-edit-role"
                  >
                    <option value="customer">{t('adminCustomer.customer')} </option>
                    <option value="affiliate">{t('adminCustomer.affiliate')} </option>
                    <option value="vip">{t('adminCustomer.vip')}</option>
                  </select>
                </div>
              </div>

              <section className="customer-referral-settings">
                <div className="customer-referral-settings-heading">
                  <span>{t('adminCustomer.referralSettings')} </span>
                  <div />
                </div>
                <div className="customer-edit-grid">
                  <div className="customer-dialog-field">
                    <label htmlFor="edit-referralcode">{t('adminCustomer.customReferralCode')} </label>
                    <input
                      id="edit-referralcode"
                      className="customer-dialog-control"
                      value={editForm.customReferralCode}
                      maxLength={12}
                      pattern="(?:[A-HJ-NP-Z2-9]{8}|[A-HJ-NP-Z2-9]{12})"
                      onChange={(e) => setEditForm(f => ({ ...f, customReferralCode: e.target.value.toUpperCase() }))}
                      data-testid="input-edit-referralcode"
                    />
                  </div>
                  <div className="customer-dialog-field">
                    <label htmlFor="edit-referralrate">{t('adminCustomer.referralRatePercent')} </label>
                    <input
                      id="edit-referralrate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="customer-dialog-control"
                      value={editForm.referralRate}
                      onChange={(e) => setEditForm(f => ({ ...f, referralRate: e.target.value }))}
                      data-testid="input-edit-referralrate"
                    />
                  </div>
                </div>
              </section>
               </div>

              <div className="customer-admin-dialog-actions">
                <DialogPrimitive.Close asChild>
                  <button type="button" className="button customer-dialog-secondary" disabled={updateMutation.isPending} data-testid="button-cancel-edit">{t('adminCustomer.cancel')} </button>
                </DialogPrimitive.Close>
                <button type="submit" className="button customer-dialog-primary" disabled={updateMutation.isPending} data-testid="button-save-edit">
                  {updateMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Check size={16} className="mr-2" />}
                  {t('adminCustomer.saveChanges')}
                </button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Password Reset Dialog */}
       <DialogPrimitive.Root open={passwordOpen} onOpenChange={(open) => {
         if (resetPasswordMutation.isPending) return;
         setPasswordOpen(open);
         if (!open) { setPasswordForm({ password: '', confirm: '' }); setPasswordConfirmStep(false); setPasswordError(''); }
       }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="customer-admin-dialog-overlay" />
          <DialogPrimitive.Content className="customer-admin-dialog customer-password-dialog">
            <div className="customer-admin-dialog-header">
              <div className="customer-admin-dialog-title-group">
                <span className="customer-admin-dialog-icon"><RotateCcw size={18} /></span>
                <div>
                  <DialogPrimitive.Title>{t('adminCustomer.resetPassword')} </DialogPrimitive.Title>
                  <DialogPrimitive.Description>{t('adminCustomer.resetPasswordDescription')} </DialogPrimitive.Description>
                </div>
              </div>
               <DialogPrimitive.Close className="customer-admin-dialog-close" disabled={resetPasswordMutation.isPending} aria-label={t('adminCustomer.closeReset')}>
                <X size={17} />
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={handlePasswordSubmit} className="customer-admin-dialog-form">
              <div className="customer-admin-dialog-body space-y-4">
                {passwordError && <InlineNotice kind="error" onDismiss={() => setPasswordError('')}>{passwordError}</InlineNotice>}
                <p className="text-sm text-muted-foreground">
                {passwordConfirmStep ? t('adminCustomer.resetPasswordDescription') : t('adminCustomer.resetPasswordHelp')}
                </p>

                {!passwordConfirmStep && <>
                <div className="customer-dialog-field">
                  <label htmlFor="reset-password">{t('adminCustomer.newPassword')} </label>
                  <input
                    id="reset-password"
                    type="password"
                    required
                    className="customer-dialog-control font-mono"
                    value={passwordForm.password}
                     onChange={(e) => { setPasswordConfirmStep(false); setPasswordForm(f => ({ ...f, password: e.target.value })); }}
                    data-testid="input-reset-password"
                  />
                </div>
                <div className="customer-dialog-field">
                  <label htmlFor="reset-confirm">{t('adminCustomer.confirmPassword')} </label>
                  <input
                    id="reset-confirm"
                    type="password"
                    required
                    className="customer-dialog-control font-mono"
                    value={passwordForm.confirm}
                     onChange={(e) => { setPasswordConfirmStep(false); setPasswordForm(f => ({ ...f, confirm: e.target.value })); }}
                    data-testid="input-reset-confirm"
                  />
                </div>
                </>}
                {passwordConfirmStep && <div className="customer-password-confirmation" role="status">
                  <strong>{customer?.email}</strong>
                  <span>{t('adminCustomer.resetPasswordHelp')}</span>
                </div>}
              </div>

              <div className="customer-admin-dialog-actions">
                {passwordConfirmStep && <button type="button" className="button customer-dialog-secondary" disabled={resetPasswordMutation.isPending} onClick={() => setPasswordConfirmStep(false)} data-testid="button-back-reset">{t('common.back')}</button>}
                <DialogPrimitive.Close asChild>
                  <button type="button" className="button customer-dialog-secondary" disabled={resetPasswordMutation.isPending} data-testid="button-cancel-reset">{t('adminCustomer.cancel')} </button>
                </DialogPrimitive.Close>
                <button type="submit" className="button customer-dialog-primary" disabled={resetPasswordMutation.isPending || (!passwordConfirmStep && (!passwordForm.password || !passwordForm.confirm))} data-testid="button-submit-reset">
                  {resetPasswordMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <RotateCcw size={16} className="mr-2" />}
                  {passwordConfirmStep ? t('adminCustomer.setPassword') : t('common.continue')}
                </button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Revoke All Active Sessions Confirmation Dialog */}
      <DialogPrimitive.Root open={revokeSessionsOpen} onOpenChange={setRevokeSessionsOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="customer-admin-dialog-overlay" />
          <DialogPrimitive.Content className="customer-admin-dialog customer-suspend-dialog">
            <div className="customer-admin-dialog-header">
              <div className="customer-admin-dialog-title-group">
                <span className="customer-admin-dialog-icon border-destructive/30 bg-destructive/10 text-destructive"><RotateCcw size={18} /></span>
                <div>
                  <DialogPrimitive.Title>{t('adminCustomer.revokeAllSessions')}</DialogPrimitive.Title>
                  <DialogPrimitive.Description>{t('adminCustomer.revokeAllSessionsDescription')}</DialogPrimitive.Description>
                </div>
              </div>
              <DialogPrimitive.Close className="customer-admin-dialog-close" aria-label={t('adminCustomer.closeRevokeAllSessions')}>
                <X size={17} />
              </DialogPrimitive.Close>
            </div>

            <div className="customer-admin-dialog-body">
              <p className="text-sm text-foreground">
                {t('adminCustomer.revokeAllSessionsConfirmationBefore')} <strong>{customer?.email}</strong>{t('adminCustomer.revokeAllSessionsConfirmationAfter')}
              </p>
            </div>

            <div className="customer-admin-dialog-actions">
              <DialogPrimitive.Close asChild>
                <button type="button" className="button customer-dialog-secondary" disabled={revokeSessionsMutation.isPending} data-testid="button-cancel-revoke-all-sessions">{t('adminCustomer.cancel')}</button>
              </DialogPrimitive.Close>
              <button
                type="button"
                className="button customer-dialog-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleRevokeSessions}
                disabled={revokeSessionsMutation.isPending}
                data-testid="button-confirm-revoke-all-sessions"
              >
                {revokeSessionsMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <RotateCcw size={16} className="mr-2" />}
                {t('adminCustomer.revokeAllSessions')}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Suspend Confirmation Dialog */}
      <DialogPrimitive.Root open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="customer-admin-dialog-overlay" />
          <DialogPrimitive.Content className="customer-admin-dialog customer-suspend-dialog">
            <div className="customer-admin-dialog-header">
              <div className="customer-admin-dialog-title-group">
                <span className="customer-admin-dialog-icon border-destructive/30 bg-destructive/10 text-destructive"><ShieldAlert size={18} /></span>
                <div>
                  <DialogPrimitive.Title>{t('adminCustomer.suspendUser')} </DialogPrimitive.Title>
                  <DialogPrimitive.Description>{t('adminCustomer.suspendDescription')}</DialogPrimitive.Description>
                </div>
              </div>
              <DialogPrimitive.Close className="customer-admin-dialog-close" aria-label={t('adminCustomer.closeSuspend')}>
                <X size={17} />
              </DialogPrimitive.Close>
            </div>

            <div className="customer-admin-dialog-body">
              <p className="text-sm text-foreground">
                {t('adminCustomer.suspendConfirmationBefore')} <strong>{customer?.email}</strong>{t('adminCustomer.suspendConfirmationAfter')}
              </p>
            </div>

            <div className="customer-admin-dialog-actions">
              <DialogPrimitive.Close asChild>
                <button type="button" className="button customer-dialog-secondary" disabled={suspendMutation.isPending} data-testid="button-cancel-suspend">{t('adminCustomer.cancel')} </button>
              </DialogPrimitive.Close>
              <button
                type="button"
                className="button customer-dialog-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleSuspend}
                disabled={suspendMutation.isPending}
                data-testid="button-confirm-suspend"
              >
                {suspendMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <ShieldAlert size={16} className="mr-2" />}
                {t('adminCustomer.suspendUser')}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </AdminShell>
  );
}
