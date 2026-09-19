type SettlementOptionLike = {
  id?: string;
  assetCode?: string;
  routeNetwork?: string;
  kind?: string;
  logoUrl?: string;
  networkLogoUrl?: string;
  flagUrl?: string;
  title?: string;
};

type OrderLike = {
  fromAsset?: string;
  fromNetwork?: string;
  toAsset?: string;
  toNetwork?: string;
  sourceSettlementOptionId?: string;
  targetSettlementOptionId?: string;
  logos?: unknown;
  sourcePaymentMethod?: unknown;
};

export type MiniAppVisual = {
  logoUrl?: string;
  badgeUrl?: string;
  badgeVariant?: 'network' | 'flag';
  variant?: 'asset' | 'payment';
  fallback?: string;
  label?: string;
};

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function resolveOrderVisual(
  options: SettlementOptionLike[] | undefined,
  order: OrderLike,
  side: 'source' | 'target',
): MiniAppVisual {
  const isSource = side === 'source';
  const optionId = isSource ? order.sourceSettlementOptionId : order.targetSettlementOptionId;
  const asset = isSource ? order.fromAsset : order.toAsset;
  const network = isSource ? order.fromNetwork : order.toNetwork;
  const option = options?.find(item => item.id === optionId) || options?.find(item =>
    item.assetCode?.toUpperCase() === asset?.toUpperCase() &&
    item.routeNetwork?.toUpperCase() === network?.toUpperCase()
  );
  const logos = order.logos && typeof order.logos === 'object' ? order.logos as Record<string, unknown> : {};
  const paymentMethod = isSource && order.sourcePaymentMethod && typeof order.sourcePaymentMethod === 'object'
    ? order.sourcePaymentMethod as Record<string, unknown>
    : undefined;
  const projectedLogo = text(isSource ? (logos.from || logos.sourceLogoUrl || logos.fromAssetLogoUrl) : (logos.to || logos.targetLogoUrl || logos.toAssetLogoUrl));
  const paymentLogo = text(paymentMethod?.logoUrl);
  const projectedBadge = text(isSource ? (logos.fromNetwork || logos.fromFlag) : (logos.toNetwork || logos.toFlag));

  return {
    logoUrl: option?.logoUrl || paymentLogo || projectedLogo,
    badgeUrl: option?.kind === 'crypto-network' ? option.networkLogoUrl : option?.flagUrl || projectedBadge,
    badgeVariant: option?.kind === 'crypto-network' ? 'network' : 'flag',
    variant: option?.kind === 'payment-method' || Boolean(paymentMethod) ? 'payment' : 'asset',
    fallback: asset,
    label: option?.title || text(paymentMethod?.name) || network || asset,
  };
}