import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MiniAppLogo } from './mini-app-logo';
import { resolveOrderVisual } from '../lib/logo-catalog';
import bbvaTransparentLogoUrl from '../../../../attached_assets/bbva-logo-transparent.png';
import bbvaWhiteLogoUrl from '../../../../attached_assets/bbva-logo-white-transparent.png';

test('unresolved logos render their fallback before the catalog arrives', () => {
  const markup = renderToStaticMarkup(createElement(MiniAppLogo, {
    src: undefined,
    fallback: 'EUR',
    variant: 'payment',
    size: 'medium',
  }));
  assert.match(markup, /EUR/);
  assert.match(markup, /size-10/);
  assert.doesNotMatch(markup, /<img/);
});

test('all context sizes retain equal width and height with a circular clipping frame', () => {
  for (const [size, dimension] of [['small', 6], ['normal', 8], ['medium', 10], ['large', 14]] as const) {
    const markup = renderToStaticMarkup(createElement(MiniAppLogo, { src: '/logo.svg', size }));
    assert.match(markup, new RegExp(`size-${dimension}`));
    assert.match(markup, /overflow-hidden rounded-full/);
    assert.match(markup, /object-contain object-center/);
  }
});

test('shared logo renderer keeps artwork circular, centered, contained, and distinct from its badge', () => {
  const markup = renderToStaticMarkup(createElement(MiniAppLogo, {
    src: '/api/storage/objects/admin-bank.svg',
    fallbackSrcs: ['/official-bank.svg'],
    badgeSrc: '/api/storage/objects/euro-flag.svg',
    variant: 'payment',
    badgeVariant: 'flag',
    alt: 'SEPA Instant',
    size: 'medium',
  }));

  assert.match(markup, /rounded-full/);
  assert.match(markup, /bg-transparent dark:border-white\/15 dark:bg-transparent/);
  assert.doesNotMatch(markup, /\bbg-white\b|\bdark:bg-white\b/);
  assert.match(markup, /payment-logo-frame/);
  assert.match(markup, /object-fit:contain/);
  assert.doesNotMatch(markup, /object-cover/);
  assert.match(markup, /width:100%;height:100%;aspect-ratio:1 ?\/ ?1/);
  assert.match(markup, /scale\(0\.9\)/);
  assert.equal((markup.match(/<img\b/g) || []).length, 2);
  assert.match(markup, /src="\/api\/storage\/objects\/admin-bank\.svg"/);
  assert.match(markup, /src="\/api\/storage\/objects\/euro-flag\.svg"/);
  assert.match(markup, /size-10/);
  assert.match(markup, /size-2\.5/);
});

test('order resolver logo and network badge reach the rendered images', () => {
  const visual = resolveOrderVisual([{
    id: 'btc-tron',
    assetCode: 'BTC',
    routeNetwork: 'TRC20',
    kind: 'crypto-network',
    logoUrl: '/objects/admin-btc.svg',
    networkLogoUrl: '/objects/admin-tron.svg',
  }], {
    fromAsset: 'BTC',
    fromNetwork: 'TRC20',
    sourceSettlementOptionId: 'btc-tron',
  }, 'source');
  const markup = renderToStaticMarkup(createElement(MiniAppLogo, { ...visual, alt: 'BTC' }));
  assert.match(markup, /src="\/api\/storage\/objects\/admin-btc\.svg"/);
  assert.match(markup, /src="\/api\/storage\/objects\/admin-tron\.svg"/);
});

test('saved payment method identity reaches the shared order, recent order, and detail logo fit', () => {
  const visual = resolveOrderVisual([], {
    fromAsset: 'EUR',
    fromNetwork: 'WISE',
    sourcePaymentMethod: { name: 'Wise', logoUrl: '/objects/wise-upload.png' },
  }, 'source');
  const markup = renderToStaticMarkup(createElement(MiniAppLogo, { ...visual, alt: 'EUR', size: 'medium' }));
  assert.equal(visual.variant, 'payment');
  assert.match(markup, /src="\/api\/storage\/objects\/wise-upload\.png"/);
  assert.match(markup, /payment-logo-frame/);
});

test('payment logos keep the configured upload first for supported image formats', () => {
  for (const extension of ['svg', 'png', 'webp', 'jpg']) {
    const configured = `/objects/admin-bank.${extension}`;
    const markup = renderToStaticMarkup(createElement(MiniAppLogo, {
      src: configured,
      fallbackSrcs: ['https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fbank.example&sz=256'],
      variant: 'payment',
      fallback: 'BANK',
    }));
    assert.match(markup, new RegExp(`src="\\/api\\/storage\\/objects\\/admin-bank\\.${extension}"`));
    assert.doesNotMatch(markup, /src="https:\/\/www\.google\.com/);
  }
});

test('BBVA uses its transparent light and dark artwork sources', () => {
  const originalDocument = globalThis.document;
  const renderWithTheme = (dark: boolean) => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        documentElement: { classList: { contains: (name: string) => dark && name === 'dark' } },
      } as unknown as Document,
    });
    return renderToStaticMarkup(createElement(MiniAppLogo, {
      src: bbvaTransparentLogoUrl,
      fallbackSrcs: ['/assets/catalog-bbva.svg'],
      variant: 'payment',
      fallback: 'BBVA',
    }));
  };

  try {
    const lightMarkup = renderWithTheme(false);
    const darkMarkup = renderWithTheme(true);
    assert.ok(lightMarkup.includes(bbvaTransparentLogoUrl));
    assert.ok(!lightMarkup.includes(bbvaWhiteLogoUrl));
    assert.ok(darkMarkup.includes(bbvaWhiteLogoUrl));
    assert.ok(!darkMarkup.includes(`${bbvaTransparentLogoUrl}"`));
  } finally {
    if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
    else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  }
});