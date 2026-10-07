import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { formatDisplayAmount } from '@workspace/amount-format';
import type { ManualSwapFeeQuoteSnapshot } from '@workspace/api-client-react';
import { getListPublicManualSwapAddonsQueryKey, useListPublicManualSwapAddons } from '@workspace/api-client-react';
import { useI18n } from '@/i18n';

/** Presentation only: preserve the original fee snapshot for all calculations. */
export function trimFeeDecimal(value: string): string {
  return formatDisplayAmount(value);
}

export function SwapFeeBreakdown({ fees, currency, receiveAmount, illustrative = false }: {
  fees?: ManualSwapFeeQuoteSnapshot | null;
  currency: string;
  receiveAmount?: number | string;
  illustrative?: boolean;
}) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const { locale } = useI18n();
  const addons = useListPublicManualSwapAddons({
    query: { queryKey: getListPublicManualSwapAddonsQueryKey(), staleTime: 30_000, enabled: Boolean(fees) },
  });
  if (!fees) return null;
  return <section className="rounded-2xl border border-border bg-card/70 p-4 text-sm space-y-2" aria-label={illustrative ? uiT("customer.m6920c91042b4") : uiT("customer.m0ae5cc8b3709")} data-testid="swap-fee-breakdown">
    <div className="font-bold text-foreground">{illustrative ? uiT("customer.m75b3892a9822") : uiT("customer.ma830f3fa69b6")}</div>
    <div className="font-semibold text-foreground">{uiT("customer.m229841215465")}</div>
    {fees.selectedAddons.length
      ? fees.selectedAddons.map(item => {
          const addon = addons.data?.items.find(option => option.key === item.key);
          const name = uiText(addon?.name || item.name);
          const feeLabel = item.feeType === 'percentage' && item.percentage != null
            ? `${trimFeeDecimal(item.percentage)}%`
            : item.feeType === 'percentage' ? '' : `${trimFeeDecimal(item.amount)} ${item.currency}`;
          return <div key={item.key} className="flex justify-between gap-4 text-muted-foreground" data-testid={`fee-addon-${item.key}`}>
            <span>{uiText(name)}{feeLabel && <small> ({uiText(feeLabel)})</small>}</span>
            <span className="font-mono whitespace-nowrap">{trimFeeDecimal(item.targetAmount)} {currency}</span>
          </div>;
        })
      : <div className="text-muted-foreground" data-testid="fee-addons-none">{uiT("customer.m70010dd324a9")}</div>}
    {fees.exchangeFee.enabled && <div className="flex justify-between gap-4 text-muted-foreground" data-testid="fee-exchange">
      <span>{uiT("customer.mc84b4c4666c3")}{fees.exchangeFee.percentage ? ` (${trimFeeDecimal(fees.exchangeFee.percentage)}%)` : ''}{fees.exchangeFee.fixedAmount ? ` + ${trimFeeDecimal(fees.exchangeFee.fixedAmount)} ${fees.exchangeFee.fixedCurrency}` : ''}</span>
      <span className="font-mono whitespace-nowrap">{trimFeeDecimal(fees.exchangeFee.totalAmount)} {currency}</span>
    </div>}
    {fees.existingPricingFee && !/^0+(?:\.0+)?$/.test(fees.existingPricingFee) && <div className="flex justify-between gap-4 text-muted-foreground" data-testid="fee-existing-pricing"><span>{uiT("customer.m7c91ecf8b7ff")}</span><span className="font-mono whitespace-nowrap">{uiText(trimFeeDecimal(fees.existingPricingFee))} {currency}</span></div>}
    <div className="flex justify-between gap-4 border-t border-border pt-2 text-muted-foreground" data-testid="fee-additional-total"><span>{uiT("customer.m6e4f7c868490")}</span><span className="font-mono whitespace-nowrap">{uiText(trimFeeDecimal(fees.totalAdditionalFee))} {currency}</span></div>
    <div className="flex justify-between gap-4 font-semibold text-foreground" data-testid="fee-total"><span>{uiT("customer.m47e44854816e")}</span><span className="font-mono whitespace-nowrap">{uiText(trimFeeDecimal(fees.totalFees))} {currency}</span></div>
    {receiveAmount !== undefined && <div className="flex justify-between gap-4 border-t border-border pt-2 font-bold text-foreground" data-testid="fee-final-receive"><span>{uiT("customer.ma57ff08ca7e5")}</span><span className="font-mono">{formatDisplayAmount(receiveAmount)}{illustrative ? '' : ` ${currency}`}</span></div>}
  </section>;
}