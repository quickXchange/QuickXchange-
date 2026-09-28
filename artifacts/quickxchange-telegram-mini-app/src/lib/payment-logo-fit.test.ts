import assert from 'node:assert/strict';
import test from 'node:test';
import { fitVisibleArtwork } from './payment-logo-fit';

function imageWithArtwork(left: number, top: number, right: number, bottom: number) {
  const size = 96;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) pixels[(y * size + x) * 4 + 3] = 255;
  }
  return pixels;
}

test('transparent margins are compensated and artwork stays centered', () => {
  const fit = fitVisibleArtwork(imageWithArtwork(30, 36, 66, 60), 96, 96);
  assert.ok(fit.scale > 2 && fit.scale < 2.5);
  assert.equal(fit.artworkAspect, 1.5);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, 0);
});

test('off-center artwork is translated after scaling', () => {
  const fit = fitVisibleArtwork(imageWithArtwork(8, 16, 44, 40), 96, 96);
  assert.ok(fit.x > 0 && fit.y > 0);
  const left = .5 + fit.x / 100 + (8 / 96 - .5) * fit.scale;
  const right = .5 + fit.x / 100 + (44 / 96 - .5) * fit.scale;
  assert.ok(left >= .039 && right <= .961, 'visible artwork remains inside its safe area');
});

test('fully filled and unreadable logos keep safe centered containment', () => {
  assert.equal(fitVisibleArtwork(imageWithArtwork(0, 0, 96, 96), 96, 96).scale, 0.92);
  assert.deepEqual(fitVisibleArtwork(new Uint8ClampedArray(96 * 96 * 4), 96, 96), {
    scale: 0.92, x: 0, y: 0, artworkAspect: 1,
  });
});

test('wide artwork inside a square transparent file can use a compact icon', () => {
  const fit = fitVisibleArtwork(imageWithArtwork(4, 38, 92, 57), 96, 96);
  assert.ok(fit.artworkAspect > 2.2);
});

test('tall artwork uses the same safe-area target and is not cut off vertically', () => {
  const fit = fitVisibleArtwork(imageWithArtwork(40, 8, 56, 88), 96, 96);
  assert.equal(fit.scale, 0.92 * 96 / 80);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, 0);
  assert.ok(fit.artworkAspect < 1);
});

test('extreme transparent padding has a bounded optical scale', () => {
  const fit = fitVisibleArtwork(imageWithArtwork(43, 43, 53, 53), 96, 96);
  assert.equal(fit.scale, 8);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, 0);
});