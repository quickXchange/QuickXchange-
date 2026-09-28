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

const blank: ManualSwapAddonInput = { name: '', key: '', description: '', fixedAmount: '0', feeCurrency: 'USD', enabled: true, displayOrder: 0, selectionRule: 'multiple', presentation: { group: '' } };
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
  const [form, setForm] = useState<ManualSwapAddonInput>(blank);
  const [keyEdited, setKeyEdited] = useState(false);
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
    setForm(item ? { name: item.name, key: item.key, description: item.description, fixedAmount: trimFeeDecimal(item.fixedAmount), feeCurrency: item.feeCurrency, enabled: item.enabled, displayOrder: item.displayOrder, selectionRule: item.selectionRule, presentation: { group: item.presentation.group } } : { ...blank, presentation: { group: '' } });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!validAddonKey.test(form.key)) {
      setMessage('Enter a key starting with a lowercase letter or number, using only lowercase letters, numbers, hyphens, and underscores (up to 100 characters).');
      return;
    }
    try {
      if (editing && editing !== 'new') await update.mutateAsync({ id: editing.id, data: form });
      else await create.mutateAsync({ data: form });
      await refresh();
      setEditing(null);
      setMessage('Option saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save option.'); }
  };
  const deleteItem = async (item: ManualSwapAddon) => {
    if (!window.confirm(`Delete ${item.name}? Historical orders will retain their saved fees.`)) return;
    setMessage('');
    try { await remove.mutateAsync({ id: item.id }); await refresh(); setMessage('Option deleted.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not disable option.'); }
  };
  return <AdminShell title="Swap Order Add-ons" eyebrow="PRICING / SWAP" subtitle="Optional choices and additional exchange fees for Manual Swap only." requiredPermission="pricing.view">
    <div className="space-y-6">
      {message && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm" data-testid="status-swap-addons">{message}</p>}
      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap justify-between gap-3 items-center"><div><h2 className="font-bold text-lg">Optional add-ons</h2><p className="text-sm text-muted-foreground">Customers choose from enabled options before confirming a quote.</p></div><button type="button" onClick={() => open()} className="button button-primary inline-flex items-center gap-2" data-testid="button-add-swap-option"><Plus size={16}/> Add option</button></div>
        {list.isLoading ? <div className="skeleton h-28 rounded-lg"/> : list.isError ? <div role="alert">Could not load options. <button type="button" onClick={() => list.refetch()} className="text-primary underline" data-testid="button-retry-swap-options">Retry</button></div> :
          !list.data?.items.length ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No add-ons yet. Add an option to make it available on Swap.</p> :
           <div className="overflow-x-auto"><table className="w-full min-w-[570px] text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-3">Name</th><th className="p-3">Key</th><th className="p-3">Order</th><th className="p-3">Status</th><th className="p-3">Edit</th><th className="p-3">Delete</th></tr></thead><tbody>{list.data.items.map(item => <tr key={item.id} className="border-b border-border/60"><td className="p-3 font-semibold">{item.name}<small className="block font-normal text-muted-foreground">{trimFeeDecimal(item.fixedAmount)} {item.feeCurrency}</small></td><td className="p-3 font-mono">{item.key}</td><td className="p-3 font-mono">{item.displayOrder}</td><td className="p-3">{item.enabled ? 'Enabled' : 'Disabled'}</td><td className="p-3"><button type="button" className="text-primary inline-flex items-center gap-1" onClick={() => open(item)} data-testid={`button-edit-addon-${item.key}`}><Pencil size={14}/> Edit</button></td><td className="p-3"><button type="button" className="text-destructive inline-flex items-center gap-1 disabled:opacity-40" disabled={remove.isPending} onClick={() => deleteItem(item)} data-testid={`button-delete-addon-${item.key}`}><Trash2 size={14}/> Delete</button></td></tr>)}</tbody></table></div>}
      </section>
      <div className={editing ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] xl:items-start' : ''}>
      {editing && <section className="panel p-5 min-w-0"><h2 className="font-bold text-lg mb-4">{editing === 'new' ? 'Add option' : `Edit ${editing.name}`}</h2><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Name<input required maxLength={120} className={field} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value, key: editing === 'new' && !keyEdited ? addonKeyFromText(e.target.value) : p.key }))} data-testid="input-addon-name"/></label>
        <label className="text-sm font-semibold">Key<input required pattern="[a-z0-9](?:[a-z0-9_]|-)*" maxLength={100} className={field} value={form.key} onChange={e => { setKeyEdited(true); setForm(p => ({ ...p, key: addonKeyFromText(e.target.value) })); }} autoCapitalize="off" spellCheck={false} data-testid="input-addon-key"/><small className="block font-normal text-muted-foreground">Generated from the name; you can edit it. Use lowercase letters, numbers, hyphens, or underscores.</small></label>
        <label className="text-sm font-semibold sm:col-span-2">Description<textarea maxLength={1000} className={field} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-addon-description"/></label>
        <label className="text-sm font-semibold">Price<input required inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" className={field} value={form.fixedAmount} onChange={e => setForm(p => ({ ...p, fixedAmount: e.target.value }))} data-testid="input-addon-price"/></label>
        <label className="text-sm font-semibold">Currency<input required pattern="[A-Z0-9]{2,15}" className={field} value={form.feeCurrency} onChange={e => setForm(p => ({ ...p, feeCurrency: e.target.value.toUpperCase() }))} data-testid="input-addon-currency"/></label>
        <label className="text-sm font-semibold">Display order<input required type="number" min="0" step="1" className={field} value={form.displayOrder ?? 0} onChange={e => setForm(p => ({ ...p, displayOrder: e.target.value === '' ? undefined : Number(e.target.value) }))} data-testid="input-addon-display-order"/></label>
        <label className="text-sm font-semibold">Selection rule<select className={field} value={form.selectionRule} onChange={e => setForm(p => ({ ...p, selectionRule: e.target.value as ManualSwapAddonInput['selectionRule'] }))} data-testid="select-addon-selection-rule"><option value="multiple">Multiple allowed</option><option value="one">One per group</option><option value="none">Display only</option></select></label>
        <label className="text-sm font-semibold">Presentation group<input className={field} maxLength={100} value={form.presentation?.group || ''} onChange={e => setForm(p => ({ ...p, presentation: { group: e.target.value } }))} data-testid="input-addon-presentation"/></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} data-testid="checkbox-addon-enabled"/> Enabled</label>
        <div className="sm:col-span-2 flex gap-3"><button type="submit" disabled={create.isPending || update.isPending} className="button button-primary" data-testid="button-save-addon">Save option</button><button type="button" onClick={() => setEditing(null)} className="button" data-testid="button-cancel-addon">Cancel</button></div>
      </form></section>}
      <AdminSwapAddonPreview savedOptions={list.data?.items || []} draft={editing ? form : undefined} editingId={editing && editing !== 'new' ? editing.id : undefined} feeConfig={fee.data && !fee.isLoading && !fee.isError ? { enabled: feeForm.enabled, percentage: feeForm.enabled ? feeForm.percentage || null : null, fixedAmount: feeForm.enabled ? feeForm.fixedAmount || null : null, fixedCurrency: feeForm.fixedCurrency } : undefined} isLoading={list.isLoading} isError={list.isError} onRetry={() => list.refetch()} exchangeAmount={1000}/>
      </div>
      <section className="panel p-5 space-y-4"><div><h2 className="font-bold text-lg">Exchange Fee</h2><p className="text-sm text-muted-foreground">Additional to existing route pricing. The server calculates and displays the final quote.</p></div>
        {fee.isLoading ? <div className="skeleton h-28 rounded-lg"/> : fee.isError ? <div role="alert">Could not load exchange fee. <button type="button" onClick={() => fee.refetch()} className="text-primary underline" data-testid="button-retry-exchange-fee">Retry</button></div> : <form className="grid gap-4 sm:grid-cols-3" onSubmit={async e => { e.preventDefault(); setMessage(''); try { await saveFee.mutateAsync({ data: { enabled: feeForm.enabled, percentage: feeForm.percentage || null, fixedAmount: feeForm.fixedAmount || null, fixedCurrency: feeForm.fixedCurrency } }); await qc.invalidateQueries({ queryKey: getGetManualSwapFeeConfigQueryKey() }); setMessage('Exchange fee saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save exchange fee.'); } }}>
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