import { useI18n as useCustomerI18n } from "@workspace/i18n";
import type { ManualSwapAddon } from '@workspace/api-client-react';
import { trimFeeDecimal } from '@/components/swap-fee-breakdown';
import { ArrowLeftRight, Info, MessageCircle, Package, Zap } from 'lucide-react';
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
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const { locale } = useI18n();
  return <section className={`swap-addon-options${compact ? ' swap-addon-options-compact' : ''}${compact ? '' : ' mt-4 space-y-3'}`} aria-label={uiT("customer.md6ad61a9a7e2")}>
    <div className="text-sm font-bold text-foreground">{uiT("customer.mfbab18e6e913")}</div>
    {isLoading ? <div className="skeleton h-16 rounded-xl" aria-label={uiT("customer.mcdfdd49a8046")}/> : isError ?
      <div role="alert" className="text-sm text-destructive">{uiT("customer.m282a1bc407f4")}{' '}{onRetry && <button type="button" onClick={onRetry} className="underline" data-testid="button-retry-swap-addons">{uiT("customer.m942087cc2d41")}</button>}</div> :
      options.length ? <div className={compact ? 'swap-addon-options-list' : 'space-y-2'}>{options.map(item => {
        const informational = item.selectionRule === 'none';
        const selected = selectedKeys.includes(item.key);
        const name = uiText(item.name);
        const description = uiText(item.description);
        const feeLabel = item.feeType === 'percentage'
          ? `+${trimFeeDecimal(item.percentage || '0')}%`
          : `+${trimFeeDecimal(item.fixedAmount)} ${item.feeCurrency}`;
        const iconHint = `${item.key} ${item.name}`.toLowerCase();
        const AddonIcon = /comment|note/.test(iconHint) ? MessageCircle
          : /company|business/.test(iconHint) ? Package
          : /one.time|single/.test(iconHint) ? ArrowLeftRight
          : Zap;
         const content = <>
           {compact && <span className="swap-addon-icon" aria-hidden="true">{informational ? <Info size={16} /> : <AddonIcon size={16} />}</span>}
            <span className="flex-1"><strong className="block text-foreground">{uiText(name)} {!informational && compact && <span className="swap-addon-price">{uiText(feeLabel)}</span>}</strong>{description && <small className="text-muted-foreground">{uiText(description)}</small>}{item.selectionRule === 'one' && <small className="block text-muted-foreground">{uiT("customer.mf02e52a53553")}{' '}{item.presentation.group || uiT("customer.m358f5017dff5")}</small>}</span>
          {informational
            ? <span className="whitespace-nowrap rounded-full border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{uiT("customer.meca3ce15ed5a")}</span>
            : !compact && <span className="font-mono text-foreground whitespace-nowrap">{uiText(feeLabel)}</span>}
        </>;
        return informational
          ? <div key={item.key} className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-3 text-sm" data-testid={`${preview ? 'swap-addon-info-preview' : 'swap-addon-info'}-${item.key}`}>
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-muted-foreground/40 text-[10px] text-muted-foreground" aria-hidden="true">{uiT("customer.mde7d1b721a1e")}</span>
              {uiText(content)}
              <span className="sr-only">{uiT("customer.m097ee3e3cdb1")}</span>
            </div>
          : <label key={item.key} data-selected={selected} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${selected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-card/60 hover:border-primary/50'} has-[:disabled]:cursor-not-allowed`}>
               <input type="checkbox" className={compact ? 'swap-addon-native-checkbox' : 'mt-1 h-4 w-4 accent-primary'} checked={selected} onChange={() => onToggle(item.key)} data-testid={`${preview ? 'checkbox-preview-swap-addon' : 'checkbox-swap-addon'}-${item.key}`}/>
              {uiText(content)}
            </label>;
      })}</div> : <p className="text-xs text-muted-foreground">{compact ? uiT("customer.m953cc7512c6a") : uiT("customer.m53d4a776ba96")}</p>}
  </section>;
}