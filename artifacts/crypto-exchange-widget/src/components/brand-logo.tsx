import { Link } from 'wouter';
import { basePath, cn } from '@/components/shared-app-ui';
import { useAppTheme } from '@/theme';
import { useGetPublishedSiteContent, getGetPublishedSiteContentQueryKey } from '@workspace/api-client-react';
import { useSitePreview } from './site-preview-context';
import type { CSSProperties } from 'react';

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
  const responsiveSizeStyle = {
    '--qx-logo-desktop-width': `${branding?.desktopLogoWidth ?? 138}px`,
    '--qx-logo-desktop-max-height': `${branding?.desktopLogoMaxHeight ?? 30}px`,
    '--qx-logo-tablet-width': `${branding?.tabletLogoWidth ?? 130}px`,
    '--qx-logo-tablet-max-height': `${branding?.tabletLogoMaxHeight ?? 28}px`,
    '--qx-logo-mobile-width': `${branding?.mobileLogoWidth ?? 116}px`,
    '--qx-logo-mobile-max-height': `${branding?.mobileLogoMaxHeight ?? 28}px`,
  } as CSSProperties;

  const commonImgProps = {
    alt: "QuickXchange",
    width: branding?.logoWidth || 900,
    height: branding?.logoHeight || 287,
    decoding: "async" as const,
  };

  return (
    <Link
      href="/"
      className={cn('brand', 'brand-logo-surface', inverse && 'brand-inverse', alignmentClass, className)}
      onClick={onNavigate}
      data-testid={testId}
      style={responsiveSizeStyle}
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
