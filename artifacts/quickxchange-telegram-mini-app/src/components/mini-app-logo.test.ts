import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MiniAppLogo } from './mini-app-logo';
import { resolveOrderVisual } from '../lib/logo-catalog';

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
  assert.match(markup, /object-contain object-center/);
  assert.doesNotMatch(markup, /object-cover/);
  assert.equal((markup.match(/<img\b/g) || []).length, 2);
  assert.match(markup, /src="\/api\/storage\/objects\/admin-bank\.svg"/);
  assert.match(markup, /src="\/api\/storage\/objects\/euro-flag\.svg"/);
  assert.match(markup, /w-2\.5 h-2\.5/);
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