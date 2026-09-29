import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
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
const field = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

export function AdminSwapAddonsPage() {
  const qc = useQueryClient();
  const list = useListAdminManualSwapAddons();
  const fee = useGetManualSwapFeeConfig();
  const create = useCreateManualSwapAddon();
  const update = useUpdateManualSwapAddon();
  const remove = useDeleteManualSwapAddon();
  const saveFee = useUpdateManualSwapFeeConfig();
  const [editing, setEditing] = useState<ManualSwapAddon | 'new' | null>(null);
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
    try { await remove.mutateAsync({ id: item.id }); await refresh(); notifyAdminAction('success', 'Swap add-on deleted successfully.'); }
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
    <div className="space-y-6">
      {message && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm" data-testid="status-swap-addons">{message}</p>}
      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap justify-between gap-3 items-center"><div><h2 className="font-bold text-lg">Optional add-ons</h2><p className="text-sm text-muted-foreground">Customers choose from enabled options before confirming a quote.</p></div><button type="button" onClick={() => open()} className="button button-primary inline-flex items-center gap-2" data-testid="button-add-swap-option"><Plus size={16}/> Add option</button></div>
        {list.isLoading ? <div className="skeleton h-28 rounded-lg"/> : list.isError ? <div role="alert">Could not load options. <button type="button" onClick={() => list.refetch()} className="text-primary underline" data-testid="button-retry-swap-options">Retry</button></div> :
          !list.data?.items.length ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No add-ons yet. Add an option to make it available on Swap.</p> :
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-3">Display Name</th><th className="p-3">Key</th><th className="p-3">Fee</th><th className="p-3">Type</th><th className="p-3">Position</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{list.data.items.map(item => {
              const record = item as AddonRecord;
              const percentage = record.feeType === 'percentage';
              return <tr key={item.id} className="border-b border-border/60" data-testid={`row-swap-addon-${item.key}`}>
                <td className="p-3 font-semibold" data-testid={`text-addon-name-${item.key}`}>{item.name}</td>
                <td className="p-3 font-mono text-muted-foreground">{item.key}</td>
                <td className="p-3 whitespace-nowrap font-mono" data-testid={`text-addon-fee-${item.key}`}>{percentage ? `${record.percentage == null ? '—' : trimFeeDecimal(record.percentage)}%` : `${trimFeeDecimal(item.fixedAmount)} ${item.feeCurrency}`}</td>
                <td className="p-3">{percentage ? 'Percentage' : item.feeCurrency === 'USD' ? 'Fixed USD' : `Legacy fixed ${item.feeCurrency}`}</td>
                <td className="p-3 font-mono">{item.displayOrder}</td>
                <td className="p-3"><button type="button" role="switch" aria-checked={item.enabled} aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`} disabled={Boolean(togglingId) || update.isPending} onClick={() => toggleItem(item)} className="inline-flex items-center gap-2 disabled:opacity-40" data-testid={`switch-addon-enabled-${item.key}`}><span aria-hidden="true" className={`relative inline-block h-5 w-9 rounded-full transition-colors ${item.enabled ? 'bg-primary' : 'bg-muted-foreground/35'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${item.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`}/></span><span>{item.enabled ? 'Enabled' : 'Disabled'}</span></button></td>
                <td className="p-3"><div className="flex items-center gap-4"><button type="button" className="text-primary inline-flex items-center gap-1" onClick={() => open(item)} data-testid={`button-edit-addon-${item.key}`}><Pencil size={14}/> Edit</button><button type="button" className="text-destructive inline-flex items-center gap-1 disabled:opacity-40" disabled={remove.isPending || Boolean(togglingId)} onClick={() => deleteItem(item)} data-testid={`button-delete-addon-${item.key}`}><Trash2 size={14}/> Delete</button></div></td>
              </tr>;
            })}</tbody></table></div>}
      </section>
      <div className={editing ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] xl:items-start' : ''}>
       {editing && <section className="panel p-5 min-w-0"><div className="mb-5"><h2 className="font-bold text-lg">{editing === 'new' ? 'Add option' : `Edit ${editing.name}`}</h2><p className="text-sm text-muted-foreground">Configure the fee and the copy customers see at checkout.</p></div><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
         <label className="text-sm font-semibold">Display Name<input required maxLength={120} className={field} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value, key: editing === 'new' && !keyEdited ? addonKeyFromText(e.target.value) : p.key }))} data-testid="input-addon-name"/></label>
        <label className="text-sm font-semibold">Key<input required pattern="[a-z0-9](?:[a-z0-9_]|-)*" maxLength={100} className={field} value={form.key} onChange={e => { setKeyEdited(true); setForm(p => ({ ...p, key: addonKeyFromText(e.target.value) })); }} autoCapitalize="off" spellCheck={false} data-testid="input-addon-key"/><small className="block font-normal text-muted-foreground">Generated from the name; you can edit it. Use lowercase letters, numbers, hyphens, or underscores.</small></label>
        <label className="text-sm font-semibold sm:col-span-2">Description<textarea maxLength={1000} className={field} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-addon-description"/></label>
         <label className="text-sm font-semibold">Fee type<select className={field} value={form.feeType} onChange={e => setForm(p => ({ ...p, feeType: e.target.value as AddonDraft['feeType'], fixedAmount: e.target.value === 'percentage' ? '0' : p.feeType === 'percentage' ? '' : p.fixedAmount, percentage: e.target.value === 'fixed' ? null : p.percentage ?? '', feeCurrency: 'USD' }))} data-testid="select-addon-fee-type"><option value="fixed">{legacyFixed ? `Fixed (legacy ${form.feeCurrency})` : 'Fixed USD'}</option><option value="percentage">Percentage</option></select></label>
         {form.feeType === 'fixed' ? <label className="text-sm font-semibold">Fixed amount ({form.feeCurrency})<input required readOnly={Boolean(legacyFixed)} inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={form.fixedAmount} onChange={e => setForm(p => ({ ...p, fixedAmount: e.target.value }))} data-testid="input-addon-price"/><small className="block font-normal text-muted-foreground">{legacyFixed ? `Existing ${form.feeCurrency} fee is locked; other changes leave its price untouched.` : 'New and converted fixed fees are charged in USD.'}</small></label> :
           <label className="text-sm font-semibold">Percentage (%)<input required inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={form.percentage ?? ''} onChange={e => setForm(p => ({ ...p, percentage: e.target.value }))} data-testid="input-addon-percentage"/><small className="block font-normal text-muted-foreground">Enter 1 for 1% of the exchange amount.</small></label>}
         {legacyFixed && <div className="sm:col-span-2 rounded-xl border border-border bg-muted/40 p-4 text-sm"><p className="font-semibold">Legacy {form.feeCurrency} fee</p><p className="mt-1 text-muted-foreground">Saving status, copy, or position keeps {trimFeeDecimal(form.fixedAmount)} {form.feeCurrency}. To change the fixed fee, explicitly convert it to USD and enter a new price.</p><button type="button" className="button mt-3" onClick={() => setForm(p => ({ ...p, feeCurrency: 'USD', fixedAmount: '' }))} data-testid="button-convert-addon-usd">Convert to USD</button></div>}
         <label className="text-sm font-semibold">Position<input required type="number" min="0" step="1" className={field} value={form.displayOrder ?? 0} onChange={e => setForm(p => ({ ...p, displayOrder: e.target.value === '' ? undefined : Number(e.target.value) }))} data-testid="input-addon-display-order"/></label>
        <label className="text-sm font-semibold">Selection rule<select className={field} value={form.selectionRule} onChange={e => setForm(p => ({ ...p, selectionRule: e.target.value as ManualSwapAddonInput['selectionRule'] }))} data-testid="select-addon-selection-rule"><option value="multiple">Multiple allowed</option><option value="one">One per group</option><option value="none">Display only</option></select></label>
        <label className="text-sm font-semibold">Presentation group<input className={field} maxLength={100} value={form.presentation?.group || ''} onChange={e => setForm(p => ({ ...p, presentation: { group: e.target.value } }))} data-testid="input-addon-presentation"/></label>
         <div className="sm:col-span-2 border-t border-border pt-4"><h3 className="font-semibold">Customer translations</h3><p className="text-sm text-muted-foreground">Optional localized title and description. Leave a language empty to use the default copy above.</p></div>
         {locales.map(({ code, label }) => <fieldset key={code} className="sm:col-span-2 grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
           <legend className="px-1 text-sm font-semibold">{label} <span className="font-mono text-xs text-muted-foreground">/ {code.toUpperCase()}</span></legend>
           <label className="text-sm font-semibold">Title<input maxLength={120} dir={code === 'ar' ? 'rtl' : undefined} className={field} value={form.translations?.[code]?.title || ''} onChange={e => setForm(p => ({ ...p, translations: { ...p.translations, [code]: { title: e.target.value, description: p.translations?.[code]?.description || '' } } }))} data-testid={`input-addon-title-${code}`}/></label>
           <label className="text-sm font-semibold">Description<textarea rows={2} maxLength={1000} dir={code === 'ar' ? 'rtl' : undefined} className={field} value={form.translations?.[code]?.description || ''} onChange={e => setForm(p => ({ ...p, translations: { ...p.translations, [code]: { title: p.translations?.[code]?.title || '', description: e.target.value } } }))} data-testid={`input-addon-description-${code}`}/></label>
         </fieldset>)}
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} data-testid="checkbox-addon-enabled"/> Enabled</label>
        <div className="sm:col-span-2 flex gap-3"><button type="submit" disabled={create.isPending || update.isPending} className="button button-primary" data-testid="button-save-addon">Save option</button><button type="button" onClick={() => setEditing(null)} className="button" data-testid="button-cancel-addon">Cancel</button></div>
      </form></section>}
      <AdminSwapAddonPreview savedOptions={list.data?.items || []} draft={editing ? form : undefined} editingId={editing && editing !== 'new' ? editing.id : undefined} feeConfig={fee.data && !fee.isLoading && !fee.isError ? { enabled: feeForm.enabled, percentage: feeForm.enabled ? feeForm.percentage || null : null, fixedAmount: feeForm.enabled ? feeForm.fixedAmount || null : null, fixedCurrency: feeForm.fixedCurrency } : undefined} isLoading={list.isLoading} isError={list.isError} onRetry={() => list.refetch()} exchangeAmount={1000}/>
      </div>
      <section className="panel p-5 space-y-4"><div><h2 className="font-bold text-lg">Exchange Fee</h2><p className="text-sm text-muted-foreground">Additional to existing route pricing. The server calculates and displays the final quote.</p></div>
        {fee.isLoading ? <div className="skeleton h-28 rounded-lg"/> : fee.isError ? <div role="alert">Could not load exchange fee. <button type="button" onClick={() => fee.refetch()} className="text-primary underline" data-testid="button-retry-exchange-fee">Retry</button></div> : <form className="grid gap-4 sm:grid-cols-3" onSubmit={async e => { e.preventDefault(); setMessage(''); try { await saveFee.mutateAsync({ data: { enabled: feeForm.enabled, percentage: feeForm.percentage || null, fixedAmount: feeForm.fixedAmount || null, fixedCurrency: feeForm.fixedCurrency } }); await qc.invalidateQueries({ queryKey: getGetManualSwapFeeConfigQueryKey() }); notifyAdminAction('success', 'Manual Swap exchange fee saved successfully.'); } catch (error) { notifyAdminAction('error', error instanceof Error ? error.message : 'Could not save exchange fee.'); } }}>
          <label className="sm:col-span-3 flex items-center gap-2 font-semibold text-sm"><input type="checkbox" checked={feeForm.enabled} onChange={e => setFeeForm(p => ({ ...p, enabled: e.target.checked }))} data-testid="checkbox-exchange-fee-enabled"/> Enabled</label>
          <label className="text-sm font-semibold">Percentage (%)<input inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={feeForm.percentage} onChange={e => setFeeForm(p => ({ ...p, percentage: e.target.value }))} data-testid="input-exchange-fee-percentage"/></label>
          <label className="text-sm font-semibold">Fixed amount<input inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={feeForm.fixedAmount} onChange={e => setFeeForm(p => ({ ...p, fixedAmount: e.target.value }))} data-testid="input-exchange-fee-fixed"/></label>
          <label className="text-sm font-semibold">Fixed currency<input required pattern="[A-Z0-9]{2,15}" className={field} value={feeForm.fixedCurrency} onChange={e => setFeeForm(p => ({ ...p, fixedCurrency: e.target.value.toUpperCase() }))} data-testid="input-exchange-fee-currency"/></label>
          <button type="submit" disabled={saveFee.isPending} className="button button-primary w-fit" data-testid="button-save-exchange-fee">Save exchange fee</button>
        </form>}
      </section>
    </div>
  </AdminShell>;
}