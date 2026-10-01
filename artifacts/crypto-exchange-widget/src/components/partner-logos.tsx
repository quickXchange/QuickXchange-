import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { cn } from './shared-app-ui';
import { useAppTheme } from '../theme';
import { SiTrustpilot } from 'react-icons/si';

const PRESET_SPEED: Record<Exclude<PartnerLogoSettings['speed'], 'custom'>, number> = {
  'very-slow': 6,
  slow: 20,
  normal: 50,
  fast: 95,
  'very-fast': 150,
};

function pixelsPerSecond(settings: PartnerLogoSettings): number {
  const value = settings.speed === 'custom'
    ? Math.max(1, Math.min(150, settings.customSpeed ?? 55))
    : PRESET_SPEED[settings.speed];
  return value * 2;
}

export interface PartnerLogoSettings {
  layout: 'horizontal-row' | 'carousel' | 'grid' | 'vertical-list' | 'stacked-rows' | 'marquee';
  animation: 'static' | 'auto-scroll';
  direction: 'ltr' | 'rtl';
  speed: 'very-slow' | 'slow' | 'normal' | 'fast' | 'very-fast' | 'custom';
  customSpeed?: number;
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
  customSpeed: 55,
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
  brandTrustpilotGreen?: boolean;
}

export function PartnerLogos({ logos, settings, assetUrls, getLogoUrl, previewState, className, forcePaused, brandTrustpilotGreen = false }: PartnerLogosProps) {
  const isDarkApp = useAppTheme();
  const isDark = previewState?.theme ? previewState.theme === 'dark' : isDarkApp;
  
  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const motionTrackRef = useRef<HTMLDivElement>(null);
  const motionOffsetRef = useRef(0);
  const drawMotionRef = useRef<() => void>(() => {});
  const activePointerRef = useRef<{ id: number; lastX: number; startX: number } | null>(null);
  const suppressClickRef = useRef(false);
  const mouseMovedRef = useRef(false);
  
  const [viewportWidth, setViewportWidth] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewportWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [logos.length]);

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

  useEffect(() => () => {
    if (interactTimeoutRef.current) window.clearTimeout(interactTimeoutRef.current);
  }, []);

  const expectedScrollLeft = useRef<number | null>(null);

  const handleScroll = () => {
    if (expectedScrollLeft.current !== null && containerRef.current && Math.abs(containerRef.current.scrollLeft - expectedScrollLeft.current) <= 2) {
      return; // Programmatic scroll
    }
    triggerInteraction(); 
  };

  const handleMouseEnter = () => { if (settings.pauseOnHover) setIsHovered(true); };
  const handleMouseLeave = () => { if (settings.pauseOnHover && !isDragging) setIsHovered(false); };
  const handleTouchStart = () => { if (!motionEnabled) triggerInteraction(); };
  
  // Mouse drag logic
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!settings.manualInteraction || motionEnabled) return;
    setIsDragging(true);
    triggerInteraction();
    startX.current = e.pageX - (containerRef.current?.offsetLeft || 0);
    scrollLeft.current = containerRef.current?.scrollLeft || 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !settings.manualInteraction || motionEnabled) return;
    e.preventDefault();
    const x = e.pageX - (containerRef.current?.offsetLeft || 0);
    const walk = (x - startX.current) * 2;
    if (Math.abs(walk) > 8) mouseMovedRef.current = true;
    if (containerRef.current) containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleMouseUp = () => {
    if (!settings.manualInteraction || motionEnabled) return;
    if (mouseMovedRef.current) {
      mouseMovedRef.current = false;
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    setIsDragging(false);
    triggerInteraction();
  };

  const isPaused = isHovered || isInteracting || isDragging || forcePaused;

  const getLogoSrc = (logo: PartnerLogoExtended) => {
    const path = (isDark ? logo.darkObjectPath : logo.lightObjectPath) || logo.objectPath;
    return assetUrls?.[path] || getLogoUrl(logo, path);
  };

  let maxW = 120;
  if (settings.size === 'small') maxW = 80;
  else if (settings.size === 'large') maxW = 180;
  else if (settings.size === 'custom') maxW = settings.customSize;
  if (viewportWidth > 0 && viewportWidth < 640) maxW = Math.min(maxW, 96);

  // Generic fit: shrink all logos equally so the current list fits one row on
  // narrow screens; below a legibility floor, overflow scrolling takes over.
  const slotPad = 16;
  const fitGap = 12;
  const fitCount = logos.filter((l) => l.enabled !== false).length;
  if (viewportWidth > 0 && fitCount > 1 && viewportWidth < fitCount * (maxW + slotPad) + (fitCount - 1) * 32) {
    const shrunk = Math.floor((viewportWidth - (fitCount - 1) * fitGap) / fitCount - slotPad);
    if (shrunk >= 48) maxW = Math.min(maxW, shrunk);
  }
  const compactFit = maxW < (settings.size === 'small' ? 80 : settings.size === 'large' ? 180 : settings.size === 'custom' ? settings.customSize : 120);
  const gapClass = compactFit ? 'gap-3' : settings.spacing === 'compact' ? 'gap-4' : settings.spacing === 'wide' ? 'gap-12' : 'gap-8';
  const justifyClass = settings.alignment === 'left' ? 'justify-start' : settings.alignment === 'right' ? 'justify-end' : 'justify-center';
  const motionSlotWidth = maxW + slotPad;
  const motionHeight = maxW * 0.6 + slotPad;

  const items = useMemo(() => {
    const sorted = [...logos].filter((logo) => logo.enabled !== false);
    return sorted.map((logo) => {
      const src = getLogoSrc(logo);
      const hasThemeVariant = !!(isDark ? logo.darkObjectPath : logo.lightObjectPath);
      const isAuto = !hasThemeVariant && (logo.appearance === 'auto' || !logo.appearance);
      const cardClass = cn(
        'partner-logo-item shrink-0 flex items-center justify-center transition-all',
        // Equal transparent slots; saved container type adds no backdrop.
        'p-2 rounded-lg bg-transparent hover:drop-shadow-[0_0_10px_hsl(var(--primary)/0.35)] focus-within:drop-shadow-[0_0_10px_hsl(var(--primary)/0.35)]',
      );
      const imgClass = cn(
        'block shrink-0 object-contain transition-all duration-300',
        isAuto && (isDark
          ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.7)] drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]'
          : 'drop-shadow-[0_0_2px_rgba(0,0,0,0.55)]')
      );

      // Every image occupies the same centered content box, regardless of its
      // intrinsic dimensions. object-fit preserves the original proportions.
      const content = brandTrustpilotGreen && !hasThemeVariant && /trustpilot/i.test(logo.name)
        ? <span className="partner-logo-trustpilot" style={{ width: maxW, height: maxW * 0.6, maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.25em', fontSize: `${Math.min(18, Math.max(8, maxW / 8.5))}px` }} role={logo.link ? undefined : 'img'} aria-label={logo.link ? undefined : logo.name} aria-hidden={logo.link ? true : undefined}><SiTrustpilot />Trustpilot</span>
        : <img src={src} alt={logo.name} className={imgClass} style={{ width: maxW, height: maxW * 0.6, objectFit: 'contain' }} loading={shouldAnimate ? 'eager' : 'lazy'} draggable={false} />;

      return (
        <div key={logo.id} className={cardClass} style={{ width: motionSlotWidth, height: motionHeight, boxSizing: 'border-box' }}>
          {logo.link ? (
            <a href={logo.link} target="_blank" rel="noreferrer" aria-label={logo.name} className="flex w-full h-full items-center justify-center focus-visible:outline-primary">
              {content}
            </a>
          ) : content}
        </div>
      );
    });
  }, [logos, isDark, settings, maxW, motionSlotWidth, motionHeight, shouldAnimate, getLogoSrc, brandTrustpilotGreen]);

  // Landing-page partners are always a single row, including when a saved
  // legacy layout requested columns or wrapping.
  const isScrollable = true;
  const slotGap = compactFit ? 12 : settings.spacing === 'compact' ? 16 : settings.spacing === 'wide' ? 48 : 32;
  const rowWidth = items.length * motionSlotWidth + Math.max(0, items.length - 1) * slotGap;
  // Short lists that fit stay a level, evenly spaced static row; wrapping a
  // short list would stagger it or leave gaps. Motion only serves overflow.
  const fitsViewport = viewportWidth > 0 && rowWidth <= viewportWidth;
  const motionEnabled = isScrollable && shouldAnimate && items.length > 1 && !fitsViewport;

  useEffect(() => {
    if (!motionEnabled) return;
    const viewport = containerRef.current;
    const track = motionTrackRef.current;
    if (!viewport || !track) return;
    const slots = Array.from(track.children) as HTMLDivElement[];
    const gap = slotGap;
    const draw = () => {
      // A full cycle reaches beyond both viewport edges. Each item wraps only
      // while completely offscreen, so no visual clone or reset is needed.
      const stride = Math.max(motionSlotWidth + gap, (viewport.clientWidth + motionSlotWidth + gap) / slots.length);
      const cycle = stride * slots.length;
      const phase = ((motionOffsetRef.current % cycle) + cycle) % cycle;
      slots.forEach((slot, index) => {
        const x = ((index * stride - phase + motionSlotWidth) % cycle + cycle) % cycle - motionSlotWidth;
        slot.style.transform = `translate3d(${x}px, 0, 0)`;
      });
    };
    drawMotionRef.current = draw;
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(viewport);

    let frameId = 0;
    let lastTime: number | null = null;
    const frame = (time: number) => {
      if (lastTime !== null) {
        // Cap elapsed time after tab suspension so returning never jumps.
        const seconds = Math.min(time - lastTime, 50) / 1000;
        motionOffsetRef.current += (settings.direction === 'ltr' ? -1 : 1) * pixelsPerSecond(settings) * seconds;
        draw();
      }
      lastTime = time;
      frameId = requestAnimationFrame(frame);
    };
    if (!isPaused) frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      drawMotionRef.current = () => {};
    };
  }, [motionEnabled, items.length, motionSlotWidth, slotGap, settings.direction, settings.speed, settings.customSpeed, isPaused]);

  const finishPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = activePointerRef.current;
    if (!active || active.id !== e.pointerId) return;
    activePointerRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (Math.abs(e.clientX - active.startX) > 4) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    setIsDragging(false);
    triggerInteraction();
  };

  if (items.length === 0) return null;

  const gridStyle = {
    '--cols-desktop': settings.columnsDesktop,
    '--cols-tablet': settings.columnsTablet,
    '--cols-mobile': settings.columnsMobile,
    ...(previewState?.viewport ? {
      '--cols-active': previewState.viewport === 'mobile' ? settings.columnsMobile : previewState.viewport === 'tablet' ? settings.columnsTablet : settings.columnsDesktop
    } : {})
  } as React.CSSProperties;

  const baseContainerClass = cn(
    'partner-logos-container w-full overflow-hidden no-scrollbar',
    isScrollable && !motionEnabled && 'overflow-x-auto overscroll-x-contain',
    motionEnabled && 'touch-pan-y',
    isScrollable && settings.manualInteraction && 'cursor-grab',
    isDragging && 'cursor-grabbing',
    settings.layout === 'carousel' && !motionEnabled && 'snap-x snap-mandatory',
    className
  );

  const trackClassName = cn(
    'partner-logos-track flex flex-nowrap items-center',
    gapClass,
    justifyClass,
    isScrollable && !motionEnabled && 'w-max',
    motionEnabled && 'relative w-full'
  );

  return (
    <div 
      className={baseContainerClass}
      style={gridStyle}
      ref={containerRef}
      onScroll={motionEnabled ? undefined : handleScroll}
      onTouchStart={handleTouchStart}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => { handleMouseLeave(); handleMouseUp(); }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onPointerDown={(e) => {
        if (!motionEnabled || !settings.manualInteraction || !e.isPrimary) return;
        activePointerRef.current = { id: e.pointerId, startX: e.clientX, lastX: e.clientX };
        setIsDragging(true);
        triggerInteraction();
      }}
      onPointerMove={(e) => {
        const active = activePointerRef.current;
        if (!motionEnabled || !active || active.id !== e.pointerId) return;
        if (Math.abs(e.clientX - active.startX) > 4 && !e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        motionOffsetRef.current -= e.clientX - active.lastX;
        active.lastX = e.clientX;
        drawMotionRef.current();
      }}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onWheel={(e) => {
        if (!motionEnabled || !settings.manualInteraction || !e.deltaX) return;
        motionOffsetRef.current += e.deltaX;
        drawMotionRef.current();
        triggerInteraction();
      }}
      onClickCapture={(e) => {
        if (suppressClickRef.current) {
          e.preventDefault();
          e.stopPropagation();
          suppressClickRef.current = false;
        }
      }}
      data-testid="partner-logos-container"
    >
      <div 
        className={trackClassName}
        ref={motionTrackRef}
        style={motionEnabled ? { height: motionHeight } : isScrollable ? { minWidth: '100%' } : undefined}
        data-layout={settings.layout}
      >
        {motionEnabled ? items.map((item, i) => (
          <div key={`motion-${item.key ?? i}`} className="absolute top-0 left-0 flex h-full items-center justify-center will-change-transform" style={{ width: motionSlotWidth }}>
            {item}
          </div>
        )) : settings.layout === 'carousel' ? items.map((item, i) => (
          <div key={i} className="snap-center">{item}</div>
        )) : items}
      </div>
    </div>
  );
}
