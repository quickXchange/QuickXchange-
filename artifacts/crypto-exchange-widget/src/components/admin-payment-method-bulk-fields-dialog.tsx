import { useRef, useState } from 'react';
import { useApplyBulkPaymentMethodFields, usePreviewBulkPaymentMethodFields, getGetPaymentMethodsQueryKey, getGetExchangeConfigQueryKey } from '@workspace/api-client-react';
import type { PaymentMethodBulkFieldsPreview, PaymentMethodFieldDefinition, PaymentMethod } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorText } from '../App';
import { notifyAdminAction } from './admin-action-toast';

type Field = PaymentMethodFieldDefinition;
const fieldTypes: Field['type'][] = ['short-text', 'long-text', 'integer', 'numeric', 'decimal', 'account-iban', 'account-number', 'account-name', 'bank-code', 'routing-number', 'country-code', 'postal-address', 'phone', 'email', 'date', 'select', 'wallet-address', 'memo-tag', 'private-image', 'text', 'number', 'textarea'];
const presets: { label: string; type: Field['type'] }[] = [
  { label: 'Name', type: 'account-name' },
  { label: 'IBAN', type: 'account-iban' },
  { label: 'Payment Description', type: 'long-text' },
  { label: 'Payment Reference', type: 'short-text' },
  { label: 'Custom Field', type: 'short-text' },
];
const keyFromLabel = (label: string) => label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 54);
const uniqueKey = (label: string, fields: Field[]) => {
  const base = keyFromLabel(label) || 'field';
  let key = base;
  let suffix = 2;
  while (fields.some(field => field.key === key)) key = `${base}_${suffix++}`;
  return key;
};

export function AdminPaymentMethodBulkFieldsDialog({ methodIds, methods, onClose, onApplied }: {
  methodIds: string[];
  methods: PaymentMethod[];
  onClose: () => void;
  onApplied: (result: { updated: number; skipped: number; failed: number }) => void;
}) {
  const [fields, setFields] = useState<Field[]>([]);
  const [changeExistingDirectionKeys, setChangeExistingDirectionKeys] = useState<string[]>([]);
  const [preset, setPreset] = useState('Name');
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [review, setReview] = useState<{ value: PaymentMethodBulkFieldsPreview; signature: string } | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  const latestSignature = useRef('');
  const queryClient = useQueryClient();
  const previewMutation = usePreviewBulkPaymentMethodFields();
  const applyMutation = useApplyBulkPaymentMethodFields();
  const selectedIds = [...methodIds].sort();
  const signature = JSON.stringify({ methodIds: selectedIds, fields, changeExistingDirectionKeys: [...changeExistingDirectionKeys].sort() });
  latestSignature.current = signature;
  const currentReview = review?.signature === signature ? review.value : null;
  // Server diff entries are keys, not labels. Prefer the method's own stored
  // label; only use the submitted label for an exact submitted-key match.
  const displayField = (methodId: string, key: string, action: 'added' | 'modified' | 'unchanged') => {
    const existing = methods.find(method => method.id === methodId)?.fieldDefinitions?.find(field => field.key === key);
    const submitted = fields.find(field => field.key === key);
    if (action === 'modified' && existing?.label && submitted?.label && existing.label !== submitted.label)
      return `${existing.label} → ${submitted.label} (${key})`;
    const label = action === 'added' ? submitted?.label : existing?.label || submitted?.label;
    return label && label !== key ? `${label} (${key})` : key;
  };
  const duplicate = fields.some((field, index) => fields.some((other, otherIndex) =>
    otherIndex !== index && (other.key === field.key ||
      other.label.trim().toLowerCase() === field.label.trim().toLowerCase())
  ));
  const invalid = !selectedIds.length || selectedIds.length > 100 || !fields.length || fields.length > 50 ||
    fields.some(field => !field.label.trim() || field.label.length > 100 || !/^[a-z][a-z0-9_]{0,63}$/.test(field.key) ||
      (field.requiredWhen && (!/^[a-z][a-z0-9_]{0,63}$/.test(field.requiredWhen.fieldKey) || !field.requiredWhen.equals)) ||
      (field.type === 'select' && (!field.options?.length || field.options.some(option => !option.value.trim() || !option.label.trim()) ||
        new Set(field.options.map(option => option.value)).size !== field.options.length)) ||
      (field.min !== undefined && field.max !== undefined && field.min > field.max) ||
      (field.pattern !== undefined && (() => { try { new RegExp(field.pattern); return false; } catch { return true; } })())) || duplicate;

  const change = (index: number, patch: Partial<Field>) => {
    if (patch.key !== undefined && patch.key !== fields[index]?.key) {
      setChangeExistingDirectionKeys(previous => previous.filter(key => key !== fields[index]?.key));
    }
    setFields(previous => previous.map((field, position) => position === index ? { ...field, ...patch } : field));
    setReview(null);
    setError('');
    setStep('edit');
  };
  const add = () => {
    const choice = presets.find(item => item.label === preset);
    const label = choice?.label === 'Custom Field' ? 'Custom Field' : choice?.label || preset;
    setFields(previous => [...previous, { key: uniqueKey(label, previous), label, type: choice?.type || 'short-text', direction: 'both', enabled: true, required: true }]);
    setReview(null);
    setError('');
  };
  const move = (index: number, offset: -1 | 1) => {
    setFields(previous => {
      const next = [...previous];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
    setReview(null);
    setStep('edit');
  };
  const preview = async () => {
    if (invalid || pending) return;
    const id = ++requestId.current;
    const snapshot = signature;
    setPending(true);
    setError('');
    setReview(null);
    try {
      const value = await previewMutation.mutateAsync({ data: { methodIds: selectedIds, fields, changeExistingDirectionKeys } });
      if (id === requestId.current && latestSignature.current === snapshot) {
        if (!value.reviewToken) setError('The server did not provide a review token. Refresh the preview before applying.');
        else {
          setReview({ value, signature: snapshot });
          setStep('review');
        }
      }
    } catch (cause) {
      if (id === requestId.current) setError(apiErrorText(cause, 'Could not preview changes. Check the fields and try again.'));
    } finally {
      if (id === requestId.current) setPending(false);
    }
  };
  const apply = async () => {
    if (!currentReview?.reviewToken || pending || currentReview.targets.length !== selectedIds.length ||
      currentReview.targets.some(target => !target.updatedAt || !selectedIds.includes(target.id))) return;
    setPending(true);
    setError('');
    try {
      const payload = {
        methodIds: selectedIds,
        fields,
        changeExistingDirectionKeys,
        expectedUpdatedAtById: Object.fromEntries(currentReview.targets.map(target => [target.id, target.updatedAt])),
        reviewToken: currentReview.reviewToken,
      };
      const result = await applyMutation.mutateAsync({ data: payload });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: getGetPaymentMethodsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
      ]);
      onApplied(result);
    } catch (cause) {
      setReview(null);
      setStep('edit');
      const message = apiErrorText(cause, 'Could not apply the changes.');
      notifyAdminAction('error', message);
      setError(`${message} This review is no longer valid. Review the current changes again before applying.`);
    } finally {
      setPending(false);
    }
  };
  const dismiss = () => {
    if (pending) return;
    ++requestId.current;
    onClose();
  };
  const inputClass = 'payment-method-field-name-input w-full';
  return <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
    <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[min(90dvh,900px)] overflow-y-auto p-0" data-testid="dialog-bulk-payment-fields">
      <DialogHeader className="border-b border-border bg-muted/20 px-5 py-5 pr-14 sm:px-7">
        <DialogTitle className="flex items-center gap-2"><Pencil size={18} /> Bulk Edit Fields</DialogTitle>
        <DialogDescription>Configure fields once for {selectedIds.length} selected payment method{selectedIds.length === 1 ? '' : 's'}. Other fields on each method are preserved.</DialogDescription>
      </DialogHeader>
      <div className="px-5 py-5 sm:px-7 space-y-5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-label="Progress">
          <span className={step === 'edit' ? 'text-foreground font-semibold' : ''}>01 Configure fields</span>
          <span aria-hidden="true">/</span>
          <span className={step === 'review' ? 'text-foreground font-semibold' : ''}>02 Review changes</span>
        </div>
        {error && <div role="alert" data-testid="status-bulk-fields-error" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex gap-2"><CircleAlert size={17} className="shrink-0" />{error}</div>}
        {step === 'edit' ? <>
          <section className="payment-method-field-section">
            <div className="payment-method-field-section-head flex-wrap gap-3">
              <div><h3>FIELDS TO APPLY</h3><p>Matched fields are updated; new fields are added. No unselected fields are removed.</p></div>
              <div className="flex flex-wrap gap-2 items-center">
                <select aria-label="Field preset" data-testid="select-bulk-field-preset" className={inputClass} value={preset} onChange={event => setPreset(event.target.value)}>
                  {presets.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
                </select>
                <button type="button" className="payment-method-add-field" onClick={add} disabled={pending || fields.length >= 50} data-testid="button-add-bulk-field"><Plus size={14} /> Add field</button>
              </div>
            </div>
            <div className="payment-method-field-list space-y-3">
              {fields.length === 0 && <div className="payment-method-field-empty">Add at least one field to begin. Start with a preset or make a custom field.</div>}
              {fields.map((field, index) => <div key={index} className="rounded-lg border border-border bg-background p-4 space-y-4" data-testid={`row-bulk-field-${index}`}>
                <div className="flex justify-between gap-3 items-center">
                  <strong className="text-sm">{index + 1}. {field.label || 'Untitled field'}</strong>
                  <div className="flex items-center gap-1">
                    <button type="button" className="payment-method-remove-field" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${field.label} up`} data-testid={`button-bulk-field-up-${index}`}><ArrowUp size={15} /></button>
                    <button type="button" className="payment-method-remove-field" disabled={index === fields.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${field.label} down`} data-testid={`button-bulk-field-down-${index}`}><ArrowDown size={15} /></button>
                    <button type="button" className="payment-method-remove-field" onClick={() => { setFields(previous => previous.filter((_, position) => position !== index)); setChangeExistingDirectionKeys(previous => previous.filter(key => key !== field.key)); setReview(null); }} aria-label={`Remove ${field.label}`} data-testid={`button-remove-bulk-field-${index}`}><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="payment-method-field-label"><span>Label</span><input className={inputClass} maxLength={100} value={field.label} onChange={event => change(index, { label: event.target.value })} data-testid={`input-bulk-field-label-${index}`} /></label>
                  <label className="payment-method-field-label"><span>Field key</span><input className={inputClass} maxLength={64} value={field.key} onChange={event => change(index, { key: event.target.value })} aria-describedby={`bulk-field-key-help-${index}`} data-testid={`input-bulk-field-key-${index}`} /><small id={`bulk-field-key-help-${index}`} className="text-muted-foreground">Keep an existing key to update its field; changing the label alone does not change the key.</small></label>
                  <label className="payment-method-field-label"><span>Placeholder</span><input className={inputClass} maxLength={200} value={field.placeholder || ''} onChange={event => change(index, { placeholder: event.target.value })} data-testid={`input-bulk-field-placeholder-${index}`} /></label>
                  <label className="payment-method-field-label"><span>Type</span><select className={inputClass} value={field.type} onChange={event => change(index, { type: event.target.value as Field['type'], options: event.target.value === 'select' ? [{ value: '', label: '' }] : undefined })} data-testid={`select-bulk-field-type-${index}`}>{fieldTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
                  <label className="payment-method-field-label"><span>Direction</span><select className={inputClass} value={field.direction || 'both'} onChange={event => change(index, { direction: event.target.value as Field['direction'] })} data-testid={`select-bulk-field-direction-${index}`}><option value="both">Both</option><option value="send">You Send</option><option value="receive">You Receive</option></select></label>
                  <label className="payment-method-required-toggle self-center"><input type="checkbox" checked={changeExistingDirectionKeys.includes(field.key)} onChange={event => { setChangeExistingDirectionKeys(previous => event.target.checked ? [...previous, field.key] : previous.filter(key => key !== field.key)); setReview(null); setStep('edit'); }} data-testid={`input-bulk-field-change-existing-direction-${index}`} /><span>Also change existing fields to this direction</span></label>
                  <label className="payment-method-field-label"><span>Validation pattern (regex)</span><input className={inputClass} maxLength={500} value={field.pattern || ''} onChange={event => change(index, { pattern: event.target.value || undefined })} placeholder="Optional" data-testid={`input-bulk-field-pattern-${index}`} /></label>
                  <label className="payment-method-field-label"><span>Help text</span><input className={inputClass} maxLength={500} value={field.help || ''} onChange={event => change(index, { help: event.target.value || undefined })} data-testid={`input-bulk-field-help-${index}`} /></label>
                  <label className="payment-method-field-label"><span>Min value</span><input className={inputClass} type="number" value={field.min ?? ''} onChange={event => change(index, { min: event.target.value === '' ? undefined : Number(event.target.value) })} data-testid={`input-bulk-field-min-${index}`} /></label>
                  <label className="payment-method-field-label"><span>Max value</span><input className={inputClass} type="number" value={field.max ?? ''} onChange={event => change(index, { max: event.target.value === '' ? undefined : Number(event.target.value) })} data-testid={`input-bulk-field-max-${index}`} /></label>
                  <label className="payment-method-field-label"><span>Required when field key</span><input className={inputClass} value={field.requiredWhen?.fieldKey || ''} placeholder="Optional field key" onChange={event => change(index, { requiredWhen: event.target.value ? { fieldKey: event.target.value, equals: field.requiredWhen?.equals || '' } : undefined })} data-testid={`input-bulk-field-required-when-key-${index}`} /></label>
                  {field.requiredWhen && <label className="payment-method-field-label"><span>Required when value equals</span><input className={inputClass} value={typeof field.requiredWhen.equals === 'string' ? field.requiredWhen.equals : field.requiredWhen.equals.join(', ')} onChange={event => change(index, { requiredWhen: { ...field.requiredWhen!, equals: event.target.value } })} data-testid={`input-bulk-field-required-when-value-${index}`} /></label>}
                </div>
                <p className="text-xs text-muted-foreground">By default, this direction applies only to new fields. Matched fields keep each payment method’s current direction.</p>
                {field.type === 'select' && <div className="space-y-2">
                  <span className="text-sm font-medium">Select options</span>
                  {(field.options || []).map((option, optionIndex) => <div key={optionIndex} className="flex flex-wrap gap-2">
                    <input aria-label={`Option ${optionIndex + 1} value`} className={`${inputClass} flex-1 min-w-28`} maxLength={200} placeholder="Value" value={option.value} onChange={event => change(index, { options: field.options?.map((item, position) => position === optionIndex ? { ...item, value: event.target.value } : item) })} data-testid={`input-bulk-option-value-${index}-${optionIndex}`} />
                    <input aria-label={`Option ${optionIndex + 1} label`} className={`${inputClass} flex-1 min-w-28`} maxLength={200} placeholder="Display label" value={option.label} onChange={event => change(index, { options: field.options?.map((item, position) => position === optionIndex ? { ...item, label: event.target.value } : item) })} data-testid={`input-bulk-option-label-${index}-${optionIndex}`} />
                    <button type="button" className="payment-method-remove-field" aria-label={`Remove option ${optionIndex + 1}`} onClick={() => change(index, { options: field.options?.filter((_, position) => position !== optionIndex) })} data-testid={`button-remove-bulk-option-${index}-${optionIndex}`}><Trash2 size={14} /></button>
                  </div>)}
                  <button type="button" className="payment-method-add-field" disabled={(field.options?.length || 0) >= 100} onClick={() => change(index, { options: [...field.options || [], { value: '', label: '' }] })} data-testid={`button-add-bulk-option-${index}`}>Add option</button>
                </div>}
                <div className="flex flex-wrap gap-5">
                  <label className="payment-method-required-toggle"><input type="checkbox" checked={field.enabled !== false} onChange={event => change(index, { enabled: event.target.checked })} data-testid={`input-bulk-field-enabled-${index}`} /><span>Enabled</span></label>
                  <label className="payment-method-required-toggle"><input type="checkbox" checked={field.required !== false} onChange={event => change(index, { required: event.target.checked })} data-testid={`input-bulk-field-required-${index}`} /><span>Required</span></label>
                  <label className="payment-method-required-toggle"><input type="checkbox" checked={field.emphasizedLabel === true} onChange={event => change(index, { emphasizedLabel: event.target.checked })} data-testid={`input-bulk-field-emphasized-${index}`} /><span>Emphasized label</span></label>
                </div>
              </div>)}
            </div>
          </section>
          {invalid && fields.length > 0 && <p role="status" className="text-sm text-destructive" data-testid="status-bulk-fields-validation">Check field labels, duplicate labels or keys, validation patterns, ranges and select options before reviewing.</p>}
        </> : <section className="space-y-4" data-testid="section-bulk-fields-review">
          <div className="payment-method-field-section-head"><div><h3>REVIEW CHANGES</h3><p>Server comparison for each selected method. Confirm this exact preview before applying.</p></div></div>
          {currentReview && <>
            <p className="text-sm font-medium" data-testid="text-bulk-fields-preview-counts">{currentReview.updated} to update · {currentReview.skipped} unchanged · {currentReview.failed} failed</p>
            {currentReview.targets.some(target => target.directionMismatches.length > 0) && <div role="status" data-testid="status-bulk-fields-direction-warning" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground flex gap-2">
              <CircleAlert size={17} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{currentReview.targets.filter(target => target.directionMismatches.length > 0).length} selected payment method{currentReview.targets.filter(target => target.directionMismatches.length > 0).length === 1 ? '' : 's'} have fields with different existing directions. Existing directions are kept unless you checked “Also change existing fields” for that field. You can still apply these changes.</span>
            </div>}
            <div className="space-y-2 max-h-[40dvh] overflow-y-auto">
              {currentReview.targets.map(target => <div key={target.id} className="rounded-lg border border-border bg-muted/20 p-3 text-sm" data-testid={`row-bulk-preview-${target.id}`}>
                <div className="flex justify-between gap-2"><strong>{target.name}</strong><span className={target.action === 'update' ? 'text-primary' : 'text-muted-foreground'}>{target.action === 'update' ? 'Update' : 'No change'}</span></div>
                <p className="text-muted-foreground break-words">Added: {target.added.map(key => displayField(target.id, key, 'added')).join(', ') || 'None'} · Modified: {target.modified.map(key => displayField(target.id, key, 'modified')).join(', ') || 'None'} · Unchanged: {target.unchanged.map(key => displayField(target.id, key, 'unchanged')).join(', ') || 'None'}</p>
                {target.directionMismatches.length > 0 && <p className="mt-1 text-amber-700 dark:text-amber-300 break-words">Different direction: {target.directionMismatches.map(key => displayField(target.id, key, 'modified')).join(', ')}</p>}
              </div>)}
            </div>
          </>}
        </section>}
        <div className="border-t border-border pt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="payment-method-add-field" onClick={dismiss} disabled={pending} data-testid="button-cancel-bulk-fields">Cancel</button>
          {step === 'review' && <button type="button" className="payment-method-add-field" onClick={() => { setStep('edit'); setReview(null); }} disabled={pending} data-testid="button-back-bulk-fields">Back to fields</button>}
          {step === 'edit' ? <button type="button" className="payment-method-add-field" onClick={preview} disabled={invalid || pending} data-testid="button-preview-bulk-fields">{pending ? 'Preparing review…' : 'Review changes'}</button> :
            <button type="button" className="payment-method-add-field" onClick={apply} disabled={!currentReview || pending || currentReview.targets.length !== selectedIds.length || currentReview.failed > 0 || currentReview.updated === 0} data-testid="button-apply-bulk-fields">{pending ? 'Applying…' : `Apply to ${currentReview?.updated || 0} method${currentReview?.updated === 1 ? '' : 's'}`}</button>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}