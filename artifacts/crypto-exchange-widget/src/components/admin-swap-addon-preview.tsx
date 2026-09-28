import { useEffect, useRef, useState } from 'react';
import { usePreviewManualSwapFees } from '@workspace/api-client-react';
import type { ManualSwapAddon, ManualSwapAddonInput, ManualSwapFeePreview, ManualSwapFeePreviewConfig, ManualSwapFeePreviewInput } from '@workspace/api-client-react';
import { SwapAddonOptions, type SwapAddonOption } from '@/components/swap-addon-options';
import { SwapFeeBreakdown } from '@/components/swap-fee-breakdown';

type PreviewOption = SwapAddonOption & { displayOrder: number };
const decimal = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/;
const currencyCode = /^[A-Z0-9]{2,15}$/;
const validAddon = (item: ManualSwapAddonInput) =>
  /^[a-z0-9][a-z0-9_-]{0,99}$/.test(item.key) &&
  item.name.trim().length > 0 && item.name.length <= 120 &&
  (item.description?.length || 0) <= 1000 &&
  decimal.test(item.fixedAmount) && currencyCode.test(item.feeCurrency) &&
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
  const [result, setResult] = useState<{ signature: string; value: ManualSwapFeePreview } | null>(null);
  const [error, setError] = useState<{ signature: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const preview = usePreviewManualSwapFees();
  const mutateRef = useRef(preview.mutateAsync);
  mutateRef.current = preview.mutateAsync;
  const latestSignature = useRef('');

  const draftKey = draft?.key || '__unsaved_addon__';
  useEffect(() => {
    if (draft && !draft.enabled) setSelected(previous => previous.filter(key => key !== draftKey));
  }, [draft?.enabled, draftKey]);
  const options: PreviewOption[] = savedOptions
    .filter(item => item.enabled && item.id !== editingId)
    .map(item => ({ ...item }));
  if (draft?.enabled) options.push({
    key: draftKey,
    name: draft.name || 'Untitled option',
    description: draft.description || '',
    fixedAmount: draft.fixedAmount || '0',
    feeCurrency: draft.feeCurrency || 'USD',
    enabled: true,
    selectionRule: draft.selectionRule || 'multiple',
    presentation: { group: draft.presentation?.group || '' },
    displayOrder: draft.displayOrder ?? 0,
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

  const allOptions: ManualSwapAddonInput[] = savedOptions
    .filter(item => item.enabled && item.id !== editingId)
    .map(item => ({
      key: item.key, name: item.name, description: item.description,
      fixedAmount: item.fixedAmount, feeCurrency: item.feeCurrency,
      enabled: item.enabled, displayOrder: item.displayOrder,
      selectionRule: item.selectionRule, presentation: { group: item.presentation.group },
    }));
  if (draft?.enabled) allOptions.push(draft);
  const draftValid = !draft || !draft.enabled || validAddon(draft);
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
  return <section className="panel p-5 space-y-3 min-w-0" aria-label="Customer add-ons preview" data-testid="admin-swap-addon-preview">
    <div><h2 className="font-bold text-lg">Customer preview</h2><p className="text-sm text-muted-foreground">Illustrative only · Exchange Amount {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(current?.exchangeAmount ?? exchangeAmount)}. Choose options to test the list; nothing is preselected.</p></div>
    {draft && !draft.enabled && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground" data-testid="status-disabled-addon-preview">This draft is disabled, so customers will not see it. Other enabled options remain below.</p>}
    <SwapAddonOptions options={options} selectedKeys={selectedKeys} onToggle={toggle} isLoading={isLoading} isError={isError} onRetry={onRetry} preview/>
    {current ? <SwapFeeBreakdown fees={current.feeSnapshot} currency={current.currency} receiveAmount={new Intl.NumberFormat('en-US', { style: 'currency', currency: current.currency }).format(current.receiveAmount)} illustrative/> :
      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground" data-testid="status-fee-preview-unavailable" role="status">
        {!draftValid ? 'Complete the draft option to calculate fees. Incomplete options are never sent to the server.' :
          !configValid ? 'Complete the exchange fee settings to calculate fees.' :
          isLoading || isError ? 'Load options to calculate fees.' :
          error?.signature === signature ? <>Preview calculation failed: {error.message} <button type="button" onClick={() => setRetry(value => value + 1)} className="text-primary underline" data-testid="button-retry-fee-preview">Retry</button></> :
          <span className="block skeleton h-16 rounded-lg" aria-label="Calculating illustrative fees"/>}
      </div>}
    <p className="text-xs text-muted-foreground">This is a sample calculation, not a customer quote or an order. Actual route pricing can differ.</p>
  </section>;
}