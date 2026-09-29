import { useEffect, useRef, useState } from 'react';
import { usePreviewManualSwapFees } from '@workspace/api-client-react';
import type { ManualSwapAddon, ManualSwapAddonInput, ManualSwapFeePreview, ManualSwapFeePreviewConfig, ManualSwapFeePreviewInput } from '@workspace/api-client-react';
import { SwapFeeBreakdown, trimFeeDecimal } from '@/components/swap-fee-breakdown';

type Locale = 'en' | 'ru' | 'ar' | 'uk';
type PreviewAddon = ManualSwapAddonInput & {
  feeType?: 'fixed' | 'percentage';
  percentage?: string | null;
  translations?: Partial<Record<Locale, { title?: string; description?: string }>>;
};
type SavedAddon = ManualSwapAddon & Pick<PreviewAddon, 'feeType' | 'percentage' | 'translations'>;
type PreviewOption = Pick<ManualSwapAddon, 'key' | 'name' | 'description' | 'fixedAmount' | 'feeCurrency' | 'enabled' | 'selectionRule' | 'presentation' | 'displayOrder'> & Pick<PreviewAddon, 'feeType' | 'percentage' | 'translations'>;
const decimal = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/;
const currencyCode = /^[A-Z0-9]{2,15}$/;
const validAddon = (item: PreviewAddon, original?: ManualSwapAddon) =>
  /^[a-z0-9][a-z0-9_-]{0,99}$/.test(item.key) &&
  item.name.trim().length > 0 && item.name.length <= 120 &&
  (item.description?.length || 0) <= 1000 &&
  (item.feeType === 'percentage'
    ? decimal.test(item.percentage || '') && item.feeCurrency === 'USD'
    : decimal.test(item.fixedAmount) && (item.feeCurrency === 'USD' ||
      Boolean(original && original.feeCurrency === item.feeCurrency && original.fixedAmount === item.fixedAmount))) &&
  Object.values(item.translations || {}).every(translation => !translation ||
    (translation.title?.length || 0) <= 120 && (translation.description?.length || 0) <= 1000 &&
    (!translation.description?.trim() || Boolean(translation.title?.trim()))) &&
  Number.isSafeInteger(item.displayOrder) && (item.displayOrder ?? -1) >= 0 &&
  (item.presentation?.group?.length || 0) <= 100 &&
  ['one', 'multiple', 'none'].includes(item.selectionRule || 'multiple');

/** Read-only server calculation. A result is displayed only while its exact input
 * signature matches the current editor state; late responses cannot revive stale fees.
 */
export function AdminSwapAddonPreview({
  savedOptions, draft, editingId, feeConfig, exchangeAmount = 1000, isLoading, isError, onRetry,
}: {
  savedOptions: ManualSwapAddon[];
  draft?: ManualSwapAddonInput;
  editingId?: string;
  feeConfig?: ManualSwapFeePreviewConfig;
  exchangeAmount?: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [locale, setLocale] = useState<Locale>('en');
  const [result, setResult] = useState<{ signature: string; value: ManualSwapFeePreview } | null>(null);
  const [error, setError] = useState<{ signature: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const preview = usePreviewManualSwapFees();
  const mutateRef = useRef(preview.mutateAsync);
  mutateRef.current = preview.mutateAsync;
  const latestSignature = useRef('');

  const extendedDraft = draft as PreviewAddon | undefined;
  const draftKey = draft?.key || '__unsaved_addon__';
  useEffect(() => {
    if (draft && !draft.enabled) setSelected(previous => previous.filter(key => key !== draftKey));
  }, [draft?.enabled, draftKey]);
  const options: PreviewOption[] = savedOptions
    .filter(item => item.enabled && item.id !== editingId)
    .map(item => ({ ...item }));
  if (extendedDraft?.enabled) options.push({
    key: draftKey,
    name: extendedDraft.name || 'Untitled option',
    description: extendedDraft.description || '',
    fixedAmount: extendedDraft.fixedAmount || '0',
    feeCurrency: extendedDraft.feeCurrency,
    feeType: extendedDraft.feeType,
    percentage: extendedDraft.percentage,
    translations: extendedDraft.translations,
    enabled: true,
    selectionRule: extendedDraft.selectionRule || 'multiple',
    presentation: { group: extendedDraft.presentation?.group || '' },
    displayOrder: extendedDraft.displayOrder ?? 0,
  });
  options.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  const groupOf = (option: PreviewOption) => option.presentation.group.trim().toLowerCase() || 'default';
  const selectedKeys: string[] = [];
  for (const key of selected) {
    const item = options.find(option => option.key === key && option.selectionRule !== 'none');
    if (item && !selectedKeys.some(value => {
      const other = options.find(option => option.key === value);
      return other && groupOf(other) === groupOf(item) && (item.selectionRule === 'one' || other.selectionRule === 'one');
    })) selectedKeys.push(key);
  }
  const toggle = (key: string) => {
    const item = options.find(option => option.key === key);
    if (!item || item.selectionRule === 'none') return;
    setSelected(previous => {
      if (previous.includes(key)) return previous.filter(value => value !== key);
      return [...previous.filter(value => !options.some(option =>
        option.key === value && groupOf(option) === groupOf(item) &&
        (item.selectionRule === 'one' || option.selectionRule === 'one')
      )), key];
    });
  };

  const allOptions: PreviewAddon[] = savedOptions
    .filter(item => item.enabled && item.id !== editingId)
    .map(item => {
      const saved = item as SavedAddon;
      return {
        key: item.key, name: item.name, description: item.description,
        fixedAmount: item.fixedAmount, feeCurrency: item.feeCurrency,
        enabled: item.enabled, displayOrder: item.displayOrder,
        selectionRule: item.selectionRule, presentation: { group: item.presentation.group },
        feeType: saved.feeType || 'fixed', percentage: saved.percentage ?? null,
        translations: saved.translations,
      };
    });
  if (extendedDraft?.enabled) allOptions.push({
    ...extendedDraft,
    fixedAmount: extendedDraft.feeType === 'percentage' ? '0' : extendedDraft.fixedAmount,
    percentage: extendedDraft.feeType === 'percentage' ? extendedDraft.percentage : null,
    feeCurrency: extendedDraft.feeType === 'percentage' ? 'USD' : extendedDraft.feeCurrency,
    translations: Object.fromEntries(Object.entries(extendedDraft.translations || {}).filter(([, value]) =>
      value?.title?.trim() || value?.description?.trim()
    )),
  });
  const original = savedOptions.find(item => item.id === editingId);
  const draftValid = !extendedDraft || !extendedDraft.enabled || validAddon(extendedDraft, original);
  const configValid = feeConfig && currencyCode.test(feeConfig.fixedCurrency) &&
    (!feeConfig.enabled || (
      (feeConfig.percentage === null || decimal.test(feeConfig.percentage)) &&
      (feeConfig.fixedAmount === null || decimal.test(feeConfig.fixedAmount))
    ));
  const payload: ManualSwapFeePreviewInput | null = !isLoading && !isError && draftValid && configValid &&
    allOptions.length <= 50 && new Set(allOptions.map(item => item.key)).size === allOptions.length
    ? { exchangeAmount, addons: allOptions, selectedAddonKeys: selectedKeys, feeConfig }
    : null;
  const signature = payload ? JSON.stringify(payload) : '';
  latestSignature.current = signature;

  useEffect(() => {
    if (!payload || !signature) return;
    const timer = window.setTimeout(() => {
      if (latestSignature.current !== signature) return;
      setPendingSignature(signature);
      mutateRef.current({ data: payload }).then(value => {
        if (latestSignature.current === signature) {
          setResult({ signature, value });
          setError(null);
        }
      }).catch(cause => {
        if (latestSignature.current === signature) {
          setError({ signature, message: cause instanceof Error ? cause.message : 'Could not calculate the preview.' });
        }
      }).finally(() => {
        if (latestSignature.current === signature) setPendingSignature(null);
      });
    }, 350);
    return () => window.clearTimeout(timer);
    // signature contains every relevant value; retry reissues the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, retry]);

  const current = result?.signature === signature && !error && pendingSignature !== signature ? result.value : null;
  return <section className="panel min-w-0 overflow-hidden" aria-label="Customer add-ons preview" data-testid="admin-swap-addon-preview">
    <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-base font-bold">Customer preview</h2><p className="mt-0.5 text-xs text-muted-foreground">Illustrative only · Exchange Amount {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(current?.exchangeAmount ?? exchangeAmount)}. Choose options to test the list; nothing is preselected.</p></div>
    <div className="space-y-3 px-5 py-4 sm:px-6">
    {draft && !draft.enabled && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground" data-testid="status-disabled-addon-preview">This draft is disabled, so customers will not see it. Other enabled options remain below.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-bold">Optional add-ons</h3><label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">Preview language<select className="rounded-lg border border-input bg-background px-2 py-1.5 text-foreground" value={locale} onChange={event => setLocale(event.target.value as Locale)} data-testid="select-addon-preview-locale"><option value="en">English</option><option value="ru">Russian</option><option value="ar">Arabic</option><option value="uk">Ukrainian</option></select></label></div>
    {isLoading ? <div className="skeleton h-16 rounded-xl" aria-label="Loading optional add-ons"/> :
      isError ? <div role="alert" className="text-sm text-destructive">Options are unavailable. {onRetry && <button type="button" onClick={onRetry} className="underline" data-testid="button-retry-swap-addons">Retry</button>}</div> :
      options.length ? <div className="space-y-1.5">{options.map(item => {
        const informational = item.selectionRule === 'none';
        const localized = item.translations?.[locale];
        const title = localized?.title?.trim() || item.name;
        const description = localized?.description?.trim() || item.description;
        const feeLabel = item.feeType === 'percentage' ? `${trimFeeDecimal(item.percentage || '0')}% of exchange amount` : `${trimFeeDecimal(item.fixedAmount || '0')} ${item.feeCurrency}`;
        const content = <><span className="min-w-0 flex-1"><strong className="block text-foreground">{title}</strong>{description && <small className="block text-muted-foreground">{description}</small>}{item.selectionRule === 'one' && <small className="block text-muted-foreground">Choose one in {item.presentation.group || 'this group'}</small>}</span>{informational ? <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">Information only</span> : <span className="shrink-0 font-mono text-xs text-foreground">+{feeLabel}</span>}</>;
        return informational ? <div key={item.key} dir={locale === 'ar' ? 'rtl' : undefined} className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs" data-testid={`swap-addon-info-preview-${item.key}`}><span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-muted-foreground/40 text-[10px]">i</span>{content}<span className="sr-only">Informational only; not selectable and not charged.</span></div> :
          <label key={item.key} dir={locale === 'ar' ? 'rtl' : undefined} data-selected={selectedKeys.includes(item.key)} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-xs transition-colors ${selectedKeys.includes(item.key) ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:border-primary/50'}`}><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={selectedKeys.includes(item.key)} onChange={() => toggle(item.key)} data-testid={`checkbox-preview-swap-addon-${item.key}`}/>{content}</label>;
      })}</div> : <p className="text-xs text-muted-foreground">No optional services are available for this swap.</p>}
    {current ? <SwapFeeBreakdown fees={current.feeSnapshot} currency={current.currency} receiveAmount={new Intl.NumberFormat('en-US', { style: 'currency', currency: current.currency }).format(current.receiveAmount)} illustrative/> :
      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground" data-testid="status-fee-preview-unavailable" role="status">
        {!draftValid ? 'Complete the draft option to calculate fees. Incomplete options are never sent to the server.' :
          !configValid ? 'Complete the exchange fee settings to calculate fees.' :
          isLoading || isError ? 'Load options to calculate fees.' :
          error?.signature === signature ? <>Preview calculation failed: {error.message} <button type="button" onClick={() => setRetry(value => value + 1)} className="text-primary underline" data-testid="button-retry-fee-preview">Retry</button></> :
          <span className="block skeleton h-16 rounded-lg" aria-label="Calculating illustrative fees"/>}
      </div>}
    <p className="text-[11px] text-muted-foreground">This is a sample calculation, not a customer quote or an order. Actual route pricing can differ.</p>
    </div>
  </section>;
}