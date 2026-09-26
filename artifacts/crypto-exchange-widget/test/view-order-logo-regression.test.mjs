import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('known crypto identities retain official fallbacks after a supplied URL fails', async () => {
  const identity = await source('../src/components/crypto-identity.tsx');
  const avatar = await source('../src/components/logo-avatar.tsx');
  const resolver = identity.match(/export function resolveCryptoLogoSources[\s\S]*?\n}\n/)?.[0];

  assert.ok(resolver, 'shared crypto source resolver should remain available');
  assert.ok(resolver.indexOf('logoUrl,') < resolver.indexOf('entry?.logoUrl'));
  assert.ok(resolver.indexOf('entry?.logoUrl') < resolver.indexOf('OFFICIAL_CRYPTO_LOGOS.get(resolvedSymbol)'));
  assert.match(avatar, /onError=\{\(\) => \{\s*setIntrinsicAspect\(null\);\s*setSourceIndex\(effectiveSourceIndex \+ 1\);/);
  assert.match(identity, /OFFICIAL_CRYPTO_LOGOS\.get\(normalizedSymbol\)\?\.logoUrl/);
  assert.match(identity, /fallback=\{normalizedSymbol\.slice\(0, 1\) \|\| '¤'\}/);
});

test('customer order detail and tracking identities use catalog branding and intrinsic contain fit', async () => {
  const orderIdentity = await source('../src/components/order-settlement-identity.tsx');

  assert.match(orderIdentity, /logoUrl=\{paymentOption\.logoUrl\}/);
  assert.match(orderIdentity, /preferTransparentBbvaArtwork=\{summaryLogoArtwork && !paymentOption\.logoUrl\}/);
  assert.equal((orderIdentity.match(/logoFit="contain"/g) || []).length, 2);
  assert.match(orderIdentity, /networkLogoUrl=\{paymentOption \?[\s\S]*?logoFit="contain"/);
});

test('Admin View Order prefers canonical Admin branding and retains snapshots as fallback', async () => {
  const admin = await source('../src/pages/admin.tsx');

  assert.match(admin, /const sideSnapshot = recordOf\(snapshot\[sending \? 'source' : 'target'\]\)/);
  assert.match(admin, /option\?\.logoUrl \|\| snapshotLogoUrl/);
  assert.match(admin, /AdminCryptoLogo symbol=\{asset\} logoUrl=\{option\?\.logoUrl \|\| snapshotLogoUrl\} size="md" fit="contain"/);
  assert.match(admin, /AdminCryptoLogo symbol=\{asset\} logoUrl=\{option\?\.logoUrl\} size="sm" fit="contain"/);
});

test('shared and drawer logo rendering stays circular, centered, contain-fit, and size-consistent', async () => {
  const shared = await source('../src/flag-icon.css');
  const adminStyles = await source('../src/admin-redesign.css');

  assert.match(shared, /\.logo-avatar\s*\{[^}]*place-items:\s*center[^}]*overflow:\s*hidden[^}]*border-radius:\s*50%/s);
  assert.match(shared, /\.logo-avatar-fit-contain\s*>\s*\.logo-avatar-img\s*\{[^}]*object-fit:\s*contain[^}]*\}/s);
  assert.match(shared, /\.logo-avatar-payment,\s*\.logo-avatar-bank\s*\{[^}]*background-color:\s*transparent !important/s);
  assert.match(shared, /html\.dark \.logo-avatar-payment,\s*html\.dark \.logo-avatar-bank\s*\{[^}]*background-color:\s*transparent !important/s);
  assert.match(shared, /\.payment-method-logo-stack > \.payment-method-logo\.logo-avatar\s*\{[^}]*overflow:\s*hidden !important/s);
  assert.match(shared, /\.payment-method-logo-stack > \.payment-method-logo\.logo-avatar > \.logo-avatar-img\s*\{[^}]*object-fit:\s*contain !important/s);
  assert.match(shared, /\.crypto-network-badge\s*>\s*\.network-logo-badge\s*\{[^}]*width:\s*14px[^}]*height:\s*14px/s);
  assert.match(adminStyles, /\.quickx-view-order \.quickx-exchange-card :is\(\.admin-crypto-logo, \.admin-payment-logo-stack\)\s*\{[^}]*width:\s*40px[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(adminStyles, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.quickx-view-order \.quickx-exchange-card[\s\S]*?width:\s*36px/s);
});