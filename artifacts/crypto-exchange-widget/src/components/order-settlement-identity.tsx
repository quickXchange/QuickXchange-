import {
  getGetExchangeConfigQueryKey,
  useGetExchangeConfig,
  type SettlementOption,
} from '@workspace/api-client-react';
import { CryptoIdentity } from '@/components/crypto-identity';
import { FiatCurrencyFlag, isFiatCurrencyCode, PaymentMethodLogo } from '@/components/exchange-surface';
import { cn } from '@/components/shared-app-ui';

type OrderSettlementIdentityProps = {
  assetCode: string;
  routeLabel?: string | null;
  settlementOptionId?: string | null;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  className?: string;
  summaryLogoArtwork?: boolean;
};

const normalizedIdentityPart = (value?: string | null) => value?.trim().toLowerCase() || '';

function paymentMethodName(option: SettlementOption) {
  return option.title || option.networkTitle || option.networkSlug || option.routeNetwork || 'Payment method';
}

function resolveSettlementOption(
  options: SettlementOption[],
  assetCode: string,
  routeLabel?: string | null,
  settlementOptionId?: string | null,
) {
  const normalizedAsset = normalizedIdentityPart(assetCode);
  const normalizedRoute = normalizedIdentityPart(routeLabel);
  const normalizedOptionId = normalizedIdentityPart(settlementOptionId);
  if (normalizedOptionId) {
    return options.find(option => normalizedIdentityPart(option.id) === normalizedOptionId);
  }
  const assetMatches = options.filter(option => normalizedIdentityPart(option.assetCode) === normalizedAsset);
  if (!normalizedRoute) return assetMatches.length === 1 ? assetMatches[0] : undefined;

  const routeMatches = assetMatches.filter(option => {
    return [
      option.id,
      option.paymentMethodId,
      option.title,
      option.networkTitle,
      option.networkSlug,
      option.routeNetwork,
    ].some(value => normalizedIdentityPart(value) === normalizedRoute);
  });
  return routeMatches.length === 1 ? routeMatches[0] : undefined;
}

export function OrderSettlementIdentity({
  assetCode,
  routeLabel,
  settlementOptionId,
  size = 'md',
  compact = false,
  className,
  summaryLogoArtwork = false,
}: OrderSettlementIdentityProps) {
  const config = useGetExchangeConfig({
    query: {
      queryKey: getGetExchangeConfigQueryKey(),
      staleTime: 300000,
    },
  });
  const completeOptions = config.data?.settlementOptions || [];
  const manualOptions = config.data?.manualSettlementOptions || [];
  const options = Array.from(
    [...completeOptions, ...manualOptions].reduce((byId, option) => {
      const id = normalizedIdentityPart(option.id);
      if (!byId.has(id) || completeOptions.includes(option)) byId.set(id, option);
      return byId;
    }, new Map<string, SettlementOption>()).values(),
  );
  const paymentOption = resolveSettlementOption(options, assetCode, routeLabel, settlementOptionId);

  if (paymentOption?.kind === 'fiat-payment-method') {
    const methodName = paymentMethodName(paymentOption);
    return (
      <span
        className={cn(
          'order-settlement-identity order-settlement-identity-payment',
          `order-settlement-identity-${size}`,
          compact && 'is-compact',
          className,
        )}
      >
        <PaymentMethodLogo
          name={methodName}
          logoUrl={paymentOption.logoUrl}
          flagUrl={(paymentOption as SettlementOption & { flagUrl?: string | null }).flagUrl}
          className="order-settlement-payment-logo"
          preferTransparentBbvaArtwork={summaryLogoArtwork}
        />
        <span className="order-settlement-copy">
          <strong>{methodName}</strong>
          <span>{assetCode.toUpperCase()} • Payment Method</span>
        </span>
      </span>
    );
  }

  if (paymentOption?.kind === 'crypto-network') {
    return (
      <CryptoIdentity
        symbol={paymentOption.assetCode}
        name={paymentOption.title}
        network={paymentOption.routeNetwork || paymentOption.networkTitle || paymentOption.networkSlug}
        logoUrl={paymentOption.logoUrl}
        networkLogoUrl={(paymentOption as SettlementOption & { networkLogoUrl?: string | null }).networkLogoUrl}
        size={size}
        compact={compact}
        className={className}
      />
    );
  }

  if (isFiatCurrencyCode(assetCode) && !routeLabel) {
    return (
      <span
        className={cn(
          'order-settlement-identity order-settlement-identity-fiat',
          `order-settlement-identity-${size}`,
          compact && 'is-compact',
          className,
        )}
      >
        <FiatCurrencyFlag code={assetCode} flagUrl={paymentOption ? (paymentOption as SettlementOption & { flagUrl?: string | null }).flagUrl : undefined} size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'} />
        <span className="order-settlement-copy">
          <strong>{assetCode.toUpperCase()}</strong>
          {!compact && <span>Fiat currency</span>}
        </span>
      </span>
    );
  }

  return (
    <CryptoIdentity
      symbol={assetCode}
      network={routeLabel || undefined}
      networkLogoUrl={paymentOption ? (paymentOption as SettlementOption & { networkLogoUrl?: string | null }).networkLogoUrl : undefined}
      size={size}
      compact={compact}
      preferSymbolLogo={!compact}
      className={className}
    />
  );
}
