export type PublicPageDefinition = {
  key: string;
  label: string;
  path: string;
  editable: boolean;
  defaultHeader?: boolean;
  defaultFooter?: boolean;
};

/**
 * Single source of truth for public pages managed by Site Content.
 * Register future public marketing pages here and route them through App.tsx;
 * the Admin Pages list consumes this same registry automatically.
 */
export const PUBLIC_PAGE_REGISTRY = [
  { key: 'home', label: 'Home', path: '/', editable: true },
  { key: 'convert', label: 'Convert', path: '/convert', editable: true },
  { key: 'swap', label: 'Swap', path: '/swap', editable: true },
  { key: 'market-rates', label: 'Market Rates', path: '/market-rates', editable: true },
  { key: 'crypto-pairs', label: 'Crypto Pairs', path: '/crypto-pairs', editable: false, defaultFooter: false },
  { key: 'operations', label: 'Operations', path: '/operations', editable: true },
  { key: 'how-it-works', label: 'How It Works', path: '/how-it-works', editable: false, defaultFooter: true },
  { key: 'about-us', label: 'About Us', path: '/about', editable: true, defaultFooter: true },
  { key: 'affiliate-program', label: 'Affiliate Program', path: '/affiliates', editable: true, defaultFooter: true },
  { key: 'contact-us', label: 'Contact Us', path: '/contact', editable: true, defaultFooter: true },
  { key: 'privacy-policy', label: 'Privacy Policy', path: '/privacy', editable: true, defaultFooter: true },
  { key: 'terms-conditions', label: 'Terms & Conditions', path: '/terms', editable: true, defaultFooter: true },
  { key: 'aml-kyc', label: 'AML / KYC', path: '/aml-kyc', editable: true, defaultFooter: true },
  { key: 'blog', label: 'Blog', path: '/blog', editable: false, defaultHeader: true, defaultFooter: true },
  { key: 'faq', label: 'FAQ', path: '/faq', editable: false },
] as const satisfies readonly PublicPageDefinition[];

export const LEGACY_MANAGED_NAVIGATION_IDS = new Set([
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000007',
]);

export type PublicPageKey = typeof PUBLIC_PAGE_REGISTRY[number]['key'];
export const EDITABLE_PUBLIC_PAGES = PUBLIC_PAGE_REGISTRY.filter((page) => page.editable);
export const publicPageDefinition = (key: string) => PUBLIC_PAGE_REGISTRY.find((page) => page.key === key);