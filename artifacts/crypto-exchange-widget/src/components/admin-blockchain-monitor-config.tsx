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
  const addressReady = /^(0x[0-9a-fA-F]{40})$/.test(network.sharedDepositAddress || '');
  const healthCheckedAtMs = existingNet?.healthCheckedAt
    ? new Date(existingNet.healthCheckedAt).getTime()
    : 0;
  const healthFresh = healthCheckedAtMs > 0 &&
    Date.now() - healthCheckedAtMs >= 0 &&
    Date.now() - healthCheckedAtMs <= Math.max(120_000, (existingNet?.pollIntervalSeconds ?? 15) * 3_000);
  const providerCompatible = Boolean(existingNet && (
    existingNet.adapterKind === 'evm' && existingNet.providerKind === 'rpc' ||
    existingNet.adapterKind === 'solana' && existingNet.providerKind === 'rpc' ||
    existingNet.adapterKind === 'tron' && existingNet.providerKind === 'indexer'
  ));
  const readiness = !existingNet || !existingNet.enabled || !endpointReady ||
    !identityReady || !addressReady || !providerCompatible || !healthFresh
    ? 'INCOMPLETE'
    : existingNet.healthStatus !== 'connected'
      ? 'DISCONNECTED'
      : 'READY';
  const providerLabel = networkCode.toUpperCase() === 'BEP20'
    ? 'BSC Monitor'
    : existingNet?.networkName || 'Not configured';

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
        <div className="grid gap-2 rounded-lg border border-border bg-background/60 p-3 text-sm">
          <div><strong>Monitoring:</strong> {readiness}</div>
          <div><strong>Provider:</strong> {providerLabel}</div>
          <div><strong>Asset Type:</strong> {existingAsset?.identityKind === 'native' ? 'Native' : existingAsset?.identityKind === 'token' ? 'Token' : 'Not configured'}</div>
          <div><strong>Customer Deposits:</strong> {readiness === 'READY' && network.customerDepositsEnabled ? 'Available' : 'Unavailable until READY'}</div>
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
