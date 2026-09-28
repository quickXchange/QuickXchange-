import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  canProcessNearWhiteMatte,
  conservativePaymentLogoFit,
  fitVisibleArtwork,
  PaymentLogo,
  removeConnectedNearWhiteMatte,
} from '../src/index.ts';

function rgbaImage(width: number, height: number, color = [20, 40, 60, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    pixels.set(color, index * 4);
  }
  return pixels;
}

function fillRect(
  pixels: Uint8ClampedArray,
  width: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color: number[],
) {
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      pixels.set(color, (y * width + x) * 4);
    }
  }
}

test('transparent padding is detected and artwork is optically recentered', () => {
  const pixels = rgbaImage(100, 100, [0, 0, 0, 0]);
  fillRect(pixels, 100, 30, 20, 69, 79, [12, 32, 180, 255]);
  const fit = fitVisibleArtwork(pixels, 100, 100);
  assert.ok(fit.scale > 1);
  assert.ok(Math.abs(fit.x) < 1);
  assert.ok(Math.abs(fit.y) < 1);
  assert.ok(Math.abs(fit.artworkAspect - 2 / 3) < 0.02);
});

test('uniform white padding is measured as background, not opaque artwork', () => {
  const pixels = rgbaImage(100, 100, [255, 255, 255, 255]);
  fillRect(pixels, 100, 30, 35, 69, 64, [18, 54, 140, 255]);
  const fit = fitVisibleArtwork(pixels, 100, 100);
  assert.ok(fit.scale > 1);
  assert.ok(Math.abs(fit.x) < 1);
  assert.ok(Math.abs(fit.y) < 1);
  assert.ok(fit.artworkAspect > 1);
});

test('solid artwork and broad wordmarks are not cropped or distorted', () => {
  const solid = fitVisibleArtwork(rgbaImage(100, 100, [28, 90, 170, 255]), 100, 100);
  assert.ok(solid.scale <= 0.9);
  assert.equal(solid.x, 0);
  assert.equal(solid.y, 0);

  const wordmark = rgbaImage(120, 60, [0, 0, 0, 0]);
  fillRect(wordmark, 120, 8, 25, 111, 34, [0, 0, 0, 255]);
  const fit = fitVisibleArtwork(wordmark, 120, 60);
  assert.ok(fit.artworkAspect > 3);
  assert.ok(fit.scale * (83 / 96) <= 0.91);
});

test('transparent circular marks fill optically while square corner artwork stays uncropped', () => {
  const circle = rgbaImage(100, 100, [0, 0, 0, 0]);
  const square = rgbaImage(100, 100, [0, 0, 0, 0]);
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const radius = Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
      if (radius <= 25) circle.set([20, 90, 180, 255], (y * 100 + x) * 4);
    }
  }
  fillRect(square, 100, 25, 25, 74, 74, [20, 90, 180, 255]);

  const circularFit = fitVisibleArtwork(circle, 100, 100);
  const squareFit = fitVisibleArtwork(square, 100, 100);
  assert.ok(circularFit.scale > 1.6);
  assert.ok(circularFit.scale > squareFit.scale * 1.3);
  assert.ok(squareFit.scale * Math.hypot(0.25, 0.25) <= 0.46);
});

test('transparent low-luminance marks are flagged while vivid marks are left alone', () => {
  const darkMark = rgbaImage(40, 40, [0, 0, 0, 0]);
  const vividMark = rgbaImage(40, 40, [0, 0, 0, 0]);
  fillRect(darkMark, 40, 10, 10, 29, 29, [15, 19, 28, 255]);
  fillRect(vividMark, 40, 10, 10, 29, 29, [150, 230, 65, 255]);

  const darkFit = fitVisibleArtwork(darkMark, 40, 40);
  const vividFit = fitVisibleArtwork(vividMark, 40, 40);
  assert.equal(darkFit.contrast, 'low');
  assert.ok((darkFit.artworkLuminance ?? 1) < 0.02);
  assert.equal(vividFit.contrast, 'normal');
  assert.ok((vividFit.artworkLuminance ?? 0) > 0.5);
});

test('near-white edge matte is removed without clearing enclosed white mark holes', () => {
  const pixels = rgbaImage(40, 40, [247, 246, 244, 255]);
  fillRect(pixels, 40, 8, 8, 31, 31, [20, 90, 180, 255]);
  fillRect(pixels, 40, 17, 17, 22, 22, [250, 250, 250, 255]);

  const result = removeConnectedNearWhiteMatte(pixels, 40, 40);
  assert.ok(result);
  assert.equal(result.pixels[3], 0);
  assert.equal(result.pixels[(20 * 40 + 20) * 4 + 3], 255);
  assert.equal(pixels[3], 255, 'the uploaded/source pixel buffer remains untouched');
  assert.ok(result.removedPixels > 40 * 40 * 0.03);
});

test('cross-origin canvas processing fails closed to conservative aspect fitting', () => {
  assert.equal(canProcessNearWhiteMatte('https://assets.example/logo.png', 'https://shop.example'), false);
  assert.equal(canProcessNearWhiteMatte('/objects/payment-logo.png', 'https://shop.example'), true);
  const fit = conservativePaymentLogoFit(1200, 100);
  assert.equal(fit.scale, 0.72);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, 0);
  assert.equal(fit.artworkAspect, 12);
  assert.equal(fit.contrast, 'unknown');
  assert.equal(conservativePaymentLogoFit(256, 256).scale, 1);
  assert.equal(conservativePaymentLogoFit(240, 160).scale, 0.82);
});

test('frame styling stays theme-neutral rather than swapping logo colors', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /currentColor/);
  assert.doesNotMatch(styles, /dark:|prefers-color-scheme|background:\s*white/i);
});

test('contrast halo is generic, low strength for unknown art, and only active in dark ancestors', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /html\.dark \.payment-logo-frame > \.payment-logo-image-low-luminance/);
  assert.match(styles, /\.dark \.payment-logo-frame > \.payment-logo-image-unknown-luminance/);
  assert.match(styles, /rgba\(255, 255, 255, 0\.38\)/);
  assert.doesNotMatch(styles, /payment-logo-image-(wise|paysera|revolut)/i);
  assert.doesNotMatch(styles, /filter:\s*invert|filter:\s*brightness|background:\s*white/i);
});

test('only low-luminance logos receive dark-mode circular backing', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /html\.dark \.payment-logo-frame-low-luminance/);
  assert.match(styles, /\.dark \.payment-logo-frame-low-luminance/);
  assert.match(styles, /background:\s*#f5f6f8/);
  assert.match(styles, /\.payment-logo-frame\s*\{[^}]*border-radius:\s*50%/s);
  assert.doesNotMatch(styles, /\.payment-logo-frame\s*\{[^}]*background:\s*#f5f6f8/s);
});

test('server markup has one square circular frame and image with ordered source', () => {
  const markup = renderToStaticMarkup(
    React.createElement(PaymentLogo, {
      sources: ['admin-upload.png', 'fallback.svg'],
      alt: 'Payment method',
      priority: true,
      size: 'sm',
      fallback: 'PM',
    }),
  );
  assert.equal((markup.match(/<img\b/g) ?? []).length, 1);
  assert.match(markup, /class="payment-logo-frame"/);
  assert.match(markup, /src="admin-upload\.png"/);
  assert.match(markup, /alt="Payment method"/);
  assert.match(markup, /width:1\.5rem;height:1\.5rem/);
  assert.match(markup, /width:100%;height:100%;aspect-ratio:1 \/ 1;object-fit:contain/);
});