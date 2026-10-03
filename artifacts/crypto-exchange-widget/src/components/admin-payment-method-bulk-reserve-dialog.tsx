import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminBestchangeQueryKey, getGetExchangeConfigQueryKey,
  getGetFiatCurrencyPaymentMethodsQueryKey, getGetPaymentMethodsQueryKey,
  useSetBulkPaymentMethodReserve,
  type FiatCurrency, type FiatCurrencyPaymentMethod, type PaymentMethod,
} from '@workspace/api-client-react';
import { Loader2, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorText } from '../App';
import { notifyAdminAction } from './admin-action-toast';

export function AdminPaymentMethodBulkReserveDialog({ methodIds, methods, currencies, attachments, onClose, onApplied }: {
  methodIds: string[];
  methods: PaymentMethod[];
  currencies: FiatCurrency[];
  attachments: FiatCurrencyPaymentMethod[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [reserve, setReserve] = useState('');
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const mutation = useSetBulkPaymentMethodReserve();
  const queryClient = useQueryClient();
  const selected = methods.filter(method => methodIds.includes(method.id));
  const targets = attachments.filter(row => methodIds.includes(row.paymentMethodId));
  const missing = selected.length !== methodIds.length || selected.some(method =>
    !targets.some(row => row.paymentMethodId === method.id));
  const fraction = (reserve.split('.')[1] ?? '').replace(/0+$/, '');
  const valid = /^\d{1,20}(?:\.\d{1,18})?$/.test(reserve) && targets.every(row => {
    const currency = currencies.find(item => item.id === row.fiatCurrencyId);
    return currency && fraction.length <= currency.precision;
  });
  const pending = applying || mutation.isPending;
  const dismiss = () => { if (!pending) onClose(); };
  const apply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || !valid || missing || !methodIds.length || methodIds.length > 1000) return;
    setApplying(true);
    setError('');
    try {
      const result = await mutation.mutateAsync({ data: {
        methodIds, reserve, expectedAttachmentIds: targets.map(row => row.id),
      } });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: getGetFiatCurrencyPaymentMethodsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetPaymentMethodsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetAdminBestchangeQueryKey() }),
      ]);
      notifyAdminAction('success', `Reserve updated for ${result.updatedMethods} payment method${result.updatedMethods === 1 ? '' : 's'} (${result.updatedReserves} currency reserves).`);
      onApplied();
    } catch (cause) {
      const message = apiErrorText(cause, 'Could not set reserves. No changes were applied.');
      setError(message);
      notifyAdminAction('error', message);
    } finally {
      setApplying(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
    <DialogContent className="flex w-[calc(100vw-1.5rem)] max-w-lg max-h-[90dvh] flex-col gap-0 overflow-hidden p-0" data-testid="dialog-bulk-set-reserve">
      <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-5 py-5 pr-12">
        <DialogTitle className="flex items-center gap-2"><Wallet size={19} /> Set Reserve</DialogTitle>
        <DialogDescription>{methodIds.length} selected Payment Method{methodIds.length === 1 ? '' : 's'}. Set the amount individually in each attached currency.</DialogDescription>
      </DialogHeader>
      <form onSubmit={apply} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-5">
          <label className="block">
            <span className="field-label">Reserve amount</span>
            <input autoFocus type="text" inputMode="decimal" required pattern="[0-9]{1,20}([.][0-9]{1,18})?" value={reserve}
              onChange={event => { setReserve(event.target.value); setError(''); }} disabled={pending}
              placeholder="e.g. 10000" className="mt-2 w-full" data-testid="input-bulk-reserve" />
          </label>
          <p className="text-xs text-muted-foreground">The amount is not combined or divided. Each currency receives the full amount. Set 0 to clear reserves and omit those destinations from BestChange. No other fields change.</p>
          {missing && <p role="alert" className="text-sm text-destructive">Every selected method needs a currency attached. Configure missing currencies before applying.</p>}
          {reserve && !valid && <p role="alert" className="text-sm text-destructive">Enter a nonnegative decimal supported by every selected currency. No commas or exponent notation.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="rounded-lg border border-border overflow-hidden">
            <h3 className="bg-muted/30 px-3 py-2 text-xs font-bold">SELECTED METHODS · PREVIEW</h3>
            <ul className="divide-y divide-border" data-testid="list-bulk-reserve-preview">
              {selected.map(method => <li key={method.id} className="px-3 py-3">
                <strong className="text-sm">{method.name}</strong>
                <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {targets.filter(row => row.paymentMethodId === method.id).map(row => {
                    const code = currencies.find(item => item.id === row.fiatCurrencyId)?.code ?? 'Unknown currency';
                    return <div key={row.id} className="flex flex-wrap justify-between gap-2">
                      <span>{code}</span><span>{row.reserve ?? '0'} → <strong className="text-foreground">{valid ? reserve : '—'} {code}</strong></span>
                    </div>;
                  })}
                  {!targets.some(row => row.paymentMethodId === method.id) && <span className="text-destructive">No currency attached</span>}
                </div>
              </li>)}
            </ul>
          </div>
        </div>
        <div className="shrink-0 flex justify-end gap-2 border-t border-border p-4">
          <button type="button" className="button button-secondary" disabled={pending} onClick={dismiss}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={pending || !valid || missing || methodIds.length === 0 || methodIds.length > 1000} data-testid="button-apply-bulk-reserve">
            {pending && <Loader2 size={15} className="animate-spin" />} {pending ? 'Applying…' : 'Apply Reserve'}
          </button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}