import React, { useEffect, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { useLocation } from 'wouter';
import {
  WalletCards, Check, Copy, AlertCircle, Loader2, RefreshCw, 
  ArrowDownToLine, Clock, CheckCircle2, XCircle, Search
} from 'lucide-react';
import { CustomerShell, CustomerPageHeader } from '@/components/customer/CustomerShell';
import { PublicShell } from '@/components/public-shell';
import { 
  useGetCustomerDeposits, getGetCustomerDepositsQueryKey,
  useGetCustomerBalances, getGetCustomerBalancesQueryKey,
  useCreateCustomerDepositAddress
} from '@workspace/api-client-react';
import type { WhitebitDeposit, WhitebitDepositAddress } from '@workspace/api-client-react';
import { WhitebitDepositStatus, WhitebitDepositAddressStatus } from '@workspace/api-client-react';
import {
  cn, ErrorState, InlineNotice, LoadingBlock, publicApiErrorText
} from '@/components/shared-app-ui';

function exactDecimalDisplay(val?: string | null) {
  if (!val) return '0.00';
  return val;
}

function getDepositStatusInfo(deposit: WhitebitDeposit) {
  if (deposit.status === WhitebitDepositStatus.processed) {
    return { label: 'Credited', icon: <CheckCircle2 size={14} className="text-emerald-500" />, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
  }
  if (deposit.status === WhitebitDepositStatus.canceled) {
    return { label: 'Canceled', icon: <XCircle size={14} className="text-rose-500" />, color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' };
  }
  if (deposit.status === WhitebitDepositStatus.accepted || deposit.status === WhitebitDepositStatus.updated) {
    return { label: 'Confirming', icon: <Clock size={14} className="text-amber-500" />, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
  }
  return { label: 'Awaiting review', icon: <Clock size={14} className="text-muted-foreground" />, color: 'text-muted-foreground bg-muted border-border' };
}

function CopyBox({ label, text, testId, actionable = true }: { label?: string, text: string, testId?: string, actionable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!actionable || !text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      {label && <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>}
      <div className="flex items-center justify-between gap-2 p-3 bg-muted/30 border border-border rounded-xl">
        <code className="text-sm font-mono truncate text-foreground select-all">{text || '—'}</code>
        {text && (
          <button type="button" onClick={copy} disabled={!actionable} aria-label={label ? `Copy ${label}` : 'Copy'} data-testid={testId || 'button-copy'} className="shrink-0 p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground">
            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function dataIsSuccess(data: WhitebitDepositAddress) {
  return data.address && data.status === WhitebitDepositAddressStatus.ready;
}

function DepositAddressManager() {
  const queryClient = useQueryClient();
  const [ticker, setTicker] = useState('USDT');
  const [network, setNetwork] = useState('TRC20');
  const [notice, setNotice] = useState<{ kind: 'error' | 'success', text: string } | null>(null);
  
  const createMutation = useCreateCustomerDepositAddress();
  
  const [addressData, setAddressData] = useState<WhitebitDepositAddress | null>(null);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    setNotice(null);
    setAddressData(null);
    
    createMutation.mutate({
      data: {
        ticker: ticker.trim().toUpperCase(),
        network: network.trim()
      }
    }, {
      onSuccess: (data) => {
        if (data.status === WhitebitDepositAddressStatus.failed || data.status === WhitebitDepositAddressStatus.error || data.status === WhitebitDepositAddressStatus.unresolved) {
          setNotice({ kind: 'error', text: 'Error provisioning address: ' + data.status });
        }
        setAddressData(data);
        queryClient.invalidateQueries({ queryKey: getGetCustomerDepositsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCustomerBalancesQueryKey() });
      },
      onError: (error) => {
        setNotice({ kind: 'error', text: publicApiErrorText(error, 'Failed to provision deposit address. Please check currency/network configuration.') });
      }
    });
  };

  return (
    <div className="customer-card p-6 border border-border/50 bg-card/40 backdrop-blur-sm shadow-sm" data-testid="deposit-address-manager">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
        <ArrowDownToLine size={20} className="text-primary" />
        New Deposit
      </h2>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        Request a unique deposit address for your account. Ensure the network matches exactly to prevent permanent loss of funds.
      </p>
      
      <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Currency (Ticker)</label>
          <input 
            type="text" 
            value={ticker} 
            onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. USDT, BTC"
            required
            className="w-full h-11 bg-input/50 border border-border rounded-xl px-4 text-sm font-semibold uppercase focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            data-testid="input-deposit-ticker"
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Network (Optional)</label>
          <input 
            type="text" 
            value={network} 
            onChange={e => setNetwork(e.target.value)}
            placeholder="e.g. TRC20, ERC20"
            className="w-full h-11 bg-input/50 border border-border rounded-xl px-4 text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            data-testid="input-deposit-network"
          />
        </div>
        <div className="flex items-end">
          <button 
            type="submit" 
            disabled={createMutation.isPending || !ticker.trim()}
            className="button button-primary h-11 px-6 rounded-xl w-full sm:w-auto"
            data-testid="button-generate-address"
          >
            {createMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {createMutation.isPending ? 'Requesting...' : 'Get Address'}
          </button>
        </div>
      </form>
      
      {notice && (
        <div className="mb-6">
          <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice>
        </div>
      )}
      
      {addressData && dataIsSuccess(addressData) && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={18} className="text-primary" />
            <span className="font-semibold text-primary">Address Provisioned</span>
          </div>
          
          <div className="space-y-4">
            <CopyBox label="Deposit Address" text={addressData.address || ''} testId="copy-deposit-address" />
            
            {addressData.memo && (
              <CopyBox label="Memo / Tag (Required)" text={addressData.memo} testId="copy-deposit-memo" />
            )}
            
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-sm">
              <AlertCircle size={16} className="shrink-0" />
              <p>Send only <strong>{addressData.ticker}</strong> via <strong>{addressData.network || 'default'}</strong> network to this address. Other assets will be lost.</p>
            </div>
          </div>
        </div>
      )}
      {addressData && !dataIsSuccess(addressData) && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-5">
           <div className="flex items-center gap-2 mb-2">
            <XCircle size={18} className="text-destructive" />
            <span className="font-semibold text-destructive">Provisioning Pending/Error</span>
          </div>
          <div className="text-xs text-muted-foreground p-3 bg-muted rounded-lg font-mono">
             Status: {addressData.status}
          </div>
        </div>
      )}
    </div>
  );
}


export function AccountDepositsPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/sign-in');
    }
  }, [isLoaded, isSignedIn, setLocation]);

  // Clear queries on mount if signed in to ensure fresh data and on unmount
  useEffect(() => {
    if (isSignedIn) {
      queryClient.invalidateQueries({ queryKey: getGetCustomerDepositsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetCustomerBalancesQueryKey() });
    }
  }, [isSignedIn, queryClient]);

  const deposits = useGetCustomerDeposits({
    query: {
      queryKey: getGetCustomerDepositsQueryKey(),
      enabled: isLoaded && !!isSignedIn,
      staleTime: 30000,
      refetchInterval: 15000,
    }
  });

  const balances = useGetCustomerBalances({
    query: {
      queryKey: getGetCustomerBalancesQueryKey(),
      enabled: isLoaded && !!isSignedIn,
      staleTime: 30000,
      refetchInterval: 15000,
    }
  });

  if (!isLoaded || !isSignedIn) {
    return <PublicShell><main className="public-main"><LoadingBlock rows={6} /></main></PublicShell>;
  }

  const depositsList = deposits.data || [];
  const balancesList = balances.data || [];

  return (
    <CustomerShell contentClassName="max-w-6xl">
      <CustomerPageHeader
        title="Deposits & Balances"
        description="Manage your internal provider deposits and exact ledger balances."
        actions={
          <button 
            type="button"
            onClick={() => {
              deposits.refetch();
              balances.refetch();
            }}
            disabled={deposits.isFetching || balances.isFetching}
            className="button button-secondary h-10 px-4 rounded-xl text-sm font-semibold"
            data-testid="button-refresh-deposits"
          >
            <RefreshCw size={16} className={cn("mr-2", (deposits.isFetching || balances.isFetching) && "animate-spin")} />
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Balances Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="customer-card p-6 border border-border/50 bg-card/40 backdrop-blur-sm shadow-sm" data-testid="balances-card">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
              <WalletCards size={20} className="text-primary" />
              Internal Balances
            </h2>
            
            {balances.isLoading ? (
              <LoadingBlock rows={3} />
            ) : balances.isError ? (
              <ErrorState message="Failed to load balances" retry={() => balances.refetch()} />
            ) : balancesList.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3 text-muted-foreground/50">
                  <WalletCards size={24} />
                </div>
                <p className="text-sm text-muted-foreground">Your internal balance is empty.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {balancesList.map((bal, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border/50" data-testid={`balance-row-${bal.ticker}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center font-bold text-xs">
                        {bal.ticker.slice(0, 3)}
                      </div>
                      <span className="font-bold text-sm">{bal.ticker}</span>
                    </div>
                    <span className="font-mono font-semibold">{exactDecimalDisplay(bal.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          <DepositAddressManager />
          
          <div className="customer-card border border-border/50 bg-card/40 backdrop-blur-sm shadow-sm" data-testid="deposit-history-card">
            <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Clock size={20} className="text-primary" />
                Deposit History
              </h2>
            </div>
            
            <div className="p-0">
              {deposits.isLoading ? (
                <div className="p-6"><LoadingBlock rows={4} /></div>
              ) : deposits.isError ? (
                <div className="p-6"><ErrorState message="Failed to load deposits history" retry={() => deposits.refetch()} /></div>
              ) : depositsList.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground/50">
                    <ArrowDownToLine size={32} />
                  </div>
                  <h3 className="text-base font-bold mb-1">No deposits yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">Generate a deposit address above and transfer funds to see them appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-6 py-4 font-bold whitespace-nowrap">Asset</th>
                        <th className="px-6 py-4 font-bold whitespace-nowrap">Amount</th>
                        <th className="px-6 py-4 font-bold whitespace-nowrap">Status</th>
                        <th className="px-6 py-4 font-bold whitespace-nowrap">Tx Hash</th>
                        <th className="px-6 py-4 font-bold whitespace-nowrap">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {depositsList.map((dep) => {
                        const statusInfo = getDepositStatusInfo(dep);
                        return (
                          <tr key={dep.id} className="hover:bg-muted/20 transition-colors" data-testid={`deposit-row-${dep.id}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">{dep.ticker}</span>
                                {dep.network && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-medium">{dep.network}</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-mono font-semibold text-sm">
                                {exactDecimalDisplay(dep.amount)}
                              </div>
                              {dep.fee && dep.fee !== '0' && dep.fee !== '0.0' && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">Fee: {exactDecimalDisplay(dep.fee)}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border", statusInfo.color)}>
                                {statusInfo.icon}
                                <span>{statusInfo.label}</span>
                              </div>
                              {dep.confirmationsRequired != null && dep.confirmationsRequired > 0 && (
                                <div className="text-[10px] text-muted-foreground mt-1.5 font-medium ml-1">
                                  {dep.confirmationsActual ?? 0} / {dep.confirmationsRequired} conf.
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {dep.transactionHash ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground truncate w-24" title={dep.transactionHash}>
                                    {dep.transactionHash.slice(0, 6)}...{dep.transactionHash.slice(-6)}
                                  </span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(dep.transactionHash!);
                                    }}
                                    className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                                    aria-label="Copy hash"
                                  >
                                    <Copy size={12} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs text-muted-foreground font-medium">
                              {new Date(dep.createdAt).toLocaleString(undefined, { 
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
