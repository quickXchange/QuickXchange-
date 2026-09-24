import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Network, X } from 'lucide-react';
import {
  previewCryptoDepositProviderAssignment,
  useApplyCryptoDepositProviderAssignment,
  getGetCryptoNetworksQueryKey,
  getGetExchangeConfigQueryKey,
  getGetWhitebitVerificationRoutesQueryKey,
  getGetWhitebitProviderStatusQueryKey,
} from '@workspace/api-client-react';
import type {
  CryptoAsset,
  CryptoNetwork,
  CryptoDepositProviderAssignmentPreview,
} from '@workspace/api-client-react';

type Provider = 'none' | 'manual' | 'whitebit';

export function BulkDepositProviderDialog({
  networks, assets, initialNetworkIds, onClose, onSuccess,
}: {
  networks: CryptoNetwork[];
  assets: CryptoAsset[];
  initialNetworkIds: string[];
  onClose: () => void;
  onSuccess: (count: number) => void;
}) {
  const client = useQueryClient();
  const apply = useApplyCryptoDepositProviderAssignment();
  const [provider, setProvider] = useState<Provider>('whitebit');
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
      depositProvider: provider,
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
        depositProvider: provider,
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
    if (!review || review.routes.some(route => route.status === 'unsupported' ||
      route.customerDepositsAfter && (route.currentProvider !== provider ||
        provider === 'whitebit' && selectedWhitebitMappings.some(mapping =>
          mapping.networkId === route.networkId &&
          (mapping.assetCode !== route.whitebitAssetCode || mapping.networkCode !== route.whitebitNetworkCode)
        )))) return;
    setError('');
    try {
      const result = await apply.mutateAsync({
        data: {
          networkIds: review.routes.map(route => route.networkId),
          depositProvider: provider,
          reviewToken: review.reviewToken,
          ...(provider === 'whitebit' && selectedWhitebitMappings.length
            ? { whitebitMappings: selectedWhitebitMappings.filter(mapping => review.routes.some(route => route.networkId === mapping.networkId)) }
            : {}),
        },
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() }),
        client.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
        client.invalidateQueries({ queryKey: getGetWhitebitVerificationRoutesQueryKey() }),
        client.invalidateQueries({ queryKey: getGetWhitebitProviderStatusQueryKey() }),
      ]);
      onSuccess(result.networks.length);
    } catch (cause) {
      setReview(null);
      setError(cause instanceof Error ? cause.message : 'Assignment failed. Review the routes again.');
    }
  };

  const selectedUnsupported = review?.routes.filter(route => route.status === 'unsupported' ||
    provider === 'whitebit' && route.mappingStatus !== 'supported') ?? [];
  const selectedDepositsEnabled = review?.routes.filter(route =>
    route.customerDepositsAfter && (route.currentProvider !== provider ||
      route.reason.includes('Turn off Customer Deposits'))) ?? [];

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
            <p className="field-hint">Select exact Asset + Network routes. This changes only their Deposit Provider. Turn off Customer Deposits in its own control before switching an enabled route. Saved manual addresses, memos and Manual Wallet Tracking remain unchanged. It never creates a WhiteBIT address.</p>
            <label><span className="field-label">Set Deposit Provider</span>
              <select data-testid="bulk-deposit-provider-target" value={provider} disabled={apply.isPending} onChange={event => { setProvider(event.target.value as Provider); setReview(null); }}>
                <option value="whitebit">WhiteBIT</option>
                <option value="manual">Manual Wallet</option>
                <option value="none">None</option>
              </select>
            </label>
            {error && <div role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-500">{error}</div>}
            {loadingCatalog && <p className="text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Checking routes…</p>}
            {!loadingCatalog && catalogReview && (
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
                      return (
                       <div key={network.id} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex items-start gap-3">
                        <input type="checkbox" checked={selected.has(network.id)} disabled={apply.isPending} onChange={() => toggle(network.id)} aria-label={`Select ${asset?.code ?? network.assetId} ${network.networkCode}`} />
                        <span className="min-w-0"><strong>{asset?.code ?? network.assetId} · {network.networkCode}</strong>
                          <span className="block text-xs text-muted-foreground">{network.networkName} · Current: {network.depositProvider === 'whitebit' ? 'WhiteBIT' : network.depositProvider === 'manual' ? 'Manual Wallet' : 'None'}</span>
                          <span className="block text-xs">{status?.status === 'requires_configuration' ? 'Requires configuration' : status?.status === 'unsupported' ? 'Unsupported' : 'Supported'} — {status?.reason}</span>
                          {provider === 'whitebit' && (
                            <span className="block text-xs">
                              WhiteBIT Mapping Asset: {mappingAsset} · Network: {mappingValue || (mappingStatus === 'mapping_required' ? 'Mapping Required' : '—')} · Status: {mappingStatus === 'supported' ? 'Supported' : mappingStatus === 'unsupported' ? 'Unsupported' : 'Mapping Required'}
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
            {review && (
              <section aria-label="Provider assignment review" className="space-y-2 rounded-xl border border-border p-3 text-sm" data-testid="bulk-deposit-provider-review">
                <h3 className="font-semibold">Review {review.routes.length} exact routes</h3>
                {review.routes.map(route => <div key={route.networkId} className="border-t border-border pt-2">
                  <strong>{route.assetCode} · {route.networkCode}</strong> — {route.status === 'requires_configuration' ? 'Requires configuration' : route.status === 'unsupported' ? 'Unsupported' : 'Supported'}
                  {provider === 'whitebit' && (
                          <p>WhiteBIT Mapping Asset: {route.whitebitAssetCode || route.assetCode} · Network: {route.whitebitNetworkCode || 'Mapping Required'} · Status: {route.mappingStatus === 'supported' ? 'Supported' : route.mappingStatus === 'unsupported' ? 'Unsupported' : 'Mapping Required'}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{route.reason} Customer Deposits: {route.customerDepositsAfter ? 'remain enabled' : 'disabled'}.</p>
                </div>)}
                {selectedUnsupported.length > 0 && <p role="alert" className="text-red-500">Deselect {selectedUnsupported.length} unsupported {selectedUnsupported.length === 1 ? 'route' : 'routes'} before applying.</p>}
                {selectedDepositsEnabled.length > 0 && <p role="alert" className="text-red-500">Turn off Customer Deposits for {selectedDepositsEnabled.length} selected {selectedDepositsEnabled.length === 1 ? 'route' : 'routes'} in their own controls before switching providers. Then review again.</p>}
              </section>
            )}
            <div className="catalog-editor-actions">
              {review && <button type="button" onClick={() => setReview(null)}>Back</button>}
              <button type="button" className="catalog-editor-primary" disabled={!catalogReview || !selected.size || reviewing || apply.isPending || selectedUnsupported.length > 0 || selectedDepositsEnabled.length > 0} onClick={() => void (review ? confirm() : reviewSelection())}>
                {reviewing || apply.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {review ? 'Confirm Assignment' : 'Review Changes'}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}