import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const swapAmountStylesStart = css.indexOf('/* Swap amount geometry:');
const swapAmountStylesEnd = css.indexOf('/* Exchange widget (scoped) */', swapAmountStylesStart);
const swapAmountStyles = css.slice(swapAmountStylesStart, swapAmountStylesEnd);

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

test('Swap amount sizing overrides stay scoped to the Swap amount container', () => {
  assert.ok(swapAmountStylesStart >= 0 && swapAmountStylesEnd > swapAmountStylesStart);
  const rules = swapAmountStyles
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .match(/([^{}]+)\s*\{[^{}]*\}/g) ?? [];

  assert.ok(rules.length > 0);
  for (const rule of rules) {
    const selector = rule.slice(0, rule.indexOf('{')).trim();
    assert.ok(
      selector.split(/,(?![^()]*\))/).every(part => part.trim().startsWith('.qx-swap-amounts ')),
      `Swap amount override escaped its scope: ${selector}`,
    );
  }
});

test('Swap amount cards and rows use identical stable responsive geometry', () => {
  const card = swapAmountStyles.match(/\.qx-swap-amounts \.qx-swap-amount-card\s*\{([^}]*)\}/)?.[1] ?? '';
  const row = swapAmountStyles.match(/\.qx-swap-amounts \.qx-swap-amount-row\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(card, /box-sizing:\s*border-box/);
  assert.match(card, /width:\s*100%/);
  assert.match(card, /height:\s*124px/);
  assert.match(card, /min-height:\s*124px/);
  assert.match(card, /padding:\s*16px/);
  assert.match(card, /gap:\s*12px/);
  assert.match(row, /display:\s*flex/);
  assert.match(row, /align-items:\s*center/);
  assert.match(row, /width:\s*100%/);
  assert.match(row, /min-width:\s*0/);
  assert.match(row, /gap:\s*12px/);

  // At the narrowest supported viewport, the fixed selector still leaves
  // 98px for the min-width:0 amount input after the widget/card insets.
  const availableInputWidths = [320, 360, 390, 430]
    .map(viewportWidth => viewportWidth - 32 - 32 - 2 - 12 - 144);
  assert.deepEqual(availableInputWidths, [98, 138, 168, 208]);
  assert.doesNotMatch(swapAmountStyles, /@media/);
});

test('Swap asset selectors share fixed dimensions and keep logos and chevrons stable', () => {
  const selector = swapAmountStyles.match(/\.qx-swap-amounts \.qx-swap-amount-card \.qx-asset-trigger\s*\{([^}]*)\}/)?.[1] ?? '';
  const logo = swapAmountStyles.match(/\.qx-swap-amounts \.qx-swap-amount-card \.qx-asset-trigger > span:first-child\s*\{([^}]*)\}/)?.[1] ?? '';
  const chevron = swapAmountStyles.match(/\.qx-swap-amounts \.qx-swap-amount-card \.qx-asset-trigger > svg:last-child\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(selector, /flex:\s*0 0 144px/);
  assert.match(selector, /width:\s*144px/);
  assert.match(selector, /min-width:\s*144px/);
  assert.match(selector, /max-width:\s*144px/);
  assert.match(selector, /height:\s*56px/);
  assert.match(selector, /min-height:\s*56px/);
  assert.match(selector, /padding:\s*8px 10px/);
  assert.match(selector, /border-radius:\s*16px/);
  assert.match(logo, /flex:\s*0 0 32px/);
  assert.match(logo, /width:\s*32px/);
  assert.match(logo, /height:\s*32px/);
  assert.match(chevron, /flex:\s*0 0 16px/);
  assert.match(chevron, /width:\s*16px/);
  assert.match(chevron, /height:\s*16px/);
});

test('Swap selectors truncate long names and amount inputs can shrink', () => {
  assert.match(swapAmountStyles, /\.qx-swap-amounts \.qx-swap-amount-card \.qx-asset-copy\s*\{[^}]*min-width:\s*0/);
  assert.match(swapAmountStyles, /\.qx-swap-amounts \.qx-swap-amount-card :is\(\.qx-asset-primary, \.qx-asset-secondary\)\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(swapAmountStyles, /\.qx-swap-amounts \.qx-swap-amount-card :is\(\.qx-asset-primary, \.qx-asset-secondary\)\s*\{[^}]*white-space:\s*nowrap/);

  const amount = swapAmountStyles.match(/\.qx-swap-amounts \.qx-swap-amount-row \.qx-exchange-amount\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(amount, /flex:\s*1 1 0%/);
  assert.match(amount, /width:\s*0/);
  assert.match(amount, /min-width:\s*0/);
  assert.match(amount, /max-width:\s*100%/);
});
