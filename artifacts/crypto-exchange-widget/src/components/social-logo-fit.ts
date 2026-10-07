export type SocialLogoFit = {
  width: number;
  height: number;
  translateX: number;
  translateY: number;
};

/** Cover the circle using the visible artwork, keeping the original aspect ratio. */
export function fitSocialLogoPixels(width: number, height: number, pixels: ArrayLike<number>): SocialLogoFit | null {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) return null;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 12) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  const size = Math.min(right - left + 1, bottom - top + 1);
  return {
    width: 100 * width / size,
    height: 100 * height / size,
    translateX: -100 * (left + right + 1) / (2 * width),
    translateY: -100 * (top + bottom + 1) / (2 * height),
  };
}

const fits = new Map<string, SocialLogoFit | null>();

export function measureSocialLogo(image: HTMLImageElement, src: string): SocialLogoFit | null {
  if (fits.has(src)) return fits.get(src) ?? null;
  let fit: SocialLogoFit | null = null;
  try {
    const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) {
      context.drawImage(image, 0, 0, width, height);
      fit = fitSocialLogoPixels(width, height, context.getImageData(0, 0, width, height).data);
    }
  } catch {
    // Unreadable external images remain centered cover images; never hide them.
  }
  if (fits.size >= 128) fits.delete(fits.keys().next().value!);
  fits.set(src, fit);
  return fit;
}
