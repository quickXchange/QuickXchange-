import { Link } from 'wouter';
import { basePath, cn } from '@/components/shared-app-ui';
import { useAppTheme } from '@/theme';
import { useGetPublishedSiteContent, getGetPublishedSiteContentQueryKey } from '@workspace/api-client-react';
import { useSitePreview } from './site-preview-context';

export function BrandLogo({
  inverse = false,
  forceDark = false,
  className,
  imgClassName,
  onNavigate,
  testId = 'link-brand'
}: {
  inverse?: boolean;
  forceDark?: boolean;
  className?: string;
  imgClassName?: string;
  onNavigate?: () => void;
  testId?: string;
}) {
  const isDarkTheme = useAppTheme();
  const isDark = forceDark || inverse || isDarkTheme;
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({
    query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 }
  });

  const branding = (preview.active && preview.branding) ? preview.branding : published.data?.branding;

  const defaultLight = `/brand/quickxchange-header-light.png`;
  const defaultDark = `/brand/quickxchange-header-dark.png`;

  const getSource = (path: string | undefined | null, fallback: string) => {
    if (!path) return fallback;
    return path.startsWith('/objects/') ? `/api/storage${path}` : path;
  };

  const themeSpecificLogo = isDark ? getSource(branding?.darkLogoPath, defaultDark) : getSource(branding?.lightLogoPath, defaultLight);
  const mobileLogo = getSource(branding?.mobileLogoPath, '');
  
  const alignmentClass = branding?.alignment === 'center' ? 'mx-auto' : branding?.alignment === 'right' ? 'ml-auto' : '';

  const commonImgProps = {
    alt: "QuickXchange",
    width: branding?.logoWidth || 900,
    height: branding?.logoHeight || 288,
    style: { maxWidth: branding?.logoMaxWidth ? `${branding.logoMaxWidth}px` : '100%' },
    decoding: "async" as const,
  };

  return (
    <Link
      href="/"
      className={cn('brand', 'brand-logo-surface', inverse && 'brand-inverse', alignmentClass, className)}
      onClick={onNavigate}
      data-testid={testId}
    >
      {mobileLogo ? (
        <>
          <img
            className={cn("brand-reference-logo hidden md:block", imgClassName)}
            src={`${basePath}${themeSpecificLogo}`}
            {...commonImgProps}
          />
          <img
            className={cn("brand-reference-logo block md:hidden", imgClassName)}
            src={`${basePath}${mobileLogo}`}
            {...commonImgProps}
          />
        </>
      ) : (
        <img
          className={cn("brand-reference-logo", imgClassName)}
          src={`${basePath}${themeSpecificLogo}`}
          {...commonImgProps}
        />
      )}
    </Link>
  );
}
