import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetExchangeConfigQueryKey,
  getGetPaymentMethodsQueryKey,
  useApplyBulkDeletePaymentMethodFields,
  usePreviewBulkDeletePaymentMethodFields,
} from '@workspace/api-client-react';
import type { PaymentMethod } from '@workspace/api-client-react';
import { ArrowLeft, CircleAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorText } from '../App';
import { notifyAdminAction } from './admin-action-toast';

type Preview = {
  targets: { id: string; name: string; updatedAt: string; removed: string[] }[];
  affectedMethods: number;
  removedFields: number;
  reviewToken: string;
};

export function AdminPaymentMethodBulkDeleteDialog({ methodIds, methods, onClose, onApplied }: {
  methodIds: string[];
  methods: PaymentMethod[];
  onClose: () => void;
  onApplied: (result: { affectedMethods: number; removedFields: number }) => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [review, setReview] = useState<{ value: Preview; signature: string } | null>(null);
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  const latestSignature = useRef('');
  const queryClient = useQueryClient();
  const previewMutation = usePreviewBulkDeletePaymentMethodFields();
  const applyMutation = useApplyBulkDeletePaymentMethodFields();

  const ids = [...new Set(methodIds)].sort();
  const selectedMethods = ids.map(id => methods.find(method => method.id === id)).filter((method): method is PaymentMethod => !!method);
  const fieldMap = new Map<string, { labels: Set<string>; methodIds: Set<string> }>();
  for (const method of selectedMethods) {
    for (const field of method.fieldDefinitions || []) {
      if (!field.key) continue;
      const entry = fieldMap.get(field.key) || { labels: new Set<string>(), methodIds: new Set<string>() };
      entry.labels.add(field.label?.trim() || field.key);
      entry.methodIds.add(method.id);
      fieldMap.set(field.key, entry);
    }
  }
  const fields = [...fieldMap.entries()].map(([key, entry]) => ({
    key,
    labels: [...entry.labels],
    count: entry.methodIds.size,
  })).sort((a, b) => a.key.localeCompare(b.key));
  const keys = [...new Set(selectedKeys)].filter(key => fieldMap.has(key)).sort();
  // A preview belongs to the exact selection and local snapshot it was prepared against.
  const signature = JSON.stringify({
    ids,
    keys,
    methods: selectedMethods.map(method => [method.id, method.updatedAt, method.fieldDefinitions?.map(field => [field.key, field.label])]),
  });
  latestSignature.current = signature;
  const currentReview = review?.signature === signature ? review.value : null;
  const selectionChanged = step === 'review' && !currentReview;
  const selectedSet = new Set(keys);
  const previewValid = !!currentReview && !!currentReview.reviewToken &&
    currentReview.targets.length === ids.length &&
    new Set(currentReview.targets.map(target => target.id)).size === ids.length &&
    currentReview.targets.every(target => ids.includes(target.id) && !!target.updatedAt &&
      target.removed.every(key => selectedSet.has(key)) &&
      new Set(target.removed).size === target.removed.length) &&
    currentReview.affectedMethods === currentReview.targets.filter(target => target.removed.length > 0).length &&
    currentReview.removedFields === currentReview.targets.reduce((sum, target) => sum + target.removed.length, 0);
  const canApply = previewValid && currentReview.removedFields > 0 && confirmed && !pending;

  const changeKey = (key: string, checked: boolean) => {
    if (pending) return;
    setSelectedKeys(previous => checked ? [...new Set([...previous, key])] : previous.filter(item => item !== key));
    setReview(null);
    setConfirmed(false);
    setError('');
    setStep('select');
  };
  const previewChanges = async () => {
    if (pending || !keys.length || !ids.length || ids.length > 100 || selectedMethods.length !== ids.length) return;
    const request = ++requestId.current;
    const snapshot = signature;
    setPending(true);
    setReview(null);
    setConfirmed(false);
    setError('');
    try {
      const value = await previewMutation.mutateAsync({ data: { methodIds: ids, fieldKeys: keys } });
      if (request !== requestId.current) return;
      if (latestSignature.current !== snapshot) {
        setError('The selection changed while preparing the review. Review the current selection again.');
        return;
      }
      setReview({ value, signature: snapshot });
      setStep('review');
    } catch (cause) {
      if (request === requestId.current) setError(apiErrorText(cause, 'Could not prepare the review. Try again.'));
    } finally {
      if (request === requestId.current) setPending(false);
    }
  };
  const apply = async () => {
    if (!canApply || !currentReview || latestSignature.current !== signature) return;
    setPending(true);
    setError('');
    try {
      const result = await applyMutation.mutateAsync({
        data: {
          methodIds: ids,
          fieldKeys: keys,
          reviewToken: currentReview.reviewToken,
          expectedUpdatedAtById: Object.fromEntries(currentReview.targets.map(target => [target.id, target.updatedAt])),
        },
      });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: getGetPaymentMethodsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
      ]);
      onApplied(result);
    } catch (cause) {
      setReview(null);
      setConfirmed(false);
      setStep('select');
      const message = apiErrorText(cause, 'Could not delete fields.');
      notifyAdminAction('error', message);
      setError(`${message} The review can no longer be used. Prepare a new review before trying again.`);
    } finally {
      setPending(false);
    }
  };
  const dismiss = () => {
    if (pending) return;
    ++requestId.current;
    onClose();
  };

  return <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
    <DialogContent className="flex w-[calc(100vw-1.5rem)] max-w-3xl max-h-[min(92dvh,860px)] flex-col gap-0 overflow-hidden p-0" data-testid="dialog-bulk-delete-method-fields">
      <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-5 py-5 pr-12 sm:px-7">
        <DialogTitle className="flex items-center gap-2 text-foreground"><Trash2 size={18} className="text-destructive" /> Bulk Delete Fields</DialogTitle>
        <DialogDescription>Remove field definitions by exact key across {ids.length} selected payment method{ids.length === 1 ? '' : 's'}. Methods and unselected fields stay in place; remaining field order is preserved.</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-muted-foreground" aria-label="Progress">
          <span className={step === 'select' ? 'text-foreground' : ''}>01 Select fields</span><span aria-hidden="true">/</span>
          <span className={step === 'review' ? 'text-foreground' : ''}>02 Review & confirm</span>
        </div>
        {error && <div role="alert" data-testid="status-bulk-delete-fields-error" className="mb-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert size={17} className="shrink-0" /> <span>{error}</span></div>}
        {step === 'select' ? <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div><h3 className="text-xs font-extrabold tracking-widest text-foreground">AVAILABLE FIELD KEYS</h3><p className="mt-1 text-xs text-muted-foreground">A key is selected once, even when its display label differs between methods.</p></div>
            <span className="text-xs font-medium text-muted-foreground" data-testid="text-bulk-delete-key-count">{keys.length} of {fields.length} selected</span>
          </div>
          {selectedMethods.length !== ids.length ? <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Some selected methods are not loaded. Refresh the payment methods list before continuing.</div> :
            fields.length === 0 ? <div data-testid="empty-bulk-delete-fields" className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center"><ShieldCheck size={22} className="mx-auto mb-2 text-muted-foreground" /><p className="font-semibold">No fields to remove</p><p className="mt-1 text-sm text-muted-foreground">The selected methods have no field definitions.</p></div> :
              <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="list-bulk-delete-fields">
                {fields.map(field => <label key={field.key} className="flex min-h-16 cursor-pointer items-center gap-3 border-b border-border/70 px-3 py-3 last:border-0 hover:bg-muted/30 focus-within:bg-muted/30 sm:px-4">
                  <input type="checkbox" checked={selectedSet.has(field.key)} onChange={event => changeKey(field.key, event.target.checked)} disabled={pending} className="h-4 w-4 shrink-0 accent-[hsl(var(--destructive))]" data-testid={`input-bulk-delete-field-${field.key}`} />
                  <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-foreground">{field.labels.join(' · ')}</span><code className="block break-all text-[11px] text-muted-foreground">{field.key}</code>{field.labels.length > 1 && <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">Different labels share this key across methods</span>}</span>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground" data-testid={`text-bulk-delete-field-count-${field.key}`}>{field.count} {field.count === 1 ? 'method' : 'methods'}</span>
                </label>)}
              </div>}
          <p className="mt-4 text-xs text-muted-foreground">This action removes field definitions, not payment methods. It cannot be undone from this dialog.</p>
        </> : <>
          {selectionChanged && <div role="alert" data-testid="status-bulk-delete-stale-review" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">The selection or method data changed. This review is stale; return and prepare a new one.</div>}
          {currentReview && <>
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground"><CircleAlert size={17} className="text-destructive" /> Review the exact removals</div>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="text-bulk-delete-preview-counts">{currentReview.removedFields} field{currentReview.removedFields === 1 ? '' : 's'} across {currentReview.affectedMethods} payment method{currentReview.affectedMethods === 1 ? '' : 's'} will be removed. Counts are field occurrences, not unique keys.</p>
            </div>
            {!previewValid && <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">The server review is incomplete or inconsistent. Return and prepare a new review.</div>}
            {currentReview.removedFields === 0 && <div role="status" className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">Nothing to delete. No selected field keys are present in the latest server review.</div>}
            <h3 className="mb-3 text-xs font-extrabold tracking-widest text-foreground">REMOVALS BY FIELD KEY</h3>
            <div className="space-y-3">
              {keys.map(key => {
                const field = fieldMap.get(key);
                const affected = currentReview.targets.filter(target => target.removed.includes(key));
                return <div key={key} className="rounded-xl border border-border bg-card p-4" data-testid={`row-bulk-delete-preview-${key}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><strong className="block break-words text-sm">{field ? [...field.labels].join(' · ') : key}</strong><code className="break-all text-[11px] text-muted-foreground">{key}</code></div><span className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive">{affected.length} {affected.length === 1 ? 'method' : 'methods'}</span></div>
                  <p className="mt-2 text-xs text-muted-foreground">{affected.length ? 'Affected methods in the server review:' : 'No methods have this key in the server review.'}</p>
                  {affected.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Methods losing ${key}`}>{affected.map(target => <li key={target.id} className="max-w-full break-words rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-foreground" data-testid={`text-bulk-delete-target-${key}-${target.id}`}>{target.name} <code className="ml-1 text-[10px] text-muted-foreground">{target.id}</code></li>)}</ul>}
                </div>;
              })}
            </div>
            <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm ${confirmed ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/20'}`}>
              <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!previewValid || currentReview.removedFields === 0 || pending} className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--destructive))]" data-testid="input-confirm-bulk-delete-fields" />
              <span><strong className="block">I have checked the affected methods and fields.</strong><span className="text-xs text-muted-foreground">I understand these field definitions will be removed from the methods listed above.</span></span>
            </label>
          </>}
        </>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-4 sm:px-7">
        <button type="button" className="payment-method-add-field" onClick={dismiss} disabled={pending} data-testid="button-cancel-bulk-delete-fields">Cancel</button>
        {step === 'review' && <button type="button" className="payment-method-add-field" onClick={() => { setReview(null); setConfirmed(false); setStep('select'); setError(''); }} disabled={pending} data-testid="button-back-bulk-delete-fields"><ArrowLeft size={14} /> Back to selection</button>}
        {step === 'select' ? <button type="button" className="payment-method-add-field" onClick={previewChanges} disabled={pending || !keys.length || !ids.length || ids.length > 100 || selectedMethods.length !== ids.length} data-testid="button-preview-bulk-delete-fields">{pending ? 'Preparing review…' : 'Review removals'}</button> :
          <button type="button" className="payment-method-add-field !border-destructive/50 !bg-destructive !text-destructive-foreground disabled:opacity-50" onClick={apply} disabled={!canApply} data-testid="button-apply-bulk-delete-fields"><Trash2 size={14} /> {pending ? 'Deleting…' : 'Delete Selected Fields'}</button>}
      </div>
    </DialogContent>
  </Dialog>;
}