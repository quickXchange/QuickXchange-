import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { SiteNavLink, PartnerLogo, SocialTrustItem, WebsiteBranding } from '@workspace/api-client-react';
import { setTransientAppTheme } from '@/theme';

export type SitePreviewState = {
  active: boolean;
  content?: Record<string, unknown>;
  pageKey?: string;
  theme?: 'light' | 'dark';
  navigation?: SiteNavLink[];
  partnerLogos?: PartnerLogo[];
  assetUrls?: Record<string, string>;
  socialTrust?: {
    socialTitle?: string;
    trustTitle?: string;
    instagramUrl?: string | null;
    xUrl?: string | null;
    facebookUrl?: string | null;
    telegramUrl?: string | null;
    items: SocialTrustItem[];
    appearance?: {
      iconSize?: number;
      logoSize?: number;
      circleSize?: number;
      borderThickness?: number;
      radiusMode?: 'circle' | 'rounded' | 'square';
      backgroundColor?: string;
      borderColor?: string;
      glowColor?: string;
      glowIntensity?: number;
      iconOpacity?: number;
    };
  };
  branding?: WebsiteBranding;
};

export const SitePreviewContext = createContext<SitePreviewState>({ active: false });

export function useSitePreview() {
  return useContext(SitePreviewContext);
}

export function SitePreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SitePreviewState>({ active: false });

  useEffect(() => {
    if (window === window.parent) return;

    const isPreview = window.location.search.includes('__preview=1');
    if (!isPreview) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === 'SITE_PREVIEW_UPDATE') {
        setState((current) => ({
          ...current,
          ...event.data.payload,
          active: true,
        }));
      }
    };

    window.addEventListener('message', handleMessage);

    window.parent.postMessage({ type: 'SITE_PREVIEW_READY' }, window.location.origin);

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!state.active) return;

    const handleNavigation = (e: MouseEvent) => {
      const interactive = (e.target as Element).closest('a, button, [role="button"]');
      if (interactive) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const handleSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const interactive = (e.target as Element).closest('a, button, [role="button"]');
      if (!interactive) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    document.addEventListener('click', handleNavigation, true);
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('click', handleNavigation, true);
      document.removeEventListener('submit', handleSubmit, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [state.active]);

  useEffect(() => {
    if (!state.active || !state.theme) return;
    setTransientAppTheme(state.theme === 'dark');
  }, [state.active, state.theme]);

  useEffect(() => {
    if (!state.active || window === window.parent) return;
    window.parent.postMessage({ type: 'SITE_PREVIEW_APPLIED' }, window.location.origin);
  }, [state]);

  return (
    <SitePreviewContext.Provider value={state}>
      {children}
    </SitePreviewContext.Provider>
  );
}
