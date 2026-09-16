import { useEffect } from 'react';
import { useGetPublishedSiteContent, getGetPublishedSiteContentQueryKey } from '@workspace/api-client-react';
import { basePath } from '@/components/shared-app-ui';
import { useSitePreview } from './site-preview-context';

export function FaviconUpdater() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({
    query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 }
  });

  const branding = (preview.active && preview.branding) ? preview.branding : published.data?.branding;

  useEffect(() => {
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    
    const faviconPath = branding?.faviconPath;
    if (faviconPath) {
      const src = faviconPath.startsWith('/objects/') ? `/api/storage${faviconPath}` : faviconPath;
      link.href = `${basePath}${src}`;
    } else {
      link.href = `${basePath}/brand/quickxchange-mark.png`;
    }
  }, [branding?.faviconPath]);

  return null;
}
