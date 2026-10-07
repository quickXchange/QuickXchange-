import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const { fitSocialLogoPixels, measureSocialLogo } = await import(process.env.SOCIAL_LOGO_FIT_MODULE);
function pixels(width, height, left, top, artWidth, artHeight) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = top; y < top + artHeight; y++) {
    for (let x = left; x < left + artWidth; x++) data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}

test('square artwork fills the circle without enlargement or distortion', () => {
  assert.deepEqual(fitSocialLogoPixels(8, 8, pixels(8, 8, 0, 0, 8, 8)),
    { width: 100, height: 100, translateX: -50, translateY: -50 });
});
test('transparent padding is visually removed without modifying source pixels', () => {
  const data = pixels(12, 12, 4, 4, 4, 4);
  const original = data.slice();
  assert.deepEqual(fitSocialLogoPixels(12, 12, data),
    { width: 300, height: 300, translateX: -50, translateY: -50 });
  assert.deepEqual(data, original);
});
test('off-center artwork is centered by visible bounds, not image canvas', () => {
  assert.deepEqual(fitSocialLogoPixels(12, 12, pixels(12, 12, 1, 2, 4, 4)),
    { width: 300, height: 300, translateX: -25, translateY: -100 / 3 });
});
test('rectangular artwork covers the circle by cropping, never stretching', () => {
  const fit = fitSocialLogoPixels(20, 12, pixels(20, 12, 5, 4, 10, 4));
  assert.equal(fit.width / fit.height, 20 / 12);
  assert.equal(fit.width, 500);
  assert.equal(fit.height, 300);
  assert.equal(fit.translateX, -50);
  assert.equal(fit.translateY, -50);
});
test('empty artwork, bad data and unreadable external pixels fail safely', () => {
  assert.equal(fitSocialLogoPixels(0, 0, []), null);
  assert.equal(fitSocialLogoPixels(8, 8, []), null);
  assert.equal(fitSocialLogoPixels(8, 8, new Uint8ClampedArray(256)), null);
  assert.equal(measureSocialLogo({ naturalWidth: 200, naturalHeight: 200 }, 'external-cors-blocked'), null);
});
test('shared footer fills social uploads in either theme, without changing trust logo containment', async () => {
  const shell = await readFile(new URL('../src/components/public-shell.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/social-trust-footer.css', import.meta.url), 'utf8');
  assert.match(shell, /FooterSocialIcon item=\{item\} preview=\{preview\} isDark=\{isDark\} preferUploadedTrustpilot fillCircle/);
  assert.match(shell, /isDark \? item\.darkObjectPath \|\| item\.objectPath : item\.lightObjectPath \|\| item\.objectPath/);
  assert.match(shell, /FooterSocialImage src=\{src\}/);
  assert.match(css, /\.qx-footer-social-link\s*\{[^}]*aspect-ratio:\s*1;[^}]*border-radius:\s*50% !important;[^}]*overflow:\s*hidden/s);
  assert.match(css, /social-mark:has\(> \.qx-footer-social-fitted-image\)\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*overflow:\s*hidden;[^}]*border-radius:\s*50%/s);
  assert.match(css, /social-mark > \.qx-footer-social-fitted-image\s*\{[^}]*max-width:\s*none;[^}]*object-fit:\s*cover;[^}]*background:\s*transparent/s);
});
