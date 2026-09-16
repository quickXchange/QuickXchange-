import { useState } from 'react';
import { LogoAvatar } from '@/components/logo-avatar';

const fiatFlagCountries: Record<string, string> = {
  AED: 'ae', AFN: 'af', ALL: 'al', AMD: 'am', ANG: 'cw', AOA: 'ao', ARS: 'ar', AUD: 'au',
  AWG: 'aw', AZN: 'az', BAM: 'ba', BBD: 'bb', BDT: 'bd', BGN: 'bg', BHD: 'bh',
  BIF: 'bi', BMD: 'bm', BND: 'bn', BOB: 'bo', BOV: 'bo', BRL: 'br', BSD: 'bs', BTN: 'bt',
  BWP: 'bw', BYN: 'by', BZD: 'bz', CAD: 'ca', CDF: 'cd', CHE: 'ch', CHF: 'ch',
  CHW: 'ch', CLP: 'cl', CNY: 'cn', COP: 'co', COU: 'co', CRC: 'cr', CUP: 'cu',
  CVE: 'cv', CZK: 'cz', DJF: 'dj', DKK: 'dk', DOP: 'do', DZD: 'dz', EGP: 'eg',
  ERN: 'er', ETB: 'et', EUR: 'eu', FJD: 'fj', FKP: 'fk', GBP: 'gb', GEL: 'ge',
  GHS: 'gh', GIP: 'gi', GMD: 'gm', GNF: 'gn', GTQ: 'gt', GYD: 'gy', HKD: 'hk',
  HNL: 'hn', HRK: 'hr', HTG: 'ht', HUF: 'hu', IDR: 'id', ILS: 'il', INR: 'in',
  IQD: 'iq', IRR: 'ir', ISK: 'is', JMD: 'jm', JOD: 'jo', JPY: 'jp', KES: 'ke',
  KGS: 'kg', KHR: 'kh', KMF: 'km', KPW: 'kp', KRW: 'kr', KWD: 'kw', KYD: 'ky',
  KZT: 'kz', LAK: 'la', LBP: 'lb', LKR: 'lk', LRD: 'lr', LSL: 'ls', LYD: 'ly',
  MAD: 'ma', MDL: 'md', MGA: 'mg', MKD: 'mk', MMK: 'mm', MNT: 'mn', MOP: 'mo',
  MRU: 'mr', MUR: 'mu', MVR: 'mv', MWK: 'mw', MXN: 'mx', MXV: 'mx', MYR: 'my',
  MZN: 'mz', NAD: 'na', NGN: 'ng', NIO: 'ni', NOK: 'no', NPR: 'np', NZD: 'nz',
  OMR: 'om', PAB: 'pa', PEN: 'pe', PGK: 'pg', PHP: 'ph', PKR: 'pk', PLN: 'pl',
  PYG: 'py', QAR: 'qa', RON: 'ro', RSD: 'rs', RUB: 'ru', RWF: 'rw', SAR: 'sa',
  SBD: 'sb', SCR: 'sc', SDG: 'sd', SEK: 'se', SGD: 'sg', SHP: 'sh', SLE: 'sl',
  SLL: 'sl', SOS: 'so', SRD: 'sr', SSP: 'ss', STN: 'st', SVC: 'sv', SYP: 'sy',
  SZL: 'sz', THB: 'th', TJS: 'tj', TMT: 'tm', TND: 'tn', TOP: 'to', TRY: 'tr',
  TTD: 'tt', TWD: 'tw', TZS: 'tz', UAH: 'ua', UGX: 'ug', USD: 'us', USN: 'us',
  UYI: 'uy', UYU: 'uy', UYW: 'uy', UZS: 'uz', VED: 've', VES: 've', VND: 'vn',
  VUV: 'vu', WST: 'ws', XAF: 'cm', XCD: 'ag', XOF: 'sn', XPF: 'pf', YER: 'ye',
  ZAR: 'za', ZMW: 'zm', ZWL: 'zw',
};

export type FiatFlagSize = 'sm' | 'md' | 'lg';

export function isFiatCurrencyCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  return normalizedCode.length === 2 || Boolean(fiatFlagCountries[normalizedCode]);
}

export function FlagIcon({
  code,
  variant = 'badge',
  size = 'md',
  className,
  flagUrl,
}: {
  code: string;
  variant?: 'badge' | 'admin';
  size?: FiatFlagSize;
  className?: string;
  flagUrl?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const normalizedCode = code.trim().toUpperCase();
  const countryCode = normalizedCode.length === 2
    ? normalizedCode.toLowerCase()
    : fiatFlagCountries[normalizedCode];
  const classes = [
    'fiat-currency-flag',
    variant === 'admin' && 'fiat-currency-flag-admin',
    className,
  ].filter(Boolean).join(' ');

  if ((!countryCode || failed) && variant === 'admin') return null;

  return (
    <LogoAvatar
      sources={[flagUrl, countryCode ? `https://flagcdn.com/${countryCode}.svg` : null].filter((source): source is string => Boolean(source))}
      fallback={normalizedCode.slice(0, 3) || '¤'}
      size={size}
      type="fiat"
      fit="cover"
      aria-hidden={true}
      className={classes}
      onFailAll={() => setFailed(true)}
    />
  );
}

export const CountryFlag = FlagIcon;
export const FiatCurrencyFlag = FlagIcon;