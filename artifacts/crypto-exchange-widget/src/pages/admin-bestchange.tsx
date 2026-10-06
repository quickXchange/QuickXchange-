import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, Plus, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  getGetAdminBestchangeQueryKey, getGetBestchangeXmlUrl, useGetAdminBestchange,
  useGetAdminBestchangePreview, useUpdateAdminBestchange,
  getAdminBestchangeReservesExport, previewAdminBestchangeReserves, applyAdminBestchangeReserves,
} from '@workspace/api-client-react';
import type {
  BestchangeCode, BestchangeDirection, BestchangeOption, BestchangeSettings,
  BestchangeReserveTransfer, BestchangeReserveReview,
} from '@workspace/api-client-react';
import { AdminShell } from '../App';
import { notifyAdminAction } from '@/components/admin-action-toast';
import { useAdminPermissions } from '@/lib/admin-permissions';

const PARAMS = ['manual', 'juridical', 'verifying', 'cardverify', 'otherin', 'otherout', 'reg', 'card2card', 'delivery', 'atm'] as const;
const REQUIRED_TAGS: [string, string][] = [
  ['from', 'BestChange code of the currency the customer sends.'],
  ['to', 'BestChange code of the currency the customer receives.'],
  ['in', 'Amount of the source currency, always 1 (rate base).'],
  ['out', 'Conservative, fee-inclusive amount received for 1 unit sent. Never above actual payout.'],
  ['amount', 'Declared public payout reserve in target currency. Zero disables export.'],
  ['minamount', 'Minimum source amount (narrowed by actual Swap limits).'],
  ['maxamount', 'Maximum source amount (narrowed by actual Swap limits).'],
];
const OPTIONAL_TAGS: [string, string][] = [
  ['fromfee / tofee', 'Always zero when emitted: every Swap fee is already included in out. Change fees in Swap Pricing, not here.'],
  ['floating', 'Rate drift guard, in minutes or percent (0 allowed).'],
  ['delay', 'Expected processing delay in minutes.'],
  ['param', 'Comma list of flags. manual is always forced by the server.'],
  ['city', 'Official city codes, for cash directions only.'],
  ['minfee / other', 'Not exposed; extra XML fees are never editable.'],
];
const dec = /^[0-9]{1,12}(\.[0-9]{1,12})?$/;
const field = 'mt-1.5 w-full min-h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60';
const lbl = 'block min-w-0 text-xs font-semibold text-muted-foreground';
const btn = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50';
const btnPrimary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50';
const card = 'rounded-xl border border-border bg-card p-4 sm:p-5';

function validate(d: BestchangeDirection, options: BestchangeOption[]): string[] {
  const e: string[] = [];
  const s = options.find(o => o.id === d.sourceOptionId);
  const t = options.find(o => o.id === d.targetOptionId);
  if (!d.sourceOptionId || !d.targetOptionId) e.push('Choose both source and target options.');
  else if (d.sourceOptionId === d.targetOptionId) e.push('Source and target must differ.');
  if (!d.automatic && s && !['send', 'both'].includes(s.direction)) e.push('Source option must allow sending.');
  if (!d.automatic && t && !['receive', 'both'].includes(t.direction)) e.push('Target option must allow receiving.');
  if (s && t && s.kind !== 'fiat-payment-method' && t.kind !== 'fiat-payment-method') e.push('At least one side must be fiat.');
  if (!d.automatic && d.enabled && (!s || !t)) e.push('Enabled directions must use currently available Swap options.');
  if (!d.automatic && (!d.fromCode || !d.toCode)) e.push('Choose official from/to currency codes.');
  if (t?.kind !== 'fiat-payment-method' && !dec.test(d.reserve ?? '0')) e.push('Reserve must be a decimal number (0 disables export).');
  for (const k of ['minAmount', 'maxAmount'] as const) {
    if (!dec.test(d[k]) || (Number(d[k]) <= 0 && !(d.automatic && d[k] === '0'))) e.push(`${k === 'minAmount' ? 'Min' : 'Max'} amount must be a positive decimal.`);
  }
  if (dec.test(d.minAmount) && dec.test(d.maxAmount) && Number(d.maxAmount) > 0 && Number(d.minAmount) > Number(d.maxAmount)) e.push('Min amount exceeds max amount.');
  if (d.floating && !/^[0-9]{1,6}(\.[0-9]{1,6})?%?$/.test(d.floating)) e.push('Floating must be minutes or a percent, e.g. 5 or 0.5%.');
  if (d.delay && !/^[0-9]{1,6}(\.[0-9]{1,6})?$/.test(d.delay)) e.push('Delay must be minutes.');
  return e;
}

function CodePicker({ value, onChange, codes, disabled, testId }: { value: string; onChange: (v: string) => void; codes: BestchangeCode[]; disabled: boolean; testId: string }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const f = n ? codes.filter(c => c.code.toLowerCase().includes(n) || c.description.toLowerCase().includes(n)) : codes;
    return f.slice(0, 80);
  }, [q, codes]);
  const known = codes.some(c => c.code === value);
  return (
    <div>
      <input className={field} placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} disabled={disabled} />
      <select className={field} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} data-testid={testId}>
        <option value="">Select…</option>
        {value && !known && <option value={value}>{value} (not in official list)</option>}
        {value && known && !list.some(c => c.code === value) && <option value={value}>{value}</option>}
        {list.map(c => <option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
      </select>
    </div>
  );
}

function DirectionEditor({ d, i, options, currencyCodes, cityCodes, canManage, onChange, onRemove }: {
  d: BestchangeDirection; i: number; options: BestchangeOption[]; currencyCodes: BestchangeCode[]; cityCodes: BestchangeCode[];
  canManage: boolean; onChange: (p: Partial<BestchangeDirection>) => void; onRemove: () => void;
}) {
  const [cityQ, setCityQ] = useState('');
  const errors = validate(d, options);
  const sources = options.filter(o => ['send', 'both'].includes(o.direction));
  const targets = options.filter(o => ['receive', 'both'].includes(o.direction));
  const missing = (id: string) => !!id && !options.some(o => o.id === id);
  const optSelect = (list: BestchangeOption[], val: string, key: 'sourceOptionId' | 'targetOptionId', tid: string) => (
    <select className={field} value={val} disabled={!canManage || d.automatic} data-testid={tid} onChange={e => onChange({ [key]: e.target.value })}>
      <option value="">Select…</option>
      {missing(val) && <option value={val}>{val} (missing option)</option>}
      {list.map(o => <option key={o.id} value={o.id}>{o.label} · {o.assetCode} {o.network}</option>)}
    </select>
  );
  const cityMatches = cityQ.trim() ? cityCodes.filter(c => (c.code + c.description).toLowerCase().includes(cityQ.trim().toLowerCase())).slice(0, 8) : [];
  return (
    <div className={`${card} space-y-4`} data-testid={`bestchange-direction-${i}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={d.enabled} disabled={!canManage} onChange={e => onChange({ enabled: e.target.checked })} data-testid={`bestchange-direction-toggle-${i}`} />
          {d.enabled ? 'Enabled' : 'Disabled'} · {d.fromCode || '?'} → {d.toCode || '?'}
        </label>
        {!d.automatic && <button type="button" className={btn} disabled={!canManage} onClick={onRemove} data-testid={`bestchange-direction-delete-${i}`}><Trash2 size={16} />Delete</button>}
      </div>
      {d.automatic && <div className="space-y-1 text-xs text-muted-foreground">
        <p>Automatically synced from Manual Pricing{d.pricingRuleName ? ` · ${d.pricingRuleName}` : ''}. Turn off this direction to exclude it from XML.</p>
        {!!d.pendingReasons?.length && <div className="rounded-lg bg-muted p-3" data-testid={`bestchange-pending-${i}`}>
          <p className="font-semibold">Pending setup — not included in XML</p>
          <ul className="mt-1 list-disc pl-4">{d.pendingReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </div>}
      </div>}
      {(missing(d.sourceOptionId) || missing(d.targetOptionId)) && (
        <p className="flex items-center gap-2 text-xs text-amber-600"><AlertTriangle size={14} />A saved option no longer exists. It stays editable but will be omitted from the feed.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className={lbl}>Source option (customer sends){optSelect(sources, d.sourceOptionId, 'sourceOptionId', `bestchange-source-${i}`)}</label>
        <label className={lbl}>Target option (customer receives){optSelect(targets, d.targetOptionId, 'targetOptionId', `bestchange-target-${i}`)}</label>
        <div className={lbl}>From code<CodePicker value={d.fromCode} codes={currencyCodes} disabled={!canManage} onChange={v => onChange({ fromCode: v })} testId={`bestchange-from-${i}`} /></div>
        <div className={lbl}>To code<CodePicker value={d.toCode} codes={currencyCodes} disabled={!canManage} onChange={v => onChange({ toCode: v })} testId={`bestchange-to-${i}`} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {options.find(option => option.id === d.targetOptionId)?.kind === 'fiat-payment-method' || d.targetOptionId.startsWith('fiat:')
          ? <label className={lbl}>Reserve from Payment Methods
              <input className={field} readOnly value={`${options.find(option => option.id === d.targetOptionId)?.reserve ?? '0'} ${options.find(option => option.id === d.targetOptionId)?.assetCode ?? ''}`} data-testid={`bestchange-reserve-${i}`} />
              <span className="text-xs text-muted-foreground">Edit the destination method’s reserve in Payment Methods. Zero omits this direction.</span>
            </label>
          : <label className={lbl}>Crypto payout reserve
              <input className={field} inputMode="decimal" disabled={!canManage} value={d.reserve ?? '0'} data-testid={`bestchange-reserve-${i}`} onChange={event => onChange({ reserve: event.target.value })} />
            </label>}
        {([['minAmount', 'Min amount'], ['maxAmount', 'Max amount'], ['floating', 'Floating (min or %)'], ['delay', 'Delay (min)']] as const).map(([k, l]) => (
          <label key={k} className={lbl}>{l}
            <input className={field} inputMode="decimal" disabled={!canManage} value={(d[k] as string | undefined) ?? ''} data-testid={`bestchange-${k}-${i}`}
              onChange={e => onChange({ [k]: e.target.value } as Partial<BestchangeDirection>)} />
          </label>
        ))}
      </div>
      <div>
        <p className={lbl}>Params (manual is always forced by the server)</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PARAMS.map(p => (
            <label key={p} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs">
              <input type="checkbox" disabled={!canManage} checked={d.params.includes(p)}
                onChange={e => onChange({ params: e.target.checked ? [...d.params, p] : d.params.filter(x => x !== p) })} />{p}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className={lbl}>Cities (cash only, official codes)
          <input className={field} placeholder="Search cities…" value={cityQ} onChange={e => setCityQ(e.target.value)} disabled={!canManage} />
        </label>
        {cityMatches.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {cityMatches.map(c => (
              <button key={c.code} type="button" className={btn} disabled={!canManage || d.cities.includes(c.code) || d.cities.length >= 25}
                onClick={() => { onChange({ cities: [...d.cities, c.code] }); setCityQ(''); }}>+ {c.code} {c.description}</button>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.cities.map(c => (
            <button key={c} type="button" className="rounded-full bg-muted px-2.5 py-1 text-xs" disabled={!canManage}
              onClick={() => onChange({ cities: d.cities.filter(x => x !== c) })}>{c} ×</button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={lbl}>Selected add-on keys (comma separated, optional)
          <input className={field} disabled={!canManage} defaultValue={d.selectedAddOnKeys.join(', ')}
            onBlur={e => onChange({ selectedAddOnKeys: e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 32) })} />
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input type="checkbox" disabled={!canManage} checked={d.includeFeeTags} onChange={e => onChange({ includeFeeTags: e.target.checked })} />
          Emit fromfee/tofee tags (always zero; fees already in out)
        </label>
      </div>
      {errors.length > 0 && <ul className="list-disc pl-5 text-xs text-destructive" data-testid={`bestchange-direction-errors-${i}`}>{errors.map(x => <li key={x}>{x}</li>)}</ul>}
    </div>
  );
}

export function AdminBestchangePage() {
  const qc = useQueryClient();
  const { isOwner } = useAdminPermissions();
  const canManage = isOwner;
  const q = useGetAdminBestchange({ query: { queryKey: getGetAdminBestchangeQueryKey(), enabled: canManage, refetchOnWindowFocus: true } });
  const preview = useGetAdminBestchangePreview({ query: { enabled: canManage, refetchOnWindowFocus: false, queryKey: ['bestchange-preview'] } });
  const save = useUpdateAdminBestchange();
  const [draft, setDraft] = useState<BestchangeSettings | null>(null);
  const [reserveTransfer, setReserveTransfer] = useState<BestchangeReserveTransfer | null>(null);
  const [reserveReview, setReserveReview] = useState<BestchangeReserveReview | null>(null);
  const [reserveBusy, setReserveBusy] = useState(false);
  const [directionSearch, setDirectionSearch] = useState('');
  const [directionPage, setDirectionPage] = useState(0);
  const data = q.data;
  const settings = draft ?? data?.settings;
  const dirty = draft !== null;
  const optionLabels = new Map((data?.options ?? []).map(option => [option.id, option.label]));
  const filteredDirections = (settings?.directions ?? []).map((d, i) => ({ d, i })).filter(({ d }) =>
    [d.fromCode, d.toCode, d.pricingRuleName, optionLabels.get(d.sourceOptionId), optionLabels.get(d.targetOptionId)]
      .filter(Boolean).join(' ').toLowerCase().includes(directionSearch.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filteredDirections.length / 25));
  const currentPage = Math.min(directionPage, pageCount - 1);
  const visibleDirections = filteredDirections.slice(currentPage * 25, (currentPage + 1) * 25);

  const edit = (fn: (s: BestchangeSettings) => BestchangeSettings) => {
    if (settings && !save.isPending) setDraft(fn(settings));
  };
  const patchDir = (id: string, p: Partial<BestchangeDirection>) => edit(s => ({ ...s, directions: s.directions.map(x => x.id === id ? { ...x, ...p } : x) }));
  const feedUrl = `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}${getGetBestchangeXmlUrl()}`;
  const allErrors = settings ? settings.directions.some(d => validate(d, data?.options ?? []).length > 0) : false;

  const onSave = () => {
    if (!settings || !data) return;
    if (allErrors) { notifyAdminAction('error', 'Fix the highlighted direction errors before saving.'); return; }
    save.mutate({ data: settings }, {
      onSuccess: res => {
        qc.setQueryData(getGetAdminBestchangeQueryKey(), { ...data, settings: res });
        setDraft(null);
        notifyAdminAction('success', `BestChange settings saved (version ${res.version}).`);
        void preview.refetch();
      },
      onError: error => notifyAdminAction('error', error instanceof Error ? error.message : 'Save failed. Reload if another operator changed these settings.'),
    });
  };
  const add = () => {
    if (!settings) return;
    edit(s => ({
      ...s, directions: [...s.directions, {
        id: crypto.randomUUID(), enabled: false, sourceOptionId: '', targetOptionId: '', fromCode: '', toCode: '',
        reserve: '0', minAmount: '', maxAmount: '', params: [], cities: [], selectedAddOnKeys: [], includeFeeTags: false,
      }],
    }));
  };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); notifyAdminAction('success', `${what} copied.`); }
    catch { notifyAdminAction('error', `Could not copy ${what.toLowerCase()}.`); }
  };
  const download = () => {
    if (!preview.data) return;
    const url = URL.createObjectURL(new Blob([preview.data.xml], { type: 'application/xml;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'bestchange.xml'; a.click(); URL.revokeObjectURL(url);
  };
  const downloadReserves = async () => {
    setReserveBusy(true);
    try {
      const transfer = await getAdminBestchangeReservesExport();
      const url = URL.createObjectURL(new Blob([JSON.stringify(transfer, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'qx-bestchange-reserves.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      notifyAdminAction('success', `Downloaded ${transfer.reserves.length} positive enabled payout reserves.`);
    } catch (error) {
      notifyAdminAction('error', error instanceof Error ? error.message : 'Reserve export failed.');
    } finally { setReserveBusy(false); }
  };
  const reviewReserves = async (file: File) => {
    setReserveTransfer(null); setReserveReview(null); setReserveBusy(true);
    try {
      if (file.size > 100_000) throw new Error('Reserve file exceeds the 100 KB limit.');
      const transfer: unknown = JSON.parse(await file.text());
      // The Owner-only server validates the complete file and target identities.
      const review = await previewAdminBestchangeReserves(transfer as BestchangeReserveTransfer);
      setReserveTransfer(transfer as BestchangeReserveTransfer);
      setReserveReview(review);
    } catch (error) {
      notifyAdminAction('error', error instanceof Error ? error.message : 'Could not review the reserve file.');
    } finally { setReserveBusy(false); }
  };
  const confirmReserves = async () => {
    if (!reserveTransfer || !reserveReview) return;
    setReserveBusy(true);
    try {
      const result = await applyAdminBestchangeReserves({ transfer: reserveTransfer, reviewHash: reserveReview.reviewHash });
      setReserveReview(null); setReserveTransfer(null);
      await Promise.all([q.refetch(), preview.refetch()]);
      notifyAdminAction('success', `Updated ${result.updatedCount} payout reserves. Feed refreshed.`);
    } catch (error) {
      // A concurrent change requires a fresh review; never retry an old hash.
      setReserveReview(null); setReserveTransfer(null);
      notifyAdminAction('error', error instanceof Error ? error.message : 'Reserves changed. Upload the file to review it again.');
    } finally { setReserveBusy(false); }
  };

  return (
    <AdminShell eyebrow="INTEGRATIONS / BESTCHANGE" title="BestChange XML Export" subtitle="Publish truthful settlement availability">
      <div className="mx-auto max-w-5xl space-y-5 pb-24" data-testid="bestchange-page">
        {!canManage ? <div className={card}>Owner access is required.</div>
          : q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div>
          : q.isError || !data || !settings ? (
            <div className={card} role="alert">Could not load BestChange settings.
              <button className={`${btn} ml-3`} onClick={() => void q.refetch()}>Retry</button></div>
          ) : (<>
            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={settings.enabled} disabled={save.isPending} onChange={e => edit(s => ({ ...s, enabled: e.target.checked }))} data-testid="bestchange-enabled" />
                  Feed enabled <span className="font-normal text-muted-foreground">(version {settings.version})</span>
                </label>
                <button className={btnPrimary} onClick={onSave} disabled={!dirty || save.isPending} data-testid="bestchange-save">{save.isPending ? 'Saving…' : 'Save changes'}</button>
              </div>
              {dirty && <p className="mt-2 text-xs text-amber-600">Unsaved changes. Preview and the public feed use the saved configuration only.</p>}
              <p className="mt-3 text-sm text-muted-foreground">Fiat payout reserves come automatically from the destination Payment Method and currency. Maintain them in Payment Methods; orders do not change reserves. Crypto payout reserves remain operator-declared. The feed uses the live Swap engine with a conservative, fee-inclusive effective rate across your source range; classic BestChange XML has no stepped rates, so the worst rate in range is shown. Routes with tier gaps, unhealthy or unavailable status are omitted and explained below. To change fees, use Swap Pricing.</p>
            </section>

            <section className={card}>
              <p className={lbl}>Public feed link — current environment URL</p>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input readOnly className={field + ' !mt-0 font-mono'} value={feedUrl} />
                <button className={btn} onClick={() => void copy(feedUrl, 'Feed link')} data-testid="bestchange-copy-link"><Copy size={16} />Copy</button>
                <a className={btn} href={feedUrl} target="_blank" rel="noreferrer" data-testid="bestchange-open-link"><ExternalLink size={16} />Open</a>
              </div>
            </section>

            <section className={card} data-testid="bestchange-reserve-transfer">
              <h2 className="text-base font-semibold">Transfer declared payout reserves</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                In the Workspace, download the reserve file. After publishing, open this page in Production,
                upload that file, review each currency and payment method, then apply. Only enabled,
                matching fiat payout reserves are changed. Wallets, orders and provider settings are never transferred.
                Zero-reserve and unsupported routes remain pending.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={btn} type="button" disabled={reserveBusy} onClick={() => void downloadReserves()}
                  data-testid="bestchange-export-reserves"><Download size={16} />Download workspace reserves</button>
                <label className={`${btn} cursor-pointer ${reserveBusy ? 'opacity-50' : ''}`}>
                  Review reserve file
                  <input className="sr-only" type="file" accept=".json,application/json" disabled={reserveBusy}
                    data-testid="bestchange-import-reserves"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void reviewReserves(file);
                    }} />
                </label>
              </div>
              {reserveReview && reserveTransfer && <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
                data-testid="bestchange-reserve-review">
                <p className="text-sm font-semibold">Review {reserveReview.changes.length} selected reserves in this environment</p>
                <p className="mt-1 text-xs text-muted-foreground">Each amount below will be advertised as available payout liquidity. The current production value is shown for comparison. Changes require Owner approval.</p>
                <div className="mt-3 max-h-60 overflow-y-auto text-xs">
                  {reserveReview.changes.map(change => <div key={`${change.currencyCode}:${change.paymentMethodId}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border py-1.5">
                    <span className="truncate">{change.paymentMethodId} · {change.currencyCode}</span>
                    <span className="font-mono tabular-nums">{change.currentReserve} → {change.proposedReserve}</span>
                  </div>)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={btnPrimary} type="button" disabled={reserveBusy ||
                    reserveReview.changes.every(change => change.currentReserve === change.proposedReserve)}
                    onClick={() => void confirmReserves()} data-testid="bestchange-apply-reserves">
                    {reserveBusy ? 'Applying…' : `Apply ${reserveReview.changes.filter(change => change.currentReserve !== change.proposedReserve).length} reserves`}
                  </button>
                  <button className={btn} type="button" disabled={reserveBusy}
                    onClick={() => { setReserveReview(null); setReserveTransfer(null); }}>Cancel</button>
                </div>
              </div>}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Directions ({settings.directions.length})</h2>
                <div className="flex flex-wrap gap-2">
                  <button className={btn} disabled={dirty || q.isFetching || save.isPending} onClick={() => { void q.refetch(); void preview.refetch(); }} data-testid="bestchange-sync-directions"><RefreshCw size={16} />Refresh routes</button>
                  <button className={btnPrimary} onClick={add} disabled={save.isPending} data-testid="bestchange-add-direction"><Plus size={16} />Add direction</button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Manual Pricing routes sync automatically, including Any and all-network rules. New routes use reviewed official codes for exact network or payment-method identities; ambiguous bank methods remain pending. Operator-entered codes and crypto reserves remain authoritative. Missing settings stay pending; ready routes use live Swap pricing. Existing disabled directions stay disabled.</p>
              <input className={field} value={directionSearch} placeholder="Search directions, payment methods, assets or pricing rules…" onChange={event => { setDirectionSearch(event.target.value); setDirectionPage(0); }} data-testid="bestchange-direction-search" />
              {settings.directions.length === 0 && <div className={card}>No available Manual Pricing routes yet. New priced routes will appear automatically.</div>}
              {filteredDirections.length === 0 && settings.directions.length > 0 && <div className={card}>No matching directions.</div>}
              {visibleDirections.map(({ d, i }) => (
                <DirectionEditor key={d.id} d={d} i={i} options={data.options} currencyCodes={data.currencyCodes} cityCodes={data.cityCodes} canManage={canManage && !save.isPending}
                  onChange={p => patchDir(d.id, p)} onRemove={() => edit(s => ({ ...s, directions: s.directions.filter(x => x.id !== d.id) }))} />
              ))}
              {pageCount > 1 && <div className="flex items-center justify-between gap-3">
                <button className={btn} disabled={currentPage === 0} onClick={() => setDirectionPage(currentPage - 1)}>Previous</button>
                <span className="text-xs text-muted-foreground">Page {currentPage + 1} of {pageCount} · {filteredDirections.length} matching directions</span>
                <button className={btn} disabled={currentPage + 1 >= pageCount} onClick={() => setDirectionPage(currentPage + 1)}>Next</button>
              </div>}
            </section>

            <section className={card} data-testid="bestchange-preview">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Saved-config preview</h2>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => void preview.refetch()} disabled={preview.isFetching}><RefreshCw size={16} />Refresh</button>
                  <button className={btn} disabled={!preview.data} onClick={() => preview.data && void copy(preview.data.xml, 'XML')}><Copy size={16} />Copy</button>
                  <button className={btn} disabled={!preview.data} onClick={download}><Download size={16} />Download</button>
                </div>
              </div>
              {dirty && <p className="mt-2 text-xs text-amber-600">Unsaved edits are not reflected here.</p>}
              {preview.isLoading ? <div className="mt-3 h-32 animate-pulse rounded-lg bg-muted" />
                : preview.isError || !preview.data ? <p className="mt-3 text-sm text-destructive">Preview failed. <button className="underline" onClick={() => void preview.refetch()}>Retry</button></p>
                : (<>
                  <p className="mt-2 text-xs text-muted-foreground">{preview.data.enabled ? 'Feed enabled' : 'Feed disabled (dry preview)'} · v{preview.data.version} · {preview.data.exportedCount} exported · {new Date(preview.data.generatedAt).toLocaleString()}</p>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs" data-testid="bestchange-xml">{preview.data.xml}</pre>
                  <ul className="mt-3 space-y-1 text-sm">
                    {preview.data.diagnostics.map(x => (
                      <li key={x.id} className={x.exported ? 'text-emerald-600' : 'text-amber-600'}>{x.exported ? 'Exported' : 'Omitted'} · {x.message}</li>
                    ))}
                  </ul>
                </>)}
            </section>

            <section className={card}>
              <h2 className="text-base font-semibold">Tag reference</h2>
              <h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Required (7)</h3>
              <dl className="mt-1 space-y-1 text-sm">{REQUIRED_TAGS.map(([t, x]) => <div key={t}><dt className="inline font-mono font-semibold">&lt;{t}&gt;</dt> — <dd className="inline text-muted-foreground">{x}</dd></div>)}</dl>
              <h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Optional (6)</h3>
              <dl className="mt-1 space-y-1 text-sm">{OPTIONAL_TAGS.map(([t, x]) => <div key={t}><dt className="inline font-mono font-semibold">{t}</dt> — <dd className="inline text-muted-foreground">{x}</dd></div>)}</dl>
              <h3 className="mt-4 text-xs font-semibold uppercase text-muted-foreground">Official examples</h3>
              <pre className="mt-1 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">{data.exampleXml}</pre>
              <a className="mt-2 inline-block text-sm underline" href={data.documentationUrl} target="_blank" rel="noreferrer">BestChange documentation</a>
            </section>
          </>)}
      </div>
    </AdminShell>
  );
}
