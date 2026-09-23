import React, { useEffect, useRef, useState, useMemo } from 'react';
import { cn } from './shared-app-ui';
import { useAppTheme } from '../theme';

export interface PartnerLogoSettings {
  layout: 'horizontal-row' | 'carousel' | 'grid' | 'vertical-list' | 'stacked-rows' | 'marquee';
  animation: 'static' | 'auto-scroll';
  direction: 'ltr' | 'rtl';
  speed: 'slow' | 'normal' | 'fast';
  pauseOnHover: boolean;
  manualInteraction: boolean;
  resumeAfterInteraction: boolean;
  columnsDesktop: number;
  columnsTablet: number;
  columnsMobile: number;
  size: 'small' | 'medium' | 'large' | 'custom';
  customSize: number;
  container: 'none' | 'subtle-card' | 'glow-card';
  spacing: 'compact' | 'normal' | 'wide';
  alignment: 'left' | 'center' | 'right';
}

export const DEFAULT_PARTNER_LOGO_SETTINGS: PartnerLogoSettings = {
  layout: 'carousel',
  animation: 'auto-scroll',
  direction: 'ltr',
  speed: 'normal',
  pauseOnHover: true,
  manualInteraction: true,
  resumeAfterInteraction: true,
  columnsDesktop: 4,
  columnsTablet: 3,
  columnsMobile: 2,
  size: 'medium',
  customSize: 96,
  container: 'none',
  spacing: 'normal',
  alignment: 'center',
};

export interface PartnerLogoExtended {
  id: string;
  name: string;
  objectPath: string;
  link?: string | null;
  enabled?: boolean;
  sortOrder?: number;
  appearance?: 'auto' | 'same' | 'separate';
  lightObjectPath?: string | null;
  darkObjectPath?: string | null;
}

interface PartnerLogosProps {
  logos: PartnerLogoExtended[];
  settings: PartnerLogoSettings;
  assetUrls?: Record<string, string>;
  getLogoUrl: (logo: PartnerLogoExtended, path: string) => string;
  previewState?: {
    theme?: 'light' | 'dark';
    animation?: 'static' | 'animated';
    viewport?: 'desktop' | 'tablet' | 'mobile';
  };
  className?: string;
  forcePaused?: boolean;
}

export function PartnerLogos({ logos, settings, assetUrls, getLogoUrl, previewState, className, forcePaused }: PartnerLogosProps) {
  const isDarkApp = useAppTheme();
  const isDark = previewState?.theme ? previewState.theme === 'dark' : isDarkApp;
  
  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Responsive motion
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const shouldAnimate = (previewState?.animation === 'animated' || (previewState?.animation !== 'static' && settings.animation === 'auto-scroll')) && !reducedMotion;
  
  // Native scroll interaction tracking
  const interactTimeoutRef = useRef<number | null>(null);
  
  const triggerInteraction = () => {
    setIsInteracting(true);
    if (interactTimeoutRef.current) window.clearTimeout(interactTimeoutRef.current);
    if (settings.resumeAfterInteraction) {
      interactTimeoutRef.current = window.setTimeout(() => setIsInteracting(false), 1500);
    }
  };

  
  const expectedScrollLeft = useRef<number | null>(null);

  const handleScroll = () => {
    if (expectedScrollLeft.current !== null && containerRef.current && Math.abs(containerRef.current.scrollLeft - expectedScrollLeft.current) <= 2) {
      return; // Programmatic scroll
    }
    triggerInteraction(); 
  };

  const handleMouseEnter = () => { if (settings.pauseOnHover) setIsHovered(true); };
  const handleMouseLeave = () => { if (settings.pauseOnHover && !isDragging) setIsHovered(false); };
  const handleTouchStart = () => triggerInteraction();
  
  // Mouse drag logic
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!settings.manualInteraction) return;
    setIsDragging(true);
    triggerInteraction();
    startX.current = e.pageX - (containerRef.current?.offsetLeft || 0);
    scrollLeft.current = containerRef.current?.scrollLeft || 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !settings.manualInteraction) return;
    e.preventDefault();
    const x = e.pageX - (containerRef.current?.offsetLeft || 0);
    const walk = (x - startX.current) * 2;
    if (containerRef.current) containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleMouseUp = () => {
    if (!settings.manualInteraction) return;
    setIsDragging(false);
    triggerInteraction();
  };

  const isPaused = isHovered || isInteracting || isDragging || forcePaused;

  // Auto-scroll logic with alternating direction
  const animationRef = useRef<number>(0);
  const currentDirection = useRef<'ltr' | 'rtl'>(settings.direction);

  useEffect(() => {
    currentDirection.current = settings.direction;
  }, [settings.direction]);

  useEffect(() => {
    if (!shouldAnimate || isPaused || (settings.layout !== 'marquee' && settings.layout !== 'horizontal-row' && settings.layout !== 'carousel')) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    let lastTime = performance.now();
    const speedPxPerSec = settings.speed === 'slow' ? 25 : settings.speed === 'fast' ? 100 : 50;

    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      
      const el = containerRef.current;
      if (el) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 0) {
          const move = speedPxPerSec * dt;
          if (currentDirection.current === 'ltr') {
            el.scrollLeft += move;
            expectedScrollLeft.current = el.scrollLeft;
            if (el.scrollLeft >= maxScroll - 1) currentDirection.current = 'rtl';
          } else {
            el.scrollLeft -= move;
            expectedScrollLeft.current = el.scrollLeft;
            if (el.scrollLeft <= 1) currentDirection.current = 'ltr';
          }
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [shouldAnimate, isPaused, settings.layout, settings.speed]);

  const getLogoSrc = (logo: PartnerLogoExtended) => {
    let path = logo.objectPath;
    if (logo.appearance === 'separate') {
      if (isDark && logo.darkObjectPath) path = logo.darkObjectPath;
      else if (!isDark && logo.lightObjectPath) path = logo.lightObjectPath;
    }
    return assetUrls?.[path] || getLogoUrl(logo, path);
  };

  let maxW = 120;
  if (settings.size === 'small') maxW = 80;
  else if (settings.size === 'large') maxW = 180;
  else if (settings.size === 'custom') maxW = settings.customSize;

  const gapClass = settings.spacing === 'compact' ? 'gap-4' : settings.spacing === 'wide' ? 'gap-12' : 'gap-8';
  const justifyClass = settings.alignment === 'left' ? 'justify-start' : settings.alignment === 'right' ? 'justify-end' : 'justify-center';

  const items = useMemo(() => {
    const sorted = [...logos].filter((logo) => logo.enabled !== false);
    return sorted.map((logo) => {
      const src = getLogoSrc(logo);
      const isAuto = logo.appearance === 'auto' || !logo.appearance;
      const cardClass = cn(
        'partner-logo-item shrink-0 flex items-center justify-center transition-all',
        settings.container === 'subtle-card' && 'bg-muted/40 border border-border/50 rounded-xl p-4 hover:bg-muted/60',
        settings.container === 'glow-card' && 'bg-card border border-primary/20 rounded-xl p-4 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.15)] hover:shadow-[0_0_20px_-3px_hsl(var(--primary)/0.3)] hover:border-primary/40',
        settings.container === 'none' && 'p-2',
      );
      const imgClass = cn(
        'max-h-full object-contain transition-all duration-300',
        isAuto && (isDark
          ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.7)] drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]'
          : 'drop-shadow-[0_0_2px_rgba(0,0,0,0.55)]')
      );

      const content = <img src={src} alt={logo.name} className={imgClass} style={{ maxWidth: maxW, height: 'auto', maxHeight: maxW * 0.6 }} loading="lazy" draggable={false} />;

      return (
        <div key={logo.id} className={cardClass} style={{ width: settings.layout === 'grid' ? '100%' : 'auto' }}>
          {logo.link ? (
            <a href={logo.link} target="_blank" rel="noreferrer" aria-label={logo.name} className="block w-full h-full flex items-center justify-center focus-visible:outline-primary">
              {content}
            </a>
          ) : content}
        </div>
      );
    });
  }, [logos, isDark, settings, maxW, getLogoSrc]);

  if (items.length === 0) return null;

  const gridStyle = {
    '--cols-desktop': settings.columnsDesktop,
    '--cols-tablet': settings.columnsTablet,
    '--cols-mobile': settings.columnsMobile,
    ...(previewState?.viewport ? {
      '--cols-active': previewState.viewport === 'mobile' ? settings.columnsMobile : previewState.viewport === 'tablet' ? settings.columnsTablet : settings.columnsDesktop
    } : {})
  } as React.CSSProperties;

  const isScrollable = settings.layout === 'marquee' || settings.layout === 'horizontal-row' || settings.layout === 'carousel';

  const baseContainerClass = cn(
    'partner-logos-container w-full overflow-hidden no-scrollbar',
    isScrollable && 'overflow-x-auto overscroll-x-contain touch-pan-y',
    isScrollable && settings.manualInteraction && 'cursor-grab',
    isDragging && 'cursor-grabbing',
    settings.layout === 'carousel' && 'snap-x snap-mandatory',
    className
  );

  const trackClassName = cn(
    'partner-logos-track flex',
    gapClass,
    isScrollable && justifyClass,
    !isScrollable && 'flex-wrap',
    !isScrollable && settings.layout !== 'horizontal-row' && justifyClass,
    settings.layout === 'grid' && 'grid w-full',
    settings.layout === 'vertical-list' && 'flex-col items-center',
    settings.layout === 'stacked-rows' && 'flex-row justify-center flex-wrap',
    isScrollable && 'w-max'
  );

  return (
    <div 
      className={baseContainerClass}
      style={gridStyle}
      ref={containerRef}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={(e) => { handleMouseLeave(); handleMouseUp(); }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      data-testid="partner-logos-container"
    >
      <div 
        className={trackClassName}
        style={isScrollable ? { minWidth: shouldAnimate && items.length > 1 ? 'calc(100% + 180px)' : '100%' } : undefined}
        data-layout={settings.layout}
      >
        {settings.layout === 'carousel' ? items.map((item, i) => (
          <div key={i} className="snap-center">{item}</div>
        )) : items}
      </div>
    </div>
  );
}
