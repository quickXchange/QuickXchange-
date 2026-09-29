import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NetworkBadge, resolveNetworkBadgeSource } from '../src/network-badge';

test('configured network logo wins; familiar networks have a deterministic fallback', () => {
  assert.equal(resolveNetworkBadgeSource('TRC20', '/objects/network/tron.png'), '/api/storage/objects/network/tron.png');
  assert.match(resolveNetworkBadgeSource('TRC20'), /\/trx\.png$/);
  assert.match(resolveNetworkBadgeSource('ERC20'), /\/eth\.png$/);
  assert.equal(resolveNetworkBadgeSource('NEW-NETWORK'), undefined);
});

test('badge is circular artwork with no cropping; unknown networks use a visible fallback', () => {
  const configured = renderToStaticMarkup(createElement(NetworkBadge, { network: 'NEW', src: '/objects/new.png', size: 20 }));
  assert.match(configured, /qx-network-badge qx-network-badge-network/);
  assert.match(configured, /--qx-network-badge-size:20px/);
  assert.match(configured, /src="\/api\/storage\/objects\/new.png"/);
  const unknown = renderToStaticMarkup(createElement(NetworkBadge, { network: 'NEW' }));
  assert.match(unknown, /qx-network-badge-fallback/);
  assert.equal(renderToStaticMarkup(createElement(NetworkBadge, { variant: 'flag', network: 'EUR' })), '');
});