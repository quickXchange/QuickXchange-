import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

test('premium-card tap does not scale forms', () => {
  assert.match(css, /\.premium-card:active\s*\{\s*transform:\s*none/);
});
test('gradient recap has explicit white text', () => {
  assert.match(css, /\.animated-gradient-bg\s*\{\s*color:\s*#fff/);
});
test('inputs can shrink inside flex rows', () => {
  assert.match(css, /input, select, textarea \{ min-width: 0/);
});
test('exchange actions reserve scroll space and stay above bottom navigation', () => {
  assert.match(css, /\.qx-page-main \{ padding-bottom: calc\(144px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.qx-sticky-action\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /\.qx-sticky-action\s*\{[^}]*bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
});
test('google font import stays first', () => {
  assert.ok(css.startsWith('@import url('));
});

test('swap details neutralize gradient and forced white', () => {
  assert.match(css, /\.qx-swap-details,\s*\.qx-swap-details\.animated-gradient-bg\s*\{[^}]*background-image:\s*none/);
  assert.match(css, /\.qx-swap-details \.text-white/);
});
