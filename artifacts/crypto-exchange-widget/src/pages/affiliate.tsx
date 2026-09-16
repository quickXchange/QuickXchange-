import React, { useMemo, useState, useEffect } from 'react';
import { UniversalSearchSheet } from '@/components/universal-search-sheet';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link, useParams, useLocation } from 'wouter';
import {
  useGetAffiliateDashboard, getGetAffiliateDashboardQueryKey,
  useGetAffiliateOverview, getGetAffiliateOverviewQueryKey,
  useGetAffiliateAccounts, getGetAffiliateAccountsQueryKey,
  useGetAffiliateAccount, getGetAffiliateAccountQueryKey,
  useGetAffiliatePayoutHistory, getGetAffiliatePayoutHistoryQueryKey,
  useGetAffiliatePayoutQueue, getGetAffiliatePayoutQueueQueryKey,
  useGetAffiliateSettings, getGetAffiliateSettingsQueryKey,
  useGetAffiliateReferrals, getGetAffiliateReferralsQueryKey,
  useGetAffiliateCommissions, getGetAffiliateCommissionsQueryKey,
  useGetAffiliateValuationReviews, getGetAffiliateValuationReviewsQueryKey,
  useGetAffiliatePayoutNetworks, getGetAffiliatePayoutNetworksQueryKey,
  useRequestAffiliatePayout, useTransitionAffiliatePayout,
  useCreateAffiliateSettingsVersion, useReviewAffiliateValuation
} from '@workspace/api-client-react';
import type { AffiliatePayout, AffiliateSettings, AffiliateValuationReview } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Settings, MoreHorizontal, Network, Copy, DollarSign, HandCoins, Users, FileText, Check, X, ShieldCheck, ChevronRight, ChevronDown, Plus, Search, TrendingUp, Trophy, MoreVertical, RefreshCw, UserCheck, Eye, Link2
} from 'lucide-react';
import { cn, formatExactUsd, isGreaterThanExact, basePath, exactDateTime, ago, apiErrorText, LoadingBlock, ErrorState, PublicShell, shortId, AdminShell } from '../App';
import { AdminSearch } from '../components/admin-search';
import { useUser } from '@clerk/react';
import { useI18n } from '../i18n/provider';
import { CustomerShell, CustomerPageHeader } from '@/components/customer/CustomerShell';
import { CustomerStatCard } from '@/components/customer/CustomerStatCard';

const formatUsdt = (value: string) => `${formatExactUsd(value).replace('$', '')} USDT`;
const AffiliateGrowthChart = React.lazy(() => import('../components/AffiliateGrowthChart'));
const AFFILIATE_HISTORY_PAGE_SIZE = 25;

function AffiliateHistoryPagination({
  page,
  pageSize,
  itemCount,
  onPageChange,
  testId,
}: {
  page: number;
  pageSize: number;
  itemCount: number;
  onPageChange: (page: number) => void;
  testId: string;
}) {
  const { t } = useI18n();
  const hasNextPage = itemCount === pageSize;

  if (page === 1 && !hasNextPage) return null;

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border/40 px-4 py-3" aria-label={t('genericUi.paginationLabel')}>
      <button
        type="button"
        className="button button-secondary h-9 px-3 text-xs"
        disabled={page === 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        data-testid={`${testId}-previous`}
      >
        {t('genericUi.previous')}
      </button>
      <span className="text-xs font-mono text-muted-foreground">Page {page}</span>
      <button
        type="button"
        className="button button-secondary h-9 px-3 text-xs"
        disabled={!hasNextPage}
        onClick={() => onPageChange(page + 1)}
        data-testid={`${testId}-next`}
      >
        {t('genericUi.next')}
      </button>
    </nav>
  );
}

export function AffiliateDashboardPage() {
  const { t } = useI18n();
  const { isLoaded, isSignedIn, user } = useUser();
  const [, setLocation] = useLocation();

  const dashboard = useGetAffiliateDashboard({ query: { queryKey: getGetAffiliateDashboardQueryKey(), enabled: isLoaded && isSignedIn } });

  if (!isLoaded) {
    return <PublicShell><main className="public-main"><LoadingBlock rows={6} /></main></PublicShell>;
  }

  if (!isSignedIn) {
    return (
      <PublicShell>
        <main className="public-main rise-in px-4 py-20 text-center sm:px-8 sm:py-28">
          <Network size={48} className="mx-auto text-primary mb-6 opacity-80" />
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">{t('affiliate.program')}</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8 leading-relaxed">
            {t('affiliate.signInDescription')}
          </p>
          <div className="mx-auto flex max-w-sm flex-col justify-center gap-3 min-[400px]:flex-row">
            <Link href="/sign-in" className="button button-primary w-full px-6 py-3 min-[400px]:w-auto">{t('auth.signIn')}</Link>
            <Link href="/sign-up" className="button button-secondary w-full px-6 py-3 min-[400px]:w-auto">{t('auth.signUp')}</Link>
          </div>
        </main>
      </PublicShell>
    );
  }

  if (dashboard.isLoading) {
    return <CustomerShell><LoadingBlock rows={6} /></CustomerShell>;
  }

  if (dashboard.isError) {
    return <CustomerShell><ErrorState message={apiErrorText(dashboard.error, t('affiliate.loadDashboardError'))} retry={() => dashboard.refetch()} /></CustomerShell>;
  }

  const data = dashboard.data;

  if (!data) return null;

  return (
    <CustomerShell>
      <CustomerPageHeader
        title={t('affiliate.program')}
        description={t('customerPortal.subtitle')}
      />

      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="min-w-0 space-y-6 sm:space-y-8">
          {data.programEnabled ? (
            <div className="customer-card p-6 sm:p-8">
              <div>
                <h2 className="text-lg font-semibold mb-1 tracking-tight">{t('affiliate.yourReferralLink')}</h2>
                <p className="text-muted-foreground text-[13px] mb-5">{t('affiliate.referralDescription')}</p>
                <div className="customer-subtle-surface flex min-w-0 items-center gap-2 p-1">
                  <code className="flex-1 min-w-0 px-3 font-mono text-sm truncate" data-testid="text-referral-link">{window.location.origin}{basePath}/?ref={data.referralLinkCode}</code>
                  <button className="button button-primary shrink-0 h-11 sm:h-9 px-4 rounded-lg" type="button" aria-label={t('affiliate.copyReferralLink')} onClick={() => navigator.clipboard.writeText(`${window.location.origin}${basePath}/?ref=${data.referralLinkCode}`)}>
                    <Copy size={16} className="mr-1.5" /> {t('actions.copy')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="customer-card border-amber-500/30 bg-amber-500/5 p-6 sm:p-8" role="status" data-testid="affiliate-program-paused">
              <div className="flex items-start gap-3">
                <ShieldCheck size={22} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Affiliate program paused</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    New referral codes and commission earnings are currently disabled. Referral links are hidden until an owner enables and configures the program.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CustomerStatCard
              title={t('affiliate.totalEarned')}
              value={formatExactUsd(data.totalEarnedUsd)}
              valueTestId="text-total-earned"
            />
            <CustomerStatCard
              title={t('affiliate.referredVolume')}
              value={formatExactUsd(data.referredVolumeUsd)}
              valueTestId="text-referred-volume"
            />
          </div>

          <div className="customer-card overflow-hidden">
            <div className="border-b border-border/40 p-4 sm:p-6">
              <h2 className="font-semibold">{t('affiliate.commissionHistory')}</h2>
            </div>
            <AffiliateCommissionHistory />
          </div>

          <div className="customer-card overflow-hidden">
            <div className="border-b border-border/40 p-4 sm:p-6">
              <h2 className="font-semibold">{t('affiliate.payoutHistory')}</h2>
            </div>
            <AffiliatePayoutHistory />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="customer-card p-4 sm:p-6">
            <h2 className="customer-section-title mb-4 border-b border-border/40 pb-3">{t('affiliate.availableForPayout')}</h2>
            <strong className="mb-4 block break-words font-mono text-3xl text-primary sm:text-4xl" data-testid="text-available-payout">{formatExactUsd(data.availableUsd)}</strong>

            <div className="customer-subtle-surface mb-6 flex flex-col gap-2 p-3 text-[12px] text-muted-foreground">
              <div className="flex min-w-0 justify-between gap-3"><span>{t('affiliate.reserved')}</span><span className="break-all text-right font-mono text-foreground font-semibold">{formatExactUsd(data.reservedUsd)}</span></div>
              <div className="flex min-w-0 justify-between gap-3"><span>{t('affiliate.paidOut')}</span><span className="break-all text-right font-mono text-foreground font-semibold">{formatExactUsd(data.paidUsd)}</span></div>
              <div className="flex min-w-0 justify-between gap-3"><span>{t('affiliate.minimumPayout')}</span><span className="break-all text-right font-mono text-foreground font-semibold">{formatExactUsd(data.minimumPayoutUsd)}</span></div>
            </div>

            {data.programEnabled ? (
              <PayoutRequestForm availableUsd={data.availableUsd} eligible={data.payoutEligible} />
            ) : (
              <div
                className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center"
                role="status"
                data-testid="affiliate-payouts-paused"
              >
                <p className="text-sm font-semibold text-foreground">Payout requests are paused</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Your balance and payout history remain visible. New payout requests will be available when an owner re-enables the affiliate program.
                </p>
              </div>
            )}
          </div>

          <div className="customer-card p-4 sm:p-6">
            <h2 className="customer-section-title mb-4 border-b border-border/40 pb-3">{t('affiliate.referralActivity')}</h2>
            <div className="grid grid-cols-2 gap-4 text-center mb-6">
              <div className="customer-subtle-surface p-3">
                <span className="text-2xl font-mono font-bold text-foreground block mb-1" data-testid="text-active-referrals">{data.activeReferrals}</span>
                <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">{t('affiliate.active')}</span>
              </div>
              <div className="customer-subtle-surface p-3">
                <span className="text-2xl font-mono font-bold text-foreground block mb-1" data-testid="text-total-referrals">{data.totalReferrals}</span>
                <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">{t('affiliate.total')}</span>
              </div>
            </div>
            <AffiliateReferrals />
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}

function PayoutRequestForm({ availableUsd, eligible }: { availableUsd: string; eligible: boolean; }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const networksQuery = useGetAffiliatePayoutNetworks({ query: { queryKey: getGetAffiliatePayoutNetworksQueryKey() } });

  const [form, setForm] = useState({ amountUsd: '', networkId: '', walletAddress: '' });
  const [networkSearch, setNetworkSearch] = useState('');
  const [isNetworkOpen, setIsNetworkOpen] = useState(false);
  const networkTriggerRef = React.useRef<HTMLButtonElement>(null);

  const requestPayout = useRequestAffiliatePayout();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isNetworkOpen) setNetworkSearch('');
  }, [isNetworkOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isGreaterThanExact(form.amountUsd, availableUsd)) {
      setError(t('affiliate.amountExceedsBalance'));
      return;
    }

    if (!form.networkId) {
      setError(t('affiliate.selectNetworkError'));
      return;
    }

    requestPayout.mutate({
      data: {
        amountUsd: form.amountUsd,
        networkId: form.networkId,
        walletAddress: form.walletAddress
      }
    }, {
      onSuccess: () => {
        setSuccess(true);
        setForm({ amountUsd: '', networkId: '', walletAddress: '' });
        queryClient.invalidateQueries({ queryKey: getGetAffiliateDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAffiliateCommissionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAffiliatePayoutHistoryQueryKey() });
      },
      onError: (err) => setError(apiErrorText(err, t('affiliate.requestPayoutError')))
    });
  };

  if (success) {
    return <div className="notice notice-success bg-success/10 border-success/20 text-success p-4 rounded-xl flex items-center gap-3"><Check size={18} className="shrink-0" /><p className="font-semibold text-sm">{t('affiliate.payoutRequested')}</p></div>;
  }

  const networks = networksQuery.data || [];
  const filteredNetworks = networks.filter(n => n.code.toLowerCase().includes(networkSearch.toLowerCase()) || n.name.toLowerCase().includes(networkSearch.toLowerCase()));
  const selectedNetwork = networks.find(n => n.id === form.networkId);

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-5 p-1">
      {error && <div className="notice notice-error bg-destructive/10 border-destructive/20 text-destructive p-4 rounded-xl flex items-center gap-3"><X size={18} className="shrink-0" /><p className="font-semibold text-sm">{error}</p></div>}

      <label className="block space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
           {t('affiliate.amount')} (USDT)
           <button type="button" className="text-primary hover:underline" onClick={() => setForm({...form, amountUsd: availableUsd})}>{t('affiliate.max')}</button>
        </span>
        <div className="relative">
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
            <span className="text-muted-foreground text-xs font-bold tracking-wider">USDT</span>
          </div>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={form.amountUsd}
            onChange={e => setForm({...form, amountUsd: e.target.value})}
            placeholder="0.00"
            className="w-full bg-input/50 border border-border rounded-xl h-12 px-4 pr-16 font-mono text-lg focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            data-testid="input-payout-amount"
          />
        </div>
      </label>

      <div className="block space-y-2 relative">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">{t('affiliate.network')}</span>
        <DialogPrimitive.Root modal={false} open={isNetworkOpen} onOpenChange={setIsNetworkOpen}>
          <DialogPrimitive.Trigger asChild>
            <button
              type="button"
              ref={networkTriggerRef}
              className="w-full bg-input/50 border border-border rounded-xl h-12 px-4 flex items-center justify-between focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              aria-expanded={isNetworkOpen}
              aria-haspopup="dialog"
              data-testid="button-payout-network"
            >
              {selectedNetwork ? (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
                    <Network size={13} aria-hidden="true" />
                  </div>
                  <span className="font-semibold text-sm">{selectedNetwork.code}</span>
                  <span className="text-xs text-muted-foreground truncate">{selectedNetwork.name}</span>
                </div>
              ) : (
                <span className="text-muted-foreground text-sm font-medium">{t('affiliate.selectNetwork')}</span>
              )}
              <ChevronDown size={16} className="text-muted-foreground shrink-0" />
            </button>
          </DialogPrimitive.Trigger>

          {typeof document !== 'undefined' && (
            <UniversalSearchSheet
              open={isNetworkOpen}
              onOpenChange={setIsNetworkOpen}
              title={t('affiliate.selectNetwork')}
              subtitle={t('selectors.optionsAvailable', { count: networks.length })}
              closeLabel={t('selectors.close')}
              searchPlaceholder={t('affiliate.searchNetwork')}
              closeSearchLabel={t('selectors.close')}
              query={networkSearch}
              onQueryChange={setNetworkSearch}
              options={filteredNetworks}
              renderOption={(n) => (
                <span className="convert-option-identity">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm float-left mr-3 mt-0.5">
                    <Network size={15} aria-hidden="true" />
                  </div>
                  <span className="crypto-identity-copy block overflow-hidden pl-1">
                    <span className="crypto-identity-primary block">
                      <strong>{n.code}</strong>
                    </span>
                    <span className="crypto-identity-name block">{n.name}</span>
                  </span>
                </span>
              )}
              onSelectOption={(n) => {
                setForm({...form, networkId: n.id});
              }}
              isSelected={(n) => form.networkId === n.id}
              noOptionsText={networksQuery.isLoading ? t('common.loading') : t('affiliate.noNetworks')}
              testIdBase="payout-network"
              searchTestId="input-payout-network-search"
              triggerRef={networkTriggerRef}
              portalContainer={document.body}
              getOptionId={(n) => n.id}
            />
          )}
        </DialogPrimitive.Root>
      </div>

      <label className="block space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">{t('form.walletAddress')}</span>
        <input
          type="text"
          required
          minLength={10}
          value={form.walletAddress}
          onChange={e => setForm({...form, walletAddress: e.target.value})}
          placeholder={t('affiliate.walletPlaceholder')}
          className="w-full bg-input/50 border border-border rounded-xl h-12 px-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
          data-testid="input-payout-destination"
        />
      </label>

      <button
        type="submit"
        className="button button-primary min-h-[52px] mt-2 rounded-xl text-sm font-bold uppercase tracking-wide shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
        disabled={!eligible || requestPayout.isPending}
        data-testid="button-request-payout"
      >
        {requestPayout.isPending ? t('affiliate.requesting') : t('affiliate.submitPayoutRequest')}
      </button>
      {!eligible && <p className="text-center text-[11px] text-warning bg-warning/10 p-2 rounded-lg mt-1 font-semibold">{t('affiliate.belowMinimum')}</p>}
    </form>
  );
}

function AffiliateCommissionHistory() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, pageSize: AFFILIATE_HISTORY_PAGE_SIZE }), [page]);
  const commissions = useGetAffiliateCommissions(params, { query: { queryKey: getGetAffiliateCommissionsQueryKey(params) } });
  const data = commissions.data || [];

  useEffect(() => {
    if (!commissions.isFetching && page > 1 && data.length === 0) setPage(current => Math.max(1, current - 1));
  }, [commissions.isFetching, data.length, page]);

  if (commissions.isLoading) return <div className="p-6"><LoadingBlock rows={3} /></div>;
  if (commissions.isError) return <div className="p-6"><ErrorState /></div>;

  if (!data.length) {
    return <div className="table-empty border-t-0 rounded-none"><FileText /><p>{t('affiliate.noCommissions')}</p></div>;
  }

  return (
    <div className="w-full relative group">
      <div className="swipeable-scroll-hint" aria-hidden="true" />
      <div className="table-wrap max-h-[400px] overflow-y-auto" onScroll={(e) => {
        const target = e.target as HTMLElement;
        const hint = target.previousElementSibling as HTMLElement;
        if (hint) {
          hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
          hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
        }
      }}>
        <table className="data-table min-w-[580px]">
        <thead>
          <tr>
            <th>{t('affiliate.date')}</th>
            <th>{t('affiliate.type')}</th>
            <th>{t('affiliate.volume')}</th>
            <th className="text-right">{t('affiliate.commission')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map(c => (
            <tr key={c.id} data-testid={`row-commission-${c.id}`}>
              <td className="whitespace-nowrap"><span className="text-[12px] text-muted-foreground">{exactDateTime(c.createdAt)}</span></td>
               <td><span className="text-[13px] font-medium">{c.kind === 'commission' ? t('affiliate.exchange') : t('affiliate.reversal')}</span></td>
              <td><span className="font-mono text-[13px]">{formatExactUsd(c.volumeUsd)}</span></td>
              <td className="text-right"><strong className={cn("font-mono text-[14px]", c.kind === 'commission' ? 'text-success' : 'text-destructive')}>{formatExactUsd((c.kind === 'reversal' && !c.amountUsd.startsWith('-')) ? `-${c.amountUsd}` : c.amountUsd)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      <AffiliateHistoryPagination page={page} pageSize={AFFILIATE_HISTORY_PAGE_SIZE} itemCount={data.length} onPageChange={setPage} testId="commission-page" />
    </div>
  );
}

function AffiliatePayoutHistory() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, pageSize: AFFILIATE_HISTORY_PAGE_SIZE }), [page]);
  const payouts = useGetAffiliatePayoutHistory(params, { query: { queryKey: getGetAffiliatePayoutHistoryQueryKey(params) } });
  const data = payouts.data || [];

  useEffect(() => {
    if (!payouts.isFetching && page > 1 && data.length === 0) setPage(current => Math.max(1, current - 1));
  }, [payouts.isFetching, data.length, page]);

  if (payouts.isLoading) return <div className="p-6"><LoadingBlock rows={2} /></div>;
  if (payouts.isError) return <div className="p-6"><ErrorState /></div>;

  if (!data.length) {
    return <div className="table-empty border-t-0 rounded-none"><HandCoins /><p>{t('affiliate.noPayoutRequests')}</p></div>;
  }

  return (
    <>
      <div className="max-h-[500px] divide-y divide-border/40 overflow-y-auto px-4">
        {data.map(p => {
         const isModern = p.destination && typeof p.destination === 'object' && p.destination.walletAddress;

         return (
          <div key={p.id} className="py-4" data-testid={`row-payout-${p.id}`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                 <strong className="font-mono text-lg text-foreground block leading-none">{formatUsdt(p.amountUsd)}</strong>
                <span className="text-[11px] text-muted-foreground mt-1.5 block">{exactDateTime(p.requestedAt)}</span>
              </div>
              <span className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                p.status === 'requested' ? 'bg-warning/10 text-warning' :
                p.status === 'approved' ? 'bg-info/10 text-info' :
                p.status === 'processing' ? 'bg-primary/10 text-primary' :
                p.status === 'paid' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive'
              )}>{t(`affiliate.status${p.status[0].toUpperCase()}${p.status.slice(1)}`)}</span>
            </div>

            <div className="customer-subtle-surface space-y-2 p-3">
              {isModern ? (
                <>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider w-20 shrink-0">{t('affiliate.network')}</span>
                    <span className="text-sm font-semibold truncate">{p.destination.networkCode || p.destination.networkName}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider w-20 shrink-0">{t('affiliate.wallet')}</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-mono truncate bg-background px-2 py-0.5 rounded border border-border">{p.destination.walletAddress}</span>
                      <button onClick={() => navigator.clipboard.writeText(p.destination.walletAddress || '')} className="text-muted-foreground hover:text-foreground p-2 sm:p-1 -mr-1" title={t('affiliate.copyWalletAddress')}><Copy size={16} className="sm:scale-75" /></button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-start gap-4">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider w-20 shrink-0 mt-0.5">{t('affiliate.details')}</span>
                  <span className="text-xs text-right break-words flex-1">
                    {'instructions' in p.destination ? String(p.destination.instructions) : t('affiliate.legacyPayout')}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center gap-4 pt-2 mt-2 border-t border-border/50">
                 <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider w-20 shrink-0">{t('affiliate.requested')}</span>
                 <span className="text-xs text-foreground font-medium">{exactDateTime(p.requestedAt)}</span>
              </div>
              {p.decidedAt && (
                <div className="flex justify-between items-center gap-4">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider w-20 shrink-0">{p.status === 'rejected' ? t('affiliate.statusRejected') : t('affiliate.statusApproved')}</span>
                   <span className="text-xs text-foreground font-medium">{exactDateTime(p.decidedAt)}</span>
                </div>
              )}
              {p.paidAt && (
                <div className="flex justify-between items-center gap-4">
                   <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider w-20 shrink-0">{t('affiliate.statusPaid')}</span>
                   <span className="text-xs text-foreground font-medium">{exactDateTime(p.paidAt)}</span>
              </div>
              )}

              {p.txid && (
                <div className="flex justify-between items-center gap-4 pt-2 mt-2 border-t border-border/50">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider w-20 shrink-0">TXID</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-mono truncate text-success">{p.txid}</span>
                    <button onClick={() => navigator.clipboard.writeText(p.txid!)} className="text-muted-foreground hover:text-foreground p-2 sm:p-1 -mr-1" title={t('affiliate.copyTxid')}><Copy size={16} className="sm:scale-75" /></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
        })}
      </div>
      <AffiliateHistoryPagination page={page} pageSize={AFFILIATE_HISTORY_PAGE_SIZE} itemCount={data.length} onPageChange={setPage} testId="payout-history-page" />
    </>
  );
}

function AffiliateReferrals() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, pageSize: AFFILIATE_HISTORY_PAGE_SIZE }), [page]);
  const referrals = useGetAffiliateReferrals(params, { query: { queryKey: getGetAffiliateReferralsQueryKey(params) } });
  const data = referrals.data || [];

  useEffect(() => {
    if (!referrals.isFetching && page > 1 && data.length === 0) setPage(current => Math.max(1, current - 1));
  }, [referrals.isFetching, data.length, page]);

  if (referrals.isLoading) return <LoadingBlock rows={2} />;
  if (referrals.isError) return <ErrorState />;

  if (!data.length) return <div className="text-center text-[13px] text-muted-foreground p-4 bg-muted/20 rounded-xl">{t('affiliate.noReferrals')}</div>;

  return (
    <>
      <div className="max-h-[300px] divide-y divide-border/40 overflow-y-auto">
        {data.map((r, i) => (
          <div key={`${r.joinedAt}-${i}`} className="flex min-w-0 flex-col items-start justify-between gap-2 py-3 min-[380px]:flex-row min-[380px]:items-center">
            <span className="text-[12px] text-muted-foreground">{exactDateTime(r.joinedAt)}</span>
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", r.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{r.status === 'active' ? t('affiliate.active') : t('affiliate.inactive')}</span>
          </div>
        ))}
      </div>
      <AffiliateHistoryPagination page={page} pageSize={AFFILIATE_HISTORY_PAGE_SIZE} itemCount={data.length} onPageChange={setPage} testId="referrals-page" />
    </>
  );
}

type AffiliateStatusFilter = 'all' | 'bound' | 'unbound';
type AffiliatePeriod = 7 | 30 | 90;

function compactAffiliateCode(code: string) {
  return code.length > 13 ? `${code.slice(0, 5)}…${code.slice(-4)}` : code;
}

function affiliatePagination(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => String(index + 1));
  const visible = Array.from(new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]))
    .filter(pageNumber => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((left, right) => left - right);
  const items: string[] = [];
  visible.forEach((pageNumber, index) => {
    const previous = visible[index - 1];
    if (previous && pageNumber - previous > 1) items.push(`ellipsis-${previous}`);
    items.push(String(pageNumber));
  });
  return items;
}

export function AdminAffiliatesOverviewPage() {
  const { t, formatNumber, formatDate } = useI18n();

  useEffect(() => {
    document.body.classList.add('affiliates-page-active');
    return () => document.body.classList.remove('affiliates-page-active');
  }, []);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchCode, setSearchCode] = useState('');
  const [statusFilter, setStatusFilter] = useState<AffiliateStatusFilter>('all');
  const [period, setPeriod] = useState<AffiliatePeriod>(30);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [referralLinkCopied, setReferralLinkCopied] = useState(false);
  const overview = useGetAffiliateOverview({ query: { queryKey: getGetAffiliateOverviewQueryKey() } });
  const accountParams = useMemo(() => ({
    page,
    pageSize,
    search: searchCode || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  }), [page, pageSize, searchCode, statusFilter]);
  const accounts = useGetAffiliateAccounts(accountParams, { query: { queryKey: getGetAffiliateAccountsQueryKey(accountParams) } });
  const chartData = useMemo(() => {
    const counts = new Map((overview.data?.growth ?? []).map(point => [point.date, point.count]));
    return Array.from({ length: period }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (period - index - 1));
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        label: formatDate(date, period === 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }),
        affiliates: counts.get(key) ?? 0,
      };
    });
  }, [overview.data?.growth, period]);
  const totalPages = Math.max(1, Math.ceil((accounts.data?.total ?? 0) / pageSize));
  const pagination = affiliatePagination(page, totalPages);
  const visibleIds = accounts.data?.items.map(account => account.id) ?? [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedAccounts.has(id));

  const toggleVisibleAccounts = () => {
    setSelectedAccounts(current => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleAccount = (id: string) => {
    setSelectedAccounts(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refreshDashboard = () => {
    void Promise.all([overview.refetch(), accounts.refetch()]);
  };

  const goToInvite = () => {
    document.getElementById('invite-affiliates')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const generateReferralLink = async () => {
    const onboardingUrl = `${window.location.origin}${basePath}/account/affiliate`;
    await navigator.clipboard.writeText(onboardingUrl);
    setReferralLinkCopied(true);
    window.setTimeout(() => setReferralLinkCopied(false), 2400);
  };

  return (
    <AdminShell
      title={t('affiliate.program')}
      eyebrow={t('affiliate.adminEyebrow')}
      subtitle={t('affiliate.adminSubtitle')}
      requiredPermission="affiliates.view"
      affiliateHeaderMode
    >
      <div className="affiliate-redesign">
        <div className="affiliate-page-actions affiliate-header-actions-inner">
          <Link href="/admin/affiliate-payouts" className="button button-secondary affiliate-header-button" data-testid="link-view-affiliate-payouts">
            <HandCoins size={15} /> <span>{t('affiliate.viewPayouts')}</span>
          </Link>
          <button type="button" className="button button-primary affiliate-header-button" onClick={goToInvite} data-testid="button-add-affiliate">
            <Plus size={15} /> <span>{t('affiliate.addAffiliate')}</span>
          </button>
        </div>

        <section className="affiliate-metrics" aria-label={t('affiliate.summaryAria')}>
          <div className="affiliate-metric-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('affiliate.activeAffiliates')}</span>
              <div className="affiliate-metric-icon affiliate-metric-icon-violet"><UserCheck size={15} /></div>
            </div>
            {overview.isLoading ? <LoadingBlock rows={1} /> : (
              <strong className="text-2xl sm:text-3xl font-mono block" data-testid="stat-affiliates">{overview.data?.activeAffiliates ?? '—'}</strong>
            )}
          </div>
          <div className="affiliate-metric-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('affiliate.ledgerEntries')}</span>
              <div className="affiliate-metric-icon affiliate-metric-icon-blue"><FileText size={15} /></div>
            </div>
            {overview.isLoading ? <LoadingBlock rows={1} /> : (
              <strong className="text-2xl sm:text-3xl font-mono block" data-testid="stat-ledger">{overview.data?.ledgerEntries ?? '—'}</strong>
            )}
          </div>
          <div className="affiliate-metric-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('affiliate.netCommission')}</span>
              <div className="affiliate-metric-icon affiliate-metric-icon-green"><DollarSign size={15} /></div>
            </div>
            {overview.isLoading ? <LoadingBlock rows={1} /> : (
              <strong className="text-2xl sm:text-3xl font-mono block text-success" data-testid="stat-net">{formatExactUsd(overview.data?.netCommissionUsd)}</strong>
            )}
          </div>
          <div className="affiliate-metric-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('affiliate.reservedPayouts')}</span>
              <div className="affiliate-metric-icon affiliate-metric-icon-amber"><HandCoins size={15} /></div>
            </div>
            {overview.isLoading ? <LoadingBlock rows={1} /> : (
              <strong className="text-2xl sm:text-3xl font-mono block" data-testid="stat-reserved">{formatExactUsd(overview.data?.reservedPayoutUsd)}</strong>
            )}
          </div>
        </section>

        <section className="affiliate-analytics-grid">
          <article className="affiliate-panel affiliate-growth-panel">
            <div className="affiliate-panel-heading">
              <div>
                <div className="affiliate-title-row"><TrendingUp size={17} /><h2>{t('affiliate.growth')}</h2></div>
                <p>{t('affiliate.growthDescription')}</p>
              </div>
              <div className="affiliate-period-filter" role="group" aria-label={t('affiliate.growthPeriod')}>
                {([7, 30, 90] as AffiliatePeriod[]).map(days => (
                  <button
                    type="button"
                    className={period === days ? 'active' : ''}
                    aria-pressed={period === days}
                    onClick={() => setPeriod(days)}
                    data-testid={`button-growth-${days}`}
                    key={days}
                  >
                    {t('affiliate.days', { count: days })}
                  </button>
                ))}
              </div>
            </div>
            <div className="affiliate-chart" data-testid="chart-affiliate-growth">
              {overview.isLoading ? <LoadingBlock rows={5} /> : (
                <React.Suspense fallback={<LoadingBlock rows={5} />}>
                  <AffiliateGrowthChart data={chartData} />
                </React.Suspense>
              )}
            </div>
          </article>

          <article className="affiliate-panel affiliate-ranking-panel">
            <div className="affiliate-panel-heading">
              <div>
                <div className="affiliate-title-row"><Trophy size={17} /><h2>{t('affiliate.topAffiliates')}</h2></div>
                <p>{t('affiliate.rankedByCommission')}</p>
              </div>
            </div>
             <div className="affiliate-ranking-labels"><span>{t('affiliate.rankAffiliate')}</span><span>{t('affiliate.performance')}</span></div>
            <div className="affiliate-ranking-list">
              {overview.isLoading ? <LoadingBlock rows={5} /> : overview.data?.topAffiliates.length ? overview.data.topAffiliates.map((affiliate, index) => (
                <Link href={`/admin/affiliates/${affiliate.id}`} className="affiliate-ranking-row" key={affiliate.id} data-testid={`link-top-affiliate-${affiliate.id}`}>
                  <span className={`affiliate-rank affiliate-rank-${index + 1}`}>{index + 1}</span>
                  <span className="affiliate-ranking-code" title={affiliate.code}>{compactAffiliateCode(affiliate.code)}</span>
                  <span className="affiliate-ranking-performance">
                    <strong>{formatExactUsd(affiliate.commissionUsd)}</strong>
                     <small>{t('affiliate.usersCount', { count: formatNumber(affiliate.referredUsers) })}</small>
                  </span>
                </Link>
               )) : <div className="affiliate-empty-compact"><Trophy size={22} /><span>{t('affiliate.noPerformance')}</span></div>}
            </div>
            <button type="button" className="affiliate-view-all" onClick={() => document.getElementById('affiliate-accounts')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-view-all-affiliates">
              {t('affiliate.viewAll')} <ChevronRight size={14} />
            </button>
          </article>
        </section>

        <section className="affiliate-panel affiliate-directory" id="affiliate-accounts">
          <div className="affiliate-directory-heading">
            <div>
               <div className="affiliate-title-row"><Network size={17} /><h2>{t('affiliate.affiliateAccounts')}</h2></div>
              <p>{t('affiliate.accountsInDirectory', { count: accounts.data?.total.toLocaleString() ?? '—' })}</p>
            </div>
            <div className="affiliate-directory-controls">
              <div className="flex-1 min-w-[200px]">
                <AdminSearch
                  value={searchCode}
                  onChange={v => { setSearchCode(v); setPage(1); setSelectedAccounts(new Set()); }}
                  placeholder={t('affiliate.searchByCode')}
                  debounceMs={300}
                  testId="input-search-affiliates"
                />
              </div>
              <label className="affiliate-status-select">
                <span className="sr-only">{t('affiliate.filterStatus')}</span>
                <select value={statusFilter} onChange={event => { setStatusFilter(event.target.value as AffiliateStatusFilter); setPage(1); setSelectedAccounts(new Set()); }} data-testid="select-affiliate-status">
                  <option value="all">{t('affiliate.allStatuses')}</option>
                  <option value="bound">{t('affiliate.statusBound')}</option>
                  <option value="unbound">{t('affiliate.statusUnbound')}</option>
                </select>
              </label>
              <button type="button" className="affiliate-refresh-button" onClick={refreshDashboard} disabled={accounts.isFetching || overview.isFetching} data-testid="button-refresh-affiliates">
                <RefreshCw size={15} className={accounts.isFetching || overview.isFetching ? 'spin' : ''} />
                <span>{t('actions.refresh')}</span>
              </button>
            </div>
          </div>

          {accounts.isLoading ? <div className="affiliate-loading"><LoadingBlock rows={6} /></div> : accounts.isError ? <div className="affiliate-loading"><ErrorState message={apiErrorText(accounts.error, t('affiliate.loadAccountsError'))} retry={() => accounts.refetch()} /></div> : (
            <>
              <div className="w-full relative group">
                <div className="swipeable-scroll-hint" aria-hidden="true" />
                <div className="affiliate-table-wrap" onScroll={(e) => {
                  const target = e.target as HTMLElement;
                  const hint = target.previousElementSibling as HTMLElement;
                  if (hint) {
                    hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
                    hint.style.pointerEvents = target.scrollLeft > 10 ? 'none' : 'auto';
                  }
                }}>
                  <table className="affiliate-table">
                  <thead>
                    <tr>
                      <th className="affiliate-select-column"><input type="checkbox" aria-label={t('affiliate.selectAllPage')} checked={allVisibleSelected} onChange={toggleVisibleAccounts} data-testid="checkbox-affiliates-page" /></th>
                      <th>{t('affiliate.code')}</th>
                      <th>{t('affiliate.joined')}</th>
                      <th>{t('affiliate.status')}</th>
                      <th>{t('affiliate.users')}</th>
                      <th>{t('affiliate.commission')}</th>
                      <th className="text-right">{t('affiliate.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.data?.items.map(account => (
                      <tr key={account.id} data-testid={`row-account-${account.id}`}>
                        <td className="affiliate-select-column"><input type="checkbox" aria-label={t('affiliate.selectAffiliate', { code: account.code })} checked={selectedAccounts.has(account.id)} onChange={() => toggleAccount(account.id)} data-testid={`checkbox-affiliate-${account.id}`} /></td>
                        <td><Link href={`/admin/affiliates/${account.id}`} className="affiliate-code-link">{account.code}</Link></td>
                        <td><span className="affiliate-date">{exactDateTime(account.createdAt)}</span></td>
                        <td><span className={`affiliate-status affiliate-status-${account.status}`}>{account.status === 'bound' ? t('affiliate.statusBound') : t('affiliate.statusUnbound')}</span></td>
                        <td><strong className="affiliate-users">{account.referredUsers.toLocaleString()}</strong></td>
                        <td><strong className="affiliate-commission">{formatExactUsd(account.commissionUsd)}</strong></td>
                        <td>
                          <div className="affiliate-row-actions">
                            <Link href={`/admin/affiliates/${account.id}`} className="affiliate-icon-action" aria-label={t('affiliate.viewAccount')} title={t('affiliate.viewAffiliate')} data-testid={`link-view-affiliate-${account.id}`}><Eye size={15} /></Link>
                            <details className="affiliate-more-menu">
                              <summary aria-label={t('affiliate.moreActions', { code: account.code })} data-testid={`button-more-affiliate-${account.id}`}><MoreVertical size={15} /></summary>
                              <div><Link href={`/admin/affiliates/${account.id}`}><Eye size={14} /> {t('affiliate.viewAccount')}</Link><Link href="/admin/affiliate-payouts"><HandCoins size={14} /> {t('affiliate.viewPayouts')}</Link></div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

              {!accounts.data?.items.length && (
                <div className="affiliate-empty">
                  <Users size={28} />
                  <strong>{t('affiliate.noAccounts')}</strong>
                  <span>{t('affiliate.noAccountsHint')}</span>
                </div>
              )}

              <div className="affiliate-pagination">
                <span>{t('affiliate.showingRange', { start: accounts.data?.total ? ((page - 1) * pageSize) + 1 : 0, end: Math.min(page * pageSize, accounts.data?.total ?? 0), total: accounts.data?.total ?? 0 })}</span>
                <nav aria-label={t('affiliate.accountPagination')}>
                  <button type="button" aria-label={t('affiliate.previousPage')} disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))} data-testid="button-affiliate-page-previous">‹</button>
                  {pagination.map(item => item.startsWith('ellipsis') ? <span className="affiliate-page-ellipsis" key={item}>…</span> : (
                    <button type="button" className={page === Number(item) ? 'active' : ''} aria-current={page === Number(item) ? 'page' : undefined} onClick={() => setPage(Number(item))} key={item} data-testid={`button-affiliate-page-${item}`}>{item}</button>
                  ))}
                  <button type="button" aria-label={t('affiliate.nextPage')} disabled={page >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))} data-testid="button-affiliate-page-next">›</button>
                </nav>
                <label>
                  <span className="sr-only">{t('affiliate.perPageLabel')}</span>
                  <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); setSelectedAccounts(new Set()); }} data-testid="select-affiliates-page-size">
                    <option value={10}>{t('affiliate.perPage', { count: 10 })}</option>
                    <option value={25}>{t('affiliate.perPage', { count: 25 })}</option>
                    <option value={50}>{t('affiliate.perPage', { count: 50 })}</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </section>

        <section className="affiliate-invite-card" id="invite-affiliates">
          <div className="affiliate-invite-icon"><Link2 size={22} /></div>
          <div><h2>{t('affiliate.inviteAffiliates')}</h2><p>{t('affiliate.inviteDescription')}</p></div>
          <button type="button" className="affiliate-primary-btn affiliate-invite-button" onClick={generateReferralLink} data-testid="button-generate-referral-link">
            {referralLinkCopied ? <><Check size={16} /> {t('affiliate.linkCopied')}</> : <><Link2 size={16} /> {t('affiliate.generateReferralLink')}</>}
          </button>
        </section>
      </div>
    </AdminShell>
  );
}

export function AdminAffiliateDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, pageSize: AFFILIATE_HISTORY_PAGE_SIZE }), [page]);
  const accountQuery = useGetAffiliateAccount(id!, params, { query: { queryKey: getGetAffiliateAccountQueryKey(id!, params), enabled: !!id } });
  const commissions = accountQuery.data?.commissions ?? [];

  useEffect(() => {
    if (!accountQuery.isFetching && page > 1 && accountQuery.data && commissions.length === 0) {
      setPage(current => Math.max(1, current - 1));
    }
  }, [accountQuery.data, accountQuery.isFetching, commissions.length, page]);

  if (accountQuery.isLoading) return <AdminShell title={t('affiliate.accountDetails')} eyebrow={t('affiliate.adminEyebrow')} requiredPermission="affiliates.view"><LoadingBlock rows={6} /></AdminShell>;
  if (accountQuery.isError || !accountQuery.data) return <AdminShell title={t('affiliate.accountDetails')} eyebrow={t('affiliate.adminEyebrow')} requiredPermission="affiliates.view"><ErrorState message={t('affiliate.loadAccountError')} /></AdminShell>;

  const account = accountQuery.data;

  return (
    <AdminShell
      title={t('affiliate.accountTitle', { code: account.code })}
      eyebrow={t('affiliate.adminEyebrow')}
      requiredPermission="affiliates.view"
      action={<Link href="/admin/affiliates" className="button button-secondary w-full sm:w-auto">{t('affiliate.backToDirectory')}</Link>}
    >
      <div className="card-panel mb-6 mt-4 grid grid-cols-1 gap-5 p-4 min-[420px]:grid-cols-2 sm:p-6 md:mb-8 xl:grid-cols-4 xl:gap-6">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t('affiliate.internalId')}</span>
          <span className="font-mono text-[12px] break-all">{account.id}</span>
        </div>
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t('affiliate.created')}</span>
          <span className="text-[13px]">{exactDateTime(account.createdAt)}</span>
        </div>
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t('affiliate.boundToUser')}</span>
          <span className="text-[13px]">{account.referrerBoundAt ? exactDateTime(account.referrerBoundAt) : t('common.no')}</span>
        </div>
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t('affiliate.ledgerEntries')}</span>
          <span className="font-mono text-[14px] font-semibold">{account.commissions.length}</span>
        </div>
      </div>

      <div className="card-panel">
        <div className="panel-heading mb-4 px-4 pt-5 sm:px-6 sm:pt-6">
          <h2>{t('affiliate.immutableLedger')}</h2>
        </div>
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
            <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                 <th>{t('affiliate.date')}</th>
                 <th>{t('affiliate.eventId')}</th>
                 <th>{t('affiliate.type')}</th>
                 <th>{t('affiliate.volume')} (USD)</th>
                 <th>{t('affiliate.rate')}</th>
                 <th className="text-right">{t('affiliate.commission')} (USD)</th>
              </tr>
            </thead>
            <tbody>
              {account.commissions.map(c => (
                <tr key={c.id} data-testid={`row-ledger-${c.id}`}>
                  <td className="whitespace-nowrap"><span className="text-[12px] text-muted-foreground">{exactDateTime(c.createdAt)}</span></td>
                  <td><span className="block max-w-[240px] break-all font-mono text-[11px] text-muted-foreground">{c.aggregateId}</span></td>
                  <td><span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", c.kind === 'commission' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{c.kind === 'commission' ? t('affiliate.commission') : t('affiliate.reversal')}</span></td>
                  <td><span className="font-mono text-[13px]">{formatExactUsd(c.volumeUsd)}</span></td>
                  <td><span className="font-mono text-[12px] text-muted-foreground">{c.rate}</span></td>
                  <td className="text-right"><strong className={cn("font-mono text-[14px]", c.kind === 'commission' ? 'text-success' : 'text-destructive')}>{formatExactUsd((c.kind === 'reversal' && !c.amountUsd.startsWith('-')) ? `-${c.amountUsd}` : c.amountUsd)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!account.commissions.length && <div className="table-empty border-t-0 rounded-none"><FileText /><p>{t('affiliate.noLedgerEntries')}</p></div>}
        </div>
        </div>
        <AffiliateHistoryPagination page={page} pageSize={AFFILIATE_HISTORY_PAGE_SIZE} itemCount={account.commissions.length} onPageChange={setPage} testId="ledger-page" />
      </div>
    </AdminShell>
  );
}

export function AdminAffiliatePayoutsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, pageSize: AFFILIATE_HISTORY_PAGE_SIZE }), [page]);
  const queue = useGetAffiliatePayoutQueue(params, { query: { queryKey: getGetAffiliatePayoutQueueQueryKey(params) } });
  const transition = useTransitionAffiliatePayout();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState('');
  const [transitionSuccess, setTransitionSuccess] = useState('');
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [txidInput, setTxidInput] = useState('');
  const [selectedPayout, setSelectedPayout] = useState<AffiliatePayout | null>(null);
  const payouts = queue.data ?? [];

  useEffect(() => {
    if (!queue.isFetching && page > 1 && payouts.length === 0) setPage(current => Math.max(1, current - 1));
  }, [page, payouts.length, queue.isFetching]);

  const handleTransition = async (id: string, status: 'approved' | 'rejected' | 'processing' | 'paid', txid?: string) => {
    setProcessingId(id);
    setTransitionError('');
    setTransitionSuccess('');
    transition.mutate({ id, data: { status, txid } }, {
      onSuccess: updated => {
        queryClient.invalidateQueries({ queryKey: getGetAffiliatePayoutQueueQueryKey() });
        setSelectedPayout(current => current?.id === updated.id ? updated : current);
        setProcessingId(null);
        if (status === 'paid') setMarkPaidId(null);
        setTransitionSuccess(t('affiliate.payoutMarked', { status: t(`affiliate.status${status[0].toUpperCase()}${status.slice(1)}`) }));
      },
      onError: (err) => {
        setProcessingId(null);
        setTransitionError(apiErrorText(err, t('affiliate.transitionPayoutError')));
      }
    });
  };

  return (
    <AdminShell title={t('affiliate.payoutQueue')} eyebrow={t('affiliate.adminEyebrow')} requiredPermission="affiliates.view">
      <div className="notice notice-warning mb-6 mt-4 min-w-0 sm:mb-8">
        <ShieldCheck size={20} />
        <div className="min-w-0">
          <strong>{t('affiliate.manualTransmissionRequired')}</strong>
          <p className="mt-1">{t('affiliate.manualTransmissionDescription')}</p>
        </div>
      </div>

      {transitionError && <div className="notice notice-error mb-4"><X size={16} />{transitionError}</div>}
      {transitionSuccess && <div className="notice notice-success mb-4"><Check size={16} />{transitionSuccess}</div>}

      <div className="card-panel">
        {queue.isLoading ? <div className="p-6"><LoadingBlock rows={4} /></div> : queue.isError ? <div className="p-6"><ErrorState /></div> : (
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
              <table className="data-table payout-queue-table min-w-[1100px]">
              <thead>
                <tr>
                  <th>{t('affiliate.requestId')}</th><th>{t('affiliate.requested')}</th><th>{t('affiliate.affiliate')}</th><th>{t('form.walletAddress')}</th><th>{t('affiliate.network')}</th><th>{t('affiliate.amount')} (USDT)</th><th>{t('affiliate.status')}</th><th>{t('affiliate.approvedBy')}</th><th className="text-right min-w-[200px]">{t('affiliate.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {queue.data?.map(payout => {
                  const isModern = payout.destination && typeof payout.destination === 'object' && payout.destination.walletAddress;
                  return (
                    <tr key={payout.id} data-testid={`row-payout-${payout.id}`}>
                      <td><span className="font-mono text-[11px] text-muted-foreground">{shortId(payout.id)}</span></td>
                      <td className="whitespace-nowrap"><span className="text-[12px]">{exactDateTime(payout.requestedAt)}</span></td>
                      <td><Link href={`/admin/affiliates/${payout.affiliateAccountId}`} className="block max-w-[120px] truncate font-mono text-[12px] text-primary" title={payout.affiliateAccountId}>{shortId(payout.affiliateAccountId)}</Link></td>

                      {isModern ? (
                        <>
                          <td>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="block max-w-[140px] truncate font-mono text-[11px]" title={payout.destination.walletAddress}>{payout.destination.walletAddress}</span>
                               <button onClick={() => navigator.clipboard.writeText(payout.destination.walletAddress!)} className="text-muted-foreground hover:text-foreground shrink-0" title={t('affiliate.copyWallet')}><Copy size={12} /></button>
                            </div>
                            {payout.txid && (
                              <div className="flex items-center gap-2 min-w-0 mt-1">
                                <span className="text-[10px] font-bold text-muted-foreground">TXID:</span>
                                <span className="block max-w-[100px] truncate font-mono text-[11px] text-success" title={payout.txid}>{payout.txid}</span>
                                 <button onClick={() => navigator.clipboard.writeText(payout.txid!)} className="text-muted-foreground hover:text-foreground shrink-0" title={t('affiliate.copyTxid')}><Copy size={12} /></button>
                              </div>
                            )}
                          </td>
                          <td><span className="text-[12px] font-semibold">{payout.destination.networkCode || payout.destination.networkName}</span></td>
                        </>
                      ) : (
                        <>
                           <td><span className="text-[11px] text-muted-foreground">{t('common.unavailable')}</span></td>
                          <td><span className="text-[11px] text-muted-foreground">—</span></td>
                        </>
                      )}

                      <td><strong className="font-mono text-[14px] text-foreground">{formatUsdt(payout.amountUsd)}</strong></td>
                      <td>
                        <span className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                          payout.status === 'requested' ? 'bg-warning/10 text-warning' :
                          payout.status === 'approved' ? 'bg-info/10 text-info' :
                          payout.status === 'processing' ? 'bg-primary/10 text-primary' :
                          payout.status === 'paid' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                        )}>{t(`affiliate.status${payout.status[0].toUpperCase()}${payout.status.slice(1)}`)}</span>
                      </td>
                      <td><span className="text-[11px] text-muted-foreground">{payout.decidedBy ? shortId(payout.decidedBy) : '—'}</span></td>
                      <td className="text-right">
                        {markPaidId === payout.id ? (
                          <div className="flex flex-col gap-2 items-end">
                            <input
                              type="text"
                              placeholder={t('affiliate.enterTxid')}
                              className="text-xs bg-input/50 border border-border rounded px-2 py-1.5 font-mono w-[180px] focus:border-primary focus:ring-1 focus:ring-primary"
                              value={txidInput}
                              onChange={e => setTxidInput(e.target.value)}
                              autoFocus
                              data-testid={`input-txid-${payout.id}`}
                            />
                            <div className="flex gap-2">
                               <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => setMarkPaidId(null)}>{t('actions.cancel')}</button>
                               <button type="button" className="button button-primary py-1 px-3 text-[11px]" disabled={processingId === payout.id || !txidInput.trim()} onClick={() => handleTransition(payout.id, 'paid', txidInput)} data-testid={`btn-submit-txid-${payout.id}`}>{t('affiliate.submitTxid')}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-2">
                             <button type="button" className="button button-secondary py-1 px-3 text-[12px]" onClick={() => setSelectedPayout(payout)} data-testid={`btn-view-payout-${payout.id}`}>{t('actions.viewDetails')}</button>
                            {payout.status === 'requested' && (
                              <>
                                 <button type="button" className="button button-primary py-1 px-3 text-[12px]" disabled={processingId === payout.id} onClick={() => handleTransition(payout.id, 'approved')} data-testid={`btn-approve-${payout.id}`}>{t('affiliate.approve')}</button>
                                 <button type="button" className="button button-danger py-1 px-3 text-[12px]" disabled={processingId === payout.id} onClick={() => handleTransition(payout.id, 'rejected')} data-testid={`btn-reject-${payout.id}`}>{t('affiliate.reject')}</button>
                              </>
                            )}
                            {payout.status === 'approved' && (
                               <button type="button" className="button button-secondary py-1 px-3 text-[12px]" disabled={processingId === payout.id} onClick={() => handleTransition(payout.id, 'processing')} data-testid={`btn-process-${payout.id}`}>{t('affiliate.startProcessing')}</button>
                            )}
                            {payout.status === 'processing' && (
                               <button type="button" className="button button-primary py-1 px-3 text-[12px]" disabled={processingId === payout.id} onClick={() => { setMarkPaidId(payout.id); setTxidInput(''); }} data-testid={`btn-paid-${payout.id}`}>{t('affiliate.markPaid')}</button>
                            )}
                            <div className="w-full flex justify-end mt-1">
                              {payout.status === 'paid' && payout.paidAt ? (
                                 <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t('affiliate.paidAt', { date: exactDateTime(payout.paidAt) })}</span>
                              ) : payout.status === 'rejected' && payout.decidedAt ? (
                                 <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t('affiliate.rejectedAt', { date: exactDateTime(payout.decidedAt) })}</span>
                              ) : payout.status === 'processing' && payout.decidedAt ? (
                                 <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t('affiliate.approvedAt', { date: exactDateTime(payout.decidedAt) })}</span>
                              ) : payout.status === 'approved' && payout.decidedAt ? (
                                 <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t('affiliate.approvedAt', { date: exactDateTime(payout.decidedAt) })}</span>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!queue.data?.length && <div className="table-empty border-t-0 rounded-none"><HandCoins /><p>{t('affiliate.noPendingPayouts')}</p></div>}
          </div>
          </div>
        )}
        <AffiliateHistoryPagination page={page} pageSize={AFFILIATE_HISTORY_PAGE_SIZE} itemCount={payouts.length} onPageChange={setPage} testId="payout-queue-page" />
      </div>
      {selectedPayout && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/55 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedPayout(null); }}>
          <section className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="affiliate-payout-details-title" data-testid="payout-details">
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t('affiliate.affiliatePayout')}</p>
                <h2 id="affiliate-payout-details-title" className="mt-1 text-xl font-bold">{t('affiliate.payoutDetails')}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedPayout.id}</p>
              </div>
              <button type="button" className="affiliate-icon-action" aria-label={t('affiliate.closePayoutDetails')} onClick={() => setSelectedPayout(null)}><X size={17} /></button>
            </header>
            {(() => {
              const destination = selectedPayout.destination;
              const wallet = destination.walletAddress;
              const network = destination.networkCode || destination.networkName;
              const detailRows = [
                [t('affiliate.amount'), formatUsdt(selectedPayout.amountUsd)],
                [t('affiliate.network'), network || t('common.unavailable')],
                [t('affiliate.requestedAt'), exactDateTime(selectedPayout.requestedAt)],
                [t('affiliate.approvedAtLabel'), selectedPayout.decidedAt ? exactDateTime(selectedPayout.decidedAt) : '—'],
                [t('affiliate.paidAtLabel'), selectedPayout.paidAt ? exactDateTime(selectedPayout.paidAt) : '—'],
                [t('affiliate.status'), t(`affiliate.status${selectedPayout.status[0].toUpperCase()}${selectedPayout.status.slice(1)}`)],
                [t('affiliate.approvedBy'), selectedPayout.decidedBy ? shortId(selectedPayout.decidedBy) : '—'],
              ];
              return (
                <div className="space-y-5">
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    {detailRows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-5 border-b border-border/60 py-3 first:pt-0 last:border-0 last:pb-0"><span className="text-xs text-muted-foreground">{label}</span><strong className="text-right text-sm">{value}</strong></div>)}
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <CopyDetail label={t('affiliate.walletAddress')} value={wallet || t('common.unavailable')} copyable={Boolean(wallet)} />
                    <CopyDetail label={t('affiliate.transactionHash')} value={selectedPayout.txid || t('affiliate.notRecorded')} copyable={Boolean(selectedPayout.txid)} />
                  </div>
                </div>
              );
            })()}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function CopyDetail({ label, value, copyable }: { label: string; value: string; copyable: boolean }) {
  const { t } = useI18n();
  return (
    <div className="border-b border-border/60 py-3 first:pt-0 last:border-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all text-xs text-foreground">{value}</code>
        {copyable && <button type="button" className="affiliate-icon-action shrink-0" aria-label={t('affiliate.copyValue', { label })} onClick={() => navigator.clipboard.writeText(value)}><Copy size={14} /></button>}
      </div>
    </div>
  );
}

export function AdminAffiliateSettingsPage() {
  const { t } = useI18n();
  return (
    <AdminShell
      title={t('affiliate.programSettings')}
      eyebrow={t('affiliate.adminEyebrow')}
      subtitle={t('affiliate.settingsSubtitle')}
      requiredPermission="affiliates.manage"
    >
      <div className="mt-4 flex flex-col gap-8 max-w-[1440px]">
        <AffiliateProgramSettingsCard />
          <AffiliateValuationQueue />
          <AffiliateHelpCard />
      </div>
    </AdminShell>
  );
}

const normalizeDec = (v?: string | null) => {
  if (!v) return '';
  if (!v.includes('.')) return v;
  const s = v.replace(/0+$/, '');
  return s.endsWith('.') ? s.slice(0, -1) : s;
};

function AffiliateProgramSettingsCard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const settingsQuery = useGetAffiliateSettings({ query: { queryKey: getGetAffiliateSettingsQueryKey() } });
  const createSettings = useCreateAffiliateSettingsVersion();

  const [form, setForm] = useState<Partial<AffiliateSettings>>({});
  const [isModified, setIsModified] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm({
        ...settingsQuery.data,
        commissionRate: normalizeDec(settingsQuery.data.commissionRate),
        minimumEligibleUsd: normalizeDec(settingsQuery.data.minimumEligibleUsd),
        payoutMinimumUsd: normalizeDec(settingsQuery.data.payoutMinimumUsd),
        transactionCapUsd: normalizeDec(settingsQuery.data.transactionCapUsd)
      });
      setIsModified(false);
    }
  }, [settingsQuery.data]);

  const handleReset = () => {
    if (settingsQuery.data) {
      setForm({
        ...settingsQuery.data,
        commissionRate: normalizeDec(settingsQuery.data.commissionRate),
        minimumEligibleUsd: normalizeDec(settingsQuery.data.minimumEligibleUsd),
        payoutMinimumUsd: normalizeDec(settingsQuery.data.payoutMinimumUsd),
        transactionCapUsd: normalizeDec(settingsQuery.data.transactionCapUsd)
      });
      setIsModified(false);
      setError('');
      setSuccess(false);
    }
  };

  const handleChange = (update: Partial<AffiliateSettings>) => {
    setForm(prev => ({ ...prev, ...update }));
    setIsModified(true);
    setSuccess(false);
  };

  const handleSave = () => {
    setError('');
    setSuccess(false);
    createSettings.mutate({
      data: {
        enabled: form.enabled ?? false,
        quickexEnabled: form.quickexEnabled ?? false,
        manualEnabled: form.manualEnabled ?? false,
        commissionRate: form.commissionRate || '0.00',
        minimumEligibleUsd: form.minimumEligibleUsd || '0.00',
        payoutMinimumUsd: form.payoutMinimumUsd || '0.00',
        transactionCapUsd: form.transactionCapUsd || undefined,
        cookieDurationDays: form.cookieDurationDays ?? 30
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAffiliateSettingsQueryKey() });
        setIsModified(false);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      },
      onError: (err) => setError(apiErrorText(err, t('affiliate.saveSettingsError')))
    });
  };

  if (settingsQuery.isLoading) return <div className="p-6 bg-card border border-border rounded-[18px]"><LoadingBlock rows={4} /></div>;
  if (settingsQuery.isError) return <div className="p-6 bg-card border border-border rounded-[18px]"><ErrorState /></div>;

  return (
    <div className="bg-card border border-border/60 rounded-[18px] shadow-sm overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#13DDF4] via-[#087BFF] to-[#7A2CFF]"></div>

      <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 bg-muted/5">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-bold text-lg text-foreground">{t('affiliate.programSettings')}</h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-primary/10 text-primary border border-primary/20">
              v{settingsQuery.data?.version || 0}
            </span>
            {form.enabled ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-success/10 text-success border border-success/20">{t('affiliate.active')}</span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-muted text-muted-foreground border border-border">{t('affiliate.disabled')}</span>
            )}
          </div>
           <p className="text-[13px] text-muted-foreground">{t('affiliate.settingsDescription')}</p>
        </div>
        <div className="affiliate-settings-actions flex flex-wrap items-center gap-3 shrink-0 md:justify-end">
           {success && <span className="text-success text-[12px] font-bold flex items-center gap-1.5"><Check size={14} /> {t('affiliate.saved')}</span>}
           <a href="#valuation-guide" data-testid="link-affiliate-documentation" className="button button-ghost h-10 px-4 rounded-xl text-[12px] uppercase tracking-wider font-bold text-primary hover:bg-primary/10">
             <FileText size={14} /> {t('affiliate.viewDocumentation')}
           </a>
           <button type="button" onClick={handleReset} data-testid="btn-reset-settings" disabled={!isModified || createSettings.isPending} className="button button-ghost h-10 px-4 rounded-xl text-[12px] font-bold uppercase tracking-wider">{t('affiliate.reset')}</button>
          <button type="button" onClick={handleSave} data-testid="btn-save-settings" disabled={!isModified || createSettings.isPending} className="button button-primary h-10 px-6 rounded-xl text-[12px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:hover:translate-y-0">
            {createSettings.isPending ? t('affiliate.saving') : t('affiliate.saveChanges')}
          </button>
        </div>
      </div>

      {error && <div className="m-5 sm:m-6 notice notice-error"><X size={16} />{error}</div>}

      <div className="admin-form-grid p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 bg-background">
        <div className="admin-form-card affiliate-setting-card affiliate-setting-card--purple">
          <div className="flex flex-col h-full">
            <div className="affiliate-setting-card__heading">
              <span className="affiliate-setting-card__icon"><Settings size={16} /></span>
              <h4 className="font-semibold text-sm text-foreground">{t('affiliate.programStatus')}</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{t('affiliate.programStatusDescription')}</p>
            <div className="mt-auto">
              <select
                className="affiliate-setting-card__control w-full rounded-xl h-11 px-3 text-sm focus:outline-none cursor-pointer transition-all"
                value={form.enabled ? 'true' : 'false'}
                onChange={e => handleChange({ enabled: e.target.value === 'true' })}
                data-testid="select-program-status"
              >
                <option value="true">{t('affiliate.enabled')}</option>
                <option value="false">{t('affiliate.disabled')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="admin-form-card affiliate-setting-card affiliate-setting-card--blue">
          <div className="flex justify-between items-start mb-4">
            <div className="pr-2">
              <div className="affiliate-setting-card__heading">
                <span className="affiliate-setting-card__icon"><Network size={16} /></span>
                <h4 className="font-semibold text-sm text-foreground">{t('affiliate.quickexIntegration')}</h4>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t('affiliate.quickexIntegrationState', { state: form.quickexEnabled ? t('affiliate.enabledLower') : t('affiliate.disabledLower') })}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-[10px] font-bold', form.quickexEnabled ? 'affiliate-setting-card__value' : 'text-muted-foreground')}>{form.quickexEnabled ? t('affiliate.on') : t('affiliate.off')}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={form.quickexEnabled || false} onChange={e => handleChange({ quickexEnabled: e.target.checked })} data-testid="toggle-quickex-integration" />
                <div className="affiliate-setting-card__toggle w-10 h-5.5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="admin-form-card affiliate-setting-card affiliate-setting-card--magenta">
          <div className="flex justify-between items-start mb-4">
            <div className="pr-2">
              <div className="affiliate-setting-card__heading">
                <span className="affiliate-setting-card__icon"><FileText size={16} /></span>
                <h4 className="font-semibold text-sm text-foreground">{t('affiliate.manualAdjustments')}</h4>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t('affiliate.manualAdjustmentsDescription')}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-[10px] font-bold', form.manualEnabled ? 'affiliate-setting-card__value' : 'text-muted-foreground')}>{form.manualEnabled ? t('affiliate.on') : t('affiliate.off')}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={form.manualEnabled || false} onChange={e => handleChange({ manualEnabled: e.target.checked })} data-testid="toggle-manual-adjustments" />
                <div className="affiliate-setting-card__toggle w-10 h-5.5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="admin-form-card affiliate-setting-card affiliate-setting-card--cyan">
          <div className="affiliate-setting-card__heading">
            <span className="affiliate-setting-card__icon"><DollarSign size={16} /></span>
            <h4 className="font-semibold text-sm text-foreground">{t('affiliate.commissionRate')}</h4>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{t('affiliate.commissionRateDescription')}</p>
          <div className="mt-auto relative">
            <input type="number" step="0.001" min="0" className="affiliate-setting-card__control affiliate-setting-card__input w-full rounded-xl h-11 pl-3 pr-10 text-sm font-mono focus:outline-none" value={form.commissionRate || ''} onChange={e => handleChange({ commissionRate: e.target.value })} placeholder="0.00" data-testid="input-commission-rate" />
            <span className="affiliate-setting-card__value absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold">%</span>
          </div>
        </div>

        <div className="admin-form-card affiliate-setting-card affiliate-setting-card--amber">
          <div className="affiliate-setting-card__heading">
            <span className="affiliate-setting-card__icon"><Link2 size={16} /></span>
            <h4 className="font-semibold text-sm text-foreground">{t('affiliate.cookieDuration')}</h4>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{t('affiliate.cookieDurationDescription')}</p>
          <div className="mt-auto relative">
            <input type="number" min="1" max="365" className="affiliate-setting-card__control affiliate-setting-card__input w-full rounded-xl h-11 px-3 pr-14 text-sm font-mono focus:outline-none" value={form.cookieDurationDays || ''} onChange={e => handleChange({ cookieDurationDays: Number(e.target.value) })} placeholder="30" data-testid="input-cookie-duration" />
            <span className="affiliate-setting-card__value absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase">{t('affiliate.daysUnit')}</span>
          </div>
        </div>

        <div className="admin-form-card affiliate-setting-card affiliate-setting-card--green">
          <div className="affiliate-setting-card__heading">
            <span className="affiliate-setting-card__icon"><Trophy size={16} /></span>
            <h4 className="font-semibold text-sm text-foreground">{t('affiliate.minimumEligibleAmount')}</h4>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{t('affiliate.minimumEligibleDescription')}</p>
          <div className="mt-auto relative">
            <span className="affiliate-setting-card__value absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm">$</span>
            <input type="number" step="0.01" min="0" className="affiliate-setting-card__control affiliate-setting-card__input w-full rounded-xl h-11 pl-7 pr-14 text-sm font-mono focus:outline-none" value={form.minimumEligibleUsd || ''} onChange={e => handleChange({ minimumEligibleUsd: e.target.value })} placeholder="0.00" data-testid="input-minimum-eligible" />
            <span className="affiliate-setting-card__value absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase">USD</span>
          </div>
        </div>

        <div className="admin-form-card affiliate-setting-card affiliate-setting-card--teal">
          <div className="affiliate-setting-card__heading">
            <span className="affiliate-setting-card__icon"><HandCoins size={16} /></span>
            <h4 className="font-semibold text-sm text-foreground">{t('affiliate.usdtPayoutMinimum')}</h4>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{t('affiliate.payoutMinimumDescription')}</p>
          <div className="mt-auto relative">
            <input type="number" step="0.01" min="0" className="affiliate-setting-card__control affiliate-setting-card__input w-full rounded-xl h-11 pl-3 pr-16 text-sm font-mono focus:outline-none" value={form.payoutMinimumUsd || ''} onChange={e => handleChange({ payoutMinimumUsd: e.target.value })} placeholder="0.00" data-testid="input-payout-minimum" />
            <span className="affiliate-setting-card__value absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase">USDT</span>
          </div>
        </div>

        <div className="admin-form-card affiliate-setting-card affiliate-setting-card--violet lg:col-span-2">
          <div className="affiliate-setting-card__heading">
            <span className="affiliate-setting-card__icon"><ShieldCheck size={16} /></span>
            <h4 className="font-semibold text-sm text-foreground">{t('affiliate.transactionCap')}</h4>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{t('affiliate.transactionCapDescription')}</p>
          <div className="mt-auto relative">
            <span className="affiliate-setting-card__value absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm">$</span>
            <input type="number" step="0.01" min="0" className="affiliate-setting-card__control affiliate-setting-card__input w-full rounded-xl h-11 pl-7 pr-14 text-sm font-mono focus:outline-none placeholder:text-muted-foreground/40" value={form.transactionCapUsd || ''} onChange={e => handleChange({ transactionCapUsd: e.target.value || undefined })} placeholder={t('affiliate.none')} data-testid="input-transaction-cap" />
            <span className="affiliate-setting-card__value absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase">USD</span>
          </div>
        </div>

      </div>
    </div>
  );
}

function AffiliateValuationQueue() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const reviewParams = useMemo(() => ({
    page,
    pageSize,
    state: filter === 'all' ? undefined : filter,
  }), [filter, page, pageSize]);
  const reviewsQuery = useGetAffiliateValuationReviews(reviewParams, { query: { queryKey: getGetAffiliateValuationReviewsQueryKey(reviewParams) } });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{ id: string, type: 'approve' | 'reject' } | null>(null);

  const reviews = reviewsQuery.data || [];

  useEffect(() => {
    setPage(1);
  }, [search, filter, sort]);

  const filtered = useMemo(() => {
    let result = [...reviews];
    if (filter !== 'all') {
      result = result.filter(r => r.state === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(r => r.id.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q) || r.completionEventId.toLowerCase().includes(q));
    }
    return result.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sort === 'newest' ? timeB - timeA : timeA - timeB;
    });
  }, [reviews, filter, search, sort]);

  const paginated = filtered;
  const hasNextPage = reviews.length === pageSize;

  useEffect(() => {
    if (!reviewsQuery.isFetching && page > 1 && reviews.length === 0) setPage(current => Math.max(1, current - 1));
  }, [page, reviews.length, reviewsQuery.isFetching]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetAffiliateValuationReviewsQueryKey() });
  };

  const pendingCount = reviews.filter(r => r.state === 'pending').length;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    const allPageRowsSelected = paginated.length > 0 && paginated.every(review => selectedIds.has(review.id));
    if (allPageRowsSelected) {
      const next = new Set(selectedIds);
      paginated.forEach(review => next.delete(review.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      paginated.forEach(review => next.add(review.id));
      setSelectedIds(next);
    }
  };

  const startIdx = filtered.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const endIdx = filtered.length > 0 ? startIdx + filtered.length - 1 : 0;

  return (
    <div className="bg-card border border-border/60 rounded-[18px] shadow-sm flex flex-col min-w-0">
      <div className="p-5 sm:p-6 border-b border-border/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-bold text-lg text-foreground">{t('affiliate.valuationReviewQueue')}</h3>
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-warning/10 text-warning border border-warning/20">
                  {t('affiliate.pendingCount', { count: pendingCount })}
                </span>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground">{t('affiliate.valuationQueueDescription')}</p>
          </div>

          <button type="button" onClick={handleRefresh} data-testid="btn-queue-refresh" disabled={reviewsQuery.isFetching} className="button button-secondary h-9 px-3 rounded-lg text-xs font-semibold gap-2 self-start sm:self-auto shrink-0">
            <RefreshCw size={14} className={cn(reviewsQuery.isFetching && "animate-spin")} />
            {t('actions.refresh')}
          </button>
        </div>

        <div className="mt-6 flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <div className="flex-1 min-w-[200px]">
            <AdminSearch
              value={search}
              onChange={setSearch}
              placeholder={t('affiliate.searchReview')}
              testId="input-queue-search"
            />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2 shrink-0">
            <select data-testid="select-queue-filter" className="h-10 w-full sm:w-auto bg-input/40 border border-border rounded-xl text-[13px] px-3 pr-8 focus:outline-none appearance-none cursor-pointer" value={filter} onChange={e => setFilter(e.target.value as any)}>
              <option value="all">{t('affiliate.allStatuses')}</option>
              <option value="pending">{t('affiliate.statusPending')}</option>
              <option value="approved">{t('affiliate.statusApproved')}</option>
              <option value="rejected">{t('affiliate.statusRejected')}</option>
            </select>
            <select data-testid="select-queue-sort" className="h-10 w-full sm:w-auto bg-input/40 border border-border rounded-xl text-[13px] px-3 pr-8 focus:outline-none appearance-none cursor-pointer" value={sort} onChange={e => setSort(e.target.value as any)}>
              <option value="newest">{t('affiliate.newestFirst')}</option>
              <option value="oldest">{t('affiliate.oldestFirst')}</option>
            </select>
          </div>
        </div>
      </div>

      {reviewsQuery.isLoading ? <div className="p-6"><LoadingBlock rows={3} /></div> : reviewsQuery.isError ? <div className="p-6"><ErrorState /></div> : (
        <>
          <div className="w-full relative group">
            <div className="swipeable-scroll-hint" aria-hidden="true" />
            <div className="mobile-table-scroll w-full overflow-x-auto" onScroll={(e) => {
              const target = e.target as HTMLElement;
              const hint = target.previousElementSibling as HTMLElement;
              if (hint) hint.style.opacity = target.scrollLeft > 10 ? '0' : '1';
            }}>
            <table className="w-full text-left border-collapse min-w-[900px]" data-testid="table-affiliate-valuations">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="p-4 pl-6 w-10"><input type="checkbox" className="rounded border-border w-4 h-4 cursor-pointer" checked={paginated.length > 0 && paginated.every(review => selectedIds.has(review.id))} onChange={toggleSelectAll} aria-label={t('affiliate.selectAllReviews')} /></th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('affiliate.orderId')}</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('affiliate.dateTime')}</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('affiliate.reason')}</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('affiliate.amount')}</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('affiliate.user')}</th>
                  <th className="p-4 pr-6 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">{t('affiliate.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-[13px] text-muted-foreground">{t('affiliate.noValuationReviews')}</td></tr>
                ) : paginated.map(r => (
                  <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 pl-6"><input type="checkbox" className="rounded border-border w-4 h-4 cursor-pointer" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                    <td className="p-4 font-mono text-[12px] font-semibold text-foreground">{shortId(r.completionEventId)}</td>
                    <td className="p-4 whitespace-nowrap text-[12px] text-muted-foreground">
                      {exactDateTime(r.createdAt)}
                      <span className="block text-[10px] mt-0.5 opacity-80">{ago(r.createdAt)}</span>
                    </td>
                    <td className="p-4">
                      <div className="text-[12px] text-muted-foreground max-w-[200px] truncate" title={r.reason}>{r.reason}</div>
                    </td>
                    <td className="p-4 text-[12px] text-muted-foreground">—</td>
                    <td className="p-4 text-[12px] text-muted-foreground">{t('common.unavailable')}</td>
                    <td className="p-4 pr-6 text-right whitespace-nowrap">
                      {r.state === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" data-testid={`btn-approve-${r.id}`} onClick={() => setConfirmAction({ id: r.id, type: 'approve' })} className="button button-success h-7 px-3 rounded-md text-[11px] font-bold uppercase tracking-wider bg-success/10 text-success border-transparent hover:bg-success/20 hover:border-success/30">{t('affiliate.approve')}</button>
                          <button type="button" data-testid={`btn-reject-${r.id}`} onClick={() => setConfirmAction({ id: r.id, type: 'reject' })} className="button button-danger h-7 px-3 rounded-md text-[11px] font-bold uppercase tracking-wider bg-destructive/10 text-destructive border-transparent hover:bg-destructive/20 hover:border-destructive/30">{t('affiliate.reject')}</button>
                          <button type="button" className="button button-ghost h-7 w-7 p-0 flex items-center justify-center rounded-md"><MoreHorizontal size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <ReviewBadge state={r.state} />
                          <button type="button" className="button button-ghost h-7 w-7 p-0 flex items-center justify-center rounded-md"><MoreHorizontal size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          {/* Pagination */}
          <div className="p-4 sm:p-5 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/5">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto">
              <span className="text-[12px] text-muted-foreground order-2 sm:order-1">{startIdx ? `${startIdx}–${endIdx}` : '0'}</span>
              <div className="flex items-center gap-2 order-1 sm:order-2">
                <select className="h-8 bg-input/40 border border-border rounded-lg text-[12px] px-2 pr-7 font-mono focus:outline-none cursor-pointer" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('affiliate.pageUnit')}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" className="h-8 px-3 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50 text-[12px] font-semibold" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('affiliate.previous')}</button>

              <div className="hidden sm:flex items-center gap-1">
                <span className="w-8 h-8 rounded-lg text-[12px] font-mono bg-primary text-primary-foreground font-bold flex items-center justify-center">{page}</span>
              </div>
              <span className="sm:hidden text-[12px] px-2">{page}</span>

              <button type="button" className="h-8 px-3 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50 text-[12px] font-semibold" disabled={!hasNextPage} onClick={() => setPage(p => p + 1)}>{t('common.next')}</button>
            </div>
          </div>
        </>
      )}

      {confirmAction && (
        <ValuationConfirmDialog
          review={reviews.find(r => r.id === confirmAction.id)!}
          actionType={confirmAction.type}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function ReviewBadge({ state }: { state: string }) {
  const { t } = useI18n();
  if (state === 'approved') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">{t('affiliate.statusApproved')}</span>;
  if (state === 'rejected') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-destructive/10 text-destructive border border-destructive/20">{t('affiliate.statusRejected')}</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning border border-warning/20">{t('affiliate.statusPending')}</span>;
}

function ValuationConfirmDialog({ review, actionType, onClose }: { review: AffiliateValuationReview; actionType: 'approve' | 'reject'; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const reviewValuation = useReviewAffiliateValuation();
  const [usd, setUsd] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (actionType === 'approve' && !usd) {
      setError(t('affiliate.valuationRequired'));
      return;
    }
    if (actionType === 'reject' && !note.trim()) {
      setError(t('affiliate.rejectionNoteRequired'));
      return;
    }

    reviewValuation.mutate({
      id: review.id,
      data: {
        state: actionType === 'approve' ? 'approved' : 'rejected',
        usd: actionType === 'approve' ? usd : undefined,
        note: note.trim() || undefined
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAffiliateValuationReviewsQueryKey() });
        onClose();
      },
      onError: (err) => setError(apiErrorText(err, t('affiliate.submitReviewError')))
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border shadow-xl rounded-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-border/50">
          <h3 className="text-lg font-bold">{actionType === 'approve' ? t('affiliate.approveValuation') : t('affiliate.rejectValuation')}</h3>
          <p className="text-[13px] text-muted-foreground mt-1">{t('affiliate.reviewingEvent', { id: shortId(review.completionEventId) })}</p>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="notice notice-error"><X size={14} />{error}</div>}

          <div className="bg-muted/20 p-3 rounded-lg border border-border/50 text-[12px] text-muted-foreground mb-4">
            {review.reason}
          </div>

          {actionType === 'approve' ? (
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('affiliate.exactUsdValuation')} <span className="text-destructive">*</span></span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                <input autoFocus type="number" step="0.000001" min="0" required data-testid="input-confirm-usd" className="w-full bg-input/40 border border-border rounded-xl h-11 pl-7 pr-3 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none" value={usd} onChange={e => setUsd(e.target.value)} placeholder="0.00" />
              </div>
            </label>
          ) : (
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('affiliate.rejectionNote')} <span className="text-destructive">*</span></span>
              <textarea autoFocus required rows={3} data-testid="input-confirm-note" className="w-full bg-input/40 border border-border rounded-xl p-3 text-[13px] focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none resize-none" value={note} onChange={e => setNote(e.target.value)} placeholder={t('affiliate.rejectionNotePlaceholder')} />
            </label>
          )}

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 button button-ghost h-11 rounded-xl text-[13px] font-bold" disabled={reviewValuation.isPending}>{t('actions.cancel')}</button>
            <button type="submit" data-testid="btn-confirm-submit" className={cn("flex-1 button h-11 rounded-xl text-[13px] font-bold shadow-lg", actionType === 'approve' ? "button-primary shadow-primary/20" : "button-danger shadow-destructive/20")} disabled={reviewValuation.isPending}>
              {reviewValuation.isPending ? t('affiliate.submitting') : actionType === 'approve' ? t('affiliate.confirmApproval') : t('affiliate.confirmRejection')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AffiliateHelpCard() {
  const { t } = useI18n();
  return (
    <div id="valuation-guide" className="bg-card border border-border/60 rounded-[18px] p-5 shadow-sm flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
          <Settings size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-foreground text-[15px]">{t('affiliate.valuationHelp')}</h3>
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">{t('affiliate.valuationHelpDescription')}</p>
        </div>
      </div>
      <a href="#valuation-guide" className="button button-secondary h-10 w-full rounded-xl px-4 text-[12px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 sm:w-auto shrink-0">
        <FileText size={14} /> {t('affiliate.viewGuide')}
      </a>
    </div>
  );
}
