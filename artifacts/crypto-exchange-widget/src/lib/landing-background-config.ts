import type {
  LandingBackgroundMode,
  LandingBackgroundPresetId,
  LandingBackgroundPlacement as ApiLandingBackgroundPlacement,
  LandingBackgroundPlacements,
} from '@workspace/api-client-react';

export type LandingBackgroundSelection = {
  mode: LandingBackgroundMode;
  presetId?: LandingBackgroundPresetId | null;
  customObjectPath?: string | null;
  focalX?: number;
  focalY?: number;
  desktopPlacement?: LandingBackgroundPlacement;
  mobilePlacement?: LandingBackgroundPlacement;
  placements?: LandingBackgroundPlacements;
};

export type LandingBackgroundPlacement = ApiLandingBackgroundPlacement;
export type { LandingBackgroundPlacements };

export const DEFAULT_LANDING_BACKGROUND_PLACEMENT: LandingBackgroundPlacement = {
  x: 50, y: 50, zoom: 100, opacity: 100, blur: 0,
};

export function getLandingBackgroundSourceKey(background?: LandingBackgroundSelection | null): string {
  return background?.mode === 'custom'
    ? background.customObjectPath || ''
    : background?.presetId || 'neon-orbit';
}

export function getLandingBackgroundPlacement(
  background: LandingBackgroundSelection | null | undefined,
  device: 'desktop' | 'mobile',
): LandingBackgroundPlacement {
  const sourcePlacement = background?.placements?.[getLandingBackgroundSourceKey(background)]?.[device];
  const directPlacement = device === 'desktop' ? background?.desktopPlacement : background?.mobilePlacement;
  const legacy = {
    x: background?.focalX ?? 50,
    y: background?.focalY ?? 50,
    zoom: 100,
    opacity: 100,
    blur: 0,
  };
  return {
    ...DEFAULT_LANDING_BACKGROUND_PLACEMENT,
    ...legacy,
    ...(sourcePlacement || directPlacement),
  };
}

const artifactBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export const DEFAULT_LANDING_BACKGROUND_URL =
  `${artifactBasePath}/landing-backgrounds/neon-orbit.jpg`;

export function getLandingBackgroundUrl(
  background?: LandingBackgroundSelection | null,
  localPreviewUrl?: string | null,
): string {
  if (background?.mode === 'custom' && localPreviewUrl) {
    return localPreviewUrl;
  }
  if (!background) return DEFAULT_LANDING_BACKGROUND_URL;

  if (background.mode === 'preset') {
    return `${artifactBasePath}/landing-backgrounds/${background.presetId || 'neon-orbit'}.jpg`;
  }
  if (background.customObjectPath) {
    return `${artifactBasePath}/api/storage${background.customObjectPath}`;
  }
  return DEFAULT_LANDING_BACKGROUND_URL;
}