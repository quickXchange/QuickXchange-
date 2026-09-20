import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X, Search } from 'lucide-react';
import {
  useListBlockchainMonitoringRegistrationGaps,
  useActivateBlockchainMonitoringRegistrationGap,
  useListBlockchainMonitoringWatches,
  useListBlockchainMonitoringMatches,
  useReviewBlockchainMonitoringMatch,
  useListBlockchainMonitoringSetupRoutes,
  useEnableAllReadyBlockchainMonitoringRoutes,
  useEnableSelectedBlockchainMonitoringRoutes,
  getListBlockchainMonitoringSetupRoutesQueryKey,
  getListBlockchainMonitoringNetworksQueryKey,
  getListBlockchainMonitoringAssetsQueryKey,
  BlockchainMonitoringWatch,
  BlockchainMonitoringMatch,
  BlockchainMonitoringSetupRoute
} from '@workspace/api-client-react';
import { cn, ErrorState, LoadingBlock, exactDateTime, InlineNotice, apiErrorText } from '../App';
import { useAdminPermissions } from '../lib/admin-permissions';
import { CryptoLogo, cryptoLogoFallbackUrls } from './crypto-identity';

const setupStatusLabel: Record<BlockchainMonitoringSetupRoute['status'], string> = {
  ready: 'Ready',
  missing_rpc: 'Missing RPC',
  missing_contract_or_mint: 'Missing Contract/Mint',
  disabled: 'Disabled',
};

export function OperationsMonitors({ showSetup = true }: { showSetup?: boolean }) {
  const queryClient = useQueryClient();
  const { can } = useAdminPermissions();
  const [setupNotice, setSetupNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const [search, setSearch] = useState('');
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());

  const gapsQuery = useListBlockchainMonitoringRegistrationGaps({ query: { queryKey: ['listBlockchainMonitoringRegistrationGaps'] } });
  const watchesQuery = useListBlockchainMonitoringWatches({ state: 'active', limit: 50 }, { query: { queryKey: ['listBlockchainMonitoringWatches', 'active'] } });
  const matchesQuery = useListBlockchainMonitoringMatches({ state: 'needs_review', limit: 50 }, { query: { queryKey: ['listBlockchainMonitoringMatches', 'needs_review'] } });
  const setupRoutesQuery = useListBlockchainMonitoringSetupRoutes({
    query: {
      queryKey: getListBlockchainMonitoringSetupRoutesQueryKey(),
      enabled: showSetup,
    },
  });

  const activateGap = useActivateBlockchainMonitoringRegistrationGap();
  const reviewMatch = useReviewBlockchainMonitoringMatch();
  const enableAllReady = useEnableAllReadyBlockchainMonitoringRoutes();
  const enableSelected = useEnableSelectedBlockchainMonitoringRoutes();

  const handleActivateGap = (orderId: string) => {
    if (!window.confirm(`Activate gap for order ${orderId}?`)) return;
    activateGap.mutate({ orderId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['listBlockchainMonitoringRegistrationGaps'] });
      }
    });
  };

  const handleReviewMatch = (matchId: string, decision: 'approve' | 'reject') => {
    if (!window.confirm(`Are you sure you want to ${decision} this match?`)) return;
    reviewMatch.mutate({ id: matchId, data: { decision } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['listBlockchainMonitoringMatches', 'needs_review'] });
      }
    });
  };

  const handleEnableAllReady = () => {
    if (!window.confirm("Are you sure you want to enable all ready setup routes?")) return;
    setSetupNotice(null);
    enableAllReady.mutate(undefined, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListBlockchainMonitoringSetupRoutesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBlockchainMonitoringNetworksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBlockchainMonitoringAssetsQueryKey() });
        setSetupNotice({
          kind: 'success',
          message: `Enabled ${res.enabledRoutes} ready routes across ${res.enabledNetworks} networks. Skipped ${res.skippedRoutes} routes.`,
        });
        setSelectedRouteIds(new Set());
      },
      onError: (err) => {
        setSetupNotice({ kind: 'error', message: apiErrorText(err, 'Failed to enable ready routes.') });
      }
    });
  };

  const handleEnableSelected = () => {
    const readySelectedIds = Array.from(selectedRouteIds).filter(id => {
      const route = setupRoutesQuery.data?.items?.find(r => r.assetNetworkId === id);
      return route?.status === 'ready';
    });
    if (readySelectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to enable ${readySelectedIds.length} selected ready route(s)?`)) return;
    setSetupNotice(null);
    enableSelected.mutate({ data: { assetNetworkIds: readySelectedIds } }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListBlockchainMonitoringSetupRoutesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBlockchainMonitoringNetworksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBlockchainMonitoringAssetsQueryKey() });
        setSetupNotice({
          kind: 'success',
          message: `Enabled ${res.enabledRoutes} ready routes across ${res.enabledNetworks} networks. Skipped ${res.skippedRoutes} routes.`,
        });
        setSelectedRouteIds(new Set());
      },
      onError: (err) => {
        setSetupNotice({ kind: 'error', message: apiErrorText(err, 'Failed to enable selected routes.') });
      }
    });
  };

  const setupRoutes = setupRoutesQuery.data?.items || [];
  const statusCounts = setupRoutes.reduce<Record<BlockchainMonitoringSetupRoute['status'], number>>((counts, route) => {
    counts[route.status] += 1;
    return counts;
  }, { ready: 0, missing_rpc: 0, missing_contract_or_mint: 0, disabled: 0 });
  const readyCount = statusCounts.ready;
  const enabledCount = setupRoutes.filter(r => r.monitoringEnabled).length;

  const filteredRoutes = useMemo(() => {
    if (!search.trim()) return setupRoutes;
    const lowerSearch = search.toLowerCase();
    return setupRoutes.filter(route => {
      return (
        route.assetCode.toLowerCase().includes(lowerSearch) ||
        route.assetName.toLowerCase().includes(lowerSearch) ||
        route.networkCode.toLowerCase().includes(lowerSearch) ||
        route.networkName.toLowerCase().includes(lowerSearch) ||
        (route.identityKind || 'Not configured').toLowerCase().includes(lowerSearch) ||
        setupStatusLabel[route.status].toLowerCase().includes(lowerSearch)
      );
    });
  }, [setupRoutes, search]);

  const toggleRouteSelection = (id: string) => {
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      filteredRoutes.forEach(route => next.add(route.assetNetworkId));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedRouteIds(new Set());
  };

  const allFilteredSelected = filteredRoutes.length > 0 && filteredRoutes.every(r => selectedRouteIds.has(r.assetNetworkId));
  const someFilteredSelected = filteredRoutes.some(r => selectedRouteIds.has(r.assetNetworkId));

  const toggleAllVisible = () => {
    if (allFilteredSelected) {
      // If all currently filtered are selected, unselect just them
      setSelectedRouteIds(prev => {
        const next = new Set(prev);
        filteredRoutes.forEach(route => next.delete(route.assetNetworkId));
        return next;
      });
    } else {
      handleSelectAll();
    }
  };

  const readySelectedCount = Array.from(selectedRouteIds).filter(id => {
    const route = setupRoutes.find(r => r.assetNetworkId === id);
    return route?.status === 'ready';
  }).length;

  return (
    <div className="space-y-4">
      {/* Setup Routes */}
      {showSetup && <div className="panel pending-panel rise-in rise-delay-2 mt-4">
        <div className="panel-heading flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <span className="section-kicker">Configuration</span>
            <h2>Manual Swap Blockchain Monitoring</h2>
            <div className="text-sm text-muted-foreground mt-1">
              {setupRoutes.length} routes, {enabledCount} enabled
            </div>
          </div>
          {can('blockchain_monitoring.manage') && (
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={handleEnableSelected}
                disabled={enableSelected.isPending || readySelectedCount === 0}
                className="button button-secondary button-sm"
              >
                {enableSelected.isPending ? 'Enabling...' : `Enable Selected (${readySelectedCount} Ready)`}
              </button>
              <button
                onClick={handleEnableAllReady}
                disabled={enableAllReady.isPending || readyCount === 0}
                className="button button-primary button-sm"
              >
                {enableAllReady.isPending ? 'Enabling...' : 'Enable All Ready'}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Blockchain monitoring setup status counts">
            {(Object.keys(setupStatusLabel) as BlockchainMonitoringSetupRoute['status'][]).map(status => (
              <span key={status} className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                status === 'ready' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" :
                status === 'missing_rpc' || status === 'missing_contract_or_mint' ? "bg-destructive/10 text-destructive" :
                "bg-muted text-muted-foreground"
              )}>
                {setupStatusLabel[status]}: {statusCounts[status]}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 max-w-full w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search routes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input input-sm pl-9 w-full"
              />
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-primary/5 text-primary px-3 py-2 rounded-md text-sm">
            <div>
              <span className="font-semibold">{selectedRouteIds.size}</span> routes selected
              ({readySelectedCount} ready)
            </div>
            <div className="flex gap-2">
              <button onClick={handleSelectAll} className="text-primary font-medium hover:underline">Select All Filtered</button>
              <span className="text-primary/30">|</span>
              <button onClick={handleDeselectAll} className="text-primary font-medium hover:underline">Deselect All</button>
            </div>
        </div>

        {setupNotice && <InlineNotice kind={setupNotice.kind}>{setupNotice.message}</InlineNotice>}
        {setupRoutesQuery.isLoading ? <LoadingBlock rows={3} /> : setupRoutesQuery.isError ? <ErrorState message="Could not load setup routes" retry={() => setupRoutesQuery.refetch()} /> : (
          <div className="w-full relative group">
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredRoutes.length > 0 && allFilteredSelected}
                        ref={input => {
                          if (input) {
                            input.indeterminate = !allFilteredSelected && someFilteredSelected;
                          }
                        }}
                        onChange={toggleAllVisible}
                        className="rounded border-input/50"
                        aria-label="Select all visible routes"
                      />
                    </th>
                    <th>Asset</th>
                    <th>Network</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">
                      {search ? "No routes match your search" : "No setup routes"}
                    </td></tr>
                  ) : filteredRoutes.map((route: BlockchainMonitoringSetupRoute) => (
                    <tr key={route.assetNetworkId} className={cn(selectedRouteIds.has(route.assetNetworkId) && "bg-primary/5")}>
                      <td className="text-center align-middle">
                        <input
                          type="checkbox"
                          checked={selectedRouteIds.has(route.assetNetworkId)}
                          onChange={() => toggleRouteSelection(route.assetNetworkId)}
                          className="rounded border-input/50"
                          aria-label={`Select ${route.assetName} on ${route.networkName}`}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <CryptoLogo
                            symbol={route.assetCode}
                            logoFallbackUrls={cryptoLogoFallbackUrls(route.assetCode)}
                            size="sm"
                          />
                          <div>
                            <div className="font-medium">{route.assetName}</div>
                            <div className="text-xs text-muted-foreground">{route.assetCode}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>{route.networkName}</div>
                        <div className="text-xs text-muted-foreground">{route.networkCode}</div>
                      </td>
                      <td>
                        <div className="capitalize">{route.identityKind || 'Not configured'}</div>
                        {route.contractOrMint && (
                          <code className="text-xs text-muted-foreground block mt-0.5">{route.contractOrMint}</code>
                        )}
                      </td>
                      <td>
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          route.status === 'ready' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" :
                          route.status === 'missing_rpc' || route.status === 'missing_contract_or_mint' ? "bg-destructive/10 text-destructive" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {setupStatusLabel[route.status]}
                        </span>
                      </td>
                      <td>
                        {route.monitoringEnabled ? (
                          <span className="text-emerald-500 flex"><Check className="h-4 w-4" /></span>
                        ) : (
                          <span className="text-muted-foreground flex"><X className="h-4 w-4" /></span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>}

      {/* Matches */}
      <div className="panel pending-panel rise-in rise-delay-2 mt-4">
        <div className="panel-heading">
          <div><span className="section-kicker">Review</span><h2>Matches Pending Review</h2></div>
        </div>
        {matchesQuery.isLoading ? <LoadingBlock rows={3} /> : matchesQuery.isError ? <ErrorState message="Could not load matches" retry={() => matchesQuery.refetch()} /> : (
          <div className="w-full relative group">
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Watch</th>
                    <th>Observation</th>
                    <th>Confirmations</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(matchesQuery.data?.items || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-4 text-muted-foreground">No matches need review</td></tr>
                  ) : (matchesQuery.data?.items || []).map((m: BlockchainMonitoringMatch) => (
                    <tr key={m.id}>
                      <td><code className="text-xs">{m.orderId}</code></td>
                      <td><code className="text-xs">{m.watchId}</code></td>
                      <td><code className="text-xs">{m.observationId}</code></td>
                      <td>{m.confirmations} / {m.confirmationsRequired}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button className="button button-primary button-sm" onClick={() => handleReviewMatch(m.id, 'approve')}>Approve</button>
                          <button className="button button-secondary button-sm text-destructive" onClick={() => handleReviewMatch(m.id, 'reject')}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Gaps */}
      <div className="panel pending-panel rise-in rise-delay-2 mt-4">
        <div className="panel-heading">
          <div><span className="section-kicker">System</span><h2>Registration Gaps</h2></div>
        </div>
        {gapsQuery.isLoading ? <LoadingBlock rows={3} /> : gapsQuery.isError ? <ErrorState message="Could not load gaps" retry={() => gapsQuery.refetch()} /> : (
          <div className="w-full relative group">
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Network</th>
                    <th>Asset</th>
                    <th>Address</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(gapsQuery.data?.items || []).length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">No registration gaps</td></tr>
                  ) : (gapsQuery.data?.items || []).map((gap: any) => (
                    <tr key={gap.order || gap.orderId}>
                      <td><code className="text-xs">{gap.order || gap.orderId}</code></td>
                      <td>{gap.network || gap.networkId}</td>
                      <td>{gap.asset || gap.assetId}</td>
                      <td><code className="text-xs">{gap.address || gap.receivingAddress}</code></td>
                      <td className="text-destructive text-sm">{gap.reason}</td>
                      <td>
                        <button className="button button-secondary button-sm" onClick={() => handleActivateGap(gap.order || gap.orderId)}>Retry Registration</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Watches */}
      <div className="panel pending-panel rise-in rise-delay-2 mt-4">
        <div className="panel-heading">
          <div><span className="section-kicker">Active</span><h2>Blockchain Watches</h2></div>
        </div>
        {watchesQuery.isLoading ? <LoadingBlock rows={3} /> : watchesQuery.isError ? <ErrorState message="Could not load watches" retry={() => watchesQuery.refetch()} /> : (
          <div className="w-full relative group">
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Network</th>
                    <th>Address</th>
                    <th>Expected Amount</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(watchesQuery.data?.items || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-4 text-muted-foreground">No active watches</td></tr>
                  ) : (watchesQuery.data?.items || []).map((w: BlockchainMonitoringWatch) => (
                    <tr key={w.id}>
                      <td><code className="text-xs">{w.orderId}</code></td>
                      <td>{w.monitorNetworkId}</td>
                      <td><code className="text-xs">{w.receivingAddress}</code></td>
                      <td>{w.expectedAmount}</td>
                      <td className="text-xs">{exactDateTime(w.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
