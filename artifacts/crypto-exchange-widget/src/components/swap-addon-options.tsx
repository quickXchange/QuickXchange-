import type { ManualSwapAddon } from '@workspace/api-client-react';
import { trimFeeDecimal } from '@/components/swap-fee-breakdown';

export type SwapAddonOption = Pick<ManualSwapAddon, 'key' | 'name' | 'description' | 'fixedAmount' | 'feeCurrency' | 'enabled' | 'selectionRule' | 'presentation'>;

/** The same customer-facing selector is used for the live Swap and the Admin preview.
 * Options are rendered in the order supplied by the caller.
 */
export function SwapAddonOptions({
  options, selectedKeys, onToggle, isLoading, isError, onRetry, preview = false,
}: {
  options: SwapAddonOption[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  preview?: boolean;
}) {
  return <section className="mt-4 space-y-3" aria-label="Optional Swap add-ons">
    <div className="text-sm font-bold text-foreground">Optional add-ons</div>
    {isLoading ? <div className="skeleton h-16 rounded-xl" aria-label="Loading optional add-ons"/> : isError ?
      <div role="alert" className="text-sm text-destructive">Options are unavailable. {onRetry && <button type="button" onClick={onRetry} className="underline" data-testid="button-retry-swap-addons">Retry</button>}</div> :
      options.length ? <div className="space-y-2">{options.map(item => <label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card/60 p-3 text-sm">
        <input type="checkbox" className="mt-1 accent-primary" checked={selectedKeys.includes(item.key)} disabled={item.selectionRule === 'none'} onChange={() => onToggle(item.key)} data-testid={`${preview ? 'checkbox-preview-swap-addon' : 'checkbox-swap-addon'}-${item.key}`}/>
        <span className="flex-1"><strong className="block text-foreground">{item.name}</strong>{item.description && <small className="text-muted-foreground">{item.description}</small>}{item.selectionRule === 'one' && <small className="block text-muted-foreground">Choose one in {item.presentation.group || 'this group'}</small>}</span>
        <span className="font-mono text-foreground whitespace-nowrap">{trimFeeDecimal(item.fixedAmount)} {item.feeCurrency}</span>
      </label>)}</div> : <p className="text-xs text-muted-foreground">No optional services are available for this swap.</p>}
  </section>;
}