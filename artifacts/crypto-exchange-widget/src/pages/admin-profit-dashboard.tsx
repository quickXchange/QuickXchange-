import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { formatDisplayAmount } from '@workspace/amount-format';
import { ProfitTradeBasisInput, ProfitMyRateInput, calculateTradeProfit, sum } from '@workspace/api-zod';
import type { ProfitReport, ProfitRow, ProfitMyRate, ProfitPeriodTotal } from '@workspace/api-zod';
import { Download, Loader2, Search, X, ExternalLink, Pencil, Plus } from 'lucide-react';
import { ErrorState, InlineNotice, LoadingBlock } from '../components/shared-app-ui';
import './admin-profit-dashboard.css';

type Filters = { from: string; to: string; search: string; currency: string; paymentMethod: string; type: 'all' | 'Swap' | 'Convert'; profit: 'all' | 'profit' | 'loss' | 'missing'; page: number };
const initialFilters: Filters = { from: '', to: '', search: '', currency: '', paymentMethod: '', type: 'all', profit: 'all', page: 1 };
const SIGNED = /^-?(?:0|[1-9]\d{0,23})(?:\.\d{1,18})?$/;
const BASE = '/api/admin/profit-dashboard';
const EVIDENCE = 'Owner override of completion accounting rates';

type Completion = { at: string; rateId: string | null; state: 'recorded' | 'unavailable' | 'pending'; reason?: string };
type Row = ProfitRow & { completion?: Completion | null };

function query(f: Filters) {
  const p = new URLSearchParams();
  p.set('completedOnly', 'true');
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
const fmt = (v: string | null | undefined) => (v == null || v === '' ? '—' : formatDisplayAmount(v, { useGrouping: true }, 'en-US'));
const tone = (v: string | null | undefined) => (!v ? '' : v.startsWith('-') && /[1-9]/.test(v) ? 'is-loss' : /[1-9]/.test(v) ? 'is-profit' : '');
const uuid = () => crypto.randomUUID();
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Request failed. Try again.');
const z0 = (v: string) => (v.trim() === '' ? '0' : v.trim());
const defCur = (r: ProfitReport) => (r.currencies.includes('EUR') ? 'EUR' : r.currencies[0] ?? 'EUR');
const opts = (list: string[], c: string) => (c && !list.includes(c) ? [c, ...list] : list);

function Money({ value, currency }: { value: string | null | undefined; currency?: string }) {
  return <span className={`pd-money ${tone(value)}`} title={value ?? undefined}>{fmt(value)}{value != null && currency ? <small> {currency}</small> : null}</span>;
}
function Lines({ items, empty }: { items: { currency: string; value: string; signed?: boolean }[]; empty: string }) {
  if (!items.length) return <strong className="pd-unavailable">{empty}</strong>;
  return <div className="rv-lines">{items.map(i => <div key={i.currency}><b className={`pd-money ${i.signed ? tone(i.value) : ''}`}>{fmt(i.value)}</b><small>{i.currency}</small></div>)}</div>;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['profit-dashboard'] });
}

/* ---------------- My Rates ---------------- */
type RateDraft = { asset: string; currency: string; network: string; buyRate: string; sellRate: string; partnerFeePercent: string; receivingFeePercent: string; active: boolean };

function MyRates({ report }: { report: ProfitReport }) {
  const invalidate = useInvalidate();
  const blank = (): RateDraft => ({ asset: '', currency: defCur(report), network: '', buyRate: '', sellRate: '', partnerFeePercent: '', receivingFeePercent: '', active: true });
  const [d, setD] = useState<RateDraft>(blank);
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState(uuid);
  const rates = report.myRates ?? [];
  const nets = report.rateNetworks ?? [];
  const set = <K extends keyof RateDraft>(k: K, v: RateDraft[K]) => setD(p => ({ ...p, [k]: v }));
  const body = { kind: 'my_rate' as const, asset: d.asset, currency: d.currency, network: d.network, buyRate: d.buyRate.trim(), sellRate: d.sellRate.trim(), partnerFeePercent: z0(d.partnerFeePercent), receivingFeePercent: z0(d.receivingFeePercent), active: d.active, requestId };
  const parsed = ProfitMyRateInput.safeParse(body);
  const issue = !d.asset ? 'Choose an asset.' : parsed.success ? '' : `${parsed.error.issues[0].path.join('.') || 'input'}: ${parsed.error.issues[0].message}`;
  const save = useMutation({
    mutationFn: () => customFetch(`${BASE}/my-rates`, { method: 'POST', responseType: 'json', body: JSON.stringify(body) }),
    onSuccess: () => { setRequestId(uuid()); setD(blank()); setOpen(false); invalidate(); },
  });
  const edit = (r: ProfitMyRate) => { setD({ asset: r.asset, currency: r.currency, network: r.network, buyRate: r.buyRate, sellRate: r.sellRate, partnerFeePercent: r.partnerFeePercent, receivingFeePercent: r.receivingFeePercent, active: r.active }); setRequestId(uuid()); setOpen(true); };

  return <section className="panel rv-rates" data-testid="panel-my-rates">
    <div className="rv-head">
      <div><span className="section-kicker">Accounting only · not customer pricing</span><h2>My Rates</h2></div>
      {report.owner && !open && <button type="button" className="button button-secondary pd-small" onClick={() => { setD(blank()); setRequestId(uuid()); setOpen(true); }} data-testid="button-add-rate"><Plus size={14} />Set rate</button>}
    </div>
    <p className="pd-note">Your current buy and sell rate per 1 asset. Applied when an order completes from now on; completed orders keep the figures frozen at their completion.</p>
    {rates.length === 0 ? <p className="pd-note rv-empty">No rates set. New completions record Profit unavailable until a matching rate exists.</p> :
      <div className="table-wrap"><table className="data-table rv-rate-table" data-testid="table-my-rates"><thead><tr><th>Asset</th><th>Network</th><th className="pd-num">Buy</th><th className="pd-num">Sell</th><th className="pd-num">Partner %</th><th className="pd-num">Receiving %</th><th>Status</th><th /></tr></thead>
        <tbody>{rates.map(r => <tr key={r.id} data-testid={`row-rate-${r.id}`}>
          <td><b>{r.asset}</b><small>per 1 in {r.currency}</small></td>
          <td>{r.network || 'All networks'}</td>
          <td className="pd-num pd-money">{fmt(r.buyRate)}</td>
          <td className="pd-num pd-money">{fmt(r.sellRate)}</td>
          <td className="pd-num">{fmt(r.partnerFeePercent)}</td>
          <td className="pd-num">{fmt(r.receivingFeePercent)}</td>
          <td>{r.active ? <span className="pd-tag is-verified">Active</span> : <span className="pd-tag is-reversed">Paused</span>}</td>
          <td>{report.owner && <button type="button" className="button button-secondary pd-small" onClick={() => edit(r)} data-testid={`button-edit-rate-${r.id}`}>Edit</button>}</td>
        </tr>)}</tbody></table></div>}
    {open && report.owner && <form className="pd-subform" onSubmit={e => { e.preventDefault(); if (!issue) save.mutate(); }} data-testid="form-my-rate">
      <div className="pd-form-grid">
        <label><span className="field-label">Asset</span><select value={d.asset} onChange={e => set('asset', e.target.value)} data-testid="select-rate-asset"><option value="">Select</option>{opts(report.currencies, d.asset).map(c => <option key={c}>{c}</option>)}</select></label>
        <label><span className="field-label">Quote currency</span><select value={d.currency} onChange={e => set('currency', e.target.value)} data-testid="select-rate-currency">{opts(report.currencies, d.currency).map(c => <option key={c}>{c}</option>)}</select></label>
        <label><span className="field-label">Network</span><select value={d.network} onChange={e => set('network', e.target.value)} data-testid="select-rate-network"><option value="">All networks</option>{opts(nets, d.network).filter(Boolean).map(n => <option key={n}>{n}</option>)}</select></label>
        <label><span className="field-label">Buy rate ({d.currency})</span><input inputMode="decimal" value={d.buyRate} onChange={e => set('buyRate', e.target.value.trim())} placeholder="0" data-testid="input-rate-buy" /></label>
        <label><span className="field-label">Sell rate ({d.currency})</span><input inputMode="decimal" value={d.sellRate} onChange={e => set('sellRate', e.target.value.trim())} placeholder="0" data-testid="input-rate-sell" /></label>
        <label><span className="field-label">Partner fee %</span><input inputMode="decimal" value={d.partnerFeePercent} onChange={e => set('partnerFeePercent', e.target.value.trim())} placeholder="0" data-testid="input-rate-partner" /></label>
        <label><span className="field-label">Receiving fee %</span><input inputMode="decimal" value={d.receivingFeePercent} onChange={e => set('receivingFeePercent', e.target.value.trim())} placeholder="0" data-testid="input-rate-receiving" /></label>
        <label className="pd-check"><input type="checkbox" checked={d.active} onChange={e => set('active', e.target.checked)} data-testid="checkbox-rate-active" /><span>Active</span></label>
      </div>
      <p className="pd-note">Saving adds a new version. Earlier versions and past orders are not changed.</p>
      {save.isError && <InlineNotice kind="error">{errText(save.error)}</InlineNotice>}
      <div className="pd-form-actions">{issue && <small className="pd-hint">{issue}</small>}<button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" disabled={!!issue || save.isPending} data-testid="button-save-rate">{save.isPending && <Loader2 className="spin" size={14} />}Save rate</button></div>
    </form>}
  </section>;
}

/* ---------------- Per-order editor ---------------- */
function OrderEditor({ row, report, onClose }: { row: Row; report: ProfitReport; onClose: () => void }) {
  const invalidate = useInvalidate();
  const trade = row.basis && 'calculation' in row.basis ? row.basis : null;
  const legacy = row.basis && !('calculation' in row.basis) ? row.basis : null;
  const adjAll = row.audit.filter(a => a.amount != null && /adjust/i.test(a.kind));
  // Retained fixed fees are already denominated in this currency. Never
  // silently reinterpret them as another currency during a simple rate edit.
  const lock = row.basis?.currency ?? adjAll[0]?.currency;
  const unitOk = (mode: string, cc: string, fx: string, cur: string) => mode === 'unit' && cc === cur && /^1(\.0+)?$/.test(fx);
  const [currency, setCurrency] = useState(lock ?? trade?.currency ?? legacy?.currency ?? defCur(report));
  const [side, setSide] = useState<'source' | 'target'>(trade?.quantitySide ??
    (report.assetKinds?.[row.fromAsset] === 'crypto' ? 'source' : report.assetKinds?.[row.toAsset] === 'crypto' ? 'target' : 'source'));
  const [buy, setBuy] = useState(trade && unitOk(trade.buyMode, trade.buyCurrency, trade.buyFx, trade.currency) ? trade.buyValue : '');
  const [sell, setSell] = useState(trade && unitOk(trade.sellMode, trade.sellCurrency, trade.sellFx, trade.currency) ? trade.sellValue : '');
  const [partner, setPartner] = useState(trade?.commission1Percent ?? '');
  const [receiving, setReceiving] = useState(trade?.receivingCommissionPercent ?? '');
  const [requestId, setRequestId] = useState(uuid);
  const fixed = trade ? trade.additionalFixedFee : legacy ? (row.fees ?? sum(legacy.providerFee, legacy.networkFee, legacy.bankFee, legacy.otherFee)) : '0';
  const cur = lock ?? currency;
  const adj = adjAll.filter(a => a.currency === cur).map(a => a.amount as string);
  const adjTotal = adj.length ? sum(...adj) : '0';
  const body = { calculation: 'trade' as const, currency: cur, quantitySide: side, buyMode: 'unit' as const, sellMode: 'unit' as const, buyValue: buy.trim(), sellValue: sell.trim(), buyCurrency: cur, sellCurrency: cur, buyFx: '1', sellFx: '1', commission1Percent: z0(partner), receivingCommissionPercent: z0(receiving), additionalFixedFee: fixed, evidence: EVIDENCE, costsVerified: true as const };
  const parsed = ProfitTradeBasisInput.safeParse(body);
  let preview: ReturnType<typeof calculateTradeProfit> | null = null;
  if (parsed.success) { try { preview = calculateTradeProfit(row.amount, row.receiveAmount, parsed.data); } catch { preview = null; } }
  const net = preview ? sum(preview.netProfit, adjTotal) : null;
  const issue = parsed.success ? (preview ? '' : 'Executed quantity must be positive.') : `${parsed.error.issues[0].path.join('.') || 'input'}: ${parsed.error.issues[0].message}`;
  const qty = side === 'source' ? row.amount : row.receiveAmount;
  const asset = side === 'source' ? row.fromAsset : row.toAsset;
  const save = useMutation({
    mutationFn: () => customFetch(`${BASE}/orders/${row.type}/${encodeURIComponent(row.id)}/trade`, { method: 'POST', responseType: 'json', body: JSON.stringify({ ...body, requestId }) }),
    onSuccess: () => { setRequestId(uuid()); invalidate(); onClose(); },
  });

  return <form className="panel pd-detail rv-editor" onSubmit={e => { e.preventDefault(); if (!issue) save.mutate(); }} data-testid="form-order-edit">
    <div className="pd-detail-head">
      <div><span className="section-kicker">Edit completion rates · {row.type}</span><h2>{row.id}</h2><small>{row.fromAsset} → {row.toAsset}</small></div>
      <button type="button" className="pd-icon" onClick={onClose} aria-label="Close editor"><X size={16} /></button>
    </div>
    <p className="pd-note">Only the accounting rates and commissions change. The order, its quantities and the customer price stay as saved.</p>
    {legacy && <p className="pd-trade-warn">Earlier recorded fees of {fmt(fixed)} {legacy.currency} are kept as a fixed fee and counted once, not twice.</p>}
    {!trade && <div className="pd-form-grid">
      <label className="pd-span"><span className="field-label">Traded asset (saved quantity, read-only)</span>
        <div className="pd-seg" role="radiogroup">{(['source', 'target'] as const).map(s => <button type="button" key={s} role="radio" aria-checked={side === s} className={side === s ? 'is-on' : ''} onClick={() => setSide(s)} data-testid={`radio-qty-${s}`}>{s === 'source' ? 'Sent' : 'Received'}: <b>{s === 'source' ? row.amount : row.receiveAmount} {s === 'source' ? row.fromAsset : row.toAsset}</b></button>)}</div></label>
      <label><span className="field-label">Quote currency</span><select value={cur} disabled={!!lock} onChange={e => setCurrency(e.target.value)} data-testid="select-edit-currency">{opts(report.currencies, cur).map(c => <option key={c}>{c}</option>)}</select>{lock && <small>Locked: adjustments exist in {lock}.</small>}</label>
    </div>}
    {trade && <p className="pd-note">Quantity <b className="pd-money">{qty} {asset}</b> · currency <b>{cur}</b></p>}
    <div className="pd-form-grid">
      <label><span className="field-label">Buy rate per 1 {asset} ({cur})</span><input inputMode="decimal" value={buy} onChange={e => setBuy(e.target.value.trim())} placeholder="Required" data-testid="input-edit-buy" /></label>
      <label><span className="field-label">Sell rate per 1 {asset} ({cur})</span><input inputMode="decimal" value={sell} onChange={e => setSell(e.target.value.trim())} placeholder="Required" data-testid="input-edit-sell" /></label>
      <label><span className="field-label">Partner fee %</span><input inputMode="decimal" value={partner} onChange={e => setPartner(e.target.value.trim())} placeholder="0" data-testid="input-edit-partner" /></label>
      <label><span className="field-label">Receiving fee %</span><input inputMode="decimal" value={receiving} onChange={e => setReceiving(e.target.value.trim())} placeholder="0" data-testid="input-edit-receiving" /></label>
    </div>
    <div className="pd-trade-preview" data-testid="trade-preview">
      <div className="pd-trade-preview-head"><strong>Preview</strong><small>Not saved</small></div>
      {!preview ? <p className="pd-note">{issue || 'Enter rates to preview.'}</p> : <dl>
        <div><dt>Buy cost</dt><dd>{fmt(preview.acquisitionCost)} {cur}</dd></div>
        <div><dt>Sell proceeds</dt><dd>{fmt(preview.revenue)} {cur}</dd></div>
        <div><dt>Gross</dt><dd className={tone(preview.grossSpread)}>{fmt(preview.grossSpread)}</dd></div>
        <div><dt>Partner fee</dt><dd>-{fmt(preview.commission1)}</dd></div>
        <div><dt>Receiving fee</dt><dd>-{fmt(preview.receivingCommission)}</dd></div>
        <div><dt>Fixed fees (kept)</dt><dd>-{fmt(preview.additionalFixedFee)}</dd></div>
        <div><dt>Adjustments (kept)</dt><dd className={tone(adjTotal)}>{fmt(adjTotal)}</dd></div>
        <div className="is-final"><dt>Net profit</dt><dd className={tone(net)}>{fmt(net)} {cur}</dd></div>
      </dl>}
    </div>
    {save.isError && <InlineNotice kind="error">{errText(save.error)}</InlineNotice>}
    <div className="pd-form-actions">{issue && <small className="pd-hint">{issue}</small>}<button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!!issue || save.isPending} data-testid="button-save-order-edit">{save.isPending && <Loader2 className="spin" size={14} />}Save</button></div>
    <History row={row} report={report} />
  </form>;
}

function History({ row, report }: { row: Row; report: ProfitReport }) {
  const invalidate = useInvalidate();
  const [adj, setAdj] = useState({ currency: row.basis?.currency ?? defCur(report), amount: '', reason: '' });
  const [reqId, setReqId] = useState(uuid);
  const ok = SIGNED.test(adj.amount) && adj.reason.trim().length >= 8;
  const add = useMutation({
    mutationFn: () => customFetch(`${BASE}/orders/${row.type}/${encodeURIComponent(row.id)}/adjustments`, { method: 'POST', responseType: 'json', body: JSON.stringify({ currency: adj.currency, amount: adj.amount, reason: adj.reason.trim(), requestId: reqId }) }),
    onSuccess: () => { setAdj(a => ({ ...a, amount: '', reason: '' })); setReqId(uuid()); invalidate(); },
  });
  return <details className="rv-history"><summary>History</summary>
    {row.audit.length === 0 ? <p className="pd-note">No records yet.</p> : <ol className="pd-audit">{row.audit.map(a => <li key={a.id}><span className="pd-audit-kind">{a.kind}</span> <span className="pd-audit-when">{new Date(a.createdAt).toLocaleString()}</span> {a.amount != null && <Money value={a.amount} currency={a.currency} />}<p>{a.reason}</p></li>)}</ol>}
    {report.owner && <div className="pd-form-grid rv-adj">
      <label><span className="field-label">Adjustment currency</span><select value={adj.currency} onChange={e => setAdj({ ...adj, currency: e.target.value })}>{opts(report.currencies, adj.currency).map(c => <option key={c}>{c}</option>)}</select></label>
      <label><span className="field-label">Amount (signed)</span><input inputMode="decimal" value={adj.amount} onChange={e => setAdj({ ...adj, amount: e.target.value.trim() })} placeholder="-12.40" data-testid="input-adjustment-amount" /></label>
      <label className="pd-span"><span className="field-label">Reason</span><input value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} placeholder="Bank statement reference" data-testid="input-adjustment-reason" /></label>
      {add.isError && <InlineNotice kind="error">{errText(add.error)}</InlineNotice>}
      <div className="pd-form-actions pd-span"><button type="button" className="button button-secondary pd-small" disabled={!ok || add.isPending} onClick={() => add.mutate()} data-testid="button-append-adjustment">{add.isPending && <Loader2 className="spin" size={14} />}Append adjustment</button></div>
    </div>}
  </details>;
}

/* ---------------- Page ---------------- */
function Periods({ periods }: { periods?: ProfitReport['periods'] }) {
  if (!periods) return null;
  const cols: [string, ProfitPeriodTotal[]][] = [['Today', periods.daily], ['This week', periods.weekly], ['This month', periods.monthly]];
  return <div className="rv-periods" data-testid="profit-periods">{cols.map(([l, list]) => <div key={l}><span>{l}</span>{list.length ? list.map(p => <b key={p.currency} className={`pd-money ${tone(p.profit)}`}>{fmt(p.profit)} <small>{p.currency}</small></b>) : <small>—</small>}</div>)}<small className="rv-utc">UTC</small></div>;
}

function rates(r: Row) {
  const t = r.basis && 'calculation' in r.basis ? r.basis : null;
  if (!t) return null;
  const v = (mode: string, val: string, cc: string) => (mode === 'unit' ? `${fmt(val)} ${cc}` : `total ${fmt(val)} ${cc}`);
  return { buy: v(t.buyMode, t.buyValue, t.buyCurrency), sell: v(t.sellMode, t.sellValue, t.sellCurrency), pct: `${fmt(t.commission1Percent)}% / ${fmt(t.receivingCommissionPercent)}%` };
}

export function ProfitDashboard() {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [editing, setEditing] = useState<{ key: string; n: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const qs = useMemo(() => query(filters), [filters]);
  const report = useQuery({ queryKey: ['profit-dashboard', qs], queryFn: () => customFetch<ProfitReport>(`${BASE}?${qs}`, { responseType: 'json' }), placeholderData: prev => prev });
  const data = report.data;
  const rows = (data?.rows ?? []) as Row[];
  const editRow = editing ? rows.find(r => r.key === editing.key) ?? null : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize))) : 1;
  const apply = (next: Partial<Filters>) => { const f = { ...draft, ...next, page: next.page ?? 1 }; setDraft(f); setFilters(f); setEditing(null); };

  const exportCsv = async () => {
    setExporting(true); setExportError('');
    try {
      const csv = await customFetch<string>(`${BASE}.csv?${query(filters).replace(/&?page=\d+/, '')}`, { responseType: 'text' });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `revenue-${filters.from || 'all'}-${filters.to || 'now'}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setExportError(errText(e)); } finally { setExporting(false); }
  };

  return <div className="pd-page rv-page">
    {exportError && <InlineNotice kind="error" onDismiss={() => setExportError('')}>CSV export failed: {exportError}</InlineNotice>}
    {report.isError && !data ? <ErrorState message="Revenue could not be loaded." retry={() => report.refetch()} /> : !data ? <LoadingBlock rows={6} /> : <>
      <section className="rv-cards" data-testid="revenue-cards">
        <div className="rv-card is-hero"><span>Realized profit</span><Lines items={data.summary.map(s => ({ currency: s.currency, value: s.profit, signed: true }))} empty="No profit recorded" /><Periods periods={data.periods} /></div>
        <div className="rv-card"><span>Completed orders</span><strong className="rv-big" data-testid="text-completed-count">{data.completedOrders}</strong><small>{data.missingCosts ? `${data.missingCosts} profit unavailable` : 'All valued'}</small></div>
        <div className="rv-card"><span>Total costs</span><Lines items={data.summary.map(s => ({ currency: s.currency, value: s.costs }))} empty="—" /></div>
        <div className="rv-card"><span>Completed volume</span><Lines items={data.volume.map(v => ({ currency: v.currency, value: v.amount }))} empty="—" /><small>Customer amount sent, not profit</small></div>
      </section>

      <MyRates report={data} />

      {editRow && editing && <OrderEditor key={`${editRow.key}-${editing.n}`} row={editRow} report={data} onClose={() => setEditing(null)} />}

      <section className="panel pd-table-panel">
        <div className="pd-table-head"><h2>Completed orders</h2><small>{data.total} orders{report.isFetching ? ' · updating' : ''}</small></div>
        <form className="pd-filters rv-filters" onSubmit={e => { e.preventDefault(); apply({}); }}>
          <label className="pd-search"><span className="field-label">Search</span><span className="pd-input-icon"><Search size={14} /><input value={draft.search} onChange={e => setDraft({ ...draft, search: e.target.value })} placeholder="Order ID, asset, method" data-testid="input-profit-search" /></span></label>
          <label><span className="field-label">From</span><input type="date" value={draft.from} max={draft.to || undefined} onChange={e => apply({ from: e.target.value })} /></label>
          <label><span className="field-label">To</span><input type="date" value={draft.to} min={draft.from || undefined} onChange={e => apply({ to: e.target.value })} /></label>
          <label><span className="field-label">Currency</span><select value={draft.currency} onChange={e => apply({ currency: e.target.value })}><option value="">All</option>{data.currencies.map(c => <option key={c}>{c}</option>)}</select></label>
          <label><span className="field-label">Method</span><select value={draft.paymentMethod} onChange={e => apply({ paymentMethod: e.target.value })}><option value="">All</option>{data.methods.map(m => <option key={m}>{m}</option>)}</select></label>
          <label><span className="field-label">Type</span><select value={draft.type} onChange={e => apply({ type: e.target.value as Filters['type'] })}><option value="all">All</option><option>Swap</option><option>Convert</option></select></label>
          <label><span className="field-label">Profit</span><select value={draft.profit} onChange={e => apply({ profit: e.target.value as Filters['profit'] })}><option value="all">All</option><option value="profit">Profit</option><option value="loss">Loss</option><option value="missing">Unavailable</option></select></label>
          <div className="pd-filter-actions"><button className="button button-secondary pd-small">Apply</button><button type="button" className="button button-secondary pd-small" onClick={() => apply(initialFilters)}>Reset</button><button type="button" className="button button-primary pd-small" onClick={exportCsv} disabled={exporting} data-testid="button-export-profit">{exporting ? <Loader2 className="spin" size={14} /> : <Download size={14} />}CSV</button></div>
        </form>
        {rows.length === 0 ? <div className="table-empty" data-testid="empty-profit"><strong>No completed orders here.</strong><span>Adjust filters or wait for the next completion.</span></div> :
        <div className="table-wrap"><table className="data-table pd-table rv-table" data-testid="table-profit"><thead><tr><th>Order</th><th>Route</th><th className="pd-num">Quantity</th><th className="pd-num">Buy / Sell rate</th><th className="pd-num">Fees</th><th className="pd-num">Net</th><th /></tr></thead>
          <tbody>{rows.map(r => { const c = r.basis?.currency; const rt = rates(r); const q = r.tradeDetails; const when = r.completion?.at ?? r.completedAt ?? r.createdAt; return <tr key={r.key} className={editing?.key === r.key ? 'is-selected' : ''} data-testid={`row-order-${r.key}`}>
            <td><span className="pd-link">{r.id}</span><small>{r.type} · {new Date(when).toLocaleDateString()}</small></td>
            <td>{r.fromAsset} → {r.toAsset}<small>{[r.fromNetwork, r.toNetwork].filter(Boolean).join(' → ') || r.paymentMethod || '—'}</small></td>
            <td className="pd-num pd-money">{q ? <>{fmt(q.quantity)} <small>{q.asset}</small></> : <>{fmt(r.receiveAmount)} <small>{r.toAsset}</small></>}</td>
            <td className="pd-num">{rt ? <>{rt.buy}<small>{rt.sell}</small></> : <small>{r.basis ? 'Earlier cost record' : '—'}</small>}</td>
            <td className="pd-num">{r.fees == null ? '—' : <><Money value={r.fees} currency={c} />{rt && <small>{rt.pct}</small>}</>}</td>
            <td className="pd-num">{r.netProfit == null ? <span className="pd-unavailable" title={r.completion?.reason}>Unavailable</span> : <Money value={r.netProfit} currency={c} />}</td>
            <td className="rv-actions"><a href={r.href} className="button button-secondary pd-small" data-testid={`link-view-order-${r.key}`}><ExternalLink size={13} />View</a>{data.owner && r.state !== 'reversed' && <button type="button" className="button button-secondary pd-small" onClick={() => setEditing({ key: r.key, n: Date.now() })} data-testid={`button-edit-order-${r.key}`}><Pencil size={13} />Edit</button>}</td>
          </tr>; })}</tbody></table></div>}
        <div className="pd-pager"><button type="button" className="button button-secondary pd-small" disabled={filters.page <= 1} onClick={() => apply({ page: filters.page - 1 })}>Previous</button><span>Page {data.page} of {pages}</span><button type="button" className="button button-secondary pd-small" disabled={filters.page >= pages} onClick={() => apply({ page: filters.page + 1 })}>Next</button></div>
      </section>
    </>}
  </div>;
}

export default ProfitDashboard;
