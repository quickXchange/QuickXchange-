import {
  getGetPublishedSiteContentQueryKey,
  useGetPublishedSiteContent,
} from '@workspace/api-client-react';
import type { MouseEvent } from 'react';

const LEGAL_ROUTES = {
  termsUrl: '/terms',
  privacyUrl: '/privacy',
  amlUrl: '/aml-kyc',
} as const;

const DEFAULT_CONTENT = {
  mainText: 'I accept the',
  termsLabel: 'Terms & Conditions',
  privacyLabel: 'Privacy Policy',
  amlLabel: 'AML/KYC Policy',
};

function legalContent(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_CONTENT;
  const input = value as Record<string, unknown>;
  return {
    mainText: typeof input.mainText === 'string' && input.mainText.trim()
      ? input.mainText.trim()
      : DEFAULT_CONTENT.mainText,
    termsLabel: typeof input.termsLabel === 'string' && input.termsLabel.trim()
      ? input.termsLabel.trim()
      : DEFAULT_CONTENT.termsLabel,
    privacyLabel: typeof input.privacyLabel === 'string' && input.privacyLabel.trim()
      ? input.privacyLabel.trim()
      : DEFAULT_CONTENT.privacyLabel,
    amlLabel: typeof input.amlLabel === 'string' && input.amlLabel.trim()
      ? input.amlLabel.trim()
      : DEFAULT_CONTENT.amlLabel,
  };
}

export function OrderTermsLinks() {
  const published = useGetPublishedSiteContent({
    query: {
      queryKey: getGetPublishedSiteContentQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
    },
  });
  const content = legalContent(
    published.data?.pages.find((page) => page.pageKey === 'order-terms-acceptance')?.content,
  );

  const openLegalPage = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    const telegram = window.Telegram?.WebApp;
    if (!telegram?.openLink) return;
    event.preventDefault();
    telegram.openLink(new URL(path, window.location.origin).toString());
  };

  const linkClass = 'font-semibold text-primary underline underline-offset-2';

  return (
    <span className="leading-snug">
      {content.mainText}{' '}
      <a href={LEGAL_ROUTES.termsUrl} target="_blank" rel="noopener noreferrer" className={linkClass} onClick={(event) => openLegalPage(event, LEGAL_ROUTES.termsUrl)}>
        {content.termsLabel}
      </a>,{' '}
      <a href={LEGAL_ROUTES.privacyUrl} target="_blank" rel="noopener noreferrer" className={linkClass} onClick={(event) => openLegalPage(event, LEGAL_ROUTES.privacyUrl)}>
        {content.privacyLabel}
      </a>{' and '}
      <a href={LEGAL_ROUTES.amlUrl} target="_blank" rel="noopener noreferrer" className={linkClass} onClick={(event) => openLegalPage(event, LEGAL_ROUTES.amlUrl)}>
        {content.amlLabel}
      </a>.
    </span>
  );
}