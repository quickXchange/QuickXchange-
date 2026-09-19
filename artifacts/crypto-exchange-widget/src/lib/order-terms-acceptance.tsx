import { useGetPublishedSiteContent, getGetPublishedSiteContentQueryKey } from '@workspace/api-client-react';
import { useSitePreview } from '@/components/site-preview-context';
import { publicPageDefinition } from '@/lib/public-page-registry';
import { Link } from 'wouter';

export type OrderTermsAcceptanceContent = {
  mainText: string;
  termsLabel: string;
  termsUrl: string;
  privacyLabel: string;
  privacyUrl: string;
  amlLabel: string;
  amlUrl: string;
};

export const ORDER_TERMS_ACCEPTANCE_PAGE_KEY = 'order-terms-acceptance';
export const ORDER_TERMS_LEGAL_ROUTES = {
  termsUrl: publicPageDefinition('terms-conditions')?.path ?? '/terms',
  privacyUrl: publicPageDefinition('privacy-policy')?.path ?? '/privacy',
  amlUrl: publicPageDefinition('aml-kyc')?.path ?? '/aml-kyc',
} as const;
export const DEFAULT_ORDER_TERMS_ACCEPTANCE: OrderTermsAcceptanceContent = {
  mainText: 'I accept the',
  termsLabel: 'Terms & Conditions',
  termsUrl: ORDER_TERMS_LEGAL_ROUTES.termsUrl,
  privacyLabel: 'Privacy Policy',
  privacyUrl: ORDER_TERMS_LEGAL_ROUTES.privacyUrl,
  amlLabel: 'AML/KYC Policy',
  amlUrl: ORDER_TERMS_LEGAL_ROUTES.amlUrl,
};

export function normalizeOrderTermsAcceptance(value: unknown): OrderTermsAcceptanceContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_ORDER_TERMS_ACCEPTANCE;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_ORDER_TERMS_ACCEPTANCE) as Array<keyof OrderTermsAcceptanceContent>;
  if (keys.some((key) => typeof input[key] !== 'string' || !(input[key] as string).trim())) {
    return DEFAULT_ORDER_TERMS_ACCEPTANCE;
  }
  return {
    ...Object.fromEntries(keys.map((key) => [key, (input[key] as string).trim()])),
    ...ORDER_TERMS_LEGAL_ROUTES,
  } as OrderTermsAcceptanceContent;
}

export function useOrderTermsAcceptance() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({
    query: {
      queryKey: getGetPublishedSiteContentQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
    },
  });
  const previewContent = preview.active && (preview.pageKey === ORDER_TERMS_ACCEPTANCE_PAGE_KEY
    || (preview.content
      && typeof preview.content.mainText === 'string'
      && typeof preview.content.termsLabel === 'string'
      && typeof preview.content.privacyLabel === 'string'
      && typeof preview.content.amlLabel === 'string'))
    ? preview.content
    : undefined;
  const publishedContent = published.data?.pages.find((page) => page.pageKey === ORDER_TERMS_ACCEPTANCE_PAGE_KEY)?.content;
  return normalizeOrderTermsAcceptance(previewContent ?? publishedContent);
}

export function OrderTermsAcceptance({
  checkboxId,
  checked,
  onChange,
}: {
  checkboxId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const content = useOrderTermsAcceptance();
  return (
    <>
      <input
        type="checkbox"
        id={checkboxId}
        required
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 w-[18px] h-[18px] rounded border-border text-primary focus:ring-primary/20 shrink-0"
      />
      <label htmlFor={checkboxId} className="text-[14px] font-medium text-foreground leading-relaxed">
        {content.mainText}{' '}
        <Link href={content.termsUrl} className="text-primary underline">{content.termsLabel}</Link>,{' '}
        <Link href={content.privacyUrl} className="text-primary underline">{content.privacyLabel}</Link>{' and '}
        <Link href={content.amlUrl} className="text-primary underline">{content.amlLabel}</Link>.
      </label>
    </>
  );
}