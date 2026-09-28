export type PaymentLogoFit = {
  scale: number;
  x: number;
  y: number;
  artworkAspect: number;
};

const SAMPLE_SIZE = 96;
const VISIBLE_SIZE = 0.92;
const DEFAULT_FIT: PaymentLogoFit = { scale: VISIBLE_SIZE, x: 0, y: 0, artworkAspect: 1 };
const cachedFits = new Map<string, PaymentLogoFit>();

export function getCachedPaymentLogoFit(src: string) {
  return cachedFits.get(src);
}

function fitArtworkOnSolidBackground(pixels: Uint8ClampedArray, width: number, height: number): PaymentLogoFit | undefined {
  // Rounded-square logos often have an opaque brand-colored background. Alpha
  // describes the background, not the mark, so detect the common edge color
  // and fit the contrasting mark while the background fills the circle.
  const at = (x: number, y: number) => (Math.floor(y) * width + Math.floor(x)) * 4;
  const edges = [
    at(width / 2, height * .04), at(width / 2, height * .96),
    at(width * .04, height / 2), at(width * .96, height / 2),
  ];
  if (edges.some(index => pixels[index + 3] < 220)) return undefined;
  const background = Array.from({ length: 3 }, (_, channel) =>
    Math.round(edges.reduce((sum, edge) => sum + pixels[edge + channel], 0) / edges.length));
  if (edges.some(index => background.some((channel, i) => Math.abs(pixels[index + i] - channel) > 32))) {
    return undefined;
  }

  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Corners outside the circular frame are not part of the mark.
      if (((x + .5) / width - .5) ** 2 + ((y + .5) / height - .5) ** 2 > .44 ** 2) continue;
      const index = at(x, y);
      if (pixels[index + 3] < 220 ||
        !background.some((channel, i) => Math.abs(pixels[index + i] - channel) > 48)) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return undefined;
  const visibleWidth = right - left + 1;
  const visibleHeight = bottom - top + 1;
  const scale = Math.min(1.16, .92 * Math.min(width / visibleWidth, height / visibleHeight));
  const x = ((width / 2 - (left + right + 1) / 2) / width) * scale * 100;
  const y = ((height / 2 - (top + bottom + 1) / 2) / height) * scale * 100;
  return { scale, x, y, artworkAspect: visibleWidth / visibleHeight };
}

export function fitVisibleArtwork(pixels: Uint8ClampedArray, width: number, height: number): PaymentLogoFit {
  const solidBackgroundFit = fitArtworkOnSolidBackground(pixels, width, height);
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

  if (right < left || bottom < top) return DEFAULT_FIT;
  const visibleWidth = right - left + 1;
  const visibleHeight = bottom - top + 1;
  const scale = Math.min(8, VISIBLE_SIZE * Math.min(width / visibleWidth, height / visibleHeight));
  const x = ((width / 2 - (left + right + 1) / 2) / width) * scale * 100;
  const y = ((height / 2 - (top + bottom + 1) / 2) / height) * scale * 100;
  return { scale, x, y, artworkAspect: visibleWidth / visibleHeight };
}

export function measurePaymentLogoFit(src: string, image: HTMLImageElement): PaymentLogoFit {
  const cached = cachedFits.get(src);
  if (cached) return cached;

  let fit: PaymentLogoFit = { ...DEFAULT_FIT, artworkAspect: image.naturalWidth && image.naturalHeight
    ? image.naturalWidth / image.naturalHeight : 1 };
  if (image.naturalWidth && image.naturalHeight) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SAMPLE_SIZE;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        const ratio = Math.min(SAMPLE_SIZE / image.naturalWidth, SAMPLE_SIZE / image.naturalHeight);
        const width = image.naturalWidth * ratio;
        const height = image.naturalHeight * ratio;
        context.drawImage(image, (SAMPLE_SIZE - width) / 2, (SAMPLE_SIZE - height) / 2, width, height);
        fit = fitVisibleArtwork(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE, SAMPLE_SIZE);
      }
    } catch {
      // Cross-origin images and some SVGs cannot be read from a canvas. Keep the original image visible.
    }
  }
  cachedFits.set(src, fit);
  return fit;
}