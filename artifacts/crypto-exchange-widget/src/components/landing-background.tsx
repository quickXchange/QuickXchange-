import React from 'react';
import {
  DEFAULT_LANDING_BACKGROUND_URL,
  getLandingBackgroundUrl,
  getLandingBackgroundPlacement,
  type LandingBackgroundSelection,
} from '../lib/landing-background-config';

export function LandingBackgroundView({ 
  bg,
  localPreviewUrl,
  previewMode = false,
  previewDevice,
}: { 
  bg?: LandingBackgroundSelection | null, 
  localPreviewUrl?: string | null,
  previewMode?: boolean,
  /** Forces a device placement for an embedded admin preview. */
  previewDevice?: 'desktop' | 'mobile',
}) {
  const filterInstanceId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const desktopFilterId = `landing-background-desktop-blur-${filterInstanceId}`;
  const mobileFilterId = `landing-background-mobile-blur-${filterInstanceId}`;
  const url = getLandingBackgroundUrl(bg, localPreviewUrl);
  const desktop = getLandingBackgroundPlacement(bg, 'desktop');
  const mobile = getLandingBackgroundPlacement(bg, 'mobile');
  const displayDesktop = previewDevice ? getLandingBackgroundPlacement(bg, previewDevice) : desktop;
  const displayMobile = previewDevice ? getLandingBackgroundPlacement(bg, previewDevice) : mobile;

  const positionClass = previewMode ? 'absolute inset-0' : 'fixed inset-0';

  return (
    <>
      <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }}>
        <defs>
          <filter id={desktopFilterId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={displayDesktop.blur} edgeMode="duplicate" />
          </filter>
          <filter id={mobileFilterId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={displayMobile.blur} edgeMode="duplicate" />
          </filter>
        </defs>
      </svg>
      <div
        data-testid="landing-background-layer"
        className={`${positionClass} landing-background-wrapper pointer-events-none z-0 overflow-hidden`}
      >
        <div
          data-testid="landing-background-image"
          className="landing-background-image absolute inset-0"
          data-desktop-filter-id={desktopFilterId}
          data-mobile-filter-id={mobileFilterId}
          style={{
            '--desktop-x': `${displayDesktop.x}%`,
            '--desktop-y': `${displayDesktop.y}%`,
            '--desktop-zoom': String(displayDesktop.zoom / 100),
            '--desktop-opacity': String(displayDesktop.opacity / 100),
            '--desktop-filter': displayDesktop.blur > 0 ? `url(#${desktopFilterId})` : 'none',
            '--mobile-x': `${displayMobile.x}%`,
            '--mobile-y': `${displayMobile.y}%`,
            '--mobile-zoom': String(displayMobile.zoom / 100),
            '--mobile-opacity': String(displayMobile.opacity / 100),
            '--mobile-filter': displayMobile.blur > 0 ? `url(#${mobileFilterId})` : 'none',
            backgroundImage: url === DEFAULT_LANDING_BACKGROUND_URL
              ? `url(${JSON.stringify(url)})`
              : `url(${JSON.stringify(url)}), url(${JSON.stringify(DEFAULT_LANDING_BACKGROUND_URL)})`,
          } as React.CSSProperties}
        />
      </div>
      <div 
        data-testid="landing-background-gradient"
        className={`${positionClass} pointer-events-none z-0 bg-gradient-to-b from-background/50 via-background/80 to-background`}
      />
    </>
  );
}

export function LiveLandingBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="live-landing-background-root relative isolate min-h-[100dvh] w-full" data-testid="live-landing-background-root">
      <div className="relative z-10 w-full">
        {children}
      </div>
    </div>
  );
}
