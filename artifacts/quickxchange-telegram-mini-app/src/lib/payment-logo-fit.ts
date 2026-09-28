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

export function fitVisibleArtwork(pixels: Uint8ClampedArray, width: number, height: number): PaymentLogoFit {
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