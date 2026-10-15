import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Network, RotateCcw, X } from 'lucide-react';
import { useAdminPermissions } from '../lib/admin-permissions';
import {
  previewCryptoDepositProviderAssignment,
  createCryptoDepositProviderSwitchJob,
  getCryptoDepositProviderSwitchJob,
  retryCryptoDepositProviderSwitchRoute,
  useGetDepositProviderOptions,
  getGetCryptoNetworksQueryKey,
  getGetExchangeConfigQueryKey,
  getGetWhitebitVerificationRoutesQueryKey,
  getGetWhitebitProviderStatusQueryKey,
  getListBlockchainMonitoringNetworksQueryKey,
  getListBlockchainMonitoringAssetsQueryKey,
  getListBlockchainMonitoringSetupRoutesQueryKey,
  useGetWhitebitVerificationRoutes,
  useGetWhitebitProviderStatus,
} from '@workspace/api-client-react';
import type {
  CryptoAsset,
  CryptoNetwork,
  CryptoDepositProviderAssignmentPreview,
  DepositProviderSwitchJob,
  DepositProviderMonitoringOptions,
} from '@workspace/api-client-react';

type Provider = string;
const providerLabel = (id: string) => id === 'whitebit' ? 'WhiteBIT' : id === 'manual' ? 'Manual Wallet' : id === 'none' ? 'None' : id;
const storageKey = (userId: string) => `bulk-deposit-switch:${userId}`;
const isActive = (job: DepositProviderSwitchJob | null) => !!job && job.routes.some(r => r.status === 'queued' || r.status === 'running');
type PendingRequest = { networkIds: string[]; depositProvider: 'none' | 'manual' | 'whitebit'; reviewToken: string; whitebitMappings?: { networkId: string; assetCode: string; networkCode: string }[]; operationId: string; confirmRealAddressCreation: true; monitoring?: DepositProviderMonitoringOptions };
type Rpc = 'auto' | 'enable' | 'disable' | 'keep';
type Tri = 'auto' | 'enable' | 'disable' | 'keep';
const triLabel = (v: string) => v === 'auto' ? 'Follow RPC Monitoring' : v === 'enable' ? 'Enable' : v === 'disable' ? 'Disable' : 'Keep Current';
const yn = (v: boolean | null | undefined) => v === true ? 'Enabled' : v === false ? 'Disabled' : 'Unknown';
type Stored = { operationId: string; request?: PendingRequest };
const readStored = (userId: string): Stored | null => {
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return null;
  try { const v = JSON.parse(raw); if (v && typeof v.operationId === 'string') return v as Stored; } catch { /* legacy plain id */ }
  return { operationId: raw };
};
const statusOf = (cause: unknown) => (cause as { status?: number } | null)?.status;
const errText = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

export function BulkDepositProviderDialog({
  networks: networksProp, assets, initialNetworkIds, onClose, onSuccess,
}: {
  networks: CryptoNetwork[];
  assets: CryptoAsset[];
  initialNetworkIds: string[];
  onClose: () => void;
  onSuccess: (count: number) => void;
}) {
  const client = useQueryClient();
  const permissions = useAdminPermissions();
  const userId = permissions.authorization?.member.id;
  const isOwner = permissions.isOwner;
  // Snapshot: automatic catalog refreshes must not reset choices, queries or progress.
  const [networks] = useState(networksProp);
  const providersQuery = useGetDepositProviderOptions();
  const providerOptions = providersQuery.data?.length ? providersQuery.data
    : [{ id: 'whitebit', label: 'WhiteBIT', implemented: true }, { id: 'manual', label: 'Manual Wallet', implemented: true }, { id: 'none', label: 'None', implemented: true }];
  const [job, setJob] = useState<DepositProviderSwitchJob | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(true);
  const [rpcMonitoring, setRpcMonitoring] = useState<Rpc>('auto');
  const [networkMonitor, setNetworkMonitor] = useState<Tri>('auto');
  const [assetMonitoring, setAssetMonitoring] = useState<Tri>('auto');
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const pendingOp = useRef<string | null>(null);
  const [reconnectError, setReconnectError] = useState('');
  const [pollTick, setPollTick] = useState(0);
  const [resumeTick, setResumeTick] = useState(0);
  const savedRequest = useRef<PendingRequest | null>(null);
  const notified = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const apply = { isPending: starting || isActive(job) };
  const [provider, setProvider] = useState<Provider>('whitebit');
  const whitebitVerificationRoutesQuery = useGetWhitebitVerificationRoutes({
    query: { queryKey: getGetWhitebitVerificationRoutesQueryKey(), enabled: provider === 'whitebit' },
  });
  const whitebitProviderStatusQuery = useGetWhitebitProviderStatus({
    query: { queryKey: getGetWhitebitProviderStatusQueryKey(), enabled: provider === 'whitebit' },
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialNetworkIds));
  const [search, setSearch] = useState('');
  const [catalogReview, setCatalogReview] = useState<CryptoDepositProviderAssignmentPreview | null>(null);
  const [review, setReview] = useState<CryptoDepositProviderAssignmentPreview | null>(null);
  const [whitebitMappingChoices, setWhitebitMappingChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(networks.flatMap(network => {
      const mapped = network.whitebitNetworkCode;
      return mapped ? [[network.id, mapped]] : [];
    })),
  );
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const assetById = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets]);
  const statusById = new Map(catalogReview?.routes.map(route => [route.networkId, route]) ?? []);
  const sorted = useMemo(() => [...networks].sort((left, right) => {
    const assetComparison = (assetById.get(left.assetId)?.code ?? left.assetId)
      .localeCompare(assetById.get(right.assetId)?.code ?? right.assetId);
    return assetComparison || left.networkCode.localeCompare(right.networkCode);
  }), [networks, assetById]);
  const filtered = sorted.filter(network => {
    const asset = assetById.get(network.assetId);
    const query = search.trim().toLowerCase();
    return !query || [asset?.code, asset?.name, network.networkCode, network.networkName, network.id]
      .some(value => value?.toLowerCase().includes(query));
  });
  const selectedWhitebitMappings = useMemo(() => networks.flatMap(network => {
    const networkCode = whitebitMappingChoices[network.id];
    if (!networkCode) return [];
    const route = statusById.get(network.id);
    const assetCode = route?.whitebitAssetCode ||
      network.whitebitAssetCode ||
      assetById.get(network.assetId)?.code;
    return assetCode ? [{ networkId: network.id, assetCode, networkCode }] : [];
  }), [networks, whitebitMappingChoices, statusById, assetById]);
  const mappingSignature = JSON.stringify(selectedWhitebitMappings);

  useEffect(() => {
    let cancelled = false;
    setCatalogReview(null);
    setReview(null);
    setLoadingCatalog(true);
    setError('');
    if (!networks.length) {
      setLoadingCatalog(false);
      return;
    }
    void previewCryptoDepositProviderAssignment({
      networkIds: networks.map(network => network.id),
      depositProvider: provider as 'none' | 'manual' | 'whitebit',
      ...(provider === 'whitebit' && selectedWhitebitMappings.length
        ? { whitebitMappings: selectedWhitebitMappings }
        : {}),
    }).then(response => {
      if (!cancelled) setCatalogReview(response);
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not check the selected provider routes.');
    }).finally(() => {
      if (!cancelled) setLoadingCatalog(false);
    });
    return () => { cancelled = true; };
  }, [networks, provider, mappingSignature]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const stored = readStored(userId);
    if (!stored) { setResuming(false); return; }
    setOperationId(stored.operationId);
    savedRequest.current = stored.request ?? null;
    pendingOp.current = stored.operationId;
    setResuming(true);
    setReconnectError('');
    getCryptoDepositProviderSwitchJob(stored.operationId).then(result => {
      if (!cancelled) setJob(result);
    }).catch(async cause => {
      if (cancelled) return;
      if (statusOf(cause) === 404) {
        if (stored.request) {
          try {
            // Create response was lost: repeat the exact saved request with the same operation id.
            const created = await createCryptoDepositProviderSwitchJob(stored.request);
            if (!cancelled) setJob(created);
          } catch (inner) {
            if (!cancelled) setReconnectError(errText(inner, 'Could not confirm the switch request. Operation kept; try again.'));
          }
        } else {
          localStorage.removeItem(storageKey(userId));
          pendingOp.current = null;
          setOperationId(null);
          setError('The previous operation no longer exists on the server.');
        }
      } else {
        setReconnectError(errText(cause, 'Could not reach the server. The operation is kept; reconnect to continue.'));
      }
    }).finally(() => { if (!cancelled) setResuming(false); });
    return () => { cancelled = true; };
  }, [userId, resumeTick]);

  useEffect(() => {
    if (!job || !isActive(job)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getCryptoDepositProviderSwitchJob(job.id).then(next => {
        if (cancelled) return;
        setReconnectError('');
        setJob(next);
      }).catch(cause => {
        if (cancelled) return;
        setReconnectError(errText(cause, 'Lost connection while refreshing progress. Showing the last known state; reconnecting.'));
        setPollTick(tick => tick + 1);
      });
    }, reconnectError ? 3000 : 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [job, pollTick, reconnectError]);

  useEffect(() => {
    if (!job || isActive(job) || notified.current) return;
    notified.current = true;
    void Promise.all([
      client.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() }),
      client.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
      client.invalidateQueries({ queryKey: getGetWhitebitVerificationRoutesQueryKey() }),
      client.invalidateQueries({ queryKey: getGetWhitebitProviderStatusQueryKey() }),
      client.invalidateQueries({ queryKey: getListBlockchainMonitoringNetworksQueryKey() }),
      client.invalidateQueries({ queryKey: getListBlockchainMonitoringAssetsQueryKey() }),
      client.invalidateQueries({ queryKey: getListBlockchainMonitoringSetupRoutesQueryKey() }),
    ]);
    const ok = job.routes.filter(r => r.status === 'succeeded').length;
    if (ok > 0) onSuccessRef.current(ok);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const retryRoute = async (networkId: string) => {
    if (!job) return;
    if (!window.confirm('Retrying re-checks real WhiteBIT address-creation permission and may create a real deposit address, because the previous attempt may have partly completed. Continue?')) return;
    setRetrying(networkId);
    setError('');
    try {
      notified.current = false;
      setJob(await retryCryptoDepositProviderSwitchRoute(job.id, { networkId, confirmRealAddressCreation: true }));
    } catch (cause) {
      setError(errText(cause, 'Retry could not be started.'));
    } finally { setRetrying(null); }
  };

  const newAssignment = () => {
    if (userId) localStorage.removeItem(storageKey(userId));
    pendingOp.current = null;
    savedRequest.current = null;
    setReconnectError('');
    notified.current = false;
    setJob(null); setOperationId(null); setReview(null); setConsent(false); setError('');
  };

  const toggle = (id: string) => {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setReview(null);
    setError('');
  };

  const selectAllSupported = () => {
    if (!catalogReview) return;
    setSelected(new Set(catalogReview.routes.filter(route =>
      provider === 'whitebit'
        ? route.mappingStatus === 'supported'
        : route.status !== 'unsupported',
    ).map(route => route.networkId)));
    setReview(null);
    setError('');
  };

  const reviewSelection = async () => {
    if (!selected.size || !catalogReview) return;
    setReviewing(true);
    setError('');
    try {
      const result = await previewCryptoDepositProviderAssignment({
        networkIds: [...selected],
        depositProvider: provider as 'none' | 'manual' | 'whitebit',
        ...(provider === 'whitebit' && selectedWhitebitMappings.length
          ? { whitebitMappings: selectedWhitebitMappings.filter(mapping => selected.has(mapping.networkId)) }
          : {}),
      });
      setReview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not review the selected routes.');
    } finally {
      setReviewing(false);
    }
  };

  const confirm = async () => {
    if (!review || !userId || !isOwner || (provider === 'whitebit' && !consent)) return;
    setError('');
    setStarting(true);
    const op = pendingOp.current ?? crypto.randomUUID();
    pendingOp.current = op;
    const request: PendingRequest = {
      networkIds: review.routes.map(route => route.networkId),
      depositProvider: provider as 'none' | 'manual' | 'whitebit',
      reviewToken: review.reviewToken,
      operationId: op,
      confirmRealAddressCreation: true,
      monitoring: { rpcMonitoring, networkMonitor, assetMonitoring },
      ...(provider === 'whitebit' && selectedWhitebitMappings.length
        ? { whitebitMappings: selectedWhitebitMappings.filter(mapping => review.routes.some(route => route.networkId === mapping.networkId)) }
        : {}),
    };
    // Persist operation and exact request BEFORE the POST so a lost response is recoverable.
    localStorage.setItem(storageKey(userId), JSON.stringify({ operationId: op, request } satisfies Stored));
    savedRequest.current = request;
    setOperationId(op);
    try {
      const result = await createCryptoDepositProviderSwitchJob(request);
      notified.current = false;
      setReconnectError('');
      setJob(result);
    } catch (cause) {
      setError(errText(cause, 'Switch request failed. Submitting again reuses the same operation.'));
    } finally { setStarting(false); }
  };

  const selectedUnsupported: unknown[] = [];
  const selectedDepositsEnabled: unknown[] = [];

  return (
    <div className="drawer-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
      <aside className="order-drawer catalog-editor-drawer" role="dialog" aria-modal="true" aria-label="Bulk Deposit Provider assignment" data-testid="bulk-deposit-provider-dialog">
        <div className="drawer-head catalog-editor-head">
          <div className="catalog-editor-heading">
            <span className="catalog-editor-icon"><Network size={19} /></span>
            <div><span className="section-kicker">Crypto Networks</span><h2>Assign Deposit Provider</h2></div>
          </div>
          <button type="button" className="icon-button catalog-editor-close" onClick={onClose} aria-label="Close provider assignment"><X size={18} /></button>
        </div>
        <div className="catalog-editor-scroll scrollbar-thin">
          <div className="admin-form admin-form-card catalog-editor-form space-y-4">
            <p className="field-hint">Owner-only automated switch. For each selected route the server turns Customer Deposits off, assigns the provider, verifies it, then restores Customer Deposits only on routes that were originally ON. Routes can fail individually; failed routes can be retried.</p>
            <label><span className="field-label">Set Deposit Provider</span>
              <select data-testid="bulk-deposit-provider-target" value={provider} disabled={apply.isPending || !!job} onChange={event => { setProvider(event.target.value); setReview(null); setConsent(false); pendingOp.current = null; }}>
                {providerOptions.map(option => <option key={option.id} value={option.id} disabled={!option.implemented}>{option.label}{option.implemented ? '' : ' (not implemented)'}</option>)}
              </select>
            </label>
            {!isOwner && !permissions.isLoading && <div role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm text-amber-500" data-testid="bulk-deposit-owner-only">Only the Owner can run an automated Deposit Provider switch.</div>}
            {!job && !resuming && (
              <fieldset className="space-y-3 rounded-xl border border-border p-3 text-sm" data-testid="bulk-monitoring-controls" disabled={apply.isPending}>
                <legend className="field-label px-1">Monitoring (separate from Customer Deposits)</legend>
                <label className="block"><span className="field-label">RPC Monitoring (custody provider tracking)</span>
                  <select data-testid="bulk-rpc-monitoring-control" value={rpcMonitoring} onChange={event => { setRpcMonitoring(event.target.value as Rpc); setReview(null); }}>
                    <option value="auto">Automatic ({providerLabel(provider)})</option>
                    <option value="enable">Enable RPC Monitoring</option>
                    <option value="disable">Disable RPC Monitoring</option>
                    <option value="keep">Keep Current Settings</option>
                  </select></label>
                <label className="block"><span className="field-label">Network Monitor (shared per network)</span>
                  <select data-testid="bulk-network-monitor-control" value={networkMonitor} onChange={event => { setNetworkMonitor(event.target.value as Tri); setReview(null); }}>
                    {(['auto', 'enable', 'disable', 'keep'] as Tri[]).map(v => <option key={v} value={v}>{triLabel(v)}</option>)}
                  </select></label>
                <label className="block"><span className="field-label">Asset Monitoring (per asset)</span>
                  <select data-testid="bulk-asset-monitor-control" value={assetMonitoring} onChange={event => { setAssetMonitoring(event.target.value as Tri); setReview(null); }}>
                    {(['auto', 'enable', 'disable', 'keep'] as Tri[]).map(v => <option key={v} value={v}>{triLabel(v)}</option>)}
                  </select></label>
                <p className="field-hint break-words">Automatic: Manual Wallet enables tracking, network and asset monitoring, then live readiness is checked. WhiteBIT or None safely turns off unneeded polling without touching endpoints, providers, contracts or wallets, and keeps shared monitors that other obligations still need. Explicit Network/Asset choices override automatic defaults but never safety: a disable that conflicts with active obligations fails that route with Customer Deposits OFF. Manual cannot become ready while its required monitoring is disabled. Keep Current leaves a setting unchanged.</p>
              </fieldset>
            )}
            {error && <div role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-500">{error}</div>}
            {resuming && !job && <p className="text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Resuming previous switch…</p>}
            {!job && !resuming && loadingCatalog && <p className="text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Checking routes…</p>}
            {!job && !resuming && !loadingCatalog && catalogReview && (
              <>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="button button-secondary" onClick={selectAllSupported}>Select All Supported</button>
                  <button type="button" className="button button-secondary" onClick={() => { setSelected(new Set()); setReview(null); }}>Clear All</button>
                </div>
                <p className="field-hint">{selected.size} selected. “Select All Supported” includes only WhiteBIT routes with a validated explicit or exact network mapping. Customer Deposits remain controlled separately. Unsupported or unresolved mappings cannot be applied.</p>
                <input aria-label="Search Asset + Network routes" placeholder="Search asset or network (for example, XMR)" value={search} onChange={event => setSearch(event.target.value)} />
                <div className="max-h-72 overflow-y-auto space-y-2" data-testid="bulk-deposit-provider-routes">
                  {filtered.map(network => {
                    const status = statusById.get(network.id);
                    const asset = assetById.get(network.assetId);
                      const mappingStatus = status?.mappingStatus;
                      const mappingOptions = status?.whitebitNetworkOptions || [];
                      const mappingAsset = status?.whitebitAssetCode ||
                        network.whitebitAssetCode ||
                        asset?.code || '—';
                      const mappingValue = whitebitMappingChoices[network.id] ||
                        network.whitebitNetworkCode ||
                        (mappingStatus === 'supported' ? status?.whitebitNetworkCode : '') || '';
                      const whitebitMappingValid = status?.status === 'supported' &&
                        mappingStatus === 'supported' && Boolean(mappingValue);
                      const exactPermissionProof = whitebitVerificationRoutesQuery.data?.find(route =>
                        route.networkId === network.id &&
                        route.proofCurrent &&
                        route.assetCode.trim().toUpperCase() === mappingAsset.trim().toUpperCase() &&
                        route.networkCode.trim().toUpperCase() === mappingValue.trim().toUpperCase(),
                      );
                      return (
                       <div key={network.id} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex items-start gap-3">
                        <input type="checkbox" checked={selected.has(network.id)} disabled={apply.isPending} onChange={() => toggle(network.id)} aria-label={`Select ${asset?.code ?? network.assetId} ${network.networkCode}`} />
                        <span className="min-w-0"><strong>{asset?.code ?? network.assetId} · {network.networkCode}</strong>
                          <span className="block text-xs text-muted-foreground">{network.networkName} · Current: {network.depositProvider === 'whitebit' ? 'WhiteBIT' : network.depositProvider === 'manual' ? 'Manual Wallet' : 'None'}</span>
                          <span className="block text-xs">{status?.status === 'requires_configuration' ? 'Requires configuration' : status?.status === 'unsupported' ? 'Unsupported' : 'Supported'} — {status?.reason}</span>
                          {provider === 'whitebit' && (
                             <span className="mt-2 grid gap-1 rounded border border-border/70 p-2 text-xs sm:grid-cols-2" data-testid={`whitebit-readiness-${network.id}`}>
                               <span><strong>WhiteBIT route support:</strong> {loadingCatalog ? 'Checking' : whitebitMappingValid ? 'Supported' : 'Not supported'}</span>
                               <span><strong>Mapping:</strong> {loadingCatalog ? 'Checking' : whitebitMappingValid ? 'Valid' : mappingStatus === 'mapping_required' ? 'Required' : 'Invalid'}</span>
                               <span><strong>Credentials:</strong> {whitebitProviderStatusQuery.isLoading ? 'Checking' : whitebitProviderStatusQuery.isError ? 'Status unavailable' : whitebitProviderStatusQuery.data?.credentialsVerified ? 'Verified' : 'Verification required'}</span>
                               <span><strong>Address permission:</strong> {whitebitVerificationRoutesQuery.isLoading ? 'Checking' : whitebitVerificationRoutesQuery.isError ? 'Status unavailable' : exactPermissionProof ? 'Verified for this exact route' : 'Verification required'}</span>
                               <span className="sm:col-span-2"><strong>Ready for Widget:</strong> {network.widgetReadiness?.ready === true ? 'Ready for Widget' : network.widgetReadiness?.ready === false ? 'Cannot Enable' : 'Not evaluated'}</span>
                               <span className="sm:col-span-2">WhiteBIT Mapping Asset: {mappingAsset} · Network: {mappingValue || (mappingStatus === 'mapping_required' ? 'Mapping Required' : '—')}</span>
                               {whitebitProviderStatusQuery.isError && <span role="alert" className="text-destructive sm:col-span-2">WhiteBIT credential verification status could not be loaded.</span>}
                               {whitebitVerificationRoutesQuery.isError && <span role="alert" className="text-destructive sm:col-span-2">Exact-route permission status could not be loaded.</span>}
                             </span>
                          )}
                        </span>
                        </div>
                        {provider === 'whitebit' && mappingOptions.length > 0 && (
                          <label className="mt-2 block pl-7">
                            <span className="field-label">WhiteBIT Network for {asset?.code ?? network.assetId} · {network.networkCode}</span>
                            <select
                              aria-label={`WhiteBIT Network mapping for ${asset?.code ?? network.assetId} ${network.networkCode}`}
                              value={mappingValue}
                              disabled={apply.isPending}
                              onChange={event => {
                                setWhitebitMappingChoices(previous => {
                                  const next = { ...previous };
                                  if (event.target.value) next[network.id] = event.target.value;
                                  else delete next[network.id];
                                  return next;
                                });
                                setReview(null);
                              }}
                            >
                              <option value="">
                                {mappingOptions.length > 1 ? 'Choose explicitly; no network guessed' : 'Select advertised network'}
                              </option>
                              {mappingOptions.map(option => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </label>
                        )}
                        {provider === 'whitebit' && mappingOptions.length > 1 && mappingStatus === 'mapping_required' && (
                          <p className="mt-2 pl-7 text-xs text-amber-500">Multiple provider networks are advertised. Choose the exact WhiteBIT network; none is selected automatically.</p>
                        )}
                       </div>
                    );
                  })}
                  {!filtered.length && <p className="text-sm text-muted-foreground">No routes match your search.</p>}
                </div>
              </>
            )}
            {!job && review && (
              <section aria-label="Provider assignment review" className="space-y-2 rounded-xl border border-border p-3 text-sm" data-testid="bulk-deposit-provider-review">
                <h3 className="font-semibold">Review {review.routes.length} exact routes</h3>
                {review.routes.map(route => <div key={route.networkId} className="border-t border-border pt-2">
                  <strong>{route.assetCode} · {route.networkCode}</strong> — {route.status === 'requires_configuration' ? 'Requires configuration' : route.status === 'unsupported' ? 'Unsupported' : 'Supported'}
                  {provider === 'whitebit' && (
                          <p>WhiteBIT Mapping Asset: {route.whitebitAssetCode || route.assetCode} · Network: {route.whitebitNetworkCode || 'Mapping Required'} · Status: {route.mappingStatus === 'supported' ? 'Supported' : route.mappingStatus === 'unsupported' ? 'Unsupported' : 'Mapping Required'}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{route.reason} Customer Deposits: {route.customerDepositsAfter ? 'remain enabled' : 'disabled'}.</p>
                </div>)}
                <div className="rounded-lg border border-border p-3 text-xs space-y-1 break-words" data-testid="bulk-monitoring-review">
                  <p><strong>Monitoring plan:</strong> RPC: {rpcMonitoring === 'auto' ? `Automatic (${providerLabel(provider)})` : rpcMonitoring === 'keep' ? 'Keep Current Settings' : `${triLabel(rpcMonitoring)} RPC Monitoring`} · Network Monitor: {triLabel(networkMonitor)} · Asset Monitoring: {triLabel(assetMonitoring)}.</p>
                  <p>Final state per route is reported by the server after the switch; enabled does not mean connected.</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-xs space-y-2" data-testid="bulk-deposit-switch-explainer">
                  <p>The server will turn Customer Deposits off on each route, assign {providerLabel(provider)}, verify the saved provider, and restore Customer Deposits only on routes that were originally ON. Unsupported or failing routes fail individually; the rest proceed.</p>
                  {provider === 'none' && <p className="font-semibold">Choosing None removes the deposit provider and leaves every selected route OFF.</p>}
                  {provider === 'whitebit' && (
                    <>
                      <p>WhiteBIT verification performs real address-creation permission checks and may create a real deposit address on the selected WhiteBIT routes.</p>
                      <label className="flex items-start gap-2"><input type="checkbox" data-testid="bulk-deposit-switch-consent" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I allow real WhiteBIT address creation and permission checks for these routes.</span></label>
                    </>
                  )}
                </div>
              </section>
            )}
            {reconnectError && <div role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm text-amber-500" data-testid="bulk-deposit-switch-reconnect">{reconnectError}{' '}{!job && <button type="button" data-testid="button-bulk-deposit-reconnect" onClick={() => setResumeTick(tick => tick + 1)}>Reconnect</button>}{job && isActive(job) && <button type="button" data-testid="button-bulk-deposit-reconnect" onClick={() => setPollTick(tick => tick + 1)}>Retry now</button>}</div>}
            {job && <JobPanel job={job} networks={networks} assets={assets} retrying={retrying} onRetry={networkId => void retryRoute(networkId)} />}
            <div className="catalog-editor-actions">
              {job && !isActive(job) && <button type="button" data-testid="button-bulk-deposit-new-assignment" onClick={newAssignment}>New Assignment</button>}
              {job && <button type="button" onClick={onClose}>{isActive(job) ? 'Close (server keeps running)' : 'Close'}</button>}
              {!job && review && <button type="button" onClick={() => setReview(null)}>Back</button>}
              {!job && !resuming && <button type="button" className="catalog-editor-primary" data-testid="button-bulk-deposit-confirm" disabled={!isOwner || !catalogReview || !selected.size || reviewing || apply.isPending || (!!review && provider === 'whitebit' && !consent)} onClick={() => void (review ? confirm() : reviewSelection())}>
                {reviewing || apply.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {review ? 'Confirm and Start Switch' : 'Review Changes'}
              </button>}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
function JobPanel({ job, networks, assets, retrying, onRetry }: {
  job: DepositProviderSwitchJob; networks: CryptoNetwork[]; assets: CryptoAsset[]; retrying: string | null; onRetry: (networkId: string) => void;
}) {
  const nameOf = (id: string) => {
    const network = networks.find(n => n.id === id);
    const asset = assets.find(a => a.id === network?.assetId);
    return network ? `${asset?.code ?? network.assetId} · ${network.networkCode}` : id;
  };
  const done = job.routes.filter(r => r.status === 'succeeded' || r.status === 'failed').length;
  const failed = job.routes.filter(r => r.status === 'failed').length;
  const succeeded = job.routes.filter(r => r.status === 'succeeded').length;
  const active = isActive(job);
  const pct = job.routes.length ? Math.round(done / job.routes.length * 100) : 0;
  return (
    <section className="space-y-2 rounded-xl border border-border p-3 text-sm" data-testid="bulk-deposit-switch-progress" aria-live="polite">
      <h3 className="font-semibold">Switch to {providerLabel(job.depositProvider)} · {done} of {job.routes.length} finished</h3>
      <div className="h-2 w-full overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {job.routes.map(route => (
          <div key={route.networkId} className="rounded-lg border border-border p-2" data-testid={`bulk-deposit-switch-route-${route.networkId}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{nameOf(route.networkId)}</strong>
              <span className={route.status === 'failed' ? 'text-red-500' : route.status === 'succeeded' ? 'text-emerald-500' : 'text-muted-foreground'}>
                {route.status === 'running' && <Loader2 size={13} className="mr-1 inline animate-spin" />}{route.status} · {route.step}
              </span>
            </div>
            <p className="text-xs text-muted-foreground break-words">{route.message}{route.errorCode ? ` (${route.errorCode})` : ''}</p>
            <p className="text-xs">Customer Deposits: originally {route.originalCustomerDepositsEnabled ? 'ON' : 'OFF'}, now {route.customerDepositsEnabled ? 'ON' : 'OFF'} · Saved provider: {providerLabel(route.savedProvider)} · Attempts: {route.attempts}</p>
            <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-2 break-words" data-testid={`bulk-monitoring-result-${route.networkId}`}>
              <div data-testid={`bulk-result-provider-${route.networkId}`}>Final provider: {providerLabel(route.savedProvider)}</div>
              <div data-testid={`bulk-result-rpc-status-${route.networkId}`}>RPC status: {route.rpcStatus ?? 'Not reported'}</div>
              <div data-testid={`bulk-result-network-monitor-${route.networkId}`}>Network Monitor: {yn(route.networkMonitorEnabled)}</div>
              <div data-testid={`bulk-result-asset-monitoring-${route.networkId}`}>Asset Monitoring: {yn(route.assetMonitoringEnabled)}</div>
              <div data-testid={`bulk-result-rpc-tracking-${route.networkId}`}>RPC tracking: {route.rpcTrackingEnabled === undefined ? 'Not reported' : route.rpcTrackingEnabled ? 'Enabled' : 'Disabled'}</div>
              <div data-testid={`bulk-result-deposits-${route.networkId}`}>Customer Deposits: {route.customerDepositsEnabled ? 'ON' : 'OFF'}</div>
              {route.monitoringMessage && <div className="sm:col-span-2" data-testid={`bulk-result-monitoring-message-${route.networkId}`}>{route.monitoringMessage}</div>}
            </dl>
            {route.status === 'failed' && (
              <button type="button" className="button button-secondary mt-2" data-testid={`button-retry-route-${route.networkId}`} disabled={retrying !== null} onClick={() => onRetry(route.networkId)}>
                {retrying === route.networkId ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Retry route
              </button>
            )}
          </div>
        ))}
      </div>
      {!active && <p data-testid="bulk-deposit-switch-summary" className={failed ? 'text-amber-500' : 'text-emerald-500'}>Finished: {succeeded} succeeded, {failed} failed.{failed ? ' Retry failed routes individually.' : ''}</p>}
    </section>
  );
}
