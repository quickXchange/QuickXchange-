type SettlementOptionLike = {
  id?: string;
  assetCode?: string;
  routeNetwork?: string;
  kind?: string;
  paymentMethodId?: string;
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
  fallbackSrcs?: string[];
  badgeUrl?: string;
  badgeVariant?: 'network' | 'flag';
  variant?: 'asset' | 'payment';
  fallback?: string;
  label?: string;
};

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

const PAYMENT_METHOD_DOMAINS: Array<[RegExp, string]> = [
  [/\bbbva\b/i, 'bbva.com'],
  [/\bbnp(?:\s+paribas)?\b/i, 'group.bnpparibas'],
  [/caixabank/i, 'caixabank.com'],
  [/capitalist/i, 'capitalist.net'],
  [/commerzbank/i, 'commerzbank.com'],
  [/\bing\b/i, 'ing.com'],
  [/\bkaspi\b|\bkzt\b/i, 'kaspi.kz'],
  [/\bn26\b/i, 'n26.com'],
  [/paysera/i, 'paysera.lt'],
  [/revolut/i, 'revolut.com'],
  [/\bsepa\b/i, 'europeanpaymentscouncil.eu'],
  [/\bwise\b/i, 'wise.com'],
  [/\bbunq\b/i, 'bunq.com'],
  [/\bicard\b/i, 'icard.com'],
  [/zira+t|zirrat/i, 'ziraatbank.com.tr'],
  [/paypal/i, 'paypal.com'],
  [/skrill/i, 'skrill.com'],
  [/payeer/i, 'payeer.com'],
  [/perfect\s*money/i, 'perfectmoney.com'],
  [/volet/i, 'volet.com'],
  [/neteller/i, 'neteller.com'],
  [/\bwio\b/i, 'wio.io'],
  [/interac/i, 'interac.ca'],
  [/\bupi\b/i, 'npci.org.in'],
  [/\bpix\b/i, 'bcb.gov.br'],
  [/alipay/i, 'alipay.com'],
];

const CRYPTO_ICON_ALIASES: Record<string, string> = {
  POL: 'matic',
};

export function getFallbackCryptoLogos(assetCode?: string) {
  const symbol = assetCode?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9]{2,20}$/.test(symbol)) return [];
  const iconSymbol = CRYPTO_ICON_ALIASES[symbol] || symbol.toLowerCase();
  return [
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${iconSymbol}.png`,
    `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`,
  ];
}

export function getFallbackPaymentLogos(name?: string, id?: string) {
  const identity = `${id || ''} ${name || ''}`.trim();
  const domain = PAYMENT_METHOD_DOMAINS.find(([pattern]) => pattern.test(identity))?.[1];
  if (!domain) return [];
  return [
    `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${domain}`)}&sz=256`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];
}

export function getLogoFallbackText(
  kind?: string,
  title?: string,
  assetCode?: string,
) {
  if (kind !== 'payment-method' && kind !== 'fiat-payment-method') {
    return assetCode;
  }
  const currency = assetCode?.trim();
  const brand = title
    ?.replace(currency ? new RegExp(`\\b${currency}\\b`, 'ig') : /$^/, '')
    .replace(/[()·|/-]+/g, ' ')
    .trim();
  if (!brand) return '¤';
  const words = brand.split(/\s+/).filter(Boolean);
  return words.length === 1
    ? words[0]!.slice(0, 4)
    : words.slice(0, 3).map(word => word[0]).join('');
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

  const isPayment = option?.kind === 'payment-method' || option?.kind === 'fiat-payment-method' || Boolean(paymentMethod);

  return {
    logoUrl: option?.logoUrl || paymentLogo || projectedLogo,
    fallbackSrcs: isPayment
      ? getFallbackPaymentLogos(
          option?.title || text(paymentMethod?.name),
          option?.paymentMethodId || text(paymentMethod?.paymentMethodId) || option?.id,
        )
      : getFallbackCryptoLogos(asset),
    badgeUrl: option?.kind === 'crypto-network' ? option.networkLogoUrl : option?.flagUrl || projectedBadge,
    badgeVariant: option?.kind === 'crypto-network' ? 'network' : 'flag',
    variant: isPayment ? 'payment' : 'asset',
    fallback: getLogoFallbackText(
      isPayment ? 'fiat-payment-method' : option?.kind,
      option?.title || text(paymentMethod?.name),
      asset,
    ),
    label: option?.title || text(paymentMethod?.name) || network || asset,
  };
}