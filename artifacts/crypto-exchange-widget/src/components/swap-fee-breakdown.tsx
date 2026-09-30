import type { ManualSwapFeeQuoteSnapshot } from '@workspace/api-client-react';
import { getListPublicManualSwapAddonsQueryKey, useListPublicManualSwapAddons } from '@workspace/api-client-react';
import { useI18n } from '@/i18n';

/** Display decimal strings exactly, without floating-point conversion. */
export function trimFeeDecimal(value: string): string {
  return /^\d+\.\d+$/.test(value) ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

export function SwapFeeBreakdown({ fees, currency, receiveAmount, illustrative = false }: {
  fees?: ManualSwapFeeQuoteSnapshot | null;
  currency: string;
  receiveAmount?: number | string;
  illustrative?: boolean;
}) {
  const { locale } = useI18n();
  const addons = useListPublicManualSwapAddons({
    query: { queryKey: getListPublicManualSwapAddonsQueryKey(), staleTime: 30_000, enabled: Boolean(fees) },
  });
  if (!fees) return null;
  return <section className="rounded-2xl border border-border bg-card/70 p-4 text-sm space-y-2" aria-label={illustrative ? 'Illustrative swap fee breakdown' : 'Swap fee breakdown'} data-testid="swap-fee-breakdown">
    <div className="font-bold text-foreground">{illustrative ? 'Illustrative fee breakdown' : 'Your quote, itemized'}</div>
    <div className="font-semibold text-foreground">Selected add-ons · Add-on fees</div>
    {fees.selectedAddons.length
      ? fees.selectedAddons.map(item => {
          const addon = addons.data?.items.find(option => option.key === item.key);
          const translation = ['en', 'ru', 'ar', 'uk'].includes(locale)
            ? addon?.translations?.[locale as 'en' | 'ru' | 'ar' | 'uk']
            : undefined;
          const name = translation?.title?.trim() || item.name;
          const feeLabel = item.feeType === 'percentage' && item.percentage != null
            ? `${trimFeeDecimal(item.percentage)}%`
            : item.feeType === 'percentage' ? '' : `${trimFeeDecimal(item.amount)} ${item.currency}`;
          return <div key={item.key} className="flex justify-between gap-4 text-muted-foreground" data-testid={`fee-addon-${item.key}`}>
            <span>{name}{feeLabel && <small> ({feeLabel})</small>}</span>
            <span className="font-mono whitespace-nowrap">{trimFeeDecimal(item.targetAmount)} {currency}</span>
          </div>;
        })
      : <div className="text-muted-foreground" data-testid="fee-addons-none">No add-ons selected</div>}
    {fees.exchangeFee.enabled && <div className="flex justify-between gap-4 text-muted-foreground" data-testid="fee-exchange">
      <span>Exchange fee{fees.exchangeFee.percentage ? ` (${trimFeeDecimal(fees.exchangeFee.percentage)}%)` : ''}{fees.exchangeFee.fixedAmount ? ` + ${trimFeeDecimal(fees.exchangeFee.fixedAmount)} ${fees.exchangeFee.fixedCurrency}` : ''}</span>
      <span className="font-mono whitespace-nowrap">{trimFeeDecimal(fees.exchangeFee.totalAmount)} {currency}</span>
    </div>}
    {fees.existingPricingFee && !/^0+(?:\.0+)?$/.test(fees.existingPricingFee) && <div className="flex justify-between gap-4 text-muted-foreground" data-testid="fee-existing-pricing"><span>Existing route pricing fee</span><span className="font-mono whitespace-nowrap">{trimFeeDecimal(fees.existingPricingFee)} {currency}</span></div>}
    <div className="flex justify-between gap-4 border-t border-border pt-2 text-muted-foreground" data-testid="fee-additional-total"><span>Additional fees</span><span className="font-mono whitespace-nowrap">{trimFeeDecimal(fees.totalAdditionalFee)} {currency}</span></div>
    <div className="flex justify-between gap-4 font-semibold text-foreground" data-testid="fee-total"><span>Total fees</span><span className="font-mono whitespace-nowrap">{trimFeeDecimal(fees.totalFees)} {currency}</span></div>
    {receiveAmount !== undefined && <div className="flex justify-between gap-4 border-t border-border pt-2 font-bold text-foreground" data-testid="fee-final-receive"><span>Final You Receive</span><span className="font-mono">{receiveAmount}{illustrative ? '' : ` ${currency}`}</span></div>}
  </section>;
}