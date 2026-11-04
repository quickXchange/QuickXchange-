import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { formatDisplayAmount } from '@workspace/amount-format';
import type { ProfitReport, ProfitRow, LegacyProfitBasis } from '@workspace/api-zod';
import { TradeEditor, PeriodSummary } from './revenue-trade-editor';
import { Download, Loader2, Search, X, ShieldCheck, AlertTriangle, Undo2, Plus, ExternalLink } from 'lucide-react';
import { ErrorState, InlineNotice, LoadingBlock } from '../components/shared-app-ui';
import './admin-profit-dashboard.css';

type Filters = { from: string; to: string; search: string; currency: string; paymentMethod: string; type: 'all' | 'Swap' | 'Convert'; profit: 'all' | 'profit' | 'loss' | 'missing'; page: number };
const initialFilters: Filters = { from: '', to: '', search: '', currency: '', paymentMethod: '', type: 'all', profit: 'all', page: 1 };
const DECIMAL = /^(?:0|[1-9]\d{0,23})(?:\.\d{1,18})?$/;
const SIGNED = /^-?(?:0|[1-9]\d{0,23})(?:\.\d{1,18})?$/;
const BASE = '/api/admin/profit-dashboard';

function query(f: Filters) {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.search.trim()) p.set('search', f.search.trim());
  if (f.currency) p.set('currency', f.currency);
  if (f.paymentMethod) p.set('paymentMethod', f.paymentMethod);
  if (f.type !== 'all') p.set('type', f.type);
  if (f.profit !== 'all') p.set('profit', f.profit);
  p.set('page', String(f.page));
  return p.toString();
}
const fmt = (v: string | null | undefined) => (v == null ? '—' : formatDisplayAmount(v, { useGrouping: true }, 'en-US'));
const sign = (v: string | null | undefined) => (v == null ? '' : v.startsWith('-') && !/^-0(\.0+)?$/.test(v) ? 'is-loss' : /^0(\.0+)?$/.test(v) ? '' : 'is-profit');
const POSITIVE = (v: string) => DECIMAL.test(v) && /[1-9]/.test(v);
const uuid = () => crypto.randomUUID();
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Request failed. Try again.');

function Money({ value, currency }: { value: string | null | undefined; currency?: string }) {
  return <span className={`pd-money ${sign(value)}`} title={value ?? undefined}>{fmt(value)}{value != null && currency ? <small> {currency}</small> : null}</span>;
}

function StateTag({ state }: { state: ProfitRow['state'] }) {
  if (state === 'verified') return <span className="pd-tag is-verified"><ShieldCheck size={12} />Verified</span>;
  if (state === 'reversed') return <span className="pd-tag is-reversed"><Undo2 size={12} />Reversed</span>;
  if (state === 'not_completed') return <span className="pd-tag is-reversed">Not completed</span>;
  return <span className="pd-tag is-missing"><AlertTriangle size={12} />Cost missing</span>;
}

type BasisForm = { currency: string; sourceUnitValue: string; targetUnitCost: string; providerFee: string; networkFee: string; bankFee: string; otherFee: string; evidence: string; costsVerified: boolean };
const emptyBasis = (currency = 'EUR'): BasisForm => ({ currency, sourceUnitValue: '', targetUnitCost: '', providerFee: '', networkFee: '', bankFee: '', otherFee: '', evidence: '', costsVerified: false });
function basisErrors(b: BasisForm) {
  const e: string[] = [];
  if (!b.currency.trim()) e.push('Choose an accounting currency.');
  (['sourceUnitValue', 'targetUnitCost'] as const).forEach(k => { if (!POSITIVE(b[k])) e.push(`${k} must be greater than 0 (use 1 when the asset is the accounting currency).`); });
  (['providerFee', 'networkFee', 'bankFee', 'otherFee'] as const).forEach(k => { if (!DECIMAL.test(b[k])) e.push(`${k} must be a non-negative decimal (enter 0 explicitly if none).`); });
  if (b.evidence.trim().length < 8) e.push('Evidence must be at least 8 characters.');
  if (!b.costsVerified) e.push('Confirm all costs and fees are verified.');
  return e;
}
function basisPayload(b: BasisForm): LegacyProfitBasis {
  return { currency: b.currency.trim().toUpperCase(), sourceUnitValue: b.sourceUnitValue, targetUnitCost: b.targetUnitCost, providerFee: b.providerFee, networkFee: b.networkFee, bankFee: b.bankFee, otherFee: b.otherFee, evidence: b.evidence.trim(), costsVerified: true };
}

function BasisFields({ value, onChange, currencies, sourceLabel, targetLabel, lockCurrency }: { value: BasisForm; onChange: (v: BasisForm) => void; currencies: string[]; sourceLabel: string; targetLabel: string; lockCurrency?: string }) {
  const set = (k: keyof BasisForm, v: string | boolean) => onChange({ ...value, [k]: v });
  const opts = currencies.includes(value.currency) ? currencies : [value.currency, ...currencies];
  return <div className="pd-form-grid">
    <label><span className="field-label">Accounting currency</span><select value={value.currency} disabled={!!lockCurrency} onChange={e => set('currency', e.target.value)}>{opts.map(c => <option key={c} value={c}>{c}</option>)}</select>{lockCurrency ? <small>Locked to {lockCurrency}: prior adjustments exist in this currency.</small> : <small>If an asset is this currency, its unit value is 1.</small>}</label>
    <label><span className="field-label">Source unit value</span><input inputMode="decimal" value={value.sourceUnitValue} onChange={e => set('sourceUnitValue', e.target.value.trim())} placeholder="0" /><small>Real proceeds per 1 {sourceLabel} received by the desk</small></label>
    <label><span className="field-label">Target unit cost</span><input inputMode="decimal" value={value.targetUnitCost} onChange={e => set('targetUnitCost', e.target.value.trim())} placeholder="0" /><small>Actual acquisition cost per 1 {targetLabel} paid out</small></label>
    {(['providerFee', 'networkFee', 'bankFee', 'otherFee'] as const).map(k => <label key={k}><span className="field-label">{({ providerFee: 'Provider fee', networkFee: 'Network fee', bankFee: 'Bank fee', otherFee: 'Other fee' })[k]} (per order, {value.currency})</span><input inputMode="decimal" value={value[k]} onChange={e => set(k, e.target.value.trim())} placeholder="Enter 0 if none" /></label>)}
    <label className="pd-span"><span className="field-label">Evidence</span><textarea rows={3} value={value.evidence} onChange={e => set('evidence', e.target.value)} placeholder="Statement reference, provider fill ID, bank receipt, FX conversion source used for fees" /><small>All fees are stated in {value.currency}. Document any conversion from the original fee currency here.</small></label>
    <label className="pd-check pd-span"><input type="checkbox" checked={value.costsVerified} onChange={e => set('costsVerified', e.target.checked)} /><span>I attest these figures match the saved executed quantities of the order(s) and the actual costs and fees incurred (including any 0), backed by the evidence above. Quotes or estimates are not sufficient.</span></label>
  </div>;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['profit-dashboard'] });
}

function RowDetail({ row, report, onClose }: { row: ProfitRow; report: ProfitReport; onClose: () => void }) {
  const invalidate = useInvalidate();
  const adjCurrencies = Array.from(new Set(row.audit.filter(a => a.amount != null && /adjust/i.test(a.kind)).map(a => a.currency)));
  const lockCurrency = adjCurrencies.length ? (row.basis?.currency && adjCurrencies.includes(row.basis.currency) ? row.basis.currency : adjCurrencies[0]) : undefined;
  const [basis, setBasis] = useState<BasisForm>(emptyBasis(lockCurrency ?? row.basis?.currency ?? (report.currencies.includes('EUR') ? 'EUR' : report.currencies[0] ?? 'EUR')));
  const [basisReq, setBasisReq] = useState(uuid);
  const [adj, setAdj] = useState({ currency: row.basis?.currency ?? 'EUR', amount: '', reason: '' });
  const [adjReq, setAdjReq] = useState(uuid);
  const [showBasis, setShowBasis] = useState(false);
  const path = `${BASE}/orders/${row.type}/${encodeURIComponent(row.id)}`;
  const recordBasis = useMutation({
    mutationFn: () => customFetch(`${path}/basis`, { method: 'POST', responseType: 'json', body: JSON.stringify({ ...basisPayload(lockCurrency ? { ...basis, currency: lockCurrency } : basis), requestId: basisReq }) }),
    onSuccess: () => { setShowBasis(false); setBasisReq(uuid()); invalidate(); },
  });
  const addAdj = useMutation({
    mutationFn: () => customFetch(`${path}/adjustments`, { method: 'POST', responseType: 'json', body: JSON.stringify({ currency: adj.currency.trim().toUpperCase(), amount: adj.amount, reason: adj.reason.trim(), requestId: adjReq }) }),
    onSuccess: () => { setAdj(a => ({ ...a, amount: '', reason: '' })); setAdjReq(uuid()); invalidate(); },
  });
  const bErr = basisErrors(basis);
  const adjValid = SIGNED.test(adj.amount) && adj.reason.trim().length >= 8 && !!adj.currency.trim();
  const cur = row.basis?.currency ?? '';
  const legacy = row.basis && !('calculation' in row.basis) ? row.basis : null;
  const trade = row.basis && 'calculation' in row.basis ? row.basis : null;
  const td = row.tradeDetails;
  const notDone = row.state === 'not_completed';
  return <div className="pd-detail panel" data-testid="profit-row-detail">
    <div className="pd-detail-head">
      <div><span className="section-kicker">{row.type} order</span><h2>{row.id}</h2><small>{row.fromAsset}{row.fromNetwork ? ` (${row.fromNetwork})` : ''} → {row.toAsset}{row.toNetwork ? ` (${row.toNetwork})` : ''} · {row.paymentMethod || 'No method'}</small></div>
      <div className="pd-detail-actions"><a href={row.href} className="button button-secondary"><ExternalLink size={14} />Open order</a><button type="button" className="pd-icon" onClick={onClose} aria-label="Close detail"><X size={16} /></button></div>
    </div>
    <dl className="pd-dl">
      <div><dt>State</dt><dd><StateTag state={row.state} /> <small>{row.status}</small></dd></div>
      <div><dt>Customer sent / received</dt><dd>{fmt(row.amount)} {row.fromAsset} / {fmt(row.receiveAmount)} {row.toAsset}</dd></div>
      <div><dt>Executed customer rate</dt><dd>{row.customerRate ? `${fmt(row.customerRate)} ${row.toAsset}/${row.fromAsset}` : '—'}</dd></div>
      <div><dt>Revenue (valued proceeds)</dt><dd><Money value={row.revenue} currency={cur} /></dd></div>
      <div><dt>Acquisition cost</dt><dd><Money value={row.acquisitionCost} currency={cur} /></dd></div>
      <div><dt>Fees</dt><dd><Money value={row.fees} currency={cur} /></dd></div>
      <div><dt>Gross spread</dt><dd><Money value={row.grossSpread} currency={cur} /></dd></div>
      <div><dt>Adjustments (net)</dt><dd><Money value={row.adjustments} currency={cur} /></dd></div>
      <div><dt>Net profit</dt><dd>{row.netProfit == null ? <span className="pd-unavailable">Profit unavailable</span> : <Money value={row.netProfit} currency={cur} />}</dd></div>
    </dl>
    {legacy && <div className="pd-basis-box"><strong>Cost basis {row.basisId ? <small>#{row.basisId}</small> : null}</strong><p>Source value {fmt(legacy.sourceUnitValue)} {legacy.currency}/{row.fromAsset} · Target cost {fmt(legacy.targetUnitCost)} {legacy.currency}/{row.toAsset} · Provider {fmt(legacy.providerFee)} · Network {fmt(legacy.networkFee)} · Bank {fmt(legacy.bankFee)} · Other {fmt(legacy.otherFee)}</p><p className="pd-evidence">{legacy.evidence}</p></div>}
    {trade && <div className="pd-basis-box" data-testid="trade-basis-details"><strong>Actual trade basis {row.basisId ? <small>#{row.basisId}</small> : null}</strong>{td ? <p>{fmt(td.quantity)} {td.asset} · Buy {fmt(td.buyTotal)} · Sell {fmt(td.sellTotal)} · Commission 1 {fmt(td.commission1)} · Receiving commission {fmt(td.receivingCommission)} · Fixed fee {fmt(td.additionalFixedFee)} {trade.currency}</p> : <p>Buy {trade.buyMode} {fmt(trade.buyValue)} {trade.buyCurrency} · Sell {trade.sellMode} {fmt(trade.sellValue)} {trade.sellCurrency} · Commission 1 {fmt(trade.commission1Percent)}% · Receiving {fmt(trade.receivingCommissionPercent)}% · Fixed {fmt(trade.additionalFixedFee)} {trade.currency}</p>}<p className="pd-evidence">{trade.evidence}</p></div>}
    {notDone && <p className="pd-note">Order is not completed ({row.status}). Profit is unavailable and no costs can be recorded until it completes.</p>}
    {row.state === 'reversed' && <p className="pd-note">Reversed order: the base spread is excluded. Net profit reflects only explicit residual-cost adjustments.</p>}
    {row.state === 'missing' && row.type === 'Convert' && <p className="pd-note">Payout facts stay unvalued until the Owner attests verified evidence.</p>}
    <div className="pd-audit"><strong>Immutable history</strong>{row.audit.length === 0 ? <p className="pd-note">No basis records or adjustments yet.</p> :
      <ol>{row.audit.map(a => <li key={a.id}><span className="pd-audit-kind">{a.kind}</span><span className="pd-audit-when">{new Date(a.createdAt).toLocaleString()}</span>{a.amount != null && <Money value={a.amount} currency={a.currency} />}{a.amount == null && <small>{a.currency}</small>}<p>{a.reason}</p></li>)}</ol>}</div>
    {report.owner && !notDone && row.state !== 'reversed' && (showBasis ? <form className="pd-subform" onSubmit={e => { e.preventDefault(); if (!bErr.length) recordBasis.mutate(); }}>
      <h3>{row.basis ? 'Record corrective basis' : 'Record verified historical costs'}</h3>
      {row.basis && <p className="pd-note">Appends a new basis version for this order. Earlier records stay in history; the order itself is not changed.</p>}
      <BasisFields value={lockCurrency ? { ...basis, currency: lockCurrency } : basis} onChange={setBasis} currencies={report.currencies} sourceLabel={row.fromAsset} targetLabel={row.toAsset} lockCurrency={lockCurrency} />
      {recordBasis.isError && <InlineNotice kind="error">{errText(recordBasis.error)}</InlineNotice>}
      <div className="pd-form-actions"><button type="button" className="button button-secondary" onClick={() => setShowBasis(false)}>Cancel</button><button className="button button-primary" disabled={!!bErr.length || recordBasis.isPending}>{recordBasis.isPending && <Loader2 className="spin" size={14} />}Save basis</button></div>
      {!!bErr.length && <small className="pd-hint">{bErr[0]}</small>}
    </form> : <button type="button" className="button button-primary" onClick={() => setShowBasis(true)} data-testid="button-record-costs">{row.basis ? 'Record corrective basis' : 'Record verified costs'}</button>)}
    {report.owner && !notDone && <TradeEditor row={row} report={report} accountingCurrency={lockCurrency ?? row.basis?.currency ?? (report.currencies.includes('EUR') ? 'EUR' : report.currencies[0] ?? 'EUR')} />}
    {report.owner && !notDone && <form className="pd-subform" onSubmit={e => { e.preventDefault(); if (adjValid) addAdj.mutate(); }}>
      <h3>Append adjustment</h3>
      <div className="pd-form-grid">
        <label><span className="field-label">Currency</span><select value={adj.currency} onChange={e => setAdj({ ...adj, currency: e.target.value })}>{(report.currencies.includes(adj.currency) ? report.currencies : [adj.currency, ...report.currencies]).map(c => <option key={c}>{c}</option>)}</select></label>
        <label><span className="field-label">Amount (signed)</span><input inputMode="decimal" value={adj.amount} onChange={e => setAdj({ ...adj, amount: e.target.value.trim() })} placeholder="-12.40" /></label>
        <label className="pd-span"><span className="field-label">Reason</span><input value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} placeholder="Chargeback fee from bank statement 2024-11" /></label>
      </div>
      {addAdj.isError && <InlineNotice kind="error">{errText(addAdj.error)}</InlineNotice>}
      {addAdj.isSuccess && <InlineNotice kind="success">Adjustment appended.</InlineNotice>}
      <div className="pd-form-actions"><button className="button button-secondary" disabled={!adjValid || addAdj.isPending}>{addAdj.isPending ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}Append</button></div>
    </form>}
  </div>;
}

function RateForm({ report }: { report: ProfitReport }) {
  const invalidate = useInvalidate();
  const [routeIdx, setRouteIdx] = useState('');
  const [manual, setManual] = useState({ fromAsset: '', fromNetwork: '', toAsset: '', toNetwork: '', fromOptionId: '', toOptionId: '' });
  const pick = (v: string) => { setRouteIdx(v); const d = v === '' ? null : report.routes[Number(v)]; if (d) setManual({ fromOptionId: '', toOptionId: '', ...d }); };
  const [basis, setBasis] = useState<BasisForm>(emptyBasis(report.currencies.includes('EUR') ? 'EUR' : report.currencies[0] ?? 'EUR'));
  const route = manual.fromAsset && manual.toAsset ? { fromAsset: manual.fromAsset, fromNetwork: manual.fromNetwork.trim(), toAsset: manual.toAsset, toNetwork: manual.toNetwork.trim() } : null;
  const save = useMutation({
    mutationFn: () => customFetch(`${BASE}/rates`, { method: 'POST', responseType: 'json', body: JSON.stringify({ ...basisPayload(basis), ...route }) }),
    onSuccess: () => { setBasis(emptyBasis(basis.currency)); setRouteIdx(''); setManual({ fromAsset: '', fromNetwork: '', toAsset: '', toNetwork: '', fromOptionId: '', toOptionId: '' }); invalidate(); },
  });
  const errs = [...(route ? [] : ['Choose source and target assets.']), ...basisErrors(basis)];
  return <form className="panel pd-rate-form" onSubmit={e => { e.preventDefault(); if (!errs.length) save.mutate(); }}>
    <div className="panel-heading"><div><span className="section-kicker">Owner only · separate from customer pricing</span><h2>New cost basis version</h2></div></div>
    <p className="pd-note">Each save is an immutable version that applies only to orders created after its effective time. Past orders are never re-valued; record their actual costs per order.</p>
    <label><span className="field-label">Shortcut: discovered route</span><select value={routeIdx} onChange={e => pick(e.target.value)} data-testid="select-rate-route"><option value="">Pick to prefill, or enter a new route below</option>{report.routes.map((r, i) => <option key={i} value={i}>{r.fromAsset}{r.fromNetwork ? ` (${r.fromNetwork})` : ''} → {r.toAsset}{r.toNetwork ? ` (${r.toNetwork})` : ''}</option>)}</select></label>
    <div className="pd-form-grid">
      <label><span className="field-label">Source asset</span><select value={manual.fromAsset} onChange={e => { setRouteIdx(''); setManual({ ...manual, fromAsset: e.target.value }); }} data-testid="select-rate-from"><option value="">Select</option>{report.currencies.map(c => <option key={c}>{c}</option>)}</select></label>
      <label><span className="field-label">Source network / payment method</span><input value={manual.fromNetwork} maxLength={160} onChange={e => { setRouteIdx(''); setManual({ ...manual, fromNetwork: e.target.value }); }} placeholder="Exact string, e.g. TRC20 or SEPA" /></label>
      <label><span className="field-label">Target asset</span><select value={manual.toAsset} onChange={e => { setRouteIdx(''); setManual({ ...manual, toAsset: e.target.value }); }} data-testid="select-rate-to"><option value="">Select</option>{report.currencies.map(c => <option key={c}>{c}</option>)}</select></label>
      <label><span className="field-label">Target network / payment method</span><input value={manual.toNetwork} maxLength={160} onChange={e => { setRouteIdx(''); setManual({ ...manual, toNetwork: e.target.value }); }} placeholder="Exact string, empty if none" /></label>
    </div>
    <div className="pd-fields">
      <label><span className="field-label">Sending payment option ID</span><input value={manual.fromOptionId} maxLength={300} onChange={e => setManual({ ...manual, fromOptionId: e.target.value.trim() })} placeholder="Any sending method if empty" /></label>
      <label><span className="field-label">Receiving payment option ID</span><input value={manual.toOptionId} maxLength={300} onChange={e => setManual({ ...manual, toOptionId: e.target.value.trim() })} placeholder="Any receiving method if empty" /></label>
    </div>
    <p className="pd-note">Discovered routes preserve the saved payment option IDs, keeping bank-specific costs separate. Empty option IDs explicitly apply the same costs to all payment methods on this exact asset/network route. New routes are allowed before a completed order exists.</p>
    <BasisFields value={basis} onChange={setBasis} currencies={report.currencies} sourceLabel={route?.fromAsset ?? 'source'} targetLabel={route?.toAsset ?? 'target'} />
    {save.isError && <InlineNotice kind="error">{errText(save.error)}</InlineNotice>}
    {save.isSuccess && <InlineNotice kind="success">Version saved. Applies to future orders only.</InlineNotice>}
    <div className="pd-form-actions">{!!errs.length && <small className="pd-hint">{errs[0]}</small>}<button className="button button-primary" disabled={!!errs.length || save.isPending}>{save.isPending && <Loader2 className="spin" size={14} />}Save version</button></div>
  </form>;
}

export function ProfitDashboard() {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const qs = useMemo(() => query(filters), [filters]);
  const report = useQuery({ queryKey: ['profit-dashboard', qs], queryFn: () => customFetch<ProfitReport>(`${BASE}?${qs}`, { responseType: 'json' }), placeholderData: prev => prev });
  const data = report.data;
  const row = data?.rows.find(r => r.key === selected) ?? null;
  const pages = data ? Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize))) : 1;
  const apply = (next: Partial<Filters>) => { const f = { ...draft, ...next, page: next.page ?? 1 }; setDraft(f); setFilters(f); setSelected(null); };

  const exportCsv = async () => {
    setExporting(true); setExportError('');
    try {
      const csv = await customFetch<string>(`${BASE}.csv?${query({ ...filters, page: 1 }).replace(/&?page=\d+/, '')}`, { responseType: 'text' });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `profit-${filters.from || 'all'}-${filters.to || 'now'}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setExportError(errText(e)); } finally { setExporting(false); }
  };

  return <div className="pd-page">
    <p className="admin-subtitle">Realized profit counts only completed orders with owner-verified costs. Orders without a verified basis are listed but never estimated.</p>
    {exportError && <InlineNotice kind="error" onDismiss={() => setExportError('')}>CSV export failed: {exportError}</InlineNotice>}
    <form className="panel pd-filters" onSubmit={e => { e.preventDefault(); apply({}); }}>
      <label className="pd-search"><span className="field-label">Search</span><span className="pd-input-icon"><Search size={14} /><input value={draft.search} onChange={e => setDraft({ ...draft, search: e.target.value })} placeholder="Order ID, asset, method" data-testid="input-profit-search" /></span></label>
      <label><span className="field-label">From</span><input type="date" value={draft.from} max={draft.to || undefined} onChange={e => apply({ from: e.target.value })} /></label>
      <label><span className="field-label">To</span><input type="date" value={draft.to} min={draft.from || undefined} onChange={e => apply({ to: e.target.value })} /></label>
      <label><span className="field-label">Currency</span><select value={draft.currency} onChange={e => apply({ currency: e.target.value })}><option value="">All</option>{data?.currencies.map(c => <option key={c}>{c}</option>)}</select></label>
      <label><span className="field-label">Payment method</span><select value={draft.paymentMethod} onChange={e => apply({ paymentMethod: e.target.value })}><option value="">All</option>{data?.methods.map(m => <option key={m}>{m}</option>)}</select></label>
      <label><span className="field-label">Type</span><select value={draft.type} onChange={e => apply({ type: e.target.value as Filters['type'] })}><option value="all">All</option><option>Swap</option><option>Convert</option></select></label>
      <label><span className="field-label">Profit</span><select value={draft.profit} onChange={e => apply({ profit: e.target.value as Filters['profit'] })}><option value="all">All</option><option value="profit">Profit</option><option value="loss">Loss</option><option value="missing">Cost missing</option></select></label>
      <div className="pd-filter-actions"><button className="button button-secondary">Apply</button><button type="button" className="button button-secondary" onClick={() => apply(initialFilters)}>Reset</button><button type="button" className="button button-primary" onClick={exportCsv} disabled={exporting} data-testid="button-export-profit">{exporting ? <Loader2 className="spin" size={14} /> : <Download size={14} />}CSV</button></div>
    </form>

    {report.isError && !data ? <ErrorState message="The profit report could not be loaded." retry={() => report.refetch()} /> : !data ? <LoadingBlock rows={6} /> : <>
      <section className="pd-summary">
        <div className="pd-card"><span>Completed orders</span><strong>{data.completedOrders}</strong><small>{data.completedOrders - data.missingCosts >= 0 ? `${data.missingCosts} without verified costs` : ''}</small></div>
        <div className={`pd-card ${data.missingCosts ? 'is-warn' : ''}`}><span>Missing-cost coverage</span><strong>{data.missingCosts} / {data.completedOrders}</strong><small>Excluded from realized totals</small></div>
        {data.summary.length === 0 && <div className="pd-card pd-card-wide"><span>Realized profit</span><strong className="pd-unavailable">No verified orders yet</strong><small>Record verified costs to realize profit.</small></div>}
        {data.summary.map(s => <div className="pd-card pd-card-wide" key={s.currency} data-testid={`profit-summary-${s.currency}`}>
          <span>Realized profit · {s.currency} · {s.valued} valued orders</span>
          <strong><Money value={s.profit} currency={s.currency} /></strong>
          <div className="pd-card-grid"><div><small>Gross revenue (valued proceeds)</small><Money value={s.revenue} /></div><div><small>Total costs</small><Money value={s.costs} /></div><div><small>Acquisition</small><Money value={s.acquisitionCost} /></div><div><small>Fees</small><Money value={s.fees} /></div><div><small>Adjustments</small><Money value={s.adjustments} /></div></div>
        </div>)}
      </section>
      <PeriodSummary periods={data.periods} />
      {!!data.volume.length && <p className="pd-volume">Customer volume (not revenue): {data.volume.map(v => `${fmt(v.amount)} ${v.currency}`).join(' · ')}</p>}
      <details className="panel pd-formula"><summary>How profit is calculated</summary>
        <p><code>Revenue = customer amount sent × source unit value</code><br /><code>Acquisition cost = amount paid out × target unit cost</code><br /><code>Net profit = Revenue − Acquisition cost − (provider + network + bank + other fees) + adjustments</code></p>
        <p>The customer rate comes only from the amounts saved on each executed order, never from configured sale prices. Values are stated in the basis currency (default EUR); the accounting currency itself has unit value 1. There is no live FX conversion and no backfill: totals are grouped per currency, and orders without verified costs show Profit unavailable. Reversed or refunded orders exclude the base spread; only explicit residual-cost adjustments count. Convert orders lacking payout facts remain Cost missing until the Owner attests evidence. Totals are never combined across currencies.</p>
      </details>

      {row && <RowDetail key={row.key} row={row} report={data} onClose={() => setSelected(null)} />}

      <div className="panel pd-table-panel">
        <div className="pd-table-head"><h2>Orders</h2><small>{data.total} matched{report.isFetching ? ' · updating' : ''}</small></div>
        {data.rows.length === 0 ? <div className="table-empty" data-testid="empty-profit"><strong>No orders match these filters.</strong><span>Clear filters to see all-time results.</span></div> :
        <div className="table-wrap"><table className="data-table pd-table" data-testid="table-profit"><thead><tr><th>Order</th><th>Created</th><th>Route</th><th>Method</th><th>Sent</th><th>Received</th><th>Customer rate</th><th>Revenue</th><th>Costs + fees</th><th>Net profit</th><th>State</th><th /></tr></thead>
          <tbody>{data.rows.map(r => { const c = r.basis?.currency; return <tr key={r.key} className={r.key === selected ? 'is-selected' : ''}>
            <td><a href={r.href} className="pd-link">{r.id}</a><small>{r.type}</small></td>
            <td>{new Date(r.createdAt).toLocaleDateString()}<small>{r.status}</small></td>
            <td>{r.fromAsset} → {r.toAsset}<small>{[r.fromNetwork, r.toNetwork].filter(Boolean).join(' → ')}</small></td>
            <td>{r.paymentMethod || '—'}</td>
            <td className="pd-num">{fmt(r.amount)} <small>{r.fromAsset}</small></td>
            <td className="pd-num">{fmt(r.receiveAmount)} <small>{r.toAsset}</small></td>
            <td className="pd-num">{fmt(r.customerRate)}</td>
            <td className="pd-num">{r.revenue == null ? <span className="pd-unavailable">Cost missing</span> : <Money value={r.revenue} currency={c} />}</td>
            <td className="pd-num">{r.acquisitionCost == null ? '—' : <><Money value={r.acquisitionCost} currency={c} /><small>fees {fmt(r.fees)}</small></>}</td>
            <td className="pd-num">{r.netProfit == null ? <span className="pd-unavailable">Profit unavailable</span> : <Money value={r.netProfit} currency={c} />}</td>
            <td><StateTag state={r.state} /></td>
            <td><button type="button" className="button button-secondary pd-small" onClick={() => setSelected(r.key)}>{data.owner && r.state === 'missing' ? 'Record verified costs' : 'Details'}</button></td>
          </tr>; })}</tbody></table></div>}
        <div className="pd-pager"><button type="button" className="button button-secondary" disabled={filters.page <= 1} onClick={() => apply({ page: filters.page - 1 })}>Previous</button><span>Page {data.page} of {pages}</span><button type="button" className="button button-secondary" disabled={filters.page >= pages} onClick={() => apply({ page: filters.page + 1 })}>Next</button></div>
      </div>

      <div className="panel pd-table-panel">
        <div className="pd-table-head"><h2>Cost basis versions</h2><small>{data.rules.length} saved · immutable</small></div>
        {data.rules.length === 0 ? <div className="table-empty"><strong>No cost basis versions saved.</strong><span>Future orders stay Cost missing until a version exists for their route.</span></div> :
        <div className="table-wrap"><table className="data-table pd-table"><thead><tr><th>Effective</th><th>Route</th><th>Currency</th><th>Source value</th><th>Target cost</th><th>Provider</th><th>Network</th><th>Bank</th><th>Other</th><th>Evidence</th></tr></thead>
          <tbody>{data.rules.map(r => <tr key={r.id}><td>{new Date(r.effectiveAt).toLocaleString()}</td><td>{r.fromAsset} → {r.toAsset}<small>{[r.fromNetwork, r.toNetwork].filter(Boolean).join(' → ')}</small></td><td>{r.currency}</td><td className="pd-num">{fmt(r.sourceUnitValue)}</td><td className="pd-num">{fmt(r.targetUnitCost)}</td><td className="pd-num">{fmt(r.providerFee)}</td><td className="pd-num">{fmt(r.networkFee)}</td><td className="pd-num">{fmt(r.bankFee)}</td><td className="pd-num">{fmt(r.otherFee)}</td><td className="pd-evidence-cell" title={r.evidence}>{r.evidence}</td></tr>)}</tbody></table></div>}
      </div>
      {data.owner ? <RateForm report={data} /> : <p className="pd-note">Read-only view. Only the Owner can record costs, versions and adjustments.</p>}
    </>}
  </div>;
}

export default ProfitDashboard;
