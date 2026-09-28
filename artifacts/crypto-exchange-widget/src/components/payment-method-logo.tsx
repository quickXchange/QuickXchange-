import { SiAlipay, SiCashapp, SiN26, SiPaypal, SiPix, SiRevolut, SiVenmo, SiVisa, SiWise, SiZelle } from 'react-icons/si';
import { PaymentLogo } from '@workspace/payment-logo';
import bbvaTransparentLogoUrl from '../../../../attached_assets/bbva-logo-transparent.png';
import bbvaWhiteLogoUrl from '../../../../attached_assets/bbva-logo-white-transparent.png';
import { getBrandfetchLogoUrl } from '@/lib/brandfetch';
import { FiatCurrencyFlag } from '@/components/fiat-flag';
import { useAppTheme } from '@/theme';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const cn = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

export const PAYMENT_METHOD_LOGO_DOMAINS: Array<[RegExp, string]> = [
  [/\bach\b/i, 'nacha.org'],
  [/fedwire/i, 'frbservices.org'],
  [/faster payments/i, 'wearepay.uk'],
  [/chaps/i, 'bankofengland.co.uk'],
  [/swift/i, 'swift.com'],
  [/interac/i, 'interac.ca'],
  [/spei/i, 'www.banxico.org.mx'],
  [/\bupi\b/i, 'npci.org.in'],
  [/imps|neft|rtgs/i, 'rbi.org.in'],
  [/\bsepa\b/i, 'europeanpaymentscouncil.eu'],
  [/payid|\bnpp\b/i, 'auspayplus.com.au'],
  [/paynow/i, 'abs.org.sg'],
  [/promptpay/i, 'www.bot.or.th'],
  [/paysera/i, 'paysera.lt'],
  [/\bbunq\b/i, 'bunq.com'],
  [/\bbbva\b/i, 'bbva.com'],
  [/\bicard\b/i, 'icard.com'],
  [/\bbnp(?:\s+paribas)?\b/i, 'group.bnpparibas'],
  [/\bing\b/i, 'ing.com'],
  [/commerzbank/i, 'commerzbank.com'],
  [/caixabank/i, 'caixabank.com'],
  [/skrill/i, 'skrill.com'],
  [/kaspi/i, 'kaspi.kz'],
  [/\bwio\b/i, 'wio.io'],
  [/zira+t|zirrat/i, 'ziraatbank.com.tr'],
  [/perfect money/i, 'perfectmoney.com'],
  [/payeer/i, 'payeer.com'],
  [/capitalist/i, 'capitalist.net'],
  [/volet/i, 'volet.com'],
  [/neteller/i, 'neteller.com'],
  [/m-?pesa/i, 'mpesa.com'],
  [/gcash/i, 'gcash.com'],
  [/bkash/i, 'bkash.com'],
  [/easypaisa/i, 'easypaisa.com.pk'],
  [/wechat/i, 'pay.weixin.qq.com'],
];

export const PAYMENT_METHOD_OFFICIAL_LOGOS: Array<[RegExp, string]> = [
  [/\bbbva\b/i, bbvaTransparentLogoUrl],
  [/\bi\s*card\b/i, 'https://cdn.icard.com/icard.com/img/common/logo.png?53'],
];

export function PaymentMethodLogo({
  name,
  logoUrl,
  flagUrl,
  badgeCode,
  badgeVariant = 'badge',
  className,
  priority = true,
  preferBrandIcon = false,
}: {
  name: string;
  logoUrl?: string | null;
  flagUrl?: string | null;
  badgeCode?: string | null;
  badgeVariant?: 'badge' | 'admin';
  className?: string;
  priority?: boolean;
  preferBrandIcon?: boolean;
}) {
  const isDark = useAppTheme();
  const normalized = name.toLowerCase();
  let logo: React.ReactNode = null;
  let brand = 'generic';
  if (normalized.includes('bbva')) { brand = 'bbva'; }
  else if (normalized.includes('sepa')) { brand = 'sepa'; }
  else if (normalized.includes('ziraat') || normalized.includes('zirrat')) { brand = 'ziraat'; }
  else if (normalized.includes('paysera')) { brand = 'paysera'; }
  else if (normalized.includes('wise')) { logo = <SiWise color="#9FE870" />; brand = 'wise'; }
  else if (normalized.includes('revolut')) { logo = <SiRevolut />; brand = 'revolut'; }
  else if (normalized.includes('n26')) { logo = <SiN26 color="#36A18B" />; brand = 'n26'; }
  else if (normalized.includes('paypal')) { logo = <SiPaypal color="#00457C" />; brand = 'paypal'; }
  else if (normalized.includes('zelle')) { logo = <SiZelle color="#741AFC" />; brand = 'zelle'; }
  else if (normalized.includes('cash app')) { logo = <SiCashapp color="#00D632" />; brand = 'cashapp'; }
  else if (normalized.includes('venmo')) { logo = <SiVenmo color="#008CFF" />; brand = 'venmo'; }
  else if (normalized.includes('visa')) { logo = <SiVisa color="#1434CB" />; brand = 'visa'; }
  else if (normalized.includes('mastercard')) {
    logo = (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8.5" cy="12" r="6.5" fill="#EB001B" />
        <circle cx="15.5" cy="12" r="6.5" fill="#F79E1B" />
        <path d="M12 6.52a6.5 6.5 0 0 1 0 10.96 6.5 6.5 0 0 1 0-10.96Z" fill="#FF5F00" />
      </svg>
    );
    brand = 'mastercard';
  }
  else if (normalized.includes('alipay')) { logo = <SiAlipay color="#00A1E9" />; brand = 'alipay'; }
  else if (normalized === 'pix' || normalized.includes(' pix')) { logo = <SiPix color="#32BCAD" />; brand = 'pix'; }

  const officialLogoUrl = PAYMENT_METHOD_OFFICIAL_LOGOS.find(([pattern]) => pattern.test(name))?.[1];
  const remoteDomain = PAYMENT_METHOD_LOGO_DOMAINS.find(([pattern]) => pattern.test(name))?.[1];
  const brandfetchUrl = remoteDomain ? getBrandfetchLogoUrl(remoteDomain, { type: 'icon' }) : null;
  const fallbackRemoteUrl = remoteDomain
    ? remoteDomain === 'perfectmoney.com'
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(remoteDomain)}&sz=256`
      : `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${remoteDomain}`)}&sz=256`
    : null;
  const bundledUrl = brand === 'sepa'
    ? `${basePath}/payment-methods/sepa-logo.png`
    : brand === 'ziraat'
      ? `${basePath}/payment-methods/ziraat-bank-logo.jpg`
      : null;
  const bundledFallback = brand === 'sepa' || brand === 'ziraat' ? bundledUrl : officialLogoUrl;
  // BBVA's catalog upload is an opaque square. Use its verified transparent,
  // theme-specific artwork instead; all other methods keep the API upload first.
  const imageSources = Array.from(new Set([
    ...(brand === 'bbva' ? [isDark ? bbvaWhiteLogoUrl : bbvaTransparentLogoUrl] : [logoUrl]),
    ...(preferBrandIcon ? [brandfetchUrl, bundledFallback] : [bundledFallback, brandfetchUrl]),
    fallbackRemoteUrl,
  ].filter((source): source is string => Boolean(source))));

  if (!logo) {
    logo = name.trim().slice(0, 1).toUpperCase() || '¤';
  }

  return (
    <span
      className={cn('payment-method-logo-stack', Boolean(badgeCode) && 'payment-method-logo-stack-badged', className)}
      aria-hidden="true"
    >
      <PaymentLogo
        sources={imageSources}
        fallback={logo}
        alt=""
        priority={priority}
        size="100%"
      />
      {badgeCode && <FiatCurrencyFlag code={badgeCode} flagUrl={flagUrl} variant={badgeVariant} size="sm" />}
    </span>
  );
}
