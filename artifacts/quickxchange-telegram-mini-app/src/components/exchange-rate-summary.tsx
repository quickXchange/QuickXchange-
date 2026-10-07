import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { formatDisplayAmount } from '@workspace/amount-format';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';

export interface ExchangeRateSummaryProps {
  mode: 'swap' | 'convert';
  sourceAsset?: string | null;
  targetAsset?: string | null;
  /** Authoritative rate from the backend only. Never computed client-side. */
  rate?: string | number | null;
  loading?: boolean;
  error?: boolean;
  unavailable?: boolean;
}

export function getExchangeRateSummaryText(p: ExchangeRateSummaryProps): string {
  const rateNum = typeof p.rate === 'number' ? p.rate : Number(p.rate);
  const hasRate = p.rate !== null && p.rate !== undefined && String(p.rate).trim() !== '' && Number.isFinite(rateNum) && rateNum > 0;
  if (p.loading) return 'Checking rate...';
  if (p.error || p.unavailable) return 'Rate unavailable';
  if (!p.sourceAsset || !p.targetAsset) return 'Select a route';
  if (!hasRate) return 'Enter an amount to see your rate';
  return `1 ${p.sourceAsset} = ${formatDisplayAmount(p.rate)} ${p.targetAsset}`;
}

export function ExchangeRateSummary(props: ExchangeRateSummaryProps) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const Icon = props.mode === 'convert' ? ArrowRight : ArrowLeftRight;
  return (
    <div className="qx-exchange-rate" data-testid="exchange-rate-summary" aria-live="polite">
      <Icon className="qx-exchange-rate-icon" aria-hidden="true" />
      <div className="qx-exchange-rate-body">
        <span className="qx-exchange-rate-label">{uiT("customer.m5b21b52b58cb")}</span>
        <strong className="qx-exchange-rate-value" data-testid="text-exchange-rate">{uiText(getExchangeRateSummaryText(props))}</strong>
      </div>
    </div>
  );
}
