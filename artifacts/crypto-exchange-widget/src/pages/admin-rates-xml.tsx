import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, RefreshCw } from 'lucide-react';
import {
  getGetAdminRatesXmlQueryKey, getGetAdminRatesXmlPreviewQueryKey, useGetAdminRatesXml, useGetAdminRatesXmlPreview, useActivateAdminRatesXml,
} from '@workspace/api-client-react';
import { AdminShell } from '../App';
import { notifyAdminAction } from '@/components/admin-action-toast';
import { useAdminPermissions } from '@/lib/admin-permissions';
import { RatesXmlMethodEditor } from '@/components/rates-xml-method-editor';
import { AdminBestchangeLegacyPage } from './admin-bestchange';

const btn = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50';
const btnPrimary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50';
const card = 'rounded-xl border border-border bg-card p-4 sm:p-5';

export function AdminBestchangePage() {
  const { isOwner } = useAdminPermissions();
  const qc = useQueryClient();
  const [view, setView] = useState<'auto' | 'legacy'>('auto');
  const [confirm, setConfirm] = useState(false);
  const cfg = useGetAdminRatesXml({ query: { queryKey: getGetAdminRatesXmlQueryKey(), enabled: isOwner, retry: false } });
  const prev = useGetAdminRatesXmlPreview({ query: { queryKey: getGetAdminRatesXmlPreviewQueryKey(), enabled: isOwner, retry: false, refetchOnWindowFocus: false } });
  const activate = useActivateAdminRatesXml();
  const data = cfg.data;
  const feedUrl = `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}${data?.feedPath ?? '/api/rates.xml'}`;
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); notifyAdminAction('success', `${what} copied.`); }
    catch { notifyAdminAction('error', `Could not copy ${what.toLowerCase()}.`); }
  };
  const download = () => {
    if (!prev.data) return;
    const url = URL.createObjectURL(new Blob([prev.data.xml], { type: 'application/xml;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'rates.xml'; a.click(); URL.revokeObjectURL(url);
  };
  const onActivate = () => {
    if (!data || !prev.data || !confirm) return;
    activate.mutate({ data: { version: data.version, reviewHash: prev.data.reviewHash, confirm: true } }, {
      onSuccess: fresh => {
        qc.setQueryData(getGetAdminRatesXmlQueryKey(), fresh); setConfirm(false);
        notifyAdminAction('success', 'Production rates.xml now uses the automatic feed.');
        void prev.refetch();
      },
      onError: err => { setConfirm(false); notifyAdminAction('error', err instanceof Error ? err.message : 'Activation failed. Review the preview again.'); void prev.refetch(); },
    });
  };
  const providerOnly = (data?.methods ?? []).filter(m => m.kind === 'provider');
  const diag = prev.data?.diagnostics ?? [];
  const omitted = diag.filter(d => d.state === 'omitted');
  const tab = (id: 'auto' | 'legacy', label: string) => (
    <button type="button" className={view === id ? btnPrimary : btn} onClick={() => setView(id)} data-testid={`rates-xml-tab-${id}`}>{label}</button>
  );
  return (
    <AdminShell eyebrow="INTEGRATIONS / BESTCHANGE" title="Automatic Rates XML" subtitle="Rates generated from existing routes, fees and ranges">
      <div className="mx-auto max-w-5xl space-y-5 pb-24" data-testid="rates-xml-page">
        {!isOwner ? <div className={card}>Owner access is required.</div> : (<>
          <div className="flex flex-wrap gap-2">{tab('auto', 'Automatic Rates XML')}{tab('legacy', 'Legacy configuration')}</div>
          {view === 'legacy' ? <AdminBestchangeLegacyPage embedded /> : cfg.isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : cfg.isError || !data ? (
            <div className={card} role="alert">Could not load automatic rates settings.
              <button className={`${btn} ml-3`} onClick={() => void cfg.refetch()}>Retry</button></div>
          ) : (<>
            <section className={card}>
              <p className="text-xs font-semibold text-muted-foreground">Production status</p>
              <p className="mt-1 text-sm" data-testid="rates-xml-state">
                {data.published ? 'Production rates.xml serves the automatic feed.' : 'Production rates.xml still serves the legacy configuration until you confirm activation below.'}
                {' '}{data.staging ? 'The staging preview is active.' : 'Staging preview is not active.'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">The automatic feed uses actual quote-derived rates. Legacy Dynamic XML percentage adjustments stay saved in Legacy configuration and only affect the legacy export, not the new rates.xml. Staging respects the existing feed-enabled switch; production stays on legacy until activation. Fees and min/max come from Edit Path and Add Range. Reserves are informational and never change with orders; existing configured reserves, including zero, are preserved and new methods default to 1,000,000. The legacy /api/bestchange.xml feed stays available for rollback.</p>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">Feed URL</p>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input readOnly className="min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm" value={feedUrl} />
                <button className={btn} onClick={() => void copy(feedUrl, 'Feed link')}><Copy size={16} />Copy</button>
                <a className={btn} href={feedUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />Open</a>
              </div>
            </section>

            <section className={card} data-testid="rates-xml-preview">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">XML preview</h2>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => void prev.refetch()} disabled={prev.isFetching}><RefreshCw size={16} />Refresh</button>
                  <button className={btn} disabled={!prev.data} onClick={() => prev.data && void copy(prev.data.xml, 'XML')}><Copy size={16} />Copy</button>
                  <button className={btn} disabled={!prev.data} onClick={download}><Download size={16} />Download</button>
                </div>
              </div>
              {prev.isLoading ? <div className="mt-3 h-32 animate-pulse rounded-lg bg-muted" />
                : prev.isError || !prev.data ? <p className="mt-3 text-sm text-destructive" role="alert">Preview failed. <button className="underline" onClick={() => void prev.refetch()}>Retry</button></p>
                : (<>
                  <p className="mt-2 text-xs text-muted-foreground">{prev.data.exportedCount} exported - {omitted.length} omitted - {new Date(prev.data.generatedAt).toLocaleString()}</p>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">{prev.data.xml}</pre>
                </>)}
            </section>

            <section className={card} data-testid="rates-xml-readiness">
              <h2 className="text-base font-semibold">Route readiness ({diag.length})</h2>
              {diag.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No automatic routes to report yet.</p> : (
                <ul className="mt-3 max-h-96 space-y-1 overflow-auto text-sm">
                  {diag.map(d => (
                    <li key={d.routeId} className={d.state === 'ready' ? 'text-emerald-600' : 'text-amber-600'}>
                      {d.state === 'ready' ? 'Ready' : 'Omitted'} - {d.functionType} - {d.fromName} to {d.toName}{d.state === 'omitted' ? `: ${d.message}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={card} data-testid="rates-xml-provider-methods">
              <h2 className="text-base font-semibold">Provider-only methods</h2>
              <p className="mt-1 text-sm text-muted-foreground">Code and reserve for methods without manual network rows. Fiat and network methods are edited in their own settings.</p>
              {providerOnly.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">None.</p> : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {providerOnly.map(m => <RatesXmlMethodEditor key={m.optionId} optionId={m.optionId} mode="code-and-reserve" />)}
                </div>
              )}
            </section>

            <section className={card} data-testid="rates-xml-activation">
              <h2 className="text-base font-semibold">Production activation</h2>
              <p className="mt-1 text-sm text-muted-foreground">This switches production rates.xml to the automatic feed after you review the staging preview. It is not a deployment.</p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={confirm} onChange={e => setConfirm(e.target.checked)} disabled={!prev.data || activate.isPending} data-testid="rates-xml-confirm" />
                I reviewed the staging preview and its omitted routes and want production to use it.
              </label>
              <button className={`${btnPrimary} mt-3`} disabled={!confirm || !prev.data || activate.isPending} onClick={onActivate} data-testid="rates-xml-activate">
                {activate.isPending ? 'Activating...' : 'Activate in production'}
              </button>
            </section>
          </>)}
        </>)}
      </div>
    </AdminShell>
  );
}
