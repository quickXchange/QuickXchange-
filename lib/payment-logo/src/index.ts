import { createElement, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, SyntheticEvent } from 'react';

export { NetworkBadge, resolveNetworkBadgeSource } from './network-badge';

export type PaymentLogoFit = {
  scale: number;
  x: number;
  y: number;
  artworkAspect: number;
  artworkLuminance?: number;
  contrast: 'low' | 'normal' | 'unknown';
};

const SAMPLE_SIZE = 96;
const VISIBLE_SIZE = 0.9;
const DEFAULT_FIT: PaymentLogoFit = {
  scale: VISIBLE_SIZE,
  x: 0,
  y: 0,
  artworkAspect: 1,
  contrast: 'unknown',
};

function linearChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function pixelLuminance(r: number, g: number, b: number) {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

function sampleArtworkLuminance(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: { left: number; top: number; right: number; bottom: number },
) {
  let luminanceSum = 0;
  let weightSum = 0;
  for (let y = bounds.top; y <= bounds.bottom; y++) {
    for (let x = bounds.left; x <= bounds.right; x++) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3] / 255;
      if (alpha < 0.1) continue;
      luminanceSum += pixelLuminance(pixels[index], pixels[index + 1], pixels[index + 2]) * alpha;
      weightSum += alpha;
    }
  }
  return weightSum ? luminanceSum / weightSum : 1;
}

function contrastForArtwork(luminance: number, transparentBackground: boolean) {
  return transparentBackground && luminance <= 0.22 ? 'low' as const : 'normal' as const;
}
const cachedFits = new Map<string, PaymentLogoFit>();
const processedDisplays = new Map<string, Promise<string | null>>();
const MAX_DISPLAY_CACHE_ENTRIES = 12;
const MAX_MATTE_PROCESS_PIXELS = 750_000;
const MAX_DISPLAY_DATA_URL_LENGTH = 480_000;

export function canProcessNearWhiteMatte(src: string, currentOrigin: string): boolean {
  try {
    const origin = new URL(currentOrigin).origin;
    const url = new URL(src, origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === origin;
  } catch {
    return false;
  }
}

function isNearWhite(r: number, g: number, b: number) {
  return Math.min(r, g, b) >= 226 && Math.max(r, g, b) - Math.min(r, g, b) <= 26;
}

/** Return a new buffer with only near-white pixels connected to its outside edge made transparent. */
export function removeConnectedNearWhiteMatte(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { pixels: Uint8ClampedArray; removedPixels: number } | undefined {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return undefined;
  const pixelCount = width * height;
  let opaquePixels = 0;
  for (let index = 0; index < pixelCount; index++) {
    if (pixels[index * 4 + 3] >= 240) opaquePixels++;
  }
  if (opaquePixels < pixelCount * 0.97) return undefined;

  const output = new Uint8ClampedArray(pixels);
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueueIfMatte = (pixel: number) => {
    if (visited[pixel]) return;
    visited[pixel] = 1;
    const offset = pixel * 4;
    if (output[offset + 3] < 240 ||
      !isNearWhite(output[offset], output[offset + 1], output[offset + 2])) return;
    queue[tail++] = pixel;
  };

  for (let x = 0; x < width; x++) {
    enqueueIfMatte(x);
    if (height > 1) enqueueIfMatte((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueueIfMatte(y * width);
    if (width > 1) enqueueIfMatte(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    output[pixel * 4 + 3] = 0;
    if (x > 0) enqueueIfMatte(pixel - 1);
    if (x + 1 < width) enqueueIfMatte(pixel + 1);
    if (y > 0) enqueueIfMatte(pixel - width);
    if (y + 1 < height) enqueueIfMatte(pixel + width);
  }

  const removedPixels = tail;
  const remainingOpaque = opaquePixels - removedPixels;
  if (removedPixels < pixelCount * 0.03 ||
    removedPixels > pixelCount * 0.9 ||
    remainingOpaque < pixelCount * 0.01) return undefined;
  return { pixels: output, removedPixels };
}

export function conservativePaymentLogoFit(naturalWidth: number, naturalHeight: number): PaymentLogoFit {
  if (!naturalWidth || !naturalHeight) return { ...DEFAULT_FIT };
  const aspect = naturalWidth / naturalHeight;
  const isSquareIcon = aspect >= 0.85 && aspect <= 1.18;
  const scale = isSquareIcon ? 1 : aspect > 2.2 || aspect < 0.45 ? 0.72 : 0.82;
  return { scale, x: 0, y: 0, artworkAspect: aspect, contrast: 'unknown' };
}

function cacheProcessedDisplay(src: string, display: Promise<string | null>) {
  processedDisplays.delete(src);
  processedDisplays.set(src, display);
  while (processedDisplays.size > MAX_DISPLAY_CACHE_ENTRIES) {
    const oldest = processedDisplays.keys().next().value;
    if (oldest === undefined) break;
    processedDisplays.delete(oldest);
  }
}

function makeNearWhiteMatteDisplay(src: string, image: HTMLImageElement): Promise<string | null> {
  if (typeof window === 'undefined' ||
    !canProcessNearWhiteMatte(src, window.location.origin) ||
    !image.naturalWidth ||
    !image.naturalHeight ||
    image.naturalWidth * image.naturalHeight > MAX_MATTE_PROCESS_PIXELS) {
    return Promise.resolve(null);
  }
  const cached = processedDisplays.get(src);
  if (cached) {
    processedDisplays.delete(src);
    processedDisplays.set(src, cached);
    return cached;
  }

  const display = Promise.resolve().then(() => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const matte = removeConnectedNearWhiteMatte(imageData.data, canvas.width, canvas.height);
      if (!matte) return null;
      imageData.data.set(matte.pixels);
      context.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      return dataUrl.length <= MAX_DISPLAY_DATA_URL_LENGTH ? dataUrl : null;
    } catch {
      // Same-origin URLs can redirect cross-origin or be blocked by browser canvas policy.
      return null;
    }
  });
  cacheProcessedDisplay(src, display);
  return display;
}

function fitSolidBackgroundArtwork(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PaymentLogoFit | undefined {
  const at = (x: number, y: number) => (Math.floor(y) * width + Math.floor(x)) * 4;
  const edges = [
    at(width / 2, height * 0.04),
    at(width / 2, height * 0.96),
    at(width * 0.04, height / 2),
    at(width * 0.96, height / 2),
  ];
  if (edges.some(index => pixels[index + 3] < 220)) return undefined;

  const background = [0, 1, 2].map(channel => Math.round(
    edges.reduce((sum, edge) => sum + pixels[edge + channel], 0) / edges.length,
  ));
  const edgeTolerance = 28;
  if (edges.some(index => background.some(
    (channel, i) => Math.abs(pixels[index + i] - channel) > edgeTolerance,
  ))) return undefined;

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Ignore the corners outside the visible circular frame.
      if (((x + 0.5) / width - 0.5) ** 2 + ((y + 0.5) / height - 0.5) ** 2 > 0.44 ** 2) continue;
      const index = at(x, y);
      if (pixels[index + 3] < 220 || !background.some(
        (channel, i) => Math.abs(pixels[index + i] - channel) > 44,
      )) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return undefined;
  const visibleWidth = right - left + 1;
  const visibleHeight = bottom - top + 1;
  const centerX = (left + right + 1) / 2;
  const centerY = (top + bottom + 1) / 2;
  let maxRadius = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (((x + 0.5) / width - 0.5) ** 2 + ((y + 0.5) / height - 0.5) ** 2 > 0.44 ** 2) continue;
      const index = at(x, y);
      if (pixels[index + 3] < 220 || !background.some(
        (channel, i) => Math.abs(pixels[index + i] - channel) > 44,
      )) continue;
      maxRadius = Math.max(maxRadius, Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY));
    }
  }
  const scale = Math.min(1.18, (VISIBLE_SIZE * Math.min(width, height) / 2) / maxRadius);
  const artworkLuminance = sampleArtworkLuminance(
    pixels,
    width,
    height,
    { left, top, right, bottom },
  );
  return {
    scale,
    x: ((width / 2 - (left + right + 1) / 2) / width) * scale * 100,
    y: ((height / 2 - (top + bottom + 1) / 2) / height) * scale * 100,
    artworkAspect: visibleWidth / visibleHeight,
    artworkLuminance,
    contrast: 'normal',
  };
}

/** Measure visible artwork bounds in a sampled RGBA image without modifying its pixels. */
export function fitVisibleArtwork(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PaymentLogoFit {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return { ...DEFAULT_FIT };

  const solidBackgroundFit = fitSolidBackgroundArtwork(pixels, width, height);
  if (solidBackgroundFit) return solidBackgroundFit;

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 24) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return { ...DEFAULT_FIT };
  const visibleWidth = right - left + 1;
  const visibleHeight = bottom - top + 1;
  const corners = [
    pixels[3],
    pixels[(width - 1) * 4 + 3],
    pixels[(height - 1) * width * 4 + 3],
    pixels[(width * height - 1) * 4 + 3],
  ];
  const transparentBackground = corners.filter(alpha => alpha < 24).length >= 2;
  const artworkLuminance = sampleArtworkLuminance(
    pixels,
    width,
    height,
    { left, top, right, bottom },
  );
  const centerX = (left + right + 1) / 2;
  const centerY = (top + bottom + 1) / 2;
  let maxRadius = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 24) continue;
      maxRadius = Math.max(maxRadius, Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY));
    }
  }
  const scale = Math.min(8, (VISIBLE_SIZE * Math.min(width, height) / 2) / maxRadius);
  return {
    scale,
    x: ((width / 2 - (left + right + 1) / 2) / width) * scale * 100,
    y: ((height / 2 - (top + bottom + 1) / 2) / height) * scale * 100,
    artworkAspect: visibleWidth / visibleHeight,
    artworkLuminance,
    contrast: contrastForArtwork(artworkLuminance, transparentBackground),
  };
}

function measurePaymentLogoFit(src: string, image: HTMLImageElement): PaymentLogoFit {
  const cached = cachedFits.get(src);
  if (cached) return cached;

  let fit = conservativePaymentLogoFit(image.naturalWidth, image.naturalHeight);
  if (image.naturalWidth && image.naturalHeight) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SAMPLE_SIZE;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const ratio = Math.min(SAMPLE_SIZE / image.naturalWidth, SAMPLE_SIZE / image.naturalHeight);
        const width = image.naturalWidth * ratio;
        const height = image.naturalHeight * ratio;
        context.drawImage(image, (SAMPLE_SIZE - width) / 2, (SAMPLE_SIZE - height) / 2, width, height);
        fit = fitVisibleArtwork(
          context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
          SAMPLE_SIZE,
          SAMPLE_SIZE,
        );
      }
    } catch {
      // CORS-restricted images and unsupported SVG canvas reads use the aspect-aware fit.
    }
  }
  cachedFits.set(src, fit);
  return fit;
}

export interface PaymentLogoProps {
  /** Ordered image URLs. Put the configured Admin upload first. */
  sources: Array<string | null | undefined>;
  fallback?: ReactNode;
  alt?: string;
  /** CSS size, px number, or sm/md/lg/badge/responsive. */
  size?: number | string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

export function PaymentLogo({
  sources,
  fallback,
  alt = '',
  size = '2.5rem',
  className,
  imageClassName,
  priority = false,
}: PaymentLogoProps) {
  const validSources = Array.from(new Set(sources.filter((source): source is string => Boolean(source))));
  const sourceKey = validSources.join('\0');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [measured, setMeasured] = useState<{ src: string; fit: PaymentLogoFit } | null>(null);
  const [processedDisplay, setProcessedDisplay] = useState<{ src: string; display: string } | null>(null);
  const previousSourceKey = useRef(sourceKey);
  const mounted = useRef(false);
  const currentSourceRef = useRef<string | undefined>(undefined);
  const sourcesChanged = previousSourceKey.current !== sourceKey;
  const effectiveIndex = sourcesChanged ? 0 : sourceIndex;
  const currentSource = validSources[effectiveIndex];
  currentSourceRef.current = currentSource;
  const displayedSource = currentSource && processedDisplay?.src === currentSource
    ? processedDisplay.display
    : currentSource;
  const fit = displayedSource && measured?.src === displayedSource
    ? measured.fit
    : displayedSource ? cachedFits.get(displayedSource) ?? DEFAULT_FIT : DEFAULT_FIT;
  const frameSize = typeof size === 'number' ? `${size}px`
    : size === 'xs' ? '1rem'
      : size === 'sm' ? '1.5rem'
      : size === 'md' ? '2rem'
        : size === 'lg' ? '2.5rem'
          : size === 'badge' ? '1rem'
          : size === 'responsive' ? '100%'
            : size || '2.5rem';

  useEffect(() => {
    mounted.current = true;
    previousSourceKey.current = sourceKey;
    setSourceIndex(0);
    setMeasured(null);
    setProcessedDisplay(null);
    return () => {
      mounted.current = false;
    };
  }, [sourceKey]);

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!currentSource) return;
    const image = event.currentTarget;
    if (displayedSource !== currentSource) {
      setMeasured({ src: displayedSource!, fit: measurePaymentLogoFit(displayedSource!, image) });
      return;
    }
    // The source ordering contract reserves index zero for the configured Admin upload.
    // Do not rewrite bundled/remote fallback artwork.
    if (effectiveIndex !== 0) {
      setMeasured({ src: currentSource, fit: measurePaymentLogoFit(currentSource, image) });
      return;
    }
    void makeNearWhiteMatteDisplay(currentSource, image).then(display => {
      if (!mounted.current || currentSourceRef.current !== currentSource) return;
      if (display) {
        setProcessedDisplay({ src: currentSource, display });
      } else {
        setMeasured({ src: currentSource, fit: measurePaymentLogoFit(currentSource, image) });
      }
    });
  };

  return createElement(
    'span',
    {
      className: [
        'payment-logo-frame',
        currentSource && fit.contrast === 'low' ? 'payment-logo-frame-low-luminance' : undefined,
        className,
      ].filter(Boolean).join(' '),
      style: {
        display: 'inline-flex',
        flex: '0 0 auto',
        width: frameSize,
        height: frameSize,
        aspectRatio: '1 / 1',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '50%',
        boxSizing: 'border-box',
      } as CSSProperties,
    },
    displayedSource
      ? createElement(
        'img',
        {
          src: displayedSource,
          alt,
          className: [
            'payment-logo-image',
            fit.contrast === 'low' ? 'payment-logo-image-low-luminance'
              : fit.contrast === 'unknown' ? 'payment-logo-image-unknown-luminance' : undefined,
            imageClassName,
          ].filter(Boolean).join(' '),
          loading: priority ? 'eager' : 'lazy',
          fetchPriority: priority ? 'high' : 'auto',
          decoding: 'async',
          style: {
            width: '100%',
            height: '100%',
            aspectRatio: '1 / 1',
            objectFit: 'contain',
            objectPosition: 'center',
            transform: `translate(${fit.x}%, ${fit.y}%) scale(${fit.scale})`,
          },
          onLoad: handleLoad,
          onError: () => {
            if (currentSource && displayedSource !== currentSource) {
              processedDisplays.set(currentSource, Promise.resolve(null));
              setProcessedDisplay(null);
              setMeasured(null);
              return;
            }
            setSourceIndex(effectiveIndex + 1);
          },
        },
      )
      : createElement('span', { className: 'payment-logo-fallback' }, fallback ?? '?'),
  );
}