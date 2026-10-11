import { useEffect, useRef } from 'react';
import { Copy, Download, ExternalLink, RefreshCw } from 'lucide-react';
import {
  getGetAdminRatesXmlQueryKey, getGetAdminRatesXmlPreviewQueryKey, useGetAdminRatesXml, useGetAdminRatesXmlPreview,
} from '@workspace/api-client-react';
import { AdminShell } from '../App';
import { notifyAdminAction } from '@/components/admin-action-toast';
import { useAdminPermissions } from '@/lib/admin-permissions';
import { RatesXmlMethodEditor } from '@/components/rates-xml-method-editor';

const btn = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50';
const card = 'rounded-xl border border-border bg-card p-4 sm:p-5';

export function AdminRatesXmlPage() {
  const { isOwner } = useAdminPermissions();
  const cfg = useGetAdminRatesXml({ query: { queryKey: getGetAdminRatesXmlQueryKey(), enabled: isOwner, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: 30_000, refetchIntervalInBackground: false } });
  const prev = useGetAdminRatesXmlPreview({ query: { queryKey: getGetAdminRatesXmlPreviewQueryKey(), enabled: isOwner, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: 60_000, refetchIntervalInBackground: false } });
  const data = cfg.data;
  const refetchPrev = useRef(prev.refetch);
  refetchPrev.current = prev.refetch;
  const fingerprint = data ? JSON.stringify(data.methods.map(m => [m.optionId, m.code, m.reserve, m.enabled])) : undefined;
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (fingerprint === undefined) return;
    if (seen.current !== undefined && seen.current !== fingerprint) void refetchPrev.current();
    seen.current = fingerprint;
  }, [fingerprint]);
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
  const providerOnly = (data?.methods ?? []).filter(m => m.kind === 'provider');
  const diag = prev.data?.diagnostics ?? [];
  const omitted = diag.filter(d => d.state === 'omitted');
  const ready = diag.filter(d => d.state === 'ready');
  const stagingOnly = (data?.methods ?? []).filter(m => m.code === 'PMUSD' || m.code === 'PMEUR');
  return (
    <AdminShell eyebrow="INTEGRATIONS / RATES XML" title="Rates XML" subtitle="Feed preview, route readiness and provider method codes">
      <div className="mx-auto max-w-5xl space-y-5 pb-24" data-testid="rates-xml-page">
        {!isOwner ? <div className={card}>Owner access is required.</div> : cfg.isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : cfg.isError || !data ? (
          <div className={card} role="alert">Could not load Rates XML settings.
            <button className={`${btn} ml-3`} onClick={() => void cfg.refetch()}>Retry</button></div>
        ) : (<>
          <section className={card}>
            <p className="text-sm text-muted-foreground" data-testid="rates-xml-state">{data.staging ? 'The staging preview is active.' : 'Staging preview is not active.'}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Every method must have an explicit code from the supplied list. Nothing is guessed; methods without a code are omitted.</li>
              <li>Fees and min/max limits come from the existing Edit Path and Add Range settings.</li>
              <li>Codes and reserves for fiat and crypto network methods are set on Payment Methods and saved crypto network settings. Existing reserves, including zero, are preserved; new methods default to 1,000,000.</li>
              <li>The automatic feed is available at /api/rates.xml.</li>
              {stagingOnly.length > 0 && <li className="font-semibold text-amber-600">PMUSD and PMEUR are staging-only and are not advertised in production.</li>}
            </ul>
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
            <h2 className="text-base font-semibold">Route readiness ({ready.length} ready, {omitted.length} omitted)</h2>
            {diag.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No routes to report yet.</p> : (
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
            <p className="mt-1 text-sm text-muted-foreground">Code and reserve for methods without manual network rows.</p>
            {providerOnly.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">None.</p> : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {providerOnly.map(m => <RatesXmlMethodEditor key={m.optionId} optionId={m.optionId} mode="code-and-reserve" />)}
              </div>
            )}
          </section>
        </>)}
      </div>
    </AdminShell>
  );
}
