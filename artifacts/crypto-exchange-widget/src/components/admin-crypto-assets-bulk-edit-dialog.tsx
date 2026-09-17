import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useApplyCryptoAssetsBulkEdit } from '@workspace/api-client-react';
import type { CryptoAsset, CryptoNetwork, DepositProviderOption, CryptoAssetsBulkEditInput } from '@workspace/api-client-react';
import { Loader2, CircleAlert, CheckCircle } from 'lucide-react';
import { queryClient, apiErrorText } from '../App';
import { 
  getGetCryptoAssetsQueryKey, 
  getGetCryptoNetworksQueryKey, 
  getGetExchangeConfigQueryKey 
} from '@workspace/api-client-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAssetIds: string[];
  assets: CryptoAsset[];
  networks: CryptoNetwork[];
  providers: DepositProviderOption[];
  providersLoading?: boolean;
  providersError?: boolean;
  onSuccess: () => void;
}

export function AdminCryptoAssetsBulkEditDialog({
  open,
  onOpenChange,
  selectedAssetIds,
  assets,
  networks,
  providers,
  providersLoading = false,
  providersError = false,
  onSuccess,
}: Props) {
  const applyMutation = useApplyCryptoAssetsBulkEdit();

  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [apiError, setApiError] = useState<string | null>(null);
  const [reviewPayload, setReviewPayload] = useState<CryptoAssetsBulkEditInput | null>(null);

  // Asset Level Applications
  const [applyAssetEnabled, setApplyAssetEnabled] = useState(false);
  const [assetEnabled, setAssetEnabled] = useState(true);

  const [applyAssetLifecycle, setApplyAssetLifecycle] = useState(false);
  const [assetLifecycle, setAssetLifecycle] = useState<'active' | 'restricted' | 'deprecated'>('active');

  const [applyAssetPrecision, setApplyAssetPrecision] = useState(false);
  const [assetPrecision, setAssetPrecision] = useState(18);

  // Network Level Applications
  const [applyNetEnabled, setApplyNetEnabled] = useState(false);
  const [netEnabled, setNetEnabled] = useState(true);

  const [applyNetCustomerDeposits, setApplyNetCustomerDeposits] = useState(false);
  const [netCustomerDeposits, setNetCustomerDeposits] = useState(true);

  const [applyNetProvider, setApplyNetProvider] = useState(false);
  const [netProvider, setNetProvider] = useState('');

  const [applyNetLifecycle, setApplyNetLifecycle] = useState(false);
  const [netLifecycle, setNetLifecycle] = useState<'active' | 'restricted' | 'deprecated'>('active');

  const [applyNetRegions, setApplyNetRegions] = useState(false);
  const [netRegions, setNetRegions] = useState<string>(''); 

  const [applyNetPrecision, setApplyNetPrecision] = useState(false);
  const [netPrecision, setNetPrecision] = useState(18);

  const [applyNetRequiresMemo, setApplyNetRequiresMemo] = useState(false);
  const [netRequiresMemo, setNetRequiresMemo] = useState(false);

  const [applyNetSharedAddress, setApplyNetSharedAddress] = useState(false);
  const [netSharedAddress, setNetSharedAddress] = useState('');

  const [applyNetSharedMemo, setApplyNetSharedMemo] = useState(false);
  const [netSharedMemo, setNetSharedMemo] = useState('');

  const allTargetableNetworks = useMemo(() => {
    return networks.filter(n => selectedAssetIds.includes(n.assetId));
  }, [networks, selectedAssetIds]);

  const [selectedNetworkIds, setSelectedNetworkIds] = useState<Set<string>>(() => new Set(allTargetableNetworks.map(n => n.id)));

  const uniqueNetworkCodes = useMemo(() => {
    return Array.from(new Set(allTargetableNetworks.map(n => n.networkCode))).sort();
  }, [allTargetableNetworks]);

  const toggleNetworkId = (id: string, checked: boolean) => {
    setSelectedNetworkIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllNetworks = () => setSelectedNetworkIds(new Set(allTargetableNetworks.map(n => n.id)));
  const clearAllNetworks = () => setSelectedNetworkIds(new Set());
  const selectByNetworkCode = (code: string, checked: boolean) => {
    setSelectedNetworkIds(prev => {
      const next = new Set(prev);
      for (const n of allTargetableNetworks) {
        if (n.networkCode === code) {
          if (checked) next.add(n.id);
          else next.delete(n.id);
        }
      }
      return next;
    });
  };

  const anySettingApplied = applyAssetEnabled || applyAssetLifecycle || applyAssetPrecision ||
    applyNetEnabled || applyNetCustomerDeposits || applyNetProvider || applyNetLifecycle ||
    applyNetRegions || applyNetPrecision || applyNetRequiresMemo || applyNetSharedAddress || applyNetSharedMemo;

  const anyNetworkSettingApplied = applyNetEnabled || applyNetCustomerDeposits || applyNetProvider || applyNetLifecycle ||
    applyNetRegions || applyNetPrecision || applyNetRequiresMemo || applyNetSharedAddress || applyNetSharedMemo;

  const selectedTargetAssets = assets.filter(a => selectedAssetIds.includes(a.id));

  // Validation
  const isValid = anySettingApplied
    && selectedAssetIds.length > 0
    && (!anyNetworkSettingApplied || selectedNetworkIds.size > 0)
    && (!applyNetProvider || (!providersLoading && !providersError && Boolean(netProvider)));

  const getPayload = (): CryptoAssetsBulkEditInput => {
    const edits = selectedAssetIds.map(assetId => {
      const assetEdits: any = { assetId };
      if (applyAssetEnabled) assetEdits.enabled = assetEnabled;
      if (applyAssetLifecycle) assetEdits.lifecycle = assetLifecycle;
      if (applyAssetPrecision) assetEdits.decimals = assetPrecision;

      const networksForAsset = allTargetableNetworks.filter(n => n.assetId === assetId && selectedNetworkIds.has(n.id));
      if (networksForAsset.length > 0 && anyNetworkSettingApplied) {
        assetEdits.networks = networksForAsset.map(n => {
          const netEdit: any = { networkId: n.id };
          if (applyNetEnabled) netEdit.enabled = netEnabled;
          if (applyNetCustomerDeposits) netEdit.customerDepositsEnabled = netCustomerDeposits;
          if (applyNetProvider) netEdit.depositProvider = netProvider;
          if (applyNetLifecycle) netEdit.lifecycle = netLifecycle;
          if (applyNetRegions) netEdit.regions = netRegions.split(',').map(s => s.trim()).filter(Boolean);
          if (applyNetPrecision) netEdit.decimals = netPrecision;
          if (applyNetRequiresMemo) netEdit.requiresMemo = netRequiresMemo;
          if (applyNetSharedAddress) netEdit.sharedDepositAddress = netSharedAddress;
          if (applyNetSharedMemo) netEdit.sharedDepositMemo = netSharedMemo.trim() || null;
          return netEdit;
        });
      }
      return assetEdits;
    }).filter(e => {
      return e.enabled !== undefined || e.lifecycle !== undefined || e.decimals !== undefined || (e.networks && e.networks.length > 0);
    });

    return { edits };
  };

  const handleApply = () => {
    setApiError(null);
    const payload = reviewPayload;
    
    if (!payload || payload.edits.length === 0) {
      setApiError("No changes computed. Verify your apply selections.");
      return;
    }

    applyMutation.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCryptoAssetsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() });
        onSuccess();
      },
      onError: (err) => {
        setApiError(apiErrorText(err, "Failed to apply bulk edits."));
      }
    });
  };

  const enableAllCompatibleNetworks = () => {
    selectAllNetworks();
    setApplyNetEnabled(true);
    setNetEnabled(true);
  };

  const disableAllNetworks = () => {
    selectAllNetworks();
    setApplyNetEnabled(true);
    setNetEnabled(false);
  };

  const reviewChanges = () => {
    const payload = getPayload();
    if (payload.edits.length === 0) {
      setApiError('No changes computed. Verify your apply selections.');
      return;
    }
    setApiError(null);
    setReviewPayload(payload);
    setStep('confirm');
  };

  const reviewedNetworkCount = reviewPayload?.edits.reduce(
    (count, edit) => count + (edit.networks?.length ?? 0),
    0,
  ) ?? 0;
  const reviewedAssetCount = reviewPayload?.edits.length ?? 0;
  const reviewedAssetIds = new Set(reviewPayload?.edits.map(edit => edit.assetId) ?? []);
  const displayedTargetAssets = step === 'confirm'
    ? selectedTargetAssets.filter(asset => reviewedAssetIds.has(asset.id))
    : selectedTargetAssets;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[800px] max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col p-0 overflow-hidden bg-card">
        <DialogHeader className="px-6 py-4 border-b border-border bg-card">
          <DialogTitle>Bulk Edit Crypto Assets</DialogTitle>
          <DialogDescription>
            {step === 'edit'
              ? `Configuring updates for ${selectedTargetAssets.length} assets.`
              : `Confirm updates for ${reviewedAssetCount} assets.`}
          </DialogDescription>
          <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Selected crypto assets">
            {displayedTargetAssets.map(asset => (
              <span key={asset.id} className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold">
                {asset.code} <span className="font-normal text-muted-foreground">· {asset.name}</span>
              </span>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 min-h-0 bg-muted/10">
          {apiError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-md flex items-center gap-2 text-sm">
              <CircleAlert size={16} className="shrink-0" />
              <span>{apiError}</span>
            </div>
          )}

          {step === 'edit' && (
            <>
              {/* Asset Level Settings */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Asset Settings</h3>
                <div className="bg-card border border-border rounded-xl p-5 grid gap-5">
                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyAssetEnabled} onChange={e => setApplyAssetEnabled(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Asset Status</span>
                    </label>
                    <select aria-label="Asset Status" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50" disabled={!applyAssetEnabled} value={assetEnabled ? 'true' : 'false'} onChange={e => setAssetEnabled(e.target.value === 'true')}>
                      <option value="true">Enabled (Active)</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyAssetLifecycle} onChange={e => setApplyAssetLifecycle(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Asset Lifecycle</span>
                    </label>
                    <select aria-label="Asset Lifecycle" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50" disabled={!applyAssetLifecycle} value={assetLifecycle} onChange={e => setAssetLifecycle(e.target.value as any)}>
                      <option value="active">Active</option>
                      <option value="restricted">Restricted</option>
                      <option value="deprecated">Deprecated</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyAssetPrecision} onChange={e => setApplyAssetPrecision(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Asset Precision</span>
                    </label>
                    <input aria-label="Asset Precision" type="number" min="0" max="30" className="border border-border bg-background rounded-md text-sm px-3 py-2 w-24 disabled:opacity-50" disabled={!applyAssetPrecision} value={assetPrecision} onChange={e => setAssetPrecision(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              </div>

              {/* Network Level Settings */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Network Settings</h3>
                <p className="text-sm text-muted-foreground">Applies only to targeted compatible network rows within the selected assets.</p>
                <div className="bg-card border border-border rounded-xl p-5 grid gap-5 grid-cols-1 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetEnabled} onChange={e => setApplyNetEnabled(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Network Status</span>
                    </label>
                    <select aria-label="Network Status" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50" disabled={!applyNetEnabled} value={netEnabled ? 'true' : 'false'} onChange={e => setNetEnabled(e.target.value === 'true')}>
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetCustomerDeposits} onChange={e => setApplyNetCustomerDeposits(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Customer Deposits</span>
                    </label>
                    <select aria-label="Customer Deposits" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50" disabled={!applyNetCustomerDeposits} value={netCustomerDeposits ? 'true' : 'false'} onChange={e => setNetCustomerDeposits(e.target.value === 'true')}>
                      <option value="true">ON (Allowed)</option>
                      <option value="false">OFF (Paused)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetProvider} onChange={e => setApplyNetProvider(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Provider Policy</span>
                    </label>
                    <select aria-label="Provider Policy" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50" disabled={!applyNetProvider} value={netProvider} onChange={e => setNetProvider(e.target.value)}>
                      <option value="" disabled>
                        {providersLoading ? 'Loading providers…' : providersError ? 'Providers unavailable' : 'Select Provider'}
                      </option>
                      {providers.map(p => (
                        <option key={p.id} value={p.id} disabled={!p.implemented}>{p.label}{p.implemented ? '' : ' (Unavailable)'}</option>
                      ))}
                    </select>
                    {applyNetProvider && providersError && (
                      <p className="text-xs text-destructive">Provider options could not be loaded. Retry before applying this setting.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetLifecycle} onChange={e => setApplyNetLifecycle(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Network Lifecycle</span>
                    </label>
                    <select aria-label="Network Lifecycle" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50" disabled={!applyNetLifecycle} value={netLifecycle} onChange={e => setNetLifecycle(e.target.value as any)}>
                      <option value="active">Active</option>
                      <option value="restricted">Restricted</option>
                      <option value="deprecated">Deprecated</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetRegions} onChange={e => setApplyNetRegions(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Regions</span>
                    </label>
                    <input aria-label="Regions" type="text" placeholder="US, GB, CA (comma separated)" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50 w-full" disabled={!applyNetRegions} value={netRegions} onChange={e => setNetRegions(e.target.value)} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetPrecision} onChange={e => setApplyNetPrecision(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Network Precision</span>
                    </label>
                    <input aria-label="Network Precision" type="number" min="0" max="30" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50" disabled={!applyNetPrecision} value={netPrecision} onChange={e => setNetPrecision(parseInt(e.target.value) || 0)} />
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetRequiresMemo} onChange={e => setApplyNetRequiresMemo(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Requires Memo metadata</span>
                    </label>
                    <select aria-label="Requires Memo" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50" disabled={!applyNetRequiresMemo} value={netRequiresMemo ? 'true' : 'false'} onChange={e => setNetRequiresMemo(e.target.value === 'true')}>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetSharedAddress} onChange={e => setApplyNetSharedAddress(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Fallback Wallet Address</span>
                    </label>
                    <input aria-label="Fallback Wallet Address" type="text" placeholder="Shared wallet address" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50 w-full" disabled={!applyNetSharedAddress} value={netSharedAddress} onChange={e => setNetSharedAddress(e.target.value)} />
                  </div>

                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-600 w-4 h-4 bg-transparent" checked={applyNetSharedMemo} onChange={e => setApplyNetSharedMemo(e.target.checked)} />
                      <span className="text-sm font-semibold">Apply this change: Fallback Memo/Tag</span>
                    </label>
                    <input aria-label="Fallback Memo or Tag" type="text" placeholder="Leave empty to send null and clear" className="border border-border bg-background rounded-md text-sm px-3 py-2 disabled:opacity-50 w-full" disabled={!applyNetSharedMemo} value={netSharedMemo} onChange={e => setNetSharedMemo(e.target.value)} />
                    {applyNetSharedMemo && !netSharedMemo.trim() && (
                      <p className="text-[11px] text-amber-500">Leaving this empty will CLEAR the fallback memo on all targeted networks.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Target Networks selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Network Scope Targeting</h3>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/40 p-3 border-b border-border flex items-center justify-between gap-4 flex-wrap">
                     <div className="flex w-full flex-wrap gap-2">
                       <button type="button" className="text-xs font-semibold px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90" onClick={enableAllCompatibleNetworks}>
                         Enable All Compatible Networks
                       </button>
                       <button type="button" className="text-xs font-semibold px-3 py-2 rounded-md bg-background border border-border hover:bg-muted" onClick={disableAllNetworks}>
                         Disable All Networks
                       </button>
                     </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="text-xs font-semibold px-3 py-1.5 rounded-md bg-background border border-border hover:bg-muted" onClick={selectAllNetworks}>Select All</button>
                      <button type="button" className="text-xs font-semibold px-3 py-1.5 rounded-md bg-background border border-border hover:bg-muted" onClick={clearAllNetworks}>Clear All</button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground mr-1">By Code:</span>
                      {uniqueNetworkCodes.map(code => {
                        const isAllSelected = allTargetableNetworks.filter(n => n.networkCode === code).every(n => selectedNetworkIds.has(n.id));
                        return (
                          <label key={code} className="flex items-center gap-1.5 text-xs bg-background border border-border px-2 py-1 rounded cursor-pointer hover:bg-muted">
                            <input type="checkbox" checked={isAllSelected} onChange={e => selectByNetworkCode(code, e.target.checked)} />
                            {code}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="max-h-60 overflow-y-auto p-4 space-y-4">
                    {selectedTargetAssets.map(asset => {
                      const assetNetworks = allTargetableNetworks.filter(n => n.assetId === asset.id);
                      return (
                        <div key={asset.id} className="space-y-2">
                          <div className="font-semibold text-sm flex items-center gap-2">
                            <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">{asset.code}</span>
                            <span>{asset.name}</span>
                          </div>
                          {assetNetworks.length > 0 ? (
                            <div className="pl-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {assetNetworks.map(n => (
                                <label key={n.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 -ml-1 rounded">
                                  <input type="checkbox" checked={selectedNetworkIds.has(n.id)} onChange={e => toggleNetworkId(n.id, e.target.checked)} className="rounded border-slate-600 bg-transparent" />
                                  <span>{n.networkCode}</span>
                                  {n.lifecycle !== 'active' && <span className="text-[10px] bg-muted px-1 rounded">{n.lifecycle}</span>}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="pl-4 text-xs text-muted-foreground italic">No compatible network rows.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 text-center space-y-2">
                <h3 className="text-lg font-bold">You are about to edit {reviewedAssetCount} assets</h3>
                <p className="text-sm text-muted-foreground">
                  {anyNetworkSettingApplied
                    ? `Across ${reviewedNetworkCount} compatible network assignments.`
                    : 'Network settings will not change.'}
                </p>
              </div>

              <div className="bg-card border border-border rounded-xl p-0 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-4 py-2 border-b border-border font-semibold text-xs uppercase tracking-wider text-muted-foreground w-1/2">Field</th>
                      <th className="px-4 py-2 border-b border-border font-semibold text-xs uppercase tracking-wider text-muted-foreground w-1/2">New Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {applyAssetEnabled && (
                      <tr><td className="px-4 py-3 font-medium">Asset Status</td><td className="px-4 py-3">{assetEnabled ? 'Enabled' : 'Disabled'}</td></tr>
                    )}
                    {applyAssetLifecycle && (
                      <tr><td className="px-4 py-3 font-medium">Asset Lifecycle</td><td className="px-4 py-3 capitalize">{assetLifecycle}</td></tr>
                    )}
                    {applyAssetPrecision && (
                      <tr><td className="px-4 py-3 font-medium">Asset Precision</td><td className="px-4 py-3">{assetPrecision} decimals</td></tr>
                    )}
                    
                    {anyNetworkSettingApplied && (
                      <tr className="bg-muted/20">
                         <td colSpan={2} className="px-4 py-2 font-bold text-xs uppercase tracking-wider text-primary">Targeting {reviewedNetworkCount} Networks</td>
                      </tr>
                    )}
                    {applyNetEnabled && (
                      <tr><td className="px-4 py-3 font-medium">Network Status</td><td className="px-4 py-3">{netEnabled ? 'Enabled' : 'Disabled'}</td></tr>
                    )}
                    {applyNetCustomerDeposits && (
                      <tr><td className="px-4 py-3 font-medium">Customer Deposits</td><td className="px-4 py-3">{netCustomerDeposits ? 'Allowed' : 'Paused'}</td></tr>
                    )}
                    {applyNetProvider && (
                      <tr><td className="px-4 py-3 font-medium">Deposit Provider</td><td className="px-4 py-3">{providers.find(p => p.id === netProvider)?.label || netProvider}</td></tr>
                    )}
                    {applyNetLifecycle && (
                      <tr><td className="px-4 py-3 font-medium">Network Lifecycle</td><td className="px-4 py-3 capitalize">{netLifecycle}</td></tr>
                    )}
                    {applyNetRegions && (
                      <tr><td className="px-4 py-3 font-medium">Regions</td><td className="px-4 py-3">{netRegions.trim() ? netRegions : <span className="text-muted-foreground italic">Cleared</span>}</td></tr>
                    )}
                    {applyNetPrecision && (
                      <tr><td className="px-4 py-3 font-medium">Network Precision</td><td className="px-4 py-3">{netPrecision} decimals</td></tr>
                    )}
                    {applyNetRequiresMemo && (
                      <tr><td className="px-4 py-3 font-medium">Requires Memo</td><td className="px-4 py-3">{netRequiresMemo ? 'Yes' : 'No'}</td></tr>
                    )}
                    {applyNetSharedAddress && (
                      <tr><td className="px-4 py-3 font-medium">Fallback Address</td><td className="px-4 py-3 break-all">{netSharedAddress.trim() ? netSharedAddress : <span className="text-destructive font-semibold">Cleared (Warning)</span>}</td></tr>
                    )}
                    {applyNetSharedMemo && (
                      <tr><td className="px-4 py-3 font-medium">Fallback Memo</td><td className="px-4 py-3 break-all">{netSharedMemo.trim() ? netSharedMemo : <span className="text-amber-500 font-semibold">Cleared (Null)</span>}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-card">
          <button
            type="button"
              onClick={() => {
                if (step === 'confirm') {
                  setReviewPayload(null);
                  setStep('edit');
                } else {
                  onOpenChange(false);
                }
              }}
            className="px-4 py-2 rounded-lg font-bold text-sm bg-background border border-border hover:bg-muted mr-auto"
            disabled={applyMutation.isPending}
          >
            {step === 'confirm' ? 'Back' : 'Cancel'}
          </button>
          
          {step === 'edit' ? (
            <button
              type="button"
              disabled={!isValid}
               onClick={reviewChanges}
              className="px-4 py-2 rounded-lg font-bold text-sm bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Review Changes
            </button>
          ) : (
            <button
              type="button"
              disabled={applyMutation.isPending}
              onClick={handleApply}
              className="px-6 py-2 rounded-lg font-bold text-sm bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {applyMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
              Confirm and Apply
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
