import type { ManualSwapAddon } from '@workspace/api-client-react';
import { trimFeeDecimal } from '@/components/swap-fee-breakdown';
import { ArrowLeftRight, Check, Info, MessageCircle, Package, Zap } from 'lucide-react';
import { useI18n } from '@/i18n';

type SwapAddonTranslation = { title?: string; description?: string };
export type SwapAddonOption = Pick<ManualSwapAddon, 'key' | 'name' | 'description' | 'fixedAmount' | 'feeCurrency' | 'enabled' | 'selectionRule' | 'presentation'> & {
  feeType?: 'fixed' | 'percentage';
  percentage?: string | null;
  translations?: Partial<Record<'en' | 'ru' | 'ar' | 'uk', SwapAddonTranslation>>;
};

/** The same customer-facing selector is used for the live Swap and the Admin preview.
 * Options are rendered in the order supplied by the caller.
 */
export function SwapAddonOptions({
  options, selectedKeys, onToggle, isLoading, isError, onRetry, preview = false, compact = false,
}: {
  options: SwapAddonOption[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  preview?: boolean;
  compact?: boolean;
}) {
  const { locale } = useI18n();
  return <section className={`swap-addon-options${compact ? ' swap-addon-options-compact' : ''}${compact ? '' : ' mt-4 space-y-3'}`} aria-label={compact ? 'Additional Options' : 'Optional Swap add-ons'}>
    {!compact && <div className="text-sm font-bold text-foreground">Optional add-ons</div>}
    {isLoading ? <div className="skeleton h-16 rounded-xl" aria-label="Loading optional add-ons"/> : isError ?
      <div role="alert" className="text-sm text-destructive">Options are unavailable. {onRetry && <button type="button" onClick={onRetry} className="underline" data-testid="button-retry-swap-addons">Retry</button>}</div> :
      options.length ? <div className={compact ? 'swap-addon-options-list' : 'space-y-2'}>{options.map(item => {
        const informational = item.selectionRule === 'none';
        const selected = selectedKeys.includes(item.key);
        const translation = ['en', 'ru', 'ar', 'uk'].includes(locale)
          ? item.translations?.[locale as 'en' | 'ru' | 'ar' | 'uk']
          : undefined;
        const name = translation?.title?.trim() || item.name;
        const description = translation?.description?.trim() || item.description;
        const feeLabel = item.feeType === 'percentage'
          ? `${trimFeeDecimal(item.percentage || '0')}%`
          : `+${trimFeeDecimal(item.fixedAmount)} ${item.feeCurrency}`;
        const iconHint = `${item.key} ${name}`.toLowerCase();
        const AddonIcon = /comment|note/.test(iconHint) ? MessageCircle
          : /company|business/.test(iconHint) ? Package
          : /one.time|single/.test(iconHint) ? ArrowLeftRight
          : Zap;
         const content = <>
           {compact && <span className="swap-addon-icon" aria-hidden="true">{informational ? <Info size={16} /> : <AddonIcon size={16} />}</span>}
            <span className="flex-1"><strong className="block text-foreground">{name} {!informational && compact && <span className="swap-addon-price">{feeLabel}</span>}</strong>{description && <small className="text-muted-foreground">{description}</small>}{item.selectionRule === 'one' && <small className="block text-muted-foreground">Choose one in {item.presentation.group || 'this group'}</small>}</span>
          {informational
            ? <span className="whitespace-nowrap rounded-full border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">Information only</span>
              : compact ? <span className="swap-addon-switch" aria-hidden="true">{selected && <Check size={12} />}</span> : <span className="font-mono text-foreground whitespace-nowrap">{feeLabel}</span>}
        </>;
        return informational
          ? <div key={item.key} className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-3 text-sm" data-testid={`${preview ? 'swap-addon-info-preview' : 'swap-addon-info'}-${item.key}`}>
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-muted-foreground/40 text-[10px] text-muted-foreground" aria-hidden="true">i</span>
              {content}
              <span className="sr-only">Informational only; not selectable and not charged.</span>
            </div>
          : <label key={item.key} data-selected={selected} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${selected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-card/60 hover:border-primary/50'} has-[:disabled]:cursor-not-allowed`}>
               <input type="checkbox" className={compact ? 'swap-addon-native-checkbox' : 'mt-1 h-4 w-4 accent-primary'} checked={selected} onChange={() => onToggle(item.key)} data-testid={`${preview ? 'checkbox-preview-swap-addon' : 'checkbox-swap-addon'}-${item.key}`}/>
              {content}
            </label>;
      })}</div> : <p className="text-xs text-muted-foreground">{compact ? 'No add-ons are currently available' : 'No optional services are available for this swap.'}</p>}
  </section>;
}