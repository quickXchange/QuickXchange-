import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { formatDisplayAmount } from '@workspace/amount-format';
import { ProfitTradeBasisInput, calculateTradeProfit, sum } from '@workspace/api-zod';
import type { ProfitReport, ProfitRow, ProfitPeriodTotal } from '@workspace/api-zod';
import { Loader2, AlertTriangle } from 'lucide-react';
import { InlineNotice } from '../components/shared-app-ui';

const fmt = (v: string | null | undefined) => (v == null ? '—' : formatDisplayAmount(v, { useGrouping: true }, 'en-US'));
const tone = (v: string) => (v.startsWith('-') && /[1-9]/.test(v) ? 'is-loss' : /[1-9]/.test(v) ? 'is-profit' : '');
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Request failed. Try again.');

type Draft = {
  quantitySide: 'source' | 'target'; buyMode: 'unit' | 'total'; sellMode: 'unit' | 'total';
  buyValue: string; sellValue: string; buyCurrency: string; sellCurrency: string; buyFx: string; sellFx: string;
  commission1Percent: string; receivingCommissionPercent: string; additionalFixedFee: string;
  evidence: string; costsVerified: boolean;
};

function defaultSide(row: ProfitRow, report: ProfitReport): 'source' | 'target' {
  const k = report.assetKinds;
  if (k) {
    const from = k[row.fromAsset], to = k[row.toAsset];
    if (from === 'fiat' && to === 'crypto') return 'target';
    if (from === 'crypto' && to === 'fiat') return 'source';
  }
  return 'target';
}

export function TradeEditor({ row, report, accountingCurrency }: { row: ProfitRow; report: ProfitReport & { assetKinds?: Record<string, 'crypto' | 'fiat'> }; accountingCurrency: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState(accountingCurrency);
  const [d, setD] = useState<Draft>({ quantitySide: defaultSide(row, report), buyMode: 'total', sellMode: 'total', buyValue: '', sellValue: '', buyCurrency: accountingCurrency, sellCurrency: accountingCurrency, buyFx: '1', sellFx: '1', commission1Percent: '0', receivingCommissionPercent: '0', additionalFixedFee: '0', evidence: '', costsVerified: false });
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => {
    const n = { ...p, [k]: v };
    if (k === 'buyCurrency' && v !== p.buyCurrency) n.buyFx = v === currency ? '1' : '';
    if (k === 'sellCurrency' && v !== p.sellCurrency) n.sellFx = v === currency ? '1' : '';
    return n;
  });
  const changeCurrency = (c: string) => { setCurrency(c); setD(p => ({ ...p, buyFx: p.buyCurrency === c ? '1' : '', sellFx: p.sellCurrency === c ? '1' : '' })); };

  const adjCurrencies = Array.from(new Set(row.audit.filter(a => a.amount != null && /adjust/i.test(a.kind)).map(a => a.currency)));
  const lock = adjCurrencies[0];
  const cur = lock ?? currency;
  const adjustments = row.audit.filter(a => a.amount != null && /adjust/i.test(a.kind) && a.currency === cur).map(a => a.amount as string);
  const adjTotal = adjustments.length ? sum(...adjustments) : '0';

  const base = { calculation: 'trade' as const, currency: cur, quantitySide: d.quantitySide, buyMode: d.buyMode, sellMode: d.sellMode, buyValue: d.buyValue, sellValue: d.sellValue, buyCurrency: d.buyCurrency, sellCurrency: d.sellCurrency, buyFx: d.buyCurrency === cur ? '1' : d.buyFx, sellFx: d.sellCurrency === cur ? '1' : d.sellFx, commission1Percent: d.commission1Percent || '0', receivingCommissionPercent: d.receivingCommissionPercent || '0', additionalFixedFee: d.additionalFixedFee || '0' };
  const draftParse = ProfitTradeBasisInput.safeParse({ ...base, evidence: 'Preview only - not saved', costsVerified: true });
  let preview: ReturnType<typeof calculateTradeProfit> | null = null;
  if (draftParse.success) { try { preview = calculateTradeProfit(row.amount, row.receiveAmount, draftParse.data); } catch { preview = null; } }
  const finalNet = preview ? sum(preview.netProfit, adjTotal) : null;
  const realParse = ProfitTradeBasisInput.safeParse({ ...base, evidence: d.evidence, costsVerified: d.costsVerified });
  const firstIssue = !draftParse.success ? draftParse.error.issues[0] : null;
  const hint = firstIssue ? `${firstIssue.path.join('.') || 'input'}: ${firstIssue.message}` : d.evidence.trim().length < 8 ? 'Evidence must be at least 8 characters.' : !d.costsVerified ? 'Confirm the actual trade figures are verified.' : '';

  const save = useMutation({
    mutationFn: () => customFetch<{ id: string; replay: boolean }>(`/api/admin/profit-dashboard/orders/Swap/${encodeURIComponent(row.id)}/trade`, { method: 'POST', responseType: 'json', body: JSON.stringify({ ...base, evidence: d.evidence.trim(), costsVerified: true, requestId }) }),
    onSuccess: () => { setRequestId(crypto.randomUUID()); setOpen(false); qc.invalidateQueries({ queryKey: ['profit-dashboard'] }); },
  });

  if (!report.owner || row.type !== 'Swap' || (row.state !== 'verified' && row.state !== 'missing')) return null;

  const qty = d.quantitySide === 'source' ? row.amount : row.receiveAmount;
  const asset = d.quantitySide === 'source' ? row.fromAsset : row.toAsset;
  const opts = (c: string) => (report.currencies.includes(c) ? report.currencies : [c, ...report.currencies]);
  const legacy = row.basis && !('calculation' in row.basis) ? row.basis : null;

  if (!open) return <div className="pd-trade-cta">
    <button type="button" className="button button-secondary" onClick={() => setOpen(true)} data-testid="button-open-trade-editor">Record actual trade (buy / sell)</button>
    {save.isSuccess && <InlineNotice kind="success">Trade basis saved. Report refreshed.</InlineNotice>}
  </div>;

  return <form className="pd-subform pd-trade" onSubmit={e => { e.preventDefault(); if (realParse.success) save.mutate(); }} data-testid="form-trade-editor">
    <h3>Actual trade basis</h3>
    <p className="pd-note">Enter what the desk actually paid to buy and actually received when selling, for this order's saved executed quantity. Saving does not change the order, its pricing or payout.</p>
    {row.basis && <div className="pd-trade-warn"><AlertTriangle size={14} /><div><strong>This order already has a basis.</strong> Saving replaces it as the current snapshot; prior records stay in immutable history. Old fees are not added again{legacy ? `: provider ${fmt(legacy.providerFee)}, network ${fmt(legacy.networkFee)}, bank ${fmt(legacy.bankFee)}, other ${fmt(legacy.otherFee)} ${legacy.currency} will no longer count.` : '.'}</div></div>}
    <div className="pd-form-grid">
      <label><span className="field-label">Accounting currency</span><select value={cur} disabled={!!lock} onChange={e => changeCurrency(e.target.value)} data-testid="select-trade-currency">{opts(cur).map(c => <option key={c}>{c}</option>)}</select><small>{lock ? `Locked to ${lock}: existing adjustments are retained in this currency.` : 'Profit is reported in this currency.'}</small></label>
      <label className="pd-span"><span className="field-label">Traded quantity (read-only, from saved order)</span>
        <div className="pd-seg" role="radiogroup">
          {(['source', 'target'] as const).map(s => <button type="button" key={s} role="radio" aria-checked={d.quantitySide === s} className={d.quantitySide === s ? 'is-on' : ''} onClick={() => set('quantitySide', s)} data-testid={`radio-qty-${s}`}>{s === 'source' ? 'Sent' : 'Received'}: <b>{s === 'source' ? row.amount : row.receiveAmount} {s === 'source' ? row.fromAsset : row.toAsset}</b></button>)}
        </div>
        <small>{report.assetKinds ? 'Preselected crypto leg from the asset catalog.' : 'Choose the leg that was bought and sold.'}</small></label>
      {(['buy', 'sell'] as const).map(side => {
        const mode = d[`${side}Mode`], cc = d[`${side}Currency`];
        return <fieldset key={side} className="pd-trade-leg pd-span">
          <legend>{side === 'buy' ? 'Actual buy / acquisition' : 'Actual sell proceeds'}</legend>
          <div className="pd-seg">{(['total', 'unit'] as const).map(m => <button type="button" key={m} className={mode === m ? 'is-on' : ''} onClick={() => set(`${side}Mode`, m)} data-testid={`toggle-${side}-${m}`}>{m === 'total' ? 'Total' : `Rate per 1 ${asset}`}</button>)}</div>
          <div className="pd-form-grid">
            <label><span className="field-label">{mode === 'total' ? (side === 'buy' ? 'Total paid' : 'Total proceeds') : 'Unit rate'}</span><input inputMode="decimal" value={d[`${side}Value`]} onChange={e => set(`${side}Value`, e.target.value.trim())} placeholder="0" data-testid={`input-${side}-value`} /></label>
            <label><span className="field-label">Rate currency</span><select value={cc} onChange={e => set(`${side}Currency`, e.target.value)} data-testid={`select-${side}-currency`}>{opts(cc).map(c => <option key={c}>{c}</option>)}</select></label>
            {cc !== cur && <label><span className="field-label">Historical FX: {cur} per 1 {cc}</span><input inputMode="decimal" value={d[`${side}Fx`]} onChange={e => set(`${side}Fx`, e.target.value.trim())} placeholder="Required" data-testid={`input-${side}-fx`} /><small>Actual rate at trade time. Not guessed.</small></label>}
          </div>
        </fieldset>;
      })}
      <label><span className="field-label">Commission 1 (%)</span><input inputMode="decimal" value={d.commission1Percent} onChange={e => set('commission1Percent', e.target.value.trim())} data-testid="input-commission1" /><small>Charged on the buy total.</small></label>
      <label><span className="field-label">Receiving commission (%)</span><input inputMode="decimal" value={d.receivingCommissionPercent} onChange={e => set('receivingCommissionPercent', e.target.value.trim())} data-testid="input-receiving-commission" /><small>Charged on the sell total.</small></label>
      <label><span className="field-label">Additional fixed fee ({cur})</span><input inputMode="decimal" value={d.additionalFixedFee} onChange={e => set('additionalFixedFee', e.target.value.trim())} data-testid="input-fixed-fee" /><small>In accounting currency.</small></label>
    </div>

    <div className="pd-trade-preview" data-testid="trade-preview">
      <div className="pd-trade-preview-head"><strong>Live preview</strong><small>Not saved</small></div>
      {!preview ? <p className="pd-note">{hint || 'Enter valid numbers to preview.'}</p> : <dl>
        <div><dt>Order</dt><dd>{row.id}</dd></div>
        <div><dt>Asset / executed qty</dt><dd>{qty} {asset}</dd></div>
        <div><dt>{d.buyMode === 'unit' ? 'Buy rate per unit' : 'Actual acquisition total'}</dt><dd>{d.buyValue} {d.buyCurrency}</dd></div>
        <div><dt>{d.sellMode === 'unit' ? 'Sell rate per unit' : 'Actual selling total'}</dt><dd>{d.sellValue} {d.sellCurrency}</dd></div>
        <div><dt>Buy cost</dt><dd>{fmt(preview.acquisitionCost)} {cur}</dd></div>
        <div><dt>Sell proceeds</dt><dd>{fmt(preview.revenue)} {cur}</dd></div>
        <div><dt>Gross profit</dt><dd className={tone(preview.grossSpread)}>{fmt(preview.grossSpread)} {cur}</dd></div>
        <div><dt>Commission 1</dt><dd>-{fmt(preview.commission1)}</dd></div>
        <div><dt>Receiving commission</dt><dd>-{fmt(preview.receivingCommission)}</dd></div>
        <div><dt>Additional fees</dt><dd>-{fmt(preview.additionalFixedFee)}</dd></div>
        <div><dt>Existing adjustments</dt><dd className={tone(adjTotal)}>{fmt(adjTotal)}</dd></div>
        <div className="is-final"><dt>Final net profit</dt><dd className={tone(finalNet!)}>{fmt(finalNet)} {cur}</dd></div>
      </dl>}
    </div>

    <label className="pd-span"><span className="field-label">Evidence</span><textarea rows={3} value={d.evidence} onChange={e => set('evidence', e.target.value)} placeholder="Exchange fill IDs, bank statement refs, FX source and timestamp" data-testid="input-trade-evidence" /></label>
    <label className="pd-check pd-span"><input type="checkbox" checked={d.costsVerified} onChange={e => set('costsVerified', e.target.checked)} data-testid="checkbox-trade-verified" /><span>I attest these are the actual executed buy and sell figures, commissions and fees for this order, backed by the evidence above.</span></label>
    {save.isError && <InlineNotice kind="error">{errText(save.error)}</InlineNotice>}
    <div className="pd-form-actions">{hint && <small className="pd-hint">{hint}</small>}<button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" disabled={!realParse.success || save.isPending} data-testid="button-save-trade">{save.isPending && <Loader2 className="spin" size={14} />}Save trade basis</button></div>
  </form>;
}

export function PeriodSummary({ periods }: { periods?: ProfitReport['periods'] }) {
  if (!periods) return null;
  const cols: [string, ProfitPeriodTotal[]][] = [['Today', periods.daily], ['This week', periods.weekly], ['This month', periods.monthly], ['All time', periods.total]];
  return <section className="panel pd-periods" data-testid="profit-periods">
    <div className="pd-periods-head"><strong>Realized profit by period</strong><small>UTC · grouped by order creation date · as of {new Date(periods.asOf).toISOString().slice(0, 16).replace('T', ' ')} UTC</small></div>
    <div className="pd-periods-grid">{cols.map(([label, list]) => <div key={label}><span>{label}</span>
      {list.length === 0 ? <small className="pd-note">No verified orders</small> : list.map(p => <div key={p.currency} className="pd-period-row"><b className={`pd-money ${tone(p.profit)}`}>{fmt(p.profit)}</b><small>{p.currency} · {p.orders} orders</small></div>)}
    </div>)}</div>
  </section>;
}
