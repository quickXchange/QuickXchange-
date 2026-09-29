import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  getGetManualSwapFeeConfigQueryKey, getListAdminManualSwapAddonsQueryKey, getListPublicManualSwapAddonsQueryKey,
  useCreateManualSwapAddon, useDeleteManualSwapAddon, useGetManualSwapFeeConfig,
  useListAdminManualSwapAddons, useUpdateManualSwapAddon, useUpdateManualSwapFeeConfig,
} from '@workspace/api-client-react';
import type { ManualSwapAddon, ManualSwapAddonInput } from '@workspace/api-client-react';
import { AdminShell } from '../App';
import { trimFeeDecimal } from '../components/swap-fee-breakdown';
import { AdminSwapAddonPreview } from '../components/admin-swap-addon-preview';
import { addonKeyFromText, validAddonKey } from '../lib/swap-addon-key';
import { notifyAdminAction } from '@/components/admin-action-toast';

type Locale = 'en' | 'ru' | 'ar' | 'uk';
type Translation = { title?: string; description?: string };
type AddonDraft = ManualSwapAddonInput & {
  feeType: 'fixed' | 'percentage';
  percentage: string | null;
  translations?: Partial<Record<Locale, Translation>>;
};
type AddonRecord = ManualSwapAddon & Partial<Pick<AddonDraft, 'feeType' | 'percentage' | 'translations'>>;
const locales: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' }, { code: 'uk', label: 'Ukrainian' },
];
const decimal = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/;
const blank: AddonDraft = { name: '', key: '', description: '', feeType: 'fixed', percentage: null, fixedAmount: '0', feeCurrency: 'USD', enabled: true, displayOrder: 0, selectionRule: 'multiple', presentation: { group: '' }, translations: {} };
const fromRecord = (item: AddonRecord): AddonDraft => ({
  name: item.name, key: item.key, description: item.description,
  feeType: item.feeType === 'percentage' ? 'percentage' : 'fixed',
  percentage: item.feeType === 'percentage' ? (item.percentage == null ? '' : trimFeeDecimal(item.percentage)) : null,
  fixedAmount: item.fixedAmount,
  feeCurrency: item.feeCurrency, enabled: item.enabled, displayOrder: item.displayOrder,
  selectionRule: item.selectionRule, presentation: { group: item.presentation.group },
  translations: item.translations ? { ...item.translations } : {},
});
const toPayload = (draft: AddonDraft): AddonDraft => ({
  ...draft, feeCurrency: draft.feeType === 'percentage' ? 'USD' : draft.feeCurrency,
  fixedAmount: draft.feeType === 'percentage' ? '0' : draft.fixedAmount,
  percentage: draft.feeType === 'percentage' ? draft.percentage : null,
  translations: Object.fromEntries(locales.filter(({ code }) =>
    draft.translations?.[code]?.title?.trim() || draft.translations?.[code]?.description?.trim()
  ).map(({ code }) => [code, draft.translations![code]])) as AddonDraft['translations'],
});
const field = 'mt-1.5 w-full min-h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15';
const label = 'block min-w-0 text-xs font-semibold text-muted-foreground';

export function AdminSwapAddonsPage() {
  const qc = useQueryClient();
  const list = useListAdminManualSwapAddons();
  const fee = useGetManualSwapFeeConfig();
  const create = useCreateManualSwapAddon();
  const update = useUpdateManualSwapAddon();
  const remove = useDeleteManualSwapAddon();
  const saveFee = useUpdateManualSwapFeeConfig();
  const [editing, setEditing] = useState<ManualSwapAddon | 'new' | null>(null);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [form, setForm] = useState<AddonDraft>(blank);
  const [keyEdited, setKeyEdited] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState({ enabled: false, percentage: '', fixedAmount: '', fixedCurrency: 'USD' });
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (fee.data) setFeeForm({ enabled: fee.data.enabled, percentage: fee.data.percentage ? trimFeeDecimal(fee.data.percentage) : '', fixedAmount: fee.data.fixedAmount ? trimFeeDecimal(fee.data.fixedAmount) : '', fixedCurrency: fee.data.fixedCurrency });
  }, [fee.data]);
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListAdminManualSwapAddonsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListPublicManualSwapAddonsQueryKey() }),
    ]);
  };
  const open = (item?: ManualSwapAddon) => {
    setMessage('');
    setEditing(item || 'new');
    setEditorCollapsed(false);
    setKeyEdited(Boolean(item));
    setForm(item ? fromRecord(item as AddonRecord) : { ...blank, presentation: { group: '' }, translations: {} });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!validAddonKey.test(form.key)) {
      setMessage('Enter a key starting with a lowercase letter or number, using only lowercase letters, numbers, hyphens, and underscores (up to 100 characters).');
      return;
    }
    if (!decimal.test(form.feeType === 'fixed' ? form.fixedAmount : form.percentage || '')) {
      setMessage(form.feeType === 'fixed' ? 'Enter a valid fixed fee.' : 'Enter a valid percentage (1 means 1%).');
      return;
    }
    if (form.feeType === 'fixed' && form.feeCurrency !== 'USD' &&
      (editing === 'new' || !editing || form.feeCurrency !== editing.feeCurrency || form.fixedAmount !== editing.fixedAmount)) {
      setMessage('Legacy fixed fees can only be retained unchanged. Choose Convert to USD and enter a new USD amount to change this fee.');
      return;
    }
    if (locales.some(({ code }) => {
      const translation = form.translations?.[code];
      return translation && ((translation.description?.trim() && !translation.title?.trim()) || (translation.title?.length || 0) > 120 || (translation.description?.length || 0) > 1000);
    })) {
      setMessage('Each translation with a description needs a title. Keep titles under 120 characters and descriptions under 1,000.');
      return;
    }
    try {
      const updating = Boolean(editing && editing !== 'new');
      const data = toPayload(form);
      if (editing && editing !== 'new') await update.mutateAsync({ id: editing.id, data });
      else await create.mutateAsync({ data });
      await refresh();
      setEditing(null);
      notifyAdminAction('success', updating ? 'Swap add-on updated successfully.' : 'Swap add-on created successfully.');
    } catch (error) { notifyAdminAction('error', error instanceof Error ? error.message : 'Could not save swap add-on.'); }
  };
  const deleteItem = async (item: ManualSwapAddon) => {
    if (!window.confirm(`Delete ${item.name}? Historical orders will retain their saved fees.`)) return;
    setMessage('');
    try { await remove.mutateAsync({ id: item.id }); await refresh(); if (editing && editing !== 'new' && editing.id === item.id) setEditing(null); notifyAdminAction('success', 'Swap add-on deleted successfully.'); }
    catch (error) { notifyAdminAction('error', error instanceof Error ? error.message : 'Could not delete swap add-on.'); }
  };
  const toggleItem = async (item: ManualSwapAddon) => {
    if (togglingId) return;
    setTogglingId(item.id);
    setMessage('');
    try {
      // Full-replacement API: copy the saved pricing verbatim for a status-only update.
      await update.mutateAsync({ id: item.id, data: {
        key: item.key, name: item.name, description: item.description,
        feeType: item.feeType, fixedAmount: item.fixedAmount, feeCurrency: item.feeCurrency,
        percentage: item.percentage, translations: item.translations,
        enabled: !item.enabled, displayOrder: item.displayOrder,
        selectionRule: item.selectionRule, presentation: item.presentation,
      } });
      await refresh();
      notifyAdminAction('success', `Swap add-on ${item.enabled ? 'disabled' : 'enabled'} successfully.`);
    } catch (error) {
      notifyAdminAction('error', error instanceof Error ? error.message : 'Could not change add-on status.');
    } finally { setTogglingId(null); }
  };
  const legacyFixed = editing && editing !== 'new' && form.feeType === 'fixed' && form.feeCurrency !== 'USD';
  return <AdminShell title="Swap Order Add-ons" eyebrow="PRICING / SWAP" subtitle="Optional choices and additional exchange fees for Manual Swap only." requiredPermission="pricing.view">
    <div className="space-y-4 pb-8">
      {message && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm" data-testid="status-swap-addons">{message}</p>}
      <section className="panel min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div><h2 className="text-base font-bold text-foreground">Optional add-ons</h2><p className="mt-0.5 text-xs text-muted-foreground">Customers choose from enabled options before confirming a quote.</p></div>
          <button type="button" onClick={() => open()} className="button button-primary inline-flex items-center gap-2 text-xs" data-testid="button-add-swap-option"><Plus size={15}/> Add option</button>
        </div>
        <div className="px-4 py-2 sm:px-6">
          {list.isLoading ? <div className="skeleton my-3 h-24 rounded-lg"/> : list.isError ? <div role="alert" className="py-5 text-sm">Could not load options. <button type="button" onClick={() => list.refetch()} className="text-primary underline" data-testid="button-retry-swap-options">Retry</button></div> :
            !list.data?.items.length ? <div className="my-3 rounded-lg border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">No add-ons yet. Add an option to make it available on Swap.</div> :
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-border text-muted-foreground"><th className="py-3 pr-4 font-semibold">Display Name</th><th className="px-3 py-3 font-semibold">Key</th><th className="px-3 py-3 font-semibold">Fee</th><th className="px-3 py-3 font-semibold">Type</th><th className="px-3 py-3 font-semibold">Position</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Edit</th><th className="py-3 pl-3 font-semibold">Delete</th></tr></thead><tbody>{list.data.items.map(item => {
                const record = item as AddonRecord;
                const percentage = record.feeType === 'percentage';
                return <tr key={item.id} className="border-b border-border/60 last:border-0" data-testid={`row-swap-addon-${item.key}`}>
                  <td className="py-3 pr-4"><span className="block font-semibold text-foreground" data-testid={`text-addon-name-${item.key}`}>{item.name}</span>{item.description && <span className="block max-w-[240px] truncate text-muted-foreground">{item.description}</span>}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{item.key}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono" data-testid={`text-addon-fee-${item.key}`}>{percentage ? `${record.percentage == null ? '—' : trimFeeDecimal(record.percentage)}%` : `${trimFeeDecimal(item.fixedAmount)} ${item.feeCurrency}`}</td>
                  <td className="whitespace-nowrap px-3 py-3">{percentage ? 'Percentage' : item.feeCurrency === 'USD' ? 'Fixed USD' : `Legacy fixed ${item.feeCurrency}`}</td>
                  <td className="px-3 py-3 font-mono">{item.displayOrder}</td>
                  <td className="px-3 py-3"><button type="button" role="switch" aria-checked={item.enabled} aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`} disabled={Boolean(togglingId) || update.isPending} onClick={() => toggleItem(item)} className="inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-40" data-testid={`switch-addon-enabled-${item.key}`}><span aria-hidden="true" className={`relative inline-block h-4 w-7 rounded-full transition-colors ${item.enabled ? 'bg-primary' : 'bg-muted-foreground/35'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform ${item.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`}/></span><span>{item.enabled ? 'Enabled' : 'Disabled'}</span></button></td>
                  <td className="px-3 py-3"><button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => open(item)} data-testid={`button-edit-addon-${item.key}`}><Pencil size={13}/> Edit</button></td>
                  <td className="py-3 pl-3"><button type="button" className="inline-flex items-center gap-1 text-destructive hover:underline disabled:opacity-40" disabled={remove.isPending || Boolean(togglingId)} onClick={() => deleteItem(item)} data-testid={`button-delete-addon-${item.key}`}><Trash2 size={13}/> Delete</button></td>
                </tr>;
              })}</tbody></table></div>}
        </div>
      </section>
      {editing && <section className="panel min-w-0 overflow-hidden" data-testid="card-addon-editor">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div><h2 className="text-base font-bold">{editing === 'new' ? 'New option' : `Edit ${editing.name}`}</h2><p className="mt-0.5 text-xs text-muted-foreground">Set the fee and the copy customers see in the swap widget.</p></div>
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex cursor-pointer items-center gap-2 font-semibold"><input type="checkbox" className="accent-primary" checked={form.enabled} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} data-testid="checkbox-addon-enabled"/> Enabled</label>
            <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setEditorCollapsed(p => !p)} aria-expanded={!editorCollapsed} data-testid="button-collapse-addon">{editorCollapsed ? <ChevronDown size={14}/> : <ChevronUp size={14}/>} {editorCollapsed ? 'Expand' : 'Collapse'}</button>
            {editing !== 'new' && <button type="button" className="inline-flex items-center gap-1 text-destructive hover:underline" disabled={remove.isPending} onClick={() => deleteItem(editing)} data-testid="button-delete-editing-addon"><Trash2 size={14}/> Delete</button>}
          </div>
        </div>
        {!editorCollapsed && <form onSubmit={submit} className="space-y-6 px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(110px,.55fr)_minmax(145px,.75fr)_minmax(95px,.5fr)]">
            <label className={label}>Key (slug)<input required pattern="[a-z0-9](?:[a-z0-9_]|-)*" maxLength={100} className={field} value={form.key} onChange={e => { setKeyEdited(true); setForm(p => ({ ...p, key: addonKeyFromText(e.target.value) })); }} autoCapitalize="off" spellCheck={false} data-testid="input-addon-key"/><small className="mt-1 block text-[11px] font-normal">Internal slug, e.g. fast_payment</small></label>
            <label className={label}>Display Name<input required maxLength={120} className={field} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value, key: editing === 'new' && !keyEdited ? addonKeyFromText(e.target.value) : p.key }))} data-testid="input-addon-name"/></label>
            {form.feeType === 'fixed' ? <label className={label}>Fee ({form.feeCurrency})<input required readOnly={Boolean(legacyFixed)} inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={form.fixedAmount} onChange={e => setForm(p => ({ ...p, fixedAmount: e.target.value }))} data-testid="input-addon-price"/></label> :
              <label className={label}>Fee (%)<input required inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={form.percentage ?? ''} onChange={e => setForm(p => ({ ...p, percentage: e.target.value }))} data-testid="input-addon-percentage"/></label>}
            <label className={label}>Fee Type<select className={field} value={form.feeType} onChange={e => setForm(p => ({ ...p, feeType: e.target.value as AddonDraft['feeType'], fixedAmount: e.target.value === 'percentage' ? '0' : p.feeType === 'percentage' ? '' : p.fixedAmount, percentage: e.target.value === 'fixed' ? null : p.percentage ?? '', feeCurrency: 'USD' }))} data-testid="select-addon-fee-type"><option value="fixed">{legacyFixed ? `Fixed (legacy ${form.feeCurrency})` : 'Fixed USD'}</option><option value="percentage">Percentage</option></select></label>
            <label className={label}>Position<input required type="number" min="0" step="1" className={field} value={form.displayOrder ?? 0} onChange={e => setForm(p => ({ ...p, displayOrder: e.target.value === '' ? undefined : Number(e.target.value) }))} data-testid="input-addon-display-order"/></label>
          </div>
          {legacyFixed && <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs"><p className="font-semibold">Legacy {form.feeCurrency} fee</p><p className="mt-1 text-muted-foreground">This fee stays at {trimFeeDecimal(form.fixedAmount)} {form.feeCurrency} unless you explicitly convert it. Copy and status can still be saved.</p><button type="button" className="button mt-2" onClick={() => setForm(p => ({ ...p, feeCurrency: 'USD', fixedAmount: '' }))} data-testid="button-convert-addon-usd">Convert to USD</button></div>}
          <div className="space-y-5">
            <div><h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Title (per language)</h3><div className="mt-2 grid gap-2">{locales.map(({ code, label: language }) => <label key={code} className="grid min-w-0 items-center gap-2 sm:grid-cols-[115px_minmax(0,1fr)]"><span className="text-xs text-muted-foreground">{language}</span><input maxLength={120} dir={code === 'ar' ? 'rtl' : undefined} placeholder={code === 'en' ? 'Uses display name when blank' : `Optional ${language.toLowerCase()} title`} className={`${field} mt-0`} value={form.translations?.[code]?.title || ''} onChange={e => setForm(p => ({ ...p, translations: { ...p.translations, [code]: { title: e.target.value, description: p.translations?.[code]?.description || '' } } }))} data-testid={`input-addon-title-${code}`}/></label>)}</div></div>
            <div><h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Description (per language)</h3><div className="mt-2 grid gap-2">{locales.map(({ code, label: language }) => <label key={code} className="grid min-w-0 items-start gap-2 sm:grid-cols-[115px_minmax(0,1fr)]"><span className="pt-2 text-xs text-muted-foreground">{language}</span><textarea rows={2} maxLength={1000} dir={code === 'ar' ? 'rtl' : undefined} placeholder={code === 'en' ? 'Optional description for customers' : `Optional ${language.toLowerCase()} description`} className={`${field} mt-0 resize-y`} value={form.translations?.[code]?.description || ''} onChange={e => setForm(p => ({ ...p, translations: { ...p.translations, [code]: { title: p.translations?.[code]?.title || '', description: e.target.value } } }))} data-testid={`input-addon-description-${code}`}/></label>)}</div></div>
          </div>
          <details className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold text-foreground" data-testid="summary-addon-advanced">Advanced · fallback copy & selection</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>Default description<textarea rows={2} maxLength={1000} className={`${field} resize-y`} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-addon-description"/><small className="mt-1 block font-normal">Used when the selected language has no description.</small></label>
            <label className={label}>Selection rule<select className={field} value={form.selectionRule} onChange={e => setForm(p => ({ ...p, selectionRule: e.target.value as ManualSwapAddonInput['selectionRule'] }))} data-testid="select-addon-selection-rule"><option value="multiple">Multiple allowed</option><option value="one">One per group</option><option value="none">Display only</option></select></label>
            <label className={label}>Presentation group<input className={field} maxLength={100} value={form.presentation?.group || ''} onChange={e => setForm(p => ({ ...p, presentation: { group: e.target.value } }))} data-testid="input-addon-presentation"/></label>
          </div></details>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4"><button type="submit" disabled={create.isPending || update.isPending} className="button button-primary" data-testid="button-save-addon">{create.isPending || update.isPending ? 'Saving…' : 'Save option'}</button><button type="button" onClick={() => setEditing(null)} className="button" data-testid="button-cancel-addon">Cancel</button></div>
        </form>}
      </section>}
      <AdminSwapAddonPreview savedOptions={list.data?.items || []} draft={editing ? form : undefined} editingId={editing && editing !== 'new' ? editing.id : undefined} feeConfig={fee.data && !fee.isLoading && !fee.isError ? { enabled: feeForm.enabled, percentage: feeForm.enabled ? feeForm.percentage || null : null, fixedAmount: feeForm.enabled ? feeForm.fixedAmount || null : null, fixedCurrency: feeForm.fixedCurrency } : undefined} isLoading={list.isLoading} isError={list.isError} onRetry={() => list.refetch()} exchangeAmount={1000}/>
      <details className="panel group p-5"><summary className="cursor-pointer list-none text-sm font-semibold text-foreground" data-testid="summary-exchange-fee-advanced"><span className="inline-flex items-center gap-2">Advanced · Exchange fee <ChevronDown size={15} className="transition-transform group-open:rotate-180"/></span><span className="mt-1 block text-xs font-normal text-muted-foreground">Additional to existing route pricing. The server calculates the final quote.</span></summary><div className="mt-5">
        {fee.isLoading ? <div className="skeleton h-28 rounded-lg"/> : fee.isError ? <div role="alert">Could not load exchange fee. <button type="button" onClick={() => fee.refetch()} className="text-primary underline" data-testid="button-retry-exchange-fee">Retry</button></div> : <form className="grid gap-4 sm:grid-cols-3" onSubmit={async e => { e.preventDefault(); setMessage(''); try { await saveFee.mutateAsync({ data: { enabled: feeForm.enabled, percentage: feeForm.percentage || null, fixedAmount: feeForm.fixedAmount || null, fixedCurrency: feeForm.fixedCurrency } }); await qc.invalidateQueries({ queryKey: getGetManualSwapFeeConfigQueryKey() }); notifyAdminAction('success', 'Manual Swap exchange fee saved successfully.'); } catch (error) { notifyAdminAction('error', error instanceof Error ? error.message : 'Could not save exchange fee.'); } }}>
          <label className="sm:col-span-3 flex items-center gap-2 font-semibold text-sm"><input type="checkbox" checked={feeForm.enabled} onChange={e => setFeeForm(p => ({ ...p, enabled: e.target.checked }))} data-testid="checkbox-exchange-fee-enabled"/> Enabled</label>
          <label className="text-sm font-semibold">Percentage (%)<input inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={feeForm.percentage} onChange={e => setFeeForm(p => ({ ...p, percentage: e.target.value }))} data-testid="input-exchange-fee-percentage"/></label>
          <label className="text-sm font-semibold">Fixed amount<input inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={feeForm.fixedAmount} onChange={e => setFeeForm(p => ({ ...p, fixedAmount: e.target.value }))} data-testid="input-exchange-fee-fixed"/></label>
          <label className="text-sm font-semibold">Fixed currency<input required pattern="[A-Z0-9]{2,15}" className={field} value={feeForm.fixedCurrency} onChange={e => setFeeForm(p => ({ ...p, fixedCurrency: e.target.value.toUpperCase() }))} data-testid="input-exchange-fee-currency"/></label>
          <button type="submit" disabled={saveFee.isPending} className="button button-primary w-fit" data-testid="button-save-exchange-fee">Save exchange fee</button>
        </form>}
       </div></details>
    </div>
  </AdminShell>;
}