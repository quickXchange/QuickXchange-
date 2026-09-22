import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Play, Save, Check, X, ShieldCheck } from 'lucide-react';
import {
  CryptoNetwork,
  useListBlockchainMonitoringNetworks,
  useCreateBlockchainMonitoringNetwork,
  useUpdateBlockchainMonitoringNetwork,
  useTestBlockchainMonitoringNetwork,
  useListBlockchainMonitoringAssets,
  useUpsertBlockchainMonitoringAsset
} from '@workspace/api-client-react';
import { apiErrorText } from '../App';
import { InlineNotice } from '../App';

export function BlockchainMonitorConfig({ network, networkCode }: { network: CryptoNetwork; networkCode: string }) {
  const queryClient = useQueryClient();
  const monitorNetworks = useListBlockchainMonitoringNetworks({ query: { queryKey: ['listBlockchainMonitoringNetworks'] } });
  const monitorAssets = useListBlockchainMonitoringAssets({ query: { queryKey: ['listBlockchainMonitoringAssets'] } });

  const createNet = useCreateBlockchainMonitoringNetwork();
  const updateNet = useUpdateBlockchainMonitoringNetwork();
  const testNet = useTestBlockchainMonitoringNetwork();
  const upsertAsset = useUpsertBlockchainMonitoringAsset();

  const existingNet = monitorNetworks.data?.items.find(n => n.networkCode === networkCode);
  const existingAsset = monitorAssets.data?.items.find(a => a.assetNetworkId === network.id);
  const endpointReady = Boolean(existingNet && (existingNet as any).endpointConfigured);
  const identityReady = Boolean(existingAsset && existingAsset.enabled && (
    existingAsset.identityKind === 'native'
      ? !existingAsset.contractOrMint
      : Boolean(existingAsset.contractOrMint)
  ));
  const healthCheckedAtMs = existingNet?.healthCheckedAt
    ? new Date(existingNet.healthCheckedAt).getTime()
    : 0;
  const healthFresh = healthCheckedAtMs > 0 &&
    Date.now() - healthCheckedAtMs >= 0 &&
    Date.now() - healthCheckedAtMs <= Math.max(120_000, (existingNet?.pollIntervalSeconds ?? 15) * 3_000);
  const providerCompatible = Boolean(existingNet && (
    existingNet.adapterKind === 'evm' && existingNet.providerKind === 'rpc' ||
    existingNet.adapterKind === 'solana' && existingNet.providerKind === 'rpc' ||
    existingNet.adapterKind === 'tron' && existingNet.providerKind === 'indexer' ||
    existingNet.adapterKind === 'bitcoin' && existingNet.providerKind === 'rpc'
  ));
  const readinessReasons: string[] = [];
  if (!existingNet) readinessReasons.push('Network monitor not configured');
  else if (!existingNet.enabled) readinessReasons.push('Network monitor disabled');
  else if (!endpointReady) readinessReasons.push('Endpoint secret not configured');
  else if (!providerCompatible) readinessReasons.push('Incompatible provider/adapter combination');
  else if (existingNet.healthStatus === 'not_configured') readinessReasons.push('Provider not configured');
  else if (existingNet.healthStatus !== 'connected') readinessReasons.push('Provider disconnected');
  else if (!healthFresh) readinessReasons.push('Health check stale');

  if (!existingAsset) readinessReasons.push('Asset monitor not configured');
  else if (!existingAsset.enabled) readinessReasons.push('Asset monitor disabled');
  else if (!identityReady) readinessReasons.push('Asset identity incomplete');

  if (network.monitoringReadiness?.ready === false) {
    readinessReasons.push(network.monitoringReadiness.message);
  }

  const isReady = readinessReasons.length === 0;

  const [netForm, setNetForm] = useState({
    id: '',
    networkCode: networkCode,
    networkName: network.networkName,
    adapterKind: 'evm' as any,
    providerKind: 'rpc' as any,
    chainId: '',
    enabled: true,
    endpointSecretRef: '',
    apiKeySecretRef: '',
    confirmationsRequired: 1,
    finalityPolicy: 'confirmations' as any,
    pollIntervalSeconds: 30
  });

  const [assetForm, setAssetForm] = useState({
    identityKind: 'native' as any,
    contractOrMint: '',
    decimals: network.decimals,
    enabled: true
  });

  useEffect(() => {
    if (existingNet) {
      setNetForm({
        id: existingNet.id,
        networkCode: existingNet.networkCode,
        networkName: existingNet.networkName,
        adapterKind: existingNet.adapterKind as any,
        providerKind: existingNet.providerKind as any,
        chainId: (existingNet as any).chainId || '',
        enabled: existingNet.enabled,
        endpointSecretRef: '',
        apiKeySecretRef: '',
        confirmationsRequired: existingNet.confirmationsRequired,
        finalityPolicy: existingNet.finalityPolicy as any,
        pollIntervalSeconds: existingNet.pollIntervalSeconds
      });
    } else {
      setNetForm(f => ({ ...f, id: `mon-${networkCode}`.toLowerCase() }));
    }
  }, [existingNet, networkCode]);

  useEffect(() => {
    if (existingAsset) {
      setAssetForm({
        identityKind: existingAsset.identityKind as any,
        contractOrMint: existingAsset.contractOrMint || '',
        decimals: existingAsset.decimals,
        enabled: existingAsset.enabled
      });
    }
  }, [existingAsset]);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSaveNetwork = async () => {
    setError(''); setSuccess('');
    try {
      const payload = {
        ...netForm,
        chainId: netForm.chainId || null,
        endpointSecretRef: netForm.endpointSecretRef || null,
        apiKeySecretRef: netForm.apiKeySecretRef || null
      };
      if (existingNet) {
        await updateNet.mutateAsync({ id: existingNet.id, data: payload });
      } else {
        await createNet.mutateAsync({ data: payload });
      }
      queryClient.invalidateQueries({ queryKey: ['listBlockchainMonitoringNetworks'] });
      setSuccess('Monitor network saved.');
    } catch (err) {
      setError(apiErrorText(err, 'Failed to save monitor network.'));
    }
  };

  const handleTestNetwork = async () => {
    if (!existingNet) return;
    setError(''); setSuccess('');
    try {
      const res = await testNet.mutateAsync({ id: existingNet.id });
      setSuccess(`Connection test successful. Head: ${res.head}, latency: ${res.latencyMs}ms`);
    } catch (err) {
      setError(apiErrorText(err, 'Connection test failed.'));
    }
  };

  const handleSaveAsset = async () => {
    if (!existingNet) {
      setError('Please save the monitor network first.');
      return;
    }
    setError(''); setSuccess('');
    try {
      await upsertAsset.mutateAsync({
        data: {
          monitorNetworkId: existingNet.id,
          assetNetworkId: network.id,
          identityKind: assetForm.identityKind,
          contractOrMint: assetForm.contractOrMint || null,
          decimals: assetForm.decimals,
          enabled: assetForm.enabled
        }
      });
      queryClient.invalidateQueries({ queryKey: ['listBlockchainMonitoringAssets'] });
      setSuccess('Asset monitoring configuration saved.');
    } catch (err) {
      setError(apiErrorText(err, 'Failed to save asset configuration.'));
    }
  };

  return (
    <section className="receiving-wallet-section mt-4 bg-muted/10 p-4 rounded-xl border border-border">
      <div className="panel-heading mb-4">
        <div><span className="section-kicker">Automation</span><h2>Blockchain Monitor</h2></div>
      </div>
      
      {error && <InlineNotice kind="error">{error}</InlineNotice>}
      {success && <InlineNotice kind="success">{success}</InlineNotice>}

      <div className="space-y-4">
        <div className="space-y-4 mb-6">
          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-border/50">
                  <span className="text-muted-foreground font-medium">Network Monitor</span>
                  <span className={existingNet?.enabled ? "text-emerald-500 font-semibold" : "text-muted-foreground font-semibold"}>{existingNet?.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-border/50">
                  <span className="text-muted-foreground font-medium">Asset Monitoring</span>
                  <span className={existingAsset?.enabled ? "text-emerald-500 font-semibold" : "text-muted-foreground font-semibold"}>{existingAsset?.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-border/50">
                  <span className="text-muted-foreground font-medium">Customer Deposits</span>
                  <span className={network.customerDepositsEnabled ? "text-emerald-500 font-semibold" : "text-muted-foreground font-semibold"}>{network.customerDepositsEnabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-border/50">
                  <span className="text-muted-foreground font-medium">Provider</span>
                  <span className={
                    !existingNet || !endpointReady || existingNet.healthStatus === 'not_configured' ? "text-muted-foreground font-semibold" :
                    existingNet.healthStatus === 'connected' ? "text-emerald-500 font-semibold" :
                    "text-red-500 font-semibold"
                  }>
                    {!existingNet || !endpointReady || existingNet.healthStatus === 'not_configured' ? "Not configured" : existingNet.healthStatus === 'connected' ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-start pb-2 border-b border-border/50 flex-col sm:flex-row sm:items-center gap-1">
                  <span className="text-muted-foreground font-medium">Last Scan</span>
                  <span className="font-mono text-xs text-right break-all">
                    {existingNet?.lastSuccessfulScanAt ? `${new Date(existingNet.lastSuccessfulScanAt).toLocaleString()} (Head: ${existingNet.lastHead || '?'})` : "Never"}
                  </span>
                </div>
                <div className="flex justify-between items-start pb-2 border-b border-border/50 flex-col sm:flex-row sm:items-center gap-1">
                  <span className="text-muted-foreground font-medium">Last Error</span>
                  <span className={existingNet?.healthError ? "text-red-500 font-mono text-xs text-right break-all" : "text-muted-foreground font-mono text-xs text-right"}>
                    {existingNet?.healthError || "None"}
                  </span>
                </div>
                <div className="flex justify-between items-start pt-1 flex-col sm:flex-row gap-2">
                  <span className="text-muted-foreground font-medium mt-0.5">Readiness</span>
                  <div className="flex flex-col items-end gap-1">
                    <span className={isReady ? "inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500 border border-emerald-500/20" : "inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-500 border border-red-500/20"}>
                      {isReady ? <><Check size={12} /> READY</> : <><X size={12} /> BLOCKED</>}
                    </span>
                    {!isReady && readinessReasons.length > 0 && (
                      <ul className="text-xs text-red-500/80 text-right space-y-0.5 mt-1">
                        {readinessReasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!isReady && network.customerDepositsEnabled && (
            <div className="mb-4">
              <InlineNotice kind="error">
                <strong>Customer deposits enabled while blockchain monitoring is not READY.</strong> New manual deposit activation remains blocked until all readiness requirements pass.
              </InlineNotice>
            </div>
          )}
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">Network Configuration</h3>
        
        <div className="admin-form-grid form-grid">
          <label>
            <span className="field-label">Adapter</span>
            <select value={netForm.adapterKind} onChange={e => setNetForm({...netForm, adapterKind: e.target.value as any})}>
              <option value="evm">EVM</option>
              <option value="solana">Solana</option>
              <option value="tron">Tron</option>
              <option value="bitcoin">Bitcoin</option>
              <option value="ton">TON</option>
              <option value="stellar">Stellar</option>
            </select>
          </label>
          <label>
            <span className="field-label">Provider</span>
            <select value={netForm.providerKind} onChange={e => setNetForm({...netForm, providerKind: e.target.value as any})}>
              <option value="rpc">RPC Node</option>
              <option value="indexer">Indexer</option>
              <option value="alchemy">Alchemy</option>
              <option value="helius">Helius</option>
            </select>
          </label>
        </div>

        <div className="admin-form-grid form-grid">
          <label>
            <span className="field-label">Endpoint Secret Name (Optional)</span>
            <input value={netForm.endpointSecretRef} onChange={e => setNetForm({...netForm, endpointSecretRef: e.target.value})} placeholder="e.g. ALCHEMY_URL_ETH" />
          </label>
          <label>
            <span className="field-label">API Key Secret Name (Optional)</span>
            <input value={netForm.apiKeySecretRef} onChange={e => setNetForm({...netForm, apiKeySecretRef: e.target.value})} placeholder="e.g. ALCHEMY_KEY_ETH" />
          </label>
        </div>

        <div className="admin-form-grid form-grid">
          <label>
            <span className="field-label">Chain ID (Optional)</span>
            <input value={netForm.chainId} onChange={e => setNetForm({...netForm, chainId: e.target.value})} placeholder="e.g. 1" />
          </label>
          <label>
            <span className="field-label">Poll Interval (Seconds)</span>
            <input type="number" min={1} value={netForm.pollIntervalSeconds} onChange={e => setNetForm({...netForm, pollIntervalSeconds: Number(e.target.value)})} />
          </label>
        </div>

        <div className="admin-form-grid form-grid">
          <label>
            <span className="field-label">Confirmations Required</span>
            <input type="number" min={1} value={netForm.confirmationsRequired} onChange={e => setNetForm({...netForm, confirmationsRequired: Number(e.target.value)})} />
          </label>
          <label>
            <span className="field-label">Finality Policy</span>
            <select value={netForm.finalityPolicy} onChange={e => setNetForm({...netForm, finalityPolicy: e.target.value as any})}>
              <option value="confirmations">Confirmations</option>
              <option value="finalized">Finalized</option>
              <option value="instant">Instant</option>
              <option value="strict">Strict</option>
              <option value="optimistic">Optimistic</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={netForm.enabled} onChange={e => setNetForm({...netForm, enabled: e.target.checked})} className="rounded border-border bg-transparent" />
          <span className="text-sm font-semibold">Enable Network Monitor</span>
        </label>

        <div className="flex items-center gap-2 mt-3">
          <button type="button" className="button button-primary button-sm" onClick={handleSaveNetwork} disabled={createNet.isPending || updateNet.isPending}>
            <Save size={14} className="mr-1" /> {existingNet ? 'Update' : 'Create'} Network Config
          </button>
          {existingNet && (
            <button type="button" className="button button-secondary button-sm" onClick={handleTestNetwork} disabled={testNet.isPending}>
              <Play size={14} className="mr-1" /> Test Connection
            </button>
          )}
        </div>

        {existingNet && (
          <div className="mt-8 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">Asset Configuration</h3>
            
            <div className="admin-form-grid form-grid">
              <label>
                <span className="field-label">Identity Kind</span>
                <select value={assetForm.identityKind} onChange={e => setAssetForm({...assetForm, identityKind: e.target.value as any})}>
                  <option value="native">Native Asset</option>
                  <option value="token">Token</option>
                </select>
              </label>
              <label>
                <span className="field-label">Contract / Mint Address (Tokens only)</span>
                <input value={assetForm.contractOrMint} onChange={e => setAssetForm({...assetForm, contractOrMint: e.target.value})} placeholder="0x..." disabled={assetForm.identityKind === 'native'} />
              </label>
            </div>
            
            <div className="admin-form-grid form-grid">
              <label>
                <span className="field-label">Decimals</span>
                <input type="number" min={0} value={assetForm.decimals} onChange={e => setAssetForm({...assetForm, decimals: Number(e.target.value)})} />
              </label>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={assetForm.enabled} onChange={e => setAssetForm({...assetForm, enabled: e.target.checked})} className="rounded border-border bg-transparent" />
              <span className="text-sm font-semibold">Enable Asset Monitoring</span>
            </label>

            <div className="mt-3">
              <button type="button" className="button button-primary button-sm" onClick={handleSaveAsset} disabled={upsertAsset.isPending}>
                <Save size={14} className="mr-1" /> Save Asset Identity
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
